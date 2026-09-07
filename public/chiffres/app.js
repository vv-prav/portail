// =====================================================================
//  LE COMPTE EST BON
//
//  On tape sur un nombre, sur une opération, sur un second nombre : le
//  résultat devient une nouvelle plaque et les deux nombres utilisés
//  disparaissent. C'est le geste de l'émission, et il évite d'avoir à
//  écrire une expression au clavier — ce qui, sur un téléphone, condamne
//  n'importe quel jeu de calcul.
//
//  Le navigateur ne calcule que pour afficher : c'est le serveur qui
//  rejoue les étapes et décide du score.
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

let P = null;              // la donne du jour
let plaques = [];          // { id, valeur, utilisee }
let etapes = [];           // { a, op, b, r }
let choixA = null, choixOp = null;
let commence = false, fini = false;
let debutA = 0, chronoTimer = null;

function laDate() {
    try { return new URLSearchParams(location.search).get('date') || ''; } catch (e) { return ''; }
}
const suffixeDate = () => (laDate() ? '?date=' + encodeURIComponent(laDate()) : '');

// ---------- Les plaques ----------
// Chaque plaque a un identifiant propre : deux plaques peuvent porter la même
// valeur (un 7 et un autre 7), et c'est bien celle qu'on a touchée qui doit
// être consommée, pas la première venue.
function poserPlaques(nombres) {
    plaques = nombres.map((v, i) => ({ id: 'p' + i, valeur: v, utilisee: false, issue: false }));
}
function renderPlaques() {
    $('ch-plaques').innerHTML = plaques.map(p => {
        const cls = [
            p.utilisee ? 'utilisee' : '',
            p.issue ? 'issue' : '',
            choixA === p.id ? 'choisie' : '',
        ].filter(Boolean).join(' ');
        return `<button type="button" class="ch-plaque ${cls}" data-id="${p.id}" ${p.utilisee ? 'disabled' : ''}>${p.valeur}</button>`;
    }).join('');
    $('ch-plaques').querySelectorAll('.ch-plaque').forEach(b =>
        b.addEventListener('click', () => toucherPlaque(b.dataset.id)));
}
function dispo() { return plaques.filter(p => !p.utilisee); }

function toucherPlaque(id) {
    if (fini) return;
    const p = plaques.find(x => x.id === id);
    if (!p || p.utilisee) return;
    if (choixA === id) { choixA = null; choixOp = null; majEcran(); return; }   // se dédire
    if (!choixA) { choixA = id; majEcran(); return; }
    if (!choixOp) { choixA = id; majEcran(); return; }                          // changer de premier nombre
    appliquer(choixA, choixOp, id);
}
function choisirOp(op) {
    if (fini || !choixA) return;
    choixOp = (choixOp === op) ? null : op;
    majEcran();
}

// Le calcul côté navigateur sert seulement à afficher : les mêmes règles sont
// rejouées par le serveur, qui ne croit jamais le total annoncé.
function calcul(a, op, b) {
    if (op === '+') return a + b;
    if (op === '−') return a - b >= 0 ? a - b : null;
    if (op === '×') return a * b;
    if (op === '÷') return (b !== 0 && a % b === 0) ? a / b : null;
    return null;
}
function appliquer(idA, op, idB) {
    const A = plaques.find(p => p.id === idA), B = plaques.find(p => p.id === idB);
    if (!A || !B || A === B) return;
    // Le jeu interdit les négatifs et les fractions : plutôt que de refuser en
    // silence, on l'explique, sinon le joueur croit à un bug.
    let a = A.valeur, b = B.valeur;
    let r = calcul(a, op, b);
    if (r === null && (op === '−' || op === '÷')) {
        // L'ordre inverse marche peut-être : 3 puis − puis 8 veut sans doute
        // dire 8 − 3. On l'accepte plutôt que d'exiger de retaper.
        const r2 = calcul(b, op, a);
        if (r2 !== null) { r = r2; const t = a; a = b; b = t; }
    }
    if (r === null) {
        DS.toast(op === '−' ? 'Pas de nombre négatif.' : 'Pas de virgule : la division doit tomber juste.');
        choixOp = null; majEcran(); return;
    }
    A.utilisee = true; B.utilisee = true;
    plaques.push({ id: 'r' + etapes.length, valeur: r, utilisee: false, issue: true });
    etapes.push({ a, op, b, r });
    choixA = null; choixOp = null;
    majEcran();
    const derniere = $('ch-plaques').querySelector('.ch-plaque.issue:last-of-type');
    if (derniere) { derniere.classList.add('arrive'); setTimeout(() => derniere.classList.remove('arrive'), 400); }
}

function annuler() {
    if (fini || !etapes.length) return;
    etapes.pop();
    plaques.pop();                       // le résultat produit par l'étape annulée
    // Les deux plaques consommées redeviennent disponibles : ce sont les deux
    // dernières marquées utilisées.
    const util = plaques.filter(p => p.utilisee);
    util.slice(-2).forEach(p => { p.utilisee = false; });
    choixA = null; choixOp = null;
    majEcran();
}

// ---------- L'écran ----------
function meilleurAtteint() {
    const libres = dispo();
    if (!libres.length) return null;
    return libres.reduce((m, p) =>
        Math.abs(p.valeur - P.cible) < Math.abs(m - P.cible) ? p.valeur : m, libres[0].valeur);
}
function majEcran() {
    renderPlaques();
    $('ch-ops').querySelectorAll('.ch-op').forEach(b =>
        b.classList.toggle('on', choixOp === b.dataset.op));
    $('ch-etapes').innerHTML = etapes.map((e, i) =>
        `<div class="ch-etape"><span>${e.a} ${e.op} ${e.b}</span><b>${e.r}</b>${i === etapes.length - 1 ? '' : ''}</div>`).join('');

    const meilleur = meilleurAtteint();
    const ecart = meilleur === null ? null : Math.abs(meilleur - P.cible);
    const el = $('ch-ecart');
    if (ecart === null || !etapes.length) { el.hidden = true; }
    else {
        el.hidden = false;
        el.className = 'ch-ecart' + (ecart === 0 ? ' juste' : (ecart <= 10 ? ' proche' : ''));
        el.textContent = ecart === 0 ? '🎯 Le compte est bon !' : `À ${ecart} de la cible`;
    }

    $('ch-consigne').textContent = fini ? 'Manche terminée.'
        : (!choixA ? 'Choisis un nombre.'
            : (!choixOp ? 'Choisis une opération.' : 'Choisis le second nombre.'));
    $('ch-annuler').disabled = fini || !etapes.length;
    $('ch-valider').disabled = fini || !etapes.length;
}

function formaterTemps(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
function lancerChrono() {
    clearInterval(chronoTimer);
    $('ch-chrono').hidden = false;
    chronoTimer = setInterval(() => {
        if (fini) { clearInterval(chronoTimer); return; }
        $('ch-chrono').textContent = formaterTemps(Date.now() - debutA);
    }, 500);
}

// ---------- Le compte à rebours jusqu'au prochain tirage ----------
let restant = 0;
setInterval(() => {
    if (restant <= 0) return;
    restant--;
    const h = Math.floor(restant / 3600), m = Math.floor((restant % 3600) / 60);
    $('ch-next').textContent = `🕛 ${h} h ${String(m).padStart(2, '0')}`;
}, 1000);

// ---------- La fin de manche ----------
function montrerFin(d) {
    fini = true;
    clearInterval(chronoTimer);
    const juste = d.ecart === 0;
    $('ch-fin-emoji').textContent = juste ? '🎯' : (d.ecart <= 10 ? '👍' : '😕');
    $('ch-fin-titre').textContent = juste ? 'Le compte est bon !' : `Le compte n'est pas bon`;
    $('ch-fin-texte').textContent = juste
        ? `${P.cible} en ${etapes.length} opération${etapes.length > 1 ? 's' : ''}${d.ms != null ? ', en ' + formaterTemps(d.ms) : ''}. ${d.score} points.`
        : `Tu arrives à ${d.atteint}, à ${d.ecart} de ${P.cible}. ${d.score} point${d.score > 1 ? 's' : ''}.`;
    $('ch-solution').innerHTML = `<p class="ch-solution-titre">La meilleure solution</p>`
        + (d.solution || []).map(e => `<div class="ch-etape"><span>${e.a} ${e.op} ${e.b}</span><b>${e.r}</b></div>`).join('');
    renderBoard(d.classement || [], d.place);
    $('ch-fin').hidden = false;
    if (!laDate() && window.Enchainement) Enchainement.proposer('chiffres', $('ch-fin').querySelector('.ds-card'));
}
function renderBoard(liste, maPlace) {
    if (!liste.length) { $('ch-board').innerHTML = ''; return; }
    const medaille = ['🥇', '🥈', '🥉'];
    $('ch-board').innerHTML = `<p class="ch-board-titre">Le classement du jour</p>`
        + liste.map((e, i) => `
            <button type="button" class="ch-board-row${i + 1 === maPlace ? ' moi' : ''}" data-view="${esc(e.u)}">
                <span class="ch-b-rang">${medaille[i] || (i + 1)}</span>
                <span class="ds-avatar xs" data-p="${esc(e.u)}"></span>
                <span class="ch-b-nom">${esc(e.u)}</span>
                <span class="ch-b-ecart">${e.ecart === 0 ? '🎯' : '+' + e.ecart}</span>
                <span class="ch-b-temps">${e.ms != null ? formaterTemps(e.ms) : ''}</span>
            </button>`).join('');
    if (window.PortailProfile) {
        const box = $('ch-board');
        box.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => PortailProfile.open(b.dataset.view)));
        PortailProfile.fetchAvatars(liste.map(e => e.u)).then(a => {
            box.querySelectorAll('.ds-avatar[data-p]').forEach(el => { el.innerHTML = PortailProfile.bubbleHTML(a[el.dataset.p]); });
        });
    }
}

// Le partage : la donne, le résultat, le temps — jamais la solution, sinon le
// message gâcherait la journée de celui qui le reçoit.
function texteDePartage(d) {
    const jour = new Date(P.date + 'T12:00:00').toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' });
    return `Le compte est bon — ${jour}\n`
        + `${P.nombres.join('  ')}  →  ${P.cible}\n`
        + (d.ecart === 0 ? `🎯 Le compte est bon en ${etapes.length} opérations` : `À ${d.ecart} près`)
        + (d.ms != null ? ` · ${formaterTemps(d.ms)}` : '')
        + `\n${location.origin}/chiffres`;
}

// ---------- Démarrage ----------
$('ch-start-btn').addEventListener('click', async () => {
    commence = true;
    debutA = Date.now();
    document.body.classList.remove('pas-commence');
    $('ch-start').hidden = true;
    $('ch-jeu').hidden = false;
    majEcran();
    if (!P.archive) {
        const { data } = await api('/api/chiffres/start', { date: P.date });
        if (data && data.debutA) debutA = data.debutA;
    }
    lancerChrono();
});
$('ch-ops').querySelectorAll('.ch-op').forEach(b => b.addEventListener('click', () => choisirOp(b.dataset.op)));
$('ch-annuler').addEventListener('click', annuler);
$('ch-fin-close').addEventListener('click', () => { $('ch-fin').hidden = true; });
$('ch-valider').addEventListener('click', async () => {
    if (fini || !etapes.length) return;
    $('ch-valider').disabled = true;
    const { ok, data } = await api('/api/chiffres/valider', { date: P.date, etapes });
    if (!ok) { DS.toast((data && data.error) || 'Impossible de valider.'); $('ch-valider').disabled = false; return; }
    montrerFin(data);
});
$('ch-partage').addEventListener('click', async () => {
    const prog = (P && P.progression) || {};
    const texte = texteDePartage({ ecart: prog.ecart, ms: prog.ms });
    try {
        if (navigator.share) await navigator.share({ text: texte });
        else { await navigator.clipboard.writeText(texte); DS.toast('Résultat copié.'); }
    } catch (e) {}
});

async function charger() {
    const { ok, data } = await api('/api/chiffres/today' + suffixeDate());
    if (!ok) { location.href = '/'; return; }
    P = data;
    restant = P.nextIn || 0;
    poserPlaques(P.nombres);
    $('ch-cible').textContent = P.cible;
    $('ch-date').textContent = new Date(P.date + 'T12:00:00').toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
    $('ch-archive-chip').hidden = !P.archive;
    const serie = (P.serie && P.serie.encours) || 0;
    if (serie > 1) { $('ch-serie').hidden = false; $('ch-serie').innerHTML = `🔥 <b>${serie}</b>`; }

    document.body.className = 'is-ready';
    const prog = P.progression;
    if (prog && prog.fini) {
        // Manche déjà jouée : on rejoue ses étapes pour montrer sa grille.
        commence = true; fini = true;
        $('ch-start').hidden = true; $('ch-jeu').hidden = false;
        (prog.etapes || []).forEach(e => {
            const A = plaques.find(p => !p.utilisee && p.valeur === e.a);
            if (A) A.utilisee = true;
            const B = plaques.find(p => !p.utilisee && p.valeur === e.b);
            if (B) B.utilisee = true;
            plaques.push({ id: 'r' + etapes.length, valeur: e.r, utilisee: false, issue: true });
            etapes.push(e);
        });
        majEcran();
        const { data: cl } = await api('/api/chiffres/classement?date=' + encodeURIComponent(P.date));
        montrerFin({ atteint: prog.atteint, ecart: prog.ecart, score: prog.score, ms: prog.ms, solution: P.solution, classement: (cl && cl.classement) || [] });
    } else {
        document.body.classList.add('pas-commence');
    }
}
charger();
