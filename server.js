// =====================================================================
//  LE SALON — serveur du portail (monolithe)
//  Express 5 + Socket.io + auth scrypt + Upstash Redis (repli JSON)
//  Une seule connexion partagée pour toutes les mini-apps (même origine).
// =====================================================================
const express = require('express');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json({ limit: '1mb' }));

// ---------------------------------------------------------------------
//  Secret de session (cookie signé). À définir en prod via une variable.
// ---------------------------------------------------------------------
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-a-changer';
if (SESSION_SECRET === 'dev-secret-a-changer') {
    console.log('⚠️  SESSION_SECRET non défini : secret de dev utilisé. Définis-le en production.');
}
const SESSION_DAYS = 30;
const IS_PROD = process.env.NODE_ENV === 'production';

// ---------------------------------------------------------------------
//  Persistance : Upstash Redis en prod, repli fichier JSON en local.
//  (Même principe que le projet Perudo.)
// ---------------------------------------------------------------------
const USERS_FILE = './users.json';
let registeredUsers = {};
let redis = null;

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
        const { Redis } = require('@upstash/redis');
        redis = Redis.fromEnv();
        console.log('🔌 Upstash Redis activé.');
    } catch (e) {
        console.log('⚠️  @upstash/redis introuvable, repli sur le fichier local.');
    }
}

async function loadUsers() {
    if (redis) {
        try {
            const data = await redis.get('portail_users');
            if (data) registeredUsers = data;
            console.log(`✅ ${Object.keys(registeredUsers).length} compte(s) chargé(s) depuis Redis.`);
            return;
        } catch (e) { console.log('⚠️  Lecture Redis échouée :', e.message); }
    }
    try {
        registeredUsers = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8')) || {};
    } catch (e) { registeredUsers = {}; }
}

let _saveTimer = null;
function saveUsers(immediate = false) {
    const write = () => {
        if (redis) redis.set('portail_users', registeredUsers).catch(e => console.log('⚠️  Écriture Redis :', e.message));
        else { try { fs.writeFileSync(USERS_FILE, JSON.stringify(registeredUsers, null, 2)); } catch (e) {} }
    };
    if (immediate) return write();
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(write, 1500);
}

// ---------------------------------------------------------------------
//  Mots de passe (scrypt) — jamais stockés en clair.
// ---------------------------------------------------------------------
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
    if (!stored || !stored.includes(':')) return false;
    const [salt, hash] = stored.split(':');
    const test = crypto.scryptSync(password, salt, 64).toString('hex');
    const a = Buffer.from(hash, 'hex'); const b = Buffer.from(test, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const PSEUDO_REGEX = /^[a-zA-Z0-9_ -]{3,20}$/;

// ---------------------------------------------------------------------
//  Session sans store : cookie signé (HMAC). Survit aux redéploiements.
// ---------------------------------------------------------------------
function signSession(pseudo) {
    const exp = Date.now() + SESSION_DAYS * 864e5;
    const payload = Buffer.from(JSON.stringify({ u: pseudo, exp })).toString('base64url');
    const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
    return `${payload}.${sig}`;
}
function readSession(token) {
    if (!token || !token.includes('.')) return null;
    const [payload, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    try {
        const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
        if (!data.exp || data.exp < Date.now()) return null;
        if (!registeredUsers[data.u]) return null;
        return data.u;
    } catch (e) { return null; }
}
function parseCookies(req) {
    const out = {};
    (req.headers.cookie || '').split(';').forEach(c => {
        const i = c.indexOf('='); if (i < 0) return;
        out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
    });
    return out;
}
function currentUser(req) { return readSession(parseCookies(req).salon_session); }
function setSessionCookie(res, pseudo) {
    res.cookie('salon_session', signSession(pseudo), {
        httpOnly: true, sameSite: 'lax', secure: IS_PROD,
        maxAge: SESSION_DAYS * 864e5, path: '/'
    });
}

// Middleware : protège les pages d'apps (redirige vers le salon si non connecté)
function requireAuth(req, res, next) {
    if (currentUser(req)) return next();
    return res.redirect('/');
}

// ---------------------------------------------------------------------
//  API d'authentification (partagée par tout le portail)
// ---------------------------------------------------------------------
app.post('/api/register', (req, res) => {
    const pseudo = (req.body.pseudo || '').trim();
    const password = req.body.password || '';
    if (!PSEUDO_REGEX.test(pseudo)) return res.status(400).json({ error: 'Nom invalide (3 à 20 caractères).' });
    if (password.length < 3) return res.status(400).json({ error: 'Mot de passe trop court (3 minimum).' });
    if (registeredUsers[pseudo]) return res.status(409).json({ error: 'Ce nom est déjà pris. Connecte-toi.' });
    registeredUsers[pseudo] = { pseudo, passwordHash: hashPassword(password), created: Date.now() };
    saveUsers(true);
    setSessionCookie(res, pseudo);
    res.json({ ok: true, user: { pseudo } });
});

app.post('/api/login', (req, res) => {
    const pseudo = (req.body.pseudo || '').trim();
    const password = req.body.password || '';
    const user = registeredUsers[pseudo];
    if (!user || !verifyPassword(password, user.passwordHash)) {
        return res.status(401).json({ error: 'Nom ou mot de passe incorrect.' });
    }
    setSessionCookie(res, pseudo);
    res.json({ ok: true, user: { pseudo } });
});

app.post('/api/logout', (req, res) => {
    res.clearCookie('salon_session', { path: '/' });
    res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
    const pseudo = currentUser(req);
    if (!pseudo) return res.status(401).json({ error: 'Non connecté.' });
    res.json({ user: { pseudo } });
});

// ---------------------------------------------------------------------
//  Pages d'apps (protégées). Placeholder tant que l'app n'est pas branchée.
//  Chaque future mini-app aura son dossier dans public/ + sa route ici.
// ---------------------------------------------------------------------
function placeholder(name, emoji) {
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>${name}</title><link rel="stylesheet" href="/style.css"></head>
    <body class="app-placeholder"><main class="ph-card">
    <div class="ph-emoji">${emoji}</div><h1>${name}</h1>
    <p>Cet espace est prêt à être construit. La connexion est déjà partagée avec le salon.</p>
    <a class="btn btn-ghost" href="/">← Retour au salon</a></main></body></html>`;
}
app.get('/recettes', requireAuth, (req, res) => res.send(placeholder('Les Recettes', '🍽️')));
app.get('/media', requireAuth, (req, res) => res.send(placeholder('Espace Média', '🎞️')));
// ---------------------------------------------------------------------
//  MOTS FLÉCHÉS — grille du jour (3 niveaux), progression et classement.
// ---------------------------------------------------------------------
const MF = require('./motsfleches/generator');
const MF_LEVELS = ['facile', 'moyen', 'difficile'];
function mfTodayId() { return new Date().toISOString().slice(0, 10); }
function mfLevel(q) { return MF_LEVELS.includes(q) ? q : 'facile'; }

let mfData = { progress: {}, board: {} };   // progress: "user|date|niv" · board: "date|niv" -> [{u,s}]
async function loadMf() {
    if (redis) { try { const d = await redis.get('mf_data'); if (d) mfData = d; return; } catch (e) {} }
    try { mfData = JSON.parse(fs.readFileSync('./mf_data.json', 'utf-8')) || mfData; } catch (e) {}
    if (!mfData.progress) mfData.progress = {};
    if (!mfData.board) mfData.board = {};
}
let _mfTimer = null;
function saveMf() {
    const write = () => {
        if (redis) redis.set('mf_data', mfData).catch(() => {});
        else { try { fs.writeFileSync('./mf_data.json', JSON.stringify(mfData)); } catch (e) {} }
    };
    clearTimeout(_mfTimer); _mfTimer = setTimeout(write, 1200);
}
function mfFormat(sec) {
    const m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + String(s).padStart(2, '0');
}
function mfBoard(date, level) {
    return (mfData.board[date + '|' + level] || []).slice().sort((a, b) => a.s - b.s);
}

app.use('/mots-fleches', requireAuth, express.static(__dirname + '/public/mots-fleches'));

// Grille du jour (sans la solution : elle n'est envoyée qu'en cas d'abandon)
app.get('/api/mf/today', requireAuth, (req, res) => {
    const level = mfLevel(req.query.level), date = mfTodayId();
    const p = MF.generate(level, date);
    res.json({ date, level, levelLabel: p.levelLabel, rows: p.rows, cols: p.cols, grid: p.grid, defs: p.defs });
});

// Progression personnelle du jour
app.get('/api/mf/progress', requireAuth, (req, res) => {
    const level = mfLevel(req.query.level);
    const key = currentUser(req) + '|' + mfTodayId() + '|' + level;
    const p = mfData.progress[key] || null;
    const elapsed = (p && p.startedAt && !p.solved && !p.gaveUp)
        ? Math.floor((Date.now() - p.startedAt) / 1000)
        : (p ? (p.seconds || 0) : 0);
    res.json({ progress: p, elapsed });
});

// Démarrage du chrono (il court ensuite en continu, même hors de l'app)
app.post('/api/mf/start', requireAuth, (req, res) => {
    const level = mfLevel(req.body && req.body.level);
    const key = currentUser(req) + '|' + mfTodayId() + '|' + level;
    const p = mfData.progress[key] || { cells: {}, solved: false, gaveUp: false, seconds: 0 };
    if (!p.startedAt) { p.startedAt = Date.now(); mfData.progress[key] = p; saveMf(); }
    res.json({ ok: true, startedAt: p.startedAt, elapsed: Math.floor((Date.now() - p.startedAt) / 1000) });
});
app.post('/api/mf/progress', requireAuth, (req, res) => {
    const level = mfLevel(req.body && req.body.level);
    const key = currentUser(req) + '|' + mfTodayId() + '|' + level;
    const cells = (req.body && req.body.cells && typeof req.body.cells === 'object') ? req.body.cells : {};
    const clean = {}; let n = 0;
    for (const k in cells) {
        if (n++ > 120) break;
        const v = String(cells[k] || '').toUpperCase().slice(0, 1);
        if (/^[A-Z]$/.test(v) && /^\d+,\d+$/.test(k)) clean[k] = v;
    }
    const prev = mfData.progress[key] || {};
    mfData.progress[key] = { cells: clean, solved: !!prev.solved, gaveUp: !!prev.gaveUp, seconds: prev.seconds || 0, startedAt: prev.startedAt || Date.now(), ts: Date.now() };
    saveMf();
    res.json({ ok: true });
});

// Grille résolue : on enregistre le temps au classement du jour
app.post('/api/mf/solve', requireAuth, (req, res) => {
    const user = currentUser(req), date = mfTodayId(), level = mfLevel(req.body && req.body.level);
    const key = user + '|' + date + '|' + level, bKey = date + '|' + level;
    const prog = mfData.progress[key] || {};
    let sec = prog.startedAt ? Math.round((Date.now() - prog.startedAt) / 1000) : 0;
    if (!Number.isFinite(sec) || sec < 3) sec = 3;
    if (sec > 86400) sec = 86400;                     // borne de sécurité (24 h)
    if (prog.gaveUp) return res.json({ ok: false, reason: 'gaveup', board: mfBoard(date, level).map(e => ({ u: e.u, t: mfFormat(e.s) })) });
    if (!prog.solved) {
        mfData.progress[key] = { ...prog, solved: true, seconds: sec, ts: Date.now() };
        const list = mfData.board[bKey] = mfData.board[bKey] || [];
        if (!list.some(e => e.u === user)) list.push({ u: user, s: sec });
        saveMf();
    }
    const board = mfBoard(date, level);
    res.json({
        ok: true, seconds: mfData.progress[key].seconds,
        rank: board.findIndex(e => e.u === user) + 1, total: board.length,
        board: board.map(e => ({ u: e.u, t: mfFormat(e.s) })),
    });
});

// Abandon : on renvoie la solution (et le joueur n'entre pas au classement)
app.post('/api/mf/giveup', requireAuth, (req, res) => {
    const user = currentUser(req), date = mfTodayId(), level = mfLevel(req.body && req.body.level);
    const key = user + '|' + date + '|' + level;
    const p = MF.generate(level, date);
    const prog = mfData.progress[key] || {};
    if (!prog.solved) { mfData.progress[key] = { ...prog, gaveUp: true, ts: Date.now() }; saveMf(); }
    res.json({ ok: true, grid: p.grid });
});

// Vérification : le serveur dit quels MOTS sont corrects, sans révéler les lettres
function mfSlots(p) {
    return p.defs.map(def => {
        const cells = [];
        let r = def.r, c = def.c;
        if (def.dir === 'right') { c++; while (c < p.cols && p.grid[r][c]) { cells.push({ r, c }); c++; } }
        else { r++; while (r < p.rows && p.grid[r][c]) { cells.push({ r, c }); r++; } }
        return { r: def.r, c: def.c, dir: def.dir, cells };
    });
}
app.post('/api/mf/check', requireAuth, (req, res) => {
    const level = mfLevel(req.body && req.body.level), date = mfTodayId();
    const p = MF.generate(level, date);
    const cells = (req.body && req.body.cells) || {};
    const slots = mfSlots(p).map(s => ({
        r: s.r, c: s.c, dir: s.dir,
        ok: s.cells.every(({ r, c }) => String(cells[r + ',' + c] || '').toUpperCase() === p.grid[r][c]),
    }));
    const wrong = [];
    for (const k in cells) {
        const m = /^(\d+),(\d+)$/.exec(k); if (!m) continue;
        const r = +m[1], c = +m[2];
        if (p.grid[r] && p.grid[r][c] && String(cells[k]).toUpperCase() !== p.grid[r][c]) wrong.push(k);
    }
    res.json({ slots, wrong, allOk: slots.every(s => s.ok) });
});

// Classement du jour
app.get('/api/mf/board', requireAuth, (req, res) => {
    const date = mfTodayId(), level = mfLevel(req.query.level), user = currentUser(req);
    const board = mfBoard(date, level);
    res.json({ board: board.map(e => ({ u: e.u, t: mfFormat(e.s) })), me: board.findIndex(e => e.u === user) + 1 });
});

// ---------------------------------------------------------------------
//  PERUDO — jeu temps réel, intégré au monolithe sous /perudo.
//  Le front est protégé par le login du salon ; /perudo/healthz reste public.
// ---------------------------------------------------------------------
require('./perudo/game')(app, io);
app.use('/perudo', requireAuth, express.static(__dirname + '/public/perudo'));

// ---------------------------------------------------------------------
//  Statique (le salon) + Socket.io prêt pour les apps temps réel.
// ---------------------------------------------------------------------
app.use(express.static('public'));

io.on('connection', (socket) => {
    // Prêt pour Perudo & co. Le salon lui-même n'a pas besoin de temps réel.
});

const PORT = process.env.PORT || 3000;
Promise.all([loadUsers(), loadMf()]).then(() => {
    server.listen(PORT, () => console.log(`🏛️  Le Salon tourne sur le port ${PORT}`));
});