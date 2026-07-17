const socket = io();
let myPseudo = "";
let myId = "";
let myStyle = { bgColor: '#ffffff', dotColor: '#000000', shape: 'square', faceType: 'classic' };
let currentGameId = null;
let spectating = false;        // mode spectateur (on regarde sans jouer)
let liveGames = [];            // tables en cours (pour le sélecteur spectateur)
let tablePlayers = [];         // pseudos des joueurs de la table (pour le choix du 1er joueur)
let pendingInvite = null;      // table à rejoindre via un lien d'invitation (?table=ID)
try { const _inv = new URLSearchParams(location.search).get('table'); if (_inv) pendingInvite = _inv; } catch (e) {}
let gameMode = 'solo';         // 'solo' ou 'duo'
let myTeam = null;             // numéro d'équipe en duo
let teammateId = null;         // id du coéquipier en duo
let isPalifico = false;
let palificoFace = null;          // face verrouillée pendant un palifico (fixée à la 1ère mise)
let currentBid = { qty: 0, face: 0 };
let selectedFace = null;
let isMyTurn = false;
let amHost = false;
let currentOptions = { startDice: 5, palifico: true, calza: true, maxPlayers: 10 };
let roundBids = [];
let lastRoundResult = '';   // dernier résultat (faux/vrai) gardé consultable dans l'historique
let roomPlayersStyles = {};
let roomPlayerNames = {};       // id -> pseudo (pour l'animation de comptage)
let lastChallengeType = 'dudo'; // dernier défi (calza/dudo) pour l'animation de comptage
let totalDiceInGame = 0;
let lastRoomPlayers = [];      // joueurs actuels de la table (salle d'attente)
let teamOrder = [];            // ordre des joueurs en duo (paires consécutives)
let gameInProgress = false;    // true quand la partie a démarré (masque le panneau d'équipes)

const SHAPES = {
    'square': { radius: '6px', clip: 'none' },
    'circle': { radius: '50%', clip: 'none' },
    'hexagon': { radius: '0px', clip: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)' },
    'octagon': { radius: '0px', clip: 'polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)' }
};

let myWins = 0;
let myBotWins = 0;                 // victoires contre le bot (déblocage skin/titre Cthulhu)
let myCampaignLevel = 0;           // dernier niveau de campagne réussi
let myCampaignStars = {};          // map { niveau: nombre d'étoiles (1-3) }
let myCampaignTotalStars = 0;
let myCampaignMaxStars = 45;
let myTourneyWins = 0;
let gameOverTimer = null;          // timer de retour au lobby (annulable par l'écran de campagne)

// ---- Icônes SVG (aucun emoji) ----
const ICON_PATHS = {
    play:    'M8 5v14l11-7z',
    lock:    'M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6z',
    check:   'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
    star:    'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z',
    trophy:  'M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z',
    skull:   'M12 2C7.03 2 3 6.03 3 11c0 3.06 1.53 5.76 3.87 7.39L7 22h2l.5-2h5l.5 2h2l.13-3.61C19.47 16.76 21 14.06 21 11c0-4.97-4.03-9-9-9zM9 14a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm6 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3z',
    compass: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm2.5 12.5L6 18l3.5-8.5L18 6l-3.5 8.5z',
    gift:    'M20 6h-2.18c.11-.31.18-.65.18-1a3 3 0 00-5.5-1.65l-.5.67-.5-.68A3 3 0 006 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-5-2a1 1 0 110 2 1 1 0 010-2zM9 4a1 1 0 110 2 1 1 0 010-2zm11 15H4v-2h16v2zm0-5H4V8h5.08L7 10.83 8.62 12 12 7.4l3.38 4.6L17 10.83 14.92 8H20v6z',
    anchor:  'M12 2a3 3 0 00-1 5.83V10H8v2h3v6.92A7 7 0 015.08 13H7l-3-3-3 3h1.92A9 9 0 0012 22a9 9 0 009.92-9H24l-3-3-3 3h1.92A7 7 0 0113 18.92V12h3v-2h-3V7.83A3 3 0 0012 2zm0 2a1 1 0 110 2 1 1 0 010-2z'
};
function svgIcon(name, size) {
    const s = size || 22;
    return `<svg viewBox="0 0 24 24" fill="currentColor" width="${s}" height="${s}" aria-hidden="true"><path d="${ICON_PATHS[name] || ''}"/></svg>`;
}

// Données de campagne : reçues du serveur (source unique). Le client ne fait qu'afficher.
const DIFF_LABEL = { easy: 'Novice', normal: 'Aguerri', hard: 'Redoutable', master: 'Légendaire' };
let CAMPAIGN_DATA = { chapters: {}, mods: {}, levels: [] };
let myRank = 'Moussaillon';
let myAchievements = [];
let myTitle = '';                 // id du haut fait équipé comme titre
let myProfile = {};               // stats complètes (publicStats du serveur)
let initializing = false;
const PREVIEW_HAND = [1, 2, 3, 4, 5]; // aperçu : 5 dés affichant des faces variées

// Émotes (miroir de EMOTES côté serveur)
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

// Émotes en SVG (rendu dans le sélecteur ET en flottant)
const _F = (extra, base) => `<svg viewBox="0 0 24 24" width="34" height="34">${base || '<circle cx="12" cy="12" r="11" fill="#ffce3a"/>'}${extra}</svg>`;
const EMOTE_SVG = {
    rire: _F('<path d="M6.5 9c.8-1 2.2-1 3 0M14.5 9c.8-1 2.2-1 3 0" stroke="#3a2208" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M6 13a6 6 0 0 0 12 0z" fill="#3a2208"/>'),
    choc: _F('<circle cx="8.5" cy="10" r="1.7" fill="#3a2208"/><circle cx="15.5" cy="10" r="1.7" fill="#3a2208"/><ellipse cx="12" cy="16" rx="2.4" ry="3" fill="#3a2208"/>'),
    malin: _F('<circle cx="8.5" cy="10" r="1.4" fill="#3a2208"/><circle cx="15.5" cy="10" r="1.4" fill="#3a2208"/><path d="M7 15c2 2 7 2 10-1" stroke="#3a2208" stroke-width="1.5" fill="none" stroke-linecap="round"/>'),
    colere: _F('<path d="M6 8.5l3 1.4M18 8.5l-3 1.4" stroke="#3a2208" stroke-width="1.6" stroke-linecap="round"/><circle cx="8.7" cy="11.4" r="1.3" fill="#3a2208"/><circle cx="15.3" cy="11.4" r="1.3" fill="#3a2208"/><path d="M8 17c2-2 6-2 8 0" stroke="#3a2208" stroke-width="1.6" fill="none" stroke-linecap="round"/>', '<circle cx="12" cy="12" r="11" fill="#ff7a3a"/>'),
    salut: _F('<circle cx="8.5" cy="10.5" r="1.3" fill="#3a2208"/><circle cx="15.5" cy="10.5" r="1.3" fill="#3a2208"/><path d="M8 15c2 2 6 2 8 0" stroke="#3a2208" stroke-width="1.5" fill="none" stroke-linecap="round"/>'),
    pleure: _F('<path d="M7 10h3M14 10h3" stroke="#3a2208" stroke-width="1.4" stroke-linecap="round"/><path d="M8.5 12c0 2-1.5 3-1.5 4a1.5 1.5 0 0 0 3 0c0-1-1.5-2-1.5-4z" fill="#5ec6ff"/><path d="M15.5 12c0 2-1.5 3-1.5 4a1.5 1.5 0 0 0 3 0c0-1-1.5-2-1.5-4z" fill="#5ec6ff"/><path d="M9 17c1.5-1.5 4.5-1.5 6 0" stroke="#3a2208" stroke-width="1.4" fill="none" stroke-linecap="round"/>'),
    clin: _F('<path d="M7 10.5h3" stroke="#3a2208" stroke-width="1.6" stroke-linecap="round"/><circle cx="15.5" cy="10.5" r="1.5" fill="#3a2208"/><path d="M8 15c2 2 6 2 8 0" stroke="#3a2208" stroke-width="1.5" fill="none" stroke-linecap="round"/>'),
    cool: _F('<path d="M4 9h7v2.5a2 2 0 0 1-4 0V11H6a2 2 0 0 1-2-2zM13 9h7a2 2 0 0 1-2 2h-1v.5a2 2 0 0 1-4 0z" fill="#1a1a1a"/><path d="M8 16c2 1.5 6 1.5 8 0" stroke="#3a2208" stroke-width="1.5" fill="none" stroke-linecap="round"/>'),
    reflechir: _F('<circle cx="8.5" cy="10" r="1.3" fill="#3a2208"/><circle cx="15.5" cy="10" r="1.3" fill="#3a2208"/><path d="M9 16h5" stroke="#3a2208" stroke-width="1.5" stroke-linecap="round"/><path d="M16 15a2 2 0 1 0 .01 0z" fill="#3a2208"/>'),
    dodo: _F('<path d="M7 10c1-1 3-1 4 0M13 10c1-1 3-1 4 0" stroke="#3a2208" stroke-width="1.3" fill="none" stroke-linecap="round"/><path d="M8 16h8" stroke="#3a2208" stroke-width="1.4" stroke-linecap="round"/><path d="M15 6h3l-3 3h3" stroke="#7fb3ff" stroke-width="1.3" fill="none"/>'),
    coeur: '<svg viewBox="0 0 24 24" width="34" height="34"><path d="M12 21s-8-5.2-8-11A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8 3c0 5.8-8 11-8 11z" fill="#e0405a" stroke="#7a1020" stroke-width="0.8"/></svg>',
    pouce_haut: '<svg viewBox="0 0 24 24" width="34" height="34"><path d="M3 10h3v10H3zM8 10l4-7c1.4 0 2.2 1.2 1.8 2.6L13 9h6a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 17.8 19H8z" fill="#ffce3a" stroke="#3a2208" stroke-width="0.9"/></svg>',
    pouce_bas: '<svg viewBox="0 0 24 24" width="34" height="34"><path d="M3 4h3v10H3zM8 14l4 7c1.4 0 2.2-1.2 1.8-2.6L13 15h6a2 2 0 0 0 2-2.3l-1.2-6A2 2 0 0 0 17.8 5H8z" fill="#ffce3a" stroke="#3a2208" stroke-width="0.9"/></svg>',
    feu: '<svg viewBox="0 0 24 24" width="34" height="34"><path d="M12 2c2.5 3.5 1 5.5 2.8 7.2 1-.7 1.2-2 1.2-3 2 2 3.5 4.8 3.5 7.3a7.5 7.5 0 1 1-15 0c0-2.7 1.6-5.4 3.8-7.3.8 1.6 1.8 2.6 2.7 1.8C13 13.7 10 12 12 2z" fill="#ff7a1f"/><path d="M12 21a3.4 3.4 0 0 0 1.4-6.5C12.7 16 11 16 11 17.6A3.4 3.4 0 0 0 12 21z" fill="#ffd24a"/></svg>',
    couronne: '<svg viewBox="0 0 24 24" width="34" height="34"><path d="M3 8l4 5 5-7 5 7 4-5v11H3z" fill="#ffd24a" stroke="#3a2208" stroke-width="0.9"/><circle cx="3" cy="7" r="1.6" fill="#ffd24a"/><circle cx="21" cy="7" r="1.6" fill="#ffd24a"/><circle cx="12" cy="4" r="1.6" fill="#ffd24a"/></svg>',
    ancre: '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#e6c46a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4.5" r="2"/><path d="M12 6.5V21M6 11H18M5 14a7 7 0 0 0 14 0"/></svg>',
    epee: '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#dfe3e8" stroke-width="1.6" stroke-linecap="round"><path d="M5 19l9-9 1-4 4 1-4 1-9 9zM5 19l2-2M14 10l5 5M19 15l1 3-3-1"/></svg>',
    rhum: '<svg viewBox="0 0 24 24" width="34" height="34"><path d="M6 5h10v13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" fill="#c98b3a" stroke="#3a2208" stroke-width="0.9"/><path d="M6 5h10v4H6z" fill="#fff3d6"/><path d="M16 8h2.5a1.5 1.5 0 0 1 0 5H16" fill="none" stroke="#3a2208" stroke-width="1.2"/></svg>',
    piece: '<svg viewBox="0 0 24 24" width="34" height="34"><circle cx="12" cy="12" r="9" fill="#ffd24a" stroke="#a9741f" stroke-width="1.4"/><circle cx="12" cy="12" r="6" fill="none" stroke="#a9741f" stroke-width="0.9"/><path d="M12 8v8M9.5 9.5h3.5a1.6 1.6 0 0 1 0 3.2h-2.5" fill="none" stroke="#6e4a12" stroke-width="1.3"/></svg>',
    crane: '<svg viewBox="0 0 24 24" width="34" height="34"><path d="M12 2a8 8 0 0 0-8 8c0 3 1.5 4.6 3 5.6V19a1 1 0 0 0 1 1h1v-2h2v2h2v-2h2v2h1a1 1 0 0 0 1-1v-3.4c1.5-1 3-2.6 3-5.6a8 8 0 0 0-8-8z" fill="#f0ece0" stroke="#3a2208" stroke-width="0.8"/><circle cx="8.7" cy="10.5" r="2" fill="#3a2208"/><circle cx="15.3" cy="10.5" r="2" fill="#3a2208"/><path d="M12 13l-1 2.5h2z" fill="#3a2208"/></svg>',
    eclair: '<svg viewBox="0 0 24 24" width="34" height="34"><path d="M13 2L4 14h6l-1.5 8L20 9h-6z" fill="#ffd24a" stroke="#3a2208" stroke-width="0.7"/></svg>',
    etoile: '<svg viewBox="0 0 24 24" width="34" height="34"><path d="M12 2l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.8 6.1 20l1.2-6.5L2.5 8.9 9.1 8z" fill="#ffd24a" stroke="#3a2208" stroke-width="0.7"/></svg>',
    bombe: '<svg viewBox="0 0 24 24" width="34" height="34"><circle cx="11" cy="15" r="7" fill="#2a2a2a"/><path d="M16 8l2-2M18 6l2 1M18 6l-1-2" stroke="#ff9a3a" stroke-width="1.6" stroke-linecap="round"/><circle cx="8.5" cy="12.5" r="2" fill="#5a5a5a"/></svg>',
    applaudir: '<svg viewBox="0 0 24 24" width="34" height="34"><path d="M8 13l-3-3a1.5 1.5 0 0 1 2-2l4 4M14 6l4 4a1.5 1.5 0 0 1-2 2l-4-4" fill="#ffce3a" stroke="#3a2208" stroke-width="1"/><path d="M3 4l1.5 1.5M19.5 3L18 4.5M21 8h-2" stroke="#ffd24a" stroke-width="1.4" stroke-linecap="round"/></svg>',
    boussole: '<svg viewBox="0 0 24 24" width="34" height="34"><circle cx="12" cy="12" r="9" fill="#23303a" stroke="#e6c46a" stroke-width="1.4"/><path d="M12 6l2 6-6 4 4-6z" fill="#e0405a"/><path d="M12 6l-2 6 6 4-4-6z" fill="#f0ece0"/></svg>',
    tresor: '<svg viewBox="0 0 24 24" width="34" height="34"><path d="M4 9h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" fill="#7a4a1c" stroke="#3a2208" stroke-width="0.9"/><path d="M4 9a8 4 0 0 1 16 0z" fill="#5a3514"/><rect x="10.5" y="11" width="3" height="4" rx="1" fill="#ffd24a"/><circle cx="12" cy="9" r="1.4" fill="#ffd24a"/></svg>',
    voilier: '<svg viewBox="0 0 24 24" width="34" height="34"><path d="M12 3v11M12 3l6 9h-6z" fill="#f0ece0" stroke="#3a2208" stroke-width="0.7"/><path d="M11 6L5 13h6z" fill="#e6c46a"/><path d="M3 16h18l-2.5 4H5.5z" fill="#7a4a1c"/></svg>',
    poisson: '<svg viewBox="0 0 24 24" width="34" height="34"><path d="M3 12c4-6 11-6 15 0-4 6-11 6-15 0z" fill="#5ec6ff" stroke="#1a4a6a" stroke-width="0.8"/><path d="M18 12l3-3v6z" fill="#5ec6ff" stroke="#1a4a6a" stroke-width="0.8"/><circle cx="8" cy="11" r="1.2" fill="#0a2a3a"/></svg>',
    mouette: '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#f0ece0" stroke-width="2" stroke-linecap="round"><path d="M2 14c3 0 4-4 6-4s2.5 3 4 3 2.5-3 4-3 3 4 6 4"/></svg>',
    perroquet: '<svg viewBox="0 0 100 100" width="34" height="34"><path fill="#ffd24a" stroke="#5a3a18" stroke-width="1.2" fill-rule="nonzero" d="M50.966,39.492L50.966,70.069C58.34,70.041 65.721,69.728 73.086,70.075C73.839,70.182 74.23,71.143 73.686,71.741L50.68,94.747C50.094,95.281 49.051,94.932 49.009,94.055L49.009,72.013C34.963,71.55 21.744,61.442 17.803,47.887C17.01,45.159 16.594,42.333 16.537,39.496C34.085,39.728 48.954,53.457 49.009,70.071C49.009,70.071 50.628,70.07 50.948,70.069C50.325,51.752 33.945,37.757 16.553,37.538C16.858,29.392 20.074,21.322 25.728,15.391C31.969,8.846 40.89,5.029 49.985,5L50.065,5.006C50.11,5.002 50.157,5.001 50.204,5.001C67.408,5.164 83.269,19.911 83.499,38.081C83.508,38.78 83.255,39.451 82.523,39.492L50.966,39.492ZM50.966,6.972L50.966,37.535L81.529,37.535C81.086,21.983 67.841,7.77 51.411,6.989C51.263,6.983 51.115,6.977 50.966,6.972ZM41.007,19.479C40.31,18.302 39.028,17.512 37.562,17.512C37.042,17.512 36.544,17.612 36.088,17.793L36.085,17.792C34.606,18.379 33.558,19.824 33.558,21.512C33.558,23.634 35.215,25.373 37.304,25.504C37.39,25.509 37.476,25.512 37.562,25.512C39.77,25.512 41.562,23.72 41.562,21.512C41.562,20.775 41.363,20.085 41.015,19.492L41.045,19.492L41.007,19.479ZM37.561,19.514C38.665,19.514 39.561,20.41 39.561,21.514C39.561,22.618 38.665,23.514 37.561,23.514C36.457,23.514 35.561,22.618 35.561,21.514C35.561,20.41 36.457,19.514 37.561,19.514Z"/></svg>'
};
function emoteSVG(key) { return EMOTE_SVG[key] || `<span style="font-size:1.6rem">${EMOTES[key] || '❓'}</span>`; }
// Ordre d'affichage dans le grand sélecteur
const EMOTE_ORDER = Object.keys(EMOTES);

// Hauts faits = titres (miroir d'ACHIEVEMENTS côté serveur). Sans icône.
const ACHIEVEMENTS_CAT = {
    firstWin: { name: 'Premier sang',        desc: 'Remporter 1 partie' },
    wins10:   { name: 'Loup des mers',        desc: 'Remporter 10 parties' },
    wins25:   { name: 'Terreur des flots',    desc: 'Remporter 25 parties' },
    dudos10:  { name: 'Démasqueur',           desc: '10 Dudos réussis' },
    dudos50:  { name: 'Détecteur de bluff',   desc: '50 Dudos réussis' },
    calza5:   { name: 'Maître du Calza',      desc: '5 Calzas réussis' },
    games50:  { name: 'Vétéran des tavernes', desc: 'Jouer 50 parties' },
    botSlayer:{ name: 'Maître du Cthulhu',    desc: 'Battre le Cthulhu (le bot)' }
};

// Couleur d'affichage du pseudo (couleur du dé, sinon or)
function nameCol(style) {
    if (!style) return '#d4af37';
    return style.bgColor || '#d4af37';
}
// Couleur de nom : préfère la couleur perso choisie, sinon la couleur du skin
function pNameColor(p) {
    if (p && p.nameColor) return p.nameColor;
    return nameCol(p && p.style);
}

// Applique un profil reçu du serveur (stats complètes, grade, hauts faits, titre)
function applyProfile(p) {
    if (!p) return;
    myProfile = p;
    if (typeof p.wins === 'number') myWins = p.wins;            // sert au déblocage des skins
    if (typeof p.botWins === 'number') myBotWins = p.botWins;   // déblocage Cthulhu (victoire vs bot)
    if (typeof p.campaignLevel === 'number') myCampaignLevel = p.campaignLevel;
    if (p.campaignStars && typeof p.campaignStars === 'object' && !Array.isArray(p.campaignStars)) myCampaignStars = p.campaignStars;
    else if (Array.isArray(p.campaignStars)) { const m = {}; p.campaignStars.forEach(id => m[id] = 2); myCampaignStars = m; }
    if (typeof p.campaignTotalStars === 'number') myCampaignTotalStars = p.campaignTotalStars;
    if (typeof p.campaignMaxStars === 'number') myCampaignMaxStars = p.campaignMaxStars;
    if (typeof p.tourneyWins === 'number') myTourneyWins = p.tourneyWins;
    if (p.rank) myRank = p.rank;
    if (Array.isArray(p.achievements)) myAchievements = p.achievements;
    if (typeof p.equippedTitle === 'string') myTitle = p.equippedTitle;
    updateProfileUI();
    refreshHeaderPseudo();
    try { updateHeaderAvatar(); } catch (e) {}
    const styleView = document.getElementById('view-style');
    if (styleView && styleView.style.display !== 'none') renderSkinGallery();
    const campView = document.getElementById('view-campagne');
    if (campView && campView.style.display !== 'none') renderCampaign();
}

// Un skin est-il débloqué ? (gratuit ou atteint via les victoires)
function ownsSkin(id) {
    const s = SKINS[id];
    if (!s) return false;
    if (s.requiresBotWin) return (myBotWins || 0) >= 1;
    if (s.requiresAllStars) return myCampaignMaxStars > 0 && myCampaignTotalStars >= myCampaignMaxStars;
    if (s.requiresTourney) return (myTourneyWins || 0) >= 1;
    if (s.requiresCampaign) return (myCampaignLevel || 0) >= s.requiresCampaign;
    if (!s.winsRequired) return true;
    return myWins >= s.winsRequired;
}

// =====================================================================
//  CATALOGUE DES SKINS (collections de dés prêtes à l'emploi)
//  Pour AJOUTER un skin : ajoute une entrée ici.
//  Pour le rendre PAYANT : mets "winsRequired" > 0 ici ET ajoute la même
//  ligne dans SKIN_LOCKS côté server.js (sécurité anti-triche).
//  Champs : bg (fond, couleur ou dégradé), pip (couleur des motifs),
//  swatch (couleur unie pour la pastille du lobby), shape, faceType
//  ('classic' | 'number' | 'roman' | 'rune' | 'paco'),
//  border, glow (effets optionnels), face1 (emoji pour la face 1).
// =====================================================================
const SKINS = {
    classic:  { name: 'Classique',         winsRequired: 0,  bg: '#ffffff', pip: '#000000', swatch: '#ffffff', shape: 'square',  faceType: 'classic' },
    dragon:   { name: 'Feu & Dragon',      winsRequired: 0,  bg: 'radial-gradient(circle at 32% 26%,#ff9344,#c8230d 68%,#6e0d05)', pip: '#ffe7b3', swatch: '#c8230d', shape: 'square',  faceType: 'classic', glyph: 'dragon', glow: '0 0 12px rgba(255,90,20,0.65)' },
    pirate:   { name: 'Trésor Pirate',     winsRequired: 0,  bg: 'linear-gradient(135deg,#dcc48d,#b08947)', pip: '#3a2a16', swatch: '#b08947', shape: 'square',  faceType: 'classic', glyph: 'crane', border: '2px solid #6e4a22' },
    paco:     { name: 'Dé Paco',           winsRequired: 0,  bg: 'linear-gradient(135deg,#eaf6ff,#b6dffb)', pip: '#0a6cae', swatch: '#b6dffb', shape: 'square',  faceType: 'paco' },
    emeraude: { name: 'Émeraude',          winsRequired: 0,  bg: 'radial-gradient(circle at 30% 25%,#6ff3b3,#0f9d58 68%,#075c33)', pip: '#eafff3', swatch: '#0f9d58', shape: 'square', faceType: 'classic', glow: '0 0 12px rgba(40,220,140,0.55)' },
    poney:    { name: 'Cheval',            winsRequired: 0,  bg: 'linear-gradient(135deg,#ffd1ec,#cdb4ff 50%,#b4e7ff)', pip: '#7b3fb0', swatch: '#cdb4ff', shape: 'square',  faceType: 'classic', glyph: 'cheval', border: '2px solid #ff9ad5' },
    elephant: { name: 'Éléphant',          winsRequired: 0,  bg: 'linear-gradient(145deg,#c2ced9,#8c9aa6)', pip: '#2f3e4a', swatch: '#a7b3bf', shape: 'square',  faceType: 'classic', glyph: 'elephant' },
    chat:     { name: 'Chat',              winsRequired: 0,  bg: 'linear-gradient(145deg,#3a3a4a,#1f1f2b)', pip: '#f2e9d8', swatch: '#3a3a4a', shape: 'square',  faceType: 'classic', glyph: 'chat' },
    forge:    { name: 'Forge Naine',       winsRequired: 5,  bg: 'linear-gradient(145deg,#5c5249,#2c2622)', pip: '#e3a948', swatch: '#5c5249', shape: 'octagon', faceType: 'classic', glyph: 'forge', border: '2px solid #8a6d3b' },
    gold:     { name: 'Or Royal',          winsRequired: 10, bg: 'linear-gradient(135deg,#fff4b0,#e9bd1f 45%,#9a7d00)', pip: '#5a4500', swatch: '#e9bd1f', shape: 'square',  faceType: 'classic', glyph: 'gold', border: '2px solid #fff0a0', glow: '0 0 14px rgba(255,210,60,0.8)' },
    obsidienne:{ name: 'Obsidienne',       winsRequired: 0,  bg: 'linear-gradient(145deg,#26263a,#0f0f1a)', pip: '#b39ddb', swatch: '#26263a', shape: 'square', faceType: 'classic', border: '1px solid #4a4a6a', glow: '0 0 8px rgba(179,157,219,0.45)' },
    rubis:    { name: 'Rubis',             winsRequired: 0,  bg: 'radial-gradient(circle at 30% 28%,#ff7b7b,#c1121f 70%,#7a0a13)', pip: '#fff0f0', swatch: '#c1121f', shape: 'square', faceType: 'classic', border: '1px solid #ff9aa2', glow: '0 0 9px rgba(255,40,40,0.5)' },
    saphir:   { name: 'Saphir',            winsRequired: 0,  bg: 'radial-gradient(circle at 30% 28%,#6db3ff,#1e3a8a 72%,#0c1f52)', pip: '#eaf4ff', swatch: '#1e3a8a', shape: 'square', faceType: 'classic', border: '1px solid #90caf9', glow: '0 0 9px rgba(60,140,255,0.5)' },
    arcenciel:{ name: 'Arc-en-ciel',       winsRequired: 0,  bg: 'linear-gradient(135deg,#ff5f6d,#ffc371 30%,#47e891 55%,#4895ef 78%,#9b5de5)', pip: '#1a1a2e', swatch: '#9b5de5', shape: 'square', faceType: 'classic', border: '1px solid rgba(255,255,255,0.6)', glow: '0 0 10px rgba(255,255,255,0.45)' },
    cthulhu:  { name: 'Cthulhu',           requiresBotWin: true, bg: '#2f3640', pip: '#ffd700', swatch: '#2f3640', shape: 'square', faceType: 'classic', glyph: 'bot' },
    corsaire: { name: 'Corsaire',          requiresCampaign: 5,  bg: 'radial-gradient(circle at 36% 30%,#3b6fb5,#16335e 65%,#0a1c38)', pip: '#e8f1ff', swatch: '#1e3a66', shape: 'square', faceType: 'classic', border: '1px solid #6f9fd8', glow: '0 0 12px rgba(90,150,230,0.55)' },
    abysse:   { name: 'Abysse',            requiresCampaign: 10,  bg: 'radial-gradient(circle at 36% 30%,#1aa3a3,#063b3b 60%,#021a1a)', pip: '#9bfff2', swatch: '#0a3b3b', shape: 'square', faceType: 'classic', border: '1px solid #1f7d7d', glow: '0 0 14px rgba(40,220,210,0.5)' },
    kraken:   { name: 'Kraken',            requiresCampaign: 15, bg: 'radial-gradient(circle at 36% 30%,#7b3bd6,#2a1146 62%,#120821)', pip: '#f2c8ff', swatch: '#3a1a5e', shape: 'square', faceType: 'classic', glyph: 'crane', border: '1px solid #9a5bd8', glow: '0 0 16px rgba(170,80,230,0.6)' },
    brume:    { name: 'Brume',             requiresCampaign: 9,  bg: 'radial-gradient(circle at 36% 30%,#9fb0c0,#6b7b8c 60%,#3a4654)', pip: '#1c2530', swatch: '#7a8a99', shape: 'square', faceType: 'classic', border: '1px solid #b9c8d6', glow: '0 0 12px rgba(180,200,220,0.5)' },
    sang:     { name: 'Sang',              requiresCampaign: 12, bg: 'radial-gradient(circle at 36% 30%,#b5202a,#5e0d12 62%,#2a0608)', pip: '#ffd9d0', swatch: '#7a1118', shape: 'square', faceType: 'classic', border: '1px solid #d8585b', glow: '0 0 14px rgba(220,60,60,0.55)' },
    tresor:   { name: 'Trésor',            requiresAllStars: true, bg: 'radial-gradient(circle at 36% 30%,#ffe9a8,#d4af37 45%,#1a1206 88%)', pip: '#3a2a06', swatch: '#caa233', shape: 'square', faceType: 'classic', glyph: 'gold', border: '1px solid #ffe9a8', glow: '0 0 18px rgba(255,210,90,0.7)' },
    couronne: { name: 'Couronne',          requiresTourney: true, bg: 'radial-gradient(circle at 36% 30%,#ffe9a8,#b8860b 42%,#3a1d5e 90%)', pip: '#fff7d6', swatch: '#7a3bd6', shape: 'square', faceType: 'classic', glyph: 'gold', border: '1px solid #ffe9a8', glow: '0 0 18px rgba(255,210,90,0.7)' },

    // ---- Nouvelles collections (gratuites) ----
    galaxie:   { name: 'Galaxie',          winsRequired: 0, bg: 'radial-gradient(circle at 30% 25%,#7b5bff,#2a1a6e 55%,#070318)', pip: '#e7deff', swatch: '#3a1d8e', shape: 'circle',  faceType: 'classic', glyph: 'etoile', border: '1px solid #9a7bff', glow: '0 0 14px rgba(140,90,255,0.65)' },
    nebuleuse: { name: 'Nébuleuse',        winsRequired: 0, bg: 'radial-gradient(circle at 35% 30%,#ff7ad9,#7a2bd6 45%,#1a1140 88%)', pip: '#ffe6fb', swatch: '#a13bd6', shape: 'circle',  faceType: 'classic', glyph: 'etoile', glow: '0 0 14px rgba(220,100,230,0.6)' },
    neon:      { name: 'Néon Vert',        winsRequired: 0, bg: 'linear-gradient(145deg,#0c1f14,#03100a)', pip: '#39ff9e', swatch: '#0c1f14', shape: 'hexagon', faceType: 'classic', border: '2px solid #39ff9e', glow: '0 0 14px rgba(57,255,158,0.75)' },
    neonrose:  { name: 'Néon Rose',        winsRequired: 0, bg: 'linear-gradient(145deg,#1f0c1a,#100310)', pip: '#ff4fd8', swatch: '#1f0c1a', shape: 'hexagon', faceType: 'classic', border: '2px solid #ff4fd8', glow: '0 0 14px rgba(255,79,216,0.75)' },
    lave:      { name: 'Lave',             winsRequired: 0, bg: 'radial-gradient(circle at 32% 28%,#ff8a3c,#c01806 55%,#1a0502)', pip: '#ffe2b0', swatch: '#c01806', shape: 'square',  faceType: 'classic', glyph: 'flamme', border: '1px solid #ff7a3c', glow: '0 0 14px rgba(255,80,20,0.7)' },
    glace:     { name: 'Glace',            winsRequired: 0, bg: 'linear-gradient(150deg,#e6fbff,#8fd6f0 50%,#3a86b5)', pip: '#0a3a52', swatch: '#8fd6f0', shape: 'octagon', faceType: 'classic', border: '1px solid #d6f6ff', glow: '0 0 12px rgba(150,220,255,0.6)' },
    toxique:   { name: 'Toxique',          winsRequired: 0, bg: 'radial-gradient(circle at 32% 28%,#b6ff3a,#4a8a00 60%,#15280a)', pip: '#0c2a00', swatch: '#7ac000', shape: 'hexagon', faceType: 'classic', glyph: 'crane', border: '1px solid #c8ff5a', glow: '0 0 14px rgba(150,255,40,0.6)' },
    holo:      { name: 'Holographique',    winsRequired: 0, bg: 'linear-gradient(120deg,#ff5f9e,#ffd36b 28%,#5effd6 52%,#5e9bff 74%,#c46bff)', pip: '#1a1030', swatch: '#9b5de5', shape: 'square',  faceType: 'classic', border: '1px solid rgba(255,255,255,0.7)', glow: '0 0 12px rgba(255,255,255,0.5)' },
    vampire:   { name: 'Vampire',         winsRequired: 0, bg: 'radial-gradient(circle at 34% 28%,#8a1020,#3a0610 60%,#0a0204)', pip: '#ff5a6a', swatch: '#6a0c18', shape: 'square',  faceType: 'classic', glyph: 'crane', border: '1px solid #c01828', glow: '0 0 12px rgba(220,30,50,0.6)' },
    foret:     { name: 'Forêt',           winsRequired: 0, bg: 'linear-gradient(150deg,#3aa35a,#165e2e 60%,#0a2a16)', pip: '#eafff0', swatch: '#1e7d42', shape: 'square',  faceType: 'classic', glyph: 'feuille', glow: '0 0 10px rgba(60,200,110,0.45)' },
    ocean:     { name: 'Océan',           winsRequired: 0, bg: 'radial-gradient(circle at 32% 28%,#4fc3f7,#0277bd 60%,#01314f)', pip: '#eaffff', swatch: '#0288d1', shape: 'circle',  faceType: 'classic', glyph: 'poisson', glow: '0 0 12px rgba(60,180,255,0.55)' },
    lune:      { name: 'Lune',            winsRequired: 0, bg: 'radial-gradient(circle at 34% 28%,#3a4a78,#161d3a 62%,#070a18)', pip: '#dfe6ff', swatch: '#26305e', shape: 'circle',  faceType: 'classic', glyph: 'lune', border: '1px solid #5a6aa8', glow: '0 0 12px rgba(120,140,255,0.5)' },
    foudre:    { name: 'Foudre',          winsRequired: 0, bg: 'linear-gradient(150deg,#2a2e3a,#0e1018)', pip: '#ffe14a', swatch: '#2a2e3a', shape: 'octagon', faceType: 'classic', glyph: 'eclair', border: '1px solid #5a5e6a', glow: '0 0 14px rgba(255,220,60,0.6)' },
    desert:    { name: 'Désert',          winsRequired: 0, bg: 'linear-gradient(150deg,#ffe8a8,#e0a857 55%,#a9762c)', pip: '#5a3a10', swatch: '#e0a857', shape: 'square',  faceType: 'classic', glyph: 'soleil', border: '1px solid #fff0c4' },
    bois:      { name: 'Bois',            winsRequired: 0, bg: 'repeating-linear-gradient(115deg,#7a4a22,#7a4a22 6px,#6e421e 6px,#6e421e 12px)', pip: '#ffe1b0', swatch: '#7a4a22', shape: 'square',  faceType: 'classic', border: '2px solid #4a2c12' },
    marbre:    { name: 'Marbre',          winsRequired: 0, bg: 'linear-gradient(135deg,#f6f6f2,#d8dadf 50%,#b8bcc6)', pip: '#2a2e38', swatch: '#dcdde2', shape: 'square',  faceType: 'classic', border: '1px solid #9aa0ac' },
    amethyste: { name: 'Améthyste',       winsRequired: 0, bg: 'radial-gradient(circle at 32% 26%,#c98bff,#7a32c8 60%,#2e0f56)', pip: '#f3e6ff', swatch: '#8a3bd6', shape: 'octagon', faceType: 'classic', border: '1px solid #d4a8ff', glow: '0 0 12px rgba(180,100,255,0.55)' },
    cuivre:    { name: 'Cuivre',          winsRequired: 0, bg: 'linear-gradient(135deg,#ffcaa0,#c87a3c 45%,#7a3f18)', pip: '#3a1d08', swatch: '#c87a3c', shape: 'square',  faceType: 'classic', glyph: 'forge', border: '1px solid #ffd2a8', glow: '0 0 10px rgba(220,130,60,0.45)' },
    jade:      { name: 'Jade',            winsRequired: 0, bg: 'radial-gradient(circle at 32% 28%,#7bf0c0,#1aa37a 60%,#0a4a36)', pip: '#eafff5', swatch: '#1aa37a', shape: 'octagon', faceType: 'classic', border: '1px solid #a8ffe0', glow: '0 0 12px rgba(40,220,170,0.5)' },
    corail:    { name: 'Corail',          winsRequired: 0, bg: 'radial-gradient(circle at 32% 28%,#ff9a8c,#e0524a 60%,#7a1f1f)', pip: '#fff0ec', swatch: '#e0524a', shape: 'circle',  faceType: 'classic', glyph: 'crabe', glow: '0 0 11px rgba(255,110,90,0.5)' },
    sakura:    { name: 'Sakura',          winsRequired: 0, bg: 'linear-gradient(150deg,#ffe3f1,#ffb3d9 55%,#f06aa8)', pip: '#7a1f4e', swatch: '#ffb3d9', shape: 'circle',  faceType: 'classic', glyph: 'feuille', border: '1px solid #ffd6ea' },
    aurore:    { name: 'Aurore',          winsRequired: 0, bg: 'linear-gradient(150deg,#1a2a4a,#1aa37a 45%,#7a3bd6 80%)', pip: '#eafff7', swatch: '#1aa37a', shape: 'square',  faceType: 'classic', border: '1px solid rgba(180,255,230,0.6)', glow: '0 0 14px rgba(80,220,180,0.5)' },
    onyx:      { name: 'Onyx',            winsRequired: 0, bg: 'radial-gradient(circle at 34% 28%,#3a3a44,#15151c 65%,#050507)', pip: '#cfd2da', swatch: '#1f1f28', shape: 'octagon', faceType: 'classic', border: '1px solid #4a4a58', glow: '0 0 8px rgba(180,190,210,0.35)' },
    rosegold:  { name: 'Or Rose',         winsRequired: 0, bg: 'linear-gradient(135deg,#ffe3e0,#e8a8a0 45%,#b87a72)', pip: '#5a2a26', swatch: '#e8a8a0', shape: 'square',  faceType: 'classic', glyph: 'coeur', border: '1px solid #ffe3e0', glow: '0 0 10px rgba(230,160,150,0.5)' },
    royal:     { name: 'Royal',           winsRequired: 0, bg: 'radial-gradient(circle at 34% 28%,#6a4bd6,#2a1a6e 60%,#120833)', pip: '#ffe9a8', swatch: '#3a1d8e', shape: 'square',  faceType: 'classic', glyph: 'couronne2', border: '1px solid #ffe9a8', glow: '0 0 13px rgba(160,110,255,0.55)' }
};

// Animation visuelle par skin : 'shine' (brillance), 'pulse' (glow), 'holo', 'sparkle'
const SKIN_ANIM = {
    gold: 'shine', tresor: 'shine', couronne: 'shine', cuivre: 'shine', rosegold: 'shine', marbre: 'shine',
    rubis: 'shine', saphir: 'shine', emeraude: 'shine', jade: 'shine', amethyste: 'shine', corail: 'shine', pirate: 'shine', desert: 'shine',
    neon: 'pulse', neonrose: 'pulse', lave: 'pulse', toxique: 'pulse', foudre: 'pulse', vampire: 'pulse', sang: 'pulse', kraken: 'pulse', abysse: 'pulse', dragon: 'pulse', forge: 'pulse',
    holo: 'holo', arcenciel: 'holo', aurore: 'holo',
    galaxie: 'sparkle', nebuleuse: 'sparkle', obsidienne: 'sparkle', royal: 'sparkle', onyx: 'sparkle', lune: 'sparkle', ocean: 'sparkle'
};

// Transforme un style (perso OU skin) en spécification de rendu
function resolveSkin(styleObj) {
    styleObj = styleObj || myStyle;
    const skin = styleObj.skinId && SKINS[styleObj.skinId];
    if (skin) {
        return { bg: skin.bg, pip: skin.pip, shape: skin.shape, faceType: skin.faceType, border: skin.border || '', glow: skin.glow || '', face1: skin.face1 || '', glyph: skin.glyph || '', faceImage: '', anim: skin.anim || SKIN_ANIM[styleObj.skinId] || '' };
    }
    const useGrad = styleObj.useGradient && /^#[0-9a-fA-F]{6}$/.test(styleObj.bgColor2 || '');
    const baseBg = styleObj.bgColor || '#ffffff';
    const bg = useGrad ? `radial-gradient(circle at 32% 28%, ${baseBg}, ${styleObj.bgColor2})` : baseBg;
    const glow = /^#[0-9a-fA-F]{6}$/.test(styleObj.glowColor || '') ? `0 0 13px ${styleObj.glowColor}` : '';
    return { bg, pip: styleObj.dotColor || '#000000', shape: styleObj.shape || 'square', faceType: styleObj.faceType || 'classic', border: '', glow, face1: '', glyph: styleObj.glyph || '', faceImage: styleObj.faceImage || '', anim: '' };
}

// Rend un dessin (éléphant, chat, dragon...) à la place de la face 1, recoloré
const GLYPHS = window.DICE_GLYPHS || {};
function glyphSVG(key, pip) {
    const g = GLYPHS[key];
    if (!g) return '';
    const paths = g.paths.map(d => `<path d="${d}"/>`).join('');
    return `<svg width="34" height="34" viewBox="0 0 34 34" style="display:block; margin:auto;"><svg x="2" y="2" width="30" height="30" viewBox="${g.vb}" fill="${pip}" preserveAspectRatio="xMidYMid meet">${paths}</svg></svg>`;
}

// Anti-XSS défensif : tout pseudo/texte affiché passe par ici si besoin
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str == null ? '' : str);
    return div.innerHTML;
}

// Échappe une chaîne pour l'insérer dans un attribut onclick entre apostrophes
function escapeAttr(str) {
    return String(str == null ? '' : str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

let wasConnected = false;
socket.on('connect', () => {
    myId = socket.id;
    hideRecoOverlay();
    // Reconnexion (ex. après verrouillage du téléphone, perte de réseau) :
    // on se ré-annonce pour que le serveur nous remette dans notre partie en cours.
    if (myPseudo) {
        socket.emit('join_tavern', { pseudo: myPseudo, style: myStyle });
        if (wasConnected) showToast("Reconnecté ✅");
    }
    wasConnected = true;
});

socket.on('disconnect', () => {
    if (myPseudo) showRecoOverlay();
});

function showRecoOverlay() { const o = document.getElementById('reco-overlay'); if (o) o.style.display = 'flex'; }
function hideRecoOverlay() { const o = document.getElementById('reco-overlay'); if (o) o.style.display = 'none'; }

// ==========================================
// 🏴‍☠️ CONNEXION CLASSIQUE (VIA LE SERVEUR)
// ==========================================
function handleAuth(action) {
    const pseudo = document.getElementById('pseudo-input').value.trim();
    const password = document.getElementById('password-input').value.trim();
    if (pseudo.length < 3 || password.length < 3) { showAuthError("Ton nom et mot de passe doivent faire au moins 3 caractères !"); return; }

    if (action === 'register') socket.emit('register', { pseudo, password });
    else socket.emit('login', { pseudo, password });
}

socket.on('auth_error', (msg) => { showAuthError(msg); });

socket.on('auth_success', (data) => {
    myPseudo = data.pseudo;
    applyProfile(data.profile);
    myStyle = data.style;
    if (!myStyle) myStyle = { bgColor: '#ffffff', dotColor: '#000000', shape: 'square', faceType: 'classic' };

    const bgInput = document.getElementById('style-bg');
    if (bgInput) bgInput.value = myStyle.bgColor && myStyle.bgColor.startsWith('#') ? myStyle.bgColor : '#ffffff';
    const dotInput = document.getElementById('style-dot');
    if (dotInput) dotInput.value = myStyle.dotColor || '#000000';
    const gradEl = document.getElementById('style-gradient');
    if (gradEl) gradEl.checked = !!myStyle.useGradient;
    const bg2El = document.getElementById('style-bg2');
    if (bg2El) bg2El.value = (myStyle.bgColor2 && myStyle.bgColor2.startsWith('#')) ? myStyle.bgColor2 : '#8a5a2a';
    const glowOnEl = document.getElementById('style-glow-on');
    if (glowOnEl) glowOnEl.checked = !!(myStyle.glowColor && myStyle.glowColor.startsWith('#'));
    const glowEl = document.getElementById('style-glow');
    if (glowEl) glowEl.value = (myStyle.glowColor && myStyle.glowColor.startsWith('#')) ? myStyle.glowColor : '#ffd24a';

    initializing = true;
    selectShape(myStyle.shape || 'square');
    selectFaceType(myStyle.faceType || 'classic');
    initializing = false;

    renderSkinGallery();
    renderDice('preview-dice-container', PREVIEW_HAND, false, myStyle);
    renderLobbyDice();

    refreshHeaderPseudo();
    initMuteButton();
    updateDiceImagePreview();

    socket.emit('join_tavern', { pseudo: myPseudo, style: myStyle });
    socket.emit('get_tournaments');
    showScreen('lobby-screen');
    const _afterIntro = () => {
        if (pendingInvite) { const t = pendingInvite; pendingInvite = null; setTimeout(() => joinGame(t), 200); }
        else { setTimeout(maybeShowTutorial, 400); }
    };
    if (!window._introShown) { window._introShown = true; playIntro(_afterIntro); }
    else { _afterIntro(); }
    const voiceContainer = document.getElementById('voice-widget-container');
    if (voiceContainer) voiceContainer.style.display = 'flex';
});

// Le serveur pousse le profil à jour (après partie, Dudo...)
socket.on('profile_update', (p) => applyProfile(p));

// Met à jour l'onglet profil s'il est affiché
function updateProfileUI() {
    const view = document.getElementById('view-profil');
    if (view && view.style.display !== 'none') renderProfile();
}

// Une cellule chiffre + libellé
function statCell(val, lbl) {
    return `<div class="prof-stat"><span class="prof-num">${val}</span><span class="prof-lbl">${lbl}</span></div>`;
}

// Carte de stats complète (utilisée pour SON profil ET la fiche publique d'un joueur)
function statsCardHTML(s) {
    if (!s) return '';
    const pct = (s.winRate != null) ? s.winRate : (s.played > 0 ? Math.round(s.wins / s.played * 100) : 0);
    const wr1 = s.played1v1 > 0 ? Math.round(s.wins1v1 / s.played1v1 * 100) : 0;
    const wrM = s.playedMulti > 0 ? Math.round(s.winsMulti / s.playedMulti * 100) : 0;
    const botBlock = (s.botGames > 0)
        ? `<div class="sec-title">${t('prof_unranked')}</div>
           <div class="format-row"><span class="fmt-name">${t('prof_vs_ai')}</span><b>${s.botWins}</b> ${t('prof_w')} / ${s.botGames} ${t('prof_p')}</div>`
        : '';
    const streak = s.currentStreak || 0;
    const streakBlock = streak >= 2
        ? `<div class="streak-banner streak-lvl-${Math.min(streak, 5)}">
               <span class="streak-flame">🔥</span>
               <span class="streak-info"><b class="streak-num">${streak}</b> ${t('prof_streak')}${streak >= 5 ? ' — ' + t('prof_onfire') : ''}</span>
           </div>`
        : '';
    return `
        <div class="profile-cosmetic" style="background:${bannerBg(s)}">
            <div class="profile-avatar-wrap">${avatarHTML(s, 76)}</div>
        </div>
        <div class="points-banner">
            <span class="pts-num">${s.rankPoints}</span><span class="pts-lbl">${t('prof_rankpts')}</span>
            <span class="rank-pill">${s.rank}</span>
        </div>
        ${streakBlock}
        <div class="sec-title">${t('prof_overview')}</div>
        <div class="prof-stats">
            ${statCell(s.wins, t('prof_wins'))}
            ${statCell(s.played, t('prof_games'))}
            ${statCell(pct + ' %', t('prof_winrate'))}
            ${statCell(s.seconds, t('prof_seconds'))}
        </div>
        <div class="sec-title">${t('prof_byformat')}</div>
        <div class="format-row"><span class="fmt-name">1v1</span><b>${s.wins1v1}</b> ${t('prof_w')} / ${s.played1v1} ${t('prof_p')} <span class="fmt-pct">${wr1} %</span></div>
        <div class="format-row"><span class="fmt-name">${t('prof_multi')}</span><b>${s.winsMulti}</b> ${t('prof_w')} / ${s.playedMulti} ${t('prof_p')} · ${s.seconds} ${t('prof_2nd')} <span class="fmt-pct">${wrM} %</span></div>
        <div class="sec-title">${t('prof_playstyle')}</div>
        <div class="prof-stats">
            ${statCell(s.dudosWon, t('prof_dudos'))}
            ${statCell(s.calzasWon, t('prof_calzas'))}
            ${statCell(s.diceLost, t('prof_dicelost'))}
            ${statCell(s.bestStreak, t('prof_beststreak'))}
        </div>
        <div class="sec-title">${t('prof_advanced')}</div>
        <div class="prof-stats">
            ${statCell((s.bluffRate || 0) + ' %', t('prof_bluff'))}
            ${statCell((s.challengeRate || 0) + ' %', t('prof_challwon'))}
            ${statCell(s.eliminations || 0, t('prof_elims'))}
        </div>
        <div class="adv-row">
            <div class="adv-die"><div class="adv-die-label">🍀 ${t('prof_lucky')}</div>${miniDieHTML(s.luckyFace)}</div>
            <div class="adv-die"><div class="adv-die-label">🎯 ${t('prof_favface')}</div>${miniDieHTML(s.favFace)}</div>
            <div class="adv-die nem"><div class="adv-die-label">⚔️ ${t('prof_nemesis')}</div><div class="nem-name">${s.nemesis ? escapeHtml(s.nemesis.pseudo) : '—'}</div>${s.nemesis ? `<div class="nem-count">${s.nemesis.count}× ${t('prof_beaten')}</div>` : ''}</div>
        </div>
        ${questsHTML(s)}
        ${botBlock}
    `;
}

// Mini-dé statique (face porte-bonheur / préférée)
function miniDieHTML(face) {
    if (!face || face < 1 || face > 6) return '<span class="mini-die empty">—</span>';
    return `<span class="mini-die">${getDiceSVG(face, '#2a1806', 'classic')}</span>`;
}

// Quêtes avec barre de progression (dérivées des stats)
function questsHTML(s) {
    const quests = [
        { icon: '⚓', name: t('q_veteran'), cur: s.played || 0, target: 50 },
        { icon: '🏆', name: t('q_conqueror'), cur: s.wins || 0, target: 25 },
        { icon: '☠️', name: t('q_executioner'), cur: s.eliminations || 0, target: 50 },
        { icon: '🎯', name: t('q_calza_master'), cur: s.calzasWon || 0, target: 10 },
        { icon: '🔔', name: t('q_sleuth'), cur: s.dudosWon || 0, target: 30 },
        { icon: '🔥', name: t('q_unkillable'), cur: s.bestStreak || 0, target: 5 }
    ];
    const rows = quests.map(q => {
        const done = q.cur >= q.target;
        const pct = Math.min(100, Math.round((q.cur / q.target) * 100));
        return `<div class="quest-row${done ? ' done' : ''}">
            <span class="quest-icon">${q.icon}</span>
            <div class="quest-body">
                <div class="quest-head"><span class="quest-name">${q.name}</span><span class="quest-frac">${done ? '✓' : Math.min(q.cur, q.target) + '/' + q.target}</span></div>
                <div class="quest-bar"><span class="quest-fill" style="width:${pct}%"></span></div>
            </div>
        </div>`;
    }).join('');
    return `<div class="sec-title">${t('quests_title')}</div><div class="quests">${rows}</div>`;
}

function renderProfile() {
    const pseudoEl = document.getElementById('prof-pseudo');
    if (pseudoEl) pseudoEl.innerText = myPseudo;
    const card = document.getElementById('prof-stats-card');
    if (card) {
        const adminBtn = (myProfile && myProfile.isAdmin) ? `<button class="btn-secondary" onclick="openAdminPanel()" style="width:100%;margin-bottom:10px;">${t('prof_modpanel')}</button>` : '';
        card.innerHTML = adminBtn + `<button class="btn-secondary" onclick="openCosmetics()" style="width:100%;margin-bottom:10px;">${t('prof_customize')}</button>` + statsCardHTML(myProfile);
    }

    // Hauts faits / titres : sans icône. Débloqué -> équipable comme titre.
    const box = document.getElementById('prof-achievements');
    if (box) {
        let html = `<div class="title-row${myTitle === '' ? ' equipped' : ''}">
                        <div class="title-info"><span class="title-name">Aucun titre</span></div>
                        <button class="title-btn" onclick="event.stopPropagation(); setTitle('')">${myTitle === '' ? 'Équipé' : 'Choisir'}</button>
                    </div>`;
        html += Object.entries(ACHIEVEMENTS_CAT).map(([id, a]) => {
            const got = myAchievements.includes(id);
            const equipped = myTitle === id;
            const btn = got
                ? `<button class="title-btn" onclick="event.stopPropagation(); setTitle('${id}')">${equipped ? 'Équipé' : 'Équiper'}</button>`
                : `<span class="title-lock">🔒</span>`;
            return `<div class="title-row${got ? '' : ' locked'}${equipped ? ' equipped' : ''}" onclick="showBadgeInfo('${id}')">
                        <div class="title-info">
                            <span class="title-name">${a.name}</span>
                            <span class="title-cond">${a.desc}</span>
                        </div>
                        ${btn}
                    </div>`;
        }).join('');
        box.innerHTML = html;
    }
    const info = document.getElementById('badge-info');
    if (info) info.innerText = '';
}

// Équipe (ou retire) un titre débloqué
function setTitle(id) {
    if (id !== '' && !myAchievements.includes(id)) {
        showToast("Débloque d'abord ce haut fait !");
        return;
    }
    socket.emit('set_title', id);
}

// Affiche la condition d'un haut fait quand on clique dessus
function showBadgeInfo(id) {
    const a = ACHIEVEMENTS_CAT[id];
    const info = document.getElementById('badge-info');
    if (!a || !info) return;
    const got = myAchievements.includes(id);
    info.innerHTML = `<b>${a.name}</b> — ${a.desc}. ${got ? '<span style="color:#7ed957;">✅ Débloqué</span>' : '<span style="color:#ffca28;">🔒 À débloquer</span>'}`;
}

function openProfile() {
    switchLobbyTab('profil');
}

// =====================================================================
//  SONS (synthétisés via Web Audio API — aucun fichier à télécharger)
// =====================================================================
const Sound = (() => {
    let ctx = null;
    let muted = false;
    try { muted = localStorage.getItem('erquy_muted') === '1'; } catch (e) {}

    function ac() {
        if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
        if (ctx && ctx.state === 'suspended') ctx.resume();
        return ctx;
    }
    function tone(freq, start, dur, type = 'sine', gain = 0.15) {
        const c = ac(); if (!c) return;
        const o = c.createOscillator(), g = c.createGain();
        o.type = type; o.frequency.value = freq;
        o.connect(g); g.connect(c.destination);
        const t = c.currentTime + start;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.start(t); o.stop(t + dur + 0.02);
    }
    function noise(dur = 0.25, gain = 0.18) {
        const c = ac(); if (!c) return;
        const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        const src = c.createBufferSource(); src.buffer = buf;
        const g = c.createGain(); g.gain.value = gain;
        const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800;
        src.connect(f); f.connect(g); g.connect(c.destination);
        src.start();
    }
    return {
        isMuted: () => muted,
        ctx: () => ac(),
        unlock() { const c = ac(); if (c && c.state === 'suspended') c.resume(); },
        toggle() {
            muted = !muted;
            try { localStorage.setItem('erquy_muted', muted ? '1' : '0'); } catch (e) {}
            return muted;
        },
        setMuted(v) { muted = !!v; try { localStorage.setItem('erquy_muted', muted ? '1' : '0'); } catch (e) {} },
        roll() { if (!muted) noise(0.3, 0.14); },
        bid()  { if (!muted) tone(520, 0, 0.08, 'square', 0.08); },
        dudo() { if (!muted) { tone(440, 0, 0.18, 'sawtooth', 0.13); tone(300, 0.12, 0.22, 'sawtooth', 0.12); tone(200, 0.26, 0.3, 'sawtooth', 0.11); } },
        win()  { if (!muted) { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.25, 'triangle', 0.14)); } },
        ding() { if (!muted) { tone(880, 0, 0.07, 'square', 0.1); tone(1320, 0.07, 0.12, 'square', 0.09); } },
        champion() { if (!muted) { [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.13, 0.42, 'triangle', 0.13)); tone(523, 0.85, 1.3, 'sine', 0.09); tone(784, 0.85, 1.3, 'sine', 0.07); } },
        thunder() { if (!muted) { noise(0.7, 0.2); tone(68, 0, 0.7, 'sine', 0.18); tone(48, 0.12, 0.95, 'sine', 0.14); } },
        countTick(n) { if (!muted) { const f = 540 + Math.min(n, 12) * 70; tone(f, 0, 0.09, 'triangle', 0.12); tone(f * 2, 0.005, 0.06, 'sine', 0.05); } },
        tally(ok) { if (!muted) { if (ok) { [660, 880, 1175].forEach((f, i) => tone(f, i * 0.09, 0.22, 'triangle', 0.14)); } else { tone(320, 0, 0.22, 'sawtooth', 0.13); tone(200, 0.12, 0.3, 'sawtooth', 0.12); } } }
    };
})();

// ===================== AMBIANCE SONORE (vent / mer) =====================
const Ambient = (() => {
    let started = false, mood = '', nodes = [];
    const MOODS = {
        taverne: { noiseGain: 0.045, filterFreq: 470, lfoRate: 0.08, lfoDepth: 170, pad: [110, 138.6, 164.8], padGain: 0.020, padType: 'triangle' },
        mer:     { noiseGain: 0.050, filterFreq: 650, lfoRate: 0.12, lfoDepth: 240, pad: [98, 146.8, 196.0], padGain: 0.013, padType: 'sine' },
        tempete: { noiseGain: 0.072, filterFreq: 380, lfoRate: 0.22, lfoDepth: 260, pad: [55, 82.4], padGain: 0.022, padType: 'sawtooth' },
        calme:   { noiseGain: 0.022, filterFreq: 520, lfoRate: 0.05, lfoDepth: 90,  pad: [130.8, 164.8, 196.0], padGain: 0.022, padType: 'sine' }
    };
    function build(c, m) {
        const cfg = MOODS[m] || MOODS.taverne;
        // Nappe de bruit filtré (vent / mer)
        const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
        const d = buf.getChannelData(0);
        let last = 0;
        for (let i = 0; i < d.length; i++) { const w = (Math.random() * 2 - 1); last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
        const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
        const filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = cfg.filterFreq;
        const ng = c.createGain(); ng.gain.value = 0.0001;
        src.connect(filter); filter.connect(ng); ng.connect(c.destination);
        const lfo = c.createOscillator(); lfo.frequency.value = cfg.lfoRate;
        const lfoGain = c.createGain(); lfoGain.gain.value = cfg.lfoDepth;
        lfo.connect(lfoGain); lfoGain.connect(filter.frequency);
        src.start(); lfo.start();
        ng.gain.linearRampToValueAtTime(cfg.noiseGain, c.currentTime + 2.5);
        nodes.push(src, lfo, ng, filter, lfoGain);
        // Nappe d'accords douce (la "musique")
        const padGain = c.createGain(); padGain.gain.value = 0.0001;
        const padFilter = c.createBiquadFilter(); padFilter.type = 'lowpass'; padFilter.frequency.value = 900;
        padGain.connect(padFilter); padFilter.connect(c.destination);
        const trem = c.createOscillator(); trem.frequency.value = 0.06;
        const tremGain = c.createGain(); tremGain.gain.value = cfg.padGain * 0.5;
        trem.connect(tremGain); tremGain.connect(padGain.gain); trem.start();
        nodes.push(padGain, padFilter, trem, tremGain);
        cfg.pad.forEach((f, i) => {
            const o = c.createOscillator(); o.type = cfg.padType; o.frequency.value = f;
            o.detune.value = (i - 1) * 4;
            o.connect(padGain); o.start();
            nodes.push(o);
        });
        padGain.gain.linearRampToValueAtTime(cfg.padGain, c.currentTime + 3.5);
    }
    function start(m) {
        m = MOODS[m] ? m : 'taverne';
        if (started && mood === m) return;
        if (started) { stop(); setTimeout(() => start(m), 1150); return; }
        const c = Sound.ctx(); if (!c) return;
        try { build(c, m); mood = m; started = true; } catch (e) {}
    }
    function stop() {
        if (!started) return;
        const old = nodes; nodes = []; started = false; mood = '';
        try {
            const c = Sound.ctx();
            old.forEach(n => { try { if (n.gain) { n.gain.cancelScheduledValues(c.currentTime); n.gain.linearRampToValueAtTime(0.0001, c.currentTime + 0.9); } } catch (e) {} });
            setTimeout(() => old.forEach(n => { try { n.stop && n.stop(); } catch (e) {} try { n.disconnect && n.disconnect(); } catch (e) {} }), 1000);
        } catch (e) {}
    }
    return { start, stop };
})();

// ===================== RÉGLAGES (persistés) =====================
const SETTINGS = (() => {
    const DEF = { anim: true, intensity: 'full', sound: true, music: false, musicTrack: 'taverne', tavernier: false, ptt: false, spatial: false, reduced: false, bidAnim: 'all', battery: false, diceNum: false, fontScale: '1', contrast: false };
    let s = { ...DEF };
    try { const j = JSON.parse(localStorage.getItem('erquy_settings') || '{}'); s = { ...DEF, ...j }; } catch (e) {}
    // au 1er lancement, on aligne le son sur l'ancien réglage mute
    try { if (localStorage.getItem('erquy_settings') === null) s.sound = !(localStorage.getItem('erquy_muted') === '1'); } catch (e) {}
    function save() { try { localStorage.setItem('erquy_settings', JSON.stringify(s)); } catch (e) {} }
    function sysReduced() { try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
    function reducedMotion() { return s.reduced || s.battery || sysReduced(); }   // l'éco batterie coupe les grosses anims
    function apply() {
        const eco = s.battery;
        document.body.classList.toggle('battery-saver', eco);
        document.body.classList.toggle('reduced-motion', reducedMotion());
        document.body.classList.toggle('fx-off', !s.anim || reducedMotion());
        document.body.classList.toggle('fx-low', s.intensity !== 'full' || eco);
        document.body.classList.toggle('dice-numbers', !!s.diceNum);
        document.body.classList.toggle('high-contrast', !!s.contrast);
        try { document.documentElement.style.fontSize = (16 * (parseFloat(s.fontScale) || 1)) + 'px'; } catch (e) {}
        try { if (typeof applyPttUI === 'function') { applyPttUI(); applyPttMute(); } } catch (e) {}
        Sound.setMuted(!s.sound);
        if (s.music && s.sound && !reducedMotion() && !eco) Ambient.start(s.musicTrack); else Ambient.stop();
    }
    return {
        get: k => s[k],
        set(k, v) { s[k] = v; save(); apply(); },
        apply,
        animOn: () => s.anim && !reducedMotion(),
        heavyFx: () => s.anim && s.intensity === 'full' && !reducedMotion() && !s.battery,
        bidMode: () => (s.anim && !reducedMotion()) ? s.bidAnim : 'off',
        reduced: reducedMotion,
        eco: () => s.battery
    };
})();

function toggleMute() {
    const newSound = !SETTINGS.get('sound');
    SETTINGS.set('sound', newSound);
    const btn = document.getElementById('mute-btn');
    setMuteIcon(!newSound);
    if (newSound) Sound.bid();
}
// Application initiale des réglages
try { SETTINGS.apply(); document.addEventListener('DOMContentLoaded', () => { setMuteIcon(!SETTINGS.get('sound')); }); } catch (e) {}

function renderSettings() {
    const box = document.getElementById('settings-body');
    if (!box) return;
    const tog = (key, label, desc) => `<div class="set-row"><div class="set-info"><div class="set-label">${label}</div>${desc ? `<div class="set-desc">${desc}</div>` : ''}</div><button class="set-switch ${SETTINGS.get(key) ? 'on' : ''}" onclick="toggleSetting('${key}')" aria-label="${label}"><span></span></button></div>`;
    const seg = (key, label, opts) => `<div class="set-row col"><div class="set-label">${label}</div><div class="set-seg">${opts.map(o => `<button class="${SETTINGS.get(key) === o.v ? 'active' : ''}" onclick="pickSetting('${key}','${o.v}')">${o.t}</button>`).join('')}</div></div>`;
    box.innerHTML =
        '<div class="set-row col"><div class="set-label">' + t('set_lang') + '</div><div class="set-seg">' +
        ['fr', 'en', 'es'].map(l => `<button class="${LANG === l ? 'active' : ''}" onclick="setLang('${l}')">${({ fr: 'Français', en: 'English', es: 'Español' })[l]}</button>`).join('') +
        '</div></div>' +
        tog('anim', t('set_anim'), t('set_anim_d')) +
        seg('intensity', t('set_intensity'), [{ v: 'full', t: t('set_full') }, { v: 'low', t: t('set_low') }]) +
        seg('bidAnim', t('set_bidanim'), [{ v: 'all', t: t('set_always') }, { v: 'others', t: t('set_others') }, { v: 'off', t: t('set_never') }]) +
        tog('sound', t('set_sound'), t('set_sound_d')) +
        tog('music', t('set_music'), t('set_music_d')) +
        seg('musicTrack', t('set_ambiance'), [{ v: 'taverne', t: t('set_taverne') }, { v: 'mer', t: t('set_mer') }, { v: 'tempete', t: t('set_tempete') }, { v: 'calme', t: t('set_calme') }]) +
        tog('tavernier', t('set_tavernier'), t('set_tavernier_d')) +
        tog('ptt', t('set_ptt'), t('set_ptt_d')) +
        tog('spatial', t('set_spatial'), t('set_spatial_d')) +
        tog('reduced', t('set_reduced'), t('set_reduced_d')) +
        tog('battery', t('set_battery'), t('set_battery_d')) +
        '<div class="set-section">' + t('set_access') + '</div>' +
        tog('diceNum', t('set_dicenum'), t('set_dicenum_d')) +
        tog('contrast', t('set_contrast'), t('set_contrast_d')) +
        seg('fontScale', t('set_fontsize'), [{ v: '1', t: t('set_normal') }, { v: '1.12', t: t('set_big') }, { v: '1.25', t: t('set_xbig') }]);
}
function toggleSetting(k) {
    SETTINGS.set(k, !SETTINGS.get(k));
    renderSettings();
    setMuteIcon(!SETTINGS.get('sound'));
}
function pickSetting(k, v) { SETTINGS.set(k, v); renderSettings(); }
function openSettings() { renderSettings(); const m = document.getElementById('settings-modal'); if (m) m.style.display = 'flex'; Sound.unlock(); }
function closeSettings() { const m = document.getElementById('settings-modal'); if (m) m.style.display = 'none'; }

// ===================== TEMPÊTE PIRATE + CONFETTIS (victoire) =====================
let _confettiRAF = null;
function runConfetti(canvas, count, colors) {
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = canvas.clientWidth || window.innerWidth, H = canvas.clientHeight || window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
    const pal = colors || ['#ffd86b', '#ffe9a8', '#d4af37', '#fff7e0', '#caa233', '#b9ffd2'];
    const parts = [];
    for (let i = 0; i < count; i++) {
        parts.push({
            x: Math.random() * W, y: -20 - Math.random() * H * 0.5,
            vx: (Math.random() - 0.5) * 2.4, vy: 2 + Math.random() * 3.5,
            size: 5 + Math.random() * 7, rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
            color: pal[(Math.random() * pal.length) | 0], sway: Math.random() * 2
        });
    }
    let t0 = performance.now();
    if (_confettiRAF) cancelAnimationFrame(_confettiRAF);
    function frame(now) {
        const elapsed = now - t0;
        ctx.clearRect(0, 0, W, H);
        let alive = 0;
        for (const p of parts) {
            p.x += p.vx + Math.sin((now / 400) + p.sway) * 0.6;
            p.y += p.vy; p.rot += p.vr; p.vy += 0.02;
            if (p.y < H + 20) alive++;
            ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
            ctx.fillStyle = p.color; ctx.globalAlpha = elapsed > 2600 ? Math.max(0, 1 - (elapsed - 2600) / 900) : 1;
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.45);
            ctx.restore();
        }
        if (alive > 0 && elapsed < 3600) _confettiRAF = requestAnimationFrame(frame);
        else { ctx.clearRect(0, 0, W, H); _confettiRAF = null; }
    }
    _confettiRAF = requestAnimationFrame(frame);
}
function flashLightning() {
    const fl = document.querySelector('#storm-overlay .storm-flash');
    if (!fl) return;
    fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
}
function playVictoryStorm(opts) {
    opts = opts || {};
    if (!SETTINGS.animOn()) return;
    const ov = document.getElementById('storm-overlay');
    if (!ov) return;
    const heavy = SETTINGS.heavyFx();
    ov.classList.toggle('heavy', heavy);
    ov.style.display = 'block';
    ov.classList.remove('show'); void ov.offsetWidth; ov.classList.add('show');
    if (heavy) [180, 850, 1650].forEach(d => setTimeout(() => { flashLightning(); Sound.thunder(); }, d));
    runConfetti(ov.querySelector('canvas'), heavy ? 150 : 70, opts.colors);
    clearTimeout(ov._t);
    ov._t = setTimeout(() => { ov.classList.remove('show'); setTimeout(() => { ov.style.display = 'none'; }, 700); }, heavy ? 3900 : 2700);
}

// ===================== ÉCRAN DE SACRE DU CHAMPION + RECAP =====================
function showChampionScreen(state) {
    if (!state || !state.champion) return;
    const scr = document.getElementById('champion-screen');
    if (!scr) return;
    const champ = state.champion;
    // Parcours : matchs du tableau gagnés par le champion, dans l'ordre des tours
    const path = [];
    if (state.bracket) state.bracket.forEach((round, ri) => {
        round.forEach(m => {
            if (m.stage !== 'third' && m.winner === champ && (m.a === champ || m.b === champ)) {
                const opp = (m.a === champ) ? m.b : m.a;
                if (opp) path.push({ round: tourneyRoundName(ri, state), opp });
            }
        });
    });
    const nameEl = document.getElementById('champ-name');
    if (nameEl) nameEl.textContent = champ;
    const meChamp = champ === myPseudo;
    const lbl = document.getElementById('champ-label');
    if (lbl) lbl.textContent = meChamp ? 'Tu es le Champion !' : 'Champion du tournoi';
    const recap = document.getElementById('champ-recap');
    if (recap) recap.innerHTML = path.length
        ? path.map((p, i) => `<div class="champ-step" style="animation-delay:${0.7 + i * 0.28}s"><span class="cs-round">${p.round}</span><span class="cs-arrow">›</span><span class="cs-opp">${escapeHtml(p.opp)}</span></div>`).join('')
        : '';
    scr.style.display = 'flex';
    scr.classList.remove('show'); void scr.offsetWidth; scr.classList.add('show');
    if (SETTINGS.animOn()) { Sound.champion(); playVictoryStorm({ colors: ['#ffd86b', '#ffe9a8', '#d4af37', '#fff7e0', '#caa233'] }); }
    else Sound.win();
}
function closeChampionScreen() {
    const scr = document.getElementById('champion-screen');
    if (scr) { scr.classList.remove('show'); setTimeout(() => { scr.style.display = 'none'; }, 400); }
}

// Braises flottantes de la taverne (ambiance)
(function () {
    function build() {
        const layer = document.getElementById('ambient-layer');
        if (!layer || layer.childElementCount) return;
        let h = '';
        for (let i = 0; i < 16; i++) {
            const left = Math.random() * 100;
            const dur = 9 + Math.random() * 11;
            const delay = -Math.random() * dur;
            const size = 2 + Math.random() * 3;
            const drift = (Math.random() * 50 - 25);
            h += `<span style="left:${left}%;width:${size}px;height:${size}px;animation-duration:${dur}s;animation-delay:${delay}s;--drift:${drift}px;"></span>`;
        }
        layer.innerHTML = h;
    }
    if (document.readyState !== 'loading') build();
    else document.addEventListener('DOMContentLoaded', build);
})();

// iOS/Safari bloquent l'AudioContext tant qu'il n'y a pas eu de geste : on le débloque au 1er tap
(function () {
    function unlock() { try { Sound.unlock(); } catch (e) {} }
    document.addEventListener('touchend', unlock, { once: true, passive: true });
    document.addEventListener('click', unlock, { once: true });
})();

// Wake Lock : empêche l'écran de s'éteindre pendant une partie (jeu au tour par tour = on attend)
let wakeLock = null;
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator && !wakeLock) {
            wakeLock = await navigator.wakeLock.request('screen');
            wakeLock.addEventListener('release', () => { wakeLock = null; });
        }
    } catch (e) { /* refusé / non supporté : on ignore */ }
}
function releaseWakeLock() {
    try { if (wakeLock) { wakeLock.release(); wakeLock = null; } } catch (e) {}
}
// Re-demande le verrou quand on revient sur l'onglet (le verrou saute en arrière-plan)
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && (currentGameId || spectating)) requestWakeLock();
});
const SVG_SOUND_ON = '<svg viewBox="0 0 100 100" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M18,58V42a6,6,0,0,1,6-6h8L45.65,22.83A2.49,2.49,0,0,1,50,24.5v51a2.49,2.49,0,0,1-4.35,1.67L32,64H24A6,6,0,0,1,18,58Zm43.41,3.2a16,16,0,0,0,0-22.4A2,2,0,0,0,58,40.14V59.86A2,2,0,0,0,61.41,61.2Zm2.2,17.73a31.95,31.95,0,0,0,0-57.85,4,4,0,0,0-3.33,7.24,24,24,0,0,1,0,43.37,4,4,0,0,0,3.33,7.24Z"/></svg>';
const SVG_SOUND_OFF = '<svg viewBox="0 0 32 32" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M8.106,28.13647A4.99038,4.99038,0,0,0,12,30a8.49755,8.49755,0,0,0,7.42822-4.37079L22,21a11.07814,11.07814,0,0,0,5-9,10.02035,10.02035,0,0,0-.30334-2.45416Z"/><path d="M27.707,4.293a.99962.99962,0,0,0-1.41406,0L24.81952,5.76642A10.0001,10.0001,0,0,0,7,12V23.58594L4.293,26.293A.99989.99989,0,0,0,5.707,27.707l22-22A.99962.99962,0,0,0,27.707,4.293Zm-7.19934,5.7854A3.99969,3.99969,0,0,0,13,12v.1123a4.51767,4.51767,0,0,1,3.049,2.42481l-1.57843,1.57855A2.50335,2.50335,0,0,0,12,14a.99943.99943,0,0,1-1-1V12A5.99858,5.99858,0,0,1,21.95966,8.62653Z"/></svg>';
function setMuteIcon(muted) {
    const btn = document.getElementById('mute-btn');
    if (btn) btn.innerHTML = muted ? SVG_SOUND_OFF : SVG_SOUND_ON;
}
function initMuteButton() {
    setMuteIcon(Sound.isMuted());
}

// Zone "Tes dés" : bascule en mode spectateur quand on est éliminé (0 dé)
function updateMineArea(dice) {
    const mine = document.querySelector('.g-mine');
    const label = document.querySelector('.g-mine-label');
    const dc = document.getElementById('player-dice');
    if (dice <= 0) {
        if (mine) mine.classList.add('spectating');
        if (label) label.innerHTML = t('g_spectating');
        if (dc) dc.style.display = 'none';
    } else {
        if (mine) mine.classList.remove('spectating');
        if (label) label.innerHTML = t('g_yours') + ' · <span id="player-count">' + dice + '</span>';
        if (dc) dc.style.display = '';
    }
}

// Carte d'un joueur autour de la table : pseudo centré, "X dés", puis les dés en ligne
function opponentCardHTML(p) {
    return `<div class="opponent-card" id="opp-${p.id}"><div class="oc-head"><span class="oc-ava">${avatarHTML(p, 32)}</span><span class="oc-name" data-pseudo="${escapeAttr(p.pseudo)}" onclick="viewPlayer(this.dataset.pseudo)" style="color:${pNameColor(p)}">${escapeHtml(p.pseudo)}</span><span class="oc-count">· <span id="opp-dice-count-${p.id}">${p.dice}</span> dés</span></div><div class="dice-container" id="dice-${p.id}"></div></div>`;
}

// Intro animée (logo Perudo) — jouée à la connexion, avant le lobby
function playIntro(done) {
    const el = document.getElementById('intro-splash');
    if (!el || !SETTINGS.animOn()) { if (done) done(); return; }
    el.style.display = 'flex';
    el.classList.remove('show', 'out'); void el.offsetWidth; el.classList.add('show');
    try { Sound.unlock(); } catch (e) {}
    setTimeout(() => {
        try { if (SETTINGS.heavyFx()) runConfetti(el.querySelector('.intro-confetti'), 90, ['#ffd86b', '#ffe9a8', '#fff7e0', '#caa233']); } catch (e) {}
        try { Sound.champion(); } catch (e) {}
    }, 750);
    setTimeout(() => el.classList.add('out'), 2050);
    setTimeout(() => { el.style.display = 'none'; el.classList.remove('show', 'out'); if (done) done(); }, 2650);
}

// =====================================================================
//  ANIMATIONS (déclenchées en ajoutant une classe CSS éphémère)
// =====================================================================
function playRollAnim(containerId) {
    const c = document.getElementById(containerId);
    if (!c || !SETTINGS.animOn()) return;
    const cup = (typeof myCup !== 'undefined' && CUPS[myCup]) ? myCup : 'chute';
    const cupCls = 'cup-' + cup;
    c.querySelectorAll('.dice').forEach((d, i) => {
        d.style.animationDelay = (i * 60) + 'ms';
        d.classList.remove('rolling', 'cup-chute', 'cup-tourbillon', 'cup-rebond', 'cup-eclair', 'cup-pirate');
        void d.offsetWidth; d.classList.add('rolling', cupCls);
        setTimeout(() => d.classList.remove('rolling', cupCls), 800 + i * 60);
    });
}
function playRevealAnim(containerId) {
    const c = document.getElementById(containerId);
    if (!c) return;
    c.querySelectorAll('.dice').forEach((d, i) => {
        d.style.animationDelay = (i * 50) + 'ms';
        d.classList.remove('revealing'); void d.offsetWidth; d.classList.add('revealing');
        setTimeout(() => d.classList.remove('revealing'), 600 + i * 50);
    });
}

// =====================================================================
//  ÉMOTES RAPIDES
// =====================================================================
function toggleEmoteBar() {
    const bar = document.getElementById('emote-bar');
    if (!bar) return;
    if (!bar.dataset.built) {
        bar.innerHTML = Object.entries(EMOTES).map(([k, e]) =>
            `<button class="emote-pick" onclick="sendEmote('${k}')">${e}</button>`).join('');
        bar.dataset.built = '1';
    }
    bar.style.display = bar.style.display === 'flex' ? 'none' : 'flex';
}
function sendEmote(key) {
    if (currentGameId) socket.emit('send_emote', { gameId: currentGameId, emote: key });
    const bar = document.getElementById('emote-bar');
    if (bar) bar.style.display = 'none';
    closeEmotePanel();
}
// Grand sélecteur d'émotes : feuille plein écran scrollable
function toggleEmotePanel() {
    if (document.getElementById('emote-overlay')) { closeEmotePanel(); return; }
    const grid = EMOTE_ORDER.map(k =>
        `<button class="emote-pick" onclick="sendEmote('${k}')" aria-label="${k}">${emoteSVG(k)}</button>`).join('');
    const ov = document.createElement('div');
    ov.id = 'emote-overlay'; ov.className = 'emote-overlay';
    ov.innerHTML = `<div class="emote-sheet">
        <div class="emote-sheet-head"><span>${t('emote_title')}</span><button class="emote-close" onclick="closeEmotePanel()" aria-label="${t('m_close')}">✕</button></div>
        <div class="emote-grid">${grid}</div>
    </div>`;
    ov.addEventListener('click', (e) => { if (e.target === ov) closeEmotePanel(); });
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('show'));
}
function closeEmotePanel() { const o = document.getElementById('emote-overlay'); if (o) o.remove(); }
socket.on('emote', ({ pseudo, emoji, emote }) => {
    const layer = document.getElementById('emote-layer');
    if (!layer) return;
    const bubble = document.createElement('div');
    bubble.className = 'emote-bubble';
    const visual = emote && EMOTE_SVG[emote] ? EMOTE_SVG[emote] : `<span style="font-size:2.4rem">${emoji || '❓'}</span>`;
    bubble.innerHTML = `<span class="emote-big">${visual}</span><span class="emote-from">${escapeHtml(pseudo)}</span>`;
    layer.appendChild(bubble);
    setTimeout(() => bubble.remove(), 2200);
});

// =====================================================================
//  IMAGE PERSO SUR LA FACE PACO (face "1")
//  L'image est réduite à 64x64 pour rester légère (stockage + réseau).
// =====================================================================
function handleDiceImage(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    if (!file.type || file.type.indexOf('image/') !== 0) { showToast("Choisis un fichier image."); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const size = 64;
            const canvas = document.createElement('canvas');
            canvas.width = size; canvas.height = size;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, size, size);
            const scale = Math.min(size / img.width, size / img.height);
            const w = img.width * scale, h = img.height * scale;
            ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
            let data = canvas.toDataURL('image/webp', 0.85);
            if (data.indexOf('data:image/webp') !== 0) data = canvas.toDataURL('image/png');
            myStyle.faceImage = data;
            myStyle.skinId = null;            // l'image n'a de sens qu'en mode perso
            updateDiceImagePreview();
            renderDice('preview-dice-container', PREVIEW_HAND, false, myStyle);
            socket.emit('save_style', myStyle);
            styleDirty = false; updateSaveBubble();
            showToast("Image ajoutée sur la face Paco ✨");
        };
        img.onerror = () => showToast("Image illisible, essaie un autre fichier.");
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
    input.value = "";                          // permet de re-choisir le même fichier
}

function removeDiceImage() {
    delete myStyle.faceImage;
    updateDiceImagePreview();
    renderDice('preview-dice-container', PREVIEW_HAND, false, myStyle);
    socket.emit('save_style', myStyle);
    styleDirty = false; updateSaveBubble();
    showToast("Image retirée.");
}

function updateDiceImagePreview() {
    const status = document.getElementById('dice-image-status');
    const rm = document.getElementById('dice-image-remove');
    const has = !!myStyle.faceImage;
    if (status) status.innerText = has ? '✅ Image active sur la face Paco' : '';
    if (rm) rm.style.display = has ? 'inline-block' : 'none';
}

// =====================================================================
//  HAUTS FAITS / TITRES : annonce de déblocage
// =====================================================================
socket.on('achievement_unlocked', (a) => {
    Sound.ding();
    showToast(`🏅 Titre débloqué : ${a.name} — équipe-le dans ton profil !`);
});
socket.on('title_rejected', (msg) => showToast(msg || "Titre indisponible."));

// Petit toast générique en bas d'écran
let toastTimer = null;
function showToast(msg) {
    let t = document.getElementById('toast');
    if (!t) return;
    t.innerHTML = msg;
    t.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

// En-tête : pseudo cliquable (ouvre le profil) + titre équipé en dessous
function refreshHeaderPseudo() {
    const el = document.getElementById('my-pseudo-display');
    if (!el) return;
    const titleName = myTitle && ACHIEVEMENTS_CAT[myTitle] ? ACHIEVEMENTS_CAT[myTitle].name : '';
    const nc = (myProfile && myProfile.nameColor) ? `style="color:${myProfile.nameColor}"` : '';
    el.innerHTML = (titleName ? `<span class="user-title">${escapeHtml(titleName)}</span>` : '')
        + `<span class="user-pseudo" ${nc} onclick="openProfile()">${escapeHtml(myPseudo)}</span>`;
}


function showAuthError(msg) {
    const el = document.getElementById('auth-error');
    el.innerText = "❌ " + msg; el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 4000);
}

function showBidError(msg) {
    const el = document.getElementById('bid-error');
    el.innerText = "⚠️ " + msg; el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 6000);
}

function showSuccessMsg(elementId, msg) {
    const el = document.getElementById(elementId);
    el.innerText = "✅ " + msg; el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 4000);
}

// Affiche / masque le mot de passe (le petit œil)
function togglePassword() {
    const input = document.getElementById('password-input');
    const btn = document.getElementById('pw-toggle');
    if (!input) return;
    const reveal = input.type === 'password';
    input.type = reveal ? 'text' : 'password';
    if (btn) {
        btn.textContent = reveal ? '🙈' : '👁️';
        btn.classList.toggle('revealed', reveal);
        btn.setAttribute('aria-label', reveal ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
    }
}

// Quantité minimale LÉGALE pour une face donnée (miroir de checkRuleValidity)
function minLegalQty(f) {
    const oq = currentBid.qty, of = currentBid.face;
    if (!f) return 1;
    if (oq === 0) return 1;                                  // ouverture
    if (isPalifico) {
        const lockedFace = palificoFace || (of !== 1 ? of : null);
        if (of === 1) {
            if (f === 1) return oq + 1;                      // monter les Pacos
            if (lockedFace && f === lockedFace) return oq * 2;  // quitter les Pacos : le double
            return null;                                     // face interdite
        }
        if (f === of) return oq + 1;                         // monter sur la face verrouillée
        if (f === 1) return Math.ceil(oq / 2);               // passer aux Pacos : moitié supérieure
        return null;
    }
    if (of !== 1) {
        if (f === 1) return Math.ceil(oq / 2);               // passer aux Pacos
        if (f > of) return oq;                               // face supérieure : même quantité possible
        return oq + 1;                                       // face ≤ : il faut au moins +1
    }
    if (f === 1) return oq + 1;                              // monter les Pacos
    return oq * 2;                                           // quitter les Pacos : le double
}

// Boutons +/- de la quantité de mise (bien plus pratique que de taper au clavier)
function stepQty(delta) {
    const input = document.getElementById('bid-qty');
    if (!input) return;
    let v = (parseInt(input.value) || 0) + delta;
    const minQ = (selectedFace ? minLegalQty(selectedFace) : 1) || 1;  // jamais sous le minimum légal
    v = Math.max(minQ, v);
    if (totalDiceInGame > 0) v = Math.min(v, Math.max(minQ, totalDiceInGame));  // jamais plus de dés qu'en jeu
    input.value = v;
}

// Tap = +1 ; appui maintenu = incrément rapide accéléré
function setupQtyButtons() {
    const wire = (id, delta) => {
        const btn = document.getElementById(id);
        if (!btn || btn._wired) return;
        btn._wired = true;
        let holdTimer = null, repeatTimer = null, speed = 130;
        const stop = () => { clearTimeout(holdTimer); clearTimeout(repeatTimer); holdTimer = repeatTimer = null; };
        const start = (e) => {
            e.preventDefault();
            stop();
            stepQty(delta);
            if (navigator.vibrate) navigator.vibrate(8);
            speed = 130;
            holdTimer = setTimeout(function tick() {
                stepQty(delta);
                speed = Math.max(45, speed - 12);   // accélère progressivement
                repeatTimer = setTimeout(tick, speed);
            }, 380);
        };
        btn.addEventListener('pointerdown', start);
        btn.addEventListener('pointerup', stop);
        btn.addEventListener('pointerleave', stop);
        btn.addEventListener('pointercancel', stop);
    };
    wire('qty-minus', -1);
    wire('qty-plus', 1);
}
document.addEventListener('DOMContentLoaded', setupQtyButtons);

// Confirmation réutilisable (mobile-friendly)
let _confirmCb = null;
function askConfirm(msg, onYes, yesLabel) {
    _confirmCb = onYes;
    const ov = document.getElementById('confirm-overlay');
    const m = document.getElementById('confirm-msg');
    const yes = document.getElementById('confirm-yes');
    if (m) m.textContent = msg;
    if (yes) { yes.textContent = yesLabel || 'Confirmer'; yes.onclick = () => { const cb = _confirmCb; closeConfirm(); if (cb) cb(); }; }
    if (ov) { ov.style.display = 'flex'; ov.classList.remove('show'); void ov.offsetWidth; ov.classList.add('show'); }
}
function closeConfirm() { const ov = document.getElementById('confirm-overlay'); if (ov) { ov.classList.remove('show'); setTimeout(() => { ov.style.display = 'none'; }, 180); } _confirmCb = null; }
function confirmLeaveGame() {
    if (spectating) { leaveGame(); return; }   // spectateur : pas de confirmation
    closeGameMenu();
    askConfirm("Quitter la table ? Tu perdras ta place dans la partie en cours.", () => leaveGame(), "Quitter");
}
function openGameMenu() { const m = document.getElementById('game-menu'); if (m) { m.style.display = 'flex'; m.classList.remove('show'); void m.offsetWidth; m.classList.add('show'); } }
function closeGameMenu() { const m = document.getElementById('game-menu'); if (m) { m.classList.remove('show'); setTimeout(() => { m.style.display = 'none'; }, 220); } }
function openRulesHelp() { const m = document.getElementById('rules-modal'); if (m) m.style.display = 'flex'; }
function closeRulesHelp() { const m = document.getElementById('rules-modal'); if (m) m.style.display = 'none'; }
function copyInviteLink() {
    if (!currentGameId) return;
    const url = `${location.origin}${location.pathname}?table=${encodeURIComponent(currentGameId)}`;
    closeGameMenu();
    const ok = () => showToast("Lien d'invitation copié ! Partage-le à tes amis.");
    if (navigator.share) { navigator.share({ title: "La Taverne d'Erquy", text: 'Rejoins ma table de Perudo !', url }).catch(() => {}); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(url).then(ok).catch(() => prompt('Copie ce lien :', url)); }
    else prompt('Copie ce lien :', url);
}

// ----- PROFIL CONSULTABLE D'UN AUTRE JOUEUR (depuis une carte en jeu) -----
function viewPlayer(pseudo) {
    if (!pseudo) return;
    if (pseudo === myPseudo) { openProfile(); return; }   // mon propre profil : vue complète
    const cached = lastLeaderboard && lastLeaderboard.find(u => u.pseudo === pseudo);
    if (cached) { openPlayerCard(pseudo); return; }        // déjà en cache (classement)
    socket.emit('get_profile', pseudo);                    // sinon on demande au serveur
    const modal = document.getElementById('player-card-modal');
    const body = document.getElementById('player-card-body');
    if (body) body.innerHTML = '<p style="text-align:center;color:#9aa3ab;padding:18px;">Chargement…</p>';
    if (modal) modal.style.display = 'flex';
}
socket.on('profile_view', (d) => {
    const body = document.getElementById('player-card-body');
    if (!body) return;
    if (!d) { body.innerHTML = '<p style="text-align:center;color:#9aa3ab;padding:18px;">Profil introuvable.</p>'; return; }
    const titleLine = d.equippedTitle ? `<div class="player-card-title">${escapeHtml(d.equippedTitle)}</div>` : '';
    body.innerHTML = `<h2 style="color:var(--gold);font-family:'Pirata One',cursive;margin:0 0 2px;">🏴‍☠️ ${escapeHtml(d.pseudo)}</h2>${titleLine}${statsCardHTML(d)}`;
});

function switchLobbyTab(tabName) {
    document.querySelectorAll('.lobby-nav .btn-tab').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.lobby-container').forEach(el => el.style.display = 'none');
    const topBtn = document.getElementById(`tab-btn-${tabName}`);
    if (topBtn) topBtn.classList.add('active');
    const view = document.getElementById(`view-${tabName}`);
    if (view) {
        view.style.display = 'flex';
        if (SETTINGS.animOn()) { view.classList.remove('tab-in'); void view.offsetWidth; view.classList.add('tab-in'); }
    }
    // Barre de navigation mobile : on met le bon onglet en surbrillance
    document.querySelectorAll('#bottom-nav .bnav-item').forEach(el => el.classList.remove('active'));
    const bBtn = document.getElementById(`bnav-${tabName}`);
    if (bBtn) bBtn.classList.add('active');
    // L'onglet courant sert à n'afficher la bulle "+" que sur Les Tables
    document.body.dataset.lobbyTab = tabName;
    if (tabName === 'style') {
        renderSkinGallery();
        renderDice('preview-dice-container', PREVIEW_HAND, false, myStyle);
    }
    if (tabName === 'profil') renderProfile();
    if (tabName === 'campagne') renderCampaign();
    if (tabName === 'tavern') socket.emit('get_tournaments');
}

// ----- CAMPAGNE -----
const MOD_ICON = { tempete: 'compass', brouillard: 'lock', malediction: 'skull' };

socket.on('campaign_data', (d) => {
    if (d && Array.isArray(d.levels)) {
        CAMPAIGN_DATA = d;
        const v = document.getElementById('view-campagne');
        if (v && v.style.display !== 'none') renderCampaign();
    }
});

function renderCampaign() {
    const map = document.getElementById('campaign-map');
    if (!map) return;
    const levels = CAMPAIGN_DATA.levels || [];
    const chapters = CAMPAIGN_DATA.chapters || {};
    const mods = CAMPAIGN_DATA.mods || {};
    const done = myCampaignLevel || 0;
    const total = levels.length || 1;
    const maxStars = myCampaignMaxStars || (total * 3);

    const fill = document.getElementById('campaign-progress-fill');
    if (fill) fill.style.width = Math.round((done / total) * 100) + '%';
    const lbl = document.getElementById('campaign-progress-label');
    if (lbl) {
        const done100 = myCampaignTotalStars >= maxStars && maxStars > 0;
        lbl.innerHTML = `${svgIcon('star', 13)} ${myCampaignTotalStars}/${maxStars} étoiles · ${done}/${total} niveaux`
            + (done100 ? ` <span class="camp-100">— 100% : dé Trésor débloqué !</span>` : '');
    }

    const previews = [];   // aperçus de dés à rendre après l'injection HTML
    let html = '';
    let lastChapter = null;
    let chapterNum = 0;
    levels.forEach(lvl => {
        const ch = chapters[lvl.chapter] || {};
        const accent = ch.accent || '#d4af37';
        if (lvl.chapter !== lastChapter) {
            chapterNum++;
            html += `<div class="camp-chapter ch-${chapterNum}" style="--accent:${accent}">
                <div class="cc-head">${svgIcon('compass', 18)}<span>Chapitre ${chapterNum}</span></div>
                <div class="cc-name">${escapeHtml(lvl.chapter)}</div>
                <div class="cc-lore">${escapeHtml(ch.lore || '')}</div>
            </div>`;
            lastChapter = lvl.chapter;
        }
        const completed = lvl.id <= done;
        const unlocked = lvl.id <= done + 1;
        const isCurrent = lvl.id === done + 1;
        const side = (lvl.id % 2 === 0) ? 'pos-r' : 'pos-l';
        let state = completed ? 'st-done' : (unlocked ? 'st-open' : 'st-locked');
        if (lvl.boss) state += ' st-boss';
        if (lvl.mini) state += ' st-mini';
        if (isCurrent) state += ' st-current';
        const ico = completed ? svgIcon('check', 26)
            : (!unlocked ? svgIcon('lock', 22)
                : (lvl.boss ? svgIcon('skull', 28) : svgIcon('play', 26)));
        const diffs = [...new Set(lvl.bots.map(b => DIFF_LABEL[b.diff] || b.diff))].join(', ');
        const advTxt = `${lvl.bots.length} adversaire${lvl.bots.length > 1 ? 's' : ''} · ${diffs}`;
        const goal = lvl.starGoal || (lvl.bots.length === 1 ? 3 : 2);
        const sc = myCampaignStars[lvl.id] || 0;
        const clickable = unlocked ? `onclick="playCampaignLevel(${lvl.id})"` : '';
        const rewardBadge = ((lvl.reward || lvl.chest) && !completed) ? `<span class="cm-gift">${svgIcon('gift', 13)}</span>` : '';
        const shipMarker = isCurrent ? `<span class="cm-ship">${svgIcon('anchor', 16)}</span>` : '';
        const playLine = unlocked ? `<div class="cl-go">${completed ? 'Rejouer' : 'Jouer'} ${svgIcon('play', 12)}</div>` : `<div class="cl-go locked">Verrouillé ${svgIcon('lock', 11)}</div>`;
        // Étoiles (1-3) sous forme de rangée pour les niveaux faits
        const starsRow = `<div class="cl-stars">${[1, 2, 3].map(i => `<span class="${i <= sc ? 'on' : 'off'}">${svgIcon('star', 14)}</span>`).join('')}</div>`;
        // Détail des 3 défis (sur le niveau courant)
        const defiList = isCurrent ? `<div class="cl-defis">
            <span class="${sc >= 1 ? 'done' : ''}">${svgIcon('star', 10)} Gagner</span>
            <span class="${sc >= 2 ? 'done' : ''}">${svgIcon('star', 10)} Garder ${goal} dés</span>
            <span class="${sc >= 3 ? 'done' : ''}">${svgIcon('star', 10)} Sans perdre un dé</span>
        </div>` : '';
        const modsLine = (lvl.mods && lvl.mods.length) ? `<div class="cl-mods">${lvl.mods.map(m => `<span class="cl-mod" title="${escapeAttr((mods[m] || {}).desc || '')}">${svgIcon(MOD_ICON[m] || 'compass', 11)} ${escapeHtml((mods[m] || {}).name || m)}</span>`).join('')}</div>` : '';
        // Récompenses avec aperçu du dé
        const rewardPrevId = lvl.reward && lvl.reward.skin ? `cprev-${lvl.id}-r` : '';
        const chestPrevId = lvl.chest && lvl.chest.skin ? `cprev-${lvl.id}-c` : '';
        if (rewardPrevId) previews.push({ id: rewardPrevId, skin: lvl.reward.skin });
        if (chestPrevId) previews.push({ id: chestPrevId, skin: lvl.chest.skin });
        const rewardTxt = lvl.reward ? `<div class="cl-reward">${rewardPrevId ? `<span class="cl-dice" id="${rewardPrevId}"></span>` : svgIcon('gift', 12)} ${escapeHtml(lvl.reward.label)}</div>` : '';
        const chestTxt = lvl.chest ? `<div class="cl-reward chest">${chestPrevId ? `<span class="cl-dice" id="${chestPrevId}"></span>` : svgIcon('gift', 12)} ${escapeHtml(lvl.chest.label)}</div>` : '';
        html += `<div class="camp-stop ${side} ${state}" style="--accent:${accent}; --i:${lvl.id}">
            <button class="camp-medallion" ${clickable} ${unlocked ? '' : 'disabled'} aria-label="Niveau ${lvl.id}">
                <span class="cm-ico">${ico}</span>
                <span class="cm-num">${lvl.id}</span>
                ${rewardBadge}${shipMarker}
            </button>
            <div class="camp-label">
                <div class="cl-name">${lvl.boss ? svgIcon('skull', 13) + ' ' : (lvl.mini ? svgIcon('anchor', 13) + ' ' : '')}${escapeHtml(lvl.name)}</div>
                <div class="cl-meta">${escapeHtml(advTxt)}</div>
                ${completed ? starsRow : ''}
                ${modsLine}
                ${(isCurrent && lvl.lore) ? `<div class="cl-lore">${escapeHtml(lvl.lore)}</div>` : ''}
                ${defiList}
                ${rewardTxt}${chestTxt}
                ${playLine}
            </div>
        </div>`;
    });
    map.innerHTML = html;

    // Aperçus de dés (rendus après injection)
    previews.forEach(p => {
        try { renderDice(p.id, [5], false, { skinId: p.skin }); } catch (e) { }
    });

    // Auto-scroll vers le niveau courant
    requestAnimationFrame(() => {
        const cur = map.querySelector('.st-current');
        if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
}

function playCampaignLevel(n) {
    if (n > (myCampaignLevel || 0) + 1) { showToast("Termine d'abord les niveaux précédents !"); return; }
    socket.emit('create_campaign_game', n);
}

socket.on('campaign_reward', (r) => {
    if (!r) return;
    if (r.kind === 'title') showToast(`Nouveau titre débloqué : « ${r.name} » !`);
    else if (r.kind === 'skin') showSkinUnlock(r.name);
    else if (r.kind === 'chest') showToast(`Coffre ouvert : ${r.label || 'récompense'} !`);
    else if (r.kind === 'star') showToast(r.count >= 3 ? `Parfait ! 3 étoiles obtenues !` : `Nouveau record : ${r.count} étoile${r.count > 1 ? 's' : ''} !`);
});

function showSkinUnlock(skinName) {
    const ov = document.getElementById('skin-unlock');
    if (!ov) { showToast('Nouveau dé de collection débloqué !'); return; }
    const sk = (typeof SKINS !== 'undefined' && SKINS[skinName]) ? SKINS[skinName] : null;
    const nameEl = document.getElementById('su-name');
    if (nameEl) nameEl.textContent = sk ? sk.name : 'Nouveau dé';
    ov.style.display = 'flex';
    ov.classList.remove('show'); void ov.offsetWidth; ov.classList.add('show');
    try { renderDice('su-die', [6], false, { skin: skinName }); } catch (e) {}
    if (SETTINGS.animOn()) { Sound.ding(); if (SETTINGS.heavyFx()) runConfetti(document.querySelector('#skin-unlock .su-confetti'), 50, ['#ffd86b', '#ffe9a8', '#fff7e0']); }
    clearTimeout(ov._t);
    ov._t = setTimeout(() => { ov.classList.remove('show'); setTimeout(() => { ov.style.display = 'none'; }, 400); }, 3200);
}
function closeSkinUnlock() { const ov = document.getElementById('skin-unlock'); if (ov) { ov.classList.remove('show'); setTimeout(() => { ov.style.display = 'none'; }, 300); } }

// Écran de fin de niveau de campagne (récap animé)
socket.on('campaign_result', (res) => {
    if (!res) return;
    showCampaignResult(res);
});

function showCampaignResult(res) {
    if (gameOverTimer) { clearTimeout(gameOverTimer); gameOverTimer = null; }   // on gère la navigation nous-mêmes
    const modal = document.getElementById('campaign-result-modal');
    const card = document.getElementById('cr-card');
    if (!modal || !card) return;

    const previews = [];
    const rewardsHtml = (res.rewards && res.rewards.length)
        ? `<div class="cr-rewards">${res.rewards.map((r, i) => {
            const skin = r && r.skin;
            const label = r && r.label ? r.label : (typeof r === 'string' ? r : '');
            const pid = skin ? `crprev-${i}` : '';
            if (pid) previews.push({ id: pid, skin });
            return `<div class="cr-reward">${pid ? `<span class="cr-dice" id="${pid}"></span>` : svgIcon('gift', 16)} ${escapeHtml(label)}</div>`;
        }).join('')}</div>`
        : '';

    // Rangée d'étoiles (1-3) gagnées sur ce niveau
    const sc = res.bestStars || res.stars || 0;
    const justGot = res.stars || 0;
    const starsHtml = res.won ? `<div class="cr-stars">${[1, 2, 3].map(i => `<span class="${i <= sc ? 'on' : 'off'}${i <= justGot && i <= sc ? ' pop' : ''}" style="--d:${i * 0.12}s">${svgIcon('star', 30)}</span>`).join('')}</div>
        <div class="cr-goals">
            <span class="${sc >= 1 ? 'ok' : ''}">Gagner</span>
            <span class="${sc >= 2 ? 'ok' : ''}">Garder ${res.goals ? res.goals.keep : 2} dés</span>
            <span class="${sc >= 3 ? 'ok' : ''}">Sans perdre un dé</span>
        </div>` : '';

    // Bannière 100 %
    const full = (res.totalStars >= res.maxStars && res.maxStars > 0);
    const hundredHtml = full ? `<div class="cr-100">${svgIcon('trophy', 16)} 100% des étoiles — dé Trésor débloqué !</div>` : '';
    const starsTotalHtml = (typeof res.totalStars === 'number') ? `<div class="cr-progress">${svgIcon('star', 12)} ${res.totalStars}/${res.maxStars} étoiles · niveau ${Math.min(res.level, res.total)}/${res.total}</div>` : '';

    let icon, title, sub, buttons;
    if (res.won) {
        icon = res.boss ? svgIcon('trophy', 46) : svgIcon('check', 44);
        title = res.boss ? 'BOSS VAINCU !' : 'Victoire !';
        sub = `Niveau ${res.level} — ${escapeHtml(res.levelName || '')}`;
        if (res.nextLevel) {
            buttons = `<button class="cr-btn primary" onclick="campaignResultNext(${res.nextLevel})">Niveau suivant ${svgIcon('play', 14)}</button>
                       <button class="cr-btn" onclick="campaignResultMap()">Voir la carte</button>`;
        } else {
            buttons = `<button class="cr-btn primary" onclick="campaignResultMap()">${svgIcon('trophy', 14)} Campagne terminée !</button>`;
        }
    } else {
        icon = svgIcon('skull', 44);
        title = 'Défaite';
        sub = `Niveau ${res.level} — ${escapeHtml(res.levelName || '')}`;
        buttons = `<button class="cr-btn primary" onclick="campaignResultRetry(${res.level})">Réessayer ${svgIcon('play', 14)}</button>
                   <button class="cr-btn" onclick="campaignResultMap()">Voir la carte</button>`;
    }

    card.className = 'cr-card ' + (res.won ? 'win' : 'lose');
    card.innerHTML = `
        <div class="cr-icon">${icon}</div>
        <div class="cr-title">${title}</div>
        <div class="cr-sub">${sub}</div>
        ${starsHtml}
        ${hundredHtml}
        ${rewardsHtml}
        ${starsTotalHtml}
        <div class="cr-actions">${buttons}</div>`;
    modal.style.display = 'flex';
    modal.classList.remove('cr-leaving');
    previews.forEach(p => { try { renderDice(p.id, [5], false, { skinId: p.skin }); } catch (e) { } });
    if (res.won) { Sound.win(); if (navigator.vibrate) navigator.vibrate(full ? [40, 50, 40, 50, 120] : [40, 60, 120]); }
}

function closeCampaignResult() {
    const modal = document.getElementById('campaign-result-modal');
    if (modal) { modal.classList.remove('cr-leaving'); modal.style.display = 'none'; }
}
function campaignResultMap() {
    closeCampaignResult();
    if (typeof leaveGame === 'function') leaveGame();
    showScreen('lobby-screen');
    switchLobbyTab('campagne');
}
// Transition douce : on fond l'écran de victoire avant d'enchaîner
function campaignResultTransition(cb) {
    const modal = document.getElementById('campaign-result-modal');
    if (modal) modal.classList.add('cr-leaving');
    setTimeout(() => {
        closeCampaignResult();
        if (typeof leaveGame === 'function') leaveGame();
        showScreen('lobby-screen');
        cb();
    }, 320);
}
function campaignResultNext(n) { campaignResultTransition(() => playCampaignLevel(n)); }
function campaignResultRetry(n) { campaignResultTransition(() => playCampaignLevel(n)); }

// ===================== EXPÉDITION (roguelite) =====================
let RUN_RELICS = {};      // catalogue des reliques
let RUN_STATE = null;     // état du run en cours (ou null)
const RUN_KIND_ICON = { port: 'anchor', combat: 'play', elite: 'skull', tresor: 'gift', repos: 'anchor', boss: 'skull' };
const RUN_KIND_LABEL = { port: 'Port', combat: 'Combat', elite: 'Élite', tresor: 'Trésor', repos: 'Repos', boss: 'BOSS' };

socket.on('run_relics', (r) => { RUN_RELICS = r || {}; });
socket.on('run_update', (payload) => { RUN_STATE = payload; renderExpedition(); });
socket.on('run_event', (e) => {
    if (!e) return;
    if (e.kind === 'repos') showToast('Repos : +1 point de vie.');
    else if (e.kind === 'relic') showToast('Relique obtenue : ' + ((RUN_RELICS[e.relic] || {}).name || e.relic));
});
socket.on('relic_intel', (d) => { if (d && d.kind === 'oeil') showRelicIntel(d); });
socket.on('run_result', (res) => showRunResult(res));

function switchCampMode(which) {
    document.querySelectorAll('.camp-mode-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById('campmode-' + which);
    if (btn) btn.classList.add('active');
    const classic = document.getElementById('camp-classic');
    const expe = document.getElementById('camp-expedition');
    if (classic) classic.style.display = (which === 'classic') ? 'block' : 'none';
    if (expe) expe.style.display = (which === 'expedition') ? 'block' : 'none';
    if (which === 'classic') renderCampaign();
    else { socket.emit('run_data'); renderExpedition(); }
}

function startExpedition() { socket.emit('start_run'); }
function abandonRun() {
    if (!confirm("Abandonner l'expédition en cours ? Tu perdras tes reliques et ta progression.")) return;
    socket.emit('abandon_run');
}
function chooseRunNode(id) { socket.emit('run_choose_node', id); }
function pickRelic(id) { socket.emit('run_pick_relic', id); }

function renderExpedition() {
    const wrap = document.getElementById('camp-expedition');
    if (!wrap) return;
    const intro = document.getElementById('run-intro');
    const board = document.getElementById('run-board');
    if (!RUN_STATE) {
        if (intro) intro.style.display = 'block';
        if (board) board.style.display = 'none';
        return;
    }
    if (intro) intro.style.display = 'none';
    if (board) board.style.display = 'block';

    // Vies
    const hpEl = document.getElementById('run-hp');
    if (hpEl) {
        let h = '';
        for (let i = 0; i < RUN_STATE.maxHp; i++) h += `<span class="run-heart ${i < RUN_STATE.hp ? 'on' : 'off'}">${svgIcon('anchor', 16)}</span>`;
        hpEl.innerHTML = h;
    }
    // Reliques
    const relEl = document.getElementById('run-relics');
    if (relEl) {
        if (RUN_STATE.relics.length) {
            relEl.innerHTML = RUN_STATE.relics.map(id => {
                const r = RUN_RELICS[id] || {};
                return `<span class="run-relic" title="${escapeAttr((r.name || id) + ' — ' + (r.desc || ''))}">${svgIcon(r.icon || 'star', 15)}</span>`;
            }).join('');
        } else relEl.innerHTML = `<span class="run-relic-empty">Aucune relique</span>`;
    }

    // Carte
    drawRunMap();

    // Choix de relique en attente
    const modal = document.getElementById('relic-modal');
    if (RUN_STATE.pending && RUN_STATE.pending.type === 'relic') {
        renderRelicChoice(RUN_STATE.pending.options);
        if (modal) modal.style.display = 'flex';
    } else if (modal) modal.style.display = 'none';
}

function drawRunMap() {
    const map = document.getElementById('run-map');
    if (!map || !RUN_STATE) return;
    const rows = RUN_STATE.map;
    const depth = rows.length;
    const ROWH = 82;
    const laneX = c => (c + 0.5) / 4 * 100;           // % horizontal
    const nodeY = r => r * ROWH + ROWH / 2;            // px vertical

    // Lignes (SVG) — révélées seulement si l'origine est connue (brouillard)
    let lines = '';
    rows.forEach(row => row.forEach(n => {
        (n.to || []).forEach(toId => {
            const m = findRunNode(toId);
            if (!m) return;
            const vis = n.revealed;
            lines += `<line x1="${laneX(n.col)}" y1="${nodeY(n.row)}" x2="${laneX(m.col)}" y2="${nodeY(m.row)}" class="${vis ? 'rl-on' : 'rl-off'}" vector-effect="non-scaling-stroke"/>`;
        });
    }));

    // Nœuds
    let nodes = '';
    rows.forEach(row => row.forEach(n => {
        const revealed = n.revealed;
        const isPos = n.id === RUN_STATE.posId;
        const cls = ['run-node'];
        if (n.done) cls.push('rn-done');
        if (n.reachable) cls.push('rn-reach');
        if (isPos) cls.push('rn-pos');
        if (!revealed) cls.push('rn-fog');
        if (n.kind === 'boss') cls.push('rn-boss');
        const icon = revealed ? svgIcon(RUN_KIND_ICON[n.kind] || 'play', n.kind === 'boss' ? 24 : 18) : svgIcon('lock', 14);
        const onclick = n.reachable ? `onclick="chooseRunNode('${n.id}')"` : '';
        const ship = isPos ? `<span class="rn-ship">${svgIcon('anchor', 14)}</span>` : '';
        nodes += `<button class="${cls.join(' ')}" style="left:${laneX(n.col)}%; top:${nodeY(n.row)}px" ${onclick} ${n.reachable ? '' : 'disabled'} aria-label="${RUN_KIND_LABEL[n.kind] || ''}">
            <span class="rn-ico">${icon}</span>${ship}
        </button>`;
    }));

    map.style.height = (depth * ROWH) + 'px';
    map.innerHTML = `<svg class="run-lines" viewBox="0 0 100 ${depth * ROWH}" preserveAspectRatio="none">${lines}</svg>${nodes}`;

    // auto-scroll vers la position courante
    requestAnimationFrame(() => {
        const pos = map.querySelector('.rn-pos');
        if (pos && pos.scrollIntoView) pos.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
}
function findRunNode(id) {
    if (!RUN_STATE) return null;
    for (const row of RUN_STATE.map) { const n = row.find(x => x.id === id); if (n) return n; }
    return null;
}

function renderRelicChoice(options) {
    const box = document.getElementById('relic-choices');
    if (!box) return;
    box.innerHTML = options.map(id => {
        const r = RUN_RELICS[id] || {};
        return `<button class="relic-card" onclick="pickRelic('${id}')">
            <span class="relic-ico">${svgIcon(r.icon || 'star', 26)}</span>
            <span class="relic-name">${escapeHtml(r.name || id)}</span>
            <span class="relic-desc">${escapeHtml(r.desc || '')}</span>
        </button>`;
    }).join('');
}

// Renseignement de la Longue-vue pendant un combat
function showRelicIntel(d) {
    let el = document.getElementById('relic-intel');
    if (!el) {
        el = document.createElement('div');
        el.id = 'relic-intel';
        el.className = 'relic-intel';
        const gs = document.getElementById('game-screen');
        if (gs) gs.appendChild(el);
    }
    el.innerHTML = `${svgIcon('compass', 14)} Longue-vue : <b>${escapeHtml(d.foe)}</b> a un <b>${d.die === 1 ? 'Paco' : d.die}</b>`;
    el.style.display = 'flex';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.display = 'none'; }, 6000);
}

function showRunResult(res) {
    if (gameOverTimer) { clearTimeout(gameOverTimer); gameOverTimer = null; }
    const modal = document.getElementById('campaign-result-modal');
    const card = document.getElementById('cr-card');
    if (!modal || !card) return;
    let icon, title, sub, cls, buttons;
    if (res.complete) {
        cls = 'win'; icon = svgIcon('trophy', 46); title = 'EXPÉDITION RÉUSSIE !';
        sub = `Tu as vaincu l'Abîme avec ${res.relics ? res.relics.length : 0} relique(s).`;
        buttons = `<button class="cr-btn primary" onclick="runResultClose(true)">Nouvelle expédition ${svgIcon('play', 14)}</button>
                   <button class="cr-btn" onclick="runResultClose(false)">Retour</button>`;
    } else if (res.won) {
        cls = 'win'; icon = svgIcon('check', 44); title = 'Combat gagné !';
        sub = `Choisis ta route sur la carte.`;
        buttons = `<button class="cr-btn primary" onclick="runResultClose(false)">Continuer ${svgIcon('play', 14)}</button>`;
    } else if (res.dead) {
        cls = 'lose'; icon = svgIcon('skull', 44); title = 'Expédition perdue';
        sub = `Ton équipage a sombré. L'Abîme attend la prochaine.`;
        buttons = `<button class="cr-btn primary" onclick="runResultClose(true)">Repartir ${svgIcon('play', 14)}</button>
                   <button class="cr-btn" onclick="runResultClose(false)">Retour</button>`;
    } else {
        cls = 'lose'; icon = svgIcon('skull', 44); title = 'Combat perdu';
        sub = `Tu perds une vie. Il t'en reste ${res.hp}. Retente ta route.`;
        buttons = `<button class="cr-btn primary" onclick="runResultClose(false)">Continuer</button>`;
    }
    card.className = 'cr-card ' + cls;
    card.innerHTML = `<div class="cr-icon">${icon}</div><div class="cr-title">${title}</div><div class="cr-sub">${sub}</div><div class="cr-actions">${buttons}</div>`;
    modal.style.display = 'flex';
    modal.classList.remove('cr-leaving');
    if (res.won || res.complete) { Sound.win(); if (navigator.vibrate) navigator.vibrate([40, 60, 120]); }
}
function runResultClose(restart) {
    const modal = document.getElementById('campaign-result-modal');
    if (modal) { modal.classList.add('cr-leaving'); }
    setTimeout(() => {
        if (modal) { modal.classList.remove('cr-leaving'); modal.style.display = 'none'; }
        if (typeof leaveGame === 'function') leaveGame();
        showScreen('lobby-screen');
        switchLobbyTab('campagne');
        switchCampMode('expedition');
        if (restart) startExpedition();
    }, 300);
}

// ===================== TOURNOIS =====================
let TOURNEYS = [];
let currentTournamentId = null;
let TOURNEY_STATE = null;
let inTournamentMatch = false;

socket.on('tournaments_list', (list) => { TOURNEYS = list || []; renderTournamentsList(); });
socket.on('tournament_msg', (m) => showToast(m));
let waitMatchId = null, waitTimer = null;
socket.on('tournament_match_wait', ({ matchId, opponent, claimInSec }) => {
    waitMatchId = matchId;
    const modal = document.getElementById('tourney-wait-modal');
    const oppEl = document.getElementById('tw-opp');
    const claimBtn = document.getElementById('tw-claim');
    const countEl = document.getElementById('tw-count');
    if (oppEl) oppEl.textContent = opponent || 'adversaire';
    if (claimBtn) claimBtn.style.display = 'none';
    if (modal) modal.style.display = 'flex';
    let remain = claimInSec || 30;
    const tick = () => {
        if (remain > 0) { if (countEl) countEl.textContent = `Victoire réclamable dans ${remain}s`; remain--; }
        else { if (countEl) countEl.textContent = "L'adversaire ne s'est pas présenté."; if (claimBtn) claimBtn.style.display = 'block'; clearInterval(waitTimer); }
    };
    clearInterval(waitTimer); tick(); waitTimer = setInterval(tick, 1000);
});
function closeTourneyWait() {
    const m = document.getElementById('tourney-wait-modal');
    if (m) m.style.display = 'none';
    clearInterval(waitTimer); waitTimer = null; waitMatchId = null;
}
function claimTournamentMatch() { if (waitMatchId) socket.emit('claim_tournament_match', waitMatchId); closeTourneyWait(); }
function cancelTournamentWait() { closeTourneyWait(); }
socket.on('tournament_your_match', ({ tournamentId }) => {
    // si je ne suis pas déjà dans une partie ou en train de regarder, j'ouvre le tournoi
    if (currentGameId || spectating) { showToast('Ton match de tournoi est prêt !'); return; }
    showToast('Ton match de tournoi est prêt — rejoins-le !');
    openTournament(tournamentId);
});
socket.on('tournament_champion', (d) => showToast(`🏆 ${d.champion} remporte « ${d.name} » !`));
let awaitingTournamentOpen = false;
socket.on('tournament_update', (state) => {
    if (!state) return;
    if (awaitingTournamentOpen && state.host === myPseudo && state.status === 'lobby') {
        awaitingTournamentOpen = false;
        currentTournamentId = state.id;
        TOURNEY_STATE = state;
        showScreen('tournament-screen');
        renderTournament();
        return;
    }
    if (state.id === currentTournamentId) {
        TOURNEY_STATE = state;
        renderTournament();
        if (state.champion && !_championShown[state.id]) { _championShown[state.id] = true; setTimeout(() => showChampionScreen(state), 400); }
    }
});

socket.on('tournament_match_start', ({ gameId, opponent }) => {
    closeTourneyWait();
    inTournamentMatch = true;
    currentGameId = gameId; amHost = false;
    const roomEl = document.getElementById('current-room'); if (roomEl) roomEl.innerText = gameId;
    const startBtn = document.getElementById('btn-start'); if (startBtn) startBtn.style.display = 'none';
    const optBtn = document.getElementById('btn-options'); if (optBtn) optBtn.style.display = 'none';
    const widget = document.getElementById('game-chat-widget'); if (widget) widget.style.display = 'flex';
    roundBids = []; lastRoundResult = ''; renderBidHistory();
    gameMode = 'solo'; myTeam = null; teammateId = null; gameInProgress = false; teamOrder = [];
    const tz = document.getElementById('teammate-zone'); if (tz) tz.style.display = 'none';
    initFaceSelector();
    showScreen('game-screen');
    if (typeof switchVoiceRoom === 'function') switchVoiceRoom(currentGameId);
    showToast('Ton match de tournoi commence : vs ' + opponent);
});

socket.on('tournament_match_over', ({ tournamentId, winner }) => {
    if (gameOverTimer) { clearTimeout(gameOverTimer); gameOverTimer = null; }
    const wasSpectating = spectating;
    if (spectating) { if (currentGameId) socket.emit('leave_spectate', currentGameId); spectating = false; exitSpectatorUI(); }
    inTournamentMatch = false;
    const won = winner === myPseudo;
    currentGameId = null;
    setTimeout(() => {
        if (!wasSpectating) showToast(won ? 'Tu remportes ton match !' : 'Match perdu.');
        if (!inTournamentMatch) openTournament(tournamentId);   // si le tour suivant a déjà démarré, on n'éjecte pas
    }, wasSpectating ? 600 : 2200);
});

function createTournament() {
    const modal = document.getElementById('tourney-create-modal');
    if (modal) modal.style.display = 'flex';
    const nameInput = document.getElementById('tc-name');
    if (nameInput && !nameInput.value) nameInput.value = 'Tournoi de ' + myPseudo;
}
function closeTournamentCreate() { const m = document.getElementById('tourney-create-modal'); if (m) m.style.display = 'none'; }
function tcPick(btn) {
    const seg = btn.parentElement;
    if (!seg) return;
    seg.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}
function submitTournament() {
    const name = (document.getElementById('tc-name') || {}).value || '';
    const segVal = (id, def) => { const a = document.querySelector('#' + id + ' button.active'); return a ? a.dataset.val : def; };
    const gs = parseInt(segVal('tc-gs', '4'), 10);
    const q = parseInt(segVal('tc-q', '2'), 10);
    const third = document.getElementById('tc-third') ? document.getElementById('tc-third').classList.contains('on') : true;
    const elim = segVal('tc-elim', 'single');
    awaitingTournamentOpen = true;
    socket.emit('create_tournament', { name, groupSize: gs, qualifiers: q, thirdPlace: third, elim });
    closeTournamentCreate();
}
function joinTournament(id) { currentTournamentId = id; socket.emit('join_tournament', id); openTournament(id); }
function leaveTournamentLobby(id) { socket.emit('leave_tournament', id); currentTournamentId = null; showScreen('lobby-screen'); switchLobbyTab('tavern'); }
function startTournament(id) { socket.emit('start_tournament', id); }
function joinTournamentMatch(id) { socket.emit('join_tournament_match', id); }
function spectateTournamentMatch(id) { socket.emit('spectate_tournament_match', id); }
function returnFromSpectate() {
    if (currentGameId) socket.emit('leave_spectate', currentGameId);
    spectating = false; currentGameId = null;
    exitSpectatorUI();
    const sr = document.getElementById('spec-return'); if (sr) sr.classList.remove('on');
    if (currentTournamentId) openTournament(currentTournamentId); else { showScreen('lobby-screen'); switchLobbyTab('tavern'); }
}
function openTournament(id) {
    if (id !== _lastTourneyOpened) { _seenMatchIds = new Set(); _lastTourneyOpened = id; }
    currentTournamentId = id;
    socket.emit('get_tournament', id);
    showScreen('tournament-screen');
}
function backFromTournament() {
    currentTournamentId = null;
    showScreen('lobby-screen');
    switchLobbyTab('tavern');
}

function renderTournamentsList() {
    const box = document.getElementById('tournaments-list');
    if (!box) return;
    if (!TOURNEYS.length) { box.innerHTML = `<p class="list-empty">${t('lob_no_tourn')}</p>`; return; }
    box.innerHTML = TOURNEYS.map(t => {
        const statusTxt = t.status === 'lobby' ? 'Inscriptions' : (t.status === 'done' ? 'Terminé' : 'En cours');
        const action = t.status === 'lobby'
            ? `<button class="tourney-join" onclick="joinTournament('${t.id}')">Rejoindre</button>`
            : `<button class="tourney-join" onclick="openTournament('${t.id}')">Voir</button>`;
        return `<div class="tourney-row">
            <div class="tourney-info"><b>${escapeHtml(t.name)}</b><span>${t.count} joueur${t.count > 1 ? 's' : ''} · ${statusTxt}</span></div>
            ${action}
        </div>`;
    }).join('');
}

let _seenMatchIds = new Set();
let _championShown = {};
let _lastTourneyOpened = null;
function tourneyRoundName(ri, state) {
    const isDouble = state.config && state.config.elim === 'double';
    if (isDouble && state.roundLabels && state.roundLabels[ri]) return state.roundLabels[ri];
    let total = state.bracket.length;
    if (!isDouble) {
        const firstCount = state.bracket[0].filter(m => m.stage !== 'third').length;
        total = Math.max(state.bracket.length, Math.ceil(Math.log2(Math.max(1, firstCount))) + 1);
    }
    const fromEnd = total - 1 - ri;
    if (fromEnd === 0) return 'Finale';
    if (fromEnd === 1) return 'Demi-finale';
    if (fromEnd === 2) return 'Quart';
    return 'Tour ' + (ri + 1);
}

function matchCard(m, opts) {
    opts = opts || {};
    const isNew = m.id && !_seenMatchIds.has(m.id);
    if (m.id) _seenMatchIds.add(m.id);
    const newCls = isNew ? ' tm-new' : '';
    const meA = m.a === myPseudo, meB = m.b === myPseudo;
    const wA = m.winner && m.winner === m.a, wB = m.winner && m.winner === m.b;
    const joined = m.joined || [];
    const jA = joined.includes(m.a), jB = joined.includes(m.b);
    const tag = (p, j) => (m.current && !m.live && p && j) ? ' <span class="tm-ready">prêt</span>' : '';
    const nameA = m.a ? escapeHtml(m.a) + tag(m.a, jA) : '<i>—</i>';
    const nameB = m.b ? escapeHtml(m.b) + tag(m.b, jB) : (m.a ? '<i>(exempt)</i>' : '<i>—</i>');
    const live = m.live ? `<span class="tm-live">en cours</span>` : '';
    let action = '';
    let badge = '';
    if (m.current && !opts.noAction) {
        if (meA || meB) {
            badge = '<span class="tm-yourturn">ton match</span>';
            action = `<button class="tm-btn join" onclick="joinTournamentMatch('${m.id}')">${m.live ? 'Reprendre mon match' : 'Rejoindre le match'}</button>`;
        } else if (m.live) {
            action = `<button class="tm-btn watch" onclick="spectateTournamentMatch('${m.id}')">Regarder</button>`;
        } else {
            action = `<div class="tm-waiting">En attente des joueurs…</div>`;
        }
    }
    const mineCls = (m.current && (meA || meB)) ? ' mine' : '';
    return `<div class="tm-card${m.done ? ' done' : ''}${m.live ? ' live' : ''}${m.current ? ' current' : ''}${mineCls}${newCls}">
        <div class="tm-side${wA ? ' win' : ''}${meA ? ' me' : ''}">${nameA}${meA ? badge : ''}</div>
        <div class="tm-vs">${live || 'vs'}</div>
        <div class="tm-side${wB ? ' win' : ''}${meB ? ' me' : ''}">${nameB}${meB ? badge : ''}</div>
        ${action}
    </div>`;
}

function renderTournament() {
    const scr = document.getElementById('tournament-screen');
    if (!scr) return;
    const t = TOURNEY_STATE;
    const head = document.getElementById('tourney-head');
    const body = document.getElementById('tourney-body');
    if (!t) { if (body) body.innerHTML = '<div class="tourney-empty">Chargement…</div>'; return; }

    const joined = t.players.includes(myPseudo);
    const isHost = t.host === myPseudo;
    if (head) head.innerHTML = `<div class="tourney-name">${escapeHtml(t.name)}</div>
        <div class="tourney-sub">${t.status === 'lobby' ? 'Inscriptions ouvertes' : (t.status === 'done' ? 'Terminé' : (t.stage === 'group' ? 'Phase de poules' : 'Phase finale'))} · ${t.players.length} joueurs</div>`;

    let html = '';

    if (t.status === 'lobby') {
        html += `<div class="tourney-players">${t.players.map(p => `<span class="tp-chip${p === t.host ? ' host' : ''}${p === myPseudo ? ' me' : ''}">${escapeHtml(p)}</span>`).join('')}</div>`;
        if (t.config) html += `<div class="tourney-config">Poules de ${t.config.groupSize} · ${t.config.qualifiers} qualifié${t.config.qualifiers > 1 ? 's' : ''}/poule · élimination ${t.config.elim === 'double' ? 'double' : 'simple'}${t.config.elim !== 'double' && t.config.thirdPlace ? ' · petite finale' : ''}</div>`;
        html += `<div class="tourney-actions">`;
        if (!joined) html += `<button class="create-btn" onclick="joinTournament('${t.id}')">Rejoindre</button>`;
        else html += `<button class="tourney-leave" onclick="leaveTournamentLobby('${t.id}')">Quitter</button>`;
        if (isHost) html += `<button class="create-btn" onclick="startTournament('${t.id}')">Lancer le tournoi (${t.players.length})</button>`;
        html += `</div>`;
        html += `<div class="tourney-hint">${t.players.length < 6 ? 'À partir de 6 joueurs : phase de poules. Sinon, tableau direct.' : 'Format : poules puis tableau à élimination.'} Minimum 3 joueurs.</div>`;
    } else {
        if (t.champion) {
            html += `<div class="tourney-podium">
                <div class="podium p1">${svgIcon('trophy', 26)}<span class="pod-rank">1er</span><span class="pod-name">${escapeHtml(t.champion)}</span></div>
                ${t.second ? `<div class="podium p2"><span class="pod-rank">2e</span><span class="pod-name">${escapeHtml(t.second)}</span></div>` : ''}
                ${t.third ? `<div class="podium p3"><span class="pod-rank">3e</span><span class="pod-name">${escapeHtml(t.third)}</span></div>` : ''}
            </div>`;
        }

        // Matchs à jouer MAINTENANT (tour courant) — vue principale
        if (!t.champion) {
            const currentMatches = [];
            if (t.groups) t.groups.forEach(g => g.matches.forEach(m => { if (m.current) currentMatches.push(m); }));
            if (t.bracket) t.bracket.forEach(round => round.forEach(m => { if (m.current) currentMatches.push(m); }));
            if (currentMatches.length) {
                const mine = currentMatches.filter(m => m.a === myPseudo || m.b === myPseudo);
                html += `<div class="tourney-section-title">Matchs à jouer</div>`;
                if (mine.length) html += `<div class="now-hint">${svgIcon('play', 13)} C'est à toi de jouer !</div>`;
                html += `<div class="now-matches">${currentMatches.map(m => matchCard(m)).join('')}</div>`;
            } else {
                html += `<div class="now-wait">${svgIcon('compass', 18)} En attente de la fin des matchs en cours…</div>`;
            }
        }

        // Poules
        if (t.groups) {
            html += `<div class="tourney-section-title">Poules${t.stage === 'group' ? ` — manche ${t.groupRoundIdx + 1}/${t.groupRoundsTotal}` : ' (terminées)'}</div>`;
            html += `<div class="poules-grid">`;
            const qN = t.config ? t.config.qualifiers : 2;
            t.groups.forEach(g => {
                html += `<div class="poule">
                    <div class="poule-name">${escapeHtml(g.name)}</div>
                    <table class="poule-table"><tbody>${g.standings.map((s, i) => `<tr class="${s.pseudo === myPseudo ? 'me' : ''}${i < qN ? ' qualif' : ''}"><td>${i + 1}</td><td>${escapeHtml(s.pseudo)}</td><td>${s.wins}V</td></tr>`).join('')}</tbody></table>
                </div>`;
            });
            html += `</div>`;
        }

        // Tableau
        if (t.bracket && t.bracket.length) {
            const isDouble = t.config && t.config.elim === 'double';
            // Nombre total de tours réel (élimination simple) -> on montre aussi les tours à venir
            let totalRounds = t.bracket.length;
            let firstCount = 0;
            if (!isDouble) {
                firstCount = t.bracket[0].filter(m => m.stage !== 'third').length;
                totalRounds = Math.max(t.bracket.length, Math.ceil(Math.log2(Math.max(1, firstCount))) + 1);
            }
            const roundName = (ri) => tourneyRoundName(ri, t);
            html += `<div class="tourney-section-title">${isDouble ? 'Tableaux (double élimination)' : 'Tableau final'}</div>`;
            html += `<div class="bracket">`;
            let thirdMatch = null;
            for (let ri = 0; ri < totalRounds; ri++) {
                if (ri < t.bracket.length) {
                    const round = t.bracket[ri];
                    const ko = round.filter(m => m.stage !== 'third');
                    round.filter(m => m.stage === 'third').forEach(m => thirdMatch = m);
                    if (ko.length) html += `<div class="bracket-col"><div class="bracket-round">${roundName(ri)}</div>${ko.map(m => matchCard(m, { noAction: true })).join('')}</div>`;
                } else if (!isDouble) {
                    const count = Math.max(1, Math.round(firstCount / Math.pow(2, ri)));
                    let cards = '';
                    for (let k = 0; k < count; k++) cards += `<div class="tm-card placeholder"><div class="tm-side wait">?</div><div class="tm-vs">vs</div><div class="tm-side wait">?</div></div>`;
                    html += `<div class="bracket-col"><div class="bracket-round">${roundName(ri)}</div>${cards}</div>`;
                }
            }
            html += `</div>`;
            if (thirdMatch) html += `<div class="tourney-section-title">Petite finale (3e place)</div><div class="bracket"><div class="bracket-col">${matchCard(thirdMatch, { noAction: true })}</div></div>`;
        }
    }

    if (body) body.innerHTML = html;
}

// Sous-menu de l'atelier : Collections <-> Personnalisé
function switchStyleTab(which) {
    document.querySelectorAll('.style-nav .btn-tab').forEach(el => el.classList.remove('active'));
    const btn = document.getElementById('style-tab-' + which);
    if (btn) btn.classList.add('active');
    const coll = document.getElementById('style-view-collections');
    const cust = document.getElementById('style-view-custom');
    const tapis = document.getElementById('style-view-tapis');
    if (coll) coll.style.display = (which === 'collections') ? 'block' : 'none';
    if (cust) cust.style.display = (which === 'custom') ? 'block' : 'none';
    if (tapis) tapis.style.display = (which === 'tapis') ? 'block' : 'none';
    if (which === 'collections') renderSkinGallery();
    if (which === 'tapis') { renderTableGallery(); renderCupGallery(); }
    renderDice('preview-dice-container', PREVIEW_HAND, false, myStyle);
}

// Le serveur refuse un skin verrouillé (anti-triche)
socket.on('style_rejected', (msg) => {
    const el = document.getElementById('style-success');
    if (el) {
        el.style.color = '#ff5252';
        el.innerText = "❌ " + msg;
        el.style.display = 'block';
        setTimeout(() => { el.style.display = 'none'; el.style.color = ''; }, 4000);
    }
});

let lastLeaderboard = [];   // mémorisé pour ouvrir la fiche publique d'un joueur

socket.on('update_leaderboard', (leaderboardData) => {
    lastLeaderboard = leaderboardData || [];
    // On garde nos infos à jour (déblocage skins, profil)
    const me = leaderboardData.find(u => u.pseudo === myPseudo);
    if (me) {
        myWins = me.wins;
        if (typeof me.botWins === 'number') myBotWins = me.botWins;
        if (me.rank) myRank = me.rank;
        myProfile = Object.assign({}, myProfile, me);
        const styleView = document.getElementById('view-style');
        if (styleView && styleView.style.display !== 'none') renderSkinGallery();
        updateProfileUI();
    }

    _allLeaderboard = leaderboardData;
    if (leaderboardScope === 'all') renderLeaderboardTable(leaderboardData, 'all');
});

let leaderboardScope = 'all';
let _allLeaderboard = [];
function setLeaderboardScope(scope) {
    leaderboardScope = scope;
    ['all', 'week', 'month'].forEach(s => { const b = document.getElementById('lb-tab-' + s); if (b) b.classList.toggle('active', s === scope); });
    if (scope === 'all') { renderLeaderboardTable(_allLeaderboard, 'all'); }
    else {
        const tbody = document.getElementById('leaderboard-body');
        if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#b3a892;padding:14px;">Chargement…</td></tr>`;
        socket.emit('get_leaderboard', scope);
    }
}
socket.on('leaderboard_scoped', (data) => {
    if (!data || data.scope !== leaderboardScope) return;
    renderLeaderboardTable(data.list || [], data.scope);
});
function renderLeaderboardTable(list, scope) {
    lastLeaderboard = list || [];
    const tbody = document.getElementById('leaderboard-body');
    if (!tbody) return;
    const periodLabel = scope === 'week' ? t('lb_this_week') : t('lb_this_month');
    if ((scope === 'week' || scope === 'month') && (!list || list.length === 0)) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#b3a892;padding:16px;">${t('lb_empty').replace('{period}', periodLabel)}</td></tr>`;
        return;
    }
    let rows = list.map((user, index) => {
        let rankClass = "", medal = "";
        if (index === 0) { rankClass = "rank-1"; medal = "🥇 "; }
        else if (index === 1) { rankClass = "rank-2"; medal = "🥈 "; }
        else if (index === 2) { rankClass = "rank-3"; medal = "🥉 "; }
        const mine = user.pseudo === myPseudo ? " lb-me" : "";
        const grade = user.rank ? `<br><span class="lb-grade">${escapeHtml(user.rank)}</span>` : '';
        const pct = user.winRate != null ? user.winRate : 0;
        const pts = (scope === 'week' || scope === 'month') ? (user.periodPoints || 0) : user.rankPoints;
        return `<tr class="${rankClass}${mine} lb-clickable" onclick="openPlayerCard('${escapeAttr(user.pseudo)}')">
                    <td>${medal}#${index + 1}</td>
                    <td><span class="lb-cell"><span class="lb-ava">${avatarHTML(user, 30)}</span><span>${escapeHtml(user.pseudo)}${grade}</span></span></td>
                    <td><b>${pts}</b></td>
                    <td>${user.wins}</td>
                    <td>${user.played}</td>
                    <td>${pct} %</td>
                </tr>`;
    }).join('');
    if (scope === 'all') {
        const inList = list.some(u => u.pseudo === myPseudo);
        if (!inList && myProfile && myProfile.position) {
            rows += `<tr class="lb-me lb-clickable" onclick="switchLobbyTab('profil')">
                        <td>#${myProfile.position}</td>
                        <td><span class="lb-cell"><span class="lb-ava">${avatarHTML(myProfile || {}, 30)}</span><span>${escapeHtml(myPseudo)} <span class="lb-grade">${t('lb_you')}</span></span></span></td>
                        <td><b>${myProfile.rankPoints || 0}</b></td>
                        <td>${myProfile.wins || 0}</td>
                        <td>${myProfile.played || 0}</td>
                        <td>${myProfile.winRate != null ? myProfile.winRate : 0} %</td>
                    </tr>`;
        }
    }
    tbody.innerHTML = rows;
}

// Fiche publique d'un joueur (clic sur une ligne du classement)
function openPlayerCard(pseudo) {
    const s = lastLeaderboard.find(u => u.pseudo === pseudo);
    if (!s) return;
    const modal = document.getElementById('player-card-modal');
    const body = document.getElementById('player-card-body');
    if (!modal || !body) return;
    const titleLine = s.title ? `<div class="player-card-title">${escapeHtml(s.title)}</div>` : '';
    body.innerHTML = `<h2 style="color:var(--gold);font-family:'Pirata One',cursive;margin:0 0 2px;">🏴‍☠️ ${escapeHtml(s.pseudo)}</h2>${titleLine}${statsCardHTML(s)}`;
    modal.style.display = 'flex';
}
function closePlayerCard() {
    const modal = document.getElementById('player-card-modal');
    if (modal) modal.style.display = 'none';
}

function selectShape(shape) {
    myStyle.shape = shape;
    document.querySelectorAll('#shape-selector .shape-option').forEach(el => {
        el.classList.remove('selected');
        if (el.getAttribute('data-shape') === shape) el.classList.add('selected');
    });
    updateStylePreview();
}

function selectFaceType(type) {
    myStyle.faceType = type;
    document.querySelectorAll('#face-type-selector .shape-option').forEach(el => {
        el.classList.remove('selected');
        if (el.getAttribute('data-type') === type) el.classList.add('selected');
    });
    updateStylePreview();
}

function updateStylePreview() {
    const bgInput = document.getElementById('style-bg');
    const dotInput = document.getElementById('style-dot');
    if (bgInput) myStyle.bgColor = bgInput.value;
    if (dotInput) myStyle.dotColor = dotInput.value;
    const gradEl = document.getElementById('style-gradient');
    const bg2El = document.getElementById('style-bg2');
    const glowOnEl = document.getElementById('style-glow-on');
    const glowEl = document.getElementById('style-glow');
    if (gradEl) myStyle.useGradient = gradEl.checked;
    if (bg2El) { myStyle.bgColor2 = bg2El.value; bg2El.style.opacity = (gradEl && gradEl.checked) ? '1' : '0.4'; }
    if (glowEl) { myStyle.glowColor = (glowOnEl && glowOnEl.checked) ? glowEl.value : ''; glowEl.style.opacity = (glowOnEl && glowOnEl.checked) ? '1' : '0.4'; }

    if (!initializing) {
        // Toucher aux couleurs/formes = retour en mode personnalisé
        myStyle.skinId = null;
        document.querySelectorAll('.skin-card').forEach(c => c.classList.remove('selected'));
        const customCard = document.getElementById('skincard-__custom__');
        if (customCard) customCard.classList.add('selected');
        const hint = document.getElementById('skin-hint');
        if (hint) hint.innerText = 'Mode personnalisé : règle les couleurs et formes ci-dessous.';
        markStyleDirty();
    }
    renderDice('preview-dice-container', PREVIEW_HAND, false, myStyle);
    const prev = document.getElementById('preview-dice-container');
    if (prev && SETTINGS.animOn()) { prev.classList.remove('preview-pulse'); void prev.offsetWidth; prev.classList.add('preview-pulse'); }
}

function renderLobbyDice() {
    if (document.getElementById('my-dice-lobby')) {
        renderDice('my-dice-lobby', PREVIEW_HAND, false, myStyle);
    }
}

// --- Bulle Sauvegarder : grisée tant que rien n'a changé ---
let styleDirty = false;
function markStyleDirty() {
    styleDirty = true;
    updateSaveBubble();
}
function updateSaveBubble() {
    const b = document.getElementById('save-style-bubble');
    if (b) b.disabled = !styleDirty;
}

function saveStyle() {
    if (!styleDirty) return;
    socket.emit('save_style', myStyle);
    showSuccessMsg('style-success', "Ton style a été sauvegardé avec succès !");
    renderLobbyDice();
    styleDirty = false;
    updateSaveBubble();
}

function getDiceSVG(face, pip, faceType, face1Glyph, glyphKey, faceImage) {
    pip = pip || '#000000';

    // Face 1 = image perso > dessin du skin > emoji > Paco classique
    if (face === 1) {
        if (faceImage && faceImage.indexOf('data:image') === 0) {
            return `<svg width="34" height="34" viewBox="0 0 34 34" style="display:block; margin:auto;"><image href="${faceImage}" xlink:href="${faceImage}" x="2" y="2" width="30" height="30" preserveAspectRatio="xMidYMid meet"/></svg>`;
        }
        if (glyphKey && GLYPHS[glyphKey]) {
            return glyphSVG(glyphKey, pip);
        }
        if (face1Glyph) {
            return `<svg width="34" height="34" viewBox="0 0 34 34" style="display:block; margin:auto;"><text x="17" y="26" text-anchor="middle" font-size="23">${face1Glyph}</text></svg>`;
        }
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 125" fill="${pip}" width="28" height="28" style="display:block; margin:auto;" fill-rule="nonzero"><path d="M50.966,39.492L50.966,70.069C58.34,70.041 65.721,69.728 73.086,70.075C73.839,70.182 74.23,71.143 73.686,71.741L50.68,94.747C50.094,95.281 49.051,94.932 49.009,94.055L49.009,72.013C34.963,71.55 21.744,61.442 17.803,47.887C17.01,45.159 16.594,42.333 16.537,39.496C34.085,39.728 48.954,53.457 49.009,70.071C49.009,70.071 50.628,70.07 50.948,70.069C50.325,51.752 33.945,37.757 16.553,37.538C16.858,29.392 20.074,21.322 25.728,15.391C31.969,8.846 40.89,5.029 49.985,5L50.065,5.006C50.11,5.002 50.157,5.001 50.204,5.001C67.408,5.164 83.269,19.911 83.499,38.081C83.508,38.78 83.255,39.451 82.523,39.492L50.966,39.492ZM50.966,6.972L50.966,37.535L81.529,37.535C81.086,21.983 67.841,7.77 51.411,6.989C51.263,6.983 51.115,6.977 50.966,6.972ZM41.007,19.479C40.31,18.302 39.028,17.512 37.562,17.512C37.042,17.512 36.544,17.612 36.088,17.793L36.085,17.792C34.606,18.379 33.558,19.824 33.558,21.512C33.558,23.634 35.215,25.373 37.304,25.504C37.39,25.509 37.476,25.512 37.562,25.512C39.77,25.512 41.562,23.72 41.562,21.512C41.562,20.775 41.363,20.085 41.015,19.492L41.045,19.492L41.007,19.479ZM37.561,19.514C38.665,19.514 39.561,20.41 39.561,21.514C39.561,22.618 38.665,23.514 37.561,23.514C36.457,23.514 35.561,22.618 35.561,21.514C35.561,20.41 36.457,19.514 37.561,19.514Z"/></svg>`;
    }

    // Faces 2-6
    let content = "";
    if (faceType === 'number') {
        content = `<text x="17" y="24" text-anchor="middle" font-family="'Pirata One', cursive" font-size="22" font-weight="bold" fill="${pip}">${face}</text>`;
    } else if (faceType === 'roman') {
        const romans = { 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI' };
        content = `<text x="17" y="24" text-anchor="middle" font-family="'Pirata One', cursive" font-size="20" font-weight="bold" fill="${pip}">${romans[face]}</text>`;
    } else if (faceType === 'rune') {
        const runes = {
            2: 'M10 8 L24 26 M24 8 L10 26',
            3: 'M17 6 L17 28 M17 6 L26 13 M17 16 L26 23',
            4: 'M11 6 L11 28 M11 6 L24 16 L11 16',
            5: 'M12 6 L12 28 M24 6 L24 28 M12 17 L24 17',
            6: 'M17 5 L17 29 M9 11 L25 11 M9 17 L25 17 M9 23 L25 23'
        };
        content = `<path d="${runes[face]}" stroke="${pip}" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    } else if (faceType === 'paco') {
        // Une goutte "Paco" au centre + autant de gouttes autour que la valeur
        const DROP = 'M0 -3.4 C2.1 -0.6,2.7 1.1,0 3.4 C-2.7 1.1,-2.1 -0.6,0 -3.4 Z';
        let drops = `<g transform="translate(17,17) scale(1.3)"><path d="${DROP}" fill="${pip}"/></g>`;
        const R = 10.8;
        for (let i = 0; i < face; i++) {
            const ang = (-90 + i * (360 / face)) * Math.PI / 180;
            const x = (17 + R * Math.cos(ang)).toFixed(2);
            const y = (17 + R * Math.sin(ang)).toFixed(2);
            drops += `<g transform="translate(${x},${y})"><path d="${DROP}" fill="${pip}"/></g>`;
        }
        content = drops;
    } else {
        // Classique : les points
        const layouts = {
            2: [[8, 8], [26, 26]],
            3: [[8, 8], [17, 17], [26, 26]],
            4: [[8, 8], [26, 8], [8, 26], [26, 26]],
            5: [[8, 8], [26, 8], [17, 17], [8, 26], [26, 26]],
            6: [[8, 8], [26, 8], [8, 17], [26, 17], [8, 26], [26, 26]]
        };
        content = (layouts[face] || []).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.4" fill="${pip}"/>`).join('');
    }
    return `<svg width="34" height="34" viewBox="0 0 34 34" style="display:block; margin:auto;">${content}</svg>`;
}

function renderDice(containerId, hand, isHidden = false, styleObj, maskCount = 0) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const r = resolveSkin(styleObj);
    const fx = (r.anim && SETTINGS.animOn()) ? r.anim : '';   // animation seulement si activée (off en mode réduit/éco)
    const showNum = !!SETTINGS.get('diceNum');

    // Mémoïsation : on ne redessine que si quelque chose a changé
    const sig = (isHidden ? 'h' : 'v') + '|' + hand.join(',') + '|m' + maskCount + '|' +
        r.bg + '|' + r.pip + '|' + r.shape + '|' + r.faceType + '|' +
        (r.glyph || '') + '|' + (r.face1 || '') + '|' + (r.faceImage ? '1' : '0') + '|' + (r.border || '') + '|' + (r.glow || '') + '|fx' + fx + (showNum ? '|n' : '');
    if (container.dataset.diceSig === sig) return;
    container.dataset.diceSig = sig;

    container.innerHTML = "";
    const shapeConfig = SHAPES[r.shape] || SHAPES['square'];
    const baseShadow = 'inset 0 0 8px rgba(0,0,0,0.3), 2px 2px 4px rgba(0,0,0,0.5)';

    const fragment = document.createDocumentFragment();
    hand.forEach((d, i) => {
        const hideThis = isHidden || (maskCount > 0 && i >= hand.length - maskCount);
        const div = document.createElement("div");
        div.className = hideThis ? "dice hidden" : (fx ? `dice dx-${fx}` : "dice");
        div.style.borderRadius = shapeConfig.radius;
        div.style.clipPath = shapeConfig.clip;
        if (!hideThis) {
            div.style.background = r.bg;
            if (r.border) div.style.border = r.border;
            div.style.boxShadow = r.glow ? `${baseShadow}, ${r.glow}` : baseShadow;
            div.innerHTML = getDiceSVG(d, r.pip, r.faceType, r.face1, r.glyph, r.faceImage)
                + (showNum ? `<span class="dice-num">${d}</span>` : '');
        } else div.innerHTML = "?";
        fragment.appendChild(div);
    });
    container.appendChild(fragment);
}

// ----- GALERIE DE SKINS -----
function renderSkinGallery() {
    const g = document.getElementById('skin-gallery');
    if (!g) return;

    const card = (id, name, owned, s) => {
        let label = name;
        let lock = '';
        if (!owned && s) {
            lock = `<span class="skin-lock-badge">${svgIcon('lock', 13)}</span>`;
            let req;
            if (s.requiresBotWin) req = 'Bats le Cthulhu';
            else if (s.requiresAllStars) req = '100% des étoiles';
            else if (s.requiresTourney) req = 'Gagne un tournoi';
            else if (s.requiresCampaign) req = 'Campagne niv. ' + s.requiresCampaign;
            else req = `${s.winsRequired} victoires`;
            label = `${name}<br><span style="font-size:0.62rem;">${req}</span>`;
        }
        return `<div class="skin-card${owned ? '' : ' locked'}" id="skincard-${id}" onclick="selectSkin('${id}')">${lock}<div class="skin-prev" id="skin-prev-${id}"></div><div class="skin-name">${label}</div></div>`;
    };

    let html = card('__custom__', 'Personnalisé', true, null);
    for (const id in SKINS) {
        html += card(id, SKINS[id].name, ownsSkin(id), SKINS[id]);
    }
    g.innerHTML = html;

    // Aperçus
    renderDice('skin-prev-__custom__', [5], false, { bgColor: myStyle.bgColor, dotColor: myStyle.dotColor, shape: myStyle.shape, faceType: myStyle.faceType });
    for (const id in SKINS) {
        const s = SKINS[id];
        const previewFace = (s.glyph || s.face1) ? 1 : (s.faceType === 'paco' ? 4 : 5);
        renderDice('skin-prev-' + id, [previewFace], false, { skinId: id });
    }

    // Mise en évidence du skin actif
    document.querySelectorAll('.skin-card').forEach(c => c.classList.remove('selected'));
    const selId = myStyle.skinId ? ('skincard-' + myStyle.skinId) : 'skincard-__custom__';
    const selCard = document.getElementById(selId);
    if (selCard) selCard.classList.add('selected');
}

function selectSkin(id) {
    const hint = document.getElementById('skin-hint');
    if (id === '__custom__') {
        myStyle.skinId = null;
        if (hint) hint.innerText = 'Mode personnalisé : règle les couleurs et formes ci-dessous.';
    } else {
        const s = SKINS[id];
        if (!ownsSkin(id)) {
            if (hint) {
                if (s.requiresBotWin) hint.innerText = `« ${s.name} » se débloque en battant le Cthulhu (le bot) au moins une fois.`;
                else if (s.requiresAllStars) hint.innerText = `« ${s.name} » se débloque en obtenant les 3 étoiles de TOUS les niveaux de Campagne (${myCampaignTotalStars}/${myCampaignMaxStars}).`;
                else if (s.requiresTourney) hint.innerText = `« ${s.name} » se débloque en remportant un tournoi.`;
                else if (s.requiresCampaign) hint.innerText = `« ${s.name} » se débloque au niveau ${s.requiresCampaign} de la Campagne.`;
                else hint.innerText = `« ${s.name} » se débloque à ${s.winsRequired} victoires (tu en as ${myWins}).`;
            }
            return;
        }
        myStyle.skinId = id;
        myStyle.shape = s.shape;
        myStyle.faceType = s.faceType;
        if (s.swatch) myStyle.bgColor = s.swatch;
        if (hint) hint.innerText = `✅ Skin « ${s.name} » choisi. Clique sur « Sauvegarder » !`;
    }
    document.querySelectorAll('.skin-card').forEach(c => c.classList.remove('selected'));
    const card = document.getElementById('skincard-' + id);
    if (card) card.classList.add('selected');
    renderDice('preview-dice-container', PREVIEW_HAND, false, myStyle);
    markStyleDirty();
}

function initFaceSelector() {
    const container = document.getElementById('face-selector');
    if (!container) return;
    container.innerHTML = "";

    // Dés du sélecteur forcés en blanc classique pour une lisibilité universelle
    const forcedBgColor = "#ffffff";
    const forcedDotColor = "#000000";
    const shapeConfig = SHAPES['square'];
    const sType = 'classic';

    [2, 3, 4, 5, 6, 1].forEach(f => {
        const div = document.createElement("div");
        div.className = "dice";
        div.style.backgroundColor = forcedBgColor;
        div.style.borderRadius = shapeConfig.radius;
        div.style.clipPath = shapeConfig.clip;
        div.innerHTML = getDiceSVG(f, forcedDotColor, sType);
        div.onclick = () => {
            if (!isMyTurn) return;
            document.querySelectorAll('#face-selector .dice').forEach(d => d.classList.remove('selected'));
            div.classList.add('selected');
            selectedFace = f;
            // On règle automatiquement la quantité au minimum légal pour cette face
            const input = document.getElementById('bid-qty');
            const minQ = minLegalQty(f);
            if (input && minQ != null) {
                const cur = parseInt(input.value) || 1;
                if (cur < minQ) input.value = minQ;
            }
        };
        container.appendChild(div);
    });
}

function logGame(msg, type, tav) {
    const logEl = document.getElementById("game-log");
    if (!logEl) return;
    let typeClass = "log-entry";
    if (type) {
        typeClass += " " + type;
    } else if (msg.includes("annonce")) typeClass += " bid";
    else if (msg.includes("MENTEUR") || msg.includes("bluff") || msg.includes("❌") || msg.includes("perd")) typeClass += " dudo";
    else if (msg.includes("CALZA") || msg.includes("✅") || msg.includes("regagne")) typeClass += " calza";
    else typeClass += " system";
    // insertAdjacentHTML : on n'ajoute qu'un nœud, sans re-parser tout le journal
    logEl.insertAdjacentHTML('beforeend', `<div class="${typeClass}">${msg}</div>`);
    logEl.scrollTop = logEl.scrollHeight;
    if (tav) { try { Tavernier.say(t(tav)); } catch (e) {} }
}

// Traduit un message de jeu structuré {k, p, type, tav} envoyé par le serveur
function formatLog(o) {
    let s = t(o.k);
    const p = o.p || {};
    s = s.replace(/\{(\w+)\}/g, (m, key) => (p[key] == null ? '' : escapeHtml(String(p[key]))));
    return s;
}

socket.on('round_result_display', (msg) => {
    const text = (msg && typeof msg === 'object' && msg.k) ? formatLog(msg) : msg;
    const curBid = document.getElementById('current-bid');
    if (curBid) curBid.innerHTML = `<div style="font-size: 0.98rem; line-height: 1.5; text-align: center;">${text}</div>`;
    // On garde le résultat dans l'historique pour qu'il reste lisible/consultable
    lastRoundResult = text;
    renderBidHistory();
});

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) target.classList.add('active');
    // Barre de navigation + bulle de tchat du salon : pilotées par ces classes en CSS
    document.body.classList.toggle('on-lobby', screenId === 'lobby-screen');
    document.body.classList.toggle('in-game', screenId === 'game-screen');
    // Garde l'écran allumé seulement pendant une partie
    if (screenId === 'game-screen') { requestWakeLock(); applyTableBg(); } else releaseWakeLock();
}

function sendMessage() {
    const input = document.getElementById('chat-input');
    if (input && input.value.trim()) { socket.emit('send_message', input.value.trim()); input.value = ""; }
}

// Cinématique spectaculaire d'entrée en Palifico
function playPalificoCinematic(name) {
    Tavernier.say('Palifico !');
    if (!SETTINGS.animOn()) return;
    const ov = document.getElementById('palifico-cinematic');
    if (!ov) return;
    const who = ov.querySelector('.pc-who');
    if (who) who.innerHTML = escapeHtml(name) + ' tombe en';
    ov.classList.remove('show');
    void ov.offsetWidth;          // relance l'animation CSS
    ov.style.display = 'flex';
    ov.classList.add('show');
    try { if (window.Sound) { Sound.dudo(); setTimeout(() => Sound.dudo(), 180); } } catch (e) { }
    if (navigator.vibrate) navigator.vibrate([90, 50, 130, 50, 220]);
    clearTimeout(ov._t);
    ov._t = setTimeout(() => { ov.classList.remove('show'); ov.style.display = 'none'; }, 3400);
}

// Cinématique VRAI (Calza) / MENTEUR (Dudo)
let challengeCinematicUntil = 0;
function playChallengeCinematic(type, caller, target) {
    if (!SETTINGS.animOn()) return;
    const ov = document.getElementById('challenge-cinematic');
    if (!ov) return;
    const isCalza = type === 'calza';
    ov.className = 'cc-overlay ' + (isCalza ? 'cc-calza' : 'cc-dudo');
    const who = ov.querySelector('.cc-who');
    const title = ov.querySelector('.cc-title');
    const sub = ov.querySelector('.cc-sub');
    if (who) who.innerHTML = isCalza ? (escapeHtml(caller) + ' crie') : (escapeHtml(caller) + ' accuse ' + escapeHtml(target));
    if (title) { title.textContent = isCalza ? 'VRAI ?!' : 'MENTEUR !'; title.setAttribute('data-text', title.textContent); }
    if (sub) sub.textContent = isCalza ? 'Le compte est-il exact ?' : 'Bluff démasqué ?';
    void ov.offsetWidth;
    ov.style.display = 'flex';
    ov.classList.add('show');
    try { if (window.Sound) Sound.dudo(); } catch (e) { }
    if (navigator.vibrate) navigator.vibrate(isCalza ? [50, 40, 90] : [110, 50, 130]);
    clearTimeout(ov._t);
    ov._t = setTimeout(() => { ov.classList.remove('show'); ov.style.display = 'none'; }, 1500);
    challengeCinematicUntil = Date.now() + 1250;   // décale l'affichage des dés
    const bo = document.getElementById('bid-cinematic'); if (bo) { bo.classList.remove('show'); bo.style.display = 'none'; }  // coupe l'anim de pari
}
socket.on('challenge_called', (d) => { if (d) { lastChallengeType = d.type; playChallengeCinematic(d.type, d.caller, d.target); } });

// ===================== DÉVOILEMENT + COMPTAGE PLEIN ÉCRAN =====================
let _rcTimers = [];
function rcClear() { _rcTimers.forEach(t => clearTimeout(t)); _rcTimers = []; }
function rcLater(fn, ms) { const t = setTimeout(fn, ms); _rcTimers.push(t); return t; }

function playRevealCount(data) {
    if (!data || !SETTINGS.animOn()) return;
    const ov = document.getElementById('reveal-count');
    if (!ov) return;
    rcClear();
    const reduced = SETTINGS.reduced();
    const face = data.bid.face, qty = data.bid.qty;
    const counts = (v) => v === face || (data.wildPacos && v === 1);

    const faceDie = `<span class="rc-facedie">${getDiceSVG(face, '#2a1d0e', 'classic')}</span>`;
    setTextHTML('rc-target', `On compte les ${faceDie}${data.wildPacos ? '<span class="rc-wild">+ Pacos</span>' : ''}`);
    setTextHTML('rc-bid', `Annonce : <b>${qty}</b> × ${face === 1 ? 'Paco' : 'dé ' + face}`);
    const numEl = document.getElementById('rc-num'); if (numEl) numEl.textContent = '0';
    const goalEl = document.getElementById('rc-goal'); if (goalEl) goalEl.textContent = '/ ' + qty;
    const verdictEl = document.getElementById('rc-verdict'); if (verdictEl) { verdictEl.textContent = ''; verdictEl.className = 'rc-verdict'; }

    const board = document.getElementById('rc-board');
    board.innerHTML = '';
    data.players.forEach((p, gi) => {
        const group = document.createElement('div');
        group.className = 'rc-group';
        group.innerHTML = `<div class="rc-pname">${escapeHtml(p.pseudo)}</div><div class="rc-dice" id="rc-dice-${gi}"></div>`;
        board.appendChild(group);
    });
    data.players.forEach((p, gi) => renderDice(`rc-dice-${gi}`, p.dice, false, p.style));

    // Liste plate ordonnée de tous les dés
    const dieEls = [];
    data.players.forEach((p, gi) => {
        const cont = document.getElementById('rc-dice-' + gi);
        const els = cont ? Array.from(cont.querySelectorAll('.dice')) : [];
        els.forEach((el, i) => dieEls.push({ el, v: p.dice[i] }));
    });

    ov.style.display = 'flex';
    ov.classList.remove('show'); void ov.offsetWidth; ov.classList.add('show');
    if (!reduced) dieEls.forEach((d, i) => { d.el.classList.add('rc-in'); d.el.style.animationDelay = (i * 16) + 'ms'; });

    rcLater(() => runRcSweep(dieEls, counts, data, reduced), reduced ? 0 : 600);
}

function runRcSweep(dieEls, counts, data, reduced) {
    const numEl = document.getElementById('rc-num');
    let n = 0;
    const bump = () => { if (numEl) { numEl.classList.remove('rc-bump'); void numEl.offsetWidth; numEl.classList.add('rc-bump'); } };

    if (reduced) {
        dieEls.forEach(d => d.el.classList.add(counts(d.v) ? 'rc-hit' : 'rc-miss'));
        const hits = dieEls.filter(d => counts(d.v)).length;
        let i = 0;
        const step = () => {
            if (i >= hits) { rcFinish(data); return; }
            n++; if (numEl) numEl.textContent = n; bump(); Sound.countTick(n);
            i++; rcLater(step, 95);
        };
        if (hits) rcLater(step, 120); else rcLater(() => rcFinish(data), 250);
        return;
    }

    const D = dieEls.length;
    const H = dieEls.filter(d => counts(d.v)).length;
    const M = D - H;
    const S = 2100;
    const unit = S / Math.max(1, H * 3 + M);
    const perHit = Math.min(420, Math.max(165, unit * 3));
    const perMiss = Math.min(120, Math.max(42, unit));

    let i = 0;
    const step = () => {
        if (i > 0 && dieEls[i - 1]) dieEls[i - 1].el.classList.remove('rc-scan');
        if (i >= D) { rcFinish(data); return; }
        const d = dieEls[i];
        d.el.classList.add('rc-scan');
        if (counts(d.v)) {
            d.el.classList.add('rc-hit');
            if (d.v === 1 && data.wildPacos) d.el.classList.add('rc-wilddie');
            n++; if (numEl) numEl.textContent = n; bump(); Sound.countTick(n);
            i++; rcLater(step, perHit);
        } else {
            d.el.classList.add('rc-miss');
            i++; rcLater(step, perMiss);
        }
    };
    rcLater(step, 60);
}

function rcFinish(data) {
    const numEl = document.getElementById('rc-num');
    if (numEl) numEl.textContent = data.total;   // exactitude garantie (serveur)
    const verdictEl = document.getElementById('rc-verdict');
    const qty = data.bid.qty;
    let ok, label;
    if (data.type === 'calza') {
        ok = data.total === qty;
        label = ok ? '✅ CALZA PARFAIT' : '❌ Calza raté';
    } else {
        ok = data.total >= qty;
        label = ok ? `✅ Annonce tenue · ${data.total} ≥ ${qty}` : `❌ Bluff ! · ${data.total} < ${qty}`;
    }
    if (verdictEl) { verdictEl.textContent = label; verdictEl.className = 'rc-verdict show ' + (ok ? 'good' : 'bad'); }
    Sound.tally(ok);
    const ov = document.getElementById('reveal-count');
    rcLater(() => { if (ov) { ov.classList.remove('show'); rcLater(() => { ov.style.display = 'none'; }, 400); } }, 700);
}

function setTextHTML(id, html) { const el = document.getElementById(id); if (el) el.innerHTML = html; }

// Déclenché par reveal_hands : on calcule le comptage côté client (identique pour tous,
// car même broadcast de dés + même mise + même règle Palifico sur chaque écran).
function startRevealCount(hands) {
    if (!hands || !SETTINGS.animOn()) return;
    if (!currentBid || !currentBid.qty) return;
    const face = currentBid.face, qty = currentBid.qty;
    const wildPacos = !isPalifico && face !== 1;
    const players = [];
    let total = 0;
    for (const pid of Object.keys(hands)) {
        const hand = hands[pid];
        if (!hand || !hand.length) continue;
        const dice = hand.slice().sort((a, b) => a - b);
        dice.forEach(d => { if (d === face || (wildPacos && d === 1)) total++; });
        players.push({
            pseudo: roomPlayerNames[pid] || (pid === myId ? myPseudo : '???'),
            color: (roomPlayersStyles[pid] && roomPlayersStyles[pid].bgColor) || '#d4af37',
            style: roomPlayersStyles[pid] || {},
            dice
        });
    }
    if (!players.length) return;
    playRevealCount({ players, bid: { qty, face }, wildPacos, total, type: lastChallengeType || 'dudo' });
}

// Animation du pari : tout le monde voit clairement la mise annoncée
function playBidCinematic(bid) {
    const mode = SETTINGS.bidMode();
    if (mode === 'off') return;
    if (mode === 'others' && bid && bid.pseudo === myPseudo) return;
    const ov = document.getElementById('bid-cinematic');
    if (!ov || !bid || !bid.qty) return;
    const who = ov.querySelector('.bc-who');
    const bd = ov.querySelector('.bc-bid');
    const r = resolveSkin(bid.style);
    const shape = SHAPES[r.shape] || SHAPES['square'];
    const borderCss = r.border ? `border:${r.border};` : '';
    if (who) who.innerHTML = `<span class="bc-name">${escapeHtml(bid.pseudo)}</span> mise`;
    if (bd) bd.innerHTML = `<span class="bc-qty">${bid.qty}</span><span class="bc-x">×</span><div class="bc-die dice" style="background:${r.bg}; ${borderCss} border-radius:${shape.radius}; clip-path:${shape.clip}">${getDiceSVG(bid.face, r.pip, r.faceType, r.face1, r.glyph, r.faceImage)}</div>`;
    ov.classList.remove('show');
    void ov.offsetWidth;
    ov.style.display = 'flex';
    ov.classList.add('show');
    clearTimeout(ov._t);
    ov._t = setTimeout(() => { ov.classList.remove('show'); ov.style.display = 'none'; }, 1900);
}

let lobbyChatOpen = false;
let lobbyChatUnread = 0;

function toggleLobbyChatPanel() {
    const panel = document.getElementById('lobby-chat-panel');
    if (!panel) return;
    lobbyChatOpen = panel.style.display !== 'block';
    panel.style.display = lobbyChatOpen ? 'block' : 'none';
    if (lobbyChatOpen) {
        lobbyChatUnread = 0;
        updateLobbyChatBadge();
        const m = document.getElementById('chat-messages');
        if (m) m.scrollTop = m.scrollHeight;
        const inp = document.getElementById('chat-input');
        if (inp) setTimeout(() => inp.focus(), 50);
    }
}
function updateLobbyChatBadge() {
    const b = document.getElementById('lobby-chat-badge');
    if (!b) return;
    b.style.display = lobbyChatUnread > 0 ? 'block' : 'none';
}

socket.on('chat_message', (data) => {
    const messagesDiv = document.getElementById('chat-messages');
    if (messagesDiv) {
        // data.text est déjà échappé côté serveur ; le pseudo est validé à l'inscription
        messagesDiv.insertAdjacentHTML('beforeend', `<p><b style="color:${nameCol(data.style)}">${escapeHtml(data.sender)}:</b> ${data.text}</p>`);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
    // Badge non-lus si la bulle est fermée et que ce n'est pas mon propre message
    if (!lobbyChatOpen && data.sender !== myPseudo) {
        lobbyChatUnread++;
        updateLobbyChatBadge();
    }
});

function toggleGameChatPanel() {
    const panel = document.getElementById('game-chat-panel');
    if (panel) panel.style.display = (panel.style.display === 'block') ? 'none' : 'block';
}

function sendGameMessage() {
    const input = document.getElementById('game-chat-input');
    if (input && input.value.trim() && currentGameId) {
        checkEasterEgg(input.value);
        socket.emit('send_game_chat', { gameId: currentGameId, msg: input.value.trim() });
        input.value = "";
    }
}

socket.on('game_chat_message', (data) => {
    const messagesDiv = document.getElementById('game-chat-messages');
    if (messagesDiv) {
        messagesDiv.insertAdjacentHTML('beforeend', `<p style="margin: 5px 0; font-size: 0.9rem; color: #ccc;"><b style="color:${nameCol(data.style)}">${escapeHtml(data.sender)}:</b> ${data.text}</p>`);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
});

let _prevPlayers = new Set();
socket.on('update_players', (list) => {
    tablePlayers = list.map(p => p.pseudo);
    const fp = document.getElementById('opt-firstPlayer');
    if (fp && document.getElementById('game-options-modal')?.style.display === 'flex') applyOptionsUI(currentOptions);
    const ul = document.getElementById('players-ul');
    if (!ul) return;
    const anim = SETTINGS.animOn();
    ul.innerHTML = list.map((p, i) => {
        const title = p.title ? `<span class="player-title">${escapeHtml(p.title)}</span>` : '';
        const isNew = anim && !_prevPlayers.has(p.pseudo);
        return `<li class="player-row${isNew ? ' player-in' : ''}"><span class="player-ava">${avatarHTML(p, 38)}</span> <span class="player-name"><span style="color:${pNameColor(p)}">${escapeHtml(p.pseudo)}</span>${title}</span></li>`;
    }).join('');
    _prevPlayers = new Set(list.map(p => p.pseudo));
    ul.dataset.loaded = '1';
});

function createGame() { openCreateModal(); }
function createBotGame() { socket.emit('create_bot_game'); }
function openCreateModal() { const m = document.getElementById('create-mode-modal'); if (m) m.style.display = 'flex'; }
function closeCreateModal() { const m = document.getElementById('create-mode-modal'); if (m) m.style.display = 'none'; }
function chooseCreate(mode) {
    closeCreateModal();
    if (mode === 'tourney') { createTournament(); return; }
    if (mode === 'bot') { socket.emit('create_bot_game'); return; }
    socket.emit('create_game', { mode: mode === 'duo' ? 'duo' : 'solo' });
}
function joinGame(id) { socket.emit('join_game', id); }
function spectateGame(id) { socket.emit('spectate_game', id); }

function switchVoiceRoom(newRoomId) {
    if (inVoice) {
        for (let id in rtcPeers) rtcPeers[id].close();
        rtcPeers = {};
        VoiceMeter.clear();
        if (localStream) { try { VoiceMeter.add(socket.id, localStream); } catch (e) {} }
        socket.emit('leave_voice');
        setTimeout(() => {
            socket.emit('join_voice', newRoomId);
            const status = document.getElementById('voice-status');
            if (status) status.innerText = "Connecté 🎙️";
        }, 500);
    }
}

function leaveGame() {
    try { rcClear(); const _rc = document.getElementById('reveal-count'); if (_rc) { _rc.classList.remove('show'); _rc.style.display = 'none'; } } catch (e) {}
    if (spectating) {
        if (currentGameId) socket.emit('leave_spectate', currentGameId);
        spectating = false;
        exitSpectatorUI();
    } else if (currentGameId) {
        socket.emit('leave_game', currentGameId);
    }
    currentGameId = null;
    lastRoundResult = '';
    roundBids = [];
    gameMode = 'solo'; myTeam = null; teammateId = null;
    gameInProgress = false; teamOrder = []; lastRoomPlayers = [];
    const tsp = document.getElementById('team-setup');
    if (tsp) tsp.style.display = 'none';
    const tz = document.getElementById('teammate-zone');
    if (tz) tz.style.display = 'none';
    const log = document.getElementById('game-log');
    if (log) log.innerHTML = "";
    const chat = document.getElementById('game-chat-messages');
    if (chat) chat.innerHTML = "";
    const widget = document.getElementById('game-chat-widget');
    if (widget) widget.style.display = "none";
    showScreen('lobby-screen');
    switchVoiceRoom('tavern');
}

// Format allégé : { id, count, started } (le serveur n'envoie plus les mains)
let _prevGames = new Set();
socket.on('update_games', (games) => {
    liveGames = Object.values(games).filter(g => g.started).map(g => ({ id: g.id, count: g.count }));
    if (document.getElementById('watch-sheet')?.classList.contains('show')) renderWatchList();
    const gamesDiv = document.getElementById('games-list');
    if (!gamesDiv) return;
    const all = Object.values(games);
    const anim = SETTINGS.animOn();
    const nw = (id) => (anim && !_prevGames.has(id)) ? ' game-new' : '';
    const open = all.filter(g => !g.started);
    const live = all.filter(g => g.started);
    const spec = (g) => (g.spectators > 0) ? ` · 👁 ${g.spectators}` : '';
    let html = '';
    html += open.map(g =>
        `<div class="game-card${nw(g.id)}"><div><strong>${escapeHtml(g.id)}</strong><br><small>Joueurs: ${g.count}/10${spec(g)}</small></div><button class="btn-primary" onclick="joinGame('${g.id}')">Rejoindre</button></div>`
    ).join('');
    html += live.map(g =>
        `<div class="game-card game-live${nw(g.id)}"><div><strong>${escapeHtml(g.id)}</strong><br><small>🔴 En cours · ${g.count} joueurs${spec(g)}</small></div><button class="btn-secondary" onclick="spectateGame('${g.id}')">Regarder</button></div>`
    ).join('');
    gamesDiv.innerHTML = html || ("<p class='list-empty'>" + t('lob_no_table') + "</p>");
    gamesDiv.dataset.loaded = '1';
    _prevGames = new Set(all.map(g => g.id));
});

socket.on('game_joined', (gameId, isHost) => {
    currentGameId = gameId;
    amHost = isHost;
    const roomEl = document.getElementById('current-room');
    if (roomEl) roomEl.innerText = gameId;
    const startBtn = document.getElementById('btn-start');
    if (startBtn) startBtn.style.display = isHost ? "block" : "none";
    const widget = document.getElementById('game-chat-widget');
    if (widget) widget.style.display = "flex";
    const optBtn = document.getElementById('btn-options');
    if (optBtn) optBtn.style.display = 'block';   // visible avant le lancement (hôte modifie, autres consultent)
    roundBids = [];
    lastRoundResult = '';
    renderBidHistory();
    const oz = document.getElementById('opponents-zone');
    if (oz) oz.innerHTML = '';
    const curBid = document.getElementById('current-bid');
    if (curBid) curBid.innerHTML = `<span style="color:#bbb;">${t('g_waiting')}</span>`;
    gameMode = 'solo'; myTeam = null; teammateId = null;
    gameInProgress = false; teamOrder = [];
    const tzj = document.getElementById('teammate-zone');
    if (tzj) tzj.style.display = 'none';
    initFaceSelector();
    showScreen('game-screen');
    switchVoiceRoom(currentGameId);
});

// ----- MODE SPECTATEUR -----
function enterSpectatorUI() {
    document.body.classList.add('spectating');
    const banner = document.getElementById('spectator-banner');
    if (banner) banner.style.display = 'block';
    const controls = document.getElementById('game-controls');
    if (controls) controls.style.display = 'none';
    ['btn-start', 'btn-options'].forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
    const rx = document.getElementById('spec-reactions');
    if (rx) rx.style.display = 'flex';
    const widget = document.getElementById('game-chat-widget');
    if (widget) widget.style.display = 'flex';
    roundBids = []; lastRoundResult = ''; renderBidHistory();
}
function exitSpectatorUI() {
    document.body.classList.remove('spectating');
    const sr = document.getElementById('spec-return'); if (sr) sr.classList.remove('on');
    const banner = document.getElementById('spectator-banner');
    if (banner) banner.style.display = 'none';
    const rx = document.getElementById('spec-reactions');
    if (rx) rx.style.display = 'none';
    closeWatchSheet();
    const controls = document.getElementById('game-controls');
    if (controls) controls.style.display = 'none';
}

// ----- RÉACTIONS FLOTTANTES (spectateurs + joueurs) -----
function sendReaction(emoji) {
    if (!currentGameId) return;
    socket.emit('send_reaction', { gameId: currentGameId, emoji });
    floatReaction(emoji);   // retour visuel immédiat pour soi
}
function floatReaction(emoji) {
    const layer = document.getElementById('reaction-layer');
    if (!layer) return;
    const el = document.createElement('div');
    el.className = 'reaction-float';
    el.textContent = emoji;
    el.style.left = (10 + Math.random() * 76) + '%';
    el.style.fontSize = (1.8 + Math.random() * 1.1) + 'rem';
    el.style.setProperty('--drift', (Math.random() * 60 - 30) + 'px');
    layer.appendChild(el);
    setTimeout(() => el.remove(), 2600);
}
socket.on('reaction', (data) => { if (data && data.emoji) floatReaction(data.emoji); });

// ----- SUIVRE / CHANGER DE TABLE (spectateur) -----
function openWatchSheet() {
    renderWatchList();
    const m = document.getElementById('watch-sheet');
    if (m) { m.style.display = 'flex'; m.classList.remove('show'); void m.offsetWidth; m.classList.add('show'); }
}
function closeWatchSheet() {
    const m = document.getElementById('watch-sheet');
    if (m) { m.classList.remove('show'); setTimeout(() => { m.style.display = 'none'; }, 220); }
}
function renderWatchList() {
    const list = document.getElementById('watch-list');
    if (!list) return;
    const others = liveGames.filter(g => g.id !== currentGameId);
    if (!others.length) { list.innerHTML = '<p class="watch-empty">Aucune autre table en cours pour le moment.</p>'; return; }
    list.innerHTML = others.map(g =>
        `<button class="gm-item watch-row" onclick="watchTable('${g.id}')"><span>Table : <b>${escapeHtml(g.id)}</b></span><span class="watch-count">${g.count} joueurs</span></button>`
    ).join('');
}
function watchTable(id) {
    if (!id || id === currentGameId) { closeWatchSheet(); return; }
    if (currentGameId) socket.emit('leave_spectate', currentGameId);  // on quitte l'ancienne table
    closeWatchSheet();
    spectateGame(id);   // spectate_joined reconstruira tout l'écran
}

socket.on('spectate_joined', (data) => {
    spectating = true;
    currentGameId = data.gameId;
    if (data.tournamentId) {
        currentTournamentId = data.tournamentId;
        const sr = document.getElementById('spec-return'); if (sr) sr.classList.add('on');
    }
    amHost = false;
    enterSpectatorUI();
    const roomEl = document.getElementById('current-room');
    if (roomEl) roomEl.innerText = data.gameId;

    // Tous les joueurs sont affichés en "adversaires" (le spectateur n'a pas de main)
    const oppContainer = document.getElementById('opponents-zone');
    if (oppContainer) oppContainer.innerHTML = "";
    let totalDice = 0;
    (data.playersData || []).forEach(p => {
        totalDice += p.dice;
        roomPlayersStyles[p.id] = p.style; roomPlayerNames[p.id] = p.pseudo;
        if (p.dice > 0 && oppContainer) {
            oppContainer.insertAdjacentHTML('beforeend', opponentCardHTML(p));
            renderDice(`dice-${p.id}`, Array(p.dice).fill(0), true, p.style);
        }
    });
    const totalEl = document.getElementById('total-dice-count');
    if (totalEl) totalEl.innerText = totalDice;
    totalDiceInGame = totalDice;

    isPalifico = data.isPalifico;
    palificoFace = data.palificoFace || null;
    const alert = document.getElementById('palifico-alert');
    if (alert) alert.style.display = isPalifico ? "block" : "none";

    const curBid = document.getElementById('current-bid');
    if (data.currentBid && data.currentBid.qty > 0) {
        currentBid = data.currentBid;
        const r = resolveSkin(data.currentBid.style);
        const shapeConfig = SHAPES[r.shape] || SHAPES['square'];
        const borderCss = r.border ? `border:${r.border};` : '';
        if (curBid) curBid.innerHTML = `<b style="color:${data.currentBid.nameColor || data.currentBid.style.bgColor}">${escapeHtml(data.currentBid.pseudo)}</b> mise : ${data.currentBid.qty} x <div class="dice" style="transform: scale(0.8); margin:0; background:${r.bg}; ${borderCss} border-radius:${shapeConfig.radius}; clip-path:${shapeConfig.clip}">${getDiceSVG(data.currentBid.face, r.pip, r.faceType, r.face1, r.glyph, r.faceImage)}</div>`;
    } else {
        currentBid = { qty: 0, face: 0 };
        if (curBid) curBid.innerHTML = t('g_await_bid');
    }

    showScreen('game-screen');
    switchVoiceRoom(data.gameId);
    updateTurnUI(data.turnId);
});

// Reconnexion : on retrouve une partie déjà commencée et on reconstruit l'écran
socket.on('resume_game', (data) => {
    spectating = false;
    exitSpectatorUI();
    gameInProgress = true;
    const tsp = document.getElementById('team-setup');
    if (tsp) tsp.style.display = 'none';
    currentGameId = data.gameId;
    amHost = !!data.isHost;
    if (data.options) { currentOptions = data.options; applyCalzaVisibility(data.options); }
    const roomEl = document.getElementById('current-room');
    if (roomEl) roomEl.innerText = data.gameId;
    const startBtn = document.getElementById('btn-start');
    if (startBtn) startBtn.style.display = "none";
    const optBtn = document.getElementById('btn-options');
    if (optBtn) optBtn.style.display = 'none';
    roundBids = [];
    renderBidHistory();
    const widget = document.getElementById('game-chat-widget');
    if (widget) widget.style.display = "flex";
    initFaceSelector();

    const controls = document.getElementById('game-controls');
    if (controls) { controls.style.display = "flex"; controls.classList.remove('disabled-zone'); }

    isPalifico = data.isPalifico;
    palificoFace = data.palificoFace || null;
    const alert = document.getElementById('palifico-alert');
    if (alert) alert.style.display = isPalifico ? "block" : "none";

    // Adversaires + mon compteur
    const oppContainer = document.getElementById('opponents-zone');
    if (oppContainer) oppContainer.innerHTML = "";

    // Mode duo : identifier mon équipe / coéquipier (la main de l'équipier arrive via teammate_hand)
    gameMode = data.mode || 'solo';
    myTeam = null; teammateId = null;
    if (gameMode === 'duo') {
        const me = data.playersData.find(p => p.id === myId);
        if (me) myTeam = me.team;
        const mate = data.playersData.find(p => p.id !== myId && p.team === myTeam);
        if (mate) teammateId = mate.id;
    }
    const tz = document.getElementById('teammate-zone');
    if (tz) tz.style.display = (gameMode === 'duo' && teammateId) ? 'block' : 'none';

    let totalDice = 0;
    data.playersData.forEach(p => {
        totalDice += p.dice;
        roomPlayersStyles[p.id] = p.style; roomPlayerNames[p.id] = p.pseudo;
        if (p.id === teammateId) {
            const nm = document.getElementById('teammate-name');
            if (nm) { nm.innerText = p.pseudo; nm.style.color = p.style.bgColor; }
            const tc = document.getElementById('teammate-count');
            if (tc) tc.innerText = p.dice;
            return;
        }
        if (p.id !== myId) {
            if (p.dice > 0 && oppContainer) {
                oppContainer.insertAdjacentHTML('beforeend', opponentCardHTML(p));
                renderDice(`dice-${p.id}`, Array(p.dice).fill(0), true, p.style);
            }
        } else {
            updateMineArea(p.dice);
        }
    });
    const totalEl = document.getElementById('total-dice-count');
    if (totalEl) totalEl.innerText = totalDice;
    totalDiceInGame = totalDice;

    // Ma main
    renderDice('player-dice', data.myHand || [], false, myStyle);

    // Mise en cours
    const curBid = document.getElementById('current-bid');
    if (data.currentBid && data.currentBid.qty > 0) {
        currentBid = data.currentBid;
        const r = resolveSkin(data.currentBid.style);
        const shapeConfig = SHAPES[r.shape] || SHAPES['square'];
        const borderCss = r.border ? `border:${r.border};` : '';
        if (curBid) curBid.innerHTML = `<b style="color:${data.currentBid.nameColor || data.currentBid.style.bgColor}">${escapeHtml(data.currentBid.pseudo)}</b> mise : ${data.currentBid.qty} x <div class="dice" style="transform: scale(0.8); margin:0; background:${r.bg}; ${borderCss} border-radius:${shapeConfig.radius}; clip-path:${shapeConfig.clip}">${getDiceSVG(data.currentBid.face, r.pip, r.faceType, r.face1, r.glyph, r.faceImage)}</div>`;
    } else {
        currentBid = { qty: 0, face: 0 };
        if (curBid) curBid.innerHTML = t('g_await_bid');
    }

    showScreen('game-screen');
    switchVoiceRoom(currentGameId);
    lastTurnOrder = data.playersData.map(p => String(p.id));
    updateTurnUI(data.turnId);
    logGame('🔁 Reconnecté à la partie !');
});

socket.on('update_room_players', (players) => {
    lastRoomPlayers = players.map(p => ({ pseudo: p.pseudo, style: p.style }));
    let totalDice = 0;
    const oppContainer = document.getElementById('opponents-zone');
    if (!oppContainer) return;
    oppContainer.innerHTML = "";
    players.forEach(p => {
        totalDice += p.dice;
        roomPlayersStyles[p.id] = p.style; roomPlayerNames[p.id] = p.pseudo;
        if (p.id !== myId) {
            oppContainer.insertAdjacentHTML('beforeend', opponentCardHTML(p));
            renderDice(`dice-${p.id}`, Array(p.dice).fill(0), true, p.style);
        } else {
            updateMineArea(p.dice);
        }
    });
    const totalEl = document.getElementById('total-dice-count');
    if (totalEl) totalEl.innerText = totalDice;
    totalDiceInGame = totalDice;
    renderTeamSetup();
});

// ----- COMPOSITION DES ÉQUIPES (duo, salle d'attente) -----
socket.on('team_order', (order) => { if (Array.isArray(order)) teamOrder = order; renderTeamSetup(); });

function reconcileTeamOrder() {
    const current = lastRoomPlayers.map(p => p.pseudo);
    let order = teamOrder.filter(ps => current.includes(ps));
    current.forEach(ps => { if (!order.includes(ps)) order.push(ps); });
    teamOrder = order;
}

function renderTeamSetup() {
    const panel = document.getElementById('team-setup');
    if (!panel) return;
    const isDuo = currentOptions && currentOptions.mode === 'duo';
    if (!isDuo || gameInProgress || lastRoomPlayers.length === 0) { panel.style.display = 'none'; return; }
    panel.style.display = 'block';
    reconcileTeamOrder();

    const list = document.getElementById('team-setup-list');
    let html = '';
    teamOrder.forEach((ps, i) => {
        if (i % 2 === 0) html += `<div class="team-pair"><div class="team-pair-label">Équipe ${i / 2 + 1}</div>`;
        const p = lastRoomPlayers.find(x => x.pseudo === ps);
        const color = p ? p.style.bgColor : '#fff';
        const ctrl = amHost ? `<span class="team-move">
            <button class="tm-btn" onclick="moveTeamPlayer('${escapeAttr(ps)}',-1)" ${i === 0 ? 'disabled' : ''}>▲</button>
            <button class="tm-btn" onclick="moveTeamPlayer('${escapeAttr(ps)}',1)" ${i === teamOrder.length - 1 ? 'disabled' : ''}>▼</button>
        </span>` : '';
        html += `<div class="team-member"><b style="color:${color}">🏴‍☠️ ${escapeHtml(ps)}</b>${ctrl}</div>`;
        if (i % 2 === 1) html += `</div>`;
    });
    if (teamOrder.length % 2 === 1) html += `<div class="team-orphan">⚠️ Joueur sans binôme (il faut un nombre pair)</div></div>`;
    list.innerHTML = html;

    const sb = document.getElementById('team-shuffle-btn');
    if (sb) sb.style.display = amHost ? 'block' : 'none';
    const hint = panel.querySelector('.team-setup-hint');
    if (hint) hint.style.display = amHost ? 'block' : 'none';
}

function shuffleTeams() {
    if (!amHost) return;
    const arr = lastRoomPlayers.map(p => p.pseudo);
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    teamOrder = arr;
    socket.emit('set_team_order', { gameId: currentGameId, order: arr });
    renderTeamSetup();
}

function moveTeamPlayer(pseudo, dir) {
    if (!amHost) return;
    reconcileTeamOrder();
    const i = teamOrder.indexOf(pseudo);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= teamOrder.length) return;
    [teamOrder[i], teamOrder[j]] = [teamOrder[j], teamOrder[i]];
    socket.emit('set_team_order', { gameId: currentGameId, order: teamOrder });
    renderTeamSetup();
}

function startGame() { socket.emit('start_game', currentGameId); }
socket.on('game_log', (msg) => {
    if (msg && typeof msg === 'object' && msg.k) {
        logGame(formatLog(msg), msg.type, msg.tav);
        return;
    }
    logGame(msg);
    maybeAnnounceJoin(msg);
    if (/CRIE AU MENTEUR/.test(msg)) Tavernier.say('Menteur démasqué !');
    else if (/CALZA/.test(msg)) Tavernier.say('Calza ! Compte exact !');
});

// ----- OPTIONS DE TABLE (réglées par l'hôte avant lancement) -----
socket.on('game_options', (o) => { currentOptions = o; applyOptionsUI(o); renderTeamSetup(); });

function applyOptionsUI(o) {
    const modal = document.getElementById('game-options-modal');
    if (!modal) return;
    // Seul l'hôte peut modifier ; les autres consultent en lecture seule
    modal.querySelectorAll('input,select').forEach(el => { el.disabled = !amHost; });
    const dice = document.getElementById('opt-startDice');
    if (dice) dice.value = o.startDice;
    const maxp = document.getElementById('opt-maxPlayers');
    if (maxp) maxp.value = o.maxPlayers;
    const pal = document.getElementById('opt-palifico');
    if (pal) pal.checked = o.palifico !== false;
    const cal = document.getElementById('opt-calza');
    if (cal) cal.checked = o.calza !== false;
    const at = document.getElementById('opt-autoTimer');
    if (at) at.checked = o.autoTimer === true;
    const fp = document.getElementById('opt-firstPlayer');
    if (fp) {
        const cur = o.firstPlayer || 'random';
        fp.innerHTML = '<option value="random">Aléatoire</option>' +
            tablePlayers.map(ps => `<option value="${escapeAttr(ps)}">${escapeHtml(ps)}</option>`).join('');
        fp.value = (cur !== 'random' && !tablePlayers.includes(cur)) ? 'random' : cur;
    }
    const modeLine = document.getElementById('opt-mode-line');
    if (modeLine) modeLine.innerText = (o.mode === 'duo')
        ? '🤝 Mode Duo (équipes de 2) — choisi à la création. Nombre PAIR, min 4.'
        : 'Mode Classique — choisi à la création.';
    const summary = document.getElementById('opt-summary');
    if (summary) summary.innerText = `${o.mode === 'duo' ? 'Duo' : 'Classique'} · ${o.startDice} dés · ${o.maxPlayers} max · Palifico ${o.palifico !== false ? 'on' : 'off'} · Calza ${o.calza !== false ? 'on' : 'off'}`;
    applyCalzaVisibility(o);
}

// Masque le bouton Calza quand l'option est désactivée
function applyCalzaVisibility(o) {
    const btn = document.getElementById('btn-calza');
    if (btn) btn.style.display = (o && o.calza === false) ? 'none' : '';
}

function openGameOptions() {
    const modal = document.getElementById('game-options-modal');
    if (modal) { modal.style.display = 'flex'; applyOptionsUI(currentOptions); }
}
function closeGameOptions() {
    const modal = document.getElementById('game-options-modal');
    if (modal) modal.style.display = 'none';
}

function pushGameOptions() {
    if (!amHost || !currentGameId) return;
    const options = {
        startDice: parseInt(document.getElementById('opt-startDice').value, 10),
        maxPlayers: parseInt(document.getElementById('opt-maxPlayers').value, 10),
        palifico: document.getElementById('opt-palifico').checked,
        calza: document.getElementById('opt-calza').checked,
        autoTimer: document.getElementById('opt-autoTimer').checked,
        firstPlayer: (document.getElementById('opt-firstPlayer') || {}).value || 'random'
    };
    socket.emit('set_game_options', { gameId: currentGameId, options });
}

// ----- HISTORIQUE DES ENCHÈRES DE LA MANCHE -----
function toggleBidHistory() {
    const box = document.getElementById('bid-history');
    if (box) box.classList.toggle('open');
}
function bidHistoryHTML() {
    let html = '';
    if (lastRoundResult) {
        const resClean = String(lastRoundResult).replace(/^[^\p{L}<]*/u, ''); // retire l'emoji ✅/❌ de tête
        html += `<div class="bh-result"><div class="bh-result-title">${t('bh_last_round')}</div>${resClean}</div>`;
    }
    if (roundBids.length === 0) {
        html += `<div class="bh-empty">${t('bh_empty')}</div>`;
    } else {
        html += roundBids.map(b => {
            const dice = (b.dice != null) ? ` - ${b.dice} ${t('bh_dice')}` : '';
            return `<div class="bh-row"><b style="color:${b.nameColor || nameCol(b.style)}">${escapeHtml(b.pseudo)}</b>${dice} : ${b.qty} × <span class="bh-facevis">${miniDieHTML(b.face)}</span></div>`;
        }).join('');
    }
    return html;
}
function renderBidHistory() {
    ['bid-history-list', 'bid-history-list-ov'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.innerHTML = bidHistoryHTML(); el.scrollTop = el.scrollHeight; }
    });
}
// Overlay Historique de la manche (bouton dans l'en-tête de jeu)
function openBidHistory() {
    closeBidHistory();
    const ov = document.createElement('div');
    ov.id = 'bidhist-overlay'; ov.className = 'recap-overlay';
    ov.innerHTML = `<div class="recap-card bidhist-card">
        <div class="recap-title">${t('bh_title')}</div>
        <div class="bh-list" id="bid-history-list-ov"></div>
        <button class="btn-primary recap-close" onclick="closeBidHistory()">${t('m_close')}</button>
    </div>`;
    ov.addEventListener('click', (e) => { if (e.target === ov) closeBidHistory(); });
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('show'));
    renderBidHistory();
}
function closeBidHistory() { const o = document.getElementById('bidhist-overlay'); if (o) o.remove(); }

// Ordre du tour courant (ids), pour replacer le joueur actif en haut de la liste
let lastTurnOrder = [];
function reorderActiveTop(turnId) {
    const c = document.getElementById('opponents-zone');
    if (!c || !lastTurnOrder.length) return;
    const start = lastTurnOrder.indexOf(String(turnId));
    if (start < 0) return;
    for (let i = 0; i < lastTurnOrder.length; i++) {
        const id = lastTurnOrder[(start + i) % lastTurnOrder.length];
        const card = document.getElementById('opp-' + id);
        if (card) c.appendChild(card); // ré-append dans l'ordre du tour : l'actif passe en premier
    }
}

function updateTurnUI(turnId) {
    // Surbrillance animée du joueur dont c'est le tour
    document.querySelectorAll('.opponent-card').forEach(el => el.classList.remove('active-turn'));
    const activeCard = document.getElementById(`opp-${turnId}`);
    if (activeCard) activeCard.classList.add('active-turn');
    reorderActiveTop(turnId);                   // amène le joueur actif EN HAUT de la liste (plus besoin de scroller)
    updateOpeningTurnLabel(turnId);             // "C'est au tour de X" tant qu'aucune mise

    if (spectating) return;

    isMyTurn = (turnId === myId);
    const controls = document.getElementById('game-controls');
    const actionBar = document.getElementById('g-actions');
    if (!controls) return;

    if (isMyTurn) {
        controls.classList.remove('disabled-zone');
        if (actionBar) actionBar.classList.add('my-turn');
        // Petite vibration : impossible de rater son tour sur mobile
        if (navigator.vibrate) navigator.vibrate(90);
    } else {
        controls.classList.add('disabled-zone');
        if (actionBar) actionBar.classList.remove('my-turn');
        document.querySelectorAll('#face-selector .dice').forEach(d => d.classList.remove('selected'));
        selectedFace = null;
    }
    updateChallengeButtons();
}

// Quand il y a plus de cartes que de place, on fait défiler pour centrer le joueur actif
function centerActivePlayer(turnId) {
    const vp = document.getElementById('opponents-viewport');
    const card = document.getElementById(`opp-${turnId}`);
    if (!vp || !card) return;
    if (vp.scrollHeight <= vp.clientHeight + 4) return;   // tout tient à l'écran : pas de défilement
    const target = card.offsetTop - (vp.clientHeight / 2) + (card.offsetHeight / 2);
    vp.scrollTo({ top: Math.max(0, target), behavior: SETTINGS.animOn() ? 'smooth' : 'auto' });
}

// Tant que personne n'a misé : "C'est au tour de <joueur>"
function updateOpeningTurnLabel(turnId) {
    if (currentBid && currentBid.qty > 0) return;        // une mise existe déjà : on ne touche pas
    const curBid = document.getElementById('current-bid');
    if (!curBid) return;
    let name = (turnId === myId) ? 'toi' : roomPlayerNames[turnId];
    if (!name) return;
    curBid.innerHTML = `${t('g_turn_of')} <b>${escapeHtml(name)}</b>`;
}

// Vrai (Calza) et Menteur (Dudo) sont impossibles tant que personne n'a misé (ouverture)
function updateChallengeButtons() {
    const opening = !currentBid || currentBid.qty === 0;
    const calza = document.getElementById('btn-calza');
    const dudo = document.getElementById('btn-dudo');
    if (calza) calza.disabled = opening;
    if (dudo) dudo.disabled = opening;
}

socket.on('round_started', (data) => {
    gameInProgress = true;
    const teamSetup = document.getElementById('team-setup');
    if (teamSetup) teamSetup.style.display = 'none';
    const startBtn = document.getElementById('btn-start');
    if (startBtn) startBtn.style.display = "none";
    const optBtn = document.getElementById('btn-options');
    if (optBtn) optBtn.style.display = 'none';
    closeGameOptions();
    const controls = document.getElementById('game-controls');
    if (controls) { controls.style.display = "flex"; controls.classList.remove('disabled-zone'); }
    currentBid = { qty: 0, face: 0 };
    roundBids = [];
    renderBidHistory();
    updateChallengeButtons();
    const curBid = document.getElementById('current-bid');
    if (curBid) curBid.innerHTML = `En attente de la première mise...`;

    isPalifico = data.isPalifico;
    palificoFace = null;
    const alert = document.getElementById('palifico-alert');
    if (alert) alert.style.display = isPalifico ? "block" : "none";

    // Bannière des modificateurs de campagne (tempête / brouillard / malédiction)
    const modsBanner = document.getElementById('mods-banner');
    if (modsBanner) {
        if (data.mods && data.mods.length) {
            const lbl = { tempete: 'Tempête', brouillard: 'Brouillard', malediction: 'Malédiction' };
            modsBanner.innerHTML = data.mods.map(m => `<span class="mod-chip">${svgIcon(MOD_ICON[m] || 'compass', 12)} ${lbl[m] || m}</span>`).join('');
            modsBanner.style.display = 'flex';
        } else {
            modsBanner.style.display = 'none';
        }
    }

    if (data.isPalifico && data.palificoPlayer) {
        playPalificoCinematic(data.palificoPlayer);
        const popupText = document.getElementById('palifico-popup-text');
        if (popupText) popupText.innerHTML = `<b>${escapeHtml(data.palificoPlayer)}</b> est en PALIFICO !<br><br>Les Pacos ne sont plus des jokers. La face annoncée est <b>verrouillée</b> : tout le monde mise dessus. Tu peux aussi <b>passer aux Pacos</b> (moitié supérieure), ou revenir sur la face depuis les Pacos (le double).`;
        setTimeout(() => {
            const popup = document.getElementById('palifico-popup');
            if (popup) popup.style.display = 'flex';
        }, 2900);
    }

    document.querySelectorAll('#face-selector .dice').forEach(d => d.classList.remove('selected'));
    selectedFace = null;
    const qtyInput = document.getElementById('bid-qty');
    if (qtyInput) qtyInput.value = 1;

    let totalDice = 0;
    const oppContainer = document.getElementById('opponents-zone');

    // Mode duo : identifier mon équipe et mon coéquipier
    gameMode = data.mode || 'solo';
    myTeam = null; teammateId = null;
    if (gameMode === 'duo') {
        const me = data.playersData.find(p => p.id === myId);
        if (me) myTeam = me.team;
        const mate = data.playersData.find(p => p.id !== myId && p.team === myTeam);
        if (mate) teammateId = mate.id;
    }
    const tz = document.getElementById('teammate-zone');
    if (tz) tz.style.display = (gameMode === 'duo' && teammateId) ? 'block' : 'none';

    // Nettoyage : on retire les cartes d'adversaires qui ne sont plus en jeu
    // (joueurs éliminés -> animation ; anciens bots d'une autre partie -> retrait direct)
    if (oppContainer) {
        const allIds = new Set(data.playersData.map(p => String(p.id)));
        const aliveIds = new Set(data.playersData.filter(p => p.id !== myId && p.id !== teammateId && p.dice > 0).map(p => String(p.id)));
        const anim = SETTINGS.animOn();
        Array.from(oppContainer.querySelectorAll('.opponent-card')).forEach(card => {
            const id = card.id.startsWith('opp-') ? card.id.slice(4) : '';
            if (aliveIds.has(id)) return;
            if (allIds.has(id)) {                              // éliminé de cette partie
                if (!card.classList.contains('eliminated')) {
                    if (anim) { card.classList.add('eliminated'); setTimeout(() => card.remove(), 700); }
                    else card.remove();
                }
            } else card.remove();                              // fantôme d'une autre partie
        });
    }

    data.playersData.forEach(p => {
        totalDice += p.dice;
        roomPlayersStyles[p.id] = p.style; roomPlayerNames[p.id] = p.pseudo;
        if (p.id === teammateId) {
            // Coéquipier : affiché dans sa propre zone (dés visibles via teammate_hand)
            const nm = document.getElementById('teammate-name');
            if (nm) { nm.innerText = p.pseudo; nm.style.color = p.style.bgColor; }
            const tc = document.getElementById('teammate-count');
            if (tc) tc.innerText = p.dice;
            return;
        }
        if (p.id !== myId) {
            // Crée la carte si elle n'existe pas encore (ex. partie contre le bot lancée d'emblée)
            let opp = document.getElementById(`opp-${p.id}`);
            if (!opp && p.dice > 0 && oppContainer) {
                oppContainer.insertAdjacentHTML('beforeend', opponentCardHTML(p));
                opp = document.getElementById(`opp-${p.id}`);
            }
            const countEl = document.getElementById(`opp-dice-count-${p.id}`);
            if (countEl) countEl.innerText = p.dice;
            if (p.dice > 0) {
                renderDice(`dice-${p.id}`, Array(p.dice).fill(0), true, p.style);
                playRollAnim(`dice-${p.id}`);
                if (opp) opp.style.display = "block";
            } else {
                if (opp) opp.style.display = "none";
            }
        } else {
            updateMineArea(p.dice);
        }
    });

    const totalEl = document.getElementById('total-dice-count');
    if (totalEl) totalEl.innerText = totalDice;
    totalDiceInGame = totalDice;

    Sound.roll();
    lastTurnOrder = data.playersData.map(p => String(p.id));
    updateTurnUI(data.turnId);
});

socket.on('your_hand', (data) => {
    let hand = data, mask = 0;
    if (data && !Array.isArray(data) && Array.isArray(data.hand)) { hand = data.hand; mask = data.hiddenCount || 0; }
    renderDice('player-dice', hand, false, myStyle, mask);
    playRollAnim('player-dice');
});

// Duo : main de l'équipier (visible face découverte)
socket.on('teammate_hand', (data) => {
    teammateId = data.id;
    const tz = document.getElementById('teammate-zone');
    if (tz) tz.style.display = 'block';
    const nm = document.getElementById('teammate-name');
    if (nm) { nm.innerText = data.pseudo; nm.style.color = data.style.bgColor; }
    const tc = document.getElementById('teammate-count');
    if (tc) tc.innerText = data.dice;
    roomPlayersStyles[data.id] = data.style;
    if (data.dice > 0) {
        renderDice('teammate-dice', data.hand || [], false, data.style);
    } else {
        const td = document.getElementById('teammate-dice');
        if (td) td.innerHTML = '<span style="color:#888;">Éliminé</span>';
    }
});

socket.on('start_rejected', (msg) => { showToast(msg || "Impossible de lancer la partie."); });
socket.on('turn_changed', (turnId) => { updateTurnUI(turnId); });

socket.on('bid_updated', (bid) => {
    currentBid = bid;
    roundBids.push(bid);
    playBidCinematic(bid);
    // Palifico : la 1ère face annoncée (≠ Paco) est la face verrouillée
    if (isPalifico && bid.face !== 1 && !palificoFace) palificoFace = bid.face;
    renderBidHistory();
    updateChallengeButtons();
    Sound.bid();
    const r = resolveSkin(bid.style);
    const shapeConfig = SHAPES[r.shape] || SHAPES['square'];
    const borderCss = r.border ? `border:${r.border};` : '';

    const curBid = document.getElementById('current-bid');
    if (curBid) {
        curBid.innerHTML = `<b style="color:${nameCol(bid.style)}">${escapeHtml(bid.pseudo)}</b> mise : ${bid.qty} x <div class="dice" style="transform: scale(0.8); margin:0; background:${r.bg}; ${borderCss} border-radius:${shapeConfig.radius}; clip-path:${shapeConfig.clip}">${getDiceSVG(bid.face, r.pip, r.faceType, r.face1, r.glyph, r.faceImage)}</div>`;
        if (SETTINGS.animOn()) { curBid.classList.remove('bid-pop'); void curBid.offsetWidth; curBid.classList.add('bid-pop'); }
    }
});

// Le serveur peut refuser une mise (anti-triche) -> on réactive les contrôles
socket.on('bid_rejected', (msg) => {
    const controls = document.getElementById('game-controls');
    if (controls && isMyTurn) controls.classList.remove('disabled-zone');
    showBidError(msg || "Mise refusée.");
});

// Validation côté client = retour visuel instantané. Le serveur reste l'autorité.
function checkRuleValidity(q, f) {
    let oq = currentBid.qty, of = currentBid.face;
    if (oq !== 0 && roundBids.some(b => b.qty === q && b.face === f)) {
        return { valid: false, error: "Cette enchère a déjà été jouée cette manche !" };
    }
    if (oq === 0) {
        if (f === 1) return { valid: false, error: "Interdit de commencer par des Pacos ! Annonce d'abord un nombre." };
        if (q > 0) return { valid: true };
        return { valid: false, error: "La quantité doit être supérieure à 0." };
    }
    if (isPalifico) {
        const lockedFace = palificoFace || (of !== 1 ? of : null);
        if (of === 1) {
            // mise courante sur les Pacos
            if (f === 1 && q > oq) return { valid: true };
            if (lockedFace && f === lockedFace && q >= oq * 2) return { valid: true };
            return { valid: false, error: `Sur les Pacos : monte à ${oq + 1} Pacos, ou reviens sur la face ${lockedFace || of} à ${oq * 2} dés minimum.` };
        }
        if (f === of) {
            if (q > oq) return { valid: true };
            return { valid: false, error: `Tu dois annoncer au moins ${oq + 1} dés.` };
        }
        if (f === 1) {
            // passer aux Pacos : moitié supérieure
            const minPaco = Math.ceil(oq / 2);
            if (q >= minPaco) return { valid: true };
            return { valid: false, error: `Pour passer aux Pacos : la moitié supérieure, soit ${minPaco} Paco(s) minimum.` };
        }
        return { valid: false, error: `En Palifico : reste sur la face ${of}, ou passe aux Pacos.` };
    }
    if (of !== 1) {
        if (f === 1) {
            let minPaco = Math.ceil(oq / 2);
            if (q >= minPaco) return { valid: true };
            return { valid: false, error: `Faux ! Il faut annoncer la moitié supérieure en Pacos.\nOptions : ${minPaco} Paco(s) ou plus.` };
        }
        if (q > oq || (q === oq && f > of)) return { valid: true };
        return { valid: false, error: `Faux ! Tu dois annoncer :\n- Soit ${oq} dés d'une face > ${of}\n- Soit ${oq + 1} dés (n'importe quelle face)` };
    } else {
        if (f === 1) {
            if (q > oq) return { valid: true };
            return { valid: false, error: `Faux ! Il faut au moins ${oq + 1} Paco(s) !` };
        }
        let minNormal = oq * 2;
        if (q >= minNormal) return { valid: true };
        return { valid: false, error: `Faux ! Pour quitter les Pacos, il faut annoncer le double.\nOptions : Au moins ${minNormal} dés normaux !` };
    }
}

function makeBid() {
    const qtyInput = document.getElementById("bid-qty");
    if (!qtyInput) return;
    let q = parseInt(qtyInput.value);
    if (!q || !selectedFace) { showBidError("Sélectionne une quantité et clique sur un dé !"); return; }
    if (totalDiceInGame > 0 && q > totalDiceInGame) {
        showBidError(`Il n'y a que ${totalDiceInGame} dés en jeu, impossible d'en annoncer plus !`);
        return;
    }

    let check = checkRuleValidity(q, selectedFace);
    if (check.valid) {
        const controls = document.getElementById('game-controls');
        if (controls) controls.classList.add('disabled-zone');
        socket.emit('make_bid', { gameId: currentGameId, qty: q, face: selectedFace });
    } else {
        showBidError(check.error);
    }
}

function callDudo() {
    const controls = document.getElementById('game-controls');
    if (controls) controls.classList.add('disabled-zone');
    socket.emit('call_dudo', currentGameId);
}

function callCalza() {
    const controls = document.getElementById('game-controls');
    if (controls) controls.classList.add('disabled-zone');
    socket.emit('call_calza', currentGameId);
}

socket.on('reveal_hands', (hands) => {
    const doReveal = () => {
        for (const [pid, hand] of Object.entries(hands)) {
            if (pid !== myId) {
                renderDice(`dice-${pid}`, hand, false, roomPlayersStyles[pid]);
                playRevealAnim(`dice-${pid}`);
            }
        }
        Sound.dudo();
        startRevealCount(hands);
    };
    const wait = challengeCinematicUntil - Date.now();
    if (wait > 0) setTimeout(doReveal, wait); else doReveal();
});

socket.on('game_over', (winner) => {
    const controls = document.getElementById('game-controls');
    if (controls) controls.style.display = "none";
    const bid = document.getElementById('current-bid');
    if (bid) bid.innerHTML = `<span style="font-size: 1.3rem; text-align: center; color: var(--gold);">${escapeHtml(winner)} a gagné !</span>`;
    if (inTournamentMatch) { Sound.win(); return; }   // le tournoi gère sa propre suite
    showVictoryScreen(winner);
    if (gameOverTimer) clearTimeout(gameOverTimer);
    gameOverTimer = setTimeout(() => { gameOverTimer = null; closeVictoryScreen(); }, 15000);
});

function showVictoryScreen(winner) {
    const scr = document.getElementById('victory-screen');
    if (!scr) { Sound.win(); return; }
    const meWon = winner === myPseudo;
    const lbl = document.getElementById('vic-label');
    if (lbl) lbl.textContent = meWon ? 'Tu as gagné !' : 'Victoire';
    const nameEl = document.getElementById('vic-name');
    if (nameEl) nameEl.textContent = winner;
    // Teinte selon le skin équipé (si on gagne), sinon or classique
    const tint = meWon ? mySkinColor() : '#ffd86b';
    scr.style.setProperty('--vic-glow', tint);
    scr.style.display = 'flex';
    scr.classList.remove('show'); void scr.offsetWidth; scr.classList.add('show');
    // Bouton "Carte de la partie" (récap), injecté une seule fois
    if (_lastRecap && !document.getElementById('vic-recap-btn') && nameEl) {
        const b = document.createElement('button');
        b.id = 'vic-recap-btn'; b.className = 'btn-secondary'; b.style.marginTop = '14px';
        b.textContent = '📜 Carte de la partie';
        b.onclick = showRecapCard;
        (nameEl.parentNode || scr).appendChild(b);
    }
    Tavernier.say(meWon ? 'Victoire ! Tu remportes la partie !' : (winner + ' remporte la partie !'));
    if (SETTINGS.animOn()) {
        Sound.champion();
        const palette = meWon ? [tint, '#ffe9a8', '#fff7e0', '#ffd86b'] : ['#ffd86b', '#ffe9a8', '#fff7e0', '#caa233'];
        runConfetti(scr.querySelector('.vic-confetti'), SETTINGS.heavyFx() ? 130 : 60, palette);
    } else { Sound.win(); }
}
function closeVictoryScreen() {
    if (gameOverTimer) { clearTimeout(gameOverTimer); gameOverTimer = null; }
    closeRecapCard();
    const scr = document.getElementById('victory-screen');
    if (scr) { scr.classList.remove('show'); setTimeout(() => { scr.style.display = 'none'; }, 350); }
    leaveGame();
}

// ==========================================
// 🎙️ SYSTÈME AUDIO WEBRTC
// ==========================================
let localStream;
let rtcPeers = {};
let inVoice = false;
const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

function toggleVoicePanel() {
    const panel = document.getElementById('voice-panel');
    if (panel) panel.style.display = (panel.style.display === 'block') ? 'none' : 'block';
}

async function toggleVoice() {
    const btn = document.getElementById('btn-toggle-voice');
    const status = document.getElementById('voice-status');

    if (inVoice) {
        if (localStream) localStream.getTracks().forEach(t => t.stop());
        for (let id in rtcPeers) rtcPeers[id].close();
        rtcPeers = {};
        VoiceMeter.clear();
        socket.emit('leave_voice');
        inVoice = false;
        if (status) status.innerText = "Déconnecté";
        if (btn) { btn.innerText = "Rejoindre"; btn.classList.replace('btn-danger', 'btn-calza'); }
        const bubble = document.getElementById('voice-bubble');
        if (bubble) bubble.style.backgroundColor = "var(--gold)";
        const list = document.getElementById('voice-users-list');
        if (list) list.style.display = 'none';
        const pttBtn = document.getElementById('btn-ptt');
        if (pttBtn) pttBtn.style.display = 'none';
    } else {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const roomToJoin = currentGameId || 'tavern';
            socket.emit('join_voice', roomToJoin);
            inVoice = true;
            try { VoiceMeter.add(socket.id, localStream); } catch (e) {}
            try { applyPttUI(); applyPttMute(); } catch (e) {}
            if (status) status.innerText = "Connecté 🎙️";
            if (btn) { btn.innerText = "Quitter le vocal"; btn.classList.replace('btn-calza', 'btn-danger'); }
            const bubble = document.getElementById('voice-bubble');
            if (bubble) bubble.style.backgroundColor = "var(--green-btn)";
        } catch (e) {
            showBidError("Accès au micro refusé ! Vérifie tes paramètres de navigateur.");
        }
    }
}

socket.on('lobby_voice_active', (active) => {
    const dot = document.getElementById('voice-dot');
    if (dot) dot.style.display = active ? 'block' : 'none';
});

socket.on('update_voice_users', (users) => {
    const listEl = document.getElementById('voice-users-list');
    if (!listEl) return;
    if (users.length === 0) { listEl.style.display = "none"; listEl.innerHTML = ""; return; }
    listEl.style.display = "block";
    listEl.innerHTML = users.map(u =>
        `<li id="vu-${u.id}" class="voice-user"><span class="vu-mic" style="color:${u.color}">🎙️</span> <span class="vu-name">${escapeHtml(u.pseudo)}</span><span class="vu-wave" aria-hidden="true"><i></i><i></i><i></i><i></i></span></li>`
    ).join('');
});

socket.on('voice_user_joined', async (userId) => {
    const pc = createPeerConnection(userId);
    rtcPeers[userId] = pc;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('webrtc_offer', { target: userId, offer: pc.localDescription });
});

socket.on('webrtc_offer', async ({ sender, offer }) => {
    const pc = createPeerConnection(sender);
    rtcPeers[sender] = pc;
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('webrtc_answer', { target: sender, answer: pc.localDescription });
});

socket.on('webrtc_answer', async ({ sender, answer }) => {
    if (rtcPeers[sender]) await rtcPeers[sender].setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on('webrtc_ice_candidate', async ({ sender, candidate }) => {
    if (rtcPeers[sender]) await rtcPeers[sender].addIceCandidate(new RTCIceCandidate(candidate));
});

socket.on('voice_user_left', (userId) => {
    VoiceMeter.remove(userId);
    try { Spatial.detach(userId); } catch (e) {}
    if (rtcPeers[userId]) {
        rtcPeers[userId].close();
        delete rtcPeers[userId];
        const audioEl = document.getElementById(`audio-${userId}`);
        if (audioEl) audioEl.remove();
    }
});

// Détection « qui parle » via Web Audio -> ripple sur le participant
const VoiceMeter = (() => {
    let raf = null; const meters = {};
    function add(id, stream) {
        const c = Sound.ctx(); if (!c || !stream) return;
        try {
            const src = c.createMediaStreamSource(stream);
            const an = c.createAnalyser(); an.fftSize = 256; an.smoothingTimeConstant = 0.65;
            src.connect(an);
            meters[id] = { an, src, data: new Uint8Array(an.frequencyBinCount) };
            start();
        } catch (e) {}
    }
    function remove(id) {
        if (meters[id]) { try { meters[id].src.disconnect(); } catch (e) {} delete meters[id]; const el = document.getElementById('vu-' + id); if (el) el.classList.remove('speaking'); }
        if (!Object.keys(meters).length && raf) { cancelAnimationFrame(raf); raf = null; }
    }
    function clear() { Object.keys(meters).forEach(remove); }
    function start() {
        if (raf) return;
        const tick = () => {
            let any = false;
            for (const id in meters) {
                const m = meters[id]; m.an.getByteFrequencyData(m.data);
                let sum = 0; for (let i = 0; i < m.data.length; i++) sum += m.data[i];
                const vol = sum / m.data.length;
                const el = document.getElementById('vu-' + id);
                if (el) el.classList.toggle('speaking', vol > 11);
                any = true;
            }
            raf = any ? requestAnimationFrame(tick) : null;
        };
        raf = requestAnimationFrame(tick);
    }
    return { add, remove, clear };
})();

function createPeerConnection(userId) {
    const pc = new RTCPeerConnection(rtcConfig);
    if (localStream) localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pc.onicecandidate = (e) => {
        if (e.candidate) socket.emit('webrtc_ice_candidate', { target: userId, candidate: e.candidate });
    };

    pc.ontrack = (e) => {
        let audioEl = document.getElementById(`audio-${userId}`);
        if (!audioEl) {
            audioEl = document.createElement('audio');
            audioEl.id = `audio-${userId}`;
            audioEl.autoplay = true;
            document.body.appendChild(audioEl);
        }
        audioEl.srcObject = e.streams[0];
        try { Spatial.attach(userId, e.streams[0], audioEl); } catch (err) {}
        VoiceMeter.add(userId, e.streams[0]);
    };
    return pc;
}

// =====================================================================
//  TAPIS DE TABLE (arrière-plans) + ENTRÉE JOUEUR + ÉLIMINATION + EASTER EGG
// =====================================================================
const TABLES = {
    taverne: { name: 'Taverne', bg: 'radial-gradient(circle at 50% 28%, #4a3420, #2a1c0f 70%, #160e07)' },
    pont:    { name: 'Pont du navire', bg: 'linear-gradient(rgba(0,0,0,0.35),rgba(0,0,0,0.55)), repeating-linear-gradient(100deg, #5a3f22 0 30px, #4e3620 30px 60px)' },
    abysse:  { name: 'Abysse', bg: 'radial-gradient(circle at 50% 24%, #0c3d4e, #062330 64%, #02121a)' },
    tresor:  { name: 'Trésor', bg: 'radial-gradient(circle at 50% 24%, #6a4a18, #3a2710 70%, #1d1308)' },
    nuit:    { name: 'Nuit étoilée', bg: 'radial-gradient(circle at 50% 28%, #1c2750, #0a0f24 70%, #05060f)' },
    brume:   { name: 'Brume', bg: 'radial-gradient(circle at 50% 28%, #3c4146, #23272b 70%, #14171a)' },
    volcan:  { name: 'Volcan', bg: 'radial-gradient(circle at 50% 72%, #7a230b, #2a0d05 64%, #130503)' },
    glacier: { name: 'Glacier', bg: 'radial-gradient(circle at 50% 24%, #2c5e7e, #143a52 64%, #08222e)' },
    royal:     { name: 'Royal', bg: 'radial-gradient(circle at 50% 26%, #5b2a8a, #2e1450 68%, #160826)' },
    amethyste: { name: 'Améthyste', bg: 'radial-gradient(circle at 50% 24%, #8b46c8, #4a1f7a 60%, #25103f)' },
    emeraude:  { name: 'Émeraude', bg: 'radial-gradient(circle at 50% 26%, #1f6b46, #0d3a26 68%, #061d13)' },
    rubis:     { name: 'Rubis', bg: 'radial-gradient(circle at 50% 26%, #a02447, #4a1024 68%, #240810)' },
    ocean:     { name: 'Océan', bg: 'radial-gradient(circle at 50% 26%, #15568a, #0a2f50 68%, #04162a)' },
    or:        { name: 'Or massif', bg: 'radial-gradient(circle at 50% 26%, #9a7620, #4d3a10 66%, #241b07)' },
    crepuscule:{ name: 'Crépuscule', bg: 'linear-gradient(165deg, #3a1a4e, #7a2e4a 55%, #b5562e)' },
    aurore:    { name: 'Aurore', bg: 'linear-gradient(165deg, #06283d, #1a6b5a 55%, #3aa17e)' },
    jungle:    { name: 'Jungle', bg: 'radial-gradient(circle at 50% 26%, #2e5a26, #163316 66%, #0a1c0a)' },
    onyx:      { name: 'Onyx', bg: 'radial-gradient(circle at 50% 26%, #2c2c34, #141417 66%, #08080a)' },
    corail:    { name: 'Corail', bg: 'linear-gradient(165deg, #2a1030, #7a2e52 55%, #d97a6a)' }
};
let myTable = 'taverne';
try { const _t = localStorage.getItem('erquy_table'); if (_t && TABLES[_t]) myTable = _t; } catch (e) {}
function applyTableBg() {
    const sc = document.getElementById('game-screen');
    if (sc) sc.style.background = (TABLES[myTable] || TABLES.taverne).bg;
}
function selectTable(id) {
    if (!TABLES[id]) return;
    myTable = id;
    try { localStorage.setItem('erquy_table', id); } catch (e) {}
    applyTableBg();
    renderTableGallery();
}
function renderTableGallery() {
    const g = document.getElementById('table-gallery');
    if (!g) return;
    g.innerHTML = Object.entries(TABLES).map(([id, t]) =>
        `<button class="table-card ${id === myTable ? 'selected' : ''}" onclick="selectTable('${id}')"><span class="table-prev" style="background:${t.bg}"></span><span class="table-name">${t.name}</span></button>`
    ).join('');
}

// Toast d'ambiance (entrée joueur, élimination…)
function showTavernToast(html, kind) {
    let layer = document.getElementById('tavern-toast-layer');
    if (!layer) { layer = document.createElement('div'); layer.id = 'tavern-toast-layer'; document.body.appendChild(layer); }
    const el = document.createElement('div');
    el.className = 'tavern-toast ' + (kind || '');
    el.innerHTML = html;
    layer.appendChild(el);
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3100);
}
function maybeAnnounceJoin(msg) {
    const m = /<b>(.*?)<\/b> a rejoint la table/.exec(msg || '');
    if (m) showTavernToast(`🏴‍☠️ <b>${m[1]}</b> rejoint la taverne`, 'join');
}
socket.on('player_eliminated', ({ pseudo, id }) => {
    const card = document.getElementById('opp-' + id);
    if (card) card.classList.add('eliminated');
    showTavernToast(`☠️ <b>${escapeHtml(pseudo)}</b> est éliminé !`, 'elim');
    try { if (SETTINGS.animOn()) Sound.thunder(); } catch (e) {}
});

// Easter egg : taper "kraken" dans le tchat
function checkEasterEgg(text) {
    if ((text || '').toLowerCase().trim() === 'kraken') { playKraken(); return true; }
    return false;
}
function playKraken() {
    if (!SETTINGS.animOn()) { return; }
    if (document.getElementById('kraken-egg')) return;
    const el = document.createElement('div');
    el.id = 'kraken-egg'; el.className = 'kraken-egg';
    el.innerHTML = '<div class="kraken-emoji">🐙</div><div class="kraken-text">Le Kraken s\'éveille…</div>';
    document.body.appendChild(el);
    try { Sound.thunder(); } catch (e) {}
    setTimeout(() => el.classList.add('out'), 2300);
    setTimeout(() => el.remove(), 2900);
}

// =====================================================================
//  VOIX DU TAVERNIER + CARTE DE FIN + TEINTE DE VICTOIRE + SQUELETTES
// =====================================================================
const Tavernier = (() => {
    let voice = null;
    function pick() { try { const vs = speechSynthesis.getVoices(); voice = vs.find(v => /fr/i.test(v.lang)) || vs[0] || null; } catch (e) {} }
    try { if (typeof speechSynthesis !== 'undefined') { pick(); speechSynthesis.onvoiceschanged = pick; } } catch (e) {}
    function say(text) {
        try {
            if (!SETTINGS.get('tavernier')) return;
            if (Sound.isMuted && Sound.isMuted()) return;
            if (typeof speechSynthesis === 'undefined') return;
            const u = new SpeechSynthesisUtterance(text);
            u.lang = 'fr-FR'; if (voice) u.voice = voice; u.rate = 0.95; u.pitch = 0.75; u.volume = 0.9;
            speechSynthesis.cancel(); speechSynthesis.speak(u);
        } catch (e) {}
    }
    return { say };
})();

// Couleur dominante du skin équipé (pour teinter la victoire)
function mySkinColor() {
    try { const s = myStyle.skinId && SKINS[myStyle.skinId]; return (s && (s.swatch || s.pip)) || myStyle.bgColor || '#ffd86b'; }
    catch (e) { return '#ffd86b'; }
}

// Carte de fin de partie (classement)
let _lastRecap = null;
socket.on('game_recap', (data) => { _lastRecap = data; });
function showRecapCard() {
    if (!_lastRecap || !_lastRecap.ranking) return;
    closeRecapCard();
    const medal = (r) => r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : `#${r}`;
    const rows = _lastRecap.ranking.map(e =>
        `<div class="recap-row${e.rank === 1 ? ' win' : ''}"><span class="recap-rank">${medal(e.rank)}</span><span class="recap-name">${escapeHtml(e.pseudo)}</span></div>`
    ).join('');
    const ov = document.createElement('div');
    ov.id = 'recap-overlay'; ov.className = 'recap-overlay';
    ov.innerHTML = `<div class="recap-card"><div class="recap-title">📜 Carte de la partie</div><div class="recap-list">${rows}</div><button class="btn-primary recap-close" onclick="closeRecapCard()">Fermer</button></div>`;
    ov.addEventListener('click', (e) => { if (e.target === ov) closeRecapCard(); });
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('show'));
}
function closeRecapCard() { const o = document.getElementById('recap-overlay'); if (o) o.remove(); }

// Squelettes de chargement
function showListSkeletons() {
    const g = document.getElementById('games-list');
    if (g && !g.dataset.loaded) g.innerHTML = Array.from({ length: 2 }).map(() => '<div class="skeleton skel-card"></div>').join('');
    const ul = document.getElementById('players-ul');
    if (ul && !ul.dataset.loaded) ul.innerHTML = Array.from({ length: 3 }).map(() => '<li><div class="skeleton skel-line"></div></li>').join('');
}
try { document.addEventListener('DOMContentLoaded', showListSkeletons); } catch (e) {}

// =====================================================================
//  TUTORIEL INTERACTIF (pas-à-pas, avec Passer) — affiché au 1er passage
// =====================================================================
const TUTORIAL_STEPS = [
    { icon: '⚓', k: 1 }, { icon: '🎲', k: 2 }, { icon: '🗣️', k: 3 }, { icon: '📈', k: 4 }, { icon: '🦜', k: 5 },
    { icon: '🔔', k: 6 }, { icon: '🎯', k: 7 }, { icon: '💀', k: 8 }, { icon: '🏆', k: 9 }, { icon: '🎨', k: 10 }
];
let _tutIndex = 0;
function maybeShowTutorial() {
    let done = false;
    try { done = localStorage.getItem('erquy_tut_done') === '1'; } catch (e) {}
    if (!done) openTutorial();
}
function openTutorial() { _tutIndex = 0; renderTutorial(); }
function closeTutorial(markDone) {
    if (markDone) { try { localStorage.setItem('erquy_tut_done', '1'); } catch (e) {} }
    const o = document.getElementById('tutorial-overlay'); if (o) o.remove();
}
function tutNext() { if (_tutIndex >= TUTORIAL_STEPS.length - 1) { closeTutorial(true); return; } _tutIndex++; renderTutorial(); }
function tutPrev() { if (_tutIndex > 0) { _tutIndex--; renderTutorial(); } }
function renderTutorial() {
    const s = TUTORIAL_STEPS[_tutIndex];
    let o = document.getElementById('tutorial-overlay');
    if (!o) { o = document.createElement('div'); o.id = 'tutorial-overlay'; o.className = 'tutorial-overlay'; document.body.appendChild(o); }
    const dots = TUTORIAL_STEPS.map((_, i) => `<span class="tut-dot${i === _tutIndex ? ' on' : ''}"></span>`).join('');
    const last = _tutIndex === TUTORIAL_STEPS.length - 1;
    o.innerHTML =
        `<div class="tutorial-card">
            <button class="tut-skip" onclick="closeTutorial(true)">${t('tut_skip')} ✕</button>
            <div class="tut-icon">${s.icon}</div>
            <div class="tut-title">${t('tut' + s.k + '_t')}</div>
            <div class="tut-text">${t('tut' + s.k + '_x')}</div>
            <div class="tut-dots">${dots}</div>
            <div class="tut-nav">
                <button class="btn-secondary tut-prev" onclick="tutPrev()" ${_tutIndex === 0 ? 'disabled' : ''}>${t('tut_prev')}</button>
                <button class="btn-primary tut-next" onclick="tutNext()">${last ? t('tut_finish') : t('tut_next')}</button>
            </div>
        </div>`;
    requestAnimationFrame(() => o.classList.add('show'));
}

// =====================================================================
//  PUSH-TO-TALK
// =====================================================================
function setMicLive(live) {
    if (!localStream) return;
    try { localStream.getAudioTracks().forEach(t => { t.enabled = live; }); } catch (e) {}
}
function applyPttMute() {
    // PTT actif → micro coupé par défaut (on parle en maintenant) ; sinon micro ouvert
    setMicLive(!SETTINGS.get('ptt'));
}
function applyPttUI() {
    const btn = document.getElementById('btn-ptt');
    if (!btn) return;
    const on = !!SETTINGS.get('ptt') && !!localStream;
    btn.style.display = on ? 'block' : 'none';
    if (!btn.dataset.wired) {
        btn.dataset.wired = '1';
        const press = (e) => { if (e.cancelable) e.preventDefault(); setMicLive(true); btn.classList.add('ptt-active'); };
        const release = () => { if (SETTINGS.get('ptt')) setMicLive(false); btn.classList.remove('ptt-active'); };
        btn.addEventListener('pointerdown', press);
        btn.addEventListener('pointerup', release);
        btn.addEventListener('pointerleave', release);
        btn.addEventListener('pointercancel', release);
    }
}

// =====================================================================
//  COSMÉTIQUES DE PROFIL : avatars pirate + cadres + bannières
// =====================================================================
const AVATARS = {
    pirate:   { emoji: '🏴‍☠️', bg: '#3a2a1a' },
    crane:    { emoji: '💀', bg: '#2a2a2a' },
    perroquet:{ emoji: '🦜', bg: '#1d5e3a' },
    ancre:    { emoji: '⚓', bg: '#1a3a5a' },
    kraken:   { emoji: '🐙', bg: '#3a1a4a' },
    requin:   { emoji: '🦈', bg: '#1a4a5a' },
    epees:    { emoji: '⚔️', bg: '#4a2a1a' },
    boussole: { emoji: '🧭', bg: '#3a3320' },
    couronne: { emoji: '👑', bg: '#4a3a10' },
    rhum:     { emoji: '🍺', bg: '#5a3a1a' },
    navire:   { emoji: '⛵', bg: '#1a4a4a' },
    tresor:   { emoji: '💰', bg: '#4a3a10' }
};
const FRAMES = {
    '':       { name: 'Simple', ring: '2px solid rgba(255,255,255,0.25)', glow: 'none' },
    or:       { name: 'Or', ring: '3px solid #ffd24a', glow: '0 0 10px rgba(255,210,74,0.6)' },
    argent:   { name: 'Argent', ring: '3px solid #cdd3da', glow: '0 0 10px rgba(205,211,218,0.5)' },
    bronze:   { name: 'Bronze', ring: '3px solid #c87a3c', glow: '0 0 8px rgba(200,122,60,0.5)' },
    os:       { name: 'Os', ring: '3px dashed #ece3cf', glow: 'none' },
    corde:    { name: 'Corde', ring: '4px double #b8895a', glow: 'none' },
    emeraude: { name: 'Émeraude', ring: '3px solid #2fdc8e', glow: '0 0 12px rgba(47,220,142,0.6)' },
    rubis:    { name: 'Rubis', ring: '3px solid #ff4d6a', glow: '0 0 12px rgba(255,77,106,0.6)' },
    royal:    { name: 'Royal', ring: '3px solid #a06bff', glow: '0 0 14px rgba(160,107,255,0.6)' }
};
const BANNERS = {
    '':       { name: 'Bois', bg: 'linear-gradient(120deg,#3a2616,#241710)' },
    ocean:    { name: 'Océan', bg: 'linear-gradient(120deg,#0c3d4e,#0277bd)' },
    coucher:  { name: 'Coucher de soleil', bg: 'linear-gradient(120deg,#ff7e5f,#feb47b)' },
    nuit:     { name: 'Nuit', bg: 'linear-gradient(120deg,#1c2750,#0a0f24)' },
    tempete:  { name: 'Tempête', bg: 'linear-gradient(120deg,#2a2e3a,#0e1018)' },
    jungle:   { name: 'Jungle', bg: 'linear-gradient(120deg,#1e7d42,#0a2a16)' },
    or:       { name: 'Or', bg: 'linear-gradient(120deg,#b8860b,#ffd86b)' },
    sang:     { name: 'Sang', bg: 'linear-gradient(120deg,#6a0c18,#2a0608)' },
    abysse:   { name: 'Abysse', bg: 'radial-gradient(circle at 30% 20%,#0c3d4e,#02121a)' }
};
function avatarHTML(s, size) {
    const f = FRAMES[(s && s.frame) || ''] || FRAMES[''];
    const px = size || 56;
    const img = s && s.avatarImg;
    if (img) {
        return `<span class="avatar-medallion" style="width:${px}px;height:${px}px;background:#000;border:${f.ring};box-shadow:${f.glow};overflow:hidden;"><img class="avatar-img" src="${escapeAttr(img)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;"></span>`;
    }
    const a = AVATARS[(s && s.avatar) || 'pirate'] || AVATARS.pirate;
    return `<span class="avatar-medallion" style="width:${px}px;height:${px}px;background:${a.bg};border:${f.ring};box-shadow:${f.glow};"><span class="avatar-emoji" style="font-size:${Math.round(px * 0.5)}px">${a.emoji}</span></span>`;
}
function bannerBg(s) { return (BANNERS[(s && s.banner) || ''] || BANNERS['']).bg; }

// Met à jour l'avatar dans l'en-tête
function updateHeaderAvatar() {
    const el = document.getElementById('header-avatar');
    if (el) el.innerHTML = avatarHTML(myProfile || {}, 64);
}

// --- Sélecteur de cosmétiques ---
function openCosmetics() {
    closeCosmetics();
    const cur = myProfile || {};
    const tile = (type, id, inner, label, selId) =>
        `<button class="cos-tile ${id === (selId || '') ? 'selected' : ''}" onclick="setCosmetic('${type}','${id}')">${inner}<span class="cos-label">${label}</span></button>`;
    const avatars = Object.entries(AVATARS).map(([id, a]) =>
        tile('avatar', id, `<span class="avatar-medallion" style="width:46px;height:46px;background:${a.bg};border:2px solid rgba(255,255,255,0.25)"><span class="avatar-emoji" style="font-size:22px">${a.emoji}</span></span>`, '', cur.avatar || 'pirate')).join('');
    const frames = Object.entries(FRAMES).map(([id, f]) =>
        tile('frame', id, `<span class="avatar-medallion" style="width:46px;height:46px;background:#2a1c0f;border:${f.ring};box-shadow:${f.glow}"></span>`, f.name, cur.frame || '')).join('');
    const banners = Object.entries(BANNERS).map(([id, b]) =>
        tile('banner', id, `<span class="cos-banner" style="background:${b.bg}"></span>`, b.name, cur.banner || '')).join('');
    const ov = document.createElement('div');
    ov.id = 'cosmetics-overlay'; ov.className = 'recap-overlay';
    const photoBtns = `<button class="btn-secondary cos-photo-btn" onclick="pickAvatarImage()">${t('cos_upload')}</button>` +
        (cur.avatarImg ? `<button class="btn-secondary cos-photo-btn" onclick="removeAvatarImage()">${t('cos_remove')}</button>` : '');
    ov.innerHTML = `<div class="recap-card cos-card">
        <div class="recap-title">${t('cos_my_profile')}</div>
        <div class="cos-preview" id="cos-preview"></div>
        <div class="cos-sec">${t('cos_photo')}</div>
        <div class="cos-photo-row">${photoBtns}</div>
        <input type="file" id="avatar-file-input" accept="image/*" style="display:none" onchange="onAvatarFile(event)">
        <div class="cos-sec">${t('cos_avatar')}</div><div class="cos-grid">${avatars}</div>
        <div class="cos-sec">${t('cos_frame')}</div><div class="cos-grid">${frames}</div>
        <div class="cos-sec">${t('cos_banner')}</div><div class="cos-grid cos-grid-wide">${banners}</div>
        <div class="cos-sec">${t('cos_namecolor')}</div>
        <div class="cos-color-row">
            ${NAME_COLORS.map(c => `<button class="cos-color${(cur.nameColor || '') === c ? ' active' : ''}" style="background:${c}" onclick="setNameColor('${c}')" aria-label="${c}"></button>`).join('')}
            <label class="cos-color cos-color-custom" aria-label="Personnalisée"><input type="color" value="${cur.nameColor || '#d4af37'}" oninput="setNameColor(this.value)">🎨</label>
            <button class="cos-color cos-color-reset${!(cur.nameColor) ? ' active' : ''}" onclick="setNameColor('')" aria-label="${t('cos_default')}">✕</button>
        </div>
        <button class="btn-primary recap-close" onclick="closeCosmetics()">${t('m_close')}</button>
    </div>`;
    ov.addEventListener('click', (e) => { if (e.target === ov) closeCosmetics(); });
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('show'));
    renderCosPreview();
}
function renderCosPreview() {
    const p = document.getElementById('cos-preview');
    if (p) p.innerHTML = `<div class="cos-prev-banner" style="background:${bannerBg(myProfile)}">${avatarHTML(myProfile || {}, 72)}</div>`;
}
function closeCosmetics() { const o = document.getElementById('cosmetics-overlay'); if (o) o.remove(); }
function setCosmetic(type, id) {
    if (!myProfile) myProfile = {};
    myProfile[type] = id;
    const payload = { [type]: id };
    if (type === 'avatar') { myProfile.avatarImg = ''; payload.avatarImg = ''; } // un avatar emoji remplace la photo
    socket.emit('set_cosmetics', payload);
    // maj visuelle immédiate
    if (document.getElementById('cosmetics-overlay')) openCosmetics();
    updateHeaderAvatar();
    if (typeof renderProfile === 'function') { try { renderProfile(); } catch (e) {} }
}

// --- Photo de profil personnalisée ---
// --- Couleur du nom (personnalisation) ---
const NAME_COLORS = ['#d4af37', '#ffffff', '#b388ff', '#8b46c8', '#7c4dff', '#ff5fa2', '#ff5252', '#ff8f3a', '#ffd54f', '#69f0ae', '#26c6da', '#40c4ff', '#5c8bff', '#c0c0c0', '#ff7043'];
function setNameColor(c) {
    if (!myProfile) myProfile = {};
    myProfile.nameColor = c || '';
    socket.emit('set_cosmetics', { nameColor: c || '' });
    updateHeaderAvatar();
    refreshHeaderPseudo();
    if (typeof renderProfile === 'function') { try { renderProfile(); } catch (e) {} }
    if (document.getElementById('cosmetics-overlay')) openCosmetics();
}

function pickAvatarImage() { const i = document.getElementById('avatar-file-input'); if (i) i.click(); }
function onAvatarFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!/^image\//.test(file.type || '')) { try { showToast(t('cos_pick_img')); } catch (x) {} return; }
    const reader = new FileReader();
    reader.onload = () => {
        const im = new Image();
        im.onload = () => {
            const S = 160; // recadrage carré centré + redimension
            const c = document.createElement('canvas'); c.width = S; c.height = S;
            const ctx = c.getContext('2d');
            const m = Math.min(im.width, im.height);
            const sx = (im.width - m) / 2, sy = (im.height - m) / 2;
            ctx.drawImage(im, sx, sy, m, m, 0, 0, S, S);
            let data = c.toDataURL('image/jpeg', 0.82);
            if (data.length > 88000) data = c.toDataURL('image/jpeg', 0.6);
            if (data.length > 88000) { try { showToast(t('cos_too_big')); } catch (x) {} return; }
            if (!myProfile) myProfile = {};
            myProfile.avatarImg = data;
            socket.emit('set_cosmetics', { avatarImg: data });
            updateHeaderAvatar();
            if (typeof renderProfile === 'function') { try { renderProfile(); } catch (x) {} }
            if (document.getElementById('cosmetics-overlay')) openCosmetics();
        };
        im.src = reader.result;
    };
    reader.readAsDataURL(file);
}
function removeAvatarImage() {
    if (!myProfile) myProfile = {};
    myProfile.avatarImg = '';
    socket.emit('set_cosmetics', { avatarImg: '' });
    updateHeaderAvatar();
    if (typeof renderProfile === 'function') { try { renderProfile(); } catch (e) {} }
    if (document.getElementById('cosmetics-overlay')) openCosmetics();
}

// =====================================================================
//  GOBELETS (animations de lancer personnalisées)
// =====================================================================
const CUPS = {
    chute:      { name: 'Chute', icon: '⬇️' },
    tourbillon: { name: 'Tourbillon', icon: '🌀' },
    rebond:     { name: 'Rebond', icon: '🏀' },
    eclair:     { name: 'Éclair', icon: '⚡' },
    pirate:     { name: 'Roulis', icon: '🌊' }
};
let myCup = 'chute';
try { const _c = localStorage.getItem('erquy_cup'); if (_c && CUPS[_c]) myCup = _c; } catch (e) {}
function selectCup(id) {
    if (!CUPS[id]) return;
    myCup = id;
    try { localStorage.setItem('erquy_cup', id); } catch (e) {}
    renderCupGallery();
    // petit aperçu sur les dés du profil de style
    try { playRollAnim('preview-dice-container'); } catch (e) {}
}
function renderCupGallery() {
    const g = document.getElementById('cup-gallery');
    if (!g) return;
    g.innerHTML = Object.entries(CUPS).map(([id, c]) =>
        `<button class="cup-card ${id === myCup ? 'selected' : ''}" onclick="selectCup('${id}')"><span class="cup-icon">${c.icon}</span><span class="cup-name">${c.name}</span></button>`
    ).join('');
}

// =====================================================================
//  VOCAL SPATIALISÉ (panoramique stéréo par interlocuteur)
// =====================================================================
const Spatial = (() => {
    const panners = {};
    function panFor(id) {
        let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
        return ((h % 1000) / 1000) * 1.6 - 0.8; // -0.8 .. +0.8
    }
    function attach(id, stream, audioEl) {
        if (!SETTINGS.get('spatial')) return false;
        const c = Sound.ctx(); if (!c || !c.createStereoPanner) return false;
        try {
            const src = c.createMediaStreamSource(stream);
            const pan = c.createStereoPanner(); pan.pan.value = panFor(id);
            src.connect(pan); pan.connect(c.destination);
            panners[id] = { src, pan };
            if (audioEl) { audioEl.muted = true; audioEl.volume = 0; } // le panner joue le son
            return true;
        } catch (e) { return false; }
    }
    function detach(id) { const p = panners[id]; if (p) { try { p.src.disconnect(); p.pan.disconnect(); } catch (e) {} delete panners[id]; } }
    return { attach, detach };
})();

// =====================================================================
//  DASHBOARD ADMIN (modération)
// =====================================================================
socket.on('force_logout', (msg) => {
    try { alert(msg || 'Déconnecté par un modérateur.'); } catch (e) {}
    setTimeout(() => { try { location.reload(); } catch (e) {} }, 300);
});
function openAdminPanel() { socket.emit('admin_state'); }
socket.on('admin_state', (data) => renderAdminPanel(data || {}));
function renderAdminPanel(data) {
    closeAdminPanel();
    const players = (data.players || []).map(p =>
        `<div class="adm-row"><span class="adm-name">${escapeHtml(p.pseudo)}${p.admin ? ' 🛡️' : ''}</span><span class="adm-actions"><button class="adm-btn" onclick="adminKick('${escapeAttr(p.sid)}')">Expulser</button>${p.admin ? '' : `<button class="adm-btn danger" onclick="adminBan('${escapeAttr(p.pseudo)}')">Bannir</button>`}</span></div>`
    ).join('') || '<p class="list-empty">Personne en ligne.</p>';
    const games = (data.games || []).map(g =>
        `<div class="adm-row"><span class="adm-name">${escapeHtml(g.id)} — ${g.count} j. ${g.started ? '🔴' : '🟢'}</span></div>`
    ).join('') || '<p class="list-empty">Aucune partie.</p>';
    const banned = (data.banned || []).map(b =>
        `<div class="adm-row"><span class="adm-name">${escapeHtml(b)}</span><span class="adm-actions"><button class="adm-btn" onclick="adminUnban('${escapeAttr(b)}')">Débannir</button></span></div>`
    ).join('') || '<p class="list-empty">Aucun banni.</p>';
    const ov = document.createElement('div'); ov.id = 'admin-overlay'; ov.className = 'recap-overlay';
    ov.innerHTML = `<div class="recap-card adm-card">
        <div class="recap-title">Modération</div>
        <div class="cos-sec">Joueurs en ligne (${(data.players || []).length})</div><div class="adm-list">${players}</div>
        <div class="cos-sec">Parties (${(data.games || []).length})</div><div class="adm-list">${games}</div>
        <div class="cos-sec">Bannis</div><div class="adm-list">${banned}</div>
        <div class="cos-sec">Comptes</div>
        <input id="adm-search" class="adm-search" placeholder="Rechercher un pirate..." autocapitalize="off" autocorrect="off" oninput="adminSearch(this.value)">
        <div class="adm-list adm-acc-list" id="adm-accounts"><p class="list-empty">Tape un nom pour rechercher.</p></div>
        <button class="btn-primary recap-close" onclick="closeAdminPanel()">Fermer</button>
    </div>`;
    ov.addEventListener('click', (e) => { if (e.target === ov) closeAdminPanel(); });
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('show'));
}
function closeAdminPanel() { const o = document.getElementById('admin-overlay'); if (o) o.remove(); }

// --- Admin : gestion des comptes ---
let _admSearchT = null;
function adminSearch(q) {
    clearTimeout(_admSearchT);
    _admSearchT = setTimeout(() => socket.emit('admin_list_accounts', q || ''), 250);
}
function _admCurQuery() { const el = document.getElementById('adm-search'); return el ? el.value : ''; }
socket.on('admin_accounts', (data) => renderAdminAccounts((data && data.list) || []));
socket.on('admin_msg', (m) => { try { showToast(m); } catch (e) {} });
function renderAdminAccounts(list) {
    const box = document.getElementById('adm-accounts');
    if (!box) return;
    if (!list.length) { box.innerHTML = '<p class="list-empty">Aucun compte trouvé.</p>'; return; }
    box.innerHTML = list.map(u => `
      <div class="adm-acc">
        <div class="adm-acc-head">
          <span class="adm-name">${escapeHtml(u.pseudo)}${u.admin ? ' 🛡️' : ''}${u.banned ? ' ⛔' : ''}</span>
          <span class="adm-acc-stats">${u.wins}V · ${u.played}P · ${u.rankPoints}pts</span>
        </div>
        <div class="adm-acc-actions">
          <button class="adm-btn" onclick="adminEditAccount('${escapeAttr(u.pseudo)}',${u.wins},${u.played},${u.rankPoints})">Éditer</button>
          <button class="adm-btn" onclick="adminResetStats('${escapeAttr(u.pseudo)}')">Reset</button>
          ${u.admin ? '' : `<button class="adm-btn danger" onclick="adminDeleteAccount('${escapeAttr(u.pseudo)}')">Suppr.</button>`}
        </div>
      </div>`).join('');
}
function adminEditAccount(pseudo, wins, played, pts) {
    const ov = document.createElement('div'); ov.id = 'adm-edit-overlay'; ov.className = 'recap-overlay show'; ov.style.zIndex = '5200';
    ov.innerHTML = `<div class="recap-card adm-edit-card">
        <div class="recap-title">Éditer ${escapeHtml(pseudo)}</div>
        <label class="adm-field">Victoires <input type="number" id="adm-f-wins" value="${wins}" min="0" inputmode="numeric"></label>
        <label class="adm-field">Parties <input type="number" id="adm-f-played" value="${played}" min="0" inputmode="numeric"></label>
        <label class="adm-field">Points de classement <input type="number" id="adm-f-pts" value="${pts}" min="0" inputmode="numeric"></label>
        <button class="btn-primary" style="width:100%;margin-top:6px;" onclick="adminSaveStats('${escapeAttr(pseudo)}')">Enregistrer</button>
        <button class="btn-secondary" style="width:100%;margin-top:8px;" onclick="document.getElementById('adm-edit-overlay').remove()">Annuler</button>
    </div>`;
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
}
function adminSaveStats(pseudo) {
    const gv = (id) => { const el = document.getElementById(id); return el ? Math.max(0, parseInt(el.value, 10) || 0) : 0; };
    socket.emit('admin_edit_stats', { pseudo, wins: gv('adm-f-wins'), played: gv('adm-f-played'), rankPoints: gv('adm-f-pts') });
    const o = document.getElementById('adm-edit-overlay'); if (o) o.remove();
    setTimeout(() => adminSearch(_admCurQuery()), 250);
}
function adminResetStats(pseudo) {
    if (confirm('Réinitialiser toutes les stats de ' + pseudo + ' ?')) { socket.emit('admin_reset_stats', pseudo); setTimeout(() => adminSearch(_admCurQuery()), 250); }
}
function adminDeleteAccount(pseudo) {
    if (confirm('SUPPRIMER définitivement le compte ' + pseudo + ' ?\nCette action est irréversible.')) { socket.emit('admin_delete_account', pseudo); setTimeout(() => adminSearch(_admCurQuery()), 250); }
}
function adminKick(sid) { socket.emit('admin_kick', sid); }
function adminBan(pseudo) { if (confirm('Bannir ' + pseudo + ' définitivement ?')) socket.emit('admin_ban', pseudo); }
function adminUnban(pseudo) { socket.emit('admin_unban', pseudo); }

// =====================================================================
//  INTERNATIONALISATION (FR / EN / ES)
// =====================================================================
const I18N = {
  fr: {
    login_title: "Perudo Online 🏴‍☠️", login_sub: "Identifie-toi avant d'entrer dans la taverne !",
    ph_pseudo: "Ton nom de pirate...", ph_pw: "Ton mot de passe...",
    pw_warn: "⚠️ Ne mets pas un mot de passe que tu utilises déjà ! Mets par exemple \"123\" ou \"mdp\".",
    btn_login: "Se connecter", btn_register: "S'inscrire",
    nav_tables: "Les Tables", nav_campaign: "Campagne", nav_style: "Ton Style", nav_leaderboard: "Le Classement", nav_profile: "Profil",
    lob_tournaments: "Tournois", lob_tables: "Tables en cours", lob_sailors: "Marins présents",
    lob_no_tourn: "Aucun tournoi en cours...", lob_no_table: "Aucune table en cours...", lob_create: "➕ Créer une partie / un tournoi",
    g_total: "Total des dés en jeu :", g_yours: "Tes dés", g_waiting: "En attente du lancement de la partie...",
    g_turn_of: "C'est au tour de", g_true: "VRAI", g_bet: "PARIER", g_liar: "MENTEUR",
    g_spectating: "👁 Tu observes la partie", g_await_bid: "En attente de la mise...",
    m_rules: "Règles & aide", m_invite: "Inviter des amis (lien)", m_table_settings: "Réglages de la table",
    m_anim_sound: "Animations & son", m_leave: "Quitter la table", m_close: "Fermer",
    o_title: "Réglages de la table", o_start_dice: "Dés de départ", o_max_players: "Joueurs max", o_first_player: "Premier joueur",
    o_random: "Aléatoire", o_palifico: "Palifico", o_calza: "Calza", o_autotimer: "Temps limité par tour (action auto si trop long)",
    set_title: "Réglages", set_lang: "Langue",
    set_anim: "Animations", set_anim_d: "Effets visuels et cinématiques", set_intensity: "Intensité", set_full: "Complète", set_low: "Réduite",
    set_bidanim: "Animation des paris", set_always: "Toujours", set_others: "Adversaires", set_never: "Jamais",
    set_sound: "Son", set_sound_d: "Bruitages du jeu", set_music: "Musique d'ambiance", set_music_d: "Nappe sonore de la taverne",
    set_ambiance: "Ambiance", set_taverne: "Taverne", set_mer: "Mer", set_tempete: "Tempête", set_calme: "Calme",
    set_tavernier: "Voix du tavernier", set_tavernier_d: "Annonce Menteur, Calza, Palifico, victoire",
    set_ptt: "Parler en maintenant (push-to-talk)", set_ptt_d: "Micro coupé sauf en maintenant le bouton",
    set_spatial: "Vocal spatialisé", set_spatial_d: "Place chaque voix dans l'espace stéréo",
    set_reduced: "Mouvement réduit", set_reduced_d: "Désactive les grosses animations",
    set_battery: "Économie de batterie", set_battery_d: "Coupe braises, ambiances et animations lourdes",
    set_access: "Accessibilité", set_dicenum: "Chiffres sur les dés", set_dicenum_d: "Affiche la valeur (utile en daltonien)",
    set_contrast: "Contraste élevé", set_contrast_d: "Textes et bordures renforcés",
    set_fontsize: "Taille du texte", set_normal: "Normal", set_big: "Grand", set_xbig: "Très grand",
    rules_title: "Règles &amp; aide", rules_replay: "🧭 Revoir le tutoriel", rules_got_it: "Compris !",
    rules_body: "<h3>But du jeu</h3><p>Chacun cache ses dés. À tour de rôle, on annonce une <b>mise</b> : un nombre de dés montrant une <b>face</b>, en comptant TOUS les dés de la table. Le dernier joueur avec des dés gagne.</p><h3>Monter la mise</h3><p>À ton tour tu dois soit monter la mise, soit contester. Pour monter : <b>même face</b> avec une quantité plus grande, ou <b>une face plus haute</b> à quantité égale (ou plus).</p><h3>Pacos (les 1)</h3><p>Les <b>1</b> sont des jokers : ils comptent comme n'importe quelle face. Passer aux Pacos : <b>moitié</b> de la quantité (arrondi au-dessus). Revenir des Pacos vers une face : <b>le double</b>.</p><h3>Menteur (Dudo)</h3><p>Tu penses que la mise est trop haute ? Annonce <b>Menteur</b>. On compte les dés : si la mise n'y est pas, celui qui a misé perd un dé ; sinon c'est toi qui en perds un.</p><h3>Vrai (Calza)</h3><p>Tu penses que la mise est <b>exactement</b> juste ? Annonce <b>Vrai</b>. Si le compte est pile la mise annoncée, tu es récompensé ; sinon tu perds un dé.</p><h3>Palifico</h3><p>Quand un joueur tombe à <b>1 dé</b>, il déclenche une manche <b>Palifico</b> : les Pacos ne sont plus des jokers, et la première face annoncée est <b>verrouillée</b> pour tout le tour. Chaque joueur n'a son Palifico qu'une fois.</p><h3>Qui commence ?</h3><p>Le premier joueur est <b>tiré au sort</b> à chaque partie. L'hôte peut aussi l'imposer dans <i>Réglages de la table → Premier joueur</i>.</p>",
    tut1_t: "Bienvenue, moussaillon !", tut1_x: "Voici comment écumer le Perudo, le jeu de dés des pirates. Suis le guide… ou passe si tu connais déjà la mer !",
    tut2_t: "Tes dés secrets", tut2_x: "Chaque marin lance 5 dés cachés sous son gobelet. Tu ne vois que les tiens — à toi de deviner ceux des autres.",
    tut3_t: "Annonce une mise", tut3_x: "À ton tour, mise un nombre de dés montrant une face, sur TOUTE la table. Exemple : « quatre fois la face 3 ».",
    tut4_t: "Surenchérir", tut4_x: "Le marin suivant doit miser plus haut : davantage de dés, ou une face plus forte. Sinon, il doute…",
    tut5_t: "Les Pacos (les 1)", tut5_x: "Les 1 sont des jokers : ils comptent pour n'importe quelle face. (Sauf en Palifico !)",
    tut6_t: "Au menteur !", tut6_x: "Tu crois la mise trop haute ? Crie « Menteur ! ». On révèle les dés et on compte. Le perdant perd un dé.",
    tut7_t: "Calza", tut7_x: "Tu penses que le compte est EXACT ? Crie « Calza » : si tu vois juste, tu récupères un dé !",
    tut8_t: "Palifico", tut8_x: "Quand un marin n'a plus qu'un seul dé : manche spéciale. Les Pacos ne sont plus jokers et la face est verrouillée.",
    tut9_t: "La victoire", tut9_x: "Le dernier marin avec des dés remporte la partie. Tiens bon la barre !",
    tut10_t: "Personnalise tout", tut10_x: "Forge tes dés et choisis ton tapis dans « Ton Style », et règle son, voix et animations via ⚙️. Bon vent !",
    tut_skip: "Passer", tut_prev: "Précédent", tut_next: "Suivant", tut_finish: "Terminer 🏴‍☠️"
  },
  en: {
    login_title: "Perudo Online 🏴‍☠️", login_sub: "Log in before entering the tavern!",
    ph_pseudo: "Your pirate name...", ph_pw: "Your password...",
    pw_warn: "⚠️ Don't reuse a password you already use! Try e.g. \"123\" or \"pwd\".",
    btn_login: "Log in", btn_register: "Sign up",
    nav_tables: "Tables", nav_campaign: "Campaign", nav_style: "Your Style", nav_leaderboard: "Leaderboard", nav_profile: "Profile",
    lob_tournaments: "Tournaments", lob_tables: "Live tables", lob_sailors: "Sailors present",
    lob_no_tourn: "No tournament running...", lob_no_table: "No table running...", lob_create: "➕ Create a game / tournament",
    g_total: "Total dice in play:", g_yours: "Your dice", g_waiting: "Waiting for the game to start...",
    g_turn_of: "It's the turn of", g_true: "TRUE", g_bet: "BID", g_liar: "LIAR",
    g_spectating: "👁 You are watching the game", g_await_bid: "Waiting for the bid...",
    m_rules: "Rules & help", m_invite: "Invite friends (link)", m_table_settings: "Table settings",
    m_anim_sound: "Animations & sound", m_leave: "Leave table", m_close: "Close",
    o_title: "Table settings", o_start_dice: "Starting dice", o_max_players: "Max players", o_first_player: "First player",
    o_random: "Random", o_palifico: "Palifico", o_calza: "Calza", o_autotimer: "Time limit per turn (auto action if too long)",
    set_title: "Settings", set_lang: "Language",
    set_anim: "Animations", set_anim_d: "Visual effects and cutscenes", set_intensity: "Intensity", set_full: "Full", set_low: "Reduced",
    set_bidanim: "Bid animation", set_always: "Always", set_others: "Opponents", set_never: "Never",
    set_sound: "Sound", set_sound_d: "Game sound effects", set_music: "Ambient music", set_music_d: "Tavern soundscape",
    set_ambiance: "Ambience", set_taverne: "Tavern", set_mer: "Sea", set_tempete: "Storm", set_calme: "Calm",
    set_tavernier: "Tavern keeper voice", set_tavernier_d: "Announces Liar, Calza, Palifico, victory",
    set_ptt: "Push-to-talk", set_ptt_d: "Mic muted unless holding the button",
    set_spatial: "Spatial voice", set_spatial_d: "Places each voice in stereo space",
    set_reduced: "Reduced motion", set_reduced_d: "Disables big animations",
    set_battery: "Battery saver", set_battery_d: "Cuts embers, ambiences and heavy animations",
    set_access: "Accessibility", set_dicenum: "Numbers on dice", set_dicenum_d: "Shows the value (useful for color blindness)",
    set_contrast: "High contrast", set_contrast_d: "Stronger text and borders",
    set_fontsize: "Text size", set_normal: "Normal", set_big: "Large", set_xbig: "Very large",
    rules_title: "Rules &amp; help", rules_replay: "🧭 Replay the tutorial", rules_got_it: "Got it!",
    rules_body: "<h3>Goal</h3><p>Everyone hides their dice. In turn, you announce a <b>bid</b>: a number of dice showing a <b>face</b>, counting ALL dice on the table. The last player with dice wins.</p><h3>Raising the bid</h3><p>On your turn you must either raise the bid or challenge. To raise: <b>same face</b> with a higher quantity, or <b>a higher face</b> at equal quantity (or more).</p><h3>Pacos (the 1s)</h3><p>The <b>1s</b> are wild: they count as any face. Switching to Pacos: <b>half</b> the quantity (rounded up). Going from Pacos back to a face: <b>double</b>.</p><h3>Liar (Dudo)</h3><p>Think the bid is too high? Call <b>Liar</b>. The dice are counted: if the bid isn't there, the bidder loses a die; otherwise you lose one.</p><h3>True (Calza)</h3><p>Think the bid is <b>exactly</b> right? Call <b>True</b>. If the count is exactly the announced bid, you're rewarded; otherwise you lose a die.</p><h3>Palifico</h3><p>When a player drops to <b>1 die</b>, they trigger a <b>Palifico</b> round: the 1s are no longer wild, and the first announced face is <b>locked</b> for the whole turn. Each player gets their Palifico only once.</p><h3>Who starts?</h3><p>The first player is <b>drawn at random</b> each game. The host can also force it in <i>Table settings → First player</i>.</p>",
    tut1_t: "Welcome aboard, matey!", tut1_x: "Here's how to play Perudo, the pirates' dice game. Follow the guide… or skip if you already know the seas!",
    tut2_t: "Your secret dice", tut2_x: "Each sailor rolls 5 dice hidden under their cup. You only see yours — guess the others!",
    tut3_t: "Make a bid", tut3_x: "On your turn, bid a number of dice showing a face, across the WHOLE table. Example: \"four 3s\".",
    tut4_t: "Raise the bid", tut4_x: "The next sailor must bid higher: more dice, or a higher face. Otherwise, they doubt…",
    tut5_t: "Pacos (the 1s)", tut5_x: "1s are wild: they count as any face. (Except in Palifico!)",
    tut6_t: "Call liar!", tut6_x: "Think the bid is too high? Shout \"Liar!\". Dice are revealed and counted. The loser loses a die.",
    tut7_t: "Calza", tut7_x: "Think the count is EXACT? Shout \"Calza\": if you're right, you get a die back!",
    tut8_t: "Palifico", tut8_x: "When a sailor has only one die left: a special round. 1s are no longer wild and the face is locked.",
    tut9_t: "Victory", tut9_x: "The last sailor with dice wins the game. Hold the helm steady!",
    tut10_t: "Customize everything", tut10_x: "Forge your dice and pick your table in \"Your Style\", and adjust sound, voice and animations via ⚙️. Fair winds!",
    tut_skip: "Skip", tut_prev: "Previous", tut_next: "Next", tut_finish: "Finish 🏴‍☠️"
  },
  es: {
    login_title: "Perudo Online 🏴‍☠️", login_sub: "¡Identifícate antes de entrar en la taberna!",
    ph_pseudo: "Tu nombre de pirata...", ph_pw: "Tu contraseña...",
    pw_warn: "⚠️ ¡No uses una contraseña que ya utilices! Pon por ejemplo \"123\" o \"clave\".",
    btn_login: "Iniciar sesión", btn_register: "Registrarse",
    nav_tables: "Las Mesas", nav_campaign: "Campaña", nav_style: "Tu Estilo", nav_leaderboard: "Clasificación", nav_profile: "Perfil",
    lob_tournaments: "Torneos", lob_tables: "Mesas en curso", lob_sailors: "Marineros presentes",
    lob_no_tourn: "Ningún torneo en curso...", lob_no_table: "Ninguna mesa en curso...", lob_create: "➕ Crear una partida / un torneo",
    g_total: "Total de dados en juego:", g_yours: "Tus dados", g_waiting: "Esperando el inicio de la partida...",
    g_turn_of: "Es el turno de", g_true: "VERDAD", g_bet: "APOSTAR", g_liar: "MENTIROSO",
    g_spectating: "👁 Estás observando la partida", g_await_bid: "Esperando la apuesta...",
    m_rules: "Reglas y ayuda", m_invite: "Invitar amigos (enlace)", m_table_settings: "Ajustes de la mesa",
    m_anim_sound: "Animaciones y sonido", m_leave: "Salir de la mesa", m_close: "Cerrar",
    o_title: "Ajustes de la mesa", o_start_dice: "Dados iniciales", o_max_players: "Jugadores máx.", o_first_player: "Primer jugador",
    o_random: "Aleatorio", o_palifico: "Palifico", o_calza: "Calza", o_autotimer: "Tiempo límite por turno (acción automática si es muy largo)",
    set_title: "Ajustes", set_lang: "Idioma",
    set_anim: "Animaciones", set_anim_d: "Efectos visuales y cinemáticas", set_intensity: "Intensidad", set_full: "Completa", set_low: "Reducida",
    set_bidanim: "Animación de apuestas", set_always: "Siempre", set_others: "Rivales", set_never: "Nunca",
    set_sound: "Sonido", set_sound_d: "Efectos de sonido", set_music: "Música ambiental", set_music_d: "Ambiente de la taberna",
    set_ambiance: "Ambiente", set_taverne: "Taberna", set_mer: "Mar", set_tempete: "Tormenta", set_calme: "Calma",
    set_tavernier: "Voz del tabernero", set_tavernier_d: "Anuncia Mentiroso, Calza, Palifico, victoria",
    set_ptt: "Hablar manteniendo (push-to-talk)", set_ptt_d: "Micro apagado salvo manteniendo el botón",
    set_spatial: "Voz espacial", set_spatial_d: "Coloca cada voz en el espacio estéreo",
    set_reduced: "Movimiento reducido", set_reduced_d: "Desactiva las grandes animaciones",
    set_battery: "Ahorro de batería", set_battery_d: "Corta brasas, ambientes y animaciones pesadas",
    set_access: "Accesibilidad", set_dicenum: "Números en los dados", set_dicenum_d: "Muestra el valor (útil para daltónicos)",
    set_contrast: "Alto contraste", set_contrast_d: "Textos y bordes reforzados",
    set_fontsize: "Tamaño del texto", set_normal: "Normal", set_big: "Grande", set_xbig: "Muy grande",
    rules_title: "Reglas y ayuda", rules_replay: "🧭 Repasar el tutorial", rules_got_it: "¡Entendido!",
    rules_body: "<h3>Objetivo</h3><p>Cada uno esconde sus dados. Por turnos, se anuncia una <b>apuesta</b>: un número de dados con una <b>cara</b>, contando TODOS los dados de la mesa. El último jugador con dados gana.</p><h3>Subir la apuesta</h3><p>En tu turno debes subir la apuesta o dudar. Para subir: <b>misma cara</b> con mayor cantidad, o <b>una cara más alta</b> con igual cantidad (o más).</p><h3>Pacos (los 1)</h3><p>Los <b>1</b> son comodines: cuentan como cualquier cara. Pasar a Pacos: <b>la mitad</b> de la cantidad (redondeando hacia arriba). Volver de Pacos a una cara: <b>el doble</b>.</p><h3>Mentiroso (Dudo)</h3><p>¿Crees que la apuesta es muy alta? Di <b>Mentiroso</b>. Se cuentan los dados: si la apuesta no está, quien apostó pierde un dado; si no, lo pierdes tú.</p><h3>Verdad (Calza)</h3><p>¿Crees que la apuesta es <b>exacta</b>? Di <b>Verdad</b>. Si la cuenta es justo la apuesta anunciada, te recompensan; si no, pierdes un dado.</p><h3>Palifico</h3><p>Cuando un jugador baja a <b>1 dado</b>, desencadena una ronda <b>Palifico</b>: los 1 dejan de ser comodines, y la primera cara anunciada queda <b>fijada</b> todo el turno. Cada jugador solo tiene su Palifico una vez.</p><h3>¿Quién empieza?</h3><p>El primer jugador se <b>sortea</b> en cada partida. El anfitrión también puede imponerlo en <i>Ajustes de la mesa → Primer jugador</i>.</p>",
    tut1_t: "¡Bienvenido, grumete!", tut1_x: "Así se juega al Perudo, el juego de dados de los piratas. ¡Sigue la guía… o salta si ya conoces los mares!",
    tut2_t: "Tus dados secretos", tut2_x: "Cada marinero lanza 5 dados ocultos bajo su cubilete. Solo ves los tuyos: ¡adivina los demás!",
    tut3_t: "Anuncia una apuesta", tut3_x: "En tu turno, apuesta un número de dados con una cara, en TODA la mesa. Ejemplo: «cuatro veces la cara 3».",
    tut4_t: "Subir la apuesta", tut4_x: "El siguiente marinero debe apostar más alto: más dados, o una cara más alta. Si no, duda…",
    tut5_t: "Los Pacos (los 1)", tut5_x: "Los 1 son comodines: cuentan como cualquier cara. (¡Salvo en Palifico!)",
    tut6_t: "¡Mentiroso!", tut6_x: "¿Crees que la apuesta es muy alta? Grita «¡Mentiroso!». Se revelan los dados y se cuentan. El perdedor pierde un dado.",
    tut7_t: "Calza", tut7_x: "¿Crees que la cuenta es EXACTA? Grita «Calza»: si aciertas, ¡recuperas un dado!",
    tut8_t: "Palifico", tut8_x: "Cuando a un marinero le queda un solo dado: ronda especial. Los 1 dejan de ser comodines y la cara queda fijada.",
    tut9_t: "La victoria", tut9_x: "El último marinero con dados gana la partida. ¡Mantén el timón firme!",
    tut10_t: "Personalízalo todo", tut10_x: "Forja tus dados y elige tu tapete en «Tu Estilo», y ajusta sonido, voz y animaciones con ⚙️. ¡Buen viento!",
    tut_skip: "Saltar", tut_prev: "Anterior", tut_next: "Siguiente", tut_finish: "Terminar 🏴‍☠️"
  }
};
let LANG = 'fr';
try { const _l = localStorage.getItem('erquy_lang'); if (_l && I18N[_l]) LANG = _l; else { const n = (navigator.language || 'fr').slice(0, 2); if (I18N[n]) LANG = n; } } catch (e) {}
function t(key, fallback) { return (I18N[LANG] && I18N[LANG][key] != null) ? I18N[LANG][key] : (I18N.fr[key] != null ? I18N.fr[key] : (fallback != null ? fallback : key)); }
function applyI18n(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach(el => { const k = el.getAttribute('data-i18n'); const v = t(k); if (v != null) el.textContent = v; });
    scope.querySelectorAll('[data-i18n-ph]').forEach(el => { const k = el.getAttribute('data-i18n-ph'); el.setAttribute('placeholder', t(k)); });
    scope.querySelectorAll('[data-i18n-html]').forEach(el => { const k = el.getAttribute('data-i18n-html'); el.innerHTML = t(k); });
}
function setLang(l) {
    if (!I18N[l]) return;
    LANG = l;
    try { localStorage.setItem('erquy_lang', l); } catch (e) {}
    applyI18n();
    try { if (typeof renderSettings === 'function' && document.getElementById('settings-modal') && document.getElementById('settings-modal').style.display === 'flex') renderSettings(); } catch (e) {}
    try { if (typeof renderProfile === 'function') renderProfile(); } catch (e) {}
    try { if (document.getElementById('tutorial-overlay')) renderTutorial(); } catch (e) {}
}
try { document.addEventListener('DOMContentLoaded', () => applyI18n()); if (document.readyState !== 'loading') applyI18n(); } catch (e) {}

// --- i18n : profil (statsCardHTML) + divers ---
Object.assign(I18N.fr, {
  prof_unranked: "Hors classement", prof_vs_ai: "vs IA", prof_streak: "victoires d'affilée", prof_onfire: "en feu !",
  prof_overview: "Bilan", prof_wins: "Victoires", prof_games: "Parties", prof_winrate: "Taux de victoire", prof_seconds: "2e places",
  prof_byformat: "Par format", prof_multi: "Multi (3+)", prof_playstyle: "Style de jeu",
  prof_dudos: "Dudos réussis", prof_calzas: "Calzas réussis", prof_dicelost: "Dés perdus", prof_beststreak: "Meilleure série",
  prof_advanced: "Stats avancées", prof_bluff: "Bluff réussi", prof_challwon: "Défis gagnés", prof_elims: "Éliminations",
  prof_lucky: "Dé porte-bonheur", prof_favface: "Face préférée", prof_nemesis: "Ennemi juré", prof_beaten: "battu",
  prof_rankpts: "pts de classement", prof_w: "V", prof_p: "P", prof_2nd: "2e"
});
Object.assign(I18N.en, {
  prof_unranked: "Unranked", prof_vs_ai: "vs AI", prof_streak: "wins in a row", prof_onfire: "on fire!",
  prof_overview: "Overview", prof_wins: "Wins", prof_games: "Games", prof_winrate: "Win rate", prof_seconds: "2nd places",
  prof_byformat: "By format", prof_multi: "Multi (3+)", prof_playstyle: "Play style",
  prof_dudos: "Dudos won", prof_calzas: "Calzas won", prof_dicelost: "Dice lost", prof_beststreak: "Best streak",
  prof_advanced: "Advanced stats", prof_bluff: "Bluff success", prof_challwon: "Challenges won", prof_elims: "Eliminations",
  prof_lucky: "Lucky die", prof_favface: "Favorite face", prof_nemesis: "Nemesis", prof_beaten: "beaten",
  prof_rankpts: "ranking pts", prof_w: "W", prof_p: "G", prof_2nd: "2nd"
});
Object.assign(I18N.es, {
  prof_unranked: "Fuera de clasificación", prof_vs_ai: "vs IA", prof_streak: "victorias seguidas", prof_onfire: "¡en racha!",
  prof_overview: "Balance", prof_wins: "Victorias", prof_games: "Partidas", prof_winrate: "Tasa de victoria", prof_seconds: "2º puestos",
  prof_byformat: "Por formato", prof_multi: "Multi (3+)", prof_playstyle: "Estilo de juego",
  prof_dudos: "Dudos ganados", prof_calzas: "Calzas ganados", prof_dicelost: "Dados perdidos", prof_beststreak: "Mejor racha",
  prof_advanced: "Estadísticas avanzadas", prof_bluff: "Farol logrado", prof_challwon: "Desafíos ganados", prof_elims: "Eliminaciones",
  prof_lucky: "Dado de la suerte", prof_favface: "Cara favorita", prof_nemesis: "Némesis", prof_beaten: "vencido",
  prof_rankpts: "pts de clasificación", prof_w: "V", prof_p: "P", prof_2nd: "2º"
});

// --- i18n : quêtes + boutons profil ---
Object.assign(I18N.fr, {
  quests_title: "Quêtes", q_veteran: "Vétéran des mers", q_conqueror: "Conquérant", q_executioner: "Bourreau des flots",
  q_calza_master: "Maître du Calza", q_sleuth: "Fin limier", q_unkillable: "Increvable",
  prof_customize: "🎨 Personnaliser mon profil", prof_modpanel: "🛡️ Panneau de modération"
});
Object.assign(I18N.en, {
  quests_title: "Quests", q_veteran: "Sea veteran", q_conqueror: "Conqueror", q_executioner: "Scourge of the waves",
  q_calza_master: "Calza master", q_sleuth: "Sharp sleuth", q_unkillable: "Unkillable",
  prof_customize: "🎨 Customize my profile", prof_modpanel: "🛡️ Moderation panel"
});
Object.assign(I18N.es, {
  quests_title: "Misiones", q_veteran: "Veterano de los mares", q_conqueror: "Conquistador", q_executioner: "Azote de las olas",
  q_calza_master: "Maestro del Calza", q_sleuth: "Buen sabueso", q_unkillable: "Indestructible",
  prof_customize: "🎨 Personalizar mi perfil", prof_modpanel: "🛡️ Panel de moderación"
});

// --- i18n : messages de partie ---
Object.assign(I18N.fr, {
  log_bid: "🗣️ <b>{name}</b> annonce {qty} x Face {face}",
  log_calza_call: "🎯 <b>{name}</b> crie CALZA (compte exact) !",
  log_dudo_call: "🔔 <b>{caller}</b> CRIE AU MENTEUR contre <b>{bidder}</b> !",
  log_total: "Il y avait un total de <b>{n}</b> dés sur la table.",
  log_res_calza_ok: "✅ CALZA PARFAIT ! <b>{name}</b> regagne 1 dé.",
  log_res_calza_ko: "❌ Calza raté ! <b>{name}</b> perd 1 dé.",
  log_res_davy: "🛡️ Cœur de Davy Jones : <b>{name}</b> ne perd aucun dé !",
  log_res_bid_good: "✅ L'enchère était bonne ! <b>{name}</b> perd 1 dé.",
  log_res_bluff: "🤥 Le bluff est démasqué ! <b>{name}</b> perd 1 dé.",
  log_win_solo: "🏆 <b>{names}</b> EST LE GRAND GAGNANT ! 🏴‍☠️",
  log_win_team: "🏆 L'équipe <b>{names}</b> REMPORTE ! 🏴‍☠️",
  log_win_multi: "🏆 <b>{names}</b> REMPORTE ! 🏴‍☠️",
  tav_liar: "Menteur démasqué !", tav_calza: "Calza ! Compte exact !"
});
Object.assign(I18N.en, {
  log_bid: "🗣️ <b>{name}</b> bids {qty} x Face {face}",
  log_calza_call: "🎯 <b>{name}</b> calls CALZA (exact count)!",
  log_dudo_call: "🔔 <b>{caller}</b> calls LIAR on <b>{bidder}</b>!",
  log_total: "There were a total of <b>{n}</b> dice on the table.",
  log_res_calza_ok: "✅ PERFECT CALZA! <b>{name}</b> regains 1 die.",
  log_res_calza_ko: "❌ Calza failed! <b>{name}</b> loses 1 die.",
  log_res_davy: "🛡️ Davy Jones' Heart: <b>{name}</b> loses no die!",
  log_res_bid_good: "✅ The bid was right! <b>{name}</b> loses 1 die.",
  log_res_bluff: "🤥 The bluff is exposed! <b>{name}</b> loses 1 die.",
  log_win_solo: "🏆 <b>{names}</b> IS THE GRAND WINNER! 🏴‍☠️",
  log_win_team: "🏆 Team <b>{names}</b> WINS! 🏴‍☠️",
  log_win_multi: "🏆 <b>{names}</b> WIN! 🏴‍☠️",
  tav_liar: "Liar exposed!", tav_calza: "Calza! Exact count!"
});
Object.assign(I18N.es, {
  log_bid: "🗣️ <b>{name}</b> anuncia {qty} x Cara {face}",
  log_calza_call: "🎯 <b>{name}</b> grita CALZA (cuenta exacta)!",
  log_dudo_call: "🔔 <b>{caller}</b> grita MENTIROSO contra <b>{bidder}</b>!",
  log_total: "Había un total de <b>{n}</b> dados en la mesa.",
  log_res_calza_ok: "✅ ¡CALZA PERFECTO! <b>{name}</b> recupera 1 dado.",
  log_res_calza_ko: "❌ ¡Calza fallido! <b>{name}</b> pierde 1 dado.",
  log_res_davy: "🛡️ Corazón de Davy Jones: ¡<b>{name}</b> no pierde ningún dado!",
  log_res_bid_good: "✅ ¡La apuesta era correcta! <b>{name}</b> pierde 1 dado.",
  log_res_bluff: "🤥 ¡El farol queda al descubierto! <b>{name}</b> pierde 1 dado.",
  log_win_solo: "🏆 ¡<b>{names}</b> ES EL GRAN GANADOR! 🏴‍☠️",
  log_win_team: "🏆 ¡El equipo <b>{names}</b> GANA! 🏴‍☠️",
  log_win_multi: "🏆 ¡<b>{names}</b> GANAN! 🏴‍☠️",
  tav_liar: "¡Mentiroso al descubierto!", tav_calza: "¡Calza! ¡Cuenta exacta!"
});

// --- i18n : bandeau central de résultat ---
Object.assign(I18N.fr, {
  res_calza_ok: "✅ Calza parfait - <b>{name} regagne 1 dé</b>",
  res_calza_ko: "❌ Calza raté - <b>{name} perd 1 dé</b>",
  res_davy: "🛡️ <b>{name}</b> ne perd aucun dé (relique)",
  res_bid_good: "✅ L'enchère était bonne - <b>{name} perd 1 dé</b>",
  res_bluff: "❌ Bluff démasqué - <b>{name} perd 1 dé</b>"
});
Object.assign(I18N.en, {
  res_calza_ok: "✅ Perfect Calza - <b>{name} regains 1 die</b>",
  res_calza_ko: "❌ Calza failed - <b>{name} loses 1 die</b>",
  res_davy: "🛡️ <b>{name}</b> loses no die (relic)",
  res_bid_good: "✅ The bid was right - <b>{name} loses 1 die</b>",
  res_bluff: "❌ Bluff exposed - <b>{name} loses 1 die</b>"
});
Object.assign(I18N.es, {
  res_calza_ok: "✅ Calza perfecto - <b>{name} recupera 1 dado</b>",
  res_calza_ko: "❌ Calza fallido - <b>{name} pierde 1 dado</b>",
  res_davy: "🛡️ <b>{name}</b> no pierde ningún dado (reliquia)",
  res_bid_good: "✅ La apuesta era correcta - <b>{name} pierde 1 dado</b>",
  res_bluff: "❌ Farol al descubierto - <b>{name} pierde 1 dado</b>"
});

// --- i18n : classement ---
Object.assign(I18N.fr, {
  lb_title: "Les Légendes des Caraïbes", lb_all: "Général", lb_week: "Semaine", lb_month: "Mois",
  lb_h_rank: "Rang", lb_h_pirate: "Pirate", lb_h_pts: "Points", lb_h_w: "V", lb_h_games: "Parties", lb_h_rate: "Taux",
  lb_hint: "Touche un pirate pour voir le détail de son palmarès.",
  lb_this_week: "cette semaine", lb_this_month: "ce mois",
  lb_empty: "Aucun point marqué {period}…<br>Gagne une partie pour entrer au classement !", lb_you: "(toi)"
});
Object.assign(I18N.en, {
  lb_title: "Legends of the Caribbean", lb_all: "Overall", lb_week: "Week", lb_month: "Month",
  lb_h_rank: "Rank", lb_h_pirate: "Pirate", lb_h_pts: "Points", lb_h_w: "W", lb_h_games: "Games", lb_h_rate: "Rate",
  lb_hint: "Tap a pirate to see their full record.",
  lb_this_week: "this week", lb_this_month: "this month",
  lb_empty: "No points scored {period}…<br>Win a game to enter the ranking!", lb_you: "(you)"
});
Object.assign(I18N.es, {
  lb_title: "Las Leyendas del Caribe", lb_all: "General", lb_week: "Semana", lb_month: "Mes",
  lb_h_rank: "Rango", lb_h_pirate: "Pirata", lb_h_pts: "Puntos", lb_h_w: "V", lb_h_games: "Partidas", lb_h_rate: "Tasa",
  lb_hint: "Toca a un pirata para ver su palmarés completo.",
  lb_this_week: "esta semana", lb_this_month: "este mes",
  lb_empty: "Ningún punto marcado {period}…<br>¡Gana una partida para entrar en la clasificación!", lb_you: "(tú)"
});

// --- i18n : cosmétiques / photo de profil ---
Object.assign(I18N.fr, {
  cos_my_profile: "Mon profil", cos_photo: "Photo perso", cos_upload: "Importer une image", cos_remove: "Retirer la photo",
  cos_avatar: "Avatar", cos_frame: "Cadre", cos_banner: "Bannière", cos_namecolor: "Couleur du nom", cos_default: "Défaut",
  cos_pick_img: "Choisis une image valide.", cos_too_big: "Image trop lourde, essaie-en une autre."
});
Object.assign(I18N.en, {
  cos_my_profile: "My profile", cos_photo: "Custom photo", cos_upload: "Upload an image", cos_remove: "Remove photo",
  cos_avatar: "Avatar", cos_frame: "Frame", cos_banner: "Banner", cos_namecolor: "Name color", cos_default: "Default",
  cos_pick_img: "Pick a valid image.", cos_too_big: "Image too heavy, try another one."
});
Object.assign(I18N.es, {
  cos_my_profile: "Mi perfil", cos_photo: "Foto personal", cos_upload: "Subir una imagen", cos_remove: "Quitar la foto",
  cos_avatar: "Avatar", cos_frame: "Marco", cos_banner: "Estandarte", cos_namecolor: "Color del nombre", cos_default: "Predeterminado",
  cos_pick_img: "Elige una imagen válida.", cos_too_big: "Imagen demasiado pesada, prueba otra."
});

// --- i18n : historique de la manche ---
Object.assign(I18N.fr, { emote_title: "Émotes", bh_title: "Historique de la manche", bh_last_round: "Dernière manche", bh_empty: "Aucune enchère pour cette manche.", bh_face: "face", bh_dice: "dés" });
Object.assign(I18N.en, { emote_title: "Emotes", bh_title: "Round history", bh_last_round: "Last round", bh_empty: "No bids this round.", bh_face: "face", bh_dice: "dice" });
Object.assign(I18N.es, { emote_title: "Emotes", bh_title: "Historial de la ronda", bh_last_round: "Última ronda", bh_empty: "Ninguna apuesta en esta ronda.", bh_face: "cara", bh_dice: "dados" });