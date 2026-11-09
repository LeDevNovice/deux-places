# Journal de progression

Ajout seulement, une entrée par commit de plan, la plus récente en bas. `scripts/agent/status.mjs`
affiche les trois dernières en début de session : écrire pour l'agent qui arrivera demain sans
mémoire de cette session.

Format :

```
### 2026-11-10 · J0.4 · done
Fait : <ce qui a changé, en une ou deux lignes>
Preuve : <commandes lancées et résultat>
Décisions : <« aucune » ou la ligne Decision: du commit>
Suite : <ce que la session suivante doit savoir : piège, cas ajouté à la liste de tests, question ouverte>
```

### 2026-11-09 · J0.2, J0.3 · provided
Fait : kit d'agent ajouté par l'humain (instructions, glossaire, règles, plan, ADR, garde-fous).
Preuve : `node scripts/agent/verify.mjs` vert sur le dépôt neuf.
Décisions : ADR-023 (un seul paquet, jetons CSS à la main, couleur d'affiche côté navigateur, hooks Git natifs sans Lefthook ni commitlint).
Suite : commencer par J0.1 ; activer les hooks dès J0.1 (`prepare`).

### 2026-11-09 · J0.1 · done
Fait : `package.json` (ESM, pnpm 12.18.0, Node ^26, TypeScript 7.0.2 exact, `prepare` qui active `.githooks`), `tsconfig.json` qui étend `tsconfig.base.json` (`files: []` + `include: ["src", "e2e"]`), README projet de 10 lignes ; l'ancien README du kit est déplacé tel quel dans `docs/agent-kit.md`.
Preuve : Node 26.13.0, `pnpm install --frozen-lockfile && pnpm tsc --noEmit` → exit 0, `prepare` exécuté, `status.mjs` affiche `hooks: .githooks` ; fichiers d'essai non commités refusés par tsc (TS2322 `noUncheckedIndexedAccess`, TS2375 `exactOptionalPropertyTypes`, TS4114 `noImplicitOverride`, TS1484 `verbatimModuleSyntax`) ; `node scripts/agent/verify.mjs` vert ; relecture en contexte neuf : PASS.
Décisions : `files: []` pour que tsc passe sans source (sinon TS18003) plutôt qu'un fichier source factice ; README du kit déplacé plutôt que supprimé ; versions = `latest` npm du jour (pnpm 12.18.0, TypeScript 7.0.2).
Suite : pnpm 12 est un binaire autonome qui embarque son propre Node : un `pnpm install` lancé avec Node 22 ou 24 dans le PATH n'est PAS refusé malgré `engines` et `engine-strict` (vérifié deux fois, y compris `--config.node-version=24`) ; à garder en tête pour J0.10 (CI en Node 26 explicite). Aucun `@types/node` : `node:*` n'est pas typé tant qu'une ligne ne l'apporte pas.

### 2026-11-09 · J0.4a · done
Fait : `scripts/agent/commit-msg.mjs` et `plan-check.mjs` restructurés (clauses de garde, fonctions `trailerProblems`, `completionProblems`, `changesSinceHead` ; `_status`/`_notes` dans `strip`) pour respecter `max-depth` 3, `complexity` 10 et `no-unused-vars` d'oxlint.
Preuve : 120 cas (8 états du plan × 13 messages + `plan-check` avec et sans `--staged`) donnent les mêmes codes et sorties avant et après ; relecture en contexte neuf : PASS (série indépendante, premier commit et variables `DP_*` compris).
Décisions : refactoriser plutôt qu'exclure `scripts/agent` ou relâcher une règle (config « tighten only », override `scripts/**` voulu). Fichiers humains : commit avec `DP_HUMAN=1` sur accord explicite de Grégory en conversation.
Suite : aucune.

### 2026-11-09 · J0.4 · done
Fait : oxlint 1.92.0 et Prettier 3.9.10 (versions exactes) ; scripts `lint` (`oxlint`), `format` et `format:check` ; `.prettierrc` `{}` ; `.prettierignore` ; dans `.oxlintrc.json`, la clé `$comment` devient un commentaire `//`.
Preuve : `pnpm lint && pnpm format:check` → exit 0 ; `verify.mjs` vert ; fichier d'essai non commité sous `src/server` refusé par le lint (`no-restricted-globals` Date, `no-explicit-any`, `eqeqeq`, `no-console`, `no-non-null-assertion`) ; fichier mal formaté refusé par `format:check` puis corrigé par `format`, aucun autre fichier touché.
Décisions : oxlint refuse toute clé inconnue (`$comment`), d'où le commentaire JSONC, accepté par oxlint 1.92.0 bien que la doc ne le mentionne pas ; toutes les règles de la config sont connues (une règle inventée fait échouer le chargement). Prettier en réglages par défaut (philosophie des options), et seulement sur ce qu'écrit l'agent : `*.md` et `docs/` exclus (tableaux Markdown étirés), kit humain (liste de `protect.mjs` + `.oxlintrc.json`, `.dependency-cruiser.cjs`) et `pnpm-lock.yaml` exclus. Pas de `--deny-warnings` : la catégorie `perf` reste en `warn` comme la config le veut.
Suite : J0.5 étend `.oxlintrc.json` par `extends` ; les globs des `overrides` et `ignorePatterns` se résolvent depuis le dossier du fichier de config. Un `.json` du kit avec commentaires reste lisible par oxlint mais pas par `JSON.parse` : ne pas lire `.oxlintrc.json` avec `JSON.parse` dans un script. La liste de `.prettierignore` recopie celle de `protect.mjs` : la tenir à jour si le kit change.

### 2026-11-09 · J0.5 · done
Fait : `effect` 4.1.2 (dépendance) ; `@effect/tsgo` 0.67.5 et `oxlint-tsgolint` 7.0.2006 (dev), versions exactes ; `prepare` = `git config core.hooksPath .githooks && effect-tsgo patch --typescript --oxlint` ; dans `tsconfig.json`, greffon `@effect/language-service` avec `unstableApiUsage: error`, `off` dans `src/contracts/**/*.ts` et `**/interface/**/*.ts` ; dans `.oxlintrc.json`, `extends` du préréglage `recommended` et même règle en miroir (`effecttsgo/unstable-api-usage` en `error`, `off` dans `src/contracts/**` et `**/interface/**`).
Preuve : sans patch, un import instable dans le domaine passe `tsc` (exit 0) ; après `rm -rf node_modules && pnpm install --frozen-lockfile` (le `prepare` patche), `HttpApi.make` donne `TS377136 … effect(unstableApiUsage)` et `effecttsgo(unstable-api-usage)` en erreur dans `domain/` et `application/`, rien dans `interface/` ni `contracts/`, `Result` dans le domaine passe ; fichiers d'essai retirés : `tsc`, `lint`, `format:check`, `verify.mjs` verts.
Décisions : `oxlint-tsgolint` et `--typescript` acceptés par Grégory en conversation : `patch --oxlint` seul échoue (`DiscoveryError` sans `oxlint-tsgolint`, que le préréglage `typeAware` exige) et ne patche pas `tsc`, qui ignore alors le greffon. Règle aussi posée dans oxlint, qui ne lit pas les `overrides` du tsconfig (sinon avertissements dans `contracts/` et `interface/`). Surcharge par défaut `floatingEffect: error` sur `src/**` recopiée, car déclarer des `overrides` remplace celle de l'outil.
Suite : dans effect 4.1.2, tout `effect/sql` (`SqlClient`, `Migrator`…) et une partie de `Schema` sont étiquetés instables ; avec cette règle, l'`infrastructure/` sera signalée dès J1.7 (`SqliteMigrator`), alors que technique-v2 §3.3 y autorise « tout Effect + pilotes » : arbitrage humain à prévoir avant J1.7 (ADR-014). `effect-tsgo patch` réécrit `node_modules` : tout `pnpm install` doit laisser `prepare` tourner, sinon `tsc` ne voit plus les diagnostics Effect (à garder pour la CI de J0.10). `effect-tsgo setup` modifie le tsconfig d'après sa doc : ne pas le lancer.

### 2026-11-09 · J0.6 · done
Fait : `vitest` 4.1.12 (dev, version exacte ; Vite 8.3.6 arrive en dépendance de Vitest, pas dans `package.json`) ; `vitest.config.ts` avec un seul projet `unit` (`environment: "node"`, `include: ["src/**/*.test.ts"]`) ; script `test` = `vitest run --project unit` ; test de fumée `src/smoke.test.ts` (pas de `document` dans `globalThis`) ; `vitest.config.ts` ajouté à l'`include` du `tsconfig.json`.
Preuve : avant la config, `vitest run --project unit` → exit 1 « No projects matched the filter "unit" » ; après, `pnpm test` → 1 fichier, 1 test passés, exit 0 ; assertion inversée à titre d'essai → `FAIL |unit| src/smoke.test.ts`, exit 1, puis rétablie ; `tsc --noEmit`, `lint`, `format:check`, `verify.mjs` verts ; essais non commités : faute de frappe `enviroment` dans la config refusée par tsc (TS2769), `it.only` refusé par oxlint, erreur de type dans un `*.test.ts` refusée par tsc ; `effect-tsgo patch` toujours en place après `pnpm add` (« hash matches ») ; relecture en contexte neuf : PASS.
Décisions : `pnpm test` filtre sur `--project unit` plutôt que `vitest run` nu, pour que `pnpm test` reste « tests rapides » quand J1.3 ajoutera le projet `workers` ; `include` limité à `src/**/*.test.ts` plutôt que le défaut de Vitest, qui ramasserait aussi les `e2e/**/*.spec.ts` de Playwright ; config ajoutée au `tsconfig` pour que tsc la vérifie (passe sans `@types/node`). Vitest 4.1.12 = dernière 4.x (le `latest` npm est 5.1.0, mais la ligne et commits.md visent Vitest 4.1 pour `@cloudflare/vitest-plugin`).
Suite : `pnpm add` ne relance pas `prepare` ; le patch survit, mais vérifier avec `pnpm run prepare` (« hash matches ») après tout ajout de paquet. J1.3 : les tests d'intégration Workers devront être exclus du projet `unit` (nommage ou dossier à choisir), sinon ils tourneront en Node sans runtime Workers. Aucun `@effect/vitest` ni `@types/node` ajouté : à apporter par la ligne qui en a besoin.

### 2026-11-09 · J0.7 · done
Fait : `dependency-cruiser` 18.7.2 et `@swc/core` 1.16.22 (dev, versions exactes) ; script `depcruise` = `depcruise src --config .dependency-cruiser.cjs` ; `pnpm-workspace.yaml` avec `allowBuilds: "@swc/core": false` ; dans `.dependency-cruiser.cjs` (validé par Grégory) : `parser: "swc"`, `preserveSymlinks: true`, `domain-is-pure` limité à `effect/dist/(index|Result|Option|Data|Brand).js`, regex de `domain-no-effect-subpaths` adaptée à la disposition d'effect 4.1.2 (`dist/sql/`, `dist/http/`…).
Preuve : sans transpileur, `depcruise` → « 0 modules cruised » + `missing-typescript-transpiler` (TypeScript 7 non supporté) ; sans le refus du build de swc, `pnpm install --frozen-lockfile` → `ERR_PNPM_IGNORED_BUILDS`, exit 1, puis exit 0 avec ; avec la config d'origine, l'import autorisé `{ Result, Option, Data, Brand } from "effect"` était refusé (chemin pnpm `node_modules/.pnpm/effect@4.1.2/…`) et `effect/sql` passait ; après : un import interdit d'essai par règle → `pnpm depcruise` exit 9 avec `domain-is-pure`, `domain-no-effect-subpaths`, `modules-through-index`, `web-not-server`, `server-not-web`, `contracts-standalone` ; racine `effect`, `effect/Result` et passage par `index.ts` acceptés ; fichiers d'essai retirés : `depcruise`, `tsc`, `lint`, `format:check`, `test`, `verify.mjs` verts ; `prepare` → « hash matches ».
Décisions : swc plutôt que `typescript` < 7 (le nom `typescript` est pris par TS 7 ; dependency-cruiser n'a pas d'option CLI de parseur, d'où la config) ; `preserveSymlinks` plutôt qu'un préfixe `.pnpm/…` dans chaque regex (une ligne, indépendante de la disposition interne de pnpm) ; build de swc refusé et non approuvé (son `postinstall` ne sert qu'au repli quand le binaire natif manque). Validé par Grégory en conversation.
Suite : dependency-cruiser ne voit que des modules, pas les noms importés : `import { Effect } from "effect"` dans `domain/` passe (essai fait). La restriction d'ADR-022 aux noms `Result`, `Option`, `Data`, `Brand` repose sur la relecture (et le service de langage Effect pour les seuls exports instables). Regex à quantificateur imbriqué (`(.*/)?`) refusée par dependency-cruiser (« unsafe regular expression ») : utiliser une alternance. J0.8 : ajouter `pnpm depcruise` à `pnpm check`.
