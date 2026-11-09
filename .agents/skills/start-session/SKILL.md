---
name: start-session
description: Get up to speed at the start of every session before touching code.
whenToUse: First action of any session, and after any context reset.
---

# Start a session

1. `node scripts/agent/status.mjs` — read all of it: branch, uncommitted changes, last commits,
   next plan line, last PROGRESS entries, result of the green check.
2. If there are uncommitted changes you did not make in this session: do not build on them.
   Report them and stop (a previous session may have stopped mid-way on purpose).
3. If the repo is not green: the session's task is to make it green again with a `fix:` commit
   whose `Plan:` trailer is the line that broke it. Nothing else.
4. If the next line has a `humanGate`, or its status is `blocked`: stop and report.
5. Otherwise state, in two or three sentences, what the next line asks, which spec sections and
   RG rules it cites, and what "verified" will mean for it. Then load skill `implement-commit`.

Keep context small: read only the spec sections the line cites, and only the code it touches.
