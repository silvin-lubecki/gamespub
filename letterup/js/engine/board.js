// Accès au plateau (DESIGN.md §5.1, §6.3). Fonctions pures.
// Une case = une pile de tuiles `{ l, j }` (du bas vers le haut) ; le plateau = 49 piles.
// Les mottes ont toujours une pile vide (aucune lettre ne peut y être posée) : « une motte ou une case
// vide interrompt la séquence » se réduit donc à `isEmpty`.
import { SIZE, CELLS, cellOf, rowOf, colOf } from './constants.js';

export const height = (board, cell) => board[cell].length;
export const isEmpty = (board, cell) => board[cell].length === 0;
export const top = (board, cell) => board[cell][board[cell].length - 1] ?? null;
export const isBoardEmpty = (board) => board.every((pile) => pile.length === 0);

export function neighbors(cell) {
  const r = rowOf(cell), c = colOf(cell);
  const out = [];
  if (r > 0) out.push(cellOf(r - 1, c));
  if (c > 0) out.push(cellOf(r, c - 1));
  if (c < SIZE - 1) out.push(cellOf(r, c + 1));
  if (r < SIZE - 1) out.push(cellOf(r + 1, c));
  return out;
}

// Les 7 cases de la rangée (dir 'H') ou de la colonne (dir 'V') numéro `index`.
export function lineCells(index, dir) {
  return Array.from({ length: SIZE }, (_, i) => (dir === 'H' ? cellOf(index, i) : cellOf(i, index)));
}

// Séquence maximale de cases occupées contiguës contenant `cell`, dans le sens de lecture ; [] si vide.
export function sequenceAt(board, cell, dir) {
  if (cell < 0 || cell >= CELLS || isEmpty(board, cell)) return [];
  const line = dir === 'H' ? lineCells(rowOf(cell), 'H') : lineCells(colOf(cell), 'V');
  let i = line.indexOf(cell), a = i, b = i;
  while (a > 0 && !isEmpty(board, line[a - 1])) a--;
  while (b < SIZE - 1 && !isEmpty(board, line[b + 1])) b++;
  return line.slice(a, b + 1);
}
