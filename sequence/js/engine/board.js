// Plateau de Séquence : 10×10 = 4 coins libres + 96 cases (les 48 cartes hors valets, deux fois chacune).
// H-SEQ-1 : disposition originale (pas celle du plateau édité). Chaque carte figure deux fois ; les exemplaires sont
// symétriques par rapport au centre (case i ↔ case 99 − i), sauf au centre où quatre cases voisines ne peuvent pas porter
// des cartes jumelles : AS↔7C et 2S↔8C y sont échangées (voir docs/DESIGN.md). Aucun doublon n'est voisin (8-voisinage).
// prettier-ignore
export const BOARD = Object.freeze([
  null, 'AS', '2S', '3S', '4S', '5S', '6S', '7S', '8S', null,
  '9S', 'TS', 'QS', 'KS', 'AH', '2H', '3H', '4H', '5H', '6H',
  '7H', '8H', '9H', 'TH', 'QH', 'KH', 'AD', '2D', '3D', '4D',
  '5D', '6D', '7D', '8D', '9D', 'TD', 'QD', 'KD', 'AC', '2C',
  '3C', '4C', '5C', '6C', '7C', '8C', '9C', 'TC', 'QC', 'KC',
  'KC', 'QC', 'TC', '9C', '2S', 'AS', '6C', '5C', '4C', '3C',
  '2C', 'AC', 'KD', 'QD', 'TD', '9D', '8D', '7D', '6D', '5D',
  '4D', '3D', '2D', 'AD', 'KH', 'QH', 'TH', '9H', '8H', '7H',
  '6H', '5H', '4H', '3H', '2H', 'AH', 'KS', 'QS', 'TS', '9S',
  null, '8S', '7S', '6S', '5S', '4S', '3S', '8C', '7C', null,
]);

export const SIZE = 10;
export const CORNERS = Object.freeze([0, 9, 90, 99]);
export const isCorner = (i) => i === 0 || i === 9 || i === 90 || i === 99;

/** carte → [case, case] (ordre croissant). */
export const CELLS_OF = (() => {
  const m = {};
  BOARD.forEach((c, i) => { if (c) (m[c] ??= []).push(i); });
  return Object.freeze(m);
})();

/** Directions d'alignement : ligne, colonne, diagonale, anti-diagonale. */
export const DIRS = Object.freeze([[0, 1], [1, 0], [1, 1], [1, -1]]);

const inside = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

/** Les 192 fenêtres de 5 cases alignées. */
export const WINDOWS = (() => {
  const out = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      for (const [dr, dc] of DIRS) {
        if (!inside(r + 4 * dr, c + 4 * dc)) continue;
        out.push(Object.freeze([0, 1, 2, 3, 4].map((k) => (r + k * dr) * SIZE + c + k * dc)));
      }
    }
  }
  return Object.freeze(out);
})();

/** case → indices (dans WINDOWS) des fenêtres qui la contiennent. */
export const WINDOWS_BY_CELL = (() => {
  const m = Array.from({ length: SIZE * SIZE }, () => []);
  WINDOWS.forEach((w, k) => { for (const i of w) m[i].push(k); });
  return Object.freeze(m);
})();

export function neighbours8(i) {
  const r = Math.floor(i / SIZE);
  const c = i % SIZE;
  const out = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if ((dr || dc) && inside(r + dr, c + dc)) out.push((r + dr) * SIZE + c + dc);
  return out;
}
