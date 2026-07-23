// =====================================================================
//  INFILTRÉ — jeu social de déduction, en équipe.
//  Deux façons d'y jouer : à distance (chacun son mot sur son téléphone,
//  ce module) ou en local, un seul appareil qui passe de main en main
//  (entièrement géré côté client, voir public/undercover/app.js).
// =====================================================================
const crypto = require('crypto');

// Paires (mot civil / mot infiltré) : proches en thème mais bien distincts.
const PAIRS = [
    ['Chat', 'Chien'], ['Café', 'Thé'], ['Plage', 'Piscine'], ['Guitare', 'Piano'],
    ['Pizza', 'Burger'], ['Été', 'Hiver'], ['Avion', 'Train'], ['Médecin', 'Infirmier'],
    ['Lune', 'Soleil'], ['Mer', 'Océan'], ['Pomme', 'Poire'], ['Football', 'Rugby'],
    ['Cinéma', 'Théâtre'], ['Voiture', 'Moto'], ['Livre', 'Journal'], ['Fromage', 'Beurre'],
    ['Montagne', 'Colline'], ['Rivière', 'Lac'], ['Chocolat', 'Vanille'], ['Facebook', 'Instagram'],
    ['Whatsapp', 'Messenger'], ['Netflix', 'Youtube'], ['Professeur', 'Instituteur'], ['Policier', 'Pompier'],
    ['Vélo', 'Trottinette'], ['Bière', 'Vin'], ['Chaussette', 'Chaussure'], ['Pantalon', 'Short'],
    ['Hôpital', 'Clinique'], ['Restaurant', 'Fast-food'], ['Chanteur', 'Musicien'], ['Danse', 'Chant'],
    ['Piscine', 'Baignoire'], ['Douche', 'Bain'], ['Téléphone', 'Ordinateur'], ['Télévision', 'Radio'],
    ['Fourchette', 'Cuillère'], ['Assiette', 'Bol'], ['Jardin', 'Forêt'], ['Fleur', 'Plante'],
    ['Chameau', 'Dromadaire'], ['Lion', 'Tigre'], ['Aigle', 'Faucon'], ['Serpent', 'Lézard'],
    ['Pluie', 'Neige'], ['Vent', 'Orage'], ['Noël', 'Pâques'], ['Anniversaire', 'Mariage'],
    ['Château', 'Palais'], ['Roi', 'Reine'], ['Pirate', 'Corsaire'], ['Sorcière', 'Magicien'],
    ['Vampire', 'Loup-garou'], ['Fantôme', 'Zombie'], ['École', 'Université'], ['Cahier', 'Carnet'],
    ['Stylo', 'Crayon'], ['Gomme', 'Règle'], ['Pain', 'Baguette'], ['Croissant', 'Pain au chocolat'],
    ['Salade', 'Soupe'], ['Frites', 'Chips'], ['Glace', 'Sorbet'], ['Gâteau', 'Tarte'],
    ['Bonbon', 'Chocolat noir'], ['Piano', 'Violon'], ['Basket', 'Handball'], ['Tennis', 'Badminton'],
    ['Ski', 'Snowboard'], ['Natation', 'Plongée'], ['Perroquet', 'Toucan'], ['Dauphin', 'Baleine'],
    ['Robot', 'Extraterrestre'], ['Astronaute', 'Pilote'],
    // ---- entre potes : plus marrant, plus vécu ----
    ['Ex', 'Crush'], ['Beau-frère', 'Belle-mère'], ['Ronflement', 'Pet'], ['Gueule de bois', 'Insomnie'],
    ['Tinder', 'Instagram'], ['WhatsApp', 'SMS'], ['Chef', 'Stagiaire'], ['Karaoké', 'Playback'],
    ['Anniversaire', 'Enterrement de vie de garçon'], ['Croisière', 'Camping sauvage'], ['Selfie', 'Portrait'],
    ['Influenceur', 'Youtubeur'], ['Poker', 'Loto'], ['Barbecue', 'Fondue savoyarde'], ['Apéro', 'Digestif'],
    ['Sieste', 'Grasse matinée'], ['Ronfleur', 'Somnambule'], ['Boomer', 'Millenial'], ['Playstation', 'Nintendo Switch'],
    ['TikTok', 'Snapchat'], ['Uber', 'Taxi'], ['Deliveroo', 'Fait maison'], ['Colocataire', 'Voisin bruyant'],
    ['Régime', 'Jeûne'], ['Salle de sport', 'Yoga'], ['Marathon', 'Randonnée'], ['Coup de foudre', 'Coup de bol'],
    ['Chirurgien esthétique', 'Coiffeur'], ['Horoscope', 'Tarot'], ['Fantôme (ghosting)', 'Silence radio'],
    ['Alcootest', 'Test de grossesse'], ['Divorce', 'Rupture'], ['Speed dating', 'Colonie de vacances'],
    ['Sosie', 'Jumeau'], ['Cauchemar', 'Insomnie récurrente'], ['Podcast', 'Audiobook'], ['Cryptomonnaie', 'Casino'],
    ['Télétravail', 'Chômage'], ['Patron toxique', 'Belle-mère envahissante'], ['Vegan', 'Intolérant au gluten'],
    ['Chihuahua', 'Chat de gouttière'], ['Camping-car', 'Van aménagé'], ['Fête foraine', 'Parc d\u2019attractions'],
    ['Chirurgien', 'Boucher'], ['Astrologue', 'Voyante'], ['Gendre idéal', 'Belle-fille parfaite'],
    ['Insta-parfait', 'Filtré'], ['Blind test', 'Karaoké raté'], ['Notaire', 'Huissier'], ['Impôts', 'Amende'],
    ['Colique', 'Migraine'], ['Anniversaire surprise', 'Enterrement surprise'], ['Playlist', 'Mixtape'],
];

module.exports = function attachUndercover(app, io, requireAuth) {

app.get('/undercover/pairs.json', requireAuth, (req, res) => res.json(PAIRS));

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
    return String(data.u).slice(0, 20);
}

const MAX_PLAYERS = 12;
const games = {};
const socketGame = {};
let nextId = 1;

function publicGames() {
    return Object.values(games)
        .filter(g => g.status === 'lobby')
        .map(g => ({ id: g.id, host: g.host, players: g.players.length, maxPlayers: MAX_PLAYERS }));
}
function broadcastLobby() { io.emit('uc_games', publicGames()); }
function roomOf(g) { return 'uc:' + g.id; }
function alive(g) { return g.players.filter(p => p.alive); }

function suggestUndercoverCount(n) {
    if (n >= 9) return 3;
    if (n >= 7) return 2;
    return 1;
}

function playerList(g) {
    return g.players.map(p => ({ pseudo: p.pseudo, connected: p.connected, alive: p.alive, host: p.pseudo === g.host }));
}

function norm(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }

function stateForClient(g, viewerPseudo) {
    const me = g.players.find(p => p.pseudo === viewerPseudo);
    const base = {
        id: g.id, host: g.host, status: g.status, players: playerList(g),
        round: g.round, undercoverCount: g.undercoverCount,
        mrWhiteEnabled: !!g.mrWhiteEnabled, subgroupsEnabled: !!g.subgroupsEnabled,
        turnPseudo: g.status === 'speaking' ? (alive(g)[g.turnIndex] || {}).pseudo : null,
        speakOrder: g.status === 'speaking' ? alive(g).map(p => p.pseudo) : undefined,
        votedPseudos: g.status === 'voting' ? Object.keys(g.votes) : undefined,
        eligibleCount: g.status === 'voting' ? alive(g).length : undefined,
        myVote: g.status === 'voting' ? (g.votes[viewerPseudo] || null) : undefined,
        result: g.status === 'result' ? g.lastResult : undefined,
        awaitingMrWhiteGuess: g.status === 'result' ? (g.awaitingMrWhiteGuess || null) : undefined,
        winner: g.status === 'ended' ? g.winner : undefined,
        finalReveal: g.status === 'ended' ? g.players.map(p => ({ pseudo: p.pseudo, role: p.role, word: p.word })) : undefined,
    };
    if (me && me.word) base.myWord = me.word;
    if (me && me.role === 'mrwhite') base.myRole = 'mrwhite';   // pas de mot, mais on sait qu'on doit bluffer
    return base;
}
function broadcastState(g) {
    for (const p of g.players) {
        const sock = io.sockets.sockets.get(p.sid);
        if (sock) sock.emit('uc_state', stateForClient(g, p.pseudo));
    }
}

function startGame(g) {
    const n = g.players.length;
    const mrWhiteCount = g.mrWhiteEnabled && n >= 4 ? 1 : 0;
    let ucCount = Math.min(g.undercoverCount || suggestUndercoverCount(n), Math.max(1, n - 2 - mrWhiteCount));
    if (ucCount + mrWhiteCount > n - 2) ucCount = Math.max(1, n - 2 - mrWhiteCount);
    const pair = PAIRS[Math.floor(Math.random() * PAIRS.length)];
    // Sous-groupes : les infiltrés se répartissent sur DEUX mots proches au lieu d'un seul —
    // ils ne savent même pas si les autres infiltrés ont le même mot qu'eux.
    let pair2 = null;
    if (g.subgroupsEnabled && ucCount >= 2) {
        let tries = 0;
        do { pair2 = PAIRS[Math.floor(Math.random() * PAIRS.length)]; } while (pair2[1] === pair[1] && tries++ < 10);
    }
    const shuffled = g.players.slice().sort(() => Math.random() - 0.5);
    let idx = 0;
    for (let i = 0; i < ucCount; i++) {
        const p = shuffled[idx++];
        p.role = 'undercover';
        p.word = (pair2 && i % 2 === 1) ? pair2[1] : pair[1];
    }
    for (let i = 0; i < mrWhiteCount; i++) {
        const p = shuffled[idx++];
        p.role = 'mrwhite';
        p.word = null;
    }
    for (; idx < shuffled.length; idx++) { shuffled[idx].role = 'civil'; shuffled[idx].word = pair[0]; }
    g.civilWord = pair[0];
    g.round = 1;
    g.turnIndex = 0;
    g.votes = {};
    g.awaitingMrWhiteGuess = null;
    g.status = 'speaking';
    broadcastState(g);
}

function checkWin(g) {
    const a = alive(g);
    const impostors = a.filter(p => p.role === 'undercover' || p.role === 'mrwhite').length;
    const civAlive = a.length - impostors;
    if (impostors === 0) { g.status = 'ended'; g.winner = 'civils'; return true; }
    if (impostors >= civAlive) { g.status = 'ended'; g.winner = 'infiltres'; return true; }
    return false;
}
function advanceAfterResult(g) {
    if (checkWin(g)) { broadcastState(g); broadcastLobby(); return; }
    g.round++;
    g.turnIndex = 0;
    g.votes = {};
    g.status = 'speaking';
    broadcastState(g);
}

function resolveVote(g) {
    const counts = {};
    for (const target of Object.values(g.votes)) counts[target] = (counts[target] || 0) + 1;
    let top = null, topN = 0, tie = false;
    for (const [pseudo, n] of Object.entries(counts)) {
        if (n > topN) { top = pseudo; topN = n; tie = false; }
        else if (n === topN) tie = true;
    }
    let eliminated = null;
    if (top && !tie) {
        const p = g.players.find(x => x.pseudo === top);
        if (p) { p.alive = false; eliminated = p; }
    }
    g.lastResult = eliminated
        ? { eliminated: eliminated.pseudo, role: eliminated.role, word: eliminated.word, tie: false }
        : { eliminated: null, tie };
    g.status = 'result';
    // Mr Blanc démasqué : une dernière chance de deviner le mot des civils avant de continuer.
    if (eliminated && eliminated.role === 'mrwhite') {
        g.awaitingMrWhiteGuess = eliminated.pseudo;
        broadcastState(g);
        return;
    }
    g.awaitingMrWhiteGuess = null;
    broadcastState(g);
    g._timer = setTimeout(() => advanceAfterResult(g), 4500);
}

io.on('connection', (socket) => {

    socket.on('uc_identify', (ack) => {
        const pseudo = salonPseudoFromCookie(socket.handshake.headers.cookie);
        socket.data.ucPseudo = pseudo;
        if (typeof ack === 'function') ack({ ok: !!pseudo, pseudo });
    });

    socket.on('uc_list', () => socket.emit('uc_games', publicGames()));

    socket.on('uc_create', () => {
        const pseudo = socket.data.ucPseudo;
        if (!pseudo) return socket.emit('uc_error', 'Session expirée, reviens au salon.');
        const id = 'u' + (nextId++);
        games[id] = {
            id, host: pseudo, status: 'lobby',
            players: [{ sid: socket.id, pseudo, connected: true, alive: true, role: null, word: null }],
            undercoverCount: 0, round: 0, turnIndex: 0, votes: {},
            mrWhiteEnabled: false, subgroupsEnabled: false, awaitingMrWhiteGuess: null, civilWord: null,
        };
        socketGame[socket.id] = id;
        socket.join(roomOf(games[id]));
        broadcastState(games[id]);
        broadcastLobby();
    });

    socket.on('uc_join', ({ id }) => {
        const pseudo = socket.data.ucPseudo;
        const g = games[id];
        if (!pseudo) return socket.emit('uc_error', 'Session expirée, reviens au salon.');
        if (!g) return socket.emit('uc_error', 'Cette partie n\u2019existe plus.');
        let p = g.players.find(x => x.pseudo === pseudo);
        if (p) { p.sid = socket.id; p.connected = true; }
        else {
            if (g.status !== 'lobby') return socket.emit('uc_error', 'La partie a déjà commencé.');
            if (g.players.length >= MAX_PLAYERS) return socket.emit('uc_error', 'Table complète.');
            g.players.push({ sid: socket.id, pseudo, connected: true, alive: true, role: null, word: null });
        }
        socketGame[socket.id] = g.id;
        socket.join(roomOf(g));
        broadcastState(g);
        broadcastLobby();
    });

    function leaveCurrent(socket) {
        const gid = socketGame[socket.id];
        if (!gid) return;
        const g = games[gid];
        delete socketGame[socket.id];
        socket.leave(roomOf(g || {}));
        if (!g) return;
        g.players = g.players.filter(x => x.sid !== socket.id);
        if (!g.players.length) { delete games[gid]; broadcastLobby(); return; }
        if (g.host === socket.data.ucPseudo) g.host = g.players[0].pseudo;
        broadcastState(g);
        broadcastLobby();
    }
    socket.on('uc_leave', () => leaveCurrent(socket));
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

    socket.on('uc_set_undercover_count', ({ count }) => {
        const g = games[socketGame[socket.id]];
        if (!g || g.host !== socket.data.ucPseudo || g.status !== 'lobby') return;
        const n = Number(count);
        if (!Number.isInteger(n) || n < 1 || n > Math.max(1, g.players.length - 2)) return;
        g.undercoverCount = n;
        broadcastState(g);
    });
    socket.on('uc_set_mrwhite', ({ enabled }) => {
        const g = games[socketGame[socket.id]];
        if (!g || g.host !== socket.data.ucPseudo || g.status !== 'lobby') return;
        g.mrWhiteEnabled = !!enabled;
        broadcastState(g);
    });
    socket.on('uc_set_subgroups', ({ enabled }) => {
        const g = games[socketGame[socket.id]];
        if (!g || g.host !== socket.data.ucPseudo || g.status !== 'lobby') return;
        g.subgroupsEnabled = !!enabled;
        broadcastState(g);
    });

    socket.on('uc_start', () => {
        const g = games[socketGame[socket.id]];
        if (!g || g.host !== socket.data.ucPseudo || g.status !== 'lobby') return;
        if (g.players.length < 3) return socket.emit('uc_error', 'Il faut au moins 3 joueurs.');
        startGame(g);
        broadcastLobby();
    });

    socket.on('uc_next_turn', () => {
        const g = games[socketGame[socket.id]];
        if (!g || g.host !== socket.data.ucPseudo || g.status !== 'speaking') return;
        const a = alive(g);
        g.turnIndex = (g.turnIndex + 1) % a.length;
        broadcastState(g);
    });

    socket.on('uc_go_vote', () => {
        const g = games[socketGame[socket.id]];
        if (!g || g.host !== socket.data.ucPseudo || g.status !== 'speaking') return;
        g.status = 'voting';
        g.votes = {};
        broadcastState(g);
    });

    socket.on('uc_vote', ({ targetPseudo }) => {
        const g = games[socketGame[socket.id]];
        const me = socket.data.ucPseudo;
        if (!g || g.status !== 'voting' || !me) return;
        const meP = g.players.find(x => x.pseudo === me);
        if (!meP || !meP.alive) return;
        const target = String(targetPseudo || '');
        if (!target || target === me) return;
        const targetP = g.players.find(x => x.pseudo === target);
        if (!targetP || !targetP.alive) return;
        g.votes[me] = target;
        broadcastState(g);
        const stillNeeded = alive(g).filter(p => p.connected).length;
        if (Object.keys(g.votes).length >= stillNeeded) resolveVote(g);
    });

    socket.on('uc_mrwhite_guess', ({ guess }) => {
        const g = games[socketGame[socket.id]];
        const me = socket.data.ucPseudo;
        if (!g || g.status !== 'result' || !g.awaitingMrWhiteGuess || me !== g.awaitingMrWhiteGuess) return;
        const correct = !!guess && norm(guess) === norm(g.civilWord);
        g.awaitingMrWhiteGuess = null;
        if (correct) {
            clearTimeout(g._timer);
            g.status = 'ended'; g.winner = 'mrwhite';
            broadcastState(g); broadcastLobby();
            return;
        }
        broadcastState(g);
        g._timer = setTimeout(() => advanceAfterResult(g), 2200);
    });
    // L'hôte peut passer si Mr Blanc ne répond pas (ne bloque jamais la partie).
    socket.on('uc_mrwhite_skip', () => {
        const g = games[socketGame[socket.id]];
        if (!g || g.host !== socket.data.ucPseudo || g.status !== 'result' || !g.awaitingMrWhiteGuess) return;
        g.awaitingMrWhiteGuess = null;
        broadcastState(g);
        g._timer = setTimeout(() => advanceAfterResult(g), 300);
    });

    socket.on('uc_rematch', () => {
        const g = games[socketGame[socket.id]];
        if (!g || g.host !== socket.data.ucPseudo || g.status !== 'ended') return;
        g.status = 'lobby';
        g.players.forEach(p => { p.alive = true; p.role = null; p.word = null; });
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
        try { io.to(roomOf(g)).emit('uc_closed'); } catch (e) {}
        delete games[id];
        broadcastLobby();
        return true;
    },
};

};