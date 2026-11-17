import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-do";
import { Effect } from "effect";
import { Migrator, SqlClient } from "effect/sql";

// Household schema, in order (technique-v2 §7.2): embedded in the bundle, forward-only. Never edit
// or remove an applied entry; append the next `<id>_<name>`. The migrator records each one in
// `effect_sql_migrations` and skips those already recorded.
const householdMigrationRecord = {
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
  // §5.4, §7.1: the household's events and the internal reactions' markers (plan J2.4). The
  // sequence is SQLite's AUTOINCREMENT: increasing and never reused, even after its last rows are
  // deleted (an import replacing them); a rolled-back event takes no number. `occurred_at` is an
  // instant in UTC milliseconds, `payload` JSON text. One row per (reaction, event) the reaction
  // subscribes to, written with the event; `handled_at` is set when the reaction ran. The partial
  // index makes looking for pending reactions read only those.
  "0004_domain_events": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      CREATE TABLE domain_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        audience TEXT NOT NULL CHECK (audience IN ('household', 'internal')),
        occurred_at INTEGER NOT NULL,
        payload TEXT NOT NULL CHECK (json_valid(payload))
      ) STRICT`;
    yield* sql`
      CREATE TABLE event_reactions (
        reaction TEXT NOT NULL,
        sequence INTEGER NOT NULL REFERENCES domain_events (sequence) ON DELETE CASCADE,
        handled_at INTEGER,
        PRIMARY KEY (reaction, sequence)
      ) STRICT, WITHOUT ROWID`;
    yield* sql`
      CREATE INDEX event_reactions_pending ON event_reactions (sequence, reaction)
      WHERE handled_at IS NULL`;
  }),
};

const householdMigrations = Migrator.fromRecord(householdMigrationRecord);

// The largest id of the list, read from its keys as `Migrator.fromRecord` reads them.
const latestHouseholdMigration = Math.max(
  ...Object.keys(householdMigrationRecord).flatMap((key) => {
    const id = /^(\d+)_(.+)$/.exec(key)?.[1];
    return id === undefined ? [] : [Number(id)];
  }),
);

/**
 * Whether the household's recorded schema is current (technique-v2 §10.2), that is whether the
 * migrator would apply nothing. Effect's migrator applies every migration whose id is above the
 * largest id recorded in `effect_sql_migrations`, after creating that table when it is absent
 * (`effect/sql` Migrator, `run`). Read synchronously from the object's storage, without starting
 * Effect: running the migrator costs a cold object several milliseconds of CPU (plan J1.20).
 */
export const householdSchemaIsCurrent = (storage: DurableObjectStorage) => {
  // No record table: a new household.
  const recordTable = storage.sql
    .exec(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'effect_sql_migrations'",
    )
    .toArray();
  if (recordTable.length === 0) return false;
  const [latest] = storage.sql
    .exec<{ migration_id: number }>(
      "SELECT migration_id FROM effect_sql_migrations ORDER BY migration_id DESC LIMIT 1",
    )
    .toArray();
  return (latest?.migration_id ?? 0) >= latestHouseholdMigration;
};

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
