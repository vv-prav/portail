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

## Authentification

- `POST /api/register` / `POST /api/login` → cookie de session signé HMAC, `httpOnly`.
- Code de récupération à l'inscription (`POST /api/new-code` pour en régénérer un).
- `requireAuth` (pages) et `requireAuthApi` (API) sont les deux middlewares de garde ; ils mettent aussi à jour discrètement `user.lastSeen` (respectivement toutes les ~5 min pour les pages, ~30s pour les appels API) — c'est ce qui alimente le statut « en ligne » du salon.
- `requireAdmin` protège tout `/admin` et `/api/admin/*`.
- Changement de pseudo (`/api/account/rename`) et de mot de passe (`/api/account/change-password`) existent — **le renommage ne migre PAS les statistiques des différents jeux** (décision assumée : le faire correctement aurait touché trop de systèmes différents pour le faire sans risque). C'est écrit noir sur blanc dans l'interface du profil.

## Arborescence complète

```
portail/
├── server.js                 ← point d'entrée, ~1800 lignes, monte tout
├── package.json
├── users.json                ← généré localement, jamais commité
├── admin/routes.js            ← toutes les routes /api/admin/*
├── motjuste/{engine,words}.js
├── motsfleches/{dict,generator,words,words-extra}.js
├── motus/                     ← vocabulaire Motus (voir section dédiée)
├── motusparty/game.js
├── pbac/game.js
├── perudo/game.js
├── undercover/game.js
├── yams/game.js
└── public/
    ├── index.html / app.js / style.css     ← LE SALON (page d'accueil)
    ├── design-system.css / design-system.js ← voir section dédiée
    ├── profil-viewer.js                     ← bulle de profil partagée
    ├── sw.js                                ← service worker (cache hors-ligne)
    ├── admin/
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
| **Yams** | `yams/game.js` | `yams_*` | Skins de dés (47, catalogue repris de Perudo), bête noire, spectateurs, classement/historique/face-à-face. |
| **Motus Party** | `motusparty/game.js` | `motusparty_*` | Course en temps réel : tout le monde devine le même mot, classé par ordre d'arrivée. Barème : 1er=10pts, 2e=7, 3e=5, 4e=3, 5e et + =1 si trouvé, 0 sinon. Réutilise le dictionnaire Motus (`motusPool`/`motusKnown` injectés depuis `server.js`). |

### Jeux du jour (un mot/une grille par jour, pas de temps réel)

| App | Notes |
|---|---|
| **Motus** | Restructuré en hub à 2 entrées (`/motus/` → « Motus du jour » et « Motus Party »). Le clavier à l'écran a été **retiré** : saisie exclusivement via le clavier natif du téléphone (input invisible qui suit la case active). Discussion du jour, archives, style des tuiles personnalisable (4 thèmes de couleur). |
| **Mots Fléchés** | Le plus ancien des jeux du jour, sert de référence pour le motif « saisie native ». Grilles générées (`motsfleches/generator.js`), dictionnaire avec niveaux de rareté. |
| **Le Mot Juste** | Jeu façon Contexto/Cémantix (proximité sémantique, thermomètre). |

### Vocabulaire Motus — attention en cas d'ajout futur

`server.js` importe une **dizaine de fichiers** de vocabulaire complémentaire (`motus/words{4,5,6,7}-extra{,2,3}.js`, `words6.js`, `wordsExtra.js`) en plus du dictionnaire principal des mots fléchés. Le bassin tirable (`motusPool(len)`) a été **doublé une première fois**, puis **doublé une seconde fois** (words*-extra2/3/4), chaque vague suivant la même méthode : extraction par fréquence d'usage réelle (`wordfreq`, Python), vérification orthographique (`hunspell fr_FR`, installé sur la machine), dédoublonnage contre absolument tout ce qui existe déjà. Total actuel : **10932 mots tirables** (4 lettres: 756, 5: 4268, 6: 3944, 7: 1964). Toute nouvelle vague doit suivre le même processus et être ajoutée à la fois dans `motusPool()` **et** `motusKnown()` (sinon les nouveaux mots ne seraient pas acceptés comme tentatives valides).

### Autres

- **Chance** — dé/carte/pièce, purement statique, aucun état serveur.
- **Recettes** — CRUD de recettes personnelles (`/api/rec/*`). **Jamais migré vers le système de design** — chantier en attente, prochain sur la liste.
- **Voyages** — hub + une page dédiée par voyage (actuellement un seul : Monts d'Arrée). **Volontairement exclu** du système de design (identité très personnalisée, décision explicite prise avec l'utilisateur).
- **Admin** (`/admin`) — tableau de bord complet : vue d'ensemble, comptes, un panneau par jeu multijoueur (Perudo, Petit Bac, Infiltré, Yams, Motus Party), grilles/dictionnaire des mots fléchés, système (sauvegarde JSON, purge, administrateurs). Recherche transversale (comptes + historique des parties) depuis l'accueil.
- **Profil** (`/profil`) — page dédiée (plus un popup) : avatar/photo, résumé transversal, actions de compte, statistiques par jeu en onglets. Sous-page `/profil/style/` qui centralise **tous** les réglages de style personnalisables de tous les jeux (actuellement : thème de tuiles Motus, skin de dés Yams) — **conçue pour être étendue à chaque nouveau jeu personnalisable**, structure en tableau de config en haut du fichier, bien commentée pour ça.

## Le système de design partagé

Deux fichiers à la racine de `public/`, servis à n'importe quelle app via un chemin absolu (`app.use(express.static('public'))` sans garde d'auth dessus — les fichiers eux-mêmes sont publics, seules les données qu'ils font transiter passent par des routes protégées) :

### `public/design-system.css`

Variables de couleur (`--ink`, `--brass`, `--parchment`...), typographie, échelle d'espacements, et des classes de composants réutilisables : `.ds-back` (bouton retour), `.ds-btn` (+ `.ghost`/`.danger`/`.small`), `.ds-overlay`/`.ds-card`/`.ds-card-close` (popups avec fermeture **toujours** en haut à droite, jamais en bas), `.ds-stat-card`/`.ds-stat-grid`/`.ds-stat-box`, `.ds-row` (+ `.static`) pour les listes cliquables, `.ds-waiting-list`/`.ds-waiting-chip` pour les salles d'attente, `.ds-lb-row` pour les classements, `.ds-input`/`.ds-field-error`, `.ds-segmented` pour les sélecteurs à onglets, `.ds-toast`, `.ds-badge`, `.ds-chip`, `.ds-avatar` (5 tailles : xs/sm/md/lg/xl).

### `public/design-system.js`

S'auto-injecte dans la page (crée son propre DOM, pas besoin d'ajouter le moindre HTML). Expose `window.DS` :

- `DS.toast(message)`
- `DS.confirm({ emoji, title, text, actions: [{label, danger, run}], code, confirmText, cancelLabel })` — `code` affiche un encadré (ex. montrer un mot de passe temporaire généré), `confirmText` force à retaper un texte exact avant d'activer le bouton (actions dangereuses). Un bouton Annuler est toujours ajouté automatiquement si l'appelant n'en a pas prévu.
- `DS.avatarHTML(avatarData, size)`

### `public/profil-viewer.js`

Système séparé (avant le design system, mais du même esprit) : `PortailProfile.fetchAvatars([pseudos])`, `PortailProfile.bubbleHTML(avatarData)`, `PortailProfile.open(pseudo)` (ouvre un profil public en lecture seule, alimenté par `GET /api/public-profile`, qui ne renvoie **jamais** rien de sensible).

### Apps migrées vers le design system (vérifié au moment de l'écriture)

✅ Admin · ✅ Le Mot Juste · ✅ Mots Fléchés · ✅ Hub Motus · ✅ Motus du jour · ✅ Motus Party · ✅ Petit Bac · ✅ Infiltré · ✅ Yams · ✅ Le salon (`public/index.html`)

❌ **Profil et sa sous-page Style — PAS migrés**, malgré une note antérieure erronée disant le contraire. À faire.
❌ Recettes — pas commencé.
❌ Chance — jamais dans le plan de migration (petite page statique).
🚫 Perudo et Voyages — **exclusion volontaire et définitive**, pas des oublis. Chacun a sa propre identité visuelle forte qui serait appauvrie par le système commun.

### Méthode de migration établie (à réutiliser pour Recettes)

1. Lire entièrement les 3 fichiers de l'app avant de toucher quoi que ce soit.
2. Vérifier le nombre de colonnes des grilles de stats existantes avant de basculer vers `.ds-stat-grid` (certaines sont à 2 colonnes, la classe par défaut en fait 3 — utiliser `.ds-stat-grid.cols2` si besoin).
3. Migrer `toast()` et une éventuelle confirmation maison (`ask()`) pour qu'ils délèguent à `DS.toast()`/`DS.confirm()` plutôt que dupliquer.
4. Repérer si des titres de popup utilisent une police spéciale (Fraunces) via leur classe — **toujours garder cette classe en plus** de `.ds-card-title`, sinon la police festive disparaît silencieusement.
5. **Piège `all:unset`** : si un ancien bouton-bulle d'avatar utilisait `all:unset` pour se réinitialiser, le combiner avec `.ds-avatar` efface le style de la bulle. Utiliser une réinitialisation ciblée (`border:none; padding:0; background:...`) à la place.
6. Nettoyer le CSS mort après coup — **ne jamais faire ça ligne par ligne** (un script naïf qui retire la ligne du sélecteur sans suivre les accolades sur plusieurs lignes casse le fichier, vécu sur Yams). Utiliser un vrai parseur de blocs qui compte les accolades et retire des règles entières, en traitant `@media`/`@keyframes` comme des blocs opaques à ne jamais découper.
7. **Toujours revérifier à la main après le nettoyage automatique** : les sélecteurs combinés (`.ancienne-classe.modificateur`) et les sélecteurs descendants (`.parent-vivant .ancienne-classe`) ne sont jamais détectés par un script qui ne regarde qu'un sélecteur isolé — chercher chaque ancienne classe individuellement dans le fichier final.
8. Vérifier qu'aucun bouton "Fermer" texte ne subsiste (`grep -n "Fermer"`) — tous doivent être devenus des `.ds-card-close` en ✕, toujours en haut à droite.
9. Vérification croisée finale : tous les `id` référencés en JS existent en HTML, toutes les classes générées dynamiquement ont une règle CSS quelque part (design-system.css ou le style.css local).

## Conventions générales du projet

- **Tout le code et tous les commentaires sont en français.**
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
- Un souci de déploiement récurrent a été rencontré plusieurs fois pendant la session (le code semblait correct en relecture mais le comportement en production ne correspondait pas) — toujours vérifier en premier que le dépôt distant reflète bien les derniers fichiers avant de chercher un bug de logique.

## Ce qu'il reste à faire (au moment de l'écriture)

1. **Migrer Recettes** vers le système de design (prochain sur la liste, méthode ci-dessus).
2. **Migrer le Profil et sa sous-page Style** — ce n'est PAS fait, malgré une confusion antérieure à ce sujet.
3. Décider si Chance mérite la migration (petite app, faible priorité).
