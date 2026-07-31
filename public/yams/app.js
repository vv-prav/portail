const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg) {
    const el = $('ym-toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.hidden = true; }, 2600);
}

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

// Un petit dé SVG avec les points au bon endroit, réutilisé partout.
const PIP_LAYOUTS = {
    1: [[50, 50]],
    2: [[28, 28], [72, 72]],
    3: [[28, 28], [50, 50], [72, 72]],
    4: [[28, 28], [72, 28], [28, 72], [72, 72]],
    5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
    6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]],
};
function diceFaceSvg(n, extraClass) {
    const pips = PIP_LAYOUTS[n] || [];
    return `<svg viewBox="0 0 100 100" class="ym-die-face ${extraClass || ''}">
        <rect x="4" y="4" width="92" height="92" rx="18" class="ym-die-body"/>
        <ellipse cx="30" cy="20" rx="22" ry="10" class="ym-die-shine"/>
        ${pips.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9"/>`).join('')}
    </svg>`;
}

let socket = null, state = null, myPseudo = null, lastGameId = null;
const LS_KEY = 'yams_last_game';

// ---------- Grande célébration plein écran quand quelqu'un fait un Yams ----------
const CONFETTI_COLORS = ['#d9a94e', '#ecca82', '#efe4cf', '#5aa87a', '#d2624a'];
function playCelebration(pseudo, bonus) {
    const el = $('ymCelebration');
    const field = $('ymConfetti');
    $('ymCelebrationWho').textContent = pseudo === myPseudo ? 'Vous venez de faire un Yams !' : `${pseudo} vient de faire un Yams !`;
    $('ymCelebrationBonus').hidden = !bonus;
    field.innerHTML = '';
    const count = 90;
    for (let i = 0; i < count; i++) {
        const bit = document.createElement('span');
        bit.className = 'ym-confetti-bit';
        bit.style.left = Math.random() * 100 + '%';
        bit.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
        bit.style.animationDelay = (Math.random() * .6) + 's';
        bit.style.animationDuration = (1.8 + Math.random() * 1.2) + 's';
        bit.style.setProperty('--drift', (Math.random() * 140 - 70) + 'px');
        bit.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
        field.appendChild(bit);
    }
    el.classList.add('on');
    if (navigator.vibrate) { try { navigator.vibrate([30, 60, 30, 60, 120]); } catch (e) {} }
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.classList.remove('on'); field.innerHTML = ''; }, 3400);
}

function connect() {
    socket = io();
    socket.on('connect', () => {
        socket.emit('yams_identify', (res) => {
            if (!res || !res.ok) { toast('Reconnecte-toi au salon.'); return; }
            myPseudo = res.pseudo;
            const saved = localStorage.getItem(LS_KEY);
            if (saved) { lastGameId = saved; socket.emit('yams_join', { id: saved }); }
            else socket.emit('yams_list');
        });
    });
    socket.on('yams_games', renderLobby);
    socket.on('yams_state', onState);
    socket.on('yams_celebration', ({ pseudo, bonus }) => playCelebration(pseudo, bonus));
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
function renderLobby(games) {
    $('lobby-empty-label').hidden = !!games.length;
    $('ym-tables').innerHTML = games.map(g => `
        <button type="button" class="ym-table-row" data-id="${g.id}">
            <span class="ym-table-main">
                <span class="ym-table-host">${esc(g.host)}</span>
                <span class="ym-table-meta">${g.status === 'playing' ? '🔴 En cours' : 'En attente'} · ${g.alive}/${g.players} joueurs</span>
            </span>
            <span class="ym-table-join">Rejoindre ›</span>
        </button>
    `).join('');
    $('ym-tables').querySelectorAll('.ym-table-row').forEach(b => b.addEventListener('click', () => {
        socket.emit('yams_join', { id: b.dataset.id });
    }));
}
$('btn-create').addEventListener('click', () => socket.emit('yams_create'));
socket_list_poll();
function socket_list_poll() {
    setInterval(() => { if (socket && socket.connected && !$('v-lobby').hidden) socket.emit('yams_list'); }, 5000);
}

// ---------- Salle d'attente ----------
function renderWaiting(s) {
    $('wait-players').innerHTML = s.players.map(p => `
        <div class="ym-wait-chip">${p.connected ? '🟢' : '⚪'} ${esc(p.pseudo)}${p.pseudo === s.host ? ' (hôte)' : ''}</div>
    `).join('');
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
function renderScoresStrip(s) {
    $('scoresStrip').innerHTML = s.players.map(p => `
        <div class="ym-score-band${p.pseudo === s.turnPseudo ? ' current' : ''}">
            <span class="ym-score-band-name">${p.connected ? '' : '⚪ '}${esc(p.pseudo)}</span>
            <b class="ym-score-band-total">${p.total}</b>
        </div>
    `).join('');
}
let lastDiceKey = null;
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
                ${diceFaceSvg(v)}
            </button>
        `).join('');
        $('diceRow').querySelectorAll('.ym-die').forEach((b, i) => {
            b.addEventListener('click', () => socket.emit('yams_hold', { index: Number(b.dataset.i) }));
            // On ne fait rouler que les dés qui viennent vraiment d'être relancés (pas ceux gardés).
            if (justRolled && !s.held[i]) {
                b.style.animationDelay = (i * 60) + 'ms';
                b.classList.add('rolling');
                setTimeout(() => b.classList.remove('rolling'), 800 + i * 60);
            }
        });
    }
    $('turnLabel').textContent = isMyTurn ? 'À vous de jouer' : `Au tour de ${s.turnPseudo}`;
    $('btn-roll').disabled = !isMyTurn || s.rollsLeft <= 0;
    $('btn-roll').textContent = s.rollsLeft === 3 ? 'Lancer les dés' : 'Relancer';
    $('rollsLeft').textContent = s.hasRolled ? `${s.rollsLeft} lancer${s.rollsLeft > 1 ? 's' : ''} restant${s.rollsLeft > 1 ? 's' : ''}` : '3 lancers disponibles';
}

// ---------- Choisir une catégorie : toute la rangée est cliquable, mais rien n'est
// noté avant confirmation en bas, pour éviter toute erreur au tap. ----------
let pendingCategory = null, pendingLabel = '', pendingDiceKey = null;
function clearPending() {
    pendingCategory = null;
    $('confirmBar').hidden = true;
    document.querySelectorAll('.ym-sheet-row.pending').forEach(r => r.classList.remove('pending'));
}
function selectPending(cat, label, points) {
    pendingCategory = cat; pendingLabel = label;
    pendingDiceKey = state ? state.dice.join(',') : null;
    document.querySelectorAll('.ym-sheet-row').forEach(r => r.classList.toggle('pending', r.dataset.cat === cat));
    $('confirmText').innerHTML = `${esc(label)} : <b>${points}</b> point${points > 1 ? 's' : ''}`;
    $('confirmBar').hidden = false;
}
$('confirmCancel').addEventListener('click', clearPending);
$('confirmOk').addEventListener('click', () => {
    if (!pendingCategory) return;
    socket.emit('yams_score', { category: pendingCategory });
    clearPending();
});

function scoreCellsFor(cat, s) {
    return s.players.map(p => {
        const val = p.scores[cat];
        if (val !== null) return `<span class="ym-score-cell filled">${val}</span>`;
        return `<span class="ym-score-cell empty">—</span>`;
    }).join('');
}
function sheetRow(cat, label, labelHtml) {
    const isMyTurn = state && state.turnPseudo === myPseudo;
    const me = state && state.players.find(p => p.pseudo === myPseudo);
    const eligible = isMyTurn && state && state.hasRolled && me && me.scores[cat] === null;
    return `
        <div class="ym-sheet-row${eligible ? ' eligible' : ''}" data-cat="${cat}">
            <span class="ym-sheet-row-label${labelHtml ? '' : ' text'}">${labelHtml || label}</span>
            <span class="ym-sheet-row-cells">${scoreCellsFor(cat, state)}</span>
        </div>`;
}
function renderSheet(s) {
    $('upperRows').innerHTML = UPPER_CATS.map(c => sheetRow(c.key, c.label, diceFaceSvg(c.face, 'small'))).join('');
    $('lowerRows').innerHTML = LOWER_CATS.map(c => sheetRow(c.key, c.label)).join('');
    const upperSums = s.players.map(p => UPPER_KEYS.reduce((sum, k) => sum + (p.scores[k] || 0), 0));
    const lowerKeys = LOWER_CATS.map(c => c.key);
    const lowerSums = s.players.map(p => lowerKeys.reduce((sum, k) => sum + (p.scores[k] || 0), 0) + (p.yamsBonus || 0));
    $('bonusRow').innerHTML = `
        <div class="ym-sheet-row subtotal">
            <span class="ym-sheet-row-label text">Sous-total</span>
            <span class="ym-sheet-row-cells">${upperSums.map(u => `<span class="ym-score-cell filled">${u}</span>`).join('')}</span>
        </div>
        <div class="ym-sheet-row bonus">
            <span class="ym-sheet-row-label text">Bonus <em>(63 pts et +)</em></span>
            <span class="ym-sheet-row-cells">${upperSums.map(u => `<span class="ym-score-cell ${u >= 63 ? 'filled bonus-on' : 'empty'}">${u >= 63 ? '+35' : '—'}</span>`).join('')}</span>
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
        <div class="ym-end-row${i === 0 ? ' win' : ''}">
            <span>${i === 0 ? '🏆 ' : ''}${esc(p.pseudo)}</span><b>${p.total}</b>
        </div>
    `).join('');
    $('btn-rematch').hidden = myPseudo !== s.host;
}
$('btn-rematch').addEventListener('click', () => socket.emit('yams_rematch'));

// ---------- Routage général selon l'état reçu ----------
function onState(s) {
    state = s;
    lastGameId = s.id;
    localStorage.setItem(LS_KEY, s.id);
    $('ym-sub').textContent = s.status === 'playing' ? 'Partie en cours' : (s.status === 'ended' ? 'Partie terminée' : `Table de ${s.host}`);
    if (s.status === 'lobby') { showView('v-waiting'); renderWaiting(s); }
    else if (s.status === 'playing') {
        showView('v-game');
        renderScoresStrip(s);
        renderDice(s);
        renderSheet(s);
    } else if (s.status === 'ended') { showView('v-ended'); renderEnded(s); }
}

connect();