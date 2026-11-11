import { env, exports } from "cloudflare:workers";
import { Schema } from "effect";
import { describe, expect, it, vi } from "vitest";
import { Health } from "../contracts/api";
import * as api from "./interface/api";

// technique-v2 §13.3, copied directive by directive; directive order carries no meaning.
const policyOf13_3 = {
  "default-src": ["'self'"],
  "img-src": ["'self'", "https://image.tmdb.org", "data:"],
  "connect-src": ["'self'"],
  "object-src": ["'none'"],
  "base-uri": ["'none'"],
  "frame-ancestors": ["'none'"],
};

// Reads a Content-Security-Policy header into { directive: sources }; null when it is absent.
const policyOf = (response: Response) => {
  const header = response.headers.get("Content-Security-Policy");
  if (header === null) return null;
  return Object.fromEntries(
    header
      .split(";")
      .map((directive) => directive.trim().split(/\s+/))
      .filter(([name]) => name !== "")
      .map(([name, ...sources]) => [name, sources]),
  );
};

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

  // Plan J1.8: the household's answer reaches the phone with the §13.3 policy.
  it("answers GET /api/v1/health with the Content-Security-Policy of technique-v2 §13.3", async () => {
    const response = await exports.default.fetch(
      "https://deux-places.test/api/v1/health",
    );
    await response.text();

    expect(policyOf(response)).toStrictEqual(policyOf13_3);
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

// One line of Effect's JSON logger: the field the test reads.
const LogLine = Schema.Struct({
  annotations: Schema.Record(Schema.String, Schema.Unknown),
});

// Plan J1.8; technique-v2 §12.1: the Worker and the household each write one JSON line per
// request, and both carry the Worker's request id.
describe("worker in the Workers runtime — one request id on the Worker's and the household's log lines", () => {
  it("writes two JSON lines for GET /api/v1/health, with the same request id", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const response = await exports.default.fetch(
        "https://deux-places.test/api/v1/health",
      );
      await response.text();

      const lines = log.mock.calls.map(([line]) =>
        Schema.decodeUnknownSync(LogLine)(JSON.parse(String(line))),
      );
      expect(lines.map((line) => line.annotations)).toMatchObject([
        { "http.url": "/api/v1/health", "http.status": 200 },
        { "http.url": "/api/v1/health", "http.status": 200 },
      ]);
      const [household, worker] = lines.map(
        (line) => line.annotations["requestId"],
      );
      expect(worker).toMatch(/^[0-9a-f-]{36}$/);
      expect(household).toBe(worker);
    } finally {
      log.mockRestore();
    }
  });
});
