# ADR-009 — Outillage du dépôt

- **Statut** : Amendée par ADR-023
- **Sources** : `docs/specs/technique-v2.md` §15, `docs/plan/commits.md` §13

## Décision

pnpm, oxlint, Prettier, dependency-cruiser, Renovate.

## Options écartées

npm/yarn ; Nx ; ESLint seul

## Raison

Installation et CI rapides, frontières vérifiées automatiquement.

## Revoir si

La configuration coûte plus que le gain.

## Note

Turborepo, Lefthook et commitlint retirés par ADR-023.
