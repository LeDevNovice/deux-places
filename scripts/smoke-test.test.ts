// Plan J1.18: after `wrangler deploy`, the deploy job checks `GET /api/v1/health` on the deployed
// site (contract: 200 `{ status: "ok", version }`, src/contracts/api.ts). The site is an external
// border here: a small Node HTTP server answers in its place.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { deployedUrl, report, smokeTest } from "./smoke-test.mjs";

const servers: Server[] = [];
const folders: string[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
  for (const folder of folders.splice(0))
    rmSync(folder, { recursive: true, force: true });
});

type Answer = { status: number; body: string } | "never";

// Answers the n-th request with answers[n] (the last one repeats); records the paths requested.
const fakeSite = async (...answers: Answer[]) => {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    const answer = answers[Math.min(requests.length, answers.length) - 1];
    if (answer === "never") return; // holds the request open
    response.writeHead(answer.status, { "Content-Type": "application/json" });
    response.end(answer.body);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, requests };
};

const healthy = { status: 200, body: '{"status":"ok","version":"0.0.0"}' };
const failing = { status: 500, body: '{"type":"about:blank","status":500}' };

// Short waits for the tests; the job uses the script's defaults.
const fast = { attempts: 3, interval: 5, timeout: 200 };

describe("the smoke test on GET /api/v1/health", () => {
  it("passes on a 200 with status ok and a version", async () => {
    const site = await fakeSite(healthy);
    const result = await smokeTest(site.url, fast);
    expect(result.ok).toBe(true);
    expect(site.requests).toEqual(["GET /api/v1/health"]);
  });

  it("passes when the site turns healthy within the attempts (propagation)", async () => {
    const site = await fakeSite(failing, failing, healthy);
    const result = await smokeTest(site.url, fast);
    expect(result.ok).toBe(true);
    expect(site.requests).toHaveLength(3);
  });

  it("fails on a 500 after exactly the planned attempts", async () => {
    const site = await fakeSite(failing);
    const result = await smokeTest(site.url, fast);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("500");
    expect(site.requests).toHaveLength(3);
  });

  it("fails on a 500 even when its body looks healthy", async () => {
    const site = await fakeSite({ status: 500, body: healthy.body });
    const result = await smokeTest(site.url, fast);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("500");
  });

  it.each([
    [
      "the page instead of the API",
      "<!doctype html><title>Deux Places</title>",
    ],
    ["another status", '{"status":"degraded","version":"0.0.0"}'],
    ["no version", '{"status":"ok"}'],
    ["an empty version", '{"status":"ok","version":""}'],
  ])("fails on a 200 with an unexpected body: %s", async (_case, body) => {
    const site = await fakeSite({ status: 200, body });
    const result = await smokeTest(site.url, fast);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/unexpected body/);
    expect(site.requests).toHaveLength(3);
  });

  it("fails when the site never answers, each attempt cut by its timeout", async () => {
    const site = await fakeSite("never");
    const started = performance.now();
    const result = await smokeTest(site.url, fast);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/no answer/);
    expect(site.requests).toHaveLength(3);
    expect(performance.now() - started).toBeLessThan(3 * 200 + 2 * 5 + 1000);
  });

  it("fails when nothing listens", async () => {
    const site = await fakeSite(healthy);
    const [server] = servers.splice(0);
    await new Promise((resolve) => server?.close(resolve));
    const result = await smokeTest(site.url, fast);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/no answer/);
  });

  it("by default, as the job runs it, gives up after 12 attempts 10 s apart", async () => {
    const site = await fakeSite(failing);
    const waits: number[] = [];
    const result = await smokeTest(site.url, {
      sleep: async (ms: number) => {
        waits.push(ms);
      },
    });
    expect(result.ok).toBe(false);
    expect(site.requests).toHaveLength(12);
    expect(waits).toEqual(Array.from({ length: 11 }, () => 10_000));
  });

  it("waits the interval between attempts, never after the last one", async () => {
    const site = await fakeSite(failing);
    const waits: number[] = [];
    await smokeTest(site.url, {
      ...fast,
      sleep: async (ms: number) => {
        waits.push(ms);
      },
    });
    expect(waits).toEqual([5, 5]);
  });
});

// What the job sees: the script's exit code fails the step, hence the job.
describe("the smoke test's report", () => {
  const quiet = { ...fast, log: () => {}, error: () => {} };

  it("exits 0 when the site is healthy", async () => {
    const site = await fakeSite(healthy);
    expect(await report(site.url, quiet)).toBe(0);
  });

  it("exits 1 and writes an error annotation when it is not", async () => {
    const site = await fakeSite(failing);
    const errors: string[] = [];
    const code = await report(site.url, {
      ...quiet,
      error: (line: string) => errors.push(line),
    });
    expect(code).toBe(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^::error title=Smoke test failed::/);
    expect(errors[0]).toContain("status 500");
  });
});

// One line per Wrangler event (WRANGLER_OUTPUT_FILE_PATH, ND-JSON). The `deploy` event's fields come
// from wrangler 4.157.0 (wrangler-dist/cli.js, `deploy()`): `targets` are the deployed routes, a
// workers.dev hostname prefixed with https:// (`triggersDeploy`).
const deployEvent = (targets: string[]) =>
  JSON.stringify({
    type: "deploy",
    version: 1,
    worker_name: "deux-places",
    worker_tag: "tag",
    version_id: "00000000-0000-4000-8000-000000000000",
    targets,
  });

describe("the deployed site's address, from Wrangler's output file", () => {
  const session = JSON.stringify({ type: "wrangler-session", version: 1 });

  it("is the https:// target of the deploy event", () => {
    const text = [
      session,
      deployEvent(["https://deux-places.example.workers.dev"]),
      "",
    ].join("\n");
    expect(deployedUrl(text)).toBe("https://deux-places.example.workers.dev");
  });

  it("refuses an output without a deploy event", () => {
    expect(() => deployedUrl(`${session}\n`)).toThrow(/no deploy event/);
  });

  it("refuses a deploy event without an https:// target", () => {
    expect(() => deployedUrl(deployEvent(["example.com/*"]))).toThrow(
      /no https:\/\/ target/,
    );
  });
});

// The script as the deploy job runs it, on a Wrangler output file.
const runScript = (text: string) => {
  const folder = mkdtempSync(join(tmpdir(), "smoke-test-"));
  folders.push(folder);
  const file = join(folder, "wrangler-output.json");
  writeFileSync(file, text);
  return spawnSync(
    process.execPath,
    [join(import.meta.dirname, "smoke-test.mjs"), file],
    { encoding: "utf8", env: { PATH: process.env.PATH ?? "" } },
  );
};

describe("node scripts/smoke-test.mjs <wrangler output file>", () => {
  it("exits 1 without a deployed address", () => {
    const result = runScript("");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("no deploy event");
  });
});
