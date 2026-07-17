// =====================================================================
//  LE SALON — client
// =====================================================================

// Les pièces du salon. Ajouter une app = ajouter une entrée ici + une
// route protégée dans server.js + un dossier dans public/.
const APPS = [
    { id: 'perudo', name: 'Perudo', desc: 'Le jeu de dés des pirates, en ligne.', emoji: '🎲', href: '/perudo', accent: '#d9a94e', status: 'open' },
    { id: 'recettes', name: 'Recettes', desc: 'Garde et partage tes recettes.', emoji: '🍽️', href: '/recettes', accent: '#e07a4e', status: 'soon' },
    { id: 'media', name: 'Espace Média', desc: 'Tes montages photo & vidéo.', emoji: '🎞️', href: '/media', accent: '#6c7fd8', status: 'soon' },
    { id: 'motsfleches', name: 'Mots Fléchés', desc: 'Une nouvelle grille chaque jour.', emoji: '🧩', href: '/mots-fleches', accent: '#5aa87a', status: 'soon' },
];

const $ = (id) => document.getElementById(id);

async function api(path, body) {
    const res = await fetch(path, {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch (e) {}
    return { ok: res.ok, status: res.status, data };
}

function show(view) {
    $('boot').hidden = true;
    $('entry').hidden = view !== 'entry';
    $('hub').hidden = view !== 'hub';
}

function renderTiles() {
    $('tiles').innerHTML = APPS.map(a => {
        const badge = a.status === 'open'
            ? '<span class="tile-badge open">Ouvert</span>'
            : '<span class="tile-badge soon">Bientôt</span>';
        return `<a class="tile" href="${a.href}" style="--accent:${a.accent}">
            <span class="tile-mark">${a.emoji}</span>
            <span class="tile-body">
                <span class="tile-name">${a.name}</span>
                <span class="tile-desc">${a.desc}</span>
            </span>
            ${badge}
        </a>`;
    }).join('');
}

function enterHub(pseudo) {
    $('hub-name').textContent = pseudo;
    renderTiles();
    show('hub');
}

// --- Connexion / inscription ---
function setError(msg) { $('entry-error').textContent = msg || ''; }

async function auth(kind) {
    const pseudo = $('pseudo').value.trim();
    const password = $('password').value;
    if (!pseudo || !password) { setError('Remplis les deux champs.'); return; }
    setError('');
    const btnL = $('btn-login'), btnR = $('btn-register');
    btnL.disabled = btnR.disabled = true;
    const { ok, data } = await api('/api/' + kind, { pseudo, password });
    btnL.disabled = btnR.disabled = false;
    if (!ok) { setError(data.error || 'Une erreur est survenue.'); return; }
    enterHub(data.user.pseudo);
}

$('btn-login').addEventListener('click', () => auth('login'));
$('btn-register').addEventListener('click', () => auth('register'));
$('password').addEventListener('keydown', (e) => { if (e.key === 'Enter') auth('login'); });
$('btn-logout').addEventListener('click', async () => {
    await api('/api/logout', {});
    location.reload();
});

// --- Au chargement : déjà connecté ? ---
(async function boot() {
    const { ok, data } = await api('/api/me');
    if (ok && data.user) enterHub(data.user.pseudo);
    else { show('entry'); setTimeout(() => $('pseudo') && $('pseudo').focus(), 100); }
})();

// PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
