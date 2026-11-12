const CACHE_NAME = 'lern-heldin-cache-v4';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Stale-While-Revalidate: Antworten kommen sofort aus dem Cache,
// parallel wird der Cache im Hintergrund per Netzwerk aktualisiert.
// So erhalten Nutzer Updates automatisch, ohne dass die Cache-Version
// bei jedem Deploy manuell erhöht werden muss.
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const networkUpdate = fetch(event.request)
        .then((response) => {
          if (response && response.ok &&
              new URL(event.request.url).origin === self.location.origin) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => undefined);

      return cachedResponse || networkUpdate;
    })
  );
});