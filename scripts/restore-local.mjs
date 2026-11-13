// `pnpm restore:local <export.json>` (plan J1.16; technique-v2 §12.4, §10.4): restores an export of a
// household (format of J1.15, decrypted) into the fixed development household of `pnpm dev`'s local
// state (src/web/.wrangler/state), replacing its rows. Stop `pnpm dev` first: both would open the
// same local SQLite files.
//
// It starts, for the restore only, a local server whose entry is src/server/runtime/restore-local.ts
// (Vite's createServer() with the Cloudflare plugin, as Cloudflare's docs recommend for a
// programmatic dev server), posts the file to it, prints the outcome and stops it. That entry is
// never deployed: wrangler.jsonc's main stays src/server/worker.ts.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const usage = "usage: pnpm restore:local <export.json>";

// Where the outcome comes from: the restore entry answers 200 { restored } or 422 { refused }.
const outcomeOf = async (response) => {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

// The file's text, or the line that says why it cannot be read.
const readExport = async (file) => {
  try {
    return { exported: await readFile(file, "utf8") };
  } catch (error) {
    return {
      unreadable: `cannot read ${file} (${error?.code ?? "unreadable"})`,
    };
  }
};

// The line that tells what the restore server answered, and the exit code that goes with it.
const report = (file, status, outcome) => {
  if (status === 200 && outcome?.restored !== undefined) {
    const { tables, rows } = outcome.restored;
    return {
      code: 0,
      line: `restored ${file} into the development household of pnpm dev's local state (src/web/.wrangler/state): ${tables} tables, ${rows} rows`,
    };
  }
  if (status === 422 && typeof outcome?.refused === "string")
    return { code: 1, line: `refused: ${outcome.refused}` };
  return { code: 1, line: `the local restore server answered ${status}` };
};

/**
 * Restores the export named by `args` through the server `startServer` starts; returns the exit
 * code. Prints the counts restored or the household's reason, never a value of the file (§12.1).
 */
export async function restoreLocal(args, { startServer, print, printError }) {
  if (args.length !== 1) {
    printError(usage);
    return 1;
  }
  const [file] = args;
  const { exported, unreadable } = await readExport(file);
  if (unreadable !== undefined) {
    printError(unreadable);
    return 1;
  }
  const server = await startServer();
  try {
    const response = await fetch(new URL("/restore", server.url), {
      method: "POST",
      body: exported,
    });
    const { code, line } = report(
      file,
      response.status,
      await outcomeOf(response),
    );
    (code === 0 ? print : printError)(line);
    return code;
  } finally {
    await server.close();
  }
}

const fromHere = (relative) =>
  fileURLToPath(new URL(relative, import.meta.url));

// The local restore server: pnpm dev's root (src/web), hence its local state, and its Wrangler
// configuration (worker name, Durable Object classes), with the restore entry as the Worker.
const startLocalRestoreServer = async () => {
  const { createServer } = await import("vite");
  const { cloudflare } = await import("@cloudflare/vite-plugin");
  const server = await createServer({
    configFile: false,
    root: fromHere("../src/web"),
    logLevel: "warn",
    clearScreen: false,
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      cloudflare({
        configPath: fromHere("../wrangler.jsonc"),
        config: { main: fromHere("../src/server/runtime/restore-local.ts") },
        inspectorPort: false,
      }),
    ],
  });
  try {
    await server.listen();
    const [url] = server.resolvedUrls?.local ?? [];
    if (url === undefined) throw new Error("the local server has no address");
    return { url: new URL(url), close: () => server.close() };
  } catch (error) {
    await server.close();
    throw error;
  }
};

if (import.meta.main) {
  try {
    process.exitCode = await restoreLocal(process.argv.slice(2), {
      startServer: startLocalRestoreServer,
      print: (line) => console.log(line),
      printError: (line) => console.error(line),
    });
  } catch (error) {
    console.error(
      `the local restore failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
