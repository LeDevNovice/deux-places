// Runs scripts/size-budget.mjs as CI does, against small dist/ folders built in a temporary directory.
// Expected sizes come from the definition (technique-v2 §8.3, decided in J1.10): each initial file
// gzipped on its own by Node's zlib at its default level, sizes added, budget 170 000 bytes, `≤` passes.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(new URL("size-budget.mjs", import.meta.url));
const BUDGET = 170_000;

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0))
    rmSync(folder, { recursive: true, force: true });
});

/** A repository root holding the given files (paths relative to it). */
function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "size-budget-"));
  folders.push(root);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

function measure(root: string) {
  const { status, stdout, stderr } = spawnSync(process.execPath, [SCRIPT], {
    cwd: root,
    encoding: "utf8",
  });
  return { status, stdout, output: stdout + stderr };
}

const gzipped = (content: string) => gzipSync(Buffer.from(content)).length;
const raw = (content: string) => Buffer.byteLength(content);

const page = (head: string) =>
  `<!doctype html><html><head>${head}</head><body><div id="root"></div></body></html>`;

/** Deterministic printable characters that neither `*` nor `/` can turn into a comment end. */
function noise(length: number, seed: number): string {
  let state = seed;
  let text = "";
  while (text.length < length) {
    state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0;
    const code = 0x21 + ((state >>> 16) % 94);
    if (code !== 0x2a && code !== 0x2f) text += String.fromCodePoint(code);
  }
  return text;
}

/** Valid JavaScript starting with `code` whose gzip size is exactly `target` bytes. */
function jsOfGzipSize(target: number, code = ""): string {
  const filler = noise(target * 2, target);
  const make = (length: number) => `${code}/*${filler.slice(0, length)}*/\n`;
  let low = 0;
  let high = filler.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (gzipped(make(middle)) < target) low = middle + 1;
    else high = middle;
  }
  for (let length = Math.max(0, low - 64); length <= low + 64; length += 1) {
    if (gzipped(make(length)) === target) return make(length);
  }
  throw new Error(`no filler gives exactly ${target} gzip bytes`);
}

/** Repetitive code like a real bundle, whose gzip size depends on the compression level. */
function bundleLike(): string {
  const words = [
    "state",
    "props",
    "effect",
    "schema",
    "query",
    "client",
    "render",
    "value",
  ];
  const word = (index: number) => words[index % words.length] ?? "value";
  return Array.from(
    { length: 4000 },
    (_, i) =>
      `export const ${word(i)}${i}=(a,b)=>a.${word(i * 7)}(b,${i % 13})??${word(i * 3)}${i >> 1};`,
  ).join("\n");
}

describe("initial JavaScript budget", () => {
  it("passes and reports the file when the initial JavaScript is under 170 000 bytes", () => {
    const entry = bundleLike();
    const root = project({
      "dist/client/index.html": page(
        '<script type="module" src="/assets/entry.js"></script>',
      ),
      "dist/client/assets/entry.js": entry,
    });

    const { status, output } = measure(root);

    expect(output).toMatch(
      new RegExp(
        `assets/entry\\.js\\s+raw ${raw(entry)} B.*gzip ${gzipped(entry)} B`,
      ),
    );
    expect(output).toMatch(new RegExp(`budget\\s+gzip ${BUDGET} B`));
    expect(status).toBe(0);
  });

  it("fails above 170 000 bytes and prints the file, the total and the budget", () => {
    const entry = jsOfGzipSize(180_000);
    const root = project({
      "dist/client/index.html": page(
        '<script type="module" src="/assets/entry.js"></script>',
      ),
      "dist/client/assets/entry.js": entry,
    });

    const { status, stdout, output } = measure(root);

    expect(output).toMatch(
      new RegExp(`assets/entry\\.js\\s+raw ${raw(entry)} B.*gzip 180000 B`),
    );
    // One stream, in this order: a CI log merges stdout and stderr without keeping their order.
    expect(stdout).toMatch(
      /\n\s+total\s[^\n]*\n\s+budget\s[^\n]*\n✖ over budget by 10000 B/,
    );
    expect(output).toMatch(
      new RegExp(`total\\s+raw ${raw(entry)} B.*gzip 180000 B`),
    );
    expect(output).toMatch(new RegExp(`budget\\s+gzip ${BUDGET} B`));
    expect(output).toContain("over budget by 10000 B");
    expect(status).toBe(1);
  });

  it("accepts exactly 170 000 bytes (≤, technique-v2 §8.3)", () => {
    const root = project({
      "dist/client/index.html": page(
        '<script type="module" src="/assets/entry.js"></script>',
      ),
      "dist/client/assets/entry.js": jsOfGzipSize(BUDGET),
    });

    const { status, output } = measure(root);

    expect(output).toMatch(/total\s+raw \d+ B\s+gzip 170000 B/);
    expect(status).toBe(0);
  });

  it("refuses 170 001 bytes", () => {
    const root = project({
      "dist/client/index.html": page(
        '<script type="module" src="/assets/entry.js"></script>',
      ),
      "dist/client/assets/entry.js": jsOfGzipSize(BUDGET + 1),
    });

    const { status, output } = measure(root);

    expect(output).toContain("over budget by 1 B");
    expect(status).toBe(1);
  });

  it("adds the files index.html preloads (modulepreload) to the total", () => {
    const entry = jsOfGzipSize(100_000);
    const vendor = jsOfGzipSize(100_001);
    const root = project({
      "dist/client/index.html": page(
        '<script type="module" crossorigin src="/assets/entry.js"></script>' +
          '<link rel="modulepreload" crossorigin href="/assets/vendor.js">',
      ),
      "dist/client/assets/entry.js": entry,
      "dist/client/assets/vendor.js": vendor,
    });

    const { status, output } = measure(root);

    expect(output).toMatch(/assets\/vendor\.js\s+raw \d+ B\s+gzip 100001 B/);
    expect(output).toMatch(
      new RegExp(`total\\s+raw ${raw(entry) + raw(vendor)} B\\s+gzip 200001 B`),
    );
    expect(output).toContain("over budget by 30001 B");
    expect(status).toBe(1);
  });

  it("follows the static imports of the loaded files, even when index.html does not list them", () => {
    const root = project({
      "dist/client/index.html": page(
        '<script type="module" src="/assets/entry.js"></script>',
      ),
      "dist/client/assets/entry.js": jsOfGzipSize(
        100_000,
        'import{a}from"./shared.js";a();',
      ),
      "dist/client/assets/shared.js": jsOfGzipSize(
        50_000,
        'export{b as a}from"./deep.js";',
      ),
      "dist/client/assets/deep.js": jsOfGzipSize(
        20_001,
        "export const b=()=>1;",
      ),
    });

    const { status, output } = measure(root);

    expect(output).toMatch(/assets\/shared\.js\s+raw \d+ B\s+gzip 50000 B/);
    expect(output).toMatch(/assets\/deep\.js\s+raw \d+ B\s+gzip 20001 B/);
    expect(output).toMatch(/total\s+raw \d+ B\s+gzip 170001 B/);
    expect(status).toBe(1);
  });

  it("leaves out a file loaded only through import()", () => {
    const entry = 'document.onclick=()=>import("./later.js");\n';
    const root = project({
      "dist/client/index.html": page(
        '<script type="module" src="/assets/entry.js"></script>',
      ),
      "dist/client/assets/entry.js": entry,
      "dist/client/assets/later.js": jsOfGzipSize(BUDGET + 1),
    });

    const { status, output } = measure(root);

    expect(output).not.toContain("later.js");
    expect(output).toMatch(
      new RegExp(`total\\s+raw ${raw(entry)} B\\s+gzip ${gzipped(entry)} B`),
    );
    expect(status).toBe(0);
  });

  it("leaves out the Worker (dist/deux_places)", () => {
    const entry = 'console.log("Deux Places");\n';
    const root = project({
      "dist/client/index.html": page(
        '<script type="module" src="/assets/entry.js"></script>',
      ),
      "dist/client/assets/entry.js": entry,
      "dist/deux_places/index.js": jsOfGzipSize(BUDGET + 1),
    });

    const { status, output } = measure(root);

    expect(output).not.toContain("deux_places");
    expect(output).toMatch(
      new RegExp(`total\\s+raw ${raw(entry)} B\\s+gzip ${gzipped(entry)} B`),
    );
    expect(status).toBe(0);
  });

  it("counts once a file that index.html preloads and the entry imports, as Vite emits it", () => {
    const entry = jsOfGzipSize(60_000, 'import{a}from"./vendor.js";a();');
    const vendor = jsOfGzipSize(60_000, "export const a=()=>1;");
    const root = project({
      "dist/client/index.html": page(
        '<script type="module" src="/assets/entry.js"></script>' +
          '<link rel="modulepreload" href="/assets/vendor.js">',
      ),
      "dist/client/assets/entry.js": entry,
      "dist/client/assets/vendor.js": vendor,
    });

    const { status, output } = measure(root);

    expect(output.match(/assets\/vendor\.js/g)).toHaveLength(1);
    expect(output).toMatch(
      new RegExp(`total\\s+raw ${raw(entry) + raw(vendor)} B\\s+gzip 120000 B`),
    );
    expect(status).toBe(0);
  });

  it("fails with an explicit message when dist/client/index.html is missing", () => {
    const root = project({
      "dist/deux_places/index.js": "export default {};\n",
    });

    const { status, output } = measure(root);

    expect(output).toContain(
      "✖ dist/client/index.html not found: run `pnpm build` first",
    );
    expect(output).not.toContain("✔");
    expect(status).toBe(1);
  });

  it("fails rather than reporting zero when index.html loads no script", () => {
    const root = project({
      "dist/client/index.html": page("<title>Deux Places</title>"),
      "dist/client/assets/entry.js": 'console.log("never loaded");\n',
    });

    const { status, output } = measure(root);

    expect(output).toContain(
      "✖ dist/client/index.html loads no script: nothing to measure",
    );
    expect(output).not.toContain("✔");
    expect(status).toBe(1);
  });

  it("fails with an explicit message when a loaded file is not in the build", () => {
    const root = project({
      "dist/client/index.html": page(
        '<script type="module" src="/assets/entry.js"></script>',
      ),
      "dist/client/assets/entry.js": 'import"./gone.js";\n',
    });

    const { status, output } = measure(root);

    expect(output).toContain(
      "✖ ./gone.js, loaded by assets/entry.js, is not in dist/client",
    );
    expect(output).not.toContain("✔");
    expect(status).toBe(1);
  });

  it("fails when a loaded file cannot be parsed, since its imports would go uncounted", () => {
    const root = project({
      "dist/client/index.html": page(
        '<script type="module" src="/assets/entry.js"></script>',
      ),
      "dist/client/assets/entry.js": 'import{a}from"./shared.js";a(;\n',
      "dist/client/assets/shared.js": "export const a=()=>1;\n",
    });

    const { status, output } = measure(root);

    expect(output).toContain(
      "✖ assets/entry.js cannot be parsed: Unexpected token",
    );
    expect(output).not.toContain("✔");
    expect(status).toBe(1);
  });
});
