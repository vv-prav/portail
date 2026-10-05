// =====================================================================
//  LA CARTE — trouver le pays du jour en le montrant du doigt
//
//  Un nom est donné, on le cherche sur une carte du monde. Une erreur ne
//  renvoie QUE la direction : une rose des vents qui tourne et s'arrête
//  sur le cap du pays cherché. Pas de distance, et c'est voulu — deux
//  relèvements suffisent à trianguler, ce qui fait un vrai puzzle plutôt
//  qu'un jeu du chaud-froid.
//
//  ⚠️ Ce jeu ne ressemble au mode « Le pays » de la Géographie qu'en
//  surface. Là-bas on écrit un nom et on reçoit une distance ; ici on
//  montre un endroit et on reçoit un cap. L'un teste ce qu'on sait nommer,
//  l'autre ce qu'on sait situer — et ce n'est pas la même chose.
//
//  Les données de tracé vivent dans public/carte/monde.js, le seul fichier
//  de données du salon envoyé au navigateur : le jeu consiste à montrer la
//  carte, elle ne peut pas rester sur le serveur. Elle ne dit rien du pays
//  du jour pour autant.
// =====================================================================
const PAYS = require('../geo/pays');

const parCode = new Map(PAYS.map(p => [p.code, p]));
const rad = (d) => d * Math.PI / 180;

// ---------- Le tirage du jour ----------
// Mêmes règles que la Géographie, et c'est volontaire : un pays souverain
// qui a un tracé, pondéré faiblement par la superficie (racine quatrième).
// Deux barèmes différents pour « quel pays tombe aujourd'hui » dans le même
// salon, ce serait deux réponses à la même question.
function pool() {
    return PAYS.filter(p => p.souverain && p.chemin);
}
function tirer(hasard) {
    const liste = pool();
    const poids = liste.map(p => Math.pow(Math.max(p.aire, 1), 0.25));
    const total = poids.reduce((s, x) => s + x, 0);
    let seuil = hasard() * total;
    for (let i = 0; i < liste.length; i++) {
        seuil -= poids[i];
        if (seuil <= 0) return liste[i];
    }
    return liste[liste.length - 1];
}
function paysDuJour(hasard, recents) {
    const exclus = new Set(recents || []);
    for (let i = 0; i < 40; i++) {
        const p = tirer(hasard);
        if (!exclus.has(p.code)) return p;
    }
    return tirer(hasard);
}

// ---------- Le cap ----------
//
// ⚠️⚠️ **Le cap est calculé SUR LA CARTE, pas sur le globe.** C'est la
// décision la plus importante du jeu, et elle n'est pas intuitive.
//
// Le cap orthodromique — le vrai, celui d'une boussole — répond « NORD »
// quand on va de la France aux Samoa : le plus court chemin passe par le
// pôle. C'est exact, et c'est inutilisable ici. Le joueur a une carte plate
// sous les yeux, il suit la flèche du doigt, et les Samoa sont tout à
// l'ouest. Avec le cap réel, la flèche l'enverrait vers l'Arctique et deux
// relèvements ne se croiseraient nulle part — or croiser deux relèvements
// est tout le jeu, puisqu'on ne donne aucune distance.
//
// On mesure donc l'angle entre les deux pays DANS LE REPÈRE DE LA CARTE
// (`carte/centres.js`, généré avec elle). La flèche désigne alors ce que
// l'œil voit, et deux flèches se croisent sur la bonne case.
//
// L'angle exact est renvoyé en plus des huit secteurs : c'est lui que
// l'aiguille de la rose des vents vise. L'arrondir à 45° ferait mentir
// l'animation d'un demi-secteur.
const CENTRES = require('./centres');
const CARDINAUX = ['NORD', 'NORD-EST', 'EST', 'SUD-EST', 'SUD', 'SUD-OUEST', 'OUEST', 'NORD-OUEST'];
const FLECHES = ['⬆️', '↗️', '➡️', '↘️', '⬇️', '↙️', '⬅️', '↖️'];
function cap(a, b) {
    const A = CENTRES[a.code], B = CENTRES[b.code];
    if (!A || !B) return 0;
    // Dans un SVG, y descend : d'où le -dy pour que 0° soit le nord.
    const dx = B[0] - A[0], dy = B[1] - A[1];
    return (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
}

/**
 * Évalue un pays montré du doigt.
 * ⚠️ Ne renvoie RIEN sur la cible : ni son nom, ni sa distance, ni sa
 * région. Seulement le cap depuis l'endroit montré — c'est la règle du jeu.
 */
function evaluer(codeMontre, codeCible) {
    const a = parCode.get(codeMontre), b = parCode.get(codeCible);
    if (!a || !b) return null;
    if (a.code === b.code) {
        return { code: a.code, nom: a.nom, juste: true, angle: null, cardinal: 'ici', fleche: '🎯' };
    }
    const angle = cap(a, b);
    const secteur = Math.round(angle / 45) % 8;
    return {
        code: a.code, nom: a.nom, juste: false,
        angle: Math.round(angle),
        cardinal: CARDINAUX[secteur],
        fleche: FLECHES[secteur],
        // Un pays frontalier, c'est brûlant, et la direction seule ne le dit
        // pas : deux pays voisins peuvent avoir des centres très éloignés.
        voisin: !!(b.voisins || []).includes(a.code),
    };
}

const MAX_ESSAIS = 6;
// Même barème que la Géographie et les Capitales : 12 points au premier
// essai, 2 au sixième. Les jeux du jour se comparent sans conversion.
function score(essais, trouve) {
    if (!trouve) return 0;
    return Math.max(1, MAX_ESSAIS + 1 - essais) * 2;
}

module.exports = { PAYS, parCode, pool, paysDuJour, evaluer, cap, score, MAX_ESSAIS, CARDINAUX };
