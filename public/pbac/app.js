// =====================================================================
//  PETIT BAC — client (aucune icône emoji : typographie + SVG sobres)
// =====================================================================
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const RING_C = 175.9;

let socket = null;
let myPseudo = null;
let state = null;          // dernier état reçu du serveur (vue courante)
let currentView = 'lobby';
let answers = {};          // brouillon local des réponses (catégorie -> texte)
let timerId = null;

function toast(msg) {
    const el = $('pb-toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(el._t); el._t = setTimeout(() => { el.hidden = true; }, 2600);
}
function showView(id) {
    ['v-lobby', 'v-waiting', 'v-writing', 'v-voting', 'v-cat-summary', 'v-round-end', 'v-ended'].forEach(v => { $(v).hidden = (v !== id); });
    currentView = id;
}

// ---------- Connexion ----------
function connect() {
    socket = io();
    socket.on('connect', () => {
        socket.emit('pbac_identify', (res) => {
            if (!res || !res.ok) { toast('Session expirée, retourne au salon.'); return; }
            myPseudo = res.pseudo;
            document.body.className = 'is-ready';
            socket.emit('pbac_list');
        });
    });
    socket.on('pbac_games', renderLobby);
    socket.on('pbac_state', onState);
    socket.on('pbac_card', renderCard);
    socket.on('pbac_error', (msg) => toast(msg || 'Erreur.'));
    socket.on('pbac_closed', () => { toast('La table a été fermée.'); location.href = '/'; });
    socket.on('disconnect', () => toast('Connexion perdue, on retente…'));
}

// ---------- Lobby ----------
function renderLobby(games) {
    if (currentView !== 'lobby' && state) return;   // on ne repasse pas au lobby si on est déjà en partie
    $('lobby-empty-label').hidden = !!(games && games.length);
    $('pb-tables').innerHTML = (games || []).map(g => `
        <button class="pb-table-row" data-id="${g.id}">
            <span>Table de <b>${esc(g.host)}</b></span>
            <span class="pt-meta">${g.players}/${g.maxPlayers} joueurs · ${g.rounds} manches · ${g.duration} s</span>
        </button>`).join('');
    $('pb-tables').querySelectorAll('.pb-table-row').forEach(b => b.addEventListener('click', () => {
        socket.emit('pbac_join', { id: b.dataset.id });
    }));
}

$('btn-create').addEventListener('click', () => { $('v-create').hidden = false; });
$('create-cancel').addEventListener('click', () => { $('v-create').hidden = true; });
document.querySelectorAll('#opt-rounds button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#opt-rounds button').forEach(x => x.classList.toggle('on', x === b));
}));
document.querySelectorAll('#opt-duration button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#opt-duration button').forEach(x => x.classList.toggle('on', x === b));
}));
$('create-confirm').addEventListener('click', () => {
    const rounds = document.querySelector('#opt-rounds button.on').dataset.v;
    const duration = document.querySelector('#opt-duration button.on').dataset.v;
    socket.emit('pbac_create', { rounds: Number(rounds), duration });
    $('v-create').hidden = true;
});
$('btn-leave-lobby').addEventListener('click', () => {
    socket.emit('pbac_leave');
    state = null;
    $('pb-sub').textContent = 'Salon des parties';
    $('pb-round-tag').hidden = true;
    showView('v-lobby');
    socket.emit('pbac_list');
});

// ---------- Dispatch d'état ----------
function onState(s) {
    state = s;
    $('pb-sub').textContent = 'Table de ' + s.host;
    if (s.status === 'lobby') {
        $('pb-round-tag').hidden = true;
        renderWaiting(s);
        showView('v-waiting');
    } else if (s.status === 'writing') {
        $('pb-round-tag').hidden = false;
        $('pb-round-tag').textContent = 'Manche ' + s.round + ' / ' + s.maxRounds;
        renderWriting(s);
        showView('v-writing');
    } else if (s.status === 'voting') {
        showView('v-voting');   // le contenu arrive via l'évènement pbac_card
    } else if (s.status === 'cat_summary') {
        clearInterval(timerId);
        renderCatSummary(s);
        showView('v-cat-summary');
    } else if (s.status === 'ended_round') {
        clearInterval(timerId);
        renderRoundEnd(s);
        showView('v-round-end');
    } else if (s.status === 'ended') {
        clearInterval(timerId);
        renderFinal(s);
        showView('v-ended');
    }
}

// ---------- Salle d'attente ----------
function renderWaiting(s) {
    $('wait-players').innerHTML = s.players.map(p => `
        <div class="pb-player-row${p.connected ? '' : ' off'}">
            <span class="pp-dot"></span><span class="pp-name">${esc(p.pseudo)}</span>
            ${p.host ? '<span class="pp-host">Hôte</span>' : ''}
        </div>`).join('');
    const isHost = s.host === myPseudo;
    $('btn-start').hidden = !isHost;
    $('wait-hint').hidden = isHost;
}
$('btn-start').addEventListener('click', () => socket.emit('pbac_start'));

// ---------- Écriture : un champ à la fois, chrono toujours visible ----------
let stepIndex = 0;
function renderWriting(s) {
    const isNewRound = !$('round-letter')._letter || $('round-letter')._letter !== s.letter;
    $('round-letter').textContent = s.letter;
    $('round-letter')._letter = s.letter;
    if (isNewRound) {
        answers = {}; stepIndex = 0;
        $('round-letter').classList.remove('pop'); void $('round-letter').offsetWidth;
        $('round-letter').classList.add('pop');
        $('pb-dots').innerHTML = s.categories.map((cat, i) => `<button type="button" class="pb-dot" data-i="${i}" aria-label="${esc(cat)}"></button>`).join('');
        $('pb-dots').querySelectorAll('.pb-dot').forEach(d => d.addEventListener('click', () => goToStep(Number(d.dataset.i))));
        goToStep(0);
    }
    clearInterval(timerId);
    updateRing(s.timerEnd);
    timerId = setInterval(() => updateRing(s.timerEnd), 250);
}
function goToStep(i) {
    if (!state) return;
    const cats = state.categories;
    stepIndex = Math.max(0, Math.min(cats.length - 1, i));
    const cat = cats[stepIndex];
    $('step-cat-name').textContent = cat;
    $('step-input').value = answers[cat] || '';
    $('step-prev').style.visibility = stepIndex === 0 ? 'hidden' : 'visible';
    $('step-next').textContent = stepIndex === cats.length - 1 ? 'Terminé' : 'Suivant';
    paintDots();
    setTimeout(() => $('step-input').focus(), 60);
    checkAllFilled();
}
function paintDots() {
    $('pb-dots').querySelectorAll('.pb-dot').forEach((d, i) => {
        const cat = state.categories[i];
        d.classList.toggle('filled', !!(answers[cat] && answers[cat].trim()));
        d.classList.toggle('current', i === stepIndex);
    });
}
function checkAllFilled() {
    const all = state.categories.every(c => answers[c] && answers[c].trim());
    $('write-done-hint').hidden = !all;
    $('btn-stop').classList.toggle('pulse', all);
}
$('step-input').addEventListener('input', () => {
    const cat = state.categories[stepIndex];
    answers[cat] = $('step-input').value;
    paintDots(); checkAllFilled(); sendAnswersSoon();
});
$('step-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('step-next').click(); } });
$('step-prev').addEventListener('click', () => goToStep(stepIndex - 1));
$('step-next').addEventListener('click', () => {
    if (stepIndex < state.categories.length - 1) goToStep(stepIndex + 1);
    else $('step-input').blur();
});
let sendT = null;
function sendAnswersSoon() { clearTimeout(sendT); sendT = setTimeout(() => socket.emit('pbac_update_answers', answers), 350); }
function updateRing(endTs) {
    const total = state && state.duration ? state.duration * 1000 : 90000;
    const left = Math.max(0, endTs - Date.now());
    const pct = left / total;
    $('ring-fg').style.strokeDashoffset = (RING_C * (1 - pct)).toFixed(1);
    $('ring-fg').classList.toggle('urgent', left < 10000);
    $('timer-num').textContent = Math.ceil(left / 1000);
    if (left <= 0) clearInterval(timerId);
}
$('btn-stop').addEventListener('click', () => {
    socket.emit('pbac_update_answers', answers);
    socket.emit('pbac_stop');
    if (navigator.vibrate) { try { navigator.vibrate([25, 40, 25]); } catch (e) {} }
});

// ---------- Vote : une réponse à la fois, jauge en direct ----------
function renderCard(c) {
    $('voting-progress').textContent = `Catégorie ${c.catIndex} / ${c.catTotal} · réponse ${c.cardIndex} / ${c.cardTotal}`;
    $('vote-cat').textContent = c.category;
    $('vote-answer').textContent = c.text;
    $('vote-author').textContent = 'proposé par ' + c.pseudo;

    const total = c.eligible || 1;
    $('gauge-yes').style.width = Math.round((c.yes / total) * 100) + '%';
    $('gauge-no').style.width = Math.round((c.no / total) * 100) + '%';

    const btns = $('vote-btns');
    const outcome = $('vote-outcome');
    if (c.resolved) {
        btns.hidden = true;
        outcome.hidden = false;
        outcome.textContent = c.accepted ? 'Accepté' : 'Refusé';
        outcome.className = 'pv-outcome ' + (c.accepted ? 'accepted' : 'rejected');
        if (navigator.vibrate) { try { navigator.vibrate(c.accepted ? [20, 30, 20] : 25); } catch (e) {} }
    } else {
        outcome.hidden = true;
        btns.hidden = false;
        $('btn-vote-yes').disabled = !c.canVote;
        $('btn-vote-no').disabled = !c.canVote;
        $('btn-vote-yes').classList.toggle('chosen', c.iVoted === 'yes');
        $('btn-vote-no').classList.toggle('chosen', c.iVoted === 'no');
    }
}
$('btn-vote-yes').addEventListener('click', () => socket.emit('pbac_vote', { value: 'yes' }));
$('btn-vote-no').addEventListener('click', () => socket.emit('pbac_vote', { value: 'no' }));

// ---------- Récap de catégorie ----------
function renderCatSummary(s) {
    $('summary-cat-name').textContent = s.lastCategory;
    const ranked = state.players ? state.players.slice() : [];
    const rows = ranked.map(p => {
        const text = (s.answers && s.answers[p.pseudo]) || '';
        const ok = s.voteOutcomes && s.voteOutcomes[p.pseudo];
        const pts = (s.categoryPoints && s.categoryPoints[p.pseudo]) || 0;
        const cls = !ok || pts === 0 ? 'zero' : (pts === 3 ? 'unique' : 'shared');
        return `<div class="sm-row ${cls}"><span class="sm-name">${esc(p.pseudo)}</span><span class="sm-text">${esc(text) || '—'}</span><span class="sm-pts">+${pts}</span></div>`;
    });
    $('summary-list').innerHTML = rows.join('');
    [...$('summary-list').children].forEach((row, i) => setTimeout(() => row.classList.add('show'), i * 90));
}

// ---------- Fin de manche : liste + animation d'égalité ----------
function renderRoundEnd(s) {
    const ranked = s.players.slice().sort((a, b) => b.score - a.score);
    const topScore = ranked[0] ? ranked[0].score : 0;
    const tiedTop = ranked.filter(p => p.score === topScore).length > 1;

    let banner = '';
    if (tiedTop && ranked.length > 1) banner = `<p class="pb-tie-banner">Égalité en tête !</p>`;

    $('round-score-list').innerHTML = banner + ranked.map(p => {
        const delta = (s.roundScores && s.roundScores[p.pseudo]) || 0;
        const isTop = p.score === topScore;
        return `<div class="ps-row${isTop && tiedTop ? ' tie' : ''}">
            <span class="ps-name">${esc(p.pseudo)}<span class="ps-delta">+${delta}</span></span>
            <span class="ps-total">${p.score}</span>
        </div>`;
    }).join('');

    const isHost = s.host === myPseudo;
    $('btn-next-round').hidden = !isHost;
    $('btn-next-round').textContent = s.round >= s.maxRounds ? 'Voir le classement final' : 'Manche suivante';
    if (navigator.vibrate) { try { navigator.vibrate(tiedTop ? [20, 30, 20, 30, 20] : 20); } catch (e) {} }
}
$('btn-next-round').addEventListener('click', () => socket.emit('pbac_next_round'));

// ---------- Fin de partie : podium animé ----------
const CROWN_SVG = `<svg class="pod-crown show" viewBox="0 0 32 22" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 20 L4 7 L11 13 L16 3 L21 13 L28 7 L30 20 Z" fill="var(--brass-soft)" stroke="var(--brass)" stroke-width="1.4" stroke-linejoin="round"/>
    <circle cx="4" cy="6" r="2" fill="var(--brass-soft)"/><circle cx="16" cy="2.4" r="2" fill="var(--brass-soft)"/><circle cx="28" cy="6" r="2" fill="var(--brass-soft)"/>
</svg>`;

function renderFinal(s) {
    const ranked = s.players.slice().sort((a, b) => b.score - a.score);
    const topScore = ranked[0] ? ranked[0].score : 0;
    const tiedWinners = ranked.filter(p => p.score === topScore);
    const podiumEl = $('pb-podium');
    podiumEl.classList.toggle('tie-final', tiedWinners.length > 1);

    const top3 = ranked.slice(0, 3);
    const order = [1, 0, 2].filter(i => top3[i]);   // 2e / 1er / 3e, comme un vrai podium
    const barsHtml = order.map(i => {
        const p = top3[i]; const rank = i + 1;
        return `<div class="pod-col" data-rank="${rank}">
            <span class="pod-name">${esc(p.pseudo)}${tiedWinners.length > 1 && p.score === topScore ? ' •' : ''}</span>
            ${rank === 1 ? CROWN_SVG.replace('show', '') : ''}
            <div class="pod-bar">${rank}</div>
            <span class="pod-score">${p.score} pts</span>
        </div>`;
    }).join('');
    const restHtml = ranked.slice(3).map((p, i) => `
        <div class="pod-rest-row" style="--i:${i}"><span class="pr-name">${i + 4}. ${esc(p.pseudo)}</span><span class="pr-score">${p.score} pts</span></div>`).join('');

    const bannerHtml = tiedWinners.length > 1
        ? `<p class="pb-tie-banner">Égalité pour la victoire : ${tiedWinners.map(p => esc(p.pseudo)).join(' & ')}</p>`
        : '';

    podiumEl.innerHTML = `${bannerHtml}<div class="pod-bars">${barsHtml}</div><div class="pod-rest">${restHtml}</div>`;

    // Révélation en cascade : dernier -> premier, pour le suspense
    const cols = [...podiumEl.querySelectorAll('.pod-col')];
    const byRank = {}; cols.forEach(c => { byRank[c.dataset.rank] = c; });
    const revealOrder = [3, 2, 1].filter(r => byRank[r]);
    revealOrder.forEach((r, idx) => {
        setTimeout(() => {
            byRank[r].classList.add('show');
            if (r === 1) {
                const crown = byRank[r].querySelector('.pod-crown');
                if (crown) setTimeout(() => crown.classList.add('show'), 350);
                spawnConfetti();
                if (navigator.vibrate) { try { navigator.vibrate([30, 60, 30, 60, 80]); } catch (e) {} }
            }
        }, idx * 650);
    });
    [...podiumEl.querySelectorAll('.pod-rest-row')].forEach((row, i) => {
        setTimeout(() => row.classList.add('show'), revealOrder.length * 650 + i * 90);
    });

    const isHost = s.host === myPseudo;
    $('btn-rematch').hidden = !isHost;
}
$('btn-rematch').addEventListener('click', () => socket.emit('pbac_rematch'));

// ---------- Confettis de victoire (canvas, teinte laiton) ----------
const canvas = $('fx');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = Math.min(2, window.devicePixelRatio || 1);
function resizeCanvas() {
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();
let confetti = [];
function spawnConfetti() {
    const colors = ['#ecca82', '#d9a94e', '#efe4cf', '#c9a24a'];
    for (let i = 0; i < 60; i++) {
        confetti.push({
            x: W / 2 + (Math.random() - 0.5) * 60, y: H * 0.32,
            vx: (Math.random() - 0.5) * 6, vy: -Math.random() * 6 - 2,
            r: 2.5 + Math.random() * 3, life: 1, color: colors[i % colors.length], rot: Math.random() * Math.PI,
        });
    }
}
function tick() {
    ctx.clearRect(0, 0, W, H);
    confetti = confetti.filter(p => p.life > 0.02);
    for (const p of confetti) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.16; p.vx *= 0.99; p.life *= 0.985; p.rot += 0.05;
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r);
        ctx.restore();
    }
    requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ---------- Démarrage ----------
connect();
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}