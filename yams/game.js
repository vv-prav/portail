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
const MIN_PLAYERS = 2;
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
    return { gamesPlayed: 0, gamesWon: 0, totalYams: 0, bonusYams: 0, bestScore: 0, vsOpponent: {} };
}
function loadYamsStats(pseudo) {
    const s = mfGet(kYamsStats(pseudo));
    return s && typeof s === 'object' ? { ...defaultYamsStats(), ...s, vsOpponent: { ...(s.vsOpponent || {}) } } : defaultYamsStats();
}
function saveYamsStats(pseudo, stats) {
    mfSet(kYamsStats(pseudo), stats);
    const index = mfGet(STATS_INDEX_KEY) || [];
    if (!index.includes(pseudo)) { index.push(pseudo); mfSet(STATS_INDEX_KEY, index); }
}
// La "bête noire" : parmi les adversaires rencontrés au moins 2 fois, celui qui a
// gagné le plus souvent contre ce joueur (à égalité, le plus de parties jouées ensemble).
function nemesisOf(stats) {
    const entries = Object.entries(stats.vsOpponent).filter(([, v]) => (v.losses || 0) >= 2);
    if (!entries.length) return null;
    entries.sort((a, b) => (b[1].losses - a[1].losses) || ((b[1].wins + b[1].losses) - (a[1].wins + a[1].losses)));
    return { pseudo: entries[0][0], losses: entries[0][1].losses };
}
// Enregistre la fin d'une vraie partie (pas juste une manche) : une partie jouée pour
// chacun, une victoire pour le gagnant, une défaite face à lui pour tous les autres.
function finalizeYamsStats(g) {
    const winner = winnerOf(g);
    const nemesisDefeats = [];
    for (const p of g.players) {
        const stats = loadYamsStats(p.pseudo);
        // Avant de toucher aux stats de ce tour-ci : est-ce que l'adversaire qui vient
        // de perdre était justement la bête noire du gagnant ?
        if (p.pseudo === winner) {
            const oldNemesis = nemesisOf(stats);
            const beatenNemesis = g.players.find(o => o.pseudo !== winner && oldNemesis && oldNemesis.pseudo === o.pseudo);
            if (beatenNemesis) nemesisDefeats.push({ winner, nemesis: beatenNemesis.pseudo });
        }
        stats.gamesPlayed++;
        const myTotal = grandTotal(p);
        if (myTotal > stats.bestScore) stats.bestScore = myTotal;
        if (p.pseudo === winner) stats.gamesWon++;
        for (const other of g.players) {
            if (other.pseudo === p.pseudo) continue;
            if (!stats.vsOpponent[other.pseudo]) stats.vsOpponent[other.pseudo] = { wins: 0, losses: 0 };
            if (p.pseudo === winner) stats.vsOpponent[other.pseudo].wins++;
            else if (other.pseudo === winner) stats.vsOpponent[other.pseudo].losses++;
        }
        saveYamsStats(p.pseudo, stats);
    }
    recordYamsHistory(g, winner);
    return nemesisDefeats;
}
const HISTORY_KEY = 'yams:history';
const HISTORY_MAX = 150;
function recordYamsHistory(g, winner) {
    const list = mfGet(HISTORY_KEY) || [];
    list.unshift({
        id: g.id, endedAt: Date.now(), winner,
        players: g.players.map(p => ({ pseudo: p.pseudo, total: grandTotal(p), yams: p.yamsThisGame || 0 })),
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
    }));
}
function stateForClient(g) {
    const current = g.players[g.turnIndex];
    return {
        id: g.id, host: g.host, status: g.status,
        players: playerView(g),
        spectators: (g.spectators || []).map(x => x.pseudo),
        turnIndex: g.turnIndex, turnPseudo: current ? current.pseudo : null,
        dice: g.dice, held: g.held, rollsLeft: g.rollsLeft, hasRolled: g.hasRolled,
        possible: g.hasRolled ? Object.fromEntries(CATEGORIES.map(c => [c, computePossibleScore(c, g.dice)])) : null,
        winner: g.status === 'ended' ? winnerOf(g) : null,
    };
}
function winnerOf(g) {
    let best = null, bestScore = -1;
    for (const p of g.players) {
        const t = grandTotal(p);
        if (t > bestScore) { bestScore = t; best = p.pseudo; }
    }
    return best;
}
function broadcastState(g) { io.to(roomOf(g)).emit('yams_state', stateForClient(g)); }

function startTurn(g) {
    g.dice = [1, 1, 1, 1, 1];
    g.held = [false, false, false, false, false];
    g.rollsLeft = MAX_ROLLS;
    g.hasRolled = false;
}

function allCategoriesFilled(p) {
    return CATEGORIES.every(c => p.scores[c] !== null);
}
function advanceTurn(g) {
    // Le tour passe au joueur suivant qui n'a pas encore toutes ses cases remplies.
    // Si tout le monde a fini, la partie se termine.
    if (g.players.every(allCategoriesFilled)) {
        g.status = 'ended';
        const nemesisDefeats = finalizeYamsStats(g);
        nemesisDefeats.forEach(d => io.to(roomOf(g)).emit('yams_nemesis_defeated', d));
        broadcastState(g);
        broadcastLobby();
        return;
    }
    let next = g.turnIndex;
    for (let i = 0; i < g.players.length; i++) {
        next = (next + 1) % g.players.length;
        if (!allCategoriesFilled(g.players[next])) { g.turnIndex = next; break; }
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
    if (g.spectators) g.spectators = g.spectators.filter(x => x.sid !== socket.id);
    if (g.status === 'lobby') {
        g.players = g.players.filter(x => x.sid !== socket.id);
        if (!g.players.length) { delete games[gid]; broadcastLobby(); return; }
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
        if (p) { p.sid = socket.id; p.connected = true; }
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
        if (g.players.length < MIN_PLAYERS) return socket.emit('yams_error', `Il faut au moins ${MIN_PLAYERS} joueurs.`);
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

        current.scores[category] = computePossibleScore(category, g.dice);

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
        const stats = loadYamsStats(pseudo);
        socket.emit('yams_stats_result', {
            gamesPlayed: stats.gamesPlayed, gamesWon: stats.gamesWon,
            totalYams: stats.totalYams, bonusYams: stats.bonusYams, bestScore: stats.bestScore,
            winRate: stats.gamesPlayed ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : null,
            nemesis: nemesisOf(stats),
            opponents: Object.keys(stats.vsOpponent),
        });
    });

    socket.on('yams_leaderboard', () => {
        const index = mfGet(STATS_INDEX_KEY) || [];
        const rows = index.map(pseudo => {
            const s = loadYamsStats(pseudo);
            return {
                pseudo, gamesPlayed: s.gamesPlayed, gamesWon: s.gamesWon, bestScore: s.bestScore,
                totalYams: s.totalYams,
                winRate: s.gamesPlayed ? Math.round((s.gamesWon / s.gamesPlayed) * 100) : 0,
            };
        }).filter(r => r.gamesPlayed > 0);
        rows.sort((a, b) => b.gamesWon - a.gamesWon || b.winRate - a.winRate || b.gamesPlayed - a.gamesPlayed);
        socket.emit('yams_leaderboard_result', rows);
    });

    socket.on('yams_history', () => {
        const list = mfGet(HISTORY_KEY) || [];
        socket.emit('yams_history_result', list.slice(0, 30));
    });

    socket.on('yams_h2h', ({ opponent }) => {
        const pseudo = socket.data.yamsPseudo;
        if (!pseudo || !opponent) return;
        const mine = loadYamsStats(pseudo);
        const theirs = loadYamsStats(opponent);
        const mineVs = mine.vsOpponent[opponent] || { wins: 0, losses: 0 };
        socket.emit('yams_h2h_result', {
            opponent,
            myWins: mineVs.wins, myLosses: mineVs.losses,
            totalGames: mineVs.wins + mineVs.losses,
            myBest: mine.bestScore, theirBest: theirs.bestScore,
        });
    });

    socket.on('yams_rematch', () => {
        const g = games[socketGame[socket.id]];
        if (!g || g.host !== socket.data.yamsPseudo || g.status !== 'ended') return;
        g.status = 'lobby';
        g.players.forEach(p => { p.scores = freshScores(); p.yamsBonus = 0; });
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
        broadcastState(g);
        broadcastLobby();
    });
});

return {
    online: () => [...new Set(Object.values(games).flatMap(g => g.players.filter(p => p.connected).map(p => p.pseudo)))],
    games: () => Object.values(games).map(g => ({ id: g.id, host: g.host, status: g.status, players: g.players.map(p => p.pseudo) })),
    statsFor: (pseudo) => {
        const stats = loadYamsStats(pseudo);
        return {
            gamesPlayed: stats.gamesPlayed, gamesWon: stats.gamesWon,
            totalYams: stats.totalYams, bonusYams: stats.bonusYams, bestScore: stats.bestScore,
            winRate: stats.gamesPlayed ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : null,
            nemesis: nemesisOf(stats),
        };
    },
    endGame: (id) => {
        const g = games[id];
        if (!g) return false;
        try { io.to(roomOf(g)).emit('yams_closed'); } catch (e) {}
        delete games[id];
        broadcastLobby();
        return true;
    },
};

};