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

// ---------- L'accueil ----------
function renderRang(b) {
    const r = b.rang;
    $('ap-rang').innerHTML = `
        <div class="ap-rang-tete">
            <span class="ap-rang-emoji">${r.emoji}</span>
            <span class="ap-rang-nom">${esc(r.nom)}</span>
        </div>
        <div class="ap-rang-chiffres">
            <b>${b.maitrises}</b><span>pays maîtrisés sur ${b.total}</span>
        </div>
        <div class="ap-jauge grande"><i style="width:${r.part}%"></i></div>
        <p class="ap-rang-suite">${r.suivant
            ? `Encore <b>${r.suivant.manque}</b> pour devenir ${esc(r.suivant.emoji + ' ' + r.suivant.nom)}`
            : 'Tu as fait le tour du monde.'}</p>`;
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
        </button>`).join('');
    $('ap-portes').querySelectorAll('[data-source]').forEach(b2 => b2.addEventListener('click', () => {
        if (b2.dataset.source === 'decouvrir') {
            $('ap-regions').scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }
        lancerSeance(b2.dataset.source);
    }));
}

// ⚠️ Les continents d'abord. Vingt-quatre régions d'un seul tenant, c'était
// une liste à faire défiler, pas une progression : on ne voyait ni où on en
// était ni par où commencer. Six portes, et chacune s'ouvre sur ses leçons.
let continentOuvert = null;
function renderRegions(b) {
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
    for (const [code, n] of Object.entries(data.niveaux || {})) {
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
    const { ok, data } = await api('/api/apprendre/bilan');
    if (!ok) return;
    BILAN = data;
    document.body.classList.remove('is-boot');
    renderRang(data); renderPortes(data); renderRegions(data);
    renderAtlas();
}

// ---------- Une séance ----------
async function lancerSeance(source) {
    derniereSource = source;
    const { ok, data } = await api('/api/apprendre/seance', { source, combien: 10 });
    if (!ok) { DS.toast((data && data.error) || 'Impossible de lancer la séance.'); return; }
    if (data.vide || !data.question) { DS.toast('Rien à revoir pour l’instant.'); return; }
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
    $('ap-choix').innerHTML = q.choix.map(c =>
        `<button type="button" class="ap-choix-btn" data-v="${esc(c.v)}">${esc(c.t)}</button>`).join('');
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
    if (CARTE_Q) { CARTE_Q.marquer(data.fiche.code, 'reponse'); if (!data.juste) CARTE_Q.marquer(valeur, 'rate'); }

    const NIV = ['jamais vu', 'découvert', 'reconnu', 'su', 'solide', 'acquis'];
    $('ap-verdict').className = 'ap-verdict ' + (data.juste ? 'bon' : 'rate');
    $('ap-verdict').innerHTML = data.juste
        ? `✓ C'est ça — <b>${esc(NIV[data.niveau])}</b>`
        : `✗ C'était <b>${esc(data.fiche.nom)}</b>`;
    $('ap-fiche').innerHTML = Geo.fiche(data.fiche);
    $('ap-correction').hidden = false;
    $('ap-suivant').textContent = data.fini ? 'Voir le bilan' : 'Continuer';
    $('ap-suivant').onclick = () => {
        if (data.fini) montrerFin(data.bilan);
        else montrerQuestion(data.question);
    };
    $('ap-correction').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function montrerFin(b) {
    BILAN = b;
    const part = Math.round(b.justes / b.total * 100);
    $('ap-fin-emoji').textContent = part === 100 ? '🏆' : part >= 70 ? '🎓' : '📚';
    $('ap-fin-titre').textContent = part === 100 ? 'Sans faute !' : part >= 70 ? 'Belle séance' : 'C’est en se trompant qu’on apprend';
    $('ap-fin-score').innerHTML = `<b>${b.justes}</b> / ${b.total}`;
    $('ap-fin-rang').innerHTML = `
        <p class="ap-fin-maitrise"><b>${b.maitrises}</b> pays maîtrisés sur ${b.total}</p>
        <div class="ap-jauge grande"><i style="width:${b.rang.part}%"></i></div>
        <p class="ap-fin-suite">${b.rang.emoji} ${esc(b.rang.nom)}${b.rang.suivant
            ? ` · encore ${b.rang.suivant.manque} pour ${esc(b.rang.suivant.nom)}` : ''}</p>`;
    $('ap-fin').hidden = false;
}

function revenir() {
    $('ap-fin').hidden = true;
    $('ap-seance').hidden = true;
    $('ap-accueil').hidden = false;
    CARTE_Q = null;
    chargerAccueil();
}
$('ap-quitter').addEventListener('click', revenir);
$('ap-retour').addEventListener('click', revenir);
$('ap-fin-close').addEventListener('click', revenir);
$('ap-encore').addEventListener('click', () => { $('ap-fin').hidden = true; lancerSeance(derniereSource); });

chargerAccueil();
