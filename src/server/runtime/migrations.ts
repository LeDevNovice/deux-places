import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-do";
import { Effect } from "effect";
import { Migrator, SqlClient } from "effect/sql";

// Household schema, in order (technique-v2 §7.2): embedded in the bundle, forward-only. Never edit
// or remove an applied entry; append the next `<id>_<name>`. The migrator records each one in
// `effect_sql_migrations` and skips those already recorded.
const householdMigrations = Migrator.fromRecord({
  // The schema starts empty: each table arrives with the plan line that names it.
  "0001_baseline": Effect.void,
  // §7.1, §7.3: one row per deadline; `due_at` is an instant in UTC milliseconds. The alarm reads
  // the earliest row on every run and every schedule, hence the index.
  "0002_deadlines": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      CREATE TABLE deadlines (
        kind TEXT NOT NULL,
        subject TEXT NOT NULL,
        due_at INTEGER NOT NULL,
        PRIMARY KEY (kind, subject)
      ) STRICT, WITHOUT ROWID`;
    yield* sql`CREATE INDEX deadlines_by_due_at ON deadlines (due_at)`;
  }),
  // §7.1: the household's push subscriptions (W3C Push API), one per push resource URL. Only what
  // sending needs (RFC 8030 endpoint, RFC 8291 keys), in base64url as the phone gives them.
  "0003_notifications_push_subscriptions": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      CREATE TABLE notifications_push_subscriptions (
        endpoint TEXT NOT NULL PRIMARY KEY,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL
      ) STRICT, WITHOUT ROWID`;
  }),
});

/**
 * Applies the household's pending migrations to the object's SQLite storage, all in one storage
 * transaction, and resolves with those it applied. The object runs it once when it starts, before
 * serving any request (§10.2); a failure rejects and leaves the schema as it was.
 */
export const migrateHousehold = (storage: DurableObjectStorage) =>
  Effect.runPromise(
    SqliteMigrator.run({ loader: householdMigrations }).pipe(
      Effect.provide(SqliteClient.layer({ storage })),
    ),
  );
