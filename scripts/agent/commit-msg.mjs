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
  const staged = lines(readPlanStaged());
  const headPlan = readPlanAtHead();
  const before = new Map(headPlan ? lines(headPlan).map((l) => [l.id, l.status]) : []);
  const line = staged.find((l) => l.id === id);
  if (!line) {
    problems.push(`Plan: ${id} does not exist in plan.json`);
  } else {
    const completedNow = staged.filter((l) => DONE.has(l.status) && !DONE.has(before.get(l.id) ?? "todo"));
    const type = header.split(/[(:!]/)[0];
    if (suffix) {
      // Preparatory restructuring before line `id`: no line may be completed, no behaviour change.
      if (type !== "refactor") problems.push(`Plan: ${id}${suffix} is reserved for "refactor:" commits`);
      if (completedNow.length) problems.push(`a "${id}${suffix}" refactor must not complete plan lines`);
    } else if (completedNow.length === 1 && completedNow[0].id === id) {
      // The commit that completes the line must use the planned message verbatim.
      if (header !== line.message) problems.push(`header must be exactly the planned message:\n      ${line.message}`);
    } else if (completedNow.length > 1) {
      problems.push(`one commit completes one line; this one completes ${completedNow.map((l) => l.id).join(", ")}`);
    } else if (line.humanGate) {
      // Work for a checkpoint line is committed by the agent; only the human marks it done.
    } else if (!["fix", "docs", "test", "refactor"].includes(type)) {
      problems.push(`"${type}" commit for ${id} must complete that line (status → done in plan.json)`);
    }
  }
}

if (problems.length) fail("commit message refused", problems);
