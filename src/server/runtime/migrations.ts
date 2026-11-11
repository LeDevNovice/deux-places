import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-do";
import { Effect } from "effect";
import { Migrator } from "effect/sql";

// Household schema, in order (technique-v2 §7.2): embedded in the bundle, forward-only. Never edit
// or remove an applied entry; append the next `<id>_<name>`. The migrator records each one in
// `effect_sql_migrations` and skips those already recorded.
const householdMigrations = Migrator.fromRecord({
  // The schema starts empty: each table arrives with the plan line that names it.
  "0001_baseline": Effect.void,
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
