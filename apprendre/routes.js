// =====================================================================
//  L'APPRENTISSAGE (/apprendre) — les routes
//
//  ⚠️ Ce n'est PAS un jeu du jour : aucun point, aucun classement, aucune
//  série à tenir, pas de limite. Dès qu'il y a un classement, on cesse de
//  se tromper — et on cesse d'apprendre. Les cinq jeux sont l'épreuve,
//  ceci est l'entraînement.
//
//  ⚠️ La bonne réponse ne quitte jamais le serveur avant d'avoir répondu.
//  La séance en cours est rangée en base (`geo:seance:<pseudo>`), et c'est
//  elle qui fait foi : le navigateur ne reçoit que des énoncés.
// =====================================================================
module.exports = function monterApprendre(app, deps) {
    const { express, requireAuth, requireAuthApi, currentUser, mfGet, mfSet, mfTodayId, racine } = deps;
    const tousLesPseudos = deps.pseudos || (() => []);

    const savoir = require('../geo/savoir');
    const exercices = require('../geo/exercices');
    const { regions: REGIONS } = require('../geo/regions');
    const DRAPEAUX = require('../geo/drapeaux');
    const { fiche } = require('../geo/fiche');

    const kSeance = (pseudo) => `geo:seance:${pseudo}`;
    // Un hasard ordinaire : une séance d'entraînement n'a pas à être la même
    // pour tout le monde, au contraire d'un jeu du jour.
    const hasard = () => Math.random();

    // Met le modèle à jour depuis les manches quotidiennes, puis rend le
    // tableau de bord. ⚠️ C'est ici que se fait le pont : jouer suffit à
    // apprendre, le joueur n'a rien à déclarer.
    // Le cache complet, pour le pont : `nourrir` relit les progressions de
    // tous les jeux de géographie.
    const mfCacheDe = deps.cache || (() => ({}));
    function etatDe(pseudo) {
        const today = mfTodayId();
        const sav = savoir.lire(mfGet, pseudo);
        const touche = savoir.nourrir(mfCacheDe(), sav, pseudo, today);
        // Le relevé du jour, pour la courbe de progression. Il ne coûte rien
        // et c'est la seule trace du chemin parcouru.
        const avant = (sav.__j || {})[today];
        savoir.releverLeJour(sav, today);
        if (touche || avant !== (sav.__j || {})[today]) mfSet(savoir.CLE(pseudo), sav);
        return { today, sav };
    }

    app.use('/apprendre', requireAuth, express.static(racine + '/public/apprendre'));

    app.get('/api/apprendre/bilan', requireAuthApi, (req, res) => {
        const pseudo = currentUser(req);
        const { today, sav } = etatDe(pseudo);
        // ⚠️ Sa place voyage avec le bilan : une ligne dans la carte du rang
        // ne coûte aucune hauteur, là où un bloc de classement en coûterait
        // beaucoup sur une page qu'on vient de ramener à un écran.
        const liste = classement(tousLesPseudos());
        const i = liste.findIndex(l => l.pseudo === pseudo);
        res.json({
            pseudo, ...savoir.bilan(sav, today), courbe: savoir.courbe(sav),
            place: i >= 0 ? { place: i + 1, total: liste.length } : null,
        });
    });

    // La liste complète, demandée seulement quand on la déplie.
    app.get('/api/apprendre/classement', requireAuthApi, (req, res) => {
        res.json({ moi: currentUser(req), lignes: classement(tousLesPseudos()) });
    });

    // Une séance. `source` dit d'où viennent les pays :
    //   · revision        — ce qui est dû aujourd'hui (la porte principale)
    //   · region:<id>     — une leçon, du plus vaste au plus petit
    //   · libre           — au hasard dans ce qu'on connaît le moins
    app.post('/api/apprendre/seance', requireAuthApi, (req, res) => {
        const pseudo = currentUser(req);
        const { today, sav } = etatDe(pseudo);
        const source = String((req.body || {}).source || 'revision');
        const combien = Math.min(20, Math.max(4, Number((req.body || {}).combien) || 10));
        const formes = Array.isArray((req.body || {}).formes) ? (req.body || {}).formes : null;

        let codes = [];
        let titre = '';
        // Les pays à montrer sur la carte quand la question est « montre-le ».
        // ⚠️ Dans une leçon de région, on ne doit PAS voir le monde entier :
        // chercher le Laos sur une carte planétaire, c'est chercher une
        // aiguille ; sur l'Asie du Sud-Est, c'est apprendre.
        let cadre = null;
        let formeImposee = null;
        if (source.startsWith('region:')) {
            const r = REGIONS.find(x => x.id === source.slice(7));
            if (!r) return res.status(400).json({ error: 'Région inconnue.' });
            titre = r.emoji + ' ' + r.nom;
            cadre = r.pays;
            // ⚠️ Dans une leçon, on commence par ce qu'on ne sait PAS. Revoir
            // d'abord les pays qu'on maîtrise déjà, c'est perdre la moitié de
            // la séance avant d'apprendre quoi que ce soit.
            codes = r.pays.slice().sort((a, b) =>
                ((sav[a] && sav[a].n) || 0) - ((sav[b] && sav[b].n) || 0)).slice(0, combien);
        } else if (source.startsWith('famille:')) {
            const fam = DRAPEAUX.FAMILLES.find(x => x.id === source.slice(8));
            if (!fam) return res.status(400).json({ error: 'Famille inconnue.' });
            titre = fam.emoji + ' ' + fam.nom;
            cadre = fam.pays;
            // ⚠️ Une famille s'entraîne AU DRAPEAU, forcément : c'est le
            // drapeau qui les rassemble. Demander la capitale du Danemark
            // dans une leçon sur les croix nordiques n'apprendrait rien de la
            // famille.
            formeImposee = ['drapeau', 'nom-drapeau'];
            codes = fam.pays.slice().sort((a, b) =>
                ((sav[a] && sav[a].n) || 0) - ((sav[b] && sav[b].n) || 0)).slice(0, combien);
        } else if (source === 'libre') {
            titre = 'Au hasard';
            const tous = REGIONS.flatMap(r => r.pays);
            codes = tous.sort(() => Math.random() - 0.5).slice(0, combien);
        } else {
            titre = 'Ta révision du jour';
            // ⚠️ Le dosage : SOIXANTE pour cent de révision au plus, le reste
            // en découverte. Mesuré sur trente jours de simulation, la file de
            // révision restait à zéro ou un : les intervalles grandissent vite
            // et la séance se remplissait de nouveautés. On découvrait
            // beaucoup et on consolidait peu — cent seize jours pour les cent
            // quatre-vingt-quatorze pays. Plafonner la découverte force la
            // consolidation quand il y a de quoi réviser, et laisse la séance
            // pleine quand il n'y a rien.
            const duJour = savoir.aRevoir(sav, today, combien).map(x => x.code);
            const placeRevision = Math.min(duJour.length, Math.ceil(combien * 0.6));
            codes = duJour.slice(0, placeRevision);
            if (codes.length < combien) {
                const manquants = REGIONS.flatMap(r => r.pays)
                    .filter(c => (!sav[c] || !sav[c].n) && !codes.includes(c))
                    .slice(0, combien - codes.length);
                codes = codes.concat(manquants);
                // S'il ne reste rien à découvrir, on reprend de la révision.
                if (codes.length < combien) {
                    codes = codes.concat(duJour.slice(placeRevision, placeRevision + combien - codes.length));
                }
            }
        }
        if (!codes.length) return res.json({ titre, questions: [], vide: true });

        let questions = exercices.serie(codes, hasard, formeImposee || formes);
        // ⚠️ La saisie libre : on ne peut plus éliminer, donc c'est le seul
        // exercice qui dise vraiment si l'on sait. Optionnel — imposé, il
        // découragerait. Et jamais sur une question qui se joue sur la carte.
        if ((req.body || {}).saisie) {
            questions = questions.map(q => (q.type === 'choix' ? exercices.enSaisieLibre(q) : q));
        }
        // ⚠️ La séance est gardée ICI, avec les bonnes réponses. Le
        // navigateur ne reçoit que les énoncés.
        mfSet(kSeance(pseudo), { titre, source, debutA: Date.now(), index: 0, justes: 0, questions });
        res.json({
            titre, cadre, total: questions.length,
            question: publique(questions[0], 0, questions.length),
        });
    });

    function bilanDeFin(sav, today, seance) {
        const b = savoir.bilan(sav, today);
        return { ...b, pays: b.total, justes: seance.justes, total: seance.questions.length };
    }

    // L'énoncé seul : tout sauf le code attendu.
    function publique(q, index, total) {
        if (!q) return null;
        const { code, ...reste } = q;
        return { ...reste, index, total };
    }

    app.post('/api/apprendre/repondre', requireAuthApi, (req, res) => {
        const pseudo = currentUser(req);
        const today = mfTodayId();
        const seance = mfGet(kSeance(pseudo));
        if (!seance || !seance.questions || !seance.questions.length) {
            return res.status(400).json({ error: 'Aucune séance en cours.' });
        }
        const q = seance.questions[seance.index];
        if (!q) return res.status(400).json({ error: 'Séance terminée.' });

        const juste = exercices.verifier(q, (req.body || {}).reponse);
        if (juste) seance.justes++;

        // Le modèle apprend de chaque réponse, bonne ou mauvaise.
        const sav = savoir.lire(mfGet, pseudo);
        savoir.noter(sav, q.code, juste, today);
        mfSet(savoir.CLE(pseudo), sav);

        seance.index++;
        const suivante = seance.questions[seance.index];
        mfSet(kSeance(pseudo), seance);

        // ⚠️ Quand on confond deux drapeaux, la fiche du bon pays ne suffit
        // pas : ce qu'il faut, c'est savoir QUOI REGARDER pour ne plus les
        // confondre. « Le bleu du Tchad est plus sombre que celui de la
        // Roumanie » vaut mieux que dix révisions.
        const mauvais = String((req.body || {}).reponse || '').toUpperCase().trim();
        const pourquoi = (!juste && mauvais.length === 2)
            ? DRAPEAUX.pourquoiOnConfond(q.code, mauvais) : null;

        res.json({
            juste, pourquoi,
            // ⚠️ La fiche du pays arrive à CHAQUE réponse, juste ou fausse :
            // c'est le moment où on apprend, et le seul où on regarde
            // vraiment. La cacher quand on a bon serait manquer la moitié
            // des occasions.
            fiche: fiche(q.code),
            niveau: (sav[q.code] || {}).n || 0,
            question: publique(suivante, seance.index, seance.questions.length),
            fini: !suivante,
            // ⚠️ DEUX TOTAUX, DEUX NOMS. `total` était écrit par les deux
            // objets sans dire la même chose — 194 pays pour le bilan, dix
            // questions pour la séance — et le bilan, étalé en dernier,
            // écrasait l'autre : l'écran de fin annonçait « 4 / 194 ». Le
            // monde compte ses pays sous `pays`, la séance ses questions
            // sous `total`, et plus rien ne se recouvre.
            bilan: suivante ? null : bilanDeFin(sav, today, seance),
        });
    });

    // Les familles de drapeaux, et ce qu'on en sait. ⚠️ Un drapeau ne
    // s'apprend pas comme une image à retenir mais comme une règle à
    // comprendre puis une variante à distinguer : les croix nordiques se
    // retiennent en bloc, une par une elles ne tiennent pas.
    app.get('/api/apprendre/familles', requireAuthApi, (req, res) => {
        const pseudo = currentUser(req);
        const { sav } = etatDe(pseudo);
        res.json({
            familles: DRAPEAUX.FAMILLES.map(f => {
                const su = f.pays.filter(c => ((sav[c] && sav[c].n) || 0) >= 3).length;
                return { id: f.id, nom: f.nom, emoji: f.emoji, regle: f.regle,
                         total: f.pays.length, su, part: Math.round(su / f.pays.length * 100),
                         pays: f.pays };
            }),
        });
    });

    // Les régions, pour la porte « Découvrir ».
    app.get('/api/apprendre/regions', requireAuthApi, (req, res) => {
        const pseudo = currentUser(req);
        const { today, sav } = etatDe(pseudo);
        res.json({ regions: savoir.bilan(sav, today).regions });
    });

    // Les niveaux pays par pays, pour la carte de maîtrise. ⚠️ Juste le
    // niveau, pas les dates de révision : la carte n'en a pas besoin, et
    // l'état complet d'un joueur ne regarde que lui.
    app.get('/api/apprendre/niveaux', requireAuthApi, (req, res) => {
        const pseudo = currentUser(req);
        const { sav } = etatDe(pseudo);
        const niveaux = {};
        for (const [code, e] of Object.entries(sav)) {
            if (code === '__' || !e || !e.n) continue;
            niveaux[code] = e.n;
        }
        res.json({ niveaux });
    });

    // La fiche d'un pays, pour la consulter librement depuis l'atlas.
    app.get('/api/apprendre/pays', requireAuthApi, (req, res) => {
        const f = fiche(String(req.query.code || '').toUpperCase());
        if (!f) return res.status(404).json({ error: 'Pays inconnu.' });
        const sav = savoir.lire(mfGet, currentUser(req));
        res.json({ ...f, niveau: (sav[f.code] || {}).n || 0 });
    });

    // Les niveaux d'un joueur, pour l'atlas montré dans sa bulle de profil.
    // ⚠️ Comme la route publique, et pour la même raison : juste le niveau,
    // jamais les dates de révision. Et pas de mise à jour du modèle — on
    // regarde le profil de quelqu'un d'autre, on ne joue pas à sa place.
    function niveauxDe(pseudo) {
        const sav = savoir.lire(mfGet, pseudo);
        const niveaux = {};
        let maitrises = 0, vus = 0;
        for (const [code, e] of Object.entries(sav)) {
            if (code === '__' || code === '__j' || !e || !e.n) continue;
            niveaux[code] = e.n;
            vus++;
            if (e.n >= savoir.SEUIL_MAITRISE) maitrises++;
        }
        const b = savoir.bilan(sav, mfTodayId());
        // ⚠️ `vus` autant que `maitrises` : quelqu'un qui a croisé trente pays
        // sans en maîtriser un seul a bel et bien un atlas à montrer, et c'est
        // même le cas de tous les débutants. Ne garder que les maîtrisés
        // privait de carte exactement ceux dont on veut voir le départ.
        return { niveaux, maitrises, vus, total: b.total,
                 rang: { nom: b.rang.nom, emoji: b.rang.emoji } };
    }

    // ---------------------------------------------------------------------
    //  LE CLASSEMENT DE LA GÉOGRAPHIE
    //  ⚠️ Il ne distribue aucun point et n'entre dans aucune saison : c'est
    //  un état des lieux — combien de pays chacun maîtrise — et non une
    //  course. L'Université reste l'entraînement : dès qu'il y a des points
    //  à gagner, on cesse de se tromper, et on cesse d'apprendre. Ce qui ne
    //  veut pas dire qu'on n'a pas envie de savoir où l'on se situe.
    //
    //  Recalculé à la demande depuis les clés existantes, comme le classement
    //  du Salon et les titres — rien n'est stocké. Un cache d'une minute
    //  suffit : trente-deux comptes, une clé chacun.
    // ---------------------------------------------------------------------
    let cacheClassement = null, cacheExpire = 0;
    function classement(pseudos) {
        if (cacheClassement && Date.now() < cacheExpire) return cacheClassement;
        const lignes = [];
        for (const pseudo of pseudos) {
            const sav = savoir.lire(mfGet, pseudo);
            let maitrises = 0, vus = 0;
            for (const [code, e] of Object.entries(sav)) {
                if (code === '__' || code === '__j' || !e || !e.n) continue;
                vus++;
                if (e.n >= savoir.SEUIL_MAITRISE) maitrises++;
            }
            // ⚠️ Qui n'a jamais rien vu n'apparaît pas. Une liste où la
            // moitié des lignes sont à zéro ne dit plus rien de personne.
            if (!vus) continue;
            const r = savoir.rangDe(maitrises);
            lignes.push({ pseudo, maitrises, vus, rang: { nom: r.nom, emoji: r.emoji } });
        }
        // À égalité de pays maîtrisés, celui qui en a découvert le plus passe
        // devant : il a plus de chemin derrière lui.
        lignes.sort((a, b) => b.maitrises - a.maitrises || b.vus - a.vus
            || a.pseudo.localeCompare(b.pseudo, 'fr'));
        cacheClassement = lignes;
        cacheExpire = Date.now() + 60000;
        return lignes;
    }

    // Le résumé pour l'accueil du salon : juste de quoi remplir la carte.
    // ⚠️ Il NE met pas le modèle à jour — le pouls est appelé à chaque
    // ouverture de l'accueil, et relire les progressions de tous les jeux à
    // chaque fois coûterait cher pour rien. La mise à jour se fait en entrant
    // dans l'Université.
    function resume(pseudo) {
        const sav = savoir.lire(mfGet, pseudo);
        const b = savoir.bilan(sav, mfTodayId());
        return { maitrises: b.maitrises, total: b.total, aRevoir: b.aRevoir,
                 rang: { nom: b.rang.nom, emoji: b.rang.emoji } };
    }

    return { savoir, exercices, resume, niveauxDe, classement: () => classement(tousLesPseudos()) };
};
