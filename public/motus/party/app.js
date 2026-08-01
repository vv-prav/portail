const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg) {
    const el = $('mp-toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.hidden = true; }, 2600);
}
const RANK_EMOJI = ['🥇', '🥈', '🥉'];
function rankLabel(rank) { return RANK_EMOJI[rank - 1] || `${rank}e`; }

let socket = null, state = null, myPseudo = null, chosenRounds = 5;
const LS_KEY = 'motusparty_last_game';

function connect() {
    socket = io();
    socket.on('connect', () => {
        socket.emit('motusparty_identify', (res) => {
            if (!res || !res.ok) { toast('Reconnecte-toi au salon.'); return; }
            myPseudo = res.pseudo;
            const saved = localStorage.getItem(LS_KEY);
            if (saved) socket.emit('motusparty_join', { id: saved });
            else socket.emit('motusparty_list');
        });
    });
    socket.on('motusparty_games', renderLobby);
    socket.on('motusparty_state', onState);
    socket.on('motusparty_finish', onPlayerFinish);
    socket.on('motusparty_stats_result', renderStats);
    socket.on('motusparty_error', (msg) => {
        toast(msg || 'Erreur.');
        if (/existe plus/i.test(msg || '')) { localStorage.removeItem(LS_KEY); showView('v-lobby'); socket.emit('motusparty_list'); }
    });
    socket.on('motusparty_closed', () => { toast('La course a été fermée.'); localStorage.removeItem(LS_KEY); location.href = '/motus/'; });
    socket.on('disconnect', () => toast('Connexion perdue, on retente…'));
}

function showView(id) {
    ['v-lobby', 'v-waiting', 'v-race', 'v-round-end', 'v-ended'].forEach(v => { $(v).hidden = (v !== id); });
}

// ---------- Lobby ----------
document.querySelectorAll('.mp-rounds-opt').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.mp-rounds-opt').forEach(x => x.classList.toggle('active', x === b));
    chosenRounds = Number(b.dataset.n);
}));
$('btn-create').addEventListener('click', () => socket.emit('motusparty_create', { maxRounds: chosenRounds }));
function renderLobby(games) {
    $('lobby-empty-label').hidden = !!games.length;
    $('mp-tables').innerHTML = games.map(g => `
        <button type="button" class="mp-table-row" data-id="${g.id}">
            <span class="mp-table-main">
                <span class="mp-table-host">${esc(g.host)}</span>
                <span class="mp-table-meta">${g.status === 'playing' ? `🔴 Manche ${g.round}/${g.maxRounds}` : 'En attente'} · ${g.alive}/${g.players} joueurs${g.spectators ? ` · 👀 ${g.spectators}` : ''}</span>
            </span>
            <span class="mp-table-join">${g.status === 'playing' ? 'Regarder ›' : 'Rejoindre ›'}</span>
        </button>
    `).join('');
    $('mp-tables').querySelectorAll('.mp-table-row').forEach(b => b.addEventListener('click', () => socket.emit('motusparty_join', { id: b.dataset.id })));
}
setInterval(() => { if (socket && socket.connected && !$('v-lobby').hidden) socket.emit('motusparty_list'); }, 5000);

// ---------- Statistiques ----------
$('btn-stats').addEventListener('click', () => { socket.emit('motusparty_stats'); $('v-stats').hidden = false; });
$('stats-close').addEventListener('click', () => { $('v-stats').hidden = true; });
function renderStats(s) {
    $('statsGrid').innerHTML = [
        ['Courses gagnées', s.matchesWon],
        ['Courses jouées', s.matchesPlayed],
        ['Mots trouvés', s.wordsFound],
        ['Mots ratés', s.wordsMissed],
        ['Meilleur classement', s.bestRank ? rankLabel(s.bestRank) : '—'],
    ].map(([label, val]) => `<div class="mp-stat-box"><b>${val}</b><span>${label}</span></div>`).join('');
}

// ---------- Salle d'attente ----------
function renderWaiting(s) {
    $('waitRounds').textContent = s.maxRounds;
    $('wait-players').innerHTML = s.players.map(p => `
        <div class="mp-wait-chip">${p.connected ? '🟢' : '⚪'} ${esc(p.pseudo)}${p.pseudo === s.host ? ' (hôte)' : ''}</div>
    `).join('');
    const isHost = myPseudo === s.host;
    $('btn-start').hidden = !isHost;
    $('wait-hint').hidden = isHost;
    if (isHost && s.players.length < 2) { $('btn-start').disabled = true; $('btn-start').textContent = 'Il faut au moins 2 joueurs'; }
    else if (isHost) { $('btn-start').disabled = false; $('btn-start').textContent = 'Lancer la course'; }
}
$('btn-start').addEventListener('click', () => socket.emit('motusparty_start'));
$('btn-leave-lobby').addEventListener('click', () => { socket.emit('motusparty_leave'); localStorage.removeItem(LS_KEY); showView('v-lobby'); socket.emit('motusparty_list'); });
$('btn-back-lobby').addEventListener('click', () => { socket.emit('motusparty_leave'); localStorage.removeItem(LS_KEY); showView('v-lobby'); socket.emit('motusparty_list'); });

// ---------- Course en cours ----------
function tileClass(mark) { return mark === 'correct' ? 'correct' : mark === 'present' ? 'present' : 'absent'; }
function renderMyGrid(s) {
    const me = s.players.find(p => p.pseudo === myPseudo);
    const rows = [];
    const guesses = (me && me.guesses) || [];
    for (let i = 0; i < s.maxTries; i++) {
        const g = guesses[i];
        if (g) {
            rows.push(`<div class="mp-row">${g.marks.map((m, j) => `<span class="mp-tile ${tileClass(m)}">${esc(g.word[j])}</span>`).join('')}</div>`);
        } else {
            rows.push(`<div class="mp-row">${Array.from({ length: s.wordLen }, () => `<span class="mp-tile"></span>`).join('')}</div>`);
        }
    }
    $('myGrid').innerHTML = rows.join('');
}
function renderOpponents(s) {
    const others = s.players.filter(p => p.pseudo !== myPseudo);
    $('opponents').innerHTML = others.map(p => {
        const dots = Array.from({ length: s.maxTries }, (_, i) => `<span class="mp-opp-dot${i < p.triesCount ? ' filled' : ''}"></span>`).join('');
        let status = '';
        if (p.solved) status = `<span class="mp-opp-status solved">${rankLabel(p.rank)} +${p.score > 0 ? '' : ''}</span>`;
        else if (p.gaveUp) status = `<span class="mp-opp-status gaveup">✗</span>`;
        return `
            <div class="mp-opp-row${p.solved ? ' solved' : ''}${p.gaveUp ? ' gaveup' : ''}">
                <span class="mp-opp-name">${p.connected ? '' : '⚪ '}${esc(p.pseudo)}</span>
                <span class="mp-opp-dots">${dots}</span>
                ${status}
            </div>`;
    }).join('');
}
const guessForm = $('guessForm');
guessForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = $('guessInput').value.trim().toUpperCase();
    if (!val) return;
    socket.emit('motusparty_guess', { word: val });
    $('guessInput').value = '';
});

// ---------- Bannière de fin quand quelqu'un trouve le mot ----------
function onPlayerFinish({ pseudo, rank, points }) {
    const el = $('finishBanner');
    $('finishRankTxt').textContent = rankLabel(rank);
    $('finishWhoTxt').textContent = pseudo === myPseudo ? `Vous avez trouvé ! +${points} points` : `${pseudo} a trouvé !`;
    el.classList.remove('on'); void el.offsetWidth;
    el.classList.add('on');
    if (pseudo === myPseudo && navigator.vibrate) { try { navigator.vibrate(rank === 1 ? [40, 60, 40, 60, 150] : [40, 80]); } catch (e) {} }
    setTimeout(() => el.classList.remove('on'), 2400);
    if (pseudo === myPseudo && rank === 1) playBigCelebration('🥇', 'Vous avez trouvé en premier !');
}

// ---------- Grosse célébration (1re place, ou victoire finale du match) ----------
const CONFETTI_COLORS = ['#d9a94e', '#ecca82', '#5aa87a', '#c9a24a', '#efe4cf'];
function playBigCelebration(emoji, who) {
    const el = $('mpCelebration'), field = $('mpConfetti');
    $('mpCelebrationWord').textContent = emoji;
    $('mpCelebrationWho').textContent = who;
    field.innerHTML = '';
    for (let i = 0; i < 90; i++) {
        const bit = document.createElement('span');
        bit.className = 'mp-confetti-bit';
        bit.style.left = Math.random() * 100 + '%';
        bit.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
        bit.style.animationDelay = (Math.random() * .6) + 's';
        bit.style.animationDuration = (1.8 + Math.random() * 1.2) + 's';
        bit.style.setProperty('--drift', (Math.random() * 140 - 70) + 'px');
        bit.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
        field.appendChild(bit);
    }
    el.classList.add('on');
    setTimeout(() => { el.classList.remove('on'); field.innerHTML = ''; }, 3000);
}

// ---------- Fin de manche ----------
function renderRoundEnd(s) {
    $('reWord').textContent = s.word || '—';
    $('reDef').textContent = s.wordDef || '';
    const sorted = [...s.players].sort((a, b) => (a.rank || 99) - (b.rank || 99));
    $('reResults').innerHTML = sorted.map(p => `
        <div class="mp-re-row${p.pseudo === myPseudo ? ' me' : ''}">
            <span class="mp-re-rank">${p.solved ? rankLabel(p.rank) : '✗'}</span>
            <span class="mp-re-name">${esc(p.pseudo)}</span>
            <span class="mp-re-tries">${p.triesCount} essai${p.triesCount > 1 ? 's' : ''}</span>
            <span class="mp-re-score">${p.score} pts</span>
        </div>
    `).join('');
    const isHost = myPseudo === s.host;
    const isLast = s.round >= s.maxRounds;
    $('btn-next-round').hidden = !isHost;
    $('btn-next-round').textContent = isLast ? 'Voir le classement final' : 'Manche suivante';
    $('reHint').hidden = isHost;
}
$('btn-next-round').addEventListener('click', () => socket.emit('motusparty_next_round'));

// ---------- Fin de match ----------
function renderEnded(s) {
    const ranking = s.finalRanking || [];
    $('endTitle').textContent = ranking[0] && ranking[0].pseudo === myPseudo ? 'Vous avez gagné la course !' : `${ranking[0] ? ranking[0].pseudo : '—'} a gagné la course !`;
    $('endScores').innerHTML = ranking.map((p, i) => `
        <div class="mp-end-row${i === 0 ? ' win' : ''}">
            <span>${i === 0 ? '🏆 ' : ''}${esc(p.pseudo)}</span><b>${p.score} pts</b>
        </div>
    `).join('');
    $('btn-rematch').hidden = myPseudo !== s.host;
    if (ranking[0] && ranking[0].pseudo === myPseudo) playBigCelebration('🏆', 'Victoire finale !');
}
$('btn-rematch').addEventListener('click', () => socket.emit('motusparty_rematch'));

// ---------- Routage général ----------
let isSpectator = false;
function onState(s) {
    state = s;
    localStorage.setItem(LS_KEY, s.id);
    isSpectator = !s.players.some(p => p.pseudo === myPseudo);
    $('mp-sub').textContent = s.status === 'playing' ? `Manche ${s.round} / ${s.maxRounds}` : (s.status === 'ended' ? 'Course terminée' : `Table de ${s.host}`);
    if (s.status === 'lobby') { showView('v-waiting'); renderWaiting(s); }
    else if (s.status === 'playing') {
        showView('v-race');
        $('mpSpectatorBanner').hidden = !isSpectator;
        $('raceRound').textContent = s.round;
        $('raceMaxRounds').textContent = s.maxRounds;
        $('guessInput').maxLength = s.wordLen;
        const me = s.players.find(p => p.pseudo === myPseudo);
        const finished = !me || me.solved || me.gaveUp;
        $('guessForm').hidden = isSpectator || finished;
        $('guessHint').textContent = isSpectator ? 'Vous regardez la course.' : (finished ? (me.solved ? 'Vous avez trouvé, en attente des autres…' : 'Essais épuisés, en attente des autres…') : `Mot de ${s.wordLen} lettres`);
        renderMyGrid(s);
        renderOpponents(s);
    } else if (s.status === 'round_end') { showView('v-round-end'); renderRoundEnd(s); }
    else if (s.status === 'ended') { showView('v-ended'); renderEnded(s); }
}

connect();