// =====================================================================
//  MODULE MOTUS PARTY — la course multijoueur en temps réel : tout le
//  monde devine le même mot en simultané, classé par ordre d'arrivée.
//  Réutilise le dictionnaire et la logique de validation du Motus du
//  jour (fournis par server.js), sans jamais toucher à ses données.
// =====================================================================
const crypto = require('crypto');

module.exports = function attachMotusParty(app, io, deps) {

const { motusPool, motusKnown, motusMarks, motusDef } = deps;

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;
const MAX_TRIES = 6;
const DEFAULT_ROUNDS = 5;
const WORD_LENGTHS = [5, 6, 6, 7];   // légèrement pondéré vers 6, comme le Motus du jour
// Barème : premier arrivé, plus de points ; à partir de la 5e place, tout le
// monde qui trouve quand même touche le minimum. Ne pas trouver du tout = 0.
const SCORE_BY_RANK = [10, 7, 5, 3, 1];
function pointsForRank(rank) { return SCORE_BY_RANK[Math.min(rank - 1, SCORE_BY_RANK.length - 1)]; }

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

// =====================================================================
//  ÉTAT DES PARTIES
// =====================================================================
// =====================================================================
//  STATISTIQUES — simples mais réelles : parties jouées/gagnées, mots
//  trouvés, meilleur rang jamais atteint, mots ratés.
// =====================================================================
const mfGet = deps.get || (() => undefined);
const mfSet = deps.set || (() => {});
const kMpStats = (pseudo) => `motusparty:stats:${pseudo}`;
function loadMpStats(pseudo) {
    const s = mfGet(kMpStats(pseudo));
    return s && typeof s === 'object' ? { matchesPlayed: 0, matchesWon: 0, wordsFound: 0, wordsMissed: 0, bestRank: null, ...s } : { matchesPlayed: 0, matchesWon: 0, wordsFound: 0, wordsMissed: 0, bestRank: null };
}
function saveMpStats(pseudo, stats) { mfSet(kMpStats(pseudo), stats); }

const games = {};
const socketGame = {};
let nextId = 1;
const roomOf = (g) => 'motusparty:' + g.id;

function pickWord(usedWords) {
    const len = WORD_LENGTHS[Math.floor(Math.random() * WORD_LENGTHS.length)];
    const pool = motusPool(len).filter(w => !usedWords.has(w));
    const finalPool = pool.length ? pool : motusPool(len);
    return finalPool[Math.floor(Math.random() * finalPool.length)];
}
function freshPlayer(sid, pseudo) {
    return { sid, pseudo, connected: true, score: 0, guesses: [], solved: false, gaveUp: false, rank: null };
}
function resetForRound(g) {
    g.usedWords.add(g.word);
    g.word = pickWord(g.usedWords);
    g.players.forEach(p => { p.guesses = []; p.solved = false; p.gaveUp = false; p.rank = null; });
    g.roundStartAt = Date.now();
    g.finishedCount = 0;
}
function roundOver(g) {
    return g.players.every(p => p.solved || p.gaveUp);
}

function publicGames() {
    return Object.values(games).filter(g => g.status !== 'ended').map(g => ({
        id: g.id, host: g.host, status: g.status,
        players: g.players.length, maxPlayers: MAX_PLAYERS,
        alive: g.players.filter(p => p.connected).length,
        round: g.round, maxRounds: g.maxRounds,
        spectators: (g.spectators || []).length,
    }));
}
function broadcastLobby() { io.emit('motusparty_games', publicGames()); }

function playerView(g, forPseudo) {
    // Chacun voit ses propres essais en détail, mais seulement le nombre
    // d'essais des autres (pas leurs lettres), pour ne jamais tricher.
    return g.players.map(p => ({
        pseudo: p.pseudo, connected: p.connected, score: p.score,
        solved: p.solved, gaveUp: p.gaveUp, rank: p.rank,
        triesCount: p.guesses.length,
        guesses: p.pseudo === forPseudo ? p.guesses : undefined,
    }));
}
function stateFor(g, pseudo) {
    return {
        id: g.id, host: g.host, status: g.status,
        round: g.round, maxRounds: g.maxRounds,
        wordLen: g.word ? g.word.length : null,
        // La première lettre est offerte, exactement comme au Motus du jour :
        // sans elle, un mot de 7 lettres en 6 essais n'est pas devinable, et
        // les deux jeux du même mot ne se joueraient pas de la même façon.
        firstLetter: g.word ? g.word[0] : null,
        players: playerView(g, pseudo),
        spectators: (g.spectators || []).map(x => x.pseudo),
        maxTries: MAX_TRIES,
        me: g.players.find(p => p.pseudo === pseudo) ? {
            solved: g.players.find(p => p.pseudo === pseudo).solved,
            gaveUp: g.players.find(p => p.pseudo === pseudo).gaveUp,
        } : null,
        // Le mot n'est révélé à tout le monde qu'une fois la manche vraiment terminée.
        word: g.status === 'round_end' || g.status === 'ended' ? g.word : null,
        wordDef: (g.status === 'round_end' && motusDef) ? motusDef(g.word) : null,
        finalRanking: g.status === 'ended' ? finalRanking(g) : null,
    };
}
function broadcastState(g) {
    g.players.forEach(p => io.to(p.sid).emit('motusparty_state', stateFor(g, p.pseudo)));
    (g.spectators || []).forEach(s => io.to(s.sid).emit('motusparty_state', stateFor(g, s.pseudo)));
}
function finalRanking(g) {
    return [...g.players].sort((a, b) => b.score - a.score).map(p => ({ pseudo: p.pseudo, score: p.score }));
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

    socket.on('motusparty_identify', (ack) => {
        const pseudo = salonPseudoFromCookie(socket.handshake.headers.cookie);
        socket.data.mpPseudo = pseudo;
        if (typeof ack === 'function') ack({ ok: !!pseudo, pseudo });
    });

    socket.on('motusparty_list', () => { socket.emit('motusparty_games', publicGames()); });

    socket.on('motusparty_create', ({ maxRounds } = {}) => {
        const pseudo = socket.data.mpPseudo;
        if (!pseudo) return socket.emit('motusparty_error', 'Session expirée, reviens au salon.');
        const id = 'mp' + (nextId++);
        const g = {
            id, host: pseudo, status: 'lobby',
            players: [freshPlayer(socket.id, pseudo)],
            spectators: [],
            maxRounds: Math.min(10, Math.max(1, Number(maxRounds) || DEFAULT_ROUNDS)),
            round: 0, word: null, usedWords: new Set(),
        };
        games[id] = g;
        socketGame[socket.id] = id;
        socket.join(roomOf(g));
        broadcastState(g);
        broadcastLobby();
    });

    socket.on('motusparty_join', ({ id }) => {
        const pseudo = socket.data.mpPseudo;
        const g = games[id];
        if (!pseudo) return socket.emit('motusparty_error', 'Session expirée, reviens au salon.');
        if (!g) return socket.emit('motusparty_error', 'Cette partie n\u2019existe plus.');
        let p = g.players.find(x => x.pseudo === pseudo);
        if (p) { p.sid = socket.id; p.connected = true; }
        else if (g.status !== 'lobby') {
            g.spectators = (g.spectators || []).filter(x => x.pseudo !== pseudo);
            g.spectators.push({ sid: socket.id, pseudo });
        } else {
            if (g.players.length >= MAX_PLAYERS) return socket.emit('motusparty_error', 'Table complète.');
            g.players.push(freshPlayer(socket.id, pseudo));
        }
        socketGame[socket.id] = g.id;
        socket.join(roomOf(g));
        broadcastState(g);
        broadcastLobby();
    });

    socket.on('motusparty_start', () => {
        const g = games[socketGame[socket.id]];
        if (!g || g.host !== socket.data.mpPseudo || g.status !== 'lobby') return;
        if (g.players.length < MIN_PLAYERS) return socket.emit('motusparty_error', `Il faut au moins ${MIN_PLAYERS} joueurs.`);
        g.status = 'playing';
        g.round = 1;
        resetForRound(g);
        broadcastState(g);
        broadcastLobby();
    });

    socket.on('motusparty_guess', ({ word }) => {
        const g = games[socketGame[socket.id]];
        const pseudo = socket.data.mpPseudo;
        if (!g || g.status !== 'playing' || !pseudo) return;
        const p = g.players.find(x => x.pseudo === pseudo);
        if (!p || p.solved || p.gaveUp) return;
        const guess = String(word || '').toUpperCase().trim();
        if (guess.length !== g.word.length) return;
        if (!motusKnown(guess)) return socket.emit('motusparty_error', 'Mot inconnu.');
        const marks = motusMarks(guess, g.word);
        p.guesses.push({ word: guess, marks });
        const solved = guess === g.word;
        if (solved) {
            p.solved = true;
            g.finishedCount++;
            p.rank = g.finishedCount;
            p.score += pointsForRank(p.rank);
            io.to(roomOf(g)).emit('motusparty_finish', { pseudo, rank: p.rank, points: pointsForRank(p.rank) });
            const stats = loadMpStats(pseudo);
            stats.wordsFound++;
            if (stats.bestRank === null || p.rank < stats.bestRank) stats.bestRank = p.rank;
            saveMpStats(pseudo, stats);
        } else if (p.guesses.length >= MAX_TRIES) {
            p.gaveUp = true;
            const stats = loadMpStats(pseudo);
            stats.wordsMissed++;
            saveMpStats(pseudo, stats);
        }
        if (roundOver(g)) g.status = 'round_end';
        broadcastState(g);
    });

    socket.on('motusparty_next_round', () => {
        const g = games[socketGame[socket.id]];
        if (!g || g.host !== socket.data.mpPseudo || g.status !== 'round_end') return;
        if (g.round >= g.maxRounds) {
            g.status = 'ended';
            const winner = finalRanking(g)[0];
            g.players.forEach(p => {
                const stats = loadMpStats(p.pseudo);
                stats.matchesPlayed++;
                if (winner && p.pseudo === winner.pseudo) stats.matchesWon++;
                saveMpStats(p.pseudo, stats);
            });
            broadcastState(g);
            broadcastLobby();
            return;
        }
        g.round++;
        g.status = 'playing';
        resetForRound(g);
        broadcastState(g);
    });

    socket.on('motusparty_rematch', () => {
        const g = games[socketGame[socket.id]];
        if (!g || g.host !== socket.data.mpPseudo || g.status !== 'ended') return;
        g.status = 'lobby';
        g.round = 0; g.word = null; g.usedWords = new Set();
        g.players.forEach(p => { p.score = 0; p.guesses = []; p.solved = false; p.gaveUp = false; p.rank = null; });
        broadcastState(g);
        broadcastLobby();
    });

    socket.on('motusparty_leave', () => leaveCurrent(socket));

    socket.on('motusparty_stats', () => {
        const pseudo = socket.data.mpPseudo;
        if (!pseudo) return;
        const s = loadMpStats(pseudo);
        socket.emit('motusparty_stats_result', s);
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
    statsFor: (pseudo) => loadMpStats(pseudo),
    endGame: (id) => {
        const g = games[id];
        if (!g) return false;
        try { io.to(roomOf(g)).emit('motusparty_closed'); } catch (e) {}
        delete games[id];
        broadcastLobby();
        return true;
    },
};

};