// =====================================================================
//  ROUGE OU NOIR — jeu de cartes local, pas de compte de joueurs :
//  c'est la personne qui tient le téléphone qui devine et retourne.
// =====================================================================
const $ = (id) => document.getElementById(id);

function toast(msg) {
    const el = $('rn-toast');
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
let stats = { correct: 0, wrong: 0, sips: 0 };
let settings = { sipsCorrect: 2, sipsWrong: 1 };
let pendingGuess = null;

function buildDeck() {
    const d = [];
    for (const suit of SUITS) for (const rank of RANKS) d.push({ rank, suit: suit.s, color: suit.color });
    // Fisher-Yates
    for (let i = d.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [d[i], d[j]] = [d[j], d[i]];
    }
    return d;
}
function newShoe(announce) {
    deck = buildDeck();
    deckIndex = 0;
    updateDeckCount();
    if (announce) toast('Nouveau paquet mélangé !');
}
function updateDeckCount() {
    const left = deck.length - deckIndex;
    $('rn-deck-count').textContent = left + (left === 1 ? ' carte restante' : ' cartes restantes');
}

function loadSettings() {
    try {
        const raw = localStorage.getItem('rn_settings');
        if (raw) settings = { ...settings, ...JSON.parse(raw) };
    } catch (e) {}
    try {
        const raw = localStorage.getItem('rn_stats');
        if (raw) stats = { ...stats, ...JSON.parse(raw) };
    } catch (e) {}
    document.querySelectorAll('#opt-sips-correct button').forEach(b => b.classList.toggle('on', Number(b.dataset.v) === settings.sipsCorrect));
    document.querySelectorAll('#opt-sips-wrong button').forEach(b => b.classList.toggle('on', Number(b.dataset.v) === settings.sipsWrong));
    renderStats();
}
function saveSettings() { localStorage.setItem('rn_settings', JSON.stringify(settings)); }
function saveStats() { localStorage.setItem('rn_stats', JSON.stringify(stats)); }
function renderStats() {
    $('stat-correct').textContent = stats.correct;
    $('stat-wrong').textContent = stats.wrong;
    $('stat-sips').textContent = stats.sips;
}

function resetCardVisual() {
    const card = $('rn-card');
    card.classList.remove('flipped', 'shake');
    $('rn-guess-row').hidden = false;
    $('rn-result').hidden = true;
}

function makeGuess(color) {
    pendingGuess = color;
    if (deckIndex >= deck.length) newShoe(true);
    const card = deck[deckIndex];
    deckIndex++;
    updateDeckCount();

    const front = $('rn-card-front');
    front.className = 'rn-card-face rn-card-front is-' + card.color;
    front.innerHTML = `<span class="rn-rank">${card.rank}</span><span class="rn-suit">${card.suit}</span>`;

    $('rn-guess-row').hidden = true;
    $('rn-card').classList.add('flipped');

    const correct = card.color === pendingGuess;
    setTimeout(() => {
        if (correct) {
            stats.correct++; stats.sips += settings.sipsCorrect;
            $('rn-result-text').className = 'rn-result-text good';
            $('rn-result-text').textContent = `Bien vu ! Distribue ${settings.sipsCorrect} gorgée${settings.sipsCorrect > 1 ? 's' : ''}.`;
        } else {
            stats.wrong++;
            $('rn-card').classList.add('shake');
            $('rn-result-text').className = 'rn-result-text bad';
            $('rn-result-text').textContent = `Raté ! Bois ${settings.sipsWrong} gorgée${settings.sipsWrong > 1 ? 's' : ''}.`;
        }
        saveStats();
        renderStats();
        $('rn-result').hidden = false;
    }, 650);
}

$('btn-guess-red').addEventListener('click', () => makeGuess('red'));
$('btn-guess-black').addEventListener('click', () => makeGuess('black'));
$('btn-next').addEventListener('click', () => {
    resetCardVisual();
    if (deckIndex >= deck.length) newShoe(true);
});

$('btn-settings').addEventListener('click', () => { $('v-settings').hidden = false; });
$('btn-settings-close').addEventListener('click', () => { $('v-settings').hidden = true; });
document.querySelectorAll('#opt-sips-correct button').forEach(b => b.addEventListener('click', () => {
    settings.sipsCorrect = Number(b.dataset.v);
    document.querySelectorAll('#opt-sips-correct button').forEach(x => x.classList.toggle('on', x === b));
    saveSettings();
}));
document.querySelectorAll('#opt-sips-wrong button').forEach(b => b.addEventListener('click', () => {
    settings.sipsWrong = Number(b.dataset.v);
    document.querySelectorAll('#opt-sips-wrong button').forEach(x => x.classList.toggle('on', x === b));
    saveSettings();
}));
$('btn-reset-stats').addEventListener('click', () => {
    stats = { correct: 0, wrong: 0, sips: 0 };
    saveStats();
    renderStats();
    toast('Statistiques remises à zéro.');
});

// ---------- Démarrage ----------
document.body.className = 'is-ready';
loadSettings();
newShoe(false);