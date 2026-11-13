// Plan J1.17 (technique-v2 §12.4): the weekly backup. GitHub Actions calls the production export
// with the export secret, encrypts it with `age` to a public key whose private half only the human
// holds, writes it into a private repository and keeps the 14 latest exports.
import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { backup, exportFileName, exportsToDelete } from "./backup.mjs";

// A key pair generated for these tests by the `age` the backup uses (on the PATH, as in CI), in a
// temporary directory removed afterwards: never a real key, never committed.
let keys: string;
let identity: string;
let recipient: string;
beforeAll(() => {
  keys = mkdtempSync(join(tmpdir(), "backup-test-key-"));
  identity = join(keys, "identity.txt");
  execFileSync("age-keygen", ["-o", identity], { stdio: "ignore" });
  recipient = execFileSync("age-keygen", ["-y", identity], {
    encoding: "utf8",
  }).trim();
});
afterAll(() => rmSync(keys, { recursive: true, force: true }));

const decrypt = (file: string) =>
  execFileSync("age", ["--decrypt", "--identity", identity, file]);

describe("the name of an export file", () => {
  it("is the UTC date and time of the export, without colons, ending in .json.age", () => {
    // 04:17:42 in Paris (UTC+1) is 03:17:42 UTC.
    expect(exportFileName(new Date("2026-11-16T04:17:42.731+01:00"))).toBe(
      "export-2026-11-16T031742Z.json.age",
    );
  });
});

// One export a week, at 03:17:00 UTC, `weeksAgo` weeks before 2026-11-16.
const weekly = (weeksAgo: number) =>
  exportFileName(new Date(Date.UTC(2026, 10, 16 - 7 * weeksAgo, 3, 17, 0)));
const exportsOf = (count: number) =>
  Array.from({ length: count }, (_, weeksAgo) => weekly(weeksAgo));

describe("which exports are deleted once the new one is written (14 kept, §12.4)", () => {
  it("deletes none when 14 exports remain", () => {
    expect(exportsToDelete(exportsOf(14))).toEqual([]);
  });

  it("deletes none when fewer remain", () => {
    expect(exportsToDelete(exportsOf(13))).toEqual([]);
    expect(exportsToDelete([])).toEqual([]);
  });

  it("deletes the oldest one when 15 remain", () => {
    expect(exportsToDelete(exportsOf(15))).toEqual([weekly(14)]);
  });

  it("deletes the oldest ones, by date, whatever the order of the listing", () => {
    const names = exportsOf(20);
    const shuffled = [...names.slice(10), ...names.slice(0, 10).toReversed()];
    expect(exportsToDelete(shuffled).toSorted()).toEqual(
      [
        weekly(14),
        weekly(15),
        weekly(16),
        weekly(17),
        weekly(18),
        weekly(19),
      ].toSorted(),
    );
  });

  it("orders exports of the same day by their time", () => {
    const morning = exportFileName(new Date("2026-11-16T03:17:00Z"));
    const noon = exportFileName(new Date("2026-11-16T12:00:05Z"));
    const older = exportsOf(14).slice(1);
    expect(exportsToDelete([noon, ...older, morning])).toEqual([weekly(13)]);
    expect(exportsToDelete([noon, morning, ...exportsOf(15).slice(1)])).toEqual(
      [weekly(14), weekly(13)].toSorted(),
    );
  });

  it("never deletes nor counts a file that is not an export", () => {
    const foreign = [
      "README.md",
      ".gitattributes",
      "export-2026-11-16T031742Z.json", // not encrypted: not ours to delete
      "export-2026-11-16T03:17:42Z.json.age",
      "export-2026-11-16.json.age",
      "old/export-2020-01-06T031700Z.json.age",
      "export-2020-01-06T031700Z.json.age.bak",
      "my-export-2020-01-06T031700Z.json.age",
    ];
    expect(exportsToDelete([...foreign, ...exportsOf(14)])).toEqual([]);
    expect(exportsToDelete([...exportsOf(15), ...foreign])).toEqual([
      weekly(14),
    ]);
  });
});

// An export as the Worker serves it (src/server/worker.ts), with non-ASCII text, an escaped
// character (`\u00e9`) and no trailing newline: a re-encoded or re-serialized body would differ.
const exported = `{"version":1,"exportedAt":"2026-11-16T03:17:41.512Z","migrations":[{"id":1,"name":"household"}],"tables":[{"name":"members","columns":["name"],"rows":[["Grégory"],["Zo\\u00e9"]]}]}`;
const asExport = (body: string | Uint8Array, init: ResponseInit = {}) =>
  new Response(body, {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    ...init,
  });

const site = "https://deux-places.example.workers.dev";
const now = new Date("2026-11-16T03:17:42Z");
const written = "export-2026-11-16T031742Z.json.age";

let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "backup-test-repository-"));
  return () => rmSync(directory, { recursive: true, force: true });
});

/** Runs the backup against `answers`, one per request, and records the requests it made. */
async function backupWith(
  answers: Array<Response | Error>,
  options: Record<string, unknown> = {},
) {
  const requests: Request[] = [];
  const lines: string[] = [];
  const result = await backup({
    site,
    secret: "fake-export-secret",
    recipient,
    directory,
    now,
    fetch: async (input: Request | string | URL, init?: RequestInit) => {
      requests.push(new Request(input, init));
      const answer = answers[requests.length - 1];
      if (answer === undefined) throw new Error("no more answers");
      if (answer instanceof Error) throw answer;
      return answer;
    },
    sleep: async () => {},
    log: (line: string) => lines.push(line),
    ...options,
  });
  return { result, requests, lines };
}

describe("a 200 JSON export", () => {
  it("is encrypted to the recipient and written: decrypted, it is the export byte for byte", async () => {
    const { result } = await backupWith([asExport(exported)]);
    expect(result).toMatchObject({ ok: true, written });
    expect(readdirSync(directory)).toEqual([written]);
    const file = join(directory, written);
    expect(readFileSync(file).includes(Buffer.from("Grégory"))).toBe(false);
    expect(decrypt(file).equals(Buffer.from(exported, "utf8"))).toBe(true);
  });
});

describe("the export request", () => {
  it("is one GET of /api/export on the site, with the secret as a Bearer token and a User-Agent that names the backup", async () => {
    const { requests } = await backupWith([asExport(exported)]);
    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request?.method).toBe("GET");
    expect(request?.url).toBe(`${site}/api/export`);
    expect(request?.headers.get("Authorization")).toBe(
      "Bearer fake-export-secret",
    );
    // workers.dev's Browser Integrity Check may refuse a default library User-Agent (J1.18 · fix).
    expect(request?.headers.get("User-Agent")).toMatch(/^deux-places-backup /);
  });

  it("is never made without a secret or a recipient, and nothing is written", async () => {
    const repositories = [
      { secret: "" },
      { recipient: "" },
      { secret: undefined },
    ].map((missing) => ({
      ...missing,
      directory: mkdtempSync(join(tmpdir(), "backup-test-repository-")),
    }));
    const runs = await Promise.all(
      repositories.map((options) => backupWith([asExport(exported)], options)),
    );
    for (const [i, { result, requests }] of runs.entries()) {
      expect(result.ok).toBe(false);
      expect(requests).toEqual([]);
      expect(readdirSync(repositories[i]?.directory ?? "")).toEqual([]);
      rmSync(repositories[i]?.directory ?? "", { recursive: true });
    }
  });
});

const status = (code: number) => new Response("", { status: code });
const noAnswer = () =>
  new DOMException("The operation was aborted due to timeout", "TimeoutError");

/**
 * The backup against `answers`, in a backup directory that already holds a README and 14 exports:
 * its outcome, how many requests it made, and whether the directory was left as it was.
 */
async function refusal(answers: Array<Response | Error>) {
  const repository = mkdtempSync(join(tmpdir(), "backup-test-repository-"));
  try {
    writeFileSync(join(repository, "README.md"), "Encrypted exports.\n");
    for (const name of exportsOf(14)) writeFileSync(join(repository, name), "");
    const before = readdirSync(repository).toSorted();
    const { result, requests } = await backupWith(answers, {
      directory: repository,
    });
    return {
      ...result,
      attempts: requests.length,
      untouched:
        JSON.stringify(readdirSync(repository).toSorted()) ===
        JSON.stringify(before),
    };
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
}

const refused = (reason: RegExp, attempts: number) => ({
  ok: false,
  reason: expect.stringMatching(reason),
  attempts,
  untouched: true,
});

describe("any other answer fails the backup and writes nothing", () => {
  it("401 (wrong or missing secret): at once, no other attempt", async () => {
    const unauthorized = new Response(
      '{"type":"about:blank","title":"Unauthorized","status":401}',
      { status: 401, headers: { "Content-Type": "application/problem+json" } },
    );
    expect(await refusal([unauthorized, asExport(exported)])).toEqual(
      refused(/status 401/, 1),
    );
  });

  it("403, 404: at once", async () => {
    expect(await refusal([status(403), asExport(exported)])).toEqual(
      refused(/status 403/, 1),
    );
    expect(await refusal([status(404), asExport(exported)])).toEqual(
      refused(/status 404/, 1),
    );
  });

  it("500 on every attempt: three attempts, then the failure", async () => {
    expect(
      await refusal([
        status(500),
        status(500),
        status(500),
        asExport(exported),
      ]),
    ).toEqual(refused(/status 500/, 3));
  });

  it("no answer on every attempt (network error, timeout): three attempts, then the failure", async () => {
    expect(
      await refusal([
        new TypeError("fetch failed"),
        noAnswer(),
        noAnswer(),
        asExport(exported),
      ]),
    ).toEqual(refused(/no answer/, 3));
  });

  it("a 200 whose body is cut (timeout while reading it): three attempts, then the failure", async () => {
    const cut = () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(exported.slice(0, 20)));
            controller.error(
              new DOMException(
                "The operation was aborted due to timeout",
                "TimeoutError",
              ),
            );
          },
        }),
        { headers: { "Content-Type": "application/json; charset=utf-8" } },
      );
    expect(await refusal([cut(), cut(), cut(), asExport(exported)])).toEqual(
      refused(/no answer \(TimeoutError/, 3),
    );
  });

  it("a 200 body that is not JSON (an HTML page, a cut export): at once", async () => {
    const page = new Response("<!doctype html><title>Deux Places</title>", {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
    expect(await refusal([page, asExport(exported)])).toEqual(
      refused(/not an export/, 1),
    );
    expect(
      await refusal([asExport(exported.slice(0, -1)), asExport(exported)]),
    ).toEqual(refused(/not an export/, 1));
  });

  it("a 200 JSON body that is not an export, or not served as JSON", async () => {
    const bodies = [
      "{}",
      "[]",
      "null",
      '{"version":1}',
      '{"version":"1","tables":[]}',
      '{"tables":[]}',
    ];
    const outcomes = await Promise.all(
      bodies.map((body) => refusal([asExport(body)])),
    );
    for (const outcome of outcomes)
      expect(outcome).toEqual(refused(/not an export/, 1));
    const asText = new Response(exported, {
      headers: { "Content-Type": "text/plain" },
    });
    expect(await refusal([asText])).toEqual(refused(/not an export/, 1));
  });

  it("an export that age cannot encrypt to the recipient (malformed public key)", async () => {
    writeFileSync(join(directory, "README.md"), "Encrypted exports.\n");
    const { result } = await backupWith([asExport(exported)], {
      recipient: "age1notakey",
    });
    expect(result).toMatchObject({ ok: false });
    expect(readdirSync(directory)).toEqual(["README.md"]);
  });
});

describe("transient failures", () => {
  it("a 503 then the export: written on the second attempt, after a pause", async () => {
    const pauses: number[] = [];
    const { result, requests } = await backupWith(
      [new Response("", { status: 503 }), asExport(exported)],
      { sleep: async (ms: number) => void pauses.push(ms) },
    );
    expect(result).toMatchObject({ ok: true, written });
    expect(requests).toHaveLength(2);
    expect(pauses).toHaveLength(1);
    expect(pauses[0]).toBeGreaterThan(0);
  });

  it("each attempt is cut after a bounded time: an export that never comes counts as no answer", async () => {
    const repository = mkdtempSync(join(tmpdir(), "backup-test-repository-"));
    let calls = 0;
    try {
      const result = await backup({
        site,
        secret: "fake-export-secret",
        recipient,
        directory: repository,
        now,
        timeout: 20,
        // A server that never answers: the call ends only when its signal aborts it.
        fetch: (_: unknown, init?: RequestInit) => {
          calls += 1;
          return new Promise((_resolve, reject) =>
            init?.signal?.addEventListener("abort", () =>
              reject(init.signal?.reason),
            ),
          );
        },
        sleep: async () => {},
        log: () => {},
      });
      expect(result).toMatchObject({ ok: false });
      expect(result.reason).toMatch(/no answer \(TimeoutError/);
      expect(calls).toBe(3);
      expect(readdirSync(repository)).toEqual([]);
    } finally {
      rmSync(repository, { recursive: true });
    }
  });
});

describe("rotation once the new export is written", () => {
  it("with 14 exports already there: the oldest is deleted, the new one and foreign files kept", async () => {
    writeFileSync(join(directory, "README.md"), "Encrypted exports.\n");
    const before = exportsOf(15).slice(1); // the 14 weeks before the new export
    for (const name of before) writeFileSync(join(directory, name), "");
    const { result } = await backupWith([asExport(exported)]);
    expect(result).toEqual({
      ok: true,
      written,
      deleted: [weekly(14)],
      kept: 14,
    });
    expect(readdirSync(directory).toSorted()).toEqual(
      ["README.md", written, ...before.slice(0, 13)].toSorted(),
    );
  });

  it("with fewer: nothing deleted", async () => {
    for (const name of exportsOf(14).slice(1))
      writeFileSync(join(directory, name), "");
    const { result } = await backupWith([asExport(exported)]);
    expect(result).toEqual({ ok: true, written, deleted: [], kept: 14 });
  });

  it("never overwrites an export of the same second", async () => {
    writeFileSync(join(directory, written), "an earlier export");
    const { result } = await backupWith([asExport(exported)]);
    expect(result.ok).toBe(false);
    expect(readFileSync(join(directory, written), "utf8")).toBe(
      "an earlier export",
    );
  });
});

describe("what the backup writes to its log", () => {
  it("never the secret nor the export's content, even when it fails", async () => {
    const runs = await Promise.all(
      [
        [asExport(exported)],
        [new Response("Grégory", { status: 401 })],
        [
          new Response("Grégory", { status: 500 }),
          new Response("", { status: 500 }),
          new Response("", { status: 500 }),
        ],
        [asExport('{"members":"Grégory"}')],
      ].map(async (answers) => {
        const repository = mkdtempSync(
          join(tmpdir(), "backup-test-repository-"),
        );
        const run = await backupWith(answers, { directory: repository });
        rmSync(repository, { recursive: true });
        return run;
      }),
    );
    const all = runs.flatMap(({ result, lines }) => [
      ...lines,
      result.reason ?? "",
    ]);
    expect(all.length).toBeGreaterThan(4);
    for (const line of all) {
      expect(line).not.toContain("fake-export-secret");
      expect(line).not.toContain("Grégory");
    }
  });
});

/** Runs the script against a local site answering `status` with `body`, in empty directories. */
async function runCommand(
  answer: number,
  body: string,
  headers: Record<string, string> = {},
  bin?: string,
) {
  const seen: Array<{ url?: string; authorization?: string }> = [];
  const server = createServer((request, response) => {
    seen.push({
      url: request.url,
      authorization: request.headers.authorization,
    });
    // Any other path is the target of a redirect: it serves a valid export.
    const exportPath = request.url === "/api/export";
    response.writeHead(exportPath ? answer : 200, {
      "Content-Type": "application/json; charset=utf-8",
      ...(exportPath && headers),
    });
    response.end(exportPath ? body : exported);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const scratch = mkdtempSync(join(tmpdir(), "backup-test-run-"));
  const [cwd, temp, output] = ["cwd", "tmp", "github-output"].map((name) =>
    join(scratch, name),
  );
  for (const dir of [cwd, temp]) execFileSync("mkdir", [dir]);
  try {
    const child = spawn(
      process.execPath,
      [join(import.meta.dirname, "backup.mjs"), directory],
      {
        cwd,
        // Only what the workflow step sets, plus PATH for `age`: no proxy, no other secret.
        env: {
          PATH:
            bin === undefined ? process.env.PATH : `${bin}:${process.env.PATH}`,
          TMPDIR: temp,
          GITHUB_OUTPUT: output,
          SITE: `http://127.0.0.1:${port}`,
          EXPORT_SECRET: "fake-export-secret",
          BACKUP_AGE_RECIPIENT: recipient,
        },
      },
    );
    let printed = "";
    child.stdout.on("data", (chunk) => (printed += chunk));
    child.stderr.on("data", (chunk) => (printed += chunk));
    const code = await new Promise<number | null>((resolve) =>
      child.on("close", resolve),
    );
    return {
      code,
      printed,
      seen,
      output: existsSync(output) ? readFileSync(output, "utf8") : "",
      leftovers: [...readdirSync(cwd), ...readdirSync(temp)],
    };
  } finally {
    server.close();
    rmSync(scratch, { recursive: true, force: true });
  }
}

describe("the command the workflow runs: node scripts/backup.mjs <directory>", () => {
  it("writes the encrypted export, names it for the commit step, and leaves no plain file anywhere", async () => {
    const { code, printed, seen, output, leftovers } = await runCommand(
      200,
      exported,
    );
    expect(code).toBe(0);
    expect(seen).toEqual([
      { url: "/api/export", authorization: "Bearer fake-export-secret" },
    ]);
    const [file, ...others] = readdirSync(directory);
    expect(others).toEqual([]);
    expect(file).toMatch(/^export-\d{4}-\d{2}-\d{2}T\d{6}Z\.json\.age$/);
    expect(output).toBe(`file=${file}\n`);
    expect(
      decrypt(join(directory, file ?? "")).equals(Buffer.from(exported)),
    ).toBe(true);
    expect(leftovers).toEqual([]);
    expect(printed).toContain(`wrote ${file}`);
    expect(printed).not.toContain("fake-export-secret");
    expect(printed).not.toContain("Grégory");
  });

  it("never follows a redirect: a 302 to a valid export fails at once, writes nothing, and the secret goes nowhere else", async () => {
    const { code, printed, seen, output } = await runCommand(302, "", {
      Location: "/elsewhere",
    });
    expect(code).toBe(1);
    expect(seen).toEqual([
      { url: "/api/export", authorization: "Bearer fake-export-secret" },
    ]);
    expect(readdirSync(directory)).toEqual([]);
    expect(output).toBe("");
    expect(printed).toContain("::error title=Backup failed::status 302");
  });

  it("runs age without the export secret in its environment", async () => {
    // A stand-in `age`, first on the PATH, written in Node (which adds no variable of its own,
    // unlike a shell): it prints the names (never the values) of the variables it receives, then
    // fails, so the backup fails and prints age's message.
    const bin = mkdtempSync(join(tmpdir(), "backup-test-bin-"));
    writeFileSync(
      join(bin, "age"),
      `#!${process.execPath}\nprocess.stderr.write("received: " + Object.keys(process.env).sort().join(" ") + "\\n");\nprocess.exit(1);\n`,
      { mode: 0o755 },
    );
    try {
      const { code, printed } = await runCommand(200, exported, {}, bin);
      expect(code).toBe(1);
      // PATH alone: no other variable of the step, whatever its name.
      expect(printed).toContain(
        "age could not encrypt the export (received: PATH)",
      );
      expect(readdirSync(directory)).toEqual([]);
    } finally {
      rmSync(bin, { recursive: true });
    }
  });

  it("exits 1, writes nothing and names no file when the export is refused", async () => {
    const { code, printed, output, leftovers } = await runCommand(401, "{}");
    expect(code).toBe(1);
    expect(readdirSync(directory)).toEqual([]);
    expect(output).toBe("");
    expect(leftovers).toEqual([]);
    expect(printed).toContain("::error title=Backup failed::status 401");
  });
});
