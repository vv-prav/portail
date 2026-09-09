// =====================================================================
//  ENCHAÎNEMENT DES JEUX DU JOUR — composant partagé
//
//  Les jeux du jour forment une séquence : on les fait l'un après
//  l'autre, tous les matins. Mais chaque écran de fin s'arrêtait à
//  « Retour au salon » — une sortie, pas une suite. Ce fichier propose
//  le jeu suivant non fait, directement depuis l'écran de fin.
//
//  Il s'injecte seul dans la carte de fin, comme /invitation.js le fait
//  dans la salle d'attente : aucune app n'a de HTML à ajouter.
//
//  Usage : Enchainement.proposer('motus', document.getElementById('mt-end'));
// =====================================================================
(function () {
    if (window.Enchainement) return;

    const JEUX = [
        { id: 'motus', nom: 'Motus', emoji: '🟨', href: '/motus/quotidien/' },
        { id: 'mf', nom: 'les Mots Fléchés', emoji: '🧩', href: '/mots-fleches' },
        { id: 'motjuste', nom: 'Le Mot Juste', emoji: '🧊', href: '/motjuste' },
        { id: 'chiffres', nom: 'Le compte est bon', emoji: '🔢', href: '/chiffres' },
        { id: 'geo', nom: 'la Géographie', emoji: '🌍', href: '/geo' },
    ];

    // Un jeu est « fait » quand la manche du jour est terminée, gagnée ou non :
    // proposer de refaire une grille déjà rendue n'aurait pas de sens.
    function estFait(id, pouls) {
        if (!pouls) return false;
        if (id === 'mf' || id === 'geo') {
            const m = pouls[id] || {};
            return !!(m.total && m.done >= m.total);
        }
        const g = pouls[id === 'motjuste' ? 'motjuste' : id] || {};
        return !!(g.done || g.over);
    }

    async function lirePouls() {
        try {
            const res = await fetch('/api/salon/pulse');
            if (res.ok) return await res.json();
        } catch (e) {}
        return null;
    }

    function suivantDans(pouls, idCourant) {
        if (!pouls) return null;
        // On repart du jeu courant et on avance dans l'ordre, en bouclant :
        // l'ordre de la séquence reste le même que sur le panneau du salon.
        const depart = Math.max(0, JEUX.findIndex(j => j.id === idCourant));
        for (let i = 1; i <= JEUX.length; i++) {
            const j = JEUX[(depart + i) % JEUX.length];
            if (j.id !== idCourant && !estFait(j.id, pouls)) return j;
        }
        return null;   // tous les jeux du jour sont faits
    }
    async function suivant(idCourant) { return suivantDans(await lirePouls(), idCourant); }

    // -----------------------------------------------------------------
    //  L'ANNONCE D'UNE TABLE
    //
    //  Les jeux du jour font 90 % du passage ; le hall multijoueur est une
    //  pièce devant laquelle personne ne marche. Une table qui s'ouvre n'a
    //  donc aucune chance d'être vue — sauf ici, à l'instant précis où
    //  quelqu'un vient de finir sa manche et se demande quoi faire.
    //
    //  Elle passe AVANT le jeu du jour suivant : une table attend du monde
    //  maintenant, la grille de demain attendra.
    // -----------------------------------------------------------------
    function annonceDe(pouls) {
        if (!pouls) return null;
        const t = (pouls.tablesOuvertes || [])[0];
        if (t) {
            const qui = t.presents && t.presents.length ? t.presents[0] : t.hote;
            return { href: t.href, texte: `${t.emoji} ${qui} attend au ${t.nom} ›` };
        }
        // Sinon, le prochain rendez-vous — moins urgent, mais c'est encore le
        // meilleur endroit pour l'apprendre.
        const r = (pouls.rendezvous || [])[0];
        if (r) {
            const d = new Date(r.quand);
            const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            const demain = new Date(); demain.setDate(demain.getDate() + 1);
            const jour = d.toDateString() === new Date().toDateString() ? 'ce soir'
                : (d.toDateString() === demain.toDateString() ? 'demain'
                   : d.toLocaleDateString('fr-FR', { weekday: 'long' }));
            return { href: '/jouer/', texte: `${r.emoji} ${r.nom} ${jour} à ${heure} ›`, discret: true };
        }
        return null;
    }

    // Insère le bouton dans la carte de fin, juste avant le retour au salon.
    async function proposer(idCourant, carte) {
        if (!carte) return;
        const pouls = await lirePouls();
        carte.querySelectorAll('.ench-suite, .ench-table').forEach(x => x.remove());

        const retour = carte.querySelector('a[href="/"]');
        const poser = (el) => {
            if (retour) retour.insertAdjacentElement('beforebegin', el);
            else carte.appendChild(el);
        };

        const j = suivantDans(pouls, idCourant);
        if (j) {
            const a = document.createElement('a');
            a.className = 'ds-btn ench-suite';
            a.href = j.href;
            a.textContent = `${j.emoji} Au tour de ${j.nom} ›`;
            poser(a);
        }
        // Posée après, donc affichée avant le jeu suivant : ce qui attend du
        // monde maintenant passe devant ce qui attendra demain.
        const t = annonceDe(pouls);
        if (t) {
            const a = document.createElement('a');
            a.className = 'ds-btn ench-table' + (t.discret ? ' ghost' : '');
            a.href = t.href;
            a.textContent = t.texte;
            const premier = carte.querySelector('.ench-suite');
            if (premier) premier.insertAdjacentElement('beforebegin', a); else poser(a);
        }
    }

    window.Enchainement = { proposer, suivant, annonceDe, lirePouls };
})();
