/// <reference types="@cloudflare/vitest-plugin/types" />
import { runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { DateTime, Redacted, Schema } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { presentsExportSecret } from "./export";

// Plan J1.15; technique-v2 §12.4 (a route protected by a secret, called weekly by GitHub Actions),
// §10.1 (the export secret is a Cloudflare secret), §12.1 (logs never carry a secret nor content),
// §13.3 (secrets never in the repository).
const site = "https://deux-places.test";
const exportUrl = `${site}/api/export`;

// The configured secret: the visibly fake EXPORT_SECRET that vitest.config.ts gives this project.
const secret = (() => {
  const value: unknown = Reflect.get(env, "EXPORT_SECRET");
  if (typeof value !== "string" || value.length < 2)
    throw new TypeError("the workers project must set EXPORT_SECRET");
  return value;
})();

// Same length, last character changed.
const sameLengthWrong = `${secret.slice(0, -1)}${secret.endsWith("x") ? "y" : "x"}`;

const askExport = (headers: Record<string, string> = {}) =>
  exports.default.fetch(exportUrl, { headers });

const withBearer = (token: string) =>
  askExport({ Authorization: `Bearer ${token}` });

// Local workerd has no jurisdictions: the tests run with DURABLE_OBJECT_JURISDICTION=none.
const household = (name: string) =>
  env.Household.get(env.Household.idFromName(name));

const instant = DateTime.toEpochMillis(
  DateTime.makeUnsafe("2026-11-13T20:45:30.125Z"),
);

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// RFC 9110 §15.5.2: a 401 carries WWW-Authenticate; RFC 6750 §3: the Bearer scheme. RFC 9457
// problem with `about:blank` (§6.2 has no type for it), like the refused `Origin` (J1.14).
const refused = {
  status: 401,
  wwwAuthenticate: "Bearer",
  contentType: "application/problem+json",
  body: { type: "about:blank", title: "Unauthorized", status: 401 },
};

const answerOf = async (response: Response) => ({
  status: response.status,
  wwwAuthenticate: response.headers.get("WWW-Authenticate"),
  contentType: response.headers.get("Content-Type"),
  body: await response.json(),
});

describe("GET /api/export — refused without the export secret (plan J1.15, technique-v2 §12.4)", () => {
  it("answers 401 without an Authorization header", async () => {
    expect(await answerOf(await askExport())).toStrictEqual(refused);
  });

  it("answers 401 with a wrong secret of the same length", async () => {
    expect(sameLengthWrong).toHaveLength(secret.length);
    expect(sameLengthWrong).not.toBe(secret);

    expect(await answerOf(await withBearer(sameLengthWrong))).toStrictEqual(
      refused,
    );
  });

  it("answers 401 with a wrong secret of another length, a prefix of the secret included", async () => {
    const answers = await Promise.all(
      [`${secret}x`, secret.slice(0, -1), secret.slice(0, 1)].map(
        async (token) => answerOf(await withBearer(token)),
      ),
    );

    expect(answers).toStrictEqual([refused, refused, refused]);
  });

  it("answers 401 to the right secret under another scheme or without a scheme", async () => {
    const answers = await Promise.all(
      [`Basic ${secret}`, secret, "Bearer", "Bearer "].map(
        async (authorization) =>
          answerOf(await askExport({ Authorization: authorization })),
      ),
    );

    expect(answers).toStrictEqual([refused, refused, refused, refused]);
  });

  it("never accepts an empty token, even when the configured secret is empty", () => {
    const empty = Redacted.make("");
    for (const authorization of [null, "", "Bearer", "Bearer ", "Bearer x"])
      expect(presentsExportSecret(authorization, empty)).toBe(false);
  });
});

const decode = (bytes: unknown) => {
  if (!(bytes instanceof Uint8Array)) throw new TypeError("not bytes");
  return new TextDecoder().decode(bytes);
};

describe("GET /api/export — the secret is compared in constant time (plan J1.15)", () => {
  // Cloudflare's own recipe (docs, "Using timingSafeEqual"): `timingSafeEqual` throws on buffers of
  // different lengths, so the token is then compared with itself and the result negated.
  it("compares with crypto.subtle.timingSafeEqual when the lengths are equal", async () => {
    const compare = vi.spyOn(crypto.subtle, "timingSafeEqual");

    const response = await withBearer(sameLengthWrong);
    await response.text();

    expect(response.status).toBe(401);
    expect(compare).toHaveBeenCalledTimes(1);
    const [presented, expected] = compare.mock.calls[0] ?? [];
    expect(decode(presented)).toBe(sameLengthWrong);
    expect(decode(expected)).toBe(secret);
  });

  it("still compares with crypto.subtle.timingSafeEqual when the lengths differ", async () => {
    const compare = vi.spyOn(crypto.subtle, "timingSafeEqual");

    const response = await withBearer(`${secret}x`);
    await response.text();

    expect(response.status).toBe(401);
    expect(compare).toHaveBeenCalledTimes(1);
  });

  it("answers 200 when timingSafeEqual says the secret is the right one", async () => {
    const compare = vi.spyOn(crypto.subtle, "timingSafeEqual");

    const response = await withBearer(secret);
    await response.text();

    expect(response.status).toBe(200);
    expect(compare).toHaveBeenCalledTimes(1);
  });
});

// Rows written straight to the household's SQLite, in an order the export must not keep.
const seed = (name: string) =>
  runInDurableObject(household(name), (_instance, state) => {
    const sql = state.storage.sql;
    sql.exec(
      "INSERT INTO deadlines (kind, subject, due_at) VALUES ('notifications.test-notification', 'household', 1794500000000), ('evening.swap-end', '2026-11-13', 1794600000000)",
    );
    sql.exec(
      "INSERT INTO notifications_push_subscriptions (endpoint, p256dh, auth) VALUES ('https://push.example.test/b', 'p256dh-b', 'auth-b'), ('https://push.example.test/a', 'p256dh-a', 'auth-a')",
    );
    // A table a later migration could add, with what the household's tables cannot hold yet: a
    // BLOB, a NULL and a REAL. AUTOINCREMENT makes SQLite create its own `sqlite_sequence`.
    sql.exec(
      "CREATE TABLE fixture_values (id INTEGER PRIMARY KEY AUTOINCREMENT, data BLOB, note TEXT, ratio REAL)",
    );
    sql.exec(
      "INSERT INTO fixture_values (id, data, note, ratio) VALUES (2, X'00FF10', NULL, 0.5), (1, NULL, 'first', -2.25)",
    );
    // Without a primary key, the rows are stored in the order they were written; two share a word.
    sql.exec(
      "CREATE TABLE fixture_words (word TEXT NOT NULL, rank INTEGER NOT NULL)",
    );
    sql.exec(
      "INSERT INTO fixture_words (word, rank) VALUES ('b', 1), ('a', 2), ('a', 1)",
    );
    // Tables whose name starts with `_` are the platform's (`_cf_KV` holds the key-value API).
    state.storage.kv.put("kept-out", "of the export");
    sql.exec("CREATE TABLE __fixture_hidden (v TEXT)");
    sql.exec("INSERT INTO __fixture_hidden VALUES ('hidden')");
  });

// Written from technique-v2 §7.1, §7.2 and the rows above, sorted by every column: never from the
// export's own output.
const expectedExport = {
  version: 1,
  exportedAt: "2026-11-13T20:45:30.125Z",
  migrations: [
    { id: 1, name: "baseline" },
    { id: 2, name: "deadlines" },
    { id: 3, name: "notifications_push_subscriptions" },
  ],
  tables: [
    {
      name: "deadlines",
      columns: ["kind", "subject", "due_at"],
      rows: [
        ["evening.swap-end", "2026-11-13", 1794600000000],
        ["notifications.test-notification", "household", 1794500000000],
      ],
    },
    {
      name: "fixture_values",
      columns: ["id", "data", "note", "ratio"],
      rows: [
        [1, null, "first", -2.25],
        [2, { base64: "AP8Q" }, null, 0.5],
      ],
    },
    {
      name: "fixture_words",
      columns: ["word", "rank"],
      rows: [
        ["a", 1],
        ["a", 2],
        ["b", 1],
      ],
    },
    {
      name: "notifications_push_subscriptions",
      columns: ["endpoint", "p256dh", "auth"],
      rows: [
        ["https://push.example.test/a", "p256dh-a", "auth-a"],
        ["https://push.example.test/b", "p256dh-b", "auth-b"],
      ],
    },
  ],
};

describe("GET /api/export — the development household's export with the secret (plan J1.15)", () => {
  // The Worker reaches the fixed development household until J3.6 (plan J1.6).
  it("answers 200 with the development household's JSON export", async () => {
    await seed("development");
    vi.setSystemTime(instant);

    const response = await withBearer(secret);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(body).toBe(JSON.stringify(expectedExport));
  });

  // The export only reads: another method, even with the secret, is a route the Worker lacks.
  it("serves only GET: another method with the secret gets the not-found problem", async () => {
    const response = await exports.default.fetch(exportUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, Origin: site },
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toStrictEqual({
      type: "/problems/not-found",
      title: "Not Found",
      status: 404,
    });
  });

  // RFC 9110 §11.1: the authentication scheme is case-insensitive.
  it("accepts the Bearer scheme in any case", async () => {
    const response = await askExport({ Authorization: `bearer ${secret}` });
    await response.text();

    expect(response.status).toBe(200);
  });
});

// One line of Effect's JSON logger: the field the test reads.
const LogLine = Schema.Struct({
  annotations: Schema.Record(Schema.String, Schema.Unknown),
});

// The part of an export the tests read without copying it.
const ExportedTables = Schema.Struct({
  tables: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      rows: Schema.Array(Schema.Array(Schema.Unknown)),
    }),
  ),
});
const tablesIn = (exported: string) =>
  Schema.decodeUnknownSync(ExportedTables)(JSON.parse(exported)).tables;

// Every console channel the Worker or the household could write to.
const consoleLines = () => {
  const lines: string[] = [];
  for (const channel of ["log", "info", "warn", "error", "debug"] as const)
    vi.spyOn(console, channel).mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
  return lines;
};

describe("GET /api/export — the secret never leaves the request (technique-v2 §12.1, §13.3)", () => {
  it("writes it in no response and no log line, after refusals as after a success", async () => {
    const lines = consoleLines();
    const responses = await Promise.all([
      askExport({ Authorization: `Basic ${secret}` }),
      withBearer(sameLengthWrong),
      withBearer(`${secret}x`),
      withBearer(secret),
    ]);
    const seen = await Promise.all(
      responses.map(
        async (response) =>
          `${[...response.headers].join("\n")}\n${await response.text()}`,
      ),
    );

    expect(responses.map((response) => response.status)).toStrictEqual([
      401, 401, 401, 200,
    ]);
    expect(lines.length).toBeGreaterThan(0);
    for (const text of [...seen, ...lines]) {
      expect(text).not.toContain(secret);
      expect(text).not.toContain(sameLengthWrong);
    }
  });

  it("logs the method, the path and the status of each request, nothing more", async () => {
    const lines = consoleLines();

    await (await withBearer(sameLengthWrong)).text();
    await (await withBearer(secret)).text();

    const annotations = lines.map(
      (line) => Schema.decodeUnknownSync(LogLine)(JSON.parse(line)).annotations,
    );
    expect(annotations).toMatchObject([
      { "http.method": "GET", "http.url": "/api/export", "http.status": 401 },
      { "http.method": "GET", "http.url": "/api/export", "http.status": 200 },
    ]);
    for (const annotation of annotations)
      expect(Object.keys(annotation).toSorted()).toStrictEqual([
        "http.method",
        "http.status",
        "http.url",
        "requestId",
      ]);
  });
});

const tablesOf = (stub: DurableObjectStub) =>
  runInDurableObject(stub, (_instance, state) =>
    state.storage.sql
      .exec<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .toArray()
      .map((row) => row.name),
  );

describe("Household — its export holds every table, row and column (plan J1.15, technique-v2 §7.1, §12.4)", () => {
  it("exports every table with all its rows and columns, sorted, in a versioned envelope", async () => {
    await seed("export-every-table");
    vi.setSystemTime(instant);

    const exported = await household("export-every-table").exportHousehold();

    expect(exported).toBe(JSON.stringify(expectedExport));
  });

  it("leaves out the platform's tables, SQLite's own and the migrations table, which exist", async () => {
    await seed("export-left-out");

    const tables = tablesIn(
      await household("export-left-out").exportHousehold(),
    );

    expect(await tablesOf(household("export-left-out"))).toEqual(
      expect.arrayContaining([
        "_cf_KV",
        "__fixture_hidden",
        "sqlite_sequence",
        "effect_sql_migrations",
      ]),
    );
    expect(tables.map((table) => table.name)).toStrictEqual([
      "deadlines",
      "fixture_values",
      "fixture_words",
      "notifications_push_subscriptions",
    ]);
  });

  it("gives the same export twice when nothing was written in between", async () => {
    await seed("export-twice");
    vi.setSystemTime(instant);
    const stub = household("export-twice");

    expect(await stub.exportHousehold()).toBe(await stub.exportHousehold());
  });

  // A migrated household has no table starting with `_` but the platform's: the application may
  // not create those (SQLITE_AUTH), which is why the export can leave every such name out.
  it("has no table starting with `_` that its migrations created", async () => {
    const stub = household("export-no-underscore-table");
    await (await stub.fetch(`${site}/api/v1/health`)).text();

    const reserved = await runInDurableObject(stub, (_instance, state) => {
      state.storage.kv.put("k", "v");
      return state.storage.sql
        .exec<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND substr(name, 1, 1) = '_'",
        )
        .toArray()
        .map(({ name }) => {
          try {
            state.storage.sql.exec(
              `CREATE TABLE IF NOT EXISTS "${name}" (v TEXT)`,
            );
            return { name, refused: false };
          } catch {
            return { name, refused: true };
          }
        });
    });

    expect(reserved.length).toBeGreaterThan(0);
    for (const table of reserved)
      expect(table).toStrictEqual({ ...table, refused: true });
  });
});

// The concurrent write touches the first and the last exported table at once.
const firstTable = "fixture_first";
const lastTable = "fixture_last";

const twoTables = (stub: DurableObjectStub) =>
  runInDurableObject(stub, (_instance, state) => {
    state.storage.sql.exec(`CREATE TABLE ${firstTable} (v TEXT NOT NULL)`);
    state.storage.sql.exec(`CREATE TABLE ${lastTable} (v TEXT NOT NULL)`);
  });

// A Durable Object lets no other event in during a storage transaction (docs, "transaction()"; probe
// of J1.14: a concurrent request waited for the end of the transaction).
describe("Household — an export is one consistent read (plan J1.15)", () => {
  it("holds a concurrent write entirely or not at all", async () => {
    const stub = household("export-consistent");
    await twoTables(stub);

    const [exported] = await Promise.all([
      stub.exportHousehold(),
      runInDurableObject(stub, (_instance, state) =>
        state.storage.transactionSync(() => {
          state.storage.sql.exec(
            `INSERT INTO ${firstTable} VALUES ('written')`,
          );
          state.storage.sql.exec(`INSERT INTO ${lastTable} VALUES ('written')`);
        }),
      ),
    ]);

    const tables = tablesIn(exported);
    const rowsOf = (name: string) =>
      tables.find((candidate) => candidate.name === name)?.rows;
    expect([rowsOf(firstTable), rowsOf(lastTable)]).toBeOneOf([
      [[], []],
      [[["written"]], [["written"]]],
    ]);
  });

  // The pool cannot send a write in the middle of the export (an object's I/O cannot be used from
  // another context: probes of J1.15), so the transaction itself is observed on the storage API.
  it("reads the whole household inside one storage transaction", async () => {
    const stub = household("export-one-transaction");
    await twoTables(stub);
    const reads = await runInDurableObject(stub, (_instance, state) => {
      const storage = state.storage;
      const seen: { query: string; inTransaction: boolean }[] = [];
      let open = 0;
      const transaction = storage.transaction.bind(storage);
      const transactions = vi
        .spyOn(storage, "transaction")
        .mockImplementation((closure) =>
          transaction(async (txn) => {
            open += 1;
            try {
              return await closure(txn);
            } finally {
              open -= 1;
            }
          }),
        );
      const exec = storage.sql.exec.bind(storage.sql);
      vi.spyOn(storage.sql, "exec").mockImplementation((query, ...bindings) => {
        seen.push({ query, inTransaction: open > 0 });
        return exec(query, ...bindings);
      });
      return {
        seen,
        transactions: () => transactions.mock.calls.length,
      };
    });

    await stub.exportHousehold();

    expect(reads.transactions()).toBe(1);
    expect(reads.seen.map(({ query }) => query).join("\n")).toContain(
      `"${lastTable}"`,
    );
    expect(
      reads.seen.filter(({ inTransaction }) => !inTransaction),
    ).toStrictEqual([]);
  });
});
