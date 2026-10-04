// =====================================================================
//  LE MOT LE PLUS LONG (/motlong) — les routes
//
//  Sorti de `server.js`, qui dépassait les 3 500 lignes. Le module reçoit
//  ce dont il a besoin (le moteur des jeux du jour, le cache, les gardes
//  d'authentification) et rend ce que le reste du salon lui demande —
//  le pouls, la carte du profil, les résultats du jour, l'administration.
// =====================================================================
module.exports = function monterMotlong(app, deps) {
    const { express, requireAuth, requireAuthApi, currentUser, mfGet, mfSet,
            mfTodayId, mfShiftDay, mfSecondsToMidnight, dateDemandee, creerMoteur, racine } = deps;

    const motlongJeu = require('./jeu');
    const mMotlong = creerMoteur('motlong');
    const kMotlongTirage = (date) => `motlong:tirage:${date}`;
    function motlongDuJour(date) {
        const cache = mfGet(kMotlongTirage(date));
        if (cache && cache.lettres) return cache;
        // Pas le même mot deux fois en deux mois.
        const recents = [];
        for (let i = 1; i <= 60; i++) {
            const t = mfGet(kMotlongTirage(mfShiftDay(date, -i)));
            if (t && t.source) recents.push(t.source);
        }
        const t = motlongJeu.tirage(mMotlong.tirageDuJour(date), recents);
        mfSet(kMotlongTirage(date), t);
        return t;
    }
    // Ce qu'on peut dire d'une manche au navigateur : le tirage, ses mots, et
    // les réponses seulement quand elle est terminée.
    function motlongVue(t, prog) {
        const fini = !!(prog && prog.fini);
        return {
            lettres: t.lettres, max: t.max,
            meilleurs: fini ? t.meilleurs : undefined,
        };
    }

    app.use('/motlong', requireAuth, express.static(racine + '/public/motlong'));

    app.get('/api/motlong/today', requireAuthApi, (req, res) => {
        const user = currentUser(req), today = mfTodayId();
        const date = dateDemandee(req.query.date, today);
        const t = motlongDuJour(date);
        const prog = mMotlong.progression(user, date);
        res.json({
            date, today, archive: date !== today, nextIn: mfSecondsToMidnight(),
            ...motlongVue(t, prog),
            progression: prog,
            serie: mMotlong.serie(user),
        });
    });

    app.post('/api/motlong/start', requireAuthApi, (req, res) => {
        const user = currentUser(req), today = mfTodayId();
        const date = dateDemandee((req.body || {}).date, today);
        const prog = mMotlong.demarrer(user, date);
        res.json({ ok: true, debutA: date === today ? prog.debutA : null });
    });

    // Terminer la manche : quand le plus
    // long mot possible est trouvé, ou quand le joueur s'arrête de lui-même.
    function motlongTerminer(user, date, today, prog) {
        prog.fini = true;
        prog.meilleur = Math.max(0, ...(prog.mots || []).map(m => m.length));
        prog.score = prog.meilleur;
        prog.trouve = prog.meilleur > 0 && prog.meilleur >= motlongDuJour(date).max;
        prog.ms = date === today ? mMotlong.tempsEcoule(prog) : null;
        if (date === today) {
            mMotlong.noterJourJoue(user, date);
            const mot = (prog.mots || []).find(m => m.length === prog.meilleur) || '';
            mMotlong.inscrireAuClassement(user, date, prog.score, prog.ms, { trouve: prog.trouve, mot });
        }
    }
    function motlongReponse(user, date, today, prog, extra) {
        const t = motlongDuJour(date);
        return Object.assign({
            ok: true,
            mots: prog.mots || [], propositions: prog.propositions || 0,
            fini: !!prog.fini, trouve: !!prog.trouve, meilleur: prog.meilleur || 0, score: prog.score, ms: prog.ms,
            meilleurs: prog.fini ? t.meilleurs : undefined,
            place: prog.fini && date === today ? mMotlong.placeDe(user, date) : null,
            classement: prog.fini ? mMotlong.classement(date).slice(0, 15) : undefined,
            serie: mMotlong.serie(user),
        }, extra || {});
    }

    app.post('/api/motlong/proposer', requireAuthApi, (req, res) => {
        const user = currentUser(req), today = mfTodayId();
        const b = req.body || {};
        const date = dateDemandee(b.date, today);
        const t = motlongDuJour(date);
        const prog = mMotlong.progression(user, date) || mMotlong.demarrer(user, date);
        if (prog.fini) return res.status(400).json({ error: 'Manche déjà terminée.' });
        prog.mots = prog.mots || []; prog.refuses = prog.refuses || []; prog.propositions = prog.propositions || 0;

        const v = motlongJeu.verifier(b.mot, t.lettres);
        // Un mot déjà trouvé ne coûte rien : ce n'est pas une nouvelle tentative.
        if (v.ok && prog.mots.includes(v.mot)) return res.status(400).json({ error: 'Déjà trouvé.' });
        if (!v.cout) return res.status(400).json({ error: v.raison });
        prog.propositions++;
        if (v.ok) prog.mots.push(v.mot); else prog.refuses.push(v.mot);
        const auMax = v.ok && v.mot.length >= t.max;
        if (auMax) motlongTerminer(user, date, today, prog);
        mMotlong.enregistrer(user, date, prog);
        res.json(motlongReponse(user, date, today, prog, { accepte: v.ok, mot: v.mot, raison: v.ok ? null : v.raison }));
    });

    app.post('/api/motlong/terminer', requireAuthApi, (req, res) => {
        const user = currentUser(req), today = mfTodayId();
        const date = dateDemandee((req.body || {}).date, today);
        const prog = mMotlong.progression(user, date) || mMotlong.demarrer(user, date);
        if (!prog.fini) {
            prog.mots = prog.mots || [];
            motlongTerminer(user, date, today, prog);
            mMotlong.enregistrer(user, date, prog);
        }
        res.json(motlongReponse(user, date, today, prog));
    });

    app.get('/api/motlong/classement', requireAuthApi, (req, res) => {
        const date = dateDemandee(req.query.date, mfTodayId());
        res.json({ classement: mMotlong.classement(date).slice(0, 30) });
    });

    return { moteur: mMotlong, duJour: motlongDuJour, kTirage: kMotlongTirage, jeu: motlongJeu };
};
