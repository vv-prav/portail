// =====================================================================
//  MOTUS — client (saisie native, bascule des tuiles, cascade de victoire)
// =====================================================================
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Style de tuiles choisi depuis le hub Motus : appliqué au tout premier chargement,
// avant même le rendu de la grille, pour ne jamais voir un flash de couleur par défaut.
(function applyTileTheme() {
    const THEMES = {
        classique: { correct: '#5aa87a', present: '#c9a24a', absent: '#3a3024' },
        ocean:     { correct: '#3a9bc9', present: '#5ac9c2', absent: '#1f3a4a' },
        coucher:   { correct: '#d9793a', present: '#e0a83e', absent: '#4a2a1f' },
        violet:    { correct: '#8a6bc9', present: '#c98bd9', absent: '#2f2340' },
    };
    const id = localStorage.getItem('motus_tile_theme') || 'classique';
    const t = THEMES[id];
    if (!t) return;
    const root = document.documentElement.style;
    root.setProperty('--correct', t.correct);
    root.setProperty('--present', t.present);
    root.setProperty('--absent', t.absent);
})();

// ---------- i18n (clé partagée avec tout le portail) ----------
const I18N = {
    fr: {
        start_txt: "Un mot à deviner, une couleur pour chaque indice.", start_btn: "Commencer",
        share_btn: "Partager mon résultat", share_copied: "Résultat copié ✓",
        close: "Fermer", cancel: "Annuler", back_salon: "Retour au salon",
        tool_erase: "Effacer", tool_valid: "Valider", tool_giveup: "Rendre",
        panel_chat: "Discussion du jour", panel_arch: "Mots précédents",
        chat_sub: "Pas de spoilers, restez fair-play 🙂", chat_ph: "Ton message…", chat_send: "Envoyer",
        chat_locked: "Termine la manche du jour pour ouvrir la discussion — on évite les spoilers.",
        chat_empty: "Personne n'a encore écrit aujourd'hui.",
        arch_sub: "Rejouables, mais hors classement.", arch_today: "Revenir à aujourd'hui", arch_none: "Aucune archive.",
        clue_start: "Devine le mot en 6 essais. La première lettre est offerte.",
        clue_playing: "À toi de jouer — la première lettre est déjà en place.",
        clue_arch: "Mot d'archive — hors classement.",
        clue_done: "Trouvé ! 🎉", clue_lost: "Le mot était caché…", clue_gaveup: "Tu as abandonné cette manche.",
        err_incomplete: "Complète le mot avant de valider.", err_generic: "Une erreur est survenue.",
        end_title_win: "Trouvé !", end_title_lost: "Perdu…", end_title_giveup: "Abandonné",
        end_tries: "en", end_try_one: "essai", end_try_many: "essais",
        end_rank: "sur", end_streak: "jours d'affilée", end_best_streak: "record perso", end_noboard: "Retente demain !",
        board_title: "Classement du jour", board_empty: "Personne n'a encore trouvé le mot aujourd'hui.",
        giveup_title: "Abandonner ?", giveup_sub: "Le mot sera révélé et tu ne figureras pas au classement.",
        giveup_yes: "Oui, révéler le mot",
        erase_title: "Effacer la ligne ?", erase_sub: "Tu repars de la première lettre.", erase_yes: "Effacer",
        live_done: "ont trouvé", tries_left: "essais restants",
        arch_solved: "trouvé", arch_lost: "raté", arch_untried: "pas tenté",
    },
    en: {
        start_txt: "A word to guess in 6 tries — the first letter is free.", start_btn: "Start",
        share_btn: "Share my result", share_copied: "Result copied ✓",
        close: "Close", cancel: "Cancel", back_salon: "Back to the lounge",
        tool_erase: "Erase", tool_valid: "Submit", tool_giveup: "Give up",
        panel_chat: "Today's chat", panel_arch: "Past words",
        chat_sub: "No spoilers, play fair 🙂", chat_ph: "Your message…", chat_send: "Send",
        chat_locked: "Finish today's round to open the chat — no spoilers.",
        chat_empty: "Nobody has written today yet.",
        arch_sub: "Replayable, but off the leaderboard.", arch_today: "Back to today", arch_none: "No archives.",
        clue_start: "Guess the word in 6 tries. The first letter is free.",
        clue_playing: "Your turn — the first letter is already in place.",
        clue_arch: "Archive word — off the leaderboard.",
        clue_done: "Found it! 🎉", clue_lost: "The word was…", clue_gaveup: "You gave up this round.",
        err_incomplete: "Complete the word before submitting.", err_generic: "Something went wrong.",
        end_title_win: "Found it!", end_title_lost: "Lost…", end_title_giveup: "Given up",
        end_tries: "in", end_try_one: "try", end_try_many: "tries",
        end_rank: "of", end_streak: "day streak", end_best_streak: "personal best", end_noboard: "Try again tomorrow!",
        board_title: "Today's leaderboard", board_empty: "Nobody has found the word today yet.",
        giveup_title: "Give up?", giveup_sub: "The word will be revealed and you won't appear on the leaderboard.",
        giveup_yes: "Yes, reveal the word",
        erase_title: "Erase the row?", erase_sub: "You start again from the first letter.", erase_yes: "Erase",
        live_done: "found it", tries_left: "tries left",
        arch_solved: "found", arch_lost: "missed", arch_untried: "not tried",
    },
    es: {
        start_txt: "Una palabra que adivinar en 6 intentos — la primera letra es gratis.", start_btn: "Empezar",
        share_btn: "Compartir mi resultado", share_copied: "Resultado copiado ✓",
        close: "Cerrar", cancel: "Cancelar", back_salon: "Volver al salón",
        tool_erase: "Borrar", tool_valid: "Validar", tool_giveup: "Rendirse",
        panel_chat: "Charla del día", panel_arch: "Palabras anteriores",
        chat_sub: "Sin spoilers, juega limpio 🙂", chat_ph: "Tu mensaje…", chat_send: "Enviar",
        chat_locked: "Termina la ronda de hoy para abrir la charla — sin spoilers.",
        chat_empty: "Nadie ha escrito hoy todavía.",
        arch_sub: "Rejugables, pero fuera de la clasificación.", arch_today: "Volver a hoy", arch_none: "Sin archivos.",
        clue_start: "Adivina la palabra en 6 intentos. La primera letra es gratis.",
        clue_playing: "Tu turno — la primera letra ya está puesta.",
        clue_arch: "Palabra de archivo — fuera de clasificación.",
        clue_done: "¡Encontrada! 🎉", clue_lost: "La palabra era…", clue_gaveup: "Has abandonado esta ronda.",
        err_incomplete: "Completa la palabra antes de validar.", err_generic: "Ha ocurrido un error.",
        end_title_win: "¡Encontrada!", end_title_lost: "Perdida…", end_title_giveup: "Abandonada",
        end_tries: "en", end_try_one: "intento", end_try_many: "intentos",
        end_rank: "de", end_streak: "días seguidos", end_best_streak: "récord personal", end_noboard: "¡Inténtalo mañana!",
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
    // L'attribut lang de la page doit suivre la langue choisie : sinon un lecteur
    // d'écran prononce l'anglais avec la phonétique française, et le navigateur
    // propose de traduire une page déjà dans la bonne langue.
    document.documentElement.lang = LANG;
    document.querySelectorAll('[data-i]').forEach(el => { el.textContent = t(el.dataset.i); });
    document.querySelectorAll('[data-ph]').forEach(el => { el.placeholder = t(el.dataset.ph); });
}

// ---------- État ----------
let WORD_LEN = 6;
const MAX_TRIES = 6;
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

function toast(msg) { DS.toast(msg); }

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
    $('mt-grid').style.setProperty('--cols', WORD_LEN);
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
        if (!isArchive && data.streak && data.streak.current > 1) {
            sub += ' · 🔥 ' + data.streak.current + ' ' + t('end_streak');
            if (data.streak.best && data.streak.current >= data.streak.best) sub += ' · 🏆 ' + t('end_best_streak');
        }
        if (isArchive) sub += ' · ' + t('arch_solved');
    } else {
        sub = t('end_noboard');
    }
    $('mt-end-sub').textContent = sub;
    const b = await api('/api/motus/board' + (viewDate ? '?date=' + viewDate : ''));
    renderBoard((b.data && b.data.board) || []);
    showInlineBoard((b.data && b.data.board) || []);
    $('mt-end').hidden = false;
    // Les trois jeux du jour forment une séquence : on propose le suivant
    // plutôt que de s'arrêter à « Retour au salon ».
    if (!isArchive) Enchainement.proposer('motus', $('mt-end').querySelector('.ds-card'));

    refreshLiveChip();
}
$('mt-end-close').addEventListener('click', () => { $('mt-end').hidden = true; });

// ---------- Partage du résultat ----------
// Une grille d'émojis qui raconte la partie sans jamais révéler le mot : c'est ce
// qui fait exister le jeu du jour hors du site, dans la conversation du groupe.
// Les carrés sont volontairement ceux que tout le monde reconnaît, indépendants
// du thème de tuiles choisi par le joueur — sinon le message serait illisible
// pour qui ne partage pas son thème.
const CARRES = { correct: '🟩', present: '🟨', absent: '⬛' };
function texteDePartage() {
    // P.date porte toujours la date affichée, archive comprise — viewDate, lui,
    // reste nul sur la partie du jour.
    const date = (P && P.date) || viewDate || '';
    const trouve = guesses.length && guesses[guesses.length - 1].marks.every(m => m === 'correct');
    const score = trouve ? guesses.length + '/' + MAX_TRIES : 'X/' + MAX_TRIES;
    const grille = guesses.map(g => g.marks.map(m => CARRES[m] || '⬛').join('')).join('\n');
    return `Le Salon · Motus ${date} — ${score}\n\n${grille}`;
}
async function partagerResultat() {
    const texte = texteDePartage();
    // Sur téléphone, la feuille de partage native est bien plus pratique qu'un
    // presse-papier muet ; ailleurs on retombe sur la copie.
    try {
        if (navigator.share) { await navigator.share({ text: texte }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    try {
        await navigator.clipboard.writeText(texte);
        DS.toast(t('share_copied'));
    } catch (e) {
        // Navigateurs sans presse-papier (ou hors contexte sécurisé) : on montre le
        // texte, à charge pour le joueur de le copier à la main.
        DS.confirm({ emoji: '📋', title: t('share_btn'), code: texte, cancelLabel: t('close') });
    }
}
$('mt-share').addEventListener('click', partagerResultat);

function renderBoard(board) {
    const box = $('mt-board');
    if (!board.length) { box.innerHTML = '<p class="mt-board-empty">' + t('board_empty') + '</p>'; return; }
    const medal = ['🥇', '🥈', '🥉'];
    box.innerHTML = '<div class="mt-board-title">' + t('board_title') + '</div>' +
        board.slice(0, 15).map((e, i) => `<button type="button" class="mt-board-row${i < 3 ? ' top' + (i + 1) : ''}" data-view="${esc(e.u)}">
            <span class="bpos">${medal[i] || (i + 1)}</span><span class="ds-avatar xs" data-p="${esc(e.u)}"></span><span class="bname">${esc(e.u)}</span><span class="btime">${tryLabel(e.tries)}</span></button>`).join('');
    bindProfiles(box, board.map(e => e.u));
}
// Rend cliquable tout pseudo affiché dans `box` et y pose les bulles d'avatar.
// Même motif que Petit Bac, Yams et Infiltré : une bulle partout où un nom apparaît.
function bindProfiles(box, pseudos) {
    if (!window.PortailProfile) return;
    box.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => PortailProfile.open(b.dataset.view)));
    const cibles = box.querySelectorAll('.ds-avatar[data-p]');
    if (!cibles.length) return;
    PortailProfile.fetchAvatars(pseudos).then(a => {
        cibles.forEach(el => { el.innerHTML = PortailProfile.bubbleHTML(a[el.dataset.p]); });
    });
}
function showInlineBoard(board) {
    renderBoard(board);
    $('mt-inline-board').innerHTML = $('mt-board').innerHTML;
    $('mt-inline-board').hidden = false;
    // innerHTML recopie le balisage mais pas les écouteurs : on les repose ici.
    bindProfiles($('mt-inline-board'), board.map(e => e.u));
    fitGridSoon();
}

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
function renderComments(list) {
    const box = $('cmt-list');
    box.innerHTML = list.length
        ? list.map(c => `<div class="cmt"><button type="button" class="cmt-auteur" data-view="${esc(c.u)}"><span class="ds-avatar xs" data-p="${esc(c.u)}"></span>${esc(c.u)}</button><span>${c.t}</span></div>`).join('')
        : '<p class="mt-board-empty">' + t('chat_empty') + '</p>';
    bindProfiles(box, list.map(c => c.u));
    box.scrollTop = box.scrollHeight;
}
async function loadComments() {
    const { data } = await api('/api/motus/comments');
    // Le serveur ferme la discussion du jour tant que la manche n'est pas finie :
    // on explique pourquoi plutôt que d'afficher une liste vide inexplicable.
    if (data && data.locked) {
        $('cmt-list').innerHTML = '<p class="mt-board-empty">' + t('chat_locked') + '</p>';
        $('cmt-input').disabled = true;
        $('cmt-send').disabled = true;
        return;
    }
    $('cmt-input').disabled = false;
    $('cmt-send').disabled = false;
    renderComments((data && data.comments) || []);
}
$('btn-comments').addEventListener('click', () => { $('mt-comments').hidden = false; loadComments(); });
$('cmt-close').addEventListener('click', () => { $('mt-comments').hidden = true; });
$('cmt-send').addEventListener('click', async () => {
    const val = $('cmt-input').value.trim();
    if (!val) return;
    $('cmt-input').value = '';
    const { ok, data } = await api('/api/motus/comments', { text: val });
    if (ok) renderComments(data.comments || []);
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
    DS.confirm({ emoji, title, text: sub, actions, cancelLabel: t('cancel') });
}

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
    ['mt-end', 'mt-comments', 'mt-archive'].forEach(id => { $(id).hidden = true; });
    $('mt-inline-board').hidden = true;
    solved = false; lost = false; gaveUp = false; started = false;
    guesses = []; draft = Array(WORD_LEN).fill(''); curCol = 1;

    const { ok, data } = await api('/api/motus/today' + dq());
    if (!ok) { location.href = '/'; return; }
    P = data;
    isArchive = !!P.isArchive;
    nextIn = P.nextIn || 0;
    WORD_LEN = P.length || 6;
    draft = Array(WORD_LEN).fill('');
    draft[0] = P.firstLetter;
    $('mt-date').textContent = new Date(P.date + 'T12:00:00').toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
    $('mt-archive-chip').hidden = !isArchive;

    buildGrid();

    const prog = P.progress;
    if (prog && Array.isArray(prog.guesses)) guesses = prog.guesses.slice();
    solved = !!(prog && prog.solved);
    gaveUp = !!(prog && prog.gaveUp);
    lost = !solved && !gaveUp && guesses.length >= MAX_TRIES;
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

// ---------- En direct : voir apparaître les résolutions des autres, à mesure ----------
(function liveFeed() {
    if (typeof io !== 'function') return;   // bibliothèque non chargée, on ne bloque rien
    const socket = io();
    const host = $('mt-live-feed');
    socket.on('connect', () => socket.emit('motus_join'));
    socket.on('motus_live_solve', ({ pseudo, tries, rank, first }) => {
        if (!host) return;
        const row = document.createElement('div');
        row.className = 'mt-live-row' + (first ? ' mt-live-first' : '');
        row.innerHTML = `${first ? '\u{1f947} ' : ''}<b>${esc(pseudo)}</b> vient de trouver le mot du jour en ${tries} ${tries === 1 ? 'essai' : 'essais'}${rank ? ' \u00b7 ' + rank + 'e' : ''}`;
        host.appendChild(row);
        host.hidden = false;
        setTimeout(() => {
            row.classList.add('mt-live-out');
            setTimeout(() => { row.remove(); if (!host.children.length) host.hidden = true; }, 400);
        }, 5000);
    });
    window.addEventListener('beforeunload', () => { try { socket.emit('motus_leave'); } catch (e) {} });
})();

// ---------- Statistiques ----------
$('mt-stats-btn').addEventListener('click', async () => {
    $('mt-stats-screen').hidden = false;
    let s = null;
    try { const r = await fetch('/api/motus/mystats'); s = await r.json(); } catch (e) {}
    if (!s) return;
    $('mt-statsGrid').innerHTML = [
        ['Série en cours', s.streak ?? 0],
        ['Meilleure série', s.bestStreak ?? 0],
        ['Jours joués', s.days ?? 0],
        ['Grilles résolues', s.solved ?? 0],
        ['Taux de réussite', s.successRate === null || s.successRate === undefined ? '—' : s.successRate + '%'],
        ['Essais moyens', s.avgTries ?? '—'],
    ].map(([label, val]) => `<div class="ds-stat-box"><b>${val}</b><em>${label}</em></div>`).join('');
});
$('mt-stats-close').addEventListener('click', () => { $('mt-stats-screen').hidden = true; });

// ---------- Style des tuiles ----------
const TILE_THEMES = {
    classique: { name: 'Classique', correct: '#5aa87a', present: '#c9a24a', absent: '#3a3024' },
    ocean:     { name: 'Océan',     correct: '#3a9bc9', present: '#5ac9c2', absent: '#1f3a4a' },
    coucher:   { name: 'Coucher de soleil', correct: '#d9793a', present: '#e0a83e', absent: '#4a2a1f' },
    violet:    { name: 'Violet',    correct: '#8a6bc9', present: '#c98bd9', absent: '#2f2340' },
};
function renderThemeGrid() {
    const current = localStorage.getItem('motus_tile_theme') || 'classique';
    $('mt-themeGrid').innerHTML = Object.entries(TILE_THEMES).map(([id, th]) => `
        <button type="button" class="mt-theme-card${id === current ? ' active' : ''}" data-id="${id}">
            <span class="mt-theme-swatches">
                <span style="background:${th.correct}"></span>
                <span style="background:${th.present}"></span>
                <span style="background:${th.absent}"></span>
            </span>
            <span class="mt-theme-name">${th.name}</span>
        </button>
    `).join('');
    $('mt-themeGrid').querySelectorAll('.mt-theme-card').forEach(b => b.addEventListener('click', () => {
        localStorage.setItem('motus_tile_theme', b.dataset.id);
        const th = TILE_THEMES[b.dataset.id];
        document.documentElement.style.setProperty('--correct', th.correct);
        document.documentElement.style.setProperty('--present', th.present);
        document.documentElement.style.setProperty('--absent', th.absent);
        renderThemeGrid();
    }));
}
$('mt-style-btn').addEventListener('click', () => { renderThemeGrid(); $('mt-style-screen').hidden = false; });
$('mt-style-close').addEventListener('click', () => { $('mt-style-screen').hidden = true; });