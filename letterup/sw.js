const CACHE_VERSION = 'letterup-0.0.4';
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './css/app.css',
  './js/main.js',
  './js/version.js',
  './js/engine/bag.js',
  './js/engine/board.js',
  './js/engine/constants.js',
  './js/engine/coop.js',
  './js/engine/dictionary.js',
  './js/engine/game.js',
  './js/engine/index.js',
  './js/engine/layout.js',
  './js/engine/moves.js',
  './js/engine/placement.js',
  './js/engine/rng.js',
  './js/engine/territory.js',
  './js/engine/words.js',
  './js/net/protocol.js',
  './js/net/session.js',
  './js/net/transport-local.js',
  './js/net/transport-memory.js',
  './js/net/transport-peer.js',
  './js/ui/board-view.js',
  './js/ui/controller.js',
  './js/ui/dialogs.js',
  './js/ui/end-screen.js',
  './js/ui/game-screen.js',
  './js/ui/home-screen.js',
  './js/ui/host-save.js',
  './js/ui/input.js',
  './js/ui/lobby-screen.js',
  './js/ui/messages.js',
  './js/ui/move-count.js',
  './js/ui/rack-view.js',
  './js/ui/rules-screen.js',
  './js/ui/solo-save.js',
  './js/ui/status.js',
  './js/ui/turn-state.js',
  './dict/fr.txt',
  './img/icon.svg',
  './img/motifs.svg',
  './fonts/fraunces-900-soft-latin.woff2',
  'https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js',
];
const PEERJS_URL = PRECACHE[PRECACHE.length - 1];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('letterup-') && k !== CACHE_VERSION).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Ne jamais intercepter le trafic PeerJS (signalisation).
  if (url.hostname === 'peerjs.com' || url.hostname.endsWith('.peerjs.com')) return;
  if (url.origin !== self.location.origin && req.url !== PEERJS_URL) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match(req, { ignoreSearch: true })
        .then((hit) => hit || caches.match('./index.html'))
        .then((hit) => hit || fetch(req)),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    }),
  );
});
