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
.pv-card { max-height:86vh; overflow-y:auto; }
.pv-rang { display:inline-flex; align-items:center; gap:6px; margin:0 0 14px; padding:4px 12px; border-radius:999px;
    background:rgba(217,169,78,.14); border:1px solid rgba(217,169,78,.3); font-size:.74rem; color:#ecca82; }
.pv-h2h { margin:0 0 16px; padding:12px; border-radius:12px; text-align:left;
    background:rgba(217,169,78,.08); border:1px solid rgba(217,169,78,.22); font-size:.78rem; color:#efe4cf; }
.pv-h2h b { color:#ecca82; }
.pv-jeu { margin-bottom:10px; border-radius:12px; overflow:hidden;
    background:rgba(255,255,255,.03); border:1px solid rgba(217,169,78,.18); }
.pv-jeu-tete { display:flex; align-items:center; gap:8px; width:100%; padding:10px 12px; border:none; cursor:pointer;
    background:transparent; color:#efe4cf; font-family:inherit; font-size:.84rem; text-align:left; }
.pv-jeu-nom { flex:1; font-weight:700; }
.pv-jeu-resume { font-size:.72rem; color:#a08f74; }
.pv-jeu-chev { color:#a08f74; transition:transform .18s ease; }
.pv-jeu-tete[aria-expanded="true"] .pv-jeu-chev { transform:rotate(90deg); }
.pv-jeu-corps { padding:0 12px 10px; display:flex; flex-direction:column; gap:4px; }
.pv-jeu-corps[hidden] { display:none; }
.pv-ligne { display:flex; justify-content:space-between; gap:10px; font-size:.78rem; color:#c9b99c; }
.pv-ligne b { color:#ecca82; font-variant-numeric:tabular-nums; }
.pv-note { margin:6px 0 0; font-size:.68rem; color:#8d8271; line-height:1.4; }
.pv-titres { display:flex; flex-wrap:wrap; gap:5px; justify-content:center; margin:0 0 14px; }
.pv-titre { display:inline-flex; align-items:center; gap:4px; padding:3px 9px; border-radius:999px;
    font-size:.7rem; border:1px solid; font-family:inherit; cursor:pointer; }
.pv-titre:focus-visible { outline:2px solid #d9a94e; outline-offset:2px; }
.pv-titre.unique { color:#ecca82; border-color:#d9a94e; background:rgba(217,169,78,.16); }
.pv-titre.rare { color:#c9b99c; border-color:rgba(217,169,78,.35); background:rgba(217,169,78,.07); }
.pv-titre.commun { color:#a08f74; border-color:rgba(217,169,78,.18); }
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
                <p class="pv-rang" id="pv-rang-el" hidden></p>
                <div class="pv-titres" id="pv-titres-el"></div>
                <div class="pv-h2h" id="pv-h2h-el" hidden></div>
                <div class="pv-stats" id="pv-stats-el"></div>
            </div>`;
        document.body.appendChild(overlayEl);
        overlayEl.querySelector('.pv-close').addEventListener('click', close);
        overlayEl.addEventListener('click', (e) => { if (e.target === overlayEl) close(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
        return overlayEl;
    }

    function close() { if (overlayEl) overlayEl.classList.remove('on'); }

    // Une ligne de statistique, repliée par jeu : la fiche montrait seulement
    // Yams et Motus Party, en ignorant les jeux du jour qui font l'essentiel de
    // l'activité du salon. Elle montre désormais tout, jeu par jeu.
    function blocJeu(j, ouvert) {
        const lignes = j.lignes.map(([l, v]) => `<div class="pv-ligne"><span>${esc(l)}</span><b>${esc(v)}</b></div>`).join('');
        const note = j.note ? `<p class="pv-note">${esc(j.note)}</p>` : '';
        return `<div class="pv-jeu">
            <button class="pv-jeu-tete" type="button" aria-expanded="${ouvert ? 'true' : 'false'}">
                <span>${esc(j.emoji)}</span>
                <span class="pv-jeu-nom">${esc(j.nom)}</span>
                <span class="pv-jeu-resume">${esc(j.resume)}</span>
                <span class="pv-jeu-chev" aria-hidden="true">›</span>
            </button>
            <div class="pv-jeu-corps"${ouvert ? '' : ' hidden'}>${lignes}${note}</div>
        </div>`;
    }

    function texteFaceAface(f, pseudo) {
        if (!f) return '';
        const bouts = [];
        if (f.duels) {
            const total = f.duels.sesVictoires + f.duels.mesVictoires;
            bouts.push(`Au Yams, <b>${f.duels.mesVictoires}</b> victoire${f.duels.mesVictoires > 1 ? 's' : ''} pour toi contre <b>${f.duels.sesVictoires}</b> sur ${total} duel${total > 1 ? 's' : ''}.`);
        }
        if (f.monRang && f.sonRang) {
            bouts.push(f.monRang < f.sonRang
                ? `Tu es <b>${f.monRang}<sup>e</sup></b> au classement du Salon, ${esc(pseudo)} <b>${f.sonRang}<sup>e</sup></b>.`
                : (f.monRang > f.sonRang
                    ? `${esc(pseudo)} est <b>${f.sonRang}<sup>e</sup></b> au classement du Salon, toi <b>${f.monRang}<sup>e</sup></b>.`
                    : ''));
        }
        return bouts.filter(Boolean).join(' ');
    }

    async function open(pseudo) {
        if (!pseudo) return;
        injectStyles();
        const el = ensureOverlay();
        el.classList.add('on');
        el.querySelector('#pv-avatar-el').textContent = '✦';
        el.querySelector('#pv-name-el').textContent = pseudo;
        el.querySelector('#pv-meta-el').textContent = 'Chargement…';
        el.querySelector('#pv-rang-el').hidden = true;
        el.querySelector('#pv-titres-el').innerHTML = '';
        el.querySelector('#pv-h2h-el').hidden = true;
        el.querySelector('#pv-stats-el').innerHTML = '';
        try {
            const res = await fetch('/api/public-profile?pseudo=' + encodeURIComponent(pseudo));
            const data = await res.json();
            if (!res.ok) { el.querySelector('#pv-meta-el').textContent = data.error || 'Profil introuvable.'; return; }

            el.querySelector('#pv-avatar-el').innerHTML = data.avatarPhoto ? `<img src="${data.avatarPhoto}" alt="">` : esc(data.avatar || '✦');
            el.querySelector('#pv-name-el').textContent = data.pseudo;
            const depuis = data.created ? new Date(data.created).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
            const bouts = [];
            if (data.online) bouts.push('🟢 en ligne');
            bouts.push('membre depuis le ' + depuis);
            if (data.favori) bouts.push('joue surtout à ' + data.favori);
            el.querySelector('#pv-meta-el').textContent = bouts.join(' · ');

            const rang = el.querySelector('#pv-rang-el');
            if (data.rang) {
                rang.innerHTML = `🏅 <b>${data.rang.place}<sup>e</sup></b> du Salon sur ${data.rang.total} · ${data.rang.points} pts`;
                rang.hidden = false;
            }

            // Les titres, les plus rares d'abord : un titre unique se dispute,
            // c'est la première chose qu'on veut voir sur un profil.
            const titres = data.titres || [];
            el.querySelector('#pv-titres-el').innerHTML = titres.map((t, i) =>
                `<button type="button" class="pv-titre ${esc(t.rarete)}" data-t="${i}">${esc(t.emoji)} ${esc(t.nom)}</button>`).join('');
            el.querySelectorAll('.pv-titre').forEach(b =>
                b.addEventListener('click', () => expliquerTitre(titres[Number(b.dataset.t)])));

            const h2h = el.querySelector('#pv-h2h-el');
            const texte = texteFaceAface(data.faceAface, data.pseudo);
            if (texte) { h2h.innerHTML = texte; h2h.hidden = false; }

            const hote = el.querySelector('#pv-stats-el');
            hote.innerHTML = (data.jeux && data.jeux.length)
                ? data.jeux.map((j, i) => blocJeu(j, i === 0)).join('')
                : '<p class="pv-empty">Pas encore de statistiques à montrer.</p>';
            hote.querySelectorAll('.pv-jeu-tete').forEach(b => b.addEventListener('click', () => {
                const corps = b.nextElementSibling;
                const ouvert = !corps.hidden;
                corps.hidden = ouvert;
                b.setAttribute('aria-expanded', String(!ouvert));
            }));
        } catch (e) {
            el.querySelector('#pv-meta-el').textContent = 'Connexion impossible.';
        }
    }

    // Un titre sans explication n'est qu'un émoji. Le design system est chargé
    // partout où cette bulle l'est ; on reste prudent quand même.
    const SENS_RARETE = {
        unique: 'Titre unique : une seule personne le porte à la fois dans tout le salon. Il change de mains dès que quelqu’un fait mieux.',
        rare: 'Titre rare : il faut vraiment aller le chercher.',
        commun: 'Titre commun : une étape que tout le monde peut franchir.',
    };
    function expliquerTitre(t) {
        if (!t || !window.DS) return;
        DS.confirm({ emoji: t.emoji, title: t.nom,
            text: t.desc + '\n\n' + (SENS_RARETE[t.rarete] || ''),
            actions: [], cancelLabel: 'Fermer' });
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