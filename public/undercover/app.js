// =====================================================================
//  INFILTRÉ — client. Deux modes : à distance (socket) et local (passe
//  le téléphone, entièrement géré ici sans le serveur).
// =====================================================================
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg) {
    const el = $('uc-toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(el._t); el._t = setTimeout(() => { el.hidden = true; }, 2600);
}
const ALL_VIEWS = [
    'v-mode', 'v-lobby', 'v-waiting', 'v-speaking', 'v-voting', 'v-result', 'v-ended',
    'v-local-setup', 'v-local-reveal', 'v-local-speaking', 'v-local-vote-pass', 'v-local-result', 'v-local-ended',
];
function showView(id) {
    ALL_VIEWS.forEach(v => { $(v).hidden = (v !== id); });
}
function suggestUcCount(n) {
    if (n >= 9) return 3;
    if (n >= 7) return 2;
    return 1;
}

document.body.className = 'is-ready';
$('mode-remote').addEventListener('click', () => { showView('v-lobby'); initRemote(); });
$('mode-local').addEventListener('click', () => { showView('v-local-setup'); initLocalSetup(); });
$('btn-mode-back').addEventListener('click', () => { $('uc-sub').textContent = 'Choisis comment jouer'; $('myword-band').hidden = true; showView('v-mode'); });
$('btn-mode-back-2').addEventListener('click', () => { $('uc-sub').textContent = 'Choisis comment jouer'; showView('v-mode'); });

// =====================================================================
//  MODE À DISTANCE
// =====================================================================
let socket = null, myPseudo = null, state = null;
let lastGameId = localStorage.getItem('uc_last_game') || null;
let wasDisconnected = false;
let remoteInited = false;

function setLastGameId(id) {
    lastGameId = id;
    if (id) localStorage.setItem('uc_last_game', id); else localStorage.removeItem('uc_last_game');
}

function initRemote() {
    $('uc-sub').textContent = 'Salon des parties';
    if (remoteInited) { if (socket && socket.connected) socket.emit('uc_list'); return; }
    remoteInited = true;
    socket = io();
    socket.on('connect', () => {
        socket.emit('uc_identify', (res) => {
            if (!res || !res.ok) { toast('Session expirée, retourne au salon.'); return; }
            myPseudo = res.pseudo;
            if (lastGameId) {
                socket.emit('uc_join', { id: lastGameId });
                if (wasDisconnected) { toast('Reconnecté — partie resynchronisée.'); wasDisconnected = false; }
            } else {
                socket.emit('uc_list');
            }
        });
    });
    socket.on('uc_games', renderLobby);
    socket.on('uc_state', onState);
    socket.on('uc_error', (msg) => {
        toast(msg || 'Erreur.');
        if (lastGameId && /existe plus/i.test(msg || '')) {
            setLastGameId(null); state = null; showView('v-lobby'); socket.emit('uc_list');
        }
    });
    socket.on('uc_closed', () => { toast('La table a été fermée.'); setLastGameId(null); location.href = '/'; });
    socket.on('disconnect', () => { wasDisconnected = true; toast('Connexion perdue, on retente…'); });
}

function renderLobby(games) {
    if (state) return;   // déjà dans une table : pas la peine de retoucher la liste du lobby
    $('lobby-empty-label').hidden = !!(games && games.length);
    $('uc-tables').innerHTML = (games || []).map(g => `
        <button class="uc-table-row" data-id="${g.id}">
            <span>Table de <b>${esc(g.host)}</b></span>
            <span class="ut-meta">${g.players}/${g.maxPlayers} joueurs</span>
        </button>`).join('');
    $('uc-tables').querySelectorAll('.uc-table-row').forEach(b => b.addEventListener('click', () => {
        socket.emit('uc_join', { id: b.dataset.id });
    }));
}
$('btn-create').addEventListener('click', () => socket.emit('uc_create'));
$('btn-leave-lobby').addEventListener('click', () => {
    socket.emit('uc_leave'); state = null; setLastGameId(null);
    $('uc-round-tag').hidden = true; $('myword-band').hidden = true;
    showView('v-lobby'); socket.emit('uc_list');
});

function onState(s) {
    state = s;
    setLastGameId(s.id);
    $('uc-sub').textContent = 'Table de ' + s.host;
    if (s.status !== 'lobby') { $('uc-round-tag').hidden = false; $('uc-round-tag').textContent = 'Manche ' + s.round; }
    $('myword-band').hidden = !(s.myWord && ['speaking', 'voting', 'result'].includes(s.status));
    if (s.myWord) $('myword-text').textContent = s.myWord;

    if (s.status === 'lobby') { $('uc-round-tag').hidden = true; renderWaiting(s); showView('v-waiting'); }
    else if (s.status === 'speaking') { renderSpeaking(s); showView('v-speaking'); }
    else if (s.status === 'voting') { renderVoting(s); showView('v-voting'); }
    else if (s.status === 'result') { renderResult(s); showView('v-result'); }
    else if (s.status === 'ended') { renderEnded(s); showView('v-ended'); }
}

function renderWaiting(s) {
    $('wait-players').innerHTML = s.players.map(p => `
        <div class="uc-player-row${p.connected ? '' : ' off'}">
            <span class="up-dot"></span><span class="up-name">${esc(p.pseudo)}</span>
            ${p.host ? '<span class="up-host">Hôte</span>' : ''}
        </div>`).join('');
    const isHost = s.host === myPseudo;
    $('btn-start').hidden = !isHost;
    $('wait-hint').hidden = isHost;
    $('uc-count-box').hidden = !isHost;
    if (isHost) {
        const n = s.players.length;
        const maxUc = Math.max(1, n - 2);
        const current = s.undercoverCount && s.undercoverCount <= maxUc ? s.undercoverCount : suggestUcCount(n);
        $('opt-uc-count').innerHTML = Array.from({ length: maxUc }, (_, i) => i + 1)
            .map(v => `<button type="button" class="${v === current ? 'on' : ''}" data-v="${v}">${v}</button>`).join('');
        $('opt-uc-count').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
            socket.emit('uc_set_undercover_count', { count: Number(b.dataset.v) });
        }));
    }
}
$('btn-start').addEventListener('click', () => socket.emit('uc_start'));

function renderSpeaking(s) {
    $('turn-order').innerHTML = (s.speakOrder || []).map(p => `<span class="ut-chip${p === s.turnPseudo ? ' current' : ''}">${esc(p)}</span>`).join('');
    const isHost = s.host === myPseudo;
    $('btn-next-turn').hidden = !isHost;
    $('btn-go-vote').hidden = !isHost;
}
$('btn-next-turn').addEventListener('click', () => socket.emit('uc_next_turn'));
$('btn-go-vote').addEventListener('click', () => socket.emit('uc_go_vote'));

function renderVoting(s) {
    const others = s.players.filter(p => p.alive && p.pseudo !== myPseudo);
    const already = s.myVote;
    $('vote-grid').innerHTML = others.map(p => `
        <button type="button" class="uv-opt${already === p.pseudo ? ' chosen' : ''}" data-p="${esc(p.pseudo)}" ${already ? 'disabled' : ''}>${esc(p.pseudo)}</button>`).join('');
    $('vote-grid').querySelectorAll('.uv-opt').forEach(b => b.addEventListener('click', () => {
        socket.emit('uc_vote', { targetPseudo: b.dataset.p });
    }));
    $('vote-progress').textContent = `${(s.votedPseudos || []).length} / ${s.eligibleCount || 0} ont voté`;
}

function renderResult(s) {
    const r = s.result || {};
    let html;
    if (r.tie) html = `<p class="ur-title">Égalité</p><p class="ur-sub">Personne n'est éliminé cette fois.</p>`;
    else if (r.eliminated) html = `<p class="ur-title">${esc(r.eliminated)}</p>
        <p class="ur-role ${r.role === 'undercover' ? 'undercover' : 'civil'}">${r.role === 'undercover' ? 'était Infiltré !' : 'était civil…'}</p>
        <p class="ur-sub">Son mot était « ${esc(r.word)} »</p>`;
    else html = `<p class="ur-title">Aucune élimination</p>`;
    $('result-box').innerHTML = html;
}

function renderEnded(s) {
    const win = s.winner === 'infiltres';
    $('ended-box').innerHTML = `
        <p class="ue-winner ${win ? 'infiltres' : 'civils'}">${win ? 'Les Infiltrés gagnent !' : 'Les Civils gagnent !'}</p>
        <div class="ue-reveal-list">${(s.finalReveal || []).map(p => `
            <div class="ue-reveal-row ${p.role}"><span class="er-name">${esc(p.pseudo)}</span><span class="er-word">${esc(p.word)}</span></div>`).join('')}</div>`;
    $('btn-rematch').hidden = s.host !== myPseudo;
}
$('btn-rematch').addEventListener('click', () => socket.emit('uc_rematch'));

// =====================================================================
//  MODE LOCAL — un seul appareil qui passe de main en main
// =====================================================================
let PAIRS = null;
let localPlayers = [];      // [{name, role, word, alive}]
let localRound = 1;
let localTurnIndex = 0;
let localRevealIndex = 0;
let localVoterIndex = 0;
let localVotes = {};

async function ensurePairs() {
    if (PAIRS) return PAIRS;
    try {
        const res = await fetch('/undercover/pairs.json');
        PAIRS = await res.json();
    } catch (e) { PAIRS = [['Chat', 'Chien'], ['Café', 'Thé'], ['Plage', 'Piscine']]; }
    return PAIRS;
}

function initLocalSetup() {
    ensurePairs();
    if (!$('local-name-list').children.length) {
        for (let i = 0; i < 4; i++) addLocalNameRow();
    }
    renderLocalUcCount();
}
function addLocalNameRow(value) {
    if ($('local-name-list').children.length >= 12) { toast('12 joueurs maximum.'); return; }
    const row = document.createElement('div');
    row.className = 'un-row';
    row.innerHTML = `<input type="text" maxlength="20" placeholder="Prénom…" autocomplete="off">
        <button type="button" aria-label="Retirer">✕</button>`;
    if (value) row.querySelector('input').value = value;
    row.querySelector('button').addEventListener('click', () => { row.remove(); renderLocalUcCount(); });
    row.querySelector('input').addEventListener('input', renderLocalUcCount);
    $('local-name-list').appendChild(row);
}
$('local-add-name').addEventListener('click', () => addLocalNameRow());
function localFilledNames() {
    return [...$('local-name-list').querySelectorAll('input')].map(i => i.value.trim()).filter(Boolean);
}
let localUcCountChoice = null;
function renderLocalUcCount() {
    const n = Math.max(0, localFilledNames().length);
    const maxUc = Math.max(1, n - 2);
    if (localUcCountChoice == null || localUcCountChoice > maxUc) localUcCountChoice = suggestUcCount(Math.max(n, 3));
    $('local-uc-count').innerHTML = Array.from({ length: maxUc }, (_, i) => i + 1)
        .map(v => `<button type="button" class="${v === localUcCountChoice ? 'on' : ''}" data-v="${v}">${v}</button>`).join('');
    $('local-uc-count').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
        localUcCountChoice = Number(b.dataset.v); renderLocalUcCount();
    }));
}

$('local-start').addEventListener('click', async () => {
    const names = localFilledNames();
    if (names.length < 3) { toast('Il faut au moins 3 joueurs.'); return; }
    const uniq = new Set(names.map(n => n.toLowerCase()));
    if (uniq.size !== names.length) { toast('Deux joueurs ont le même prénom — précise-les un peu.'); return; }
    await ensurePairs();
    const pair = PAIRS[Math.floor(Math.random() * PAIRS.length)];
    const ucCount = Math.min(localUcCountChoice || suggestUcCount(names.length), Math.max(1, names.length - 2));
    const order = names.map((name, i) => ({ name, i })).sort(() => Math.random() - 0.5);
    localPlayers = names.map(name => ({ name, alive: true, role: 'civil', word: pair[0] }));
    order.slice(0, ucCount).forEach(o => { localPlayers[o.i].role = 'undercover'; localPlayers[o.i].word = pair[1]; });
    localRound = 1; localTurnIndex = 0; localRevealIndex = 0; localVotes = {};
    startLocalReveal();
});

function startLocalReveal() {
    localRevealIndex = 0;
    $('uc-round-tag').hidden = false; $('uc-round-tag').textContent = 'Manche ' + localRound;
    renderLocalReveal();
    showView('v-local-reveal');
}
function renderLocalReveal() {
    const p = localPlayers[localRevealIndex];
    $('local-reveal-name').textContent = p.name;
    $('local-word-reveal').hidden = true;
    $('local-reveal-show').hidden = false;
}
$('local-reveal-show').addEventListener('click', () => {
    const p = localPlayers[localRevealIndex];
    $('local-word-big').textContent = p.word;
    $('local-word-reveal').hidden = false;
    $('local-reveal-show').hidden = true;
});
$('local-reveal-next').addEventListener('click', () => {
    localRevealIndex++;
    if (localRevealIndex < localPlayers.length) renderLocalReveal();
    else { localTurnIndex = 0; renderLocalSpeaking(); showView('v-local-speaking'); }
});

function aliveLocal() { return localPlayers.filter(p => p.alive); }
function renderLocalSpeaking() {
    const a = aliveLocal();
    if (localTurnIndex >= a.length) localTurnIndex = 0;
    $('local-turn-order').innerHTML = localPlayers.map(p => `
        <span class="ut-chip${p.alive && a[localTurnIndex] === p ? ' current' : ''}${!p.alive ? ' dead' : ''}">${esc(p.name)}</span>`).join('');
}
$('local-next-turn').addEventListener('click', () => {
    const a = aliveLocal();
    localTurnIndex = (localTurnIndex + 1) % a.length;
    renderLocalSpeaking();
});
$('local-go-vote').addEventListener('click', () => {
    localVotes = {}; localVoterIndex = 0;
    startLocalVotePass();
});

function startLocalVotePass() {
    renderLocalVotePass();
    showView('v-local-vote-pass');
}
function renderLocalVotePass() {
    const a = aliveLocal();
    const voter = a[localVoterIndex];
    $('local-voter-name').textContent = voter.name;
    $('local-vote-grid').hidden = true;
    $('local-vote-show').hidden = false;
}
$('local-vote-show').addEventListener('click', () => {
    const a = aliveLocal();
    const voter = a[localVoterIndex];
    const others = a.filter(p => p !== voter);
    $('local-vote-grid').innerHTML = others.map(p => `<button type="button" class="uv-opt" data-name="${esc(p.name)}">${esc(p.name)}</button>`).join('');
    $('local-vote-grid').hidden = false;
    $('local-vote-show').hidden = true;
    $('local-vote-grid').querySelectorAll('.uv-opt').forEach(b => b.addEventListener('click', () => {
        localVotes[voter.name] = b.dataset.name;
        localVoterIndex++;
        if (localVoterIndex < a.length) renderLocalVotePass();
        else resolveLocalVotes();
    }));
});

function resolveLocalVotes() {
    const counts = {};
    for (const target of Object.values(localVotes)) counts[target] = (counts[target] || 0) + 1;
    let top = null, topN = 0, tie = false;
    for (const [name, n] of Object.entries(counts)) {
        if (n > topN) { top = name; topN = n; tie = false; }
        else if (n === topN) tie = true;
    }
    let eliminated = null;
    if (top && !tie) {
        eliminated = localPlayers.find(p => p.name === top);
        if (eliminated) eliminated.alive = false;
    }
    let html;
    if (!top || tie) html = `<p class="ur-title">Égalité</p><p class="ur-sub">Personne n'est éliminé cette fois.</p>`;
    else html = `<p class="ur-title">${esc(eliminated.name)}</p>
        <p class="ur-role ${eliminated.role === 'undercover' ? 'undercover' : 'civil'}">${eliminated.role === 'undercover' ? 'était Infiltré !' : 'était civil…'}</p>
        <p class="ur-sub">Son mot était « ${esc(eliminated.word)} »</p>`;
    $('local-result-box').innerHTML = html;
    showView('v-local-result');
}
$('local-result-continue').addEventListener('click', () => {
    const a = aliveLocal();
    const ucAlive = a.filter(p => p.role === 'undercover').length;
    const civAlive = a.length - ucAlive;
    if (ucAlive === 0 || ucAlive >= civAlive) {
        const win = ucAlive > 0;
        $('local-ended-box').innerHTML = `
            <p class="ue-winner ${win ? 'infiltres' : 'civils'}">${win ? 'Les Infiltrés gagnent !' : 'Les Civils gagnent !'}</p>
            <div class="ue-reveal-list">${localPlayers.map(p => `
                <div class="ue-reveal-row ${p.role}"><span class="er-name">${esc(p.name)}</span><span class="er-word">${esc(p.word)}</span></div>`).join('')}</div>`;
        showView('v-local-ended');
        return;
    }
    localRound++; localTurnIndex = 0;
    $('uc-round-tag').textContent = 'Manche ' + localRound;
    renderLocalSpeaking();
    showView('v-local-speaking');
});
$('local-rematch').addEventListener('click', async () => {
    await ensurePairs();
    const pair = PAIRS[Math.floor(Math.random() * PAIRS.length)];
    const n = localPlayers.length;
    const ucCount = Math.min(localUcCountChoice || suggestUcCount(n), Math.max(1, n - 2));
    const order = localPlayers.map((p, i) => ({ i })).sort(() => Math.random() - 0.5);
    localPlayers.forEach(p => { p.alive = true; p.role = 'civil'; p.word = pair[0]; });
    order.slice(0, ucCount).forEach(o => { localPlayers[o.i].role = 'undercover'; localPlayers[o.i].word = pair[1]; });
    localRound = 1; localVotes = {};
    startLocalReveal();
});
$('local-new-game').addEventListener('click', () => {
    $('uc-round-tag').hidden = true;
    showView('v-local-setup');
});