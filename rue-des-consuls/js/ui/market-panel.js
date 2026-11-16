// RDC-06 (DESIGN.md §7.2) : panneau Marché. Logique du compositeur d'offre (fonctions pures, sans DOM) et rendu HTML
// (chaînes). Tout est calculé depuis la vue filtrée d'un siège (`view`) : les mains adverses ne sont jamais lues (H2).
import { ARTISANS, CATALOG, RESOURCES, SEAT_COLORS } from '../engine/catalog.js';
import { currentSeat, hasCards } from '../engine/index.js';
import { ASSETS } from './asset-map.js';
import { esc, img } from './cards.js';
import { offerText, recipientOf } from './messages.js';
import { SHEET_TEXT } from './sheet-text.js';

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

const normalOrders = () => CATALOG.filter((o) => !o.starter);
const copiesOf = (orders) => orders.reduce((a, o) => a + o.copies, 0);

/**
 * Fiche Ressources, recto (RDC-12, port de resourcesheet.go) : par ressource, cartes dans le jeu, commandes normales
 * (somme des copies, hors Départ) qui la demandent, artisans concernés (ordre des artisans) et phrase d'usage.
 * Triée par nombre de cartes décroissant (tri stable).
 */
export function resourceSheet(text = SHEET_TEXT.resources) {
  return RESOURCES.map((res, r) => {
    const orders = normalOrders().filter((o) => o.recipe[r] > 0);
    const artisans = ARTISANS.filter((_, k) => orders.some((o) => o.artisan === k));
    return { index: r, resource: res, cards: res.count, orders: copiesOf(orders), artisans, trades: artisans.map((a) => a.trade), text: text[res.id] };
  }).sort((a, b) => b.cards - a.cards);
}

/** Totaux de l'en-tête du recto : cartes, matières, commandes normales (copies). */
export const sheetSummary = () => ({ cards: sum(RESOURCES.map((r) => r.count)), resources: NRES, orders: copiesOf(normalOrders()) });

export function sheetHeader() {
  const { cards, resources, orders } = sheetSummary();
  return `${cards} cartes · ${resources} matières · ${orders} commandes normales`;
}

/** Longueur de file : ≤ 2 courte, 3 moyenne, ≥ 4 longue. */
export const queueLength = (capacity) => (capacity <= 2 ? 'courte' : capacity === 3 ? 'moyenne' : 'longue');

/** « A », « A et B », « A, B et C ». */
export const frenchList = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`);

/** Objets féminins du catalogue (accord de « débloquée »), comme `feminineObjects` de resourcesheet.go. */
const FEMININE_OBJECTS = new Set(['Porte']);

/** Accorde le participe avec les objets : féminin seulement si tous sont féminins. */
export function agree(participle, objects) {
  const plural = objects.length > 1;
  if (objects.some((o) => !FEMININE_OBJECTS.has(o))) return plural ? `${participle}s` : participle;
  return plural ? `${participle}es` : `${participle}e`;
}

/** Effet de la face Renommé : « Renommé : +1 DH sur X et Y. » / « Renommée : Porte débloquée. ». */
export function renownEffect(artisan, premiums, unlocked) {
  const parts = [];
  if (premiums.length) parts.push(`+1 DH sur ${frenchList(premiums)}`);
  if (unlocked.length) parts.push(`${frenchList(unlocked)} ${agree('débloqué', unlocked)}`);
  return `${artisan.feminine ? 'Renommée' : 'Renommé'} : ${parts.join(' ; ')}.`;
}

/** Fiche Ressources, verso (RDC-12) : par artisan, file, commandes normales (copies), DH min–max, ressources, phrase, Renommé. */
export function tradeSheet(text = SHEET_TEXT.artisans) {
  return ARTISANS.map((artisan, k) => {
    const mine = normalOrders().filter((o) => o.artisan === k);
    const rewards = mine.map((o) => o.reward);
    const resources = RESOURCES.flatMap((_, r) => (mine.some((o) => o.recipe[r] > 0) ? [r] : []));
    const premiums = mine.filter((o) => o.premium > 0).map((o) => o.name);
    const unlocked = mine.filter((o) => o.locked).map((o) => o.name);
    return {
      index: k, artisan, queue: queueLength(artisan.capacity), orders: copiesOf(mine), dh: [Math.min(...rewards), Math.max(...rewards)],
      resources, premiums, unlocked, renown: renownEffect(artisan, premiums, unlocked), text: text[artisan.id],
    };
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

/** Corps de la fiche (RDC-12) : onglet 'resources' (recto) ou 'trades' (verso) ; tout texte passe par `esc`. */
export function sheetHtml(tab, text = SHEET_TEXT) {
  const tabBtn = (id, label) => `<button type="button" class="sheet-tab${tab === id ? ' is-selected' : ''}" role="tab" aria-selected="${tab === id}" data-act="sheet-tab" data-tab="${id}">${label}</button>`;
  const bar = `<div class="sheet-tabs" role="tablist" aria-label="Fiche">${tabBtn('resources', 'Ressources')}${tabBtn('trades', 'Artisans')}`
    + '<button type="button" class="btn" data-act="res-sheet">Retour au Marché</button></div>';
  const artisanIcon = (a) => img(ASSETS.icon[a.id], a.trade, 'mini-icon');
  let body;
  if (tab === 'trades') {
    const rows = tradeSheet(text.artisans).map((t) => `<tr class="sheet-row"><td>${artisanIcon(t.artisan)}${esc(t.artisan.trade)}</td>`
      + `<td>${esc(t.queue)}</td><td>${t.orders}</td><td>${t.dh[0]}–${t.dh[1]}</td><td>${t.resources.map((r) => resIcon(r, 'mini-icon')).join('')}</td></tr>`
      + `<tr class="sheet-blurb"><td colspan="5">${esc(t.text)}<br><b class="sheet-renown">${esc(t.renown)}</b></td></tr>`).join('');
    body = '<p class="sheet-summary">Ce que chaque métier demande et ce qu’il rapporte</p>'
      + '<table class="sheet sheet-trades"><thead><tr><th>Artisan</th><th>File</th><th>Commandes</th><th>DH</th><th>Ressources</th></tr></thead>'
      + `<tbody>${rows}</tbody></table><p class="hint">DH : de la commande normale la moins payée à la mieux payée, sans la prime de renommée.</p>`;
  } else {
    const rows = resourceSheet(text.resources).map((row) => `<tr class="sheet-row"><td>${resIcon(row.index, 'mini-icon')}${esc(row.resource.name)}</td>`
      + `<td>${row.cards}</td><td>${row.orders}</td><td>${row.artisans.map((a) => `${artisanIcon(a)}${esc(a.trade)}`).join(', ')}</td></tr>`
      + `<tr class="sheet-blurb"><td colspan="4">${esc(row.text)}</td></tr>`).join('');
    body = `<p class="sheet-summary">${esc(sheetHeader())}</p>`
      + '<table class="sheet sheet-resources"><thead><tr><th>Ressource</th><th>Cartes</th><th>Commandes</th><th>Artisans</th></tr></thead>'
      + `<tbody>${rows}</tbody></table><p class="hint">Cartes : total du paquet, pas le stock disponible. Commandes : commandes normales qui la demandent (Départ exclues). La rareté n’impose aucun taux de change : négociez selon vos projets !</p>`;
  }
  return `${bar}<div class="sheet-body" role="tabpanel">${body}</div>`;
}

/** Panneau Marché : `ui` = { offer: compositeur, sheet: false | 'resources' | 'trades' (true = 'resources') }. */
export function renderMarketPanel(view, ui) {
  const active = currentSeat(view);
  const activeName = esc(view.players[active].name);
  const head = `<header class="market-head"><h3>Marché de ${activeName}</h3>`
    + `<span class="hint">Les échanges se font uniquement avec ${activeName}</span>`
    + `<button type="button" class="icon-btn" id="btn-res-sheet" data-act="res-sheet" aria-label="Fiche Ressources" title="Fiche Ressources">i</button></header>`;
  if (ui.sheet) {
    return `<section class="market-panel is-sheet">${head}${sheetHtml(ui.sheet === 'trades' ? 'trades' : 'resources')}</section>`;
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
