// RDC-07 (DESIGN.md §9.4) : persistance de l'hôte (`rdc:host`), fork de Letter Up. Module pur : aucun accès au DOM à
// l'import ; `storage` injectable. La reprise n'est proposée que si le transport sauvegardé (`local`) est celui de l'URL.
// Rien n'est sauvegardé dans le salon (avant le lancement) ; la sauvegarde est effacée en fin de partie.
import { STATE_VERSION } from '../engine/index.js';

export const HOST_SAVE_KEY = 'rdc:host';

const defaultStorage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

/** `data` = `{ peerId, local, snapshot }`. */
export function saveHost(data, storage = defaultStorage()) {
  try { storage?.setItem(HOST_SAVE_KEY, JSON.stringify(data)); } catch { /* quota / navigation privée : sans persistance */ }
}

/** Renvoie la sauvegarde d'une partie en cours, ou `null` (absente, illisible, invalide ou terminée). */
export function loadHost(storage = defaultStorage()) {
  try {
    const data = JSON.parse(storage?.getItem(HOST_SAVE_KEY) ?? 'null');
    if (!data || typeof data.peerId !== 'string' || !data.peerId) return null;
    const snap = data.snapshot;
    if (snap?.v !== 1 || snap.state?.v !== STATE_VERSION || snap.state.phase === 'ended') return null;
    if (!Array.isArray(snap.seats) || snap.seats.length !== 4) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearHost(storage = defaultStorage()) {
  try { storage?.removeItem(HOST_SAVE_KEY); } catch { /* ignoré */ }
}

/** Enregistre la session hôte à chaque changement de partie ou de sièges ; renvoie la fonction d'arrêt. */
export function persistHost(session, { peerId, local = false, storage = defaultStorage() } = {}) {
  const sync = () => {
    if (session.phase !== 'playing') return;
    if (session.state.phase === 'ended') clearHost(storage);
    else saveHost({ peerId, local, snapshot: session.snapshot() }, storage);
  };
  const offs = [session.onChange(sync), session.onSeats(sync)];
  sync();
  return () => { for (const off of offs) off?.(); };
}
