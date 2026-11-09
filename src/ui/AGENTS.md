# AGENTS.md — src/ui

Shared components and `tokens.css`. All rules of `src/web/AGENTS.md` apply; read it first.

- Components wrap React Aria Components; they expose no styling props beyond the design variants
  listed in `docs/specs/design.md` (components table).
- `tokens.css` holds the exact hex values of design.md; a test asserts every declared text /
  background pair reaches WCAG AA. Changing a value means updating design.md first (human).
- Each component has a Testing Library test with axe, in both ambiances.
