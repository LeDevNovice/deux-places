# Deux Places — spécification technique v2 : Effect et coût zéro

Nov 8, 2026 · @LeDevNovice

## En bref

Deux Places peut tourner à 0 € par mois, écrit en Effect 4, sur Cloudflare : un Worker sert la PWA et les requêtes, et chaque foyer vit dans son propre Durable Object, une petite base SQLite hébergée dans l'Union européenne qui sérialise naturellement les deux téléphones. Cette v2 remplace la [spécification technique v1](https://claude.ai/artifact/FFYBcdBjnavYBhJuC1j9dT) (NestJS, PostgreSQL managé, Cloud Run) sans toucher aux spécifications produit et design.

**Ce qui change**

- **Effect 4** (stable depuis le 30 septembre 2026, version 4.1 en octobre) remplace NestJS, Zod, Kysely, le type `Result` maison, le port `Clock` et le SDK OpenTelemetry : un seul modèle pour les erreurs typées, l'injection de dépendances, la concurrence, les schémas et la télémétrie.
- **Un Durable Object par foyer** remplace PostgreSQL, les verrous `FOR UPDATE`, la boîte d'envoi distribuée par une file et les tâches planifiées : les requêtes d'un foyer passent une par une, les alarmes portent l'échéance du joker et le point d'étape à 15 minutes.
- **WebSocket « hiberné »** remplace SSE : une connexion inactive ne coûte rien.
- **Passkey d'abord**, lien magique par e-mail en secours (offre gratuite Brevo, hébergée en France et en Allemagne).
- **Proportionnalité** : la relecture retire ce qui était surdimensionné pour un seul foyer (versionnement d'API, environnements par PR, signature d'images, revues DORA) et corrige 8 écarts avec la spécification produit.

**Ce qui reste** : le découpage en sept contextes et l'architecture hexagonale, le modèle du domaine, les règles RG testées d'abord, la PWA (React 19, Vite 8, TanStack, React Aria, Workbox), le design system, les contrats partagés, le format d'erreur RFC 9457, l'idempotence des écritures, la couche anticorruption TMDB, Playwright et les tests de mutation.

**Les 3 compromis à accepter** : l'API HTTP d'Effect est encore marquée « unstable » (elle peut changer dans une version mineure) ; l'offre gratuite de Cloudflare plafonne à 10 ms de CPU par requête du Worker, à vérifier dès le squelette ; sans domaine payé, l'adresse sera un sous-domaine `workers.dev`, pas `deuxplaces.app`.

## 1. Relecture critique de la v1

La v1 tient sur l'essentiel (découpage, domaine, PWA, sécurité), mais une relecture ligne à ligne contre la [spécification produit](https://claude.ai/artifact/GNg7aC7e9azSr2LLaedCow) fait apparaître 8 écarts de règles, une dizaine de mécanismes surdimensionnés pour un seul foyer, et des coûts récurrents implicites.

### 1.1 Écarts avec la spécification produit (corrigés dans cette v2)

| # | V1 disait | La spécification produit dit | Correction |
| --- | --- | --- | --- |
| 1 | Test « RG-32 — un joker par membre et par semaine » ; erreur `swap-already-used` « joker déjà joué cette semaine par ce membre » | RG-31 : n'importe quel membre active le joker **une fois par soir** ; RG-32 : le premier titre accepté par les deux est retenu ; RG-35 : pas de second joker après un repli | Erreur `swap-already-used-tonight` ; tests renommés RG-31, RG-32, RG-35 |
| 2 | Erreur `veto-exhausted` : plus de « non merci » pour la semaine | RG-03 : le veto (note 0) n'a pas de quota ; seul son auteur peut le lever | Erreur supprimée ; erreur `veto-owned-by-other` pour un membre qui tente de lever le veto de l'autre |
| 3 | Propriété du moteur : pas de « non merci » cette semaine, « durée max du soir » | RG-02/03 : jamais un titre avec un 0 ; RG-05 : jamais un titre déjà vu proposé comme nouveauté ; RG-31 : filtre énergie et disponibilité ; RG-14 : limite d'épisodes indicative, non bloquante | Propriétés réécrites sur ces quatre règles |
| 4 | Propriété d'équité : écart de cartes blanches borné | RG-22 : une carte blanche par quinzaine et par membre, en alternance ; RG-41/42 : l'équité est l'écart de séances décidées sur 28 jours, utilisée seulement pour pondérer (terme β) | Deux propriétés : alternance stricte des cartes blanches ; bonus β attribué au seul membre le moins servi |
| 5 | « La note d'un membre n'est jamais renvoyée à l'autre » | RG-04 : les notes deviennent visibles **une fois les deux posées** | Règle de projection : note de l'autre masquée tant que la mienne manque, visible ensuite ; test d'API dans les deux sens |
| 6 | Verrouillage optimiste et `409` sur toute modification concurrente | Hors-ligne : « dernière écriture gagne », sauf les notes (une par membre) | Dernière écriture gagne pour réglages et créneaux ; arbitrage serveur seulement pour joker et rituel |
| 7 | Goûts « adorés / détestés » absents du modèle | Table `taste_seed` (5 + 5 par membre), jamais exposée à l'autre | Ajoutés au contexte Réserve et au test de confidentialité |
| 8 | Notifications sans plafond | « 2 titres à noter » : au plus une par jour ; toutes désactivables | Plafond quotidien et préférences par type dans le contexte Notifications |

### 1.2 Surdimensionné pour un foyer

Le craftsmanship, c'est aussi ne pas construire ce dont on n'a pas besoin. Avec deux utilisateurs, ces mécanismes coûtent plus en temps et en argent qu'ils ne protègent :

- versionnement `/api/v2` et contrôle de compatibilité OpenAPI entre branches (le seul client est déployé avec l'API) ;
- environnement de prévisualisation par PR, signature d'images, SBOM et analyse d'images Docker (il n'y a plus d'image) ;
- pagination par curseur et `ETag` sur une Réserve de quelques centaines de titres au plus ;
- disjoncteur maison, plan LISTEN/NOTIFY pour plusieurs instances, table de drapeaux de fonctionnalités ;
- revue mensuelle des indicateurs DORA et SLO à 99,5 % sans contrat de service de l'hébergeur gratuit.

Ce qui reste, parce que ça protège les soirées du couple : types stricts, tests des règles, tests de concurrence, contrat partagé, idempotence, sauvegardes testées.

### 1.3 Coûts récurrents implicites de la v1

| Poste v1 | Pourquoi il coûte | En v2 |
| --- | --- | --- |
| Cloud Run avec une instance toujours allumée | Nécessaire pour SSE et le travailleur pg-boss, donc facturée en continu | Worker + Durable Object, offre gratuite |
| Cloud SQL PostgreSQL | Pas d'offre gratuite permanente | SQLite intégré au Durable Object |
| Domaine `deuxplaces.app` | Renouvellement annuel | Sous-domaine `workers.dev` gratuit (section 9) |
| Gestionnaire de secrets, suivi d'erreurs, e-mail | Offres payantes ou limitées | Secrets Cloudflare, journaux Workers, Brevo gratuit |

## 2. L'écosystème Effect 4 en novembre 2026

Effect 4 est stable depuis le 30 septembre 2026 et bénéficie d'un support long jusqu'en septembre 2029 au moins ; la version courante est la 4.1 (20 octobre 2026). C'est une réécriture complète de la v3 : un cœur sans dépendance, plus rapide et plus léger, qui intègre désormais la plupart des anciens paquets séparés ([annonce Effect 4.0](https://effect.website/blog/releases/effect/40)).

### 2.1 Chronologie

| Date | Étape |
| --- | --- |
| 20 octobre 2026 | Effect 4.1 : `HttpApi` sait produire et décoder des erreurs RFC 9457, nouveaux modules `crypto` ([annonce 4.1](https://effect.website/blog/releases/effect/41)) |
| 8 octobre 2026 | 4.0.2 : ajout des étiquettes « unstable » oubliées sur certains modules ; spans HTTP et SQL alignés sur les conventions OpenTelemetry ([première semaine](https://effect.website/blog/effect-4-first-week)) |
| 30 septembre 2026 | Effect 4.0 stable |
| 12 août 2026 | Version candidate |
| 20 février 2026 | Bêta publique ([liste des billets](https://effect.website/blog)) |

### 2.2 Ce que contient l'écosystème

| Besoin de Deux Places | Module Effect 4 | Statut |
| --- | --- | --- |
| Erreurs typées, injection de dépendances, concurrence | `Effect`, `Layer`, `Context.Service`, `Result`, `Data` | Stable |
| Schémas partagés client/serveur | `Schema` | Stable |
| Horloge et temps contrôlé en test | `Clock`, `DateTime`, `testing/TestClock` | Stable |
| Nouvelles tentatives, délais | `Schedule`, `Effect.timeout`, `Effect.retry` | Stable |
| API HTTP typée, OpenAPI, client dérivé | `http-api/HttpApi`, `HttpApiBuilder`, `OpenApi`, `HttpApiClient`, `HttpApiError` ([référence](https://effect.website/docs/v4/api/effect/http-api/HttpApiBuilder)) | **Unstable** |
| SQL, migrations | `sql/SqlClient`, `sql/Migrator` + `@effect/sql-sqlite-do` (Durable Objects) ou `@effect/sql-pg` | À vérifier export par export |
| Télémétrie | `observability/Otlp`, `@effect/opentelemetry` | À vérifier |
| Tests | `@effect/vitest` 4.1 | Stable |
| État réactif côté client | `reactivity/Atom`, `@effect/atom-react` | À vérifier |

La liste complète des paquets est dans la [référence de l'API v4](https://effect.website/docs/v4/api) : 4 plateformes (Node, Bun, Deno, navigateur), 12 pilotes SQL dont D1 et Durable Objects, 6 fournisseurs d'IA, OpenTelemetry, Vitest.

### 2.3 Chiffres publiés par l'équipe Effect (3.x → 4.x)

| Mesure | 3.x | 4.x |
| --- | --- | --- |
| Programme minimal (minifié, gzip) | 35,6 ko | 7,1 ko |
| Débit de tâches concurrentes | 0,71 M/s | 4,57 M/s |
| Mémoire pour 50 000 fibres | 157,5 Mo | 21,8 Mo |

Téléchargements npm : 43,9 millions la semaine du 21 septembre 2026, dont 56 % pour la 4.x.

### 2.4 Risques

- **Modules « unstable »** : depuis la 4.0, la stabilité est portée par une étiquette sur chaque export ; un export « unstable » ou « experimental » peut changer dans une version mineure ou de correctif. Toute la couche HTTP est dans ce cas. Parade : versions épinglées, couche HTTP mince, mises à jour groupées avec la CI comme filet, et le service de langage Effect configuré pour signaler chaque usage d'API instable.
- **Jeunesse de la 4.x** : six semaines de version stable ; une partie des exemples en ligne visent encore la v3 ou la bêta (anciens chemins `effect/unstable/...`, `ServiceMap`). La référence 4.1 fait foi.
- **Courbe d'apprentissage** : programmation par effets, `Layer`, générateurs. C'est le coût principal, traité en section 14.

## 3. Effect pour Deux Places : décision

Décision : Effect 4 côté serveur et pour les contrats partagés, avec un domaine qui reste fait de fonctions pures. Effect remplace six briques de la v1 par un seul modèle cohérent, et ses forces (erreurs dans le type, temps contrôlable, concurrence structurée) correspondent exactement aux risques de ce produit : règles d'équité, délais du joker, deux téléphones en même temps.

### 3.1 Ce qu'Effect remplace

| Besoin | V1 | V2 avec Effect 4 | Gain |
| --- | --- | --- | --- |
| Erreurs métier | `Result<T, DomainError>` maison + exceptions | Canal d'erreur typé `Effect<A, E, R>`, erreurs `Schema.TaggedErrorClass` | Le compilateur liste les erreurs possibles de chaque cas d'usage ; un `switch` oublié ne compile pas |
| Injection de dépendances | Modules et décorateurs NestJS | `Context.Service` + `Layer` | Dépendances visibles dans le type `R` ; une dépendance manquante est une erreur de compilation, pas d'exécution |
| Schémas et contrats | Zod 4 + génération OpenAPI | `Schema` + `HttpApi` + `OpenApi` + `HttpApiClient` | Un seul langage de schémas pour décoder, encoder, documenter et générer le client |
| Erreurs HTTP RFC 9457 | Filtre d'exceptions à écrire | `HttpApiError.Problem` (4.1) | Natif, documenté dans l'OpenAPI |
| Horloge | Port `Clock` maison | `Clock` + `TestClock` | Les 3 minutes du joker et les 15 minutes du point d'étape se testent en avançant le temps, sans attendre |
| Délais, réessais | Code maison autour de `fetch` | `Effect.timeout`, `Effect.retry` + `Schedule` | Politique déclarative, testable avec `TestClock` |
| Télémétrie | SDK OpenTelemetry + instrumentation | `Effect.withSpan`, export OTLP natif | Chaque cas d'usage est une span sans code supplémentaire |
| SQL | Kysely | `SqlClient` + `@effect/sql-sqlite-do` | Transactions et requêtes dans le même modèle d'erreurs |

### 3.2 Ce que ça coûte

- **Apprentissage** : Grégory connaît NestJS par cœur ; Effect demande quelques semaines pour être à l'aise avec `Effect.gen`, `Layer` et le canal d'erreur. Le projet est petit et sans délai imposé : c'est le bon terrain pour ce coût.
- **Couche HTTP instable** : voir 2.4 ; elle est volontairement mince (décoder, appeler un cas d'usage, encoder).
- **Lisibilité pour un tiers** : un développeur qui ne connaît pas Effect lira moins vite le code applicatif. Le domaine, lui, reste du TypeScript ordinaire.

### 3.3 Règle d'usage d'Effect par couche

| Couche | Effect autorisé | Raison |
| --- | --- | --- |
| `domain/` | Seulement les modules de données stables et purs : `Result`, `Option`, `Data`, `Brand` | Le domaine reste des fonctions pures, testables sans runtime, lisibles par tous |
| `application/` | `Effect`, services, `Clock`, `SqlClient` via les ports | Orchestration : transaction, horloge, dépôts, événements |
| `infrastructure/` | Tout Effect + pilotes | Adaptateurs : SQLite du Durable Object, TMDB, push, e-mail |
| `interface/` | `HttpApi`, `HttpApiBuilder` (instable) | Isolé pour absorber les changements d'API |
| `packages/contracts` | `Schema`, `HttpApi` | Partagé avec la PWA |

Cette règle est vérifiée par dependency-cruiser comme les frontières de modules ; le service de langage Effect signale en plus tout usage d'export instable hors de `interface/` et `contracts`.

### 3.4 Alternatives écartées

- **Garder NestJS** : valable, mais ne résout ni le coût (processus permanent) ni le temps contrôlable ; NestJS sur Cloudflare Workers n'est pas un usage prévu.
- **Effect partout, y compris dans le domaine** : générateurs et services dans les règles pures n'apportent rien et rendent les tests de propriétés plus lourds.
- **Hono + Zod sur Workers** : léger et gratuit aussi, mais il faudrait reconstruire à la main erreurs typées, injection, temps contrôlable et télémétrie.

## 4. Architecture révisée

On garde le monolithe modulaire hexagonal de la v1 ; ce qui change, c'est l'unité de cohérence. En v1, c'était une transaction PostgreSQL avec verrous. En v2, c'est **le foyer** : un Durable Object par foyer reçoit toutes les commandes de ses deux membres une par une, dans l'ordre, avec sa propre base SQLite. Les invariants de chaque agrégat restent protégés par le domaine ; la sérialisation vient de la plateforme.

### 4.1 Où vit chaque contexte

| Contexte | Exécuté dans | Données | Pourquoi |
| --- | --- | --- | --- |
| Foyer (comptes, invitation, passkeys) | Worker + Durable Object **Annuaire** (un seul, juridiction UE) | Membres, identifiants de passkeys, codes d'invitation, sessions → foyer | Il faut trouver le foyer d'une session ou d'un code avant d'entrer dans le foyer |
| Foyer (réglages, abonnements, semaine type) | Durable Object **Foyer** | SQLite du foyer | Lu par le moteur et le Programme |
| Catalogue | Worker (appels TMDB) + cache dans le Durable Object Foyer | Instantanés des titres suivis par le foyer | Pas de base globale à gérer ; quelques centaines de titres par foyer |
| Réserve, Programmation, Soirée, Souvenirs | Durable Object Foyer | SQLite du foyer | Toutes les règles d'un soir et d'une semaine sont internes au foyer |
| Notifications | Durable Object Foyer (WebSocket, alarmes, envoi push) | Abonnements push, préférences, plafonds | Le foyer connaît ses deux téléphones et ses échéances |

### 4.2 Les trois rôles

1. **Worker d'entrée** (mince) : sert la PWA, vérifie la session auprès de l'Annuaire, proxifie la recherche TMDB, puis transmet la requête au Durable Object du foyer. Il ne contient aucune règle métier.
2. **Durable Object Annuaire** : les seules données transverses (qui appartient à quel foyer, codes d'invitation, défis WebAuthn).
3. **Durable Object Foyer** : l'application elle-même. Il héberge l'API `HttpApi` du foyer, les sept modules, les WebSocket des deux téléphones et une alarme qui porte la prochaine échéance (fin de joker, point d'étape, rafraîchissement nocturne des disponibilités, rappel du rituel).

### 4.3 Règles de dépendance (inchangées, plus une)

- Un module n'appelle un autre module que par son `index.ts` public ; jamais ses tables ni son domaine.
- Les dépendances vont de l'aval vers l'amont : Soirée → Programmation → Réserve → Catalogue / Foyer. Souvenirs et Notifications réagissent aux événements.
- Chaque module possède ses tables, préfixées par module (`reserve_items`, `evening_swaps`…), dans la même base SQLite du foyer.
- **Nouveau** : le code d'un module ne connaît ni Cloudflare ni le Durable Object ; seule la couche `runtime/` du Durable Object assemble les `Layer`.

### 4.4 Arborescence

```
deux-places/
├─ apps/
│  ├─ edge/                  Worker d'entrée + Durable Objects (Annuaire, Foyer)
│  │  └─ src/
│  │     ├─ modules/<contexte>/{domain,application,infrastructure,interface}
│  │     ├─ interface/        Assemblage de l'HttpApi (exports instables) et routes techniques hors contexte (`system`)
│  │     ├─ runtime/          Assemblage des Layer, classes Durable Object, alarmes, WebSocket
│  │     └─ worker.ts         Point d'entrée : statiques, session, routage vers le foyer
│  └─ web/                   PWA React 19 + Vite 8 (inchangée dans sa structure)
├─ packages/
│  ├─ contracts/             Schema + définition HttpApi partagée, événements temps réel
│  ├─ shared-kernel/         Identifiants marqués, enveloppe d'événement, date de soirée
│  ├─ design-tokens/         DTCG → variables CSS (Salle / Hall)
│  └─ ui/                    Composants React Aria (billet, fauteuils, sélecteur de note…)
├─ e2e/                      Parcours Playwright
├─ docs/adr/                 Décisions (MADR)
├─ wrangler.jsonc            Liaisons Durable Objects, assets, cron, variables
└─ CONTEXT.md                Glossaire FR ↔ EN, carte des contextes
```

## 5. Domaine et cas d'usage en Effect

Le modèle du domaine de la v1 (sept agrégats, cycles de vie, événements, glossaire `CONTEXT.md`) est repris tel quel, corrigé des écarts de la section 1.1. Ce qui change, c'est la manière de l'écrire : règles en fonctions pures qui renvoient un `Result`, cas d'usage en `Effect` qui orchestrent horloge, dépôts et événements.

> Les extraits ci-dessous sont des esquisses écrites contre la référence Effect 4.1 ; les noms exacts sont à confirmer par le compilateur au squelette ambulant.

### 5.1 Identifiants et valeurs

```ts
// packages/shared-kernel/src/ids.ts
import { Brand } from "effect"

export type HouseholdId = string & Brand.Brand<"HouseholdId">
export const HouseholdId = Brand.nominal<HouseholdId>()
export type MemberId = string & Brand.Brand<"MemberId">
export const MemberId = Brand.nominal<MemberId>()
// Identifiants UUIDv7 générés côté application (triables par date)
```

- **Date de soirée** : fonction pure `eveningDateOf(instant, zone, cutoffHour = 5)` construite sur `DateTime` d'Effect (fuseau `Europe/Paris`) ; une séance lancée à 0 h 40 appartient à la veille.
- **Valeurs** : `Rating` (0 à 3), `Energy` (`light` / `dense`), `Vote` sont des types immuables ; leurs schémas `Schema` vivent dans `contracts` pour décoder les entrées.

### 5.2 Une règle pure : le vote du joker (RG-32, RG-33)

```ts
// modules/evening/domain/swap.ts — aucune dépendance d'exécution
import { Data, Result } from "effect"

export class SwapClosed extends Data.TaggedError("SwapClosed")<{
  readonly reason: "deadline" | "resolved"
}> {}

export const castVote = (swap: Swap, vote: Vote, now: Date): Result.Result<Swap, SwapClosed> => {
  if (swap.status !== "voting") return Result.fail(new SwapClosed({ reason: "resolved" }))
  if (now >= swap.endsAt) return Result.fail(new SwapClosed({ reason: "deadline" })) // RG-33
  const votes = [...swap.votes.filter((v) => !sameBallot(v, vote)), vote]
  const winner = swap.candidates.find((c) => okCount(votes, c) === 2)              // RG-32
  return Result.succeed(winner ? { ...swap, votes, status: "accepted", winner } : { ...swap, votes })
}
```

Le premier titre qui reçoit deux « OK » fait passer le joker à `accepted` au moment même de ce vote ; tout vote suivant reçoit `SwapClosed`. Comme le Durable Object traite les votes l'un après l'autre, il n'existe pas d'entrelacement possible.

### 5.3 Un cas d'usage : orchestrer sans règle

```ts
// modules/evening/application/cast-swap-vote.ts
import { Clock, Effect, Result } from "effect"

export const castSwapVote = Effect.fn("CastSwapVote")(function* (cmd: CastSwapVoteCommand) {
  const evenings = yield* EveningRepository        // port, fourni par un Layer
  const outbox = yield* DomainEvents               // journal d'événements du foyer
  const now = new Date(yield* Clock.currentTimeMillis)

  const swap = yield* evenings.getSwap(cmd.eveningDate)           // erreur SwapNotFound
  const next = castVote(swap, cmd.vote, now)
  if (Result.isFailure(next)) return yield* Effect.fail(next.failure)

  yield* evenings.saveSwap(next.success)
  yield* outbox.append(swapEventsOf(swap, next.success))         // SwapVoteCast, SwapResolved
  return toSwapState(next.success)
})
// Type inféré : Effect<SwapState, SwapNotFound | SwapClosed, EveningRepository | DomainEvents>
```

Le type dit tout : ce que le cas d'usage renvoie, les deux erreurs métier possibles, les deux services dont il a besoin. L'interface HTTP doit traiter `SwapNotFound` et `SwapClosed`, sinon elle ne compile pas.

### 5.4 Transactions et événements

- Chaque commande s'exécute dans `sql.withTransaction` sur la base SQLite du foyer : l'état de l'agrégat et ses événements sont écrits ensemble, ou pas du tout.
- La table `domain_events` remplace la boîte d'envoi de la v1 : après validation, le Durable Object diffuse l'événement aux WebSocket ouverts et appelle les réactions internes (Souvenirs, Notifications) ; au redémarrage, il reprend les événements non traités.
- Plus de file externe ni de consommateur distant : tout le foyer est dans le même processus logique, donc la livraison « au moins une fois » devient une simple reprise sur la table, avec un marqueur `handled_at` par réaction.

### 5.5 Horloge, délais et alarmes

- Aucune lecture de l'heure système dans le code : `Clock` d'Effect partout, `TestClock` en test.
- Les échéances métier (fin du joker à `endsAt`, point d'étape à lancement + 15 min, rappel du rituel, rafraîchissement nocturne) sont des lignes d'une table `deadlines` ; le Durable Object arme une seule alarme sur la plus proche. À l'alarme, il exécute les échéances dues puis réarme.
- L'issue du joker ne dépend pas de l'alarme : `castVote` refuse tout vote après `endsAt`, et la lecture de Ce soir calcule `TimedOut` si l'échéance est passée. L'alarme sert seulement à prévenir les téléphones à temps.

## 6. API, contrats et temps réel

Le contrat est une définition `HttpApi` écrite une fois dans `packages/contracts` : le Durable Object l'implémente, la PWA en dérive son client typé, et le document OpenAPI en sort sans générateur externe. Le temps réel passe par un WebSocket par téléphone, en lecture seule.

### 6.1 Forme du contrat

- **Groupes** : un `HttpApiGroup` par contexte (`household`, `catalog`, `reserve`, `programme`, `evening`, `stubs`, `notifications`), préfixe `/api/v1`. Les routes de la [spécification produit](https://claude.ai/artifact/GNg7aC7e9azSr2LLaedCow) sont reprises (`/tonight`, `/reserve`, `/jokers/{id}/votes`, `/weeks/{weekStart}/ritual/{step}`…).
- **Schémas** : `Schema.Class` pour les réponses, `Schema.Struct` pour les entrées, identifiants marqués ; les mêmes schémas décodent côté serveur et côté client.
- **Commandes** : sous-ressources explicites en `POST` ; en-tête `Idempotency-Key` obligatoire, réponse mémorisée 48 h dans la base du foyer et rejouée à l'identique.
- **Concurrence** : plus d'`If-Match`. Le Durable Object traite les commandes une par une ; une commande rejouée depuis la file hors-ligne est jugée sur l'état courant. Si l'effet voulu est déjà là (étape du rituel validée par l'autre), la réponse est un succès qui renvoie l'état ; sinon une erreur métier explicite. Réglages et créneaux suivent « dernière écriture gagne », comme le demande la spécification produit.
- **Retiré de la v1** : politique `/api/v2`, contrôle de compatibilité entre branches, `ETag`, pagination par curseur (voir 1.2). La PWA et l'API sont déployées ensemble ; une rupture de contrat se voit à la compilation.

### 6.2 Erreurs RFC 9457 (corrigées)

Depuis la 4.1, `HttpApi` produit et décode nativement des *Problem Details* ([RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html)) avec `HttpApiError.Problem`, et les documente dans l'OpenAPI. La couche `interface/` traduit chaque erreur du domaine vers son type public.

| Type (`/problems/…`) | Statut | Erreur du domaine | Règle |
| --- | --- | --- | --- |
| `validation` | 400 | Décodage `Schema` refusé | — |
| `swap-already-used-tonight` | 409 | `SwapAlreadyUsedTonight` | RG-31, RG-35 |
| `swap-closed` | 409 | `SwapClosed` (échéance dépassée ou joker résolu) | RG-32, RG-33 |
| `veto-owned-by-other` | 403 | `VetoOwnedByOther` | RG-03 |
| `not-eligible` | 409 | `TitleNotEligible` (note manquante ou 0) | RG-02 |
| `ritual-step-out-of-order` | 409 | `RitualStepOutOfOrder` | RG-24 |
| `household-full` | 409 | `HouseholdFull` (déjà deux membres) | — |
| `invitation-expired` | 410 | `InvitationExpired` (périmée ou utilisée) | — |
| `idempotency-key-reused` | 422 | Même clé, corps différent | — |
| `not-found` | 404 | Ressource absente ou d'un autre foyer | — |
| `rate-limited` | 429 | Avec `Retry-After` | — |

Le champ `instance` porte l'identifiant de trace ; une erreur imprévue renvoie un 500 sans détail. Les erreurs `veto-exhausted` et « joker déjà joué cette semaine » de la v1 disparaissent (section 1.1).

### 6.3 Temps réel : WebSocket hiberné

- **Pourquoi pas SSE** : un flux SSE garde le Durable Object actif, donc facturé à la durée. L'API WebSocket « hibernation » de Cloudflare laisse l'objet s'endormir entre deux messages sans couper la connexion ; un objet inactif en hibernation n'accumule pas de durée ([tarifs Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing)).
- **Sens unique** : le serveur pousse, le téléphone ne commande jamais par le WebSocket (les commandes restent en HTTP, idempotentes et mises en file hors-ligne).
- **Messages** : union `Schema` des événements publics (`swap.vote_cast`, `swap.resolved`, `ritual.step_validated`, `reserve.item_added`, `rating.revealed`…), chacun avec son numéro de séquence ; charge minimale, jamais la note à l'aveugle de l'autre avant RG-04.
- **Reprise** : à la reconnexion, la PWA envoie le dernier numéro reçu (`/api/v1/live?since=…`) et l'objet rejoue la suite depuis `domain_events`.
- **Veille** : ping/pong répondu automatiquement par la plateforme, sans réveiller l'objet.

### 6.4 Pourquoi pas tout en RPC Effect

Effect propose un RPC typé sur WebSocket. On le réserve à un usage futur : les lectures en `GET` sont mises en cache par le service worker (Ce soir hors connexion), la cible de partage Android et les actions de notification envoient des `POST` HTTP, et la file d'écritures hors-ligne rejoue des requêtes HTTP. HTTP reste donc le bon transport des commandes.

## 7. Persistance, échéances et événements

Chaque foyer a sa base SQLite, intégrée à son Durable Object et lue sans réseau ; PostgreSQL, pg-boss et la file de la boîte d'envoi disparaissent. L'accès passe par le `SqlClient` d'Effect avec le pilote `@effect/sql-sqlite-do` et ses migrations `SqliteMigrator` ([référence](https://effect.website/docs/v4/api/sql-sqlite-do)).

### 7.1 Tables

| Base | Tables (préfixe = module) | Contraintes clés |
| --- | --- | --- |
| Annuaire (un seul objet) | `accounts`, `passkey_credentials`, `sessions`, `magic_link_tokens`, `invitations`, `webauthn_challenges` | Jetons et codes stockés hachés ; invitation à usage unique, 7 jours ; un compte = un foyer |
| Foyer (un objet par foyer) | `household_settings`, `household_members`, `household_subscriptions` | Exactement 2 membres actifs |
|  | `catalog_titles`, `catalog_availability` | Clé (tmdb\_id, media\_type) ; date de vérification par titre (« Vérifié ce soir ») |
|  | `reserve_items`, `reserve_ratings`, `reserve_taste_seeds`, `reserve_reruns` | `CHECK (value BETWEEN 0 AND 3)` ; une note par membre et par titre ; goûts jamais exposés à l'autre |
|  | `programme_lineup`, `programme_series_progress`, `programme_week_plans`, `programme_slots` | Index unique partiel : une seule série du couple et une seule suivante |
|  | `evening_showings`, `evening_swaps`, `evening_swap_votes` | Une séance principale par soir ; un joker par soir ; un vote par (membre, candidat) |
|  | `stubs_feedback`, `stubs_week_ratings` | Une note de semaine par membre |
|  | `notifications_push_subscriptions`, `notifications_prefs`, `notifications_sent` | Plafond quotidien par type |
|  | `domain_events`, `event_reactions`, `idempotency_keys`, `deadlines` | Séquence croissante ; clés purgées après 48 h |

SQLite accepte les contraintes `CHECK`, les index uniques partiels et les clés étrangères : les invariants doublés en base de la v1 sont conservés. Les instants sont stockés en millisecondes UTC, les dates de soirée et semaines en texte ISO.

### 7.2 Migrations

- Fichiers SQL versionnés, embarqués dans le bundle ; chaque Durable Object applique ses migrations à son premier réveil après un déploiement, avant de traiter la moindre requête.
- Le code et la base d'un foyer avancent ensemble (même déploiement, même objet) : le découpage « étendre puis contracter » n'est plus nécessaire entre l'API et sa base. Il reste nécessaire pour le **contrat HTTP** tant qu'une ancienne PWA peut tourner en cache : un champ n'est retiré qu'après une mise à jour du service worker.
- Une migration ne détruit jamais de données sans export préalable ; les migrations sont testées sur une copie anonymisée d'un export réel.

### 7.3 Échéances (remplacent les tâches pg-boss)

| Échéance | Quand | Effet |
| --- | --- | --- |
| Fin du joker | `endsAt` (180 s) | `TimedOut`, proposition d'un doudou, message aux deux téléphones (RG-33) |
| Point d'étape | Lancement + 15 min, titre jamais vu | Web Push « On continue ? » (RG-34) |
| Disponibilités | Chaque nuit vers 4 h | Rafraîchit les titres suivis par lots (une alarme traite un lot puis réarme pour le suivant) |
| Réapprovisionnement | Après une note, avec un délai de regroupement | Suggestions si moins de 3 séries ou 3 films prêts |
| Rappel du rituel | Dimanche, heure réglée | Push si le rituel n'est pas fait |
| Purge | Chaque nuit | Clés d'idempotence, événements traités anciens, jetons expirés |

Une seule alarme par objet suffit : elle vise toujours la prochaine ligne de `deadlines`. Le rafraîchissement par lots respecte le plafond de 50 sous-requêtes par invocation de l'offre gratuite ([limites Workers](https://developers.cloudflare.com/workers/platform/limits/index.md)). Un déclencheur Cron quotidien du Worker vérifie, par l'Annuaire, que chaque foyer a bien une alarme armée.

### 7.4 Volumétrie face aux plafonds gratuits

Avec un foyer, l'ordre de grandeur est de quelques centaines de requêtes et de lignes écrites par jour (estimation, à mesurer). Les plafonds gratuits des Durable Objects sont de 100 000 requêtes, 5 millions de lignes lues et 100 000 lignes écrites par jour, avec 5 Go de stockage au total ([tarifs](https://developers.cloudflare.com/durable-objects/platform/pricing)). Chaque `setAlarm()` compte pour une ligne écrite.

## 8. Frontend PWA

La PWA de la v1 est conservée presque entièrement (React 19, Vite 8, TanStack Router et Query, React Aria, Workbox, file d'écritures IndexedDB, design system Salle / Hall, budgets de performance). Effect n'entre côté client que par le contrat partagé.

### 8.1 Ce qui change

| Sujet | V1 | V2 |
| --- | --- | --- |
| Contrat | Client généré depuis les schémas Zod | Client `HttpApiClient` dérivé de la définition `HttpApi` de `contracts`, appelé dans les `queryFn` et `mutationFn` de TanStack Query |
| Paramètres d'URL validés | Zod | `Schema`, via son adaptateur Standard Schema |
| Temps réel | `EventSource` (SSE) | WebSocket avec reconnexion progressive et reprise par numéro de séquence ; chaque message invalide ou met à jour les clés Query concernées |
| Conflits hors-ligne | `409` puis réconciliation | Le serveur juge sur l'état courant (6.1) ; la PWA affiche l'état gagnant (« \[prénom\] a déjà validé cette étape ») |
| Notes à l'aveugle | Jamais affichées | Affichées dès que les deux notes sont posées (RG-04), via l'événement `rating.revealed` |
| Hébergement | Servie par l'API | Fichiers statiques servis par le Worker (Workers Static Assets), même origine que l'API |

### 8.2 Pourquoi pas Effect Atom

`@effect/atom-react` existe, mais TanStack Query apporte déjà ce dont la PWA a besoin et qu'il faudrait reconstruire : cache persisté dans IndexedDB pour l'ouverture instantanée, mutations hors-ligne en pause puis reprises, invalidation par clé. On évite aussi de mélanger deux modèles d'état dans une petite application.

### 8.3 Garde-fou de poids

Le budget de la v1 reste : JavaScript initial de Ce soir ≤ 170 Ko compressés. Le programme Effect minimal pèse 7,1 ko compressés selon l'équipe Effect, mais `Schema` et le client HTTP en ajoutent. Le squelette ambulant mesure ce coût réel ; s'il dépasse ce qui est acceptable, la PWA garde `Schema` pour décoder et remplace `HttpApiClient` par un petit `fetch` typé généré depuis le même contrat.

### 8.4 Inchangé (rappel)

- Workbox : précache de la coquille, réseau d'abord avec repli cache pour `/tonight`, cache d'abord pour les affiches TMDB.
- File d'écritures IndexedDB avec `Idempotency-Key`, rejouée par Background Sync sur Chrome Android, sinon à l'ouverture.
- Manifeste avec `share_target`, actions « Oui » / « Une reprise plutôt » du point d'étape dans le service worker.
- Jetons DTCG → variables CSS, ambiance par `data-ambiance`, polices auto-hébergées, `prefers-reduced-motion`, React Aria pour l'accessibilité et le glisser-déposer du Programme.

## 9. Coût zéro : les offres gratuites et leurs limites

Oui, tout peut tourner à 0 € : chaque besoin de la spécification a une offre gratuite permanente qui couvre largement un foyer. Le seul renoncement visible est le nom de domaine `deuxplaces.app` des maquettes. Relevé au 8 novembre 2026 ; ces offres changent, elles sont donc revérifiées avant le squelette.

### 9.1 L'empilement retenu

| Besoin | Offre gratuite | Plafonds qui comptent pour nous |
| --- | --- | --- |
| Calcul et fichiers de la PWA | Cloudflare Workers Free | 100 000 requêtes par jour ; **10 ms de CPU par requête** ; 128 Mo de mémoire ; 5 déclencheurs Cron ; 50 sous-requêtes par invocation ([limites](https://developers.cloudflare.com/workers/platform/limits/index.md)) |
| Données, temps réel, échéances | Durable Objects avec SQLite (disponible en Free) | 100 000 requêtes, 13 000 Go-s, 5 M lignes lues, 100 000 lignes écrites par jour ; 5 Go stockés ; au-delà, l'opération échoue, rien n'est facturé ([tarifs](https://developers.cloudflare.com/durable-objects/platform/pricing)) |
| Résidence des données | Juridiction `eu` des Durable Objects | Exécution et stockage dans l'UE ; l'identifiant de l'objet peut être journalisé hors UE ([localisation des données](https://developers.cloudflare.com/durable-objects/reference/data-location/)) |
| Sauvegardes | Restauration à un instant donné du SQLite des Durable Objects | 30 derniers jours ; non disponible en local ([API SQL](https://developers.cloudflare.com:2053/durable-objects/api/sql-storage)) |
| E-mail (lien magique de secours) | Brevo gratuit | 300 e-mails par jour, sans limite de durée ; données hébergées en France et en Allemagne ([Brevo](https://www.brevo.com/en/features/email-api/)) |
| Notifications | Web Push (services de push des navigateurs) | Gratuit, sans compte ; chiffrement et signature VAPID faits par nous |
| Catalogue | API TMDB | Usage non commercial, attribution obligatoire ([documentation](https://developer.themoviedb.org/docs)) |
| Journaux | Workers Logs | 200 000 événements par jour, conservés 3 jours ; tarification qui change le 1er décembre 2026 ([Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)) |
| Traces | Grafana Cloud Free | 14 jours de rétention ; volumes inclus non publiés sur la page ([offre gratuite](https://grafana.com/products/cloud/free-tier)) |
| Intégration continue | GitHub Actions | Gratuit et illimité pour un dépôt public ; 12 $ de calcul inclus par mois pour un dépôt privé, soit environ 2 000 minutes Linux ([facturation](https://docs.github.com/en/billing/concepts/product-billing/github-actions)) |
| Adresse | Sous-domaine `<nom>.<compte>.workers.dev` | Gratuit ; voir 9.3 |

### 9.2 Alternatives étudiées

| Option | Ce qu'elle garde | Pourquoi elle n'est pas retenue |
| --- | --- | --- |
| PostgreSQL Neon Free + calcul gratuit | PostgreSQL et le modèle v1 | 1 Go par projet, 100 heures de calcul par mois, mise en veille après 5 minutes d'inactivité non désactivable, historique de restauration de 6 heures ([Neon](https://neon.com/faqs/free-plan-limits-and-quotas)) ; il faut encore un calcul gratuit qui garde le temps réel, et les offres gratuites de conteneurs s'endorment |
| Supabase Free | PostgreSQL, temps réel, fonctions | 500 Mo, 2 projets, projet mis en pause après 7 jours d'inactivité, la source renvoie vers l'offre payante pour des sauvegardes quotidiennes ([résumé des limites](https://automationatlas.io/answers/supabase-free-tier-limits-2026/)) |
| Machine virtuelle Oracle Always Free | Tout (NestJS, PostgreSQL, Docker) | Allocation Ampere réduite de moitié le 15 juin 2026 sans annonce ; exploitation, correctifs et sauvegardes à notre charge ([InfoQ](https://infoq.com/news/2026/07/oracle-cloud-free-tier-limits/)) |

### 9.3 Le domaine : seul vrai renoncement

- Les maquettes montrent `deuxplaces.app/i/7K2-QX9`. Un domaine en `.app` est payant chaque année.
- À 0 €, l'adresse est un sous-domaine `workers.dev`. Le code d'invitation `7K2-QX9` reste l'élément principal de l'écran ; seul le lien change d'hôte.
- Les passkeys et les abonnements Web Push sont liés à l'origine : changer d'adresse plus tard oblige chaque membre à recréer sa passkey (le lien magique sert alors de pont) et à réinstaller la PWA. Le choix d'adresse est donc fait une fois, au squelette (ADR-017).
- Option intermédiaire : acheter le domaine seul, unique dépense possible, et garder tout le reste gratuit.

### 9.4 Ce que « gratuit » implique

- **Pas de contrat de service** : un plafond dépassé fait échouer l'opération jusqu'à minuit UTC. Avec un foyer, la marge est très large, mais une boucle d'alarmes boguée pourrait l'épuiser : un test d'intégration vérifie qu'une alarme ne réarme jamais dans la même seconde.
- **Pas d'usage commercial** de TMDB sans accord : si Deux Places devenait un produit payant, TMDB et l'offre gratuite de Cloudflare seraient à rediscuter.
- **Réversibilité** : le domaine et les règles ne connaissent pas Cloudflare (4.3) ; un export JSON complet par foyer existe déjà pour le RGPD. Migrer vers un serveur Node et PostgreSQL reviendrait à réécrire `runtime/` et les adaptateurs de dépôt, pas les modules.

## 10. Déploiement gratuit retenu

Un seul script Cloudflare déploie tout d'un coup : les fichiers de la PWA, le Worker d'entrée et les deux classes de Durable Objects. Les données du foyer ne quittent jamais l'objet du foyer, contraint à la juridiction UE.

&#91;embedded content: déploiement gratuit · Worker, 2 Durable Objects, 5 services\]

Les deux téléphones envoient leurs lectures et commandes en HTTPS au Worker, qui vérifie la session auprès de l'Annuaire puis transmet au Durable Object du foyer ; le temps réel revient par WebSocket directement depuis cet objet.

### 10.1 Configuration

- `wrangler.jsonc` déclare les fichiers statiques de la PWA, les deux classes de Durable Objects (stockage SQLite), un déclencheur Cron quotidien (contrôle des alarmes) et les variables non secrètes.
- Secrets (clé TMDB, clé privée VAPID, clé Brevo, secret d'export ; et, si l'export OTLP est configuré, sa clé dans `OTEL_EXPORTER_OTLP_HEADERS`) stockés comme secrets Cloudflare ; la clé publique VAPID et le point OTLP (`OTEL_EXPORTER_OTLP_ENDPOINT`) ne sont pas secrets. Tous sont lus par un `Layer` de configuration Effect validé au démarrage : un secret manquant fait échouer le démarrage, pas la soirée. L'export OTLP est facultatif mais se configure en entier ou pas du tout : sans point ni clé, il est désactivé ; l'un sans l'autre fait échouer le démarrage.
- Les objets Foyer et Annuaire sont toujours obtenus par l'espace de noms `jurisdiction("eu")`. Seule l'exécution locale s'en passe, car workerd n'implémente pas les juridictions : `DURABLE_OBJECT_JURISDICTION=none` dans `.dev.vars` et les tests. Absente ou vide, la clé vaut `eu` ; toute autre valeur fait échouer le démarrage.

### 10.2 Le Durable Object Foyer en Effect

- À la construction, l'objet applique ses migrations puis construit une seule fois son runtime Effect (`ManagedRuntime`) à partir des `Layer` du foyer : `SqlClient` sur son stockage, dépôts, horloge, client TMDB, envoi push, export OTLP.
- `fetch` passe la requête au gestionnaire web issu de `HttpApi` ; `alarm` exécute les échéances dues ; `webSocketMessage` et `webSocketClose` gèrent les connexions hibernées.
- Le Worker d'entrée construit aussi son gestionnaire une seule fois, au premier appel, et non à chaque requête : c'est décisif sous le plafond de 10 ms de CPU.

### 10.3 Point à vérifier en premier : le CPU

Le plafond gratuit de 10 ms de CPU par requête du Worker exclut l'attente réseau, mais inclut l'initialisation du runtime, le décodage des schémas et la signature des notifications push (chiffrement ECDH et AES-GCM par abonnement). Le squelette ambulant mesure ces coûts sur les routes réelles avant toute tranche métier. Si une route dépasse : déplacer le travail dans le Durable Object, alléger le décodage à la frontière, ou accepter l'offre payante de Cloudflare comme seule dépense (ADR-016).

### 10.4 Environnements

- **Local** : `wrangler dev` (Miniflare) exécute Worker et Durable Objects sur la machine, avec SQLite local ; la restauration à un instant donné n'y existe pas.
- **Production** : un seul environnement déployé. Les prévisualisations par PR de la v1 sont retirées ; les parcours E2E tournent en CI contre `wrangler dev`.
- **Fenêtre** : pas de déploiement entre 19 h et 1 h, heure de Paris, sauf correctif urgent (inchangé).
- **Retour arrière** : redéployer la version précédente du script ; une migration de données fautive se corrige par restauration à un instant donné de l'objet concerné.

## 11. Tests et qualité

La stratégie de la v1 reste : les règles d'abord, testées en isolation, puis les parcours du soir. Effect la rend plus simple sur deux points : le temps se contrôle avec `TestClock`, et chaque dépendance se remplace par un `Layer` de test sans bibliothèque de simulacres.

### 11.1 Répartition

| Niveau | Outils | Cible |
| --- | --- | --- |
| Domaine | Vitest + fast-check | Fonctions pures : agrégats, moteur, politiques ; chaque RG nommée |
| Application | `@effect/vitest` (`it.effect`), `Layer` en mémoire, `TestClock` | Cas d'usage, erreurs typées, événements émis, échéances |
| Intégration | Vitest dans le runtime Workers (pool Cloudflare pour Vitest) | Durable Object réel avec SQLite : migrations, dépôts, alarmes, WebSocket, idempotence |
| API | Requêtes HTTP contre le Durable Object local | Contrat, erreurs RFC 9457, autorisation par foyer, RG-04 dans les deux sens |
| Composants | Vitest navigateur + Testing Library | Composants `packages/ui`, états de Ce soir |
| Bout en bout | Playwright (profil Android) + axe contre `wrangler dev` | Parcours 3.1 à 3.7, accessibilité, ambiances Salle et Hall |

Testcontainers et Supertest disparaissent : il n'y a plus de PostgreSQL ni de serveur Node à démarrer.

### 11.2 Le temps sans attendre

```ts
// modules/evening/application/swap-deadline.test.ts
import { it, expect } from "@effect/vitest"
import { Effect, Fiber } from "effect"
import { TestClock } from "effect/testing"

it.effect("RG-33 — sans accord après 180 s, le joker propose un doudou", () =>
  Effect.gen(function* () {
    const started = yield* startSwap(aSwapCommand())
    const outcome = yield* Effect.fork(awaitSwapOutcome(started.id))
    yield* TestClock.adjust("180 seconds")
    expect(yield* Fiber.join(outcome)).toEqual({ _tag: "Fallback", kind: "comfort" })
  }).pipe(Effect.provide(InMemoryEveningLayer)))
```

Esquisse, comme en section 5. Le même principe couvre le point d'étape à 15 minutes (RG-34), la coupure de 5 h de la date de soirée, la quinzaine des cartes blanches et les 28 jours glissants de l'équité.

### 11.3 Propriétés (réécrites d'après la section 1.1)

- **Moteur** : pour toute Réserve et tout historique, un titre proposé a deux notes sans 0 (RG-02, RG-03), n'a pas été vu par les deux comme nouveauté (RG-05), respecte l'énergie demandée et est disponible sur un abonnement du foyer (RG-31).
- **Joker** : exactement 3 candidats ; au plus un titre retenu ; aucun vote accepté après `endsAt` ; jamais de second joker le même soir (RG-31 à RG-35).
- **Cartes blanches** : sur toute suite de quinzaines, l'attribution alterne strictement entre les deux membres (RG-22).
- **Équité** : le bonus β ne profite qu'aux ajouts du membre qui a le moins décidé sur 28 jours, et l'écart n'apparaît dans aucune réponse d'API (RG-41, RG-42).
- **Notes à l'aveugle** : pour toute séquence de notes, la note de l'autre n'apparaît dans une réponse ou un message temps réel qu'une fois la mienne posée (RG-04).
- **Date de soirée** : tout instant, changements d'heure compris, se rattache à une seule soirée.

Les générateurs peuvent être dérivés des schémas `Schema` (module `Arbitrary` d'Effect) pour rester alignés sur le contrat.

### 11.4 Concurrence et rejeu

- Deux votes envoyés en parallèle au même Durable Object : un seul titre retenu, un seul événement `swap.resolved`.
- Même commande envoyée deux fois avec la même clé : même réponse, aucun effet dupliqué.
- File hors-ligne rejouée après une action de l'autre membre : succès idempotent ou erreur métier attendue, jamais d'état incohérent.
- Alarme : une échéance déjà traitée n'est jamais rejouée ; une alarme ne se réarme jamais sur l'instant courant (protection des plafonds gratuits).

### 11.5 Mutation, analyse, intégration continue

- Stryker sur `modules/*/domain` (TypeScript pur, donc rapide), seuil de départ 80 % ajusté après le premier lot.
- TypeScript strict, oxlint, dependency-cruiser (frontières de modules et règle d'usage d'Effect par couche), service de langage Effect pour les diagnostics propres à Effect.
- GitHub Actions, en trois étapes : vérifications et tests rapides ; intégration Workers, API et E2E ; déploiement par `wrangler deploy` sur `main` hors fenêtre du soir, puis test de fumée. Mutation et test de contrat TMDB réel la nuit.
- Dépôt public possible pour une CI gratuite et illimitée : aucune donnée ni secret n'y vit. Les exports de sauvegarde vont dans un dépôt privé séparé.

## 12. Observabilité gratuite

Effect trace chaque cas d'usage sans code supplémentaire, et depuis la 4.0.2 ses spans HTTP et SQL suivent les conventions OpenTelemetry ; on les exporte en OTLP vers Grafana Cloud Free, et les journaux restent dans Workers Logs. Les objectifs de service sont recalibrés pour un hébergement sans contrat de service.

### 12.1 Signaux

| Signal | Outil | Détail |
| --- | --- | --- |
| Traces | `Effect.fn` / `Effect.withSpan` + export OTLP natif d'Effect → Grafana Cloud Free | Une span par cas d'usage, par appel TMDB et par envoi push ; envoi groupé après la réponse pour ne pas peser sur le temps de réponse |
| Journaux | Journal d'Effect en JSON → Workers Logs | 200 000 événements par jour, 3 jours de rétention ; jamais d'e-mail, de jeton ni de note à l'aveugle |
| Erreurs PWA | Rapport léger envoyé à l'API, journalisé comme les erreurs serveur | Pas de service de suivi tiers (la v1 en prévoyait un) |
| Web Vitals | Même canal | LCP, INP, CLS mesurés sur les deux téléphones |
| Mesure produit | Projections SQL sur `domain_events` du foyer, affichées dans Billets | Inchangé : aucun outil d'analytique |

### 12.2 Objectifs recalibrés

| Parcours | Objectif v2 | Différence avec la v1 |
| --- | --- | --- |
| Ouvrir Ce soir | < 1 s depuis le cache | Inchangé : c'est la PWA, pas l'hébergeur, qui le garantit |
| Réponse de l'API | p95 < 300 ms hors appels TMDB non mis en cache | Inchangé ; plus de réveil à froid de conteneur |
| Vote visible chez l'autre | < 2 s | Inchangé (exigence produit) |
| Point d'étape envoyé à l'heure | à moins d'une minute | Porté par l'alarme du foyer |
| Disponibilité du soir | Suivie, sans cible chiffrée | La v1 visait 99,5 % ; un hébergeur gratuit ne s'engage sur rien, la PWA hors-ligne reste le vrai filet |

### 12.3 Alertes

Peu nombreuses et actionnables, chacune avec son runbook dans `docs/runbooks/` : échec du rafraîchissement nocturne des disponibilités, foyer sans alarme armée (contrôle Cron quotidien), consommation d'un plafond gratuit au-delà de la moitié dans la journée (mesurée par nos propres compteurs de requêtes et d'écritures), export hebdomadaire manquant. Le canal d'alerte (e-mail depuis Grafana Cloud ou depuis l'API via Brevo) est choisi au squelette.

### 12.4 Sauvegardes

- **Premier niveau** : restauration à un instant donné sur 30 jours, intégrée aux Durable Objects SQLite.
- **Second niveau** : chaque semaine, une tâche planifiée GitHub Actions appelle une route d'export protégée par un secret, chiffre l'export JSON du foyer (outil `age`) et le dépose dans un dépôt privé ; 14 exports conservés, comme la rétention de la v1.
- **Test** : chaque mois, un export est réimporté dans un Durable Object local et vérifié par un jeu de requêtes. Une sauvegarde jamais restaurée ne compte pas.

## 13. Sécurité et RGPD

Le référentiel reste OWASP ASVS 5.0 niveau 2 et les principes de la v1 restent valables (CSP stricte, cookie `__Host-`, autorisation par foyer dérivée de la session, limitation de débit). Trois choses changent : l'authentification commence par la passkey, les sous-traitants sont d'autres sociétés, et la règle RG-04 est enfin appliquée correctement.

### 13.1 Authentification

- **Passkey d'abord** : à la création du foyer comme à l'invitation, chaque membre enregistre une passkey (WebAuthn, synchronisée par le gestionnaire de mots de passe du téléphone). La bibliothèque `@simplewebauthn/server` fonctionne sur Cloudflare Workers ([JSR](https://jsr.io/@simplewebauthn/server@13.3.2)).
- **Lien magique de secours** : jeton de 256 bits, haché, 15 minutes, usage unique, page de confirmation contre les scanners de liens ; envoyé par Brevo. Il sert aussi de pont si l'adresse du site change (9.3).
- **Session** : identifiant opaque dans l'Annuaire, cookie `__Host-session` (`Secure`, `HttpOnly`, `SameSite=Lax`), durée glissante, révocable depuis Réglages.
- **Invitation** : code court `7K2-QX9`, alphabet sans caractères ambigus, 7 jours, usage unique, tentatives limitées par IP et par compte dans l'Annuaire.

### 13.2 Confidentialité entre les deux membres (corrigée)

- **RG-04** : la note de l'autre est masquée tant que la mienne n'est pas posée, dans toutes les réponses et tous les messages temps réel ; elle devient visible ensuite. La v1 la masquait pour toujours, ce qui contredisait la spécification produit.
- **Goûts « adorés / détestés »** (`taste_seed`) : jamais envoyés au téléphone de l'autre ; seul le moteur les lit.
- **Équité** : jamais exposée sous forme de score ou d'écart (RG-42).
- Ces trois règles ont un test d'API dédié et une propriété (11.3).

### 13.3 Protection de l'application

- CSP : `default-src 'self'` ; `img-src 'self' https://image.tmdb.org data:` ; `connect-src 'self'` (le WebSocket est sur la même origine) ; `object-src 'none'` ; `base-uri 'none'` ; `frame-ancestors 'none'`.
- CSRF : `SameSite=Lax` + vérification de l'en-tête `Origin` sur toute écriture et sur l'ouverture du WebSocket.
- Secrets dans les secrets Cloudflare, jamais dans le dépôt ; détection de secrets en pré-commit et en CI ; fichier de verrouillage, Renovate, audit des dépendances. Le cœur `effect` n'a aucune dépendance d'exécution, ce qui réduit la surface de la chaîne d'approvisionnement.

### 13.4 RGPD : ce qui change

| Sujet | V2 |
| --- | --- |
| Localisation | Données des foyers et de l'Annuaire dans des Durable Objects contraints à la juridiction UE ; la plateforme peut journaliser l'identifiant d'un objet hors UE |
| Sous-traitants | Cloudflare (calcul, stockage, journaux), Brevo (e-mail, données en France et en Allemagne), Grafana Labs (traces sans données personnelles), TMDB (aucune donnée personnelle envoyée) |
| Nuance | Cloudflare et Grafana Labs sont des sociétés américaines : la localisation dans l'UE ne supprime pas leur exposition au droit américain. Pour un usage privé à deux, c'est un compromis acceptable ; pour un produit public, il faudrait un hébergeur européen et payer |
| Minimisation | Prénom, e-mail, goûts, notes, historique ; ni santé, ni géolocalisation, ni traceur ; traces sans identifiant personnel |
| Conservation | Journaux 3 jours (Workers Logs), traces 14 jours (Grafana), clés d'idempotence 48 h, exports chiffrés 14 semaines |
| Droits | Export JSON complet et suppression du foyer depuis Réglages ; la suppression efface l'objet du foyer et ses entrées dans l'Annuaire. Une suppression reste récupérable 30 jours par la restauration intégrée : à mentionner dans la politique de confidentialité |

## 14. Plan de réalisation révisé

Les lots de la spécification produit ne bougent pas (v1 « Le soir sans décision », v2 « La semaine à deux », v3 « Plus de ponts »). Ce qui change : un squelette ambulant plus exigeant, qui lève d'abord les trois risques de cette v2, et une montée en compétence Effect intégrée aux premières tranches.

### 14.1 Squelette ambulant : six vérifications avant toute règle

1. **Chaîne complète** : monorepo pnpm, Worker, Durable Objects Annuaire et Foyer en juridiction UE, une route `HttpApi` Effect, une migration SQLite, PWA installée qui affiche le prénom, déploiement par GitHub Actions.
2. **CPU** : temps CPU mesuré sur la route la plus lourde du Worker et sur un envoi Web Push, sous le plafond de 10 ms (10.3).
3. **Poids** : JavaScript initial de la PWA avec `HttpApiClient` et `Schema`, sous 170 Ko compressés (8.3).
4. **Temps réel** : WebSocket hiberné entre deux téléphones, reprise après coupure.
5. **Échéance** : une alarme de test déclenche une notification push sur le téléphone, application fermée.
6. **Sauvegarde** : export hebdomadaire chiffré, puis réimport local vérifié.

Si l'une échoue, la décision correspondante est revue avant d'écrire du métier (ADR-014 à ADR-017).

### 14.2 Tranches de la v1

| # | Tranche | Ce qu'on apprend d'Effect en la faisant |
| --- | --- | --- |
| 1 | Foyer, passkeys, invitation par code, abonnements | `Layer`, configuration, erreurs typées de bout en bout |
| 2 | Ajout à la Réserve par recherche TMDB | Client HTTP, `Schema` sur une réponse externe, `Effect.timeout` et `retry` |
| 3 | Ajout par partage Android | Composition de cas d'usage |
| 4 | Notes à l'aveugle (RG-04 corrigée) et veto | Projections selon le lecteur, propriétés fast-check |
| 5 | Semaine type simple et moteur du soir | Domaine pur, aucun Effect : le moteur reste testable par propriétés seules |
| 6 | Ce soir, Lancer, ouverture de la plateforme | `HttpApi` complet, file hors-ligne et idempotence |
| 7 | Hier soir : épisodes confirmés, série suivante | Transactions SQLite |
| 8 | Doudous et repli quand un titre n'est plus disponible | Dégradation sur cache, rafraîchissement par alarme |
| 9 | Joker en mode un seul téléphone | `TestClock` sur les 180 s (RG-31 à RG-35) |
| 10 | Hors-ligne : cache de Ce soir et file d'écritures | — (PWA) |
| 11 | Première séance | Temps réel WebSocket (présence de l'autre pendant l'installation) |

### 14.3 v2 et v3

- **v2** : joker synchronisé sur deux téléphones (WebSocket, sérialisation par le Durable Object, tests de concurrence) ; rituel du dimanche et 5-3-1 ; cartes blanches alternées et déplaçables ; équité dans le moteur ; point d'étape à 15 min et sortie de série au 3e épisode (alarme + Web Push avec actions) ; amorçage de la Réserve ; Billets.
- **v3** : suggestions par modèle de langage (Effect fournit des clients pour plusieurs fournisseurs, dont `@effect/ai-cloudflare` ; l'offre gratuite de Workers AI est à vérifier le moment venu) ; réapprovisionnement automatique ; import Trakt optionnel.

### 14.4 Définition de « terminé » (mise à jour)

Celle de la v1, avec trois ajouts :

- aucun usage d'export Effect « unstable » hors de `interface/` et `contracts` (diagnostic du service de langage) ;
- le temps CPU des routes touchées reste sous le plafond gratuit, mesuré en CI sur `wrangler dev` puis en production ;
- les règles touchées sont vérifiées contre le texte de la spécification produit, pas contre la mémoire de la v1 (leçon de la section 1.1).

## 15. Registre des décisions mis à jour

Neuf nouvelles décisions (ADR-014 à ADR-022) ; sur les treize de la v1, cinq sont maintenues, quatre amendées et quatre remplacées. Conformément à la règle de la v1, une ADR acceptée n'est jamais réécrite : la nouvelle cite celle qu'elle remplace.

### 15.1 Nouvelles décisions

| ADR | Décision | Options écartées | Revoir si |
| --- | --- | --- | --- |
| 014 | Effect 4 côté serveur et pour les contrats (`Schema`, `HttpApi`), versions épinglées | NestJS 12 ; Hono + Zod | Une mineure d'Effect casse la couche HTTP plus d'une fois par trimestre |
| 015 | Cloudflare Workers + un Durable Object SQLite par foyer, Annuaire séparé, juridiction UE | PostgreSQL Neon ou Supabase ; machine virtuelle Oracle | Besoin de requêtes entre foyers ou d'un produit public multi-foyers |
| 016 | Coût zéro comme contrainte ; seule dépense acceptable si un plafond est dépassé : l'offre payante de Cloudflare | Hébergement payant dès le départ | Le CPU de 10 ms ne tient pas sur une route essentielle |
| 017 | Adresse : sous-domaine `workers.dev`, ou domaine acheté, décidé une fois au squelette | Changer plus tard (casse passkeys et abonnements push) | — |
| 018 | Passkey d'abord, lien magique de secours par Brevo | Lien magique d'abord (v1) ; mot de passe | Brevo retire son offre gratuite |
| 019 | WebSocket en hibernation, serveur vers téléphone seulement | SSE (v1) ; RPC Effect pour tout | Besoin de commandes en temps réel |
| 020 | Proportionnalité : retrait de `/api/v2`, contrôle de compatibilité, environnements par PR, signature d'images, `ETag`, pagination, revues DORA | Tout garder | Un deuxième client ou plusieurs foyers |
| 021 | Traces OTLP natives d'Effect vers Grafana Cloud Free ; journaux Workers Logs ; pas d'outil de suivi d'erreurs tiers | SDK OpenTelemetry ; Sentry | Les volumes gratuits deviennent insuffisants |
| 022 | Domaine en TypeScript pur (seuls `Result`, `Option`, `Data`, `Brand` d'Effect) ; Effect complet à partir de la couche application | Effect partout | — |

### 15.2 Statut des décisions de la v1

| ADR v1 | Sujet | Statut |
| --- | --- | --- |
| 001 | Monolithe modulaire hexagonal | Maintenue ; l'unité de cohérence devient le foyer |
| 002 | Node.js 26, TypeScript 7, ESM | Amendée par 015 : l'exécution se fait sur Workers ; Node 26 reste pour l'outillage |
| 003 | NestJS 12, Zod, Vitest | Remplacée par 014 (Vitest conservé) |
| 004 | PostgreSQL 18, Kysely | Remplacée par 015 |
| 005 | Contrats Zod → OpenAPI, RFC 9457 | Amendée par 014 et 020 : contrat `HttpApi`, RFC 9457 natif |
| 006 | SSE + outbox + pg-boss | Remplacée par 015 et 019 |
| 007 | PWA React 19, Vite 8, TanStack, React Aria, Workbox | Maintenue |
| 008 | Lien magique + passkeys, sessions serveur | Amendée par 018 |
| 009 | pnpm, Turborepo, oxlint, dependency-cruiser, Lefthook, Renovate | Maintenue ; dependency-cruiser vérifie aussi la règle 022 |
| 010 | Hébergement managé en UE | Remplacée par 015 et 016 |
| 011 | OpenTelemetry, pino | Amendée par 021 |
| 012 | Stratégie de tests | Maintenue ; Testcontainers remplacé par le pool Vitest de Workers |
| 013 | Prix de location non affichés | Maintenue |

## 16. Sources

**Documents du projet** : [Spécification technique v1](https://claude.ai/artifact/FFYBcdBjnavYBhJuC1j9dT) · [Spécification de l'outil](https://claude.ai/artifact/GNg7aC7e9azSr2LLaedCow) · [Nom et design](https://claude.ai/artifact/8Yi6dfi8NhDipNHEqrpPNg) · [Solution](https://claude.ai/artifact/8HUzwYLFpHDawTf6EzmGDh) · maquettes « Deux Places » (PDF, 43 pages).

**Effect**

- [Blog Effect](https://effect.website/blog) (chronologie bêta, RC, 4.0, 4.1)
- [Effect 4.0](https://effect.website/blog/releases/effect/40) · [Effect 4.1](https://effect.website/blog/releases/effect/41) · [Effect 4.0 : la première semaine](https://effect.website/blog/effect-4-first-week) · [RC : septembre 2026](https://effect.website/blog/effect-v4-rc-september-recap)
- Référence v4 : [index des paquets](https://effect.website/docs/v4/api), [modules du paquet effect](https://effect.website/docs/v4/api/effect), [HttpApi](https://effect.website/docs/v4/api/effect/unstable/httpapi/HttpApi), [HttpApiBuilder](https://effect.website/docs/v4/api/effect/http-api/HttpApiBuilder), [Context](https://effect.website/docs/v4/api/effect/Context), [Result](https://effect.website/docs/v4/api/effect/Result), [Brand](https://effect.website/docs/v4/api/effect/Brand), [TestClock](https://effect.website/docs/v4/api/effect/testing/TestClock), [@effect/vitest](https://effect.website/docs/v4/api/vitest), [@effect/sql-sqlite-do](https://effect.website/docs/v4/api/sql-sqlite-do)
- [Exemple complet HttpApi](https://mintlify.com/effect-TS/effect-smol/http/api) (documentation générée pendant la bêta : chemins d'import anciens)
- Sandro Maglione, [Effect API on Cloudflare](https://www.sandromaglione.com/newsletter/effect-api-on-cloudflare)

**Cloudflare**

- [Tarifs des Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing) · [Limites des Workers](https://developers.cloudflare.com/workers/platform/limits/index.md) · [Localisation des données](https://developers.cloudflare.com/durable-objects/reference/data-location/) · [API de stockage SQL et restauration](https://developers.cloudflare.com:2053/durable-objects/api/sql-storage) · [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)

**Autres offres gratuites et alternatives**

- [Neon : limites de l'offre gratuite](https://neon.com/faqs/free-plan-limits-and-quotas) · [Supabase : résumé des limites 2026](https://automationatlas.io/answers/supabase-free-tier-limits-2026/) · [InfoQ : réduction d'Oracle Always Free](https://infoq.com/news/2026/07/oracle-cloud-free-tier-limits/)
- [Brevo : API e-mail gratuite](https://www.brevo.com/en/features/email-api/) · [GitHub Actions : facturation](https://docs.github.com/en/billing/concepts/product-billing/github-actions) · [Grafana Cloud Free](https://grafana.com/products/cloud/free-tier)

**Bibliothèques et normes**

- [@simplewebauthn/server](https://jsr.io/@simplewebauthn/server@13.3.2) · [Web Push depuis un Cloudflare Worker](https://dev.to/mfauveau/waking-a-dead-service-worker-with-web-push-from-a-cloudflare-worker-1jnm) · [API TMDB](https://developer.themoviedb.org/docs) · [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html)
