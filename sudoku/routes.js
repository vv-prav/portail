// =====================================================================
//  LE SUDOKU DU JOUR (/sudoku) — les routes
//
//  Sorti de `server.js`, qui dépassait les 3 500 lignes. Le module reçoit
//  ce dont il a besoin (le moteur des jeux du jour, le cache, les gardes
//  d'authentification) et rend ce que le reste du salon lui demande —
//  le pouls, la carte du profil, les résultats du jour, l'administration.
// =====================================================================
module.exports = function monterSudoku(app, deps) {
    const { express, requireAuth, requireAuthApi, currentUser, mfGet, mfSet,
            mfTodayId, mfShiftDay, mfSecondsToMidnight, dateDemandee, creerMoteur, racine } = deps;

    const sudokuJeu = require('./jeu');
    const mSudoku = creerMoteur('sudoku');
    const kSudokuGrille = (date) => `sudoku:grille:${date}`;
    function sudokuDuJour(date) {
        const cache = mfGet(kSudokuGrille(date));
        if (cache && cache.donnee) return cache;
        const g = sudokuJeu.tirage(mSudoku.tirageDuJour(date));
        mfSet(kSudokuGrille(date), g);
        return g;
    }

    app.use('/sudoku', requireAuth, express.static(racine + '/public/sudoku'));

    app.get('/api/sudoku/today', requireAuthApi, (req, res) => {
        const user = currentUser(req), today = mfTodayId();
        const date = dateDemandee(req.query.date, today);
        const g = sudokuDuJour(date);
        const prog = mSudoku.progression(user, date);
        const fini = !!(prog && prog.fini);
        res.json({
            date, today, archive: date !== today, nextIn: mfSecondsToMidnight(),
            donnee: g.donnee, indices: g.indices,
            progression: prog,
            solution: fini ? g.solution : undefined,
            serie: mSudoku.serie(user),
        });
    });

    app.post('/api/sudoku/start', requireAuthApi, (req, res) => {
        const user = currentUser(req), today = mfTodayId();
        const date = dateDemandee((req.body || {}).date, today);
        const prog = mSudoku.demarrer(user, date);
        res.json({ ok: true, debutA: date === today ? prog.debutA : null });
    });

    // Sauvegarde en cours de partie : reprendre sur un autre téléphone, ou après
    // avoir fermé l'onglet, sans rien perdre. Les notes au crayon restent dans
    // le navigateur — elles ne comptent pour rien.
    app.post('/api/sudoku/sauver', requireAuthApi, (req, res) => {
        const user = currentUser(req), today = mfTodayId();
        const b = req.body || {};
        const date = dateDemandee(b.date, today);
        const g = sudokuDuJour(date);
        const prog = mSudoku.progression(user, date) || mSudoku.demarrer(user, date);
        if (prog.fini) return res.json({ ok: true });
        prog.cases = sudokuJeu.nettoyer(b.cases, g.donnee);
        mSudoku.enregistrer(user, date, prog);
        res.json({ ok: true });
    });

    // ⚠️ Pas d'oracle : le serveur dit « juste » ou « pas encore », jamais
    // quelles cases sont fausses. Le navigateur signale déjà les conflits
    // visibles (deux chiffres identiques dans une ligne), ce qui ne révèle rien
    // qu'on ne voie à l'œil. Une grille pleine sans conflit est forcément la
    // solution, puisqu'elle est unique.
    app.post('/api/sudoku/valider', requireAuthApi, (req, res) => {
        const user = currentUser(req), today = mfTodayId();
        const b = req.body || {};
        const date = dateDemandee(b.date, today);
        const g = sudokuDuJour(date);
        const prog = mSudoku.progression(user, date) || mSudoku.demarrer(user, date);
        if (prog.fini) return res.status(400).json({ error: 'Grille déjà terminée.' });
        const cases = sudokuJeu.nettoyer(b.cases, g.donnee);
        prog.cases = cases;
        if (!sudokuJeu.estJuste(cases, g.solution)) {
            mSudoku.enregistrer(user, date, prog);
            return res.json({ ok: true, juste: false });
        }
        const ms = date === today ? mSudoku.tempsEcoule(prog) : null;
        prog.fini = true; prog.trouve = true; prog.ms = ms;
        prog.score = sudokuJeu.SCORE_RESOLU;
        mSudoku.enregistrer(user, date, prog);
        if (date === today) {
            mSudoku.noterJourJoue(user, date);
            mSudoku.inscrireAuClassement(user, date, prog.score, ms, {
                trouve: true,
                // Un temps anormalement court reste inscrit mais marqué, comme aux
                // Mots Fléchés : l'administration tranche.
                susp: ms != null && ms < sudokuJeu.TEMPS_MINI_MS,
            });
        }
        res.json({
            ok: true, juste: true, ms, score: prog.score, solution: g.solution,
            place: date === today ? mSudoku.placeDe(user, date) : null,
            classement: mSudoku.classement(date).slice(0, 15),
            serie: mSudoku.serie(user),
        });
    });

    // Abandonner montre la solution. La journée compte comme jouée — on a passé
    // du temps sur la grille — mais ne rapporte rien.
    app.post('/api/sudoku/abandon', requireAuthApi, (req, res) => {
        const user = currentUser(req), today = mfTodayId();
        const date = dateDemandee((req.body || {}).date, today);
        const g = sudokuDuJour(date);
        const prog = mSudoku.progression(user, date) || mSudoku.demarrer(user, date);
        if (!prog.fini) {
            prog.fini = true; prog.trouve = false; prog.abandon = true; prog.score = 0;
            prog.ms = date === today ? mSudoku.tempsEcoule(prog) : null;
            mSudoku.enregistrer(user, date, prog);
            if (date === today) {
                mSudoku.noterJourJoue(user, date);
                mSudoku.inscrireAuClassement(user, date, 0, prog.ms, { trouve: false });
            }
        }
        res.json({
            ok: true, solution: g.solution,
            classement: mSudoku.classement(date).slice(0, 15),
            place: date === today ? mSudoku.placeDe(user, date) : null,
        });
    });

    app.get('/api/sudoku/classement', requireAuthApi, (req, res) => {
        const date = dateDemandee(req.query.date, mfTodayId());
        res.json({ classement: mSudoku.classement(date).slice(0, 30) });
    });

    return { moteur: mSudoku, duJour: sudokuDuJour, kGrille: kSudokuGrille, jeu: sudokuJeu };
};
