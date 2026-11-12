import { Effect, Layer } from "effect";
import { SqlClient } from "effect/sql";
import { PushSubscriptions } from "../application/push-subscriptions";

interface Row {
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
}

// The household's SQLite is inside its object: a failing statement is a defect (a 500, or a
// deadline dropped and logged), not something a caller could handle.
const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return PushSubscriptions.of({
    save: ({ endpoint, keys }) =>
      sql`
        INSERT INTO notifications_push_subscriptions (endpoint, p256dh, auth)
        VALUES (${endpoint}, ${keys.p256dh}, ${keys.auth})
        ON CONFLICT (endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`.pipe(
        Effect.asVoid,
        Effect.orDie,
      ),
    list: sql<Row>`
      SELECT endpoint, p256dh, auth FROM notifications_push_subscriptions ORDER BY endpoint`.pipe(
      Effect.map((rows) =>
        rows.map(({ endpoint, p256dh, auth }) => ({
          endpoint,
          keys: { p256dh, auth },
        })),
      ),
      Effect.orDie,
    ),
    remove: (endpoint) =>
      sql`DELETE FROM notifications_push_subscriptions WHERE endpoint = ${endpoint}`.pipe(
        Effect.asVoid,
        Effect.orDie,
      ),
  });
});

/** `PushSubscriptions` in the household's `notifications_push_subscriptions` table (§7.1). */
export const layer = Layer.effect(PushSubscriptions, make);
