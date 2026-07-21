// =====================================================================
//  LE SALON — client (profil, pouls des apps, i18n FR/EN/ES)
// =====================================================================
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- i18n (clé partagée avec le Perudo) ----------
const I18N = {
    fr: {
        entry_sub: "Un nom, un mot de passe, et la porte s'ouvre.",
        entry_hint: "6 caractères minimum. Choisis un mot de passe unique, pas un que tu utilises ailleurs.",
        ph_name: "Ton nom", ph_pass: "Ton mot de passe", ph_newpass: "Nouveau mot de passe",
        btn_enter: "Entrer", btn_register: "Créer un compte", btn_forgot: "Mot de passe oublié ?",
        hub_welcome: "Bienvenue", hub_foot: "D'autres pièces ouvriront bientôt.",
        err_fill: "Remplis les deux champs.", err_generic: "Une erreur est survenue.",
        prof_tap: "Touche l'avatar pour le changer",
        prof_member: "Membre depuis le", prof_lastvisit: "dernière visite",
        sec_mf: "Mots fléchés", sec_perudo: "Perudo",
        st_solved: "grilles résolues", st_best: "meilleur temps", st_streak: "jours d'affilée", st_days: "jours joués",
        st_wins: "victoires", st_played: "parties", st_points: "points",
        prof_none: "Pas encore joué — la taverne t'attend !",
        prof_code: "Nouveau code de récupération", btn_logout: "Se déconnecter",
        code_title: "Note ce code", code_copy: "Copier le code", code_ok: "C'est noté", code_copied: "Copié ✓",
        code_sub: "C'est le seul moyen de récupérer ton compte si tu oublies ton mot de passe. Il ne sera plus jamais affiché.",
        forgot_title: "Mot de passe oublié", forgot_sub: "Entre ton nom et le code de récupération noté à l'inscription.",
        forgot_send: "Réinitialiser", cancel: "Annuler",
        app_perudo_d: "Le jeu de dés des pirates, en ligne.", app_motus_d: "Un mot à deviner en 6 essais.", app_juste_d: "Devine le mot secret à l'intuition.", app_mf_d: "Une nouvelle grille chaque jour.",
        app_recettes_d: "Garde et partage tes recettes.", app_admin_d: "Comptes, données et réglages.",
        b_open: "Ouvert", b_soon: "Bientôt", b_online: "en ligne", b_new_grid: "Nouvelle grille !",
        b_grid_done: "Grille du jour ✓", b_grid_part: "faites aujourd'hui",
        folder_games: "Jeux", folder_games_count: "jeux",
        b_folder_todo: "à jouer", b_folder_done: "tout fait aujourd'hui",
        b_rec_new: "cette semaine", b_rec_count: "recettes",
        b_motus_done: "Trouvé ✓", b_motus_over: "Terminé", b_motus_solvers: "ont trouvé",
    },
    en: {
        entry_sub: "A name, a password, and the door opens.",
        entry_hint: "6 characters minimum. Pick a unique password you don't use elsewhere.",
        ph_name: "Your name", ph_pass: "Your password", ph_newpass: "New password",
        btn_enter: "Enter", btn_register: "Create an account", btn_forgot: "Forgot password?",
        hub_welcome: "Welcome", hub_foot: "More rooms opening soon.",
        err_fill: "Fill in both fields.", err_generic: "Something went wrong.",
        prof_tap: "Tap the avatar to change it",
        prof_member: "Member since", prof_lastvisit: "last visit",
        sec_mf: "Crosswords", sec_perudo: "Perudo",
        st_solved: "grids solved", st_best: "best time", st_streak: "day streak", st_days: "days played",
        st_wins: "wins", st_played: "games", st_points: "points",
        prof_none: "Not played yet — the tavern awaits!",
        prof_code: "New recovery code", btn_logout: "Log out",
        code_title: "Write this code down", code_copy: "Copy code", code_ok: "Got it", code_copied: "Copied ✓",
        code_sub: "It's the only way to recover your account if you forget your password. It will never be shown again.",
        forgot_title: "Forgot password", forgot_sub: "Enter your name and the recovery code from sign-up.",
        forgot_send: "Reset", cancel: "Cancel",
        app_perudo_d: "The pirates' dice game, online.", app_motus_d: "Guess the word in 6 tries.", app_juste_d: "Guess the secret word by feel.", app_mf_d: "A fresh grid every day.",
        app_recettes_d: "Keep and share your recipes.", app_admin_d: "Accounts, data and settings.",
        b_open: "Open", b_soon: "Soon", b_online: "online", b_new_grid: "New grid!",
        b_grid_done: "Today's grid ✓", b_grid_part: "done today",
        folder_games: "Games", folder_games_count: "games",
        b_folder_todo: "to play", b_folder_done: "all done today",
        b_rec_new: "this week", b_rec_count: "recipes",
        b_motus_done: "Found ✓", b_motus_over: "Finished", b_motus_solvers: "found it",
    },
    es: {
        entry_sub: "Un nombre, una contraseña, y la puerta se abre.",
        entry_hint: "Mínimo 6 caracteres. Elige una contraseña única que no uses en otro sitio.",
        ph_name: "Tu nombre", ph_pass: "Tu contraseña", ph_newpass: "Nueva contraseña",
        btn_enter: "Entrar", btn_register: "Crear una cuenta", btn_forgot: "¿Contraseña olvidada?",
        hub_welcome: "Bienvenido", hub_foot: "Pronto abrirán más salas.",
        err_fill: "Rellena los dos campos.", err_generic: "Ha ocurrido un error.",
        prof_tap: "Toca el avatar para cambiarlo",
        prof_member: "Miembro desde el", prof_lastvisit: "última visita",
        sec_mf: "Crucigramas", sec_perudo: "Perudo",
        st_solved: "cuadrículas resueltas", st_best: "mejor tiempo", st_streak: "días seguidos", st_days: "días jugados",
        st_wins: "victorias", st_played: "partidas", st_points: "puntos",
        prof_none: "Aún no has jugado — ¡la taberna te espera!",
        prof_code: "Nuevo código de recuperación", btn_logout: "Cerrar sesión",
        code_title: "Apunta este código", code_copy: "Copiar código", code_ok: "Anotado", code_copied: "Copiado ✓",
        code_sub: "Es la única forma de recuperar tu cuenta si olvidas tu contraseña. No se mostrará nunca más.",
        forgot_title: "Contraseña olvidada", forgot_sub: "Escribe tu nombre y el código de recuperación.",
        forgot_send: "Restablecer", cancel: "Cancelar",
        app_perudo_d: "El juego de dados pirata, en línea.", app_motus_d: "Adivina la palabra en 6 intentos.", app_juste_d: "Adivina la palabra secreta por intuición.", app_mf_d: "Una cuadrícula nueva cada día.",
        app_recettes_d: "Guarda y comparte tus recetas.", app_admin_d: "Cuentas, datos y ajustes.",
        b_open: "Abierto", b_soon: "Pronto", b_online: "en línea", b_new_grid: "¡Nueva cuadrícula!",
        b_grid_done: "Cuadrícula de hoy ✓", b_grid_part: "hechas hoy",
        folder_games: "Juegos", folder_games_count: "juegos",
        b_folder_todo: "por jugar", b_folder_done: "todo hecho hoy",
        b_rec_new: "esta semana", b_rec_count: "recetas",
        b_motus_done: "Encontrada ✓", b_motus_over: "Terminado", b_motus_solvers: "lo encontraron",
    },
};
let LANG = localStorage.getItem('erquy_lang') || (navigator.language || 'fr').slice(0, 2);
if (!I18N[LANG]) LANG = 'fr';
const t = (k) => (I18N[LANG] && I18N[LANG][k]) || I18N.fr[k] || k;
function applyI18n() {
    document.querySelectorAll('[data-i]').forEach(el => { el.textContent = t(el.dataset.i); });
    document.querySelectorAll('[data-ph]').forEach(el => { el.placeholder = t(el.dataset.ph); });
    document.querySelectorAll('#lang-row button').forEach(b => b.classList.toggle('on', b.dataset.lang === LANG));
}
document.querySelectorAll('#lang-row button').forEach(b => b.addEventListener('click', () => {
    LANG = b.dataset.lang;
    localStorage.setItem('erquy_lang', LANG);       // même clé que le Perudo → langue partagée
    applyI18n(); renderTiles();
}));

// ---------- Apps (Média retiré) ----------
const GAME_APPS = [
    { id: 'perudo',   name: 'Perudo',       dKey: 'app_perudo_d',   emoji: '🎲', href: '/perudo',       accent: '#d9a94e', status: 'open' },
    { id: 'motus',    name: 'Motus',        dKey: 'app_motus_d',    emoji: '🟨', href: '/motus',        accent: '#c9a24a', status: 'open' },
    { id: 'motjuste', name: 'Le Mot Juste', dKey: 'app_juste_d',    emoji: '🧊', href: '/motjuste',     accent: '#6fb8d9', status: 'open' },
    { id: 'mf',       name: 'Mots Fléchés', dKey: 'app_mf_d',       emoji: '🧩', href: '/mots-fleches', accent: '#5aa87a', status: 'open' },
];
const OTHER_APPS = [
    { id: 'recettes', name: 'Recettes',     dKey: 'app_recettes_d', emoji: '🍽️', href: '/recettes',    accent: '#e07a4e', status: 'open' },
];
const ADMIN_APP = { id: 'admin', name: 'Administration', dKey: 'app_admin_d', emoji: '🛡️', href: '/admin', accent: '#c96f6f', status: 'open' };
let isAdminUser = false;
let pulse = null;
let gamesOpen = localStorage.getItem('erquy_games_open') === '1';

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
function setState(state) { document.body.className = 'is-' + state; }

// ---------- Tuiles vivantes ----------
function tileBadge(app) {
    if (app.status !== 'open') return `<span class="tile-badge soon">${t('b_soon')}</span>`;
    if (app.id === 'perudo' && pulse && pulse.perudo && pulse.perudo.online > 0) {
        return `<span class="tile-badge live">🟢 ${pulse.perudo.online} ${t('b_online')}</span>`;
    }
    if (app.id === 'recettes' && pulse && pulse.rec) {
        if (pulse.rec.fresh > 0) return `<span class="tile-badge new">✨ ${pulse.rec.fresh} ${t('b_rec_new')}</span>`;
        if (pulse.rec.count > 0) return `<span class="tile-badge part">${pulse.rec.count} ${t('b_rec_count')}</span>`;
        return `<span class="tile-badge open">${t('b_open')}</span>`;
    }
    if (app.id === 'motus' && pulse && pulse.motus) {
        if (pulse.motus.done) return `<span class="tile-badge done">${t('b_motus_done')}</span>`;
        if (pulse.motus.over) return `<span class="tile-badge part">${t('b_motus_over')}</span>`;
        if (pulse.motus.solvers > 0) return `<span class="tile-badge live">🟢 ${pulse.motus.solvers} ${t('b_motus_solvers')}</span>`;
        return `<span class="tile-badge new">✨ ${t('b_new_grid')}</span>`;
    }
    if (app.id === 'motjuste' && pulse && pulse.motjuste) {
        if (pulse.motjuste.done) return `<span class="tile-badge done">${t('b_motus_done')}</span>`;
        if (pulse.motjuste.over) return `<span class="tile-badge part">${t('b_motus_over')}</span>`;
        if (pulse.motjuste.solvers > 0) return `<span class="tile-badge live">🟢 ${pulse.motjuste.solvers} ${t('b_motus_solvers')}</span>`;
        return `<span class="tile-badge new">✨ ${t('b_new_grid')}</span>`;
    }
    if (app.id === 'mf' && pulse && pulse.mf) {
        const { done, total } = pulse.mf;
        if (done === 0) return `<span class="tile-badge new">✨ ${t('b_new_grid')}</span>`;
        if (done >= total) return `<span class="tile-badge done">${t('b_grid_done')}</span>`;
        return `<span class="tile-badge part">${done}/${total} ${t('b_grid_part')}</span>`;
    }
    return `<span class="tile-badge open">${t('b_open')}</span>`;
}
function renderTile(a) {
    const open = a.status === 'open';
    const inner = `
        <span class="tile-mark">${a.emoji}</span>
        <span class="tile-body">
            <span class="tile-name">${esc(a.name)}</span>
            <span class="tile-desc">${t(a.dKey)}</span>
        </span>
        ${tileBadge(a)}`;
    return open
        ? `<a class="tile" href="${a.href}" style="--accent:${a.accent}">${inner}</a>`
        : `<div class="tile is-soon" style="--accent:${a.accent}" aria-disabled="true">${inner}</div>`;
}

// Résumé affiché sur le dossier fermé : priorité au direct, sinon aux nouveautés du jour.
function folderBadge() {
    if (pulse && pulse.perudo && pulse.perudo.online > 0) {
        return `<span class="tile-badge live">🟢 ${pulse.perudo.online} ${t('b_online')}</span>`;
    }
    let fresh = 0;
    if (pulse) {
        if (pulse.mf && pulse.mf.done < pulse.mf.total) fresh++;
        if (pulse.motus && !pulse.motus.over) fresh++;
        if (pulse.motjuste && !pulse.motjuste.over) fresh++;
    }
    if (fresh > 0) return `<span class="tile-badge new">✨ ${fresh} ${t('b_folder_todo')}</span>`;
    return `<span class="tile-badge done">${t('b_folder_done')}</span>`;
}

function renderTiles() {
    const gamesInner = GAME_APPS.map((a, i) => `<div class="folder-item" style="--d:${i * 55}ms">${renderTile(a)}</div>`).join('');
    const folder = `
        <button class="tile folder-card${gamesOpen ? ' open' : ''}" id="folder-games" type="button" style="--accent:#d9a94e">
            <span class="tile-mark">🎲</span>
            <span class="tile-body">
                <span class="tile-name">${t('folder_games')}</span>
                <span class="tile-desc">${GAME_APPS.length} ${t('folder_games_count')}</span>
            </span>
            ${folderBadge()}
            <span class="folder-chevron">⌄</span>
        </button>
        <div class="folder-tray${gamesOpen ? ' open' : ''}" id="folder-tray">
            <div class="folder-tray-inner">${gamesInner}</div>
        </div>`;

    const rest = OTHER_APPS.map(renderTile).join('') + (isAdminUser ? renderTile(ADMIN_APP) : '');
    $('tiles').innerHTML = folder + rest;

    $('folder-games').addEventListener('click', () => {
        gamesOpen = !gamesOpen;
        localStorage.setItem('erquy_games_open', gamesOpen ? '1' : '0');
        renderTiles();
    });
}

async function loadPulse() {
    const { ok, data } = await api('/api/salon/pulse');
    if (!ok) return;
    pulse = data;
    renderTiles();
    const st = $('me-streak');
    if (data.mf && data.mf.streak > 0) { st.innerHTML = '🔥 <b>' + data.mf.streak + '</b>'; st.hidden = false; }
    else st.hidden = true;
}

async function loadAnnounce() {
    const { ok, data } = await api('/api/announce');
    const box = $('hub-announce');
    if (ok && data.announce) { box.textContent = data.announce; box.hidden = false; }
    else box.hidden = true;
}

function enterHub(pseudo, admin) {
    if (admin !== undefined) isAdminUser = !!admin;
    $('hub-name').textContent = pseudo;
    renderTiles();
    setState('hub');
    window.scrollTo(0, 0);
    loadAnnounce();
    loadPulse();
    loadMiniProfile();
    setInterval(loadPulse, 60000);          // le salon reste vivant
}

// ---------- Profil ----------
let myProfile = null;
async function loadMiniProfile() {
    const { ok, data } = await api('/api/salon/profile');
    if (!ok) return;
    myProfile = data;
    if (data.avatar) $('me-avatar').textContent = data.avatar;
}
function mmss(s) { return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

function openProfile() {
    if (!myProfile) return;
    const p = myProfile;
    $('prof-avatar').textContent = p.avatar || '✦';
    $('prof-name').textContent = p.pseudo;
    const created = p.created ? new Date(p.created).toLocaleDateString(LANG === 'en' ? 'en-GB' : (LANG === 'es' ? 'es-ES' : 'fr-FR'), { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
    const prev = p.prevLogin ? new Date(p.prevLogin).toLocaleDateString(LANG === 'en' ? 'en-GB' : (LANG === 'es' ? 'es-ES' : 'fr-FR'), { day: 'numeric', month: 'short' }) : null;
    $('prof-meta').textContent = t('prof_member') + ' ' + created + (prev ? ' · ' + t('prof_lastvisit') + ' ' + prev : '');
    // stats mots fléchés
    $('prof-mf').innerHTML = [
        [p.mf.solved, t('st_solved')],
        [p.mf.best ? mmss(p.mf.best) : '—', t('st_best')],
        ['🔥 ' + p.mf.streak, t('st_streak')],
        [p.mf.days, t('st_days')],
    ].map(([v, l]) => `<div class="ps"><b>${v}</b><em>${l}</em></div>`).join('');
    // stats perudo
    $('prof-perudo').innerHTML = p.perudo
        ? [[p.perudo.wins, t('st_wins')], [p.perudo.played, t('st_played')], [p.perudo.rankPoints, t('st_points')]]
            .map(([v, l]) => `<div class="ps"><b>${v}</b><em>${l}</em></div>`).join('')
        : `<p class="prof-none">${t('prof_none')}</p>`;
    // grille d'avatars
    $('avatar-grid').innerHTML = (p.avatars || []).map(a =>
        `<button type="button" class="av${a === p.avatar ? ' on' : ''}" data-av="${a}">${a}</button>`).join('');
    $('avatar-grid').querySelectorAll('.av').forEach(b => b.addEventListener('click', async () => {
        const { ok } = await api('/api/salon/profile', { avatar: b.dataset.av });
        if (!ok) return;
        myProfile.avatar = b.dataset.av;
        $('me-avatar').textContent = b.dataset.av;
        $('prof-avatar').textContent = b.dataset.av;
        $('avatar-grid').querySelectorAll('.av').forEach(x => x.classList.toggle('on', x === b));
    }));
    $('avatar-grid').hidden = true;
    $('ov-profile').hidden = false;
}
$('hub-me').addEventListener('click', openProfile);
$('prof-close').addEventListener('click', () => { $('ov-profile').hidden = true; });
$('prof-avatar').addEventListener('click', () => { $('avatar-grid').hidden = !$('avatar-grid').hidden; });
$('prof-code').addEventListener('click', async () => {
    const { ok, data } = await api('/api/new-code', {});
    if (ok && data.recoveryCode) { $('ov-profile').hidden = true; showCode(data.recoveryCode, null); }
});
$('btn-logout').addEventListener('click', async () => {
    await api('/api/logout', {});
    location.reload();
});

// ---------- Connexion / inscription ----------
function setError(msg) { $('entry-error').textContent = msg || ''; }
let busy = false;
async function auth(kind) {
    if (busy) return;
    const pseudo = $('pseudo').value.trim();
    const password = $('password').value;
    if (!pseudo || !password) { setError(t('err_fill')); return; }
    setError('');
    busy = true;
    $('btn-login').disabled = $('btn-register').disabled = true;
    const { ok, data } = await api('/api/' + kind, { pseudo, password });
    busy = false;
    $('btn-login').disabled = $('btn-register').disabled = false;
    if (!ok) { setError(data.error || t('err_generic')); return; }
    if (data.recoveryCode) { showCode(data.recoveryCode, data.user.pseudo); return; }
    enterHub(data.user.pseudo, data.user.isAdmin);
}
$('entry-form').addEventListener('submit', (e) => { e.preventDefault(); auth('login'); });
$('btn-register').addEventListener('click', () => auth('register'));

// ---------- Code de récupération ----------
let pendingPseudo = null;
function showCode(code, pseudo) {
    pendingPseudo = pseudo;
    $('code-box').textContent = code;
    $('ov-code').hidden = false;
}
$('code-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('code-box').textContent); $('code-copy').textContent = t('code_copied'); }
    catch (e) {}
});
$('code-ok').addEventListener('click', () => {
    $('ov-code').hidden = true;
    if (pendingPseudo) location.reload();
});

// ---------- Mot de passe oublié ----------
$('btn-forgot').addEventListener('click', () => {
    $('f-pseudo').value = $('pseudo').value.trim();
    $('f-error').textContent = '';
    $('ov-forgot').hidden = false;
});
$('f-cancel').addEventListener('click', () => { $('ov-forgot').hidden = true; });
$('f-send').addEventListener('click', async () => {
    const pseudo = $('f-pseudo').value.trim();
    const code = $('f-code').value.trim().toUpperCase();
    const newPassword = $('f-pass').value;
    if (!pseudo || !code || !newPassword) { $('f-error').textContent = t('err_fill'); return; }
    $('f-send').disabled = true;
    const { ok, data } = await api('/api/recover', { pseudo, code, newPassword });
    $('f-send').disabled = false;
    if (!ok) { $('f-error').textContent = data.error || t('err_generic'); return; }
    $('ov-forgot').hidden = true;
    showCode(data.recoveryCode, data.user.pseudo);
});

// ---------- Démarrage ----------
applyI18n();
(async function boot() {
    const { ok, data } = await api('/api/me');
    if (ok && data.user) enterHub(data.user.pseudo, data.user.isAdmin);
    else { setState('entry'); setTimeout(() => { const p = $('pseudo'); if (p) p.focus(); }, 120); }
})();
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}