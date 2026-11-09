# ADR-018 — Passkey d'abord, lien magique de secours

- **Statut** : Acceptée
- **Sources** : `docs/specs/technique-v2.md` §15, `docs/plan/commits.md` §13

## Décision

Passkey à l'inscription et à l'invitation ; lien magique via Brevo en secours.

## Options écartées

Lien magique d'abord ; mot de passe

## Raison

Résistance au hameçonnage, pas d'e-mail à chaque connexion.

## Revoir si

Brevo retire son offre gratuite.
