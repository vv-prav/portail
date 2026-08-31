// =====================================================================
//  PORTAIL PROFILE VIEWER — composant partagé, chargé depuis /profile-viewer.js
//  par n'importe quelle app du site (servi à la racine, donc accessible
//  partout sans dupliquer le code). Fournit :
//    - PortailProfile.fetchAvatars([pseudos])  → { pseudo: {photo, emoji} }
//    - PortailProfile.bubbleHTML(avatarData)   → le contenu d'une bulle
//    - PortailProfile.open(pseudo)             → ouvre le profil en lecture seule
//
//  Reste volontairement autonome (pas de dépendance à un jeu en particulier)
//  pour pouvoir être inclus tel quel n'importe où avec une simple balise
//  <script src="/profile-viewer.js"></script>.
// =====================================================================
(function () {
    if (window.PortailProfile) return;   // déjà chargé sur cette page

    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

    function injectStyles() {
        if (document.getElementById('pv-styles')) return;
        const style = document.createElement('style');
        style.id = 'pv-styles';
        style.textContent = `
.pv-overlay { position:fixed; inset:0; z-index:900; display:flex; align-items:center; justify-content:center;
    background:rgba(10,8,5,.78); padding:20px; opacity:0; visibility:hidden; transition:opacity .2s, visibility .2s; }
.pv-overlay.on { opacity:1; visibility:visible; }
.pv-card { position:relative; width:100%; max-width:360px; padding:28px 22px 22px; border-radius:20px; text-align:center;
    background:linear-gradient(165deg,#1d1710,#14100b); border:1px solid rgba(217,169,78,.2);
    box-shadow:0 24px 60px rgba(0,0,0,.65); font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
    transform:scale(.92) translateY(10px); transition:transform .25s cubic-bezier(.2,.9,.3,1); }
.pv-overlay.on .pv-card { transform:scale(1) translateY(0); }
.pv-close { position:absolute; top:14px; right:14px; width:32px; height:32px; border-radius:50%; border:1px solid rgba(217,169,78,.2);
    background:rgba(255,255,255,.04); color:#ecca82; font-size:.85rem; cursor:pointer; display:grid; place-items:center; }
.pv-close:active { transform:scale(.9); }
.pv-avatar { width:80px; height:80px; margin:0 auto 14px; border-radius:50%; display:grid; place-items:center; font-size:2.4rem;
    background:linear-gradient(165deg,#241b12,#14100b); border:2px solid #d9a94e; overflow:hidden;
    box-shadow:0 8px 22px rgba(0,0,0,.5); color:#efe4cf; }
.pv-avatar img { width:100%; height:100%; object-fit:cover; border-radius:50%; display:block; }
.pv-name { margin:0 0 4px; font-size:1.35rem; font-weight:800;
    background:linear-gradient(180deg,#ecca82,#d9a94e); -webkit-background-clip:text; background-clip:text; color:transparent; }
.pv-meta { margin:0 0 18px; font-size:.78rem; color:#a08f74; }
.pv-stats { display:flex; flex-direction:column; gap:6px; text-align:left; }
.pv-stat-row { display:flex; justify-content:space-between; gap:10px; padding:10px 12px; border-radius:10px;
    background:rgba(255,255,255,.03); border:1px solid rgba(217,169,78,.2); font-size:.82rem; color:#efe4cf; }
.pv-stat-row b { color:#ecca82; text-align:right; }
.pv-empty { color:#a08f74; font-size:.8rem; text-align:center; margin:6px 0 0; }
.pv-bubble-btn { all:unset; cursor:pointer; display:inline-flex; }
@media (prefers-reduced-motion:reduce) { .pv-card, .pv-overlay { transition-duration:.001ms !important; } }
`;
        document.head.appendChild(style);
    }

    let overlayEl = null;
    function ensureOverlay() {
        if (overlayEl) return overlayEl;
        overlayEl = document.createElement('div');
        overlayEl.className = 'pv-overlay';
        overlayEl.innerHTML = `
            <div class="pv-card">
                <button class="pv-close" type="button" aria-label="Fermer">✕</button>
                <div class="pv-avatar" id="pv-avatar-el">✦</div>
                <h2 class="pv-name" id="pv-name-el">—</h2>
                <p class="pv-meta" id="pv-meta-el">—</p>
                <div class="pv-stats" id="pv-stats-el"></div>
            </div>`;
        document.body.appendChild(overlayEl);
        overlayEl.querySelector('.pv-close').addEventListener('click', close);
        overlayEl.addEventListener('click', (e) => { if (e.target === overlayEl) close(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
        return overlayEl;
    }

    function close() { if (overlayEl) overlayEl.classList.remove('on'); }

    async function open(pseudo) {
        if (!pseudo) return;
        injectStyles();
        const el = ensureOverlay();
        el.classList.add('on');
        el.querySelector('#pv-avatar-el').textContent = '✦';
        el.querySelector('#pv-name-el').textContent = pseudo;
        el.querySelector('#pv-meta-el').textContent = 'Chargement…';
        el.querySelector('#pv-stats-el').innerHTML = '';
        try {
            const res = await fetch('/api/public-profile?pseudo=' + encodeURIComponent(pseudo));
            const data = await res.json();
            if (!res.ok) { el.querySelector('#pv-meta-el').textContent = data.error || 'Profil introuvable.'; return; }
            el.querySelector('#pv-avatar-el').innerHTML = data.avatarPhoto ? `<img src="${data.avatarPhoto}" alt="">` : esc(data.avatar || '✦');
            el.querySelector('#pv-name-el').textContent = data.pseudo;
            const created = data.created ? new Date(data.created).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
            el.querySelector('#pv-meta-el').textContent = (data.online ? '🟢 en ligne · ' : '') + 'membre depuis le ' + created;
            const stats = [];
            if (data.favoriteGame) stats.push(['Jeu préféré', data.favoriteGame]);
            if (data.yams) stats.push(['Yams', `${data.yams.gamesWon} victoires / ${data.yams.gamesPlayed} parties`]);
            if (data.motusparty) stats.push(['Motus Party', `${data.motusparty.matchesWon} courses gagnées / ${data.motusparty.matchesPlayed} jouées`]);
            el.querySelector('#pv-stats-el').innerHTML = stats.length
                ? stats.map(([l, v]) => `<div class="pv-stat-row"><span>${esc(l)}</span><b>${esc(v)}</b></div>`).join('')
                : '<p class="pv-empty">Pas encore de statistiques à montrer.</p>';
        } catch (e) {
            el.querySelector('#pv-meta-el').textContent = 'Connexion impossible.';
        }
    }

    function bubbleHTML(avatarData) {
        const a = avatarData || {};
        return a.photo ? `<img src="${a.photo}" alt="">` : esc(a.emoji || '✦');
    }

    async function fetchAvatars(pseudos) {
        const unique = [...new Set((pseudos || []).filter(Boolean))];
        if (!unique.length) return {};
        try {
            const res = await fetch('/api/avatars?pseudos=' + encodeURIComponent(unique.join(',')));
            return await res.json();
        } catch (e) { return {}; }
    }

    window.PortailProfile = { open, close, bubbleHTML, fetchAvatars };
})();