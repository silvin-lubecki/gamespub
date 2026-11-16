// RDC-02 (DESIGN.md §5.5) : vue filtrée d'un siège. Hypothèse H2 : mains cachées, le reste public.

/**
 * Vue de `seat` (null = vue sans main). Masque : mains adverses, ordre des pioches, défausse Commande (H16 : seul son nombre est public), `excluded`, `rng` et `seed`
 * (la graine permettrait de rejouer tous les mélanges).
 */
export function viewFor(state, seat) {
  const view = structuredClone(state);
  delete view.rng;
  delete view.seed;
  view.resDrawCount = view.resDraw.length;
  view.resDiscardCount = view.resDiscard.length;
  view.orderDeckCount = view.orderDeck.length;
  view.orderDiscardCount = view.orderDiscard.length;
  view.excludedCount = view.excluded.length;
  delete view.resDraw;
  delete view.resDiscard;
  delete view.orderDeck;
  delete view.orderDiscard;
  delete view.excluded;
  view.players.forEach((p, i) => {
    p.handCount = p.hand.length;
    if (i !== seat) delete p.hand;
  });
  view.you = seat;
  return view;
}
