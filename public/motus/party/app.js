const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg) { DS.toast(msg); }
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
            // Un lien d'invitation prime sur la dernière course mémorisée.
            const saved = Invitation.tableDuLien() || localStorage.getItem(LS_KEY);
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
document.querySelectorAll('#roundsPicker button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#roundsPicker button').forEach(x => x.classList.toggle('on', x === b));
    chosenRounds = Number(b.dataset.n);
}));
$('btn-create').addEventListener('click', () => socket.emit('motusparty_create', { maxRounds: chosenRounds }));
function renderLobby(games) {
    $('lobby-empty-label').hidden = !!games.length;
    $('mp-tables').innerHTML = games.map(g => `
        <button type="button" class="ds-row" data-id="${g.id}">
            <span class="ds-row-main">
                <span class="ds-row-name">${esc(g.host)}</span>
                <span class="ds-row-sub">${g.status === 'playing' ? `🔴 Manche ${g.round}/${g.maxRounds}` : 'En attente'} · ${g.alive}/${g.players} joueurs${g.spectators ? ` · 👀 ${g.spectators}` : ''}</span>
            </span>
            <span class="ds-row-go">${g.status === 'playing' ? 'Regarder ›' : 'Rejoindre ›'}</span>
        </button>
    `).join('');
    $('mp-tables').querySelectorAll('.ds-row').forEach(b => b.addEventListener('click', () => socket.emit('motusparty_join', { id: b.dataset.id })));
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
    ].map(([label, val]) => `<div class="ds-stat-box"><b>${val}</b><em>${label}</em></div>`).join('');
}

// ---------- Salle d'attente ----------
function renderWaiting(s) {
    $('waitRounds').textContent = s.maxRounds;
    $('wait-players').innerHTML = s.players.map(p => `
        <button type="button" class="ds-waiting-chip${p.connected ? '' : ' off'}" data-view="${esc(p.pseudo)}">
            <span class="ds-avatar sm" data-p="${esc(p.pseudo)}">✦</span>
            ${esc(p.pseudo)}${p.pseudo === s.host ? '<span class="ds-waiting-host">Hôte</span>' : ''}
        </button>
    `).join('');
    $('wait-players').querySelectorAll('.ds-waiting-chip').forEach(b => b.addEventListener('click', () => PortailProfile.open(b.dataset.view)));
    PortailProfile.fetchAvatars(s.players.map(p => p.pseudo)).then(a => {
        $('wait-players').querySelectorAll('.ds-avatar').forEach(el => { el.innerHTML = PortailProfile.bubbleHTML(a[el.dataset.p]); });
    });
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
            <button type="button" class="mp-opp-row${p.solved ? ' solved' : ''}${p.gaveUp ? ' gaveup' : ''}" data-view="${esc(p.pseudo)}">
                <span class="ds-avatar sm" data-p="${esc(p.pseudo)}">✦</span>
                <span class="mp-opp-name">${p.connected ? '' : '⚪ '}${esc(p.pseudo)}</span>
                <span class="mp-opp-dots">${dots}</span>
                ${status}
            </button>`;
    }).join('');
    $('opponents').querySelectorAll('.mp-opp-row').forEach(b => b.addEventListener('click', () => PortailProfile.open(b.dataset.view)));
    PortailProfile.fetchAvatars(others.map(p => p.pseudo)).then(a => {
        $('opponents').querySelectorAll('.ds-avatar').forEach(el => { el.innerHTML = PortailProfile.bubbleHTML(a[el.dataset.p]); });
    });
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
    $('finishWhoTxt').textContent = pseudo === myPseudo ? `Tu as trouvé ! +${points} points` : `${pseudo} a trouvé !`;
    el.classList.remove('on'); void el.offsetWidth;
    el.classList.add('on');
    if (pseudo === myPseudo && navigator.vibrate) { try { navigator.vibrate(rank === 1 ? [40, 60, 40, 60, 150] : [40, 80]); } catch (e) {} }
    setTimeout(() => el.classList.remove('on'), 2400);
    if (pseudo === myPseudo && rank === 1) playBigCelebration('🥇', 'Tu as trouvé en premier !');
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
        <button type="button" class="ds-lb-row${p.pseudo === myPseudo ? ' me' : ''}" data-view="${esc(p.pseudo)}">
            <span class="ds-lb-rank">${p.solved ? rankLabel(p.rank) : '✗'}</span>
            <span class="ds-lb-name">${esc(p.pseudo)}</span>
            <span class="mp-re-tries">${p.triesCount} essai${p.triesCount > 1 ? 's' : ''}</span>
            <span class="ds-lb-value">${p.score} pts</span>
        </button>
    `).join('');
    $('reResults').querySelectorAll('.ds-lb-row').forEach(b => b.addEventListener('click', () => PortailProfile.open(b.dataset.view)));
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
    $('endTitle').textContent = ranking[0] && ranking[0].pseudo === myPseudo ? 'Tu as gagné la course !' : `${ranking[0] ? ranking[0].pseudo : '—'} a gagné la course !`;
    $('endScores').innerHTML = ranking.map((p, i) => `
        <button type="button" class="ds-lb-row${i === 0 ? ' win' : ''}" data-view="${esc(p.pseudo)}">
            <span class="ds-lb-name">${i === 0 ? '🏆 ' : ''}${esc(p.pseudo)}</span><span class="ds-lb-value">${p.score} pts</span>
        </button>
    `).join('');
    $('endScores').querySelectorAll('.ds-lb-row').forEach(b => b.addEventListener('click', () => PortailProfile.open(b.dataset.view)));
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
    // Le bouton d'invitation n'a de sens que dans la salle d'attente.
    if (s.status === 'lobby') Invitation.definirTable(s.id); else Invitation.effacer();
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
        $('guessHint').textContent = isSpectator ? 'Tu regardes la course.' : (finished ? (me.solved ? 'Tu as trouvé, en attente des autres…' : 'Essais épuisés, en attente des autres…') : `Mot de ${s.wordLen} lettres`);
        renderMyGrid(s);
        renderOpponents(s);
    } else if (s.status === 'round_end') { showView('v-round-end'); renderRoundEnd(s); }
    else if (s.status === 'ended') { showView('v-ended'); renderEnded(s); }
}

connect();