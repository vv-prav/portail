const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Arrivée depuis le catalogue de /jouer/ : on ouvre directement l'écran de
// création du jeu, sans réimplémenter ses réglages ailleurs. Le paramètre est
// retiré de l'URL pour qu'un rechargement ne recrée pas une table.
function creationDemandee() {
    try { return new URLSearchParams(location.search).get('creer') === '1'; } catch (e) { return false; }
}
function ouvrirCreationSiDemandee() {
    if (!creationDemandee()) return;
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
    const b = document.getElementById('btn-create');
    if (b) b.click();
}

function toast(msg) { DS.toast(msg); }

// Une couleur par joueur, pour se repérer d'un coup d'œil entre le score en
// haut et ses cases remplies dans la feuille.
// =====================================================================
//  STYLES DE DÉS — catalogue repris de Perudo (mêmes couleurs et dégradés),
//  avec des seuils de déblocage adaptés aux statistiques du Yams plutôt qu'à
//  la campagne de Perudo qui n'existe pas ici.
// =====================================================================
const DICE_SKINS = {
    classic: { name:'Classique', bg:'#ffffff', pip:'#000000', winsRequired:0 },
    dragon: { name:'Feu & Dragon', bg:'radial-gradient(circle at 32% 26%,#ff9344,#c8230d 68%,#6e0d05)', pip:'#ffe7b3', glow:'0 0 12px rgba(255,90,20,0.65)', winsRequired:0 },
    pirate: { name:'Trésor Pirate', bg:'linear-gradient(135deg,#dcc48d,#b08947)', pip:'#3a2a16', border:'2px solid #6e4a22', winsRequired:0 },
    paco: { name:'Dé Paco', bg:'linear-gradient(135deg,#eaf6ff,#b6dffb)', pip:'#0a6cae', winsRequired:0 },
    emeraude: { name:'Émeraude', bg:'radial-gradient(circle at 30% 25%,#6ff3b3,#0f9d58 68%,#075c33)', pip:'#eafff3', glow:'0 0 12px rgba(40,220,140,0.55)', winsRequired:0 },
    poney: { name:'Cheval', bg:'linear-gradient(135deg,#ffd1ec,#cdb4ff 50%,#b4e7ff)', pip:'#7b3fb0', border:'2px solid #ff9ad5', winsRequired:0 },
    elephant: { name:'Éléphant', bg:'linear-gradient(145deg,#c2ced9,#8c9aa6)', pip:'#2f3e4a', winsRequired:0 },
    chat: { name:'Chat', bg:'linear-gradient(145deg,#3a3a4a,#1f1f2b)', pip:'#f2e9d8', winsRequired:0 },
    forge: { name:'Forge Naine', bg:'linear-gradient(145deg,#5c5249,#2c2622)', pip:'#e3a948', border:'2px solid #8a6d3b', winsRequired:5 },
    gold: { name:'Or Royal', bg:'linear-gradient(135deg,#fff4b0,#e9bd1f 45%,#9a7d00)', pip:'#5a4500', border:'2px solid #fff0a0', glow:'0 0 14px rgba(255,210,60,0.8)', winsRequired:10 },
    obsidienne: { name:'Obsidienne', bg:'linear-gradient(145deg,#26263a,#0f0f1a)', pip:'#b39ddb', border:'1px solid #4a4a6a', glow:'0 0 8px rgba(179,157,219,0.45)', winsRequired:0 },
    rubis: { name:'Rubis', bg:'radial-gradient(circle at 30% 28%,#ff7b7b,#c1121f 70%,#7a0a13)', pip:'#fff0f0', border:'1px solid #ff9aa2', glow:'0 0 9px rgba(255,40,40,0.5)', winsRequired:0 },
    saphir: { name:'Saphir', bg:'radial-gradient(circle at 30% 28%,#6db3ff,#1e3a8a 72%,#0c1f52)', pip:'#eaf4ff', border:'1px solid #90caf9', glow:'0 0 9px rgba(60,140,255,0.5)', winsRequired:0 },
    arcenciel: { name:'Arc-en-ciel', bg:'linear-gradient(135deg,#ff5f6d,#ffc371 30%,#47e891 55%,#4895ef 78%,#9b5de5)', pip:'#1a1a2e', border:'1px solid rgba(255,255,255,0.6)', glow:'0 0 10px rgba(255,255,255,0.45)', winsRequired:0 },
    cthulhu: { name:'Cthulhu', bg:'#2f3640', pip:'#ffd700', yamsRequired:5 },
    corsaire: { name:'Corsaire', bg:'radial-gradient(circle at 36% 30%,#3b6fb5,#16335e 65%,#0a1c38)', pip:'#e8f1ff', border:'1px solid #6f9fd8', glow:'0 0 12px rgba(90,150,230,0.55)', yamsRequired:5 },
    abysse: { name:'Abysse', bg:'radial-gradient(circle at 36% 30%,#1aa3a3,#063b3b 60%,#021a1a)', pip:'#9bfff2', border:'1px solid #1f7d7d', glow:'0 0 14px rgba(40,220,210,0.5)', yamsRequired:10 },
    kraken: { name:'Kraken', bg:'radial-gradient(circle at 36% 30%,#7b3bd6,#2a1146 62%,#120821)', pip:'#f2c8ff', border:'1px solid #9a5bd8', glow:'0 0 16px rgba(170,80,230,0.6)', yamsRequired:15 },
    brume: { name:'Brume', bg:'radial-gradient(circle at 36% 30%,#9fb0c0,#6b7b8c 60%,#3a4654)', pip:'#1c2530', border:'1px solid #b9c8d6', glow:'0 0 12px rgba(180,200,220,0.5)', yamsRequired:9 },
    sang: { name:'Sang', bg:'radial-gradient(circle at 36% 30%,#b5202a,#5e0d12 62%,#2a0608)', pip:'#ffd9d0', border:'1px solid #d8585b', glow:'0 0 14px rgba(220,60,60,0.55)', yamsRequired:12 },
    tresor: { name:'Trésor', bg:'radial-gradient(circle at 36% 30%,#ffe9a8,#d4af37 45%,#1a1206 88%)', pip:'#3a2a06', border:'1px solid #ffe9a8', glow:'0 0 18px rgba(255,210,90,0.7)', yamsRequired:25 },
    couronne: { name:'Couronne', bg:'radial-gradient(circle at 36% 30%,#ffe9a8,#b8860b 42%,#3a1d5e 90%)', pip:'#fff7d6', border:'1px solid #ffe9a8', glow:'0 0 18px rgba(255,210,90,0.7)', yamsRequired:15 },
    galaxie: { name:'Galaxie', bg:'radial-gradient(circle at 30% 25%,#7b5bff,#2a1a6e 55%,#070318)', pip:'#e7deff', border:'1px solid #9a7bff', glow:'0 0 14px rgba(140,90,255,0.65)', winsRequired:0 },
    nebuleuse: { name:'Nébuleuse', bg:'radial-gradient(circle at 35% 30%,#ff7ad9,#7a2bd6 45%,#1a1140 88%)', pip:'#ffe6fb', glow:'0 0 14px rgba(220,100,230,0.6)', winsRequired:0 },
    neon: { name:'Néon Vert', bg:'linear-gradient(145deg,#0c1f14,#03100a)', pip:'#39ff9e', border:'2px solid #39ff9e', glow:'0 0 14px rgba(57,255,158,0.75)', winsRequired:0 },
    neonrose: { name:'Néon Rose', bg:'linear-gradient(145deg,#1f0c1a,#100310)', pip:'#ff4fd8', border:'2px solid #ff4fd8', glow:'0 0 14px rgba(255,79,216,0.75)', winsRequired:0 },
    lave: { name:'Lave', bg:'radial-gradient(circle at 32% 28%,#ff8a3c,#c01806 55%,#1a0502)', pip:'#ffe2b0', border:'1px solid #ff7a3c', glow:'0 0 14px rgba(255,80,20,0.7)', winsRequired:0 },
    glace: { name:'Glace', bg:'linear-gradient(150deg,#e6fbff,#8fd6f0 50%,#3a86b5)', pip:'#0a3a52', border:'1px solid #d6f6ff', glow:'0 0 12px rgba(150,220,255,0.6)', winsRequired:0 },
    toxique: { name:'Toxique', bg:'radial-gradient(circle at 32% 28%,#b6ff3a,#4a8a00 60%,#15280a)', pip:'#0c2a00', border:'1px solid #c8ff5a', glow:'0 0 14px rgba(150,255,40,0.6)', winsRequired:0 },
    holo: { name:'Holographique', bg:'linear-gradient(120deg,#ff5f9e,#ffd36b 28%,#5effd6 52%,#5e9bff 74%,#c46bff)', pip:'#1a1030', border:'1px solid rgba(255,255,255,0.7)', glow:'0 0 12px rgba(255,255,255,0.5)', winsRequired:0 },
    vampire: { name:'Vampire', bg:'radial-gradient(circle at 34% 28%,#8a1020,#3a0610 60%,#0a0204)', pip:'#ff5a6a', border:'1px solid #c01828', glow:'0 0 12px rgba(220,30,50,0.6)', winsRequired:0 },
    foret: { name:'Forêt', bg:'linear-gradient(150deg,#3aa35a,#165e2e 60%,#0a2a16)', pip:'#eafff0', glow:'0 0 10px rgba(60,200,110,0.45)', winsRequired:0 },
    ocean: { name:'Océan', bg:'radial-gradient(circle at 32% 28%,#4fc3f7,#0277bd 60%,#01314f)', pip:'#eaffff', glow:'0 0 12px rgba(60,180,255,0.55)', winsRequired:0 },
    lune: { name:'Lune', bg:'radial-gradient(circle at 34% 28%,#3a4a78,#161d3a 62%,#070a18)', pip:'#dfe6ff', border:'1px solid #5a6aa8', glow:'0 0 12px rgba(120,140,255,0.5)', winsRequired:0 },
    foudre: { name:'Foudre', bg:'linear-gradient(150deg,#2a2e3a,#0e1018)', pip:'#ffe14a', border:'1px solid #5a5e6a', glow:'0 0 14px rgba(255,220,60,0.6)', winsRequired:0 },
    desert: { name:'Désert', bg:'linear-gradient(150deg,#ffe8a8,#e0a857 55%,#a9762c)', pip:'#5a3a10', border:'1px solid #fff0c4', winsRequired:0 },
    bois: { name:'Bois', bg:'repeating-linear-gradient(115deg,#7a4a22,#7a4a22 6px,#6e421e 6px,#6e421e 12px)', pip:'#ffe1b0', border:'2px solid #4a2c12', winsRequired:0 },
    marbre: { name:'Marbre', bg:'linear-gradient(135deg,#f6f6f2,#d8dadf 50%,#b8bcc6)', pip:'#2a2e38', border:'1px solid #9aa0ac', winsRequired:0 },
    amethyste: { name:'Améthyste', bg:'radial-gradient(circle at 32% 26%,#c98bff,#7a32c8 60%,#2e0f56)', pip:'#f3e6ff', border:'1px solid #d4a8ff', glow:'0 0 12px rgba(180,100,255,0.55)', winsRequired:0 },
    cuivre: { name:'Cuivre', bg:'linear-gradient(135deg,#ffcaa0,#c87a3c 45%,#7a3f18)', pip:'#3a1d08', border:'1px solid #ffd2a8', glow:'0 0 10px rgba(220,130,60,0.45)', winsRequired:0 },
    jade: { name:'Jade', bg:'radial-gradient(circle at 32% 28%,#7bf0c0,#1aa37a 60%,#0a4a36)', pip:'#eafff5', border:'1px solid #a8ffe0', glow:'0 0 12px rgba(40,220,170,0.5)', winsRequired:0 },
    corail: { name:'Corail', bg:'radial-gradient(circle at 32% 28%,#ff9a8c,#e0524a 60%,#7a1f1f)', pip:'#fff0ec', glow:'0 0 11px rgba(255,110,90,0.5)', winsRequired:0 },
    sakura: { name:'Sakura', bg:'linear-gradient(150deg,#ffe3f1,#ffb3d9 55%,#f06aa8)', pip:'#7a1f4e', border:'1px solid #ffd6ea', winsRequired:0 },
    aurore: { name:'Aurore', bg:'linear-gradient(150deg,#1a2a4a,#1aa37a 45%,#7a3bd6 80%)', pip:'#eafff7', border:'1px solid rgba(180,255,230,0.6)', glow:'0 0 14px rgba(80,220,180,0.5)', winsRequired:0 },
    onyx: { name:'Onyx', bg:'radial-gradient(circle at 34% 28%,#3a3a44,#15151c 65%,#050507)', pip:'#cfd2da', border:'1px solid #4a4a58', glow:'0 0 8px rgba(180,190,210,0.35)', winsRequired:0 },
    rosegold: { name:'Or Rose', bg:'linear-gradient(135deg,#ffe3e0,#e8a8a0 45%,#b87a72)', pip:'#5a2a26', border:'1px solid #ffe3e0', glow:'0 0 10px rgba(230,160,150,0.5)', winsRequired:0 },
    royal: { name:'Royal', bg:'radial-gradient(circle at 34% 28%,#6a4bd6,#2a1a6e 60%,#120833)', pip:'#ffe9a8', border:'1px solid #ffe9a8', glow:'0 0 13px rgba(160,110,255,0.55)', winsRequired:0 },
};
let myYamsWins = 0, myYamsCount = 0;
function ownsDiceSkin(id) {
    const s = DICE_SKINS[id];
    if (!s) return false;
    if (typeof s.winsRequired === 'number') return myYamsWins >= s.winsRequired;
    if (typeof s.yamsRequired === 'number') return myYamsCount >= s.yamsRequired;
    return true;
}
const SKIN_KEY = 'yams_dice_skin';
let currentSkin = localStorage.getItem(SKIN_KEY) || 'classic';

const PLAYER_COLORS = ['#9b6fc7', '#5aa8d9', '#3fb6ae', '#d9689b'];
function playerColor(index) { return PLAYER_COLORS[index % PLAYER_COLORS.length]; }

const UPPER_CATS = [
    { key: 'uns', label: 'As', face: 1 },
    { key: 'deux', label: 'Deux', face: 2 },
    { key: 'trois', label: 'Trois', face: 3 },
    { key: 'quatre', label: 'Quatre', face: 4 },
    { key: 'cinq', label: 'Cinq', face: 5 },
    { key: 'six', label: 'Six', face: 6 },
];
const LOWER_CATS = [
    { key: 'brelan', label: 'Brelan' },
    { key: 'carre', label: 'Carré' },
    { key: 'full', label: 'Full' },
    { key: 'petiteSuite', label: 'Petite suite' },
    { key: 'grandeSuite', label: 'Grande suite' },
    { key: 'yams', label: 'Yams' },
    { key: 'chance', label: 'Chance' },
];
const UPPER_KEYS = UPPER_CATS.map(c => c.key);

// Une petite icône dessinée par combinaison, plus parlante que des dés répétés.
const CAT_ICONS = {
    brelan: '<circle cx="30" cy="50" r="11"/><circle cx="50" cy="35" r="11"/><circle cx="70" cy="50" r="11"/>',
    carre: '<rect x="18" y="18" width="28" height="28" rx="6"/><rect x="54" y="18" width="28" height="28" rx="6"/><rect x="18" y="54" width="28" height="28" rx="6"/><rect x="54" y="54" width="28" height="28" rx="6"/>',
    full: '<path d="M15,70 L20,35 L37,52 L50,20 L63,52 L80,35 L85,70 Z"/><circle cx="20" cy="30" r="6"/><circle cx="50" cy="15" r="6"/><circle cx="80" cy="30" r="6"/>',
    petiteSuite: '<rect x="12" y="62" width="18" height="18"/><rect x="34" y="46" width="18" height="34"/><rect x="56" y="30" width="18" height="50"/>',
    grandeSuite: '<rect x="8" y="68" width="16" height="14"/><rect x="26" y="54" width="16" height="28"/><rect x="44" y="40" width="16" height="42"/><rect x="62" y="26" width="16" height="56"/><rect x="80" y="12" width="12" height="70"/>',
    yams: '<path d="M50,10 L61,38 L91,38 L67,56 L76,86 L50,68 L24,86 L33,56 L9,38 L39,38 Z"/>',
    chance: '<circle cx="50" cy="50" r="38"/><circle cx="35" cy="38" r="6" fill="var(--parchment)"/><circle cx="65" cy="38" r="6" fill="var(--parchment)"/><circle cx="50" cy="65" r="6" fill="var(--parchment)"/>',
};
function catIconSvg(key) {
    return `<svg viewBox="0 0 100 100" class="ym-cat-icon">${CAT_ICONS[key] || ''}</svg>`;
}

// Un petit dé SVG avec les points au bon endroit, réutilisé partout.
const PIP_LAYOUTS = {
    1: [[50, 50]],
    2: [[28, 28], [72, 72]],
    3: [[28, 28], [50, 50], [72, 72]],
    4: [[28, 28], [72, 28], [28, 72], [72, 72]],
    5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
    6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]],
};
function diceFaceSvg(n, extraClass, applySkin) {
    const pips = PIP_LAYOUTS[n] || [];
    const skin = applySkin ? (DICE_SKINS[currentSkin] || DICE_SKINS.classic) : null;
    const style = skin ? `style="background:${skin.bg};border-radius:18%;${skin.border ? 'box-shadow:inset 0 0 0 2px ' + skin.border.split(' ').slice(2).join(' ') + ';' : ''}"` : '';
    return `<svg viewBox="0 0 100 100" class="ym-die-face ${extraClass || ''}${skin ? ' skinned' : ''}" ${style}>
        <rect x="4" y="4" width="92" height="92" rx="18" class="ym-die-body"/>
        <ellipse cx="30" cy="20" rx="22" ry="10" class="ym-die-shine"/>
        ${pips.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" ${skin ? `fill="${skin.pip}"` : ''}/>`).join('')}
    </svg>`;
}

let socket = null, state = null, myPseudo = null, lastGameId = null;
const LS_KEY = 'yams_last_game';

// ---------- Grande célébration plein écran quand quelqu'un fait un Yams ----------
const CONFETTI_COLORS = ['#d9a94e', '#ecca82', '#efe4cf', '#5aa87a', '#d2624a'];
const BONUS_CONFETTI_COLORS = ['#ecca82', '#ffdf8a', '#ff6b4a', '#d2624a', '#fff2d0'];
function playNemesisDefeated(winner, nemesis) {
    if (winner !== myPseudo) return;   // ce moment n'appartient qu'à celui qui vient de gagner
    const el = $('ymNemesisScreen');
    const field = $('ymNemesisConfetti');
    $('ymNemesisWho').textContent = `Tu as enfin battu ${nemesis} !`;
    field.innerHTML = '';
    for (let i = 0; i < 130; i++) {
        const bit = document.createElement('span');
        bit.className = 'ym-confetti-bit';
        bit.style.left = Math.random() * 100 + '%';
        bit.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
        bit.style.animationDelay = (Math.random() * .6) + 's';
        bit.style.animationDuration = (2 + Math.random() * 1.2) + 's';
        bit.style.setProperty('--drift', (Math.random() * 160 - 80) + 'px');
        bit.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
        field.appendChild(bit);
    }
    el.classList.add('on');
    if (navigator.vibrate) { try { navigator.vibrate([50, 100, 50, 100, 200]); } catch (e) {} }
    setTimeout(() => { el.classList.remove('on'); field.innerHTML = ''; }, 3800);
}
function playCelebration(pseudo, bonus) {
    const el = $('ymCelebration');
    const field = $('ymConfetti');
    const who = pseudo === myPseudo ? 'Tu' : pseudo;
    $('ymCelebrationWord').textContent = bonus ? 'BONUS YAMS !' : 'YAMS !';
    $('ymCelebrationWho').textContent = bonus
        ? `${who === 'Tu' ? 'Tu enchaînes' : who + ' enchaîne'} un deuxième Yams !`
        : `${who === 'Tu' ? 'Tu viens' : who + ' vient'} de faire un Yams !`;
    $('ymCelebrationBonus').hidden = !bonus;
    el.classList.toggle('mega', !!bonus);
    field.innerHTML = '';
    const count = bonus ? 190 : 90;
    for (let i = 0; i < count; i++) {
        const bit = document.createElement('span');
        bit.className = 'ym-confetti-bit';
        bit.style.left = Math.random() * 100 + '%';
        bit.style.background = (bonus ? BONUS_CONFETTI_COLORS : CONFETTI_COLORS)[i % CONFETTI_COLORS.length];
        bit.style.animationDelay = (Math.random() * .6) + 's';
        bit.style.animationDuration = (bonus ? 2.4 : 1.8) + (Math.random() * 1.2) + 's';
        bit.style.setProperty('--drift', (Math.random() * (bonus ? 220 : 140) - (bonus ? 110 : 70)) + 'px');
        bit.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
        if (bonus) { bit.style.width = '13px'; bit.style.height = '20px'; }
        field.appendChild(bit);
    }
    el.classList.add('on');
    if (navigator.vibrate) {
        try { navigator.vibrate(bonus ? [40, 80, 40, 80, 40, 80, 220] : [30, 60, 30, 60, 120]); } catch (e) {}
    }
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.classList.remove('on', 'mega'); field.innerHTML = ''; }, bonus ? 4600 : 3400);
}

function connect() {
    socket = io();
    socket.on('connect', () => {
        socket.emit('yams_identify', (res) => {
            if (!res || !res.ok) { toast('Reconnecte-toi au salon.'); return; }
            myPseudo = res.pseudo;
            // Un lien d'invitation prime sur la dernière table mémorisée.
            const invite = Invitation.tableDuLien();
            const saved = invite || localStorage.getItem(LS_KEY);
            if (saved) { lastGameId = saved; socket.emit('yams_join', { id: saved }); }
            else { socket.emit('yams_list'); ouvrirCreationSiDemandee(); }
        });
    });
    socket.on('yams_games', renderLobby);
    socket.on('yams_state', onState);
    socket.on('yams_stats_result', renderStats);
    socket.on('yams_leaderboard_result', renderLeaderboard);
    socket.on('yams_history_result', renderHistory);
    socket.on('yams_h2h_result', renderH2h);
    socket.on('yams_celebration', ({ pseudo, bonus }) => { sonYams(); playCelebration(pseudo, bonus); });
    socket.on('yams_nemesis_defeated', ({ winner, nemesis }) => playNemesisDefeated(winner, nemesis));
    socket.on('yams_tour_saute', ({ pseudo, parti }) => {
        if (pseudo === myPseudo) toast(parti ? 'Tu as été mis de côté, reviens quand tu veux.' : 'Tour passé, tu as mis trop de temps.');
        else toast(parti ? `${pseudo} ne bloque plus la partie.` : `Tour de ${pseudo} passé.`);
    });
    socket.on('yams_error', (msg) => {
        toast(msg || 'Erreur.');
        if (/existe plus|déjà commencé/i.test(msg || '')) {
            localStorage.removeItem(LS_KEY);
            showView('v-lobby');
            socket.emit('yams_list');
        }
    });
    socket.on('yams_closed', () => { toast('La table a été fermée.'); localStorage.removeItem(LS_KEY); location.href = '/'; });
    socket.on('disconnect', () => toast('Connexion perdue, on retente…'));
}

function showView(id) {
    ['v-lobby', 'v-waiting', 'v-game', 'v-ended'].forEach(v => { $(v).hidden = (v !== id); });
    Vues.suivre(id);
}

// Le geste retour du téléphone remonte d'une vue au lieu de quitter le site.
// Quitter une table est une action à part, qui passe par le bouton dédié.
Vues.surRetour((precedente) => { if (precedente) showView(precedente); });


// ---------- Lobby ----------
// =====================================================================
//  MES STATISTIQUES — la fiche complète d'un joueur
//  Le serveur tient désormais une ligne par case (combien de fois remplie,
//  la moyenne, le record, combien de fois barrée) et la moyenne du salon
//  pour chacune : c'est ce qui permet de dire à quelqu'un où il est bon,
//  et pas seulement combien de parties il a gagnées.
// =====================================================================
let maFiche = null, moyennesSalon = [];
function bloc3(paires) {
    return `<div class="ds-stat-grid ym-stat-bloc">` + paires.filter(x => x[1] !== null && x[1] !== undefined)
        .map(([l, v]) => `<div class="ds-stat-box"><b>${v}</b><em>${l}</em></div>`).join('') + `</div>`;
}
function renderStats(data) {
    if (!data) return;
    maFiche = data;
    myYamsWins = data.gamesWon || 0;
    myYamsCount = data.totalYams || 0;
    myOpponents = data.opponents || [];
    if (!$('v-skins').hidden) renderSkinsGrid();
    if (!$('v-leaderboard').hidden) renderH2hSelect();

    const bilan = data.gamesPlayed
        ? `<p class="ym-stats-bilan"><b>${data.gamesWon}</b> victoire${data.gamesWon > 1 ? 's' : ''}, <b>${data.gamesLost}</b> défaite${data.gamesLost > 1 ? 's' : ''}${data.gamesTied ? `, <b>${data.gamesTied}</b> nul${data.gamesTied > 1 ? 's' : ''}` : ''} — ${data.winRate}% de réussite</p>`
        : `<p class="ym-stats-bilan">Pas encore de partie à plusieurs.</p>`;

    const chiffres = bloc3([
        ['Parties', data.gamesPlayed],
        ['Score moyen', data.moyenne || '—'],
        ['Meilleur score', data.bestScore || '—'],
        ['Yams réalisés', data.totalYams],
        ['dont bonus', data.bonusYams],
        ['Bonus des 63', data.tauxBonus63 === null ? '—' : data.tauxBonus63 + '%'],
    ]);
    const series = (data.meilleureSerie > 1 || data.soloPlayed) ? bloc3([
        data.meilleureSerie > 1 ? ['Meilleure série', data.meilleureSerie + ' 🏆'] : null,
        data.serieVictoires > 1 ? ['Série en cours', data.serieVictoires] : null,
        data.soloPlayed ? ['Parties solo', data.soloPlayed] : null,
        data.soloBest ? ['Record solo', data.soloBest] : null,
    ].filter(Boolean)) : '';

    // Ce qui se dit d'un joueur en une phrase, comparé au reste du salon.
    const f = data.forces || {};
    const portraits = [];
    if (f.force && f.force.ecart > 0) portraits.push(`💪 Ta case forte : <b>${esc(nomDeCat(f.force.cat))}</b> — ${f.force.moyenne} de moyenne, ${f.force.ecart > 0 ? '+' : ''}${f.force.ecart} par rapport au salon`);
    if (f.faiblesse && f.faiblesse.ecart < 0) portraits.push(`📉 Ta case faible : <b>${esc(nomDeCat(f.faiblesse.cat))}</b> — ${f.faiblesse.moyenne} contre ${f.faiblesse.salon} dans le salon`);
    if (f.barree) portraits.push(`✂️ Tu barres surtout <b>${esc(nomDeCat(f.barree.cat))}</b> : ${f.barree.zeros} fois sur ${f.barree.fois}`);
    if (data.nemesis) portraits.push(`😈 Ta bête noire : <b>${esc(data.nemesis.pseudo)}</b> t'a battu ${data.nemesis.losses} fois`);
    if (data.souffreDouleur) portraits.push(`🎯 Ton client préféré : <b>${esc(data.souffreDouleur.pseudo)}</b>, battu ${data.souffreDouleur.wins} fois`);

    // Le détail case par case, avec la moyenne du salon comme point de repère.
    const parCat = new Map(moyennesSalon.map(c => [c.cat, c]));
    const lignes = (data.categories || []).filter(c => c.fois).map(c => {
        const ref = parCat.get(c.cat);
        const ecart = ref ? c.moyenne - ref.moyenne : null;
        return `<div class="ym-cat-ligne">
            <span class="ym-cat-nom">${esc(nomDeCat(c.cat))}</span>
            <span class="ym-cat-moy">${c.moyenne}</span>
            ${ecart === null ? '<span class="ym-cat-ecart"></span>'
                : `<span class="ym-cat-ecart ${ecart > 0 ? 'plus' : (ecart < 0 ? 'moins' : '')}">${ecart > 0 ? '+' : ''}${ecart}</span>`}
            <span class="ym-cat-detail">record ${c.meilleur}${c.zeros ? ` · barrée ${c.zeros}×` : ''}</span>
        </div>`;
    }).join('');

    $('statsGrid').innerHTML = bilan + chiffres + series
        + (portraits.length ? `<div class="ym-stats-portrait">${portraits.map(x => `<p>${x}</p>`).join('')}</div>` : '')
        + (lignes ? `<p class="ym-stats-titre">Case par case <em>(ta moyenne, l'écart avec le salon)</em></p><div class="ym-cat-table">${lignes}</div>` : '');
    $('statsNemesis').hidden = true;   // repris dans le portrait ci-dessus
}
function renderLobby(games) {
    $('lobby-empty-label').hidden = !!games.length;
    $('ym-tables').innerHTML = games.map(g => `
        <button type="button" class="ds-row" data-id="${g.id}">
            <span class="ds-row-main">
                <span class="ds-row-name">${esc(g.host)}</span>
                <span class="ds-row-sub">${g.status === 'playing' ? '🔴 En cours' : 'En attente'} · ${g.alive}/${g.players} joueurs${g.spectators ? ` · 👀 ${g.spectators}` : ''}</span>
            </span>
            <span class="ds-row-go">${g.status === 'playing' ? 'Regarder ›' : 'Rejoindre ›'}</span>
        </button>
    `).join('');
    $('ym-tables').querySelectorAll('.ds-row').forEach(b => b.addEventListener('click', () => {
        socket.emit('yams_join', { id: b.dataset.id });
    }));
}
$('btn-create').addEventListener('click', () => socket.emit('yams_create'));
$('btn-stats').addEventListener('click', () => { socket.emit('yams_stats'); $('v-stats').hidden = false; });
function renderSkinsGrid() {
    $('skinsGrid').innerHTML = Object.entries(DICE_SKINS).map(([id, skin]) => {
        const owned = ownsDiceSkin(id);
        const lockLabel = !owned
            ? (typeof skin.winsRequired === 'number' ? `🔒 ${skin.winsRequired} victoires` : `🔒 ${skin.yamsRequired} Yams`)
            : '';
        return `
            <button type="button" class="ym-skin-card${id === currentSkin ? ' active' : ''}${!owned ? ' locked' : ''}" data-id="${id}" ${!owned ? 'disabled' : ''}>
                <span class="ym-skin-preview">${diceFaceSvgFor(skin)}</span>
                <span class="ym-skin-name">${esc(skin.name)}</span>
                ${lockLabel ? `<span class="ym-skin-lock">${lockLabel}</span>` : ''}
            </button>`;
    }).join('');
    $('skinsGrid').querySelectorAll('.ym-skin-card:not(.locked)').forEach(b => b.addEventListener('click', () => {
        currentSkin = b.dataset.id;
        localStorage.setItem(SKIN_KEY, currentSkin);
        renderSkinsGrid();
        if (state) renderDice(state);
    }));
}
function diceFaceSvgFor(skin) {
    const style = `style="background:${skin.bg};border-radius:18%;${skin.border ? 'box-shadow:inset 0 0 0 2px ' + skin.border.split(' ').slice(2).join(' ') + ';' : ''}"`;
    return `<svg viewBox="0 0 100 100" class="ym-die-face skinned" ${style}>
        <circle cx="50" cy="50" r="9" fill="${skin.pip}"/>
    </svg>`;
}
$('btn-skins').addEventListener('click', () => { socket.emit('yams_stats'); renderSkinsGrid(); $('v-skins').hidden = false; });

// ---------- Classement, historique, face à face ----------
let myOpponents = [];
function renderLeaderboard(d) {
    const rows = (d && d.joueurs) || [];
    moyennesSalon = (d && d.categories) || [];
    const record = d && d.record;
    const tete = record ? `<p class="ym-stats-bilan">🏅 Record du salon : <b>${record.score}</b> par ${esc(record.pseudo)}</p>` : '';
    // Le classement compare maintenant ce qui se compare vraiment : la moyenne
    // et le taux de bonus disent bien plus qu'un simple total de victoires.
    const liste = rows.length ? rows.map((r, i) => `
        <button type="button" class="ds-lb-row${r.pseudo === myPseudo ? ' me' : ''}" data-view="${esc(r.pseudo)}">
            <span class="ds-lb-rank">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1)}</span>
            <span class="ds-lb-name">${esc(r.pseudo)}
                <em class="ym-lb-detail">moy. ${r.moyenne || '—'} · record ${r.bestScore} · bonus ${r.tauxBonus63}%${r.totalYams ? ` · ${r.totalYams} yams` : ''}</em></span>
            <span class="ds-lb-value">${r.gamesWon}V${r.gamesTied ? ' ' + r.gamesTied + 'N' : ''}</span>
            <span class="ym-lb-winrate">${r.winRate}%</span>
        </button>
    `).join('') : `<p class="ym-list-label">Personne n'a encore terminé de partie.</p>`;
    // La moyenne du salon pour chaque case : le point de repère qui manquait.
    const cases = moyennesSalon.filter(c => c.fois).map(c => `
        <div class="ym-cat-ligne">
            <span class="ym-cat-nom">${esc(nomDeCat(c.cat))}</span>
            <span class="ym-cat-moy">${c.moyenne}</span>
            <span class="ym-cat-ecart">${c.tauxZero}% barrée</span>
            <span class="ym-cat-detail">record ${c.meilleur}${c.porteur ? ' · ' + esc(c.porteur) : ''}</span>
        </div>`).join('');
    $('paneLb').innerHTML = tete + liste
        + (cases ? `<p class="ym-stats-titre">Les cases du salon <em>(moyenne, part de cases barrées)</em></p><div class="ym-cat-table">${cases}</div>` : '');
    $('paneLb').querySelectorAll('.ds-lb-row').forEach(b => b.addEventListener('click', () => PortailProfile.open(b.dataset.view)));
    if (maFiche) renderStats(maFiche);   // les écarts dépendent des moyennes qu'on vient de recevoir
}
function renderHistory(list) {
    $('paneHist').innerHTML = list.length ? list.map(g => {
        const sorted = [...g.players].sort((a, b) => b.total - a.total);
        const when = new Date(g.endedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        const gagnants = g.gagnants || (g.winner ? [g.winner] : []);
        const nul = gagnants.length > 1;
        const marque = (p) => gagnants.includes(p.pseudo) ? (nul ? '🤝 ' : '🏆 ') : '';
        const extras = [];
        if (g.solo) extras.push('en solo');
        const yams = g.players.reduce((t, p) => t + (p.yams || 0), 0);
        if (yams) extras.push(`${yams} yams`);
        const bonus = g.players.filter(p => p.bonus).length;
        if (bonus) extras.push(`${bonus} bonus 63`);
        return `
            <div class="ds-row static">
                <span class="ds-row-main">
                    <span class="ds-row-name">${sorted.map(p => `${marque(p)}${esc(p.pseudo)} (${p.total})`).join(' · ')}</span>
                    <span class="ds-row-sub">${when}${extras.length ? ' · ' + extras.join(' · ') : ''}</span>
                </span>
            </div>`;
    }).join('') : `<p class="ym-list-label">Aucune partie terminée pour l'instant.</p>`;
}
function renderH2hSelect() {
    const sel = $('h2hSelect');
    sel.innerHTML = myOpponents.length
        ? myOpponents.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('')
        : '<option disabled selected>Aucun adversaire rencontré</option>';
    if (myOpponents.length) socket.emit('yams_h2h', { opponent: myOpponents[0] });
}
function renderH2h(d) {
    if (!d) return;
    const total = d.totalGames;
    if (!total) {
        $('h2hResult').innerHTML = `<p class="ym-list-label">Tu n'as pas encore joué contre ${esc(d.opponent)}.</p>`;
        return;
    }
    const recentes = (d.recentes || []).map(r => {
        const issue = r.gagnant === myPseudo ? 'gagne' : (r.gagnant ? 'perd' : 'nul');
        return `<div class="ym-h2h-partie ${issue}">
            <span>${new Date(r.endedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
            <b>${r.moi}</b><span class="ym-h2h-tiret">–</span><b>${r.lui}</b>
        </div>`;
    }).join('');
    $('h2hResult').innerHTML = `
        <div class="ym-h2h-score">
            <div><b>${d.myWins}</b><span>victoires</span></div>
            ${d.draws ? `<div><b>${d.draws}</b><span>nuls</span></div>` : '<div class="ym-h2h-vs">vs</div>'}
            <div><b>${d.myLosses}</b><span>défaites</span></div>
        </div>
        <div class="ym-h2h-compare">
            <div><span>Meilleur score</span><b>${d.myBest}</b><em>${esc(d.opponent)} ${d.theirBest}</em></div>
            <div><span>Score moyen</span><b>${d.myMoyenne || '—'}</b><em>${esc(d.opponent)} ${d.theirMoyenne || '—'}</em></div>
            <div><span>Yams réalisés</span><b>${d.myYams}</b><em>${esc(d.opponent)} ${d.theirYams}</em></div>
        </div>
        <p class="ym-h2h-note">Sur ${total} partie${total > 1 ? 's' : ''} l'un contre l'autre.</p>
        ${recentes ? `<p class="ym-stats-titre">Les dernières</p><div class="ym-h2h-liste">${recentes}</div>` : ''}`;
}
$('h2hSelect').addEventListener('change', (e) => socket.emit('yams_h2h', { opponent: e.target.value }));
document.querySelectorAll('.ds-segmented button').forEach(tab => tab.addEventListener('click', () => {
    document.querySelectorAll('.ds-segmented button').forEach(t => t.classList.toggle('on', t === tab));
    ['lb', 'hist', 'h2h'].forEach(k => { $('pane' + k[0].toUpperCase() + k.slice(1)).hidden = tab.dataset.tab !== k; });
}));
$('btn-leaderboard').addEventListener('click', () => {
    $('v-leaderboard').hidden = false;
    socket.emit('yams_leaderboard');
    socket.emit('yams_history');
    socket.emit('yams_stats');
});
$('leaderboard-close').addEventListener('click', () => { $('v-leaderboard').hidden = true; });
$('skins-close').addEventListener('click', () => { $('v-skins').hidden = true; });
$('stats-close').addEventListener('click', () => { $('v-stats').hidden = true; });
socket_list_poll();
function socket_list_poll() {
    setInterval(() => { if (socket && socket.connected && !$('v-lobby').hidden) socket.emit('yams_list'); }, 5000);
}

// ---------- Salle d'attente ----------
function renderWaiting(s) {
    $('wait-players').innerHTML = s.players.map(p => `
        <button type="button" class="ds-waiting-chip${p.connected ? '' : ' off'}" data-view="${esc(p.pseudo)}">
            <span class="ds-avatar sm" data-p="${esc(p.pseudo)}">✦</span>
            ${esc(p.pseudo)}${p.pseudo === s.host ? '<span class="ds-waiting-host">Hôte</span>' : ''}
        </button>
    `).join('');
    $('wait-players').querySelectorAll('.ds-waiting-chip').forEach(b => b.addEventListener('click', () => PortailProfile.open(b.dataset.view)));
    PortailProfile.fetchAvatars(s.players.map(p => p.pseudo)).then(a => {
        $('wait-players').querySelectorAll('.ds-avatar').forEach(el => { el.innerHTML = PortailProfile.bubbleHTML(a[el.dataset.p]); });
    });
    const isHost = myPseudo === s.host;
    $('btn-start').hidden = !isHost;
    $('wait-hint').hidden = isHost;
    if (isHost) {
        $('btn-start').disabled = false;
        $('btn-start').textContent = s.players.length < 2 ? 'Jouer seul' : 'Lancer la partie';
    }
    $('wait-solo').hidden = s.players.length > 1 || !isHost;
}
$('btn-start').addEventListener('click', () => socket.emit('yams_start'));
$('btn-leave-lobby').addEventListener('click', () => { socket.emit('yams_leave'); localStorage.removeItem(LS_KEY); showView('v-lobby'); socket.emit('yams_list'); });
$('btn-back-lobby').addEventListener('click', () => { socket.emit('yams_leave'); localStorage.removeItem(LS_KEY); showView('v-lobby'); socket.emit('yams_list'); });

// ---------- Partie ----------
let lastTurnPseudo = null, scoreAvatars = {};

// =====================================================================
//  LE SON
//  Le Yams est le jeu où le son porte le plaisir — le roulement des dés, le
//  claquement d'un dé qu'on garde, la fanfare du Yams. Il n'y avait que trois
//  vibrations. Tout est synthétisé à la volée : aucun fichier à charger, rien
//  à mettre en cache, et ça marche hors-ligne comme le reste du salon.
//  Le contexte audio ne peut naître que d'un geste de l'utilisateur (iOS),
//  d'où la création paresseuse au premier clic.
// =====================================================================
const SON_CLE = 'yams_son';
let sonActif = localStorage.getItem(SON_CLE) !== '0';
let ctx = null;
function audio() {
    if (!sonActif) return null;
    try {
        if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
    } catch (e) { return null; }
}
// Une note simple : forme d'onde, hauteur, durée, volume.
function note(freq, duree, type, volume, retard) {
    const c = audio(); if (!c) return;
    const t = c.currentTime + (retard || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(volume === undefined ? .12 : volume, t + .012);
    g.gain.exponentialRampToValueAtTime(.0001, t + duree);
    o.connect(g).connect(c.destination);
    o.start(t); o.stop(t + duree + .02);
}
// Un bruit court et sec : c'est ce qui fait le son d'un dé, pas une note.
function choc(duree, filtre, volume, retard) {
    const c = audio(); if (!c) return;
    const t = c.currentTime + (retard || 0);
    const n = Math.floor(c.sampleRate * duree);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource(); src.buffer = buf;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = filtre || 1800; bp.Q.value = 1.2;
    const g = c.createGain(); g.gain.value = volume === undefined ? .3 : volume;
    src.connect(bp).connect(g).connect(c.destination);
    src.start(t);
}
// Les dés qui roulent : une poignée de chocs de plus en plus espacés.
function sonLancer() {
    let t = 0;
    for (let i = 0; i < 9; i++) { choc(.05, 1200 + Math.random() * 1600, .22 - i * .015, t); t += .045 + i * .015; }
}
function sonDe() { choc(.04, 2400, .18); }
function sonPose() { note(660, .09, 'triangle', .1); note(990, .12, 'triangle', .08, .07); }
function sonBarre() { note(300, .16, 'sawtooth', .06); }
function sonTour() { note(523, .12, 'sine', .1); note(784, .18, 'sine', .09, .1); }
function sonBonus() { [523, 659, 784].forEach((f, i) => note(f, .22, 'triangle', .09, i * .09)); }
function sonYams() { [523, 659, 784, 1047, 1319].forEach((f, i) => note(f, .35, 'triangle', .1, i * .1)); }
function sonVictoire() { [523, 659, 784, 1047].forEach((f, i) => note(f, .4, 'sine', .1, i * .13)); }

let lastDiceKey = null;

// ---------- Le moment où les aperçus apparaissent ----------
// Les valeurs possibles arrivent avec l'état, donc avant que les dés aient fini
// de rouler : elles annonçaient le résultat pendant que l'animation faisait
// encore semblant de le chercher. On les retient jusqu'à la fin du roulement.
let apercusVisibles = true, apercuTimer = null;
function masquerApercus(dureeMs) {
    apercusVisibles = false;
    clearTimeout(apercuTimer);
    apercuTimer = setTimeout(() => {
        apercusVisibles = true;
        if (state) renderSheet(state);
    }, dureeMs);
}
function spawnDiceParticle(btn) {
    const host = $('diceRow');
    if (!host) return;
    const hostRect = host.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const p = document.createElement('span');
    p.className = 'ym-dice-particle';
    p.style.left = (btnRect.left - hostRect.left + btnRect.width / 2) + 'px';
    p.style.top = (btnRect.top - hostRect.top + btnRect.height / 2) + 'px';
    p.style.setProperty('--px', (Math.random() * 50 - 25) + 'px');
    p.style.setProperty('--py', (Math.random() * 50 - 25) + 'px');
    host.appendChild(p);
    setTimeout(() => p.remove(), 500);
}
const ROLL_STEPS = [60, 60, 70, 80, 90, 110, 140, 180];
const ROLL_DUREE = ROLL_STEPS.reduce((a, b) => a + b, 0);
function runRollAnimation(btn, finalValue, delayMs) {
    // Cycle réellement à travers des valeurs aléatoires, de plus en plus lentement,
    // avant de se stabiliser sur le vrai résultat : ça donne l'impression d'un dé
    // qui roule pour de vrai plutôt qu'un simple sursaut visuel.
    setTimeout(() => {
        btn.classList.add('rolling-spin');
        const face = btn.querySelector('.ym-die-face-wrap');
        const steps = ROLL_STEPS;
        let i = 0;
        const particleTimer = setInterval(() => spawnDiceParticle(btn), 55);
        function tick() {
            const val = i < steps.length - 1 ? (1 + Math.floor(Math.random() * 6)) : finalValue;
            if (face) face.innerHTML = diceFaceSvg(val, '', true);
            if (i < steps.length - 1) { setTimeout(tick, steps[i]); i++; }
            else {
                clearInterval(particleTimer);
                btn.classList.remove('rolling-spin');
                btn.classList.add('landed');
                setTimeout(() => btn.classList.remove('landed'), 350);
            }
        }
        tick();
    }, delayMs);
}
function renderDice(s) {
    const isMyTurn = s.turnPseudo === myPseudo;
    if (!s.hasRolled) {
        // Rien n'est affiché tant qu'on n'a pas lancé : les dés apparaissent au clic, pas avant.
        $('diceRow').innerHTML = '';
        lastDiceKey = null;
    } else {
        const diceKey = s.dice.join(',') + '|' + s.rollsLeft + '|' + s.turnPseudo;
        const justRolled = diceKey !== lastDiceKey;
        lastDiceKey = diceKey;
        $('diceRow').innerHTML = s.dice.map((v, i) => `
            <button type="button" class="ym-die${s.held[i] ? ' held' : ''}" data-i="${i}" ${(!isMyTurn || s.rollsLeft <= 0) ? 'disabled' : ''}>
                <span class="ym-die-face-wrap">${diceFaceSvg(v, '', true)}</span>
            </button>
        `).join('');
        let dernierDepart = 0;
        $('diceRow').querySelectorAll('.ym-die').forEach((b, i) => {
            b.addEventListener('click', () => { sonDe(); socket.emit('yams_hold', { index: Number(b.dataset.i) }); });
            // On ne fait rouler que les dés qui viennent vraiment d'être relancés (pas ceux gardés).
            if (justRolled && !s.held[i]) { runRollAnimation(b, s.dice[i], i * 70); dernierDepart = i * 70; }
        });
        if (justRolled) { sonLancer(); masquerApercus(dernierDepart + ROLL_DUREE + 60); }
    }
    $('turnLabel').textContent = isMyTurn ? 'À toi de jouer' : `Au tour de ${s.turnPseudo}`;
    const tag = $('ym-turn-tag');
    tag.hidden = false;
    tag.textContent = `Tour ${s.tour} / ${s.toursTotal}`;
    $('btn-roll').disabled = !isMyTurn || s.rollsLeft <= 0;
    $('btn-roll').textContent = s.rollsLeft === 3 ? 'Lancer les dés' : 'Relancer';
    $('rollsLeft').textContent = s.hasRolled ? `${s.rollsLeft} lancer${s.rollsLeft > 1 ? 's' : ''} restant${s.rollsLeft > 1 ? 's' : ''}` : '3 lancers disponibles';
}

// ---------- Choisir une catégorie : toute la rangée est cliquable, mais rien n'est
// noté avant confirmation en bas, pour éviter toute erreur au tap. ----------
let pendingCategory = null, pendingLabel = '', pendingDiceKey = null, pendingPoints = 0;
function clearPending() {
    pendingCategory = null;
    $('confirmBar').hidden = true;
    document.querySelectorAll('.ym-ligne.pending').forEach(r => r.classList.remove('pending'));
}
function selectPending(cat, label, points) {
    pendingCategory = cat; pendingLabel = label; pendingPoints = points;
    pendingDiceKey = state ? state.dice.join(',') : null;
    document.querySelectorAll('.ym-ligne').forEach(r => r.classList.toggle('pending', r.dataset.cat === cat));
    $('confirmText').innerHTML = points === 0
        ? `Barrer <b>${esc(label)}</b> — 0 point`
        : `${esc(label)} : <b>${points}</b> point${points > 1 ? 's' : ''}`;
    if (state) $('confirmDice').innerHTML = state.dice.map(v => diceFaceSvg(v, 'mini', true)).join('');
    $('confirmBar').hidden = false;
}
// Le chiffre s'envole visuellement des dés vers sa case ; si le score est nul (case
// sacrifiée), un petit effet comique de dé qui s'écroule joue à la place.
function flyScoreToCell(cat, points) {
    const row = document.querySelector(`.ym-ligne[data-cat="${cat}"]`);
    const dice = $('diceRow');
    if (!row || !dice) return;
    const rowRect = row.getBoundingClientRect();
    if (rowRect.bottom < 0 || rowRect.top > window.innerHeight) return;   // hors écran, on ne tente rien
    const diceRect = dice.getBoundingClientRect();
    const fly = document.createElement('div');
    fly.className = points > 0 ? 'ym-fly-number' : 'ym-fly-miss';
    fly.textContent = points > 0 ? '+' + points : '✗';
    fly.style.left = (diceRect.left + diceRect.width / 2) + 'px';
    fly.style.top = (diceRect.top + diceRect.height / 2) + 'px';
    document.body.appendChild(fly);
    requestAnimationFrame(() => {
        fly.style.left = (rowRect.right - 20) + 'px';
        fly.style.top = (rowRect.top + rowRect.height / 2) + 'px';
        fly.classList.add('flying');
    });
    setTimeout(() => fly.remove(), 700);
}
$('confirmCancel').addEventListener('click', clearPending);
$('confirmOk').addEventListener('click', () => {
    if (!pendingCategory) return;
    if (pendingPoints > 0) sonPose(); else sonBarre();
    flyScoreToCell(pendingCategory, pendingPoints);
    socket.emit('yams_score', { category: pendingCategory });
    clearPending();
});

// =====================================================================
//  LA FEUILLE — un vrai bloc de Yams : une ligne par case, une colonne par
//  joueur. Les deux colonnes côte à côte d'avant ne laissaient que 160 px
//  aux cellules, qui passaient à la ligne dès trois joueurs : chaque rangée
//  faisait alors 76 px au lieu de 30, et les treize cases un mur de 1000 px.
// =====================================================================
// Le serveur envoie `possible` pour toutes les catégories dès qu'un lancer a
// eu lieu ; l'aperçu n'est montré qu'une fois les dés vraiment posés.
function apercuDisponible(s) {
    return s.status === 'playing' && s.hasRolled && !!s.possible && !!s.turnPseudo;
}
// Le meilleur coup encore jouable, pour le signaler d'un coup d'oeil.
function meilleurCoup(s) {
    if (!apercuDisponible(s)) return -1;
    const p = s.players.find(x => x.pseudo === s.turnPseudo);
    if (!p) return -1;
    let best = -1;
    for (const [cat, pts] of Object.entries(s.possible)) {
        if (p.scores[cat] === null && pts > best) best = pts;
    }
    return best;
}

const TOUTES_CATS = [...UPPER_CATS, ...LOWER_CATS];
const LOWER_KEYS = LOWER_CATS.map(c => c.key);
const nomDeCat = (cat) => (TOUTES_CATS.find(c => c.key === cat) || {}).label || cat;

function celluleDe(cat, p, i, s, apercu, best) {
    const val = p.scores[cat];
    if (val !== null) return `<span class="ym-cell filled" style="--pcolor:${playerColor(i)}">${val}</span>`;
    if (apercu && p.pseudo === s.turnPseudo) {
        const pts = s.possible[cat] || 0;
        const ton = pts === 0 ? ' zero' : (pts === best && best > 0 ? ' top' : '');
        return `<span class="ym-cell apercu${ton}">${pts}</span>`;
    }
    return `<span class="ym-cell empty">—</span>`;
}
function ligneDe(cat, label, iconHtml, s, apercu, best) {
    const isMyTurn = s.turnPseudo === myPseudo;
    const me = s.players.find(p => p.pseudo === myPseudo);
    const jouable = isMyTurn && s.hasRolled && me && me.scores[cat] === null;
    // Une seule rangée signalée — la meilleure. Avant, toutes celles qui
    // rapportaient un point clignotaient ensemble : jusqu'à treize animations
    // en boucle, qui ne désignaient plus rien.
    const meilleure = jouable && s.possible && s.possible[cat] === best && best > 0;
    return `<div class="ym-ligne${jouable ? ' jouable' : ''}${meilleure ? ' meilleure' : ''}" data-cat="${cat}" role="row">
        <span class="ym-ligne-nom"><span class="ym-ligne-icone">${iconHtml}</span>${esc(label)}</span>
        ${s.players.map((p, i) => celluleDe(cat, p, i, s, apercu, best)).join('')}
    </div>`;
}
function ligneCalcul(nom, valeurs, classe) {
    return `<div class="ym-ligne ${classe}" role="row">
        <span class="ym-ligne-nom">${nom}</span>
        ${valeurs.join('')}
    </div>`;
}
function renderSheet(s) {
    const apercu = apercuDisponible(s) && apercusVisibles;
    const best = apercu ? meilleurCoup(s) : -1;
    const hauts = s.players.map(p => UPPER_KEYS.reduce((sum, k) => sum + (p.scores[k] || 0), 0));
    const bas = s.players.map(p => LOWER_KEYS.reduce((sum, k) => sum + (p.scores[k] || 0), 0) + (p.yamsBonus || 0));

    const entete = `<div class="ym-ligne entete" role="row">
        <span class="ym-ligne-nom">${s.serie ? `<span class="ym-manche">Manche ${s.manche}</span>` : ''}</span>
        ${s.players.map((p, i) => `<button type="button" class="ym-col-tete${p.pseudo === s.turnPseudo ? ' actif' : ''}${p.parti ? ' parti' : (p.connected ? '' : ' absent')}"
            style="--pcolor:${playerColor(i)}" data-view="${esc(p.pseudo)}">
            <span class="ds-avatar xs ym-col-bulle" data-p="${esc(p.pseudo)}">${PortailProfile.bubbleHTML(scoreAvatars[p.pseudo])}</span>
            <span class="ym-col-nom">${p.pseudo === myPseudo ? 'Toi' : esc(p.pseudo)}</span>
            <b class="ym-col-total">${p.total}</b>
            ${s.serie ? `<span class="ym-col-serie">${(s.serie[p.pseudo] || 0) + p.total}</span>` : ''}
        </button>`).join('')}
    </div>`;

    $('feuille').style.setProperty('--joueurs', s.players.length);
    $('feuille').innerHTML = entete
        + `<p class="ym-section">Chiffres</p>`
        + UPPER_CATS.map(c => ligneDe(c.key, c.label, diceFaceSvg(c.face, 'small'), s, apercu, best)).join('')
        + ligneCalcul('Bonus <em>63 et +</em>',
            hauts.map(u => `<span class="ym-cell ${u >= 63 ? 'bonus-ok' : 'calcul'}">${u >= 63 ? '+35' : '−' + (63 - u)}</span>`), 'bonus')
        + ligneCalcul('Sous-total', hauts.map(u => `<span class="ym-cell calcul">${u}</span>`), 'soustotal')
        + `<p class="ym-section">Combinaisons</p>`
        + LOWER_CATS.map(c => ligneDe(c.key, c.label, catIconSvg(c.key), s, apercu, best)).join('')
        + ligneCalcul('Sous-total' + (s.players.some(p => p.yamsBonus) ? ' <em>bonus Yams compris</em>' : ''),
            bas.map(u => `<span class="ym-cell calcul">${u}</span>`), 'soustotal')
        + ligneCalcul('Total', s.players.map((p, i) => `<span class="ym-cell total" style="--pcolor:${playerColor(i)}">${p.total}</span>`), 'grandtotal');

    $('feuille').querySelectorAll('.ym-ligne.jouable').forEach(row => row.addEventListener('click', () => {
        const cat = row.dataset.cat;
        selectPending(cat, nomDeCat(cat), s.possible[cat]);
    }));
    $('feuille').querySelectorAll('.ym-col-tete').forEach(b =>
        b.addEventListener('click', () => PortailProfile.open(b.dataset.view)));
    PortailProfile.fetchAvatars(s.players.map(p => p.pseudo)).then(a => {
        scoreAvatars = a;
        $('feuille').querySelectorAll('.ym-col-bulle').forEach(el => { el.innerHTML = PortailProfile.bubbleHTML(a[el.dataset.p]); });
    });
    // Si les dés ont changé depuis la sélection (nouveau lancer), la case en attente n'a plus de sens.
    if (pendingCategory && pendingDiceKey !== s.dice.join(',')) clearPending();
}
// Le son se coupe d'un geste, et le choix se retient.
function majBoutonSon() {
    $('ym-son').textContent = sonActif ? '🔊' : '🔇';
    $('ym-son').setAttribute('aria-label', sonActif ? 'Couper le son' : 'Remettre le son');
}
$('ym-son').addEventListener('click', () => {
    sonActif = !sonActif;
    localStorage.setItem(SON_CLE, sonActif ? '1' : '0');
    majBoutonSon();
    if (sonActif) sonDe();
});
majBoutonSon();

$('btn-roll').addEventListener('click', () => { clearPending(); socket.emit('yams_roll'); });

// ---------- Le chronomètre du tour ----------
// Un tour a 90 secondes. On ne montre le décompte que dans les 30 dernières :
// avant, une horloge qui tourne ne fait que mettre la pression pour rien.
let chronoTimer = null;
function majChrono() {
    const el = $('ymChrono');
    if (!state || state.status !== 'playing' || !state.tourFinAt) { el.hidden = true; return; }
    const reste = Math.max(0, Math.round((state.tourFinAt - Date.now()) / 1000));
    if (reste > 30) { el.hidden = true; return; }
    el.hidden = false;
    el.classList.toggle('urgent', reste <= 10);
    el.textContent = state.turnPseudo === myPseudo
        ? `${reste} s pour jouer`
        : `${reste} s — ${state.turnPseudo} va être passé${reste === 0 ? '' : ''}`;
}
function lancerChrono() {
    if (chronoTimer) clearInterval(chronoTimer);
    chronoTimer = setInterval(majChrono, 500);
    majChrono();
}

// ---------- Le journal des derniers coups ----------
const NOMS_CAT = { uns:'les 1', deux:'les 2', trois:'les 3', quatre:'les 4', cinq:'les 5', six:'les 6',
    brelan:'Brelan', carre:'Carré', full:'Full', petiteSuite:'Petite suite', grandeSuite:'Grande suite',
    yams:'Yams', chance:'Chance' };
// Le record du salon : un adversaire même quand on mène largement, et le seul
// enjeu qui reste quand on joue seul. Il n'existait que dans un onglet de stats.
function renderRecord(s) {
    const el = $('ymRecord');
    if (!s.record || !s.record.score) { el.hidden = true; return; }
    const me = s.players.find(p => p.pseudo === myPseudo);
    const moi = me ? me.total : 0;
    const aMoi = s.record.pseudo === myPseudo;
    el.hidden = false;
    if (moi > s.record.score) {
        el.className = 'ym-record bat';
        el.textContent = `🏅 Tu dépasses le record du salon (${s.record.score})`;
    } else {
        el.className = 'ym-record';
        const reste = s.record.score - moi;
        el.textContent = aMoi
            ? `🏅 Ton record : ${s.record.score} — il te manque ${reste}`
            : `🏅 Record du salon : ${s.record.score} par ${s.record.pseudo} — il te manque ${reste}`;
    }
}

function renderJournal(s) {
    const j = s.journal || [];
    const el = $('ymJournal');
    el.hidden = !j.length;
    el.innerHTML = [...j].reverse().map(e => {
        const moi = e.pseudo === myPseudo;
        const cat = esc(NOMS_CAT[e.category] || e.category);
        const verbe = e.points === 0
            ? `${moi ? 'barres' : 'barre'} ${cat}`
            : `${moi ? 'poses' : 'pose'} <i>${e.points}</i> sur ${cat}`;
        return `<p class="ym-journal-line${e.points === 0 ? ' zero' : ''}">
            <b>${moi ? 'Tu' : esc(e.pseudo)}</b> ${verbe}
        </p>`;
    }).join('');
}


// ---------- Fin de partie ----------
// Les faits marquants d'une partie : ce qui s'est vraiment passé, au-delà du
// total. Sans ça on ne voyait pas où on avait perdu.
function faitsMarquants(s) {
    const faits = [];
    const bonus = s.players.filter(p => UPPER_KEYS.reduce((t, k) => t + (p.scores[k] || 0), 0) >= 63);
    if (bonus.length) faits.push(`🎯 Bonus des 63 : ${bonus.map(p => p.pseudo === myPseudo ? 'toi' : p.pseudo).join(', ')}`);
    const avecYams = s.players.filter(p => p.scores.yams === 50);
    if (avecYams.length) faits.push(`🎲 Yams réussi : ${avecYams.map(p => p.pseudo === myPseudo ? 'toi' : p.pseudo).join(', ')}`);
    // La plus grosse case de la partie, tous joueurs confondus.
    let top = null;
    for (const p of s.players) for (const c of TOUTES_CATS) {
        const v = p.scores[c.key];
        if (v !== null && (!top || v > top.v)) top = { v, cat: c.label, pseudo: p.pseudo };
    }
    if (top && top.v > 0) faits.push(`💥 Plus grosse case : ${top.v} sur ${top.cat} (${top.pseudo === myPseudo ? 'toi' : top.pseudo})`);
    const barrees = s.players.map(p => ({ pseudo: p.pseudo, n: TOUTES_CATS.filter(c => p.scores[c.key] === 0).length }))
        .sort((a, b) => b.n - a.n)[0];
    if (barrees && barrees.n > 0) faits.push(`✂️ Le plus de cases barrées : ${barrees.pseudo === myPseudo ? 'toi' : barrees.pseudo} (${barrees.n})`);
    return faits;
}
function renderEnded(s) {
    const sorted = [...s.players].sort((a, b) => b.total - a.total);
    const gagnants = s.gagnants || (s.winner ? [s.winner] : []);
    const nul = gagnants.length > 1;
    // À totaux égaux, personne ne gagne — et ça se dit.
    $('endTitle').textContent = s.solo
        ? `Partie terminée — ${sorted[0] ? sorted[0].total : 0} points`
        : (nul ? `Égalité à ${sorted[0].total} entre ${gagnants.join(' et ')}`
               : (s.winner === myPseudo ? 'Tu as gagné !' : `${s.winner} a gagné !`));
    $('endScores').innerHTML = sorted.map((p) => {
        const gagne = gagnants.includes(p.pseudo);
        const cumul = s.serie ? (s.serie[p.pseudo] || 0) + p.total : null;
        return `<button type="button" class="ds-lb-row${gagne && !nul ? ' win' : ''}" data-view="${esc(p.pseudo)}">
            <span class="ds-lb-name">${gagne ? (nul ? '🤝 ' : '🏆 ') : ''}${esc(p.pseudo)}</span>
            ${cumul !== null ? `<span class="ym-end-cumul">série ${cumul}</span>` : ''}
            <span class="ds-lb-value">${p.total}</span>
        </button>`;
    }).join('');
    $('endScores').querySelectorAll('.ds-lb-row').forEach(b => b.addEventListener('click', () => PortailProfile.open(b.dataset.view)));
    // Les faits marquants, puis la feuille complète : on veut voir où ça s'est joué.
    const faits = faitsMarquants(s);
    $('endFaits').innerHTML = faits.map(f => `<p class="ym-fait">${esc(f)}</p>`).join('');
    $('endFaits').hidden = !faits.length;
    $('endSheet').innerHTML = feuilleFinale(s);
    $('btn-rematch').hidden = myPseudo !== s.host;
    $('btn-rematch').textContent = s.serie ? `Manche ${(s.manche || 1) + 1}` : 'Rejouer';
    if (gagnants.includes(myPseudo) && !nul && !s.solo) sonVictoire();
    // Les confettis de fin de partie : plus l'écart avec le deuxième est large, plus ça fête fort.
    const margin = sorted.length > 1 ? Math.max(0, sorted[0].total - sorted[1].total) : 40;
    const count = Math.round(40 + Math.min(margin, 100) * 1.1);
    const field = $('ymEndConfetti');
    if (field) {
        field.innerHTML = '';
        for (let i = 0; i < count; i++) {
            const bit = document.createElement('span');
            bit.className = 'ym-confetti-bit';
            bit.style.left = Math.random() * 100 + '%';
            bit.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
            bit.style.animationDelay = (Math.random() * .8) + 's';
            bit.style.animationDuration = (1.6 + Math.random() * 1.4) + 's';
            bit.style.setProperty('--drift', (Math.random() * 160 - 80) + 'px');
            bit.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
            field.appendChild(bit);
        }
        setTimeout(() => { field.innerHTML = ''; }, 3200);
    }
}
// La feuille complète en fin de partie : les totaux seuls ne disent pas où on
// a perdu. Même grille que pendant la partie, en lecture seule.
function feuilleFinale(s) {
    const hauts = s.players.map(p => UPPER_KEYS.reduce((t, k) => t + (p.scores[k] || 0), 0));
    const ligne = (nom, cellules, classe) =>
        `<div class="ym-ligne ${classe || ''}"><span class="ym-ligne-nom">${nom}</span>${cellules.join('')}</div>`;
    const cases = (cat) => s.players.map((p, i) => {
        const v = p.scores[cat];
        return `<span class="ym-cell ${v === null ? 'empty' : (v === 0 ? 'barree' : 'filled')}" style="--pcolor:${playerColor(i)}">${v === null ? '—' : v}</span>`;
    });
    return `<div class="ym-feuille finale" style="--joueurs:${s.players.length}">`
        + ligne('', s.players.map((p, i) => `<span class="ym-col-tete" style="--pcolor:${playerColor(i)}"><span class="ym-col-nom">${p.pseudo === myPseudo ? 'Toi' : esc(p.pseudo)}</span></span>`), 'entete')
        + UPPER_CATS.map(c => ligne(esc(c.label), cases(c.key))).join('')
        + ligne('Bonus', hauts.map(u => `<span class="ym-cell ${u >= 63 ? 'bonus-ok' : 'calcul'}">${u >= 63 ? '+35' : '—'}</span>`), 'bonus')
        + LOWER_CATS.map(c => ligne(esc(c.label), cases(c.key))).join('')
        + ligne('Total', s.players.map((p, i) => `<span class="ym-cell total" style="--pcolor:${playerColor(i)}">${p.total}</span>`), 'grandtotal')
        + `</div>`;
}
$('btn-rematch').addEventListener('click', () => socket.emit('yams_rematch'));

// ---------- Routage général selon l'état reçu ----------
let isSpectator = false;
// =====================================================================
//  LE RAPPEL DE TOUR
//  À quatre joueurs sur une quinzaine de minutes, on attend onze minutes.
//  Rien ne prévenait quand le tour revenait : ni titre d'onglet, ni son, ni
//  vibration. C'est ce qui fait qu'on repose son téléphone et qu'on oublie
//  la partie en cours.
// =====================================================================
const TITRE = document.title;
let clignoteTimer = null;
function arreterClignotement() {
    clearInterval(clignoteTimer); clignoteTimer = null;
    document.title = TITRE;
}
function signalerMonTour() {
    sonTour();
    if (navigator.vibrate) { try { navigator.vibrate([60, 90, 60]); } catch (e) {} }
    const el = $('turnLabel');
    if (el) { el.classList.remove('arrive'); void el.offsetWidth; el.classList.add('arrive'); }
    // L'onglet en arrière-plan n'a que son titre pour se faire remarquer.
    if (document.hidden && !clignoteTimer) {
        let on = false;
        clignoteTimer = setInterval(() => { on = !on; document.title = on ? '🎲 À toi de jouer !' : TITRE; }, 900);
    }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) arreterClignotement(); });

// Le bonus des 63 court sur toute la partie et tombait sans que rien ne se
// passe. Il se fête une seule fois, au moment où il bascule.
let bonusFete = false;
function verifierBonus63(s) {
    const me = s.players.find(p => p.pseudo === myPseudo);
    if (!me) return;
    const haut = UPPER_KEYS.reduce((sum, k) => sum + (me.scores[k] || 0), 0);
    if (haut >= 63 && !bonusFete) {
        bonusFete = true;
        sonBonus();
        toast('Bonus des 63 ! +35 points');
        const l = $('feuille').querySelector('.ym-ligne.bonus');
        if (l) { l.classList.add('decroche'); setTimeout(() => l.classList.remove('decroche'), 1600); }
    }
    if (haut < 63) bonusFete = false;   // nouvelle manche
}

let dernierTourSignale = null;
function onState(s) {
    state = s;
    lastGameId = s.id;
    localStorage.setItem(LS_KEY, s.id);
    isSpectator = !s.players.some(p => p.pseudo === myPseudo);
    $('ym-sub').textContent = s.status === 'playing' ? 'Partie en cours' : (s.status === 'ended' ? 'Partie terminée' : `Table de ${s.host}`);
    // Le bouton d'invitation n'a de sens que dans la salle d'attente.
    if (s.status === 'lobby') Invitation.definirTable(s.id); else Invitation.effacer();
    if (s.status === 'lobby') { showView('v-waiting'); renderWaiting(s); $('ym-turn-tag').hidden = true; }
    else if (s.status === 'playing') {
        showView('v-game');
        $('spectatorBanner').hidden = !isSpectator;
        renderDice(s);
        renderSheet(s);
        renderJournal(s);
        renderRecord(s);
        lancerChrono();
        verifierBonus63(s);
        // Le tour vient de me revenir : on le fait savoir, franchement.
        if (s.turnPseudo === myPseudo && dernierTourSignale !== s.turnPseudo + '|' + s.tour) signalerMonTour();
        if (s.turnPseudo !== myPseudo) arreterClignotement();
        dernierTourSignale = s.turnPseudo === myPseudo ? s.turnPseudo + '|' + s.tour : null;
    } else if (s.status === 'ended') {
        showView('v-ended'); renderEnded(s);
        $('ym-turn-tag').hidden = true;
        if (chronoTimer) { clearInterval(chronoTimer); chronoTimer = null; }
        $('ymChrono').hidden = true;
    }
}

connect();