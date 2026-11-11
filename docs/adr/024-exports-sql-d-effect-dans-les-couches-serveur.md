# ADR-024 — Exports SQL d'Effect dans les couches serveur

- **Statut** : Acceptée
- **Sources** : `docs/specs/technique-v2.md` §2.2, §3.3, §7.2, §10.2 ; plan J1.7

## Contexte

En Effect 4.1.2, tout `effect/sql` (`SqlClient`, `Migrator`…) et tout `@effect/sql-sqlite-do` (`SqliteClient`, `SqliteMigrator`) sont `@stability unstable`. ADR-014 confine les exports instables à `interface/` et `contracts`, alors que §3.3 place `SqlClient` dans `application/`, les pilotes dans `infrastructure/` et l'assemblage du client SQLite et des migrations dans `runtime/` (§10.2).

## Décision

Amende ADR-014. Les exports de `effect/sql` et `@effect/sql-sqlite-do` sont permis là où §3.3 et §10.2 les placent, et seulement là :

- `runtime/` : client SQLite sur le stockage de l'objet, migrateur, liste des migrations ;
- `modules/*/infrastructure/` : adaptateurs ;
- `modules/*/application/` : `SqlClient` seul.

L'exception est déclarée module par module dans `allowedUnstableApis` du greffon `@effect/language-service` de `tsconfig.json`, par chemin, et étendue à une couche par la première ligne du plan qui en a besoin. `tsc` et oxlint lisent la même liste. Tous les autres exports instables (`HttpApi`…) restent dans `interface/` et `contracts`.

## Options écartées

Assemblage SQL dans `interface/` ; règle désactivée dans `runtime/` (admettrait `HttpApi`) ; SQL brut `ctx.storage.sql` sans Effect.

## Raison

Aucune alternative stable n'existe pour le SQL ; chaque couche garde son rôle ; l'exception est nommée et étroite ; la version d'Effect est épinglée et ses mises à jour sont relues.

## Revoir si

`effect/sql` devient stable (retirer l'exception), ou une version mineure casse le SQL plus d'une fois par trimestre.
