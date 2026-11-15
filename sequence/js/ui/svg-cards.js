// Rendu SVG des cartes et des jetons de Séquence (DESIGN-plateforme §3 D7, §7.4) : fonctions pures, chaînes SVG, sans DOM.
// Figures originales : couleurs dessinées en formes géométriques (pas de glyphes ♥♦ qui virent en emoji sur iOS),
// couronnes et yeux géométriques. Seuls les rangs sont du texte (police système).
import { el, esc, svg } from '../../common/ui/svg.js';
import { isCard, isJack, isOneEyed } from '../engine/cards.js';

/** Couleur et symbole de chaque équipe (le symbole sert au daltonisme : bleu ●, vert ▲, rouge ■). */
export const TEAM_COLORS = Object.freeze(['#2c5aa0', '#2e8b57', '#c0392b']);
export const TEAM_SYMBOLS = Object.freeze(['circle', 'triangle', 'square']);

export const RANK_LABEL = Object.freeze({ A: 'A', T: '10', J: 'V', Q: 'D', K: 'R' });
const RANK_NAME = { A: 'As', T: '10', J: 'Valet', Q: 'Dame', K: 'Roi' };
export const SUIT_NAME = Object.freeze({ S: 'pique', H: 'cœur', D: 'carreau', C: 'trèfle' });
export const SUIT_COLOR = Object.freeze({ S: '#1d1d24', C: '#1d1d24', H: '#c0392b', D: '#c0392b' });

const label = (rank) => RANK_LABEL[rank] ?? rank;

/** Nom en français : « Dame de cœur », « Valet de carreau (joker) », « Valet de pique (retrait) ». */
export function cardName(card) {
  if (!isCard(card)) throw new Error(`Carte invalide : ${card}`);
  const base = `${RANK_NAME[card[0]] ?? card[0]} de ${SUIT_NAME[card[1]]}`;
  if (!isJack(card)) return base;
  return `${base} (${isOneEyed(card) ? 'retrait' : 'joker'})`;
}

// Formes de couleurs dans un carré [-1, 1] centré sur l'origine.
const SHAPES = {
  H: ['<path d="M0 1 C-1.25 0.1 -1.05 -0.95 -0.5 -0.95 C-0.2 -0.95 0 -0.72 0 -0.4 C0 -0.72 0.2 -0.95 0.5 -0.95 C1.05 -0.95 1.25 0.1 0 1Z"/>'],
  D: ['<path d="M0 -1 L0.72 0 L0 1 L-0.72 0Z"/>'],
  S: ['<path d="M0 -1 C0.3 -0.5 1 -0.2 1 0.3 C1 0.85 0.3 0.9 0.1 0.45 L0.3 1 L-0.3 1 L-0.1 0.45 C-0.3 0.9 -1 0.85 -1 0.3 C-1 -0.2 -0.3 -0.5 0 -1Z"/>'],
  C: ['<circle cx="0" cy="-0.5" r="0.42"/>', '<circle cx="-0.52" cy="0.25" r="0.42"/>', '<circle cx="0.52" cy="0.25" r="0.42"/>', '<path d="M0 0 L0.28 1 L-0.28 1Z"/>'],
};

/** Couleur dessinée, centrée en (x, y), de demi-largeur `r`. */
export function suitShape(suit, { x, y, r }) {
  return el('g', { class: 'suit', 'data-suit': suit, fill: SUIT_COLOR[suit], transform: `translate(${x} ${y}) scale(${r})` }, SHAPES[suit]);
}

const text = (content, a) => el('text', { 'font-family': 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', 'font-weight': 700, ...a }, esc(content));

/** Couronne géométrique : Dame (3 pointes et perle), Roi (5 pointes et croix), Valet (toque). */
export function crown(rank, { x, y, color }) {
  const g = (d, extra = '') => el('g', { class: 'crown', 'data-rank': rank, fill: color, transform: `translate(${x} ${y})` }, `${d}${extra}`);
  if (rank === 'K') return g('<path d="M-11 6 L-13 -6 L-6 0 L0 -9 L6 0 L13 -6 L11 6Z"/>', '<rect x="-1" y="-15" width="2" height="6"/><rect x="-3" y="-13" width="6" height="2"/>');
  if (rank === 'Q') return g('<path d="M-10 6 L-11 -3 L-5 1 L0 -6 L5 1 L11 -3 L10 6Z"/>', '<circle cx="0" cy="-9" r="2.2"/>');
  return g('<path d="M-9 6 C-9 -4 -3 -8 3 -8 C9 -8 10 -2 10 6Z"/>', '<path d="M3 -8 C6 -14 11 -14 13 -11 C9 -11 7 -9 6 -8Z"/>');
}

/** Yeux du valet : deux pour un joker (♦ ♣), un seul pour un retrait (♠ ♥). */
export function eyes(card, { x, y, color }) {
  const eye = (cx) => `<ellipse cx="${cx}" cy="${y}" rx="5" ry="3" fill="#fff" stroke="${color}" stroke-width="1.2"/><circle cx="${cx}" cy="${y}" r="1.7" fill="${color}"/>`;
  const one = isOneEyed(card);
  return el('g', { class: 'eyes', 'data-eyes': one ? 1 : 2 }, one ? eye(x) : eye(x - 7) + eye(x + 7));
}

const FRAME = { fill: '#fffdf8', stroke: '#4a4a55', 'stroke-width': 1.2 };

function fullCard(card) {
  const [rank, suit] = card;
  const color = SUIT_COLOR[suit];
  const index = el('g', {}, [text(label(rank), { x: 6, y: 15, 'font-size': rank === 'T' ? 12 : 14, fill: color }), suitShape(suit, { x: 10.5, y: 23, r: 4.2 })]);
  const face = rank === 'J' || rank === 'Q' || rank === 'K';
  let centre;
  if (!face) centre = suitShape(suit, { x: 31.5, y: 44, r: rank === 'A' ? 16 : 12 });
  else if (rank === 'J') {
    centre = [
      crown('J', { x: 31.5, y: 31, color }),
      eyes(card, { x: 31.5, y: 45, color }),
      text(isOneEyed(card) ? 'Retrait' : 'Joker', { x: 31.5, y: 62, 'font-size': 8, 'text-anchor': 'middle', fill: color }),
      suitShape(suit, { x: 31.5, y: 72, r: 5 }),
    ].join('');
  } else {
    centre = [
      crown(rank, { x: 31.5, y: 32, color }),
      text(label(rank), { x: 31.5, y: 58, 'font-size': 22, 'text-anchor': 'middle', fill: color }),
      suitShape(suit, { x: 31.5, y: 70, r: 6 }),
    ].join('');
  }
  return svg({ w: 63, h: 88, class: 'card card-full', role: 'img', 'aria-label': cardName(card), 'data-card': card }, [
    el('rect', { x: 0.6, y: 0.6, width: 61.8, height: 86.8, rx: 5, ...FRAME }),
    index,
    el('g', { transform: 'rotate(180 31.5 44)' }, index),
    centre,
  ]);
}

function miniCard(card) {
  const [rank, suit] = card;
  return svg({ w: 40, h: 48, class: 'card card-mini', role: 'img', 'aria-label': cardName(card), 'data-card': card }, [
    el('rect', { x: 0.5, y: 0.5, width: 39, height: 47, rx: 3, ...FRAME }),
    text(label(rank), { x: 20, y: 24, 'font-size': rank === 'T' ? 20 : 23, 'text-anchor': 'middle', fill: SUIT_COLOR[suit] }),
    suitShape(suit, { x: 20, y: 36.5, r: 7 }),
  ]);
}

/** Carte en SVG : `size: 'full'` (63×88, main) ou `'mini'` (40×48, plateau). Lève une erreur si la carte est invalide. */
export function cardSvg(card, { size = 'full' } = {}) {
  if (!isCard(card)) throw new Error(`Carte invalide : ${card}`);
  return size === 'mini' ? miniCard(card) : fullCard(card);
}

/** Case « coin libre » (compte pour toutes les équipes) : étoile. */
export function cornerSvg() {
  const pts = Array.from({ length: 10 }, (_, k) => {
    const a = (Math.PI / 5) * k - Math.PI / 2;
    const rad = k % 2 ? 7 : 16;
    return `${(20 + rad * Math.cos(a)).toFixed(1)},${(24 + rad * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
  return svg({ w: 40, h: 48, class: 'card card-corner', role: 'img', 'aria-label': 'Coin libre' }, [
    el('rect', { x: 0.5, y: 0.5, width: 39, height: 47, rx: 3, fill: '#efe7d2', stroke: '#4a4a55', 'stroke-width': 1.2 }),
    el('polygon', { class: 'star', points: pts, fill: '#d4a017', stroke: '#8a6a0a', 'stroke-width': 1 }),
  ]);
}

/** Jeton d'une équipe : disque coloré + symbole (● ▲ ■) dessiné en blanc ; un anneau doré s'il fait partie d'une séquence. */
export function chipSvg(team, { locked = false } = {}) {
  const symbol = [
    el('circle', { class: 'sym', cx: 10, cy: 10, r: 3.6, fill: '#fff' }),
    el('polygon', { class: 'sym', points: '10,5.6 14.6,13.6 5.4,13.6', fill: '#fff' }),
    el('rect', { class: 'sym', x: 6.6, y: 6.6, width: 6.8, height: 6.8, fill: '#fff' }),
  ][team];
  return svg({ w: 20, h: 20, class: `chip chip-${team}${locked ? ' is-locked' : ''}`, 'data-team': team, 'aria-hidden': 'true' }, [
    el('circle', { cx: 10, cy: 10, r: 9, fill: TEAM_COLORS[team], stroke: '#fff', 'stroke-width': 1.2 }),
    symbol,
    locked ? el('circle', { class: 'ring', cx: 10, cy: 10, r: 9.4, fill: 'none', stroke: '#f5c542', 'stroke-width': 1.6 }) : '',
  ]);
}
