// =====================================================================
//  MODULE PETIT BAC — branché sur le serveur du salon (app + io partagés).
//  Identité fournie par le cookie signé du portail (pas de compte séparé).
// =====================================================================
const crypto = require('crypto');

module.exports = function attachPbac(app, io) {

app.get('/pbac/healthz', (req, res) => res.status(200).json({ ok: true, t: Date.now(), games: Object.keys(games).length }));

// =====================================================================
//  CONSTANTES
// =====================================================================
const CATEGORIES = ['Prénom', 'Animal', 'Pays ou ville', 'Fruit ou légume', 'Métier', 'Objet', 'Couleur', 'Sport'];
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const DURATIONS = { court: 60, moyen: 90, long: 120 };
const CHALLENGE_MS = 25 * 1000;
const MAX_PLAYERS = 8;
const PSEUDO_MAX = 20;

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
function norm(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim().replace(/\s+/g, ' ');
}

// =====================================================================
//  ÉTAT (en mémoire, éphémère — comme les parties du Perudo)
// =====================================================================
const games = {};            // id -> game
const socketGame = {};       // socket.id -> gameId
let nextId = 1;

function publicGames() {
    return Object.values(games)
        .filter(g => g.status === 'lobby')
        .map(g => ({ id: g.id, host: g.host, players: g.players.length, maxPlayers: MAX_PLAYERS, rounds: g.maxRounds, duration: g.duration }));
}
function broadcastLobby() { io.emit('pbac_games', publicGames()); }

function playerList(g) {
    return g.players.map(p => ({ pseudo: p.pseudo, connected: p.connected, score: g.scores[p.pseudo] || 0, host: p.pseudo === g.host }));
}
function roomOf(g) { return 'pbac:' + g.id; }

function pickLetter(g) {
    let pool = LETTERS.filter(l => !g.usedLetters.includes(l));
    if (!pool.length) { g.usedLetters = []; pool = LETTERS; }
    const letter = pool[Math.floor(Math.random() * pool.length)];
    g.usedLetters.push(letter);
    return letter;
}

function stateForClient(g) {
    return {
        id: g.id, host: g.host, status: g.status, players: playerList(g),
        categories: g.categories, maxRounds: g.maxRounds, round: g.round,
        duration: g.duration, letter: g.letter,
        timerEnd: g.status === 'writing' ? g.timerEnd : null,
        challengeEnd: g.status === 'challenge' ? g.challengeEnd : null,
        answers: (g.status === 'reveal' || g.status === 'challenge' || g.status === 'ended') ? g.answers : undefined,
        breakdown: (g.status === 'reveal' || g.status === 'challenge' || g.status === 'ended') ? computeBreakdown(g) : undefined,
        challenges: (g.status === 'challenge') ? challengesPublic(g) : undefined,
        stoppedBy: g.stoppedBy || null,
        roundScores: g.roundScores || null,
    };
}
function broadcastState(g) { io.to(roomOf(g)).emit('pbac_state', stateForClient(g)); }

function challengesPublic(g) {
    const out = {};
    for (const [k, set] of Object.entries(g.challenges)) out[k] = [...set];
    return out;
}

// Calcule, pour chaque catégorie et chaque joueur, le statut de sa réponse
// (valide/unique, valide/partagée, invalide) en tenant compte des contestations.
function computeBreakdown(g) {
    const out = {};
    for (const cat of g.categories) {
        const perPlayer = {};
        const counts = {};
        for (const p of g.players) {
            const raw = (g.answers[p.pseudo] && g.answers[p.pseudo][cat]) || '';
            const n = norm(raw);
            const startsRight = n && n[0] === g.letter;
            const key = cat + '|' + p.pseudo;
            const challenged = (g.challenges[key] || new Set()).size >= Math.max(1, Math.ceil((g.players.length - 1) / 2));
            const valid = !!(n && startsRight && !challenged);
            perPlayer[p.pseudo] = { text: raw, normalized: n, valid, challenged: (g.challenges[key] || new Set()).size > 0 };
            if (valid) counts[n] = (counts[n] || 0) + 1;
        }
        let catScore = {};
        for (const p of g.players) {
            const e = perPlayer[p.pseudo];
            let pts = 0;
            if (e.valid) pts = counts[e.normalized] === 1 ? 3 : 1;
            e.points = pts;
        }
        out[cat] = perPlayer;
    }
    return out;
}

function roundScoresFrom(breakdown, g) {
    const scores = {};
    for (const p of g.players) scores[p.pseudo] = 0;
    for (const cat of g.categories) {
        for (const p of g.players) scores[p.pseudo] += (breakdown[cat][p.pseudo] || {}).points || 0;
    }
    return scores;
}

function endRoundToReveal(g) {
    clearTimeout(g._timer);
    g.status = 'reveal';
    broadcastState(g);
}
function startChallenge(g) {
    clearTimeout(g._timer);
    g.status = 'challenge';
    g.challengeEnd = Date.now() + CHALLENGE_MS;
    broadcastState(g);
    g._timer = setTimeout(() => finalizeRound(g), CHALLENGE_MS);
}
function finalizeRound(g) {
    clearTimeout(g._timer);
    const breakdown = computeBreakdown(g);
    const rs = roundScoresFrom(breakdown, g);
    g.roundScores = rs;
    for (const p of g.players) g.scores[p.pseudo] = (g.scores[p.pseudo] || 0) + rs[p.pseudo];
    g.status = 'ended_round';
    broadcastState(g);
}

function startRound(g) {
    g.round++;
    g.letter = pickLetter(g);
    g.answers = {}; g.challenges = {}; g.roundScores = null; g.stoppedBy = null;
    for (const p of g.players) g.answers[p.pseudo] = {};
    g.status = 'writing';
    g.timerEnd = Date.now() + g.duration * 1000;
    broadcastState(g);
    g._timer = setTimeout(() => { if (g.status === 'writing') endRoundToReveal(g); }, g.duration * 1000);
}

// =====================================================================
//  SOCKETS
// =====================================================================
io.on('connection', (socket) => {

    socket.on('pbac_identify', (ack) => {
        const pseudo = salonPseudoFromCookie(socket.handshake.headers.cookie);
        socket.data.pbacPseudo = pseudo;
        if (typeof ack === 'function') ack({ ok: !!pseudo, pseudo });
    });

    socket.on('pbac_list', () => { socket.emit('pbac_games', publicGames()); });

    socket.on('pbac_create', ({ rounds, duration }) => {
        const pseudo = socket.data.pbacPseudo;
        if (!pseudo) return socket.emit('pbac_error', 'Session expirée, reviens au salon.');
        const id = 'p' + (nextId++);
        const g = {
            id, host: pseudo, status: 'lobby',
            players: [{ sid: socket.id, pseudo, connected: true }],
            categories: CATEGORIES.slice(),
            maxRounds: [3, 5, 7].includes(Number(rounds)) ? Number(rounds) : 5,
            duration: DURATIONS[duration] || DURATIONS.moyen,
            round: 0, usedLetters: [], scores: {}, answers: {}, challenges: {},
        };
        games[id] = g;
        socketGame[socket.id] = id;
        socket.join(roomOf(g));
        broadcastState(g);
        broadcastLobby();
    });

    socket.on('pbac_join', ({ id }) => {
        const pseudo = socket.data.pbacPseudo;
        const g = games[id];
        if (!pseudo) return socket.emit('pbac_error', 'Session expirée, reviens au salon.');
        if (!g) return socket.emit('pbac_error', 'Cette partie n’existe plus.');
        let p = g.players.find(x => x.pseudo === pseudo);
        if (p) { p.sid = socket.id; p.connected = true; }
        else {
            if (g.status !== 'lobby') return socket.emit('pbac_error', 'La partie a déjà commencé.');
            if (g.players.length >= MAX_PLAYERS) return socket.emit('pbac_error', 'Table complète.');
            g.players.push({ sid: socket.id, pseudo, connected: true });
            g.scores[pseudo] = 0;
        }
        socketGame[socket.id] = g.id;
        socket.join(roomOf(g));
        broadcastState(g);
        broadcastLobby();
    });

    socket.on('pbac_leave', () => leaveCurrent(socket));
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

    function leaveCurrent(socket) {
        const gid = socketGame[socket.id];
        if (!gid) return;
        const g = games[gid];
        delete socketGame[socket.id];
        socket.leave(roomOf(g));
        if (!g) return;
        g.players = g.players.filter(x => x.sid !== socket.id);
        if (!g.players.length) { delete games[gid]; broadcastLobby(); return; }
        if (g.host === socket.data.pbacPseudo) g.host = g.players[0].pseudo;
        broadcastState(g);
        broadcastLobby();
    }

    socket.on('pbac_start', () => {
        const g = games[socketGame[socket.id]];
        if (!g || g.host !== socket.data.pbacPseudo || g.status !== 'lobby') return;
        if (g.players.length < 1) return;
        startRound(g);
    });

    socket.on('pbac_update_answers', (payload) => {
        const g = games[socketGame[socket.id]];
        const pseudo = socket.data.pbacPseudo;
        if (!g || g.status !== 'writing' || !pseudo) return;
        const clean = {};
        for (const cat of g.categories) {
            const v = String((payload && payload[cat]) || '').slice(0, 40);
            if (v) clean[cat] = v;
        }
        g.answers[pseudo] = clean;
    });

    socket.on('pbac_stop', () => {
        const g = games[socketGame[socket.id]];
        const pseudo = socket.data.pbacPseudo;
        if (!g || g.status !== 'writing' || !pseudo) return;
        g.stoppedBy = pseudo;
        endRoundToReveal(g);
    });

    socket.on('pbac_go_challenge', () => {
        const g = games[socketGame[socket.id]];
        if (!g || g.host !== socket.data.pbacPseudo || g.status !== 'reveal') return;
        startChallenge(g);
    });

    socket.on('pbac_challenge', ({ category, pseudo: target }) => {
        const g = games[socketGame[socket.id]];
        const me = socket.data.pbacPseudo;
        if (!g || g.status !== 'challenge' || !me || me === target) return;
        if (!g.categories.includes(category)) return;
        const key = category + '|' + target;
        const set = g.challenges[key] || new Set();
        if (set.has(me)) set.delete(me); else set.add(me);
        g.challenges[key] = set;
        broadcastState(g);
    });

    socket.on('pbac_next_round', () => {
        const g = games[socketGame[socket.id]];
        if (!g || g.host !== socket.data.pbacPseudo || g.status !== 'ended_round') return;
        if (g.round >= g.maxRounds) { g.status = 'ended'; broadcastState(g); broadcastLobby(); return; }
        startRound(g);
    });

    socket.on('pbac_rematch', () => {
        const g = games[socketGame[socket.id]];
        if (!g || g.host !== socket.data.pbacPseudo || g.status !== 'ended') return;
        g.status = 'lobby'; g.round = 0; g.usedLetters = [];
        for (const p of g.players) g.scores[p.pseudo] = 0;
        broadcastState(g);
        broadcastLobby();
    });
});

return {
    games: () => Object.values(games).map(g => ({ id: g.id, host: g.host, status: g.status, players: g.players.map(p => p.pseudo) })),
    online: () => [...new Set(Object.values(games).flatMap(g => g.players.filter(p => p.connected).map(p => p.pseudo)))],
    endGame: (id) => {
        const g = games[id];
        if (!g) return false;
        try { io.to(roomOf(g)).emit('pbac_closed'); } catch (e) {}
        delete games[id];
        broadcastLobby();
        return true;
    },
};

}; // ===== fin attachPbac =====