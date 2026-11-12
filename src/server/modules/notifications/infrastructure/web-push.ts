import {
  Clock,
  Data,
  DateTime,
  Duration,
  Effect,
  Layer,
  Option,
  Redacted,
  Result,
} from "effect";
import { Base64Url } from "effect/encoding";
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
import { encrypt } from "./aes128gcm";

/** The application server's VAPID pair (RFC 8292): P-256, in base64url. */
export interface VapidKeys {
  /** Uncompressed point (65 octets), also given to phones when they subscribe. */
  readonly publicKey: string;
  /** The private scalar `d` (32 octets). */
  readonly privateKey: Redacted.Redacted;
}

/** The VAPID keys cannot sign: not a P-256 pair. The reason never contains a key. */
export class VapidKeysRefused extends Data.TaggedError("VapidKeysRefused")<{
  readonly reason: string;
}> {}

// RFC 8292 §2.1 contact URI. Apple's push service refuses a token whose `sub` is not a URL or a
// mailto: (BadJwtToken); this public page reaches the operator without a personal address.
const contact = "https://github.com/LeDevNovice/deux-places";
// RFC 8292 §2: `exp` at most 24 h after the request. 12 h leaves room for clock skew; a token is
// replaced once less than an hour is left, so at most one new token per hour per push service,
// as Apple asks.
const tokenLifetime = Duration.hours(12);
const renewalMargin = Duration.hours(1);

const decode = (value: string) =>
  Result.getOrUndefined(Base64Url.decode(value));

const ascii = (value: string) => new TextEncoder().encode(value);

const importSigningKey = (keys: VapidKeys) => {
  const publicKey = decode(keys.publicKey);
  const d = decode(Redacted.value(keys.privateKey));
  // The public key goes out as `k=` as it is: it must be the 65-octet uncompressed point. The
  // private key's length and match are checked by the JWK import below.
  if (publicKey?.length !== 65 || publicKey[0] !== 0x04 || d === undefined)
    return Effect.fail(
      new VapidKeysRefused({
        reason:
          "the VAPID public key must be a 65-octet uncompressed point and the private key base64url",
      }),
    );
  return Effect.tryPromise({
    // A JWK with x, y and d: workerd checks that the point is on P-256 and that d matches it.
    try: () =>
      crypto.subtle.importKey(
        "jwk",
        {
          kty: "EC",
          crv: "P-256",
          x: Base64Url.encode(publicKey.slice(1, 33)),
          y: Base64Url.encode(publicKey.slice(33, 65)),
          d: Base64Url.encode(d),
        },
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["sign"],
      ),
    catch: () =>
      new VapidKeysRefused({
        reason:
          "the VAPID private key is not the P-256 key of the VAPID public key",
      }),
  }).pipe(
    Effect.map((signingKey) => ({
      signingKey,
      publicKey: Base64Url.encode(publicKey),
    })),
  );
};

// A JWS ES256 compact token (RFC 7515, RFC 7518 §3.4): WebCrypto's ECDSA signature is already
// the raw R‖S that JWS expects (checked against RFC 8292 §2.4 in J1.13).
const signToken = (
  signingKey: CryptoKey,
  claims: { readonly aud: string; readonly exp: number },
) =>
  Effect.promise(async () => {
    const header = Base64Url.encode(
      JSON.stringify({ typ: "JWT", alg: "ES256" }),
    );
    const payload = Base64Url.encode(
      JSON.stringify({ ...claims, sub: contact }),
    );
    const signature = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      signingKey,
      ascii(`${header}.${payload}`),
    );
    return `${header}.${payload}.${Base64Url.encode(new Uint8Array(signature))}`;
  });

// One token per push service origin, kept while more than `renewalMargin` of validity remains.
const vapidTokens = (signingKey: CryptoKey) => {
  const tokens = new Map<
    string,
    { readonly token: string; readonly renewAt: number }
  >();
  return (audience: string) =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      const kept = tokens.get(audience);
      if (kept !== undefined && now < kept.renewAt) return kept.token;
      const expiresAt = now + Duration.toMillis(tokenLifetime);
      const token = yield* signToken(signingKey, {
        aud: audience,
        exp: Math.floor(expiresAt / 1000),
      });
      tokens.set(audience, {
        token,
        renewAt: expiresAt - Duration.toMillis(renewalMargin),
      });
      return token;
    });
};

const invalid = (reason: string) => new PushSubscriptionInvalid({ reason });

// The push resource (RFC 8030 §5) must be an https: URL; its origin is the token's audience.
const pushResource = (endpoint: string) => {
  const url = URL.canParse(endpoint) ? new URL(endpoint) : undefined;
  return url?.protocol === "https:"
    ? Effect.succeed(url)
    : Effect.fail(invalid("endpoint is not an https: URL"));
};

const subscriptionKeys = (subscription: PushSubscription) => {
  const publicKey = decode(subscription.keys.p256dh);
  const authSecret = decode(subscription.keys.auth);
  if (publicKey === undefined)
    return Effect.fail(invalid("p256dh is not base64url"));
  if (authSecret === undefined)
    return Effect.fail(invalid("auth is not base64url"));
  return Effect.succeed({ publicKey, authSecret });
};

// Retry-After (RFC 9110 §10.2.3): delay in seconds, or a date read against the Clock.
const retryAfter = (value: string | null, now: number) => {
  if (value === null) return Option.none();
  if (/^\d+$/.test(value.trim()))
    return Option.some(Duration.seconds(Number(value)));
  return DateTime.make(value).pipe(
    Option.map((at) =>
      Duration.millis(Math.max(0, DateTime.toEpochMillis(at) - now)),
    ),
  );
};

const unavailable = (response: Response) =>
  Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    return yield* new PushServiceUnavailable({
      status: Option.some(response.status),
      retryAfter: retryAfter(response.headers.get("Retry-After"), now),
    });
  });

// RFC 8030: 201 accepted (any 2xx is taken as accepted); 404/410 expired (§7.3); 413 too large
// (§7.2); 429 rate-limited (§8.4) and 5xx are transient; 401/403 refuse the VAPID token (RFC 8292).
const outcome = (response: Response, octets: number) => {
  const { status } = response;
  if (response.ok) return Effect.void;
  if (status === 404 || status === 410)
    return Effect.fail(new PushSubscriptionGone({ status }));
  if (status === 413) return Effect.fail(new PushPayloadTooLarge({ octets }));
  if (status === 429 || status >= 500) return unavailable(response);
  if (status === 401 || status === 403)
    return Effect.fail(new PushVapidRefused({ status }));
  return Effect.fail(new PushRequestRejected({ status }));
};

const post = (url: URL, headers: Record<string, string>, body: Uint8Array) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(url, { method: "POST", headers, body });
      // Only the status and Retry-After matter: release the connection.
      await response.body?.cancel();
      return response;
    },
    catch: () =>
      new PushServiceUnavailable({
        status: Option.none(),
        retryAfter: Option.none(),
      }),
  });

// A new ECDH P-256 pair for one message; only its public key leaves it, as keyid.
const ephemeralKeyPair = Effect.promise(async () => {
  const generated = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  );
  if (!("privateKey" in generated))
    throw new TypeError("ECDH generateKey did not return a key pair");
  return generated;
});

const make = (keys: VapidKeys) =>
  Effect.gen(function* () {
    const { signingKey, publicKey } = yield* importSigningKey(keys);
    const tokenFor = vapidTokens(signingKey);

    const send = (subscription: PushSubscription, message: PushMessage) =>
      Effect.gen(function* () {
        const url = yield* pushResource(subscription.endpoint);
        const receiver = yield* subscriptionKeys(subscription);
        const plaintext = ascii(message.payload);
        // A fresh ECDH pair and salt for every message (RFC 8291 §3.1, RFC 8188 §2.1).
        const sender = yield* ephemeralKeyPair;
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const body = yield* encrypt({ plaintext, receiver, sender, salt });
        const token = yield* tokenFor(url.origin);
        const headers: Record<string, string> = {
          "Content-Encoding": "aes128gcm",
          TTL: String(Math.floor(Duration.toSeconds(message.ttl))),
          Authorization: `vapid t=${token}, k=${publicKey}`,
          ...(message.urgency === undefined
            ? {}
            : { Urgency: message.urgency }),
        };
        const response = yield* post(url, headers, body);
        return yield* outcome(response, plaintext.length);
      });

    return PushSender.of({ send });
  });

/**
 * `PushSender` by Web Push from the Worker: encryption (RFC 8291) and VAPID (RFC 8292) with
 * WebCrypto, request by `fetch` (RFC 8030). Building it imports the VAPID keys once and fails
 * with `VapidKeysRefused` if they are not a P-256 pair.
 */
export const layer = (keys: VapidKeys) => Layer.effect(PushSender, make(keys));
