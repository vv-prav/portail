// =====================================================================
//  LE MOT LE PLUS LONG
//
//  On touche les lettres pour composer un mot, on le propose. Chaque
//  tuile ne sert qu'une fois : c'est la tuile qui garantit la règle, pas
//  un message d'erreur après coup. Sur ordinateur, on peut aussi taper
//  au clavier — chaque lettre tapée prend la première tuile libre.
//
//  Le navigateur ne connaît pas le dictionnaire : c'est le serveur qui
//  dit si un mot existe, et qui montre les meilleurs mots à la fin.
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
let tuiles = [];           // { id, lettre }, dans l'ordre affiché
let choisies = [];         // les identifiants des tuiles composant le mot
let mots = [], refuses = [], restantes = 6;
let fini = false, envoi = false;
let debutA = 0, chronoTimer = null;

const laDate = () => { try { return new URLSearchParams(location.search).get('date') || ''; } catch (e) { return ''; } };
const suffixeDate = () => (laDate() ? '?date=' + encodeURIComponent(laDate()) : '');
const motCompose = () => choisies.map(id => tuiles.find(t => t.id === id).lettre).join('');

// ---------- L'affichage ----------
function renderTirage() {
    $('ml-tirage').innerHTML = tuiles.map(t => `
        <button type="button" class="ml-tuile${choisies.includes(t.id) ? ' prise' : ''}" data-id="${t.id}"
            ${choisies.includes(t.id) || fini ? 'disabled' : ''}>${t.lettre}</button>`).join('');
    const mot = motCompose();
    // Des cases vides montrent qu'on peut aller jusqu'à neuf : c'est la
    // promesse du jeu, elle doit se voir.
    $('ml-compose').innerHTML = Array.from({ length: P.lettres.length }, (_, i) =>
        `<span class="ml-case${mot[i] ? ' pleine' : ''}">${mot[i] || ''}</span>`).join('');
    $('ml-proposer').disabled = fini || envoi || mot.length < 3;
    $('ml-effacer').disabled = fini || !mot.length;
}
function renderMots() {
    const meilleur = Math.max(0, ...mots.map(m => m.length));
    $('ml-mots').innerHTML = mots.map(m => `
            <div class="ml-mot${m.length === meilleur ? ' meilleur' : ''}"><b>${esc(m)}</b><span>${m.length} lettres</span></div>`).join('')
        + refuses.map(m => `<div class="ml-mot refuse"><b>${esc(m)}</b><span>inconnu</span></div>`).join('');
    $('ml-restantes').textContent = fini ? ''
        : `${restantes} proposition${restantes > 1 ? 's' : ''} restante${restantes > 1 ? 's' : ''}`
          + (meilleur ? ` · ton meilleur : ${meilleur} lettres` : '');
    $('ml-terminer').hidden = fini || !mots.length;
}

// ---------- Composer ----------
function prendre(id) {
    if (fini || choisies.includes(id)) return;
    choisies.push(id);
    renderTirage();
}
function retirer() {
    if (fini) return;
    choisies.pop();
    renderTirage();
}
function melanger() {
    for (let i = tuiles.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [tuiles[i], tuiles[j]] = [tuiles[j], tuiles[i]]; }
    renderTirage();
}

async function proposer() {
    const mot = motCompose();
    if (fini || envoi || mot.length < 3) return;
    envoi = true; renderTirage();
    const { ok, data } = await api('/api/motlong/proposer', { date: P.date, mot });
    envoi = false;
    if (!ok) { DS.toast((data && data.error) || 'Impossible de proposer.'); renderTirage(); return; }
    choisies = [];
    mots = data.mots || []; restantes = data.restantes;
    if (!data.accepte) { refuses.push(data.mot); DS.toast(data.raison); }
    else DS.toast(`${data.mot} — ${data.mot.length} lettres ✓`);
    renderTirage(); renderMots();
    if (data.fini) montrerFin(data);
}
async function terminer() {
    if (fini) return;
    const { ok, data } = await api('/api/motlong/terminer', { date: P.date });
    if (!ok) { DS.toast('Impossible pour l’instant.'); return; }
    montrerFin(data);
}

// ---------- Le chronomètre ----------
function formaterTemps(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
function lancerChrono() {
    clearInterval(chronoTimer);
    $('ml-chrono').hidden = false;
    chronoTimer = setInterval(() => {
        if (fini) { clearInterval(chronoTimer); return; }
        $('ml-chrono').textContent = formaterTemps(Date.now() - debutA);
    }, 500);
}
let restant = 0;
setInterval(() => {
    if (restant <= 0) return;
    restant--;
    const h = Math.floor(restant / 3600), m = Math.floor((restant % 3600) / 60);
    $('ml-next').textContent = `🕛 ${h} h ${String(m).padStart(2, '0')}`;
}, 1000);

// ---------- La fin ----------
function montrerFin(d) {
    fini = true;
    clearInterval(chronoTimer);
    choisies = [];
    renderTirage(); renderMots();
    const meilleur = d.meilleur || 0;
    const max = P.max;
    P.progression = { ...(P.progression || {}), fini: true, meilleur, trouve: !!d.trouve, ms: d.ms };
    $('ml-fin-emoji').textContent = d.trouve ? '🏆' : (meilleur >= max - 1 ? '👏' : (meilleur ? '🔤' : '😶'));
    $('ml-fin-titre').textContent = d.trouve ? `Le plus long possible !`
        : (meilleur ? `${meilleur} lettres` : 'Aucun mot trouvé');
    $('ml-fin-texte').textContent = d.trouve
        ? `${max} lettres${d.ms != null ? ', en ' + formaterTemps(d.ms) : ''}.`
        : `Le plus long possible faisait ${max} lettres.`;
    // Les meilleurs mots du tirage, les plus courants d'abord : c'est la
    // réponse qu'on a envie de voir, qu'on l'ait trouvée ou non.
    const sol = d.meilleurs || [];
    $('ml-solutions').innerHTML = sol.length
        ? `<p class="ml-sol-titre">${sol.length > 1 ? 'Les mots les plus longs' : 'Le mot le plus long'}</p>`
          + sol.map(m => `<span class="ml-sol${mots.includes(m) ? ' trouve' : ''}">${esc(m)}</span>`).join('')
        : '';
    renderBoard(d.classement || [], d.place);
    $('ml-fin').hidden = false;
    if (!laDate() && window.Enchainement) Enchainement.proposer('motlong', $('ml-fin').querySelector('.ds-card'));
}
function renderBoard(liste, maPlace) {
    if (!liste.length) { $('ml-board').innerHTML = ''; return; }
    const medaille = ['🥇', '🥈', '🥉'];
    $('ml-board').innerHTML = `<p class="ml-board-titre">Le classement du jour</p>`
        + liste.map((e, i) => `
            <button type="button" class="ml-board-row${i + 1 === maPlace ? ' moi' : ''}" data-view="${esc(e.u)}">
                <span class="ml-b-rang">${medaille[i] || (i + 1)}</span>
                <span class="ds-avatar xs" data-p="${esc(e.u)}"></span>
                <span class="ml-b-nom">${esc(e.u)}${e.mot ? ` <i>${esc(e.mot)}</i>` : ''}</span>
                <span class="ml-b-score">${e.score}</span>
                <span class="ml-b-temps">${e.ms != null ? formaterTemps(e.ms) : ''}</span>
            </button>`).join('');
    if (window.PortailProfile) {
        const box = $('ml-board');
        box.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => PortailProfile.open(b.dataset.view)));
        PortailProfile.fetchAvatars(liste.map(e => e.u)).then(a => {
            box.querySelectorAll('.ds-avatar[data-p]').forEach(el => { el.innerHTML = PortailProfile.bubbleHTML(a[el.dataset.p]); });
        });
    }
}
// Le partage ne donne jamais un mot : seulement les longueurs, comme les
// carrés du Motus racontent la partie sans la révéler.
function texteDePartage() {
    const jour = new Date(P.date + 'T12:00:00').toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' });
    const pr = P.progression || {};
    const m = pr.meilleur || 0;
    return `Le mot le plus long — ${jour}\n`
        + `${'🟩'.repeat(m)}${'⬜'.repeat(Math.max(0, P.max - m))} ${m}/${P.max}`
        + (pr.ms != null ? ` · ${formaterTemps(pr.ms)}` : '')
        + `\n${location.origin}/motlong`;
}

// ---------- Les commandes ----------
$('ml-tirage').addEventListener('click', (e) => {
    const b = e.target.closest('.ml-tuile');
    if (b) prendre(b.dataset.id);
});
$('ml-compose').addEventListener('click', retirer);
$('ml-effacer').addEventListener('click', retirer);
$('ml-melanger').addEventListener('click', melanger);
$('ml-proposer').addEventListener('click', proposer);
$('ml-terminer').addEventListener('click', () => {
    DS.confirm({
        emoji: '🔤', title: 'S’arrêter là ?',
        text: `Ton meilleur mot compte pour la journée. Il te reste ${restantes} proposition${restantes > 1 ? 's' : ''}.`,
        actions: [{ label: 'Je m’arrête', run: terminer }],
    });
});
$('ml-fin-close').addEventListener('click', () => { $('ml-fin').hidden = true; });
$('ml-partage').addEventListener('click', async () => {
    const texte = texteDePartage();
    try {
        if (navigator.share) await navigator.share({ text: texte });
        else { await navigator.clipboard.writeText(texte); DS.toast('Résultat copié.'); }
    } catch (e) {}
});
// Le clavier physique, pour qui joue sur ordinateur.
document.addEventListener('keydown', (e) => {
    if (fini || $('ml-jeu').hidden || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Enter') { proposer(); e.preventDefault(); return; }
    if (e.key === 'Backspace') { retirer(); e.preventDefault(); return; }
    const l = (e.key || '').toUpperCase();
    if (/^[A-Z]$/.test(l)) {
        const t = tuiles.find(x => x.lettre === l && !choisies.includes(x.id));
        if (t) prendre(t.id);
    }
});

// ---------- Démarrage ----------
function afficherJeu() {
    $('ml-start').hidden = true;
    $('ml-jeu').hidden = false;
    renderTirage(); renderMots();
}
$('ml-start-btn').addEventListener('click', async () => {
    debutA = Date.now();
    afficherJeu();
    const { data } = await api('/api/motlong/start', { date: P.date });
    if (data && data.debutA) debutA = data.debutA;
    lancerChrono();
});

async function charger() {
    const { ok, data } = await api('/api/motlong/today' + suffixeDate());
    if (!ok) { location.href = '/'; return; }
    P = data;
    restant = P.nextIn || 0;
    tuiles = P.lettres.split('').map((l, i) => ({ id: 't' + i, lettre: l }));
    const prog = P.progression || null;
    mots = (prog && prog.mots) || [];
    refuses = (prog && prog.refuses) || [];
    restantes = P.nbPropositions - ((prog && prog.propositions) || 0);
    $('ml-date').textContent = new Date(P.date + 'T12:00:00').toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
    $('ml-archive-chip').hidden = !P.archive;
    $('ml-start-txt').textContent = `Neuf lettres, et un mot de ${P.max} lettres qui s'y cache. ${P.nbPropositions} propositions pour trouver le plus long.`;
    const serie = (P.serie && P.serie.encours) || 0;
    if (serie > 1) { $('ml-serie').hidden = false; $('ml-serie').innerHTML = `🔥 <b>${serie}</b>`; }
    document.body.className = 'is-ready';

    if (prog && prog.fini) {
        afficherJeu();
        const { data: cl } = await api('/api/motlong/classement?date=' + encodeURIComponent(P.date));
        montrerFin({ meilleur: prog.meilleur, trouve: prog.trouve, ms: prog.ms, meilleurs: P.meilleurs, classement: (cl && cl.classement) || [] });
    } else if (prog && prog.debutA) {
        debutA = prog.debutA;
        afficherJeu();
        lancerChrono();
    }
}
charger();
