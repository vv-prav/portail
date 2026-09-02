// =====================================================================
//  GESTE RETOUR — composant partagé
//
//  Les jeux changent de vue sans changer d'URL (v-lobby → v-waiting →
//  v-game). Le geste « retour » du téléphone quittait donc l'application
//  entière, là où l'utilisateur attendait de revenir à l'écran précédent.
//  C'est le détail qui distingue une vraie app d'une page web.
//
//  Ce fichier pousse un état dans l'historique à chaque changement de
//  vue et l'intercepte. Il ne décide de rien : le jeu lui dit quoi faire
//  quand on revient en arrière.
//
//  Usage :
//     Vues.suivre('v-waiting');              // à la fin de showView()
//     Vues.surRetour((precedente) => {...});  // ce que fait le retour
// =====================================================================
(function () {
    if (window.Vues) return;

    let pile = [];
    let rappel = null;
    let onIgnoreLeProchain = false;   // le popstate qu'on déclenche nous-mêmes

    function suivre(vue) {
        if (!vue) return;
        const sommet = pile[pile.length - 1];
        if (sommet === vue) return;                       // rien n'a changé
        // Revenir sur une vue déjà empilée (retour au hall, par exemple) : on
        // dépile jusqu'à elle plutôt que d'empiler un doublon, sinon l'historique
        // grossit à chaque aller-retour.
        const dejaVue = pile.lastIndexOf(vue);
        if (dejaVue >= 0) { pile = pile.slice(0, dejaVue + 1); return; }
        pile.push(vue);
        if (pile.length > 1) {
            try { history.pushState({ vue }, '', location.href); } catch (e) {}
        }
    }

    function surRetour(fn) { rappel = fn; }

    window.addEventListener('popstate', () => {
        if (onIgnoreLeProchain) { onIgnoreLeProchain = false; return; }
        if (pile.length <= 1) return;                     // plus rien à dépiler : on laisse partir
        pile.pop();
        const precedente = pile[pile.length - 1];
        // On remet un cran d'historique : sans ça, un deuxième retour
        // quitterait le site alors qu'il reste des vues à remonter.
        if (pile.length > 1) {
            onIgnoreLeProchain = false;
            try { history.pushState({ vue: precedente }, '', location.href); } catch (e) {}
        }
        if (rappel) rappel(precedente);
    });

    window.Vues = { suivre, surRetour, pile: () => [...pile] };
})();
