// COM-01 (DESIGN-plateforme §5.3) : sessions réseau hôte autoritaire / invités, généralisation de La Rue des Consuls
// (RDC-07) à un nombre de sièges variable (`game.seats`), des niveaux d'IA (`game.levels`) et des réglages (`game.settings`).
// Hypothèses réseau :
//  - L'hôte occupe le siège 0 ; le salon a `game.seats.max` sièges dont seuls les `seatCount` premiers sont en jeu
//    (les autres restent « ouverts » et ne sont jamais attribués). Les IA tournent uniquement chez l'hôte : le pilote
//    (`createDriver`, par défaut createTurnBotDriver) passe par le même chemin que les humains.
//  - Aucune révision dans `action`, aucun rejet `stale` ; seule la validation du moteur fait foi.
//  - `clientId` est le jeton de re-liaison : il n'est jamais diffusé (ni dans `lobby`, ni dans `state`), seulement conservé
//    côté hôte (et dans sa sauvegarde).
//  - Les événements sont marqués `by` (siège auteur) puis filtrés par siège avec `engine.redactEvents` du jeu.
//  - Un siège invité déconnecté peut être « confié à l'IA » (`delegated`) ; le retour de l'invité reprend la main.
//  - Les transports livrent la charge brute : chaque session la valide avec `protocol.parseMessage`.
//  - restore() : tous les invités sont considérés déconnectés ; rev = max(rev + 1, snap.rev).
import { withDefaults } from '../game.js';
import { randomSeed as defaultRandomSeed } from '../engine/rng.js';
import { createTurnBotDriver, DEFAULT_DELAY_MS } from '../ai/turn-driver.js';
import { systemClock } from './clock.js';
import { SEAT_KINDS, createProtocol } from './protocol.js';

export { systemClock };
export const PING_INTERVAL_MS = 5000;
export const LIVENESS_TIMEOUT_MS = 15000;
export const RECONNECT_DELAY_MS = 3000;
export const RECONNECT_MAX_ATTEMPTS = 10;
export const SNAPSHOT_VERSION = 2;

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

export const botName = (i) => `IA ${i + 1}`;

const publicSeat = (s) => ({
  kind: s.kind,
  name: s.name,
  connected: s.kind === 'open' ? false : s.kind !== 'guest' || s.conn !== null,
  level: s.level,
  delegated: s.delegated,
});

const blankSeat = (kind = 'open') => ({ kind, name: '', clientId: null, conn: null, lastSeen: 0, level: null, delegated: false });

export function createHostSession(rawGame, {
  name = 'Hôte', seed, clock = systemClock, randomSeed = defaultRandomSeed, botDelayMs = DEFAULT_DELAY_MS, random = Math.random,
  createDriver = createTurnBotDriver, log,
} = {}) {
  const game = withDefaults(rawGame);
  const { engine } = game;
  const protocol = createProtocol(game);
  const { COMMON_PROTOCOL, makeWelcome, makeRefused, makeLobby, makeState, makeReject, makePing, makePong, makeNewGame } = protocol;
  const { max, counts } = game.seats;
  const levelIds = game.levels.map((l) => l.id);
  const parseSettings = (raw, n) => game.settings.parse(raw, n);

  const seats = Array.from({ length: max }, (_, i) => (i === 0 ? { ...blankSeat('host'), name } : blankSeat()));
  let seatCount = game.seats.default;
  let settings = parseSettings(game.settings.defaults, seatCount);
  let phase = 'lobby';
  let state = null;
  let rev = 0;
  let driver = null;
  const changes = emitter();
  const seatChanges = emitter();

  const publicSeats = () => seats.map(publicSeat);
  const lobbyInfo = () => ({ seatCount, seats: publicSeats(), settings });
  const guestSeats = () => seats.map((s, i) => [s, i]).filter(([s]) => s.kind === 'guest' && s.conn !== null);
  const send = (seat, msg) => seat.conn?.transport.send(msg);
  const redact = (events, seat) => engine.redactEvents?.(events, seat) ?? events;
  const broadcastLobby = () => {
    const msg = makeLobby(lobbyInfo());
    for (const [s] of guestSeats()) send(s, msg);
    seatChanges.emit(publicSeats(), { seatCount, settings });
  };
  const sendState = (i, events = [], ack) => {
    send(seats[i], makeState(rev, engine.viewFor(state, i), publicSeats(), redact(events, i), ack));
  };

  const startDriver = (gameSeed) => {
    driver?.stop();
    driver = createDriver({
      game,
      getState: () => state,
      act: (seat, action) => apply(seat, action),
      isBot: (s) => seats[s].kind === 'bot' || seats[s].delegated,
      levelOf: (s) => seats[s].level ?? game.defaultLevel,
      clock,
      delayMs: botDelayMs,
      random,
      seed: gameSeed,
    });
  };
  const notify = () => { if (phase === 'playing') driver?.notify(); };

  // `by` = siège auteur, ajouté sur une copie des événements du moteur.
  const commit = (events, by, ack) => {
    const tagged = events.map((e) => ({ ...e, by }));
    rev++;
    for (const [, i] of guestSeats()) sendState(i, tagged, i === by ? ack : undefined);
    changes.emit(engine.viewFor(state, 0), redact(tagged, 0));
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
    if (msg.v !== COMMON_PROTOCOL || msg.gv !== game.protocolVersion || msg.game !== game.id) return refuse(conn, 'version');
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
      seats[i].delegated = false; // l'invité reprend la main
      seats[i].level = null;
    } else {
      if (phase === 'playing') return refuse(conn, 'started');
      i = seats.findIndex((s, k) => k < seatCount && s.kind === 'open');
      if (i < 0) return refuse(conn, 'full');
      Object.assign(seats[i], { kind: 'guest', name: uniqueName(msg.name, i), clientId: msg.clientId, level: null });
    }
    seats[i].conn = conn;
    seats[i].lastSeen = clock.now();
    conn.transport.send(makeWelcome(i, lobbyInfo()));
    if (phase === 'playing') sendState(i);
    broadcastLobby();
    notify();
    return undefined;
  };

  const onMessage = (conn, msg) => {
    if (!conn.alive) return undefined;
    if (msg.t === 'hello') return onHello(conn, msg);
    const i = seats.findIndex((s) => s.conn === conn);
    if (i < 0) return undefined;
    seats[i].lastSeen = clock.now();
    if (msg.t === 'ping') conn.transport.send(makePong(msg.ts));
    else if (msg.t === 'resync') { if (phase === 'playing') sendState(i); else conn.transport.send(makeLobby(lobbyInfo())); }
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
    state = engine.createGame({ seed: newSeed, names: seats.slice(0, seatCount).map((s) => s.name), seatCount, settings });
    startDriver(newSeed);
  };

  const startError = () => game.validateStart?.(seatCount, settings) ?? null;
  const inLobbyRange = (i) => phase === 'lobby' && i >= 1 && i < seatCount;

  return {
    accept(transport) {
      const conn = { transport, alive: true };
      transport.onMessage((raw) => {
        const msg = protocol.parseMessage(raw, log ? { log } : undefined);
        if (msg) onMessage(conn, msg);
      });
      transport.onStatus((s) => { if (s === 'closed') drop(conn); });
      return conn;
    },
    /** Salon : nombre de sièges en jeu (`game.seats.counts`). Refusé si un invité occupe un siège ≥ n (à libérer d'abord). */
    setSeatCount(n) {
      if (phase !== 'lobby' || !counts.includes(n)) return false;
      if (seats.some((s, i) => i >= n && s.kind === 'guest')) return false;
      seats.forEach((s, i) => { if (i >= n && s.kind === 'bot') Object.assign(s, blankSeat()); });
      seatCount = n;
      settings = parseSettings(settings, n) ?? parseSettings(game.settings.defaults, n);
      broadcastLobby();
      return true;
    },
    /** Salon : Ouvert → IA niveau 1 → … → IA niveau k → Ouvert (hors invités). */
    cycleSeat(i) {
      const s = seats[i];
      if (!inLobbyRange(i) || (s.kind !== 'open' && s.kind !== 'bot')) return false;
      const nextLevel = s.kind === 'open' ? 0 : levelIds.indexOf(s.level) + 1;
      if (nextLevel >= levelIds.length) Object.assign(s, { kind: 'open', name: '', level: null });
      else Object.assign(s, { kind: 'bot', name: botName(i), level: levelIds[nextLevel] });
      broadcastLobby();
      return true;
    },
    /** Salon : réglages du jeu, validés par `game.settings.parse`. */
    setSettings(raw) {
      if (phase !== 'lobby') return false;
      const parsed = parseSettings(raw, seatCount);
      if (parsed === null) return false;
      settings = parsed;
      broadcastLobby();
      return true;
    },
    /** Salon : libère le siège d'un invité (il reçoit `refused: released` et ne se reconnecte plus). */
    releaseSeat(i) {
      const s = seats[i];
      if (phase !== 'lobby' || !(i >= 1 && i < max) || s.kind !== 'guest') return false;
      const { conn } = s;
      Object.assign(s, blankSeat());
      if (conn) { conn.transport.send(makeRefused('released')); conn.alive = false; conn.transport.close(); }
      broadcastLobby();
      return true;
    },
    /** Lance la partie : refusée si `validateStart` donne un message ; sièges ouverts → IA du niveau par défaut. */
    start() {
      if (phase !== 'lobby' || startError() !== null) return false;
      seats.forEach((s, i) => {
        if (i < seatCount && s.kind === 'open') Object.assign(s, { kind: 'bot', name: botName(i), level: game.defaultLevel });
      });
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
      return r.ok ? { ok: true, events: redact(r.events, 0) } : { ok: false, error: r.error };
    },
    /** Confie à l'IA le siège d'un invité déconnecté. */
    confide(i) {
      const s = seats[i];
      if (phase !== 'playing' || !(i >= 1 && i < seatCount) || s.kind !== 'guest' || s.conn !== null || s.delegated) return false;
      s.delegated = true;
      s.level ??= game.defaultLevel;
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
        v: SNAPSHOT_VERSION,
        game: game.id,
        seatCount,
        settings: structuredClone(settings),
        seats: seats.map((s) => ({ kind: s.kind, name: s.name, clientId: s.clientId, level: s.level, delegated: s.delegated })),
        state: structuredClone(state),
        rev,
      };
    },
    restore(snap) {
      const valid = snap && snap.v === SNAPSHOT_VERSION && Array.isArray(snap.seats) && snap.seats.length === max
        && counts.includes(snap.seatCount)
        && Number.isInteger(snap.rev) && snap.rev >= 0
        && snap.seats.every((x, i) => SEAT_KINDS.includes(x?.kind) && (x.kind === 'host') === (i === 0)
          && typeof x.name === 'string' && (x.clientId === undefined || x.clientId === null || typeof x.clientId === 'string')
          && (x.delegated === undefined || typeof x.delegated === 'boolean')
          && (x.level === undefined || x.level === null || levelIds.includes(x.level))
          // en partie, un siège en jeu n'est jamais « ouvert » ; un invité a un clientId et se trouve parmi les sièges en jeu
          && (i >= snap.seatCount ? x.kind !== 'guest' : x.kind !== 'open' && (x.kind !== 'guest' || typeof x.clientId === 'string')))
        && parseSettings(snap.settings, snap.seatCount) !== null;
      if (!valid) throw new Error('restore: instantané invalide');
      if (snap.game !== game.id) throw new Error('restore: autre jeu');
      if (snap.state?.v !== engine.STATE_VERSION) throw new Error('restore: version d’état incompatible');
      for (const [s] of guestSeats()) drop(s.conn); // d'éventuelles connexions antérieures sont fermées
      snap.seats.forEach((s, i) => Object.assign(seats[i], {
        kind: s.kind, name: s.name, clientId: s.clientId ?? null, level: s.level ?? null, delegated: s.delegated === true, conn: null,
      }));
      seatCount = snap.seatCount;
      settings = parseSettings(snap.settings, seatCount);
      state = structuredClone(snap.state);
      rev = Math.max(rev + 1, snap.rev);
      phase = 'playing';
      startDriver(seed ?? randomSeed());
      seatChanges.emit(publicSeats(), { seatCount, settings });
      changes.emit(engine.viewFor(state, 0), []);
      notify();
    },
    resync() { for (const [, i] of guestSeats()) if (phase === 'playing') sendState(i); },
    close() {
      clock.clearInterval(timer);
      driver?.stop();
      for (const [s] of guestSeats()) drop(s.conn);
    },
    onChange: changes.add,
    onSeats: seatChanges.add,
    get view() { return state ? engine.viewFor(state, 0) : null; },
    get state() { return state; },
    get rev() { return rev; },
    get phase() { return phase; },
    get seats() { return publicSeats(); },
    get seatCount() { return seatCount; },
    get settings() { return settings; },
    /** Message du jeu (`validateStart`) qui empêche de lancer, ou null. */
    get startError() { return startError(); },
    get you() { return 0; },
  };
}

export function createGuestSession(rawGame, { transport, connect, clientId, name, clock = systemClock, log } = {}) {
  const game = withDefaults(rawGame);
  const protocol = createProtocol(game);
  const { makeHello, makePong, makePing, makeAction, makeResync } = protocol;
  let status = 'connecting';
  let view = null;
  let seats = null;
  let lobby = null; // { seatCount, settings } du dernier salon reçu
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

  const setLobby = (l) => {
    seats = l.seats;
    lobby = { seatCount: l.seatCount, settings: l.settings };
    seatChanges.emit(seats, lobby);
  };

  const onMessage = (c, msg) => {
    if (!c.alive) return;
    lastSeen = clock.now();
    switch (msg.t) {
      case 'welcome':
        you = msg.you;
        attempts = 0;
        clock.clearTimeout(reconnectTimer);
        reconnectTimer = null;
        setStatus('open');
        setLobby(msg.lobby);
        break;
      case 'lobby':
        setLobby(msg);
        break;
      case 'state':
        view = msg.view;
        seats = msg.seats;
        changes.emit(view, msg.events, { ack: msg.ack });
        seatChanges.emit(seats, lobby);
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
    t.onMessage((raw) => {
      const msg = protocol.parseMessage(raw, log ? { log } : undefined);
      if (msg) onMessage(c, msg);
    });
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
    get seatCount() { return lobby?.seatCount ?? null; },
    get settings() { return lobby?.settings ?? null; },
    get you() { return you; },
    get status() { return status; },
  };
}
