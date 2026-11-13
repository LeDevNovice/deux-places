/// <reference types="@cloudflare/vitest-plugin/types" />
import { runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { DateTime, Schema } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { restoreHousehold } from "./import";

// Plan J1.16; technique-v2 §12.4 (each month an export is re-imported into a local Durable Object
// and checked), §10.4 (no point-in-time recovery locally), §7.1–§7.3 (tables, migrations, one alarm
// on the earliest deadline), §12.1 (logs never carry content). Format of the export: plan J1.15.
const site = "https://deux-places.test";

// Local workerd has no jurisdictions: the tests run with DURABLE_OBJECT_JURISDICTION=none.
const household = (name: string) =>
  env.Household.get(env.Household.idFromName(name));

const instant = DateTime.toEpochMillis(
  DateTime.makeUnsafe("2026-11-13T20:45:30.125Z"),
);

// Deadlines far after `instant` and after today: an imported alarm never fires during a test.
const firstDue = DateTime.toEpochMillis(
  DateTime.makeUnsafe("2030-05-01T18:00:00.000Z"),
);
const laterDue = DateTime.toEpochMillis(
  DateTime.makeUnsafe("2030-06-01T18:00:00.000Z"),
);

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Content that must never leave the household through a message or a log line (§12.1).
const privateEndpoint = "https://push.example.test/private-endpoint";
const privateKey = "p256dh-private-value";
const privateNote = "private-note-value";

// Tables a later migration could add, holding what the household's tables cannot hold yet: a BLOB,
// a NULL and a REAL (`fixture_values`), and rows without a primary key (`fixture_words`). They are
// not migrations: every household of a test that imports them creates them first.
const createFixtureTables = (sql: SqlStorage) => {
  sql.exec(
    "CREATE TABLE fixture_values (id INTEGER PRIMARY KEY AUTOINCREMENT, data BLOB, note TEXT, ratio REAL)",
  );
  sql.exec(
    "CREATE TABLE fixture_words (word TEXT NOT NULL, rank INTEGER NOT NULL)",
  );
};

// A household filled by hand: every table of J1.15's export, rows written in an unsorted order.
const fillSource = (name: string) =>
  runInDurableObject(household(name), (_instance, state) => {
    const sql = state.storage.sql;
    createFixtureTables(sql);
    sql.exec(
      "INSERT INTO deadlines (kind, subject, due_at) VALUES ('notifications.test-notification', 'household', ?), ('evening.swap-end', '2030-05-01', ?)",
      laterDue,
      firstDue,
    );
    sql.exec(
      "INSERT INTO notifications_push_subscriptions (endpoint, p256dh, auth) VALUES (?, ?, 'auth-b'), ('https://push.example.test/a', 'p256dh-a', 'auth-a')",
      privateEndpoint,
      privateKey,
    );
    sql.exec(
      "INSERT INTO fixture_values (id, data, note, ratio) VALUES (2, X'00FF10', NULL, 0.5), (1, NULL, ?, -2.25), (3, X'', 'empty blob', 3)",
      privateNote,
    );
    sql.exec(
      "INSERT INTO fixture_words (word, rank) VALUES ('b', 1), ('a', 2), ('a', 1)",
    );
  });

// A household that already holds other rows, and an alarm on its own earliest deadline.
const fillTargetWithOtherRows = (name: string) =>
  runInDurableObject(household(name), async (_instance, state) => {
    const sql = state.storage.sql;
    createFixtureTables(sql);
    const earlier = firstDue - 86_400_000;
    sql.exec(
      "INSERT INTO deadlines (kind, subject, due_at) VALUES ('evening.swap-end', 'kept-before', ?)",
      earlier,
    );
    sql.exec(
      "INSERT INTO notifications_push_subscriptions (endpoint, p256dh, auth) VALUES ('https://push.example.test/old', 'p256dh-old', 'auth-old')",
    );
    sql.exec(
      "INSERT INTO fixture_values (id, data, note, ratio) VALUES (9, X'01', 'old', 1.5)",
    );
    sql.exec("INSERT INTO fixture_words (word, rank) VALUES ('old', 7)");
    await state.storage.setAlarm(earlier);
  });

const emptyTargetWithFixtures = (name: string) =>
  runInDurableObject(household(name), (_instance, state) => {
    createFixtureTables(state.storage.sql);
  });

const exportOf = async (name: string) => {
  vi.setSystemTime(instant);
  return household(name).exportHousehold();
};

const alarmOf = (name: string) =>
  runInDurableObject(household(name), (_instance, state) =>
    state.storage.getAlarm(),
  );

// The import as the local restore runs it: inside the target household.
const restoreInto = (name: string, exported: string) =>
  runInDurableObject(household(name), (_instance, state) =>
    restoreHousehold(state.storage, exported),
  );

// The export read back by the tests, to build broken copies of a real one.
const Exported = Schema.Struct({
  version: Schema.Finite,
  exportedAt: Schema.String,
  migrations: Schema.Array(
    Schema.Struct({ id: Schema.Finite, name: Schema.String }),
  ),
  tables: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      columns: Schema.Array(Schema.String),
      rows: Schema.Array(Schema.Array(Schema.Unknown)),
    }),
  ),
});
type Exported = typeof Exported.Type;
const parsed = (exported: string): Exported =>
  Schema.decodeUnknownSync(Exported)(JSON.parse(exported));

describe("Household — an export imported into another household gives the same export (plan J1.16)", () => {
  it("restores every table, row and value: export → import → export is identical but for exportedAt", async () => {
    await fillSource("round-trip-source");
    const exported = await exportOf("round-trip-source");
    await emptyTargetWithFixtures("round-trip-target");

    const outcome = await restoreInto("round-trip-target", exported);

    expect(outcome).toStrictEqual({ restored: { tables: 4, rows: 10 } });
    expect(await exportOf("round-trip-target")).toBe(exported);
    // Not vacuous: the export holds a BLOB, a NULL, a REAL and every row written above.
    const tables = parsed(exported).tables;
    expect(tables.map((table) => [table.name, table.rows.length])).toEqual([
      ["deadlines", 2],
      ["fixture_values", 3],
      ["fixture_words", 3],
      ["notifications_push_subscriptions", 2],
    ]);
    expect(JSON.stringify(tables)).toContain('{"base64":"AP8Q"}');
  });

  it("replaces the rows a household already held: none kept, none mixed in", async () => {
    await fillSource("replace-source");
    const exported = await exportOf("replace-source");
    await fillTargetWithOtherRows("replace-target");

    const outcome = await restoreInto("replace-target", exported);

    expect(outcome).toStrictEqual({ restored: { tables: 4, rows: 10 } });
    expect(await exportOf("replace-target")).toBe(exported);
  });

  it("restores an export of an empty household into a household that held rows", async () => {
    const empty = await exportOf("empty-source");
    await runInDurableObject(household("emptied-target"), async (_i, state) => {
      state.storage.sql.exec(
        "INSERT INTO deadlines (kind, subject, due_at) VALUES ('evening.swap-end', 'old', ?)",
        firstDue,
      );
      await state.storage.setAlarm(firstDue);
    });

    const outcome = await restoreInto("emptied-target", empty);

    expect(outcome).toStrictEqual({ restored: { tables: 2, rows: 0 } });
    expect(await exportOf("emptied-target")).toBe(empty);
    expect(await alarmOf("emptied-target")).toBeNull();
  });
});

describe("Household — the alarm points at the earliest imported deadline (plan J1.16, technique-v2 §7.3)", () => {
  it("arms the alarm on the earliest imported deadline, replacing the household's own", async () => {
    await fillSource("alarm-source");
    const exported = await exportOf("alarm-source");
    await fillTargetWithOtherRows("alarm-target");

    await restoreInto("alarm-target", exported);

    expect(await alarmOf("alarm-target")).toBe(firstDue);
  });

  it("arms no alarm when the export holds no deadline", async () => {
    await runInDurableObject(household("no-deadline-source"), (_i, state) => {
      createFixtureTables(state.storage.sql);
      state.storage.sql.exec(
        "INSERT INTO fixture_words (word, rank) VALUES ('kept', 1)",
      );
    });
    const exported = await exportOf("no-deadline-source");
    await fillTargetWithOtherRows("no-deadline-target");

    const outcome = await restoreInto("no-deadline-target", exported);

    expect(outcome).toStrictEqual({ restored: { tables: 4, rows: 1 } });
    expect(await alarmOf("no-deadline-target")).toBeNull();
  });

  // A deadline already past is restored as it was: the alarm points at its own instant, which the
  // runtime runs at once (docs: setAlarm at or before now runs "in the immediate future"); never at
  // the instant the import reads.
  it("arms an already past deadline on its own instant, never on the current one", async () => {
    const past = instant - 3_600_000;
    await runInDurableObject(household("past-source"), (_i, state) => {
      state.storage.sql.exec(
        "INSERT INTO deadlines (kind, subject, due_at) VALUES ('fixture.past', 'household', ?)",
        past,
      );
    });
    const exported = await exportOf("past-source");

    const armed = await runInDurableObject(
      household("past-target"),
      async (_i, state) => {
        const outcome = await restoreHousehold(state.storage, exported);
        const alarm = await state.storage.getAlarm();
        // Nothing runs it after the test: the pool keeps no executor for `fixture.past`.
        await state.storage.deleteAlarm();
        return { outcome, alarm };
      },
    );

    expect(armed).toStrictEqual({
      outcome: { restored: { tables: 2, rows: 1 } },
      alarm: past,
    });
  });
});

// A household whose rows and alarm a refused import must leave exactly as they were.
const refusalTarget = async (name: string) => {
  await fillTargetWithOtherRows(name);
  return { rows: await exportOf(name), alarm: await alarmOf(name) };
};

const broken = (exported: Exported, change: (copy: Exported) => unknown) =>
  JSON.stringify(change(structuredClone(exported)));

const withTable = (
  exported: Exported,
  name: string,
  change: (table: Exported["tables"][number]) => Exported["tables"][number],
): Exported => ({
  ...exported,
  tables: exported.tables.map((table) =>
    table.name === name ? change(table) : table,
  ),
});

// A valid export, broken in one place per case. Storage is shared by the tests of this file:
// each test fills households of its own.
const sourceExport = async (name: string) => {
  await fillSource(name);
  return parsed(await exportOf(name));
};

describe("Household — an export is checked before anything is written (plan J1.16)", () => {
  const cases: readonly {
    readonly title: string;
    readonly file: (valid: Exported) => string;
    readonly reason: RegExp;
  }[] = [
    {
      title: "a file that is not JSON",
      file: () => `{"version":1,"tables":[${privateNote}`,
      reason: /^the file is not JSON$/,
    },
    {
      title: "an unknown version (2)",
      file: (valid) => JSON.stringify({ ...valid, version: 2 }),
      reason: /^unknown export version \(this household reads version 1\)$/,
    },
    {
      title: "a version written as text",
      file: (valid) => JSON.stringify({ ...valid, version: "1" }),
      reason: /^unknown export version/,
    },
    {
      title: "no version at all",
      file: (valid) => JSON.stringify({ ...valid, version: undefined }),
      reason: /^unknown export version/,
    },
    {
      title: "a value that SQLite cannot hold (a boolean)",
      file: (valid) =>
        JSON.stringify(
          withTable(valid, "fixture_words", (table) => ({
            ...table,
            rows: [[true, 1], ...table.rows],
          })),
        ),
      reason:
        /^the export does not have the expected shape at tables\.2\.rows\.0\.0$/,
    },
    {
      title: "tables that are not a list",
      file: (valid) => JSON.stringify({ ...valid, tables: {} }),
      reason: /^the export does not have the expected shape at tables$/,
    },
    {
      title: "a field the format does not have",
      file: (valid) => JSON.stringify({ ...valid, household: privateNote }),
      reason: /^the export does not have the expected shape at household$/,
    },
    {
      title: "a migration fewer than the household",
      file: (valid) =>
        JSON.stringify({ ...valid, migrations: valid.migrations.slice(0, -1) }),
      reason:
        /^the export's migrations differ from this household's: missing 3_notifications_push_subscriptions$/,
    },
    {
      title: "a migration more than the household",
      file: (valid) =>
        JSON.stringify({
          ...valid,
          migrations: [...valid.migrations, { id: 4, name: "future_table" }],
        }),
      reason:
        /^the export's migrations differ from this household's: extra 4_future_table$/,
    },
    {
      title: "a migration renamed",
      file: (valid) =>
        JSON.stringify({
          ...valid,
          migrations: valid.migrations.map((migration) =>
            migration.id === 2 ? { id: 2, name: "renamed" } : migration,
          ),
        }),
      reason:
        /^the export's migrations differ from this household's: missing 2_deadlines, extra 2_renamed$/,
    },
    {
      title: "a table the household does not have",
      file: (valid) =>
        JSON.stringify({
          ...valid,
          tables: [
            ...valid.tables,
            { name: "fixture_unknown", columns: ["v"], rows: [[privateNote]] },
          ],
        }),
      reason: /^unknown table fixture_unknown$/,
    },
    {
      title: "the migrations table, which the export leaves out",
      file: (valid) =>
        JSON.stringify({
          ...valid,
          tables: [
            ...valid.tables,
            {
              name: "effect_sql_migrations",
              columns: ["migration_id", "created_at", "name"],
              rows: [],
            },
          ],
        }),
      reason: /^unknown table effect_sql_migrations$/,
    },
    {
      title: "a platform table, which the export leaves out",
      file: (valid) =>
        JSON.stringify({
          ...valid,
          tables: [
            ...valid.tables,
            { name: "_cf_KV", columns: ["key", "value"], rows: [] },
          ],
        }),
      reason: /^unknown table _cf_KV$/,
    },
    {
      title: "SQLite's own table, which the export leaves out",
      file: (valid) =>
        JSON.stringify({
          ...valid,
          tables: [
            ...valid.tables,
            { name: "sqlite_sequence", columns: ["name", "seq"], rows: [] },
          ],
        }),
      reason: /^unknown table sqlite_sequence$/,
    },
    {
      title: "a table of the household missing from the export",
      file: (valid) =>
        JSON.stringify({
          ...valid,
          tables: valid.tables.filter((table) => table.name !== "deadlines"),
        }),
      reason: /^table deadlines is missing from the export$/,
    },
    {
      title: "a table twice",
      file: (valid) =>
        JSON.stringify({
          ...valid,
          tables: [...valid.tables, valid.tables[0]],
        }),
      reason: /^table deadlines appears twice$/,
    },
    {
      title: "a column missing",
      file: (valid) =>
        JSON.stringify(
          withTable(valid, "deadlines", (table) => ({
            ...table,
            columns: ["kind", "subject"],
            rows: table.rows.map((row) => row.slice(0, 2)),
          })),
        ),
      reason: /^table deadlines: column due_at is missing from the export$/,
    },
    {
      title: "a column too many",
      file: (valid) =>
        JSON.stringify(
          withTable(valid, "deadlines", (table) => ({
            ...table,
            columns: [...table.columns, "extra"],
            rows: table.rows.map((row) => [...row, privateNote]),
          })),
        ),
      reason: /^table deadlines: unknown column extra$/,
    },
    {
      title: "a column twice",
      file: (valid) =>
        JSON.stringify(
          withTable(valid, "fixture_words", (table) => ({
            ...table,
            columns: ["word", "rank", "word"],
            rows: table.rows.map((row) => [...row, row[0]]),
          })),
        ),
      reason: /^table fixture_words: column word appears twice$/,
    },
    {
      title: "a row with fewer values than columns",
      file: (valid) =>
        JSON.stringify(
          withTable(valid, "fixture_words", (table) => ({
            ...table,
            rows: [...table.rows, ["c"]],
          })),
        ),
      reason: /^table fixture_words, row 4: 1 values for 2 columns$/,
    },
    {
      title: "a BLOB whose base64 is cut short",
      file: (valid) =>
        JSON.stringify(
          withTable(valid, "fixture_values", (table) => ({
            ...table,
            rows: table.rows.map((row) =>
              row[0] === 2 ? [2, { base64: "AP8" }, null, 0.5] : row,
            ),
          })),
        ),
      reason: /^table fixture_values, row 2, column data: malformed base64$/,
    },
    {
      title: "a BLOB in base64url (RFC 4648 §5) rather than base64 (§4)",
      file: (valid) =>
        JSON.stringify(
          withTable(valid, "fixture_values", (table) => ({
            ...table,
            rows: table.rows.map((row) =>
              row[0] === 2 ? [2, { base64: "AP-_" }, null, 0.5] : row,
            ),
          })),
        ),
      reason: /^table fixture_values, row 2, column data: malformed base64$/,
    },
    {
      title: "a BLOB whose base64 carries a line break",
      file: (valid) =>
        JSON.stringify(
          withTable(valid, "fixture_values", (table) => ({
            ...table,
            rows: table.rows.map((row) =>
              row[0] === 2 ? [2, { base64: "AP8Q\n" }, null, 0.5] : row,
            ),
          })),
        ),
      reason: /^table fixture_values, row 2, column data: malformed base64$/,
    },
  ];

  it.each(cases)(
    "refuses $title and leaves the household as it was",
    async ({ title, file, reason }) => {
      const valid = await sourceExport(`refusal-source-${title}`);
      const target = `refused-${title}`;
      const before = await refusalTarget(target);

      const outcome = await restoreInto(target, file(valid));

      expect(outcome).toStrictEqual({ refused: expect.stringMatching(reason) });
      expect(await exportOf(target)).toBe(before.rows);
      expect(await alarmOf(target)).toBe(before.alarm);
    },
  );

  it("never repeats a value of the file in its reason", async () => {
    const valid = await sourceExport("quiet-source");
    const reasons = await Promise.all(
      cases.map(async ({ title, file }) => {
        const target = `quiet-${title}`;
        await fillTargetWithOtherRows(target);
        return JSON.stringify(await restoreInto(target, file(valid)));
      }),
    );

    expect(reasons).toHaveLength(cases.length);
    for (const reason of reasons)
      for (const value of [privateNote, privateEndpoint, privateKey])
        expect(reason).not.toContain(value);
  });

  it("refuses an import that fails half-way and writes nothing of it", async () => {
    const valid = await sourceExport("half-way-source");
    // The last table written (by name) holds the private endpoint twice: its primary key refuses
    // it, and the reason does not repeat it.
    const failing = broken(valid, (copy) =>
      withTable(copy, "notifications_push_subscriptions", (table) => ({
        ...table,
        rows: [
          ...table.rows,
          table.rows.find((row) => row[0] === privateEndpoint) ?? [],
        ],
      })),
    );
    expect(
      parsed(failing)
        .tables.map((table) => table.name)
        .at(-1),
    ).toBe("notifications_push_subscriptions");
    const before = await refusalTarget("half-way");

    const outcome = await restoreInto("half-way", failing);

    expect(outcome).toStrictEqual({
      refused: expect.stringMatching(
        /^table notifications_push_subscriptions, row 3 could not be written: .+$/,
      ),
    });
    expect(JSON.stringify(outcome)).not.toContain(privateEndpoint);
    expect(await exportOf("half-way")).toBe(before.rows);
    expect(await alarmOf("half-way")).toBe(before.alarm);
  });
});

// Every console channel the household could write to.
const consoleLines = () => {
  const lines: string[] = [];
  for (const channel of ["log", "info", "warn", "error", "debug"] as const)
    vi.spyOn(console, channel).mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
  return lines;
};

describe("Household — an import logs what it did, never what it restored (technique-v2 §12.1)", () => {
  it("logs the restore and a refusal without any value of the file", async () => {
    await fillSource("logged-source");
    const exported = await exportOf("logged-source");
    await emptyTargetWithFixtures("logged-target");
    const blob = '"AP8Q"';
    const lines = consoleLines();

    await restoreInto("logged-target", exported);
    await restoreInto(
      "logged-target",
      broken(parsed(exported), (copy) => ({ ...copy, version: 3 })),
    );

    expect(lines.join("\n")).toContain("household restored");
    expect(lines.join("\n")).toContain("household restore refused");
    for (const line of lines)
      for (const value of [privateNote, privateEndpoint, privateKey, blob])
        expect(line).not.toContain(value);
  });
});

describe("Worker — no deployed route or method replaces a household's data (plan J1.16)", () => {
  // The import is a method of the restore entry's household only (runtime/restore-local.ts), which
  // `pnpm restore:local` starts locally: the deployed class (wrangler.jsonc → worker.ts) lacks it.
  it("the deployed household has no import method", async () => {
    await fillSource("deployed-source");
    const exported = await exportOf("deployed-source");
    const stub = household("deployed-target");
    const call: unknown = Reflect.get(stub, "importHousehold");
    if (typeof call !== "function") throw new TypeError("not an RPC stub");

    await expect(
      Promise.resolve(Reflect.apply(call, stub, [exported])),
    ).rejects.toThrow(/does not implement "importHousehold"/);
  });

  // The Worker serves `/api/*` itself and hands every other path to the static assets (ASSETS,
  // absent from the test pool), which hold no household data.
  it("no API request to the deployed Worker changes the development household", async () => {
    // An export the development household would accept: its own tables only, with rows.
    await runInDurableObject(household("source-for-worker"), (_i, state) => {
      state.storage.sql.exec(
        "INSERT INTO notifications_push_subscriptions (endpoint, p256dh, auth) VALUES (?, ?, 'auth-w')",
        privateEndpoint,
        privateKey,
      );
    });
    const exported = await exportOf("source-for-worker");
    const before = await exportOf("development");
    expect(exported).not.toBe(before);
    const paths = [
      "/api/restore",
      "/api/import",
      "/api/export",
      "/api/v1/restore",
      "/api/v1/import",
      "/api/v1/export",
    ];

    const statuses = await Promise.all(
      paths.flatMap((path) =>
        ["POST", "PUT"].map(async (method) => {
          const response = await exports.default.fetch(`${site}${path}`, {
            method,
            body: exported,
            headers: {
              Origin: site,
              "Content-Type": "application/json",
              Authorization: "Bearer fake-export-secret",
            },
          });
          await response.text();
          return response.status;
        }),
      ),
    );

    expect(statuses).toHaveLength(paths.length * 2);

    expect(await exportOf("development")).toBe(before);
  });
});
