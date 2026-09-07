// =====================================================================
//  LE COMPTE EST BON
//
//  Six nombres, une cible entre 101 et 999, et les quatre opérations. On
//  ne peut utiliser chaque nombre qu'une fois, et chaque résultat
//  intermédiaire devient un nombre disponible.
//
//  Deux règles du jeu télévisé, gardées telles quelles parce qu'elles
//  sont ce qui rend le calcul jouable de tête :
//   · pas de nombre négatif — 3 − 8 est interdit ;
//   · pas de fraction — 7 ÷ 2 est interdit.
//
//  Aucun contenu à écrire : tout est tiré de la date. Le solveur exhaustif
//  sert à deux choses — garantir que la cible est atteignable avant de la
//  proposer, et montrer la solution à la fin.
// =====================================================================

// Les plaques du jeu : deux séries de 1 à 10, plus les quatre grandes.
const PETITES = Array.from({ length: 10 }, (_, i) => i + 1);
const GRANDES = [25, 50, 75, 100];

// ---------- Le solveur ----------
// Recherche exhaustive : à chaque étape on prend deux nombres, on applique une
// opération, et on recommence avec la liste raccourcie. Six nombres font au
// plus quelques centaines de milliers d'états, donc c'est instantané — et
// surtout c'est *complet*, ce qui est le seul moyen d'affirmer qu'une cible
// est atteignable ou de nommer la meilleure approche possible.
// `profondeurMax` borne le nombre d'étapes. C'est ce qui permet, en montant
// la borne de 1 à 5, d'obtenir la solution la plus COURTE (voir `resoudreCourt`).
function resoudre(nombres, cible, profondeurMax) {
    let meilleur = { valeur: null, ecart: Infinity, etapes: [] };
    const vus = new Set();

    function noter(valeur, etapes) {
        const ecart = Math.abs(valeur - cible);
        // À écart égal, on préfère la solution la plus courte : c'est celle
        // qu'un joueur peut relire et comprendre.
        if (ecart < meilleur.ecart || (ecart === meilleur.ecart && etapes.length < meilleur.etapes.length)) {
            meilleur = { valeur, ecart, etapes: etapes.slice() };
        }
    }

    function explorer(liste, etapes) {
        // Deux listes identiques atteintes par des chemins différents donnent
        // les mêmes suites : on ne les explore qu'une fois.
        // La profondeur fait partie de la clé : un même état atteint plus tôt
        // laisse plus d'étapes disponibles, donc mérite d'être réexploré. Sans
        // ça, un long chemin arrivé le premier condamne tous les plus courts.
        const cle = liste.slice().sort((a, b) => a - b).join(',') + '|' + etapes.length;
        if (vus.has(cle)) return;
        vus.add(cle);
        for (const v of liste) noter(v, etapes);
        if (meilleur.ecart === 0) return;
        if (profondeurMax && etapes.length >= profondeurMax) return;

        for (let i = 0; i < liste.length; i++) {
            for (let j = i + 1; j < liste.length; j++) {
                const a = Math.max(liste[i], liste[j]);
                const b = Math.min(liste[i], liste[j]);
                const reste = liste.filter((_, k) => k !== i && k !== j);
                const suites = [
                    ['+', a + b],
                    ['−', a - b],
                    ['×', a * b],
                ];
                if (b !== 0 && a % b === 0) suites.push(['÷', a / b]);
                for (const [op, r] of suites) {
                    // Un résultat nul ou une opération neutre n'ouvre rien :
                    // les écarter réduit l'arbre sans rien perdre.
                    if (r === 0) continue;
                    if ((op === '×' || op === '÷') && b === 1) continue;
                    if (op === '−' && r === 0) continue;
                    etapes.push({ a, op, b, r });
                    explorer(reste.concat(r), etapes);
                    etapes.pop();
                    if (meilleur.ecart === 0) return;
                }
            }
        }
    }

    explorer(nombres.slice(), []);
    return {
        exact: meilleur.ecart === 0,
        valeur: meilleur.valeur,
        ecart: meilleur.ecart,
        etapes: meilleur.etapes,
    };
}

// La solution la plus courte : on tente en une étape, puis deux, et ainsi de
// suite. Le premier chemin trouvé sans cette précaution passait volontiers par
// 23 850 pour retomber sur 952 — juste, mais illisible, et c'est pourtant ce
// qu'on affiche au joueur à la fin de la partie.
function resoudreCourt(nombres, cible) {
    let approche = null;
    for (let p = 1; p <= nombres.length - 1; p++) {
        const r = resoudre(nombres, cible, p);
        if (r.exact) return r;
        if (!approche || r.ecart < approche.ecart) approche = r;
    }
    return approche;
}

// ---------- Le tirage du jour ----------
// On tire jusqu'à obtenir une donne dont la cible est exactement atteignable :
// une cible impossible transforme le jeu en loterie, et personne ne peut savoir
// s'il a bien joué. Le nombre de grandes plaques est varié pour que les donnes
// ne se ressemblent pas toutes.
function tirage(hasard) {
    for (let essai = 0; essai < 60; essai++) {
        const nbGrandes = [0, 1, 1, 2, 2, 3][Math.floor(hasard() * 6)];
        const grandes = GRANDES.slice();
        const petites = PETITES.concat(PETITES);
        const nombres = [];
        for (let i = 0; i < nbGrandes; i++) nombres.push(grandes.splice(Math.floor(hasard() * grandes.length), 1)[0]);
        while (nombres.length < 6) nombres.push(petites.splice(Math.floor(hasard() * petites.length), 1)[0]);
        const cible = 101 + Math.floor(hasard() * 899);
        const sol = resoudreCourt(nombres, cible);
        if (!sol.exact) continue;
        return { nombres: nombres.sort((a, b) => b - a), cible, solution: sol.etapes };
    }
    // Filet de sécurité : ne devrait jamais servir, une donne exacte se trouve
    // presque toujours du premier coup.
    return { nombres: [100, 75, 50, 25, 9, 8], cible: 952, solution: resoudreCourt([100, 75, 50, 25, 9, 8], 952).etapes };
}

// ---------- La vérification d'un coup ----------
// Le serveur ne fait jamais confiance au total annoncé par le navigateur : il
// rejoue les étapes une à une, avec les mêmes règles.
function appliquer(op, a, b) {
    if (op === '+') return a + b;
    if (op === '−') return a - b >= 0 ? a - b : null;      // pas de négatif
    if (op === '×') return a * b;
    if (op === '÷') return (b !== 0 && a % b === 0) ? a / b : null;   // pas de fraction
    return null;
}
function rejouer(nombres, etapes) {
    let dispo = nombres.slice();
    for (const e of (etapes || [])) {
        const a = Number(e.a), b = Number(e.b);
        const ia = dispo.indexOf(a);
        if (ia < 0) return { erreur: 'Nombre indisponible.' };
        dispo.splice(ia, 1);
        const ib = dispo.indexOf(b);
        if (ib < 0) return { erreur: 'Nombre indisponible.' };
        dispo.splice(ib, 1);
        const r = appliquer(e.op, a, b);
        if (r === null) return { erreur: 'Opération interdite.' };
        dispo.push(r);
    }
    return { dispo, dernier: dispo.length ? dispo[dispo.length - 1] : null };
}

// Le score : 10 points pour le compte juste, puis de moins en moins à mesure
// qu'on s'éloigne. Au-delà de 10 d'écart, la manche ne rapporte rien — c'est
// le barème de l'émission, et il a le mérite d'être connu.
function score(ecart) {
    if (ecart === 0) return 10;
    if (ecart <= 1) return 8;
    if (ecart <= 5) return 6;
    if (ecart <= 10) return 4;
    return 0;
}

module.exports = { tirage, resoudre, resoudreCourt, rejouer, appliquer, score, PETITES, GRANDES };
