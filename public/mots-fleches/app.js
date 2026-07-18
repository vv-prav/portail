// =====================================================================
//  MOTS FLÉCHÉS — moteur client
// =====================================================================
const $ = (id) => document.getElementById(id);
const key = (r, c) => r + ',' + c;

let P = null;            // puzzle du jour
let slots = [];          // mots dérivés de la grille
let cellSlots = {};      // "r,c" -> { right: idx, down: idx }
let defsAt = {};         // "r,c" -> [def, ...]
let inputCells = [];     // liste des cases à remplir
let values = {};         // saisie du joueur : "r,c" -> lettre
let els = {};            // éléments DOM des cases
let active = null;       // {r,c}
let dir = 'right';
let solved = false;

async function api(path, body) {
    const res = await fetch(path, {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    });
    let data = {}; try { data = await res.json(); } catch (e) {}
    return { ok: res.ok, status: res.status, data };
}

// --- Dérive les mots (slots) depuis la grille-solution ---
function buildModel() {
    slots = []; cellSlots = {}; defsAt = {}; inputCells = [];
    for (let r = 0; r < P.rows; r++) for (let c = 0; c < P.cols; c++) {
        if (P.grid[r][c]) inputCells.push({ r, c });
    }
    P.defs.forEach(def => {
        (defsAt[key(def.r, def.c)] = defsAt[key(def.r, def.c)] || []).push(def);
        const cells = [];
        let r = def.r, c = def.c;
        if (def.dir === 'right') { c++; while (c < P.cols && P.grid[r][c]) { cells.push({ r, c }); c++; } }
        else { r++; while (r < P.rows && P.grid[r][c]) { cells.push({ r, c }); r++; } }
        if (!cells.length) return;
        const idx = slots.length;
        slots.push({ clue: def.clue, dir: def.dir, cells, defR: def.r, defC: def.c });
        cells.forEach(cc => { const k = key(cc.r, cc.c); (cellSlots[k] = cellSlots[k] || {})[def.dir] = idx; });
    });
}

// --- Rendu de la grille ---
function renderGrid() {
    const g = $('mf-grid');
    g.style.gridTemplateColumns = `repeat(${P.cols}, 1fr)`;
    g.innerHTML = '';
    els = {};
    for (let r = 0; r < P.rows; r++) for (let c = 0; c < P.cols; c++) {
        const cell = document.createElement('div');
        const k = key(r, c);
        if (P.grid[r][c]) {
            cell.className = 'mf-cell input';
            const span = document.createElement('span');
            span.className = 'mf-letter';
            span.textContent = values[k] || '';
            cell.appendChild(span);
            cell.addEventListener('click', () => selectCell(r, c, true));
        } else if (defsAt[k]) {
            cell.className = 'mf-cell def';
            defsAt[k].forEach(def => {
                const line = document.createElement('div');
                line.className = 'def-line';
                line.innerHTML = `<span class="def-txt">${def.clue}</span><span class="def-arrow ${def.dir}">${def.dir === 'right' ? '▶' : '▼'}</span>`;
                line.addEventListener('click', (e) => { e.stopPropagation(); selectSlotByDef(def); });
                cell.appendChild(line);
            });
        } else {
            cell.className = 'mf-cell block';
        }
        els[k] = cell;
        g.appendChild(cell);
    }
}

function currentSlotIdx() {
    if (!active) return -1;
    const cs = cellSlots[key(active.r, active.c)] || {};
    if (cs[dir] != null) return cs[dir];
    if (cs.right != null) { dir = 'right'; return cs.right; }
    if (cs.down != null) { dir = 'down'; return cs.down; }
    return -1;
}

function refreshHighlights() {
    Object.values(els).forEach(el => el.classList.remove('active', 'in-slot'));
    const idx = currentSlotIdx();
    if (idx < 0) return;
    slots[idx].cells.forEach(cc => els[key(cc.r, cc.c)].classList.add('in-slot'));
    if (active) els[key(active.r, active.c)].classList.add('active');
    // barre d'indice
    const s = slots[idx];
    $('mf-clue').innerHTML = `<span class="clue-dir">${s.dir === 'right' ? '▶' : '▼'}</span> ${s.clue}`;
}

function selectCell(r, c, toggle) {
    const k = key(r, c);
    if (!cellSlots[k]) return;
    if (toggle && active && active.r === r && active.c === c) {
        // bascule de direction si la case appartient aux deux
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
    dir = def.dir;
    active = { ...slots[idx].cells[0] };
    refreshHighlights();
}

function advance() {
    const idx = currentSlotIdx(); if (idx < 0) return;
    const cells = slots[idx].cells;
    const pos = cells.findIndex(cc => cc.r === active.r && cc.c === active.c);
    if (pos >= 0 && pos < cells.length - 1) active = { ...cells[pos + 1] };
}
function retreat() {
    const idx = currentSlotIdx(); if (idx < 0) return;
    const cells = slots[idx].cells;
    const pos = cells.findIndex(cc => cc.r === active.r && cc.c === active.c);
    if (pos > 0) active = { ...cells[pos - 1] };
}

function setLetter(ch) {
    if (!active) return;
    const k = key(active.r, active.c);
    values[k] = ch;
    els[k].querySelector('.mf-letter').textContent = ch;
    els[k].classList.remove('wrong');
    advance();
    refreshHighlights();
    checkSolved();
    saveSoon();
}
function backspace() {
    if (!active) return;
    const k = key(active.r, active.c);
    if (values[k]) { delete values[k]; els[k].querySelector('.mf-letter').textContent = ''; }
    else { retreat(); const k2 = key(active.r, active.c); delete values[k2]; if (els[k2]) els[k2].querySelector('.mf-letter').textContent = ''; }
    refreshHighlights();
    saveSoon();
}

function checkSolved() {
    const done = inputCells.every(({ r, c }) => values[key(r, c)] === P.grid[r][c]);
    if (done && !solved) { solved = true; $('mf-solved').hidden = false; save(true); }
    return done;
}

function showCheck() {
    inputCells.forEach(({ r, c }) => {
        const k = key(r, c), el = els[k];
        if (values[k] && values[k] !== P.grid[r][c]) { el.classList.add('wrong'); setTimeout(() => el.classList.remove('wrong'), 1400); }
    });
    checkSolved();
}

// --- Sauvegarde (débounce) ---
let _saveT = null;
function saveSoon() { clearTimeout(_saveT); _saveT = setTimeout(() => save(false), 700); }
function save(force) {
    api('/api/mf/progress', { cells: values, solved: solved });
}

// --- Clavier tactile (AZERTY) ---
function buildKeyboard() {
    const rows = ['AZERTYUIOP', 'QSDFGHJKLM', 'WXCVBN'];
    const kb = $('mf-keyboard');
    kb.innerHTML = '';
    rows.forEach((row, i) => {
        const rEl = document.createElement('div'); rEl.className = 'kb-row';
        row.split('').forEach(ch => {
            const b = document.createElement('button');
            b.className = 'kb-key'; b.textContent = ch; b.type = 'button';
            b.addEventListener('click', () => setLetter(ch));
            rEl.appendChild(b);
        });
        if (i === 2) {
            const del = document.createElement('button');
            del.className = 'kb-key kb-del'; del.textContent = '⌫'; del.type = 'button';
            del.addEventListener('click', backspace);
            rEl.appendChild(del);
        }
        kb.appendChild(rEl);
    });
}

// Clavier physique (desktop) en bonus
document.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace') { e.preventDefault(); backspace(); }
    else if (/^[a-zA-ZàâäéèêëïîôöùûüçÀÂ]$/.test(e.key)) setLetter(e.key.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, 1));
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { advance(); refreshHighlights(); }
});

$('mf-check').addEventListener('click', showCheck);

// --- Démarrage ---
(async function boot() {
    const today = await api('/api/mf/today');
    if (!today.ok) { location.href = '/'; return; }
    P = today.data.puzzle;
    $('mf-date').textContent = new Date(today.data.date + 'T00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

    const prog = await api('/api/mf/progress');
    if (prog.ok && prog.data.progress) {
        values = prog.data.progress.cells || {};
        solved = !!prog.data.progress.solved;
    }

    buildModel();
    renderGrid();
    buildKeyboard();
    if (solved) $('mf-solved').hidden = false;

    $('boot').hidden = true;
    $('mf').hidden = false;

    // sélectionne le premier mot
    if (slots.length) { dir = slots[0].dir; active = { ...slots[0].cells[0] }; refreshHighlights(); }
})();