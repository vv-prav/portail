// =====================================================================
//  MOTS FLÉCHÉS — générateur de grilles « à la française ».
//  Les définitions sont DANS la grille (cases sombres), avec une flèche
//  indiquant où démarre le mot (à droite ▶ ou en dessous ▼).
//  Une même case peut porter deux définitions (une par direction).
//  Grille DÉTERMINISTE : même date + même niveau = même grille pour tous.
// =====================================================================
const { LISTS } = require('./words');

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
function shuffle(arr, rnd) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
}

const LEVELS = {
    facile:    { rows: 8,  cols: 7, lens: [3, 4, 5],       maxN: 1, target: 9,  label: 'Facile' },
    moyen:     { rows: 9,  cols: 8, lens: [3, 4, 5, 6],    maxN: 2, target: 12, label: 'Moyen' },
    difficile: { rows: 10, cols: 9, lens: [3, 4, 5, 6, 7], maxN: 3, target: 15, label: 'Difficile' },
};

function poolsFor(cfg) {
    const pools = {};
    for (const len of cfg.lens) {
        pools[len] = (LISTS[len] || []).filter(([, , n]) => n <= cfg.maxN).map(([m, d, n]) => ({ m, d, n }));
    }
    return pools;
}

const BLOCK = '#';

function buildAttempt(cfg, rnd) {
    const { rows, cols } = cfg;
    const grid = Array.from({ length: rows }, () => Array(cols).fill(null));
    const placed = [];
    const defTaken = new Set();
    const pools = poolsFor(cfg);
    const usedWords = new Set();

    function canPlace(word, r0, c0, dir) {
        const L = word.length;
        if (r0 < 0 || c0 < 0) return null;
        if (dir === 'right' ? (c0 + L > cols) : (r0 + L > rows)) return null;

        const dr = dir === 'right' ? r0 : r0 - 1;
        const dc = dir === 'right' ? c0 - 1 : c0;
        if (dr < 0 || dc < 0 || dr >= rows || dc >= cols) return null;
        if (grid[dr][dc] !== null && grid[dr][dc] !== BLOCK) return null;
        if (defTaken.has(dr + ',' + dc + ',' + dir)) return null;

        const er = dir === 'right' ? r0 : r0 + L;
        const ec = dir === 'right' ? c0 + L : c0;
        if (er < rows && ec < cols && grid[er][ec] !== null && grid[er][ec] !== BLOCK) return null;

        let crossings = 0;
        for (let i = 0; i < L; i++) {
            const r = dir === 'right' ? r0 : r0 + i;
            const c = dir === 'right' ? c0 + i : c0;
            const cur = grid[r][c];
            if (cur === BLOCK) return null;
            if (cur !== null) {
                if (cur !== word[i]) return null;
                crossings++;
            } else {
                if (dir === 'right') {
                    if (r > 0 && grid[r - 1][c] !== null && grid[r - 1][c] !== BLOCK) return null;
                    if (r < rows - 1 && grid[r + 1][c] !== null && grid[r + 1][c] !== BLOCK) return null;
                } else {
                    if (c > 0 && grid[r][c - 1] !== null && grid[r][c - 1] !== BLOCK) return null;
                    if (c < cols - 1 && grid[r][c + 1] !== null && grid[r][c + 1] !== BLOCK) return null;
                }
            }
        }
        return { crossings, defR: dr, defC: dc };
    }

    function place(w, r0, c0, dir, info) {
        for (let i = 0; i < w.m.length; i++) {
            const r = dir === 'right' ? r0 : r0 + i;
            const c = dir === 'right' ? c0 + i : c0;
            grid[r][c] = w.m[i];
        }
        grid[info.defR][info.defC] = BLOCK;
        defTaken.add(info.defR + ',' + info.defC + ',' + dir);
        usedWords.add(w.m);
        placed.push({ ...w, r: r0, c: c0, dir, defR: info.defR, defC: info.defC });
    }

    const firstLen = cfg.lens[cfg.lens.length - 1];
    for (const w of shuffle(pools[firstLen] || [], rnd)) {
        const info = canPlace(w.m, 1, 1, 'right');
        if (info) { place(w, 1, 1, 'right', info); break; }
    }
    if (!placed.length) return null;

    let guard = 0;
    while (placed.length < cfg.target && guard++ < 300) {
        let done = false;
        for (const base of shuffle(placed, rnd)) {
            const dir = base.dir === 'right' ? 'down' : 'right';
            for (let i = 0; i < base.m.length && !done; i++) {
                const cr = base.dir === 'right' ? base.r : base.r + i;
                const cc = base.dir === 'right' ? base.c + i : base.c;
                const letter = base.m[i];
                for (const len of shuffle(cfg.lens, rnd)) {
                    const cands = shuffle((pools[len] || []).filter(w => !usedWords.has(w.m) && w.m.indexOf(letter) >= 0), rnd);
                    for (const w of cands) {
                        for (let j = 0; j < w.m.length; j++) {
                            if (w.m[j] !== letter) continue;
                            const r0 = dir === 'right' ? cr : cr - j;
                            const c0 = dir === 'right' ? cc - j : cc;
                            const info = canPlace(w.m, r0, c0, dir);
                            if (info && info.crossings >= 1) { place(w, r0, c0, dir, info); done = true; break; }
                        }
                        if (done) break;
                    }
                    if (done) break;
                }
            }
            if (done) break;
        }
        if (!done) break;
    }
    return { grid, placed };
}

function validate(grid, placed, rows, cols) {
    const declared = new Set(placed.map(p => p.dir + ':' + p.r + ':' + p.c + ':' + p.m));
    const found = [];
    for (let r = 0; r < rows; r++) {
        let c = 0;
        while (c < cols) {
            if (grid[r][c] && grid[r][c] !== BLOCK) {
                let s = '', c0 = c;
                while (c < cols && grid[r][c] && grid[r][c] !== BLOCK) { s += grid[r][c]; c++; }
                if (s.length > 1) found.push('right:' + r + ':' + c0 + ':' + s);
            } else c++;
        }
    }
    for (let c = 0; c < cols; c++) {
        let r = 0;
        while (r < rows) {
            if (grid[r][c] && grid[r][c] !== BLOCK) {
                let s = '', r0 = r;
                while (r < rows && grid[r][c] && grid[r][c] !== BLOCK) { s += grid[r][c]; r++; }
                if (s.length > 1) found.push('down:' + r0 + ':' + c + ':' + s);
            } else r++;
        }
    }
    return found.every(f => declared.has(f));
}

function generate(level, dateId) {
    const cfg = LEVELS[level] || LEVELS.facile;
    let best = null;
    for (let attempt = 0; attempt < 40; attempt++) {
        const rnd = mulberry32(hashSeed(dateId + '|' + level + '|' + attempt));
        const res = buildAttempt(cfg, rnd);
        if (!res || res.placed.length < 4) continue;
        if (!validate(res.grid, res.placed, cfg.rows, cfg.cols)) continue;
        if (!best || res.placed.length > best.placed.length) best = res;
        if (best.placed.length >= cfg.target) break;
    }
    if (!best) throw new Error('Génération impossible pour ' + level + ' ' + dateId);

    const grid = best.grid.map(row => row.map(v => (v && v !== BLOCK ? v : null)));
    const defs = best.placed.map(p => ({ r: p.defR, c: p.defC, dir: p.dir, clue: p.d }));
    return {
        id: dateId + '-' + level, level, levelLabel: cfg.label, date: dateId,
        rows: cfg.rows, cols: cfg.cols, grid, defs, words: best.placed.length,
    };
}

module.exports = { generate, LEVELS };