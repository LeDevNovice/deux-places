# AGENTS.md — e2e (Playwright)

- Android-like profile; two browser contexts for anything that involves both members.
- Passkeys through Playwright's virtual WebAuthn authenticator; never real credentials.
- Time is driven (browser clock + server test clock) to test 20 h 45, midnight and 5 h.
- Every journey runs `@axe-core/playwright` in both ambiances and must report zero violations.
- One spec file per journey of `docs/specs/produit.md` §3, named after it (`3.6-swap.spec.ts`).
- No `waitForTimeout`: wait for visible state or a network response. A flaky test is quarantined
  with a note in `docs/plan/PROGRESS.md`, never retried in a loop.
