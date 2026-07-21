// =====================================================================
//  LE MOT JUSTE — moteur de similarité (vecteurs faits main + cosinus).
// =====================================================================
const { MEAN, WORDS } = require('./words');

// Normalisation : insensible aux accents, à la casse, aux espaces multiples.
function norm(s) {
    return String(s || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // retire les accents
        .toUpperCase().trim().replace(/\s+/g, ' ');
}

const INDEX = new Map();       // MOT normalisé -> { m, centered, raw, custom }
for (const w of WORDS) {
    const centered = w.v.map((x, i) => x - MEAN[i]);
    INDEX.set(norm(w.m), { m: w.m, centered, raw: w.v, custom: false });
}

// Mots ajoutés depuis l'administration (persistés côté serveur, rechargés au démarrage).
function addCustomWord(name, rawVector) {
    const m = String(name || '').trim();
    if (!m || !Array.isArray(rawVector) || rawVector.length !== MEAN.length) return false;
    const centered = rawVector.map((x, i) => x - MEAN[i]);
    INDEX.set(norm(m), { m, centered, raw: rawVector, custom: true });
    return true;
}
function removeCustomWord(name) {
    const entry = INDEX.get(norm(name));
    if (!entry || !entry.custom) return false;
    INDEX.delete(norm(name));
    return true;
}

function findWord(input) {
    return INDEX.get(norm(input)) || null;
}
function hasWord(input) {
    return INDEX.has(norm(input));
}

function cosine(a, b) {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    if (!na || !nb) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Score affiché : cosinus * 100 (le mot secret lui-même vaut donc 100.00).
function score(guessInput, secretInput) {
    const g = findWord(guessInput), s = findWord(secretInput);
    if (!g || !s) return null;
    return Math.round(cosine(g.centered, s.centered) * 10000) / 100;
}

// Voisins les plus proches d'un mot (utile pour l'aperçu admin / indices futurs).
function nearest(secretInput, n) {
    const s = findWord(secretInput);
    if (!s) return [];
    const out = [];
    for (const [, entry] of INDEX) {
        if (entry.m === s.m) continue;
        out.push({ m: entry.m, score: Math.round(cosine(entry.centered, s.centered) * 10000) / 100 });
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, n || 10);
}

function allWords() { return [...INDEX.values()].map(e => e.m); }
function count() { return INDEX.size; }
function isCustom(input) { const e = INDEX.get(norm(input)); return !!(e && e.custom); }

// Ajout d'un mot depuis l'administration : on récupère le vecteur BRUT d'un
// mot déjà connu (le plus proche selon l'admin), avec une petite variation
// déterministe pour ne pas être un pur doublon.
function vectorLike(existingInput) {
    const base = INDEX.get(norm(existingInput));
    if (!base) return null;
    const seed = [...norm(existingInput)].reduce((h, ch) => (h * 33 + ch.charCodeAt(0)) >>> 0, 5381);
    let a = seed;
    const jitter = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return (((t ^ (t >>> 14)) >>> 0) / 4294967296 - 0.5) * 0.1; };
    return base.raw.map(x => Math.round((x + jitter()) * 10000) / 10000);
}

module.exports = { norm, findWord, hasWord, score, nearest, allWords, count, vectorLike, addCustomWord, removeCustomWord, isCustom, WORDS, MEAN };