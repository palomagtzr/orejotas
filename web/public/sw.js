// Service worker mínimo: cachea la "cáscara" de la app para que abra sin red.
// Nunca cachea llamadas al Worker (audio, transcripción, resumen).
const CACHE = 'orejotas-shell-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      try {
        const fresh = await fetch(e.request);
        if (fresh.ok) cache.put(e.request, fresh.clone());
        return fresh;
      } catch {
        const hit = await cache.match(e.request);
        if (hit) return hit;
        if (e.request.mode === 'navigate') return cache.match('./') || cache.match('./index.html');
        throw new Error('offline');
      }
    }),
  );
});
