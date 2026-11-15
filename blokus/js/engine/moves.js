// Géométrie des coups de Blokus (DESIGN.md §9.2) : fonctionne sur un état ou sur une vue (board + remaining).
import { CELLS, CORNERS, ORIENTATIONS, SIZE } from './pieces.js';

const EDGES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAGS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Index de la case voisine (dx, dy) de `i`, ou -1 hors plateau. */
const at = (i, dx, dy) => {
  const x = (i % SIZE) + dx;
  const y = Math.floor(i / SIZE) + dy;
  return x < 0 || y < 0 || x >= SIZE || y >= SIZE ? -1 : y * SIZE + x;
};

/** Cases (index) d'une orientation dont la case d'origine est (x, y) ; `null` si une case sort du plateau. */
export function placementCells(piece, orient, x, y) {
  const out = [];
  for (const [cx, cy] of ORIENTATIONS[piece][orient]) {
    const px = x + cx;
    const py = y + cy;
    if (px < 0 || py < 0 || px >= SIZE || py >= SIZE) return null;
    out.push(py * SIZE + px);
  }
  return out;
}

/** Première pose d'une couleur : aucune de ses 21 pièces n'est encore posée. */
export const isFirstMove = (remaining, color) => remaining[color].length === 21;

/**
 * Code d'erreur d'une pose (cases déjà dans le plateau) ou `null` si elle est légale.
 * Ordre : overlap, first-corner, edge-contact, no-corner-contact. Aucune restriction entre couleurs différentes.
 */
export function placementError(board, color, first, cells) {
  for (const c of cells) if (board[c] !== -1) return 'overlap';
  if (first) return cells.includes(CORNERS[color]) ? null : 'first-corner';
  let corner = false;
  for (const c of cells) {
    for (const [dx, dy] of EDGES) {
      const n = at(c, dx, dy);
      if (n !== -1 && board[n] === color) return 'edge-contact';
    }
    if (!corner) {
      for (const [dx, dy] of DIAGS) {
        const n = at(c, dx, dy);
        if (n !== -1 && board[n] === color) { corner = true; break; }
      }
    }
  }
  return corner ? null : 'no-corner-contact';
}

/** Coins candidats triés : cases libres en diagonale d'une case de la couleur, sans contact de côté avec elle. */
export function candidateCorners(board, color, first) {
  if (first) return board[CORNERS[color]] === -1 ? [CORNERS[color]] : [];
  const seen = new Uint8Array(CELLS);
  const out = [];
  for (let i = 0; i < CELLS; i++) {
    if (board[i] !== color) continue;
    for (const [dx, dy] of DIAGS) {
      const n = at(i, dx, dy);
      if (n === -1 || seen[n] || board[n] !== -1) continue;
      seen[n] = 1;
      if (EDGES.every(([ex, ey]) => { const m = at(n, ex, ey); return m === -1 || board[m] !== color; })) out.push(n);
    }
  }
  return out.sort((a, b) => a - b);
}

/**
 * Coups légaux d'une couleur, dédoublonnés, dans un ordre déterministe (coin candidat, pièce, orientation, case).
 * `limit` arrête l'énumération (les consommateurs qui ont besoin d'un seul coup, ou d'un échantillon).
 */
export function legalMoves(s, color, { limit = Infinity } = {}) {
  const moves = [];
  const first = isFirstMove(s.remaining, color);
  const seen = new Uint8Array(21 * 8 * CELLS); // dédoublonnage : (pièce, orientation, origine)
  for (const anchor of candidateCorners(s.board, color, first)) {
    const ax = anchor % SIZE;
    const ay = Math.floor(anchor / SIZE);
    for (const piece of s.remaining[color]) {
      const orients = ORIENTATIONS[piece];
      for (let orient = 0; orient < orients.length; orient++) {
        for (const [cx, cy] of orients[orient]) {
          const x = ax - cx;
          const y = ay - cy;
          if (x < 0 || y < 0) continue;
          if (x >= SIZE || y >= SIZE) continue;
          const key = (piece * 8 + orient) * CELLS + y * SIZE + x;
          if (seen[key]) continue;
          seen[key] = 1;
          const cells = placementCells(piece, orient, x, y);
          if (!cells || placementError(s.board, color, first, cells) !== null) continue;
          moves.push({ type: 'place', piece, orient, x, y });
          if (moves.length >= limit) return moves;
        }
      }
    }
  }
  return moves;
}
