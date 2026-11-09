---
name: effect-v4
description: How this repository uses Effect 4.1 (services, layers, errors, HttpApi, SQL, tests) and how to avoid v3-era mistakes.
whenToUse: Before writing or changing any code that imports from effect or @effect/*.
---

# Effect 4.1 in Deux Places

## Ground truth
Effect 4 is stable since 2026-09-30 and was rebuilt from v3; many blog posts and examples online
are v3 or v4-beta. Source of truth, in order: the installed types under `node_modules/effect`
and `node_modules/@effect/*`, then https://effect.website/docs/v4/api. Never copy an API from
memory without checking one of them. Effect is pinned to an exact version; upgrades are
Renovate PRs reviewed by a human.

## Stability
Exports are tagged stable / unstable / experimental. HTTP API modules (`HttpApi`,
`HttpApiBuilder`, `HttpApiClient`, `OpenApi`, `HttpApiError`) are unstable: use them only in
`src/contracts` and `**/interface/`. The language service (`@effect/tsgo`) reports violations as
TypeScript errors — they block the commit like any type error.

## Patterns
- Use case: `export const addTitle = Effect.fn("AddTitle")(function* (cmd) { ... })`.
- Port: `class ReserveRepository extends Context.Service<ReserveRepository, { ... }>()("ReserveRepository") {}`
  declared in `application/`; implemented as a `Layer` in `infrastructure/`.
- Domain returns `Result`; application lifts a failure with `Effect.fail(result.failure)`.
- Business errors stay in the error channel with their tag; `Effect.orDie` only for real defects.
- Time: `Clock`/`DateTime`; tests: `TestClock.adjust(...)` under `it.effect` from `@effect/vitest`.
- Resilience: `Effect.timeout` + `Effect.retry` with a `Schedule`; honour `Retry-After`.
- Observability: name use cases with `Effect.fn`; never put personal data in span attributes.
- SQL: `SqlClient` from the household's SQLite (`@effect/sql-sqlite-do`), one transaction per command.
- RFC 9457: `HttpApiError.Problem` + the Problem Details middleware (4.1).

## Smells to stop on
`any`/`unknown` in an error channel, `Effect.runPromise` inside application code, a `Layer`
built per request, `Context.Tag`/`Effect.Service`/`ServiceMap` without checking they exist in 4.1.
