// =====================================================================
//  PERUDO — branché sur le serveur du salon (app + io partagés).
//
//  Réécriture complète. L'ancienne version (13 000 lignes) vit dans
//  `_archive/perudo-v1/` : elle portait, en plus du jeu, un système de
//  comptes séparé, des tournois, une campagne façon roguelike, la voix
//  WebRTC, une taverne, des émotes et des cosmétiques. Tout cela est mis
//  de côté pour être réutilisé ailleurs — voir le README de l'archive.
//
//  Ce qui change, et pourquoi :
//
//  · PLUS DE COMPTE SÉPARÉ. Perudo tenait ses propres profils dans une clé
//    Redis `users`, à côté des trente-deux comptes du salon. Deux systèmes
//    d'identité pour un seul groupe de joueurs, avec des pseudos qui
//    pouvaient diverger. L'identité vient désormais du cookie signé du
//    portail, comme pour tous les autres jeux.
//  · LES STATISTIQUES rejoignent le cache commun (`perudo:stats:<pseudo>`)
//    et ressortent donc au profil, au classement du Salon et aux titres.
//  · UN SEUL PANNEAU DE RÉGLAGES à la création, qui rassemble tout ce que
//    le jeu sait faire.
//
//  ⚠️ LES RÈGLES SONT CELLES DE LA MAISON, pas celles du Perudo standard.
//  Elles ont été reprises à l'identique de l'ancienne version, parce que
//  c'est à ça que le salon joue depuis des années :
//    · on n'ouvre jamais sur les Pacos (les 1) ;
//    · passer aux Pacos coûte la moitié supérieure de la mise en cours ;
//    · en revenir coûte le double ;
//    · une enchère déjà posée dans la manche ne peut pas être rejouée
//      (anti-boucle) ;
//    · le palifico se redéclenche CHAQUE FOIS qu'un joueur retombe à un
//      dé, la face se verrouille à la première mise, et les Pacos n'y sont
//      pas jokers.
// =====================================================================
const crypto = require('crypto');

module.exports = function attachPerudo(app, io, store) {

const mfGet = store && store.get ? store.get : () => undefined;
const mfSet = store && store.set ? store.set : () => {};

const MAX_PLAYERS = 12;
const MIN_PLAYERS = 1;               // seul contre des bots
const START_DICE = 5;
const REVEAL_MS = 2600;              // temps de lecture des mains révélées
const TOUR_MAX_MS = 60000;           // minuteur de tour, si l'hôte l'active

const STATS_INDEX = 'perudo:statsIndex';
const kStats = (pseudo) => `perudo:stats:${pseudo}`;

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
    return String(data.u);
}

app.get('/perudo/healthz', (req, res) => res.status(200).json({ ok: true, t: Date.now(), games: Object.keys(games).length }));

// =====================================================================
//  LES TABLES
// =====================================================================
const games = {};             // id -> partie
const socketGame = {};        // sid -> id de table
let nextId = 1;

const roomOf = (g) => 'perudo:' + g.id;
const vivants = (g) => g.players.filter(p => p.dice > 0);
const present = (p) => p.connected && !p.isBot;

const NOMS_BOTS = ['Barbe-Rousse', 'La Buse', 'Mary Read', 'Le Borgne', 'Anne Bonny',
                   'Jambe-de-Bois', 'Œil-de-Verre', 'La Fouine', 'Crochet', 'Surcouf'];
// Le bluff toléré : plus c'est bas, plus le bot exige d'y croire avant de
// relancer. C'est le seul réglage qui sépare les trois niveaux — un bot
// « téméraire » ment simplement plus souvent.
const TOLERANCE = { prudent: -0.15, normal: -0.45, temeraire: -0.9 };

function optionsParDefaut() {
    return {
        startDice: START_DICE,
        palifico: true,
        calza: true,
        minuteur: false,
        mode: 'chacun',            // 'chacun' | 'equipes'
        maxPlayers: MAX_PLAYERS,
        bots: 0,
        niveauBots: 'normal',
    };
}

function nettoyerOptions(o, actuelles, nbJoueurs) {
    const out = { ...actuelles };
    if (Number.isInteger(o.startDice)) out.startDice = Math.min(6, Math.max(1, o.startDice));
    if (typeof o.palifico === 'boolean') out.palifico = o.palifico;
    if (typeof o.calza === 'boolean') out.calza = o.calza;
    if (typeof o.minuteur === 'boolean') out.minuteur = o.minuteur;
    if (o.mode === 'chacun' || o.mode === 'equipes') out.mode = o.mode;
    if (Number.isInteger(o.maxPlayers)) out.maxPlayers = Math.min(MAX_PLAYERS, Math.max(Math.max(2, nbJoueurs), o.maxPlayers));
    if (Number.isInteger(o.bots)) out.bots = Math.min(MAX_PLAYERS - 1, Math.max(0, o.bots));
    if (TOLERANCE[o.niveauBots]) out.niveauBots = o.niveauBots;
    return out;
}

// =====================================================================
//  LES STATISTIQUES
//  Dans le cache commun, indexées par pseudo brut — comme l'Infiltré et
//  le quiz des drapeaux. Voir CLAUDE.md pour les six endroits où elles
//  doivent ressortir.
// =====================================================================
function ficheVierge() {
    return {
        parties: 0, victoires: 0, deuxiemes: 0,
        partiesSolo: 0, victoiresSolo: 0,          // contre des bots : hors palmarès
        manches: 0, desPerdus: 0,
        dudosGagnes: 0, calzasGagnes: 0,
        defisLances: 0, defisGagnes: 0,
        bluffsSurvecus: 0, eliminations: 0, eliminePar: {},
        serie: 0, meilleureSerie: 0,
        facesMisees: [0, 0, 0, 0, 0, 0, 0],
    };
}
function lireFiche(pseudo) {
    const f = mfGet(kStats(pseudo));
    return f && typeof f === 'object' ? { ...ficheVierge(), ...f } : ficheVierge();
}
function ecrireFiche(pseudo, f) {
    mfSet(kStats(pseudo), f);
    const idx = mfGet(STATS_INDEX) || [];
    if (!idx.includes(pseudo)) mfSet(STATS_INDEX, [...idx, pseudo]);
}
function majFiche(pseudo, fn) {
    if (!pseudo) return;
    const f = lireFiche(pseudo);
    fn(f);
    ecrireFiche(pseudo, f);
}

// =====================================================================
//  LES RÈGLES
// =====================================================================
function lancer(n) {
    return Array.from({ length: n }, () => Math.floor(Math.random() * 6) + 1).sort();
}

// Combien de dés de cette face sur la table. Hors palifico, les Pacos (1)
// sont jokers pour toutes les autres faces.
function compter(g, face) {
    let total = 0;
    for (const p of g.players) {
        if (p.dice <= 0) continue;
        const main = g.hands[p.id] || [];
        total += main.filter(d => d === face).length;
        if (!g.isPalifico && face !== 1) total += main.filter(d => d === 1).length;
    }
    return total;
}

function totalDesEnJeu(g) {
    return g.players.reduce((s, p) => s + (p.dice > 0 ? p.dice : 0), 0);
}

// ⚠️ Reprise à l'identique de l'ancienne version : ce sont les règles de la
// maison, et les changer changerait le jeu auquel le salon joue.
function enchereValide(g, qty, face) {
    if (!Number.isInteger(qty) || !Number.isInteger(face)) return false;
    if (face < 1 || face > 6) return false;
    if (qty < 1) return false;
    if (qty > totalDesEnJeu(g)) return false;

    const oq = g.currentBid.qty;
    const of = g.currentBid.face;

    // Anti-boucle : une enchère déjà posée cette manche ne se rejoue pas.
    if (oq !== 0 && Array.isArray(g.bidHistory) && g.bidHistory.some(b => b.qty === qty && b.face === face)) return false;

    // Ouverture : jamais sur les Pacos.
    if (oq === 0) return face !== 1;

    if (g.isPalifico) {
        const verrou = g.palificoFace || (of !== 1 ? of : null);
        if (of === 1) {
            if (face === 1) return qty > oq;
            if (verrou && face === verrou) return qty >= oq * 2;
            return false;
        }
        if (face === of) return qty > oq;
        if (face === 1) return qty >= Math.ceil(oq / 2);
        return false;
    }

    if (of !== 1) {
        if (face === 1) return qty >= Math.ceil(oq / 2);
        return qty > oq || (qty === oq && face > of);
    }
    if (face === 1) return qty > oq;
    return qty >= oq * 2;
}

// Pour chaque face, la plus petite quantité qu'on ait le droit d'annoncer —
// ou null si cette face est interdite dans l'état courant (palifico, par
// exemple, en verrouille cinq sur six).
function minimaParFace(g) {
    const total = totalDesEnJeu(g);
    const out = [null, null, null, null, null, null, null];
    for (let face = 1; face <= 6; face++) {
        for (let qty = 1; qty <= total; qty++) {
            if (enchereValide(g, qty, face)) { out[face] = qty; break; }
        }
    }
    return out;
}

function joueurSuivant(g) {
    let tours = 0;
    do {
        g.turnIndex = (g.turnIndex + 1) % g.players.length;
    } while (g.players[g.turnIndex].dice <= 0 && ++tours < g.players.length * 2);
}

// =====================================================================
//  L'ÉTAT ENVOYÉ AU CLIENT
//  ⚠️ Les mains ne partent JAMAIS en bloc : chacun ne reçoit que la
//  sienne, sauf à la révélation. C'est tout le jeu.
// =====================================================================
function vueJoueurs(g) {
    return g.players.map((p, i) => ({
        pseudo: p.pseudo, dice: p.dice, connected: p.connected, isBot: !!p.isBot,
        team: p.team ?? null, place: i,
    }));
}
function etatPour(g, pseudo) {
    const moi = g.players.find(p => p.pseudo === pseudo);
    const courant = g.players[g.turnIndex];
    return {
        id: g.id, host: g.host, status: g.status, options: g.options,
        players: vueJoueurs(g),
        spectators: (g.spectators || []).map(s => s.pseudo),
        turnPseudo: courant ? courant.pseudo : null,
        currentBid: g.currentBid,
        isPalifico: !!g.isPalifico, palificoFace: g.palificoFace || null,
        manche: g.manche || 0,
        journal: (g.journal || []).slice(-6),
        maMain: moi && moi.dice > 0 ? (g.hands[moi.id] || []) : [],
        // La plus petite enchère valable sur chaque face, calculée par le
        // SERVEUR. Le client s'en sert pour n'offrir que des coups légaux :
        // les règles de la maison sont trop particulières pour être
        // réécrites côté navigateur, et deux implémentations finiraient par
        // diverger — c'est exactement ce qu'on veut éviter sur des règles
        // que personne ne connaît par cœur.
        minParFace: courant && moi && courant.pseudo === moi.pseudo ? minimaParFace(g) : null,
        jeSuisSpectateur: !moi,
        mainsRevelees: g.revele || null,
        fin: g.fin || null,
        minuteurFin: g.tourFin || 0,
    };
}
function diffuser(g) {
    for (const p of g.players) {
        if (p.isBot || !p.id) continue;
        io.to(p.id).emit('perudo_state', etatPour(g, p.pseudo));
    }
    for (const s of (g.spectators || [])) io.to(s.id).emit('perudo_state', etatPour(g, s.pseudo));
}
function noter(g, texte) {
    g.journal = g.journal || [];
    g.journal.push(texte);
    if (g.journal.length > 40) g.journal.shift();
}

function partiesPubliques() {
    return Object.values(games).map(g => ({
        id: g.id, host: g.host, status: g.status, creeA: g.creeA || 0,
        vsBot: g.players.some(p => p.isBot) && g.players.filter(p => !p.isBot).length <= 1,
        options: g.options,
        players: g.players.filter(p => !p.isBot).map(p => p.pseudo),
        presents: g.players.filter(present).map(p => p.pseudo),
        bots: g.players.filter(p => p.isBot).length,
        spectators: (g.spectators || []).length,
    }));
}
function diffuserHall() { io.emit('perudo_games', partiesPubliques()); }

// =====================================================================
//  LE MINUTEUR DE TOUR
//  Facultatif, activé dans les réglages. Il ne joue pas à la place du
//  joueur : il crie « menteur » pour lui, ce qui est l'action la moins
//  engageante — relancer à sa place changerait la partie.
// =====================================================================
function desarmerMinuteur(g) {
    if (g.tourTimer) { clearTimeout(g.tourTimer); g.tourTimer = null; }
    g.tourFin = 0;
}
function armerMinuteur(g) {
    desarmerMinuteur(g);
    if (!g.options.minuteur || g.status !== 'playing') return;
    const courant = g.players[g.turnIndex];
    if (!courant || courant.isBot) return;
    g.tourFin = Date.now() + TOUR_MAX_MS;
    g.tourTimer = setTimeout(() => {
        const encore = games[g.id];
        if (!encore || encore.status !== 'playing') return;
        const c = encore.players[encore.turnIndex];
        if (!c || c.isBot) return;
        if (encore.currentBid.qty === 0) {
            // Personne n'a encore misé : on ne peut pas contester, on ouvre
            // à sa place au minimum, puis on passe.
            noter(encore, `${c.pseudo} a laissé filer son tour.`);
            joueurSuivant(encore);
            diffuser(encore); armerMinuteur(encore); peutEtreUnBot(encore);
        } else {
            noter(encore, `${c.pseudo} n'a pas répondu à temps.`);
            resoudre(encore, c.id, false);
        }
    }, TOUR_MAX_MS);
}

// =====================================================================
//  LA MANCHE
// =====================================================================
function demarrerManche(g) {
    g.hands = {};
    g.currentBid = { qty: 0, face: 0, pseudo: '' };
    g.bidHistory = [];
    g.resolving = false;
    g.revele = null;
    g.manche = (g.manche || 0) + 1;

    const enVie = vivants(g);
    g.isPalifico = false;
    g.palificoFace = null;
    let starterPalifico = null;

    enVie.forEach(p => {
        // ⚠️ Le palifico se redéclenche à CHAQUE retombée à un dé, pas une
        // fois par partie : on détecte la transition depuis plus d'un dé.
        // Quelqu'un qui remonte à deux (calza réussi) puis en reperd un
        // déclenche donc un nouveau palifico.
        if (g.options.palifico && p.dice === 1 && p._avant !== 1) {
            g.isPalifico = true;
            starterPalifico = p.id;
        }
        g.hands[p.id] = lancer(p.dice);
    });
    g.players.forEach(p => { p._avant = p.dice; });

    if (g.isPalifico && starterPalifico) {
        g.turnIndex = g.players.findIndex(p => p.id === starterPalifico);
        noter(g, 'Palifico : la face se verrouille à la première mise.');
    } else if (g.players[g.turnIndex].dice <= 0) {
        joueurSuivant(g);
    }
    diffuser(g);
    armerMinuteur(g);
    peutEtreUnBot(g);
}

function resoudre(g, appelantId, estCalza) {
    if (!g || g.resolving || g.currentBid.qty === 0) return;
    if (g.players[g.turnIndex].id !== appelantId) return;
    desarmerMinuteur(g);
    g.resolving = true;

    const appelant = g.players[g.turnIndex];
    let prec = g.turnIndex;
    do { prec = (prec - 1 + g.players.length) % g.players.length; } while (g.players[prec].dice <= 0);
    const miseur = g.players[prec];

    const reel = compter(g, g.currentBid.face);
    const faceTexte = g.currentBid.face === 1 ? 'Paco' : `${g.currentBid.face}`;
    g.revele = { hands: g.hands, total: reel, face: g.currentBid.face, qty: g.currentBid.qty };

    if (!appelant.isBot) majFiche(appelant.pseudo, f => { f.defisLances++; });

    let perdant = null, texte = '';
    if (estCalza) {
        if (reel === g.currentBid.qty) {
            texte = `${appelant.pseudo} annonce Calza et tombe juste : ${reel}× ${faceTexte}.`;
            if (appelant.dice < g.options.startDice) appelant.dice += 1;
            if (!appelant.isBot) majFiche(appelant.pseudo, f => { f.calzasGagnes++; f.defisGagnes++; });
        } else {
            texte = `${appelant.pseudo} annonce Calza mais il y avait ${reel}× ${faceTexte}.`;
            perdant = appelant;
        }
        g.turnIndex = g.players.indexOf(appelant);
    } else {
        if (reel >= g.currentBid.qty) {
            texte = `${appelant.pseudo} crie au menteur, mais il y avait bien ${reel}× ${faceTexte}.`;
            perdant = appelant;
            if (!miseur.isBot) majFiche(miseur.pseudo, f => { f.bluffsSurvecus++; });
            g.turnIndex = g.players.indexOf(appelant);
        } else {
            texte = `${appelant.pseudo} démasque ${miseur.pseudo} : ${reel}× ${faceTexte} seulement.`;
            perdant = miseur;
            if (!appelant.isBot) majFiche(appelant.pseudo, f => { f.dudosGagnes++; f.defisGagnes++; });
            g.turnIndex = g.players.indexOf(miseur);
        }
    }

    if (perdant) {
        perdant.dice -= 1;
        if (!perdant.isBot) majFiche(perdant.pseudo, f => { f.desPerdus++; });
        if (perdant.dice <= 0) {
            texte += ` ${perdant.pseudo} est éliminé.`;
            const tueur = perdant === appelant ? miseur : appelant;
            if (!perdant.isBot && tueur) {
                majFiche(perdant.pseudo, f => { f.eliminePar[tueur.pseudo] = (f.eliminePar[tueur.pseudo] || 0) + 1; });
            }
            if (tueur && !tueur.isBot) majFiche(tueur.pseudo, f => { f.eliminations++; });
        }
    }
    noter(g, texte);
    diffuser(g);

    setTimeout(() => {
        const encore = games[g.id];
        if (!encore) return;
        encore.revele = null;
        if (terminee(encore)) return;
        if (encore.players[encore.turnIndex].dice <= 0) joueurSuivant(encore);
        demarrerManche(encore);
    }, REVEAL_MS);
}

// Qui reste en lice : une personne, ou une équipe.
function campsRestants(g) {
    const enVie = vivants(g);
    if (g.options.mode !== 'equipes') return enVie.map(p => [p]);
    const parEquipe = new Map();
    for (const p of enVie) {
        const t = p.team ?? -1;
        if (!parEquipe.has(t)) parEquipe.set(t, []);
        parEquipe.get(t).push(p);
    }
    return [...parEquipe.values()];
}

function terminee(g) {
    const camps = campsRestants(g);
    if (camps.length > 1) return false;
    const gagnants = camps[0] || [];
    g.status = 'ended';
    desarmerMinuteur(g);
    g.fin = {
        gagnants: gagnants.map(p => p.pseudo),
        equipe: g.options.mode === 'equipes',
        manches: g.manche || 0,
        ordre: g.players.map(p => ({ pseudo: p.pseudo, isBot: !!p.isBot, dice: p.dice })),
    };
    noter(g, gagnants.length ? `${gagnants.map(p => p.pseudo).join(' et ')} l'emporte.` : 'Partie terminée.');
    cloturer(g, gagnants);
    diffuser(g);
    diffuserHall();
    return true;
}

// ⚠️ Écrit les statistiques UNE SEULE FOIS par partie. `statsEcrites` est
// remis à zéro par la revanche, sinon une série de manches n'en compterait
// qu'une.
function cloturer(g, gagnants) {
    if (g.statsEcrites) return;
    g.statsEcrites = true;
    const humains = g.players.filter(p => !p.isBot);
    const contreDesBots = g.players.some(p => p.isBot);
    const noms = new Set(gagnants.map(p => p.pseudo));

    // Une partie contre des bots ne compte ni victoire ni palmarès : on ne
    // gagne pas contre l'ordinateur. Même règle qu'au Yams et au quiz.
    for (const p of humains) {
        majFiche(p.pseudo, f => {
            f.manches += g.manche || 0;
            if (contreDesBots && humains.length === 1) {
                f.partiesSolo++;
                if (noms.has(p.pseudo)) f.victoiresSolo++;
                return;
            }
            f.parties++;
            if (noms.has(p.pseudo)) {
                f.victoires++;
                f.serie = (f.serie || 0) + 1;
                f.meilleureSerie = Math.max(f.meilleureSerie || 0, f.serie);
            } else {
                f.serie = 0;
                // Deuxième : le dernier éliminé, s'il y avait au moins trois camps.
                if (g.dernierElimine === p.pseudo) f.deuxiemes++;
            }
        });
    }
}

// =====================================================================
//  LES BOTS
// =====================================================================
function botCompteMain(g, id, face) {
    const main = g.hands[id] || [];
    let c = main.filter(d => d === face).length;
    if (!g.isPalifico && face !== 1) c += main.filter(d => d === 1).length;
    return c;
}
function botEsperance(g, bot, face, total) {
    const propre = botCompteMain(g, bot.id, face);
    const inconnus = Math.max(0, total - bot.dice);
    // Hors palifico, une face « normale » se trouve avec un tiers de chance
    // (elle-même, plus le Paco joker). Les Pacos eux-mêmes, un sixième.
    const p = (g.isPalifico || face === 1) ? 1 / 6 : 1 / 3;
    return propre + inconnus * p;
}
function botOuverture(g, bot, total) {
    let best = { face: 2, qty: 1, exp: -1 };
    for (let f = 2; f <= 6; f++) {
        const e = botEsperance(g, bot, f, total);
        if (e > best.exp) best = { face: f, qty: Math.max(1, Math.round(e)), exp: e };
    }
    best.qty = Math.min(Math.max(1, best.qty), total);
    return best;
}
function botRelance(g, bot, total, tolerance) {
    const oq = g.currentBid.qty;
    const cands = [];
    for (let qty = oq; qty <= oq + 2 && qty <= total; qty++) {
        for (let face = 1; face <= 6; face++) cands.push([qty, face]);
    }
    cands.push([Math.ceil(oq / 2), 1]);                     // passer aux Pacos
    for (let f = 2; f <= 6; f++) cands.push([oq * 2, f]);   // en revenir : le double
    let best = null;
    for (const [qty, face] of cands) {
        if (qty < 1 || qty > total) continue;
        if (!enchereValide(g, qty, face)) continue;
        const confort = botEsperance(g, bot, face, total) - qty;
        if (confort >= tolerance) {
            const note = confort - Math.max(0, qty - oq) * 0.15;
            if (!best || note > best.note) best = { qty, face, note };
        }
    }
    return best;
}
function peutEtreUnBot(g) {
    if (!g || g.status !== 'playing' || g.resolving) return;
    const courant = g.players[g.turnIndex];
    if (!courant || !courant.isBot || courant.dice <= 0) return;
    if (g.botTimer) return;
    // Un temps de « réflexion » : sans lui, le bot répond instantanément et
    // la table défile trop vite pour être suivie.
    g.botTimer = setTimeout(() => {
        g.botTimer = null;
        const encore = games[g.id];
        if (!encore || encore.status !== 'playing' || encore.resolving) return;
        botJoue(encore);
    }, 1100 + Math.floor(Math.random() * 1200));
}
function botJoue(g) {
    const bot = g.players[g.turnIndex];
    if (!bot || !bot.isBot) return;
    const total = totalDesEnJeu(g);
    const tolerance = TOLERANCE[g.options.niveauBots] ?? TOLERANCE.normal;

    if (g.currentBid.qty === 0) {
        const o = botOuverture(g, bot, total);
        if (enchereValide(g, o.qty, o.face)) return poserEnchere(g, bot, o.qty, o.face);
        // Repli : la plus petite ouverture valable.
        for (let f = 2; f <= 6; f++) if (enchereValide(g, 1, f)) return poserEnchere(g, bot, 1, f);
        return;
    }
    // Calza quand le compte annoncé est pile l'espérance, et que ça vaut le coup.
    if (g.options.calza && bot.dice < g.options.startDice) {
        const exp = botEsperance(g, bot, g.currentBid.face, total);
        if (Math.abs(exp - g.currentBid.qty) < 0.35 && Math.random() < 0.4) return resoudre(g, bot.id, true);
    }
    const r = botRelance(g, bot, total, tolerance);
    if (r) return poserEnchere(g, bot, r.qty, r.face);
    resoudre(g, bot.id, false);
}

function poserEnchere(g, joueur, qty, face) {
    if (!enchereValide(g, qty, face)) return false;
    g.currentBid = { qty, face, pseudo: joueur.pseudo };
    g.bidHistory.push({ qty, face });
    if (g.isPalifico && !g.palificoFace && face !== 1) g.palificoFace = face;
    if (!joueur.isBot) majFiche(joueur.pseudo, f => { f.facesMisees[face] = (f.facesMisees[face] || 0) + qty; });
    noter(g, `${joueur.pseudo} annonce ${qty}× ${face === 1 ? 'Paco' : face}.`);
    joueurSuivant(g);
    diffuser(g);
    armerMinuteur(g);
    peutEtreUnBot(g);
    return true;
}

// =====================================================================
//  LES SOCKETS
// =====================================================================
function quitterTable(socket) {
    const gid = socketGame[socket.id];
    if (!gid) return;
    const g = games[gid];
    delete socketGame[socket.id];
    if (!g) return;
    socket.leave(roomOf(g));
    if (g.spectators) g.spectators = g.spectators.filter(s => s.id !== socket.id);

    const p = g.players.find(x => x.id === socket.id);
    if (p) p.connected = false;
    if (g.status === 'lobby') {
        g.players = g.players.filter(x => x.id !== socket.id);
        if (!g.players.filter(x => !x.isBot).length) {
            desarmerMinuteur(g); if (g.botTimer) clearTimeout(g.botTimer);
            delete games[gid]; diffuserHall(); return;
        }
        // L'hôte passe au premier joueur humain restant : une table ne doit
        // jamais rester sans personne pour la lancer.
        if (g.host === (p && p.pseudo)) {
            const suivant = g.players.find(x => !x.isBot);
            if (suivant) g.host = suivant.pseudo;
        }
    } else if (g.status === 'playing' && p && g.players[g.turnIndex] === p) {
        // Partir en plein tour ne bloque pas la table : on passe la main.
        joueurSuivant(g);
    }
    diffuser(g);
    diffuserHall();
}

io.on('connection', (socket) => {

    socket.on('perudo_identify', (ack) => {
        const pseudo = salonPseudoFromCookie(socket.handshake.headers.cookie);
        socket.data.perudoPseudo = pseudo;
        if (typeof ack === 'function') ack({ ok: !!pseudo, pseudo });
    });

    socket.on('perudo_list', () => socket.emit('perudo_games', partiesPubliques()));

    socket.on('perudo_create', (opts) => {
        const pseudo = socket.data.perudoPseudo;
        if (!pseudo) return socket.emit('perudo_error', 'Session expirée, reviens au salon.');
        quitterTable(socket);
        const id = 'p' + (nextId++);
        const options = nettoyerOptions(opts || {}, optionsParDefaut(), 1);
        const g = {
            id, host: pseudo, status: 'lobby', creeA: Date.now(), options,
            players: [{ id: socket.id, pseudo, dice: options.startDice, connected: true }],
            spectators: [], hands: {}, journal: [], manche: 0, turnIndex: 0,
            currentBid: { qty: 0, face: 0, pseudo: '' }, bidHistory: [],
        };
        games[id] = g;
        socketGame[socket.id] = id;
        socket.join(roomOf(g));
        diffuser(g);
        diffuserHall();
    });

    socket.on('perudo_join', ({ id }) => {
        const pseudo = socket.data.perudoPseudo;
        const g = games[id];
        if (!pseudo) return socket.emit('perudo_error', 'Session expirée, reviens au salon.');
        if (!g) return socket.emit('perudo_error', 'Cette table n’existe plus.');
        let p = g.players.find(x => x.pseudo === pseudo);
        if (p) { p.id = socket.id; p.connected = true; }        // reconnexion
        else {
            if (g.status !== 'lobby') return spectate(socket, g);
            if (g.players.length >= g.options.maxPlayers) return socket.emit('perudo_error', 'La table est complète.');
            g.players.push({ id: socket.id, pseudo, dice: g.options.startDice, connected: true });
        }
        socketGame[socket.id] = g.id;
        socket.join(roomOf(g));
        diffuser(g);
        diffuserHall();
    });

    function spectate(socket, g) {
        const pseudo = socket.data.perudoPseudo;
        g.spectators = g.spectators || [];
        if (!g.spectators.some(s => s.id === socket.id)) g.spectators.push({ id: socket.id, pseudo });
        socketGame[socket.id] = g.id;
        socket.join(roomOf(g));
        socket.emit('perudo_state', etatPour(g, pseudo));
    }
    socket.on('perudo_spectate', ({ id }) => { const g = games[id]; if (g) spectate(socket, g); });

    socket.on('perudo_options', (opts) => {
        const g = games[socketGame[socket.id]];
        if (!g || g.status !== 'lobby' || g.host !== socket.data.perudoPseudo) return;
        g.options = nettoyerOptions(opts || {}, g.options, g.players.filter(p => !p.isBot).length);
        g.players.forEach(p => { p.dice = g.options.startDice; });
        diffuser(g);
        diffuserHall();
    });

    socket.on('perudo_start', () => {
        const g = games[socketGame[socket.id]];
        if (!g || g.status !== 'lobby' || g.host !== socket.data.perudoPseudo) return;

        // Les bots sont ajoutés au lancement, pas avant : on peut ainsi
        // ouvrir la table à des gens, et compléter avec des bots au dernier
        // moment s'il ne vient personne.
        g.players = g.players.filter(p => !p.isBot);
        const place = Math.min(g.options.bots, g.options.maxPlayers - g.players.length);
        const noms = NOMS_BOTS.slice().sort(() => Math.random() - 0.5);
        for (let i = 0; i < place; i++) {
            g.players.push({ id: 'BOT-' + g.id + '-' + i, pseudo: noms[i % noms.length], isBot: true,
                             dice: g.options.startDice, connected: true });
        }
        if (g.players.length < 2) return socket.emit('perudo_error', 'Il faut au moins deux joueurs — ajoute un bot.');

        if (g.options.mode === 'equipes') {
            if (g.players.length < 4 || g.players.length % 2 !== 0) {
                return socket.emit('perudo_error', 'En équipes, il faut un nombre pair de joueurs, au moins quatre.');
            }
            g.players.forEach((p, i) => { p.team = Math.floor(i / 2); });
        } else {
            g.players.forEach(p => { p.team = null; });
        }

        g.status = 'playing';
        g.statsEcrites = false;
        g.manche = 0;
        g.players.forEach(p => { p.dice = g.options.startDice; p._avant = p.dice; });

        // Qui commence est tiré au sort, et montré par le plouf-plouf.
        // Auparavant c'était toujours le premier inscrit, donc l'hôte.
        g.turnIndex = Math.floor(Math.random() * g.players.length);
        if (g.players.length > 1) {
            io.to(roomOf(g)).emit('perudo_plouf', {
                joueurs: g.players.map(p => p.pseudo),
                gagnant: g.players[g.turnIndex].pseudo,
            });
        }
        demarrerManche(g);
        diffuserHall();
    });

    socket.on('perudo_bid', ({ qty, face }) => {
        const g = games[socketGame[socket.id]];
        if (!g || g.status !== 'playing' || g.resolving) return;
        const courant = g.players[g.turnIndex];
        if (!courant || courant.id !== socket.id) return;
        if (!poserEnchere(g, courant, Number(qty), Number(face))) {
            socket.emit('perudo_refus', 'Cette enchère n’est pas valable ici.');
        }
    });

    socket.on('perudo_dudo', () => {
        const g = games[socketGame[socket.id]];
        if (g) resoudre(g, socket.id, false);
    });
    socket.on('perudo_calza', () => {
        const g = games[socketGame[socket.id]];
        if (!g) return;
        if (!g.options.calza) return socket.emit('perudo_refus', 'Le Calza est désactivé sur cette table.');
        resoudre(g, socket.id, true);
    });

    socket.on('perudo_rematch', () => {
        const g = games[socketGame[socket.id]];
        if (!g || g.status !== 'ended' || g.host !== socket.data.perudoPseudo) return;
        g.status = 'lobby';
        g.fin = null; g.revele = null; g.journal = [];
        g.manche = 0; g.statsEcrites = false;
        g.players = g.players.filter(p => !p.isBot);
        g.players.forEach(p => { p.dice = g.options.startDice; p._avant = p.dice; p.team = null; });
        diffuser(g);
        diffuserHall();
    });

    socket.on('perudo_leave', () => quitterTable(socket));

    socket.on('perudo_stats', () => {
        const pseudo = socket.data.perudoPseudo;
        if (pseudo) socket.emit('perudo_stats', ficheComplete(pseudo));
    });
    socket.on('perudo_classement', () => socket.emit('perudo_classement', classement()));

    socket.on('disconnect', () => quitterTable(socket));
});

// =====================================================================
//  CE QUE LE RESTE DU SALON LIT
// =====================================================================
function ficheComplete(pseudo) {
    const f = lireFiche(pseudo);
    const total = f.parties || 0;
    const beteNoire = Object.entries(f.eliminePar || {}).sort((a, b) => b[1] - a[1])[0] || null;
    return {
        ...f,
        tauxVictoire: total ? Math.round((f.victoires / total) * 100) : 0,
        tauxDefis: f.defisLances ? Math.round((f.defisGagnes / f.defisLances) * 100) : 0,
        beteNoire: beteNoire ? { pseudo: beteNoire[0], fois: beteNoire[1] } : null,
        faceFavorite: (() => {
            const fm = f.facesMisees || [];
            let best = 0, iBest = 0;
            for (let i = 1; i <= 6; i++) if ((fm[i] || 0) > best) { best = fm[i]; iBest = i; }
            return iBest ? (iBest === 1 ? 'Paco' : String(iBest)) : null;
        })(),
    };
}
function classement() {
    const idx = mfGet(STATS_INDEX) || [];
    return idx.map(pseudo => {
        const f = lireFiche(pseudo);
        return { pseudo, parties: f.parties || 0, victoires: f.victoires || 0,
                 taux: f.parties ? Math.round((f.victoires / f.parties) * 100) : 0,
                 meilleureSerie: f.meilleureSerie || 0 };
    }).filter(l => l.parties > 0)
      .sort((a, b) => b.victoires - a.victoires || b.taux - a.taux || a.pseudo.localeCompare(b.pseudo, 'fr'));
}

return {
    online: () => Object.values(games)
        .flatMap(g => g.players.filter(present).map(p => ({ sid: p.id, pseudo: p.pseudo }))),
    games: () => partiesPubliques(),
    limites: { min: MIN_PLAYERS, max: MAX_PLAYERS },
    statsFor: (pseudo) => ficheComplete(pseudo),
    classement,
    endGame: (id) => {
        const g = games[id];
        if (!g) return false;
        desarmerMinuteur(g);
        if (g.botTimer) clearTimeout(g.botTimer);
        try { io.to(roomOf(g)).emit('perudo_closed'); } catch (e) {}
        delete games[id];
        diffuserHall();
        return true;
    },
    // Pour la migration des anciens profils, faite une seule fois au
    // démarrage par server.js.
    lireFiche, ecrireFiche, ficheVierge,
    // Exposées pour les tests : ce sont les règles de la maison, elles
    // méritent d'être vérifiables sans lancer de partie.
    _regles: { enchereValide, compter, minimaParFace },
};
};
