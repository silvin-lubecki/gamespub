// IA Blokus (DESIGN.md §9.3) : pure et déterministe (le hasard vient de l'argument `rng`).
//  - Facile : coup légal au hasard, pondéré par taille² (biais vers les grandes pièces, voir DESIGN.md « Écarts »).
//  - Normale : glouton à 1 coup sur un échantillon déterministe de MAX_NODES coups au plus (garde de budget).
import { CELLS, ORIENTATIONS, PIECES, SIZE } from '../engine/pieces.js';
import { candidateCorners, isFirstMove, legalMoves } from '../engine/moves.js';
import { seatOfColor } from '../engine/index.js';

export const MAX_NODES = 3000;
export const WEIGHTS = { size: 4, corners: 1.5, blocked: 2, center: 1, centerMoves: 6 };

const EDGES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAGS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Échantillon déterministe (pas régulier, sans rng) d'au plus `max` coups, ordre conservé. */
export function sampleMoves(moves, max = MAX_NODES) {
  const n = moves.length;
  if (n <= max) return moves;
  return Array.from({ length: max }, (_, i) => moves[Math.floor((i * n) / max)]);
}

const sizeOf = (m) => PIECES[m.piece].size;
const cellsOf = (m) => ORIENTATIONS[m.piece][m.orient].map(([cx, cy]) => (m.y + cy) * SIZE + m.x + cx);

/** Facile : tirage pondéré par taille² parmi tous les coups légaux. */
export function chooseEasy(state, color, rng) {
  const moves = legalMoves(state, color);
  if (moves.length === 0) return null;
  const weights = moves.map((m) => sizeOf(m) ** 2);
  let r = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < moves.length; i++) { r -= weights[i]; if (r < 0) return moves[i]; }
  return moves[moves.length - 1];
}

/** Couleurs adverses : celles des autres joueurs (la couleur partagée à 3 joueurs est ignorée). */
function opponentColors(state, color) {
  const mine = seatOfColor(state, color);
  return [0, 1, 2, 3].filter((c) => c !== color && !(state.seatCount === 3 && c === 3) && seatOfColor(state, c) !== mine);
}

/** Normale : 4 × taille + 1,5 × nouveaux coins propres − 2 × coins adverses recouverts + progression vers le centre (6 premiers coups). */
export function chooseNormal(state, color, rng) {
  const moves = sampleMoves(legalMoves(state, color));
  if (moves.length === 0) return null;
  const { board } = state;
  const own = new Uint8Array(CELLS);
  for (const c of candidateCorners(board, color, isFirstMove(state.remaining, color))) own[c] = 1;
  const opp = new Uint8Array(CELLS);
  for (const o of opponentColors(state, color)) for (const c of candidateCorners(board, o, isFirstMove(state.remaining, o))) opp[c]++;
  const opening = 21 - state.remaining[color].length < WEIGHTS.centerMoves;

  let best = -Infinity;
  let ties = [];
  for (const m of moves) {
    const cells = cellsOf(m);
    const set = new Set(cells);
    let score = WEIGHTS.size * cells.length;
    let blocked = 0;
    let dist = Infinity;
    const fresh = new Set();
    for (const c of cells) {
      blocked += opp[c];
      const x = c % SIZE;
      const y = Math.floor(c / SIZE);
      dist = Math.min(dist, Math.abs(x - 9.5) + Math.abs(y - 9.5));
      for (const [dx, dy] of DIAGS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
        const n = ny * SIZE + nx;
        if (own[n] || board[n] !== -1 || set.has(n) || fresh.has(n)) continue;
        // pas de contact de côté avec la couleur, pièce posée comprise
        if (EDGES.every(([ex, ey]) => {
          const mx = nx + ex;
          const my = ny + ey;
          if (mx < 0 || my < 0 || mx >= SIZE || my >= SIZE) return true;
          const q = my * SIZE + mx;
          return board[q] !== color && !set.has(q);
        })) fresh.add(n);
      }
    }
    score += WEIGHTS.corners * fresh.size - WEIGHTS.blocked * blocked;
    if (opening) score += WEIGHTS.center * (19 - dist);
    if (score > best) { best = score; ties = [m]; } else if (score === best) ties.push(m);
  }
  return ties[Math.floor(rng() * ties.length)];
}

export const bots = {
  /** Normale, sauf pour la couleur partagée à 3 joueurs (jouée en Facile). */
  chooseAction(state, seat, level, rng) {
    const color = state.turnColor;
    const shared = state.seatCount === 3 && color === 3;
    return level === 'normal' && !shared ? chooseNormal(state, color, rng) : chooseEasy(state, color, rng);
  },
  /** Repli : premier coup légal (le passage automatique garantit qu'il existe). */
  fallback: (state) => legalMoves(state, state.turnColor, { limit: 1 })[0],
};
