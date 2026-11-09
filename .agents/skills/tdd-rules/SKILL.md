---
name: tdd-rules
description: How to write the tests for business rules RG-xx — naming, builders, properties, time.
whenToUse: Whenever a plan line cites an RG rule or changes domain code.
---

# Testing business rules

- **Name**: `describe("RG-32 — the first title accepted by both is kept", ...)`. The RG id comes
  first so `rules-check` can trace it. One RG may have several tests; every cited RG has one.
- **Source**: expectations come from the RG text and the acceptance cases of
  `docs/specs/produit.md` §12, never from running the code and copying its output.
- **Builders**: `aSwap().openedBy(alice).withCandidates(3).build()` in the module's `testing/`
  folder; domain vocabulary only.
- **Properties** (fast-check) for invariants over sequences: alternation of cartes blanches,
  blind ratings never leaking, engine filters, evening-date cutoff across DST, ritual state machine.
  Keep the seed in the failure output; never lower `numRuns` to make a test pass.
- **Time**: domain functions take `now`; application tests use `TestClock`. Never `Date.now()`.
- **No mocks of our own code**: in-memory Layers for ports, real SQLite in integration tests,
  recorded fixtures for TMDB.
- **Mutation testing** (Stryker, nightly) must stay ≥ 80 % on domain code: a surviving mutant is a
  missing test, not a reason to lower the threshold.
