# Point de contrôle A — dossier de preuves (jalon 1, squelette ambulant)

Préparé par l'agent le 2026-11-14 (skill `close-milestone`), sur `main` à `c8543bc`. La ligne J1.19 reste
`todo` : c'est Grégory qui la passe à `done`, après ses décisions (section 6).

**En bref** : cinq vérifications sur six sont réussies ou partielles ; **la vérification 2 (CPU) est
échouée**. Plusieurs invocations dépassent le plafond gratuit de 10 ms (Worker et objet Foyer). C'est une
condition d'arrêt (AGENTS.md, commits.md §2.4), et §14.1 demande de revoir la décision correspondante
(ADR-016) avant le jalon 2. Décision exprimée par Grégory le 2026-11-14 en session : **rester dans l'offre
gratuite et réduire le CPU** ; elle reste à acter dans l'ADR-016 (patch proposé hors de ce commit) et dans le
plan (ligne proposée en 6.1).

## 1. Ce que le jalon a livré

| Ligne                 | Commit               | Objet                                                        |
| --------------------- | -------------------- | ------------------------------------------------------------ |
| J1.1                  | `9c666e5`            | Coquille Vite 8 et React 19                                  |
| J1.2                  | `30f7dfa`            | PWA et Worker servis par le greffon Cloudflare de Vite       |
| J1.3                  | `6fa4d64`            | Projet de tests d'intégration Workers                        |
| J1.4                  | `378ffe3`            | Configuration validée au démarrage (`Config` d'Effect)       |
| J1.5 (+ fix)          | `9258f7f`, `047ed66` | Contrat `HttpApi` et route de santé                          |
| J1.6                  | `38873b5`            | `HttpApi` servie par l'objet Foyer, juridiction UE           |
| J1.7                  | `3c5a64d`            | Migrations SQLite au démarrage de l'objet                    |
| J1.8                  | `a93e6a6`            | Journaux JSON et en-tête CSP                                 |
| J1.9                  | `cff4375`            | Santé de l'API affichée par un `HttpApiClient` typé          |
| J1.10                 | `69e8615`            | Budget de 170 Ko de JavaScript initial en CI                 |
| J1.11                 | `1dca3a6`            | Diffusion aux WebSockets hibernés d'un foyer                 |
| J1.12                 | `a8637ed`            | Échéances par l'alarme de l'objet                            |
| J1.13                 | `382dda4`            | Web Push avec VAPID en WebCrypto                             |
| J1.14                 | `84a6ed5`            | Service worker et abonnement push, page de test              |
| J1.15                 | `9b2ee94`            | Export du foyer derrière un secret                           |
| J1.16 (+ fix)         | `5c669ed`, `d892b35` | Import d'un export dans un objet local                       |
| J1.18 (+ fix)         | `66f9512`, `e210691` | Déploiement depuis `main` hors soirée, test de fumée         |
| J1.17 (+ docs)        | `203cb46`, `c8543bc` | Sauvegarde hebdomadaire chiffrée, vérification 6 consignée   |
| hors jalon (J0.5, J0.10) | voir PROGRESS     | Exception des API instables resserrée ; `test:workers` en CI |

**En production** : la version `2d8fabb2-8ecb-4ae1-a14e-f5a596d5a8df` du Worker, déployée le 2026-11-13 par
l'exécution [43448015862](https://github.com/LeDevNovice/deux-places/actions/runs/43448015862) (`e210691`,
« Deploy with Wrangler » et « Smoke test » réussis). Les deux exécutions de `main` suivantes
([43634526197](https://github.com/LeDevNovice/deux-places/actions/runs/43634526197),
[43637611568](https://github.com/LeDevNovice/deux-places/actions/runs/43637611568)) ont sauté le déploiement
(fenêtre du soir). Depuis `e210691`, seul un fichier de test a changé sous `src/` : les mesures valent pour
le code actuel.

## 2. Les six vérifications (technique-v2 §14.1)

| #   | Vérification                    | État          | Preuve                                                                                                                                                                                                                                                                                                                                                                                                  | Écarts connus                                                                                                                                                                                                                                                                   |
| --- | ------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Chaîne complète                 | **Partielle** | Déploiement par GitHub Actions et test de fumée verts (exécution 43448015862). Workers Logs du 2026-11-13 vers 15 h 06 UTC : un téléphone Android (Chrome) charge `/` (200) puis `GET /api/v1/health` (200), servi par l'objet `Household` (`executionModel: durableObject`). Migration SQLite et juridiction UE tenues par les tests (J1.6, J1.7). Aucune entrée de PROGRESS ne consigne la validation par Grégory. | Pas de manifeste : Android propose un raccourci, pas une « PWA installée » (manifeste prévu à J4.12). Pas de prénom affiché (session, jalon 3). La juridiction UE n'est pas observable dans les journaux (seul l'identifiant de l'objet y figure). |
| 2   | CPU                             | **Échouée**   | Section 3 : 15 invocations sur 49 au-dessus de 10 ms, sur `GET /api/v1/health`, `GET /api/export`, `GET /api/v1/push/public-key` (Worker), sur l'objet Foyer (santé, RPC d'export) et sur l'alarme qui envoie le push.                                                                                                                                                                                  | Échantillon réduit (49 invocations sur deux jours). Aucune invocation n'a été coupée (`outcome: ok` partout) : la tolérance de Cloudflare n'est pas une garantie (section 3.3).                                                                                                 |
| 3   | Poids                           | **Réussie**   | `pnpm size-budget` (2026-11-14, `c8543bc`, et étape CI de l'exécution 43637611568) : **140 256 o gzip** (niveau 6) ≤ 170 000 o, marge 29 744 o, `HttpApiClient` et `Schema` compris. Servi par Cloudflare (relevé du 2026-11-14, fichiers identiques au build local) : **zstd 145 608 o**, brotli 141 932 o, gzip 139 936 o.                                                                             | Chrome reçoit le zstd de Cloudflare, environ 3,8 % plus lourd que la mesure de la CI : la marge réelle est d'environ 24,4 kB, pas 29,7 kB.                                                                                                                                       |
| 4   | Temps réel                      | **Partielle** | 19 tests `workers` (J1.11) : deux clients connectés reçoivent la même diffusion, ping/pong sans réveil de l'objet hiberné, fermeture propre, contrôle d'`Origin`.                                                                                                                                                                                                                                        | Pas de client WebSocket dans la PWA (J2.7), aucune route de production ne diffuse, reprise après coupure (`?since=`) à J2.4 : rien n'a été essayé sur deux téléphones.                                                                                                          |
| 5   | Échéance                        | **Réussie**   | Rapportée par Grégory : le 2026-11-13 vers 16 h 09, notification reçue sur Android, application fermée (PROGRESS, J1.17). Workers Logs : `POST /api/v1/push/test-notification` à 15:07:38 UTC (204), alarme à 15:08:38 UTC (`outcome: ok`), aucune ligne d'échec d'envoi.                                                                                                                              | Non essayé sur iPhone (le push web y exige une application installée avec manifeste). L'alarme a consommé 14 ms de CPU (section 3).                                                                                                                                             |
| 6   | Sauvegarde                      | **Réussie**   | Rapportée par Grégory : le 2026-11-14 vers 21 h 20 (PROGRESS, « J1.17 · vérification 6 ») : export de production `export-2026-11-14T200244Z.json.age` (exécution [43634698976](https://github.com/LeDevNovice/deux-places/actions/runs/43634698976), tentative 2) déchiffré, restauré sans réseau, réexporté : « same export, exportedAt aside ».                                                         | **Faite sous Node v24.18.0 (WSL), pas Node 26** comme le demande la recette : à refaire sous Node 26 ou à accepter (section 6.4). Le « jeu de requêtes » du test mensuel (§12.4) reste à J6.6.                                                                                    |

## 3. Vérification 2 : mesures CPU

### 3.1 Source

Export JSON des journaux d'invocation Workers Logs (tableau de bord Cloudflare, Worker `deux-places` →
Observability), relevé par Grégory et joint à la session du 2026-11-14 : 49 invocations, du 2026-11-13
15:00:56 UTC au 2026-11-14 20:02:45 UTC, toutes de la version `2d8fabb2…`, toutes `outcome: ok`. Champ lu :
`$workers.cpuTimeMs` (et `wallTimeMs` pour comparaison). Le fichier contient des adresses IP et des
localisations : il n'est pas dans le dépôt ; seuls les chiffres ci-dessous en sont tirés (script local,
hors dépôt).

### 3.2 Résultats (plafond : 10 ms de CPU par invocation, technique-v2 §9.1, §10.3)

| Route ou événement                           | Invocation                  | Nb  | Min | Médiane | Max | > 10 ms   | Valeurs (ms, dans l'ordre)   |
| -------------------------------------------- | --------------------------- | --- | --- | ------- | --- | --------- | ---------------------------- |
| `GET /api/v1/health`                         | Worker                      | 8   | 9   | 11      | 19  | **6 / 8** | 19, 11, 11, 9, 10, 11, 11, 18 |
| `GET /api/v1/health`                         | objet Foyer                 | 8   | 5   | 7,5     | 37  | **3 / 8** | 37, 8, 5, 6, 31, 15, 7, 5    |
| `GET /api/export`                            | Worker                      | 2   | 13  | 16      | 19  | **2 / 2** | 19, 13                       |
| RPC `exportHousehold`                        | objet Foyer                 | 2   | 24  | 44,5    | 65  | **2 / 2** | 65, 24                       |
| Alarme (envoi Web Push de la notification de test) | objet Foyer           | 1   | 14  | 14      | 14  | **1 / 1** | 14                           |
| `GET /api/v1/push/public-key`                | Worker                      | 1   | 12  | 12      | 12  | **1 / 1** | 12                           |
| `GET /api/v1/push/public-key`                | objet Foyer                 | 1   | 5   | 5       | 5   | 0         | 5                            |
| `POST /api/v1/push/subscriptions`            | Worker / objet Foyer        | 1/1 | —   | —       | —   | 0         | 1 / 9                        |
| `POST /api/v1/push/test-notification`        | Worker / objet Foyer        | 1/1 | —   | —       | —   | 0         | 1 / 3                        |
| `GET /dev/notifications` (page)              | Worker                      | 4   | 1   | 6       | 8   | 0         | 8, 4, 1, 8                   |
| `GET /`                                      | Worker                      | 8   | 0   | 6       | 10  | 0         | 10, 5, 6, 6, 6, 7, 0, 0      |
| `GET /sw.js`                                 | Worker                      | 5   | 1   | 1       | 4   | 0         | 1, 1, 1, 1, 4                |
| `GET /favicon.ico`                           | Worker                      | 5   | 0   | 1       | 7   | 0         | 0, 1, 1, 1, 7                |

Le temps écoulé reste court (export : 287 et 445 ms ; santé : 54 à 467 ms) : le problème n'est pas la
latence, c'est le calcul par invocation.

### 3.3 Lecture

- **Le dépassement ne dépend pas de la façon de compter.** Même en ne gardant que le Worker d'entrée (« 10 ms
  de CPU par requête du Worker », §10.3), trois routes dépassent : santé, export, clé publique.
- **Les objets Durable Objects ont le même plafond en offre gratuite.** Doc Cloudflare (Durable Objects,
  « Limits ») : les limites des Workers s'appliquent aux objets selon l'offre ; grille tarifaire : « 10 ms /
  invocation » pour les Durable Objects en gratuit. La piste « déplacer le travail dans le Durable Object » de
  §10.3 ne fait donc pas sortir du plafond en offre gratuite ; les pires valeurs sont d'ailleurs dans l'objet.
- **Ce qui coûte semble être le premier appel d'API d'un isolat, pas le transfert lui-même** (hypothèse à
  confirmer par un profil). Sur une même connexion du téléphone, le 2026-11-13 à 15:07, `public-key` coûte
  12 ms dans le Worker, puis `subscriptions` et `test-notification`, deux secondes après, 1 ms chacun : ce sont
  les seuls appels d'API à 1 ms côté Worker, et tous deux suivent un premier appel coûteux sur la même
  connexion ; aucun appel de santé n'est dans ce cas. Cela concorde avec la construction, au premier appel
  d'API de chaque isolat, de la configuration et du runtime de journalisation (J1.4, J1.8, §10.2), et, dans
  l'objet, des migrations et du `ManagedRuntime` (J1.7, J1.14). Avec deux utilisateurs et peu de trafic,
  cette initialisation risque de tomber sur la plupart des appels.
- **Ce que fait Cloudflare au-delà** : réponse « Error 1102 » au téléphone (`exceededCpu` dans les journaux) ;
  la doc dit que l'exécution est coupée quand le Worker « starts hitting the limit consistently ». Aucune
  coupure aujourd'hui, mais le seuil de tolérance n'est pas publié.
- **Ce que prévoient les documents** : §10.3 : « déplacer le travail dans le Durable Object, alléger le
  décodage à la frontière, ou accepter l'offre payante de Cloudflare comme seule dépense (ADR-016) » ; ADR-016,
  « Revoir si : le CPU de 10 ms ne tient pas sur une route essentielle » — condition atteinte ; §14.1 : la
  décision est revue avant d'écrire du métier.
- **Décision de Grégory** (2026-11-14, en session) : l'offre payante est exclue ; rester gratuit et réduire le
  CPU. Les leviers, du moins cher au plus cher, sont en 6.1.

## 4. Autres contrôles

- **Contrôle J1.17 (Workers Logs)** : dans les journaux d'invocation des deux `GET /api/export` du 2026-11-14
  (19:55:39 et 20:02:45 UTC), l'en-tête `Authorization` vaut `"********"` : **masqué**. Seul son nom apparaît
  dans `requestHeaderNames`.
- **Ce que contiennent les journaux d'invocation** : URL complète, adresse IP, ville, coordonnées
  approximatives et empreinte TLS du client, conservées 3 jours (§12.1). Voir 6.6.
- **Tables internes** : l'export de production a réussi (vérification 6) : l'exclusion des tables dont le nom
  commence par `_` (J1.15) suffit en production, sans `SQLITE_AUTH`.
- **Exécutions locales du 2026-11-14** (Node 26.13.1, pnpm 12.18.0, gitleaks 8.30.1, age 1.3.2) :
  `node scripts/agent/verify.mjs` vert (256 tests `unit`, plan, règles, garde) ; `pnpm test:workers` vert
  (12 fichiers, 193 tests) ; `pnpm build` sans `.dev.vars` puis `pnpm size-budget` : ✔ 140 256 o, marge
  29 744 o ; Worker 1 313,49 kB (312,74 kB gzip selon Vite).
- **Non lancé** : `pnpm test:e2e` (n'existe pas avant J3.13) ; essai de mutation nocturne (aucun code de
  domaine dans ce jalon) ; relecture en contexte neuf du diff du jalon (étape 3 du skill) : non lancée, à la
  demande de Grégory, la relecture n'étant demandée que pour un commit qui change un comportement, ce que ce
  dossier ne fait pas.

## 5. Décisions consignées dans les commits du jalon

`git log --grep "Plan: J1\."` : 136 lignes `Decision:` dans les 20 commits de J1.x qui en portent (corps de
chaque commit). Celles qui touchent ce point de contrôle :

- **CPU** : configuration et runtime de journalisation construits au premier appel de chaque isolat (J1.4,
  J1.8) ; gestionnaire `HttpApi` construit une fois par objet (J1.6) ; `ManagedRuntime` par objet (J1.14) ;
  export en mémoire, une chaîne par RPC (J1.15) ; `observability` activé pour lire `$workers.cpuTimeMs` (J1.18).
- **Poids** : `HttpApiClient` gardé à 138,94 kB plutôt que le repli de §8.3 (J1.9) ; mesure gzip niveau 6 par
  fichier (J1.10).
- **Adresse** : `Origin` accepté = origine de la requête, sans adresse configurée (J1.11) ; `sub` VAPID = URL
  du dépôt (J1.13, J1.18) ; `User-Agent` nommé contre le Browser Integrity Check de `workers.dev` (J1.18 fix).
- **Secrets** : `VAPID_PUBLIC_KEY` en secret Cloudflare plutôt qu'en variable (J1.18).

## 6. Ce que Grégory doit faire ou décider

### 6.1 CPU (vérification 2) — décidé : rester gratuit ; reste à acter

1. **ADR-016** : y consigner les mesures (annexe prévue par sa « Note ») et la revue de sa condition « Revoir
   si ». Patch proposé hors de ce commit (rapport de session), à relire et appliquer.
2. **Plan** : ajouter une ligne avant J1.19 (édition humaine, `DP_PLAN_EDIT=1`). Proposition :

   | #     | Commit                                                    | Contenu                                                                                                                                                                                                                                    | Vérification                                                                                   |
   | ----- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
   | J1.20 | `perf(server): profile the CPU of the first and later API calls` | Profil CPU local (DevTools de `wrangler dev`) du premier appel d'API d'un isolat et des suivants, côté Worker et objet Foyer, pour `health`, `public-key`, l'export et l'alarme de push ; consigné dans PROGRESS, sans changer de code | Profil joint ; part de l'initialisation et part du traitement chiffrées par route              |

   Les lignes de réduction s'écrivent ensuite d'après ce profil. Leviers connus, du moins cher au plus cher :
   construire au chargement du module (limite de démarrage séparée de 1 s) ce qui ne dépend ni de `env` ni du
   stockage, plutôt qu'au premier appel ; un Worker d'entrée sans runtime Effect qui relaie à l'objet ; l'export
   et les envois push découpés en plusieurs invocations (une échéance par abonnement). Critère proposé :
   invocations « chaudes » sous 10 ms côté Worker et objet ; dépassement « à froid » rare toléré ; aucun
   `exceededCpu` sur 7 jours d'usage.
3. **Spécification (à toi)** : §10.3 présente « déplacer le travail dans le Durable Object » comme une issue,
   ce qui n'est vrai qu'en offre payante (3.3) ; §10.2 dit que le Worker construit son gestionnaire « au premier
   appel », ce qu'un des leviers changerait. Un Worker sans Effect toucherait aussi ADR-014 et ADR-022.
4. **Surveillance en attendant** : tableau de bord → Metrics → Errors → Invocation Statuses, issues
   `exceededCpu`.

### 6.2 Adresse du site (ADR-017, §9.3) — définitive à cause des passkeys

| Option                                                       | Conséquences                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sous-domaine actuel `deux-places.ledevnovice.workers.dev`    | 0 € ; déjà l'origine de l'abonnement push existant et des sauvegardes (aucune migration). Le lien d'invitation montre cet hôte au lieu de `deuxplaces.app` (maquettes). Le Browser Integrity Check de `workers.dev` ne se désactive pas : un client hors navigateur sans `User-Agent` nommé peut recevoir l'erreur 1010 (déjà géré pour le test de fumée et la sauvegarde). Aucune règle de pare-feu ni de journalisation propre à un domaine. |
| Domaine acheté (seule dépense prévue par §9.3)               | Coût annuel du domaine, contraire à la contrainte « rester gratuit » exprimée le 2026-11-14. Lien d'invitation conforme aux maquettes ; règles possibles sur la zone. Changer d'origine plus tard obligerait à recréer passkeys et abonnements push : le choix se fait maintenant, avant le jalon 3. Le test de fumée lirait une cible sans `https://` dans la sortie de Wrangler (à adapter, J1.18). |

ADR-017 : patch proposé avec un emplacement pour l'adresse retenue (rapport de session).

### 6.3 Écarts des vérifications 1 et 4

| Écart                                                         | Option « accepté pour passer au jalon 2 »                                                                                                       | Option « ligne à ajouter au plan »                                                                                                                                                       |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1 : pas de manifeste, PWA non installable                    | Manifeste à J4.12 (`share_target`) ; d'ici là, raccourci Android seulement. Le push web sur iPhone reste impossible jusque-là (manifeste requis). | Une ligne « manifeste minimal » au jalon 2 : PWA installable plus tôt, push essayable sur iPhone si l'un des deux téléphones en est un ; ajoute une ligne et un peu de poids.                |
| V1 : prénom non affiché                                       | Le prénom vient avec la session (jalon 3) : rien à faire avant.                                                                                 | Peu d'intérêt : afficher un prénom sans session demanderait une donnée fictive.                                                                                                          |
| V4 : pas de client WebSocket, pas d'essai sur deux téléphones | J2.4 et J2.7 rendent l'essai possible ; le jalon 2 se termine sans contrôle humain prévu.                                                       | Ajouter « vérification 4 sur deux téléphones » à la colonne Vérification de J2.7 (ou une ligne d'essai après J2.7) : l'essai réel et la reprise après coupure sont alors explicitement prouvés. |

### 6.4 Vérification 6 sous Node 24

Accepter (la restauration s'exécute dans workerd ; Node ne fait tourner que Vite et le script) ou refaire la
recette sous Node 26 (recette et corrections dans PROGRESS, entrées J1.17).

### 6.5 Points ouverts de J1.17

| Point                                                                                                     | Options et conséquences                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exports gardés dans l'historique Git du dépôt privé au-delà des « 14 semaines » de §13.4                  | (a) Garder et amender §13.4 : le plus simple ; tous les exports passés restent lisibles par la clé privée `age`, une fuite de cette clé les expose tous. (b) Réécrire périodiquement l'historique du dépôt privé (poussée forcée automatisée) : conservation réelle de 14 semaines, mais une tâche de plus et une réécriture d'historique à surveiller. (c) Autre stockage où la suppression est réelle : nouvelle dépendance de service et de compte, à évaluer.            |
| Clé privée en CI pour la restauration mensuelle (J6.6)                                                    | (a) Seconde clé `age` dédiée à la CI (`age` chiffre vers plusieurs destinataires) : test automatique, mais une clé de plus dans GitHub qui lit tous les exports. (b) Test mensuel fait à la main par Grégory, sans clé en CI : aucune clé exposée, mais une corvée mensuelle. (c) Test en CI sur un export factice : aucune clé, mais la vraie sauvegarde n'est plus vérifiée.                                                                                            |
| Alerte « export hebdomadaire manquant » (§12.3) qu'aucune ligne ne crée                                   | (a) L'ajouter au contenu de J6.5 (qui envoie les alertes sans les nommer). (b) Une ligne dédiée au jalon 6. (c) Compter sur les e-mails d'échec de GitHub : ne voit pas une tâche désactivée ou jamais lancée (aucune exécution, donc aucun échec).                                                                                                                                                                                                                          |
| Tâche planifiée désactivée après 60 jours sans activité (dépôt public)                                    | (a) Accepter, et l'alerte du point précédent la détecte. (b) Rendre le dépôt `deux-places` privé : la règle des 60 jours ne vaut que pour les dépôts publics, mais les minutes d'Actions deviennent limitées (environ 2 000 par mois, §9.1). (c) Un commit d'entretien automatique : bruit dans l'historique, contournement de la règle.                                                                                                                                      |

Aussi (J1.17) : vérifier que les notifications « Actions » (échecs) sont actives sur ton compte, et installer
`age` v1.3.2 sur ta machine (`pnpm check` l'exige).

### 6.6 Autres choix rattachés au point de contrôle A

- **Canal d'alerte** (§12.3 « choisi au squelette », J6.5 « canal choisi au point de contrôle A ») : e-mail
  depuis Grafana Cloud, ou depuis l'API via Brevo.
- **Journaux d'invocation** : ils gardent 3 jours l'adresse IP et la localisation approximative de chaque
  requête, et l'URL complète (donc le code d'un futur lien `/i/<code>`, J1.18). Les couper
  (`observability.logs.invocation_logs: false`, option du schéma de wrangler 4.157.0) supprimerait aussi
  `$workers.cpuTimeMs`, nécessaire à la ligne CPU : garder jusqu'à la fin du travail CPU, puis trancher avant
  J3.x.

### 6.7 Remarques gardées pour Grégory dans les entrées du jalon 1, encore ouvertes

| Entrée | Remarque                                                                                                                                                                       |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| J1.8   | En dev, le premier CSS importé sera bloqué (§13.3 sans `style-src`) : à trancher avant la ligne qui importe `tokens.css`.                                                        |
| J1.10  | « JavaScript initial de Ce soir » quand le routeur découpera par `import()` : garder Ce soir dans l'entrée, ou mesurer aussi son chunk.                                         |
| J1.12  | ADR-024 n'énumère pas le SQL de `Deadlines` dans `runtime/` : confirmer ou amender.                                                                                            |
| J1.13  | `sub` VAPID = URL publique du dépôt : confirmer (gardé à J1.18).                                                                                                               |
| J1.14  | Pas de React Aria : bouton natif sur la page de développement, preuve d'écran non applicable avant J3.13 : confirmer.                                                           |
| J1.14  | `domain-is-pure` interdit aussi les tests dans `domain/` : une exception pour `*.test.ts` sera nécessaire (`.dependency-cruiser.cjs`, humain).                                  |
| J1.14  | Exception oxlint (`import/default`) pour les imports `?worker&url` de Vite : facultative.                                                                                      |
| J1.14  | Routes push ouvertes sans session jusqu'à J3.6, en production ; au-delà de 50 abonnements, une alarme dépasserait les 50 sous-requêtes (et chaque envoi coûte du CPU, section 3). |
| J1.16  | Second point d'entrée Worker local (`runtime/restore-local.ts`), motif nouveau : confirmer ; une règle `.dependency-cruiser.cjs` le tiendrait aussi.                             |
| J1.18  | `VAPID_PUBLIC_KEY` en secret alors que §10.1 parle de variables non secrètes : confirmer.                                                                                       |

Remarques des mêmes entrées depuis réglées : patches de §10.1 et de `src/server/AGENTS.md` (appliqués),
exception `**/interface/**` (J0.5 fix), port des échéances (ADR-025), envoi push hors transaction et délai de
10 s (J1.14), CI de `test:workers` (J0.10 fix), en-tête `Authorization` masqué (section 4), tables internes
(section 4). Branches `ci/J1.17` et `ci/J1.18` : déjà supprimées (seule `main` existe le 2026-11-14).

### 6.8 Pour clore

Après tes décisions : appliquer les patches d'ADR, ajouter la ligne de plan, puis passer J1.19 à `done`
(`DP_HUMAN=1 DP_HUMAN_GATE=A git commit …`). Tant que la ligne CPU n'est pas faite, §14.1 demande de ne pas
ouvrir le jalon 2.
