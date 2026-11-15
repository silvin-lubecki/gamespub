// COM-01 (DESIGN-plateforme §5.4) : pilote des IA pour les jeux tour par tour. Planifie une seule action à la fois
// pour le siège au trait s'il est piloté par une IA, et passe par le même `act(seat, action)` que les humains.
// Le pilote ne s'abonne à rien : l'appelant (contrôleur solo, session hôte) appelle `notify()` après chaque changement
// d'état. Contrat moteur : `applyAction` renvoie un NOUVEL objet d'état à chaque coup (l'état sert de clé de dédoublonnage).
import { assertGame } from '../game.js';
import { mulberry32 } from '../engine/rng.js';
import { systemClock } from '../net/clock.js';

export const DEFAULT_DELAY_MS = 700;

/**
 * `createTurnBotDriver({ game, getState, act, isBot, levelOf, clock, delayMs, random, seed, onError })` → `{ notify, stop }`.
 * `delayMs` : délai moyen (± 30 %, tiré avec `random`) ; 0 en test (`?botDelay=0`). `seed` : graine de la partie ; le `rng`
 * passé à `bots.chooseAction` vaut mulberry32(seed + numéro de coup), donc ne dépend ni du délai ni de l'horloge.
 * `act` renvoie `{ ok: false }` si le coup est refusé : le pilote tente alors UNE fois `bots.fallback(state, seat)`,
 * puis s'arrête pour cette position (`onError`) jusqu'au prochain `notify()`.
 */
export function createTurnBotDriver({
  game, getState, act, isBot, levelOf, clock = systemClock, delayMs = DEFAULT_DELAY_MS, random = Math.random, seed = 0,
  onError = (e) => console.warn(`${game.id}/ia : action refusée`, e),
}) {
  assertGame(game);
  const { engine, bots } = game;
  const level = levelOf ?? (() => game.defaultLevel);
  let timer = null;
  let keyState = null;
  let keySeat = null;
  let ply = 0;
  let stopped = false;

  const clear = () => {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
    keyState = null;
    keySeat = null;
  };

  const botSeat = (state) => {
    if (!state || engine.isOver(state)) return null;
    const seat = engine.currentSeat(state);
    return seat !== null && seat !== undefined && isBot(seat) ? seat : null;
  };

  function notify() {
    if (stopped) return;
    const state = getState();
    const seat = botSeat(state);
    if (seat === null) { clear(); return; }
    if (timer !== null && state === keyState && seat === keySeat) return;
    clear();
    keyState = state;
    keySeat = seat;
    timer = clock.setTimeout(fire, delayMs === 0 ? 0 : delayMs * (0.7 + 0.6 * random()));
  }

  function fire() {
    timer = null;
    keyState = null;
    keySeat = null;
    if (stopped) return;
    const state = getState();
    const seat = botSeat(state);
    if (seat === null) { notify(); return; }
    const turnRng = mulberry32((seed + Math.imul(ply++, 0x9e3779b9)) >>> 0);
    let action = null;
    let result;
    try {
      action = bots.chooseAction(state, seat, level(seat), turnRng);
      result = act(seat, action);
    } catch (err) {
      result = { ok: false, error: String(err?.message ?? err) };
    }
    if (result?.ok === false) {
      let fallback;
      let second = null;
      try {
        fallback = bots.fallback?.(state, seat);
        second = fallback === undefined ? null : act(seat, fallback);
      } catch (err) {
        second = { ok: false, error: String(err?.message ?? err) };
      }
      if (second === null || second?.ok === false) {
        onError({ seat, action, error: result.error, fallback: fallback ?? null, fallbackError: second?.error ?? null });
        return;
      }
    }
    notify();
  }

  return {
    notify,
    stop() {
      stopped = true;
      clear();
    },
  };
}
