# ADR-022 — Domaine pur

- **Statut** : Acceptée
- **Sources** : `docs/specs/technique-v2.md` §15, `docs/plan/commits.md` §13

## Décision

Le domaine est en TypeScript pur ; d'Effect il n'importe que `Result`, `Option`, `Data`, `Brand`. Effect complet à partir de la couche application.

## Options écartées

Effect partout

## Raison

Règles testables sans runtime, lisibles par tous.

## Note

Vérifiée par dependency-cruiser et par la revue.
