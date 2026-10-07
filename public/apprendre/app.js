// =====================================================================
//  APPRENDRE LA GÉOGRAPHIE
//
//  ⚠️ Ce n'est pas un jeu du jour : aucun point, aucun classement, aucune
//  limite, et on peut refaire une séance autant de fois qu'on veut. Dès
//  qu'il y a un classement, on cesse de se tromper — et on cesse
//  d'apprendre. Les cinq jeux sont l'épreuve, ceci est l'entraînement.
//
//  ⚠️ La fiche du pays s'affiche à CHAQUE réponse, juste ou fausse. C'est
//  le moment où l'on regarde vraiment ; la cacher quand on a bon serait
//  manquer la moitié des occasions d'apprendre.
// =====================================================================
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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

let BILAN = null;
let Q = null;                 // la question affichée
let repondu = false;
let derniereSource = 'revision';
let ATLAS = null, CARTE_Q = null;
let CADRE = null;            // les pays de la leçon, pour cadrer la carte
let NIVEAUX = {};            // le niveau de chaque pays, tel qu'affiché
let AVANT = null;            // l'état d'avant la séance, pour dire ce qui a changé

// ---------- L'accueil ----------
// ⚠️ Le rang disait CINQ FOIS la même chose : le nom du rang, le nombre de
// pays maîtrisés, la jauge, le gain de la courbe, et ce qui reste à faire.
// Quatre suffisent, et alignées à gauche elles se lisent d'un coup d'œil —
// un bloc centré oblige l'œil à repartir du milieu à chaque ligne.
function renderRang(b) {
    const r = b.rang;
    $('ap-rang').innerHTML = `
        <div class="ap-rang-tete">
            <span class="ap-rang-emoji">${r.emoji}</span>
            <span class="ap-rang-txt">
                <b>${esc(r.nom)}</b>
                <small><b>${b.maitrises}</b> / ${b.total} pays maîtrisés</small>
            </span>
        </div>
        <div class="ap-jauge grande"><i style="width:${r.part}%"></i></div>
        <p class="ap-rang-suite">${r.suivant
            ? `Encore <b>${r.suivant.manque}</b> pour devenir ${esc(r.suivant.emoji + ' ' + r.suivant.nom)}`
            : 'Tu as fait le tour du monde.'}</p>
        ${courbeHTML(b.courbe)}
        ${b.place ? `<button type="button" class="ap-place" id="ap-place">
            🏅 <b>${b.place.place}<sup>${b.place.place === 1 ? 're' : 'e'}</sup></b>
            sur ${b.place.total} · voir le classement ›</button>` : ''}`;
    const bouton = $('ap-place');
    if (bouton) bouton.addEventListener('click', ouvrirClassement);
}

// ---------- Le classement de la géographie ----------
// ⚠️ UNE LIGNE, PAS UN BLOC. La page vient d'être ramenée de 2 597 px à un
// écran ; un classement posé à plat y aurait rendu la moitié du terrain
// gagné. Sa place tient dans la carte du rang, et la liste complète s'ouvre
// par-dessus — on ne la consulte pas à chaque visite.
//
// ⚠️ Il ne distribue aucun point et n'entre dans aucune saison : c'est un
// état des lieux, pas une course. L'Université reste l'entraînement — dès
// qu'il y a des points à gagner, on cesse de se tromper, et on cesse
// d'apprendre. Savoir où l'on se situe est autre chose que marquer.
async function ouvrirClassement() {
    const { ok, data } = await api('/api/apprendre/classement');
    if (!ok) { DS.toast('Classement indisponible.'); return; }
    const lignes = (data.lignes || []).map((l, i) => `
        <button type="button" class="ap-cl-l${l.pseudo === data.moi ? ' moi' : ''}" data-qui="${esc(l.pseudo)}">
            <span class="ap-cl-place">${i + 1}</span>
            <span class="ap-cl-nom">${esc(l.pseudo)}<small>${l.rang.emoji} ${esc(l.rang.nom)}</small></span>
            <span class="ap-cl-n"><b>${l.maitrises}</b><small>sur ${l.vus} croisés</small></span>
        </button>`).join('');
    $('ap-cl-liste').innerHTML = lignes
        || `<p class="ap-cl-vide">Personne n'a encore commencé.</p>`;
    $('ap-classement').hidden = false;
    // Toucher quelqu'un ouvre son profil — donc son atlas, désormais.
    $('ap-cl-liste').querySelectorAll('[data-qui]').forEach(b =>
        b.addEventListener('click', () => PortailProfile.open(b.dataset.qui)));
}

// ---------- Ce qui a changé ----------
// ⚠️ On revenait d'une séance sur une page identique à l'œil. Des niveaux
// avaient monté, parfois un pays était passé maîtrisé, parfois le rang avec
// lui — et rien ne le disait. Le seul retour était le score de la séance, qui
// parle de la séance et non du chemin parcouru. Ici on compare l'avant et
// l'après, et les pays qui ont bougé clignotent sur la carte : c'est la carte
// qui porte la récompense, pas une phrase.
function montrerChangements() {
    const h = $('ap-change');
    if (!AVANT || !BILAN) { h.hidden = true; return; }
    // ⚠️ DÉCOUVRIR ET CONSOLIDER NE SONT PAS LA MÊME NOUVELLE. Un pays raté
    // monte quand même de « jamais vu » à « découvert » — il entre dans les
    // révisions, et c'est bien ce qu'on veut. Mais tout compter comme une
    // progression annonçait « 10 pays ont progressé » après un 1 sur 10 : le
    // bandeau contredisait le score affiché une seconde plus tôt.
    const neufs = [], montes = [], descendus = [];
    for (const code of new Set([...Object.keys(NIVEAUX), ...Object.keys(AVANT.niveaux)])) {
        const a = AVANT.niveaux[code] || 0, b = NIVEAUX[code] || 0;
        if (b > a) (a ? montes : neufs).push(code);
        else if (b < a) descendus.push(code);
    }
    const gagnes = BILAN.maitrises - AVANT.maitrises;
    const rangNeuf = BILAN.rang.nom !== AVANT.rang;
    const bouges = neufs.concat(montes, descendus);
    AVANT = null;                       // une seule fois : au retour de séance
    if (!bouges.length && !gagnes) { h.hidden = true; return; }

    const bouts = [];
    if (gagnes > 0) bouts.push(`<b>+${gagnes}</b> pays maîtrisé${gagnes > 1 ? 's' : ''}`);
    if (neufs.length) bouts.push(`<b>${neufs.length}</b> pays découvert${neufs.length > 1 ? 's' : ''}`);
    if (montes.length) bouts.push(`<b>${montes.length}</b> consolidé${montes.length > 1 ? 's' : ''}`);
    if (descendus.length) bouts.push(`<b>${descendus.length}</b> à revoir`);
    h.innerHTML = `
        <p class="ap-change-txt">${rangNeuf
            ? `${BILAN.rang.emoji} Te voilà <b>${esc(BILAN.rang.nom)}</b> — `
            : 'Depuis ta séance : '}${bouts.join(', ')}.</p>
        <small>Ils clignotent sur ta carte.</small>`;
    h.hidden = false;
    // Le clignotement s'éteint seul : un repère permanent cesserait d'en être un.
    for (const code of bouges) if (ATLAS) ATLAS.marquer(code, 'bouge');
    setTimeout(() => { if (ATLAS) ATLAS.demarquer('bouge'); }, 6000);
}

// ⚠️ La courbe de progression : la seule chose qui donne envie de continuer
// quand l'objectif est à cent quatre-vingt-quatorze et qu'on en est à trente.
// Un chiffre seul ne dit pas qu'on avance ; une courbe, si. Deux points
// suffisent à la tracer — en dessous, on ne montre rien plutôt qu'un trait
// plat qui ressemblerait à une panne.
function courbeHTML(points) {
    if (!points || points.length < 2) return '';
    const n = points.length;
    // ⚠️ DEUX RELEVÉS NE FONT PAS UNE COURBE. La garde ne comptait que les
    // points, jamais leurs valeurs : deux jours à zéro passaient, et on
    // dessinait soixante pixels de vide traversés d'un trait parfaitement
    // plat — précisément la panne que ce commentaire disait éviter. Tant que
    // rien n'a bougé, il n'y a rien à montrer, et le rang se suffit.
    const valeurs = points.map(p => p.n);
    if (Math.max(...valeurs) === Math.min(...valeurs)) return '';
    const haut = Math.max(1, ...valeurs);
    const L = 300, H = 46;
    const d = points.map((p, i) =>
        `${i ? 'L' : 'M'}${(i / (n - 1) * L).toFixed(1)},${(H - p.n / haut * (H - 4)).toFixed(1)}`).join('');
    const gagnes = points[n - 1].n - points[0].n;
    return `<div class="ap-courbe">
        <svg viewBox="0 0 ${L} ${H}" preserveAspectRatio="none" aria-hidden="true">
            <path class="ligne" d="${d}"/>
            <path class="aire" d="${d}L${L},${H}L0,${H}Z"/>
        </svg>
        <small>${gagnes > 0 ? `+${gagnes} pays sur ${n} jours` : `${n} jours suivis`}</small>
    </div>`;
}

function renderPortes(b) {
    // ⚠️ Trois portes, et pas une de plus. Réviser est la principale : c'est
    // elle qui fait apprendre, les deux autres servent à nourrir la pile.
    const portes = [
        { source: 'revision', emoji: '🔁', nom: 'Réviser',
          sous: b.aRevoir ? `${b.aRevoir} pays t'attendent` : 'Rien d’urgent — découvre de nouveaux pays',
          fort: b.aRevoir > 0 },
        { source: 'decouvrir', emoji: '🧭', nom: 'Découvrir une région',
          sous: 'Par petits groupes, pas le monde entier' },
        { source: 'libre', emoji: '🎲', nom: 'Au hasard',
          sous: 'Dix pays, sans conséquence' },
    ];
    $('ap-portes').innerHTML = portes.map(p => `
        <button type="button" class="ap-porte${p.fort ? ' fort' : ''}" data-source="${p.source}">
            <span class="ap-porte-emoji">${p.emoji}</span>
            <span class="ap-porte-txt"><b>${esc(p.nom)}</b><small>${esc(p.sous)}</small></span>
            <span class="ap-porte-fleche">›</span>
        </button>`).join('')
        + `<button type="button" class="ap-regler" id="ap-regler">⚙️ Ce que je veux travailler</button>`;
    $('ap-regler').addEventListener('click', () => {
        const r = $('ap-reglages');
        r.hidden = !r.hidden;
        r.open = !r.hidden;
        if (!r.hidden) r.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    $('ap-portes').querySelectorAll('[data-source]').forEach(b2 => b2.addEventListener('click', () => {
        if (b2.dataset.source === 'decouvrir') {
            // ⚠️ Le tiroir est replié : y faire défiler sans l'ouvrir
            // amènerait sur une ligne fermée, et la porte paraîtrait morte.
            $('ap-tiroir-regions').open = true;
            $('ap-tiroir-regions').scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }
        lancerSeance(b2.dataset.source);
    }));
}

// ⚠️ Les continents d'abord. Vingt-quatre régions d'un seul tenant, c'était
// une liste à faire défiler, pas une progression : on ne voyait ni où on en
// était ni par où commencer. Six portes, et chacune s'ouvre sur ses leçons.
let continentOuvert = null;

// ⚠️ Le choix des formes existait côté serveur depuis le début et n'était
// jamais envoyé : impossible de dire « aujourd'hui, les drapeaux seulement ».
// La fonctionnalité était écrite et inaccessible.
const FORMES = [
    { id: 'drapeau', nom: 'Reconnaître un drapeau', emoji: '🏳️' },
    { id: 'nom-drapeau', nom: 'Retrouver un drapeau', emoji: '🔍' },
    { id: 'silhouette', nom: 'Reconnaître une forme', emoji: '🗺️' },
    { id: 'nom-silhouette', nom: 'Retrouver une forme', emoji: '🧩' },
    { id: 'capitale', nom: 'Les capitales', emoji: '🏙️' },
    { id: 'pays', nom: 'De quel pays ?', emoji: '🔎' },
    { id: 'position', nom: 'Situer sur la carte', emoji: '📍' },
];
let formesChoisies = new Set();
function renderFormes() {
    $('ap-formes').innerHTML = FORMES.map(f => `
        <button type="button" class="ap-forme${formesChoisies.has(f.id) ? ' on' : ''}" data-forme="${f.id}">
            ${f.emoji} ${esc(f.nom)}
        </button>`).join('');
    $('ap-formes').querySelectorAll('[data-forme]').forEach(b => b.addEventListener('click', () => {
        if (formesChoisies.has(b.dataset.forme)) formesChoisies.delete(b.dataset.forme);
        else formesChoisies.add(b.dataset.forme);
        renderFormes();
    }));
}

// ---------- Les familles de drapeaux ----------
// ⚠️ Repliées, comme les continents. Dépliées, les dix familles faisaient
// 1 437 px sur une page de 2 597 — **55 % de la page pour une porte
// secondaire**, et elles repoussaient la carte du monde à deux mille pixels
// du haut. La règle et les drapeaux ne s'affichent qu'à l'ouverture.
let familleOuverte = null;
let FAMILLES_VUES = [];
function renderFamilles() {
    $('ap-familles').innerHTML = FAMILLES_VUES.map(f => {
        const ouverte = familleOuverte === f.id;
        return `
        <div class="ap-famille${ouverte ? ' ouverte' : ''}">
            <button type="button" class="ap-famille-tete" data-ouvrir="${esc(f.id)}">
                <span class="ap-famille-emoji">${f.emoji}</span>
                <span class="ap-famille-txt"><b>${esc(f.nom)}</b><small>${f.su} / ${f.total}</small></span>
                <span class="ap-jauge petite"><i style="width:${f.part}%"></i></span>
                <span class="ap-cont-chevron">›</span>
            </button>
            <div class="ap-famille-corps">
                <p class="ap-famille-regle">${esc(f.regle)}</p>
                <p class="ap-famille-drapeaux">${f.pays.map(c => drapeauDe(c)).join(' ')}</p>
                <button type="button" class="ds-btn small" data-famille="${esc(f.id)}">S'entraîner dessus</button>
            </div>
        </div>`;
    }).join('');
    $('ap-familles').querySelectorAll('[data-ouvrir]').forEach(b => b.addEventListener('click', () => {
        familleOuverte = familleOuverte === b.dataset.ouvrir ? null : b.dataset.ouvrir;
        renderFamilles();
    }));
    $('ap-familles').querySelectorAll('[data-famille]').forEach(b =>
        b.addEventListener('click', () => lancerSeance('famille:' + b.dataset.famille)));
}
async function chargerFamilles() {
    const { ok, data } = await api('/api/apprendre/familles');
    if (!ok) return;
    FAMILLES_VUES = data.familles;
    // Le compte sur le tiroir replié : c'est lui qui donne envie de l'ouvrir.
    const su = FAMILLES_VUES.reduce((s, f) => s + f.su, 0);
    const tot = FAMILLES_VUES.reduce((s, f) => s + f.total, 0);
    $('ap-fam-compte').textContent =
        `${FAMILLES_VUES.length} familles · ${su} / ${tot} drapeaux sus`;
    renderFamilles();
}
// Le drapeau d'un code, construit comme côté serveur : deux lettres
// converties en indicateurs régionaux.
const drapeauDe = (code) => String.fromCodePoint(...[...code].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
function renderRegions(b) {
    $('ap-reg-compte').textContent =
        `${b.continents.length} continents · ${b.regions.length} leçons`;
    $('ap-regions').innerHTML = b.continents.map(c => {
        const siennes = b.regions.filter(r => r.continent === c.id);
        const ouvert = continentOuvert === c.id;
        return `
        <div class="ap-cont${ouvert ? ' ouvert' : ''}">
            <button type="button" class="ap-cont-tete" data-continent="${esc(c.id)}">
                <span class="ap-cont-emoji">${c.emoji}</span>
                <span class="ap-cont-txt">
                    <b>${esc(c.nom)}</b>
                    <small>${c.su} / ${c.total} pays su${c.su > 1 ? 's' : ''}</small>
                </span>
                <span class="ap-jauge petite"><i style="width:${c.part}%"></i></span>
                <span class="ap-cont-chevron">›</span>
            </button>
            <div class="ap-cont-corps">
                ${siennes.map(r => `
                    <button type="button" class="ap-region" data-region="${esc(r.id)}">
                        <span class="ap-region-txt">
                            <b>${esc(r.nom)}</b>
                            <small>${r.su} / ${r.total}</small>
                        </span>
                        <span class="ap-jauge petite"><i style="width:${r.part}%"></i></span>
                    </button>`).join('')}
            </div>
        </div>`;
    }).join('');

    $('ap-regions').querySelectorAll('[data-continent]').forEach(t => t.addEventListener('click', () => {
        continentOuvert = continentOuvert === t.dataset.continent ? null : t.dataset.continent;
        renderRegions(b);
        if (continentOuvert) {
            const el = $('ap-regions').querySelector(`[data-continent="${continentOuvert}"]`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }));
    $('ap-regions').querySelectorAll('[data-region]').forEach(b2 =>
        b2.addEventListener('click', () => lancerSeance('region:' + b2.dataset.region)));
}

// La carte de maîtrise : chaque pays prend la teinte de son niveau. C'est
// l'atlas du profil, mais il raconte ici ce qu'on SAIT et non ce qu'on a
// croisé une fois.
async function renderAtlas() {
    if (!window.MONDE || !window.Geo) return;
    const { ok, data } = await api('/api/apprendre/niveaux');
    if (!ok) return;
    if (!ATLAS) ATLAS = Geo.carte($('ap-atlas'), { surClic: (p) => ouvrirFiche(p.c) });
    for (let n = 1; n <= 5; n++) ATLAS.demarquer('niv' + n);
    NIVEAUX = data.niveaux || {};
    for (const [code, n] of Object.entries(NIVEAUX)) {
        if (n > 0) ATLAS.marquer(code, 'niv' + n);
    }
}
async function ouvrirFiche(code) {
    const { ok, data } = await api('/api/apprendre/pays?code=' + encodeURIComponent(code));
    if (!ok) return;
    const NIV = ['jamais vu', 'découvert', 'reconnu', 'su', 'solide', 'acquis'];
    DS.confirm({
        emoji: data.drapeau, title: data.nom,
        text: 'Tu le connais : ' + NIV[data.niveau || 0] + '.',
        actions: [], cancelLabel: 'Fermer', closeIcon: false,
    });
    // La fiche complète sous le titre, une fois la popup montée.
    setTimeout(() => {
        const t = document.querySelector('#ds-confirm-text');
        if (t) t.insertAdjacentHTML('afterend', Geo.fiche(data));
    }, 30);
}

async function chargerAccueil() {
    // Les réglages prennent leur place sous les portes dès le départ : sans
    // ça ils flottaient à côté de leur hôte, et ne le rejoignaient qu'après
    // une première séance.
    $('ap-reglages-hote').appendChild($('ap-reglages'));
    const { ok, data } = await api('/api/apprendre/bilan');
    if (!ok) return;
    BILAN = data;
    document.body.classList.remove('is-boot');
    renderRang(data); renderPortes(data); renderRegions(data);
    renderFormes(); chargerFamilles();
    // ⚠️ La carte AVANT le bilan des changements : c'est elle qui porte le
    // clignotement, et `NIVEAUX` n'est à jour qu'une fois la carte peinte.
    await renderAtlas();
    montrerChangements();
}

// ---------- Une séance ----------
async function lancerSeance(source) {
    derniereSource = source;
    // L'instantané d'avant : sans lui, il n'y a rien à comparer au retour.
    // ⚠️ On ne le reprend PAS à chaque séance enchaînée : il doit décrire
    // tout ce qui a changé depuis qu'on a quitté l'accueil, sinon trois
    // séances d'affilée n'en montreraient qu'une.
    if (!AVANT && BILAN) {
        AVANT = { niveaux: { ...NIVEAUX }, maitrises: BILAN.maitrises, rang: BILAN.rang.nom };
    }
    const { ok, data } = await api('/api/apprendre/seance', {
        source, combien: 10,
        formes: formesChoisies.size ? [...formesChoisies] : null,
        saisie: $('ap-saisie-libre').checked,
    });
    if (!ok) { DS.toast((data && data.error) || 'Impossible de lancer la séance.'); return; }
    if (data.vide || !data.question) { DS.toast('Rien à revoir pour l’instant.'); return; }
    // ⚠️ DEUX SORTIES L'UNE SOUS L'AUTRE, ET ELLES NE FONT PAS LA MÊME CHOSE.
    // L'en-tête du site restait affiché pendant une question : son « ← »
    // quittait l'Université, le « ✕ » juste dessous arrêtait la séance. Rien
    // ne distinguait les deux, et le titre occupait soixante pixels au-dessus
    // de la question. Une séance est un écran à elle seule, avec une seule
    // sortie — c'est déjà la règle des vues dans les autres jeux.
    document.body.classList.add('en-seance');
    $('ap-accueil').hidden = true;
    $('ap-seance').hidden = false;
    $('ap-s-titre').textContent = data.titre;
    CADRE = data.cadre || null;
    CARTE_Q = null;          // une nouvelle leçon, un nouveau cadrage
    montrerQuestion(data.question);
}

function montrerQuestion(q) {
    Q = q; repondu = false;
    $('ap-correction').hidden = true;
    $('ap-s-compte').textContent = `${q.index + 1}/${q.total}`;
    $('ap-jauge-barre').style.width = Math.round(q.index / q.total * 100) + '%';
    $('ap-consigne').textContent = q.consigne;

    // L'énoncé prend la forme de la question : une silhouette, un drapeau,
    // un nom de ville, ou rien quand c'est la carte qui sert d'énoncé.
    if (q.chemin) {
        $('ap-enonce').className = 'ap-enonce silhouette';
        $('ap-enonce').innerHTML = `<svg viewBox="0 0 100 100" role="img" aria-label="Silhouette à reconnaître"><path d="${esc(q.chemin)}"/></svg>`;
    } else if (q.drapeau && q.forme === 'drapeau') {
        $('ap-enonce').className = 'ap-enonce drapeau';
        $('ap-enonce').innerHTML = `<span>${q.drapeau}</span>`;
    } else if (q.enonce) {
        $('ap-enonce').className = 'ap-enonce mot';
        $('ap-enonce').innerHTML = `<span>${q.drapeau || ''} ${esc(q.enonce)}</span>`;
    } else {
        $('ap-enonce').className = 'ap-enonce';
        $('ap-enonce').innerHTML = '';
    }

    if (q.type === 'carte') {
        // ⚠️ La carte est construite une seule fois et réutilisée : la
        // reconstruire à chaque question rejouerait deux cent dix tracés
        // pour rien, et perdrait le zoom au passage.
        $('ap-choix').innerHTML = '<div class="ap-carte" id="ap-carte-q"></div>';
        CARTE_Q = Geo.carte($('ap-carte-q'), { surClic: (p) => repondre(p.c) });
        // ⚠️ Dans une leçon de région, la carte montre LA RÉGION. Chercher le
        // Laos sur une carte du monde, c'est chercher une aiguille ; sur
        // l'Asie du Sud-Est, c'est apprendre. On peut toujours dézoomer.
        if (CADRE) CARTE_Q.cadrerSur(CADRE);
        return;
    }
    // La saisie libre : plus de choix, on écrit. ⚠️ Pas d'autocomplétion —
    // elle rendrait l'exercice aussi facile qu'un choix multiple, et c'est
    // précisément ce qu'on veut éviter ici.
    if (q.type === 'saisie') {
        $('ap-choix').innerHTML = `
            <form class="ap-saisie-form" id="ap-saisie-form" autocomplete="off">
                <input class="ds-input" id="ap-saisie-champ" type="text"
                       placeholder="${q.attendu === 'capitale' ? 'La capitale…' : 'Le pays…'}"
                       autocomplete="off" autocorrect="off" autocapitalize="words" spellcheck="false"
                       aria-label="Ta réponse">
                <button class="ds-btn" type="submit">Valider</button>
            </form>`;
        $('ap-saisie-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const v = $('ap-saisie-champ').value.trim();
            if (v) repondre(v);
        });
        $('ap-saisie-champ').focus();
        return;
    }
    // Les deux ponts inverses : ce sont les CHOIX qui portent l'image.
    if (q.type === 'images') {
        $('ap-choix').innerHTML = `<div class="ap-grille">` + q.choix.map(c =>
            `<button type="button" class="ap-image" data-v="${esc(c.v)}">${c.d}</button>`).join('') + `</div>`;
    } else if (q.type === 'formes') {
        $('ap-choix').innerHTML = `<div class="ap-grille">` + q.choix.map(c =>
            `<button type="button" class="ap-forme-choix" data-v="${esc(c.v)}">
                <svg viewBox="0 0 100 100" aria-hidden="true"><path d="${esc(c.c)}"/></svg>
            </button>`).join('') + `</div>`;
    } else {
        $('ap-choix').innerHTML = q.choix.map(c =>
            `<button type="button" class="ap-choix-btn" data-v="${esc(c.v)}">${esc(c.t)}</button>`).join('');
    }
    $('ap-choix').querySelectorAll('[data-v]').forEach(b =>
        b.addEventListener('click', () => repondre(b.dataset.v)));
}

async function repondre(valeur) {
    if (repondu) return;
    repondu = true;
    const { ok, data } = await api('/api/apprendre/repondre', { reponse: valeur });
    if (!ok) { DS.toast((data && data.error) || 'Réponse refusée.'); repondu = false; return; }

    // On montre le bon et le mauvais choix sur les boutons eux-mêmes.
    $('ap-choix').querySelectorAll('[data-v]').forEach(b => {
        if (b.dataset.v === data.fiche.code) b.classList.add('juste');
        else if (b.dataset.v === valeur) b.classList.add('faux');
        b.disabled = true;
    });
    // En saisie libre, le champ se verrouille : la réponse est donnée juste
    // en dessous, le rouvrir n'aurait aucun sens.
    const champ = $('ap-saisie-champ');
    if (champ) { champ.disabled = true; champ.classList.add(data.juste ? 'juste' : 'faux'); }
    if (CARTE_Q) { CARTE_Q.marquer(data.fiche.code, 'reponse'); if (!data.juste) CARTE_Q.marquer(valeur, 'rate'); }

    const NIV = ['jamais vu', 'découvert', 'reconnu', 'su', 'solide', 'acquis'];
    $('ap-verdict').className = 'ap-verdict ' + (data.juste ? 'bon' : 'rate');
    $('ap-verdict').innerHTML = data.juste
        ? `✓ C'est ça — <b>${esc(NIV[data.niveau])}</b>`
        : `✗ C'était <b>${esc(data.fiche.nom)}</b>`;
    $('ap-fiche').innerHTML = (data.pourquoi
        ? `<p class="ap-pourquoi"><b>${esc(data.pourquoi.quoi)}</b>${esc(data.pourquoi.distinguer)}</p>` : '')
        + Geo.fiche(data.fiche);
    $('ap-correction').hidden = false;
    $('ap-suivant').textContent = data.fini ? 'Voir le bilan' : 'Continuer';
    $('ap-suivant').onclick = () => {
        if (data.fini) montrerFin(data.bilan);
        else montrerQuestion(data.question);
    };
    $('ap-correction').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function montrerFin(b) {
    // ⚠️ On ne remplace PAS `BILAN` par celui-ci : le bilan de séance compte
    // des questions là où celui de l'accueil compte des pays. L'accueil se
    // recharge au retour, c'est lui qui fait foi.
    const part = Math.round(b.justes / b.total * 100);
    $('ap-fin-emoji').textContent = part === 100 ? '🏆' : part >= 70 ? '🎓' : '📚';
    $('ap-fin-titre').textContent = part === 100 ? 'Sans faute !' : part >= 70 ? 'Belle séance' : 'C’est en se trompant qu’on apprend';
    $('ap-fin-score').innerHTML = `<b>${b.justes}</b> / ${b.total}`;
    $('ap-fin-rang').innerHTML = `
        <p class="ap-fin-maitrise"><b>${b.maitrises}</b> pays maîtrisés sur ${b.pays}</p>
        <div class="ap-jauge grande"><i style="width:${b.rang.part}%"></i></div>
        <p class="ap-fin-suite">${b.rang.emoji} ${esc(b.rang.nom)}${b.rang.suivant
            ? ` · encore ${b.rang.suivant.manque} pour ${esc(b.rang.suivant.nom)}` : ''}</p>`;
    // ⚠️ Les réglages suivent le joueur : au moment de décider de la suite,
    // c'est là qu'on veut choisir ce qu'on travaille. Un seul élément déplacé,
    // jamais deux copies — elles finiraient par diverger.
    const r = $('ap-reglages');
    r.hidden = false; r.open = false;
    $('ap-fin-reglages').appendChild(r);
    $('ap-fin').hidden = false;
}

function revenir() {
    // Et ils rentrent à leur place, repliés.
    const r = $('ap-reglages');
    r.hidden = true; r.open = false;
    $('ap-reglages-hote').appendChild(r);
    document.body.classList.remove('en-seance');
    $('ap-fin').hidden = true;
    $('ap-seance').hidden = true;
    $('ap-accueil').hidden = false;
    CARTE_Q = null;
    chargerAccueil();
}
$('ap-cl-close').addEventListener('click', () => { $('ap-classement').hidden = true; });
$('ap-classement').addEventListener('click', (e) => {
    if (e.target === $('ap-classement')) $('ap-classement').hidden = true;
});
$('ap-quitter').addEventListener('click', revenir);
$('ap-retour').addEventListener('click', revenir);
$('ap-fin-close').addEventListener('click', revenir);
$('ap-encore').addEventListener('click', () => { $('ap-fin').hidden = true; lancerSeance(derniereSource); });

chargerAccueil();
