// Plateau 7×7 (DESIGN.md §10.3). H1 : disposition et motifs originaux ; H2 : 6 motifs coop (2 par niveau).
import { rotateCell } from './constants.js';
const ROWS = [
  'M N E S V E S',
  'V G M L N L C',
  'N F E S G V M',
  'V S G * F E N',
  'C L M C L M F',
  'G N V E S G E',
  'L F S C N M V',
];

/** 49 codes de motif (rangée par rangée) ; '*' = Soleil (case 24). */
export const LAYOUT = ROWS.flatMap((row) => row.split(' '));

// Les noms sont des textes d'interface (français).
export const MOTIFS = {
  F: { name: 'Fleur', color: '#e5739a', level: 'easy' },
  C: { name: 'Champignon', color: '#d9452b', level: 'easy' },
  L: { name: 'Feuille', color: '#6aa84f', level: 'medium' },
  G: { name: 'Goutte', color: '#4a90c2', level: 'medium' },
  E: { name: 'Étoile', color: '#f2c230', level: 'hard' },
  S: { name: 'Escargot', color: '#9b6bb5', level: 'hard' },
  V: { name: 'Vague', color: '#3fb5a8' },
  M: { name: 'Montagne', color: '#7682d2' },
  N: { name: 'Nuage', color: '#a9c6d9' },
  '*': { name: 'Soleil', color: '#f39c12' },
};

export const COOP_MOTIFS = { easy: ['F', 'C'], medium: ['L', 'G'], hard: ['E', 'S'] };

/** Motif affiché en `cell` quand le plateau a tourné de `rotation` quarts de tour horaires (H23). */
export const layoutAt = (cell, rotation = 0) => LAYOUT[rotateCell(cell, -rotation)];

/** Cases (indices 0–48) portant le motif `motif` : emplacement des mottes en coop (H2, H23 : après rotation). */
export const motteCells = (motif, rotation = 0) =>
  LAYOUT.flatMap((_, cell) => (layoutAt(cell, rotation) === motif ? [cell] : []));
