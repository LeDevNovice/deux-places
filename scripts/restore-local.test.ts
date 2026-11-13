// Plan J1.16: `pnpm restore:local <file>` reads an export (format of J1.15) and restores it into
// the development household of `pnpm dev`'s local state. The local restore server (Vite, workerd)
// is an external border here: a small Node HTTP server answers like it (runtime/restore-local.ts).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { restoreLocal } from "./restore-local.mjs";

const folders: string[] = [];
const servers: Server[] = [];
afterEach(() => {
  for (const folder of folders.splice(0))
    rmSync(folder, { recursive: true, force: true });
  for (const server of servers.splice(0)) server.close();
});

const folder = () => {
  const path = mkdtempSync(join(tmpdir(), "restore-local-"));
  folders.push(path);
  return path;
};

// A value of the file that must never be printed (technique-v2 §12.1).
const privateValue = "private-row-value";
const exportText = JSON.stringify({ version: 1, note: privateValue });

const exportFile = () => {
  const path = join(folder(), "export.json");
  writeFileSync(path, exportText);
  return path;
};

// Answers every request with `status` and `body`; records what it received and whether it closed.
const fakeRestoreServer = (status: number, body: string) => {
  const seen = {
    requests: [] as { method?: string; url?: string; body: string }[],
    started: 0,
    closed: 0,
  };
  const start = async () => {
    seen.started += 1;
    const server = createServer((request, response) => {
      let received = "";
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => {
        received += chunk;
      });
      request.on("end", () => {
        seen.requests.push({
          method: request.method,
          url: request.url,
          body: received,
        });
        response.writeHead(status, { "Content-Type": "application/json" });
        response.end(body);
      });
    });
    servers.push(server);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (address === null || typeof address === "string")
      throw new TypeError("no port");
    return {
      url: new URL(`http://127.0.0.1:${address.port}/`),
      close: async () => {
        seen.closed += 1;
        await new Promise<void>((resolve) => server.close(() => resolve()));
      },
    };
  };
  return { start, seen };
};

const run = async (
  args: readonly string[],
  server = fakeRestoreServer(500, ""),
) => {
  const out: string[] = [];
  const err: string[] = [];
  const code = await restoreLocal(args, {
    startServer: server.start,
    print: (line: string) => out.push(line),
    printError: (line: string) => err.push(line),
  });
  return { code, out, err, seen: server.seen };
};

describe("pnpm restore:local — refuses what it cannot restore, with a non-zero exit code", () => {
  it("needs exactly one file", async () => {
    const none = await run([]);
    const two = await run(["a.json", "b.json"]);

    for (const result of [none, two]) {
      expect(result.code).toBe(1);
      expect(result.err).toStrictEqual([
        "usage: pnpm restore:local <export.json>",
      ]);
      expect(result.seen.started).toBe(0);
    }
  });

  it("says so when the file does not exist, and starts no server", async () => {
    const missing = join(folder(), "missing.json");

    const result = await run([missing]);

    expect(result).toMatchObject({ code: 1, out: [] });
    expect(result.err).toStrictEqual([`cannot read ${missing} (ENOENT)`]);
    expect(result.seen.started).toBe(0);
  });

  it("says so when the file cannot be read (a folder), and starts no server", async () => {
    const directory = join(folder(), "a-folder");
    mkdirSync(directory);

    const result = await run([directory]);

    expect(result).toMatchObject({ code: 1, out: [] });
    expect(result.err).toStrictEqual([`cannot read ${directory} (EISDIR)`]);
    expect(result.seen.started).toBe(0);
  });

  it("prints the household's reason when it refuses the export, then stops the server", async () => {
    const server = fakeRestoreServer(
      422,
      JSON.stringify({ refused: "unknown table fixture_unknown" }),
    );

    const result = await run([exportFile()], server);

    expect(result).toMatchObject({ code: 1, out: [] });
    expect(result.err).toStrictEqual([
      "refused: unknown table fixture_unknown",
    ]);
    expect(result.seen).toMatchObject({ started: 1, closed: 1 });
  });

  it("fails on any other answer of the local server, then stops it", async () => {
    const server = fakeRestoreServer(500, "Internal Server Error");

    const result = await run([exportFile()], server);

    expect(result).toMatchObject({ code: 1, out: [] });
    expect(result.err).toStrictEqual(["the local restore server answered 500"]);
    expect(result.seen).toMatchObject({ started: 1, closed: 1 });
  });
});

describe("pnpm restore:local — restores the file into the local development household", () => {
  it("posts the file as it is, prints what was restored, exits 0 and stops the server", async () => {
    const server = fakeRestoreServer(
      200,
      JSON.stringify({ restored: { tables: 4, rows: 10 } }),
    );
    const file = exportFile();

    const result = await run([file], server);

    expect(result).toMatchObject({ code: 0, err: [] });
    expect(result.out).toStrictEqual([
      `restored ${file} into the development household of pnpm dev's local state (src/web/.wrangler/state): 4 tables, 10 rows`,
    ]);
    expect(result.seen.requests).toStrictEqual([
      { method: "POST", url: "/restore", body: exportText },
    ]);
    expect(result.seen).toMatchObject({ started: 1, closed: 1 });
  });

  it("never prints a value of the file", async () => {
    const results = [
      await run(
        [exportFile()],
        fakeRestoreServer(
          200,
          JSON.stringify({ restored: { tables: 1, rows: 1 } }),
        ),
      ),
      await run(
        [exportFile()],
        fakeRestoreServer(
          422,
          JSON.stringify({ refused: "the file is not JSON" }),
        ),
      ),
      await run([exportFile()], fakeRestoreServer(500, "")),
    ];

    for (const { out, err } of results)
      expect([...out, ...err].join("\n")).not.toContain(privateValue);
  });
});
