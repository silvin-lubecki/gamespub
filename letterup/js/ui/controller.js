// Contrôleur de partie (LU-10) : interface consommée par l'UI, indépendante du transport.
//   { you, participant, getView(), act(action) → Promise<{ok, error?}>, onChange(cb), }
// `onChange` appelle `cb(view, events, meta)` après chaque action acceptée (`meta.ack` : réseau invité, LU-16). LU-11 fournira la même interface
// via le réseau ; ici, implémentation locale (moteur en mémoire) pour le hot-seat de développement.
import { applyAction, createDictionary, createGame, viewFor } from '../engine/index.js';
import { createClientId } from '../net/session.js';

/** Hot-seat : `you` suit le joueur courant (deux joueurs sur le même écran). */
export function createLocalController({ mode = 'versus', seed, dict, coop, initialState = null } = {}) {
  let state = initialState ?? createGame({ mode, seed, coop }); // `initialState` : reprise solo (LU-17, H17)
  const listeners = new Set();
  const getView = () => viewFor(state, state.current);
  return {
    get you() { return state.current; },
    get state() { return state; },
    participant: 0, // coop : un seul siège (H12′), le hot-seat coop est de fait un solo
    getView,
    async act(action) {
      const r = applyAction(state, state.current, action, dict);
      if (!r.ok) return { ok: false, error: r.error };
      state = r.state;
      const view = getView();
      for (const cb of [...listeners]) cb(view, r.events);
      return { ok: true };
    },
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}

/** Charge le dictionnaire (§8). Rejette si la requête échoue. */
export async function loadDictionary({ fetchImpl = globalThis.fetch, url = './dict/fr.txt' } = {}) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return createDictionary(await res.text());
}

/** Graine de partie générée par l'hôte avec `crypto.getRandomValues` (injectable pour les tests). */
export function randomSeed(cryptoImpl = globalThis.crypto) {
  return cryptoImpl.getRandomValues(new Uint32Array(1))[0];
}

/** Identifiant de client persistant par hôte (`letterup:client:<hostId>`) : permet la re-liaison après reconnexion. */
export function getClientId(hostId, { storage = globalThis.localStorage, random } = {}) {
  const key = `letterup:client:${hostId}`;
  try {
    const known = storage.getItem(key);
    if (known) return known;
  } catch { /* stockage indisponible : identifiant éphémère */ }
  const id = createClientId(random);
  try { storage.setItem(key, id); } catch { /* idem */ }
  return id;
}

/**
 * Contrôleur réseau (LU-11) : même interface que le contrôleur local, adossé à une session hôte
 * (`accept` présent) ou invité. Ajoute `role`, `status`, `onStatus`, `rematch`, `close` et `ready`
 * (promesse de la première vue : immédiate pour l'hôte, premier `state` pour l'invité).
 */
export function createNetworkController(session) {
  const isHost = typeof session.accept === 'function';
  const pending = new Map(); // invité : seq → resolve
  const settle = (result) => {
    for (const resolve of pending.values()) resolve(result);
    pending.clear();
  };
  let resolveReady;
  const ready = new Promise((res) => { resolveReady = res; });
  if (isHost || session.view) resolveReady(session.view);

  const changeCbs = new Set();
  session.onChange((view, events, meta = {}) => {
    resolveReady(view);
    // A10′ : `act` de l'invité ne se résout que sur le state dont `ack` = son seq (un coup de l'hôte ne résout rien).
    if (!isHost && meta.ack !== undefined) {
      const resolve = pending.get(meta.ack);
      if (resolve) { pending.delete(meta.ack); resolve({ ok: true }); }
    }
    for (const cb of [...changeCbs]) cb(view, events, meta);
  });
  if (!isHost) {
    session.onReject((error, seq) => {
      const resolve = pending.get(seq);
      if (resolve) { pending.delete(seq); resolve({ ok: false, error }); }
    });
  }
  session.onStatus((s) => { if (!isHost && s !== 'open' && s !== 'connecting') settle({ ok: false, error: 'offline' }); });

  return {
    // `you` = siège de la vue (en coop : toujours 0, H12′) ; `participant` = 0 hôte, 1 invité.
    get you() { return session.view?.you ?? (isHost ? 0 : 1); },
    participant: isHost ? 0 : 1,
    role: isHost ? 'host' : 'guest',
    ready,
    getView: () => session.view,
    get status() { return session.status; },
    async act(action) {
      if (isHost) {
        const r = session.act(action);
        return r.ok ? { ok: true } : { ok: false, error: r.error };
      }
      const seq = session.act(action);
      if (seq === null) return { ok: false, error: 'offline' };
      return new Promise((resolve) => { pending.set(seq, resolve); });
    },
    onChange(cb) {
      changeCbs.add(cb);
      return () => changeCbs.delete(cb);
    },
    onStatus: (cb) => session.onStatus(cb),
    rematch(nextSettings) { if (isHost) session.rematch(nextSettings); },
    close() { session.close(); },
  };
}
