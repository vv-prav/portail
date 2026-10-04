// =====================================================================
//  LA GÉOGRAPHIE (/geo) — pays, drapeau, voyage — les routes
//
//  Sorti de `server.js`, qui dépassait les 3 500 lignes. Le module reçoit
//  ce dont il a besoin (le moteur des jeux du jour, le cache, les gardes
//  d'authentification) et rend ce que le reste du salon lui demande —
//  le pouls, la carte du profil, les résultats du jour, l'administration.
// =====================================================================
module.exports = function monterGeo(app, deps) {
    const { express, requireAuth, requireAuthApi, currentUser, mfGet, mfSet,
            mfTodayId, mfShiftDay, mfSecondsToMidnight, dateDemandee, creerMoteur, racine } = deps;

    const geoJeu = require('./jeu');
    const mGeo = creerMoteur('geo');

    // Trois modes : le pays (silhouette), le drapeau, et le voyage (aller d'un
    // pays à un autre de frontière en frontière). `GEO_MODES` est la seule
    // liste — le pouls, le résumé, les résultats du jour et l'admin la
    // parcourent, aucun ne doit énumérer les modes à la main.
    const GEO_MODES = ['silhouette', 'drapeau', 'voyage'];
    const GEO_NOMS = {
        silhouette: { nom: 'Le pays mystère', emoji: '🗺️' },
        drapeau:    { nom: 'Le drapeau mystère', emoji: '🏳️' },
        voyage:     { nom: 'Le voyage', emoji: '🧭' },
    };
    const kGeoPays = (mode, date) => `geo:pays:${mode}:${date}`;

    // Le voyage du jour est rangé sous la même clé que les deux autres modes
    // (`geo:pays:voyage:<date>`, valeur « PT>PL ») : la purge, la régénération
    // par l'admin et le compteur de variante le traitent donc sans cas à part.
    function geoVoyageDuJour(date) {
        const cle = kGeoPays('voyage', date);
        let brut = mfGet(cle);
        if (!brut || !/^[A-Z]{2}>[A-Z]{2}$/.test(brut)) {
            const recents = [];
            for (let i = 1; i <= 30; i++) {
                const c = mfGet(kGeoPays('voyage', mfShiftDay(date, -i)));
                if (c) recents.push(...String(c).split('>'));
            }
            const v = geoJeu.tirerVoyage(mGeo.tirageDuJour(date, 'voyage'), recents);
            brut = v.de + '>' + v.a;
            mfSet(cle, brut);
        }
        const [de, a] = brut.split('>');
        const chemin = geoJeu.plusCourtChemin(de, a);
        const D = geoJeu.parCode.get(de), A = geoJeu.parCode.get(a);
        return {
            code: brut, de: D, a: A, chemin, optimal: chemin.length - 2,
            nom: D.nom + ' → ' + A.nom,
        };
    }
    // Ce qu'on montre d'un pays dans le voyage : jamais plus que son nom, son
    // drapeau et sa forme.
    const geoCarte = (p) => ({ code: p.code, nom: p.nom, drapeau: geoJeu.drapeau(p.code), chemin: p.chemin || null });

    function geoDuJour(mode, date) {
        if (mode === 'voyage') return geoVoyageDuJour(date);
        const cache = mfGet(kGeoPays(mode, date));
        if (cache && geoJeu.parCode.get(cache)) return geoJeu.parCode.get(cache);
        // On évite les pays sortis récemment dans le même mode.
        const recents = [];
        for (let i = 1; i <= 30; i++) {
            const c = mfGet(kGeoPays(mode, mfShiftDay(date, -i)));
            if (c) recents.push(c);
        }
        const p = geoJeu.tirerSansRepeter(mode, mGeo.tirageDuJour(date, mode), recents);
        mfSet(kGeoPays(mode, date), p.code);
        return p;
    }
    const kGeoProg = (user, mode, date) => `geo:prog:${user}:${date}:${mode}`;

    app.use('/geo', requireAuth, express.static(racine + '/public/geo'));

    // La liste des pays proposables, servie une fois et mise en cache par le
    // navigateur : 211 noms, quelques kilo-octets. Les silhouettes, elles, ne
    // quittent jamais le serveur — les envoyer donnerait la réponse du jour.
    app.get('/api/geo/pays', requireAuthApi, (req, res) => {
        res.set('Cache-Control', 'private, max-age=86400');
        res.json({ pays: geoJeu.listeDesNoms() });
    });

    app.get('/api/geo/today', requireAuthApi, (req, res) => {
        const user = currentUser(req), today = mfTodayId();
        const mode = GEO_MODES.includes(req.query.mode) ? req.query.mode : 'silhouette';
        let date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : today;
        if (date > today) date = today;
        const cible = geoDuJour(mode, date);
        const prog = mfGet(kGeoProg(user, mode, date));
        const fini = !!(prog && prog.fini);
        if (mode === 'voyage') {
            return res.json({
                date, today, mode, archive: date !== today, nextIn: mfSecondsToMidnight(),
                depart: geoCarte(cible.de), arrivee: geoCarte(cible.a),
                // Le nombre de pays du plus court chemin est annoncé d'avance :
                // c'est l'objectif, et le barème se lit par rapport à lui.
                optimal: cible.optimal,
                maxErreurs: geoJeu.VOYAGE.MAX_ERREURS, marge: geoJeu.VOYAGE.MARGE,
                progression: prog || null,
                reponse: fini ? { chemin: cible.chemin.map(c => geoCarte(geoJeu.parCode.get(c))) } : undefined,
                serie: mGeo.serie(user),
            });
        }
        res.json({
            date, today, mode, archive: date !== today, nextIn: mfSecondsToMidnight(),
            maxEssais: geoJeu.MAX_ESSAIS,
            // L'indice du jour selon le mode : le contour, ou le drapeau.
            silhouette: mode === 'silhouette' ? cible.chemin : null,
            drapeau: mode === 'drapeau' ? geoJeu.drapeau(cible.code) : null,
            progression: prog || null,
            // La réponse n'est donnée qu'une fois la partie terminée.
            reponse: fini ? { code: cible.code, nom: cible.nom, drapeau: geoJeu.drapeau(cible.code), region: cible.region, chemin: cible.chemin } : undefined,
            serie: mGeo.serie(user),
        });
    });

    app.post('/api/geo/start', requireAuthApi, (req, res) => {
        const user = currentUser(req), today = mfTodayId();
        const b = req.body || {};
        const mode = GEO_MODES.includes(b.mode) ? b.mode : 'silhouette';
        const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : today;
        if (date !== today) return res.json({ ok: true });
        const cle = kGeoProg(user, mode, date);
        const prog = mfGet(cle) || { debutA: 0, essais: [], fini: false, trouve: false };
        if (!prog.debutA) { prog.debutA = Date.now(); mfSet(cle, prog); }
        res.json({ ok: true, debutA: prog.debutA });
    });

    app.post('/api/geo/proposer', requireAuthApi, (req, res) => {
        const user = currentUser(req), today = mfTodayId();
        const b = req.body || {};
        const mode = GEO_MODES.includes(b.mode) ? b.mode : 'silhouette';
        const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : today;
        if (date > today) return res.status(400).json({ error: 'Journée à venir.' });
        const cible = geoDuJour(mode, date);
        const cle = kGeoProg(user, mode, date);
        if (mode === 'voyage') return geoProposerVoyage(req, res, { user, date, today, cible, cle, saisie: b.pays });
        const prog = mfGet(cle) || { debutA: Date.now(), essais: [], fini: false, trouve: false };
        if (prog.fini) return res.status(400).json({ error: 'Partie déjà terminée.' });
        if (prog.essais.length >= geoJeu.MAX_ESSAIS) return res.status(400).json({ error: 'Plus d’essai disponible.' });

        const propose = geoJeu.trouverPays(b.pays);
        // Une faute de frappe ne doit pas coûter un essai : on refuse le coup au
        // lieu de le compter.
        if (!propose) return res.status(400).json({ error: 'Pays inconnu.' });
        if (prog.essais.some(e => e.code === propose.code)) return res.status(400).json({ error: 'Déjà proposé.' });

        const eval_ = geoJeu.evaluer(propose.code, cible.code);
        prog.essais.push(eval_);
        prog.trouve = eval_.juste;
        prog.fini = eval_.juste || prog.essais.length >= geoJeu.MAX_ESSAIS;
        if (prog.fini && date === today) {
            prog.ms = Math.min(3 * 3600 * 1000, Math.max(0, Date.now() - (prog.debutA || Date.now())));
            prog.score = geoJeu.score(prog.essais.length, prog.trouve);
            mGeo.noterJourJoue(user, date);
            mGeo.inscrireAuClassement(user, `${date}:${mode}`, prog.score, prog.ms, { essais: prog.essais.length, trouve: prog.trouve });
        }
        mfSet(cle, prog);
        res.json({
            ok: true, essai: eval_, restants: geoJeu.MAX_ESSAIS - prog.essais.length, fini: prog.fini, trouve: prog.trouve,
            reponse: prog.fini ? { code: cible.code, nom: cible.nom, drapeau: geoJeu.drapeau(cible.code), region: cible.region, chemin: cible.chemin } : undefined,
            score: prog.score, ms: prog.ms,
            place: prog.fini && date === today ? mGeo.placeDe(user, `${date}:${mode}`) : null,
            classement: prog.fini ? mGeo.classement(`${date}:${mode}`).slice(0, 15) : undefined,
            serie: mGeo.serie(user),
        });
    });

    // ---------- Un pas dans le voyage ----------
    // On part du dernier pays atteint (ou du départ). Le pays proposé doit le
    // toucher : sinon c'est une erreur, et à la troisième le voyage s'arrête.
    // Poser le pied dans un voisin de l'arrivée termine le voyage.
    //
    // ⚠️ Revenir sur ses pas est permis : on peut toujours rebrousser chemin,
    // et c'est ce qui garantit qu'aucun voyage n'est une impasse. Chaque pas
    // compte, y compris ceux qui reviennent en arrière — c'est le détour qui
    // coûte, pas l'erreur de direction.
    function geoProposerVoyage(req, res, { user, date, today, cible, cle, saisie }) {
        const V = geoJeu.VOYAGE;
        const prog = mfGet(cle) || { debutA: Date.now(), fini: false, trouve: false };
        prog.pas = prog.pas || [];
        prog.erreurs = prog.erreurs || [];
        if (prog.fini) return res.status(400).json({ error: 'Voyage déjà terminé.' });

        const propose = geoJeu.trouverPays(saisie);
        // Une faute de frappe ne coûte rien : on refuse sans compter.
        if (!propose) return res.status(400).json({ error: 'Pays inconnu.' });
        const ici = prog.pas.length ? prog.pas[prog.pas.length - 1].code : cible.de.code;
        if (propose.code === ici) return res.status(400).json({ error: 'Tu y es déjà.' });

        let erreur = null, etape = null;
        // Proposer l'arrivée elle-même n'est permis que depuis un voisin — ce qui
        // n'arrive jamais, puisque le voyage se termine en y entrant. C'est donc
        // toujours une erreur, et on le dit clairement.
        if (!geoJeu.sontVoisins(ici, propose.code)) {
            erreur = { code: propose.code, nom: propose.nom, drapeau: geoJeu.drapeau(propose.code), depuis: geoJeu.parCode.get(ici).nom };
            prog.erreurs.push(erreur);
        } else {
            const e = geoJeu.evaluer(propose.code, cible.a.code);
            etape = { code: propose.code, nom: propose.nom, drapeau: e.drapeau, km: e.km, direction: e.direction };
            prog.pas.push(etape);
        }

        const arrive = !!(etape && geoJeu.sontVoisins(etape.code, cible.a.code));
        const perdu = !arrive && (prog.erreurs.length >= V.MAX_ERREURS || prog.pas.length >= cible.optimal + V.MARGE);
        if (arrive || perdu) {
            prog.fini = true;
            prog.trouve = arrive;
            prog.parfait = arrive && prog.pas.length === cible.optimal && !prog.erreurs.length;
            prog.optimal = cible.optimal;
            if (date === today) {
                prog.ms = Math.min(3 * 3600 * 1000, Math.max(0, Date.now() - (prog.debutA || Date.now())));
                prog.score = geoJeu.scoreVoyage(prog.pas.length, cible.optimal, prog.erreurs.length, arrive);
                mGeo.noterJourJoue(user, date);
                mGeo.inscrireAuClassement(user, `${date}:voyage`, prog.score, prog.ms, {
                    essais: prog.pas.length, trouve: arrive, optimal: cible.optimal, erreurs: prog.erreurs.length,
                });
            }
        }
        mfSet(cle, prog);
        res.json({
            ok: true, etape, erreur, pas: prog.pas, erreurs: prog.erreurs,
            fini: !!prog.fini, trouve: !!prog.trouve, parfait: !!prog.parfait,
            reponse: prog.fini ? { chemin: cible.chemin.map(c => geoCarte(geoJeu.parCode.get(c))) } : undefined,
            score: prog.score, ms: prog.ms,
            place: prog.fini && date === today ? mGeo.placeDe(user, `${date}:voyage`) : null,
            classement: prog.fini ? mGeo.classement(`${date}:voyage`).slice(0, 15) : undefined,
            serie: mGeo.serie(user),
        });
    }

    app.get('/api/geo/classement', requireAuthApi, (req, res) => {
        const mode = GEO_MODES.includes(req.query.mode) ? req.query.mode : 'silhouette';
        const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : mfTodayId();
        res.json({ classement: mGeo.classement(`${date}:${mode}`).slice(0, 30) });
    });

    return { moteur: mGeo, duJour: geoDuJour, kPays: kGeoPays, MODES: GEO_MODES, NOMS: GEO_NOMS, jeu: geoJeu };
};
