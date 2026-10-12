// Constantes du moteur (DESIGN.md §5.1). Module pur (aucune source d’effet de bord).
export const SIZE = 7;
export const CELLS = 49;
export const CENTER = 24;
export const RACK_SIZE = 6;
export const MAX_STACK = 3;
export const JOKER = '*';

// Version de l'état de partie (H18) : v2 = coop à siège unique (H12′).
export const STATE_VERSION = 2;

// 60 tuiles au total (vérifié par test).
export const DISTRIBUTION = Object.freeze({
  A: 8, B: 1, C: 2, D: 1, E: 8, F: 1, G: 1, H: 1, I: 5, J: 1, K: 1, L: 2, M: 2,
  N: 2, O: 5, P: 2, Q: 1, R: 3, S: 2, T: 2, U: 3, V: 1, W: 1, X: 1, Y: 1, Z: 1,
  [JOKER]: 1,
});

// H4 : Y est une voyelle.
export const VOWELS = new Set(['A', 'E', 'I', 'O', 'U', 'Y']);

export const PAWNS = Object.freeze({ versus: 6, coopBrown: 8, coopTrees: 5 });

// H3 : 28 emplacements de bord (T = haut, B = bas, L = gauche, R = droite).
export const EDGE_SLOTS = [...'TBLR'].flatMap((side) =>
  [0, 1, 2, 3, 4, 5, 6].map((i) => side + i));

export const cellOf = (r, c) => r * SIZE + c;
export const rowOf = (cell) => Math.floor(cell / SIZE);
export const colOf = (cell) => cell % SIZE;

/** H23 : case `cell` après `quarterTurns` quarts de tour horaires (négatif = antihoraire) : (r, c) → (c, 6 − r) par quart. */
export function rotateCell(cell, quarterTurns) {
  let r = rowOf(cell), c = colOf(cell);
  for (let k = ((quarterTurns % 4) + 4) % 4; k > 0; k--) [r, c] = [c, SIZE - 1 - r];
  return cellOf(r, c);
}
