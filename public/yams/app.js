const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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

const PLAYER_COLORS = ['#9b6fc7', '#5aa8d9', '#5aa87a', '#d98a4a'];
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
    $('ymNemesisWho').textContent = `Vous avez enfin battu ${nemesis} !`;
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
    const who = pseudo === myPseudo ? 'Vous' : pseudo;
    $('ymCelebrationWord').textContent = bonus ? 'BONUS YAMS !' : 'YAMS !';
    $('ymCelebrationWho').textContent = bonus
        ? `${who === 'Vous' ? 'Vous enchaînez' : who + ' enchaîne'} un deuxième Yams !`
        : `${who === 'Vous' ? 'Vous venez' : who + ' vient'} de faire un Yams !`;
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
            else socket.emit('yams_list');
        });
    });
    socket.on('yams_games', renderLobby);
    socket.on('yams_state', onState);
    socket.on('yams_stats_result', renderStats);
    socket.on('yams_leaderboard_result', renderLeaderboard);
    socket.on('yams_history_result', renderHistory);
    socket.on('yams_h2h_result', renderH2h);
    socket.on('yams_celebration', ({ pseudo, bonus }) => playCelebration(pseudo, bonus));
    socket.on('yams_nemesis_defeated', ({ winner, nemesis }) => playNemesisDefeated(winner, nemesis));
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
}

// ---------- Lobby ----------
function renderStats(data) {
    if (!data) return;
    myYamsWins = data.gamesWon || 0;
    myYamsCount = data.totalYams || 0;
    myOpponents = data.opponents || [];
    if (!$('v-skins').hidden) renderSkinsGrid();
    if (!$('v-leaderboard').hidden) renderH2hSelect();
    $('statsGrid').innerHTML = [
        ['Victoires', data.gamesWon],
        ['Parties jouées', data.gamesPlayed],
        ['Taux de réussite', data.winRate === null ? '—' : data.winRate + '%'],
        ['Yams réalisés', data.totalYams],
        ['dont bonus', data.bonusYams],
        ['Meilleur score', data.bestScore],
    ].map(([label, val]) => `<div class="ds-stat-box"><b>${val}</b><em>${label}</em></div>`).join('');
    const nem = $('statsNemesis');
    if (data.nemesis) {
        nem.innerHTML = `😈 Votre bête noire : <b>${esc(data.nemesis.pseudo)}</b> vous a battu ${data.nemesis.losses} fois`;
        nem.hidden = false;
    } else {
        nem.hidden = true;
    }
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
function renderLeaderboard(rows) {
    $('paneLb').innerHTML = rows.length ? rows.map((r, i) => `
        <button type="button" class="ds-lb-row${r.pseudo === myPseudo ? ' me' : ''}" data-view="${esc(r.pseudo)}">
            <span class="ds-lb-rank">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1)}</span>
            <span class="ds-lb-name">${esc(r.pseudo)}</span>
            <span class="ds-lb-value">${r.gamesWon} victoires</span>
            <span class="ym-lb-winrate">${r.winRate}%</span>
        </button>
    `).join('') : `<p class="ym-list-label">Personne n'a encore terminé de partie.</p>`;
    $('paneLb').querySelectorAll('.ds-lb-row').forEach(b => b.addEventListener('click', () => PortailProfile.open(b.dataset.view)));
}
function renderHistory(list) {
    $('paneHist').innerHTML = list.length ? list.map(g => {
        const sorted = [...g.players].sort((a, b) => b.total - a.total);
        const when = new Date(g.endedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        return `
            <div class="ds-row static">
                <span class="ds-row-main">
                    <span class="ds-row-name">${sorted.map((p, i) => `${i === 0 ? '🏆 ' : ''}${esc(p.pseudo)} (${p.total})`).join(' · ')}</span>
                    <span class="ds-row-sub">${when}</span>
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
    $('h2hResult').innerHTML = total ? `
        <div class="ym-h2h-score">
            <div><b>${d.myWins}</b><span>victoires</span></div>
            <div class="ym-h2h-vs">vs</div>
            <div><b>${d.myLosses}</b><span>défaites</span></div>
        </div>
        <p class="ym-h2h-note">Sur ${total} partie${total > 1 ? 's' : ''} l'un contre l'autre. Meilleur score : vous ${d.myBest} · ${esc(d.opponent)} ${d.theirBest}.</p>
    ` : `<p class="ym-list-label">Vous n'avez pas encore joué contre ${esc(d.opponent)}.</p>`;
}
$('h2hSelect').addEventListener('change', (e) => socket.emit('yams_h2h', { opponent: e.target.value }));
document.querySelectorAll('.ds-segmented button').forEach(tab => tab.addEventListener('click', () => {
    document.querySelectorAll('.ds-segmented button').forEach(t => t.classList.toggle('on', t === tab));
    ['lb', 'hist', 'h2h'].forEach(k => { $('pane' + k[0].toUpperCase() + k.slice(1)).hidden = tab.dataset.tab !== k; });
}));
$('btn-leaderboard').addEventListener('click', () => {
    socket.emit('yams_leaderboard');
    socket.emit('yams_history');
    socket.emit('yams_stats');
    $('v-leaderboard').hidden = false;
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
    if (isHost && s.players.length < 2) { $('btn-start').disabled = true; $('btn-start').textContent = 'Il faut au moins 2 joueurs'; }
    else if (isHost) { $('btn-start').disabled = false; $('btn-start').textContent = 'Lancer la partie'; }
}
$('btn-start').addEventListener('click', () => socket.emit('yams_start'));
$('btn-leave-lobby').addEventListener('click', () => { socket.emit('yams_leave'); localStorage.removeItem(LS_KEY); showView('v-lobby'); socket.emit('yams_list'); });
$('btn-back-lobby').addEventListener('click', () => { socket.emit('yams_leave'); localStorage.removeItem(LS_KEY); showView('v-lobby'); socket.emit('yams_list'); });

// ---------- Partie ----------
let lastTurnPseudo = null, scoreAvatars = {};
function renderScoresStrip(s) {
    const turnChanged = lastTurnPseudo !== null && lastTurnPseudo !== s.turnPseudo;
    lastTurnPseudo = s.turnPseudo;
    if (focusedPlayerIndex >= s.players.length) focusedPlayerIndex = 0;
    $('scoresStrip').innerHTML = s.players.map((p, i) => `
        <div class="ym-score-band${p.pseudo === s.turnPseudo ? ' current' : ''}${i === focusedPlayerIndex ? ' focused' : ''}" data-i="${i}" style="--pcolor:${playerColor(i)}">
            <button type="button" class="ds-avatar sm ym-score-band-bubble" data-view="${esc(p.pseudo)}">${PortailProfile.bubbleHTML(scoreAvatars[p.pseudo])}</button>
            <span class="ym-score-band-name">${p.connected ? '' : '⚪ '}${esc(p.pseudo)}</span>
            <b class="ym-score-band-total">${p.total}</b>
        </div>
    `).join('');
    document.querySelectorAll('.ym-score-band').forEach(b => b.addEventListener('click', () => {
        focusedPlayerIndex = Number(b.dataset.i);
        renderScoresStrip(state); renderSheet(state);
    }));
    document.querySelectorAll('.ym-score-band-bubble').forEach(b => b.addEventListener('click', (e) => {
        e.stopPropagation();
        PortailProfile.open(b.dataset.view);
    }));
    PortailProfile.fetchAvatars(s.players.map(p => p.pseudo)).then(a => {
        scoreAvatars = a;
        document.querySelectorAll('.ym-score-band-bubble').forEach(b => { b.innerHTML = PortailProfile.bubbleHTML(a[b.dataset.view]); });
    });
    if (turnChanged) {
        const band = document.querySelector('.ym-score-band.current');
        if (band) { band.classList.add('handoff'); setTimeout(() => band.classList.remove('handoff'), 700); }
    }
}
// Glisser le doigt sur le bandeau de scores pour changer le joueur mis en avant
// dans la feuille en dessous, sans jamais toucher au tour de jeu réel.
(function wireScoreSwipe() {
    const strip = $('scoresStrip');
    let startX = null;
    strip.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
    strip.addEventListener('touchend', (e) => {
        if (startX === null || !state) return;
        const dx = e.changedTouches[0].clientX - startX;
        startX = null;
        if (Math.abs(dx) < 40) return;
        const n = state.players.length;
        focusedPlayerIndex = ((focusedPlayerIndex + (dx < 0 ? 1 : -1)) % n + n) % n;
        renderScoresStrip(state); renderSheet(state);
    }, { passive: true });
})();
let lastDiceKey = null;
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
function runRollAnimation(btn, finalValue, delayMs) {
    // Cycle réellement à travers des valeurs aléatoires, de plus en plus lentement,
    // avant de se stabiliser sur le vrai résultat : ça donne l'impression d'un dé
    // qui roule pour de vrai plutôt qu'un simple sursaut visuel.
    setTimeout(() => {
        btn.classList.add('rolling-spin');
        const face = btn.querySelector('.ym-die-face-wrap');
        const steps = [60, 60, 70, 80, 90, 110, 140, 180];
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
        $('diceRow').querySelectorAll('.ym-die').forEach((b, i) => {
            b.addEventListener('click', () => socket.emit('yams_hold', { index: Number(b.dataset.i) }));
            // On ne fait rouler que les dés qui viennent vraiment d'être relancés (pas ceux gardés).
            if (justRolled && !s.held[i]) runRollAnimation(b, s.dice[i], i * 70);
        });
    }
    $('turnLabel').textContent = isMyTurn ? 'À vous de jouer' : `Au tour de ${s.turnPseudo}`;
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
    document.querySelectorAll('.ym-sheet-row.pending').forEach(r => r.classList.remove('pending'));
}
function selectPending(cat, label, points) {
    pendingCategory = cat; pendingLabel = label; pendingPoints = points;
    pendingDiceKey = state ? state.dice.join(',') : null;
    document.querySelectorAll('.ym-sheet-row').forEach(r => r.classList.toggle('pending', r.dataset.cat === cat));
    $('confirmText').innerHTML = `${esc(label)} : <b>${points}</b> point${points > 1 ? 's' : ''}`;
    if (state) $('confirmDice').innerHTML = state.dice.map(v => diceFaceSvg(v, 'mini', true)).join('');
    $('confirmBar').hidden = false;
}
// Le chiffre s'envole visuellement des dés vers sa case ; si le score est nul (case
// sacrifiée), un petit effet comique de dé qui s'écroule joue à la place.
function flyScoreToCell(cat, points) {
    const row = document.querySelector(`.ym-sheet-row[data-cat="${cat}"]`);
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
    flyScoreToCell(pendingCategory, pendingPoints);
    socket.emit('yams_score', { category: pendingCategory });
    clearPending();
});

let focusedPlayerIndex = 0;
function scoreCellsFor(cat, s) {
    return s.players.map((p, i) => {
        const val = p.scores[cat];
        const focus = i === focusedPlayerIndex ? ' focus' : (s.players.length > 1 ? ' unfocus' : '');
        if (val !== null) return `<span class="ym-score-cell filled${focus}" style="--pcolor:${playerColor(i)}">${val}</span>`;
        return `<span class="ym-score-cell empty${focus}">—</span>`;
    }).join('');
}
function sheetRow(cat, label, iconHtml, withText) {
    const isMyTurn = state && state.turnPseudo === myPseudo;
    const me = state && state.players.find(p => p.pseudo === myPseudo);
    const eligible = isMyTurn && state && state.hasRolled && me && me.scores[cat] === null;
    const glowing = eligible && state.possible && state.possible[cat] > 0;
    const labelInner = withText
        ? `<span class="ym-sheet-row-icon">${iconHtml}</span><span class="ym-sheet-row-text">${label}</span>`
        : (iconHtml || label);
    return `
        <div class="ym-sheet-row${eligible ? ' eligible' : ''}${glowing ? ' glowing' : ''}" data-cat="${cat}">
            <span class="ym-sheet-row-label${withText ? ' combo' : (iconHtml ? '' : ' text')}">${labelInner}</span>
            <span class="ym-sheet-row-cells">${scoreCellsFor(cat, state)}</span>
        </div>`;
}
function renderSheet(s) {
    $('upperRows').innerHTML = UPPER_CATS.map(c => sheetRow(c.key, c.label, diceFaceSvg(c.face, 'small'), false)).join('');
    $('lowerRows').innerHTML = LOWER_CATS.map(c => sheetRow(c.key, c.label, catIconSvg(c.key), true)).join('');
    const upperSums = s.players.map(p => UPPER_KEYS.reduce((sum, k) => sum + (p.scores[k] || 0), 0));
    const lowerKeys = LOWER_CATS.map(c => c.key);
    const lowerSums = s.players.map(p => lowerKeys.reduce((sum, k) => sum + (p.scores[k] || 0), 0) + (p.yamsBonus || 0));
    $('bonusRow').innerHTML = `
        <div class="ym-sheet-row bonus">
            <span class="ym-sheet-row-label text">Bonus <em>(63 pts et +)</em></span>
            <span class="ym-sheet-row-cells">${upperSums.map(u => `<span class="ym-score-cell ${u >= 63 ? 'filled bonus-on' : 'empty'}">${u >= 63 ? '+35' : '—'}</span>`).join('')}</span>
        </div>
        <div class="ym-sheet-row subtotal">
            <span class="ym-sheet-row-label text">Sous-total</span>
            <span class="ym-sheet-row-cells">${upperSums.map(u => `<span class="ym-score-cell filled">${u}</span>`).join('')}</span>
        </div>`;
    $('lowerSubtotalRow').innerHTML = `
        <div class="ym-sheet-row subtotal">
            <span class="ym-sheet-row-label text">Sous-total${s.players.some(p => p.yamsBonus) ? ' (bonus Yams inclus)' : ''}</span>
            <span class="ym-sheet-row-cells">${lowerSums.map(u => `<span class="ym-score-cell filled">${u}</span>`).join('')}</span>
        </div>`;
    document.querySelectorAll('.ym-sheet-row.eligible').forEach(row => row.addEventListener('click', () => {
        const cat = row.dataset.cat;
        const label = [...UPPER_CATS, ...LOWER_CATS].find(c => c.key === cat).label;
        selectPending(cat, label, s.possible[cat]);
    }));
    // Si les dés ont changé depuis la sélection (nouveau lancer), la case en attente n'a plus de sens.
    if (pendingCategory && pendingDiceKey !== s.dice.join(',')) clearPending();
}
$('btn-roll').addEventListener('click', () => { clearPending(); socket.emit('yams_roll'); });


// ---------- Fin de partie ----------
function renderEnded(s) {
    const sorted = [...s.players].sort((a, b) => b.total - a.total);
    $('endTitle').textContent = s.winner === myPseudo ? 'Vous avez gagné !' : `${s.winner} a gagné !`;
    $('endScores').innerHTML = sorted.map((p, i) => `
        <button type="button" class="ds-lb-row${i === 0 ? ' win' : ''}" data-view="${esc(p.pseudo)}">
            <span class="ds-lb-name">${i === 0 ? '🏆 ' : ''}${esc(p.pseudo)}</span><span class="ds-lb-value">${p.total}</span>
        </button>
    `).join('');
    $('endScores').querySelectorAll('.ds-lb-row').forEach(b => b.addEventListener('click', () => PortailProfile.open(b.dataset.view)));
    $('btn-rematch').hidden = myPseudo !== s.host;
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
$('btn-rematch').addEventListener('click', () => socket.emit('yams_rematch'));

// ---------- Routage général selon l'état reçu ----------
let isSpectator = false;
function onState(s) {
    state = s;
    lastGameId = s.id;
    localStorage.setItem(LS_KEY, s.id);
    isSpectator = !s.players.some(p => p.pseudo === myPseudo);
    $('ym-sub').textContent = s.status === 'playing' ? 'Partie en cours' : (s.status === 'ended' ? 'Partie terminée' : `Table de ${s.host}`);
    // Le bouton d'invitation n'a de sens que dans la salle d'attente.
    if (s.status === 'lobby') Invitation.definirTable(s.id); else Invitation.effacer();
    if (s.status === 'lobby') { showView('v-waiting'); renderWaiting(s); }
    else if (s.status === 'playing') {
        showView('v-game');
        $('spectatorBanner').hidden = !isSpectator;
        renderScoresStrip(s);
        renderDice(s);
        renderSheet(s);
    } else if (s.status === 'ended') { showView('v-ended'); renderEnded(s); }
}

connect();