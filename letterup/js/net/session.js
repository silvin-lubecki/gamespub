// Sessions réseau hôte autoritaire / invité (DESIGN.md §9.2). Aucune hypothèse H1–H14 (règles) n'est utilisée ici.
// Hypothèses réseau LU-08 :
//  A1 l'API suit l'issue #9 : onChange(view, events) ; le statut passe par onStatus.
//  A4 l'invité accepte tout `state` reçu (hôte autoritaire) et mémorise son `rev` pour ses actions (LU-16) ; rev reste monotone, rematch compris.
//  A5 hôte = joueur 0, invité = joueur 1 ; l'hôte reçoit ses connexions via host.accept(transport).
//  A6 l'invité se reconnecte via une fabrique connect() qui renvoie un nouveau transport.
//  A7 la graine du rematch vient de randomSeed() (injectable).
// LU-15 : en coop il n'y a qu'un siège moteur (H12′) : hôte et invité agissent tous deux sur le siège 0
// (seatOf). H18 : restore() refuse un état de version ≠ STATE_VERSION.
// LU-16 (protocole v2, D10–D12) : H15 l'hôte sérialise (premier arrivé, premier servi) et rejette `stale` toute action de
// l'invité dont `rev` ≠ révision courante (les deux modes) ; `state` porte `ack` = seq de l'action de l'invité ; H22 chaque
// événement diffusé porte `by` (0 hôte, 1 invité), ajouté ici et non par le moteur ; H16 un seul invité.
//  A22 restore() fixe rev = max(rev + 1, snap.rev) : la révision change toujours, donc toute action en vol devient `stale`.
import * as engineModule from '../engine/index.js';
import {
  PROTOCOL_VERSION, makeHello, makeWelcome, makeRefused, makeState, makeAction, makeReject,
  makePing, makePong, makeNewGame, makeResync,
} from './protocol.js';

export const PING_INTERVAL_MS = 5000;
export const LIVENESS_TIMEOUT_MS = 15000;
export const RECONNECT_DELAY_MS = 3000;
export const RECONNECT_MAX_ATTEMPTS = 10;

/** Horloge par défaut ; lambdas pour éviter « Illegal invocation » en navigateur. */
export const systemClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id),
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: (id) => globalThis.clearInterval(id),
};

export function createClientId(random = Math.random) {
  let id = '';
  while (id.length < 12) id += random().toString(36).slice(2);
  return id.slice(0, 12);
}

const emitter = () => {
  const cbs = new Set();
  return {
    add(cb) { cbs.add(cb); return () => cbs.delete(cb); },
    emit(...args) { for (const cb of [...cbs]) cb(...args); },
  };
};

export function createHostSession({
  settings, seed, dict, engine = engineModule, clock = systemClock,
  randomSeed = () => (Math.random() * 2 ** 32) >>> 0,
}) {
  const { createGame, applyAction, viewFor } = engine;
  const make = (sd) => createGame({ mode: settings.mode, seed: sd, coop: settings.coop ?? undefined });
  let state = make(seed);
  let rev = 0;
  let status = 'waiting';
  let guest = null; // { clientId, conn: null | { transport, alive }, lastSeen }
  const changes = emitter();
  const statuses = emitter();
  let timer = null;

  const setStatus = (s) => { if (s !== status) { status = s; statuses.emit(s); } };
  const connected = () => guest !== null && guest.conn !== null;
  const sendGuest = (msg) => { if (connected()) guest.conn.transport.send(msg); };
  // D9 : participant 0 = hôte, 1 = invité ; en coop, tous deux jouent le siège 0 (chevalet d'équipe).
  const seatOf = (participant) => (state.mode === 'coop' ? 0 : participant);
  const sendState = (events = [], ack) => sendGuest(makeState(rev, viewFor(state, seatOf(1)), events, ack));

  const drop = (conn) => {
    if (!conn.alive) return;
    conn.alive = false;
    conn.transport.close();
    if (guest && guest.conn === conn) {
      guest.conn = null;
      setStatus('lost');
    }
  };

  const bind = (conn, clientId) => {
    if (guest?.conn && guest.conn !== conn) drop(guest.conn);
    guest = { clientId, conn, lastSeen: clock.now() };
    conn.transport.send(makeWelcome(settings));
    sendState();
    setStatus('open');
  };

  const refuse = (conn, reason) => {
    conn.transport.send(makeRefused(reason));
    conn.alive = false;
    conn.transport.close();
  };

  const onHello = (conn, msg) => {
    if (msg.v !== PROTOCOL_VERSION) return refuse(conn, 'version');
    if (!guest || guest.clientId === msg.clientId || guest.conn === null) return bind(conn, msg.clientId);
    return refuse(conn, 'full');
  };

  // H22 : `by` = participant auteur, ajouté sur une copie des événements du moteur.
  const commit = (events, by, ack) => {
    const tagged = events.map((e) => ({ ...e, by }));
    rev++;
    sendState(tagged, ack);
    changes.emit(viewFor(state, 0), tagged);
    return tagged;
  };

  const onMessage = (conn, msg) => {
    if (!conn.alive) return;
    if (msg.t === 'hello') return onHello(conn, msg);
    if (!guest || guest.conn !== conn) return;
    guest.lastSeen = clock.now();
    if (msg.t === 'ping') conn.transport.send(makePong(msg.ts));
    else if (msg.t === 'resync') sendState();
    else if (msg.t === 'action') {
      // D10/H15 : action composée sur une révision périmée → rejet sans effet.
      if (msg.rev !== rev) { conn.transport.send(makeReject(msg.seq, 'stale')); return; }
      const r = applyAction(state, seatOf(1), msg.action, dict);
      if (!r.ok) { conn.transport.send(makeReject(msg.seq, r.error)); return; }
      state = r.state;
      commit(r.events, 1, msg.seq);
    }
  };

  const tick = () => {
    if (!connected()) return;
    if (clock.now() - guest.lastSeen >= LIVENESS_TIMEOUT_MS) { drop(guest.conn); return; }
    sendGuest(makePing(clock.now()));
  };
  timer = clock.setInterval(tick, PING_INTERVAL_MS);

  const host = {
    accept(transport) {
      const conn = { transport, alive: true };
      transport.onMessage((msg) => onMessage(conn, msg));
      transport.onStatus((s) => { if (s === 'closed') drop(conn); });
      return conn;
    },
    act(action) {
      const r = applyAction(state, seatOf(0), action, dict);
      if (!r.ok) return { ok: false, error: r.error };
      state = r.state;
      return { ok: true, events: commit(r.events, 0) };
    },
    /** `nextSettings` (optionnel) change les réglages de la nouvelle partie (« Changer de niveau », LU-12). */
    rematch(nextSettings) {
      if (nextSettings) settings = structuredClone(nextSettings);
      state = make(randomSeed());
      rev++;
      sendGuest(makeNewGame(settings));
      sendState();
      changes.emit(viewFor(state, 0), []);
    },
    resync() { sendState(); },
    snapshot() {
      return { v: 1, settings: structuredClone(settings), state: structuredClone(state), rev, guestClientId: guest?.clientId ?? null };
    },
    restore(snap) {
      if (!snap || snap.v !== 1) throw new Error('restore: instantané invalide');
      if (snap.state?.v !== engineModule.STATE_VERSION) throw new Error('restore: version d’état incompatible (H18)');
      state = structuredClone(snap.state);
      rev = Math.max(rev + 1, snap.rev); // A22
      settings = structuredClone(snap.settings);
      if (!guest && snap.guestClientId) {
        guest = { clientId: snap.guestClientId, conn: null, lastSeen: clock.now() };
        setStatus('lost');
      }
      sendState();
      changes.emit(viewFor(state, 0), []);
    },
    close() {
      clock.clearInterval(timer);
      if (guest?.conn) drop(guest.conn);
    },
    onChange: changes.add,
    onStatus: statuses.add,
    get view() { return viewFor(state, 0); },
    get state() { return state; },
    get rev() { return rev; },
    get settings() { return settings; },
    get status() { return status; },
    get guest() { return guest ? { clientId: guest.clientId, connected: guest.conn !== null } : null; },
  };
  return host;
}

export function createGuestSession({
  transport, connect, clientId, clock = systemClock,
}) {
  let status = 'connecting';
  let view = null;
  let settings = null;
  let seq = 0;
  let rev = 0; // révision du dernier state reçu (D10)
  let attempts = 0;
  let conn = null; // { transport, alive }
  let lastSeen = clock.now();
  let beat = null;
  let reconnectTimer = null;
  const changes = emitter();
  const rejects = emitter();
  const statuses = emitter();
  const newGames = emitter();

  const setStatus = (s, detail) => {
    if (s === status && detail === undefined) return;
    status = s;
    statuses.emit(s, detail);
  };

  const detach = () => {
    if (!conn) return;
    conn.alive = false;
    conn.transport.close();
    conn = null;
  };

  const scheduleReconnect = () => {
    if (!connect) return;
    clock.clearTimeout(reconnectTimer);
    reconnectTimer = clock.setTimeout(() => {
      reconnectTimer = null;
      if (status === 'open' || status === 'refused' || status === 'closed') return;
      if (attempts >= RECONNECT_MAX_ATTEMPTS) { detach(); setStatus('closed'); return; }
      attempts++;
      detach();
      attach(connect());
      scheduleReconnect();
    }, RECONNECT_DELAY_MS);
  };

  const lose = () => {
    if (status === 'lost' || status === 'refused' || status === 'closed') return;
    const detail = conn?.transport.detail ?? undefined; // ex. { code, message } d'un transport PeerJS
    detach();
    setStatus('lost', detail);
    scheduleReconnect();
  };

  const onMessage = (c, msg) => {
    if (!c.alive) return;
    lastSeen = clock.now();
    switch (msg.t) {
      case 'welcome':
        settings = msg.settings;
        attempts = 0;
        clock.clearTimeout(reconnectTimer);
        reconnectTimer = null;
        setStatus('open');
        break;
      case 'state':
        view = msg.view;
        rev = msg.rev;
        changes.emit(view, msg.events, { ack: msg.ack });
        break;
      case 'reject': rejects.emit(msg.error, msg.seq); break;
      case 'new-game': settings = msg.settings; newGames.emit(msg.settings); break;
      case 'ping': c.transport.send(makePong(msg.ts)); break;
      case 'refused':
        clock.clearTimeout(reconnectTimer);
        detach();
        setStatus('refused', { reason: msg.reason });
        break;
      default: break;
    }
  };

  function attach(t) {
    const c = { transport: t, alive: true };
    conn = c;
    lastSeen = clock.now();
    t.onMessage((msg) => onMessage(c, msg));
    t.onStatus((s) => {
      if (!c.alive) return;
      if (s === 'open') t.send(makeHello(clientId));
      else if (s === 'closed') lose();
    });
    if (t.status === 'open') t.send(makeHello(clientId));
  }

  beat = clock.setInterval(() => {
    if (!conn) return;
    if (clock.now() - lastSeen >= LIVENESS_TIMEOUT_MS) { lose(); return; }
    if (status === 'open') conn.transport.send(makePing(clock.now()));
  }, PING_INTERVAL_MS);

  if (transport) attach(transport);
  else if (connect) attach(connect());

  return {
    act(action) {
      if (status !== 'open') return null;
      const n = seq++;
      conn.transport.send(makeAction(n, rev, action));
      return n;
    },
    resync() { if (status === 'open') conn.transport.send(makeResync()); },
    close() {
      clock.clearInterval(beat);
      clock.clearTimeout(reconnectTimer);
      detach();
      setStatus('closed');
    },
    onChange: changes.add,
    onReject: rejects.add,
    onStatus: statuses.add,
    onNewGame: newGames.add,
    get view() { return view; },
    get status() { return status; },
    get settings() { return settings; },
  };
}
