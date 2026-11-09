# ADR-001 — Monolithe modulaire, hexagonal par module

- **Statut** : Acceptée
- **Sources** : `docs/specs/technique-v2.md` §15, `docs/plan/commits.md` §13

## Décision

Un seul déployable, sept modules aux frontières strictes, ports et adaptateurs dans chaque module.

## Options écartées

Microservices ; couches techniques globales

## Raison

Deux utilisateurs par foyer, une personne dans l'équipe : des frontières nettes sans coût réseau.

## Revoir si

Un module doit évoluer à un rythme ou une charge très différents.

## Note

Unité de cohérence : le foyer (ADR-015).
