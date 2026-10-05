// =====================================================================
//  LE SOCLE COMMUN DES JEUX DE GÉOGRAPHIE
//
//  Cinq jeux du jour tournent autour de `geo/pays.js` — Le pays, Le
//  drapeau, Le voyage, Les capitales, La carte — et ils calculaient
//  chacun les mêmes choses dans leur coin. L'audit a compté :
//    · `score()` écrit TROIS fois, à l'identique ;
//    · `normaliser()` quatre fois (deux serveurs, deux navigateurs) ;
//    · `distanceKm()` et le rayon terrestre deux fois ;
//    · les huit flèches et les huit cardinaux trois fois.
//
//  Cinq occasions de diverger en silence. Un barème corrigé dans un
//  fichier sur trois, et deux jeux ne comptent plus pareil sans que rien
//  ne le signale. Tout ce qui est ici est donc la SEULE version.
//
//  ⚠️ Ce module ne connaît aucun jeu en particulier : il ne contient que
//  ce qui serait identique dans les cinq. Ce qui est propre à un jeu
//  (le vivier de tirage, la façon de juger une proposition) reste chez
//  lui.
// =====================================================================

const R = 6371;                       // le rayon de la Terre, en kilomètres
const rad = (d) => d * Math.PI / 180;

// ---------------------------------------------------------------------
//  LES NOMS
// ---------------------------------------------------------------------
// Accents, casse et ponctuation ignorés : « coree du sud » doit trouver la
// Corée du Sud, et personne ne tape les accents sur un téléphone.
function normaliser(s) {
    return String(s || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

// Le drapeau d'un pays à partir de son code : deux lettres d'indicatif
// régional, que la police du téléphone assemble en un drapeau.
function drapeau(code) {
    return String.fromCodePoint(...[...String(code)].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
}

// ---------------------------------------------------------------------
//  LES DISTANCES ET LES CAPS
// ---------------------------------------------------------------------
// Haversine plutôt que la loi des cosinus : la seconde perd toute
// précision sur les courtes distances, et deux pays voisins sont
// exactement le cas qui compte.
function distanceKm(a, b) {
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2
        + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))));
}

// Huit secteurs : plus fin serait illisible, moins fin n'orienterait plus
// rien. L'ordre des deux tableaux suit les degrés, de 0 (nord) à 315.
const FLECHES = ['⬆️', '↗️', '➡️', '↘️', '⬇️', '↙️', '⬅️', '↖️'];
const CARDINAUX = ['NORD', 'NORD-EST', 'EST', 'SUD-EST', 'SUD', 'SUD-OUEST', 'OUEST', 'NORD-OUEST'];
const secteurDe = (angle) => Math.round(((angle % 360) + 360) % 360 / 45) % 8;

// Le cap sur le GLOBE, celui d'une boussole. C'est le bon pour qui pense en
// termes de « dans quelle direction est ce pays », et c'est celui du Pays,
// du Drapeau et des Capitales.
function capReel(a, b) {
    const dLon = rad(b.lon - a.lon);
    const y = Math.sin(dLon) * Math.cos(rad(b.lat));
    const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat))
        - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(dLon);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// ⚠️ Le cap SUR LA CARTE, qui n'est pas le même. Le cap réel répond
// « NORD » pour aller de la France aux Samoa, puisque le plus court chemin
// passe par le pôle : exact, et inutilisable devant une carte plate où les
// Samoa sont à l'ouest. Tout jeu qui demande de montrer un endroit sur la
// carte doit utiliser celui-ci, et lui seul.
// `A` et `B` sont des points [x, y] du repère de la carte (y vers le bas,
// d'où le -dy pour que 0° soit le nord).
function capSurCarte(A, B) {
    if (!A || !B) return 0;
    return (Math.atan2(B[0] - A[0], -(B[1] - A[1])) * 180 / Math.PI + 360) % 360;
}

// Un cap complet, prêt à être affiché : l'angle exact pour l'aiguille de la
// rose des vents, et le secteur pour le mot. ⚠️ L'angle n'est jamais
// arrondi à 45° : l'aiguille mentirait d'un demi-secteur, et deux
// relèvements ne se croiseraient plus au bon endroit.
function capComplet(angle) {
    const i = secteurDe(angle);
    return { angle: Math.round(angle), fleche: FLECHES[i], cardinal: CARDINAUX[i] };
}

// ---------------------------------------------------------------------
//  LE BARÈME
// ---------------------------------------------------------------------
// ⚠️ UN SEUL barème pour toute la famille : trouver au premier essai vaut
// 12 points, au sixième 2, échouer 0. Les cinq jeux se comparent ainsi sans
// conversion, et le classement du Salon n'a pas à savoir lequel on a joué.
const MAX_ESSAIS = 6;
function score(essais, trouve, maxEssais) {
    if (!trouve) return 0;
    const max = maxEssais || MAX_ESSAIS;
    return Math.max(1, max + 1 - essais) * 2;
}

module.exports = {
    R, rad, normaliser, drapeau,
    distanceKm, FLECHES, CARDINAUX, secteurDe,
    capReel, capSurCarte, capComplet,
    MAX_ESSAIS, score,
};
