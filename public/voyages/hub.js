// Un voyage = une carte ici, et un dossier à part avec sa propre page complète.
// Pour en ajouter un nouveau : une entrée ici, et un nouveau dossier public/voyages/<id>/.
const VOYAGES = [
    {
        id: 'monts-arree',
        name: "La Boucle des Monts d'Arrée",
        dates: '10 → 14 août 2026',
        place: 'Bretagne, Parc naturel régional d\u2019Armorique',
        stats: [['5', 'jours'], ['74', 'km'], ['4', 'nuits'], ['381', 'm au sommet']],
        accent: '#8b6ba8',
        href: '/voyages/monts-arree/',
    },
];

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function renderVoyages() {
    const list = document.getElementById('voyageList');
    const empty = document.getElementById('voyageEmpty');
    if (!VOYAGES.length) { empty.hidden = false; return; }
    list.innerHTML = VOYAGES.map(v => `
        <a class="vh-card" href="${v.href}" style="--accent:${v.accent}">
            <p class="vh-card-place">${esc(v.place)}</p>
            <h2 class="vh-card-name">${esc(v.name)}</h2>
            <p class="vh-card-dates">${esc(v.dates)}</p>
            <div class="vh-card-stats">
                ${v.stats.map(([n, l]) => `<span class="vh-card-stat"><b>${esc(n)}</b>${esc(l)}</span>`).join('')}
            </div>
            <span class="vh-card-go">Découvrir <i>→</i></span>
        </a>
    `).join('');
}
renderVoyages();