// Protocole JSON v2 (DESIGN.md §9.2) : `rev` dans `action`, `ack` dans `state` (LU-16, D10–D12). H2 (motifs coop par niveau) : valide les réglages coop.
import { COOP_MOTIFS } from '../engine/layout.js';
// Hypothèse réseau A2 : parseMessage renvoie une copie normalisée (champs connus uniquement).
export const PROTOCOL_VERSION = 2;
export const MESSAGE_TYPES = ['hello', 'welcome', 'refused', 'state', 'action', 'reject', 'ping', 'pong', 'new-game', 'resync'];
export const REFUSED_REASONS = ['version', 'full'];
export const ACTION_TYPES = ['play', 'renew', 'pass'];

export const makeHello = (clientId) => ({ t: 'hello', v: PROTOCOL_VERSION, clientId });
const settingsPayload = (s) => ({
  mode: s.mode,
  coop: s.mode === 'coop' && s.coop ? { level: s.coop.level, motif: s.coop.motif } : null,
});
export const makeWelcome = (settings) => ({ t: 'welcome', v: PROTOCOL_VERSION, you: 1, settings: settingsPayload(settings) });
export const makeRefused = (reason) => ({ t: 'refused', reason });
// `ack` (optionnel) : seq de l'action de l'invité dont ce state est le résultat ; clé absente sinon.
export const makeState = (rev, view, events = [], ack) => (
  ack === undefined ? { t: 'state', rev, view, events } : { t: 'state', rev, view, events, ack });
// `rev` (obligatoire) : révision du dernier state reçu, sur lequel l'action a été composée (H15).
export const makeAction = (seq, rev, action) => ({ t: 'action', seq, rev, action });
export const makeReject = (seq, error) => ({ t: 'reject', seq, error });
export const makePing = (ts) => ({ t: 'ping', ts });
export const makePong = (ts) => ({ t: 'pong', ts });
export const makeNewGame = (settings) => ({ t: 'new-game', settings: settingsPayload(settings) });
export const makeResync = () => ({ t: 'resync' });

const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isInt = (x, min = 0) => Number.isInteger(x) && x >= min;
const isStr = (x, max = Infinity) => typeof x === 'string' && x.length >= 1 && x.length <= max;

function parseSettings(s) {
  if (!isObject(s) || (s.mode !== 'versus' && s.mode !== 'coop')) return null;
  if (s.mode === 'versus') return { mode: 'versus', coop: null };
  const c = s.coop;
  if (!isObject(c) || !COOP_MOTIFS[c.level]?.includes(c.motif)) return null;
  return { mode: 'coop', coop: { level: c.level, motif: c.motif } };
}

function parseAction(a) {
  if (!isObject(a)) return null;
  if (a.type === 'pass') return { type: 'pass' };
  if (a.type === 'renew') {
    if (!Array.isArray(a.rackIndices) || !a.rackIndices.every((i) => isInt(i))) return null;
    return { type: 'renew', rackIndices: [...a.rackIndices] };
  }
  if (a.type === 'play') {
    if (!Array.isArray(a.placements)) return null;
    const placements = [];
    for (const p of a.placements) {
      if (!isObject(p) || !isInt(p.cell) || !isInt(p.rackIndex) || !isStr(p.letter, 1)) return null;
      placements.push({ cell: p.cell, rackIndex: p.rackIndex, letter: p.letter });
    }
    return { type: 'play', placements };
  }
  return null;
}

function parseBody(m) {
  switch (m.t) {
    case 'hello':
      return isInt(m.v, 1) && isStr(m.clientId, 64) ? { t: 'hello', v: m.v, clientId: m.clientId } : null;
    case 'welcome': {
      const settings = parseSettings(m.settings);
      return isInt(m.v, 1) && m.you === 1 && settings ? { t: 'welcome', v: m.v, you: 1, settings } : null;
    }
    case 'refused':
      return REFUSED_REASONS.includes(m.reason) ? { t: 'refused', reason: m.reason } : null;
    case 'state':
      if (!isInt(m.rev) || !isObject(m.view)) return null;
      if (!Array.isArray(m.events) || !m.events.every((e) => isObject(e) && typeof e.type === 'string')) return null;
      if (m.ack !== undefined && !isInt(m.ack)) return null;
      return m.ack === undefined
        ? { t: 'state', rev: m.rev, view: m.view, events: m.events }
        : { t: 'state', rev: m.rev, view: m.view, events: m.events, ack: m.ack };
    case 'action': {
      const action = parseAction(m.action);
      return isInt(m.seq) && isInt(m.rev) && action ? { t: 'action', seq: m.seq, rev: m.rev, action } : null;
    }
    case 'reject':
      return isInt(m.seq) && isStr(m.error) ? { t: 'reject', seq: m.seq, error: m.error } : null;
    case 'ping':
    case 'pong':
      return typeof m.ts === 'number' && Number.isFinite(m.ts) ? { t: m.t, ts: m.ts } : null;
    case 'new-game': {
      const settings = parseSettings(m.settings);
      return settings ? { t: 'new-game', settings } : null;
    }
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
    try { m = JSON.parse(raw); } catch { log('letterup/net : JSON invalide ignoré'); return null; }
  }
  const msg = isObject(m) ? parseBody(m) : null;
  if (!msg) log('letterup/net : message invalide ignoré');
  return msg;
}
