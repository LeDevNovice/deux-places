# AGENTS.md — Deux Places

Deux Places is a PWA that helps a couple pick what to watch tonight. Two users per household,
one household in production, zero hosting cost. You implement it **one plan line per session**.

## Start every session

Run `node scripts/agent/status.mjs` and read its output before anything else. It prints the git
state, the next plan line, the last progress entries and whether the repo is green.
If the repo is not green, fixing that is the session's only task.

## Sources of truth (read only what the current line needs)

| For | Read | Precedence |
| --- | --- | --- |
| Behaviour, rules RG-xx, user journeys, screens | `docs/specs/produit.md`, `docs/rules.md` | Wins on behaviour |
| Look, wording, states of each screen | `docs/specs/design.md`, `docs/specs/maquettes.pdf` | Wins on visuals and copy |
| Architecture, stack, data, API | `docs/specs/technique-v2.md`, `docs/adr/` | Wins on implementation; `produit.md` §6, §7, §9 are superseded by it |
| What to do now, in which order | `docs/plan/plan.json` (human view: `docs/plan/commits.md`) | Order is mandatory |
| Vocabulary FR ↔ EN | `CONTEXT.md` | One term, one translation |

If two sources still disagree after applying precedence: **stop and report**. Never pick silently.

## The loop (details: skill `implement-commit`)

1. Take the first plan line whose status is `todo`. Never skip ahead, never merge two lines.
2. Write a test list from the line and the exact RG text. Behaviours, not implementation.
3. One test at a time: red for the right reason → green with minimal code → refactor if useful.
4. Run `pnpm check` (once it exists) and the line's own verification. Show the output.
5. Ask a fresh-context reviewer (skill `review-commit`) for any line that changes behaviour.
6. Set the line to `done` in `plan.json`, append to `docs/plan/PROGRESS.md`, commit. One commit.

A needed restructuring goes first, in its own `refactor:` commit with id `Jx.ya` (no behaviour change).

## Commit format (checked by `.githooks/commit-msg`)

```
<type>(<scope>): <message from the plan line>

<why, in 1–3 lines; RG references>
Decision: <only if you chose between options — see skill `decide`>

Plan: J4.6
```

## Thinking discipline

- **Evidence over self-assessment.** A test run, a type error, the installed `.d.ts` or the cited
  doc outranks your own judgement. Never claim something works without showing its output.
- **Decide explicitly.** Any choice not dictated by the plan, spec or an ADR goes through skill
  `decide`: at least two options, judged against the ranked quality attributes, simplest one wins.
- **Check your biases.** First idea ≠ best idea (write an alternative). A test that never failed
  proves nothing. Two failed attempts = stop, do not push harder. No code "for later".
- **Disagree when warranted.** If the plan line, a test or a spec looks wrong, say so and stop.
  Making a wrong thing pass is a failure, not a success.
- **APIs from reality, not memory.** Effect is v4.1 (not v3), Cloudflare APIs change often:
  read `node_modules/<pkg>/dist/**/*.d.ts` or the docs cited in the spec before using an API.

## Boundaries

| Always | Ask first (stop and report) | Never |
| --- | --- | --- |
| Tests before code, `pnpm check` before commit | New dependency not named by the line | Commit with a red, skipped or weakened test |
| Vocabulary from `CONTEXT.md` | Changing a deployed `src/contracts` schema | Edit `docs/specs/**`, `docs/rules.md`, accepted ADRs |
| Effect imports per layer (ADR-022) | Changing an ADR, the tree or `plan.json` beyond `status`/`notes` | `git commit --no-verify`, force push, rewriting history |
| Stay inside the line's scope | Anything touching an account or secret, or a deploy | Read the clock outside Effect `Clock` |
| French UI copy from `src/web/messages.ts` | Human checkpoints A–D (`humanGate` in plan) | Add abstractions, options or flags nobody asked for |

## Stop conditions

Stop, report what you saw, and end the session when: two attempts failed; an API differs from
its doc; a rule is ambiguous or contradicts a test; a CPU or bundle budget is exceeded; the line
needs a secret, an account, a deploy or a human checkpoint.

## Commands

- `node scripts/agent/status.mjs` — where we are
- `node scripts/agent/verify.mjs` — the full definition-of-done gate (run before every commit)
- `pnpm check` — types, lint, format, boundaries, fast tests (created in J0.8)
- `pnpm test:workers`, `pnpm test:e2e` — integration and end-to-end (created in J1.3, J3.13)

Area-specific rules live in the nearest `AGENTS.md` (`src/server`, `src/web`, `src/contracts`, `e2e`).
