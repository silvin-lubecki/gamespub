// RDC-02 (DESIGN.md §5.3, §5.4, §6.1, §7.1) : actions, événements, production et fin de tour.
// Hypothèses : H3 (copies les plus anciennes), H4 (ordre de réception), H5 (la visite commence au premier dépôt),
// H6 (cartes du Marché dans la main dès la révélation), H7 (une offre ouverte par paire).
import {
  ACTIVE_LIMIT,
  ARTISANS,
  CATALOG,
  HAND_LIMIT,
  MAJORITY_BONUS,
  MARKET_CARDS,
  RESOURCES,
  THRESHOLD,
} from "./catalog.js";
import { drawResource, refillRiver, SEATS } from "./setup.js";
import { finalScores } from "./scoring.js";

const NRES = RESOURCES.length;

export const currentSeat = (s) => (s.first + s.turn) % SEATS;
export const day = (s) => Math.floor(s.turn / SEATS) % 5;
export const isFriday = (s) => day(s) === 4;

/** `counts` (int[9]) ⊆ `hand` (liste de ressources) ? */
export function hasCards(hand, counts) {
  const have = new Array(NRES).fill(0);
  for (const r of hand) have[r]++;
  return counts.every((n, r) => n <= have[r]);
}

/** H3 : retire `counts` en prenant les copies les plus anciennes (début de main) → { kept, removed }. */
function removeOldest(hand, counts) {
  const need = counts.slice();
  const kept = [];
  const removed = [];
  for (const r of hand) {
    if (need[r] > 0) {
      need[r]--;
      removed.push(r);
    } else kept.push(r);
  }
  return { kept, removed };
}

/** H4 : cartes reçues dans l'ordre des indices de ressource. */
function expand(counts) {
  const out = [];
  counts.forEach((n, r) => {
    for (let k = 0; k < n; k++) out.push(r);
  });
  return out;
}

/** Code d'erreur d'un dépôt de `orderId` par `seat`, ou null s'il est possible (ne vérifie pas le tour). */
function depositError(s, seat, orderId) {
  if (s.phase !== "action" && s.phase !== "visit") return "wrong-phase";
  if (s.phase === "action" && isFriday(s)) return "friday";
  const player = s.players[seat];
  const order = player.active.find((o) => o.id === orderId);
  if (!order) return "unknown-order";
  const card = CATALOG[order.type];
  if (s.phase === "visit" && card.artisan !== s.visit.artisan) return "wrong-artisan";
  if (card.locked && !s.artisans[card.artisan].renowned) return "locked";
  if (!hasCards(player.hand, card.recipe)) return "insufficient-cards";
  return null;
}

export const canDeposit = (s, seat, orderId) => depositError(s, seat, orderId) === null;

/** Actions de tour valides pour `seat` (les offres, ouvertes à tous, n'en font pas partie). */
export function legalActions(s, seat) {
  if (s.phase === "ended" || seat !== currentSeat(s)) return [];
  if (s.phase === "market") return [{ type: "endMarket" }];
  const deposits = s.players[seat].active
    .filter((o) => canDeposit(s, seat, o.id))
    .map((o) => ({ type: "deposit", order: o.id }));
  if (s.phase === "visit") return [...deposits, { type: "endVisit" }];
  const actions = [{ type: "market" }];
  if (s.players[seat].active.length < ACTIVE_LIMIT) {
    s.river.forEach((_, index) => actions.push({ type: "take", index }));
  }
  return [...actions, ...deposits];
}

const isCounts = (a) => Array.isArray(a) && a.length === NRES && a.every((n) => Number.isInteger(n) && n >= 0);
const fail = (error) => ({ ok: false, error });
// Phase requise des actions de tour (null : vérifiée par depositError).
const TURN_ACTIONS = { market: "action", take: "action", deposit: null, endVisit: "visit", endMarket: "market" };
const MARKET_ACTIONS = ["offer", "accept", "decline", "cancel"];

/** Applique une action sans muter `state` → { ok: true, state, events } ou { ok: false, error }. */
export function applyAction(state, seat, action) {
  if (state.phase === "ended") return fail("game-over");
  if (!Number.isInteger(seat) || seat < 0 || seat >= SEATS) return fail("bad-seat");
  if (!action || typeof action !== "object") return fail("bad-action");
  const isTurn = Object.hasOwn(TURN_ACTIONS, action.type);
  if (!isTurn && !MARKET_ACTIONS.includes(action.type)) return fail("bad-action");
  if (isTurn && seat !== currentSeat(state)) return fail("not-your-turn");
  if (isTurn && TURN_ACTIONS[action.type] !== null && state.phase !== TURN_ACTIONS[action.type]) {
    return fail("wrong-phase");
  }
  if (!isTurn && state.phase !== "market") return fail("wrong-phase");

  const s = structuredClone(state);
  const events = [];
  const error = HANDLERS[action.type](s, seat, action, events);
  return error ? fail(error) : { ok: true, state: s, events };
}

const closeOffer = (offer, status, events) => {
  offer.status = status;
  events.push({ type: "offer-closed", id: offer.id, status });
};

const HANDLERS = {
  market(s, seat, _a, events) {
    const revealed = [];
    for (let k = 0; k < MARKET_CARDS; k++) revealed.push(drawResource(s));
    s.players[seat].hand.push(...revealed); // H6
    s.market = { revealed, offers: [], nextOfferId: 0 };
    s.phase = "market";
    events.push({ type: "market", seat, revealed });
  },

  offer(s, seat, a, events) {
    const active = currentSeat(s);
    let partner;
    if (seat === active) {
      if (!Number.isInteger(a.to) || a.to < 0 || a.to >= SEATS || a.to === active) return "bad-target";
      partner = a.to;
    } else {
      if (a.to !== undefined && a.to !== active) return "bad-target";
      partner = seat;
    }
    if (!isCounts(a.give) || !isCounts(a.want)) return "bad-action";
    if (a.give.every((n) => n === 0) && a.want.every((n) => n === 0)) return "empty-offer";
    if (!hasCards(s.players[seat].hand, a.give)) return "insufficient-cards";
    for (const o of s.market.offers) {
      if (o.status === "open" && o.partner === partner) closeOffer(o, "superseded", events); // H7
    }
    // Id unique sur toute la partie : un clic tardif ne touche jamais une offre d'un Marché précédent.
    const offer = {
      id: `${s.turn}-${s.market.nextOfferId++}`,
      partner,
      by: seat,
      give: a.give.slice(),
      want: a.want.slice(),
      status: "open",
    };
    s.market.offers.push(offer);
    events.push({ type: "offer", offer: structuredClone(offer) });
  },

  accept(s, seat, a, events) {
    const offer = s.market.offers.find((o) => o.id === a.offer);
    if (!offer || offer.status !== "open") return "offer-not-open";
    const active = currentSeat(s);
    const recipient = offer.by === active ? offer.partner : active;
    if (seat !== recipient) return "not-recipient";
    const giver = s.players[offer.by];
    const taker = s.players[recipient];
    if (!hasCards(giver.hand, offer.give) || !hasCards(taker.hand, offer.want)) return "offer-unavailable";
    const out = removeOldest(giver.hand, offer.give);
    const back = removeOldest(taker.hand, offer.want);
    giver.hand = [...out.kept, ...expand(offer.want)];
    taker.hand = [...back.kept, ...expand(offer.give)];
    const byActive = offer.by === active;
    events.push({
      type: "trade",
      active,
      partner: offer.partner,
      gave: (byActive ? offer.give : offer.want).slice(),
      got: (byActive ? offer.want : offer.give).slice(),
    });
    closeOffer(offer, "accepted", events);
  },

  decline(s, seat, a, events) {
    const offer = s.market.offers.find((o) => o.id === a.offer);
    if (!offer || offer.status !== "open") return "offer-not-open";
    const active = currentSeat(s);
    if (seat !== (offer.by === active ? offer.partner : active)) return "not-recipient";
    closeOffer(offer, "declined", events);
  },

  cancel(s, seat, a, events) {
    const offer = s.market.offers.find((o) => o.id === a.offer);
    if (!offer || offer.status !== "open") return "offer-not-open";
    if (seat !== offer.by) return "not-proposer";
    closeOffer(offer, "cancelled", events);
  },

  endMarket(s, _seat, _a, events) {
    for (const o of s.market.offers) if (o.status === "open") closeOffer(o, "closed", events);
    endTurn(s, events);
  },

  take(s, seat, a, events) {
    const player = s.players[seat];
    if (player.active.length >= ACTIVE_LIMIT) return "active-limit";
    if (!Number.isInteger(a.index) || a.index < 0 || a.index >= s.river.length) return "bad-index";
    const order = s.river.splice(a.index, 1)[0];
    order.takenAt = s.turn;
    player.active.push(order);
    events.push({ type: "take", seat, order: structuredClone(order) });
    const added = refillRiver(s);
    events.push({ type: "river", added: added ? structuredClone(added) : null });
    endTurn(s, events);
  },

  deposit(s, seat, a, events) {
    const error = depositError(s, seat, a.order);
    if (error) return error;
    const player = s.players[seat];
    const order = player.active.splice(player.active.findIndex((o) => o.id === a.order), 1)[0];
    const card = CATALOG[order.type];
    const paid = removeOldest(player.hand, card.recipe); // H3
    player.hand = paid.kept;
    s.resDiscard.push(...paid.removed);
    order.depositedAt = s.turn;
    const artisan = card.artisan;
    s.artisans[artisan].queue.push({ owner: seat, order });
    s.phase = "visit"; // H5
    s.visit = { artisan };
    events.push({ type: "deposit", seat, order: structuredClone(order), artisan });
    if (s.artisans[artisan].queue.length === ARTISANS[artisan].capacity) produce(s, artisan, events);
  },

  endVisit(s, _seat, _a, events) {
    endTurn(s, events);
  },
};

/** File pleine : paiements, majorité stricte, Renommée, seuil de fin de partie. */
function produce(s, artisan, events) {
  const slot = s.artisans[artisan];
  const wasRenowned = slot.renowned;
  const shares = new Array(SEATS).fill(0);
  const gains = new Array(SEATS).fill(0);
  for (const { owner, order } of slot.queue) {
    const card = CATALOG[order.type];
    gains[owner] += card.reward + (wasRenowned ? card.premium : 0);
    shares[owner]++;
    s.players[owner].produced.push(order);
  }
  const high = Math.max(...shares);
  const majority = shares.filter((n) => n === high).length === 1 ? shares.indexOf(high) : null;
  const payouts = [];
  gains.forEach((dh, seat) => {
    if (shares[seat] > 0) payouts.push({ seat, dh });
    s.players[seat].dh += dh + (seat === majority ? MAJORITY_BONUS : 0);
  });
  slot.queue = [];
  slot.renowned = true;
  // `renowned` : l'artisan vient de devenir Renommé.
  events.push({ type: "produce", artisan, payouts, majority, renowned: !wasRenowned });
  if (s.endAfterTurn === null) {
    const seat = s.players.findIndex((p) => p.produced.length >= THRESHOLD);
    if (seat >= 0) {
      s.endAfterTurn = (Math.floor(s.turn / SEATS) + 1) * SEATS;
      events.push({ type: "trigger", seat });
    }
  }
}

/** Limite de main pour tous, tour suivant, fin de partie éventuelle. */
function endTurn(s, events) {
  s.players.forEach((p, seat) => {
    const excess = p.hand.length - HAND_LIMIT;
    if (excess > 0) {
      const cards = p.hand.splice(0, excess);
      s.resDiscard.push(...cards);
      events.push({ type: "discard", seat, cards });
    }
  });
  s.market = null;
  s.visit = null;
  s.turn++;
  if (s.endAfterTurn !== null && s.turn >= s.endAfterTurn) {
    s.phase = "ended";
    events.push({ type: "end", scores: finalScores(s) });
  } else {
    s.phase = "action";
    if (s.turn % SEATS === 0) events.push({ type: "day", day: day(s) });
  }
}
