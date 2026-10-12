// Moteur de règles pur (sans DOM ni réseau). Ré-exports ajoutés au fil des issues.
export const ENGINE_VERSION = 1;
export { createDictionary, normalizeWord } from './dictionary.js';
export * from './constants.js';
export { next, shuffle, seedState } from './rng.js';
export { createBag, draw, returnTiles } from './bag.js';
export { LAYOUT, MOTIFS, COOP_MOTIFS, motteCells, layoutAt } from './layout.js';
export { createGame, drawFirstPlayer, isUnbalancedRack, applyAction, viewFor } from './game.js';
export { top, height, isEmpty, isBoardEmpty, neighbors, lineCells, sequenceAt } from './board.js';
export { wordsFormed } from './words.js';
export { validatePlay, placeTiles } from './placement.js';
export { edgeSlotsTouched, applyTerritories } from './territory.js';
export { coopScore, starsFor, STAR_TIERS, coopResult, isCoopMax, COOP_MAX_SCORE } from './coop.js';
