// Détection des séquences (§7.2, H-SEQ-6). Une séquence = 5 cases alignées occupées par l'équipe ; les coins comptent
// pour tout le monde. La détection ne regarde qu'autour de la case jouée, sur 4 directions, et choisit gloutonnement les
// fenêtres de 5 qui partagent au plus une case avec chaque séquence déjà acquise de l'équipe.
import { DIRS, SIZE, isCorner } from './board.js';

const inside = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

/**
 * Nouvelles séquences de `team` après un jeton posé en `cell` → [{ team, cells: [5 cases triées] }].
 * `board` : cases { chip }, `sequences` : séquences déjà acquises (toutes équipes).
 */
export function findNewSequences(board, sequences, team, cell) {
  const owned = (i) => isCorner(i) || board[i].chip === team;
  const known = sequences.filter((s) => s.team === team).map((s) => s.cells);
  const found = [];
  const r0 = Math.floor(cell / SIZE);
  const c0 = cell % SIZE;
  for (const [dr, dc] of DIRS) {
    // plus longue ligne de cases possédées passant par `cell`
    const run = [cell];
    for (let r = r0 - dr, c = c0 - dc; inside(r, c) && owned(r * SIZE + c); r -= dr, c -= dc) run.unshift(r * SIZE + c);
    const at = run.length - 1; // position de `cell` dans `run`
    for (let r = r0 + dr, c = c0 + dc; inside(r, c) && owned(r * SIZE + c); r += dr, c += dc) run.push(r * SIZE + c);
    for (let start = Math.max(0, at - 4); start <= at && start + 5 <= run.length; start++) {
      const cells = run.slice(start, start + 5).sort((a, b) => a - b);
      const ok = [...known, ...found.map((s) => s.cells)].every((other) => cells.filter((i) => other.includes(i)).length <= 1);
      if (ok) found.push({ team, cells });
    }
  }
  return found;
}
