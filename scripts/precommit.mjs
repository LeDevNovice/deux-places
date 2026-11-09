// `pnpm precommit`, called by .githooks/pre-commit. Checks only the staged files and refuses;
// it never fixes and writes no file.
//   - gitleaks scans the staged content (the index) for secrets; missing gitleaks is a failure.
//   - prettier and oxlint read files from disk, so a checked file with unstaged changes is
//     refused: otherwise the working copy is the indexed content that will be committed.
import { execFileSync, spawnSync } from "node:child_process";
import { getFileInfo } from "prettier";

const LINTABLE = /\.[cm]?[jt]sx?$/;
const PRETTIER_IGNORE = [".gitignore", ".prettierignore"];

const gitPaths = (args) =>
  execFileSync("git", [...args, "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);

function run(command, args) {
  const { status, error } = spawnSync(command, args, { stdio: "inherit" });
  if (error)
    console.error(
      `✖ ${command}: ${error.code === "ENOENT" ? "not found in PATH" : error.message}`,
    );
  return status === 0;
}

function scanSecrets() {
  const ok = run("gitleaks", [
    "git",
    "--staged",
    "--redact",
    "--no-banner",
    "--verbose",
    ".",
  ]);
  if (!ok && spawnSync("gitleaks", ["version"]).error) {
    console.error(
      "  The secret scan is mandatory. Install the official gitleaks binary " +
        "(https://github.com/gitleaks/gitleaks/releases) and put it on the PATH.",
    );
  }
  return ok;
}

async function isFormattable(file) {
  const { ignored, inferredParser } = await getFileInfo(file, {
    ignorePath: PRETTIER_IGNORE,
  });
  return !ignored && inferredParser !== null;
}

function checkFormatAndLint(formattable, lintable) {
  const failures = [];
  if (formattable.length && !run("prettier", ["--check", "--", ...formattable]))
    failures.push("format (prettier)");
  if (
    lintable.length &&
    !run("oxlint", ["--no-error-on-unmatched-pattern", "--", ...lintable])
  )
    failures.push("lint (oxlint)");
  return failures;
}

const staged = gitPaths([
  "diff",
  "--cached",
  "--name-only",
  "--diff-filter=ACMR",
]);
const unstaged = new Set(gitPaths(["diff", "--name-only"]));
const formattable = [];
for (const file of staged)
  if (await isFormattable(file)) formattable.push(file);
const lintable = staged.filter((file) => LINTABLE.test(file));
const partial = [...new Set([...formattable, ...lintable])].filter((file) =>
  unstaged.has(file),
);

const failures = scanSecrets() ? [] : ["secrets (gitleaks)"];
if (partial.length) {
  console.error(
    "✖ Staged files with unstaged changes (format and lint read the working copy):",
  );
  for (const file of partial) console.error(`  - ${file}`);
  console.error(
    "  Stage the whole file, or set the unstaged part aside yourself (git stash push --keep-index).",
  );
  failures.push("partially staged files");
} else {
  failures.push(...checkFormatAndLint(formattable, lintable));
}

if (failures.length) {
  console.error(`\n✖ precommit refused: ${failures.join(", ")}`);
  process.exit(1);
}
console.log(
  `✔ precommit ok — ${staged.length} staged file(s), ${formattable.length} formatted, ${lintable.length} linted`,
);
