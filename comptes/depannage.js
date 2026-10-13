// =====================================================================
//  LE DÉPANNAGE D'UN COMPTE — les deux gestes, écrits une seule fois
//
//  Quelqu'un qui a perdu son mot de passe ET son code de récupération
//  dépose une demande (`comptes:demandes`). Deux façons de le dépanner,
//  et elles existaient toutes les deux dans `admin/routes.js` :
//    · lui donner un code de récupération neuf — le geste normal, il
//      choisit lui-même son nouveau mot de passe, rien n'expire ;
//    · lui poser un mot de passe provisoire — quand il faut aller vite.
//
//  ⚠️ CE FICHIER EXISTE PARCE QUE DEUX RÔLES FONT MAINTENANT CES
//  GESTES : l'administrateur, et l'éditeur. Recopiées dans les deux
//  interfaces, les quatre règles ci-dessous auraient fini par diverger
//  dans l'une des deux — et c'est précisément le genre d'écart qu'on ne
//  découvre que le jour où quelqu'un est bloqué dehors.
//
//  Les quatre règles, donc, et elles valent pour les deux rôles :
//    1. le provisoire porte `doitChanger` ET `tempExpire` (24 h) : il a
//       été lu par quelqu'un d'autre, il ne doit ni durer ni rester le
//       mot de passe du compte ;
//    2. le provisoire ferme les sessions ouvertes (`sessionEpoch`) ;
//    3. les deux gestes marquent la demande TRAITÉE — le code ne le
//       faisait pas, et la demande restait en attente pour toujours
//       alors que c'était réglé ;
//    4. les deux gestes passent au journal, sous le nom de qui les a
//       faits : c'est ce qui permet à l'administrateur de voir, au
//       retour, ce que les éditeurs ont fait pendant son absence.
// =====================================================================
const CLE = 'comptes:demandes';

module.exports = function monterLeDepannage(deps) {
    const { users, saveUsers, hashPassword, makeRecoveryCode,
            motDePasseProvisoire, mfGet, mfSet, journaliser } = deps;

    const toutes = () => mfGet(CLE) || [];

    /** Les demandes, les plus récentes d'abord. */
    function demandes(nbTraitees = 20) {
        const liste = toutes().slice().reverse();
        return {
            enAttente: liste.filter(d => !d.traitee),
            traitees: liste.filter(d => d.traitee).slice(0, nbTraitees),
        };
    }

    const enAttente = () => toutes().filter(d => !d.traitee).length;

    // ⚠️ Règle 3 : les deux gestes appellent ceci. Une demande réglée qui
    // reste affichée « en attente » fait chercher un problème qui n'existe
    // plus — et, à l'inverse, fait douter de celles qui attendent vraiment.
    function marquerTraitee(pseudo, par, extra) {
        mfSet(CLE, toutes().map(d => (d.pseudo === pseudo && !d.traitee
            ? { ...d, traitee: true, traiteeLe: Date.now(), par, ...(extra || {}) }
            : d)));
    }

    /** Un code de récupération neuf. L'ancien est invalidé. */
    function donnerUnCode(pseudo, par) {
        const u = users()[pseudo];
        if (!u) return { error: 'Compte introuvable.' };
        const code = makeRecoveryCode();
        u.recoveryHash = hashPassword(code);
        saveUsers(true);
        marquerTraitee(pseudo, par);
        journaliser(par, 'nouveau code', pseudo);
        return { recoveryCode: code };
    }

    /** Un mot de passe provisoire, valable 24 h, à changer à l'arrivée. */
    function poserUnProvisoire(pseudo, par) {
        const u = users()[pseudo];
        if (!u) return { error: 'Compte introuvable.' };
        const temp = motDePasseProvisoire();
        u.passwordHash = hashPassword(temp);
        u.sessionEpoch = Date.now();          // règle 2
        u.doitChanger = true;                 // règle 1
        u.tempExpire = Date.now() + 24 * 3600 * 1000;
        saveUsers(true);
        marquerTraitee(pseudo, par);
        journaliser(par, 'mot de passe provisoire', pseudo);
        return { tempPassword: temp, expireDans: '24 heures' };
    }

    /** Écarter une demande sans rien faire (doublon, erreur, déjà réglé à l'oral). */
    function ignorer(pseudo, par) {
        marquerTraitee(pseudo, par, { ignoree: true });
        journaliser(par, 'demande d’aide ignorée', pseudo);
        return { ok: true };
    }

    return { demandes, enAttente, donnerUnCode, poserUnProvisoire, ignorer, CLE };
};
