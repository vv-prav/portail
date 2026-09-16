// =====================================================================
//  MON STYLE — le coin de personnalisation du salon
//
//  Il y avait trois façons de changer un style, et aucune ne se
//  ressemblait : un bouton « Style des dés » dans le Yams, un bouton
//  « Style des tuiles » dans le Motus, et une page /profil/style/ qui
//  recopiait les deux catalogues pour les afficher une troisième fois.
//  Perudo, lui, n'avait rien — alors qu'il lance les mêmes dés.
//
//  Ce fichier est LE coin de style : un catalogue, un rendu, un geste.
//
//   • le catalogue (`REGLAGES` ci-dessous) est la seule liste de ce qui
//     se personnalise dans le salon ;
//   • `rendre()` en est le seul dessin — la feuille ouverte depuis un jeu
//     et la page du profil sont deux HÔTES du même rendu, pas deux
//     implémentations ;
//   • le bouton s'injecte seul dans le hall des jeux (`#v-lobby`), comme
//     le fait `invitation.js` dans la salle d'attente : aucune app n'a de
//     HTML à ajouter, et un jeu qui gagne un réglage gagne son bouton le
//     jour où on ajoute la ligne au catalogue.
//
//  ⚠️ Le bouton n'apparaît QUE si le jeu a quelque chose à personnaliser.
//  Un bouton qui ouvre « rien à régler ici » est pire que pas de bouton.
//
//  POUR AJOUTER UN RÉGLAGE — c'est le seul geste à connaître, et il est
//  prévu pour être fréquent : une entrée dans `REGLAGES`, rien d'autre.
//  Elle apparaît aussitôt dans le profil, dans le hall des jeux concernés,
//  et s'applique au chargement de toutes les pages qui chargent ce fichier.
//  Un réglage qui vaut pour tout le salon prend `portee: 'partout'` et se
//  range dans sa propre section, au-dessus des jeux.
//
//  Usage :
//      Style.ouvrir('yams')        → la feuille, réduite à ce jeu
//      Style.ouvrir()              → tout le coin
//      Style.rendre(element)       → le même rendu dans une page
//      Style.valeur('des')         → la valeur courante d'un réglage
//      Style.surChangement(fn)     → pour se redessiner sans recharger
//      Style.etat({victoires, yams}) → nourrir les verrous sans attendre
//                                      l'appel réseau (le jeu sait déjà)
// =====================================================================
(function () {
    if (window.Style) return;

    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // Les jeux du salon, dans l'ordre où leurs sections s'affichent. Un jeu
    // sans réglage ne produit aucune section et aucun bouton : il est listé
    // ici d'avance pour que lui en donner un tienne vraiment en une ligne.
    const JEUX = {
        yams:       { nom: 'Yams', emoji: '🎲' },
        perudo:     { nom: 'Perudo', emoji: '🏴‍☠️' },
        motus:      { nom: 'Motus', emoji: '🟨' },
        pbac:       { nom: 'Petit Bac', emoji: '✏️' },
        undercover: { nom: 'Infiltré', emoji: '🕵️' },
        drapeaux:   { nom: 'Quiz des drapeaux', emoji: '🚩' },
    };

    const TUILES = {
        classique: { nom: 'Classique', correct: '#5aa87a', present: '#c9a24a', absent: '#3a3024' },
        ocean:     { nom: 'Océan',     correct: '#3a9bc9', present: '#5ac9c2', absent: '#1f3a4a' },
        coucher:   { nom: 'Coucher de soleil', correct: '#d9793a', present: '#e0a83e', absent: '#4a2a1f' },
        violet:    { nom: 'Violet',    correct: '#8a6bc9', present: '#c98bd9', absent: '#2f2340' },
    };

    function lire(cle, defaut) {
        try { const v = localStorage.getItem(cle); return v === null ? defaut : v; } catch (e) { return defaut; }
    }
    function ecrire(cle, v) { try { localStorage.setItem(cle, v); } catch (e) {} }

    // -----------------------------------------------------------------
    //  Ce que le joueur a débloqué
    //
    //  ⚠️ Un dé appartient au JOUEUR, pas à un jeu : les victoires du Yams
    //  et celles du Perudo comptent ensemble. C'est la suite logique de
    //  `des.js` — le même dé aux deux tables, donc le même compteur.
    // -----------------------------------------------------------------
    let etat = { victoires: 0, yams: 0, connu: false };
    let enCours = null;
    function charger() {
        if (enCours) return enCours;
        enCours = fetch('/api/salon/profile').then(r => r.json()).then(d => {
            const y = (d && d.yams) || {}, p = (d && d.perudo) || {};
            etat = { victoires: (y.gamesWon || 0) + (p.victoires || 0), yams: y.totalYams || 0, connu: true };
        }).catch(() => {
            // Réseau coupé : on garde ce qu'on sait déjà plutôt que de
            // reverrouiller des dés que le joueur a gagnés.
            enCours = null;
        });
        return enCours;
    }
    function poserEtat(e) {
        if (!e) return;
        if (typeof e.victoires === 'number') etat.victoires = Math.max(etat.victoires, e.victoires);
        if (typeof e.yams === 'number') etat.yams = Math.max(etat.yams, e.yams);
        etat.connu = true;
        redessiner();
    }

    // =================================================================
    //  LE CATALOGUE — la seule liste de ce qui se personnalise
    // =================================================================
    const REGLAGES = [
        {
            id: 'des',
            nom: 'Les dés',
            portee: ['yams', 'perudo'],
            cle: 'yams_dice_skin',            // ⚠️ nom historique, voir des.js
            defaut: 'classic',
            genre: 'grille',
            aide: 'Ton dé est le même au Yams et au Perudo. Certains se débloquent avec tes victoires ou tes Yams.',
            options() {
                const cat = (window.Des && Des.catalogue()) || {};
                return Object.entries(cat).map(([id, d]) => ({
                    id,
                    nom: d.nom || d.name,
                    apercu: window.Des ? Des.face(1, { skin: id, classe: 'sty-de' }) : '',
                    verrou: typeof d.winsRequired === 'number'
                        ? (etat.victoires >= d.winsRequired ? null : d.winsRequired + ' victoires')
                        : typeof d.yamsRequired === 'number'
                            ? (etat.yams >= d.yamsRequired ? null : d.yamsRequired + ' Yams')
                            : null,
                }));
            },
        },
        {
            id: 'tuiles',
            nom: 'Les tuiles',
            portee: ['motus'],
            cle: 'motus_tile_theme',
            defaut: 'classique',
            genre: 'grille',
            aide: 'La couleur des indices dans la grille du jour.',
            options() {
                return Object.entries(TUILES).map(([id, t]) => ({
                    id, nom: t.nom,
                    apercu: '<span class="sty-tuiles">'
                        + `<span style="background:${t.correct}"></span>`
                        + `<span style="background:${t.present}"></span>`
                        + `<span style="background:${t.absent}"></span></span>`,
                }));
            },
            // Appliqué au chargement de la page, avant tout rendu de grille :
            // sinon on voit un éclair de couleur par défaut.
            appliquer(v) {
                const t = TUILES[v] || TUILES.classique;
                const r = document.documentElement.style;
                r.setProperty('--correct', t.correct);
                r.setProperty('--present', t.present);
                r.setProperty('--absent', t.absent);
            },
        },
        {
            id: 'son-yams',
            nom: 'Les sons du Yams',
            portee: ['yams'],
            cle: 'yams_son',
            defaut: '1',
            genre: 'bascule',
            aide: 'Le roulement des dés, le claquement, la fanfare du Yams.',
            // La valeur stockée est celle d'avant ce fichier : tout ce qui
            // n'est pas « 0 » veut dire que le son est actif.
            actif: (v) => v !== '0',
        },
    ];

    const parId = (id) => REGLAGES.find(r => r.id === id);
    const pourJeu = (jeu) => !jeu ? REGLAGES.slice()
        : REGLAGES.filter(r => r.portee === 'partout' || (Array.isArray(r.portee) && r.portee.indexOf(jeu) >= 0));

    function valeur(id) {
        const r = parId(id);
        return r ? lire(r.cle, r.defaut) : null;
    }
    function poser(id, v) {
        const r = parId(id);
        if (!r) return false;
        ecrire(r.cle, v);
        if (r.appliquer) r.appliquer(v);
        if (r.id === 'des' && window.Des) Des.choisir(v);
        prevenir(r.id, v);
        return true;
    }

    // -----------------------------------------------------------------
    //  Qui veut être prévenu
    // -----------------------------------------------------------------
    const abonnes = [];
    function surChangement(fn) { if (typeof fn === 'function') abonnes.push(fn); }
    function prevenir(id, v) {
        abonnes.forEach(fn => { try { fn(id, v); } catch (e) {} });
        redessiner();
    }

    // =================================================================
    //  LE RENDU — un seul, pour la feuille comme pour la page
    // =================================================================
    const hotes = [];        // {el, jeu} — redessinés à chaque changement

    function carteHtml(reg, opt, courant) {
        const choisi = opt.id === courant;
        const bloque = !!opt.verrou;
        return '<button type="button" class="sty-carte' + (choisi ? ' on' : '') + (bloque ? ' verrou' : '') + '"'
            + ' data-reglage="' + esc(reg.id) + '" data-val="' + esc(opt.id) + '"' + (bloque ? ' disabled' : '')
            + (choisi ? ' aria-current="true"' : '') + '>'
            + '<span class="sty-apercu">' + (opt.apercu || '') + '</span>'
            + '<span class="sty-carte-nom">' + esc(opt.nom) + '</span>'
            + (bloque ? '<span class="sty-carte-verrou">🔒 ' + esc(opt.verrou) + '</span>' : '')
            + '</button>';
    }

    function reglageHtml(reg) {
        const courant = lire(reg.cle, reg.defaut);
        let corps;
        if (reg.genre === 'bascule') {
            const on = reg.actif ? reg.actif(courant) : courant !== '0';
            corps = '<button type="button" class="sty-bascule' + (on ? ' on' : '') + '"'
                + ' data-reglage="' + esc(reg.id) + '" data-bascule="1" role="switch" aria-checked="' + (on ? 'true' : 'false') + '">'
                + '<span class="sty-bascule-piste"><span class="sty-bascule-pion"></span></span>'
                + '<span class="sty-bascule-etat">' + (on ? 'Activé' : 'Coupé') + '</span></button>';
        } else {
            const opts = reg.options();
            // Un réglage dont le catalogue n'est pas chargé sur cette page ne
            // s'affiche pas du tout : une grille vide sous un titre laisse
            // croire à une panne.
            if (!opts.length) return '';
            corps = '<div class="sty-grille">' + opts.map(o => carteHtml(reg, o, courant)).join('') + '</div>';
        }
        return '<div class="sty-reglage">'
            + '<p class="sty-nom">' + esc(reg.nom) + '</p>'
            + (reg.aide ? '<p class="sty-aide">' + esc(reg.aide) + '</p>' : '')
            + corps + '</div>';
    }

    // Le titre d'une section : les jeux que le réglage concerne.
    // ⚠️ Un réglage partagé n'apparaît qu'UNE fois. La première version le
    // répétait sous chaque jeu concerné — le catalogue des quarante-sept dés
    // s'affichait donc deux fois de suite dans la page, à l'identique. Ce
    // qu'on gagnait en « voilà ce qui se règle au Perudo » se perdait dix
    // fois en longueur de page.
    function titreDe(portee) {
        if (portee === 'partout') return '🏛️ Partout dans le salon';
        const noms = Object.keys(JEUX).filter(id => portee.indexOf(id) >= 0);
        if (!noms.length) return '🎨 Le salon';
        const libelles = noms.map(id => esc(JEUX[id].nom));
        const liste = libelles.length > 1
            ? libelles.slice(0, -1).join(', ') + ' et ' + libelles[libelles.length - 1]
            : libelles[0];
        return JEUX[noms[0]].emoji + ' ' + liste;
    }

    // Filtré sur un jeu, il n'y a qu'une section et pas de titre à lire :
    // la question est déjà posée par le bouton sur lequel on a appuyé.
    function corpsHtml(jeu) {
        const liste = pourJeu(jeu);
        const rien = '<p class="sty-vide">Rien à personnaliser ici pour l’instant.</p>';
        if (jeu) return liste.map(reglageHtml).join('') || rien;

        // Un groupe par portée, dans l'ordre des jeux ; « partout » en tête.
        const groupes = [];
        liste.forEach(r => {
            const cle = r.portee === 'partout' ? 'partout' : r.portee.slice().sort().join('+');
            let g = groupes.find(x => x.cle === cle);
            if (!g) groupes.push(g = { cle, portee: r.portee, regs: [] });
            g.regs.push(r);
        });
        const rang = (g) => g.portee === 'partout' ? -1
            : Math.min.apply(null, g.portee.map(id => Object.keys(JEUX).indexOf(id)).filter(i => i >= 0).concat([99]));
        groupes.sort((a, b) => rang(a) - rang(b));

        const html = groupes.map(g => {
            const dedans = g.regs.map(reglageHtml).join('');
            if (!dedans) return '';           // pas de titre sans contenu
            return '<section class="sty-groupe"><h3 class="sty-groupe-titre">' + titreDe(g.portee) + '</h3>' + dedans + '</section>';
        }).join('');
        return html || '<p class="sty-vide">Rien à personnaliser pour l’instant.</p>';
    }

    function brancher(el) {
        if (el.dataset.styBranche) return;
        el.dataset.styBranche = '1';
        el.addEventListener('click', (ev) => {
            const b = ev.target.closest('[data-reglage]');
            if (!b || b.disabled) return;
            const reg = parId(b.dataset.reglage);
            if (!reg) return;
            if (b.dataset.bascule) {
                const on = (reg.actif ? reg.actif(lire(reg.cle, reg.defaut)) : lire(reg.cle, reg.defaut) !== '0');
                poser(reg.id, on ? '0' : '1');
                return;
            }
            poser(reg.id, b.dataset.val);
            const opt = reg.options().find(o => o.id === b.dataset.val);
            if (window.DS && opt) DS.toast(opt.nom + ' appliqué ✓');
        });
    }

    function rendre(el, jeu) {
        if (!el) return;
        el.innerHTML = corpsHtml(jeu || null);
        brancher(el);
        if (!hotes.some(h => h.el === el)) hotes.push({ el, jeu: jeu || null });
        // Les verrous dépendent de statistiques qu'on n'a peut-être pas
        // encore : on dessine tout de suite, on re-dessine à l'arrivée.
        if (!etat.connu) charger().then(redessiner);
    }

    function redessiner() {
        hotes.forEach(h => {
            if (!document.body.contains(h.el)) return;
            h.el.innerHTML = corpsHtml(h.jeu);
        });
    }

    // =================================================================
    //  LA FEUILLE — un hôte parmi d'autres
    // =================================================================
    let voile = null, corps = null, titre = null, lienTout = null, jeuOuvert = null;

    function creerVoile() {
        if (voile) return voile;
        voile = document.createElement('div');
        voile.className = 'ds-overlay';
        voile.id = 'sty-ov';
        // ⚠️ Un overlay créé en JS doit NAÎTRE caché : la règle
        // `.ds-overlay:not([hidden])` le rendrait visible en permanence,
        // c'est-à-dire un voile plein écran qui avale tous les clics.
        voile.hidden = true;
        voile.innerHTML = '<div class="ds-card tall">'
            + '<button type="button" class="ds-card-close" id="sty-close" aria-label="Fermer">✕</button>'
            + '<h2 class="ds-card-title" id="sty-titre">Mon style</h2>'
            + '<div id="sty-corps"></div>'
            + '<button type="button" class="ds-btn ghost small" id="sty-tout">Tout le style du salon ›</button>'
            + '</div>';
        document.body.appendChild(voile);
        corps = voile.querySelector('#sty-corps');
        titre = voile.querySelector('#sty-titre');
        lienTout = voile.querySelector('#sty-tout');
        voile.querySelector('#sty-close').addEventListener('click', fermer);
        lienTout.addEventListener('click', () => ouvrir(null));
        voile.addEventListener('click', (e) => { if (e.target === voile) fermer(); });
        return voile;
    }

    function ouvrir(jeu) {
        creerVoile();
        jeuOuvert = jeu || null;
        titre.textContent = jeuOuvert && JEUX[jeuOuvert] ? 'Le style du ' + JEUX[jeuOuvert].nom : 'Mon style';
        lienTout.hidden = !jeuOuvert;
        const i = hotes.findIndex(h => h.el === corps);
        if (i >= 0) hotes.splice(i, 1);
        rendre(corps, jeuOuvert);
        voile.hidden = false;
    }
    function fermer() { if (voile) voile.hidden = true; }

    // =================================================================
    //  LE BOUTON — posé seul dans le hall du jeu
    // =================================================================
    function bouton(jeu, cible) {
        const hote = cible || document.getElementById('v-lobby');
        if (!hote || !pourJeu(jeu).length) return null;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ds-btn ghost sty-btn';
        b.textContent = '🎨 Mon style';
        b.addEventListener('click', () => ouvrir(jeu));
        // Sous les boutons de création : on règle son style avant de créer
        // une table, pas au milieu de la liste de celles qui attendent.
        const avant = hote.querySelector('#btn-stats, #btn-classement, #btn-leaderboard');
        if (avant) avant.insertAdjacentElement('afterend', b);
        else hote.appendChild(b);
        return b;
    }

    // Le jeu se nomme lui-même : `<body data-jeu="yams">` ou Style.auto('yams').
    function auto(jeu) {
        const nom = jeu || document.body.getAttribute('data-jeu');
        if (!nom) return;
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => bouton(nom));
        else bouton(nom);
    }

    // Les réglages qui agissent sur la page (les couleurs de tuiles) sont
    // appliqués dès le chargement du fichier — donc avant le rendu du jeu.
    REGLAGES.forEach(r => { if (r.appliquer) r.appliquer(lire(r.cle, r.defaut)); });

    window.Style = {
        reglages: pourJeu, valeur, poser, rendre, ouvrir, fermer,
        bouton, auto, surChangement, etat: poserEtat,
    };
    auto();
})();

/* Le style du coin de style. Gardé ici pour que le composant reste
   autonome : une app qui charge ce fichier n'a ni HTML ni CSS à ajouter. */
(function () {
    if (document.getElementById('sty-style')) return;
    const s = document.createElement('style');
    s.id = 'sty-style';
    s.textContent = [
        '.sty-groupe{margin:0 0 18px}',
        '.sty-groupe-titre{margin:0 0 8px;font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;opacity:.6}',
        '.sty-reglage{margin:0 0 16px;text-align:left}',
        '.sty-nom{margin:0;font-weight:700;font-size:.98rem}',
        '.sty-aide{margin:2px 0 8px;font-size:.82rem;opacity:.7;line-height:1.35}',
        /* Le catalogue des dés fait quarante-sept entrees : sans plafond, il
           pousse tout le reste du coin hors de portee du pouce. */
        '.sty-grille{display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:8px;max-height:44vh;overflow-y:auto;padding:2px}',
        '.sty-carte{display:flex;flex-direction:column;align-items:center;gap:5px;padding:9px 5px;border:1px solid rgba(255,255,255,.14);border-radius:12px;background:rgba(255,255,255,.04);color:inherit;font:inherit;cursor:pointer}',
        '.sty-carte.on{border-color:var(--brass,#d9a94e);background:rgba(217,169,78,.16)}',
        '.sty-carte.verrou{opacity:.45;cursor:not-allowed}',
        '.sty-apercu{display:flex;align-items:center;justify-content:center;width:40px;height:40px}',
        '.sty-apercu .sty-de{width:40px;height:40px}',
        '.sty-carte-nom{font-size:.74rem;text-align:center;line-height:1.2}',
        '.sty-carte-verrou{font-size:.66rem;opacity:.8}',
        '.sty-tuiles{display:flex;gap:3px}',
        '.sty-tuiles span{width:11px;height:26px;border-radius:3px}',
        '.sty-bascule{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid rgba(255,255,255,.14);border-radius:12px;background:rgba(255,255,255,.04);color:inherit;font:inherit;cursor:pointer;width:100%}',
        '.sty-bascule-piste{position:relative;width:42px;height:24px;border-radius:12px;background:rgba(255,255,255,.18);flex:none;transition:background .15s}',
        '.sty-bascule-pion{position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:left .15s}',
        '.sty-bascule.on .sty-bascule-piste{background:var(--brass,#d9a94e)}',
        '.sty-bascule.on .sty-bascule-pion{left:21px}',
        '.sty-bascule-etat{font-size:.86rem}',
        '.sty-vide{opacity:.7;font-size:.9rem}',
        '#sty-tout{margin-top:6px}',
    ].join('');
    document.head.appendChild(s);
})();
