// Ironday service worker: makes the app installable and lets it open offline.
// Bump VERSION whenever you change a file so phones pick up the new version.
const VERSION = 'ironday-v4';
const SHELL = [
  './',
  './index.html',
  './guide.html',
  './guide.js',
  './styles.css',
  './app.js',
  './firebase-config.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// App files: network first so updates arrive quickly, cache as the offline fallback.
// Google sign-in, Firestore and Sheets requests are never cached.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const staticCdn = /^(fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com|www\.gstatic\.com)$/.test(url.hostname) && !url.pathname.includes('/__/');
  if (!sameOrigin && !staticCdn) return;
  if (sameOrigin && url.pathname.includes('/__/')) return;
  event.respondWith(
    fetch(sameOrigin ? new Request(req, { cache: 'no-cache' }) : req)
      .then(res => {
        if (res.ok && (sameOrigin || res.type === 'cors' || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});

// Tapping a reminder opens (or focuses) the app.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) if ('focus' in c) return c.focus();
      return self.clients.openWindow('./#today');
    })
  );
});
