// =====================================================================
//  MOTS FLÉCHÉS — client
// =====================================================================
const $ = (id) => document.getElementById(id);
const key = (r, c) => r + ',' + c;
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let P = null;
let level = localStorage.getItem('mf_level') || 'moyen';
let viewDate = null;                 // null = aujourd'hui, sinon archive
let isArchive = false;
let values = {}, drafts = {}, els = {};
let slots = [], cellSlots = {}, inputCells = [];
let active = null, dir = 'right';
let solved = false, gaveUp = false, started = false;
let startedAt = null, penalty = 0, seconds = 0, timerId = null, nextIn = 0;
let pencil = false;

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
    g.style.gridTemplateColumns = `repeat(${P.cols}, 1fr)`;
    g.innerHTML = ''; els = {};
    for (let r = 0; r < P.rows; r++) {
        for (let c = 0; c < P.cols; c++) {
            const cell = document.createElement('div');
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
}
function repaintValues() {
    for (const k in els) {
        const el = els[k], v = values[k] || '';
        el.querySelector('.mf-letter').textContent = v;
        el.classList.toggle('draft', !!(v && drafts[k]));
    }
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
}
function selectCell(r, c, toggle) {
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
function setLetter(ch) {
    if (!active || solved || gaveUp || !started) return;
    const k = key(active.r, active.c);
    if (!els[k]) return;
    values[k] = ch;
    if (pencil) drafts[k] = 1; else delete drafts[k];
    els[k].classList.remove('wrong', 'good');
    repaintValues();
    const idx = currentSlotIdx();
    if (!step(1) || (idx >= 0 && slots[idx].cells.every(({ r, c }) => values[key(r, c)]))) jumpToNextSlot();
    refreshHighlights(); saveSoon(); maybeSolved();
}
function backspace() {
    if (!active || solved || gaveUp || !started) return;
    const k = key(active.r, active.c);
    if (values[k]) { delete values[k]; delete drafts[k]; }
    else { step(-1); const k2 = key(active.r, active.c); delete values[k2]; delete drafts[k2]; }
    repaintValues(); refreshHighlights(); saveSoon();
}
let saveT = null;
function saveSoon() { clearTimeout(saveT); saveT = setTimeout(() => api('/api/mf/progress', dbody({ level, cells: values, drafts })), 600); }

// ---------- Vérification ----------
async function doCheck(showWrong) {
    const { data } = await api('/api/mf/check', dbody({ level, cells: values }));
    if (!data || !data.slots) return null;
    Object.values(els).forEach(el => el.classList.remove('good'));
    data.slots.forEach(s => {
        if (!s.ok) return;
        const idx = slots.findIndex(x => x.defR === s.r && x.defC === s.c && x.dir === s.dir);
        if (idx >= 0) slots[idx].cells.forEach(({ r, c }) => els[key(r, c)] && els[key(r, c)].classList.add('good'));
    });
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

// ---------- Fin ----------
async function finish() {
    if (solved) return;
    solved = true;
    await api('/api/mf/progress', dbody({ level, cells: values, drafts }));
    const { data } = await api('/api/mf/solve', dbody({ level }));
    if (data && data.seconds) { seconds = data.seconds; $('mf-timer').textContent = fmt(seconds); }
    $('mf-end-emoji').textContent = '🎉';
    $('mf-end-title').textContent = 'Grille résolue !';
    let sub = 'Ton temps : ' + fmt((data && data.seconds) || seconds);
    if (data && data.isArchive) sub += ' · grille d’archive (hors classement)';
    else if (data && data.rank) sub += ' · ' + data.rank + (data.rank === 1 ? 'er' : 'e') + ' sur ' + data.total;
    if (data && data.streak && data.streak.current > 1) sub += ' · 🔥 ' + data.streak.current + ' jours d’affilée';
    $('mf-end-sub').textContent = sub;
    renderBoard((data && data.board) || [], $('mf-board'));
    showInlineBoard((data && data.board) || []);
    $('mf-end').hidden = false;
    refreshStates();
}
function renderBoard(board, box) {
    if (!box) box = $('mf-board');
    if (!board.length) { box.innerHTML = '<p class="mf-board-empty">Personne n’a encore terminé cette grille aujourd’hui.</p>'; return; }
    const medal = ['🥇', '🥈', '🥉'];
    box.innerHTML = '<div class="mf-board-title">Classement du jour · ' + esc(P.levelLabel || level) + '</div>' +
        board.slice(0, 15).map((e, i) => `<div class="mf-board-row${i < 3 ? ' top top' + (i + 1) : ''}">
            <span class="bpos">${medal[i] || (i + 1)}</span><span class="bname">${esc(e.u)}</span><span class="btime">${esc(e.t)}</span></div>`).join('');
}
function showInlineBoard(board) { renderBoard(board, $('mf-inline-board')); $('mf-inline-board').hidden = false; }

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
$('t-pencil').addEventListener('click', () => {
    pencil = !pencil;
    $('t-pencil').classList.toggle('on', pencil);
});
$('t-check').addEventListener('click', () => { if (started) doCheck(true); });
$('t-erase').addEventListener('click', () => {
    if (!started || solved || gaveUp) return;
    ask('🧹', 'Effacer', 'Que veux-tu effacer ?', [
        { label: 'Le mot en cours', run: () => {
            const idx = currentSlotIdx(); if (idx < 0) return;
            slots[idx].cells.forEach(({ r, c }) => { delete values[key(r, c)]; delete drafts[key(r, c)]; });
            repaintValues(); refreshHighlights(); saveSoon();
        } },
        { label: 'Toute la grille', danger: true, run: () => {
            values = {}; drafts = {};
            Object.values(els).forEach(el => el.classList.remove('good', 'wrong'));
            repaintValues(); refreshHighlights(); saveSoon();
        } },
    ]);
});
$('t-hint').addEventListener('click', () => {
    if (!started || solved || gaveUp) return;
    if (!active) { $('mf-clue').textContent = 'Choisis d’abord une case.'; return; }
    ask('💡', 'Demander un indice', 'Le temps ajouté compte dans ton score.', [
        { label: 'Révéler cette lettre (+30 s)', run: () => useHint('letter') },
        { label: 'Révéler tout le mot (+5 min)', danger: true, run: () => useHint('word') },
    ]);
});
async function useHint(type) {
    const idx = currentSlotIdx();
    const body = type === 'word' && idx >= 0
        ? { level, type: 'word', r: slots[idx].defR, c: slots[idx].defC, dir: slots[idx].dir }
        : { level, type: 'letter', r: active.r, c: active.c };
    const { ok, data } = await api('/api/mf/hint', dbody(body));
    if (!ok || !data.reveal) return;
    Object.entries(data.reveal).forEach(([k, v]) => { values[k] = v; delete drafts[k]; });
    penalty = data.penalty || penalty;
    repaintValues(); refreshHighlights(); tick(); maybeSolved();
}
$('t-giveup').addEventListener('click', () => {
    if (!started || solved || gaveUp) return;
    ask('🏳️', 'Abandonner ?', 'Les réponses seront révélées et tu ne figureras pas au classement.', [
        { label: 'Oui, montrer les réponses', danger: true, run: doGiveUp },
    ]);
});
async function doGiveUp() {
    const { data } = await api('/api/mf/giveup', dbody({ level }));
    if (!data || !data.grid) return;
    gaveUp = true;
    inputCells.forEach(({ r, c }) => {
        values[key(r, c)] = data.grid[r][c]; delete drafts[key(r, c)];
        const el = els[key(r, c)]; if (el) el.classList.add('revealed');
    });
    repaintValues();
    const b = await api('/api/mf/board?level=' + level + dq());
    $('mf-end-emoji').textContent = '🏳️';
    $('mf-end-title').textContent = 'Réponses révélées';
    $('mf-end-sub').textContent = 'Pas de classement cette fois — retente demain !';
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

// ---------- Clavier ----------
function buildKeyboard() {
    const kb = $('mf-keyboard'); kb.innerHTML = '';
    [['A','Z','E','R','T','Y','U','I','O','P'], ['Q','S','D','F','G','H','J','K','L','M'], ['W','X','C','V','B','N']].forEach((row, i) => {
        const line = document.createElement('div'); line.className = 'kb-row';
        row.forEach(ch => {
            const b = document.createElement('button');
            b.className = 'kb'; b.type = 'button'; b.textContent = ch;
            b.addEventListener('click', () => setLetter(ch));
            line.appendChild(b);
        });
        if (i === 2) {
            const del = document.createElement('button');
            del.className = 'kb wide'; del.type = 'button'; del.innerHTML = '⌫';
            del.addEventListener('click', backspace);
            line.appendChild(del);
        }
        kb.appendChild(line);
    });
}
document.addEventListener('keydown', (e) => {
    if (!$('mf-comments').hidden) return;
    if (e.key === 'Backspace') { e.preventDefault(); backspace(); }
    else if (/^[a-zA-Z]$/.test(e.key)) setLetter(e.key.toUpperCase());
    else if (e.key === 'ArrowRight') { dir = 'right'; step(1); refreshHighlights(); }
    else if (e.key === 'ArrowLeft') { dir = 'right'; step(-1); refreshHighlights(); }
    else if (e.key === 'ArrowDown') { dir = 'down'; step(1); refreshHighlights(); }
    else if (e.key === 'ArrowUp') { dir = 'down'; step(-1); refreshHighlights(); }
});

// ---------- Démarrage ----------
async function beginGrid() {
    const { data } = await api('/api/mf/start', dbody({ level }));
    startedAt = (data && data.startedAt) || Date.now();
    penalty = (data && data.penalty) || 0;
    started = true;
    document.body.classList.remove('not-started');
    startTimer(); refreshStates();
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
        : '<p class="mf-board-empty">Personne n’a encore écrit aujourd’hui.</p>';
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
        const lbl = new Date(d.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
        return `<button class="arch-row" data-date="${d.date}"><span>${lbl}</span><em>${d.done}/3</em></button>`;
    }).join('') || '<p class="mf-board-empty">Aucune archive.</p>';
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
    values = {}; drafts = {}; active = null; dir = 'right';
    solved = false; gaveUp = false; started = false;
    startedAt = null; penalty = 0; seconds = 0;
    $('mf-timer').textContent = '0:00';
    ['mf-end', 'mf-ask', 'mf-comments', 'mf-archive', 'mf-defzoom'].forEach(id => { $(id).hidden = true; });
    $('mf-inline-board').hidden = true;
    pencil = false; $('t-pencil').classList.remove('on');

    const today = await api('/api/mf/today?level=' + level + dq());
    if (!today.ok) { location.href = '/'; return; }
    P = today.data;
    isArchive = !!P.isArchive;
    nextIn = P.nextIn || 0;
    $('mf-date').textContent = new Date(P.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    $('mf-archive-chip').hidden = !isArchive;
    buildModel(); renderGrid();

    const prog = await api('/api/mf/progress?level=' + level + dq());
    const pr = prog.data && prog.data.progress;
    if (pr) {
        values = pr.cells || {}; drafts = pr.drafts || {};
        solved = !!pr.solved; gaveUp = !!pr.gaveUp;
        startedAt = pr.startedAt || null; penalty = pr.penalty || 0;
        seconds = (prog.data.elapsed != null) ? prog.data.elapsed : (pr.seconds || 0);
        repaintValues();
        $('mf-timer').textContent = fmt(seconds);
    }
    started = !!startedAt;
    document.body.className = 'is-ready' + (started ? '' : ' not-started');

    if (solved || gaveUp) {
        await doCheck(false);
        if (gaveUp) inputCells.forEach(({ r, c }) => els[key(r, c)] && els[key(r, c)].classList.add('revealed'));
        const b = await api('/api/mf/board?level=' + level + dq());
        showInlineBoard((b.data && b.data.board) || []);
        $('mf-clue').textContent = solved ? 'Grille terminée 🎉' : 'Réponses révélées.';
    } else if (started) {
        await doCheck(false);
        $('mf-clue').textContent = 'Touche une case pour continuer.';
    } else {
        $('mf-clue').textContent = isArchive
            ? 'Grille d’archive — hors classement. Appuie sur « Commencer ».'
            : 'Appuie sur « Commencer » pour lancer la grille.';
    }
    startTimer();
    refreshStates();
}

buildKeyboard();
load();