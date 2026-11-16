# ADR-016 — Coût zéro

- **Statut** : Acceptée
- **Sources** : `docs/specs/technique-v2.md` §15, `docs/plan/commits.md` §13

## Décision

Offres gratuites uniquement ; seule dépense acceptable si un plafond est dépassé : l'offre payante de Cloudflare.

## Options écartées

Hébergement payant dès le départ

## Raison

Projet personnel d'un foyer.

## Revoir si

Le CPU de 10 ms ne tient pas sur une route essentielle.

## Note

Annexe à compléter au point de contrôle A : mesures CPU et poids.

## Annexe — mesures du point de contrôle A (2026-11-14)

Source : journaux d'invocation Workers Logs (`$workers.cpuTimeMs`), version `2d8fabb2-8ecb-4ae1-a14e-f5a596d5a8df` déployée le 2026-11-13 depuis `e210691`, 49 invocations du 2026-11-13 15:00 UTC au 2026-11-14 20:02 UTC, toutes `outcome: ok`. Détail : `docs/plan/checkpoints/A.md`, section 3.

### CPU (plafond gratuit : 10 ms par invocation, Worker comme Durable Object)

| Route ou événement                   | Invocation           | Nb  | Min | Médiane | Max | > 10 ms |
| ------------------------------------ | -------------------- | --- | --- | ------- | --- | ------- |
| `GET /api/v1/health`                 | Worker               | 8   | 9   | 11      | 19  | 6       |
| `GET /api/v1/health`                 | objet Foyer          | 8   | 5   | 7,5     | 37  | 3       |
| `GET /api/export`                    | Worker               | 2   | 13  | 16      | 19  | 2       |
| RPC `exportHousehold`                | objet Foyer          | 2   | 24  | 44,5    | 65  | 2       |
| Alarme (envoi Web Push)              | objet Foyer          | 1   | 14  | 14      | 14  | 1       |
| `GET /api/v1/push/public-key`        | Worker / objet Foyer | 1/1 | —   | 12 / 5  | —   | 1 / 0   |
| `POST /api/v1/push/subscriptions`    | Worker / objet Foyer | 1/1 | —   | 1 / 9   | —   | 0       |
| `POST /api/v1/push/test-notification` | Worker / objet Foyer | 1/1 | —   | 1 / 3   | —   | 0       |
| Pages, `/sw.js`, `/favicon.ico`      | Worker               | 22  | 0   | 1 à 6   | 10  | 0       |

### Poids

- JavaScript initial de la PWA (`pnpm size-budget`, gzip niveau 6) : 140 256 o ≤ 170 000 o.
- Servi par Cloudflare (relevé du 2026-11-14) : zstd 145 608 o, brotli 141 932 o, gzip 139 936 o.
- Worker : 1 313,49 kB non compressé (312,74 kB gzip).

### Revue de la condition « Revoir si »

Atteinte : le CPU de 10 ms ne tient pas sur la route de santé, l'export, la clé publique push (Worker), ni dans l'objet Foyer (santé, export, alarme de push).

Revue du 2026-11-14 par Grégory : l'offre payante est écartée ; « offres gratuites uniquement » est maintenue. Le CPU est réduit : d'abord un profil (J1.20), puis des lignes de réduction écrites d'après ce profil ; la condition est réexaminée après leur relevé dans Workers Logs.

## Annexe — mesures après réduction (point de contrôle A, 2026-11-16)

Source : journaux d'invocation Workers Logs (`$workers.cpuTimeMs`), version `579ba000-3fad-4e5e-a5e9-92c3af85319c` déployée le 2026-11-16 depuis `d282801`, après les lignes de réduction J1.21 (migrateur sauté quand le schéma est à jour), J1.22 (gestionnaire `HttpApi` construit à la première requête) et J1.23 (configuration construite au chargement du module). 67 invocations du 2026-11-16 10:32 à 12:08 UTC, toutes `outcome: ok` : appels faits à la main, espacés jusqu'à 25 min, et export de la sauvegarde planifiée. Détail : `docs/plan/PROGRESS.md`, entrée J1.19.

### CPU après réduction (plafond gratuit : 10 ms par invocation, Worker comme Durable Object)

| Route ou événement                    | Invocation           | Nb  | Min   | Médiane | Max    | > 10 ms |
| ------------------------------------- | -------------------- | --- | ----- | ------- | ------ | ------- |
| `GET /api/v1/health`                  | Worker               | 10  | 1     | 2       | 4      | 0       |
| `GET /api/v1/health`                  | objet Foyer          | 9   | 1     | 16      | 46     | 5       |
| `GET /api/export`                     | Worker               | 1   | 3     | 3       | 3      | 0       |
| RPC `exportHousehold`                 | objet Foyer          | 1   | 13    | 13      | 13     | 1       |
| Alarme (envoi Web Push)               | objet Foyer          | 2   | 15    | 18,5    | 22     | 2       |
| `GET /api/v1/push/public-key`         | Worker / objet Foyer | 3/3 | 1 / 4 | 1 / 5   | 2 / 14 | 0 / 1   |
| `POST /api/v1/push/subscriptions`     | Worker / objet Foyer | 2/2 | 1 / 5 | 1 / 5   | 1 / 5  | 0       |
| `POST /api/v1/push/test-notification` | Worker / objet Foyer | 2/2 | 1 / 5 | 1 / 5   | 1 / 5  | 0       |
| Pages, `/sw.js`, `/favicon.ico`       | Worker               | 30  | 0     | 1       | 4      | 0       |

Worker : 48 invocations de 0 à 4 ms (API : 9 à 19 ms avant). Objet Foyer : 19 invocations, médiane 5 ms ; les 9 au-dessus de 10 ms sont des démarrages à froid sur des appels espacés (13 à 22 ms, une fois 46 ms) ; à chaud, 1 à 5 ms. La configuration lue au chargement du module n'apparaît pas dans le CPU de l'invocation du Worker (première requête après le déploiement : 1 ms).

### Poids après réduction

- JavaScript initial de la PWA (`pnpm size-budget`, gzip niveau 6) : 140 256 o ≤ 170 000 o (inchangé).
- Worker : 1 316,14 kB non compressé (313,59 kB gzip) ; envoi Wrangler 1 285,30 KiB (304,61 KiB gzip).
- « Worker Startup Time » : 30 ms au déploiement de `579ba000…` (20 ms au point de contrôle A, 18 ms après J1.22) ; limite 1 s.

### Revue de la condition « Revoir si » (2026-11-16)

Revue par Grégory : le Worker tient sous 10 ms sur toutes les routes ; seuls les démarrages à froid de l'objet Foyer dépassent, sans aucun `exceededCpu`. Ce dépassement à froid est accepté, et le relevé de ce jour suffit (le critère « 7 jours » proposé en `docs/plan/checkpoints/A.md` 6.1 est abandonné). « Offres gratuites uniquement » est maintenue.
