# AGENTS.md — src/server (Worker, Durable Objects, modules)

Effect **4.1** server code. Spec: `docs/specs/technique-v2.md` §4–§7, §10; ADR-014, -015, -019, -022.

## Layout

`modules/<context>/{domain,application,infrastructure,interface}` + `index.ts` (the only import
point for other modules). `runtime/` assembles Layers and holds the Durable Object classes; it is
the only code that knows Cloudflare. `worker.ts` stays thin: static assets, session, routing.

## Layer rules (enforced by dependency-cruiser and the Effect language service)

| Layer | May import | Must not |
| --- | --- | --- |
| `domain/` | `src/shared-kernel`, and from `effect` only `Result`, `Option`, `Data`, `Brand` | Async, IO, `Clock`, `Schema`, services. Pass `now` as a parameter. |
| `application/` | `domain/`, ports it declares (`Context.Service`), `Effect`, `Clock`, `SqlClient` | Concrete adapters, HTTP types |
| `infrastructure/` | Anything, to implement ports as `Layer`s | Business rules |
| `interface/` | `HttpApiBuilder` handlers: decode → use case → map errors | Logic beyond that. Only here (and `src/contracts`) may "unstable" Effect exports appear |

## Effect conventions

- Use case = `Effect.fn("PascalCaseName")(function* (cmd) { ... })`; its inferred type lists its
  errors and services. Never widen errors to `unknown`/`Error`; never `Effect.orDie` a business error.
- Domain errors: `Data.TaggedError`. Contract errors: `Schema.TaggedErrorClass` in `src/contracts`,
  mapped to RFC 9457 problems in `interface/` (see technique-v2 §6.2 for the type list).
- Services: `class X extends Context.Service<X, Shape>()("X") {}` (Effect 4.1 reference). If you
  are about to write `Context.Tag`, `Effect.Service` or `ServiceMap`, check `node_modules/effect`
  types first: those names come from v3 or the v4 beta and may not exist in 4.1.
- Time only through `Clock`/`DateTime`; tests drive it with `TestClock`.
- Retries and timeouts with `Effect.timeout` + `Schedule`, never hand-written loops.

## Durable Objects

- One `Household` object per household, one `Directory` object; namespaces always `jurisdiction("eu")`.
- Each command runs in `sql.withTransaction`; state and `domain_events` are written together;
  broadcast to WebSockets only after commit. Commands carry `Idempotency-Key`.
- One alarm per object, always pointing at the earliest row of `deadlines`; never re-arm at "now".
- WebSockets use the hibernation API; server → phone only. Never send the partner's rating before
  RG-04 allows it, never send taste seeds or equity numbers.
- Budget: 10 ms CPU per Worker request (free plan). Build runtimes/handlers once, not per request.

## Tests

Domain: Vitest + fast-check, test title starts with the RG id. Application: `@effect/vitest`
(`it.effect`) with in-memory Layers and `TestClock`. Integration: `@cloudflare/vitest-plugin`
(`runInDurableObject`, `runDurableObjectAlarm`, `evictDurableObject`). Fakes only at external
borders (TMDB fixtures recorded from real responses, `Mailer`, `PushSender`). No mocks of our code.
