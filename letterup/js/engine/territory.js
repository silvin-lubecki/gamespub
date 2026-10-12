// Territoires et traverses (DESIGN.md §6.4, §6.5). Pur : ne mute jamais son entrée.
// H3 : 28 emplacements de bord ; un mot ne marque que les bords dans son propre sens de lecture.
// H8 : la reprise s'applique à tout mot formé ce tour qui touche le bord.
// Coop (§7) : propriétaire 'team', réserve commune `state.coop.brownLeft`, pas de reprise ; H11 : arbres.
import { SIZE, rowOf, colOf } from './constants.js';

/** Emplacements de bord touchés par un mot `{ cells, dir }` ; [] pour un mot de moins de 2 lettres. */
export function edgeSlotsTouched(word) {
  const { cells, dir } = word;
  if (cells.length < 2) return [];
  const first = cells[0], last = cells[cells.length - 1];
  const slots = [];
  if (dir === 'H') {
    const r = rowOf(first);
    if (colOf(first) === 0) slots.push(`L${r}`);
    if (colOf(last) === SIZE - 1) slots.push(`R${r}`);
  } else {
    const c = colOf(first);
    if (rowOf(first) === 0) slots.push(`T${c}`);
    if (rowOf(last) === SIZE - 1) slots.push(`B${c}`);
  }
  return slots;
}

/**
 * Applique les mots formés par `player` → `{ state, events }` (nouvel état ; l'entrée n'est pas modifiée).
 * Événements : `territory { player, slot, captured }`, `traverse { player, line: { dir, index }, slots }`,
 * et en coop `tree { slot }`.
 * Un mot de 7 lettres est une traverse : ses deux slots deviennent permanents et ses 7 cases sont verrouillées.
 * `covering` (coop, H11) : cases de ce coup qui recouvrent une tuile ; un mot qui en contient une et touche un
 * slot déjà marron (posé avant ce coup) sans arbre y plante un arbre.
 */
export function applyTerritories(state, player, words, { covering = new Set() } = {}) {
  const isCoop = state.mode === 'coop';
  const opponent = 1 - player;
  const edges = { ...state.edges };
  const players = state.players.map((p) => ({ ...p }));
  const coop = isCoop ? { ...state.coop } : null;
  const locked = state.locked.slice();
  const events = [];
  const fresh = new Set(); // slots marqués pendant ce coup (pas d'arbre dans le même coup)

  // Pose (ou reprise) un pion sur `slot` ; false si le slot ne revient pas au joueur.
  const claim = (slot, permanent) => {
    const edge = edges[slot];
    if (edge?.permanent) return isCoop || edge.owner === player;
    if (isCoop ? edge : edge?.owner === player) {
      if (permanent) edges[slot] = { ...edge, permanent: true };
      return true;
    }
    if (isCoop) {
      if (coop.brownLeft === 0) return false;
      coop.brownLeft--;
      coop.territories++;
      edges[slot] = { owner: 'team', permanent, tree: false };
      fresh.add(slot);
      events.push({ type: 'territory', player, slot, captured: false });
      return true;
    }
    if (players[player].pawnsLeft === 0) return false;
    const captured = Boolean(edge);
    if (captured) players[opponent].pawnsLeft++;
    players[player].pawnsLeft--;
    edges[slot] = { owner: player, permanent, tree: false };
    events.push({ type: 'territory', player, slot, captured });
    return true;
  };

  const plantTrees = (word) => {
    if (!isCoop || !word.cells.some((c) => covering.has(c))) return;
    for (const slot of edgeSlotsTouched(word)) {
      const edge = edges[slot];
      if (coop.treesLeft === 0) return;
      if (!edge || edge.tree || fresh.has(slot)) continue;
      edges[slot] = { ...edge, tree: true };
      coop.treesLeft--;
      coop.trees++;
      events.push({ type: 'tree', slot });
    }
  };

  for (const word of words) {
    if (word.cells.length === SIZE) {
      for (const cell of word.cells) locked[cell] = true;
      const index = word.dir === 'H' ? rowOf(word.cells[0]) : colOf(word.cells[0]);
      const ends = word.dir === 'H' ? [`L${index}`, `R${index}`] : [`T${index}`, `B${index}`];
      const slots = ends.filter((slot) => claim(slot, true));
      if (isCoop) coop.traverses++;
      events.push({ type: 'traverse', player, line: { dir: word.dir, index }, slots });
    } else {
      for (const slot of edgeSlotsTouched(word)) claim(slot, false);
    }
    plantTrees(word);
  }
  return { state: { ...state, edges, players, locked, ...(isCoop ? { coop } : {}) }, events };
}
