# CONTEXT.md — langage du domaine

Un terme métier a **une seule** traduction, utilisée partout dans le code (types, tables, routes,
événements, tests). À l'écran, on garde le mot français de la spécification design. Un nouveau
terme entre ici (commit `docs:`) avant d'entrer dans le code.

## Glossaire

| À l'écran (FR) | Dans le code (EN) | Remarque |
| --- | --- | --- |
| Foyer | `Household` | Exactement 2 membres actifs |
| Membre | `Member` | |
| Annuaire | `Directory` | Durable Object global : comptes, passkeys, sessions, invitations |
| Invitation, code d'invitation | `Invitation`, `invitationCode` | Format `7K2-QX9`, 7 jours, usage unique |
| Abonnement (Netflix, Disney+…) | `Subscription` | Plateforme du foyer |
| Plateforme | `Provider` | Identifiant TMDB du service |
| Disponibilité | `Availability` | Données JustWatch via TMDB, sans prix |
| La Réserve | `Reserve`, `ReserveItem` | Envies communes |
| Pour moi | `PersonalList` | Envies solo, réservées aux cartes blanches (RG-06) |
| Note (0 à 3) | `Rating` | 0 = veto |
| Non merci, veto | `Veto` | Seul son auteur le lève (RG-03) |
| Écartés | `vetoed` (filtre) | |
| À noter | `ToRate` | |
| Énergie : séance légère / grande séance | `Energy`: `light` / `dense` | Valeurs du modèle de données produit |
| Goûts adorés / détestés | `TasteSeed` (`love` / `hate`) | Jamais exposés à l'autre |
| Pile d'amorçage | `SeedStack` | 20 à 30 titres |
| Notre série, série du couple | `CoupleSeries` | Une seule par foyer |
| Prochainement, série suivante | `UpNext` | Toujours une désignée (RG-11) |
| Une reprise, doudou | `Comfort`, `ComfortTitle` | Remplace `Rerun` de la spécification technique v1 |
| Programme (de la semaine) | `WeekPlan` | Lundi → dimanche |
| Semaine type | `WeekTemplate` | |
| Créneau | `Slot` | `couple_series`, `carte_blanche`, `film`, `comfort`, `free` |
| Carte blanche | `CarteBlanche` | Une par quinzaine et par membre (RG-22) |
| La programmation, rituel du dimanche | `Ritual` | Machine à états partagée |
| 5-3-1 | `FiveThreeOne` | RG-24 |
| Soirée | `Evening` | |
| Date de soirée | `EveningDate` | Coupure à 5 h, fuseau du foyer |
| Ce soir | `Tonight` | Écran et modèle de lecture |
| Séance | `Showing` | `default` / `swap` / `fallback` |
| Lancer (la séance) | `launch` | |
| Changer d'affiche, joker | `Swap` | Une fois par soir (RG-31, RG-35) |
| Candidat (des trois affiches) | `SwapCandidate` | Exactement 3 |
| Repli | `Fallback` | Doudou proposé (RG-33) |
| Le quart d'heure, point d'étape | `Checkpoint` | 15 min après lancement, titre jamais vu (RG-34) |
| Hier soir | `LastNightConfirmation` | RG-50 |
| Décideur | `Decider` | RG-40 |
| Équité | `Equity` | Jamais affichée (RG-42) |
| Billets | `Stubs` | Historique, avis, notes de semaine |
| Avis (aimé, mitigé, pas aimé) | `Verdict` | RG-51 |
| Note de semaine, soir de résignation | `WeekRating`, `resignation` | RG-52 |
| Première séance | `Onboarding` | |
| Salle / Hall | `ambiance`: `salle` / `hall` | Thème du soir / du jour |
| Échéance | `Deadline` | Portée par l'alarme du Durable Object |

## Carte des contextes

Modules sous `src/server/modules/` ; dépendances de l'aval vers l'amont, sans cycle :

```
evening ──▶ programme ──▶ reserve ──▶ catalog
   │            │            │
   └────────────┴────────────┴──▶ household
stubs, notifications : ne sont jamais appelés, ils réagissent aux événements.
```

| Module | Responsabilité |
| --- | --- |
| `household` | Foyer, membres, invitation, abonnements, réglages, semaine type (+ Annuaire) |
| `catalog` | Couche anticorruption TMDB : titres, plateformes, disponibilités |
| `reserve` | Réserve, notes à l'aveugle, veto, Pour moi, doudous, goûts, moteur de proposition |
| `programme` | Série du couple, suivante, programme, cartes blanches, rituel, 5-3-1 |
| `evening` | Ce soir, séance, Changer d'affiche, repli, point d'étape, Hier soir |
| `stubs` | Billets, avis, notes de semaine, décideurs, équité |
| `notifications` | WebSocket, Web Push, préférences, plafonds |
