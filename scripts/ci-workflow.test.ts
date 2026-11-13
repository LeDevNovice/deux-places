// Plan J1.18: production is deployed by GitHub Actions, from main only, after the verification job
// (technique-v2 §10.4). What GitHub decides from the workflow file cannot run here: these tests read
// .github/workflows/ci.yml as text (two-space indentation, one key per line) and check the lines
// that decide when the deploy job runs and what it may see. The run on a branch shows the job
// skipped; the window and the smoke test are tested in deploy-gate.test.ts and smoke-test.test.ts.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  join(import.meta.dirname, "../.github/workflows/ci.yml"),
  "utf8",
);
const lines = workflow.split("\n");

/** The lines of a top-level key (`on:`) or of a job (`  deploy:`), up to the next sibling. */
function block(header: string) {
  const indent = header.length - header.trimStart().length;
  const start = lines.indexOf(header);
  if (start === -1) throw new Error(`no "${header}" in ci.yml`);
  const end = lines.findIndex(
    (line, i) =>
      i > start &&
      line.trim() !== "" &&
      !line.trimStart().startsWith("#") &&
      line.length - line.trimStart().length <= indent,
  );
  return lines.slice(start + 1, end === -1 ? undefined : end);
}

/** The steps of a job, each as its lines (a step starts with `      - `). */
function steps(job: string[]) {
  const all: string[][] = [];
  for (const line of job) {
    if (line.startsWith("      - ")) all.push([line]);
    else if (all.length > 0 && line.startsWith("        "))
      all.at(-1)?.push(line);
  }
  return all;
}

const deploy = block("  deploy:");
const deployKeys = deploy.filter((line) => /^ {4}\S/.test(line));

describe("when the deploy job runs", () => {
  it("runs on pushes only: the workflow has no pull_request trigger", () => {
    expect(lines).toContain("on: push");
    expect(workflow).not.toMatch(/pull_request/);
  });

  it("runs after the verification job, and only when it passed", () => {
    expect(deployKeys).toContain("    needs: check");
    // `if` without status function keeps GitHub's default success(): a failed or cancelled
    // verification skips the deployment.
    expect(deploy.join("\n")).not.toMatch(
      /always\(\)|failure\(\)|cancelled\(\)/,
    );
  });

  it("runs for a push to main only", () => {
    expect(deployKeys).toContain(
      "    if: github.event_name == 'push' && github.ref == 'refs/heads/main'",
    );
  });

  it("never runs two deployments at once, nor cancels one halfway", () => {
    const at = deploy.indexOf("    concurrency:");
    expect(at).toBeGreaterThan(-1);
    expect(deploy.slice(at + 1, at + 3)).toEqual([
      "      group: production",
      "      cancel-in-progress: false",
    ]);
  });

  it("deploys nothing unless the gate says so (window, head of main)", () => {
    const all = steps(deploy);
    const gate = all.findIndex((step) => step.includes("        id: gate"));
    expect(gate).toBeGreaterThan(-1);
    expect(all[gate]?.join("\n")).toContain("node scripts/deploy-gate.mjs");
    const after = all.slice(gate + 1);
    expect(after.length).toBeGreaterThan(0);
    for (const step of after)
      expect(step).toContain("        if: steps.gate.outputs.deploy == 'true'");
    // No step before the gate deploys or holds the deploy credentials.
    for (const step of all.slice(0, gate)) {
      expect(step.join("\n")).not.toMatch(/wrangler deploy|secrets\./);
    }
  });

  it("reads the window right before deploying: the gate is the step just before wrangler deploy", () => {
    const all = steps(deploy).map((step) => step.join("\n"));
    const gate = all.findIndex((step) => step.includes("        id: gate"));
    expect(all[gate + 1]).toMatch(/wrangler deploy/);
  });

  it("runs the smoke test after wrangler deploy, on the address Wrangler reports", () => {
    const all = steps(deploy).map((step) => step.join("\n"));
    const deployStep = all.findIndex((step) => /wrangler deploy/.test(step));
    const smoke = all.findIndex((step) =>
      /node scripts\/smoke-test\.mjs/.test(step),
    );
    expect(deployStep).toBeGreaterThan(-1);
    expect(smoke).toBeGreaterThan(deployStep);
  });
});

describe("what the deploy job may see", () => {
  it("reads secrets from the production environment, whose branch rule allows main only", () => {
    expect(deployKeys).toContain("    environment: production");
  });

  it("has read access to the repository and nothing more", () => {
    const at = deploy.indexOf("    permissions:");
    expect(at).toBeGreaterThan(-1);
    expect(deploy[at + 1]).toBe("      contents: read");
    expect(deploy[at + 2]).toMatch(/^ {0,4}\S/);
  });

  it("never writes a secret into a command: secrets only reach steps as environment variables", () => {
    const uses = lines.filter((line) => line.includes("secrets."));
    expect(uses.length).toBeGreaterThan(0);
    for (const line of uses)
      expect(line).toMatch(/^ +[A-Z_]+: \$\{\{ secrets\.[A-Z_]+ \}\}$/);
  });

  it("uses actions pinned to a commit", () => {
    const uses = lines.filter((line) => /^\s+(- )?uses: /.test(line));
    expect(uses.length).toBeGreaterThan(0);
    for (const line of uses) expect(line).toMatch(/@[0-9a-f]{40} # v/);
  });
});
