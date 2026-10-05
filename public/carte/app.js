// =====================================================================
//  LA CARTE — montrer du doigt le pays du jour
//
//  Trois décisions d'interface, toutes prises sur des mesures :
//
//  1. ⚠️ **On vise le centre le plus proche, pas l'intérieur du tracé.**
//     Sur un téléphone de 375 px, carte entière affichée, deux pays sur
//     211 atteignent la cible tactile de 44 px : la France fait 9 px de
//     côté, la Belgique 2. Tester si le doigt est DANS le pays rendrait la
//     moitié du monde impossible à désigner. On cherche donc le pays dont
//     le centre est le plus proche du doigt.
//  2. **Viser, puis valider.** Le pays visé s'allume et son nom s'affiche ;
//     un second geste confirme. Sans ça, un doigt qui glisse coûterait un
//     essai sur six.
//  3. **La carte garde la mémoire** : chaque pays montré reste coloré avec
//     sa flèche dessus. C'est ce qui permet de trianguler — et c'est tout
//     le jeu, puisqu'on ne reçoit aucune distance.
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
let essais = [];
let fini = false, trouve = false;
let debutA = 0, chronoTimer = null;
let vise = null;                     // le pays sous le doigt, pas encore validé
const parCode = new Map();

function laDate() {
    try { return new URLSearchParams(location.search).get('date') || ''; } catch (e) { return ''; }
}

// ---------- La carte ----------
function construireCarte() {
    const M = window.MONDE;
    for (const p of M.pays) parCode.set(p.c, p);
    $('ct-carte-box').innerHTML = `
        <svg id="ct-svg" viewBox="0 0 ${M.w} ${M.h}" role="img" aria-label="Carte du monde">
            <g id="ct-pays">${M.pays.map(p =>
                `<path id="p${p.c}" d="${p.d}"/>`).join('')}</g>
            <g id="ct-marques"></g>
        </svg>`;
    const svg = $('ct-svg');
    // Un seul écouteur sur le SVG : 211 écouteurs de clic coûteraient cher
    // pour rien, et le tracé n'est de toute façon pas la cible — le doigt
    // tombe le plus souvent à côté.
    svg.addEventListener('click', (e) => {
        if (fini) return;
        const pt = pointSvg(svg, e.clientX, e.clientY);
        const p = plusProche(pt.x, pt.y);
        if (p) viser(p);
    });
}
// Les coordonnées du doigt, ramenées dans le repère du SVG.
function pointSvg(svg, clientX, clientY) {
    const r = svg.getBoundingClientRect();
    const M = window.MONDE;
    return { x: (clientX - r.left) / r.width * M.w, y: (clientY - r.top) / r.height * M.h };
}
function plusProche(x, y) {
    let best = null, bd = Infinity;
    for (const p of window.MONDE.pays) {
        const d = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (d < bd) { bd = d; best = p; }
    }
    return best;
}

function viser(p) {
    // Un pays déjà montré ne se revise pas : il n'apprendrait rien, et le
    // serveur le refuserait.
    if (essais.some(e => e.code === p.c)) { DS.toast('Déjà montré.'); return; }
    vise = p;
    for (const el of document.querySelectorAll('#ct-pays path.vise')) el.classList.remove('vise');
    const el = $('p' + p.c);
    if (el) el.classList.add('vise');
    $('ct-vise-nom').textContent = p.n;
    $('ct-vise').hidden = false;
}

// Les pays déjà montrés, et leur flèche posée dessus : c'est la mémoire du
// joueur, et le seul moyen de trianguler.
function renderMarques() {
    const marques = essais.map(e => {
        const p = parCode.get(e.code);
        if (!p) return '';
        return `<g class="ct-marque ${e.juste ? 'juste' : ''}" transform="translate(${p.x},${p.y})">
            <circle r="7"/>
            ${e.juste ? '<text class="ct-m-ico" y="3">★</text>'
                : `<g transform="rotate(${e.angle})"><path class="ct-m-fleche" d="M0,-5 L3.2,3 L0,1 L-3.2,3 Z"/></g>`}
        </g>`;
    }).join('');
    $('ct-marques').innerHTML = marques;
    for (const e of essais) {
        const el = $('p' + e.code);
        if (el) el.classList.add(e.juste ? 'trouve' : 'rate');
    }
}

function renderEssais() {
    $('ct-essais').innerHTML = essais.map(e => `
        <div class="ct-essai${e.juste ? ' juste' : ''}">
            <span class="ct-e-nom">${esc(e.nom)}</span>
            ${e.juste ? '<span class="ct-e-cap">🎯 trouvé</span>'
                : `<span class="ct-e-cap"><i>${e.fleche}</i>${esc(e.cardinal)}</span>`}
        </div>`).join('');
    const reste = (P.maxEssais || 6) - essais.length;
    $('ct-restants').textContent = fini ? '' : `${reste} essai${reste > 1 ? 's' : ''} restant${reste > 1 ? 's' : ''}`;
    renderMarques();
}

// ---------- La rose des vents ----------
// ⚠️ L'aiguille part toujours de la position où elle s'est arrêtée la fois
// d'avant, et on ajoute des tours entiers : sans ça, passer de 350° à 10°
// la ferait revenir en arrière sur presque un tour complet.
let angleAiguille = 0;
function montrerRose(e) {
    const rose = $('ct-rose');
    $('ct-rose-mot').textContent = e.cardinal;
    $('ct-rose-depuis').textContent = 'depuis ' + e.nom;
    const cible = e.angle;
    const delta = ((cible - (angleAiguille % 360)) + 360) % 360;
    angleAiguille += 360 * 2 + delta;      // deux tours, puis le cap
    const aig = $('ct-rose-aiguille');
    aig.style.transition = 'none';
    aig.style.transform = `rotate(${angleAiguille - 360 * 2 - delta}deg)`;
    rose.hidden = false;
    // Le temps d'un repaint, sinon la transition ne part pas.
    requestAnimationFrame(() => requestAnimationFrame(() => {
        aig.style.transition = 'transform 1.6s cubic-bezier(.16,.84,.26,1)';
        aig.style.transform = `rotate(${angleAiguille}deg)`;
    }));
    // ⚠️ Un filet de sécurité, comme pour le plouf : si l'animation ne tourne
    // pas (onglet en arrière-plan), la rose doit disparaître quand même.
    clearTimeout(montrerRose._t);
    montrerRose._t = setTimeout(fermerRose, 2600);
    rose.addEventListener('click', fermerRose, { once: true });
}
function fermerRose() {
    clearTimeout(montrerRose._t);
    $('ct-rose').hidden = true;
}
// Les graduations et les quatre points cardinaux de la rose.
function dessinerRose() {
    let g = '';
    for (let i = 0; i < 24; i++) {
        const gros = i % 6 === 0;
        g += `<line class="${gros ? 'gros' : ''}" x1="50" y1="${gros ? 6 : 8}" x2="50" y2="${gros ? 14 : 12}"
              transform="rotate(${i * 15} 50 50)"/>`;
    }
    g += '<text class="ct-rose-n" x="50" y="24">N</text>';
    $('ct-rose-grads').innerHTML = g;
}

async function valider() {
    if (!vise || fini) return;
    const code = vise.c;
    $('ct-vise').hidden = true;
    const el = $('p' + code);
    if (el) el.classList.remove('vise');
    vise = null;
    const { ok, data } = await api('/api/carte/montrer', { date: P.date, pays: code });
    if (!ok) { DS.toast((data && data.error) || 'Impossible de montrer ce pays.'); return; }
    essais.push(data.essai);
    fini = data.fini; trouve = data.trouve;
    renderEssais();
    if (!data.essai.juste) {
        montrerRose(data.essai);
        if (data.essai.voisin) setTimeout(() => DS.toast('Tu touches ! C’est un pays voisin.'), 2700);
    }
    // La fin attend la fin de la rose : les deux écrans l'un sur l'autre
    // feraient perdre l'information qu'on vient juste de donner.
    if (fini) setTimeout(() => montrerFin(data), data.essai.juste ? 400 : 2800);
}

// ---------- Le chronomètre ----------
function formaterTemps(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
function lancerChrono() {
    clearInterval(chronoTimer);
    $('ct-chrono').hidden = false;
    chronoTimer = setInterval(() => {
        if (fini) { clearInterval(chronoTimer); return; }
        $('ct-chrono').textContent = formaterTemps(Date.now() - debutA);
    }, 500);
}
let restant = 0;
setInterval(() => {
    if (restant <= 0) return;
    restant--;
    const h = Math.floor(restant / 3600), m = Math.floor((restant % 3600) / 60);
    $('ct-next').textContent = `🕛 ${h} h ${String(m).padStart(2, '0')}`;
}, 1000);

// ---------- La fin ----------
function montrerFin(d) {
    fini = true;
    clearInterval(chronoTimer);
    fermerRose();
    const r = d.reponse || {};
    // Qu'on ait trouvé ou non, la carte montre enfin où il était.
    const el = $('p' + r.code);
    if (el) el.classList.add('reponse');
    $('ct-fin-emoji').textContent = trouve ? (essais.length <= 2 ? '🏆' : '🎉') : '🗺️';
    $('ct-fin-titre').textContent = trouve
        ? `Trouvé en ${essais.length} essai${essais.length > 1 ? 's' : ''} !`
        : 'Raté pour aujourd’hui';
    $('ct-reponse').innerHTML = `<p class="ct-rep-nom">${esc(r.nom || '')}</p>
        <p class="ct-rep-region">${esc(r.region || '')}</p>`;
    $('ct-fin-texte').textContent = trouve
        ? `${d.score} points${d.ms != null ? ' · ' + formaterTemps(d.ms) : ''}.`
        : 'Il est maintenant éclairé sur la carte. Demain, un autre.';
    renderBoard(d.classement || [], d.place);
    $('ct-fin').hidden = false;
    if (!laDate() && window.Enchainement) Enchainement.proposer('carte', $('ct-fin').querySelector('.ds-card'));
}
function renderBoard(liste, maPlace) {
    if (!liste.length) { $('ct-board').innerHTML = ''; return; }
    const medaille = ['🥇', '🥈', '🥉'];
    $('ct-board').innerHTML = `<p class="ct-board-titre">Le classement du jour</p>`
        + liste.map((e, i) => `
            <button type="button" class="ct-board-row${i + 1 === maPlace ? ' moi' : ''}" data-view="${esc(e.u)}">
                <span class="ct-b-rang">${medaille[i] || (i + 1)}</span>
                <span class="ds-avatar xs" data-p="${esc(e.u)}"></span>
                <span class="ct-b-nom">${esc(e.u)}</span>
                <span class="ct-b-essais">${!e.trouve ? '✗' : e.essais + '/6'}</span>
                <span class="ct-b-temps">${e.ms != null ? formaterTemps(e.ms) : ''}</span>
            </button>`).join('');
    if (window.PortailProfile) {
        const box = $('ct-board');
        box.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => PortailProfile.open(b.dataset.view)));
        PortailProfile.fetchAvatars(liste.map(e => e.u)).then(a => {
            box.querySelectorAll('.ds-avatar[data-p]').forEach(el => { el.innerHTML = PortailProfile.bubbleHTML(a[el.dataset.p]); });
        });
    }
}

// Le partage ne révèle jamais le pays : seulement la suite des caps, qui ne
// veut rien dire sans savoir d'où ils ont été pris.
function texteDePartage() {
    const jour = new Date(P.date + 'T12:00:00').toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' });
    return `La carte — ${jour}\n`
        + (trouve ? `${essais.length}/6` : 'X/6') + '\n'
        + essais.map(e => e.juste ? '🎯' : e.fleche).join(' ')
        + `\n${location.origin}/carte`;
}

$('ct-valider').addEventListener('click', valider);
$('ct-fin-close').addEventListener('click', () => { $('ct-fin').hidden = true; });
$('ct-partage').addEventListener('click', async () => {
    const texte = texteDePartage();
    try {
        if (navigator.share) await navigator.share({ text: texte });
        else { await navigator.clipboard.writeText(texte); DS.toast('Résultat copié.'); }
    } catch (e) {}
});
$('ct-start-btn').addEventListener('click', async () => {
    debutA = Date.now();
    $('ct-start').hidden = true;
    $('ct-jeu').hidden = false;
    renderEssais();
    if (!P.archive) {
        const { data } = await api('/api/carte/start', { date: P.date });
        if (data && data.debutA) debutA = data.debutA;
    }
    lancerChrono();
});

// ---------- Le chargement ----------
async function charger() {
    const d = laDate();
    const { data } = await api('/api/carte/today' + (d ? '?date=' + encodeURIComponent(d) : ''));
    P = data;
    document.body.classList.remove('is-boot');
    dessinerRose();
    construireCarte();
    $('ct-date').textContent = new Date(P.date + 'T12:00:00')
        .toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
    $('ct-cherche').textContent = P.cherche || '—';
    $('ct-archive-chip').hidden = !P.archive;
    restant = P.nextIn || 0;
    const serie = (P.serie && P.serie.encours) || 0;
    $('ct-serie').hidden = serie < 2;
    $('ct-serie').querySelector('b').textContent = serie;

    const prog = P.progression || {};
    essais = prog.essais || [];
    fini = !!prog.fini; trouve = !!prog.trouve;
    debutA = prog.debutA || Date.now();

    if (essais.length || fini) {
        $('ct-start').hidden = true;
        $('ct-jeu').hidden = false;
        renderEssais();
        if (!fini) lancerChrono();
        else {
            const { data: cl } = await api('/api/carte/classement?date=' + encodeURIComponent(P.date));
            montrerFin({ reponse: P.reponse, score: prog.score, ms: prog.ms, classement: (cl && cl.classement) || [] });
        }
    } else {
        $('ct-start').hidden = false;
        $('ct-jeu').hidden = true;
        $('ct-chrono').hidden = true;
    }
}
charger();
