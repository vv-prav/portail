// =====================================================================
//  LE FIL DU SALON — composant partagé
//
//  Une pastille, et une feuille qui monte. Rien d'autre.
//
//  ⚠️ IL NE S'AFFICHE PAS PARTOUT, ET C'EST VOULU. Le coin bas-droite est
//  déjà occupé : `.geo-carte-zoom` y pose ses trois boutons à 8 px dans
//  les cinq jeux de géographie. Et le salon s'est déjà fait prendre deux
//  fois — le toast à z-index 1200 se posait pile sur « Lancer les dés »
//  du Yams, la célébration avalait les clics pendant trois secondes. Une
//  page DEMANDE donc la bulle, elle ne la subit pas :
//
//      <body data-fil>            → la bulle, toujours
//      <body data-fil="attente">  → seulement dans le hall et la salle
//                                   d'attente (#v-lobby / #v-waiting)
//
//  C'est le mécanisme de `data-jeu` pour `style.js`, déjà en service.
//  Jamais pendant une manche : le clavier natif occupe le bas de l'écran
//  au Motus et aux Mots Fléchés, et on ne coupe pas quelqu'un qui joue.
//
//  ⚠️ AUCUNE NOTIFICATION. Pas de son, pas de vibration, pas de titre
//  d'onglet qui clignote. Le salon n'a pas vocation à réclamer
//  l'attention : la pastille attend qu'on passe.
// =====================================================================
(function () {
    if (window.Fil) return;                     // déjà chargé sur cette page

    const mode = document.body.getAttribute('data-fil');
    if (mode === null) return;                  // cette page n'en veut pas

    let bulle = null, voile = null, liste = null, champ = null;
    let ouvert = false, nonLus = 0, moi = null, sock = null, sondage = null;

    const esc = (s) => String(s == null ? '' : s)
        .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // ⚠️ Les messages arrivent DÉJÀ échappés du serveur (`escapeHtml` à
    // l'écriture, comme la discussion du jour). On les pose tels quels ; les
    // réechapper afficherait « &amp;lt; » à qui écrit un chevron.
    function quand(ts) {
        const d = new Date(ts), m = new Date();
        const hhmm = d.getHours() + 'h' + String(d.getMinutes()).padStart(2, '0');
        if (d.toDateString() === m.toDateString()) return hhmm;
        const hier = new Date(m); hier.setDate(m.getDate() - 1);
        if (d.toDateString() === hier.toDateString()) return 'hier ' + hhmm;
        return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' ' + hhmm;
    }

    function style() {
        if (document.getElementById('fil-style')) return;
        const s = document.createElement('style');
        s.id = 'fil-style';
        s.textContent = `
.fil-bulle { position:fixed; right:14px; bottom:calc(16px + env(safe-area-inset-bottom));
    width:48px; height:48px; border-radius:50%; z-index:1150;
    display:grid; place-items:center; font-size:1.3rem; cursor:pointer;
    background:var(--ds-ink-2,#1d1710); color:var(--ds-brass-soft,#ecca82);
    border:1px solid var(--ds-line,rgba(217,169,78,.3));
    box-shadow:0 6px 20px rgba(0,0,0,.45); }
.fil-bulle[hidden] { display:none; }
.fil-bulle:active { transform:scale(.94); }
.fil-pastille { position:absolute; top:-3px; right:-3px; min-width:20px; height:20px; padding:0 5px;
    border-radius:999px; background:#d2624a; color:#fff; font-size:.7rem; font-weight:800;
    display:grid; place-items:center; box-shadow:0 0 0 2px var(--ds-ink,#14100b); }
.fil-pastille[hidden] { display:none; }

/* ⚠️ Le voile naît CACHÉ et son état sûr est l'état visible : seule
   l'opacité est animée, jamais \`visibility\`. Transitionnée, elle reste à
   \`visible\` pendant toute l'animation — et si celle-ci ne tourne pas
   (onglet en arrière-plan), un voile plein écran invisible avale les clics.
   Le salon s'est fait avoir deux fois là-dessus. */
.fil-voile { position:fixed; inset:0; z-index:1400; background:rgba(0,0,0,.55);
    display:flex; align-items:flex-end; opacity:0; transition:opacity .18s; }
.fil-voile[hidden] { display:none; }
.fil-voile.on { opacity:1; }
.fil-feuille { width:100%; max-width:560px; margin:0 auto; height:72svh; display:flex; flex-direction:column;
    background:var(--ds-ink,#14100b); border:1px solid var(--ds-line,rgba(217,169,78,.3)); border-bottom:0;
    border-radius:18px 18px 0 0; transform:translateY(14px); transition:transform .18s; }
.fil-voile.on .fil-feuille { transform:none; }
.fil-tete { display:flex; align-items:center; gap:10px; padding:12px 14px;
    border-bottom:1px solid var(--ds-line,rgba(217,169,78,.2)); }
.fil-tete b { flex:1; font-size:.95rem; color:var(--ds-brass-soft,#ecca82); }
.fil-tete small { font-size:.7rem; color:var(--ds-muted,#a08f74); }

.fil-liste { flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch; padding:12px 14px;
    display:flex; flex-direction:column; gap:10px; }
.fil-msg { max-width:86%; }
.fil-msg.moi { align-self:flex-end; text-align:right; }
.fil-qui { font-size:.7rem; color:var(--ds-muted,#a08f74); margin-bottom:2px; }
.fil-txt { display:inline-block; padding:8px 11px; border-radius:13px; font-size:.88rem; line-height:1.45;
    background:rgba(255,255,255,.05); color:var(--ds-parchment,#efe4cf); text-align:left;
    overflow-wrap:anywhere; }
.fil-msg.moi .fil-txt { background:rgba(217,169,78,.16); }
/* Le trait qui dit où on s'était arrêté : sans lui, revenir sur douze
   messages oblige à chercher lequel on avait déjà lu. */
.fil-depuis { display:flex; align-items:center; gap:8px; font-size:.66rem; color:var(--ds-muted,#a08f74); }
.fil-depuis::before, .fil-depuis::after { content:''; flex:1; height:1px; background:var(--ds-line,rgba(217,169,78,.25)); }
.fil-vide { margin:auto; text-align:center; font-size:.82rem; color:var(--ds-muted,#a08f74); line-height:1.6; }

.fil-bas { display:flex; gap:8px; padding:10px 12px calc(10px + env(safe-area-inset-bottom));
    border-top:1px solid var(--ds-line,rgba(217,169,78,.2)); }
.fil-bas input { flex:1; min-width:0; }
.fil-bas button { flex:0 0 auto; }
`;
        document.head.appendChild(s);
    }

    function creer() {
        style();
        bulle = document.createElement('button');
        bulle.type = 'button';
        bulle.className = 'fil-bulle';
        bulle.setAttribute('aria-label', 'Le fil du salon');
        bulle.innerHTML = '💬<span class="fil-pastille" hidden></span>';
        bulle.addEventListener('click', ouvrir);
        document.body.appendChild(bulle);

        voile = document.createElement('div');
        voile.className = 'fil-voile';
        voile.hidden = true;                    // ⚠️ jamais sans `hidden`
        voile.innerHTML = `
            <div class="fil-feuille">
                <div class="fil-tete">
                    <b>Le fil du salon</b>
                    <small>une seule conversation</small>
                    <button type="button" class="ds-icon-btn small fil-fermer" aria-label="Fermer">✕</button>
                </div>
                <div class="fil-liste"></div>
                <form class="fil-bas" autocomplete="off">
                    <input class="ds-input" type="text" maxlength="240" placeholder="Écrire au salon…"
                           aria-label="Ton message">
                    <button class="ds-btn small" type="submit">Envoyer</button>
                </form>
            </div>`;
        document.body.appendChild(voile);

        liste = voile.querySelector('.fil-liste');
        champ = voile.querySelector('input');
        voile.querySelector('.fil-fermer').addEventListener('click', fermer);
        voile.addEventListener('click', (e) => { if (e.target === voile) fermer(); });
        voile.querySelector('form').addEventListener('submit', envoyer);
    }

    function rendre(messages, luJusqua) {
        if (!messages.length) {
            liste.innerHTML = `<p class="fil-vide">Personne n'a encore rien dit.<br>Commence, on te lira en passant.</p>`;
            return;
        }
        let traceePosee = false;
        liste.innerHTML = messages.map(m => {
            let avant = '';
            // Le trait « nouveaux » se pose une seule fois, devant le premier
            // message qu'on n'avait pas lu.
            if (!traceePosee && luJusqua && m.ts > luJusqua && m.u !== moi) {
                traceePosee = true;
                avant = `<div class="fil-depuis">nouveaux</div>`;
            }
            return avant + `
                <div class="fil-msg${m.u === moi ? ' moi' : ''}">
                    <div class="fil-qui">${esc(m.u)} · ${quand(m.ts)}</div>
                    <div class="fil-txt">${m.t}</div>
                </div>`;
        }).join('');
        liste.scrollTop = liste.scrollHeight;
    }

    async function ouvrir() {
        if (!voile) return;
        ouvert = true;
        voile.hidden = false;
        requestAnimationFrame(() => voile.classList.add('on'));
        rejoindre();
        try {
            const r = await fetch('/api/fil');
            const d = await r.json();
            moi = d.moi;
            rendre(d.messages || [], d.luJusqua);
        } catch (e) {
            liste.innerHTML = `<p class="fil-vide">Le fil n'a pas pu être chargé.</p>`;
        }
        majPastille(0);
        // ⚠️ L'ACCUEIL NE CHARGE PAS SOCKET.IO, et c'est voulu : il se contente
        // du pouls toutes les soixante secondes. C'est justement la page où la
        // bulle est le plus présente — sans filet, on y aurait une feuille
        // ouverte qui ne bouge pas pendant qu'on vous écrit. Un sondage de
        // cinq secondes, UNIQUEMENT tant que la feuille est ouverte, et
        // seulement faute de socket. C'est déjà la parade du hall.
        if (!sock) sondage = setInterval(rafraichir, 5000);
        setTimeout(() => { try { champ.focus(); } catch (e) {} }, 120);
    }

    async function rafraichir() {
        if (!ouvert) return;
        try {
            const r = await fetch('/api/fil');
            const d = await r.json();
            const colleEnBas = liste.scrollHeight - liste.scrollTop - liste.clientHeight < 40;
            const avant = liste.children.length;
            moi = d.moi;
            rendre(d.messages || [], null);
            // ⚠️ On ne ramène en bas que si on y était : quelqu'un qui remonte
            // lire ne doit pas être renvoyé en bas toutes les cinq secondes.
            if (!colleEnBas && avant) liste.scrollTop = 0;
        } catch (e) {}
    }

    function fermer() {
        ouvert = false;
        if (!voile) return;
        voile.classList.remove('on');
        // Le voile part tout de suite en `hidden` après le fondu ; un filet au
        // cas où la transition ne tournerait pas.
        setTimeout(() => { if (!ouvert) voile.hidden = true; }, 200);
        if (sondage) { clearInterval(sondage); sondage = null; }
        try { if (sock) sock.emit('fil_leave'); } catch (e) {}
    }

    async function envoyer(e) {
        e.preventDefault();
        const txt = champ.value.trim();
        if (!txt) return;
        champ.value = '';
        try {
            const r = await fetch('/api/fil', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: txt }),
            });
            const d = await r.json();
            if (!r.ok) { if (window.DS) DS.toast(d.error || 'Message refusé.'); champ.value = txt; return; }
            rendre(d.messages || [], null);
        } catch (err) {
            if (window.DS) DS.toast('Message non envoyé.');
            champ.value = txt;
        }
    }

    // Le direct, quand il y a quelqu'un. Le socket n'est rejoint qu'à
    // l'ouverture de la feuille : une page qui ne lit pas le fil n'a aucune
    // raison de tenir une salle.
    function rejoindre() {
        if (!window.io) return;
        try {
            if (!sock) {
                sock = window.filSocket || io();
                window.filSocket = sock;
                sock.on('fil_message', (m) => {
                    if (!ouvert) { majPastille(nonLus + 1); return; }
                    liste.insertAdjacentHTML('beforeend', `
                        <div class="fil-msg${m.u === moi ? ' moi' : ''}">
                            <div class="fil-qui">${esc(m.u)} · ${quand(m.ts)}</div>
                            <div class="fil-txt">${m.t}</div>
                        </div>`);
                    liste.scrollTop = liste.scrollHeight;
                    // Lu à l'instant où il s'affiche : sans ça le badge
                    // repasserait à un dès qu'on referme.
                    fetch('/api/fil/lu', { method: 'POST' }).catch(() => {});
                });
            }
            sock.emit('fil_join');
        } catch (e) {}
    }

    function majPastille(n) {
        nonLus = Math.max(0, n | 0);
        if (!bulle) return;
        const p = bulle.querySelector('.fil-pastille');
        p.textContent = nonLus > 99 ? '99+' : String(nonLus);
        p.hidden = !nonLus;
    }

    // ⚠️ Sur une page de jeu, la bulle ne vit que dans le hall et la salle
    // d'attente — là où l'on attend, donc là où l'on parle. Les vues se
    // basculent par l'attribut `hidden` dans les six jeux (vérifié), un
    // observateur suffit donc, et il n'y a rien à appeler depuis les apps.
    function suivreLesVues() {
        const vues = ['v-lobby', 'v-waiting'].map(id => document.getElementById(id)).filter(Boolean);
        if (!vues.length) { bulle.hidden = true; return; }
        const relire = () => {
            const visible = vues.some(v => !v.hidden);
            bulle.hidden = !visible;
            if (!visible && ouvert) fermer();
        };
        const obs = new MutationObserver(relire);
        for (const v of vues) obs.observe(v, { attributes: true, attributeFilter: ['hidden'] });
        relire();
    }

    creer();
    if (mode === 'attente') suivreLesVues();

    // Le compteur vient du pouls, que l'accueil demande déjà : une page qui
    // ne l'appelle pas garde une pastille muette jusqu'à l'ouverture, ce qui
    // est exactement ce qu'on veut d'un fil qu'on lit en passant.
    window.Fil = { ouvrir, fermer, compteur: majPastille };
})();
