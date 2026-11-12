/// <reference types="@cloudflare/vitest-plugin/types" />
import {
  evictDurableObject,
  runDurableObjectAlarm,
  runInDurableObject,
} from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { DateTime, Effect, Exit, Layer, Result } from "effect";
import { Base64Url } from "effect/encoding";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decrypt, rfc8291 } from "../modules/notifications/testing/web-push";
import * as notificationsModule from "../modules/notifications";
import * as config from "./config";
import * as deadlines from "./deadlines";
import { jsonLogs } from "./logging";
import { notificationsExecutors } from "./notifications";

// Plan J1.14; technique-v2 §7.1 (`notifications_push_subscriptions`), §7.2 (versioned migrations,
// never edited once applied).

// Local workerd has no jurisdictions: the tests run with DURABLE_OBJECT_JURISDICTION=none.
const household = (name: string) =>
  env.Household.get(env.Household.idFromName(name));

// Reads the body: an unread response keeps the request in flight, and an eviction waits for it.
const health = async (stub: DurableObjectStub) => {
  const response = await stub.fetch("https://deux-places.test/api/v1/health");
  await response.text();
  return response.status;
};

const sql = <T extends Record<string, SqlStorageValue>>(
  stub: DurableObjectStub,
  query: string,
) =>
  runInDurableObject(stub, (_instance, state) =>
    state.storage.sql.exec<T>(query).toArray(),
  );

const columnsOf = (stub: DurableObjectStub, table: string) =>
  sql<{ name: string; type: string; notnull: number; pk: number }>(
    stub,
    `SELECT name, type, "notnull", pk FROM pragma_table_info('${table}') ORDER BY cid`,
  );

const recorded = (stub: DurableObjectStub) =>
  sql(
    stub,
    "SELECT migration_id, name FROM effect_sql_migrations ORDER BY migration_id",
  );

describe("Household in the Workers runtime — migration 0003 creates notifications_push_subscriptions (technique-v2 §7.1)", () => {
  it("creates the table keyed by endpoint, with the p256dh and auth keys and nothing else", async () => {
    const stub = household("push-migration-table");
    expect(await health(stub)).toBe(200);

    expect(
      await columnsOf(stub, "notifications_push_subscriptions"),
    ).toStrictEqual([
      { name: "endpoint", type: "TEXT", notnull: 1, pk: 1 },
      { name: "p256dh", type: "TEXT", notnull: 1, pk: 0 },
      { name: "auth", type: "TEXT", notnull: 1, pk: 0 },
    ]);
  });

  it("applies 0003 to a household that had applied 0001 and 0002, without running them again", async () => {
    const stub = household("push-migration-after-0002");
    expect(await health(stub)).toBe(200);
    // The household as J1.13 left it: 0001 and 0002 applied, a deadline already stored.
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec("DROP TABLE notifications_push_subscriptions");
      state.storage.sql.exec(
        "DELETE FROM effect_sql_migrations WHERE migration_id = 3",
      );
      state.storage.sql.exec(
        "INSERT INTO deadlines (kind, subject, due_at) VALUES ('kept', 'a', 1)",
      );
    });

    await evictDurableObject(stub);
    expect(await health(stub)).toBe(200);

    expect(await recorded(stub)).toStrictEqual([
      { migration_id: 1, name: "baseline" },
      { migration_id: 2, name: "deadlines" },
      { migration_id: 3, name: "notifications_push_subscriptions" },
    ]);
    // 0002 did not run again: its table still holds the row stored before.
    expect(
      await sql(stub, "SELECT kind, subject, due_at FROM deadlines"),
    ).toStrictEqual([{ kind: "kept", subject: "a", due_at: 1 }]);
    expect(
      await columnsOf(stub, "notifications_push_subscriptions"),
    ).toHaveLength(3);
  });

  it("applies nothing again after an eviction", async () => {
    const stub = household("push-migration-eviction");
    expect(await health(stub)).toBe(200);
    await runInDurableObject(stub, (_instance, state) =>
      state.storage.sql.exec(
        "INSERT INTO notifications_push_subscriptions (endpoint, p256dh, auth) VALUES ('https://push.example.test/kept', 'k', 'a')",
      ),
    );

    await evictDurableObject(stub);
    expect(await health(stub)).toBe(200);

    expect(await recorded(stub)).toHaveLength(3);
    expect(
      await sql(stub, "SELECT endpoint FROM notifications_push_subscriptions"),
    ).toStrictEqual([{ endpoint: "https://push.example.test/kept" }]);
  });
});

// The phone's side of a subscription (W3C Push API `PushSubscription.toJSON()`): a P-256 ECDH pair
// drawn by WebCrypto, as the browser does, and a 16-octet authentication secret (RFC 8291 §3.2).
const aPhone = async (
  endpoint = `https://push.example.test/send/${crypto.randomUUID()}`,
) => {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  if (!("privateKey" in pair)) throw new TypeError("not a key pair");
  const raw = await crypto.subtle.exportKey("raw", pair.publicKey);
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  if (!(raw instanceof ArrayBuffer) || jwk instanceof ArrayBuffer)
    throw new TypeError("unexpected key format");
  const d = jwk.d ?? "";
  const p256dh = Base64Url.encode(new Uint8Array(raw));
  const auth = Base64Url.encode(crypto.getRandomValues(new Uint8Array(16)));
  return {
    subscription: { endpoint, keys: { p256dh, auth } },
    receiver: { publicKey: p256dh, privateKey: d, authSecret: auth },
  };
};

// What the phone sends: same origin as the page (technique-v2 §13.3), JSON body.
const site = "https://deux-places.test";
const subscriptions = `${site}/api/v1/push/subscriptions`;
const write = (
  url: string,
  body?: unknown,
  headers: Record<string, string> = { Origin: site },
) =>
  exports.default.fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    ...(body === undefined
      ? {}
      : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });

// The Worker sends every /api/v1/* request to the fixed development household (J1.6, until J3.6).
const developmentHousehold = () => household("development");

const stored = () =>
  sql(
    developmentHousehold(),
    "SELECT endpoint, p256dh, auth FROM notifications_push_subscriptions ORDER BY endpoint",
  );

const storedEndpoint = async (endpoint: string) =>
  (await stored()).filter((row) => row["endpoint"] === endpoint);

describe("POST /api/v1/push/subscriptions — the household keeps the phone's push subscription (plan J1.14)", () => {
  it("stores a valid subscription: its endpoint, p256dh and auth, and answers 204", async () => {
    const { subscription } = await aPhone();

    const response = await write(subscriptions, subscription);

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(await storedEndpoint(subscription.endpoint)).toStrictEqual([
      {
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    ]);
  });

  // A browser may renew its keys for the same push resource: one row per endpoint, the latest keys.
  it("updates the keys of an endpoint it already knows, without a second row", async () => {
    const first = await aPhone();
    const renewed = await aPhone(first.subscription.endpoint);

    await (await write(subscriptions, first.subscription)).text();
    const response = await write(subscriptions, renewed.subscription);

    expect(response.status).toBe(204);
    expect(await storedEndpoint(first.subscription.endpoint)).toStrictEqual([
      {
        endpoint: first.subscription.endpoint,
        p256dh: renewed.subscription.keys.p256dh,
        auth: renewed.subscription.keys.auth,
      },
    ]);
  });

  // RFC 8030 §5: the push resource is an https: URL. RFC 8291 §3.1, §3.2: p256dh is an uncompressed
  // P-256 point, auth 16 octets, both in base64url. technique-v2 §6.2: a refused input is a 400
  // problem of type /problems/validation.
  it.each([
    [
      "an http: endpoint",
      (s: Sub) => ({ ...s, endpoint: s.endpoint.replace("https:", "http:") }),
    ],
    [
      "an endpoint that is not a URL",
      (s: Sub) => ({ ...s, endpoint: "push.example.test/send/1" }),
    ],
    [
      "a p256dh off the curve",
      (s: Sub) => withKeys(s, { p256dh: offCurve(s.keys.p256dh) }),
    ],
    [
      "a compressed p256dh",
      (s: Sub) => withKeys(s, { p256dh: compressed(s.keys.p256dh) }),
    ],
    [
      "a p256dh of 64 octets",
      (s: Sub) => withKeys(s, { p256dh: resized(s.keys.p256dh, 64) }),
    ],
    [
      "a p256dh that is not base64url",
      (s: Sub) => withKeys(s, { p256dh: "BP4z+9KsN6/nGRTb" }),
    ],
    [
      "an auth of 15 octets",
      (s: Sub) => withKeys(s, { auth: resized(s.keys.auth, 15) }),
    ],
    [
      "an auth of 17 octets",
      (s: Sub) => withKeys(s, { auth: Base64Url.encode(new Uint8Array(17)) }),
    ],
    ["no keys", (s: Sub) => ({ endpoint: s.endpoint })],
    ["no endpoint", (s: Sub) => ({ keys: s.keys })],
  ])(
    "refuses %s with a validation problem and stores nothing",
    async (_, change) => {
      const { subscription } = await aPhone();
      const refused = change(subscription);

      const response = await write(subscriptions, refused);

      expect(response.status).toBe(400);
      expect(response.headers.get("Content-Type")).toMatch(
        /^application\/problem\+json\b/,
      );
      expect(await response.json()).toMatchObject({
        type: "/problems/validation",
        status: 400,
      });
      expect(await storedEndpoint(subscription.endpoint)).toStrictEqual([]);
    },
  );

  it("refuses a body that is not JSON with a validation problem", async () => {
    const response = await write(subscriptions, "{ not json");

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      type: "/problems/validation",
      status: 400,
    });
  });
});

type Sub = Awaited<ReturnType<typeof aPhone>>["subscription"];

const withKeys = (s: Sub, keys: Partial<Sub["keys"]>) => ({
  ...s,
  keys: { ...s.keys, ...keys },
});
const octetsOf = (value: string) => Result.getOrThrow(Base64Url.decode(value));
const offCurve = (p256dh: string) => {
  const point = Uint8Array.from(octetsOf(p256dh));
  point[64] = (point[64] ?? 0) ^ 0x01;
  return Base64Url.encode(point);
};
const compressed = (p256dh: string) => {
  const point = octetsOf(p256dh);
  return Base64Url.encode(
    Uint8Array.of(0x02 + ((point[64] ?? 0) & 1), ...point.slice(1, 33)),
  );
};
const resized = (value: string, octets: number) =>
  Base64Url.encode(octetsOf(value).slice(0, octets));

// technique-v2 §13.3: `Origin` is checked on every write. A browser always sends it with a POST
// (Fetch standard, "append a request `Origin` header").
describe("Writes to the household — only from the page's own origin (technique-v2 §13.3)", () => {
  it.each([
    ["without Origin", {}],
    ["from another origin", { Origin: "https://elsewhere.test" }],
    ["from the same host over http:", { Origin: "http://deux-places.test" }],
  ])(
    "refuses a subscription sent %s with 403 and stores nothing",
    async (_, headers) => {
      const { subscription } = await aPhone();

      const response = await write(subscriptions, subscription, headers);

      expect(response.status).toBe(403);
      expect(response.headers.get("Content-Type")).toBe(
        "application/problem+json",
      );
      expect(await response.json()).toStrictEqual({
        type: "about:blank",
        title: "Forbidden",
        status: 403,
      });
      expect(await storedEndpoint(subscription.endpoint)).toStrictEqual([]);
    },
  );

  it("still serves reads without Origin", async () => {
    const response = await exports.default.fetch(
      `${site}/api/v1/push/public-key`,
    );

    expect(response.status).toBe(200);
    await response.text();
  });
});

// The PWA subscribes with the application server's public key (W3C Push API
// `applicationServerKey`, RFC 8292 §3.2): the configured VAPID_PUBLIC_KEY, never the private key.
// vitest.config.ts configures the sender pair of RFC 8291 §5 as the VAPID pair.
describe("GET /api/v1/push/public-key — the VAPID public key of the configuration (plan J1.14)", () => {
  it("answers exactly VAPID_PUBLIC_KEY", async () => {
    const response = await exports.default.fetch(
      `${site}/api/v1/push/public-key`,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({
      publicKey: rfc8291.sender.publicKey,
    });
  });

  it("never sends the private key", async () => {
    const response = await exports.default.fetch(
      `${site}/api/v1/push/public-key`,
    );

    expect(await response.text()).not.toContain(rfc8291.sender.privateKey);
  });
});

// The household's time, as its Clock reads it (Date.now(), shared with the object's isolate).
// Later than the real clock, so that workerd never fires these alarms by itself: only
// runDurableObjectAlarm does, and no message can leave for a real push service.
const T0 = DateTime.toEpochMillis(DateTime.makeUnsafe("2031-03-01T20:00:00Z"));
const testNotifications = `${site}/api/v1/push/test-notification`;
const testKind = "notifications.test-notification";

const deadlinesOf = (stub: DurableObjectStub) =>
  sql(stub, "SELECT kind, subject, due_at FROM deadlines ORDER BY due_at");
const alarmOf = (stub: DurableObjectStub) =>
  runInDurableObject(stub, (_instance, state) => state.storage.getAlarm());

const askTestNotification = async (headers?: Record<string, string>) => {
  const response = await write(testNotifications, undefined, headers);
  await response.text();
  return response.status;
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("POST /api/v1/push/test-notification — « Tester une notification dans 1 min » (plan J1.14)", () => {
  beforeEach(async () => {
    vi.setSystemTime(T0);
    await runInDurableObject(developmentHousehold(), (_instance, state) => {
      state.storage.sql.exec("DELETE FROM deadlines");
    });
  });

  it("schedules one deadline of the notifications module one minute after the household's time, and arms the alarm on it", async () => {
    expect(await askTestNotification()).toBe(204);

    expect(await deadlinesOf(developmentHousehold())).toStrictEqual([
      { kind: testKind, subject: "household", due_at: T0 + 60_000 },
    ]);
    expect(await alarmOf(developmentHousehold())).toBe(T0 + 60_000);
  });

  it("moves the pending test notification when asked again, instead of adding one", async () => {
    await askTestNotification();
    vi.setSystemTime(T0 + 30_000);

    expect(await askTestNotification()).toBe(204);

    expect(await deadlinesOf(developmentHousehold())).toStrictEqual([
      { kind: testKind, subject: "household", due_at: T0 + 90_000 },
    ]);
    expect(await alarmOf(developmentHousehold())).toBe(T0 + 90_000);
  });

  it("refuses a request from another origin with 403 and schedules nothing", async () => {
    expect(
      await askTestNotification({ Origin: "https://elsewhere.test" }),
    ).toBe(403);

    expect(await deadlinesOf(developmentHousehold())).toStrictEqual([]);
  });
});

// A fake push service at the external border (J1.13): `answer` gives the reply for each request.
// The body is read where it was sent: workerd forbids reading it from another object's context.
const pushService = (
  answer: (request: Request) => Response | Promise<Response> = () =>
    new Response(null, { status: 201 }),
) => {
  const received: { url: string; body: Uint8Array }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    const body = new Uint8Array(await request.clone().arrayBuffer());
    received.push({ url: request.url, body });
    return answer(request);
  });
  return received;
};

const register = async (phone: Awaited<ReturnType<typeof aPhone>>) => {
  const response = await write(subscriptions, phone.subscription);
  await response.text();
  expect(response.status).toBe(204);
};

// Schedules the test notification at T0, then runs the household's alarm one minute later.
const scheduleThenRunAlarm = async () => {
  expect(await askTestNotification()).toBe(204);
  vi.setSystemTime(T0 + 61_000);
  expect(await runDurableObjectAlarm(developmentHousehold())).toBe(true);
};

describe("The test notification at its deadline — one message to every phone of the household (plan J1.14)", () => {
  beforeEach(async () => {
    vi.setSystemTime(T0);
    await runInDurableObject(developmentHousehold(), (_instance, state) => {
      state.storage.sql.exec("DELETE FROM deadlines");
      state.storage.sql.exec("DELETE FROM notifications_push_subscriptions");
    });
  });

  it("sends each subscription one encrypted message, which its phone reads as the test notification", async () => {
    const phones = await Promise.all([aPhone(), aPhone()]);
    await Promise.all(phones.map(register));
    const received = pushService();

    await scheduleThenRunAlarm();

    expect(received.map((request) => request.url).toSorted()).toStrictEqual(
      phones.map((phone) => phone.subscription.endpoint).toSorted(),
    );
    const read = await Promise.all(
      phones.map(async (phone) => {
        const body =
          received.find((sent) => sent.url === phone.subscription.endpoint)
            ?.body ?? new Uint8Array();
        return new TextDecoder().decode(await decrypt(body, phone.receiver));
      }),
    );
    expect(read).toStrictEqual(['{"type":"test"}', '{"type":"test"}']);
    expect(await deadlinesOf(developmentHousehold())).toStrictEqual([]);
  });

  // RFC 8030 §7.3: the push service no longer knows a subscription it answers 404 or 410 for.
  it("forgets the subscriptions answered 404 or 410, and keeps the one delivered", async () => {
    const [gone410, gone404, delivered] = await Promise.all([
      aPhone(),
      aPhone(),
      aPhone(),
    ]);
    await Promise.all([gone410, gone404, delivered].map(register));
    const statusOf = new Map([
      [gone410.subscription.endpoint, 410],
      [gone404.subscription.endpoint, 404],
    ]);
    pushService(
      (request) =>
        new Response(null, { status: statusOf.get(request.url) ?? 201 }),
    );

    await scheduleThenRunAlarm();

    expect((await stored()).map((row) => row["endpoint"])).toStrictEqual([
      delivered.subscription.endpoint,
    ]);
  });

  // RFC 8030 §8.4: 429 and 5xx are transient; so is a push service that cannot be reached.
  it.each([
    [
      "503 with Retry-After",
      () =>
        new Response(null, { status: 503, headers: { "Retry-After": "120" } }),
    ],
    ["429", () => new Response(null, { status: 429 })],
    [
      "no answer",
      () => Promise.reject(new TypeError("network connection lost")),
    ],
  ])(
    "keeps every subscription after a transient failure (%s)",
    async (_, answer) => {
      const phones = await Promise.all([aPhone(), aPhone()]);
      await Promise.all(phones.map(register));
      const received = pushService(answer);

      await scheduleThenRunAlarm();

      expect(received).toHaveLength(2);
      expect((await stored()).map((row) => row["endpoint"])).toStrictEqual(
        phones.map((phone) => phone.subscription.endpoint).toSorted(),
      );
    },
  );

  // Decision of J1.14: the send is network I/O. It runs once its deadline's transaction has
  // committed, outside it: the household keeps serving its phones while a push service answers
  // (a transaction keeps the input gate closed, probe of J1.14), and no write of the run can be
  // rolled back after the message has left.
  it("serves another request while a push is in flight, after the deadline's removal has committed", async () => {
    const phone = await aPhone();
    await register(phone);
    const { promise: inFlight, resolve: answer } =
      Promise.withResolvers<Response>();
    const received = pushService(() => inFlight);
    expect(await askTestNotification()).toBe(204);
    vi.setSystemTime(T0 + 61_000);

    const alarm = runDurableObjectAlarm(developmentHousehold());
    await vi.waitFor(() => expect(received).toHaveLength(1));
    const meanwhile = await Promise.race([
      Promise.all([
        health(developmentHousehold()),
        deadlinesOf(developmentHousehold()),
      ]),
      new Promise<"blocked">((resolve) =>
        setTimeout(() => resolve("blocked"), 2000),
      ),
    ]);
    answer(new Response(null, { status: 201 }));
    await alarm;

    expect(meanwhile).toStrictEqual([200, []]);
  });
});

// technique-v2 §10.1, §10.2: the object reads its configuration once, when it starts.
describe("Household in the Workers runtime — its configuration is read once per object", () => {
  it("reads it once for successive requests, and once more after an eviction", async () => {
    const read = vi.spyOn(config, "loadAppConfig");
    const stub = household("configuration-once");

    expect(await health(stub)).toBe(200);
    const key = await stub.fetch(`${site}/api/v1/push/public-key`);
    await key.text();

    expect(read).toHaveBeenCalledOnce();

    await evictDurableObject(stub);
    expect(await health(stub)).toBe(200);

    expect(read).toHaveBeenCalledTimes(2);
  });
});

// technique-v2 §10.2: the push sender is built once per object; it keeps its VAPID token for the
// next messages (J1.13: at most one new token per hour per push service, as Apple asks).
describe("Household in the Workers runtime — its push sender is built once per object", () => {
  beforeEach(async () => {
    vi.setSystemTime(T0);
    await runInDurableObject(developmentHousehold(), (_instance, state) => {
      state.storage.sql.exec("DELETE FROM deadlines");
      state.storage.sql.exec("DELETE FROM notifications_push_subscriptions");
    });
    await evictDurableObject(developmentHousehold());
  });

  it("builds it at the first send and reuses it at the next alarm", async () => {
    const built = vi.spyOn(notificationsModule, "webPushLayer");
    await register(await aPhone());
    pushService();

    await scheduleThenRunAlarm();
    vi.setSystemTime(T0);
    await scheduleThenRunAlarm();

    expect(built).toHaveBeenCalledOnce();
  });
});

describe("The test notification's executor — a push sender that cannot be built", () => {
  // Decision of J1.14: a VAPID pair WebCrypto refuses fails the sends only. The follow-up logs it
  // and ends: the alarm goes on with the household's other deadlines.
  it("logs the refused VAPID keys and ends without failing", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const refused = Effect.fail(
      new notificationsModule.VapidKeysRefused({ reason: "not a P-256 pair" }),
    );
    const [execute] = Object.values(notificationsExecutors(refused));
    const run = execute?.("household") ?? Effect.die("no executor");
    const noSubscriptions = Layer.succeed(
      notificationsModule.PushSubscriptions,
    )({
      save: () => Effect.void,
      list: Effect.succeed([]),
      remove: () => Effect.void,
    });

    const exit = await runInDurableObject(
      household("refused-vapid-keys"),
      (_instance, state) =>
        Effect.runPromiseExit(
          run.pipe(
            Effect.flatMap((followUp) =>
              Effect.isEffect(followUp) ? followUp : Effect.die("no follow-up"),
            ),
            Effect.provide(
              Layer.mergeAll(
                noSubscriptions,
                jsonLogs,
                deadlines.layer(state.storage),
              ),
            ),
          ),
        ),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(log.mock.calls.flat().join("\n")).toContain(
      "push sender unavailable",
    );
  });
});

// technique-v2 §10.2: the API handler and the alarm share the object's services, built once
// (one SQL client and one Deadlines per object), through the runtime's memo map.
describe("Household in the Workers runtime — its services are built once for requests and alarms", () => {
  it("builds the household's deadlines and SQL client once, for a request then an alarm", async () => {
    const real = deadlines.layer;
    let builds = 0;
    vi.spyOn(deadlines, "layer").mockImplementation((storage) =>
      Layer.merge(
        real(storage),
        Layer.effectDiscard(Effect.sync(() => void (builds += 1))),
      ),
    );
    vi.setSystemTime(T0);
    const stub = household("services-built-once");

    expect(await health(stub)).toBe(200);
    await runInDurableObject(stub, (_instance, state) =>
      state.storage.setAlarm(T0 - 1000),
    );
    expect(await runDurableObjectAlarm(stub)).toBe(true);

    expect(builds).toBe(1);
  });
});

// Decision of J1.14: the push sender has its own runtime. A VAPID pair WebCrypto refuses only
// fails the sends: the household still answers, schedules, and runs its alarm to the end.
describe("Household in the Workers runtime — a push sender that cannot be built", () => {
  it("still serves its API and ends its alarm, logging the refused keys", async () => {
    vi.spyOn(notificationsModule, "webPushLayer").mockReturnValue(
      Layer.effect(
        notificationsModule.PushSender,
        Effect.fail(
          new notificationsModule.VapidKeysRefused({
            reason: "not a P-256 pair",
          }),
        ),
      ),
    );
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.setSystemTime(T0);
    const stub = developmentHousehold();
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec("DELETE FROM deadlines");
      state.storage.sql.exec("DELETE FROM notifications_push_subscriptions");
    });
    await evictDurableObject(stub);
    await register(await aPhone());
    const received = pushService();

    await scheduleThenRunAlarm();

    expect(await health(stub)).toBe(200);
    expect(received).toStrictEqual([]);
    expect(await deadlinesOf(stub)).toStrictEqual([]);
    expect(log.mock.calls.flat().join("\n")).toContain(
      "push sender unavailable",
    );
  });
});
