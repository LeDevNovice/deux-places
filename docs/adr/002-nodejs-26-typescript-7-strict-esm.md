# ADR-002 — Node.js 26, TypeScript 7 strict, ESM

- **Statut** : Amendée par ADR-015
- **Sources** : `docs/specs/technique-v2.md` §15, `docs/plan/commits.md` §13

## Décision

TypeScript 7 strict, ESM partout ; Node.js 26 LTS pour l'outillage.

## Options écartées

Node 24 ; TypeScript 6

## Raison

Version LTS active la plus récente ; compilateur natif plus rapide.

## Revoir si

Un outil critique ne supporte pas TS 7.

## Note

L'exécution se fait sur Cloudflare Workers ; Node sert à l'outillage et aux scripts.
