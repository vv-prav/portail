// =====================================================================
//  LE SOCLE COMMUN DES PAGES DE GÉOGRAPHIE — window.Geo
//
//  Cinq jeux du jour tournent autour des mêmes données, et leurs pages
//  réécrivaient chacune les mêmes morceaux : le chronomètre formaté, le
//  classement du jour, et jusqu'à trois façons de montrer une direction.
//  Tout ce qui doit se ressembler d'un jeu à l'autre vit ici.
//
//  S'auto-injecte comme `design-system.js` : aucune page n'a de HTML à
//  ajouter. Il suffit de charger le fichier.
//
//  Expose :
//    · Geo.temps(ms)                — « 2:07 »
//    · Geo.classement(boîte, …)     — le classement du jour, partout pareil
//    · Geo.rose({angle, mot, depuis}) — LA rose des vents de la famille
//    · Geo.fiche(pays)              — la fiche d'un pays, en fin de manche
//    · Geo.carte(hôte, options)     — la carte du monde, avec zoom et glissé
// =====================================================================
(function () {
    if (window.Geo) return;

    const esc = (s) => String(s == null ? '' : s)
        .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const NOMBRE = new Intl.NumberFormat('fr-FR');

    function temps(ms) {
        if (ms == null) return '';
        const s = Math.max(0, Math.round(ms / 1000));
        return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    }

    // ---------------------------------------------------------------
    //  LE CLASSEMENT DU JOUR
    //  Il était écrit trois fois, à trois endroits, avec trois classes
    //  différentes pour exactement le même tableau.
    // ---------------------------------------------------------------
    // `sansTemps` : certains jeux n'ont pas de durée à montrer. Au chrono,
    // `ms` porte l'ÉCART, déjà écrit dans le détail — l'afficher une seconde
    // fois en « 0:03 » ne dit rien et sème le doute.
    function classement(hote, liste, maPlace, detail, sansTemps) {
        if (!hote) return;
        if (!liste || !liste.length) { hote.innerHTML = ''; return; }
        const medaille = ['🥇', '🥈', '🥉'];
        hote.innerHTML = '<p class="geo-board-titre">Le classement du jour</p>'
            + liste.map((e, i) => `
                <button type="button" class="geo-board-row${i + 1 === maPlace ? ' moi' : ''}" data-view="${esc(e.u)}">
                    <span class="geo-b-rang">${medaille[i] || (i + 1)}</span>
                    <span class="ds-avatar xs" data-p="${esc(e.u)}"></span>
                    <span class="geo-b-nom">${esc(e.u)}</span>
                    <span class="geo-b-detail">${esc(detail ? detail(e) : (e.trouve === false ? '✗' : (e.essais || '') + '/6'))}</span>
                    <span class="geo-b-temps">${sansTemps ? '' : temps(e.ms)}</span>
                </button>`).join('');
        if (window.PortailProfile) {
            hote.querySelectorAll('[data-view]').forEach(b =>
                b.addEventListener('click', () => PortailProfile.open(b.dataset.view)));
            PortailProfile.fetchAvatars(liste.map(e => e.u)).then(a => {
                hote.querySelectorAll('.ds-avatar[data-p]').forEach(el => {
                    el.innerHTML = PortailProfile.bubbleHTML(a[el.dataset.p]);
                });
            });
        }
    }

    // ---------------------------------------------------------------
    //  LA ROSE DES VENTS
    //  ⚠️ Une seule animation pour toute la famille. Le Pays affichait une
    //  flèche plate, La carte une rose qui tourne : le même renseignement
    //  rendu de deux façons dans deux jeux voisins.
    //
    //  ⚠️ L'aiguille repart TOUJOURS de là où elle s'est arrêtée, et on
    //  ajoute des tours entiers : sans ça, passer de 350° à 10° la ferait
    //  revenir en arrière sur presque un tour complet.
    //
    //  ⚠️ L'état sûr est l'état VISIBLE. Le voile n'a aucune animation
    //  d'opacité : une transition partant de zéro ne progresse pas tant que
    //  la page n'est pas peinte (onglet en arrière-plan), et on se
    //  retrouverait avec un bloqueur plein écran invisible. Seule la carte
    //  bouge, par `transform`. Même leçon que plouf.js.
    // ---------------------------------------------------------------
    let voile = null, angleCourant = 0, minuteur = null;
    const DUREE = 1200;          // mesuré : au-delà, six erreurs font vingt secondes d'attente

    function creerRose() {
        if (voile) return voile;
        voile = document.createElement('div');
        voile.className = 'geo-rose';
        voile.hidden = true;
        voile.setAttribute('aria-hidden', 'true');
        let grads = '';
        for (let i = 0; i < 24; i++) {
            const gros = i % 6 === 0;
            grads += `<line class="${gros ? 'gros' : ''}" x1="50" y1="${gros ? 6 : 8}" x2="50" y2="${gros ? 14 : 12}"
                      transform="rotate(${i * 15} 50 50)"/>`;
        }
        voile.innerHTML = `
            <div class="geo-rose-carte">
                <svg class="geo-rose-svg" viewBox="0 0 100 100" aria-hidden="true">
                    <circle class="geo-rose-fond" cx="50" cy="50" r="46"/>
                    <g class="geo-rose-grads">${grads}<text class="geo-rose-n" x="50" y="24">N</text></g>
                    <g class="geo-rose-aiguille">
                        <polygon points="50,10 56,52 50,46 44,52"/>
                        <polygon class="queue" points="50,90 44,48 50,54 56,48"/>
                    </g>
                    <circle class="geo-rose-axe" cx="50" cy="50" r="4"/>
                </svg>
                <p class="geo-rose-mot">—</p>
                <p class="geo-rose-depuis"></p>
            </div>`;
        voile.addEventListener('click', fermerRose);
        document.body.appendChild(voile);
        return voile;
    }

    function rose(o) {
        const el = creerRose();
        el.querySelector('.geo-rose-mot').textContent = o.mot || '';
        el.querySelector('.geo-rose-depuis').textContent = o.depuis ? 'depuis ' + o.depuis : '';
        const aig = el.querySelector('.geo-rose-aiguille');
        const delta = ((o.angle - (angleCourant % 360)) + 360) % 360;
        const depart = angleCourant;
        angleCourant += 360 + delta;          // un tour, puis le cap
        aig.style.transition = 'none';
        aig.style.transform = `rotate(${depart}deg)`;
        el.hidden = false;
        requestAnimationFrame(() => requestAnimationFrame(() => {
            aig.style.transition = `transform ${DUREE}ms cubic-bezier(.16,.84,.26,1)`;
            aig.style.transform = `rotate(${angleCourant}deg)`;
        }));
        // Un filet de sécurité : si l'animation ne tourne pas, la rose doit
        // disparaître quand même.
        clearTimeout(minuteur);
        return new Promise((ok) => {
            minuteur = setTimeout(() => { fermerRose(); ok(); }, DUREE + 700);
        });
    }
    function fermerRose() { clearTimeout(minuteur); if (voile) voile.hidden = true; }

    // ---------------------------------------------------------------
    //  LA FICHE D'UN PAYS
    //  Montrée en fin de manche, dans les cinq jeux. Avant, chacun en
    //  affichait un bout : Le pays donnait nom + région + silhouette, La
    //  carte nom + région, Les capitales cinq lignes de ville. Tout existe
    //  pourtant déjà dans les données — autant l'apprendre.
    // ---------------------------------------------------------------
    function fiche(p) {
        if (!p) return '';
        const ligne = (quoi, valeur) => valeur
            ? `<div class="geo-fiche-ligne"><span>${esc(quoi)}</span><b>${esc(valeur)}</b></div>` : '';
        const voisins = (p.voisins || []).length
            ? (p.voisins.length > 6 ? p.voisins.slice(0, 6).join(', ') + '…' : p.voisins.join(', '))
            : 'aucun — c’est une île';
        return `
            <div class="geo-fiche">
                <div class="geo-fiche-tete">
                    <span class="geo-fiche-drapeau">${p.drapeau || ''}</span>
                    ${p.chemin ? `<svg class="geo-fiche-forme" viewBox="0 0 100 100" aria-hidden="true"><path d="${esc(p.chemin)}"/></svg>` : ''}
                </div>
                <p class="geo-fiche-nom">${esc(p.nom || '')}</p>
                <p class="geo-fiche-region">${esc(p.region || '')}</p>
                <div class="geo-fiche-lignes">
                    ${ligne('Capitale', p.capitale)}
                    ${ligne('Monnaie', p.devise)}
                    ${ligne('Langue', p.langue)}
                    ${ligne('Habitants', p.population ? NOMBRE.format(p.population) : null)}
                    ${ligne('Superficie', p.aire ? NOMBRE.format(p.aire) + ' km²' : null)}
                    ${ligne('Voisins', voisins)}
                </div>
            </div>`;
    }

    // ---------------------------------------------------------------
    //  LA CARTE DU MONDE, AVEC ZOOM ET GLISSÉ
    //  ⚠️ Le zoom n'est pas un confort : mesuré sur un écran de 375 px,
    //  carte entière, DEUX pays sur 211 atteignent la cible tactile de
    //  44 px. La visée par proximité rattrape le pointage, mais elle ne
    //  rend pas l'Europe lisible pour autant — on ne voit pas ce qu'on
    //  montre. Le zoom répond à ça.
    //
    //  Pincer à deux doigts, ou le bouton +. Un glissé déplace la carte.
    //  ⚠️ Un glissé ne doit PAS valoir un clic : on compare le déplacement
    //  à un seuil, sinon déplacer la carte désignerait un pays au hasard.
    // ---------------------------------------------------------------
    function carte(hote, o) {
        const opts = o || {};
        const M = window.MONDE;
        if (!hote || !M) return null;
        const vue = { x: 0, y: 0, k: 1 };
        const MIN = 1, MAX = 8;

        hote.classList.add('geo-carte-hote');
        // ⚠️ LES PASTILLES. Soixante-dix pays sur deux cent dix sont trop
        // petits pour être VUS : Samoa, Malte, la Barbade font moins d'un
        // pixel à l'écran sur un téléphone. On pouvait déjà les désigner (on
        // vise le centre le plus proche), mais rien ne montrait qu'il y avait
        // un pays là — on cliquait dans le vide de bonne foi, et le jeu
        // paraissait cassé. Une pastille les rend visibles, et elle garde la
        // même taille à l'écran quel que soit le zoom.
        const minis = M.pays.filter(p => p.mini);
        hote.innerHTML = `
            <svg class="geo-carte" viewBox="0 0 ${M.w} ${M.h}" role="img" aria-label="Carte du monde">
                <g class="geo-carte-vue">
                    <g class="geo-carte-pays">${M.pays.map(p => `<path id="gp${p.c}" d="${p.d}"/>`).join('')}</g>
                    <g class="geo-carte-points">${minis.map(p =>
                        `<circle id="gd${p.c}" cx="${p.x}" cy="${p.y}" r="3.2"/>`).join('')}</g>
                    <g class="geo-carte-marques"></g>
                </g>
            </svg>
            <div class="geo-carte-zoom">
                <button type="button" data-z="+" aria-label="Zoomer">+</button>
                <button type="button" data-z="-" aria-label="Dézoomer">−</button>
                <button type="button" data-z="0" aria-label="Revoir le monde entier">⤢</button>
            </div>`;
        const svg = hote.querySelector('.geo-carte');
        const g = hote.querySelector('.geo-carte-vue');

        function appliquer() {
            vue.k = Math.min(MAX, Math.max(MIN, vue.k));
            // On ne sort jamais de la carte : au zoom 1 elle est centrée, et
            // au-delà elle ne peut pas montrer de vide sur les bords.
            const marge = (c, taille) => {
                const trop = taille * vue.k - taille;
                return Math.min(0, Math.max(-trop, c));
            };
            vue.x = marge(vue.x, M.w); vue.y = marge(vue.y, M.h);
            g.setAttribute('transform', `translate(${vue.x} ${vue.y}) scale(${vue.k})`);
            hote.classList.toggle('zoome', vue.k > 1.05);
            majPastilles();
        }
        // ⚠️ La pastille se mesure en PIXELS D'ÉCRAN, pas en unités de carte.
        // Un rayon fixe dans le repère de la carte donnait deux pixels sur un
        // téléphone — on ne voyait toujours rien — et aurait grossi avec le
        // zoom jusqu'à couvrir les pays voisins qu'elle est censée aider à
        // distinguer. On repart donc de la largeur réellement affichée.
        const RAYON_ECRAN = 4;
        function majPastilles() {
            const points = hote.querySelectorAll('.geo-carte-points circle');
            if (!points.length) return;
            const large = svg.getBoundingClientRect().width || M.w;
            const r = (RAYON_ECRAN / (large / M.w) / vue.k).toFixed(2);
            for (const d of points) d.setAttribute('r', r);
        }
        // La largeur affichée change avec l'écran : on remesure au besoin.
        if (window.ResizeObserver) new ResizeObserver(majPastilles).observe(hote);

        // Zoomer en gardant sous le doigt le point qu'on vise.
        function zoomer(facteur, cx, cy) {
            const avant = vue.k;
            vue.k = Math.min(MAX, Math.max(MIN, vue.k * facteur));
            const r = vue.k / avant;
            vue.x = cx - (cx - vue.x) * r;
            vue.y = cy - (cy - vue.y) * r;
            appliquer();
        }
        const versCarte = (clientX, clientY) => {
            const r = svg.getBoundingClientRect();
            return { x: ((clientX - r.left) / r.width * M.w - vue.x) / vue.k,
                     y: ((clientY - r.top) / r.height * M.h - vue.y) / vue.k };
        };
        const plusProche = (x, y) => {
            let best = null, bd = Infinity;
            for (const p of M.pays) {
                const d = (p.x - x) ** 2 + (p.y - y) ** 2;
                if (d < bd) { bd = d; best = p; }
            }
            return best;
        };

        hote.querySelectorAll('.geo-carte-zoom button').forEach(b => b.addEventListener('click', (e) => {
            e.stopPropagation();
            const c = { x: M.w / 2, y: M.h / 2 };
            if (b.dataset.z === '+') zoomer(1.6, c.x, c.y);
            else if (b.dataset.z === '-') zoomer(1 / 1.6, c.x, c.y);
            else { vue.x = 0; vue.y = 0; vue.k = 1; appliquer(); }
        }));

        // Glissé et pincement, à la main : une bibliothèque pour ça pèserait
        // plus lourd que la carte elle-même.
        let actifs = new Map(), depart = null, bouge = 0;
        svg.addEventListener('pointerdown', (e) => {
            actifs.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (actifs.size === 1) { depart = { x: e.clientX, y: e.clientY, vx: vue.x, vy: vue.y }; bouge = 0; }
            svg.setPointerCapture(e.pointerId);
        });
        svg.addEventListener('pointermove', (e) => {
            if (!actifs.has(e.pointerId)) return;
            const avant = [...actifs.values()];
            actifs.set(e.pointerId, { x: e.clientX, y: e.clientY });
            const r = svg.getBoundingClientRect();
            if (actifs.size === 1 && depart) {
                const dx = (e.clientX - depart.x) / r.width * M.w;
                const dy = (e.clientY - depart.y) / r.height * M.h;
                bouge = Math.max(bouge, Math.abs(e.clientX - depart.x) + Math.abs(e.clientY - depart.y));
                if (vue.k > 1.01) { vue.x = depart.vx + dx; vue.y = depart.vy + dy; appliquer(); }
            } else if (actifs.size === 2 && avant.length === 2) {
                const ap = [...actifs.values()];
                const dAvant = Math.hypot(avant[0].x - avant[1].x, avant[0].y - avant[1].y);
                const dApres = Math.hypot(ap[0].x - ap[1].x, ap[0].y - ap[1].y);
                if (dAvant > 0) {
                    const milieu = { x: (ap[0].x + ap[1].x) / 2, y: (ap[0].y + ap[1].y) / 2 };
                    const p = { x: (milieu.x - r.left) / r.width * M.w, y: (milieu.y - r.top) / r.height * M.h };
                    zoomer(dApres / dAvant, p.x, p.y);
                }
                bouge = 999;
            }
        });
        const relacher = (e) => { actifs.delete(e.pointerId); if (!actifs.size) depart = null; };
        svg.addEventListener('pointerup', relacher);
        svg.addEventListener('pointercancel', relacher);
        // La molette zoome, pour qui joue sur un ordinateur.
        svg.addEventListener('wheel', (e) => {
            e.preventDefault();
            const p = versCarte(e.clientX, e.clientY);
            zoomer(e.deltaY < 0 ? 1.18 : 1 / 1.18, p.x * vue.k + vue.x, p.y * vue.k + vue.y);
        }, { passive: false });

        svg.addEventListener('click', (e) => {
            // ⚠️ Un glissé n'est pas un clic : au-delà de 10 px de
            // déplacement, on déplaçait la carte, on ne désignait rien.
            if (bouge > 10) { bouge = 0; return; }
            if (!opts.surClic) return;
            const p = versCarte(e.clientX, e.clientY);
            const pays = plusProche(p.x, p.y);
            if (pays) opts.surClic(pays);
        });

        appliquer();
        return {
            vue,
            svg,
            // Allumer un pays d'une classe donnée. ⚠️ Le tracé ET sa
            // pastille : pour un pays minuscule, la pastille est la seule
            // chose qu'on voit — l'allumer sans elle ne montrerait rien.
            marquer(code, classe) {
                for (const el of [hote.querySelector('#gp' + code), hote.querySelector('#gd' + code)]) {
                    if (el) el.classList.add(classe);
                }
            },
            demarquer(classe) {
                hote.querySelectorAll('.' + classe).forEach(el => el.classList.remove(classe));
            },
            marques(html) { hote.querySelector('.geo-carte-marques').innerHTML = html; },
            // Cadrer sur un pays : utile quand on veut montrer la réponse.
            cadrer(code, k) {
                const p = M.pays.find(x => x.c === code);
                if (!p) return;
                vue.k = k || 3;
                vue.x = M.w / 2 - p.x * vue.k;
                vue.y = M.h / 2 - p.y * vue.k;
                appliquer();
            },
            reinitialiser() { vue.x = 0; vue.y = 0; vue.k = 1; appliquer(); },
        };
    }

    window.Geo = { temps, classement, rose, fermerRose, fiche, carte, esc };
})();
