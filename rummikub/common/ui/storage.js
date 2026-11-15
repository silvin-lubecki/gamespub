// COM-01 (DESIGN-plateforme §5.5) : persistance par jeu — `<id>:solo`, `<id>:host`, `<id>:name`. Module pur : aucun accès
// au DOM ni à localStorage à l'import (résolu à la demande, en try/catch) ; `storage` injectable.
//  - solo : écrit après chaque coup (`soloCommit`), effacé en fin de partie ;
//  - host : n'écrit qu'une fois la partie lancée (rien dans le salon) ; effacé en fin de partie ;
//  - name : nom du joueur saisi à l'accueil.
import { assertGame } from '../game.js';
import { SNAPSHOT_VERSION } from '../net/session.js';

const defaultStorage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };
const isObject = (x) => x !== null && typeof x === 'object';

/** `createStore(game, { storage })` → `{ keys, solo, host, name, soloCommit, persistHost }`. */
export function createStore(game, { storage } = {}) {
  assertGame(game);
  const { engine } = game;
  const keys = { solo: `${game.id}:solo`, host: `${game.id}:host`, name: `${game.id}:name` };
  const st = () => storage ?? defaultStorage();

  const read = (key) => { try { return JSON.parse(st()?.getItem(key) ?? 'null'); } catch { return null; } };
  const write = (key, value) => { try { st()?.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)); } catch { /* quota / navigation privée : sans persistance */ } };
  const remove = (key) => { try { st()?.removeItem(key); } catch { /* ignoré */ } };
  const playable = (state) => isObject(state) && state.v === engine.STATE_VERSION && !engine.isOver(state);

  const solo = {
    /** `data` = { names, seatCount, settings, levels, state, … } décrit par l'écran Solo. */
    save: (data) => write(keys.solo, { ...data, game: game.id }),
    /** Partie solo en cours, ou null (absente, illisible, d'un autre jeu, version d'état différente ou terminée). */
    load() {
      const data = read(keys.solo);
      return isObject(data) && data.game === game.id && playable(data.state) ? data : null;
    },
    clear: () => remove(keys.solo),
  };

  const host = {
    /** `data` = { peerId, local, snapshot }. */
    save: (data) => write(keys.host, data),
    /** Sauvegarde d'une partie hôte en cours, ou null. */
    load() {
      const data = read(keys.host);
      if (!isObject(data) || typeof data.peerId !== 'string' || !data.peerId) return null;
      const snap = data.snapshot;
      return isObject(snap) && snap.v === SNAPSHOT_VERSION && snap.game === game.id && playable(snap.state) ? data : null;
    },
    clear: () => remove(keys.host),
  };

  const name = {
    load() { try { return st()?.getItem(keys.name) ?? ''; } catch { return ''; } },
    save: (value) => write(keys.name, String(value)),
  };

  return {
    keys,
    solo,
    host,
    name,
    /** Rappel `onCommit(state)` du contrôleur local : sauvegarde à chaque coup, efface en fin de partie. */
    soloCommit: (setup) => (state) => {
      if (engine.isOver(state)) solo.clear();
      else solo.save({ ...setup, state });
    },
    /** Sauvegarde la session hôte à chaque changement de partie ou de sièges ; renvoie la fonction d'arrêt. */
    persistHost(session, { peerId, local = false } = {}) {
      const sync = () => {
        if (session.phase !== 'playing') return;
        if (engine.isOver(session.state)) host.clear();
        else host.save({ peerId, local, snapshot: session.snapshot() });
      };
      const offs = [session.onChange(sync), session.onSeats(sync)];
      sync();
      return () => { for (const off of offs) off?.(); };
    },
  };
}
