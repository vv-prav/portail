// =====================================================================
//  LE CHRONO — arrêter un chronomètre qu'on ne voit pas
//
//  ⚠️ LA RÈGLE D'INTERFACE EST LA RÈGLE DU JEU : rien, pendant la manche,
//  ne doit laisser deviner le temps qui passe. Pas de compteur, pas de
//  barre qui se remplit, pas de point qui pulse, pas de transition dont
//  on pourrait lire la durée. Tout ce qui a une cadence donne la mesure.
//  Le bouton change de mot et de couleur à l'appui, et c'est tout.
//
//  Le temps est pris avec `performance.now()`, qui ne bouge pas si
//  l'horloge du téléphone change, et qui est la seule mesure fiable à la
//  milliseconde côté navigateur.
// =====================================================================
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LOCALE = 'fr-FR';

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

let P = null;
let manches = [];            // les manches rendues
let vise = null;             // la durée visée de la manche en cours
let lance = 0;               // l'instant du départ, en temps monotone
let enCours = false;
let fini = false;
let envoiEnCours = false;

const laDate = () => { try { return new URLSearchParams(location.search).get('date') || ''; } catch (e) { return ''; } };
const secondes = (ms) => (ms / 1000).toFixed(2).replace('.', ',') + ' s';
const ecartCourt = (ms) => (ms / 1000).toFixed(2).replace('.', ',') + ' s';

// ---------- Le bouton, et lui seul ----------
async function appui() {
    if (fini || envoiEnCours) return;
    const b = $('ch-bouton');
    if (!enCours) {
        // On part. `performance.now()` plutôt que `Date.now()` : une horloge
        // système qui se recale en pleine manche fausserait tout.
        lance = performance.now();
        enCours = true;
        b.textContent = 'STOP';
        b.classList.add('en-cours');
        $('ch-etat').textContent = 'Appuie quand tu y es.';
        return;
    }
    // On s'arrête. L'écart est mesuré ici, avant tout aller-retour réseau :
    // le trajet pèse plus lourd que ce qu'on mesure.
    const ms = performance.now() - lance;
    enCours = false;
    envoiEnCours = true;
    b.disabled = true;
    b.textContent = '…';
    b.classList.remove('en-cours');

    const { ok, data } = await api('/api/chrono/manche', { date: P.date, ms });
    envoiEnCours = false;
    b.disabled = false;
    if (!ok) {
        DS.toast((data && data.error) || 'Manche refusée.');
        b.textContent = 'Lancer';
        return;
    }
    manches.push(data.manche);
    renderManches(data.manche);
    if (data.fini) { fini = true; setTimeout(() => montrerFin(data), 900); return; }
    vise = data.prochain;
    majManche();
    b.textContent = 'Lancer';
    $('ch-etat').textContent = 'Manche suivante quand tu veux.';
}

function majManche() {
    $('ch-vise').textContent = vise != null ? secondes(vise) : '—';
    $('ch-manche').hidden = false;
    $('ch-manche').textContent = `${Math.min(manches.length + 1, P.total)}/${P.total}`;
}

// Les manches rendues. La dernière arrive avec un petit mouvement — mais
// APRÈS l'appui, donc sans jamais rien dire du temps qui passait.
function renderManches(derniere) {
    $('ch-manches').innerHTML = manches.map((m, i) => `
        <div class="ch-m${derniere && m === derniere ? ' neuve' : ''}">
            <span class="ch-m-num">${i + 1}</span>
            <span class="ch-m-detail">
                <b>${esc(secondes(m.fait))}</b>
                <small>visé ${esc(secondes(m.vise))}</small>
            </span>
            <span class="ch-m-ecart ${classeEcart(m.ecart)}">
                ${m.fait > m.vise ? '+' : '−'}${esc(ecartCourt(m.ecart))}
            </span>
        </div>`).join('');
}
// Trois teintes, aux mêmes seuils que le barème du serveur rapporté à une
// manche : on doit voir tout de suite si le coup était bon.
function classeEcart(ms) {
    if (ms <= 120) return 'vert';
    if (ms <= 500) return 'orange';
    return 'rouge';
}

// ---------- La fin ----------
function montrerFin(d) {
    const total = d.ecartTotal;
    $('ch-fin-emoji').textContent = total <= 150 ? '🎯' : total <= 700 ? '⏱️' : '🙂';
    $('ch-fin-titre').textContent = d.mention
        ? d.mention.charAt(0).toUpperCase() + d.mention.slice(1)
        : 'Journée terminée';
    $('ch-fin-ecart').innerHTML = `<b>${esc(ecartCourt(total))}</b><span>d'écart sur les trois manches</span>`;
    $('ch-fin-manches').innerHTML = manches.map((m, i) => `
        <div class="ch-m static">
            <span class="ch-m-num">${i + 1}</span>
            <span class="ch-m-detail"><b>${esc(secondes(m.fait))}</b><small>visé ${esc(secondes(m.vise))}</small></span>
            <span class="ch-m-ecart ${classeEcart(m.ecart)}">${m.fait > m.vise ? '+' : '−'}${esc(ecartCourt(m.ecart))}</span>
        </div>`).join('');
    $('ch-fin-texte').textContent = `${d.score} point${d.score > 1 ? 's' : ''}.`;
    Geo.classement($('ch-board'), d.classement || [], d.place,
        (e) => ecartCourt(e.ecart != null ? e.ecart : e.ms), true);
    $('ch-fin').hidden = false;
    if (!laDate() && window.Enchainement) Enchainement.proposer('chrono', $('ch-fin').querySelector('.ds-card'));
}

// Le partage ne révèle pas les durées du jour : seulement la justesse, qui
// ne dit rien à qui n'a pas encore joué.
function texteDePartage() {
    const jour = new Date(P.date + 'T12:00:00').toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' });
    const carre = (ms) => (ms <= 120 ? '🟩' : ms <= 500 ? '🟧' : '🟥');
    const total = manches.reduce((s, m) => s + m.ecart, 0);
    return `Le chrono — ${jour}\n`
        + manches.map(m => carre(m.ecart)).join(' ')
        + `\n${ecartCourt(total)} d'écart\n${location.origin}/chrono`;
}

$('ch-bouton').addEventListener('click', appui);
// La barre d'espace et la touche Entrée font le même geste : sur un
// ordinateur, viser la souris coûte des millisecondes qui comptent ici.
document.addEventListener('keydown', (e) => {
    if ($('ch-jeu').hidden || !$('ch-fin').hidden) return;
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); appui(); }
});
$('ch-fin-close').addEventListener('click', () => { $('ch-fin').hidden = true; });
$('ch-partage').addEventListener('click', async () => {
    const texte = texteDePartage();
    try {
        if (navigator.share) await navigator.share({ text: texte });
        else { await navigator.clipboard.writeText(texte); DS.toast('Résultat copié.'); }
    } catch (e) {}
});
$('ch-start-btn').addEventListener('click', async () => {
    $('ch-start').hidden = true;
    $('ch-jeu').hidden = false;
    majManche();
    if (!P.archive) await api('/api/chrono/start', { date: P.date });
});

let restant = 0;
setInterval(() => {
    if (restant <= 0) return;
    restant--;
    const h = Math.floor(restant / 3600), m = Math.floor((restant % 3600) / 60);
    $('ch-next').textContent = `🕛 ${h} h ${String(m).padStart(2, '0')}`;
}, 1000);

async function charger() {
    const d = laDate();
    const { data } = await api('/api/chrono/today' + (d ? '?date=' + encodeURIComponent(d) : ''));
    P = data;
    document.body.classList.remove('is-boot');
    $('ch-date').textContent = new Date(P.date + 'T12:00:00')
        .toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
    $('ch-archive-chip').hidden = !P.archive;
    restant = P.nextIn || 0;
    const serie = (P.serie && P.serie.encours) || 0;
    $('ch-serie').hidden = serie < 2;
    $('ch-serie').querySelector('b').textContent = serie;

    manches = P.manches || [];
    vise = P.vise;
    fini = !!(P.progression && P.progression.fini);

    if (fini) {
        $('ch-start').hidden = true;
        $('ch-jeu').hidden = false;
        $('ch-manche').hidden = true;
        $('ch-vise').textContent = '—';
        $('ch-consigne') && ($('ch-consigne').textContent = '');
        $('ch-bouton').hidden = true;
        $('ch-etat').textContent = 'C’est joué pour aujourd’hui.';
        renderManches(null);
        const { data: cl } = await api('/api/chrono/classement?date=' + encodeURIComponent(P.date));
        const p = P.progression;
        montrerFin({ ecartTotal: p.ecartTotal, score: p.score, mention: p.mention,
                     classement: (cl && cl.classement) || [] });
    } else if (manches.length) {
        $('ch-start').hidden = true;
        $('ch-jeu').hidden = false;
        renderManches(null);
        majManche();
    } else {
        $('ch-start').hidden = false;
        $('ch-jeu').hidden = true;
    }
}
charger();
