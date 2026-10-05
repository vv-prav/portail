// =====================================================================
//  CE QU'UN JOUEUR SAIT DE LA GÉOGRAPHIE
//
//  Un niveau par pays et par joueur, et une date de révision. C'est tout
//  le moteur de l'apprentissage, et il tient dans ce fichier.
//
//  ⚠️ **La répétition espacée est le seul mécanisme dont on sache qu'il
//  fait apprendre durablement.** Un pays réussi revient plus tard, de plus
//  en plus tard ; un pays raté revient demain. Sans elle, cent
//  quatre-vingt-quatorze pays sous cinq formes font près de mille
//  associations, et on abandonne à la troisième semaine.
//
//  ⚠️ **L'entraînement ne rapporte AUCUN point et n'entre dans AUCUN
//  classement**, et c'est une décision de fond : dès qu'il y a un
//  classement, on cesse de se tromper — et on cesse d'apprendre. Le
//  classement, ce sont les cinq jeux du jour ; ici on s'exerce.
//
//  Rangé dans `geo:savoir:<pseudo>`, une seule clé par joueur :
//      { "FR": { n: 4, d: "2026-11-02", v: 7, e: 1 }, … }
//        n = niveau, d = à revoir le, v = fois vu, e = fois raté
// =====================================================================
const PAYS = require('./pays');
const REGIONS = require('./regions');

const SOUVERAINS = PAYS.filter(p => p.souverain);
const TOTAL = SOUVERAINS.length;
const estPays = new Set(SOUVERAINS.map(p => p.code));

// Les six niveaux, et le délai avant de revoir le pays. Les intervalles
// doublent à peu près : c'est la courbe qui demande le moins de révisions
// pour une même rétention.
const NIVEAUX = [
    { n: 0, nom: 'jamais vu', jours: 0 },
    { n: 1, nom: 'découvert', jours: 1 },
    { n: 2, nom: 'reconnu', jours: 3 },
    { n: 3, nom: 'su', jours: 7 },
    { n: 4, nom: 'solide', jours: 16 },
    { n: 5, nom: 'acquis', jours: 40 },
];
const NIVEAU_MAX = 5;
// À partir de « su », on considère que le pays est maîtrisé : c'est ce
// seuil qui compte pour le rang du joueur.
const SEUIL_MAITRISE = 3;

// Les rangs. Ils ne donnent aucun avantage : ils disent où on en est, et
// c'est déjà beaucoup quand l'objectif est à cent quatre-vingt-quatorze.
const RANGS = [
    { min: 0, nom: 'Curieux', emoji: '🧭' },
    { min: 10, nom: 'Explorateur', emoji: '🥾' },
    { min: 25, nom: 'Voyageur', emoji: '🎒' },
    { min: 50, nom: 'Navigateur', emoji: '⛵' },
    { min: 80, nom: 'Globe-trotteur', emoji: '🌍' },
    { min: 120, nom: 'Géographe', emoji: '📜' },
    { min: 160, nom: 'Maître du monde', emoji: '👑' },
    { min: 194, nom: 'Atlas vivant', emoji: '🗿' },
];
function rangDe(maitrises) {
    let actuel = RANGS[0], suivant = null;
    for (const r of RANGS) {
        if (maitrises >= r.min) actuel = r;
        else { suivant = r; break; }
    }
    return {
        ...actuel,
        suivant: suivant ? { nom: suivant.nom, emoji: suivant.emoji, manque: suivant.min - maitrises } : null,
        // La part du chemin vers le rang suivant, pour la jauge.
        part: suivant ? Math.round((maitrises - actuel.min) / (suivant.min - actuel.min) * 100) : 100,
    };
}

// ---------------------------------------------------------------------
//  LIRE ET ÉCRIRE
// ---------------------------------------------------------------------
const CLE = (pseudo) => `geo:savoir:${pseudo}`;

function lire(get, pseudo) {
    const brut = get(CLE(pseudo));
    return (brut && typeof brut === 'object') ? brut : {};
}

function ajouterJours(date, n) {
    const d = new Date(date + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

/**
 * Enregistre une rencontre avec un pays.
 * @param {object} savoir  l'état du joueur (modifié sur place)
 * @param {string} code    le pays
 * @param {boolean} juste  l'a-t-il su ?
 * @param {string} today   la date du salon
 */
function noter(savoir, code, juste, today) {
    if (!estPays.has(code)) return savoir;
    const e = savoir[code] || { n: 0, d: today, v: 0, e: 0 };
    e.v = (e.v || 0) + 1;
    if (juste) {
        e.n = Math.min(NIVEAU_MAX, (e.n || 0) + 1);
    } else {
        e.e = (e.e || 0) + 1;
        // ⚠️ Un échec ne remet pas à zéro : il redescend d'un cran. Repartir
        // de rien à chaque erreur décourage, et c'est faux — on n'oublie pas
        // tout d'un coup. Mais on ne reste jamais au-dessus de « reconnu »
        // après un raté : sinon un pays qu'on ne sait plus se cacherait
        // derrière un vieux niveau acquis.
        //
        // ⚠️⚠️ Et JAMAIS en dessous de « découvert » : un pays qu'on vient de
        // rater doit entrer dans les révisions. Laissé à zéro — « jamais vu »
        // — il n'y entrait pas, et les erreurs ne revenaient donc jamais. Ce
        // qui vidait tout le mécanisme de son sens, puisque ce sont
        // précisément les erreurs qu'on veut revoir.
        e.n = Math.min(2, Math.max(1, (e.n || 0) - 1));
    }
    e.d = ajouterJours(today, NIVEAUX[e.n].jours);
    savoir[code] = e;
    return savoir;
}

/**
 * Ce qu'il y a à revoir aujourd'hui, du plus en retard au moins urgent.
 * Les pays jamais vus n'en sont pas : on les découvre par régions, c'est
 * une autre porte.
 */
function aRevoir(savoir, today, combien) {
    const du = [];
    for (const [code, e] of Object.entries(savoir)) {
        if (!estPays.has(code) || !e || !e.n) continue;
        if ((e.d || today) <= today) du.push({ code, ...e });
    }
    du.sort((a, b) => (a.d || '').localeCompare(b.d || '') || (b.e || 0) - (a.e || 0));
    return combien ? du.slice(0, combien) : du;
}

/** Le tableau de bord d'un joueur : rang, compteurs, régions. */
function bilan(savoir, today) {
    const parNiveau = [0, 0, 0, 0, 0, 0];
    let maitrises = 0, vus = 0;
    for (const [code, e] of Object.entries(savoir)) {
        if (!estPays.has(code) || !e) continue;
        const n = Math.max(0, Math.min(NIVEAU_MAX, e.n || 0));
        parNiveau[n]++;
        if (n > 0) vus++;
        if (n >= SEUIL_MAITRISE) maitrises++;
    }
    parNiveau[0] = TOTAL - vus;          // tout le reste n'a jamais été vu
    return {
        total: TOTAL, vus, maitrises,
        parNiveau,
        rang: rangDe(maitrises),
        aRevoir: aRevoir(savoir, today).length,
        regions: REGIONS.map(r => {
            let su = 0, vu = 0;
            for (const c of r.pays) {
                const n = (savoir[c] && savoir[c].n) || 0;
                if (n > 0) vu++;
                if (n >= SEUIL_MAITRISE) su++;
            }
            return { id: r.id, nom: r.nom, emoji: r.emoji, total: r.pays.length, vu, su,
                     part: Math.round(su / r.pays.length * 100) };
        }),
    };
}

// ---------------------------------------------------------------------
//  LE PONT AVEC LES JEUX DU JOUR
//  ⚠️ C'est ce qui fait tenir l'ensemble : jouer suffit à apprendre, et
//  rien n'est à faire en plus. Chaque manche quotidienne met à jour le
//  modèle — trouvé du premier coup, le pays monte ; raté, il revient
//  demain. Et la révision reproposera en priorité ce qu'on a manqué hier.
//
//  Appelé une fois par jour et par joueur, à l'ouverture de
//  l'apprentissage : parcourir les progressions de la veille coûte moins
//  que de tenir un journal d'événements.
// ---------------------------------------------------------------------
function nourrir(cache, savoir, pseudo, jusquA, depuis) {
    const vu = savoir.__ || {};          // les journées déjà prises en compte
    let touche = 0;
    for (const [k, v] of Object.entries(cache)) {
        if (!v || typeof v !== 'object') continue;
        const seg = k.split(':');
        if (seg[1] !== 'prog' || seg[2] !== pseudo) continue;
        const date = seg[3];
        if (!date || date > jusquA || (depuis && date < depuis)) continue;
        if (!v.fini) continue;
        const marque = seg[0] + ':' + date + (seg[4] ? ':' + seg[4] : '');
        if (vu[marque]) continue;

        if (seg[0] === 'geo' && seg[4] !== 'voyage') {
            const cible = cache[`geo:pays:${seg[4]}:${date}`];
            if (cible) noterManche(savoir, cible, v.essais, v.trouve, date);
        } else if (seg[0] === 'geo' && seg[4] === 'voyage') {
            // Le voyage : chaque pays traversé a été reconnu comme voisin.
            for (const p of (v.pas || [])) noter(savoir, p.code, true, date);
        } else if (seg[0] === 'carte') {
            const cible = cache[`carte:pays:${date}`];
            if (cible) noterManche(savoir, cible, v.essais, v.trouve, date);
        } else if (seg[0] === 'capitales') {
            const cible = cache[`capitales:ville:${date}`];
            if (cible) noterManche(savoir, cible, v.essais, v.trouve, date);
        } else continue;

        vu[marque] = 1;
        touche++;
    }
    savoir.__ = vu;
    return touche;
}
// Une manche vaut une rencontre : trouvée du premier ou du deuxième coup,
// c'est su ; au-delà, on y est arrivé mais on ne savait pas.
function noterManche(savoir, code, essais, trouve, date) {
    const n = (essais || []).length;
    noter(savoir, code, !!trouve && n <= 2, date);
    // ⚠️ Les pays proposés À TORT comptent aussi, et c'est précieux : ce
    // sont les confusions réelles du joueur, pas une liste théorique.
    for (const e of (essais || [])) {
        if (e && e.code && e.code !== code && !e.juste) noter(savoir, e.code, false, date);
    }
}

module.exports = {
    CLE, NIVEAUX, NIVEAU_MAX, SEUIL_MAITRISE, RANGS, TOTAL,
    lire, noter, aRevoir, bilan, rangDe, nourrir, ajouterJours,
};
