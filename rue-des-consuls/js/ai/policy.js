// RDC-04 (DESIGN.md §8.1) : politiques de l'IA, port de simulation/balance/python/engine.py (dépôt boardgame, a140245).
// Fonctions pures `(state, seat, …)` ; arithmétique simple, sans multiplication-addition fusionnée (« madd(a, b, c) » = a * b + c).
import {
  ACTIVE_LIMIT,
  ARTISANS,
  CATALOG,
  HAND_LIMIT,
  RESOURCES,
  applyAction,
  canDeposit,
  currentSeat,
  finalScores,
  isFriday,
} from "../engine/index.js";

export const POLICIES = ["opportunist", "volume", "value"];
/** Libellés affichés (« Équilibrée » est la politique par défaut). */
export const POLICY_NAMES = { opportunist: "Équilibrée", volume: "Volume", value: "Valeur" };

const RARITY = RESOURCES.map((r) => Math.sqrt(16 / r.count));
const sum = (a) => a.reduce((n, x) => n + x, 0);

/** Nombre d'exemplaires de chaque ressource d'une main. */
function countOf(hand) {
  const out = new Array(RESOURCES.length).fill(0);
  for (const r of hand) out[r]++;
  return out;
}

const isOpen = (s, c) => !c.locked || s.artisans[c.artisan].renowned;

/** `order_utility` : intérêt de prendre ou de déposer une commande (main entière du siège). */
export function orderUtility(state, seat, order, policy = "opportunist") {
  const c = CATALOG[order.type];
  const have = countOf(state.players[seat].hand);
  let missing = 0;
  c.recipe.forEach((n, r) => {
    missing = Math.max(0, n - have[r]) * RARITY[r] + missing;
  });
  const art = state.artisans[c.artisan];
  const value = c.reward + (art.renowned ? c.premium : 0);
  const total = sum(c.recipe);
  let u;
  if (policy === "volume") u = 5 / (0.5 * total + (0.8 * missing + 1));
  else if (policy === "value") u = value / (0.3 * total + (0.65 * missing + 1));
  else if (policy === "opportunist") u = (0.45 * value + 2) / (0.35 * total + (0.8 * missing + 1));
  else throw new Error(`politique inconnue : ${policy}`);
  u *= 1 + (0.35 * art.queue.length) / ARTISANS[c.artisan].capacity;
  if (c.locked && !art.renowned) u *= 0.3;
  return u;
}

/** `hand_value` : valeur d'une main (les 10 dernières cartes) au regard des commandes actives ; indépendante de la politique. */
export function handValue(state, seat, hand = state.players[seat].hand) {
  const have = countOf(hand.slice(-HAND_LIMIT));
  const demand = new Array(RESOURCES.length).fill(0);
  for (const o of state.players[seat].active) {
    const c = CATALOG[o.type];
    if (!isOpen(state, c)) continue;
    c.recipe.forEach((n, r) => {
      demand[r] += n;
    });
  }
  let value = 0;
  have.forEach((n, r) => {
    const use = Math.min(n, demand[r]);
    value += 0.06 * (n - use) + use * RARITY[r];
  });
  return value;
}

/** Commande à déposer chez `artisan` (meilleure `orderUtility`, premier trouvé en cas d'égalité) ou null (`visit`). */
export function chooseVisitDeposit(state, seat, artisan, policy = "opportunist") {
  let best = -1;
  let pick = null;
  for (const o of state.players[seat].active) {
    if (CATALOG[o.type].artisan !== artisan || !canDeposit(state, seat, o.id)) continue;
    const u = orderUtility(state, seat, o, policy);
    if (u > best) {
      best = u;
      pick = o.id;
    }
  }
  return pick;
}

const net = (s, seat) => s.players[seat].dh - 2 * s.players[seat].active.length;

/** `visit_utility` : utilité d'une visite chez `artisan`, simulée sur un clone ; réservée au siège actif en phase `action`. */
export function visitUtility(state, seat, artisan, policy = "opportunist") {
  if (chooseVisitDeposit(state, seat, artisan, policy) === null) return -1e9;
  let c = state;
  let deposited = 0;
  for (;;) {
    const order = chooseVisitDeposit(c, seat, artisan, policy);
    if (order === null) break;
    const r = applyAction(c, seat, { type: "deposit", order });
    if (!r.ok) throw new Error(`dépôt simulé refusé : ${r.error}`);
    c = r.state;
    deposited++;
  }
  if (c.endAfterTurn !== null && state.turn + 1 >= c.endAfterTurn) {
    return finalScores(c).winners.includes(seat) ? 1000 : -1000;
  }
  const earned = c.players[seat].dh - state.players[seat].dh;
  const done = c.players[seat].produced.length - state.players[seat].produced.length;
  let pending = 0;
  for (const e of c.artisans[artisan].queue) {
    if (e.owner === seat && e.order.depositedAt === state.turn) pending += CATALOG[e.order.type].reward;
  }
  const progress = c.artisans[artisan].queue.length / ARTISANS[artisan].capacity;
  const weight = policy === "volume" ? 1 : 0.45;
  let u = weight * done + (pending * (0.2 * progress + 0.1) + (0.3 * earned + 1.1 * deposited));
  let rivalGain = 0;
  for (let q = 0; q < state.players.length; q++) {
    if (q !== seat) rivalGain = Math.max(rivalGain, c.players[q].dh - state.players[q].dh);
  }
  u -= 0.12 * rivalGain;
  if (state.endAfterTurn === null && c.endAfterTurn !== null && state.turn + 1 < c.endAfterTurn) {
    const rival = Math.max(...c.players.map((_, q) => q).filter((q) => q !== seat).map((q) => net(c, q)));
    u += Math.max(-3, Math.min(3, 0.15 * (net(c, seat) - rival)));
  }
  return u;
}

/** `step` : action de tour (phase `action`) du siège actif — Marché, Prise ou Visite ; égalités → premier trouvé. */
export function chooseTurnAction(state, seat, policy = "opportunist") {
  const p = state.players[seat];
  let best = p.active.length > 0 ? 1.15 : 0.4;
  let action = { type: "market" };
  if (p.active.length < ACTIVE_LIMIT) {
    state.river.forEach((o, index) => {
      let u = orderUtility(state, seat, o, policy);
      if (p.active.length === 0) u += 1;
      if (p.active.length === ACTIVE_LIMIT - 1) u *= 0.8;
      if (u > best) {
        best = u;
        action = { type: "take", index };
      }
    });
  }
  if (!isFriday(state)) {
    for (let a = 0; a < ARTISANS.length; a++) {
      const u = visitUtility(state, seat, a, policy);
      if (u > best) {
        best = u;
        action = { type: "deposit", order: chooseVisitDeposit(state, seat, a, policy) };
      }
    }
  }
  return action;
}

/** Action du siège actif pendant sa visite : prochain dépôt chez le même artisan, sinon fin de visite. */
export function chooseVisitAction(state, seat, policy = "opportunist") {
  const order = chooseVisitDeposit(state, seat, state.visit.artisan, policy);
  return order === null ? { type: "endVisit" } : { type: "deposit", order };
}

/** Action de tour d'un siège IA (phase `action` ou `visit`), ou null si ce n'est pas son tour. */
export function chooseAction(state, seat, policy = "opportunist") {
  if (currentSeat(state) !== seat) return null;
  if (state.phase === "action") return chooseTurnAction(state, seat, policy);
  if (state.phase === "visit") return chooseVisitAction(state, seat, policy);
  return null;
}
