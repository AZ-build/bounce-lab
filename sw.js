/* Bounce Lab service worker.
   Network first: when you're online you always get the newest files (no stale versions).
   Offline, it falls back to whatever you've played before. Only this site's own files are
   handled; Firebase, fonts and analytics go straight to the network. */
const CACHE = 'bouncelab-v4';
const CORE = ['./', 'index.html', 'games.js', 'lab/config.js', 'lab/store.js', 'lab/lab.js', 'lab/lab.css',
  'manifest.webmanifest', 'assets/concrete.png', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
