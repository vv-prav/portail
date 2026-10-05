// =====================================================================
//  LES CAPITALES — deviner la capitale du jour en six propositions
//
//  Même principe que la Géographie : chaque proposition ne dit pas
//  seulement « non », elle rapproche. Cinq colonnes de comparaison —
//  devise, langue, distance, direction, population — et six essais.
//
//  ⚠️ **On peut taper un PAYS à la place de sa capitale**, et c'est la
//  décision qui rend le jeu jouable. Sans elle, il faudrait connaître le
//  nom de Ngerulmud ou de Nukuʻalofa pour s'en servir comme sonde ; avec
//  elle, on raisonne par pays — ce que tout le monde sait faire — et le
//  jeu répond en capitales. C'est aussi ce qui permet de garder au tirage
//  des capitales qu'on ne saurait pas écrire : on les atteint par leur
//  pays une fois la région trouvée.
//
//  Les couleurs disent la même chose partout : vert c'est juste, orange
//  c'est tiède, rouge c'est froid. Elles sont calculées ICI et envoyées
//  au navigateur ; il ne connaît ni la réponse ni les seuils.
// =====================================================================
const VILLES = require('./villes');

const R = 6371;
const rad = (d) => d * Math.PI / 180;

function normaliser(s) {
    return String(s || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

// ---------------------------------------------------------------------
//  L'INDEX DE SAISIE
//  Une capitale se trouve par son nom, par le nom de son pays, par le nom
//  d'une autre capitale du même pays (Sucre, La Haye, Cotonou) ou par son
//  code ISO. ⚠️ Un nom de ville l'emporte toujours sur un nom de pays :
//  « Mexico » est la capitale du Mexique, pas une façon d'écrire le pays,
//  et les deux se normalisent pareil.
// ---------------------------------------------------------------------
const parCode = new Map(VILLES.map(v => [v.code, v]));
const parNom = new Map();
const ajouter = (cle, v, prioritaire) => {
    const n = normaliser(cle);
    if (!n) return;
    if (!parNom.has(n) || prioritaire) parNom.set(n, v);
};
for (const v of VILLES) ajouter(v.ville, v, true);
for (const v of VILLES) {
    ajouter(v.pays, v, false);
    for (const a of (v.alias || [])) ajouter(a, v, false);
}

function trouver(saisie) {
    const n = normaliser(saisie);
    if (!n) return null;
    return parNom.get(n) || parCode.get(String(saisie).toUpperCase().trim()) || null;
}

// Ce que le navigateur reçoit pour sa liste de suggestions : les capitales
// et les pays, rien d'autre. La réponse du jour n'y est pas distinguable.
function propositions() {
    const out = [];
    for (const v of VILLES) {
        out.push({ v: v.ville, p: v.pays });
        for (const a of (v.alias || [])) out.push({ v: a, p: v.pays, bis: true });
    }
    return out.sort((a, b) => a.v.localeCompare(b.v, 'fr'));
}

// ---------------------------------------------------------------------
//  LES COMPARAISONS
// ---------------------------------------------------------------------
function distanceKm(a, b) {
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2
        + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))));
}

// Le cap, ramené à huit flèches — comme à la Géographie, pour que les deux
// jeux se lisent de la même façon.
const FLECHES = ['⬆️', '↗️', '➡️', '↘️', '⬇️', '↙️', '⬅️', '↖️'];
const CARDINAUX = ['NORD', 'NORD-EST', 'EST', 'SUD-EST', 'SUD', 'SUD-OUEST', 'OUEST', 'NORD-OUEST'];
function direction(a, b) {
    if (a.code === b.code) return { fleche: '🎯', cardinal: 'ici' };
    const dLon = rad(b.lon - a.lon);
    const y = Math.sin(dLon) * Math.cos(rad(b.lat));
    const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat))
        - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(dLon);
    const cap = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    const i = Math.round(cap / 45) % 8;
    return { fleche: FLECHES[i], cardinal: CARDINAUX[i] };
}

// Les seuils de distance. Mille kilomètres, c'est le pays d'à côté en
// Europe et la région en Asie ; trois mille, c'est encore le continent.
// Au-delà, la proposition n'apprend que la direction.
const PRES_KM = 1000, TIEDE_KM = 3000;
function etatDistance(km) {
    if (km === 0) return 'vert';
    if (km <= PRES_KM) return 'vert';
    if (km <= TIEDE_KM) return 'orange';
    return 'rouge';
}

// La population : l'orange sert à dire « même ordre de grandeur ». Sans lui,
// la colonne ne vaudrait qu'une flèche de plus.
function etatPopulation(a, b) {
    if (!a || !b) return 'rouge';
    const r = a / b;
    if (r >= 0.75 && r <= 1.33) return 'vert';
    if (r >= 0.33 && r <= 3) return 'orange';
    return 'rouge';
}

// La langue : vert quand c'est la même langue principale, orange quand une
// AUTRE langue officielle est commune. L'Autriche proposée contre la Suisse
// doit se voir — les deux parlent allemand, même si la Suisse affiche le
// français en tête.
function etatLangue(a, b) {
    const la = (a.langues || []).map(normaliser), lb = (b.langues || []).map(normaliser);
    if (!la.length || !lb.length) return 'rouge';
    if (la[0] === lb[0]) return 'vert';
    return la.some(x => lb.includes(x)) ? 'orange' : 'rouge';
}

/**
 * Évalue une proposition contre la capitale du jour.
 * ⚠️ Ne renvoie JAMAIS rien sur la cible elle-même : seulement ce que la
 * proposition apprend. C'est la même règle qu'au Motus et à la Géographie.
 */
function evaluer(codePropose, codeCible) {
    const a = parCode.get(codePropose), b = parCode.get(codeCible);
    if (!a || !b) return null;
    const km = distanceKm(a, b);
    const juste = a.code === b.code;
    return {
        code: a.code, ville: a.ville, pays: a.pays, juste,
        devise: { valeur: a.devise, etat: a.devise === b.devise ? 'vert' : 'rouge' },
        langue: { valeur: (a.langues || [])[0] || '—', etat: etatLangue(a, b) },
        distance: { km, etat: juste ? 'vert' : etatDistance(km) },
        direction: direction(a, b),
        // `sens` dit si la réponse est plus peuplée (+1) ou moins (-1). La
        // valeur affichée reste celle de la proposition : on ne donne jamais
        // la population de la cible, elle la désignerait presque.
        population: {
            valeur: a.pop, sens: juste ? 0 : Math.sign((b.pop || 0) - (a.pop || 0)),
            etat: juste ? 'vert' : etatPopulation(a.pop, b.pop),
        },
    };
}

// ---------------------------------------------------------------------
//  LE TIRAGE ET LE SCORE
// ---------------------------------------------------------------------
const TIRABLES = VILLES.filter(v => !v.horsTirage);
const MAX_ESSAIS = 6;

// La capitale du jour. `hasard` est le tirage du moteur commun des jeux du
// jour — une fonction, pas un nombre : il la fait dépendre de la date et de la
// variante, celle que fait avancer le bouton de régénération de l'admin.
function capitaleDuJour(hasard) {
    return TIRABLES[Math.floor(hasard() * TIRABLES.length)] || TIRABLES[0];
}

// Même barème que la Géographie : trouver au premier essai vaut 12, au
// sixième 2, échouer 0. Les deux jeux se comparent ainsi sans conversion.
function score(essais, trouve) {
    if (!trouve) return 0;
    return Math.max(1, MAX_ESSAIS + 1 - essais) * 2;
}

module.exports = {
    VILLES, TIRABLES, MAX_ESSAIS, PRES_KM, TIEDE_KM,
    trouver, propositions, evaluer, capitaleDuJour, score,
    distanceKm, direction, normaliser, parCode,
};
