// =====================================================================
//  RENOMMAGE D'UN COMPTE — migration des données associées
//
//  Historiquement, changer de pseudo ne migrait rien : toutes les stats
//  restaient sous l'ancien nom. La raison affichée était que ça touchait
//  trop de systèmes pour le faire sans risque. Ce module concentre ce
//  risque en un seul endroit, testable hors du serveur.
//
//  Ce qu'il faut savoir avant de toucher à ce fichier — vérifié sur un
//  export réel de la base (320 clés) :
//
//   • Le pseudo n'est pas toujours au même endroit. Il est en 3ᵉ segment
//     pour motus:prog:<pseudo>:<date>, mais mf:hist:<date> a une DATE au
//     même rang. On ne peut donc pas supposer « segment 2 = pseudo » :
//     on compare la valeur, jamais la position seule.
//   • Yams et Petit Bac indexent par pseudo NORMALISÉ (yams:stats:ALIX),
//     Motus Party par pseudo brut (motusparty:stats:VicoW).
//   • Les listes d'index (yams:statsIndex, pbac:statsIndex) contiennent
//     en revanche des pseudos BRUTS.
//   • Le pseudo apparaît aussi dans des VALEURS : classements (champ u),
//     discussions (champ u), historique admin (players[], winner), et
//     les clés de l'objet vsOpponent des stats Yams.
//
//  On ne fait jamais de remplacement de chaîne aveugle : un message de
//  discussion citant le pseudo de quelqu'un ne doit pas être réécrit.
// =====================================================================

// Même normalisation que yams/game.js et pbac/game.js.
function norm(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
}

// Familles de clés dont le 3ᵉ segment est un pseudo brut.
const PREFIXES_BRUTS = [
    'motus:prog', 'motus:days', 'motus:beststreak',
    'mf:prog', 'mf:days',
    'mj:prog', 'mj:days',
    'motusparty:stats',
];
// Familles dont le 3ᵉ segment est un pseudo normalisé.
const PREFIXES_NORMALISES = ['yams:stats', 'pbac:stats'];

// Familles dont la valeur est une liste d'entrées portant un champ `u`.
const VALEURS_AVEC_U = /^(motus|mf|mj):(board|cmt):/;
// Listes d'index : de simples tableaux de pseudos bruts.
const LISTES_INDEX = new Set(['yams:statsIndex', 'pbac:statsIndex']);

/**
 * Calcule — sans rien appliquer — tout ce qu'un renommage impliquerait.
 * Séparer le calcul de l'application permet de le tester hors serveur et
 * de refuser proprement une migration qui écraserait des données.
 *
 * @param {object} cache  l'objet clé → valeur (mfCache)
 * @param {string} ancien pseudo actuel
 * @param {string} nouveau pseudo souhaité
 * @returns {{renommages: Array, reecritures: Array, collisions: Array}}
 */
function planifierRenommage(cache, ancien, nouveau) {
    const renommages = [];   // { de, vers }
    const reecritures = [];  // { cle, valeur }
    const collisions = [];   // { de, vers } — destination déjà occupée

    const ancienNorm = norm(ancien);
    const nouveauNorm = norm(nouveau);

    for (const cle of Object.keys(cache)) {
        const seg = cle.split(':');
        const famille = seg.slice(0, 2).join(':');

        // --- 1. Clés à renommer ---
        let cibleSegment = null;
        if (PREFIXES_BRUTS.includes(famille) && seg[2] === ancien) cibleSegment = nouveau;
        else if (PREFIXES_NORMALISES.includes(famille) && seg[2] === ancienNorm) cibleSegment = nouveauNorm;

        if (cibleSegment !== null) {
            if (cibleSegment === seg[2]) continue;            // rien à faire (même forme normalisée)
            const nouvelleCle = [seg[0], seg[1], cibleSegment, ...seg.slice(3)].join(':');
            if (Object.prototype.hasOwnProperty.call(cache, nouvelleCle)) {
                collisions.push({ de: cle, vers: nouvelleCle });
            } else {
                renommages.push({ de: cle, vers: nouvelleCle });
            }
            continue;
        }

        // --- 2. Valeurs à réécrire ---
        const val = cache[cle];
        if (val == null) continue;

        if (VALEURS_AVEC_U.test(cle) && Array.isArray(val)) {
            if (val.some(e => e && e.u === ancien)) {
                reecritures.push({ cle, valeur: val.map(e => (e && e.u === ancien ? { ...e, u: nouveau } : e)) });
            }
            continue;
        }

        if (LISTES_INDEX.has(cle) && Array.isArray(val)) {
            if (val.includes(ancien)) {
                // On dédoublonne : le nouveau pseudo peut déjà figurer dans l'index.
                const remplacee = val.map(p => (p === ancien ? nouveau : p));
                reecritures.push({ cle, valeur: [...new Set(remplacee)] });
            }
            continue;
        }

        if (cle === 'admin:gameHistory' && Array.isArray(val)) {
            let touche = false;
            const liste = val.map(g => {
                if (!g) return g;
                const copie = { ...g };
                if (Array.isArray(g.players) && g.players.includes(ancien)) {
                    copie.players = g.players.map(p => (p === ancien ? nouveau : p));
                    touche = true;
                }
                if (g.winner === ancien) { copie.winner = nouveau; touche = true; }
                return copie;
            });
            if (touche) reecritures.push({ cle, valeur: liste });
            continue;
        }

        // Adversaires nommés dans les stats Yams : les clés de vsOpponent sont
        // des pseudos bruts, y compris dans les stats des AUTRES joueurs.
        if (famille === 'yams:stats' && val && typeof val === 'object' && val.vsOpponent
            && Object.prototype.hasOwnProperty.call(val.vsOpponent, ancien)) {
            const vs = { ...val.vsOpponent };
            const garde = vs[ancien];
            delete vs[ancien];
            // Si le nouveau nom existe déjà comme adversaire, on additionne plutôt
            // que d'écraser : sinon on perdrait des parties.
            vs[nouveau] = vs[nouveau]
                ? { wins: (vs[nouveau].wins || 0) + (garde.wins || 0), losses: (vs[nouveau].losses || 0) + (garde.losses || 0) }
                : garde;
            reecritures.push({ cle, valeur: { ...val, vsOpponent: vs } });
        }
    }

    return { renommages, reecritures, collisions };
}

/**
 * Applique un plan. `set` et `del` sont ceux du serveur, pour que les
 * écritures passent par le cache différé habituel plutôt que par Redis
 * en direct.
 */
function appliquerPlan(cache, plan, set, del) {
    for (const { de, vers } of plan.renommages) {
        set(vers, cache[de]);
        del(de);
    }
    for (const { cle, valeur } of plan.reecritures) set(cle, valeur);
    return {
        clesRenommees: plan.renommages.length,
        valeursReecrites: plan.reecritures.length,
        collisions: plan.collisions.length,
    };
}

module.exports = { planifierRenommage, appliquerPlan, norm };
