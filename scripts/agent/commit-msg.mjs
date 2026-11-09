// commit-msg hook: Conventional Commits header + `Plan:` trailer consistent with plan.json.
//   node scripts/agent/commit-msg.mjs <path-to-COMMIT_EDITMSG>
import { readFileSync } from "node:fs";
import { DONE, fail, lines, readPlanAtHead, readPlanStaged } from "./lib.mjs";

const raw = readFileSync(process.argv[2], "utf8");
const message = raw.split("\n").filter((l) => !l.startsWith("#")).join("\n").trim();
const [header] = message.split("\n");
const problems = [];

const HEADER = /^(feat|fix|refactor|test|docs|chore|build|ci|perf|revert)(\([a-z0-9-]+\))?!?: \S.{0,99}$/;
if (!HEADER.test(header)) {
  problems.push(`header "${header}" is not a Conventional Commit (type(scope): description, ≤ 100 chars)`);
}

const trailer = message.match(/^Plan: (J\d+\.\d+)([a-z]?)$/m);
const isHumanCommit = process.env.DP_HUMAN === "1";
if (!trailer && !isHumanCommit) {
  problems.push('missing trailer "Plan: Jx.y" (or Jx.ya for a preparatory refactor) on its own line');
}

if (trailer) {
  const [, id, suffix] = trailer;
  problems.push(...trailerProblems(id, suffix));
}

if (problems.length) fail("commit message refused", problems);

/** Problems with a `Plan:` trailer, judged against the staged plan and the plan in HEAD. */
function trailerProblems(id, suffix) {
  const staged = lines(readPlanStaged());
  const headPlan = readPlanAtHead();
  const before = new Map(headPlan ? lines(headPlan).map((l) => [l.id, l.status]) : []);
  const line = staged.find((l) => l.id === id);
  if (!line) return [`Plan: ${id} does not exist in plan.json`];

  const completedNow = staged.filter((l) => DONE.has(l.status) && !DONE.has(before.get(l.id) ?? "todo"));
  const type = header.split(/[(:!]/)[0];
  if (suffix) {
    // Preparatory restructuring before line `id`: no line may be completed, no behaviour change.
    const found = [];
    if (type !== "refactor") found.push(`Plan: ${id}${suffix} is reserved for "refactor:" commits`);
    if (completedNow.length) found.push(`a "${id}${suffix}" refactor must not complete plan lines`);
    return found;
  }
  return completionProblems(line, type, completedNow);
}

/** Problems for a commit on plan line `line` itself (no refactor suffix). */
function completionProblems(line, type, completedNow) {
  const id = line.id;
  if (completedNow.length === 1 && completedNow[0].id === id) {
    // The commit that completes the line must use the planned message verbatim.
    return header === line.message ? [] : [`header must be exactly the planned message:\n      ${line.message}`];
  }
  if (completedNow.length > 1) {
    return [`one commit completes one line; this one completes ${completedNow.map((l) => l.id).join(", ")}`];
  }
  // Work for a checkpoint line is committed by the agent; only the human marks it done.
  if (line.humanGate) return [];
  if (!["fix", "docs", "test", "refactor"].includes(type)) {
    return [`"${type}" commit for ${id} must complete that line (status → done in plan.json)`];
  }
  return [];
}
