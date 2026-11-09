// Session bootstrap: where are we, what is next, is the repo green?
//   node scripts/agent/status.mjs [--no-check]
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { DONE, git, hasPackageScript, lines, readPlanWorkingTree } from "./lib.mjs";

const section = (title) => console.log(`\n== ${title} ==`);

section("Repository");
console.log(`directory: ${process.cwd()}`);
console.log(`branch:    ${git(["rev-parse", "--abbrev-ref", "HEAD"], { allowFail: true }) ?? "(no commit yet)"}`);
const dirty = git(["status", "--porcelain"], { allowFail: true });
console.log(dirty ? `uncommitted changes:\n${dirty}` : "working tree clean");
console.log(`hooks:     ${git(["config", "core.hooksPath"], { allowFail: true }) ?? "NOT ACTIVE — run: git config core.hooksPath .githooks"}`);

section("Last commits");
console.log(git(["log", "--oneline", "-8"], { allowFail: true }) ?? "(none)");

section("Plan");
const all = lines(readPlanWorkingTree());
const done = all.filter((l) => DONE.has(l.status)).length;
const next = all.find((l) => !DONE.has(l.status));
console.log(`${done}/${all.length} lines done`);
if (next) {
  console.log(`next: ${next.id} [${next.status}]${next.humanGate ? ` — HUMAN CHECKPOINT ${next.humanGate} after this line` : ""}`);
  console.log(`  message:      ${next.message}`);
  console.log(`  content:      ${next.content}`);
  console.log(`  verification: ${next.verification}`);
  if (next.notes) console.log(`  notes:        ${next.notes}`);
}

section("Last progress entries");
if (existsSync("docs/plan/PROGRESS.md")) {
  const log = readFileSync("docs/plan/PROGRESS.md", "utf8").replace(/```[\s\S]*?```/g, ""); // ignore the format example
  const entries = log.split(/\n(?=### )/).filter((e) => e.startsWith("### "));
  console.log(entries.slice(-3).join("\n") || "(none yet)");
}

section("Green check");
if (process.argv.includes("--no-check")) {
  console.log("skipped (--no-check)");
} else if (hasPackageScript("check")) {
  try {
    execSync("pnpm -s check", { stdio: "inherit" });
    console.log("GREEN");
  } catch {
    console.log("RED — making the repository green again is this session's only task.");
    process.exitCode = 1;
  }
} else {
  console.log("no `check` script yet (created by J0.8) — run node scripts/agent/verify.mjs");
}
