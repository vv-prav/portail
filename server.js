// =====================================================================
//  LE SALON — serveur du portail (monolithe)
//  Express 5 + Socket.io + auth scrypt + Upstash Redis (repli JSON)
//  Une seule connexion partagée pour toutes les mini-apps (même origine).
// =====================================================================
const express = require('express');
const compression = require('compression');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(compression());
app.use(express.json({ limit: '1mb' }));

// ---------------------------------------------------------------------
//  Secret de session (cookie signé). À définir en prod via une variable.
// ---------------------------------------------------------------------
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-a-changer';
if (SESSION_SECRET === 'dev-secret-a-changer') {
    console.log('⚠️  SESSION_SECRET non défini : secret de dev utilisé. Définis-le en production.');
}
const SESSION_DAYS = 30;
// Administrateurs : pseudos séparés par des virgules dans la variable ADMIN_USERS
const ROOT_ADMINS = (process.env.ADMIN_USERS || 'Viper la Voile Noire,VicoW')
    .split(',').map(s => s.trim()).filter(Boolean);
// Administrateurs ajoutés depuis l'interface (clé mf:admins) — les "racine" ne sont jamais retirables
function extraAdmins() { const l = mfGet('mf:admins'); return Array.isArray(l) ? l : []; }
function allAdmins() { return [...new Set([...ROOT_ADMINS, ...extraAdmins()])]; }
function isRootAdmin(p) { return ROOT_ADMINS.includes(p); }
function isAdmin(pseudo) { return ROOT_ADMINS.includes(pseudo) || extraAdmins().includes(pseudo); }
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
const MIN_PASSWORD = 6;

// --- Protection contre le brute-force (mémoire, fenêtre glissante) ---
const MAX_TRIES = 5, LOCK_MS = 15 * 60 * 1000;
const loginTries = new Map();                       // clé -> { n, until, ts }
function triesKey(req, pseudo) {
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    return ip + '|' + pseudo.toLowerCase();
}
function loginBlocked(key) {
    const e = loginTries.get(key);
    if (!e) return 0;
    if (e.until && e.until > Date.now()) return Math.ceil((e.until - Date.now()) / 60000);
    if (e.until && e.until <= Date.now()) loginTries.delete(key);
    return 0;
}
function loginFailed(key) {
    const e = loginTries.get(key) || { n: 0 };
    e.n++; e.ts = Date.now();
    if (e.n >= MAX_TRIES) { e.until = Date.now() + LOCK_MS; e.n = 0; }
    loginTries.set(key, e);
}
function loginOk(key) { loginTries.delete(key); }
setInterval(() => {                                  // ménage horaire
    const now = Date.now();
    for (const [k, e] of loginTries) if ((e.until && e.until < now) || (e.ts && now - e.ts > 3600e3)) loginTries.delete(k);
}, 3600e3);

// --- Code de récupération (l'utilisateur le note ; on n'en garde que l'empreinte) ---
function makeRecoveryCode() {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';       // sans caractères ambigus
    let out = [];
    for (let g = 0; g < 4; g++) {
        let s = '';
        for (let i = 0; i < 4; i++) s += A[crypto.randomInt(A.length)];
        out.push(s);
    }
    return out.join('-');
}

// Échappement HTML (messages du forum, etc.)
function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------------------------------------------------------------------
//  Session sans store : cookie signé (HMAC). Survit aux redéploiements.
// ---------------------------------------------------------------------
function signSession(pseudo) {
    const exp = Date.now() + SESSION_DAYS * 864e5;
    const ep = (registeredUsers[pseudo] && registeredUsers[pseudo].sessionEpoch) || 0;
    const payload = Buffer.from(JSON.stringify({ u: pseudo, exp, ep })).toString('base64url');
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
        const user = registeredUsers[data.u];
        if (!user) return null;
        if (user.banned) return null;                                  // compte banni
        if ((user.sessionEpoch || 0) > (data.ep || 0)) return null;    // session révoquée
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

// Pour les routes d'API : réponse JSON plutôt qu'une redirection
function requireAuthApi(req, res, next) {
    if (currentUser(req)) return next();
    return res.status(401).json({ error: 'Non connecté.' });
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
    if (password.length < MIN_PASSWORD) return res.status(400).json({ error: `Mot de passe trop court (${MIN_PASSWORD} caractères minimum).` });
    if (registeredUsers[pseudo]) return res.status(409).json({ error: 'Ce nom est déjà pris. Connecte-toi.' });
    const code = makeRecoveryCode();
    registeredUsers[pseudo] = { pseudo, passwordHash: hashPassword(password), recoveryHash: hashPassword(code), created: Date.now() };
    saveUsers(true);
    setSessionCookie(res, pseudo);
    res.json({ ok: true, user: { pseudo }, recoveryCode: code });
});

app.post('/api/login', (req, res) => {
    const pseudo = (req.body.pseudo || '').trim();
    const password = req.body.password || '';
    const tk = triesKey(req, pseudo);
    const wait = loginBlocked(tk);
    if (wait) return res.status(429).json({ error: `Trop de tentatives. Réessaie dans ${wait} min.` });
    const user = registeredUsers[pseudo];
    if (!user || !verifyPassword(password, user.passwordHash)) {
        loginFailed(tk);
        return res.status(401).json({ error: 'Nom ou mot de passe incorrect.' });
    }
    if (user.banned) return res.status(403).json({ error: "Ce compte a été suspendu." });
    loginOk(tk);
    user.prevLogin = user.lastLogin || 0;
    user.lastLogin = Date.now();
    saveUsers();
    setSessionCookie(res, pseudo);
    res.json({ ok: true, user: { pseudo } });
});

// --- Récupération de mot de passe avec le code noté à l'inscription ---
app.post('/api/recover', (req, res) => {
    const pseudo = (req.body.pseudo || '').trim();
    const code = String(req.body.code || '').trim().toUpperCase();
    const newPassword = req.body.newPassword || '';
    const tk = triesKey(req, 'recover:' + pseudo);
    const wait = loginBlocked(tk);
    if (wait) return res.status(429).json({ error: `Trop de tentatives. Réessaie dans ${wait} min.` });
    if (newPassword.length < MIN_PASSWORD) return res.status(400).json({ error: `Mot de passe trop court (${MIN_PASSWORD} caractères minimum).` });
    const user = registeredUsers[pseudo];
    if (!user || !user.recoveryHash || !verifyPassword(code, user.recoveryHash)) {
        loginFailed(tk);
        return res.status(401).json({ error: 'Nom ou code de récupération incorrect.' });
    }
    loginOk(tk);
    const fresh = makeRecoveryCode();                 // le code servi est aussitôt remplacé
    user.passwordHash = hashPassword(newPassword);
    user.recoveryHash = hashPassword(fresh);
    saveUsers(true);
    setSessionCookie(res, pseudo);
    res.json({ ok: true, user: { pseudo }, recoveryCode: fresh });
});

// --- Nouveau code de récupération (connecté) ---
app.post('/api/new-code', requireAuthApi, (req, res) => {
    const user = registeredUsers[currentUser(req)];
    if (!user) return res.status(404).json({ error: 'Compte introuvable.' });
    const code = makeRecoveryCode();
    user.recoveryHash = hashPassword(code);
    saveUsers(true);
    res.json({ ok: true, recoveryCode: code });
});

app.post('/api/logout', (req, res) => {
    res.clearCookie('salon_session', { path: '/' });
    res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
    const pseudo = currentUser(req);
    if (!pseudo) return res.status(401).json({ error: 'Non connecté.' });
    res.json({ user: { pseudo, isAdmin: isAdmin(pseudo) } });
});

// ---------------------------------------------------------------------
//  Pages d'apps (protégées). Placeholder tant que l'app n'est pas branchée.
//  Chaque future mini-app aura son dossier dans public/ + sa route ici.
// ---------------------------------------------------------------------
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

// --- Stockage par CLÉS SÉPARÉES ---------------------------------------
//  Un cache mémoire sert les lectures ; seules les clés modifiées sont
//  réécrites (quelques centaines d'octets au lieu de tout le jeu de données).
//  Clés : mf:prog:<user>:<date>:<niv> · mf:board:<date>:<niv>
//         mf:grid:<date>:<niv> · mf:hist:<date> · mf:cmt:<date> · mf:days:<user>
const MF_KEEP_DAYS = 15;      // classements et messages
const MF_KEEP_GRIDS = 20;     // grilles et progressions (archives sur 14 jours)

let mfCache = {};
const mfDirty = new Set();
let _mfFlush = null;

function mfGet(k) { return mfCache[k]; }
function mfSet(k, v) { mfCache[k] = v; mfDirty.add(k); mfSchedule(); }
function mfDel(k) { delete mfCache[k]; mfDirty.add(k); mfSchedule(); }
function mfSchedule() { clearTimeout(_mfFlush); _mfFlush = setTimeout(mfFlush, 1200); }

async function mfFlush() {
    const keys = [...mfDirty];
    mfDirty.clear();
    if (!keys.length) return;
    if (redis) {
        for (const k of keys) {
            try {
                if (mfCache[k] === undefined) await redis.del(k);
                else await redis.set(k, mfCache[k]);
            } catch (e) { /* on réessaiera à la prochaine écriture */ }
        }
    } else {
        try { fs.writeFileSync('./mf_data.json', JSON.stringify(mfCache)); } catch (e) {}
    }
}

async function loadMf() {
    if (redis) {
        try {
            const keys = [...await redis.keys('mf:*'), ...await redis.keys('rec:*'), ...await redis.keys('motus:*')];
            for (let i = 0; i < keys.length; i += 50) {
                const chunk = keys.slice(i, i + 50);
                const vals = await redis.mget(...chunk);
                chunk.forEach((k, j) => { if (vals[j] != null) mfCache[k] = vals[j]; });
            }
            console.log(`🧩 ${keys.length} clé(s) mots fléchés chargée(s).`);
        } catch (e) { console.log('⚠️  Lecture Redis (mots fléchés) :', e.message); }
    } else {
        try { mfCache = JSON.parse(fs.readFileSync('./mf_data.json', 'utf-8')) || {}; } catch (e) { mfCache = {}; }
    }
    mfPurge();
}

// Ménage : on ne garde pas d'historique inutile
function mfPurge() {
    const today = mfTodayId();
    const limitShort = mfShiftDay(today, -MF_KEEP_DAYS);              // classements, messages
    const limitLong = mfShiftDay(today, -MF_KEEP_GRIDS);              // grilles, progressions
    const limitMotusWord = mfShiftDay(today, -MOTUS_KEEP_WORD_DAYS);  // mots du jour (recul pour la rotation)
    const limitMotusShort = mfShiftDay(today, -MOTUS_KEEP_SHORT_DAYS);
    let removed = 0;
    for (const k of Object.keys(mfCache)) {
        const parts = k.split(':');
        let date = null, limit = limitLong;
        if (parts[0] === 'motus') {
            if (parts[1] === 'word') { date = parts[2]; limit = limitMotusWord; }
            else if (parts[1] === 'board' || parts[1] === 'cmt') { date = parts[2]; limit = limitMotusShort; }
            else if (parts[1] === 'prog') { date = parts[3]; limit = limitMotusShort; }
        } else {
            if (parts[1] === 'board' || parts[1] === 'cmt') { date = parts[2]; limit = limitShort; }
            else if (parts[1] === 'grid' || parts[1] === 'hist') date = parts[2];
            else if (parts[1] === 'prog') date = parts[3];
        }
        if (date && /^\d{4}-\d{2}-\d{2}$/.test(date) && date < limit) { mfDel(k); removed++; }
    }
    // les séries de jours ne sont pas datées : on borne leur taille
    for (const k of Object.keys(mfCache)) {
        if ((k.startsWith('mf:days:') || k.startsWith('motus:days:')) && Array.isArray(mfCache[k]) && mfCache[k].length > 400) {
            mfSet(k, mfCache[k].slice(-400));
        }
    }
    if (removed) console.log(`🧹 ${removed} clé(s) purgée(s).`);
}
setInterval(mfPurge, 6 * 3600 * 1000);   // ménage toutes les 6 h

// --- Accès typés ---
const kProg = (u, d, l) => `mf:prog:${u}:${d}:${l}`;
const kBoard = (d, l) => `mf:board:${d}:${l}`;
const kGrid = (d, l) => `mf:grid:${d}:${l}`;
const kHist = (d) => `mf:hist:${d}`;
const kCmt = (d) => `mf:cmt:${d}`;
const kDays = (u) => `mf:days:${u}`;

// Grille (mise en cache) — rotation : on évite les mots des 15 derniers jours
function mfGrid(date, level) {
    const cached = mfGet(kGrid(date, level));
    if (cached) return cached;
    const recent = [];
    for (let i = 1; i <= 15; i++) {
        const h = mfGet(kHist(mfShiftDay(date, -i)));
        if (Array.isArray(h)) recent.push(...h);
    }
    const p = MF.generate(level, date, recent);
    mfSet(kGrid(date, level), p);
    const hist = mfGet(kHist(date)) || [];
    mfSet(kHist(date), hist.concat(p.wordList || []));
    return p;
}
function mfPublic(p) { return { date: p.date, level: p.level, levelLabel: p.levelLabel, rows: p.rows, cols: p.cols, grid: p.grid, defs: p.defs, words: p.words }; }
function mfBoard(date, level) {
    return (mfGet(kBoard(date, level)) || []).filter(e => !e.susp).slice().sort((a, b) => a.s - b.s);
}

// Série de jours consécutifs avec au moins une grille résolue
function mfStreak(user) {
    const days = new Set(mfGet(kDays(user)) || []);
    let cur = 0, d = mfTodayId();
    if (!days.has(d)) d = mfShiftDay(d, -1);
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
    const p = mfGet(kProg(currentUser(req), date, level)) || null;
    const elapsed = (p && p.startedAt && !p.solved && !p.gaveUp)
        ? Math.floor((Date.now() - p.startedAt) / 1000) + (p.penalty || 0)
        : (p ? (p.seconds || 0) : 0);
    res.json({ progress: p, elapsed });
});
app.post('/api/mf/start', requireAuth, (req, res) => {
    const level = mfLevel(req.body && req.body.level);
    const date = /^\d{4}-\d{2}-\d{2}$/.test((req.body && req.body.date) || '') ? req.body.date : mfTodayId();
    const key = kProg(currentUser(req), date, level);
    const p = mfGet(key) || { cells: {}, solved: false, gaveUp: false, seconds: 0, penalty: 0, hints: 0 };
    if (!p.startedAt) { p.startedAt = Date.now(); mfSet(key, p); }
    res.json({ ok: true, startedAt: p.startedAt, penalty: p.penalty || 0 });
});
app.post('/api/mf/progress', requireAuth, (req, res) => {
    const b = req.body || {};
    const level = mfLevel(b.level);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : mfTodayId();
    const key = kProg(currentUser(req), date, level);
    const clean = {};
    let n = 0;
    for (const k in (b.cells || {})) {
        if (n++ > 200) break;
        const v = String(b.cells[k] || '').toUpperCase().slice(0, 1);
        if (/^[A-Z]$/.test(v) && /^\d+,\d+$/.test(k)) clean[k] = v;
    }
    const prev = mfGet(key) || {};
    mfSet(key, { ...prev, cells: clean, ts: Date.now(), startedAt: prev.startedAt || Date.now() });
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
    const key = kProg(currentUser(req), date, level);
    const prog = mfGet(key);
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
    mfSet(key, prog);
    res.json({ ok: true, reveal, cost, penalty: prog.penalty, hints: prog.hints });
});

// --- Résolution : enregistrement du temps ---
app.post('/api/mf/solve', requireAuth, (req, res) => {
    const user = currentUser(req), today = mfTodayId();
    const level = mfLevel(req.body && req.body.level);
    const date = /^\d{4}-\d{2}-\d{2}$/.test((req.body && req.body.date) || '') ? req.body.date : today;
    const key = kProg(user, date, level);
    const prog = mfGet(key) || {};
    let sec = prog.startedAt ? Math.round((Date.now() - prog.startedAt) / 1000) : 0;
    sec += (prog.penalty || 0);
    if (!Number.isFinite(sec) || sec < 1) sec = 1;
    if (sec > 86400) sec = 86400;

    const isArchive = date !== today;
    const suspicious = sec < (MF_MIN_TIME[level] || 25);      // temps anormalement court
    if (!prog.solved) {
        mfSet(key, { ...prog, solved: true, seconds: sec, ts: Date.now() });
        if (!isArchive && !prog.gaveUp) {
            const list = (mfGet(kBoard(date, level)) || []).slice();
            if (!list.some(e => e.u === user)) { list.push({ u: user, s: sec, susp: suspicious }); mfSet(kBoard(date, level), list); }
            const days = (mfGet(kDays(user)) || []).slice();
            if (!days.includes(date)) { days.push(date); mfSet(kDays(user), days); }
        }
    }
    const board = mfBoard(date, level);
    res.json({
        ok: true, seconds: (mfGet(key) || {}).seconds || sec, isArchive, suspicious,
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
    const key = kProg(user, date, level);
    const p = mfGrid(date, level);
    const prog = mfGet(key) || {};
    if (!prog.solved) mfSet(key, { ...prog, gaveUp: true, ts: Date.now() });
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
        const p = mfGet(kProg(user, date, lv));
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
        const done = MF_LEVELS.filter(lv => (mfGet(kProg(user, d, lv)) || {}).solved).length;
        out.push({ date: d, done });
    }
    res.json({ days: out });
});

// --- Fil de discussion du jour ---
app.get('/api/mf/comments', requireAuth, (req, res) => {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : mfTodayId();
    res.json({ comments: (mfGet(kCmt(date)) || []).slice(-60) });
});
app.post('/api/mf/comments', requireAuth, (req, res) => {
    const user = currentUser(req), date = mfTodayId();
    const txt = String((req.body && req.body.text) || '').trim().slice(0, 240);
    if (!txt) return res.status(400).json({ error: 'Message vide.' });
    const list = (mfGet(kCmt(date)) || []).slice();
    const last = list.filter(c => c.u === user).slice(-1)[0];
    if (last && Date.now() - last.ts < 4000) return res.status(429).json({ error: 'Doucement !' });
    list.push({ u: user, t: escapeHtml(txt), ts: Date.now() });
    if (list.length > 200) list.splice(0, list.length - 200);
    mfSet(kCmt(date), list);
    res.json({ ok: true, comments: list.slice(-60) });
});

// ---------------------------------------------------------------------
//  MOTUS — mot du jour en 6 essais, première lettre révélée.
//  Même infrastructure que les mots fléchés (cache par clés, rotation,
//  classement, discussion) — juste un autre "jeu du jour".
// ---------------------------------------------------------------------
const motusDict = require('./motsfleches/dict');
const MOTUS_LEN = 6;
const MOTUS_TRIES = 6;
const MOTUS_KEEP_WORD_DAYS = 60;    // recul pour éviter les répétitions de mot
const MOTUS_KEEP_SHORT_DAYS = 15;   // classement / discussion / progression

function motusHashSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}
function motusRand(seed) {
    let a = seed | 0;
    return function () {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const kMotusWord = (d) => `motus:word:${d}`;
const kMotusProg = (u, d) => `motus:prog:${u}:${d}`;
const kMotusBoard = (d) => `motus:board:${d}`;
const kMotusCmt = (d) => `motus:cmt:${d}`;
const kMotusDays = (u) => `motus:days:${u}`;

// Mot du jour, déterministe (même mot pour tout le monde), sans répétition récente.
function motusWord(date) {
    const cached = mfGet(kMotusWord(date));
    if (cached) return cached;
    const pool = (motusDict.words()[MOTUS_LEN] || []).filter(w => w.n <= 2);
    const recent = new Set();
    for (let i = 1; i <= MOTUS_KEEP_WORD_DAYS; i++) {
        const w = mfGet(kMotusWord(mfShiftDay(date, -i)));
        if (w) recent.add(w);
    }
    let candidates = pool.filter(w => !recent.has(w.m));
    if (!candidates.length) candidates = pool;
    const rnd = motusRand(motusHashSeed('motus|' + date));
    const pick = candidates[Math.floor(rnd() * candidates.length)] || pool[0];
    mfSet(kMotusWord(date), pick.m);
    return pick.m;
}
// Comparaison à la Wordle, robuste aux lettres répétées.
function motusMarks(guess, answer) {
    const res = Array(MOTUS_LEN).fill('absent');
    const counts = {};
    for (let i = 0; i < MOTUS_LEN; i++) {
        if (guess[i] === answer[i]) res[i] = 'correct';
        else counts[answer[i]] = (counts[answer[i]] || 0) + 1;
    }
    for (let i = 0; i < MOTUS_LEN; i++) {
        if (res[i] === 'correct') continue;
        const ch = guess[i];
        if (counts[ch] > 0) { res[i] = 'present'; counts[ch]--; }
    }
    return res;
}
function motusStreak(user) {
    const days = new Set(mfGet(kMotusDays(user)) || []);
    let cur = 0, d = mfTodayId();
    if (!days.has(d)) d = mfShiftDay(d, -1);
    while (days.has(d)) { cur++; d = mfShiftDay(d, -1); }
    return { current: cur, total: days.size };
}
function motusBoard(date) {
    return (mfGet(kMotusBoard(date)) || []).slice().sort((a, b) => a.tries - b.tries || a.ts - b.ts);
}
function motusDefFor(word) {
    const found = motusDict.find(word);
    if (!found || !found.defs || !found.defs.length) return '';
    return found.defs[0];
}

app.use('/motus', requireAuth, express.static(__dirname + '/public/motus'));

app.get('/api/motus/today', requireAuth, (req, res) => {
    const user = currentUser(req), today = mfTodayId();
    let date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : today;
    if (date > today) date = today;
    const word = motusWord(date);
    const prog = mfGet(kMotusProg(user, date)) || null;
    const finished = !!(prog && (prog.solved || prog.gaveUp));
    res.json({
        date, today, isArchive: date !== today, nextIn: mfSecondsToMidnight(),
        length: MOTUS_LEN, firstLetter: word[0],
        progress: prog,
        answer: finished ? word : undefined,
        definition: finished ? motusDefFor(word) : undefined,
    });
});

app.post('/api/motus/guess', requireAuth, (req, res) => {
    const b = req.body || {};
    const user = currentUser(req), today = mfTodayId();
    const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : today;
    const word = motusWord(date);
    const key = kMotusProg(user, date);
    const prog = mfGet(key) || { guesses: [], solved: false, gaveUp: false, startedAt: Date.now() };
    if (prog.solved || prog.gaveUp) return res.status(400).json({ error: 'La partie est déjà terminée.' });
    if (prog.guesses.length >= MOTUS_TRIES) return res.status(400).json({ error: 'Plus de tentative disponible.' });

    let guess = String(b.guess || '').toUpperCase().trim();
    if (guess.length !== MOTUS_LEN || !/^[A-Z]+$/.test(guess)) return res.status(400).json({ error: `Un mot de ${MOTUS_LEN} lettres, sans accent.` });
    if (guess[0] !== word[0]) return res.status(400).json({ error: `Le mot commence par ${word[0]}.` });
    const known = (motusDict.words()[MOTUS_LEN] || []).some(w => w.m === guess);
    if (!known && guess !== word) return res.status(400).json({ error: "Ce mot n'est pas dans le dictionnaire." });

    const marks = motusMarks(guess, word);
    const solved = guess === word;
    prog.guesses.push({ word: guess, marks });
    if (solved) prog.solved = true;
    prog.startedAt = prog.startedAt || Date.now();
    mfSet(key, prog);

    const lost = !solved && prog.guesses.length >= MOTUS_TRIES;
    let rank = null, board = [];
    if (solved && date === today) {
        const list = (mfGet(kMotusBoard(date)) || []).slice();
        if (!list.some(e => e.u === user)) {
            list.push({ u: user, tries: prog.guesses.length, ts: Date.now() });
            mfSet(kMotusBoard(date), list);
        }
        const days = (mfGet(kMotusDays(user)) || []).slice();
        if (!days.includes(date)) { days.push(date); mfSet(kMotusDays(user), days); }
    }
    if (solved || lost) {
        board = motusBoard(date);
        rank = board.findIndex(e => e.u === user) + 1;
    }
    res.json({
        ok: true, marks, solved, lost,
        guesses: prog.guesses.length, triesLeft: MOTUS_TRIES - prog.guesses.length,
        answer: (solved || lost) ? word : undefined,
        definition: (solved || lost) ? motusDefFor(word) : undefined,
        rank: rank || undefined, total: board.length || undefined,
        streak: solved ? motusStreak(user) : undefined,
    });
});

app.post('/api/motus/giveup', requireAuth, (req, res) => {
    const user = currentUser(req);
    const date = /^\d{4}-\d{2}-\d{2}$/.test((req.body && req.body.date) || '') ? req.body.date : mfTodayId();
    const word = motusWord(date);
    const key = kMotusProg(user, date);
    const prog = mfGet(key) || { guesses: [], solved: false, gaveUp: false };
    if (!prog.solved) { prog.gaveUp = true; mfSet(key, prog); }
    res.json({ ok: true, answer: word, definition: motusDefFor(word) });
});

app.get('/api/motus/board', requireAuth, (req, res) => {
    const user = currentUser(req);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : mfTodayId();
    const board = motusBoard(date);
    res.json({ board: board.map(e => ({ u: e.u, tries: e.tries })), me: board.findIndex(e => e.u === user) + 1 });
});
app.get('/api/motus/state', requireAuth, (req, res) => {
    const user = currentUser(req);
    const date = mfTodayId();
    const p = mfGet(kMotusProg(user, date));
    const state = !p ? 'neuf' : (p.solved ? 'fini' : (p.gaveUp || (p.guesses || []).length >= MOTUS_TRIES ? 'abandon' : 'encours'));
    res.json({ state, streak: motusStreak(user), nextIn: mfSecondsToMidnight() });
});
app.get('/api/motus/archive', requireAuth, (req, res) => {
    const user = currentUser(req), today = mfTodayId();
    const out = [];
    for (let i = 1; i <= 14; i++) {
        const d = mfShiftDay(today, -i);
        const p = mfGet(kMotusProg(user, d));
        out.push({ date: d, solved: !!(p && p.solved), tries: p ? (p.guesses || []).length : 0 });
    }
    res.json({ days: out });
});

app.get('/api/motus/comments', requireAuth, (req, res) => {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : mfTodayId();
    res.json({ comments: (mfGet(kMotusCmt(date)) || []).slice(-60) });
});
app.post('/api/motus/comments', requireAuth, (req, res) => {
    const user = currentUser(req), date = mfTodayId();
    const txt = String((req.body && req.body.text) || '').trim().slice(0, 240);
    if (!txt) return res.status(400).json({ error: 'Message vide.' });
    const list = (mfGet(kMotusCmt(date)) || []).slice();
    const last = list.filter(c => c.u === user).slice(-1)[0];
    if (last && Date.now() - last.ts < 4000) return res.status(429).json({ error: 'Doucement !' });
    list.push({ u: user, t: escapeHtml(txt), ts: Date.now() });
    if (list.length > 200) list.splice(0, list.length - 200);
    mfSet(kMotusCmt(date), list);
    res.json({ ok: true, comments: list.slice(-60) });
});

// ---------------------------------------------------------------------
//  PERUDO — jeu temps réel, intégré au monolithe sous /perudo.
//  Le front est protégé par le login du salon ; /perudo/healthz reste public.
// ---------------------------------------------------------------------
const perudoApi = require('./perudo/game')(app, io);
app.use('/perudo', requireAuth, express.static(__dirname + '/public/perudo'));

// ---------------------------------------------------------------------
//  RECETTES — carnet partagé du cercle
//  Stockage : une clé par recette (rec:<id>) via le cache mfGet/mfSet.
//  Photos : compressées côté client ; le serveur borne (miniature + grande).
// ---------------------------------------------------------------------
const REC_CATEGORIES = ['entree', 'plat', 'dessert', 'apero', 'boisson'];
const REC_DIFFICULTIES = ['facile', 'moyen', 'difficile'];
const REC_TAGS = ['vege', 'vegan', 'sans-gluten', 'rapide', 'sans-cuisson', 'epice'];

function recClean(v, max) {
    if (typeof v !== 'string') return '';
    return v.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);
}
function recImage(v, maxLen) {
    if (typeof v !== 'string' || !v.startsWith('data:image/')) return null;
    if (v.length > maxLen) return null;
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v)) return null;
    return v;
}
function recSanitize(input) {
    if (!input || typeof input !== 'object') return null;
    const title = recClean(input.title, 120);
    if (!title) return null;
    return {
        title,
        category: REC_CATEGORIES.includes(input.category) ? input.category : 'plat',
        difficulty: REC_DIFFICULTIES.includes(input.difficulty) ? input.difficulty : 'facile',
        prepTime: Math.max(0, Math.min(600, Math.round(Number(input.prepTime) || 0))),
        servings: Math.max(1, Math.min(50, Math.round(Number(input.servings) || 1))),
        tags: Array.isArray(input.tags) ? input.tags.filter(t => REC_TAGS.includes(t)).slice(0, 6) : [],
        ingredients: Array.isArray(input.ingredients)
            ? input.ingredients.slice(0, 40).map(i => ({
                name: recClean(i && i.name, 80),
                qty: recClean(String((i && i.qty) != null ? i.qty : ''), 20),
                unit: recClean(i && i.unit, 20),
              })).filter(i => i.name)
            : [],
        steps: Array.isArray(input.steps) ? input.steps.map(st => recClean(st, 500)).filter(Boolean).slice(0, 40) : [],
        image: recImage(input.image, 420000),        // grande photo ≈ 300 Ko utiles
        thumb: recImage(input.thumb, 50000),         // miniature pour la liste
    };
}
function recAll() {
    return Object.entries(mfCache)
        .filter(([k]) => k.startsWith('rec:'))
        .map(([, v]) => v)
        .filter(Boolean)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}
function recCanEdit(req, r) {
    const u = currentUser(req);
    return r && (r.author === u || isAdmin(u));
}
const recLastAdd = new Map();          // anti-spam léger : 1 ajout / 3 s / utilisateur

// Liste (légère : miniatures, jamais les grandes photos)
app.get('/api/rec/list', requireAuthApi, (req, res) => {
    const me = currentUser(req);
    res.json({
        me: { pseudo: me, isAdmin: isAdmin(me) },
        recipes: recAll().map(r => ({
            id: r.id, title: r.title, category: r.category, difficulty: r.difficulty,
            prepTime: r.prepTime, servings: r.servings, tags: r.tags,
            author: r.author, createdAt: r.createdAt, thumb: r.thumb || null,
            nIngredients: (r.ingredients || []).length, nSteps: (r.steps || []).length,
        })),
    });
});

// Fiche complète
app.get('/api/rec/one', requireAuthApi, (req, res) => {
    const r = mfGet('rec:' + String(req.query.id || ''));
    if (!r) return res.status(404).json({ error: 'Recette introuvable.' });
    res.json({ recipe: r, canEdit: recCanEdit(req, r) });
});

app.post('/api/rec/add', requireAuthApi, (req, res) => {
    const me = currentUser(req);
    const last = recLastAdd.get(me) || 0;
    if (Date.now() - last < 3000) return res.status(429).json({ error: 'Doucement ! Réessaie dans un instant.' });
    const data = recSanitize(req.body);
    if (!data) return res.status(400).json({ error: 'Il manque au moins un titre.' });
    const recipe = { id: crypto.randomUUID(), ...data, author: me, createdAt: Date.now() };
    mfSet('rec:' + recipe.id, recipe);
    recLastAdd.set(me, Date.now());
    res.json({ ok: true, id: recipe.id });
});

app.post('/api/rec/update', requireAuthApi, (req, res) => {
    const key = 'rec:' + String((req.body && req.body.id) || '');
    const existing = mfGet(key);
    if (!existing) return res.status(404).json({ error: 'Recette introuvable.' });
    if (!recCanEdit(req, existing)) return res.status(403).json({ error: 'Seul l’auteur peut modifier cette recette.' });
    const data = recSanitize(req.body);
    if (!data) return res.status(400).json({ error: 'Il manque au moins un titre.' });
    // sans nouvelle photo envoyée, on garde l'ancienne
    if (!data.image && !(req.body && req.body.removeImage)) { data.image = existing.image; data.thumb = existing.thumb; }
    mfSet(key, { ...existing, ...data, editedAt: Date.now() });
    res.json({ ok: true });
});

app.post('/api/rec/delete', requireAuthApi, (req, res) => {
    const key = 'rec:' + String((req.body && req.body.id) || '');
    const existing = mfGet(key);
    if (!existing) return res.status(404).json({ error: 'Recette introuvable.' });
    if (!recCanEdit(req, existing)) return res.status(403).json({ error: 'Seul l’auteur peut supprimer cette recette.' });
    mfDel(key);
    res.json({ ok: true });
});

app.use('/recettes', requireAuth, express.static(__dirname + '/public/recettes'));

// ---------------------------------------------------------------------
//  API DU SALON — pouls des apps et profil personnel
// ---------------------------------------------------------------------
const SALON_AVATARS = ['🦊','🐺','🦉','🐙','🦈','🐉','🦜','🐢','🦁','🐸','🦄','👻','🤖','☠️','🎩','🌙','⚓','🌊','🔥','✦'];

app.get('/api/salon/pulse', requireAuthApi, (req, res) => {
    const user = currentUser(req);
    const today = mfTodayId();
    let done = 0;
    for (const lv of MF_LEVELS) {
        const p = mfGet(`mf:prog:${user}:${today}:${lv}`);
        if (p && p.solved) done++;
    }
    let online = 0, games = 0;
    try { online = perudoApi.online().length; games = perudoApi.games().filter(g => !g.vsBot).length; } catch (e) {}
    // série mots fléchés
    const days = new Set(mfGet(`mf:days:${user}`) || []);
    let streak = 0, d = today;
    if (!days.has(d)) d = mfShiftDay(d, -1);
    while (days.has(d)) { streak++; d = mfShiftDay(d, -1); }
    const recs = recAll();
    const recNew = recs.filter(r => Date.now() - (r.createdAt || 0) < 7 * 864e5).length;
    const motusProg = mfGet(kMotusProg(user, today));
    const motusDone = !!(motusProg && motusProg.solved);
    const motusOver = !!(motusProg && (motusProg.solved || motusProg.gaveUp || (motusProg.guesses || []).length >= MOTUS_TRIES));
    const motusSolversToday = (mfGet(kMotusBoard(today)) || []).length;
    res.json({
        mf: { done, total: MF_LEVELS.length, streak }, perudo: { online, games },
        rec: { count: recs.length, fresh: recNew },
        motus: { done: motusDone, over: motusOver, solvers: motusSolversToday },
    });
});

app.get('/api/salon/profile', requireAuthApi, (req, res) => {
    const user = registeredUsers[currentUser(req)];
    if (!user) return res.status(404).json({ error: 'Compte introuvable.' });
    const pseudo = user.pseudo;
    // stats mots fléchés
    let solved = 0, best = null;
    for (const [k, v] of Object.entries(mfCache)) {
        if (!k.startsWith(`mf:prog:${pseudo}:`) || !v || !v.solved) continue;
        solved++;
        if (v.seconds && (!best || v.seconds < best)) best = v.seconds;
    }
    const days = new Set(mfGet(`mf:days:${pseudo}`) || []);
    let streak = 0, d = mfTodayId();
    if (!days.has(d)) d = mfShiftDay(d, -1);
    while (days.has(d)) { streak++; d = mfShiftDay(d, -1); }
    // stats perudo
    let perudo = null;
    try {
        const pu = perudoApi.users()[pseudo];
        if (pu) perudo = { wins: pu.wins || 0, played: pu.played || 0, rankPoints: pu.rankPoints || 0 };
    } catch (e) {}
    res.json({
        pseudo, avatar: user.avatar || '',
        created: user.created || 0, prevLogin: user.prevLogin || 0,
        isAdmin: isAdmin(pseudo),
        mf: { solved, best, streak, days: days.size },
        perudo,
        avatars: SALON_AVATARS,
    });
});

app.post('/api/salon/profile', requireAuthApi, (req, res) => {
    const user = registeredUsers[currentUser(req)];
    if (!user) return res.status(404).json({ error: 'Compte introuvable.' });
    const av = String((req.body && req.body.avatar) || '');
    if (av !== '' && !SALON_AVATARS.includes(av)) return res.status(400).json({ error: 'Avatar invalide.' });
    user.avatar = av;
    saveUsers();
    res.json({ ok: true, avatar: av });
});

// ---------------------------------------------------------------------
//  ADMINISTRATION — espace réservé (voir admin/routes.js)
// ---------------------------------------------------------------------
function requireAdmin(req, res, next) {
    const u = currentUser(req);
    if (u && isAdmin(u)) return next();
    if (req.path.startsWith('/api/')) return res.status(403).json({ error: 'Accès réservé.' });
    return res.redirect('/');
}
app.use('/admin', requireAdmin, express.static(__dirname + '/public/admin'));
require('./admin/routes')(app, {
    requireAdmin, currentUser, isAdmin, isRootAdmin, allAdmins, rootAdmins: ROOT_ADMINS,
    users: () => registeredUsers,
    saveUsers, hashPassword, makeRecoveryCode,
    mf: { get: mfGet, set: mfSet, del: mfDel, cache: () => mfCache, purge: mfPurge, levels: MF_LEVELS, today: mfTodayId, shift: mfShiftDay },
    redis: () => redis,
    perudo: () => perudoApi,
});


// ---------------------------------------------------------------------
//  Statique (le salon) + Socket.io prêt pour les apps temps réel.
// ---------------------------------------------------------------------
app.use(express.static('public'));

io.on('connection', (socket) => {
    // Prêt pour Perudo & co. Le salon lui-même n'a pas besoin de temps réel.
});

// Filet de sécurité : aucune erreur ne doit faire tomber le serveur
app.use((err, req, res, next) => {
    console.error('Erreur non gérée :', err && err.message);
    if (res.headersSent) return next(err);
    if (req.path.startsWith('/api/')) return res.status(500).json({ error: 'Erreur interne.' });
    res.status(500).send('Une erreur est survenue. <a href="/">Retour au salon</a>');
});
process.on('unhandledRejection', (e) => console.error('Promesse rejetée :', e && e.message));

const PORT = process.env.PORT || 3000;
Promise.all([loadUsers(), loadMf()]).then(() => {
    server.listen(PORT, () => console.log(`🏛️  Le Salon tourne sur le port ${PORT}`));
});