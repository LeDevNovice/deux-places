// Plan J1.18: production is deployed from main, outside the evening window "no deployment between
// 19:00 and 01:00, Paris time" (technique-v2 §10.4). Every instant below is written in UTC and its
// Paris time worked out by hand: CET is UTC+1, CEST (last Sunday of March 02:00 → last Sunday of
// October 03:00) is UTC+2. 19:00 belongs to the window, 01:00 does not.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  deployDecision,
  gate,
  insideEveningWindow,
  outputLine,
} from "./deploy-gate.mjs";

const at = (iso: string) => new Date(iso);

describe("the evening window, Paris time, 19:00 included to 01:00 excluded", () => {
  it.each([
    // Winter (CET, UTC+1), 2026-01-15.
    ["2026-01-15T17:59:00Z", "18:59 in winter", false],
    ["2026-01-15T18:00:00Z", "19:00 in winter", true],
    ["2026-01-15T23:59:00Z", "00:59 in winter", true],
    ["2026-01-16T00:00:00Z", "01:00 in winter", false],
    // Summer (CEST, UTC+2), 2026-07-15.
    ["2026-07-15T16:59:00Z", "18:59 in summer", false],
    ["2026-07-15T17:00:00Z", "19:00 in summer", true],
    ["2026-07-15T22:59:00Z", "00:59 in summer", true],
    ["2026-07-15T23:00:00Z", "01:00 in summer", false],
  ])("%s (%s) inside: %s", (instant, _paris, inside) => {
    expect(insideEveningWindow(at(instant))).toBe(inside);
  });

  // Clocks go forward on 2026-03-29 at 02:00 CET (→ 03:00 CEST).
  it.each([
    ["2026-03-28T17:59:00Z", "18:59 CET on the 28th", false],
    ["2026-03-28T18:00:00Z", "19:00 CET on the 28th", true],
    ["2026-03-28T23:59:00Z", "00:59 CET on the 29th", true],
    ["2026-03-29T00:00:00Z", "01:00 CET on the 29th", false],
    ["2026-03-29T00:59:00Z", "01:59 CET, just before the change", false],
    ["2026-03-29T01:00:00Z", "03:00 CEST, just after the change", false],
    ["2026-03-29T16:59:00Z", "18:59 CEST on the 29th", false],
    ["2026-03-29T17:00:00Z", "19:00 CEST on the 29th", true],
  ])(
    "around the change to summer time: %s (%s) inside: %s",
    (instant, _paris, inside) => {
      expect(insideEveningWindow(at(instant))).toBe(inside);
    },
  );

  // Clocks go back on 2026-10-25 at 03:00 CEST (→ 02:00 CET): 02:00–02:59 happens twice.
  it.each([
    ["2026-10-24T16:59:00Z", "18:59 CEST on the 24th", false],
    ["2026-10-24T17:00:00Z", "19:00 CEST on the 24th", true],
    ["2026-10-24T22:59:00Z", "00:59 CEST on the 25th", true],
    ["2026-10-24T23:00:00Z", "01:00 CEST on the 25th", false],
    ["2026-10-25T00:30:00Z", "02:30 CEST, first time", false],
    ["2026-10-25T01:30:00Z", "02:30 CET, second time", false],
    ["2026-10-25T17:59:00Z", "18:59 CET on the 25th", false],
    ["2026-10-25T18:00:00Z", "19:00 CET on the 25th", true],
  ])(
    "around the change to winter time: %s (%s) inside: %s",
    (instant, _paris, inside) => {
      expect(insideEveningWindow(at(instant))).toBe(inside);
    },
  );

  it("reads Paris time, not the UTC hour of the instant", () => {
    // 17:30 UTC is 19:30 in Paris in summer; 00:30 UTC is 01:30 in Paris in winter.
    expect(insideEveningWindow(at("2026-07-15T17:30:00Z"))).toBe(true);
    expect(insideEveningWindow(at("2026-01-15T00:30:00Z"))).toBe(false);
  });
});

describe("whether the deploy job deploys", () => {
  const commit = "1111111111111111111111111111111111111111";
  const newer = "2222222222222222222222222222222222222222";
  const afternoon = at("2026-07-15T12:00:00Z"); // 14:00 in Paris
  const evening = at("2026-07-15T18:15:00Z"); // 20:15 in Paris

  it("deploys the head of main outside the window", () => {
    expect(
      deployDecision({ now: afternoon, commit, mainHead: commit }),
    ).toEqual({ deploy: true });
  });

  it("skips inside the window, naming the Paris time and how to catch up", () => {
    const decision = deployDecision({ now: evening, commit, mainHead: commit });
    expect(decision.deploy).toBe(false);
    expect(decision.reason).toContain("20:15");
    expect(decision.reason).toContain("19:00");
    expect(decision.reason).toContain("01:00");
    expect(decision.reason).toMatch(/re-run/i);
  });

  it("skips a commit that is no longer the head of main (a re-run or a late run never deploys older code)", () => {
    const decision = deployDecision({
      now: afternoon,
      commit,
      mainHead: newer,
    });
    expect(decision.deploy).toBe(false);
    expect(decision.reason).toContain(commit);
    expect(decision.reason).toContain(newer);
  });

  it("refuses to decide without the head of main", () => {
    expect(() =>
      deployDecision({ now: afternoon, commit, mainHead: "" }),
    ).toThrow(/head of main/);
    expect(() =>
      deployDecision({ now: afternoon, commit: "", mainHead: commit }),
    ).toThrow(/commit/);
  });
});

// The deploy job's later steps run when `steps.gate.outputs.deploy == 'true'` (ci.yml).
describe("the decision written for the deploy job", () => {
  it("is deploy=true to deploy, deploy=false otherwise", () => {
    expect(outputLine({ deploy: true })).toBe("deploy=true\n");
    expect(outputLine({ deploy: false, reason: "inside the window" })).toBe(
      "deploy=false\n",
    );
  });
});

// What the script writes and logs, at fixed instants.
describe("the gate as the job runs it", () => {
  const sha = "1111111111111111111111111111111111111111";

  it("writes deploy=true and says what it deploys, outside the window", () => {
    expect(
      gate({
        now: at("2026-07-15T12:00:00Z"),
        env: { GITHUB_SHA: sha, MAIN_HEAD: sha },
      }),
    ).toEqual({
      output: "deploy=true\n",
      message: `Deploying ${sha} (14:00 in Paris).`,
    });
  });

  it("writes deploy=false and a notice, inside the window", () => {
    const result = gate({
      now: at("2026-07-15T18:15:00Z"),
      env: { GITHUB_SHA: sha, MAIN_HEAD: sha },
    });
    expect(result.output).toBe("deploy=false\n");
    expect(result.message).toMatch(
      /^::notice title=Deployment skipped::It is 20:15 in Paris/,
    );
  });
});

// The script as the deploy job runs it. Only paths that do not depend on the real clock.
describe("node scripts/deploy-gate.mjs", () => {
  const folders: string[] = [];
  afterEach(() => {
    for (const folder of folders.splice(0))
      rmSync(folder, { recursive: true, force: true });
  });

  const run = (env: Record<string, string>) => {
    const folder = mkdtempSync(join(tmpdir(), "deploy-gate-"));
    folders.push(folder);
    const output = join(folder, "github-output");
    writeFileSync(output, "");
    const result = spawnSync(
      process.execPath,
      [join(import.meta.dirname, "deploy-gate.mjs")],
      {
        env: { PATH: process.env.PATH ?? "", GITHUB_OUTPUT: output, ...env },
        encoding: "utf8",
      },
    );
    return { ...result, output: readFileSync(output, "utf8") };
  };

  it("writes deploy=false and a notice for a commit that is not the head of main", () => {
    const result = run({
      GITHUB_SHA: "1111111111111111111111111111111111111111",
      MAIN_HEAD: "2222222222222222222222222222222222222222",
    });
    expect(result.status).toBe(0);
    expect(result.output).toBe("deploy=false\n");
    expect(result.stdout).toMatch(/^::notice title=Deployment skipped::/);
  });

  it("fails without writing a decision when the head of main is unknown", () => {
    const result = run({
      GITHUB_SHA: "1111111111111111111111111111111111111111",
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("head of main");
    expect(result.output).toBe("");
  });
});
