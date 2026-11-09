# Deux Places — kit de cadrage de l'agent

Ce kit contient tout ce dont un agent de code a besoin pour construire Deux Places commit par
commit en restant conforme aux spécifications, sans dériver ni bâcler. Il se dépose dans un dépôt
vide et devient le **commit 0**, fait par toi, avant que l'agent n'écrive une ligne de code.

## Ce qu'il contient

| Couche | Fichiers | Rôle |
| --- | --- | --- |
| Instructions (consultatives) | `AGENTS.md` + `AGENTS.md` imbriqués (`src/server`, `src/web`, `src/ui`, `src/contracts`, `src/shared-kernel`, `e2e`), `CLAUDE.md` | Courtes, chargées automatiquement par le harnais ; la règle la plus proche du fichier édité l'emporte |
| Procédures à la demande | `.agents/skills/*/SKILL.md` (9 skills) | Démarrer une session, implémenter une ligne, décider, relire, Effect 4, Durable Objects, tests des règles, écrans, points de contrôle |
| Sources de vérité | `docs/specs/` (produit, design, maquettes, technique v2), `docs/rules.md`, `CONTEXT.md`, `docs/adr/` | Ce qu'il faut construire, avec quels mots, selon quelles décisions |
| Plan | `docs/plan/plan.json` (114 lignes), `commits.md`, `PROGRESS.md` | Ordre obligatoire ; l'agent ne change que `status` et `notes` |
| Garde-fous (déterministes) | `.githooks/` + `scripts/agent/*.mjs` | Refusent un commit hors ordre, un message non prévu, un test supprimé ou désactivé, une règle sans test, un fichier humain modifié |
| Configuration de qualité | `tsconfig.base.json`, `.oxlintrc.json`, `.dependency-cruiser.cjs`, `.editorconfig`, `.gitattributes`, `.npmrc`, `.nvmrc`, `.gitignore` | Rigueur du typage, du lint et des frontières d'architecture |
| Spécifique à Claude Code | `.claude/settings.json`, `.claude/hooks/protect.mjs`, `.claude/skills` → `.agents/skills` | Bloque l'édition des fichiers humains et les commandes de contournement avant même le commit |

Le principe : les instructions disent quoi faire, mais ce sont les garde-fous qui empêchent de mal
faire. Un modèle qui se relit lui-même sans retour extérieur ne s'améliore pas de façon fiable ;
des tests, des types et des scripts qui disent oui ou non, si.

## Installation (commit 0)

```bash
mkdir deux-places && cd deux-places && git init -b main
# copier le contenu du kit ici, puis :
git config core.hooksPath .githooks
node scripts/agent/verify.mjs          # doit être vert
git add -A
DP_HUMAN=1 git commit -m "chore: add agent kit" -m "Instructions, specs, plan and guards for the coding agent."
node scripts/agent/status.mjs --no-check
```

`DP_HUMAN=1` n'est utilisé que par toi : il autorise les fichiers réservés et un commit sans
`Plan:`. Sous WSL, travaille dans le système de fichiers Linux (`~/…`), pas dans `/mnt/c`.

## Lancer une session d'agent

Une session = une ligne du plan, dans un contexte neuf. Message de départ conseillé :

> Applique le skill `start-session`, puis `implement-commit` pour la prochaine ligne du plan.
> Une seule ligne. Arrête-toi et rends compte si une condition d'arrêt d'AGENTS.md se présente.

- **DeepSeek Harness** : il lit `AGENTS.md` et `CLAUDE.md` de la racine jusqu'au dossier de travail
  (les fichiers imbriqués sont donc pris en compte) et les skills de `.agents/skills/`. Pour la
  relecture (`review-commit`), un sous-agent qui démarre sans le contexte de la session est
  exactement ce qu'il faut. Le pont `hooks-claude-code` peut exécuter `.claude/settings.json`,
  mais les hooks Git suffisent : ils s'appliquent quel que soit le harnais.
- **Claude Code** : `CLAUDE.md` importe `AGENTS.md`, `.claude/` ajoute le blocage avant édition
  et l'état du projet au démarrage de chaque session.

## Ce qui reste à toi

| Moment | Action | Comment |
| --- | --- | --- |
| Points de contrôle A, B, C, D | Valider la ligne qui porte `humanGate` | Mettre son statut à `done`, puis `DP_HUMAN=1 DP_HUMAN_GATE=A git commit …` |
| Une ligne du plan est fausse ou manque | Modifier `plan.json` et `commits.md` | `DP_HUMAN=1 DP_PLAN_EDIT=1 git commit …` |
| Un test doit vraiment changer | Autoriser la modification | `DP_ALLOW_TEST_CHANGE=1` sur ce commit |
| Comptes, secrets, déploiements | Cloudflare, TMDB, Brevo, Grafana, GitHub | Toujours à la main ; l'agent s'arrête et te le demande |

Relis chaque commit (quelques minutes) et, à chaque jalon, le dossier de preuves que prépare le
skill `close-milestone` dans `docs/plan/checkpoints/`.
