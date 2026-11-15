// Tuiles du Rummikub (DESIGN §8.2) : identifiants 0 à 105. id < 104 ⇒ couleur = id % 4 (noir, rouge, bleu, orange),
// nombre = ((id >> 2) % 13) + 1, exemplaire = id ≥ 52 ; 104 et 105 sont les jokers.
export const TILE_COUNT = 106;
export const JOKERS = [104, 105];
export const COLORS = ['noir', 'rouge', 'bleu', 'orange'];
export const JOKER_VALUE = 30;
export const ALL_TILES = Array.from({ length: TILE_COUNT }, (_, i) => i);

export const isJoker = (id) => id === 104 || id === 105;
export const isTile = (id) => Number.isInteger(id) && id >= 0 && id < TILE_COUNT;
export const colorOf = (id) => id % 4;
export const numOf = (id) => ((id >> 2) % 13) + 1;
/** Tuile naturelle → { color, num, copy } ; joker → { joker: true }. */
export const tileOf = (id) => (isJoker(id) ? { joker: true } : { color: colorOf(id), num: numOf(id), copy: id >= 52 ? 1 : 0 });
/** Identifiant de la tuile naturelle (couleur, nombre, exemplaire). */
export const idOf = (color, num, copy = 0) => copy * 52 + (num - 1) * 4 + color;
/** Valeur d'une tuile restée au chevalet : le nombre, ou 30 pour un joker (DESIGN §8.1, fin de partie). */
export const tileValue = (id) => (isJoker(id) ? JOKER_VALUE : numOf(id));
export const rackValue = (ids) => ids.reduce((sum, id) => sum + tileValue(id), 0);
