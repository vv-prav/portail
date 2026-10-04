// =====================================================================
//  LES DÉFIS — le multijoueur qui n'exige pas d'être là en même temps
//
//  Le constat qui a fait naître ce fichier : Motus du jour compte 186
//  clés de statistiques, Yams 5 et Motus Party 2. Ce n'est pas une
//  affaire de qualité de jeu — c'est que le temps réel demande que deux
//  personnes ouvrent l'appli à la même minute, et qu'entre gens qui ont
//  une vie, ça n'arrive pas.
//
//  Un défi retire cette contrainte sans rien retirer au jeu : quelqu'un
//  lance une manche, tout le monde reçoit EXACTEMENT la même (même mot,
//  mêmes questions, même ordre), chacun la fait quand il veut dans les
//  vingt-quatre heures, et on compare. C'est la mécanique des jeux du
//  jour — celle qui marche ici — appliquée à ce que les gens veulent
//  vraiment faire ensemble.
//
//  Quatre types :
//    • `motus`    — le même mot pour tout le monde, six essais ;
//    • `drapeaux` — la même série de dix questions, dans le même ordre ;
//    • `motlong`  — les mêmes neuf lettres (Le mot le plus long) ;
//    • `sudoku`   — la même grille.
//  Les deux derniers se jouent dans la VRAIE page du jeu, ouverte en mode
//  défi (`/sudoku/?defi=<id>`) : recoder ici une grille de Sudoku ou des
//  tuiles de lettres aurait fait deux interfaces du même jeu. Leur page
//  parle aux routes de ce fichier au lieu de celles du jeu du jour.
//
//  ⚠️ Le contenu ne quitte JAMAIS le serveur en entier : le mot n'est
//  envoyé qu'à la fin de la manche de celui qui demande, et la bonne
//  réponse d'une question qu'après y avoir répondu. Un défi se joue entre
//  amis, mais l'onglet « réseau » du navigateur est ouvert à tout le
//  monde.
//
//  Monté par server.js :
//     require('./defis/jeu')(app, requireAuthApi, {
//         get, set, utilisateur, motus: { pool, known, marks, essais },
//     });
// =====================================================================

const questions = require('../drapeaux/questions');

const VIE_MS = 24 * 60 * 60 * 1000;   // un défi vit une journée : au-delà, ce n'est plus une manche commune
const NB_QUESTIONS = 10;
const K_INDEX = 'defi:index';

const kDefi = (id) => `defi:${id}`;
const kProg = (id, pseudo) => `defi:prog:${id}:${pseudo}`;
const kJoueurs = (id) => `defi:joueurs:${id}`;
const kStats = (pseudo) => `defi:stats:${pseudo}`;

// `page` : le type se joue dans la page de son jeu, pas dans celle des défis.
const TYPES = {
    motus: { nom: 'Motus', emoji: '🟨', accent: '#c9a24a', quoi: 'Le même mot pour tout le monde, six essais.' },
    drapeaux: { nom: 'Quiz des drapeaux', emoji: '🚩', accent: '#6f7bb0', quoi: 'Dix questions, les mêmes pour tous.' },
    motlong: { nom: 'Le mot le plus long', emoji: '🔤', accent: '#4f9a8f', quoi: 'Les mêmes neuf lettres pour tout le monde.', page: '/motlong/' },
    sudoku: { nom: 'Sudoku', emoji: '🧮', accent: '#8a7bc4', quoi: 'La même grille pour tout le monde.', page: '/sudoku/' },
};
const SCORE_SUDOKU = 10;

module.exports = function attacherDefis(app, requireAuthApi, deps) {
    const get = deps.get, set = deps.set;
    const utilisateur = deps.utilisateur;          // (req) => pseudo
    const motus = deps.motus;                      // { pool, known, marks, essais }
    const motlong = deps.motlong;                  // motlong/jeu.js
    const sudoku = deps.sudoku;                    // sudoku/jeu.js

    // ---------- Le stock ----------
    function index() {
        const l = get(K_INDEX);
        return Array.isArray(l) ? l : [];
    }
    // Le ménage se fait à la lecture, comme pour les rendez-vous : pas un
    // minuteur de plus à entretenir, et un défi périmé disparaît au premier
    // regard qu'on jette dessus.
    function vivants() {
        const maintenant = Date.now();
        const ids = index();
        const gardes = [];
        for (const id of ids) {
            const d = get(kDefi(id));
            if (d && (maintenant - d.creeA) < VIE_MS) gardes.push(id);
        }
        if (gardes.length !== ids.length) set(K_INDEX, gardes);
        return gardes.map(id => get(kDefi(id))).filter(Boolean);
    }

    function joueursDe(id) {
        const l = get(kJoueurs(id));
        return Array.isArray(l) ? l : [];
    }
    function inscrire(id, pseudo) {
        const l = joueursDe(id);
        if (!l.includes(pseudo)) set(kJoueurs(id), [...l, pseudo]);
    }

    // ---------- Le classement ----------
    // Même convention que les jeux du jour : au score, puis au temps, puis à
    // l'ordre d'arrivée. Le temps ne départage QUE les ex æquo — sinon un défi
    // se jouerait en apnée, ce qui n'est pas l'idée.
    function classement(id) {
        return joueursDe(id)
            .map(p => ({ pseudo: p, prog: get(kProg(id, p)) }))
            .filter(x => x.prog && x.prog.fini)
            .map(x => ({ pseudo: x.pseudo, score: x.prog.score || 0, ms: x.prog.ms || 0, fiA: x.prog.finiA || 0 }))
            .sort((a, b) => b.score - a.score || a.ms - b.ms || a.fiA - b.fiA);
    }

    // ---------- La fabrication du contenu ----------
    function fabriquer(type) {
        if (type === 'motus') {
            // Six et sept lettres sont les longueurs qui se devinent le mieux en
            // six essais : quatre lettres se trouve trop vite pour départager.
            const longueur = 6 + Math.floor(Math.random() * 2);
            const pool = motus.pool(longueur) || [];
            if (!pool.length) return null;
            return { mot: String(pool[Math.floor(Math.random() * pool.length)]).toUpperCase() };
        }
        if (type === 'drapeaux') {
            return { questions: questions.serie(NB_QUESTIONS, { niveau: 'moyen' }) };
        }
        // Le même contenu que les jeux du jour, tiré au hasard plutôt que de
        // la date : un défi n'est pas la grille d'aujourd'hui.
        if (type === 'motlong' && motlong) return motlong.tirage(Math.random, []);
        if (type === 'sudoku' && sudoku) return sudoku.tirage(Math.random);
        return null;
    }

    // ---------- L'état d'un joueur, tel qu'il a le droit de le voir ----------
    function progDe(id, pseudo) {
        return get(kProg(id, pseudo)) || null;
    }
    function vueJoueur(d, pseudo) {
        const p = progDe(d.id, pseudo);
        if (!p) return { etat: 'neuf' };
        if (p.fini) return { etat: 'fini', score: p.score, ms: p.ms };
        return { etat: 'encours' };
    }

    function resume(d, moi) {
        const t = TYPES[d.type] || {};
        const cl = classement(d.id);
        const ma = cl.findIndex(l => l.pseudo === moi);
        return {
            id: d.id, type: d.type, nom: t.nom, emoji: t.emoji, accent: t.accent, quoi: t.quoi, page: t.page || null,
            auteur: d.auteur, creeA: d.creeA, finA: d.creeA + VIE_MS,
            moiPseudo: moi,          // pour que le client sache quelle ligne du classement est la sienne
            joueurs: cl.length, moi: vueJoueur(d, moi),
            place: ma >= 0 ? ma + 1 : null,
            meneur: cl.length ? cl[0].pseudo : null,
        };
    }

    // ---------- Les routes ----------
    app.get('/api/defis', requireAuthApi, (req, res) => {
        const moi = utilisateur(req);
        const liste = vivants().sort((a, b) => b.creeA - a.creeA).map(d => resume(d, moi));
        res.json({ defis: liste, types: Object.entries(TYPES).map(([id, t]) => ({ id, ...t })) });
    });

    app.post('/api/defis', requireAuthApi, (req, res) => {
        const moi = utilisateur(req);
        const type = String((req.body && req.body.type) || '');
        if (!TYPES[type]) return res.status(400).json({ error: 'Type de défi inconnu.' });
        // Un seul défi en cours par personne et par type : trois Motus ouverts
        // en même temps, ce n'est plus un défi, c'est une liste de corvées.
        if (vivants().some(d => d.auteur === moi && d.type === type)) {
            return res.status(400).json({ error: 'Tu as déjà un défi de ce type en cours.' });
        }
        if (vivants().length >= 12) return res.status(400).json({ error: 'Trop de défis ouverts.' });

        const contenu = fabriquer(type);
        if (!contenu) return res.status(500).json({ error: 'Impossible de préparer ce défi.' });
        const id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        set(kDefi(id), { id, type, auteur: moi, creeA: Date.now(), contenu });
        set(K_INDEX, [id, ...index()]);
        set(kJoueurs(id), []);
        res.json({ ok: true, id });
    });

    // Le détail d'un défi : ce qu'on a le droit de voir dépend d'où on en est.
    app.get('/api/defis/:id', requireAuthApi, (req, res) => {
        const moi = utilisateur(req);
        const d = get(kDefi(req.params.id));
        if (!d) return res.status(404).json({ error: 'Ce défi n’existe plus.' });
        const p = progDe(d.id, moi);
        const fini = !!(p && p.fini);

        const sortie = {
            ...resume(d, moi),
            classement: fini ? classement(d.id) : [],   // voir le classement avant d'avoir joué révélerait le niveau à battre
            longueur: d.type === 'motus' ? d.contenu.mot.length : NB_QUESTIONS,
            progression: p,
        };
        if (d.type === 'motlong') {
            sortie.lettres = d.contenu.lettres;
            sortie.max = d.contenu.max;
            // Les meilleurs mots seulement une fois sa manche finie.
            if (fini) sortie.meilleurs = d.contenu.meilleurs;
        } else if (d.type === 'sudoku') {
            sortie.donnee = d.contenu.donnee;
            sortie.indices = d.contenu.indices;
            if (fini) sortie.solution = d.contenu.solution;
        } else if (d.type === 'motus') {
            sortie.essais = (p && p.essais) || [];
            // La première lettre est offerte, comme au Motus du jour.
            sortie.premiere = d.contenu.mot[0];
            if (fini) sortie.mot = d.contenu.mot;
        } else {
            const i = (p && p.index) || 0;
            sortie.index = i;
            sortie.repondu = (p && p.reponses) || [];
            // ⚠️ Jamais `bonne` avant d'avoir répondu.
            if (!fini && i < NB_QUESTIONS) {
                const q = d.contenu.questions[i];
                sortie.question = { type: q.type, enonce: q.enonce, media: q.media, choix: q.choix };
            }
        }
        res.json(sortie);
    });

    app.post('/api/defis/:id/commencer', requireAuthApi, (req, res) => {
        const moi = utilisateur(req);
        const d = get(kDefi(req.params.id));
        if (!d) return res.status(404).json({ error: 'Ce défi n’existe plus.' });
        let p = progDe(d.id, moi);
        // Une seule fois : recharger la page ne remet pas le chronomètre à zéro,
        // sinon il suffirait de recharger pour faire un temps parfait.
        if (p && p.debutA) return res.json({ ok: true });
        p = p || ({ motus: { essais: [] }, motlong: { mots: [], refuses: [], propositions: 0 },
                    sudoku: { cases: d.contenu.donnee } }[d.type] || { index: 0, reponses: [] });
        p.debutA = Date.now();
        set(kProg(d.id, moi), p);
        inscrire(d.id, moi);
        res.json({ ok: true });
    });

    // Clore la manche d'un joueur : un seul endroit qui écrit le score, le
    // temps et les statistiques, pour les deux types de défi.
    function clore(d, moi, p, score) {
        p.fini = true;
        p.score = score;
        p.ms = p.debutA ? Date.now() - p.debutA : 0;
        p.finiA = Date.now();
        set(kProg(d.id, moi), p);

        const s = get(kStats(moi)) || { parties: 0, victoires: 0, points: 0, parType: {} };
        s.parties++;
        s.points += score;
        s.parType[d.type] = (s.parType[d.type] || 0) + 1;
        // La victoire ne se décide qu'à la fin du défi, pas ici : quelqu'un peut
        // encore jouer. On recalcule donc le palmarès de tout le monde à chaque
        // clôture — douze joueurs, c'est gratuit, et c'est toujours juste.
        set(kStats(moi), s);
        recalculerVictoires(d.id);
        return p;
    }
    // Le vainqueur d'un défi peut changer tant qu'il reste du monde à jouer.
    // Plutôt que d'attribuer une victoire à tort puis d'essayer de la retirer,
    // on relit le classement et on repose les compteurs à plat.
    function recalculerVictoires(id) {
        const cl = classement(id);
        if (!cl.length) return;
        const meilleur = cl[0].score;
        // Deux règles, une seule raison : une victoire qui n'en est pas une
        // entre dans les statistiques et n'en ressort plus.
        //   • à moins de deux participants, il n'y a personne à battre —
        //     lancer son propre défi et le faire en premier ne vaut pas un
        //     palmarès ;
        //   • à égalité en tête, personne ne gagne, comme au Yams.
        const enTete = cl.filter(l => l.score === meilleur);
        const gagnant = (cl.length >= 2 && enTete.length === 1) ? enTete[0].pseudo : null;
        for (const l of cl) {
            const s = get(kStats(l.pseudo));
            if (!s) continue;
            const gagnes = new Set(s.defisGagnes || []);
            if (gagnant === l.pseudo) gagnes.add(id); else gagnes.delete(id);
            s.defisGagnes = [...gagnes];
            s.victoires = s.defisGagnes.length;
            set(kStats(l.pseudo), s);
        }
    }

    app.post('/api/defis/:id/repondre', requireAuthApi, (req, res) => {
        const moi = utilisateur(req);
        const d = get(kDefi(req.params.id));
        if (!d) return res.status(404).json({ error: 'Ce défi n’existe plus.' });
        if ((Date.now() - d.creeA) > VIE_MS) return res.status(400).json({ error: 'Ce défi est terminé.' });
        const p = progDe(d.id, moi);
        if (!p || !p.debutA) return res.status(400).json({ error: 'Commence le défi d’abord.' });
        if (p.fini) return res.status(400).json({ error: 'Tu as déjà joué ce défi.' });

        const b = req.body || {};
        // ---- Le mot le plus long : autant de propositions qu'on veut ----
        if (d.type === 'motlong') {
            const t = d.contenu;
            const terminerMotlong = () => {
                const meilleur = Math.max(0, ...(p.mots || []).map(m => m.length));
                p.meilleur = meilleur;
                p.trouve = meilleur > 0 && meilleur >= t.max;
                clore(d, moi, p, meilleur);
            };
            if (b.action === 'terminer') {
                terminerMotlong();
            } else {
                const v = motlong.verifier(b.mot, t.lettres);
                if (v.ok && (p.mots || []).includes(v.mot)) return res.status(400).json({ error: 'Déjà trouvé.' });
                if (!v.cout) return res.status(400).json({ error: v.raison });
                p.propositions = (p.propositions || 0) + 1;
                if (v.ok) p.mots = [...(p.mots || []), v.mot]; else p.refuses = [...(p.refuses || []), v.mot];
                if (v.ok && v.mot.length >= t.max) terminerMotlong(); else set(kProg(d.id, moi), p);
                if (!p.fini) return res.json({ ok: true, accepte: v.ok, mot: v.mot, raison: v.ok ? null : v.raison, mots: p.mots, fini: false });
                return res.json({ ok: true, accepte: v.ok, mot: v.mot, mots: p.mots, fini: true, trouve: p.trouve, meilleur: p.meilleur,
                    score: p.score, ms: p.ms, meilleurs: t.meilleurs, classement: classement(d.id) });
            }
            return res.json({ ok: true, mots: p.mots || [], fini: true, trouve: p.trouve, meilleur: p.meilleur,
                score: p.score, ms: p.ms, meilleurs: t.meilleurs, classement: classement(d.id) });
        }

        // ---- Le Sudoku : sauvegarder, valider, abandonner ----
        if (d.type === 'sudoku') {
            const g = d.contenu;
            if (b.action === 'abandon') {
                p.trouve = false; p.abandon = true;
                clore(d, moi, p, 0);
                return res.json({ ok: true, fini: true, trouve: false, solution: g.solution, classement: classement(d.id) });
            }
            p.cases = sudoku.nettoyer(b.cases, g.donnee);
            if (b.action === 'valider' && sudoku.estJuste(p.cases, g.solution)) {
                p.trouve = true;
                clore(d, moi, p, SCORE_SUDOKU);
                return res.json({ ok: true, juste: true, fini: true, ms: p.ms, score: p.score, solution: g.solution, classement: classement(d.id) });
            }
            set(kProg(d.id, moi), p);
            // Comme au jeu du jour : « juste » ou « pas encore », jamais quelles cases.
            return res.json({ ok: true, juste: false, fini: false });
        }

        if (d.type === 'motus') {
            const mot = String((req.body && req.body.mot) || '').toUpperCase().replace(/[^A-ZÀ-Ÿ]/g, '');
            const reponse = d.contenu.mot;
            if (mot.length !== reponse.length) return res.status(400).json({ error: `Il faut ${reponse.length} lettres.` });
            if (!motus.known(mot)) return res.status(400).json({ error: 'Mot inconnu.' });
            const marks = motus.marks(mot, reponse);
            p.essais = [...(p.essais || []), { mot, marks }];
            const trouve = mot === reponse;
            const finies = p.essais.length >= motus.essais;
            if (trouve || finies) {
                // Sept moins le nombre d'essais : trouver du premier coup vaut 6,
                // au sixième essai vaut 1, échouer vaut 0. Le même barème que
                // celui auquel tout le monde est déjà habitué au Motus du jour.
                clore(d, moi, p, trouve ? (motus.essais + 1 - p.essais.length) : 0);
                return res.json({ ok: true, marks, fini: true, trouve, mot: reponse, score: p.score, ms: p.ms });
            }
            set(kProg(d.id, moi), p);
            return res.json({ ok: true, marks, fini: false, restant: motus.essais - p.essais.length });
        }

        // Quiz des drapeaux
        const choix = Number((req.body && req.body.choix));
        const i = p.index || 0;
        const q = d.contenu.questions[i];
        if (!q) return res.status(400).json({ error: 'Plus de question.' });
        const juste = choix === q.bonne;
        p.reponses = [...(p.reponses || []), { choix, juste }];
        p.index = i + 1;
        const dernier = p.index >= NB_QUESTIONS;
        if (dernier) {
            clore(d, moi, p, p.reponses.filter(r => r.juste).length);
        } else {
            set(kProg(d.id, moi), p);
        }
        res.json({
            ok: true, juste, bonne: q.bonne, reponse: q.reponse,
            fini: dernier, score: dernier ? p.score : null, ms: dernier ? p.ms : null,
            suivante: dernier ? null : (() => {
                const s = d.contenu.questions[p.index];
                return { type: s.type, enonce: s.enonce, media: s.media, choix: s.choix };
            })(),
        });
    });

    // ---------- Ce que le reste du salon lit ----------
    return {
        statsFor: (pseudo) => get(kStats(pseudo)) || null,
        // Combien de défis attendent une manche de cette personne : c'est ce
        // qui s'affiche sur l'accueil, à côté des jeux du jour.
        enAttentePour: (pseudo) => vivants().filter(d => {
            const p = progDe(d.id, pseudo);
            return !p || !p.fini;
        }).length,
        resumes: (moi) => vivants().sort((a, b) => b.creeA - a.creeA).map(d => resume(d, moi)),
        TYPES,
    };
};
