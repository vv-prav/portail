// =====================================================================
//  L'ENTRAIDE — la page des éditeurs
//
//  Un éditeur a UN travail : remettre dedans quelqu'un qui s'est
//  enfermé dehors. Il voit donc les demandes d'aide, il peut chercher un
//  compte par son nom, et il a les deux boutons du dépannage. Rien
//  d'autre n'est servi ici : ni données, ni suppression, ni classement,
//  ni — surtout — les messages privés, que même l'administration ne
//  peut pas lire.
//
//  ⚠️ LES ROUTES NE SE CONTENTENT PAS DE `requireEditeur`. Chacune
//  revérifie `peutDepanner(moi, cible)` : un éditeur ne dépanne ni un
//  administrateur ni un autre éditeur, sinon le rôle serait une montée
//  en privilège déguisée — réinitialiser le mot de passe d'un
//  administrateur, c'en devenir un. La règle vit dans `server.js`, un
//  seul endroit, et elle est appliquée ici à chaque geste, jamais
//  seulement en cachant un bouton dans l'interface.
//
//  ⚠️ Les deux gestes eux-mêmes sont dans `comptes/depannage.js`, que
//  l'administration appelle aussi : les quatre règles du provisoire
//  (expiration, changement obligatoire, sessions fermées, demande
//  marquée traitée) ne doivent pas dépendre de la porte par laquelle on
//  est entré.
// =====================================================================
module.exports = function monterEntraide(app, ctx) {
    const { requireEditeur, currentUser, isAdmin, isEditeur, peutDepanner,
            users, depannage } = ctx;

    const G = (chemin, h) => app.get('/api/entraide' + chemin, requireEditeur, h);
    const P = (chemin, h) => app.post('/api/entraide' + chemin, requireEditeur, h);

    // La cible d'un geste : elle existe, et j'ai le droit d'y toucher.
    function cibleDe(req, res) {
        const pseudo = String((req.body || {}).pseudo || '').trim();
        if (!users()[pseudo]) { res.status(404).json({ error: 'Compte introuvable.' }); return null; }
        if (!peutDepanner(currentUser(req), pseudo)) {
            res.status(403).json({ error: 'Ce compte ne peut être dépanné que par un administrateur.' });
            return null;
        }
        return pseudo;
    }

    G('/demandes', (req, res) => {
        const moi = currentUser(req);
        const d = depannage.demandes(20);
        const decorer = (x) => ({ ...x, protege: !peutDepanner(moi, x.pseudo), existe: !!users()[x.pseudo] });
        res.json({
            moi, admin: isAdmin(moi),
            enAttente: d.enAttente.map(decorer),
            traitees: d.traitees,
        });
    });

    // Chercher un compte : tout le monde ne passe pas par le formulaire de
    // demande — on se fait souvent appeler directement. Les champs servis
    // sont ceux qui aident à reconnaître la personne, et rien de plus.
    G('/comptes', (req, res) => {
        const moi = currentUser(req);
        const q = String(req.query.q || '').trim().toLowerCase();
        const liste = Object.values(users())
            .filter(u => !q || (u.pseudo || '').toLowerCase().includes(q))
            .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0))
            .slice(0, 40)
            .map(u => ({
                pseudo: u.pseudo,
                avatar: u.avatar || '', avatarPhoto: u.avatarPhoto || '',
                lastSeen: u.lastSeen || u.lastLogin || 0,
                aUnCode: !!u.recoveryHash,
                enAttenteDeChangement: !!u.doitChanger,
                suspendu: !!u.banned,
                // Pour griser la ligne au lieu de laisser croire à une panne
                // quand les boutons refusent de marcher.
                protege: !peutDepanner(moi, u.pseudo),
                role: isAdmin(u.pseudo) ? 'admin' : (isEditeur(u.pseudo) ? 'editeur' : ''),
            }));
        res.json({ comptes: liste, total: Object.keys(users()).length });
    });

    P('/code', (req, res) => {
        const pseudo = cibleDe(req, res); if (!pseudo) return;
        const r = depannage.donnerUnCode(pseudo, currentUser(req));
        if (r.error) return res.status(400).json(r);
        res.json({ ok: true, ...r });
    });

    P('/provisoire', (req, res) => {
        const pseudo = cibleDe(req, res); if (!pseudo) return;
        const r = depannage.poserUnProvisoire(pseudo, currentUser(req));
        if (r.error) return res.status(400).json(r);
        res.json({ ok: true, ...r });
    });

    P('/ignorer', (req, res) => {
        const pseudo = String((req.body || {}).pseudo || '').trim();
        if (!peutDepanner(currentUser(req), pseudo)) return res.status(403).json({ error: 'Accès réservé.' });
        res.json(depannage.ignorer(pseudo, currentUser(req)));
    });

    return { enAttente: depannage.enAttente };
};
