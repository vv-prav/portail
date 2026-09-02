// =====================================================================
//  DESIGN SYSTEM DU SALON — partie JS, servie à la racine (/design-system.js).
//  Fournit deux briques qui se créent elles-mêmes dans la page (pas besoin
//  d'ajouter le moindre HTML) :
//    - DS.toast(message)
//    - DS.confirm({ emoji, title, text, actions: [{label, danger, run}], closeIcon })
//
//  Reste volontairement indépendant de tout jeu en particulier, comme
//  profile-viewer.js, pour pouvoir être inclus partout à l'identique :
//  <script src="/design-system.css">, <script src="/design-system.js">
// =====================================================================
(function () {
    if (window.DS) return;   // déjà chargé sur cette page

    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

    // ---------- Toast ----------
    let toastEl = null, toastTimer = null;
    function ensureToast() {
        if (toastEl) return toastEl;
        toastEl = document.createElement('p');
        toastEl.className = 'ds-toast';
        document.body.appendChild(toastEl);
        return toastEl;
    }
    function toast(msg, duration) {
        const el = ensureToast();
        el.textContent = msg;
        el.classList.add('on');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove('on'), duration || 2600);
    }

    // ---------- Confirmation ----------
    let confirmEl = null;
    function ensureConfirmOverlay() {
        if (confirmEl) return confirmEl;
        confirmEl = document.createElement('div');
        confirmEl.className = 'ds-overlay';
        // ⚠️ Indispensable. La règle `.ds-overlay:not([hidden])` du CSS rend
        // visible tout overlay qui ne porte pas l'attribut `hidden` : sans
        // cette ligne, la popup restait affichée pour de bon une fois fermée
        // — un voile plein écran qui interceptait tous les clics de la page.
        confirmEl.hidden = true;
        confirmEl.innerHTML = `
            <div class="ds-card">
                <button type="button" class="ds-card-close" aria-label="Fermer">✕</button>
                <p class="ds-confirm-emoji" id="ds-confirm-emoji">❓</p>
                <h2 class="ds-card-title" id="ds-confirm-title">—</h2>
                <p class="ds-card-text" id="ds-confirm-text"></p>
                <div class="ds-confirm-code" id="ds-confirm-code" hidden></div>
                <input class="ds-input" id="ds-confirm-input" hidden autocapitalize="off" autocorrect="off" autocomplete="off">
                <div class="ds-card-actions" id="ds-confirm-actions"></div>
            </div>`;
        document.body.appendChild(confirmEl);
        confirmEl.querySelector('.ds-card-close').addEventListener('click', closeConfirm);
        confirmEl.addEventListener('click', (e) => { if (e.target === confirmEl) closeConfirm(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeConfirm(); });
        return confirmEl;
    }
    function closeConfirm() {
        if (!confirmEl) return;
        confirmEl.classList.remove('on');
        confirmEl.hidden = true;   // retirer la classe ne suffit pas, voir ci-dessus
    }

    function confirm(opts) {
        const o = opts || {};
        const el = ensureConfirmOverlay();
        // closeIcon:false pour une popup purement informative : le bouton du bas
        // suffit, et deux sorties pour la même chose n'aident personne.
        el.querySelector('.ds-card-close').hidden = (o.closeIcon === false);
        el.querySelector('#ds-confirm-emoji').textContent = o.emoji || '❓';
        el.querySelector('#ds-confirm-title').textContent = o.title || '';
        const textEl = el.querySelector('#ds-confirm-text');
        textEl.textContent = o.text || '';
        textEl.hidden = !o.text;
        // Encadré de code : pour montrer un code généré (ex. récupération) au passage.
        const codeEl = el.querySelector('#ds-confirm-code');
        if (o.code) { codeEl.textContent = o.code; codeEl.hidden = false; } else codeEl.hidden = true;
        // Saisie obligatoire : les actions restent désactivées tant que le texte ne
        // correspond pas exactement — pour les actions vraiment dangereuses.
        const inputEl = el.querySelector('#ds-confirm-input');
        inputEl.value = '';
        if (o.confirmText) { inputEl.placeholder = o.confirmText; inputEl.hidden = false; } else inputEl.hidden = true;
        const box = el.querySelector('#ds-confirm-actions');
        box.innerHTML = '';
        (o.actions || [{ label: 'OK', run: () => {} }]).forEach(a => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'ds-btn' + (a.danger ? ' danger' : (a.ghost ? ' ghost' : ''));
            b.textContent = a.label;
            if (o.confirmText) {
                b.disabled = true;
                inputEl.addEventListener('input', () => { b.disabled = (inputEl.value.trim() !== o.confirmText); });
            }
            b.addEventListener('click', () => { closeConfirm(); if (a.run) a.run(); });
            box.appendChild(b);
        });
        // Une façon d'annuler est toujours proposée, même si l'appelant ne l'a pas pensée.
        if (!(o.actions || []).some(a => a.cancel)) {
            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.className = 'ds-btn ghost';
            cancelBtn.textContent = o.cancelLabel || 'Annuler';
            cancelBtn.addEventListener('click', closeConfirm);
            box.appendChild(cancelBtn);
        }
        el.hidden = false;
        el.classList.add('on');
    }

    // ---------- Aide au rendu d'une bulle d'avatar cohérente (taille standard) ----------
    // S'appuie sur PortailProfile s'il est chargé sur la page (profile-viewer.js),
    // sinon retombe simplement sur l'emoji fourni.
    function avatarHTML(avatarData, size) {
        const a = avatarData || {};
        const inner = a.photo ? `<img src="${a.photo}" alt="">` : esc(a.emoji || '✦');
        return `<span class="ds-avatar ${size || 'sm'}">${inner}</span>`;
    }

    // ---------- Garde-fou ----------
    // Un `.ds-overlay` qui n'a ni `hidden` ni `.on` est affiché par le CSS et
    // capte tous les clics de la page, sans que rien ne le signale. On rattrape
    // le cas au chargement plutôt que de laisser une page entière se bloquer.
    function verrouillerOverlaysOublies() {
        document.querySelectorAll('.ds-overlay').forEach(el => {
            if (!el.hasAttribute('hidden') && !el.classList.contains('on')) el.hidden = true;
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', verrouillerOverlaysOublies);
    else verrouillerOverlaysOublies();

    window.DS = { toast, confirm, closeConfirm, avatarHTML, esc };
})();