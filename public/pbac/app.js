// =====================================================================
//  PETIT BAC — client (aucune icône emoji : typographie + SVG sobres)
// =====================================================================
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const RING_C = 175.9;
const CATEGORY_PRESETS = [
    'Prénom', 'Animal', 'Pays ou ville', 'Fruit ou légume', 'Métier', 'Objet', 'Couleur', 'Sport',
    'Film ou série', 'Marque connue', 'Instrument de musique', 'Personnage de fiction',
    'Plat ou dessert', 'Moyen de transport', 'Vêtement', 'Boisson', 'Matière scolaire',
    'Expression toute faite', 'Élément de la maison', 'Insecte ou bestiole', 'Chanteur ou groupe', 'Prénom de star',
];
const DEFAULT_CATEGORIES = CATEGORY_PRESETS.slice(0, 8);

let socket = null;
let myPseudo = null;
let state = null;          // dernier état reçu du serveur (vue courante)
let currentView = 'lobby';
let answers = {};          // brouillon local des réponses (catégorie -> texte)
let timerId = null;
let selectedCats = DEFAULT_CATEGORIES.slice();   // catégories choisies pour la prochaine table créée

function toast(msg) {
    const el = $('pb-toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(el._t); el._t = setTimeout(() => { el.hidden = true; }, 2600);
}
function showView(id) {
    ['v-lobby', 'v-waiting', 'v-spectator', 'v-choose-letter', 'v-countdown', 'v-writing', 'v-voting', 'v-cat-summary', 'v-round-end', 'v-ended']
        .forEach(v => { $(v).hidden = (v !== id); });
    currentView = id;
}

// ---------- Connexion ----------
let lastGameId = null;
let wasDisconnected = false;
function connect() {
    socket = io();
    socket.on('connect', () => {
        socket.emit('pbac_identify', (res) => {
            if (!res || !res.ok) { toast('Session expirée, retourne au salon.'); return; }
            myPseudo = res.pseudo;
            document.body.className = 'is-ready';
            if (lastGameId) {
                socket.emit('pbac_join', { id: lastGameId });
                if (wasDisconnected) { toast('Reconnecté — partie resynchronisée.'); wasDisconnected = false; }
            } else {
                socket.emit('pbac_list');
                socket.emit('pbac_packs_list');
            }
        });
    });
    socket.on('pbac_games', renderLobby);
    socket.on('pbac_state', onState);
    socket.on('pbac_card', renderCard);
    socket.on('pbac_packs', renderPacks);
    socket.on('pbac_error', (msg) => toast(msg || 'Erreur.'));
    socket.on('pbac_closed', () => { toast('La table a été fermée.'); location.href = '/'; });
    socket.on('disconnect', () => { wasDisconnected = true; toast('Connexion perdue, on retente…'); });
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

$('btn-create').addEventListener('click', () => {
    selectedCats = DEFAULT_CATEGORIES.slice();
    renderCatGrid();
    $('cat-custom-input').value = '';
    $('pack-save-name').value = '';
    socket.emit('pbac_packs_list');
    $('v-create').hidden = false;
});
$('create-cancel').addEventListener('click', () => { $('v-create').hidden = true; });
document.querySelectorAll('#opt-rounds button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#opt-rounds button').forEach(x => x.classList.toggle('on', x === b));
}));
document.querySelectorAll('#opt-duration button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#opt-duration button').forEach(x => x.classList.toggle('on', x === b));
}));
document.querySelectorAll('#opt-letter-mode button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#opt-letter-mode button').forEach(x => x.classList.toggle('on', x === b));
}));

// ---------- Catégories personnalisables ----------
function renderCatGrid() {
    const customExtras = selectedCats.filter(c => !CATEGORY_PRESETS.includes(c));
    const all = [...CATEGORY_PRESETS, ...customExtras];
    $('cat-grid').innerHTML = all.map(c => {
        const on = selectedCats.includes(c);
        const isCustom = !CATEGORY_PRESETS.includes(c);
        return `<button type="button" class="${on ? 'on ' : ''}${isCustom ? 'custom' : ''}" data-c="${esc(c)}">${esc(c)}</button>`;
    }).join('');
    $('cat-grid').querySelectorAll('button').forEach(b => b.addEventListener('click', () => toggleCat(b.dataset.c)));
    updateCatCount();
}
function toggleCat(cat) {
    if (selectedCats.includes(cat)) {
        selectedCats = selectedCats.filter(c => c !== cat);
    } else {
        if (selectedCats.length >= 8) { toast('8 catégories maximum — retire-en une avant d\'en ajouter une autre.'); return; }
        selectedCats.push(cat);
    }
    renderCatGrid();
}
function updateCatCount() {
    const el = $('cat-count');
    el.textContent = selectedCats.length + '/8';
    el.className = selectedCats.length === 8 ? 'full' : (selectedCats.length > 8 ? 'over' : '');
    $('create-confirm').disabled = selectedCats.length !== 8;
}
function addCustomCategory() {
    const val = $('cat-custom-input').value.trim().replace(/\s+/g, ' ');
    if (!val || val.length < 2) { toast('Donne un nom un peu plus long.'); return; }
    if (val.length > 30) { toast('30 caractères maximum.'); return; }
    if (selectedCats.some(c => c.toLowerCase() === val.toLowerCase())) { toast('Déjà dans la liste.'); return; }
    if (selectedCats.length >= 8) { toast('8 catégories maximum — retire-en une avant d\'en ajouter une autre.'); return; }
    selectedCats.push(val);
    $('cat-custom-input').value = '';
    renderCatGrid();
}
$('cat-custom-add').addEventListener('click', addCustomCategory);
$('cat-custom-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomCategory(); } });

// ---------- Packs de catégories sauvegardés ----------
let myPacks = [];
function renderPacks(packs) {
    myPacks = packs || [];
    $('packs-empty').hidden = !!myPacks.length;
    $('packs-row').innerHTML = myPacks.map(p => `
        <span class="pb-pack-chip">
            <button type="button" class="pb-pack-apply" data-name="${esc(p.name)}">${esc(p.name)}</button>
            <button type="button" class="pb-pack-del" data-name="${esc(p.name)}" aria-label="Supprimer">✕</button>
        </span>`).join('');
    $('packs-row').querySelectorAll('.pb-pack-apply').forEach(b => b.addEventListener('click', () => {
        const pack = myPacks.find(p => p.name === b.dataset.name);
        if (!pack) return;
        selectedCats = pack.categories.slice();
        renderCatGrid();
        toast('Pack « ' + pack.name + ' » appliqué.');
    }));
    $('packs-row').querySelectorAll('.pb-pack-del').forEach(b => b.addEventListener('click', () => {
        socket.emit('pbac_packs_delete', { name: b.dataset.name });
    }));
}
$('pack-save-btn').addEventListener('click', () => {
    const name = $('pack-save-name').value.trim();
    if (!name) { toast('Donne un nom à ce pack.'); return; }
    if (selectedCats.length !== 8) { toast('Choisis exactement 8 catégories avant d\'enregistrer.'); return; }
    socket.emit('pbac_packs_save', { name, categories: selectedCats });
    $('pack-save-name').value = '';
    toast('Pack enregistré.');
});

$('create-confirm').addEventListener('click', () => {
    if (selectedCats.length !== 8) { toast('Choisis exactement 8 catégories.'); return; }
    const rounds = document.querySelector('#opt-rounds button.on').dataset.v;
    const duration = document.querySelector('#opt-duration button.on').dataset.v;
    const letterMode = document.querySelector('#opt-letter-mode button.on').dataset.v;
    socket.emit('pbac_create', { rounds: Number(rounds), duration, letterMode, categories: selectedCats });
    $('v-create').hidden = true;
});
$('btn-leave-spectator').addEventListener('click', () => {
    socket.emit('pbac_leave');
    state = null;
    lastGameId = null;
    $('pb-sub').textContent = 'Salon des parties';
    $('pb-round-tag').hidden = true;
    showView('v-lobby');
    socket.emit('pbac_list');
});
$('btn-leave-lobby').addEventListener('click', () => {
    socket.emit('pbac_leave');
    state = null;
    lastGameId = null;
    $('pb-sub').textContent = 'Salon des parties';
    $('pb-round-tag').hidden = true;
    showView('v-lobby');
    socket.emit('pbac_list');
});

// ---------- Dispatch d'état ----------
function onState(s) {
    state = s;
    lastGameId = s.id;
    $('pb-sub').textContent = 'Table de ' + s.host;

    const me = s.players.find(p => p.pseudo === myPseudo);
    const iAmSpectator = !!(me && me.spectator);
    const interactiveStatuses = ['writing', 'countdown', 'choosing_letter', 'voting'];
    if (iAmSpectator && interactiveStatuses.includes(s.status)) {
        $('pb-round-tag').hidden = false;
        $('pb-round-tag').textContent = 'Manche ' + s.round + ' / ' + s.maxRounds;
        clearInterval(timerId);
        renderSpectator(s);
        showView('v-spectator');
        return;
    }

    if (s.status === 'lobby') {
        $('pb-round-tag').hidden = true;
        renderWaiting(s);
        showView('v-waiting');
    } else if (s.status === 'choosing_letter') {
        $('pb-round-tag').hidden = false;
        $('pb-round-tag').textContent = 'Manche ' + s.round + ' / ' + s.maxRounds;
        renderChooseLetter(s);
        showView('v-choose-letter');
    } else if (s.status === 'countdown') {
        $('pb-round-tag').hidden = false;
        $('pb-round-tag').textContent = 'Manche ' + s.round + ' / ' + s.maxRounds;
        renderCountdown(s);
        showView('v-countdown');
    } else if (s.status === 'writing') {
        $('pb-round-tag').hidden = false;
        $('pb-round-tag').textContent = 'Manche ' + s.round + ' / ' + s.maxRounds;
        clearInterval(timerId);
        renderWriting(s);
        showView('v-writing');
    } else if (s.status === 'voting') {
        clearInterval(timerId);
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

// ---------- Spectateur (rejoint en cours de manche) ----------
function renderSpectator(s) {
    $('spectator-letter').textContent = s.letter || '';
    $('spectator-letter').hidden = !s.letter;
}

// ---------- Choix de la lettre par l'hôte ----------
function renderChooseLetter(s) {
    const isHost = s.host === myPseudo;
    $('choose-letter-hint').hidden = !isHost;
    $('choose-letter-wait').hidden = isHost;
    const grid = $('letter-grid');
    if (isHost) {
        if (!grid.children.length) {
            grid.innerHTML = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(l => `<button type="button" data-l="${l}">${l}</button>`).join('');
            grid.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
                grid.querySelectorAll('button').forEach(x => x.disabled = true);
                socket.emit('pbac_pick_letter', { letter: b.dataset.l });
            }));
        } else {
            grid.querySelectorAll('button').forEach(b => b.disabled = false);
        }
        grid.hidden = false;
    } else {
        grid.hidden = true;
    }
}

// ---------- Compte à rebours ----------
function renderCountdown(s) {
    clearInterval(timerId);
    const tick = () => {
        const left = Math.max(0, (s.countdownEnd || 0) - Date.now());
        const n = Math.ceil(left / 1000);
        const el = $('countdown-num');
        if (el.textContent !== String(n) && n > 0) {
            el.textContent = String(n);
            el.classList.remove('tick'); void el.offsetWidth;
            el.classList.add('tick');
            if (navigator.vibrate) { try { navigator.vibrate(18); } catch (e) {} }
        }
        if (left <= 0) clearInterval(timerId);
    };
    tick(); timerId = setInterval(tick, 100);
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
    if (c.queueTotal) $('round-progress-fill').style.width = Math.round((c.queueIndex / c.queueTotal) * 100) + '%';

    const miss = $('vote-miss');
    const normal = $('vote-normal');
    if (c.type === 'empty') {
        normal.hidden = true;
        miss.hidden = false;
        $('miss-name').textContent = c.pseudo;
        $('miss-sub').textContent = c.text
            ? '« ' + c.text + ' » ne commence pas par ' + (state && state.letter)
            : "n'a rien écrit ici";
        miss.classList.remove('go'); void miss.offsetWidth;
        miss.classList.add('go');
        if (navigator.vibrate) { try { navigator.vibrate([40, 60, 90]); } catch (e) {} }
        return;
    }
    miss.hidden = true;
    normal.hidden = false;

    $('vote-answer').textContent = c.text;
    $('vote-author').textContent = 'proposé par ' + c.pseudo;

    const total = c.eligible || 1;
    $('gauge-yes').style.width = Math.round((c.yes / total) * 100) + '%';
    $('gauge-no').style.width = Math.round((c.no / total) * 100) + '%';

    // Qui a déjà voté (sans révéler quoi) — pour savoir qui on attend encore.
    const votersRow = $('voters-row');
    votersRow.hidden = c.resolved;
    if (!c.resolved) {
        votersRow.innerHTML = (c.eligiblePseudos || []).map(p => {
            const voted = (c.votedPseudos || []).includes(p);
            return `<span class="pb-voter${voted ? ' voted' : ''}">${esc(p)}</span>`;
        }).join('');
    }

    const btns = $('vote-btns');
    const outcome = $('vote-outcome');
    if (c.resolved) {
        btns.hidden = true;
        outcome.hidden = false;
        outcome.textContent = c.accepted ? 'Accepté' : 'Refusé';
        outcome.className = 'pv-outcome ' + (c.accepted ? 'accepted' : 'rejected');
        if (navigator.vibrate) { try { navigator.vibrate(c.accepted ? [20, 30, 20] : 25); } catch (e) {} }
        const unanimous = total > 0 && (c.yes === total || c.no === total);
        if (unanimous) {
            const spark = $('gauge-spark');
            spark.classList.remove('go'); void spark.offsetWidth;
            spark.classList.add('go');
        }
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
    $('round-wait-hint').hidden = isHost;
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
    // Le palier (1=or, 2=argent, 3=bronze, 0=le reste) se base sur le SCORE,
    // pas la position brute : en cas d'égalité, tout le monde partage le même palier.
    const uniqueScores = [...new Set(ranked.map(p => p.score))].sort((a, b) => b - a);
    const tierOf = (score) => { const i = uniqueScores.indexOf(score); return i === 0 ? 1 : i === 1 ? 2 : i === 2 ? 3 : 0; };
    const topScore = ranked[0] ? ranked[0].score : 0;
    const tiedTop = ranked.filter(p => p.score === topScore).length > 1;

    const bannerHtml = tiedTop
        ? `<p class="pb-tie-banner">Égalité pour la victoire : ${ranked.filter(p => p.score === topScore).map(p => esc(p.pseudo)).join(' & ')}</p>`
        : '';

    const rowsHtml = ranked.map((p, i) => {
        const tier = tierOf(p.score);
        return `<div class="pod-row tier-${tier}" data-tier="${tier}">
            <span class="pod-rank">${i + 1}</span>
            ${tier === 1 ? CROWN_SVG.replace('show', '') : ''}
            <span class="pod-pname">${esc(p.pseudo)}</span>
            <span class="pod-pscore">${p.score} pts</span>
        </div>`;
    }).join('');

    const podiumEl = $('pb-podium');
    podiumEl.classList.toggle('tie-final', tiedTop);
    podiumEl.innerHTML = bannerHtml + `<div class="pod-list">${rowsHtml}</div>`;

    // Révélation qui remonte le classement : dernier -> premier, en ralentissant
    // et en intensifiant l'animation à mesure qu'on approche du sommet.
    const rows = [...podiumEl.querySelectorAll('.pod-row')];
    const buckets = { 0: [], 3: [], 2: [], 1: [] };
    rows.forEach(r => buckets[Number(r.dataset.tier)].push(r));

    let t = 0;
    buckets[0].slice().reverse().forEach((row) => { setTimeout(() => row.classList.add('show'), t); t += 220; });
    t += 450;
    buckets[3].forEach((row, i) => setTimeout(() => row.classList.add('show'), t + i * 150));
    t += buckets[3].length * 150 + 700;
    buckets[2].forEach((row, i) => setTimeout(() => row.classList.add('show'), t + i * 150));
    t += buckets[2].length * 150 + 900;
    setTimeout(() => {
        buckets[1].forEach(row => {
            row.classList.add('show');
            const crown = row.querySelector('.pod-crown');
            if (crown) setTimeout(() => crown.classList.add('show'), 260);
        });
        spawnConfetti();
        if (navigator.vibrate) { try { navigator.vibrate([30, 60, 30, 60, 100]); } catch (e) {} }
    }, t);

    const isHost = s.host === myPseudo;
    $('btn-rematch').hidden = !isHost;
    $('final-wait-hint').hidden = isHost;
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

// ---------- Clavier mobile : garder les boutons visibles quand il s'ouvre ----------
// Sur les petits écrans (iPhone SE et consorts), le clavier peut recouvrir la
// moitié de l'écran ; on fait remonter la zone utile dans l'espace visible restant.
function keepVisibleAboveKeyboard(el, targetEl) {
    if (!el) return;
    el.addEventListener('focus', () => {
        setTimeout(() => { (targetEl || el).scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 320);
    });
}
keepVisibleAboveKeyboard($('step-input'), $('step-prev'));   // fait remonter jusqu'aux boutons Suivant/Précédent
keepVisibleAboveKeyboard($('cat-custom-input'));
keepVisibleAboveKeyboard($('pack-save-name'));
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
        const active = document.activeElement;
        if (active && active.id === 'step-input') { $('step-prev').scrollIntoView({ block: 'center', behavior: 'smooth' }); }
        else if (active && (active.id === 'cat-custom-input' || active.id === 'pack-save-name')) {
            active.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
    });
}

// ---------- Démarrage ----------
connect();
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}