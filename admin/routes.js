// =====================================================================
//  ADMINISTRATION — routes réservées (lot 1 : comptes, sauvegarde, système)
//  Toutes les routes passent par requireAdmin : la vérification est faite
//  côté serveur, jamais seulement en cachant un bouton dans l'interface.
// =====================================================================
const fs = require('fs');

module.exports = function attachAdmin(app, ctx) {
    const { requireAdmin, currentUser, isAdmin, users, saveUsers,
            hashPassword, makeRecoveryCode, mf, redis, motus } = ctx;

    // --- Journal des actions (mémoire + persistance légère) ---
    const LOG_KEY = 'mf:adminlog';
    function log(who, action, target, detail) {
        const list = (mf.get(LOG_KEY) || []).slice();
        list.push({ who, action, target: target || '', detail: detail || '', ts: Date.now() });
        if (list.length > 300) list.splice(0, list.length - 300);
        mf.set(LOG_KEY, list);
    }

    const A = (path, handler) => app.post('/api/admin' + path, requireAdmin, handler);
    const G = (path, handler) => app.get('/api/admin' + path, requireAdmin, handler);

    // =================================================================
    //  VUE D'ENSEMBLE
    // =================================================================
    G('/overview', (req, res) => {
        const all = Object.values(users());
        const today = mf.today();
        const cache = mf.cache();
        let solvedToday = 0;
        for (const lv of mf.levels) {
            solvedToday += Object.keys(cache).filter(k => k.startsWith(`mf:prog:`) && k.endsWith(`:${today}:${lv}`) && (cache[k] || {}).solved).length;
        }
        const day = 864e5;
        res.json({
            you: currentUser(req),
            accounts: all.length,
            admins: ctx.allAdmins(),
            banned: all.filter(u => u.banned).length,
            newThisWeek: all.filter(u => u.created && Date.now() - u.created < 7 * day).length,
            activeThisWeek: all.filter(u => u.lastLogin && Date.now() - u.lastLogin < 7 * day).length,
            solvedToday,
            mfKeys: Object.keys(cache).length,
            uptime: Math.floor(process.uptime()),
            memory: Math.round(process.memoryUsage().rss / 1048576),
            storage: redis() ? 'Upstash Redis' : 'Fichiers locaux',
            announce: mf.get('mf:announce') || '',
        });
    });

    // =================================================================
    //  COMPTES
    // =================================================================
    G('/accounts', (req, res) => {
        const q = String(req.query.q || '').toLowerCase().trim();
        const sort = req.query.sort || 'recent';
        let list = Object.values(users()).filter(u => !q || u.pseudo.toLowerCase().includes(q));
        const sorters = {
            recent: (a, b) => (b.created || 0) - (a.created || 0),
            active: (a, b) => (b.lastLogin || 0) - (a.lastLogin || 0),
            name: (a, b) => a.pseudo.localeCompare(b.pseudo),
        };
        list.sort(sorters[sort] || sorters.recent);
        res.json({
            total: list.length,
            accounts: list.slice(0, 100).map(u => ({
                pseudo: u.pseudo,
                created: u.created || 0,
                lastLogin: u.lastLogin || 0,
                banned: !!u.banned,
                admin: isAdmin(u.pseudo),
                hasRecovery: !!u.recoveryHash,
            })),
        });
    });

    // Fiche détaillée d'un compte (toutes apps confondues)
    G('/account', (req, res) => {
        const pseudo = String(req.query.pseudo || '');
        const u = users()[pseudo];
        if (!u) return res.status(404).json({ error: 'Compte introuvable.' });
        const cache = mf.cache();
        const mfStats = { solved: 0, gaveUp: 0, started: 0, best: null };
        for (const [k, v] of Object.entries(cache)) {
            if (!k.startsWith(`mf:prog:${pseudo}:`) || !v) continue;
            mfStats.started++;
            if (v.solved) { mfStats.solved++; if (v.seconds && (!mfStats.best || v.seconds < mfStats.best)) mfStats.best = v.seconds; }
            if (v.gaveUp) mfStats.gaveUp++;
        }
        const days = mf.get(`mf:days:${pseudo}`) || [];
        let perudo = null;
        try {
            const pu = ctx.perudo().users()[pseudo];
            if (pu) perudo = { wins: pu.wins || 0, played: pu.played || 0, rankPoints: pu.rankPoints || 0, bestStreak: pu.bestStreak || 0 };
        } catch (e) {}
        res.json({
            pseudo: u.pseudo,
            created: u.created || 0,
            lastLogin: u.lastLogin || 0,
            banned: !!u.banned,
            admin: isAdmin(u.pseudo),
            hasRecovery: !!u.recoveryHash,
            motsfleches: { ...mfStats, daysPlayed: days.length },
            perudo,
        });
    });

    A('/account/rename', (req, res) => {
        const from = String(req.body.from || ''), to = String(req.body.to || '').trim();
        const U = users();
        if (!U[from]) return res.status(404).json({ error: 'Compte introuvable.' });
        if (!/^[a-zA-Z0-9_ -]{3,20}$/.test(to)) return res.status(400).json({ error: 'Nouveau nom invalide (3 à 20 caractères).' });
        if (U[to]) return res.status(409).json({ error: 'Ce nom est déjà pris.' });
        U[to] = { ...U[from], pseudo: to, sessionEpoch: Date.now() };
        delete U[from];
        // report des données mots fléchés
        const cache = mf.cache();
        for (const k of Object.keys(cache)) {
            if (k.startsWith(`mf:prog:${from}:`)) { mf.set(k.replace(`mf:prog:${from}:`, `mf:prog:${to}:`), cache[k]); mf.del(k); }
            if (k === `mf:days:${from}`) { mf.set(`mf:days:${to}`, cache[k]); mf.del(k); }
            if (k.startsWith('mf:board:') && Array.isArray(cache[k])) {
                let changed = false;
                const list = cache[k].map(e => (e.u === from ? (changed = true, { ...e, u: to }) : e));
                if (changed) mf.set(k, list);
            }
        }
        saveUsers(true);
        log(currentUser(req), 'renommer', from, '→ ' + to);
        res.json({ ok: true });
    });

    A('/account/password', (req, res) => {
        const pseudo = String(req.body.pseudo || '');
        const u = users()[pseudo];
        if (!u) return res.status(404).json({ error: 'Compte introuvable.' });
        const temp = makeRecoveryCode().slice(0, 9);           // mot de passe temporaire lisible
        u.passwordHash = hashPassword(temp);
        u.sessionEpoch = Date.now();                            // déconnecte les sessions existantes
        saveUsers(true);
        log(currentUser(req), 'reset mot de passe', pseudo);
        res.json({ ok: true, tempPassword: temp });
    });

    A('/account/recovery', (req, res) => {
        const pseudo = String(req.body.pseudo || '');
        const u = users()[pseudo];
        if (!u) return res.status(404).json({ error: 'Compte introuvable.' });
        const code = makeRecoveryCode();
        u.recoveryHash = hashPassword(code);
        saveUsers(true);
        log(currentUser(req), 'nouveau code', pseudo);
        res.json({ ok: true, recoveryCode: code });
    });

    A('/account/ban', (req, res) => {
        const pseudo = String(req.body.pseudo || '');
        const banned = !!req.body.banned;
        const u = users()[pseudo];
        if (!u) return res.status(404).json({ error: 'Compte introuvable.' });
        if (isAdmin(pseudo) && banned) return res.status(400).json({ error: 'Impossible de suspendre un administrateur.' });
        u.banned = banned;
        if (banned) u.sessionEpoch = Date.now();
        saveUsers(true);
        log(currentUser(req), banned ? 'suspendre' : 'réactiver', pseudo);
        res.json({ ok: true });
    });

    A('/account/logout', (req, res) => {
        const pseudo = String(req.body.pseudo || '');
        const u = users()[pseudo];
        if (!u) return res.status(404).json({ error: 'Compte introuvable.' });
        u.sessionEpoch = Date.now();
        saveUsers(true);
        log(currentUser(req), 'déconnexion forcée', pseudo);
        res.json({ ok: true });
    });

    A('/account/delete', (req, res) => {
        const pseudo = String(req.body.pseudo || '');
        if (isAdmin(pseudo)) return res.status(400).json({ error: 'Impossible de supprimer un administrateur.' });
        const U = users();
        if (!U[pseudo]) return res.status(404).json({ error: 'Compte introuvable.' });
        delete U[pseudo];
        const cache = mf.cache();
        for (const k of Object.keys(cache)) {
            if (k.startsWith(`mf:prog:${pseudo}:`) || k === `mf:days:${pseudo}`) mf.del(k);
            if (k.startsWith('mf:board:') && Array.isArray(cache[k]) && cache[k].some(e => e.u === pseudo)) {
                mf.set(k, cache[k].filter(e => e.u !== pseudo));
            }
        }
        saveUsers(true);
        log(currentUser(req), 'SUPPRESSION', pseudo);
        res.json({ ok: true });
    });

    // =================================================================
    //  DICTIONNAIRE (mots fléchés)
    // =================================================================
    const dict = require('../motsfleches/dict');
    const DICT_KEY = 'mf:dict';

    // Au démarrage : on applique les modifications enregistrées
    dict.setOverrides(mf.get(DICT_KEY) || {});
    function saveDict(obj) { mf.set(DICT_KEY, obj); dict.setOverrides(obj); }

    // Compte les apparitions de chaque mot dans les grilles passées
    function usageCounts() {
        const counts = {};
        for (const [k, v] of Object.entries(mf.cache())) {
            if (!k.startsWith('mf:hist:') || !Array.isArray(v)) continue;
            for (const w of v) counts[w] = (counts[w] || 0) + 1;
        }
        return counts;
    }

    G('/dict', (req, res) => {
        const q = String(req.query.q || '').toUpperCase().trim();
        const len = Number(req.query.len) || 0;
        const lvl = Number(req.query.level) || 0;
        const only = req.query.only || '';                 // 'custom' = uniquement mes ajouts
        const ov = dict.getOverrides();
        const counts = usageCounts();

        let list = Object.values(dict.words()).flat().map(w => ({
            m: w.m, defs: w.defs, n: w.n,
            custom: !!ov[w.m],
            used: counts[w.m] || 0,
        }));
        if (q) list = list.filter(w => w.m.includes(q));
        if (len) list = list.filter(w => w.m.length === len);
        if (lvl) list = list.filter(w => w.n === lvl);
        if (only === 'custom') list = list.filter(w => w.custom);
        if (only === 'unused') list = list.filter(w => !w.used);
        list.sort((a, b) => a.m.localeCompare(b.m));

        res.json({ total: list.length, words: list.slice(0, 200) });
    });

    G('/dict/stats', (req, res) => {
        const counts = usageCounts();
        const all = Object.values(dict.words()).flat();
        const ov = dict.getOverrides();
        const byLen = {}, byLvl = { 1: 0, 2: 0, 3: 0 };
        all.forEach(w => { byLen[w.m.length] = (byLen[w.m.length] || 0) + 1; byLvl[w.n] = (byLvl[w.n] || 0) + 1; });
        const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([m, c]) => ({ m, c }));
        res.json({
            total: all.length,
            defs: all.reduce((s, w) => s + w.defs.length, 0),
            custom: Object.keys(ov).filter(m => !ov[m].deleted).length,
            removed: Object.keys(ov).filter(m => ov[m].deleted).length,
            never: all.filter(w => !counts[w.m]).length,
            byLen, byLvl, top,
        });
    });

    G('/dict/word', (req, res) => {
        const m = String(req.query.m || '').toUpperCase();
        const w = dict.find(m);
        if (!w) return res.status(404).json({ error: 'Mot introuvable.' });
        res.json({ word: { ...w, used: usageCounts()[m] || 0 } });
    });

    A('/dict/save', (req, res) => {
        const m = String(req.body.m || '').trim().toUpperCase();
        const defs = (req.body.defs || []).map(d => String(d).trim()).filter(Boolean);
        const n = Number(req.body.n);
        const err = dict.validate(m, defs, n);
        if (err) return res.status(400).json({ error: err });
        const existing = dict.find(m);
        if (!req.body.edit && existing) return res.status(409).json({ error: 'Ce mot existe déjà — ouvre-le pour le modifier.' });
        const ov = { ...dict.getOverrides() };
        ov[m] = { defs, n };
        saveDict(ov);
        log(currentUser(req), existing ? 'mot modifié' : 'mot ajouté', m, defs[0]);
        res.json({ ok: true });
    });

    A('/dict/delete', (req, res) => {
        const m = String(req.body.m || '').trim().toUpperCase();
        if (!dict.find(m)) return res.status(404).json({ error: 'Mot introuvable.' });
        const ov = { ...dict.getOverrides() };
        const inBase = (dict.baseWords()[m.length] || []).some(w => w.m === m);
        if (inBase) ov[m] = { deleted: true };            // masqué (le fichier de base n'est pas touché)
        else delete ov[m];                                 // simple ajout : on l'efface
        saveDict(ov);
        log(currentUser(req), 'mot retiré', m);
        res.json({ ok: true });
    });

    A('/dict/restore', (req, res) => {
        const m = String(req.body.m || '').trim().toUpperCase();
        const ov = { ...dict.getOverrides() };
        if (!ov[m]) return res.status(404).json({ error: 'Rien à annuler pour ce mot.' });
        delete ov[m];
        saveDict(ov);
        log(currentUser(req), 'mot rétabli', m);
        res.json({ ok: true });
    });

    // =================================================================
    //  ADMINISTRATEURS
    // =================================================================
    G('/admins', (req, res) => {
        res.json({
            root: ctx.rootAdmins,
            extra: (mf.get('mf:admins') || []),
            all: ctx.allAdmins(),
            you: currentUser(req),
        });
    });
    A('/admins/add', (req, res) => {
        const pseudo = String(req.body.pseudo || '').trim();
        if (!users()[pseudo]) return res.status(404).json({ error: 'Ce compte n’existe pas.' });
        if (isAdmin(pseudo)) return res.status(409).json({ error: 'Déjà administrateur.' });
        const list = (mf.get('mf:admins') || []).slice();
        list.push(pseudo);
        mf.set('mf:admins', list);
        log(currentUser(req), 'admin ajouté', pseudo);
        res.json({ ok: true });
    });
    A('/admins/remove', (req, res) => {
        const pseudo = String(req.body.pseudo || '').trim();
        if (ctx.isRootAdmin(pseudo)) return res.status(400).json({ error: 'Administrateur principal : non retirable.' });
        if (pseudo === currentUser(req)) return res.status(400).json({ error: 'Tu ne peux pas te retirer toi-même.' });
        const list = (mf.get('mf:admins') || []).filter(p => p !== pseudo);
        mf.set('mf:admins', list);
        log(currentUser(req), 'admin retiré', pseudo);
        res.json({ ok: true });
    });

    // =================================================================
    //  PERUDO
    // =================================================================
    const P = () => ctx.perudo();

    G('/perudo/overview', (req, res) => {
        const api = P();
        if (!api) return res.json({ available: false });
        const all = Object.values(api.users());
        res.json({
            available: true,
            accounts: all.length,
            games: api.games(),
            online: api.online(),
            achievements: api.achievements(),
            topPlayers: all.slice().sort((a, b) => (b.rankPoints || 0) - (a.rankPoints || 0)).slice(0, 10)
                .map(u => ({ pseudo: u.pseudo, rankPoints: u.rankPoints || 0, wins: u.wins || 0, played: u.played || 0 })),
        });
    });

    G('/perudo/player', (req, res) => {
        const api = P(); if (!api) return res.status(400).json({ error: 'Perudo indisponible.' });
        const u = api.users()[String(req.query.pseudo || '')];
        if (!u) return res.status(404).json({ error: 'Aucun profil Perudo pour ce joueur.' });
        api.ensure(u);
        res.json({
            pseudo: u.pseudo,
            wins: u.wins || 0, played: u.played || 0, rankPoints: u.rankPoints || 0,
            currentStreak: u.currentStreak || 0, bestStreak: u.bestStreak || 0,
            title: u.title || '', achievements: u.achievements || [],
            avatar: u.avatar || '', frame: u.frame || '', banner: u.banner || '', nameColor: u.nameColor || '',
            stats: u.stats || {},
        });
    });

    A('/perudo/stats', (req, res) => {
        const api = P(); if (!api) return res.status(400).json({ error: 'Perudo indisponible.' });
        const u = api.users()[String(req.body.pseudo || '')];
        if (!u) return res.status(404).json({ error: 'Profil introuvable.' });
        api.ensure(u);
        const num = (v, max) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
        if (req.body.wins !== undefined) u.wins = num(req.body.wins, 1e6);
        if (req.body.played !== undefined) u.played = num(req.body.played, 1e6);
        if (req.body.rankPoints !== undefined) u.rankPoints = num(req.body.rankPoints, 1e7);
        if (req.body.bestStreak !== undefined) u.bestStreak = num(req.body.bestStreak, 1e4);
        if (u.wins > u.played) u.played = u.wins;
        api.save(true); api.pushProfile(u.pseudo);
        log(currentUser(req), 'stats Perudo', u.pseudo);
        res.json({ ok: true });
    });

    A('/perudo/cosmetics', (req, res) => {
        const api = P(); if (!api) return res.status(400).json({ error: 'Perudo indisponible.' });
        const u = api.users()[String(req.body.pseudo || '')];
        if (!u) return res.status(404).json({ error: 'Profil introuvable.' });
        const id = (v) => (typeof v === 'string' && /^[a-z0-9_]{0,20}$/.test(v)) ? v : null;
        const hex = (v) => (v === '' || /^#[0-9a-fA-F]{6}$/.test(v || '')) ? v : null;
        for (const k of ['avatar', 'frame', 'banner']) {
            if (req.body[k] !== undefined) { const v = id(req.body[k]); if (v !== null) u[k] = v; }
        }
        if (req.body.nameColor !== undefined) { const v = hex(req.body.nameColor); if (v !== null) u.nameColor = v; }
        if (req.body.title !== undefined) u.title = String(req.body.title || '').slice(0, 30);
        api.save(true); api.pushProfile(u.pseudo);
        log(currentUser(req), 'cosmétiques Perudo', u.pseudo);
        res.json({ ok: true });
    });

    A('/perudo/reset', (req, res) => {
        const api = P(); if (!api) return res.status(400).json({ error: 'Perudo indisponible.' });
        const u = api.users()[String(req.body.pseudo || '')];
        if (!u) return res.status(404).json({ error: 'Profil introuvable.' });
        u.wins = 0; u.played = 0; u.rankPoints = 0; u.currentStreak = 0; u.bestStreak = 0;
        u.achievements = []; u.title = '';
        if (u.stats) for (const k of Object.keys(u.stats)) if (typeof u.stats[k] === 'number') u.stats[k] = 0;
        if (u.periodic) u.periodic = {};
        api.save(true); api.pushProfile(u.pseudo);
        log(currentUser(req), 'RESET Perudo', u.pseudo);
        res.json({ ok: true });
    });

    A('/perudo/endgame', (req, res) => {
        const api = P(); if (!api) return res.status(400).json({ error: 'Perudo indisponible.' });
        const ok = api.endGame(String(req.body.id || ''));
        if (ok) log(currentUser(req), 'partie close', String(req.body.id || ''));
        res.json({ ok });
    });

    A('/perudo/kick', (req, res) => {
        const api = P(); if (!api) return res.status(400).json({ error: 'Perudo indisponible.' });
        const ok = api.kick(String(req.body.sid || ''), req.body.message);
        if (ok) log(currentUser(req), 'joueur expulsé', String(req.body.pseudo || ''));
        res.json({ ok });
    });

    // =================================================================
    //  GRILLES (mots fléchés)
    // =================================================================
    const MFG = require('../motsfleches/generator');

    G('/mf/day', (req, res) => {
        const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : mf.today();
        const out = {};
        for (const lv of mf.levels) {
            const grid = mf.get(`mf:grid:${date}:${lv}`);
            const board = (mf.get(`mf:board:${date}:${lv}`) || []).slice().sort((a, b) => a.s - b.s);
            let started = 0, solved = 0, gaveUp = 0;
            for (const [k, v] of Object.entries(mf.cache())) {
                if (!k.startsWith('mf:prog:') || !k.endsWith(`:${date}:${lv}`) || !v) continue;
                started++; if (v.solved) solved++; if (v.gaveUp) gaveUp++;
            }
            out[lv] = {
                generated: !!grid,
                words: grid ? grid.words : 0,
                wordList: grid ? (grid.wordList || []) : [],
                board: board.map(e => ({ u: e.u, s: e.s, susp: !!e.susp })),
                started, solved, gaveUp,
            };
        }
        res.json({ date, today: mf.today(), levels: out });
    });

    // Aperçu des grilles à venir (elles ne sont pas encore figées)
    G('/mf/upcoming', (req, res) => {
        const today = mf.today();
        const out = [];
        for (let i = 1; i <= 7; i++) {
            const date = mf.shift(today, i);
            const day = { date, levels: {} };
            for (const lv of mf.levels) {
                try {
                    const recent = [];
                    for (let j = 0; j < 15; j++) { const h = mf.get(`mf:hist:${mf.shift(date, -j - 1)}`); if (Array.isArray(h)) recent.push(...h); }
                    const p = MFG.generate(lv, date, recent);
                    day.levels[lv] = { words: p.words, list: p.wordList };
                } catch (e) { day.levels[lv] = { error: true }; }
            }
            out.push(day);
        }
        res.json({ days: out });
    });

    A('/mf/regen', (req, res) => {
        const date = /^\d{4}-\d{2}-\d{2}$/.test(req.body.date || '') ? req.body.date : mf.today();
        const lv = mf.levels.includes(req.body.level) ? req.body.level : mf.levels[0];
        mf.del(`mf:grid:${date}:${lv}`);
        mf.del(`mf:hist:${date}`);
        // les progressions de cette grille n'ont plus de sens
        for (const k of Object.keys(mf.cache())) if (k.startsWith('mf:prog:') && k.endsWith(`:${date}:${lv}`)) mf.del(k);
        mf.del(`mf:board:${date}:${lv}`);
        log(currentUser(req), 'grille régénérée', date + ' ' + lv);
        res.json({ ok: true });
    });

    A('/mf/board/remove', (req, res) => {
        const date = String(req.body.date || mf.today());
        const lv = mf.levels.includes(req.body.level) ? req.body.level : mf.levels[0];
        const pseudo = String(req.body.pseudo || '');
        const key = `mf:board:${date}:${lv}`;
        mf.set(key, (mf.get(key) || []).filter(e => e.u !== pseudo));
        log(currentUser(req), 'temps supprimé', pseudo, date + ' ' + lv);
        res.json({ ok: true });
    });

    A('/mf/board/flag', (req, res) => {
        const date = String(req.body.date || mf.today());
        const lv = mf.levels.includes(req.body.level) ? req.body.level : mf.levels[0];
        const pseudo = String(req.body.pseudo || '');
        const key = `mf:board:${date}:${lv}`;
        mf.set(key, (mf.get(key) || []).map(e => (e.u === pseudo ? { ...e, susp: !e.susp } : e)));
        log(currentUser(req), 'temps marqué', pseudo);
        res.json({ ok: true });
    });

    A('/mf/progress/reset', (req, res) => {
        const date = String(req.body.date || mf.today());
        const lv = mf.levels.includes(req.body.level) ? req.body.level : mf.levels[0];
        const pseudo = String(req.body.pseudo || '');
        mf.del(`mf:prog:${pseudo}:${date}:${lv}`);
        log(currentUser(req), 'progression réinitialisée', pseudo, date + ' ' + lv);
        res.json({ ok: true });
    });

    G('/mf/comments', (req, res) => {
        const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : mf.today();
        res.json({ date, comments: mf.get(`mf:cmt:${date}`) || [] });
    });
    A('/mf/comments/remove', (req, res) => {
        const date = String(req.body.date || mf.today());
        const ts = Number(req.body.ts);
        const key = `mf:cmt:${date}`;
        mf.set(key, (mf.get(key) || []).filter(c => c.ts !== ts));
        log(currentUser(req), 'message supprimé', String(req.body.u || ''));
        res.json({ ok: true });
    });

    // Difficulté observée par niveau (sur 14 jours)
    G('/mf/difficulty', (req, res) => {
        const today = mf.today();
        const out = {};
        for (const lv of mf.levels) out[lv] = { started: 0, solved: 0, gaveUp: 0, times: [] };
        for (let i = 0; i < 14; i++) {
            const date = mf.shift(today, -i);
            for (const lv of mf.levels) {
                for (const [k, v] of Object.entries(mf.cache())) {
                    if (!k.startsWith('mf:prog:') || !k.endsWith(`:${date}:${lv}`) || !v) continue;
                    out[lv].started++;
                    if (v.solved) { out[lv].solved++; if (v.seconds) out[lv].times.push(v.seconds); }
                    if (v.gaveUp) out[lv].gaveUp++;
                }
            }
        }
        for (const lv of mf.levels) {
            const t = out[lv].times;
            out[lv].avg = t.length ? Math.round(t.reduce((a, b) => a + b, 0) / t.length) : 0;
            out[lv].best = t.length ? Math.min(...t) : 0;
            out[lv].rate = out[lv].started ? Math.round(out[lv].solved / out[lv].started * 100) : 0;
            delete out[lv].times;
        }
        res.json({ levels: out });
    });

    // =================================================================
    //  MOTUS
    // =================================================================
    G('/motus/day', (req, res) => {
        const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : mf.today();
        const word = motus.word(date);
        const board = (mf.get(motus.kBoard(date)) || []).slice().sort((a, b) => a.tries - b.tries || a.ts - b.ts);
        let started = 0, solved = 0, lost = 0;
        for (const [k, v] of Object.entries(mf.cache())) {
            if (!k.startsWith('motus:prog:') || !k.endsWith(`:${date}`) || !v) continue;
            started++;
            if (v.solved) solved++;
            else if (v.gaveUp || (v.guesses || []).length >= motus.tries) lost++;
        }
        res.json({
            date, today: mf.today(), word, definition: motus.def(word),
            board: board.map(e => ({ u: e.u, tries: e.tries, susp: !!e.susp })),
            started, solved, lost,
        });
    });

    // Aperçu des mots à venir (pas encore figés)
    G('/motus/upcoming', (req, res) => {
        const today = mf.today();
        const out = [];
        for (let i = 1; i <= 7; i++) {
            const date = mf.shift(today, i);
            out.push({ date, word: motus.wordPreview(date) });
        }
        res.json({ days: out });
    });

    A('/motus/regen', (req, res) => {
        const date = /^\d{4}-\d{2}-\d{2}$/.test(req.body.date || '') ? req.body.date : mf.today();
        mf.del(`motus:word:${date}`);
        for (const k of Object.keys(mf.cache())) if (k.startsWith('motus:prog:') && k.endsWith(`:${date}`)) mf.del(k);
        mf.del(motus.kBoard(date));
        log(currentUser(req), 'mot Motus régénéré', date);
        res.json({ ok: true, word: motus.word(date) });
    });

    A('/motus/board/remove', (req, res) => {
        const date = String(req.body.date || mf.today());
        const pseudo = String(req.body.pseudo || '');
        const key = motus.kBoard(date);
        mf.set(key, (mf.get(key) || []).filter(e => e.u !== pseudo));
        log(currentUser(req), 'score Motus supprimé', pseudo, date);
        res.json({ ok: true });
    });

    A('/motus/board/flag', (req, res) => {
        const date = String(req.body.date || mf.today());
        const pseudo = String(req.body.pseudo || '');
        const key = motus.kBoard(date);
        mf.set(key, (mf.get(key) || []).map(e => (e.u === pseudo ? { ...e, susp: !e.susp } : e)));
        log(currentUser(req), 'score Motus marqué', pseudo);
        res.json({ ok: true });
    });

    A('/motus/progress/reset', (req, res) => {
        const date = String(req.body.date || mf.today());
        const pseudo = String(req.body.pseudo || '');
        mf.del(motus.kProg(pseudo, date));
        log(currentUser(req), 'progression Motus réinitialisée', pseudo, date);
        res.json({ ok: true });
    });

    G('/motus/comments', (req, res) => {
        const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : mf.today();
        res.json({ date, comments: mf.get(motus.kCmt(date)) || [] });
    });
    A('/motus/comments/remove', (req, res) => {
        const date = String(req.body.date || mf.today());
        const ts = Number(req.body.ts);
        const key = motus.kCmt(date);
        mf.set(key, (mf.get(key) || []).filter(c => c.ts !== ts));
        log(currentUser(req), 'message Motus supprimé', String(req.body.u || ''));
        res.json({ ok: true });
    });

    // Difficulté observée sur 14 jours
    G('/motus/difficulty', (req, res) => {
        const today = mf.today();
        let started = 0, solved = 0, lost = 0;
        const triesArr = [];
        for (let i = 0; i < 14; i++) {
            const date = mf.shift(today, -i);
            for (const [k, v] of Object.entries(mf.cache())) {
                if (!k.startsWith('motus:prog:') || !k.endsWith(`:${date}`) || !v) continue;
                started++;
                const nTries = (v.guesses || []).length;
                if (v.solved) { solved++; triesArr.push(nTries); }
                else if (v.gaveUp || nTries >= motus.tries) lost++;
            }
        }
        const avg = triesArr.length ? Math.round((triesArr.reduce((a, b) => a + b, 0) / triesArr.length) * 10) / 10 : 0;
        res.json({ started, solved, lost, avgTries: avg, rate: started ? Math.round(solved / started * 100) : 0 });
    });

    // =================================================================
    //  SYSTÈME
    // =================================================================
    // Sauvegarde complète à télécharger
    G('/backup', (req, res) => {
        const payload = {
            exportedAt: new Date().toISOString(),
            version: 1,
            users: users(),
            motsfleches: mf.cache(),
            dictionnaire: dict.getOverrides(),
        };
        const name = 'salon-sauvegarde-' + new Date().toISOString().slice(0, 10) + '.json';
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
        res.send(JSON.stringify(payload, null, 2));
    });

    A('/purge', (req, res) => {
        mf.purge();
        log(currentUser(req), 'purge manuelle');
        res.json({ ok: true, keys: Object.keys(mf.cache()).length });
    });

    // Annonce affichée à tous dans le salon
    A('/announce', (req, res) => {
        const text = String(req.body.text || '').trim().slice(0, 200);
        mf.set('mf:announce', text);
        log(currentUser(req), text ? 'annonce' : 'annonce retirée', '', text);
        res.json({ ok: true, announce: text });
    });

    G('/log', (req, res) => {
        res.json({ log: (mf.get(LOG_KEY) || []).slice(-100).reverse() });
    });

    // Annonce lisible par tout le monde (affichée dans le salon)
    app.get('/api/announce', (req, res) => res.json({ announce: mf.get('mf:announce') || '' }));
};