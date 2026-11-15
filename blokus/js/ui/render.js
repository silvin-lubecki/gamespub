// Rendus SVG/HTML de l'écran Partie : fonctions pures qui renvoient des chaînes (D7), sans DOM.
// Accessibilité : chaque couleur a sa teinte ET son motif (bleu uni, jaune points, rouge rayures, vert croisillons).
import { el, esc, svg } from '../../common/ui/svg.js';
import { CELLS, COLOR_LABELS, CORNERS, ORIENTATIONS, PIECES, SIZE } from '../engine/pieces.js';
import { candidateCorners, isFirstMove } from '../engine/moves.js';

/** fill : teinte ; stroke : contour de case (foncé) ; ink : encre du motif. */
export const PALETTE = Object.freeze([
  { fill: '#2c5aa0', stroke: '#16305a', ink: '#2c5aa0' },
  { fill: '#f2c230', stroke: '#6e5200', ink: '#6e5200' },
  { fill: '#d0342c', stroke: '#6d130e', ink: '#ffe3e0' },
  { fill: '#2e9b4e', stroke: '#124a25', ink: '#e1f8e8' },
]);
export const EMPTY_FILL = '#ffffff';
export const GHOST_OK = '#1e7a3c';
export const GHOST_KO = '#a4262c';

export const CELL = 25; // viewBox du plateau : 500×500, sans marge (pointeur → case direct)
export const BOARD = CELL * SIZE;

const motif = (c) => {
  const { fill, ink } = PALETTE[c];
  const bg = el('rect', { width: 8, height: 8, fill });
  const draw = [
    '',
    el('circle', { cx: 4, cy: 4, r: 1.6, fill: ink }),
    el('path', { d: 'M-1 1 L1 -1 M0 8 L8 0 M7 9 L9 7', stroke: ink, 'stroke-width': 1.6 }),
    el('path', { d: 'M0 4 H8 M4 0 V8', stroke: ink, 'stroke-width': 1.2 }),
  ][c];
  return el('pattern', { id: `blk-pat-${c}`, width: 8, height: 8, patternUnits: 'userSpaceOnUse' }, bg + draw);
};

/** Définitions des motifs : une seule copie par écran (les autres SVG s'y réfèrent par `url(#blk-pat-c)`). */
export const patternDefs = () => `<svg class="blk-defs" width="0" height="0" aria-hidden="true" focusable="false">${el('defs', {}, PALETTE.map((_, c) => motif(c)).join(''))}</svg>`;

const fillOf = (c) => `url(#blk-pat-${c})`;

const cellRect = (x, y, c, size, extra = {}) => el('rect', {
  x: x * size, y: y * size, width: size, height: size, fill: fillOf(c), stroke: PALETTE[c].stroke, 'stroke-width': size / 12, ...extra,
});

/** Plateau 20×20 : cases, coins de départ libres, coins candidats (option Aide), dernière pose. */
export function boardSvg(view, { help = false, lastCells = [] } = {}) {
  const cells = [];
  for (let i = 0; i < CELLS; i++) {
    const x = i % SIZE;
    const y = Math.floor(i / SIZE);
    const c = view.board[i];
    cells.push(c === -1
      ? el('rect', { x: x * CELL, y: y * CELL, width: CELL, height: CELL, fill: EMPTY_FILL, stroke: '#c9c2b4', 'stroke-width': 1, 'data-cell': i, 'data-color': -1 })
      : cellRect(x, y, c, CELL, { 'data-cell': i, 'data-color': c }));
  }
  const marks = [];
  CORNERS.forEach((i, c) => {
    if (view.board[i] !== -1) return;
    const x = (i % SIZE) * CELL;
    const y = Math.floor(i / SIZE) * CELL;
    marks.push(el('rect', { class: 'start-corner', 'data-color': c, x: x + 3, y: y + 3, width: CELL - 6, height: CELL - 6, fill: 'none', stroke: PALETTE[c].fill, 'stroke-width': 3 }));
    marks.push(el('circle', { cx: x + CELL / 2, cy: y + CELL / 2, r: 3, fill: PALETTE[c].fill }));
  });
  if (help && view.phase === 'play') {
    for (const i of candidateCorners(view.board, view.turnColor, isFirstMove(view.remaining, view.turnColor))) {
      marks.push(el('rect', {
        class: 'cand', x: (i % SIZE) * CELL + 2.5, y: Math.floor(i / SIZE) * CELL + 2.5, width: CELL - 5, height: CELL - 5,
        fill: 'none', stroke: PALETTE[view.turnColor].stroke, 'stroke-width': 2, 'stroke-dasharray': '4 3',
      }));
    }
  }
  for (const i of lastCells) marks.push(el('rect', { class: 'last', x: (i % SIZE) * CELL + 1, y: Math.floor(i / SIZE) * CELL + 1, width: CELL - 2, height: CELL - 2, fill: 'none', stroke: '#fff', 'stroke-width': 2 }));
  return svg({ w: BOARD, h: BOARD, class: 'blk-board', role: 'img', 'aria-label': 'Plateau de Blokus, 20 par 20' }, cells.join('') + marks.join(''));
}

/** Fantôme : même viewBox que le plateau, superposé, insensible au pointeur. */
export function ghostSvg(g, color) {
  if (!g.cells) return '';
  const body = g.cells.map((i) => cellRect(i % SIZE, Math.floor(i / SIZE), color, CELL, { 'fill-opacity': 0.65 })).join('');
  const lines = g.cells.map((i) => el('rect', {
    x: (i % SIZE) * CELL + 1, y: Math.floor(i / SIZE) * CELL + 1, width: CELL - 2, height: CELL - 2, fill: 'none',
    stroke: g.legal ? GHOST_OK : GHOST_KO, 'stroke-width': 3, 'stroke-dasharray': g.legal ? null : '5 3',
  })).join('');
  return svg({
    w: BOARD, h: BOARD, class: 'blk-ghost', 'aria-hidden': 'true', 'data-piece': g.piece, 'data-orient': g.orient, 'data-x': g.x, 'data-y': g.y,
    'data-legal': String(g.legal), 'data-error': g.error ?? '',
  }, body + lines);
}

/** Une pièce (orientation `orient`) dans sa boîte 5×5 : posée = contour gris. */
export function pieceSvg(piece, orient, color, { used = false, cell = 10 } = {}) {
  const cells = ORIENTATIONS[piece][orient];
  const w = Math.max(...cells.map((c) => c[0])) + 1;
  const h = Math.max(...cells.map((c) => c[1])) + 1;
  const ox = ((5 - w) * cell) / 2;
  const oy = ((5 - h) * cell) / 2;
  const body = cells.map(([x, y]) => (used
    ? el('rect', { x: ox + x * cell, y: oy + y * cell, width: cell, height: cell, fill: 'none', stroke: '#9aa3ab', 'stroke-width': 1 })
    : cellRect(0, 0, color, cell, { x: ox + x * cell, y: oy + y * cell }))).join('');
  return svg({ w: 5 * cell, h: 5 * cell, fluid: false, 'aria-hidden': 'true' }, body);
}

/** Réserve de la couleur au trait : 21 boutons, les pièces posées en contour gris et inactives. */
export function reserveHtml(view, color, selectedPiece, { interactive }) {
  const left = new Set(view.remaining[color]);
  return `<div class="blk-reserve" role="group" aria-label="Pièces ${COLOR_LABELS[color].toLowerCase()}">${PIECES.map((p) => {
    const used = !left.has(p.id);
    return `<button type="button" class="piece${used ? ' is-used' : ''}" data-piece="${p.id}" aria-pressed="${selectedPiece === p.id}"`
      + ` aria-label="Pièce ${esc(p.name)}, ${p.size} carré${p.size > 1 ? 's' : ''}${used ? ', posée' : ''}"${used || !interactive ? ' disabled' : ''}>`
      + `${pieceSvg(p.id, 0, color, { used })}</button>`;
  }).join('')}</div>`;
}

/** Réserve adverse en miniature : les pièces restantes, 3 px par carré. */
export const miniReserveHtml = (view, color) => `<span class="blk-mini" aria-label="${view.remaining[color].length} pièces restantes">${view.remaining[color]
  .map((p) => pieceSvg(p, 0, color, { cell: 3 })).join('')}</span>`;

const owner = (view, c) => {
  if (view.seatCount === 3 && c === 3) return 'partagée';
  return view.names[view.colorSeats[c]];
};

/** Texte d'état : « À vous : Bleu » ou « Au tour de Bilal (Jaune) ». */
export const statusText = (view) => {
  if (view.phase === 'over') return 'Partie terminée';
  const label = COLOR_LABELS[view.turnColor];
  return view.current === view.you ? `À vous : ${label}` : `Au tour de ${view.names[view.current]} (${label})`;
};

/** Bandeau : une ligne par couleur (pastille à motif, joueur, score en direct, réserve en miniature) et l'état. */
export function bannerHtml(view) {
  const rows = PALETTE.map((_, c) => {
    const turn = view.phase === 'play' && c === view.turnColor;
    return `<li class="blk-score${turn ? ' is-turn' : ''}${view.out[c] ? ' is-out' : ''}" data-color="${c}">`
      + `${svg({ w: 14, h: 14, fluid: false, 'aria-hidden': 'true' }, cellRect(0, 0, c, 14, { width: 14, height: 14 }))}`
      + `<span class="blk-who"><strong>${COLOR_LABELS[c]}</strong> ${esc(owner(view, c))}${view.out[c] ? ' · sortie' : ''}</span>`
      + `<span class="blk-pts">${view.colorScores[c]}</span>${miniReserveHtml(view, c)}</li>`;
  }).join('');
  return `<ul class="blk-banner" aria-label="Scores par couleur">${rows}</ul>`
    + `<p class="status" role="status">${esc(statusText(view))}</p>`;
}
