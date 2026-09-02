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

// En-têtes de sécurité. Le salon n'en posait aucun : rien n'empêchait de
// l'afficher dans une iframe sur un autre site, ni de laisser fuiter l'URL
// complète dans le référent.
//
// La CSP autorise 'unsafe-inline' pour les styles et les scripts parce que
// plusieurs pages posent des styles en ligne (l'accent des tuiles, la taille
// des cases) et de petits scripts d'amorçage. La resserrer demanderait de
// passer ces cas en nonces — à faire, mais pas au prix de casser le site.
//
// Les hôtes externes autorisés ne sont pas décoratifs, chacun est utilisé :
// Google Fonts (polices du salon), unpkg (Leaflet, la carte des Monts d'Arrée),
// OpenStreetMap (ses tuiles) et Open-Meteo (la météo du voyage). Retirer l'un
// d'eux casse une page — vérifier avant de toucher à cette liste.
const CSP_POLICE = 'https://fonts.googleapis.com https://fonts.gstatic.com';
const CSP_CARTE = 'https://unpkg.com https://*.tile.openstreetmap.org https://tile.openstreetmap.org';
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', [
        "default-src 'self'",
        `script-src 'self' 'unsafe-inline' https://unpkg.com`,
        `style-src 'self' 'unsafe-inline' ${CSP_POLICE} https://unpkg.com`,
        `img-src 'self' data: blob: ${CSP_CARTE}`,   // avatars base64, aperçus, tuiles
        "media-src 'self'",
        `connect-src 'self' ws: wss: https://api.open-meteo.com ${CSP_CARTE}`,
        `font-src 'self' data: ${CSP_POLICE}`,
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ].join('; '));
    next();
});

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
    const u = currentUser(req);
    if (!u) return res.status(401).json({ error: 'Non connecté.' });
    // Le salon interroge /api/salon/pulse toutes les 60s tant que la page est ouverte :
    // s'en servir pour un vrai statut « en ligne maintenant », précis à ~90s près.
    const user = registeredUsers[u];
    if (user && (!user.lastSeen || Date.now() - user.lastSeen > 30 * 1000)) {
        user.lastSeen = Date.now();
        saveUsers();
    }
    return next();
}

// Middleware : protège les pages d'apps (redirige vers le salon si non connecté)
function requireAuth(req, res, next) {
    const u = currentUser(req);
    if (!u) return res.redirect('/');
    // « Vu pour la dernière fois » doit refléter l'usage réel, pas juste le moment où on a
    // tapé son mot de passe (le cookie de session dure des semaines, donc l'immense majorité
    // des visites ne repassent jamais par /api/login). Mise à jour discrète, pas à chaque requête.
    const user = registeredUsers[u];
    if (user && (!user.lastSeen || Date.now() - user.lastSeen > 5 * 60 * 1000)) {
        user.lastSeen = Date.now();
        saveUsers();
    }
    return next();
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
const { planifierRenommage, appliquerPlan } = require('./comptes/renommage');
const { calculerClassement, BAREME, bornesSaison } = require('./comptes/classement');
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
            const keys = [...await redis.keys('mf:*'), ...await redis.keys('rec:*'), ...await redis.keys('motus:*'), ...await redis.keys('mj:*'), ...await redis.keys('pbac:*'), ...await redis.keys('voyages:*')];
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
    // Vocabulaire du Mot Juste ajouté depuis l'admin (persisté à part des overrides du dictionnaire)
    const mjCustom = mfCache['mj:custom'] || {};
    for (const [word, vec] of Object.entries(mjCustom)) mjEngine.addCustomWord(word, vec);
    if (Object.keys(mjCustom).length) console.log(`🧊 ${Object.keys(mjCustom).length} mot(s) personnalisé(s) du Mot Juste chargé(s).`);
    mfPurge();
}

// Ménage : on ne garde pas d'historique inutile
function mfPurge() {
    const today = mfTodayId();
    const limitShort = mfShiftDay(today, -MF_KEEP_DAYS);              // classements, messages
    const limitLong = mfShiftDay(today, -MF_KEEP_GRIDS);              // grilles, progressions
    const limitMotusWord = mfShiftDay(today, -MOTUS_KEEP_WORD_DAYS);  // mots du jour (recul pour la rotation)
    const limitMotusShort = mfShiftDay(today, -MOTUS_KEEP_SHORT_DAYS);
    const limitMjWord = mfShiftDay(today, -MJ_KEEP_WORD_DAYS);
    const limitMjShort = mfShiftDay(today, -MJ_KEEP_SHORT_DAYS);
    let removed = 0;
    for (const k of Object.keys(mfCache)) {
        const parts = k.split(':');
        let date = null, limit = limitLong;
        if (parts[0] === 'motus') {
            if (parts[1] === 'word') { date = parts[2]; limit = limitMotusWord; }
            else if (parts[1] === 'board' || parts[1] === 'cmt') { date = parts[2]; limit = limitMotusShort; }
            else if (parts[1] === 'prog') { date = parts[3]; limit = limitMotusShort; }
        } else if (parts[0] === 'mj') {
            if (parts[1] === 'word') { date = parts[2]; limit = limitMjWord; }
            else if (parts[1] === 'board' || parts[1] === 'cmt') { date = parts[2]; limit = limitMjShort; }
            else if (parts[1] === 'prog') { date = parts[3]; limit = limitMjShort; }
        } else {
            if (parts[1] === 'board' || parts[1] === 'cmt') { date = parts[2]; limit = limitShort; }
            else if (parts[1] === 'grid' || parts[1] === 'hist') date = parts[2];
            else if (parts[1] === 'prog') date = parts[3];
        }
        if (date && /^\d{4}-\d{2}-\d{2}$/.test(date) && date < limit) { mfDel(k); removed++; }
    }
    // les séries de jours ne sont pas datées : on borne leur taille
    for (const k of Object.keys(mfCache)) {
        if ((k.startsWith('mf:days:') || k.startsWith('motus:days:') || k.startsWith('mj:days:')) && Array.isArray(mfCache[k]) && mfCache[k].length > 400) {
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
// Lots de vocabulaire complémentaire, rangés par longueur de mot. Chaque lot a été
// extrait par fréquence d'usage réelle (wordfreq) puis vérifié orthographiquement
// (hunspell fr_FR).
//
// SOURCE UNIQUE, volontairement : ce tableau alimente à la fois motusPool() (tirage
// du mot du jour) et motusKnown() (validation des tentatives). Les deux fonctions
// énuméraient les lots à la main chacune de leur côté et avaient fini par diverger —
// certains lots étaient tirables comme mot du jour mais refusés comme tentative,
// rendant le mot du jour intapable. Pour ajouter une vague : une seule ligne ici.
const motusLexTirables = require('./motus/lexique-tirables');
const MOTUS_EXTRA = {
    4: [require('./motus/words4-extra2'), motusLexTirables[4]],
    5: [require('./motus/words5-extra'), motusLexTirables[5]],
    6: [require('./motus/words6'), require('./motus/words6-extra4'), motusLexTirables[6]],
    7: [require('./motus/words7-extra4'), motusLexTirables[7]],
};
const motusExtra = require('./motus/wordsExtra'); // vocabulaire élargi (4 à 7 lettres, filtré automatiquement)
// Mots acceptés en tentative mais jamais tirés : de vrais mots français, trop
// rares pour être devinables en 6 essais. Le but est de ne jamais bloquer
// quelqu'un qui propose un mot correct.
const motusLexAcceptes = require('./motus/lexique-acceptes');
const MOTUS_LENGTHS = [4, 5, 6, 7];               // longueur du mot du jour, variable
const MOTUS_TRIES = 6;
const MOTUS_KEEP_WORD_DAYS = 60;    // recul pour éviter les répétitions de mot
const MOTUS_KEEP_SHORT_DAYS = 15;   // classement / discussion / progression

// Pool complet pour le tirage du mot du jour, pour une longueur donnée : les mots
// courants du dictionnaire des mots fléchés (déjà vérifiés, utilisés en production pour
// les grilles) + le vocabulaire complémentaire pour les 6 lettres, sans doublons.
// Le vocabulaire élargi (wordsExtra) n'est volontairement jamais tiré comme mot du
// jour : il peut contenir des mots plus rares, il ne sert qu'à valider les essais.
function motusPool(len) {
    const base = (motusDict.words()[len] || []).filter(w => w.n <= 2).map(w => w.m);
    // Le dédoublonnage se fait aussi ENTRE les lots, pas seulement contre le
    // dictionnaire : deux lots partageant un mot le rendaient deux fois plus
    // probable au tirage.
    const seen = new Set(base);
    const pool = [...base];
    for (const lot of (MOTUS_EXTRA[len] || [])) {
        for (const mot of lot) if (!seen.has(mot)) { seen.add(mot); pool.push(mot); }
    }
    return pool;
}
// Mots acceptés en tentative : plus permissif (inclut aussi les mots rares du
// dictionnaire pour cette longueur, et le vocabulaire élargi), pour ne jamais bloquer
// un joueur qui propose un mot correct mais rare.
function motusKnown(guess) {
    const len = guess.length;
    // Tout ce qui est tirable est forcément acceptable : même source que motusPool().
    if ((MOTUS_EXTRA[len] || []).some(lot => lot.includes(guess))) return true;
    if (motusExtra[len] && motusExtra[len].includes(guess)) return true;
    if (motusLexAcceptes[len] && motusLexAcceptes[len].includes(guess)) return true;
    return (motusDict.words()[len] || []).some(w => w.m === guess);
}
// La longueur du jour est déterministe (même seed que le choix du mot), pour que tout
// le monde ait la même longueur ce jour-là — pas de vrai MOTUS_LEN fixe, on calcule à
// la volée pour chaque date demandée.
function motusLenForDate(date) {
    const rnd = motusRand(motusHashSeed('motuslen|' + date));
    return MOTUS_LENGTHS[Math.floor(rnd() * MOTUS_LENGTHS.length)];
}

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
const kMotusBestStreak = (u) => `motus:beststreak:${u}`;

// Mot du jour, déterministe (même mot pour tout le monde), sans répétition récente.
function motusWord(date) {
    const cached = mfGet(kMotusWord(date));
    if (cached) return cached;
    const pool = motusPool(motusLenForDate(date));
    const recent = new Set();
    for (let i = 1; i <= MOTUS_KEEP_WORD_DAYS; i++) {
        const w = mfGet(kMotusWord(mfShiftDay(date, -i)));
        if (w) recent.add(w);
    }
    let candidates = pool.filter(m => !recent.has(m));
    if (!candidates.length) candidates = pool;
    const rnd = motusRand(motusHashSeed('motus|' + date));
    const pick = candidates[Math.floor(rnd() * candidates.length)] || pool[0];
    mfSet(kMotusWord(date), pick);
    return pick;
}
// Comparaison à la Wordle, robuste aux lettres répétées.
function motusMarks(guess, answer) {
    const len = answer.length;
    const res = Array(len).fill('absent');
    const counts = {};
    for (let i = 0; i < len; i++) {
        if (guess[i] === answer[i]) res[i] = 'correct';
        else counts[answer[i]] = (counts[answer[i]] || 0) + 1;
    }
    for (let i = 0; i < len; i++) {
        if (res[i] === 'correct') continue;
        const ch = guess[i];
        if (counts[ch] > 0) { res[i] = 'present'; counts[ch]--; }
    }
    return res;
}
// Aperçu du mot d'un jour à venir, SANS le figer en base (pour l'admin).
function motusWordPreview(date) {
    const cached = mfGet(kMotusWord(date));
    if (cached) return cached;
    const pool = motusPool(motusLenForDate(date));
    const recent = new Set();
    for (let i = 1; i <= MOTUS_KEEP_WORD_DAYS; i++) {
        const w = mfGet(kMotusWord(mfShiftDay(date, -i)));
        if (w) recent.add(w);
    }
    let candidates = pool.filter(m => !recent.has(m));
    if (!candidates.length) candidates = pool;
    const rnd = motusRand(motusHashSeed('motus|' + date));
    const pick = candidates[Math.floor(rnd() * candidates.length)] || pool[0];
    return pick;
}
function motusStreak(user) {
    const days = new Set(mfGet(kMotusDays(user)) || []);
    let cur = 0, d = mfTodayId();
    if (!days.has(d)) d = mfShiftDay(d, -1);
    while (days.has(d)) { cur++; d = mfShiftDay(d, -1); }
    const storedBest = mfGet(kMotusBestStreak(user)) || 0;
    const best = Math.max(storedBest, cur);
    return { current: cur, total: days.size, best };
}
function motusBoard(date) {
    return (mfGet(kMotusBoard(date)) || []).filter(e => !e.susp).slice().sort((a, b) => a.tries - b.tries || a.ts - b.ts);
}
function motusDefFor(word) {
    const found = motusDict.find(word);
    if (!found || !found.defs || !found.defs.length) return '';
    return found.defs[0];
}

// Le hub Motus n'existait que pour offrir deux liens : le jeu du jour, passé
// dans le panneau « Aujourd'hui » du salon, et Motus Party, passé dans /jouer/.
// On redirige plutôt que de supprimer : des liens et des favoris pointent
// encore sur /motus/, et Motus est l'app la plus utilisée du site.
app.get(['/motus', '/motus/'], requireAuth, (req, res) => res.redirect(302, '/motus/quotidien/'));
app.use('/motus', requireAuth, express.static(__dirname + '/public/motus'));
app.use('/profil', requireAuth, express.static(__dirname + '/public/profil'));
const motusPartyApi = require('./motusparty/game')(app, io, {
    motusPool, motusKnown, motusMarks, motusDef: motusDefFor,
    get: mfGet, set: mfSet,
});

app.get('/api/motus/today', requireAuth, (req, res) => {
    const user = currentUser(req), today = mfTodayId();
    let date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : today;
    if (date > today) date = today;
    const word = motusWord(date);
    const prog = mfGet(kMotusProg(user, date)) || null;
    const finished = !!(prog && (prog.solved || prog.gaveUp || prog.lost));
    res.json({
        date, today, isArchive: date !== today, nextIn: mfSecondsToMidnight(),
        length: word.length, firstLetter: word[0],
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
    if (prog.solved || prog.gaveUp || prog.lost) return res.status(400).json({ error: 'La partie est déjà terminée.' });
    if (prog.guesses.length >= MOTUS_TRIES) return res.status(400).json({ error: 'Plus de tentative disponible.' });

    let guess = String(b.guess || '').toUpperCase().trim();
    if (guess.length !== word.length || !/^[A-Z]+$/.test(guess)) return res.status(400).json({ error: `Un mot de ${word.length} lettres, sans accent.` });
    if (guess[0] !== word[0]) return res.status(400).json({ error: `Le mot commence par ${word[0]}.` });
    const known = motusKnown(guess);
    if (!known && guess !== word) return res.status(400).json({ error: "Ce mot n'est pas dans le dictionnaire." });

    const marks = motusMarks(guess, word);
    const solved = guess === word;
    prog.guesses.push({ word: guess, marks });
    if (solved) prog.solved = true;
    prog.startedAt = prog.startedAt || Date.now();

    const lost = !solved && prog.guesses.length >= MOTUS_TRIES;
    if (lost) prog.lost = true;   // sinon une défaite par épuisement des essais ne se distingue jamais d'une partie en cours
    mfSet(key, prog);

    let rank = null, board = [];
    if (solved && date === today) {
        const list = (mfGet(kMotusBoard(date)) || []).slice();
        if (!list.some(e => e.u === user)) {
            list.push({ u: user, tries: prog.guesses.length, ts: Date.now() });
            mfSet(kMotusBoard(date), list);
        }
        const days = (mfGet(kMotusDays(user)) || []).slice();
        if (!days.includes(date)) { days.push(date); mfSet(kMotusDays(user), days); }
        const freshStreak = motusStreak(user);
        if (freshStreak.current > (mfGet(kMotusBestStreak(user)) || 0)) mfSet(kMotusBestStreak(user), freshStreak.current);

        // Diffusion en direct : tout le monde connecté voit apparaître la résolution
        // au moment où elle se produit, façon "on joue en même temps".
        const liveBoard = motusBoard(date);
        const liveRank = liveBoard.findIndex(e => e.u === user) + 1;
        io.to('motus_room').emit('motus_live_solve', { pseudo: user, tries: prog.guesses.length, rank: liveRank, first: liveRank === 1 });
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
app.get('/api/motus/mystats', requireAuth, (req, res) => {
    const user = currentUser(req);
    const stats = dailyGameStats('motus:prog', user, u => kMotusDays(u), u => motusStreak(u));
    res.json(stats);
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

// La discussion du jour porte forcément sur le mot du jour : l'ouvrir avant
// d'avoir joué, c'est s'exposer au spoiler. Le sous-titre « pas de spoilers »
// n'était qu'une prière — ici c'est le serveur qui garantit, pas l'interface.
// Les archives restent librement lisibles : leur mot est déjà connu.
function motusManchePassee(user, date) {
    const p = mfGet(kMotusProg(user, date));
    return !!(p && (p.solved || p.gaveUp || (p.guesses || []).length >= MOTUS_TRIES));
}
app.get('/api/motus/comments', requireAuth, (req, res) => {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : mfTodayId();
    if (date === mfTodayId() && !motusManchePassee(currentUser(req), date)) {
        return res.json({ locked: true, comments: [] });
    }
    res.json({ comments: (mfGet(kMotusCmt(date)) || []).slice(-60) });
});
app.post('/api/motus/comments', requireAuth, (req, res) => {
    const user = currentUser(req), date = mfTodayId();
    if (!motusManchePassee(user, date)) return res.status(403).json({ error: 'Termine la manche du jour avant d’écrire.' });
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
//  LE MOT JUSTE — devine le mot secret à la proximité de sens.
//  Vocabulaire fait main (motjuste/words.js) + moteur cosinus (engine.js).
//  Même infrastructure que Motus/Mots fléchés (cache par clés, rotation).
// ---------------------------------------------------------------------
const mjEngine = require('./motjuste/engine');
const MJ_KEEP_WORD_DAYS = 30;       // recul avant répétition (vocabulaire plus petit)
const MJ_KEEP_SHORT_DAYS = 15;

function mjHashSeed(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mjRand(seed) {
    let a = seed | 0;
    return function () {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const kMjWord = (d) => `mj:word:${d}`;
const kMjProg = (u, d) => `mj:prog:${u}:${d}`;
const kMjBoard = (d) => `mj:board:${d}`;
const kMjCmt = (d) => `mj:cmt:${d}`;
const kMjDays = (u) => `mj:days:${u}`;

function mjPickWord(date, forcePersist) {
    const all = mjEngine.motsTirables();   // jamais d'expression comme mot du jour
    const recent = new Set();
    for (let i = 1; i <= MJ_KEEP_WORD_DAYS; i++) {
        const w = mfGet(kMjWord(mfShiftDay(date, -i)));
        if (w) recent.add(w);
    }
    let candidates = all.filter(w => !recent.has(w));
    if (!candidates.length) candidates = all;
    const rnd = mjRand(mjHashSeed('motjuste|' + date));
    const pick = candidates[Math.floor(rnd() * candidates.length)] || all[0];
    if (forcePersist) mfSet(kMjWord(date), pick);
    return pick;
}
function mjWord(date) {
    const cached = mfGet(kMjWord(date));
    if (cached) return cached;
    return mjPickWord(date, true);
}
function mjWordPreview(date) {
    const cached = mfGet(kMjWord(date));
    if (cached) return cached;
    return mjPickWord(date, false);
}
function mjBoard(date) {
    return (mfGet(kMjBoard(date)) || []).filter(e => !e.susp).slice().sort((a, b) => a.guesses - b.guesses || a.ts - b.ts);
}
function mjStreak(user) {
    const days = new Set(mfGet(kMjDays(user)) || []);
    let cur = 0, d = mfTodayId();
    if (!days.has(d)) d = mfShiftDay(d, -1);
    while (days.has(d)) { cur++; d = mfShiftDay(d, -1); }
    return { current: cur, total: days.size };
}

app.use('/motjuste', requireAuth, express.static(__dirname + '/public/motjuste'));

app.get('/api/juste/today', requireAuth, (req, res) => {
    const user = currentUser(req), today = mfTodayId();
    let date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : today;
    if (date > today) date = today;
    const word = mjWord(date);
    const prog = mfGet(kMjProg(user, date)) || { guesses: [], solved: false, gaveUp: false };
    const finished = !!(prog.solved || prog.gaveUp);
    const guesses = (prog.guesses || []).slice().sort((a, b) => b.score - a.score);
    res.json({
        date, today, isArchive: date !== today, nextIn: mfSecondsToMidnight(),
        vocabCount: mjEngine.count(),
        solved: !!prog.solved, gaveUp: !!prog.gaveUp,
        guesses,
        answer: finished ? word : undefined,
    });
});

app.post('/api/juste/guess', requireAuth, (req, res) => {
    const b = req.body || {};
    const user = currentUser(req), today = mfTodayId();
    const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : today;
    const word = mjWord(date);
    const key = kMjProg(user, date);
    const prog = mfGet(key) || { guesses: [], solved: false, gaveUp: false, startedAt: Date.now() };
    if (prog.solved || prog.gaveUp) return res.status(400).json({ error: 'La partie est déjà terminée.' });

    const raw = String(b.guess || '');
    const found = mjEngine.findWord(raw);
    if (!found) return res.json({ ok: true, unknown: true, guess: raw.trim() });

    const already = prog.guesses.find(g => mjEngine.norm(g.word) === mjEngine.norm(found.m));
    let scoreVal = mjEngine.score(found.m, word);
    if (!already) {
        prog.guesses.push({ word: found.m, score: scoreVal });
        prog.startedAt = prog.startedAt || Date.now();
    } else {
        scoreVal = already.score;
    }
    const solved = mjEngine.norm(found.m) === mjEngine.norm(word);
    if (solved) prog.solved = true;
    mfSet(key, prog);

    let rank, total, streak, board = [];
    if (solved) {
        if (date === today) {
            const list = (mfGet(kMjBoard(date)) || []).slice();
            if (!list.some(e => e.u === user)) {
                list.push({ u: user, guesses: prog.guesses.length, ts: Date.now() });
                mfSet(kMjBoard(date), list);
            }
            const days = (mfGet(kMjDays(user)) || []).slice();
            if (!days.includes(date)) { days.push(date); mfSet(kMjDays(user), days); }
            streak = mjStreak(user);
        }
        board = mjBoard(date);
        rank = board.findIndex(e => e.u === user) + 1;
        total = board.length;
    }
    res.json({
        ok: true, unknown: false, word: found.m, score: scoreVal, solved,
        guesses: prog.guesses.slice().sort((a, c) => c.score - a.score),
        nGuesses: prog.guesses.length,
        answer: solved ? word : undefined,
        rank, total, streak,
    });
});

app.post('/api/juste/giveup', requireAuth, (req, res) => {
    const user = currentUser(req);
    const date = /^\d{4}-\d{2}-\d{2}$/.test((req.body && req.body.date) || '') ? req.body.date : mfTodayId();
    const word = mjWord(date);
    const key = kMjProg(user, date);
    const prog = mfGet(key) || { guesses: [], solved: false, gaveUp: false };
    if (!prog.solved) { prog.gaveUp = true; mfSet(key, prog); }
    res.json({ ok: true, answer: word });
});

app.get('/api/juste/board', requireAuth, (req, res) => {
    const user = currentUser(req);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : mfTodayId();
    const board = mjBoard(date);
    res.json({ board: board.map(e => ({ u: e.u, guesses: e.guesses })), me: board.findIndex(e => e.u === user) + 1 });
});
app.get('/api/juste/archive', requireAuth, (req, res) => {
    const user = currentUser(req), today = mfTodayId();
    const out = [];
    for (let i = 1; i <= 14; i++) {
        const d = mfShiftDay(today, -i);
        const p = mfGet(kMjProg(user, d));
        out.push({ date: d, solved: !!(p && p.solved), guesses: p ? (p.guesses || []).length : 0 });
    }
    res.json({ days: out });
});

// Même garde que pour Motus : un seul mot pour tout le monde, donc la discussion
// du jour reste fermée tant qu'on n'a pas fini sa manche. Archives libres.
function mjManchePassee(user, date) {
    const p = mfGet(kMjProg(user, date));
    return !!(p && (p.solved || p.gaveUp));
}
app.get('/api/juste/comments', requireAuth, (req, res) => {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : mfTodayId();
    if (date === mfTodayId() && !mjManchePassee(currentUser(req), date)) {
        return res.json({ locked: true, comments: [] });
    }
    res.json({ comments: (mfGet(kMjCmt(date)) || []).slice(-60) });
});
app.post('/api/juste/comments', requireAuth, (req, res) => {
    const user = currentUser(req), date = mfTodayId();
    if (!mjManchePassee(user, date)) return res.status(403).json({ error: 'Termine la manche du jour avant d’écrire.' });
    const txt = String((req.body && req.body.text) || '').trim().slice(0, 240);
    if (!txt) return res.status(400).json({ error: 'Message vide.' });
    const list = (mfGet(kMjCmt(date)) || []).slice();
    const last = list.filter(c => c.u === user).slice(-1)[0];
    if (last && Date.now() - last.ts < 4000) return res.status(429).json({ error: 'Doucement !' });
    list.push({ u: user, t: escapeHtml(txt), ts: Date.now() });
    if (list.length > 200) list.splice(0, list.length - 200);
    mfSet(kMjCmt(date), list);
    res.json({ ok: true, comments: list.slice(-60) });
});

// ---------------------------------------------------------------------
//  PERUDO — jeu temps réel, intégré au monolithe sous /perudo.
//  Le front est protégé par le login du salon ; /perudo/healthz reste public.
// ---------------------------------------------------------------------
const perudoApi = require('./perudo/game')(app, io);
app.use('/perudo', requireAuth, express.static(__dirname + '/public/perudo'));

// ---------------------------------------------------------------------
//  PETIT BAC — jeu temps réel multijoueur, intégré sous /pbac.
// ---------------------------------------------------------------------
const pbacApi = require('./pbac/game')(app, io, { get: mfGet, set: mfSet });
// L'espace multijoueurs commun : le seul point d'entrée vers les tables.
app.use('/jouer', requireAuth, express.static(__dirname + '/public/jouer'));
app.use('/pbac', requireAuth, express.static(__dirname + '/public/pbac'));
const yamsApi = require('./yams/game')(app, io, { get: mfGet, set: mfSet });
app.use('/yams', requireAuth, express.static(__dirname + '/public/yams'));

// ---------------------------------------------------------------------
//  INFILTRÉ — jeu social de déduction, intégré sous /undercover.
// ---------------------------------------------------------------------
const undercoverApi = require('./undercover/game')(app, io, requireAuth);
app.use('/undercover', requireAuth, express.static(__dirname + '/public/undercover'));

// ---------------------------------------------------------------------
//  HISTORIQUE DES TABLES — Perudo, Petit Bac, Infiltré, tout confondu.
//  Aucun des trois moteurs de jeu n'est modifié : on compare simplement
//  la liste des parties actives à intervalles réguliers, et toute partie
//  qui disparaît (terminée ou fermée) part dans l'historique persistant.
// ---------------------------------------------------------------------
const GAME_HISTORY_KEY = 'admin:gameHistory';
const GAME_HISTORY_MAX = 150;
let knownLiveGames = new Map(); // id -> { app, label, players, seenAt }

function snapshotActiveGames() {
    const current = new Map();
    try {
        perudoApi.games().filter(g => g.started && !g.vsBot).forEach(g => {
            current.set('perudo:' + g.id, { app: 'perudo', label: 'Perudo', players: g.players.map(p => p.pseudo) });
        });
    } catch (e) {}
    try {
        pbacApi.games().filter(g => g.status !== 'lobby' && g.status !== 'ended').forEach(g => {
            current.set('pbac:' + g.id, { app: 'pbac', label: 'Petit Bac', players: g.players });
        });
    } catch (e) {}
    try {
        undercoverApi.games().filter(g => g.status !== 'lobby' && g.status !== 'ended').forEach(g => {
            current.set('undercover:' + g.id, { app: 'undercover', label: 'Infiltré', players: g.players });
        });
    } catch (e) {}
    try {
        yamsApi.games().filter(g => g.status !== 'lobby' && g.status !== 'ended').forEach(g => {
            current.set('yams:' + g.id, { app: 'yams', label: 'Yams', players: g.players });
        });
    } catch (e) {}
    try {
        motusPartyApi.games().filter(g => g.status !== 'lobby' && g.status !== 'ended').forEach(g => {
            current.set('motusparty:' + g.id, { app: 'motusparty', label: 'Motus Party', players: g.players });
        });
    } catch (e) {}
    return current;
}
function pollGameHistory() {
    const current = snapshotActiveGames();
    const history = mfGet(GAME_HISTORY_KEY) || [];
    let changed = false;
    for (const [id, info] of knownLiveGames) {
        if (!current.has(id)) {
            history.unshift({ app: info.app, label: info.label, players: info.players, endedAt: Date.now() });
            changed = true;
        }
    }
    if (changed) mfSet(GAME_HISTORY_KEY, history.slice(0, GAME_HISTORY_MAX));
    knownLiveGames = current;
}
setInterval(pollGameHistory, 20 * 1000);

// ---------------------------------------------------------------------
//  CHANCE — dé, carte ou pièce pour trancher au hasard, purement statique.
// ---------------------------------------------------------------------
app.use('/chance', requireAuth, express.static(__dirname + '/public/chance'));

// ---------------------------------------------------------------------
//  VOYAGES — présentation de voyage, purement statique.
// ---------------------------------------------------------------------
app.use('/voyages', requireAuth, express.static(__dirname + '/public/voyages'));

// ---------------------------------------------------------------------
//  VOYAGES — matériel, frais et listes personnelles, vus par les trois
//  en même temps (même infrastructure de clés que les mots fléchés).
//  Chaque fonctionnalité se lit et s'écrit d'un bloc : le client modifie
//  sa copie locale puis renvoie l'état complet, plus simple et plus sûr
//  que des dizaines de petites routes pour un usage entre trois amis.
// ---------------------------------------------------------------------
function defaultGearCategories() {
    return [
        {
            id: 'cat-abris', name: 'Abris',
            items: [
                { id: 'g1', name: 'Tente 2 places, avec sardines et sangles', person: '', packed: false },
                { id: 'g2', name: 'Tente 1 place, avec sardines et sangles', person: '', packed: false },
                { id: 'g3', name: 'Piquets de rechange', person: '', packed: false },
            ],
        },
        {
            id: 'cat-cuisine', name: 'Cuisine et eau',
            items: [
                { id: 'g4', name: 'Réchaud à gaz', person: '', packed: false },
                { id: 'g5', name: 'Cartouche de gaz de rechange', person: '', packed: false },
                { id: 'g6', name: 'Popote (casserole ou gamelle)', person: '', packed: false },
                { id: 'g7', name: 'Briquet', person: '', packed: false },
                { id: 'g8', name: 'Allumettes étanches', person: '', packed: false },
                { id: 'g9', name: 'Filtre à eau ou pastilles de purification', person: '', packed: false },
                { id: 'g10', name: 'Éponge ou chiffon pour la vaisselle', person: '', packed: false },
                { id: 'g11', name: 'Sacs poubelle pour redescendre les déchets', person: '', packed: false },
            ],
        },
        {
            id: 'cat-securite', name: 'Sécurité et navigation',
            items: [
                { id: 'g12', name: 'Trousse de premiers secours commune', person: '', packed: false },
                { id: 'g13', name: 'Carte IGN 0617 OT papier', person: '', packed: false },
                { id: 'g14', name: 'Boussole', person: '', packed: false },
                { id: 'g15', name: 'Couverture de survie', person: '', packed: false },
                { id: 'g16', name: 'Sifflet', person: '', packed: false },
                { id: 'g17', name: 'Corde et sangles pour dépanner', person: '', packed: false },
                { id: 'g18', name: 'Lampe frontale de secours, avec piles à part', person: '', packed: false },
            ],
        },
        {
            id: 'cat-reparation', name: 'Réparation',
            items: [
                { id: 'g19', name: 'Couteau multifonction', person: '', packed: false },
                { id: 'g20', name: 'Kit de réparation tente (rustines, fil, aiguille)', person: '', packed: false },
                { id: 'g21', name: 'Adhésif toilé enroulé sur un bout de carton', person: '', packed: false },
                { id: 'g22', name: 'Cordelette supplémentaire', person: '', packed: false },
            ],
        },
        {
            id: 'cat-electronique', name: 'Électronique partagée',
            items: [
                { id: 'g23', name: 'Batterie externe de secours pour le groupe', person: '', packed: false },
                { id: 'g24', name: 'Câbles de charge', person: '', packed: false },
            ],
        },
        {
            id: 'cat-divers', name: 'Divers',
            items: [
                { id: 'g25', name: 'Papier toilette', person: '', packed: false },
                { id: 'g26', name: 'Petite pelle', person: '', packed: false },
                { id: 'g27', name: 'Répulsif anti-moustique et anti-tique', person: '', packed: false },
            ],
        },
    ];
}
app.get('/api/voyages/gear', requireAuthApi, (req, res) => {
    res.json({ categories: mfGet('voyages:gear') || defaultGearCategories() });
});
app.post('/api/voyages/gear', requireAuthApi, (req, res) => {
    const cats = Array.isArray((req.body || {}).categories) ? req.body.categories : [];
    const clean = cats.slice(0, 20).map(c => ({
        id: String(c.id || '').slice(0, 40) || ('cat-' + Date.now()),
        name: String(c.name || 'Catégorie').trim().slice(0, 40),
        items: Array.isArray(c.items) ? c.items.slice(0, 60).map(it => ({
            id: String(it.id || '').slice(0, 40) || ('g-' + Date.now() + Math.random().toString(36).slice(2, 6)),
            name: String(it.name || '').trim().slice(0, 60),
            person: String(it.person || '').trim().slice(0, 24),
            packed: !!it.packed,
        })).filter(it => it.name) : [],
    }));
    mfSet('voyages:gear', clean);
    res.json({ ok: true, categories: clean });
});

app.get('/api/voyages/expenses', requireAuthApi, (req, res) => {
    res.json({ expenses: mfGet('voyages:expenses') || [] });
});
app.post('/api/voyages/expenses', requireAuthApi, (req, res) => {
    const list = Array.isArray((req.body || {}).expenses) ? req.body.expenses : [];
    const clean = list.slice(0, 300).map(e => ({
        id: Number(e.id) || (Date.now() + Math.floor(Math.random() * 1000)),
        label: String(e.label || '').trim().slice(0, 60),
        amount: Math.max(0, Math.round((Number(e.amount) || 0) * 100) / 100),
        paidBy: String(e.paidBy || '').trim().slice(0, 24),
        splitWith: Array.isArray(e.splitWith) ? e.splitWith.map(n => String(n).trim().slice(0, 24)).filter(Boolean).slice(0, 10) : [],
        ts: Number(e.ts) || Date.now(),
    })).filter(e => e.label && e.paidBy && e.amount > 0);
    mfSet('voyages:expenses', clean);
    res.json({ ok: true, expenses: clean });
});

app.get('/api/voyages/checklists', requireAuthApi, (req, res) => {
    res.json({ lists: mfGet('voyages:checklists') || {} });
});
app.post('/api/voyages/checklists', requireAuthApi, (req, res) => {
    const lists = (req.body || {}).lists;
    if (!lists || typeof lists !== 'object') return res.status(400).json({ error: 'Format invalide.' });
    const clean = {};
    for (const [name, items] of Object.entries(lists).slice(0, 3)) {
        if (!Array.isArray(items)) continue;
        clean[String(name).trim().slice(0, 24)] = items.slice(0, 60).map(it => ({
            text: String(it.text || '').trim().slice(0, 60), done: !!it.done,
        })).filter(it => it.text);
    }
    mfSet('voyages:checklists', clean);
    res.json({ ok: true, lists: clean });
});

app.get('/api/voyages/names', requireAuthApi, (req, res) => {
    res.json({ names: mfGet('voyages:names') || ['Victor', 'Swann', 'Pierre'] });
});
app.post('/api/voyages/names', requireAuthApi, (req, res) => {
    const names = Array.isArray((req.body || {}).names) ? req.body.names.map(n => String(n).trim().slice(0, 24)).filter(Boolean).slice(0, 3) : [];
    mfSet('voyages:names', names);
    res.json({ ok: true, names });
});

app.get('/api/voyages/molescores', requireAuthApi, (req, res) => {
    res.json({ scores: mfGet('voyages:molescores') || {} });
});
app.post('/api/voyages/molescores', requireAuthApi, (req, res) => {
    const { name, score } = req.body || {};
    const cleanName = String(name || '').trim().slice(0, 24);
    const cleanScore = Math.max(0, Math.min(999, Number(score) || 0));
    if (!cleanName) return res.status(400).json({ ok: false });
    const scores = mfGet('voyages:molescores') || {};
    const previousBest = scores[cleanName] || 0;
    const newRecord = cleanScore > previousBest;
    if (newRecord) scores[cleanName] = cleanScore;
    mfSet('voyages:molescores', scores);
    res.json({ ok: true, scores, newRecord, previousBest });
});

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
    const motusSolversToday = motusBoard(today).length;
    const mjProg = mfGet(kMjProg(user, today));
    const mjDone = !!(mjProg && mjProg.solved);
    const mjOver = !!(mjProg && (mjProg.solved || mjProg.gaveUp));
    const mjSolversToday = mjBoard(today).length;
    let pbacOnline = 0;
    try { pbacOnline = pbacApi.online().length; } catch (e) {}

    // Les vrais prénoms connectés par jeu, pour les tuiles du salon ("qui est
    // connecté" plutôt qu'un simple nombre). Undercover réutilise le même schéma.
    let perudoNames = [], pbacNames = [], undercoverOnlineCount = 0, undercoverNames = [], yamsOnlineCount = 0, yamsNames = [], mpOnlineCount = 0, mpNames = [];
    try { perudoNames = perudoApi.online().map(p => p.pseudo); } catch (e) {}
    try { pbacNames = pbacApi.online(); } catch (e) {}
    try { undercoverNames = undercoverApi.online(); undercoverOnlineCount = undercoverNames.length; } catch (e) {}
    try { yamsNames = yamsApi.online(); yamsOnlineCount = yamsNames.length; } catch (e) {}
    try { mpNames = motusPartyApi.online(); mpOnlineCount = mpNames.length; } catch (e) {}

    // Joueurs du salon actuellement en ligne : présence déduite de la fraîcheur de
    // lastSeen (mis à jour par ce même endpoint, interrogé toutes les 60 s côté client).
    // Fenêtre volontairement plus large que l'intervalle d'interrogation (60s), pour ne
    // jamais faire disparaître quelqu'un juste à cause d'un décalage de quelques secondes.
    const ONLINE_WINDOW_MS = 3 * 60 * 1000;
    const now = Date.now();
    const salonOnline = Object.values(registeredUsers)
        .filter(u => u && u.lastSeen && (now - u.lastSeen) < ONLINE_WINDOW_MS)
        .map(u => u.pseudo)
        .sort((a, b) => a.localeCompare(b));

    // Un aperçu des dernières personnes passées sur l'appli (pas la liste complète),
    // juste pour donner une sensation de vie. Fenêtre large de 48h, mais volontairement
    // court : on ne montre jamais tout le monde, seulement les plus récents.
    const me = currentUser(req);
    const RECENT_WINDOW_MS = 48 * 60 * 60 * 1000;
    const recentlyActive = Object.values(registeredUsers)
        .filter(u => u && u.lastSeen && u.pseudo !== me && (now - u.lastSeen) < RECENT_WINDOW_MS)
        .sort((a, b) => b.lastSeen - a.lastSeen)
        .slice(0, 6)
        .map(u => ({ pseudo: u.pseudo, lastSeen: u.lastSeen }));

    // Parties en cours, tous jeux confondus, avec les prénoms des joueurs présents.
    const activeGames = [];
    try {
        perudoApi.games().filter(g => g.started && !g.vsBot).forEach(g => {
            activeGames.push({ app: 'perudo', label: 'Perudo', players: g.players.map(p => p.pseudo) });
        });
    } catch (e) {}
    try {
        pbacApi.games().filter(g => g.status !== 'lobby' && g.status !== 'ended').forEach(g => {
            activeGames.push({ app: 'pbac', label: 'Petit Bac', players: g.players });
        });
    } catch (e) {}
    try {
        undercoverApi.games().filter(g => g.status !== 'lobby' && g.status !== 'ended').forEach(g => {
            activeGames.push({ app: 'undercover', label: 'Infiltré', players: g.players });
        });
    } catch (e) {}
    try {
        yamsApi.games().filter(g => g.status !== 'lobby' && g.status !== 'ended').forEach(g => {
            activeGames.push({ app: 'yams', label: 'Yams', players: g.players });
        });
    } catch (e) {}

    res.json({
        mf: { done, total: MF_LEVELS.length, streak }, perudo: { online, games, names: perudoNames },
        rec: { count: recs.length, fresh: recNew },
        // `streak` alimente la tuile « Aujourd'hui » du salon : la série en cours est
        // la meilleure raison de revenir demain, elle mérite d'être visible dès l'accueil.
        motus: { done: motusDone, over: motusOver, solvers: motusSolversToday, streak: motusStreak(user).current },
        motjuste: { done: mjDone, over: mjOver, solvers: mjSolversToday, streak: mjStreak(user).current },
        pbac: { online: pbacOnline, names: pbacNames },
        undercover: { online: undercoverOnlineCount, names: undercoverNames },
        yams: { online: yamsOnlineCount, names: yamsNames },
        motusparty: { online: mpOnlineCount, names: mpNames },
        salonOnline, activeGames, recentlyActive,
    });
});

// ---------------------------------------------------------------------
//  PORTRAIT CHIFFRÉ D'UN JOUEUR
//  Une seule source pour les deux interfaces de statistiques : la page de
//  profil personnelle et la bulle qui s'ouvre au clic sur un pseudo. Les
//  deux racontaient des choses différentes — la bulle ne montrait que Yams
//  et Motus Party, en ignorant les jeux du jour qui font 90 % de l'activité.
// ---------------------------------------------------------------------
const { norm: normPseudo } = require('./comptes/renommage');

// Stats des mots fléchés : progression par jour ET par niveau, donc une forme
// différente des deux autres jeux du jour.
function statsMotsFleches(pseudo) {
    let resolues = 0, meilleurTemps = null, totalTemps = 0;
    for (const [k, v] of Object.entries(mfCache)) {
        if (!k.startsWith(`mf:prog:${pseudo}:`) || !v || !v.solved) continue;
        resolues++;
        if (v.seconds) {
            totalTemps += v.seconds;
            if (!meilleurTemps || v.seconds < meilleurTemps) meilleurTemps = v.seconds;
        }
    }
    const jours = new Set(mfGet(`mf:days:${pseudo}`) || []);
    return {
        resolues, meilleurTemps, jours: jours.size,
        tempsMoyen: resolues ? Math.round(totalTemps / resolues) : null,
        serie: serieDepuisJours([...jours]),
    };
}

const mmss = (s) => (s == null ? null : Math.floor(s / 60) + ' min ' + String(s % 60).padStart(2, '0'));

// Construit les blocs de statistiques, un par jeu, en n'incluant que les jeux
// réellement pratiqués : un profil vide vaut mieux qu'une page de zéros.
function portraitJoueur(pseudo) {
    const jeux = [];
    // `note` sert à dire honnêtement sur quelle période portent les chiffres :
    // les listes de jours joués sont conservées à vie, mais les progressions
    // détaillées sont purgées au bout de 15 jours (20 pour les grilles). Afficher
    // « 28 jours joués » à côté de « 12 trouvés » sans le préciser serait faux.
    const ajoute = (id, nom, emoji, parties, resume, lignes, note) => {
        if (!parties) return;
        jeux.push({ id, nom, emoji, parties, resume, note: note || null,
            lignes: lignes.filter(l => l[1] !== null && l[1] !== undefined) });
    };

    const motus = dailyGameStats('motus:prog', pseudo, u => kMotusDays(u), u => motusStreak(u));
    ajoute('motus', 'Motus', '🟨', motus.days,
        motus.days + ' jours joués', [
            ['Jours joués', motus.days], ['Série en cours', motus.streak], ['Record de série', motus.bestStreak],
            ['Trouvés', motus.solved],
            ['Réussite', motus.successRate != null ? motus.successRate + ' %' : null],
            ['Essais en moyenne', motus.avgTries], ['Meilleur', motus.bestTries ? motus.bestTries + ' essais' : null],
        ], 'Jours joués et séries depuis toujours ; le détail porte sur les 15 derniers jours.');

    const mf = statsMotsFleches(pseudo);
    ajoute('mf', 'Mots Fléchés', '🧩', mf.jours,
        mf.jours + ' jours joués', [
            ['Jours joués', mf.jours], ['Série en cours', mf.serie],
            ['Grilles résolues', mf.resolues],
            ['Meilleur temps', mmss(mf.meilleurTemps)], ['Temps moyen', mmss(mf.tempsMoyen)],
        ], 'Jours joués et série depuis toujours ; le détail porte sur les 20 derniers jours.');

    const mj = dailyGameStats('mj:prog', pseudo, u => kMjDays(u), u => mjStreak(u));
    ajoute('motjuste', 'Le Mot Juste', '🧊', mj.days,
        mj.days + ' jours joués', [
            ['Jours joués', mj.days], ['Série en cours', mj.streak],
            ['Devinés', mj.solved],
            ['Réussite', mj.successRate != null ? mj.successRate + ' %' : null],
            ['Mots essayés en moyenne', mj.avgTries],
        ], 'Jours joués et série depuis toujours ; le détail porte sur les 15 derniers jours.');

    // Petit Bac n'expose pas de statsFor : ses stats vivent dans le cache commun,
    // indexées par pseudo NORMALISÉ.
    const pb = mfGet(`pbac:stats:${normPseudo(pseudo)}`);
    if (pb && pb.gamesPlayed) {
        ajoute('pbac', 'Petit Bac', '✏️', pb.gamesPlayed,
            pb.gamesWon + ' parties gagnées', [
                ['Parties', pb.gamesPlayed], ['Victoires', pb.gamesWon],
                ['Manches jouées', pb.roundsPlayed], ['Total de points', pb.totalPoints],
                ['Meilleure manche', pb.bestRoundScore],
            ]);
    }

    let yams = null;
    try { yams = yamsApi.statsFor(pseudo); } catch (e) {}
    if (yams && yams.gamesPlayed) {
        ajoute('yams', 'Yams', '🎯', yams.gamesPlayed,
            yams.gamesWon + ' parties gagnées', [
                ['Parties', yams.gamesPlayed], ['Victoires', yams.gamesWon],
                ['Meilleur score', yams.bestScore], ['Yams réalisés', yams.totalYams],
                ['Bête noire', yams.nemesis ? yams.nemesis.pseudo : null],
            ]);
    }

    let mp = null;
    try { mp = motusPartyApi.statsFor(pseudo); } catch (e) {}
    if (mp && mp.matchesPlayed) {
        ajoute('motusparty', 'Motus Party', '🏁', mp.matchesPlayed,
            mp.matchesWon + ' courses gagnées', [
                ['Courses', mp.matchesPlayed], ['Gagnées', mp.matchesWon],
                ['Mots trouvés', mp.wordsFound], ['Meilleure place', mp.bestRank],
            ]);
    }

    let perudo = null;
    try { perudo = perudoApi.users()[pseudo]; } catch (e) {}
    if (perudo && perudo.played) {
        ajoute('perudo', 'Perudo', '🎲', perudo.played,
            (perudo.wins || 0) + ' parties gagnées', [
                ['Parties', perudo.played], ['Victoires', perudo.wins || 0],
                ['Points de rang', perudo.rankPoints || 0],
                ['Série en cours', perudo.currentStreak || 0], ['Record de série', perudo.bestStreak || 0],
            ]);
    }

    const total = jeux.reduce((s, j) => s + j.parties, 0);
    const favori = jeux.slice().sort((a, b) => b.parties - a.parties)[0] || null;
    return { jeux, total, favori: favori ? favori.nom : null };
}

// Place au classement du Salon, sans recalculer tout le tableau deux fois.
function placeAuClassement(pseudo) {
    const pseudos = Object.keys(registeredUsers);
    const series = {};
    for (const p of pseudos) {
        series[p] = Math.max(
            serieDepuisJours(mfGet(kMotusDays(p))),
            serieDepuisJours(mfGet(`mf:days:${p}`)),
            serieDepuisJours(mfGet(kMjDays(p))),
        );
    }
    const lignes = calculerClassement(mfCache, pseudos, series);
    const i = lignes.findIndex(l => l.pseudo === pseudo);
    return i < 0 ? null : { place: i + 1, points: lignes[i].points, total: lignes.length };
}

// Calendrier d'activité : un carré par jour, façon grille de contributions.
// Les données existent déjà telles quelles dans les clés *:days:* — il n'y a
// rien à calculer, seulement à les rapprocher.
function calendrierActivite(pseudo, nbJours) {
    const sources = [
        ['motus', mfGet(kMotusDays(pseudo)) || []],
        ['mf', mfGet(`mf:days:${pseudo}`) || []],
        ['mj', mfGet(kMjDays(pseudo)) || []],
    ];
    const parJour = new Map();
    for (const [jeu, jours] of sources) {
        for (const d of jours) {
            if (!parJour.has(d)) parJour.set(d, []);
            parJour.get(d).push(jeu);
        }
    }
    const out = [];
    for (let i = nbJours - 1; i >= 0; i--) {
        const d = mfShiftDay(mfTodayId(), -i);
        out.push({ d, jeux: parJour.get(d) || [] });
    }
    return out;
}

// Série en cours d'un joueur pour un jeu du jour, à partir de sa liste de jours joués.
function serieDepuisJours(jours) {
    const set = new Set(jours || []);
    let n = 0, d = mfTodayId();
    if (!set.has(d)) d = mfShiftDay(d, -1);
    while (set.has(d)) { n++; d = mfShiftDay(d, -1); }
    return n;
}

// ---------------------------------------------------------------------
//  LES TABLES OUVERTES, TOUS JEUX CONFONDUS
//  Il fallait jusqu'ici ouvrir les quatre jeux l'un après l'autre pour savoir
//  si quelqu'un attendait quelque part. Personne ne le faisait — c'est
//  probablement ce qui a maintenu Yams à 4 joueurs et Motus Party à 2, bien
//  plus que les pannes qu'on a corrigées.
// ---------------------------------------------------------------------
// Quatre modules partagent exactement la même forme ({id, host, status,
// players}) ; Perudo a la sienne, plus riche, et reste traité à part.
const JEUX_MULTI = [
    { id: 'pbac', nom: 'Petit Bac', emoji: '✏️', accent: '#c2513a', href: '/pbac', api: () => pbacApi },
    { id: 'undercover', nom: 'Infiltré', emoji: '🕵️', accent: '#6f7bb0', href: '/undercover', api: () => undercoverApi },
    { id: 'yams', nom: 'Yams', emoji: '🎯', accent: '#ecca82', href: '/yams', api: () => yamsApi },
    { id: 'motusparty', nom: 'Motus Party', emoji: '🏁', accent: '#d9a94e', href: '/motus/party', api: () => motusPartyApi },
];

app.get('/api/salon/tables', requireAuthApi, (req, res) => {
    const tables = [];
    for (const j of JEUX_MULTI) {
        let liste = [];
        try { liste = j.api().games() || []; } catch (e) { continue; }
        for (const g of liste) {
            if (g.status === 'ended') continue;
            tables.push({
                jeu: j.id, nom: j.nom, emoji: j.emoji, accent: j.accent,
                id: g.id, hote: g.host, joueurs: g.players || [],
                statut: g.status === 'lobby' ? 'attente' : 'encours',
                href: `${j.href}/?table=${encodeURIComponent(g.id)}`,
            });
        }
    }
    // Perudo : on ignore les parties contre l'ordinateur, qui ne se rejoignent pas.
    try {
        for (const g of (perudoApi.games() || [])) {
            if (g.vsBot) continue;
            tables.push({
                jeu: 'perudo', nom: 'Perudo', emoji: '🎲', accent: '#d9a94e',
                id: g.id, hote: (g.players[0] || {}).pseudo || '—',
                joueurs: g.players.filter(p => !p.isBot).map(p => p.pseudo),
                statut: g.started ? 'encours' : 'attente',
                href: '/perudo',           // Perudo garde son propre hall et son identité
            });
        }
    } catch (e) {}

    // Les tables en attente d'abord : ce sont les seules qu'on peut rejoindre.
    tables.sort((a, b) => (a.statut === b.statut ? 0 : a.statut === 'attente' ? -1 : 1));
    res.json({ tables, moi: currentUser(req) });
});


// ---------------------------------------------------------------------
//  LES RÉSULTATS DU JOUR
//  Le pendant du panneau « Aujourd'hui » : celui-ci ouvre la journée,
//  celle-là la referme. Les trois classements étaient jusqu'ici enfermés
//  chacun derrière un bouton, dans son propre jeu.
//
//  Un classement n'est renvoyé que si la manche est finie pour celui qui
//  demande : le voir avant d'avoir joué révélerait qui a trouvé, et en
//  combien d'essais.
// ---------------------------------------------------------------------
app.get('/api/salon/resultats-du-jour', requireAuthApi, (req, res) => {
    const user = currentUser(req), date = mfTodayId();
    const jeux = [];

    const motusFini = motusManchePassee(user, date);
    jeux.push({
        id: 'motus', nom: 'Motus', emoji: '🟨', accent: '#c9a24a', href: '/motus/quotidien/',
        joue: motusFini,
        mot: motusFini ? motusWord(date) : null,
        classement: motusFini
            ? motusBoard(date).map(e => ({ pseudo: e.u, detail: e.tries + (e.tries > 1 ? ' essais' : ' essai') }))
            : [],
    });

    // Mots Fléchés : une grille par niveau, on prend celle que le joueur a faite.
    const niveau = mfLevel(req.query.level);
    const progMf = mfGet(`mf:prog:${user}:${date}:${niveau}`);
    const mfFini = !!(progMf && (progMf.solved || progMf.gaveUp));
    jeux.push({
        id: 'mf', nom: 'Mots Fléchés', emoji: '🧩', accent: '#5aa87a', href: '/mots-fleches',
        joue: mfFini, mot: null,
        classement: mfFini
            ? mfBoard(date, niveau).map(e => ({ pseudo: e.u, detail: mfFormat(e.s) }))
            : [],
    });

    const mjFini = mjManchePassee(user, date);
    jeux.push({
        id: 'motjuste', nom: 'Le Mot Juste', emoji: '🧊', accent: '#6fb8d9', href: '/motjuste',
        joue: mjFini,
        mot: mjFini ? mjWord(date) : null,
        classement: mjFini
            ? mjBoard(date).map(e => ({ pseudo: e.u, detail: (e.tries || e.guesses || 0) + ' mots' }))
            : [],
    });

    for (const j of jeux) {
        j.maPlace = j.classement.findIndex(e => e.pseudo === user) + 1 || null;
        j.classement = j.classement.slice(0, 12);
    }
    res.json({ date, moi: user, jeux, tousFaits: jeux.every(j => j.joue) });
});

// Le classement du Salon : un score transversal, recalculé à la demande depuis
// les clés déjà en base. Rien n'est stocké, donc rien à migrer si le barème change.
app.get('/api/salon/classement', requireAuthApi, (req, res) => {
    const pseudos = Object.keys(registeredUsers);
    const series = {};
    for (const p of pseudos) {
        series[p] = Math.max(
            serieDepuisJours(mfGet(kMotusDays(p))),
            serieDepuisJours(mfGet(`mf:days:${p}`)),
            serieDepuisJours(mfGet(kMjDays(p))),
        );
    }
    // Par défaut la saison en cours : un classement cumulatif depuis toujours
    // finit par se figer, et on ne rattrape plus le premier. « Depuis toujours »
    // reste consultable.
    const depuisToujours = String(req.query.periode || '') === 'toujours';
    const aujourdhui = mfTodayId();
    const lignes = calculerClassement(mfCache, pseudos, series,
        depuisToujours ? null : bornesSaison(aujourdhui));
    const moi = currentUser(req);
    res.json({
        classement: lignes.slice(0, 20),
        moi,
        maPlace: lignes.findIndex(l => l.pseudo === moi) + 1 || null,
        total: lignes.length,
        periode: depuisToujours ? 'toujours' : 'saison',
        saison: aujourdhui.slice(0, 7),
        bareme: BAREME,
    });
});

// Agrège les stats d'un jeu "mot du jour" (Motus, Le Mot Juste) à partir de ses
// clés de progression par utilisateur — même forme pour les deux jeux.
function dailyGameStats(prefix, pseudo, daysKey, streakFn) {
    let solved = 0, gaveUp = 0, lost = 0, bestTries = null, totalTries = 0;
    for (const [k, v] of Object.entries(mfCache)) {
        if (!k.startsWith(`${prefix}:${pseudo}:`) || !v) continue;
        if (v.solved) {
            solved++;
            const tries = (v.guesses || []).length;
            totalTries += tries;
            if (!bestTries || tries < bestTries) bestTries = tries;
        } else if (v.lost) lost++;
        else if (v.gaveUp) gaveUp++;
    }
    const days = new Set(mfGet(daysKey(pseudo)) || []);
    const played = solved + gaveUp + lost;
    const streak = streakFn(pseudo);
    return {
        solved, gaveUp, lost, bestTries,
        avgTries: solved ? Math.round((totalTries / solved) * 10) / 10 : null,
        days: days.size, streak: streak.current, bestStreak: streak.best,
        successRate: played ? Math.round((solved / played) * 100) : null,
    };
}

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
    const mfDays = new Set(mfGet(`mf:days:${pseudo}`) || []);
    let mfStreak = 0, d = mfTodayId();
    if (!mfDays.has(d)) d = mfShiftDay(d, -1);
    while (mfDays.has(d)) { mfStreak++; d = mfShiftDay(d, -1); }
    // stats perudo
    let perudo = null;
    try {
        const pu = perudoApi.users()[pseudo];
        if (pu) perudo = {
            wins: pu.wins || 0, played: pu.played || 0, rankPoints: pu.rankPoints || 0,
            currentStreak: pu.currentStreak || 0, bestStreak: pu.bestStreak || 0,
        };
    } catch (e) {}
    // stats motus / le mot juste (même forme de données par utilisateur)
    const motus = dailyGameStats('motus:prog', pseudo, u => kMotusDays(u), u => motusStreak(u));
    const motjuste = dailyGameStats('mj:prog', pseudo, u => kMjDays(u), u => mjStreak(u));
    const portrait = portraitJoueur(pseudo);
    // stats yams
    let yams = null;
    try { yams = yamsApi.statsFor(pseudo); } catch (e) {}
    let motusparty = null;
    try { motusparty = motusPartyApi.statsFor(pseudo); } catch (e) {}
    res.json({
        pseudo, avatar: user.avatar || '', avatarPhoto: user.avatarPhoto || '',
        created: user.created || 0, prevLogin: user.prevLogin || 0,
        isAdmin: isAdmin(pseudo),
        mf: { solved, best, streak: mfStreak, days: mfDays.size },
        perudo, motus, motjuste, yams, motusparty,
        avatars: SALON_AVATARS,
        // Même portrait que la bulle publique, pour que les deux interfaces
        // racontent exactement la même chose.
        jeux: portrait.jeux,
        totalParties: portrait.total,
        rang: placeAuClassement(pseudo),
        calendrier: calendrierActivite(pseudo, 119),   // 17 semaines
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
app.get('/api/salon/mystats-summary', requireAuthApi, (req, res) => {
    const pseudo = currentUser(req);
    const today = mfTodayId();
    // "Cette semaine" ne compte honnêtement que ce qu'on peut vraiment dater : les
    // jeux du jour (Motus, Le Mot Juste, Mots Fléchés) ont une clé par date, donc
    // on regarde les 7 derniers jours. Perudo, Yams et Motus Party n'ont que des
    // totaux cumulés sans horodatage individuel, ils ne rentrent pas dans ce compte.
    let weekCount = 0;
    for (let i = 0; i < 7; i++) {
        const d = mfShiftDay(today, -i);
        if (mfGet(kMotusProg(pseudo, d))) weekCount++;
        if (mfGet(kMjProg(pseudo, d))) weekCount++;
        for (const lv of MF_LEVELS) { if (mfGet(`mf:prog:${pseudo}:${d}:${lv}`)) weekCount++; }
    }
    // "Jeu le plus joué" compare les totaux cumulés de chaque jeu entre eux.
    const totals = [];
    try { const p = perudoApi.users()[pseudo]; if (p && p.played) totals.push(['Perudo', p.played]); } catch (e) {}
    const mfDays = mfGet(`mf:days:${pseudo}`) || [];
    if (mfDays.length) totals.push(['Mots Fléchés', mfDays.length]);
    const motusDays = mfGet(kMotusDays(pseudo)) || [];
    if (motusDays.length) totals.push(['Motus', motusDays.length]);
    const mjDays = mfGet(kMjDays(pseudo)) || [];
    if (mjDays.length) totals.push(['Le Mot Juste', mjDays.length]);
    try { const y = yamsApi.statsFor(pseudo); if (y && y.gamesPlayed) totals.push(['Yams', y.gamesPlayed]); } catch (e) {}
    try { const m = motusPartyApi.statsFor(pseudo); if (m && m.matchesPlayed) totals.push(['Motus Party', m.matchesPlayed]); } catch (e) {}
    totals.sort((a, b) => b[1] - a[1]);
    res.json({ weekCount, favoriteGame: totals.length ? totals[0][0] : null });
});
app.post('/api/salon/avatar-photo', requireAuthApi, (req, res) => {
    const user = registeredUsers[currentUser(req)];
    if (!user) return res.status(404).json({ error: 'Compte introuvable.' });
    const photo = req.body && req.body.photo;
    if (photo === null || photo === '') { user.avatarPhoto = ''; saveUsers(); return res.json({ ok: true, photo: '' }); }
    if (typeof photo !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(photo)) {
        return res.status(400).json({ error: 'Format d\u2019image invalide.' });
    }
    if (photo.length > 350000) return res.status(400).json({ error: 'Image trop volumineuse.' });
    user.avatarPhoto = photo;
    saveUsers();
    res.json({ ok: true, photo });
});
// Petit annuaire public (aux joueurs connectés) : donne la photo ou l'emoji de
// n'importe quel pseudo, pour afficher sa bulle dans n'importe quel jeu sans
// avoir à faire porter la photo elle-même dans chaque mise à jour de partie.
app.get('/api/avatars', requireAuthApi, (req, res) => {
    const list = String(req.query.pseudos || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 40);
    const out = {};
    for (const pseudo of list) {
        const u = registeredUsers[pseudo];
        out[pseudo] = u ? { photo: u.avatarPhoto || '', emoji: u.avatar || '' } : { photo: '', emoji: '' };
    }
    res.json(out);
});

// Profil public en lecture seule : ce que n'importe quel joueur connecté peut
// voir du profil d'un autre, en cliquant sur sa bulle depuis n'importe quel
// jeu. Volontairement limité : jamais de mot de passe, code de récupération,
// statut de suspension ou autre donnée sensible — juste de quoi se situer.
app.get('/api/public-profile', requireAuthApi, (req, res) => {
    const pseudo = String(req.query.pseudo || '');
    const u = registeredUsers[pseudo];
    if (!u) return res.status(404).json({ error: 'Compte introuvable.' });
    const moi = currentUser(req);
    const portrait = portraitJoueur(pseudo);

    // Face-à-face avec celui qui regarde : c'est ce qu'on veut vraiment savoir
    // en ouvrant le profil de quelqu'un. Les stats Yams tiennent le compte des
    // duels ; le classement du Salon donne l'écart général.
    let faceAface = null;
    if (moi && moi !== pseudo) {
        let duels = null;
        try {
            const y = yamsApi.statsFor(pseudo);
            const vs = y && y.vsOpponent && y.vsOpponent[moi];
            if (vs && (vs.wins || vs.losses)) duels = { sesVictoires: vs.wins || 0, mesVictoires: vs.losses || 0 };
        } catch (e) {}
        const monRang = placeAuClassement(moi), sonRang = placeAuClassement(pseudo);
        faceAface = {
            duels,
            monRang: monRang ? monRang.place : null,
            sonRang: sonRang ? sonRang.place : null,
        };
    }

    res.json({
        pseudo: u.pseudo,
        avatar: u.avatar || '', avatarPhoto: u.avatarPhoto || '',
        created: u.created || 0,
        online: !!(u.lastSeen && Date.now() - u.lastSeen < 90 * 1000),
        lastSeen: u.lastSeen || 0,
        favori: portrait.favori,
        totalParties: portrait.total,
        rang: placeAuClassement(pseudo),
        jeux: portrait.jeux,
        faceAface,
    });
});

// Changer de pseudo : déplace le compte vers la nouvelle clé, réémet une
// session à jour, et migre toutes les données associées — progressions,
// classements, séries, stats par jeu. Voir comptes/renommage.js.
app.post('/api/account/rename', requireAuthApi, (req, res) => {
    const oldPseudo = currentUser(req);
    const user = registeredUsers[oldPseudo];
    if (!user) return res.status(404).json({ error: 'Compte introuvable.' });
    const newPseudo = String((req.body && req.body.pseudo) || '').trim();
    if (!PSEUDO_REGEX.test(newPseudo)) return res.status(400).json({ error: 'Nom invalide (3 à 20 caractères).' });
    if (newPseudo === oldPseudo) return res.status(400).json({ error: 'C\u2019est déjà votre pseudo.' });
    if (registeredUsers[newPseudo]) return res.status(409).json({ error: 'Ce nom est déjà pris.' });
    const password = String((req.body && req.body.password) || '');
    if (!verifyPassword(password, user.passwordHash)) return res.status(401).json({ error: 'Mot de passe incorrect.' });
    delete registeredUsers[oldPseudo];
    user.pseudo = newPseudo;
    registeredUsers[newPseudo] = user;
    saveUsers(true);

    // Les statistiques suivent désormais le compte. Elles restaient auparavant
    // sous l'ancien pseudo — c'était assumé, mais ça revenait à repartir de zéro
    // à chaque changement de nom. Tout le risque est concentré dans un module à
    // part, testé sur un export réel de la base.
    const plan = planifierRenommage(mfCache, oldPseudo, newPseudo);
    const bilan = appliquerPlan(mfCache, plan, mfSet, mfDel);
    if (bilan.collisions) {
        console.log(`⚠️  Renommage ${oldPseudo} → ${newPseudo} : ${bilan.collisions} clé(s) non migrée(s), destination déjà occupée.`);
    }

    setSessionCookie(res, newPseudo);
    res.json({ ok: true, pseudo: newPseudo, migration: bilan });
});

app.post('/api/account/change-password', requireAuthApi, (req, res) => {
    const user = registeredUsers[currentUser(req)];
    if (!user) return res.status(404).json({ error: 'Compte introuvable.' });
    const current = String((req.body && req.body.current) || '');
    const next = String((req.body && req.body.next) || '');
    if (!verifyPassword(current, user.passwordHash)) return res.status(401).json({ error: 'Mot de passe actuel incorrect.' });
    if (next.length < MIN_PASSWORD) return res.status(400).json({ error: `Mot de passe trop court (${MIN_PASSWORD} caractères minimum).` });
    user.passwordHash = hashPassword(next);
    saveUsers(true);
    res.json({ ok: true });
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
    motus: {
        word: motusWord, wordPreview: motusWordPreview, def: motusDefFor,
        lenForDate: motusLenForDate, lengths: MOTUS_LENGTHS, tries: MOTUS_TRIES,
        kProg: kMotusProg, kBoard: kMotusBoard, kCmt: kMotusCmt,
    },
    motjuste: {
        word: mjWord, wordPreview: mjWordPreview,
        kProg: kMjProg, kBoard: kMjBoard, kCmt: kMjCmt,
        engine: mjEngine,
    },
    pbac: () => pbacApi,
    undercover: () => undercoverApi,
    yams: () => yamsApi,
    motusparty: () => motusPartyApi,
});


// ---------------------------------------------------------------------
//  Statique (le salon) + Socket.io prêt pour les apps temps réel.
// ---------------------------------------------------------------------
app.use(express.static('public'));

io.on('connection', (socket) => {
    // Prêt pour Perudo & co. Le salon lui-même n'a pas besoin de temps réel.

    // Salle Motus : uniquement les personnes réellement sur la page reçoivent
    // les résolutions en direct des autres, jamais tout le portail.
    socket.on('motus_join', () => { socket.join('motus_room'); });
    socket.on('motus_leave', () => { socket.leave('motus_room'); });
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