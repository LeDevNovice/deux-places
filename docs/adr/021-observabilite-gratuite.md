# ADR-021 — Observabilité gratuite

- **Statut** : Acceptée
- **Sources** : `docs/specs/technique-v2.md` §15, `docs/plan/commits.md` §13

## Décision

Traces OTLP natives d'Effect vers Grafana Cloud Free ; journaux Workers Logs ; pas de suivi d'erreurs tiers.

## Options écartées

SDK OpenTelemetry ; Sentry

## Raison

Gratuit, standard, sans donnée personnelle.

## Revoir si

Les volumes gratuits deviennent insuffisants.
