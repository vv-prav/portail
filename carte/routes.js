// =====================================================================
//  LA CARTE DU JOUR (/carte) — les routes
//
//  Même forme que les autres jeux du jour récents : le moteur commun
//  (`quotidien/moteur.js`) porte la graine du jour, la progression, le
//  classement au score puis au temps, la série et les archives.
//
//  ⚠️ Le pays du jour, LUI, est envoyé au navigateur dès le départ : c'est
//  l'énoncé, pas la réponse. Ce qui ne sort jamais, c'est où il se trouve
//  — le navigateur n'a que les caps de ses propres propositions, et il ne
//  peut pas les calculer lui-même : la carte qu'il a porte les centres de
//  tous les pays, donc il saurait trianguler s'il recevait l'angle vers un
//  pays qu'il n'a pas montré.
// =====================================================================
module.exports = function monterCarte(app, deps) {
    const { express, requireAuth, requireAuthApi, currentUser, mfGet, mfSet,
            mfTodayId, mfShiftDay, mfSecondsToMidnight, dateDemandee, creerMoteur, racine } = deps;

    const carteJeu = require('./jeu');
    const reservation = require('../geo/reservation');
    const { fiche } = require('../geo/fiche');
    const mCarte = creerMoteur('carte');
    const kCartePays = (date) => `carte:pays:${date}`;

    function paysDuJour(date) {
        const cache = mfGet(kCartePays(date));
        const connu = cache && carteJeu.parCode.get(cache);
        if (connu) return connu;
        // ⚠️ Trente jours sans répétition, comme la Géographie — six ne
        // suffisaient pas : mesuré, onze répétitions à moins de quinze jours
        // sur 180. Et on écarte ce qu'un autre jeu de géographie a déjà pris
        // aujourd'hui (voir geo/reservation.js).
        const recents = reservation.aEviter(mfGet, mfShiftDay, date, kCartePays);
        const p = carteJeu.paysDuJour(mCarte.tirageDuJour(date), recents);
        mfSet(kCartePays(date), p.code);
        return p;
    }

    app.use('/carte', requireAuth, express.static(racine + '/public/carte'));

    app.get('/api/carte/today', requireAuthApi, (req, res) => {
        const user = currentUser(req), today = mfTodayId();
        const date = dateDemandee(req.query.date, today);
        const cible = paysDuJour(date);
        const prog = mCarte.progression(user, date);
        res.json({
            date, today, archive: date !== today, nextIn: mfSecondsToMidnight(),
            maxEssais: carteJeu.MAX_ESSAIS,
            // L'énoncé : le nom du pays à montrer. Rien d'autre de lui.
            cherche: cible.nom,
            progression: prog,
            // La réponse — c'est-à-dire OÙ il se trouve — seulement une fois
            // la manche finie, pour que l'écran de fin puisse la montrer.
            reponse: (prog && prog.fini) ? fiche(cible.code) : undefined,
            serie: mCarte.serie(user),
        });
    });

    app.post('/api/carte/start', requireAuthApi, (req, res) => {
        const user = currentUser(req), today = mfTodayId();
        const date = dateDemandee((req.body || {}).date, today);
        const prog = mCarte.demarrer(user, date);
        res.json({ ok: true, debutA: date === today ? prog.debutA : null });
    });

    app.post('/api/carte/montrer', requireAuthApi, (req, res) => {
        const user = currentUser(req), today = mfTodayId();
        const b = req.body || {};
        const date = dateDemandee(b.date, today);
        const cible = paysDuJour(date);
        const prog = mCarte.progression(user, date) || mCarte.demarrer(user, date);
        prog.essais = prog.essais || [];
        if (prog.fini) return res.status(400).json({ error: 'Manche déjà terminée.' });
        if (prog.essais.length >= carteJeu.MAX_ESSAIS) return res.status(400).json({ error: 'Plus d’essai disponible.' });

        const montre = carteJeu.parCode.get(String(b.pays || '').toUpperCase());
        if (!montre) return res.status(400).json({ error: 'Pays inconnu.' });
        if (prog.essais.some(e => e.code === montre.code)) return res.status(400).json({ error: 'Déjà montré.' });

        const eval_ = carteJeu.evaluer(montre.code, cible.code);
        prog.essais.push(eval_);
        prog.trouve = eval_.juste;
        prog.fini = eval_.juste || prog.essais.length >= carteJeu.MAX_ESSAIS;

        if (prog.fini && date === today) {
            prog.ms = mCarte.tempsEcoule(prog);
            prog.score = carteJeu.score(prog.essais.length, prog.trouve);
            mCarte.noterJourJoue(user, date);
            mCarte.inscrireAuClassement(user, date, prog.score, prog.ms,
                { essais: prog.essais.length, trouve: prog.trouve });
        }
        mCarte.enregistrer(user, date, prog);

        res.json({
            ok: true, essai: eval_,
            restants: carteJeu.MAX_ESSAIS - prog.essais.length,
            fini: !!prog.fini, trouve: !!prog.trouve,
            // La réponse n'arrive qu'à la fin, et seulement alors.
            reponse: prog.fini ? fiche(cible.code) : undefined,
            score: prog.score, ms: prog.ms,
            place: prog.fini && date === today ? mCarte.placeDe(user, date) : null,
            classement: prog.fini ? mCarte.classement(date).slice(0, 15) : undefined,
            serie: mCarte.serie(user),
        });
    });

    app.get('/api/carte/classement', requireAuthApi, (req, res) => {
        const date = dateDemandee(req.query.date, mfTodayId());
        res.json({ classement: mCarte.classement(date).slice(0, 30) });
    });

    return { moteur: mCarte, duJour: paysDuJour, kPays: kCartePays, jeu: carteJeu };
};
