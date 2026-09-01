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

// ---------- Cartes de statistiques par jeu, présentées en onglets ----------
function gameCard(emoji, name, accent, streak, stats, note) {
    const streakBadge = streak ? `<span class="pg-streak">🔥 ${streak}</span>` : '';
    const body = stats && stats.length
        ? `<div class="ds-stat-grid${stats.length <= 2 ? ' cols2' : ''}">${stats.map(([v, l]) => `<div class="ds-stat-box"><b>${v}</b><em>${l}</em></div>`).join('')}</div>`
        : `<p class="pg-empty">Rien à afficher pour l'instant</p>`;
    return `<div class="pr-game" style="--acc:${accent}">
        <div class="pg-head"><span class="pg-emoji">${emoji}</span><span class="pg-name">${esc(name)}</span>${streakBadge}</div>
        ${body}${note ? `<p class="pg-soon">${note}</p>` : ''}
    </div>`;
}
function mmss(s) { return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function buildGameCards(p) {
    const games = [];
    games.push({ id: 'Perudo', emoji: '🎲', volume: p.perudo ? p.perudo.played : 0,
        html: gameCard('🎲', 'Perudo', '#d9a94e', p.perudo ? p.perudo.currentStreak : 0, p.perudo ? [
            [p.perudo.wins, 'victoires'], [p.perudo.played, 'parties'], [p.perudo.rankPoints, 'points'],
        ] : null) });
    games.push({ id: 'Mots Fléchés', emoji: '🧩', volume: p.mf.solved || 0,
        html: gameCard('🧩', 'Mots Fléchés', '#5aa87a', p.mf.streak, p.mf.solved ? [
            [p.mf.solved, 'résolues'], [p.mf.best ? mmss(p.mf.best) : '—', 'meilleur temps'], [p.mf.days, 'jours'],
        ] : null) });
    games.push({ id: 'Motus', emoji: '🟨', volume: p.motus ? p.motus.solved || 0 : 0,
        html: gameCard('🟨', 'Motus', '#c9a24a', p.motus && p.motus.streak, p.motus && p.motus.solved ? [
            [p.motus.solved, 'résolues'], [p.motus.bestTries ?? '—', 'meilleurs essais'],
            [p.motus.avgTries ?? '—', 'essais moyens'], [p.motus.days, 'jours'],
        ] : null) });
    games.push({ id: 'Le Mot Juste', emoji: '🧊', volume: p.motjuste ? p.motjuste.solved || 0 : 0,
        html: gameCard('🧊', 'Le Mot Juste', '#6fb8d9', p.motjuste && p.motjuste.streak, p.motjuste && p.motjuste.solved ? [
            [p.motjuste.solved, 'résolues'], [p.motjuste.bestTries ?? '—', 'meilleurs essais'],
            [p.motjuste.avgTries ?? '—', 'essais moyens'], [p.motjuste.days, 'jours'],
        ] : null) });
    const mp = p.motusparty;
    games.push({ id: 'Motus Party', emoji: '🏁', volume: mp ? mp.matchesPlayed || 0 : 0,
        html: gameCard('🏁', 'Motus Party', '#d9a94e', 0, mp && mp.matchesPlayed ? [
            [mp.matchesWon, 'courses gagnées'], [mp.matchesPlayed, 'courses jouées'],
            [mp.wordsFound, 'mots trouvés'], [mp.bestRank ? (mp.bestRank === 1 ? '🥇' : mp.bestRank === 2 ? '🥈' : mp.bestRank === 3 ? '🥉' : mp.bestRank + 'e') : '—', 'meilleur classement'],
        ] : null) });
    games.push({ id: 'Petit Bac', emoji: '✏️', volume: 0,
        html: gameCard('✏️', 'Petit Bac', '#c2513a', 0, null, 'Suivi des statistiques à venir') });
    games.push({ id: 'Infiltré', emoji: '🕵️', volume: 0,
        html: gameCard('🕵️', 'Infiltré', '#6f7bb0', 0, null, 'Suivi des statistiques à venir') });
    const y = p.yams;
    const yamsNote = y && y.nemesis ? `Bête noire : ${esc(y.nemesis.pseudo)} vous a battu ${y.nemesis.losses} fois` : null;
    games.push({ id: 'Yams', emoji: '🎯', volume: y ? y.gamesPlayed || 0 : 0,
        html: gameCard('🎯', 'Yams', '#ecca82', 0, y && y.gamesPlayed ? [
            [y.gamesWon, 'victoires'], [y.gamesPlayed, 'parties'], [y.totalYams, 'Yams'], [y.bestScore, 'meilleur score'],
        ] : null, yamsNote) });
    return games;
}
let allGames = [], activeGameTab = null, favoriteGameName = null;
function renderTabs() {
    $('pr-tabs').innerHTML = allGames.map(g => `
        <button type="button" class="pr-tab${g.id === activeGameTab ? ' on' : ''}${g.id === favoriteGameName ? ' fav' : ''}" data-g="${esc(g.id)}">
            ${g.emoji} ${esc(g.id)}${g.id === favoriteGameName ? ' ⭐' : ''}
        </button>`).join('');
    $('pr-tabs').querySelectorAll('.pr-tab').forEach(b => b.addEventListener('click', () => {
        activeGameTab = b.dataset.g;
        renderTabs();
        $('pr-games').innerHTML = allGames.find(g => g.id === activeGameTab).html;
    }));
}

// ---------- Résumé transversal ----------
async function loadSummary() {
    const { ok, data } = await api('/api/salon/mystats-summary');
    if (!ok) return;
    favoriteGameName = data.favoriteGame;
    $('sum-week').textContent = data.weekCount;
    $('sum-fav').textContent = data.favoriteGame || '—';
    $('pr-summary').hidden = false;
    if (allGames.length) renderTabs();
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
    allGames = buildGameCards(profile);
    activeGameTab = allGames[0].id;
    renderTabs();
    $('pr-games').innerHTML = allGames[0].html;
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
    toast('Pseudo changé, vous êtes maintenant ' + data.pseudo + '.');
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