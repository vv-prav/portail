# CLAUDE.md — Le Salon

Ce fichier donne à Claude Code tout le contexte nécessaire pour reprendre ce projet sans avoir à le redécouvrir. Il a été écrit après une très longue session de développement conversationnel (Claude.ai) portant sur ce dépôt — tout ce qui suit a été vérifié directement dans les fichiers au moment de l'écriture, pas seulement recopié de mémoire.

## Vue d'ensemble

**Le Salon** est un portail personnel : un seul serveur Node/Express qui héberge une dizaine de mini-apps (jeux multijoueurs, jeux du jour, outils de voyage/recettes) derrière une **authentification unique partagée**. Se connecter une fois donne accès à tout, sur le même domaine.

- Dépôt : `vv-prav/portail`
- Déployé sur Render : `https://portail-y56r.onrender.com`
- Un seul process Node, un seul `server.js` de 1800+ lignes qui monte toutes les routes et attache tous les modules de jeu.

## Stack technique

```json
"dependencies": {
    "express": "^5.2.1",
    "compression": "^1.7.5",
    "socket.io": "^4.8.3",
    "@upstash/redis": "^1.34.0"
}
```

- **Aucun système de build.** Pas de webpack/vite/bundler. Chaque page HTML charge ses scripts et styles via de simples balises `<link>`/`<script>`. Le JS est écrit en ES2020+ vanilla, directement exécutable par le navigateur.
- **Socket.io** pour tout ce qui est temps réel (les jeux multijoueurs).
- **Redis (Upstash)** en production pour la persistance ; **fichier JSON local** en repli pour le développement (voir plus bas).

### Lancer en local

```bash
npm install
npm start   # → http://localhost:3000
```

Sans variables Redis configurées, les comptes sont stockés dans `users.json` à la racine (auto-créé, jamais commité — voir `.gitignore`).

### Variables d'environnement

| Variable | Rôle |
|---|---|
| `SESSION_SECRET` | Signe les cookies de session (HMAC). Mettre une vraie valeur aléatoire en prod. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Active Redis. **Indispensable en prod** : le disque de Render est éphémère, sans Redis tout est perdu à chaque redéploiement. |
| `ADMIN_USERS` | Liste de pseudos séparés par virgules ayant accès à `/admin`. Par défaut : `Viper la Voile Noire,VicoW`. |
| `NODE_ENV=production` | Active le cookie de session en mode `Secure`. |
| `PORT` | Port d'écoute (Render le fournit automatiquement). |

## Architecture des données

Deux systèmes de stockage coexistent :

1. **Les comptes utilisateurs** (`registeredUsers`, objet en mémoire) — persistés directement en JSON (fichier local ou clé Redis unique `portail_users`), sauvegarde immédiate ou différée selon `saveUsers(immediate)`.
2. **Le cache par clés** (`mfCache`, malgré son nom historique « mf » il sert TOUT le reste du site — Motus, Le Mot Juste, Yams, Motus Party, Petit Bac, l'historique admin...) — un cache mémoire avec écriture différée (`mfSchedule` / `mfFlush`, 1.2s de debounce) qui n'écrit dans Redis que les clés modifiées, jamais tout le jeu de données d'un coup. Convention de nommage des clés : `<app>:<type>:<user>:<date>` (ex. `motus:prog:Alice:2026-08-01`, `yams:stats:Bob`).

**Piège à connaître** : n'importe quel module qui a besoin de lire/écrire une donnée persistante reçoit `{ get: mfGet, set: mfSet }` en dépendance depuis `server.js` — jamais d'accès direct à Redis depuis un module de jeu.

⚠️ **Le piège qui a coûté le plus cher : l'écriture et la lecture n'avaient pas la même portée.** `mfFlush()` envoie dans Redis **toute** clé modifiée, sans filtre. `loadMf()`, lui, ne relisait au démarrage qu'une liste blanche de familles (`mf:*`, `motus:*`, `mj:*`, `pbac:*`, `rec:*`, `voyages:*`). Tout ce qui n'y figurait pas était donc écrit puis jamais relu : à chaque redémarrage, l'appli repartait de zéro dessus **et réécrivait par-dessus les vraies valeurs**. Étaient concernés `yams:*` (toutes les statistiques du Yams), `motusparty:stats`, `titres:manuels` (les titres attribués à la main) et `admin:gameHistory` (dont dépend le classement de saison).

Le défaut ne se voyait **qu'en production** : en développement, `mf_data.json` est relu en entier, donc tous les tests locaux passaient. Sur Render, qui met le service en veille au bout de quelques minutes d'inactivité, il se manifestait comme « les données se réinitialisent une heure après avoir joué ».

La liste est désormais **inversée** : on charge `redis.keys('*')` moins les deux clés qui appartiennent à quelqu'un d'autre (`portail_users`, les comptes du salon ; `users`, les profils Perudo). Un jeu ajouté demain est donc persisté correctement sans que personne ait à y penser — c'est exactement l'oubli qui a produit ce bug. **Ne jamais revenir à une liste blanche ici.**

## Authentification

- `POST /api/register` / `POST /api/login` → cookie de session signé HMAC, `httpOnly`.
- Code de récupération à l'inscription (`POST /api/new-code` pour en régénérer un).
- `requireAuth` (pages) et `requireAuthApi` (API) sont les deux middlewares de garde ; ils mettent aussi à jour discrètement `user.lastSeen` (respectivement toutes les ~5 min pour les pages, ~30s pour les appels API) — c'est ce qui alimente le statut « en ligne » du salon.
- `requireAdmin` protège tout `/admin` et `/api/admin/*`.
- **Quand le code de récupération est perdu lui aussi.** Il n'est montré qu'une fois, à l'inscription, et presque personne ne le garde : « Mot de passe oublié » était alors un cul-de-sac. Le chemin de secours s'appuie sur le fait que tout le monde se connaît ici — c'est un humain qui reconnaît la personne, pas un courriel (aucune adresse n'est collectée).
  1. `POST /api/aide-connexion` dépose une demande dans `comptes:demandes` (une seule en attente par personne). Un nom inconnu est **signalé franchement** : les pseudos s'affichent déjà dans tous les classements, donc les cacher ne protège rien, alors qu'une faute de frappe avalée en silence produirait une demande que personne ne verrait.
  2. L'administrateur voit la demande dans l'onglet Comptes et pose un mot de passe provisoire depuis la fiche, ce qui marque la demande traitée.
  3. Ce provisoire porte `doitChanger` et `tempExpire` (24 h). ⚠️ **Les deux sont indispensables** : quelqu'un d'autre l'a lu, donc il ne doit ni durer ni rester le mot de passe du compte. `doitChanger` est renvoyé par `/api/login` **et** par `/api/me`, sinon un simple rechargement de page suffirait à le contourner.
  4. `/api/account/change-password` lève les deux drapeaux et **délivre un code de récupération neuf** : celui qui vient d'être dépanné n'a par définition plus le sien.
- Changement de pseudo (`/api/account/rename`) et de mot de passe (`/api/account/change-password`). **Le renommage migre désormais les statistiques** : `comptes/renommage.js` planifie puis applique la migration (clés `<app>:<type>:<pseudo>` renommées, valeurs à champ `u` réécrites, index et `vsOpponent` suivis). Attention aux deux pièges que le module documente : Yams et Petit Bac indexent par pseudo **normalisé**, et `mf:hist:<date>` a une date au rang où les autres familles ont un pseudo.

## Arborescence complète

```
portail/
├── server.js                 ← point d'entrée, ~1800 lignes, monte tout
├── package.json
├── users.json                ← généré localement, jamais commité
├── scripts/verifie-demarrage.js ← garde-fou : `npm run verifie`
├── comptes/renommage.js       ← migration des données au changement de pseudo
├── comptes/classement.js      ← le classement transversal du Salon
├── comptes/titres.js          ← les titres et badges des joueurs
├── admin/routes.js            ← toutes les routes /api/admin/*
├── motjuste/{engine,words}.js
├── motsfleches/{dict,generator,words,words-extra}.js
├── motus/                     ← vocabulaire Motus (voir section dédiée)
├── motusparty/game.js
├── pbac/game.js
├── perudo/game.js
├── undercover/game.js
├── yams/game.js
├── defis/jeu.js               ← les défis : multijoueur sans rendez-vous (aucun socket)
└── public/
    ├── index.html / app.js / style.css     ← LE SALON (page d'accueil)
    ├── design-system.css / design-system.js ← voir section dédiée
    ├── profile-viewer.js                    ← bulle de profil partagée
    ├── invitation.js                        ← bouton « Inviter » + lien ?table=<id>
    ├── enchainement.js                      ← propose le jeu du jour suivant
    ├── vues.js                              ← le geste retour remonte d'une vue
    ├── jouer/                               ← l'espace multijoueurs commun
    ├── carnet/                              ← les sorties et les recettes réunies
    ├── sw.js                                ← service worker (cache hors-ligne)
    ├── admin/
    ├── defis/                              ← les défis (Motus + quiz, une seule page)
    ├── chance/
    ├── motjuste/
    ├── mots-fleches/
    ├── motus/
    │   ├── index.html + hub.css            ← hub à 2 entrées
    │   ├── party/                          ← Motus Party (multijoueur)
    │   └── quotidien/                      ← Motus du jour
    ├── pbac/
    ├── perudo/
    ├── profil/
    │   ├── index.html / app.js / style.css ← page profil
    │   └── style/                          ← page "Style des jeux" (dés, tuiles...)
    ├── recettes/
    ├── undercover/
    ├── voyages/
    │   ├── index.html + hub.css/hub.js     ← hub
    │   └── monts-arree/                    ← le seul voyage existant pour l'instant
    └── yams/
```

Chaque mini-app suit le même schéma : `public/<app>/index.html` + `app.js` + `style.css`, servis via `app.use('/<app>', requireAuth, express.static(...))` dans `server.js`. Les modules de jeu temps réel (`<app>/game.js` à la racine) sont attachés via `require('./<app>/game')(app, io, deps)` et retournent une petite API (`online()`, `games()`, `statsFor()`, `endGame()`) utilisée par l'admin.

## Les apps, une par une

### Jeux multijoueurs (temps réel, socket.io)

| App | Module serveur | Préfixe des événements socket | Notes |
|---|---|---|---|
| **Perudo** | `perudo/game.js` | (nombreux, pas de préfixe uniforme) | **Le plus mature et le plus complexe du site** — pas juste un jeu de dés : tournois, mode campagne (run/reliques façon roguelike), voix (WebRTC), spectateurs, cosmétiques, émotes. Sa propre identité visuelle complète (police « Pirata One », palette bois/or), **volontairement exclu du système de design partagé**. |
| **Petit Bac** | `pbac/game.js` | `pbac_*` | Vote séquentiel ou parallèle, packs de catégories personnalisés, catégorie surprise, podium animé par paliers. |
| **Infiltré** | `undercover/game.js` | `uc_*` | Mr Blanc, sous-groupes, mode à distance et mode local (un seul téléphone qui tourne). |
| **Yams** | `yams/game.js` | `yams_*` | **Un joueur absent ne bloque plus la table** : `advanceTurn` ne fait tourner que les joueurs présents (`joueurPresent`), la partie se termine quand tous les présents ont fini, et une déconnexion en pleine main passe le tour sur-le-champ. Minuteur de tour de 90 s (`TOUR_MAX_MS`), réarmé à chaque lancer ; deux expirations d'affilée et le joueur est marqué `parti` (feuille conservée, retour possible à tout moment). Numéro de tour, journal des derniers coups et jauge du bonus 63 côté client. **Chaque case libre affiche ce qu'elle rapporterait** au joueur qui a la main, zéros compris : le serveur envoyait déjà `possible` pour toutes les catégories, il fallait juste le montrer au lieu d'obliger à taper une case pour le découvrir. Code couleur : le laiton désigne ce qui se joue (aperçu en pointillés, meilleur coup en plein), le gris ce qui ne rapporte rien, la couleur du joueur ce qui est acquis, le vert le bonus atteint. Les couleurs de joueur ont été sorties du laiton et du vert, qu'elles imitaient (`#d98a4a` contre `#d9a94e`, `#5aa87a` égal à `--good`), et les sous-totaux ne sont plus en laiton. Une seule rangée est signalée — la meilleure — au lieu de treize animations en boucle simultanées. Skins de dés (47, catalogue repris de Perudo), bête noire, spectateurs, classement/historique/face-à-face. | **La feuille est une vraie grille** : une ligne par case, une colonne par joueur (`--joueurs` posée en JS). **À deux joueurs elle repasse en deux colonnes côte à côte** (classe `.double` sur `#feuille`) — 490 px au lieu de 823, tout tient d'un écran ; au-delà de deux, les cellules n'y entrent plus et on garde une seule colonne pleine largeur. Les icônes de chiffres sont des **dés au trait** de la même famille que les icônes de combinaison — avant, une moitié de la feuille montrait des dés réalistes en parchemin et l'autre des glyphes laiton plats, et le dé calé à 26 px débordait de sa case de 18. **L'aperçu ne désigne pas le meilleur coup** : il annonce ce que chaque case rapporterait, rien de plus, le choix reste au joueur. Les deux colonnes côte à côte d'avant ne laissaient que 160 px aux cellules, qui passaient à la ligne dès **trois** joueurs — 76 px par rangée au lieu de 30. L'en-tête de colonne (avatar, nom, total, cumul de série) remplace le bandeau de scores, qui répétait la même chose. **Aperçus décalés après le roulement des dés** (`masquerApercus`), sinon l'état arrivait avant l'animation et annonçait le résultat. **Égalité = personne ne gagne** (`gagnantsDe`) : l'ancien `winnerOf` donnait la victoire au premier inscrit, et cette fausse victoire entrait dans les stats, le face-à-face et l'historique. **Partie en solo** (`MIN_PLAYERS = 1`), qui ne compte ni victoire ni face-à-face. **Règle du joker** : la case Yams remplie, cinq dés identiques valent la valeur pleine de la case choisie (`scoresPossibles` sert l'aperçu **et** le score noté, ils ne doivent jamais diverger). **Son** en WebAudio synthétisé (aucun fichier, marche hors-ligne, coupable via `yams_son`). **Rappel de tour** : son, vibration et titre d'onglet clignotant. Série de revanches (`g.serie`), record du salon (`recordDuSalon`, cache 30 s), fin de partie avec faits marquants et feuille complète. Statistiques très élargies : une ligne par case (`parCategorie`), moyennes du salon comme point de repère, forces/faiblesses, nuls, séries, solo, face-à-face avec les dernières rencontres. Ces statistiques ressortent **partout** : carte du profil et bulle publique (11 lignes via `portraitJoueur`), « jeu le plus joué » du résumé (solo compris), classement du Salon, et trois titres uniques de plus (`mainchaude` meilleur score, `pluiededes` le plus de Yams, `invaincu` la plus longue série). ⚠️ `statsFor` renvoie désormais `duels` (liste) et non plus `vsOpponent` (objet) : le face-à-face de la bulle de profil lisait l'ancien champ et s'affichait vide.
| **Motus Party** | `motusparty/game.js` | `motusparty_*` | Course en temps réel : tout le monde devine le même mot, classé par ordre d'arrivée. Barème : 1er=10pts, 2e=7, 3e=5, 4e=3, 5e et + =1 si trouvé, 0 sinon. Saisie **directe dans la grille au clavier natif** (input invisible `#mp-shadow` qui suit la case active), **première lettre offerte** comme au Motus du jour — le serveur l'envoie via `firstLetter` dans `stateFor`. Bandeau de score du match pendant la course, repli de l'entête et des adversaires quand le clavier s'ouvre (`body.clavier-ouvert`). Réutilise le dictionnaire Motus (`motusPool`/`motusKnown` injectés depuis `server.js`). |
| **Les défis** | `defis/jeu.js` | (aucun — HTTP seulement) | **Le multijoueur qui n'exige pas d'être là en même temps.** Voir la section dédiée. |
| **Quiz des drapeaux** | `drapeaux/game.js` + `drapeaux/questions.js` | `drapeaux_*` | **1 à 10 joueurs, en simultané — surtout pas au tour par tour.** À dix, n'importe quelle structure au tour par tour donnerait 90 % de temps mort ; ici tout le monde répond à la même question en même temps et la vitesse départage. Conséquence structurelle : **une déconnexion ne bloque rien**, le joueur absent marque zéro sur ce qu'il rate. Le serveur mène la partie de bout en bout (ferme la question, montre la réponse, enchaîne) : rien n'attend un clic de l'hôte. Barème 100 pts + bonus de vitesse dégressif, **dernière question comptée double**. Partie en solo possible, qui ne compte ni victoire ni palmarès. Cinq types de question, réglages de l'hôte (10/15/20 questions, 8/12/20 s, trois difficultés). ⚠️ La bonne réponse n'est **jamais** envoyée avec la question : elle n'arrive qu'avec la correction. Réutilise `geo/pays.js` tel quel — aucune donnée nouvelle.

### Jeux du jour (un mot/une grille par jour, pas de temps réel)

| App | Notes |
|---|---|
| **Motus** | Restructuré en hub à 2 entrées (`/motus/` → « Motus du jour » et « Motus Party »). Le clavier à l'écran a été **retiré** : saisie exclusivement via le clavier natif du téléphone (input invisible qui suit la case active). Discussion du jour, archives, style des tuiles personnalisable (4 thèmes de couleur). | Le **chronomètre part au clic sur « Commencer »** (`POST /api/motus/start`, une seule fois — recharger ne le relance pas, les archives ne sont pas chronométrées) : à nombre d'essais égal, le classement du jour départage au temps. Les entrées d'avant le chronométrage n'ont pas de `ms` et se rangent après celles qui en ont, sans jamais être perdues.
| **Mots Fléchés** | Le plus ancien des jeux du jour, sert de référence pour le motif « saisie native ». Grilles générées (`motsfleches/generator.js`), dictionnaire avec niveaux de rareté. Voir la section dédiée : le stock de mots, la limite du générateur, et ce qui a été mesuré. |
| **Le Mot Juste** | Jeu façon Contexto/Cémantix (proximité sémantique, thermomètre). |
| **Le compte est bon** (`/chiffres`) | Six nombres, une cible, les quatre opérations — ni négatif ni fraction. **Aucun contenu à écrire** : la donne est tirée de la date, et un solveur exhaustif (`chiffres/jeu.js`) garantit que la cible est atteignable avant de la proposer. La solution affichée à la fin est la **plus courte**, obtenue par approfondissement progressif : sans ça la mémoïsation laissait passer un chemin qui repassait par 23 850 pour retomber sur 952, juste mais illisible. Le serveur rejoue les étapes au lieu de croire le total annoncé. Le chronomètre part au clic sur « Commencer ». |
| **Géographie** (`/geo`) | Deux modes dans un seul jeu du jour : **Le pays** (silhouette) et **Le drapeau**. Même mécanique dans les deux — six essais, et chaque proposition donne distance, direction et proximité, ce qui rend un pays méconnu trouvable par triangulation plutôt qu'au hasard, et rend surtout le mode Drapeau jouable. Les drapeaux sont des **emoji** : aucun fichier à servir, aucun droit à vérifier, et un rendu net sur téléphone. Voir la section dédiée pour la base de pays. |

### La base des pays (`geo/pays.js`) — comment elle a été faite

211 entrées générées **une fois** depuis Natural Earth 1:50m (paquet `world-atlas`), croisées avec les codes ISO 3166-1, la souveraineté et les frontières de `world-countries`, et les noms français d'`Intl.DisplayNames`. Le fichier est autonome : aucune dépendance ne subsiste à l'exécution, et **il ne quitte jamais le serveur** — le navigateur ne reçoit que la silhouette du jour et la liste des 211 noms.

Les silhouettes sont projetées en **azimutale équivalente centrée sur chaque pays**, la seule projection qui donne une forme fidèle : en Mercator le Groenland ferait la taille de l'Afrique.

⚠️ **Deux filtres, tous deux indispensables, tous deux trouvés en regardant les résultats — pas en raisonnant.** Un pays n'est pas toujours d'un seul tenant, et ses bouts lointains ruinent soit son centre, soit son cadrage :
1. les morceaux de moins de 1 % ne peuvent pas relier deux ensembles, et seul l'ensemble le plus étendu est gardé. Sans ça, la Guyane emmenait le centre de la France dans l'Atlantique (46,5 / 2,6 est le bon, ‑6,7 était l'ancien) et l'Alaska écrasait les États-Unis ;
2. ce qui reste petit devant le morceau principal **et** nettement à l'écart s'en va. Les Açores et Madère réduisaient le Portugal à une écharde dans un coin du cadre ; les Galápagos faisaient pareil à l'Équateur alors qu'elles pèsent 3 %, donc le seul critère de surface ne suffisait pas. La Sicile et Hokkaidō, proches ou gros, restent.

21 membres de l'ONU sont trop petits pour une silhouette lisible (Singapour, Malte, Monaco…) : ils sont gardés **sans tracé**, ne sortent qu'au mode Drapeau, et restent proposables comme réponse dans les deux modes. Les entités sans code ISO (Somaliland, Kosovo, Chypre du Nord) sont absentes — un jeu du jour n'a pas à trancher des différends de souveraineté.

⚠️ **Deux surfaces, deux usages.** `aire` est celle de la silhouette **dessinée** (le morceau principal) : elle sert au cadrage et à la pondération du tirage. `aireReelle` est la superficie officielle du pays entier : c'est la **seule** à utiliser dans une question posée au joueur. Le quiz des drapeaux affirmait sinon que la Pologne est plus vaste que la Norvège, dont le Svalbard est absent du tracé.

### La fabrique de questions du quiz (`drapeaux/questions.js`)

Séparée du module de jeu parce qu'un quiz ne vaut que par ses **mauvaises** réponses, et que ça se teste sans socket. 🇧🇷 face à Népal, Fidji et Tchad, c'est offert ; face à Colombie, Argentine et Portugal, il faut savoir. Les leurres sont donc pris d'abord parmi les **pays frontaliers** (les confusions naturelles), puis parmi ceux de la **même région** — chaque région compte au moins quatorze pays, donc le repli au hasard ne sert jamais.

Le niveau « Faciles » s'appuie sur une **liste de pays notoires écrite à la main**, un choix assumé : la superficie est un mauvais juge de notoriété, elle place le Zimbabwe et la Namibie dans les soixante premiers et laisse la Suisse et les Pays-Bas loin derrière. C'est le seul contenu de tout le jeu qui ne soit pas dérivé des données.

Pour « lequel est le plus vaste », prendre une fenêtre glissante dans le classement des surfaces **ne marche pas** : les seuls écarts francs sont tout en haut, et la réponse était l'Australie sept fois sur dix. On part du bon pays et on cherche trois leurres entre 22 % et 74 % de sa surface — 130 pays différents sortent alors en réponse, et jamais d'écart si serré que la question devienne un pile ou face.

**Pour régénérer**, reprendre la méthode : `npm i world-atlas topojson-client topojson-simplify d3-geo i18n-iso-countries world-countries` dans un dossier jetable, et vérifier le résultat **à l'œil sur une planche de silhouettes** avant de le committer. C'est le seul test qui compte ici, et c'est lui qui a révélé les deux filtres ci-dessus.

### Vocabulaire Motus — attention en cas d'ajout futur

Tous les lots de vocabulaire sont déclarés dans **un seul tableau `MOTUS_EXTRA`** en haut de la section Motus de `server.js`, rangés par longueur. `motusPool()` (tirage du mot du jour) et `motusKnown()` (validation des tentatives) lisent tous les deux ce tableau : **pour ajouter une vague, une seule ligne suffit**. Avant, les deux fonctions énuméraient les lots à la main chacune de leur côté et avaient fini par diverger — certains lots étaient tirables mais refusés comme tentative, ce qui rendait le mot du jour intapable.

Chaque vague suit la même méthode : extraction par fréquence d'usage réelle (`wordfreq`, Python), vérification orthographique (`hunspell fr_FR`), dédoublonnage. `motusPool()` dédoublonne aussi **entre les lots**, pas seulement contre le dictionnaire.

Total actuel : **11 249 mots tirables uniques** (4 lettres : 1025, 5 : 3595, 6 : 3615, 7 : 3014) et **18 910 mots acceptés en tentative**.

### La source de référence : Lexique383

`motus/lexique-tirables.js` et `motus/lexique-acceptes.js` sont générés depuis **Lexique383** (lexique.org), la base lexicale universitaire du français, croisée avec les fréquences d'usage réelles de `wordfreq`. C'est la méthode à reprendre pour toute vague future, parce qu'elle règle trois problèmes d'un coup :

- **Catégories grammaticales** : on ne garde que noms, adjectifs, adverbes, infinitifs et participes passés. Exit les mots grammaticaux (ELLE, COMME, QUAND) et les conjugaisons bancales (FASSIEZ, ENTRONS) que remontait `wordfreq` seul.
- **Noms propres** : Lexique383 n'en contient pas. Vérifié — *france*, *paul*, *calgary*, *coluche*, *apple*, *cedex* sont tous absents.
- **Deux niveaux** : au-dessus d'une fréquence Lexique de 2, le mot est *tirable* comme mot du jour ; entre 0.2 et 2, il est seulement *accepté* en tentative. De vrais mots trop rares pour être devinables en 6 essais (ABBESSE, ABYSSAL, ADAGIO) ne bloquent donc jamais un joueur sans pour autant tomber un matin.

Une petite liste de mots vulgaires est écartée du **tirage** seulement — ils restent acceptés si quelqu'un les propose.

⚠️ Une note antérieure annonçait 10932 mots et une dizaine de fichiers de vocabulaire. C'était faux : 7 fichiers (`words4-extra`, `words5-extra2`, `words6-extra2`, `words6-extra3`, `words7-extra`, `words7-extra2`, `words7-extra3`) étaient importés par `server.js` mais **n'ont jamais existé dans le dépôt** — ils bloquaient le démarrage du serveur (`MODULE_NOT_FOUND`) et donc tout déploiement. Ils ont été retirés. S'ils réapparaissent un jour, il suffit de les rajouter dans `MOTUS_EXTRA`.

### Autres

- **Chance** — dé/carte/pièce, purement statique, aucun état serveur.
- **Recettes** — CRUD de recettes personnelles (`/api/rec/*`). **Jamais migré vers le système de design** — chantier en attente, prochain sur la liste.
- **Voyages** — hub + une page dédiée par voyage (actuellement un seul : Monts d'Arrée). **Volontairement exclu** du système de design (identité très personnalisée, décision explicite prise avec l'utilisateur).
- **Admin** (`/admin`) — tableau de bord complet : vue d'ensemble, comptes, un panneau par jeu multijoueur (Perudo, Petit Bac, Infiltré, Yams, Motus Party), grilles/dictionnaire des mots fléchés, système (sauvegarde JSON, purge, administrateurs). Recherche transversale (comptes + historique des parties) depuis l'accueil. Le bouton **« Tirer un nouveau mot »** de l'onglet Motus fait vraiment changer le mot du jour : le tirage étant déterministe sur la date (`motusHashSeed('motus|' + date)`), supprimer la clé ne suffisait pas — un compteur `motus:variante:<date>` décale la graine, et la route insiste jusqu'à obtenir un mot différent. À zéro, la graine est identique à l'ancienne : **aucune date passée ne change de mot**. `motusWord()` et `motusWordPreview()` lisent la même graine, sinon l'aperçu « Mots à venir » annoncerait autre chose que ce qui sera tiré. ⚠️ Le Mot Juste a exactement le même défaut sur son propre bouton (`mjPickWord`, graine `'motjuste|' + date`), pas encore corrigé.
  - ⚠️ **La journée du salon commence à minuit à PARIS.** L'admin la calculait avec `new Date().toISOString()`, c'est-à-dire en UTC : entre minuit et deux heures du matin il ouvrait donc sur la veille, et le mot du Motus « ne changeait pas ». `dateDuSalon()` dans `public/admin/app.js` reprend la formule de `mfDayId()` — à ne pas laisser diverger.
  - **Panneaux par jeu du jour** : Motus, Mots Fléchés, Le Mot Juste, Le compte est bon et Géographie (deux modes) ont chacun contenu du jour, statistiques observées, modération du classement et bouton de régénération. **Les trois boutons de régénération reposent sur un compteur `<app>:variante:<date>`** : le tirage étant déterministe sur la date, supprimer la clé ne suffit pas — c'est le même piège corrigé trois fois.
  - **Suppression d'un compte** : `supprimerDonneesJoueur()` balaie tout le cache — clés propres (dont les pseudos **normalisés** du Yams et du Petit Bac), lignes de classement, index de statistiques, historique des parties, `vsOpponent` des adversaires et titres manuels. L'ancienne version ne nettoyait que les Mots Fléchés.
  - **Fusion de comptes** : déplace les clés de la source vers la cible, conserve ce qui existe déjà chez la cible plutôt que de l'écraser, et **dédoublonne les classements** — sinon la cible y figurait deux fois le même jour.
  - **Restauration** d'une sauvegarde (`/restore`), **mode maintenance** (bloque `requireAuth` sauf pour les administrateurs), **modération des fiches multijoueur** (`/stats/reset`), suppression d'une ligne d'historique, **fréquentation** sur 30 jours avec comptes endormis, journal filtrable côté serveur, alerte quand Redis est absent, et poids des données par famille avec repérage des clés mortes.
- **Profil** (`/profil`) — page dédiée (plus un popup) : avatar/photo, résumé transversal, actions de compte, statistiques par jeu en onglets. Sous-page `/profil/style/` qui centralise **tous** les réglages de style personnalisables de tous les jeux (actuellement : thème de tuiles Motus, skin de dés Yams) — **conçue pour être étendue à chaque nouveau jeu personnalisable**, structure en tableau de config en haut du fichier, bien commentée pour ça.

## Le système de design partagé

Deux fichiers à la racine de `public/`, servis à n'importe quelle app via un chemin absolu (`app.use(express.static('public'))` sans garde d'auth dessus — les fichiers eux-mêmes sont publics, seules les données qu'ils font transiter passent par des routes protégées) :

### `public/design-system.css`

Variables de couleur (`--ink`, `--brass`, `--parchment`...), typographie, échelle d'espacements, et des classes de composants réutilisables : `.ds-back` (bouton retour), `.ds-btn` (+ `.ghost`/`.danger`/`.small`), `.ds-overlay`/`.ds-card`/`.ds-card-close` (popups avec fermeture **toujours** en haut à droite, jamais en bas), `.ds-stat-card`/`.ds-stat-grid`/`.ds-stat-box`, `.ds-row` (+ `.static`) pour les listes cliquables, `.ds-waiting-list`/`.ds-waiting-chip` pour les salles d'attente, `.ds-lb-row` pour les classements, `.ds-input`/`.ds-field-error`, `.ds-segmented` pour les sélecteurs à onglets, `.ds-toast`, `.ds-badge`, `.ds-chip`, `.ds-avatar` (5 tailles : xs/sm/md/lg/xl).

⚠️ **Le piège des overlays** : la règle `.ds-overlay:not([hidden])` rend visible *tout* overlay qui ne porte pas l'attribut `hidden`. Un overlay créé en JS sans `hidden` est donc affiché en permanence — un voile plein écran qui intercepte tous les clics de la page, sans que rien ne le signale. C'est ce qui rendait chaque popup de `DS.confirm` impossible à fermer : `closeConfirm()` ne retirait que la classe `.on`. Tout overlay créé en JS doit naître `hidden` ; `design-system.js` verrouille en plus au chargement ceux qui n'ont ni `hidden` ni `.on`.

⚠️ **Ne jamais transitionner `visibility`** sur un overlay ni sur quoi que ce soit qui couvre l'écran. Transitionnée, elle reste à `visible` pendant toute la durée de l'animation — et si celle-ci ne tourne pas (onglet en arrière-plan, animation interrompue), l'élément reste peint. Seule l'opacité est animée ; `visibility` bascule immédiatement, ce qui garantit la disparition tout en gardant le fondu à l'ouverture.

⚠️ **Tout élément qui couvre l'écran sans être interactif prend `pointer-events:none`** : la célébration du Yams ne l'avait pas (contrairement à celle de Motus Party) et avalait les clics pendant ses 3 secondes ; le toast, à z-index 1200 en bas au centre, se posait pile sur le bouton « Lancer les dés ».

### `public/design-system.js`

S'auto-injecte dans la page (crée son propre DOM, pas besoin d'ajouter le moindre HTML). Expose `window.DS` :

- `DS.toast(message)`
- `DS.confirm({ emoji, title, text, actions: [{label, danger, run}], code, confirmText, cancelLabel, closeIcon })` — `code` affiche un encadré (ex. montrer un mot de passe temporaire généré), `confirmText` force à retaper un texte exact avant d'activer le bouton (actions dangereuses). `closeIcon: false` retire la croix pour une popup purement informative, où le bouton du bas suffit. Un bouton Annuler est toujours ajouté automatiquement si l'appelant n'en a pas prévu.
- `DS.avatarHTML(avatarData, size)`

### `public/invitation.js`

S'auto-injecte lui aussi. Les quatre jeux multijoueurs partagent `#v-waiting` et `#wait-players`, donc le bouton « Inviter » se place seul sous la liste des joueurs — aucune app n'a de HTML à ajouter. Expose `Invitation.tableDuLien()` (l'id présent dans `?table=`), `Invitation.definirTable(id)` et `Invitation.effacer()`. Le paramètre d'URL est retiré une fois la table rejointe, sinon un rechargement après avoir quitté la table la rejoindrait en boucle.

### `public/profile-viewer.js`

Système séparé (avant le design system, mais du même esprit) : `PortailProfile.fetchAvatars([pseudos])`, `PortailProfile.bubbleHTML(avatarData)`, `PortailProfile.open(pseudo)` (ouvre un profil public en lecture seule, alimenté par `GET /api/public-profile`, qui ne renvoie **jamais** rien de sensible).

### Apps migrées vers le design system (vérifié au moment de l'écriture)

✅ Admin · ✅ Le Mot Juste · ✅ Mots Fléchés · ✅ Hub Motus · ✅ Motus du jour · ✅ Motus Party · ✅ Petit Bac · ✅ Infiltré · ✅ Yams · ✅ Le salon (`public/index.html`)

Le design system porte désormais la **réinitialisation de base** (`box-sizing`, `-webkit-tap-highlight-color`, `::selection`) et une règle `:focus-visible` unique. Elles étaient auparavant recopiées dans 18 fichiers CSS.

⚠️ **Perudo et Voyages ne chargent pas `design-system.css`** : ils gardent leur propre réinitialisation, ne la leur retirez pas — la largeur de tous leurs éléments à padding en dépend.

✅ Profil et sa sous-page Style — migrés (toasts délégués à `DS.toast()`, popups en `.ds-overlay`/`.ds-card` avec fermeture en ✕, onglets en `.ds-segmented`, grilles de stats en `.ds-stat-grid`).
❌ Recettes — pas commencé, et volontairement repoussé : zéro donnée en base, l'app n'a jamais servi.
❌ Chance — jamais dans le plan de migration (petite page statique).
🚫 Perudo et Voyages — **exclusion volontaire et définitive**, pas des oublis. Chacun a sa propre identité visuelle forte qui serait appauvrie par le système commun.

### Méthode de migration établie (à réutiliser pour Recettes)

1. Lire entièrement les 3 fichiers de l'app avant de toucher quoi que ce soit.
2. Vérifier le nombre de colonnes des grilles de stats existantes avant de basculer vers `.ds-stat-grid` (certaines sont à 2 colonnes, la classe par défaut en fait 3 — utiliser `.ds-stat-grid.cols2` si besoin).
3. Migrer `toast()` et une éventuelle confirmation maison (`ask()`) pour qu'ils délèguent à `DS.toast()`/`DS.confirm()` plutôt que dupliquer.
4. Repérer si des titres de popup utilisent une police spéciale (Fraunces) via leur classe — **toujours garder cette classe en plus** de `.ds-card-title`, sinon la police festive disparaît silencieusement.
5. **Piège du fond de bouton** : transformer un `<span>` en `<button>` lui donne le fond gris clair du navigateur. Si aucune règle ne déclare de fond (c'était le cas de `.pv-titre` et `.pr-titre`, dont seules les variantes `.unique`/`.rare` en avaient un), le texte prévu pour un fond sombre devient illisible sur du blanc — et rien dans le CSS ne le signale. Poser `background:transparent; appearance:none`.
6. **Piège `all:unset`** : si un ancien bouton-bulle d'avatar utilisait `all:unset` pour se réinitialiser, le combiner avec `.ds-avatar` efface le style de la bulle. Utiliser une réinitialisation ciblée (`border:none; padding:0; background:...`) à la place.
7. Nettoyer le CSS mort après coup — **ne jamais faire ça ligne par ligne** (un script naïf qui retire la ligne du sélecteur sans suivre les accolades sur plusieurs lignes casse le fichier, vécu sur Yams). Utiliser un vrai parseur de blocs qui compte les accolades et retire des règles entières, en traitant `@media`/`@keyframes` comme des blocs opaques à ne jamais découper.
8. **Toujours revérifier à la main après le nettoyage automatique** : les sélecteurs combinés (`.ancienne-classe.modificateur`) et les sélecteurs descendants (`.parent-vivant .ancienne-classe`) ne sont jamais détectés par un script qui ne regarde qu'un sélecteur isolé — chercher chaque ancienne classe individuellement dans le fichier final.
9. Vérifier qu'aucun bouton "Fermer" texte ne subsiste (`grep -n "Fermer"`) — tous doivent être devenus des `.ds-card-close` en ✕, toujours en haut à droite.
10. Vérification croisée finale : tous les `id` référencés en JS existent en HTML, toutes les classes générées dynamiquement ont une règle CSS quelque part (design-system.css ou le style.css local).

## Les parcours

L'accueil ne porte plus que **2 tuiles** (Jouer ensemble, Le carnet, plus Admin), contre 13 auparavant. Historique de la réduction — l'ancien état à **4 tuiles** était :

- **Les trois jeux du jour n'ont plus de tuile.** Le panneau « Aujourd'hui » est leur seule porte, et le geste quotidien coûte une touche au lieu de trois. `/motus/` (l'ancien hub à deux liens) redirige vers `/motus/quotidien/` — on ne supprime pas, des liens et des favoris pointent dessus.
- **Les cinq jeux multijoueurs partagent `/jouer/`.** Un bouton crée une partie via un catalogue, qui mène au jeu choisi avec `?creer=1` ; le jeu ouvre alors son propre écran de réglages. En dessous, `GET /api/salon/tables` agrège toutes les tables ouvertes, tous jeux confondus — avant, il fallait ouvrir les quatre jeux l'un après l'autre pour savoir si quelqu'un attendait.
- **Perudo est volontairement traité à part** : il figure au catalogue et dans la liste, mais le clic ouvre son propre hall, avec son identité.
- **Le retour suit la hiérarchie** : les salles d'attente ramènent à `/jouer/`, les jeux du jour au salon. Et `vues.js` fait remonter le geste retour du téléphone d'une vue au lieu de quitter le site.

⚠️ Piège rencontré : `loadTileOrder()` écartait Voyages et Recettes de `rest` puis ne les réajoutait que s'ils étaient déjà dans `order` — ils disparaissaient donc de la grille pour qui n'avait jamais réorganisé ses tuiles. Le bug était masqué par les ordres sauvegardés dans les navigateurs.

Depuis, trois regroupements de plus :

- **Chance a rejoint le catalogue de `/jouer/`**, dans une famille « à un seul téléphone » qui ouvre aussi directement le mode local d'Infiltré (`?local=1`) — un jeu complet jusqu'ici enterré dans un hall conçu pour le distanciel.
- **Le carnet** (`/carnet/`) réunit les sorties et les recettes : deux apps qui ne sont pas des jeux mais des notes sur la vie du cercle, trop maigres chacune pour justifier sa tuile. Les photos de recettes restent à faire — elles demandent un stockage externe, pas Redis.
- **L'admin** perd ses quatre onglets par jeu identiques au profit de deux vues : *Parties* (toutes les tables, via `/api/admin/parties`) et *Santé* (Redis, mémoire, clés par famille, journal).

## « Jouer ensemble » — et le problème que cette page ne pouvait pas résoudre seule

Le hall (`/jouer/`) répond bien aux deux questions qu'on se pose — qui joue, et sinon quoi lancer. Sauf que **la réponse était presque toujours « personne »** : Motus du jour compte 186 clés de statistiques, Yams 5 et Motus Party 2. Ce n'est pas un défaut d'interface, c'est que le temps réel exige que deux personnes ouvrent l'appli à la même minute, et qu'entre gens qui ont une vie ça n'arrive pas tout seul.

Quatre réponses ont donc été ajoutées, dont **trois ne demandent pas la simultanéité** :

- **Les défis** (`defis/jeu.js`, `/defis/`) — voir la section dédiée. C'est la réponse de fond.
- **Les rendez-vous** (`salon:rdv`) — « je lance un Petit Bac ce soir à 21 h », les autres s'inscrivent. On fabrique la coïncidence au lieu de l'espérer. Un rendez-vous **ne crée aucune table** : à l'heure dite, l'hôte ouvre une partie normalement. Réserver une table d'avance obligerait à la garder ouverte des heures, et le ramasseur de tables fantômes la fermerait — deux mécanismes qui se contrediraient.
- **Les invitations** (`salon:invitations`, 15 min de vie) — le hall savait qui était là **et** ce qui était ouvert, il ne reliait simplement pas les deux : toucher quelqu'un ouvrait sa fiche de statistiques.
- **La mémoire** — un salon vide rappelle la dernière partie (`admin:gameHistory`, jusqu'ici enfermé dans l'admin) avec un bouton *Relancer*. « Aucune table ouverte » était une impasse.

⚠️ **Tout ça ne sert à rien dans le hall.** Les jeux du jour font 90 % du passage ; `/jouer/` est une pièce devant laquelle personne ne marche. L'annonce doit donc aller **là où sont les gens** : le bloc « ce qui t'attend » de l'accueil (`renderAppels`, alimenté par `tablesOuvertes` / `rendezvous` / `invitations` / `defis` du pouls) et la fin de chaque jeu du jour (`Enchainement.annonceDe`, qui passe **avant** le jeu du jour suivant — une table attend du monde maintenant, la grille de demain attendra).

### Les pièges corrigés au passage

⚠️ **`JEUX_MULTI` est la seule liste des jeux multijoueurs, et tout doit passer par elle.** Les jeux étaient énumérés à la main à trois endroits (le pouls, `snapshotActiveGames`, la liste des tables) : le quiz des drapeaux manquait dans deux, Motus Party dans un. Conséquence : jouer aux drapeaux n'apparaissait nulle part sur l'accueil et **aucune de ces parties n'entrait dans `admin:gameHistory`**, donc aucune ne comptait au classement de saison. `toutesLesTables()` / `tablesDuJeu()` / `limitesDuJeu()` sont désormais les seuls chemins. Côté client, `JEUX_MULTI_IDS` et `LIVE_GAME_LINK` (`public/app.js`) sont les deux mêmes pièges — ce dernier faisait pointer trois jeux sur `#`.

⚠️ **Les tables fantômes.** Une déconnexion ne fait que marquer le joueur absent (`p.connected = false`) ; rien n'effaçait un salon d'attente que tout le monde avait quitté. Or `games()` renvoyait **tous** les joueurs sans distinction, quand `online()` filtrait sur `connected` : le hall annonçait donc « Rejoindre » sur des tables vides depuis des heures — un mensonge sur la seule chose qu'on lui demande. Les cinq modules exposent maintenant `presents`, `creeA` et `limites` en plus de `players`, et `fermerLesTablesFantomes()` (server.js) ferme les **salons d'attente** sans personne de connecté au bout de 5 minutes. Jamais une partie en cours : on peut y revenir.

⚠️ **Le catalogue mentait sur le solo.** Il annonçait « Yams — 2 à 4 joueurs » alors que `MIN_PLAYERS = 1` depuis la refonte. Le solo est justement la seule chose jouable quand le salon est vide, c'est-à-dire presque toujours : c'était le pire endroit où se tromper. Le catalogue est aussi trié selon le nombre de présents, et la famille « à un seul téléphone » passe devant quand personne n'est en ligne.

### Le hall en direct

`/jouer/` sondait le serveur toutes les dix secondes alors que les six jeux qu'il annonce parlent déjà socket.io. Le serveur compare désormais sa propre mémoire toutes les deux secondes (`empreinteDesTables`) et émet un simple `hall_bouge` dans la salle `salon_hall` ; chacun redemande alors **sa** version — l'état est personnel (« moi », « je viens », la dernière partie), il ne se diffuse pas tel quel. Un sondage de 45 s reste en filet si le socket tombe.

⚠️ L'empreinte doit contenir **la présence** autant que les tables : c'est de la liste des présents que part le geste « proposer une partie ». Elle ne compare que l'ensemble des pseudos présents, jamais leur `lastSeen` — sinon elle changerait à chaque battement et tout le monde redemanderait tout, en boucle.

## Les défis (`defis/jeu.js`) — le multijoueur sans rendez-vous

La mécanique des jeux du jour (une manche identique pour tous, un classement, un temps qui départage) appliquée aux jeux qu'on voulait faire ensemble : quelqu'un lance une manche, **tout le monde reçoit exactement la même**, chacun la fait quand il veut dans les 24 h, et on compare. On ne joue pas en même temps, on joue la même chose — et c'est suffisant pour que ça compte.

Deux types, choisis parce que ce sont les deux jeux rapides dont le temps réel n'apportait rien : `motus` (même mot, six essais, barème 7 − essais, 0 si échec) et `drapeaux` (même série de dix questions dans le même ordre, score = bonnes réponses). Le module **n'ouvre aucun socket**, c'est tout l'intérêt.

- ⚠️ **Le contenu ne quitte jamais le serveur en entier** : le mot n'est envoyé qu'à la fin de la manche de celui qui demande, la bonne réponse d'une question qu'après y avoir répondu, et **le classement n'est visible qu'une fois qu'on a joué** — le voir avant donnerait le niveau à battre.
- ⚠️ **Deux règles pour qu'une victoire en soit une** : à moins de deux participants il n'y a personne à battre (lancer son propre défi et le faire en premier ne vaut pas un palmarès), et à égalité en tête personne ne gagne — la même règle qu'au Yams, pour la même raison. Le vainqueur est **recalculé à chaque clôture** (`recalculerVictoires`) tant que le défi court, plutôt qu'attribué puis rattrapé.
- Les clés `defi:<id>` / `defi:prog:<id>:<pseudo>` / `defi:joueurs:<id>` ne portent pas de date **dans leur nom** : `mfPurge()` les ramasse d'après le `creeA` de la manche, au bout d'une semaine. ⚠️ Jamais `defi:stats:<pseudo>`.
- **Classement du Salon** : les défis sont le seul jeu multijoueur qui compte vraiment **en saison**, parce qu'ils sont datés (`finiA`) et qu'on sait qui a gagné — là où `admin:gameHistory` n'enregistre pas le vainqueur. Vu que la saison est la vue par défaut, ça compte.

## Mots Fléchés — le stock de mots et la limite du générateur

C'est le jeu du jour n°2 en usage. Tout se joue sur le **dictionnaire**, et il faut avoir les ordres de grandeur en tête avant de toucher au reste.

### Le stock, et pourquoi il commandait tout

Trois grilles par jour mangent une cinquantaine de mots. La règle « pas de mot revu avant quinze jours » a donc besoin d'au moins trente jours de réserve **par longueur**. Avec 1 383 mots, le niveau Moyen n'en avait que vingt-trois — et quand il reste moins de huit mots d'une longueur, `poolsFor` abandonne la règle **en silence**. Mesuré : elle sautait vingt-trois jours sur trente pour les mots de trois lettres, qui faisaient justement 59 % des grilles. Résultat, **40 % des mots du niveau le plus joué revenaient à moins de quinze jours**.

`words-plus.js` ajoute 359 entrées, dont 94 de **trois lettres** — `words-extra.js` n'en contenait aucune alors que c'est la longueur la plus sollicitée. Effet mesuré sur trente jours : répétitions **40 % → 8 %** en Moyen, **25 % → 0 %** en Difficile, **4 % → 0 %** en Expert ; part des mots de trois lettres 59 % → 46 %.

⚠️ **Une définition ne doit jamais contenir sa réponse** ni un mot de la même famille. Il y en avait 34 (« JOUR → Journée », « CLOCHE → Elle sonne au clocher ») : toutes réécrites, et un test le vérifie en une ligne.

### Ce que le générateur ne sait pas faire, et pourquoi

⚠️ **30 à 36 % de chaque grille est une case noire MUETTE** — ni lettre, ni définition. Dans une vraie grille de magazine, presque chaque case noire porte une définition. C'est le défaut visuel principal, et il n'est **pas** un réglage à corriger : il découle de la méthode. Le générateur pose les mots un par un en s'interdisant de coller deux lettres côte à côte hors croisement (sans quoi il fabriquerait des suites qui ne sont pas des mots), ce qui produit forcément des îlots séparés par du vide.

Une vraie grille se fabrique dans l'autre sens : on dessine d'abord le motif des cases noires, puis on remplit par satisfaction de contraintes. **Cette réécriture a été faite, mesurée, et abandonnée** — la garder aurait dégradé le jeu. Le compte rendu, pour qui voudra y revenir :

- le motif seul atteignait **0 à 1 case muette** au lieu de 30 % ;
- le remplissage réussissait **10 fois sur 10** en 9×9, 10×9 et 11×9 ;
- ⚠️ mais **en conditions réelles**, l'exclusion anti-répétition rétrécit les réserves et tout s'effondre : 90 % de mots de trois lettres, 65 % de répétitions, et jusqu'à 52 % de cases muettes en Expert.
- Deux contraintes structurelles à ne pas redécouvrir : une suite ne peut commencer **ni ligne 0 ni colonne 0** (la flèche n'aurait pas de case où loger) — sans ce garde-fou on obtient une colonne de onze lettres ne formant aucun mot ; et **huit colonnes ne laissent qu'une seule découpe de ligne possible**, donc toutes les lignes deviennent identiques et les colonnes trop longues pour le dictionnaire.

**La conclusion est un ordre de grandeur, pas un bug** : un remplisseur de mots croisés dense a besoin de dizaines de milliers de mots ; nous en avons 1 581, dont 82 de huit lettres. Refaire le générateur ne vaudra le coup qu'après avoir plusieurs milliers de mots **avec leurs définitions** — et écrire des définitions ne s'automatise pas.

### Les défauts corrigés

- ⚠️ **« Tirer une nouvelle grille » ne changeait rien** — quatrième fois que ce piège se présente (Motus, Le Mot Juste, puis les deux jeux du jour récents). Le tirage ne dépend que de la date et du niveau : effacer la clé redonne la même grille. Un compteur `mf:variante:<date>:<niveau>` décale la graine, et la route insiste jusqu'à obtenir une grille différente. À zéro, aucune date passée ne bouge. La route **ne touche plus à `mf:hist:<date>`** : il porte les mots des **trois** niveaux du jour, et l'effacer faisait perdre la trace des deux autres.
- ⚠️ **`/api/mf/check` était un oracle complet.** Il disait quelles cases étaient fausses, sur n'importe quel contenu envoyé : vingt-six requêtes par case suffisaient à lire la grille. La parade n'est pas un compteur d'appels — **vérifier enregistre d'abord ce qu'on envoie**, donc sonder une case revient à effacer sa propre grille. Le joueur honnête ne voit aucune différence.
- **Les archives ont un plancher** (`ARCHIVE_JOURS`, commun aux trois anciens jeux du jour) : sans lui, demander une date de 2019 fabriquait **et stockait** une grille, autant de fois qu'on voulait.
- **Une journée de Mots Fléchés compte pour une journée** au classement du Salon. Les trois niveaux étant comptés séparément, le jeu rapportait neuf points par jour quand le Motus en rapporte trois : un choix de difficulté valait trois jeux. Les grilles supplémentaires valent désormais une participation.

### Sur téléphone

- **Deux flèches encadrent la définition** pour passer d'un mot à l'autre : viser la première case d'un mot au pouce était le geste le plus pénible du jeu. Elles s'arrêtent de préférence sur un mot encore incomplet.
- **Un compteur de mots remplis** dans le bandeau : sans repère d'avancement, une grille à moitié faite ressemble à une grille à peine commencée.
- **La case ne descend plus sous 30 px** (elle tombait à 22). Si la grille dépasse, son conteneur défile. ⚠️ Le centrage se fait par `margin:auto` et **non** par `align-items:center` : dans un conteneur qui défile, un enfant centré par l'alignement voit son début rogné, et on ne peut plus remonter à la première ligne.

## Les statistiques : où elles doivent apparaître

⚠️ **Le piège qui s'est répété à chaque nouveau jeu.** Écrire les statistiques d'un jeu ne suffit pas : il faut aussi les brancher aux **six endroits** qui les montrent. À chaque ajout, un ou plusieurs ont été oubliés — l'Infiltré, lui, ne persistait *rien du tout*, et on pouvait y jouer vingt parties sans qu'il en reste la moindre trace.

Liste à parcourir pour **tout** nouveau jeu :

| Où | Quoi faire |
|---|---|
| **Carte du profil** (`portraitJoueur` → `ajoute(...)`, `server.js`) | sert aussi la bulle de profil publique. ⚠️ `if (!parties) return` : passer un compteur à zéro fait disparaître la carte. |
| **Résumé** (`/api/salon/mystats-summary`) | `totals.push([nom, n])` pour le « jeu le plus joué », et `weekCount` pour un jeu du jour. |
| **Classement du Salon** (`comptes/classement.js`) | jeu du jour → ajouter le préfixe à la liste `['motus','mf','mj','chiffres','geo']` **et** la façon dont il marque sa réussite (`solved`, `ecart===0`, `trouve`) ; multijoueur → une ligne dans `MULTI`. |
| **Titres** (`comptes/titres.js`) | lire la famille de clés, compter le jeu dans `jeuxDifferents`, et lui donner au moins un titre — sinon on peut y exceller sans que rien ne le montre. Préférer des titres **relatifs** (le meilleur, le plus rapide) : pas de seuil à calibrer sur des données qui n'existent pas encore. |
| **Résultats du jour** (`/api/salon/resultats-du-jour`) | pour un jeu du jour seulement. |
| **Admin** (`MODULES_JEUX` dans `admin/routes.js` + `ctx` dans `server.js`) | pour un jeu multijoueur seulement. |

Dernier passage en date : **les défis** ont été branchés sur la carte du profil, le résumé, le classement (saison **et** depuis toujours) et deux titres (`releve`, `lancegants`). Ils n'apparaissent ni dans les résultats du jour (ils ne sont pas quotidiens) ni dans `MODULES_JEUX` (ils n'ont ni socket ni table).

Et pour un jeu du jour, ne pas oublier non plus le panneau « Aujourd'hui » (`JEUX_DU_JOUR` dans `public/app.js` + le pouls), `public/enchainement.js`, et le préchargement du service worker.

## Le classement du Salon

`comptes/classement.js` calcule un score transversal à tous les jeux, exposé par `GET /api/salon/classement` et affiché replié en bas de l'accueil. **Il ne stocke rien** : tout est recalculé à la demande depuis les clés existantes, donc changer le barème ne demande aucune migration. La **saison en cours** (mois calendaire) est la vue par défaut ; « depuis toujours » reste consultable. En saison, les jeux du jour se filtrent sur la date de leur clé, et le multijoueur se fonde sur `admin:gameHistory` — qui horodate chaque partie mais **n'enregistre pas le vainqueur**, donc une partie y compte comme participation seulement. Le barème est isolé en haut du fichier — c'est un choix de jeu, pas une contrainte technique.

Piège à connaître si tu ajoutes un jeu au calcul : Yams et Petit Bac indexent leurs stats par pseudo **normalisé** (`yams:stats:ALIX`), Motus Party par pseudo brut. Le module tient une table `norm(pseudo) → pseudo` pour ça.

## Les titres

`comptes/titres.js` attribue des titres aux joueurs, en trois raretés :

- **commun** — une étape à la portée de tout le monde ;
- **rare** — il faut le chercher ;
- **unique** — **un seul détenteur à la fois** : le meilleur temps, la meilleure moyenne, le plus de victoires. Il change de mains dès que quelqu'un fait mieux, ce qui est tout l'intérêt.

Comme le classement, **le module ne stocke rien** : tout est recalculé depuis les clés existantes, avec un cache d'une minute côté serveur (`tousLesTitres()`). Seules les attributions faites à la main depuis l'admin sont persistées, dans `titres:manuels`.

⚠️ **Calibrer les seuils sur les données réelles, pas au jugé.** « Série de 7 jours » concernait 8 joueurs sur 32 — pas rare. « Motus trouvé en 2 essais » en concernait 12 : la première lettre étant offerte, l'exploit n'en est pas un. Les seuils actuels ont été mesurés sur l'export Redis ; à revérifier après toute vague de nouveaux joueurs.

L'admin a un onglet **Titres** : le catalogue avec ses porteurs, et l'attribution à la main. Un titre calculé ne se retire pas — il se reperd en jouant.

## Conventions générales du projet

- **Tout le code et tous les commentaires sont en français.**
- **Aucun lien souligné** : la règle `a { text-decoration: none }` vit dans `design-system.css`, les apps n'ont plus à la recopier. Les `line-through` restent, eux : ils portent du sens (joueur éliminé, ingrédient coché, compte suspendu).
- Chaque app garde son propre `style.css` pour ce qui lui est spécifique (grille de Motus, dés de Yams, dossiers Perudo/Voyages en entier) ; le design system ne couvre que ce qui doit se ressembler d'une app à l'autre.
- Motif de salle d'attente identique dans tous les jeux migrés : liste de joueurs avec bulle d'avatar, indicateur hôte, estompage (`.off`) pour les déconnectés plutôt qu'un point de couleur séparé.
- Motif de bulle de profil cliquable : quasiment partout où un pseudo est affiché dans un jeu, il est accompagné d'une bulle (`PortailProfile.bubbleHTML`) et cliquable (`PortailProfile.open`). Exception notable : **Perudo a son propre système**, plus riche (cosmétiques, bête noire), ne pas le dupliquer avec le système générique.
- Validation systématique après chaque modification : `node --check` pour le JS, comptage d'accolades équilibrées pour le CSS, comptage de balises équilibrées pour le HTML, vérification croisée des `id` entre HTML et JS.
- Claviers virtuels à l'écran **bannis** — saisie exclusivement via le clavier natif du téléphone partout où c'est pertinent, via un input invisible qui suit la case/position active.
- `interactive-widget=overlays-content` (pas `resizes-content`) sur les pages avec une grille de taille fixe (Motus du jour, Motus Party, Mots Fléchés) — sinon le clavier natif fait rétrécir toute la page et la grille devient illisible. Les pages sans grille sensible peuvent garder `resizes-content`.

## Historique des décisions notables

- Le service worker (`public/sw.js`) a eu un bug majeur en tout début de session : plusieurs apps enregistraient `/sw.js` à portée racine, prenant le contrôle de tout le site (Voyages servait le contenu de Petit Bac). Corrigé : un seul enregistrement légitime (Voyages, scope `/voyages/monts-arree/`), nettoyage automatique des enregistrements fautifs au chargement du salon.
- La liste de préchargement du service worker référençait encore l'ancien chemin plat de Motus après sa restructuration en hub — comme `cache.addAll()` est tout ou rien, une seule entrée invalide empêchait **tout** le mode hors-ligne de fonctionner silencieusement. Corrigé.
- Purple, Autoroute et Roi des Cons ont été supprimés du site (jeux d'alcool retirés par choix personnel) — toutes leurs routes, tuiles et entrées de préchargement ont été nettoyées.
- Un souci de déploiement récurrent a été rencontré plusieurs fois pendant la session (le code semblait correct en relecture mais le comportement en production ne correspondait pas) — la cause a été trouvée : `server.js` requérait 7 fichiers de vocabulaire absents du dépôt, Render refusait le déploiement et **gardait silencieusement l'ancienne version en ligne**. La production est restée figée quatre semaines. D'où `npm run verifie` et le workflow GitHub, à ne jamais retirer.
- Le fichier `public/profil-viewer.js` était mal nommé : les 5 pages qui le chargent demandent `/profile-viewer.js` (orthographe anglaise). 404 en production, `PortailProfile` indéfini, et une `ReferenceError` en plein rendu de Petit Bac, Yams, Infiltré et Motus Party — ces quatre apps ne s'affichaient plus. Renommé.

## Usage réel (export Redis du 1ᵉʳ septembre 2026, 320 clés)

Utile pour arbitrer les priorités — les intuitions se trompent souvent ici.

- **Les jeux du jour font 90 % de l'activité** : Motus 186 clés (20 joueurs), Mots Fléchés 74 (14 joueurs), Le Mot Juste 28 (7 joueurs).
- Petit Bac 15, Voyages 5, Yams 5, Motus Party 2. Perudo compte 19 profils, mais dans sa **propre clé `users`**, hors du cache commun — ne jamais la confondre avec `portail_users` (les 32 comptes du salon) ni la supprimer.
- **Recettes : zéro donnée.** L'app est en ligne depuis des mois et n'a jamais servi. Ne pas investir dans sa migration avant de savoir ce qu'on veut en faire.
- Deux clés mortes traînent, `mf_data` et `mf_progress` : aucun code ne les lit.

## Ce qu'il reste à faire

1. **Le pseudo sert d'identifiant** partout (stats, classements, progressions) — c'est la dette structurelle qui bloque le renommage propre, la fusion de comptes et tout classement transversal. Introduire un identifiant interne stable avec le pseudo comme simple libellé d'affichage.
2. **Les trois anciens jeux du jour sont trois implémentations du même modèle** (contenu par date, progression, classement, discussion, archives) : `/api/mf` 11 routes, `/api/motus` 8, `/api/juste` 6. Un moteur les ramènerait à 6-8 routes génériques. **`quotidien/moteur.js` existe désormais** — graine du jour, progression, classement au score puis au temps, série, archives — et sert Le compte est bon et la Géographie. Il n'a volontairement pas été branché sur les trois anciens : les réécrire pendant qu'ils portent 90 % de l'activité serait un risque pris pour rien. Il montre à quoi ressemblera leur version commune le jour où on s'y mettra.
3. **L'internationalisation est à moitié faite** : 6 apps portent chacune leur propre table `I18N` en fr/en/es, sans fichier partagé, et 8 pages n'ont aucune traduction. Soit un `/i18n.js` commun et on complète, soit on assume le français et on retire le sélecteur de langue.
4. Migrer **Recettes** — mais seulement si l'app trouve une raison d'être (voir usage réel ci-dessus).
5. Décider si **Chance** mérite la migration (petite app statique, faible priorité).
