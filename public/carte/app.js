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
// Le tracé, la visée par proximité, le zoom et le glissé viennent du socle
// commun (public/geo-commun.js) : la carte sert aussi au Voyage et à
// l'atlas du profil, elle ne peut pas vivre ici.
let CARTE = null;
function construireCarte() {
    for (const p of window.MONDE.pays) parCode.set(p.c, p);
    CARTE = Geo.carte($('ct-carte-box'), {
        surClic: (p) => { if (!fini) viser(p); },
    });
}

function viser(p) {
    // Un pays déjà montré ne se revise pas : il n'apprendrait rien, et le
    // serveur le refuserait.
    if (essais.some(e => e.code === p.c)) { DS.toast('Déjà montré.'); return; }
    vise = p;
    CARTE.demarquer('vise');
    CARTE.marquer(p.c, 'vise');
    $('ct-vise-nom').textContent = p.n;
    $('ct-vise').hidden = false;
}

// Les pays déjà montrés, et leur flèche posée dessus : c'est la mémoire du
// joueur, et le seul moyen de trianguler.
function renderMarques() {
    const marques = essais.map(e => {
        const p = parCode.get(e.code);
        if (!p) return '';
        return `<g class="${e.juste ? 'juste' : ''}" transform="translate(${p.x},${p.y})">
            <circle class="fond" r="7"/>
            ${e.juste ? '<text class="ico" y="3">★</text>'
                : `<g transform="rotate(${e.angle})"><path class="fleche" d="M0,-5 L3.2,3 L0,1 L-3.2,3 Z"/></g>`}
        </g>`;
    }).join('');
    CARTE.marques(marques);
    for (const e of essais) CARTE.marquer(e.code, e.juste ? 'trouve' : 'rate');
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
    // La rose des vents est celle de toute la famille (Geo.rose) : elle rend
    // la main quand l'aiguille s'est posée, donc la fin n'arrive jamais
    // par-dessus l'information qu'on vient de donner.
    if (!data.essai.juste) {
        await Geo.rose({ angle: data.essai.angle, mot: data.essai.cardinal, depuis: data.essai.nom });
        if (data.essai.voisin) DS.toast('Tu touches ! C’est un pays voisin.');
    }
    if (fini) montrerFin(data);
}

// ---------- Le chronomètre ----------
const formaterTemps = Geo.temps;
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
    Geo.fermerRose();
    const r = d.reponse || {};
    // Qu'on ait trouvé ou non, la carte montre enfin où il était.
    if (CARTE && r.code) { CARTE.marquer(r.code, 'reponse'); CARTE.cadrer(r.code, trouve ? 1 : 2.4); }
    $('ct-fin-emoji').textContent = trouve ? (essais.length <= 2 ? '🏆' : '🎉') : '🗺️';
    $('ct-fin-titre').textContent = trouve
        ? `Trouvé en ${essais.length} essai${essais.length > 1 ? 's' : ''} !`
        : 'Raté pour aujourd’hui';
    // La fiche complète : on ne vérifie plus seulement si on avait raison,
    // on apprend le pays.
    $('ct-reponse').innerHTML = Geo.fiche(r);
    $('ct-fin-texte').textContent = trouve
        ? `${d.score} points${d.ms != null ? ' · ' + formaterTemps(d.ms) : ''}.`
        : 'Il est maintenant éclairé sur la carte. Demain, un autre.';
    Geo.classement($('ct-board'), d.classement || [], d.place, (e) => (e.trouve ? e.essais + '/6' : '✗'));
    $('ct-fin').hidden = false;
    if (!laDate() && window.Enchainement) Enchainement.proposer('carte', $('ct-fin').querySelector('.ds-card'));
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
