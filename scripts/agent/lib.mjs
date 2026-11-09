// Shared helpers for the agent guard scripts. Node >= 22, no dependencies.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export const PLAN_PATH = "docs/plan/plan.json";
export const STATUSES = ["todo", "in_progress", "done", "provided", "blocked"];
export const DONE = new Set(["done", "provided"]);

export function git(args, { allowFail = false } = {}) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    if (allowFail) return null;
    throw error;
  }
}

/** Plan as committed in HEAD, or null on the very first commit. */
export function readPlanAtHead() {
  const raw = git(["show", `HEAD:${PLAN_PATH}`], { allowFail: true });
  return raw === null ? null : JSON.parse(raw);
}

/** Plan as staged in the index (what the commit will contain). */
export function readPlanStaged() {
  const raw = git(["show", `:${PLAN_PATH}`], { allowFail: true });
  return raw === null ? readPlanWorkingTree() : JSON.parse(raw);
}

export function readPlanWorkingTree() {
  return JSON.parse(readFileSync(PLAN_PATH, "utf8"));
}

export function lines(plan) {
  return plan.milestones.flatMap((m) => m.commits.map((c) => ({ ...c, milestone: m.id })));
}

export function rgIdsIn(text) {
  return [...new Set(text.match(/RG-\d{2}/g) ?? [])];
}

export function hasPackageScript(name) {
  if (!existsSync("package.json")) return false;
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  return Boolean(pkg.scripts && pkg.scripts[name]);
}

export function walk(dir, predicate, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, predicate, acc);
    else if (predicate(path)) acc.push(path);
  }
  return acc;
}

export const isTestFile = (path) => /\.(test|spec)\.(ts|tsx|mts)$/.test(path);

export function fail(title, problems) {
  console.error(`\n✖ ${title}`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error("");
  process.exit(1);
}
