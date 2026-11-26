// Ballerburg 3D – Offline-Cache (Netz zuerst, sonst Cache)
const CACHE = 'ballerburg3d-v2';
const FILES = ['./', 'index.html', 'css/style.css', 'icon.svg', 'manifest.webmanifest', 'lib/three.module.min.js', 'lib/cannon-es.js',
  'src/main.js', 'src/config.js', 'src/scene.js', 'src/camera.js', 'src/game.js', 'src/physics.js', 'src/castle.js', 'src/economy.js', 'src/ballistics.js', 'src/sound.js', 'src/lines.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
