---
name: durable-objects
description: Rules and test recipes for the Household and Directory Durable Objects on Cloudflare Workers (free plan).
whenToUse: Before touching src/server/runtime, wrangler.jsonc, alarms, WebSockets, migrations or anything measured against free-plan limits.
---

# Durable Objects in Deux Places

## Invariants
- `Household` (one per household) and `Directory` (one) are SQLite-backed (`new_sqlite_classes`)
  and always reached through `env.X.jurisdiction("eu")`. Local workerd does not implement
  jurisdictions: `.dev.vars` and the Workers tests set `DURABLE_OBJECT_JURISDICTION=none`; absent
  or empty it means `eu`, any other value refuses the startup.
- Migrations run before the first request after a deploy; they are forward-only and small.
- One alarm per object = earliest row of `deadlines`. After running due rows, re-arm on the next
  one; never on the current instant (a loop would burn the free quota).
- WebSockets: hibernation API, automatic ping/pong, `Origin` checked on upgrade; broadcast after
  commit; replay from `domain_events` with `?since=`.
- Free plan: Worker 10 ms CPU per request, 50 subrequests per invocation, 100,000 requests/day;
  Durable Objects 100,000 requests, 5 M rows read, 100,000 rows written per day. Every
  `setAlarm()` costs one row written. Batch TMDB refreshes under 50 subrequests per alarm.

## Testing (`@cloudflare/vitest-plugin`, Vitest 4.1)
- `cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })` in the `workers` project.
- `runInDurableObject(stub, (instance, state) => ...)` to inspect `state.storage.sql`.
- `runDurableObjectAlarm(stub)` to fire an alarm now; `evictDurableObject(stub)` to prove that
  state survives a restart and nothing is re-applied twice.
- Read every response body before `evictDurableObject`: an unread body keeps the request in
  flight and the eviction waits for it (the test times out).
- Point-in-time recovery does not exist locally: restore paths are tested with export/import.

## Measuring
CPU per route is read from Workers observability after a deploy (human checkpoint A) and
re-checked when a line touches a heavy path (crypto for Web Push, schema decoding of TMDB data).
