// =====================================================================
//  LE PLOUF-PLOUF — qui commence ?
//
//  Jusqu'ici, le premier tour revenait toujours au joueur d'indice zéro,
//  c'est-à-dire au premier inscrit — donc, neuf fois sur dix, à celui qui
//  avait créé la table. Ça n'était écrit nulle part et ça ne se discutait
//  pas. Le tirage est maintenant fait par le SERVEUR, au hasard, et cette
//  animation ne fait que le montrer.
//
//  ⚠️ L'animation ne décide de rien. Elle reçoit le gagnant et s'arrange
//  pour tomber dessus : si elle décidait, deux joueurs pourraient voir des
//  résultats différents, et le jeu derrière ne saurait plus qui joue.
//
//  Une seule fenêtre qui fait défiler les joueurs, plutôt qu'une liste où
//  un projecteur se promène : à douze joueurs — le maximum de l'Infiltré —
//  la liste ne tient pas sur un téléphone, alors qu'une fenêtre unique
//  reste lisible quel que soit le nombre.
//
//  S'auto-injecte, comme /invitation.js : aucune app n'a de HTML à
//  ajouter. Usage :
//      await Plouf.tirage({ joueurs: ['Ana','Bo'], gagnant: 'Bo' });
// =====================================================================
(function () {
    if (window.Plouf) return;

    const DUREE_MIN = 2200;                 // assez long pour faire durer le suspense
    const FILET_MS = 2500;                  // marge de sécurité avant retrait forcé

    let voile = null;

    function creer() {
        const el = document.createElement('div');
        el.className = 'plouf-voile';
        el.hidden = true;                    // ⚠️ naître caché : sinon il couvre l'écran en permanence
        el.innerHTML = `
            <div class="plouf-boite">
                <p class="plouf-titre">Qui commence ?</p>
                <div class="plouf-fenetre">
                    <span class="plouf-bulle" id="plouf-bulle"></span>
                    <span class="plouf-nom" id="plouf-nom"></span>
                </div>
                <p class="plouf-fin" id="plouf-fin"></p>
            </div>`;
        document.body.appendChild(el);
        // On peut écourter d'une touche : personne ne doit rester coincé
        // devant une animation, surtout à la dixième partie de la soirée.
        el.addEventListener('click', () => { if (el._ecourter) el._ecourter(); });
        return el;
    }

    function style() {
        if (document.getElementById('plouf-style')) return;
        const s = document.createElement('style');
        s.id = 'plouf-style';
        s.textContent = `
        /* ⚠️ L'ÉTAT SÛR EST « VISIBLE ». La première version partait d'une
           opacité nulle et comptait sur une transition pour l'amener à un.
           Or une transition ne tourne pas quand la page n'est pas peinte
           (onglet en arrière-plan, aperçu masqué) : le voile restait alors
           INVISIBLE tout en avalant les clics — un bloqueur plein écran que
           rien ne signale. C'est le même piège que la propriété visibility
           transitionnée, documenté ailleurs dans ce projet.

           Le fondu d'entrée est donc une animation purement décorative : si
           elle ne tourne pas, on obtient simplement un voile qui apparaît
           d'un coup, ce qui est correct. Seul l'attribut hidden fait
           apparaître et disparaître. */
        .plouf-voile { position: fixed; inset: 0; z-index: 1100; display: grid; place-items: center;
            background: rgba(10, 8, 5, .82); backdrop-filter: blur(6px); }
        .plouf-voile[hidden] { display: none; }
        /* Le fondu d'entrée porte sur la CARTE et n'utilise que la transformation.
           Une animation qui part d'une opacité nulle reste bloquée sur sa
           première image quand la page n'est pas peinte : le voile était alors
           invisible tout en avalant les clics. Bloquée ici, celle-ci laisse
           simplement une carte à 96 % — visible, donc sans conséquence. */
        .plouf-voile.entre .plouf-boite { animation: ploufEntree .2s ease; }
        @keyframes ploufEntree { from { transform: scale(.94); } }
        .plouf-boite { text-align: center; padding: 26px 22px; max-width: 320px; width: 84%;
            border-radius: 18px; background: linear-gradient(165deg, #1d1710, #14100b);
            border: 1px solid rgba(217,169,78,.35); box-shadow: 0 18px 50px rgba(0,0,0,.5); }
        .plouf-titre { margin: 0 0 18px; font-size: .72rem; letter-spacing: 1.4px; text-transform: uppercase;
            color: #a08f74; font-weight: 700; }
        .plouf-fenetre { display: flex; flex-direction: column; align-items: center; gap: 10px;
            min-height: 116px; justify-content: center; }
        .plouf-bulle { width: 62px; height: 62px; border-radius: 50%; display: grid; place-items: center;
            font-size: 1.9rem; background: rgba(0,0,0,.35); border: 2px solid rgba(217,169,78,.45);
            overflow: hidden; }
        .plouf-bulle img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; display: block; }
        .plouf-nom { font-size: 1.15rem; font-weight: 800; color: #efe4cf; line-height: 1.2;
            max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .plouf-fenetre.tourne { animation: ploufBat .09s ease; }
        @keyframes ploufBat { from { transform: scale(.94); opacity: .55; } }
        .plouf-fenetre.gagne .plouf-bulle { border-color: #d9a94e; box-shadow: 0 0 0 5px rgba(217,169,78,.16); }
        .plouf-fenetre.gagne .plouf-nom { color: #ecca82; }
        .plouf-fin { margin: 16px 0 0; min-height: 1.2em; font-size: .84rem; color: #a08f74; }
        .plouf-fin.on { color: #ecca82; font-weight: 700; }
        @media (prefers-reduced-motion: reduce) {
            .plouf-fenetre.tourne { animation: none; }
            .plouf-voile.entre .plouf-boite { animation: none; }
        }`;
        document.head.appendChild(s);
    }

    // La suite d'indices parcourue par la fenêtre. Elle doit tomber
    // EXACTEMENT sur le gagnant : on part d'un indice au hasard et on
    // calcule le nombre de pas qui y mène.
    function parcours(n, indexGagnant) {
        if (n <= 1) return [0];
        // On vise un NOMBRE D'ÉTAPES, pas un nombre de tours : à deux joueurs,
        // « deux tours complets » ne faisait que quatre étapes, soit huit
        // dixièmes de seconde — aucun suspense. Le nombre de pas est donc fixé
        // d'avance, puis ajusté du minimum nécessaire pour tomber juste.
        const vise = 15 + Math.floor(Math.random() * 6);           // 15 à 20 étapes
        const depart = Math.floor(Math.random() * n);
        const pas = vise + ((((indexGagnant - depart - vise) % n) + n) % n);
        const suite = [];
        for (let i = 0; i <= pas; i++) suite.push((depart + i) % n);
        return suite;
    }

    // Chaque étape dure un peu plus longtemps que la précédente : c'est ce
    // ralentissement qui fait la roulette. Purement géométrique, borné pour
    // que la fin ne s'éternise pas.
    function delais(nb) {
        const out = [];
        for (let i = 0; i < nb; i++) {
            const t = i / Math.max(1, nb - 1);
            out.push(Math.round(55 + Math.pow(t, 3) * 265));
        }
        return out;
    }

    const dors = (ms) => new Promise(r => setTimeout(r, ms));

    /**
     * Montre le tirage, puis résout.
     * @param {string[]} joueurs  les pseudos, dans l'ordre d'affichage
     * @param {string}   gagnant  celui que le serveur a tiré
     * @param {string}   titre    facultatif
     * @returns {Promise<void>}   résolue quand l'animation est finie
     */
    async function tirage({ joueurs, gagnant, titre }) {
        const liste = (joueurs || []).filter(Boolean);
        // À un seul joueur il n'y a rien à tirer, et sans gagnant connu on
        // n'a rien à montrer : dans les deux cas on ne dérange personne.
        if (liste.length < 2 || !gagnant || !liste.includes(gagnant)) return;

        style();
        if (!voile) voile = creer();
        const bulle = voile.querySelector('#plouf-bulle');
        const nom = voile.querySelector('#plouf-nom');
        const fin = voile.querySelector('#plouf-fin');
        const fenetre = voile.querySelector('.plouf-fenetre');
        voile.querySelector('.plouf-titre').textContent = titre || 'Qui commence ?';
        fin.textContent = ''; fin.className = 'plouf-fin';
        fenetre.classList.remove('gagne');

        // Les bulles d'avatar, si le composant partagé est là. Sinon on
        // affiche l'initiale : l'animation ne doit pas dépendre d'un
        // chargement réseau qui peut échouer.
        let avatars = {};
        if (window.PortailProfile && PortailProfile.fetchAvatars) {
            try { avatars = await PortailProfile.fetchAvatars(liste) || {}; } catch (e) {}
        }
        const montrer = (pseudo) => {
            bulle.innerHTML = (window.PortailProfile && PortailProfile.bubbleHTML)
                ? PortailProfile.bubbleHTML(avatars[pseudo])
                : pseudo.slice(0, 1).toUpperCase();
            nom.textContent = pseudo;
        };

        voile.classList.remove('entre'); void voile.offsetWidth;
        voile.hidden = false;
        voile.classList.add('entre');

        const suite = parcours(liste.length, liste.indexOf(gagnant));
        const temps = delais(suite.length);
        const reduit = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        let coupe = false;
        voile._ecourter = () => { coupe = true; };

        // Filet : quoi qu'il arrive — animation interrompue, onglet caché,
        // erreur — le voile se retire. Un voile plein écran qui reste est le
        // pire défaut possible, il bloque tout le jeu derrière.
        const filet = setTimeout(() => fermer(), DUREE_MIN + FILET_MS + 4000);

        let fini = false;
        function fermer() {
            if (fini) return;
            fini = true;
            clearTimeout(filet);
            // On retire d'un coup : pas de fondu de sortie qui dépendrait,
            // lui aussi, d'une animation susceptible de ne jamais tourner.
            voile.classList.remove('entre');
            voile.hidden = true;
        }

        if (!reduit && !coupe) {
            for (let i = 0; i < suite.length; i++) {
                if (coupe) break;
                montrer(liste[suite[i]]);
                fenetre.classList.remove('tourne'); void fenetre.offsetWidth;
                fenetre.classList.add('tourne');
                await dors(temps[i]);
            }
        }
        montrer(gagnant);
        fenetre.classList.add('gagne');
        fin.textContent = gagnant + ' commence !';
        fin.className = 'plouf-fin on';
        if (navigator.vibrate) { try { navigator.vibrate([25, 60, 45]); } catch (e) {} }

        await dors(coupe || reduit ? 700 : 1100);
        fermer();
        await dors(200);
    }

    window.Plouf = { tirage };
})();
