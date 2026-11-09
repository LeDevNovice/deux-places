---
name: close-milestone
description: Prepare the evidence pack for a human checkpoint (A, B, C, D) at the end of a milestone.
whenToUse: When the next plan line carries humanGate, or the last line of a milestone is done.
---

# Close a milestone

1. Run everything: `node scripts/agent/verify.mjs`, `pnpm test:workers`, `pnpm test:e2e`, the
   build with the bundle budget, and the nightly mutation run if the milestone touched domain code.
2. Write `docs/plan/checkpoints/<letter>.md`: what the milestone delivered (plan ids), evidence
   (command outputs, screenshots paths), measurements (CPU, bundle size), open risks, decisions
   recorded in commit bodies during the milestone (`git log --grep "Decision:"`).
3. Ask a fresh-context reviewer (skill `review-commit`, on `git diff <milestone-start>..HEAD`)
   for findings in categories 1–4 only; include its verdict unedited.
4. List what the human must do or decide (accounts, secrets, deploy, real-evening test, address).
5. Commit `docs: prepare checkpoint <letter>` and stop. The human sets the gate line to `done`.
