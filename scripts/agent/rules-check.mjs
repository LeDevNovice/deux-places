// Every RG-xx cited by a plan line that is done must appear in at least one test title.
//   node scripts/agent/rules-check.mjs
import { readFileSync } from "node:fs";
import { DONE, fail, lines, readPlanWorkingTree, rgIdsIn, walk, isTestFile } from "./lib.mjs";

const plan = readPlanWorkingTree();
const required = new Map(); // RG id → plan ids citing it
for (const line of lines(plan)) {
  if (!DONE.has(line.status) || line.status === "provided") continue;
  for (const id of rgIdsIn(`${line.message} ${line.content} ${line.verification}`)) {
    required.set(id, [...(required.get(id) ?? []), line.id]);
  }
}

const TITLE = /\b(?:describe|it|test)(?:\.each\([^)]*\))?\(\s*(["'`])(.*?)\1/g;
const tested = new Set();
for (const file of [...walk("src", isTestFile), ...walk("e2e", isTestFile)]) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(TITLE)) for (const id of rgIdsIn(match[2])) tested.add(id);
}

const missing = [...required].filter(([id]) => !tested.has(id)).map(([id, by]) => `${id} (cited by ${by.join(", ")}) has no test title naming it`);
if (missing.length) fail("rules check failed", missing);
console.log(`✔ rules: ${required.size} cited rule(s) covered by named tests`);
