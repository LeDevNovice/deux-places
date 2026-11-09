---
name: decide
description: Make a technical choice explicitly, against the project's ranked quality attributes, without bias.
whenToUse: Whenever the plan line, specs and ADRs leave a choice open (data shape, API shape, library function, test strategy, naming).
---

# Decide

Self-review without external evidence does not reliably improve reasoning; external signals
(tests, types, docs, measurements) do. So a decision is made on evidence, written down, and small.

1. **State the question** in one sentence, and why the sources do not already answer it. If an
   ADR or the spec does answer it, follow it and stop here.
2. **Generate at least two options** before evaluating any. The first idea is not privileged.
   The simplest possible option ("do nothing", "inline it", "use what exists") is always one.
3. **Judge against the ranked quality attributes** (technique-v1 §1.2, kept by v2):
   functional correctness > reliability with two phones > perceived evening performance >
   offline > accessibility > security and privacy > maintainability > reversibility.
   Plus hard constraints: free-plan CPU 10 ms, 170 KB JS, EU jurisdiction, Effect layer rules.
4. **Check the evidence**: read the installed types or the cited docs for the APIs involved;
   if a quick experiment (a test) can settle it, run it.
5. **Pre-mortem**: "Six months later this choice was wrong — what most likely happened?"
   If the answer is plausible and cheap to prevent, adjust.
6. **YAGNI test**: does every part of the chosen option serve the current line? Remove the rest.
7. **Record** in the commit body:
   `Decision: <choice> — over <rejected option(s)> because <attribute/evidence>.`
8. **Escalate** (stop and report) if the choice adds a dependency, a layer, a pattern used across
   modules, touches a contract already deployed, or contradicts an ADR. That needs an ADR by a human.
