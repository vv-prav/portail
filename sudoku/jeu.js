// =====================================================================
//  LE SUDOKU DU JOUR
//
//  Aucun contenu à écrire : la grille est tirée de la date. Deux
//  garanties, vérifiées avant de proposer une grille, et qui font toute
//  la différence entre un vrai sudoku et un tableau de chiffres :
//
//   · UNE SEULE SOLUTION. Un sudoku à deux solutions oblige à deviner au
//     dernier moment, et deux joueurs également bons finissent avec deux
//     grilles différentes — dont une serait déclarée fausse.
//   · RÉSOLUBLE SANS DEVINER. La grille doit se terminer par la seule
//     logique des « singletons » (une case qui n'admet plus qu'un
//     chiffre, un chiffre qui n'a plus qu'une case dans sa ligne, sa
//     colonne ou son carré). C'est le niveau d'un bon sudoku de journal :
//     on réfléchit, on ne tire jamais à pile ou face.
//
//  Les indices sont retirés par paires symétriques (la case et son
//  opposée par le centre), comme dans les grilles imprimées : c'est ce qui
//  leur donne leur allure, et on le remarque quand ça manque.
// =====================================================================

const TOUS = 0x3FE;                         // les bits 1 à 9
const LIGNE = (i) => Math.floor(i / 9);
const COLONNE = (i) => i % 9;
const CARRE = (i) => Math.floor(LIGNE(i) / 3) * 3 + Math.floor(COLONNE(i) / 3);

// Les 27 unités (9 lignes, 9 colonnes, 9 carrés), et pour chaque case les
// 20 cases qui la voient. Calculés une fois pour toutes.
const UNITES = [];
for (let k = 0; k < 9; k++) {
    UNITES.push(Array.from({ length: 9 }, (_, j) => k * 9 + j));
    UNITES.push(Array.from({ length: 9 }, (_, j) => j * 9 + k));
    const l0 = Math.floor(k / 3) * 3, c0 = (k % 3) * 3;
    UNITES.push(Array.from({ length: 9 }, (_, j) => (l0 + Math.floor(j / 3)) * 9 + c0 + (j % 3)));
}
const PAIRS = Array.from({ length: 81 }, (_, i) => {
    const s = new Set();
    for (let j = 0; j < 81; j++) {
        if (j !== i && (LIGNE(j) === LIGNE(i) || COLONNE(j) === COLONNE(i) || CARRE(j) === CARRE(i))) s.add(j);
    }
    return [...s];
});

function candidats(g, i) {
    let m = TOUS;
    for (const j of PAIRS[i]) if (g[j]) m &= ~(1 << g[j]);
    return m;
}
const nbBits = (m) => { let n = 0; while (m) { m &= m - 1; n++; } return n; };
const chiffresDe = (m) => { const r = []; for (let d = 1; d <= 9; d++) if (m & (1 << d)) r.push(d); return r; };

// ---------- Compter les solutions ----------
// Retour arrière classique, en commençant toujours par la case qui a le
// moins de possibilités : c'est ce qui le rend instantané. On s'arrête dès
// `limite` solutions — pour l'unicité, deux suffisent à conclure.
function compterSolutions(grille, limite) {
    const g = grille.slice();
    let n = 0;
    (function explorer() {
        if (n >= limite) return;
        let meilleure = -1, meilleurMasque = 0, min = 10;
        for (let i = 0; i < 81; i++) {
            if (g[i]) continue;
            const m = candidats(g, i);
            const k = nbBits(m);
            if (k === 0) return;                      // impasse
            if (k < min) { min = k; meilleure = i; meilleurMasque = m; if (k === 1) break; }
        }
        if (meilleure < 0) { n++; return; }            // grille pleine : une solution
        for (const d of chiffresDe(meilleurMasque)) {
            g[meilleure] = d;
            explorer();
            if (n >= limite) break;
        }
        g[meilleure] = 0;
    })();
    return n;
}

// ---------- Une grille pleine au hasard ----------
function grillePleine(hasard) {
    const g = new Array(81).fill(0);
    const melanger = (t) => {
        for (let i = t.length - 1; i > 0; i--) { const j = Math.floor(hasard() * (i + 1)); [t[i], t[j]] = [t[j], t[i]]; }
        return t;
    };
    (function remplir(i) {
        if (i === 81) return true;
        for (const d of melanger(chiffresDe(candidats(g, i)))) {
            g[i] = d;
            if (remplir(i + 1)) return true;
        }
        g[i] = 0;
        return false;
    })(0);
    return g;
}

// ---------- Résoudre « à la main » ----------
// Uniquement les deux règles qu'un joueur applique sans crayon ni hypothèse.
// Renvoie la grille complétée, ou null si ces règles ne suffisent pas.
function resoudreParLogique(grille) {
    const g = grille.slice();
    let avance = true;
    while (avance) {
        avance = false;
        // Une case qui n'admet plus qu'un chiffre.
        for (let i = 0; i < 81; i++) {
            if (g[i]) continue;
            const m = candidats(g, i);
            if (!m) return null;
            if (nbBits(m) === 1) { g[i] = chiffresDe(m)[0]; avance = true; }
        }
        // Un chiffre qui n'a plus qu'une place dans une unité.
        for (const u of UNITES) {
            for (let d = 1; d <= 9; d++) {
                if (u.some(i => g[i] === d)) continue;
                const places = u.filter(i => !g[i] && (candidats(g, i) & (1 << d)));
                if (places.length === 1) { g[places[0]] = d; avance = true; }
            }
        }
    }
    return g.every(x => x) ? g : null;
}

// ---------- Le tirage du jour ----------
function tirage(hasard) {
    const solution = grillePleine(hasard);
    const g = solution.slice();
    // L'ordre dans lequel on tente de retirer les paires : c'est lui qui
    // fait la variété des grilles.
    const ordre = [];
    for (let i = 0; i <= 40; i++) ordre.push(i);
    for (let i = ordre.length - 1; i > 0; i--) { const j = Math.floor(hasard() * (i + 1)); [ordre[i], ordre[j]] = [ordre[j], ordre[i]]; }
    for (const i of ordre) {
        const j = 80 - i;                              // la case opposée par le centre
        const a = g[i], b = g[j];
        g[i] = 0; g[j] = 0;
        // On garde le retrait seulement s'il laisse une solution unique ET
        // atteignable sans deviner.
        if (compterSolutions(g, 2) !== 1 || !resoudreParLogique(g)) { g[i] = a; g[j] = b; }
    }
    return {
        donnee: g.join(''),
        solution: solution.join(''),
        indices: g.filter(x => x).length,
    };
}

// ---------- La vérification ----------
// `cases` est la grille du joueur (81 caractères, « 0 » pour une case vide).
// Le serveur ne croit que la comparaison avec sa propre solution.
function estJuste(cases, solution) {
    return typeof cases === 'string' && cases.length === 81 && cases === solution;
}
// Une grille envoyée par le navigateur : chiffres seulement, et les indices
// d'origine ne peuvent pas avoir été modifiés.
function nettoyer(cases, donnee) {
    const s = String(cases || '').replace(/[^0-9]/g, '').slice(0, 81).padEnd(81, '0');
    return s.split('').map((c, i) => (donnee[i] !== '0' ? donnee[i] : c)).join('');
}

// Le score : dix points pour une grille résolue. À score égal, le
// classement départage au temps — c'est le vrai enjeu d'un sudoku du jour.
const SCORE_RESOLU = 10;
// En dessous de ce temps, une grille résolue est suspecte : même un expert
// ne remplit pas cinquante cases en moins d'une minute et demie.
const TEMPS_MINI_MS = 90 * 1000;

module.exports = {
    tirage, compterSolutions, resoudreParLogique, grillePleine,
    estJuste, nettoyer, SCORE_RESOLU, TEMPS_MINI_MS,
};
