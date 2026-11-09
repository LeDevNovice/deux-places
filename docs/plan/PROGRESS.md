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
