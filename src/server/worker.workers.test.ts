import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

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
