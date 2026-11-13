import { SqliteClient } from "@effect/sql-sqlite-do";
import { Data, Effect, Layer, Result, Schema, SchemaIssue } from "effect";
import { Base64 } from "effect/encoding";
import { SqlClient } from "effect/sql";
import { armOnEarliest } from "./deadlines";
import {
  appliedMigrations,
  exportVersion,
  householdTables,
  quoted,
} from "./export";
import { jsonLogs } from "./logging";

/**
 * Why an export was not imported. The reason names what differs (a version, a migration, a table,
 * a column, a row number), never a value of the file: it is logged and printed (§12.1).
 */
class ExportRefused extends Data.TaggedError("ExportRefused")<{
  readonly reason: string;
}> {}

const refuse = (reason: string) => Effect.fail(new ExportRefused({ reason }));

// The values an export holds (J1.15): TEXT a string, INTEGER and REAL a number, NULL null, a BLOB
// `{ "base64": "…" }`. JSON has no NaN nor infinity; a boolean or a list is not a SQLite value.
const SqliteValue = Schema.Union([
  Schema.String,
  Schema.Finite,
  Schema.Null,
  Schema.Struct({ base64: Schema.String }),
]);

// Version 1 of the export, exactly: a field it does not have is refused (`onExcessProperty`).
const ExportV1 = Schema.Struct({
  version: Schema.Literal(exportVersion),
  exportedAt: Schema.String,
  migrations: Schema.Array(
    Schema.Struct({ id: Schema.Int, name: Schema.String }),
  ),
  tables: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      columns: Schema.Array(Schema.String),
      rows: Schema.Array(Schema.Array(SqliteValue)),
    }),
  ),
});
type ExportV1 = typeof ExportV1.Type;

const decodeExport = Schema.decodeUnknownResult(ExportV1, {
  onExcessProperty: "error",
});

// Only the path of the first issue is kept: Effect's messages may quote the input (the formatter's
// own gotcha), so the hooks write nothing of it.
const issuePath = SchemaIssue.makeFormatterStandardSchemaV1({
  leafHook: () => "",
  checkHook: () => "",
});

const pathOf = (issue: SchemaIssue.Issue) =>
  (issuePath(issue).issues[0]?.path ?? [])
    .map((segment) =>
      String(typeof segment === "object" ? segment.key : segment),
    )
    .join(".");

// Refuses with `reason`, or passes when there is none.
const refuseIf = (reason: string | undefined) =>
  reason === undefined ? Effect.void : refuse(reason);

const versionOf = (json: unknown): unknown =>
  typeof json === "object" && json !== null
    ? Reflect.get(json, "version")
    : undefined;

// The file as an export of version 1. `JSON.parse`'s message quotes the text: it is dropped. The
// version is checked first, so that an export of another version is named as such.
const readExport = (exported: string) =>
  Effect.try({
    try: (): unknown => JSON.parse(exported),
    catch: () => new ExportRefused({ reason: "the file is not JSON" }),
  }).pipe(
    Effect.filterOrFail(
      (json) => versionOf(json) === exportVersion,
      () =>
        new ExportRefused({
          reason: `unknown export version (this household reads version ${exportVersion})`,
        }),
    ),
    Effect.flatMap((json) =>
      Effect.fromResult(decodeExport(json)).pipe(
        Effect.mapError(
          (error) =>
            new ExportRefused({
              reason: `the export does not have the expected shape at ${pathOf(error.issue)}`,
            }),
        ),
      ),
    ),
  );

const migrationName = (migration: {
  readonly id: number;
  readonly name: string;
}) => `${migration.id}_${migration.name}`;

// The export's migrations are those the household applied when it started (§7.2): the same schema.
const checkMigrations = (file: ExportV1) =>
  Effect.gen(function* () {
    const household = (yield* appliedMigrations).map(migrationName);
    const exported = file.migrations.map(migrationName);
    const differences = [
      ...household
        .filter((name) => !exported.includes(name))
        .map((name) => `missing ${name}`),
      ...exported
        .filter((name) => !household.includes(name))
        .map((name) => `extra ${name}`),
    ];
    yield* refuseIf(
      differences.length > 0
        ? `the export's migrations differ from this household's: ${differences.join(", ")}`
        : undefined,
    );
  });

const firstTwice = (names: readonly string[]) =>
  names.find((name, index) => names.indexOf(name) !== index);

// RFC 4648 §4, canonical: what `Base64.decode` accepts and encodes back to the same text (no line
// break, no base64url alphabet, no stray bits).
const blobOf = (base64: string) => {
  const decoded = Result.getOrUndefined(Base64.decode(base64));
  return decoded !== undefined && Base64.encode(decoded) === base64
    ? decoded
    : undefined;
};

type ExportedTable = ExportV1["tables"][number];

/** A value as SQLite binds it. */
type Bound = string | number | null | Uint8Array;

/** A table of the export, checked against the household's, with its rows as SQLite binds them. */
interface Writable {
  readonly name: string;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly Bound[])[];
}

// Every table of the export is one of the household's (those `householdTables` lists: never a `_*`,
// `sqlite_*` or `effect_sql_migrations` table), once, and every table of the household is in it.
const tablesProblem = (
  exported: readonly string[],
  household: readonly string[],
) => {
  const twice = firstTwice(exported);
  if (twice !== undefined) return `table ${twice} appears twice`;
  const unknown = exported.find((name) => !household.includes(name));
  if (unknown !== undefined) return `unknown table ${unknown}`;
  const missing = household.find((name) => !exported.includes(name));
  if (missing !== undefined)
    return `table ${missing} is missing from the export`;
  return undefined;
};

// A table of the export has the household's columns, each once.
const columnsProblem = (table: ExportedTable, household: readonly string[]) => {
  const twice = firstTwice(table.columns);
  if (twice !== undefined)
    return `table ${table.name}: column ${twice} appears twice`;
  const unknown = table.columns.find((name) => !household.includes(name));
  if (unknown !== undefined)
    return `table ${table.name}: unknown column ${unknown}`;
  const missing = household.find((name) => !table.columns.includes(name));
  if (missing !== undefined)
    return `table ${table.name}: column ${missing} is missing from the export`;
  return undefined;
};

// A row as SQLite binds it: one value per column, each BLOB decoded to bytes.
const rowOf = (
  table: ExportedTable,
  row: ExportedTable["rows"][number],
  index: number,
): Effect.Effect<readonly Bound[], ExportRefused> => {
  const at = `table ${table.name}, row ${index + 1}`;
  if (row.length !== table.columns.length)
    return refuse(
      `${at}: ${row.length} values for ${table.columns.length} columns`,
    );
  const values: Bound[] = [];
  for (const [position, value] of row.entries()) {
    const bound =
      typeof value === "object" && value !== null
        ? blobOf(value.base64)
        : value;
    if (bound === undefined)
      return refuse(
        `${at}, column ${table.columns[position]}: malformed base64`,
      );
    values.push(bound);
  }
  return Effect.succeed(values);
};

// The export's tables, checked against the household's, with their rows ready to bind.
const checkTables = (file: ExportV1) =>
  Effect.gen(function* () {
    const household = new Map(
      (yield* householdTables).map(({ name, columns }) => [name, columns]),
    );
    yield* refuseIf(
      tablesProblem(
        file.tables.map((table) => table.name),
        [...household.keys()],
      ),
    );
    const writable: Writable[] = [];
    for (const table of file.tables) {
      yield* refuseIf(columnsProblem(table, household.get(table.name) ?? []));
      const rows = yield* Effect.forEach(table.rows, (row, index) =>
        rowOf(table, row, index),
      );
      writable.push({ name: table.name, columns: table.columns, rows });
    }
    return writable;
  });

// SQLite's own message names the constraint, its table and column, never the value refused.
const sqliteMessage = (cause: unknown) =>
  cause instanceof Error ? cause.message : "unknown SQLite error";

// One transaction (technique-v2 §7.2, all or nothing): the household's rows are removed, the
// export's written, and the alarm pointed at the earliest restored deadline, never at the current
// instant. The alarm is part of the transaction (docs, `transaction()`; probe of J1.16). A row the
// household refuses (a constraint) rolls everything back; the reason names its table and number.
const write = (storage: DurableObjectStorage, tables: readonly Writable[]) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    return yield* sql.withTransaction(
      Effect.gen(function* () {
        for (const { name } of tables)
          yield* sql.unsafe(`DELETE FROM ${quoted(name)}`);
        let rows = 0;
        for (const table of tables) {
          const insert = `INSERT INTO ${quoted(table.name)} (${table.columns.map(quoted).join(", ")}) VALUES (${table.columns.map(() => "?").join(", ")})`;
          for (const [index, row] of table.rows.entries()) {
            yield* sql.unsafe(insert, row).pipe(
              Effect.mapError(
                (error) =>
                  new ExportRefused({
                    reason: `table ${table.name}, row ${index + 1} could not be written: ${sqliteMessage(error.reason.cause)}`,
                  }),
              ),
            );
            rows += 1;
          }
        }
        yield* armOnEarliest(storage);
        return { tables: tables.length, rows };
      }),
    );
  });

const importInto = Effect.fn("RestoreHousehold")(function* (
  storage: DurableObjectStorage,
  exported: string,
) {
  const file = yield* readExport(exported);
  yield* checkMigrations(file);
  const tables = yield* checkTables(file);
  return yield* write(storage, tables);
});

/** What an import did: the counts it restored, or why it refused the file. */
export type ImportOutcome =
  | { readonly restored: { readonly tables: number; readonly rows: number } }
  | { readonly refused: string };

/**
 * Restores an export (format of J1.15) into the household whose storage this is (plan J1.16,
 * technique-v2 §12.4): every check passes before anything is written, then the household's rows are
 * replaced in one transaction and its alarm pointed at the earliest restored deadline. Logs the
 * counts or the reason, never a value of the file (§12.1). Only the local restore calls it
 * (runtime/restore-local.ts): no deployed route or method reaches it.
 */
export const restoreHousehold = (
  storage: DurableObjectStorage,
  exported: string,
): Promise<ImportOutcome> =>
  Effect.runPromise(
    importInto(storage, exported).pipe(
      Effect.tap((restored) =>
        Effect.log("household restored").pipe(
          Effect.annotateLogs({
            "restore.tables": restored.tables,
            "restore.rows": restored.rows,
          }),
        ),
      ),
      Effect.map((restored): ImportOutcome => ({ restored })),
      Effect.catchTag("ExportRefused", ({ reason }) =>
        Effect.logWarning("household restore refused").pipe(
          Effect.annotateLogs({ "restore.reason": reason }),
          Effect.as<ImportOutcome>({ refused: reason }),
        ),
      ),
      Effect.provide(Layer.merge(SqliteClient.layer({ storage }), jsonLogs)),
    ),
  );
