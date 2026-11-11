// `pnpm size-budget`, after `pnpm build`, from the repository root: checks the initial JavaScript
// of the PWA against technique-v2 §8.3 (≤ 170 KB compressed). Exits 1 when over budget, or when the
// build cannot be measured (never reported as zero).
//   - Initial: the files dist/client/index.html loads (<script src>, <link rel="modulepreload">) and
//     everything they import statically. Files reached only through import() are left out, and so
//     is the Worker (dist/deux_places), which never reaches the phone.
//   - Compressed: each file gzipped on its own, as a browser receives it, by Node's zlib at its
//     default level (6); sizes are added. 1 kB = 1000 bytes, as Vite prints it. Vite's own gzip
//     column reads about 1 % higher: same level, but zlib-rs uses another match search (J1.10).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { parseSync } from "vite";

const BUDGET_BYTES = 170_000;
const CLIENT = "dist/client";
// References are resolved like a browser does, against a page served from this origin.
const SITE = new URL("https://site.invalid/");

/** A build this script cannot measure: reported, never counted as zero. */
class Unmeasurable extends Error {}

const attribute = (tag, name) =>
  new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i")
    .exec(tag)
    ?.slice(1)
    .find((value) => value !== undefined);

/** References of the scripts index.html loads or preloads. */
function loadedByPage(html) {
  const scripts = [...html.matchAll(/<script\b[^>]*>/gi)].map(([tag]) =>
    attribute(tag, "src"),
  );
  const preloads = [...html.matchAll(/<link\b[^>]*>/gi)]
    .filter(([tag]) => attribute(tag, "rel")?.toLowerCase() === "modulepreload")
    .map(([tag]) => attribute(tag, "href"));
  return [...scripts, ...preloads].filter(
    (reference) => reference !== undefined,
  );
}

/** `reference`, written in the file at `from` (a path below CLIENT), and the path it points to. */
function link(reference, from) {
  const url = new URL(reference, new URL(from, SITE));
  return { reference, from, path: decodeURIComponent(url.pathname).slice(1) };
}

function readLinked({ reference, from, path }) {
  try {
    return readFileSync(join(CLIENT, path));
  } catch {
    throw new Unmeasurable(
      `${reference}, loaded by ${from}, is not in ${CLIENT}`,
    );
  }
}

/** Specifiers `code` imports or re-exports statically; `import()` is left out. */
function staticImports(path, code) {
  const { module, errors } = parseSync(path, code);
  if (errors.length > 0)
    throw new Unmeasurable(`${path} cannot be parsed: ${errors[0].message}`);
  const exports = module.staticExports.flatMap(({ entries }) => entries);
  return [...module.staticImports, ...exports]
    .map(({ moduleRequest }) => moduleRequest?.value)
    .filter((specifier) => specifier !== undefined);
}

/** Every file loaded before the page runs, each once, with its content. */
function initialFiles(html) {
  const files = new Map();
  const queue = loadedByPage(html).map((reference) =>
    link(reference, "index.html"),
  );
  if (queue.length === 0)
    throw new Unmeasurable(
      `${CLIENT}/index.html loads no script: nothing to measure`,
    );
  for (const loaded of queue) {
    if (files.has(loaded.path)) continue;
    const content = readLinked(loaded);
    files.set(loaded.path, content);
    for (const specifier of staticImports(
      loaded.path,
      content.toString("utf8"),
    ))
      queue.push(link(specifier, loaded.path));
  }
  return files;
}

function readPage() {
  try {
    return readFileSync(join(CLIENT, "index.html"), "utf8");
  } catch {
    throw new Unmeasurable(
      `${CLIENT}/index.html not found: run \`pnpm build\` first`,
    );
  }
}

const kB = (bytes) => `${(bytes / 1000).toFixed(2)} kB`;

/** Prints one line per file, the total and the budget; returns the total gzip size. */
function report(files) {
  const width = Math.max(
    ...[...files.keys(), "budget"].map((name) => name.length),
  );
  const line = (name, text) => console.log(`  ${name.padEnd(width)}  ${text}`);
  let raw = 0;
  let gzip = 0;
  console.log(
    `Initial JavaScript (${CLIENT}/index.html and its static imports), ` +
      "each file gzipped by Node's zlib at level 6, 1 kB = 1000 B:",
  );
  for (const [path, content] of files) {
    const compressed = gzipSync(content).length;
    line(path, `raw ${content.length} B  gzip ${compressed} B`);
    raw += content.length;
    gzip += compressed;
  }
  line("total", `raw ${raw} B  gzip ${gzip} B (${kB(gzip)})`);
  line(
    "budget",
    `gzip ${BUDGET_BYTES} B (${kB(BUDGET_BYTES)}, technique-v2 §8.3)`,
  );
  return gzip;
}

try {
  const gzip = report(initialFiles(readPage()));
  // On stdout, after the report: a CI log merges stdout and stderr without keeping their order.
  if (gzip > BUDGET_BYTES) {
    console.log(
      `✖ over budget by ${gzip - BUDGET_BYTES} B (${kB(gzip - BUDGET_BYTES)})`,
    );
    process.exitCode = 1;
  } else {
    console.log(
      `✔ within budget, ${BUDGET_BYTES - gzip} B left (${kB(BUDGET_BYTES - gzip)})`,
    );
  }
} catch (error) {
  if (!(error instanceof Unmeasurable)) throw error;
  console.error(`✖ ${error.message}`);
  process.exitCode = 1;
}
