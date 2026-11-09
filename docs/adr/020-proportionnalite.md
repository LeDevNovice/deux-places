# ADR-020 — Proportionnalité

- **Statut** : Acceptée
- **Sources** : `docs/specs/technique-v2.md` §15, `docs/plan/commits.md` §13

## Décision

Pas de `/api/v2`, de contrôle de compatibilité entre branches, d'environnements par PR, de signature d'images, d'`ETag`, de pagination, ni de revues DORA.

## Options écartées

Tout garder

## Raison

Un foyer, un client déployé avec l'API.

## Revoir si

Un deuxième client ou plusieurs foyers.
