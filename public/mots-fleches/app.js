// =====================================================================
//  MOTS FLÉCHÉS — client
// =====================================================================
const $ = (id) => document.getElementById(id);
const key = (r, c) => r + ',' + c;

let P = null;                 // grille du jour (sans solution)
let level = localStorage.getItem('mf_level') || 'facile';
let values = {};              // "r,c" -> lettre
let els = {};                 // "r,c" -> élément
let slots = [], cellSlots = {}, inputCells = [];
let active = null, dir = 'right';
let solved = false, gaveUp = false;
let seconds = 0, timerId = null, startedAt = null, started = false;

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

// ---------- Chronomètre ----------
function fmt(s) { const m = Math.floor(s / 60); return m + ':' + String(s % 60).padStart(2, '0'); }
// Le chrono court en continu depuis le démarrage (même si on quitte l'app)
function tick() {
    if (!startedAt || solved || gaveUp) return;
    seconds = Math.floor((Date.now() - startedAt) / 1000);
    $('mf-timer').textContent = fmt(seconds);
}
function startTimer() { if (!timerId) timerId = setInterval(tick, 1000); tick(); }
function stopTimer() { clearInterval(timerId); timerId = null; }

// ---------- Construction ----------
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
                        `<span class="def-one"><span class="def-txt">${d.clue}</span>` +
                        `<span class="def-arrow ${d.dir}">${d.dir === 'right' ? '▶' : '▼'}</span></span>`).join('');
                    cell.querySelectorAll('.def-one').forEach((el, i) => {
                        el.addEventListener('click', (e) => { e.stopPropagation(); selectSlotByDef(here[i]); });
                    });
                } else cell.className = 'mf-block';
            }
            g.appendChild(cell);
        }
    }
    for (const k in values) if (els[k]) els[k].querySelector('.mf-letter').textContent = values[k];
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
    $('mf-clue').innerHTML = `<span class="clue-dir">${s.dir === 'right' ? '▶' : '▼'}</span> ${s.clue}`;
}
function selectCell(r, c, toggle) {
    const k = key(r, c);
    if (!cellSlots[k]) return;
    if (toggle && active && active.r === r && active.c === c) {
        const cs = cellSlots[k];
        if (cs.right != null && cs.down != null) dir = (dir === 'right') ? 'down' : 'right';
    } else if (cellSlots[k][dir] == null) {
        dir = (cellSlots[k].right != null) ? 'right' : 'down';
    }
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
    const idx = currentSlotIdx(); if (idx < 0) return;
    const cells = slots[idx].cells;
    const pos = cells.findIndex(cc => cc.r === active.r && cc.c === active.c);
    const next = pos + delta;
    if (pos >= 0 && next >= 0 && next < cells.length) active = { ...cells[next] };
}

// ---------- Saisie ----------
function setLetter(ch) {
    if (!active || solved || gaveUp || !started) return;
    const k = key(active.r, active.c);
    if (!els[k]) return;
    values[k] = ch;
    els[k].querySelector('.mf-letter').textContent = ch;
    els[k].classList.remove('wrong');
    step(1); refreshHighlights(); saveSoon(); maybeSolved();
}
function backspace() {
    if (!active || solved || gaveUp || !started) return;
    const k = key(active.r, active.c);
    if (values[k]) { delete values[k]; els[k].querySelector('.mf-letter').textContent = ''; }
    else {
        step(-1);
        const k2 = key(active.r, active.c);
        delete values[k2];
        if (els[k2]) els[k2].querySelector('.mf-letter').textContent = '';
    }
    refreshHighlights(); saveSoon();
}

let saveT = null;
function saveSoon() { clearTimeout(saveT); saveT = setTimeout(() => api('/api/mf/progress', { level, cells: values }), 700); }

// ---------- Vérification ----------
function paintSlots(list) {
    (list || []).forEach(s => {
        const idx = slots.findIndex(x => x.defR === s.r && x.defC === s.c && x.dir === s.dir);
        if (idx < 0) return;
        slots[idx].cells.forEach(({ r, c }) => {
            const el = els[key(r, c)]; if (!el) return;
            if (s.ok) el.classList.add('good');
        });
    });
}
async function doCheck(showWrong) {
    const { data } = await api('/api/mf/check', { level, cells: values });
    if (!data || !data.slots) return null;
    Object.values(els).forEach(el => el.classList.remove('good'));
    paintSlots(data.slots);
    if (showWrong) {
        (data.wrong || []).forEach(k => {
            const el = els[k]; if (!el) return;
            el.classList.add('wrong');
            setTimeout(() => el.classList.remove('wrong'), 1600);
        });
    }
    return data;
}
async function maybeSolved() {
    if (solved || gaveUp) return;
    if (!inputCells.every(({ r, c }) => values[key(r, c)])) return;   // pas encore rempli
    const data = await doCheck(false);
    if (data && data.allOk) finish();
}

// ---------- Fin de partie ----------
async function finish() {
    if (solved) return;
    solved = true; stopTimer();
    await api('/api/mf/progress', { level, cells: values });
    const { data } = await api('/api/mf/solve', { level });
    if (data && data.seconds) { seconds = data.seconds; $('mf-timer').textContent = fmt(seconds); }
    $('mf-end-emoji').textContent = '🎉';
    $('mf-end-title').textContent = 'Grille résolue !';
    $('mf-end-sub').textContent = data && data.rank
        ? `Ton temps : ${fmt(data.seconds || seconds)} · ${data.rank}${data.rank === 1 ? 'er' : 'e'} sur ${data.total}`
        : `Ton temps : ${fmt(seconds)}`;
    renderBoard((data && data.board) || [], $('mf-board'));
    showInlineBoard((data && data.board) || []);
    $('mf-end').hidden = false;
}
// Classement affiché dans la page, sous la grille du niveau terminé
function showInlineBoard(board) {
    const box = $('mf-inline-board');
    if (!box) return;
    renderBoard(board, box);
    box.hidden = false;
}
function renderBoard(board, box) {
    if (!box) box = $('mf-board');
    if (!board.length) { box.innerHTML = '<p class="mf-board-empty">Personne d’autre n’a encore terminé aujourd’hui.</p>'; return; }
    box.innerHTML = '<div class="mf-board-title">Classement du jour · ' + (P.levelLabel || level) + '</div>' +
        board.slice(0, 12).map((e, i) => `<div class="mf-board-row${i === 0 ? ' first' : ''}">
            <span class="bpos">${i + 1}</span><span class="bname">${e.u}</span><span class="btime">${e.t}</span></div>`).join('');
}

// ---------- Abandon ----------
$('mf-giveup').addEventListener('click', () => { if (!solved) $('mf-confirm').hidden = false; });
$('mf-confirm-no').addEventListener('click', () => { $('mf-confirm').hidden = true; });
$('mf-confirm-yes').addEventListener('click', async () => {
    $('mf-confirm').hidden = true;
    const { data } = await api('/api/mf/giveup', { level });
    if (!data || !data.grid) return;
    gaveUp = true; stopTimer();
    inputCells.forEach(({ r, c }) => {
        const ch = data.grid[r][c];
        values[key(r, c)] = ch;
        const el = els[key(r, c)];
        if (el) { el.querySelector('.mf-letter').textContent = ch; el.classList.add('revealed'); }
    });
    const b = await api('/api/mf/board?level=' + level);
    $('mf-end-emoji').textContent = '🏳️';
    $('mf-end-title').textContent = 'Réponses révélées';
    $('mf-end-sub').textContent = 'Pas de classement cette fois — retente ta chance demain !';
    renderBoard((b.data && b.data.board) || [], $('mf-board'));
    showInlineBoard((b.data && b.data.board) || []);
    $('mf-end').hidden = false;
});

// --- Démarrage de la grille (le chrono part et ne s'arrête plus) ---
async function beginGrid() {
    const { data } = await api('/api/mf/start', { level });
    startedAt = (data && data.startedAt) || Date.now();
    started = true;
    document.body.classList.remove('not-started');
    startTimer();
    const first = inputCells[0];
    if (first) selectCell(first.r, first.c, false);
}
$('mf-start-btn').addEventListener('click', beginGrid);

$('mf-check').addEventListener('click', () => doCheck(true));
$('mf-end-close').addEventListener('click', () => { $('mf-end').hidden = true; });

// ---------- Clavier tactile ----------
function buildKeyboard() {
    const kb = $('mf-keyboard');
    kb.innerHTML = '';
    [['A','Z','E','R','T','Y','U','I','O','P'], ['Q','S','D','F','G','H','J','K','L','M'], ['W','X','C','V','B','N']].forEach((row, i) => {
        const line = document.createElement('div');
        line.className = 'kb-row';
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
    if (e.key === 'Backspace') { e.preventDefault(); backspace(); }
    else if (/^[a-zA-Z]$/.test(e.key)) setLetter(e.key.toUpperCase());
    else if (e.key === 'ArrowRight') { dir = 'right'; step(1); refreshHighlights(); }
    else if (e.key === 'ArrowLeft') { dir = 'right'; step(-1); refreshHighlights(); }
    else if (e.key === 'ArrowDown') { dir = 'down'; step(1); refreshHighlights(); }
    else if (e.key === 'ArrowUp') { dir = 'down'; step(-1); refreshHighlights(); }
});

// ---------- Niveaux ----------
document.querySelectorAll('.lv').forEach(b => {
    b.addEventListener('click', () => { if (b.dataset.lv !== level) { level = b.dataset.lv; localStorage.setItem('mf_level', level); load(); } });
});
function paintLevels() { document.querySelectorAll('.lv').forEach(b => b.classList.toggle('on', b.dataset.lv === level)); }

// ---------- Chargement ----------
async function load() {
    document.body.className = 'is-boot';
    paintLevels();
    values = {}; active = null; dir = 'right'; solved = false; gaveUp = false;
    seconds = 0; stopTimer(); $('mf-timer').textContent = '0:00';
    $('mf-end').hidden = true; $('mf-confirm').hidden = true;

    const today = await api('/api/mf/today?level=' + level);
    if (!today.ok) { location.href = '/'; return; }
    P = today.data;
    $('mf-date').textContent = new Date(P.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    buildModel(); renderGrid();

    const prog = await api('/api/mf/progress?level=' + level);
    const pr = prog.data && prog.data.progress;
    if (pr) {
        values = pr.cells || {};
        solved = !!pr.solved; gaveUp = !!pr.gaveUp;
        startedAt = pr.startedAt || null;
        seconds = (prog.data.elapsed != null) ? prog.data.elapsed : (pr.seconds || 0);
        for (const k in values) if (els[k]) els[k].querySelector('.mf-letter').textContent = values[k];
        $('mf-timer').textContent = fmt(seconds);
    }
    started = !!startedAt;
    document.body.className = 'is-ready' + (started ? '' : ' not-started');

    if (solved || gaveUp) {
        stopTimer();
        await doCheck(false);                                  // remet les mots trouvés en vert
        const b = await api('/api/mf/board?level=' + level);
        showInlineBoard((b.data && b.data.board) || []);        // classement visible dans l'onglet
    } else if (started) {
        await doCheck(false);                                  // on retrouve ses mots déjà validés
        startTimer();
        $('mf-clue').textContent = 'Touche une case pour continuer.';
    } else {
        $('mf-clue').textContent = 'Appuie sur « Commencer » pour lancer la grille.';
    }
}

buildKeyboard();
load();