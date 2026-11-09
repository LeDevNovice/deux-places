# ADR-019 — WebSocket en hibernation

- **Statut** : Acceptée
- **Sources** : `docs/specs/technique-v2.md` §15, `docs/plan/commits.md` §13

## Décision

Temps réel serveur → téléphone par WebSocket hibernés, reprise par numéro de séquence.

## Options écartées

SSE ; RPC Effect pour tout

## Raison

Une connexion inactive ne coûte rien ; les commandes restent en HTTP idempotent.

## Revoir si

Besoin de commandes en temps réel.
