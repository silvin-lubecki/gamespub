// RDC-02 (DESIGN.md §5) : point d'entrée du moteur (aucune dépendance DOM).
export const ENGINE_VERSION = 1;

export * from "./catalog.js";
export { next, shuffle, seedState } from "./rng.js";
export { STATE_VERSION, SEATS, createGame, refillRiver } from "./setup.js";
export { applyAction, legalActions, currentSeat, day, isFriday, canDeposit, hasCards } from "./rules.js";
export { finalScores } from "./scoring.js";
export { viewFor } from "./view.js";
