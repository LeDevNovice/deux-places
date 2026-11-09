# AGENTS.md — src/shared-kernel

Branded ids, UUIDv7, evening date (5 a.m. cutoff, household time zone), week and fortnight,
domain event envelope. Same purity rules as `domain/` in `src/server/AGENTS.md`: from `effect`
only `Result`, `Option`, `Data`, `Brand`, plus `DateTime` for time-zone arithmetic. Every function
here is covered by property tests (fast-check), daylight-saving transitions included.
