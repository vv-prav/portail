// =====================================================================
//  LE VERROU ANTI-COLLISION DES JEUX DE GÉOGRAPHIE
//
//  Cinq jeux du jour tirent dans le même vivier de pays, et chacun se
//  protégeait des répétitions CHEZ LUI en ignorant les quatre autres.
//  Mesuré sur 180 jours avec les vraies graines : **six collisions, soit
//  une tous les trente jours**.
//
//      2026-11-23 · Le pays + Les capitales → Chine
//      2027-01-10 · Le pays + La carte      → Lesotho
//      2027-02-19 · La carte + Les capitales → Roumanie
//
//  Faire l'un donnait l'autre : la silhouette de la Chine le matin, et
//  Pékin tombait tout seul l'après-midi.
//
//  Principe : le premier jeu qui tire un jour donné pose sa réponse en
//  base (il le faisait déjà, pour que le pays ne change pas d'une
//  ouverture à l'autre). Les suivants lisent ce qui est pris et
//  l'évitent. ⚠️ Donc rien ici n'est « réservé d'avance » : on ne fait
//  que lire les clés que chaque jeu écrit déjà.
//
//  ⚠️ Et la garde anti-répétition passe à TRENTE jours partout. La
//  Géographie le faisait depuis toujours — zéro répétition sur 180
//  jours ; La carte se contentait de six jours (11 répétitions) et Les
//  capitales n'avaient aucune garde (12 répétitions, dont la même ville
//  à sept jours d'écart).
// =====================================================================

// Les clés où chaque jeu range le pays de sa journée.
const CLES = [
    (d) => `geo:pays:silhouette:${d}`,
    (d) => `geo:pays:drapeau:${d}`,
    (d) => `geo:pays:voyage:${d}`,       // « PT>PL » : deux pays d'un coup
    (d) => `capitales:ville:${d}`,
    (d) => `carte:pays:${d}`,
];

// Le nombre de jours pendant lesquels un pays ne doit pas revenir, dans le
// même jeu. Trente, c'est la valeur que la Géographie utilisait déjà et qui
// lui donne zéro répétition.
const JOURS_SANS_REPETITION = 30;

/**
 * Les pays déjà pris par un autre jeu de géographie, ce jour-là.
 * @param {function} get   le lecteur du cache (mfGet)
 * @param {string} date    AAAA-MM-JJ
 * @param {string} sauf    la clé du jeu qui pose la question (il ne se
 *                         bloque pas lui-même en rejouant la même journée)
 */
function prisCeJour(get, date, sauf) {
    const pris = new Set();
    for (const cle of CLES) {
        const k = cle(date);
        if (k === sauf) continue;
        const v = get(k);
        if (!v) continue;
        // Le voyage range un départ et une arrivée dans la même valeur.
        for (const code of String(v).split('>')) if (code) pris.add(code);
    }
    return pris;
}

/**
 * Tout ce qu'un tirage doit éviter : les pays sortis récemment dans le même
 * jeu, et ceux qu'un autre jeu a déjà pris aujourd'hui.
 * @param {function} get      le lecteur du cache
 * @param {function} shift    le décalage de date (mfShiftDay)
 * @param {string} date       le jour tiré
 * @param {function} cleDuJeu (date) => la clé où CE jeu range son pays
 */
function aEviter(get, shift, date, cleDuJeu) {
    const out = [];
    for (let i = 1; i <= JOURS_SANS_REPETITION; i++) {
        const v = get(cleDuJeu(shift(date, -i)));
        if (v) for (const code of String(v).split('>')) if (code) out.push(code);
    }
    for (const code of prisCeJour(get, date, cleDuJeu(date))) out.push(code);
    return out;
}

module.exports = { prisCeJour, aEviter, JOURS_SANS_REPETITION };
