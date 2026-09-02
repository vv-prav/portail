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

// ---------- Statistiques par jeu ----------
// Refonte : l'ancienne version alignait neuf onglets qui défilaient
// horizontalement — un par jeu, y compris ceux jamais joués — et n'en montrait
// qu'un à la fois, dans une grille de petites boîtes serrées.
//
// Elle recalculait aussi les chiffres depuis les anciens champs plats
// (p.motus, p.mf…) alors que le serveur envoie déjà `jeux`, la liste que la
// bulle de profil utilise. Deux sources pour la même chose, qui finissaient par
// diverger : Petit Bac annonçait « suivi à venir » alors que ses stats
// existaient. Une seule source désormais, et la même présentation qu'ailleurs.
const TOUS_LES_JEUX = [
    { id: 'motus', nom: 'Motus' }, { id: 'mf', nom: 'Mots Fléchés' },
    { id: 'motjuste', nom: 'Le Mot Juste' }, { id: 'pbac', nom: 'Petit Bac' },
    { id: 'yams', nom: 'Yams' }, { id: 'motusparty', nom: 'Motus Party' },
    { id: 'perudo', nom: 'Perudo' },
];

function mmss(s) { return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

// Trois chiffres en tête, ceux qu'on regarde en premier.
function renderChiffres(p) {
    const meilleureSerie = Math.max(
        (p.motus && p.motus.bestStreak) || 0,
        (p.motus && p.motus.streak) || 0,
        (p.mf && p.mf.streak) || 0,
        (p.motjuste && p.motjuste.streak) || 0,
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
const NOM_JEU = { motus: 'Motus', mf: 'Mots Fléchés', mj: 'Le Mot Juste' };
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
    favoriteGameName = data.favoriteGame;
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
    const created = profile.created ? new Date(profile.created).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
    const prev = profile.prevLogin ? new Date(profile.prevLogin).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : null;
    $('pr-meta').textContent = 'Membre depuis le ' + created + (prev ? ' · vu la dernière fois le ' + prev : '');
    // Les titres, juste sous l'identité : c'est ce qu'on montre.
    const titres = profile.titres || [];
    $('pr-titres').innerHTML = titres.map((t, i) =>
        `<button type="button" class="pr-titre ${esc(t.rarete)}" data-i="${i}">${esc(t.emoji)} ${esc(t.nom)}</button>`).join('');
    $('pr-titres').hidden = !titres.length;
    $('pr-titres').querySelectorAll('.pr-titre').forEach(b =>
        b.addEventListener('click', () => expliquerTitre(titres[Number(b.dataset.i)])));

    const aRang = renderRang(profile);
    const aCal = renderCalendrier(profile.calendrier);
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
    if (!file.type.startsWith('image/')) { toast('Ce fichier n\u2019est pas une image.'); return; }
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