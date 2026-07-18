// =====================================================================
//  MOTS FLÉCHÉS — générateur de grilles.
//  Motif "peigne" : un mot vertical en colonne 1 dont chaque lettre est
//  l'initiale d'un mot horizontal. Les croisements sont donc toujours
//  corrects par construction.
//
//  La grille est DÉTERMINISTE : même date + même niveau = même grille
//  pour tous les joueurs (indispensable pour le classement quotidien).
// =====================================================================
const { INDEX } = require('./words');

// --- PRNG déterministe (mulberry32) ---
function hashSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}
function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function shuffled(arr, rnd) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
}

// --- Réglages par niveau ---
const LEVELS = {
    facile:    { vLen: 4, hLen: 5, maxN: 1, label: 'Facile' },
    moyen:     { vLen: 5, hLen: 6, maxN: 2, label: 'Moyen' },
    difficile: { vLen: 6, hLen: 7, maxN: 3, label: 'Difficile' },
};

function poolFor(len, maxN) {
    const byLetter = INDEX[len] || {};
    const out = {};
    for (const [letter, list] of Object.entries(byLetter)) {
        const ok = list.filter(w => w.n <= maxN);
        if (ok.length) out[letter] = ok;
    }
    return out;
}

/**
 * Construit la grille du jour.
 * @param {string} level 'facile' | 'moyen' | 'difficile'
 * @param {string} dateId 'AAAA-MM-JJ'
 */
function generate(level, dateId) {
    const cfg = LEVELS[level] || LEVELS.facile;
    const rnd = mulberry32(hashSeed(dateId + '|' + level));

    const hPool = poolFor(cfg.hLen, cfg.maxN);           // mots horizontaux dispo par initiale
    const vPool = Object.values(poolFor(cfg.vLen, cfg.maxN)).flat();

    // Verticaux jouables : chaque lettre doit avoir au moins un mot horizontal
    const usable = vPool.filter(v => v.m.split('').every(ch => hPool[ch] && hPool[ch].length));
    const candidates = shuffled(usable, rnd);
    if (!candidates.length) throw new Error('Aucun mot vertical exploitable pour le niveau ' + level);

    const vertical = candidates[0];
    const rows = cfg.vLen + 1, cols = cfg.hLen + 1;

    // Un mot horizontal par lettre du vertical (sans répéter un mot)
    const used = new Set();
    const across = vertical.m.split('').map(ch => {
        const options = shuffled(hPool[ch], rnd);
        const pick = options.find(w => !used.has(w.m)) || options[0];
        used.add(pick.m);
        return pick;
    });

    // Grille-solution : ligne 0 et colonne 0 réservées aux définitions
    const grid = Array.from({ length: rows }, () => Array(cols).fill(null));
    across.forEach((w, i) => {
        const r = i + 1;
        w.m.split('').forEach((ch, j) => { grid[r][j + 1] = ch; });
    });

    const defs = [
        { r: 0, c: 1, dir: 'down', clue: vertical.d },
        ...across.map((w, i) => ({ r: i + 1, c: 0, dir: 'right', clue: w.d })),
    ];

    return {
        id: `${dateId}-${level}`,
        level, levelLabel: cfg.label, date: dateId,
        rows, cols, grid, defs,
        solution: { vertical: vertical.m, across: across.map(w => w.m) },
    };
}

module.exports = { generate, LEVELS };