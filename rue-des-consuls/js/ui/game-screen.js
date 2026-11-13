// RDC-05 (DESIGN.md §10) : liaison DOM de l'écran Partie (scène, voile portrait, zoom, toasts, clics).
import { RESOURCES } from '../engine/catalog.js';
import { renderGame } from './game-view.js';
import { resourceCard } from './cards.js';
import {
  counterComposer, emptyComposer, giftComposer, offerAction, resetComposer, setTarget, stepComposer, syncComposer,
} from './market-panel.js';
import { errorMessage, eventLines, negotiationToasts } from './messages.js';
import { installStage, toggleFullscreen } from './stage.js';

const LONG_PRESS_MS = 500;
const TOAST_MS = 3500;
const TOAST_EVENTS = new Set(['produce', 'trigger', 'discard']);
const FS_HINT_KEY = 'rdc:fs-hint';

/** Monte la partie dans `root` (#screen-game) ; renvoie { dispose }. */
export function mountGame(root, controller, { onEnd, onQuit, onRules } = {}) {
  root.innerHTML = '<div id="stage" class="stage"></div>'
    + '<div class="portrait-veil" role="alert"><span class="veil-icon" aria-hidden="true">📱</span><p>Tournez votre appareil</p></div>'
    + '<div id="zoom" class="zoom" hidden></div><div id="toasts" class="toasts" aria-live="polite"></div>';
  const stage = root.querySelector('#stage');
  const zoom = root.querySelector('#zoom');
  const toasts = root.querySelector('#toasts');
  const ui = { mode: null, journal: [], offer: emptyComposer(), sheet: false, get seats() { return controller.seats ?? []; } };
  ui.offer = syncComposer(ui.offer, controller.getView());
  const scale = installStage(stage);
  let suppressClick = false;
  let pressTimer = null;

  const toast = (text) => {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    toasts.append(el);
    setTimeout(() => el.remove(), TOAST_MS);
  };

  const render = () => { stage.innerHTML = renderGame(controller.getView(), ui); };

  const unsubscribeSeats = controller.onSeats?.(render); // réseau (RDC-07) : badges IA / siège confié à l'IA
  const unsubscribe = controller.onChange((view, events) => {
    ui.mode = null;
    ui.offer = syncComposer(ui.offer, view);
    if (view.phase !== 'market') ui.sheet = false;
    ui.journal.push(...eventLines(events, view));
    ui.journal = ui.journal.slice(-10);
    const lines = [...eventLines(events.filter((e) => TOAST_EVENTS.has(e.type)), view), ...negotiationToasts(events, view)];
    lines.forEach(toast);
    if (view.phase === 'ended') onEnd?.(view, lines); // RDC-08 : the end screen recaps the final move
    else render();
  });

  const showZoom = (el) => {
    const resource = el.dataset.resource;
    const html = resource !== undefined ? resourceCard(RESOURCES[Number(resource)]) : el.querySelector('.card')?.outerHTML;
    if (!html) return;
    zoom.innerHTML = html;
    zoom.hidden = false;
  };

  const run = async (action) => {
    const res = await controller.act(action);
    if (!res.ok) toast(errorMessage(res.error));
    return res;
  };

  const actions = {
    market: () => run({ type: 'market' }),
    endMarket: () => {
      const open = controller.getView().market?.offers.some((o) => o.status === 'open');
      if (open && !confirm('Des offres sont encore ouvertes : terminer le Marché les annule. Continuer ?')) return;
      run({ type: 'endMarket' });
    },
    'offer-to': (el) => { ui.offer = setTarget(ui.offer, controller.getView(), Number(el.dataset.seat)); render(); },
    step: (el) => {
      ui.offer = stepComposer(ui.offer, controller.getView(), el.dataset.side, Number(el.dataset.r), Number(el.dataset.delta));
      render();
    },
    gift: () => { ui.offer = giftComposer(ui.offer); render(); },
    'reset-offer': () => { ui.offer = resetComposer(ui.offer); render(); },
    propose: async () => {
      const action = offerAction(ui.offer, controller.getView());
      if (!action) return;
      const res = await run(action);
      if (!res.ok) return;
      ui.offer = resetComposer(ui.offer);
      render();
    },
    accept: (el) => run({ type: 'accept', offer: el.dataset.offer }),
    decline: (el) => run({ type: 'decline', offer: el.dataset.offer }),
    cancel: (el) => run({ type: 'cancel', offer: el.dataset.offer }),
    counter: (el) => {
      const view = controller.getView();
      const offer = view.market?.offers.find((o) => o.id === el.dataset.offer);
      if (!offer) return;
      ui.offer = counterComposer(offer, view);
      render();
    },
    'res-sheet': () => { ui.sheet = !ui.sheet; render(); },
    endVisit: () => run({ type: 'endVisit' }),
    'mode-take': () => { ui.mode = ui.mode === 'take' ? null : 'take'; render(); },
    'mode-visit': () => { ui.mode = ui.mode === 'visit' ? null : 'visit'; render(); },
    take: (el) => run({ type: 'take', index: Number(el.dataset.index) }),
    deposit: (el) => run({ type: 'deposit', order: Number(el.dataset.order) }),
    rules: () => onRules?.(),
    quit: () => onQuit?.(),
    fullscreen: async () => {
      if (await toggleFullscreen()) return;
      if (!localStorage.getItem(FS_HINT_KEY)) {
        localStorage.setItem(FS_HINT_KEY, '1');
        toast("Plein écran indisponible : ajoutez le jeu à l'écran d'accueil.");
      }
    },
  };

  const onClick = (e) => {
    if (suppressClick) { suppressClick = false; return; }
    if (!zoom.hidden) { zoom.hidden = true; return; }
    const el = e.target.closest?.('[data-act]');
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    actions[el.dataset.act]?.(el);
  };
  const cancelPress = () => { clearTimeout(pressTimer); pressTimer = null; };
  // Le clic qui suit un appui long est ignoré ; le drapeau retombe peu après le relâchement (pas de clic émis sur Android).
  const onUp = () => { cancelPress(); if (suppressClick) setTimeout(() => { suppressClick = false; }, 150); };
  const onDown = (e) => {
    const el = e.target.closest?.('[data-zoom]');
    suppressClick = false;
    if (!el) return;
    cancelPress();
    pressTimer = setTimeout(() => { suppressClick = true; showZoom(el); }, LONG_PRESS_MS);
  };
  const onMenu = (e) => {
    const el = e.target.closest?.('[data-zoom]');
    if (!el) return;
    e.preventDefault();
    showZoom(el);
  };

  root.addEventListener('click', onClick);
  root.addEventListener('pointerdown', onDown);
  root.addEventListener('pointermove', cancelPress);
  for (const t of ['pointerup', 'pointercancel']) root.addEventListener(t, onUp);
  root.addEventListener('contextmenu', onMenu);
  render();

  return {
    dispose() {
      unsubscribe();
      unsubscribeSeats?.();
      controller.dispose?.();
      scale.dispose();
      cancelPress();
      root.removeEventListener('click', onClick);
      root.removeEventListener('pointerdown', onDown);
      root.removeEventListener('pointermove', cancelPress);
      for (const t of ['pointerup', 'pointercancel']) root.removeEventListener(t, onUp);
      root.removeEventListener('contextmenu', onMenu);
      root.innerHTML = '';
    },
  };
}
