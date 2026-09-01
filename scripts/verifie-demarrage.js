// =====================================================================
//  VÉRIFICATION DE DÉMARRAGE
//
//  Charge server.js exactement comme le ferait Render, et échoue si le
//  serveur ne se lève pas. Attrape en deux secondes la panne la plus
//  coûteuse du projet : un require() vers un fichier absent du dépôt.
//
//  Quand ça arrive, Render refuse le déploiement et garde silencieusement
//  l'ancienne version en ligne — le code semble correct en relecture mais
//  la production ne bouge pas. C'est resté invisible quatre semaines.
//
//  Usage : node scripts/verifie-demarrage.js
// =====================================================================
process.env.PORT = process.env.PORT || '3901';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'verification-locale';

const DELAI_MS = 8000;

const echec = (raison, detail) => {
    console.error('\n❌ ' + raison);
    if (detail) console.error('   ' + String(detail).split('\n').slice(0, 6).join('\n   '));
    process.exit(1);
};

process.on('unhandledRejection', (e) => echec('Promesse rejetée au démarrage.', e && e.stack));
process.on('uncaughtException', (e) => echec('Exception au démarrage.', e && e.stack));

const minuteur = setTimeout(() => echec(`Le serveur n'a pas fini de se lever en ${DELAI_MS / 1000} s.`), DELAI_MS);

try {
    require('../server.js');
} catch (e) {
    clearTimeout(minuteur);
    if (e && e.code === 'MODULE_NOT_FOUND') {
        echec('Module introuvable — un fichier requis par server.js manque dans le dépôt.', e.message);
    }
    echec('server.js a levé une erreur au chargement.', e && e.stack);
}

// Le serveur écoute : on lui laisse un tour de boucle puis on rend la main.
setImmediate(() => {
    clearTimeout(minuteur);
    console.log('\n✅ server.js démarre : tous les modules requis sont présents.');
    process.exit(0);
});
