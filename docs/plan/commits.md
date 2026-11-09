# Deux Places — plan de développement commit par commit

Nov 9, 2026 · @LeDevNovice

## En bref

Ce plan découpe la [spécification technique v2](https://claude.ai/artifact/3iEuES9dpAJS14hA7pLdLw) en 9 jalons et 114 commits, chacun assez petit pour qu'un agent le réalise dans une session courte, avec ses tests, et qu'un humain le relise en quelques minutes. L'ordre est celui qu'un artisan suivrait : d'abord ce qui rend le dépôt sûr, puis un squelette qui traverse toute la chaîne, puis des tranches verticales que le couple peut utiliser un vrai soir.

**Comment l'utiliser**

- Exporter ce document en Markdown dans le dépôt (`docs/plan/commits.md`) : c'est la liste de travail de l'agent. Chaque ligne d'un tableau de jalon = un commit, avec son message, son contenu et sa vérification.
- L'agent suit le protocole de la section 2 : lire la ligne, écrire les tests d'abord, faire passer, vérifier, committer avec le message prévu, s'arrêter sur les conditions listées.
- Quatre points de contrôle humains (section 3) bloquent la suite : les six vérifications du squelette, le premier vrai soir, deux semaines d'usage de la v1, quatre semaines de la v2.

**Trois ajustements à la spécification v2, au nom de la simplicité** (détaillés en section 13) :

- un seul paquet et une seule configuration Vite + Wrangler, grâce au plugin Vite de Cloudflare, au lieu d'espaces de travail pnpm avec Turborepo ;
- des jetons de design écrits directement en variables CSS, vérifiés par un test de contraste, au lieu d'une chaîne DTCG → Style Dictionary ;
- la couleur dominante des affiches échantillonnée dans le navigateur à l'ajout, et non calculée par le serveur, pour rester sous le plafond de 10 ms de CPU.

## 1. Ce que dit l'état de l'art

Sept principes, tous sourcés, façonnent l'ordre et la taille des commits. Le fil rouge : chaque commit laisse le dépôt vert, change une seule chose, et apporte la preuve qu'il marche.

| Principe | Ce qu'il dit | Conséquence dans ce plan |
| --- | --- | --- |
| TDD « canonique » ([Kent Beck](https://newsletter.kentbeck.com/p/canon-tdd)) | Liste de tests → un test → le faire passer → refactoriser éventuellement → recommencer ; ne pas convertir toute la liste en tests d'un coup ; ne pas mélanger refactorisation et passage au vert ; « la duplication est un indice, pas un ordre » | Chaque commit de règle arrive vert avec ses tests ; la refactorisation qui suit est un commit `refactor:` à part |
| Séparer structure et comportement ([*Tidy First?*, résumé de H. Warne](https://henrikwarne.com/2024/01/10/tidy-first/)) | Les changements de structure et de comportement vont dans des commits séparés ; ranger d'abord quand cela rend le changement suivant plus facile, sinon plus tard ou jamais | Un rangement nécessaire devient un commit `refactor:` inséré avant la ligne du plan (numéroté `J4.6a`) |
| Squelette ambulant et tranches verticales (spécification v2, section 14) | Prouver toute la chaîne avant le métier, puis livrer des tranches utilisables | Jalon 1 = les six vérifications ; chaque jalon suivant se termine par un parcours utilisable et un test E2E |
| Commits conventionnels | `type(portée): description`, `feat` et `fix` porteurs de sens, `!` pour une rupture | Messages donnés dans le plan, en anglais comme le code ; portée = module (`reserve`, `evening`…) |
| Fichier `AGENTS.md` ([agents.md](https://agents.md/)) | Un « README pour agents » : commandes, style, tests, règles de commit ; le plus proche dans l'arborescence l'emporte | Commit J0.2 ; court, revu à chaque jalon |
| Spécifier pour un agent ([Addy Osmani](https://addyosmani.com/blog/good-spec/)) | Tâches petites, critère de fin explicite, commandes exactes, trois niveaux de limites (toujours / demander / jamais) | Colonne « Vérification » sur chaque ligne ; limites en section 2 |
| Donner à l'agent un moyen de vérifier ([bonnes pratiques Claude Code](https://code.claude.com/docs/en/best-practices.md)) | Tests, build ou capture comparable à la maquette ; contexte neuf entre tâches ; relecture par un contexte frais, mais en ne retenant que les écarts de justesse, sinon on dérive vers la sur-ingénierie | Un commit = une session courte ; relecture adverse aux points de contrôle seulement |

**Outillage confirmé par la recherche**

- Le plugin Vite de Cloudflare exécute le serveur de développement Vite dans le runtime des Workers et sert une application monopage avec `not_found_handling: "single-page-application"` ([Cloudflare](https://blog.cloudflare.com/full-stack-development-on-cloudflare-workers/)).
- Les Durable Objects se testent avec Vitest 4.1 et le plugin `@cloudflare/vitest-plugin` (`cloudflareTest`) : `runInDurableObject`, `runDurableObjectAlarm`, `evictDurableObject` ; le stockage SQL exige la déclaration `new_sqlite_classes` ([Cloudflare](https://developers.cloudflare.com/durable-objects/examples/testing-with-durable-objects)).
- Le service de langage Effect pour TypeScript 7 est le paquet `@effect/tsgo` (greffon `@effect/language-service`, commande `effect-tsgo patch`, préréglage oxlint) : ses diagnostics sortent comme des erreurs TypeScript, donc lisibles par un agent ([Effect](https://effect.website/docs/v4/getting-started/devtools)).

## 2. Protocole de l'agent

L'agent réalise une ligne du plan par session, du début à la fin, puis s'arrête. C'est aussi la bonne granularité pour un budget de tokens hebdomadaire : on peut interrompre le projet à n'importe quel commit sans rien laisser à moitié fait.

### 2.1 Cycle d'un commit

1. **Lire** la ligne du plan, les sections de spécification qu'elle cite, `AGENTS.md` et `CONTEXT.md`. Ne lire du code existant que ce qui est touché.
2. **Lister les tests** de la ligne (comportements, pas implémentation), en partant des règles RG citées et de leur texte exact dans la [spécification produit](https://claude.ai/artifact/GNg7aC7e9azSr2LLaedCow).
3. **Un test à la fois** : l'écrire, le voir échouer pour la bonne raison, le faire passer avec le minimum de code, refactoriser si utile. Recommencer jusqu'à vider la liste.
4. **Vérifier** : `pnpm check` (types, lint, frontières, tests rapides), puis la commande de la colonne « Vérification ». Pour un écran : capture Playwright en ambiance Salle et Hall, comparée à la planche de maquette nommée.
5. **Committer** avec le message du plan, un corps qui dit pourquoi, et une ligne `Plan: Jx.y` ; un seul commit par ligne.
6. **Rendre compte** : ce qui a été fait, la sortie des vérifications, ce qui a été ajouté à la liste de tests pour plus tard.

Si la ligne nécessite d'abord un rangement du code existant, l'agent le fait dans un commit `refactor:` séparé (`Jx.ya`), sans changement de comportement, avant la ligne elle-même.

### 2.2 Message de commit

```
feat(reserve): reveal partner rating once both members rated

RG-04: a rating stays hidden from the partner until they rate too,
to avoid influence and negotiation. Applied in API responses and
live events through a single projection function.

Plan: J4.6
```

### 2.3 Limites

| Toujours | Demander d'abord | Jamais |
| --- | --- | --- |
| Écrire le test avant le code | Ajouter une dépendance non prévue par la ligne | Committer un test rouge, désactivé ou affaibli pour passer |
| Lancer `pnpm check` avant chaque commit | Modifier un schéma de `contracts` déjà déployé | Modifier une règle RG ou son test pour qu'il passe |
| Utiliser le vocabulaire de `CONTEXT.md` | Changer une ADR ou l'arborescence | Committer un secret, une clé ou une donnée réelle |
| Importer Effect selon la règle par couche (ADR-022) | Déployer en production | Lire l'heure système hors du service `Clock` |
| Garder la ligne dans son périmètre | Toute action sur un compte (Cloudflare, TMDB, Brevo, Grafana, GitHub) | Ajouter une abstraction « pour plus tard » |

### 2.4 Conditions d'arrêt

L'agent s'arrête et rend compte, sans contourner, quand :

- deux tentatives de suite n'ont pas fait passer un test ;
- une API Effect ou Cloudflare ne correspond pas à la documentation citée (versions 4.1 et suivantes) ;
- une règle de la spécification produit est ambiguë ou contredit un test existant ;
- une route dépasse le plafond de CPU mesuré ou le budget de poids JavaScript ;
- la ligne demande un secret, un compte ou une décision humaine (points de contrôle, ADR).

### 2.5 Fichiers de contexte

- **`AGENTS.md`** (commit J0.2), court : commandes, règles de la section 2.3, conditions d'arrêt, où trouver le plan et les spécifications. Toute règle que l'agent applique déjà sans qu'on la lui dise en est retirée.
- **`CONTEXT.md`** : glossaire français ↔ anglais (Foyer = Household, Séance = Showing, Changer d'affiche = Swap…) et carte des contextes.
- **`docs/rules.md`** : les règles RG-01 à RG-52 recopiées de la spécification produit, en lecture seule ; un script vérifie que chaque règle citée par une ligne terminée a un test qui la nomme.
- **`docs/plan/commits.md`** : ce plan, dont la version lisible par machine (docs/plan/plan.json) n'est modifiée par l'agent que sur le statut de la ligne terminée, dans le même commit.

## 3. Vue d'ensemble

Le projet avance en trois temps : un socle sans fonctionnalité visible, la v1 qui rend le soir sans décision, puis la v2 qui organise la semaine à deux. Quatre points de contrôle humains décident si l'on continue.

&#91;embedded content: jalons et points de contrôle · 9 jalons, 4 contrôles\]

Le jalon 6 (exploitation) est placé avant la fin de la v1 : on ne confie pas deux semaines de soirées à une application sans alertes ni sauvegarde restaurée. Un commit de jalon ne commence jamais avant que le jalon précédent soit vert en CI et déployé.

## 4. Jalon 0 — Fondations du dépôt (11 commits)

Objectif : un dépôt où l'agent ne peut pas committer du code qui ne compile pas, qui viole les frontières ou qui casse un test. Aucune fonctionnalité encore.

| # | Commit | Contenu | Vérification |
| --- | --- | --- | --- |
| J0.1 | `chore: initialize repository with pnpm, Node 26 and strict TypeScript 7` | `package.json` (ESM, `packageManager`, `engines` Node 26), `tsconfig.json` strict avec `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax` ; `.gitignore`, `.editorconfig`, `.nvmrc`, README de 10 lignes ; script prepare qui active les hooks du kit (.githooks) ; tsconfig.json qui étend tsconfig.base.json fourni par le kit | `pnpm install && pnpm tsc --noEmit` |
| J0.2 | `docs: add AGENTS.md, CONTEXT.md and rules list` | Les trois fichiers de la section 2.5 ; `docs/rules.md` recopie RG-01 à RG-52 mot pour mot | Relecture humaine |
| J0.3 | `docs: record architecture decisions ADR-001 to ADR-023` | Un fichier MADR court par décision du registre v2, plus ADR-023 (ajustements de ce plan, section 13) | Relecture humaine |
| J0.4 | `chore: add oxlint and Prettier` | Scripts `lint`, `format`, `format:check` | `pnpm lint && pnpm format:check` |
| J0.5 | `chore: add Effect language service with @effect/tsgo` | `effect` 4.1.x épinglé à la version exacte ; greffon `@effect/language-service` ; script `prepare: effect-tsgo patch --oxlint` ; préréglage oxlint recommandé ; usage d'API « unstable » autorisé seulement dans `src/contracts` et `**/interface` | Un import instable placé dans un fichier de domaine produit une erreur (fichier d'essai non commité) |
| J0.6 | `test: set up Vitest 4 with a unit project` | `vitest.config.ts` avec un projet `unit` (environnement Node) ; un test de fumée | `pnpm test` |
| J0.7 | `chore: enforce module and layer boundaries with dependency-cruiser` | Règles : `domain` n'importe que `shared-kernel` et `effect` (`Result`, `Option`, `Data`, `Brand`) ; un module n'importe un autre que par son `index.ts` ; `web` n'importe jamais `server` et inversement ; `contracts` n'importe ni l'un ni l'autre | `pnpm depcruise` vert ; un import interdit d'essai le fait échouer |
| J0.8 | `chore: add a single check script` | `pnpm check` = types + lint + format + frontières + tests rapides + scripts du kit (plan-check, rules-check) | `pnpm check` |
| J0.9 | `chore: add a precommit script for format, lint and secret scan` | Script precommit appelé par .githooks/pre-commit (fourni par le kit) : format et lint des fichiers indexés, gitleaks. Les messages sont déjà contrôlés par .githooks/commit-msg (ni Lefthook ni commitlint, ADR-023) | Un faux secret indexé est refusé ; un fichier mal formaté est refusé |
| J0.10 | `ci: run checks on every push` | GitHub Actions : Node 26, cache pnpm, verify.mjs --ci, `pnpm check`, gitleaks | Exécution verte sur GitHub |
| J0.11 | `chore: configure Renovate with grouped weekly updates` | `effect` et `@effect/*` groupés et épinglés ensemble ; aucune fusion automatique | Validation de la configuration Renovate |

## 5. Jalon 1 — Squelette ambulant (19 commits)

Objectif : lever les six risques de la spécification v2 (section 14.1) avant d'écrire la moindre règle. Chaque vérification est rattachée à un commit ; le jalon se termine par une décision humaine.

| # | Commit | Contenu | Vérification |
| --- | --- | --- | --- |
| J1.1 | `build: add Vite 8 and React 19 app shell` | `src/web/` : `index.html`, `main.tsx`, `App.tsx` qui affiche « Deux Places » | `pnpm dev`, `pnpm build` |
| J1.2 | `build: serve the PWA and a Worker with the Cloudflare Vite plugin` | `wrangler.jsonc` (entrée `src/server/worker.ts`, fichiers statiques en mode application monopage) ; le Worker répond un `404` au format *problem+json* sur `/api/*` | `/` sert la page, `/api/x` renvoie le 404 JSON, en développement et après build |
| J1.3 | `test: add a Workers integration project` | Projet Vitest `workers` avec `cloudflareTest({ wrangler: { configPath } })` ; premier test sur le 404 | `pnpm test:workers` |
| J1.4 | `feat(server): validate configuration at startup with Effect Config` | `Layer` de configuration (clé TMDB, clés VAPID, clé Brevo, secret d'export, point OTLP optionnel) ; `.dev.vars.example` | Test : un secret manquant donne une erreur explicite au démarrage |
| J1.5 | `feat(contracts): define the API with a health endpoint` | `src/contracts/api.ts` : `HttpApi` préfixe `/api/v1`, groupe `system`, `GET /health` → `{ status, version }` | `pnpm check` |
| J1.6 | `feat(server): serve the HttpApi from the Household Durable Object` | Liaisons `Household` et `Directory` (`new_sqlite_classes`), espace de noms `jurisdiction("eu")` ; runtime Effect construit une fois par objet ; le Worker transmet `/api/v1/*` à un foyer de développement fixe (retiré en J3.6) | Test d'intégration : `GET /api/v1/health` → 200 |
| J1.7 | `feat(server): apply SQLite migrations when a Durable Object starts` | `SqliteMigrator` de `@effect/sql-sqlite-do`, migrations exécutées avant toute requête ; migration `0001` | `runInDurableObject` : la table existe ; après `evictDurableObject`, redémarrage sans réappliquer |
| J1.8 | `feat(server): add JSON logs and security headers` | Journal Effect en JSON avec identifiant de requête ; CSP et en-têtes de la spécification v2 (13.3) sur la PWA et l'API | Test : en-têtes présents sur `/` et `/api/v1/health` |
| J1.9 | `feat(web): show API health with a typed HttpApiClient` | Client dérivé de `contracts`, appelé depuis TanStack Query | La page affiche la version de l'API |
| J1.10 | `build: enforce the 170 KB initial JavaScript budget` | Script qui mesure le JavaScript initial compressé après build et échoue au-delà ; ajouté à la CI | **Vérification 3 (poids)** : rapport vert, chiffre noté |
| J1.11 | `feat(server): broadcast to hibernatable WebSockets of a household` | `/api/v1/live` accepté par le Durable Object, ping/pong automatique, contrôle de l'en-tête `Origin` | Test : deux clients connectés reçoivent le même message ; **vérification 4** sur deux téléphones |
| J1.12 | `feat(server): run deadlines through the Durable Object alarm` | Table `deadlines`, service `Deadlines.schedule` ; l'alarme exécute les échéances dues et réarme la plus proche, jamais sur l'instant courant | `runDurableObjectAlarm` ; test anti-boucle |
| J1.13 | `feat(server): send Web Push with VAPID using WebCrypto` | Port `PushSender` ; signature VAPID (RFC 8292) et chiffrement `aes128gcm` (RFC 8291) en WebCrypto, sans dépendance Node | Test sur l'exemple chiffré de la RFC 8291, section 5 |
| J1.14 | `feat(web): register a service worker and a push subscription` | Service worker minimal (notification avec `tag`) ; page de développement « Tester une notification dans 1 min » | **Vérification 5** : le téléphone reçoit la notification, application fermée |
| J1.15 | `feat(server): export household data behind a secret` | Route interne d'export JSON de toutes les tables du foyer, secret comparé en temps constant | Test : 401 sans secret, export complet avec |
| J1.16 | `feat(server): import an export into a local Durable Object` | Script de développement `pnpm restore:local <fichier>` | Test aller-retour export → import → export identique |
| J1.17 | `ci: back up households weekly to a private repository` | Tâche planifiée GitHub Actions : export, chiffrement `age`, dépôt privé, 14 exports gardés | **Vérification 6** : un export déchiffré puis restauré localement |
| J1.18 | `ci: deploy from main outside evening hours` | `wrangler deploy` si l'heure de Paris est hors 19 h – 1 h ; test de fumée sur `/api/v1/health` | **Vérification 1 (chaîne complète)** : PWA installée sur le téléphone, santé verte en production |
| J1.19 | `docs: record skeleton measurements and the site address` | Annexe de l'ADR-016 : temps CPU relevés dans l'observabilité Workers pour les routes et l'envoi push ; poids ; ADR-017 : adresse retenue | **Vérification 2 (CPU)** ; **point de contrôle humain A** |

**Point de contrôle A** : Grégory valide les six vérifications et choisit l'adresse du site (`workers.dev` ou domaine acheté). Ce choix est définitif, car les passkeys créées au jalon 3 y seront liées. Si une vérification échoue, la décision correspondante de la spécification v2 est revue avant le jalon 2.

## 6. Jalon 2 — Noyau partagé et socle applicatif (9 commits)

Objectif : poser une seule fois ce que toutes les tranches utiliseront (identifiants, temps du foyer, événements, idempotence, erreurs), puis les garde-fous de qualité du domaine. Les règles métier, elles, arrivent avec leur tranche, pas toutes d'avance.

| # | Commit | Contenu | Vérification |
| --- | --- | --- | --- |
| J2.1 | `feat(kernel): add branded identifiers and UUIDv7 generation` | `HouseholdId`, `MemberId`, `ReserveItemId`… avec `Brand.nominal` ; générateur UUIDv7 basé sur `Clock` | Propriété : un identifiant généré plus tard se trie après |
| J2.2 | `feat(kernel): compute the evening date with a 5 a.m. cutoff` | `eveningDateOf(instant, zone)` sur `DateTime` d'Effect, fuseau `Europe/Paris` | Propriétés : tout instant appartient à une seule soirée, changements d'heure compris ; 0 h 40 → la veille |
| J2.3 | `feat(kernel): compute week start and fortnight index` | Semaine du lundi au dimanche (RG-20) ; indice de quinzaine pour l'alternance des cartes blanches (RG-22) | Tests aux bornes (dimanche 23 h 59, lundi 4 h 59) |
| J2.4 | `feat(server): append domain events and replay them to live clients` | Table `domain_events` (séquence), service `DomainEvents` : écriture dans la transaction, diffusion après validation, reprise `?since=` ; table `event_reactions` pour les réactions internes | Tests : reprise après reconnexion ; réaction rejouée après `evictDurableObject`, jamais deux fois |
| J2.5 | `feat(server): make commands idempotent with Idempotency-Key` | Intergiciel `HttpApi` ; table `idempotency_keys`, conservation 48 h | Tests : même clé → même réponse sans second effet ; même clé et corps différent → 422 `idempotency-key-reused` |
| J2.6 | `feat(server): render errors as RFC 9457 problems` | `HttpApiError.Problem` et intergiciel *Problem Details* d'Effect 4.1 ; `instance` = identifiant de requête ; 500 sans détail | Tests : entrée invalide → 400 `validation` ; erreur imprévue → 500 sans pile |
| J2.7 | `feat(web): connect to live events and invalidate queries` | Client WebSocket avec reconnexion progressive et reprise par numéro de séquence ; table de correspondance événement → clés TanStack Query | Test de composant avec un faux serveur WebSocket |
| J2.8 | `chore: report RG coverage from test names` | Script qui rapproche `docs/rules.md` des titres de tests `RG-xx` ; échoue si une règle marquée « testée » n'a pas de test | `pnpm rules:check` dans `pnpm check` |
| J2.9 | `test: run mutation testing on domain code` | Stryker limité à `src/server/modules/*/domain` et `src/shared-kernel`, seuil 80 % ; tâche CI nocturne | Rapport Stryker généré |

## 7. Jalon 3 — Foyer, passkeys et invitation (13 commits)

Objectif : les deux téléphones entrent dans le même foyer, chacun avec sa passkey, et l'interface pose ses fondations visuelles (ambiances Salle et Hall, composants accessibles). C'est la tranche 1 de la spécification v2.

| # | Commit | Contenu | Vérification |
| --- | --- | --- | --- |
| J3.1 | `feat(ui): add Salle and Hall design tokens as CSS variables` | `tokens.css` avec les valeurs de la [spécification design](https://claude.ai/artifact/8Yi6dfi8NhDipNHEqrpPNg) ; Fraunces et Inter auto-hébergées (WOFF2, sous-ensemble latin) | Test : chaque paire texte / fond déclarée atteint le contraste WCAG AA |
| J3.2 | `feat(web): switch ambiance by schedule and system preference` | Fonction pure qui choisit Salle ou Hall (heure réglée, Toujours, Jamais, Téléphone) ; `data-ambiance`, `theme-color`, `prefers-reduced-motion` | Tests de la fonction aux bornes horaires |
| J3.3 | `feat(ui): add base components on React Aria` | Bouton, feuille, puce, toast, contrôle segmenté | Tests Testing Library + axe en mode navigateur |
| J3.4 | `feat(household): limit a household to two members` | Agrégat `Household` pur, erreur `HouseholdFull` | Tests du domaine |
| J3.5 | `feat(directory): register a passkey and create a household` | Tables de l'Annuaire (comptes, identifiants de passkeys, défis) ; `@simplewebauthn/server` ; création du Durable Object du foyer | Test d'intégration avec réponses WebAuthn enregistrées |
| J3.6 | `feat(directory): sign in with a passkey and keep a server session` | Cookie `__Host-session` glissant et révocable ; le Worker résout le foyer depuis la session et le foyer de développement de J1.6 disparaît | Tests : sans session → 401 ; session révoquée → 401 ; foyer d'autrui → 404 |
| J3.7 | `feat(directory): send a magic link fallback through Brevo` | Port `Mailer`, adaptateur Brevo et adaptateur en mémoire ; jeton de 256 bits haché, 15 min, usage unique, page de confirmation | Tests : jeton réutilisé ou expiré refusé (`TestClock`) |
| J3.8 | `feat(household): invite the partner with a short code` | Code type `7K2-QX9` (alphabet sans caractères ambigus), 7 jours, usage unique ; limitation de tentatives par IP et par compte dans l'Annuaire | Tests : expiration, réutilisation, 429 après le seuil |
| J3.9 | `feat(household): join a household with the code and a passkey` | Erreurs `household-full` et `invitation-expired` ; événement `member.joined` | Tests d'intégration + message temps réel reçu par le premier membre |
| J3.10 | `feat(household): add settings and the default week template` | Limites d'épisodes, durée du joker (180 s), délai du point d'étape (15 min), mode nuit ; semaine type par défaut (RG-21) ; dernière écriture gagne | Tests RG-21 |
| J3.11 | `feat(web): add sign-up, sign-in and join screens` | Écrans des planches « Première séance » consacrés au compte et à l'invitation | Captures Salle et Hall comparées aux planches |
| J3.12 | `feat(web): add app layout and the Settings screen` | Navigation basse ; Réglages : réglages du foyer, ambiance, appareils connectés révocables | Captures + axe |
| J3.13 | `test(e2e): two members create and join a household` | Playwright, deux contextes, authentificateur WebAuthn virtuel | Parcours vert, axe sans violation |

## 8. Jalon 4 — Catalogue et Réserve (14 commits)

Objectif : chacun peut mettre un titre en réserve par recherche ou par partage Android, et noter à l'aveugle ; les notes se révèlent quand les deux ont noté. Tranches 2, 3 et 4 de la spécification v2.

| # | Commit | Contenu | Vérification |
| --- | --- | --- | --- |
| J4.1 | `feat(catalog): search titles through a TMDB anti-corruption layer` | Port `CatalogGateway`, adaptateur TMDB (`fr-FR`), décodage `Schema` du strict nécessaire ; délai 3 s, 3 essais avec attente exponentielle et aléa, respect de `Retry-After` | Réponses TMDB réelles enregistrées et rejouées ; tests de délai avec `TestClock` |
| J4.2 | `feat(catalog): fetch title details and French watch providers` | `append_to_response`, plateformes de la région FR ; tables `catalog_titles` et `catalog_availability` avec date de vérification | Tests de correspondance TMDB → domaine |
| J4.3 | `feat(household): choose streaming subscriptions` | Liste des plateformes FR depuis TMDB ; abonnements du foyer | Test d'intégration |
| J4.4 | `feat(reserve): add a title with the author's rating and energy` | RG-01 dans le domaine ; `POST /reserve` ; événement `reserve.item_added` | Tests RG-01 + intégration |
| J4.5 | `feat(reserve): rate a title and compute eligibility` | RG-02 : éligible avec deux notes sans 0 ; `PUT /reserve/{id}/rating` | Tests RG-02 |
| J4.6 | `feat(reserve): reveal partner rating once both members rated` | RG-04 : une seule fonction de projection, utilisée par les réponses et par les messages temps réel ; événement `rating.revealed` | Propriété RG-04 ; test d'API dans les deux sens |
| J4.7 | `feat(reserve): let only the vetoing member change a zero rating` | RG-03 ; erreur 403 `veto-owned-by-other` ; filtre « Écartés » | Tests RG-03 |
| J4.8 | `feat(reserve): keep solo wishes and taste seeds private` | RG-06 : liste « Pour moi » ; goûts « adorés / détestés » (5 + 5) jamais envoyés à l'autre | Test d'API : aucune fuite vers l'autre membre |
| J4.9 | `feat(reserve): track watched and comfort titles` | RG-05 : un titre vu par les deux n'est plus une nouveauté ; doudou si les deux le veulent | Tests RG-05 |
| J4.10 | `feat(web): add a title from search` | Planches « Mettre en réserve » (recherche, confirmation avec note et énergie) ; couleur d'attente échantillonnée sur l'affiche dans le navigateur, couleur neutre si l'image refuse la lecture | Captures Salle et Hall ; test de composant |
| J4.11 | `feat(catalog): resolve a shared link into title candidates` | `POST /share/resolve` : liens des plateformes, de TMDB ou texte libre → 3 candidats, sans deviner | Tests sur des partages réels enregistrés |
| J4.12 | `feat(web): receive Android shares` | `share_target` du manifeste ; écran de confirmation | Essai manuel depuis l'application d'une plateforme sur le téléphone |
| J4.13 | `feat(web): add Reserve, To rate and Title screens` | Segments et filtres ; « À noter » ; Fiche titre avec « Location » ou « Achat » sans prix (ADR-013) ; attributions TMDB et JustWatch | Captures comparées aux planches ; axe |
| J4.14 | `test(e2e): add titles and reveal blind ratings on two phones` | Ajout par recherche et par partage simulé ; notes à l'aveugle révélées en direct | Parcours vert |

## 9. Jalon 5 — Programme, moteur et Ce soir (10 commits)

Objectif : ouvrir l'application le soir et lancer le programmé en un geste. C'est le cœur de la solution et la première fois que le couple peut s'en servir pour de vrai (tranches 5 et 6).

| # | Commit | Contenu | Vérification |
| --- | --- | --- | --- |
| J5.1 | `feat(programme): generate the week plan from the template` | Agrégat `WeekPlan` ; RG-20 (lundi → dimanche), RG-21 (semaine type par défaut), RG-25 (soir sans programme = série du couple) | Tests RG-20, RG-21, RG-25 |
| J5.2 | `feat(programme): designate the couple series and the next series` | RG-10 (conditions d'entrée), RG-11 (toujours une suivante, sinon alerte) ; index uniques partiels en base | Tests RG-10, RG-11 + contraintes SQLite |
| J5.3 | `feat(programme): hand over to the next series when one ends` | RG-13 : fin du dernier épisode disponible → « terminée », la suivante prend le relais | Tests RG-13 |
| J5.4 | `feat(stubs): record deciders and compute 28-day equity` | RG-40 (décideur par type de séance), RG-41 (écart sur 28 jours glissants), fonctions pures | Tests RG-40, RG-41 avec dates aux bornes |
| J5.5 | `feat(reserve): score proposals and explain them` | Moteur pur : poids α, β, γ, δ injectés, raison affichable ; filtres RG-02, RG-03, RG-05 et énergie / disponibilité ; l'équité pondère sans jamais sortir (RG-42) | Propriétés de la spécification v2 (11.3) ; déterminisme à entrées égales |
| J5.6 | `feat(evening): resolve tonight's programme` | `GET /tonight` : titre, épisode, plateforme et états (nominal, carte blanche de l'autre, sans programme, série terminée sans suivante, titre devenu indisponible) | Un test par état ; test d'acceptation « Défaut du soir (RG-30) » de la spécification produit |
| J5.7 | `feat(evening): launch a showing with the platform link` | RG-30 ; décideur enregistré ; une séance principale par soir ; RG-14 : limite d'épisodes affichée sans bloquer ; événement `showing.launched` | Tests RG-30, RG-14 + idempotence du lancement |
| J5.8 | `feat(web): add the Tonight screen in all its states` | Planches « Ce soir » : série, Grande séance avec « Fin vers » calculé sur le téléphone, carte blanche, reprise, série terminée, plus dispo, libre, Bonne séance | Captures Salle et Hall par état ; Lancer sans défilement sur un écran de téléphone |
| J5.9 | `feat(web): add the Programme screen with simple slot editing` | Vue de la semaine, modification d'un créneau par liste de choix (dernière écriture gagne) ; le glisser-déposer arrive en v2 | Captures + axe |
| J5.10 | `test(e2e): launch tonight's programme in one tap` | Horloge pilotée à 20 h 45 ; parcours complet d'ouverture à « Bonne séance » | Parcours vert, axe |

**Point de contrôle B : le premier vrai soir.** Déployer, l'utiliser un soir au lit, noter chaque friction. Les frictions deviennent des lignes `fix:` insérées avant le jalon 6, plutôt que de nouvelles fonctionnalités.

## 10. Jalon 6 — Exploitation minimale avant l'essai réel (9 commits)

Objectif : avant de confier les soirées du couple à l'application pendant deux semaines, savoir quand quelque chose casse et pouvoir tout restaurer. Ce jalon vient volontairement avant la fin de la v1, pas après.

| # | Commit | Contenu | Vérification |
| --- | --- | --- | --- |
| J6.1 | `feat(server): export traces over OTLP to Grafana Cloud` | Une span par cas d'usage (`Effect.fn`), par appel TMDB et par envoi push ; export après la réponse (`waitUntil`) ; aucun attribut personnel | Trace visible dans Grafana ; test : aucun e-mail ni note dans les attributs |
| J6.2 | `feat(web): report client errors and web vitals` | `POST /api/v1/telemetry` (erreurs JavaScript, LCP, INP, CLS), limité en débit | Test d'intégration ; erreur provoquée visible dans les journaux |
| J6.3 | `feat(server): count usage against free-tier quotas` | Compteurs quotidiens de requêtes et de lignes écrites ; seuil d'alerte à 50 % | Test avec compteur simulé au-delà du seuil |
| J6.4 | `feat(server): check daily that every household has an armed alarm` | Déclencheur Cron quotidien du Worker → Annuaire → chaque foyer | Test : un foyer sans alarme est réarmé et signalé |
| J6.5 | `feat(server): send operational alerts by email` | Canal choisi au point de contrôle A ; un seul destinataire ; dédoublonnage par type et par jour | Test avec `Mailer` en mémoire |
| J6.6 | `ci: restore the latest backup monthly and verify it` | Tâche planifiée : déchiffrement, `restore:local`, requêtes de contrôle (membres, Réserve, dernières séances) | Exécution verte déclenchée à la main |
| J6.7 | `docs: add a runbook for each alert` | `docs/runbooks/` : symptôme, vérification, action, retour arrière | Relecture humaine |
| J6.8 | `feat(household): export and delete a household from Settings` | Export JSON téléchargeable ; suppression du stockage du foyer et de ses entrées dans l'Annuaire | Test : après suppression, plus aucune donnée lisible ; export complet avant |
| J6.9 | `docs(web): add the privacy page` | Données, sous-traitants, durées de conservation, restauration possible pendant 30 jours après suppression | Relecture humaine |

## 11. Jalon 7 — Fin de la v1 « Le soir sans décision » (13 commits)

Objectif : couvrir tout ce qui peut arriver un soir ordinaire — le lendemain, un titre disparu, l'envie de changer, le Wi-Fi faible — puis l'installation à deux. Tranches 7 à 11 de la spécification v2.

| # | Commit | Contenu | Vérification |
| --- | --- | --- | --- |
| J7.1 | `feat(evening): confirm last night's episodes` | RG-50 : à la première ouverture du lendemain, nombre pré-rempli avec la limite du soir ; la progression avance de la valeur validée | Test d'acceptation « Lendemain (RG-50) » |
| J7.2 | `feat(web): add the Last night card` | Planche « Hier soir », boutons + / − et Valider | Captures + axe |
| J7.3 | `feat(catalog): refresh availability nightly in batches` | Échéance vers 4 h, lots sous le plafond de 50 sous-requêtes, réarmement ; revérification du titre du soir s'il date de plus d'une heure ; bandeau discret si TMDB ne répond pas | Tests avec `runDurableObjectAlarm` et TMDB simulé en panne |
| J7.4 | `feat(evening): fall back to a comfort title when tonight's title is gone` | Remplaçant proposé ; doudou « le moins revu » avec sa date de dernier visionnage | Tests de choix déterministe |
| J7.5 | `feat(evening): start a swap with three eligible candidates once per evening` | RG-31 (exactement 3, filtrés par énergie et disponibilité), RG-35 ; erreur `swap-already-used-tonight` | Tests RG-31, RG-35 |
| J7.6 | `feat(evening): vote on swap candidates within 180 seconds` | RG-32 (premier titre accepté par les deux), RG-33 (échéance → doudou) ; alarme pour prévenir à temps | Tests `TestClock` ; test d'acceptation « Joker borné » |
| J7.7 | `feat(web): add the swap screens in single-phone mode` | Planches « Changer d'affiche » et « un téléphone » (on se passe le téléphone) | Captures + axe |
| J7.8 | `feat(web): precache the shell and cache tonight and posters` | Workbox : coquille préchargée, réseau d'abord avec repli après 1,5 s pour `/tonight`, cache d'abord pour les affiches | E2E en mode avion : Ce soir s'affiche |
| J7.9 | `feat(web): queue writes offline and replay them` | File IndexedDB avec `Idempotency-Key`, Background Sync, rejeu à l'ouverture ; état « en attente » visible | E2E : lancer hors ligne, rejeu unique au retour du réseau |
| J7.10 | `feat(reserve): generate a seed stack from subscriptions` | `discover` TMDB filtré par abonnements et région FR ; pile de 20 à 30 titres pour l'amorçage | Tests sur réponses enregistrées |
| J7.11 | `feat(web): add the first-session onboarding` | Planches « Première séance » : abonnements, goûts, pile notée à l'aveugle, présence de l'autre en direct | Captures + axe ; essai à deux téléphones |
| J7.12 | `test(e2e): cover first session, last night, swap and airplane mode` | Parcours de la spécification produit correspondants | Suite E2E verte en moins de 10 min |
| J7.13 | `chore(release): tag v1.0.0` | Journal des changements généré depuis les commits conventionnels | **Point de contrôle humain C** |

**Point de contrôle C** : deux semaines d'usage par les deux, avec la majorité des soirs sur le programme par défaut (condition de la spécification produit). Sinon, on corrige la v1 avant d'ouvrir la v2.

## 12. Jalon 8 — v2 « La semaine à deux » (16 commits)

Objectif : le joker sur deux téléphones, le rituel du dimanche, l'équité discrète, le point d'étape et les Billets. Ce jalon ne s'ouvre qu'après le point de contrôle C.

| # | Commit | Contenu | Vérification |
| --- | --- | --- | --- |
| J8.1 | `feat(evening): synchronize swap votes across both phones` | Événements `swap.vote_cast` et `swap.resolved` ; le Durable Object sérialise les votes | Test : deux votes envoyés en parallèle → une seule issue, un seul événement |
| J8.2 | `feat(web): show the partner's votes live during a swap` | Planche « Trois affiches » : votes de l'autre et état « en attente » | E2E à deux contextes |
| J8.3 | `feat(notifications): notify swap votes when the partner already answered` | Push vers l'autre téléphone ; préférences par type, toutes désactivables | Tests avec `PushSender` en mémoire |
| J8.4 | `feat(programme): run the Sunday ritual as a shared state machine` | Étapes du rituel validées par les deux ou passées ; rejeu idempotent ; erreur `ritual-step-out-of-order` | Tests de la machine à états + propriété : aucun état intermédiaire incohérent |
| J8.5 | `feat(programme): pick the film with 5-3-1` | RG-24 : 5 puis 3 puis 1, proposeur alterné chaque semaine | Tests RG-24 |
| J8.6 | `feat(programme): alternate cartes blanches and let them move` | RG-22 (une par quinzaine, en alternance, déplaçable), RG-23 (choix libre, jamais compté comme un échec) | Propriété : alternance stricte ; test d'acceptation « Carte blanche » |
| J8.7 | `feat(web): add the programming ritual screens` | Planches « La programmation » (4 étapes), synchronisées en direct | Captures + E2E à deux |
| J8.8 | `feat(web): move a carte blanche with accessible drag and drop` | Glisser-déposer React Aria, au doigt, au clavier et au lecteur d'écran | Test clavier complet + axe |
| J8.9 | `feat(reserve): weight proposals by equity` | RG-41 / RG-42 : bonus β aux ajouts du membre le moins servi, écart jamais affiché | Test d'acceptation « Équité » ; propriété de la spécification v2 |
| J8.10 | `feat(evening): send the 15-minute checkpoint with actions` | RG-34 : échéance à lancement + 15 min sur un titre jamais vu ; actions « Oui » et « Une reprise plutôt » ; durée de vie 10 min ; réponse du service worker authentifiée et idempotente | Tests `TestClock` ; essai réel sur téléphone |
| J8.11 | `feat(programme): rate a series after its third episode` | RG-12 : note 1 à 3 de chacun ; un 1 → « abandonnée », la suivante la remplace | Test d'acceptation « Sortie de série » |
| J8.12 | `feat(reserve): suggest titles when the Reserve runs low` | Amorçage automatique s'il reste moins de 3 séries ou 3 films prêts ; regroupement après une note | Tests avec échéance regroupée |
| J8.13 | `feat(stubs): add Stubs with verdicts and weekly ratings` | RG-51 (avis en un geste), RG-52 (note de semaine 1 à 5, soir de résignation) ; courbe des 8 dernières semaines | Tests RG-51, RG-52 ; captures de la planche Billets |
| J8.14 | `feat(notifications): remind the ritual and cap reminders` | Rappel du dimanche à l'heure réglée ; « titres à noter » au plus une fois par jour | Tests du plafond quotidien |
| J8.15 | `test(e2e): run the Sunday ritual and a two-phone swap` | Parcours de la spécification produit correspondants | Suite E2E verte |
| J8.16 | `chore(release): tag v2.0.0` | Journal des changements | **Point de contrôle humain D** |

**Point de contrôle D** : quatre semaines d'usage avec une satisfaction hebdomadaire de 4 ou plus pour les deux (condition de la spécification produit) avant d'envisager la v3.

## 13. Ce qui est volontairement absent

Un plan sans sur-ingénierie se juge autant à ce qu'il n'écrit pas. Chaque absence ci-dessous a une condition claire de retour : on l'ajoute le jour où la condition est vraie, pas avant.

### 13.1 Ajustements à la spécification v2 (ADR-023)

| Spécification v2 | Ce plan | Pourquoi |
| --- | --- | --- |
| Espaces de travail pnpm (`apps/edge`, `apps/web`, 4 paquets) + Turborepo | Un seul paquet ; dossiers `src/{server,web,contracts,shared-kernel,ui}` ; frontières tenues par dependency-cruiser | Le plugin Vite de Cloudflare construit la PWA et le Worker dans un même projet ; plusieurs paquets n'apporteraient que de la configuration |
| Jetons DTCG compilés par Style Dictionary | `tokens.css` écrit à la main + test de contraste | Une vingtaine de valeurs, deux ambiances, un seul consommateur |
| Couleur dominante calculée côté serveur | Échantillonnée dans le navigateur à l'ajout, neutre sinon | Décoder une image dans le Worker coûte du CPU sous le plafond de 10 ms |

Quatrième ajustement, apporté par le kit de cadrage de l'agent : des hooks Git natifs (`.githooks`) et des scripts Node sans dépendance remplacent Lefthook et commitlint, et sont actifs dès le premier commit (ADR-023).

### 13.2 Absents, et quand les ajouter

| Absent | Ajouter quand |
| --- | --- |
| Classes de base génériques (`Repository<T>`, `AggregateRoot`) | Trois dépôts réels montrent la même duplication (« la duplication est un indice, pas un ordre ») |
| Bibliothèque de bus d'événements, CQRS outillé | Une réaction doit sortir du Durable Object du foyer |
| Gestionnaire d'état global côté PWA, Effect Atom | TanStack Query et l'état local ne suffisent plus pour un écran |
| Bibliothèque d'internationalisation | Une deuxième langue est demandée ; d'ici là, un fichier de libellés français |
| Storybook, catalogue de composants | Plus de 20 composants partagés ou un second développeur |
| Environnement de préproduction, prévisualisations par PR | Plus d'un foyer en production |
| `/api/v2`, contrôle de compatibilité OpenAPI | Un client déployé séparément de l'API |
| Drapeaux de fonctionnalités | Une fonctionnalité doit vivre en production désactivée plus d'une semaine |
| Docker, Kubernetes, infrastructure en code | Sortie de Cloudflare (réversibilité de la spécification v2, 9.4) |
| Tests de régression visuelle automatisés sur tous les écrans | Une régression visuelle passe inaperçue une première fois ; d'ici là, captures comparées aux planches à chaque commit d'écran |

### 13.3 Et la v3 ?

La v3 (« Plus de ponts » : suggestions par modèle de langage, réapprovisionnement automatique, lancement direct sur la télé, import Trakt) n'est pas découpée en commits. Chaque sujet commence par un pic exploratoire limité dans le temps et une ADR ; son plan commit par commit s'écrit après le point de contrôle D, avec ce que l'usage aura appris.

## 14. Sources

**Documents du projet** : [Spécification technique v2](https://claude.ai/artifact/3iEuES9dpAJS14hA7pLdLw) · [Spécification de l'outil](https://claude.ai/artifact/GNg7aC7e9azSr2LLaedCow) · [Nom et design](https://claude.ai/artifact/8Yi6dfi8NhDipNHEqrpPNg) · maquettes « Deux Places » (PDF, 43 pages).

**Pratiques**

- Kent Beck, [Canon TDD](https://newsletter.kentbeck.com/p/canon-tdd)
- Henrik Warne, [résumé de *Tidy First?*](https://henrikwarne.com/2024/01/10/tidy-first/)
- [AGENTS.md](https://agents.md/)
- Addy Osmani, [How to write a good spec for AI agents](https://addyosmani.com/blog/good-spec/)
- Anthropic, [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices.md)

**Outillage**

- Cloudflare, [Full-stack development on Cloudflare Workers](https://blog.cloudflare.com/full-stack-development-on-cloudflare-workers/) (plugin Vite, application monopage)
- Cloudflare, [Testing Durable Objects](https://developers.cloudflare.com/durable-objects/examples/testing-with-durable-objects) (`@cloudflare/vitest-plugin`)
- Effect, [Devtools et service de langage](https://effect.website/docs/v4/getting-started/devtools) (`@effect/tsgo`)
