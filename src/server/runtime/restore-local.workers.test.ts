/// <reference types="@cloudflare/vitest-plugin/types" />
import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { DateTime } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Household as DeployedHousehold } from "./household";
import type { ImportOutcome } from "./import";
import restoreEntry, { Household as RestoreHousehold } from "./restore-local";

// Plan J1.16: the Worker entry that `pnpm restore:local` starts locally (scripts/restore-local.mjs)
// restores the posted export into the fixed development household (plan J1.6, until J3.6), the one
// worker.ts serves to `pnpm dev`, and answers 200 { restored } or 422 { refused }.
const site = "http://127.0.0.1:5173";

afterEach(() => {
  vi.useRealTimers();
});

// Stand-in for the Household namespace binding (a platform border): it records the household asked
// for and the text the household receives, and answers with `outcome`.
const fakeHouseholds = (outcome: ImportOutcome) => {
  const asked = { names: [] as string[], received: [] as string[] };
  const namespace = {
    idFromName(name: string): DurableObjectId {
      asked.names.push(name);
      return {
        name,
        toString: () => name,
        equals: (other) => other.name === name,
      };
    },
    get(_id: DurableObjectId) {
      return {
        importHousehold(exported: string) {
          asked.received.push(exported);
          return Promise.resolve(outcome);
        },
      };
    },
  };
  return { namespace, asked };
};

const post = (body: string, path = "/restore") =>
  new Request(`${site}${path}`, { method: "POST", body });

const answerOf = async (response: Response) => ({
  status: response.status,
  body: response.status === 404 ? await response.text() : await response.json(),
});

describe("restore entry — POST /restore reaches the development household (plan J1.16)", () => {
  const exported = '{"version":1,"tables":[]}';

  it("hands the file, unchanged, to the development household and answers 200 with what it restored", async () => {
    const households = fakeHouseholds({ restored: { tables: 2, rows: 7 } });

    const response = await restoreEntry.fetch(post(exported), {
      Household: households.namespace,
    });

    expect(await answerOf(response)).toStrictEqual({
      status: 200,
      body: { restored: { tables: 2, rows: 7 } },
    });
    // The name worker.ts gives its fixed development household (worker.test.ts, plan J1.6).
    expect(households.asked).toStrictEqual({
      names: ["development"],
      received: [exported],
    });
  });

  it("answers 422 with the household's reason when it refuses the file", async () => {
    const households = fakeHouseholds({ refused: "unknown table x" });

    const response = await restoreEntry.fetch(post(exported), {
      Household: households.namespace,
    });

    expect(await answerOf(response)).toStrictEqual({
      status: 422,
      body: { refused: "unknown table x" },
    });
  });

  it("answers 404 to any other path or method, and reaches no household", async () => {
    const households = fakeHouseholds({ restored: { tables: 0, rows: 0 } });

    const answers = await Promise.all(
      [
        post(exported, "/import"),
        post(exported, "/api/restore"),
        new Request(`${site}/restore`),
        new Request(`${site}/restore`, { method: "PUT", body: exported }),
      ].map(
        async (request) =>
          (
            await restoreEntry.fetch(request, {
              Household: households.namespace,
            })
          ).status,
      ),
    );

    expect(answers).toStrictEqual([404, 404, 404, 404]);
    expect(households.asked).toStrictEqual({ names: [], received: [] });
  });
});

const household = (name: string) =>
  env.Household.get(env.Household.idFromName(name));

describe("restore entry — its household's importHousehold restores into its own storage (plan J1.16)", () => {
  // The entry's household is the deployed one (migrations at start, API, alarm) plus this method:
  // on an empty local state, its migrations must run before the import.
  it("is the deployed household, extended", () => {
    expect(Object.getPrototypeOf(RestoreHousehold)).toBe(DeployedHousehold);
  });

  // The pool binds the deployed class; the entry's method runs on such an object, as it would on
  // the entry's own subclass, which differs from it by this method only.
  it("replaces the household's rows with the export's", async () => {
    vi.setSystemTime(
      DateTime.toEpochMillis(DateTime.makeUnsafe("2026-11-13T20:45:30.125Z")),
    );
    await runInDurableObject(household("entry-source"), (_i, state) => {
      state.storage.sql.exec(
        "INSERT INTO notifications_push_subscriptions (endpoint, p256dh, auth) VALUES ('https://push.example.test/entry', 'p256dh-entry', 'auth-entry')",
      );
    });
    const exported = await household("entry-source").exportHousehold();

    const importHousehold: unknown = Reflect.get(
      RestoreHousehold.prototype,
      "importHousehold",
    );
    if (typeof importHousehold !== "function")
      throw new TypeError("the restore entry's household has no import");

    const outcome = await runInDurableObject(
      household("entry-target"),
      (instance) =>
        Promise.resolve<unknown>(
          Reflect.apply(importHousehold, instance, [exported]),
        ),
    );

    expect(outcome).toStrictEqual({ restored: { tables: 2, rows: 1 } });
    expect(await household("entry-target").exportHousehold()).toBe(exported);
  });
});
