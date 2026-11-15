// Cartes de Séquence : deux jeux de 52 cartes, sans joker (104 cartes). Une carte est une chaîne 'QH', 'TD', 'JS' (rang + couleur).
export const RANKS = 'A23456789TJQK';
export const SUITS = 'SHDC';
export const CARD_RE = /^[A2-9TJQK][SHDC]$/;

/** Les 104 cartes (deux fois 52). */
export function fullDeck() {
  const one = [];
  for (const s of SUITS) for (const r of RANKS) one.push(r + s);
  return [...one, ...one];
}

export const isCard = (c) => typeof c === 'string' && CARD_RE.test(c);
// H-SEQ-2 : valets à deux yeux = ♦ et ♣ (joker, case libre au choix) ; à un œil = ♠ et ♥ (retrait d'un jeton adverse).
export const isTwoEyed = (c) => c === 'JD' || c === 'JC';
export const isOneEyed = (c) => c === 'JS' || c === 'JH';
export const isJack = (c) => isTwoEyed(c) || isOneEyed(c);
