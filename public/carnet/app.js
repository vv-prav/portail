// =====================================================================
//  LE CARNET — les sorties et les recettes réunies
//
//  Recettes n'avait aucune donnée après des mois en ligne ; Voyages n'a
//  qu'un seul voyage et un hub qui ne liste qu'un élément. Deux tuiles
//  pour presque rien. Séparées, chacune est trop maigre pour justifier
//  une porte — ensemble, elles forment quelque chose : ces deux apps ne
//  sont pas des jeux, ce sont des notes sur la vie réelle du cercle.
//
//  Le carnet n'est pas un menu de deux liens : il montre le contenu des
//  deux sections sur une seule page. Ajouter ou modifier une recette
//  reste l'affaire de /recettes, qui a déjà tout l'écran qu'il faut.
// =====================================================================
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(path) {
    try {
        const res = await fetch(path);
        return { ok: res.ok, data: await res.json() };
    } catch (e) { return { ok: false, data: null }; }
}

// Les sorties sont décrites ici tant qu'il n'y en a qu'une : le jour où il y en
// aura plusieurs, cette liste viendra du serveur comme les recettes.
const SORTIES = [
    { titre: "Monts d'Arrée", sous: "La rando en Bretagne", emoji: '🥾', href: '/voyages/monts-arree/' },
];

function carte(o) {
    return `<a class="ca-carte" href="${o.href}">
        <span class="ca-carte-emoji">${o.emoji}</span>
        <span class="ca-carte-corps"><b>${esc(o.titre)}</b><em>${esc(o.sous)}</em></span>
        <span class="ca-carte-go" aria-hidden="true">›</span>
    </a>`;
}

$('ca-sorties').innerHTML = SORTIES.map(carte).join('');

async function chargerRecettes() {
    const { ok, data } = await api('/api/rec/list');
    const hote = $('ca-recettes');
    if (!ok || !data) { hote.innerHTML = '<p class="ca-vide">Impossible de charger les recettes.</p>'; return; }
    const recettes = data.recipes || [];
    if (!recettes.length) {
        hote.innerHTML = `<p class="ca-vide">Aucune recette pour l'instant. La première fera bien à quelqu'un.</p>`;
        return;
    }
    hote.innerHTML = recettes.map(r => carte({
        titre: r.title,
        sous: [r.category, r.prepTime ? r.prepTime + ' min' : null, r.author ? 'par ' + r.author : null]
            .filter(Boolean).join(' · '),
        emoji: '🍽️',
        href: '/recettes#' + encodeURIComponent(r.id),
    })).join('');
}
chargerRecettes();
