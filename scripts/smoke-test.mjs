// `node scripts/smoke-test.mjs <wrangler output file>`, last step of the deploy job
// (.github/workflows/ci.yml): reads the deployed site's address from Wrangler's ND-JSON output
// (WRANGLER_OUTPUT_FILE_PATH), then checks `GET /api/v1/health` → 200 `{ status: "ok", version }`
// (src/contracts/api.ts). The health route goes through the Worker to the household, which reads
// the configuration: a missing or malformed Cloudflare secret answers 500 here.
// Bounded: ATTEMPTS attempts, each cut after TIMEOUT ms, INTERVAL ms apart, so a few minutes at most
// while workers.dev picks up the deployment. Exits 1 when no attempt passes; nothing is rolled back
// (technique-v2 §10.4: a human redeploys the previous version). Prints the address, statuses and
// reasons; never a header.
import { readFileSync } from "node:fs";
import { setTimeout as wait } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const ATTEMPTS = 12;
const INTERVAL = 10_000;
const TIMEOUT = 10_000;

/** The https:// address of the last `deploy` event in Wrangler's ND-JSON output. */
export function deployedUrl(text) {
  const deploys = text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line))
    .filter((event) => event.type === "deploy");
  const deploy = deploys.at(-1);
  if (deploy === undefined)
    throw new Error("Wrangler's output has no deploy event");
  const target = (deploy.targets ?? []).find((t) => t.startsWith("https://"));
  if (target === undefined)
    throw new Error(
      `the deploy event has no https:// target (targets: ${JSON.stringify(deploy.targets)})`,
    );
  return new URL(target).origin;
}

const isHealthy = (body) =>
  typeof body === "object" &&
  body !== null &&
  body.status === "ok" &&
  typeof body.version === "string" &&
  body.version !== "";

/** One request: undefined when healthy, else why not. */
async function check(url, timeout) {
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  } catch (error) {
    return `no answer (${error.name}: ${error.message})`;
  }
  const text = await response.text();
  if (response.status !== 200) return `status ${response.status}`;
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = undefined;
  }
  return isHealthy(body)
    ? undefined
    : `unexpected body (${text.slice(0, 200)})`;
}

/**
 * Checks GET <site>/api/v1/health until it is healthy or the attempts run out.
 * @returns {Promise<{ ok: true, attempts: number } | { ok: false, attempts: number, reason: string }>}
 */
export async function smokeTest(
  site,
  {
    attempts = ATTEMPTS,
    interval = INTERVAL,
    timeout = TIMEOUT,
    sleep = (ms) => wait(ms),
    log = () => {},
  } = {},
) {
  const url = new URL("/api/v1/health", site);
  // One attempt after the other, never in parallel: attempt `attempt` of `attempts`.
  const from = async (attempt) => {
    const reason = await check(url, timeout);
    log(`attempt ${attempt}/${attempts}: GET ${url} ${reason ?? "healthy"}`);
    if (reason === undefined) return { ok: true, attempts: attempt };
    if (attempt >= attempts) return { ok: false, attempts, reason };
    await sleep(interval);
    return from(attempt + 1);
  };
  return from(1);
}

/** Runs the smoke test on `site` and reports it; the exit code: 0 when healthy, 1 otherwise. */
export async function report(
  site,
  { log = console.log, error = console.error, ...options } = {},
) {
  log(`Deployed site: ${site}`);
  const result = await smokeTest(site, { ...options, log });
  if (result.ok) return 0;
  error(
    `::error title=Smoke test failed::GET ${site}/api/v1/health: ${result.reason} after ${result.attempts} attempts. Production is not rolled back.`,
  );
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const site = deployedUrl(readFileSync(process.argv[2], "utf8"));
    process.exitCode = await report(site);
  } catch (error) {
    console.error(`::error title=Smoke test failed::${error.message}`);
    process.exitCode = 1;
  }
}
