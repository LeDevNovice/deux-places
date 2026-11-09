# ADR-014 — Effect 4 côté serveur et pour les contrats

- **Statut** : Acceptée
- **Sources** : `docs/specs/technique-v2.md` §15, `docs/plan/commits.md` §13

## Décision

Effect 4.1, version exacte épinglée ; `Schema` et `HttpApi` pour les contrats ; API instables seulement dans `interface/` et `contracts`.

## Options écartées

NestJS 12 ; Hono + Zod

## Raison

Erreurs typées, injection par `Layer`, temps contrôlable (`TestClock`), télémétrie native.

## Revoir si

Une version mineure casse la couche HTTP plus d'une fois par trimestre.
