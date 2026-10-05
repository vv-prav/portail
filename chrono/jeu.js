// =====================================================================
//  LE CHRONO — arrêter un chronomètre qu'on ne voit pas
//
//  Une durée est annoncée, on lance, rien ne s'affiche, et on arrête
//  quand on croit y être. Le plus près gagne.
//
//  Trois décisions, et elles font tout le jeu :
//
//  1. **TROIS manches, et c'est la somme des écarts qui classe.** Un seul
//     essai se joue à deux cents millisecondes de chance ; trois
//     récompensent la régularité, et une fausse manœuvre ne ruine pas la
//     journée. Les trois comptent, donc aucune ne se brade.
//
//  2. ⚠️ **Les cibles ne sont pas rondes.** 7,4 s plutôt que 8 s. Compter
//     « un-deux-trois » dans sa tête donne des secondes entières : la
//     décimale oblige à estimer au lieu de compter, et c'est la
//     différence entre un jeu d'adresse et un jeu de calcul mental.
//
//  3. ⚠️ **Rien ne doit battre pendant la manche** — ni barre qui se
//     remplit, ni point qui pulse. Tout ce qui a une cadence donne la
//     mesure, et le jeu n'existe plus. C'est une règle d'interface, mais
//     elle est écrite ici parce qu'elle est la règle du jeu.
// =====================================================================

const MANCHES = 3;

// Entre quatre et quinze secondes. En dessous, le temps de réaction pèse
// plus que l'estimation ; au-dessus, l'attente devient ennuyeuse et
// l'erreur n'est plus qu'une question de dérive.
const MIN_MS = 4000, MAX_MS = 15000;

// Les trois durées du jour, tirées de la graine de la date.
// ⚠️ Toujours une décimale, jamais un compte rond.
function duréesDuJour(hasard) {
    const out = [];
    for (let i = 0; i < MANCHES; i++) {
        const brut = MIN_MS + hasard() * (MAX_MS - MIN_MS);
        let ms = Math.round(brut / 100) * 100;            // au dixième de seconde
        if (ms % 1000 === 0) ms += 100;                   // jamais un compte rond
        out.push(ms);
    }
    return out;
}

// L'écart d'une manche, en millisecondes. Toujours positif : trop tôt et
// trop tard se valent, c'est la justesse qu'on mesure.
const ecart = (vise, fait) => Math.abs(Math.round(fait) - vise);

// ---------------------------------------------------------------------
//  LE BARÈME
//  Douze points au plus, comme partout ailleurs dans le salon. Les paliers
//  sont en millisecondes CUMULÉES sur les trois manches : un dixième de
//  seconde d'écart total relève de l'exploit, une demi-seconde est très
//  bien, et deux secondes restent honorables.
// ---------------------------------------------------------------------
const PALIERS = [
    [150, 12, 'au millième près'],
    [350, 10, 'd’une précision rare'],
    [700, 8, 'très juste'],
    [1500, 6, 'bien vu'],
    [3000, 4, 'dans les clous'],
    [6000, 2, 'approximatif'],
];
function score(ecartTotal) {
    for (const [seuil, points] of PALIERS) if (ecartTotal <= seuil) return points;
    return 1;        // ⚠️ Jamais zéro : on a joué, et on a forcément appuyé.
}
function mention(ecartTotal) {
    for (const [seuil, , mot] of PALIERS) if (ecartTotal <= seuil) return mot;
    return 'à côté';
}

// ⚠️ Un écart nul sur les trois manches n'arrive pas : le temps de réaction
// seul le rend impossible. Marqué comme suspect, inscrit mais invisible au
// classement public — même règle qu'au Sudoku, et l'administration tranche.
const ECART_SUSPECT_MS = 30;
const estSuspect = (ecartTotal) => ecartTotal < ECART_SUSPECT_MS;

module.exports = {
    MANCHES, MIN_MS, MAX_MS, PALIERS, ECART_SUSPECT_MS,
    duréesDuJour, ecart, score, mention, estSuspect,
};
