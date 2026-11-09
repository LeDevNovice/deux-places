// Guards docs/plan/plan.json.
//   node scripts/agent/plan-check.mjs            → validate the working-tree plan (CI, verify)
//   node scripts/agent/plan-check.mjs --staged   → also compare the staged plan with HEAD (pre-commit)
// Rules:
//   1. Structure is valid: unique ids, known statuses.
//   2. Order: everything before the first unfinished line is done/provided; everything after it is todo.
//   3. Against HEAD, only `status` and `notes` may change (structural edits need DP_PLAN_EDIT=1, human only).
//   4. A line carrying `humanGate` can only become done with DP_HUMAN_GATE=<letter> (human only).
import { DONE, STATUSES, fail, lines, readPlanAtHead, readPlanStaged, readPlanWorkingTree } from "./lib.mjs";

const staged = process.argv.includes("--staged");
const plan = staged ? readPlanStaged() : readPlanWorkingTree();
const problems = [];

const all = lines(plan);
const ids = new Set();
for (const line of all) {
  if (ids.has(line.id)) problems.push(`duplicate id ${line.id}`);
  ids.add(line.id);
  if (!STATUSES.includes(line.status)) problems.push(`${line.id}: unknown status "${line.status}"`);
}

// "provided" lines were delivered by the human (agent kit) and do not take part in the ordering.
const ordered = all.filter((l) => l.status !== "provided");
const firstOpen = ordered.findIndex((l) => l.status !== "done");
if (firstOpen !== -1) {
  for (const later of ordered.slice(firstOpen + 1)) {
    if (later.status !== "todo") {
      problems.push(
        `${later.id} is "${later.status}" but ${ordered[firstOpen].id} is still "${ordered[firstOpen].status}": lines are done in order`,
      );
    }
  }
}

if (staged) problems.push(...changesSinceHead(readPlanAtHead()));

if (problems.length) fail("plan.json check failed", problems);
console.log(`✔ plan.json ok — ${all.filter((l) => DONE.has(l.status)).length}/${all.length} lines done`);

/** Rules 3 and 4: what the staged plan may change compared with HEAD (none on the first commit). */
function changesSinceHead(head) {
  if (!head) return [];
  const found = [];
  const before = new Map(lines(head).map((l) => [l.id, l]));
  const structural = JSON.stringify(strip(head)) !== JSON.stringify(strip(plan));
  if (structural && process.env.DP_PLAN_EDIT !== "1") {
    found.push("plan structure changed (only `status` and `notes` may change; structural edits are human-only: DP_PLAN_EDIT=1)");
  }
  for (const line of all) {
    const prev = before.get(line.id);
    if (line.humanGate && line.status === "done" && prev?.status !== "done" && process.env.DP_HUMAN_GATE !== line.humanGate) {
      found.push(`${line.id} closes human checkpoint ${line.humanGate}: only the human can mark it done (DP_HUMAN_GATE=${line.humanGate})`);
    }
  }
  return found;
}

function strip(p) {
  return p.milestones.map((m) => ({
    ...m,
    commits: m.commits.map(({ status: _status, notes: _notes, ...rest }) => rest),
  }));
}
