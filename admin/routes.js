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
    //  SYSTÈME
    // =================================================================
    // Sauvegarde complète à télécharger
    G('/backup', (req, res) => {
        const payload = {
            exportedAt: new Date().toISOString(),
            version: 1,
            users: users(),
            motsfleches: mf.cache(),
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