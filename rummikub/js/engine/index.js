// Moteur du Rummikub (DESIGN §8.2). Pur et déterministe : état JSON, hasard dans `state.rng` (mulberry32).
// Hypothèses : H-RUM-1 (premier joueur tiré avec la graine), H-RUM-2 (validation à l'envoi), H-RUM-3 (joker récupéré
// rejoué : il reste sur la table), H-RUM-4 (« passer » si la pioche est vide), H-RUM-5 (une seule partie),
// H-RUM-6/7 (jokers, voir sets.js), H-RUM-8 (égalité à la fin « bloqué »).
import { next, seedState, shuffleState } from '../../common/engine/rng.js';
import { analyzeSet } from './sets.js';
import { ALL_TILES, isTile, rackValue } from './tiles.js';

export const STATE_VERSION = 1;
export const HAND_SIZE = 14;
export const INITIAL_MELD = 30;

export function createGame({ seed, names, seatCount }) {
  const shuffled = shuffleState(ALL_TILES, seedState(seed));
  const racks = [];
  for (let s = 0; s < seatCount; s++) racks.push(shuffled.array.slice(s * HAND_SIZE, (s + 1) * HAND_SIZE).sort((a, b) => a - b));
  const first = next(shuffled.rng);
  return {
    v: STATE_VERSION, rng: first.rng, seatCount, names: names.slice(0, seatCount),
    pool: shuffled.array.slice(seatCount * HAND_SIZE), racks, table: [], melded: Array(seatCount).fill(false),
    current: Math.floor(first.value * seatCount), passes: 0, phase: 'play', winner: null, scores: null, reason: null,
  };
}

const setKey = (ids) => ids.slice().sort((a, b) => a - b).join(',');

/** Fin de partie : H-RUM-8, en cas d'égalité sur le plus petit total, le moins de tuiles puis le plus petit siège. */
function finish(state, winner, reason) {
  const totals = state.racks.map(rackValue);
  const scores = totals.map((t) => (reason === 'rummikub' ? 0 - t : totals[winner] - t));
  scores[winner] = 0;
  scores[winner] = 0 - scores.reduce((a, b) => a + b, 0);
  return { ...state, phase: 'over', winner, scores, reason };
}

function blockedWinner(state) {
  let best = 0;
  state.racks.forEach((rack, s) => {
    const a = rackValue(rack), b = rackValue(state.racks[best]);
    if (a < b || (a === b && rack.length < state.racks[best].length)) best = s;
  });
  return best;
}

const over = (state) => ({ type: 'over', winner: state.winner, scores: state.scores, reason: state.reason });
const advance = (state) => (state.current + 1) % state.seatCount;

/**
 * Validation d'une table proposée (DESIGN §8.2), partagée avec l'interface : `oldTable` est la table du début de tour,
 * `rack` le chevalet du joueur, `melded` son statut de première pose. → { ok, played, value } | { ok: false, error }.
 */
export function checkPlay(oldTable, rack, melded, table) {
  if (!Array.isArray(table) || !table.every((set) => Array.isArray(set) && set.every(isTile))) return { ok: false, error: 'bad-action' };
  const proposed = table.flat();
  if (new Set(proposed).size !== proposed.length) return { ok: false, error: 'tiles-mismatch' };
  const old = new Set(oldTable.flat());
  const played = proposed.filter((id) => !old.has(id));
  if (![...old].every((id) => proposed.includes(id)) || !played.every((id) => rack.includes(id))) return { ok: false, error: 'tiles-mismatch' };
  if (played.length === 0) return { ok: false, error: 'no-tile-played' };
  const analyses = table.map(analyzeSet);
  if (analyses.some((a) => a === null)) return { ok: false, error: 'invalid-set' };
  let value = 0;
  if (!melded) {
    const kept = new Map();
    for (const set of oldTable) kept.set(setKey(set), (kept.get(setKey(set)) ?? 0) + 1);
    for (let i = 0; i < table.length; i++) {
      const key = setKey(table[i]);
      if (kept.get(key) > 0) { kept.set(key, kept.get(key) - 1); continue; }
      if (table[i].some((id) => old.has(id))) return { ok: false, error: 'initial-meld-table' };
      value += analyses[i].value;
    }
    if ([...kept.values()].some((n) => n > 0)) return { ok: false, error: 'initial-meld-table' };
    if (value < INITIAL_MELD) return { ok: false, error: 'initial-meld-30' };
  }
  return { ok: true, played, value };
}

function applyPlay(state, seat, table) {
  const check = checkPlay(state.table, state.racks[seat], state.melded[seat], table);
  if (!check.ok) return check;
  const { played } = check;
  const first = !state.melded[seat];
  const racks = state.racks.map((r, s) => (s === seat ? r.filter((id) => !played.includes(id)) : r));
  const melded = state.melded.map((m, s) => m || s === seat);
  let next_ = { ...state, table: table.map((set) => set.slice()), racks, melded, passes: 0, current: advance(state) };
  const events = [{ type: 'played', seat, tiles: played, ...(first ? { melded: true } : {}) }];
  if (racks[seat].length === 0) {
    next_ = finish({ ...next_, current: seat }, seat, 'rummikub');
    events.push(over(next_));
  }
  return { ok: true, state: next_, events };
}

export function applyAction(state, seat, action) {
  if (state.phase === 'over') return { ok: false, error: 'over' };
  if (seat !== state.current) return { ok: false, error: 'not-your-turn' };
  switch (action?.type) {
    case 'draw': {
      if (state.pool.length === 0) return { ok: false, error: 'pool-empty' };
      const tile = state.pool[0];
      const racks = state.racks.map((r, s) => (s === seat ? [...r, tile] : r));
      return { ok: true, state: { ...state, pool: state.pool.slice(1), racks, passes: 0, current: advance(state) }, events: [{ type: 'drew', seat, tile }] };
    }
    case 'pass': {
      if (state.pool.length > 0) return { ok: false, error: 'pool-not-empty' };
      const passes = state.passes + 1;
      let s = { ...state, passes, current: advance(state) };
      const events = [{ type: 'passed', seat }];
      if (passes >= state.seatCount) { s = finish({ ...s, current: seat }, blockedWinner(state), 'blocked'); events.push(over(s)); }
      return { ok: true, state: s, events };
    }
    case 'play': return applyPlay(state, seat, action.table);
    default: return { ok: false, error: 'bad-action' };
  }
}

export function viewFor(state, seat) {
  const view = {
    you: seat, names: state.names, seatCount: state.seatCount, rack: state.racks[seat].slice(),
    counts: state.racks.map((r) => r.length), melded: state.melded.slice(), table: state.table.map((set) => set.slice()),
    poolSize: state.pool.length, current: state.current, phase: state.phase, passes: state.passes,
    winner: state.winner, scores: state.scores, reason: state.reason,
  };
  if (state.phase === 'over') view.racks = state.racks.map((r) => r.slice());
  return view;
}

/** Le tirage d'un autre siège est privé : la tuile est masquée. */
export const redactEvents = (events, seat) => events.map((e) => (e.type === 'drew' && e.seat !== seat ? { ...e, tile: null } : e));

export const currentSeat = (state) => (state.phase === 'over' ? null : state.current);
export const isOver = (state) => state.phase === 'over';

export const engine = { STATE_VERSION, createGame, applyAction, viewFor, currentSeat, isOver, redactEvents };

/** Validation de forme seulement : doublons et règles sont laissés au moteur. */
export function parseAction(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.type === 'draw' || raw.type === 'pass') return { type: raw.type };
  if (raw.type !== 'play' || !Array.isArray(raw.table) || raw.table.length === 0) return null;
  let total = 0;
  for (const set of raw.table) {
    if (!Array.isArray(set) || set.length === 0 || !set.every(isTile)) return null;
    total += set.length;
  }
  return total <= ALL_TILES.length ? { type: 'play', table: raw.table.map((set) => set.slice()) } : null;
}
