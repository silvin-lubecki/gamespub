// Rendu du plateau (LU-09, DESIGN.md §10.3-10.4, §5.2).
// Hypothèses utilisées : H1 (motifs et disposition originaux), H2 (cases noircies sur le motif coop), H19 (coop : troncs),
// H3 (28 emplacements de bord T/B/L/R 0..6), H23 (rotation du plateau : motifs affichés pivotés). Module pur à l'import : aucun accès à `document` hors de renderBoard.
import { CELLS, EDGE_SLOTS, colOf, rowOf } from '../engine/constants.js';
import { LAYOUT, MOTIFS, layoutAt } from '../engine/layout.js';

/** Taille de la grille d'affichage : 7×7 cases + 1 rangée/colonne de pions de chaque côté (coins vides). */
export const GRID = 9;

const SVG_NS = 'http://www.w3.org/2000/svg';
const DEFAULT_SPRITE = './img/motifs.svg';
const SLOT_RE = /^([TBLR])([0-6])$/;

/** Position (indices 0..8, base 0) d'une case 0..48 dans la grille 9×9. */
export function cellPosition(cell) {
  if (!Number.isInteger(cell) || cell < 0 || cell >= CELLS) throw new RangeError(`cellPosition: case invalide « ${cell} »`);
  return { row: rowOf(cell) + 1, col: colOf(cell) + 1 };
}

/** Position (indices 0..8, base 0) d'un emplacement de bord : `T0` au-dessus de la colonne 0, `L3` à gauche de la rangée 3… */
export function slotPosition(slotId) {
  const m = SLOT_RE.exec(slotId);
  if (!m) throw new RangeError(`slotPosition: emplacement invalide « ${slotId} »`);
  const i = Number(m[2]) + 1;
  switch (m[1]) {
    case 'T': return { row: 0, col: i };
    case 'B': return { row: GRID - 1, col: i };
    case 'L': return { row: i, col: 0 };
    default: return { row: i, col: GRID - 1 };
  }
}

/** Joueur 0 = pion vert (hôte) ; joueur 1 ou équipe (coop) = pion marron (§10.4). */
export function pawnColor(owner) {
  return owner === 0 ? 'green' : 'brown';
}

function highlightClass(highlight, key, id) {
  const list = highlight[key];
  if (!list || !list.includes(id)) return null;
  if (highlight.valid === true) return 'valid';
  if (highlight.valid === false) return 'invalid';
  return 'on';
}

/**
 * Modèle d'affichage pur (sans DOM) : 49 cases puis 28 emplacements.
 * `viewOrState` : { board, locked, mottes, edges } (état ou vue) ; options :
 *  - pending : [{ cell, letter, joker? }] poses provisoires (joker sans lettre → « ? ») ;
 *  - highlight : { cells?, slots?, valid? } ;
 *  - selectable : tableau ou Set de cases.
 */
export function boardModel(viewOrState, { pending = [], highlight = {}, selectable = [] } = {}) {
  const { board, locked = [], mottes = [], edges = {}, mode = 'versus', rotation = 0 } = viewOrState;
  const pendingByCell = new Map(pending.map((p) => [p.cell, p]));
  const selectableSet = new Set(selectable);
  const motteSet = new Set(mottes);

  const cells = LAYOUT.map((_, cell) => {
    const code = layoutAt(cell, rotation);
    const stack = board[cell] ?? [];
    const top = stack.length ? stack[stack.length - 1] : null;
    const p = pendingByCell.get(cell);
    return {
      kind: 'cell',
      cell,
      ...cellPosition(cell),
      motif: code,
      color: MOTIFS[code].color,
      name: MOTIFS[code].name,
      height: stack.length,
      top: top ? { l: top.l, j: Boolean(top.j) } : null,
      locked: Boolean(locked[cell]),
      motte: motteSet.has(cell),
      pending: p ? { letter: p.letter ?? '?', joker: Boolean(p.joker) } : null,
      selectable: selectableSet.has(cell),
      highlight: highlightClass(highlight, 'cells', cell),
    };
  });

  const slots = EDGE_SLOTS.map((slot) => {
    const e = edges[slot];
    return {
      kind: 'slot',
      slot,
      ...slotPosition(slot),
      owner: e ? e.owner : null,
      pawn: e ? pawnColor(e.owner) : null,
      trunk: Boolean(e) && mode === 'coop',
      permanent: Boolean(e?.permanent),
      tree: Boolean(e?.tree),
      highlight: highlightClass(highlight, 'slots', slot),
    };
  });

  return [...cells, ...slots];
}

export function svgUse(spriteHref, id, className) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `${spriteHref}#${id}`);
  svg.append(use);
  return svg;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function cellLabel(c) {
  const parts = [`Rangée ${c.row}, colonne ${c.col}`, c.name];
  if (c.motte) parts.push('case noircie');
  if (c.locked) parts.push('verrouillée');
  if (c.selectable) parts.push('sélectionnable');
  if (c.pending) parts.push(`pose provisoire ${c.pending.letter}`);
  else if (c.top) parts.push(`lettre ${c.top.l}${c.height > 1 ? `, pile de ${c.height}` : ''}`);
  return parts.join(', ');
}

function renderCell(c, spriteHref) {
  const node = el('div', 'cell');
  node.dataset.cell = String(c.cell);
  node.style.setProperty('--motif', c.color);
  node.style.gridRow = String(c.row + 1);
  node.style.gridColumn = String(c.col + 1);
  node.setAttribute('role', 'img');
  node.setAttribute('aria-label', cellLabel(c));
  const motifId = c.motif === '*' ? 'motif-sun' : `motif-${c.motif}`;
  if (!c.motte) node.append(svgUse(spriteHref, motifId, 'motif'));
  if (c.locked) node.classList.add('is-locked');
  if (c.selectable) node.classList.add('is-selectable');
  if (c.highlight) node.classList.add(`is-${c.highlight === 'on' ? 'highlight' : c.highlight}`);
  if (c.motte) {
    node.classList.add('has-motte');
    node.append(svgUse(spriteHref, 'motte', 'motte'));
  }
  if (c.top) {
    const tile = el('span', 'tile', c.top.l);
    if (c.top.j) {
      node.classList.add('has-joker');
      tile.append(el('span', 'joker-mark', '★'));
    }
    node.append(tile);
  }
  if (c.height >= 2) node.append(el('span', 'stack-badge', String(c.height)));
  if (c.pending) {
    node.classList.add('has-pending');
    const tile = el('span', 'tile is-pending', c.pending.letter);
    if (c.pending.joker) tile.append(el('span', 'joker-mark', '★'));
    node.append(tile);
  }
  return node;
}

function renderSlot(s, spriteHref) {
  const node = el('div', 'slot');
  node.dataset.slot = s.slot;
  node.style.gridRow = String(s.row + 1);
  node.style.gridColumn = String(s.col + 1);
  if (s.highlight) node.classList.add(`is-${s.highlight === 'on' ? 'highlight' : s.highlight}`);
  if (s.pawn) {
    node.classList.add(`pawn-${s.pawn}`);
    if (s.permanent) node.classList.add('is-permanent');
    if (s.trunk) node.classList.add('is-tronc');
    node.append(svgUse(spriteHref, s.trunk ? 'tronc' : 'pawn', s.trunk ? 'tronc' : 'pawn'));
    if (s.tree) node.append(svgUse(spriteHref, 'tree', 'tree'));
    node.setAttribute('role', 'img');
    const what = s.trunk ? 'tronc' : `pion ${s.pawn === 'green' ? 'vert' : 'marron'}`;
    node.setAttribute('aria-label', `Emplacement ${s.slot}, ${what}${s.tree ? ', arbre' : ''}`);
  } else {
    node.classList.add('is-empty');
    node.setAttribute('role', 'img');
    node.setAttribute('aria-label', `Emplacement ${s.slot}, libre`);
  }
  return node;
}

/**
 * Rend le plateau dans `container` (remplace son contenu : ré-rendu idempotent). Renvoie l'élément `.board`.
 * `spriteHref` : chemin relatif du sprite (par défaut `./img/motifs.svg`, relatif à index.html).
 */
export function renderBoard(container, viewOrState, { pending, highlight, selectable, spriteHref = DEFAULT_SPRITE } = {}) {
  const board = el('div', 'board');
  board.style.setProperty('--rotation', `${(viewOrState.rotation ?? 0) * 90}deg`);
  for (const item of boardModel(viewOrState, { pending, highlight, selectable })) {
    board.append(item.kind === 'cell' ? renderCell(item, spriteHref) : renderSlot(item, spriteHref));
  }
  container.replaceChildren(board);
  return board;
}
