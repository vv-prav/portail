// =====================================================================
//  MODULE PETIT BAC — branché sur le serveur du salon (app + io partagés).
//  Identité fournie par le cookie signé du portail (pas de compte séparé).
// =====================================================================
const crypto = require('crypto');

module.exports = function attachPbac(app, io, store) {

const mfGet = store && store.get ? store.get : () => undefined;
const mfSet = store && store.set ? store.set : () => {};
const kPacks = (pseudo) => `pbac:packs:${norm(pseudo)}`;
function sanitizePacks(list) {
    if (!Array.isArray(list)) return [];
    return list.slice(0, 12).map(p => ({
        name: String((p && p.name) || '').trim().slice(0, 24),
        categories: sanitizeCategories(p && p.categories),
    })).filter(p => p.name);
}

app.get('/pbac/healthz', (req, res) => res.status(200).json({ ok: true, t: Date.now(), games: Object.keys(games).length }));

// =====================================================================
//  CONSTANTES
// =====================================================================
const CATEGORIES = ['Prénom', 'Animal', 'Pays ou ville', 'Fruit ou légume', 'Métier', 'Objet', 'Couleur', 'Sport'];
const CATEGORY_PRESETS = [
    'Prénom', 'Animal', 'Pays ou ville', 'Fruit ou légume', 'Métier', 'Objet', 'Couleur', 'Sport',
    'Film ou série', 'Marque connue', 'Instrument de musique', 'Personnage de fiction',
    'Plat ou dessert', 'Moyen de transport', 'Vêtement', 'Boisson', 'Matière scolaire',
    'Expression toute faite', 'Élément de la maison', 'Insecte ou bestiole', 'Chanteur ou groupe', 'Prénom de star',
];
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');           // alphabet complet (mode « l'hôte choisit »)
const RANDOM_LETTERS = LETTERS.filter(l => !'WXYZ'.includes(l));   // tirage aléatoire : sans W, X, Y, Z
const DURATIONS = { court: 60, moyen: 90, long: 120 };
const COUNTDOWN_MS = 3000;    // le « 3, 2, 1 » avant que la lettre n'apparaisse
const CARD_PAUSE_MS = 1300;          // pause après résolution avant la carte suivante
const EMPTY_PAUSE_MS = 2400;         // durée d'affichage d'une case vide (« Loupé »)
const CATEGORY_SUMMARY_MS = 2600;    // récap affiché entre deux catégories
const MAX_PLAYERS = 12;
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
// Valide une liste de 8 catégories envoyée par l'hôte (préréglées ou tapées à la main).
// En cas de doute (vide, doublons, mauvaise taille), on retombe sur les 8 catégories par défaut.
function sanitizeCategories(input) {
    if (!Array.isArray(input)) return CATEGORIES.slice();
    const seen = new Set();
    const out = [];
    for (const raw of input) {
        const clean = String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 30);
        if (!clean || clean.length < 2) continue;
        const key = norm(clean);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(clean);
        if (out.length === 8) break;
    }
    return out.length === 8 ? out : CATEGORIES.slice();
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
    return g.players.map(p => ({ pseudo: p.pseudo, connected: p.connected, score: g.scores[p.pseudo] || 0, host: p.pseudo === g.host, spectator: !!p.spectator }));
}
function roomOf(g) { return 'pbac:' + g.id; }

function pickLetter(g) {
    let pool = RANDOM_LETTERS.filter(l => !g.usedLetters.includes(l));
    if (!pool.length) { g.usedLetters = []; pool = RANDOM_LETTERS; }
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
        queueIndex: g.reviewIndex, queueTotal: g.reviewQueue.length,
    };
    if (type === 'empty') return base;
    // Réponses déjà acceptées dans cette même catégorie, cette manche : candidates à une fusion (hôte uniquement).
    const mergeCandidates = g.reviewQueue.slice(0, g.reviewIndex)
        .filter(e => e.category === category && e.type === 'valid' && g.voteOutcomes[category + '|' + e.pseudo] === true)
        .map(e => ({ pseudo: e.pseudo, text: (g.answers[e.pseudo] && g.answers[e.pseudo][category]) || '' }));
    return {
        ...base,
        yes: c.votes.filter(v => v === 'yes').length, no: c.votes.filter(v => v === 'no').length,
        eligible: c.eligible.length, eligiblePseudos: c.eligible, votedPseudos: Object.keys(c.voters),
        resolved: c.resolved, accepted: c.accepted, mergedWith: c.mergedWith || null,
        mergeCandidates,
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
        const entries = g.players.filter(p => !p.spectator).map(p => {
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
    broadcastState(g);   // le client doit savoir qu'on quitte l'écriture / le récap pour voter
    if (entry.type === 'empty') {
        g.voteOutcomes[entry.category + '|' + entry.pseudo] = false;
        g.cardState = { type: 'empty', resolved: true, accepted: false, votes: [], voters: {}, eligible: [] };
        broadcastCard(g);
        g._timer = setTimeout(() => advanceAfterCard(g, entry), EMPTY_PAUSE_MS);
        return;
    }
    const eligible = g.players.filter(p => p.connected && !p.spectator && p.pseudo !== entry.pseudo).map(p => p.pseudo);
    g.cardState = { votes: [], voters: {}, eligible, resolved: false, accepted: false };
    broadcastCard(g);
    if (!eligible.length) resolveCard(g, true);   // personne pour voter : accepté d'office
}
// Aucune limite de temps : on attend que tout le monde ait voté (parmi les
// joueurs toujours connectés) avant de résoudre et d'avancer.
function resolveCard(g, forceAccept, mergedWith) {
    clearTimeout(g._timer);
    if (!g.cardState || g.cardState.resolved) return;
    const c = g.cardState;
    const accepted = typeof forceAccept === 'boolean' ? forceAccept : (c.votes.filter(v => v === 'yes').length > c.votes.filter(v => v === 'no').length);
    c.resolved = true; c.accepted = accepted; c.mergedWith = mergedWith || null;
    const entry = g.reviewQueue[g.reviewIndex];
    g.voteOutcomes[entry.category + '|' + entry.pseudo] = accepted;
    if (mergedWith) g.merges[entry.category + '|' + entry.pseudo] = mergedWith;
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
// Calcule les points d'une catégorie une fois toutes ses réponses tranchées (votées ou fusionnées).
// Commun aux deux modes de vote (séquentiel et parallèle).
function computeCategoryPoints(g, cat) {
    const rootOf = (pseudo) => {
        let cur = pseudo, hops = 0;
        while (g.merges[cat + '|' + cur] && hops++ < 8) cur = g.merges[cat + '|' + cur];
        return cur;
    };
    const groupKeyOf = (pseudo) => {
        const root = rootOf(pseudo);
        const rootRaw = (g.answers[root] && g.answers[root][cat]) || '';
        return norm(rootRaw);
    };
    const counts = {};
    for (const p of g.players) {
        const raw = (g.answers[p.pseudo] && g.answers[p.pseudo][cat]) || '';
        const ok = g.voteOutcomes[cat + '|' + p.pseudo];
        if (ok && raw) { const key = groupKeyOf(p.pseudo); counts[key] = (counts[key] || 0) + 1; }
    }
    g.categoryPoints[cat] = g.categoryPoints[cat] || {};
    for (const p of g.players) {
        const raw = (g.answers[p.pseudo] && g.answers[p.pseudo][cat]) || '';
        const ok = g.voteOutcomes[cat + '|' + p.pseudo];
        const gain = ok && raw ? (counts[groupKeyOf(p.pseudo)] === 1 ? 3 : 1) : 0;
        g.categoryPoints[cat][p.pseudo] = gain;
    }
}

function finalizeCategoryOrRound(g, justFinishedCategory) {
    if (justFinishedCategory) {
        computeCategoryPoints(g, justFinishedCategory);
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
    g.voteOutcomes = {}; g.categoryPoints = {}; g.merges = {};
    if (!g.reviewQueue.length) { finalizeRound(g); return; }
    if (g.voteMode === 'parallel') { g.parallelCatIndex = 0; startCategoryParallel(g, g.categories[0]); }
    else startCard(g);
}

// =====================================================================
//  MODE DE VOTE « PARALLÈLE » — toute la catégorie d'un coup, votes simultanés
//  sur chaque réponse. Beaucoup plus rapide à grand nombre de joueurs.
// =====================================================================
function resolveParallelCard(g, pseudo, forceAccept, mergedWith) {
    const c = g.parallelCards[pseudo];
    if (!c || c.resolved) return;
    const accepted = typeof forceAccept === 'boolean' ? forceAccept : (c.votes.filter(v => v === 'yes').length > c.votes.filter(v => v === 'no').length);
    c.resolved = true; c.accepted = accepted; c.mergedWith = mergedWith || null;
    g.voteOutcomes[g.parallelCategory + '|' + pseudo] = accepted;
    if (mergedWith) g.merges[g.parallelCategory + '|' + pseudo] = mergedWith;
}
function startCategoryParallel(g, cat) {
    clearTimeout(g._timer);
    g.status = 'voting';
    g.parallelCategory = cat;
    g.parallelCards = {};
    const entries = g.reviewQueue.filter(e => e.category === cat);
    for (const e of entries) {
        if (e.type === 'empty') { g.voteOutcomes[cat + '|' + e.pseudo] = false; continue; }
        const eligible = g.players.filter(p => p.connected && !p.spectator && p.pseudo !== e.pseudo).map(p => p.pseudo);
        g.parallelCards[e.pseudo] = { votes: [], voters: {}, eligible, resolved: false, accepted: false };
        if (!eligible.length) resolveParallelCard(g, e.pseudo, true);   // personne pour voter : accepté d'office
    }
    broadcastParallel(g);
    checkParallelDone(g);
}
function checkParallelDone(g) {
    if (g.status !== 'voting' || !g.parallelCategory) return;
    const entries = g.reviewQueue.filter(e => e.category === g.parallelCategory);
    const allDone = entries.every(e => e.type === 'empty' || (g.parallelCards[e.pseudo] && g.parallelCards[e.pseudo].resolved));
    if (!allDone) return;
    computeCategoryPoints(g, g.parallelCategory);
    g.status = 'cat_summary';
    g.lastCategory = g.parallelCategory;
    broadcastState(g);
    g._timer = setTimeout(() => {
        g.parallelCatIndex++;
        if (g.parallelCatIndex >= g.categories.length) finalizeRound(g);
        else startCategoryParallel(g, g.categories[g.parallelCatIndex]);
    }, CATEGORY_SUMMARY_MS);
}
function buildParallelCardsFor(g, viewerPseudo) {
    const entries = g.reviewQueue.filter(e => e.category === g.parallelCategory);
    const isHost = viewerPseudo === g.host;
    return entries.map(e => {
        if (e.type === 'empty') return { pseudo: e.pseudo, type: 'empty', text: (g.answers[e.pseudo] && g.answers[e.pseudo][g.parallelCategory]) || '' };
        const c = g.parallelCards[e.pseudo] || { votes: [], voters: {}, eligible: [], resolved: false };
        const mergeCandidates = isHost
            ? entries.filter(x => x.type === 'valid' && x.pseudo !== e.pseudo && g.voteOutcomes[g.parallelCategory + '|' + x.pseudo] === true)
                .map(x => ({ pseudo: x.pseudo, text: (g.answers[x.pseudo] && g.answers[x.pseudo][g.parallelCategory]) || '' }))
            : [];
        return {
            pseudo: e.pseudo, type: 'valid', text: (g.answers[e.pseudo] && g.answers[e.pseudo][g.parallelCategory]) || '',
            yes: c.votes.filter(v => v === 'yes').length, no: c.votes.filter(v => v === 'no').length,
            eligible: c.eligible.length, votedPseudos: Object.keys(c.voters),
            resolved: c.resolved, accepted: c.accepted, mergedWith: c.mergedWith || null,
            iVoted: c.voters[viewerPseudo] || null, canVote: c.eligible.includes(viewerPseudo) && !c.voters[viewerPseudo] && !c.resolved,
            mergeCandidates,
        };
    });
}
function sendParallelTo(g, socket) {
    const pseudo = socket.data.pbacPseudo;
    socket.emit('pbac_parallel', {
        category: g.parallelCategory,
        catIndex: g.categories.indexOf(g.parallelCategory) + 1, catTotal: g.categories.length,
        cards: buildParallelCardsFor(g, pseudo),
    });
}
function broadcastParallel(g) {
    for (const p of g.players) {
        const sock = io.sockets.sockets.get(p.sid);
        if (sock) sendParallelTo(g, sock);
    }
}

function stateForClient(g) {
    return {
        id: g.id, host: g.host, status: g.status, players: playerList(g),
        categories: g.categories, maxRounds: g.maxRounds, round: g.round,
        duration: g.duration, letter: g.letter, letterMode: g.letterMode, voteMode: g.voteMode,
        timerEnd: g.status === 'writing' ? g.timerEnd : null,
        countdownEnd: g.status === 'countdown' ? g.countdownEnd : null,
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

// Démarre une nouvelle manche : soit directement le compte à rebours (lettre
// aléatoire), soit on attend d'abord que l'hôte choisisse sa lettre.
function advanceToNextRound(g) {
    g.round++;
    g.stoppedBy = null;
    g.players.forEach(p => { p.spectator = false; });   // tout le monde repart à égalité sur la nouvelle manche
    if (g.letterMode === 'host') {
        g.status = 'choosing_letter';
        broadcastState(g);
        return;
    }
    beginCountdown(g);
}
function beginCountdown(g) {
    clearTimeout(g._timer);
    g.status = 'countdown';
    g.countdownEnd = Date.now() + COUNTDOWN_MS;
    broadcastState(g);
    g._timer = setTimeout(() => revealAndStartWriting(g), COUNTDOWN_MS);
}
function revealAndStartWriting(g) {
    if (g.letterMode === 'host' && g.pendingLetter) {
        g.letter = g.pendingLetter;
        g.usedLetters.push(g.letter);
    } else {
        g.letter = pickLetter(g);
    }
    g.pendingLetter = null;
    g.answers = {}; g.roundScores = null;
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

    socket.on('pbac_packs_list', () => {
        const pseudo = socket.data.pbacPseudo;
        if (!pseudo) return;
        socket.emit('pbac_packs', sanitizePacks(mfGet(kPacks(pseudo))));
    });
    socket.on('pbac_packs_save', ({ name, categories }) => {
        const pseudo = socket.data.pbacPseudo;
        if (!pseudo) return socket.emit('pbac_error', 'Session expirée, reviens au salon.');
        const cleanName = String(name || '').trim().slice(0, 24);
        if (!cleanName) return socket.emit('pbac_error', 'Donne un nom à ce pack.');
        const cats = sanitizeCategories(categories);
        const packs = sanitizePacks(mfGet(kPacks(pseudo)));
        const i = packs.findIndex(p => p.name.toLowerCase() === cleanName.toLowerCase());
        const pack = { name: cleanName, categories: cats };
        if (i >= 0) packs[i] = pack; else packs.unshift(pack);
        mfSet(kPacks(pseudo), packs.slice(0, 12));
        socket.emit('pbac_packs', packs.slice(0, 12));
    });
    socket.on('pbac_packs_delete', ({ name }) => {
        const pseudo = socket.data.pbacPseudo;
        if (!pseudo) return;
        const packs = sanitizePacks(mfGet(kPacks(pseudo))).filter(p => p.name.toLowerCase() !== String(name || '').toLowerCase());
        mfSet(kPacks(pseudo), packs);
        socket.emit('pbac_packs', packs);
    });

    socket.on('pbac_create', ({ rounds, duration, categories, letterMode, voteMode }) => {
        const pseudo = socket.data.pbacPseudo;
        if (!pseudo) return socket.emit('pbac_error', 'Session expirée, reviens au salon.');
        const id = 'p' + (nextId++);
        const g = {
            id, host: pseudo, status: 'lobby',
            players: [{ sid: socket.id, pseudo, connected: true }],
            categories: sanitizeCategories(categories),
            maxRounds: [3, 5, 7].includes(Number(rounds)) ? Number(rounds) : 5,
            duration: DURATIONS[duration] || DURATIONS.moyen,
            letterMode: letterMode === 'host' ? 'host' : 'random',
            voteMode: voteMode === 'parallel' ? 'parallel' : 'sequential',
            round: 0, usedLetters: [], scores: {}, answers: {}, pendingLetter: null,
            reviewQueue: [], reviewIndex: 0, voteOutcomes: {}, categoryPoints: {}, cardState: null, merges: {},
            parallelCategory: null, parallelCards: {}, parallelCatIndex: 0,
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
            if (g.players.length >= MAX_PLAYERS) return socket.emit('pbac_error', 'Table complète.');
            // Rejoint en pleine partie : spectateur jusqu'à la prochaine manche (jamais bloqué dehors).
            const spectator = g.status !== 'lobby';
            g.players.push({ sid: socket.id, pseudo, connected: true, spectator });
            g.scores[pseudo] = 0;
        }
        socketGame[socket.id] = g.id;
        socket.join(roomOf(g));
        broadcastState(g);
        if (g.status === 'voting') {
            if (g.voteMode === 'parallel') sendParallelTo(g, socket);
            else sendCardTo(g, socket);
        }
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
        advanceToNextRound(g);
    });

    socket.on('pbac_pick_letter', ({ letter }) => {
        const g = games[socketGame[socket.id]];
        if (!g || g.host !== socket.data.pbacPseudo || g.status !== 'choosing_letter') return;
        const L = String(letter || '').toUpperCase().trim();
        if (!/^[A-Z]$/.test(L)) return;
        g.pendingLetter = L;
        beginCountdown(g);
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

    // Décision réservée à l'hôte : « c'est le même mot » (faute de frappe, accord…),
    // fusionne avec une réponse déjà acceptée dans la même catégorie cette manche.
    socket.on('pbac_merge', ({ targetPseudo }) => {
        const g = games[socketGame[socket.id]];
        if (!g || g.host !== socket.data.pbacPseudo || g.status !== 'voting' || !g.cardState) return;
        const entry = g.reviewQueue[g.reviewIndex];
        if (!entry || entry.type !== 'valid' || g.cardState.resolved) return;
        const target = String(targetPseudo || '');
        if (!target || target === entry.pseudo) return;
        if (g.voteOutcomes[entry.category + '|' + target] !== true) return;   // la cible doit être déjà acceptée
        resolveCard(g, true, target);
    });

    // ---- Mode de vote parallèle : toute la catégorie d'un coup ----
    socket.on('pbac_vote_parallel', ({ pseudo: targetPseudo, value }) => {
        const g = games[socketGame[socket.id]];
        const me = socket.data.pbacPseudo;
        if (!g || g.status !== 'voting' || g.voteMode !== 'parallel' || !me) return;
        if (value !== 'yes' && value !== 'no') return;
        const c = g.parallelCards[targetPseudo];
        if (!c || c.resolved || !c.eligible.includes(me) || c.voters[me]) return;
        c.voters[me] = value;
        c.votes.push(value);
        const stillNeeded = c.eligible.filter(p => { const pl = g.players.find(x => x.pseudo === p); return pl && pl.connected; });
        if (!stillNeeded.length || c.votes.length >= stillNeeded.length) resolveParallelCard(g, targetPseudo);
        broadcastParallel(g);
        checkParallelDone(g);
    });
    socket.on('pbac_merge_parallel', ({ pseudo: targetOfPseudo, mergeWith }) => {
        const g = games[socketGame[socket.id]];
        if (!g || g.host !== socket.data.pbacPseudo || g.status !== 'voting' || g.voteMode !== 'parallel') return;
        const c = g.parallelCards[targetOfPseudo];
        if (!c || c.resolved) return;
        const target = String(mergeWith || '');
        if (!target || target === targetOfPseudo) return;
        if (g.voteOutcomes[g.parallelCategory + '|' + target] !== true) return;
        resolveParallelCard(g, targetOfPseudo, true, target);
        broadcastParallel(g);
        checkParallelDone(g);
    });

    socket.on('pbac_next_round', () => {
        const g = games[socketGame[socket.id]];
        if (!g || g.host !== socket.data.pbacPseudo || g.status !== 'ended_round') return;
        if (g.round >= g.maxRounds) { g.status = 'ended'; broadcastState(g); broadcastLobby(); return; }
        advanceToNextRound(g);
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