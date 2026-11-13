// Plan J1.17: the weekly backup runs in GitHub Actions (.github/workflows/backup.yml), with the
// export secret and a key that writes to the private backup repository. What GitHub decides from the
// workflow file cannot run here: as scripts/ci-workflow.test.ts does for ci.yml, these tests read the
// file as text (two-space indentation, one key per line) and check the lines that decide when the
// backup runs, what it may see and what it runs. The export itself is tested in backup.test.ts.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { insideEveningWindow } from "./deploy-gate.mjs";

const read = (name: string) =>
  readFileSync(join(import.meta.dirname, "../.github/workflows", name), "utf8");
const workflow = read("backup.yml");
const lines = workflow.split("\n");
const ci = read("ci.yml").split("\n");

/** The lines under `header` (a top-level key or a job), up to its next sibling. */
function block(source: string[], header: string) {
  const indent = header.length - header.trimStart().length;
  const start = source.indexOf(header);
  if (start === -1) throw new Error(`no "${header}"`);
  const end = source.findIndex(
    (line, i) =>
      i > start &&
      line.trim() !== "" &&
      !line.trimStart().startsWith("#") &&
      line.length - line.trimStart().length <= indent,
  );
  return source.slice(start + 1, end === -1 ? undefined : end);
}

/** The steps of a job, each as its lines (a step starts with `      - `). */
function steps(job: string[]) {
  const all: string[][] = [];
  for (const line of job) {
    if (line.startsWith("      - ")) all.push([line]);
    else if (all.length > 0 && line.startsWith("        "))
      all.at(-1)?.push(line);
  }
  return all.map((step) => step.join("\n"));
}

const on = block(lines, "on:");
const job = block(lines, "  backup:");
const jobKeys = job.filter((line) => /^ {4}\S/.test(line));
const backupSteps = steps(job);
const stepIndex = (pattern: RegExp) =>
  backupSteps.findIndex((step) => pattern.test(step));

describe("when the backup runs", () => {
  it("on its weekly schedule and by hand only: never on a push nor a pull request", () => {
    const triggers = on.filter((line) => /^ {2}\S/.test(line));
    expect(triggers).toEqual(["  schedule:", "  workflow_dispatch:"]);
    expect(workflow).not.toMatch(/pull_request|^ *push:|^on: push/m);
  });

  it("once a week, off the hour (GitHub drops scheduled runs first at the start of an hour), outside 19:00–01:00 in Paris", () => {
    const crons = on.filter((line) => line.includes("cron:"));
    expect(crons).toHaveLength(1);
    const [minute, hour, day, month, weekday] =
      /cron: "(.+)"/.exec(crons[0] ?? "")?.[1]?.split(" ") ?? [];
    expect([day, month]).toEqual(["*", "*"]);
    expect(weekday).toMatch(/^[0-6]$/);
    expect(Number(minute)).toBeGreaterThan(0);
    // The scheduled instant in UTC, on a winter day (UTC+1) and a summer day (UTC+2) of that weekday.
    for (const monday of ["2026-01-05", "2026-07-06"]) {
      const instant = new Date(
        `${monday}T${hour?.padStart(2, "0")}:${minute?.padStart(2, "0")}:00Z`,
      );
      instant.setUTCDate(instant.getUTCDate() + ((Number(weekday) + 6) % 7));
      expect(insideEveningWindow(instant)).toBe(false);
    }
  });

  it("from main only: a dispatch on another branch skips the job", () => {
    expect(jobKeys).toContain("    if: github.ref == 'refs/heads/main'");
  });

  it("one backup at a time, never cancelled halfway", () => {
    const at = job.indexOf("    concurrency:");
    expect(at).toBeGreaterThan(-1);
    expect(job.slice(at + 1, at + 3)).toEqual([
      "      group: backup",
      "      cancel-in-progress: false",
    ]);
  });

  it("is bounded in time", () => {
    expect(
      jobKeys.some((line) => /^ {4}timeout-minutes: \d+$/.test(line)),
    ).toBe(true);
  });
});

describe("what the backup may see", () => {
  it("reads its secrets from the backup environment, whose branch rule allows main only", () => {
    expect(jobKeys).toContain("    environment: backup");
  });

  it("has read access to this repository and nothing more", () => {
    const at = lines.indexOf("permissions:");
    expect(at).toBeGreaterThan(-1);
    expect(lines.slice(at + 1, at + 3)).toEqual(["  contents: read", ""]);
    expect(job.join("\n")).not.toMatch(/permissions:/);
  });

  it("never writes a secret into a command: as an environment variable, or the checkout's SSH key", () => {
    const uses = lines.filter((line) => line.includes("secrets."));
    expect(uses).toEqual(
      expect.arrayContaining([
        "          EXPORT_SECRET: ${{ secrets.EXPORT_SECRET }}",
        "          ssh-key: ${{ secrets.BACKUP_DEPLOY_KEY }}",
      ]),
    );
    for (const line of uses)
      expect(line).toMatch(
        /^ +([A-Z_]+|ssh-key): \$\{\{ secrets\.[A-Z_]+ \}\}$/,
      );
    const sshKey = backupSteps.filter((step) => step.includes("ssh-key:"));
    expect(sshKey).toHaveLength(1);
    expect(sshKey[0]).toMatch(/uses: actions\/checkout@/);
  });

  it("keeps no token in this repository's checkout, next to the secrets", () => {
    const own = backupSteps.filter((step) =>
      step.includes("          path: deux-places"),
    );
    expect(own).toHaveLength(1);
    expect(own[0]).toContain("          persist-credentials: false");
  });

  it("gives the export secret to the export step only", () => {
    const holders = backupSteps.filter((step) =>
      step.includes("secrets.EXPORT_SECRET"),
    );
    expect(holders).toHaveLength(1);
    expect(holders[0]).toContain("node deux-places/scripts/backup.mjs backups");
  });

  it("installs no package: no third-party code runs next to the secrets but pinned actions and age", () => {
    expect(workflow).not.toMatch(/\b(pnpm|npm|npx|yarn)\b/);
  });

  it("uses actions pinned to a commit, the same as ci.yml", () => {
    const uses = lines.filter((line) => /^\s+(- )?uses: /.test(line));
    expect(uses.length).toBeGreaterThan(0);
    for (const line of uses) {
      expect(line).toMatch(/@[0-9a-f]{40} # v/);
      const action = /uses: (\S+@\S+)/.exec(line)?.[1] ?? "";
      expect(ci.some((ciLine) => ciLine.includes(action))).toBe(true);
    }
  });
});

const ageEnv = (source: string[]) =>
  source
    .filter((line) => /^ +AGE_(VERSION|SHA256): /.test(line))
    .map((line) => line.trim());

describe("what the backup runs", () => {
  it("age at a pinned version, checked against its SHA-256 before it is unpacked, the same as ci.yml's", () => {
    expect(ageEnv(lines)).toHaveLength(2);
    expect(ageEnv(lines)).toEqual(ageEnv(ci));
    for (const source of [lines, ci]) {
      const install = steps(source).find((step) =>
        step.includes("name: Install age"),
      );
      expect(install).toBeDefined();
      const check =
        install?.indexOf(
          'echo "$AGE_SHA256  $RUNNER_TEMP/$archive" | sha256sum -c -',
        ) ?? -1;
      expect(check).toBeGreaterThan(-1);
      expect(install?.indexOf("tar -xzf")).toBeGreaterThan(check);
    }
  });

  it("ci.yml installs it before pnpm check, whose tests encrypt and decrypt with it", () => {
    const check = steps(block(ci, "  check:"));
    const install = check.findIndex((step) =>
      step.includes("name: Install age"),
    );
    expect(install).toBeGreaterThan(-1);
    expect(install).toBeLessThan(check.indexOf("      - run: pnpm check"));
  });

  it("checks the backup repository out with its deploy key before exporting, so that a wrong key never wakes production", () => {
    const checkout = stepIndex(/ssh-key:/);
    expect(backupSteps[checkout]).toContain("          path: backups");
    expect(checkout).toBeLessThan(stepIndex(/scripts\/backup\.mjs/));
  });

  it("commits and pushes the written export after the export step, and only if it succeeded, without force", () => {
    const exportStep = stepIndex(/scripts\/backup\.mjs/);
    const push = stepIndex(/git -C backups push/);
    expect(exportStep).toBeGreaterThan(-1);
    expect(push).toBeGreaterThan(exportStep);
    expect(backupSteps[exportStep]).toContain("        id: export");
    expect(backupSteps[push]).toContain(
      "FILE: ${{ steps.export.outputs.file }}",
    );
    expect(job.join("\n")).not.toMatch(
      /always\(\)|failure\(\)|cancelled\(\)|continue-on-error/,
    );
    expect(workflow).not.toMatch(/--force|\+HEAD|push -f/);
  });
});
