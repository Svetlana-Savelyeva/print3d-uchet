// Офлайн-режим: приложение открывается без интернета. Данные лежат в браузере и сюда не попадают.
const CACHE = 'print3d-v9';
const FILES = [
  './', './index.html', './css/app.css', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png',
  './js/app.js', './js/calc.js', './js/store.js', './js/ui.js', './js/demo.js', './js/sync.js', './js/merge.js', './js/version.js',
  './js/views/home.js', './js/views/prints.js', './js/views/newprint.js', './js/views/catalog.js', './js/views/spools.js', './js/views/more.js', './js/views/syncview.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Файлы приложения: всегда сначала свежая версия с сервера (мимо кэша браузера), без сети — из кэша.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== location.origin) return; // GitHub API, шрифты — как обычно
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
  );
});
