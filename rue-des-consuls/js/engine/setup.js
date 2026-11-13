// RDC-02 (DESIGN.md §5.2, §6.1) : mise en place, rivière filtrée et pioche de ressources.
// Hypothèses : H1 (4 sièges), H4 (ordre de distribution), H10 (premier joueur tiré par la graine), H12 (rivière < 5).
import {
  ARTISANS,
  CATALOG,
  INITIAL_HAND,
  RESOURCES,
  RIVER_SIZE,
  SEAT_COLORS,
  STARTERS_PER_PLAYER,
} from "./catalog.js";
import { next, seedState, shuffle } from "./rng.js";

export const STATE_VERSION = 1;
export const SEATS = 4;

/** Ressource du dessus de la pioche (remélange la défausse si besoin) ; mute l'état. */
export function drawResource(state) {
  if (state.resDraw.length === 0) {
    const r = shuffle(state.resDiscard, state.rng);
    state.resDraw = r.array;
    state.resDiscard = [];
    state.rng = r.rng;
  }
  if (state.resDraw.length === 0) throw new Error("resource supply exhausted");
  return state.resDraw.pop();
}

/**
 * Ajoute une commande à la rivière (filtre : au plus 2 commandes d'un même artisan) ; mute l'état.
 * Retourne la commande ajoutée, ou null si les pioches sont vides (H12). Port de `refill_river` (engine.py).
 */
export function refillRiver(state) {
  const present = ARTISANS.map(() => 0);
  for (const o of state.river) present[CATALOG[o.type].artisan]++;
  const refused = [];
  let added = null;
  for (;;) {
    if (state.orderDeck.length === 0) {
      if (refused.length > 0) added = refused.pop();
      break;
    }
    const o = state.orderDeck.pop();
    if (present[CATALOG[o.type].artisan] < 2) {
      added = o;
      break;
    }
    refused.push(o);
  }
  if (refused.length > 0) {
    const r = shuffle([...state.orderDeck, ...refused], state.rng);
    state.orderDeck = r.array;
    state.rng = r.rng;
  }
  if (added) state.river.push(added);
  return added;
}

/** Nouvelle partie à 4 sièges (H1). Ne rien changer à l'ordre des tirages : tests et fixtures en dépendent. */
export function createGame({ seed, names } = {}) {
  if (!Number.isInteger(seed)) throw new Error("seed must be an integer");
  if (names === undefined) names = SEAT_COLORS.map((_, i) => `Joueur ${i + 1}`);
  if (!Array.isArray(names) || names.length !== SEATS) throw new Error("exactly 4 names are required");

  let rng = seedState(seed);
  const resources = [];
  RESOURCES.forEach((res, i) => {
    for (let k = 0; k < res.count; k++) resources.push(i);
  });
  let r = shuffle(resources, rng);
  const resDraw = r.array;
  rng = r.rng;

  // H4 : main initiale dans l'ordre de distribution.
  const players = names.map((name, i) => ({
    name,
    color: SEAT_COLORS[i].id,
    hand: [],
    active: [],
    produced: [],
    dh: 0,
  }));
  for (const p of players) for (let k = 0; k < INITIAL_HAND; k++) p.hand.push(resDraw.pop());

  const starters = [];
  const normals = [];
  let id = 0;
  CATALOG.forEach((card, type) => {
    for (let k = 0; k < card.copies; k++) {
      (card.starter ? starters : normals).push({ id: id++, type, takenAt: null, depositedAt: null });
    }
  });
  r = shuffle(starters, rng);
  const shuffledStarters = r.array;
  rng = r.rng;
  players.forEach((p, i) => {
    for (const o of shuffledStarters.slice(i * STARTERS_PER_PLAYER, (i + 1) * STARTERS_PER_PLAYER)) {
      p.active.push({ ...o, takenAt: 0 });
    }
  });
  const excluded = shuffledStarters.slice(SEATS * STARTERS_PER_PLAYER);
  r = shuffle(normals, rng);
  const orderDeck = r.array;
  rng = r.rng;

  const state = {
    v: STATE_VERSION,
    seed,
    rng,
    players,
    first: 0,
    turn: 0,
    phase: "action",
    market: null,
    visit: null,
    artisans: ARTISANS.map(() => ({ renowned: false, queue: [] })),
    river: [],
    orderDeck,
    excluded,
    resDraw,
    resDiscard: [],
    endAfterTurn: null,
  };
  for (let k = 0; k < RIVER_SIZE; k++) refillRiver(state);
  const f = next(state.rng);
  state.rng = f.rng;
  state.first = Math.floor(f.value * SEATS); // H10
  return state;
}
