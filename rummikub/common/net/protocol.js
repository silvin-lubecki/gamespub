// COM-01 (DESIGN-plateforme §5.2) : protocole JSON commun, généralisation du protocole de La Rue des Consuls.
// `hello.v` = COMMON_PROTOCOL (messages du socle), `hello.gv` = game.protocolVersion (actions du jeu), `hello.game` = game.id.
// Hypothèse réseau : parseMessage renvoie une copie normalisée (champs connus uniquement ; `rev` d'une action disparaît).
// Aucune révision dans `action` et aucun rejet `stale` : seule la validation du moteur fait foi.
import { withDefaults } from '../game.js';

export const COMMON_PROTOCOL = 1;
export const MESSAGE_TYPES = ['hello', 'welcome', 'refused', 'lobby', 'state', 'action', 'reject', 'ping', 'pong', 'new-game', 'resync'];
export const REFUSED_REASONS = ['version', 'full', 'started', 'released', 'replaced'];
export const SEAT_KINDS = ['host', 'open', 'guest', 'bot'];
export const NAME_MAX = 20;

const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isInt = (x, min = 0) => Number.isInteger(x) && x >= min;
const isStr = (x, max = Infinity) => typeof x === 'string' && x.length >= 1 && x.length <= max;

/** `createProtocol(game)` → `{ make*, parseMessage }` (le jeu fournit niveaux, réglages et validation des actions). */
export function createProtocol(rawGame) {
  const game = withDefaults(rawGame);
  const { max } = game.seats;
  const levelIds = game.levels.map((l) => l.id);

  const parseSeats = (seats) => {
    if (!Array.isArray(seats) || seats.length !== max) return null;
    const out = [];
    for (const [i, s] of seats.entries()) {
      if (!isObject(s) || !SEAT_KINDS.includes(s.kind) || (s.kind === 'host') !== (i === 0)) return null;
      if (typeof s.name !== 'string' || s.name.length > NAME_MAX + 4 || typeof s.connected !== 'boolean') return null;
      if (s.level !== null && !levelIds.includes(s.level)) return null;
      out.push({ kind: s.kind, name: s.name, connected: s.connected, level: s.level, delegated: s.delegated === true });
    }
    return out;
  };

  // `lobby` partagé par le message `lobby` et `welcome.lobby` : { seatCount, seats, settings }.
  const parseLobby = (m) => {
    if (!isObject(m)) return null;
    const seats = parseSeats(m.seats);
    if (!seats || !game.seats.counts.includes(m.seatCount)) return null;
    const settings = isObject(m.settings) ? game.settings.parse(m.settings, m.seatCount) : null;
    return settings ? { seatCount: m.seatCount, seats, settings } : null;
  };

  function parseBody(m) {
    switch (m.t) {
      case 'hello': {
        const name = typeof m.name === 'string' ? m.name.trim() : '';
        // `gv` et `game` illisibles → null : l'hôte répond `refused: version` (un ancien client reste refusable proprement).
        return isInt(m.v, 1) && isStr(m.clientId, 64) && isStr(name, NAME_MAX)
          ? { t: 'hello', v: m.v, gv: isInt(m.gv, 1) ? m.gv : null, game: isStr(m.game, 64) ? m.game : null, clientId: m.clientId, name }
          : null;
      }
      case 'welcome': {
        const lobby = parseLobby(m.lobby);
        return isInt(m.v, 1) && lobby && isInt(m.you, 1) && m.you < lobby.seatCount ? { t: 'welcome', v: m.v, you: m.you, lobby } : null;
      }
      case 'refused':
        return REFUSED_REASONS.includes(m.reason) ? { t: 'refused', reason: m.reason } : null;
      case 'lobby': {
        const lobby = parseLobby(m);
        return lobby ? { t: 'lobby', ...lobby } : null;
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
        const action = game.parseAction(m.action);
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

  return {
    COMMON_PROTOCOL,
    makeHello: (clientId, name) => ({ t: 'hello', v: COMMON_PROTOCOL, gv: game.protocolVersion, game: game.id, clientId, name }),
    // `lobby` : { seatCount, seats, settings } (état public du salon).
    makeWelcome: (you, lobby) => ({ t: 'welcome', v: COMMON_PROTOCOL, you, lobby }),
    makeRefused: (reason) => ({ t: 'refused', reason }),
    makeLobby: (lobby) => ({ t: 'lobby', ...lobby }),
    // `seats` : état de connexion public des sièges ; `ack` (optionnel) : seq de l'action de l'invité dont ce state est le résultat.
    makeState: (rev, view, seats, events = [], ack) => (
      ack === undefined ? { t: 'state', rev, view, seats, events } : { t: 'state', rev, view, seats, events, ack }),
    makeAction: (seq, action) => ({ t: 'action', seq, action }),
    makeReject: (seq, error) => ({ t: 'reject', seq, error }),
    makePing: (ts) => ({ t: 'ping', ts }),
    makePong: (ts) => ({ t: 'pong', ts }),
    makeNewGame: () => ({ t: 'new-game' }),
    makeResync: () => ({ t: 'resync' }),
    /** Valide la forme d'un message (chaîne JSON ou objet) → message normalisé | null (journalisé). */
    parseMessage(raw, { log = (...a) => console.warn(...a) } = {}) {
      let m = raw;
      if (typeof raw === 'string') {
        try { m = JSON.parse(raw); } catch { log(`${game.id}/net : JSON invalide ignoré`); return null; }
      }
      const msg = isObject(m) ? parseBody(m) : null;
      if (!msg) log(`${game.id}/net : message invalide ignoré`);
      return msg;
    },
  };
}
