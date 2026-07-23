// =====================================================================
//  AUTOROUTE — jeu de cartes local, pas de compte de joueurs : c'est la
//  personne qui tient le téléphone qui avance et applique les effets.
// =====================================================================
const $ = (id) => document.getElementById(id);

function toast(msg) {
    const el = $('au-toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(el._t); el._t = setTimeout(() => { el.hidden = true; }, 2600);
}

const SUITS = [
    { s: '♠', color: 'black' }, { s: '♣', color: 'black' },
    { s: '♥', color: 'red' }, { s: '♦', color: 'red' },
];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R', 'A'];

let deck = [];
let deckIndex = 0;
let position = 0;
let settings = { intensity: 1, roadLength: 12 };
let stats = { routes: 0, sips: 0 };

function buildDeck() {
    const d = [];
    for (const suit of SUITS) for (const rank of RANKS) d.push({ rank, suit: suit.s, color: suit.color });
    for (let i = d.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [d[i], d[j]] = [d[j], d[i]];
    }
    return d;
}
function sips(base) { return Math.max(1, Math.round(base * settings.intensity)); }
function effectFor(card) {
    switch (card.rank) {
        case 'V': { const n = sips(3); return { title: 'Distribution !', text: `Distribue ${n} gorgée${n > 1 ? 's' : ''}.`, sips: n }; }
        case 'D': { const n = sips(2); return { title: 'Question piège', text: `Pose une question à quelqu'un — la première personne qui répond boit ${n} gorgée${n > 1 ? 's' : ''}.`, sips: n }; }
        case 'R': { const n = sips(5); return { title: 'Roi de la route', text: `Tu es Roi de la route : distribue ${n} gorgées.`, sips: n }; }
        case 'A': { const n = sips(4); return { title: 'Bout de la route !', text: `Cul sec, ou bois ${n} gorgées si tu préfères y aller doucement.`, sips: n }; }
        default: { const n = sips(Number(card.rank)); return { title: 'Sur la route', text: `Bois ${n} gorgée${n > 1 ? 's' : ''}.`, sips: n }; }
    }
}

function newRoad(announce) {
    deck = buildDeck();
    deckIndex = 0;
    position = 0;
    renderRoad();
    resetCardVisual();
    if (announce) toast('Nouvelle autoroute tracée !');
}
function renderRoad() {
    let html = '';
    for (let i = 0; i < settings.roadLength; i++) {
        html += `<div class="au-marker ${i < position ? 'done' : ''} ${i === position ? 'current' : ''}"></div>`;
        if (i < settings.roadLength - 1) html += `<div class="au-road-line ${i < position ? 'done' : ''}"></div>`;
    }
    $('au-road').innerHTML = html;
    $('au-progress').textContent = `Borne ${position + 1} / ${settings.roadLength}`;
}
function resetCardVisual() {
    $('au-card').classList.remove('flipped');
    $('btn-flip').hidden = false;
    $('au-result').hidden = true;
}

function flipCard() {
    if (deckIndex >= deck.length) { deck = buildDeck(); deckIndex = 0; }
    const card = deck[deckIndex];
    deckIndex++;

    const front = $('au-card-front');
    front.className = 'au-card-face au-card-front is-' + card.color;
    front.innerHTML = `<span class="au-rank">${card.rank}</span><span class="au-suit">${card.suit}</span>`;

    $('btn-flip').hidden = true;
    $('au-card').classList.add('flipped');

    setTimeout(() => {
        const eff = effectFor(card);
        stats.sips += eff.sips;
        saveStats();
        renderStats();
        $('au-result-title').textContent = eff.title;
        $('au-result-text').textContent = eff.text;
        $('au-result').hidden = false;
    }, 650);
}
$('btn-flip').addEventListener('click', flipCard);
$('au-card').addEventListener('click', () => { if (!$('btn-flip').hidden) flipCard(); });

$('btn-next').addEventListener('click', () => {
    position++;
    if (position >= settings.roadLength) {
        stats.routes++;
        saveStats();
        renderStats();
        newRoad(true);
    } else {
        renderRoad();
        resetCardVisual();
    }
});

function loadSettings() {
    try {
        const raw = localStorage.getItem('au_settings');
        if (raw) settings = { ...settings, ...JSON.parse(raw) };
    } catch (e) {}
    try {
        const raw = localStorage.getItem('au_stats');
        if (raw) stats = { ...stats, ...JSON.parse(raw) };
    } catch (e) {}
    document.querySelectorAll('#opt-intensity button').forEach(b => b.classList.toggle('on', Number(b.dataset.v) === settings.intensity));
    document.querySelectorAll('#opt-length button').forEach(b => b.classList.toggle('on', Number(b.dataset.v) === settings.roadLength));
    renderStats();
}
function saveSettings() { localStorage.setItem('au_settings', JSON.stringify(settings)); }
function saveStats() { localStorage.setItem('au_stats', JSON.stringify(stats)); }
function renderStats() {
    $('stat-routes').textContent = stats.routes;
    $('stat-sips').textContent = stats.sips;
}

$('btn-settings').addEventListener('click', () => { $('v-settings').hidden = false; });
$('btn-settings-close').addEventListener('click', () => { $('v-settings').hidden = true; });
document.querySelectorAll('#opt-intensity button').forEach(b => b.addEventListener('click', () => {
    settings.intensity = Number(b.dataset.v);
    document.querySelectorAll('#opt-intensity button').forEach(x => x.classList.toggle('on', x === b));
    saveSettings();
}));
document.querySelectorAll('#opt-length button').forEach(b => b.addEventListener('click', () => {
    settings.roadLength = Number(b.dataset.v);
    document.querySelectorAll('#opt-length button').forEach(x => x.classList.toggle('on', x === b));
    saveSettings();
    newRoad(true);
}));
$('btn-reset-stats').addEventListener('click', () => {
    stats = { routes: 0, sips: 0 };
    saveStats();
    renderStats();
    toast('Statistiques remises à zéro.');
});

// ---------- Démarrage ----------
document.body.className = 'is-ready';
loadSettings();
newRoad(false);