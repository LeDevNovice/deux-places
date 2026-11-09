# « Ce soir » — spécification de l'outil

Nov 8, 2026 · @LeDevNovice

## 0. Vision, objectifs et critères de succès

« Ce soir » est une application de couple qui fait en sorte que, la plupart des soirs, **il n'y ait rien à décider** : le programme a été choisi à deux à l'avance, le titre du soir s'affiche seul, et le choix ne se rouvre que par un joker borné à 3 minutes. Cette spécification découle directement des deux documents précédents : [l'état des lieux](https://claude.ai/artifact/59rRBgPF4miehb7q14yUct) et [la solution](https://claude.ai/artifact/8HUzwYLFpHDawTf6EzmGDh).

### 0.1 Énoncé du problème

Un couple veut regarder quelque chose ensemble chaque soir, au lit, pour se reposer. Leurs goûts divergent (romance et comédie romantique d'un côté ; drame, thriller, SF et fantasy de l'autre). Chaque soir, la recherche dure jusqu'à environ 20 minutes et se termine par une rediffusion ou par l'un des deux qui décroche par résignation.

### 0.2 Objectifs

1. **Supprimer la décision du soir** pour la majorité des soirées, grâce à un défaut choisi en amont.
2. **Borner la décision restante** : un joker de 3 propositions et 3 minutes, avec un repli prévu.
3. **Garantir l'équité dans la durée** : chacun a ses soirs, personne ne cède toujours.
4. **Créer de la nouveauté partagée** : une série commune qui avance et des contenus-ponts découverts ensemble.
5. **Respecter le repos et le sommeil** : formats légers en semaine, nombre d'épisodes borné, écran sobre la nuit.

### 0.3 Non-objectifs

- Remplacer les applications de streaming ou lire des vidéos.
- Être un réseau social, un catalogue exhaustif ou un traqueur de visionnage complet.
- Choisir à la place du couple par une IA ou au hasard.
- Gérer plus de deux personnes (la v1 est strictement un foyer de deux).

### 0.4 Critères de succès

Les cibles sont des points de départ à ajuster après le test ; elles se mesurent dans l'application elle-même (section 12).

| Indicateur | Définition | Cible |
| --- | --- | --- |
| Temps jusqu'au lancement | Médiane entre l'ouverture de l'écran « Ce soir » et « Lancer » | Moins de 1 min sur défaut, moins de 3 min avec joker |
| Soirs sur défaut | Part des soirs lancés sans joker | Majorité des soirs |
| Résignation | Soirs où l'un déclare avoir décroché sans l'avoir voulu | 0 par semaine |
| Satisfaction | Note hebdomadaire de chacun sur 5, au rituel du dimanche | 4 ou plus pour les deux |
| Équité | Écart de soirs « choisis » entre les deux sur 4 semaines glissantes | 1 ou moins |
| Engagement des deux | Chacun ajoute ou note au moins un titre par semaine | Oui pour les deux |
| Réserve vivante | Titres éligibles pour la prochaine série et le prochain film | Toujours au moins 3 de chaque |

## 1. Utilisateurs, contextes d'usage et scénarios clés

L'application a exactement deux utilisateurs aux droits identiques, et trois contextes d'usage très différents : la journée (capturer), le dimanche (décider à deux) et le soir au lit (lancer).

### 1.1 Les deux membres du foyer

|  | Grégory | Sa femme |
| --- | --- | --- |
| Goûts déclarés | Drame, thriller, fantasy, science-fiction | Romance, comédie romantique |
| Repères communs | Friends, Modern Family, The Big Bang Theory, Le Labyrinthe | Idem |
| Appareil | Smartphone Android | À confirmer (question ouverte) |
| Le soir | Repos ; part parfois jouer à la Switch, lire un manga ou voir un match au salon | Repos après des journées chargées ; a peu d'autres activités le soir si le visionnage commun échoue |
| Rapport à l'outil | Le conçoit et le développe | Utilisatrice à part entière, à co-impliquer dès le départ |

Point de conception majeur : le risque n°1 est que l'outil soit perçu comme celui de Grégory. Chaque parcours doit donc être **aussi simple pour celle qui ne l'a pas conçu**, et aucune fonction ne doit donner plus de pouvoir à l'un qu'à l'autre.

### 1.2 Les trois contextes

| Contexte | Moment | État des utilisateurs | Exigence d'interface |
| --- | --- | --- | --- |
| Capture | N'importe quand dans la journée | Pressés, distraits | Ajouter un titre en moins de 10 secondes, depuis une autre appli via le partage Android |
| Rituel | Dimanche, environ 5 minutes | Disponibles, côte à côte | Parcours guidé, synchronisé sur deux téléphones |
| Soirée | Au lit, lumière tamisée | Fatigués, peu de patience | Une seule réponse, écran sombre et peu lumineux, 1 à 2 gestes |

### 1.3 Scénarios clés (récits utilisateurs)

1. *Soir de semaine ordinaire* — « En me couchant, j'ouvre l'appli : elle affiche l'épisode 7 de notre série. Je touche Lancer, on regarde. »
2. *Envie de changer* — « Ce soir, pas envie de la série. Je touche Joker : 3 titres légers dispo sur nos abonnements. Elle accepte le deuxième, moi aussi : c'est parti en 1 minute. »
3. *Pas d'accord* — « Aucun des 3 ne nous va : l'appli propose un doudou, on met Friends sans discuter. »
4. *Capture* — « Un collègue me parle d'une série. Je la partage depuis AlloCiné vers Ce soir, je la note 3, j'indique « léger ». Ma femme reçoit la carte à noter. »
5. *Veto* — « Elle met 0 à un thriller gore que j'ai ajouté : il disparaît des propositions sans débat. »
6. *Rituel du dimanche* — « Notre série se termine dans 2 épisodes : l'appli propose les 3 meilleures séries suivantes de la Réserve. On choisit, puis on fait le 5-3-1 du film de vendredi. »
7. *Carte blanche* — « Mercredi, c'est son soir : elle met sa comédie romantique. Je reste à côté avec ma Switch, prévu et sans culpabilité. La semaine prochaine, c'est le mien. »
8. *Match de foot* — « Il y a un match mardi : je déplace ma carte blanche sur mardi, la série du couple reprend mercredi. »
9. *Série qui déçoit* — « Après 3 épisodes, elle donne 1 sur 3 : la série sort, la suivante prend sa place. »
10. *Lendemain* — « Le matin, l'appli me demande : hier, 2 épisodes vus ? Un geste et c'est à jour. »

## 2. Règles métier

Ces règles sont le cœur du produit ; l'interface et le code ne font que les appliquer. Chacune porte un identifiant pour être référencée dans les critères d'acceptation (section 12).

### 2.1 Vocabulaire

| Terme | Définition |
| --- | --- |
| Foyer | Le couple : exactement 2 membres, des abonnements communs, des réglages communs |
| Titre | Un film ou une série identifié par son identifiant TMDB |
| Réserve | L'ensemble des titres proposés pour être regardés **ensemble** |
| Note | Avis d'un membre sur un titre de la Réserve : 0 (veto), 1 (pourquoi pas), 2 (envie), 3 (très envie) |
| Énergie | Étiquette d'un titre : **léger** (soir de semaine, peu exigeant) ou **prenant** (plus dense, réservé aux soirs prévus) |
| Doudou | Titre déjà vu et aimé des deux, regardable sans effort (Friends, Modern Family…) |
| Série du couple | La série commune en cours ; il y en a au plus une à la fois |
| Créneau | Type de soirée : série du couple, carte blanche, film, doudou, libre |
| Programme | Affectation d'un créneau (et éventuellement d'un titre) à chaque soir de la semaine |
| Séance | Un soir réel : ce qui a été lancé, par quel chemin (défaut, joker, repli) et ce qui a été vu |
| Décideur | Le membre à qui l'on attribue le choix d'une séance (pour l'équité) |

### 2.2 Réserve et notes

- **RG-01** Un titre entre dans la Réserve quand un membre l'ajoute ; son auteur doit le noter et lui donner une énergie à l'ajout.
- **RG-02** Un titre est **éligible** seulement si les deux membres l'ont noté et qu'aucune note n'est 0.
- **RG-03** Un 0 (veto) exclut le titre de toutes les propositions ; il reste visible dans un filtre « Écartés » et peut être renoté plus tard par celui ou celle qui a posé le veto, jamais par l'autre.
- **RG-04** Les notes d'un membre ne sont visibles par l'autre qu'une fois les deux notes posées, pour éviter l'influence et la négociation (notation « à l'aveugle »).
- **RG-05** Un titre déjà vu par les deux ne peut pas être proposé comme nouveauté ; il peut être marqué doudou si les deux le souhaitent.
- **RG-06** La Réserve ne contient que des envies communes ; les envies solo de chacun vivent dans une liste « Pour moi », réservée aux cartes blanches.

### 2.3 Série du couple

- **RG-10** Pour devenir série du couple, une série doit être éligible, avec une note d'au moins 2 de chaque membre, disponible sur un abonnement du foyer, et d'énergie « léger » si elle doit occuper les soirs de semaine.
- **RG-11** Il y a toujours une **série suivante** désignée ; l'application alerte au rituel s'il n'y en a pas.
- **RG-12** Après le 3e épisode vu, chaque membre est invité à noter la série (1 à 3). Si l'une des deux notes est 1, la série passe à « abandonnée » et la suivante devient la série du couple.
- **RG-13** À la fin du dernier épisode disponible, la série passe à « terminée » ; la suivante prend le relais dès la séance suivante.
- **RG-14** Limite d'épisodes par soir, réglable (2 par défaut en semaine) ; l'écran l'indique, sans bloquer.

### 2.4 Programme et créneaux

- **RG-20** Le programme est hebdomadaire (lundi à dimanche) ; il est généré à partir d'une **semaine type** réglable, puis ajusté au rituel.
- **RG-21** Semaine type par défaut : série du couple lundi, mardi, jeudi et samedi ; carte blanche mercredi ; film vendredi ; doudou dimanche.
- **RG-22** Chaque membre dispose d'**une carte blanche par quinzaine** par défaut, en alternance ; elle peut être déplacée sur un autre soir de la semaine (par exemple un soir de match).
- **RG-23** En carte blanche, le décideur choisit librement, y compris dans sa liste « Pour moi » ; l'autre peut rester (activité parallèle) ou faire autre chose. L'application n'enregistre pas ce choix comme un échec.
- **RG-24** Le film du créneau « film » est choisi au rituel par la méthode 5-3-1 : le proposeur (alterné chaque semaine) retient 5 films éligibles, l'autre en garde 3, le proposeur choisit le final.
- **RG-25** Un soir sans programme (rituel sauté) prend par défaut le créneau série du couple.

### 2.5 Soirée, joker et repli

- **RG-30** L'écran du soir affiche le titre prévu par le programme ; « Lancer » crée une séance de type **défaut**.
- **RG-31** N'importe quel membre peut activer le **joker** une fois par soir. Le joker propose exactement 3 titres éligibles, filtrés par l'énergie choisie et la disponibilité.
- **RG-32** Chaque membre accepte ou refuse chaque titre ; le **premier titre accepté par les deux** est retenu (séance de type **joker**).
- **RG-33** Le joker dure au plus 3 minutes ; au terme du délai ou si aucun titre n'est accepté, l'application propose un doudou (séance de type **repli**).
- **RG-34** Sur un titre jamais vu, l'application propose un **point d'étape** 15 minutes après le lancement : continuer, ou basculer vers un doudou.
- **RG-35** Il n'y a pas de deuxième joker le même soir : après un repli, la soirée est réglée.

### 2.6 Équité

- **RG-40** Chaque séance a un décideur : en carte blanche, son titulaire ; en film, le membre qui a fait le choix final ; sur un joker, l'auteur du titre retenu ; sur la série du couple et les doudous, aucun (choix commun).
- **RG-41** L'équité se calcule sur 28 jours glissants comme l'écart entre le nombre de séances décidées par chacun.
- **RG-42** L'équité n'est jamais affichée sous forme de score ou de dette ; elle sert uniquement à pondérer discrètement les propositions (section 5) et à alterner les rôles.

### 2.7 Suivi et retours

- **RG-50** Le lendemain d'une séance de série, à la première ouverture, l'application demande une confirmation du nombre d'épisodes vus (pré-rempli avec la limite du soir).
- **RG-51** Après un film ou une fin de série, chacun peut donner un avis en un geste (aimé, mitigé, pas aimé) ; ces avis alimentent l'historique et le moteur.
- **RG-52** Au rituel, chacun donne une note de 1 à 5 sur la semaine, et peut signaler un soir de résignation.

## 3. Parcours utilisateurs

Sept parcours couvrent tout le produit ; seul le parcours du soir doit être utilisable à moitié endormi, tous les autres se font en journée ou le dimanche.

### 3.1 Installation et amorçage (une fois, environ 15 minutes, à deux)

1. Grégory crée le foyer et reçoit un **lien d'invitation** ; sa femme l'ouvre, installe l'application sur son écran d'accueil et se connecte.
2. Ensemble : cocher les **abonnements** du foyer (Netflix, Disney+, Prime Video…) et la région (France).
3. Ensemble : sélectionner les **doudous** parmi des suggestions pré-remplies (Friends, Modern Family, The Big Bang Theory, Le Labyrinthe) et en ajouter d'autres.
4. Chacun de son côté : **5 titres adorés et 5 titres détestés**, recherchés dans le catalogue. Ils servent au moteur (section 5.5), jamais affichés à l'autre comme des jugements.
5. Chacun de son côté : noter une **pile d'amorçage** de 20 à 30 titres proposés par le moteur (contenus-ponts disponibles sur vos abonnements). Les notes sont à l'aveugle (RG-04).
6. Ensemble : choisir la **première série du couple** et la **suivante** parmi les titres éligibles ; valider la semaine type.
7. Optionnel : activer les notifications (rituel du dimanche, titres à noter).

Condition de sortie : au moins une série du couple, une suivante, 3 films éligibles et 3 doudous.

### 3.2 Ajouter un titre (en journée, moins de 10 secondes)

- **Depuis une autre application** (AlloCiné, Netflix, navigateur, message d'un ami) : Partager → « Ce soir ». L'application lit le texte et le lien partagés, recherche le titre et propose les 3 correspondances les plus probables ; un geste confirme.
- **Depuis l'application** : bouton + → recherche avec suggestions dès 2 caractères.
- Écran de confirmation unique : note de l'auteur (0 à 3), énergie (léger / prenant), et « Réserve commune » ou « Pour moi ». Le titre apparaît chez l'autre dans « À noter ».

### 3.3 Noter (en journée, quelques secondes par titre)

- Une pastille signale les titres à noter ; l'écran « À noter » les présente un par un, en cartes : affiche, résumé court, plateformes, durée, puis 4 boutons 0 / 1 / 2 / 3.
- Pas de swipe obligatoire : les boutons restent la référence, le geste n'est qu'un raccourci.
- Une fois les deux notes posées, le titre devient éligible ou écarté, et les deux notes deviennent visibles.

### 3.4 Rituel du dimanche (5 minutes, à deux)

1. **Retour sur la semaine** : chacun note la semaine de 1 à 5 et peut signaler un soir de résignation (RG-52).
2. **Série** : état de la série du couple (épisodes restants) ; confirmer ou changer la suivante parmi les 3 meilleures séries éligibles.
3. **Film du vendredi** : 5-3-1 (RG-24) ; le proposeur voit les 8 meilleurs films éligibles « prenants » et en coche 5 ; l'autre en garde 3 sur son téléphone ; le proposeur choisit.
4. **Semaine** : la grille est pré-remplie depuis la semaine type ; on déplace la carte blanche si besoin (match, sortie, invités).

Les deux téléphones sont synchronisés en temps réel ; chaque étape attend la validation des deux. Si le rituel est sauté, la semaine type s'applique (RG-25) et l'application le propose à nouveau le lendemain, une seule fois.

### 3.5 Le soir (moins de 1 minute sur défaut)

1. Ouverture : l'écran « Ce soir » affiche le créneau et le titre prévu (affiche, épisode, plateforme) et un bouton principal **Lancer**.
2. Lancer : séance enregistrée, ouverture du lien de la plateforme sur le téléphone ; sur la télé, on lance le titre comme d'habitude (section 8.4).
3. Sur un titre jamais vu, une notification discrète 15 minutes plus tard : « On continue ? » (RG-34).

### 3.6 Joker (moins de 3 minutes)

1. Bouton secondaire **Joker** sur l'écran du soir ; choix de l'énergie (léger par défaut).
2. Les 3 propositions apparaissent sur les deux téléphones ; chacun touche « OK » ou « Non » sur chacune ; un compte à rebours discret de 3 minutes.
3. Dès qu'un titre a deux « OK », il est retenu ; sinon, à la fin, carte « Repli : un doudou » avec le doudou le moins revu récemment.
4. Si un seul téléphone est sous la main, l'écran affiche les deux colonnes de réponses et l'on vote à tour de rôle sur le même appareil.

### 3.7 Lendemain et fin de série

- Première ouverture du lendemain : « Hier soir : 2 épisodes de \[série\] ? » avec + / − et Valider (RG-50).
- Au 3e épisode : demande de note de la série à chacun (RG-12).
- À la fin du dernier épisode : avis en un geste, bascule vers la série suivante, et rappel au prochain rituel de désigner une nouvelle suivante.

## 4. Écrans, états et interactions

L'application compte 12 écrans organisés autour d'une barre de navigation à 4 onglets : **Ce soir**, **Réserve**, **Semaine**, **Nous** ; l'écran « Ce soir » est toujours celui qui s'ouvre au lancement.

### 4.1 Carte des écrans

| # | Écran | Accès | Rôle |
| --- | --- | --- | --- |
| E1 | Ce soir | Onglet 1, écran d'ouverture | Afficher le programme du soir et lancer |
| E2 | Joker | Depuis E1 | 3 propositions votées à deux, 3 minutes |
| E3 | Confirmation du lendemain | Carte en haut de E1 | Valider les épisodes vus la veille |
| E4 | Réserve | Onglet 2 | Parcourir les titres éligibles, écartés, en attente |
| E5 | À noter | Pastille sur l'onglet 2 | Noter les titres ajoutés par l'autre |
| E6 | Fiche titre | Depuis toute liste | Détails, plateformes, notes, actions |
| E7 | Ajout | Bouton + et partage Android | Rechercher, confirmer, noter |
| E8 | Semaine | Onglet 3 | Grille de la semaine, déplacements |
| E9 | Rituel du dimanche | Bandeau sur E1 et E8 le dimanche | Parcours guidé en 4 étapes, à deux |
| E10 | Nous | Onglet 4 | Historique, doudous, série en cours, retours |
| E11 | Réglages | Depuis E10 | Abonnements, semaine type, limites, notifications, foyer |
| E12 | Installation | Premier lancement | Amorçage décrit en 3.1 |

### 4.2 E1 — Ce soir

- **Contenu** : en-tête discret (jour, créneau : « Série du couple », « Carte blanche de Grégory »…) ; grande affiche ; titre ; pour une série, « Saison 2 · épisode 7 » et « 2 épisodes ce soir » ; logo de la plateforme ; bouton principal **Lancer** occupant la zone du pouce ; bouton secondaire **Joker** ; lien discret « Plutôt un doudou ».
- **États** : programme défini (nominal) ; carte blanche de l'autre (« Ce soir, c'est le choix de \[prénom\] » et, si elle l'a déjà indiqué, son titre) ; aucun programme (repli sur série du couple, RG-25) ; série du couple terminée sans suivante (proposer 3 séries éligibles, sinon doudou) ; titre indisponible depuis le programme (badge et proposition d'un remplaçant) ; hors-ligne (programme en cache, lancement possible, séance synchronisée plus tard).
- **Règles d'interface** : aucun défilement nécessaire ; pas de liste ; pas de recommandation additionnelle ; luminosité réduite (section 10).

### 4.3 E2 — Joker

- **Étape 1** : choix de l'énergie (Léger présélectionné / Prenant) et du format (Peu importe / Film / Épisode).
- **Étape 2** : 3 cartes empilées verticalement (affiche, titre, durée, plateforme, une ligne de résumé) ; sous chaque carte, les réponses des deux membres (« OK », « Non », en attente) mises à jour en temps réel ; compte à rebours de 3 minutes sous forme d'une fine barre.
- **Résolution** : premier titre avec deux « OK » → écran de confirmation 2 secondes puis retour à E1 avec ce titre et **Lancer** ; échec → carte repli doudou.
- **Mode un seul téléphone** : bascule « On vote sur ce téléphone » qui affiche les deux colonnes.

### 4.4 E3 — Confirmation du lendemain

Carte non bloquante en haut de E1, le lendemain d'une séance de série : « Hier : 2 épisodes de The Good Place ? » avec − / + et **Valider**. Disparaît après validation ou au soir suivant (valeur par défaut retenue).

### 4.5 E4 — Réserve

- **Segments** : Éligibles (par défaut), À noter (par l'un ou l'autre), Écartés, Pour moi.
- **Filtres** : film / série, léger / prenant, plateforme, durée.
- **Tri** : par score commun (section 5) par défaut, ou par date d'ajout.
- **Ligne de titre** : vignette, titre, année, format, énergie, plateformes du foyer, et deux pastilles de notes (masquées tant que l'autre n'a pas noté).
- **Vide** : message d'aide et bouton « Proposer des contenus-ponts » (section 5.5).

### 4.6 E5 — À noter

Cartes une par une : affiche, titre, année, durée ou nombre de saisons, plateformes, résumé de 2 lignes, ajouté par ; boutons 0 « Non merci », 1 « Pourquoi pas », 2 « Envie », 3 « Très envie » ; lien « Voir la bande-annonce » quand elle existe. Compteur « 3 restants ».

### 4.7 E6 — Fiche titre

Détails (synopsis, genres, durée, saisons et épisodes), disponibilité par plateforme du foyer avec mention JustWatch, notes des deux, énergie (modifiable par l'auteur), historique du titre ; actions : changer sa note, désigner comme série suivante, programmer (film), marquer comme vu, marquer doudou, retirer.

### 4.8 E7 — Ajout

Champ de recherche avec résultats dès 2 caractères (titre, année, format, affiche) ; via le partage Android, le champ est pré-rempli et les 3 meilleures correspondances sont proposées ; puis écran unique : note, énergie, destination (Réserve commune / Pour moi), **Ajouter**.

### 4.9 E8 — Semaine

Grille de 7 lignes (lundi à dimanche) : créneau, titre éventuel, décideur. Appui long pour déplacer un créneau ; échanger deux soirs ; marquer un soir « libre » (pas de visionnage). Indicateur discret « carte blanche : Grégory cette semaine ».

### 4.10 E9 — Rituel du dimanche

Assistant en 4 étapes (section 3.4) avec barre de progression ; chaque étape affiche l'état de l'autre (« \[prénom\] a validé ») ; bouton « Passer cette étape » ; résumé final de la semaine.

### 4.11 E10 — Nous

Série en cours et suivante ; historique des séances (date, titre, chemin défaut / joker / repli, avis) ; liste des doudous ; courbe simple des notes hebdomadaires ; aucune statistique d'équité nominative.

### 4.12 E11 — Réglages

Abonnements et région ; semaine type ; limite d'épisodes en semaine et le week-end ; durée du joker (3 min par défaut) ; délai du point d'étape (15 min) ; notifications (rituel, à noter, point d'étape) ; heure de début de « mode nuit » ; foyer (membres, invitation, export et suppression des données).

### 4.13 E12 — Installation

Les 7 étapes de 3.1, chacune sur un écran, avec possibilité de reprendre plus tard ; indicateur de ce qui reste à faire chez l'autre.

## 5. Moteur de proposition

Le moteur ne choisit jamais à la place du couple : il **filtre et ordonne** ce que les deux ont déjà accepté, et ne sert qu'à 4 moments (joker, repli, série suivante, film du dimanche) plus l'amorçage de la Réserve. Il est déterministe et explicable : chaque proposition peut afficher « pourquoi ce titre ».

### 5.1 Filtres d'éligibilité (dans l'ordre)

1. Titre de la Réserve commune, noté par les deux, sans 0 (RG-02).
2. Pas encore vu par le foyer (sauf demande de doudou).
3. Disponible en abonnement (offre « flatrate ») sur au moins un service du foyer, en France, d'après la dernière synchronisation (section 8.1).
4. Énergie et format compatibles avec le contexte (joker léger, film du vendredi prenant…).
5. Non refusé lors d'un joker par les deux au cours des 14 derniers jours.

### 5.2 Score

Pour chaque titre éligible, avec n\_A et n\_B les notes des deux membres (1 à 3) :

```latex
S = \frac{n_A + n_B}{2} + \alpha \, \min(n_A, n_B) + \beta \, E + \gamma \, N - \delta \, R
```

| Terme | Signification | Valeur par défaut |
| --- | --- | --- |
| Moyenne | Envie commune | — |
| α · min | Prime au titre qui plaît aux deux plutôt qu'à un seul (« moyenne sans misère ») | α = 0,5 |
| β · E | E = 1 si le titre a été ajouté par le membre qui a le moins décidé sur 28 jours (RG-41), sinon 0 | β = 0,3 |
| γ · N | N = 1 si ajouté depuis moins de 14 jours (garde la Réserve vivante) | γ = 0,1 |
| δ · R | R = nombre de refus en joker sur 30 jours | δ = 0,4 |

Les poids sont des réglages internes, ajustables pendant le test ; l'interface ne les montre pas.

### 5.3 Les quatre usages

| Usage | Candidats | Sélection |
| --- | --- | --- |
| Joker | Éligibles filtrés par l'énergie et le format choisis | 3 titres : le meilleur score ; le meilleur d'un autre genre principal ; le meilleur parmi ceux ajoutés par le membre le moins « servi » (équité) ; à score égal seulement, tirage au sort |
| Repli | Doudous | Le doudou d'énergie « léger » le moins revu récemment ; pour une série, l'épisode suivant celui du dernier visionnage |
| Série suivante | Séries éligibles avec min(n\_A, n\_B) ≥ 2, énergie « léger » | Les 3 meilleurs scores ; départage par durée d'épisode plus courte |
| Film du vendredi | Films éligibles d'énergie « prenant » | Les 8 meilleurs scores, présentés au proposeur du 5-3-1 |

### 5.4 Explication affichée

Chaque proposition peut afficher une ligne, par exemple : « Vous l'avez noté tous les deux 3 », « Ajouté par \[prénom\], qui a moins choisi ces dernières semaines », « Disponible sur Netflix », « 22 min par épisode ». Jamais de score chiffré.

### 5.5 Démarrage à froid et réapprovisionnement

Objectif : remplir la Réserve de **contenus-ponts** sans que personne ait à chercher.

1. **Graines** : les doudous (goûts communs), puis les 5 titres adorés de chacun.
2. **Expansion** : pour chaque graine, récupération des titres « recommandés » et « similaires » de TMDB, puis filtrage par disponibilité sur les abonnements du foyer.
3. **Priorité aux ponts** : un candidat issu à la fois d'une graine de chacun, ou d'un doudou, est classé en tête ; ensuite, ceux qui combinent un genre aimé par chacun (par exemple romance + science-fiction, comédie + mystère). Les genres détestés déclarés par l'un écartent un candidat.
4. **Pile d'amorçage** : 20 à 30 candidats envoyés à noter aux deux, marqués « suggéré ».
5. **Réapprovisionnement** : quand la Réserve passe sous 3 séries ou 3 films éligibles, une nouvelle pile de 10 suggestions est générée de la même façon, à partir des titres les mieux notés par les deux.
6. **IA (v3, optionnelle)** : un modèle de langage reçoit les deux profils (adorés, détestés, doudous, notes passées) et propose 10 contenus-ponts ; chaque proposition est validée contre TMDB (existence, disponibilité) avant d'entrer dans « À noter ». L'IA alimente la Réserve, elle ne la contourne jamais.

### 5.6 Ce que le moteur ne fait pas

- Aucune proposition hors de la Réserve le soir.
- Aucun apprentissage opaque en v1 : le comportement s'explique entièrement par les notes, les règles et les poids ci-dessus.
- Aucune lecture des comptes de streaming.

## 6. Modèle de données

Un schéma PostgreSQL de 17 tables suffit ; tout est rattaché à un foyer, et les données de catalogue (titres, disponibilités) sont un cache de TMDB rafraîchi régulièrement.

| Table | Champs principaux | Contraintes et remarques |
| --- | --- | --- |
| household | id, name, region (« FR »), timezone (« Europe/Paris »), created\_at | Exactement 2 membres actifs |
| member | id, household\_id, display\_name, email, role (owner / partner), created\_at | Unique (household\_id, email) ; droits identiques en pratique |
| invitation | id, household\_id, token\_hash, expires\_at, used\_at | Usage unique, expiration 7 jours |
| subscription | household\_id, provider\_id (identifiant TMDB du service), provider\_name | Clé (household\_id, provider\_id) |
| household\_settings | household\_id, week\_template (JSON des 7 créneaux), episode\_limit\_weekday, episode\_limit\_weekend, joker\_seconds (180), checkpoint\_minutes (15), night\_mode\_from | Une ligne par foyer |
| title | tmdb\_id, media\_type (movie / tv), title\_fr, original\_title, year, runtime\_min, episode\_runtime\_min, seasons, episodes\_total, genres (int\[\]), poster\_path, overview\_fr, updated\_at | Clé (tmdb\_id, media\_type) ; cache TMDB |
| availability | tmdb\_id, media\_type, region, provider\_id, offer\_type (flatrate / rent / buy / free / ads), link, synced\_at | Données JustWatch via TMDB ; rafraîchies quotidiennement pour les titres suivis |
| reserve\_item | id, household\_id, tmdb\_id, media\_type, list (shared / personal), owner\_member\_id (pour personal), added\_by, energy (light / dense), status (pending / eligible / vetoed / couple\_series / next\_series / watching / finished / abandoned / watched / comfort), origin (manual / share / seed / ai), added\_at | Unique (household\_id, tmdb\_id, media\_type, list, owner\_member\_id) |
| rating | reserve\_item\_id, member\_id, value (0 à 3), updated\_at | Unique (reserve\_item\_id, member\_id) ; visibilité croisée gérée par l'API (RG-04) |
| series\_progress | reserve\_item\_id, season, episode, updated\_at | Une ligne par série suivie |
| week\_plan | id, household\_id, week\_start (lundi), created\_at, ritual\_completed\_at | Unique (household\_id, week\_start) |
| plan\_slot | week\_plan\_id, day (1 à 7), slot\_type (couple\_series / carte\_blanche / film / comfort / free), decider\_member\_id, reserve\_item\_id | Unique (week\_plan\_id, day) |
| session | id, household\_id, date, slot\_type, path (default / joker / fallback), reserve\_item\_id, decider\_member\_id, launched\_at, episodes\_watched, checkpoint\_result (continue / switched / none), joker\_id | Une séance principale par soir |
| joker | id, household\_id, date, energy, format, candidates (3 reserve\_item\_id), votes (JSON par membre et candidat), outcome (accepted / timeout / rejected), started\_at, ended\_at | Base du calcul de refus (δ · R) |
| feedback | id, member\_id, kind (title / week / series\_checkpoint), target\_id, value, resignation (bool), created\_at | Avis titre, note de semaine, note au 3e épisode |
| push\_subscription | id, member\_id, endpoint, keys, created\_at, last\_success\_at | Web Push |
| taste\_seed | member\_id, tmdb\_id, media\_type, polarity (love / hate) | 5 + 5 par membre ; jamais exposé à l'autre |

Remarques :

- Les identifiants de genres et de plateformes viennent des listes de référence TMDB (« /genre/movie/list », « /genre/tv/list », « /watch/providers/movie » avec la région FR) ; ils ne sont pas codés en dur.
- L'équité (RG-41) se calcule à la volée depuis `session.decider_member_id` sur 28 jours ; pas de table dédiée.
- La suppression d'un membre ou du foyer supprime en cascade toutes ses données (section 11).

## 7. API de l'application

Une API REST JSON versionnée (`/api/v1`), authentifiée par session, plus un flux d'événements serveur (SSE) par foyer pour le temps réel du joker et du rituel.

| Méthode | Route | Rôle |
| --- | --- | --- |
| POST | /auth/magic-link | Envoyer un lien de connexion par e-mail |
| POST | /auth/passkey/register, /auth/passkey/login | Connexion par passkey (option) |
| POST | /households | Créer le foyer |
| POST | /households/invitations | Créer un lien d'invitation |
| POST | /households/join | Rejoindre avec un jeton |
| GET / PUT | /households/settings | Lire / modifier réglages et semaine type |
| GET / PUT | /households/subscriptions | Lire / modifier les abonnements |
| GET | /catalog/search?q= | Recherche de titres (proxy TMDB, langue fr-FR) |
| GET | /catalog/titles/{type}/{tmdbId} | Détails + disponibilité FR |
| POST | /share/resolve | Transformer un partage Android (titre, texte, lien) en 3 correspondances |
| GET | /reserve?segment=&filters= | Lister la Réserve |
| POST | /reserve | Ajouter un titre (note de l'auteur, énergie, liste) |
| PATCH / DELETE | /reserve/{id} | Modifier énergie, statut ; retirer |
| PUT | /reserve/{id}/rating | Poser ou changer sa note |
| GET | /reserve/to-rate | Titres en attente de ma note |
| POST | /reserve/seed | Générer une pile de suggestions (amorçage ou réapprovisionnement) |
| GET | /tonight | Programme du soir résolu (titre, épisode, plateforme, états de E1) |
| POST | /sessions | Lancer une séance (chemin, titre) |
| PATCH | /sessions/{id} | Confirmer les épisodes vus, résultat du point d'étape |
| POST | /jokers | Démarrer un joker (énergie, format) → 3 candidats |
| PUT | /jokers/{id}/votes | Voter OK / Non sur un candidat |
| GET | /weeks/{weekStart} | Programme de la semaine |
| PUT | /weeks/{weekStart}/slots/{day} | Modifier un créneau |
| POST | /weeks/{weekStart}/ritual/{step} | Valider une étape du rituel (synchronisée) |
| POST | /feedback | Avis titre, note de semaine, note de série, résignation |
| GET | /history | Historique des séances |
| POST | /push/subscriptions | Enregistrer un abonnement Web Push |
| GET | /events | Flux SSE du foyer (votes, étapes de rituel, nouvelles notes) |
| GET | /export ; DELETE /households | Export des données ; suppression du foyer |

Règles transverses : chaque route vérifie l'appartenance au foyer ; les notes de l'autre ne sont renvoyées que si les deux sont posées (RG-04) ; les écritures sont idempotentes via une clé client (rejouables depuis le mode hors-ligne).

## 8. Intégrations externes

Une seule intégration est indispensable (TMDB, pour le catalogue et la disponibilité) ; les autres apportent du confort ou restent optionnelles, et deux limites techniques doivent être assumées : pas de suivi automatique des épisodes regardés sur la télé, et pas de lancement garanti directement sur la télé.

### 8.1 TMDB et disponibilité (indispensable)

- **Usages** : recherche multi (films + séries, langue fr-FR), détails avec `append_to_response` (disponibilité, identifiants externes, vidéos), saisons et épisodes, recommandations et titres similaires (amorçage), découverte filtrée par plateformes et région (`with_watch_providers`, `watch_region=FR`) ([TMDB](https://developer.themoviedb.org/reference/tv-season-watch-providers), [forum TMDB](https://www.themoviedb.org/talk/5ff0a2b7176a940045e88665)).
- **Disponibilité** : les données de plateformes viennent de JustWatch, mises à jour quotidiennement ; un titre absent de JustWatch est absent de TMDB ([forum TMDB](https://www.themoviedb.org/talk/633e6e73fb8346007936fb52)).
- **Obligations** : l'API est gratuite pour un usage non commercial, à condition de créditer TMDB ; un usage commercial exige un accord écrit ([conditions TMDB](https://themoviedb.org:443/api-terms-of-use), [Apidog](https://apidog.com/blog/tmdb-api-key/)). L'application affiche le logo TMDB et la mention « This product uses the TMDB API but is not endorsed or certified by TMDB », et crédite **JustWatch** partout où une disponibilité est affichée, sous peine de révocation de l'accès ([TMDB](https://developer.themoviedb.org/reference/tv-season-watch-providers)).
- **Limites de débit** : la limite historique de 40 requêtes / 10 s a été désactivée en 2019, mais un plafond de rafale existe encore et renvoie une erreur 429 ([Apidog](https://apidog.com/blog/tmdb-api-key/)). L'API de « Ce soir » sert de proxy avec cache et nouvelle tentative avec attente.
- **Rafraîchissement** : tâche quotidienne de mise à jour de la disponibilité pour les titres de la Réserve et les doudous ; les détails des titres sont rafraîchis chaque semaine.
- **Si l'outil devenait public** : passer à un accord commercial TMDB avant toute monétisation.

### 8.2 Partage Android (confort important)

- La PWA installée se déclare **cible de partage** via `share_target` dans le manifeste ; elle apparaît alors dans le menu « Partager » d'Android, à condition d'avoir été ajoutée à l'écran d'accueil ([Chrome for Developers](https://developer.chrome.com/docs/capabilities/web-apis/web-share-target)).
- Sur Android, le champ `url` arrive vide : le lien se trouve dans `text` ou parfois `title`, et rien ne garantit le format ; il faut valider chaque entrée ([Chrome for Developers](https://developer.chrome.com/docs/capabilities/web-apis/web-share-target)).
- **Résolution** (`/share/resolve`) : extraire l'éventuelle URL ; si elle pointe vers une page connue (TMDB, IMDb, JustWatch, AlloCiné…), en déduire le titre ou l'identifiant externe ; sinon, nettoyer le texte et lancer une recherche TMDB ; renvoyer les 3 correspondances les plus probables pour confirmation en un geste.

### 8.3 Suivi des épisodes (limite assumée)

- Il n'existe pas de moyen fiable de savoir automatiquement ce qui a été regardé sur une télévision. Le service Trakt permet le « scrobbling » depuis Netflix ou Prime Video, mais via une extension de navigateur sur ordinateur ([Universal Trakt Scrobbler](https://www.github.com/trakt-tools/universal-trakt-scrobbler)), ce qui ne correspond pas à votre usage au lit devant la télé.
- Choix de conception : **confirmation du lendemain en un geste** (RG-50), pré-remplie avec la limite du soir.
- Option future : import depuis Trakt pour qui l'utiliserait déjà ([Trakt API](https://github.com/api-evangelist/trakt)).

### 8.4 Lancement du titre (limite assumée)

- « Lancer » ouvre le **lien de la plateforme** fourni avec la disponibilité, sur le téléphone ; sur la télé, le couple lance le titre comme d'habitude. Un lancement direct sur la télé dépend du modèle (télé Android / Google TV, Chromecast, autre) et ne fait pas partie de la v1.
- Piste v3, si votre télé est sous Android TV / Google TV : le protocole de télécommande Android TV permet d'ouvrir une application ou un lien profond sur la télé depuis le réseau local ([gtv-remote](https://pypi.org/project/gtv-remote/)) ; à étudier seulement après avoir confirmé le modèle de télé (question ouverte).

### 8.5 Notifications (confort)

- Web Push fonctionne sur Android dans Chrome avec HTTPS, un service worker et l'accord de l'utilisateur ; Chrome ne retire pas la permission aux applications web installées, contrairement aux sites peu utilisés ([MobiLoud](https://www.mobiloud.com/blog/pwa-push-notifications)).
- Notifications prévues, toutes désactivables : rappel du rituel (dimanche, heure réglable) ; « 2 titres à noter » (au plus une par jour) ; point d'étape à 15 minutes (RG-34) ; votes du joker quand l'autre a déjà répondu.
- Aucune notification de relance quotidienne ni de « série » à maintenir.

### 8.6 Modèle de langage (option v3)

- Appel côté serveur uniquement, avec les deux profils de goûts anonymisés (titres aimés, détestés, doudous, notes) ; sortie structurée (liste de titres + raison) ; validation systématique contre TMDB avant ajout à « À noter ».
- Coût borné : appel déclenché seulement au réapprovisionnement (section 5.5), jamais le soir.

## 9. Architecture technique et stack

Une application web progressive installée sur les deux téléphones, une API NestJS unique avec PostgreSQL, et TMDB comme seule dépendance indispensable : une architecture volontairement simple, alignée sur une stack que vous maîtrisez déjà (TypeScript, NestJS, PostgreSQL, React).

### 9.1 Choix et justification

| Couche | Choix | Pourquoi |
| --- | --- | --- |
| Client | PWA React + TypeScript (Vite), installable sur Android | Pas de store, cible de partage Android, Web Push, une seule base de code ; fonctionne aussi sur iPhone si besoin |
| Hors-ligne | Service worker (Workbox) ; cache de `/tonight`, de la Réserve et des affiches | L'écran du soir s'affiche même avec un mauvais Wi-Fi dans la chambre |
| État client | TanStack Query + file d'écritures rejouables | Écritures idempotentes (section 7) |
| API | NestJS (modules : auth, households, catalog, reserve, planning, sessions, engine, realtime, push, jobs) | Structure modulaire, injection de dépendances, tests |
| Base | PostgreSQL | Contraintes d'unicité, JSON pour la semaine type et les votes |
| Cache catalogue | Tables PostgreSQL de cache (title, availability) ; Redis non nécessaire en v1 | Deux utilisateurs : pas de charge |
| Temps réel | Server-Sent Events par foyer | Joker et rituel synchronisés, plus simple que WebSocket pour ce besoin |
| Notifications | Web Push (VAPID) | Natif sur Android Chrome |
| Authentification | Lien magique par e-mail, passkey en option | Pas de mot de passe à retenir |
| Tâches planifiées | Planificateur NestJS : disponibilité quotidienne, rappel du dimanche, réapprovisionnement | Pas d'infrastructure supplémentaire |
| Hébergement | Un conteneur API + une base PostgreSQL managée, hébergés dans l'Union européenne | Coût minimal ; données personnelles en UE (section 11) |
| Tests | Unitaires sur le moteur et les règles RG ; E2E Playwright sur les parcours 3.1 à 3.7 | Les règles métier sont le cœur, elles doivent être couvertes |

### 9.2 Vue d'ensemble

&#91;embedded content: architecture · 2 clients, 1 API, 4 services externes\]

Les deux téléphones parlent à l'API en HTTPS et reçoivent le temps réel par SSE ; seul TMDB est indispensable, le modèle de langage (en pointillé) n'arrive qu'en v3.

## 10. Design de l'interface

L'interface est conçue d'abord pour le pire moment d'usage : au lit, dans le noir, fatigué, à une main. Le reste de l'application peut être plus riche, mais l'écran du soir doit être sobre, sombre et immédiat.

### 10.1 Mode nuit

- **Thème sombre par défaut le soir** (à partir d'une heure réglable), fond quasi noir, texte gris clair, une seule couleur d'accent pour « Lancer ».
- **Luminosité perçue minimale** : peu de surfaces claires, affiches assombries par un voile. Les études récentes indiquent que c'est la luminosité de l'écran, plus que sa couleur, qui pèse sur l'horloge biologique, et que les modes « lumière chaude » seuls protègent peu le sommeil ([TechRadar](https://techradar.com/news/smartphone-night-modes-may-not-actually-help-you-sleep-say-scientists), [Futura Sciences](https://www.futura-sciences.com/en/?p=900343)).
- **Temps d'écran minimal** : l'objectif est de poser le téléphone en moins d'une minute ; pas de défilement infini, pas de recommandations annexes, pas d'animations longues. L'usage interactif et le défilement prolongé au lit sont eux-mêmes associés à un endormissement plus tardif ([Futura Sciences](https://www.futura-sciences.com/en/?p=900343)).

### 10.2 Ergonomie

- Action principale dans la zone du pouce (tiers inférieur), cibles tactiles d'au moins 48 dp.
- 1 geste pour lancer sur défaut ; 3 à 4 gestes au maximum pour un joker résolu.
- Les boutons restent la référence ; les gestes (balayer une carte) ne sont que des raccourcis.
- Retour haptique léger sur « Lancer » et sur l'accord d'un titre au joker.

### 10.3 Accessibilité

- Contrastes conformes WCAG 2.2 niveau AA dans les deux thèmes.
- Respect de la taille de texte système et de l'option « réduire les animations ».
- Libellés explicites pour les lecteurs d'écran (« Noter 3, très envie »).

### 10.4 Ton et langage

- Français, tutoiement entre l'application et chaque membre, prénoms partout plutôt que « partenaire ».
- **Aucune culpabilisation** : pas de « vous n'avez pas fait votre rituel », pas de compteur d'échecs, pas de dette d'équité affichée. Une carte blanche ou un repli doudou sont présentés comme des choix normaux.
- Formulations neutres pour le veto : « Non merci » plutôt que « Je déteste ».

### 10.5 Identité visuelle

Sobre et chaleureuse : une palette sombre, une couleur d'accent, une typographie lisible ; les affiches des titres sont le seul élément visuel riche. Le logo TMDB et la mention JustWatch apparaissent dans « Réglages › À propos » et sous chaque bloc de disponibilité (section 8.1).

## 11. Exigences non fonctionnelles

Les exigences visent surtout deux choses : que l'écran du soir réponde instantanément même avec un mauvais réseau, et que les données intimes du couple restent minimales, protégées et effaçables.

| Domaine | Exigence |
| --- | --- |
| Performance | « Ce soir » affiché en moins de 1 s à l'ouverture depuis le cache ; données fraîches en moins de 2 s sur 4G ; propositions du joker en moins de 1 s |
| Hors-ligne | Programme du soir, Réserve et affiches disponibles hors connexion ; écritures mises en file et rejouées ; conflits résolus par « dernière écriture gagne », sauf les notes (une par membre, sans conflit possible) |
| Temps réel | Votes du joker et étapes du rituel visibles sur l'autre téléphone en moins de 2 s ; reconnexion automatique du flux SSE |
| Fiabilité | Si TMDB est indisponible, l'application fonctionne sur son cache ; seules la recherche et l'actualisation des disponibilités sont dégradées |
| Sécurité | HTTPS partout ; session en cookie httpOnly, SameSite=Lax ; jetons d'invitation et de lien magique hachés, à usage unique et expirants ; limitation de débit sur l'authentification ; clé TMDB uniquement côté serveur |
| Confidentialité | Les goûts « adorés / détestés » de chacun et les notes non révélées ne sont jamais envoyés au téléphone de l'autre (RG-04) |
| RGPD | Données personnelles minimales (prénom, e-mail, goûts, historique de visionnage) ; hébergement dans l'Union européenne ; export complet et suppression du foyer depuis les réglages ; pas de traceur publicitaire ; mesures d'usage calculées dans l'application, sans outil tiers |
| Sauvegardes | Sauvegarde quotidienne de la base, conservation 14 jours, restauration testée |
| Observabilité | Journaux structurés, suivi des erreurs côté client et serveur, alerte sur l'échec de la tâche de disponibilité |
| Compatibilité | Chrome Android récent (cible principale) ; Safari iOS récent supporté en mode installé si le second téléphone est un iPhone (Web Push iOS uniquement en application installée) ([MobiLoud](https://www.mobiloud.com/blog/pwa-push-notifications)) |
| Qualité | Couverture des règles RG par des tests unitaires ; parcours 3.1 à 3.7 en E2E Playwright ; tests de rendu en thème sombre |
| Maintenabilité | Un dépôt, deux applications (client, API), types partagés ; migrations de base versionnées |

## 12. Lots de livraison et critères d'acceptation

Le produit se livre en trois lots, précédés d'un test sans code ; chaque lot doit, à lui seul, améliorer les soirées, et le suivant ne démarre que si le précédent est utilisé par les deux.

### 12.1 Les lots

| Lot | Nom | Contenu | Condition pour passer au suivant |
| --- | --- | --- | --- |
| 0 | Test sans code | 3 semaines avec une note partagée et les règles (document « solution », section 6) | Les règles tiennent ; on sait où la note coince |
| v1 | Le soir sans décision | Foyer et invitation ; abonnements ; Réserve, notes à l'aveugle, veto ; ajout par recherche et partage Android ; série du couple et suivante ; écran « Ce soir » et Lancer ; confirmation du lendemain ; doudous et repli ; joker en mode un seul téléphone ; disponibilité TMDB et attributions ; PWA hors-ligne ; semaine type éditable simplement | 2 semaines d'usage par les deux ; majorité des soirs sur défaut |
| v2 | La semaine à deux | Joker synchronisé sur deux téléphones ; rituel du dimanche guidé ; 5-3-1 ; carte blanche alternée et déplaçable ; équité dans le moteur ; point d'étape à 15 min ; sortie de série au 3e épisode ; amorçage automatique de la Réserve ; historique et avis ; notifications | 4 semaines ; satisfaction hebdomadaire de 4 ou plus pour les deux |
| v3 | Plus de ponts | Suggestions par modèle de langage ; réapprovisionnement automatique ; lancement direct sur la télé si le modèle le permet ; import Trakt optionnel | — |

### 12.2 Critères d'acceptation (extraits clés)

1. **Défaut du soir (RG-30)** — *Étant donné* une série du couple en cours à l'épisode 7 et un mardi programmé « série du couple », *quand* un membre ouvre l'application, *alors* E1 affiche cette série, « épisode 7 », la plateforme, et « Lancer » sans aucun défilement.
2. **Éligibilité (RG-02)** — *Étant donné* un titre noté 3 par l'un et pas encore noté par l'autre, *quand* un joker est lancé, *alors* ce titre n'est jamais proposé.
3. **Veto (RG-03)** — *Étant donné* un titre noté 0 par un membre, *alors* il n'apparaît dans aucune proposition et seul ce membre peut modifier sa note.
4. **Notes à l'aveugle (RG-04)** — *Étant donné* que seul Grégory a noté un titre, *quand* sa femme consulte ce titre, *alors* elle ne voit pas la note de Grégory, et l'API ne la renvoie pas.
5. **Joker borné (RG-31 à RG-33)** — *Quand* un joker est lancé, *alors* exactement 3 titres éligibles sont proposés ; le premier titre accepté par les deux est retenu ; sans accord après 180 secondes, un doudou est proposé et aucun second joker n'est possible ce soir-là.
6. **Disponibilité** — *Étant donné* un titre disponible seulement en location, *alors* il n'est pas proposé comme éligible, et sa fiche affiche l'offre de location avec la mention JustWatch.
7. **Série suivante (RG-11, RG-13)** — *Quand* le dernier épisode de la série du couple est confirmé vu, *alors* la série suivante devient la série du couple dès la séance suivante, et le prochain rituel demande d'en désigner une nouvelle.
8. **Sortie de série (RG-12)** — *Étant donné* le 3e épisode confirmé, *quand* un membre note la série 1, *alors* elle passe à « abandonnée » et la suivante la remplace.
9. **Carte blanche (RG-22, RG-23)** — *Étant donné* une semaine où c'est le tour de sa femme, *alors* E1 indique « Ce soir, c'est le choix de \[prénom\] » le soir prévu, et la séance compte comme décidée par elle.
10. **Équité (RG-41, RG-42)** — *Étant donné* un écart de 2 séances décidées sur 28 jours, *quand* un joker est lancé, *alors* au moins une proposition vient des ajouts du membre le moins « servi », et aucun écran n'affiche l'écart.
11. **Partage Android** — *Quand* un membre partage depuis une autre application un texte contenant le nom d'une série, *alors* « Ce soir » propose au plus 3 correspondances et l'ajout se fait en un geste plus la note.
12. **Hors-ligne** — *Étant donné* le téléphone hors connexion, *quand* E1 s'ouvre, *alors* le programme du soir s'affiche depuis le cache en moins de 1 s et « Lancer » enregistre la séance, synchronisée au retour du réseau.
13. **Lendemain (RG-50)** — *Étant donné* une séance de série la veille avec limite 2, *quand* un membre ouvre l'application le lendemain, *alors* la carte propose « 2 épisodes » pré-rempli, modifiable, et la progression avance de la valeur validée.
14. **Ton** — Aucun texte de l'application ne mentionne un échec, un retard ou une dette (revue de tous les libellés avant chaque livraison).

## 13. Questions ouvertes

Six points restent à trancher avant de coder ; les trois premiers changent l'architecture ou le périmètre, les autres seulement des réglages.

| # | Question | Pourquoi elle compte | Défaut retenu en attendant |
| --- | --- | --- | --- |
| Q1 | Quel téléphone a votre femme (Android ou iPhone) ? | Partage, notifications et installation diffèrent sur iPhone | PWA compatible des deux ; Android prioritaire |
| Q2 | Quel est le modèle de la télé de la chambre (Android TV / Google TV, autre smart TV, Chromecast) ? | Seul ce point rend possible un lancement direct sur la télé (8.4) | Lien ouvert sur le téléphone, lancement manuel sur la télé |
| Q3 | Comment votre femme réagit-elle au système après le test sans code ? Quelles règles veut-elle changer ? | C'est sa réaction qui décide si l'outil reste le vôtre ou devient celui du couple | Semaine type et règles du document « solution » |
| Q4 | Quels abonnements exacts aujourd'hui (Netflix, Disney+, Prime Video, autres) ? | Filtre de disponibilité | Netflix, Disney+, Prime Video |
| Q5 | Le soir de match : carte blanche ou créneau à part ? | Équité et grille de la semaine | Déplacement de votre carte blanche |
| Q6 | Projet strictement personnel, ou ouverture à d'autres couples un jour ? | Licence TMDB commerciale, multi-foyers, RGPD renforcé | Strictement personnel, non commercial |

## Sources

Cette spécification s'appuie sur les deux documents précédents : [l'état des lieux](https://claude.ai/artifact/59rRBgPF4miehb7q14yUct) et [la solution](https://claude.ai/artifact/8HUzwYLFpHDawTf6EzmGDh), qui citent la recherche comportementale utilisée (défauts, satisficing, loisirs partagés, sommeil, rituels, recommandation de groupe).

Technique et données

- TMDB, disponibilité par plateforme (données JustWatch, attribution obligatoire) — [documentation](https://developer.themoviedb.org/reference/tv-season-watch-providers)
- TMDB, filtres de découverte par plateformes et région — [forum TMDB](https://www.themoviedb.org/talk/5ff0a2b7176a940045e88665) ; mise à jour quotidienne depuis JustWatch — [forum TMDB](https://www.themoviedb.org/talk/633e6e73fb8346007936fb52)
- Conditions d'utilisation de l'API TMDB — [TMDB](https://themoviedb.org:443/api-terms-of-use) ; clés, limites et attribution — [Apidog](https://apidog.com/blog/tmdb-api-key/)
- Web Share Target API — [Chrome for Developers](https://developer.chrome.com/docs/capabilities/web-apis/web-share-target)
- Web Push pour PWA sur Android et iOS — [MobiLoud](https://www.mobiloud.com/blog/pwa-push-notifications)
- Trakt : API et scrobbling — [Trakt API](https://github.com/api-evangelist/trakt) ; [Universal Trakt Scrobbler](https://www.github.com/trakt-tools/universal-trakt-scrobbler)
- Télécommande Android TV et liens profonds — [gtv-remote](https://pypi.org/project/gtv-remote/)

Usage nocturne des écrans

- Luminosité plutôt que couleur — [TechRadar](https://techradar.com/news/smartphone-night-modes-may-not-actually-help-you-sleep-say-scientists)
- Modes nuit, luminosité et usage interactif avant le coucher — [Futura Sciences](https://www.futura-sciences.com/en/?p=900343)
