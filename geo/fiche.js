// =====================================================================
//  LA FICHE D'UN PAYS — ce qu'on montre en fin de manche
//
//  Les cinq jeux de géographie se terminaient chacun sur un bout de
//  réponse : Le pays donnait nom + région + silhouette, La carte nom +
//  région, Les capitales cinq lignes sur la ville. Pourtant TOUT existe
//  déjà, réparti dans trois jeux de données qui ne se parlaient pas :
//    · geo/pays.js        → nom, région, silhouette, superficie, voisins
//    · capitales/villes.js → capitale, devise, langues, population
//    · geo/commun.js       → le drapeau, dérivé du code
//
//  Les rassembler ne coûte rien et change ce qu'on retire d'une partie :
//  on ne vérifie plus seulement si on avait raison, on apprend le pays.
//
//  ⚠️ Cette fiche ne sort du serveur QU'UNE FOIS LA MANCHE FINIE. Servie
//  plus tôt, elle donnerait la réponse — c'est tout le contenu du jeu.
// =====================================================================
const PAYS = require('./pays');
const VILLES = require('../capitales/villes');
const { drapeau } = require('./commun');

const parCode = new Map(PAYS.map(p => [p.code, p]));
const villeParCode = new Map(VILLES.map(v => [v.code, v]));
const nomParCode = new Map(PAYS.map(p => [p.code, p.nom]));

// ⚠️ « Monnaie : TRY » n'apprend rien — et c'est une fiche dont le seul but
// est d'apprendre. Wikidata donne les devises en code ISO, et c'est le bon
// format pour la comparaison du jeu des capitales, qui teste l'égalité ;
// c'est le mauvais pour une fiche qu'on lit. Les noms français viennent de
// l'ICU embarqué dans Node : aucun fichier à écrire, aucun réseau, et les
// 142 devises du jeu y sont toutes (vérifié).
const NOM_DEVISE = new Intl.DisplayNames(['fr'], { type: 'currency' });
function devise(code) {
    if (!code) return null;
    try { return NOM_DEVISE.of(code) || code; } catch (e) { return code; }
}

/**
 * La fiche complète d'un pays, prête à afficher.
 * @param {string} code     le code ISO à deux lettres
 * @param {object} options  { silhouette:false } pour l'alléger
 */
function fiche(code, options) {
    const o = options || {};
    const p = parCode.get(code);
    if (!p) return null;
    const v = villeParCode.get(code);
    return {
        code: p.code,
        nom: p.nom,
        region: p.region,
        drapeau: drapeau(p.code),
        // La silhouette n'est pas toujours là : vingt et un pays sont trop
        // petits pour un tracé lisible à 100 px.
        chemin: o.silhouette === false ? undefined : (p.chemin || undefined),
        capitale: v ? v.ville : null,
        devise: v ? devise(v.devise) : null,
        langue: v && v.langues ? v.langues[0] : null,
        // ⚠️ C'est la population DE LA CAPITALE, pas celle du pays — c'est la
        // seule que porte `villes.js`, puisque le jeu des capitales compare
        // deux villes. Elle s'appelait `population` et s'affichait sous un
        // « Habitants » posé juste en dessous du nom du pays : la fiche de la
        // Turquie annonçait 5,8 millions d'habitants (Ankara) au lieu de 85.
        // Le nom dit maintenant de quoi on parle, et l'affichage la range
        // avec la capitale, où elle ne peut plus être lue de travers.
        popCapitale: v ? v.pop : null,
        // ⚠️ `aireReelle`, jamais `aire` : la seconde est la surface du tracé
        // dessiné, amputée des morceaux lointains. Elle ferait dire que la
        // Pologne est plus vaste que la Norvège, dont le Svalbard manque.
        aire: p.aireReelle || p.aire || null,
        // Les voisins en toutes lettres : un code ISO n'apprend rien.
        voisins: (p.voisins || []).map(c => nomParCode.get(c)).filter(Boolean),
    };
}

module.exports = { fiche };
