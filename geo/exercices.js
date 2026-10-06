// =====================================================================
//  LES EXERCICES — les cinq ponts d'un même savoir
//
//  On ne « sait » pas un pays : on sait des ponts entre cinq formes.
//
//      le nom ↔ la silhouette ↔ le drapeau ↔ la position ↔ la capitale
//
//  Les cinq jeux du jour testent chacun un pont et un seul : Le pays fait
//  silhouette → nom, Le drapeau drapeau → nom, La carte nom → position,
//  Les capitales pays → capitale. ⚠️ **C'est ici qu'on entraîne les ponts
//  qu'on rate**, et c'est ce qui relie les cinq jeux au lieu de les
//  juxtaposer.
//
//  ⚠️ **Les mauvaises réponses font le jeu, pas les bonnes.** 🇧🇷 face au
//  Népal, aux Fidji et au Tchad, c'est offert ; face à la Colombie,
//  l'Argentine et le Portugal, il faut savoir. Les leurres viennent donc
//  d'abord des VOISINS (les confusions naturelles), puis de la même
//  sous-région. C'est la leçon déjà tirée pour le quiz des drapeaux.
// =====================================================================
const PAYS = require('./pays');
const { regions: REGIONS } = require('./regions');
const VILLES = require('../capitales/villes');
const { drapeau, normaliser } = require('./commun');
const { confondsAvec, FAMILLES } = require('./drapeaux');

const parCode = new Map(PAYS.map(p => [p.code, p]));
const villeParCode = new Map(VILLES.map(v => [v.code, v]));
const regionDe = new Map();
for (const r of REGIONS) for (const c of r.pays) regionDe.set(c, r);

// Les cinq formes. `dispo` dit si un pays peut servir de question sous
// cette forme — vingt et un pays n'ont pas de silhouette lisible.
const FORMES = {
    silhouette: {
        id: 'silhouette', nom: 'La silhouette', emoji: '🗺️',
        question: 'Quel est ce pays ?',
        dispo: (p) => !!p.chemin,
    },
    drapeau: {
        id: 'drapeau', nom: 'Le drapeau', emoji: '🏳️',
        question: 'À quel pays appartient ce drapeau ?',
        dispo: () => true,
    },
    capitale: {
        id: 'capitale', nom: 'La capitale', emoji: '🏙️',
        question: 'Quelle est la capitale de ce pays ?',
        dispo: (p) => !!villeParCode.get(p.code),
    },
    pays: {
        id: 'pays', nom: 'Le pays', emoji: '🔎',
        question: 'De quel pays cette ville est-elle la capitale ?',
        dispo: (p) => !!villeParCode.get(p.code),
    },
    position: {
        id: 'position', nom: 'La position', emoji: '📍',
        question: 'Montre ce pays sur la carte',
        dispo: () => true,
    },
    // ⚠️ LES PONTS INVERSES. Reconnaître et retrouver sont deux savoirs
    // différents : repérer le drapeau du Pérou dans une liste de noms est
    // bien plus facile que de le désigner parmi quatre drapeaux
    // rouge-et-blanc. On n'entraînait que le plus facile des deux.
    'nom-drapeau': {
        id: 'nom-drapeau', nom: 'Retrouver le drapeau', emoji: '🔍',
        question: 'Lequel est le drapeau de ce pays ?',
        dispo: () => true,
    },
    'nom-silhouette': {
        id: 'nom-silhouette', nom: 'Retrouver la forme', emoji: '🧩',
        question: 'Laquelle est la silhouette de ce pays ?',
        dispo: (p) => !!p.chemin,
    },
};
const TOUTES = Object.keys(FORMES);

// ---------------------------------------------------------------------
//  LES LEURRES
//  D'abord les voisins, puis la sous-région, puis le reste du monde. On
//  n'en manque jamais : la plus petite région compte deux pays, mais le
//  repli sur le monde entier est toujours là.
// ---------------------------------------------------------------------
function leurres(p, combien, hasard, filtre, visuel) {
    const pris = new Set([p.code]);
    const out = [];
    const ajouter = (codes) => {
        const liste = melanger(codes.filter(c => {
            if (pris.has(c)) return false;
            const q = parCode.get(c);
            return q && q.souverain && (!filtre || filtre(q));
        }), hasard);
        for (const c of liste) {
            if (out.length >= combien) return;
            pris.add(c); out.push(parCode.get(c));
        }
    };
    // ⚠️ POUR UN DRAPEAU, LA RESSEMBLANCE PASSE AVANT LE VOISINAGE. Les
    // confusions de drapeaux ne sont pas géographiques : le Tchad se confond
    // avec la Roumanie, qui est à trois mille kilomètres. Mesuré avant
    // correction, sur mille tirages — le Tchad n'était JAMAIS proposé avec la
    // Roumanie, Monaco jamais avec l'Indonésie, la Norvège jamais avec
    // l'Islande. On s'entraînait sur ce qu'on savait déjà.
    if (visuel) ajouter(confondsAvec(p.code));
    ajouter(p.voisins || []);
    const r = regionDe.get(p.code);
    if (r) ajouter(r.pays);
    ajouter(PAYS.filter(q => q.souverain).map(q => q.code));
    return out;
}
function melanger(liste, hasard) {
    const a = liste.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(hasard() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// ---------------------------------------------------------------------
//  UNE QUESTION
//  ⚠️ La bonne réponse n'est JAMAIS envoyée avec la question. Elle
//  n'arrive qu'avec la correction, et le serveur garde la question en
//  cours — sinon il suffirait de lire la réponse dans le navigateur.
// ---------------------------------------------------------------------
function question(code, forme, hasard) {
    const p = parCode.get(code);
    const F = FORMES[forme];
    if (!p || !F || !F.dispo(p)) return null;
    const v = villeParCode.get(code);

    const base = { code, forme, consigne: F.question, emoji: F.emoji };

    if (forme === 'position') {
        // Pas de choix : on montre sur la carte. L'énoncé est le nom.
        return { ...base, enonce: p.nom, type: 'carte' };
    }

    // `visuel` : les formes où c'est l'image qu'on compare, donc où la
    // ressemblance prime sur le voisinage.
    const visuel = forme === 'drapeau' || forme === 'nom-drapeau';
    const faux = leurres(p, 3, hasard,
        forme === 'capitale' || forme === 'pays' ? (q) => !!villeParCode.get(q.code)
        : forme === 'nom-silhouette' ? (q) => !!q.chemin : null,
        visuel);
    if (faux.length < 3) return null;

    if (forme === 'silhouette') {
        return { ...base, type: 'choix', chemin: p.chemin,
                 choix: melanger([p, ...faux], hasard).map(q => ({ v: q.code, t: q.nom })) };
    }
    if (forme === 'drapeau') {
        return { ...base, type: 'choix', drapeau: drapeau(code),
                 choix: melanger([p, ...faux], hasard).map(q => ({ v: q.code, t: q.nom })) };
    }
    // Les deux inverses : l'énoncé est le nom, les choix sont des images.
    if (forme === 'nom-drapeau') {
        return { ...base, type: 'images', enonce: p.nom,
                 choix: melanger([p, ...faux], hasard).map(q => ({ v: q.code, d: drapeau(q.code) })) };
    }
    if (forme === 'nom-silhouette') {
        return { ...base, type: 'formes', enonce: p.nom,
                 choix: melanger([p, ...faux], hasard).map(q => ({ v: q.code, c: q.chemin })) };
    }
    if (forme === 'capitale') {
        return { ...base, type: 'choix', enonce: p.nom, drapeau: drapeau(code),
                 choix: melanger([p, ...faux], hasard)
                     .map(q => ({ v: q.code, t: villeParCode.get(q.code).ville })) };
    }
    // forme === 'pays' : on donne la ville, on cherche le pays.
    return { ...base, type: 'choix', enonce: v.ville,
             choix: melanger([p, ...faux], hasard).map(q => ({ v: q.code, t: q.nom })) };
}

/**
 * Une série d'exercices sur une liste de pays.
 * La forme est tirée parmi celles qui sont disponibles — on ne demande pas
 * trois fois le drapeau du même pays dans la même séance.
 */
function serie(codes, hasard, formesVoulues) {
    const out = [];
    const formes = (formesVoulues && formesVoulues.length) ? formesVoulues : TOUTES;
    for (const code of codes) {
        const p = parCode.get(code);
        if (!p) continue;
        const possibles = melanger(formes.filter(f => FORMES[f] && FORMES[f].dispo(p)), hasard);
        for (const f of possibles) {
            const q = question(code, f, hasard);
            if (q) { out.push(q); break; }
        }
    }
    return out;
}

// ---------------------------------------------------------------------
//  LA SAISIE LIBRE
//  ⚠️ Reconnaître parmi quatre n'est pas savoir. En saisie libre, on ne
//  peut plus éliminer : c'est le seul exercice qui dise vraiment si on
//  sait. Il reste optionnel — imposé, il découragerait.
// ---------------------------------------------------------------------
function enSaisieLibre(q) {
    if (!q || !q.choix) return q;
    const { choix, ...reste } = q;
    return { ...reste, type: 'saisie',
             // L'énoncé ne change pas ; seule la façon de répondre change.
             attendu: q.forme === 'capitale' ? 'capitale' : 'pays' };
}

// La réponse est vérifiée ICI, jamais dans le navigateur.
function verifier(q, reponse) {
    if (!q) return false;
    const brut = String(reponse || '').trim();
    if (!brut) return false;
    // Un choix : la réponse est un code.
    if (brut.toUpperCase() === q.code) return true;
    // Une saisie libre : on compare les noms, accents et casse ignorés.
    const n = normaliser(brut);
    if (!n) return false;
    const p = parCode.get(q.code);
    if (!p) return false;
    if (q.forme === 'capitale') {
        const v = villeParCode.get(q.code);
        if (!v) return false;
        // Les autres capitales du même pays sont acceptées : on ne piège
        // personne sur La Haye ou Sucre.
        return [v.ville, ...(v.alias || [])].some(x => normaliser(x) === n);
    }
    return normaliser(p.nom) === n;
}

module.exports = { FORMES, TOUTES, question, serie, verifier, leurres, enSaisieLibre };
