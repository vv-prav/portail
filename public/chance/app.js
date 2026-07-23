// =====================================================================
//  CHANCE — trois façons de faire un choix au hasard : dé, carte, pièce.
// =====================================================================
const $ = (id) => document.getElementById(id);

let mode = 'dice';
let rolling = false;

// ---------- Carte (paquet mélangé, comme les autres jeux de cartes) ----------
const SUITS = [
    { s: '♠', color: 'black' }, { s: '♣', color: 'black' },
    { s: '♥', color: 'red' }, { s: '♦', color: 'red' },
];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R', 'A'];
let deck = [];
let deckIndex = 0;
function buildDeck() {
    const d = [];
    for (const suit of SUITS) for (const rank of RANKS) d.push({ rank, suit: suit.s, color: suit.color });
    for (let i = d.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [d[i], d[j]] = [d[j], d[i]];
    }
    return d;
}

const GO_LABEL = { dice: 'Lancer le dé', card: 'Tirer une carte', coin: 'Lancer la pièce' };

function setMode(m) {
    mode = m;
    document.querySelectorAll('.ch-mode').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
    ['dice', 'card', 'coin'].forEach(p => { $('panel-' + p).hidden = p !== m; });
    $('ch-result').textContent = '\u00a0';
    $('btn-go').textContent = GO_LABEL[m];
}
document.querySelectorAll('.ch-mode').forEach(b => b.addEventListener('click', () => { if (!rolling) setMode(b.dataset.mode); }));

function lockDuring(ms, fn) {
    rolling = true;
    $('btn-go').disabled = true;
    fn();
    setTimeout(() => { rolling = false; $('btn-go').disabled = false; }, ms);
}

function rollDice() {
    const die = $('ch-die');
    die.classList.remove('rolling'); void die.offsetWidth;
    die.classList.add('rolling');
    $('ch-result').textContent = '\u00a0';
    let ticks = 0;
    const spin = setInterval(() => {
        die.className = 'ch-die rolling v' + (1 + Math.floor(Math.random() * 6));
        ticks++;
        if (ticks > 7) {
            clearInterval(spin);
            const final = 1 + Math.floor(Math.random() * 6);
            die.className = 'ch-die v' + final;
            $('ch-result').textContent = `Résultat : ${final}`;
        }
    }, 70);
}

function drawCard() {
    if (deckIndex >= deck.length) { deck = buildDeck(); deckIndex = 0; }
    const card = deck[deckIndex];
    deckIndex++;
    const front = $('ch-card-front');
    front.className = 'ch-card-face ch-card-front is-' + card.color;
    front.innerHTML = `<span class="ch-rank">${card.rank}</span><span class="ch-suit">${card.suit}</span>`;
    const el = $('ch-card');
    el.classList.remove('flipped');
    $('ch-result').textContent = '\u00a0';
    requestAnimationFrame(() => {
        setTimeout(() => {
            el.classList.add('flipped');
            setTimeout(() => { $('ch-result').textContent = `Carte : ${card.rank} ${card.suit}`; }, 550);
        }, 60);
    });
}

let coinTurns = 0;
function flipCoin() {
    const pile = Math.random() < 0.5;
    coinTurns += 4; // tours complets supplémentaires pour l'effet, + le résultat final
    const finalAngle = coinTurns * 360 + (pile ? 0 : 180);
    $('ch-coin').style.transform = `rotateY(${finalAngle}deg)`;
    $('ch-result').textContent = '\u00a0';
    setTimeout(() => { $('ch-result').textContent = pile ? 'Résultat : Pile' : 'Résultat : Face'; }, 1150);
}

$('btn-go').addEventListener('click', () => {
    if (rolling) return;
    if (mode === 'dice') lockDuring(620, rollDice);
    else if (mode === 'card') lockDuring(650, drawCard);
    else if (mode === 'coin') lockDuring(1200, flipCoin);
});

// ---------- Démarrage ----------
document.body.className = 'is-ready';
deck = buildDeck();
$('ch-die').className = 'ch-die v1';