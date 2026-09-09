// =====================================================================
//  LES DÉFIS — côté joueur
//
//  Un défi, c'est la mécanique des jeux du jour (une manche identique
//  pour tous, un classement, un temps qui départage) appliquée aux jeux
//  qu'on voulait faire ensemble. On ne joue pas en même temps, on joue la
//  même chose — et c'est suffisant pour que ça compte.
//
//  Deux jeux dans une seule page, parce qu'ils partagent tout ce qui
//  entoure la manche : la liste, le chronomètre, la fin, le classement.
//  Seul le milieu change.
// =====================================================================
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(chemin, corps) {
    try {
        const res = await fetch(chemin, corps ? {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
        } : undefined);
        return { ok: res.ok, data: await res.json().catch(() => null) };
    } catch (e) { return { ok: false, data: null }; }
}

function vue(id) {
    ['v-liste', 'v-motus', 'v-quiz', 'v-fin'].forEach(v => { $(v).hidden = v !== id; });
    window.scrollTo(0, 0);
}
function duree(ms) {
    const s = Math.round((ms || 0) / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function ilYA(ts) {
    const min = Math.floor((Date.now() - ts) / 60000);
    if (min < 1) return 'à l’instant';
    if (min < 60) return `il y a ${min} min`;
    const h = Math.floor(min / 60);
    return h < 24 ? `il y a ${h} h` : 'hier';
}
function reste(finA) {
    const h = Math.floor((finA - Date.now()) / 3600e3);
    if (h <= 0) return 'dernière heure';
    return h === 1 ? 'encore 1 h' : `encore ${h} h`;
}

// =====================================================================
//  LA LISTE
// =====================================================================
let types = [];

async function chargerListe() {
    const { data } = await api('/api/defis');
    if (!data) return;
    types = data.types || [];

    $('df-lancer').innerHTML = types.map(t =>
        `<button type="button" class="df-lancer-btn" data-lancer="${t.id}" style="--acc:${t.accent}">
            <span class="df-lancer-emoji">${t.emoji}</span>
            <span class="df-lancer-corps"><b>Lancer un défi ${esc(t.nom)}</b><em>${esc(t.quoi)}</em></span>
            <span class="df-lancer-go">›</span>
        </button>`).join('');

    const defis = data.defis || [];
    $('df-liste').innerHTML = defis.length ? defis.map(ligneDefi).join('')
        : `<p class="df-vide">Aucun défi en cours. Lance le premier : les autres le trouveront
             en venant faire leur jeu du jour.</p>`;
    const aFaire = defis.filter(d => d.moi.etat !== 'fini').length;
    $('df-sub').textContent = aFaire
        ? `${aFaire} défi${aFaire > 1 ? 's' : ''} t’attend${aFaire > 1 ? 'ent' : ''}`
        : 'Même manche pour tout le monde';
    vue('v-liste');
}

function ligneDefi(d) {
    // Ce que dit la ligne dépend d'où on en est : tant qu'on n'a pas joué, on
    // ne montre ni le score des autres ni le meneur — ça donnerait le niveau à
    // battre, et surtout ça gâcherait l'égalité de la manche.
    const fait = d.moi.etat === 'fini';
    const etat = fait
        ? `<b>${d.moi.score} pt${d.moi.score > 1 ? 's' : ''}</b> · ${d.place}<sup>${d.place === 1 ? 'er' : 'e'}</sup> sur ${d.joueurs}`
        : (d.moi.etat === 'encours' ? 'commencé' : `${d.joueurs} ${d.joueurs > 1 ? 'ont' : 'a'} joué`);
    return `<button type="button" class="df-l${fait ? ' fait' : ''}" data-defi="${esc(d.id)}" style="--acc:${d.accent}">
        <span class="df-l-emoji">${d.emoji}</span>
        <span class="df-l-corps">
            <b>${esc(d.nom)} · de ${esc(d.auteur)}</b>
            <em>${esc(ilYA(d.creeA))} · ${esc(reste(d.finA))} · ${etat}</em>
        </span>
        <span class="df-l-go">${fait ? 'Voir ›' : 'Jouer ›'}</span>
    </button>`;
}

document.addEventListener('click', async (e) => {
    const lancer = e.target.closest('[data-lancer]');
    if (lancer) {
        const { data } = await api('/api/defis', { type: lancer.dataset.lancer });
        if (data && data.error) return DS.toast(data.error);
        DS.toast('Défi lancé ✓');
        if (data && data.id) ouvrir(data.id);
        return;
    }
    const l = e.target.closest('[data-defi]');
    if (l) ouvrir(l.dataset.defi);
});
$('fin-retour').addEventListener('click', chargerListe);

// =====================================================================
//  OUVRIR UN DÉFI
// =====================================================================
let courant = null;          // le défi en cours de jeu

async function ouvrir(id) {
    const { data } = await api('/api/defis/' + encodeURIComponent(id));
    if (!data || data.error) return DS.toast((data && data.error) || 'Défi introuvable.');
    courant = data;
    $('df-retour').onclick = (e) => { e.preventDefault(); chargerListe(); };

    if (data.moi.etat === 'fini') return montrerFin(data, null);
    // Le chronomètre part au premier affichage de la manche, pas au chargement
    // de la page : ouvrir la liste ne doit rien déclencher.
    await api('/api/defis/' + encodeURIComponent(id) + '/commencer', {});
    debutMs = Date.now();
    if (data.type === 'motus') demarrerMotus(data);
    else demarrerQuiz(data);
}

let debutMs = 0, minuteur = null;
function lancerChrono(cible) {
    clearInterval(minuteur);
    minuteur = setInterval(() => { if (cible) cible.textContent = duree(Date.now() - debutMs); }, 1000);
}

// =====================================================================
//  MOTUS — le même mot pour tout le monde
// =====================================================================
let moMot = [], moLigne = 0, moLongueur = 0, moPremiere = '';

function demarrerMotus(d) {
    moLongueur = d.longueur;
    moPremiere = d.premiere;
    moLigne = (d.essais || []).length;
    moMot = [moPremiere];
    $('mo-consigne').textContent = `${moLongueur} lettres, ${6 - moLigne} essai${6 - moLigne > 1 ? 's' : ''} — la première lettre est offerte.`;
    $('mo-erreur').textContent = '';
    dessinerMotus(d.essais || []);
    vue('v-motus');
    setTimeout(() => $('mo-ombre').focus(), 120);
}

function dessinerMotus(essais) {
    const lignes = [];
    for (let r = 0; r < 6; r++) {
        const cases = [];
        for (let c = 0; c < moLongueur; c++) {
            if (r < essais.length) {
                const e = essais[r];
                const m = e.marks[c];
                cases.push(`<span class="df-case ${m}">${esc(e.mot[c])}</span>`);
            } else if (r === essais.length) {
                const lettre = moMot[c] || (c === 0 ? moPremiere : '');
                const active = c === moMot.length ? ' active' : '';
                cases.push(`<span class="df-case saisie${active}">${esc(lettre)}</span>`);
            } else {
                cases.push('<span class="df-case vide"></span>');
            }
        }
        lignes.push(`<div class="df-rang">${cases.join('')}</div>`);
    }
    $('mo-grille').innerHTML = lignes.join('');
    $('mo-grille').style.setProperty('--cols', moLongueur);
}

// Saisie au clavier natif : l'input invisible reçoit les frappes, on ne se sert
// jamais de sa valeur telle quelle — on la relit à chaque événement et on la
// remet à zéro, ce qui évite les surprises de l'autocorrection.
$('mo-ombre').addEventListener('input', (e) => {
    const brut = (e.target.value || '').toUpperCase().replace(/[^A-ZÀ-Ÿ]/g, '');
    e.target.value = '';
    for (const lettre of brut) {
        if (moMot.length >= moLongueur) break;
        moMot.push(lettre);
    }
    rafraichirSaisie();
});
$('mo-ombre').addEventListener('keydown', (e) => {
    if (e.key === 'Backspace') {
        e.preventDefault();
        if (moMot.length > 1) moMot.pop();     // jamais la première lettre, elle est offerte
        rafraichirSaisie();
    } else if (e.key === 'Enter') {
        e.preventDefault();
        envoyerMotus();
    }
});
$('mo-grille').addEventListener('click', () => $('mo-ombre').focus());

function rafraichirSaisie() {
    const rang = $('mo-grille').children[moLigne];
    if (!rang) return;
    for (let c = 0; c < moLongueur; c++) {
        const cell = rang.children[c];
        if (!cell || !cell.classList.contains('saisie')) continue;
        cell.textContent = moMot[c] || '';
        cell.classList.toggle('active', c === moMot.length);
    }
}

async function envoyerMotus() {
    const err = $('mo-erreur');
    if (moMot.length < moLongueur) { err.textContent = `Il faut ${moLongueur} lettres.`; return; }
    err.textContent = '';
    const { data } = await api(`/api/defis/${encodeURIComponent(courant.id)}/repondre`, { mot: moMot.join('') });
    if (!data || data.error) { err.textContent = (data && data.error) || 'Erreur.'; return; }

    courant.essais = [...(courant.essais || []), { mot: moMot.join(''), marks: data.marks }];
    moLigne = courant.essais.length;
    moMot = [moPremiere];
    dessinerMotus(courant.essais);
    if (data.fini) {
        const { data: complet } = await api('/api/defis/' + encodeURIComponent(courant.id));
        montrerFin(complet || courant, data.trouve
            ? `Trouvé en ${moLigne} essai${moLigne > 1 ? 's' : ''} — ${duree(data.ms)}`
            : `Le mot était ${data.mot}`);
        return;
    }
    $('mo-consigne').textContent = `${moLongueur} lettres, ${data.restant} essai${data.restant > 1 ? 's' : ''} restant${data.restant > 1 ? 's' : ''}.`;
    $('mo-ombre').focus();
}

// =====================================================================
//  QUIZ DES DRAPEAUX — la même série, dans le même ordre
// =====================================================================
let qzIndex = 0, qzVerrou = false;

function demarrerQuiz(d) {
    qzIndex = d.index || 0;
    lancerChrono($('qz-chrono'));
    poserQuestion(d.question);
    vue('v-quiz');
}

function poserQuestion(q) {
    if (!q) return;
    qzVerrou = false;
    $('qz-num').textContent = `${qzIndex + 1} / ${courant.longueur}`;
    $('qz-enonce').textContent = q.enonce;
    $('qz-repondu').textContent = '';
    $('qz-repondu').className = 'df-repondu';
    const media = $('qz-media');
    if (q.media && q.media.drapeau) {
        media.innerHTML = `<span class="df-drapeau">${q.media.drapeau}</span>`;
        media.hidden = false;
    } else { media.innerHTML = ''; media.hidden = true; }

    // Une question dont les choix sont des drapeaux seuls mérite des cibles
    // plus hautes : il n'y a rien à lire, tout à regarder.
    const drapeauSeul = q.choix.every(c => c.drapeau && !c.texte);
    $('qz-choix').innerHTML = q.choix.map((c, i) =>
        `<button type="button" class="df-choix-btn${drapeauSeul ? ' drapeau-seul' : ''}" data-choix="${i}">
            ${c.drapeau ? `<span class="df-choix-drapeau">${c.drapeau}</span>` : ''}
            ${c.texte ? `<span class="df-choix-texte">${esc(c.texte)}</span>` : ''}
        </button>`).join('');
}

$('qz-choix').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-choix]');
    if (!b || qzVerrou) return;
    qzVerrou = true;
    const choix = Number(b.dataset.choix);
    const { data } = await api(`/api/defis/${encodeURIComponent(courant.id)}/repondre`, { choix });
    if (!data || data.error) { qzVerrou = false; return DS.toast((data && data.error) || 'Erreur.'); }

    const boutons = [...$('qz-choix').querySelectorAll('.df-choix-btn')];
    boutons.forEach((x, i) => {
        x.disabled = true;
        if (i === data.bonne) x.classList.add('juste');
        else if (i === choix) x.classList.add('faux');
        else x.classList.add('eteint');
    });
    const r = $('qz-repondu');
    r.className = 'df-repondu ' + (data.juste ? 'juste' : 'faux');
    r.textContent = data.juste ? '✓ ' + data.reponse : '✕ ' + data.reponse;

    // Une pause courte pour lire la correction, sans casser le rythme.
    setTimeout(async () => {
        if (data.fini) {
            clearInterval(minuteur);
            const { data: complet } = await api('/api/defis/' + encodeURIComponent(courant.id));
            montrerFin(complet || courant, `${data.score} bonne${data.score > 1 ? 's' : ''} réponse${data.score > 1 ? 's' : ''} sur ${courant.longueur} — ${duree(data.ms)}`);
            return;
        }
        qzIndex++;
        poserQuestion(data.suivante);
    }, 1400);
});

// =====================================================================
//  LA FIN
// =====================================================================
function montrerFin(d, detail) {
    clearInterval(minuteur);
    courant = d;
    const cl = d.classement || [];

    // Être « 1ᵉʳ sur 1 » ne veut rien dire : quand on est le premier à s'y
    // coller, on ouvre le bal, on ne gagne rien. Et tant que le défi court,
    // une tête de classement reste provisoire — le dire évite de croire à
    // une victoire que la soirée peut encore reprendre.
    const seul = cl.length <= 1;
    $('fin-emoji').textContent = (d.place === 1 && !seul) ? '🏆' : '🏁';
    $('fin-titre').textContent = seul ? 'Tu ouvres le bal'
        : (d.place === 1 ? 'En tête pour l’instant'
           : (d.place ? `${d.place}ᵉ sur ${cl.length}` : 'Manche terminée'));
    $('fin-detail').textContent = detail || (d.moi && d.moi.score != null
        ? `${d.moi.score} point${d.moi.score > 1 ? 's' : ''} en ${duree(d.moi.ms)}` : '');

    $('fin-classement').innerHTML = cl.length ? cl.map((l, i) => `
        <div class="df-cl${l.pseudo === (d.moiPseudo || '') ? ' moi' : ''}">
            <span class="df-cl-place">${i + 1}</span>
            <span class="df-cl-nom">${esc(l.pseudo)}</span>
            <span class="df-cl-score">${l.score} · ${duree(l.ms)}</span>
        </div>`).join('') : '<p class="df-vide">Tu es le premier à l’avoir fait.</p>';

    // Le classement d'un défi n'est pas définitif tant qu'il reste des heures :
    // le dire évite de croire qu'on a gagné alors que personne n'a encore joué.
    $('fin-attente').textContent = d.finA && d.finA > Date.now()
        ? `Le défi reste ouvert ${reste(d.finA)} — le classement peut encore changer.`
        : '';
    vue('v-fin');
}

// ---------- Démarrage ----------
// Un lien direct vers un défi (?d=<id>) permet de le partager tel quel.
const parId = new URLSearchParams(location.search).get('d');
if (parId) ouvrir(parId); else chargerListe();
