// Mots formés par un coup (DESIGN.md §6.3 règle 7, H7).
import { top, sequenceAt } from './board.js';

const readWord = (board, cells, dir) => ({ word: cells.map((c) => top(board, c).l).join(''), cells, dir });

// `board` = plateau APRÈS la pose ; seules les cases de `placements` sont utilisées.
// Mot principal en premier, puis les mots perpendiculaires (≥ 2 lettres) par case posée croissante. Les lettres
// sont les sommets de pile. Un mot principal d'une seule lettre n'est un mot (H7) que s'il est le seul formé :
// si la pose forme par ailleurs un mot perpendiculaire (ex. « T » posé contre un « A » → « TA »), la tuile
// fait simplement partie de ce mot et la lettre isolée n'est pas vérifiée.
export function wordsFormed(board, placements, orientation) {
  const other = orientation === 'H' ? 'V' : 'H';
  const main = readWord(board, sequenceAt(board, placements[0].cell, orientation), orientation);
  const words = [];
  for (const cell of placements.map((p) => p.cell).sort((a, b) => a - b)) {
    const seq = sequenceAt(board, cell, other);
    if (seq.length >= 2) words.push(readWord(board, seq, other));
  }
  return main.cells.length >= 2 || words.length === 0 ? [main, ...words] : words;
}
