// COM-02 (DESIGN-plateforme §5.7, D10) : gabarit de service worker, copié dans `<slug>/sw.js` par new-game.
// Les trois lignes ci-dessous sont des marqueurs remplacés par `buildGame` (common/tools/build-game.mjs) : ne pas les reformater.
// En dev (non construit), PRECACHE est vide : le service worker n'est d'ailleurs pas enregistré sur localhost.
const CACHE_PREFIX = 'rum-';
const CACHE_VERSION = 'rum-0.1.0';
const PRECACHE = [
  './',
  './common/ai/turn-driver.js',
  './common/engine/rng.js',
  './common/game.js',
  './common/net/clock.js',
  './common/net/protocol.js',
  './common/net/session.js',
  './common/net/transport-local.js',
  './common/net/transport-memory.js',
  './common/net/transport-peer.js',
  './common/ui/dialogs.js',
  './common/ui/home.js',
  './common/ui/lobby.js',
  './common/ui/local-controller.js',
  './common/ui/net-bar.js',
  './common/ui/net-controller.js',
  './common/ui/player-name.js',
  './common/ui/shell.css',
  './common/ui/shell.js',
  './common/ui/solo-setup.js',
  './common/ui/stage.js',
  './common/ui/storage.js',
  './common/ui/svg.js',
  './common/ui/toast.js',
  './css/app.css',
  './icon-192.png',
  './icon-512.png',
  './icon.svg',
  './index.html',
  './js/ai/easy.js',
  './js/ai/index.js',
  './js/ai/meld.js',
  './js/ai/normal.js',
  './js/ai/solver.js',
  './js/bot-timing.js',
  './js/engine/index.js',
  './js/engine/sets.js',
  './js/engine/tiles.js',
  './js/game.js',
  './js/main.js',
  './js/ui/draft.js',
  './js/ui/drag.js',
  './js/ui/game-screen.js',
  './js/ui/render.js',
  './js/ui/rules.js',
  './js/ui/tile-svg.js',
  './js/version.js',
  './manifest.json',
  'https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js',
];

// Les fichiers du jeu sont indispensables (addAll : tout ou rien) ; les ressources externes (script PeerJS du CDN) sont facultatives :
// un CDN injoignable ne doit pas empêcher l'installation, donc le mode hors ligne.
self.addEventListener('install', (event) => {
  const external = (url) => /^https?:/.test(url);
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE.filter((u) => !external(u)))
        .then(() => Promise.all(PRECACHE.filter(external).map((u) => cache.add(u).catch(() => {})))))
      .then(() => self.skipWaiting()),
  );
});

// Ne purge que les caches de ce jeu (`<préfixe>-*`) : les jeux partagent l'origine (…/gamespub/).
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_VERSION).map((k) => caches.delete(k)),
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
  // Hors origine : seulement les ressources externes du précache (le script PeerJS du CDN).
  if (url.origin !== self.location.origin && !PRECACHE.includes(req.url)) return;

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
