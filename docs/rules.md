# Règles métier RG-01 à RG-52

Copie mot pour mot de `docs/specs/produit.md`, section 2 (2.2 à 2.7). Fichier **en lecture seule** pour l'agent :
une règle ne se modifie que dans la spécification produit, par un humain.

Chaque règle citée par une ligne `done` du plan doit avoir au moins un test dont le titre
contient son identifiant (`RG-03 — …`). Vérifié par `node scripts/agent/rules-check.mjs`.


## 2.2 Réserve et notes

- **RG-01** Un titre entre dans la Réserve quand un membre l'ajoute ; son auteur doit le noter et lui donner une énergie à l'ajout.
- **RG-02** Un titre est **éligible** seulement si les deux membres l'ont noté et qu'aucune note n'est 0.
- **RG-03** Un 0 (veto) exclut le titre de toutes les propositions ; il reste visible dans un filtre « Écartés » et peut être renoté plus tard par celui ou celle qui a posé le veto, jamais par l'autre.
- **RG-04** Les notes d'un membre ne sont visibles par l'autre qu'une fois les deux notes posées, pour éviter l'influence et la négociation (notation « à l'aveugle »).
- **RG-05** Un titre déjà vu par les deux ne peut pas être proposé comme nouveauté ; il peut être marqué doudou si les deux le souhaitent.
- **RG-06** La Réserve ne contient que des envies communes ; les envies solo de chacun vivent dans une liste « Pour moi », réservée aux cartes blanches.

## 2.3 Série du couple

- **RG-10** Pour devenir série du couple, une série doit être éligible, avec une note d'au moins 2 de chaque membre, disponible sur un abonnement du foyer, et d'énergie « léger » si elle doit occuper les soirs de semaine.
- **RG-11** Il y a toujours une **série suivante** désignée ; l'application alerte au rituel s'il n'y en a pas.
- **RG-12** Après le 3e épisode vu, chaque membre est invité à noter la série (1 à 3). Si l'une des deux notes est 1, la série passe à « abandonnée » et la suivante devient la série du couple.
- **RG-13** À la fin du dernier épisode disponible, la série passe à « terminée » ; la suivante prend le relais dès la séance suivante.
- **RG-14** Limite d'épisodes par soir, réglable (2 par défaut en semaine) ; l'écran l'indique, sans bloquer.

## 2.4 Programme et créneaux

- **RG-20** Le programme est hebdomadaire (lundi à dimanche) ; il est généré à partir d'une **semaine type** réglable, puis ajusté au rituel.
- **RG-21** Semaine type par défaut : série du couple lundi, mardi, jeudi et samedi ; carte blanche mercredi ; film vendredi ; doudou dimanche.
- **RG-22** Chaque membre dispose d'**une carte blanche par quinzaine** par défaut, en alternance ; elle peut être déplacée sur un autre soir de la semaine (par exemple un soir de match).
- **RG-23** En carte blanche, le décideur choisit librement, y compris dans sa liste « Pour moi » ; l'autre peut rester (activité parallèle) ou faire autre chose. L'application n'enregistre pas ce choix comme un échec.
- **RG-24** Le film du créneau « film » est choisi au rituel par la méthode 5-3-1 : le proposeur (alterné chaque semaine) retient 5 films éligibles, l'autre en garde 3, le proposeur choisit le final.
- **RG-25** Un soir sans programme (rituel sauté) prend par défaut le créneau série du couple.

## 2.5 Soirée, joker et repli

- **RG-30** L'écran du soir affiche le titre prévu par le programme ; « Lancer » crée une séance de type **défaut**.
- **RG-31** N'importe quel membre peut activer le **joker** une fois par soir. Le joker propose exactement 3 titres éligibles, filtrés par l'énergie choisie et la disponibilité.
- **RG-32** Chaque membre accepte ou refuse chaque titre ; le **premier titre accepté par les deux** est retenu (séance de type **joker**).
- **RG-33** Le joker dure au plus 3 minutes ; au terme du délai ou si aucun titre n'est accepté, l'application propose un doudou (séance de type **repli**).
- **RG-34** Sur un titre jamais vu, l'application propose un **point d'étape** 15 minutes après le lancement : continuer, ou basculer vers un doudou.
- **RG-35** Il n'y a pas de deuxième joker le même soir : après un repli, la soirée est réglée.

## 2.6 Équité

- **RG-40** Chaque séance a un décideur : en carte blanche, son titulaire ; en film, le membre qui a fait le choix final ; sur un joker, l'auteur du titre retenu ; sur la série du couple et les doudous, aucun (choix commun).
- **RG-41** L'équité se calcule sur 28 jours glissants comme l'écart entre le nombre de séances décidées par chacun.
- **RG-42** L'équité n'est jamais affichée sous forme de score ou de dette ; elle sert uniquement à pondérer discrètement les propositions (section 5) et à alterner les rôles.

## 2.7 Suivi et retours

- **RG-50** Le lendemain d'une séance de série, à la première ouverture, l'application demande une confirmation du nombre d'épisodes vus (pré-rempli avec la limite du soir).
- **RG-51** Après un film ou une fin de série, chacun peut donner un avis en un geste (aimé, mitigé, pas aimé) ; ces avis alimentent l'historique et le moteur.
- **RG-52** Au rituel, chacun donne une note de 1 à 5 sur la semaine, et peut signaler un soir de résignation.
