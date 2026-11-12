# ADR-025 — Échéances : mécanisme dans `runtime/`, un port par module

- **Statut** : Acceptée
- **Sources** : `docs/specs/technique-v2.md` §4.3, §4.4, §5.5, §7.1, §7.3, §10.2 ; plan J1.12 ; ADR-001, ADR-024

## Contexte

J1.12 a placé le mécanisme des échéances dans `src/server/runtime/deadlines.ts` : table `deadlines` (sans préfixe de module, §7.1), service `Deadlines`, alarme de l'objet. ADR-024 n'énumère pour `runtime/` que le client SQLite, le migrateur et la liste des migrations. Les modules `catalog` (J7.3), `evening` (J7.6, J8.10), `reserve` (J8.12) et le rappel du rituel devront programmer des échéances et fournir ce qu'elles exécutent. Aujourd'hui, rien n'empêche un module d'importer `runtime/` : dependency-cruiser et `tsc` l'acceptent (essai du 2026-11-12), et le module dépendrait alors des types Cloudflare et du client SQLite.

## Décision

Amende ADR-024.

- Le mécanisme des échéances est une capacité technique de l'objet Foyer : il vit dans `runtime/`, qui peut employer `effect/sql` pour les tables techniques du foyer sans préfixe de module (§7.1).
- Un module qui a besoin d'une échéance déclare dans son `application/` un port à ses mots (par exemple « clore le joker à `endsAt` »). `runtime/` l'implémente avec `Deadlines.schedule` et enregistre, au même endroit, l'exécutant qui appelle le cas d'usage du module par son `index.ts`.
- Le genre d'une échéance est préfixé par son module, comme ses tables (`evening.swap-end`).
- Un module n'importe jamais `runtime/` ni `worker.ts` (règle dependency-cruiser).

## Options écartées

Port `Deadlines` partagé par les modules dans un nouveau dossier serveur ; module propriétaire des échéances (`notifications`) ; ne rien écrire.

## Raison

Ports et adaptateurs dans chaque module (ADR-001 ; `application/` n'importe que les ports qu'il déclare). Le nom d'un genre n'est écrit qu'une fois, dans `runtime/`, à côté de son exécutant. Cloudflare reste dans `runtime/`. Aucun dossier ni aucune couche à créer, aucun code de J1.12 à déplacer. Un port partagé aurait réduit le code par genre, mais au prix d'une couche technique globale (écartée par ADR-001), d'un nouveau dossier et de règles nouvelles, sans aucun module consommateur à ce jour. `notifications` n'est jamais appelé (`CONTEXT.md`) et le rafraîchissement nocturne n'est pas une notification.

## Revoir si

J2.4 retient un emplacement partagé pour les ports serveur (`DomainEvents`) : le port des échéances le suit. Ou si plus de six genres d'échéances rendent les ports par module plus coûteux que le port partagé.
