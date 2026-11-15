// Tuiles en SVG (DESIGN §8.4) : fonctions pures, sans DOM. Chiffre coloré sur fond ivoire, plus un symbole par couleur
// pour le daltonisme (● noir, ◆ rouge, ▲ bleu, ■ orange). Le joker est un visage géométrique original.
import { el, svg } from '../../common/ui/svg.js';
import { COLORS, colorOf, isJoker, numOf } from '../engine/tiles.js';

export const IVORY = '#fffbea';
/** Encres : noir, rouge, bleu, orange (foncé pour le contraste sur l'ivoire). */
export const TILE_INK = ['#1f1f1f', '#c62828', '#1565c0', '#b34700'];
export const SYMBOLS = ['●', '◆', '▲', '■'];

const W = 40, H = 56;

/** Symbole de couleur en formes SVG (indépendant des polices), centré en (20, 45). */
const symbol = (color, ink) => {
  switch (color) {
    case 0: return el('circle', { cx: 20, cy: 45, r: 5, fill: ink });
    case 1: return el('polygon', { points: '20,39 26,45 20,51 14,45', fill: ink });
    case 2: return el('polygon', { points: '20,39 26,50 14,50', fill: ink });
    default: return el('rect', { x: 15, y: 40, width: 10, height: 10, fill: ink });
  }
};

const frame = () => el('rect', { x: 1, y: 1, width: W - 2, height: H - 2, rx: 6, fill: IVORY, stroke: '#8d8468', 'stroke-width': 1.5 });

/** « rouge 7 » ou « joker » : texte de lecteur d'écran et de test. */
export const tileLabel = (id) => (isJoker(id) ? 'joker' : `${COLORS[colorOf(id)]} ${numOf(id)}`);

/** Joker : disque en quatre quadrants de couleur, yeux en triangle, sourire en arc. */
export function jokerSvg() {
  const quad = (d, fill) => el('path', { d, fill });
  return svg({ w: W, h: H, role: 'img', 'aria-label': 'joker', focusable: 'false' }, [
    frame(),
    quad('M20 26 L20 10 A16 16 0 0 1 36 26 Z', TILE_INK[2]),
    quad('M20 26 L36 26 A16 16 0 0 1 20 42 Z', TILE_INK[3]),
    quad('M20 26 L20 42 A16 16 0 0 1 4 26 Z', TILE_INK[1]),
    quad('M20 26 L4 26 A16 16 0 0 1 20 10 Z', TILE_INK[0]),
    el('polygon', { points: '12,19 18,19 15,25', fill: IVORY }),
    el('polygon', { points: '22,19 28,19 25,25', fill: IVORY }),
    el('path', { d: 'M12 31 Q20 38 28 31', fill: 'none', stroke: IVORY, 'stroke-width': 2.5, 'stroke-linecap': 'round' }),
  ]);
}

/** Tuile numérotée ou joker, `viewBox` 0 0 40 56. */
export function tileSvg(id) {
  if (isJoker(id)) return jokerSvg();
  const color = colorOf(id);
  const ink = TILE_INK[color];
  return svg({ w: W, h: H, role: 'img', 'aria-label': tileLabel(id), focusable: 'false' }, [
    frame(),
    el('text', { x: 20, y: 32, 'text-anchor': 'middle', 'font-size': 26, 'font-weight': 700, 'font-family': 'system-ui, sans-serif', fill: ink }, String(numOf(id))),
    symbol(color, ink),
  ]);
}

/** Rapport de contraste WCAG entre deux couleurs `#rrggbb`. */
export function contrastRatio(a, b) {
  const lum = (hex) => {
    const [r, g, bl] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
