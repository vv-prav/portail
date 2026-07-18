// =====================================================================
//  MOTS FLÉCHÉS — dictionnaire effectif.
//  Combine le dictionnaire de base (words.js, versionné dans le code)
//  avec les modifications faites depuis l'administration (stockées en base).
//
//  Une modification peut : ajouter un mot, corriger ses définitions,
//  changer son niveau, ou le retirer du tirage (sans toucher au fichier).
// =====================================================================
const base = require('./words');

const MIN_LEN = 3, MAX_LEN = 8;

let overrides = {};      // { MOT: { defs: [...], n: 1|2|3, deleted: bool } }
let cache = null;

function setOverrides(obj) {
    overrides = (obj && typeof obj === 'object') ? obj : {};
    cache = null;                                   // l'index sera reconstruit à la demande
}
function getOverrides() { return overrides; }

function build() {
    const words = {};
    for (let len = MIN_LEN; len <= MAX_LEN; len++) words[len] = [];

    const seen = new Set();
    // 1) le dictionnaire de base, éventuellement corrigé
    for (const [len, list] of Object.entries(base.WORDS)) {
        if (!words[len]) continue;
        for (const w of list) {
            const o = overrides[w.m];
            if (o && o.deleted) continue;
            words[len].push(o ? { m: w.m, defs: o.defs || w.defs, n: o.n || w.n } : w);
            seen.add(w.m);
        }
    }
    // 2) les mots ajoutés depuis l'administration
    for (const [m, o] of Object.entries(overrides)) {
        if (o.deleted || seen.has(m)) continue;
        const len = m.length;
        if (!words[len] || !o.defs || !o.defs.length) continue;
        words[len].push({ m, defs: o.defs, n: o.n || 2 });
    }

    const index = {};
    for (const [len, list] of Object.entries(words)) {
        index[len] = {};
        for (const w of list) (index[len][w.m[0]] = index[len][w.m[0]] || []).push(w);
    }
    return { WORDS: words, INDEX: index };
}

function words() { if (!cache) cache = build(); return cache.WORDS; }
function index() { if (!cache) cache = build(); return cache.INDEX; }

// Vérifie un mot avant enregistrement
function validate(m, defs, n) {
    if (typeof m !== 'string') return 'Mot manquant.';
    m = m.trim().toUpperCase();
    if (m.length < MIN_LEN || m.length > MAX_LEN) return `Le mot doit faire entre ${MIN_LEN} et ${MAX_LEN} lettres.`;
    if (!/^[A-Z]+$/.test(m)) return 'Lettres A-Z uniquement, sans accent ni espace.';
    if (!Array.isArray(defs) || !defs.length) return 'Au moins une définition est nécessaire.';
    if (defs.some(d => typeof d !== 'string' || d.trim().length < 3)) return 'Chaque définition doit faire au moins 3 caractères.';
    if (defs.length > 6) return 'Six définitions au maximum.';
    if (![1, 2, 3].includes(Number(n))) return 'Niveau invalide.';
    return null;
}

// Le mot existe-t-il déjà (base ou ajouts) ?
function has(m) {
    const o = overrides[m];
    if (o) return !o.deleted;
    return (base.WORDS[m.length] || []).some(w => w.m === m);
}
function find(m) {
    const o = overrides[m];
    const b = (base.WORDS[m.length] || []).find(w => w.m === m);
    if (o && o.deleted) return null;
    if (o) return { m, defs: o.defs || (b ? b.defs : []), n: o.n || (b ? b.n : 2), custom: true, inBase: !!b };
    if (b) return { m, defs: b.defs, n: b.n, custom: false, inBase: true };
    return null;
}

module.exports = {
    MIN_LEN, MAX_LEN,
    setOverrides, getOverrides,
    words, index, validate, has, find,
    baseWords: () => base.WORDS,
};