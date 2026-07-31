// =====================================================================
//  MODULE YAMS — branché sur le serveur du salon (app + io partagés).
//  Identité fournie par le cookie signé du portail (pas de compte séparé),
//  exactement comme Petit Bac.
// =====================================================================
const crypto = require('crypto');

module.exports = function attachYams(app, io) {

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
        if (!pseudo) return socket.emit('yams_error', 'Session expirée, reviens au salon.');
        if (!g) return socket.emit('yams_error', 'Cette partie n\u2019existe plus.');
        let p = g.players.find(x => x.pseudo === pseudo);
        if (p) { p.sid = socket.id; p.connected = true; }
        else {
            if (g.status !== 'lobby') return socket.emit('yams_error', 'La partie a déjà commencé.');
            if (g.players.length >= MAX_PLAYERS) return socket.emit('yams_error', 'Table complète.');
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
            io.to(roomOf(g)).emit('yams_celebration', { pseudo, bonus: extraYamsBonus });
        }
        advanceTurn(g);
    });

    socket.on('yams_leave', () => leaveCurrent(socket));

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
        broadcastState(g);
        broadcastLobby();
    });
});

return {
    online: () => [...new Set(Object.values(games).flatMap(g => g.players.filter(p => p.connected).map(p => p.pseudo)))],
    games: () => Object.values(games).map(g => ({ id: g.id, host: g.host, status: g.status, players: g.players.map(p => p.pseudo) })),
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