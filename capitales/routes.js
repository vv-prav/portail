// =====================================================================
//  LES CAPITALES DU JOUR (/capitales) — les routes
//
//  Même forme que les quatre autres jeux du jour récents : le moteur
//  commun (`quotidien/moteur.js`) porte la graine du jour, la
//  progression, le classement au score puis au temps, la série et les
//  archives. Il ne reste ici que ce qui est propre au jeu.
//
//  ⚠️ La capitale du jour ne quitte JAMAIS le serveur avant la fin de la
//  manche. Le navigateur ne reçoit que l'évaluation de ses propres
//  propositions, et la liste des noms proposables — qui contient les 194
//  capitales, donc ne désigne rien.
// =====================================================================
module.exports = function monterCapitales(app, deps) {
    const { express, requireAuth, requireAuthApi, currentUser, mfGet, mfSet,
            mfTodayId, mfSecondsToMidnight, dateDemandee, creerMoteur, racine } = deps;

    const capJeu = require('./jeu');
    const mCapitales = creerMoteur('capitales');
    const kCapitaleDuJour = (date) => `capitales:ville:${date}`;

    // La capitale d'une date, fixée une fois pour toutes. Comme partout, elle
    // est rangée en base : le tirage dépend de la date ET de la variante, et
    // l'admin peut en retirer une autre sans que les jours passés bougent.
    function capitaleDuJour(date) {
        const cache = mfGet(kCapitaleDuJour(date));
        const connue = cache && capJeu.parCode.get(cache);
        if (connue) return connue;
        const v = capJeu.capitaleDuJour(mCapitales.tirageDuJour(date));
        mfSet(kCapitaleDuJour(date), v.code);
        return v;
    }

    app.use('/capitales', requireAuth, express.static(racine + '/public/capitales'));

    // La liste des noms proposables, servie une fois et mise en cache par le
    // navigateur : 194 capitales et leurs pays, soit de quoi autocompléter
    // sans un aller-retour par lettre tapée.
    app.get('/api/capitales/liste', requireAuthApi, (req, res) => {
        res.json({ noms: capJeu.propositions(), maxEssais: capJeu.MAX_ESSAIS });
    });

    app.get('/api/capitales/today', requireAuthApi, (req, res) => {
        const user = currentUser(req), today = mfTodayId();
        const date = dateDemandee(req.query.date, today);
        const cible = capitaleDuJour(date);
        const prog = mCapitales.progression(user, date);
        const fini = !!(prog && prog.fini);
        res.json({
            date, today, archive: date !== today, nextIn: mfSecondsToMidnight(),
            maxEssais: capJeu.MAX_ESSAIS,
            progression: prog,
            // La réponse n'arrive qu'à la fin — jamais avant.
            reponse: fini ? { ville: cible.ville, pays: cible.pays, pop: cible.pop,
                              devise: cible.devise, langue: (cible.langues || [])[0] || '—' } : undefined,
            serie: mCapitales.serie(user),
        });
    });

    app.post('/api/capitales/start', requireAuthApi, (req, res) => {
        const user = currentUser(req), today = mfTodayId();
        const date = dateDemandee((req.body || {}).date, today);
        const prog = mCapitales.demarrer(user, date);
        res.json({ ok: true, debutA: date === today ? prog.debutA : null });
    });

    app.post('/api/capitales/proposer', requireAuthApi, (req, res) => {
        const user = currentUser(req), today = mfTodayId();
        const b = req.body || {};
        const date = dateDemandee(b.date, today);
        const cible = capitaleDuJour(date);
        const prog = mCapitales.progression(user, date) || mCapitales.demarrer(user, date);
        prog.essais = prog.essais || [];
        if (prog.fini) return res.status(400).json({ error: 'Manche déjà terminée.' });
        if (prog.essais.length >= capJeu.MAX_ESSAIS) return res.status(400).json({ error: 'Plus d’essai disponible.' });

        // Une faute de frappe ne coûte pas un essai : on refuse sans compter.
        const propose = capJeu.trouver(b.saisie);
        if (!propose) return res.status(400).json({ error: 'Capitale ou pays inconnu.' });
        if (prog.essais.some(e => e.code === propose.code)) return res.status(400).json({ error: 'Déjà proposé.' });

        const eval_ = capJeu.evaluer(propose.code, cible.code);
        prog.essais.push(eval_);
        prog.trouve = eval_.juste;
        prog.fini = eval_.juste || prog.essais.length >= capJeu.MAX_ESSAIS;

        if (prog.fini && date === today) {
            prog.ms = mCapitales.tempsEcoule(prog);
            prog.score = capJeu.score(prog.essais.length, prog.trouve);
            mCapitales.noterJourJoue(user, date);
            mCapitales.inscrireAuClassement(user, date, prog.score, prog.ms,
                { essais: prog.essais.length, trouve: prog.trouve });
        }
        mCapitales.enregistrer(user, date, prog);

        res.json({
            ok: true, essai: eval_,
            restants: capJeu.MAX_ESSAIS - prog.essais.length,
            fini: !!prog.fini, trouve: !!prog.trouve,
            reponse: prog.fini ? { ville: cible.ville, pays: cible.pays, pop: cible.pop,
                                   devise: cible.devise, langue: (cible.langues || [])[0] || '—' } : undefined,
            score: prog.score, ms: prog.ms,
            place: prog.fini && date === today ? mCapitales.placeDe(user, date) : null,
            classement: prog.fini ? mCapitales.classement(date).slice(0, 15) : undefined,
            serie: mCapitales.serie(user),
        });
    });

    app.get('/api/capitales/classement', requireAuthApi, (req, res) => {
        const date = dateDemandee(req.query.date, mfTodayId());
        res.json({ classement: mCapitales.classement(date).slice(0, 30) });
    });

    return { moteur: mCapitales, duJour: capitaleDuJour, kVille: kCapitaleDuJour, jeu: capJeu };
};
