// Rendu HTML de l'écran Partie et de l'écran Fin (DESIGN §8.4) : fonctions pures, sans DOM. Les attributs `data-*` sont le
// contrat avec les gestes (game-screen.js, drag.js) et avec l'e2e : tuile `[data-tile=ID][data-zone=rack|table]`,
// combinaison `.set[data-set=i][data-drop=set]`, zones `[data-drop=new|rack]`, boutons `[data-act]`.
import { esc } from '../../common/ui/svg.js';
import { INITIAL_MELD } from '../engine/index.js';
import { isDirty, legalSetTarget, locked, myTurn, orderSet, placedThisTurn, summary } from './draft.js';
import { tileLabel, tileSvg } from './tile-svg.js';

const REASONS = { rummikub: 'Rummikub !', blocked: 'Partie bloquée' };

const tileHtml = (id, { zone, setIndex, d, view, last, small }) => {
  const sel = d.selected.includes(id);
  const attrs = [
    'type="button"', `class="tile${small ? ' small' : ''}"`, `data-tile="${id}"`, `data-zone="${zone}"`,
    setIndex === undefined ? '' : `data-set="${setIndex}"`,
    placedThisTurn(d, id) ? 'data-new' : '',
    last?.has(id) ? 'data-last' : '', locked(d, view, id) ? 'data-locked' : '',
    `aria-pressed="${sel}"`, `aria-label="${esc(tileLabel(id))}"`,
  ].filter(Boolean).join(' ');
  return `<button ${attrs}>${tileSvg(id)}</button>`;
};

const players = (view) => view.names.map((name, i) => {
  const cur = view.phase === 'play' && i === view.current;
  return `<li class="player${cur ? ' is-current' : ''}${i === view.you ? ' is-you' : ''}" data-player="${i}">`
    + `<span class="player-name">${esc(name)}</span> <span class="player-count" title="Tuiles au chevalet">${view.counts[i]}</span>`
    + `${view.melded[i] ? ' <span class="player-melded" title="A posé">✓</span>' : ''}</li>`;
}).join('');

/** Écran Partie. `ui` : { lastPlayed: Set, lastMsg: string }. */
export function gameHtml(view, d, ui = {}) {
  const mine = myTurn(view);
  const s = summary(view, d);
  const last = ui.lastPlayed ?? new Set();
  const hasSel = d.selected.length > 0;
  const selOnRack = d.selected.every((id) => d.rack.includes(id));
  const sets = d.sets.map((set, i) => {
    const ok = s.setStates[i].valid;
    const tiles = orderSet(set).map((id) => tileHtml(id, { zone: 'table', setIndex: i, d, view, last })).join('');
    const slot = mine && hasSel && legalSetTarget(d, view, i) ? `<button type="button" class="drop-slot" data-drop="set" data-set="${i}" aria-label="Ajouter à cette combinaison">+</button>` : '';
    return `<div class="set ${ok ? 'is-valid' : 'is-invalid'}" data-set="${i}" data-drop="set" data-valid="${ok}" role="group" aria-label="Combinaison ${i + 1} : ${ok ? 'valide' : 'à corriger'}">${tiles}${slot}</div>`;
  }).join('');
  const newZone = mine ? '<button type="button" class="new-set" data-drop="new">Nouvelle combinaison</button>' : '';
  const rackBack = hasSel && !selOnRack ? '<button type="button" class="drop-slot" data-drop="rack" aria-label="Remettre au chevalet">↩</button>' : '';
  const rack = d.rack.map((id) => tileHtml(id, { zone: 'rack', d, view })).join('');
  const msg = mine ? 'À vous de jouer' : `${esc(view.names[view.current])} joue…`;
  const meld = mine && !view.melded[view.you]
    ? `<span class="meld-sum${s.meldValue >= INITIAL_MELD ? ' is-ok' : ''}">Première pose : ${s.meldValue} / ${INITIAL_MELD}</span>` : '';
  const draw = view.poolSize > 0 ? { act: 'draw', label: 'Piocher' } : { act: 'pass', label: 'Passer' };
  return `<div class="rum-game" data-turn="${mine ? 'mine' : 'other'}" data-you="${view.you}">`
    + `<header class="topbar"><ul class="players">${players(view)}</ul>`
    + `<span class="pool">Pioche : ${view.poolSize}</span>`
    + '<button type="button" class="btn secondary" data-act="rules">Règles</button>'
    + '<button type="button" class="btn secondary" data-act="quit">Quitter</button></header>'
    + `<section class="table" aria-label="Table">${sets}${newZone}</section>`
    + `<div class="actions"><span class="status" role="status">${msg}${ui.lastMsg ? ` <span class="last-msg">${esc(ui.lastMsg)}</span>` : ''}</span>${meld}`
    + `<button type="button" class="btn secondary" id="btn-undo" data-act="undo"${mine && isDirty(d) ? '' : ' disabled'}>Annuler</button>`
    + `<button type="button" class="btn" id="btn-validate" data-act="validate"${s.canValidate ? '' : ' disabled'}>Valider</button>`
    + `<button type="button" class="btn" id="btn-draw" data-act="${draw.act}"${mine ? '' : ' disabled'}>${draw.label}</button></div>`
    + `<section class="rack-area"><div class="rack" data-drop="rack" style="--cols:${Math.max(1, Math.ceil((d.rack.length + (rackBack ? 1 : 0)) / 2))}" aria-label="Votre chevalet">${rack}${rackBack}</div>`
    + '<div class="sorts"><button type="button" class="btn secondary" id="btn-sort-group" data-act="sort-group">Trier 7-7-7</button>'
    + '<button type="button" class="btn secondary" id="btn-sort-run" data-act="sort-run">Trier 7-8-9</button></div></section></div>';
}

/** Écran Fin : vainqueur, scores, chevalets révélés ; `aiStats` : { n, median, p95, max } (ms) si des coups d'IA ont été calculés ici. */
export function endHtml(view, aiStats = null) {
  const rows = view.names.map((name, i) => {
    const total = view.racks?.[i]?.length ?? 0;
    const tiles = (view.racks?.[i] ?? []).map((id) => `<span class="tile small" data-tile="${id}">${tileSvg(id)}</span>`).join('');
    const sc = view.scores[i];
    return `<tr data-player="${i}"><th scope="row">${esc(name)}${i === view.winner ? ' 🏆' : ''}</th>`
      + `<td class="score">${sc > 0 ? '+' : ''}${sc}</td><td><div class="end-rack" data-player="${i}" aria-label="Chevalet de ${esc(name)} : ${total} tuile(s)">${tiles || '<em>vide</em>'}</div></td></tr>`;
  }).join('');
  const ms = (x) => `${Math.round(x)} ms`;
  const stats = aiStats && aiStats.n > 0
    ? `<details class="ai-stats"><summary>Temps de réflexion de l’IA</summary><p>${aiStats.n} coups : médiane ${ms(aiStats.median)}, p95 ${ms(aiStats.p95)}, max ${ms(aiStats.max)}.</p></details>` : '';
  return `<h2>Victoire de ${esc(view.names[view.winner])}</h2><p class="reason">${REASONS[view.reason] ?? ''}</p>`
    + `<table class="scores"><thead><tr><th>Joueur</th><th>Score</th><th>Chevalet</th></tr></thead><tbody>${rows}</tbody></table>${stats}`;
}
