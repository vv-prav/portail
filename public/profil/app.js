// =====================================================================
//  MON PROFIL
//
//  La page tenait en une seule colonne de sept sections empilées :
//  identité, titres, résumé, compte, réglages, classement, statistiques.
//  Sur un téléphone, ça fait un défilement interminable où l'on ne sait
//  jamais ce qui reste en dessous, et où changer son mot de passe demande
//  de traverser toutes ses statistiques.
//
//  Trois onglets désormais, et un seul principe pour les avoir choisis :
//    · « Mon salon »  — ma place, mon assiduité, ma semaine (où j'en suis) ;
//    · « Mes jeux »   — le détail jeu par jeu (ce que j'ai fait) ;
//    · « Réglages »   — compte et personnalisation (ce que je change).
//
//  L'identité (avatar, nom, badges) reste AU-DESSUS des onglets : c'est la
//  seule chose qui répond à « qui suis-je ici », elle n'appartient à aucune
//  section. La barre d'onglets, elle, colle en haut — après trois écrans de
//  défilement, on doit pouvoir changer de section sans remonter.
// =====================================================================
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(path, body) {
    try {
        const res = await fetch(path, body ? {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        } : {});
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok, data };
    } catch (e) { return { ok: false, data: { error: 'Connexion impossible.' } }; }
}
// Délègue au design system plutôt que d'entretenir un second toast.
function toast(msg) { DS.toast(msg); }

let profile = null;

// ---------- Bulle d'avatar (photo ou emoji) ----------
function setAvatarBubble(el, photo, emoji) {
    el.innerHTML = photo ? `<img src="${photo}" alt="">` : esc(emoji || '✦');
}

// =====================================================================
//  LES ONGLETS
// =====================================================================
const ONGLETS = ['salon', 'jeux', 'reglages'];
let ongletCourant = 'salon';

function montrerOnglet(id, memoriser) {
    if (!ONGLETS.includes(id)) id = 'salon';
    ongletCourant = id;
    ONGLETS.forEach(o => { $('pane-' + o).hidden = o !== id; });
    document.querySelectorAll('#pr-nav button').forEach(b =>
        b.classList.toggle('on', b.dataset.onglet === id));
    // On revient en haut du contenu, pas de la page : l'identité reste
    // visible, et la barre d'onglets ne saute pas sous le doigt.
    const nav = $('pr-nav');
    if (memoriser && nav.getBoundingClientRect().top < 0) {
        nav.scrollIntoView({ block: 'start', behavior: 'instant' in window ? 'instant' : 'auto' });
    }
    if (memoriser) {
        try { localStorage.setItem('erquy_profil_onglet', id); } catch (e) {}
        // L'ancre permet de revenir directement sur une section depuis
        // ailleurs (/profil#reglages), et le geste retour la suit.
        try { history.replaceState(null, '', '#' + id); } catch (e) {}
    }
}
document.querySelectorAll('#pr-nav button').forEach(b =>
    b.addEventListener('click', () => montrerOnglet(b.dataset.onglet, true)));

// Au chargement : l'ancre d'abord (un lien précis l'emporte), sinon le
// dernier onglet consulté.
(function ongletInitial() {
    const ancre = (location.hash || '').replace('#', '');
    let voulu = ONGLETS.includes(ancre) ? ancre : null;
    if (!voulu) { try { voulu = localStorage.getItem('erquy_profil_onglet'); } catch (e) {} }
    montrerOnglet(voulu || 'salon', false);
})();

// Le pseudo n'apparaît dans la barre du haut qu'une fois le grand titre sorti
// de l'écran : au repos, il ferait doublon avec celui de l'en-tête.
function suivreLeTitre() {
    const nom = $('pr-name'), barre = $('pr-topbar-nom');
    // Un écouteur de défilement plutôt qu'un IntersectionObserver : ce dernier
    // ne se déclenche pas tant que la page n'est pas peinte (onglet en
    // arrière-plan), et le pseudo n'apparaissait alors jamais. Ici, une simple
    // comparaison de positions, recalculée au défilement.
    const maj = () => barre.classList.toggle('on', nom.getBoundingClientRect().bottom < 54);
    window.addEventListener('scroll', maj, { passive: true });
    window.addEventListener('resize', maj);
    maj();
}
suivreLeTitre();

// ---------- Ce que veut dire un badge ----------
// Un titre sans explication n'est qu'un émoji : on ne sait ni ce qu'il
// récompense, ni comment l'obtenir. La popup le dit, et précise ce que « unique »
// implique — un seul porteur à la fois, et il change de mains.
const SENS_RARETE = {
    unique: 'Titre unique : une seule personne le porte à la fois dans tout le salon. Il change de mains dès que quelqu’un fait mieux.',
    rare: 'Titre rare : il faut vraiment aller le chercher.',
    commun: 'Titre commun : une étape que tout le monde peut franchir.',
};
function expliquerTitre(t) {
    if (!window.DS) return;
    DS.confirm({
        emoji: t.emoji,
        title: t.nom,
        text: t.desc + '\n\n' + (SENS_RARETE[t.rarete] || ''),
        actions: [],
        cancelLabel: 'Fermer', closeIcon: false,
    });
}

// =====================================================================
//  LES BADGES — ce qu'on gagne, et ce qu'on montre
//
//  Les titres se gagnent en jouant ; l'affichage, lui, est un choix. À
//  douze badges, la bulle de profil devient un mur où plus rien ne
//  ressort — celui qu'on est fier d'avoir se noie dans les étapes
//  obligatoires.
//
//  Trois décisions :
//   · `null` veut dire « tout montrer », et c'est l'état par défaut. Un
//     badge gagné demain apparaît donc tout seul, sans qu'il faille
//     revenir cocher quoi que ce soit ;
//   · l'ordre de la sélection est celui du joueur, d'où la flèche « ↑ » :
//     on met devant celui qu'on veut voir en premier, sans glisser-déposer
//     (impraticable au pouce sur une liste qui défile) ;
//   · chaque geste enregistre. Pas de bouton « Valider » à oublier.
// =====================================================================
const ORDRE_RARETE = { unique: 0, rare: 1, commun: 2 };
let mesTitres = [];          // tout ce que je détiens
let monChoix = null;         // tableau d'identifiants, ou null = tout montrer

const parRarete = (a, b) => (ORDRE_RARETE[a.rarete] ?? 9) - (ORDRE_RARETE[b.rarete] ?? 9);
const titreParId = (id) => mesTitres.find(t => t.id === id);

// La liste effectivement affichée, dans l'ordre voulu.
function titresAffiches() {
    if (!Array.isArray(monChoix)) return mesTitres.slice().sort(parRarete);
    return monChoix.map(titreParId).filter(Boolean);
}
function titresMasques() {
    const on = new Set(titresAffiches().map(t => t.id));
    return mesTitres.filter(t => !on.has(t.id)).sort(parRarete);
}

// ---------- L'affichage dans l'en-tête ----------
function rendreTitres() {
    const liste = titresAffiches();
    $('pr-titres').innerHTML = liste.map((t, i) =>
        `<button type="button" class="pr-titre ${esc(t.rarete)}" data-i="${i}">${esc(t.emoji)} ${esc(t.nom)}</button>`).join('');
    $('pr-titres').querySelectorAll('.pr-titre').forEach(b =>
        b.addEventListener('click', () => expliquerTitre(liste[Number(b.dataset.i)])));
    // Le bouton dit ce qu'il y a derrière : sans badge, il invite ; avec,
    // il annonce combien sont montrés sur combien.
    $('pr-badges-btn').textContent = mesTitres.length
        ? `🎖️ Mes badges · ${liste.length}/${mesTitres.length}`
        : '🎖️ Mes badges';
}

// ---------- L'atelier ----------
let sauveT = null;
function enregistrerChoix() {
    clearTimeout(sauveT);
    // Un tampon court : on enchaîne souvent plusieurs touches d'affilée, et
    // chacune n'a pas besoin de son aller-retour réseau.
    sauveT = setTimeout(async () => {
        const { ok, data } = await api('/api/salon/profile', { titresAffiches: monChoix });
        if (!ok) { toast((data && data.error) || 'Impossible d’enregistrer.'); return; }
    }, 500);
}

function ligneBadge(t, affiche, position) {
    // La flèche garde sa place même quand elle ne sert pas (premier de la
    // liste, ou badge masqué) : sans ça les lignes n'ont pas toutes la même
    // largeur et la colonne part en accordéon.
    const monter = affiche
        ? `<button type="button" class="pb-monter" data-monter="${esc(t.id)}"
             aria-label="Mettre ${esc(t.nom)} plus en avant"${position > 0 ? '' : ' disabled'}>↑</button>`
        : '<span class="pb-monter fantome" aria-hidden="true"></span>';
    return `<div class="pb-ligne">
        <button type="button" class="pb ${esc(t.rarete)}" data-bascule="${esc(t.id)}" aria-pressed="${affiche}">
            <span class="pb-emoji">${esc(t.emoji)}</span>
            <span class="pb-corps">
                <b>${esc(t.nom)}</b>
                <span class="pb-desc"><em class="pb-rarete ${esc(t.rarete)}">${esc(t.rarete)}</em>${esc(t.desc)}</span>
            </span>
            <span class="pb-etat" aria-hidden="true">${affiche ? '✓' : '+'}</span>
        </button>
        ${monter}
    </div>`;
}

function rendreAtelier() {
    const on = titresAffiches(), off = titresMasques();
    $('badges-aucun').hidden = mesTitres.length > 0;
    $('badges-on').innerHTML = on.map((t, i) => ligneBadge(t, true, i)).join('');
    $('badges-off').innerHTML = off.map(t => ligneBadge(t, false, 0)).join('');
    $('badges-n').textContent = mesTitres.length ? `${on.length}/${mesTitres.length}` : '';
    $('badges-on-vide').hidden = on.length > 0 || !mesTitres.length;
    $('badges-off-vide').hidden = off.length > 0 || !mesTitres.length;
}

// Un seul écouteur pour toute la feuille : son contenu est refait à chaque
// changement, donc rattacher les écouteurs à chaque rendu ne servirait qu'à
// en oublier un quelque part.
$('ov-badges').addEventListener('click', (e) => {
    const bascule = e.target.closest('[data-bascule]');
    if (bascule) {
        const id = bascule.dataset.bascule;
        const actuels = titresAffiches().map(t => t.id);
        monChoix = actuels.includes(id) ? actuels.filter(x => x !== id) : [...actuels, id];
        rendreAtelier(); rendreTitres(); enregistrerChoix();
        return;
    }
    const monter = e.target.closest('[data-monter]');
    if (monter) {
        const id = monter.dataset.monter;
        const l = titresAffiches().map(t => t.id);
        const i = l.indexOf(id);
        if (i > 0) { [l[i - 1], l[i]] = [l[i], l[i - 1]]; monChoix = l; }
        rendreAtelier(); rendreTitres(); enregistrerChoix();
    }
});
$('badges-tout').addEventListener('click', () => {
    // `null` plutôt que la liste complète : un badge gagné demain sera montré
    // sans qu'il faille repasser par ici.
    monChoix = null;
    rendreAtelier(); rendreTitres(); enregistrerChoix();
});
$('badges-rien').addEventListener('click', () => {
    monChoix = [];
    rendreAtelier(); rendreTitres(); enregistrerChoix();
});

function ouvrirAtelier() {
    rendreAtelier();
    $('ov-badges').hidden = false;
    if (window.Vues) Vues.suivre('badges');
}
function fermerAtelier() {
    $('ov-badges').hidden = true;
    if (window.Vues) Vues.suivre('page');
}
$('pr-badges-btn').addEventListener('click', ouvrirAtelier);
$('act-badges').addEventListener('click', ouvrirAtelier);
$('badges-close').addEventListener('click', fermerAtelier);
$('ov-badges').addEventListener('click', (e) => { if (e.target === $('ov-badges')) fermerAtelier(); });

// Le geste retour du téléphone ferme la feuille au lieu de quitter la page.
if (window.Vues) {
    Vues.suivre('page');
    Vues.surRetour(() => { $('ov-badges').hidden = true; });
}

// =====================================================================
//  LES STATISTIQUES
// =====================================================================
// Une seule source : le serveur envoie déjà `jeux`, la liste que la bulle de
// profil utilise. L'ancienne version recalculait les mêmes chiffres depuis des
// champs plats (p.motus, p.mf…), et les deux avaient fini par diverger — Petit
// Bac annonçait « suivi à venir » alors que ses statistiques existaient.
// ⚠️ Liste à tenir à jour à chaque nouveau jeu : c'est elle qui produit la
// ligne « Pas encore joué à… ». Six jeux y manquaient.
const TOUS_LES_JEUX = [
    { id: 'motus', nom: 'Motus' }, { id: 'mf', nom: 'Mots Fléchés' },
    { id: 'chiffres', nom: 'Le compte est bon' }, { id: 'geo', nom: 'Géographie' },
    { id: 'motlong', nom: 'Le mot le plus long' }, { id: 'sudoku', nom: 'Sudoku' },
    { id: 'pbac', nom: 'Petit Bac' }, { id: 'undercover', nom: 'Infiltré' },
    { id: 'yams', nom: 'Yams' }, { id: 'motusparty', nom: 'Motus Party' },
    { id: 'drapeaux', nom: 'Quiz des drapeaux' }, { id: 'perudo', nom: 'Perudo' },
];

// Trois chiffres en tête, ceux qu'on regarde en premier.
function renderChiffres(p) {
    const meilleureSerie = Math.max(
        (p.motus && p.motus.bestStreak) || 0,
        (p.motus && p.motus.streak) || 0,
        (p.mf && p.mf.streak) || 0,
    );
    const cases = [
        p.rang ? [p.rang.place + '<sup>e</sup>', 'au classement'] : null,
        [p.totalParties || 0, 'parties jouées'],
        meilleureSerie ? ['🔥 ' + meilleureSerie, 'jours d\'affilée'] : null,
    ].filter(Boolean);
    $('pr-chiffres').innerHTML = cases.map(([v, l]) =>
        `<div class="pr-chiffre"><b>${v}</b><span>${esc(l)}</span></div>`).join('');
}

// Une carte par jeu réellement pratiqué, la plus jouée en premier, dépliable.
// Même motif que la bulle de profil : on ne réapprend pas une interface en
// passant de l'une à l'autre.
function renderJeux(p) {
    const jeux = (p.jeux || []).slice().sort((a, b) => b.parties - a.parties);
    $('pr-games').innerHTML = jeux.map((j, i) => {
        const lignes = j.lignes.map(([l, v]) =>
            `<div class="pj-ligne"><span>${esc(l)}</span><b>${esc(String(v))}</b></div>`).join('');
        const note = j.note ? `<p class="pj-note">${esc(j.note)}</p>` : '';
        return `<div class="pj">
            <button type="button" class="pj-tete" aria-expanded="${i === 0}">
                <span class="pj-emoji">${j.emoji}</span>
                <span class="pj-nom">${esc(j.nom)}</span>
                <span class="pj-resume">${esc(j.resume)}</span>
                <span class="pj-chev" aria-hidden="true">›</span>
            </button>
            <div class="pj-corps"${i === 0 ? '' : ' hidden'}>${lignes}${note}</div>
        </div>`;
    }).join('') || `<p class="pr-vide">Aucune partie pour l'instant. Le premier mot du jour t'attend.</p>`;

    $('pr-games').querySelectorAll('.pj-tete').forEach(b => b.addEventListener('click', () => {
        const corps = b.nextElementSibling;
        const ouvert = !corps.hidden;
        corps.hidden = ouvert;
        b.setAttribute('aria-expanded', String(!ouvert));
    }));

    // Les jeux jamais touchés tiennent en une ligne discrète, au lieu d'occuper
    // chacun un onglet vide.
    const joues = new Set(jeux.map(j => j.id));
    const restants = TOUS_LES_JEUX.filter(j => !joues.has(j.id)).map(j => j.nom);
    $('pr-jamais').textContent = restants.length ? 'Pas encore joué à : ' + restants.join(', ') + '.' : '';
    $('pr-jamais').hidden = !restants.length;
}

// ---------- Ma place au Salon, et mon assiduité ----------
// Le classement transversal et le calendrier ne demandent aucune donnée
// nouvelle : les jours joués sont déjà stockés par jeu, on les rapproche.
function renderRang(p) {
    if (!p.rang) return false;
    const { place, points, total } = p.rang;
    const medaille = place === 1 ? '🥇' : place === 2 ? '🥈' : place === 3 ? '🥉' : '🏅';
    $('pr-rank').innerHTML = `
        <div class="pr-rank-place"><b>${place}<sup>e</sup></b><span>${medaille} sur ${total} joueurs classés</span></div>
        <div class="pr-rank-pts"><b>${points}</b><span>points au Salon</span></div>
        <div class="pr-rank-pts"><b>${p.totalParties || 0}</b><span>parties tous jeux confondus</span></div>`;
    return true;
}
const NOM_JEU = { motus: 'Motus', mf: 'Mots Fléchés', chiffres: 'Le compte est bon', geo: 'Géographie', motlong: 'Le mot le plus long', sudoku: 'Sudoku' };
function renderCalendrier(jours) {
    if (!Array.isArray(jours) || !jours.length) return false;
    $('pr-cal').innerHTML = jours.map(j => {
        const n = Math.min(j.jeux.length, 3);
        const quoi = j.jeux.length
            ? j.jeux.map(g => NOM_JEU[g] || g).join(', ')
            : 'rien ce jour-là';
        const date = new Date(j.d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
        return `<i class="n${n}" title="${esc(date)} — ${esc(quoi)}"></i>`;
    }).join('');
    return true;
}

// ---------- Résumé transversal ----------
async function loadSummary() {
    const { ok, data } = await api('/api/salon/mystats-summary');
    if (!ok) return;
    $('sum-week').textContent = data.weekCount;
    $('sum-fav').textContent = data.favoriteGame || '—';
    $('pr-summary').hidden = false;
}

// ---------- Chargement du profil ----------
async function loadProfile() {
    const { ok, data } = await api('/api/salon/profile');
    if (!ok) { toast('Impossible de charger le profil.'); return; }
    profile = data;
    setAvatarBubble($('pr-avatar'), profile.avatarPhoto, profile.avatar);
    $('pr-name').textContent = profile.pseudo;
    $('pr-topbar-nom').textContent = profile.pseudo;
    const created = profile.created ? new Date(profile.created).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
    const prev = profile.prevLogin ? new Date(profile.prevLogin).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : null;
    $('pr-meta').textContent = 'Membre depuis le ' + created + (prev ? ' · vu la dernière fois le ' + prev : '');

    mesTitres = profile.titres || [];
    monChoix = Array.isArray(profile.titresAffiches) ? profile.titresAffiches : null;
    rendreTitres();

    // Tant qu'on n'est pas classé, le bloc « Ma place au Salon » n'a rien à
    // dire : il affichait un titre suivi de vide. On ne garde alors que le
    // calendrier, et le titre de section devient le sien.
    const aRang = renderRang(profile);
    const aCal = renderCalendrier(profile.calendrier);
    $('pr-rank').hidden = !aRang;
    $('pr-cal-titre').hidden = !aRang;                 // sinon le titre fait doublon
    $('pr-rank-titre').textContent = aRang ? 'Ma place au Salon' : 'Mon assiduité';
    $('pr-rank-section').hidden = !(aRang || aCal);
    renderChiffres(profile);
    renderJeux(profile);
    loadSummary();
}
loadProfile();

// ---------- Langue ----------
let LANG = localStorage.getItem('erquy_lang') || 'fr';
document.documentElement.lang = LANG;   // suit la langue choisie
document.querySelectorAll('#pr-lang-btns button').forEach(b => {
    b.classList.toggle('on', b.dataset.lang === LANG);
    b.addEventListener('click', () => {
        LANG = b.dataset.lang;
        localStorage.setItem('erquy_lang', LANG);
        document.querySelectorAll('#pr-lang-btns button').forEach(x => x.classList.toggle('on', x === b));
        toast('Langue enregistrée.');
    });
});

// ---------- Changer d'avatar ----------
$('pr-avatar').addEventListener('click', () => {
    $('emoji-grid').innerHTML = (profile.avatars || []).map(a =>
        `<button type="button" class="pr-emoji${a === profile.avatar ? ' on' : ''}" data-av="${a}">${a}</button>`).join('');
    $('emoji-grid').querySelectorAll('.pr-emoji').forEach(b => b.addEventListener('click', async () => {
        const { ok } = await api('/api/salon/profile', { avatar: b.dataset.av });
        if (!ok) return;
        profile.avatar = b.dataset.av;
        setAvatarBubble($('pr-avatar'), profile.avatarPhoto, b.dataset.av);
        $('emoji-grid').querySelectorAll('.pr-emoji').forEach(x => x.classList.toggle('on', x === b));
    }));
    $('photo-remove').hidden = !profile.avatarPhoto;
    $('ov-avatar').hidden = false;
});
$('avatar-close').addEventListener('click', () => { $('ov-avatar').hidden = true; });
function resizePhotoToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('lecture'));
        reader.onload = () => {
            img.onerror = () => reject(new Error('image'));
            img.onload = () => {
                const size = 160;
                const canvas = document.createElement('canvas');
                canvas.width = size; canvas.height = size;
                const ctx = canvas.getContext('2d');
                const side = Math.min(img.width, img.height);
                const sx = (img.width - side) / 2, sy = (img.height - side) / 2;
                ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
                resolve(canvas.toDataURL('image/jpeg', 0.78));
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}
$('photo-btn').addEventListener('click', () => $('photo-input').click());
$('photo-input').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast('Ce fichier n’est pas une image.'); return; }
    let dataUrl;
    try { dataUrl = await resizePhotoToDataUrl(file); } catch (err) { toast('Impossible de lire cette image.'); return; }
    const { ok, data } = await api('/api/salon/avatar-photo', { photo: dataUrl });
    if (!ok) { toast((data && data.error) || 'Erreur.'); return; }
    profile.avatarPhoto = data.photo;
    setAvatarBubble($('pr-avatar'), data.photo, profile.avatar);
    $('photo-remove').hidden = false;
    toast('Photo mise à jour.');
});
$('photo-remove').addEventListener('click', async () => {
    const { ok } = await api('/api/salon/avatar-photo', { photo: '' });
    if (!ok) return;
    profile.avatarPhoto = '';
    setAvatarBubble($('pr-avatar'), '', profile.avatar);
    $('photo-remove').hidden = true;
});

// ---------- Changer de pseudo ----------
$('act-rename').addEventListener('click', () => {
    $('rename-pseudo').value = ''; $('rename-password').value = '';
    $('rename-error').hidden = true;
    $('ov-rename').hidden = false;
});
$('rename-close').addEventListener('click', () => { $('ov-rename').hidden = true; });
$('rename-submit').addEventListener('click', async () => {
    const pseudo = $('rename-pseudo').value.trim();
    const password = $('rename-password').value;
    if (!pseudo || !password) { $('rename-error').textContent = 'Remplissez les deux champs.'; $('rename-error').hidden = false; return; }
    const { ok, data } = await api('/api/account/rename', { pseudo, password });
    if (!ok) { $('rename-error').textContent = (data && data.error) || 'Erreur.'; $('rename-error').hidden = false; return; }
    $('ov-rename').hidden = true;
    toast('Pseudo changé, tu es maintenant ' + data.pseudo + '.');
    loadProfile();
});

// ---------- Changer de mot de passe ----------
$('act-password').addEventListener('click', () => {
    $('pwd-current').value = ''; $('pwd-next').value = '';
    $('pwd-error').hidden = true;
    $('ov-password').hidden = false;
});
$('pwd-close').addEventListener('click', () => { $('ov-password').hidden = true; });
$('pwd-submit').addEventListener('click', async () => {
    const current = $('pwd-current').value, next = $('pwd-next').value;
    if (!current || !next) { $('pwd-error').textContent = 'Remplissez les deux champs.'; $('pwd-error').hidden = false; return; }
    const { ok, data } = await api('/api/account/change-password', { current, next });
    if (!ok) { $('pwd-error').textContent = (data && data.error) || 'Erreur.'; $('pwd-error').hidden = false; return; }
    $('ov-password').hidden = true;
    toast('Mot de passe changé.');
});

// ---------- Nouveau code de récupération ----------
$('act-recovery').addEventListener('click', async () => {
    const { ok, data } = await api('/api/new-code', {});
    if (!ok) { toast((data && data.error) || 'Erreur.'); return; }
    $('recovery-code').textContent = data.recoveryCode;
    $('ov-recovery').hidden = false;
});
$('recovery-close').addEventListener('click', () => { $('ov-recovery').hidden = true; });

// ---------- Déconnexion ----------
$('act-logout').addEventListener('click', async () => {
    await api('/api/logout', {});
    location.href = '/';
});
