// RDC-06 (DESIGN.md §7.2) : panneau Marché. Logique du compositeur d'offre (fonctions pures, sans DOM) et rendu HTML
// (chaînes). Tout est calculé depuis la vue filtrée d'un siège (`view`) : les mains adverses ne sont jamais lues (H2).
import { ARTISANS, CATALOG, RESOURCES, SEAT_COLORS } from '../engine/catalog.js';
import { currentSeat, hasCards } from '../engine/index.js';
import { ASSETS } from './asset-map.js';
import { esc, img } from './cards.js';
import { offerText, recipientOf } from './messages.js';

const NRES = RESOURCES.length;
const zeros = () => new Array(NRES).fill(0);
const sum = (counts) => counts.reduce((a, b) => a + b, 0);

/** Compositeur vide : `key` (tour du Marché) permet de détecter un autre Marché ; `to` : partenaire visé (actif seulement). */
export const emptyComposer = () => ({ key: null, to: null, give: zeros(), want: zeros() });

/** Nombre de cartes de chaque ressource dans ma main. */
export function handCounts(view) {
  const counts = zeros();
  for (const r of view.players[view.you].hand) counts[r]++;
  return counts;
}

const isActive = (view) => currentSeat(view) === view.you;

/** Cible effective du compositeur : le partenaire choisi si je suis l'actif, sinon l'actif. */
export const targetOf = (c, view) => (isActive(view) ? c.to : currentSeat(view));

/** Plafonne `give` par ma main et `want` par le nombre de cartes de la cible. */
function clamp(c, view) {
  const mine = handCounts(view);
  const give = c.give.map((n, r) => Math.min(n, mine[r]));
  let room = view.players[targetOf(c, view)].handCount;
  const want = c.want.map((n) => {
    const kept = Math.min(n, room);
    room -= kept;
    return kept;
  });
  return { ...c, give, want };
}

/** Recale le compositeur sur la vue : remis à zéro hors Marché ou si le Marché a changé, cible et plafonds revalidés. */
export function syncComposer(c, view) {
  if (view.phase !== 'market') return emptyComposer();
  let next = c.key === view.turn ? c : { ...emptyComposer(), key: view.turn };
  if (isActive(view) && (next.to === null || next.to === view.you)) next = { ...next, to: (view.you + 1) % 4 };
  if (!isActive(view)) next = { ...next, to: null };
  return clamp(next, view);
}

/** Choisit le partenaire (actif seulement). */
export const setTarget = (c, view, seat) => (isActive(view) && seat !== view.you ? clamp({ ...c, to: seat }, view) : c);

/** Ajoute `delta` (±1) à la ressource `r` de la colonne `side` ('give' | 'want'), dans les bornes. */
export function stepComposer(c, view, side, r, delta) {
  const col = c[side].slice();
  col[r] = Math.max(0, col[r] + delta);
  return clamp({ ...c, [side]: col }, view);
}

/** « Don » : ne rien demander en échange. */
export const giftComposer = (c) => ({ ...c, want: zeros() });

export const resetComposer = (c) => ({ ...c, give: zeros(), want: zeros() });

/** Contre-proposition : l'offre inversée (je donne ce qu'on me demandait, je demande ce qu'on m'offrait). */
export function counterComposer(offer, view) {
  return clamp({ key: view.turn, to: isActive(view) ? offer.by : null, give: offer.want.slice(), want: offer.give.slice() }, view);
}

/** Action `offer` du compositeur, ou null si l'offre est vide. `to` seulement pour l'actif (sinon le moteur le refuserait). */
export function offerAction(c, view) {
  if (sum(c.give) + sum(c.want) === 0) return null;
  const action = { type: 'offer', give: c.give.slice(), want: c.want.slice() };
  if (isActive(view)) action.to = c.to;
  return action;
}

/** Puis-je honorer `offer` (le destinataire donne `want`) ? Calculé sur ma propre main. */
export const canAccept = (view, offer) => hasCards(view.players[view.you].hand, offer.want);

/** Fiche Ressources : par ressource, cartes dans le jeu, commandes normales (hors Départ) qui la demandent, artisans concernés. */
export function resourceSheet() {
  return RESOURCES.map((res, r) => {
    const orders = CATALOG.filter((o) => !o.starter && o.recipe[r] > 0);
    const trades = [...new Set(orders.map((o) => ARTISANS[o.artisan].trade))];
    return { resource: res, cards: res.count, orders: orders.length, trades };
  });
}

const resIcon = (r, cls = '') => img(ASSETS.resource[RESOURCES[r].id], RESOURCES[r].name, cls);
const seatChip = (seat) => `<span class="seat-chip" style="background:${SEAT_COLORS[seat].hex}">${SEAT_COLORS[seat].initial}</span>`;

function needs(view, seat) {
  const wanted = new Set(view.players[seat].active.flatMap((o) => CATALOG[o.type].recipe.flatMap((n, r) => (n > 0 ? [r] : []))));
  return [...wanted].sort((a, b) => a - b);
}

function tabs(view, c) {
  return `<div class="market-tabs" role="tablist" aria-label="Partenaire">${[1, 2, 3].map((k) => {
    const seat = (view.you + k) % 4;
    const p = view.players[seat];
    const orders = p.active.map((o) => CATALOG[o.type].name).join(', ') || 'aucune commande';
    return `<button type="button" class="market-tab${c.to === seat ? ' is-selected' : ''}" role="tab" aria-selected="${c.to === seat}" data-act="offer-to" data-seat="${seat}" title="${esc(orders)}">`
      + `<span class="tab-name">${seatChip(seat)}${esc(p.name)} · ${p.handCount} cartes</span>`
      + `<span class="tab-needs" aria-label="Cherche">${needs(view, seat).map((r) => resIcon(r, 'mini-icon')).join('')}</span></button>`;
  }).join('')}</div>`;
}

function column(c, view, side, label, capRoom, mine) {
  const cells = RESOURCES.map((res, r) => {
    const n = c[side][r];
    const plusOff = side === 'give' ? n >= mine[r] : capRoom <= 0;
    const step = (delta, off, text, cls) => `<button type="button" class="${cls}" data-act="step" data-side="${side}" data-r="${r}" data-delta="${delta}"`
      + `${off ? ' disabled' : ''} aria-label="${delta > 0 ? 'Ajouter' : 'Retirer'} ${esc(res.name)} (${label})">${text}</button>`;
    return `<div class="cell${n > 0 ? ' has-count' : ''}" data-r="${r}">`
      + step(1, plusOff, `${resIcon(r)}<span class="cell-name">${esc(res.name)}</span><b class="cell-count">${n}</b>`, 'cell-main')
      + step(-1, n <= 0, '−', 'cell-minus') + '</div>';
  }).join('');
  return `<div class="composer-row" data-side="${side}"><span class="composer-label">${label}</span><div class="cells">${cells}</div></div>`;
}

function offerRow(view, offer) {
  const active = currentSeat(view);
  const recipient = recipientOf(offer, active);
  const name = (s) => view.players[s].name;
  const toMe = recipient === view.you;
  let buttons = '';
  if (toMe) {
    const ok = canAccept(view, offer);
    buttons = `<button type="button" class="btn" data-act="accept" data-offer="${esc(offer.id)}"${ok ? '' : ' disabled'}>Accepter</button>`
      + `<button type="button" class="btn" data-act="decline" data-offer="${esc(offer.id)}">Refuser</button>`
      + `<button type="button" class="btn" data-act="counter" data-offer="${esc(offer.id)}">Contre-proposer</button>`
      + (ok ? '' : '<small class="hint">Acceptation impossible</small>');
  } else if (offer.by === view.you) {
    buttons = `<button type="button" class="btn" data-act="cancel" data-offer="${esc(offer.id)}">Annuler</button>`;
  }
  return `<li class="offer${toMe ? ' is-to-me' : ''}" data-offer="${esc(offer.id)}">`
    + `<span class="offer-text">${seatChip(offer.by)}<b>${esc(name(offer.by))}</b> → <b>${esc(name(recipient))}</b> : ${esc(offerText(offer))}</span>`
    + (buttons ? `<span class="offer-buttons">${buttons}</span>` : '') + '</li>';
}

function sheetTable() {
  const rows = resourceSheet().map((row) => `<tr><td>${resIcon(RESOURCES.indexOf(row.resource), 'mini-icon')}${esc(row.resource.name)}</td>`
    + `<td>${row.cards}</td><td>${row.orders}</td><td>${esc(row.trades.join(', '))}</td></tr>`).join('');
  return '<table class="sheet"><thead><tr><th>Ressource</th><th>Cartes</th><th>Commandes</th><th>Artisans</th></tr></thead>'
    + `<tbody>${rows}</tbody></table><p class="hint">Commandes normales (hors Départ) qui demandent la ressource.</p>`;
}

/** Panneau Marché : `ui` = { offer: compositeur, sheet: bool }. */
export function renderMarketPanel(view, ui) {
  const active = currentSeat(view);
  const activeName = esc(view.players[active].name);
  const head = `<header class="market-head"><h3>Marché de ${activeName}</h3>`
    + `<span class="hint">Les échanges se font uniquement avec ${activeName}</span>`
    + `<button type="button" class="icon-btn" id="btn-res-sheet" data-act="res-sheet" aria-label="Fiche Ressources" title="Fiche Ressources">i</button></header>`;
  if (ui.sheet) {
    return `<section class="market-panel">${head}${sheetTable()}<button type="button" class="btn" data-act="res-sheet">Retour au Marché</button></section>`;
  }
  const c = ui.offer ?? syncComposer(emptyComposer(), view);
  const target = targetOf(c, view);
  const mine = handCounts(view);
  const capRoom = view.players[target].handCount - sum(c.want);
  const action = offerAction(c, view);
  const composer = `<div class="composer" aria-label="Composer une offre pour ${esc(view.players[target].name)}">`
    + column(c, view, 'give', 'Je donne', 0, mine) + column(c, view, 'want', 'Je demande', capRoom, mine)
    + '<div class="composer-actions">'
    + `<button type="button" class="btn" data-act="gift"${sum(c.give) > 0 ? '' : ' disabled'}>Don</button>`
    + `<button type="button" class="btn" data-act="reset-offer"${action ? '' : ' disabled'}>Réinitialiser</button>`
    + `<button type="button" class="btn btn-primary" id="btn-propose" data-act="propose"${action ? '' : ' disabled'}>Proposer à ${esc(view.players[target].name)}</button></div></div>`;
  const open = (view.market?.offers ?? []).filter((o) => o.status === 'open');
  const offers = `<ul class="offers" aria-label="Offres en cours">${open.length ? open.map((o) => offerRow(view, o)).join('') : '<li class="hint">Aucune offre en cours.</li>'}</ul>`;
  return `<section class="market-panel">${head}${isActive(view) ? tabs(view, c) : ''}${composer}${offers}</section>`;
}
