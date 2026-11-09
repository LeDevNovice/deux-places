# ADR-005 — Contrats partagés et erreurs RFC 9457

- **Statut** : Amendée par ADR-014 et ADR-020
- **Sources** : `docs/specs/technique-v2.md` §15, `docs/plan/commits.md` §13

## Décision

Un contrat `HttpApi` unique dans `src/contracts`, erreurs au format RFC 9457.

## Options écartées

OpenAPI écrit à la main ; tRPC ; GraphQL

## Raison

Une source de vérité typée pour le serveur et la PWA.

## Revoir si

Un second client non TypeScript apparaît.
