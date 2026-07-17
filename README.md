# 🏛️ Le Salon — portail personnel (monolithe)

Un seul serveur, un seul login **partagé** par toutes les mini-apps (elles sont sur la même origine, donc la connexion vaut partout). Le salon = la page d'accueil avec une grille de tuiles vers chaque app.

## Lancer en local

```bash
npm install
npm start
# → http://localhost:3000
```

Sans variables Redis, les comptes sont stockés dans `users.json` (parfait pour développer). **Ne pas** committer `users.json`.

## Déployer sur Render

1. Pousse ce dossier sur un repo GitHub.
2. Sur Render → **New Web Service**, connecte le repo.
3. **Start command** : `npm start` (Build : `npm install`).
4. Dans **Environment**, ajoute :
   - `SESSION_SECRET` = une longue chaîne aléatoire (signe les cookies de connexion).
   - `UPSTASH_REDIS_REST_URL` et `UPSTASH_REDIS_REST_TOKEN` (depuis le dashboard Upstash).
   - `NODE_ENV` = `production` (active le cookie `Secure`).

> ⚠️ Le disque de Render est **éphémère** : sans Redis, les comptes sont effacés à chaque redéploiement. Redis est donc indispensable en prod.

## Comment marche l'auth partagée

- Connexion via `POST /api/login` (ou `/api/register`) → le serveur pose un **cookie de session signé** (HMAC, `httpOnly`).
- Ce cookie est envoyé automatiquement sur **toutes** les pages du même domaine → l'utilisateur est connecté dans chaque app sans rien refaire.
- Les pages d'apps (`/perudo`, `/recettes`, …) sont protégées par le middleware `requireAuth` : non connecté → redirigé vers le salon.

## Ajouter une nouvelle app (3 étapes)

1. **Le salon** : ajoute une entrée dans le tableau `APPS` de `public/app.js` (id, nom, emoji, `href`, `accent`, `status`).
2. **La route** : dans `server.js`, ajoute `app.get('/mon-app', requireAuth, ...)` (sert un dossier `public/mon-app/` ou une page).
3. **Les fichiers** : mets l'app dans `public/mon-app/`. Pour récupérer l'identité côté serveur : `const pseudo = currentUser(req);`.

Passe le `status` de `'soon'` à `'open'` quand elle est prête.

## Intégrer Perudo (prochaine étape)

Perudo existe déjà (Express + Socket.io). Pour le fondre ici :
- Copier ses fichiers front dans `public/perudo/` et remplacer la route placeholder par le service de ce dossier.
- Fusionner ses handlers Socket.io dans le `io.on('connection', ...)` de ce serveur (ou les charger depuis un module `perudo/socket.js`).
- Réutiliser l'auth du salon : au lieu de son login interne, lire `currentUser(req)` / passer le pseudo au socket via le cookie.

## Structure

```
portail/
├── server.js            ← Express + Socket.io + auth + Redis/JSON + sessions
├── package.json
├── users.json           ← repli local (auto, à ne pas committer)
├── README.md
└── public/
    ├── index.html       ← le salon (connexion + tuiles)
    ├── app.js
    ├── style.css
    ├── sw.js            ← service worker (CACHE_VERSION à incrémenter)
    └── manifest.json
```

## À faire plus tard (rappels)

- Icônes PWA `public/icon-192.png` et `public/icon-512.png` (référencées par le manifest).
- Stockage média (photos/vidéos) : **ne pas** stocker sur Render → Cloudflare R2 / Supabase Storage / Cloudinary.
- Récupération de mot de passe / connexion Google : envisager Supabase Auth si besoin de confort.
