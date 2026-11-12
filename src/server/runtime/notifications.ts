import { type Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/sql";
import * as notifications from "../modules/notifications";
import { AppConfig } from "./config";
import { type DeadlineExecutors, Deadlines } from "./deadlines";

// ADR-025: the kind is prefixed by its module. One test notification per household at a time:
// a fixed subject, so that asking again moves the pending one.
const testNotificationKind = "notifications.test-notification";
const testNotificationSubject = "household";

/** The module's port, on the object's deadlines (ADR-025); one command, one transaction. */
export const testNotificationDeadline = Layer.effect(
  notifications.TestNotificationDeadline,
  Effect.gen(function* () {
    const deadlines = yield* Deadlines;
    const sql = yield* SqlClient.SqlClient;
    return {
      scheduleAt: (dueAt) =>
        sql
          .withTransaction(
            deadlines.schedule({
              kind: testNotificationKind,
              subject: testNotificationSubject,
              dueAt,
            }),
          )
          // The object's own SQLite failing is a defect: a 500 without detail (§6.2).
          .pipe(Effect.orDie),
    };
  }),
);

/** The VAPID public key phones subscribe with: VAPID_PUBLIC_KEY, never the private key. */
export const applicationServerKey = Layer.effect(
  notifications.ApplicationServerKey,
  Effect.gen(function* () {
    const { vapidPublicKey } = yield* AppConfig;
    return { publicKey: vapidPublicKey };
  }),
);

/** Web Push with the configured VAPID pair (J1.13); building it imports the keys once. */
export const pushSender = Layer.unwrap(
  Effect.gen(function* () {
    const { vapidPublicKey, vapidPrivateKey } = yield* AppConfig;
    return notifications.webPushLayer({
      publicKey: vapidPublicKey,
      privateKey: vapidPrivateKey,
    });
  }),
);

/**
 * What the module's deadlines run. The send is network I/O: it starts once its deadline's
 * transaction has committed (`AfterCommit`). `push` gives the object's push sender, built once;
 * if it cannot be built (a VAPID pair that does not match), the send is dropped and logged, and
 * the household's other deadlines still run.
 */
export const notificationsExecutors = <E>(
  push: Effect.Effect<Context.Context<notifications.PushSender>, E>,
): DeadlineExecutors<notifications.PushSubscriptions> => ({
  [testNotificationKind]: () =>
    Effect.succeed(
      push.pipe(
        Effect.flatMap((sender) =>
          notifications.sendTestNotification().pipe(Effect.provide(sender)),
        ),
        Effect.catch((error) =>
          Effect.logError("push sender unavailable", error),
        ),
      ),
    ),
});
