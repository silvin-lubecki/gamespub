// Blokus (DESIGN.md §9.1–9.2) : constantes du plateau, couleurs et pièces. Données pures, figées.
export const SIZE = 20;
export const CELLS = SIZE * SIZE;
// Ordre de jeu : bleu, jaune, rouge, vert.
export const COLORS = Object.freeze(['blue', 'yellow', 'red', 'green']);
export const COLOR_LABELS = Object.freeze(['Bleu', 'Jaune', 'Rouge', 'Vert']);
// H-BLK-1 : case de coin de départ de chaque couleur (index y*20+x), sens horaire.
export const CORNERS = Object.freeze([0, SIZE - 1, CELLS - 1, CELLS - SIZE]);
export const MONOMINO = 0;
export const TOTAL_SQUARES = 89;

const RAW = [
  ['I1', [[0, 0]]],
  ['I2', [[0, 0], [1, 0]]],
  ['I3', [[0, 0], [1, 0], [2, 0]]],
  ['V3', [[0, 0], [0, 1], [1, 1]]],
  ['I4', [[0, 0], [1, 0], [2, 0], [3, 0]]],
  ['O4', [[0, 0], [1, 0], [0, 1], [1, 1]]],
  ['T4', [[0, 0], [1, 0], [2, 0], [1, 1]]],
  ['L4', [[0, 0], [0, 1], [0, 2], [1, 2]]],
  ['Z4', [[0, 0], [1, 0], [1, 1], [2, 1]]],
  ['F', [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]]],
  ['I5', [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]],
  ['L5', [[0, 0], [0, 1], [0, 2], [0, 3], [1, 3]]],
  ['N5', [[0, 0], [1, 0], [1, 1], [2, 1], [3, 1]]],
  ['P5', [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]]],
  ['T5', [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]]],
  ['U5', [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1]]],
  ['V5', [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]]],
  ['W5', [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2]]],
  ['X', [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]]],
  ['Y', [[0, 0], [1, 0], [2, 0], [3, 0], [1, 1]]],
  ['Z5', [[0, 0], [1, 0], [1, 1], [1, 2], [2, 2]]],
];

const normalize = (cells) => {
  const mx = Math.min(...cells.map((c) => c[0]));
  const my = Math.min(...cells.map((c) => c[1]));
  return cells.map(([x, y]) => [x - mx, y - my]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
};

// Transformations uniques parmi les 8 (miroir × 4 rotations) ; l'orientation 0 est la pièce telle qu'écrite.
function orientationsOf(cells) {
  const seen = new Set();
  const out = [];
  let cur = cells;
  for (let mirror = 0; mirror < 2; mirror++) {
    for (let rot = 0; rot < 4; rot++) {
      const n = normalize(cur);
      const key = n.map((c) => c.join(',')).join(';');
      if (!seen.has(key)) { seen.add(key); out.push(n); }
      cur = cur.map(([x, y]) => [-y, x]);
    }
    cur = cells.map(([x, y]) => [-x, y]);
  }
  return out;
}

export const PIECES = Object.freeze(RAW.map(([name, cells], id) => Object.freeze({ id, name, size: cells.length, cells: normalize(cells) })));
export const ORIENTATIONS = Object.freeze(RAW.map(([, cells]) => Object.freeze(orientationsOf(cells).map((o) => Object.freeze(o)))));
