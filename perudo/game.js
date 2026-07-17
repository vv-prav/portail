// =====================================================================
//  MODULE PERUDO — branché sur le serveur du salon (app + io partagés).
//  La logique de jeu est identique ; seule l'enveloppe change.
// =====================================================================
const crypto = require('crypto');
const fs = require('fs');

module.exports = function attachPerudo(app, io) {

// keep-alive (évite le cold start Render)
app.get('/perudo/healthz', (req, res) => res.status(200).json({ ok: true, t: Date.now(), games: Object.keys(activeGames).length }));

// =====================================================================
//  CONSTANTES
// =====================================================================
const USERS_FILE = './perudo_users.json';
const DEFAULT_STYLE = { bgColor: '#ffffff', dotColor: '#000000', shape: 'square', faceType: 'classic' };

// Skins payants : skinId -> nombre de victoires requises.
// À garder synchronisé avec winsRequired dans le catalogue SKINS de app.js.
// Pour rendre un nouveau skin payant : ajoute une ligne ici (ex: dragon: 5).
const SKIN_LOCKS = { forge: 5, gold: 10 };
const MAX_PLAYERS = 10;
const START_DICE = 5;
const TURN_TIMEOUT_MS = 90 * 1000; // 90s avant action automatique (anti-blocage)
const PSEUDO_REGEX = /^[\p{L}\p{N} _'-]{3,16}$/u; // lettres/chiffres/espaces, 3-16 car.

// --- Gamification ---
const RECONNECT_GRACE_MS = 180 * 1000;     // 3 min pour se reconnecter (verrouillage téléphone, perte réseau)
const TOURNEY_CLAIM_MS = 30 * 1000;        // délai avant de pouvoir réclamer la victoire (adversaire absent)

// Grades, du plus bas au plus haut (seuil = POINTS DE CLASSEMENT)
const RANKS = [
    { min: 0,    name: 'Moussaillon' },
    { min: 50,   name: 'Matelot' },
    { min: 250,  name: 'Corsaire' },
    { min: 750,  name: 'Capitaine' },
    { min: 2000, name: 'Légende des Caraïbes' }
];

// Barème de points de classement selon le nombre de joueurs humains (N)
// 1ère place = (N-1) x 10 ; 2e place = (N-1) x 3 (uniquement à partir de 3 joueurs)
function winPoints(n) { return Math.max(0, (n - 1)) * 10; }
function secondPoints(n) { return n >= 3 ? Math.max(0, (n - 1)) * 3 : 0; }

// Émotes autorisées en partie (clé -> emoji)
// ===== Modération / Admin =====
// 👉 Ajoute ici ton pseudo (sensible à la casse) pour devenir administrateur :
const ADMINS = []; // ex : ['Viper la Voile Noire']
let bannedPseudos = {};
try { bannedPseudos = JSON.parse(fs.readFileSync(__dirname + '/banned.json', 'utf8')) || {}; } catch (e) { bannedPseudos = {}; }
function saveBanned() { try { fs.writeFileSync(__dirname + '/banned.json', JSON.stringify(bannedPseudos)); } catch (e) {} }
function isAdmin(pseudo) { return ADMINS.indexOf(pseudo) !== -1; }
function isBanned(pseudo) { return !!bannedPseudos[pseudo]; }

const EMOTES = {
    salut: '👋', rire: '😂', choc: '😱', malin: '😏', colere: '😡',
    perroquet: '🦜', crane: '☠️', rhum: '🍺', coeur: '❤️', pouce_haut: '👍',
    pouce_bas: '👎', feu: '🔥', couronne: '👑', ancre: '⚓', epee: '⚔️',
    piece: '🪙', bombe: '💣', etoile: '⭐', eclair: '⚡', applaudir: '👏',
    pleure: '😭', clin: '😉', cool: '😎', reflechir: '🤔', dodo: '😴',
    boussole: '🧭', tresor: '💰', voilier: '⛵', poisson: '🐟', mouette: '🕊️'
};
Object.assign(EMOTES, {
    mort_rire: '🤣', sourire: '😄', ange: '😇', diable: '😈', clown: '🤡',
    fou: '🤪', amoureux: '🥰', bisou: '😘', langue: '😜', cupide: '🤑',
    nausee: '🤢', explose: '🤯', chaud: '🥵', froid: '🥶', malade: '🤒',
    chut: '🤫', muscle: '💪', priere: '🙏', ok_main: '👌', poing: '👊',
    salut_mil: '🫡', doigts_croises: '🤞', main_coeur: '🫶', cerveau: '🧠', fantome: '👻',
    alien: '👽', robot_e: '🤖', citrouille: '🎃', licorne: '🦄', requin_e: '🦈',
    poulpe: '🐙', crabe_e: '🦀', serpent: '🐍', chauvesouris: '🦇', dragon_e: '🐉',
    gemme: '💎', cle: '🗝️', carte_tresor: '🗺️', longuevue: '🔭', cadenas: '🔒',
    fusee: '🚀', cible: '🎯', des_e: '🎲', joker: '🃏', trophee_e: '🏆',
    medaille: '🥇', fete: '🎉', cadeau: '🎁', musique: '🎵', cloche_e: '🔔',
    sablier: '⏳', soleil_e: '☀️', vague_e: '🌊', arcenciel: '🌈', cafe: '☕'
});


// --- BOT (adversaire IA en 1v1) ---
const BOT_STYLE = { bgColor: '#2f3640', dotColor: '#ffd700', shape: 'square', faceType: 'classic', glyph: 'bot' };

// Paramètres de jeu du bot selon sa difficulté
const BOT_DIFF = {
    easy:   { margin: [1.4, 2.7], dudoChance: 0.55, bluff: -1.3, raiseRand: 1.2 },
    normal: { margin: [0.6, 1.7], dudoChance: 0.86, bluff: -0.4, raiseRand: 0.6 },
    hard:   { margin: [0.3, 0.9], dudoChance: 0.93, bluff: -0.15, raiseRand: 0.3 },
    master: { margin: [0.15, 0.55], dudoChance: 0.97, bluff: 0.05, raiseRand: 0.15 }
};

// ----- CAMPAGNE : SOURCE UNIQUE (le client reçoit ces données via 'campaign_data') -----
const CAMPAIGN_CHAPTERS = {
    "Les Bas-fonds d'Erquy": { accent: '#d4af37', lore: "Tout commence dans la taverne enfumée d'Erquy. Avant de défier les mers, plume les gueux du port et fais-toi un nom au jeu de dés." },
    "La Mer des Brumes":      { accent: '#5bb8d4', lore: "Le large t'appelle. Dans les brumes glacées rôdent des équipages fantômes et des capitaines retors. Les mises grimpent, les bluffs aussi." },
    "L'Abîme de Cthulhu":     { accent: '#a06bf0', lore: "Sous les flots dort une entité ancienne. Ses cultistes gardent l'abîme. Affronte le Grand Cthulhu et grave ton nom dans la légende." }
};
// Modificateurs de niveau (variété sans nouvelle logique de règles lourde)
const CAMPAIGN_MODS = {
    tempete:    { name: 'Tempête',    desc: '4 dés au départ : tout va plus vite.' },
    brouillard: { name: 'Brouillard', desc: "Un de tes dés est caché : joue à l'aveugle." },
    malediction:{ name: 'Malédiction', desc: 'Palifico permanent : les Pacos ne sont plus des jokers.' }
};
const CAMPAIGN = [
    { id: 1,  chapter: "Les Bas-fonds d'Erquy", name: 'Le Mousse Ivrogne', lore: "Un gamin éméché qui mise au hasard. Idéal pour s'échauffer.", bots: [{ name: 'Mousse Tom', diff: 'easy' }] },
    { id: 2,  chapter: "Les Bas-fonds d'Erquy", name: 'La Fille de Salle', lore: "Elle sert le rhum et lit dans ton jeu. Méfie-toi de son sourire.", bots: [{ name: 'Jeanne la Rousse', diff: 'easy' }] },
    { id: 3,  chapter: "Les Bas-fonds d'Erquy", name: 'Le Pickpocket', lore: "Filou bluffe comme il vole : sans vergogne.", bots: [{ name: 'Filou', diff: 'normal' }], chest: { skin: 'forge', label: 'Coffre : dé Forge' } },
    { id: 4,  chapter: "Les Bas-fonds d'Erquy", name: 'Le Maître-Coq', lore: "Deux marmitons retors gardent la cambuse. Le brouillard masque tes dés.", mini: true, mods: ['brouillard'], bots: [{ name: 'Le Coq', diff: 'normal' }, { name: 'Marmiton', diff: 'normal' }] },
    { id: 5,  chapter: "Les Bas-fonds d'Erquy", name: 'Le Contrebandier', lore: "Le Borgne tient le port d'une main de fer. Bats-le pour gagner ton premier titre.", boss: true, bots: [{ name: 'Le Borgne', diff: 'normal' }], reward: { title: 'camp_ch1', skin: 'corsaire', label: 'Titre « Écumeur des Bas-fonds » + dé Corsaire' } },
    { id: 6,  chapter: "La Mer des Brumes", name: 'Les Jumeaux Vérole', lore: "Tic et Tac jouent en duo. Deux esprits, une seule fourberie.", bots: [{ name: 'Tic', diff: 'normal' }, { name: 'Tac', diff: 'normal' }], chest: { skin: 'gold', label: 'Coffre : dé Or' } },
    { id: 7,  chapter: "La Mer des Brumes", name: 'Le Cartographe Fou', lore: "Mercator calcule chaque dé. Et la tempère ne te laisse que 4 dés.", mods: ['tempete'], bots: [{ name: 'Mercator', diff: 'hard' }, { name: 'Boussole', diff: 'normal' }] },
    { id: 8,  chapter: "La Mer des Brumes", name: 'La Sirène des Brumes', lore: "Son chant maudit verrouille les dés : Palifico permanent.", mini: true, mods: ['malediction'], bots: [{ name: 'La Sirène', diff: 'hard' }, { name: 'Écho', diff: 'hard' }] },
    { id: 9,  chapter: "La Mer des Brumes", name: "L'Équipage Fantôme", lore: "On dit qu'ils misent depuis cent ans. Ils ne dorment jamais.", bots: [{ name: 'Spectre', diff: 'hard' }, { name: 'Brume', diff: 'normal' }], chest: { skin: 'brume', label: 'Coffre : dé Brume' } },
    { id: 10, chapter: "La Mer des Brumes", name: 'Le Capitaine Maudit', lore: "Crochu et son second n'ont jamais perdu. Brise la malédiction.", boss: true, bots: [{ name: 'Capitaine Crochu', diff: 'hard' }, { name: 'Second Vil', diff: 'hard' }], reward: { title: 'camp_ch2', skin: 'abysse', label: 'Titre « Dompteur des Brumes » + dé Abysse' } },
    { id: 11, chapter: "L'Abîme de Cthulhu", name: 'Les Cultistes', lore: "Trois adeptes psalmodient autour de la table. Le jeu devient rituel.", bots: [{ name: 'Adepte', diff: 'hard' }, { name: 'Fanatique', diff: 'normal' }, { name: 'Novice', diff: 'normal' }] },
    { id: 12, chapter: "L'Abîme de Cthulhu", name: 'Le Prêtre Noir', lore: "Dagon et Hydra servent l'abîme. Le brouillard épaissit.", mods: ['brouillard'], bots: [{ name: 'Dagon', diff: 'hard' }, { name: 'Hydra', diff: 'hard' }, { name: 'Acolyte', diff: 'normal' }], chest: { skin: 'sang', label: 'Coffre : dé Sang' } },
    { id: 13, chapter: "L'Abîme de Cthulhu", name: 'Le Léviathan', lore: "La créature joue avec toi comme la marée avec l'épave. Tempête.", mini: true, mods: ['tempete'], bots: [{ name: 'Léviathan', diff: 'master' }, { name: 'Tentacule', diff: 'hard' }, { name: 'Abysse', diff: 'hard' }] },
    { id: 14, chapter: "L'Abîme de Cthulhu", name: "La Porte de l'Abîme", lore: "Le voile se déchire. Palifico permanent jusqu'au bout.", mods: ['malediction'], bots: [{ name: 'Gardien', diff: 'master' }, { name: 'Ombre', diff: 'hard' }, { name: 'Murmure', diff: 'hard' }] },
    { id: 15, chapter: "L'Abîme de Cthulhu", name: 'CTHULHU', lore: "Le Grand Ancien en personne. Trois esprits légendaires. La consécration.", boss: true, bots: [{ name: 'Cthulhu', diff: 'master' }, { name: 'Nyarlathotep', diff: 'master' }, { name: 'Shoggoth', diff: 'hard' }], reward: { title: 'camp_final', skin: 'kraken', label: "Titre « Vainqueur de l'Abîme » + dé Kraken" } }
];
function campaignLevelDef(n) { return CAMPAIGN.find(l => l.id === n) || null; }
function totalCampaignStars(user) {
    const m = (user && user.campaignStars) || {};
    return Object.values(m).reduce((a, b) => a + (b || 0), 0);
}
const CAMPAIGN_MAX_STARS = CAMPAIGN.length * 3;
// Données envoyées au client (affichage uniquement)
function campaignData() {
    return {
        chapters: CAMPAIGN_CHAPTERS,
        mods: CAMPAIGN_MODS,
        levels: CAMPAIGN.map(l => ({
            id: l.id, chapter: l.chapter, name: l.name, lore: l.lore || '',
            bots: l.bots.map(b => ({ name: b.name, diff: b.diff })),
            boss: !!l.boss, mini: !!l.mini, mods: l.mods || [],
            reward: l.reward ? { label: l.reward.label || '', skin: l.reward.skin || null } : null,
            chest: l.chest ? { label: l.chest.label || '', skin: l.chest.skin || null } : null,
            starGoal: l.bots.length === 1 ? 3 : 2
        }))
    };
}
function sendCampaignData(socket) { socket.emit('campaign_data', campaignData()); }

// =====================================================================
//  EXPÉDITION (roguelite) : voyage à embranchements + reliques + brouillard
// =====================================================================
const RELICS = {
    des_pipe: { name: 'Dé Pipé',            desc: 'Tu démarres chaque combat avec un dé de plus.',        icon: 'gift' },
    oeil:     { name: 'Longue-vue',         desc: "Chaque manche, tu vois un dé d'un adversaire au hasard.", icon: 'compass' },
    coeur:    { name: 'Cœur de Davy Jones', desc: 'Une fois par combat, ta première perte de dé est annulée.', icon: 'anchor' },
    ancre:    { name: 'Ancre Lestée',       desc: 'Tu ouvres toujours les enchères.',                     icon: 'anchor' },
    boussole: { name: 'Boussole Truquée',   desc: 'Tu vois la probabilité réelle de la mise en cours.',   icon: 'compass' },
    rhum:     { name: 'Gnôle du Capitaine',  desc: "Soigne aussitôt 1 point de vie d'expédition.",         icon: 'star' }
};
const RELIC_IDS = Object.keys(RELICS);
const COMBAT_RELICS = ['des_pipe', 'oeil', 'coeur', 'ancre', 'boussole'];   // rhum = soin immédiat

const runs = {};   // runs[pseudo] = état de l'expédition en cours

const NODE_KINDS = ['combat', 'elite', 'tresor', 'repos'];
function weightedKind() {
    const r = Math.random();
    if (r < 0.50) return 'combat';
    if (r < 0.66) return 'elite';
    if (r < 0.85) return 'tresor';
    return 'repos';
}
function pickLanes(n, k) {
    const all = []; for (let i = 0; i < n; i++) all.push(i);
    for (let i = all.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[all[i], all[j]] = [all[j], all[i]]; }
    return all.slice(0, k).sort((a, b) => a - b);
}
function genRunMap() {
    const LANES = 4, DEPTH = 8;
    const rows = [];
    for (let r = 0; r < DEPTH; r++) {
        const row = [];
        if (r === 0) row.push({ id: r + '-1', row: r, col: 1, kind: 'port', done: true });
        else if (r === DEPTH - 1) row.push({ id: r + '-1', row: r, col: 1, kind: 'boss', done: false });
        else {
            const k = 2 + ((Math.random() < 0.5) ? 0 : 1);
            pickLanes(LANES, k).forEach(c => row.push({ id: r + '-' + c, row: r, col: c, kind: weightedKind(), done: false }));
        }
        rows.push(row);
    }
    const nearest = (row, col) => row.reduce((a, b) => (Math.abs(b.col - col) < Math.abs(a.col - col) ? b : a));
    for (let r = 0; r < DEPTH - 1; r++) {
        rows[r].forEach(n => {
            let nexts = rows[r + 1].filter(m => Math.abs(m.col - n.col) <= 1);
            if (!nexts.length) nexts = [nearest(rows[r + 1], n.col)];
            n.to = nexts.map(m => m.id);
        });
        rows[r + 1].forEach(m => {
            if (!rows[r].some(n => n.to.includes(m.id))) nearest(rows[r], m.col).to.push(m.id);
        });
    }
    rows[DEPTH - 1][0].to = [];
    // garantir au moins un trésor
    const flat = rows.flat();
    if (!flat.some(n => n.kind === 'tresor')) {
        const c = flat.find(n => n.kind === 'combat'); if (c) c.kind = 'tresor';
    }
    return rows;
}
function findNode(run, id) { for (const row of run.map) { const n = row.find(x => x.id === id); if (n) return n; } return null; }
function runReachable(run) {
    const cur = findNode(run, run.posId);
    return cur ? (cur.to || []) : [];
}
// Données envoyées au client (le brouillard est géré à l'affichage)
function runPayload(run) {
    if (!run) return null;
    const reach = runReachable(run);
    if (!Array.isArray(run.seen)) run.seen = [];
    // un nœud révélé le reste : on cumule les nœuds faits, courant et atteignables
    run.map.forEach(row => row.forEach(n => {
        if ((n.done || reach.includes(n.id) || n.id === run.posId) && !run.seen.includes(n.id)) run.seen.push(n.id);
    }));
    return {
        map: run.map.map(row => row.map(n => ({
            id: n.id, row: n.row, col: n.col, kind: n.kind, done: n.done, to: n.to || [],
            reachable: reach.includes(n.id), revealed: run.seen.includes(n.id)
        }))),
        posId: run.posId, relics: run.relics, hp: run.hp, maxHp: run.maxHp,
        pending: run.pending || null, depth: run.map.length
    };
}
function sendRun(pseudo) {
    const run = runs[pseudo];
    emitToPseudo(pseudo, 'run_update', runPayload(run));
}
// Adversaires d'un nœud selon sa profondeur et son type
function nodeBots(node, depth) {
    const t = node.row / (depth - 1);   // 0 → 1 progression
    if (node.kind === 'boss') return [{ name: 'Cthulhu', diff: 'master' }, { name: 'Nyarlathotep', diff: 'master' }, { name: 'Shoggoth', diff: 'hard' }];
    if (node.kind === 'elite') {
        if (t < 0.5) return [{ name: 'Brute', diff: 'hard' }, { name: 'Sbire', diff: 'normal' }];
        return [{ name: 'Capitaine', diff: 'master' }, { name: 'Second', diff: 'hard' }];
    }
    // combat normal
    if (t < 0.33) return [{ name: 'Gueux', diff: 'easy' }];
    if (t < 0.66) return [{ name: 'Flibustier', diff: 'normal' }, { name: 'Mousse', diff: 'easy' }];
    return [{ name: 'Corsaire', diff: 'hard' }, { name: 'Matelot', diff: 'normal' }];
}
const BOT_NAMES = ['Crochet le Maudit', 'Barbe-Noire IA', 'Cthulhu', 'Davy Bot', 'Le Kraken'];

// =====================================================================
//  TOURNOIS : poules (round-robin 1v1) puis tableau à élimination -> finale
// =====================================================================
const tournaments = {};
let TID = 0, MID = 0;
function socketIdOf(pseudo) { for (const sid in players) if (players[sid].pseudo === pseudo) return sid; return null; }
function mkMatch(a, b, stage, group) { return { id: 'M' + (++MID), a: a || null, b: b || null, winner: null, gameId: null, done: false, stage, group: (group === undefined ? null : group) }; }

function makeGroups(playerList, groupSize) {
    const n = playerList.length;
    if (n < 6) return null;
    const gs = (groupSize === 3 || groupSize === 4) ? groupSize : 4;
    const g = Math.max(2, Math.round(n / gs));
    const groups = Array.from({ length: g }, (_, i) => ({ name: 'Poule ' + String.fromCharCode(65 + i), players: [] }));
    playerList.forEach((p, i) => groups[i % g].players.push(p));
    return groups;
}
function packRounds(matches) {
    const rounds = []; const rem = matches.slice();
    while (rem.length) {
        const used = new Set(); const round = [];
        for (let i = rem.length - 1; i >= 0; i--) {
            const m = rem[i];
            if (!used.has(m.a) && !used.has(m.b)) { round.push(m); used.add(m.a); used.add(m.b); rem.splice(i, 1); }
        }
        rounds.push(round);
    }
    return rounds;
}
function buildBracketRound(seeds) {
    let size = 1; while (size < seeds.length) size *= 2;
    const slots = seeds.slice(); while (slots.length < size) slots.push(null);
    const matches = [];
    for (let i = 0; i < size / 2; i++) matches.push(mkMatch(slots[i], slots[size - 1 - i], 'ko'));
    return matches;
}
function nextBracketRound(winners) {
    const matches = [];
    for (let i = 0; i < winners.length; i += 2) matches.push(mkMatch(winners[i], winners[i + 1] || null, 'ko'));
    return matches;
}
// ---- Double élimination (tableaux vainqueurs + perdants -> grande finale) ----
const dePairSeq = arr => { const p = []; for (let i = 0; i < arr.length; i += 2) p.push([arr[i], arr[i + 1] || null]); return p; };
const dePairCross = (x, y) => { const n = Math.max(x.length, y.length); const p = []; for (let i = 0; i < n; i++) p.push([x[i] || null, y[i] || null]); return p; };
function deNewPhase(t, phase, pairs, label) {
    const real = pairs.filter(([a, b]) => a || b);
    const ms = real.map(([a, b]) => mkMatch(a, b, 'ko'));
    ms.forEach(m => t.matches[m.id] = m);
    t.bracket.push(ms.map(m => m.id));
    t.roundLabels.push(label);
    t.de.phase = phase;
    t.koRoundIdx = t.bracket.length - 1;
    resolveByes(t, t.bracket[t.koRoundIdx]);
    startTournamentRoundMatches(t);
}
function deStart(t, seeds) {
    let B = 1; while (B < seeds.length) B *= 2;
    const pad = seeds.slice(); while (pad.length < B) pad.push(null);
    t.de = { k: Math.round(Math.log2(B)), wb: [], lb: [], drops: [], wbRound: 1, phase: 'wb', wbChamp: null, lbChamp: null };
    t.bracket = []; t.roundLabels = []; t.koRoundIdx = -1;
    const pairs = []; for (let i = 0; i < B / 2; i++) pairs.push([pad[i], pad[B - 1 - i]]);
    deNewPhase(t, 'wb', pairs, 'Vainqueurs · Tour 1');
}
function deResults(t) {
    const ms = t.bracket[t.koRoundIdx].map(id => t.matches[id]);
    return {
        winners: ms.map(m => m.winner).filter(Boolean),
        losers: ms.map(m => (m.winner === m.a ? m.b : m.a)).filter(Boolean)
    };
}
function deCrown(t, champ, runnerUp) {
    t.champion = champ || null;
    t.second = runnerUp || null;
    t.status = 'done';
    if (t.champion && registeredUsers[t.champion]) {
        const cu = registeredUsers[t.champion]; ensureUserFields(cu); cu.tourneyWins += 1; saveUsers(true); syncRewards(t.champion);
        emitToPseudo(t.champion, 'campaign_reward', { kind: 'title', name: 'Champion', icon: '🏆' });
        emitToPseudo(t.champion, 'campaign_reward', { kind: 'skin', name: 'couronne' });
    }
    broadcastTournament(t);
    if (t.champion) io.emit('tournament_champion', { name: t.name, champion: t.champion });
}
function deAfterLB(t) {
    if (t.de.wbRound < t.de.k) {
        t.de.wbRound++;
        deNewPhase(t, 'wb', dePairSeq(t.de.wb), 'Vainqueurs · Tour ' + t.de.wbRound);
    } else {
        t.de.wbChamp = t.de.wb[0]; t.de.lbChamp = t.de.lb[0];
        if (!t.de.lbChamp) deCrown(t, t.de.wbChamp, null);
        else deNewPhase(t, 'gf', [[t.de.wbChamp, t.de.lbChamp]], 'Grande Finale');
    }
}
function deAdvance(t) {
    const { winners, losers } = deResults(t);
    switch (t.de.phase) {
        case 'wb':
            t.de.wb = winners; t.de.drops = losers;
            if (t.de.wbRound === 1) deNewPhase(t, 'lb1', dePairSeq(t.de.drops), 'Perdants · Tour 1');
            else deNewPhase(t, 'lbMajor', dePairCross(t.de.lb, t.de.drops), 'Perdants · Repêchage ' + t.de.wbRound);
            break;
        case 'lb1':
            t.de.lb = winners; deAfterLB(t);
            break;
        case 'lbMajor':
            t.de.lb = winners;
            if (t.de.lb.length > 1) deNewPhase(t, 'lbMinor', dePairSeq(t.de.lb), 'Perdants · Tour ' + t.de.wbRound);
            else deAfterLB(t);
            break;
        case 'lbMinor':
            t.de.lb = winners; deAfterLB(t);
            break;
        case 'gf': {
            const w = winners[0];
            if (w === t.de.wbChamp) deCrown(t, w, t.de.lbChamp);
            else deNewPhase(t, 'gf2', [[t.de.wbChamp, t.de.lbChamp]], 'Grande Finale · Manche 2');
            break;
        }
        case 'gf2':
            deCrown(t, winners[0], winners[0] === t.de.wbChamp ? t.de.lbChamp : t.de.wbChamp);
            break;
    }
}
function groupStandings(t, group) {
    const w = {}; group.players.forEach(p => w[p] = 0);
    Object.values(t.matches).forEach(m => { if (m.stage === 'group' && m.winner && group.players.includes(m.winner)) w[m.winner]++; });
    return group.players.slice().sort((x, y) => (w[y] - w[x]) || (group.players.indexOf(x) - group.players.indexOf(y))).map(p => ({ pseudo: p, wins: w[p] }));
}
function tournamentCurrentRound(t) {
    if (t.stage === 'group') return (t.groupRounds[t.groupRoundIdx] || []);
    return (t.bracket[t.koRoundIdx] || []);
}
function resolveByes(t, ids) {
    ids.forEach(id => {
        const m = t.matches[id];
        if (m.a && !m.b) { m.winner = m.a; m.done = true; }
        else if (!m.a && m.b) { m.winner = m.b; m.done = true; }
        else if (!m.a && !m.b) { m.done = true; }
    });
}
function tournamentLaunchGame(t, match, sidA, sidB) {
    const gameId = 'Tour-' + Math.floor(Math.random() * 1000000);
    activeGames[gameId] = {
        id: gameId, host: sidA,
        options: { startDice: START_DICE, palifico: true, calza: true, maxPlayers: 2, autoTimer: false, mode: 'solo' },
        players: [
            { id: sidA, pseudo: match.a, style: players[sidA].style, dice: START_DICE, hasBeenPalifico: false, connected: true },
            { id: sidB, pseudo: match.b, style: players[sidB].style, dice: START_DICE, hasBeenPalifico: false, connected: true }
        ],
        started: true, turnIndex: 0, hands: {},
        currentBid: { qty: 0, face: 0, pseudo: "", style: DEFAULT_STYLE },
        isPalifico: false, palificoFace: null, resolving: false, turnTimer: null, botTimer: null,
        mode: 'solo', tournament: { id: t.id, matchId: match.id },
        eliminationOrder: [], humanCount: 2
    };
    match.gameId = gameId;
    [sidA, sidB].forEach(sid => { const s = io.sockets.sockets.get(sid); if (s) s.join(gameId); });
    io.to(sidA).emit('tournament_match_start', { gameId, opponent: match.b });
    io.to(sidB).emit('tournament_match_start', { gameId, opponent: match.a });
    io.to(gameId).emit('game_log', `🏆 Match de tournoi : <b>${escapeHtml(match.a)}</b> vs <b>${escapeHtml(match.b)}</b> !`);
    startRound(gameId);
    broadcastTournament(t);
}
// Un joueur appuie sur "Rejoindre" : on lance dès que les DEUX sont présents
function tournamentPlayerJoinMatch(t, match, socket) {
    const pseudo = players[socket.id].pseudo;
    if (match.gameId) {                        // partie déjà lancée -> on (re)entre / reconnecte
        const g = activeGames[match.gameId];
        if (g) {
            const pl = g.players.find(p => p.pseudo === pseudo);
            if (pl) {
                const oldId = pl.id;
                if (oldId !== socket.id && g.hands[oldId]) { g.hands[socket.id] = g.hands[oldId]; delete g.hands[oldId]; }
                if (pl.dcTimer) { clearTimeout(pl.dcTimer); pl.dcTimer = null; }
                pl.id = socket.id; pl.connected = true;
                socket.join(match.gameId);
                socket.emit('resume_game', {
                    gameId: match.gameId, isHost: false, options: g.options,
                    playersData: g.players.map(p => ({ id: p.id, pseudo: p.pseudo, dice: p.dice, style: p.style, ...cosmeticsOf(p) })),
                    turnId: g.players[g.turnIndex] ? g.players[g.turnIndex].id : null,
                    isPalifico: g.isPalifico, palificoFace: g.palificoFace || null,
                    currentBid: g.currentBid, myHand: g.hands[socket.id] || [], resolving: g.resolving, mode: 'solo'
                });
            }
        }
        return;
    }
    match.joined = match.joined || {};
    match.joined[pseudo] = socket.id;
    const sidA = match.joined[match.a], sidB = match.joined[match.b];
    const onlineA = sidA && players[sidA], onlineB = sidB && players[sidB];
    if (onlineA && onlineB) tournamentLaunchGame(t, match, sidA, sidB);
    else {
        match.waitingSince = Date.now();
        match.waitingPlayer = pseudo;
        socket.emit('tournament_match_wait', { matchId: match.id, opponent: (pseudo === match.a ? match.b : match.a), claimInSec: Math.ceil(TOURNEY_CLAIM_MS / 1000) });
        broadcastTournament(t);
    }
}
function startTournamentRoundMatches(t) {
    tournamentCurrentRound(t).forEach(id => { const m = t.matches[id]; if (!m.done) { m.joined = {}; m.gameId = null; } });
    // Prévenir les joueurs concernés que leur match est prêt (même hors écran tournoi)
    tournamentCurrentRound(t).forEach(id => {
        const m = t.matches[id];
        if (m.done) return;
        [m.a, m.b].forEach(p => { if (p) emitToPseudo(p, 'tournament_your_match', { tournamentId: t.id }); });
    });
    broadcastTournament(t);
    tournamentCheckRound(t);   // au cas où tous les matchs sont des byes
}
function tournamentCheckRound(t) {
    if (t.status !== 'running') return;
    const round = tournamentCurrentRound(t);
    if (round.some(id => !t.matches[id].done)) { broadcastTournament(t); return; }
    advanceTournament(t);
}
function advanceTournament(t) {
    if (t.stage === 'group') {
        if (t.groupRoundIdx < t.groupRounds.length - 1) {
            t.groupRoundIdx++;
            startTournamentRoundMatches(t);
        } else {
            // poules terminées -> qualifiés (vainqueurs puis 2es, pour éviter les retrouvailles)
            const perGroup = (t.config && t.config.qualifiers) ? t.config.qualifiers : 2;
            const tiers = [];
            for (let r = 0; r < perGroup; r++) {
                t.groups.forEach(g => { const s = groupStandings(t, g); if (s[r]) tiers.push(s[r].pseudo); });
            }
            t.qualifiers = tiers;
            t.stage = 'ko';
            if (t.config && t.config.elim === 'double') { deStart(t, t.qualifiers); return; }
            const ms = buildBracketRound(t.qualifiers);
            ms.forEach(m => t.matches[m.id] = m);
            t.bracket = [ms.map(m => m.id)];
            t.koRoundIdx = 0;
            resolveByes(t, t.bracket[0]);
            startTournamentRoundMatches(t);
        }
    } else {
        if (t.de) { deAdvance(t); return; }
        const round = t.bracket[t.koRoundIdx];
        const koMatches = round.filter(id => t.matches[id].stage === 'ko');
        const winners = koMatches.map(id => t.matches[id].winner).filter(Boolean);
        if (winners.length <= 1) {
            t.champion = winners[0] || null;
            if (t.thirdMatchId && t.matches[t.thirdMatchId]) t.third = t.matches[t.thirdMatchId].winner;
            t.status = 'done';
            if (t.champion && registeredUsers[t.champion]) {
                const cu = registeredUsers[t.champion];
                ensureUserFields(cu);
                cu.tourneyWins += 1;
                saveUsers(true);
                syncRewards(t.champion);
                emitToPseudo(t.champion, 'campaign_reward', { kind: 'title', name: 'Champion', icon: '🏆' });
                emitToPseudo(t.champion, 'campaign_reward', { kind: 'skin', name: 'couronne' });
            }
            broadcastTournament(t);
            if (t.champion) io.emit('tournament_champion', { name: t.name, champion: t.champion });
            return;
        }
        const ms = nextBracketRound(winners);
        ms.forEach(m => t.matches[m.id] = m);
        const nextIds = ms.map(m => m.id);
        // Petite finale (3e place) : à la transition demi-finales -> finale
        if (t.config && t.config.thirdPlace && ms.length === 1 && koMatches.length === 2 && !t.thirdMatchId) {
            const losers = koMatches.map(id => { const m = t.matches[id]; return m.winner === m.a ? m.b : m.a; }).filter(Boolean);
            if (losers.length === 2) {
                const tm = mkMatch(losers[0], losers[1], 'third');
                t.matches[tm.id] = tm; t.thirdMatchId = tm.id; nextIds.push(tm.id);
            }
        }
        t.bracket.push(nextIds);
        t.koRoundIdx++;
        resolveByes(t, nextIds);
        startTournamentRoundMatches(t);
    }
}
function tournamentSummary(t) {
    return { id: t.id, name: t.name, host: t.hostPseudo, status: t.status, count: t.players.length };
}
function tournamentListPayload() { return Object.values(tournaments).map(tournamentSummary); }
function tournamentState(t) {
    const curRound = new Set(t.status === 'running' ? tournamentCurrentRound(t) : []);
    const matchView = m => ({
        id: m.id, a: m.a, b: m.b, winner: m.winner, done: m.done, live: !!m.gameId, stage: m.stage,
        current: curRound.has(m.id) && !m.done, gameId: m.gameId || null,
        joined: m.joined ? Object.keys(m.joined) : []
    });
    return {
        id: t.id, name: t.name, host: t.hostPseudo, status: t.status, stage: t.stage, config: t.config || null,
        players: t.players,
        groups: t.groups ? t.groups.map((g, gi) => ({ name: g.name, standings: groupStandings(t, g), matches: (t.groupMatchIds[gi] || []).map(id => matchView(t.matches[id])) })) : null,
        groupRoundIdx: t.groupRoundIdx, groupRoundsTotal: t.groupRounds ? t.groupRounds.length : 0,
        bracket: t.bracket ? t.bracket.map(round => round.map(id => matchView(t.matches[id]))) : null,
        roundLabels: t.roundLabels || [],
        champion: t.champion, third: t.third || null, second: t.second || null
    };
}
function broadcastTournament(t) {
    t.players.forEach(p => emitToPseudo(p, 'tournament_update', tournamentState(t)));
    io.emit('tournaments_list', tournamentListPayload());
}
function pickSome(arr, k) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[a[i], a[j]] = [a[j], a[i]]; }
    return a.slice(0, Math.min(k, a.length));
}
// Démarre un combat Perudo lié à une expédition (réutilise le moteur existant)
function startRunCombat(socket, run, node) {
    const pseudo = players[socket.id].pseudo;
    const bots = nodeBots(node, run.map.length);
    const startDice = START_DICE;
    const humanDice = startDice + (run.relics.includes('des_pipe') ? 1 : 0);   // relique Dé Pipé
    const gameId = 'Exp-' + Math.floor(Math.random() * 1000000);
    const botPlayers = bots.map((b, i) => ({
        id: 'BOT-' + Math.floor(Math.random() * 1000000) + '-' + i,
        pseudo: b.name, style: BOT_STYLE, dice: startDice,
        hasBeenPalifico: false, connected: true, isBot: true, diff: b.diff
    }));
    activeGames[gameId] = {
        id: gameId, host: socket.id,
        options: { startDice, palifico: true, calza: true, maxPlayers: bots.length + 1, autoTimer: false, mode: 'solo' },
        players: [
            { id: socket.id, pseudo, style: players[socket.id].style, dice: humanDice, hasBeenPalifico: false, connected: true },
            ...botPlayers
        ],
        started: true, turnIndex: 0, hands: {},
        currentBid: { qty: 0, face: 0, pseudo: "", style: DEFAULT_STYLE },
        isPalifico: false, palificoFace: null,
        resolving: false, turnTimer: null, botTimer: null,
        vsBot: true, isBotGame: true, mode: 'solo',
        run: { pseudo, nodeId: node.id, relics: run.relics.slice(), kind: node.kind },
        relicSpareUsed: false,
        eliminationOrder: [], humanCount: 1
    };
    run.gameId = gameId;
    socket.join(gameId);
    socket.emit('game_joined', gameId, true);
    io.emit('update_games', getPublicGames());
    const label = node.kind === 'boss' ? 'BOSS' : (node.kind === 'elite' ? 'Élite' : 'Combat');
    io.to(gameId).emit('game_log', `⚔️ ${label} — ${bots.map(b => escapeHtml(b.name)).join(', ')}.`);
    startRound(gameId);
}

// Hauts faits : badges débloqués selon les stats cumulées
const ACHIEVEMENTS = [
    { id: 'firstWin', name: 'Premier sang',        icon: '🩸', test: u => (u.wins || 0) >= 1 },
    { id: 'wins10',   name: 'Loup des mers',        icon: '🐺', test: u => (u.wins || 0) >= 10 },
    { id: 'wins25',   name: 'Terreur des flots',    icon: '☠️', test: u => (u.wins || 0) >= 25 },
    { id: 'dudos10',  name: 'Démasqueur',           icon: '🔍', test: u => (u.stats.dudosWon || 0) >= 10 },
    { id: 'dudos50',  name: 'Détecteur de bluff',   icon: '🕵️', test: u => (u.stats.dudosWon || 0) >= 50 },
    { id: 'calza5',   name: 'Maître du Calza',      icon: '🎯', test: u => (u.stats.calzasWon || 0) >= 5 },
    { id: 'games50',  name: 'Vétéran des tavernes', icon: '⚓', test: u => (u.played || 0) >= 50 },
    { id: 'botSlayer',name: 'Maître du Cthulhu',    icon: '🦑', test: u => (u.botWins || 0) >= 1 },
    { id: 'camp_ch1', name: 'Écumeur des Bas-fonds', icon: '🏴‍☠️', test: u => (u.campaignLevel || 0) >= 5 },
    { id: 'camp_ch2', name: 'Dompteur des Brumes',   icon: '🌫️', test: u => (u.campaignLevel || 0) >= 10 },
    { id: 'camp_final',name: 'Vainqueur de l\'Abîme', icon: '🔱', test: u => (u.campaignLevel || 0) >= 15 },
    { id: 'tourney_champ', name: 'Champion', icon: '🏆', test: u => (u.tourneyWins || 0) >= 1 }
];


let registeredUsers = {};

// =====================================================================
//  PERSISTANCE
//  - En production : Upstash Redis (gratuit, persistant) si les variables
//    d'environnement sont présentes sur Render.
//  - En local (pas de variables) : repli automatique sur users.json.
//  Dans les deux cas les comptes vivent EN MÉMOIRE (lecture instantanée) ;
//  on ne touche au stockage QUE pour sauvegarder.
// =====================================================================
let redis = null;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
        const { Redis } = require('@upstash/redis');
        redis = Redis.fromEnv();
        console.log("🔌 Connexion à Upstash Redis activée.");
    } catch (e) {
        console.log("⚠️ Module @upstash/redis introuvable, repli sur le fichier local.");
    }
}

async function loadUsers() {
    if (redis) {
        try {
            const data = await redis.get('users'); // l'objet est désérialisé automatiquement
            registeredUsers = data || {};
            console.log(`✅ ${Object.keys(registeredUsers).length} compte(s) chargé(s) depuis Redis.`);
        } catch (e) {
            console.log("⚠️ Lecture Redis échouée, démarrage à neuf :", e.message);
            registeredUsers = {};
        }
        return;
    }
    // Repli fichier local (développement)
    try {
        if (fs.existsSync(USERS_FILE)) {
            const rawData = fs.readFileSync(USERS_FILE, 'utf-8');
            if (rawData && rawData.trim() !== "") registeredUsers = JSON.parse(rawData);
        }
    } catch (error) {
        console.log("⚠️ Fichier users.json cassé ou vide. Démarrage à neuf !");
        registeredUsers = {};
    }
}

// Écriture RÉELLE vers le stockage (Redis ou fichier)
function flushUsers() {
    usersDirty = false;
    if (redis) {
        redis.set('users', registeredUsers).catch(e => console.log("⚠️ Écriture Redis échouée :", e.message));
        return;
    }
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(registeredUsers, null, 2));
    } catch (error) {
        console.log("⚠️ Écriture sur disque bloquée (normal sur serveur gratuit), mémoire vive utilisée.");
    }
}

// Sauvegarde DIFFÉRÉE : regroupe les rafales d'écritures (manches, stats...)
// en un seul appel toutes les SAVE_DEBOUNCE_MS -> économise le quota Upstash.
let usersDirty = false;
let saveTimer = null;
const SAVE_DEBOUNCE_MS = 4000;
function saveUsers(immediate = false) {
    usersDirty = true;
    if (immediate) {
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
        flushUsers();
        return;
    }
    if (saveTimer) return; // un flush est déjà programmé : on coalesce
    saveTimer = setTimeout(() => {
        saveTimer = null;
        if (usersDirty) flushUsers();
    }, SAVE_DEBOUNCE_MS);
}

// =====================================================================
//  SÉCURITÉ : hash de mot de passe (crypto natif, aucune dépendance)
// =====================================================================
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
    if (typeof stored !== 'string' || !stored.includes(':')) return false;
    const [salt, hash] = stored.split(':');
    const test = crypto.scryptSync(password, salt, 64).toString('hex');
    const a = Buffer.from(hash, 'hex');
    const b = Buffer.from(test, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Anti-XSS : neutralise tout HTML dans le texte envoyé par les joueurs
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Garantit que les champs de gamification existent (anciens comptes)
function ensureUserFields(user) {
    if (!user) return;
    if (!Array.isArray(user.achievements)) user.achievements = [];
    if (typeof user.title !== 'string') user.title = '';   // titre équipé (id de haut fait)
    if (typeof user.played !== 'number') user.played = 0;
    if (typeof user.wins !== 'number') user.wins = 0;
    // --- Classement V3 (soft reset : rankPoints démarre à 0 pour tous) ---
    if (typeof user.rankPoints !== 'number') user.rankPoints = 0;
    if (typeof user.seconds !== 'number') user.seconds = 0;        // 2e places (3+ joueurs)
    if (typeof user.played1v1 !== 'number') user.played1v1 = 0;
    if (typeof user.wins1v1 !== 'number') user.wins1v1 = 0;
    if (typeof user.playedMulti !== 'number') user.playedMulti = 0;
    if (typeof user.winsMulti !== 'number') user.winsMulti = 0;
    if (typeof user.botGames !== 'number') user.botGames = 0;      // hors classement
    if (typeof user.botWins !== 'number') user.botWins = 0;
    if (typeof user.tourneyWins !== 'number') user.tourneyWins = 0;   // tournois remportés
    if (typeof user.campaignLevel !== 'number') user.campaignLevel = 0;   // dernier niveau de campagne réussi
    // campaignStars : map { niveau: nombre d'étoiles (1-3) }. Migration depuis l'ancien tableau.
    if (Array.isArray(user.campaignStars)) {
        const m = {}; user.campaignStars.forEach(id => { m[id] = 2; }); user.campaignStars = m;
    }
    if (typeof user.campaignStars !== 'object' || user.campaignStars === null) user.campaignStars = {};
    if (typeof user.bestStreak !== 'number') user.bestStreak = 0;
    if (typeof user.currentStreak !== 'number') user.currentStreak = 0;
    if (!user.stats || typeof user.stats !== 'object') user.stats = {};
    if (typeof user.stats.dudosWon !== 'number') user.stats.dudosWon = 0;
    if (typeof user.stats.calzasWon !== 'number') user.stats.calzasWon = 0;
    if (typeof user.stats.diceLost !== 'number') user.stats.diceLost = 0;
    // --- Stats avancées ---
    if (!Array.isArray(user.stats.bidFaces)) user.stats.bidFaces = [0, 0, 0, 0, 0, 0, 0];
    if (!Array.isArray(user.stats.rolledFaces)) user.stats.rolledFaces = [0, 0, 0, 0, 0, 0, 0];
    if (typeof user.stats.timesChallenged !== 'number') user.stats.timesChallenged = 0;
    if (typeof user.stats.bluffsSurvived !== 'number') user.stats.bluffsSurvived = 0;
    if (typeof user.stats.challengesMade !== 'number') user.stats.challengesMade = 0;
    if (typeof user.stats.challengesWon !== 'number') user.stats.challengesWon = 0;
    if (typeof user.stats.eliminations !== 'number') user.stats.eliminations = 0;
    if (typeof user.stats.eliminatedTotal !== 'number') user.stats.eliminatedTotal = 0;
    if (!user.stats.nemesis || typeof user.stats.nemesis !== 'object') user.stats.nemesis = {};
    // --- Classements périodiques (hebdo / mensuel) ---
    if (!user.periodic || typeof user.periodic !== 'object') user.periodic = {};
    if (!user.periodic.week || typeof user.periodic.week !== 'object') user.periodic.week = { id: '', pts: 0 };
    if (!user.periodic.month || typeof user.periodic.month !== 'object') user.periodic.month = { id: '', pts: 0 };
    // --- Cosmétiques de profil ---
    if (typeof user.avatar !== 'string') user.avatar = '';
    if (typeof user.avatarImg !== 'string') user.avatarImg = '';
    if (typeof user.nameColor !== 'string') user.nameColor = '';
    if (typeof user.frame !== 'string') user.frame = '';
    if (typeof user.banner !== 'string') user.banner = '';
}
function isoWeekId(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - dayNum + 3);
    const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
    const week = 1 + Math.round(((date - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
    return date.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
}
function periodIds() {
    const d = new Date();
    return { week: isoWeekId(d), month: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') };
}
function addPeriodic(user, pts) {
    if (!user || !pts) return;
    ensureUserFields(user);
    const ids = periodIds();
    if (user.periodic.week.id !== ids.week) user.periodic.week = { id: ids.week, pts: 0 };
    if (user.periodic.month.id !== ids.month) user.periodic.month = { id: ids.month, pts: 0 };
    user.periodic.week.pts += pts;
    user.periodic.month.pts += pts;
}
function periodicPts(user, scope) {
    if (!user || !user.periodic || !user.periodic[scope]) return 0;
    const ids = periodIds();
    return (user.periodic[scope].id === ids[scope]) ? (user.periodic[scope].pts || 0) : 0;
}
function addStatFace(pseudo, key, face) {
    const u = registeredUsers[pseudo]; if (!u || face < 1 || face > 6) return;
    ensureUserFields(u);
    if (!Array.isArray(u.stats[key])) u.stats[key] = [0, 0, 0, 0, 0, 0, 0];
    u.stats[key][face] = (u.stats[key][face] || 0) + 1;
}
function addNemesis(victimPseudo, killerPseudo) {
    if (!victimPseudo || !killerPseudo || victimPseudo === killerPseudo) return;
    const u = registeredUsers[victimPseudo]; if (!u) return;
    ensureUserFields(u);
    u.stats.nemesis[killerPseudo] = (u.stats.nemesis[killerPseudo] || 0) + 1;
}

// Nom affichable d'un haut fait (pour le titre sous le pseudo)
function achievementName(id) {
    const a = ACHIEVEMENTS.find(x => x.id === id);
    return a ? a.name : '';
}

// Le titre équipé d'un compte, seulement s'il est bien débloqué
function titleOf(user) {
    if (!user || !user.title) return '';
    ensureUserFields(user);
    return user.achievements.includes(user.title) ? achievementName(user.title) : '';
}

// Grade dérivé des POINTS DE CLASSEMENT
function getRank(points) {
    let name = RANKS[0].name;
    for (const r of RANKS) { if ((points || 0) >= r.min) name = r.name; }
    return name;
}

function addStat(pseudo, key, n = 1) {
    const u = registeredUsers[pseudo];
    if (!u) return;
    ensureUserFields(u);
    u.stats[key] = (u.stats[key] || 0) + n;
}

// Un skin verrouillé se débloque avec les victoires ; "cthulhu" en battant le bot ;
// corsaire/abysse/kraken via les boss de campagne
function ownsSkin(user, skinId) {
    if (skinId === 'cthulhu') return (user.botWins || 0) >= 1;
    const lvl = user.campaignLevel || 0;
    if (skinId === 'corsaire') return lvl >= 5;
    if (skinId === 'abysse') return lvl >= 10;
    if (skinId === 'kraken') return lvl >= 15;
    if (skinId === 'brume') return lvl >= 9;
    if (skinId === 'sang') return lvl >= 12;
    if (skinId === 'forge' && lvl >= 3) return true;   // coffre niv. 3 (ou 5 victoires)
    if (skinId === 'gold' && lvl >= 6) return true;     // coffre niv. 6 (ou 10 victoires)
    if (skinId === 'tresor') return totalCampaignStars(user) >= CAMPAIGN_MAX_STARS;   // 100 % d'étoiles
    if (skinId === 'couronne') return (user.tourneyWins || 0) >= 1;                     // champion de tournoi
    const winReq = SKIN_LOCKS[skinId];
    if (!winReq) return true;
    return (user.wins || 0) >= winReq;
}
const LOCKED_SKINS = ['forge', 'gold', 'cthulhu', 'corsaire', 'abysse', 'kraken', 'brume', 'sang', 'tresor', 'couronne'];

// Vérifie et débloque les hauts faits atteints ; renvoie les NOUVEAUX
function checkAchievements(pseudo) {
    const u = registeredUsers[pseudo];
    if (!u) return [];
    ensureUserFields(u);
    const unlocked = [];
    for (const a of ACHIEVEMENTS) {
        if (!u.achievements.includes(a.id) && a.test(u)) {
            u.achievements.push(a.id);
            unlocked.push({ id: a.id, name: a.name });
        }
    }
    return unlocked;
}

// Bloc de stats publiques (visible sur sa propre fiche ET au clic dans le classement)
function argmaxFace(arr) {
    if (!Array.isArray(arr)) return 0;
    let best = 0, bestV = 0;
    for (let f = 1; f <= 6; f++) { if ((arr[f] || 0) > bestV) { bestV = arr[f]; best = f; } }
    return best;
}
function topNemesis(map) {
    if (!map || typeof map !== 'object') return null;
    let p = null, c = 0;
    for (const k in map) { if (map[k] > c) { c = map[k]; p = k; } }
    return p ? { pseudo: p, count: c } : null;
}
function publicStats(user) {
    ensureUserFields(user);
    const played = user.played || 0;
    const wins = user.wins || 0;
    return {
        pseudo: user.pseudo,
        title: titleOf(user),
        rankPoints: user.rankPoints || 0,
        rank: getRank(user.rankPoints),
        played, wins,
        winRate: played > 0 ? Math.round((wins / played) * 100) : 0,
        seconds: user.seconds || 0,
        played1v1: user.played1v1 || 0,
        wins1v1: user.wins1v1 || 0,
        playedMulti: user.playedMulti || 0,
        winsMulti: user.winsMulti || 0,
        botGames: user.botGames || 0,
        botWins: user.botWins || 0,
        bestStreak: user.bestStreak || 0,
        currentStreak: user.currentStreak || 0,
        dudosWon: user.stats.dudosWon || 0,
        calzasWon: user.stats.calzasWon || 0,
        diceLost: user.stats.diceLost || 0,
        eliminations: user.stats.eliminations || 0,
        bluffRate: (user.stats.timesChallenged || 0) > 0 ? Math.round((user.stats.bluffsSurvived / user.stats.timesChallenged) * 100) : 0,
        challengeRate: (user.stats.challengesMade || 0) > 0 ? Math.round((user.stats.challengesWon / user.stats.challengesMade) * 100) : 0,
        favFace: argmaxFace(user.stats.bidFaces),
        luckyFace: argmaxFace(user.stats.rolledFaces),
        nemesis: topNemesis(user.stats.nemesis),
        avatar: user.avatar || '',
        avatarImg: user.avatarImg || '',
        nameColor: user.nameColor || '',
        frame: user.frame || '',
        banner: user.banner || ''
    };
}

// Données de profil envoyées au joueur concerné (ses propres stats + titres)
function profilePayload(user) {
    ensureUserFields(user);
    return Object.assign(publicStats(user), {
        achievements: user.achievements,
        equippedTitle: user.title || '',
        position: getPlayerPosition(user.pseudo),
        totalPlayers: Object.keys(registeredUsers).length,
        campaignLevel: user.campaignLevel || 0,
        campaignStars: user.campaignStars || {},
        campaignTotalStars: totalCampaignStars(user),
        campaignMaxStars: CAMPAIGN_MAX_STARS,
        tourneyWins: user.tourneyWins || 0,
        isAdmin: isAdmin(user.pseudo)
    });
}

// Tous les comptes triés par points (ordre du classement)
function rankedUsers() {
    return Object.values(registeredUsers)
        .sort((a, b) => (b.rankPoints || 0) - (a.rankPoints || 0) || (b.wins || 0) - (a.wins || 0));
}

// Rang global d'un joueur (1 = premier), null si introuvable
function getPlayerPosition(pseudo) {
    const idx = rankedUsers().findIndex(u => u.pseudo === pseudo);
    return idx >= 0 ? idx + 1 : null;
}

// Classement envoyé au lobby : top 50 seulement (charge réseau allégée sur mobile)
// Cosmétiques (avatar/cadre/photo) d'un joueur en partie, pour les cartes autour de la table
function cosmeticsOf(gp) {
    const u = gp && registeredUsers[gp.pseudo];
    return { avatar: (u && u.avatar) || '', avatarImg: (u && u.avatarImg) || '', nameColor: (u && u.nameColor) || '', frame: (u && u.frame) || '' };
}

function getLeaderboard(limit = 50, scope = 'all') {
    if (scope === 'week' || scope === 'month') {
        return Object.values(registeredUsers)
            .map(u => ({ u, pts: periodicPts(u, scope) }))
            .filter(x => x.pts > 0)
            .sort((a, b) => b.pts - a.pts)
            .slice(0, limit)
            .map(x => Object.assign(publicStats(x.u), { periodPoints: x.pts }));
    }
    return rankedUsers().slice(0, limit).map(u => publicStats(u));
}

// Envoie le profil mis à jour (stats, grade) au(x) socket(s) du joueur
function notifyProfile(pseudo) {
    const u = registeredUsers[pseudo];
    if (!u) return;
    for (const [sid, p] of Object.entries(players)) {
        if (p.pseudo === pseudo) io.to(sid).emit('profile_update', profilePayload(u));
    }
}

// Émet vers le(s) socket(s) d'un pseudo, quel que soit l'événement
function emitToPseudo(pseudo, event, payload) {
    for (const [sid, p] of Object.entries(players)) {
        if (p.pseudo === pseudo) io.to(sid).emit(event, payload);
    }
}

// Vérifie les hauts faits, annonce les nouveaux et rafraîchit le profil
function syncRewards(pseudo) {
    const unlocked = checkAchievements(pseudo);
    for (const a of unlocked) emitToPseudo(pseudo, 'achievement_unlocked', a);
    notifyProfile(pseudo);
    return unlocked.length > 0;
}

// Version allégée pour le lobby : on N'ENVOIE PAS les mains ni les sockets
function getPublicGames() {
    const out = {};
    const specCount = {};
    for (const s of io.sockets.sockets.values()) {
        if (s.spectating) specCount[s.spectating] = (specCount[s.spectating] || 0) + 1;
    }
    for (const [id, g] of Object.entries(activeGames)) {
        if (g.vsBot) continue;   // les parties contre l'IA sont privées (non rejoignables)
        out[id] = { id, count: g.players.length, started: g.started, spectators: specCount[id] || 0 };
    }
    return out;
}

// =====================================================================
//  ÉTAT EN MÉMOIRE
// =====================================================================
const players = {};
const activeGames = {};

// =====================================================================
//  LOGIQUE DE JEU
// =====================================================================
function rollDice(count) {
    return Array.from({ length: count }, () => Math.floor(Math.random() * 6) + 1).sort();
}

function countTotalDice(game, face) {
    let total = 0;
    for (const p of game.players) {
        if (p.dice > 0) {
            const hand = game.hands[p.id] || [];
            total += hand.filter(d => d === face).length;
            if (!game.isPalifico && face !== 1) total += hand.filter(d => d === 1).length;
        }
    }
    return total;
}

function nextTurn(game) {
    do {
        game.turnIndex = (game.turnIndex + 1) % game.players.length;
    } while (game.players[game.turnIndex].dice <= 0);
}

// Relique "Cœur de Davy Jones" : annule la première perte de dé du joueur dans le combat
function spareDie(game, player) {
    if (game.run && !player.isBot && game.run.relics.includes('coeur') && !game.relicSpareUsed) {
        game.relicSpareUsed = true;
        return true;
    }
    return false;
}

// ---- VALIDATION DES ENCHÈRES CÔTÉ SERVEUR (ne jamais faire confiance au client) ----
function isBidValid(game, qty, face) {
    if (!Number.isInteger(qty) || !Number.isInteger(face)) return false;
    if (face < 1 || face > 6) return false;
    if (qty < 1) return false;

    // On ne peut pas annoncer plus de dés qu'il n'y en a sur la table
    const totalDice = game.players.reduce((sum, p) => sum + (p.dice > 0 ? p.dice : 0), 0);
    if (qty > totalDice) return false;

    const oq = game.currentBid.qty;
    const of = game.currentBid.face;

    // Anti-boucle (règle maison "double") : on ne peut pas rejouer une enchère déjà posée cette manche
    if (oq !== 0 && Array.isArray(game.bidHistory) && game.bidHistory.some(b => b.qty === qty && b.face === face)) return false;

    // Ouverture : jamais sur les Pacos (il faut annoncer un nombre ; les autres pourront surenchérir dessus ou passer aux Pacos)
    if (oq === 0) {
        if (face === 1) return false;
        return true;
    }

    // PALIFICO : la face est verrouillée. On peut monter la quantité sur cette face,
    // passer aux Pacos (moitié supérieure), ou revenir sur la face depuis les Pacos (le double).
    // Les Pacos ne comptent PAS comme joker pendant le palifico.
    if (game.isPalifico) {
        const lockedFace = game.palificoFace || (of !== 1 ? of : null);
        if (of === 1) {
            // mise courante sur les Pacos
            if (face === 1) return qty > oq;                                  // monter les Pacos
            if (lockedFace && face === lockedFace) return qty >= oq * 2;      // revenir sur la face : le double (règle maison)
            return false;                                                      // aucune autre face
        }
        // mise courante sur la face verrouillée
        if (face === of) return qty > oq;                    // monter la quantité sur la face
        if (face === 1) return qty >= Math.ceil(oq / 2);     // passer aux Pacos : moitié supérieure
        return false;                                         // changer pour une autre face : interdit
    }

    // Mise courante sur une face normale
    if (of !== 1) {
        if (face === 1) {              // on passe aux Pacos : moitié supérieure
            return qty >= Math.ceil(oq / 2);
        }
        return qty > oq || (qty === oq && face > of);
    }

    // Mise courante sur des Pacos
    if (face === 1) return qty > oq;   // plus de Pacos
    return qty >= oq * 2;              // on quitte les Pacos : le double (règle maison d'Erquy)
}

// =====================================================================
//  GESTION DU TIMER DE TOUR (anti-AFK / anti-blocage)
// =====================================================================
function clearTurnTimer(game) {
    if (game && game.turnTimer) {
        clearTimeout(game.turnTimer);
        game.turnTimer = null;
    }
}

function startTurnTimer(gameId) {
    const game = activeGames[gameId];
    if (!game || !game.started) return;
    clearTurnTimer(game);
    // Timer désactivé par défaut : on ne force jamais d'action automatique.
    // Activable par l'hôte dans les réglages (options.autoTimer = true).
    if (!game.options || !game.options.autoTimer) return;
    game.turnTimer = setTimeout(() => onTurnTimeout(gameId), TURN_TIMEOUT_MS);
}

function onTurnTimeout(gameId) {
    const game = activeGames[gameId];
    if (!game || !game.started || game.resolving) return;
    const current = game.players[game.turnIndex];
    if (!current || current.dice <= 0) return;

    if (game.currentBid.qty > 0) {
        io.to(gameId).emit('game_log', `⏰ <b>${escapeHtml(current.pseudo)}</b> a trop tardé : Dudo automatique !`);
        resolveChallenge(gameId, current.id, false);
    } else {
        // Joueur d'ouverture inactif : mise minimale automatique
        io.to(gameId).emit('game_log', `⏰ <b>${escapeHtml(current.pseudo)}</b> a trop tardé : mise automatique.`);
        registerBid(game, gameId, current, 1, 2);
    }
}

// Pose une enchère et passe la main (chemin commun joueur / auto-AFK)
function registerBid(game, gameId, player, qty, face) {
    // Palifico : la 1ère mise fixe la face verrouillée pour toute la manche
    if (game.isPalifico && game.currentBid.qty === 0 && face !== 1) {
        game.palificoFace = face;
    }
    game.currentBid = { qty, face, pseudo: player.pseudo, style: player.style, dice: player.dice, nameColor: player.nameColor || '' };
    (game.bidHistory = game.bidHistory || []).push({ qty, face });
    if (!player.isBot) addStatFace(player.pseudo, 'bidFaces', face);
    io.to(gameId).emit('game_log', { k: 'log_bid', type: 'bid', p: { name: player.pseudo, qty, face: face === 1 ? 'Paco' : face } });
    io.to(gameId).emit('bid_updated', game.currentBid);
    nextTurn(game);
    io.to(gameId).emit('turn_changed', game.players[game.turnIndex].id);
    startTurnTimer(gameId);
    maybeBotTurn(gameId);
}

function startRound(gameId) {
    const game = activeGames[gameId];
    if (!game) return;

    game.hands = {};
    game.currentBid = { qty: 0, face: 0, pseudo: "", style: DEFAULT_STYLE };
    game.bidHistory = [];   // anti-boucle : enchères déjà jouées cette manche
    game.resolving = false;

    const alivePlayers = game.players.filter(p => p.dice > 0);
    game.isPalifico = false;
    game.palificoFace = null;   // face verrouillée du palifico (fixée à la 1ère mise)
    if (!game.palificoDone) game.palificoDone = {};   // pseudos ayant DÉJÀ eu leur palifico (persiste toute la partie)
    let palificoStarterId = null;
    let palificoPlayerName = "";
    const palificoEnabled = !game.options || game.options.palifico !== false;

    alivePlayers.forEach(p => {
        if (palificoEnabled && p.dice === 1 && !game.palificoDone[p.pseudo]) {
            game.isPalifico = true;
            game.palificoDone[p.pseudo] = true;
            p.hasBeenPalifico = true;
            palificoStarterId = p.id;
            palificoPlayerName = p.pseudo;
        }
        game.hands[p.id] = rollDice(p.dice);
        if (!p.isBot) game.hands[p.id].forEach(f => addStatFace(p.pseudo, 'rolledFaces', f));
    });

    // Modificateur "malédiction" : palifico permanent (le starter est le joueur du tour)
    if (game.forcePalifico && !game.isPalifico) {
        game.isPalifico = true;
        if (game.players[game.turnIndex].dice <= 0) nextTurn(game);
        palificoStarterId = game.players[game.turnIndex].id;
    }

    // Envoi des mains (avec brouillard pour le joueur humain : 1 dé caché)
    alivePlayers.forEach(p => {
        const fog = (game.fog && !p.isBot && p.dice > 1);   // on cache 1 dé au joueur
        io.to(p.id).emit('your_hand', fog ? { hand: game.hands[p.id], hiddenCount: 1 } : game.hands[p.id]);
    });

    if (game.isPalifico && palificoStarterId) {
        game.turnIndex = game.players.findIndex(p => p.id === palificoStarterId);
    } else if (game.players[game.turnIndex].dice <= 0) {
        nextTurn(game);
    }

    // Relique "Ancre Lestée" : le joueur humain ouvre toujours les enchères
    if (game.run && game.run.relics.includes('ancre')) {
        const hi = game.players.findIndex(p => !p.isBot && p.dice > 0);
        if (hi >= 0) game.turnIndex = hi;
    }
    // Relique "Longue-vue" : révèle un dé d'un adversaire au joueur
    if (game.run && game.run.relics.includes('oeil')) {
        const human = game.players.find(p => !p.isBot);
        const foes = game.players.filter(p => p.isBot && p.dice > 0);
        if (human && foes.length) {
            const foe = foes[(Math.random() * foes.length) | 0];
            const hand = game.hands[foe.id] || [];
            if (hand.length) {
                const die = hand[(Math.random() * hand.length) | 0];
                io.to(human.id).emit('relic_intel', { kind: 'oeil', foe: foe.pseudo, die });
            }
        }
    }

    io.to(gameId).emit('round_started', {
        playersData: game.players.map(p => ({ id: p.id, pseudo: p.pseudo, dice: p.dice, style: p.style, team: p.team, ...cosmeticsOf(p) })),
        turnId: game.players[game.turnIndex].id,
        isPalifico: game.isPalifico,
        palificoPlayer: palificoPlayerName,
        mode: game.mode || 'solo',
        mods: game.campaignMods || []
    });

    // En duo, chaque joueur voit la main de son équipier
    if (game.mode === 'duo') {
        game.players.forEach(p => {
            const mate = teammateOf(game, p);
            if (mate) {
                io.to(p.id).emit('teammate_hand', {
                    id: mate.id, pseudo: mate.pseudo, style: mate.style,
                    dice: mate.dice, hand: mate.dice > 0 ? (game.hands[mate.id] || []) : []
                });
            }
        });
    }

    startTurnTimer(gameId);
    maybeBotTurn(gameId);
}

// Coéquipier d'un joueur en mode duo (même team, id différent)
function teammateOf(game, player) {
    if (!player || player.team == null) return null;
    return game.players.find(p => p.id !== player.id && p.team === player.team) || null;
}

function resolveChallenge(gameId, callerSocketId, isCalza) {
    const game = activeGames[gameId];
    if (!game || game.resolving || game.currentBid.qty === 0 || game.players[game.turnIndex].id !== callerSocketId) return;

    clearTurnTimer(game);
    game.resolving = true;

    const caller = game.players[game.turnIndex];
    let prevIndex = game.turnIndex;
    do {
        prevIndex = (prevIndex - 1 + game.players.length) % game.players.length;
    } while (game.players[prevIndex].dice <= 0);
    const bidder = game.players[prevIndex];
    if (!caller.isBot) addStat(caller.pseudo, 'challengesMade');
    if (!isCalza && !bidder.isBot) addStat(bidder.pseudo, 'timesChallenged');

    if (isCalza) io.to(gameId).emit('game_log', { k: 'log_calza_call', type: 'calza', tav: 'tav_calza', p: { name: caller.pseudo } });
    else io.to(gameId).emit('game_log', { k: 'log_dudo_call', type: 'dudo', tav: 'tav_liar', p: { caller: caller.pseudo, bidder: bidder.pseudo } });

    io.to(gameId).emit('challenge_called', { type: isCalza ? 'calza' : 'dudo', caller: caller.pseudo, target: bidder.pseudo });

    io.to(gameId).emit('reveal_hands', game.hands);
    const actualCount = countTotalDice(game, game.currentBid.face);
    io.to(gameId).emit('game_log', { k: 'log_total', type: 'system', p: { n: actualCount } });

    setTimeout(() => {
        if (!activeGames[gameId]) return; // partie supprimée entre-temps
        let logMsg = "";
        let resultLine = "";
        const callerBefore = caller.dice, bidderBefore = bidder.dice;

        // Rappel de la mise contestée + total réellement présent (sans icônes)
        const bq = game.currentBid.qty;
        const bf = game.currentBid.face;
        const faceLabel = bf === 1 ? 'Paco' : `dé ${bf}`;
        const bidLine = `<b style="color:${bidder.style.bgColor}">${escapeHtml(bidder.pseudo)}</b> : Annonce ${bq}× ${faceLabel}`;
        const countLine = `Il y avait ${actualCount}× ${faceLabel}`;
        let callLine = "";

        if (isCalza) {
            callLine = `<b style="color:${caller.style.bgColor}">${escapeHtml(caller.pseudo)}</b> : Calza (compte exact)`;
            if (actualCount === game.currentBid.qty) {
                logMsg = { k: 'log_res_calza_ok', type: 'calza', p: { name: caller.pseudo } };
                resultLine = { k: 'res_calza_ok', p: { name: caller.pseudo } };
                if (caller.dice < START_DICE) caller.dice += 1;
                addStat(caller.pseudo, 'calzasWon');
            } else {
                logMsg = { k: 'log_res_calza_ko', type: 'dudo', p: { name: caller.pseudo } };
                resultLine = { k: 'res_calza_ko', p: { name: caller.pseudo } };
                if (spareDie(game, caller)) { logMsg = { k: 'log_res_davy', type: 'system', p: { name: caller.pseudo } }; resultLine = { k: 'res_davy', p: { name: caller.pseudo } }; }
                else { caller.dice -= 1; addStat(caller.pseudo, 'diceLost'); }
            }
            game.turnIndex = game.players.indexOf(caller);
        } else {
            callLine = `<b style="color:${caller.style.bgColor}">${escapeHtml(caller.pseudo)}</b> : Menteur !`;
            if (actualCount >= game.currentBid.qty) {
                logMsg = { k: 'log_res_bid_good', type: 'dudo', p: { name: caller.pseudo } };
                resultLine = { k: 'res_bid_good', p: { name: caller.pseudo } };
                if (spareDie(game, caller)) { logMsg = { k: 'log_res_davy', type: 'system', p: { name: caller.pseudo } }; resultLine = { k: 'res_davy', p: { name: caller.pseudo } }; }
                else { caller.dice -= 1; addStat(caller.pseudo, 'diceLost'); }
                game.turnIndex = game.players.indexOf(caller);
            } else {
                logMsg = { k: 'log_res_bluff', type: 'dudo', p: { name: bidder.pseudo } };
                resultLine = { k: 'res_bluff', p: { name: bidder.pseudo } };
                if (spareDie(game, bidder)) { logMsg = { k: 'log_res_davy', type: 'system', p: { name: bidder.pseudo } }; resultLine = { k: 'res_davy', p: { name: bidder.pseudo } }; }
                else { bidder.dice -= 1; addStat(bidder.pseudo, 'diceLost'); }
                addStat(caller.pseudo, 'dudosWon');
                game.turnIndex = game.players.indexOf(bidder);
            }
        }

        const centerDisplayMsg = resultLine;

        saveUsers();
        syncRewards(caller.pseudo);
        syncRewards(bidder.pseudo);

        io.to(gameId).emit('game_log', logMsg);
        io.to(gameId).emit('round_result_display', centerDisplayMsg);

        // --- Stats avancées : défis gagnés, bluffs survécus, éliminations, ennemi juré ---
        if (bidder.dice < bidderBefore || caller.dice > callerBefore) { if (!caller.isBot) addStat(caller.pseudo, 'challengesWon'); }
        if (!isCalza && caller.dice < callerBefore) { if (!bidder.isBot) addStat(bidder.pseudo, 'bluffsSurvived'); }
        let _dieLoser = null, _killer = null;
        if (caller.dice < callerBefore) { _dieLoser = caller; _killer = bidder; }
        else if (bidder.dice < bidderBefore) { _dieLoser = bidder; _killer = caller; }
        if (_dieLoser && _dieLoser.dice <= 0) {
            if (_killer && !_killer.isBot) addStat(_killer.pseudo, 'eliminations');
            if (!_dieLoser.isBot) { addStat(_dieLoser.pseudo, 'eliminatedTotal'); addNemesis(_dieLoser.pseudo, _killer && _killer.pseudo); }
        }

        recordEliminations(game);
        const winners = getWinners(game);
        if (winners) {
            endGame(gameId, winners);
        } else if (campaignHumanDead(game)) {
            endGame(gameId, game.players.filter(p => p.dice > 0));   // campagne : le joueur a perdu, on arrête
        } else {
            // si le joueur qui doit relancer est éliminé, on passe au suivant vivant
            if (game.players[game.turnIndex].dice <= 0) nextTurn(game);
            setTimeout(() => startRound(gameId), 2800);   // laisse le temps de lire le résultat
        }
    }, 4800);
}

// Campagne / Expédition : le joueur humain n'a plus de dés -> on termine sans regarder les bots finir
function campaignHumanDead(game) {
    if (!game.campaignLevel && !game.run) return false;
    const human = game.players.find(p => !p.isBot);
    return human ? human.dice <= 0 : false;
}

// Renvoie le tableau des gagnants si la partie est finie, sinon null
function getWinners(game) {
    const alive = game.players.filter(p => p.dice > 0);
    if (alive.length === 0) return null;
    if (game.mode === 'duo') {
        const teams = new Set(alive.map(p => p.team));
        if (teams.size === 1) {
            return game.players.filter(p => p.team === alive[0].team);   // les 2 membres de l'équipe
        }
        return null;
    }
    return alive.length === 1 ? [alive[0]] : null;
}

// Note les joueurs tombés à 0 dé, dans l'ordre où ils tombent (pour la 2e place)
function recordEliminations(game) {
    if (!game.eliminationOrder) game.eliminationOrder = [];
    game.players.forEach(p => {
        if (p.dice <= 0 && !game.eliminationOrder.includes(p.pseudo)) {
            game.eliminationOrder.push(p.pseudo);
            io.to(game.id).emit('player_eliminated', { pseudo: p.pseudo, id: p.id });
        }
    });
}

function endGame(gameId, winners) {
    const game = activeGames[gameId];
    if (!game) return;
    clearTurnTimer(game);
    recordEliminations(game);

    if (!Array.isArray(winners)) winners = [winners];
    const isDuo = game.mode === 'duo';
    const N = game.humanCount || game.players.filter(p => !p.isBot).length;
    const isBotGame = !!game.isBotGame;
    const order = game.eliminationOrder || [];
    const lastElim = order.length ? order[order.length - 1] : null;

    const winnerPseudos = winners.map(w => w.pseudo);
    const winnerNames = winners.map(w => `<b style="color:${w.style.bgColor}">${escapeHtml(w.pseudo)}</b>`).join(' & ');

    // 2e place : en duo, toute l'équipe du dernier éliminé ; en solo, le dernier éliminé
    let secondPseudos = [];
    if (lastElim) {
        const lastPlayer = game.players.find(p => p.pseudo === lastElim);
        if (isDuo && lastPlayer && lastPlayer.team != null) {
            secondPseudos = game.players.filter(p => p.team === lastPlayer.team).map(p => p.pseudo);
        } else {
            secondPseudos = [lastElim];
        }
    }
    secondPseudos = secondPseudos.filter(ps => !winnerPseudos.includes(ps));

    io.to(gameId).emit('game_log', { type: 'system', p: { names: winnerPseudos.join(' & ') }, k: isDuo ? 'log_win_team' : (winners.length > 1 ? 'log_win_multi' : 'log_win_solo') });
    let resultMsg = `🏆 ${isDuo ? "L'équipe " : ""}${winnerNames} REMPORTE LA PARTIE ! 🏴‍☠️`;
    if (!isBotGame) {
        resultMsg += `<br><span style="font-size:0.85rem;color:#ffca28;">+${winPoints(N)} pts`;
        if (N >= 3 && secondPseudos.length) resultMsg += ` · 2e : ${escapeHtml(secondPseudos.join(' & '))} +${secondPoints(N)} pts`;
        resultMsg += `</span>`;
    }
    io.to(gameId).emit('round_result_display', resultMsg);

    // --- Gagnant(s) ---
    let campRewards = [];        // labels des récompenses de campagne gagnées (pour l'écran de victoire)
    let campStarEarned = false;
    let campStarsThisRun = 0;
    let campAdvanced = false;
    winners.forEach(winner => {
        if (winner.isBot || !registeredUsers[winner.pseudo]) return;
        const u = registeredUsers[winner.pseudo];
        ensureUserFields(u);
        if (isBotGame) {
            u.botWins += 1;                       // entraînement : n'affecte ni wins, ni points, ni série
        } else {
            u.wins += 1;
            u.currentStreak = (u.currentStreak || 0) + 1;
            if (u.currentStreak > u.bestStreak) u.bestStreak = u.currentStreak;
            u.rankPoints += winPoints(N);
            addPeriodic(u, winPoints(N));
            if (N === 2) u.wins1v1 += 1; else u.winsMulti += 1;
        }
        // --- Progression de la CAMPAGNE ---
        if (game.campaignLevel) {
            const def = campaignLevelDef(game.campaignLevel);
            if (u.campaignLevel < game.campaignLevel) {
                u.campaignLevel = game.campaignLevel;
                campAdvanced = true;
                io.to(gameId).emit('game_log', `🗺️ Niveau ${game.campaignLevel} terminé !`);
                if (def && def.reward) {
                    if (def.reward.title) {
                        const t = ACHIEVEMENTS.find(a => a.id === def.reward.title);
                        if (t) { emitToPseudo(winner.pseudo, 'campaign_reward', { kind: 'title', name: t.name, icon: t.icon }); }
                    }
                    if (def.reward.skin) emitToPseudo(winner.pseudo, 'campaign_reward', { kind: 'skin', name: def.reward.skin });
                    if (def.reward.label) campRewards.push({ label: def.reward.label, skin: def.reward.skin || null });
                }
                if (def && def.chest) {
                    emitToPseudo(winner.pseudo, 'campaign_reward', { kind: 'chest', label: def.chest.label });
                    if (def.chest.label) campRewards.push({ label: def.chest.label, skin: def.chest.skin || null });
                }
            }
            // Défi (étoiles 1-3) : 1 = gagner, 2 = garder le quota de dés, 3 = sans perdre un seul dé
            const startDice = (game.options && game.options.startDice) || START_DICE;
            const goal = (def && def.bots.length === 1) ? 3 : 2;
            let stars = 1;
            if ((winner.dice || 0) >= goal) stars = 2;
            if ((winner.dice || 0) >= startDice) stars = 3;
            const prevStars = u.campaignStars[game.campaignLevel] || 0;
            if (stars > prevStars) {
                u.campaignStars[game.campaignLevel] = stars;
                campStarEarned = true;
                emitToPseudo(winner.pseudo, 'campaign_reward', { kind: 'star', count: stars });
            }
            campStarsThisRun = stars;
        }
        syncRewards(winner.pseudo);
    });

    // --- 2e place (multi humain 3+) ---
    if (!isBotGame && N >= 3) {
        secondPseudos.forEach(ps => {
            const s = registeredUsers[ps];
            if (!s) return;
            ensureUserFields(s);
            s.rankPoints += secondPoints(N);
            addPeriodic(s, secondPoints(N));
            s.seconds += 1;
        });
    }

    // --- Séries des perdants ---
    if (!isBotGame) {
        game.players.forEach(p => {
            if (p.isBot || winnerPseudos.includes(p.pseudo)) return;
            const u = registeredUsers[p.pseudo];
            if (u) { ensureUserFields(u); u.currentStreak = 0; }
        });
    }

    // --- Écran de fin de campagne (récap pour le joueur humain) ---
    if (game.campaignLevel) {
        const human = game.players.find(p => !p.isBot);
        if (human) {
            const def = campaignLevelDef(game.campaignLevel);
            const humanWon = winners.some(w => !w.isBot);
            const hu = registeredUsers[human.pseudo];
            const startDice = (game.options && game.options.startDice) || START_DICE;
            const goal = (def && def.bots.length === 1) ? 3 : 2;
            emitToPseudo(human.pseudo, 'campaign_result', {
                won: humanWon,
                level: game.campaignLevel,
                levelName: def ? def.name : '',
                boss: def ? !!def.boss : false,
                advanced: campAdvanced,
                rewards: campRewards,
                stars: campStarsThisRun,
                bestStars: hu ? (hu.campaignStars[game.campaignLevel] || 0) : campStarsThisRun,
                star: campStarEarned,
                goals: { keep: goal, flawless: startDice },
                totalStars: hu ? totalCampaignStars(hu) : 0,
                maxStars: CAMPAIGN_MAX_STARS,
                nextLevel: campaignLevelDef(game.campaignLevel + 1) ? game.campaignLevel + 1 : null,
                total: CAMPAIGN.length
            });
        }
    }

    // --- Fin d'un combat d'EXPÉDITION (roguelite) ---
    if (game.run) {
        const run = runs[game.run.pseudo];
        const humanWon = winners.some(w => !w.isBot);
        if (run) {
            run.gameId = null;
            if (humanWon) {
                const node = findNode(run, game.run.nodeId);
                if (node) { node.done = true; run.posId = node.id; }
                const complete = node && node.kind === 'boss';
                if (complete) {
                    emitToPseudo(game.run.pseudo, 'run_result', { won: true, complete: true, relics: run.relics });
                    delete runs[game.run.pseudo];
                } else {
                    emitToPseudo(game.run.pseudo, 'run_result', { won: true, complete: false });
                    sendRun(game.run.pseudo);
                }
            } else {
                run.hp -= 1;
                if (run.hp <= 0) {
                    emitToPseudo(game.run.pseudo, 'run_result', { won: false, dead: true });
                    delete runs[game.run.pseudo];
                } else {
                    emitToPseudo(game.run.pseudo, 'run_result', { won: false, dead: false, hp: run.hp });
                    sendRun(game.run.pseudo);
                }
            }
        }
    }

    // --- Fin d'un match de TOURNOI ---
    if (game.tournament) {
        const t = tournaments[game.tournament.id];
        if (t) {
            const match = t.matches[game.tournament.matchId];
            const winnerPseudo = (winners.find(w => !w.isBot) || winners[0] || {}).pseudo || null;
            if (match && !match.done) {
                match.winner = winnerPseudo; match.done = true; match.gameId = null;
                io.to(gameId).emit('tournament_match_over', { tournamentId: t.id, winner: winnerPseudo });
                tournamentCheckRound(t);
            }
        }
    }

    saveUsers(true);                 // fin de partie : on persiste tout sans attendre
    io.emit('update_leaderboard', getLeaderboard());
    // Récap de fin : classement (vainqueurs 1ers, puis ordre d'élimination inversé)
    const elim = (game.eliminationOrder || []).slice();
    const ranked = new Set();
    const ranking = [];
    winnerPseudos.forEach(p => { ranking.push({ pseudo: p, rank: 1 }); ranked.add(p); });
    let _rk = 2;
    for (let i = elim.length - 1; i >= 0; i--) { const p = elim[i]; if (!ranked.has(p)) { ranking.push({ pseudo: p, rank: _rk++ }); ranked.add(p); } }
    game.players.forEach(p => { if (!ranked.has(p.pseudo)) { ranking.push({ pseudo: p.pseudo, rank: _rk++ }); ranked.add(p.pseudo); } });
    io.to(gameId).emit('game_recap', { winner: winnerPseudos.join(' & '), ranking });
    io.to(gameId).emit('game_over', winnerPseudos.join(' & '));
    clearBotTimer(game);
    delete activeGames[gameId];
    io.emit('update_games', getPublicGames());
}

// =====================================================================
//  BOT (adversaire IA) — décision probabiliste, 1v1
// =====================================================================
function clearBotTimer(game) {
    if (game && game.botTimer) { clearTimeout(game.botTimer); game.botTimer = null; }
}

// Combien de dés de la face demandée le bot a-t-il en main (Pacos jokers sauf Palifico)
function botCountOwn(game, botId, face) {
    const hand = game.hands[botId] || [];
    let c = hand.filter(d => d === face).length;
    if (!game.isPalifico && face !== 1) c += hand.filter(d => d === 1).length;
    return c;
}

// Espérance du nombre total de cette face sur la table, vue par le bot
function botExpectedCount(game, botId, face, totalDice) {
    const bot = game.players.find(p => p.id === botId);
    const own = botCountOwn(game, botId, face);
    const myDice = bot ? bot.dice : 0;
    const unknown = Math.max(0, totalDice - myDice);
    let p;
    if (game.isPalifico) p = 1 / 6;       // pas de joker
    else if (face === 1) p = 1 / 6;       // Pacos : pas de joker
    else p = 1 / 3;                        // la face + le Paco joker
    return own + unknown * p;
}

// Meilleure ouverture (jamais sur les Pacos) : la face la plus probable
function botBestOpening(game, botId, totalDice) {
    let best = { face: 2, qty: 1, exp: -1 };
    for (let f = 2; f <= 6; f++) {
        const e = botExpectedCount(game, botId, f, totalDice);
        if (e > best.exp) best = { face: f, qty: Math.max(1, Math.round(e)), exp: e };
    }
    best.qty = Math.min(Math.max(1, best.qty), totalDice);
    return best;
}

// Meilleure relance crédible (sinon null -> le bot criera au menteur)
function botBestRaise(game, botId, totalDice, bluffTol = -0.4) {
    const oq = game.currentBid.qty;
    const candidates = [];
    // Plage standard autour de la quantité courante
    for (let qty = oq; qty <= oq + 2 && qty <= totalDice; qty++) {
        for (let face = 1; face <= 6; face++) candidates.push([qty, face]);
    }
    // Conversions Pacos (sinon le bot ne sait pas passer aux Pacos ni en revenir)
    candidates.push([Math.ceil(oq / 2), 1]);                       // passer aux Pacos (moitié supérieure)
    for (let f = 2; f <= 6; f++) candidates.push([oq * 2, f]);      // quitter les Pacos vers une face : le double (règle maison)

    let best = null;
    for (const [qty, face] of candidates) {
        if (qty < 1 || qty > totalDice) continue;
        if (!isBidValid(game, qty, face)) continue;
        const exp = botExpectedCount(game, botId, face, totalDice);
        const comfort = exp - qty;                       // >= 0 : le bot y croit
        if (comfort >= bluffTol) {                        // tolérance = niveau de bluff (selon difficulté)
            const score = comfort - Math.max(0, qty - oq) * 0.15;
            if (!best || score > best.score) best = { qty, face, score };
        }
    }
    return best;
}

// Programme l'action du bot si c'est à lui de jouer
function maybeBotTurn(gameId) {
    const game = activeGames[gameId];
    if (!game || !game.started || game.resolving) return;
    const cur = game.players[game.turnIndex];
    if (!cur || !cur.isBot || cur.dice <= 0) return;
    if (game.botTimer) return;                                // déjà programmé
    const delay = 1100 + Math.floor(Math.random() * 1200);   // "réflexion" 1.1–2.3s
    game.botTimer = setTimeout(() => {
        game.botTimer = null;
        botAct(gameId);
    }, delay);
}

function botAct(gameId) {
    const game = activeGames[gameId];
    if (!game || !game.started || game.resolving) return;
    const bot = game.players[game.turnIndex];
    if (!bot || !bot.isBot || bot.dice <= 0) return;

    const bid = game.currentBid;
    const totalDice = game.players.reduce((s, p) => s + (p.dice > 0 ? p.dice : 0), 0);

    // Ouverture
    if (bid.qty === 0) {
        const o = botBestOpening(game, bot.id, totalDice);
        registerBid(game, gameId, bot, o.qty, o.face);
        return;
    }

    const d = BOT_DIFF[bot.diff] || BOT_DIFF.normal;
    const exp = botExpectedCount(game, bot.id, bid.face, totalDice);
    const margin = d.margin[0] + Math.random() * (d.margin[1] - d.margin[0]);   // méfiance selon difficulté
    const tooHigh = bid.qty > exp + margin;
    const raise = botBestRaise(game, bot.id, totalDice, d.bluff);

    if (tooHigh && Math.random() < d.dudoChance) {
        resolveChallenge(gameId, bot.id, false);       // la mise paraît gonflée -> Menteur
    } else if (raise) {
        registerBid(game, gameId, bot, raise.qty, raise.face);
    } else {
        resolveChallenge(gameId, bot.id, false);       // aucune relance crédible -> Menteur
    }
}

// Élimine définitivement un joueur d'une partie commencée
function eliminateFromGame(gameId, game, player) {
    if (!game || !player) return;
    if (player.dcTimer) { clearTimeout(player.dcTimer); player.dcTimer = null; }
    io.to(gameId).emit('game_log', `🚪 <b>${escapeHtml(player.pseudo)}</b> a quitté la partie.`);
    const wasItsTurn = game.players[game.turnIndex].id === player.id;
    player.dice = 0;
    delete game.hands[player.id];
    recordEliminations(game);

    const alive = game.players.filter(p => p.dice > 0);
    const winners = getWinners(game);
    if (winners) {
        endGame(gameId, winners);
    } else if (campaignHumanDead(game)) {
        endGame(gameId, game.players.filter(p => p.dice > 0));
    } else if (alive.length === 0) {
        clearTurnTimer(game);
        clearBotTimer(game);
        delete activeGames[gameId];
    } else {
        if (wasItsTurn) {
            if (game.players[game.turnIndex].dice <= 0) nextTurn(game);
            io.to(gameId).emit('turn_changed', game.players[game.turnIndex].id);
            if (!game.resolving) startTurnTimer(gameId);
        }
        io.to(gameId).emit('update_room_players', game.players);
    }
    io.emit('update_games', getPublicGames());
}

// Départ VOLONTAIRE (bouton Quitter) : retrait immédiat
function removePlayerFromGames(socketId) {
    for (const [gameId, game] of Object.entries(activeGames)) {
        const idx = game.players.findIndex(p => p.id === socketId);
        if (idx === -1) continue;
        const leaver = game.players[idx];

        if (!game.started) {
            game.players.splice(idx, 1);
            if (game.players.length === 0) {
                clearTurnTimer(game);
                delete activeGames[gameId];
            } else {
                if (game.host === socketId) game.host = game.players[0].id;
                io.to(gameId).emit('update_room_players', game.players);
            }
        } else {
            eliminateFromGame(gameId, game, leaver);
        }
    }
    io.emit('update_games', getPublicGames());
}

// DÉCONNEXION (fermeture onglet, coupure réseau) : on garde le siège un temps
function handleDisconnectFromGames(socketId) {
    for (const [gameId, game] of Object.entries(activeGames)) {
        const idx = game.players.findIndex(p => p.id === socketId);
        if (idx === -1) continue;
        const p = game.players[idx];

        if (!game.started) {
            // Simple lobby de table : retrait immédiat
            game.players.splice(idx, 1);
            if (game.players.length === 0) {
                clearTurnTimer(game);
                delete activeGames[gameId];
            } else {
                if (game.host === socketId) game.host = game.players[0].id;
                io.to(gameId).emit('update_room_players', game.players);
            }
        } else {
            // Partie en cours : un boucanier fantôme (bot) prend la barre, le siège reste réservable
            p.connected = false;
            if (!p.isBot) { p._wasHuman = true; p.isBot = true; p.diff = 'normal'; }
            io.to(gameId).emit('game_log', `🤖 <b>${escapeHtml(p.pseudo)}</b> s'est déconnecté — un boucanier fantôme prend la barre (retour possible 3 min).`);
            io.to(gameId).emit('update_room_players', game.players);
            // Si c'est son tour, on coupe le minuteur humain et on laisse le bot jouer
            if (game.players[game.turnIndex] && game.players[game.turnIndex].id === socketId) {
                clearTurnTimer(game);
                maybeBotTurn(gameId);
            }
            if (p.dcTimer) clearTimeout(p.dcTimer);
            p.dcTimer = setTimeout(() => {
                const g = activeGames[gameId];
                if (g) {
                    const still = g.players.find(pp => pp.id === socketId && pp.connected === false);
                    if (still) {
                        // 3 min écoulées : le bot reste à la barre et termine la partie (pas d'élimination brutale)
                        still.dcTimer = null;
                        io.to(gameId).emit('game_log', `🏴‍☠️ <b>${escapeHtml(still.pseudo)}</b> ne revient pas : le boucanier fantôme termine pour lui.`);
                    }
                }
            }, RECONNECT_GRACE_MS);
        }
    }
    io.emit('update_games', getPublicGames());
}

// Cherche une partie EN COURS contenant ce pseudo (pour la reconnexion)
function findGameByPseudo(pseudo) {
    for (const [gameId, game] of Object.entries(activeGames)) {
        if (!game.started) continue;
        const player = game.players.find(p => p.pseudo === pseudo && p.dice > 0);
        if (player) return { gameId, game, player };
    }
    return null;
}

function updateVoiceRoomList(roomId) {
    const clients = io.sockets.adapter.rooms.get(roomId) || new Set();
    const usersInRoom = [];
    for (const clientId of clients) {
        if (players[clientId]) {
            usersInRoom.push({ id: clientId, pseudo: players[clientId].pseudo, color: players[clientId].style.bgColor });
        }
    }
    io.to(roomId).emit('update_voice_users', usersInRoom);
    // Pour que TOUT le salon voie le point rouge du micro quand quelqu'un est en vocal
    if (roomId === 'voice-tavern') io.emit('lobby_voice_active', usersInRoom.length > 0);
}

// =====================================================================
//  SOCKETS
// =====================================================================
io.on('connection', (socket) => {

    socket.on('register', ({ pseudo, password }) => {
        pseudo = (pseudo || "").trim();
        if (isBanned(pseudo)) return socket.emit('auth_error', "Ce compte a été banni de la taverne.");
        if (!PSEUDO_REGEX.test(pseudo)) {
            return socket.emit('auth_error', "Nom invalide (3 à 16 caractères, lettres/chiffres uniquement).");
        }
        if (typeof password !== 'string' || password.length < 3) {
            return socket.emit('auth_error', "Mot de passe trop court (3 caractères minimum).");
        }
        if (registeredUsers[pseudo]) {
            return socket.emit('auth_error', "Ce nom de pirate est déjà pris ! Essaie de te connecter.");
        }
        registeredUsers[pseudo] = {
            pseudo,
            passwordHash: hashPassword(password),
            played: 0,
            wins: 0,
            achievements: [],
            title: '',
            stats: { dudosWon: 0, calzasWon: 0, diceLost: 0 },
            style: DEFAULT_STYLE
        };
        saveUsers(true);
        socket.emit('auth_success', { pseudo, style: DEFAULT_STYLE, profile: profilePayload(registeredUsers[pseudo]) });
        sendCampaignData(socket);
        io.emit('update_leaderboard', getLeaderboard());
    });

    socket.on('login', ({ pseudo, password }) => {
        pseudo = (pseudo || "").trim();
        if (isBanned(pseudo)) return socket.emit('auth_error', "Ce compte a été banni de la taverne.");
        const user = registeredUsers[pseudo];
        if (!user) return socket.emit('auth_error', "Ce pirate n'existe pas. Inscris-toi d'abord !");

        // Compatibilité : anciens comptes stockés en clair -> on migre vers un hash
        let ok = false;
        if (user.passwordHash) {
            ok = verifyPassword(password, user.passwordHash);
        } else if (typeof user.password === 'string') {
            ok = user.password === password;
            if (ok) {
                user.passwordHash = hashPassword(password);
                delete user.password;
                saveUsers();
            }
        }

        if (!ok) return socket.emit('auth_error', "Mauvais mot de passe, marin d'eau douce !");

        if (!user.style || !user.style.faceType) { user.style = DEFAULT_STYLE; saveUsers(); }
        ensureUserFields(user);
        socket.emit('auth_success', { pseudo: user.pseudo, style: user.style, profile: profilePayload(user) });
        sendCampaignData(socket);
    });

    socket.on('join_tavern', ({ pseudo, style }) => {
        const _u = registeredUsers[pseudo];
        if (_u) ensureUserFields(_u);
        players[socket.id] = { pseudo, style: style || DEFAULT_STYLE, title: titleOf(registeredUsers[pseudo]), avatar: _u ? _u.avatar : '', avatarImg: _u ? _u.avatarImg : '', nameColor: _u ? _u.nameColor : '', frame: _u ? _u.frame : '' };
        sendCampaignData(socket);

        // Reconnexion à une partie en cours pour ce pseudo ?
        const resume = findGameByPseudo(pseudo);
        if (resume) {
            const { gameId, game, player } = resume;
            const oldId = player.id;
            if (player.dcTimer) { clearTimeout(player.dcTimer); player.dcTimer = null; }
            if (oldId !== socket.id && game.hands[oldId]) {
                game.hands[socket.id] = game.hands[oldId];
                delete game.hands[oldId];
            }
            player.id = socket.id;
            player.connected = true;
            // Le boucanier fantôme rend la barre à l'humain
            if (player._wasHuman) { player.isBot = false; delete player._wasHuman; delete player.diff; }
            if (game.botTimer && game.players[game.turnIndex] && game.players[game.turnIndex].id === socket.id) {
                clearTimeout(game.botTimer); game.botTimer = null;
            }
            if (game.host === oldId) game.host = socket.id;
            socket.join(gameId);
            io.to(gameId).emit('game_log', `🔁 <b>${escapeHtml(pseudo)}</b> est de retour à la table !`);
            io.to(gameId).emit('update_room_players', game.players);
            socket.emit('resume_game', {
                gameId,
                isHost: game.host === socket.id,
                options: game.options,
                playersData: game.players.map(p => ({ id: p.id, pseudo: p.pseudo, dice: p.dice, style: p.style, team: p.team, ...cosmeticsOf(p) })),
                turnId: game.players[game.turnIndex].id,
                isPalifico: game.isPalifico,
                palificoFace: game.palificoFace || null,
                currentBid: game.currentBid,
                myHand: game.hands[socket.id] || [],
                resolving: game.resolving,
                mode: game.mode || 'solo'
            });
            // Duo : renvoyer la main de l'équipier
            if (game.mode === 'duo') {
                const mate = teammateOf(game, player);
                if (mate) {
                    socket.emit('teammate_hand', {
                        id: mate.id, pseudo: mate.pseudo, style: mate.style,
                        dice: mate.dice, hand: mate.dice > 0 ? (game.hands[mate.id] || []) : []
                    });
                }
            }
        }

        io.emit('update_players', Object.values(players));
        io.emit('update_games', getPublicGames());
        socket.emit('update_leaderboard', getLeaderboard());
        const u = registeredUsers[pseudo];
        if (u) socket.emit('profile_update', profilePayload(u));
    });

    socket.on('save_style', (newStyle) => {
        if (!players[socket.id] || !newStyle || typeof newStyle !== 'object') return;
        const pseudo = players[socket.id].pseudo;
        const user = registeredUsers[pseudo];
        if (user) ensureUserFields(user);

        // Anti-triche : un skin verrouillé doit être débloqué par les victoires
        if (newStyle.skinId && LOCKED_SKINS.includes(newStyle.skinId)) {
            if (!user || !ownsSkin(user, newStyle.skinId)) {
                return socket.emit('style_rejected', "Ce skin n'est pas encore débloqué.");
            }
        }

        // Image perso (face Paco) : on n'accepte qu'un data:image raisonnable
        if (newStyle.faceImage !== undefined) {
            const fi = newStyle.faceImage;
            const ok = typeof fi === 'string' && fi.indexOf('data:image/') === 0 && fi.length <= 60000;
            if (!ok) delete newStyle.faceImage;   // format inconnu ou trop lourd : on ignore
        }
        // La couleur de pseudo n'existe plus
        if (newStyle.nameColor !== undefined) delete newStyle.nameColor;
        // Éditeur avancé : on n'accepte que des couleurs hex valides (anti-injection CSS)
        const isHex = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
        ['bgColor', 'dotColor', 'bgColor2', 'glowColor'].forEach(k => { if (newStyle[k] !== undefined && !isHex(newStyle[k])) delete newStyle[k]; });
        newStyle.useGradient = !!newStyle.useGradient;

        players[socket.id].style = newStyle;
        if (user) {
            user.style = newStyle;
            saveUsers();
        }
        io.emit('update_players', Object.values(players));
    });

    // Équiper un titre de haut fait (sous le pseudo) ; '' = aucun
    socket.on('set_cosmetics', (c) => {
        if (!players[socket.id]) return;
        const user = registeredUsers[players[socket.id].pseudo];
        if (!user) return;
        ensureUserFields(user);
        const ok = (v) => (typeof v === 'string' && /^[a-z0-9_]{0,20}$/.test(v)) ? v : null;
        const okImg = (v) => (v === '') ? '' : ((typeof v === 'string' && v.length <= 90000 && /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(v)) ? v : null);
        const okHex = (v) => (v === '') ? '' : ((typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)) ? v : null);
        if (c && typeof c === 'object') {
            const a = ok(c.avatar), f = ok(c.frame), b = ok(c.banner);
            if (a !== null) user.avatar = a;
            if (f !== null) user.frame = f;
            if (b !== null) user.banner = b;
            if (c.avatarImg !== undefined) { const im = okImg(c.avatarImg); if (im !== null) user.avatarImg = im; }
            if (c.nameColor !== undefined) { const nc = okHex(c.nameColor); if (nc !== null) user.nameColor = nc; }
        }
        players[socket.id].avatar = user.avatar;
        players[socket.id].avatarImg = user.avatarImg;
        players[socket.id].nameColor = user.nameColor;
        players[socket.id].frame = user.frame;
        saveUsers(true);
        socket.emit('profile_update', profilePayload(user));
        io.emit('update_players', Object.values(players));
    });

    socket.on('set_title', (id) => {
        if (!players[socket.id]) return;
        const user = registeredUsers[players[socket.id].pseudo];
        if (!user) return;
        ensureUserFields(user);
        id = (typeof id === 'string') ? id : '';
        if (id !== '' && !user.achievements.includes(id)) {
            return socket.emit('title_rejected', "Tu n'as pas encore débloqué ce titre.");
        }
        user.title = id;
        saveUsers(true);
        players[socket.id].title = titleOf(user);
        socket.emit('profile_update', profilePayload(user));
        io.emit('update_players', Object.values(players));
    });

    // Émote rapide en partie -> diffusée à la table
    socket.on('send_emote', ({ gameId, emote }) => {
        if (!players[socket.id] || !gameId || !EMOTES[emote]) return;
        const game = activeGames[gameId];
        if (!game) return;
        const isPlayer = game.players.some(p => p.id === socket.id);
        const isSpectator = socket.spectating === gameId;
        if (!isPlayer && !isSpectator) return;
        io.to(gameId).emit('emote', { id: socket.id, pseudo: players[socket.id].pseudo, emote, emoji: EMOTES[emote] });
    });

    socket.on('send_message', (msg) => {
        if (players[socket.id] && typeof msg === 'string' && msg.trim()) {
            io.emit('chat_message', {
                sender: players[socket.id].pseudo,
                text: escapeHtml(msg.trim().slice(0, 300)),
                style: players[socket.id].style
            });
        }
    });

    socket.on('send_game_chat', ({ gameId, msg }) => {
        if (players[socket.id] && gameId && typeof msg === 'string' && msg.trim()) {
            io.to(gameId).emit('game_chat_message', {
                sender: players[socket.id].pseudo,
                text: escapeHtml(msg.trim().slice(0, 300)),
                style: players[socket.id].style
            });
        }
    });

    socket.on('create_game', (payload) => {
        if (!players[socket.id]) return;
        const mode = (payload && payload.mode === 'duo') ? 'duo' : 'solo';
        const gameId = 'Table-' + Math.floor(Math.random() * 1000);
        const options = { startDice: START_DICE, palifico: true, calza: true, maxPlayers: MAX_PLAYERS, autoTimer: false, mode };
        activeGames[gameId] = {
            id: gameId,
            host: socket.id,
            options,
            players: [{ id: socket.id, pseudo: players[socket.id].pseudo, style: players[socket.id].style, dice: options.startDice, hasBeenPalifico: false, connected: true }],
            started: false,
            turnIndex: 0,
            hands: {},
            currentBid: { qty: 0, face: 0, pseudo: "", style: DEFAULT_STYLE },
            isPalifico: false,
            resolving: false,
            turnTimer: null
        };
        socket.join(gameId);
        io.emit('update_games', getPublicGames());
        socket.emit('game_joined', gameId, true);
        socket.emit('game_options', options);
    });

    // Lancer une partie 1v1 contre le bot (IA) — démarrage immédiat
    socket.on('create_bot_game', () => {
        if (!players[socket.id]) return;
        const gameId = 'Solo-' + Math.floor(Math.random() * 100000);
        const options = { startDice: START_DICE, palifico: true, calza: true, maxPlayers: 2, autoTimer: false };
        const botId = 'BOT-' + Math.floor(Math.random() * 1000000);
        const botName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
        activeGames[gameId] = {
            id: gameId,
            host: socket.id,
            options,
            players: [
                { id: socket.id, pseudo: players[socket.id].pseudo, style: players[socket.id].style, dice: options.startDice, hasBeenPalifico: false, connected: true },
                { id: botId, pseudo: botName, style: BOT_STYLE, dice: options.startDice, hasBeenPalifico: false, connected: true, isBot: true }
            ],
            started: false,
            turnIndex: 0,
            hands: {},
            currentBid: { qty: 0, face: 0, pseudo: "", style: DEFAULT_STYLE },
            isPalifico: false,
            resolving: false,
            turnTimer: null,
            botTimer: null,
            vsBot: true,
            isBotGame: true
        };
        socket.join(gameId);
        socket.emit('game_joined', gameId, true);

        // Démarrage immédiat (pas d'attente d'autres joueurs)
        const game = activeGames[gameId];
        game.started = true;
        game.players.forEach(p => { p.dice = options.startDice; p.hasBeenPalifico = false; });
        game.palificoDone = {};
        game.eliminationOrder = [];
        game.humanCount = 1;
        const u = registeredUsers[players[socket.id].pseudo];
        if (u) { ensureUserFields(u); u.botGames += 1; saveUsers(); }   // entraînement : pas dans "Parties"
        io.emit('update_games', getPublicGames());
        io.to(gameId).emit('game_log', `🤖 Duel contre <b>${escapeHtml(botName)}</b> ! La partie commence.`);
        syncRewards(players[socket.id].pseudo);
        startRound(gameId);
    });

    // Lancer un niveau de CAMPAGNE (1+ bots de difficulté croissante) — démarrage immédiat
    socket.on('create_campaign_game', (level) => {
        if (!players[socket.id]) return;
        const lvl = parseInt(level, 10);
        const def = campaignLevelDef(lvl);
        if (!def) return socket.emit('start_rejected', "Niveau de campagne inconnu.");
        const u = registeredUsers[players[socket.id].pseudo];
        if (u) ensureUserFields(u);
        const progress = u ? u.campaignLevel : 0;
        if (lvl > progress + 1) return socket.emit('start_rejected', "Termine d'abord les niveaux précédents !");

        const gameId = 'Camp-' + Math.floor(Math.random() * 1000000);
        const mods = def.mods || [];
        const startDice = mods.includes('tempete') ? 4 : START_DICE;     // tempête : 4 dés
        const options = { startDice, palifico: true, calza: true, maxPlayers: def.bots.length + 1, autoTimer: false, mode: 'solo' };
        const botPlayers = def.bots.map((b, i) => ({
            id: 'BOT-' + Math.floor(Math.random() * 1000000) + '-' + i,
            pseudo: b.name, style: BOT_STYLE, dice: startDice,
            hasBeenPalifico: false, connected: true, isBot: true, diff: b.diff
        }));
        activeGames[gameId] = {
            id: gameId,
            host: socket.id,
            options,
            players: [
                { id: socket.id, pseudo: players[socket.id].pseudo, style: players[socket.id].style, dice: startDice, hasBeenPalifico: false, connected: true },
                ...botPlayers
            ],
            started: true,
            turnIndex: 0,
            hands: {},
            currentBid: { qty: 0, face: 0, pseudo: "", style: DEFAULT_STYLE },
            isPalifico: false, palificoFace: null,
            resolving: false, turnTimer: null, botTimer: null,
            vsBot: true, isBotGame: true,
            mode: 'solo',
            campaignLevel: lvl,
            campaignMods: mods,
            forcePalifico: mods.includes('malediction'),    // malédiction : palifico permanent
            fog: mods.includes('brouillard'),                // brouillard : un dé caché au joueur
            eliminationOrder: [], humanCount: 1
        };
        socket.join(gameId);
        socket.emit('game_joined', gameId, true);
        if (u) { u.botGames += 1; saveUsers(); }
        io.emit('update_games', getPublicGames());
        const advList = def.bots.map(b => escapeHtml(b.name)).join(', ');
        io.to(gameId).emit('game_log', `🗺️ Niveau ${lvl} — <b>${escapeHtml(def.name)}</b> : ${advList}. Que le meilleur gagne !`);
        syncRewards(players[socket.id].pseudo);
        startRound(gameId);
    });

    // ---- EXPÉDITION (roguelite) ----
    socket.on('run_data', () => { socket.emit('run_relics', RELICS); sendRun(players[socket.id] ? players[socket.id].pseudo : null); });

    socket.on('start_run', () => {
        if (!players[socket.id]) return;
        const pseudo = players[socket.id].pseudo;
        runs[pseudo] = { map: genRunMap(), posId: '0-1', relics: [], hp: 3, maxHp: 3, gameId: null, pending: null, seen: [] };
        sendRun(pseudo);
    });

    socket.on('abandon_run', () => {
        if (!players[socket.id]) return;
        delete runs[players[socket.id].pseudo];
        socket.emit('run_update', null);
    });

    socket.on('run_choose_node', (nodeId) => {
        if (!players[socket.id]) return;
        const pseudo = players[socket.id].pseudo;
        const run = runs[pseudo];
        if (!run || run.pending || run.gameId) return;
        if (!runReachable(run).includes(nodeId)) return;
        const node = findNode(run, nodeId);
        if (!node || node.done) return;

        if (node.kind === 'tresor') {
            const pool = COMBAT_RELICS.concat(['rhum']).filter(r => !run.relics.includes(r) || r === 'rhum');
            const opts = pickSome(pool, 3);
            run.pending = { type: 'relic', node: nodeId, options: opts };
            return sendRun(pseudo);
        }
        if (node.kind === 'repos') {
            run.hp = Math.min(run.maxHp, run.hp + 1);
            node.done = true; run.posId = node.id;
            emitToPseudo(pseudo, 'run_event', { kind: 'repos' });
            return sendRun(pseudo);
        }
        startRunCombat(socket, run, node);
    });

    socket.on('run_pick_relic', (relicId) => {
        if (!players[socket.id]) return;
        const pseudo = players[socket.id].pseudo;
        const run = runs[pseudo];
        if (!run || !run.pending || run.pending.type !== 'relic') return;
        if (!run.pending.options.includes(relicId)) return;
        const node = findNode(run, run.pending.node);
        if (relicId === 'rhum') run.hp = Math.min(run.maxHp, run.hp + 1);
        else if (!run.relics.includes(relicId)) run.relics.push(relicId);
        if (node) { node.done = true; run.posId = node.id; }
        run.pending = null;
        emitToPseudo(pseudo, 'run_event', { kind: 'relic', relic: relicId });
        sendRun(pseudo);
    });

    // ---- TOURNOIS ----
    socket.on('get_tournaments', () => socket.emit('tournaments_list', tournamentListPayload()));
    socket.on('get_leaderboard', (scope) => {
        const sc = (scope === 'week' || scope === 'month') ? scope : 'all';
        socket.emit('leaderboard_scoped', { scope: sc, list: getLeaderboard(50, sc) });
    });

    // --- Modération (admin) ---
    const adminOk = () => { const p = players[socket.id]; return p && isAdmin(p.pseudo); };
    socket.on('admin_state', () => {
        if (!adminOk()) return;
        const plist = Object.entries(players).map(([sid, p]) => ({ sid, pseudo: p.pseudo, admin: isAdmin(p.pseudo) }));
        const glist = Object.entries(activeGames).filter(([id, g]) => !g.vsBot).map(([id, g]) => ({ id, count: g.players.length, started: !!g.started }));
        socket.emit('admin_state', { players: plist, games: glist, banned: Object.keys(bannedPseudos) });
    });
    socket.on('admin_kick', (sid) => {
        if (!adminOk() || typeof sid !== 'string') return;
        const s = io.sockets.sockets.get(sid);
        if (s) { try { s.emit('force_logout', 'Tu as été expulsé par un modérateur.'); } catch (e) {} s.disconnect(true); }
    });
    socket.on('admin_ban', (pseudo) => {
        if (!adminOk() || typeof pseudo !== 'string' || isAdmin(pseudo)) return;
        bannedPseudos[pseudo] = true; saveBanned();
        for (const [sid, p] of Object.entries(players)) {
            if (p.pseudo === pseudo) { const s = io.sockets.sockets.get(sid); if (s) { try { s.emit('force_logout', 'Tu as été banni de la taverne.'); } catch (e) {} s.disconnect(true); } }
        }
        const plist = Object.entries(players).map(([sid, p]) => ({ sid, pseudo: p.pseudo, admin: isAdmin(p.pseudo) }));
        const glist = Object.entries(activeGames).filter(([id, g]) => !g.vsBot).map(([id, g]) => ({ id, count: g.players.length, started: !!g.started }));
        socket.emit('admin_state', { players: plist, games: glist, banned: Object.keys(bannedPseudos) });
    });
    socket.on('admin_unban', (pseudo) => {
        if (!adminOk() || typeof pseudo !== 'string') return;
        delete bannedPseudos[pseudo]; saveBanned();
        socket.emit('admin_state', { players: Object.entries(players).map(([sid, p]) => ({ sid, pseudo: p.pseudo, admin: isAdmin(p.pseudo) })), games: Object.entries(activeGames).filter(([id, g]) => !g.vsBot).map(([id, g]) => ({ id, count: g.players.length, started: !!g.started })), banned: Object.keys(bannedPseudos) });
    });

    // Gestion des comptes (admin)
    socket.on('admin_list_accounts', (q) => {
        if (!adminOk()) return;
        const query = (typeof q === 'string' ? q : '').toLowerCase().trim();
        const list = Object.values(registeredUsers)
            .filter(u => !query || u.pseudo.toLowerCase().includes(query))
            .sort((a, b) => (b.rankPoints || 0) - (a.rankPoints || 0))
            .slice(0, 60)
            .map(u => ({ pseudo: u.pseudo, wins: u.wins || 0, played: u.played || 0, rankPoints: u.rankPoints || 0, admin: isAdmin(u.pseudo), banned: isBanned(u.pseudo) }));
        socket.emit('admin_accounts', { query, list });
    });
    socket.on('admin_edit_stats', (d) => {
        if (!adminOk() || !d || typeof d.pseudo !== 'string') return;
        const u = registeredUsers[d.pseudo];
        if (!u) return socket.emit('admin_msg', "Compte introuvable.");
        ensureUserFields(u);
        const clamp = (v) => Math.max(0, Math.min(1000000, Math.round(Number(v) || 0)));
        if (d.wins !== undefined) u.wins = clamp(d.wins);
        if (d.played !== undefined) u.played = clamp(d.played);
        if (d.rankPoints !== undefined) u.rankPoints = clamp(d.rankPoints);
        if (u.wins > u.played) u.played = u.wins; // cohérence
        saveUsers(true);
        // si le joueur est en ligne, on lui pousse son profil à jour
        for (const [sid, p] of Object.entries(players)) {
            if (p.pseudo === d.pseudo) { const s = io.sockets.sockets.get(sid); if (s) s.emit('profile_update', profilePayload(u)); }
        }
        socket.emit('admin_msg', `Stats de ${d.pseudo} mises à jour.`);
    });
    socket.on('admin_reset_stats', (pseudo) => {
        if (!adminOk() || typeof pseudo !== 'string') return;
        const u = registeredUsers[pseudo];
        if (!u) return;
        u.wins = 0; u.played = 0; u.rankPoints = 0;
        if (u.stats) { for (const k of Object.keys(u.stats)) if (typeof u.stats[k] === 'number') u.stats[k] = 0; }
        if (u.periodic) u.periodic = {};
        saveUsers(true);
        for (const [sid, p] of Object.entries(players)) {
            if (p.pseudo === pseudo) { const s = io.sockets.sockets.get(sid); if (s) s.emit('profile_update', profilePayload(u)); }
        }
        socket.emit('admin_msg', `Stats de ${pseudo} réinitialisées.`);
    });
    socket.on('admin_delete_account', (pseudo) => {
        if (!adminOk() || typeof pseudo !== 'string') return;
        if (isAdmin(pseudo)) return socket.emit('admin_msg', "Impossible de supprimer un administrateur.");
        if (!registeredUsers[pseudo]) return socket.emit('admin_msg', "Compte introuvable.");
        delete registeredUsers[pseudo];
        saveUsers(true);
        for (const [sid, p] of Object.entries(players)) {
            if (p.pseudo === pseudo) { const s = io.sockets.sockets.get(sid); if (s) { try { s.emit('force_logout', 'Ton compte a été supprimé par un administrateur.'); } catch (e) {} s.disconnect(true); } }
        }
        socket.emit('admin_msg', `Compte ${pseudo} supprimé.`);
    });
    socket.on('get_profile', (pseudo) => {
        if (typeof pseudo !== 'string') return;
        const user = registeredUsers[pseudo];
        if (!user) return socket.emit('profile_view', null);
        ensureUserFields(user);
        socket.emit('profile_view', Object.assign(publicStats(user), {
            position: getPlayerPosition(user.pseudo),
            totalPlayers: Object.keys(registeredUsers).length,
            equippedTitle: user.title || '',
            style: user.style || null,
            tourneyWins: user.tourneyWins || 0
        }));
    });
    socket.on('get_tournament', (id) => { const t = tournaments[id]; if (t) socket.emit('tournament_update', tournamentState(t)); });

    socket.on('create_tournament', (payload) => {
        if (!players[socket.id]) return;
        const pseudo = players[socket.id].pseudo;
        const isObj = payload && typeof payload === 'object';
        const name = isObj ? payload.name : payload;
        const cfg = {
            groupSize: (isObj && (payload.groupSize === 3 || payload.groupSize === 4)) ? payload.groupSize : 4,
            qualifiers: (isObj && (payload.qualifiers === 1 || payload.qualifiers === 2)) ? payload.qualifiers : 2,
            thirdPlace: isObj ? (payload.thirdPlace !== false) : true,
            elim: (isObj && payload.elim === 'double') ? 'double' : 'single'
        };
        const id = 'T' + (++TID);
        tournaments[id] = {
            id, name: (typeof name === 'string' && name.trim()) ? name.trim().slice(0, 30) : 'Tournoi de ' + pseudo,
            hostPseudo: pseudo, status: 'lobby', players: [pseudo], config: cfg,
            matches: {}, stage: null, groups: null, groupMatchIds: [], groupRounds: null, groupRoundIdx: 0,
            bracket: null, koRoundIdx: 0, qualifiers: [], champion: null, thirdMatchId: null, third: null,
            roundLabels: [], de: null, second: null
        };
        socket.emit('tournament_update', tournamentState(tournaments[id]));
        io.emit('tournaments_list', tournamentListPayload());
    });

    socket.on('join_tournament', (id) => {
        if (!players[socket.id]) return;
        const t = tournaments[id]; if (!t || t.status !== 'lobby') return;
        const pseudo = players[socket.id].pseudo;
        if (t.players.length >= 32) return socket.emit('tournament_msg', 'Tournoi complet (32 max).');
        if (!t.players.includes(pseudo)) t.players.push(pseudo);
        broadcastTournament(t);
        socket.emit('tournament_update', tournamentState(t));
    });

    socket.on('leave_tournament', (id) => {
        if (!players[socket.id]) return;
        const t = tournaments[id]; if (!t) return;
        const pseudo = players[socket.id].pseudo;
        if (t.status === 'lobby') {
            t.players = t.players.filter(p => p !== pseudo);
            if (t.hostPseudo === pseudo) t.hostPseudo = t.players[0] || pseudo;
            if (t.players.length === 0) { delete tournaments[id]; io.emit('tournaments_list', tournamentListPayload()); return; }
            broadcastTournament(t);
        }
        socket.emit('tournaments_list', tournamentListPayload());
    });

    socket.on('start_tournament', (id) => {
        if (!players[socket.id]) return;
        const t = tournaments[id]; if (!t || t.status !== 'lobby') return;
        if (players[socket.id].pseudo !== t.hostPseudo) return socket.emit('tournament_msg', "Seul l'organisateur peut lancer.");
        if (t.players.length < 3) return socket.emit('tournament_msg', 'Il faut au moins 3 joueurs.');
        t.status = 'running';
        const groups = makeGroups(t.players, t.config ? t.config.groupSize : 4);
        if (groups) {
            t.groups = groups; t.stage = 'group';
            t.groupMatchIds = groups.map(() => []);
            const all = [];
            groups.forEach((g, gi) => {
                const ps = g.players;
                for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
                    const m = mkMatch(ps[i], ps[j], 'group', gi);
                    t.matches[m.id] = m; t.groupMatchIds[gi].push(m.id); all.push(m);
                }
            });
            t.groupRounds = packRounds(all).map(round => round.map(m => m.id));
            t.groupRoundIdx = 0;
            startTournamentRoundMatches(t);
        } else {
            t.stage = 'ko';
            if (t.config && t.config.elim === 'double') { deStart(t, t.players.slice()); return; }
            const ms = buildBracketRound(t.players.slice());
            ms.forEach(m => t.matches[m.id] = m);
            t.bracket = [ms.map(m => m.id)]; t.koRoundIdx = 0;
            resolveByes(t, t.bracket[0]);
            startTournamentRoundMatches(t);
        }
    });

    function findTournamentByCurrentMatch(matchId) {
        return Object.values(tournaments).find(tt => tt.status === 'running' && tournamentCurrentRound(tt).includes(matchId));
    }
    socket.on('join_tournament_match', (matchId) => {
        if (!players[socket.id]) return;
        const pseudo = players[socket.id].pseudo;
        const t = findTournamentByCurrentMatch(matchId);
        if (!t) return;
        const match = t.matches[matchId];
        if (!match || match.done) return;
        if (pseudo !== match.a && pseudo !== match.b) return socket.emit('tournament_msg', "Ce match n'est pas le tien — tu peux le regarder.");
        tournamentPlayerJoinMatch(t, match, socket);
    });
    socket.on('spectate_tournament_match', (matchId) => {
        if (!players[socket.id]) return;
        const t = findTournamentByCurrentMatch(matchId);
        if (!t) return;
        const match = t.matches[matchId];
        if (!match) return;
        if (!match.gameId || !activeGames[match.gameId]) return socket.emit('tournament_msg', "Le match n'a pas encore commencé.");
        const game = activeGames[match.gameId];
        if (game.players.some(p => p.id === socket.id)) return;   // un joueur du match ne se regarde pas
        socket.join(match.gameId);
        socket.spectating = match.gameId;
        socket.spectatingTournament = t.id;
        const totalDice = game.players.reduce((s, p) => s + (p.dice > 0 ? p.dice : 0), 0);
        socket.emit('spectate_joined', {
            gameId: match.gameId, tournamentId: t.id,
            playersData: game.players.map(p => ({ id: p.id, pseudo: p.pseudo, dice: p.dice, style: p.style })),
            currentBid: game.currentBid,
            turnId: game.players[game.turnIndex] ? game.players[game.turnIndex].id : null,
            isPalifico: game.isPalifico, palificoFace: game.palificoFace || null, totalDice
        });
    });

    socket.on('claim_tournament_match', (matchId) => {
        if (!players[socket.id]) return;
        const pseudo = players[socket.id].pseudo;
        const t = findTournamentByCurrentMatch(matchId);
        if (!t) return;
        const match = t.matches[matchId];
        if (!match || match.done || match.gameId) return;                         // match déjà lancé/terminé
        if (pseudo !== match.a && pseudo !== match.b) return;
        const opp = (pseudo === match.a) ? match.b : match.a;
        if (opp && match.joined && match.joined[opp] && players[match.joined[opp]]) // l'adversaire est là : pas de forfait
            return socket.emit('tournament_msg', "L'adversaire est présent, le match peut démarrer.");
        if (!match.waitingSince || Date.now() - match.waitingSince < TOURNEY_CLAIM_MS)
            return socket.emit('tournament_msg', 'Patiente encore un peu avant de réclamer la victoire.');
        match.winner = pseudo; match.done = true; match.gameId = null;
        emitToPseudo(pseudo, 'tournament_msg', 'Victoire par forfait : ton adversaire ne s\'est pas présenté.');
        tournamentCheckRound(t);
    });

    // L'hôte règle les options AVANT le lancement
    socket.on('set_game_options', ({ gameId, options }) => {
        const game = activeGames[gameId];
        if (!game || game.started || game.host !== socket.id || !options) return;
        const o = game.options;
        if (Number.isInteger(options.startDice)) o.startDice = Math.min(6, Math.max(1, options.startDice));
        if (typeof options.palifico === 'boolean') o.palifico = options.palifico;
        if (typeof options.calza === 'boolean') o.calza = options.calza;
        if (typeof options.autoTimer === 'boolean') o.autoTimer = options.autoTimer;
        if (options.mode === 'solo' || options.mode === 'duo') o.mode = options.mode;
        if (typeof options.firstPlayer === 'string') o.firstPlayer = options.firstPlayer.slice(0, 24);
        if (Number.isInteger(options.maxPlayers)) o.maxPlayers = Math.min(MAX_PLAYERS, Math.max(game.players.length, Math.max(2, options.maxPlayers)));
        // Les joueurs déjà en lobby reçoivent le bon nombre de dés à l'écran
        game.players.forEach(p => { p.dice = o.startDice; });
        io.to(gameId).emit('game_options', o);
        io.to(gameId).emit('update_room_players', game.players);
        io.emit('update_games', getPublicGames());
    });

    // Composition des équipes en duo : l'hôte envoie l'ordre des joueurs (paires consécutives)
    socket.on('set_team_order', ({ gameId, order }) => {
        const game = activeGames[gameId];
        if (!game || game.started || game.host !== socket.id || !Array.isArray(order)) return;
        const current = game.players.map(p => p.pseudo);
        // validation : même ensemble de pseudos (permutation valide)
        if (order.length !== current.length) return;
        const set = new Set(order);
        if (set.size !== current.length) return;
        for (const ps of current) if (!set.has(ps)) return;
        game.teamOrder = order;
        io.to(gameId).emit('team_order', game.teamOrder);
    });

    socket.on('join_game', (gameId) => {
        const game = activeGames[gameId];
        if (!game || game.started || !players[socket.id]) return;
        const cap = (game.options && game.options.maxPlayers) || MAX_PLAYERS;
        if (game.players.length >= cap) return;
        if (game.players.some(p => p.id === socket.id)) return;

        const startDice = (game.options && game.options.startDice) || START_DICE;
        game.players.push({ id: socket.id, pseudo: players[socket.id].pseudo, style: players[socket.id].style, dice: startDice, hasBeenPalifico: false, connected: true });
        socket.join(gameId);
        io.emit('update_games', getPublicGames());
        socket.emit('game_joined', gameId, false);
        socket.emit('game_options', game.options);
        io.to(gameId).emit('game_log', `🏴‍☠️ <b>${escapeHtml(players[socket.id].pseudo)}</b> a rejoint la table !`);
        io.to(gameId).emit('update_room_players', game.players);
    });

    socket.on('leave_game', (gameId) => {
        removePlayerFromGames(socket.id);
        socket.leave(gameId);
    });

    // ----- MODE SPECTATEUR -----
    socket.on('spectate_game', (gameId) => {
        const game = activeGames[gameId];
        if (!game || !game.started || game.vsBot || !players[socket.id]) return;
        if (game.players.some(p => p.id === socket.id)) return;   // un joueur ne se regarde pas
        socket.join(gameId);
        socket.spectating = gameId;
        const totalDice = game.players.reduce((s, p) => s + (p.dice > 0 ? p.dice : 0), 0);
        socket.emit('spectate_joined', {
            gameId,
            playersData: game.players.map(p => ({ id: p.id, pseudo: p.pseudo, dice: p.dice, style: p.style })),
            currentBid: game.currentBid,
            turnId: game.players[game.turnIndex] ? game.players[game.turnIndex].id : null,
            isPalifico: game.isPalifico,
            palificoFace: game.palificoFace || null,
            totalDice
        });
    });

    socket.on('leave_spectate', (gameId) => {
        if (gameId) socket.leave(gameId);
        socket.spectating = null;
    });

    // Réactions flottantes (spectateurs ET joueurs) diffusées à toute la table
    socket.on('send_reaction', (payload) => {
        const gameId = payload && payload.gameId;
        const emoji = payload && payload.emoji;
        const ALLOWED = ['👏', '😂', '😮', '🔥', '💀', '❤️', '🎲', '🏴‍☠️'];
        if (!gameId || !ALLOWED.includes(emoji)) return;
        if (!socket.rooms.has(gameId)) return;        // doit être dans la table (joueur ou spectateur)
        if (socket._lastReact && Date.now() - socket._lastReact < 350) return;  // anti-spam léger
        socket._lastReact = Date.now();
        const pseudo = players[socket.id] ? players[socket.id].pseudo : '?';
        io.to(gameId).emit('reaction', { emoji, pseudo });
    });

    socket.on('start_game', (gameId) => {
        const game = activeGames[gameId];
        if (game && game.host === socket.id && !game.started && game.players.length > 1) {
            const isDuo = game.options && game.options.mode === 'duo';
            // Mode duo : nombre PAIR, minimum 4 (équipes de 2)
            if (isDuo && (game.players.length < 4 || game.players.length % 2 !== 0)) {
                socket.emit('start_rejected', "Le mode duo demande un nombre PAIR de joueurs (minimum 4).");
                return;
            }
            game.started = true;
            game.mode = isDuo ? 'duo' : 'solo';
            // Duo : on réordonne les joueurs selon l'ordre choisi par l'hôte (paires consécutives)
            if (isDuo) {
                let order = game.players.map(p => p.pseudo);
                if (Array.isArray(game.teamOrder) && game.teamOrder.length) {
                    const known = game.teamOrder.filter(ps => order.includes(ps));
                    order.forEach(ps => { if (!known.includes(ps)) known.push(ps); });
                    order = known;
                }
                const byPseudo = {};
                game.players.forEach(p => { byPseudo[p.pseudo] = p; });
                const reordered = order.map(ps => byPseudo[ps]).filter(Boolean);
                if (reordered.length === game.players.length) game.players = reordered;
            }
            // On fige le nombre de dés de départ selon les options
            const startDice = (game.options && game.options.startDice) || START_DICE;
            game.players.forEach((p, i) => {
                p.dice = startDice;
                p.hasBeenPalifico = false;
                p.team = isDuo ? Math.floor(i / 2) : null;   // duo : équipes de 2 (paires de l'ordre)
            });
            // Duo : on ENTRELACE l'ordre de tour entre les équipes
            // (Éq.1 J1 -> Éq.2 J1 -> Éq.3 J1 -> Éq.1 J2 -> Éq.2 J2 ...) au lieu de J1,J2 d'affilée
            if (isDuo) {
                const teams = [];
                game.players.forEach(p => { (teams[p.team] = teams[p.team] || []).push(p); });
                const interleaved = [];
                const maxLen = Math.max(...teams.map(t => t ? t.length : 0));
                for (let r = 0; r < maxLen; r++) {
                    for (let t = 0; t < teams.length; t++) {
                        if (teams[t] && teams[t][r]) interleaved.push(teams[t][r]);
                    }
                }
                if (interleaved.length === game.players.length) game.players = interleaved;
            }
            game.palificoDone = {};
            io.emit('update_games', getPublicGames());
            io.to(gameId).emit('game_log', isDuo ? `🎲 Partie en DUO ! Les équipes sont formées.` : `🎲 La partie commence !`);

            // --- Suivi pour le classement ---
            game.eliminationOrder = [];
            game.isBotGame = game.players.some(p => p.isBot);
            const humans = game.players.filter(p => !p.isBot);
            game.humanCount = humans.length;
            const multi = game.humanCount >= 3;

            humans.forEach(p => {
                const u = registeredUsers[p.pseudo];
                if (!u) return;
                ensureUserFields(u);
                u.played += 1;
                if (game.isBotGame) u.botGames += 1;
                else if (game.humanCount === 2) u.played1v1 += 1;
                else if (multi) u.playedMulti += 1;
            });
            saveUsers();
            io.emit('update_leaderboard', getLeaderboard());
            game.players.forEach(p => { if (!p.isBot) syncRewards(p.pseudo); });

            // Premier joueur : aléatoire par défaut, ou imposé par les réglages de la table
            const firstChoice = game.options && game.options.firstPlayer;
            if (firstChoice && firstChoice !== 'random') {
                const idx = game.players.findIndex(p => p.pseudo === firstChoice && p.dice > 0);
                game.turnIndex = idx >= 0 ? idx : Math.floor(Math.random() * game.players.length);
            } else {
                game.turnIndex = Math.floor(Math.random() * game.players.length);
            }
            const starter = game.players[game.turnIndex];
            if (starter) io.to(gameId).emit('game_log', `🎲 ${starter.pseudo} commence !`);

            startRound(gameId);
        }
    });

    socket.on('make_bid', (data) => {
        if (!data || !players[socket.id]) return;
        const { gameId, qty, face } = data;
        const game = activeGames[gameId];
        if (!game || game.resolving || game.players[game.turnIndex].id !== socket.id) return;

        // VALIDATION SERVEUR (on ne fait plus confiance au client)
        if (!isBidValid(game, qty, face)) {
            return socket.emit('bid_rejected', "Enchère invalide selon les règles.");
        }

        registerBid(game, gameId, players[socket.id], qty, face);
    });

    socket.on('call_dudo', (gameId) => resolveChallenge(gameId, socket.id, false));
    socket.on('call_calza', (gameId) => {
        const game = activeGames[gameId];
        if (game && game.options && game.options.calza === false) {
            return socket.emit('bid_rejected', "Le Calza est désactivé sur cette table.");
        }
        resolveChallenge(gameId, socket.id, true);
    });

    // ----- VOCAL WEBRTC (signaling uniquement) -----
    socket.on('join_voice', (room) => {
        const voiceRoomId = 'voice-' + room;
        socket.join(voiceRoomId);
        socket.voiceRoom = voiceRoomId;
        socket.to(voiceRoomId).emit('voice_user_joined', socket.id);
        updateVoiceRoomList(voiceRoomId);
    });

    socket.on('leave_voice', () => {
        if (socket.voiceRoom) {
            const room = socket.voiceRoom;
            socket.to(room).emit('voice_user_left', socket.id);
            socket.leave(room);
            socket.voiceRoom = null;
            updateVoiceRoomList(room);
        }
    });

    socket.on('webrtc_offer', ({ target, offer }) => { io.to(target).emit('webrtc_offer', { sender: socket.id, offer }); });
    socket.on('webrtc_answer', ({ target, answer }) => { io.to(target).emit('webrtc_answer', { sender: socket.id, answer }); });
    socket.on('webrtc_ice_candidate', ({ target, candidate }) => { io.to(target).emit('webrtc_ice_candidate', { sender: socket.id, candidate }); });

    socket.on('disconnect', () => {
        if (socket.voiceRoom) {
            const room = socket.voiceRoom;
            socket.to(room).emit('voice_user_left', socket.id);
            setTimeout(() => updateVoiceRoomList(room), 100);
        }
        handleDisconnectFromGames(socket.id); // garde le siège 60s pour la reconnexion
        delete players[socket.id];
        io.emit('update_players', Object.values(players));
    });
});

const PORT = process.env.PORT || 3000;
loadUsers();

}; // ===== fin attachPerudo =====