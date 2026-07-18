// =====================================================================
//  ADMINISTRATION — routes réservées (lot 1 : comptes, sauvegarde, système)
//  Toutes les routes passent par requireAdmin : la vérification est faite
//  côté serveur, jamais seulement en cachant un bouton dans l'interface.
// =====================================================================
const fs = require('fs');

module.exports = function attachAdmin(app, ctx) {
    const { requireAdmin, currentUser, isAdmin, ADMIN_USERS, users, saveUsers,
            hashPassword, makeRecoveryCode, mf, redis } = ctx;

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
            admins: ADMIN_USERS,
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
        res.json({
            pseudo: u.pseudo,
            created: u.created || 0,
            lastLogin: u.lastLogin || 0,
            banned: !!u.banned,
            admin: isAdmin(u.pseudo),
            hasRecovery: !!u.recoveryHash,
            motsfleches: { ...mfStats, daysPlayed: days.length },
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