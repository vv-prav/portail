// =====================================================================
//  LE MOT JUSTE — client (thermomètre, particules glace/braise, i18n)
// =====================================================================
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- i18n ----------
const I18N = {
    fr: {
        guess_ph: "Un mot…", guess_send: "Envoyer", close: "Fermer", cancel: "Annuler", back_salon: "Retour au salon",
        tool_giveup: "Rendre", panel_chat: "Discussion", panel_arch: "Archives",
        list_word: "Mot", list_score: "Proximité", list_empty: "Tape un premier mot pour commencer à chercher.",
        chat_sub: "Pas de spoilers, restez fair-play 🙂", chat_ph: "Ton message…", chat_send: "Envoyer",
        chat_empty: "Personne n'a encore écrit aujourd'hui.",
        arch_sub: "Rejouables, mais hors classement.", arch_today: "Revenir à aujourd'hui", arch_none: "Aucune archive.",
        clue_start: "Devine le mot secret : plus tu es proche par le sens, plus c'est chaud.",
        clue_playing: "Continue de chercher — regarde ce qui se réchauffe.",
        clue_arch: "Mot d'archive — hors classement.",
        clue_done: "Trouvé ! 🎉", clue_gaveup: "Tu as abandonné cette manche.",
        err_generic: "Une erreur est survenue.", unknown_word: "n'est pas dans mon petit dictionnaire.",
        end_title_win: "Trouvé !", end_title_giveup: "Abandonné",
        end_in: "en", end_guess_one: "mot essayé", end_guess_many: "mots essayés",
        end_rank: "sur", end_streak: "jours d'affilée", end_noboard: "Continue demain !",
        board_title: "Classement du jour", board_empty: "Personne n'a encore trouvé le mot aujourd'hui.",
        giveup_title: "Abandonner ?", giveup_sub: "Le mot sera révélé et tu ne figureras pas au classement.",
        giveup_yes: "Oui, révéler le mot",
        live_done: "ont trouvé", vocab_size: "mots connus",
        tier_glacial: "glacial", tier_froid: "froid", tier_frais: "frais", tier_tiede: "tiède",
        tier_chaud: "chaud", tier_brulant: "brûlant", tier_trouve: "trouvé !",
        already_tried: "déjà essayé",
    },
    en: {
        guess_ph: "A word…", guess_send: "Send", close: "Close", cancel: "Cancel", back_salon: "Back to the lounge",
        tool_giveup: "Give up", panel_chat: "Chat", panel_arch: "Archives",
        list_word: "Word", list_score: "Closeness", list_empty: "Type a first word to start searching.",
        chat_sub: "No spoilers, play fair 🙂", chat_ph: "Your message…", chat_send: "Send",
        chat_empty: "Nobody has written today yet.",
        arch_sub: "Replayable, but off the leaderboard.", arch_today: "Back to today", arch_none: "No archives.",
        clue_start: "Guess the secret word: the closer in meaning, the hotter it gets.",
        clue_playing: "Keep searching — watch what's heating up.",
        clue_arch: "Archive word — off the leaderboard.",
        clue_done: "Found it! 🎉", clue_gaveup: "You gave up this round.",
        err_generic: "Something went wrong.", unknown_word: "isn't in my little dictionary.",
        end_title_win: "Found it!", end_title_giveup: "Given up",
        end_in: "in", end_guess_one: "word tried", end_guess_many: "words tried",
        end_rank: "of", end_streak: "day streak", end_noboard: "Try again tomorrow!",
        board_title: "Today's leaderboard", board_empty: "Nobody has found the word today yet.",
        giveup_title: "Give up?", giveup_sub: "The word will be revealed and you won't appear on the leaderboard.",
        giveup_yes: "Yes, reveal the word",
        live_done: "found it", vocab_size: "known words",
        tier_glacial: "freezing", tier_froid: "cold", tier_frais: "cool", tier_tiede: "warm",
        tier_chaud: "hot", tier_brulant: "burning", tier_trouve: "found!",
        already_tried: "already tried",
    },
    es: {
        guess_ph: "Una palabra…", guess_send: "Enviar", close: "Cerrar", cancel: "Cancelar", back_salon: "Volver al salón",
        tool_giveup: "Rendirse", panel_chat: "Charla", panel_arch: "Archivos",
        list_word: "Palabra", list_score: "Cercanía", list_empty: "Escribe una primera palabra para empezar a buscar.",
        chat_sub: "Sin spoilers, juega limpio 🙂", chat_ph: "Tu mensaje…", chat_send: "Enviar",
        chat_empty: "Nadie ha escrito hoy todavía.",
        arch_sub: "Rejugables, pero fuera de la clasificación.", arch_today: "Volver a hoy", arch_none: "Sin archivos.",
        clue_start: "Adivina la palabra secreta: cuanto más cerca en significado, más caliente.",
        clue_playing: "Sigue buscando — mira qué se calienta.",
        clue_arch: "Palabra de archivo — fuera de clasificación.",
        clue_done: "¡Encontrada! 🎉", clue_gaveup: "Has abandonado esta ronda.",
        err_generic: "Ha ocurrido un error.", unknown_word: "no está en mi pequeño diccionario.",
        end_title_win: "¡Encontrada!", end_title_giveup: "Abandonada",
        end_in: "en", end_guess_one: "palabra probada", end_guess_many: "palabras probadas",
        end_rank: "de", end_streak: "días seguidos", end_noboard: "¡Inténtalo mañana!",
        board_title: "Clasificación del día", board_empty: "Nadie ha encontrado la palabra hoy todavía.",
        giveup_title: "¿Rendirse?", giveup_sub: "La palabra se revelará y no aparecerás en la clasificación.",
        giveup_yes: "Sí, revelar la palabra",
        live_done: "la encontraron", vocab_size: "palabras conocidas",
        tier_glacial: "helado", tier_froid: "frío", tier_frais: "fresco", tier_tiede: "tibio",
        tier_chaud: "caliente", tier_brulant: "ardiente", tier_trouve: "¡encontrada!",
        already_tried: "ya probada",
    },
};
let LANG = localStorage.getItem('erquy_lang') || 'fr';
if (!I18N[LANG]) LANG = 'fr';
const t = (k) => (I18N[LANG] && I18N[LANG][k]) || I18N.fr[k] || k;
const LOCALE = LANG === 'en' ? 'en-GB' : (LANG === 'es' ? 'es-ES' : 'fr-FR');
function applyI18n() {
    document.querySelectorAll('[data-i]').forEach(el => { el.textContent = t(el.dataset.i); });
    document.querySelectorAll('[data-ph]').forEach(el => { el.placeholder = t(el.dataset.ph); });
}

// ---------- État ----------
let P = null;
let viewDate = null, isArchive = false;
let guesses = [];               // [{word, score}] trié desc
let solved = false, gaveUp = false;
let bestScore = -100;
let nextIn = 0, timerId = null;

async function api(path, body) {
    const res = await fetch(path, {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch (e) {}
    return { ok: res.ok, data };
}
const dq = () => (viewDate ? '&date=' + viewDate : '');
const mbody = (o) => (viewDate ? { ...o, date: viewDate } : o);

let toastT = null;
function toast(msg) {
    const el = $('mj-toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 2400);
}

// ---------- Paliers de température ----------
function tierOf(score) {
    if (score >= 100) return 'trouve';
    if (score >= 70) return 'brulant';
    if (score >= 50) return 'chaud';
    if (score >= 30) return 'tiede';
    if (score >= 15) return 'frais';
    if (score >= 0) return 'froid';
    return 'glacial';
}
function emojiOf(tier) {
    return { glacial: '🧊', froid: '❄️', frais: '🌫️', tiede: '🙂', chaud: '🌤️', brulant: '🔥', trouve: '🎉' }[tier] || '🧊';
}
// 0..1 depuis un score -100..100
function heatOf(score) { return Math.max(0, Math.min(1, (score + 100) / 200)); }

function updateAmbientHeat() {
    document.body.style.setProperty('--heat', heatOf(Math.max(bestScore, -100)).toFixed(3));
    document.body.className = document.body.className.replace(/\btemp-\S+/g, '').trim();
    document.body.classList.add('temp-' + tierOf(bestScore));
}

// ---------- Thermomètre ----------
function paintThermo(score, word) {
    const pct = Math.round(heatOf(score) * 100);
    $('mj-thermo-fill').style.height = pct + '%';
    $('mj-thermo-emoji').textContent = emojiOf(tierOf(score));
    $('mj-last-word').textContent = word || '—';
    const sc = $('mj-last-score');
    sc.textContent = (score === null || score === undefined) ? '—' : (score > 0 ? '+' : '') + score.toFixed(2) + '°';
    sc.className = 'mj-last-score' + (score >= 70 ? ' hot' : (score >= 90 ? ' burn' : '')) + (score < 0 ? ' cold' : '');
    if (score >= 90) sc.classList.add('burn');
    $('mj-last').classList.remove('flash'); void $('mj-last').offsetWidth;
    $('mj-last').classList.add('flash');
}

// ---------- Liste des mots essayés ----------
function renderList(freshWord) {
    $('mj-empty').hidden = !!guesses.length;
    $('mj-list').innerHTML = guesses.map((g, i) => {
        const tier = tierOf(g.score);
        const fresh = freshWord && g.word === freshWord;
        return `<div class="mj-row tier-${tier}${i === 0 ? ' top1' : ''}${fresh ? ' enter' : ''}">
            <span class="rn">${i + 1}</span><span class="rw">${esc(g.word)}</span><span class="rs">${g.score > 0 ? '+' : ''}${g.score.toFixed(2)}</span>
        </div>`;
    }).join('');
}

// ---------- Particules (canvas) : neige ambiante + rafales glace/braise ----------
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

let ambient = [];    // flocons/braises ambiants, densité selon --heat
let bursts = [];     // particules de rafale (résultat d'une tentative)

function seedAmbient() {
    ambient = [];
    const n = 26;
    for (let i = 0; i < n; i++) ambient.push(spawnAmbient(Math.random() * H));
}
function spawnAmbient(y) {
    return { x: Math.random() * W, y: y != null ? y : -10, r: 1.4 + Math.random() * 2.2, vy: 0.25 + Math.random() * 0.5, drift: (Math.random() - 0.5) * 0.4, phase: Math.random() * Math.PI * 2 };
}
function spawnBurst(score, cx, cy) {
    const heat = heatOf(score);
    const n = 14 + Math.round(heat * 18);
    for (let i = 0; i < n; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1 + Math.random() * (2.5 + heat * 2.5);
        bursts.push({
            x: cx, y: cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - heat * 1.2,
            r: 1.5 + Math.random() * (2 + heat * 2), life: 1, heat,
        });
    }
}
function frameColor(heat, alpha) {
    // bleu glacé -> ambre -> braise, selon la chaleur (0..1)
    const cold = [79, 180, 224], mid = [232, 195, 79], hot = [224, 62, 63];
    let c;
    if (heat < 0.5) { const k = heat / 0.5; c = cold.map((v, i) => v + (mid[i] - v) * k); }
    else { const k = (heat - 0.5) / 0.5; c = mid.map((v, i) => v + (hot[i] - v) * k); }
    return `rgba(${c[0]|0},${c[1]|0},${c[2]|0},${alpha})`;
}
function tick() {
    ctx.clearRect(0, 0, W, H);
    const heatAmb = heatOf(Math.max(bestScore, -100));

    // ambiant : flocons doux qui descendent, teintés par l'ambiance
    for (const p of ambient) {
        p.y += p.vy; p.phase += 0.02;
        p.x += Math.sin(p.phase) * p.drift;
        if (p.y > H + 10) { Object.assign(p, spawnAmbient(-10)); }
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = frameColor(heatAmb * 0.6, 0.16 + heatAmb * 0.06);
        ctx.fill();
    }

    // rafales : réaction à chaque tentative
    bursts = bursts.filter(b => b.life > 0.02);
    for (const b of bursts) {
        b.x += b.vx; b.y += b.vy; b.vy += 0.02; b.life *= 0.955;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r * b.life, 0, Math.PI * 2);
        ctx.fillStyle = frameColor(b.heat, b.life * 0.9);
        ctx.fill();
    }
    requestAnimationFrame(tick);
}
seedAmbient();
requestAnimationFrame(tick);

// ---------- Soumission d'un mot ----------
$('mj-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (solved || gaveUp) return;
    const val = $('mj-input').value.trim();
    if (!val) return;
    $('mj-input').value = '';
    const { ok, data } = await api('/api/juste/guess', mbody({ guess: val }));
    if (!ok) { toast((data && data.error) || t('err_generic')); return; }
    if (data.unknown) { toast('« ' + val + ' » ' + t('unknown_word')); return; }

    const rect = $('mj-thermo-bulb').getBoundingClientRect();
    spawnBurst(data.score, rect.left + rect.width / 2, rect.top + rect.height / 2);

    const already = guesses.some(g => g.word === data.word);
    guesses = data.guesses;
    if (data.score > bestScore) bestScore = data.score;
    updateAmbientHeat();
    paintThermo(data.score, data.word);
    renderList(already ? null : data.word);
    if (navigator.vibrate) { try { navigator.vibrate(data.score >= 70 ? [20, 30, 20] : 15); } catch (e) {} }

    if (data.solved) {
        solved = true;
        $('mj-clue').textContent = t('clue_done');
        setTimeout(() => showEnd('win', data), 750);
    } else {
        $('mj-clue').textContent = isArchive ? t('clue_arch') : t('clue_playing');
    }
});

// ---------- Abandon ----------
$('t-giveup').addEventListener('click', () => {
    if (solved || gaveUp) return;
    ask('🏳️', t('giveup_title'), t('giveup_sub'), [{ label: t('giveup_yes'), danger: true, run: doGiveUp }]);
});
async function doGiveUp() {
    const { data } = await api('/api/juste/giveup', mbody({}));
    if (!data || !data.answer) return;
    gaveUp = true;
    $('mj-clue').textContent = t('clue_gaveup');
    paintThermo(bestScore, data.answer);
    showEnd('giveup', data);
}

// ---------- Fin de manche ----------
function guessLabel(n) { return n + ' ' + (n === 1 ? t('end_guess_one') : t('end_guess_many')); }
async function showEnd(kind, data) {
    $('mj-end-emoji').textContent = kind === 'win' ? '🎉' : '🏳️';
    $('mj-end-title').textContent = t(kind === 'win' ? 'end_title_win' : 'end_title_giveup');
    $('mj-end-word').textContent = (data.answer || '').toLowerCase();
    let sub = '';
    if (kind === 'win') {
        sub = t('end_in') + ' ' + guessLabel(guesses.length);
        if (!isArchive && data.rank) sub += ' · ' + data.rank + ' ' + t('end_rank') + ' ' + data.total;
        if (!isArchive && data.streak && data.streak.current > 1) sub += ' · 🔥 ' + data.streak.current + ' ' + t('end_streak');
    } else {
        sub = t('end_noboard');
    }
    $('mj-end-sub').textContent = sub;
    lockPlayArea(true);
    const b = await api('/api/juste/board' + (viewDate ? '?date=' + viewDate : ''));
    const board = (b.data && b.data.board) || [];
    renderBoard(board);
    showInlineBoard(board);
    $('mj-end').hidden = false;
    refreshLive();
}
$('mj-end-close').addEventListener('click', () => { $('mj-end').hidden = true; });

function renderBoard(board, target) {
    const box = target || $('mj-board');
    if (!board.length) { box.innerHTML = '<p class="mj-board-empty">' + t('board_empty') + '</p>'; return; }
    const medal = ['🥇', '🥈', '🥉'];
    box.innerHTML = '<div class="mj-board-title">' + t('board_title') + '</div>' +
        board.slice(0, 15).map((e, i) => `<div class="mj-board-row${i < 3 ? ' top' + (i + 1) : ''}">
            <span class="bpos">${medal[i] || (i + 1)}</span><span class="bname">${esc(e.u)}</span><span class="btime">${guessLabel(e.guesses)}</span></div>`).join('');
}
function showInlineBoard(board) { renderBoard(board, $('mj-inline-board')); $('mj-inline-board').hidden = false; }
function hideInlineBoard() { $('mj-inline-board').hidden = true; }
// Une manche finie : plus de saisie possible, plus de bouton "Rendre"
function lockPlayArea(locked) {
    $('mj-form').hidden = locked;
    $('t-giveup').hidden = locked;
}

// ---------- Pouls en direct ----------
async function refreshLive() {
    const { data } = await api('/api/juste/board' + dq());
    const chip = $('mj-live');
    const n = (data && data.board && data.board.length) || 0;
    if (!n) { chip.hidden = true; return; }
    chip.innerHTML = '🏁 <b>' + n + '</b> ' + t('live_done');
    chip.hidden = false;
}
let liveTimer = null;
function startLive() { clearInterval(liveTimer); liveTimer = setInterval(refreshLive, 30000); refreshLive(); }

// ---------- Discussion ----------
async function loadComments() {
    const { data } = await api('/api/juste/comments');
    const list = (data && data.comments) || [];
    $('cmt-list').innerHTML = list.length
        ? list.map(c => `<div class="cmt"><b>${esc(c.u)}</b><span>${c.t}</span></div>`).join('')
        : '<p class="mj-board-empty">' + t('chat_empty') + '</p>';
    $('cmt-list').scrollTop = $('cmt-list').scrollHeight;
}
$('btn-comments').addEventListener('click', () => { $('mj-comments').hidden = false; loadComments(); });
$('cmt-close').addEventListener('click', () => { $('mj-comments').hidden = true; });
$('cmt-send').addEventListener('click', async () => {
    const val = $('cmt-input').value.trim();
    if (!val) return;
    $('cmt-input').value = '';
    const { ok, data } = await api('/api/juste/comments', { text: val });
    if (ok) $('cmt-list').innerHTML = (data.comments || []).map(c => `<div class="cmt"><b>${esc(c.u)}</b><span>${c.t}</span></div>`).join('');
    $('cmt-list').scrollTop = $('cmt-list').scrollHeight;
});
$('cmt-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('cmt-send').click(); });

// ---------- Archives ----------
$('btn-archive').addEventListener('click', async () => {
    $('mj-archive').hidden = false;
    const { data } = await api('/api/juste/archive');
    const days = (data && data.days) || [];
    $('arch-list').innerHTML = days.map(d => {
        const label = new Date(d.date + 'T12:00:00').toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });
        const status = d.solved ? '🎉 ' + guessLabel(d.guesses) : (d.guesses > 0 ? '🏳️' : '—');
        return `<button class="arch-row${d.solved ? ' solved' : ''}" data-date="${d.date}">${label}<span class="a-status">${status}</span></button>`;
    }).join('') || '<p class="mj-board-empty">' + t('arch_none') + '</p>';
    $('arch-list').querySelectorAll('.arch-row').forEach(b => b.addEventListener('click', () => {
        viewDate = b.dataset.date; isArchive = true;
        $('mj-archive').hidden = true;
        load();
    }));
});
$('arch-close').addEventListener('click', () => { $('mj-archive').hidden = true; });
$('arch-today').addEventListener('click', () => {
    viewDate = null; isArchive = false;
    $('mj-archive').hidden = true;
    load();
});

// ---------- Confirmation générique ----------
function ask(emoji, title, sub, actions) {
    $('ask-emoji').textContent = emoji;
    $('ask-title').textContent = title;
    $('ask-sub').textContent = sub || '';
    const box = $('ask-acts'); box.innerHTML = '';
    actions.forEach(a => {
        const b = document.createElement('button');
        b.className = 'mj-btn' + (a.danger ? ' danger' : '');
        b.type = 'button'; b.textContent = a.label;
        b.addEventListener('click', () => { $('mj-ask').hidden = true; a.run(); });
        box.appendChild(b);
    });
    $('mj-ask').hidden = false;
}
$('ask-cancel').addEventListener('click', () => { $('mj-ask').hidden = true; });

// ---------- Démarrage ----------
function tickClock() {
    if (nextIn > 0) {
        nextIn--;
        const h = Math.floor(nextIn / 3600), m = Math.floor((nextIn % 3600) / 60);
        $('mj-next').innerHTML = '🕛 ' + (h > 0 ? h + ' h ' + m + ' min' : m + ' min');
        if (nextIn === 0 && !isArchive) location.reload();
    }
}
function startTicker() { if (!timerId) timerId = setInterval(tickClock, 1000); tickClock(); }

async function load() {
    document.body.className = 'is-boot';
    ['mj-end', 'mj-ask', 'mj-comments', 'mj-archive'].forEach(id => { $(id).hidden = true; });
    guesses = []; solved = false; gaveUp = false; bestScore = -100;

    const { ok, data } = await api('/api/juste/today' + dq());
    if (!ok) { location.href = '/'; return; }
    P = data;
    isArchive = !!P.isArchive;
    nextIn = P.nextIn || 0;
    $('mj-date').textContent = new Date(P.date + 'T12:00:00').toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
    $('mj-archive-chip').hidden = !isArchive;
    $('mj-vocab').innerHTML = '📖 <b>' + P.vocabCount + '</b> ' + t('vocab_size');

    guesses = P.guesses || [];
    solved = !!P.solved; gaveUp = !!P.gaveUp;
    bestScore = guesses.reduce((m, g) => Math.max(m, g.score), -100);
    updateAmbientHeat();
    if (guesses.length) paintThermo(guesses[0].score, guesses[0].word);
    else paintThermo(null, '—');
    renderList();

    document.body.className = 'is-ready';

    if (solved || gaveUp) {
        $('mj-clue').textContent = solved ? t('clue_done') : t('clue_gaveup');
        lockPlayArea(true);
        const b = await api('/api/juste/board' + dq());
        const board = (b.data && b.data.board) || [];
        renderBoard(board);
        showInlineBoard(board);
    } else {
        $('mj-clue').textContent = isArchive ? t('clue_arch') : (guesses.length ? t('clue_playing') : t('clue_start'));
        lockPlayArea(false);
        hideInlineBoard();
    }
    startTicker();
    startLive();
    if (!isArchive && !solved && !gaveUp) setTimeout(() => $('mj-input').focus(), 200);
}

applyI18n();
load();

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}