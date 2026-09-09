// =====================================================================
//  LE QUIZ DES DRAPEAUX — jusqu'à dix joueurs, en simultané
//
//  La décision qui commande tout le reste : ce n'est PAS du tour par tour.
//  Le Yams à quatre joueurs, c'est déjà onze minutes d'attente sur quinze ;
//  à dix, n'importe quelle structure au tour par tour donnerait 90 % de
//  temps mort et la partie mourrait avant la fin. Ici tout le monde répond
//  à la même question en même temps, et c'est la vitesse qui départage.
//
//  Bénéfice qui n'est pas un détail : une déconnexion ne bloque plus rien.
//  Le joueur absent marque zéro sur les questions qu'il rate, là où le Yams
//  se figeait pour toute la table. C'est structurel, pas rattrapé après coup.
//
//  Le serveur mène la partie de bout en bout : il ferme la question, montre
//  la réponse, enchaîne. Rien n'attend un clic de l'hôte — à dix, faire
//  dépendre chaque enchaînement d'une seule personne est intenable.
// =====================================================================
const crypto = require('crypto');
const Questions = require('./questions');

module.exports = function attachDrapeaux(app, io, deps) {

const mfGet = deps.get || (() => undefined);
const mfSet = deps.set || (() => {});

const MIN_PLAYERS = 1;      // on peut s'entraîner seul contre le chrono
const MAX_PLAYERS = 10;
const NB_QUESTIONS = [10, 15, 20];
const DUREES = [8, 12, 20];          // secondes par question
const REVELATION_MS = 4500;          // le temps de lire la réponse et le classement
const POINTS_BASE = 100;
const POINTS_VITESSE = 100;          // bonus dégressif sur la durée de la question

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
//  STATISTIQUES
// =====================================================================
const kStats = (pseudo) => `drapeaux:stats:${pseudo}`;
const INDEX_KEY = 'drapeaux:statsIndex';
function statsVierges() {
    return {
        parties: 0, victoires: 0, nuls: 0, solo: 0,
        questions: 0, bonnes: 0,
        meilleurScore: 0, totalPoints: 0,
        meilleureSerie: 0,               // bonnes réponses d'affilée, tous matchs
        plusRapide: null,                // la réponse juste la plus rapide, en ms
        parType: {},                     // { type: { posees, bonnes } }
    };
}
function chargerStats(pseudo) {
    const s = mfGet(kStats(pseudo));
    return s && typeof s === 'object'
        ? { ...statsVierges(), ...s, parType: { ...(s.parType || {}) } }
        : statsVierges();
}
function enregistrerStats(pseudo, stats) {
    mfSet(kStats(pseudo), stats);
    const index = mfGet(INDEX_KEY) || [];
    if (!index.includes(pseudo)) { index.push(pseudo); mfSet(INDEX_KEY, index); }
}

// =====================================================================
//  ÉTAT DES PARTIES
// =====================================================================
const games = {};
const socketGame = {};
let nextId = 1;
const roomOf = (g) => 'drapeaux:' + g.id;

function nouveauJoueur(sid, pseudo) {
    return { sid, pseudo, connected: true, score: 0, reponses: [], serie: 0, meilleureSerie: 0 };
}
function present(p) { return p.connected; }

// ---------- Le barème ----------
// Cent points pour une bonne réponse, plus un bonus de vitesse qui décroît sur
// la durée de la question. Rien pour une erreur ou un silence, mais rien de
// négatif non plus : à dix joueurs, il faut que le douzième du classement du
// salon puisse quand même gagner une partie.
function pointsDe(msEcoulees, dureeMs, doublee) {
    const part = Math.max(0, 1 - msEcoulees / dureeMs);
    const total = POINTS_BASE + Math.round(POINTS_VITESSE * part);
    return doublee ? total * 2 : total;
}

function publicGames() {
    return Object.values(games).filter(g => g.status !== 'ended').map(g => ({
        id: g.id, host: g.host, status: g.status,
        players: g.players.length, maxPlayers: MAX_PLAYERS,
        alive: g.players.filter(present).length,
        spectators: (g.spectators || []).length,
        question: g.qIndex + 1, total: g.options.nbQuestions,
        niveau: g.options.niveau,
    }));
}
function broadcastLobby() { io.emit('drapeaux_games', publicGames()); }

// ---------- L'état envoyé au navigateur ----------
// ⚠️ `bonne` n'est JAMAIS envoyé pendant la question : le serveur le garde et
// ne le révèle qu'à la fermeture. C'est le même principe que la Géographie du
// jour — la réponse ne doit pas se trouver dans la page.
function questionPublique(g) {
    const q = g.questions[g.qIndex];
    if (!q) return null;
    return {
        numero: g.qIndex + 1, total: g.options.nbQuestions,
        doublee: g.qIndex === g.options.nbQuestions - 1,
        type: q.type, enonce: q.enonce, media: q.media,
        choix: q.choix,
    };
}
function classement(g) {
    return [...g.players]
        .sort((a, b) => b.score - a.score || a.pseudo.localeCompare(b.pseudo))
        .map((p, i) => ({
            pseudo: p.pseudo, score: p.score, place: i + 1,
            connected: p.connected, serie: p.serie,
        }));
}
function gagnantsDe(g) {
    if (!g.players.length) return [];
    const meilleur = Math.max(...g.players.map(p => p.score));
    if (meilleur <= 0) return [];
    return g.players.filter(p => p.score === meilleur).map(p => p.pseudo);
}

function etatPour(g, pseudo) {
    const moi = g.players.find(p => p.pseudo === pseudo) || null;
    const q = g.questions[g.qIndex];
    const maReponse = moi && moi.reponses[g.qIndex] ? moi.reponses[g.qIndex] : null;
    return {
        id: g.id, host: g.host, status: g.status, phase: g.phase,
        options: g.options,
        joueurs: g.players.map(p => ({ pseudo: p.pseudo, connected: p.connected, score: p.score })),
        spectateurs: (g.spectators || []).map(s => s.pseudo),
        classement: classement(g),
        question: g.status === 'playing' ? questionPublique(g) : null,
        // Le compteur dit COMBIEN ont répondu, jamais qui ni quoi : sinon on
        // regarde le voisin au lieu de réfléchir.
        repondu: g.status === 'playing' ? g.players.filter(p => present(p) && p.reponses[g.qIndex]).length : 0,
        presents: g.players.filter(present).length,
        finitA: g.phase === 'question' ? g.finitA : null,
        maReponse: maReponse ? { index: maReponse.index } : null,
        // La correction n'existe que pendant la révélation.
        correction: (g.phase === 'reveal' && q) ? {
            bonne: q.bonne, reponse: q.reponse,
            resultats: g.players.map(p => {
                const r = p.reponses[g.qIndex];
                return { pseudo: p.pseudo, index: r ? r.index : null, juste: !!(r && r.juste), points: r ? r.points : 0 };
            }),
        } : null,
        final: g.status === 'ended' ? {
            gagnants: gagnantsDe(g),
            classement: classement(g),
            faits: faitsMarquants(g),
        } : null,
    };
}
function diffuser(g) {
    g.players.forEach(p => io.to(p.sid).emit('drapeaux_state', etatPour(g, p.pseudo)));
    (g.spectators || []).forEach(s => io.to(s.sid).emit('drapeaux_state', etatPour(g, s.pseudo)));
}

// Ce qu'on retient d'une partie, au-delà du podium.
function faitsMarquants(g) {
    const faits = [];
    let rapide = null;
    for (const p of g.players) {
        for (const r of p.reponses) {
            if (r && r.juste && (!rapide || r.ms < rapide.ms)) rapide = { pseudo: p.pseudo, ms: r.ms };
        }
    }
    if (rapide) faits.push(`⚡ Réponse la plus rapide : ${rapide.pseudo}, en ${(rapide.ms / 1000).toFixed(1)} s`);
    const serie = [...g.players].sort((a, b) => b.meilleureSerie - a.meilleureSerie)[0];
    if (serie && serie.meilleureSerie >= 3) faits.push(`🔥 Plus longue série : ${serie.pseudo}, ${serie.meilleureSerie} d'affilée`);
    // La question qui a piégé le plus de monde.
    let pire = null;
    for (let i = 0; i < g.questions.length; i++) {
        const repondants = g.players.filter(p => p.reponses[i]);
        if (!repondants.length) continue;
        const justes = repondants.filter(p => p.reponses[i].juste).length;
        const taux = justes / repondants.length;
        if (!pire || taux < pire.taux) pire = { taux, q: g.questions[i] };
    }
    if (pire && pire.taux < 0.5) faits.push(`🪤 La plus piégeuse : ${pire.q.reponse} (${Math.round(pire.taux * 100)} % de bonnes réponses)`);
    return faits;
}

// =====================================================================
//  LE DÉROULÉ — mené par le serveur, sans intervention de l'hôte
// =====================================================================
function desarmer(g) { if (g.timer) { clearTimeout(g.timer); g.timer = null; } }

function poserQuestion(g) {
    desarmer(g);
    g.phase = 'question';
    g.debutA = Date.now();
    g.finitA = g.debutA + g.options.duree * 1000;
    g.timer = setTimeout(() => fermerQuestion(g), g.options.duree * 1000);
    diffuser(g);
}

// La question se ferme dès que tout le monde a répondu OU que le temps est
// écoulé — le premier des deux. Personne n'attend le plus lent pour rien.
function tousOntRepondu(g) {
    const presents = g.players.filter(present);
    return presents.length > 0 && presents.every(p => p.reponses[g.qIndex]);
}
function fermerQuestion(g) {
    if (g.status !== 'playing' || g.phase !== 'question') return;
    desarmer(g);
    g.phase = 'reveal';
    // Les séries se mettent à jour ici, une fois la question close : un joueur
    // qui n'a pas répondu casse la sienne, comme s'il s'était trompé.
    for (const p of g.players) {
        const r = p.reponses[g.qIndex];
        if (r && r.juste) { p.serie++; if (p.serie > p.meilleureSerie) p.meilleureSerie = p.serie; }
        else p.serie = 0;
    }
    diffuser(g);
    g.timer = setTimeout(() => questionSuivante(g), REVELATION_MS);
}
function questionSuivante(g) {
    desarmer(g);
    if (g.qIndex + 1 >= g.options.nbQuestions) return terminer(g);
    g.qIndex++;
    poserQuestion(g);
}
function terminer(g) {
    desarmer(g);
    g.status = 'ended';
    g.phase = 'fin';
    finaliserStats(g);
    diffuser(g);
    broadcastLobby();
}

function finaliserStats(g) {
    const gagnants = gagnantsDe(g);
    const nul = gagnants.length > 1;
    const solo = g.players.length < 2;
    for (const p of g.players) {
        const s = chargerStats(p.pseudo);
        s.questions += p.reponses.filter(Boolean).length;
        s.bonnes += p.reponses.filter(r => r && r.juste).length;
        s.totalPoints += p.score;
        if (p.score > s.meilleurScore) s.meilleurScore = p.score;
        if (p.meilleureSerie > s.meilleureSerie) s.meilleureSerie = p.meilleureSerie;
        for (const r of p.reponses) {
            if (!r) continue;
            if (r.juste && (s.plusRapide === null || r.ms < s.plusRapide)) s.plusRapide = r.ms;
            const t = s.parType[r.type] || { posees: 0, bonnes: 0 };
            t.posees++; if (r.juste) t.bonnes++;
            s.parType[r.type] = t;
        }
        // Une partie jouée seul ne se gagne contre personne : elle nourrit le
        // record et les statistiques de réussite, jamais le palmarès.
        if (solo) s.solo++;
        else {
            s.parties++;
            if (nul) s.nuls++;
            else if (gagnants.includes(p.pseudo)) s.victoires++;
        }
        enregistrerStats(p.pseudo, s);
    }
}

function quitter(socket) {
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
        if (!g.players.length) { desarmer(g); delete games[gid]; broadcastLobby(); return; }
        if (g.host === (p && p.pseudo)) g.host = g.players[0].pseudo;
    }
    socket.leave(roomOf(g));
    // Plus personne devant l'écran : inutile de laisser tourner les minuteurs.
    if (g.status === 'playing' && !g.players.some(present) && !(g.spectators || []).length) { terminer(g); return; }
    // Le dernier à répondre vient de partir : la question peut se fermer.
    if (g.status === 'playing' && g.phase === 'question' && tousOntRepondu(g)) { fermerQuestion(g); return; }
    diffuser(g);
    broadcastLobby();
}

io.on('connection', (socket) => {

    socket.on('drapeaux_identify', (ack) => {
        const pseudo = salonPseudoFromCookie(socket.handshake.headers.cookie);
        socket.data.drapeauxPseudo = pseudo;
        if (typeof ack === 'function') ack({ ok: !!pseudo, pseudo });
    });

    socket.on('drapeaux_list', () => socket.emit('drapeaux_games', publicGames()));

    socket.on('drapeaux_create', (opts) => {
        const pseudo = socket.data.drapeauxPseudo;
        if (!pseudo) return socket.emit('drapeaux_error', 'Session expirée, reviens au salon.');
        const o = opts || {};
        const options = {
            nbQuestions: NB_QUESTIONS.includes(Number(o.nbQuestions)) ? Number(o.nbQuestions) : 15,
            duree: DUREES.includes(Number(o.duree)) ? Number(o.duree) : 12,
            niveau: ['facile', 'moyen', 'expert'].includes(o.niveau) ? o.niveau : 'moyen',
            types: Array.isArray(o.types) && o.types.length ? o.types.filter(t => Questions.TOUS_TYPES.includes(t)) : Questions.TOUS_TYPES,
        };
        if (!options.types.length) options.types = Questions.TOUS_TYPES;
        const id = 'd' + (nextId++);
        games[id] = {
            id, host: pseudo, status: 'lobby', creeA: Date.now(), phase: 'attente',
            options, questions: [], qIndex: 0, timer: null,
            players: [nouveauJoueur(socket.id, pseudo)], spectators: [],
        };
        socketGame[socket.id] = id;
        socket.join(roomOf(games[id]));
        diffuser(games[id]);
        broadcastLobby();
    });

    socket.on('drapeaux_join', ({ id }) => {
        const pseudo = socket.data.drapeauxPseudo;
        const g = games[id];
        if (!pseudo) return socket.emit('drapeaux_error', 'Session expirée, reviens au salon.');
        if (!g) return socket.emit('drapeaux_error', 'Cette partie n’existe plus.');
        let p = g.players.find(x => x.pseudo === pseudo);
        if (p) { p.sid = socket.id; p.connected = true; }
        else if (g.status !== 'lobby') {
            // Partie déjà lancée : on entre en spectateur plutôt que d'être
            // refusé — même choix qu'au Yams et à Motus Party.
            g.spectators = (g.spectators || []).filter(x => x.pseudo !== pseudo);
            g.spectators.push({ sid: socket.id, pseudo });
        } else {
            if (g.players.length >= MAX_PLAYERS) return socket.emit('drapeaux_error', 'La partie est complète.');
            g.players.push(nouveauJoueur(socket.id, pseudo));
        }
        socketGame[socket.id] = g.id;
        socket.join(roomOf(g));
        diffuser(g);
        broadcastLobby();
    });

    socket.on('drapeaux_start', () => {
        const g = games[socketGame[socket.id]];
        if (!g || g.host !== socket.data.drapeauxPseudo || g.status !== 'lobby') return;
        if (g.players.length < MIN_PLAYERS) return socket.emit('drapeaux_error', 'Il faut au moins un joueur.');
        g.questions = Questions.serie(g.options.nbQuestions, {
            niveau: g.options.niveau, types: g.options.types,
        });
        g.status = 'playing';
        g.qIndex = 0;
        g.players.forEach(p => { p.score = 0; p.reponses = []; p.serie = 0; p.meilleureSerie = 0; });
        poserQuestion(g);
        broadcastLobby();
    });

    socket.on('drapeaux_repondre', ({ index }) => {
        const g = games[socketGame[socket.id]];
        const pseudo = socket.data.drapeauxPseudo;
        if (!g || g.status !== 'playing' || g.phase !== 'question' || !pseudo) return;
        const p = g.players.find(x => x.pseudo === pseudo);
        if (!p) return;                                  // un spectateur ne joue pas
        if (p.reponses[g.qIndex]) return;                // une seule réponse, pas de rattrapage
        const q = g.questions[g.qIndex];
        const i = Number(index);
        if (!Number.isInteger(i) || i < 0 || i >= q.choix.length) return;

        const ms = Math.max(0, Date.now() - g.debutA);
        const juste = i === q.bonne;
        const doublee = g.qIndex === g.options.nbQuestions - 1;   // la dernière compte double
        const points = juste ? pointsDe(ms, g.options.duree * 1000, doublee) : 0;
        p.reponses[g.qIndex] = { index: i, ms, juste, points, type: q.type };
        p.score += points;
        // On confirme la prise en compte sans rien dire du résultat : le joueur
        // doit voir que son choix est enregistré, pas s'il a bon.
        socket.emit('drapeaux_pris', { index: i });
        if (tousOntRepondu(g)) fermerQuestion(g);
        else diffuser(g);
    });

    socket.on('drapeaux_leave', () => quitter(socket));

    socket.on('drapeaux_rematch', () => {
        const g = games[socketGame[socket.id]];
        if (!g || g.host !== socket.data.drapeauxPseudo || g.status !== 'ended') return;
        g.status = 'lobby';
        g.phase = 'attente';
        g.qIndex = 0;
        g.questions = [];
        g.players.forEach(p => { p.score = 0; p.reponses = []; p.serie = 0; p.meilleureSerie = 0; });
        diffuser(g);
        broadcastLobby();
    });

    socket.on('drapeaux_stats', () => {
        const pseudo = socket.data.drapeauxPseudo;
        if (!pseudo) return;
        socket.emit('drapeaux_stats_result', ficheDe(pseudo));
    });

    socket.on('drapeaux_classement', () => {
        socket.emit('drapeaux_classement_result', classementDuSalon());
    });

    socket.on('disconnect', () => quitter(socket));
});

// =====================================================================
//  LES STATISTIQUES SERVIES
// =====================================================================
const NOMS_TYPE = {
    'drapeau-nom': 'Reconnaître un drapeau',
    'nom-drapeau': 'Retrouver un drapeau',
    'continent': 'Situer un continent',
    'plus-grand': 'Comparer des superficies',
    'voisin': 'Trouver un voisin',
};
function ficheDe(pseudo) {
    const s = chargerStats(pseudo);
    const taux = s.questions ? Math.round((s.bonnes / s.questions) * 100) : null;
    return {
        pseudo,
        parties: s.parties, victoires: s.victoires, nuls: s.nuls, solo: s.solo || 0,
        defaites: Math.max(0, s.parties - s.victoires - s.nuls),
        tauxVictoire: s.parties ? Math.round((s.victoires / s.parties) * 100) : null,
        questions: s.questions, bonnes: s.bonnes, tauxBonnes: taux,
        meilleurScore: s.meilleurScore,
        moyenne: s.parties ? Math.round(s.totalPoints / s.parties) : 0,
        meilleureSerie: s.meilleureSerie,
        plusRapide: s.plusRapide,
        // Le détail par type : c'est ce qui dit à quelqu'un où il est bon.
        types: Object.entries(s.parType).map(([type, v]) => ({
            type, nom: NOMS_TYPE[type] || type, posees: v.posees, bonnes: v.bonnes,
            taux: v.posees ? Math.round((v.bonnes / v.posees) * 100) : 0,
        })).sort((a, b) => b.posees - a.posees),
    };
}
function classementDuSalon() {
    return (mfGet(INDEX_KEY) || []).map(pseudo => {
        const s = chargerStats(pseudo);
        return {
            pseudo, parties: s.parties, victoires: s.victoires,
            meilleurScore: s.meilleurScore,
            tauxBonnes: s.questions ? Math.round((s.bonnes / s.questions) * 100) : 0,
            meilleureSerie: s.meilleureSerie,
            plusRapide: s.plusRapide,
            solo: s.solo || 0,
        };
    }).filter(r => r.parties > 0 || r.solo > 0 || r.meilleurScore > 0)
      .sort((a, b) => b.victoires - a.victoires || b.tauxBonnes - a.tauxBonnes || b.meilleurScore - a.meilleurScore);
}

return {
    online: () => [...new Set(Object.values(games).flatMap(g => g.players.filter(present).map(p => p.pseudo)))],
    games: () => Object.values(games).map(g => ({
        id: g.id, host: g.host, status: g.status, creeA: g.creeA || 0,
        players: g.players.map(p => p.pseudo),
        presents: g.players.filter(p => present(p)).map(p => p.pseudo),
    })),
    limites: { min: MIN_PLAYERS, max: MAX_PLAYERS },
    statsFor: (pseudo) => ficheDe(pseudo),
    endGame: (id) => {
        const g = games[id];
        if (!g) return false;
        desarmer(g);
        try { io.to(roomOf(g)).emit('drapeaux_closed'); } catch (e) {}
        delete games[id];
        broadcastLobby();
        return true;
    },
};
};
