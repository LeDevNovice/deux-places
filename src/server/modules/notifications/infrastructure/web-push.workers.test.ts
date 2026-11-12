import { Duration, Effect, Layer, Option, Redacted, Schema } from "effect";
import { Base64Url } from "effect/encoding";
import { TestClock } from "effect/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type PushMessage,
  PushPayloadTooLarge,
  PushRequestRejected,
  PushSender,
  PushServiceUnavailable,
  type PushSubscription,
  PushSubscriptionGone,
  PushSubscriptionInvalid,
  PushVapidRefused,
} from "../application/push-sender";
import { bytes, decrypt, rfc8291 } from "../testing/web-push";
import { layer, type VapidKeys, VapidKeysRefused } from "./web-push";

// 2031-03-01T12:00:00Z: far from the real time, so a clock read outside Effect's Clock shows.
const T0 = 1_930_132_800_000;

// The application server's VAPID pair: RFC 8291 §5's sender pair (published, never a real key).
const vapid: VapidKeys = {
  publicKey: rfc8291.sender.publicKey,
  privateKey: Redacted.make(rfc8291.sender.privateKey),
};

// The phone: RFC 8291 §5's receiver, whose private key lets the test decrypt like a user agent.
const endpoint =
  "https://push.example.net/push/JzLQ3raZJfFBR0aqvOMsLrt54w4rJUsV";
const subscription: PushSubscription = {
  endpoint,
  keys: { p256dh: rfc8291.receiver.publicKey, auth: rfc8291.authSecret },
};
const receiver = {
  publicKey: rfc8291.receiver.publicKey,
  privateKey: rfc8291.receiver.privateKey,
  authSecret: rfc8291.authSecret,
};

const message: PushMessage = {
  payload: '{"title":"On continue ?"}',
  ttl: Duration.minutes(10),
};

// A fake push service at the external border: it records what reaches it and answers `reply`.
const pushService = (
  reply: () => Response | Promise<Response> = () =>
    new Response(null, { status: 201 }),
) => {
  const received: Request[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    received.push(new Request(input, init));
    return reply();
  });
  return received;
};

afterEach(() => {
  vi.restoreAllMocks();
});

// Runs `program` with the adapter, under a TestClock (which is also the Clock) set to T0.
const run = <A, E>(program: Effect.Effect<A, E, PushSender>) =>
  Effect.runPromise(
    Effect.andThen(TestClock.setTime(T0), program).pipe(
      Effect.provide(Layer.merge(layer(vapid), TestClock.layer())),
    ),
  );

const send = (
  to: PushSubscription = subscription,
  what: PushMessage = message,
) =>
  Effect.gen(function* () {
    const sender = yield* PushSender;
    return yield* sender.send(to, what);
  });

const json = (part: string | undefined): unknown =>
  JSON.parse(new TextDecoder().decode(bytes(part ?? "")));

const Claims = Schema.Struct({
  aud: Schema.String,
  exp: Schema.Int,
  sub: Schema.String,
});
const claimsOf = (part: string | undefined) =>
  Schema.decodeUnknownSync(Claims)(json(part));

// `Authorization: vapid t=<JWT>, k=<public key>` (RFC 8292 §3).
const vapidCredentials = (request: Request | undefined) => {
  const match = /^vapid t=([^,\s]+), k=([^,\s]+)$/.exec(
    request?.headers.get("Authorization") ?? "",
  );
  expect(match).not.toBeNull();
  const [, t = "", k = ""] = match ?? [];
  const [header, claims, signature] = t.split(".");
  return { t, k, header, claims, signature };
};

describe("PushSender over Web Push — the request (RFC 8030 §5, RFC 8291 §4)", () => {
  it("POSTs the encrypted message to the endpoint with Content-Encoding aes128gcm and TTL", async () => {
    const received = pushService();

    await run(send());

    expect(received).toHaveLength(1);
    const [request] = received;
    expect(request?.method).toBe("POST");
    expect(request?.url).toBe(endpoint);
    expect(request?.headers.get("Content-Encoding")).toBe("aes128gcm");
    expect(request?.headers.get("TTL")).toBe("600");
    expect(request?.headers.get("Urgency")).toBeNull();
    const body = new Uint8Array((await request?.arrayBuffer()) ?? []);
    expect(new TextDecoder().decode(await decrypt(body, receiver))).toBe(
      message.payload,
    );
  });

  it("sends the Urgency it is given (RFC 8030 §5.3)", async () => {
    const received = pushService();

    await run(send(subscription, { ...message, urgency: "high" }));

    expect(received[0]?.headers.get("Urgency")).toBe("high");
  });

  it("encrypts every message with a fresh salt and a fresh sender key (RFC 8291 §3.1, RFC 8188 §2.1)", async () => {
    const received = pushService();

    await run(Effect.andThen(send(), send()));

    const [first, second] = await Promise.all(
      received.map(async (r) => new Uint8Array(await r.arrayBuffer())),
    );
    // salt = octets 0–15, keyid (sender public key) = octets 21–85
    expect(first?.slice(0, 16)).not.toStrictEqual(second?.slice(0, 16));
    expect(first?.slice(21, 86)).not.toStrictEqual(second?.slice(21, 86));
    expect(await decrypt(second ?? new Uint8Array(), receiver)).toStrictEqual(
      new TextEncoder().encode(message.payload),
    );
  });

  it("refuses a payload over 3,993 octets once encoded, without sending it", async () => {
    const received = pushService();

    // 1,997 × "é" = 3,994 octets in UTF-8.
    const error = await run(
      Effect.flip(
        send(subscription, { ...message, payload: "é".repeat(1997) }),
      ),
    );

    expect(error).toBeInstanceOf(PushPayloadTooLarge);
    expect(received).toHaveLength(0);
  });

  it.each([
    [
      "an endpoint that is not https:",
      { ...subscription, endpoint: "http://push.example.net/push/x" },
    ],
    [
      "an endpoint that is not a URL",
      { ...subscription, endpoint: "push.example.net" },
    ],
    [
      "a p256dh that is not base64url",
      { ...subscription, keys: { ...subscription.keys, p256dh: "*" } },
    ],
    [
      "an auth that is not base64url",
      { ...subscription, keys: { ...subscription.keys, auth: "*" } },
    ],
  ])("refuses %s, without sending", async (_case, invalid) => {
    const received = pushService();

    const error = await run(Effect.flip(send(invalid)));

    expect(error).toBeInstanceOf(PushSubscriptionInvalid);
    expect(received).toHaveLength(0);
  });
});

describe("PushSender over Web Push — the VAPID token (RFC 8292 §2, §3)", () => {
  it("signs an ES256 JWT for the endpoint's origin, valid at most 24 h after the Clock's time", async () => {
    const received = pushService();

    await run(send());

    const { header, claims } = vapidCredentials(received[0]);
    expect(json(header)).toStrictEqual({ typ: "JWT", alg: "ES256" });
    const { aud, exp, sub } = claimsOf(claims);
    expect(aud).toBe("https://push.example.net");
    expect(exp * 1000).toBeGreaterThan(T0);
    expect(exp * 1000).toBeLessThanOrEqual(T0 + 24 * 3_600_000);
    // RFC 8292 §2.1: a mailto: or https: contact URI (Apple refuses any other).
    expect(sub).toMatch(/^(mailto:|https:\/\/)/);
  });

  it("carries the configured public key as k=, which verifies the token's raw r‖s signature", async () => {
    const received = pushService();

    await run(send());

    const { k, header, claims, signature } = vapidCredentials(received[0]);
    expect(k).toBe(vapid.publicKey);
    const key = await crypto.subtle.importKey(
      "raw",
      bytes(k),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    // JWS ES256 (RFC 7518 §3.4): R and S, 32 octets each, not DER.
    expect(bytes(signature ?? "")).toHaveLength(64);
    expect(
      await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        key,
        bytes(signature ?? ""),
        new TextEncoder().encode(`${header}.${claims}`),
      ),
    ).toBe(true);
  });

  it("reuses the token for the same push service within the hour (Apple: at most one new token per hour)", async () => {
    const received = pushService();

    await run(
      Effect.gen(function* () {
        yield* send();
        yield* TestClock.adjust("30 minutes");
        yield* send();
      }),
    );

    expect(vapidCredentials(received[1]).t).toBe(
      vapidCredentials(received[0]).t,
    );
  });

  it("makes a new token once the current one has less than an hour left, never past 24 h", async () => {
    const received = pushService();

    await run(
      Effect.gen(function* () {
        yield* send();
        yield* TestClock.adjust("690 minutes");
        yield* send();
      }),
    );

    const later = T0 + 11.5 * 3_600_000;
    const { t, claims } = vapidCredentials(received[1]);
    expect(t).not.toBe(vapidCredentials(received[0]).t);
    const { exp } = claimsOf(claims);
    expect(exp * 1000).toBeGreaterThan(later + 3_600_000);
    expect(exp * 1000).toBeLessThanOrEqual(later + 24 * 3_600_000);
  });

  it("makes one token per push service origin", async () => {
    const received = pushService();

    await run(
      Effect.andThen(
        send(),
        send({
          ...subscription,
          endpoint: "https://updates.push.example.org/wpush/v2/abc",
        }),
      ),
    );

    expect(claimsOf(vapidCredentials(received[1]).claims).aud).toBe(
      "https://updates.push.example.org",
    );
  });
});

describe("PushSender over Web Push — the push service's answer (RFC 8030 §5, §7, §8.4)", () => {
  it.each([200, 201, 202])("succeeds on %i", async (status) => {
    pushService(() => new Response(null, { status }));

    await expect(run(send())).resolves.toBeUndefined();
  });

  it.each([
    [404, PushSubscriptionGone, { status: 404 }],
    [410, PushSubscriptionGone, { status: 410 }],
    [413, PushPayloadTooLarge, { octets: message.payload.length }],
    [401, PushVapidRefused, { status: 401 }],
    [403, PushVapidRefused, { status: 403 }],
    [400, PushRequestRejected, { status: 400 }],
    [429, PushServiceUnavailable, { status: Option.some(429) }],
    [500, PushServiceUnavailable, { status: Option.some(500) }],
    [503, PushServiceUnavailable, { status: Option.some(503) }],
  ])("maps %i to %o", async (status, expected, fields) => {
    pushService(() => new Response(null, { status }));

    const error = await run(Effect.flip(send()));

    expect(error).toBeInstanceOf(expected);
    expect(error).toMatchObject(fields);
  });

  it("passes on Retry-After in seconds with a 429", async () => {
    pushService(
      () =>
        new Response(null, { status: 429, headers: { "Retry-After": "120" } }),
    );

    const error = await run(Effect.flip(send()));

    expect(error).toBeInstanceOf(PushServiceUnavailable);
    expect(error).toMatchObject({
      retryAfter: Option.some(Duration.seconds(120)),
    });
  });

  it("passes on a Retry-After date as the time left on the Clock", async () => {
    pushService(
      () =>
        new Response(null, {
          status: 503,
          headers: { "Retry-After": "Sat, 01 Mar 2031 12:01:30 GMT" },
        }),
    );

    const error = await run(Effect.flip(send()));

    expect(error).toBeInstanceOf(PushServiceUnavailable);
    expect(error).toMatchObject({
      retryAfter: Option.some(Duration.seconds(90)),
    });
  });

  it("is unavailable, with no status, when the push service cannot be reached", async () => {
    pushService(() =>
      Promise.reject(new TypeError("Network connection lost.")),
    );

    const error = await run(Effect.flip(send()));

    expect(error).toBeInstanceOf(PushServiceUnavailable);
    expect(error).toMatchObject({
      status: Option.none(),
      retryAfter: Option.none(),
    });
  });
});

const refusal = (keys: VapidKeys) =>
  Effect.runPromise(Effect.scoped(Effect.flip(Layer.build(layer(keys)))));

describe("PushSender over Web Push — the VAPID keys, checked when the layer is built", () => {
  it("refuses a private key that does not pair with the public key, without showing it", async () => {
    const error = await refusal({
      publicKey: vapid.publicKey,
      privateKey: Redacted.make(rfc8291.receiver.privateKey),
    });

    expect(error).toBeInstanceOf(VapidKeysRefused);
    expect(String(error)).not.toContain(rfc8291.receiver.privateKey);
  });

  it("refuses a private key that is not 32 octets", async () => {
    const error = await refusal({
      ...vapid,
      privateKey: Redacted.make(Base64Url.encode(new Uint8Array(31).fill(7))),
    });

    expect(error).toBeInstanceOf(VapidKeysRefused);
  });

  it.each([
    [
      "starts with 0x05",
      (point: Uint8Array) => Uint8Array.of(0x05, ...point.slice(1)),
    ],
    ["has a 66th octet", (point: Uint8Array) => Uint8Array.of(...point, 0x00)],
  ])(
    "refuses a public key that %s, even with valid coordinates (it is sent as k=)",
    async (_case, alter) => {
      const error = await refusal({
        ...vapid,
        publicKey: Base64Url.encode(alter(bytes(vapid.publicKey))),
      });

      expect(error).toBeInstanceOf(VapidKeysRefused);
    },
  );

  it("refuses a public key that is not a point of P-256", async () => {
    const offCurve = bytes(vapid.publicKey);
    offCurve[64] = (offCurve[64] ?? 0) ^ 0x01;

    const error = await refusal({
      ...vapid,
      publicKey: Base64Url.encode(offCurve),
    });

    expect(error).toBeInstanceOf(VapidKeysRefused);
  });
});
