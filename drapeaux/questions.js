// =====================================================================
//  LE QUIZ DES DRAPEAUX — la fabrique de questions
//
//  Séparé du module de jeu pour une raison : un quiz ne vaut que par ses
//  MAUVAISES réponses. 🇧🇷 face à Népal, Fidji et Tchad, c'est offert ;
//  face à Colombie, Argentine et Portugal, il faut savoir. Tout ce qui
//  suit sert à fabriquer des leurres plausibles, et ça se teste tout
//  seul, sans socket ni partie en cours.
//
//  Aucune donnée nouvelle : `geo/pays.js` sert tel quel.
// =====================================================================

const PAYS = require('../geo/pays');
const SOUVERAINS = PAYS.filter(p => p.souverain);
const parCode = new Map(PAYS.map(p => [p.code, p]));

function drapeau(code) {
    return String.fromCodePoint(...[...code].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
}

// ---------- Les niveaux de difficulté ----------
// La superficie est un mauvais juge de notoriété : elle place le Zimbabwe et
// la Namibie dans les soixante premiers, et laisse la Suisse et les Pays-Bas
// loin derrière. Pour le niveau « Faciles », cette liste est donc écrite à la
// main — un choix assumé, pas une mesure. Elle ne bouge jamais toute seule et
// tient en dix lignes : c'est le seul contenu de tout le jeu qui ne soit pas
// dérivé des données.
const NOTOIRES = new Set([
    'FR', 'DE', 'IT', 'ES', 'PT', 'GB', 'IE', 'BE', 'NL', 'LU', 'CH', 'AT',
    'DK', 'SE', 'NO', 'FI', 'IS', 'PL', 'CZ', 'HU', 'RO', 'GR', 'HR', 'RS',
    'UA', 'RU', 'TR',
    'US', 'CA', 'MX', 'BR', 'AR', 'CL', 'PE', 'CO', 'VE', 'CU',
    'CN', 'JP', 'KR', 'IN', 'TH', 'VN', 'ID', 'PH', 'PK', 'IL', 'SA', 'AE',
    'IR', 'IQ', 'AF', 'NP',
    'MA', 'DZ', 'TN', 'EG', 'SN', 'CI', 'ML', 'NG', 'ZA', 'KE', 'ET', 'CM',
    'AU', 'NZ',
]);
// « Expert » ouvre tout, y compris les micro-États ; « moyen » écarte les plus
// confidentiels en s'appuyant sur la superficie, où elle veut enfin dire
// quelque chose : personne ne reconnaît le drapeau de Nauru.
const NIVEAUX = {
    facile: (p) => NOTOIRES.has(p.code),
    moyen: (p) => NOTOIRES.has(p.code) || p.aire >= 20000,
    expert: () => true,
};

function pool(niveau) {
    const garde = NIVEAUX[niveau] || NIVEAUX.moyen;
    const liste = SOUVERAINS.filter(garde);
    return liste.length >= 8 ? liste : SOUVERAINS;
}

// ---------- Outils de tirage ----------
function melanger(liste, hasard) {
    const t = liste.slice();
    for (let i = t.length - 1; i > 0; i--) {
        const j = Math.floor(hasard() * (i + 1));
        [t[i], t[j]] = [t[j], t[i]];
    }
    return t;
}
const auHasard = (liste, hasard) => liste[Math.floor(hasard() * liste.length)];

// Les leurres : d'abord les pays frontaliers (ce sont les confusions
// naturelles), puis ceux de la même région, et seulement en dernier recours
// n'importe qui. Chaque région compte au moins quatorze pays, donc le dernier
// recours ne sert jamais en pratique — il est là pour ne pas planter si la
// base changeait.
function leurres(bon, liste, combien, hasard) {
    const pris = new Set([bon.code]);
    const sortie = [];
    const ajouter = (candidats) => {
        for (const p of melanger(candidats, hasard)) {
            if (sortie.length >= combien) return;
            if (pris.has(p.code)) continue;
            pris.add(p.code);
            sortie.push(p);
        }
    };
    ajouter(liste.filter(p => (bon.voisins || []).includes(p.code)));
    ajouter(liste.filter(p => p.region === bon.region));
    ajouter(liste);
    return sortie;
}

// ---------- Les cinq types de question ----------
// Chacun renvoie la même forme : un énoncé, quatre choix, l'index du bon.
// Le module de jeu ne connaît que cette forme, et n'envoie JAMAIS `bonne`
// au navigateur avant la fermeture de la question.

function qDrapeauVersNom(liste, hasard) {
    const bon = auHasard(liste, hasard);
    const choix = melanger([bon, ...leurres(bon, liste, 3, hasard)], hasard);
    return {
        type: 'drapeau-nom',
        enonce: 'Quel est ce pays ?',
        media: { drapeau: drapeau(bon.code) },
        choix: choix.map(p => ({ texte: p.nom })),
        bonne: choix.findIndex(p => p.code === bon.code),
        reponse: bon.nom, code: bon.code,
    };
}

function qNomVersDrapeau(liste, hasard) {
    const bon = auHasard(liste, hasard);
    const choix = melanger([bon, ...leurres(bon, liste, 3, hasard)], hasard);
    return {
        type: 'nom-drapeau',
        enonce: `Quel est le drapeau de ${bon.nom} ?`,
        media: null,
        choix: choix.map(p => ({ drapeau: drapeau(p.code) })),
        bonne: choix.findIndex(p => p.code === bon.code),
        reponse: bon.nom, code: bon.code,
    };
}

function qContinent(liste, hasard) {
    const bon = auHasard(liste.filter(p => p.region), hasard);
    // Les quatre autres régions comme leurres, puis on coupe à quatre choix.
    const regions = [...new Set(SOUVERAINS.map(p => p.region).filter(Boolean))];
    const autres = melanger(regions.filter(r => r !== bon.region), hasard).slice(0, 3);
    const choix = melanger([bon.region, ...autres], hasard);
    return {
        type: 'continent',
        enonce: 'Sur quel continent ?',
        media: { drapeau: drapeau(bon.code) },
        choix: choix.map(r => ({ texte: r })),
        bonne: choix.indexOf(bon.region),
        reponse: `${bon.nom} — ${bon.region}`, code: bon.code,
    };
}

function qPlusGrand(liste, hasard) {
    // ⚠️ `aireReelle` et pas `aire` : la seconde est la surface de la silhouette
    // dessinée, amputée des morceaux lointains. Elle affirmerait que la Pologne
    // est plus vaste que la Norvège, dont le Svalbard ne figure pas au tracé.
    // Une question posée au joueur doit toujours se fonder sur la superficie
    // officielle, la seule qu'il puisse vérifier.
    const utiles = liste.filter(p => p.aireReelle >= 10000);
    if (utiles.length < 8) return qDrapeauVersNom(liste, hasard);
    // On part du bon, puis on cherche trois pays nettement plus petits — entre
    // le quart et les trois quarts de sa surface. Prendre une fenêtre glissante
    // dans le classement ne marchait pas : les seuls écarts francs sont tout en
    // haut, et la réponse était l'Australie sept fois sur dix.
    for (let essai = 0; essai < 30; essai++) {
        const bon = auHasard(utiles, hasard);
        const candidats = liste.filter(p => p.code !== bon.code
            && p.aireReelle >= bon.aireReelle * 0.22
            && p.aireReelle <= bon.aireReelle * 0.74);
        if (candidats.length < 3) continue;
        const autres = melanger(candidats, hasard).slice(0, 3);
        const choix = melanger([bon, ...autres], hasard);
        return {
            type: 'plus-grand',
            enonce: 'Lequel de ces pays est le plus vaste ?',
            media: null,
            choix: choix.map(p => ({ drapeau: drapeau(p.code), texte: p.nom })),
            bonne: choix.findIndex(p => p.code === bon.code),
            reponse: `${bon.nom} — ${new Intl.NumberFormat('fr-FR').format(bon.aireReelle)} km²`, code: bon.code,
        };
    }
    return qDrapeauVersNom(liste, hasard);
}

function qVoisin(liste, hasard) {
    // Il faut un pays qui ait des voisins connus (38 îles n'en ont pas) et
    // trois leurres qui ne soient PAS voisins — sinon la question a deux
    // bonnes réponses, ce qui est le pire défaut possible pour un quiz.
    const candidats = liste.filter(p => (p.voisins || []).some(c => parCode.has(c)));
    if (!candidats.length) return qDrapeauVersNom(liste, hasard);
    const sujet = auHasard(candidats, hasard);
    const voisins = sujet.voisins.map(c => parCode.get(c)).filter(Boolean);
    const bon = auHasard(voisins, hasard);
    const interdits = new Set([sujet.code, ...sujet.voisins]);
    const faux = melanger(SOUVERAINS.filter(p => !interdits.has(p.code)), hasard);
    // Même région que le sujet en priorité : « voisin de l'Allemagne » face à
    // trois pays d'Asie ne demande aucune connaissance.
    const proches = faux.filter(p => p.region === sujet.region).slice(0, 3);
    const complement = faux.filter(p => !proches.includes(p)).slice(0, 3 - proches.length);
    const choix = melanger([bon, ...proches, ...complement].slice(0, 4), hasard);
    return {
        type: 'voisin',
        enonce: `Lequel de ces pays a une frontière avec ${sujet.nom} ?`,
        media: { drapeau: drapeau(sujet.code) },
        choix: choix.map(p => ({ drapeau: drapeau(p.code), texte: p.nom })),
        bonne: choix.findIndex(p => p.code === bon.code),
        reponse: `${bon.nom} borde ${sujet.nom}`, code: bon.code,
    };
}

const FABRIQUES = {
    'drapeau-nom': qDrapeauVersNom,
    'nom-drapeau': qNomVersDrapeau,
    'continent': qContinent,
    'plus-grand': qPlusGrand,
    'voisin': qVoisin,
};
const TOUS_TYPES = Object.keys(FABRIQUES);

// Fabrique la série d'une partie. On évite de reposer deux fois le même pays,
// et on alterne les types : quinze fois « quel est ce drapeau ? » et on
// décroche avant la fin.
function serie(nombre, { niveau = 'moyen', types = TOUS_TYPES, hasard = Math.random } = {}) {
    const liste = pool(niveau);
    const actifs = types.filter(t => FABRIQUES[t]);
    const utilisables = actifs.length ? actifs : TOUS_TYPES;
    const dejaVus = new Set();
    const questions = [];
    let ordre = melanger(utilisables, hasard), i = 0;
    while (questions.length < nombre) {
        if (i >= ordre.length) { ordre = melanger(utilisables, hasard); i = 0; }
        const type = ordre[i++];
        let q = null;
        // Jusqu'à dix tentatives pour ne pas retomber sur un pays déjà posé ;
        // au-delà, on accepte le doublon plutôt que de boucler sans fin.
        for (let essai = 0; essai < 10; essai++) {
            q = FABRIQUES[type](liste, hasard);
            if (!dejaVus.has(q.code)) break;
        }
        dejaVus.add(q.code);
        questions.push(q);
    }
    return questions;
}

module.exports = { serie, drapeau, NIVEAUX, TOUS_TYPES, NOTOIRES, pool, PAYS, parCode };
