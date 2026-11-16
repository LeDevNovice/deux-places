/// <reference types="@cloudflare/vitest-plugin/types" />
import {
  evictDurableObject,
  runDurableObjectAlarm,
  runInDurableObject,
} from "cloudflare:test";
import { env, withEnv } from "cloudflare:workers";
import { DateTime } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as api from "../interface/api";
import { Household } from "./household";
import * as migrations from "./migrations";

// Plan J1.7; technique-v2 §7.2 (migrations applied at the first wake, before any request) and
// §10.2. The migrator records applied migrations in `effect_sql_migrations` (its documented
// default); migration 0001 is the household's baseline.
const health = "https://deux-places.test/api/v1/health";

// Local workerd has no jurisdictions: the tests run with DURABLE_OBJECT_JURISDICTION=none.
const household = (name: string) =>
  env.Household.get(env.Household.idFromName(name));

// Reads the body: an unread response keeps the request in flight, and an eviction waits for it.
const healthStatus = async (stub: DurableObjectStub) => {
  const response = await stub.fetch(health);
  await response.text();
  return response.status;
};

const importHousehold = () => import("./household");

const recordedMigrations = (stub: DurableObjectStub) =>
  runInDurableObject(stub, (_instance, state) =>
    state.storage.sql
      .exec("SELECT migration_id, name FROM effect_sql_migrations")
      .toArray(),
  );

describe("Household in the Workers runtime — SQLite migrations run when the object starts", () => {
  it("has recorded migration 0001 exactly once after its first request", async () => {
    const stub = household("migrations-first-request");

    expect(await healthStatus(stub)).toBe(200);

    expect(await recordedMigrations(stub)).toStrictEqual([
      { migration_id: 1, name: "baseline" },
      { migration_id: 2, name: "deadlines" },
      { migration_id: 3, name: "notifications_push_subscriptions" },
    ]);
  });

  it("restarts after an eviction without applying migration 0001 again", async () => {
    const stub = household("migrations-after-eviction");
    expect(await healthStatus(stub)).toBe(200);
    const before = await runInDurableObject(stub, (instance) => instance);

    await evictDurableObject(stub);

    expect(await healthStatus(stub)).toBe(200);
    const after = await runInDurableObject(stub, (instance) => instance);
    expect(after).not.toBe(before);
    expect(await recordedMigrations(stub)).toStrictEqual([
      { migration_id: 1, name: "baseline" },
      { migration_id: 2, name: "deadlines" },
      { migration_id: 3, name: "notifications_push_subscriptions" },
    ]);
  });

  // §10.2: migrations run once when the object starts, never per request; and the migrator runs
  // only when a migration is missing (plan J1.21), so not when the object starts again.
  it("migrates once per start, not per request, and does not run the migrator when it starts again", async () => {
    const migrate = vi.spyOn(migrations, "migrateHousehold");
    try {
      const stub = household("migrations-once-per-start");
      expect(await healthStatus(stub)).toBe(200);
      expect(await healthStatus(stub)).toBe(200);

      expect(migrate).toHaveBeenCalledTimes(1);

      await evictDurableObject(stub);
      expect(await healthStatus(stub)).toBe(200);

      expect(migrate).toHaveBeenCalledTimes(1);
      const applied = await Promise.all(
        migrate.mock.results.map((result) => result.value),
      );
      expect(applied).toStrictEqual([
        [
          [1, "baseline"],
          [2, "deadlines"],
          [3, "notifications_push_subscriptions"],
        ],
      ]);
    } finally {
      migrate.mockRestore();
    }
  });
});

// Plan J1.21; technique-v2 §10.2 (the migrator runs only when the recorded schema is not current).
// Effect's migrator applies every migration whose id is above the largest id recorded in
// `effect_sql_migrations`, after creating that table when it is absent (`effect/sql` Migrator,
// `run`): the household skips it exactly when it would apply nothing.
const schemaOf = (stub: DurableObjectStub) =>
  runInDurableObject(stub, (_instance, state) =>
    state.storage.sql
      .exec(
        "SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name",
      )
      .toArray(),
  );

const recordOf = (stub: DurableObjectStub) =>
  runInDurableObject(stub, (_instance, state) =>
    state.storage.sql
      .exec(
        "SELECT migration_id, name, created_at FROM effect_sql_migrations ORDER BY migration_id",
      )
      .toArray(),
  );

const tableNames = async (stub: DurableObjectStub) =>
  (await schemaOf(stub))
    .filter((entry) => entry["type"] === "table")
    .map((entry) => entry["name"]);

// Starts a household, then leaves its storage as `change` makes it, and evicts it: its next event
// starts it again on that storage.
const restartedAfter = async (
  name: string,
  change: (sql: SqlStorage) => void,
) => {
  const stub = household(name);
  expect(await healthStatus(stub)).toBe(200);
  await runInDurableObject(stub, (_instance, state) =>
    change(state.storage.sql),
  );
  await evictDurableObject(stub);
  return stub;
};

describe("Household in the Workers runtime — the migrator runs only when a migration is missing", () => {
  it("does not run the migrator on a household whose every migration is recorded, and leaves its schema and record as they were", async () => {
    const stub = household("schema-current");
    expect(await healthStatus(stub)).toBe(200);
    const schema = await schemaOf(stub);
    const record = await recordOf(stub);
    expect(record.map((row) => row["migration_id"])).toStrictEqual([1, 2, 3]);
    await evictDurableObject(stub);
    const migrate = vi.spyOn(migrations, "migrateHousehold");
    try {
      expect(await healthStatus(stub)).toBe(200);

      expect(migrate).not.toHaveBeenCalled();
      expect(await schemaOf(stub)).toStrictEqual(schema);
      expect(await recordOf(stub)).toStrictEqual(record);
    } finally {
      migrate.mockRestore();
    }
  });

  // A deploy rolled back to an older code: the migrator would apply nothing either.
  it("does not run the migrator on a household whose record is ahead of its code", async () => {
    const stub = await restartedAfter("schema-ahead", (sql) =>
      sql.exec(
        "INSERT INTO effect_sql_migrations (migration_id, name) VALUES (4, 'from_a_later_deploy')",
      ),
    );
    const migrate = vi.spyOn(migrations, "migrateHousehold");
    try {
      expect(await healthStatus(stub)).toBe(200);

      expect(migrate).not.toHaveBeenCalled();
      expect(
        (await recordOf(stub)).map((row) => row["migration_id"]),
      ).toStrictEqual([1, 2, 3, 4]);
    } finally {
      migrate.mockRestore();
    }
  });

  it("runs the migrator once on a new household, which has no record table yet, and applies every migration", async () => {
    const migrate = vi.spyOn(migrations, "migrateHousehold");
    try {
      const stub = household("schema-new");
      expect(await healthStatus(stub)).toBe(200);

      expect(migrate).toHaveBeenCalledTimes(1);
      expect(await migrate.mock.results[0]?.value).toStrictEqual([
        [1, "baseline"],
        [2, "deadlines"],
        [3, "notifications_push_subscriptions"],
      ]);
      expect(await tableNames(stub)).toEqual(
        expect.arrayContaining([
          "effect_sql_migrations",
          "deadlines",
          "notifications_push_subscriptions",
        ]),
      );
    } finally {
      migrate.mockRestore();
    }
  });

  // The household as the deploy of plan J1.12 left it.
  it("runs the migrator on a household left at 0002, which applies 0003 only", async () => {
    const stub = await restartedAfter("schema-left-at-0002", (sql) => {
      sql.exec("DROP TABLE notifications_push_subscriptions");
      sql.exec("DELETE FROM effect_sql_migrations WHERE migration_id >= 3");
    });
    const migrate = vi.spyOn(migrations, "migrateHousehold");
    try {
      expect(await healthStatus(stub)).toBe(200);

      expect(migrate).toHaveBeenCalledTimes(1);
      expect(await migrate.mock.results[0]?.value).toStrictEqual([
        [3, "notifications_push_subscriptions"],
      ]);
      expect(
        (await recordOf(stub)).map((row) => [row["migration_id"], row["name"]]),
      ).toStrictEqual([
        [1, "baseline"],
        [2, "deadlines"],
        [3, "notifications_push_subscriptions"],
      ]);
      expect(await tableNames(stub)).toContain(
        "notifications_push_subscriptions",
      );
    } finally {
      migrate.mockRestore();
    }
  });

  // The record table exists but holds no id: the largest recorded id is 0 for the migrator.
  it("runs the migrator on a household whose record table holds no migration", async () => {
    const stub = await restartedAfter("schema-empty-record", (sql) => {
      sql.exec("DROP TABLE deadlines");
      sql.exec("DROP TABLE notifications_push_subscriptions");
      sql.exec("DELETE FROM effect_sql_migrations");
    });
    const migrate = vi.spyOn(migrations, "migrateHousehold");
    try {
      expect(await healthStatus(stub)).toBe(200);

      expect(migrate).toHaveBeenCalledTimes(1);
      expect(await migrate.mock.results[0]?.value).toStrictEqual([
        [1, "baseline"],
        [2, "deadlines"],
        [3, "notifications_push_subscriptions"],
      ]);
    } finally {
      migrate.mockRestore();
    }
  });

  // §7.2: no request is served before the migrations; a failure resets the object (J1.7). Left at
  // 0002 with 0003's table already there, the real migration 0003 fails at every start.
  it("serves no request when a missing migration fails", async () => {
    const stub = await restartedAfter("schema-failing-migration", (sql) =>
      sql.exec("DELETE FROM effect_sql_migrations WHERE migration_id >= 3"),
    );

    await expect(stub.fetch(health)).rejects.toThrow(
      /Migration "3_notifications_push_subscriptions" failed/,
    );
    await expect(stub.fetch(health)).rejects.toThrow(
      /Migration "3_notifications_push_subscriptions" failed/,
    );
  });
});

// Plan J1.22; technique-v2 §10.2 (amended 2026-11-15): the object builds its API handler once, at
// its first request; an alarm or an export does not build it. Building it costs CPU under the
// 10 ms limit (checkpoint A, §7.6, lever 4). `makeApiHandler` is spied on and still called.
describe("Household in the Workers runtime — its API handler is built at its first request", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Far ahead: the alarm only runs when the test runs it, and finds no deadline due.
  const someDay = DateTime.toEpochMillis(
    DateTime.makeUnsafe("2099-01-01T00:00:00Z"),
  );

  it("does not build it for an alarm that starts the object", async () => {
    const stub = household("handler-alarm");
    await runInDurableObject(stub, (_instance, state) =>
      state.storage.setAlarm(someDay),
    );
    await evictDurableObject(stub);
    const built = vi.spyOn(api, "makeApiHandler");

    expect(await runDurableObjectAlarm(stub)).toBe(true);

    expect(built).not.toHaveBeenCalled();
  });

  it("does not build it for an export on a new object", async () => {
    const built = vi.spyOn(api, "makeApiHandler");

    const exported = await household("handler-export").exportHousehold();

    expect(JSON.parse(exported)).toMatchObject({ version: 1 });
    expect(built).not.toHaveBeenCalled();
  });

  it("does not build it when the object starts, then builds it once for its first two requests", async () => {
    const built = vi.spyOn(api, "makeApiHandler");
    const stub = household("handler-first-request");

    await runInDurableObject(stub, () => undefined);
    expect(built).not.toHaveBeenCalled();

    expect(await healthStatus(stub)).toBe(200);
    expect(built).toHaveBeenCalledOnce();

    expect(await healthStatus(stub)).toBe(200);
    expect(built).toHaveBeenCalledOnce();
  });

  it("builds it once for two first requests sent together", async () => {
    const built = vi.spyOn(api, "makeApiHandler");
    const stub = household("handler-simultaneous");

    expect(
      await Promise.all([healthStatus(stub), healthStatus(stub)]),
    ).toStrictEqual([200, 200]);

    expect(built).toHaveBeenCalledOnce();
  });

  // The live connection is a WebSocket answered before the API (live.ts): it needs no handler.
  it("does not build it to open the live connection", async () => {
    const built = vi.spyOn(api, "makeApiHandler");
    const site = "https://deux-places.test";

    const response = await household("handler-live").fetch(
      `${site}/api/v1/live`,
      { headers: { Upgrade: "websocket", Origin: site } },
    );
    const socket = response.webSocket;
    socket?.accept();
    socket?.close();

    expect(response.status).toBe(101);
    expect(built).not.toHaveBeenCalled();
  });

  // Plan J1.23: the object no longer reads the `env` it is built with: the configuration is the
  // isolate's, read once when the module loads (worker.workers.test.ts). Built with an `env` whose
  // VAPID key is refused, it still answers.
  it("does not read its configuration from the env it is built with", async () => {
    const status = await runInDurableObject(
      household("handler-own-env"),
      async (_instance, state) => {
        // The generated `Env` declares no secret (worker-configuration.d.ts is built without them).
        const object = new Household(
          state,
          Object.assign({}, env, { VAPID_PUBLIC_KEY: "not-a-key" }),
        );
        const response = await object.fetch(new Request(health));
        await response.text();
        return response.status;
      },
    );

    expect(status).toBe(200);
  });

  // As before J1.22 and J1.23: a refused configuration fails every request the object is asked (the
  // Worker answers its 500 problem first: worker.test.ts, worker.workers.test.ts). The refusal is now
  // the isolate's: a fresh module graph loaded under `withEnv` (cloudflare:workers) holds it.
  it("fails every request when the isolate's configuration is refused, and logs the refusal once", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.resetModules();
    // The import starts inside `withEnv`: the module's top level reads this `env`.
    let loading: ReturnType<typeof importHousehold> | undefined;
    withEnv(Object.assign({}, env, { VAPID_PUBLIC_KEY: "not-a-key" }), () => {
      loading = importHousehold();
    });
    if (loading === undefined)
      throw new Error("withEnv did not run the import");
    const refused = await loading;

    await runInDurableObject(
      household("handler-refused-configuration"),
      async (_instance, state) => {
        const object = new refused.Household(state, env);

        await expect(object.fetch(new Request(health))).rejects.toThrow(
          /VAPID_PUBLIC_KEY/,
        );
        await expect(object.fetch(new Request(health))).rejects.toThrow(
          /VAPID_PUBLIC_KEY/,
        );
      },
    );

    // Written when the object is built, inside the invocation that starts it (J1.23).
    const refusals = log.mock.calls
      .map(([line]) => String(line))
      .filter((line) => line.includes('"level":"ERROR"'));
    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toContain("VAPID_PUBLIC_KEY");
    expect(refusals[0]).not.toContain("not-a-key");
  });
});
