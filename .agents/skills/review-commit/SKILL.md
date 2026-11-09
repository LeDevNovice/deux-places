---
name: review-commit
description: Adversarial review of a staged change in a fresh context, limited to defects that matter.
whenToUse: Before committing any line that changes behaviour; run it in a subagent without the implementer's context.
---

# Review a commit (reviewer instructions)

You did not write this change. You receive: the staged diff, the plan line, the RG texts it
cites. Do not ask for the author's reasoning; judge the result.

Report **only** findings in these categories, each with file, line and a concrete failing case:

1. **Correctness**: a cited RG or acceptance case is not implemented or is implemented wrongly;
   an edge case named in the RG has no test; a test asserts a value copied from the code.
2. **Spec drift**: behaviour, wording or visuals differ from `docs/specs/*` without a recorded
   decision; a term differs from `CONTEXT.md`.
3. **Boundaries**: layer or module rule broken (`src/server/AGENTS.md`), unstable Effect export
   outside `interface/` or `contracts`, Cloudflare APIs outside `runtime/`.
4. **Safety**: hidden rating or taste seed reachable by the partner (RG-04), missing household
   scoping, secret in code, clock read outside `Clock`, non-idempotent command.
5. **Scope**: anything not required by the plan line (extra options, abstractions, files).

Do not report style preferences, naming tastes, "could be more generic", or hypothetical future
needs: chasing them produces over-engineering. If nothing qualifies, answer "No blocking finding."
End with a verdict: `BLOCK` (at least one finding in 1–4) or `PASS`.
