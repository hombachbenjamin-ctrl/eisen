// Bei jeder Änderung an der App diese Nummer erhöhen, sonst sehen installierte Apps das Update nicht.
const VERSION = 'v5';
const CACHE = `eisen-${VERSION}`;

const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'js/app.js',
  'js/chart.js',
  'js/db.js',
  'js/nav.js',
  'js/pad.js',
  'js/plan.js',
  'js/store.js',
  'js/timer.js',
  'js/ui.js',
  'js/util.js',
  'js/views/day.js',
  'js/views/editor.js',
  'js/views/history.js',
  'js/views/home.js',
  'js/views/settings.js',
  'fonts/archivo-latin-wght-normal.woff2',
  'fonts/big-shoulders-display-latin-wght-normal.woff2',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // "reload" bypasses the HTTP cache, which could otherwise freeze an old file into the new version.
      .then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) return;
  event.respondWith(
    caches.match(request.mode === 'navigate' ? 'index.html' : request, { ignoreSearch: true })
      .then((cached) => cached ?? fetch(request)),
  );
});
