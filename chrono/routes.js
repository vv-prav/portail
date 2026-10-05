// =====================================================================
//  LE CHRONO DU JOUR (/chrono) — les routes
//
//  Même forme que les autres jeux du jour : le moteur commun porte la
//  graine, la progression, le classement, la série et les archives.
//
//  ⚠️ Le temps est mesuré par le NAVIGATEUR, et il n'y a pas moyen de
//  faire autrement : le trajet réseau d'un aller-retour pèse plus que
//  l'écart qu'on mesure. Le serveur ne peut donc pas prouver un résultat.
//  Trois garde-fous, et ils suffisent dans un salon où tout le monde se
//  connaît :
//    · les durées du jour sont les mêmes pour tous, donc comparables ;
//    · un écart total sous trente millisecondes est marqué suspect,
//      inscrit mais invisible au classement public ;
//    · une manche déjà jouée ne se rejoue pas.
// =====================================================================
module.exports = function monterChrono(app, deps) {
    const { express, requireAuth, requireAuthApi, currentUser, mfGet, mfSet,
            mfTodayId, mfSecondsToMidnight, dateDemandee, creerMoteur, racine } = deps;

    const chronoJeu = require('./jeu');
    const mChrono = creerMoteur('chrono');
    const kDurees = (date) => `chrono:durees:${date}`;

    function dureesDuJour(date) {
        const cache = mfGet(kDurees(date));
        if (Array.isArray(cache) && cache.length === chronoJeu.MANCHES) return cache;
        const d = chronoJeu.duréesDuJour(mChrono.tirageDuJour(date));
        mfSet(kDurees(date), d);
        return d;
    }

    app.use('/chrono', requireAuth, express.static(racine + '/public/chrono'));

    app.get('/api/chrono/today', requireAuthApi, (req, res) => {
        const user = currentUser(req), today = mfTodayId();
        const date = dateDemandee(req.query.date, today);
        const durees = dureesDuJour(date);
        const prog = mChrono.progression(user, date) || {};
        const faites = (prog.manches || []).length;
        res.json({
            date, today, archive: date !== today, nextIn: mfSecondsToMidnight(),
            total: chronoJeu.MANCHES,
            // ⚠️ On n'envoie QUE la durée de la manche à venir. Donner les
            // trois d'un coup laisserait préparer la suivante pendant qu'on
            // joue la première — et surtout, les relire après coup pour
            // s'entraîner avant d'appuyer.
            vise: prog.fini ? null : durees[faites],
            // Les durées déjà jouées reviennent avec les écarts, pour l'écran.
            manches: (prog.manches || []).map((m, i) => ({ vise: durees[i], ...m })),
            // ⚠️ La mention voyage AVEC la progression : en rouvrant la page,
            // l'écran de fin affichait « Journée terminée » au lieu du mot
            // qu'on avait gagné.
            progression: prog.fini ? { ...prog, mention: chronoJeu.mention(prog.ecartTotal) } : undefined,
            serie: mChrono.serie(user),
        });
    });

    app.post('/api/chrono/start', requireAuthApi, (req, res) => {
        const user = currentUser(req), today = mfTodayId();
        const date = dateDemandee((req.body || {}).date, today);
        const prog = mChrono.demarrer(user, date);
        res.json({ ok: true, debutA: date === today ? prog.debutA : null });
    });

    app.post('/api/chrono/manche', requireAuthApi, (req, res) => {
        const user = currentUser(req), today = mfTodayId();
        const b = req.body || {};
        const date = dateDemandee(b.date, today);
        const durees = dureesDuJour(date);
        const prog = mChrono.progression(user, date) || mChrono.demarrer(user, date);
        prog.manches = prog.manches || [];
        if (prog.fini) return res.status(400).json({ error: 'Journée déjà jouée.' });
        if (prog.manches.length >= chronoJeu.MANCHES) return res.status(400).json({ error: 'Plus de manche.' });

        // Une durée hors de toute vraisemblance est refusée sans être comptée :
        // c'est une panne du navigateur, pas une tentative.
        const fait = Number(b.ms);
        if (!isFinite(fait) || fait < 0 || fait > 120000) return res.status(400).json({ error: 'Temps invalide.' });

        const vise = durees[prog.manches.length];
        const e = chronoJeu.ecart(vise, fait);
        prog.manches.push({ fait: Math.round(fait), ecart: e });
        prog.fini = prog.manches.length >= chronoJeu.MANCHES;

        if (prog.fini) {
            prog.ecartTotal = prog.manches.reduce((s, m) => s + m.ecart, 0);
            prog.score = chronoJeu.score(prog.ecartTotal);
            prog.ms = mChrono.tempsEcoule(prog);
            if (date === today) {
                mChrono.noterJourJoue(user, date);
                // ⚠️ Au classement, `ms` porte l'ÉCART et non le temps passé :
                // c'est lui qui départage à points égaux, et le temps qu'on a
                // mis à jouer n'a aucun sens ici — on attend un chronomètre.
                mChrono.inscrireAuClassement(user, date, prog.score, prog.ecartTotal, {
                    ecart: prog.ecartTotal,
                    susp: chronoJeu.estSuspect(prog.ecartTotal),
                });
            }
        }
        mChrono.enregistrer(user, date, prog);

        res.json({
            ok: true,
            manche: { vise, fait: Math.round(fait), ecart: e },
            restantes: chronoJeu.MANCHES - prog.manches.length,
            // La durée de la manche suivante, une fois celle-ci rendue.
            prochain: prog.fini ? null : durees[prog.manches.length],
            fini: !!prog.fini,
            ecartTotal: prog.ecartTotal, score: prog.score,
            mention: prog.fini ? chronoJeu.mention(prog.ecartTotal) : null,
            place: prog.fini && date === today ? mChrono.placeDe(user, date) : null,
            classement: prog.fini ? mChrono.classement(date).slice(0, 15) : undefined,
            serie: mChrono.serie(user),
        });
    });

    app.get('/api/chrono/classement', requireAuthApi, (req, res) => {
        const date = dateDemandee(req.query.date, mfTodayId());
        res.json({ classement: mChrono.classement(date).slice(0, 30) });
    });

    return { moteur: mChrono, duJour: dureesDuJour, kDurees, jeu: chronoJeu };
};
