// =====================================================================
//  INVITATION À UNE TABLE — composant partagé
//
//  Jusqu'ici, on ne pouvait jouer qu'à condition d'être déjà tous
//  connectés en même temps : rien ne permettait de convier quelqu'un.
//  C'est le vrai problème du multijoueur du salon, plus que les bugs —
//  Yams plafonnait à 4 joueurs, Motus Party à 2.
//
//  Ce fichier ajoute deux choses, identiques dans les quatre jeux :
//   • un bouton « Inviter » dans la salle d'attente, qui partage ou
//     copie un lien menant directement à la table ;
//   • la lecture de ce lien à l'arrivée (?table=<id>), pour rejoindre
//     sans passer par la liste des tables.
//
//  Les quatre jeux partagent déjà #v-waiting : le bouton s'y injecte
//  seul, aucune app n'a de HTML à ajouter.
//
//  Usage côté app :
//     Invitation.tableDuLien()        → l'id présent dans l'URL, ou null
//     Invitation.definirTable(id)     → affiche le bouton pour cette table
//     Invitation.effacer()            → à la sortie de la table
// =====================================================================
(function () {
    if (window.Invitation) return;              // déjà chargé sur cette page

    let bouton = null;
    let tableCourante = null;

    function lienVers(id) {
        return location.origin + location.pathname + '?table=' + encodeURIComponent(id);
    }

    function tableDuLien() {
        try {
            const id = new URLSearchParams(location.search).get('table');
            return id ? String(id) : null;
        } catch (e) { return null; }
    }

    // Une fois la table rejointe, on retire le paramètre de l'URL : sans ça, un
    // rechargement après avoir quitté la table tenterait de la rejoindre en boucle.
    function nettoyerLien() {
        if (!tableDuLien()) return;
        try { history.replaceState(null, '', location.pathname); } catch (e) {}
    }

    async function partager() {
        if (!tableCourante) return;
        const lien = lienVers(tableCourante);
        const texte = document.title + ' — rejoins-moi : ' + lien;
        try {
            if (navigator.share) { await navigator.share({ text: texte, url: lien }); return; }
        } catch (e) { if (e && e.name === 'AbortError') return; }
        try {
            await navigator.clipboard.writeText(lien);
            if (window.DS) DS.toast('Lien copié ✓');
        } catch (e) {
            if (window.DS) DS.confirm({ emoji: '🔗', title: 'Lien d’invitation', code: lien, cancelLabel: 'Fermer' });
        }
    }

    function creerBouton() {
        const salle = document.getElementById('v-waiting');
        if (!salle) return null;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ds-btn ghost small inv-btn';
        b.textContent = '🔗 Inviter';
        b.addEventListener('click', partager);
        // Juste sous la liste des joueurs : c'est là qu'on constate qu'il manque
        // du monde, donc là qu'on a envie d'inviter.
        const liste = document.getElementById('wait-players');
        if (liste && liste.parentNode === salle) liste.insertAdjacentElement('afterend', b);
        else salle.appendChild(b);
        return b;
    }

    function definirTable(id) {
        tableCourante = id ? String(id) : null;
        if (!bouton) bouton = creerBouton();
        if (bouton) bouton.hidden = !tableCourante;
        if (tableCourante) nettoyerLien();
    }

    function effacer() {
        tableCourante = null;
        if (bouton) bouton.hidden = true;
    }

    window.Invitation = { tableDuLien, definirTable, effacer, lienVers };
})();
