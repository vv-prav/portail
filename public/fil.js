// =====================================================================
//  LES CONVERSATIONS DU SALON — composant partagé
//
//  Une bulle, une feuille, et TROIS fils dans la même feuille :
//
//      Le salon   — la conversation commune, continue
//      Amis       — les demandes, mes amis, et chaque conversation privée
//      La table   — pendant une partie, et seulement là
//
//  ⚠️ UN SEUL ENDROIT OÙ TOUT SE LIT, ET UN SEUL POINT ROUGE. Une seconde
//  bulle, ou une page séparée pour les messages privés, donnerait deux
//  endroits à surveiller — et on en oublierait un. Le point additionne le
//  fil du salon, les messages privés non lus et les demandes d'ami en
//  attente : il dit « il y a quelque chose », l'onglet dit quoi.
//
//  ⚠️ LA BULLE NE S'AFFICHE PAS PARTOUT. Le coin bas-droite est occupé par
//  les boutons de zoom dans les cinq jeux de géographie, qui ne la
//  déclarent donc pas. Une page la demande :
//
//      <body data-fil>            → toujours (l'accueil, /jouer/)
//      <body data-fil="jeu">      → les pages de jeu : hall, salle
//                                   d'attente ET partie en cours
//
//  ⚠️ `"jeu"` remplace l'ancien `"attente"`, qui masquait la bulle pendant
//  la partie. C'était la bonne règle tant qu'il n'y avait qu'un fil
//  commun — on ne coupe pas quelqu'un qui joue. Le fil de table change
//  justement ça : parler PENDANT la partie est tout son intérêt.
//
//  ⚠️ AUCUNE NOTIFICATION, nulle part : pas de son, pas de vibration, pas
//  de titre d'onglet qui clignote. La pastille attend qu'on passe.
// =====================================================================
(function () {
    if (window.Fil) return;                     // déjà chargé sur cette page

    const mode = document.body.getAttribute('data-fil');
    if (mode === null) return;                  // cette page n'en veut pas

    let bulle = null, voile = null, corps = null, form = null, champ = null;
    let ouvert = false, nonLus = 0, moi = null, monId = null, sock = null, sondage = null;
    let onglet = 'salon';          // salon | amis | table
    let conversation = null;       // { id, pseudo } quand on lit un privé
    let TABLE = null;              // { jeu, id } quand on est à une table

    const NOM_JEU = {
        yams: 'Yams', pbac: 'Petit Bac', undercover: 'Infiltré', perudo: 'Perudo',
        motus: 'Motus Party', drapeaux: 'Quiz des drapeaux',
    };

    const esc = (s) => String(s == null ? '' : s)
        .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const jeuDeLaPage = () => document.body.getAttribute('data-jeu') || '';

    async function api(url, body) {
        const r = await fetch(url, {
            method: body ? 'POST' : 'GET',
            headers: body ? { 'Content-Type': 'application/json' } : undefined,
            body: body ? JSON.stringify(body) : undefined,
        });
        let d = {};
        try { d = await r.json(); } catch (e) {}
        return { ok: r.ok, d };
    }

    // ⚠️ Les messages arrivent DÉJÀ échappés du serveur (`escapeHtml` à
    // l'écriture, dans les trois fils). On les pose tels quels ; les
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
/* ⚠️ PENDANT LA PARTIE, LA BULLE NE FLOTTE PLUS : elle entre dans l'en-tête
   du jeu. Mesuré au Yams : « Lancer les dés » occupe TOUTE la largeur en bas
   de l'écran — aucun coin n'est libre, et la bulle se posait exactement
   dessus. C'est le piège déjà payé deux fois (le toast sur ce même bouton,
   la célébration qui avalait les clics). Un seul élément, deux maisons :
   flottant dans le hall et la salle d'attente, ancré dès que la partie
   commence. Le dupliquer, c'est se condamner à les voir diverger. */
.fil-bulle.dans-entete { position:static; flex:0 0 auto; width:36px; height:36px;
    font-size:1rem; box-shadow:none; }
.fil-bulle.dans-entete .fil-point { top:-2px; right:-2px; width:10px; height:10px; }
/* Un point, pas un compteur. Le nombre de messages non lus n'appelle aucune
   décision — on ouvre, ou on n'ouvre pas — là où un point se lit d'un coup
   d'œil. L'anneau sombre le détache du bord de la bulle. */
.fil-point { position:absolute; top:1px; right:1px; width:11px; height:11px;
    border-radius:50%; background:#d2624a; box-shadow:0 0 0 2px var(--ds-ink,#14100b); }
.fil-point[hidden] { display:none; }

/* ⚠️ Le voile naît CACHÉ et son état sûr est l'état visible : seule
   l'opacité est animée, jamais \`visibility\`. Transitionnée, elle reste à
   \`visible\` pendant toute l'animation — et si celle-ci ne tourne pas
   (onglet en arrière-plan), un voile plein écran invisible avale les clics. */
.fil-voile { position:fixed; inset:0; z-index:1400; background:rgba(0,0,0,.55);
    display:flex; align-items:flex-end; opacity:0; transition:opacity .18s; }
.fil-voile[hidden] { display:none; }
.fil-voile.on { opacity:1; }
.fil-feuille { width:100%; max-width:560px; margin:0 auto; height:76svh; display:flex; flex-direction:column;
    background:var(--ds-ink,#14100b); border:1px solid var(--ds-line,rgba(217,169,78,.3)); border-bottom:0;
    border-radius:18px 18px 0 0; transform:translateY(14px); transition:transform .18s; }
.fil-voile.on .fil-feuille { transform:none; }

.fil-tete { display:flex; align-items:center; gap:10px; padding:11px 12px 9px; }
.fil-titre { flex:1; min-width:0; font-size:.95rem; font-weight:800; color:var(--ds-brass-soft,#ecca82);
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.fil-retour { background:transparent; border:0; color:var(--ds-brass-soft,#ecca82);
    font-size:1.2rem; cursor:pointer; padding:0 2px; font-family:inherit; }
.fil-retour[hidden] { display:none; }

/* Les onglets. ⚠️ Chacun porte son propre point : le point de la bulle dit
   qu'il y a quelque chose, l'onglet dit où. Sans ça on ouvrirait la feuille
   pour chercher dans quel fil ça a bougé. */
.fil-onglets { display:flex; gap:4px; padding:0 10px 9px; border-bottom:1px solid var(--ds-line,rgba(217,169,78,.2)); }
.fil-onglets[hidden] { display:none; }
.fil-onglet { flex:1; padding:7px 4px; border-radius:9px; border:1px solid transparent;
    background:transparent; color:var(--ds-muted,#a08f74); font-family:inherit;
    font-size:.78rem; font-weight:700; cursor:pointer; position:relative; }
.fil-onglet.on { background:rgba(217,169,78,.14); border-color:var(--ds-line,rgba(217,169,78,.3));
    color:var(--ds-brass-soft,#ecca82); }
.fil-onglet i { position:absolute; top:4px; right:6px; width:7px; height:7px;
    border-radius:50%; background:#d2624a; }
.fil-onglet i[hidden] { display:none; }

.fil-corps { flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch; padding:12px 14px;
    display:flex; flex-direction:column; gap:10px; }
.fil-msg { max-width:86%; }
.fil-msg.moi { align-self:flex-end; text-align:right; }
.fil-qui { font-size:.7rem; color:var(--ds-muted,#a08f74); margin-bottom:2px; }
.fil-txt { display:inline-block; padding:8px 11px; border-radius:13px; font-size:.88rem; line-height:1.45;
    background:rgba(255,255,255,.05); color:var(--ds-parchment,#efe4cf); text-align:left;
    overflow-wrap:anywhere; }
.fil-msg.moi .fil-txt { background:rgba(217,169,78,.16); }
.fil-depuis { display:flex; align-items:center; gap:8px; font-size:.66rem; color:var(--ds-muted,#a08f74); }
.fil-depuis::before, .fil-depuis::after { content:''; flex:1; height:1px; background:var(--ds-line,rgba(217,169,78,.25)); }
.fil-vide { margin:auto; text-align:center; font-size:.82rem; color:var(--ds-muted,#a08f74); line-height:1.6; }

/* ---- L'onglet Amis ---- */
.fil-section { margin:0; font-size:.64rem; text-transform:uppercase; letter-spacing:1px;
    color:var(--ds-muted,#a08f74); font-weight:700; }
.fil-gens { display:flex; flex-direction:column; gap:5px; }
.fil-gen { display:flex; align-items:center; gap:9px; width:100%; padding:9px 10px; border-radius:11px;
    background:rgba(255,255,255,.03); border:1px solid transparent;
    color:inherit; font-family:inherit; text-align:left; cursor:pointer; }
.fil-gen-bulle { flex:0 0 auto; width:30px; height:30px; border-radius:50%; display:grid; place-items:center;
    font-size:.95rem; background:rgba(217,169,78,.12); border:1px solid var(--ds-line,rgba(217,169,78,.25));
    overflow:hidden; }
.fil-gen-bulle img { width:100%; height:100%; object-fit:cover; }
.fil-gen-nom { flex:1; min-width:0; font-size:.86rem; font-weight:700;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.fil-gen-nom small { display:block; font-size:.66rem; font-weight:400; color:var(--ds-muted,#a08f74); }
.fil-pt { flex:0 0 auto; width:8px; height:8px; border-radius:50%; background:#d2624a; }
.fil-enligne { flex:0 0 auto; width:7px; height:7px; border-radius:50%; background:#5aa87a; }
.fil-act { flex:0 0 auto; padding:5px 10px; border-radius:999px; font-size:.7rem; font-weight:700;
    border:1px solid var(--ds-line,rgba(217,169,78,.3)); background:transparent;
    color:var(--ds-brass-soft,#ecca82); font-family:inherit; cursor:pointer; }
.fil-act.gris { color:var(--ds-muted,#a08f74); border-color:transparent; }
.fil-chercher { width:100%; }

.fil-bas { display:flex; gap:8px; padding:10px 12px calc(10px + env(safe-area-inset-bottom));
    border-top:1px solid var(--ds-line,rgba(217,169,78,.2)); }
.fil-bas[hidden] { display:none; }
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
        bulle.setAttribute('aria-label', 'Les conversations du salon');
        bulle.innerHTML = '💬<span class="fil-point" hidden></span>';
        bulle.addEventListener('click', () => ouvrir());
        document.body.appendChild(bulle);

        voile = document.createElement('div');
        voile.className = 'fil-voile';
        voile.hidden = true;                    // ⚠️ jamais sans `hidden`
        voile.innerHTML = `
            <div class="fil-feuille">
                <div class="fil-tete">
                    <button type="button" class="fil-retour" aria-label="Revenir" hidden>‹</button>
                    <span class="fil-titre">Le salon</span>
                    <button type="button" class="ds-icon-btn small fil-fermer" aria-label="Fermer">✕</button>
                </div>
                <div class="fil-onglets">
                    <button type="button" class="fil-onglet on" data-o="salon">Le salon</button>
                    <button type="button" class="fil-onglet" data-o="amis">Amis<i hidden></i></button>
                    <button type="button" class="fil-onglet" data-o="table" hidden>La table</button>
                </div>
                <div class="fil-corps"></div>
                <form class="fil-bas" autocomplete="off">
                    <input class="ds-input" type="text" maxlength="240" placeholder="Écrire au salon…"
                           aria-label="Ton message">
                    <button class="ds-btn small" type="submit">Envoyer</button>
                </form>
            </div>`;
        document.body.appendChild(voile);

        corps = voile.querySelector('.fil-corps');
        form = voile.querySelector('.fil-bas');
        champ = voile.querySelector('input');
        voile.querySelector('.fil-fermer').addEventListener('click', fermer);
        voile.querySelector('.fil-retour').addEventListener('click', () => { conversation = null; montrer('amis'); });
        voile.addEventListener('click', (e) => { if (e.target === voile) fermer(); });
        form.addEventListener('submit', envoyer);
        voile.querySelectorAll('.fil-onglet').forEach(b =>
            b.addEventListener('click', () => { conversation = null; montrer(b.dataset.o); }));
    }

    // ---------- Le rendu d'un fil de messages ----------
    // Les trois fils ont la même forme à une chose près : le salon et la
    // table nomment l'auteur par son pseudo (`u`), le privé par son
    // identifiant (`de`). `qui()` est le seul endroit qui le sait.
    function rendreMessages(messages, luJusqua, qui, vide) {
        if (!messages.length) { corps.innerHTML = `<p class="fil-vide">${vide}</p>`; return; }
        let trace = false;
        corps.innerHTML = messages.map(m => {
            const qn = qui(m);
            let avant = '';
            if (!trace && luJusqua && m.ts > luJusqua && !qn.moi) {
                trace = true;
                avant = `<div class="fil-depuis">nouveaux</div>`;
            }
            return avant + `
                <div class="fil-msg${qn.moi ? ' moi' : ''}">
                    <div class="fil-qui">${esc(qn.nom)} · ${quand(m.ts)}</div>
                    <div class="fil-txt">${m.t}</div>
                </div>`;
        }).join('');
        corps.scrollTop = corps.scrollHeight;
    }

    // ---------- Les vues ----------
    async function montrer(o) {
        onglet = o;
        voile.querySelectorAll('.fil-onglet').forEach(b => b.classList.toggle('on', b.dataset.o === o && !conversation));
        voile.querySelector('.fil-retour').hidden = !conversation;
        voile.querySelector('.fil-onglets').hidden = !!conversation;
        corps.innerHTML = `<p class="fil-vide">Un instant…</p>`;
        if (conversation) return vueConversation();
        if (o === 'amis') return vueAmis();
        if (o === 'table') return vueTable();
        return vueSalon();
    }

    async function vueSalon() {
        voile.querySelector('.fil-titre').textContent = 'Le salon';
        form.hidden = false;
        champ.placeholder = 'Écrire au salon…';
        const { ok, d } = await api('/api/fil');
        if (!ok) { corps.innerHTML = `<p class="fil-vide">Le fil n'a pas pu être chargé.</p>`; return; }
        moi = d.moi;
        rendreMessages(d.messages || [], d.luJusqua, m => ({ nom: m.u, moi: m.u === moi }),
            'Personne n\'a encore rien dit.<br>Commence, on te lira en passant.');
        rafraichirPoint();
    }

    async function vueTable() {
        if (!TABLE) return montrer('salon');
        voile.querySelector('.fil-titre').textContent = NOM_JEU[TABLE.jeu] || 'La table';
        form.hidden = false;
        champ.placeholder = 'Parler à la table…';
        const { ok, d } = await api(`/api/fil/table?jeu=${encodeURIComponent(TABLE.jeu)}&id=${encodeURIComponent(TABLE.id)}`);
        if (!ok) return;
        moi = d.moi;
        rendreMessages(d.messages || [], null, m => ({ nom: m.u, moi: m.u === moi }),
            'Rien de dit à cette table.<br>Ce qui s\'y écrit ne la suit pas.');
    }

    function bulleDe(g) {
        return `<span class="fil-gen-bulle">${g.avatarPhoto
            ? `<img src="${esc(g.avatarPhoto)}" alt="">` : esc(g.avatar || '✦')}</span>`;
    }

    async function vueAmis() {
        voile.querySelector('.fil-titre').textContent = 'Mes amis';
        form.hidden = true;
        const { ok, d } = await api('/api/amis');
        if (!ok) { corps.innerHTML = `<p class="fil-vide">Liste indisponible.</p>`; return; }
        monId = d.moi;
        const bouts = [];

        // ⚠️ Les demandes passent AVANT tout : quelqu'un attend une réponse.
        if (d.demandes.length) {
            bouts.push(`<p class="fil-section">${d.demandes.length} demande${d.demandes.length > 1 ? 's' : ''} d'ami</p>`);
            bouts.push(`<div class="fil-gens">` + d.demandes.map(g => `
                <div class="fil-gen">
                    ${bulleDe(g)}
                    <span class="fil-gen-nom">${esc(g.pseudo)}<small>veut être ton ami</small></span>
                    <button type="button" class="fil-act" data-accepter="${esc(g.id)}">Accepter</button>
                    <button type="button" class="fil-act gris" data-refuser="${esc(g.id)}">Non</button>
                </div>`).join('') + `</div>`);
        }

        bouts.push(`<p class="fil-section">Mes amis${d.amis.length ? ` (${d.amis.length})` : ''}</p>`);
        bouts.push(d.amis.length
            ? `<div class="fil-gens">` + d.amis.map(g => `
                <button type="button" class="fil-gen" data-ouvrir="${esc(g.id)}" data-nom="${esc(g.pseudo)}">
                    ${bulleDe(g)}
                    <span class="fil-gen-nom">${esc(g.pseudo)}</span>
                    ${g.enLigne ? '<span class="fil-enligne"></span>' : ''}
                    ${g.nonLus ? '<span class="fil-pt"></span>' : ''}
                </button>`).join('') + `</div>`
            : `<p class="fil-vide">Personne pour l'instant.<br>Tout le salon est en dessous.</p>`);

        bouts.push(`<button type="button" class="ds-btn ghost small fil-chercher" id="fil-chercher">Chercher quelqu'un</button>`);
        corps.innerHTML = bouts.join('');
        corps.scrollTop = 0;

        corps.querySelectorAll('[data-accepter]').forEach(b => b.addEventListener('click', async () => {
            await api('/api/amis/accepter', { id: b.dataset.accepter }); vueAmis(); rafraichirPoint();
        }));
        corps.querySelectorAll('[data-refuser]').forEach(b => b.addEventListener('click', async () => {
            await api('/api/amis/refuser', { id: b.dataset.refuser }); vueAmis(); rafraichirPoint();
        }));
        corps.querySelectorAll('[data-ouvrir]').forEach(b => b.addEventListener('click', () => {
            conversation = { id: b.dataset.ouvrir, pseudo: b.dataset.nom };
            montrer('amis');
        }));
        document.getElementById('fil-chercher').addEventListener('click', vueSalonEntier);
    }

    // Tout le salon. ⚠️ Aucune recherche côté serveur : à trente-deux comptes,
    // la liste entière pèse moins qu'une requête par frappe.
    async function vueSalonEntier() {
        voile.querySelector('.fil-titre').textContent = 'Tout le salon';
        form.hidden = true;
        const { ok, d } = await api('/api/amis/salon');
        if (!ok) return;
        const ETAT = {
            ami: '<span class="fil-act gris">ami</span>',
            'demande-envoyee': '<span class="fil-act gris">demandé</span>',
        };
        corps.innerHTML = `
            <input class="ds-input" id="fil-filtre" type="text" placeholder="Filtrer…" autocomplete="off">
            <div class="fil-gens" id="fil-tout"></div>`;
        const dessiner = (q) => {
            const n = (q || '').toLowerCase();
            document.getElementById('fil-tout').innerHTML = d.gens
                .filter(g => !n || g.pseudo.toLowerCase().includes(n))
                .map(g => `
                <div class="fil-gen">
                    ${bulleDe(g)}
                    <span class="fil-gen-nom">${esc(g.pseudo)}</span>
                    ${g.enLigne ? '<span class="fil-enligne"></span>' : ''}
                    <button type="button" class="fil-act" data-ecrire="${esc(g.id)}" data-nom="${esc(g.pseudo)}">Écrire</button>
                    ${ETAT[g.etat] || (g.etat === 'demande-recue'
                        ? `<button type="button" class="fil-act" data-accepter2="${esc(g.id)}">Accepter</button>`
                        : `<button type="button" class="fil-act" data-ajouter="${esc(g.id)}">+ Ami</button>`)}
                </div>`).join('') || `<p class="fil-vide">Personne de ce nom.</p>`;
            brancherTout();
        };
        const brancherTout = () => {
            corps.querySelectorAll('[data-ajouter]').forEach(b => b.addEventListener('click', async () => {
                await api('/api/amis/demander', { id: b.dataset.ajouter });
                b.outerHTML = '<span class="fil-act gris">demandé</span>';
            }));
            corps.querySelectorAll('[data-accepter2]').forEach(b => b.addEventListener('click', async () => {
                await api('/api/amis/accepter', { id: b.dataset.accepter2 });
                b.outerHTML = '<span class="fil-act gris">ami</span>'; rafraichirPoint();
            }));
            corps.querySelectorAll('[data-ecrire]').forEach(b => b.addEventListener('click', () => {
                conversation = { id: b.dataset.ecrire, pseudo: b.dataset.nom };
                montrer('amis');
            }));
        };
        dessiner('');
        document.getElementById('fil-filtre').addEventListener('input', (e) => dessiner(e.target.value));
    }

    async function vueConversation() {
        voile.querySelector('.fil-titre').textContent = conversation.pseudo;
        form.hidden = false;
        champ.placeholder = `Écrire à ${conversation.pseudo}…`;
        const { ok, d } = await api('/api/mp?id=' + encodeURIComponent(conversation.id));
        if (!ok) { corps.innerHTML = `<p class="fil-vide">Conversation introuvable.</p>`; return; }
        monId = d.moi;
        rendreMessages(d.messages || [], d.luJusqua,
            m => ({ nom: m.de === monId ? 'moi' : conversation.pseudo, moi: m.de === monId }),
            `Rien encore entre vous.<br>Écris le premier mot.`);
        rafraichirPoint();
        setTimeout(() => { try { champ.focus(); } catch (e) {} }, 100);
    }

    // ---------- Écrire ----------
    async function envoyer(e) {
        e.preventDefault();
        const txt = champ.value.trim();
        if (!txt) return;
        champ.value = '';
        let r;
        if (conversation) r = await api('/api/mp', { id: conversation.id, text: txt });
        else if (onglet === 'table' && TABLE) r = await api('/api/fil/table', { jeu: TABLE.jeu, id: TABLE.id, text: txt });
        else r = await api('/api/fil', { text: txt });
        if (!r.ok) {
            if (window.DS) DS.toast((r.d && r.d.error) || 'Message refusé.');
            champ.value = txt;
            return;
        }
        if (conversation) {
            rendreMessages(r.d.messages || [], null,
                m => ({ nom: m.de === monId ? 'moi' : conversation.pseudo, moi: m.de === monId }), '');
        } else {
            rendreMessages(r.d.messages || [], null, m => ({ nom: m.u, moi: m.u === moi }), '');
        }
    }

    // ---------- Ouvrir / fermer ----------
    async function ouvrir(o) {
        if (!voile) return;
        ouvert = true;
        voile.hidden = false;
        requestAnimationFrame(() => voile.classList.add('on'));
        rejoindre();
        await montrer(o || (TABLE ? 'table' : 'salon'));
        if (!conversation && onglet !== 'amis') {
            setTimeout(() => { try { champ.focus(); } catch (e) {} }, 120);
        }
        // ⚠️ L'accueil ne charge pas socket.io, et c'est la page où la bulle
        // est le plus présente : sans filet, on aurait une conversation
        // ouverte qui ne bouge pas pendant qu'on vous écrit. Cinq secondes,
        // UNIQUEMENT tant que la feuille est ouverte, et seulement faute de
        // socket.
        if (!sock && !sondage) sondage = setInterval(rafraichirVue, 5000);
    }

    function rafraichirVue() {
        if (!ouvert) return;
        const colleEnBas = corps.scrollHeight - corps.scrollTop - corps.clientHeight < 40;
        if (!colleEnBas) return;        // quelqu'un remonte lire : on ne le dérange pas
        if (conversation) vueConversation();
        else if (onglet === 'salon') vueSalon();
        else if (onglet === 'table') vueTable();
    }

    function fermer() {
        ouvert = false;
        conversation = null;
        if (!voile) return;
        voile.classList.remove('on');
        setTimeout(() => { if (!ouvert) voile.hidden = true; }, 200);
        if (sondage) { clearInterval(sondage); sondage = null; }
        try { if (sock) { sock.emit('fil_leave'); if (TABLE) sock.emit('tfil_leave', TABLE); } } catch (e) {}
        rafraichirPoint();
    }

    // ---------- Le direct ----------
    // ⚠️ Mesuré sur la page du Yams : deux appels à `io()` donnent deux
    // sockets distincts — la connexion n'est pas mutualisée ici. On n'en
    // ouvre donc un que pendant la lecture, et le point rouge, lui, se
    // demande en HTTP (voir `rafraichirPoint`).
    function rejoindre() {
        if (!window.io) return;
        try {
            if (!sock) {
                sock = window.filSocket || io();
                window.filSocket = sock;
                sock.on('fil_message', () => { if (ouvert && !conversation && onglet === 'salon') vueSalon(); else rafraichirPoint(); });
                sock.on('tfil_message', () => { if (ouvert && onglet === 'table') vueTable(); });
                sock.on('mp_message', (e) => {
                    if (ouvert && conversation && e && e.avec === conversation.id) vueConversation();
                    else rafraichirPoint();
                });
                sock.on('amis_bouge', () => { if (ouvert && onglet === 'amis' && !conversation) vueAmis(); else rafraichirPoint(); });
            }
            sock.emit('fil_join');
            if (TABLE) sock.emit('tfil_join', TABLE);
        } catch (e) {}
    }

    // ---------- Le point rouge ----------
    function majPoint(n, demandes) {
        nonLus = Math.max(0, n | 0);
        if (!bulle) return;
        bulle.querySelector('.fil-point').hidden = !nonLus;
        bulle.setAttribute('aria-label', nonLus
            ? 'Les conversations du salon — du nouveau' : 'Les conversations du salon');
        const i = voile && voile.querySelector('.fil-onglet[data-o="amis"] i');
        if (i) i.hidden = !demandes;
    }

    // ⚠️ Le point additionne LES TROIS SOURCES : le fil du salon, les
    // messages privés et les demandes d'ami. Un point par fil obligerait à
    // ouvrir la feuille pour savoir lequel a bougé ; un point qui en oublie
    // un laisserait une demande en attente pour toujours.
    async function rafraichirPoint() {
        try {
            const [a, b] = await Promise.all([api('/api/fil/nonlus'), api('/api/amis/nonlus')]);
            const f = (a.ok && a.d.nonLus) || 0;
            const p = (b.ok && b.d.nonLus) || 0;
            const dem = (b.ok && b.d.demandes) || 0;
            majPoint(ouvert ? dem : f + p + dem, dem);
        } catch (e) {}
    }

    // ---------- Où la bulle se montre ----------
    // Sur une page de jeu, elle vit du hall à la fin de la partie. Les vues
    // se basculent par l'attribut `hidden` dans les six jeux (vérifié), un
    // observateur suffit donc et aucune app n'a rien à appeler.
    // ⚠️ L'en-tête se trouve par `[class$="-head"]` : les six jeux nomment le
    // leur `ym-head`, `pb-head`, `uc-head`, `pe-head`, `qz-head`, `mp-head`.
    // C'est un motif, pas une classe commune — mais c'en est un fiable, et il
    // évite d'avoir à toucher six fichiers HTML pour y poser un conteneur.
    function placer(enPartie) {
        const entete = enPartie ? document.querySelector('[class$="-head"]') : null;
        if (entete) {
            if (bulle.parentElement !== entete) {
                entete.appendChild(bulle);
                bulle.classList.add('dans-entete');
            }
        } else if (bulle.parentElement !== document.body) {
            document.body.appendChild(bulle);
            bulle.classList.remove('dans-entete');
        }
    }

    function suivreLesVues() {
        const vues = ['v-lobby', 'v-waiting', 'v-game', 'v-ended', 'v-speaking', 'v-voting',
                      'v-writing', 'v-parallel', 'v-round-end', 'v-result', 'v-spectator']
            .map(id => document.getElementById(id)).filter(Boolean);
        if (!vues.length) return;
        // Le hall et la salle d'attente n'ont rien de dense à couvrir : la
        // bulle y flotte. Tout le reste est une partie en cours.
        const HALL = ['v-lobby', 'v-waiting'];
        const relire = () => {
            const montrees = vues.filter(v => !v.hidden);
            bulle.hidden = !montrees.length;
            if (!montrees.length && ouvert) fermer();
            placer(montrees.some(v => !HALL.includes(v.id)));
        };
        const obs = new MutationObserver(relire);
        for (const v of vues) obs.observe(v, { attributes: true, attributeFilter: ['hidden'] });
        relire();
    }

    creer();
    if (mode === 'jeu' || mode === 'attente') suivreLesVues();

    rafraichirPoint();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) rafraichirPoint(); });
    setInterval(() => { if (!document.hidden && !ouvert) rafraichirPoint(); }, 60000);

    window.Fil = {
        ouvrir, fermer,
        // Le pouls de l'accueil peut poser le compte sans requête de plus.
        compteur: (n, dem) => majPoint(n, dem),
        // Un jeu dit à quelle table il est — et `null` en sortant. C'est ce
        // qui fait apparaître l'onglet « La table ».
        table(t) {
            const jeu = jeuDeLaPage();
            const neuf = (t && jeu) ? { jeu, id: String(t.id || t) } : null;
            const change = JSON.stringify(neuf) !== JSON.stringify(TABLE);
            if (!change) return;
            if (TABLE && sock) { try { sock.emit('tfil_leave', TABLE); } catch (e) {} }
            TABLE = neuf;
            const b = voile && voile.querySelector('.fil-onglet[data-o="table"]');
            if (b) b.hidden = !TABLE;
            if (TABLE && sock) { try { sock.emit('tfil_join', TABLE); } catch (e) {} }
            // On ne quitte pas la table sous les yeux de quelqu'un qui y lit :
            // on le ramène simplement au salon.
            if (!TABLE && ouvert && onglet === 'table') montrer('salon');
        },
        // Ouvrir directement une conversation — c'est ce que fait le bouton
        // « Écrire » de la bulle de profil.
        ecrireA(id, pseudo) {
            conversation = { id, pseudo };
            ouvrir('amis');
        },
    };
})();
