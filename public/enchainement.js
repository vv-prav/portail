// =====================================================================
//  ENCHAÎNEMENT DES JEUX DU JOUR — composant partagé
//
//  Les trois jeux du jour forment une séquence : on les fait l'un après
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
    ];

    // Un jeu est « fait » quand la manche du jour est terminée, gagnée ou non :
    // proposer de refaire une grille déjà rendue n'aurait pas de sens.
    function estFait(id, pouls) {
        if (!pouls) return false;
        if (id === 'mf') {
            const m = pouls.mf || {};
            return !!(m.total && m.done >= m.total);
        }
        const g = pouls[id === 'motjuste' ? 'motjuste' : id] || {};
        return !!(g.done || g.over);
    }

    async function suivant(idCourant) {
        let pouls = null;
        try {
            const res = await fetch('/api/salon/pulse');
            if (res.ok) pouls = await res.json();
        } catch (e) { return null; }
        if (!pouls) return null;
        // On repart du jeu courant et on avance dans l'ordre, en bouclant :
        // l'ordre de la séquence reste le même que sur le panneau du salon.
        const depart = Math.max(0, JEUX.findIndex(j => j.id === idCourant));
        for (let i = 1; i <= JEUX.length; i++) {
            const j = JEUX[(depart + i) % JEUX.length];
            if (j.id !== idCourant && !estFait(j.id, pouls)) return j;
        }
        return null;   // les trois sont faits
    }

    // Insère le bouton dans la carte de fin, juste avant le retour au salon.
    async function proposer(idCourant, carte) {
        if (!carte) return;
        const j = await suivant(idCourant);
        const ancien = carte.querySelector('.ench-suite');
        if (ancien) ancien.remove();
        if (!j) return;
        const a = document.createElement('a');
        a.className = 'ds-btn ench-suite';
        a.href = j.href;
        a.textContent = `${j.emoji} Au tour de ${j.nom} ›`;
        const retour = carte.querySelector('a[href="/"]');
        if (retour) retour.insertAdjacentElement('beforebegin', a);
        else carte.appendChild(a);
    }

    window.Enchainement = { proposer, suivant };
})();
