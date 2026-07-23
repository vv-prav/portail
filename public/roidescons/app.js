// =====================================================================
//  ROI DES CONS — jeu de cartes local, pas de compte de joueurs : c'est
//  la personne qui tient le téléphone qui tire et applique la règle.
// =====================================================================
const $ = (id) => document.getElementById(id);

function toast(msg) {
    const el = $('rc-toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(el._t); el._t = setTimeout(() => { el.hidden = true; }, 2600);
}

const SUITS = [
    { s: '♠', color: 'black' }, { s: '♣', color: 'black' },
    { s: '♥', color: 'red' }, { s: '♦', color: 'red' },
];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R', 'A'];

// Une règle par rang (les 4 cartes du même rang déclenchent la même règle).
const RULES = {
    'A': { title: 'Cascade !', text: "Tout le monde boit en même temps, en commençant par toi. Personne ne s'arrête tant que la personne précédente boit." },
    '2': { title: 'Toi', text: 'Désigne quelqu\u2019un du doigt : il boit.' },
    '3': { title: 'Moi', text: 'Tu bois.' },
    '4': { title: 'Filles', text: 'Toutes les filles boivent.' },
    '5': { title: 'Gars', text: 'Tous les garçons boivent.' },
    '6': { title: 'Maître du Pouce', text: 'Tu deviens Maître du Pouce : pose ton pouce sur la table quand tu veux, le dernier à suivre boit. Ce statut dure jusqu\u2019au prochain 6.', needsInput: true, inputLabel: 'Qui devient Maître du Pouce ?', kind: 'thumb' },
    '7': { title: 'Ciel', text: 'Tout le monde lève la main vers le ciel. Le dernier à lever la main boit.' },
    '8': { title: 'Duo', text: 'Choisis un binôme : il boit chaque fois que tu bois, jusqu\u2019à la fin de la partie.', needsInput: true, inputLabel: 'Avec qui ?', kind: 'duo' },
    '9': { title: 'Rimes', text: 'Dis un mot. Chacun à son tour doit dire un mot qui rime. Le premier qui bloque boit.' },
    '10': { title: 'Catégorie', text: 'Choisis une catégorie. Tour de table, chacun cite un élément. Le premier qui bloque boit.' },
    'V': { title: 'Nouvelle règle', text: 'Instaure une règle qui dure jusqu\u2019à la fin de la partie. Quiconque l\u2019enfreint boit.', needsInput: true, inputLabel: 'La règle ?', kind: 'rule' },
    'D': { title: 'Maître des Questions', text: 'Jusqu\u2019à la prochaine Dame, si quelqu\u2019un répond à une de tes questions, il boit.', needsInput: true, inputLabel: 'Qui devient Maître ?', kind: 'qm' },
};

let deck = [];
let deckIndex = 0;
let pendingKind = null;
let state = { kingCount: 0, rules: [], questionMaster: null, thumbMaster: null, duos: [] };

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
    $('rc-deck-count').textContent = left + (left === 1 ? ' carte restante' : ' cartes restantes');
}
function saveState() { localStorage.setItem('rc_state', JSON.stringify(state)); }
function loadState() {
    try {
        const raw = localStorage.getItem('rc_state');
        if (raw) state = { ...state, ...JSON.parse(raw) };
    } catch (e) {}
}

function renderCup() {
    document.querySelectorAll('.rc-cup-dot').forEach(dot => {
        dot.classList.toggle('filled', Number(dot.dataset.i) < state.kingCount);
    });
}

function drawKingEffect() {
    state.kingCount++;
    if (state.kingCount >= 4) {
        saveState();
        return { title: 'Roi des Cons', text: 'Verse une dernière gorgée dans la coupe du Roi… et c\u2019est le 4e Roi !', fourth: true };
    }
    saveState();
    return { title: 'Roi des Cons', text: `Verse une gorgée de ta boisson dans la coupe du Roi. (${state.kingCount}/4 Rois tirés)` };
}

function renderStatusPanel() {
    $('status-rules').innerHTML = state.rules.length
        ? state.rules.map(r => `<div class="rc-status-item">${esc(r)}</div>`).join('')
        : '<p class="rc-status-empty">Aucune pour l\u2019instant.</p>';
    $('status-qm').innerHTML = (state.questionMaster || state.thumbMaster)
        ? [
            state.questionMaster ? `<div class="rc-status-item">👑 Questions : ${esc(state.questionMaster)}</div>` : '',
            state.thumbMaster ? `<div class="rc-status-item">👍 Pouce : ${esc(state.thumbMaster)}</div>` : '',
          ].join('')
        : '<p class="rc-status-empty">Personne pour l\u2019instant.</p>';
    $('status-duos').innerHTML = state.duos.length
        ? state.duos.map(d => `<div class="rc-status-item">🔗 ${esc(d)}</div>`).join('')
        : '<p class="rc-status-empty">Aucun pour l\u2019instant.</p>';
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function draw() {
    if (deckIndex >= deck.length) { deck = buildDeck(); deckIndex = 0; toast('Nouveau paquet mélangé !'); }
    const card = deck[deckIndex];
    deckIndex++;
    updateDeckCount();

    const front = $('rc-card-front');
    front.className = 'rc-card-face rc-card-front is-' + card.color;
    front.innerHTML = `<span class="rc-rank">${card.rank}</span><span class="rc-suit">${card.suit}</span>`;
    $('btn-draw').hidden = true;
    $('rc-card').classList.add('flipped');

    setTimeout(() => {
        const rule = card.rank === 'R' ? drawKingEffect() : RULES[card.rank];
        $('rc-result-title').textContent = rule.title;
        $('rc-result-text').textContent = rule.text;
        const showInput = card.rank !== 'R' && rule.needsInput;
        $('rc-input-row').hidden = !showInput;
        $('rc-input').value = '';
        if (showInput) $('rc-input').placeholder = rule.inputLabel;
        pendingKind = showInput ? rule.kind : null;
        $('rc-result').hidden = false;
        renderCup();
        if (card.rank === 'R' && rule.fourth) {
            state.kingCount = 0;
            saveState();
            setTimeout(() => { renderCup(); $('v-cup-full').hidden = false; }, 550);
        }
    }, 600);
}
$('btn-draw').addEventListener('click', draw);

$('btn-input-save').addEventListener('click', () => {
    const val = $('rc-input').value.trim();
    if (!val) { toast('Écris quelque chose, ou passe directement à la carte suivante.'); return; }
    if (pendingKind === 'rule') state.rules.push(val);
    else if (pendingKind === 'qm') state.questionMaster = val;
    else if (pendingKind === 'thumb') state.thumbMaster = val;
    else if (pendingKind === 'duo') state.duos.push(val);
    saveState();
    renderStatusPanel();
    $('rc-input-row').hidden = true;
    toast('Enregistré — visible dans 📜 Règles actives.');
});
$('rc-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('btn-input-save').click(); } });

$('btn-next').addEventListener('click', () => {
    $('rc-card').classList.remove('flipped');
    $('btn-draw').hidden = false;
    $('btn-draw').textContent = 'Carte suivante';
    $('rc-result').hidden = true;
});

$('btn-status').addEventListener('click', () => { renderStatusPanel(); $('v-status').hidden = false; });
$('btn-status-close').addEventListener('click', () => { $('v-status').hidden = true; });
$('btn-cup-full-ok').addEventListener('click', () => { $('v-cup-full').hidden = true; });

$('btn-new-game').addEventListener('click', () => {
    state = { kingCount: 0, rules: [], questionMaster: null, thumbMaster: null, duos: [] };
    saveState();
    renderStatusPanel();
    renderCup();
    deck = buildDeck();
    deckIndex = 0;
    updateDeckCount();
    $('rc-card').classList.remove('flipped');
    $('btn-draw').hidden = false;
    $('btn-draw').textContent = 'Tirer une carte';
    $('rc-result').hidden = true;
    toast('Nouvelle partie — règles et statuts remis à zéro.');
});

// ---------- Démarrage ----------
document.body.className = 'is-ready';
loadState();
renderStatusPanel();
renderCup();
deck = buildDeck();
deckIndex = 0;
updateDeckCount();