---
name: implement-commit
description: Implement exactly one line of docs/plan/plan.json, test-first, and commit it.
whenToUse: After start-session, for the first plan line with status todo.
---

# Implement one plan line

## 1. Understand
- Read the line (`message`, `content`, `verification`), the RG texts it cites in `docs/rules.md`,
  and the spec sections it names. Use `CONTEXT.md` names in code.
- Set its status to `in_progress` in `plan.json` (only that field).
- Write a **test list** in your working notes: observable behaviours, edge cases, the RG wording.
  Not implementation steps. Include at least one case that must be rejected.

## 2. Tidy first, only if needed
If the existing structure makes the change hard, do the restructuring first in a separate
`refactor:` commit (`Plan: Jx.ya`), no behaviour change, all tests green before and after.

## 3. Red → green → refactor, one test at a time
- Write one test. Run it. It must fail **for the reason you expect** — read the failure message.
  A test that passes immediately is either redundant or wrong: find out which.
- Write the minimum code to pass it and all previous tests. No speculative parameters.
- Refactor only with all tests green; never mix refactoring into making a test pass.
- Never copy a value computed by the code into an expected value: derive expectations from the RG.
- Add newly discovered cases to the list; repeat until the list is empty.

## 4. Decide explicitly
Any choice the line, the spec or an ADR does not settle → skill `decide`. Record it in the
commit body (`Decision:`). If it is structural (new dependency, new layer, new pattern), stop.

## 5. Verify with evidence
- `node scripts/agent/verify.mjs` (runs `pnpm check` once it exists, plan and rules checks).
- The line's own verification (integration test, E2E, screenshot, manual step for the human).
- Paste the relevant output in your report. "Should work" is not evidence.

## 6. Review in a fresh context (behaviour changes only)
Run skill `review-commit` in a subagent that has NOT seen this session: give it the diff
(`git diff --staged`), the plan line and the cited RG texts — nothing else. Fix real findings
(correctness, spec, boundaries, missing test for a stated case). Ignore taste and "might need".

## 7. Commit
- `plan.json`: status `done` (or `blocked` with a `notes` reason — then do not commit code).
- Append to `docs/plan/PROGRESS.md`: date, line id, what changed, evidence, follow-ups.
- `git add -A && git commit` with the plan message, a why-body, `Decision:` if any, and the
  trailer `Plan: <id>`. The hooks re-run the gates; if they refuse, fix the cause, never bypass.
- End the session. The next line starts in a fresh context.
