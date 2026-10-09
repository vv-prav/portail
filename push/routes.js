// =====================================================================
//  LES NOTIFICATIONS PUSH
//
//  ⚠️ CE QUI EST ADRESSÉ À UNE PERSONNE, ET RIEN D'AUTRE. Le salon avait
//  posé une règle — « aucune notification, la pastille attend qu'on
//  passe » — et elle reste vraie pour le fil commun : trente-deux
//  personnes réveillées à chaque message, c'est le meilleur moyen de
//  faire désinstaller la webapp. Ce qui change avec les amis, c'est qu'il
//  existe désormais des messages ADRESSÉS : un privé, une demande d'ami,
//  une invitation à une partie. Ceux-là peuvent sonner, parce qu'ils
//  attendent une réponse de quelqu'un en particulier.
//
//  Ce qui ne notifie JAMAIS, et il faut que ça le reste :
//    · le fil du salon ;
//    · un défi lancé à tout le monde ;
//    · l'activité ambiante (untel a joué, untel s'est connecté).
//
//  ⚠️ iOS NE DÉLIVRE QU'À UNE WEBAPP INSTALLÉE SUR L'ÉCRAN D'ACCUEIL
//  (16.4 et au-delà). Dans Safari, l'abonnement échoue, et c'est normal :
//  le client le dit en clair plutôt que de laisser croire à une panne.
//
//  Les clés : `push:<id>` — ses abonnements (un par appareil). Identifiant
//  interne, comme tout ce qui est neuf : un renommage ne les perd pas.
// =====================================================================
const webpush = require('web-push');

module.exports = function monterLePush(app, deps) {
    const { requireAuthApi, currentUser, mfGet, mfSet, mfDel, idDe } = deps;

    const kAbos = (id) => `push:${id}`;
    const CLE_VAPID = 'push:vapid';

    // ⚠️ LES CLÉS VAPID DOIVENT SURVIVRE AUX REDÉMARRAGES. En changer
    // invalide TOUS les abonnements d'un coup, et personne ne comprendrait
    // pourquoi les notifications se sont tues. Les variables
    // d'environnement sont la bonne place ; à défaut on les fabrique une
    // fois et on les range en base, ce qui marche sur Render grâce à Redis
    // — et le journal le dit, parce que ça reste le second choix.
    let VAPID = null;
    function clefs() {
        if (VAPID) return VAPID;
        if (process.env.VAPID_PUBLIC && process.env.VAPID_PRIVATE) {
            VAPID = { publicKey: process.env.VAPID_PUBLIC, privateKey: process.env.VAPID_PRIVATE };
        } else {
            VAPID = mfGet(CLE_VAPID) || null;
            if (!VAPID) {
                VAPID = webpush.generateVAPIDKeys();
                mfSet(CLE_VAPID, VAPID);
                console.log('🔔 Clés VAPID fabriquées et rangées en base.');
                console.log('   À poser en variables d\'environnement sur Render :');
                console.log('   VAPID_PUBLIC=' + VAPID.publicKey);
                console.log('   VAPID_PRIVATE=' + VAPID.privateKey);
            }
        }
        webpush.setVapidDetails('mailto:salon@erquy.local', VAPID.publicKey, VAPID.privateKey);
        return VAPID;
    }

    const abosDe = (id) => mfGet(kAbos(id)) || [];

    // ---------------------------------------------------------------
    //  S'abonner, se désabonner
    // ---------------------------------------------------------------
    app.get('/api/push/cle', requireAuthApi, (req, res) => {
        res.json({ cle: clefs().publicKey });
    });

    app.post('/api/push/abonner', requireAuthApi, (req, res) => {
        const id = idDe(currentUser(req));
        const abo = (req.body || {}).abonnement;
        if (!id || !abo || !abo.endpoint) return res.status(400).json({ error: 'Abonnement invalide.' });
        const liste = abosDe(id).filter(a => a && a.endpoint !== abo.endpoint);
        // Un abonnement par appareil : on garde les autres, on ne remplace
        // que celui qui porte le même point d'arrivée.
        liste.push({ endpoint: abo.endpoint, keys: abo.keys, depuis: Date.now() });
        mfSet(kAbos(id), liste.slice(-6));
        res.json({ ok: true, appareils: liste.length });
    });

    app.post('/api/push/desabonner', requireAuthApi, (req, res) => {
        const id = idDe(currentUser(req));
        const fin = (req.body || {}).endpoint;
        if (!id) return res.status(400).json({ error: 'Compte inconnu.' });
        // Sans point d'arrivée précisé, on coupe tout : c'est ce qu'attend
        // quelqu'un qui bascule l'interrupteur « ne plus être prévenu ».
        mfSet(kAbos(id), fin ? abosDe(id).filter(a => a && a.endpoint !== fin) : []);
        res.json({ ok: true });
    });

    app.get('/api/push/etat', requireAuthApi, (req, res) => {
        const id = idDe(currentUser(req));
        res.json({ cle: clefs().publicKey, appareils: id ? abosDe(id).length : 0 });
    });

    // ---------------------------------------------------------------
    //  Envoyer
    // ---------------------------------------------------------------
    /**
     * Prévenir quelqu'un. Ne jette jamais : une notification qui ne part
     * pas ne doit pas faire échouer l'action qui l'a déclenchée — envoyer
     * un message doit marcher même si le service de push est en panne.
     * @param {string} id       l'identifiant interne du destinataire
     * @param {object} contenu  { titre, corps, url, tag }
     */
    async function prevenir(id, contenu) {
        if (!id) return;
        const liste = abosDe(id);
        if (!liste.length) return;
        clefs();
        const charge = JSON.stringify({
            titre: contenu.titre || 'Le Salon',
            corps: contenu.corps || '',
            url: contenu.url || '/',
            tag: contenu.tag || 'salon',
        });
        const morts = [];
        await Promise.all(liste.map(async (a) => {
            try {
                await webpush.sendNotification({ endpoint: a.endpoint, keys: a.keys }, charge);
            } catch (e) {
                // ⚠️ 404 et 410 veulent dire que l'abonnement est MORT — la
                // webapp a été désinstallée, ou le navigateur l'a révoqué.
                // Sans ce ménage, la liste grossirait pour toujours et on
                // tenterait d'écrire à des appareils disparus à chaque
                // message. Toute autre erreur (réseau, 5xx) n'est pas une
                // preuve de mort : on garde l'abonnement.
                if (e && (e.statusCode === 404 || e.statusCode === 410)) morts.push(a.endpoint);
            }
        }));
        if (morts.length) mfSet(kAbos(id), abosDe(id).filter(a => a && !morts.includes(a.endpoint)));
    }

    // Le ménage à la suppression d'un compte. Comme pour les amis, la clé
    // porte l'identifiant : `supprimerDonneesJoueur()` ne la trouverait pas.
    function effacerLesDonnees(id) {
        if (!id || !mfGet(kAbos(id))) return 0;
        mfDel(kAbos(id));
        return 1;
    }

    return { prevenir, effacerLesDonnees };
};
