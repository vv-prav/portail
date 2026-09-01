// =====================================================================
//  LE CLASSEMENT DU SALON — un score transversal, tous jeux confondus
//
//  Chaque app a son propre classement, et aucun ne parle aux autres :
//  le salon n'est qu'un couloir vers onze jeux séparés. Ce module en
//  fait un lieu, avec un podium commun.
//
//  Il ne stocke RIEN : tout est recalculé à la demande depuis les clés
//  déjà en base. Pas de nouvelle donnée à maintenir, pas de migration,
//  et un barème qu'on peut changer sans rien réécrire.
//
//  Le barème est volontairement isolé ci-dessous : c'est un choix de
//  jeu, pas une contrainte technique. Il part de deux idées simples —
//  jouer rapporte, gagner rapporte plus — et évite de récompenser le
//  seul acharnement.
// =====================================================================

const BAREME = {
    // Jeux du jour : un mot trouvé vaut plus qu'une tentative honnête.
    jourTrouve: 3,
    jourJoue: 1,
    // Multijoueur : une victoire vaut une partie gagnée contre de vraies personnes.
    matchGagne: 5,
    matchJoue: 1,
    // Une série récompense la régularité, qui est ce qui fait vivre le salon.
    parJourDeSerie: 2,
};

// Même normalisation que Yams et Petit Bac, qui indexent leurs stats ainsi.
function norm(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
}

/**
 * Calcule le classement complet.
 *
 * @param {object} cache   l'objet clé → valeur (mfCache)
 * @param {string[]} pseudos les comptes à classer
 * @param {object} series  { [pseudo]: nombre } séries en cours, tous jeux du jour
 * @returns {Array} lignes triées par points décroissants
 */
function calculerClassement(cache, pseudos, series) {
    const parPseudo = new Map();
    for (const p of pseudos) {
        parPseudo.set(p, {
            pseudo: p, points: 0,
            jourTrouves: 0, jourJoues: 0,
            matchsGagnes: 0, matchsJoues: 0,
            serie: (series && series[p]) || 0,
        });
    }
    // Index normalisé → pseudo, pour retrouver le compte derrière yams:stats:ALIX.
    const parNorm = new Map();
    for (const p of pseudos) parNorm.set(norm(p), p);

    // --- Jeux du jour : une clé de progression par joueur et par date ---
    for (const [cle, val] of Object.entries(cache)) {
        if (!val || typeof val !== 'object') continue;
        const seg = cle.split(':');
        if (seg[1] !== 'prog') continue;
        if (!['motus', 'mf', 'mj'].includes(seg[0])) continue;
        const ligne = parPseudo.get(seg[2]);
        if (!ligne) continue;                       // compte supprimé depuis
        if (val.solved) { ligne.jourTrouves++; ligne.points += BAREME.jourTrouve; }
        else { ligne.jourJoues++; ligne.points += BAREME.jourJoue; }
    }

    // --- Multijoueur : des totaux cumulés, pas des clés datées ---
    const MULTI = [
        { prefixe: 'pbac:stats', normalise: true,  joues: 'gamesPlayed',   gagnes: 'gamesWon' },
        { prefixe: 'yams:stats', normalise: true,  joues: 'gamesPlayed',   gagnes: 'gamesWon' },
        { prefixe: 'motusparty:stats', normalise: false, joues: 'matchesPlayed', gagnes: 'matchesWon' },
    ];
    for (const [cle, val] of Object.entries(cache)) {
        if (!val || typeof val !== 'object') continue;
        const famille = cle.split(':').slice(0, 2).join(':');
        const conf = MULTI.find(m => m.prefixe === famille);
        if (!conf) continue;
        const cible = cle.split(':')[2];
        const pseudo = conf.normalise ? parNorm.get(cible) : cible;
        const ligne = parPseudo.get(pseudo);
        if (!ligne) continue;
        const joues = Number(val[conf.joues]) || 0;
        const gagnes = Number(val[conf.gagnes]) || 0;
        ligne.matchsJoues += joues;
        ligne.matchsGagnes += gagnes;
        // Une victoire ne compte pas deux fois : elle vaut matchGagne, pas
        // matchGagne + matchJoue.
        ligne.points += gagnes * BAREME.matchGagne + Math.max(0, joues - gagnes) * BAREME.matchJoue;
    }

    // --- Régularité ---
    for (const ligne of parPseudo.values()) {
        if (ligne.serie > 1) ligne.points += ligne.serie * BAREME.parJourDeSerie;
    }

    return [...parPseudo.values()]
        .filter(l => l.points > 0)
        .sort((a, b) => b.points - a.points || a.pseudo.localeCompare(b.pseudo));
}

module.exports = { calculerClassement, BAREME };
