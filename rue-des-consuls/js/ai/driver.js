// RDC-04 (DESIGN.md §8.2) : pilote des IA. Planifie une seule action à la fois pour un siège IA et passe par le même
// `act(seat, action)` que les humains. Le pilote ne s'abonne à rien : l'appelant (contrôleur solo, session hôte)
// appelle `notify()` après chaque changement d'état.
import { SEATS, currentSeat } from "../engine/index.js";
import { activeMarketMove, OFFER_TIMEOUT_MS, proposeAsPartner, shouldAccept } from "./negotiation.js";
import { chooseAction } from "./policy.js";

export const DEFAULT_DELAY_MS = 900;

export const realClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
};

/**
 * Prochaine chose à faire pour un siège IA, ou null : `{ seat, kind, action, offer? }`.
 * `kind` : `turn` (action de tour), `response` (réponse à une offre), `propose` (offre d'une IA partenaire),
 * `wait` (offre d'une IA active en attente d'un humain : `action` = `cancel` à l'échéance).
 * Coûteux (simulations de visite) : à n'appeler que depuis le pilote.
 */
export function planBotMove(state, { isBot, policyOf = () => "opportunist" }) {
  if (state.phase === "market") {
    const active = currentSeat(state);
    for (const o of state.market.offers) {
      if (o.status !== "open") continue;
      const seat = o.by === active ? o.partner : active;
      if (!isBot(seat)) continue;
      const type = shouldAccept(state, seat, o) ? "accept" : "decline";
      return { seat, kind: "response", offer: o.id, action: { type, offer: o.id } };
    }
    if (isBot(active)) return { seat: active, ...activeMarketMove(state, active, isBot) };
    for (let k = 1; k < SEATS; k++) {
      const seat = (active + k) % SEATS;
      if (!isBot(seat) || state.market.offers.some((o) => o.by === seat)) continue;
      const action = proposeAsPartner(state, seat, active);
      if (action) return { seat, kind: "propose", action };
    }
    return null;
  }
  const seat = currentSeat(state);
  if ((state.phase !== "action" && state.phase !== "visit") || !isBot(seat)) return null;
  return { seat, kind: "turn", action: chooseAction(state, seat, policyOf(seat)) };
}

/**
 * `createBotDriver({ getState, act, isBot, policyOf, clock, delayMs, random })` → `{ notify, stop }`.
 * `delayMs` 0 (test, `?botDelay=0`) : tout est immédiat, sauf l'attente d'un humain (20 s puis `cancel`).
 */
export function createBotDriver({
  getState,
  act,
  isBot,
  policyOf = () => "opportunist",
  clock = realClock,
  delayMs = DEFAULT_DELAY_MS,
  random = Math.random,
}) {
  const seen = new Map(); // offre en attente d'un humain → date de première observation
  let timer = null;
  let key = null;
  let stopped = false;

  const clear = () => {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
    key = null;
  };

  const delayFor = (plan) => {
    if (plan.kind === "wait") {
      if (!seen.has(plan.offer)) seen.set(plan.offer, clock.now());
      return Math.max(0, seen.get(plan.offer) + OFFER_TIMEOUT_MS - clock.now());
    }
    if (delayMs === 0) return 0;
    if (plan.kind === "response") return 600 + 900 * random();
    return delayMs * (0.7 + 0.6 * random());
  };

  const keyOf = (plan) => JSON.stringify([plan.seat, plan.kind, plan.action]);

  function notify() {
    if (stopped) return;
    const state = getState();
    const plan = planBotMove(state, { isBot, policyOf });
    const open = new Set((state.market?.offers ?? []).filter((o) => o.status === "open").map((o) => o.id));
    for (const id of seen.keys()) if (!open.has(id)) seen.delete(id); // offre résolue par l'humain : on l'oublie
    if (!plan) return clear();
    const next = keyOf(plan);
    if (next === key) return;
    clear();
    key = next;
    timer = clock.setTimeout(() => fire(next), delayFor(plan));
  }

  function fire(expected) {
    timer = null;
    key = null;
    if (stopped) return;
    const plan = planBotMove(getState(), { isBot, policyOf });
    if (!plan || keyOf(plan) !== expected) return notify();
    const result = act(plan.seat, plan.action);
    if (plan.kind === "wait") seen.delete(plan.offer);
    if (result?.ok !== false) notify(); // action refusée : état inchangé, on ne reboucle pas (prochain notify() de l'appelant)
  }

  return {
    notify,
    stop() {
      stopped = true;
      clear();
      seen.clear();
    },
  };
}
