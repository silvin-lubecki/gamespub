// RDC-07 (DESIGN.md §9.3) : protocole JSON v1, fork de Letter Up adapté à 4 sièges. D4 : aucune révision dans `action`
// et aucun rejet `stale` (la négociation est concurrente, seule la validation du moteur fait foi).
// Hypothèse réseau : parseMessage renvoie une copie normalisée (champs connus uniquement ; `rev` d'une action disparaît).
export const PROTOCOL_VERSION = 1;
export const MESSAGE_TYPES = ['hello', 'welcome', 'refused', 'lobby', 'state', 'action', 'reject', 'ping', 'pong', 'new-game', 'resync'];
export const REFUSED_REASONS = ['version', 'full', 'started', 'released', 'replaced'];
export const SEAT_KINDS = ['host', 'open', 'guest', 'bot'];
export const POLICIES = ['opportunist', 'volume', 'value'];
export const SEAT_COUNT = 4;
export const NAME_MAX = 20;
const RESOURCE_KINDS = 9;

export const makeHello = (clientId, name) => ({ t: 'hello', v: PROTOCOL_VERSION, clientId, name });
export const makeWelcome = (you, seats) => ({ t: 'welcome', v: PROTOCOL_VERSION, you, lobby: { seats } });
export const makeRefused = (reason) => ({ t: 'refused', reason });
export const makeLobby = (seats) => ({ t: 'lobby', seats });
// `seats` : état de connexion public des sièges ; `ack` (optionnel) : seq de l'action de l'invité dont ce state est le résultat.
export const makeState = (rev, view, seats, events = [], ack) => (
  ack === undefined ? { t: 'state', rev, view, seats, events } : { t: 'state', rev, view, seats, events, ack });
export const makeAction = (seq, action) => ({ t: 'action', seq, action });
export const makeReject = (seq, error) => ({ t: 'reject', seq, error });
export const makePing = (ts) => ({ t: 'ping', ts });
export const makePong = (ts) => ({ t: 'pong', ts });
export const makeNewGame = () => ({ t: 'new-game' });
export const makeResync = () => ({ t: 'resync' });

const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isInt = (x, min = 0) => Number.isInteger(x) && x >= min;
const isStr = (x, max = Infinity) => typeof x === 'string' && x.length >= 1 && x.length <= max;
const isCounts = (a) => Array.isArray(a) && a.length === RESOURCE_KINDS && a.every((n) => isInt(n));

function parseSeats(seats) {
  if (!Array.isArray(seats) || seats.length !== SEAT_COUNT) return null;
  const out = [];
  for (const [i, s] of seats.entries()) {
    if (!isObject(s) || !SEAT_KINDS.includes(s.kind) || (s.kind === 'host') !== (i === 0)) return null;
    if (typeof s.name !== 'string' || s.name.length > NAME_MAX + 4 || typeof s.connected !== 'boolean') return null;
    if (s.policy !== null && !POLICIES.includes(s.policy)) return null;
    out.push({ kind: s.kind, name: s.name, connected: s.connected, policy: s.policy, delegated: s.delegated === true });
  }
  return out;
}

function parseAction(a) {
  if (!isObject(a)) return null;
  switch (a.type) {
    case 'market': case 'endMarket': case 'endVisit':
      return { type: a.type };
    case 'take':
      return isInt(a.index) ? { type: 'take', index: a.index } : null;
    case 'deposit':
      return isInt(a.order) ? { type: 'deposit', order: a.order } : null;
    case 'offer': {
      if (!isCounts(a.give) || !isCounts(a.want)) return null;
      if (a.to === undefined) return { type: 'offer', give: [...a.give], want: [...a.want] };
      return isInt(a.to) && a.to < SEAT_COUNT ? { type: 'offer', to: a.to, give: [...a.give], want: [...a.want] } : null;
    }
    case 'accept': case 'decline': case 'cancel':
      return isStr(a.offer, 32) ? { type: a.type, offer: a.offer } : null;
    default:
      return null;
  }
}

function parseBody(m) {
  switch (m.t) {
    case 'hello': {
      const name = typeof m.name === 'string' ? m.name.trim() : '';
      return isInt(m.v, 1) && isStr(m.clientId, 64) && isStr(name, NAME_MAX) ? { t: 'hello', v: m.v, clientId: m.clientId, name } : null;
    }
    case 'welcome': {
      const seats = parseSeats(m.lobby?.seats);
      return isInt(m.v, 1) && isInt(m.you, 1) && m.you < SEAT_COUNT && seats ? { t: 'welcome', v: m.v, you: m.you, lobby: { seats } } : null;
    }
    case 'refused':
      return REFUSED_REASONS.includes(m.reason) ? { t: 'refused', reason: m.reason } : null;
    case 'lobby': {
      const seats = parseSeats(m.seats);
      return seats ? { t: 'lobby', seats } : null;
    }
    case 'state': {
      const seats = parseSeats(m.seats);
      if (!isInt(m.rev) || !isObject(m.view) || !seats) return null;
      if (!Array.isArray(m.events) || !m.events.every((e) => isObject(e) && typeof e.type === 'string')) return null;
      if (m.ack !== undefined && !isInt(m.ack)) return null;
      return m.ack === undefined
        ? { t: 'state', rev: m.rev, view: m.view, seats, events: m.events }
        : { t: 'state', rev: m.rev, view: m.view, seats, events: m.events, ack: m.ack };
    }
    case 'action': {
      const action = parseAction(m.action);
      return isInt(m.seq) && action ? { t: 'action', seq: m.seq, action } : null;
    }
    case 'reject':
      return isInt(m.seq) && isStr(m.error) ? { t: 'reject', seq: m.seq, error: m.error } : null;
    case 'ping':
    case 'pong':
      return typeof m.ts === 'number' && Number.isFinite(m.ts) ? { t: m.t, ts: m.ts } : null;
    case 'new-game':
      return { t: 'new-game' };
    case 'resync':
      return { t: 'resync' };
    default:
      return null;
  }
}

/** Valide la forme d'un message (chaîne JSON ou objet) → message normalisé | null (journalisé). */
export function parseMessage(raw, { log = (...a) => console.warn(...a) } = {}) {
  let m = raw;
  if (typeof raw === 'string') {
    try { m = JSON.parse(raw); } catch { log('rdc/net : JSON invalide ignoré'); return null; }
  }
  const msg = isObject(m) ? parseBody(m) : null;
  if (!msg) log('rdc/net : message invalide ignoré');
  return msg;
}
