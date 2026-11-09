# Deux Places

PWA qui aide un couple à choisir quoi regarder ce soir : deux personnes par foyer, hébergement gratuit.

- Prérequis : Node 26 (`.nvmrc`) et pnpm 12 (`packageManager` de `package.json`).
- Installation : `pnpm install`, qui active aussi les hooks Git du dépôt (`.githooks`).
- Types : `pnpm tsc --noEmit`.
- Avancement : `node scripts/agent/status.mjs` ; plan dans `docs/plan/plan.json`.
- Agents de code : `AGENTS.md` ; guide humain du kit d'agent : `docs/agent-kit.md`.
- Sources de vérité : `docs/specs/`, `docs/rules.md`, `docs/adr/`, `CONTEXT.md`.
