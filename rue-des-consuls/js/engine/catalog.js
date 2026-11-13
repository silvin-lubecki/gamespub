// GÉNÉRÉ par tools/gen-catalog.mjs — ne pas modifier à la main.
// Source : silvin-lubecki/boardgame, games/rue-des-consuls/data/catalog-v05.json
// Commit source : a140245c323fc13d136856fa6874ce6bfb45c1a9
// RDC-01 (DESIGN.md §5.1).

/** Types de ressources, dans l'ordre des indices de `recipe` (85 cartes au total). */
export const RESOURCES = [
  { id: "argile", name: "Argile", count: 16 },
  { id: "pigment", name: "Pigment", count: 11 },
  { id: "cuir", name: "Cuir", count: 14 },
  { id: "cedre", name: "Cèdre", count: 12 },
  { id: "laiton", name: "Laiton", count: 5 },
  { id: "laine", name: "Laine", count: 6 },
  { id: "soie", name: "Soie", count: 10 },
  { id: "or", name: "Or", count: 7 },
  { id: "nacre", name: "Nacre", count: 4 },
];

/** Artisans, indices 0–4 du champ `artisan` des commandes. Face Renommé : « Maâlem » / « Maâlma » + prénom. */
export const ARTISANS = [
  { id: "potier", trade: "Potier", name: "Hassan", capacity: 4, feminine: false },
  { id: "maroquiniere", trade: "Maroquinière", name: "Fatiha", capacity: 4, feminine: true },
  { id: "ebeniste", trade: "Ébéniste", name: "Redouane", capacity: 3, feminine: false },
  { id: "couturiere", trade: "Couturière", name: "Alia", capacity: 3, feminine: true },
  { id: "orfevre", trade: "Orfèvre", name: "Hakim", capacity: 2, feminine: false },
];

/** Les commandes du catalogue V0.5 (verbatim) + `id` (clé d'asset). */
export const CATALOG = [
  { id: "coupelle-en-terre-cuite", name: "Coupelle en terre cuite", artisan: 0, recipe: [1,0,0,0,0,0,0,0,0], reward: 1, copies: 3, starter: true, locked: false, premium: 0 },
  { id: "bracelet-de-cuir", name: "Bracelet de cuir", artisan: 1, recipe: [0,0,1,0,0,0,0,0,0], reward: 1, copies: 3, starter: true, locked: false, premium: 0 },
  { id: "toupie-en-cedre", name: "Toupie en cèdre", artisan: 2, recipe: [0,0,0,1,0,0,0,0,0], reward: 1, copies: 3, starter: true, locked: false, premium: 0 },
  { id: "bonnet-de-laine", name: "Bonnet de laine", artisan: 3, recipe: [0,0,0,0,0,1,0,0,0], reward: 2, copies: 3, starter: true, locked: false, premium: 0 },
  { id: "petite-medaille-d-or", name: "Petite médaille d’or", artisan: 4, recipe: [0,0,0,0,0,0,0,1,0], reward: 2, copies: 3, starter: true, locked: false, premium: 0 },
  { id: "tasse", name: "Tasse", artisan: 0, recipe: [1,0,0,0,0,0,0,0,0], reward: 1, copies: 4, starter: false, locked: false, premium: 0 },
  { id: "kanoun", name: "Kanoun", artisan: 0, recipe: [2,0,0,0,0,0,0,0,0], reward: 2, copies: 4, starter: false, locked: false, premium: 0 },
  { id: "tajine", name: "Tajine", artisan: 0, recipe: [2,1,0,0,0,0,0,0,0], reward: 4, copies: 5, starter: false, locked: false, premium: 0 },
  { id: "jarre-decoree", name: "Jarre décorée", artisan: 0, recipe: [3,1,0,0,0,0,0,0,0], reward: 5, copies: 4, starter: false, locked: false, premium: 1 },
  { id: "plat-a-couscous", name: "Plat à couscous", artisan: 0, recipe: [3,2,0,0,0,0,0,0,0], reward: 7, copies: 3, starter: false, locked: false, premium: 1 },
  { id: "bourse", name: "Bourse", artisan: 1, recipe: [0,0,1,0,0,0,0,0,0], reward: 1, copies: 3, starter: false, locked: false, premium: 0 },
  { id: "portefeuille-double-de-soie", name: "Portefeuille doublé de soie", artisan: 1, recipe: [0,0,2,0,0,0,1,0,0], reward: 4, copies: 3, starter: false, locked: false, premium: 0 },
  { id: "babouches-teintes", name: "Babouches teintes", artisan: 1, recipe: [0,1,2,0,0,0,0,0,0], reward: 4, copies: 4, starter: false, locked: false, premium: 0 },
  { id: "besace-a-boucles", name: "Besace à boucles", artisan: 1, recipe: [0,0,3,0,1,0,0,0,0], reward: 6, copies: 4, starter: false, locked: false, premium: 1 },
  { id: "pouf-teint", name: "Pouf teint", artisan: 1, recipe: [0,1,3,0,0,1,0,0,0], reward: 8, copies: 3, starter: false, locked: false, premium: 1 },
  { id: "jeu-de-dames-echecs", name: "Jeu de dames / échecs", artisan: 2, recipe: [0,0,0,2,0,0,0,0,0], reward: 2, copies: 3, starter: false, locked: false, premium: 0 },
  { id: "petite-table-a-ferrures", name: "Petite table à ferrures", artisan: 2, recipe: [0,0,0,3,1,0,0,0,0], reward: 6, copies: 3, starter: false, locked: false, premium: 0 },
  { id: "coffret-marquete", name: "Coffret marqueté", artisan: 2, recipe: [0,0,0,2,0,0,0,0,1], reward: 5, copies: 3, starter: false, locked: false, premium: 0 },
  { id: "table-marquetee", name: "Table marquetée", artisan: 2, recipe: [0,0,0,3,1,0,0,0,1], reward: 10, copies: 2, starter: false, locked: false, premium: 0 },
  { id: "grand-coffre-marquete", name: "Grand coffre marqueté", artisan: 2, recipe: [0,0,0,3,1,0,0,0,2], reward: 12, copies: 1, starter: false, locked: true, premium: 0 },
  { id: "djellaba-teinte", name: "Djellaba teinte", artisan: 3, recipe: [0,1,0,0,0,2,0,0,0], reward: 6, copies: 3, starter: false, locked: false, premium: 0 },
  { id: "burnous", name: "Burnous", artisan: 3, recipe: [0,0,0,0,0,3,0,0,0], reward: 5, copies: 3, starter: false, locked: false, premium: 0 },
  { id: "caftan", name: "Caftan", artisan: 3, recipe: [0,0,0,0,0,0,3,0,0], reward: 4, copies: 3, starter: false, locked: false, premium: 0 },
  { id: "caftan-brode-de-soie", name: "Caftan brodé de soie", artisan: 3, recipe: [0,1,0,0,0,0,3,1,0], reward: 8, copies: 2, starter: false, locked: false, premium: 1 },
  { id: "takchita", name: "Takchita", artisan: 3, recipe: [0,2,0,0,0,0,4,0,0], reward: 10, copies: 1, starter: false, locked: false, premium: 1 },
  { id: "bague-en-or", name: "Bague en or", artisan: 4, recipe: [0,0,0,0,0,0,0,1,0], reward: 2, copies: 3, starter: false, locked: false, premium: 0 },
  { id: "broche-en-or-emaille", name: "Broche en or émaillé", artisan: 4, recipe: [0,1,0,0,0,0,0,2,0], reward: 5, copies: 3, starter: false, locked: false, premium: 0 },
  { id: "pendentif-or-et-nacre", name: "Pendentif or et nacre", artisan: 4, recipe: [0,0,0,0,0,0,0,1,1], reward: 5, copies: 2, starter: false, locked: true, premium: 0 },
  { id: "bracelet-en-or", name: "Bracelet en or", artisan: 4, recipe: [0,0,0,0,0,0,0,2,0], reward: 3, copies: 2, starter: false, locked: false, premium: 0 },
  { id: "collier-or-et-nacre", name: "Collier or et nacre", artisan: 4, recipe: [0,0,0,0,0,0,0,2,2], reward: 9, copies: 1, starter: false, locked: true, premium: 0 },
];

export const SEAT_COLORS = [
  { id: "bleu", name: "Bleu", hex: "#0072b2", initial: "B" },
  { id: "orange", name: "Orange", hex: "#e69f00", initial: "O" },
  { id: "vert", name: "Vert", hex: "#009e73", initial: "V" },
  { id: "rose", name: "Rose", hex: "#cc79a7", initial: "R" },
];

export const HAND_LIMIT = 10;
export const ACTIVE_LIMIT = 3;
export const RIVER_SIZE = 5;
export const MARKET_CARDS = 3;
export const THRESHOLD = 7;
export const MAJORITY_BONUS = 2;
export const ACTIVE_PENALTY = 2;
export const STARTERS_PER_PLAYER = 2;
export const INITIAL_HAND = 5;
