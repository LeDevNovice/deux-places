import { beforeEach, describe, expect, it, vi } from "vitest";

// Obviously fake values: the test never sees a real key.
const env = {
  TMDB_API_KEY: "fake-tmdb-api-key",
  VAPID_PUBLIC_KEY: "fake-vapid-public-key",
  VAPID_PRIVATE_KEY: "fake-vapid-private-key",
  BREVO_API_KEY: "fake-brevo-api-key",
  EXPORT_SECRET: "fake-export-secret",
};
const request = new Request("https://deux-places.test/api/x");

// The configuration is built once per isolate (module state), so each test loads a fresh
// Worker module, as a new isolate would.
const freshWorker = async () => {
  vi.resetModules();
  return (await import("./worker")).default;
};

describe("worker — requests no route handles get a not-found problem (technique-v2 §6.2)", () => {
  let worker: Awaited<ReturnType<typeof freshWorker>>;
  beforeEach(async () => {
    worker = await freshWorker();
  });

  it("answers 404", () => {
    const response = worker.fetch(request, env);

    expect(response.status).toBe(404);
  });

  it("is an RFC 9457 problem document", () => {
    const response = worker.fetch(request, env);

    expect(response.headers.get("Content-Type")).toBe(
      "application/problem+json",
    );
  });

  it("carries the not-found type, a title and the same status, and no instance yet", async () => {
    const response = worker.fetch(request, env);

    expect(await response.json()).toStrictEqual({
      type: "/problems/not-found",
      title: "Not Found",
      status: 404,
    });
  });
});

describe("worker — configuration validated at startup (technique-v2 §10.1, §10.2)", () => {
  it("answers a 500 problem without detail when a secret is missing", async () => {
    const worker = await freshWorker();
    const { EXPORT_SECRET: _missing, ...incomplete } = env;
    vi.spyOn(console, "log").mockImplementation(() => {});

    const response = worker.fetch(request, incomplete);

    vi.restoreAllMocks();
    expect(response.status).toBe(500);
    expect(response.headers.get("Content-Type")).toBe(
      "application/problem+json",
    );
    expect(await response.json()).toStrictEqual({
      type: "about:blank",
      title: "Internal Server Error",
      status: 500,
    });
  });

  it("builds the configuration once, not on every request", async () => {
    const worker = await freshWorker();
    const reads = new Map<PropertyKey, number>();
    const counted = new Proxy(env, {
      get(target, key, receiver) {
        reads.set(key, (reads.get(key) ?? 0) + 1);
        return Reflect.get(target, key, receiver);
      },
    });

    worker.fetch(request, counted);
    const afterFirst = reads.get("TMDB_API_KEY");
    worker.fetch(request, counted);

    expect(afterFirst).toBeGreaterThan(0);
    expect(reads.get("TMDB_API_KEY")).toBe(afterFirst);
  });
});
