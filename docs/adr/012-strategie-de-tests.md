# ADR-012 — Stratégie de tests

- **Statut** : Acceptée
- **Sources** : `docs/specs/technique-v2.md` §15, `docs/plan/commits.md` §13

## Décision

TDD du domaine, propriétés, intégration réelle, E2E Playwright avec axe, mutation sur le domaine.

## Options écartées

Pyramide de simulacres ; couverture comme objectif

## Raison

La valeur est dans les règles ; vérifier que les tests détectent vraiment les erreurs.

## Revoir si

Le temps de CI dépasse 10 minutes.

## Note

Testcontainers remplacé par `@cloudflare/vitest-plugin`.
