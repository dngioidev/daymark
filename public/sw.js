/* Daymark service worker: offline app shell.
 * - Install: precache the shell (index.html + the hashed JS/CSS it references + icons).
 * - Pages: network first, fall back to the cached shell when offline.
 * - Same-origin static files: cache first (build output is content-hashed).
 * - Google Fonts: stale while revalidate.
 * - /api/*: never cached (sync must hit the server).
 * Bump CACHE_VERSION to force clients to drop old caches.
 */
const CACHE_VERSION = 'daymark-shell-v1';
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      const shell = await fetch('/', { cache: 'reload' });
      const html = await shell.clone().text();
      await cache.put('/', shell);
      const assetUrls = Array.from(html.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css|png|svg|json))"/g)).map((m) => m[1]);
      const extras = ['/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];
      await Promise.all(
        [...new Set([...assetUrls, ...extras])].map((url) =>
          cache.add(url).catch(() => undefined) // a missing optional asset must not block install
        )
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_VERSION);
        try {
          const fresh = await fetch(request);
          if (fresh.ok) cache.put('/', fresh.clone());
          return fresh;
        } catch {
          return (await cache.match('/')) || Response.error();
        }
      })()
    );
    return;
  }

  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_VERSION);
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((res) => {
            if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
            return res;
          })
          .catch(() => undefined);
        return cached || (await network) || Response.error();
      })()
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_VERSION);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const res = await fetch(request);
          if (res.ok) cache.put(request, res.clone());
          return res;
        } catch {
          return Response.error();
        }
      })()
    );
  }
});
