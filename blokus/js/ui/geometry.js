// Géométrie et sélection de l'écran Partie : fonctions pures (aucun DOM), testées sans navigateur.
// Une sélection est { piece, orient, x, y } (x, y : coin haut-gauche de la boîte englobante, comme l'action `place`).
import { ORIENTATIONS, SIZE } from '../engine/pieces.js';
import { candidateCorners, isFirstMove, placementCells, placementError } from '../engine/moves.js';

const normalize = (cells) => {
  const mx = Math.min(...cells.map((c) => c[0]));
  const my = Math.min(...cells.map((c) => c[1]));
  return cells.map(([x, y]) => [x - mx, y - my]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
};
const key = (cells) => cells.map((c) => c.join(',')).join(';');

/** Dimensions de la boîte englobante d'une orientation. */
export const bbox = (cells) => ({ w: Math.max(...cells.map((c) => c[0])) + 1, h: Math.max(...cells.map((c) => c[1])) + 1 });

/** Index de l'orientation obtenue en appliquant `fn` aux cases de l'orientation `orient`. */
function reorient(piece, orient, fn) {
  const k = key(normalize(ORIENTATIONS[piece][orient].map(fn)));
  return ORIENTATIONS[piece].findIndex((o) => key(o) === k);
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Ramène l'origine pour que toute la pièce tienne dans le plateau. */
function bounded(sel) {
  const { w, h } = bbox(ORIENTATIONS[sel.piece][sel.orient]);
  return { ...sel, x: clamp(sel.x, 0, SIZE - w), y: clamp(sel.y, 0, SIZE - h) };
}

/** Origine qui centre la pièce sur la case (cx, cy), bornée au plateau. */
export function moveTo(sel, cx, cy) {
  const { w, h } = bbox(ORIENTATIONS[sel.piece][sel.orient]);
  return bounded({ ...sel, x: cx - Math.floor(w / 2), y: cy - Math.floor(h / 2) });
}

export const moveBy = (sel, dx, dy) => bounded({ ...sel, x: sel.x + dx, y: sel.y + dy });

function turned(sel, fn) {
  const before = bbox(ORIENTATIONS[sel.piece][sel.orient]);
  const orient = reorient(sel.piece, sel.orient, fn);
  const after = bbox(ORIENTATIONS[sel.piece][orient]);
  // le centre de la pièce reste en place
  return bounded({ ...sel, orient, x: sel.x + Math.floor(before.w / 2) - Math.floor(after.w / 2), y: sel.y + Math.floor(before.h / 2) - Math.floor(after.h / 2) });
}

/** Rotation de 90° (↻). */
export const rotate = (sel) => turned(sel, ([x, y]) => [-y, x]);
/** Miroir horizontal (⇋). */
export const mirror = (sel) => turned(sel, ([x, y]) => [-x, y]);

/** Sélectionne une pièce : fantôme centré sur le premier coin candidat de la couleur au trait (ou au centre). */
export function select(view, piece) {
  const first = isFirstMove(view.remaining, view.turnColor);
  const [anchor] = candidateCorners(view.board, view.turnColor, first);
  const at = anchor ?? Math.floor(SIZE * SIZE / 2 + SIZE / 2);
  return moveTo({ piece, orient: 0, x: 0, y: 0 }, at % SIZE, Math.floor(at / SIZE));
}

/** Fantôme de la sélection : cases, légalité et action prête à envoyer. */
export function ghostOf(view, sel) {
  const cells = placementCells(sel.piece, sel.orient, sel.x, sel.y);
  const first = isFirstMove(view.remaining, view.turnColor);
  const error = cells ? placementError(view.board, view.turnColor, first, cells) : 'out-of-board';
  return { ...sel, cells, error, legal: error === null, action: { type: 'place', piece: sel.piece, orient: sel.orient, x: sel.x, y: sel.y } };
}

/** Case (0..19) sous un point écran, à partir du rectangle du plateau (valable sous un `transform: scale`). */
export function cellAt(rect, clientX, clientY) {
  return {
    x: clamp(Math.floor(((clientX - rect.left) / rect.width) * SIZE), 0, SIZE - 1),
    y: clamp(Math.floor(((clientY - rect.top) / rect.height) * SIZE), 0, SIZE - 1),
  };
}
