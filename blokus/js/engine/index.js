// Moteur Blokus (DESIGN.md §9) : pur, déterministe, état JSON. Les joueurs sont les sièges du socle (2 à 4) ;
// les 4 couleurs sont internes et jouées dans l'ordre bleu, jaune, rouge, vert.
import { next, seedState } from '../../common/engine/rng.js';
import { CELLS, COLORS, MONOMINO, ORIENTATIONS, PIECES } from './pieces.js';
import { isFirstMove, legalMoves, placementCells, placementError } from './moves.js';

export const STATE_VERSION = 1;
const SHARED = 3;

/** Joueur (avant rotation H-BLK-3) qui contrôle la couleur : 4 joueurs 1:1, 2 joueurs {0,2}→0 et {1,3}→1, 3 joueurs H-BLK-4. */
export function controllerOf(color, seatCount, sharedTurns = 0) {
  if (seatCount === 4) return color;
  if (seatCount === 2) return color % 2;
  return color < SHARED ? color : sharedTurns % 3;
}

/** Siège qui contrôle la couleur, rotation tirée au sort (H-BLK-3) comprise. */
export const seatOfColor = (state, color) => (controllerOf(color, state.seatCount, state.sharedTurns) + state.offset) % state.seatCount;

/** Couleurs possédées par un siège (la couleur partagée à 3 joueurs n'appartient à personne). */
export const colorsOf = (state, seat) => COLORS.map((_, c) => c)
  .filter((c) => !(state.seatCount === 3 && c === SHARED) && (controllerOf(c, state.seatCount, 0) + state.offset) % state.seatCount === seat);

export function createGame({ seed, names, seatCount }) {
  if (![2, 3, 4].includes(seatCount)) throw new Error(`Blokus : ${seatCount} joueurs non pris en charge`);
  const offset = Math.floor(next(seedState(seed)).value * seatCount);
  return {
    v: STATE_VERSION,
    seatCount,
    names: names.slice(0, seatCount),
    offset,
    board: Array(CELLS).fill(-1),
    remaining: COLORS.map(() => PIECES.map((p) => p.id)),
    out: [false, false, false, false],
    lastPiece: [null, null, null, null],
    turnColor: 0,
    sharedTurns: 0,
    ply: 0,
    phase: 'play',
    scores: null,
  };
}

const squaresLeft = (state, color) => state.remaining[color].reduce((n, p) => n + PIECES[p].size, 0);

/** Score « advanced » d'une couleur : −1 par carré restant, +15 si tout est posé, +5 de plus si le monomino est posé en dernier. */
export function colorScore(state, color) {
  if (state.remaining[color].length > 0) return -squaresLeft(state, color);
  return 15 + (state.lastPiece[color] === MONOMINO ? 5 : 0);
}

function computeScores(state) {
  const colors = COLORS.map((_, c) => colorScore(state, c));
  const seats = Array.from({ length: state.seatCount }, (_, s) => colorsOf(state, s).reduce((n, c) => n + colors[c], 0));
  return { colors, seats };
}

const winnersOf = (seats) => { const best = Math.max(...seats); return seats.flatMap((s, i) => (s === best ? [i] : [])); };

const isInt = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;

export function applyAction(state, seat, action) {
  if (state.phase === 'over') return { ok: false, error: 'over' };
  const color = state.turnColor;
  if (seat !== seatOfColor(state, color)) return { ok: false, error: 'not-your-turn' };
  if (!action || action.type !== 'place' || !isInt(action.piece, 0, PIECES.length - 1) || !isInt(action.orient, 0, ORIENTATIONS[action.piece].length - 1)
    || !Number.isInteger(action.x) || !Number.isInteger(action.y)) return { ok: false, error: 'bad-action' };
  const { piece, orient, x, y } = action;
  if (!state.remaining[color].includes(piece)) return { ok: false, error: 'piece-used' };
  const cells = placementCells(piece, orient, x, y);
  if (!cells) return { ok: false, error: 'out-of-board' };
  const err = placementError(state.board, color, isFirstMove(state.remaining, color), cells);
  if (err) return { ok: false, error: err };

  const s = {
    ...state,
    board: state.board.slice(),
    remaining: state.remaining.map((r, c) => (c === color ? r.filter((p) => p !== piece) : r)),
    out: state.out.slice(),
    lastPiece: state.lastPiece.slice(),
    ply: state.ply + 1,
  };
  for (const c of cells) s.board[c] = color;
  s.lastPiece[color] = piece;
  const events = [{ type: 'placed', color, seat, piece, orient, x, y, cells }];
  if (state.seatCount === 3 && color === SHARED) s.sharedTurns = state.sharedTurns + 1;

  // H-BLK-2 : passage automatique et définitif ; k = 4 revient à la couleur qui vient de jouer.
  let found = false;
  for (let k = 1; k <= 4 && !found; k++) {
    const c = (color + k) % 4;
    if (s.out[c]) continue;
    if (legalMoves(s, c, { limit: 1 }).length > 0) { s.turnColor = c; found = true; } else { s.out[c] = true; events.push({ type: 'out', color: c }); }
  }
  if (!found) {
    s.phase = 'over';
    s.scores = computeScores(s);
    events.push({ type: 'over', scores: s.scores });
  }
  return { ok: true, state: s, events };
}

export function viewFor(state, seat) {
  const over = state.phase === 'over';
  const scores = state.scores ?? computeScores(state);
  return {
    ...state,
    you: seat,
    current: over ? null : seatOfColor(state, state.turnColor),
    colorSeats: COLORS.map((_, c) => seatOfColor(state, c)),
    colorScores: scores.colors,
    seatScores: scores.seats,
    winners: over ? winnersOf(scores.seats) : null,
  };
}

export const currentSeat = (state) => (state.phase === 'over' ? null : seatOfColor(state, state.turnColor));
export const isOver = (state) => state.phase === 'over';

export const engine = { STATE_VERSION, createGame, applyAction, viewFor, currentSeat, isOver };

/** Validation stricte de forme (le moteur revérifie la légalité). */
export const parseAction = (raw) => (raw && typeof raw === 'object' && raw.type === 'place' && isInt(raw.piece, 0, PIECES.length - 1)
  && isInt(raw.orient, 0, ORIENTATIONS[raw.piece].length - 1) && isInt(raw.x, 0, 19) && isInt(raw.y, 0, 19)
  ? { type: 'place', piece: raw.piece, orient: raw.orient, x: raw.x, y: raw.y } : null);

export { legalMoves } from './moves.js';
