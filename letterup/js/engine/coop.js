// Mode coopératif (DESIGN.md §7). Pur : ne mute rien.
// H10′ : fin sur score max, première passe (« Terminer ») ou chevalet d'équipe vide (H12′). H11 : arbres (voir territory.js).
import { PAWNS } from './constants.js';

/** Score maximal : tous les pions marron posés et tous les arbres plantés (8 + 5). */
export const COOP_MAX_SCORE = PAWNS.coopBrown + PAWNS.coopTrees;

/** Paliers d'étoiles (§7), du plus bas au plus haut : source unique des seuils (moteur et textes d'UI). */
export const STAR_TIERS = Object.freeze([
  { stars: 1, territories: 6, trees: 3, traverses: 0 },
  { stars: 2, territories: PAWNS.coopBrown, trees: 4, traverses: 0 },
  { stars: 3, territories: PAWNS.coopBrown, trees: PAWNS.coopTrees, traverses: 1 },
].map(Object.freeze));

/** Étoiles obtenues : le plus haut palier dont les trois seuils sont atteints, sinon 0. */
export function starsFor({ territories, trees, traverses }) {
  let stars = 0;
  for (const t of STAR_TIERS) {
    if (territories >= t.territories && trees >= t.trees && traverses >= t.traverses) stars = t.stars;
  }
  return stars;
}

/** → `{ score, territories, trees, traverses, stars }` pour un état coop. */
export function coopScore(state) {
  const { territories, trees, traverses } = state.coop;
  return { score: territories + trees, territories, trees, traverses, stars: starsFor(state.coop) };
}

/** Vrai quand tous les territoires et tous les arbres sont posés (fin `max`). */
export const isCoopMax = (state) =>
  state.coop.territories === PAWNS.coopBrown && state.coop.trees === PAWNS.coopTrees;

/** Résultat de fin de partie coop. */
export function coopResult(state, reason) {
  const { score, stars } = coopScore(state);
  return { winner: null, reason, score, stars };
}
