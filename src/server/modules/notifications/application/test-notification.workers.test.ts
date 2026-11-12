import { DateTime, Duration, Effect, Fiber, Layer, Option } from "effect";
import { TestClock } from "effect/testing";
import { describe, expect, it } from "vitest";
import {
  type PushError,
  type PushMessage,
  PushPayloadTooLarge,
  PushRequestRejected,
  PushSender,
  PushServiceUnavailable,
  type PushSubscription,
  PushSubscriptionGone,
  PushSubscriptionInvalid,
  PushVapidRefused,
} from "./push-sender";
import { PushSubscriptions } from "./push-subscriptions";
import {
  scheduleTestNotification,
  sendTestNotification,
  TestNotificationDeadline,
} from "./test-notification";

// Plan J1.14; technique-v2 §5.5 (time through Clock, TestClock in tests), §7.3. PushSender is the
// external border (src/server/AGENTS.md): in memory here, with in-memory ports of the module.

const T = DateTime.toEpochMillis(DateTime.makeUnsafe("2031-03-01T20:00:00Z"));

// Runs `program` with the in-memory `ports`, under a TestClock (also the Clock) set to T.
const run = <A, E, R>(
  program: Effect.Effect<A, E, R | TestClock.TestClock>,
  ports: Layer.Layer<R>,
) =>
  Effect.runPromise(
    Effect.andThen(TestClock.setTime(T), program).pipe(
      Effect.provide(Layer.merge(TestClock.layer(), ports)),
    ),
  );

describe("scheduleTestNotification — « Tester une notification dans 1 min »", () => {
  it("asks for the deadline one minute after the time the Clock reads", async () => {
    const asked: number[] = [];
    const deadline = Layer.succeed(TestNotificationDeadline)({
      scheduleAt: (dueAt) =>
        Effect.sync(() => void asked.push(DateTime.toEpochMillis(dueAt))),
    });

    await run(scheduleTestNotification(), deadline);

    expect(asked).toStrictEqual([T + 60_000]);
  });
});

const phone = (name: string): PushSubscription => ({
  endpoint: `https://push.example.test/send/${name}`,
  keys: { p256dh: `p256dh-${name}`, auth: `auth-${name}` },
});

// The household's subscriptions in memory, and a push sender that answers `outcome` per endpoint.
const household = (
  phones: ReadonlyArray<PushSubscription>,
  outcome: (
    subscription: PushSubscription,
  ) => Effect.Effect<void, PushError> = () => Effect.void,
) => {
  const kept = new Map(phones.map((p) => [p.endpoint, p]));
  const sent: { endpoint: string; message: PushMessage }[] = [];
  const layer = Layer.merge(
    Layer.succeed(PushSubscriptions)({
      save: (subscription) =>
        Effect.sync(() => void kept.set(subscription.endpoint, subscription)),
      list: Effect.sync(() => [...kept.values()]),
      remove: (endpoint) => Effect.sync(() => void kept.delete(endpoint)),
    }),
    Layer.succeed(PushSender)({
      send: (subscription, message) =>
        Effect.suspend(() => {
          sent.push({ endpoint: subscription.endpoint, message });
          return outcome(subscription);
        }),
    }),
  );
  return { layer, sent, kept: () => [...kept.keys()] };
};

describe("sendTestNotification — one message to every phone, once", () => {
  it("sends each subscription the test payload, kept 10 minutes, with high urgency", async () => {
    const { layer, sent } = household([phone("a"), phone("b")]);

    await run(sendTestNotification(), layer);

    expect(sent.map(({ endpoint }) => endpoint)).toStrictEqual([
      phone("a").endpoint,
      phone("b").endpoint,
    ]);
    for (const { message } of sent) {
      expect(JSON.parse(message.payload)).toStrictEqual({ type: "test" });
      expect(Duration.toMillis(message.ttl)).toBe(10 * 60_000);
      expect(message.urgency).toBe("high");
    }
  });

  // RFC 8030 §7.3 (404, 410); a subscription no message can reach is forgotten too.
  it.each([
    ["no longer known (410)", new PushSubscriptionGone({ status: 410 })],
    [
      "unusable",
      new PushSubscriptionInvalid({ reason: "endpoint is not https:" }),
    ],
  ])(
    "forgets a subscription %s and still sends to the next one",
    async (_, error) => {
      const { layer, sent, kept } = household([phone("a"), phone("b")], (to) =>
        to.endpoint === phone("a").endpoint ? Effect.fail(error) : Effect.void,
      );

      await run(sendTestNotification(), layer);

      expect(sent).toHaveLength(2);
      expect(kept()).toStrictEqual([phone("b").endpoint]);
    },
  );

  it.each([
    [
      "an unavailable push service",
      new PushServiceUnavailable({
        status: Option.some(503),
        retryAfter: Option.some(Duration.seconds(120)),
      }),
    ],
    ["a refused VAPID key", new PushVapidRefused({ status: 403 })],
    ["a rejected request", new PushRequestRejected({ status: 400 })],
    ["a payload too large", new PushPayloadTooLarge({ octets: 4000 })],
  ])(
    "keeps the subscription after %s, without a second attempt",
    async (_, error) => {
      const { layer, sent, kept } = household([phone("a"), phone("b")], (to) =>
        to.endpoint === phone("a").endpoint ? Effect.fail(error) : Effect.void,
      );

      await run(sendTestNotification(), layer);

      expect(sent.map(({ endpoint }) => endpoint)).toStrictEqual([
        phone("a").endpoint,
        phone("b").endpoint,
      ]);
      expect(kept()).toStrictEqual([phone("a").endpoint, phone("b").endpoint]);
    },
  );

  // Decision of J1.14: a push service that does not answer is given 10 seconds, then counts as
  // unavailable: its subscription is kept and the next phone is not held back.
  it("gives up on a push service after 10 seconds, keeps its subscription and sends to the next", async () => {
    const { layer, sent, kept } = household([phone("a"), phone("b")], (to) =>
      to.endpoint === phone("a").endpoint ? Effect.never : Effect.void,
    );

    await run(
      Effect.gen(function* () {
        const sending = yield* Effect.forkChild(sendTestNotification());
        yield* TestClock.adjust(Duration.millis(9_999));
        expect(sent.map(({ endpoint }) => endpoint)).toStrictEqual([
          phone("a").endpoint,
        ]);

        yield* TestClock.adjust(Duration.millis(1));
        yield* Fiber.join(sending);
      }),
      layer,
    );

    expect(sent.map(({ endpoint }) => endpoint)).toStrictEqual([
      phone("a").endpoint,
      phone("b").endpoint,
    ]);
    expect(kept()).toStrictEqual([phone("a").endpoint, phone("b").endpoint]);
  });
});
