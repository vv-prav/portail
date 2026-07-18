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

// Échappement HTML (messages du forum, etc.)
function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

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
//  MOTS FLÉCHÉS — grilles du jour, classement, indices, séries, forum.
// ---------------------------------------------------------------------
const MF = require('./motsfleches/generator');
const MF_LEVELS = ['moyen', 'difficile', 'expert'];
const MF_MIN_TIME = { moyen: 25, difficile: 40, expert: 60 };   // seuils anti-triche (secondes)

// Le jour bascule à minuit, heure de Paris
function mfDayId(d) {
    return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d || new Date());
}
function mfTodayId() { return mfDayId(); }
function mfShiftDay(dateId, delta) {
    const d = new Date(dateId + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
}
function mfSecondsToMidnight() {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(now);
    const g = (t) => Number(parts.find(p => p.type === t).value);
    return 86400 - (g('hour') * 3600 + g('minute') * 60 + g('second'));
}
function mfLevel(q) { return MF_LEVELS.includes(q) ? q : 'moyen'; }
function mfFormat(sec) { return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); }

let mfData = { progress: {}, board: {}, grids: {}, history: {}, comments: {}, days: {} };
async function loadMf() {
    if (redis) { try { const d = await redis.get('mf_data'); if (d) mfData = d; } catch (e) {} }
    else { try { mfData = JSON.parse(fs.readFileSync('./mf_data.json', 'utf-8')) || mfData; } catch (e) {} }
    for (const k of ['progress', 'board', 'grids', 'history', 'comments', 'days']) if (!mfData[k]) mfData[k] = {};
}
let _mfTimer = null;
function saveMf() {
    const write = () => {
        if (redis) redis.set('mf_data', mfData).catch(() => {});
        else { try { fs.writeFileSync('./mf_data.json', JSON.stringify(mfData)); } catch (e) {} }
    };
    clearTimeout(_mfTimer); _mfTimer = setTimeout(write, 1200);
}

// Grille (mise en cache) — rotation : on évite les mots des 15 derniers jours
function mfGrid(date, level) {
    const k = date + '|' + level;
    if (mfData.grids[k]) return mfData.grids[k];
    const recent = [];
    for (let i = 1; i <= 15; i++) {
        const h = mfData.history[mfShiftDay(date, -i)];
        if (h) recent.push(...h);
    }
    const p = MF.generate(level, date, recent);
    mfData.grids[k] = p;
    (mfData.history[date] = mfData.history[date] || []).push(...(p.wordList || []));
    // ménage : on ne garde que ~40 jours de grilles
    const limit = mfShiftDay(date, -40);
    for (const key of Object.keys(mfData.grids)) if (key.split('|')[0] < limit) delete mfData.grids[key];
    for (const key of Object.keys(mfData.history)) if (key < limit) delete mfData.history[key];
    saveMf();
    return p;
}
function mfPublic(p) { return { date: p.date, level: p.level, levelLabel: p.levelLabel, rows: p.rows, cols: p.cols, grid: p.grid, defs: p.defs, words: p.words }; }
function mfBoard(date, level) {
    return (mfData.board[date + '|' + level] || []).filter(e => !e.susp).slice().sort((a, b) => a.s - b.s);
}
function mfProgKey(user, date, level) { return user + '|' + date + '|' + level; }

// Série de jours consécutifs avec au moins une grille résolue
function mfStreak(user) {
    const days = new Set(mfData.days[user] || []);
    let cur = 0, d = mfTodayId();
    if (!days.has(d)) d = mfShiftDay(d, -1);        // la journée en cours ne casse pas la série
    while (days.has(d)) { cur++; d = mfShiftDay(d, -1); }
    return { current: cur, total: days.size };
}

app.use('/mots-fleches', requireAuth, express.static(__dirname + '/public/mots-fleches'));

// --- Grille (du jour ou d'une date passée) ---
app.get('/api/mf/today', requireAuth, (req, res) => {
    const level = mfLevel(req.query.level);
    const today = mfTodayId();
    let date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : today;
    if (date > today) date = today;
    const p = mfGrid(date, level);
    res.json({ ...mfPublic(p), today, isArchive: date !== today, nextIn: mfSecondsToMidnight() });
});

// --- Progression ---
app.get('/api/mf/progress', requireAuth, (req, res) => {
    const level = mfLevel(req.query.level);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : mfTodayId();
    const p = mfData.progress[mfProgKey(currentUser(req), date, level)] || null;
    const elapsed = (p && p.startedAt && !p.solved && !p.gaveUp)
        ? Math.floor((Date.now() - p.startedAt) / 1000) + (p.penalty || 0)
        : (p ? (p.seconds || 0) : 0);
    res.json({ progress: p, elapsed });
});
app.post('/api/mf/start', requireAuth, (req, res) => {
    const level = mfLevel(req.body && req.body.level);
    const date = /^\d{4}-\d{2}-\d{2}$/.test((req.body && req.body.date) || '') ? req.body.date : mfTodayId();
    const key = mfProgKey(currentUser(req), date, level);
    const p = mfData.progress[key] || { cells: {}, drafts: {}, solved: false, gaveUp: false, seconds: 0, penalty: 0, hints: 0 };
    if (!p.startedAt) { p.startedAt = Date.now(); mfData.progress[key] = p; saveMf(); }
    res.json({ ok: true, startedAt: p.startedAt, penalty: p.penalty || 0 });
});
app.post('/api/mf/progress', requireAuth, (req, res) => {
    const b = req.body || {};
    const level = mfLevel(b.level);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : mfTodayId();
    const key = mfProgKey(currentUser(req), date, level);
    const clean = {}, drafts = {};
    let n = 0;
    for (const k in (b.cells || {})) {
        if (n++ > 200) break;
        const v = String(b.cells[k] || '').toUpperCase().slice(0, 1);
        if (/^[A-Z]$/.test(v) && /^\d+,\d+$/.test(k)) { clean[k] = v; if (b.drafts && b.drafts[k]) drafts[k] = 1; }
    }
    const prev = mfData.progress[key] || {};
    mfData.progress[key] = { ...prev, cells: clean, drafts, ts: Date.now(), startedAt: prev.startedAt || Date.now() };
    saveMf();
    res.json({ ok: true });
});

// --- Vérification (le serveur ne révèle jamais les lettres) ---
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
    const b = req.body || {};
    const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : mfTodayId();
    const p = mfGrid(date, mfLevel(b.level));
    const cells = b.cells || {};
    const slots = mfSlots(p).map(s => ({ r: s.r, c: s.c, dir: s.dir, ok: s.cells.every(({ r, c }) => String(cells[r + ',' + c] || '').toUpperCase() === p.grid[r][c]) }));
    const wrong = [];
    for (const k in cells) {
        const m = /^(\d+),(\d+)$/.exec(k); if (!m) continue;
        const r = +m[1], c = +m[2];
        if (p.grid[r] && p.grid[r][c] && String(cells[k]).toUpperCase() !== p.grid[r][c]) wrong.push(k);
    }
    res.json({ slots, wrong, allOk: slots.every(s => s.ok) });
});

// --- Indices : une lettre (+30 s) ou un mot entier (+5 min) ---
app.post('/api/mf/hint', requireAuth, (req, res) => {
    const b = req.body || {};
    const level = mfLevel(b.level);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : mfTodayId();
    const key = mfProgKey(currentUser(req), date, level);
    const prog = mfData.progress[key];
    if (!prog || !prog.startedAt) return res.status(400).json({ error: 'Grille non commencée.' });
    if (prog.solved || prog.gaveUp) return res.status(400).json({ error: 'Grille terminée.' });
    const p = mfGrid(date, level);
    const reveal = {};
    let cost = 0;
    if (b.type === 'word') {
        const slot = mfSlots(p).find(s => s.r === b.r && s.c === b.c && s.dir === b.dir);
        if (!slot) return res.status(400).json({ error: 'Mot introuvable.' });
        slot.cells.forEach(({ r, c }) => { reveal[r + ',' + c] = p.grid[r][c]; });
        cost = 300;                                     // +5 minutes
    } else {
        const r = Number(b.r), c = Number(b.c);
        if (!p.grid[r] || !p.grid[r][c]) return res.status(400).json({ error: 'Case invalide.' });
        reveal[r + ',' + c] = p.grid[r][c];
        cost = 30;                                      // +30 secondes
    }
    prog.penalty = (prog.penalty || 0) + cost;
    prog.hints = (prog.hints || 0) + 1;
    prog.cells = { ...(prog.cells || {}), ...reveal };
    saveMf();
    res.json({ ok: true, reveal, cost, penalty: prog.penalty, hints: prog.hints });
});

// --- Résolution : enregistrement du temps ---
app.post('/api/mf/solve', requireAuth, (req, res) => {
    const user = currentUser(req), today = mfTodayId();
    const level = mfLevel(req.body && req.body.level);
    const date = /^\d{4}-\d{2}-\d{2}$/.test((req.body && req.body.date) || '') ? req.body.date : today;
    const key = mfProgKey(user, date, level), bKey = date + '|' + level;
    const prog = mfData.progress[key] || {};
    let sec = prog.startedAt ? Math.round((Date.now() - prog.startedAt) / 1000) : 0;
    sec += (prog.penalty || 0);
    if (!Number.isFinite(sec) || sec < 1) sec = 1;
    if (sec > 86400) sec = 86400;

    const isArchive = date !== today;
    const suspicious = sec < (MF_MIN_TIME[level] || 25);      // temps anormalement court
    if (!prog.solved) {
        mfData.progress[key] = { ...prog, solved: true, seconds: sec, ts: Date.now() };
        if (!isArchive && !prog.gaveUp) {
            const list = mfData.board[bKey] = mfData.board[bKey] || [];
            if (!list.some(e => e.u === user)) list.push({ u: user, s: sec, susp: suspicious });
            const days = mfData.days[user] = mfData.days[user] || [];
            if (!days.includes(date)) days.push(date);
        }
        saveMf();
    }
    const board = mfBoard(date, level);
    res.json({
        ok: true, seconds: mfData.progress[key].seconds, isArchive, suspicious,
        rank: board.findIndex(e => e.u === user) + 1, total: board.length,
        board: board.map(e => ({ u: e.u, t: mfFormat(e.s) })),
        streak: mfStreak(user),
    });
});

// --- Abandon ---
app.post('/api/mf/giveup', requireAuth, (req, res) => {
    const user = currentUser(req);
    const level = mfLevel(req.body && req.body.level);
    const date = /^\d{4}-\d{2}-\d{2}$/.test((req.body && req.body.date) || '') ? req.body.date : mfTodayId();
    const key = mfProgKey(user, date, level);
    const p = mfGrid(date, level);
    const prog = mfData.progress[key] || {};
    if (!prog.solved) { mfData.progress[key] = { ...prog, gaveUp: true, ts: Date.now() }; saveMf(); }
    res.json({ ok: true, grid: p.grid });
});

// --- Classement, états, stats ---
app.get('/api/mf/board', requireAuth, (req, res) => {
    const level = mfLevel(req.query.level), user = currentUser(req);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : mfTodayId();
    const board = mfBoard(date, level);
    res.json({ board: board.map(e => ({ u: e.u, t: mfFormat(e.s) })), me: board.findIndex(e => e.u === user) + 1 });
});
app.get('/api/mf/states', requireAuth, (req, res) => {
    const user = currentUser(req);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : mfTodayId();
    const out = {};
    for (const lv of MF_LEVELS) {
        const p = mfData.progress[mfProgKey(user, date, lv)];
        out[lv] = !p ? 'neuf' : (p.solved ? 'fini' : (p.gaveUp ? 'abandon' : (p.startedAt ? 'encours' : 'neuf')));
    }
    res.json({ states: out, streak: mfStreak(user), nextIn: mfSecondsToMidnight() });
});
// Archives : les 14 derniers jours
app.get('/api/mf/archive', requireAuth, (req, res) => {
    const user = currentUser(req), today = mfTodayId();
    const out = [];
    for (let i = 1; i <= 14; i++) {
        const d = mfShiftDay(today, -i);
        const done = MF_LEVELS.filter(lv => (mfData.progress[mfProgKey(user, d, lv)] || {}).solved).length;
        out.push({ date: d, done });
    }
    res.json({ days: out });
});

// --- Fil de discussion du jour ---
app.get('/api/mf/comments', requireAuth, (req, res) => {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : mfTodayId();
    res.json({ comments: (mfData.comments[date] || []).slice(-60) });
});
app.post('/api/mf/comments', requireAuth, (req, res) => {
    const user = currentUser(req), date = mfTodayId();
    const txt = String((req.body && req.body.text) || '').trim().slice(0, 240);
    if (!txt) return res.status(400).json({ error: 'Message vide.' });
    const list = mfData.comments[date] = mfData.comments[date] || [];
    const last = list.filter(c => c.u === user).slice(-1)[0];
    if (last && Date.now() - last.ts < 4000) return res.status(429).json({ error: 'Doucement !' });
    list.push({ u: user, t: escapeHtml(txt), ts: Date.now() });
    if (list.length > 200) list.splice(0, list.length - 200);
    saveMf();
    res.json({ ok: true, comments: list.slice(-60) });
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