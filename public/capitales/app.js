// =====================================================================
//  LES CAPITALES — six essais, cinq colonnes de comparaison
//
//  Chaque proposition ne dit pas seulement « non » : elle donne la devise,
//  la langue, la distance, la direction et la population de la capitale
//  proposée, avec une couleur qui dit à quel point c'est proche de la
//  bonne réponse.
//
//  ⚠️ On peut taper un PAYS au lieu de sa capitale, et c'est ce qui rend
//  le jeu jouable : personne n'écrit « Nukuʻalofa » de tête, mais tout le
//  monde sait écrire « Tonga ». Les suggestions montrent donc les deux.
//
//  La capitale du jour ne quitte jamais le serveur avant la fin : le
//  navigateur n'a que l'évaluation de ses propres propositions.
// =====================================================================
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LOCALE = 'fr-FR';
const NOMBRE = new Intl.NumberFormat(LOCALE);

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

let P = null;              // l'état du jour
let NOMS = [];             // les capitales et pays proposables
let essais = [];
let fini = false, trouve = false;
let debutA = 0, chronoTimer = null;
let curseur = -1;

function laDate() {
    try { return new URLSearchParams(location.search).get('date') || ''; } catch (e) { return ''; }
}

// ---------- La recherche ----------
// Accents et casse ignorés, et on accepte qu'on tape le début : « ouaga »
// doit proposer Ouagadougou sans obliger à finir le mot.
function normaliser(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function chercher(saisie) {
    const n = normaliser(saisie);
    if (!n) return [];
    // Une capitale déjà proposée ne ressort pas : elle n'apprendrait rien et
    // le serveur la refuserait.
    const dejaVus = new Set(essais.map(e => normaliser(e.ville)));
    const libres = NOMS.filter(x => !dejaVus.has(normaliser(x.v)));
    const score = (x) => {
        const v = normaliser(x.v), p = normaliser(x.p);
        if (v.startsWith(n)) return 0;          // la capitale d'abord
        if (p.startsWith(n)) return 1;          // puis le pays
        if (v.includes(n)) return 2;
        if (p.includes(n)) return 3;
        return 9;
    };
    return libres.map(x => ({ x, s: score(x) })).filter(o => o.s < 9)
        .sort((a, b) => a.s - b.s || a.x.v.localeCompare(b.x.v, 'fr'))
        .slice(0, 6).map(o => o.x);
}
function renderSuggestions() {
    const liste = chercher($('cp-saisie').value);
    const box = $('cp-suggest');
    if (!liste.length) { box.hidden = true; box.innerHTML = ''; curseur = -1; return; }
    if (curseur >= liste.length) curseur = liste.length - 1;
    box.hidden = false;
    // Le pays est écrit sous la capitale : taper « Kazakhstan » doit montrer
    // qu'on va proposer Astana, sinon on croit s'être trompé.
    box.innerHTML = liste.map((x, i) =>
        `<button type="button" class="cp-sug${i === curseur ? ' on' : ''}" data-nom="${esc(x.v)}">
            <b>${esc(x.v)}</b><small>${esc(x.p)}</small>
        </button>`).join('');
    box.querySelectorAll('.cp-sug').forEach(b =>
        b.addEventListener('click', () => proposer(b.dataset.nom)));
}

// ---------- Les essais ----------
// ⚠️ **Une carte par proposition, et surtout PAS un tableau.** La première
// version alignait six colonnes qui défilaient horizontalement : à 320 px on
// voyait la capitale, la devise et la langue, et il fallait faire glisser le
// tableau pour atteindre la distance et la direction — c'est-à-dire les deux
// indices sur lesquels on raisonne vraiment. Cacher le principal derrière un
// geste, c'est le rendre invisible.
//
// La carte met donc la distance et la direction en gros à droite du nom, et
// range les trois comparaisons secondaires en pastilles dessous. Tout tient
// dans la largeur, sans rien à faire glisser.
const SENS = { 1: '▲', '-1': '▼', 0: '=' };
const TITRE_POP = { 1: 'La réponse est plus peuplée', '-1': 'La réponse est moins peuplée', 0: '' };
function renderEssais() {
    $('cp-essais').innerHTML = essais.map(e => `
        <div class="cp-essai ${e.distance.etat}${e.juste ? ' juste' : ''}">
            <div class="cp-e-haut">
                <span class="cp-e-nom"><b>${esc(e.ville)}</b><small>${esc(e.pays)}</small></span>
                <span class="cp-e-loin">
                    ${e.juste ? '<b class="cp-e-km">🎯 trouvé</b>'
                        : `<b class="cp-e-km">${NOMBRE.format(e.distance.km)} km</b>
                           <small><em>${e.direction.fleche}</em>${esc(e.direction.cardinal)}</small>`}
                </span>
            </div>
            <div class="cp-e-bas">
                <span class="cp-p ${e.devise.etat}">${esc(e.devise.valeur || '—')}</span>
                <span class="cp-p ${e.langue.etat}">${esc(e.langue.valeur)}</span>
                <span class="cp-p ${e.population.etat}" title="${esc(TITRE_POP[e.population.sens] || '')}">
                    ${compact(e.population.valeur)} <i>${SENS[e.population.sens] || ''}</i></span>
            </div>
        </div>`).join('');
    $('cp-aide').hidden = !essais.length;
    const reste = (P.maxEssais || 6) - essais.length;
    $('cp-restants').textContent = fini ? '' : `${reste} essai${reste > 1 ? 's' : ''} restant${reste > 1 ? 's' : ''}`;
}
// 1 234 567 habitants se lit mal dans une case de 70 px : on arrondit.
function compact(n) {
    if (!n) return '—';
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.', ',') + ' M';
    if (n >= 1e4) return Math.round(n / 1e3) + ' k';
    return NOMBRE.format(n);
}

async function proposer(nom) {
    if (fini) return;
    $('cp-saisie').value = '';
    $('cp-suggest').hidden = true;
    curseur = -1;
    const { ok, data } = await api('/api/capitales/proposer', { date: P.date, saisie: nom });
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
    $('cp-chrono').hidden = false;
    chronoTimer = setInterval(() => {
        if (fini) { clearInterval(chronoTimer); return; }
        $('cp-chrono').textContent = formaterTemps(Date.now() - debutA);
    }, 500);
}
let restant = 0;
setInterval(() => {
    if (restant <= 0) return;
    restant--;
    const h = Math.floor(restant / 3600), m = Math.floor((restant % 3600) / 60);
    $('cp-next').textContent = `🕛 ${h} h ${String(m).padStart(2, '0')}`;
}, 1000);

// ---------- La fin ----------
function montrerFin(d) {
    fini = true;
    clearInterval(chronoTimer);
    const r = d.reponse || {};
    $('cp-fin-emoji').textContent = trouve ? (essais.length <= 2 ? '🏆' : '🎉') : '🏙️';
    $('cp-fin-titre').textContent = trouve
        ? `Trouvé en ${essais.length} essai${essais.length > 1 ? 's' : ''} !`
        : 'Raté pour aujourd’hui';
    $('cp-reponse').innerHTML = `
        <p class="cp-rep-nom">${esc(r.ville || '')}</p>
        <p class="cp-rep-pays">${esc(r.pays || '')}</p>
        <p class="cp-rep-infos">${esc(r.devise || '')} · ${esc(r.langue || '')} · ${compact(r.pop)} habitants</p>`;
    $('cp-fin-texte').textContent = trouve
        ? `${d.score} points${d.ms != null ? ' · ' + formaterTemps(d.ms) : ''}.`
        : 'Six essais, et le compte n’y est pas. Demain, une autre ville.';
    renderBoard(d.classement || [], d.place);
    $('cp-fin').hidden = false;
    if (!laDate() && window.Enchainement) Enchainement.proposer('capitales', $('cp-fin').querySelector('.ds-card'));
}
function renderBoard(liste, maPlace) {
    if (!liste.length) { $('cp-board').innerHTML = ''; return; }
    const medaille = ['🥇', '🥈', '🥉'];
    $('cp-board').innerHTML = `<p class="cp-board-titre">Le classement du jour</p>`
        + liste.map((e, i) => `
            <button type="button" class="cp-board-row${i + 1 === maPlace ? ' moi' : ''}" data-view="${esc(e.u)}">
                <span class="cp-b-rang">${medaille[i] || (i + 1)}</span>
                <span class="ds-avatar xs" data-p="${esc(e.u)}"></span>
                <span class="cp-b-nom">${esc(e.u)}</span>
                <span class="cp-b-essais">${!e.trouve ? '✗' : e.essais + '/6'}</span>
                <span class="cp-b-temps">${e.ms != null ? formaterTemps(e.ms) : ''}</span>
            </button>`).join('');
    if (window.PortailProfile) {
        const box = $('cp-board');
        box.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => PortailProfile.open(b.dataset.view)));
        PortailProfile.fetchAvatars(liste.map(e => e.u)).then(a => {
            box.querySelectorAll('.ds-avatar[data-p]').forEach(el => { el.innerHTML = PortailProfile.bubbleHTML(a[el.dataset.p]); });
        });
    }
}

// Le partage ne révèle jamais la ville : seulement la couleur des colonnes,
// comme les carrés de Motus racontent la partie sans donner le mot.
const CARRE = { vert: '🟩', orange: '🟧', rouge: '🟥', neutre: '⬜' };
function texteDePartage() {
    const jour = new Date(P.date + 'T12:00:00').toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' });
    const lignes = essais.map(e => CARRE[e.devise.etat] + CARRE[e.langue.etat]
        + CARRE[e.distance.etat] + CARRE[e.population.etat] + ' ' + (e.juste ? '🎯' : e.direction.fleche));
    return `Les capitales — ${jour}\n`
        + (trouve ? `${essais.length}/6` : 'X/6') + '\n'
        + lignes.join('\n')
        + `\n${location.origin}/capitales`;
}

$('cp-fin-close').addEventListener('click', () => { $('cp-fin').hidden = true; });
$('cp-partage').addEventListener('click', async () => {
    const texte = texteDePartage();
    try {
        if (navigator.share) await navigator.share({ text: texte });
        else { await navigator.clipboard.writeText(texte); DS.toast('Résultat copié.'); }
    } catch (e) {}
});

$('cp-start-btn').addEventListener('click', async () => {
    debutA = Date.now();
    $('cp-start').hidden = true;
    $('cp-jeu').hidden = false;
    renderEssais();
    if (!P.archive) {
        const { data } = await api('/api/capitales/start', { date: P.date });
        if (data && data.debutA) debutA = data.debutA;
    }
    lancerChrono();
    $('cp-saisie').focus();
});

// La saisie : suggestions au fil de la frappe, flèches pour naviguer, Entrée
// pour valider. Pas de clavier à l'écran — celui du téléphone suffit.
$('cp-saisie').addEventListener('input', () => { curseur = -1; renderSuggestions(); });
$('cp-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const liste = chercher($('cp-saisie').value);
    if (!liste.length) { DS.toast('Aucune capitale ni pays ne correspond.'); return; }
    proposer(liste[Math.max(0, curseur)].v);
});
$('cp-saisie').addEventListener('keydown', (e) => {
    const liste = chercher($('cp-saisie').value);
    if (!liste.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); curseur = Math.min(liste.length - 1, curseur + 1); renderSuggestions(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); curseur = Math.max(0, curseur - 1); renderSuggestions(); }
    else if (e.key === 'Escape') { $('cp-suggest').hidden = true; curseur = -1; }
});

// ---------- Le chargement ----------
async function charger() {
    const d = laDate();
    const [{ data: etat }, { data: liste }] = await Promise.all([
        api('/api/capitales/today' + (d ? '?date=' + encodeURIComponent(d) : '')),
        NOMS.length ? Promise.resolve({ data: null }) : api('/api/capitales/liste'),
    ]);
    if (liste && liste.noms) NOMS = liste.noms;
    P = etat;
    document.body.classList.remove('is-boot');
    $('cp-date').textContent = new Date(P.date + 'T12:00:00')
        .toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
    $('cp-archive-chip').hidden = !P.archive;
    restant = P.nextIn || 0;
    const serie = (P.serie && P.serie.encours) || 0;
    $('cp-serie').hidden = serie < 2;
    $('cp-serie').querySelector('b').textContent = serie;

    const prog = P.progression || {};
    essais = prog.essais || [];
    fini = !!prog.fini; trouve = !!prog.trouve;
    debutA = prog.debutA || Date.now();

    if (essais.length || fini) {
        $('cp-start').hidden = true;
        $('cp-jeu').hidden = false;
        renderEssais();
        if (!fini) lancerChrono();
        else {
            const { data: cl } = await api('/api/capitales/classement?date=' + encodeURIComponent(P.date));
            montrerFin({
                reponse: P.reponse, score: prog.score, ms: prog.ms,
                classement: (cl && cl.classement) || [],
            });
        }
    } else {
        $('cp-start').hidden = false;
        $('cp-jeu').hidden = true;
        $('cp-chrono').hidden = true;
    }
}
charger();
