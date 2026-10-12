// Sac de tuiles. Convention : la fin du tableau est le dessus du sac. Fonctions pures.
import { DISTRIBUTION } from './constants.js';
import { shuffle } from './rng.js';

/** Sac complet (60 tuiles), non mélangé, en ordre alphabétique. */
export function createBag() {
  return Object.entries(DISTRIBUTION).flatMap(([letter, n]) => Array(n).fill(letter));
}

/** Pioche n tuiles (ou moins si le sac est trop petit) → { tiles, bag }. */
export function draw(bag, n) {
  const count = Math.min(n, bag.length);
  return {
    tiles: bag.slice(bag.length - count).reverse(),
    bag: bag.slice(0, bag.length - count),
  };
}

/** Remet des tuiles dans le sac puis re-mélange l'ensemble → { bag, rng }. */
export function returnTiles(bag, tiles, rng) {
  const { array, rng: next } = shuffle([...bag, ...tiles], rng);
  return { bag: array, rng: next };
}
