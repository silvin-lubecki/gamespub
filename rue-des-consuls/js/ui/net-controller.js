// RDC-07 (DESIGN.md §9, §5.5) : contrôleur réseau, même interface que le contrôleur local (`getView`, `act`, `onChange`,
// `you`), adossé à une session hôte (`accept` présent) ou invitée : l'écran Partie fonctionne sans changement.
// Fork de Letter Up (createNetworkController, getClientId). L'invité ne résout `act` que sur le `state` dont `ack` = son
// `seq`, sur un `reject`, ou immédiatement `offline` hors connexion.
import { createClientId } from '../net/session.js';

/** Identifiant de client persistant par hôte (`rdc:client:<hostId>`) : permet la re-liaison après reconnexion. */
export function getClientId(hostId, { storage = globalThis.localStorage, random } = {}) {
  const key = `rdc:client:${hostId}`;
  try {
    const known = storage.getItem(key);
    if (known) return known;
  } catch { /* stockage indisponible : identifiant éphémère */ }
  const id = createClientId(random);
  try { storage.setItem(key, id); } catch { /* idem */ }
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
    // Sièges publics ; `bot` (IA ou siège confié à l'IA) alimente le badge de l'écran Partie, comme le contrôleur solo.
    get seats() { return session.seats?.map((s) => ({ ...s, bot: s.kind === 'bot' || s.delegated, policy: s.policy ?? (s.delegated ? 'opportunist' : null) })) ?? null; },
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
    cycleSeat: (i) => (isHost ? session.cycleSeat(i) : false),
    releaseSeat: (i) => (isHost ? session.releaseSeat(i) : false),
    confide: (i) => (isHost ? session.confide(i) : false),
    rematch: () => (isHost ? session.rematch() : false),
    close() { settle({ ok: false, error: 'offline' }); session.close(); },
  };
}
