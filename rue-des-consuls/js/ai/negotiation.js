// RDC-04 (DESIGN.md §8.3, H8) : négociation des IA. Aucun état propre : tout se déduit de `state.market.offers`,
// ce qui permet de replanifier, de recharger l'hôte ou de changer de pilote sans rien perdre.
import { RESOURCES, applyAction } from "../engine/index.js";
import { handValue } from "./policy.js";

export const EPS = 1e-8;
export const MAX_TRADES = 12;
export const MAX_HUMAN_PROPOSALS = 2;
export const OFFER_TIMEOUT_MS = 20000;

const unit = (r) => {
  const out = new Array(RESOURCES.length).fill(0);
  out[r]++;
  return out;
};

/** Main après avoir donné la plus ancienne copie de `out` et reçu `inc` au fond (H3). */
function swapOldest(hand, out, inc) {
  const rest = hand.slice();
  rest.splice(rest.indexOf(out), 1);
  rest.push(inc);
  return rest;
}

/**
 * Meilleur échange 1 contre 1 par type (copies les plus anciennes) entre `active` et l'un des `partners` (dans l'ordre),
 * maximisant la somme des gains `handValue` des deux mains, chacun > EPS (boucle `market` de la simulation).
 * → { partner, give, want, gain } (`give` : ressource donnée par `active`, `want` : reçue) ou null.
 */
export function bestSwap(state, active, partners) {
  let best = 0;
  let found = null;
  const ha = state.players[active].hand;
  const va = handValue(state, active, ha);
  for (const q of partners) {
    const hb = state.players[q].hand;
    const vb = handValue(state, q, hb);
    for (const r of new Set(ha)) {
      for (const s of new Set(hb)) {
        if (r === s) continue;
        const da = handValue(state, active, swapOldest(ha, r, s)) - va;
        const db = handValue(state, q, swapOldest(hb, s, r)) - vb;
        if (da > EPS && db > EPS && da + db > best + EPS) {
          best = da + db;
          found = { partner: q, give: r, want: s, gain: da + db };
        }
      }
    }
  }
  return found;
}

/** Critère unilatéral : `seat` accepte si sa main s'améliore (un don est accepté s'il l'améliore ; impossible → refus). */
export function shouldAccept(state, seat, offer) {
  const r = applyAction(state, seat, { type: "accept", offer: offer.id });
  return r.ok && handValue(r.state, seat) - handValue(state, seat) > EPS;
}

/**
 * Action de l'IA active pendant son Marché : `{ kind: 'wait', offer, action: cancel }` tant que son offre est ouverte
 * (le pilote attend la réponse d'un humain jusqu'à OFFER_TIMEOUT_MS puis annule), sinon une nouvelle offre ou `endMarket`.
 * `isBot(seat)` distingue les partenaires IA (réponse immédiate, jamais plafonnés) des humains (2 propositions au plus).
 */
export function activeMarketMove(state, seat, isBot) {
  const offers = state.market.offers;
  const open = offers.find((o) => o.by === seat && o.status === "open");
  if (open) return { kind: "wait", offer: open.id, action: { type: "cancel", offer: open.id } };
  const end = { kind: "turn", action: { type: "endMarket" } };
  if (offers.filter((o) => o.status === "accepted").length >= MAX_TRADES) return end;
  const partners = [1, 2, 3].map((k) => (seat + k) % 4).filter((q) => {
    const mine = offers.filter((o) => o.by === seat && o.partner === q);
    if (mine.some((o) => o.status === "declined")) return false;
    return isBot(q) || mine.length < MAX_HUMAN_PROPOSALS;
  });
  const swap = bestSwap(state, seat, partners);
  if (!swap) return end;
  return { kind: "turn", action: { type: "offer", to: swap.partner, give: unit(swap.give), want: unit(swap.want) } };
}

/** Offre d'une IA partenaire pendant le Marché de `active` : le meilleur échange 1:1 mutuellement bénéfique, ou null. */
export function proposeAsPartner(state, seat, active) {
  const swap = bestSwap(state, active, [seat]);
  return swap && { type: "offer", give: unit(swap.want), want: unit(swap.give) };
}
