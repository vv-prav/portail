# 🏛️ Le Salon — portail personnel (monolithe)

Un seul serveur, un seul login **partagé** par toutes les mini-apps (elles sont sur la même origine, donc la connexion vaut partout). Le salon = la page d'accueil avec une grille de tuiles vers chaque app.

> Pour le contexte complet du projet (architecture des données, système de design, conventions, historique des décisions), voir **[CLAUDE.md](CLAUDE.md)**. Ce README ne couvre que l'installation et l'ajout d'une app.

## Lancer en local

```bash
npm install
npm start
# → http://localhost:3000
```

Sans variables Redis, les comptes sont stockés dans `users.json` (parfait pour développer). **Ne pas** committer `users.json` — il est dans `.gitignore`.

## Déployer sur Render

1. Pousse ce dossier sur un repo GitHub.
2. Sur Render → **New Web Service**, connecte le repo.
3. **Start command** : `npm start` (Build : `npm install`).
4. Dans **Environment**, ajoute :
   - `SESSION_SECRET` = une longue chaîne aléatoire (signe les cookies de connexion).
   - `UPSTASH_REDIS_REST_URL` et `UPSTASH_REDIS_REST_TOKEN` (depuis le dashboard Upstash).
   - `NODE_ENV` = `production` (active le cookie `Secure`).
   - `ADMIN_USERS` = pseudos séparés par des virgules ayant accès à `/admin`.

> ⚠️ Le disque de Render est **éphémère** : sans Redis, les comptes sont effacés à chaque redéploiement. Redis est donc indispensable en prod.

### Avant chaque push — vérifier que le serveur démarre

```bash
node -e "require('./server.js')" && echo OK
```

Deux secondes, et ça attrape la panne la plus coûteuse du projet : un `require()` vers un fichier absent du dépôt. Quand ça arrive, Render refuse le déploiement et **garde silencieusement l'ancienne version en ligne** — le code semble correct en relecture mais la production ne bouge pas. C'est déjà arrivé plusieurs fois. Uploader les fichiers un par un via l'interface web de GitHub est la cause structurelle : préférer `git push`, qui envoie un état cohérent.

## Comment marche l'auth partagée

- Connexion via `POST /api/login` (ou `/api/register`) → le serveur pose un **cookie de session signé** (HMAC, `httpOnly`).
- Ce cookie est envoyé automatiquement sur **toutes** les pages du même domaine → l'utilisateur est connecté dans chaque app sans rien refaire.
- Les pages d'apps (`/perudo`, `/recettes`, …) sont protégées par le middleware `requireAuth` : non connecté → redirigé vers le salon.
- `requireAdmin` protège `/admin` et `/api/admin/*`.

## Les apps

**Jeux multijoueurs** (temps réel, Socket.io) : Perudo · Petit Bac · Infiltré · Yams · Motus Party
**Jeux du jour** (un mot/une grille par jour) : Motus · Mots Fléchés · Le Mot Juste
**Autres** : Chance · Recettes · Voyages · Profil · Admin

Chaque app vit dans `public/<app>/` (index.html + app.js + style.css). Les jeux temps réel ont en plus un module serveur `<app>/game.js` à la racine, attaché via `require('./<app>/game')(app, io, deps)`.

## Ajouter une nouvelle app (3 étapes)

1. **Le salon** : ajoute une entrée dans le tableau `APPS` de `public/app.js` (id, nom, emoji, `href`, `accent`, `status`).
2. **La route** : dans `server.js`, `app.use('/mon-app', requireAuth, express.static(__dirname + '/public/mon-app'))`.
3. **Les fichiers** : mets l'app dans `public/mon-app/`. Pour récupérer l'identité côté serveur : `const pseudo = currentUser(req);`.

Passe le `status` de `'soon'` à `'open'` quand elle est prête. Pense aussi à ajouter ses fichiers au tableau `CORE` de `public/sw.js` et à incrémenter `CACHE_VERSION`.

Pour réutiliser le look commun, charge `/design-system.css` et `/design-system.js` ; pour les bulles de profil, `/profile-viewer.js`.

## Structure

```
portail/
├── server.js              ← Express + Socket.io + auth + Redis/JSON + sessions
├── package.json
├── users.json             ← repli local (auto, jamais committé)
├── CLAUDE.md              ← contexte complet du projet
├── admin/routes.js        ← toutes les routes /api/admin/*
├── motjuste/ motsfleches/ motus/     ← moteurs et vocabulaires des jeux du jour
├── motusparty/ pbac/ perudo/ undercover/ yams/   ← modules des jeux temps réel
└── public/
    ├── index.html / app.js / style.css      ← le salon
    ├── design-system.css / design-system.js ← look commun
    ├── profile-viewer.js                    ← bulle de profil partagée
    ├── sw.js                                ← service worker (CACHE_VERSION à incrémenter)
    ├── manifest.json / icon-192.png / icon-512.png
    └── <une app par dossier>
```

## À faire plus tard (rappels)

- Migrer **Recettes**, puis **Profil** et sa sous-page Style, vers le système de design.
- Stockage média (photos/vidéos) : **ne pas** stocker sur Render → Cloudflare R2 / Supabase Storage / Cloudinary.
- Récupération de mot de passe / connexion Google : envisager Supabase Auth si besoin de confort.
