// =====================================================================
//  MOTS FLÉCHÉS — client
// =====================================================================
const $ = (id) => document.getElementById(id);
const key = (r, c) => r + ',' + c;
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- i18n (clé partagée avec le salon et le Perudo) ----------
const I18N = {
    fr: {
        start_txt: "Le chrono démarre dès que tu commences et ne s'arrête plus.",
        start_btn: "Commencer", close: "Fermer", cancel: "Annuler", back_salon: "Retour au salon",
        tool_hint: "Indice", tool_erase: "Effacer", tool_check: "Vérifier", tool_giveup: "Rendre",
        panel_chat: "Discussion du jour", panel_arch: "Grilles précédentes",
        chat_sub: "Pas de spoilers, restez fair-play 🙂", chat_ph: "Ton message…", chat_send: "Envoyer",
        chat_empty: "Personne n'a encore écrit aujourd'hui.",
        arch_sub: "Rejouables, mais hors classement.", arch_today: "Revenir à aujourd'hui", arch_none: "Aucune archive.",
        clue_start: "Appuie sur « Commencer » pour lancer la grille.",
        clue_resume: "Touche une case pour continuer.",
        clue_arch: "Grille d'archive — hors classement. Appuie sur « Commencer ».",
        clue_done: "Grille terminée 🎉", clue_revealed: "Réponses révélées.",
        clue_pick: "Choisis d'abord une case.",
        end_title: "Grille résolue !", end_revealed: "Réponses révélées",
        end_time: "Ton temps :", end_arch: "grille d'archive (hors classement)", end_of: "sur",
        end_streak: "jours d'affilée", end_noboard: "Pas de classement cette fois — retente demain !",
        board_title: "Classement du jour", board_empty: "Personne n'a encore terminé cette grille aujourd'hui.",
        erase_title: "Effacer", erase_sub: "Que veux-tu effacer ?", erase_word: "Le mot en cours", erase_all: "Toute la grille",
        hint_title: "Demander un indice", hint_sub: "Le temps ajouté compte dans ton score.",
        hint_letter: "Révéler cette lettre (+30 s)", hint_word: "Révéler tout le mot (+5 min)",
        giveup_title: "Abandonner ?", giveup_sub: "Les réponses seront révélées et tu ne figureras pas au classement.",
        giveup_yes: "Oui, montrer les réponses",
        lv_moyen: "Moyen", lv_difficile: "Difficile", lv_expert: "Expert",
        live_done: "ont fini", tip_zoom: "Astuce : garde le doigt appuyé sur une définition pour l'agrandir.",
    },
    en: {
        start_txt: "The clock starts as soon as you begin — and never stops.",
        start_btn: "Start", close: "Close", cancel: "Cancel", back_salon: "Back to the lounge",
        tool_hint: "Hint", tool_erase: "Erase", tool_check: "Check", tool_giveup: "Give up",
        panel_chat: "Today's chat", panel_arch: "Past grids",
        chat_sub: "No spoilers, play fair 🙂", chat_ph: "Your message…", chat_send: "Send",
        chat_empty: "Nobody has written today yet.",
        arch_sub: "Replayable, but off the leaderboard.", arch_today: "Back to today", arch_none: "No archives.",
        clue_start: "Tap “Start” to begin the grid.",
        clue_resume: "Tap a square to continue.",
        clue_arch: "Archive grid — off the leaderboard. Tap “Start”.",
        clue_done: "Grid solved 🎉", clue_revealed: "Answers revealed.",
        clue_pick: "Pick a square first.",
        end_title: "Grid solved!", end_revealed: "Answers revealed",
        end_time: "Your time:", end_arch: "archive grid (off the leaderboard)", end_of: "of",
        end_streak: "day streak", end_noboard: "No ranking this time — try again tomorrow!",
        board_title: "Today's leaderboard", board_empty: "Nobody has finished this grid today yet.",
        erase_title: "Erase", erase_sub: "What do you want to erase?", erase_word: "Current word", erase_all: "The whole grid",
        hint_title: "Ask for a hint", hint_sub: "The added time counts in your score.",
        hint_letter: "Reveal this letter (+30 s)", hint_word: "Reveal the whole word (+5 min)",
        giveup_title: "Give up?", giveup_sub: "Answers will be revealed and you won't appear on the leaderboard.",
        giveup_yes: "Yes, show the answers",
        lv_moyen: "Medium", lv_difficile: "Hard", lv_expert: "Expert",
        live_done: "finished", tip_zoom: "Tip: press and hold a clue to enlarge it.",
    },
    es: {
        start_txt: "El cronómetro arranca en cuanto empiezas — y no se detiene.",
        start_btn: "Empezar", close: "Cerrar", cancel: "Cancelar", back_salon: "Volver al salón",
        tool_hint: "Pista", tool_erase: "Borrar", tool_check: "Comprobar", tool_giveup: "Rendirse",
        panel_chat: "Charla del día", panel_arch: "Cuadrículas pasadas",
        chat_sub: "Sin spoilers, juega limpio 🙂", chat_ph: "Tu mensaje…", chat_send: "Enviar",
        chat_empty: "Nadie ha escrito hoy todavía.",
        arch_sub: "Rejugables, pero fuera de la clasificación.", arch_today: "Volver a hoy", arch_none: "Sin archivos.",
        clue_start: "Pulsa «Empezar» para lanzar la cuadrícula.",
        clue_resume: "Toca una casilla para continuar.",
        clue_arch: "Cuadrícula de archivo — fuera de clasificación. Pulsa «Empezar».",
        clue_done: "¡Cuadrícula resuelta! 🎉", clue_revealed: "Respuestas reveladas.",
        clue_pick: "Elige primero una casilla.",
        end_title: "¡Cuadrícula resuelta!", end_revealed: "Respuestas reveladas",
        end_time: "Tu tiempo:", end_arch: "cuadrícula de archivo (fuera de clasificación)", end_of: "de",
        end_streak: "días seguidos", end_noboard: "Sin clasificación esta vez — ¡inténtalo mañana!",
        board_title: "Clasificación del día", board_empty: "Nadie ha terminado esta cuadrícula hoy.",
        erase_title: "Borrar", erase_sub: "¿Qué quieres borrar?", erase_word: "La palabra actual", erase_all: "Toda la cuadrícula",
        hint_title: "Pedir una pista", hint_sub: "El tiempo añadido cuenta en tu puntuación.",
        hint_letter: "Revelar esta letra (+30 s)", hint_word: "Revelar toda la palabra (+5 min)",
        giveup_title: "¿Rendirse?", giveup_sub: "Se revelarán las respuestas y no aparecerás en la clasificación.",
        giveup_yes: "Sí, mostrar las respuestas",
        lv_moyen: "Medio", lv_difficile: "Difícil", lv_expert: "Experto",
        live_done: "han terminado", tip_zoom: "Consejo: mantén pulsada una definición para ampliarla.",
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

let P = null;
let level = localStorage.getItem('mf_level') || 'moyen';
let viewDate = null;                 // null = aujourd'hui, sinon archive
let isArchive = false;
let values = {}, els = {};
let slots = [], cellSlots = {}, inputCells = [];
let active = null, dir = 'right';
let solved = false, gaveUp = false, started = false;
let startedAt = null, penalty = 0, seconds = 0, timerId = null, nextIn = 0;

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
const dbody = (o) => (viewDate ? { ...o, date: viewDate } : o);

// ---------- Chronomètre (continu, côté serveur) ----------
function fmt(s) { return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'); }
function tick() {
    if (startedAt && !solved && !gaveUp) {
        seconds = Math.floor((Date.now() - startedAt) / 1000) + penalty;
        $('mf-timer').textContent = fmt(seconds);
    }
    if (nextIn > 0) {
        nextIn--;
        const h = Math.floor(nextIn / 3600), m = Math.floor((nextIn % 3600) / 60);
        $('mf-next').innerHTML = '🕛 ' + (h > 0 ? h + ' h ' + m + ' min' : m + ' min');
        if (nextIn === 0) location.reload();          // nouvelle grille à minuit
    }
}
function startTimer() { if (!timerId) timerId = setInterval(tick, 1000); tick(); }
function stopTimer() { /* le compte à rebours continue, seul le chrono se fige */ }

// ---------- Modèle ----------
function buildModel() {
    inputCells = []; slots = []; cellSlots = {};
    for (let r = 0; r < P.rows; r++) for (let c = 0; c < P.cols; c++) if (P.grid[r][c]) inputCells.push({ r, c });
    P.defs.forEach(def => {
        const cells = [];
        let r = def.r, c = def.c;
        if (def.dir === 'right') { c++; while (c < P.cols && P.grid[r][c]) { cells.push({ r, c }); c++; } }
        else { r++; while (r < P.rows && P.grid[r][c]) { cells.push({ r, c }); r++; } }
        if (!cells.length) return;
        const idx = slots.length;
        slots.push({ defR: def.r, defC: def.c, dir: def.dir, clue: def.clue, cells });
        cells.forEach(({ r, c }) => { (cellSlots[key(r, c)] = cellSlots[key(r, c)] || {})[def.dir] = idx; });
    });
}
function renderGrid() {
    const g = $('mf-grid');
    g.style.setProperty('--cols', P.cols);
    g.innerHTML = ''; els = {};
    for (let r = 0; r < P.rows; r++) {
        for (let c = 0; c < P.cols; c++) {
            const cell = document.createElement('div');
            cell.dataset.row = r;
            if (P.grid[r][c]) {
                cell.className = 'mf-cell';
                cell.innerHTML = '<span class="mf-letter"></span>';
                cell.addEventListener('click', () => selectCell(r, c, true));
                els[key(r, c)] = cell;
            } else {
                const here = P.defs.filter(d => d.r === r && d.c === c);
                if (here.length) {
                    cell.className = 'mf-def' + (here.length > 1 ? ' two' : '');
                    cell.innerHTML = here.map(d =>
                        `<span class="def-one"><span class="def-txt">${esc(d.clue)}</span>` +
                        `<span class="def-arrow ${d.dir}">${d.dir === 'right' ? '▶' : '▼'}</span></span>`).join('');
                    cell.querySelectorAll('.def-one').forEach((el, i) => {
                        let t = null;
                        el.addEventListener('click', (e) => { e.stopPropagation(); selectSlotByDef(here[i]); });
                        el.addEventListener('pointerdown', () => { t = setTimeout(() => showDefZoom(here[i]), 380); });
                        ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => el.addEventListener(ev, () => clearTimeout(t)));
                    });
                } else cell.className = 'mf-block';
            }
            g.appendChild(cell);
        }
    }
    repaintValues();
    fitGrid();
}

// ---------- Dimensionnement dynamique : la grille remplit tout l'espace
//            disponible (largeur ET hauteur), sans jamais déborder de l'écran. ----------
function fitGrid() {
    if (!P) return;
    const wrap = $('mf-grid-wrap');
    const g = $('mf-grid');
    const wrapW = wrap.clientWidth, wrapH = wrap.clientHeight;
    if (wrapW < 10 || wrapH < 10) return;           // pas encore mesurable (display:none, etc.)
    const gap = 2, pad = 4;                          // doit matcher gap/padding du CSS .mf-grid
    const cell = Math.floor(Math.min(
        (wrapW - pad - gap * (P.cols - 1)) / P.cols,
        (wrapH - pad - gap * (P.rows - 1)) / P.rows,
    ));
    g.style.setProperty('--cell', Math.max(22, cell) + 'px');
    positionShadowInput();
}
let _fitT = null;
function fitGridSoon() { clearTimeout(_fitT); _fitT = setTimeout(fitGrid, 60); }
window.addEventListener('resize', fitGridSoon);
window.addEventListener('orientationchange', fitGridSoon);
if (window.visualViewport) window.visualViewport.addEventListener('resize', fitGridSoon);
function repaintValues() {
    for (const k in els) els[k].querySelector('.mf-letter').textContent = values[k] || '';
}

// ---------- Sélection / navigation ----------
function currentSlotIdx() {
    if (!active) return -1;
    const cs = cellSlots[key(active.r, active.c)];
    if (!cs) return -1;
    if (cs[dir] != null) return cs[dir];
    if (cs.right != null) { dir = 'right'; return cs.right; }
    if (cs.down != null) { dir = 'down'; return cs.down; }
    return -1;
}
function refreshHighlights() {
    Object.values(els).forEach(el => el.classList.remove('active', 'in-slot'));
    const idx = currentSlotIdx(); if (idx < 0) return;
    slots[idx].cells.forEach(({ r, c }) => els[key(r, c)] && els[key(r, c)].classList.add('in-slot'));
    if (active && els[key(active.r, active.c)]) els[key(active.r, active.c)].classList.add('active');
    const s = slots[idx];
    $('mf-clue').innerHTML = `<span class="clue-dir">${s.dir === 'right' ? '▶' : '▼'}</span> ${esc(s.clue)}`;
    $('mf-clue').onclick = () => showDefZoom(s);
    positionShadowInput();
}
function selectCell(r, c, toggle) {
    if (!started || solved || gaveUp) return;
    const k = key(r, c);
    if (!cellSlots[k]) return;
    if (toggle && active && active.r === r && active.c === c) {
        const cs = cellSlots[k];
        if (cs.right != null && cs.down != null) dir = (dir === 'right') ? 'down' : 'right';
    } else if (cellSlots[k][dir] == null) dir = (cellSlots[k].right != null) ? 'right' : 'down';
    active = { r, c };
    refreshHighlights();
}
function selectSlotByDef(def) {
    const idx = slots.findIndex(s => s.defR === def.r && s.defC === def.c && s.dir === def.dir);
    if (idx < 0) return;
    dir = def.dir; active = { ...slots[idx].cells[0] };
    refreshHighlights();
}
function step(delta) {
    const idx = currentSlotIdx(); if (idx < 0) return false;
    const cells = slots[idx].cells;
    const pos = cells.findIndex(cc => cc.r === active.r && cc.c === active.c);
    const next = pos + delta;
    if (pos >= 0 && next >= 0 && next < cells.length) { active = { ...cells[next] }; return true; }
    return false;
}
// Passe au mot suivant qui a encore des cases vides
function jumpToNextSlot() {
    const idx = currentSlotIdx();
    for (let i = 1; i <= slots.length; i++) {
        const s = slots[(idx + i) % slots.length];
        const hole = s.cells.find(({ r, c }) => !values[key(r, c)]);
        if (hole) { dir = s.dir; active = { ...hole }; refreshHighlights(); return; }
    }
}

// ---------- Saisie ----------
// Cherche la prochaine case VIDE du mot en cours après la position donnée
// (les cases déjà remplies — typiquement par un mot croisé déjà bon —
// ne sont plus jamais écrasées automatiquement : on saute par-dessus).
function nextEmptyInSlot(idx, fromPos) {
    if (idx < 0) return null;
    const cells = slots[idx].cells;
    for (let p = fromPos + 1; p < cells.length; p++) {
        if (!values[key(cells[p].r, cells[p].c)]) return cells[p];
    }
    return null;
}
function setLetter(ch) {
    if (!active || solved || gaveUp || !started) return;
    const k = key(active.r, active.c);
    if (!els[k]) return;
    values[k] = ch;
    els[k].classList.remove('wrong', 'good');
    repaintValues();
    shadow.value = '';                                // prêt pour la lettre suivante
    const idx = currentSlotIdx();
    const cells = idx >= 0 ? slots[idx].cells : [];
    const pos = cells.findIndex(cc => cc.r === active.r && cc.c === active.c);
    const nextEmpty = nextEmptyInSlot(idx, pos);
    if (nextEmpty) active = { ...nextEmpty };
    else jumpToNextSlot();
    refreshHighlights(); saveSoon(); maybeSolved();
}
function backspace() {
    if (!active || solved || gaveUp || !started) return;
    const k = key(active.r, active.c);
    if (values[k]) { delete values[k]; }
    else { step(-1); delete values[key(active.r, active.c)]; }
    repaintValues(); refreshHighlights(); saveSoon();
}
let saveT = null;
function saveSoon() { clearTimeout(saveT); saveT = setTimeout(() => api('/api/mf/progress', dbody({ level, cells: values })), 600); }

// ---------- Vérification ----------
// L'animation (encre + poussière de laiton) ne joue QUE lors d'une vérification
// manuelle (bouton « Vérifier ») — jamais pendant la frappe ni au chargement.
let _prevGood = new Set();          // mots déjà fêtés lors d'une vérification précédente
function spawnDust(cellEl) {
    for (let i = 0; i < 3; i++) {
        const d = document.createElement('span');
        d.className = 'mf-dust';
        const angle = Math.random() * Math.PI * 2;
        const dist = 14 + Math.random() * 10;
        d.style.setProperty('--dx', (Math.cos(angle) * dist).toFixed(1) + 'px');
        d.style.setProperty('--dy', (Math.sin(angle) * dist).toFixed(1) + 'px');
        cellEl.appendChild(d);
        requestAnimationFrame(() => d.classList.add('go'));
        setTimeout(() => d.remove(), 720);
    }
}
async function doCheck(showWrong) {
    const { data } = await api('/api/mf/check', dbody({ level, cells: values }));
    if (!data || !data.slots) return null;
    Object.values(els).forEach(el => el.classList.remove('good'));
    let newlyDone = false;
    data.slots.forEach(s => {
        if (!s.ok) return;
        const sk = s.dir + ':' + s.r + ':' + s.c;
        const fresh = showWrong && !_prevGood.has(sk);   // « découverte » seulement à la vérification
        if (showWrong) _prevGood.add(sk);
        const idx = slots.findIndex(x => x.defR === s.r && x.defC === s.c && x.dir === s.dir);
        if (idx >= 0) slots[idx].cells.forEach(({ r, c }) => {
            const el = els[key(r, c)];
            if (!el) return;
            el.classList.add('good');
            if (fresh) {
                newlyDone = true;
                el.classList.remove('ink'); void el.offsetWidth;    // relance l'animation
                el.classList.add('ink');
                spawnDust(el);
            }
        });
    });
    if (newlyDone && navigator.vibrate) { try { navigator.vibrate(35); } catch (e) {} }
    if (showWrong) (data.wrong || []).forEach(k => {
        const el = els[k]; if (!el) return;
        el.classList.add('wrong'); setTimeout(() => el.classList.remove('wrong'), 1600);
    });
    return data;
}
async function maybeSolved() {
    if (solved || gaveUp) return;
    if (!inputCells.every(({ r, c }) => values[key(r, c)])) return;
    const data = await doCheck(false);
    if (data && data.allOk) finish();
}

// ---------- Cascade de fin : les cases s'envolent ligne par ligne ----------
const CASCADE_ROW_DELAY = 55;   // ms entre le départ de chaque ligne
const CASCADE_DURATION = 460;   // durée de l'envolée d'une case
function playSolveCascade() {
    return new Promise((resolve) => {
        const g = $('mf-grid');
        const cells = [...g.children];
        if (!cells.length) { resolve(); return; }
        g.classList.add('cascading');
        let maxRow = 0;
        cells.forEach((el) => {
            const r = Number(el.dataset.row || 0);
            if (r > maxRow) maxRow = r;
            el.style.animation = 'none';
            void el.offsetWidth;
            el.style.animationDelay = (r * CASCADE_ROW_DELAY) + 'ms';
            el.classList.remove('cascade'); void el.offsetWidth;
            el.classList.add('cascade');
        });
        const total = maxRow * CASCADE_ROW_DELAY + CASCADE_DURATION;
        setTimeout(() => {
            cells.forEach((el) => { el.classList.remove('cascade'); el.style.animationDelay = ''; });
            g.classList.remove('cascading');
            resolve();
        }, total + 40);
    });
}

// ---------- Fin ----------
async function finish() {
    if (solved) return;
    solved = true;
    await api('/api/mf/progress', dbody({ level, cells: values }));
    const { data } = await api('/api/mf/solve', dbody({ level }));
    if (data && data.seconds) { seconds = data.seconds; $('mf-timer').textContent = fmt(seconds); }
    positionShadowInput();
    if (navigator.vibrate) { try { navigator.vibrate([30, 60, 30, 60, 50]); } catch (e) {} }
    await playSolveCascade();
    $('mf-end-emoji').textContent = '🎉';
    $('mf-end-title').textContent = t('end_title');
    let sub = t('end_time') + ' ' + fmt((data && data.seconds) || seconds);
    if (data && data.isArchive) sub += ' · ' + t('end_arch');
    else if (data && data.rank) sub += ' · ' + data.rank + (LANG === 'fr' ? (data.rank === 1 ? 'er' : 'e') : (LANG === 'es' ? 'º' : (data.rank === 1 ? 'st' : data.rank === 2 ? 'nd' : data.rank === 3 ? 'rd' : 'th'))) + ' ' + t('end_of') + ' ' + data.total;
    if (data && data.streak && data.streak.current > 1) sub += ' · 🔥 ' + data.streak.current + ' ' + t('end_streak');
    $('mf-end-sub').textContent = sub;
    renderBoard((data && data.board) || [], $('mf-board'));
    showInlineBoard((data && data.board) || []);
    $('mf-end').hidden = false;
    refreshStates();
}
function renderBoard(board, box) {
    if (!box) box = $('mf-board');
    if (!board.length) { box.innerHTML = '<p class="mf-board-empty">' + t('board_empty') + '</p>'; return; }
    const medal = ['🥇', '🥈', '🥉'];
    box.innerHTML = '<div class="mf-board-title">' + t('board_title') + ' · ' + t('lv_' + level) + '</div>' +
        board.slice(0, 15).map((e, i) => `<div class="mf-board-row${i < 3 ? ' top top' + (i + 1) : ''}">
            <span class="bpos">${medal[i] || (i + 1)}</span><span class="bname">${esc(e.u)}</span><span class="btime">${esc(e.t)}</span></div>`).join('');
}
function showInlineBoard(board) { renderBoard(board, $('mf-inline-board')); $('mf-inline-board').hidden = false; fitGridSoon(); }

// ---------- Boîte de confirmation générique ----------
function ask(emoji, title, sub, actions) {
    $('ask-emoji').textContent = emoji;
    $('ask-title').textContent = title;
    $('ask-sub').textContent = sub || '';
    const box = $('ask-actions'); box.innerHTML = '';
    actions.forEach(a => {
        const b = document.createElement('button');
        b.className = 'mf-btn' + (a.danger ? ' danger' : '');
        b.type = 'button'; b.textContent = a.label;
        b.addEventListener('click', () => { $('mf-ask').hidden = true; a.run(); });
        box.appendChild(b);
    });
    $('mf-ask').hidden = false;
}
$('ask-cancel').addEventListener('click', () => { $('mf-ask').hidden = true; });

// ---------- Outils ----------
$('t-check').addEventListener('click', () => { if (started) doCheck(true); });
$('t-erase').addEventListener('click', () => {
    if (!started || solved || gaveUp) return;
    ask('🧹', t('erase_title'), t('erase_sub'), [
        { label: t('erase_word'), run: () => {
            const idx = currentSlotIdx(); if (idx < 0) return;
            slots[idx].cells.forEach(({ r, c }) => { delete values[key(r, c)]; });
            repaintValues(); refreshHighlights(); saveSoon();
        } },
        { label: t('erase_all'), danger: true, run: () => {
            values = {};
            Object.values(els).forEach(el => el.classList.remove('good', 'wrong'));
            repaintValues(); refreshHighlights(); saveSoon();
        } },
    ]);
});
$('t-hint').addEventListener('click', () => {
    if (!started || solved || gaveUp) return;
    if (!active) { $('mf-clue').textContent = t('clue_pick'); return; }
    ask('💡', t('hint_title'), t('hint_sub'), [
        { label: t('hint_letter'), run: () => useHint('letter') },
        { label: t('hint_word'), danger: true, run: () => useHint('word') },
    ]);
});
async function useHint(type) {
    const idx = currentSlotIdx();
    const body = type === 'word' && idx >= 0
        ? { level, type: 'word', r: slots[idx].defR, c: slots[idx].defC, dir: slots[idx].dir }
        : { level, type: 'letter', r: active.r, c: active.c };
    const { ok, data } = await api('/api/mf/hint', dbody(body));
    if (!ok || !data.reveal) return;
    Object.entries(data.reveal).forEach(([k, v]) => { values[k] = v; });
    penalty = data.penalty || penalty;
    repaintValues(); refreshHighlights(); tick(); maybeSolved();
}
$('t-giveup').addEventListener('click', () => {
    if (!started || solved || gaveUp) return;
    ask('🏳️', t('giveup_title'), t('giveup_sub'), [
        { label: t('giveup_yes'), danger: true, run: doGiveUp },
    ]);
});
async function doGiveUp() {
    const { data } = await api('/api/mf/giveup', dbody({ level }));
    if (!data || !data.grid) return;
    gaveUp = true;
    inputCells.forEach(({ r, c }) => {
        values[key(r, c)] = data.grid[r][c];
        const el = els[key(r, c)]; if (el) el.classList.add('revealed');
    });
    repaintValues();
    positionShadowInput();
    const b = await api('/api/mf/board?level=' + level + dq());
    $('mf-end-emoji').textContent = '🏳️';
    $('mf-end-title').textContent = t('end_revealed');
    $('mf-end-sub').textContent = t('end_noboard');
    renderBoard((b.data && b.data.board) || [], $('mf-board'));
    showInlineBoard((b.data && b.data.board) || []);
    $('mf-end').hidden = false;
    refreshStates();
}
$('mf-end-close').addEventListener('click', () => { $('mf-end').hidden = true; });

// ---------- Aperçu d'une définition ----------
function showDefZoom(d) {
    $('defzoom-dir').textContent = d.dir === 'right' ? '▶' : '▼';
    $('defzoom-txt').textContent = d.clue;
    $('mf-defzoom').hidden = false;
}
$('defzoom-close').addEventListener('click', () => { $('mf-defzoom').hidden = true; });
$('mf-defzoom').addEventListener('click', (e) => { if (e.target === $('mf-defzoom')) $('mf-defzoom').hidden = true; });

// ---------- Saisie native : un unique input invisible suit la case active ----------
// Il capte le clavier du téléphone (aucun clavier custom à l'écran), tout en
// laissant l'affichage des lettres géré par nos <span class="mf-letter">.
const shadow = $('mf-shadow');

function positionShadowInput() {
    if (!active) { shadow.style.opacity = '0'; shadow.blur(); return; }
    const cellEl = els[key(active.r, active.c)];
    if (!cellEl) return;
    shadow.style.width = cellEl.offsetWidth + 'px';
    shadow.style.height = cellEl.offsetHeight + 'px';
    shadow.style.left = cellEl.offsetLeft + 'px';
    shadow.style.top = cellEl.offsetTop + 'px';
    shadow.value = values[key(active.r, active.c)] || '';
    if (started && !solved && !gaveUp) {
        if (document.activeElement !== shadow) shadow.focus({ preventScroll: true });
    } else {
        shadow.blur();
    }
}
shadow.addEventListener('input', () => {
    const raw = shadow.value.replace(/[^a-zA-Z]/g, '');
    if (!raw) { clearActiveCell(); return; }        // l'utilisateur a supprimé la lettre
    setLetter(raw.slice(-1).toUpperCase());
});
shadow.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && !shadow.value) { e.preventDefault(); backspace(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); dir = 'right'; step(1); refreshHighlights(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); dir = 'right'; step(-1); refreshHighlights(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); dir = 'down'; step(1); refreshHighlights(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); dir = 'down'; step(-1); refreshHighlights(); }
});
function clearActiveCell() {
    if (!active || solved || gaveUp || !started) return;
    delete values[key(active.r, active.c)];
    repaintValues(); refreshHighlights(); saveSoon();
}

// ---------- Démarrage ----------
async function beginGrid() {
    maybeShowTip();
    const { data } = await api('/api/mf/start', dbody({ level }));
    startedAt = (data && data.startedAt) || Date.now();
    penalty = (data && data.penalty) || 0;
    started = true;
    document.body.classList.remove('not-started');
    startTimer(); refreshStates(); startLive();
    const first = inputCells[0];
    if (first) selectCell(first.r, first.c, false);
}
$('mf-start-btn').addEventListener('click', beginGrid);

// ---------- Niveaux ----------
document.querySelectorAll('.lv').forEach(b => {
    b.addEventListener('click', () => { if (b.dataset.lv !== level) { level = b.dataset.lv; localStorage.setItem('mf_level', level); load(); } });
});
function paintLevels() { document.querySelectorAll('.lv').forEach(b => b.classList.toggle('on', b.dataset.lv === level)); }
async function refreshStates() {
    const { data } = await api('/api/mf/states?_=1' + dq());
    if (!data) return;
    if (data.states) document.querySelectorAll('.lv').forEach(b => {
        const st = data.states[b.dataset.lv];
        b.classList.remove('st-encours', 'st-fini', 'st-abandon');
        if (st && st !== 'neuf') b.classList.add('st-' + st);
    });
    if (data.streak) $('mf-streak').innerHTML = '🔥 <b>' + data.streak.current + '</b>';
    if (data.nextIn != null) nextIn = data.nextIn;
}

// ---------- Discussion ----------
$('btn-comments').addEventListener('click', async () => { await loadComments(); $('mf-comments').hidden = false; });
$('cmt-close').addEventListener('click', () => { $('mf-comments').hidden = true; });
async function loadComments() {
    const { data } = await api('/api/mf/comments');
    const box = $('cmt-list');
    const list = (data && data.comments) || [];
    box.innerHTML = list.length
        ? list.map(c => `<div class="cmt"><b>${esc(c.u)}</b><span>${c.t}</span></div>`).join('')
        : '<p class="mf-board-empty">' + t('chat_empty') + '</p>';
    box.scrollTop = box.scrollHeight;
}
async function sendComment() {
    const inp = $('cmt-input'); const text = inp.value.trim();
    if (!text) return;
    inp.value = '';
    const { data } = await api('/api/mf/comments', { text });
    if (data && data.comments) {
        $('cmt-list').innerHTML = data.comments.map(c => `<div class="cmt"><b>${esc(c.u)}</b><span>${c.t}</span></div>`).join('');
        $('cmt-list').scrollTop = $('cmt-list').scrollHeight;
    }
}
$('cmt-send').addEventListener('click', sendComment);
$('cmt-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendComment(); });

// ---------- Archives ----------
$('btn-archive').addEventListener('click', async () => {
    const { data } = await api('/api/mf/archive');
    const box = $('arch-list');
    box.innerHTML = ((data && data.days) || []).map(d => {
        const lbl = new Date(d.date + 'T12:00:00').toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });
        return `<button class="arch-row" data-date="${d.date}"><span>${lbl}</span><em>${d.done}/3</em></button>`;
    }).join('') || '<p class="mf-board-empty">' + t('arch_none') + '</p>';
    box.querySelectorAll('.arch-row').forEach(b => b.addEventListener('click', () => {
        viewDate = b.dataset.date; $('mf-archive').hidden = true; load();
    }));
    $('mf-archive').hidden = false;
});
$('arch-close').addEventListener('click', () => { $('mf-archive').hidden = true; });
$('arch-today').addEventListener('click', () => { viewDate = null; $('mf-archive').hidden = true; load(); });

// ---------- Chargement ----------
async function load() {
    document.body.className = 'is-boot';
    paintLevels();
    values = {}; active = null; dir = 'right'; _prevGood = new Set();
    solved = false; gaveUp = false; started = false;
    startedAt = null; penalty = 0; seconds = 0;
    $('mf-timer').textContent = '0:00';
    ['mf-end', 'mf-ask', 'mf-comments', 'mf-archive', 'mf-defzoom'].forEach(id => { $(id).hidden = true; });
    $('mf-inline-board').hidden = true;

    const today = await api('/api/mf/today?level=' + level + dq());
    if (!today.ok) { location.href = '/'; return; }
    P = today.data;
    isArchive = !!P.isArchive;
    nextIn = P.nextIn || 0;
    $('mf-date').textContent = new Date(P.date + 'T12:00:00').toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
    $('mf-archive-chip').hidden = !isArchive;
    buildModel(); renderGrid();

    const prog = await api('/api/mf/progress?level=' + level + dq());
    const pr = prog.data && prog.data.progress;
    if (pr) {
        values = pr.cells || {};
        solved = !!pr.solved; gaveUp = !!pr.gaveUp;
        startedAt = pr.startedAt || null; penalty = pr.penalty || 0;
        seconds = (prog.data.elapsed != null) ? prog.data.elapsed : (pr.seconds || 0);
        repaintValues();
        $('mf-timer').textContent = fmt(seconds);
    }
    started = !!startedAt;
    document.body.className = 'is-ready' + (started ? '' : ' not-started');
    fitGridSoon();     // la grille n'était pas mesurable tant que la page était cachée

    if (solved || gaveUp) {
        await doCheck(false);
        if (gaveUp) inputCells.forEach(({ r, c }) => els[key(r, c)] && els[key(r, c)].classList.add('revealed'));
        const b = await api('/api/mf/board?level=' + level + dq());
        showInlineBoard((b.data && b.data.board) || []);
        $('mf-clue').textContent = solved ? t('clue_done') : t('clue_revealed');
    } else if (started) {
        await doCheck(false);
        startLive();
        $('mf-clue').textContent = t('clue_resume');
    } else {
        $('mf-clue').textContent = isArchive ? t('clue_arch') : t('clue_start');
    }
    startTimer();
    refreshStates();
}

// Pouls du classement pendant le jeu : « X ont fini · meilleur temps »
let _liveTimer = null;
async function refreshLive() {
    if (solved || gaveUp || !started || isArchive) return;
    const { data } = await api('/api/mf/board?level=' + level + dq());
    const board = (data && data.board) || [];
    const chip = $('mf-live');
    if (!chip) return;
    if (!board.length) { chip.hidden = true; return; }
    chip.innerHTML = '🏁 <b>' + board.length + '</b> ' + t('live_done') + ' · ⚡ ' + esc(board[0].t);
    chip.hidden = false;
}
function startLive() { clearInterval(_liveTimer); _liveTimer = setInterval(refreshLive, 30000); refreshLive(); }

// Astuce montrée une seule fois : l'appui long agrandit une définition
function maybeShowTip() {
    if (localStorage.getItem('mf_tip_zoom')) return;
    localStorage.setItem('mf_tip_zoom', '1');
    const tip = document.createElement('div');
    tip.className = 'mf-tip';
    tip.innerHTML = '🔍 ' + t('tip_zoom');
    document.body.appendChild(tip);
    setTimeout(() => { tip.classList.add('bye'); setTimeout(() => tip.remove(), 400); }, 5200);
}

applyI18n();
load();