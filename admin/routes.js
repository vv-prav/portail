// =====================================================================
//  ADMINISTRATION — routes réservées (lot 1 : comptes, sauvegarde, système)
//  Toutes les routes passent par requireAdmin : la vérification est faite
//  côté serveur, jamais seulement en cachant un bouton dans l'interface.
// =====================================================================
const fs = require('fs');
const { norm: normPseudo } = require('../comptes/renommage');

module.exports = function attachAdmin(app, ctx) {
    const { requireAdmin, currentUser, isAdmin, users, saveUsers,
            hashPassword, makeRecoveryCode, motDePasseProvisoire, mf, redis, motus, pbac } = ctx;

    // --- Journal des actions (mémoire + persistance légère) ---
    const LOG_KEY = 'mf:adminlog';
    function log(who, action, target, detail) {
        const list = (mf.get(LOG_KEY) || []).slice();
        list.push({ who, action, target: target || '', detail: detail || '', ts: Date.now() });
        if (list.length > 300) list.splice(0, list.length - 300);
        mf.set(LOG_KEY, list);
    }

    const CH = () => ctx.chiffres;
    const GE = () => ctx.geo;

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
        const ONLINE_WINDOW = 90 * 1000;   // cohérent avec le pulse du salon (60s) + marge
        const seenOf = (u) => u.lastSeen || u.lastLogin || 0;
        res.json({
            you: currentUser(req),
            accounts: all.length,
            admins: ctx.allAdmins(),
            banned: all.filter(u => u.banned).length,
            newThisWeek: all.filter(u => u.created && Date.now() - u.created < 7 * day).length,
            activeThisWeek: all.filter(u => seenOf(u) && Date.now() - seenOf(u) < 7 * day).length,
            onlineNow: all.filter(u => u.lastSeen && Date.now() - u.lastSeen < ONLINE_WINDOW)
                .sort((a, b) => b.lastSeen - a.lastSeen).map(u => u.pseudo),
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

    // =================================================================
    //  TOUTES LES APPS RÉUNIES — un seul tableau de bord, en plus des
    //  pages détaillées par jeu qui existent déjà.
    // =================================================================
    G('/apps-overview', (req, res) => {
        const cache = mf.cache();
        const today = mf.today();

        let mfSolvedToday = 0;
        for (const lv of mf.levels) {
            mfSolvedToday += Object.keys(cache).filter(k => k.startsWith('mf:prog:') && k.endsWith(`:${today}:${lv}`) && (cache[k] || {}).solved).length;
        }

        let perudoOnline = 0, perudoGames = 0;
        try { perudoOnline = ctx.perudo().online().length; perudoGames = ctx.perudo().games().filter(g => g.status === 'playing' && !g.vsBot).length; } catch (e) {}

        let pbacOnline = 0, pbacGames = 0, pbacTotalGamesPlayed = 0;
        try {
            pbacOnline = pbac().online().length;
            pbacGames = pbac().games().filter(g => g.status !== 'lobby' && g.status !== 'ended').length;
        } catch (e) {}
        for (const k of Object.keys(cache)) {
            if (k.startsWith('pbac:stats:')) pbacTotalGamesPlayed += (cache[k] && cache[k].gamesPlayed) || 0;
        }

        let undercoverOnline = 0, undercoverGames = 0;
        try {
            undercoverOnline = ctx.undercover().online().length;
            undercoverGames = ctx.undercover().games().filter(g => g.status !== 'lobby' && g.status !== 'ended').length;
        } catch (e) {}

        let yamsOnline = 0, yamsGames = 0, yamsTotalGamesPlayed = 0;
        try {
            yamsOnline = ctx.yams().online().length;
            yamsGames = ctx.yams().games().filter(g => g.status !== 'lobby' && g.status !== 'ended').length;
        } catch (e) {}
        for (const k of Object.keys(cache)) {
            if (k.startsWith('yams:stats:')) yamsTotalGamesPlayed += (cache[k] && cache[k].gamesPlayed) || 0;
        }

        let mpOnline = 0, mpGames = 0, mpTotalMatchesPlayed = 0;
        try {
            mpOnline = ctx.motusparty().online().length;
            mpGames = ctx.motusparty().games().filter(g => g.status !== 'lobby' && g.status !== 'ended').length;
        } catch (e) {}
        for (const k of Object.keys(cache)) {
            if (k.startsWith('motusparty:stats:')) mpTotalMatchesPlayed += (cache[k] && cache[k].matchesPlayed) || 0;
        }

        const motusBoard = cache[motus.kBoard(today)] || [];

        res.json({
            mf: { solvedToday: mfSolvedToday, totalKeys: Object.keys(cache).length },
            perudo: { online: perudoOnline, activeGames: perudoGames },
            pbac: { online: pbacOnline, activeGames: pbacGames, totalGamesPlayed: pbacTotalGamesPlayed },
            undercover: { online: undercoverOnline, activeGames: undercoverGames },
            yams: { online: yamsOnline, activeGames: yamsGames, totalGamesPlayed: yamsTotalGamesPlayed },
            motusparty: { online: mpOnline, activeGames: mpGames, totalMatchesPlayed: mpTotalMatchesPlayed },
            motus: { solversToday: motusBoard.length },
        });
    });

    G('/game-history', (req, res) => {
        const history = mf.get('admin:gameHistory') || [];
        res.json({ history: history.slice(0, 100) });
    });

    // Recherche transversale : comptes ET historique des parties, pour ne plus
    // avoir à changer d'onglet juste pour retrouver quelqu'un.
    G('/search', (req, res) => {
        const q = String(req.query.q || '').toLowerCase().trim();
        if (!q) return res.json({ accounts: [], games: [] });
        const accounts = Object.values(users())
            .filter(u => u.pseudo.toLowerCase().includes(q))
            .slice(0, 8)
            .map(u => ({ pseudo: u.pseudo, online: !!(u.lastSeen && Date.now() - u.lastSeen < 90 * 1000), banned: !!u.banned }));
        const history = mf.get('admin:gameHistory') || [];
        const games = history
            .filter(g => (g.players || []).some(p => String(p).toLowerCase().includes(q)))
            .slice(0, 8);
        res.json({ accounts, games });
    });

    G('/accounts', (req, res) => {
        const q = String(req.query.q || '').toLowerCase().trim();
        const sort = req.query.sort || 'recent';
        const seenOf = (u) => u.lastSeen || u.lastLogin || 0;
        let list = Object.values(users()).filter(u => !q || u.pseudo.toLowerCase().includes(q));
        if (sort === 'banned') list = list.filter(u => u.banned);
        const sorters = {
            recent: (a, b) => (b.created || 0) - (a.created || 0),
            active: (a, b) => seenOf(b) - seenOf(a),
            name: (a, b) => a.pseudo.localeCompare(b.pseudo),
            banned: (a, b) => (b.bannedAt || 0) - (a.bannedAt || 0),
        };
        list.sort(sorters[sort] || sorters.recent);
        res.json({
            total: list.length,
            accounts: list.slice(0, 100).map(u => ({
                pseudo: u.pseudo,
                created: u.created || 0,
                lastSeen: seenOf(u),
                online: !!(u.lastSeen && Date.now() - u.lastSeen < 90 * 1000),
                banned: !!u.banned,
                admin: isAdmin(u.pseudo),
                hasRecovery: !!u.recoveryHash,
                avatar: u.avatar || '', avatarPhoto: u.avatarPhoto || '',
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
            const f = ctx.perudo().statsFor(pseudo);
            if (f && (f.parties || f.partiesSolo)) perudo = { victoires: f.victoires || 0, parties: f.parties || 0, solo: f.partiesSolo || 0, meilleureSerie: f.meilleureSerie || 0 };
        } catch (e) {}
        // Le Motus range une progression par jour : on compte directement dans le
        // cache plutôt que de dupliquer motusStreak() ici.
        function dailyStats(prefix) {
            const s = { solved: 0, gaveUp: 0, started: 0, bestTries: null };
            for (const [k, v] of Object.entries(cache)) {
                if (!k.startsWith(`${prefix}:${pseudo}:`) || !v) continue;
                s.started++;
                const tries = (v.guesses || []).length;
                if (v.solved) { s.solved++; if (!s.bestTries || tries < s.bestTries) s.bestTries = tries; }
                else if (v.gaveUp || v.lost) s.gaveUp++;
            }
            return s;
        }
        const motus = dailyStats('motus:prog');
        // ⚠️ Yams et Petit Bac indexent par pseudo NORMALISÉ : lire la clé brute
        // renvoyait toujours vide, donc la fiche n'a jamais montré le Yams.
        const norme = normPseudo(pseudo);
        let yams = null;
        try { const s = cache[`yams:stats:${norme}`]; if (s && s.gamesPlayed) yams = s; } catch (e) {}
        let pbac = null;
        try { const s = cache[`pbac:stats:${norme}`]; if (s && s.gamesPlayed) pbac = s; } catch (e) {}
        let undercover = null, drapeaux = null;
        try { const f = ctx.undercover().statsFor(pseudo); if (f && f.parties) undercover = f; } catch (e) {}
        try { const f = ctx.drapeaux().statsFor(pseudo); if (f && (f.parties || f.solo)) drapeaux = f; } catch (e) {}
        // Les deux jeux du jour récents : une clé par journée, comme le Motus.
        const compteJour = (prefixe, estReussi) => {
            const r = { joues: 0, reussis: 0 };
            for (const [k, v] of Object.entries(cache)) {
                if (!k.startsWith(`${prefixe}:${pseudo}:`) || !v || !v.fini) continue;
                r.joues++; if (estReussi(v)) r.reussis++;
            }
            return r.joues ? r : null;
        };
        const chiffres = compteJour('chiffres:prog', v => v.ecart === 0);
        const geo = compteJour('geo:prog', v => !!v.trouve);
        const sudoku = compteJour('sudoku:prog', v => !!v.trouve);
        const motlong = compteJour('motlong:prog', v => !!v.trouve);
        let motusparty = null;
        try { const s = cache[`motusparty:stats:${pseudo}`]; if (s && s.matchesPlayed) motusparty = s; } catch (e) {}
        res.json({
            pseudo: u.pseudo,
            created: u.created || 0,
            lastSeen: u.lastSeen || u.lastLogin || 0,
            online: !!(u.lastSeen && Date.now() - u.lastSeen < 90 * 1000),
            banned: !!u.banned,
            bannedAt: u.bannedAt || 0,
            admin: isAdmin(u.pseudo),
            hasRecovery: !!u.recoveryHash,
            avatar: u.avatar || '', avatarPhoto: u.avatarPhoto || '',
            motsfleches: { ...mfStats, daysPlayed: days.length },
            perudo, motus, yams, motusparty,
            pbac, undercover, drapeaux, chiffres, geo, sudoku, motlong,
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
        const temp = motDePasseProvisoire();                   // mot de passe temporaire lisible
        u.passwordHash = hashPassword(temp);
        u.sessionEpoch = Date.now();                            // déconnecte les sessions existantes
        // Deux garde-fous, sans lesquels la manœuvre perd son sens : ce mot de
        // passe a été lu par quelqu'un d'autre, donc il ne vaut qu'un jour, et
        // le joueur doit en choisir un vrai dès son arrivée.
        u.doitChanger = true;
        u.tempExpire = Date.now() + 24 * 3600 * 1000;
        saveUsers(true);
        // La demande d'aide correspondante est marquée traitée : sinon elle
        // resterait en attente dans l'admin alors que c'est fait.
        const liste = (mf.get('comptes:demandes') || []).map(d =>
            (d.pseudo === pseudo && !d.traitee ? { ...d, traitee: true, traiteeLe: Date.now(), par: currentUser(req) } : d));
        mf.set('comptes:demandes', liste);
        log(currentUser(req), 'mot de passe provisoire', pseudo);
        res.json({ ok: true, tempPassword: temp, expireDans: '24 heures' });
    });

    A('/account/recovery', (req, res) => {
        const pseudo = String(req.body.pseudo || '');
        const u = users()[pseudo];
        if (!u) return res.status(404).json({ error: 'Compte introuvable.' });
        const code = makeRecoveryCode();
        u.recoveryHash = hashPassword(code);
        saveUsers(true);
        // ⚠️ La demande d'aide correspondante est marquée traitée, exactement
        // comme pour le mot de passe provisoire : c'est l'autre façon de
        // dépanner quelqu'un, et elle laissait la demande en attente pour
        // toujours — on la croyait oubliée alors qu'elle était réglée.
        const liste = (mf.get('comptes:demandes') || []).map(d =>
            (d.pseudo === pseudo && !d.traitee ? { ...d, traitee: true, traiteeLe: Date.now(), par: currentUser(req) } : d));
        mf.set('comptes:demandes', liste);
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
        if (banned) { u.sessionEpoch = Date.now(); u.bannedAt = Date.now(); }
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

    // Efface TOUTE trace d'un joueur dans le cache commun.
    //
    // L'ancienne version ne nettoyait que les Mots Fléchés : le compte
    // disparaissait, mais Motus, Le compte est bon, la
    // Géographie et les cinq fiches multijoueur restaient en base, tout comme
    // son nom dans les classements des autres jeux et dans le face-à-face de
    // ses adversaires. Une demande de suppression n'était donc pas honorée.
    //
    // Trois pièges : Yams et Petit Bac indexent par pseudo NORMALISÉ ; les
    // classements sont des tableaux d'objets à champ `u` ; et le pseudo
    // apparaît aussi comme CLÉ dans le `vsOpponent` des autres joueurs.
    function supprimerDonneesJoueur(pseudo) {
        const cache = mf.cache();
        const norme = normPseudo(pseudo);
        let cles = 0, lignes = 0;
        for (const [k, v] of Object.entries(cache)) {
            const seg = k.split(':');
            // Les clés qui lui appartiennent en propre, quel que soit le jeu.
            if (seg[2] === pseudo || seg[2] === norme) { mf.del(k); cles++; continue; }
            if (!v) continue;
            // Les classements : on retire ses lignes sans toucher aux autres.
            if (Array.isArray(v) && v.some(e => e && e.u === pseudo)) {
                mf.set(k, v.filter(e => !e || e.u !== pseudo));
                lignes++;
                continue;
            }
            // Les index de statistiques, et l'historique des parties.
            if (Array.isArray(v) && v.includes(pseudo)) { mf.set(k, v.filter(x => x !== pseudo)); continue; }
            if (k === 'admin:gameHistory' && Array.isArray(v)) {
                const reste = v.map(g => ({ ...g, players: (g.players || []).filter(p => (p && p.pseudo ? p.pseudo : p) !== pseudo) }))
                    .filter(g => (g.players || []).length);
                if (reste.length !== v.length) { mf.set(k, reste); }
                continue;
            }
            // Le face-à-face de ses adversaires le nomme en clé d'objet.
            if (typeof v === 'object' && v.vsOpponent && v.vsOpponent[pseudo]) {
                const copie = { ...v, vsOpponent: { ...v.vsOpponent } };
                delete copie.vsOpponent[pseudo];
                mf.set(k, copie);
            }
            // Les titres attribués à la main.
            if (k === 'titres:manuels' && typeof v === 'object' && v[pseudo]) {
                const copie = { ...v }; delete copie[pseudo]; mf.set(k, copie);
            }
        }
        return { cles, lignes };
    }

    A('/account/delete', (req, res) => {
        const pseudo = String(req.body.pseudo || '');
        if (isAdmin(pseudo)) return res.status(400).json({ error: 'Impossible de supprimer un administrateur.' });
        const U = users();
        if (!U[pseudo]) return res.status(404).json({ error: 'Compte introuvable.' });
        delete U[pseudo];
        const efface = supprimerDonneesJoueur(pseudo);
        saveUsers(true);
        log(currentUser(req), 'SUPPRESSION', `${pseudo} (${efface.cles} clés, ${efface.lignes} lignes de classement)`);
        res.json({ ok: true, ...efface });
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
    //  ⚠️ Réécrit après la réécriture du jeu : l'onglet appelait encore
    //  l'ancien module (`users()`, `achievements()`, `kick()`, les
    //  cosmétiques), qui n'existe plus — il affichait « Perudo
    //  indisponible » et la fiche de compte « jamais joué ». Les
    //  statistiques vivent maintenant dans le cache commun
    //  (`perudo:stats:<pseudo>`), lues et écrites par le module lui-même.
    // =================================================================
    const P = () => ctx.perudo();

    G('/perudo/overview', (req, res) => {
        const api = P();
        if (!api) return res.json({ available: false });
        res.json({
            available: true,
            games: api.games(),
            online: api.online().map(o => o.pseudo),
            classement: api.classement().slice(0, 15),
        });
    });

    G('/perudo/player', (req, res) => {
        const api = P(); if (!api) return res.status(400).json({ error: 'Perudo indisponible.' });
        const pseudo = String(req.query.pseudo || '');
        const f = api.statsFor(pseudo);
        if (!f || !(f.parties || f.partiesSolo)) return res.status(404).json({ error: 'Aucune partie de Perudo pour ce joueur.' });
        res.json({ pseudo, ...f });
    });

    // Corriger une fiche à la main : les seuls compteurs qui se voient au
    // classement. Le reste (dudos, calzas, bête noire…) se recalcule en jouant.
    A('/perudo/stats', (req, res) => {
        const api = P(); if (!api) return res.status(400).json({ error: 'Perudo indisponible.' });
        const pseudo = String(req.body.pseudo || '');
        const f = api.lireFiche(pseudo);
        const num = (v, max) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
        if (req.body.victoires !== undefined) f.victoires = num(req.body.victoires, 1e6);
        if (req.body.parties !== undefined) f.parties = num(req.body.parties, 1e6);
        if (req.body.meilleureSerie !== undefined) f.meilleureSerie = num(req.body.meilleureSerie, 1e4);
        if (f.victoires > f.parties) f.parties = f.victoires;
        api.ecrireFiche(pseudo, f);
        log(currentUser(req), 'stats Perudo corrigées', pseudo);
        res.json({ ok: true });
    });

    A('/perudo/reset', (req, res) => {
        const api = P(); if (!api) return res.status(400).json({ error: 'Perudo indisponible.' });
        const pseudo = String(req.body.pseudo || '');
        api.ecrireFiche(pseudo, api.ficheVierge());
        log(currentUser(req), 'RESET Perudo', pseudo);
        res.json({ ok: true });
    });

    A('/perudo/endgame', (req, res) => {
        const api = P(); if (!api) return res.status(400).json({ error: 'Perudo indisponible.' });
        const ok = api.endGame(String(req.body.id || ''));
        if (ok) log(currentUser(req), 'partie close', String(req.body.id || ''));
        res.json({ ok });
    });

    // =================================================================
    //  PETIT BAC
    // =================================================================
    const PB = () => ctx.pbac();

    // =================================================================
    //  INFILTRÉ
    // =================================================================
    const UC = () => ctx.undercover();

    // =================================================================
    //  YAMS
    // =================================================================
    const YM = () => ctx.yams();

    // =================================================================
    //  MOTUS PARTY
    // =================================================================
    const MP = () => ctx.motusparty();
    const DR = () => ctx.drapeaux && ctx.drapeaux();

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
                    // Même variante que le tirage réel, sinon l'aperçu annoncerait
                    // une autre grille que celle qui sortira.
                    const p = MFG.generate(lv, date, recent, Number(mf.get(`mf:variante:${date}:${lv}`)) || 0);
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

        // ⚠️ Effacer la clé ne suffisait PAS : le tirage ne dépend que de la
        // date et du niveau, donc la même grille revenait à l'identique. Il
        // faut décaler la graine — c'est exactement le piège déjà corrigé sur
        // le Motus et les deux jeux du jour récents.
        const ancienne = mf.get(`mf:grid:${date}:${lv}`);
        const avant = ancienne ? (ancienne.wordList || []).join(',') : null;
        let variante = Number(mf.get(`mf:variante:${date}:${lv}`)) || 0;

        // ⚠️ On ne touche PAS à `mf:hist:${date}` : il porte les mots des TROIS
        // niveaux du jour, et l'effacer faisait perdre la trace des deux autres
        // — leurs mots redevenaient tirables dès le lendemain.
        for (let essai = 0; essai < 12; essai++) {
            variante++;
            mf.set(`mf:variante:${date}:${lv}`, variante);
            mf.del(`mf:grid:${date}:${lv}`);
            const recent = [];
            for (let i = 1; i <= 15; i++) {
                const h = mf.get(`mf:hist:${mf.shift(date, -i)}`);
                if (Array.isArray(h)) recent.push(...h);
            }
            let neuve = null;
            try { neuve = MFG.generate(lv, date, recent, variante); } catch (e) { continue; }
            if (!avant || (neuve.wordList || []).join(',') !== avant) {
                mf.set(`mf:grid:${date}:${lv}`, neuve);
                break;
            }
        }

        // Les progressions et le classement de cette grille n'ont plus de sens.
        for (const k of Object.keys(mf.cache())) if (k.startsWith('mf:prog:') && k.endsWith(`:${date}:${lv}`)) mf.del(k);
        mf.del(`mf:board:${date}:${lv}`);
        log(currentUser(req), 'grille régénérée', date + ' ' + lv + ' (variante ' + variante + ')');
        res.json({ ok: true, variante });
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
        const ancien = motus.word(date);
        // Le tirage étant déterministe sur la date, supprimer la clé ne suffit
        // pas : il faut faire avancer la variante, sinon on retombe sur le même
        // mot. On insiste tant que le mot n'a pas réellement changé, au cas où
        // une variante retomberait par hasard sur le même tirage.
        let nouveau = ancien;
        for (let i = 0; i < 25 && nouveau === ancien; i++) {
            motus.varianteSuivante(date);
            mf.del(motus.kWord(date));
            nouveau = motus.word(date);
        }
        if (nouveau === ancien) return res.status(409).json({ error: 'Impossible de tirer un mot différent.' });
        // Le mot a changé : les parties de la journée portaient sur l'ancien,
        // elles n'ont plus de sens. Le classement du jour non plus.
        for (const k of Object.keys(mf.cache())) if (k.startsWith('motus:prog:') && k.endsWith(`:${date}`)) mf.del(k);
        mf.del(motus.kBoard(date));
        log(currentUser(req), 'mot Motus régénéré', `${date} : ${ancien} → ${nouveau}`);
        res.json({ ok: true, ancien, word: nouveau });
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
    // On pouvait exporter, jamais réimporter : en cas de problème, la
    // sauvegarde ne servait à rien. La restauration est volontairement
    // exigeante — elle demande de retaper RESTAURER — et elle refuse un
    // fichier qui n'a pas la forme attendue plutôt que d'écraser à moitié.
    A('/restore', (req, res) => {
        const b = req.body || {};
        if (b.confirmation !== 'RESTAURER') return res.status(400).json({ error: 'Confirmation manquante.' });
        const données = b.sauvegarde;
        if (!données || typeof données !== 'object') return res.status(400).json({ error: 'Fichier illisible.' });
        if (!données.users || typeof données.users !== 'object') return res.status(400).json({ error: 'Ce fichier ne contient pas de comptes : ce n’est pas une sauvegarde du salon.' });
        const cacheSauve = données.motsfleches && typeof données.motsfleches === 'object' ? données.motsfleches : null;
        if (!cacheSauve) return res.status(400).json({ error: 'Ce fichier ne contient pas les données de jeu.' });

        const U = users();
        const avantComptes = Object.keys(U).length, avantCles = Object.keys(mf.cache()).length;
        // Les comptes : on remplace en place, l'objet étant partagé avec server.js.
        for (const k of Object.keys(U)) delete U[k];
        for (const [k, v] of Object.entries(données.users)) U[k] = v;
        saveUsers(true);
        // Les données de jeu : on écrit clé par clé pour que la persistance
        // suive son cours normal, et on retire celles qui n'existent plus.
        const anciennes = new Set(Object.keys(mf.cache()));
        for (const [k, v] of Object.entries(cacheSauve)) { mf.set(k, v); anciennes.delete(k); }
        for (const k of anciennes) mf.del(k);
        if (données.dictionnaire && dict.setOverrides) { try { dict.setOverrides(données.dictionnaire); } catch (e) {} }
        log(currentUser(req), 'RESTAURATION', `${Object.keys(données.users).length} comptes, ${Object.keys(cacheSauve).length} clés`);
        res.json({
            ok: true,
            comptes: { avant: avantComptes, apres: Object.keys(U).length },
            cles: { avant: avantCles, apres: Object.keys(mf.cache()).length },
            sauvegardeDu: données.exportedAt || null,
        });
    });

    // ---------- Mode maintenance ----------
    // Pour bloquer l'entrée pendant une restauration ou un correctif, sans
    // couper le service ni laisser quelqu'un jouer sur des données en cours
    // de réécriture. Les administrateurs, eux, passent toujours.
    A('/maintenance', (req, res) => {
        const actif = !!(req.body || {}).actif;
        const message = String((req.body || {}).message || '').slice(0, 200);
        mf.set('admin:maintenance', actif ? { actif: true, message, depuis: Date.now(), par: currentUser(req) } : null);
        log(currentUser(req), actif ? 'maintenance activée' : 'maintenance levée', message);
        res.json({ ok: true, actif });
    });

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

    // Le journal, filtrable : trois cents lignes sans recherche ne servent
    // à rien quand on cherche ce qui est arrivé à un compte précis.
    G('/log', (req, res) => {
        const q = String(req.query.q || '').toLowerCase().trim();
        let liste = (mf.get(LOG_KEY) || []).slice().reverse();
        if (q) liste = liste.filter(l =>
            [l.who, l.action, l.target, l.detail].some(x => String(x || '').toLowerCase().includes(q)));
        res.json({ total: (mf.get(LOG_KEY) || []).length, lignes: liste.slice(0, 200) });
    });

    // Annonce lisible par tout le monde (affichée dans le salon)
    app.get('/api/announce', (req, res) => res.json({ announce: mf.get('mf:announce') || '' }));

    // =================================================================
    //  PARTIES — une seule vue pour tous les jeux
    //  Quatre onglets faisaient exactement la même chose : lister les
    //  parties en cours, les joueurs connectés, et fermer une table.
    //  C'est le même problème que les quatre halls fusionnés côté joueur.
    // =================================================================
    const MODULES_JEUX = [
        { id: 'perudo', nom: 'Perudo', emoji: '🏴‍☠️', api: () => ctx.perudo && ctx.perudo() },
        { id: 'pbac', nom: 'Petit Bac', emoji: '✏️', api: () => PB() },
        { id: 'undercover', nom: 'Infiltré', emoji: '🕵️', api: () => UC() },
        { id: 'yams', nom: 'Yams', emoji: '🎲', api: () => YM() },
        { id: 'motusparty', nom: 'Motus Party', emoji: '🏁', api: () => MP() },
        { id: 'drapeaux', nom: 'Quiz des drapeaux', emoji: '🚩', api: () => DR() },
    ];

    G('/parties', (req, res) => {
        const enLigne = [];
        // Les tables viennent de `toutesLesTables()` (server.js), la même
        // fonction que le hall `/jouer/` : les deux ne peuvent plus se
        // contredire. Les présents sont signalés, pour repérer d'un coup d'œil
        // une partie que tout le monde a quittée.
        const tables = (ctx.tables ? ctx.tables() : []).map(t => ({
            jeu: t.jeu, nom: t.nom, emoji: t.emoji, id: t.id, hote: t.hote || '—',
            joueurs: t.joueurs, presents: t.presents, statut: t.statut,
        }));
        for (const m of MODULES_JEUX) {
            let api = null;
            try { api = m.api(); } catch (e) { api = null; }
            if (!api) continue;
            try {
                for (const p of (api.online() || [])) {
                    const pseudo = typeof p === 'string' ? p : p.pseudo;
                    if (pseudo) enLigne.push({ jeu: m.nom, pseudo });
                }
            } catch (e) {}
        }
        tables.sort((a, b) => (a.statut === b.statut ? 0 : a.statut === 'attente' ? -1 : 1));
        res.json({ tables, enLigne });
    });

    A('/parties/close', (req, res) => {
        const jeu = String(req.body.jeu || ''), id = String(req.body.id || '');
        const m = MODULES_JEUX.find(x => x.id === jeu);
        if (!m) return res.status(400).json({ error: 'Jeu inconnu.' });
        let api = null;
        try { api = m.api(); } catch (e) {}
        if (!api || !api.endGame) return res.status(400).json({ error: m.nom + ' indisponible.' });
        const ok = api.endGame(id);
        if (ok) log(currentUser(req), 'partie fermée', m.nom + ' #' + id);
        res.json({ ok });
    });

    // =================================================================
    //  SANTÉ DU SALON
    //  Rien de tout ceci n'était visible : c'est pourquoi une production
    //  figée pendant quatre semaines a pu passer inaperçue.
    // =================================================================
    G('/sante', (req, res) => {
        const cache = mf.cache();
        const cles = Object.keys(cache);
        const familles = {};
        for (const k of cles) {
            const f = k.split(':').slice(0, 2).join(':');
            familles[f] = (familles[f] || 0) + 1;
        }
        // Le poids compte autant que le nombre : douze clés de vocabulaire
        // pèsent plus que trois cents progressions, et on ne le voyait pas.
        const poids = {};
        for (const k of cles) {
            const f = k.split(':').slice(0, 2).join(':');
            let taille = 0;
            try { taille = JSON.stringify(cache[k]).length; } catch (e) {}
            poids[f] = (poids[f] || 0) + taille;
        }
        const top = Object.entries(familles).sort((a, b) => (poids[b[0]] || 0) - (poids[a[0]] || 0)).slice(0, 16)
            .map(([f, n]) => ({ famille: f, cles: n, octets: poids[f] || 0 }));
        // Les clés que plus aucun code ne lit. `mf_data` et `mf_progress`
        // traînent depuis des mois sans que rien ne les signale.
        const CONNUES = ['mf', 'motus', 'rec', 'voyages', 'pbac', 'yams', 'motusparty',
            'undercover', 'drapeaux', 'chiffres', 'geo', 'sudoku', 'motlong', 'admin', 'titres', 'perudo',
            'capitales', 'carte', 'chrono', 'defi', 'salon', 'comptes', 'classement',
            'fil',       // fil:* = la conversation du salon et les marques de lecture
            'menage'];   // menage:* = les nettoyages faits une seule fois
        const orphelines = cles.filter(k => !CONNUES.includes(k.split(':')[0]))
            .map(k => { let t = 0; try { t = JSON.stringify(cache[k]).length; } catch (e) {} return { cle: k, octets: t }; })
            .sort((a, b) => b.octets - a.octets).slice(0, 20);
        const comptes = Object.keys(users()).length;
        let poidsComptes = 0;
        try { poidsComptes = JSON.stringify(users()).length; } catch (e) {}
        res.json({
            // `redis` est passé comme fonction depuis server.js : le tester
            // directement renverrait toujours vrai.
            redis: !!(typeof redis === 'function' ? redis() : redis),
            demarreDepuis: Math.round(process.uptime()),
            node: process.version,
            memoire: Math.round(process.memoryUsage().rss / 1048576),
            comptes, poidsComptes,
            clesTotal: cles.length,
            poidsTotal: Object.values(poids).reduce((a, b) => a + b, 0),
            familles: top,
            orphelines,
            // Sans Redis, TOUT est perdu au redéploiement : le disque de Render
            // est éphémère. L'état était affiché, mais rien ne criait.
            alerte: !(typeof redis === 'function' ? redis() : redis)
                ? 'Redis n’est pas connecté : toutes les données seront perdues au prochain redéploiement.'
                : null,
            maintenance: !!mf.get('admin:maintenance'),
            journal: (mf.get(LOG_KEY) || []).slice(-12).reverse(),
        });
    });


    // ---------- Les demandes d'aide à la connexion ----------
    // Quelqu'un qui a perdu son mot de passe ET son code n'avait aucun moyen
    // de le signaler. Ces demandes arrivent ici ; l'administrateur reconnaît
    // la personne hors de l'application et lui pose un mot de passe
    // provisoire, ce qui marque la demande traitée.
    G('/demandes', (req, res) => {
        const liste = (mf.get('comptes:demandes') || []).slice().reverse();
        res.json({
            enAttente: liste.filter(d => !d.traitee),
            traitees: liste.filter(d => d.traitee).slice(0, 20),
        });
    });
    A('/demandes/ignorer', (req, res) => {
        const pseudo = String(req.body.pseudo || '');
        const liste = (mf.get('comptes:demandes') || []).map(d =>
            (d.pseudo === pseudo && !d.traitee ? { ...d, traitee: true, ignoree: true, traiteeLe: Date.now() } : d));
        mf.set('comptes:demandes', liste);
        log(currentUser(req), 'demande d’aide ignorée', pseudo);
        res.json({ ok: true });
    });

    // =================================================================
    //  MODÉRATION DES STATISTIQUES MULTIJOUEUR
    //  La vue Parties listait les tables et permettait de les fermer, rien
    //  de plus : si une fiche était fausse — triche, partie qui a mal
    //  tourné, test resté en base — aucune action n'existait.
    // =================================================================
    // Où vit la fiche de chaque jeu, et sous quelle forme de pseudo.
    const FICHES = {
        yams: { cle: (p) => `yams:stats:${normPseudo(p)}`, index: 'yams:statsIndex', nom: 'Yams' },
        pbac: { cle: (p) => `pbac:stats:${normPseudo(p)}`, index: null, nom: 'Petit Bac' },
        motusparty: { cle: (p) => `motusparty:stats:${p}`, index: null, nom: 'Motus Party' },
        undercover: { cle: (p) => `undercover:stats:${p}`, index: 'undercover:statsIndex', nom: 'Infiltré' },
        drapeaux: { cle: (p) => `drapeaux:stats:${p}`, index: 'drapeaux:statsIndex', nom: 'Quiz des drapeaux' },
    };

    G('/stats/fiche', (req, res) => {
        const pseudo = String(req.query.pseudo || '');
        const jeu = FICHES[req.query.jeu] ? req.query.jeu : null;
        if (!pseudo || !jeu) return res.status(400).json({ error: 'Jeu ou joueur manquant.' });
        res.json({ jeu, nom: FICHES[jeu].nom, pseudo, cle: FICHES[jeu].cle(pseudo), fiche: mf.get(FICHES[jeu].cle(pseudo)) || null });
    });

    // Remettre à zéro la fiche d'un joueur sur un jeu. On la SUPPRIME plutôt
    // que d'écrire des zéros : le jeu la recrée vierge au besoin, et une
    // fiche à zéro traînerait dans tous les classements.
    A('/stats/reset', (req, res) => {
        const pseudo = String(req.body.pseudo || '');
        const jeu = FICHES[req.body.jeu] ? req.body.jeu : null;
        if (!pseudo || !jeu) return res.status(400).json({ error: 'Jeu ou joueur manquant.' });
        const f = FICHES[jeu];
        mf.del(f.cle(pseudo));
        if (f.index) {
            const idx = mf.get(f.index) || [];
            mf.set(f.index, idx.filter(x => x !== pseudo));
        }
        // Et son nom dans le face-à-face des autres, sinon il y survit.
        for (const [k, v] of Object.entries(mf.cache())) {
            if (v && typeof v === 'object' && v.vsOpponent && v.vsOpponent[pseudo]) {
                const copie = { ...v, vsOpponent: { ...v.vsOpponent } };
                delete copie.vsOpponent[pseudo];
                mf.set(k, copie);
            }
        }
        log(currentUser(req), 'statistiques remises à zéro', pseudo, f.nom);
        res.json({ ok: true });
    });

    // =================================================================
    //  FAIRE REJOUER UN JEU DU JOUR
    //  Pour qui a été bloqué par un bogue ou une coupure. Une seule route
    //  pour les six jeux du jour : il y en avait deux (Motus, Mots Fléchés)
    //  qui effaçaient la partie mais laissaient la ligne au classement du
    //  jour — le joueur restait classé sur une partie qui n'existait plus.
    //  Les clés suivent toutes la même forme : `<jeu>:prog:<pseudo>:<date>`
    //  (suivi d'un niveau ou d'un mode pour les Mots Fléchés et la
    //  Géographie), et `<jeu>:board:<date>` (idem).
    // =================================================================
    const JEUX_DU_JOUR = { motus: 'Motus', mf: 'Mots Fléchés', chiffres: 'Le compte est bon', geo: 'Géographie', motlong: 'Le mot le plus long', sudoku: 'Sudoku', capitales: 'Les capitales', carte: 'La carte', chrono: 'Le chrono' };
    A('/jour/reset', (req, res) => {
        const pseudo = String(req.body.pseudo || ''), jeu = String(req.body.jeu || '');
        const date = /^\d{4}-\d{2}-\d{2}$/.test(req.body.date || '') ? req.body.date : mf.today();
        if (!pseudo || !JEUX_DU_JOUR[jeu]) return res.status(400).json({ error: 'Jeu ou joueur manquant.' });
        const prog = `${jeu}:prog:${pseudo}:${date}`, board = `${jeu}:board:${date}`;
        let parties = 0;
        for (const [k, v] of Object.entries(mf.cache())) {
            if (k === prog || k.startsWith(prog + ':')) { mf.del(k); parties++; continue; }
            if ((k === board || k.startsWith(board + ':')) && Array.isArray(v) && v.some(e => e && e.u === pseudo)) {
                mf.set(k, v.filter(e => !e || e.u !== pseudo));
            }
        }
        log(currentUser(req), 'jeu du jour à rejouer', pseudo, `${JEUX_DU_JOUR[jeu]} ${date}`);
        res.json({ ok: true, parties });
    });

    // =================================================================
    //  LE CLASSEMENT — ses périodes, son palmarès, et sa remise à zéro
    //
    //  ⚠️ « Repartir de zéro » n'EFFACE RIEN : il archive le podium qui
    //  s'achève et déplace la date de départ du calcul. Remettre cette
    //  date à vide fait réapparaître tout l'historique — c'est ce qui
    //  rend la manœuvre sans danger, et c'est la raison de ce choix.
    // =================================================================
    G('/classement', (req, res) => {
        const cl = ctx.classement;
        const periode = cl.periodes[String(req.query.periode || '')] ? String(req.query.periode) : 'toujours';
        res.json({
            periode,
            departs: cl.departs(),
            // La journée du salon commence à minuit à PARIS : le navigateur ne
            // doit pas la recalculer de son côté, il la reçoit.
            aujourdhui: mf.today(),
            palmares: cl.palmares(),
            lignes: cl.lire(periode),
            periodes: Object.values(cl.periodes).map(p => ({ id: p.id, nom: p.nom })),
        });
    });
    // Remettre à zéro UNE période : quotidien, hebdomadaire, mensuel ou tout.
    // Les quatre sont indépendantes — effacer les points du jour ne touche pas
    // au mois, sinon le bouton serait un piège.
    A('/classement/zero', (req, res) => {
        const periode = String(req.body.periode || '');
        if (!ctx.classement.periodes[periode]) return res.status(400).json({ error: 'Période inconnue.' });
        // `depuis` : la journée en cours compte, ou la saison ne part que demain.
        const depuis = req.body.depuis === 'aujourdhui' ? 'aujourdhui' : 'demain';
        const r = ctx.classement.zero(periode, depuis);
        log(currentUser(req), 'points remis à zéro', ctx.classement.periodes[periode].nom,
            `${depuis === 'aujourdhui' ? 'aujourd’hui compris' : 'à partir de demain'} · ` +
            r.podium.map(p => `${p.pseudo} ${p.points}`).join(', '));
        res.json({ ok: true, ...r });
    });
    // Rattrapage : compter la journée en cours alors qu'elle avait été exclue.
    A('/classement/aujourdhui', (req, res) => {
        const periode = String(req.body.periode || '');
        if (!ctx.classement.periodes[periode]) return res.status(400).json({ error: 'Période inconnue.' });
        const r = ctx.classement.compterAujourdhui(periode);
        if (!r) return res.status(400).json({ error: 'Cette période compte déjà la journée en cours.' });
        log(currentUser(req), 'journée en cours comptée', ctx.classement.periodes[periode].nom);
        res.json({ ok: true, ...r });
    });
    A('/classement/rouvrir', (req, res) => {
        const periode = String(req.body.periode || '');
        const departs = ctx.classement.rouvrir(periode);
        if (!departs) return res.status(400).json({ error: 'Période inconnue.' });
        log(currentUser(req), 'points recomptés', ctx.classement.periodes[periode].nom);
        res.json({ ok: true, departs });
    });

    // L'historique des parties : une ligne fausse y restait pour toujours,
    // alors qu'il alimente le classement de saison.
    A('/historique/supprimer', (req, res) => {
        const at = Number(req.body.endedAt);
        if (!at) return res.status(400).json({ error: 'Partie non identifiée.' });
        const liste = mf.get('admin:gameHistory') || [];
        const reste = liste.filter(g => g.endedAt !== at);
        if (reste.length === liste.length) return res.status(404).json({ error: 'Partie introuvable.' });
        mf.set('admin:gameHistory', reste);
        log(currentUser(req), 'partie retirée de l’historique', new Date(at).toLocaleString('fr-FR'));
        res.json({ ok: true, restantes: reste.length });
    });

    // =================================================================
    //  FUSION DE COMPTES
    //  Le pseudo sert d'identifiant partout : quelqu'un qui se réinscrit
    //  sous un autre nom repart de zéro sans recours. La fusion déplace
    //  toutes les données de la source vers la cible, puis supprime la
    //  source. Elle réutilise le module de renommage, qui connaît déjà les
    //  pièges (pseudos normalisés, tableaux à champ `u`, index, duels).
    // =================================================================
    A('/account/merge', (req, res) => {
        const source = String(req.body.source || ''), cible = String(req.body.cible || '');
        if (!source || !cible || source === cible) return res.status(400).json({ error: 'Deux comptes différents sont nécessaires.' });
        const U = users();
        if (!U[source]) return res.status(404).json({ error: `Compte « ${source} » introuvable.` });
        if (!U[cible]) return res.status(404).json({ error: `Compte « ${cible} » introuvable.` });
        if (isAdmin(source)) return res.status(400).json({ error: 'Impossible de fusionner un administrateur.' });
        if (req.body.confirmation !== source) return res.status(400).json({ error: 'Confirmation manquante.' });

        // ⚠️ La cible a déjà ses propres données. On ne peut pas simplement
        // renommer les clés : deux `yams:stats` ne se superposent pas. On
        // déplace donc ce qui n'existe pas encore chez la cible, et on
        // signale le reste plutôt que d'écraser en silence.
        const cache = mf.cache();
        const norme = { source: normPseudo(source), cible: normPseudo(cible) };
        let deplacees = 0, conservees = [];
        for (const [k, v] of Object.entries({ ...cache })) {
            const seg = k.split(':');
            if (seg[2] !== source && seg[2] !== norme.source) {
                // Les classements. Renommer la ligne suffit — sauf si la cible
                // y figure déjà : on la ferait alors apparaître DEUX FOIS le
                // même jour. Dans ce cas la ligne de la source est retirée,
                // l'historique de la cible faisant foi.
                if (Array.isArray(v) && v.some(e => e && e.u === source)) {
                    const cibleDejaLa = v.some(e => e && e.u === cible);
                    mf.set(k, cibleDejaLa
                        ? v.filter(e => !e || e.u !== source)
                        : v.map(e => (e && e.u === source ? { ...e, u: cible } : e)));
                }
                continue;
            }
            seg[2] = (seg[2] === norme.source) ? norme.cible : cible;
            const nouvelle = seg.join(':');
            if (cache[nouvelle] !== undefined) { conservees.push(k); continue; }
            mf.set(nouvelle, v);
            mf.del(k);
            deplacees++;
        }
        // La source disparaît, avec ce qui n'a pas pu être déplacé.
        delete U[source];
        const efface = supprimerDonneesJoueur(source);
        saveUsers(true);
        log(currentUser(req), 'FUSION', `${source} → ${cible}`, `${deplacees} clés déplacées, ${conservees.length} conservées à la cible`);
        res.json({ ok: true, deplacees, conflits: conservees.length, effacees: efface.cles });
    });

    // =================================================================
    //  FRÉQUENTATION
    //  On ne pouvait pas savoir si le salon est plus ou moins joué qu'il y
    //  a un mois. Tout se recalcule depuis les clés datées existantes.
    // =================================================================
    G('/frequentation', (req, res) => {
        const jours = Math.min(90, Math.max(7, Number(req.query.jours) || 30));
        const cache = mf.cache();
        const parJour = new Map();
        for (let i = jours - 1; i >= 0; i--) parJour.set(mf.shift(mf.today(), -i), { date: mf.shift(mf.today(), -i), parties: 0, joueurs: new Set() });
        for (const [k, v] of Object.entries(cache)) {
            const seg = k.split(':');
            if (seg[1] !== 'prog' || !v) continue;
            // La date est en 4ᵉ segment partout : mf/motus/geo/chiffres.
            const jour = parJour.get(seg[3]);
            if (!jour) continue;
            jour.parties++;
            jour.joueurs.add(seg[2]);
        }
        const serie = [...parJour.values()].map(j => ({ date: j.date, parties: j.parties, joueurs: j.joueurs.size }));
        const moitie = Math.floor(serie.length / 2);
        const somme = (t) => t.reduce((s, j) => s + j.parties, 0);
        const recent = somme(serie.slice(moitie)), ancien = somme(serie.slice(0, moitie));
        // Les comptes qui n'ont rien fait depuis longtemps : à relancer, ou
        // simplement bon à savoir.
        const U = users();
        const maintenant = Date.now();
        const endormis = Object.values(U)
            .filter(u => u.lastSeen && (maintenant - u.lastSeen) > 30 * 864e5)
            .sort((a, b) => b.lastSeen - a.lastSeen)
            .slice(0, 15)
            .map(u => ({ pseudo: u.pseudo, jours: Math.round((maintenant - u.lastSeen) / 864e5) }));
        res.json({
            serie,
            tendance: ancien ? Math.round(((recent - ancien) / ancien) * 100) : null,
            actifs7j: new Set([...parJour.values()].slice(-7).flatMap(j => [...j.joueurs])).size,
            comptes: Object.keys(U).length,
            endormis,
        });
    });

    // =================================================================
    //  LE COMPTE EST BON et LA GÉOGRAPHIE
    //  Les deux jeux du jour récents n'avaient aucun panneau : impossible
    //  de voir la donne, de retirer un score suspect ou de retirer un
    //  contenu raté, alors que les trois anciens ont tout ça.
    // =================================================================
    const dateValide = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : mf.today());

    G('/chiffres/day', (req, res) => {
        const date = dateValide(req.query.date);
        const donne = CH().donne(date);
        const m = CH().moteur;
        const classement = m.classement(date);
        let joues = 0, justes = 0, totalEcart = 0;
        for (const [k, v] of Object.entries(mf.cache())) {
            if (!k.startsWith('chiffres:prog:') || !k.endsWith(`:${date}`) || !v || !v.fini) continue;
            joues++; totalEcart += (v.ecart || 0);
            if (v.ecart === 0) justes++;
        }
        res.json({
            date, today: mf.today(),
            nombres: donne.nombres, cible: donne.cible,
            solution: (donne.solution || []).map(e => `${e.a} ${e.op} ${e.b} = ${e.r}`),
            joues, justes, ecartMoyen: joues ? Math.round(totalEcart / joues) : null,
            classement: classement.map(e => ({ u: e.u, ecart: e.ecart, ms: e.ms, susp: !!e.susp })),
        });
    });

    A('/chiffres/regen', (req, res) => {
        const date = dateValide(req.body.date);
        const avant = CH().donne(date);
        // Même piège que le Motus : la donne est tirée d'une graine calculée
        // sur la date. Sans faire avancer la variante, on retomberait sur la
        // même donne et le bouton effacerait les parties pour rien.
        let nouvelle = avant;
        for (let i = 0; i < 25 && nouvelle.cible === avant.cible && nouvelle.nombres.join() === avant.nombres.join(); i++) {
            CH().moteur.varianteSuivante(date);
            mf.del(CH().kDonne(date));
            nouvelle = CH().donne(date);
        }
        for (const k of Object.keys(mf.cache())) if (k.startsWith('chiffres:prog:') && k.endsWith(`:${date}`)) mf.del(k);
        mf.del(`chiffres:board:${date}`);
        log(currentUser(req), 'donne du Compte est bon régénérée', `${date} : ${avant.cible} → ${nouvelle.cible}`);
        res.json({ ok: true, nombres: nouvelle.nombres, cible: nouvelle.cible });
    });

    A('/chiffres/board/remove', (req, res) => {
        const date = dateValide(req.body.date), pseudo = String(req.body.pseudo || '');
        const cle = `chiffres:board:${date}`;
        mf.set(cle, (mf.get(cle) || []).filter(e => e.u !== pseudo));
        log(currentUser(req), 'score du Compte est bon supprimé', pseudo, date);
        res.json({ ok: true });
    });
    A('/chiffres/board/flag', (req, res) => {
        const date = dateValide(req.body.date), pseudo = String(req.body.pseudo || '');
        const cle = `chiffres:board:${date}`;
        mf.set(cle, (mf.get(cle) || []).map(e => (e.u === pseudo ? { ...e, susp: !e.susp } : e)));
        log(currentUser(req), 'score du Compte est bon marqué', pseudo);
        res.json({ ok: true });
    });

    G('/geo/day', (req, res) => {
        const date = dateValide(req.query.date);
        const m = GE().moteur;
        const modes = GE().modes.map(mode => {
            const cible = GE().duJour(mode, date);
            if (mode === 'voyage') {
                let joues = 0, arrives = 0, parfaits = 0;
                for (const [k, v] of Object.entries(mf.cache())) {
                    if (!k.startsWith('geo:prog:') || !k.endsWith(`:${date}:voyage`) || !v || !v.fini) continue;
                    joues++; if (v.trouve) arrives++; if (v.parfait) parfaits++;
                }
                const nom = (c) => (GE().pays(c) || {}).nom || c;
                return {
                    mode, pays: cible.nom, code: cible.code,
                    drapeau: GE().drapeau(cible.de.code) + ' ➜ ' + GE().drapeau(cible.a.code),
                    region: 'au plus court : ' + cible.chemin.slice(1, -1).map(nom).join(', '),
                    joues, trouves: arrives, parfaits, optimal: cible.optimal,
                    classement: m.classement(`${date}:voyage`).map(e => ({ u: e.u, essais: e.essais, trouve: e.trouve, optimal: e.optimal, erreurs: e.erreurs, ms: e.ms, susp: !!e.susp })),
                };
            }
            let joues = 0, trouves = 0, totalEssais = 0;
            for (const [k, v] of Object.entries(mf.cache())) {
                if (!k.startsWith('geo:prog:') || !k.endsWith(`:${date}:${mode}`) || !v || !v.fini) continue;
                joues++;
                if (v.trouve) { trouves++; totalEssais += (v.essais || []).length; }
            }
            return {
                mode, pays: cible.nom, code: cible.code, drapeau: GE().drapeau(cible.code), region: cible.region,
                joues, trouves, essaisMoyens: trouves ? +(totalEssais / trouves).toFixed(1) : null,
                classement: m.classement(`${date}:${mode}`).map(e => ({ u: e.u, essais: e.essais, trouve: e.trouve, ms: e.ms, susp: !!e.susp })),
            };
        });
        res.json({ date, today: mf.today(), maxEssais: GE().maxEssais, modes });
    });

    A('/geo/regen', (req, res) => {
        const date = dateValide(req.body.date);
        const mode = GE().modes.includes(req.body.mode) ? req.body.mode : 'silhouette';
        const avant = GE().duJour(mode, date);
        let nouveau = avant;
        for (let i = 0; i < 25 && nouveau.code === avant.code; i++) {
            GE().moteur.varianteSuivante(date);
            mf.del(GE().kPays(mode, date));
            nouveau = GE().duJour(mode, date);
        }
        if (nouveau.code === avant.code) return res.status(409).json({ error: 'Impossible de tirer un autre pays.' });
        for (const k of Object.keys(mf.cache())) if (k.startsWith('geo:prog:') && k.endsWith(`:${date}:${mode}`)) mf.del(k);
        mf.del(`geo:board:${date}:${mode}`);
        log(currentUser(req), 'pays de la Géographie régénéré', `${date} ${mode} : ${avant.nom} → ${nouveau.nom}`);
        // Le voyage a deux pays, donc deux drapeaux ; « PT>PL » n'en est pas un.
        const drapeau = mode === 'voyage'
            ? GE().drapeau(nouveau.de.code) + ' ➜ ' + GE().drapeau(nouveau.a.code)
            : GE().drapeau(nouveau.code);
        res.json({ ok: true, pays: nouveau.nom, drapeau });
    });

    A('/geo/board/remove', (req, res) => {
        const date = dateValide(req.body.date), pseudo = String(req.body.pseudo || '');
        const mode = GE().modes.includes(req.body.mode) ? req.body.mode : 'silhouette';
        const cle = `geo:board:${date}:${mode}`;
        mf.set(cle, (mf.get(cle) || []).filter(e => e.u !== pseudo));
        log(currentUser(req), 'score de Géographie supprimé', pseudo, `${date} ${mode}`);
        res.json({ ok: true });
    });
    A('/geo/board/flag', (req, res) => {
        const date = dateValide(req.body.date), pseudo = String(req.body.pseudo || '');
        const mode = GE().modes.includes(req.body.mode) ? req.body.mode : 'silhouette';
        const cle = `geo:board:${date}:${mode}`;
        mf.set(cle, (mf.get(cle) || []).map(e => (e.u === pseudo ? { ...e, susp: !e.susp } : e)));
        log(currentUser(req), 'score de Géographie marqué', pseudo);
        res.json({ ok: true });
    });

    // =================================================================
    //  LE SUDOKU et LE MOT LE PLUS LONG
    //  Le même panneau que les autres jeux du jour : le contenu, le
    //  classement, la modération, et un nouveau tirage — qui avance la
    //  variante, sans quoi le même contenu reviendrait (le piège déjà
    //  corrigé quatre fois ailleurs).
    // =================================================================
    const SD = () => ctx.sudoku, ML = () => ctx.motlong;

    G('/sudoku/day', (req, res) => {
        const date = dateValide(req.query.date);
        const g = SD().duJour(date);
        let joues = 0, resolues = 0, totalMs = 0, avecMs = 0;
        for (const [k, v] of Object.entries(mf.cache())) {
            if (!k.startsWith('sudoku:prog:') || !k.endsWith(`:${date}`) || !v || !v.fini) continue;
            joues++;
            if (v.trouve) { resolues++; if (v.ms != null) { totalMs += v.ms; avecMs++; } }
        }
        res.json({
            date, today: mf.today(), donnee: g.donnee, indices: g.indices,
            joues, resolues, tempsMoyen: avecMs ? Math.round(totalMs / avecMs) : null,
            // `classement()` écarte les lignes marquées suspectes : l'admin
            // doit, lui, les voir pour pouvoir les rétablir.
            classement: (mf.get(`sudoku:board:${date}`) || []).slice()
                .sort((a, b) => (b.score - a.score) || ((a.ms || 0) - (b.ms || 0)))
                .map(e => ({ u: e.u, trouve: e.trouve !== false, ms: e.ms, susp: !!e.susp })),
        });
    });
    A('/sudoku/regen', (req, res) => {
        const date = dateValide(req.body.date);
        const avant = SD().duJour(date);
        let nouvelle = avant;
        for (let i = 0; i < 25 && nouvelle.donnee === avant.donnee; i++) {
            SD().moteur.varianteSuivante(date);
            mf.del(SD().kGrille(date));
            nouvelle = SD().duJour(date);
        }
        for (const k of Object.keys(mf.cache())) if (k.startsWith('sudoku:prog:') && k.endsWith(`:${date}`)) mf.del(k);
        mf.del(`sudoku:board:${date}`);
        log(currentUser(req), 'grille de Sudoku régénérée', date);
        res.json({ ok: true, indices: nouvelle.indices });
    });

    G('/motlong/day', (req, res) => {
        const date = dateValide(req.query.date);
        const t = ML().duJour(date);
        let joues = 0, trouves = 0, totalLongueur = 0;
        for (const [k, v] of Object.entries(mf.cache())) {
            if (!k.startsWith('motlong:prog:') || !k.endsWith(`:${date}`) || !v || !v.fini) continue;
            joues++; totalLongueur += v.meilleur || 0; if (v.trouve) trouves++;
        }
        res.json({
            date, today: mf.today(), lettres: t.lettres, max: t.max, meilleurs: t.meilleurs, source: t.source,
            joues, trouves, longueurMoyenne: joues ? +(totalLongueur / joues).toFixed(1) : null,
            classement: (mf.get(`motlong:board:${date}`) || []).slice()
                .sort((a, b) => (b.score - a.score) || ((a.ms || 0) - (b.ms || 0)))
                .map(e => ({ u: e.u, score: e.score, mot: e.mot, ms: e.ms, susp: !!e.susp })),
        });
    });
    A('/motlong/regen', (req, res) => {
        const date = dateValide(req.body.date);
        const avant = ML().duJour(date);
        let nouveau = avant;
        for (let i = 0; i < 25 && nouveau.source === avant.source; i++) {
            ML().moteur.varianteSuivante(date);
            mf.del(ML().kTirage(date));
            nouveau = ML().duJour(date);
        }
        for (const k of Object.keys(mf.cache())) if (k.startsWith('motlong:prog:') && k.endsWith(`:${date}`)) mf.del(k);
        mf.del(`motlong:board:${date}`);
        log(currentUser(req), 'tirage du Mot le plus long régénéré', `${date} : ${avant.source} → ${nouveau.source}`);
        res.json({ ok: true, lettres: nouveau.lettres, source: nouveau.source });
    });

    // ---------- Les capitales ----------
    const CP = () => ctx.capitales;
    G('/capitales/day', (req, res) => {
        const date = dateValide(req.query.date);
        const v = CP().duJour(date);
        let joues = 0, trouves = 0, totalEssais = 0;
        for (const [k, val] of Object.entries(mf.cache())) {
            if (!k.startsWith('capitales:prog:') || !k.endsWith(`:${date}`) || !val || !val.fini) continue;
            joues++;
            if (val.trouve) { trouves++; totalEssais += (val.essais || []).length; }
        }
        res.json({
            date, today: mf.today(),
            ville: v.ville, pays: v.pays, pop: v.pop, devise: v.devise, langues: v.langues,
            joues, trouves, essaisMoyens: trouves ? +(totalEssais / trouves).toFixed(1) : null,
            classement: (mf.get(`capitales:board:${date}`) || []).slice()
                .sort((a, b) => (b.score - a.score) || ((a.ms || 0) - (b.ms || 0)))
                .map(e => ({ u: e.u, trouve: !!e.trouve, essais: e.essais, ms: e.ms, susp: !!e.susp })),
        });
    });
    // ⚠️ Même piège que partout : le tirage ne dépend que de la date, donc
    // effacer la clé redonne la même ville. C'est le compteur de variante qui
    // décale la graine, et on insiste jusqu'à obtenir une capitale différente.
    A('/capitales/regen', (req, res) => {
        const date = dateValide(req.body.date);
        const avant = CP().duJour(date);
        let nouvelle = avant;
        for (let i = 0; i < 25 && nouvelle.code === avant.code; i++) {
            CP().moteur.varianteSuivante(date);
            mf.del(CP().kVille(date));
            nouvelle = CP().duJour(date);
        }
        for (const k of Object.keys(mf.cache())) if (k.startsWith('capitales:prog:') && k.endsWith(`:${date}`)) mf.del(k);
        mf.del(`capitales:board:${date}`);
        log(currentUser(req), 'capitale du jour retirée au sort', `${date} : ${avant.ville} → ${nouvelle.ville}`);
        res.json({ ok: true, ville: nouvelle.ville, pays: nouvelle.pays });
    });

    // ---------- La carte ----------
    const CA = () => ctx.carte;
    G('/carte/day', (req, res) => {
        const date = dateValide(req.query.date);
        const p = CA().duJour(date);
        let joues = 0, trouves = 0, totalEssais = 0;
        for (const [k, val] of Object.entries(mf.cache())) {
            if (!k.startsWith('carte:prog:') || !k.endsWith(`:${date}`) || !val || !val.fini) continue;
            joues++;
            if (val.trouve) { trouves++; totalEssais += (val.essais || []).length; }
        }
        res.json({
            date, today: mf.today(), pays: p.nom, region: p.region, code: p.code,
            joues, trouves, essaisMoyens: trouves ? +(totalEssais / trouves).toFixed(1) : null,
            classement: (mf.get(`carte:board:${date}`) || []).slice()
                .sort((a, b) => (b.score - a.score) || ((a.ms || 0) - (b.ms || 0)))
                .map(e => ({ u: e.u, trouve: !!e.trouve, essais: e.essais, ms: e.ms, susp: !!e.susp })),
        });
    });
    A('/carte/regen', (req, res) => {
        const date = dateValide(req.body.date);
        const avant = CA().duJour(date);
        let nouveau = avant;
        for (let i = 0; i < 25 && nouveau.code === avant.code; i++) {
            CA().moteur.varianteSuivante(date);
            mf.del(CA().kPays(date));
            nouveau = CA().duJour(date);
        }
        for (const k of Object.keys(mf.cache())) if (k.startsWith('carte:prog:') && k.endsWith(`:${date}`)) mf.del(k);
        mf.del(`carte:board:${date}`);
        log(currentUser(req), 'pays de la carte retiré au sort', `${date} : ${avant.nom} → ${nouveau.nom}`);
        res.json({ ok: true, pays: nouveau.nom });
    });

    // ---------- Le chrono ----------
    const CHR = () => ctx.chrono;
    G('/chrono/day', (req, res) => {
        const date = dateValide(req.query.date);
        const durees = CHR().duJour(date);
        let joues = 0, totalEcart = 0;
        for (const [k, val] of Object.entries(mf.cache())) {
            if (!k.startsWith('chrono:prog:') || !k.endsWith(`:${date}`) || !val || !val.fini) continue;
            joues++; totalEcart += val.ecartTotal || 0;
        }
        res.json({
            date, today: mf.today(), durees,
            joues, ecartMoyen: joues ? Math.round(totalEcart / joues) : null,
            classement: (mf.get(`chrono:board:${date}`) || []).slice()
                .sort((a, b) => (b.score - a.score) || ((a.ms || 0) - (b.ms || 0)))
                .map(e => ({ u: e.u, ecart: e.ecart, ms: e.ms, susp: !!e.susp })),
        });
    });
    A('/chrono/regen', (req, res) => {
        const date = dateValide(req.body.date);
        const avant = (CHR().duJour(date) || []).join(',');
        let nouvelles = avant;
        for (let i = 0; i < 25 && nouvelles === avant; i++) {
            CHR().moteur.varianteSuivante(date);
            mf.del(CHR().kDurees(date));
            nouvelles = (CHR().duJour(date) || []).join(',');
        }
        for (const k of Object.keys(mf.cache())) if (k.startsWith('chrono:prog:') && k.endsWith(`:${date}`)) mf.del(k);
        mf.del(`chrono:board:${date}`);
        log(currentUser(req), 'durées du chrono retirées au sort', `${date} : ${avant} → ${nouvelles}`);
        res.json({ ok: true, durees: nouvelles.split(',').map(Number) });
    });

    // La modération des classements : retirer une ligne, ou la marquer
    // suspecte (elle disparaît du classement public sans être effacée).
    for (const app of ['sudoku', 'motlong', 'capitales', 'carte', 'chrono']) {
        A(`/${app}/board/remove`, (req, res) => {
            const date = dateValide(req.body.date), pseudo = String(req.body.pseudo || '');
            const cle = `${app}:board:${date}`;
            mf.set(cle, (mf.get(cle) || []).filter(e => e.u !== pseudo));
            log(currentUser(req), `score ${app} supprimé`, pseudo, date);
            res.json({ ok: true });
        });
        A(`/${app}/board/flag`, (req, res) => {
            const date = dateValide(req.body.date), pseudo = String(req.body.pseudo || '');
            const cle = `${app}:board:${date}`;
            mf.set(cle, (mf.get(cle) || []).map(e => (e.u === pseudo ? { ...e, susp: !e.susp } : e)));
            log(currentUser(req), `score ${app} marqué`, pseudo);
            res.json({ ok: true });
        });
    }

    // =================================================================
    //  TITRES
    //  La plupart se calculent tout seuls et changent en jouant : ici on
    //  les OBSERVE (qui a quoi, qui détient les uniques), et on peut en
    //  poser ou en retirer un à la main quand un titre se mérite hors
    //  des chiffres — une soirée, un fou rire, un service rendu.
    // =================================================================
    const TITRES_MANUELS_KEY = 'titres:manuels';

    G('/titres', (req, res) => {
        const parJoueur = ctx.titres();                    // Map pseudo → [titre]
        const manuels = mf.get(TITRES_MANUELS_KEY) || {};
        const catalogue = ctx.catalogueTitres().map(t => {
            const porteurs = [];
            for (const [pseudo, liste] of parJoueur) {
                const trouve = liste.find(x => x.id === t.id);
                if (trouve) porteurs.push({ pseudo, valeur: trouve.valeur ?? null, manuel: !!trouve.manuel });
            }
            porteurs.sort((a, b) => a.pseudo.localeCompare(b.pseudo, 'fr'));
            return { id: t.id, nom: t.nom, emoji: t.emoji, rarete: t.rarete, desc: t.desc, porteurs };
        });
        res.json({
            catalogue,
            comptes: Object.keys(users()).sort((a, b) => a.localeCompare(b, 'fr')),
            manuels,
        });
    });

    A('/titres/attribuer', (req, res) => {
        const pseudo = String(req.body.pseudo || '').trim();
        const id = String(req.body.id || '').trim();
        if (!users()[pseudo]) return res.status(404).json({ error: 'Ce compte n’existe pas.' });
        if (!ctx.catalogueTitres().some(t => t.id === id)) return res.status(400).json({ error: 'Titre inconnu.' });
        const manuels = { ...(mf.get(TITRES_MANUELS_KEY) || {}) };
        const liste = new Set(manuels[pseudo] || []);
        liste.add(id);
        manuels[pseudo] = [...liste];
        mf.set(TITRES_MANUELS_KEY, manuels);
        ctx.titres(true);                                  // recalcule tout de suite
        log(currentUser(req), 'titre attribué', pseudo, id);
        res.json({ ok: true });
    });

    A('/titres/retirer', (req, res) => {
        const pseudo = String(req.body.pseudo || '').trim();
        const id = String(req.body.id || '').trim();
        const manuels = { ...(mf.get(TITRES_MANUELS_KEY) || {}) };
        const liste = (manuels[pseudo] || []).filter(x => x !== id);
        if (liste.length) manuels[pseudo] = liste; else delete manuels[pseudo];
        mf.set(TITRES_MANUELS_KEY, manuels);
        ctx.titres(true);
        log(currentUser(req), 'titre retiré', pseudo, id);
        // Un titre calculé ne se retire pas à la main : il se reperd en jouant.
        res.json({ ok: true, note: 'Seuls les titres posés à la main peuvent être retirés.' });
    });

    // =================================================================
    //  LE FIL DU SALON
    //  À trente-deux personnes qui se connaissent, retirer une ligne est
    //  toute la modération nécessaire — c'est déjà la règle de l'historique
    //  des parties. Pas de blocage, pas de signalement : il n'y a personne
    //  à qui les adresser.
    // =================================================================
    G('/fil', (req, res) => {
        res.json({ messages: (ctx.fil().messages() || []).slice(-100) });
    });
    A('/fil/supprimer', (req, res) => {
        const ts = Number(req.body.ts);
        if (!ts) return res.status(400).json({ error: 'Message inconnu.' });
        const fait = ctx.fil().supprimer(ts);
        if (fait) log(currentUser(req), 'message retiré du fil', String(ts), '');
        res.json({ ok: fait });
    });

};