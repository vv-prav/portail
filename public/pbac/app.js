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
    ['v-lobby', 'v-waiting', 'v-writing', 'v-reveal', 'v-round-end', 'v-ended'].forEach(v => { $(v).hidden = (v !== id); });
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
    } else if (s.status === 'reveal' || s.status === 'challenge') {
        renderReveal(s);
        showView('v-reveal');
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

// ---------- Écriture ----------
function renderWriting(s) {
    const isNewRound = !$('round-letter')._letter || $('round-letter')._letter !== s.letter;
    $('round-letter').textContent = s.letter;
    $('round-letter')._letter = s.letter;
    if (isNewRound) {
        answers = {};
        $('round-letter').classList.remove('pop'); void $('round-letter').offsetWidth;
        $('round-letter').classList.add('pop');
        $('pb-fields').innerHTML = s.categories.map(cat => `
            <div class="pb-field" data-cat="${esc(cat)}">
                <label>${esc(cat)}</label>
                <input type="text" maxlength="40" autocomplete="off" autocorrect="off" autocapitalize="words" spellcheck="false">
            </div>`).join('');
        $('pb-fields').querySelectorAll('input').forEach((inp, i) => {
            inp.addEventListener('input', () => {
                const cat = inp.closest('.pb-field').dataset.cat;
                answers[cat] = inp.value;
                inp.closest('.pb-field').classList.toggle('filled', !!inp.value.trim());
                sendAnswersSoon();
            });
            if (i === 0) setTimeout(() => inp.focus(), 250);
        });
    }
    clearInterval(timerId);
    updateRing(s.timerEnd);
    timerId = setInterval(() => updateRing(s.timerEnd), 250);
}
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

// ---------- Révélation / contestation ----------
function renderReveal(s) {
    const isHost = s.host === myPseudo;
    const inChallenge = s.status === 'challenge';
    $('reveal-hint').textContent = inChallenge
        ? 'Touche une réponse contestable pour la signaler.'
        : (s.stoppedBy ? s.stoppedBy + ' a arrêté la manche.' : 'Temps écoulé.');
    $('challenge-timer').hidden = !inChallenge;
    $('btn-go-challenge').hidden = !isHost || inChallenge;

    $('pb-reveal-list').innerHTML = s.categories.map(cat => {
        const rows = s.players.map(p => {
            const e = (s.breakdown && s.breakdown[cat] && s.breakdown[cat][p.pseudo]) || { text: '', points: 0, valid: false };
            const empty = !e.text;
            const cls = empty ? 'empty' : (e.valid ? 'valid ' + (e.points === 3 ? 'unique' : 'shared') : 'invalid');
            const challengeable = inChallenge && p.pseudo !== myPseudo && !empty;
            const flagged = s.challenges && s.challenges[cat + '|' + p.pseudo] && s.challenges[cat + '|' + p.pseudo].length;
            return `<div class="pr-ans ${cls}${challengeable ? ' challengeable' : ''}" data-cat="${esc(cat)}" data-pseudo="${esc(p.pseudo)}">
                <span class="pa-name">${esc(p.pseudo)}</span>
                <span class="pa-text">${esc(e.text) || '—'}</span>
                ${flagged ? `<span class="pr-flag">${flagged} contestation${flagged > 1 ? 's' : ''}</span>` : ''}
                <span class="pa-pts">${empty ? '' : (e.valid ? '+' + e.points : '✕')}</span>
            </div>`;
        }).join('');
        return `<div class="pr-cat"><div class="pr-cat-name">${esc(cat)}</div>${rows}</div>`;
    }).join('');

    if (inChallenge) {
        $('pb-reveal-list').querySelectorAll('.challengeable').forEach(el => el.addEventListener('click', () => {
            socket.emit('pbac_challenge', { category: el.dataset.cat, pseudo: el.dataset.pseudo });
        }));
        clearInterval(timerId);
        const tick = () => {
            const left = Math.max(0, (s.challengeEnd || 0) - Date.now());
            $('challenge-timer').style.setProperty('--pct', Math.round(left / 250) + '%');
            if (left <= 0) clearInterval(timerId);
        };
        tick(); timerId = setInterval(tick, 250);
    }
}
$('btn-go-challenge').addEventListener('click', () => socket.emit('pbac_go_challenge'));

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