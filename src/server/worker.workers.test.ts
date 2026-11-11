import { env, exports } from "cloudflare:workers";
import { Schema } from "effect";
import { describe, expect, it, vi } from "vitest";
import { Health } from "../contracts/api";
import * as api from "./interface/api";

// Plan J1.6; contract src/contracts/api.ts (J1.5); technique-v2 §4.2, §6.1, §10.2.
describe("worker in the Workers runtime — the API is served by the Household Durable Object", () => {
  it("answers GET /api/v1/health with 200 and a JSON health report whose status is ok", async () => {
    const response = await exports.default.fetch(
      "https://deux-places.test/api/v1/health",
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toMatch(
      /^application\/json\b/,
    );
    const health = Schema.decodeUnknownSync(Health)(await response.json());
    expect(health.status).toBe("ok");
  });

  // §6.2: an absent resource is a 404. Its problem document (type, Content-Type) comes with the
  // Problem Details middleware in J2.6; until then only the status is guaranteed.
  it("answers 404 for a route the API does not define under /api/v1/", async () => {
    const response = await exports.default.fetch(
      "https://deux-places.test/api/v1/unknown",
    );

    expect(response.status).toBe(404);
  });
});

// Runs inside workerd. `exports.default` calls the Worker directly: the test project has no
// assets directory, so static-asset routing (`run_worker_first`, SPA fallback) is not involved.
describe("worker in the Workers runtime — a request no route handles gets a not-found problem (technique-v2 §6.2)", () => {
  it("answers 404 with an RFC 9457 problem document", async () => {
    const response = await exports.default.fetch(
      "https://deux-places.test/api/x",
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toBe(
      "application/problem+json",
    );
    expect(await response.json()).toStrictEqual({
      type: "/problems/not-found",
      title: "Not Found",
      status: 404,
    });
  });
});

// technique-v2 §10.2: the object builds its runtime once, not per request.
describe("Household in the Workers runtime — its API handler is built once per object", () => {
  it("builds it once for successive requests to one household, and once more for another household", async () => {
    const built = vi.spyOn(api, "makeApiHandler");
    // Local workerd has no jurisdictions: the tests run with DURABLE_OBJECT_JURISDICTION=none.
    const households = env.Household;
    const health = "https://deux-places.test/api/v1/health";
    try {
      const first = households.get(households.idFromName("built-once-first"));
      expect((await first.fetch(health)).status).toBe(200);
      expect((await first.fetch(health)).status).toBe(200);

      expect(built).toHaveBeenCalledTimes(1);

      const second = households.get(households.idFromName("built-once-second"));
      expect((await second.fetch(health)).status).toBe(200);

      expect(built).toHaveBeenCalledTimes(2);
    } finally {
      built.mockRestore();
    }
  });
});
