// Incrémente cette version à CHAQUE changement de fichier statique.
const CACHE_VERSION = 'salon-v2';
const CORE = ['/', '/index.html', '/app.js', '/style.css', '/manifest.json'];

self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(caches.open(CACHE_VERSION).then(c => c.addAll(CORE)).catch(() => {}));
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (req.method !== 'GET') return;                 // jamais les POST (login, api...)
    const url = new URL(req.url);
    if (url.origin !== location.origin) return;        // pas les CDN/fonts externes
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