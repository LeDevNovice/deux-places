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
