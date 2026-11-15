// COM-01 (DESIGN-plateforme §5.5) : contrôleur local (solo, hotseat, autoplay). L'interface ne lit jamais l'état complet,
// seulement `getView()` (vue filtrée du siège affiché), pour que le réseau puisse remplacer ce contrôleur.
import { withDefaults } from '../game.js';
import { randomSeed } from '../engine/rng.js';
import { createTurnBotDriver } from '../ai/turn-driver.js';

/**
 * `createLocalController(game, { seed, names, seatCount, settings, levels, humanSeat, hotseat, initialState, delayMs, clock, onCommit, createDriver })`.
 * `levels[i]` non nul = siège IA de ce niveau (une IA sur `humanSeat` donne un mode autoplay) ; `hotseat` : le siège affiché
 * suit le siège actif ; sinon `humanSeat`. `onCommit(state)` est appelé après chaque coup.
 * `act(action)` → { ok, error? } ; `onChange(cb)` renvoie la fonction de désabonnement ; `cb(view, events)`.
 */
export function createLocalController(rawGame, {
  seed = randomSeed(), seatCount, names, settings, levels, humanSeat = 0, hotseat = false, initialState = null,
  delayMs, clock, onCommit, createDriver = createTurnBotDriver, random,
} = {}) {
  const game = withDefaults(rawGame);
  const { engine } = game;
  const n = seatCount ?? game.seats.default;
  const levelList = levels ?? Array(n).fill(null);
  let state = initialState ?? engine.createGame({
    seed,
    seatCount: n,
    names: names ?? Array.from({ length: n }, (_, i) => `Joueur ${i + 1}`),
    settings: settings ?? game.settings.defaults,
  });
  const listeners = new Set();
  const you = () => (hotseat ? engine.currentSeat(state) ?? humanSeat : humanSeat);
  const getView = () => engine.viewFor(state, you());
  let driver = null;

  function commit(seat, action) {
    const res = engine.applyAction(state, seat, action);
    if (!res.ok) return { ok: false, error: res.error };
    state = res.state;
    const view = getView();
    const events = (engine.redactEvents?.(res.events.map((e) => ({ ...e, by: seat })), you()) ?? res.events.map((e) => ({ ...e, by: seat })));
    for (const cb of [...listeners]) cb(view, events);
    onCommit?.(state);
    driver?.notify();
    return { ok: true };
  }

  if (levelList.some((l) => l != null)) {
    driver = createDriver({
      game,
      getState: () => state,
      act: commit,
      isBot: (seat) => levelList[seat] != null,
      levelOf: (seat) => levelList[seat],
      seed,
      ...(random ? { random } : {}),
      ...(clock ? { clock } : {}),
      ...(delayMs === undefined ? {} : { delayMs }),
    });
    driver.notify(); // premier joueur IA, ou reprise d'une partie
  }

  return {
    get _state() { return state; }, // tests uniquement : l'interface ne lit que getView()
    get you() { return you(); },
    seatCount: n,
    /** Un élément par siège : { bot, level } (level null pour un humain). */
    get seats() { return Array.from({ length: n }, (_, i) => ({ bot: levelList[i] != null, level: levelList[i] ?? null })); },
    getView,
    async act(action) {
      return commit(you(), action);
    },
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    dispose() {
      driver?.stop();
    },
  };
}
