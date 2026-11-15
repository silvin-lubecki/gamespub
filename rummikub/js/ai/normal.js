// IA Normale (DESIGN §8.3). Avant la première pose : la meilleure combinaison du chevalet seul ≥ 30 (sans jokers d'abord,
// pour les garder), la table restant inchangée. Ensuite : solveur de réarrangement complet (solver.js) qui maximise le
// nombre de tuiles posées. Si le budget de nœuds est dépassé, le meilleur chemin trouvé est joué s'il pose plus que la
// stratégie Facile, sinon la Facile ; s'il n'y a rien à poser, on pioche (ou on passe). Pure et déterministe.
import { chooseEasy } from './easy.js';
import { bestInitialMeld } from './meld.js';
import { solve } from './solver.js';
import { isJoker } from '../engine/tiles.js';

const drawOrPass = (state) => ({ type: state.pool.length ? 'draw' : 'pass' });

/** `maxNodes` (tests) réduit le budget du solveur pour exercer le repli. */
export function chooseNormal(state, seat, { maxNodes } = {}) {
  const rack = state.racks[seat];
  const table = state.table.map((set) => set.slice());
  if (!state.melded[seat]) {
    const meld = bestInitialMeld(rack.filter((id) => !isJoker(id))) ?? bestInitialMeld(rack);
    return meld ? { type: 'play', table: [...table, ...meld.sets] } : drawOrPass(state);
  }
  const result = solve(table, rack, { maxNodes });
  if (result.complete && !result.invalid) return result.count > 0 ? { type: 'play', table: result.sets } : drawOrPass(state);
  const easy = chooseEasy(state, seat);
  if (result.sets && result.count > 0) {
    const easyCount = easy.type === 'play' ? easy.table.flat().length - table.flat().length : 0;
    if (result.count >= easyCount) return { type: 'play', table: result.sets };
  }
  return easy;
}
