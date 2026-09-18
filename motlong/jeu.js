// =====================================================================
//  LE MOT LE PLUS LONG
//
//  Neuf lettres, le même tirage pour tout le monde : trouver le mot le
//  plus long qu'on puisse écrire avec, chaque lettre ne servant qu'une
//  fois. C'est la moitié « lettres » de l'émission dont Le compte est bon
//  est la moitié « chiffres ».
//
//  Le tirage part d'un vrai mot de neuf lettres, courant, dont on mélange
//  les lettres : le maximum possible est donc toujours de neuf, et la
//  réponse montrée à la fin est un mot qu'on connaît. Tirer neuf lettres
//  au hasard donnerait des tirages où le mieux possible serait un mot de
//  cinq lettres introuvable — une manche ratée d'avance.
//
//  Autant de propositions qu'on veut : c'est un choix de l'utilisateur.
//  La manche s'arrête quand on trouve le plus long mot possible, ou quand
//  on décide de s'arrêter. Le classement départage au temps, donc
//  chercher longtemps se paie quand même.
//
//  ⚠️ Conséquence assumée : sans limite, le serveur répond à volonté
//  « ce mot existe / n'existe pas ». Entre gens qui se connaissent, ça ne
//  vaut pas une règle de plus.
// =====================================================================

const DICO = require('./mots');

const ACCEPTES = DICO.acceptes.split(' ');
const TIRABLES = DICO.tirables.split(' ');
const CONNUS = new Set(ACCEPTES);
// Le rang de fréquence : 0 pour le mot le plus courant. Sert à montrer les
// mots qu'on connaît en premier.
const RANG = new Map(ACCEPTES.map((m, i) => [m, i]));

const NB_LETTRES = 9;
const LONGUEUR_MIN = 3;

function normaliser(s) {
    return String(s || '')
        .replace(/œ/gi, 'oe').replace(/æ/gi, 'ae')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toUpperCase().replace(/[^A-Z]/g, '');
}

// Le mot tient-il dans le tirage, chaque lettre au plus autant de fois
// qu'elle y figure ?
function tientDans(mot, lettres) {
    const reste = {};
    for (const c of lettres) reste[c] = (reste[c] || 0) + 1;
    for (const c of mot) {
        if (!reste[c]) return false;
        reste[c]--;
    }
    return true;
}

// Tous les mots les plus longs du tirage, les plus courants d'abord. Le
// dictionnaire entier est parcouru : 70 000 mots, une dizaine de
// millisecondes, et le résultat est mis en cache avec le tirage.
function meilleursMots(lettres) {
    let max = 0, liste = [];
    for (const m of ACCEPTES) {
        if (m.length < max || m.length > lettres.length) continue;
        if (!tientDans(m, lettres)) continue;
        if (m.length > max) { max = m.length; liste = [m]; } else liste.push(m);
    }
    liste.sort((a, b) => RANG.get(a) - RANG.get(b));
    return { max, meilleurs: liste.slice(0, 6) };
}

function tirage(hasard, recents) {
    const exclus = new Set(recents || []);
    let mot = null;
    for (let i = 0; i < 40 && !mot; i++) {
        const m = TIRABLES[Math.floor(hasard() * TIRABLES.length)];
        if (!exclus.has(m)) mot = m;
    }
    if (!mot) mot = TIRABLES[Math.floor(hasard() * TIRABLES.length)];
    // On mélange jusqu'à ce que le tirage ne se lise pas tel quel : trouver
    // le mot écrit en toutes lettres ne serait pas un jeu.
    let lettres = mot;
    for (let i = 0; i < 20 && (lettres === mot || CONNUS.has(lettres)); i++) {
        const t = mot.split('');
        for (let j = t.length - 1; j > 0; j--) { const k = Math.floor(hasard() * (j + 1)); [t[j], t[k]] = [t[k], t[j]]; }
        lettres = t.join('');
    }
    const { max, meilleurs } = meilleursMots(lettres);
    return { lettres, source: mot, max, meilleurs };
}

// Le verdict sur un mot proposé. `cout` dit si la proposition est décomptée.
function verifier(saisie, lettres) {
    const mot = normaliser(saisie);
    if (mot.length < LONGUEUR_MIN) return { mot, ok: false, cout: false, raison: `Au moins ${LONGUEUR_MIN} lettres.` };
    if (!tientDans(mot, lettres)) return { mot, ok: false, cout: false, raison: 'Ce mot utilise une lettre qui n’est pas dans le tirage.' };
    if (!CONNUS.has(mot)) return { mot, ok: false, cout: true, raison: `${mot} n’est pas dans le dictionnaire.` };
    return { mot, ok: true, cout: true };
}

module.exports = {
    tirage, verifier, meilleursMots, normaliser, tientDans,
    NB_LETTRES, LONGUEUR_MIN,
    taille: () => ({ acceptes: ACCEPTES.length, tirables: TIRABLES.length }),
};
