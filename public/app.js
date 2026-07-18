// =====================================================================
//  LE SALON — client (états pilotés par une classe sur <body>)
// =====================================================================
const APPS = [
    { id: 'perudo',      name: 'Perudo',        desc: 'Le jeu de dés des pirates, en ligne.', emoji: '🎲', href: '/perudo',       accent: '#d9a94e', status: 'open' },
    { id: 'recettes',    name: 'Recettes',      desc: 'Garde et partage tes recettes.',       emoji: '🍽️', href: '/recettes',     accent: '#e07a4e', status: 'soon' },
    { id: 'media',       name: 'Espace Média',  desc: 'Tes montages photo & vidéo.',          emoji: '🎞️', href: '/media',        accent: '#6c7fd8', status: 'soon' },
    { id: 'motsfleches', name: 'Mots Fléchés',  desc: 'Une nouvelle grille chaque jour.',     emoji: '🧩', href: '/mots-fleches', accent: '#5aa87a', status: 'open' },
];

const $ = (id) => document.getElementById(id);

function setState(state) { document.body.className = 'is-' + state; }

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

function renderTiles() {
    $('tiles').innerHTML = APPS.map(a => {
        const open = a.status === 'open';
        const badge = open
            ? '<span class="tile-badge open">Ouvert</span>'
            : '<span class="tile-badge soon">Bientôt</span>';
        const inner = `
            <span class="tile-mark">${a.emoji}</span>
            <span class="tile-body">
                <span class="tile-name">${a.name}</span>
                <span class="tile-desc">${a.desc}</span>
            </span>
            ${badge}`;
        // "Ouvert" = lien cliquable ; "Bientôt" = tuile inerte
        return open
            ? `<a class="tile" href="${a.href}" style="--accent:${a.accent}">${inner}</a>`
            : `<div class="tile is-soon" style="--accent:${a.accent}" aria-disabled="true">${inner}</div>`;
    }).join('');
}

function enterHub(pseudo) {
    $('hub-name').textContent = pseudo;
    renderTiles();
    setState('hub');
    window.scrollTo(0, 0);
}

// --- Connexion / inscription ---
function setError(msg) { $('entry-error').textContent = msg || ''; }

let busy = false;
async function auth(kind) {
    if (busy) return;
    const pseudo = $('pseudo').value.trim();
    const password = $('password').value;
    if (!pseudo || !password) { setError('Remplis les deux champs.'); return; }
    setError('');
    busy = true;
    $('btn-login').disabled = $('btn-register').disabled = true;
    const { ok, data } = await api('/api/' + kind, { pseudo, password });
    busy = false;
    $('btn-login').disabled = $('btn-register').disabled = false;
    if (!ok) { setError(data.error || 'Une erreur est survenue.'); return; }
    enterHub(data.user.pseudo);
}

$('entry-form').addEventListener('submit', (e) => { e.preventDefault(); auth('login'); });
$('btn-register').addEventListener('click', () => auth('register'));
$('btn-logout').addEventListener('click', async () => {
    await api('/api/logout', {});
    location.reload();
});

// --- Au chargement : session déjà active ? ---
(async function boot() {
    const { ok, data } = await api('/api/me');
    if (ok && data.user) {
        enterHub(data.user.pseudo);
    } else {
        setState('entry');
        setTimeout(() => { const p = $('pseudo'); if (p) p.focus(); }, 120);
    }
})();

// PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}