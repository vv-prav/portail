// =====================================================================
//  LE COMPTE EST BON (/chiffres) — les routes
//
//  Sorti de `server.js`, qui dépassait les 3 500 lignes. Le module reçoit
//  ce dont il a besoin (le moteur des jeux du jour, le cache, les gardes
//  d'authentification) et rend ce que le reste du salon lui demande —
//  le pouls, la carte du profil, les résultats du jour, l'administration.
// =====================================================================
module.exports = function monterChiffres(app, deps) {
    const { express, requireAuth, requireAuthApi, currentUser, mfGet, mfSet,
            mfTodayId, mfShiftDay, mfSecondsToMidnight, dateDemandee, creerMoteur, racine } = deps;

    const chiffresJeu = require('./jeu');
    const mChiffres = creerMoteur('chiffres');

    // ---------- La donne du jour ----------
    // Calculée une fois puis mise en cache, comme le mot du Motus : la journée ne
    // doit jamais changer de contenu sous les pieds de ceux qui jouent.
    const kChiffresDonne = (date) => `chiffres:donne:${date}`;
    function chiffresDonne(date) {
        const cache = mfGet(kChiffresDonne(date));
        if (cache) return cache;
        const donne = chiffresJeu.tirage(mChiffres.tirageDuJour(date));
        mfSet(kChiffresDonne(date), donne);
        return donne;
    }

    app.use('/chiffres', requireAuth, express.static(racine + '/public/chiffres'));

    app.get('/api/chiffres/today', requireAuthApi, (req, res) => {
        const user = currentUser(req), today = mfTodayId();
        let date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : today;
        if (date > today) date = today;
        const donne = chiffresDonne(date);
        const prog = mChiffres.progression(user, date);
        const fini = !!(prog && prog.fini);
        res.json({
            date, today, archive: date !== today, nextIn: mfSecondsToMidnight(),
            nombres: donne.nombres, cible: donne.cible,
            progression: prog,
            // La solution n'est révélée qu'une fois la manche jouée : la donner
            // avant reviendrait à publier la réponse dans la page.
            solution: fini ? donne.solution : undefined,
            serie: mChiffres.serie(user),
        });
    });

    app.post('/api/chiffres/start', requireAuthApi, (req, res) => {
        const user = currentUser(req), today = mfTodayId();
        const date = /^\d{4}-\d{2}-\d{2}$/.test((req.body || {}).date || '') ? req.body.date : today;
        if (date !== today) return res.json({ ok: true });
        res.json({ ok: true, debutA: mChiffres.demarrer(user, date).debutA });
    });

    // Le serveur ne fait jamais confiance au total annoncé : il rejoue les étapes
    // une à une avec les règles du jeu (ni négatif, ni fraction, chaque nombre une
    // seule fois) et recalcule lui-même le résultat atteint.
    app.post('/api/chiffres/valider', requireAuthApi, (req, res) => {
        const user = currentUser(req), today = mfTodayId();
        const b = req.body || {};
        const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : today;
        if (date > today) return res.status(400).json({ error: 'Journée à venir.' });
        const donne = chiffresDonne(date);
        const prog = mChiffres.progression(user, date) || mChiffres.demarrer(user, date);
        if (prog.fini) return res.status(400).json({ error: 'Manche déjà jouée.' });

        const etapes = Array.isArray(b.etapes) ? b.etapes.slice(0, 5) : [];
        const rejeu = chiffresJeu.rejouer(donne.nombres, etapes);
        if (rejeu.erreur) return res.status(400).json({ error: rejeu.erreur });
        const atteint = rejeu.dernier;
        if (atteint === null) return res.status(400).json({ error: 'Aucun résultat.' });

        const ecart = Math.abs(atteint - donne.cible);
        const ms = date === today ? mChiffres.tempsEcoule(prog) : null;
        prog.etapes = etapes;
        prog.atteint = atteint;
        prog.ecart = ecart;
        prog.score = chiffresJeu.score(ecart);
        prog.fini = true;
        prog.ms = ms;
        mChiffres.enregistrer(user, date, prog);
        if (date === today) {
            mChiffres.noterJourJoue(user, date);
            mChiffres.inscrireAuClassement(user, date, prog.score, ms, { ecart, atteint });
        }
        res.json({
            ok: true, atteint, ecart, score: prog.score, ms,
            solution: donne.solution,
            place: date === today ? mChiffres.placeDe(user, date) : null,
            classement: mChiffres.classement(date).slice(0, 15),
            serie: mChiffres.serie(user),
        });
    });

    app.get('/api/chiffres/classement', requireAuthApi, (req, res) => {
        const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : mfTodayId();
        res.json({ classement: mChiffres.classement(date).slice(0, 30) });
    });

    return { moteur: mChiffres, donne: chiffresDonne, kDonne: kChiffresDonne, jeu: chiffresJeu };
};
