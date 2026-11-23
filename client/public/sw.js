// Service worker: lets the site be installed as an app and open quickly.
// - Pages: network first (always the newest version), falling back to the last copy when offline.
// - Built files, art, tokens and icons: cached after the first load (their names change when they change).
// - The game itself (/api, /socket.io) and other websites are never cached.
const VERSION = 'v1';
const SHELL = `shell-${VERSION}`, STATIC = `static-${VERSION}`;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(['/', '/manifest.webmanifest', '/icons/icon-192.png'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== STATIC).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io') || url.pathname.endsWith('index.json')) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(SHELL).then(c => c.put('/', copy)); return res; })
      .catch(() => caches.match('/').then(r => r || Response.error())));
    return;
  }
  if (/^\/(assets|art|tokens|icons)\//.test(url.pathname)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(STATIC).then(c => c.put(req, copy)); }
      return res;
    })));
  }
});
