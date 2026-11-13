// RDC-05 (DESIGN.md §10.3, §10.4) : rendu HTML (chaînes, sans DOM) de l'écran Partie et de l'écran Fin.
// Tout est calculé depuis la vue filtrée d'un siège : aucune main adverse n'est jamais affichée (H2).
import {
  ACTIVE_LIMIT, ACTIVE_PENALTY, ARTISANS, CATALOG, HAND_LIMIT, RESOURCES, SEAT_COLORS, THRESHOLD,
} from '../engine/catalog.js';
import { canDeposit, currentSeat, day, finalScores, isFriday, legalActions } from '../engine/index.js';
import { POLICY_NAMES } from '../ai/policy.js';
import { ASSETS } from './asset-map.js';
import { artisanCard, esc, img, orderCard, resourceCard, TRADE_COLORS } from './cards.js';
import { renderMarketPanel } from './market-panel.js';
import { DAYS, DAYS_SHORT } from './messages.js';

/** Nombre de cartes de la main au-delà de la limite (les plus anciennes, en tête de main, seront défaussées). */
export const doomedCount = (hand) => Math.max(0, hand.length - HAND_LIMIT);

const isRenowned = (view, order) => view.artisans[CATALOG[order.type].artisan].renowned;
const orderName = (order) => CATALOG[order.type].name;
const btn = (act, label, { disabled = false, hint = '', pressed = null, extra = '' } = {}) =>
  `<button type="button" class="btn" data-act="${act}"${extra}${disabled ? ' disabled' : ''}`
  + `${pressed === null ? '' : ` aria-pressed="${pressed}"`}>${label}</button>${hint ? `<small class="hint">${esc(hint)}</small>` : ''}`;

function topBar(view) {
  const today = day(view);
  const cal = DAYS_SHORT.map((d, i) => `<span class="day${i === today ? ' is-today' : ''}${i === 4 ? ' is-friday' : ''}" title="${DAYS[i]}">${d}</span>`).join('');
  const last = view.endAfterTurn !== null ? '<span class="last-round">Dernier tour de table</span>' : '';
  return `<header class="stage-top"><div class="calendar" aria-label="Jour : ${DAYS[today]}">${cal}</div>`
    + `<span class="turn-name">Tour de <b>${esc(view.players[currentSeat(view)].name)}</b></span>${last}`
    + `<span class="counts" title="Pioches Ressources / défausse, pioche Commandes">pioches ${view.resDrawCount}/${view.resDiscardCount} · commandes ${view.orderDeckCount}</span>`
    + '<span class="top-buttons">'
    + '<button type="button" class="icon-btn" id="btn-rules" data-act="rules" aria-label="Règles" title="Règles">i</button>'
    + '<button type="button" class="icon-btn" id="btn-fullscreen" data-act="fullscreen" aria-label="Plein écran" title="Plein écran">⛶</button>'
    + '<button type="button" class="icon-btn" id="btn-menu" data-act="quit" aria-label="Quitter la partie" title="Quitter la partie">☰</button>'
    + '</span></header>';
}

function opponent(view, seat, ui) {
  const p = view.players[seat];
  const c = SEAT_COLORS[seat];
  const chips = p.active.map((o) => `<li style="--trade:${TRADE_COLORS[ARTISANS[CATALOG[o.type].artisan].id]}">${esc(orderName(o))}</li>`).join('');
  const first = view.first === seat ? img(ASSETS.misc.firstPlayer, 'Premier joueur', 'first-token') : '';
  const bot = ui.seats?.[seat];
  const badge = bot?.bot ? `<span class="bot-badge" title="Joueur piloté par l'IA">IA ${esc(POLICY_NAMES[bot.policy] ?? '')}</span>` : '';
  return `<section class="opponent${seat === currentSeat(view) ? ' is-active' : ''}" data-seat="${seat}">`
    + `<h3><span class="seat-chip" style="background:${c.hex}">${c.initial}</span>${esc(p.name)}${first}</h3>${badge}`
    + `<p>${p.dh} DH · produites ${p.produced.length}/${THRESHOLD}</p><p>${p.handCount} cartes</p>`
    + `<ul class="chips" aria-label="Commandes actives">${chips}</ul></section>`;
}

function artisanRow(view) {
  const friday = isFriday(view);
  return ARTISANS.map((a, i) => {
    const slot = view.artisans[i];
    const queue = slot.queue.map((q) => ({ hex: SEAT_COLORS[q.owner].hex, initial: SEAT_COLORS[q.owner].initial }));
    const visited = view.phase === 'visit' && view.visit.artisan === i;
    return `<div class="artisan-slot${friday ? ' is-closed' : ''}${visited ? ' is-visited' : ''}" data-artisan="${i}" data-zoom>`
      + artisanCard(a, { renowned: slot.renowned, queue }) + (friday ? '<span class="closed-tag">Fermé</span>' : '') + '</div>';
  }).join('');
}

function riverRow(view, ui, canTake) {
  const enabled = canTake && ui.mode === 'take';
  return view.river.map((o, index) => `<button type="button" class="card-btn${enabled ? ' is-selectable' : ''}" data-act="take" data-index="${index}" data-zoom${enabled ? '' : ' aria-disabled="true"'}>`
    + `${orderCard(CATALOG[o.type], { renowned: isRenowned(view, o) })}</button>`).join('');
}

const journal = (ui) => `<ol class="journal" aria-label="Journal">${ui.journal.slice(-10).map((l) => `<li>${esc(l)}</li>`).join('')}</ol>`;

function panel(view, ui, legal) {
  const mine = currentSeat(view) === view.you;
  const types = new Set(legal.map((a) => a.type));
  const friday = isFriday(view);
  let body;
  if (view.phase === 'market') {
    body = `<p class="panel-title">Marché : ressources révélées</p><div class="revealed">${view.market.revealed.map((r) => resourceCard(RESOURCES[r])).join('')}</div>`
      + (mine ? btn('endMarket', 'Terminer le Marché') : '');
    return `<aside class="stage-panel"><div class="actions">${body}</div>${journal(ui)}</aside>`;
  } else if (view.phase === 'visit') {
    body = `<p class="panel-title">Visite chez ${esc(ARTISANS[view.visit.artisan].trade)} ${esc(ARTISANS[view.visit.artisan].name)}</p>`
      + '<p class="hint">Touchez une commande réalisable du même artisan.</p>' + (mine ? btn('endVisit', 'Terminer la visite') : '');
  } else {
    const canTake = types.has('take');
    const canVisit = types.has('deposit');
    const takeHint = canTake ? '' : view.players[view.you].active.length >= ACTIVE_LIMIT ? '3 commandes actives' : 'Rivière vide';
    const visitHint = friday ? 'Artisans fermés' : canVisit ? '' : 'Aucune commande réalisable';
    body = '<p class="panel-title">Votre action</p>'
      + btn('market', 'Marché', { disabled: !mine })
      + btn('mode-take', 'Prendre', { disabled: !mine || !canTake, hint: mine ? takeHint : '', pressed: ui.mode === 'take' })
      + btn('mode-visit', 'Visiter', { disabled: !mine || !canVisit, hint: mine ? visitHint : '', pressed: ui.mode === 'visit' })
      + (ui.mode === 'take' ? '<p class="hint">Touchez une carte de la rivière.</p>' : '')
      + (ui.mode === 'visit' ? '<p class="hint">Touchez une commande réalisable.</p>' : '');
  }
  if (!mine) body = `<p class="panel-title">Au tour de ${esc(view.players[currentSeat(view)].name)}</p>`;
  return `<aside class="stage-panel"><div class="actions">${body}</div>${journal(ui)}</aside>`;
}

function handTiles(view) {
  const hand = view.players[view.you].hand;
  const doomed = doomedCount(hand);
  return hand.map((r, i) => `<li class="res-tile${i < doomed ? ' is-doomed' : ''}" data-zoom data-resource="${r}"`
    + `${i < doomed ? ' title="Défaussée en fin de tour"' : ''}>${img(ASSETS.resource[RESOURCES[r].id], '')}<span>${esc(RESOURCES[r].name)}</span></li>`).join('');
}

function myBar(view, ui, mine) {
  const p = view.players[view.you];
  const c = SEAT_COLORS[view.you];
  const active = p.active.map((o) => {
    const ok = mine && (view.phase === 'visit' || view.phase === 'action') && canDeposit(view, view.you, o.id);
    const enabled = ok && (view.phase === 'visit' || ui.mode === 'visit');
    return `<button type="button" class="card-btn${ok ? ' is-realizable' : ''}${enabled ? ' is-selectable' : ''}" data-act="deposit" data-order="${o.id}" data-zoom${enabled ? '' : ' aria-disabled="true"'}>`
      + `${orderCard(CATALOG[o.type], { renowned: isRenowned(view, o) })}</button>`;
  }).join('');
  return `<footer class="stage-me"><section class="me"><h3><span class="seat-chip" style="background:${c.hex}">${c.initial}</span>${esc(p.name)}</h3>`
    + `<p>${p.dh} DH</p><p>produites ${p.produced.length}/${THRESHOLD}</p>`
    + `${view.first === view.you ? img(ASSETS.misc.firstPlayer, 'Premier joueur', 'first-token') : ''}</section>`
    + `<ul class="hand" aria-label="Main (ancienne à récente, au-delà de ${HAND_LIMIT} : défaussées)">${handTiles(view)}</ul>`
    + `<div class="actives" aria-label="Commandes actives">${active}</div></footer>`;
}

/**
 * Contenu de `#stage` pour `view` ; `ui` = { mode: null | 'take' | 'visit', journal: string[],
 * offer (compositeur), sheet (fiche Ressources), seats ([{ bot, policy }]) }.
 */
export function renderGame(view, ui) {
  const legal = legalActions(view, view.you);
  const mine = currentSeat(view) === view.you;
  const others = [1, 2, 3].map((k) => opponent(view, (view.you + k) % 4, ui)).join('');
  return topBar(view)
    + `<aside class="stage-opponents">${others}</aside>`
    + (view.phase === 'market'
      ? `<section class="stage-center is-market">${renderMarketPanel(view, ui)}</section>`
      : `<section class="stage-center"><div class="artisans-row">${artisanRow(view)}</div>`
        + `<div class="river-row" aria-label="Rivière">${riverRow(view, ui, mine && legal.some((a) => a.type === 'take'))}</div></section>`)
    + panel(view, ui, legal) + myBar(view, ui, mine);
}

/** Écran Fin : tableau DH − pénalités = score, produites, vainqueur(s), récapitulatif du dernier coup (RDC-08). */
export function renderEnd(view, lastMove = []) {
  const { players, winners } = finalScores(view);
  const names = winners.map((s) => esc(view.players[s].name));
  const title = names.length > 1 ? `Victoire partagée : ${names.join(' et ')}` : `Victoire de ${names[0]}`;
  const rows = players.map((r) => `<tr class="${r.rank === 1 ? 'is-winner' : ''}"><td>${r.rank}</td>`
    + `<td><span class="seat-chip" style="background:${SEAT_COLORS[r.seat].hex}">${SEAT_COLORS[r.seat].initial}</span>${esc(view.players[r.seat].name)}</td>`
    + `<td>${r.dh}</td><td>−${r.penalty}</td><td><b>${r.net}</b></td><td>${r.produced}</td></tr>`).join('');
  return `<h2 class="end-title">${title}</h2>`
    + '<table class="scores"><thead><tr><th>Rang</th><th>Joueur</th><th>DH</th>'
    + `<th title="${ACTIVE_PENALTY} DH par commande active">Pénalité</th><th>Score</th><th>Produites</th></tr></thead><tbody>${rows}</tbody></table>`
    + `<p class="hint">Score = DH − ${ACTIVE_PENALTY} × commandes actives ; égalité : plus de commandes produites.</p>`
    + (lastMove.length ? `<h3 class="end-recap-title">Dernier coup</h3><ul class="end-recap">${lastMove.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : '')
    + '<p class="end-buttons"><button type="button" class="btn" data-act="replay">Rejouer</button> '
    + '<button type="button" class="btn" data-act="home">Accueil</button></p>';
}
