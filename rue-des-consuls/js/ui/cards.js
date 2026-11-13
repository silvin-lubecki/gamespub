// RDC-03 (DESIGN.md §10.4) : faces de cartes en HTML (chaînes, sans DOM ni innerHTML de données utilisateur).
// Les noms viennent du catalogue ; tout texte est tout de même échappé. Styles : section « cartes » de css/app.css.
import { CATALOG, RESOURCES, ARTISANS } from '../engine/catalog.js';
import { ASSETS } from './asset-map.js';

/** Couleurs des métiers (reprises du kit imprimé, boardgame data.go). */
export const TRADE_COLORS = {
  potier: '#a64a2d',
  maroquiniere: '#79462c',
  ebeniste: '#396a4f',
  couturiere: '#6c4a7b',
  orfevre: '#956f1f',
};

// Résolution depuis ce module : valable depuis index.html, dev/gallery.html et sous n'importe quel sous-chemin.
const ROOT = new URL('../../', import.meta.url);
const assetUrl = (rel) => new URL(rel, ROOT).href;

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]);
export const img = (rel, alt, cls = '') =>
  `<img${cls ? ` class="${cls}"` : ''} src="${esc(assetUrl(rel))}" alt="${esc(alt)}" decoding="async">`;

const artisanOf = (order) => ARTISANS[order.artisan];
const lockedOrders = (artisan) => CATALOG.filter((o) => ARTISANS[o.artisan] === artisan && o.locked);
const premiumOrders = (artisan) => CATALOG.filter((o) => ARTISANS[o.artisan] === artisan && o.premium > 0);

function recipeHtml(order) {
  const parts = order.recipe.flatMap((qty, i) => {
    if (!qty) return [];
    const r = RESOURCES[i];
    const icons = Array.from({ length: qty }, () => img(ASSETS.resource[r.id], '', 'recipe-icon')).join('');
    return [`<span class="recipe-item" role="img" aria-label="${qty} × ${esc(r.name)}" title="${qty} × ${esc(r.name)}">${icons}</span>`];
  });
  return `<div class="card-recipe">${parts.join('')}</div>`;
}

/** Face d'une commande. `renowned` : l'artisan est Renommé (prime visible, cadenas levé). */
export function orderCard(order, { renowned = false } = {}) {
  const artisan = artisanOf(order);
  const reward = order.reward + (renowned ? order.premium : 0);
  const badges = [];
  if (order.starter) badges.push('<span class="badge badge-starter">Départ</span>');
  if (order.premium > 0) {
    badges.push(`<span class="badge badge-premium${renowned ? ' is-active' : ''}">+${order.premium} DH Renommé</span>`);
  }
  if (order.locked) {
    badges.push(`<span class="badge badge-locked${renowned ? ' is-open' : ''}">${renowned ? '🔓' : '🔒'} Renommé requis</span>`);
  }
  return `<article class="card card-order" data-id="${esc(order.id)}" style="--trade:${TRADE_COLORS[artisan.id]}">`
    + `<header class="card-band">${img(ASSETS.icon[artisan.id], artisan.trade, 'card-emblem')}`
    + `<span class="card-trade" title="${esc(artisan.trade)}">${esc(artisan.trade)}</span><span class="card-reward">${reward} DH</span></header>`
    + `<div class="card-badges">${badges.join('')}</div>`
    + `<div class="card-art">${img(ASSETS.order[order.id], order.name)}</div>`
    + `<h3 class="card-name">${esc(order.name)}</h3>${recipeHtml(order)}</article>`;
}

/** Face d'une carte Ressource. */
export function resourceCard(resource) {
  return `<article class="card card-resource" data-id="${esc(resource.id)}">`
    + `<div class="card-art">${img(ASSETS.resource[resource.id], resource.name)}</div>`
    + `<h3 class="card-name">${esc(resource.name)}</h3></article>`;
}

/**
 * Carte d'un artisan, face Établi ou Renommé.
 * `queue` : une entrée par case occupée, `{ hex, initial }` (couleur du siège + initiale pour les daltoniens).
 */
export function artisanCard(artisan, { renowned = false, queue = [] } = {}) {
  const face = renowned ? 'renomme' : 'etabli';
  const title = renowned ? `${artisan.feminine ? 'Maâlma' : 'Maâlem'} ${artisan.name}` : artisan.name;
  const slots = Array.from({ length: artisan.capacity }, (_, k) => {
    const cube = queue[k]
      ? `<span class="cube" style="background:${esc(queue[k].hex)}">${esc(queue[k].initial)}</span>`
      : '';
    return `<li class="slot"><span class="slot-n">${k + 1}</span>${cube}</li>`;
  }).join('');
  const names = (list) => list.map((o) => o.name).join(', ');
  const locked = lockedOrders(artisan);
  const premium = premiumOrders(artisan);
  const notes = [];
  if (renowned) {
    if (premium.length) notes.push(`+1 DH : ${esc(names(premium))}`);
    if (locked.length) notes.push(`Autorise : ${esc(names(locked))}`);
  } else if (locked.length) {
    notes.push(`🔒 Renommé requis : ${esc(names(locked))}`);
  }
  return `<article class="card card-artisan${renowned ? ' is-renowned' : ''}" data-id="${esc(artisan.id)}" data-face="${face}" style="--trade:${TRADE_COLORS[artisan.id]}">`
    + `<div class="card-portrait">${img(ASSETS.artisan[artisan.id][face], `${artisan.trade} ${artisan.name}`)}</div>`
    + `<header class="card-band">${img(ASSETS.icon[artisan.id], '', 'card-emblem')}`
    + `<span class="card-titles"><span class="card-trade">${esc(title)}</span>`
    + `<span class="card-sub">${esc(artisan.trade)} · ${renowned ? 'Renommé ★' : 'Établi'}</span></span></header>`
    + `<ol class="card-queue" aria-label="File d'attente (${artisan.capacity} places)">${slots}</ol>`
    + (notes.length ? `<p class="card-note">${notes.join('<br>')}</p>` : '')
    + '</article>';
}

const BACKS = { resource: 'backResource', order: 'backOrder', starter: 'backStarter' };
const BACK_LABELS = { resource: 'Dos Ressources', order: 'Dos Commandes', starter: 'Dos Commandes Départ' };

/** Dos de carte : `kind` = 'resource' | 'order' | 'starter'. */
export function cardBack(kind) {
  if (!BACKS[kind]) throw new RangeError(`dos inconnu : ${kind}`);
  return `<article class="card card-back" data-kind="${kind}">${img(ASSETS.misc[BACKS[kind]], BACK_LABELS[kind])}</article>`;
}
