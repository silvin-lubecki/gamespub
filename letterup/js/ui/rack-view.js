// Chevalet (LU-10, DESIGN.md §10.1). Aucun accès au DOM hors de renderRack.
import { JOKER } from '../engine/index.js';

export const identityOrder = (n) => [...Array(n).keys()];

/** Mélange de Fisher–Yates d'une copie. L'ordre est purement local (jamais envoyé au moteur) ; il est
 * réinitialisé après chaque changement de partie, le contenu du chevalet ayant changé. */
export function shuffleOrder(order, random = Math.random) {
  const out = [...order];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Rend le chevalet. `rack` : lettres ; `order` : rackIndex dans l'ordre d'affichage ; `placed` : Set de rackIndex posés
 * sur le plateau ; `selected` : rackIndex ou null ; `discard` : rackIndex[] marqués pour défausse ou null.
 */
export function renderRack(container, { rack, order, placed = new Set(), selected = null, discard = null, disabled = false }) {
  const wrap = document.createElement('div');
  wrap.className = 'rack';
  for (const i of order) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'rack-tile';
    tile.dataset.rackIndex = String(i);
    tile.disabled = disabled;
    const name = rack[i] === JOKER ? 'Joker' : `Lettre ${rack[i]}`;
    tile.textContent = rack[i] === JOKER ? '★' : rack[i];
    const states = [placed.has(i) && 'posée', discard?.includes(i) && 'à défausser'].filter(Boolean);
    tile.setAttribute('aria-label', [name, ...states].join(', '));
    tile.setAttribute('aria-pressed', String(selected === i));
    if (placed.has(i)) tile.classList.add('is-placed');
    if (selected === i) tile.classList.add('is-selected');
    if (discard?.includes(i)) tile.classList.add('is-discard');
    wrap.append(tile);
  }
  const shuffle = document.createElement('button');
  shuffle.type = 'button';
  shuffle.className = 'btn-icon';
  shuffle.dataset.action = 'shuffle';
  shuffle.textContent = '🔀 Mélanger';
  wrap.append(shuffle);
  container.replaceChildren(wrap);
  return wrap;
}
