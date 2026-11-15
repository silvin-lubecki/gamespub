// COM-01 (DESIGN-plateforme §5.5) : contrôleur réseau, même interface que le contrôleur local (`getView`, `act`, `onChange`,
// `you`), adossé à une session hôte (`accept` présent) ou invitée : l'écran Partie fonctionne sans changement.
// Copie de La Rue des Consuls. L'invité ne résout `act` que sur le `state` dont `ack` = son `seq`, sur un `reject`, ou
// immédiatement `offline` hors connexion.
import { createClientId } from '../net/session.js';

/** Identifiant de client persistant par hôte (`<gameId>:client:<hostId>`) : permet la re-liaison après reconnexion. */
export function getClientId(gameId, hostId, { storage, random } = {}) {
  const key = `${gameId}:client:${hostId}`;
  let store = storage;
  if (store === undefined) { try { store = globalThis.localStorage; } catch { store = null; } }
  try {
    const known = store.getItem(key);
    if (known) return known;
  } catch { /* stockage indisponible : identifiant éphémère */ }
  const id = createClientId(random);
  try { store.setItem(key, id); } catch { /* idem */ }
  return id;
}

export function createNetworkController(session) {
  const isHost = typeof session.accept === 'function';
  const pending = new Map(); // invité : seq → resolve
  const settle = (result) => {
    for (const resolve of pending.values()) resolve(result);
    pending.clear();
  };

  const changeCbs = new Set();
  session.onChange((view, events, meta = {}) => {
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
    session.onStatus((s) => { if (s !== 'open' && s !== 'connecting') settle({ ok: false, error: 'offline' }); });
  }

  return {
    role: isHost ? 'host' : 'guest',
    get you() { return session.you; },
    getView: () => session.view,
    // Sièges publics en jeu (les `seatCount` premiers) ; `bot` (IA ou siège confié à l'IA) alimente le badge de l'écran Partie.
    get seats() {
      const all = session.seats;
      if (!all) return null;
      return all.slice(0, session.seatCount ?? all.length).map((s) => ({ ...s, bot: s.kind === 'bot' || s.delegated }));
    },
    get seatCount() { return session.seatCount; },
    get settings() { return session.settings; },
    get startError() { return isHost ? session.startError : null; },
    get status() { return isHost ? 'open' : session.status; },
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
    onSeats: (cb) => session.onSeats(cb),
    onStatus: (cb) => (isHost ? () => {} : session.onStatus(cb)),
    onNewGame: (cb) => (isHost ? () => {} : session.onNewGame(cb)),
    start: () => (isHost ? session.start() : false),
    setSeatCount: (n) => (isHost ? session.setSeatCount(n) : false),
    setSettings: (s) => (isHost ? session.setSettings(s) : false),
    cycleSeat: (i) => (isHost ? session.cycleSeat(i) : false),
    releaseSeat: (i) => (isHost ? session.releaseSeat(i) : false),
    confide: (i) => (isHost ? session.confide(i) : false),
    rematch: () => (isHost ? session.rematch() : false),
    close() { settle({ ok: false, error: 'offline' }); session.close(); },
  };
}
