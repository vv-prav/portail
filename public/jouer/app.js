// =====================================================================
//  JOUER ENSEMBLE — l'espace multijoueurs commun
//
//  Avant, chaque jeu avait son propre hall : pour savoir si quelqu'un
//  attendait quelque part, il fallait ouvrir les quatre l'un après
//  l'autre. Personne ne le faisait. Cette page répond d'un coup aux deux
//  seules questions qu'on se pose : est-ce que quelqu'un joue, et sinon,
//  qu'est-ce que je lance ?
//
//  Elle ne réimplémente aucun jeu : le catalogue mène au jeu choisi avec
//  ?creer=1, et le jeu ouvre lui-même son écran de réglages. Les six
//  écrans de création existants sont réutilisés tels quels.
//
//  ⚠️ Le vrai problème de cette page n'est pas son affichage : c'est que
//  la réponse à « est-ce que quelqu'un joue ? » est presque toujours non.
//  Le multijoueur en temps réel exige que deux personnes ouvrent l'appli
//  à la même minute, et ça n'arrive pas tout seul. D'où les trois
//  réponses ajoutées ici, qui ne demandent PAS la simultanéité :
//    • les rendez-vous — on fabrique la coïncidence au lieu de l'espérer ;
//    • les invitations — le hall sait qui est là, il peut le dire ;
//    • la mémoire — un salon vide qui rappelle la dernière partie donne
//      un geste à faire, là où « aucune table ouverte » est une impasse.
// =====================================================================
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Le catalogue est décrit ici et nulle part ailleurs : c'est le seul endroit
// où l'on présente les jeux multijoueurs, donc le seul à tenir à jour.
//
// Deux familles, parce qu'on n'y joue pas dans les mêmes circonstances : en
// réseau quand chacun est chez soi, à un seul téléphone quand on est six autour
// d'une table — et c'est précisément là qu'on sort le salon en cherchant quoi
// faire. Le mode local d'Infiltré était jusqu'ici enterré dans un hall conçu
// pour le distanciel.
//
// ⚠️ `min` et `max` doivent dire la vérité : la fiche du Yams annonçait
// « 2 à 4 joueurs » alors qu'il accepte le solo depuis sa refonte. Le solo est
// justement la seule chose jouable quand le salon est vide, c'est-à-dire
// presque toujours — le cacher était le pire endroit où se tromper.
const CATALOGUE = [
    { id: 'perudo', nom: 'Perudo', emoji: '🎲', accent: '#d9a94e', href: '/perudo',
      min: 1, max: 12, solo: 'contre l’ordinateur', duree: 'environ 20 min', direct: true },   // Perudo a son propre hall et son identité : on l'ouvre tel quel
    { id: 'pbac', nom: 'Petit Bac', emoji: '✏️', accent: '#c2513a', href: '/pbac',
      min: 2, max: 12, duree: 'environ 10 min' },
    { id: 'undercover', nom: 'Infiltré', emoji: '🕵️', accent: '#6f7bb0', href: '/undercover',
      min: 3, max: 12, duree: 'environ 10 min' },
    { id: 'yams', nom: 'Yams', emoji: '🎯', accent: '#ecca82', href: '/yams',
      min: 1, max: 4, solo: 'contre le tableau', duree: 'environ 15 min' },
    { id: 'motusparty', nom: 'Motus Party', emoji: '🏁', accent: '#d9a94e', href: '/motus/party',
      min: 2, max: 8, duree: 'environ 5 min' },
    { id: 'drapeaux', nom: 'Quiz des drapeaux', emoji: '🏳️', accent: '#6f7bb0', href: '/drapeaux',
      min: 1, max: 10, solo: 'contre le chrono', duree: 'environ 5 min' },
];

const CATALOGUE_LOCAL = [
    { id: 'uc-local', nom: 'Infiltré', emoji: '🕵️', accent: '#6f7bb0', href: '/undercover/?local=1',
      min: 3, max: 12, duree: 'environ 10 min', direct: true },
    { id: 'chance', nom: 'Chance', emoji: '🎲', accent: '#c9a24a', href: '/chance',
      min: 1, max: 99, duree: 'quelques secondes', direct: true, libre: 'à volonté' },
];

// Les jeux auxquels on peut convier quelqu'un sur-le-champ : ceux qui se
// jouent chacun chez soi. Proposer un « Infiltré à un seul téléphone » à
// quelqu'un qui n'est pas dans la pièce n'aurait aucun sens.
const INVITABLES = CATALOGUE;

async function api(path, corps) {
    try {
        const res = await fetch(path, corps ? {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
        } : undefined);
        return { ok: res.ok, data: await res.json().catch(() => null) };
    } catch (e) { return { ok: false, data: null }; }
}

// ---------- Le temps, dit comme on le dit ----------
function ilYA(ts) {
    if (!ts) return '';
    const min = Math.floor((Date.now() - ts) / 60000);
    if (min < 1) return 'à l’instant';
    if (min < 60) return `il y a ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `il y a ${h} h`;
    const j = Math.floor(h / 24);
    return j === 1 ? 'hier' : `il y a ${j} jours`;
}
// Un rendez-vous se lit à l'envers : ce n'est pas « dans 4 heures », c'est
// « ce soir à 21 h ». C'est l'heure qu'on retient, pas le délai.
function quandTexte(ts) {
    const d = new Date(ts), maintenant = new Date();
    const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const jour = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const ecart = Math.round((jour(d) - jour(maintenant)) / 864e5);
    if (ecart === 0) return `aujourd’hui à ${heure}`;
    if (ecart === 1) return `demain à ${heure}`;
    if (ecart > 1 && ecart < 7) return `${d.toLocaleDateString('fr-FR', { weekday: 'long' })} à ${heure}`;
    return `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} à ${heure}`;
}

// ---------- Catalogue ----------
// La carte dit le strict nécessaire pour choisir : le nom, le logo, combien on
// est et combien de temps ça prend. La description expliquait la règle, ce qui
// n'est pas ce qu'on cherche au moment de lancer une partie.
function combienDeJoueurs(j) {
    if (j.libre) return j.libre;
    return j.min === j.max ? `${j.min} joueurs` : `${j.min} à ${j.max} joueurs`;
}
function carteJeu(j, dispos) {
    // Combien on serait si tout le monde venait : soi, plus les présents.
    const assez = dispos == null || (dispos + 1) >= j.min;
    const solo = j.solo ? `<span class="jo-cat-solo">solo ${esc(j.solo)}</span>` : '';
    return `
        <a class="jo-cat${assez ? '' : ' pas-assez'}" href="${j.direct ? j.href : j.href + '/?creer=1'}" style="--acc:${j.accent}">
            <span class="jo-cat-emoji">${j.emoji}</span>
            <span class="jo-cat-corps">
                <b>${esc(j.nom)}</b>
                <span class="jo-cat-meta">${esc(combienDeJoueurs(j))} · ${esc(j.duree)}</span>
                ${solo}
            </span>
            <span class="jo-cat-go" aria-hidden="true">›</span>
        </a>`;
}
function ouvrirCatalogue() {
    // Trié par ce qui est jouable maintenant : à deux un mardi soir, la vraie
    // question est « qu'est-ce qui marche à deux ? », pas « quels jeux
    // existent ». Ce qui demande plus de monde qu'il n'y en a passe derrière.
    const dispos = etat.presents.length;
    const reseau = CATALOGUE.slice().sort((a, b) => {
        const ja = (dispos + 1) >= a.min, jb = (dispos + 1) >= b.min;
        if (ja !== jb) return ja ? -1 : 1;
        return 0;
    });
    // Personne en ligne ? Le mode « à un seul téléphone » est alors le seul qui
    // marche à coup sûr : il passe devant.
    const seul = dispos === 0;
    const blocReseau = `<p class="jo-cat-famille">Chacun sur son téléphone</p>`
        + reseau.map(j => carteJeu(j, dispos)).join('');
    const blocLocal = `<p class="jo-cat-famille">À un seul téléphone</p>`
        + CATALOGUE_LOCAL.map(j => carteJeu(j, null)).join('');
    $('jo-cat-intro').textContent = seul
        ? 'Personne d’autre en ligne : les jeux marqués « solo » et ceux à un seul téléphone marchent quand même.'
        : `Vous êtes ${dispos + 1} en ligne. Choisis un jeu, tu régleras la partie juste après.`;
    $('jo-cat-liste').innerHTML = seul ? blocLocal + blocReseau : blocReseau + blocLocal;
    $('jo-catalogue').hidden = false;
}
$('jo-creer').addEventListener('click', ouvrirCatalogue);
$('jo-cat-close').addEventListener('click', () => { $('jo-catalogue').hidden = true; });
$('jo-catalogue').addEventListener('click', (e) => { if (e.target === $('jo-catalogue')) $('jo-catalogue').hidden = true; });

// ---------- Tables ouvertes ----------
// Ce qu'on peut faire d'une partie déjà lancée dépend du jeu, et il ne faut
// rien promettre qui n'existe pas :
//   • Yams, Motus Party, le quiz des drapeaux et Perudo acceptent un
//     spectateur — rejoindre une partie en cours vous y met automatiquement ;
//   • Petit Bac laisse entrer, mais l'hôte doit donner son accord ;
//   • Infiltré refuse : son jeu repose sur des mots secrets, un spectateur y
//     demanderait une vraie réflexion de conception.
const REGARDABLES = new Set(['yams', 'motusparty', 'perudo', 'drapeaux']);
const SUR_DEMANDE = new Set(['pbac']);
// Un bouton gris sans explication ressemble à une panne. Quand une table ne se
// rejoint pas, on dit pourquoi.
const POURQUOI_FERME = { undercover: 'pas de spectateur : les mots sont secrets' };

function actionTable(t) {
    if (t.statut === 'attente') return { texte: 'Rejoindre ›', classe: '' };
    if (REGARDABLES.has(t.jeu)) return { texte: '👁 Regarder', classe: ' regarder' };
    if (SUR_DEMANDE.has(t.jeu)) return { texte: 'Demander à entrer', classe: ' regarder' };
    return { texte: 'en cours', classe: '' };
}

function ligneTable(t, avatars) {
    const action = actionTable(t);
    const presents = t.presents || t.joueurs;
    const noms = presents.length
        ? presents.slice(0, 4).map(p => esc(p)).join(', ') + (presents.length > 4 ? ` +${presents.length - 4}` : '')
        : 'plus personne en ligne';
    const bulles = presents.slice(0, 4).map(p =>
        `<span class="ds-avatar xs">${PortailProfile.bubbleHTML(avatars[p])}</span>`).join('');

    // Deux informations que la table ne donnait pas, et qui décident pourtant
    // d'y aller ou non : combien il manque de monde, et depuis quand elle
    // attend. Un salon ouvert il y a dix secondes et un salon d'hier soir se
    // ressemblaient trait pour trait.
    const bouts = [];
    if (t.limites) bouts.push(`${presents.length}/${t.limites.max}`);
    if (t.creeA) bouts.push(t.statut === 'attente' ? `ouverte ${ilYA(t.creeA)}` : `lancée ${ilYA(t.creeA)}`);
    if (t.statut === 'encours' && POURQUOI_FERME[t.jeu] && !REGARDABLES.has(t.jeu) && !SUR_DEMANDE.has(t.jeu)) {
        bouts.push(POURQUOI_FERME[t.jeu]);
    }

    // Une table d'attente que tout le monde a quittée n'est pas une table :
    // le serveur la referme au bout de quelques minutes, en attendant on ne
    // fait surtout pas croire qu'il y a quelqu'un.
    const deserte = t.statut === 'attente' && !presents.length;
    const attenue = deserte
        || (t.statut === 'encours' && !REGARDABLES.has(t.jeu) && !SUR_DEMANDE.has(t.jeu));

    return `<a class="jo-table${attenue ? ' encours' : ''}" href="${t.href}" style="--acc:${t.accent}">
        <span class="jo-table-emoji">${t.emoji}</span>
        <span class="jo-table-corps">
            <b>${esc(t.nom)} · chez ${esc(t.hote)}</b>
            <em>${noms}${bouts.length ? ' · ' + esc(bouts.join(' · ')) : ''}</em>
        </span>
        <span class="jo-table-bulles">${bulles}</span>
        <span class="jo-table-etat${action.classe}">${deserte ? 'Reprendre' : action.texte}</span>
    </a>`;
}

// Le salon vide n'avait aucune mémoire : on lisait « aucune table ouverte » et
// on repartait. L'historique des parties existait pourtant, enfermé dans
// l'admin. Rappeler la dernière fois, c'est offrir un geste au lieu d'une
// impasse — et le plus souvent, on rejoue à ce à quoi on a joué.
function blocSouvenir(d) {
    if (!d) return '';
    const avec = d.joueurs.filter(p => p !== etat.moi);
    const qui = avec.length ? ` avec ${avec.slice(0, 3).map(esc).join(', ')}${avec.length > 3 ? ` +${avec.length - 3}` : ''}` : '';
    return `<a class="jo-souvenir" href="${d.href}/?creer=1" style="--acc:${d.accent}">
        <span class="jo-souvenir-emoji">${d.emoji}</span>
        <span class="jo-souvenir-corps">
            <em>${d.moi ? 'Ta dernière partie' : 'La dernière du salon'} — ${esc(ilYA(d.quand))}</em>
            <b>${esc(d.nom)}${esc(qui)}</b>
        </span>
        <span class="jo-souvenir-go">Relancer ›</span>
    </a>`;
}

// ---------- Défis ----------
// Le hall n'en montre que trois : c'est un aperçu, la vraie liste est à côté.
function ligneDefi(d) {
    const fait = d.moi.etat === 'fini';
    const etatTexte = fait
        ? `${d.moi.score} pt${d.moi.score > 1 ? 's' : ''} · ${d.place}<sup>${d.place === 1 ? 'er' : 'e'}</sup> sur ${d.joueurs}`
        : `${d.joueurs} ${d.joueurs > 1 ? 'ont' : 'a'} joué`;
    return `<a class="jo-defi${fait ? ' fait' : ''}" href="/defis/?d=${encodeURIComponent(d.id)}" style="--acc:${d.accent}">
        <span class="jo-defi-emoji">${d.emoji}</span>
        <span class="jo-defi-corps">
            <b>${esc(d.nom)} · de ${esc(d.auteur)}</b>
            <em>${etatTexte}</em>
        </span>
        <span class="jo-defi-go">${fait ? 'Voir ›' : 'Jouer ›'}</span>
    </a>`;
}

// ---------- Rendez-vous ----------
function ligneRdv(r) {
    const venants = r.inscrits.length;
    const action = r.cEstMoi
        ? `<span class="jo-rdv-action annuler" data-annuler="${esc(r.id)}">Annuler</span>`
        : `<span class="jo-rdv-action${r.jeViens ? ' dedans' : ''}" data-rdv="${esc(r.id)}">${r.jeViens ? '✓ Je viens' : 'Je viens'}</span>`;
    return `<div class="jo-rdv-l" style="--acc:${r.accent}">
        <span class="jo-rdv-emoji">${r.emoji}</span>
        <span class="jo-rdv-corps">
            <b>${esc(r.nom)} · ${esc(quandTexte(r.quand))}</b>
            <em>${esc(r.hote)}${r.note ? ' — ' + esc(r.note) : ''} · ${venants} inscrit${venants > 1 ? 's' : ''}</em>
        </span>
        ${action}
    </div>`;
}

// ---------- Invitations reçues ----------
function ligneInvit(i) {
    return `<div class="jo-invit" style="--acc:${i.accent}">
        <span class="jo-invit-emoji">${i.emoji}</span>
        <span class="jo-invit-corps">
            <b>${esc(i.de)} te propose ${esc(i.nom)}</b>
            <em>${esc(ilYA(i.quand))}</em>
        </span>
        <a class="jo-invit-oui" href="${i.href}/?creer=1" data-vue="${esc(i.id)}">On y va ›</a>
        <button type="button" class="jo-invit-non" data-refus="${esc(i.id)}" aria-label="Refuser">✕</button>
    </div>`;
}

// ---------- L'état, et son rendu ----------
const etat = { moi: null, tables: [], presents: [], rendezvous: [], derniere: null, invitations: [], defis: [] };

async function charger() {
    const { ok, data } = await api('/api/salon/tables');
    if (!ok || !data) {
        $('jo-tables').innerHTML = '<p class="jo-vide">Impossible de charger les tables.</p>';
        return;
    }
    etat.moi = data.moi;
    etat.tables = data.tables || [];
    etat.presents = data.presents || [];
    etat.rendezvous = data.rendezvous || [];
    etat.derniere = data.derniere || null;
    etat.invitations = data.invitations || [];
    etat.defis = data.defis || [];
    await rendre();
}

async function rendre() {
    const tables = etat.tables;
    const attente = tables.filter(t => t.statut === 'attente' && (t.presents || []).length).length;

    // Trois titres, trois situations distinctes — « parties en cours » sur des
    // salons d'attente désertés serait le même genre de mensonge que celui
    // qu'on vient de corriger.
    const enCours = tables.some(t => t.statut === 'encours');
    $('jo-tables-titre').textContent = attente
        ? `${attente} table${attente > 1 ? 's' : ''} à rejoindre`
        : (enCours ? 'Parties en cours' : 'Tables ouvertes');
    $('jo-sub').textContent = tables.length
        ? `${tables.length} partie${tables.length > 1 ? 's' : ''} en ce moment`
        : (etat.presents.length
            ? `${etat.presents.length} personne${etat.presents.length > 1 ? 's' : ''} en ligne — lance la première partie.`
            : 'Personne ne joue pour l’instant — lance la première.');

    // Les avatars de tout le monde en une fois : joueurs attablés et présents.
    const pseudos = [...new Set([
        ...tables.flatMap(t => t.presents || t.joueurs),
        ...etat.presents,
    ])];
    const avatars = pseudos.length ? await PortailProfile.fetchAvatars(pseudos) : {};

    // Tables
    $('jo-tables').innerHTML = tables.length
        ? tables.map(t => ligneTable(t, avatars)).join('')
        : `<p class="jo-vide">Aucune table ouverte. Crée une partie, propose un rendez-vous, ou partage le
             lien : les autres te rejoindront même s’ils ne sont pas déjà connectés.</p>`
          + blocSouvenir(etat.derniere);

    // Défis — ce qui attend une manche passe devant ce qui est déjà fait.
    $('jo-defis').innerHTML = etat.defis.length
        ? etat.defis.slice(0, 3).map(ligneDefi).join('')
          + `<a class="jo-defis-tout" href="/defis/">Tous les défis ›</a>`
        : `<a class="jo-vide lien" href="/defis/">Aucun défi en cours. Un défi, c’est la même manche
             pour tout le monde, jouée quand chacun peut — la seule formule qui marche vraiment ici.
             <b>En lancer un ›</b></a>`;

    // Rendez-vous
    $('jo-rdv').innerHTML = etat.rendezvous.length
        ? etat.rendezvous.map(ligneRdv).join('')
        : `<p class="jo-vide petit">Aucun rendez-vous. C’est le moyen le plus sûr de jouer à plusieurs :
             on fixe l’heure, chacun vient.</p>`;

    // Invitations
    $('jo-invits').innerHTML = etat.invitations.map(ligneInvit).join('');
    $('jo-invit-section').hidden = !etat.invitations.length;

    // Qui est là
    const box = $('jo-online-section');
    if (!etat.presents.length) { box.hidden = true; }
    else {
        $('jo-online').innerHTML = etat.presents.map(p => `
            <button type="button" class="jo-qui" data-qui="${esc(p)}">
                <span class="ds-avatar xs">${PortailProfile.bubbleHTML(avatars[p])}</span>${esc(p)}
            </button>`).join('');
        box.hidden = false;
    }
}

// ---------- Les gestes ----------
// Un seul écouteur pour toute la page : le contenu est rendu à neuf à chaque
// changement, donc rattacher des écouteurs à chaque fois n'aurait servi qu'à
// les oublier quelque part.
document.addEventListener('click', async (e) => {
    const qui = e.target.closest('[data-qui]');
    if (qui) { menuJoueur(qui.dataset.qui); return; }

    const rdv = e.target.closest('[data-rdv]');
    if (rdv) {
        const { data } = await api('/api/salon/rdv/inscription', { id: rdv.dataset.rdv });
        if (data && data.error) DS.toast(data.error); else charger();
        return;
    }
    const annuler = e.target.closest('[data-annuler]');
    if (annuler) {
        DS.confirm({
            emoji: '📅', title: 'Annuler ce rendez-vous ?',
            text: 'Ceux qui s’étaient inscrits ne le verront plus.',
            actions: [{ label: 'Annuler le rendez-vous', danger: true, run: async () => {
                await api('/api/salon/rdv/annuler', { id: annuler.dataset.annuler });
                charger();
            } }],
        });
        return;
    }
    const refus = e.target.closest('[data-refus]');
    if (refus) { await api('/api/salon/invitation/vue', { id: refus.dataset.refus }); charger(); return; }
    const vue = e.target.closest('[data-vue]');
    if (vue) { api('/api/salon/invitation/vue', { id: vue.dataset.vue }); return; }  // on suit le lien sans attendre
});

// Toucher quelqu'un ouvrait sa fiche de statistiques. Ce n'est pas ce qu'on
// veut faire d'une personne présente : on veut lui proposer de jouer.
function menuJoueur(pseudo) {
    DS.confirm({
        emoji: '🎮', title: pseudo, text: 'En ligne en ce moment.',
        cancelLabel: 'Fermer',
        actions: [
            { label: 'Proposer une partie', run: () => choisirJeuPour(pseudo) },
            { label: 'Voir son profil', run: () => PortailProfile.open(pseudo) },
        ],
    });
}
function choisirJeuPour(pseudo) {
    DS.confirm({
        emoji: '🎲', title: `Proposer à ${pseudo}`,
        text: 'Il ou elle le verra tout de suite dans le salon.',
        cancelLabel: 'Fermer',
        actions: INVITABLES.map(j => ({
            label: `${j.emoji} ${j.nom}`,
            run: async () => {
                const { data } = await api('/api/salon/inviter', { a: pseudo, jeu: j.id });
                if (data && data.error) return DS.toast(data.error);
                DS.toast(data && data.deja ? 'Déjà proposé ✓' : 'Proposition envoyée ✓');
            },
        })),
    });
}

// ---------- Proposer un rendez-vous ----------
let rdvJeu = null;
function ouvrirFormRdv() {
    rdvJeu = null;
    $('jo-rdv-jeux').innerHTML = CATALOGUE.map(j =>
        `<button type="button" class="jo-rdv-jeu" data-jeu="${j.id}">${j.emoji} ${esc(j.nom)}</button>`).join('');
    $('jo-rdv-rapide').innerHTML = raccourcisHoraires().map((r, i) =>
        `<button type="button" class="jo-rdv-quand" data-quand="${r.ts}">${esc(r.label)}</button>`).join('');
    $('jo-rdv-note').value = '';
    $('jo-rdv-erreur').hidden = true;
    $('jo-rdv-quand').value = '';
    $('jo-rdv-form').hidden = false;
}
// Trois propositions qui couvrent presque tous les cas réels — « ce soir »
// veut dire quelque chose de précis quand on se connaît. Le champ complet
// reste là pour le reste.
function raccourcisHoraires() {
    const soir = new Date(); soir.setHours(21, 0, 0, 0);
    const listes = [];
    if (soir.getTime() > Date.now() + 5 * 60000) listes.push({ label: 'Ce soir 21 h', ts: soir.getTime() });
    const demainSoir = new Date(); demainSoir.setDate(demainSoir.getDate() + 1); demainSoir.setHours(21, 0, 0, 0);
    listes.push({ label: 'Demain 21 h', ts: demainSoir.getTime() });
    const dans1h = new Date(Math.ceil((Date.now() + 3600e3) / 900e3) * 900e3);   // arrondi au quart d'heure
    listes.unshift({ label: 'Dans une heure', ts: dans1h.getTime() });
    return listes;
}
$('jo-rdv-creer').addEventListener('click', ouvrirFormRdv);
$('jo-rdv-close').addEventListener('click', () => { $('jo-rdv-form').hidden = true; });
$('jo-rdv-form').addEventListener('click', (e) => { if (e.target === $('jo-rdv-form')) $('jo-rdv-form').hidden = true; });
$('jo-rdv-jeux').addEventListener('click', (e) => {
    const b = e.target.closest('[data-jeu]'); if (!b) return;
    rdvJeu = b.dataset.jeu;
    $('jo-rdv-jeux').querySelectorAll('.jo-rdv-jeu').forEach(x => x.classList.toggle('on', x === b));
});
$('jo-rdv-rapide').addEventListener('click', (e) => {
    const b = e.target.closest('[data-quand]'); if (!b) return;
    // On remplit le champ complet plutôt que de garder la valeur à part : ce
    // qu'on voit est ce qui sera envoyé, et ça reste modifiable.
    const d = new Date(Number(b.dataset.quand));
    const pad = (n) => String(n).padStart(2, '0');
    $('jo-rdv-quand').value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    $('jo-rdv-rapide').querySelectorAll('.jo-rdv-quand').forEach(x => x.classList.toggle('on', x === b));
});
$('jo-rdv-valider').addEventListener('click', async () => {
    const err = $('jo-rdv-erreur');
    const dire = (m) => { err.textContent = m; err.hidden = false; };
    if (!rdvJeu) return dire('Choisis un jeu.');
    const brut = $('jo-rdv-quand').value;
    if (!brut) return dire('Choisis une heure.');
    const quand = new Date(brut).getTime();
    if (!quand) return dire('Cette heure n’est pas valide.');
    const { data } = await api('/api/salon/rdv', { jeu: rdvJeu, quand, note: $('jo-rdv-note').value });
    if (data && data.error) return dire(data.error);
    $('jo-rdv-form').hidden = true;
    DS.toast('Rendez-vous proposé ✓');
    charger();
});

// ---------- Le direct ----------
// La page interrogeait le serveur toutes les dix secondes, alors que les six
// jeux qu'elle annonce parlent déjà socket.io : une table qui s'ouvrait mettait
// jusqu'à dix secondes à apparaître, sur une page dont c'est la seule raison
// d'être. Le serveur signale simplement que quelque chose a bougé, et on
// redemande sa propre version — l'état est personnel, pas diffusable tel quel.
charger();
try {
    const socket = io();
    socket.on('connect', () => socket.emit('hall_join'));
    socket.on('hall_bouge', charger);
} catch (e) { /* pas de socket : le filet ci-dessous suffit */ }

// Filet de sécurité : si le socket tombe, la page ne se fige pas pour autant.
setInterval(charger, 45000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) charger(); });
