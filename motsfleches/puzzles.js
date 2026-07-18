// =====================================================================
//  MOTS FLÉCHÉS — banque de grilles (données vérifiées à la main).
//  Modèle : grille-solution (lettres ou null) + définitions ancrées.
//  Le mot d'une définition se lit dans la grille à partir de la case
//  adjacente, dans la direction donnée, jusqu'à une case null / le bord.
//  Comme tout dérive d'UNE grille-solution, les croisements sont cohérents.
//
//  Pour ajouter une grille : garde la même forme et vérifie que chaque
//  suite de lettres (à droite / en bas d'une définition) est un vrai mot.
// =====================================================================

module.exports = [
    {
        id: 'pont',
        rows: 5, cols: 6,
        grid: [
            [null, null, null, null, null, null],
            [null, 'P', 'I', 'A', 'N', 'O'],
            [null, 'O', 'C', 'E', 'A', 'N'],
            [null, 'N', 'A', 'G', 'E', 'R'],
            [null, 'T', 'A', 'B', 'L', 'E'],
        ],
        defs: [
            { r: 0, c: 1, dir: 'down',  clue: 'Ouvrage pour traverser une rivière' },
            { r: 1, c: 0, dir: 'right', clue: 'Instrument de musique à touches' },
            { r: 2, c: 0, dir: 'right', clue: "Vaste étendue d'eau salée" },
            { r: 3, c: 0, dir: 'right', clue: "Se déplacer dans l'eau" },
            { r: 4, c: 0, dir: 'right', clue: 'Meuble à quatre pieds' },
        ],
    },
    {
        id: 'chat',
        rows: 5, cols: 6,
        grid: [
            [null, null, null, null, null, null],
            [null, 'C', 'H', 'I', 'E', 'N'],
            [null, 'H', 'O', 'T', 'E', 'L'],
            [null, 'A', 'V', 'I', 'O', 'N'],
            [null, 'T', 'I', 'G', 'R', 'E'],
        ],
        defs: [
            { r: 0, c: 1, dir: 'down',  clue: 'Félin qui ronronne' },
            { r: 1, c: 0, dir: 'right', clue: "Meilleur ami de l'homme" },
            { r: 2, c: 0, dir: 'right', clue: 'On y dort en voyage' },
            { r: 3, c: 0, dir: 'right', clue: 'Il vole avec des passagers' },
            { r: 4, c: 0, dir: 'right', clue: 'Grand félin rayé' },
        ],
    },
    {
        id: 'rose',
        rows: 5, cols: 6,
        grid: [
            [null, null, null, null, null, null],
            [null, 'R', 'A', 'D', 'I', 'O'],
            [null, 'O', 'L', 'I', 'V', 'E'],
            [null, 'S', 'U', 'C', 'R', 'E'],
            [null, 'E', 'C', 'O', 'L', 'E'],
        ],
        defs: [
            { r: 0, c: 1, dir: 'down',  clue: 'Fleur du jardin, souvent rouge' },
            { r: 1, c: 0, dir: 'right', clue: "On l'écoute pour la musique et les infos" },
            { r: 2, c: 0, dir: 'right', clue: "Petit fruit vert de l'apéritif" },
            { r: 3, c: 0, dir: 'right', clue: 'Il adoucit le café' },
            { r: 4, c: 0, dir: 'right', clue: 'On y apprend à lire et à écrire' },
        ],
    },
    {
        id: 'lune',
        rows: 5, cols: 6,
        grid: [
            [null, null, null, null, null, null],
            [null, 'L', 'I', 'V', 'R', 'E'],
            [null, 'U', 'S', 'I', 'N', 'E'],
            [null, 'N', 'U', 'A', 'G', 'E'],
            [null, 'E', 'L', 'E', 'V', 'E'],
        ],
        defs: [
            { r: 0, c: 1, dir: 'down',  clue: 'Astre de la nuit' },
            { r: 1, c: 0, dir: 'right', clue: 'Il se lit page après page' },
            { r: 2, c: 0, dir: 'right', clue: 'Bâtiment où on fabrique' },
            { r: 3, c: 0, dir: 'right', clue: 'Il cache parfois le soleil' },
            { r: 4, c: 0, dir: 'right', clue: "Il apprend à l'école" },
        ],
    },
];