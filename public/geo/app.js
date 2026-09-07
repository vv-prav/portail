// =====================================================================
//  GÉOGRAPHIE — le pays mystère et le drapeau mystère
//
//  Deux modes, une seule mécanique : on propose un pays, et chaque
//  proposition renvoie la distance, la direction et une proximité. C'est
//  ce qui rend un pays méconnu trouvable par triangulation — et c'est
//  aussi ce qui rend le mode Drapeau jouable, car sans indices un
//  drapeau qu'on ne connaît pas ne serait qu'une loterie.
//
//  La silhouette du jour ne quitte jamais le serveur avant l'heure : le
//  navigateur ne reçoit que le tracé du pays cherché, jamais la base.
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

let MODE = 'silhouette';
let P = null;                 // l'état du mode courant
let TOUS = [];                // la liste des pays proposables
let essais = [];
let fini = false, trouve = false;
let debutA = 0, chronoTimer = null;
let curseur = -1;             // la suggestion surlignée au clavier

function laDate() {
    try { return new URLSearchParams(location.search).get('date') || ''; } catch (e) { return ''; }
}

// ---------- La recherche de pays ----------
// Accents et casse ignorés, et on accepte qu'on tape le début du nom : « cor »
// doit proposer la Corée du Sud sans obliger à écrire l'accent aigu.
function normaliser(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function chercher(saisie) {
    const n = normaliser(saisie);
    if (!n) return [];
    const dejaVus = new Set(essais.map(e => e.code));
    const candidats = TOUS.filter(p => !dejaVus.has(p.code));
    const debut = candidats.filter(p => normaliser(p.nom).startsWith(n));
    const dedans = candidats.filter(p => !normaliser(p.nom).startsWith(n) && normaliser(p.nom).includes(n));
    return debut.concat(dedans).slice(0, 6);
}
function renderSuggestions() {
    const liste = chercher($('gg-saisie').value);
    const box = $('gg-suggest');
    if (!liste.length) { box.hidden = true; box.innerHTML = ''; curseur = -1; return; }
    if (curseur >= liste.length) curseur = liste.length - 1;
    box.hidden = false;
    box.innerHTML = liste.map((p, i) =>
        `<button type="button" class="gg-sug${i === curseur ? ' on' : ''}" data-code="${p.code}">${esc(p.nom)}</button>`).join('');
    box.querySelectorAll('.gg-sug').forEach(b =>
        b.addEventListener('click', () => proposer(b.dataset.code)));
}

// ---------- L'indice du jour ----------
function renderIndice() {
    const box = $('gg-indice');
    if (MODE === 'drapeau') {
        box.className = 'gg-indice drapeau';
        box.innerHTML = `<span class="gg-drapeau">${P.drapeau || ''}</span>`;
    } else {
        box.className = 'gg-indice silhouette';
        // Le contour seul, sans mer ni voisins : c'est la forme qu'on cherche.
        box.innerHTML = `<svg viewBox="0 0 100 100" role="img" aria-label="Silhouette du pays mystère">
            <path d="${esc(P.silhouette || '')}"/></svg>`;
    }
}

// ---------- Les essais ----------
function renderEssais() {
    $('gg-essais').innerHTML = essais.map(e => `
        <div class="gg-essai${e.juste ? ' juste' : ''}${e.voisin && !e.juste ? ' voisin' : ''}">
            <span class="gg-e-drapeau">${e.drapeau}</span>
            <span class="gg-e-nom">${esc(e.nom)}</span>
            <span class="gg-e-km">${e.juste ? '' : new Intl.NumberFormat(LOCALE).format(e.km) + ' km'}</span>
            <span class="gg-e-dir">${e.direction}</span>
            <span class="gg-e-prox">${e.proximite}%</span>
            <span class="gg-e-jauge"><i style="width:${e.proximite}%"></i></span>
        </div>`).join('');
    const reste = (P.maxEssais || 6) - essais.length;
    $('gg-restants').textContent = fini ? '' : `${reste} essai${reste > 1 ? 's' : ''} restant${reste > 1 ? 's' : ''}`;
    // Un pays frontalier, c'est brûlant : la distance seule ne le dit pas
    // toujours, deux capitales pouvant être loin alors que les pays se touchent.
    const dernier = essais[essais.length - 1];
    if (dernier && dernier.voisin && !dernier.juste) DS.toast('Tu touches ! C’est un pays voisin.');
}

async function proposer(code) {
    if (fini) return;
    const p = TOUS.find(x => x.code === code);
    if (!p) return;
    $('gg-saisie').value = '';
    $('gg-suggest').hidden = true;
    curseur = -1;
    const { ok, data } = await api('/api/geo/proposer', { mode: MODE, date: P.date, pays: p.nom });
    if (!ok) { DS.toast((data && data.error) || 'Impossible de proposer.'); return; }
    essais.push(data.essai);
    fini = data.fini; trouve = data.trouve;
    renderEssais();
    if (fini) montrerFin(data);
}

// ---------- Le chronomètre ----------
function formaterTemps(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
function lancerChrono() {
    clearInterval(chronoTimer);
    $('gg-chrono').hidden = false;
    chronoTimer = setInterval(() => {
        if (fini) { clearInterval(chronoTimer); return; }
        $('gg-chrono').textContent = formaterTemps(Date.now() - debutA);
    }, 500);
}
let restant = 0;
setInterval(() => {
    if (restant <= 0) return;
    restant--;
    const h = Math.floor(restant / 3600), m = Math.floor((restant % 3600) / 60);
    $('gg-next').textContent = `🕛 ${h} h ${String(m).padStart(2, '0')}`;
}, 1000);

// ---------- La fin ----------
function montrerFin(d) {
    fini = true;
    clearInterval(chronoTimer);
    const r = d.reponse || {};
    $('gg-fin-emoji').textContent = trouve ? (essais.length <= 2 ? '🏆' : '🎉') : '🌍';
    $('gg-fin-titre').textContent = trouve
        ? `Trouvé en ${essais.length} essai${essais.length > 1 ? 's' : ''} !`
        : 'Raté pour aujourd’hui';
    // On montre toujours la réponse sous ses deux formes : celui qui vient de
    // jouer le drapeau découvre la silhouette, et inversement.
    $('gg-reponse').innerHTML = `
        <p class="gg-rep-nom">${r.drapeau || ''} ${esc(r.nom || '')}</p>
        ${r.chemin ? `<svg class="gg-rep-forme" viewBox="0 0 100 100" aria-hidden="true"><path d="${esc(r.chemin)}"/></svg>` : ''}
        <p class="gg-rep-region">${esc(r.region || '')}</p>`;
    $('gg-fin-texte').textContent = trouve
        ? `${d.score} points${d.ms != null ? ' · ' + formaterTemps(d.ms) : ''}.`
        : `Six essais, et le compte n'y est pas. Demain, un autre pays.`;
    renderBoard(d.classement || [], d.place);
    // Le second mode se propose depuis ici : c'est un seul jeu du jour, il ne
    // faut pas avoir à revenir au salon pour en faire l'autre moitié.
    const autre = MODE === 'silhouette' ? 'drapeau' : 'silhouette';
    $('gg-autre').hidden = false;
    $('gg-autre').textContent = autre === 'drapeau' ? '🏳️ Passer au drapeau' : '🗺️ Passer au pays';
    $('gg-fin').hidden = false;
    if (!laDate() && window.Enchainement) Enchainement.proposer('geo', $('gg-fin').querySelector('.ds-card'));
}
function renderBoard(liste, maPlace) {
    if (!liste.length) { $('gg-board').innerHTML = ''; return; }
    const medaille = ['🥇', '🥈', '🥉'];
    $('gg-board').innerHTML = `<p class="gg-board-titre">Le classement du jour</p>`
        + liste.map((e, i) => `
            <button type="button" class="gg-board-row${i + 1 === maPlace ? ' moi' : ''}" data-view="${esc(e.u)}">
                <span class="gg-b-rang">${medaille[i] || (i + 1)}</span>
                <span class="ds-avatar xs" data-p="${esc(e.u)}"></span>
                <span class="gg-b-nom">${esc(e.u)}</span>
                <span class="gg-b-essais">${e.trouve ? e.essais + '/6' : '✗'}</span>
                <span class="gg-b-temps">${e.ms != null ? formaterTemps(e.ms) : ''}</span>
            </button>`).join('');
    if (window.PortailProfile) {
        const box = $('gg-board');
        box.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => PortailProfile.open(b.dataset.view)));
        PortailProfile.fetchAvatars(liste.map(e => e.u)).then(a => {
            box.querySelectorAll('.ds-avatar[data-p]').forEach(el => { el.innerHTML = PortailProfile.bubbleHTML(a[el.dataset.p]); });
        });
    }
}

// Le partage ne révèle jamais le pays : seulement la suite des proximités,
// comme les carrés de Motus racontent la partie sans donner le mot.
function texteDePartage() {
    const jour = new Date(P.date + 'T12:00:00').toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' });
    const titre = MODE === 'drapeau' ? 'Le drapeau mystère' : 'Le pays mystère';
    const lignes = essais.map(e => {
        const pleins = Math.round(e.proximite / 20);
        return '🟩'.repeat(pleins) + '⬜'.repeat(5 - pleins) + ' ' + (e.juste ? '🎯' : e.direction);
    });
    return `${titre} — ${jour}\n`
        + (trouve ? `${essais.length}/6` : `X/6`) + `\n`
        + lignes.join('\n')
        + `\n${location.origin}/geo`;
}

// ---------- Les deux modes ----------
async function changerDeMode(mode) {
    if (mode === MODE) return;
    MODE = mode;
    $('gg-modes').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
    $('gg-fin').hidden = true;
    await charger();
}
$('gg-modes').querySelectorAll('button').forEach(b =>
    b.addEventListener('click', () => changerDeMode(b.dataset.mode)));
$('gg-autre').addEventListener('click', () => changerDeMode(MODE === 'silhouette' ? 'drapeau' : 'silhouette'));
$('gg-fin-close').addEventListener('click', () => { $('gg-fin').hidden = true; });
$('gg-partage').addEventListener('click', async () => {
    const texte = texteDePartage();
    try {
        if (navigator.share) await navigator.share({ text: texte });
        else { await navigator.clipboard.writeText(texte); DS.toast('Résultat copié.'); }
    } catch (e) {}
});

$('gg-start-btn').addEventListener('click', async () => {
    debutA = Date.now();
    $('gg-start').hidden = true;
    $('gg-jeu').hidden = false;
    renderIndice(); renderEssais();
    if (!P.archive) {
        const { data } = await api('/api/geo/start', { mode: MODE, date: P.date });
        if (data && data.debutA) debutA = data.debutA;
    }
    lancerChrono();
    $('gg-saisie').focus();
});

// La saisie : suggestions au fil de la frappe, flèches pour naviguer, Entrée
// pour valider. Pas de clavier à l'écran — celui du téléphone suffit.
$('gg-saisie').addEventListener('input', () => { curseur = -1; renderSuggestions(); });
$('gg-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const liste = chercher($('gg-saisie').value);
    if (!liste.length) { DS.toast('Aucun pays ne correspond.'); return; }
    proposer(liste[Math.max(0, curseur)].code);
});
$('gg-saisie').addEventListener('keydown', (e) => {
    const liste = chercher($('gg-saisie').value);
    if (!liste.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); curseur = Math.min(liste.length - 1, curseur + 1); renderSuggestions(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); curseur = Math.max(0, curseur - 1); renderSuggestions(); }
});

// ---------- Chargement ----------
async function chargerListe() {
    if (TOUS.length) return;
    const { data } = await api('/api/geo/pays');
    TOUS = (data && data.pays) || [];
}
async function charger() {
    const q = new URLSearchParams({ mode: MODE });
    if (laDate()) q.set('date', laDate());
    const { ok, data } = await api('/api/geo/today?' + q.toString());
    if (!ok) { location.href = '/'; return; }
    P = data;
    restant = P.nextIn || 0;
    essais = (P.progression && P.progression.essais) || [];
    fini = !!(P.progression && P.progression.fini);
    trouve = !!(P.progression && P.progression.trouve);
    debutA = (P.progression && P.progression.debutA) || Date.now();

    $('gg-date').textContent = new Date(P.date + 'T12:00:00').toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
    $('gg-archive-chip').hidden = !P.archive;
    const serie = (P.serie && P.serie.encours) || 0;
    $('gg-serie').hidden = serie <= 1;
    if (serie > 1) $('gg-serie').innerHTML = `🔥 <b>${serie}</b>`;
    $('gg-start-emoji').textContent = MODE === 'drapeau' ? '🏳️' : '🗺️';
    $('gg-start-txt').textContent = MODE === 'drapeau'
        ? 'Six essais pour reconnaître le drapeau. Chaque proposition te donne la distance et la direction du pays cherché.'
        : 'Six essais pour reconnaître le pays à sa forme. Chaque proposition te donne la distance et la direction.';
    document.body.className = 'is-ready';
    await chargerListe();

    if (essais.length || fini) {
        $('gg-start').hidden = true;
        $('gg-jeu').hidden = false;
        renderIndice(); renderEssais();
        if (!fini) lancerChrono();
        else {
            const { data: cl } = await api(`/api/geo/classement?mode=${MODE}&date=${encodeURIComponent(P.date)}`);
            montrerFin({
                reponse: P.reponse, score: P.progression.score, ms: P.progression.ms,
                classement: (cl && cl.classement) || [],
            });
        }
    } else {
        $('gg-start').hidden = false;
        $('gg-jeu').hidden = true;
        $('gg-chrono').hidden = true;
    }
}
charger();
