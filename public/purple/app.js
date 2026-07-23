// =====================================================================
//  PURPLE — tirage de carte aléatoire, sans logique de pari. Le groupe
//  décide à l'oral qui boit et combien : l'app sert juste à tirer.
// =====================================================================
const $ = (id) => document.getElementById(id);

function toast(msg) {
    const el = $('pu-toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(el._t); el._t = setTimeout(() => { el.hidden = true; }, 2400);
}

const SUITS = [
    { s: '♠', color: 'black' }, { s: '♣', color: 'black' },
    { s: '♥', color: 'red' }, { s: '♦', color: 'red' },
];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R', 'A'];

let deck = [];
let deckIndex = 0;
let stats = { drawn: 0, decks: 0 };

function buildDeck() {
    const d = [];
    for (const suit of SUITS) for (const rank of RANKS) d.push({ rank, suit: suit.s, color: suit.color });
    for (let i = d.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [d[i], d[j]] = [d[j], d[i]];
    }
    return d;
}
function updateDeckCount() {
    const left = deck.length - deckIndex;
    $('pu-deck-count').textContent = left + (left === 1 ? ' carte restante' : ' cartes restantes');
}
function showCard(card) {
    const front = $('pu-card-front');
    front.className = 'pu-card-face pu-card-front is-' + card.color;
    front.innerHTML = `<span class="pu-rank">${card.rank}</span><span class="pu-suit">${card.suit}</span>`;
    requestAnimationFrame(() => $('pu-card').classList.add('flipped'));
}

function draw() {
    if (deckIndex >= deck.length) {
        deck = buildDeck();
        deckIndex = 0;
        stats.decks++;
        toast('Nouveau paquet mélangé !');
    }
    const card = deck[deckIndex];
    deckIndex++;
    stats.drawn++;
    updateDeckCount();
    saveStats();
    renderStats();

    const cardEl = $('pu-card');
    if (cardEl.classList.contains('flipped')) {
        cardEl.classList.remove('flipped');
        setTimeout(() => showCard(card), 260);
    } else {
        showCard(card);
    }
    $('btn-draw').textContent = 'Carte suivante';
}
$('btn-draw').addEventListener('click', draw);
$('pu-card').addEventListener('click', draw);

function saveStats() { localStorage.setItem('purple_stats', JSON.stringify(stats)); }
function renderStats() {
    $('stat-drawn').textContent = stats.drawn;
    $('stat-decks').textContent = stats.decks;
}
$('btn-reset-stats').addEventListener('click', () => {
    stats = { drawn: 0, decks: 0 };
    saveStats();
    renderStats();
    toast('Statistiques remises à zéro.');
});

// ---------- Démarrage ----------
document.body.className = 'is-ready';
try {
    const raw = localStorage.getItem('purple_stats');
    if (raw) stats = { ...stats, ...JSON.parse(raw) };
} catch (e) {}
renderStats();
deck = buildDeck();
deckIndex = 0;
updateDeckCount();