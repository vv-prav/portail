// =====================================================================
//  LE SERVICE WORKER DU PUSH — et RIEN D'AUTRE
//
//  ⚠️⚠️ CE FICHIER NE DOIT JAMAIS GAGNER DE GESTIONNAIRE `fetch`, NI DE
//  CACHE. C'est toute sa raison d'être, et ce n'est pas une précaution
//  théorique : le salon a déjà vécu le bug. Plusieurs apps enregistraient
//  `/sw.js` à la racine, ce service worker prenait alors le contrôle de
//  TOUTES les pages, et Voyages servait le contenu de Petit Bac. D'où le
//  nettoyage de `public/app.js`, qui désenregistre tout ce qui n'est pas
//  limité à `/voyages/monts-arree/`.
//
//  Or le push EXIGE un service worker dont la portée couvre l'app, donc à
//  la racine. La seule façon de concilier les deux est celle-ci : un
//  second service worker qui n'intercepte AUCUNE requête. Sans
//  gestionnaire `fetch`, il ne peut servir aucune réponse — il lui est
//  donc structurellement impossible de reproduire le bug. Lui ajouter un
//  cache « tant qu'on y est » le ressusciterait aussitôt.
//
//  ⚠️ `public/app.js` doit laisser vivre sa portée : son nettoyage est
//  écrit en conséquence. Les deux fichiers se tiennent.
// =====================================================================

// On prend la main tout de suite : sans ça, le premier abonnement ne
// recevrait rien tant que l'onglet n'a pas été fermé puis rouvert.
self.addEventListener('install', (e) => e.waitUntil(self.skipWaiting()));
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
    let d = {};
    try { d = e.data ? e.data.json() : {}; } catch (err) {}
    const titre = d.titre || 'Purple Game';
    e.waitUntil(self.registration.showNotification(titre, {
        body: d.corps || '',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        // ⚠️ Un `tag` par conversation : trois messages d'affilée de la même
        // personne remplacent la notification précédente au lieu d'en
        // empiler trois. C'est la différence entre « on te parle » et « cette
        // appli me harcèle », et c'est ce qui fait désinstaller une webapp.
        tag: d.tag || 'salon',
        renotify: true,
        data: { url: d.url || '/' },
    }));
});

self.addEventListener('notificationclick', (e) => {
    e.notification.close();
    const cible = (e.notification.data && e.notification.data.url) || '/';
    e.waitUntil((async () => {
        const fenetres = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        // Si le salon est déjà ouvert quelque part, on y va plutôt que
        // d'ouvrir une seconde fenêtre par-dessus.
        for (const f of fenetres) {
            if (f.url.includes(self.location.origin)) {
                await f.focus();
                if ('navigate' in f) { try { await f.navigate(cible); } catch (err) {} }
                return;
            }
        }
        await self.clients.openWindow(cible);
    })());
});
