const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Arrivée depuis le catalogue de /jouer/ : on ouvre directement l'écran de
// création du jeu, sans réimplémenter ses réglages ailleurs. Le paramètre est
// retiré de l'URL pour qu'un rechargement ne recrée pas une table.
function creationDemandee() {
    try { return new URLSearchParams(location.search).get('creer') === '1'; } catch (e) { return false; }
}
function ouvrirCreationSiDemandee() {
    if (!creationDemandee()) return;
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
    const b = document.getElementById('btn-create');
    if (b) b.click();
}

function toast(msg) { DS.toast(msg); }
const RANK_EMOJI = ['🥇', '🥈', '🥉'];
function rankLabel(rank) { return RANK_EMOJI[rank - 1] || `${rank}e`; }

let socket = null, state = null, myPseudo = null, chosenRounds = 5;
const LS_KEY = 'motusparty_last_game';

function connect() {
    socket = io();
    socket.on('connect', () => {
        socket.emit('motusparty_identify', (res) => {
            if (!res || !res.ok) { toast('Reconnecte-toi au salon.'); return; }
            myPseudo = res.pseudo;
            // Un lien d'invitation prime sur la dernière course mémorisée.
            const saved = Invitation.tableDuLien() || localStorage.getItem(LS_KEY);
            if (saved) socket.emit('motusparty_join', { id: saved });
            else { socket.emit('motusparty_list'); ouvrirCreationSiDemandee(); }
        });
    });
    socket.on('motusparty_games', renderLobby);
    socket.on('motusparty_state', onState);
    socket.on('motusparty_finish', onPlayerFinish);
    socket.on('motusparty_stats_result', renderStats);
    socket.on('motusparty_error', (msg) => {
        toast(msg || 'Erreur.');
        if (/inconnu/i.test(msg || '')) { try { secouerLigneActive(); } catch (e) {} }
        if (/existe plus/i.test(msg || '')) { localStorage.removeItem(LS_KEY); showView('v-lobby'); socket.emit('motusparty_list'); }
    });
    socket.on('motusparty_closed', () => { toast('La course a été fermée.'); localStorage.removeItem(LS_KEY); location.href = '/motus/'; });
    socket.on('disconnect', () => toast('Connexion perdue, on retente…'));
}

function showView(id) {
    if (id !== 'v-race') document.body.classList.remove('clavier-ouvert');
    ['v-lobby', 'v-waiting', 'v-race', 'v-round-end', 'v-ended'].forEach(v => { $(v).hidden = (v !== id); });
    Vues.suivre(id);
}

// Le geste retour du téléphone remonte d'une vue au lieu de quitter le site.
// Quitter une table est une action à part, qui passe par le bouton dédié.
Vues.surRetour((precedente) => { if (precedente) showView(precedente); });


// ---------- Lobby ----------
document.querySelectorAll('#roundsPicker button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#roundsPicker button').forEach(x => x.classList.toggle('on', x === b));
    chosenRounds = Number(b.dataset.n);
}));
$('btn-create').addEventListener('click', () => socket.emit('motusparty_create', { maxRounds: chosenRounds }));
function renderLobby(games) {
    $('lobby-empty-label').hidden = !!games.length;
    $('mp-tables').innerHTML = games.map(g => `
        <button type="button" class="ds-row" data-id="${g.id}">
            <span class="ds-row-main">
                <span class="ds-row-name">${esc(g.host)}</span>
                <span class="ds-row-sub">${g.status === 'playing' ? `🔴 Manche ${g.round}/${g.maxRounds}` : 'En attente'} · ${g.alive}/${g.players} joueurs${g.spectators ? ` · 👀 ${g.spectators}` : ''}</span>
            </span>
            <span class="ds-row-go">${g.status === 'playing' ? 'Regarder ›' : 'Rejoindre ›'}</span>
        </button>
    `).join('');
    $('mp-tables').querySelectorAll('.ds-row').forEach(b => b.addEventListener('click', () => socket.emit('motusparty_join', { id: b.dataset.id })));
}
setInterval(() => { if (socket && socket.connected && !$('v-lobby').hidden) socket.emit('motusparty_list'); }, 5000);

// ---------- Statistiques ----------
$('btn-stats').addEventListener('click', () => { socket.emit('motusparty_stats'); $('v-stats').hidden = false; });
$('stats-close').addEventListener('click', () => { $('v-stats').hidden = true; });
function renderStats(s) {
    $('statsGrid').innerHTML = [
        ['Courses gagnées', s.matchesWon],
        ['Courses jouées', s.matchesPlayed],
        ['Mots trouvés', s.wordsFound],
        ['Mots ratés', s.wordsMissed],
        ['Meilleur classement', s.bestRank ? rankLabel(s.bestRank) : '—'],
    ].map(([label, val]) => `<div class="ds-stat-box"><b>${val}</b><em>${label}</em></div>`).join('');
}

// ---------- Salle d'attente ----------
function renderWaiting(s) {
    $('waitRounds').textContent = s.maxRounds;
    $('wait-players').innerHTML = s.players.map(p => `
        <button type="button" class="ds-waiting-chip${p.connected ? '' : ' off'}" data-view="${esc(p.pseudo)}">
            <span class="ds-avatar sm" data-p="${esc(p.pseudo)}">✦</span>
            ${esc(p.pseudo)}${p.pseudo === s.host ? '<span class="ds-waiting-host">Hôte</span>' : ''}
        </button>
    `).join('');
    $('wait-players').querySelectorAll('.ds-waiting-chip').forEach(b => b.addEventListener('click', () => PortailProfile.open(b.dataset.view)));
    PortailProfile.fetchAvatars(s.players.map(p => p.pseudo)).then(a => {
        $('wait-players').querySelectorAll('.ds-avatar').forEach(el => { el.innerHTML = PortailProfile.bubbleHTML(a[el.dataset.p]); });
    });
    const isHost = myPseudo === s.host;
    $('btn-start').hidden = !isHost;
    $('wait-hint').hidden = isHost;
    if (isHost && s.players.length < 2) { $('btn-start').disabled = true; $('btn-start').textContent = 'Il faut au moins 2 joueurs'; }
    else if (isHost) { $('btn-start').disabled = false; $('btn-start').textContent = 'Lancer la course'; }
}
$('btn-start').addEventListener('click', () => socket.emit('motusparty_start'));
$('btn-leave-lobby').addEventListener('click', () => { socket.emit('motusparty_leave'); localStorage.removeItem(LS_KEY); showView('v-lobby'); socket.emit('motusparty_list'); });
$('btn-back-lobby').addEventListener('click', () => { socket.emit('motusparty_leave'); localStorage.removeItem(LS_KEY); showView('v-lobby'); socket.emit('motusparty_list'); });

// =====================================================================
//  COURSE EN COURS
//  On tape directement dans la grille, au clavier natif du téléphone, via
//  un input invisible posé sur la case active — le motif du Motus du jour
//  et des Mots Fléchés. Pas de champ à part, pas de bouton « Valider » :
//  les deux jeux du même mot se jouent enfin de la même façon.
// =====================================================================
function tileClass(mark) { return mark === 'correct' ? 'correct' : mark === 'present' ? 'present' : 'absent'; }

const grid = $('myGrid');
const shadow = $('mp-shadow');
let draft = [];            // la ligne en cours de saisie
let curCol = 1;            // la première case est offerte, on démarre à la deuxième
let tileEls = [];          // [ligne][colonne] → l'élément, pour poser l'input invisible
let vuGuesses = -1;        // nombre d'essais déjà affichés, pour n'animer que le nouveau
let vuRound = -1;

function raceActive() {
    if (!state || state.status !== 'playing' || isSpectator) return false;
    const me = state.players.find(p => p.pseudo === myPseudo);
    return !!me && !me.solved && !me.gaveUp;
}
function resetDraft() {
    const len = (state && state.wordLen) || 0;
    draft = Array(len).fill('');
    if (state && state.firstLetter) draft[0] = state.firstLetter;
    curCol = 1;
}

function renderMyGrid(s) {
    const me = s.players.find(p => p.pseudo === myPseudo);
    const guesses = (me && me.guesses) || [];
    const ligneActive = raceActive() ? guesses.length : -1;
    const rows = [];
    for (let i = 0; i < s.maxTries; i++) {
        const g = guesses[i];
        if (g) {
            rows.push(`<div class="mp-row">${g.marks.map((m, j) =>
                `<span class="mp-tile ${tileClass(m)}">${esc(g.word[j])}</span>`).join('')}</div>`);
        } else if (i === ligneActive) {
            rows.push(`<div class="mp-row">${Array.from({ length: s.wordLen }, (_, j) => {
                const c = draft[j] || '';
                const cls = [c ? 'filled' : '', j === 0 ? 'given' : '', j === curCol ? 'cursor' : ''].filter(Boolean).join(' ');
                return `<span class="mp-tile ${cls}" data-c="${j}">${esc(c)}</span>`;
            }).join('')}</div>`);
        } else {
            rows.push(`<div class="mp-row">${Array.from({ length: s.wordLen },
                () => `<span class="mp-tile"></span>`).join('')}</div>`);
        }
    }
    // On ne remplace que les lignes : l'input invisible reste le même nœud,
    // donc il ne perd pas le focus et le clavier ne se referme pas.
    grid.querySelectorAll('.mp-row').forEach(r => r.remove());
    grid.insertAdjacentHTML('afterbegin', rows.join(''));
    tileEls = [...grid.querySelectorAll('.mp-row')].map(r => [...r.querySelectorAll('.mp-tile')]);

    // Tape sur une case pour y déplacer le curseur (la première est offerte).
    if (ligneActive >= 0) {
        (tileEls[ligneActive] || []).forEach((el, j) => {
            if (j === 0) return;
            el.addEventListener('click', () => { curCol = j; renderMyGrid(state); placerShadow(); });
        });
    }
    ajusterGrille();
    placerShadow();
}

// La taille des cases se calcule sur la place réellement disponible : de 4 à 7
// lettres de large, 6 lignes de haut, sur des écrans de 320 à 520 px, clavier
// ouvert ou fermé. Sans ça la grille déborde ou devient minuscule.
function ajusterGrille() {
    if (!state || !state.wordLen) return;
    const gap = 6, zone = $('gridZone');
    const dispoL = Math.max(160, zone.clientWidth || window.innerWidth - 28);
    const hVue = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
    const reserve = document.body.classList.contains('clavier-ouvert') ? 92 : 250;
    const dispoH = Math.max(120, hVue - reserve);
    const parL = Math.floor((dispoL - gap * (state.wordLen - 1)) / state.wordLen);
    const parH = Math.floor((dispoH - gap * (state.maxTries - 1)) / state.maxTries);
    const t = Math.max(26, Math.min(48, parL, parH));
    grid.style.setProperty('--mp-tile', t + 'px');
    grid.style.setProperty('--mp-gap', gap + 'px');
}

function placerShadow() {
    if (!raceActive()) { shadow.blur(); return; }
    const el = tileEls[(state.players.find(p => p.pseudo === myPseudo).guesses || []).length];
    const cible = el && el[curCol];
    if (!cible) return;
    shadow.style.width = cible.offsetWidth + 'px';
    shadow.style.height = cible.offsetHeight + 'px';
    shadow.style.left = cible.offsetLeft + 'px';
    shadow.style.top = cible.offsetTop + 'px';
    if (document.activeElement !== shadow) shadow.focus({ preventScroll: true });
}

shadow.addEventListener('input', () => {
    const brut = shadow.value.replace(/[^a-zA-Z]/g, '');
    shadow.value = '';
    if (!brut || !raceActive()) return;
    draft[curCol] = brut.slice(-1).toUpperCase();
    if (curCol < state.wordLen - 1) curCol++;
    renderMyGrid(state);
});
shadow.addEventListener('keydown', (e) => {
    if (!raceActive()) return;
    if (e.key === 'Enter') { e.preventDefault(); proposer(); }
    else if (e.key === 'Backspace' && !shadow.value) {
        e.preventDefault();
        if (draft[curCol]) draft[curCol] = '';
        else if (curCol > 1) { curCol--; draft[curCol] = ''; }
        renderMyGrid(state);
    } else if (e.key === 'ArrowLeft') { e.preventDefault(); if (curCol > 1) { curCol--; renderMyGrid(state); } }
    else if (e.key === 'ArrowRight') { e.preventDefault(); if (curCol < state.wordLen - 1) { curCol++; renderMyGrid(state); } }
});
// Taper n'importe où dans la zone de grille ramène le clavier.
$('gridZone').addEventListener('click', () => placerShadow());

function secouerLigneActive() {
    const me = state.players.find(p => p.pseudo === myPseudo);
    const r = grid.querySelectorAll('.mp-row')[(me && me.guesses || []).length];
    if (!r) return;
    r.classList.remove('shake'); void r.offsetWidth; r.classList.add('shake');
    if (navigator.vibrate) { try { navigator.vibrate(40); } catch (e) {} }
}
function proposer() {
    if (!raceActive()) return;
    const mot = draft.join('');
    if (mot.length !== state.wordLen || draft.some(c => !c)) { secouerLigneActive(); return; }
    socket.emit('motusparty_guess', { word: mot });
}

// Le clavier natif fait rétrécir la fenêtre visible : on replie l'entête et la
// liste des adversaires pour garder la grille entièrement lisible au-dessus.
if (window.visualViewport) {
    const surClavier = () => {
        const ouvert = (window.innerHeight - window.visualViewport.height) > 150;
        document.body.classList.toggle('clavier-ouvert', ouvert && !$('v-race').hidden);
        ajusterGrille(); placerShadow();
    };
    window.visualViewport.addEventListener('resize', surClavier);
}
window.addEventListener('orientationchange', () => setTimeout(ajusterGrille, 250));

// Le score du match, trié — savoir qui mène est ce qui fait courir.
function renderScores(s) {
    const tri = [...s.players].sort((a, b) => b.score - a.score);
    const tete = tri.length ? tri[0].score : 0;
    $('raceScores').innerHTML = tri.map(p => `
        <span class="mp-score-chip${p.pseudo === myPseudo ? ' me' : ''}${p.score === tete && tete > 0 ? ' lead' : ''}">
            <b>${esc(p.pseudo === myPseudo ? 'Toi' : p.pseudo)}</b><i>${p.score}</i>
        </span>`).join('');
}

// Les adversaires : ceux qui ont trouvé remontent, dans leur ordre d'arrivée.
function renderOpponents(s) {
    const others = s.players.filter(p => p.pseudo !== myPseudo)
        .sort((a, b) => (a.solved ? a.rank : (a.gaveUp ? 90 : 50)) - (b.solved ? b.rank : (b.gaveUp ? 90 : 50)));
    $('opponents').innerHTML = others.map(p => {
        const dots = Array.from({ length: s.maxTries }, (_, i) =>
            `<span class="mp-opp-dot${i < p.triesCount ? ' filled' : ''}"></span>`).join('');
        let status = '';
        if (p.solved) status = `<span class="mp-opp-status solved">${rankLabel(p.rank)}</span>`;
        else if (p.gaveUp) status = `<span class="mp-opp-status gaveup">✗</span>`;
        return `
            <button type="button" class="mp-opp-row${p.solved ? ' solved' : ''}${p.gaveUp ? ' gaveup' : ''}" data-view="${esc(p.pseudo)}">
                <span class="ds-avatar sm" data-p="${esc(p.pseudo)}">✦</span>
                <span class="mp-opp-name">${p.connected ? '' : '⚪ '}${esc(p.pseudo)}</span>
                <span class="mp-opp-dots">${dots}</span>
                ${status}
            </button>`;
    }).join('');
    $('opponents').querySelectorAll('.mp-opp-row').forEach(b => b.addEventListener('click', () => PortailProfile.open(b.dataset.view)));
    PortailProfile.fetchAvatars(others.map(p => p.pseudo)).then(a => {
        $('opponents').querySelectorAll('.ds-avatar').forEach(el => { el.innerHTML = PortailProfile.bubbleHTML(a[el.dataset.p]); });
    });
}

// ---------- Bannière de fin quand quelqu'un trouve le mot ----------
function onPlayerFinish({ pseudo, rank, points }) {
    const el = $('finishBanner');
    $('finishRankTxt').textContent = rankLabel(rank);
    $('finishWhoTxt').textContent = pseudo === myPseudo ? `Tu as trouvé ! +${points} points` : `${pseudo} a trouvé !`;
    el.classList.remove('on'); void el.offsetWidth;
    el.classList.add('on');
    if (pseudo === myPseudo && navigator.vibrate) { try { navigator.vibrate(rank === 1 ? [40, 60, 40, 60, 150] : [40, 80]); } catch (e) {} }
    setTimeout(() => el.classList.remove('on'), 2400);
    if (pseudo === myPseudo && rank === 1) playBigCelebration('🥇', 'Tu as trouvé en premier !');
}

// ---------- Grosse célébration (1re place, ou victoire finale du match) ----------
const CONFETTI_COLORS = ['#d9a94e', '#ecca82', '#5aa87a', '#c9a24a', '#efe4cf'];
function playBigCelebration(emoji, who) {
    const el = $('mpCelebration'), field = $('mpConfetti');
    $('mpCelebrationWord').textContent = emoji;
    $('mpCelebrationWho').textContent = who;
    field.innerHTML = '';
    for (let i = 0; i < 90; i++) {
        const bit = document.createElement('span');
        bit.className = 'mp-confetti-bit';
        bit.style.left = Math.random() * 100 + '%';
        bit.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
        bit.style.animationDelay = (Math.random() * .6) + 's';
        bit.style.animationDuration = (1.8 + Math.random() * 1.2) + 's';
        bit.style.setProperty('--drift', (Math.random() * 140 - 70) + 'px');
        bit.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
        field.appendChild(bit);
    }
    el.classList.add('on');
    setTimeout(() => { el.classList.remove('on'); field.innerHTML = ''; }, 3000);
}

// ---------- Fin de manche ----------
function renderRoundEnd(s) {
    $('reWord').textContent = s.word || '—';
    $('reDef').textContent = s.wordDef || '';
    const sorted = [...s.players].sort((a, b) => (a.rank || 99) - (b.rank || 99));
    $('reResults').innerHTML = sorted.map(p => `
        <button type="button" class="ds-lb-row${p.pseudo === myPseudo ? ' me' : ''}" data-view="${esc(p.pseudo)}">
            <span class="ds-lb-rank">${p.solved ? rankLabel(p.rank) : '✗'}</span>
            <span class="ds-lb-name">${esc(p.pseudo)}</span>
            <span class="mp-re-tries">${p.triesCount} essai${p.triesCount > 1 ? 's' : ''}</span>
            <span class="ds-lb-value">${p.score} pts</span>
        </button>
    `).join('');
    $('reResults').querySelectorAll('.ds-lb-row').forEach(b => b.addEventListener('click', () => PortailProfile.open(b.dataset.view)));
    const isHost = myPseudo === s.host;
    const isLast = s.round >= s.maxRounds;
    $('btn-next-round').hidden = !isHost;
    $('btn-next-round').textContent = isLast ? 'Voir le classement final' : 'Manche suivante';
    $('reHint').hidden = isHost;
}
$('btn-next-round').addEventListener('click', () => socket.emit('motusparty_next_round'));

// ---------- Fin de match ----------
function renderEnded(s) {
    const ranking = s.finalRanking || [];
    $('endTitle').textContent = ranking[0] && ranking[0].pseudo === myPseudo ? 'Tu as gagné la course !' : `${ranking[0] ? ranking[0].pseudo : '—'} a gagné la course !`;
    $('endScores').innerHTML = ranking.map((p, i) => `
        <button type="button" class="ds-lb-row${i === 0 ? ' win' : ''}" data-view="${esc(p.pseudo)}">
            <span class="ds-lb-name">${i === 0 ? '🏆 ' : ''}${esc(p.pseudo)}</span><span class="ds-lb-value">${p.score} pts</span>
        </button>
    `).join('');
    $('endScores').querySelectorAll('.ds-lb-row').forEach(b => b.addEventListener('click', () => PortailProfile.open(b.dataset.view)));
    $('btn-rematch').hidden = myPseudo !== s.host;
    if (ranking[0] && ranking[0].pseudo === myPseudo) playBigCelebration('🏆', 'Victoire finale !');
}
$('btn-rematch').addEventListener('click', () => socket.emit('motusparty_rematch'));

// ---------- Routage général ----------
let isSpectator = false;
function onState(s) {
    state = s;
    localStorage.setItem(LS_KEY, s.id);
    isSpectator = !s.players.some(p => p.pseudo === myPseudo);
    $('mp-sub').textContent = s.status === 'playing' ? `Manche ${s.round} / ${s.maxRounds}` : (s.status === 'ended' ? 'Course terminée' : `Table de ${s.host}`);
    // Le bouton d'invitation n'a de sens que dans la salle d'attente.
    if (s.status === 'lobby') Invitation.definirTable(s.id); else Invitation.effacer();
    if (s.status === 'lobby') { showView('v-waiting'); renderWaiting(s); }
    else if (s.status === 'playing') {
        showView('v-race');
        $('mpSpectatorBanner').hidden = !isSpectator;
        $('raceRound').textContent = s.round;
        $('raceMaxRounds').textContent = s.maxRounds;
        const me = s.players.find(p => p.pseudo === myPseudo);
        const finished = !me || me.solved || me.gaveUp;
        const essais = (me && me.guesses || []).length;
        // Nouvelle manche, ou essai accepté par le serveur : on repart d'une
        // ligne vierge. Le brouillon n'est gardé que si le mot a été refusé.
        if (s.round !== vuRound || essais !== vuGuesses) {
            vuRound = s.round; vuGuesses = essais;
            resetDraft();
        }
        $('guessHint').textContent = isSpectator ? 'Tu regardes la course.'
            : (finished ? (me.solved ? 'Tu as trouvé, en attente des autres…' : 'Essais épuisés, en attente des autres…')
                        : `${s.wordLen} lettres · ${s.maxTries - essais} essai${s.maxTries - essais > 1 ? 's' : ''} restant${s.maxTries - essais > 1 ? 's' : ''}`);
        renderScores(s);
        renderMyGrid(s);
        renderOpponents(s);
        if (finished || isSpectator) document.body.classList.remove('clavier-ouvert');
    } else if (s.status === 'round_end') { showView('v-round-end'); renderRoundEnd(s); }
    else if (s.status === 'ended') { showView('v-ended'); renderEnded(s); }
}

connect();