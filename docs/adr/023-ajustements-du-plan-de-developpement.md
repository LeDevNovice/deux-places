# ADR-023 — Ajustements du plan de développement

- **Statut** : Acceptée
- **Sources** : `docs/specs/technique-v2.md` §15, `docs/plan/commits.md` §13

## Décision

Un seul paquet et une seule configuration Vite + Wrangler ; jetons de design écrits en variables CSS avec test de contraste ; couleur d'affiche échantillonnée dans le navigateur ; hooks Git natifs (`.githooks`) au lieu de Lefthook et commitlint ; plan lisible par machine (`plan.json`) gardé par des scripts.

## Options écartées

Espaces de travail pnpm + Turborepo ; DTCG + Style Dictionary ; couleur calculée côté serveur ; Lefthook + commitlint

## Raison

Moins de configuration et de dépendances pour le même contrôle ; plafond CPU de 10 ms ; garde-fous actifs dès le premier commit.

## Revoir si

Plus d'un déployable, ou une seconde équipe.
