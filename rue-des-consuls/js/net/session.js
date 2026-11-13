// RDC-07 (DESIGN.md §9, D3, D4) : sessions réseau hôte autoritaire / invités, fork de Letter Up généralisé à 3 invités.
// Hypothèses réseau RDC-07 :
//  - L'hôte occupe le siège 0 ; les sièges 1 à 3 sont ouverts, invités ou IA (salon `seats[4]`). Les IA tournent
//    uniquement chez l'hôte (D3) : le pilote RDC-04 est branché ici et passe par le même chemin que les humains.
//  - D4 : aucune révision dans `action`, aucun rejet `stale` ; seule la validation du moteur fait foi.
//  - `clientId` est le jeton de re-liaison : il n'est jamais diffusé (ni dans `lobby`, ni dans `state`), seulement conservé
//    côté hôte (et dans sa sauvegarde).
//  - Le `discard` du moteur porte les cartes défaussées (main cachée, H2) : elles sont masquées pour les autres sièges.
//  - H14 : un siège invité déconnecté peut être « confié à l'IA » (`delegated`) ; le retour de l'invité reprend la main.
//  - restore() : tous les invités sont considérés déconnectés ; rev = max(rev + 1, snap.rev).
import * as engine from '../engine/index.js';
import { SEAT_COLORS, STATE_VERSION } from '../engine/index.js';
import { DEFAULT_DELAY_MS, createBotDriver } from '../ai/driver.js';
import {
  PROTOCOL_VERSION, SEAT_COUNT, SEAT_KINDS, makeHello, makeWelcome, makeRefused, makeLobby, makeState, makeAction, makeReject,
  makePing, makePong, makeNewGame, makeResync,
} from './protocol.js';

export const PING_INTERVAL_MS = 5000;
export const LIVENESS_TIMEOUT_MS = 15000;
export const RECONNECT_DELAY_MS = 3000;
export const RECONNECT_MAX_ATTEMPTS = 10;
export const BOT_CYCLE = ['opportunist', 'volume', 'value'];
export const POLICY_LABELS = { opportunist: 'Équilibrée', volume: 'Volume', value: 'Valeur' };

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

/** Masque les cartes défaussées par un autre siège (H2) ; la longueur est conservée pour le journal. */
export function redactEvents(events, seat) {
  return events.map((e) => (e.type === 'discard' && e.seat !== seat ? { ...e, cards: e.cards.map(() => null) } : e));
}

export const botName = (i) => `IA ${SEAT_COLORS[i].name}`;

const publicSeat = (s) => ({
  kind: s.kind,
  name: s.name,
  connected: s.kind === 'open' ? false : s.kind !== 'guest' || s.conn !== null,
  policy: s.policy,
  delegated: s.delegated,
});

export function createHostSession({
  name = 'Hôte', seed, clock = systemClock, randomSeed = () => (Math.random() * 2 ** 32) >>> 0,
  botDelayMs = DEFAULT_DELAY_MS, random = Math.random,
} = {}) {
  const seats = [
    { kind: 'host', name, clientId: null, conn: null, lastSeen: 0, policy: null, delegated: false },
    ...[1, 2, 3].map(() => ({ kind: 'open', name: '', clientId: null, conn: null, lastSeen: 0, policy: null, delegated: false })),
  ];
  let phase = 'lobby';
  let state = null;
  let rev = 0;
  const changes = emitter();
  const seatChanges = emitter();

  const publicSeats = () => seats.map(publicSeat);
  const guestSeats = () => seats.map((s, i) => [s, i]).filter(([s]) => s.kind === 'guest' && s.conn !== null);
  const send = (seat, msg) => seat.conn?.transport.send(msg);
  const broadcastLobby = () => {
    const msg = makeLobby(publicSeats());
    for (const [s] of guestSeats()) send(s, msg);
    seatChanges.emit(publicSeats());
  };
  const sendState = (i, events = [], ack) => {
    send(seats[i], makeState(rev, engine.viewFor(state, i), publicSeats(), redactEvents(events, i), ack));
  };

  const driver = createBotDriver({
    getState: () => state,
    act: (seat, action) => apply(seat, action),
    isBot: (s) => seats[s].kind === 'bot' || seats[s].delegated,
    policyOf: (s) => seats[s].policy ?? 'opportunist',
    clock,
    delayMs: botDelayMs,
    random,
  });
  const notify = () => { if (phase === 'playing') driver.notify(); };

  // `by` = siège auteur, ajouté sur une copie des événements du moteur (comme Letter Up, H22).
  const commit = (events, by, ack) => {
    const tagged = events.map((e) => ({ ...e, by }));
    rev++;
    for (const [, i] of guestSeats()) sendState(i, tagged, i === by ? ack : undefined);
    changes.emit(engine.viewFor(state, 0), redactEvents(tagged, 0));
    return tagged;
  };

  function apply(seat, action, ack) {
    if (phase !== 'playing') return { ok: false, error: 'not-started' };
    const r = engine.applyAction(state, seat, action);
    if (!r.ok) return { ok: false, error: r.error };
    state = r.state;
    const events = commit(r.events, seat, ack);
    notify();
    return { ok: true, events };
  }

  const drop = (conn) => {
    if (!conn.alive) return;
    conn.alive = false;
    conn.transport.close();
    const seat = seats.find((s) => s.conn === conn);
    if (seat) {
      seat.conn = null;
      broadcastLobby();
    }
  };

  const refuse = (conn, reason) => {
    conn.transport.send(makeRefused(reason));
    conn.alive = false;
    conn.transport.close();
  };

  const uniqueName = (wanted, except) => {
    const taken = new Set(seats.filter((_, i) => i !== except).map((s) => s.name));
    let candidate = wanted;
    for (let n = 2; taken.has(candidate); n++) candidate = `${wanted} ${n}`;
    return candidate;
  };

  const onHello = (conn, msg) => {
    if (msg.v !== PROTOCOL_VERSION) return refuse(conn, 'version');
    const bound = seats.findIndex((x) => x.conn === conn);
    if (bound >= 0 && seats[bound].clientId !== msg.clientId) return undefined; // une connexion = un siège
    let i = seats.findIndex((s) => s.kind === 'guest' && s.clientId === msg.clientId);
    if (i >= 0) { // re-liaison par clientId
      const old = seats[i].conn;
      if (old && old !== conn) { // l'ancienne connexion (autre onglet du même navigateur) n'a pas à se reconnecter
        old.transport.send(makeRefused('replaced'));
        old.alive = false;
        old.transport.close();
      }
      if (phase === 'lobby') seats[i].name = uniqueName(msg.name, i);
      seats[i].delegated = false; // H14 : l'invité reprend la main
    } else {
      if (phase === 'playing') return refuse(conn, 'started');
      i = seats.findIndex((s) => s.kind === 'open');
      if (i < 0) return refuse(conn, 'full');
      Object.assign(seats[i], { kind: 'guest', name: uniqueName(msg.name, i), clientId: msg.clientId, policy: null });
    }
    seats[i].conn = conn;
    seats[i].lastSeen = clock.now();
    conn.transport.send(makeWelcome(i, publicSeats()));
    if (phase === 'playing') sendState(i);
    broadcastLobby();
    notify();
  };

  const onMessage = (conn, msg) => {
    if (!conn.alive) return;
    if (msg.t === 'hello') return onHello(conn, msg);
    const i = seats.findIndex((s) => s.conn === conn);
    if (i < 0) return undefined;
    seats[i].lastSeen = clock.now();
    if (msg.t === 'ping') conn.transport.send(makePong(msg.ts));
    else if (msg.t === 'resync') { if (phase === 'playing') sendState(i); else conn.transport.send(makeLobby(publicSeats())); }
    else if (msg.t === 'action') {
      const r = apply(i, msg.action, msg.seq);
      if (!r.ok) conn.transport.send(makeReject(msg.seq, r.error));
    }
    return undefined;
  };

  const tick = () => {
    for (const [s] of guestSeats()) {
      if (clock.now() - s.lastSeen >= LIVENESS_TIMEOUT_MS) drop(s.conn);
      else send(s, makePing(clock.now()));
    }
  };
  const timer = clock.setInterval(tick, PING_INTERVAL_MS);

  const startGame = (newSeed) => {
    state = engine.createGame({ seed: newSeed, names: seats.map((s) => s.name) });
  };

  return {
    accept(transport) {
      const conn = { transport, alive: true };
      transport.onMessage((msg) => onMessage(conn, msg));
      transport.onStatus((s) => { if (s === 'closed') drop(conn); });
      return conn;
    },
    /** Salon : Ouvert → IA Équilibrée → IA Volume → IA Valeur → Ouvert (sièges 1 à 3, hors invités). */
    cycleSeat(i) {
      const s = seats[i];
      if (phase !== 'lobby' || !(i >= 1 && i < SEAT_COUNT) || (s.kind !== 'open' && s.kind !== 'bot')) return false;
      const next = s.kind === 'open' ? 0 : BOT_CYCLE.indexOf(s.policy) + 1;
      if (next >= BOT_CYCLE.length) Object.assign(s, { kind: 'open', name: '', policy: null });
      else Object.assign(s, { kind: 'bot', name: botName(i), policy: BOT_CYCLE[next] });
      broadcastLobby();
      return true;
    },
    /** Salon : libère le siège d'un invité (il reçoit `refused: released` et ne se reconnecte plus). */
    releaseSeat(i) {
      const s = seats[i];
      if (phase !== 'lobby' || !(i >= 1 && i < SEAT_COUNT) || s.kind !== 'guest') return false;
      const { conn } = s;
      Object.assign(s, { kind: 'open', name: '', clientId: null, conn: null, policy: null, delegated: false });
      if (conn) { conn.transport.send(makeRefused('released')); conn.alive = false; conn.transport.close(); }
      broadcastLobby();
      return true;
    },
    /** Lance la partie : sièges ouverts → IA Équilibrée. */
    start() {
      if (phase !== 'lobby') return false;
      seats.forEach((s, i) => { if (s.kind === 'open') Object.assign(s, { kind: 'bot', name: botName(i), policy: 'opportunist' }); });
      startGame(seed ?? randomSeed());
      phase = 'playing';
      rev++;
      for (const [, i] of guestSeats()) sendState(i);
      broadcastLobby();
      changes.emit(engine.viewFor(state, 0), []);
      notify();
      return true;
    },
    /** Action du siège 0 (l'hôte). */
    act(action) {
      const r = apply(0, action);
      return r.ok ? { ok: true, events: r.events } : { ok: false, error: r.error };
    },
    /** H14 : confie à l'IA le siège d'un invité déconnecté. */
    confide(i) {
      const s = seats[i];
      if (phase !== 'playing' || !(i >= 1 && i < SEAT_COUNT) || s.kind !== 'guest' || s.conn !== null || s.delegated) return false;
      s.delegated = true;
      s.policy = s.policy ?? 'opportunist';
      broadcastLobby();
      notify();
      return true;
    },
    /** Rejouer : nouvelle graine, mêmes sièges. */
    rematch() {
      if (phase !== 'playing') return false;
      startGame(randomSeed());
      rev++;
      for (const [s, i] of guestSeats()) { send(s, makeNewGame()); sendState(i); }
      changes.emit(engine.viewFor(state, 0), []);
      notify();
      return true;
    },
    snapshot() {
      if (phase !== 'playing') return null;
      return {
        v: 1,
        seats: seats.map((s) => ({ kind: s.kind, name: s.name, clientId: s.clientId, policy: s.policy, delegated: s.delegated })),
        state: structuredClone(state),
        rev,
      };
    },
    restore(snap) {
      if (!snap || snap.v !== 1 || !Array.isArray(snap.seats) || snap.seats.length !== SEAT_COUNT
        || snap.seats.some((x, i) => !SEAT_KINDS.includes(x?.kind) || (x.kind === 'host') !== (i === 0))) {
        throw new Error('restore: instantané invalide');
      }
      if (snap.state?.v !== STATE_VERSION) throw new Error('restore: version d’état incompatible');
      snap.seats.forEach((s, i) => Object.assign(seats[i], {
        kind: s.kind, name: s.name, clientId: s.clientId ?? null, policy: s.policy ?? null, delegated: s.delegated === true, conn: null,
      }));
      state = structuredClone(snap.state);
      rev = Math.max(rev + 1, snap.rev);
      phase = 'playing';
      seatChanges.emit(publicSeats());
      changes.emit(engine.viewFor(state, 0), []);
      notify();
    },
    resync() { for (const [, i] of guestSeats()) if (phase === 'playing') sendState(i); },
    close() {
      clock.clearInterval(timer);
      driver.stop();
      for (const [s] of guestSeats()) drop(s.conn);
    },
    onChange: changes.add,
    onSeats: seatChanges.add,
    get view() { return state ? engine.viewFor(state, 0) : null; },
    get state() { return state; },
    get rev() { return rev; },
    get phase() { return phase; },
    get seats() { return publicSeats(); },
    get you() { return 0; },
  };
}

export function createGuestSession({ transport, connect, clientId, name, clock = systemClock }) {
  let status = 'connecting';
  let view = null;
  let seats = null;
  let you = null;
  let seq = 0;
  let attempts = 0;
  let conn = null; // { transport, alive }
  let lastSeen = clock.now();
  let reconnectTimer = null;
  const changes = emitter();
  const seatChanges = emitter();
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
      if (attempts >= RECONNECT_MAX_ATTEMPTS) { clock.clearInterval(beat); detach(); setStatus('closed'); return; }
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
        you = msg.you;
        seats = msg.lobby.seats;
        attempts = 0;
        clock.clearTimeout(reconnectTimer);
        reconnectTimer = null;
        setStatus('open');
        seatChanges.emit(seats);
        break;
      case 'lobby':
        seats = msg.seats;
        seatChanges.emit(seats);
        break;
      case 'state':
        view = msg.view;
        seats = msg.seats;
        changes.emit(view, msg.events, { ack: msg.ack });
        seatChanges.emit(seats);
        break;
      case 'reject': rejects.emit(msg.error, msg.seq); break;
      case 'new-game': newGames.emit(); break;
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
      if (s === 'open') t.send(makeHello(clientId, name));
      else if (s === 'closed') lose();
    });
    if (t.status === 'open') t.send(makeHello(clientId, name));
  }

  const beat = clock.setInterval(() => {
    if (!conn) return;
    if (clock.now() - lastSeen >= LIVENESS_TIMEOUT_MS) { lose(); return; }
    if (status === 'open') conn.transport.send(makePing(clock.now()));
  }, PING_INTERVAL_MS);

  if (transport) attach(transport);
  else if (connect) attach(connect());

  return {
    /** Envoie une action ; renvoie son `seq` (ack/reject) ou `null` hors ligne. */
    act(action) {
      if (status !== 'open') return null;
      const n = seq++;
      conn.transport.send(makeAction(n, action));
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
    onSeats: seatChanges.add,
    onReject: rejects.add,
    onStatus: statuses.add,
    onNewGame: newGames.add,
    get view() { return view; },
    get seats() { return seats; },
    get you() { return you; },
    get status() { return status; },
  };
}
