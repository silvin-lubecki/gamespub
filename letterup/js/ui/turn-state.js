// État local d'un tour (LU-10) : poses provisoires, sélection, renouvellement, prévisualisation. Module pur (sans DOM).
// Hypothèses utilisées : H3 et H8 (emplacements de bord gagnés/repris par un mot d'au moins 2 lettres, surlignés en prévisualisation).
import { JOKER, MAX_STACK, edgeSlotsTouched, placeTiles, validatePlay, wordsFormed } from '../engine/index.js';
import { errorMessage } from './messages.js';

/** `pending` : [{ cell, rackIndex, letter }] ; `selected` : rackIndex | null ; `renew` : null | rackIndex[]. */
export const initialTurn = () => ({ pending: [], selected: null, renew: null });

const usesRack = (s, rackIndex) => s.pending.some((p) => p.rackIndex === rackIndex);
const hasCell = (s, cell) => s.pending.some((p) => p.cell === cell);

/** Réducteur pur : une action illégale renvoie l'état inchangé. */
export function reduceTurn(s, a) {
  switch (a.type) {
    case 'select':
      if (s.renew || usesRack(s, a.rackIndex)) return s;
      return { ...s, selected: s.selected === a.rackIndex ? null : a.rackIndex };
    case 'place':
      if (s.renew || hasCell(s, a.cell) || usesRack(s, a.rackIndex)) return s;
      return {
        ...s,
        pending: [...s.pending, { cell: a.cell, rackIndex: a.rackIndex, letter: a.letter }],
        selected: null,
      };
    case 'move':
      if (!hasCell(s, a.from) || (a.from !== a.to && hasCell(s, a.to))) return s;
      return { ...s, pending: s.pending.map((p) => (p.cell === a.from ? { ...p, cell: a.to } : p)) };
    case 'unplace':
      if (!hasCell(s, a.cell)) return s;
      return { ...s, pending: s.pending.filter((p) => p.cell !== a.cell) };
    case 'clear':
      return { ...s, pending: [], selected: null };
    case 'renew-start':
      return { pending: [], selected: null, renew: [] };
    case 'renew-toggle':
      if (!s.renew) return s;
      return {
        ...s,
        renew: s.renew.includes(a.rackIndex) ? s.renew.filter((i) => i !== a.rackIndex) : [...s.renew, a.rackIndex],
      };
    case 'renew-cancel':
      return s.renew ? { ...s, renew: null } : s;
    case 'reset':
      return initialTurn();
    default:
      return s;
  }
}

/** Code d'erreur (messages.js) expliquant un dépôt refusé d'emblée sur `cell`, ou `null` (motte : H2). */
export function blockedReason(view, cell) {
  if (view.mottes?.includes(cell)) return 'cell-blocked';
  if (view.locked?.[cell]) return 'cell-locked';
  if ((view.board[cell]?.length ?? 0) >= MAX_STACK) return 'stack-full';
  return null;
}

/**
 * Cas où le dépôt est refusé d'emblée : motte, case verrouillée, pile pleine, autre pose provisoire.
 * `same-letter` n'est pas vérifié ici : la prévisualisation le signale.
 */
export function canDropOn(view, pending, cell, fromCell = null) {
  if (!Number.isInteger(cell) || cell < 0 || cell >= view.board.length) return false;
  if (blockedReason(view, cell)) return false;
  return !pending.some((p) => p.cell === cell && p.cell !== fromCell);
}

/** Poses provisoires au format de `renderBoard` (le joker est repéré dans le chevalet). */
export function pendingForBoard(pending, rack) {
  return pending.map((p) => ({ cell: p.cell, letter: p.letter, joker: rack[p.rackIndex] === JOKER }));
}

/** Placements au format de l'action `play` (§5.3). */
export function toPlacements(pending) {
  return pending.map(({ cell, rackIndex, letter }) => ({ cell, rackIndex, letter }));
}

/** Emplacements de bord que le coup gagnerait ou reprendrait (hors pions permanents et déjà à moi). */
export function gainedSlots(view, words) {
  const mine = view.mode === 'coop' ? 'team' : view.you;
  const slots = [...new Set(words.flatMap((w) => edgeSlotsTouched(w)))];
  return slots.filter((s) => !view.edges?.[s]?.permanent && view.edges?.[s]?.owner !== mine);
}

/**
 * Prévisualisation d'un coup : `null` sans pose ; sinon { ok, error, words: [{word, cells, dir, valid}], slots, message }.
 * En cas de `invalid-word`, tous les mots formés sont listés (✓/✗) et pas seulement les fautifs.
 */
export function computePreview(view, you, pending, dict) {
  if (pending.length === 0) return null;
  const placements = toPlacements(pending);
  const r = validatePlay(view, you, placements, dict);
  let words = r.words;
  if (r.error === 'invalid-word') {
    const after = placeTiles(view.board, view.players[you].rack, placements);
    words = wordsFormed(after, placements, r.orientation).map((w) => ({ ...w, valid: dict.has(w.word) }));
  }
  return {
    ok: r.ok,
    error: r.error ?? null,
    words,
    slots: r.ok ? gainedSlots(view, r.words) : [],
    message: r.ok ? null : errorMessage(r.error, { words: r.words, orientation: r.orientation }),
  };
}
