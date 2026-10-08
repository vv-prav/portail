// =====================================================================
//  LE FIL DU SALON — une seule conversation, continue
//
//  ⚠️ CE N'EST PAS UN CHAT, ET LA NUANCE EST TOUT LE DOSSIER. Le salon
//  compte trente-deux comptes, et sa leçon la mieux mesurée est que le
//  temps réel n'arrive pas tout seul : le hall « Jouer ensemble » posait
//  les bonnes questions, mais la réponse était presque toujours
//  « personne ». Un chat en direct aurait le même sort. On écrit quand on
//  veut, on lit quand on passe, et le direct n'est qu'un bonus quand deux
//  personnes sont là en même temps. Techniquement c'est la même chose ;
//  en pratique ça change le nom du vide : un fil sans nouveau message dit
//  « rien de neuf », un chat vide dit « personne ne vient ».
//
//  ⚠️ IL NE REMPLACE PAS LA DISCUSSION DU JOUR (`mf:cmt:<date>`,
//  `motus:cmt:<date>`). Celle-ci porte sur le mot ou la grille du jour,
//  elle a son sujet et son contenu. Le fil, lui, porte la vie du salon et
//  ne recommence pas à minuit. Les deux gardent la même forme de données
//  — `{u, t, ts}`, même plafond, même anti-flood — parce qu'elle a déjà
//  servi deux ans sans histoire.
//
//  Les clés, et pourquoi elles sont nommées ainsi :
//    · `fil:messages`      — les 200 derniers, un seul tableau
//    · `fil:lu:<pseudo>`   — l'horodatage de sa dernière lecture
//
//  ⚠️ Le pseudo est au TROISIÈME segment, et ce n'est pas un détail de
//  goût : `supprimerDonneesJoueur()` efface les clés dont `seg[2]` est le
//  pseudo, et `comptes/renommage.js` migre les familles listées dans
//  `PREFIXES_BRUTS` sur le même rang. Nommée `salon:fil:lu:<pseudo>`, la
//  clé aurait survécu à la suppression d'un compte et au renommage, sans
//  que rien ne le signale.
// =====================================================================
module.exports = function monterLeFil(app, io, deps) {
    const { requireAuthApi, currentUser, mfGet, mfSet, escapeHtml, salle } = deps;

    const CLE = 'fil:messages';
    const kLu = (pseudo) => `fil:lu:${pseudo}`;
    const GARDE = 200;          // ce qu'on conserve
    const PAGE = 60;            // ce qu'on envoie
    const MAX_CARACTERES = 240;
    const ANTI_FLOOD_MS = 4000; // la règle de la discussion du jour, à l'identique

    const messages = () => mfGet(CLE) || [];

    // Combien de messages depuis sa dernière lecture, et de qui. Sert au
    // pouls de l'accueil — d'où le fait qu'elle ne lise rien d'autre et
    // n'écrive jamais : le pouls est appelé à chaque ouverture de page.
    function nonLus(pseudo) {
        const depuis = Number(mfGet(kLu(pseudo))) || 0;
        const liste = messages();
        // ⚠️ Ses propres messages ne sont pas des non-lus. Sans ce filtre,
        // écrire quelque chose se signalait à soi-même comme une nouvelle.
        const neufs = liste.filter(m => m && m.ts > depuis && m.u !== pseudo);
        const dernier = liste[liste.length - 1] || null;
        return {
            nonLus: neufs.length,
            total: liste.length,
            dernier: dernier ? { u: dernier.u, ts: dernier.ts } : null,
        };
    }

    function marquerLu(pseudo) {
        const liste = messages();
        const dernier = liste.length ? liste[liste.length - 1].ts : Date.now();
        mfSet(kLu(pseudo), dernier);
    }

    // ---- Lire. Lire, c'est avoir lu : la marque se pose ici. ----
    app.get('/api/fil', requireAuthApi, (req, res) => {
        const pseudo = currentUser(req);
        const liste = messages();
        const avant = Number(mfGet(kLu(pseudo))) || 0;
        marquerLu(pseudo);
        res.json({ messages: liste.slice(-PAGE), moi: pseudo, luJusqua: avant });
    });

    // ⚠️ LE COMPTE SEUL, SANS RIEN MARQUER. Le pouls le porte déjà, mais
    // l'accueil est la seule page à l'appeler : sur les six jeux et sur
    // `/jouer/`, la bulle restait muette jusqu'à ce qu'on l'ouvre — le point
    // rouge n'y existait pas. Une requête minuscule, au chargement, et le
    // signal vaut partout où la bulle est posée.
    app.get('/api/fil/nonlus', requireAuthApi, (req, res) => {
        res.json(nonLus(currentUser(req)));
    });

    // Quand un message arrive en direct alors que la feuille est ouverte :
    // il est lu à l'instant où il s'affiche, et le badge ne doit pas
    // repasser à un parce qu'on n'a pas refermé.
    app.post('/api/fil/lu', requireAuthApi, (req, res) => {
        marquerLu(currentUser(req));
        res.json({ ok: true });
    });

    // ---- Écrire ----
    app.post('/api/fil', requireAuthApi, (req, res) => {
        const pseudo = currentUser(req);
        const txt = String((req.body && req.body.text) || '').trim().slice(0, MAX_CARACTERES);
        if (!txt) return res.status(400).json({ error: 'Message vide.' });

        const liste = messages().slice();
        const sien = liste.filter(m => m && m.u === pseudo).slice(-1)[0];
        if (sien && Date.now() - sien.ts < ANTI_FLOOD_MS) {
            return res.status(429).json({ error: 'Doucement !' });
        }
        // ⚠️ `escapeHtml` à l'ÉCRITURE, comme la discussion du jour : le
        // message est stocké déjà échappé, donc une page qui l'afficherait
        // sans précaution reste sûre. Les deux fils doivent garder la même
        // règle, sinon l'un des deux finira par l'oublier.
        const msg = { u: pseudo, t: escapeHtml(txt), ts: Date.now() };
        liste.push(msg);
        if (liste.length > GARDE) liste.splice(0, liste.length - GARDE);
        mfSet(CLE, liste);
        marquerLu(pseudo);

        // Le direct, pour ceux qui sont là. Les autres le liront en passant.
        try { io.to(salle).emit('fil_message', msg); } catch (e) {}
        res.json({ ok: true, messages: liste.slice(-PAGE) });
    });

    // ---------------------------------------------------------------------
    //  LE FIL D'UNE TABLE — parler pendant la partie
    //
    //  ⚠️ IL NE VIT QUE LE TEMPS DE LA TABLE. Clé `tfil:<jeu>:<id>`, jamais
    //  relue ailleurs, ramassée par `mfPurge` : ce qui se dit pendant une
    //  partie de Yams n'a aucune raison de survivre à la partie, et un
    //  historique de table qu'on pourrait rouvrir six mois plus tard ne
    //  servirait à personne tout en pesant en base.
    //
    //  ⚠️ C'est le SEUL des trois fils qui s'identifie par le pseudo, et
    //  c'est voulu : une table est éphémère, personne ne se renomme au
    //  milieu d'une partie, et le jeu qui l'héberge raisonne déjà en
    //  pseudos de bout en bout. Y mettre des identifiants obligerait à les
    //  résoudre à chaque message pour afficher un nom que le jeu connaît
    //  déjà.
    // ---------------------------------------------------------------------
    const kTable = (jeu, id) => `tfil:${String(jeu).replace(/[^a-z]/g, '')}:${String(id).slice(0, 40)}`;
    const salleTable = (jeu, id) => `tfil_${jeu}_${id}`;

    app.get('/api/fil/table', requireAuthApi, (req, res) => {
        const cle = kTable(req.query.jeu, req.query.id);
        res.json({ messages: (mfGet(cle) || []).slice(-PAGE), moi: currentUser(req) });
    });

    app.post('/api/fil/table', requireAuthApi, (req, res) => {
        const pseudo = currentUser(req);
        const { jeu, id } = req.body || {};
        if (!jeu || !id) return res.status(400).json({ error: 'Table inconnue.' });
        const txt = String((req.body || {}).text || '').trim().slice(0, MAX_CARACTERES);
        if (!txt) return res.status(400).json({ error: 'Message vide.' });

        const cle = kTable(jeu, id);
        const liste = (mfGet(cle) || []).slice();
        const sien = liste.filter(m => m && m.u === pseudo).slice(-1)[0];
        if (sien && Date.now() - sien.ts < ANTI_FLOOD_MS) {
            return res.status(429).json({ error: 'Doucement !' });
        }
        const msg = { u: pseudo, t: escapeHtml(txt), ts: Date.now(), creeA: Date.now() };
        liste.push(msg);
        if (liste.length > GARDE) liste.splice(0, liste.length - GARDE);
        mfSet(cle, liste);
        try { io.to(salleTable(jeu, id)).emit('tfil_message', msg); } catch (e) {}
        res.json({ ok: true, messages: liste.slice(-PAGE) });
    });

    // Retirer un message. Réservé à l'admin, qui monte sa propre route :
    // on expose la mécanique, pas l'autorisation.
    function supprimer(ts) {
        const liste = messages();
        const reste = liste.filter(m => !m || m.ts !== ts);
        if (reste.length === liste.length) return false;
        mfSet(CLE, reste);
        try { io.to(salle).emit('fil_efface', { ts }); } catch (e) {}
        return true;
    }

    return { nonLus, supprimer, messages, CLE };
};
