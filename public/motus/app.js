// =====================================================================
//  MOTUS — client (saisie native, bascule des tuiles, cascade de victoire)
// =====================================================================
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- i18n (clé partagée avec tout le portail) ----------
const I18N = {
    fr: {
        start_txt: "Un mot à deviner, une couleur pour chaque indice.", start_btn: "Commencer",
        close: "Fermer", cancel: "Annuler", back_salon: "Retour au salon",
        tool_erase: "Effacer", tool_valid: "Valider", tool_giveup: "Rendre",
        panel_chat: "Discussion du jour", panel_arch: "Mots précédents",
        chat_sub: "Pas de spoilers, restez fair-play 🙂", chat_ph: "Ton message…", chat_send: "Envoyer",
        chat_empty: "Personne n'a encore écrit aujourd'hui.",
        arch_sub: "Rejouables, mais hors classement.", arch_today: "Revenir à aujourd'hui", arch_none: "Aucune archive.",
        clue_start: "Devine le mot en 6 essais. La première lettre est offerte.",
        clue_playing: "À toi de jouer — la première lettre est déjà en place.",
        clue_arch: "Mot d'archive — hors classement.",
        clue_done: "Trouvé ! 🎉", clue_lost: "Le mot était caché…", clue_gaveup: "Tu as abandonné cette manche.",
        err_incomplete: "Complète le mot avant de valider.", err_generic: "Une erreur est survenue.",
        end_title_win: "Trouvé !", end_title_lost: "Perdu…", end_title_giveup: "Abandonné",
        end_tries: "en", end_try_one: "essai", end_try_many: "essais",
        end_rank: "sur", end_streak: "jours d'affilée", end_noboard: "Retente demain !",
        board_title: "Classement du jour", board_empty: "Personne n'a encore trouvé le mot aujourd'hui.",
        giveup_title: "Abandonner ?", giveup_sub: "Le mot sera révélé et tu ne figureras pas au classement.",
        giveup_yes: "Oui, révéler le mot",
        erase_title: "Effacer la ligne ?", erase_sub: "Tu repars de la première lettre.", erase_yes: "Effacer",
        live_done: "ont trouvé", tries_left: "essais restants",
        arch_solved: "trouvé", arch_lost: "raté", arch_untried: "pas tenté",
    },
    en: {
        start_txt: "A word to guess in 6 tries — the first letter is free.", start_btn: "Start",
        close: "Close", cancel: "Cancel", back_salon: "Back to the lounge",
        tool_erase: "Erase", tool_valid: "Submit", tool_giveup: "Give up",
        panel_chat: "Today's chat", panel_arch: "Past words",
        chat_sub: "No spoilers, play fair 🙂", chat_ph: "Your message…", chat_send: "Send",
        chat_empty: "Nobody has written today yet.",
        arch_sub: "Replayable, but off the leaderboard.", arch_today: "Back to today", arch_none: "No archives.",
        clue_start: "Guess the word in 6 tries. The first letter is free.",
        clue_playing: "Your turn — the first letter is already in place.",
        clue_arch: "Archive word — off the leaderboard.",
        clue_done: "Found it! 🎉", clue_lost: "The word was…", clue_gaveup: "You gave up this round.",
        err_incomplete: "Complete the word before submitting.", err_generic: "Something went wrong.",
        end_title_win: "Found it!", end_title_lost: "Lost…", end_title_giveup: "Given up",
        end_tries: "in", end_try_one: "try", end_try_many: "tries",
        end_rank: "of", end_streak: "day streak", end_noboard: "Try again tomorrow!",
        board_title: "Today's leaderboard", board_empty: "Nobody has found the word today yet.",
        giveup_title: "Give up?", giveup_sub: "The word will be revealed and you won't appear on the leaderboard.",
        giveup_yes: "Yes, reveal the word",
        erase_title: "Erase the row?", erase_sub: "You start again from the first letter.", erase_yes: "Erase",
        live_done: "found it", tries_left: "tries left",
        arch_solved: "found", arch_lost: "missed", arch_untried: "not tried",
    },
    es: {
        start_txt: "Una palabra que adivinar en 6 intentos — la primera letra es gratis.", start_btn: "Empezar",
        close: "Cerrar", cancel: "Cancelar", back_salon: "Volver al salón",
        tool_erase: "Borrar", tool_valid: "Validar", tool_giveup: "Rendirse",
        panel_chat: "Charla del día", panel_arch: "Palabras anteriores",
        chat_sub: "Sin spoilers, juega limpio 🙂", chat_ph: "Tu mensaje…", chat_send: "Enviar",
        chat_empty: "Nadie ha escrito hoy todavía.",
        arch_sub: "Rejugables, pero fuera de la clasificación.", arch_today: "Volver a hoy", arch_none: "Sin archivos.",
        clue_start: "Adivina la palabra en 6 intentos. La primera letra es gratis.",
        clue_playing: "Tu turno — la primera letra ya está puesta.",
        clue_arch: "Palabra de archivo — fuera de clasificación.",
        clue_done: "¡Encontrada! 🎉", clue_lost: "La palabra era…", clue_gaveup: "Has abandonado esta ronda.",
        err_incomplete: "Completa la palabra antes de validar.", err_generic: "Ha ocurrido un error.",
        end_title_win: "¡Encontrada!", end_title_lost: "Perdida…", end_title_giveup: "Abandonada",
        end_tries: "en", end_try_one: "intento", end_try_many: "intentos",
        end_rank: "de", end_streak: "días seguidos", end_noboard: "¡Inténtalo mañana!",
        board_title: "Clasificación del día", board_empty: "Nadie ha encontrado la palabra hoy todavía.",
        giveup_title: "¿Rendirse?", giveup_sub: "La palabra se revelará y no aparecerás en la clasificación.",
        giveup_yes: "Sí, revelar la palabra",
        erase_title: "¿Borrar la fila?", erase_sub: "Vuelves a empezar desde la primera letra.", erase_yes: "Borrar",
        live_done: "la encontraron", tries_left: "intentos restantes",
        arch_solved: "encontrada", arch_lost: "fallada", arch_untried: "no probada",
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
const WORD_LEN = 6, MAX_TRIES = 6;
const KEY_ROWS = [['A','Z','E','R','T','Y','U','I','O','P'], ['Q','S','D','F','G','H','J','K','L','M'], ['W','X','C','V','B','N']];
let P = null;
let viewDate = null, isArchive = false;
let guesses = [];                 // [{word, marks:[...]}]
let draft = Array(WORD_LEN).fill('');
let curCol = 1;
let tileEls = [];
let started = false, solved = false, lost = false, gaveUp = false;
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
    const el = $('mt-toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 2400);
}

// ---------- Grille ----------
function buildGrid() {
    const g = $('mt-grid');
    g.innerHTML = ''; tileEls = [];
    for (let r = 0; r < MAX_TRIES; r++) {
        const row = [];
        for (let c = 0; c < WORD_LEN; c++) {
            const tile = document.createElement('div');
            tile.className = 'mt-tile';
            tile.addEventListener('click', () => onTileTap(r, c));
            g.appendChild(tile);
            row.push(tile);
        }
        tileEls.push(row);
    }
    fitGrid();
}
function fitGrid() {
    const wrap = $('mt-grid-wrap');
    const w = wrap.clientWidth, h = wrap.clientHeight;
    if (w < 10 || h < 10) return;
    const gap = 6;
    const cell = Math.floor(Math.min((w - gap * (WORD_LEN - 1)) / WORD_LEN, (h - gap * (MAX_TRIES - 1)) / MAX_TRIES));
    $('mt-grid').style.setProperty('--cell', Math.max(30, Math.min(cell, 64)) + 'px');
    positionShadow();
}
let _fitT = null;
function fitGridSoon() { clearTimeout(_fitT); _fitT = setTimeout(fitGrid, 60); }
window.addEventListener('resize', fitGridSoon);
window.addEventListener('orientationchange', fitGridSoon);
if (window.visualViewport) window.visualViewport.addEventListener('resize', fitGridSoon);

function renderAll() {
    for (let r = 0; r < MAX_TRIES; r++) {
        const known = guesses[r];
        for (let c = 0; c < WORD_LEN; c++) {
            const tile = tileEls[r][c];
            tile.className = 'mt-tile';
            if (known) {
                tile.textContent = known.word[c];
                tile.classList.add(known.marks[c]);
            } else if (r === guesses.length && !isRowGameOver()) {
                tile.textContent = c === 0 ? P.firstLetter : (draft[c] || '');
                if (c === 0) tile.classList.add('locked');
                else if (draft[c]) tile.classList.add('filled');
                if (c === curCol) tile.classList.add('cur');
            } else {
                tile.textContent = c === 0 ? P.firstLetter : '';
                if (c === 0) tile.classList.add('locked');
            }
        }
    }
}
function isRowGameOver() { return solved || lost || gaveUp; }

// ---------- Saisie native : un input invisible suit la case active ----------
const shadow = $('mt-shadow');
function positionShadow() {
    if (!started || isRowGameOver() || guesses.length >= MAX_TRIES) { shadow.blur(); return; }
    const el = tileEls[guesses.length] && tileEls[guesses.length][curCol];
    if (!el) return;
    shadow.style.width = el.offsetWidth + 'px';
    shadow.style.height = el.offsetHeight + 'px';
    shadow.style.left = el.offsetLeft + 'px';
    shadow.style.top = el.offsetTop + 'px';
    if (document.activeElement !== shadow) shadow.focus({ preventScroll: true });
}
function onTileTap(r, c) {
    if (!started || isRowGameOver() || r !== guesses.length || c === 0) return;
    curCol = c;
    renderAll(); positionShadow();
}
shadow.addEventListener('input', () => {
    const raw = shadow.value.replace(/[^a-zA-Z]/g, '');
    shadow.value = '';
    if (!raw) { draft[curCol] = ''; renderAll(); return; }
    draft[curCol] = raw.slice(-1).toUpperCase();
    if (curCol < WORD_LEN - 1) curCol++;
    renderAll(); positionShadow();
});
shadow.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); trySubmit(); }
    else if (e.key === 'Backspace' && !shadow.value) {
        e.preventDefault();
        if (draft[curCol]) { draft[curCol] = ''; }
        else if (curCol > 1) { curCol--; draft[curCol] = ''; }
        renderAll(); positionShadow();
    } else if (e.key === 'ArrowLeft') { e.preventDefault(); if (curCol > 1) { curCol--; renderAll(); positionShadow(); } }
    else if (e.key === 'ArrowRight') { e.preventDefault(); if (curCol < WORD_LEN - 1) { curCol++; renderAll(); positionShadow(); } }
});

// ---------- Bandeau de lettres (info + raccourci de saisie) ----------
let keyEls = {};
function buildKeys() {
    const box = $('mt-keys'); box.innerHTML = ''; keyEls = {};
    KEY_ROWS.forEach(row => {
        row.forEach(ch => {
            const b = document.createElement('button');
            b.className = 'mt-key'; b.type = 'button'; b.textContent = ch;
            b.addEventListener('click', () => {
                if (!started || isRowGameOver() || guesses.length >= MAX_TRIES) return;
                draft[curCol] = ch;
                if (curCol < WORD_LEN - 1) curCol++;
                renderAll(); positionShadow();
            });
            box.appendChild(b);
            keyEls[ch] = b;
        });
    });
}
function updateKeyHints() {
    const best = {};
    const rank = { absent: 1, present: 2, correct: 3 };
    guesses.forEach(g => {
        for (let i = 0; i < WORD_LEN; i++) {
            const ch = g.word[i], m = g.marks[i];
            if (!best[ch] || rank[m] > rank[best[ch]]) best[ch] = m;
        }
    });
    Object.entries(keyEls).forEach(([ch, el]) => {
        el.classList.remove('correct', 'present', 'absent');
        if (best[ch]) el.classList.add(best[ch]);
    });
}

// ---------- Animations ----------
function spawnDust(tileEl) {
    for (let i = 0; i < 3; i++) {
        const d = document.createElement('span');
        d.className = 'mt-dust';
        const angle = Math.random() * Math.PI * 2, dist = 14 + Math.random() * 10;
        d.style.setProperty('--dx', (Math.cos(angle) * dist).toFixed(1) + 'px');
        d.style.setProperty('--dy', (Math.sin(angle) * dist).toFixed(1) + 'px');
        tileEl.appendChild(d);
        requestAnimationFrame(() => d.classList.add('go'));
        setTimeout(() => d.remove(), 760);
    }
}
function shakeRow(r) {
    (tileEls[r] || []).forEach(tile => {
        tile.classList.remove('shake'); void tile.offsetWidth;
        tile.classList.add('shake');
    });
    if (navigator.vibrate) { try { navigator.vibrate(40); } catch (e) {} }
}
// Bascule de la ligne, lettre par lettre, révélant la couleur à mi-parcours.
function flipRow(r, word, marks, cb) {
    const STAGGER = 130, DUR = 500;
    tileEls[r].forEach((tile, c) => {
        setTimeout(() => {
            tile.textContent = word[c];
            tile.classList.remove('flip', 'locked'); void tile.offsetWidth;
            tile.classList.add('flip');
            setTimeout(() => { tile.classList.add(marks[c]); }, DUR * 0.48);
        }, c * STAGGER);
    });
    setTimeout(cb, (WORD_LEN - 1) * STAGGER + DUR + 60);
}
// Victoire : vague dorée + poussière de laiton sur la ligne gagnante.
function winRowCascade(r, cb) {
    const DELAY = 75;
    tileEls[r].forEach((tile, c) => {
        setTimeout(() => {
            tile.classList.remove('win'); void tile.offsetWidth;
            tile.classList.add('win');
            spawnDust(tile);
        }, c * DELAY);
    });
    setTimeout(cb, (WORD_LEN - 1) * DELAY + 480);
}
// Révélation (défaite ou abandon) : vague plus sourde, sans confettis.
function revealRow(r, word, cls, cb) {
    const DELAY = 70;
    tileEls[r].forEach((tile, c) => {
        setTimeout(() => {
            tile.textContent = word[c];
            tile.classList.remove('locked', cls); void tile.offsetWidth;
            tile.classList.add(cls);
        }, c * DELAY);
    });
    setTimeout(cb, (WORD_LEN - 1) * DELAY + 460);
}

// ---------- Validation d'une ligne ----------
async function trySubmit() {
    if (!started || isRowGameOver() || guesses.length >= MAX_TRIES) return;
    if (draft.slice(1).some(x => !x)) { shakeRow(guesses.length); toast(t('err_incomplete')); return; }
    const guess = draft.join('');
    const r = guesses.length;
    const { ok, data } = await api('/api/motus/guess', mbody({ guess }));
    if (!ok) { shakeRow(r); toast(data.error || t('err_generic')); return; }
    shadow.value = '';
    flipRow(r, guess, data.marks, () => {
        guesses.push({ word: guess, marks: data.marks });
        updateKeyHints();
        $('mt-tries').textContent = String(Math.max(0, MAX_TRIES - guesses.length));
        if (data.solved) {
            solved = true;
            if (navigator.vibrate) { try { navigator.vibrate([30, 50, 30, 50, 60]); } catch (e) {} }
            $('mt-clue').textContent = t('clue_done');
            winRowCascade(r, () => showEnd('win', data));
        } else if (data.lost) {
            lost = true;
            $('mt-clue').textContent = t('clue_lost');
            showEnd('lost', data);
        } else {
            draft = Array(WORD_LEN).fill(''); draft[0] = P.firstLetter; curCol = 1;
            renderAll(); positionShadow();
        }
    });
}
$('t-valid').addEventListener('click', trySubmit);
$('t-erase').addEventListener('click', () => {
    if (!started || isRowGameOver()) return;
    if (!draft.slice(1).some(Boolean)) return;
    ask('🧹', t('erase_title'), t('erase_sub'), [
        { label: t('erase_yes'), danger: true, run: () => {
            draft = Array(WORD_LEN).fill(''); draft[0] = P.firstLetter; curCol = 1;
            renderAll(); positionShadow();
        } },
    ]);
});
$('t-giveup').addEventListener('click', () => {
    if (!started || isRowGameOver()) return;
    ask('🏳️', t('giveup_title'), t('giveup_sub'), [
        { label: t('giveup_yes'), danger: true, run: doGiveUp },
    ]);
});
async function doGiveUp() {
    const { data } = await api('/api/motus/giveup', mbody({}));
    if (!data || !data.answer) return;
    gaveUp = true;
    $('mt-clue').textContent = t('clue_gaveup');
    const r = Math.min(guesses.length, MAX_TRIES - 1);
    revealRow(r, data.answer, 'reveal-lost', () => showEnd('giveup', data));
}

// ---------- Fin de manche ----------
function tryLabel(n) { return n + ' ' + (n === 1 ? t('end_try_one') : t('end_try_many')); }
async function showEnd(kind, data) {
    $('mt-end-emoji').textContent = kind === 'win' ? '🎉' : (kind === 'giveup' ? '🏳️' : '💤');
    $('mt-end-title').textContent = t(kind === 'win' ? 'end_title_win' : (kind === 'giveup' ? 'end_title_giveup' : 'end_title_lost'));
    $('mt-end-word').textContent = data.answer || '';
    $('mt-end-def').textContent = data.definition ? data.definition : '';
    let sub = '';
    if (kind === 'win') {
        sub = t('end_tries') + ' ' + tryLabel(data.guesses || guesses.length);
        if (!isArchive && data.rank) sub += ' · ' + data.rank + ' ' + t('end_rank') + ' ' + data.total;
        if (!isArchive && data.streak && data.streak.current > 1) sub += ' · 🔥 ' + data.streak.current + ' ' + t('end_streak');
        if (isArchive) sub += ' · ' + t('arch_solved');
    } else {
        sub = t('end_noboard');
    }
    $('mt-end-sub').textContent = sub;
    const b = await api('/api/motus/board' + (viewDate ? '?date=' + viewDate : ''));
    renderBoard((b.data && b.data.board) || []);
    showInlineBoard((b.data && b.data.board) || []);
    $('mt-end').hidden = false;
    refreshLiveChip();
}
$('mt-end-close').addEventListener('click', () => { $('mt-end').hidden = true; });

function renderBoard(board) {
    const box = $('mt-board');
    if (!board.length) { box.innerHTML = '<p class="mt-board-empty">' + t('board_empty') + '</p>'; return; }
    const medal = ['🥇', '🥈', '🥉'];
    box.innerHTML = '<div class="mt-board-title">' + t('board_title') + '</div>' +
        board.slice(0, 15).map((e, i) => `<div class="mt-board-row${i < 3 ? ' top' + (i + 1) : ''}">
            <span class="bpos">${medal[i] || (i + 1)}</span><span class="bname">${esc(e.u)}</span><span class="btime">${tryLabel(e.tries)}</span></div>`).join('');
}
function showInlineBoard(board) { renderBoard(board); const src = $('mt-board').innerHTML; $('mt-inline-board').innerHTML = src; $('mt-inline-board').hidden = false; fitGridSoon(); }

// ---------- Pouls en direct ----------
async function refreshLiveChip() {
    const { data } = await api('/api/motus/board' + dq());
    const chip = $('mt-live');
    const n = (data && data.board && data.board.length) || 0;
    if (!n) { chip.hidden = true; return; }
    chip.innerHTML = '🏁 <b>' + n + '</b> ' + t('live_done');
    chip.hidden = false;
}
let liveTimer = null;
function startLive() { clearInterval(liveTimer); liveTimer = setInterval(refreshLiveChip, 30000); refreshLiveChip(); }

// ---------- Discussion ----------
async function loadComments() {
    const { data } = await api('/api/motus/comments');
    const list = (data && data.comments) || [];
    $('cmt-list').innerHTML = list.length
        ? list.map(c => `<div class="cmt"><b>${esc(c.u)}</b><span>${c.t}</span></div>`).join('')
        : '<p class="mt-board-empty">' + t('chat_empty') + '</p>';
    $('cmt-list').scrollTop = $('cmt-list').scrollHeight;
}
$('btn-comments').addEventListener('click', () => { $('mt-comments').hidden = false; loadComments(); });
$('cmt-close').addEventListener('click', () => { $('mt-comments').hidden = true; });
$('cmt-send').addEventListener('click', async () => {
    const val = $('cmt-input').value.trim();
    if (!val) return;
    $('cmt-input').value = '';
    const { ok, data } = await api('/api/motus/comments', { text: val });
    if (ok) $('cmt-list').innerHTML = (data.comments || []).map(c => `<div class="cmt"><b>${esc(c.u)}</b><span>${c.t}</span></div>`).join('');
    $('cmt-list').scrollTop = $('cmt-list').scrollHeight;
});
$('cmt-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('cmt-send').click(); });

// ---------- Archives ----------
$('btn-archive').addEventListener('click', async () => {
    $('mt-archive').hidden = false;
    const { data } = await api('/api/motus/archive');
    const days = (data && data.days) || [];
    $('arch-list').innerHTML = days.map(d => {
        const label = new Date(d.date + 'T12:00:00').toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });
        const status = d.solved ? t('arch_solved') + ' · ' + tryLabel(d.tries) : (d.tries >= MAX_TRIES ? t('arch_lost') : t('arch_untried'));
        return `<button class="arch-row${d.solved ? ' solved' : ''}" data-date="${d.date}">${label}<span class="a-status">${status}</span></button>`;
    }).join('') || '<p class="mt-board-empty">' + t('arch_none') + '</p>';
    $('arch-list').querySelectorAll('.arch-row').forEach(b => b.addEventListener('click', () => {
        viewDate = b.dataset.date; isArchive = true;
        $('mt-archive').hidden = true;
        load();
    }));
});
$('arch-close').addEventListener('click', () => { $('mt-archive').hidden = true; });
$('arch-today').addEventListener('click', () => {
    viewDate = null; isArchive = false;
    $('mt-archive').hidden = true;
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
        b.className = 'mt-btn' + (a.danger ? ' danger' : '');
        b.type = 'button'; b.textContent = a.label;
        b.addEventListener('click', () => { $('mt-ask').hidden = true; a.run(); });
        box.appendChild(b);
    });
    $('mt-ask').hidden = false;
}
$('ask-cancel').addEventListener('click', () => { $('mt-ask').hidden = true; });

// ---------- Démarrage ----------
function tick() {
    if (nextIn > 0) {
        nextIn--;
        const h = Math.floor(nextIn / 3600), m = Math.floor((nextIn % 3600) / 60);
        $('mt-next').innerHTML = '🕛 ' + (h > 0 ? h + ' h ' + m + ' min' : m + ' min');
        if (nextIn === 0 && !isArchive) location.reload();
    }
}
function startTicker() { if (!timerId) timerId = setInterval(tick, 1000); tick(); }

$('mt-start-btn').addEventListener('click', () => {
    started = true;
    document.body.classList.remove('not-started');
    renderAll(); positionShadow();
});

async function load() {
    document.body.className = 'is-boot';
    ['mt-end', 'mt-ask', 'mt-comments', 'mt-archive'].forEach(id => { $(id).hidden = true; });
    $('mt-inline-board').hidden = true;
    solved = false; lost = false; gaveUp = false; started = false;
    guesses = []; draft = Array(WORD_LEN).fill(''); curCol = 1;

    const { ok, data } = await api('/api/motus/today' + dq());
    if (!ok) { location.href = '/'; return; }
    P = data;
    isArchive = !!P.isArchive;
    nextIn = P.nextIn || 0;
    draft[0] = P.firstLetter;
    $('mt-date').textContent = new Date(P.date + 'T12:00:00').toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
    $('mt-archive-chip').hidden = !isArchive;

    buildGrid(); buildKeys();

    const prog = P.progress;
    if (prog && Array.isArray(prog.guesses)) guesses = prog.guesses.slice();
    solved = !!(prog && prog.solved);
    gaveUp = !!(prog && prog.gaveUp);
    lost = !solved && !gaveUp && guesses.length >= MAX_TRIES;
    updateKeyHints();
    $('mt-tries').textContent = String(Math.max(0, MAX_TRIES - guesses.length));

    started = guesses.length > 0 || solved || lost || gaveUp;
    document.body.className = 'is-ready' + (started ? '' : ' not-started');

    if (solved || lost || gaveUp) {
        renderAll();
        $('mt-clue').textContent = solved ? t('clue_done') : (gaveUp ? t('clue_gaveup') : t('clue_lost'));
        const b = await api('/api/motus/board' + dq());
        showInlineBoard((b.data && b.data.board) || []);
    } else {
        renderAll();
        $('mt-clue').textContent = isArchive ? t('clue_arch') : (started ? t('clue_playing') : t('clue_start'));
    }
    fitGridSoon();
    startTicker();
    startLive();
}

applyI18n();
load();

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}