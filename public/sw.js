const CACHE = 'premium-pulse-offline-v4';
const APP_SHELL = ['/', '/index.html', '/shanta-life-logo.png', '/icon.svg', '/manifest.webmanifest', '/fonts/NotoSansBengali.ttf'];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const response = await fetch('/index.html', { cache: 'reload' });
    if (!response.ok) throw new Error('Unable to cache PremiumPulse shell');
    const html = await response.clone().text();
    const assets = [...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)].map(match => match[1]);
    await cache.put('/index.html', response.clone());
    await cache.put('/', response);
    await cache.addAll([...new Set([...APP_SHELL.slice(2), ...assets])]);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('premium-pulse-offline-') && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin) return;
  if (request.mode === 'navigate' && sameOrigin) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE);
          await cache.put('/index.html', response.clone());
        }
        return response;
      } catch {
        return (await caches.match('/index.html')) || Response.error();
      }
    })());
    return;
  }
  event.respondWith((async () => {
    // Same-origin bundled assets are not personalized. Ignore development/static
    // server Vary: Origin differences between precache and module/font requests.
    const staticAsset = sameOrigin && (url.pathname.startsWith('/assets/') || APP_SHELL.includes(url.pathname));
    const cached = await caches.match(request, { ignoreVary: staticAsset });
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok || response.type === 'opaque') {
        const cache = await caches.open(CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      return Response.error();
    }
  })());
});
