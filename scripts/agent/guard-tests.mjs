// pre-commit guard on the staged diff:
//   - human-owned files (specs, rules, ADRs, agent instructions, guards) are not modified by the agent;
//   - tests are never deleted, focused, skipped, or stripped of an RG id;
//   - quality thresholds are never lowered.
// Human override: DP_HUMAN=1 (owned files), DP_ALLOW_TEST_CHANGE=1 (tests, thresholds).
import { fail, git, isTestFile } from "./lib.mjs";

const OWNED = [
  /^docs\/specs\//,
  /^docs\/rules\.md$/,
  /^docs\/adr\//,
  /(^|\/)AGENTS\.md$/,
  /^CLAUDE\.md$/,
  /^\.agents\//,
  /^\.claude\//,
  /^\.githooks\//,
  /^scripts\/agent\//,
  /^tsconfig\.base\.json$/,
];
const THRESHOLD_FILES = /(stryker\.config|vitest\.config|playwright\.config|size-budget|\.dependency-cruiser|tsconfig[^/]*\.json$|\.oxlintrc)/;

const problems = [];
if (git(["rev-parse", "--git-dir"], { allowFail: true }) === null) {
  console.log("· guard: not a git repository yet, nothing staged to check");
  process.exit(0);
}
const status = git(["diff", "--cached", "--name-status", "--no-renames"]);
const changes = status ? status.split("\n").map((l) => l.split("\t")) : [];

for (const [kind, path] of changes) {
  if (process.env.DP_HUMAN !== "1" && OWNED.some((re) => re.test(path))) {
    problems.push(`${path}: human-owned file (${kind}). Report the needed change instead of making it.`);
  }
  if (kind === "D" && (isTestFile(path) || path.startsWith("e2e/")) && process.env.DP_ALLOW_TEST_CHANGE !== "1") {
    problems.push(`${path}: deleting a test file is not allowed`);
  }
}

const diff = git(["diff", "--cached", "--unified=0", "--no-color", "--no-ext-diff"]) ?? "";
let current = "";
const removedRg = new Map();
const addedRg = new Map();
for (const row of diff.split("\n")) {
  if (row.startsWith("+++ b/")) current = row.slice(6);
  if (row.startsWith("+++") || row.startsWith("---")) continue;
  const added = row.startsWith("+");
  const removed = row.startsWith("-");
  if (!added && !removed) continue;
  const text = row.slice(1);

  if (isTestFile(current) && added && /\b(describe|it|test)\.(only|skip)\b|\bx(it|describe)\(|\.fails\(/.test(text)) {
    problems.push(`${current}: focused or skipped test added → "${text.trim()}"`);
  }
  if (isTestFile(current)) {
    for (const id of text.match(/RG-\d{2}/g) ?? []) {
      const bucket = removed ? removedRg : addedRg;
      bucket.set(id, (bucket.get(id) ?? 0) + 1);
    }
  }
  if (THRESHOLD_FILES.test(current) && removed && /(numRuns|threshold|break|maxSize|budget|strict|noUnchecked|exactOptional|noImplicit|verbatimModuleSyntax|forbidden|severity|"error")/i.test(text)) {
    problems.push(`${current}: a quality threshold line changed ("${text.trim()}") — thresholds are human-owned`);
  }
}
for (const [id, count] of removedRg) {
  if ((addedRg.get(id) ?? 0) < count) problems.push(`tests mentioning ${id} were removed or renamed`);
}

if (problems.length && process.env.DP_ALLOW_TEST_CHANGE === "1") {
  const remaining = problems.filter((p) => p.includes("human-owned"));
  if (remaining.length) fail("pre-commit guard refused the commit", remaining);
} else if (problems.length) {
  fail("pre-commit guard refused the commit", problems);
}
console.log("✔ guard: no protected file, test or threshold weakened");
