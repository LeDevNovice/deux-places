# Nom et design de l'application — spécification écran par écran

Nov 8, 2026 · @LeDevNovice

## En bref

L'application s'appelle **Deux Places** : deux places de cinéma réservées pour ce soir, deux places dans le lit, deux places sur le canapé. Tout le design en découle : **une petite salle de cinéma privée pour deux, dont la lumière baisse quand la séance commence.**

- **Le nom** porte à la fois le couple, le lit et la salle de cinéma, et prolonge naturellement le vocabulaire déjà choisi dans la spécification (Réserve, séance, programme, carte blanche). Aucune application ni service de ce nom n'est apparu dans les recherches.
- **Le concept** : la salle obscure. Le soir, l'interface est un auditorium plongé dans le noir où seul le **billet du soir** est éclairé, par une lueur ambrée semblable à la lampe d'une ouvreuse. Le jour, elle devient le hall du cinéma : papier crème, encre, velours bordeaux.
- **Le vocabulaire** vient du cinéma de quartier : la séance de ce soir, changer d'affiche (le joker), une reprise (le doudou), la programmation du dimanche, la carte blanche, et les billets gardés en souvenir (l'historique).
- **Trois principes de design** : une seule chose éclairée à la fois ; le geste le plus fréquent sous le pouce ; rien qui culpabilise, rien qui retienne au lit plus longtemps que nécessaire.
- **Accessibilité vérifiée** : tous les couples texte / fond de la palette ont été calculés et dépassent le seuil WCAG AA de 4,5:1 pour le texte courant (section 3).

La section 5 détaille l'écran « Ce soir » avec une maquette fil de fer ; les sections 6 et 7 couvrent les 11 autres écrans.

## 1. Recherche du nom

Sur six territoires explorés, **Deux Places** est le seul nom qui réunit les trois réalités du produit (le couple, le lit du soir, le cinéma), reste chaleureux pour quelqu'un qui n'a pas conçu l'outil, et n'entre en conflit avec aucun service existant trouvé.

### 1.1 Méthode

La méthode suit celle de l'agence de naming Igor : partir du positionnement, distinguer les noms fonctionnels, inventés, expérientiels et **évocateurs** (les plus puissants, comme Apple ou Virgin), puis évaluer les candidats sur des critères fixés à l'avance — apparence, singularité, profondeur, énergie, humanité, positionnement, sonorité, potentiel de bouche-à-oreille et viabilité de marque ([Igor](https://www.igorinternational.com/llms.txt)). Son cofondateur insiste sur le fait de rédiger une « fiche de poste » du nom et de juger sur ces critères plutôt que sur les goûts personnels ([Igor](https://igorinternational.com/press/whats-in-a-name.php)).

**Fiche de poste du nom :**

- Évoquer **le couple ensemble**, **le soir** et **le plaisir de l'écran**, sans parler de technique ni de « décision ».
- Plaire autant à celle qui n'a pas conçu l'outil qu'à celui qui l'a conçu : pas de jargon, pas de clin d'œil geek.
- Être français, court, prononçable d'une traite, lisible sous une icône d'application.
- Pouvoir porter un univers visuel et un vocabulaire cohérent pour tout le produit.
- Ne pas entrer en collision avec un produit ou une marque connue du même domaine.

### 1.2 Territoires explorés

| Territoire | Idée | Exemples de noms |
| --- | --- | --- |
| Le moment | Le rendez-vous du soir | Ce soir, Bonsoir |
| L'objet | La télé, l'écran | Lucarne (« la petite lucarne » = la télé) |
| La lumière du soir | La chambre, la lumière tamisée | Veilleuse |
| Le côte-à-côte | Être ensemble, même sans faire la même chose | Côte à côte, Nous deux |
| Le cocon | Le confort, la couette | Plaid, Cocon |
| La salle de cinéma | La séance, les places réservées | Deux Places, Séance |

### 1.3 Shortlist évaluée

Notes de 1 à 5, attribuées par moi à partir des critères ci-dessus ; « Disponibilité » reflète uniquement les conflits trouvés dans les recherches.

| Nom | Singularité | Profondeur (sens multiples) | Chaleur | Positionnement | Sonorité | Disponibilité | Total /30 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Deux Places** | 4 | 5 (cinéma, lit, canapé, réservation) | 5 | 5 | 4 | 4 | **27** |
| Veilleuse | 4 | 4 (lumière du soir, veiller ensemble) | 5 | 3 | 5 | 2 | 23 |
| Lucarne | 3 | 3 (la télé, une fenêtre) | 3 | 3 | 4 | 2 | 18 |
| Côte à côte | 3 | 4 (ensemble, activité parallèle) | 4 | 3 | 3 | 3 | 20 |
| Ce soir | 1 | 2 | 3 | 4 | 5 | 1 | 16 |
| Séance | 2 | 3 | 2 | 4 | 4 | 2 | 17 |

### 1.4 Vérifications

- **Veilleuse** : une application Android de veilleuse de nuit porte déjà ce nom ([F-Droid](https://f-droid.org/packages/io.github.pic38.veilleuse/)), et le mot renvoie surtout à la chambre d'enfant.
- **Lucarne** : « La Lucarne » est depuis 1997 la case de documentaires d'auteur d'Arte ([Centre Pompidou](https://www.centrepompidou.fr/en/ressources/media/0LGAnWp), [Cineuropa](https://cineuropa.org/prodcompany/314721)) : association forte et éloignée du projet.
- **Nous deux** : titre d'un magazine de presse sentimentale français bien connu, donc à écarter.
- **Ce soir** : trop générique, impossible à distinguer dans une recherche ou un écran d'applications.
- **Deux Places** : aucune application ni service portant ce nom n'est apparu dans la recherche (seuls des lieux sans rapport, comme des restaurants, remontent). Avant toute diffusion publique, il restera à vérifier la base des marques de l'INPI, le Play Store et la disponibilité d'un nom de domaine.

### 1.5 Le choix : Deux Places

- **Quatre sens qui se superposent** : deux places réservées au cinéma ; un lit deux places (là où vous regardez) ; un canapé deux places ; et « réserver deux places », écho direct à la **Réserve** de l'application.
- **Un nom de rendez-vous, pas d'outil** : il parle d'un moment partagé, pas d'un algorithme. Il fonctionne aussi bien prononcé par votre femme (« t'as regardé sur Deux Places ? ») que par vous.
- **Un univers prêt à l'emploi** : la salle de cinéma fournit un vocabulaire que tout le monde connaît (billet, séance, affiche, reprise, programmation) et une ambiance visuelle naturellement nocturne, parfaite pour un usage au lit.
- **Écriture** : « Deux Places », deux mots, deux majuscules ; jamais « 2 Places » dans le texte (le chiffre est réservé à l'icône).
- **Signatures possibles** : « Deux places pour ce soir. » (principale) ; « Ce soir, c'est déjà réservé. » ; « La séance commence quand vous voulez. »

## 2. Concept de marque et vocabulaire

Le concept tient en une image : **la petite salle de cinéma de quartier, juste pour vous deux, où la lumière baisse quand la séance commence.** Il donne à la fois l'ambiance visuelle (le noir de la salle, la lueur de l'écran) et le vocabulaire de l'application.

### 2.1 Personnalité

| Trait | Ce que ça veut dire | Ce que ça exclut |
| --- | --- | --- |
| Chaleureuse | Prénoms, tutoiement, lumière ambrée | Ton administratif, « utilisateur 2 » |
| Complice | Petits clins d'œil de cinéma, un par écran au plus | Jeux de mots en cascade |
| Discrète | S'efface dès que la séance commence | Notifications insistantes, badges partout |
| Cinéphile sans snobisme | Vocabulaire du cinéma de quartier, connu de tous | Jargon de critique, références obscures |
| Équitable | Les deux prénoms ont le même poids visuel | Un « propriétaire » et un « invité » |

### 2.2 Les deux ambiances

- **La salle (le soir)** : à partir de l'heure réglée (par défaut 20 h), l'application est une salle obscure. Fond brun-noir chaud, presque rien d'éclairé, sauf le billet du soir et le bouton qui lance la séance, en lueur ambrée.
- **Le hall (la journée)** : pour ajouter, noter et programmer. Fond papier crème, encre presque noire, accents velours bordeaux, comme un hall de cinéma avec ses affiches et sa billetterie.
- La bascule n'est pas seulement de couleur : en mode salle, l'interface **retire** des éléments (pas d'onglet secondaire mis en avant, pas de suggestion).

### 2.3 Vocabulaire de l'application

Le vocabulaire du cinéma remplace les termes de travail de la spécification ; c'est lui qui apparaît à l'écran.

| Terme de la spécification | Dans Deux Places | Pourquoi |
| --- | --- | --- |
| Écran du soir | **Ce soir** — « La séance de ce soir » | Le rendez-vous, pas l'outil |
| Lancer | **Lancer la séance** (bouton : « Lancer ») | Le geste du soir |
| Joker | **Changer d'affiche** | On change le film prévu, pas les règles |
| Doudou, repli | **Une reprise** | Au cinéma, une reprise est la reprojection d'un film déjà sorti : exactement Friends ou Modern Family |
| Série du couple | **Notre série** | Possession commune, en deux mots |
| Série suivante | **Prochainement** | La mention des bandes-annonces au cinéma |
| Réserve | **La Réserve** | Réserver ses deux places |
| Liste solo | **Pour moi** | Simple et sans ambiguïté |
| Énergie léger / prenant | **Séance légère** / **Grande séance** | Le soir de semaine contre le grand film du vendredi |
| Notes 0 à 3 | **Non merci** · **Pourquoi pas** · **Envie** · **Très envie** | Neutre, jamais blessant |
| À noter | **À noter** — « \[Prénom\] a mis 3 titres en réserve » | Indique qui attend l'avis de qui |
| Programme de la semaine | **Programme** | Le programme d'un cinéma |
| Rituel du dimanche | **La programmation** | Le moment où l'on décide ce qui passera |
| Carte blanche | **Carte blanche** | Terme déjà employé par les cinémas et festivals |
| Film du vendredi | **Grande séance** | Le soir où l'on a plus d'énergie |
| Point d'étape à 15 min | **Le quart d'heure** — « On continue ? » | Bref, sans pression |
| Confirmation du lendemain | **Hier soir** | Ce qu'on demande au réveil |
| Historique | **Billets** — vos talons de billets gardés | Les souvenirs communs, comme des tickets dans une boîte |
| Avis sur un titre | **Coup de cœur** · **Mitigé** · **Pas pour nous** | Un avis de couple, au pluriel |
| Installation | **Première séance** | Le début de l'histoire de l'application |

Règles d'usage : un seul clin d'œil de cinéma par écran au plus ; le vocabulaire ne doit jamais rendre une action moins claire (on garde « Ajouter », « Annuler », « Réglages ») ; les prénoms remplacent toujours « partenaire ».

## 3. Identité visuelle

L'identité repose sur trois éléments faciles à reconnaître : **deux dossiers de fauteuil côte à côte**, **une lueur ambrée** et **le billet découpé**. Le reste est volontairement sobre pour ne pas éblouir la nuit.

### 3.1 Logo et icône

- **Symbole** : deux dossiers de fauteuil de cinéma arrondis, côte à côte, à égale hauteur (aucun des deux n'est devant l'autre), sous un arc de lumière qui figure l'écran. Les deux fauteuils forment aussi, de loin, un « 2 » ouvert sur le bas.
- **Icône d'application** (512 × 512, masque adaptatif Android) : fond Salle `#1A1416`, fauteuils en Velours clair `#B8566A`, arc en Lueur `#E8B26A`. Pas de texte dans l'icône.
- **Logotype** : « Deux Places » en Fraunces, graisse 600, légère réduction d'approche ; utilisé seul dans la Première séance et dans Réglages › À propos, jamais en en-tête permanent.
- **Zone de protection** : la hauteur d'un fauteuil tout autour ; taille minimale 24 dp pour le symbole.

### 3.2 Couleurs — la Salle (soir)

Les recommandations Material pour les thèmes sombres guident la palette : éviter le noir pur, préférer des surfaces gris foncé et des couleurs désaturées qui gardent un contraste AA d'au moins 4,5:1 sur toutes les surfaces ([Material Design](https://m2.material.io/design/color/dark-theme)). Ici, le gris neutre est remplacé par un brun-noir chaud, la couleur d'une salle.

| Jeton | Hex | Rôle | Contraste sur Salle / Surface 1 / Surface 2 |
| --- | --- | --- | --- |
| salle | #1A1416 | Fond principal | — |
| surface-1 | #241C1F | Cartes, barre de navigation | — |
| surface-2 | #2F2529 | Feuilles, éléments surélevés | — |
| texte | #EDE4DC | Texte principal | 14,5 / 13,3 / 11,8 |
| texte-2 | #B8AAA3 | Texte secondaire | 8,1 / 7,4 / 6,6 |
| texte-3 | #A0928B | Mentions discrètes, métadonnées | 6,0 / 5,5 / 4,9 |
| lueur | #E8B26A | Action principale (Lancer), état actif | 9,5 / 8,7 / 7,8 |
| velours-clair | #D99AA6 | Accent secondaire, carte blanche | 7,9 / 7,2 / 6,4 |
| accord | #9CC9A0 | « OK » des deux, coup de cœur | 9,8 / 8,9 / 8,0 |
| non-merci | #E39B8F | Veto, refus | 8,1 / 7,4 / 6,6 |
| velours-décor | #B8566A | Fauteuils de l'icône, illustrations (jamais du texte) | 4,0 sur Salle (élément graphique) |

Texte posé sur la lueur (bouton Lancer) : couleur Salle `#1A1416`, contraste 9,5:1.

### 3.3 Couleurs — le Hall (journée)

| Jeton | Hex | Rôle | Contraste sur Hall / Surface 1 / Surface 2 |
| --- | --- | --- | --- |
| hall | #F7F1E8 | Fond papier crème | — |
| surface-1 | #FFFBF5 | Cartes | — |
| surface-2 | #EFE6DA | Zones groupées, champs | — |
| encre | #22191C | Texte principal | 15,3 / 16,6 / 13,9 |
| encre-2 | #5E5054 | Texte secondaire | 6,8 / 7,4 / 6,2 |
| velours | #8E2F43 | Action principale, liens | 7,1 / 7,7 / 6,5 |
| ambre | #86561A | Accent, état actif | 5,6 / 6,1 / 5,1 |
| accord | #2F6B3A | « OK », coup de cœur | 5,7 / 6,2 / 5,2 |
| non-merci | #A3402F | Veto, refus | 5,6 / 6,1 / 5,1 |

Texte sur bouton velours : `#FFF6F0`, contraste 7,5:1. Tous les ratios ont été calculés selon la formule de luminance relative WCAG ; aucune couleur n'est utilisée seule pour porter un sens (toujours doublée d'un libellé ou d'une icône).

### 3.4 Typographie

- **Fraunces** (variable, licence libre OFL) pour les titres d'œuvres et les grands titres : un serif doux, rétro, qui évoque les affiches de cinéma sans être une police fantaisie. Axe « SOFT » vers 50, optique automatique.
- **Inter** (licence libre OFL) pour toute l'interface : très lisible en petite taille et sur fond sombre ; chiffres tabulaires pour les compteurs et les horaires.
- Les deux polices sont auto-hébergées dans la PWA (pas d'appel externe la nuit).

| Style | Police | Taille / interligne (sp) | Graisse | Usage |
| --- | --- | --- | --- | --- |
| Affiche | Fraunces | 32 / 38 | 600 | Titre du billet du soir |
| Titre 1 | Fraunces | 24 / 30 | 600 | Titres d'écrans, titres de fiche |
| Titre 2 | Inter | 18 / 24 | 600 | Sections, cartes |
| Corps | Inter | 16 / 24 | 400 | Texte courant |
| Libellé | Inter | 14 / 20 | 500 | Boutons, chips |
| Métadonnée | Inter | 13 / 18 | 400 | Année, durée, plateforme |

Toutes les tailles suivent le réglage de taille de texte d'Android ; les mises en page sont vérifiées à 200 %.

### 3.5 Motifs et formes

- **Le billet** : rectangle aux coins de 16 dp, avec deux encoches demi-circulaires de 12 dp sur les bords latéraux et une ligne de perforation pointillée qui sépare le « talon » (plateforme, épisode) du corps (affiche, titre). C'est le composant signature, réservé à ce qui est programmé ou vu.
- **Les fauteuils** : deux petits fauteuils servent d'indicateur de présence partout où les deux avis comptent (notes, votes, programmation) — un fauteuil éclairé par membre qui a répondu.
- **Coins** : 16 dp pour les cartes, 28 dp (pilule) pour les boutons, 12 dp pour les chips.
- **Affiches** : ratio 2:3, coins 12 dp ; en mode Salle, un voile de 35 % de Salle par-dessus réduit leur éclat.
- **Iconographie** : Material Symbols arrondis, contour, graisse 300, 24 dp.

### 3.6 Mouvement et haptique

- **« La lumière baisse »** : à « Lancer », l'écran entier s'assombrit vers le noir en 700 ms (courbe de décélération), le billet se « composte » (le talon se détache légèrement), puis s'affiche « Bonne séance » 1,5 s avant fermeture de l'écran ou ouverture de la plateforme. C'est la signature de l'application.
- **Durées** : 150 ms pour les retours de pression, 250 ms pour les transitions d'écran, 400 ms pour les feuilles, jamais plus de 700 ms.
- **Option « réduire les animations »** : fondu simple de 150 ms à la place de toutes les animations.
- **Haptique** : un tic léger sur « Lancer » et sur chaque note ; un double tic quand les deux ont dit « OK » au même titre (Changer d'affiche) ; aucun son.

## 4. Composants partagés

Une douzaine de composants suffisent à construire les 12 écrans ; tous reposent sur une grille de 8 dp, des marges latérales de 20 dp et des cibles tactiles d'au moins 48 dp, ce qui satisfait à la fois la recommandation Android et le critère WCAG 2.2 de 24 × 24 px minimum ([ezud](https://ezud.com/touch-target-sizes-mobile-accessibility/), [Deque](https://dequeuniversity.com/rules/axe/4.8/target-size)).

| Composant | Description | Dimensions et règles |
| --- | --- | --- |
| Barre d'onglets | 4 onglets : Ce soir, Réserve, Programme, Billets ; icône + libellé toujours visible | Hauteur 72 dp ; onglet actif en lueur (Salle) ou velours (Hall) avec un trait de 3 dp au-dessus de l'icône ; pastille numérique sur Réserve quand il y a des titres à noter |
| Bouton principal | Pilule pleine, un seul par écran | Hauteur 56 dp, pleine largeur moins marges ; lueur ou velours ; libellé 16 sp, 600 |
| Bouton secondaire | Pilule en contour | Hauteur 48 dp ; trait 1,5 dp en texte-2 / encre-2 |
| Lien discret | Texte souligné au toucher | Zone tactile 48 dp de haut même si le texte est petit |
| Billet | Composant signature (3.5) : affiche à gauche ou en haut, titre en Fraunces, talon perforé avec plateforme et épisode | Largeur pleine ; hauteur 168 dp (format ligne) ou 420 dp (format affiche, écran Ce soir) |
| Carte titre | Ligne de liste : vignette 2:3 de 56 × 84 dp, titre, métadonnées, fauteuils de notes | Hauteur minimale 104 dp ; toute la carte est touchable |
| Sélecteur de note | 4 boutons alignés : Non merci, Pourquoi pas, Envie, Très envie ; icône + libellé | 4 colonnes égales, 64 dp de haut ; sélection = fond plein + coche ; « Non merci » toujours à gauche, jamais en rouge vif |
| Fauteuils de présence | Deux petits fauteuils avec l'initiale de chaque prénom ; éclairé = a répondu | 20 dp chacun ; libellé accessible « Grégory a noté, \[prénom\] pas encore » |
| Chip | Filtres et étiquettes (Séance légère, Grande séance, Film, Série, plateformes) | Hauteur 36 dp visible, zone tactile 48 dp ; sélection = fond plein |
| Feuille du bas | Pour les choix secondaires (Changer d'affiche, Hier soir, actions de fiche) | Coins supérieurs 28 dp ; poignée ; fermeture par glissement ou bouton « Fermer » |
| Bandeau | Information de contexte non bloquante (Hier soir, La programmation vous attend) | Hauteur 64 à 88 dp ; une action, un « Plus tard » |
| Toast | Confirmation brève (« Mis en réserve ») avec « Annuler » | 4 s ; au-dessus de la barre d'onglets ; jamais en mode Salle sauf erreur |
| Badge de plateforme | Logo de service + « Inclus dans votre abonnement » ou « Location » | Logos fournis par TMDB ; mention « Données JustWatch » sous chaque groupe de badges |
| État vide | Illustration de fauteuils vides + phrase + une action | Ton chaleureux, jamais culpabilisant |

Règles générales : un seul bouton principal par écran ; jamais plus de deux niveaux d'emphase visibles en même temps en mode Salle ; aucun élément ne clignote ou ne bouge en boucle.

### 4.1 États communs à tous les écrans

Ils valent pour toute donnée que l'application demande au serveur, sur chaque écran, en plus des états propres à l'écran. On ne doit jamais avoir à comprendre d'où vient un problème pour savoir ce qu'on peut faire.

| État | Quand | Ce qui s'affiche |
| --- | --- | --- |
| Chargement | La donnée est demandée et rien n'est en cache | Rien à sa place pendant la première seconde ; au-delà, sa place peut être tenue par une forme fixe en surface-1, jamais animée. Ni roue, ni texte « Chargement ». Le reste de l'écran reste utilisable. Une donnée en cache s'affiche tout de suite et se met à jour sans signal |
| Hors ligne | Le téléphone n'a pas de connexion | Chip « Hors ligne » (5.1) : ce qui est en cache reste lisible, les actions sont mises en file et envoyées au retour du réseau |
| Deux Places ne répond pas | Le téléphone est connecté, mais le serveur ne répond pas, renvoie une erreur ou une réponse que l'application ne sait pas lire, et les nouvelles tentatives automatiques n'y ont rien changé | Donnée en cache : comme Hors ligne, avec la chip « Deux Places ne répond pas » à la place de « Hors ligne ». Rien en cache : à la place de la donnée, « Deux Places ne répond pas pour l'instant. » en texte-2, suivi du lien discret « Réessayer ». L'état disparaît de lui-même dès que le serveur répond de nouveau : retour dans l'application, retour du réseau ou « Réessayer » |

Règles de ces états : jamais de code, de détail technique ni de mot d'échec à l'écran (« erreur », « impossible » ; section 8) ; jamais de rouge ni d'icône d'alerte ; rien d'animé en boucle ; « Hors ligne » seulement quand c'est le téléphone qui n'a pas de connexion, la seule cause sur laquelle on peut agir ; le passage à l'un de ces états est annoncé une seule fois au lecteur d'écran, comme un message d'état poli qui ne déplace pas le focus ; en mode Salle, ni la chip ni la phrase ne sont en lueur, et « Réessayer » reste un lien discret, jamais le bouton principal.

## 5. Écrans du soir : Ce soir, Changer d'affiche, Hier soir

Ces trois écrans sont ceux qu'on utilise au lit ; ils s'affichent toujours en mode Salle après l'heure réglée et partagent une règle : **une seule chose éclairée, sous le pouce**. Les dimensions sont données pour un écran de référence de 360 × 800 dp.

### 5.1 Ce soir (E1)

**Objectif** : lancer la séance prévue en un geste, en moins d'une minute.

**Maquette fil de fer**

&#91;embedded content: écran Ce soir · maquette fil de fer annotée\]

La maquette est en tons neutres ; en production, le fond est la Salle, le billet en surface-1 et seul le bouton « Lancer la séance » est en lueur ambrée.

**Structure, de haut en bas**

| Zone | Contenu | Spécification |
| --- | --- | --- |
| En-tête | « Ce soir · mardi » à gauche ; chip du créneau à droite (« Notre série », « Grande séance », « Carte blanche », « Reprise ») | 56 dp ; Inter 14 sp texte-3 ; chip 36 dp en surface-1 |
| Billet (format affiche) | Affiche 2:3 de 160 × 240 dp centrée, voilée à 35 % ; titre en Fraunces 32 sp ; ligne « Saison 2 · épisode 7 » ; ligne « 2 épisodes ce soir » ; perforation ; talon avec logo de plateforme, « Inclus dans votre abonnement », durée « ≈ 22 min par épisode » | Surface-1 ; coins 16 dp ; encoches latérales ; marges internes 20 dp ; titre limité à 2 lignes |
| Zone d'action | Bouton principal **« Lancer la séance »** ; dessous, bouton secondaire « Changer d'affiche » et lien discret « Plutôt une reprise » | Bouton principal en lueur, texte Salle, 56 dp, ancré à 16 dp au-dessus de la barre d'onglets ; secondaire 48 dp ; 12 dp entre eux |
| Barre d'onglets | Les 4 onglets | En mode Salle, icônes en texte-3, onglet actif seul en lueur |

**États**

| État | Ce qui change |
| --- | --- |
| Notre série (nominal) | Comme ci-dessus |
| Grande séance (film) | Ligne « Film · 1 h 52 » ; ligne « Choisi par \[prénom\] dimanche » en texte-3 |
| Carte blanche de l'autre | En-tête « Carte blanche de \[prénom\] » en velours-clair ; si un titre est choisi, son billet s'affiche avec « Son choix ce soir » ; sinon, fauteuils et phrase « Ce soir, c'est \[prénom\] qui choisit. Tu peux rester à côté ou faire autre chose. » ; pas de bouton Changer d'affiche |
| Ma carte blanche | Billet vide « À toi de choisir » ; bouton principal « Choisir dans ma liste » (ouvre « Pour moi » et la Réserve) |
| Reprise (dimanche) | Billet avec tampon « Reprise » en biais sur le coin de l'affiche ; liste des reprises en défilement horizontal de 3 vignettes au-dessus du bouton |
| Notre série terminée sans Prochainement | Billet vide « Notre série est terminée » ; 3 séries proposées en cartes ; bouton « Choisir ensemble » |
| Titre plus disponible | Badge « Plus dans vos abonnements » sur le talon ; bouton principal devient « Voir une autre affiche » |
| Hors ligne | Chip « Hors ligne » en haut à droite ; tout fonctionne, la séance sera enregistrée plus tard |
| Deux Places ne répond pas | Comme Hors ligne, avec la chip « Deux Places ne répond pas » (4.1) |
| Soir libre | « Pas de séance prévue ce soir. » + bouton secondaire « Finalement, on regarde quelque chose » |

**Interaction « Lancer »** : animation « la lumière baisse » (3.6) ; écran « Bonne séance » avec, pour une nouveauté, la mention « On te demandera dans un quart d'heure si on continue » ; puis ouverture du lien de la plateforme. **Le quart d'heure** arrive en notification : « On continue ? » avec deux actions, « Oui » et « Une reprise plutôt ».

**Accessibilité** : ordre de lecture en-tête → billet → Lancer ; le billet est annoncé en une phrase (« Notre série : The Good Place, saison 2, épisode 7, sur Netflix ») ; le bouton Lancer a le focus initial.

### 5.2 Changer d'affiche (E2)

**Objectif** : trouver en moins de 3 minutes un titre qui convient aux deux, ou basculer sereinement sur une reprise.

**Présentation** : feuille du bas plein écran, en mode Salle, avec un fin compte à rebours en haut.

| Étape | Contenu | Spécification |
| --- | --- | --- |
| 1. Envie | « Plutôt… » ; deux grandes cartes « Séance légère » (présélectionnée) et « Grande séance » ; chips Film / Épisode / Peu importe ; bouton « Voir 3 affiches » | Cartes de 2 colonnes, 120 dp ; un seul geste suffit si la présélection convient |
| 2. Trois affiches | 3 billets au format ligne empilés ; sous chacun, une rangée « Toi : OK / Non » et les fauteuils de l'autre (en attente, OK, Non) mis à jour en direct ; une ligne « pourquoi ce titre » en texte-3 | Billets 168 dp ; boutons OK (accord) et Non (texte-2) de 48 dp ; barre de temps de 3 dp en lueur qui se vide en 3 min, sans chiffres affichés |
| 3a. Accord | Le billet retenu s'agrandit, les autres s'estompent ; double tic ; « C'est réservé. » ; retour à Ce soir avec ce billet | Transition 400 ms |
| 3b. Pas d'accord | « Pas d'accord ce soir ? Ça arrive. » ; billet de la reprise la moins revue ; bouton principal « Lancer la reprise » ; lien « Revenir à la séance prévue » | Aucun ton d'échec ; pas de second Changer d'affiche ce soir-là |

**Mode un seul téléphone** : interrupteur « On vote sur ce téléphone » en haut ; chaque billet affiche alors deux rangées de boutons étiquetées par les prénoms.

**Accessibilité** : la barre de temps n'est pas annoncée en continu ; seule une annonce « Plus qu'une minute » est faite ; les votes de l'autre sont annoncés poliment (« \[prénom\] a dit OK à Ghosts »).

### 5.3 Hier soir (E3)

**Objectif** : tenir à jour la progression de Notre série en un geste.

- **Forme** : bandeau en haut de Ce soir, à la première ouverture du lendemain d'une séance de série ; en mode Hall s'il est consulté en journée.
- **Contenu** : « Hier soir : 2 épisodes de The Good Place ? » ; sélecteur − 2 + (boutons de 48 dp, chiffre en Inter 20 sp tabulaire) ; bouton « C'est ça » ; lien « Plus tard ».
- **Après le 3e épisode d'une nouvelle série** : seconde carte « Après 3 épisodes, on garde Notre série ? » avec trois choix « Pas pour nous » · « Mitigé » · « On garde » ; les fauteuils montrent si l'autre a répondu ; si l'un répond « Pas pour nous », message « Prochainement prend le relais ce soir. »
- **Fin de série** : « Dernier épisode ! Votre avis ? » avec Coup de cœur · Mitigé · Pas pour nous, puis un billet « Prochainement » qui prend la place.

## 6. Écrans de la journée : Réserve, À noter, Fiche titre, Mettre en réserve

Ces écrans vivent surtout en mode Hall : on y passe quelques secondes, souvent d'une main, entre deux choses. L'enjeu est la vitesse de capture et l'équité : chaque titre montre clairement si les deux ont donné leur avis, sans révéler l'avis de l'autre avant le sien.

### 6.1 La Réserve (E4)

**Objectif** : voir ce qui est prêt pour vous deux et ce qui attend un avis.

| Zone | Contenu | Spécification |
| --- | --- | --- |
| En-tête | « La Réserve » en Fraunces 24 sp ; sous-titre « 14 titres prêts pour vous deux » | 72 dp |
| Sélecteur | 4 segments : **Prêts** · **À noter** (avec pastille) · **Écartés** · **Pour moi** | Contrôle segmenté de 40 dp, pleine largeur |
| Filtres | Chips défilantes : Séance légère, Grande séance, Film, Série, une chip par plateforme du foyer, Moins de 30 min | 36 dp ; une ligne, défilement horizontal |
| Bloc « Notre série » | Billet au format ligne de Notre série, puis billet « Prochainement » | Seulement dans Prêts, en tête de liste |
| Liste | Cartes titre triées par envie commune (moteur, sans score affiché) | Carte de 104 dp ; fauteuils de notes à droite |
| Action principale | Bouton flottant étendu **« + Mettre en réserve »** | 56 dp, velours, en bas à droite, se réduit à l'icône au défilement |

**Fauteuils de notes** sur chaque carte : les deux fauteuils avec initiales ; un fauteuil plein = a noté ; sa note n'apparaît (mot court sous le fauteuil) que lorsque les deux ont noté.

**États** : vide (« La Réserve est vide. On vous propose quelques affiches pour commencer ? » + bouton « Proposer des affiches ») ; tout est noté (pas de pastille) ; hors ligne (dernière version, ajout mis en file).

### 6.2 À noter (E5)

**Objectif** : donner son avis sur les titres ajoutés par l'autre, en quelques secondes chacun.

| Zone | Contenu | Spécification |
| --- | --- | --- |
| En-tête | « \[Prénom\] a mis 3 titres en réserve » ; compteur « 1 sur 3 » | 56 dp ; bouton Fermer à gauche |
| Carte | Affiche 200 × 300 dp ; titre en Fraunces 24 sp ; « 2019 · Série · 4 saisons » ; genres ; badges de plateforme ; résumé de 3 lignes avec « Lire plus » ; lien « Voir la bande-annonce » | Carte en surface-1, coins 16 dp ; défilement interne si texte agrandi |
| Mention | « Mis en réserve par \[prénom\] » avec son fauteuil | Texte-2 ; jamais sa note |
| Avis | Sélecteur de note : **Non merci** · **Pourquoi pas** · **Envie** · **Très envie** | 4 × 64 dp, ancré en bas ; un toucher valide et passe au suivant |

**Interaction** : après un avis, la carte glisse vers le haut (250 ms) et la suivante apparaît ; si les deux avis sont là, un toast court « Prêt pour vous deux » ou « Écarté » ; balayer la carte vers la droite = Envie, vers la gauche = Non merci (raccourci seulement, annoncé une fois). **Fin** : fauteuils côte à côte éclairés, « Tout est noté. »

### 6.3 Fiche titre (E6)

**Objectif** : tout savoir d'un titre et agir dessus.

| Zone | Contenu | Spécification |
| --- | --- | --- |
| Visuel | Image large 16:9 du titre, fondue vers le fond ; bouton Retour et menu « … » | 220 dp ; dégradé de 40 % vers le fond |
| Titre | Titre en Fraunces 24 sp ; « 2016 · Série · 4 saisons · 22 min » | — |
| Étiquettes | Chips Séance légère / Grande séance et Film / Série | Modifiables par l'auteur de l'ajout seulement |
| Où regarder | Badges de plateformes du foyer en premier, puis autres offres ; mention « Données JustWatch » | Mise à jour indiquée (« vérifié aujourd'hui ») |
| Vos avis | Deux fauteuils avec prénoms et notes (ou « en attente ») ; « Changer mon avis » | Note de l'autre masquée tant que je n'ai pas noté |
| Résumé | Synopsis complet | Corps 16 sp |
| Pour une série | Saisons, épisodes, durée moyenne ; progression si c'est Notre série | Barre de progression fine en lueur ou velours |
| Action principale | Contextuelle : « Donner mon avis » si je n'ai pas noté ; sinon « Mettre en Prochainement » (série prête) ou « Programmer en grande séance » (film prêt) | Un seul bouton principal |

Menu « … » : Marquer comme vu, Ajouter aux reprises, Déplacer vers Pour moi, Retirer de la Réserve.

### 6.4 Mettre en réserve (E7)

**Objectif** : ajouter un titre en moins de 10 secondes.

| Étape | Contenu | Spécification |
| --- | --- | --- |
| Recherche | Champ « Un film, une série… » avec focus et clavier ouverts ; résultats dès 2 lettres : vignette, titre, année, Film / Série | Champ 56 dp ; résultats en cartes de 72 dp |
| Depuis un partage | Bandeau « Reçu depuis AlloCiné » ; les 3 correspondances les plus probables ; « Ce n'est pas ça ? Chercher » | Arrivée directe sur cette étape |
| Confirmation | Feuille du bas : titre et vignette ; **mon avis** (sélecteur de note) ; **séance** (Légère / Grande) pré-remplie selon la durée et les genres ; **pour qui** (Pour nous deux / Pour moi) ; bouton « Mettre en réserve » | Feuille de 520 dp ; le bouton n'est actif qu'une fois l'avis donné |
| Retour | Toast « Mis en réserve · \[prénom\] donnera son avis » avec « Annuler » | 4 s |

**Cas particuliers** : déjà dans la Réserve (« Déjà en réserve » + lien vers la fiche) ; déjà vu ensemble (proposer « Ajouter aux reprises ») ; aucun résultat (« Pas trouvé. Essaie le titre original ? »).

## 7. Écrans d'organisation : Programme, La programmation, Billets, Réglages, Première séance

Ces écrans se consultent à deux ou à tête reposée ; ils peuvent être plus riches, mais gardent la même logique : les deux prénoms ont toujours le même poids, et rien n'affiche de « score » entre vous.

### 7.1 Programme (E8)

**Objectif** : voir et ajuster la semaine, comme le tableau des séances d'un cinéma.

| Zone | Contenu | Spécification |
| --- | --- | --- |
| En-tête | « Programme » en Fraunces 24 sp ; « Semaine du 9 novembre » ; flèches semaine précédente / suivante | 72 dp |
| Tableau | 7 lignes : jour (« Lun 10 », Inter 600), chip du créneau, titre (Fraunces 16 sp) ou « Libre », fauteuil du décideur à droite | Lignes de 72 dp ; ligne du jour marquée d'un trait vertical de 4 dp en lueur / velours |
| Pied | « Carte blanche cette semaine : \[prénom\] » | Texte-2 |
| Bandeau du dimanche | « La programmation de la semaine vous attend » + bouton « On s'y met » | Visible le dimanche jusqu'à la validation |

**Interactions** : toucher une ligne ouvre une feuille (changer de créneau, échanger avec un autre soir, rendre le soir libre, déplacer ma carte blanche ici) ; appui long pour glisser-déposer une ligne sur une autre (échange), avec tic haptique au dépôt.

### 7.2 La programmation (E9)

**Objectif** : décider la semaine à deux en 5 minutes, chacun sur son téléphone.

- **Cadre** : plein écran en mode Hall, 4 points de progression en haut, fauteuils des deux en haut à droite (éclairé = a validé l'étape) ; « Passer » discret à chaque étape.
- **Étape 1 — La semaine passée** : « Comment était la semaine ? » ; 5 choix en mots (Pas terrible · Moyenne · Bien · Très bien · Parfaite), jamais d'étoiles ; case « Un soir, j'ai décroché sans en avoir envie » (visible seulement par l'application, sert au suivi).
- **Étape 2 — Notre série** : état de Notre série (« Plus que 3 épisodes ») et 3 billets candidats pour Prochainement ; chacun touche « OK » ; dès que les deux ont dit OK au même, il est retenu.
- **Étape 3 — Grande séance de vendredi** : chez celui ou celle qui propose, 8 billets, consigne « Choisis-en 5 » ; chez l'autre, pendant ce temps, écran d'attente « \[prénom\] prépare l'affiche… » avec les fauteuils ; puis « Gardes-en 3 » ; puis, chez le proposeur, « Le film de vendredi ? » parmi les 3.
- **Étape 4 — La semaine** : tableau compact du Programme, déplacement de la carte blanche par glisser-déposer ; bouton « Valider la semaine ».
- **Fin** : un billet récapitulatif « Votre semaine est programmée » avec Notre série, la Grande séance, la carte blanche et la reprise du dimanche.

### 7.3 Billets (E10)

**Objectif** : garder la mémoire de vos séances, comme une boîte à talons de billets.

| Zone | Contenu | Spécification |
| --- | --- | --- |
| Notre série | Billet ligne avec progression et Prochainement | En tête |
| Talons | Liste chronologique groupée par mois : petit talon (titre, date, icône du chemin : séance prévue, changement d'affiche ou reprise) et l'avis du couple | Talons de 64 dp avec bord perforé à gauche |
| Reprises | Grille des reprises (affiches 2:3) ; ajouter ou retirer | 3 colonnes |
| Vos semaines | Petite courbe des deux notes hebdomadaires sur 8 semaines, un trait par prénom | Aucune statistique d'équité ni de « qui a choisi le plus » |

### 7.4 Réglages (E11)

Liste groupée, en mode Hall, chaque ligne de 56 dp :

- **Le foyer** : vos deux prénoms et leurs initiales (pour les fauteuils), inviter, membres.
- **Abonnements** : grille de logos des plateformes, à cocher.
- **Semaine type** : 7 lignes éditables (créneau par défaut de chaque soir) ; carte blanche toutes les deux semaines par personne.
- **Séances** : épisodes par soir en semaine (2) et le week-end ; durée de Changer d'affiche (3 min) ; Le quart d'heure (15 min).
- **La salle** : heure d'allumage du mode Salle (20 h), ou Toujours / Jamais / Selon le téléphone.
- **Notifications** : La programmation, Titres à noter, Le quart d'heure, Votes de Changer d'affiche — chacune activable.
- **Données** : exporter, supprimer le foyer (double confirmation, texte explicite sur ce qui sera effacé).
- **À propos** : logotype, version (« Version 1.4.0 »), logo TMDB avec la mention obligatoire, crédit JustWatch.

### 7.5 Première séance (E12)

**Objectif** : installer l'application à deux en environ 15 minutes et repartir avec une semaine prête.

| Étape | Écran | Détails |
| --- | --- | --- |
| 1 | Accueil | Symbole des deux fauteuils, logotype, « Deux places pour ce soir. » ; bouton « Commencer » |
| 2 | Ton prénom, puis inviter l'autre | Lien d'invitation partagé via le menu Partager d'Android ; écran d'attente avec un fauteuil éclairé et l'autre vide, qui s'éclaire à son arrivée |
| 3 | Vos abonnements | Grille de logos à cocher, à deux |
| 4 | Vos reprises | Grille d'affiches pré-cochées (Friends, Modern Family, The Big Bang Theory, Le Labyrinthe) ; ajouter d'autres |
| 5 | Tes goûts (chacun de son côté) | « 5 titres que tu adores », « 5 titres que tu ne veux plus jamais voir » ; mention « \[prénom\] ne verra pas ces listes » |
| 6 | Les premières affiches | Le parcours À noter sur 20 à 30 suggestions |
| 7 | Votre première séance | Choisir Notre série et Prochainement parmi les titres prêts ; valider la semaine type ; animation « la lumière baisse » et « Votre première séance est prête. » |

Chaque étape peut être reprise plus tard ; un indicateur montre ce qui reste à faire chez l'autre.

## 8. Accessibilité et contrôle qualité du design

Chaque écran doit passer cette liste avant d'être considéré comme terminé ; elle traduit les choix des sections précédentes en vérifications concrètes.

- [ ] **Contraste** : texte courant ≥ 4,5:1 et éléments graphiques porteurs de sens ≥ 3:1 dans les deux modes, vérifié sur la surface réelle (Salle, surface-1, surface-2), pas sur le noir.
- [ ] **Cibles tactiles** : 48 dp minimum pour toute action ; espacement suffisant entre les boutons de note et de vote.
- [ ] **Un seul bouton principal** par écran ; en mode Salle, un seul élément en lueur.
- [ ] **Couleur jamais seule** : chaque état (OK, Non merci, prêt, écarté) a un libellé ou une icône.
- [ ] **Texte agrandi à 200 %** : aucun texte tronqué sur les billets, les cartes et les boutons ; défilement interne si nécessaire.
- [ ] **Lecteur d'écran** : ordre de lecture logique, billet annoncé en une phrase, fauteuils annoncés en clair, aucune annonce répétitive du compte à rebours.
- [ ] **Réduire les animations** respecté : fondus de 150 ms à la place de « la lumière baisse » et des glissements.
- [ ] **Mode Salle** : affiches voilées, aucune grande surface claire, aucun élément animé en boucle, aucune suggestion supplémentaire.
- [ ] **Ton** : relecture de tous les libellés ; aucun mot d'échec, de retard ou de dette ; prénoms partout ; un seul clin d'œil de cinéma par écran.
- [ ] **Équité visuelle** : les deux prénoms et fauteuils ont exactement la même taille et la même place relative selon l'appareil.
- [ ] **Attributions** : logo et mention TMDB dans À propos ; « Données JustWatch » sous chaque bloc de disponibilité.
- [ ] **Hors ligne** : Ce soir, la Réserve et les affiches restent lisibles ; les actions mises en file sont signalées discrètement.
- [ ] **Deux Places ne répond pas** : ce qui est en cache reste lisible ; sans cache, la phrase et « Réessayer » prennent la place de la donnée ; aucun code, aucun rouge ; tout revient sans action dès que le serveur répond (4.1).
- [ ] **Test au lit** : chaque version testée le soir, lumière éteinte, luminosité automatique du téléphone, par les deux utilisateurs.

**Livrables de design recommandés ensuite** : une maquette haute fidélité des 3 écrans du soir dans les deux modes, puis un prototype cliquable du parcours « Ce soir → Changer d'affiche → C'est réservé » à tester tous les deux avant de coder l'interface.

## Sources

Ce document prolonge la [spécification de l'outil](https://claude.ai/artifact/GNg7aC7e9azSr2LLaedCow), elle-même fondée sur [la solution](https://claude.ai/artifact/8HUzwYLFpHDawTf6EzmGDh) et [l'état des lieux](https://claude.ai/artifact/59rRBgPF4miehb7q14yUct).

Naming

- Méthode et critères d'évaluation des noms — [Igor](https://www.igorinternational.com/llms.txt) ; « fiche de poste » du nom — [Igor](https://igorinternational.com/press/whats-in-a-name.php)
- Application « Veilleuse » existante — [F-Droid](https://f-droid.org/packages/io.github.pic38.veilleuse/)
- « La Lucarne » d'Arte — [Centre Pompidou](https://www.centrepompidou.fr/en/ressources/media/0LGAnWp) ; [Cineuropa](https://cineuropa.org/prodcompany/314721)

Design et accessibilité

- Thèmes sombres : éviter le noir pur, désaturer, contraste AA sur toutes les surfaces — [Material Design](https://m2.material.io/design/color/dark-theme)
- Tailles de cibles tactiles : 24 × 24 px (WCAG 2.2 AA), 48 dp (Android) — [ezud](https://ezud.com/touch-target-sizes-mobile-accessibility/) ; [Deque](https://dequeuniversity.com/rules/axe/4.8/target-size)
- Luminosité de l'écran et sommeil — [TechRadar](https://techradar.com/news/smartphone-night-modes-may-not-actually-help-you-sleep-say-scientists) ; [Futura Sciences](https://www.futura-sciences.com/en/?p=900343)
- Ratios de contraste : calculés pour ce document avec la formule de luminance relative WCAG 2.x.
