// Écran Partie (DESIGN §8.4) : table en combinaisons, chevalet sur 2 rangées, glisser-déposer et toucher-toucher,
// brouillon local (draft.js). Seule une table complète validée part au moteur (H-RUM-2) ; les autres joueurs voient
// « X joue… » puis la nouvelle table. Les `data-*` sont décrits dans render.js. Pas d'accès au DOM à l'import.
import { aiStats, resetAiStats } from '../bot-timing.js';
import {
  createDraft, isDirty, locked, moveTiles, myTurn, sigOf, sortDraft, toAction, toggleSelect, undo,
} from './draft.js';
import { installDrag } from './drag.js';
import { endHtml, gameHtml } from './render.js';

export { rulesHtml } from './rules.js';

const MSG = {
  'tiles-mismatch': 'La table ne correspond pas à votre chevalet.',
  'invalid-set': 'Une combinaison n’est pas valide (cadre rouge).',
  'initial-meld-30': 'Première pose : il faut au moins 30 points avec votre chevalet.',
  'initial-meld-table': 'Avant votre première pose, la table ne se touche pas.',
  'no-tile-played': 'Posez au moins une tuile de votre chevalet.',
  'not-your-turn': 'Ce n’est pas votre tour.',
  'table-to-rack': 'Une tuile de la table ne revient pas au chevalet.',
  offline: 'Hors ligne : le coup n’est pas parti, réessayez.',
};
const msgOf = (error) => MSG[error] ?? 'Coup refusé.';

export function mountGame(el, controller, ctx) {
  resetAiStats();
  let view = controller.getView();
  let draft = createDraft(view);
  let lastPlayed = new Set();
  let lastMsg = '';
  let busy = false;
  let suppressClick = false;
  let disposed = false;

  // Le rendu remplace tout le HTML : on rend le focus (clavier) à l'élément équivalent.
  const focusKey = () => {
    const a = el.ownerDocument.activeElement;
    return a && el.contains(a) ? ['data-tile', 'data-act', 'data-drop'].map((k) => (a.hasAttribute(k) ? `button[${k}="${a.getAttribute(k)}"]${a.dataset.set === undefined ? '' : `[data-set="${a.dataset.set}"]`}` : '')).find(Boolean) ?? null : null;
  };
  const render = () => {
    if (disposed) return;
    const key = focusKey();
    el.innerHTML = gameHtml(view, draft, { lastPlayed, lastMsg });
    // Cible disparue (case « + » ou « ↩ » vidée après un dépôt) : on retombe sur « Nouvelle combinaison ».
    if (key) (el.querySelector(key) ?? el.querySelector('button[data-drop="new"]'))?.focus?.();
  };
  const set = (next) => { draft = next; render(); };
  const apply = (ids, dest) => {
    const r = moveTiles(draft, view, ids, dest);
    if (r.error) ctx.toast(msgOf(r.error));
    set(r.draft);
  };

  const noteEvents = (events = []) => {
    for (const e of events) {
      const who = view.names[e.seat];
      if (e.type === 'played') { lastPlayed = new Set(e.tiles); lastMsg = `${who} a posé ${e.tiles.length} tuile${e.tiles.length > 1 ? 's' : ''}.`; }
      else if (e.type === 'drew') { lastPlayed = new Set(); lastMsg = `${who} a pioché.`; }
      else if (e.type === 'passed') { lastPlayed = new Set(); lastMsg = `${who} a passé.`; }
    }
  };

  const drag = installDrag(el, {
    idsFor: (id) => (draft.selected.includes(id) ? draft.selected.slice() : [id]),
    onDrop: apply,
    onSuppressClick: () => { suppressClick = true; setTimeout(() => { suppressClick = false; }, 150); },
  });

  const off = controller.onChange((next, events) => {
    drag.cancel();
    view = next;
    noteEvents(events);
    if (sigOf(view) !== draft.sig) draft = createDraft(view, draft.rack); // une resynchronisation à l'identique garde le brouillon
    render();
    if (view.phase === 'over') ctx.onEnd(view);
  });

  async function send(action) {
    if (busy) return;
    busy = true;
    try {
      const r = await controller.act(action);
      if (!r?.ok) ctx.toast(msgOf(r?.error));
    } finally { busy = false; }
  }

  const onClick = async (e) => {
    if (suppressClick) return;
    const tile = e.target.closest('[data-tile]');
    if (tile) {
      const id = Number(tile.dataset.tile);
      if (tile.dataset.zone === 'table' && (!myTurn(view) || locked(draft, view, id))) return;
      set(toggleSelect(draft, id));
      return;
    }
    const drop = e.target.closest('[data-drop]');
    if (drop && draft.selected.length > 0) {
      const dest = drop.dataset.drop === 'set' ? { to: 'set', index: Number(drop.dataset.set) }
        : drop.dataset.drop === 'new' ? { to: 'new' } : { to: 'rack' };
      apply(draft.selected, dest);
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    switch (act) {
      case 'quit': ctx.onQuit(); break;
      case 'rules': ctx.onRules(); break;
      case 'undo': set(undo(draft)); break;
      case 'sort-group': set(sortDraft(draft, 'group')); break;
      case 'sort-run': set(sortDraft(draft, 'run')); break;
      case 'validate': await send(toAction(draft)); break;
      case 'draw': case 'pass':
        if (isDirty(draft) && !(await ctx.confirm('Reprendre vos tuiles et ' + (act === 'draw' ? 'piocher' : 'passer') + ' ?'))) break;
        await send({ type: act });
        break;
      default:
    }
  };
  const onDown = () => { suppressClick = false; }; // un nouvel appui n'est jamais le clic fantôme d'un glisser
  el.addEventListener('pointerdown', onDown, true);
  el.addEventListener('click', onClick);
  render();
  if (view.phase === 'over') ctx.onEnd(view);
  return {
    dispose() {
      disposed = true;
      off();
      drag.dispose();
      el.removeEventListener('pointerdown', onDown, true);
      el.removeEventListener('click', onClick);
    },
  };
}

export const renderEnd = (view) => endHtml(view, aiStats());
