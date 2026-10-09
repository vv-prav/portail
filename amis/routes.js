// =====================================================================
//  LES AMIS, ET LES MESSAGES PRIVÉS
//
//  ⚠️ TOUT ICI S'IDENTIFIE PAR L'IDENTIFIANT INTERNE, JAMAIS PAR LE
//  PSEUDO. C'est la première partie du salon à le faire, et c'est ce qui
//  la rend immunisée au renommage : `comptes/renommage.js` n'a pas une
//  ligne à connaître de ce module, et n'en aura jamais. Une amitié ou une
//  conversation survit donc à un changement de pseudo sans que personne
//  n'ait rien à migrer. Le pseudo n'est qu'un libellé qu'on résout au
//  moment d'afficher.
//
//  ⚠️ L'ADMINISTRATION NE PEUT PAS LIRE LES MESSAGES PRIVÉS. Décision
//  explicite : aucune route d'admin ne les sert, aucune ne les supprime.
//  Conséquence assumée — zéro modération sur cette partie-là, là où le fil
//  du salon, lui, reste modérable. Effet de bord heureux de l'identifiant
//  interne : même le NOM d'une clé (`mp:u3f9…|u2a7…`) ne dit plus qui
//  parle à qui dans le relevé du poids des données.
//
//  ⚠️ L'AMITIÉ SE DEMANDE ET S'ACCEPTE, mais ÉCRIRE NE L'EXIGE PAS. Tout
//  le monde peut écrire à tout le monde — c'est déjà vrai dans le fil du
//  salon, et le contraire serait incompréhensible dans un cercle où tout
//  le monde se connaît en vrai. L'amitié sert à se faire une courte liste
//  parmi les trente-deux, pas à ouvrir une porte.
//
//  Les clés :
//    · `amis:<id>`           — ses amis (liste d'identifiants)
//    · `amis:dem:<id>`       — les demandes REÇUES : [{de, quand}]
//    · `mp:<idA>|<idB>`      — la conversation, identifiants TRIÉS
//    · `mp:lu:<id>:<autre>`  — où il en est de sa lecture
// =====================================================================
module.exports = function monterLesAmis(app, io, deps) {
    const { requireAuthApi, currentUser, mfGet, mfSet, mfDel, escapeHtml,
            comptes, idDe, pseudoDe, salle } = deps;
    // ⚠️ Ne notifie que ce qui est ADRESSÉ à quelqu'un : un privé, une
    // demande d'ami. Jamais le fil du salon — trente-deux personnes
    // réveillées à chaque message feraient désinstaller la webapp.
    const prevenir = deps.prevenir || (() => {});

    const GARDE = 200;
    const PAGE = 60;
    const MAX_CARACTERES = 240;
    const ANTI_FLOOD_MS = 4000;

    const kAmis = (id) => `amis:${id}`;
    const kDem = (id) => `amis:dem:${id}`;
    const kLu = (id, autre) => `mp:lu:${id}:${autre}`;
    // ⚠️ Les deux identifiants TRIÉS : sans ça, `mp:A|B` et `mp:B|A`
    // seraient deux conversations différentes selon qui ouvre la fenêtre,
    // et chacun parlerait seul dans la sienne.
    const kMp = (a, b) => 'mp:' + [a, b].sort().join('|');

    const amisDe = (id) => mfGet(kAmis(id)) || [];
    const demandesDe = (id) => mfGet(kDem(id)) || [];
    const sontAmis = (a, b) => amisDe(a).includes(b);

    // La fiche minimale d'une personne, telle qu'on l'affiche. Le pseudo est
    // résolu ICI, au dernier moment : rien ne le stocke.
    function fiche(id) {
        const pseudo = pseudoDe(id);
        if (!pseudo) return null;
        const u = comptes()[pseudo];
        return {
            id, pseudo,
            avatar: (u && u.avatar) || '', avatarPhoto: (u && u.avatarPhoto) || '',
            enLigne: !!(u && u.lastSeen && Date.now() - u.lastSeen < 90 * 1000),
        };
    }

    // ---------------------------------------------------------------
    //  LES AMIS
    // ---------------------------------------------------------------
    app.get('/api/amis', requireAuthApi, (req, res) => {
        const moi = idDe(currentUser(req));
        if (!moi) return res.status(400).json({ error: 'Compte sans identifiant.' });

        // ⚠️ Les demandes que J'AI envoyées se déduisent, elles ne se
        // stockent pas : une seconde liste à tenir à jour, c'est une seconde
        // occasion de la laisser diverger — on l'a déjà payé ailleurs.
        const envoyees = [];
        for (const u of Object.values(comptes())) {
            if (!u || !u.id || u.id === moi) continue;
            if (demandesDe(u.id).some(d => d && d.de === moi)) envoyees.push(u.id);
        }

        res.json({
            moi,
            amis: amisDe(moi).map(fiche).filter(Boolean).map(f => ({ ...f, nonLus: nonLusEntre(moi, f.id) })),
            demandes: demandesDe(moi).map(d => ({ ...fiche(d.de), quand: d.quand })).filter(f => f.id),
            envoyees,
        });
    });

    // Tout le salon, avec l'état de chacun vis-à-vis de moi. ⚠️ Pas de
    // recherche côté serveur : à trente-deux comptes, la liste entière pèse
    // moins qu'une requête par frappe, et le filtre se fait dans le navigateur.
    app.get('/api/amis/salon', requireAuthApi, (req, res) => {
        const moi = idDe(currentUser(req));
        const mesAmis = amisDe(moi);
        const recues = demandesDe(moi).map(d => d.de);
        const gens = [];
        for (const u of Object.values(comptes())) {
            if (!u || !u.id || u.id === moi) continue;
            const f = fiche(u.id);
            if (!f) continue;
            f.etat = mesAmis.includes(u.id) ? 'ami'
                : recues.includes(u.id) ? 'demande-recue'
                : demandesDe(u.id).some(d => d && d.de === moi) ? 'demande-envoyee'
                : 'rien';
            gens.push(f);
        }
        gens.sort((a, b) => (b.enLigne - a.enLigne) || a.pseudo.localeCompare(b.pseudo, 'fr'));
        res.json({ gens });
    });

    app.post('/api/amis/demander', requireAuthApi, (req, res) => {
        const moi = idDe(currentUser(req));
        const cible = String((req.body || {}).id || '');
        if (!moi || !cible || cible === moi) return res.status(400).json({ error: 'Demande impossible.' });
        if (!pseudoDe(cible)) return res.status(404).json({ error: 'Compte introuvable.' });
        if (sontAmis(moi, cible)) return res.json({ ok: true, deja: true });

        // ⚠️ Si l'autre m'a déjà demandé, sa demande VAUT acceptation : on ne
        // fait pas se croiser deux demandes en attente, que personne ne
        // saurait plus comment dénouer.
        if (demandesDe(moi).some(d => d && d.de === cible)) return accepter(moi, cible, res);

        const liste = demandesDe(cible).slice();
        if (liste.some(d => d && d.de === moi)) return res.json({ ok: true, deja: true });
        liste.push({ de: moi, quand: Date.now() });
        mfSet(kDem(cible), liste);
        prevenirSocket(cible);
        prevenir(cible, {
            titre: 'Le Salon',
            corps: `${pseudoDe(moi)} aimerait être ton ami`,
            // ⚠️ Le tag porte l'ÉMETTEUR, pas le type : avec un tag fixe,
            // la demande de Chloé remplaçait celle de Bo sur l'écran et on
            // en perdait une. Grouper deux messages d'une même personne est
            // une politesse ; grouper deux personnes est une perte.
            url: '/', tag: 'ami:' + moi,
        });
        res.json({ ok: true });
    });

    function accepter(moi, autre, res) {
        mfSet(kDem(moi), demandesDe(moi).filter(d => !d || d.de !== autre));
        // L'amitié est RÉCIPROQUE et écrite des deux côtés : la lire d'un seul
        // obligerait à parcourir tous les comptes pour savoir qui m'a ajouté.
        for (const [a, b] of [[moi, autre], [autre, moi]]) {
            const l = amisDe(a);
            if (!l.includes(b)) mfSet(kAmis(a), l.concat(b));
        }
        prevenirSocket(autre);
        if (res) res.json({ ok: true });
    }

    app.post('/api/amis/accepter', requireAuthApi, (req, res) => {
        const moi = idDe(currentUser(req));
        const autre = String((req.body || {}).id || '');
        if (!demandesDe(moi).some(d => d && d.de === autre)) {
            return res.status(400).json({ error: 'Aucune demande de cette personne.' });
        }
        accepter(moi, autre, res);
    });

    app.post('/api/amis/refuser', requireAuthApi, (req, res) => {
        const moi = idDe(currentUser(req));
        const autre = String((req.body || {}).id || '');
        mfSet(kDem(moi), demandesDe(moi).filter(d => !d || d.de !== autre));
        // ⚠️ Celui qui a demandé n'est PAS prévenu d'un refus. Dans un cercle
        // où tout le monde se voit en vrai, annoncer un refus coûte cher et
        // n'apporte rien : la demande disparaît simplement, et il peut la
        // reposer plus tard.
        res.json({ ok: true });
    });

    app.post('/api/amis/retirer', requireAuthApi, (req, res) => {
        const moi = idDe(currentUser(req));
        const autre = String((req.body || {}).id || '');
        for (const [a, b] of [[moi, autre], [autre, moi]]) {
            mfSet(kAmis(a), amisDe(a).filter(x => x !== b));
        }
        // ⚠️ La conversation, elle, n'est PAS effacée : ce qu'on s'est dit ne
        // disparaît pas parce qu'on se retire d'une liste.
        // Et on ne NOTIFIE pas un retrait : l'annoncer serait blessant pour
        // rien, dans un cercle où l'on se voit en vrai. La liste de l'autre
        // se met à jour en silence.
        prevenirSocket(autre);
        res.json({ ok: true });
    });

    // ---------------------------------------------------------------
    //  LES MESSAGES PRIVÉS
    // ---------------------------------------------------------------
    function nonLusEntre(moi, autre) {
        const depuis = Number(mfGet(kLu(moi, autre))) || 0;
        return (mfGet(kMp(moi, autre)) || []).filter(m => m && m.ts > depuis && m.de !== moi).length;
    }

    // Le total, pour le point rouge de la bulle.
    function nonLus(pseudo) {
        const moi = idDe(pseudo);
        if (!moi) return { nonLus: 0, conversations: 0, demandes: 0 };
        let total = 0, fils = 0;
        for (const u of Object.values(comptes())) {
            if (!u || !u.id || u.id === moi) continue;
            const n = nonLusEntre(moi, u.id);
            if (n) { total += n; fils++; }
        }
        return { nonLus: total, conversations: fils, demandes: demandesDe(moi).length };
    }

    // Le compte seul, sans rien marquer — comme pour le fil, et pour la même
    // raison : la bulle vit sur huit pages dont une seule appelle le pouls.
    app.get('/api/amis/nonlus', requireAuthApi, (req, res) => {
        res.json(nonLus(currentUser(req)));
    });

    app.get('/api/mp', requireAuthApi, (req, res) => {
        const moi = idDe(currentUser(req));
        const autre = String(req.query.id || '');
        if (!moi || !pseudoDe(autre)) return res.status(404).json({ error: 'Conversation introuvable.' });
        const liste = mfGet(kMp(moi, autre)) || [];
        const avant = Number(mfGet(kLu(moi, autre))) || 0;
        mfSet(kLu(moi, autre), liste.length ? liste[liste.length - 1].ts : Date.now());
        res.json({ moi, avec: fiche(autre), messages: liste.slice(-PAGE), luJusqua: avant });
    });

    app.post('/api/mp', requireAuthApi, (req, res) => {
        const moi = idDe(currentUser(req));
        const autre = String((req.body || {}).id || '');
        if (!moi || !pseudoDe(autre) || autre === moi) {
            return res.status(400).json({ error: 'Destinataire introuvable.' });
        }
        const txt = String((req.body || {}).text || '').trim().slice(0, MAX_CARACTERES);
        if (!txt) return res.status(400).json({ error: 'Message vide.' });

        const cle = kMp(moi, autre);
        const liste = (mfGet(cle) || []).slice();
        const sien = liste.filter(m => m && m.de === moi).slice(-1)[0];
        if (sien && Date.now() - sien.ts < ANTI_FLOOD_MS) {
            return res.status(429).json({ error: 'Doucement !' });
        }
        // `escapeHtml` à l'écriture, comme les deux autres fils : la règle est
        // la même partout, sinon l'un des trois finira par l'oublier.
        const msg = { de: moi, t: escapeHtml(txt), ts: Date.now() };
        liste.push(msg);
        if (liste.length > GARDE) liste.splice(0, liste.length - GARDE);
        mfSet(cle, liste);
        mfSet(kLu(moi, autre), msg.ts);

        // ⚠️ On émet vers la salle PERSONNELLE du destinataire, jamais vers
        // une salle commune : un message privé diffusé à tout le monde ne
        // serait plus privé du tout.
        try { io.to(salle(autre)).emit('mp_message', { avec: moi, msg }); } catch (e) {}

        // ⚠️ Le `tag` porte la conversation : trois messages d'affilée de la
        // même personne remplacent la notification précédente au lieu d'en
        // empiler trois. C'est la différence entre « on te parle » et « cette
        // appli me harcèle ».
        // ⚠️ Et le CONTENU du message n'est PAS envoyé : il s'afficherait sur
        // un écran verrouillé, à la vue de n'importe qui. Un message privé
        // qui s'annonce en clair n'est plus privé.
        prevenir(autre, {
            titre: pseudoDe(moi) || 'Le Salon',
            corps: 't\u2019a écrit',
            url: '/', tag: 'mp:' + moi,
        });
        res.json({ ok: true, messages: liste.slice(-PAGE) });
    });

    // Prévenir quelqu'un, par socket, que sa liste a changé.
    function prevenirSocket(id) {
        try { io.to(salle(id)).emit('amis_bouge'); } catch (e) {}
    }

    // ⚠️ La suppression d'un compte ne passe PAS par `seg[2] === pseudo` :
    // ces clés portent des identifiants. C'est le seul endroit qui sait les
    // reconnaître, et l'admin l'appelle.
    //
    // ⚠️ ELLE PREND L'IDENTIFIANT, PAS LE PSEUDO, et c'est une question
    // d'ordre : la route d'admin retire le compte de `registeredUsers` AVANT
    // de nettoyer les données. `idDe(pseudo)` y renverrait donc `null`, et ce
    // ménage ne ferait rien du tout — en silence. L'appelant capture l'id
    // pendant que le compte existe encore.
    function effacerLesDonnees(id) {
        if (!id) return 0;
        let n = 0;
        for (const cle of Object.keys(deps.cache())) {
            const concerne =
                cle === kAmis(id) || cle === kDem(id) ||
                (cle.startsWith('mp:lu:') && cle.split(':')[2] === id) ||
                (cle.startsWith('mp:') && !cle.startsWith('mp:lu:') && cle.slice(3).split('|').includes(id));
            if (concerne) { mfDel(cle); n++; }
        }
        // Et son nom dans les listes des autres.
        for (const u of Object.values(comptes())) {
            if (!u || !u.id || u.id === id) continue;
            const l = amisDe(u.id);
            if (l.includes(id)) { mfSet(kAmis(u.id), l.filter(x => x !== id)); n++; }
            const d = demandesDe(u.id);
            if (d.some(x => x && x.de === id)) { mfSet(kDem(u.id), d.filter(x => !x || x.de !== id)); n++; }
        }
        return n;
    }

    return {
        nonLus, effacerLesDonnees, amisDe,
        estAmi: sontAmis,
        // `demandeDe(chez, de)` : « de » a-t-il une demande en attente chez
        // « chez » ? Sert à la bulle de profil, qui doit savoir quel bouton
        // proposer sans refaire le raisonnement de son côté.
        demandeDe: (chez, de) => demandesDe(chez).some(d => d && d.de === de),
    };
};
