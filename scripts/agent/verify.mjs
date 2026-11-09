// Definition-of-done gate. Run before every commit; CI runs it with --ci.
//   node scripts/agent/verify.mjs [--ci]
import { execSync } from "node:child_process";
import { hasPackageScript } from "./lib.mjs";

const ci = process.argv.includes("--ci");
const steps = [
  ["plan", "node scripts/agent/plan-check.mjs"],
  ["rules", "node scripts/agent/rules-check.mjs"],
  ...(ci ? [] : [["guard", "node scripts/agent/guard-tests.mjs"]]),
  ...(hasPackageScript("check") ? [["check", "pnpm -s check"]] : []),
];

const results = [];
for (const [name, command] of steps) {
  try {
    execSync(command, { stdio: "inherit" });
    results.push([name, "ok"]);
  } catch {
    results.push([name, "FAILED"]);
  }
}

console.log("\n== Definition of done ==");
for (const [name, outcome] of results) console.log(`${outcome === "ok" ? "✔" : "✖"} ${name}`);
if (!hasPackageScript("check")) console.log("· `pnpm check` not defined yet (J0.8)");
if (results.some(([, outcome]) => outcome !== "ok")) process.exit(1);
