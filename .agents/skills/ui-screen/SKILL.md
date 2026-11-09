---
name: ui-screen
description: Build or change a screen so it matches the maquette, the design spec and the accessibility bar.
whenToUse: For any plan line that adds or changes a screen or a component in src/web or src/ui.
---

# Build a screen

1. Find the plate(s) in `docs/specs/maquettes.pdf` named by the line and the screen's section in
   `docs/specs/design.md` (states table, copy, components). List every state the screen must show.
2. Copy wording from design.md into `src/web/messages.ts`; invent nothing. First names, tutoiement.
3. Compose from `src/ui` components (React Aria). Tokens only; check both ambiances.
4. Data via TanStack Query hooks of the feature; writes through the offline queue.
5. Tests: component tests per state (Testing Library + axe); keyboard-only path; the E2E journey
   when the line says so.
6. Proof: Playwright screenshots of each state in `salle` and `hall`, compared with the plate.
   List remaining differences and why each is acceptable (or fix it). Check: one primary button,
   targets ≥ 48 dp, no looping motion, nothing shown in red for "Non merci", no equity number.
