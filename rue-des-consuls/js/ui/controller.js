// RDC-05 (DESIGN.md §10, §5.5) : contrôleur local. L'interface ne lit jamais l'état complet, seulement `getView()`
// (vue filtrée du siège affiché), pour que le réseau (RDC-07) puisse remplacer ce contrôleur.
import { createBotDriver } from '../ai/driver.js';
import { applyAction, createGame, currentSeat, viewFor } from '../engine/index.js';

/** Graine aléatoire 32 bits. */
export function randomSeed(cryptoApi = globalThis.crypto) {
  return cryptoApi.getRandomValues(new Uint32Array(1))[0];
}

/**
 * Partie locale. `hotseat` : le siège affiché suit le siège actif (4 humains sur un écran) ; sinon `humanSeat`.
 * RDC-06 : `policies` (4 entrées : null = humain, sinon 'opportunist' | 'volume' | 'value') branche le pilote des IA
 * (DESIGN.md §8.2) ; une politique sur `humanSeat` donne un mode autoplay. `onCommit(state)` est appelé après chaque coup.
 * `act(action)` → { ok, error? } ; `onChange(cb)` renvoie la fonction de désabonnement ; `cb(view, events)`.
 */
export function createLocalController({
  seed, names, hotseat = true, humanSeat = 0, initialState = null, policies = null, delayMs, clock, onCommit,
} = {}) {
  let state = initialState ?? createGame({ seed, names });
  const listeners = new Set();
  const you = () => (hotseat ? currentSeat(state) : humanSeat);
  const getView = () => viewFor(state, you());
  let driver = null;

  function commit(seat, action) {
    const res = applyAction(state, seat, action);
    if (!res.ok) return { ok: false, error: res.error };
    state = res.state;
    const view = getView();
    for (const cb of [...listeners]) cb(view, res.events);
    onCommit?.(state);
    driver?.notify();
    return { ok: true };
  }

  if (policies?.some((p) => p != null)) {
    driver = createBotDriver({
      getState: () => state,
      act: commit,
      isBot: (seat) => policies[seat] != null,
      policyOf: (seat) => policies[seat],
      ...(clock ? { clock } : {}),
      ...(delayMs === undefined ? {} : { delayMs }),
    });
    driver.notify(); // premier joueur IA, ou reprise d'une partie
  }

  return {
    get _state() { return state; }, // tests uniquement : l'interface ne lit que getView()
    get you() { return you(); },
    /** Un élément par siège : { bot, policy } (policy null pour un humain). */
    get seats() { return [0, 1, 2, 3].map((i) => ({ bot: policies?.[i] != null, policy: policies?.[i] ?? null })); },
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
