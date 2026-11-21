// Офлайн-кэш калькулятора. Сеть в приоритете (обновления видны сразу), без сети — из кэша.
// При изменении файлов сайта поднимать VERSION, чтобы приложение предложило перезагрузку.
const VERSION = 'v4-2';
const CACHE = 'wf-calc-' + VERSION;
const SHELL = [
  './', 'index.html', 'oraxia.html', 'css/app.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png',
  'js/app.js', 'js/store.js', 'js/engine/index.js', 'js/engine/damage.js', 'js/engine/weapon.js',
  'js/engine/enemy.js', 'js/engine/effects.js', 'js/engine/constants.js',
  'data/meta.json', 'data/enemies.json', 'data/damage.json', 'data/manual/scaling.json',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('wf-calc-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('index.html')))
  );
});
