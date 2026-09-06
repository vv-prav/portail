// =====================================================================
//  MODULE YAMS — branché sur le serveur du salon (app + io partagés).
//  Identité fournie par le cookie signé du portail (pas de compte séparé),
//  exactement comme Petit Bac.
// =====================================================================
const crypto = require('crypto');

module.exports = function attachYams(app, io, store) {

const mfGet = store && store.get ? store.get : () => undefined;
const mfSet = store && store.set ? store.set : () => {};

const MAX_PLAYERS = 4;
const MIN_PLAYERS = 1;
const PSEUDO_MAX = 20;
const MAX_ROLLS = 3;

const SALON_SECRET = process.env.SESSION_SECRET || 'dev-secret-a-changer';
function salonPseudoFromCookie(cookieHeader) {
    const m = /(?:^|;\s*)salon_session=([^;]+)/.exec(cookieHeader || '');
    if (!m) return null;
    const token = decodeURIComponent(m[1]);
    const i = token.indexOf('.');
    if (i < 0) return null;
    const payload = token.slice(0, i), sig = token.slice(i + 1);
    const expected = crypto.createHmac('sha256', SALON_SECRET).update(payload).digest('base64url');
    if (sig.length !== expected.length) return null;
    try { if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null; } catch (e) { return null; }
    let data = null;
    try { data = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch (e) { return null; }
    if (!data || !data.u || !data.exp || data.exp < Date.now()) return null;
    return String(data.u).slice(0, PSEUDO_MAX);
}

// =====================================================================
//  LE BARÈME — chaque catégorie sait calculer son propre score à partir
//  des cinq dés. Testé isolément avant intégration, valeurs standard du
//  Yams français (identiques au Yahtzee).
// =====================================================================
const CATEGORIES = ['uns', 'deux', 'trois', 'quatre', 'cinq', 'six', 'brelan', 'carre', 'full', 'petiteSuite', 'grandeSuite', 'yams', 'chance'];
const UPPER_CATEGORIES = ['uns', 'deux', 'trois', 'quatre', 'cinq', 'six'];
// Un tour a une durée maximale. Sans elle, un joueur qui pose son téléphone
// fige une table de cinq personnes pour de bon : au tour par tour, l'attente
// n'a aucune limite naturelle. Passé le délai, le tour saute ; au deuxième
// saut d'affilée, le joueur est considéré comme parti et cesse de bloquer la
// fin de partie (sa feuille est conservée telle quelle, il peut revenir).
const TOUR_MAX_MS = 90000;
const SAUTS_AVANT_ABANDON = 2;

const BONUS_THRESHOLD = 63;
const BONUS_POINTS = 35;

function diceCounts(dice) {
    const c = [0, 0, 0, 0, 0, 0, 0];
    dice.forEach(d => c[d]++);
    return c;
}
function diceSum(dice) { return dice.reduce((a, b) => a + b, 0); }

const SCORERS = {
    uns: d => diceCounts(d)[1] * 1,
    deux: d => diceCounts(d)[2] * 2,
    trois: d => diceCounts(d)[3] * 3,
    quatre: d => diceCounts(d)[4] * 4,
    cinq: d => diceCounts(d)[5] * 5,
    six: d => diceCounts(d)[6] * 6,
    brelan: d => diceCounts(d).some(c => c >= 3) ? diceSum(d) : 0,
    carre: d => diceCounts(d).some(c => c >= 4) ? diceSum(d) : 0,
    full: d => {
        const c = diceCounts(d).slice(1);
        return c.includes(3) && c.includes(2) ? 25 : 0;
    },
    petiteSuite: d => {
        const s = new Set(d);
        const seqs = [[1, 2, 3, 4], [2, 3, 4, 5], [3, 4, 5, 6]];
        return seqs.some(seq => seq.every(n => s.has(n))) ? 30 : 0;
    },
    grandeSuite: d => {
        const sorted = [...d].sort((a, b) => a - b).join('');
        return (sorted === '12345' || sorted === '23456') ? 40 : 0;
    },
    yams: d => diceCounts(d).some(c => c === 5) ? 50 : 0,
    chance: d => diceSum(d),
};

// RÈGLE DU JOKER — un deuxième Yams dans la même partie, la case Yams déjà
// remplie : les cinq dés identiques valent alors la valeur pleine de la case
// choisie, même si la figure n'y est pas. Sans ça, un Yams ne pouvait pas
// servir de full (5 dés identiques y valaient 0), ce qui n'est la règle nulle
// part et punissait précisément le meilleur coup du jeu.
const JOKER_FIXE = { full: 25, petiteSuite: 30, grandeSuite: 40, yams: 50 };
function jokerApplicable(cat, dice, scores) {
    if (!scores || scores.yams === null) return false;      // la case Yams doit être remplie
    if (diceCounts(dice).every(c => c !== 5)) return false;  // et les dés former un Yams
    return scores[cat] === null;
}
function scoreAvecJoker(cat, dice) {
    if (JOKER_FIXE[cat] !== undefined) return JOKER_FIXE[cat];
    return computePossibleScore(cat, dice);   // chiffres, brelan, carré et chance sont déjà justes
}
// Ce que rapporterait chaque case à CE joueur-là, joker compris. C'est aussi ce
// que le client affiche en aperçu : les deux doivent dire la même chose.
function scoresPossibles(dice, scores) {
    return Object.fromEntries(CATEGORIES.map(c => [c,
        jokerApplicable(c, dice, scores) ? scoreAvecJoker(c, dice) : computePossibleScore(c, dice)]));
}
function computePossibleScore(cat, dice) {
    const fn = SCORERS[cat];
    return fn ? fn(dice) : 0;
}
function upperTotal(scores) {
    return UPPER_CATEGORIES.reduce((s, c) => s + (scores[c] || 0), 0);
}
function grandTotal(p) {
    const scores = p.scores;
    const upper = upperTotal(scores);
    const bonus = upper >= BONUS_THRESHOLD ? BONUS_POINTS : 0;
    const lower = CATEGORIES.filter(c => !UPPER_CATEGORIES.includes(c)).reduce((s, c) => s + (scores[c] || 0), 0);
    return upper + bonus + lower + (p.yamsBonus || 0);
}

// =====================================================================
//  STATISTIQUES PERSISTANTES — une fiche par joueur, qui survit à la
//  partie. Parties jouées et gagnées, Yams réalisés, meilleur score, et
//  un décompte face à chaque adversaire pour en tirer une "bête noire"
//  (celui ou celle qui vous bat le plus souvent).
// =====================================================================
const kYamsStats = (pseudo) => `yams:stats:${norm(pseudo)}`;
const STATS_INDEX_KEY = 'yams:statsIndex';
function norm(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim(); }
function defaultYamsStats() {
    return {
        gamesPlayed: 0, gamesWon: 0, gamesTied: 0, totalYams: 0, bonusYams: 0,
        bestScore: 0, worstScore: 0, totalPoints: 0,      // totalPoints donne la moyenne
        bonus63: 0,                                        // parties où le bonus des 63 est tombé
        serieVictoires: 0, meilleureSerie: 0,
        soloPlayed: 0, soloBest: 0,
        dernierePartie: 0,
        // Une ligne par case : combien de fois remplie, le cumul, le meilleur,
        // et combien de fois barrée à zéro. C'est ce qui permet de dire à
        // quelqu'un quelle case lui rapporte et laquelle il sacrifie toujours.
        parCategorie: {},
        vsOpponent: {},
    };
}
function ligneCategorie(stats, cat) {
    if (!stats.parCategorie[cat]) stats.parCategorie[cat] = { fois: 0, total: 0, meilleur: 0, zeros: 0 };
    return stats.parCategorie[cat];
}
function loadYamsStats(pseudo) {
    const s = mfGet(kYamsStats(pseudo));
    return s && typeof s === 'object'
        ? { ...defaultYamsStats(), ...s, vsOpponent: { ...(s.vsOpponent || {}) }, parCategorie: { ...(s.parCategorie || {}) } }
        : defaultYamsStats();
}
function saveYamsStats(pseudo, stats) {
    mfSet(kYamsStats(pseudo), stats);
    const index = mfGet(STATS_INDEX_KEY) || [];
    if (!index.includes(pseudo)) { index.push(pseudo); mfSet(STATS_INDEX_KEY, index); }
}
// La "bête noire" : parmi les adversaires rencontrés au moins 2 fois, celui qui a
// gagné le plus souvent contre ce joueur (à égalité, le plus de parties jouées ensemble).
const rencontres = (v) => (v.wins || 0) + (v.losses || 0) + (v.draws || 0);
function nemesisOf(stats) {
    const entries = Object.entries(stats.vsOpponent).filter(([, v]) => (v.losses || 0) >= 2);
    if (!entries.length) return null;
    entries.sort((a, b) => (b[1].losses - a[1].losses) || (rencontres(b[1]) - rencontres(a[1])));
    return { pseudo: entries[0][0], losses: entries[0][1].losses };
}
// Enregistre la fin d'une vraie partie (pas juste une manche) : une partie jouée pour
// chacun, une victoire pour le gagnant, une défaite face à lui pour tous les autres.
function finalizeYamsStats(g) {
    const winner = winnerOf(g);          // null si égalité
    const gagnants = gagnantsDe(g);
    const nul = gagnants.length > 1;
    const nemesisDefeats = [];
    for (const p of g.players) {
        const stats = loadYamsStats(p.pseudo);
        const myTotal = grandTotal(p);

        // Une partie lancée seul ne se gagne contre personne : elle nourrit le
        // record et le compteur solo, jamais le palmarès ni le face-à-face.
        if (g.solo) {
            stats.soloPlayed++;
            if (myTotal > stats.soloBest) stats.soloBest = myTotal;
            if (myTotal > stats.bestScore) stats.bestScore = myTotal;
            stats.dernierePartie = Date.now();
            for (const cat of CATEGORIES) noterCategorie(stats, cat, p.scores[cat]);
            saveYamsStats(p.pseudo, stats);
            continue;
        }

        // Avant de toucher aux stats de ce tour-ci : est-ce que l'adversaire qui vient
        // de perdre était justement la bête noire du gagnant ?
        if (p.pseudo === winner) {
            const oldNemesis = nemesisOf(stats);
            const beatenNemesis = g.players.find(o => o.pseudo !== winner && oldNemesis && oldNemesis.pseudo === o.pseudo);
            if (beatenNemesis) nemesisDefeats.push({ winner, nemesis: beatenNemesis.pseudo });
        }
        stats.gamesPlayed++;
        stats.totalPoints += myTotal;
        stats.dernierePartie = Date.now();
        if (myTotal > stats.bestScore) stats.bestScore = myTotal;
        if (!stats.worstScore || myTotal < stats.worstScore) stats.worstScore = myTotal;
        if (upperTotal(p.scores) >= BONUS_THRESHOLD) stats.bonus63++;
        for (const cat of CATEGORIES) noterCategorie(stats, cat, p.scores[cat]);

        if (nul) stats.gamesTied++;
        else if (p.pseudo === winner) {
            stats.gamesWon++;
            stats.serieVictoires++;
            if (stats.serieVictoires > stats.meilleureSerie) stats.meilleureSerie = stats.serieVictoires;
        } else stats.serieVictoires = 0;

        for (const other of g.players) {
            if (other.pseudo === p.pseudo) continue;
            if (!stats.vsOpponent[other.pseudo]) stats.vsOpponent[other.pseudo] = { wins: 0, losses: 0, draws: 0 };
            const duel = stats.vsOpponent[other.pseudo];
            if (duel.draws === undefined) duel.draws = 0;
            if (nul) duel.draws++;
            else if (p.pseudo === winner) duel.wins++;
            else if (other.pseudo === winner) duel.losses++;
        }
        saveYamsStats(p.pseudo, stats);
    }
    recordYamsHistory(g, winner, gagnants);
    return nemesisDefeats;
}
// Une case remplie nourrit sa ligne : combien de fois, le cumul, le record, et
// combien de fois barrée. Une case laissée vide (joueur parti) ne compte pas.
function noterCategorie(stats, cat, valeur) {
    if (valeur === null || valeur === undefined) return;
    const l = ligneCategorie(stats, cat);
    l.fois++;
    l.total += valeur;
    if (valeur > l.meilleur) l.meilleur = valeur;
    if (valeur === 0) l.zeros++;
}
// =====================================================================
//  LES STATISTIQUES SERVIES AU CLIENT
//  Tout est recalculé depuis les fiches : rien de nouveau à stocker, et un
//  barème ou un classement peut changer sans migration.
// =====================================================================
const moyenne = (total, n) => (n ? Math.round(total / n) : 0);

// La fiche d'un joueur, telle qu'il la voit dans « Mes statistiques ».
function ficheComplete(pseudo) {
    const s = loadYamsStats(pseudo);
    const joues = s.gamesPlayed;
    return {
        pseudo,
        gamesPlayed: joues, gamesWon: s.gamesWon, gamesTied: s.gamesTied,
        gamesLost: Math.max(0, joues - s.gamesWon - s.gamesTied),
        winRate: joues ? Math.round((s.gamesWon / joues) * 100) : null,
        totalYams: s.totalYams, bonusYams: s.bonusYams,
        bestScore: s.bestScore, worstScore: s.worstScore,
        moyenne: moyenne(s.totalPoints, joues),
        bonus63: s.bonus63,
        tauxBonus63: joues ? Math.round((s.bonus63 / joues) * 100) : null,
        serieVictoires: s.serieVictoires, meilleureSerie: s.meilleureSerie,
        soloPlayed: s.soloPlayed, soloBest: s.soloBest,
        dernierePartie: s.dernierePartie || 0,
        nemesis: nemesisOf(s),
        // Le miroir de la bête noire : celui qu'on bat le plus souvent.
        souffreDouleur: souffreDouleurDe(s),
        categories: detailCategories(s),
        forces: forcesEtFaiblesses(s),
        opponents: Object.keys(s.vsOpponent),
        duels: Object.entries(s.vsOpponent).map(([adv, v]) => ({
            pseudo: adv, wins: v.wins || 0, losses: v.losses || 0, draws: v.draws || 0,
        })).sort((a, b) => rencontres(b) - rencontres(a)),
    };
}
// Celui qu'on bat le plus souvent — le pendant de la bête noire, qui manquait.
function souffreDouleurDe(stats) {
    const entries = Object.entries(stats.vsOpponent).filter(([, v]) => (v.wins || 0) >= 2);
    if (!entries.length) return null;
    entries.sort((a, b) => (b[1].wins - a[1].wins) || (rencontres(b[1]) - rencontres(a[1])));
    return { pseudo: entries[0][0], wins: entries[0][1].wins };
}
// Une ligne par case : moyenne, record, et combien de fois barrée.
function detailCategories(stats) {
    return CATEGORIES.map(cat => {
        const l = stats.parCategorie[cat] || { fois: 0, total: 0, meilleur: 0, zeros: 0 };
        return {
            cat, fois: l.fois, moyenne: moyenne(l.total, l.fois), meilleur: l.meilleur, zeros: l.zeros,
            tauxZero: l.fois ? Math.round((l.zeros / l.fois) * 100) : null,
        };
    });
}
// Ce qui se dit d'un joueur en une phrase : sa meilleure case comparée à la
// moyenne du salon, et celle qu'il sacrifie le plus souvent.
function forcesEtFaiblesses(stats) {
    const salon = moyennesDuSalon();
    const parCat = new Map(salon.map(c => [c.cat, c.moyenne]));
    let force = null, faiblesse = null;
    for (const cat of CATEGORIES) {
        const l = stats.parCategorie[cat];
        if (!l || l.fois < 3) continue;         // pas d'avis sur trois parties
        const moy = moyenne(l.total, l.fois);
        const ref = parCat.get(cat) || 0;
        const ecart = moy - ref;
        if (!force || ecart > force.ecart) force = { cat, moyenne: moy, salon: ref, ecart };
        if (!faiblesse || ecart < faiblesse.ecart) faiblesse = { cat, moyenne: moy, salon: ref, ecart };
    }
    // La case la plus souvent barrée, indépendamment de la moyenne.
    let barree = null;
    for (const cat of CATEGORIES) {
        const l = stats.parCategorie[cat];
        if (!l || l.fois < 3 || !l.zeros) continue;
        const taux = l.zeros / l.fois;
        if (!barree || taux > barree.taux) barree = { cat, taux: Math.round(taux * 100), zeros: l.zeros, fois: l.fois };
    }
    return { force, faiblesse, barree };
}
// Le classement du salon, enrichi de tout ce qui se compare.
function classementComplet() {
    return (mfGet(STATS_INDEX_KEY) || []).map(pseudo => {
        const s = loadYamsStats(pseudo);
        return {
            pseudo, gamesPlayed: s.gamesPlayed, gamesWon: s.gamesWon, gamesTied: s.gamesTied,
            bestScore: s.bestScore, totalYams: s.totalYams,
            moyenne: moyenne(s.totalPoints, s.gamesPlayed),
            tauxBonus63: s.gamesPlayed ? Math.round((s.bonus63 / s.gamesPlayed) * 100) : 0,
            meilleureSerie: s.meilleureSerie,
            winRate: s.gamesPlayed ? Math.round((s.gamesWon / s.gamesPlayed) * 100) : 0,
        };
    }).filter(r => r.gamesPlayed > 0 || r.bestScore > 0)
      .sort((a, b) => b.gamesWon - a.gamesWon || b.winRate - a.winRate || b.gamesPlayed - a.gamesPlayed);
}
// La moyenne du salon pour chaque case : le point de comparaison qui manquait
// pour dire à quelqu'un s'il est bon quelque part.
let salonCache = null, salonCacheAt = 0;
function moyennesDuSalon() {
    if (salonCache && Date.now() - salonCacheAt < 30000) return salonCache;
    const cumul = {};
    for (const cat of CATEGORIES) cumul[cat] = { total: 0, fois: 0, meilleur: 0, porteur: null, zeros: 0 };
    for (const pseudo of (mfGet(STATS_INDEX_KEY) || [])) {
        const st = loadYamsStats(pseudo);
        for (const cat of CATEGORIES) {
            const l = st.parCategorie[cat];
            if (!l || !l.fois) continue;
            cumul[cat].total += l.total; cumul[cat].fois += l.fois; cumul[cat].zeros += l.zeros;
            if (l.meilleur > cumul[cat].meilleur) { cumul[cat].meilleur = l.meilleur; cumul[cat].porteur = pseudo; }
        }
    }
    salonCache = CATEGORIES.map(cat => ({
        cat, moyenne: moyenne(cumul[cat].total, cumul[cat].fois), fois: cumul[cat].fois,
        meilleur: cumul[cat].meilleur, porteur: cumul[cat].porteur,
        tauxZero: cumul[cat].fois ? Math.round((cumul[cat].zeros / cumul[cat].fois) * 100) : 0,
    }));
    salonCacheAt = Date.now();
    return salonCache;
}
// Le face-à-face, avec les parties réellement jouées ensemble.
function faceAFace(pseudo, adversaire) {
    const mine = loadYamsStats(pseudo), theirs = loadYamsStats(adversaire);
    const v = mine.vsOpponent[adversaire] || { wins: 0, losses: 0, draws: 0 };
    const histo = (mfGet(HISTORY_KEY) || []).filter(g =>
        !g.solo && (g.players || []).some(p => p.pseudo === pseudo) && (g.players || []).some(p => p.pseudo === adversaire));
    return {
        opponent: adversaire,
        myWins: v.wins || 0, myLosses: v.losses || 0, draws: v.draws || 0,
        totalGames: (v.wins || 0) + (v.losses || 0) + (v.draws || 0),
        myBest: mine.bestScore, theirBest: theirs.bestScore,
        myMoyenne: moyenne(mine.totalPoints, mine.gamesPlayed),
        theirMoyenne: moyenne(theirs.totalPoints, theirs.gamesPlayed),
        myYams: mine.totalYams, theirYams: theirs.totalYams,
        // Les dernières confrontations, pour voir la tendance.
        recentes: histo.slice(0, 8).map(g => ({
            endedAt: g.endedAt,
            moi: (g.players.find(p => p.pseudo === pseudo) || {}).total || 0,
            lui: (g.players.find(p => p.pseudo === adversaire) || {}).total || 0,
            gagnant: g.winner,
        })),
    };
}

const HISTORY_KEY = 'yams:history';
const HISTORY_MAX = 150;
function recordYamsHistory(g, winner, gagnants) {
    const list = mfGet(HISTORY_KEY) || [];
    list.unshift({
        id: g.id, endedAt: Date.now(), winner, gagnants: gagnants || [], solo: !!g.solo,
        players: g.players.map(p => ({
            pseudo: p.pseudo, total: grandTotal(p), yams: p.yamsThisGame || 0,
            bonus: upperTotal(p.scores) >= BONUS_THRESHOLD,
            scores: { ...p.scores },       // la feuille complète, pour la revoir plus tard
        })),
    });
    if (list.length > HISTORY_MAX) list.length = HISTORY_MAX;
    mfSet(HISTORY_KEY, list);
}

// =====================================================================
//  ÉTAT DES PARTIES
// =====================================================================
const games = {};       // id -> partie
const socketGame = {};  // socket.id -> id de partie
let nextId = 1;
const roomOf = (g) => 'yams:' + g.id;

function freshScores() {
    const s = {};
    CATEGORIES.forEach(c => { s[c] = null; });
    return s;
}
function rollDice(count) {
    const out = [];
    for (let i = 0; i < count; i++) out.push(1 + Math.floor(Math.random() * 6));
    return out;
}

function publicGames() {
    return Object.values(games).filter(g => g.status !== 'ended').map(g => ({
        id: g.id, host: g.host, status: g.status,
        players: g.players.length, maxPlayers: MAX_PLAYERS,
        alive: g.players.filter(p => p.connected).length,
        spectators: (g.spectators || []).length,
    }));
}
function broadcastLobby() { io.emit('yams_games', publicGames()); }

function playerView(g) {
    return g.players.map(p => ({
        pseudo: p.pseudo, connected: p.connected, scores: p.scores, yamsBonus: p.yamsBonus || 0, total: grandTotal(p),
        parti: !!p.parti,
    }));
}
// Le meilleur score jamais réalisé dans le salon, tous joueurs confondus.
// Recalculé depuis les fiches existantes, avec un cache court : c'est lu à
// chaque diffusion d'état, soit plusieurs fois par tour.
let recordCache = null, recordCacheAt = 0;
function recordDuSalon() {
    if (recordCache && Date.now() - recordCacheAt < 30000) return recordCache;
    let best = null;
    for (const pseudo of (mfGet(STATS_INDEX_KEY) || [])) {
        const st = loadYamsStats(pseudo);
        if (st.bestScore > 0 && (!best || st.bestScore > best.score)) best = { pseudo, score: st.bestScore };
    }
    recordCache = best; recordCacheAt = Date.now();
    return best;
}
function stateForClient(g) {
    const current = g.players[g.turnIndex];
    return {
        id: g.id, host: g.host, status: g.status,
        players: playerView(g),
        spectators: (g.spectators || []).map(x => x.pseudo),
        turnIndex: g.turnIndex, turnPseudo: current ? current.pseudo : null,
        tour: numeroDeTour(g), toursTotal: CATEGORIES.length,
        tourFinAt: g.status === 'playing' ? (g.tourFinAt || null) : null,
        // Les derniers coups joués : quand ce n'est pas son tour, on n'avait
        // rien à regarder pendant que les autres jouaient.
        journal: (g.journal || []).slice(-4),
        dice: g.dice, held: g.held, rollsLeft: g.rollsLeft, hasRolled: g.hasRolled,
        // Les aperçus sont ceux du joueur qui a la main — le joker dépend de sa
        // feuille, donc un calcul global mentirait dès qu'il s'applique.
        possible: g.hasRolled && current ? scoresPossibles(g.dice, current.scores) : null,
        winner: g.status === 'ended' ? winnerOf(g) : null,
        gagnants: g.status === 'ended' ? gagnantsDe(g) : null,
        solo: !!g.solo,
        // La série de revanches : le cumul des manches déjà jouées sur cette table.
        manche: g.manche || 1,
        serie: g.serie && Object.keys(g.serie).length ? g.serie : null,
        // Le record du salon, pour avoir un adversaire même quand on mène.
        record: recordDuSalon(),
    };
}
// À totaux égaux il n'y a pas de vainqueur. L'ancienne version prenait le
// premier joueur inscrit — et cette fausse victoire était écrite dans les
// statistiques, le face-à-face et l'historique, sans que rien ne l'indique.
function gagnantsDe(g) {
    if (!g.players.length) return [];
    const best = Math.max(...g.players.map(grandTotal));
    return g.players.filter(p => grandTotal(p) === best).map(p => p.pseudo);
}
function winnerOf(g) {
    const gagnants = gagnantsDe(g);
    return gagnants.length === 1 ? gagnants[0] : null;
}
function broadcastState(g) { io.to(roomOf(g)).emit('yams_state', stateForClient(g)); }

function startTurn(g) {
    g.dice = [1, 1, 1, 1, 1];
    g.held = [false, false, false, false, false];
    g.rollsLeft = MAX_ROLLS;
    g.hasRolled = false;
    armerMinuteur(g);
}
function armerMinuteur(g) {
    if (g.timer) clearTimeout(g.timer);
    g.tourFinAt = Date.now() + TOUR_MAX_MS;
    g.timer = setTimeout(() => tourExpire(g), TOUR_MAX_MS);
}
function desarmerMinuteur(g) {
    if (g.timer) { clearTimeout(g.timer); g.timer = null; }
    g.tourFinAt = null;
}
function tourExpire(g) {
    if (!g || g.status !== 'playing') return;
    const p = g.players[g.turnIndex];
    if (!p) return;
    p.sauts = (p.sauts || 0) + 1;
    if (p.sauts >= SAUTS_AVANT_ABANDON) p.parti = true;
    io.to(roomOf(g)).emit('yams_tour_saute', { pseudo: p.pseudo, parti: !!p.parti });
    advanceTurn(g);
}

// Un joueur ne compte dans le déroulement que s'il est là. Déconnecté ou parti,
// sa feuille est gardée intacte, mais il ne fait plus attendre les autres.
function joueurPresent(p) { return p.connected && !p.parti; }
function numeroDeTour(g) {
    const p = g.players[g.turnIndex];
    if (!p) return 1;
    return Math.min(CATEGORIES.length, CATEGORIES.filter(c => p.scores[c] !== null).length + 1);
}

function allCategoriesFilled(p) {
    return CATEGORIES.every(c => p.scores[c] !== null);
}
function terminerPartie(g) {
    desarmerMinuteur(g);
    g.status = 'ended';
    const nemesisDefeats = finalizeYamsStats(g);
    nemesisDefeats.forEach(d => io.to(roomOf(g)).emit('yams_nemesis_defeated', d));
    broadcastState(g);
    broadcastLobby();
}
function advanceTurn(g) {
    // Le tour passe au joueur présent suivant qui n'a pas encore toutes ses
    // cases remplies. La partie s'arrête quand plus personne n'est présent, ou
    // quand tous les présents ont rempli leur feuille — un joueur déconnecté
    // ne fige plus la table indéfiniment, ce qui était le cas avant.
    const presents = g.players.filter(joueurPresent);
    if (!presents.length || presents.every(allCategoriesFilled)) { terminerPartie(g); return; }
    let next = g.turnIndex;
    for (let i = 0; i < g.players.length; i++) {
        next = (next + 1) % g.players.length;
        const p = g.players[next];
        if (joueurPresent(p) && !allCategoriesFilled(p)) { g.turnIndex = next; break; }
    }
    startTurn(g);
    broadcastState(g);
}

function leaveCurrent(socket) {
    const gid = socketGame[socket.id];
    if (!gid) return;
    const g = games[gid];
    delete socketGame[socket.id];
    if (!g) return;
    const p = g.players.find(x => x.sid === socket.id);
    if (p) p.connected = false;
    if (p) p.parti = true;
    if (g.spectators) g.spectators = g.spectators.filter(x => x.sid !== socket.id);
    if (g.status === 'playing' && g.players[g.turnIndex] === p) {
        socket.leave(roomOf(g));
        advanceTurn(g);
        broadcastLobby();
        return;
    }
    if (g.status === 'lobby') {
        g.players = g.players.filter(x => x.sid !== socket.id);
        if (!g.players.length) { desarmerMinuteur(g); delete games[gid]; broadcastLobby(); return; }
        if (g.host === (p && p.pseudo)) g.host = g.players[0].pseudo;
    }
    socket.leave(roomOf(g));
    broadcastState(g);
    broadcastLobby();
}

io.on('connection', (socket) => {

    socket.on('yams_identify', (ack) => {
        const pseudo = salonPseudoFromCookie(socket.handshake.headers.cookie);
        socket.data.yamsPseudo = pseudo;
        if (typeof ack === 'function') ack({ ok: !!pseudo, pseudo });
    });

    socket.on('yams_list', () => { socket.emit('yams_games', publicGames()); });

    socket.on('yams_create', () => {
        const pseudo = socket.data.yamsPseudo;
        if (!pseudo) return socket.emit('yams_error', 'Session expirée, reviens au salon.');
        const id = 'y' + (nextId++);
        const g = {
            id, host: pseudo, status: 'lobby',
            players: [{ sid: socket.id, pseudo, connected: true, scores: freshScores(), yamsBonus: 0 }],
            spectators: [],
            turnIndex: 0, dice: [1, 1, 1, 1, 1], held: [false, false, false, false, false],
            rollsLeft: MAX_ROLLS, hasRolled: false,
        };
        games[id] = g;
        socketGame[socket.id] = id;
        socket.join(roomOf(g));
        broadcastState(g);
        broadcastLobby();
    });

    socket.on('yams_join', ({ id }) => {
        const pseudo = socket.data.yamsPseudo;
        const g = games[id];
        if (!pseudo) return socket.emit('yams_error', 'Session expir\u00e9e, reviens au salon.');
        if (!g) return socket.emit('yams_error', 'Cette partie n\u2019existe plus.');
        let p = g.players.find(x => x.pseudo === pseudo);
        if (p) { p.sid = socket.id; p.connected = true; p.parti = false; p.sauts = 0; }
        else if (g.status !== 'lobby') {
            // La partie est d\u00e9j\u00e0 lanc\u00e9e : on rejoint en simple spectateur plut\u00f4t que de refuser.
            g.spectators = (g.spectators || []).filter(x => x.pseudo !== pseudo);
            g.spectators.push({ sid: socket.id, pseudo });
        } else {
            if (g.players.length >= MAX_PLAYERS) return socket.emit('yams_error', 'Table compl\u00e8te.');
            g.players.push({ sid: socket.id, pseudo, connected: true, scores: freshScores(), yamsBonus: 0 });
        }
        socketGame[socket.id] = g.id;
        socket.join(roomOf(g));
        broadcastState(g);
        broadcastLobby();
    });

    socket.on('yams_start', () => {
        const g = games[socketGame[socket.id]];
        if (!g || g.host !== socket.data.yamsPseudo || g.status !== 'lobby') return;
        if (g.players.length < MIN_PLAYERS) return socket.emit('yams_error', 'Il faut au moins un joueur.');
        // Une partie lancée seul ne compte ni victoire ni face-à-face : on ne
        // gagne pas contre personne. Seul le score, lui, compte vraiment.
        g.solo = g.players.length === 1;
        g.status = 'playing';
        g.turnIndex = 0;
        startTurn(g);
        broadcastState(g);
        broadcastLobby();
    });

    socket.on('yams_roll', () => {
        const g = games[socketGame[socket.id]];
        const pseudo = socket.data.yamsPseudo;
        if (!g || g.status !== 'playing' || !pseudo) return;
        const current = g.players[g.turnIndex];
        if (!current || current.pseudo !== pseudo) return;
        if (g.rollsLeft <= 0) return;
        current.sauts = 0;
        armerMinuteur(g);            // le joueur est bien là : son tour repart pour un délai plein
        g.dice = g.dice.map((v, i) => g.held[i] ? v : (1 + Math.floor(Math.random() * 6)));
        g.rollsLeft--;
        g.hasRolled = true;
        // Après le troisième lancer, plus aucun dé ne peut être gardé/relancé : il faut noter le score.
        broadcastState(g);
    });

    socket.on('yams_hold', ({ index }) => {
        const g = games[socketGame[socket.id]];
        const pseudo = socket.data.yamsPseudo;
        if (!g || g.status !== 'playing' || !pseudo) return;
        const current = g.players[g.turnIndex];
        if (!current || current.pseudo !== pseudo) return;
        if (!g.hasRolled || g.rollsLeft <= 0) return;   // pas encore lancé, ou plus de lancer possible
        if (typeof index !== 'number' || index < 0 || index > 4) return;
        g.held[index] = !g.held[index];
        broadcastState(g);
    });

    socket.on('yams_score', ({ category }) => {
        const g = games[socketGame[socket.id]];
        const pseudo = socket.data.yamsPseudo;
        if (!g || g.status !== 'playing' || !pseudo) return;
        const current = g.players[g.turnIndex];
        if (!current || current.pseudo !== pseudo) return;
        if (!g.hasRolled) return;   // il faut avoir lancé au moins une fois
        if (!CATEGORIES.includes(category) || current.scores[category] !== null) return;

        // Si les dés forment un Yams et que la case Yams est déjà remplie avec 50 points,
        // c'est un Yams supplémentaire dans la même partie : 50 points de bonus en plus,
        // quelle que soit la case choisie pour ce tour-ci.
        const isYamsRoll = computePossibleScore('yams', g.dice) === 50;
        const extraYamsBonus = isYamsRoll && current.scores.yams === 50;
        if (extraYamsBonus) current.yamsBonus = (current.yamsBonus || 0) + 50;

        // Même calcul que l'aperçu montré au joueur, joker compris : il ne doit
        // jamais marquer autre chose que ce que sa case annonçait.
        current.scores[category] = scoresPossibles(g.dice, current.scores)[category];
        current.sauts = 0;
        g.journal = (g.journal || []).concat([{ pseudo, category, points: current.scores[category] }]).slice(-8);

        if (isYamsRoll) {
            current.yamsThisGame = (current.yamsThisGame || 0) + 1;
            io.to(roomOf(g)).emit('yams_celebration', { pseudo, bonus: extraYamsBonus });
            const stats = loadYamsStats(pseudo);
            stats.totalYams++;
            if (extraYamsBonus) stats.bonusYams++;
            saveYamsStats(pseudo, stats);
        }
        advanceTurn(g);
    });

    socket.on('yams_leave', () => leaveCurrent(socket));

    socket.on('yams_stats', () => {
        const pseudo = socket.data.yamsPseudo;
        if (!pseudo) return;
        socket.emit('yams_stats_result', ficheComplete(pseudo));
    });

    socket.on('yams_leaderboard', () => {
        socket.emit('yams_leaderboard_result', {
            joueurs: classementComplet(),
            categories: moyennesDuSalon(),
            record: recordDuSalon(),
        });
    });

    socket.on('yams_history', () => {
        const list = mfGet(HISTORY_KEY) || [];
        socket.emit('yams_history_result', list.slice(0, 30));
    });

    socket.on('yams_h2h', ({ opponent }) => {
        const pseudo = socket.data.yamsPseudo;
        if (!pseudo || !opponent) return;
        socket.emit('yams_h2h_result', faceAFace(pseudo, opponent));
    });

    socket.on('yams_rematch', () => {
        const g = games[socketGame[socket.id]];
        if (!g || g.host !== socket.data.yamsPseudo || g.status !== 'ended') return;
        g.status = 'lobby';
        // Le cumul de la série se garde d'une manche à l'autre : « Rejouer »
        // repartait de zéro à chaque fois, sans rien qui relie les parties.
        g.serie = g.serie || {};
        g.players.forEach(p => { g.serie[p.pseudo] = (g.serie[p.pseudo] || 0) + grandTotal(p); });
        g.manche = (g.manche || 1) + 1;
        g.players.forEach(p => { p.scores = freshScores(); p.yamsBonus = 0; p.parti = false; p.sauts = 0; p.yamsThisGame = 0; });
        g.journal = [];
        g.turnIndex = 0;
        broadcastState(g);
        broadcastLobby();
    });

    socket.on('disconnect', () => {
        const gid = socketGame[socket.id];
        if (!gid) return;
        const g = games[gid];
        if (!g) return;
        const p = g.players.find(x => x.sid === socket.id);
        if (p) p.connected = false;
        if (g.spectators) g.spectators = g.spectators.filter(x => x.sid !== socket.id);
        // Si le partant avait la main, la table repart tout de suite au lieu
        // d'attendre les 90 secondes du minuteur pour rien.
        if (p && g.status === 'playing' && g.players[g.turnIndex] === p) { advanceTurn(g); return; }
        broadcastState(g);
        broadcastLobby();
    });
});

return {
    online: () => [...new Set(Object.values(games).flatMap(g => g.players.filter(p => p.connected).map(p => p.pseudo)))],
    games: () => Object.values(games).map(g => ({ id: g.id, host: g.host, status: g.status, players: g.players.map(p => p.pseudo) })),
    statsFor: (pseudo) => ficheComplete(pseudo),
    endGame: (id) => {
        const g = games[id];
        if (!g) return false;
        desarmerMinuteur(g);
        try { io.to(roomOf(g)).emit('yams_closed'); } catch (e) {}
        delete games[id];
        broadcastLobby();
        return true;
    },
};

};