// `node scripts/backup.mjs <backup directory>`, the weekly backup (plan J1.17, technique-v2 §12.4),
// run by .github/workflows/backup.yml in a checkout of the private backup repository:
//   1. GET <SITE>/api/export with `Authorization: Bearer <EXPORT_SECRET>` (J1.15): 200 and an
//      export (JSON object with a version and its tables), or the backup fails and writes nothing.
//      ATTEMPTS attempts at most, each cut after TIMEOUT ms, INTERVAL ms apart, repeated only when
//      there was no answer or a 5xx; a 3xx (never followed), a 4xx or a body that is not an export
//      fails at once.
//   2. The export's bytes, as received, are encrypted by `age` to BACKUP_AGE_RECIPIENT (a public
//      key; its private half stays with the human): through age's standard input and output, so
//      the plain export never touches the disk.
//   3. The ciphertext is written as export-<UTC date and time>.json.age, never over an existing
//      file; then all but the `keptExports` latest exports are deleted. No other file is ever deleted.
// The workflow commits and pushes the directory afterwards. Prints statuses, sizes and file names;
// never a header, the secret or the export's content (technique-v2 §12.1). Exits 1 on failure.
import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";
import { readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { pathToFileURL } from "node:url";

/** How many exports the backup repository keeps (technique-v2 §12.4). */
export const keptExports = 14;

const ATTEMPTS = 3;
const INTERVAL = 30_000;
const TIMEOUT = 30_000;
// workers.dev runs Cloudflare's Browser Integrity Check: a default library User-Agent may get error
// 1010 before the Worker runs; the docs recommend a User-Agent that names the client (J1.18 · fix).
const USER_AGENT =
  "deux-places-backup (+https://github.com/LeDevNovice/deux-places)";

const pad = (n) => String(n).padStart(2, "0");

/**
 * The file of an export made at `instant`: its UTC date and time to the second, without colons
 * (Windows refuses them in file names), so that the names sort as the instants do.
 */
export const exportFileName = (instant) =>
  `export-${instant.getUTCFullYear()}-${pad(instant.getUTCMonth() + 1)}-${pad(instant.getUTCDate())}T${pad(instant.getUTCHours())}${pad(instant.getUTCMinutes())}${pad(instant.getUTCSeconds())}Z.json.age`;

// Only names written by exportFileName are exports; any other file of the directory is left alone.
const exportName = /^export-\d{4}-\d{2}-\d{2}T\d{6}Z\.json\.age$/;

/**
 * The exports to delete among `names` (the backup directory's files, the new export included):
 * all but the `keptExports` latest, oldest first. Fixed-width UTC names sort as their instants.
 */
export const exportsToDelete = (names) => {
  const exports = names.filter((name) => exportName.test(name)).toSorted();
  return exports.slice(0, Math.max(0, exports.length - keptExports));
};

// An export as J1.15 writes it: a JSON object with an integer `version` and a `tables` array.
const isExport = (bytes) => {
  let value;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return false;
  }
  return (
    typeof value === "object" &&
    value !== null &&
    Number.isInteger(value.version) &&
    Array.isArray(value.tables)
  );
};

const mediaType = (response) =>
  (response.headers.get("Content-Type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();

/** One request: `{ bytes }` for an export, or `{ reason, retry }`. */
async function attempt(url, { secret, fetch, timeout }) {
  let response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}`, "User-Agent": USER_AGENT },
      // A redirect is an answer other than 200: never followed, so neither the secret nor another
      // page's content goes into the backup.
      redirect: "manual",
      signal: AbortSignal.timeout(timeout),
    });
  } catch (error) {
    return {
      reason: `no answer (${error.name}: ${error.message})`,
      retry: true,
    };
  }
  if (response.status !== 200) {
    await response.body?.cancel();
    return {
      reason: `status ${response.status}`,
      retry: response.status >= 500,
    };
  }
  let bytes;
  try {
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    return {
      reason: `no answer (${error.name}: ${error.message})`,
      retry: true,
    };
  }
  if (mediaType(response) !== "application/json" || !isExport(bytes))
    return {
      reason: `status 200 but the body is not an export (${bytes.byteLength} bytes, Content-Type ${mediaType(response) || "absent"})`,
      retry: false,
    };
  return { bytes };
}

/** GET <site>/api/export until an export comes back or the attempts run out. */
async function requestExport(site, { secret, fetch, sleep, log, timeout }) {
  const url = new URL("/api/export", site);
  const from = async (n) => {
    const result = await attempt(url, { secret, fetch, timeout });
    log(
      `attempt ${n}/${ATTEMPTS}: GET ${url}: ${result.bytes ? `export of ${result.bytes.byteLength} bytes` : result.reason}`,
    );
    if (result.bytes || !result.retry || n >= ATTEMPTS) return result;
    await sleep(INTERVAL);
    return from(n + 1);
  };
  return from(1);
}

/**
 * `bytes` encrypted by `age` to `recipient`, in memory: the export goes to age's standard input and
 * the ciphertext comes back on its standard output, so the plain export never touches the disk.
 */
const encrypt = (bytes, recipient) =>
  new Promise((resolve, reject) => {
    // age needs nothing from the environment but PATH: never the export secret.
    const age = spawn("age", ["--encrypt", "--recipient", recipient], {
      env: { PATH: process.env.PATH },
    });
    const out = [];
    const err = [];
    age.stdout.on("data", (chunk) => out.push(chunk));
    age.stderr.on("data", (chunk) => err.push(chunk));
    age.stdin.on("error", () => {}); // age may exit before reading all of it: its code tells why
    age.on("error", reject);
    age.on("close", (code) =>
      code === 0
        ? resolve(Buffer.concat(out))
        : reject(new Error(Buffer.concat(err).toString("utf8").trim())),
    );
    age.stdin.end(bytes);
  });

// The ciphertext, or why age refused (a malformed recipient, for one).
const encryptExport = async (bytes, recipient) => {
  try {
    return { ciphertext: await encrypt(bytes, recipient) };
  } catch (error) {
    return { reason: `age could not encrypt the export (${error.message})` };
  }
};

// Writes `name`, never over an existing file, then deletes all but the latest exports.
const writeAndRotate = async (directory, name, ciphertext) => {
  try {
    await writeFile(join(directory, name), ciphertext, { flag: "wx" });
  } catch (error) {
    return {
      ok: false,
      reason: `cannot write ${name} (${error.code ?? error.message})`,
    };
  }
  const deleted = exportsToDelete(await readdir(directory));
  await Promise.all(deleted.map((old) => rm(join(directory, old))));
  const kept = (await readdir(directory)).filter((file) =>
    exportName.test(file),
  ).length;
  return { ok: true, written: name, deleted, kept };
};

/**
 * Exports, encrypts, writes and rotates, in that order: nothing is written or deleted unless an
 * export came back and was encrypted.
 * @returns {Promise<{ ok: true, written: string, deleted: string[], kept: number } | { ok: false, reason: string }>}
 */
export async function backup({
  site,
  secret,
  recipient,
  directory,
  now,
  fetch = globalThis.fetch,
  sleep = (ms) => wait(ms),
  log = () => {},
  timeout = TIMEOUT,
}) {
  if (!secret) return { ok: false, reason: "no export secret (EXPORT_SECRET)" };
  if (!recipient)
    return { ok: false, reason: "no age recipient (BACKUP_AGE_RECIPIENT)" };
  const exported = await requestExport(site, {
    secret,
    fetch,
    sleep,
    log,
    timeout,
  });
  if (!exported.bytes) return { ok: false, reason: exported.reason };
  const encrypted = await encryptExport(exported.bytes, recipient);
  if (!encrypted.ciphertext) return { ok: false, reason: encrypted.reason };
  return writeAndRotate(directory, exportFileName(now), encrypted.ciphertext);
}

/** Runs the backup and reports it; the exit code: 0 when written, 1 otherwise. */
export async function report(
  options,
  { log = console.log, error = console.error } = {},
) {
  const result = await backup({ ...options, log });
  if (!result.ok) {
    error(
      `::error title=Backup failed::${result.reason}. Nothing was written.`,
    );
    return { code: 1 };
  }
  log(
    `wrote ${result.written}; deleted ${result.deleted.length === 0 ? "none" : result.deleted.join(", ")}; ${result.kept} exports kept`,
  );
  return { code: 0, written: result.written };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [directory] = process.argv.slice(2);
  try {
    const { code, written } = await report({
      site: process.env.SITE,
      secret: process.env.EXPORT_SECRET,
      recipient: process.env.BACKUP_AGE_RECIPIENT,
      directory,
      now: new Date(),
    });
    if (written && process.env.GITHUB_OUTPUT)
      appendFileSync(process.env.GITHUB_OUTPUT, `file=${written}\n`);
    process.exitCode = code;
  } catch (error) {
    console.error(`::error title=Backup failed::${error.message}`);
    process.exitCode = 1;
  }
}
