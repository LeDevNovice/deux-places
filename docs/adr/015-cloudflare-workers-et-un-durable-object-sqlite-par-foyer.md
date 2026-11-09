# ADR-015 — Cloudflare Workers et un Durable Object SQLite par foyer

- **Statut** : Acceptée
- **Sources** : `docs/specs/technique-v2.md` §15, `docs/plan/commits.md` §13

## Décision

Worker d'entrée mince, Durable Object `Household` par foyer et `Directory` unique, juridiction `eu`.

## Options écartées

PostgreSQL Neon ou Supabase ; machine virtuelle Oracle

## Raison

Sérialisation naturelle des deux téléphones, alarmes, WebSocket hibernés, coût nul.

## Revoir si

Besoin de requêtes entre foyers ou d'un produit public multi-foyers.
