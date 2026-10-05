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
};
const TOUTES = Object.keys(FORMES);

// ---------------------------------------------------------------------
//  LES LEURRES
//  D'abord les voisins, puis la sous-région, puis le reste du monde. On
//  n'en manque jamais : la plus petite région compte deux pays, mais le
//  repli sur le monde entier est toujours là.
// ---------------------------------------------------------------------
function leurres(p, combien, hasard, filtre) {
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

    const faux = leurres(p, 3, hasard, forme === 'capitale' || forme === 'pays'
        ? (q) => !!villeParCode.get(q.code) : null);
    if (faux.length < 3) return null;

    if (forme === 'silhouette') {
        return { ...base, type: 'choix', chemin: p.chemin,
                 choix: melanger([p, ...faux], hasard).map(q => ({ v: q.code, t: q.nom })) };
    }
    if (forme === 'drapeau') {
        return { ...base, type: 'choix', drapeau: drapeau(code),
                 choix: melanger([p, ...faux], hasard).map(q => ({ v: q.code, t: q.nom })) };
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

// La réponse est vérifiée ICI, jamais dans le navigateur.
function verifier(q, reponse) {
    if (!q) return false;
    return String(reponse || '').toUpperCase().trim() === q.code;
}

module.exports = { FORMES, TOUTES, question, serie, verifier, leurres };
