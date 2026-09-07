// =====================================================================
//  GÉOGRAPHIE — le pays mystère et le drapeau mystère
//
//  Deux modes, un seul jeu du jour, la même mécanique de recherche :
//   · Silhouette — le contour d'un pays, sans nom ni frontière ;
//   · Drapeau    — le drapeau, en emoji, donc sans aucun fichier à servir.
//
//  Dans les deux cas, chaque proposition renvoie la distance à vol d'oiseau,
//  la direction et un pourcentage de proximité. C'est ce qui rend un pays
//  méconnu trouvable par triangulation plutôt que par pur hasard, et c'est
//  aussi ce qui rend le mode Drapeau jouable : sans ces indices, un drapeau
//  qu'on ne connaît pas n'est qu'une loterie.
// =====================================================================

const PAYS = require('./pays');

const R = 6371;                       // rayon de la Terre, en kilomètres
const MAX_KM = Math.PI * R;           // deux points antipodaux
const rad = (d) => d * Math.PI / 180;

const parCode = new Map(PAYS.map(p => [p.code, p]));

// Le drapeau en emoji : deux lettres converties en indicateurs régionaux.
// Aucun fichier à charger, aucun droit à vérifier, et le rendu est net sur
// les téléphones — ce qui est l'écran de tout le monde ici.
function drapeau(code) {
    return String.fromCodePoint(...[...code].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
}

// Distance orthodromique. La formule de haversine plutôt que la loi des
// cosinus : la seconde perd toute précision sur les courtes distances, et
// deux pays voisins sont exactement le cas qui compte.
function distanceKm(a, b) {
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2
        + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))));
}

// Le cap, ramené à huit flèches. Plus fin serait illisible, moins fin
// n'orienterait plus rien.
const FLECHES = ['⬆️', '↗️', '➡️', '↘️', '⬇️', '↙️', '⬅️', '↖️'];
function direction(a, b) {
    if (a.code === b.code) return '🎯';
    const dLon = rad(b.lon - a.lon);
    const y = Math.sin(dLon) * Math.cos(rad(b.lat));
    const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat))
        - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(dLon);
    const cap = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    return FLECHES[Math.round(cap / 45) % 8];
}

// La proximité en pourcentage. L'échelle est volontairement resserrée : sur une
// échelle linéaire, deux pays du même continent afficheraient déjà 85 %, et le
// chiffre ne dirait plus rien. La racine étire le haut de l'échelle, là où se
// joue la fin de la partie.
function proximite(km) {
    if (km === 0) return 100;
    const part = Math.max(0, 1 - km / MAX_KM);
    return Math.round(Math.pow(part, 2.2) * 100);
}

// ---------- Le tirage du jour ----------
// Silhouette : uniquement des pays souverains qui ont un tracé. Drapeau : tous
// les pays souverains, y compris ceux qui sont trop petits pour une silhouette.
// La superficie pondère le tirage — un pays vaste est en général plus connu —
// mais faiblement (racine quatrième), parce que les indices de distance
// suffisent à rendre un pays méconnu trouvable, et qu'un tirage trop sage
// donnerait toujours les mêmes vingt pays.
function pool(mode) {
    return PAYS.filter(p => p.souverain && (mode === 'drapeau' || p.chemin));
}
function tirer(mode, hasard) {
    const liste = pool(mode);
    const poids = liste.map(p => Math.pow(Math.max(p.aire, 1), 0.25));
    const total = poids.reduce((s, x) => s + x, 0);
    let seuil = hasard() * total;
    for (let i = 0; i < liste.length; i++) {
        seuil -= poids[i];
        if (seuil <= 0) return liste[i];
    }
    return liste[liste.length - 1];
}

// Deux jours de suite sur le même pays serait décevant : on rejette ceux des
// jours précédents, comme le Motus le fait pour ses mots.
function tirerSansRepeter(mode, hasard, recents) {
    const exclus = new Set(recents || []);
    for (let i = 0; i < 40; i++) {
        const p = tirer(mode, hasard);
        if (!exclus.has(p.code)) return p;
    }
    return tirer(mode, hasard);
}

// ---------- Une proposition ----------
// `null` si le nom ne correspond à rien : le serveur refuse alors le coup au
// lieu de le compter, pour qu'une faute de frappe ne coûte pas un essai.
function trouverPays(saisie) {
    const n = normaliser(saisie);
    if (!n) return null;
    return PAYS.find(p => normaliser(p.nom) === n)
        || PAYS.find(p => p.code === String(saisie).toUpperCase().trim())
        || null;
}
function normaliser(s) {
    return String(s || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function evaluer(codePropose, codeCible) {
    const a = parCode.get(codePropose), b = parCode.get(codeCible);
    if (!a || !b) return null;
    const km = distanceKm(a, b);
    return {
        code: a.code, nom: a.nom, drapeau: drapeau(a.code),
        km, direction: direction(a, b), proximite: proximite(km),
        juste: a.code === b.code,
        // Un pays frontalier, c'est brûlant : on le dit, la distance seule ne
        // le montre pas toujours (deux capitales peuvent être loin l'une de
        // l'autre alors que les pays se touchent).
        voisin: !!(b.voisins || []).includes(a.code),
    };
}

// La liste servie au navigateur pour l'autocomplétion : juste ce qu'il faut
// pour chercher et afficher, pas les silhouettes — sinon on enverrait 185 Ko
// et on donnerait la réponse du jour par la même occasion.
function listeDesNoms() {
    return PAYS.map(p => ({ code: p.code, nom: p.nom }));
}

// Le score : six essais, et plus on trouve tôt, plus ça rapporte. Zéro si on
// échoue — comme aux autres jeux du jour, une partie ratée reste une partie
// jouée, pas des points.
const MAX_ESSAIS = 6;
function score(essais, trouve) {
    if (!trouve) return 0;
    return Math.max(1, MAX_ESSAIS + 1 - essais) * 2;
}

module.exports = {
    PAYS, parCode, MAX_ESSAIS,
    drapeau, distanceKm, direction, proximite,
    tirer, tirerSansRepeter, trouverPays, normaliser, evaluer, listeDesNoms, score,
};
