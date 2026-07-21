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
const CARD_PAUSE_MS = 1300;          // pause après résolution avant la carte suivante
const EMPTY_PAUSE_MS = 1500;         // durée d'affichage d'une case vide (« Loupé »)
const CATEGORY_SUMMARY_MS = 2600;    // récap affiché entre deux catégories
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
function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
}

// La carte en cours de vote, telle qu'envoyée aux clients (jamais les votes des autres avant résolution).
function currentCardPublic(g) {
    if (g.status !== 'voting' || !g.reviewQueue[g.reviewIndex]) return null;
    const { category, pseudo, type } = g.reviewQueue[g.reviewIndex];
    const c = g.cardState;
    const base = {
        category, pseudo, type, text: (g.answers[pseudo] && g.answers[pseudo][category]) || '',
        catIndex: g.categories.indexOf(category) + 1, catTotal: g.categories.length,
        cardIndex: g.reviewQueue.slice(0, g.reviewIndex + 1).filter(x => x.category === category).length,
        cardTotal: g.reviewQueue.filter(x => x.category === category).length,
    };
    if (type === 'empty') return base;
    return {
        ...base,
        yes: c.votes.filter(v => v === 'yes').length, no: c.votes.filter(v => v === 'no').length,
        eligible: c.eligible.length, resolved: c.resolved, accepted: c.accepted,
        iVoted: null,   // rempli côté envoi individuel (voir sendCardTo)
    };
}
function sendCardTo(g, socket) {
    const pub = currentCardPublic(g);
    if (!pub) return;
    if (pub.type === 'empty') { socket.emit('pbac_card', pub); return; }
    const me = socket.data.pbacPseudo;
    pub.iVoted = (g.cardState.voters[me]) || null;
    pub.canVote = g.cardState.eligible.includes(me) && !pub.iVoted && !pub.resolved;
    socket.emit('pbac_card', pub);
}
function broadcastCard(g) {
    const pub = currentCardPublic(g);
    if (!pub) return;
    for (const p of g.players) {
        const sock = io.sockets.sockets.get(p.sid);
        if (!sock) continue;
        if (pub.type === 'empty') { sock.emit('pbac_card', pub); continue; }
        const clone = { ...pub };
        clone.iVoted = g.cardState.voters[p.pseudo] || null;
        clone.canVote = g.cardState.eligible.includes(p.pseudo) && !clone.iVoted && !clone.resolved;
        sock.emit('pbac_card', clone);
    }
}

// Une carte par joueur et par catégorie — y compris les cases vides ou mal
// lettrées, montrées brièvement (« Loupé ») plutôt que silencieusement ignorées.
function buildReviewQueue(g) {
    const q = [];
    for (const cat of g.categories) {
        const entries = g.players.map(p => {
            const raw = (g.answers[p.pseudo] && g.answers[p.pseudo][cat]) || '';
            const n = norm(raw);
            const valid = !!(n && n[0] === g.letter);
            return { category: cat, pseudo: p.pseudo, type: valid ? 'valid' : 'empty' };
        });
        shuffle(entries).forEach(e => q.push(e));
    }
    return q;
}

function startCard(g) {
    const entry = g.reviewQueue[g.reviewIndex];
    if (!entry) { finalizeCategoryOrRound(g); return; }
    g.status = 'voting';
    if (entry.type === 'empty') {
        g.voteOutcomes[entry.category + '|' + entry.pseudo] = false;
        g.cardState = { type: 'empty', resolved: true, accepted: false, votes: [], voters: {}, eligible: [] };
        broadcastCard(g);
        g._timer = setTimeout(() => advanceAfterCard(g, entry), EMPTY_PAUSE_MS);
        return;
    }
    const eligible = g.players.filter(p => p.connected && p.pseudo !== entry.pseudo).map(p => p.pseudo);
    g.cardState = { votes: [], voters: {}, eligible, resolved: false, accepted: false };
    broadcastCard(g);
    if (!eligible.length) resolveCard(g, true);   // personne pour voter : accepté d'office
}
// Aucune limite de temps : on attend que tout le monde ait voté (parmi les
// joueurs toujours connectés) avant de résoudre et d'avancer.
function resolveCard(g, forceAccept) {
    clearTimeout(g._timer);
    if (!g.cardState || g.cardState.resolved) return;
    const c = g.cardState;
    const accepted = typeof forceAccept === 'boolean' ? forceAccept : (c.votes.filter(v => v === 'yes').length > c.votes.filter(v => v === 'no').length);
    c.resolved = true; c.accepted = accepted;
    const entry = g.reviewQueue[g.reviewIndex];
    g.voteOutcomes[entry.category + '|' + entry.pseudo] = accepted;
    broadcastCard(g);
    g._timer = setTimeout(() => advanceAfterCard(g, entry), CARD_PAUSE_MS);
}
function advanceAfterCard(g, entry) {
    g.reviewIndex++;
    const next = g.reviewQueue[g.reviewIndex];
    if (!next || next.category !== entry.category) finalizeCategoryOrRound(g, entry.category);
    else startCard(g);
}

// Récapitulatif des points d'une catégorie (une fois toutes ses cartes votées),
// puis passage à la catégorie suivante ou fin de manche.
function finalizeCategoryOrRound(g, justFinishedCategory) {
    if (justFinishedCategory) {
        const pts = {};
        const counts = {};
        for (const p of g.players) pts[p.pseudo] = 0;
        for (const p of g.players) {
            const raw = (g.answers[p.pseudo] && g.answers[p.pseudo][justFinishedCategory]) || '';
            const n = norm(raw);
            const ok = g.voteOutcomes[justFinishedCategory + '|' + p.pseudo];
            if (ok && n) counts[n] = (counts[n] || 0) + 1;
        }
        for (const p of g.players) {
            const raw = (g.answers[p.pseudo] && g.answers[p.pseudo][justFinishedCategory]) || '';
            const n = norm(raw);
            const ok = g.voteOutcomes[justFinishedCategory + '|' + p.pseudo];
            const gain = ok && n ? (counts[n] === 1 ? 3 : 1) : 0;
            pts[p.pseudo] = gain;
            g.categoryPoints[justFinishedCategory] = g.categoryPoints[justFinishedCategory] || {};
            g.categoryPoints[justFinishedCategory][p.pseudo] = gain;
        }
        g.status = 'cat_summary';
        g.lastCategory = justFinishedCategory;
        broadcastState(g);
        g._timer = setTimeout(() => {
            if (!g.reviewQueue[g.reviewIndex]) finalizeRound(g);
            else startCard(g);
        }, CATEGORY_SUMMARY_MS);
        return;
    }
    finalizeRound(g);
}

function finalizeRound(g) {
    clearTimeout(g._timer);
    const rs = {};
    for (const p of g.players) rs[p.pseudo] = 0;
    for (const cat of g.categories) {
        const cp = g.categoryPoints[cat] || {};
        for (const p of g.players) rs[p.pseudo] += cp[p.pseudo] || 0;
    }
    g.roundScores = rs;
    for (const p of g.players) g.scores[p.pseudo] = (g.scores[p.pseudo] || 0) + rs[p.pseudo];
    g.status = 'ended_round';
    broadcastState(g);
}

function endRoundToVoting(g) {
    clearTimeout(g._timer);
    g.reviewQueue = buildReviewQueue(g);
    g.reviewIndex = 0;
    g.voteOutcomes = {}; g.categoryPoints = {};
    if (!g.reviewQueue.length) { finalizeRound(g); return; }
    startCard(g);
}

function stateForClient(g) {
    return {
        id: g.id, host: g.host, status: g.status, players: playerList(g),
        categories: g.categories, maxRounds: g.maxRounds, round: g.round,
        duration: g.duration, letter: g.letter,
        timerEnd: g.status === 'writing' ? g.timerEnd : null,
        stoppedBy: g.stoppedBy || null,
        roundScores: g.roundScores || null,
        lastCategory: g.status === 'cat_summary' ? g.lastCategory : undefined,
        categoryPoints: g.status === 'cat_summary' ? (g.categoryPoints[g.lastCategory] || {}) : undefined,
        answers: g.status === 'cat_summary' ? mapAnswersFor(g, g.lastCategory) : undefined,
        voteOutcomes: g.status === 'cat_summary' ? filterOutcomesFor(g, g.lastCategory) : undefined,
    };
}
function mapAnswersFor(g, cat) {
    const out = {};
    for (const p of g.players) out[p.pseudo] = (g.answers[p.pseudo] && g.answers[p.pseudo][cat]) || '';
    return out;
}
function filterOutcomesFor(g, cat) {
    const out = {};
    for (const p of g.players) out[p.pseudo] = g.voteOutcomes[cat + '|' + p.pseudo] || false;
    return out;
}
function broadcastState(g) { io.to(roomOf(g)).emit('pbac_state', stateForClient(g)); }

function startRound(g) {
    g.round++;
    g.letter = pickLetter(g);
    g.answers = {}; g.roundScores = null; g.stoppedBy = null;
    for (const p of g.players) g.answers[p.pseudo] = {};
    g.status = 'writing';
    g.timerEnd = Date.now() + g.duration * 1000;
    broadcastState(g);
    g._timer = setTimeout(() => { if (g.status === 'writing') endRoundToVoting(g); }, g.duration * 1000);
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
            round: 0, usedLetters: [], scores: {}, answers: {},
            reviewQueue: [], reviewIndex: 0, voteOutcomes: {}, categoryPoints: {}, cardState: null,
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
        if (g.status === 'voting') sendCardTo(g, socket);
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
        endRoundToVoting(g);
    });

    socket.on('pbac_vote', ({ value }) => {
        const g = games[socketGame[socket.id]];
        const me = socket.data.pbacPseudo;
        if (!g || g.status !== 'voting' || !me || !g.cardState) return;
        if (value !== 'yes' && value !== 'no') return;
        const c = g.cardState;
        if (c.resolved || !c.eligible.includes(me) || c.voters[me]) return;
        c.voters[me] = value;
        c.votes.push(value);
        // On n'attend que les votants encore connectés (un départ ne doit pas bloquer la partie).
        const stillNeeded = c.eligible.filter(p => { const pl = g.players.find(x => x.pseudo === p); return pl && pl.connected; });
        if (!stillNeeded.length || c.votes.length >= stillNeeded.length) resolveCard(g);
        else broadcastCard(g);
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