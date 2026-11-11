/// <reference types="@cloudflare/vitest-plugin/types" />
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
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
    ]);
  });

  // §10.2: migrations run once when the object starts, never per request.
  it("migrates once per start, not per request, and applies nothing when it starts again", async () => {
    const migrate = vi.spyOn(migrations, "migrateHousehold");
    try {
      const stub = household("migrations-once-per-start");
      expect(await healthStatus(stub)).toBe(200);
      expect(await healthStatus(stub)).toBe(200);

      expect(migrate).toHaveBeenCalledTimes(1);

      await evictDurableObject(stub);
      expect(await healthStatus(stub)).toBe(200);

      expect(migrate).toHaveBeenCalledTimes(2);
      const applied = await Promise.all(
        migrate.mock.results.map((result) => result.value),
      );
      expect(applied).toStrictEqual([[[1, "baseline"]], []]);
    } finally {
      migrate.mockRestore();
    }
  });
});
