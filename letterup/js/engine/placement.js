// Validation d'un coup « JOUER UN MOT » (DESIGN.md §5.3, §6.3). Pure : ne mute rien et ne lit que des champs
// publics (status, current, players[i].rack, board, locked, mottes, orientation).
// H6 : le premier coup exige au moins 2 tuiles et couvre le Soleil. H7 : un mot principal d'une lettre est
// légal s'il est au dictionnaire.
import { CELLS, CENTER, RACK_SIZE, MAX_STACK, JOKER, rowOf, colOf } from './constants.js';
import { top, height, isBoardEmpty, neighbors, sequenceAt } from './board.js';
import { wordsFormed } from './words.js';

// Plateau après pose (copie) ; un joker est enregistré `{ l: lettre choisie, j: true }` (règle 8).
export function placeTiles(board, rack, placements) {
  const after = board.slice();
  for (const { cell, rackIndex, letter } of placements) {
    after[cell] = [...after[cell], { l: letter, j: rack[rackIndex] === JOKER }];
  }
  return after;
}

export function validatePlay(view, player, placements, dict) {
  const fail = (error, orientation = view.orientation ?? null, words = []) =>
    ({ ok: false, words, orientation, error });
  const { board } = view;

  // 1. Partie, joueur, forme de l'action, main.
  if (view.status !== 'playing') return fail('game-over');
  if (view.current !== player) return fail('not-your-turn');
  if (!Array.isArray(placements) || placements.length < 1 || placements.length > RACK_SIZE
    || placements.some((p) => p === null || typeof p !== 'object')) return fail('bad-action');
  const rack = view.players[player].rack;
  const used = new Set();
  for (const { rackIndex, letter } of placements) {
    if (!Number.isInteger(rackIndex) || rackIndex < 0 || rackIndex >= rack.length || used.has(rackIndex)) {
      return fail('rack-mismatch');
    }
    used.add(rackIndex);
    const ok = rack[rackIndex] === JOKER ? /^[A-Z]$/.test(letter ?? '') : letter === rack[rackIndex];
    if (!ok) return fail('rack-mismatch');
  }

  // 2. Cases.
  const seen = new Set();
  for (const { cell, letter } of placements) {
    if (!Number.isInteger(cell) || cell < 0 || cell >= CELLS) return fail('out-of-bounds');
    if (seen.has(cell)) return fail('duplicate-cell');
    seen.add(cell);
    if (view.mottes.includes(cell)) return fail('cell-blocked');
    if (view.locked[cell]) return fail('cell-locked');
    if (height(board, cell) >= MAX_STACK) return fail('stack-full');
    if (top(board, cell)?.l === letter) return fail('same-letter');
  }

  // 3. Alignement et orientation.
  const sameRow = placements.every((p) => rowOf(p.cell) === rowOf(placements[0].cell));
  const sameCol = placements.every((p) => colOf(p.cell) === colOf(placements[0].cell));
  if (!sameRow && !sameCol) return fail('not-aligned');
  const first = isBoardEmpty(board);
  let orientation;
  if (first) {
    if (placements.length < 2) return fail('first-too-short');
    orientation = sameRow ? 'H' : 'V';
  } else {
    orientation = view.orientation;
    if (placements.length >= 2 && (sameRow ? 'H' : 'V') !== orientation) return fail('wrong-orientation', orientation);
  }

  // 4. Mot principal unique, sans trou.
  const after = placeTiles(board, rack, placements);
  const main = sequenceAt(after, placements[0].cell, orientation);
  if (placements.some((p) => !main.includes(p.cell))) return fail('gap', orientation);

  // 5. Premier coup sur le Soleil.
  if (first && !main.includes(CENTER)) return fail('first-must-cover-sun', orientation);

  // 6. Connexion à un mot existant.
  if (!first && !placements.some((p) => height(board, p.cell) > 0
    || neighbors(p.cell).some((n) => height(board, n) > 0))) return fail('not-connected', orientation);

  // 7. Tous les mots formés au dictionnaire.
  const words = wordsFormed(after, placements, orientation).map((w) => ({ ...w, valid: dict.has(w.word) }));
  const bad = words.filter((w) => !w.valid);
  if (bad.length > 0) return fail('invalid-word', orientation, bad);
  return { ok: true, words, orientation };
}
