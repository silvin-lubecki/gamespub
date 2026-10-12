// Écran Partie (LU-10, DESIGN.md §10.1-10.2) : plateau (LU-09), chevalet, scores, actions, prévisualisation, journal.
// Hypothèses utilisées : H3/H8 (slots surlignés), H9 (fin par sac épuisé), H2 (mottes : poses refusées),
// H10 (Passer en coop), H11 (arbres), H12 (objectif et réserve communs) — voir messages.js et turn-state.js.
// En coop : bouton « Passer » et panneau d'objectif commun ; « Renouveler » est masqué.
import { COOP_MAX_SCORE, JOKER, MOTIFS, PAWNS, coopScore } from '../engine/index.js';
import { renderBoard } from './board-view.js';
import { renderRack, identityOrder, shuffleOrder } from './rack-view.js';
import { attachInput } from './input.js';
import { pickLetter, confirmDialog, toast } from './dialogs.js';
import { DEFAULT_NAMES, LEVEL_NAMES, describeEvent, errorMessage, nextTierText, starsLine, turnStatus } from './messages.js';
import { blockedReason, canDropOn, computePreview, initialTurn, pendingForBoard, reduceTurn, toPlacements } from './turn-state.js';

const LOG_SIZE = 10;

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

function actionButton(action, label, className = 'btn') {
  const b = el('button', className, label);
  b.type = 'button';
  b.dataset.action = action;
  return b;
}

export function createGameScreen(root, { controller, dict, names = DEFAULT_NAMES, hotseat = false, turnStatusLine = true }) {
  let turn = initialTurn();
  let order = identityOrder(controller.getView().players[controller.you].rack.length);
  let log = [];
  let lastMove = { cells: [], slots: [] };
  let busy = false;

  root.classList.add('game');
  const status = el('p', 'game-status');
  status.hidden = !turnStatusLine; // en partie réseau, la barre #status (status.js) porte l'état du tour
  const scoreboard = el('div', 'scoreboard');
  const boardHolder = el('div', 'board-holder');
  const preview = el('div', 'preview');
  const rackHolder = el('div', 'rack-holder');
  const actions = el('div', 'actions');
  const logList = el('ol', 'move-log');
  root.replaceChildren(status, scoreboard, boardHolder, preview, rackHolder, actions, logList);

  const dispatch = (a) => { turn = reduceTurn(turn, a); render(); };
  const isMyTurn = (view) => view.status === 'playing' && view.current === controller.you;

  async function placeWithJoker(rackIndex, cell) {
    const tile = controller.getView().players[controller.you].rack[rackIndex];
    let letter = tile;
    if (tile === JOKER) {
      letter = await pickLetter();
      if (!letter) return;
    }
    dispatch({ type: 'place', rackIndex, cell, letter });
  }

  function renderScores(view) {
    scoreboard.replaceChildren();
    if (view.mode === 'coop') { // objectif, score et réserve communs aux deux joueurs (H12)
      const { coop } = view;
      const { score, stars } = coopScore(view);
      const box = el('div', 'score score-brown coop-goal');
      box.append(
        el('strong', '', `Équipe — ${LEVEL_NAMES[coop.level]} · ${MOTIFS[coop.motif].name}`),
        el('span', '', `Territoires : ${coop.territories}/${PAWNS.coopBrown} — Arbres : ${coop.trees}/${PAWNS.coopTrees} — Traverses : ${coop.traverses}`),
        el('span', 'coop-score', `Score : ${score}/${COOP_MAX_SCORE}`),
        el('span', 'coop-stars', starsLine(stars)),
        el('span', '', nextTierText(coop)),
        el('span', '', `Réserve : ${coop.brownLeft} pions marron, ${coop.treesLeft} arbres`),
        el('span', '', `Lettres : ${view.players[controller.you].rack.length}`),
      );
      box.querySelector('.coop-stars').setAttribute('aria-label', `${stars} étoile${stars > 1 ? 's' : ''} sur 3`);
      scoreboard.append(box, el('div', 'bag-count', `Sac : ${view.bagCount} lettre${view.bagCount > 1 ? 's' : ''}`));
      return;
    }
    for (const p of [0, 1]) {
      const info = view.players[p];
      const letters = info.rack ? info.rack.length : info.rackCount;
      const box = el('div', `score score-${p === 0 ? 'green' : 'brown'}${view.current === p ? ' is-current' : ''}`);
      box.append(el('strong', '', names[p]), el('span', '', `Pions restants : ${info.pawnsLeft}`), el('span', '', `Lettres : ${letters}`));
      scoreboard.append(box);
    }
    scoreboard.append(el('div', 'bag-count', `Sac : ${view.bagCount} lettre${view.bagCount > 1 ? 's' : ''}`));
  }

  function renderPreview(p) {
    preview.replaceChildren();
    preview.className = `preview${p ? (p.ok ? ' is-ok' : ' is-ko') : ''}`;
    if (!p) return;
    if (p.message) preview.append(el('p', 'preview-message', p.message));
    const list = el('ul', 'word-list');
    for (const w of p.words) {
      const ok = p.ok || w.valid;
      list.append(el('li', ok ? 'valid' : 'invalid', `${ok ? '✓' : '✗'} ${w.word}`));
    }
    if (p.slots.length > 0) list.append(el('li', 'slots', `Territoire(s) : ${p.slots.join(', ')}`));
    preview.append(list);
  }

  function renderActions(view, p, myTurn) {
    actions.replaceChildren();
    if (turn.renew) {
      const n = turn.renew.length;
      const confirm = actionButton('renew-confirm', `Confirmer (${n})`);
      confirm.disabled = n === 0 || busy;
      actions.append(confirm, actionButton('renew-cancel', 'Annuler', 'btn secondary'));
      return;
    }
    const play = actionButton('play', 'Valider');
    play.disabled = !myTurn || !p?.ok || busy;
    const clear = actionButton('clear', 'Annuler', 'btn secondary');
    clear.disabled = turn.pending.length === 0;
    actions.append(play, clear);
    if (view.mode === 'coop') {
      const pass = actionButton('pass', 'Passer', 'btn secondary');
      pass.disabled = !myTurn || busy;
      actions.append(pass);
    } else {
      const renew = actionButton('renew', 'Renouveler', 'btn secondary');
      renew.disabled = !myTurn || view.bagCount === 0 || busy;
      actions.append(renew);
    }
  }

  function render() {
    const view = controller.getView();
    const you = controller.you;
    const rack = view.players[you].rack;
    const myTurn = isMyTurn(view);
    const p = computePreview(view, you, turn.pending, dict);

    status.textContent = turnStatus(view, you, { hotseat, names });
    renderScores(view);

    const pendingCells = turn.pending.map((t) => t.cell);
    const highlight = p
      ? { cells: [...new Set([...pendingCells, ...p.words.flatMap((w) => w.cells)])], slots: p.slots, valid: p.ok }
      : { cells: lastMove.cells, slots: lastMove.slots };
    const selectable = turn.selected !== null
      ? Array.from({ length: view.board.length }, (_, c) => c).filter((c) => canDropOn(view, turn.pending, c))
      : [];
    renderBoard(boardHolder, view, { pending: pendingForBoard(turn.pending, rack), highlight, selectable });

    renderPreview(p);
    renderRack(rackHolder, {
      rack,
      order,
      placed: new Set(turn.pending.map((t) => t.rackIndex)),
      selected: turn.selected,
      discard: turn.renew,
      disabled: !myTurn,
    });
    renderActions(view, p, myTurn);

    logList.replaceChildren(...log.slice(0, LOG_SIZE).map((line) => el('li', '', line)));
  }

  function notifyBlocked(cell) {
    const reason = blockedReason(controller.getView(), cell);
    if (reason) toast(errorMessage(reason));
  }

  const detachInput = attachInput(root, {
    enabled: () => isMyTurn(controller.getView()) && !busy,
    onTapRack: (rackIndex) => dispatch(turn.renew ? { type: 'renew-toggle', rackIndex } : { type: 'select', rackIndex }),
    onTapCell(cell) {
      if (turn.pending.some((t) => t.cell === cell)) dispatch({ type: 'unplace', cell });
      else if (turn.selected !== null && canDropOn(controller.getView(), turn.pending, cell)) placeWithJoker(turn.selected, cell);
      else if (turn.selected !== null) notifyBlocked(cell);
    },
    onBlockedDrop: (source, cell) => notifyBlocked(cell),
    canDrop: (source, cell) => !turn.renew && canDropOn(controller.getView(), turn.pending, cell, source.cell ?? null),
    onDrop(source, cell) {
      if (source.rackIndex !== undefined) {
        if (cell !== null) placeWithJoker(source.rackIndex, cell);
      } else if (cell === null) dispatch({ type: 'unplace', cell: source.cell });
      else dispatch({ type: 'move', from: source.cell, to: cell });
    },
    ghostLabel(source) {
      if (source.cell !== undefined) return turn.pending.find((t) => t.cell === source.cell)?.letter ?? '';
      const tile = controller.getView().players[controller.you].rack[source.rackIndex];
      return tile === JOKER ? '★' : tile;
    },
  });

  async function onClick(e) {
    const action = e.target.closest?.('[data-action]')?.dataset.action;
    if (!action || busy || e.target.closest('[disabled]')) return;
    switch (action) {
      case 'shuffle': order = shuffleOrder(order); render(); break;
      case 'clear': dispatch({ type: 'clear' }); break;
      case 'renew': dispatch({ type: 'renew-start' }); break;
      case 'renew-cancel': dispatch({ type: 'renew-cancel' }); break;
      case 'play': {
        busy = true;
        render();
        const r = await controller.act({ type: 'play', placements: toPlacements(turn.pending) });
        busy = false;
        if (!r.ok) toast(errorMessage(r.error));
        render();
        break;
      }
      case 'renew-confirm': {
        const n = turn.renew.length;
        if (!await confirmDialog({ message: `Renouveler ${n} lettre${n > 1 ? 's' : ''} ? Votre tour s'arrête.` })) break;
        busy = true;
        render();
        const r = await controller.act({ type: 'renew', rackIndices: turn.renew });
        busy = false;
        if (!r.ok) toast(errorMessage(r.error));
        render();
        break;
      }
      case 'pass': {
        if (!await confirmDialog({ message: 'Passer votre tour ? La partie s’arrête si vous passez tous les deux d’affilée.' })) break;
        busy = true;
        render();
        const r = await controller.act({ type: 'pass' });
        busy = false;
        if (!r.ok) toast(errorMessage(r.error));
        render();
        break;
      }
      default:
    }
  }
  root.addEventListener('click', onClick);

  const unsubscribe = controller.onChange((view, events) => {
    turn = initialTurn();
    order = identityOrder(view.players[controller.you].rack.length);
    log = [...events.map((ev) => describeEvent(ev, names, view.mode)).filter(Boolean).reverse(), ...log];
    const played = events.find((ev) => ev.type === 'played');
    lastMove = {
      cells: played ? played.tiles.map((t) => t.cell) : [],
      slots: events.flatMap((ev) => (ev.type === 'territory' ? [ev.slot] : ev.type === 'traverse' ? ev.slots : ev.type === 'tree' ? [ev.slot] : [])),
    };
    for (const ev of events) {
      if (ev.type === 'traverse') toast('Traverse !');
      else if (ev.type === 'territory') toast(describeEvent(ev, names, view.mode));
      else if (ev.type === 'tree') toast('Arbre planté !');
    }
    if (hotseat && view.status === 'playing') toast(`À ${names[view.current]} de jouer`);
    render();
  });

  render();
  return {
    destroy() {
      detachInput();
      unsubscribe();
      root.removeEventListener('click', onClick);
    },
  };
}
