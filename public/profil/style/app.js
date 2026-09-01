const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Délègue au design system plutôt que d'entretenir un second toast.
function toast(msg) { DS.toast(msg); }

// =====================================================================
//  CATALOGUES — copiés depuis chaque jeu (pas de module partagé dans ce
//  site, donc à garder synchronisé si un catalogue change côté jeu).
// =====================================================================
const TILE_THEMES = {
    classique: { name: 'Classique', correct: '#5aa87a', present: '#c9a24a', absent: '#3a3024' },
    ocean:     { name: 'Océan',     correct: '#3a9bc9', present: '#5ac9c2', absent: '#1f3a4a' },
    coucher:   { name: 'Coucher de soleil', correct: '#d9793a', present: '#e0a83e', absent: '#4a2a1f' },
    violet:    { name: 'Violet',    correct: '#8a6bc9', present: '#c98bd9', absent: '#2f2340' },
};
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

// =====================================================================
//  CONFIGURATION — un bloc par jeu personnalisable. Pour ajouter un
//  nouveau jeu ici : une entrée dans ce tableau, un catalogue au-dessus,
//  et si besoin un nouveau "kind" de rendu dans renderSwatch() plus bas.
// =====================================================================
const GAME_STYLES = [
    { id: 'motus', name: 'Motus', emoji: '🟨', kind: 'colors', storageKey: 'motus_tile_theme', catalog: TILE_THEMES, hint: 'La couleur des tuiles de la grille du jour.' },
    { id: 'yams', name: 'Yams', emoji: '🎯', kind: 'dice', storageKey: 'yams_dice_skin', catalog: DICE_SKINS, hint: 'Certains styles se débloquent avec vos victoires ou le nombre de Yams réalisés.' },
];

let myYamsWins = 0, myYamsCount = 0;
function ownsDiceSkin(skin) {
    if (typeof skin.winsRequired === 'number') return myYamsWins >= skin.winsRequired;
    if (typeof skin.yamsRequired === 'number') return myYamsCount >= skin.yamsRequired;
    return true;
}

function renderSwatch(kind, id, def) {
    if (kind === 'colors') {
        return `<span class="st-swatches"><span style="background:${def.correct}"></span><span style="background:${def.present}"></span><span style="background:${def.absent}"></span></span>`;
    }
    if (kind === 'dice') {
        const style = `background:${def.bg};border-radius:18%;${def.border ? 'box-shadow:inset 0 0 0 2px ' + def.border.split(' ').slice(2).join(' ') + ';' : ''}`;
        return `<span class="st-dice-preview" style="${style}"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="9" fill="${def.pip}"/></svg></span>`;
    }
    return '';
}

function renderGame(game) {
    const current = localStorage.getItem(game.storageKey) || Object.keys(game.catalog)[0];
    const cards = Object.entries(game.catalog).map(([id, def]) => {
        const owned = game.kind === 'dice' ? ownsDiceSkin(def) : true;
        const lockLabel = !owned
            ? (typeof def.winsRequired === 'number' ? `🔒 ${def.winsRequired} victoires` : `🔒 ${def.yamsRequired} Yams`)
            : '';
        return `
            <button type="button" class="st-card${id === current ? ' active' : ''}${!owned ? ' locked' : ''}" data-game="${game.id}" data-id="${id}" ${!owned ? 'disabled' : ''}>
                ${renderSwatch(game.kind, id, def)}
                <span class="st-card-name">${esc(def.name)}</span>
                ${lockLabel ? `<span class="st-card-lock">${lockLabel}</span>` : ''}
            </button>`;
    }).join('');
    return `
        <section class="st-section">
            <div class="st-section-head"><span>${game.emoji}</span><h2>${esc(game.name)}</h2></div>
            <p class="st-section-hint">${game.hint}</p>
            <div class="st-grid">${cards}</div>
        </section>`;
}

function renderAll() {
    $('st-wrap').innerHTML = GAME_STYLES.map(renderGame).join('');
    document.querySelectorAll('.st-card:not(.locked)').forEach(b => b.addEventListener('click', () => {
        const game = GAME_STYLES.find(g => g.id === b.dataset.game);
        localStorage.setItem(game.storageKey, b.dataset.id);
        toast(esc(game.catalog[b.dataset.id].name) + ' appliqué.');
        renderAll();
    }));
}

// Les styles de dés Yams se débloquent avec les statistiques réelles du
// joueur : on les récupère depuis le profil du salon avant d'afficher.
(async function loadStatsThenRender() {
    try {
        const res = await fetch('/api/salon/profile');
        const data = await res.json();
        if (data && data.yams) { myYamsWins = data.yams.gamesWon || 0; myYamsCount = data.yams.totalYams || 0; }
    } catch (e) {}
    renderAll();
})();