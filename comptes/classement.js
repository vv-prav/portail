// =====================================================================
//  LE CLASSEMENT DU SALON — un score transversal, tous jeux confondus
//
//  Il ne stocke RIEN : tout est recalculé à la demande depuis les clés
//  déjà en base. Changer le barème ne demande donc aucune migration, et
//  une remise à zéro n'efface aucune partie (voir `classement:depart`).
//
//  ---------------------------------------------------------------
//  CE QUI A CHANGÉ (V2), ET POURQUOI
//  ---------------------------------------------------------------
//  1. **La performance compte.** L'ancien barème ne distinguait que
//     « réussi » (3 points) de « joué » (1). Un voyage parfait et un pays
//     trouvé de justesse au sixième essai rapportaient la même chose :
//     tout le travail de barème fait dans chaque jeu s'évaporait ici.
//     Une manche vaut maintenant 1, 3 ou 5 points.
//  2. **Quatre périodes** : le jour, la semaine, le mois, depuis le
//     début. Un classement mensuel seul se fige au bout de dix jours ;
//     un classement du jour se rejoue chaque matin.
//  3. **Tout se calcule sur des événements DATÉS** (progressions du jour,
//     historique des parties, défis). Les fiches cumulées (`yams:stats`…)
//     n'entrent plus dans le calcul : sans date, elles interdisaient
//     autant les périodes courtes qu'une remise à zéro.
//  4. **La régularité sort des points.** Elle valait 2 points par jour de
//     série — le poste le plus lourd du barème — et n'a aucun sens dans
//     un classement du jour. La série reste affichée à côté du nom :
//     elle se voit, elle ne s'achète pas.
//
//  ⚠️ **Une seule table de règles** (`JEUX_DU_JOUR`) sert au calcul ET à
//  l'explication montrée aux joueurs (`explications()`). C'est
//  volontaire : une règle du jeu écrite à deux endroits finit toujours
//  par mentir à l'un des deux.
// =====================================================================

const BAREME = {
    // Une manche d'un jeu du jour : jouée, réussie, impeccable.
    jourJoue: 1,
    jourReussi: 2,
    jourImpeccable: 2,
    // Une partie à plusieurs, ou un défi.
    partieJouee: 1,
    partieGagnee: 3,
    // Tous les jeux du jour faits dans la même journée.
    chelem: 3,
};

// Ce que « réussi » et « impeccable » veulent dire, jeu par jeu.
// `v` est la progression du joueur ; `ctx` porte la date, le mode et le
// cache (Le compte est bon a besoin de la meilleure solution du jour).
const JEUX_DU_JOUR = [
    {
        id: 'motus', nom: 'Motus', emoji: '🟨',
        reussi: (v) => !!v.solved,
        impeccable: (v) => !!v.solved && (v.guesses || []).length <= 3,
        ditReussi: 'le mot trouvé',
        ditImpeccable: 'trouvé en trois essais ou moins',
    },
    {
        id: 'mf', nom: 'Mots Fléchés', emoji: '🧩',
        reussi: (v) => !!v.solved,
        impeccable: (v) => !!v.solved && !(v.hints || 0),
        ditReussi: 'la grille terminée',
        ditImpeccable: 'terminée sans aucun indice',
    },
    {
        id: 'chiffres', nom: 'Le compte est bon', emoji: '🔢',
        reussi: (v) => !!(v.fini && v.ecart === 0),
        // « Aussi court que la meilleure solution » : le serveur la connaît
        // déjà, elle est rangée avec la donne du jour.
        impeccable: (v, ctx) => {
            if (!(v.fini && v.ecart === 0)) return false;
            const donne = ctx.cache[`chiffres:donne:${ctx.date}`];
            const court = donne && Array.isArray(donne.solution) ? donne.solution.length : 0;
            return !!court && (v.etapes || []).length <= court;
        },
        ditReussi: 'le compte juste',
        ditImpeccable: 'juste, en aussi peu d’opérations que la meilleure solution',
    },
    {
        id: 'geo', nom: 'Géographie', emoji: '🌍',
        reussi: (v) => !!v.trouve,
        impeccable: (v, ctx) => (ctx.mode === 'voyage'
            ? !!v.parfait
            : !!v.trouve && (v.essais || []).length <= 3),
        ditReussi: 'le pays trouvé, ou le voyage arrivé',
        ditImpeccable: 'trouvé en trois essais, ou arrivé par le plus court chemin sans erreur',
    },
    {
        id: 'motlong', nom: 'Le mot le plus long', emoji: '🔤',
        reussi: (v) => (v.meilleur || 0) >= 6,
        impeccable: (v) => !!v.trouve,
        ditReussi: 'un mot d’au moins six lettres',
        ditImpeccable: 'le mot le plus long possible',
    },
    {
        id: 'sudoku', nom: 'Sudoku', emoji: '🧮',
        reussi: (v) => !!v.trouve,
        impeccable: (v) => !!v.trouve && v.ms != null && v.ms < 10 * 60 * 1000,
        ditReussi: 'la grille résolue',
        ditImpeccable: 'résolue en moins de dix minutes',
    },
];
const PAR_ID = new Map(JEUX_DU_JOUR.map(j => [j.id, j]));

// Les quatre périodes. `debut(aujourdhui)` renvoie le premier jour compté,
// au format AAAA-MM-JJ — la même forme que les dates des clés.
const PERIODES = {
    jour: { id: 'jour', nom: 'Aujourd’hui', debut: (a) => a },
    semaine: {
        id: 'semaine', nom: 'Cette semaine',
        // La semaine commence le lundi.
        debut: (a) => {
            const d = new Date(a + 'T12:00:00Z');
            d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
            return d.toISOString().slice(0, 10);
        },
    },
    mois: { id: 'mois', nom: 'Ce mois-ci', debut: (a) => a.slice(0, 8) + '01' },
    toujours: { id: 'toujours', nom: 'Depuis le début', debut: () => '0000-01-01' },
};

// Le lendemain d'une date, au même format. Sert aux remises à zéro : remettre
// une période à zéro aujourd'hui veut dire « ne plus compter que ce qui vient
// après aujourd'hui », donc à partir de demain.
function lendemain(date) {
    const d = new Date(date + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
}

function norm(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
}

/**
 * Calcule le classement sur une période.
 *
 * @param {object} cache     l'objet clé → valeur (mfCache)
 * @param {string[]} pseudos les comptes à classer
 * @param {object} o         { periode, aujourdhui, departs }
 *        `departs` donne, PAR PÉRIODE, la date de la dernière remise à
 *        zéro — `{ jour, semaine, mois, toujours }`. Chaque période a la
 *        sienne : remettre les points du jour à zéro ne doit pas effacer
 *        le mois, et inversement.
 */
function calculerClassement(cache, pseudos, o) {
    const options = o || {};
    const aujourdhui = options.aujourdhui;
    const periode = PERIODES[options.periode] || PERIODES.semaine;
    const departs = options.departs || {};
    const remise = departs[periode.id];
    // Le début réel : le plus tard des deux, le début naturel de la période ou
    // le lendemain de la dernière remise à zéro de cette période.
    const debut = [periode.debut(aujourdhui), remise ? lendemain(remise) : '0000-01-01'].sort().pop();
    // Minuit à Paris au plus tôt (UTC+2 l'été) : on préfère inclure une
    // partie limite plutôt que d'en perdre une.
    const debutTs = Date.parse(debut + 'T00:00:00Z') - 2 * 3600 * 1000;

    const parPseudo = new Map();
    for (const p of pseudos) {
        parPseudo.set(p, {
            pseudo: p, points: 0,
            manches: 0, reussites: 0, impeccables: 0,
            parties: 0, victoires: 0, chelems: 0,
        });
    }
    const parNorm = new Map(pseudos.map(p => [norm(p), p]));

    // --- Les jeux du jour ---
    // `mf:prog:<pseudo>:<date>:<niveau>` et `geo:prog:<pseudo>:<date>:<mode>`
    // ont un segment de plus ; la date est toujours le quatrième.
    const jeuxDuJour = new Map();   // "<pseudo>|<date>" → Set des jeux faits
    const manches = new Map();      // "<pseudo>|<date>|<jeu>" → la manche comptée
    for (const [cle, val] of Object.entries(cache)) {
        if (!val || typeof val !== 'object') continue;
        const seg = cle.split(':');
        if (seg[1] !== 'prog') continue;
        const jeu = PAR_ID.get(seg[0]);
        if (!jeu) continue;
        const pseudo = seg[2], date = seg[3], extra = seg[4];
        if (!date || date < debut || (aujourdhui && date > aujourdhui)) continue;
        if (!parPseudo.has(pseudo)) continue;        // compte supprimé depuis

        const ctx = { cache, date, pseudo, mode: extra };
        const impeccable = !!jeu.impeccable(val, ctx);
        const reussi = impeccable || !!jeu.reussi(val, ctx);
        const points = BAREME.jourJoue
            + (reussi ? BAREME.jourReussi : 0)
            + (impeccable ? BAREME.jourImpeccable : 0);

        // ⚠️ Un jeu ne compte qu'UNE fois par jour, à sa meilleure manche.
        // La Géographie a trois modes et les Mots Fléchés ont eu trois
        // niveaux : sans cette règle, les faire tous vaudrait trois jeux.
        const k = pseudo + '|' + date + '|' + jeu.id;
        const avant = manches.get(k);
        if (avant && avant.points >= points) continue;
        manches.set(k, { pseudo, points, reussi, impeccable });

        const kJour = pseudo + '|' + date;
        if (!jeuxDuJour.has(kJour)) jeuxDuJour.set(kJour, new Set());
        jeuxDuJour.get(kJour).add(jeu.id);
    }
    for (const m of manches.values()) {
        const ligne = parPseudo.get(m.pseudo);
        ligne.points += m.points;
        ligne.manches++;
        if (m.reussi) ligne.reussites++;
        if (m.impeccable) ligne.impeccables++;
    }

    // --- Le grand chelem : tous les jeux du jour dans la même journée ---
    for (const [k, faits] of jeuxDuJour) {
        if (faits.size < JEUX_DU_JOUR.length) continue;
        const ligne = parPseudo.get(k.split('|')[0]);
        if (!ligne) continue;
        ligne.chelems++;
        ligne.points += BAREME.chelem;
    }

    // --- Les parties à plusieurs ---
    // `admin:gameHistory` horodate chaque partie terminée et, depuis la V2,
    // nomme ses vainqueurs : une victoire compte donc dans toutes les
    // périodes, et plus seulement « depuis toujours ».
    const histo = Array.isArray(cache['admin:gameHistory']) ? cache['admin:gameHistory'] : [];
    for (const g of histo) {
        if (!g || !g.endedAt || g.endedAt < debutTs) continue;
        // Une partie jouée seul (ou contre l'ordinateur) ne compte pas : sinon
        // le plus court chemin vers la tête du classement serait d'ouvrir des
        // tables vides, ce qui est exactement l'inverse du but.
        if (g.solo) continue;
        const gagnants = new Set(g.winners || []);
        for (const brut of (g.players || [])) {
            const pseudo = typeof brut === 'string' ? brut : (brut && brut.pseudo);
            const nom = parPseudo.has(pseudo) ? pseudo : parNorm.get(norm(pseudo));
            const ligne = parPseudo.get(nom);
            if (!ligne) continue;
            ligne.parties++;
            ligne.points += BAREME.partieJouee;
            if (gagnants.has(pseudo) || gagnants.has(nom)) {
                ligne.victoires++;
                ligne.points += BAREME.partieGagnee;
            }
        }
    }

    // --- Les défis ---
    // Chaque manche porte son `finiA`, et le palmarès dit qui l'a remportée.
    for (const [cle, val] of Object.entries(cache)) {
        if (!val || typeof val !== 'object') continue;
        const seg = cle.split(':');
        if (seg[0] !== 'defi' || seg[1] !== 'prog' || seg.length !== 4) continue;
        if (!val.fini || !val.finiA || val.finiA < debutTs) continue;
        const ligne = parPseudo.get(seg[3]);
        if (!ligne) continue;
        const stats = cache[`defi:stats:${seg[3]}`];
        const gagne = !!(stats && Array.isArray(stats.defisGagnes) && stats.defisGagnes.includes(seg[2]));
        ligne.parties++;
        ligne.points += BAREME.partieJouee;
        if (gagne) { ligne.victoires++; ligne.points += BAREME.partieGagnee; }
    }

    return [...parPseudo.values()]
        .filter(l => l.points > 0)
        .sort((a, b) => b.points - a.points
            || b.impeccables - a.impeccables
            || a.pseudo.localeCompare(b.pseudo, 'fr'));
}

/**
 * Le barème mis en mots, pour le panneau « Comment ça compte ? ».
 * Construit depuis les mêmes constantes et la même table que le calcul :
 * les deux ne peuvent pas diverger.
 */
function explications() {
    const parfait = BAREME.jourJoue + BAREME.jourReussi + BAREME.jourImpeccable;
    return {
        resume: [
            `Jouer une manche : ${BAREME.jourJoue} point.`,
            `La réussir : ${BAREME.jourReussi} de plus.`,
            `La jouer impeccablement : encore ${BAREME.jourImpeccable}.`,
            `Une manche vaut donc ${BAREME.jourJoue}, ${BAREME.jourJoue + BAREME.jourReussi} ou ${parfait} points.`,
        ],
        jeux: JEUX_DU_JOUR.map(j => ({
            emoji: j.emoji, nom: j.nom, reussi: j.ditReussi, impeccable: j.ditImpeccable,
        })),
        autres: [
            { quoi: 'Une partie à plusieurs, jouée', points: BAREME.partieJouee },
            { quoi: 'Une partie à plusieurs, gagnée', points: BAREME.partieJouee + BAREME.partieGagnee },
            { quoi: 'Un défi, joué', points: BAREME.partieJouee },
            { quoi: 'Un défi, remporté', points: BAREME.partieJouee + BAREME.partieGagnee },
            { quoi: `Les ${JEUX_DU_JOUR.length} jeux du jour dans la même journée`, points: BAREME.chelem },
        ],
        notes: [
            'Un jeu ne compte qu’une fois par jour : faire les trois modes de la Géographie ne vaut pas trois jeux, c’est la meilleure manche qui compte.',
            'La série de jours ne rapporte aucun point — elle se voit à côté de ton nom, elle ne s’achète pas.',
            'Une partie jouée seul, ou contre l’ordinateur, ne compte pas : on ne gagne pas contre personne.',
            'À égalité en tête, personne ne gagne la partie — mais tout le monde l’a jouée.',
        ],
    };
}

module.exports = { calculerClassement, explications, BAREME, PERIODES, JEUX_DU_JOUR };
