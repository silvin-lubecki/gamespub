// Moteur pur de Séquence (DESIGN-plateforme §7.1–§7.2). État JSON, déterministe (mulberry32 de common/engine/rng.js), sans DOM.
// Hypothèses H-SEQ-1 à H-SEQ-7 : voir docs/DESIGN.md.
import { next, seedState, shuffleState } from '../../common/engine/rng.js';
import { BOARD, CELLS_OF, isCorner } from './board.js';
import { CARD_RE, fullDeck, isJack, isOneEyed, isTwoEyed } from './cards.js';
import { findNewSequences } from './sequences.js';

export const STATE_VERSION = 1;
export const HAND_SIZES = Object.freeze({ 2: 7, 3: 6, 4: 6, 6: 5, 8: 4, 9: 4, 10: 3, 12: 3 });

/** Nombre d'équipes : 2 ou 3 joueurs jouent seuls ; 9 = 3 équipes ; 6 et 12 au choix (réglage `teams`) ; sinon 2. */
export function teamCount(seatCount, settings) {
  if (seatCount <= 3) return seatCount;
  if (seatCount === 9) return 3;
  if (seatCount === 6 || seatCount === 12) return Number(settings?.teams) === 3 ? 3 : 2;
  return 2;
}
/** Équipe du siège i = i mod k (les coéquipiers alternent autour de la table). */
export const teamOf = (seat, teams) => seat % teams;
/** Séquences à réaliser : 1 avec 3 équipes, 2 sinon. */
export const targetFor = (teams) => (teams === 3 ? 1 : 2);

export function createGame({ seed, names, seatCount, settings }) {
  if (!HAND_SIZES[seatCount]) throw new Error(`Séquence : ${seatCount} joueurs non pris en charge`);
  const teams = teamCount(seatCount, settings);
  const shuffled = shuffleState(fullDeck(), seedState(seed));
  const deck = shuffled.array;
  const hands = Array.from({ length: seatCount }, () => []);
  for (let k = 0; k < HAND_SIZES[seatCount]; k++) for (let s = 0; s < seatCount; s++) hands[s].push(deck.pop());
  const first = next(shuffled.rng); // H-SEQ-3 : premier joueur tiré au sort avec la graine
  return {
    v: STATE_VERSION,
    rng: first.rng,
    seatCount,
    names: Array.from({ length: seatCount }, (_, i) => String(names?.[i] ?? `Joueur ${i + 1}`)),
    teams,
    target: targetFor(teams),
    board: BOARD.map((card) => ({ card, chip: null, locked: false })),
    deck,
    discard: [],
    hands,
    sequences: [],
    lastCards: Array(seatCount).fill(null),
    last: null,
    current: Math.floor(first.value * seatCount),
    deadUsed: false,
    passes: 0,
    phase: 'play',
    winner: null,
  };
}

export const currentSeat = (state) => (state.phase === 'play' ? state.current : null);
export const isOver = (state) => state.phase === 'over';

/** Cartes mortes de la main (non-valets dont les deux cases sont occupées). */
export function deadCards(state, seat) {
  const out = [];
  for (const card of new Set(state.hands[seat])) {
    if (!isJack(card) && CELLS_OF[card].every((i) => state.board[i].chip !== null)) out.push(card);
  }
  return out;
}

/** Cases où `card` peut être jouée par `seat`. */
export function targetsOf(state, seat, card) {
  const team = teamOf(seat, state.teams);
  const out = [];
  if (isTwoEyed(card)) {
    state.board.forEach((c, i) => { if (!isCorner(i) && c.chip === null) out.push(i); });
  } else if (isOneEyed(card)) {
    state.board.forEach((c, i) => { if (!isCorner(i) && c.chip !== null && c.chip !== team && !c.locked) out.push(i); });
  } else {
    for (const i of CELLS_OF[card]) if (state.board[i].chip === null) out.push(i);
  }
  return out;
}

/** Tous les coups `play` légaux (cartes distinctes × cases). */
export function legalPlays(state, seat) {
  const out = [];
  for (const card of new Set(state.hands[seat])) for (const cell of targetsOf(state, seat, card)) out.push({ type: 'play', card, cell });
  return out;
}

/** H-SEQ-5 : passer n'est permis que sans coup légal, une fois la carte morte éventuelle échangée. */
export const canPass = (state, seat) => legalPlays(state, seat).length === 0 && (state.deadUsed || deadCards(state, seat).length === 0);

const fail = (error) => ({ ok: false, error });

// Pioche une carte pour `seat` (remélange des défausses si la pioche est vide) ; muté sur des copies locales.
function draw(w, seat, events) {
  if (w.deck.length === 0 && w.discard.length > 0) {
    const sh = shuffleState(w.discard, w.rng);
    w.deck = sh.array;
    w.rng = sh.rng;
    w.discard = [];
    events.push({ type: 'reshuffled', size: w.deck.length });
  }
  if (w.deck.length === 0) return; // pioche et défausse vides : cas pathologique, la main reste courte
  const card = w.deck.pop();
  w.hands[seat].push(card);
  events.push({ type: 'drew', seat, card });
}

const removeOne = (hand, card) => { hand.splice(hand.indexOf(card), 1); };

export function applyAction(state, seat, action) {
  if (state.phase !== 'play') return fail('over');
  if (seat !== state.current) return fail('not-your-turn');
  if (!action || typeof action !== 'object') return fail('bad-action');
  const w = {
    ...state,
    hands: state.hands.map((h) => h.slice()),
    deck: state.deck.slice(),
    discard: state.discard.slice(),
    lastCards: state.lastCards.slice(),
  };
  const events = [];

  if (action.type === 'pass') {
    if (!canPass(state, seat)) return fail('cannot-pass');
    events.push({ type: 'passed', seat });
    w.passes = state.passes + 1;
    w.current = (seat + 1) % state.seatCount;
    w.deadUsed = false;
    if (w.passes >= state.seatCount) { // tout le monde passe d'affilée : partie nulle
      w.phase = 'over';
      w.winner = 'draw';
      events.push({ type: 'over', winner: 'draw' });
    }
    return { ok: true, state: w, events };
  }

  if (action.type === 'dead') {
    const card = action.card;
    if (typeof card !== 'string' || !w.hands[seat].includes(card)) return fail('not-in-hand');
    if (isJack(card) || !CELLS_OF[card].every((i) => state.board[i].chip !== null)) return fail('not-dead');
    if (state.deadUsed) return fail('dead-used');
    removeOne(w.hands[seat], card);
    w.discard.push(card);
    w.lastCards[seat] = card;
    events.push({ type: 'dead', seat, card });
    draw(w, seat, events);
    w.deadUsed = true;
    return { ok: true, state: w, events };
  }

  if (action.type !== 'play') return fail('bad-action');
  const { card, cell } = action;
  if (typeof card !== 'string' || !w.hands[seat].includes(card)) return fail('not-in-hand');
  if (!Number.isInteger(cell) || cell < 0 || cell > 99) return fail('bad-cell');
  if (isCorner(cell)) return fail('corner');
  const team = teamOf(seat, state.teams);
  const target = state.board[cell];
  w.board = state.board.slice();

  if (isOneEyed(card)) {
    if (target.chip === null) return fail('empty-cell');
    if (target.chip === team) return fail('own-chip');
    if (target.locked) return fail('locked');
    w.board[cell] = { ...target, chip: null };
    events.push({ type: 'removed', seat, card, cell, team: target.chip });
  } else {
    if (!isTwoEyed(card) && !CELLS_OF[card].includes(cell)) return fail('wrong-cell');
    if (target.chip !== null) return fail('occupied');
    w.board[cell] = { ...target, chip: team };
    events.push({ type: 'played', seat, card, cell, team });
    const found = findNewSequences(w.board, state.sequences, team, cell);
    if (found.length) {
      w.sequences = [...state.sequences, ...found];
      for (const s of found) {
        for (const i of s.cells) if (!isCorner(i)) w.board[i] = { ...w.board[i], locked: true };
        events.push({ type: 'sequence', team, cells: s.cells.slice() });
      }
    }
  }
  removeOne(w.hands[seat], card);
  w.discard.push(card);
  w.lastCards[seat] = card;
  w.last = { seat, cell, type: isOneEyed(card) ? 'removed' : 'played' };

  if (w.sequences.filter((s) => s.team === team).length >= state.target) { // pas de pioche après le coup gagnant
    w.phase = 'over';
    w.winner = team;
    events.push({ type: 'over', winner: team });
    return { ok: true, state: w, events };
  }
  draw(w, seat, events);
  w.current = (seat + 1) % state.seatCount;
  w.deadUsed = false;
  w.passes = 0;
  return { ok: true, state: w, events };
}

/** Vue d'un siège : sa main seulement ; pour les autres, le nombre de cartes. Ni pioche, ni graine. */
export function viewFor(state, seat) {
  return {
    you: seat,
    seatCount: state.seatCount,
    names: state.names.slice(),
    teams: state.teams,
    team: teamOf(seat, state.teams),
    target: state.target,
    board: state.board.map((c) => ({ ...c })),
    sequences: state.sequences.map((s) => ({ team: s.team, cells: s.cells.slice() })),
    hand: state.hands[seat].slice(),
    handCounts: state.hands.map((h) => h.length),
    deckSize: state.deck.length,
    discardSize: state.discard.length,
    lastCards: state.lastCards.slice(),
    last: state.last ? { ...state.last } : null,
    current: state.current,
    deadUsed: state.deadUsed,
    passes: state.passes,
    phase: state.phase,
    winner: state.winner,
  };
}

/** La carte piochée n'est visible que de celui qui la pioche. */
export const redactEvents = (events, seat) => events.map((e) => (e.type === 'drew' && e.seat !== seat ? { ...e, card: null } : e));

/** Validation stricte de forme d'une action reçue du réseau ; reconstruit l'objet. */
export function parseAction(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.type === 'pass') return { type: 'pass' };
  if (typeof raw.card !== 'string' || !CARD_RE.test(raw.card)) return null;
  if (raw.type === 'dead') return { type: 'dead', card: raw.card };
  if (raw.type === 'play' && Number.isInteger(raw.cell) && raw.cell >= 0 && raw.cell <= 99) return { type: 'play', card: raw.card, cell: raw.cell };
  return null;
}

export const engine = { STATE_VERSION, createGame, applyAction, viewFor, currentSeat, isOver, redactEvents };
