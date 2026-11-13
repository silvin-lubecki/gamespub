const CACHE_VERSION = 'rdc-0.0.1';
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './css/app.css',
  './fonts/aref-ruqaa-bold.woff2',
  './img/artisans/couturiere-etabli.webp',
  './img/artisans/couturiere-renomme.webp',
  './img/artisans/ebeniste-etabli.webp',
  './img/artisans/ebeniste-renomme.webp',
  './img/artisans/maroquiniere-etabli.webp',
  './img/artisans/maroquiniere-renomme.webp',
  './img/artisans/orfevre-etabli.webp',
  './img/artisans/orfevre-renomme.webp',
  './img/artisans/potier-etabli.webp',
  './img/artisans/potier-renomme.webp',
  './img/icons/couturiere.webp',
  './img/icons/ebeniste.webp',
  './img/icons/maroquiniere.webp',
  './img/icons/orfevre.webp',
  './img/icons/potier.webp',
  './img/misc/back-order.webp',
  './img/misc/back-resource.webp',
  './img/misc/back-starter.webp',
  './img/misc/background.webp',
  './img/misc/first-player.webp',
  './img/misc/teapot.webp',
  './img/orders/babouches-teintes.webp',
  './img/orders/bague-en-or.webp',
  './img/orders/besace-a-boucles.webp',
  './img/orders/bonnet-de-laine.webp',
  './img/orders/bourse.webp',
  './img/orders/bracelet-de-cuir.webp',
  './img/orders/bracelet-en-or.webp',
  './img/orders/broche-en-or-emaille.webp',
  './img/orders/burnous.webp',
  './img/orders/caftan-brode-de-soie.webp',
  './img/orders/caftan.webp',
  './img/orders/coffret-marquete.webp',
  './img/orders/collier-or-et-nacre.webp',
  './img/orders/coupelle-en-terre-cuite.webp',
  './img/orders/djellaba-teinte.webp',
  './img/orders/grand-coffre-marquete.webp',
  './img/orders/jarre-decoree.webp',
  './img/orders/jeu-de-dames-echecs.webp',
  './img/orders/kanoun.webp',
  './img/orders/pendentif-or-et-nacre.webp',
  './img/orders/petite-medaille-d-or.webp',
  './img/orders/petite-table-a-ferrures.webp',
  './img/orders/plat-a-couscous.webp',
  './img/orders/portefeuille-double-de-soie.webp',
  './img/orders/pouf-teint.webp',
  './img/orders/table-marquetee.webp',
  './img/orders/tajine.webp',
  './img/orders/takchita.webp',
  './img/orders/tasse.webp',
  './img/orders/toupie-en-cedre.webp',
  './img/resources/argile.webp',
  './img/resources/cedre.webp',
  './img/resources/cuir.webp',
  './img/resources/laine.webp',
  './img/resources/laiton.webp',
  './img/resources/nacre.webp',
  './img/resources/or.webp',
  './img/resources/pigment.webp',
  './img/resources/soie.webp',
  './js/ai/driver.js',
  './js/ai/negotiation.js',
  './js/ai/policy.js',
  './js/engine/catalog.js',
  './js/engine/index.js',
  './js/engine/rng.js',
  './js/engine/rules.js',
  './js/engine/scoring.js',
  './js/engine/setup.js',
  './js/engine/view.js',
  './js/main.js',
  './js/net/protocol.js',
  './js/net/session.js',
  './js/net/transport-local.js',
  './js/net/transport-memory.js',
  './js/net/transport-peer.js',
  './js/ui/asset-map.js',
  './js/ui/cards.js',
  './js/ui/controller.js',
  './js/ui/game-screen.js',
  './js/ui/game-view.js',
  './js/ui/host-save.js',
  './js/ui/lobby-screen.js',
  './js/ui/market-panel.js',
  './js/ui/messages.js',
  './js/ui/net-bar.js',
  './js/ui/net-controller.js',
  './js/ui/net-flow.js',
  './js/ui/player-name.js',
  './js/ui/solo.js',
  './js/ui/stage.js',
  './js/version.js',
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
        keys.filter((k) => k.startsWith('rdc-') && k !== CACHE_VERSION).map((k) => caches.delete(k)),
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
