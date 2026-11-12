import { Context, DateTime, Duration, Effect } from "effect";
import { testPushPayload } from "../../../../contracts/push";
import { type PushMessage, PushSender } from "./push-sender";
import { PushSubscriptions } from "./push-subscriptions";

/**
 * When the household sends its test notification (plan J1.14). At most one is pending: scheduling
 * it again moves it. Implemented by the object's deadlines (ADR-025).
 */
export class TestNotificationDeadline extends Context.Service<
  TestNotificationDeadline,
  { readonly scheduleAt: (dueAt: DateTime.Utc) => Effect.Effect<void> }
>()("TestNotificationDeadline") {}

/** « Tester une notification dans 1 min »: one minute after the time `Clock` reads. */
export const scheduleTestNotification = Effect.fn("ScheduleTestNotification")(
  function* () {
    const now = yield* DateTime.now;
    const deadline = yield* TestNotificationDeadline;
    yield* deadline.scheduleAt(DateTime.add(now, { minutes: 1 }));
  },
);

// The service worker writes the words (src/web/messages.ts). A test is only worth showing soon
// after it was asked for; `high` asks the push service to wake the phone at once (RFC 8030 §5.3).
const testMessage: PushMessage = {
  payload: JSON.stringify(testPushPayload),
  ttl: Duration.minutes(10),
  urgency: "high",
};

/** How long one push service may take to answer before the send counts as unavailable. */
export const sendTimeout = Duration.seconds(10);

/**
 * Sends the test notification to every phone of the household, one after the other, once each:
 * no retry, a test is asked for again from the page. A subscription the push service no longer
 * knows (404, 410) or that cannot be used is forgotten; any other failure keeps it.
 */
export const sendTestNotification = Effect.fn("SendTestNotification")(
  function* () {
    const subscriptions = yield* PushSubscriptions;
    const sender = yield* PushSender;
    for (const subscription of yield* subscriptions.list) {
      const pushService = new URL(subscription.endpoint).origin;
      yield* sender.send(subscription, testMessage).pipe(
        Effect.timeout(sendTimeout),
        Effect.catchTags({
          PushSubscriptionGone: () =>
            subscriptions.remove(subscription.endpoint),
          PushSubscriptionInvalid: () =>
            subscriptions.remove(subscription.endpoint),
        }),
        // The errors carry statuses and delays, never the endpoint or a key.
        Effect.catch((error) => Effect.logWarning("push not delivered", error)),
        Effect.annotateLogs({ "push.service": pushService }),
      );
    }
  },
);
