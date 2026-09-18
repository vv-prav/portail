// =====================================================================
//  GÉOGRAPHIE — le pays mystère, le drapeau mystère, et le voyage
//
//  Trois modes, un seul jeu du jour. Le voyage a sa propre mécanique, en
//  bas de ce fichier. Les deux premiers partagent la même recherche :
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

// =====================================================================
//  LE VOYAGE — de proche en proche
//
//  Deux pays sont donnés, un départ et une arrivée. On va de l'un à
//  l'autre en ne passant que par des frontières communes : chaque pays
//  proposé doit toucher celui où l'on se trouve. On arrive dès qu'on pose
//  le pied dans un pays voisin de l'arrivée.
//
//  Aucune donnée nouvelle : `pays.js` connaît déjà les voisins de 159
//  pays, et le plus court chemin se calcule en largeur d'abord.
// =====================================================================

// ⚠️ Le graphe est rendu SYMÉTRIQUE. La base comporte une frontière déclarée
// d'un seul côté : sans cette précaution, aller de A vers B serait permis et
// revenir de B vers A refusé, et le plus court chemin affiché à la fin
// pourrait être un chemin que le joueur n'avait pas le droit d'emprunter.
const VOISINS = new Map(PAYS.map(p => [p.code, new Set()]));
for (const p of PAYS) {
    for (const v of (p.voisins || [])) {
        if (!parCode.has(v)) continue;          // territoires absents de la base (Gibraltar, Guyane…)
        VOISINS.get(p.code).add(v);
        VOISINS.get(v).add(p.code);
    }
}
const sontVoisins = (a, b) => !!(VOISINS.get(a) && VOISINS.get(a).has(b));

// Distances (en nombre de frontières) depuis un pays vers tous les autres,
// et le chemin qui y mène. Largeur d'abord : 211 nœuds, c'est instantané.
function parcours(depart) {
    const dist = new Map([[depart, 0]]);
    const avant = new Map();
    const file = [depart];
    while (file.length) {
        const x = file.shift();
        for (const v of VOISINS.get(x) || []) {
            if (dist.has(v)) continue;
            dist.set(v, dist.get(x) + 1);
            avant.set(v, x);
            file.push(v);
        }
    }
    return { dist, avant };
}
function plusCourtChemin(a, b) {
    const { avant } = parcours(a);
    if (a !== b && !avant.has(b)) return null;
    const chemin = [b];
    while (chemin[0] !== a) chemin.unshift(avant.get(chemin[0]));
    return chemin;
}

// Réglages du voyage. `MIN`/`MAX` bornent le nombre de frontières entre
// les deux pays : à deux, on traverse un seul pays et c'est trop facile ;
// au-delà de cinq, le trajet traverse des régions que presque personne ne
// connaît assez pour s'y orienter (essayé : « Myanmar → Monténégro », par la
// Chine, la Russie, l'Ukraine, la Hongrie et la Croatie).
const VOYAGE = {
    MIN_FRONTIERES: 3,      // donc au moins 2 pays à traverser
    MAX_FRONTIERES: 5,      // donc au plus 4
    MAX_ERREURS: 3,         // pays proposés qui ne touchent pas celui où l'on est
    MARGE: 6,               // étapes permises au-delà du plus court chemin
};

// Le tirage : départ et arrivée souverains, pondérés par la superficie comme
// les autres modes (un grand pays est en général plus connu), reliés par un
// nombre raisonnable de frontières. On évite de reprendre un départ ou une
// arrivée des jours précédents.
function tirerVoyage(hasard, recents) {
    const exclus = new Set(recents || []);
    const candidats = PAYS.filter(p => p.souverain && VOISINS.get(p.code).size);
    const poids = (p) => Math.pow(Math.max(p.aire, 1), 0.25);
    const choisir = (liste) => {
        const total = liste.reduce((s, p) => s + poids(p), 0);
        let seuil = hasard() * total;
        for (const p of liste) { seuil -= poids(p); if (seuil <= 0) return p; }
        return liste[liste.length - 1];
    };
    let secours = null;
    for (let essai = 0; essai < 80; essai++) {
        const de = choisir(candidats);
        const { dist } = parcours(de.code);
        const arrivees = candidats.filter(p => {
            const d = dist.get(p.code);
            return d >= VOYAGE.MIN_FRONTIERES && d <= VOYAGE.MAX_FRONTIERES;
        });
        if (!arrivees.length) continue;
        const a = choisir(arrivees);
        const chemin = plusCourtChemin(de.code, a.code);
        const voyage = { de: de.code, a: a.code, chemin, optimal: chemin.length - 2 };
        if (exclus.has(de.code) || exclus.has(a.code)) { secours = secours || voyage; continue; }
        return voyage;
    }
    return secours;
}

// Le score : douze points pour un trajet parfait, comme un pays trouvé du
// premier coup dans les autres modes. Chaque détour et chaque erreur en
// coûtent deux ; arriver rapporte toujours quelque chose.
function scoreVoyage(pas, optimal, erreurs, arrive) {
    if (!arrive) return 0;
    return Math.max(2, 12 - 2 * Math.max(0, pas - optimal) - 2 * erreurs);
}

module.exports = {
    PAYS, parCode, MAX_ESSAIS,
    drapeau, distanceKm, direction, proximite,
    tirer, tirerSansRepeter, trouverPays, normaliser, evaluer, listeDesNoms, score,
    VOYAGE, sontVoisins, plusCourtChemin, parcours, tirerVoyage, scoreVoyage,
};
