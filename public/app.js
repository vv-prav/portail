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
        st_solved: "grilles résolues", st_best: "meilleur temps", st_streak: "jours d'affilée", st_days: "jours joués", st_best_tries: "meilleur score", st_avg_tries: "essais en moyenne",
        st_wins: "victoires", st_played: "parties", st_points: "points",
        prof_none: "Pas encore joué", prof_soon: "Pas encore de suivi pour ce jeu.",
        prof_code: "Nouveau code de récupération", btn_logout: "Se déconnecter",
        code_title: "Note ce code", code_copy: "Copier le code", code_ok: "C'est noté", code_copied: "Copié ✓",
        code_sub: "C'est le seul moyen de récupérer ton compte si tu oublies ton mot de passe. Il ne sera plus jamais affiché.",
        forgot_title: "Mot de passe oublié", forgot_sub: "Entre ton nom et le code de récupération noté à l'inscription.",
        forgot_send: "Réinitialiser", cancel: "Annuler",
        app_perudo_d: "Le jeu de dés des pirates, en ligne.", app_motus_d: "Un mot à deviner en 6 essais.", app_pbac_d: "Une lettre, huit catégories, à plusieurs.", app_uc_d: "Démasque l'infiltré parmi vous.", app_juste_d: "Devine le mot secret à l'intuition.", app_mf_d: "Une nouvelle grille chaque jour.",
        app_jouer_d: "Créer une table ou rejoindre les autres.",
        app_recettes_d: "Garde et partage tes recettes.", app_voyages_d: "La rando dans les Monts d'Arrée.", app_admin_d: "Comptes, données et réglages.",
        b_open: "Ouvert", b_soon: "Bientôt", b_online: "en ligne", b_nobody_online: "Personne pour l'instant", b_new_grid: "Nouvelle grille !",
        reorder_start: "Réorganiser", reorder_done: "Terminé", reorder_hint: "Tapez une tuile, puis une deuxième pour échanger leur place.",
        b_grid_done: "Grille du jour ✓", b_grid_part: "faites aujourd'hui",
        app_ch_d: "Dé, carte ou pièce : tranchez au hasard.",
        b_rec_new: "cette semaine", b_rec_count: "recettes",
        rank_title: "Classement du Salon", rank_loading: "Un instant…", rank_empty: "Personne n'a encore marqué de points.", rank_error: "Classement indisponible.",
        today_title: "Aujourd'hui", today_done: "Fait ✓", today_over: "Terminé", today_todo: "À faire", today_streak: "jours d'affilée",
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
        st_solved: "grids solved", st_best: "best time", st_streak: "day streak", st_days: "days played", st_best_tries: "best score", st_avg_tries: "average tries",
        st_wins: "wins", st_played: "games", st_points: "points",
        prof_none: "Not played yet", prof_soon: "No tracking for this game yet.",
        prof_code: "New recovery code", btn_logout: "Log out",
        code_title: "Write this code down", code_copy: "Copy code", code_ok: "Got it", code_copied: "Copied ✓",
        code_sub: "It's the only way to recover your account if you forget your password. It will never be shown again.",
        forgot_title: "Forgot password", forgot_sub: "Enter your name and the recovery code from sign-up.",
        forgot_send: "Reset", cancel: "Cancel",
        app_perudo_d: "The pirates' dice game, online.", app_motus_d: "Guess the word in 6 tries.", app_pbac_d: "A letter, eight categories, with friends.", app_uc_d: "Unmask the impostor among you.", app_juste_d: "Guess the secret word by feel.", app_mf_d: "A fresh grid every day.",
        app_jouer_d: "Start a table or join the others.",
        app_recettes_d: "Keep and share your recipes.", app_voyages_d: "The Monts d'Arrée hiking trip.", app_admin_d: "Accounts, data and settings.",
        b_open: "Open", b_soon: "Soon", b_online: "online", b_nobody_online: "Nobody right now", b_new_grid: "New grid!",
        reorder_start: "Reorder", reorder_done: "Done", reorder_hint: "Tap a tile, then a second one to swap places.",
        b_grid_done: "Today's grid ✓", b_grid_part: "done today",
        app_ch_d: "Dice, card or coin: let chance decide.",
        b_rec_new: "this week", b_rec_count: "recipes",
        rank_title: "Lounge leaderboard", rank_loading: "One moment…", rank_empty: "Nobody has scored yet.", rank_error: "Leaderboard unavailable.",
        today_title: "Today", today_done: "Done ✓", today_over: "Finished", today_todo: "To play", today_streak: "day streak",
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
        st_solved: "cuadrículas resueltas", st_best: "mejor tiempo", st_streak: "días seguidos", st_days: "días jugados", st_best_tries: "mejor puntuación", st_avg_tries: "intentos promedio",
        st_wins: "victorias", st_played: "partidas", st_points: "puntos",
        prof_none: "Aún no has jugado", prof_soon: "Sin seguimiento para este juego todavía.",
        prof_code: "Nuevo código de recuperación", btn_logout: "Cerrar sesión",
        code_title: "Apunta este código", code_copy: "Copiar código", code_ok: "Anotado", code_copied: "Copiado ✓",
        code_sub: "Es la única forma de recuperar tu cuenta si olvidas tu contraseña. No se mostrará nunca más.",
        forgot_title: "Contraseña olvidada", forgot_sub: "Escribe tu nombre y el código de recuperación.",
        forgot_send: "Restablecer", cancel: "Cancelar",
        app_perudo_d: "El juego de dados pirata, en línea.", app_motus_d: "Adivina la palabra en 6 intentos.", app_pbac_d: "Una letra, ocho categorías, en grupo.", app_uc_d: "Descubre al infiltrado entre vosotros.", app_juste_d: "Adivina la palabra secreta por intuición.", app_mf_d: "Una cuadrícula nueva cada día.",
        app_jouer_d: "Crea una mesa o únete a los demás.",
        app_recettes_d: "Guarda y comparte tus recetas.", app_voyages_d: "La ruta por los Monts d'Arrée.", app_admin_d: "Cuentas, datos y ajustes.",
        b_open: "Abierto", b_soon: "Pronto", b_online: "en línea", b_nobody_online: "Nadie por ahora", b_new_grid: "¡Nueva cuadrícula!",
        reorder_start: "Reordenar", reorder_done: "Hecho", reorder_hint: "Toca una casilla, luego otra para intercambiarlas.",
        b_grid_done: "Cuadrícula de hoy ✓", b_grid_part: "hechas hoy",
        app_ch_d: "Dado, carta o moneda: que decida el azar.",
        b_rec_new: "esta semana", b_rec_count: "recetas",
        rank_title: "Clasificación del Salón", rank_loading: "Un momento…", rank_empty: "Nadie ha puntuado todavía.", rank_error: "Clasificación no disponible.",
        today_title: "Hoy", today_done: "Hecho ✓", today_over: "Terminado", today_todo: "Por jugar", today_streak: "días seguidos",
        b_motus_done: "Encontrada ✓", b_motus_over: "Terminado", b_motus_solvers: "lo encontraron",
    },
};
let LANG = localStorage.getItem('erquy_lang') || (navigator.language || 'fr').slice(0, 2);
if (!I18N[LANG]) LANG = 'fr';
const t = (k) => (I18N[LANG] && I18N[LANG][k]) || I18N.fr[k] || k;
function applyI18n() {
    // L'attribut lang de la page doit suivre la langue choisie : sinon un lecteur
    // d'écran prononce l'anglais avec la phonétique française, et le navigateur
    // propose de traduire une page déjà dans la bonne langue.
    document.documentElement.lang = LANG;
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
// Une seule tuile pour tout le multijoueur : les quatre halls séparés
// obligeaient à ouvrir chaque jeu pour savoir si quelqu'un attendait. Les jeux
// du jour, eux, n'ont plus de tuile du tout — ils ont le panneau « Aujourd'hui »,
// qui est désormais leur seule porte.
const GAME_APPS = [
    { id: 'jouer', name: 'Jouer ensemble', dKey: 'app_jouer_d', emoji: '🎮', href: '/jouer', accent: '#d9a94e', status: 'open' },
];
// Chance était rangé dans une catégorie DRINK_APPS à part, vestige de l'époque
// où le salon hébergeait des jeux d'alcool (Purple, Autoroute, Roi des Cons).
// Depuis leur retrait il n'y restait que ce dé, qui n'a rien d'un jeu d'alcool.
const OTHER_APPS = [
    { id: 'chance',   name: 'Chance',       dKey: 'app_ch_d',       emoji: '🎲', href: '/chance',      accent: '#c9a24a', status: 'open' },
    { id: 'recettes', name: 'Recettes',     dKey: 'app_recettes_d', emoji: '🍽️', href: '/recettes',    accent: '#e07a4e', status: 'open' },
    { id: 'voyages',  name: 'Voyages',      dKey: 'app_voyages_d',  emoji: '🥾', href: '/voyages',     accent: '#8b6ba8', status: 'open' },
];
const ADMIN_APP = { id: 'admin', name: 'Administration', dKey: 'app_admin_d', emoji: '🛡️', href: '/admin', accent: '#c96f6f', status: 'open' };
let isAdminUser = false;
let pulse = null;

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
    // Les jeux du jour n'ont plus de tuile : leur état vit dans le panneau
    // « Aujourd'hui », et le multijoueur a sa propre pastille de présence.
    if (app.id === 'recettes' && pulse && pulse.rec) {
        if (pulse.rec.fresh > 0) return `<span class="tile-badge new">✨ ${pulse.rec.fresh} ${t('b_rec_new')}</span>`;
        if (pulse.rec.count > 0) return `<span class="tile-badge part">${pulse.rec.count} ${t('b_rec_count')}</span>`;
        return `<span class="tile-badge open">${t('b_open')}</span>`;
    }
    return `<span class="tile-badge open">${t('b_open')}</span>`;
}
// Une seule tuile multijoueur désormais : elle agrège les joueurs présents
// dans les cinq jeux, puisqu'ils partagent tous l'espace /jouer/.
const MULTIPLAYER_APPS = new Set(['jouer']);
const JEUX_MULTI_IDS = ['perudo', 'pbac', 'undercover', 'yams', 'motusparty'];
function tileOnlineInfo(a) {
    // La tuile « Jouer ensemble » rassemble les présents de tous les jeux.
    const names = a.id === 'jouer'
        ? [...new Set(JEUX_MULTI_IDS.flatMap(id => ((pulse && pulse[id] && pulse[id].names) || [])))]
        : (((pulse && pulse[a.id]) || {}).names || []);
    if (!names.length) return `<span class="tile-online empty">${t('b_nobody_online')}</span>`;
    const shown = names.slice(0, 3).map(esc).join(', ');
    const extra = names.length > 3 ? ` +${names.length - 3}` : '';
    return `<span class="tile-online"><b>🟢 ${names.length}</b> ${shown}${extra}</span>`;
}
function renderTile(a) {
    const open = a.status === 'open';
    const sub = open && MULTIPLAYER_APPS.has(a.id) ? tileOnlineInfo(a) : (open ? tileBadge(a) : `<span class="tile-badge soon">${t('b_soon')}</span>`);
    const inner = `
        <span class="tile-mark">${a.emoji}</span>
        <span class="tile-name">${esc(a.name)}</span>
        ${sub}`;
    return open
        ? `<a class="tile" data-id="${a.id}" href="${a.href}" style="--accent:${a.accent}">${inner}</a>`
        : `<div class="tile is-soon" data-id="${a.id}" style="--accent:${a.accent}" aria-disabled="true">${inner}</div>`;
}

// ---------- Ordre personnalisé des tuiles, sauvegardé sur cet appareil ----------
const TILE_ORDER_KEY = 'erquy_tile_order';
// Ordre de préférence par défaut, utilisé tant que personne n'a encore réorganisé les
// tuiles à la main. Voyages et Recettes restent toujours tout en bas, même après.
const DEFAULT_PRIORITY = ['jouer', 'chance'];
const ALWAYS_LAST = ['voyages', 'recettes'];
function loadTileOrder(allIds) {
    let saved = [];
    try { saved = JSON.parse(localStorage.getItem(TILE_ORDER_KEY) || '[]'); } catch (e) {}
    let order;
    if (saved.length) {
        const known = saved.filter(id => allIds.includes(id));
        const missing = allIds.filter(id => !known.includes(id));  // nouvelles apps jamais vues : à la fin
        order = [...known, ...missing];
    } else {
        const rest = allIds.filter(id => !DEFAULT_PRIORITY.includes(id) && !ALWAYS_LAST.includes(id));
        order = [...DEFAULT_PRIORITY.filter(id => allIds.includes(id)), ...rest];
    }
    // Voyages et Recettes : toujours en dernier, qu'un ordre ait été sauvegardé ou non.
    // On les reprend depuis allIds et non depuis order : `rest` les avait
    // volontairement écartés, donc les chercher dans order les faisait
    // disparaître de la grille pour qui n'avait jamais réorganisé ses tuiles.
    const last = ALWAYS_LAST.filter(id => allIds.includes(id));
    return [...order.filter(id => !ALWAYS_LAST.includes(id)), ...last];
}
function saveTileOrder(order) { localStorage.setItem(TILE_ORDER_KEY, JSON.stringify(order)); }

function renderTiles() {
    const all = [...GAME_APPS, ...OTHER_APPS, ...(isAdminUser ? [ADMIN_APP] : [])];
    const byId = Object.fromEntries(all.map(a => [a.id, a]));
    const order = loadTileOrder(all.map(a => a.id));
    $('tiles').innerHTML = order.map(id => byId[id]).filter(Boolean).map(renderTile).join('');
    $('tiles').classList.toggle('tiles-reorder-on', reorderMode);
    if (reorderMode) wireTileReorder();
}

// ---------- Mode "Réorganiser" : un appui sélectionne une tuile (elle se
// détache légèrement), un second appui sur une autre échange leur place. Pas
// de geste de glissement, donc rien qui puisse entrer en conflit avec le
// défilement de la page ou le fait de suivre normalement un lien. ----------
let reorderMode = false;
let reorderSelected = null;
function toggleReorderMode(on) {
    reorderMode = on;
    reorderSelected = null;
    $('reorder-toggle').textContent = on ? t('reorder_done') : t('reorder_start');
    $('reorder-hint').hidden = !on;
    renderTiles();
}
function wireTileReorder() {
    const host = $('tiles');
    host.querySelectorAll('.tile').forEach(tile => {
        tile.addEventListener('click', (e) => {
            if (!reorderMode) return;
            e.preventDefault();   // en mode réorganisation, un tap ne doit jamais ouvrir l'app
            if (reorderSelected === tile.dataset.id) {
                tile.classList.remove('tile-selected');
                reorderSelected = null;
                return;
            }
            if (!reorderSelected) {
                reorderSelected = tile.dataset.id;
                tile.classList.add('tile-selected');
                return;
            }
            const ids = [...host.querySelectorAll('.tile')].map(t => t.dataset.id);
            const from = ids.indexOf(reorderSelected), to = ids.indexOf(tile.dataset.id);
            [ids[from], ids[to]] = [ids[to], ids[from]];
            saveTileOrder(ids);
            reorderSelected = null;
            if (navigator.vibrate) { try { navigator.vibrate(14); } catch (err) {} }
            renderTiles();
        });
    });
}
$('reorder-toggle').addEventListener('click', () => toggleReorderMode(!reorderMode));

async function loadPulse() {
    const { ok, data } = await api('/api/salon/pulse');
    if (!ok) return;
    pulse = data;
    renderTiles();
    renderToday(data);
    if (!classement) chargerClassement();
    renderOnlinePlayers(data.salonOnline);
    renderRecentlyActive(data.recentlyActive);
    renderLiveGames(data.activeGames);
    const st = $('me-streak');
    if (data.mf && data.mf.streak > 0) { st.innerHTML = '🔥 <b>' + data.mf.streak + '</b>'; st.hidden = false; }
    else st.hidden = true;
}

// ---------- Le panneau « Aujourd'hui » ----------
// Motus, Mots Fléchés et Le Mot Juste représentent 90 % de l'activité du salon,
// mais l'accueil les noyait parmi onze tuiles à égalité avec le reste. Ce panneau
// répond à la seule question qu'on se pose en arrivant : qu'est-ce qu'il me reste
// à faire aujourd'hui ? Toutes les données viennent déjà du pouls, rien de neuf
// n'est calculé côté serveur.
const JEUX_DU_JOUR = [
    { id: 'motus',    nom: 'Motus',        emoji: '🟨', href: '/motus/quotidien/', accent: '#c9a24a' },
    { id: 'mf',       nom: 'Mots Fléchés', emoji: '🧩', href: '/mots-fleches',     accent: '#5aa87a' },
    { id: 'motjuste', nom: 'Le Mot Juste', emoji: '🧊', href: '/motjuste',         accent: '#6fb8d9' },
];
// Ramène chaque jeu à un seul état, quelle que soit la forme de ses données.
function etatDuJour(id, p) {
    if (id === 'mf') {
        const d = (p.mf && p.mf.done) || 0, total = (p.mf && p.mf.total) || 0;
        if (total && d >= total) return { cle: 'fait',   texte: t('today_done') };
        if (d > 0)               return { cle: 'encours', texte: `${d}/${total}` };
        return { cle: 'afaire', texte: t('today_todo') };
    }
    const g = p[id] || {};
    if (g.done) return { cle: 'fait',   texte: t('today_done') };
    if (g.over) return { cle: 'fini',   texte: t('today_over') };
    return { cle: 'afaire', texte: t('today_todo') };
}
function renderToday(p) {
    const box = $('today'), liste = $('today-list');
    if (!box || !liste) return;
    const lignes = JEUX_DU_JOUR.map(j => {
        const e = etatDuJour(j.id, p);
        return `<a class="today-item ${e.cle}" href="${j.href}" style="--accent:${j.accent}">
            <span class="today-mark">${j.emoji}</span>
            <span class="today-name">${esc(j.nom)}</span>
            <span class="today-state">${esc(e.texte)}</span>
        </a>`;
    });
    liste.innerHTML = lignes.join('');

    // La plus longue série en cours, tous jeux du jour confondus : c'est elle qui
    // donne envie de revenir demain.
    const series = [
        (p.motus && p.motus.streak) || 0,
        (p.mf && p.mf.streak) || 0,
        (p.motjuste && p.motjuste.streak) || 0,
    ];
    const meilleure = Math.max(...series);
    const el = $('today-streak');
    if (meilleure > 1) {
        el.innerHTML = `🔥 <b>${meilleure}</b> ${esc(t('today_streak'))}`;
        el.hidden = false;
    } else el.hidden = true;

    box.hidden = false;
}

// ---------- Le classement du Salon ----------
// Chaque app avait son classement, aucun ne parlait aux autres. Celui-ci est
// transversal : il donne au salon une raison d'être en tant que lieu, et non
// comme un couloir vers onze jeux séparés. Replié par défaut, chargé au premier
// dépli seulement — inutile de peser sur l'arrivée pour une curiosité.
let classement = null;      // réponse du serveur, récupérée une seule fois
let classementRendu = false;
async function chargerClassement() {
    const { ok, data } = await api('/api/salon/classement');
    classement = ok ? data : null;
    majMaPlace(classement);
}
async function rendreClassement() {
    const corps = $('rank-body');
    const data = classement;
    if (!data || !Array.isArray(data.classement)) {
        corps.innerHTML = `<p class="rank-empty">${esc(t('rank_error'))}</p>`;
        return;
    }
    if (!data.classement.length) {
        corps.innerHTML = `<p class="rank-empty">${esc(t('rank_empty'))}</p>`;
        return;
    }
    const avatars = await PortailProfile.fetchAvatars(data.classement.map(l => l.pseudo));
    corps.innerHTML = data.classement.map((l, i) => {
        const rang = ['🥇', '🥈', '🥉'][i] || (i + 1);
        return `<button type="button" class="rank-row${l.pseudo === data.moi ? ' me' : ''}" data-view="${esc(l.pseudo)}">
            <span class="rank-pos">${rang}</span>
            <span class="ds-avatar xs">${PortailProfile.bubbleHTML(avatars[l.pseudo])}</span>
            <span class="rank-name">${esc(l.pseudo)}</span>
            <span class="rank-pts">${l.points}</span>
        </button>`;
    }).join('');
    corps.querySelectorAll('.rank-row').forEach(b => b.addEventListener('click', () => PortailProfile.open(b.dataset.view)));
}
function majMaPlace(data) {
    const el = $('rank-mine');
    if (!el || !data || !data.maPlace) { if (el) el.textContent = ''; return; }
    el.textContent = `${data.maPlace}${data.maPlace === 1 ? 'ᵉʳ' : 'ᵉ'} / ${data.total}`;
}
$('rank-toggle').addEventListener('click', async () => {
    const corps = $('rank-body'), bouton = $('rank-toggle');
    const ouvert = !corps.hidden;
    corps.hidden = ouvert;
    bouton.setAttribute('aria-expanded', String(!ouvert));
    if (!ouvert && !classementRendu) {
        classementRendu = true;
        corps.innerHTML = `<p class="rank-empty">${esc(t('rank_loading'))}</p>`;
        await rendreClassement();
    }
});

async function renderOnlinePlayers(list) {
    const box = $('hub-online'), host = $('hub-online-chips');
    if (!box || !host) return;
    box.hidden = false;
    if (!Array.isArray(list) || !list.length) {
        host.innerHTML = '<p class="hub-online-empty">Personne d\u2019autre en ligne pour l\u2019instant.</p>';
        return;
    }
    const avatars = await PortailProfile.fetchAvatars(list);
    host.innerHTML = list.map(p => `
        <button type="button" class="hub-online-chip" data-p="${esc(p)}">
            <span class="hub-online-bubble">${PortailProfile.bubbleHTML(avatars[p])}</span>${esc(p)}
        </button>`).join('');
    host.querySelectorAll('.hub-online-chip').forEach(b => b.addEventListener('click', () => PortailProfile.open(b.dataset.p)));
}

function timeAgoShort(ts) {
    const mins = Math.max(1, Math.round((Date.now() - ts) / 60000));
    if (mins < 60) return `il y a ${mins} min`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `il y a ${hours} h`;
    const days = Math.round(hours / 24);
    return `il y a ${days} j`;
}
async function renderRecentlyActive(list) {
    const box = $('hub-recent'), host = $('hub-recent-list');
    if (!box || !host) return;
    box.hidden = false;
    if (!Array.isArray(list) || !list.length) {
        host.innerHTML = '<p class="hub-online-empty">Rien à montrer pour l\u2019instant.</p>';
        return;
    }
    const avatars = await PortailProfile.fetchAvatars(list.map(u => u.pseudo));
    host.innerHTML = list.map(u => `
        <button type="button" class="hub-recent-row" data-p="${esc(u.pseudo)}">
            <span class="hub-recent-bubble">${PortailProfile.bubbleHTML(avatars[u.pseudo])}</span>
            <span class="hub-recent-name">${esc(u.pseudo)}</span>
            <span class="hub-recent-time">${timeAgoShort(u.lastSeen)}</span>
        </button>`).join('');
    host.querySelectorAll('.hub-recent-row').forEach(b => b.addEventListener('click', () => PortailProfile.open(b.dataset.p)));
}

const LIVE_GAME_LINK = { perudo: '/perudo/', pbac: '/pbac/', undercover: '/undercover/' };
function renderLiveGames(list) {
    const host = $('hub-live-games');
    if (!host) return;
    if (!Array.isArray(list) || !list.length) { host.hidden = true; return; }
    host.innerHTML = list.map(g => `
        <a class="hub-live-row" href="${LIVE_GAME_LINK[g.app] || '#'}">
            <span class="hub-live-dot"></span>
            <span class="hub-live-text">Une partie de <b>${esc(g.label)}</b> en cours${g.players && g.players.length ? ' avec ' + g.players.map(esc).join(', ') : ''}</span>
        </a>
    `).join('');
    host.hidden = false;
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
    setAvatarBubble($('me-avatar'), data.avatarPhoto, data.avatar);
}
// Petite bulle d'avatar (photo ou emoji), utilisée dans l'en-tête du salon.
function toast(msg) { DS.toast(msg); }
function setAvatarBubble(el, photo, emoji) {
    if (!el) return;
    el.innerHTML = photo ? `<img src="${photo}" alt="">` : esc(emoji || '✦');
    el.classList.toggle('has-photo', !!photo);
}

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
$('ov-forgot-close').addEventListener('click', () => { $('ov-forgot').hidden = true; });
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

// Nettoyage : un ancien bug faisait enregistrer ici même le service worker
// prévu pour Voyages, à la racine du site — il prenait alors le contrôle de
// TOUTES les pages (Petit Bac, Motus...), pas seulement de la sienne. On
// retire tout ce qui n'est pas correctement limité à /voyages/monts-arree/, et si on en
// trouve un, on recharge une seule fois pour que la page actuelle en soit
// vraiment libérée tout de suite (sinon ça peut rester collé jusqu'à la
// fermeture complète de l'onglet, même après un simple unregister()).
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
        let foundStray = false;
        regs.forEach(reg => {
            if (reg.scope !== location.origin + '/voyages/monts-arree/') { reg.unregister(); foundStray = true; }
        });
        if (foundStray && !sessionStorage.getItem('erquy_sw_cleaned')) {
            sessionStorage.setItem('erquy_sw_cleaned', '1');
            location.reload();
        }
    }).catch(() => {});
}