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
        <rect x="4" y="4" width="92" height="92" rx="18"/>
        ${pips.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9"/>`).join('')}
    </svg>`;
}

let socket = null, state = null, myPseudo = null, lastGameId = null;
const LS_KEY = 'yams_last_game';

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
        <div class="ym-score-chip${p.pseudo === s.turnPseudo ? ' current' : ''}">
            <span class="ym-score-chip-name">${p.connected ? '' : '⚪ '}${esc(p.pseudo)}</span>
            <b>${p.total}</b>
        </div>
    `).join('');
}
function renderDice(s) {
    const isMyTurn = s.turnPseudo === myPseudo;
    $('diceRow').innerHTML = s.dice.map((v, i) => `
        <button type="button" class="ym-die${s.held[i] ? ' held' : ''}" data-i="${i}" ${(!isMyTurn || !s.hasRolled) ? 'disabled' : ''}>
            ${diceFaceSvg(v)}
        </button>
    `).join('');
    $('diceRow').querySelectorAll('.ym-die').forEach(b => b.addEventListener('click', () => {
        socket.emit('yams_hold', { index: Number(b.dataset.i) });
    }));
    $('turnLabel').textContent = isMyTurn ? 'À vous de jouer' : `Au tour de ${s.turnPseudo}`;
    $('btn-roll').disabled = !isMyTurn || s.rollsLeft <= 0;
    $('btn-roll').textContent = s.rollsLeft === 3 ? 'Lancer les dés' : 'Relancer';
    $('rollsLeft').textContent = s.hasRolled ? `${s.rollsLeft} lancer${s.rollsLeft > 1 ? 's' : ''} restant${s.rollsLeft > 1 ? 's' : ''}` : '3 lancers disponibles';
}
function scoreCellsFor(cat, s) {
    const isMyTurn = s.turnPseudo === myPseudo;
    return s.players.map(p => {
        const val = p.scores[cat];
        if (val !== null) return `<span class="ym-score-cell filled">${val}</span>`;
        if (isMyTurn && p.pseudo === myPseudo && s.hasRolled) {
            return `<button type="button" class="ym-score-cell possible" data-cat="${cat}">${s.possible[cat]}</button>`;
        }
        return `<span class="ym-score-cell empty">—</span>`;
    }).join('');
}
function renderSheet(s) {
    $('upperRows').innerHTML = UPPER_CATS.map(c => `
        <div class="ym-sheet-row">
            <span class="ym-sheet-row-label">${diceFaceSvg(c.face, 'small')}</span>
            <span class="ym-sheet-row-cells">${scoreCellsFor(c.key, s)}</span>
        </div>
    `).join('');
    $('lowerRows').innerHTML = LOWER_CATS.map(c => `
        <div class="ym-sheet-row">
            <span class="ym-sheet-row-label text">${c.label}</span>
            <span class="ym-sheet-row-cells">${scoreCellsFor(c.key, s)}</span>
        </div>
    `).join('');
    const upperSums = s.players.map(p => UPPER_KEYS.reduce((sum, k) => sum + (p.scores[k] || 0), 0));
    $('bonusRow').innerHTML = `
        <div class="ym-sheet-row bonus">
            <span class="ym-sheet-row-label text">Bonus <em>(63 pts et +)</em></span>
            <span class="ym-sheet-row-cells">${upperSums.map(u => `<span class="ym-score-cell ${u >= 63 ? 'filled bonus-on' : 'empty'}">${u >= 63 ? '+35' : '—'}</span>`).join('')}</span>
        </div>`;
    document.querySelectorAll('.ym-score-cell.possible').forEach(b => b.addEventListener('click', () => {
        socket.emit('yams_score', { category: b.dataset.cat });
    }));
}
$('btn-roll').addEventListener('click', () => socket.emit('yams_roll'));

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