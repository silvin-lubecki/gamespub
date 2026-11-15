// COM-02 (DESIGN-plateforme §5.6, D8) : coquille d'écrans commune — Accueil, Solo, Salon, Partie, Fin, Règles, routage,
// `?join=`, reprise. Le jeu fournit `game.ui` ({ mountGame(el, controller, ctx), renderEnd(view, ctx), rulesHtml(), stage? }).
// Aucun accès au DOM à l'import ; tout passe par `opts` (document, location, storage, réseau, horloge), donc testable en DOM factice.
//
// Paramètres d'URL : `?join=`, `?transport=local` ; `?seed=` / `?botDelay=` (solo, ou salle en `transport=local`) ;
// `?autoplay=1` (le siège humain est piloté par l'IA) ; `?dev=hotseat`. Crochet e2e (mode local) : `window.gameNet = { act, view, seats }`.
//
// Fin de partie : l'écran Partie du jeu appelle `ctx.onEnd(view)` quand la vue est terminée ; la coquille affiche alors l'écran Fin.
import { withDefaults } from '../game.js';
import { randomSeed } from '../engine/rng.js';
import { createGuestSession, createHostSession } from '../net/session.js';
import { connectLocalGuest, createLocalHost } from '../net/transport-local.js';
import { connectPeerGuest, openPeerHost } from '../net/transport-peer.js';
import { confirmDialog } from './dialogs.js';
import { homeHtml, NOTICE } from './home.js';
import {
  COPY_OK, REFUSED_MESSAGES, bindLobby, copyText, inviteLink, joinFormHtml, lobbyHtml, messageHtml, seatInfoOf,
} from './lobby.js';
import { createLocalController } from './local-controller.js';
import { netBarHtml } from './net-bar.js';
import { createNetworkController, getClientId } from './net-controller.js';
import { cleanName } from './player-name.js';
import { BOT_NAMES, defaultSoloForm, readSettingsRaw, readSoloForm, soloHtml } from './solo-setup.js';
import { installStage, toggleFullscreen } from './stage.js';
import { createStore } from './storage.js';
import { esc } from './svg.js';
import { toast, watchUpdates } from './toast.js';

const SCREENS = ['home', 'solo', 'lobby', 'game', 'end', 'rules'];

/** Paramètres d'URL communs. `seed` : entier à 9 chiffres au plus ; `botDelay` : ms (entier ≥ 0), sinon délai du pilote. */
export function parseParams(search) {
  const p = new URLSearchParams(search);
  const seed = p.get('seed') ?? '';
  const delay = p.get('botDelay') ?? '';
  return {
    seed: /^\d{1,9}$/.test(seed) ? Number(seed) : null,
    botDelay: /^\d{1,7}$/.test(delay) ? Number(delay) : undefined,
    autoplay: p.get('autoplay') === '1',
    hotseat: p.get('dev') === 'hotseat',
    join: p.get('join') || null,
    local: p.get('transport') === 'local',
  };
}

/** Réseau par défaut : BroadcastChannel en `?transport=local`, sinon PeerJS (`window.Peer`). */
export function defaultNet(game, local) {
  if (local) {
    return {
      async openHost({ peerId }) {
        const h = createLocalHost({ gameId: game.id, room: peerId });
        return { id: h.room, onConnection: h.onConnection, close: h.close };
      },
      connectGuest: (hostId) => connectLocalGuest(game.id, hostId),
    };
  }
  return {
    async openHost({ peerId, onRetry }) {
      const h = await openPeerHost({ peerId, onRetry });
      return { id: await h.id, onConnection: h.onConnection, onError: h.onError, close: h.close };
    },
    connectGuest: (hostId, { clientId }) => connectPeerGuest(hostId, { clientId }),
  };
}

/**
 * `startShell(game, { root, location, win, storage, version, net, clock, confirm, registerSw })` → `{ show, close }`.
 * `net` = `{ openHost({ peerId, onRetry }) → Promise<{ id, onConnection(cb), onError?(cb), close() }>, connectGuest(hostId, { clientId }) → transport }`.
 */
export function startShell(rawGame, opts = {}) {
  const game = withDefaults(rawGame);
  const ui = game.ui;
  if (!ui || typeof ui.mountGame !== 'function' || typeof ui.renderEnd !== 'function' || typeof ui.rulesHtml !== 'function') {
    throw new Error('game.ui : { mountGame, renderEnd, rulesHtml } attendu');
  }
  const doc = opts.root ?? globalThis.document;
  const loc = opts.location ?? globalThis.location;
  const win = opts.win ?? globalThis.window ?? null;
  const params = parseParams(loc.search);
  const { local } = params;
  const net = opts.net ?? defaultNet(game, local);
  const store = createStore(game, { storage: opts.storage });
  const confirmAsk = opts.confirm ?? ((message) => confirmDialog({ message, doc }));
  const clockOpt = opts.clock ? { clock: opts.clock } : {};
  // `?seed=` et `?botDelay=` : solo ou salle locale seulement (hôte).
  const roomOpts = local ? params : { seed: null, botDelay: undefined };

  const app = doc.getElementById('app') ?? doc.body;
  app.innerHTML = SCREENS.map((s) => `<section id="screen-${s}" class="screen" hidden></section>`).join('');
  doc.documentElement.dataset.version = opts.version ?? 'dev';
  const el = (id) => doc.getElementById(`screen-${id}`);

  let current = 'home';
  let previous = 'home';
  let mode = null; // 'solo' | 'host' | 'guest' pendant une partie
  let gameHandle = null;
  let mounted = false;
  let stageHandle = null;
  let bar = null;
  let ctrl = null;
  let inGame = false;
  let awaitingNew = false;
  let stopLobby = null;
  let cleanups = [];
  let soloForm = null;
  let lastSolo = null;
  let usedSeed = false;

  const playerName = () => cleanName(store.name.load());
  const goHome = () => loc.assign(loc.pathname + (local ? '?transport=local' : ''));
  const fullscreenIfTouch = () => {
    if (ui.stage && win?.matchMedia?.('(pointer: coarse)').matches) toggleFullscreen(doc, win.screen, { enterOnly: true });
  };

  function show(id) {
    if (id === 'rules') previous = current;
    current = id;
    if (id === 'home') renderHome();
    for (const s of SCREENS) el(s).hidden = s !== id;
    doc.body.dataset.screen = id;
  }

  function renderHome() {
    el('home').innerHTML = homeHtml({
      game, name: store.name.load(), hasSolo: store.solo.load() !== null, hasRoom: savedRoom() !== null, dev: params.hotseat,
    });
  }

  function openRules() {
    el('rules').innerHTML = `<p><button type="button" class="btn" data-act="back">← Retour</button></p>${ui.rulesHtml()}<p class="notice">${esc(NOTICE)}</p>`;
    show('rules');
  }

  // --- Partie -------------------------------------------------------------------------------------------------------
  const ctx = {
    onEnd: (view) => showEnd(view),
    onQuit: () => { quit(); },
    onRules: () => openRules(),
    toast: (message) => toast(message, { doc }),
    confirm: confirmAsk,
    seatInfo: (seat, extra) => seatInfoOf(game, seat, extra),
  };

  function unmountGame() {
    gameHandle?.dispose?.();
    gameHandle = null;
    mounted = false;
    stageHandle?.dispose();
    stageHandle = null;
    bar = null;
    el('game').innerHTML = '';
  }

  function mount(controller) {
    unmountGame();
    show('game');
    fullscreenIfTouch();
    let host = el('game');
    if (ui.stage === 'landscape') {
      host.innerHTML = '<div class="stage-frame"><div class="stage"></div></div>';
      host = host.querySelector('.stage');
      stageHandle = installStage(host, win);
    }
    gameHandle = ui.mountGame(host, controller, ctx) ?? null;
    mounted = true;
  }

  function refreshBar() {
    if (!bar || !ctrl) return;
    bar.innerHTML = netBarHtml({ role: ctrl.role, you: ctrl.you, status: ctrl.status, seats: ctrl.seats ?? [] });
  }

  function enterGame() {
    inGame = true;
    mount(ctrl);
    bar = doc.createElement('div');
    bar.className = 'net-bar-host';
    bar.addEventListener('click', (e) => {
      const btn = e.target.closest?.('[data-net="confide"]');
      if (btn) ctrl.confide(Number(btn.dataset.seat));
    });
    el('game').append(bar);
    refreshBar();
  }

  function showEnd(view) {
    unmountGame();
    const replay = mode === 'solo' || mode === 'host';
    el('end').innerHTML = `${ui.renderEnd(view, ctx)}<p class="end-actions">`
      + `${replay ? '<button type="button" class="btn" data-act="replay">Rejouer</button>' : ''}`
      + '<button type="button" class="btn secondary" data-act="home">Accueil</button></p>';
    show('end');
  }

  function stopSolo() {
    ctrl?.dispose?.();
    ctrl = null;
    unmountGame();
  }

  function shutdown() {
    for (const fn of cleanups) fn();
    cleanups = [];
    unmountGame();
    if (mode === 'host' || mode === 'guest') ctrl?.close();
    else ctrl?.dispose?.();
    ctrl = null;
  }

  function leave() {
    const wasRoom = mode === 'host' || mode === 'guest';
    shutdown();
    mode = null;
    if (wasRoom) goHome(); else show('home');
  }

  async function quit() {
    const text = mode === 'host'
      ? 'Quitter la salle ? La partie sera suspendue pour les autres joueurs (vous pourrez la reprendre depuis l’accueil).'
      : 'Quitter la partie en cours ?';
    if (await confirmAsk(text)) leave();
  }

  // --- Solo ---------------------------------------------------------------------------------------------------------
  function nextSeed() {
    if (!usedSeed && params.seed !== null) { usedSeed = true; return params.seed; }
    usedSeed = true;
    return randomSeed();
  }

  /** `setup` = { names, seatCount, settings, levels, hotseat? } ; `initialState` : reprise d'une partie sauvegardée. */
  function startSolo(setup, initialState = null) {
    shutdown();
    mode = 'solo';
    lastSolo = setup;
    const { hotseat = false, ...saved } = setup;
    ctrl = createLocalController(game, {
      seed: initialState ? undefined : nextSeed(),
      ...saved,
      humanSeat: 0,
      hotseat,
      initialState,
      delayMs: params.botDelay,
      ...clockOpt,
      ...(hotseat ? {} : { onCommit: store.soloCommit(saved) }),
    });
    mount(ctrl);
  }

  function openSolo() {
    soloForm ??= defaultSoloForm(game);
    renderSolo();
    show('solo');
  }
  const renderSolo = () => { el('solo').innerHTML = soloHtml({ game, form: soloForm }); };

  function launchSoloFromForm() {
    const { seatCount, levels, settings } = soloForm;
    if (game.validateStart?.(seatCount, settings)) return;
    const names = [playerName(), ...BOT_NAMES.slice(0, seatCount - 1)];
    startSolo({ names, seatCount, settings, levels: [params.autoplay ? game.defaultLevel : null, ...levels] });
  }

  function startHotseat() {
    const seatCount = game.seats.default;
    startSolo({
      names: Array.from({ length: seatCount }, (_, i) => `Joueur ${i + 1}`),
      seatCount, settings: game.settings.parse(game.settings.defaults, seatCount), levels: Array(seatCount).fill(null), hotseat: true,
    });
  }

  // --- Salle --------------------------------------------------------------------------------------------------------
  const savedRoom = () => {
    const saved = store.host.load();
    return saved && saved.local === local ? saved : null;
  };

  const setLobby = (html, handlers = { home: () => leave() }) => {
    stopLobby?.();
    el('lobby').innerHTML = html;
    stopLobby = bindLobby(el('lobby'), handlers);
    show('lobby');
  };
  const message = (text, o) => setLobby(messageHtml(text, o));

  function wire(controller) {
    ctrl = controller;
    inGame = false;
    awaitingNew = false;
    if (local && win) win.gameNet = { act: (a) => controller.act(a), view: () => controller.getView(), seats: () => controller.seats };
    // Premier `state` (invité), reprise de l'hôte ou rejouer : l'écran Partie se monte quand une partie arrive.
    controller.onChange(() => {
      if (!mounted && (current !== 'end' || awaitingNew)) { awaitingNew = false; enterGame(); }
    });
    controller.onNewGame?.(() => { awaitingNew = true; });
    controller.onSeats(() => refreshBar());
  }

  async function startHost(saved = null) {
    const name = saved ? saved.snapshot.seats[0].name : playerName();
    shutdown();
    mode = 'host';
    message(saved ? 'Reprise de la salle…' : 'Création de la salle…');
    let transportHost;
    try {
      transportHost = await net.openHost({
        peerId: saved?.peerId,
        onRetry: (n) => message(`Reprise de la salle… (tentative ${n + 1}, l’ancien identifiant se libère)`),
      });
    } catch (err) {
      message(err.message || 'Impossible de créer la salle.', { error: true });
      return;
    }
    const id = transportHost.id;
    const session = createHostSession(game, {
      name, seed: roomOpts.seed ?? undefined, botDelayMs: roomOpts.botDelay, ...clockOpt,
    });
    transportHost.onConnection((t) => session.accept(t));
    transportHost.onError?.((err) => toast(err.message, { doc }));
    const onHide = (e) => { if (!e.persisted) transportHost.close(); };
    win?.addEventListener('pagehide', onHide);
    cleanups.push(() => { win?.removeEventListener('pagehide', onHide); transportHost.close(); });
    wire(createNetworkController(session));
    if (saved) {
      try { session.restore(saved.snapshot); } catch { store.host.clear(); message('Sauvegarde illisible.', { error: true }); return; }
    }
    cleanups.push(store.persistHost(session, { peerId: id, local }));
    if (saved) return; // restore() a déjà monté l'écran Partie (onChange)
    const link = inviteLink(loc, id, { local });
    const canShare = typeof win?.navigator?.share === 'function';
    const render = () => {
      if (inGame || mode !== 'host') return;
      setLobby(lobbyHtml({
        game, role: 'host', link, seats: ctrl.seats, seatCount: ctrl.seatCount, settings: ctrl.settings, startError: ctrl.startError, you: 0, canShare,
      }), {
        cycle: (i) => ctrl.cycleSeat(i),
        release: (i) => ctrl.releaseSeat(i),
        'seat-count': (n) => { ctrl.setSeatCount(n); render(); },
        settings: (container) => { ctrl.setSettings(readSettingsRaw(container)); render(); },
        copy: async (_, btn) => {
          const ok = await copyText(link, { doc });
          if (!ok) el('lobby').querySelector('.lobby-link')?.select();
          btn.textContent = ok ? COPY_OK : 'Copiez le lien manuellement.';
        },
        share: () => { Promise.resolve(win.navigator.share({ title: game.title, text: 'Rejoins ma partie !', url: link })).catch(() => {}); },
        start: () => { fullscreenIfTouch(); ctrl.start(); },
        home: () => leave(),
      });
    };
    ctrl.onSeats(render);
    render();
  }

  function join(hostId) {
    mode = 'guest';
    const connectNow = (rawName) => {
      const name = cleanName(rawName);
      store.name.save(name);
      message('Connexion à l’hôte…');
      const clientId = getClientId(game.id, hostId, { storage: opts.storage });
      const session = createGuestSession(game, { connect: () => net.connectGuest(hostId, { clientId }), clientId, name, ...clockOpt });
      const onHide = (e) => { if (!e.persisted) ctrl?.close(); };
      win?.addEventListener('pagehide', onHide);
      cleanups.push(() => win?.removeEventListener('pagehide', onHide));
      wire(createNetworkController(session));
      const render = () => {
        if (inGame) return;
        const { status } = ctrl;
        if (status === 'refused') return;
        if (status === 'open' && ctrl.seats) {
          setLobby(lobbyHtml({ game, role: 'guest', seats: ctrl.seats, seatCount: ctrl.seatCount, settings: ctrl.settings, you: ctrl.you }));
        } else if (status === 'closed') message('Hôte injoignable. Rouvrez le lien quand l’hôte aura repris la salle.', { error: true });
        else if (status === 'lost') message('Connexion perdue, reconnexion…');
      };
      ctrl.onSeats(render);
      let refused = false;
      ctrl.onStatus((status, detail) => {
        if (refused) return;
        if (status === 'refused') {
          refused = true;
          message(REFUSED_MESSAGES[detail?.reason] ?? 'Connexion refusée.', { error: true });
          ctrl.close();
        } else { render(); refreshBar(); }
      });
    };
    setLobby(joinFormHtml(store.name.load()), {
      join: () => connectNow(doc.getElementById('join-name').value),
      home: () => leave(),
    });
  }

  // --- Événements de la coquille (data-act ; le salon utilise data-lobby) --------------------------------------------
  app.addEventListener('click', (e) => {
    const act = e.target.closest?.('[data-act]');
    if (!act || act.disabled || act.closest('#screen-game')) return; // l'écran Partie gère ses propres clics
    switch (act.dataset.act) {
      case 'solo': openSolo(); break;
      case 'solo-start': launchSoloFromForm(); break;
      case 'resume': { const data = store.solo.load(); if (data) { const { state, game: _g, ...setup } = data; startSolo(setup, state); } break; }
      case 'hotseat': startHotseat(); break;
      case 'room': startHost(); break;
      case 'resume-room': { const saved = savedRoom(); if (saved) startHost(saved); break; }
      case 'rules': openRules(); break;
      case 'back': show(previous === 'rules' ? 'home' : previous); break;
      case 'replay':
        if (mode === 'solo') startSolo(lastSolo);
        else if (mode === 'host' && ctrl.rematch()) enterGame();
        break;
      case 'home': leave(); break;
      default: break;
    }
  });
  app.addEventListener('change', (e) => {
    if (!e.target.closest?.('#screen-solo')) return;
    soloForm = readSoloForm(el('solo'), game, soloForm);
    renderSolo();
  });
  app.addEventListener('input', (e) => {
    if (e.target.id === 'player-name') store.name.save(e.target.value.trim());
  });

  if (opts.registerSw !== false && win && loc.hostname !== 'localhost') {
    win.addEventListener('load', () => {
      win.navigator.serviceWorker?.register('./sw.js').catch((err) => console.warn('Service worker non enregistré :', err));
    });
    watchUpdates(win, { doc });
  }

  if (params.join) join(params.join);
  else show('home');

  return { show, close: () => { shutdown(); mode = null; } };
}
