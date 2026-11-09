# ADR-008 — Lien magique et passkeys, sessions serveur

- **Statut** : Amendée par ADR-018
- **Sources** : `docs/specs/technique-v2.md` §15, `docs/plan/commits.md` §13

## Décision

Sessions côté serveur, cookie `__Host-session`.

## Options écartées

Mot de passe ; OAuth tiers ; JWT

## Raison

Pas de secret à retenir, résistance au hameçonnage, révocation simple.
