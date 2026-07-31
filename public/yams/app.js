const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg) {
    const el = $('ym-toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.hidden = true; }, 2600);
}

// Une couleur par joueur, pour se repérer d'un coup d'œil entre le score en
// haut et ses cases remplies dans la feuille.
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
const BONUS_CONFETTI_COLORS = ['#ecca82', '#ffdf8a', '#ff6b4a', '#d2624a', '#fff2d0'];
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
            const saved = localStorage.getItem(LS_KEY);
            if (saved) { lastGameId = saved; socket.emit('yams_join', { id: saved }); }
            else socket.emit('yams_list');
        });
    });
    socket.on('yams_games', renderLobby);
    socket.on('yams_state', onState);
    socket.on('yams_stats_result', renderStats);
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
function renderStats(data) {
    if (!data) return;
    $('statsGrid').innerHTML = [
        ['Victoires', data.gamesWon],
        ['Parties jouées', data.gamesPlayed],
        ['Taux de réussite', data.winRate === null ? '—' : data.winRate + '%'],
        ['Yams réalisés', data.totalYams],
        ['dont bonus', data.bonusYams],
        ['Meilleur score', data.bestScore],
    ].map(([label, val]) => `<div class="ym-stat-box"><b>${val}</b><span>${label}</span></div>`).join('');
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
$('btn-stats').addEventListener('click', () => { socket.emit('yams_stats'); $('v-stats').hidden = false; });
$('stats-close').addEventListener('click', () => { $('v-stats').hidden = true; });
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
    $('scoresStrip').innerHTML = s.players.map((p, i) => `
        <div class="ym-score-band${p.pseudo === s.turnPseudo ? ' current' : ''}" style="--pcolor:${playerColor(i)}">
            <span class="ym-score-band-name">${p.connected ? '' : '⚪ '}${esc(p.pseudo)}</span>
            <b class="ym-score-band-total">${p.total}</b>
        </div>
    `).join('');
}
let lastDiceKey = null;
function runRollAnimation(btn, finalValue, delayMs) {
    // Cycle réellement à travers des valeurs aléatoires, de plus en plus lentement,
    // avant de se stabiliser sur le vrai résultat : ça donne l'impression d'un dé
    // qui roule pour de vrai plutôt qu'un simple sursaut visuel.
    setTimeout(() => {
        btn.classList.add('rolling-spin');
        const face = btn.querySelector('.ym-die-face-wrap');
        const steps = [60, 60, 70, 80, 90, 110, 140, 180];
        let i = 0;
        function tick() {
            const val = i < steps.length - 1 ? (1 + Math.floor(Math.random() * 6)) : finalValue;
            if (face) face.innerHTML = diceFaceSvg(val);
            if (i < steps.length - 1) { setTimeout(tick, steps[i]); i++; }
            else {
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
                <span class="ym-die-face-wrap">${diceFaceSvg(v)}</span>
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
    return s.players.map((p, i) => {
        const val = p.scores[cat];
        if (val !== null) return `<span class="ym-score-cell filled" style="--pcolor:${playerColor(i)}">${val}</span>`;
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