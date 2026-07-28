// Incrémente cette version à CHAQUE changement de fichier statique.
const CACHE_VERSION = 'salon-v82';
const CORE = [
    '/', '/index.html', '/app.js', '/style.css', '/manifest.json',
    '/icon-192.png', '/icon-512.png', '/logo-bretagne.svg',
    // Les apps aussi : le portail entier reste consultable hors-ligne
    '/perudo/', '/perudo/app.js', '/perudo/style.css', '/perudo/glyphs.js',
    '/mots-fleches/', '/mots-fleches/app.js', '/mots-fleches/style.css',
    '/recettes/', '/recettes/app.js', '/recettes/style.css',
    '/motus/', '/motus/app.js', '/motus/style.css',
    '/motjuste/', '/motjuste/app.js', '/motjuste/style.css',
    '/pbac/', '/pbac/app.js', '/pbac/style.css',
    '/undercover/', '/undercover/app.js', '/undercover/style.css',
    '/purple/', '/purple/app.js', '/purple/style.css',
    '/autoroute/', '/autoroute/app.js', '/autoroute/style.css',
    '/roidescons/', '/roidescons/app.js', '/roidescons/style.css',
    '/chance/', '/chance/app.js', '/chance/style.css',
    '/voyages/', '/voyages/app.js', '/voyages/style.css',
];

self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(caches.open(CACHE_VERSION).then(c => c.addAll(CORE)).catch(() => {}));
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION && k !== OFFLINE_MAP_CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

// Cache séparé, permanent (ne se vide pas à chaque mise à jour du site) pour les
// ressources externes du mode hors-ligne de Voyages : Leaflet et les tuiles de carte.
const OFFLINE_MAP_CACHE = 'voyages-offline-map';
const OFFLINE_MAP_HOSTS = ['unpkg.com', 'tile.openstreetmap.org', 'a.tile.openstreetmap.org', 'b.tile.openstreetmap.org', 'c.tile.openstreetmap.org'];

self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (req.method !== 'GET') return;                 // jamais les POST (login, api...)
    const url = new URL(req.url);

    if (url.origin !== location.origin) {
        // Seuls Leaflet et les tuiles OSM sont concernés ; tout le reste (polices, etc.)
        // continue de ne jamais être intercepté.
        if (!OFFLINE_MAP_HOSTS.includes(url.hostname)) return;
        e.respondWith(
            fetch(req).then(res => {
                const copy = res.clone();
                caches.open(OFFLINE_MAP_CACHE).then(c => c.put(req, copy)).catch(() => {});
                return res;
            }).catch(() => caches.match(req, { cacheName: OFFLINE_MAP_CACHE }))
        );
        return;
    }
    if (url.pathname.startsWith('/api/')) return;      // l'API n'est jamais mise en cache

    // Réseau d'abord (on reste à jour), repli sur le cache hors-ligne.
    e.respondWith(
        fetch(req).then(res => {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then(c => c.put(req, copy)).catch(() => {});
            return res;
        }).catch(() => caches.match(req).then(r => r || caches.match('/')))
    );
});