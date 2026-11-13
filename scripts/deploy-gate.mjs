// `node scripts/deploy-gate.mjs`, the deploy job's step right before `wrangler deploy`
// (.github/workflows/ci.yml): decides whether this run deploys production, and writes
// `deploy=true|false` to $GITHUB_OUTPUT.
//   - Window (technique-v2 §10.4): no deployment between 19:00 and 01:00, Paris time, summer time
//     included: 19:00 belongs to the window, 01:00 does not. A run inside it deploys nothing and
//     says so; it is caught up by re-running the deploy job after 01:00 (or by the next push).
//   - Head of main: only the commit main points to right now is deployed, so that a re-run or a run
//     that finished after a newer one never puts older code back in production.
// The branch (main) and the event (push) are checked by the job's `if`, before this script runs.
// Input: GITHUB_SHA (set by GitHub Actions) and MAIN_HEAD (read from the GitHub API by the job).
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const parisClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Paris",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "HH:MM" in Paris at `instant`. */
export function parisTime(instant) {
  const parts = parisClock.formatToParts(instant);
  const part = (type) => parts.find((p) => p.type === type).value;
  return `${part("hour")}:${part("minute")}`;
}

/** Whether `instant` falls between 19:00 (included) and 01:00 (excluded), Paris time. */
export function insideEveningWindow(instant) {
  const hour = Number(parisTime(instant).slice(0, 2));
  return hour >= 19 || hour < 1;
}

/**
 * Whether to deploy `commit` at `now`, main pointing at `mainHead`.
 * @returns {{ deploy: true } | { deploy: false, reason: string }}
 */
export function deployDecision({ now, commit, mainHead }) {
  if (!commit) throw new Error("no commit to deploy (GITHUB_SHA is empty)");
  if (!mainHead)
    throw new Error("the head of main is unknown (MAIN_HEAD is empty)");
  if (commit !== mainHead)
    return {
      deploy: false,
      reason: `${commit} is no longer the head of main (${mainHead}): nothing deployed; the run of ${mainHead} deploys it.`,
    };
  if (insideEveningWindow(now))
    return {
      deploy: false,
      reason: `It is ${parisTime(now)} in Paris, inside the evening window (19:00 to 01:00, technique-v2 §10.4): nothing deployed. Re-run this deploy job after 01:00, or push again.`,
    };
  return { deploy: true };
}

/** The line written to $GITHUB_OUTPUT; the job's later steps test `deploy == 'true'`. */
export const outputLine = (decision) =>
  `deploy=${decision.deploy ? "true" : "false"}\n`;

/**
 * The gate as the job runs it, at `now`, from GITHUB_SHA and MAIN_HEAD in `env`: the line for
 * $GITHUB_OUTPUT and the message for the job's log.
 */
export function gate({ now, env }) {
  const decision = deployDecision({
    now,
    commit: env.GITHUB_SHA ?? "",
    mainHead: env.MAIN_HEAD ?? "",
  });
  return {
    output: outputLine(decision),
    message: decision.deploy
      ? `Deploying ${env.GITHUB_SHA} (${parisTime(now)} in Paris).`
      : `::notice title=Deployment skipped::${decision.reason}`,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const { output, message } = gate({ now: new Date(), env: process.env });
  console.log(message);
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, output);
}
