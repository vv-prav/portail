// =====================================================================
//  MON STYLE — la page
//
//  Ce fichier comptait deux catalogues recopiés (les tuiles de Motus, les
//  47 dés) et son propre rendu. C'était la troisième copie du même écran,
//  et elle ignorait le Perudo, qui lance pourtant les mêmes dés.
//
//  Tout vit maintenant dans `/style.js`. Cette page n'est plus qu'un HÔTE
//  du rendu commun : la feuille ouverte depuis un jeu montre exactement la
//  même chose, filtrée sur ce jeu. Ajouter un réglage ne demande donc plus
//  de toucher à cette page — une ligne dans le catalogue de `/style.js`
//  suffit, et il apparaît ici tout seul.
// =====================================================================
Style.rendre(document.getElementById('st-wrap'));
