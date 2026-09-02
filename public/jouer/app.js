// =====================================================================
//  JOUER ENSEMBLE — l'espace multijoueurs commun
//
//  Avant, chaque jeu avait son propre hall : pour savoir si quelqu'un
//  attendait quelque part, il fallait ouvrir les quatre l'un après
//  l'autre. Personne ne le faisait. Cette page répond d'un coup aux deux
//  seules questions qu'on se pose : est-ce que quelqu'un joue, et sinon,
//  qu'est-ce que je lance ?
//
//  Elle ne réimplémente aucun jeu : le catalogue mène au jeu choisi avec
//  ?creer=1, et le jeu ouvre lui-même son écran de réglages. Les cinq
//  écrans de création existants sont réutilisés tels quels.
// =====================================================================
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Le catalogue est décrit ici et nulle part ailleurs : c'est le seul endroit
// où l'on présente les jeux multijoueurs, donc le seul à tenir à jour.
//
// Deux familles, parce qu'on n'y joue pas dans les mêmes circonstances : en
// réseau quand chacun est chez soi, à un seul téléphone quand on est six autour
// d'une table — et c'est précisément là qu'on sort le salon en cherchant quoi
// faire. Le mode local d'Infiltré était jusqu'ici enterré dans un hall conçu
// pour le distanciel.
const CATALOGUE = [
    { id: 'perudo', nom: 'Perudo', emoji: '🎲', accent: '#d9a94e', href: '/perudo',
      joueurs: '2 à 6 joueurs', duree: 'environ 20 min',
      desc: 'Le jeu de dés des pirates : bluff, enchères et dés cachés. Tournois et mode campagne compris.',
      direct: true },   // Perudo a son propre hall et son identité : on l'ouvre tel quel
    { id: 'pbac', nom: 'Petit Bac', emoji: '✏️', accent: '#c2513a', href: '/pbac',
      joueurs: '2 à 8 joueurs', duree: 'environ 10 min',
      desc: 'Une lettre, huit catégories, tout le monde écrit en même temps. Les réponses se votent ensuite.' },
    { id: 'undercover', nom: 'Infiltré', emoji: '🕵️', accent: '#6f7bb0', href: '/undercover',
      joueurs: '3 à 12 joueurs', duree: 'environ 10 min',
      desc: 'Un mot pour tous sauf un. Démasquez l’intrus avant qu’il ne vous démasque.' },
    { id: 'yams', nom: 'Yams', emoji: '🎯', accent: '#ecca82', href: '/yams',
      joueurs: '1 à 6 joueurs', duree: 'environ 15 min',
      desc: 'Le yams classique, avec ses skins de dés, sa bête noire et son classement.' },
    { id: 'motusparty', nom: 'Motus Party', emoji: '🏁', accent: '#d9a94e', href: '/motus/party',
      joueurs: '2 à 8 joueurs', duree: 'environ 5 min',
      desc: 'Tout le monde cherche le même mot en même temps. Le plus rapide marque le plus de points.' },
];

const CATALOGUE_LOCAL = [
    { id: 'uc-local', nom: 'Infiltré', emoji: '🕵️', accent: '#6f7bb0', href: '/undercover/?local=1',
      joueurs: '3 à 12 joueurs', duree: 'environ 10 min',
      desc: 'Un mot pour tous sauf un. Le téléphone tourne, chacun lit son mot en secret.',
      direct: true },
    { id: 'chance', nom: 'Chance', emoji: '🎲', accent: '#c9a24a', href: '/chance',
      joueurs: 'à volonté', duree: 'quelques secondes',
      desc: 'Un dé, une carte, une pièce. Pour trancher quand personne ne veut décider.',
      direct: true },
];

async function api(path) {
    try {
        const res = await fetch(path);
        return { ok: res.ok, data: await res.json() };
    } catch (e) { return { ok: false, data: null }; }
}

// ---------- Catalogue ----------
function carteJeu(j) {
    return `
        <a class="jo-cat" href="${j.direct ? j.href : j.href + '/?creer=1'}" style="--acc:${j.accent}">
            <span class="jo-cat-emoji">${j.emoji}</span>
            <span class="jo-cat-corps">
                <b>${esc(j.nom)}</b>
                <em>${esc(j.desc)}</em>
                <span class="jo-cat-meta">${esc(j.joueurs)} · ${esc(j.duree)}</span>
                ${j.note ? `<span class="jo-cat-note">${esc(j.note)}</span>` : ''}
            </span>
            <span class="jo-cat-go" aria-hidden="true">›</span>
        </a>`;
}
function ouvrirCatalogue() {
    $('jo-cat-liste').innerHTML =
        `<p class="jo-cat-famille">Chacun sur son téléphone</p>`
        + CATALOGUE.map(carteJeu).join('')
        + `<p class="jo-cat-famille">À un seul téléphone</p>`
        + CATALOGUE_LOCAL.map(carteJeu).join('');
    $('jo-catalogue').hidden = false;
}
$('jo-creer').addEventListener('click', ouvrirCatalogue);
$('jo-cat-close').addEventListener('click', () => { $('jo-catalogue').hidden = true; });
$('jo-catalogue').addEventListener('click', (e) => { if (e.target === $('jo-catalogue')) $('jo-catalogue').hidden = true; });

// ---------- Tables ouvertes ----------
function ligneTable(t, avatars) {
    const rejoignable = t.statut === 'attente';
    const noms = t.joueurs.length
        ? t.joueurs.slice(0, 4).map(p => esc(p)).join(', ') + (t.joueurs.length > 4 ? ` +${t.joueurs.length - 4}` : '')
        : 'personne encore';
    const bulles = t.joueurs.slice(0, 4).map(p =>
        `<span class="ds-avatar xs">${PortailProfile.bubbleHTML(avatars[p])}</span>`).join('');
    return `<a class="jo-table${rejoignable ? '' : ' encours'}" href="${t.href}" style="--acc:${t.accent}">
        <span class="jo-table-emoji">${t.emoji}</span>
        <span class="jo-table-corps">
            <b>${esc(t.nom)} · chez ${esc(t.hote)}</b>
            <em>${noms}</em>
        </span>
        <span class="jo-table-bulles">${bulles}</span>
        <span class="jo-table-etat">${rejoignable ? 'Rejoindre ›' : 'en cours'}</span>
    </a>`;
}

let moi = null;      // renseigné par /api/salon/tables, le pouls ne le donne pas

async function chargerTables() {
    const { ok, data } = await api('/api/salon/tables');
    if (data && data.moi) moi = data.moi;
    const hote = $('jo-tables');
    if (!ok || !data) {
        hote.innerHTML = '<p class="jo-vide">Impossible de charger les tables.</p>';
        return;
    }
    const tables = data.tables || [];
    const attente = tables.filter(t => t.statut === 'attente').length;
    $('jo-tables-titre').textContent = tables.length
        ? (attente ? `${attente} table${attente > 1 ? 's' : ''} à rejoindre` : 'Parties en cours')
        : 'Tables ouvertes';
    $('jo-sub').textContent = tables.length
        ? `${tables.length} partie${tables.length > 1 ? 's' : ''} en ce moment`
        : 'Personne ne joue pour l’instant — lance la première.';

    if (!tables.length) {
        hote.innerHTML = `<p class="jo-vide">Aucune table ouverte. Crée une partie, puis partage le lien : les autres te rejoindront même s’ils ne sont pas déjà connectés.</p>`;
        return;
    }
    const pseudos = [...new Set(tables.flatMap(t => t.joueurs))];
    const avatars = await PortailProfile.fetchAvatars(pseudos);
    hote.innerHTML = tables.map(t => ligneTable(t, avatars)).join('');
}

// ---------- Qui est là ----------
async function chargerPresence() {
    const { ok, data } = await api('/api/salon/pulse');
    if (!ok || !data) return;
    const gens = (data.salonOnline || []).filter(p => p !== moi);
    const box = $('jo-online-section'), hote = $('jo-online');
    if (!gens.length) { box.hidden = true; return; }
    const avatars = await PortailProfile.fetchAvatars(gens);
    hote.innerHTML = gens.map(p => `
        <button type="button" class="jo-qui" data-view="${esc(p)}">
            <span class="ds-avatar xs">${PortailProfile.bubbleHTML(avatars[p])}</span>${esc(p)}
        </button>`).join('');
    hote.querySelectorAll('.jo-qui').forEach(b =>
        b.addEventListener('click', () => PortailProfile.open(b.dataset.view)));
    box.hidden = false;
}

function tout() { chargerTables(); chargerPresence(); }
tout();
// Les tables bougent au rythme des gens, pas des secondes : dix secondes suffisent.
setInterval(tout, 10000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) tout(); });
