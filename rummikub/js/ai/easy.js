// IA Facile (DESIGN §8.3). Avant la première pose : la meilleure partition du chevalet seul si elle vaut ≥ 30.
// Ensuite : pose toutes les combinaisons du chevalet, puis ajoute les tuiles isolées là où la combinaison reste valide
// (bout de suite, 4ᵉ tuile de groupe). Sinon pioche (ou passe). Elle garde ses jokers tant qu'il lui reste plus de 3 tuiles.
import { analyzeSet } from '../engine/sets.js';
import { isJoker } from '../engine/tiles.js';
import { bestInitialMeld, bestPartition } from './meld.js';

export const KEEP_JOKER_ABOVE = 3;
const drawOrPass = (state) => ({ type: state.pool.length ? 'draw' : 'pass' });

export function chooseEasy(state, seat) {
  const rack = state.racks[seat];
  const usable = rack.length > KEEP_JOKER_ABOVE ? rack.filter((id) => !isJoker(id)) : rack;
  const table = state.table.map((set) => set.slice());
  if (!state.melded[seat]) {
    const meld = bestInitialMeld(usable);
    return meld ? { type: 'play', table: [...table, ...meld.sets] } : drawOrPass(state);
  }
  const fresh = bestPartition(usable, { objective: 'count' }).sets;
  const sets = [...table, ...fresh];
  const used = new Set(fresh.flat());
  let played = used.size;
  for (const id of usable) {
    if (used.has(id)) continue;
    const target = sets.find((set) => analyzeSet([...set, id]) !== null);
    if (target) { target.push(id); used.add(id); played++; }
  }
  return played > 0 ? { type: 'play', table: sets } : drawOrPass(state);
}
