// Офлайн-кэш калькулятора. Сеть в приоритете (обновления видны сразу), без сети — из кэша.
// При изменении файлов сайта поднимать VERSION, чтобы приложение предложило перезагрузку.
const VERSION = 'v21-1';
const CACHE = 'wf-calc-' + VERSION;
const SHELL = [
  './', 'index.html', 'css/theme.css', 'css/app.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png',
  'js/app.js', 'js/store.js', 'js/ui.js', 'js/engine/frame.js', 'js/engine/buffs.js', 'data/manual/buffs.json', 'data/incarnon.json', 'js/engine/index.js', 'js/engine/damage.js', 'js/engine/weapon.js',
  'js/engine/enemy.js', 'js/engine/effects.js', 'js/engine/constants.js', 'js/engine/capacity.js', 'js/engine/analysis.js',
  'js/aleca.js', 'js/share.js', 'data/mods/stance.json',
  'data/meta.json', 'data/enemies.json', 'data/warframes.json', 'data/manual/shards.json', 'data/damage.json', 'data/manual/scaling.json',
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
  // no-cache: каждый файл сверяется с сервером (304, если не менялся) — иначе после обновления
  // браузер мог смешать новый app.js со старым модулем из HTTP-кэша
  const fresh = req.mode === 'navigate' ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(req, { cache: 'no-cache' });
  e.respondWith(
    fresh.then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('index.html')))
  );
});
