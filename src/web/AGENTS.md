# AGENTS.md — src/web (PWA) and src/ui (components)

React 19, Vite 8, TanStack Router + Query, React Aria Components, Workbox.
Spec: `docs/specs/design.md` (wins on look and copy), `docs/specs/maquettes.pdf`, technique-v2 §8.

## Rules

- Every interactive element comes from React Aria (or `src/ui` built on it). Keyboard and screen
  reader work is part of "done", including drag and drop.
- Colours, spacing, radii, durations only through CSS variables of `src/ui/tokens.css`; no hex in
  components. Every screen exists in both ambiances (`salle`, `hall`).
- Design rules that are easy to forget: one primary button per screen; touch targets ≥ 48 dp;
  "Non merci" never bright red; no blinking or looping motion; first names, never "partenaire";
  equity never shown as a score or a debt (RG-42).
- All French copy lives in `src/web/messages.ts`; wording comes from design.md, not invention.
- Server state only via TanStack Query (cache persisted in IndexedDB). No global store.
- Writes go through the offline queue with an `Idempotency-Key`. Optimistic updates only for
  ratings, additions and episode confirmations; swap votes and the ritual wait for the server.
- The API client is derived from `src/contracts` (`HttpApiClient`); never hand-type a response.
- Initial JavaScript budget 170 KB gzip (checked in CI). "Fin vers 22 h 50" is computed on the phone.

## Proof for a screen commit

Playwright screenshots in both ambiances, compared with the named maquette plate (list the
differences you kept and why), axe with zero violations, and a keyboard-only pass.
