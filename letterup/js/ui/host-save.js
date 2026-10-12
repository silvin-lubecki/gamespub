// Persistance de l'hôte (LU-14, DESIGN.md §9.3). Module pur : aucun accès au DOM à l'import ; `storage` injectable.
// A18 : on ne reprend que si le transport sauvegardé (`local`) correspond à l'URL courante.
// A20 : sauvegarde après chaque changement dès qu'un invité est lié ; effacée en fin de partie ; un rematch la réécrit.
import { STATE_VERSION } from '../engine/constants.js';

// H18 : un instantané d'état de version ≠ STATE_VERSION (v1) est ignoré (la reprise n'est pas proposée).
export const HOST_SAVE_KEY = 'letterup:host';

const defaultStorage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

/** `data` = `{ peerId, local, settings, snapshot }`. */
export function saveHost(data, storage = defaultStorage()) {
  try { storage?.setItem(HOST_SAVE_KEY, JSON.stringify(data)); } catch { /* quota / navigation privée : sans persistance */ }
}

/** Renvoie la sauvegarde d'une partie en cours, ou `null` (absente, illisible, invalide ou terminée). */
export function loadHost(storage = defaultStorage()) {
  try {
    const data = JSON.parse(storage?.getItem(HOST_SAVE_KEY) ?? 'null');
    if (!data || typeof data.peerId !== 'string' || !data.peerId) return null;
    if (data.snapshot?.v !== 1 || data.snapshot.state?.v !== STATE_VERSION
      || data.snapshot.state.status !== 'playing') return null;
    return data;
  } catch {
    return null;
  }
}

export function clearHost(storage = defaultStorage()) {
  try { storage?.removeItem(HOST_SAVE_KEY); } catch { /* ignoré */ }
}

/** Enregistre la session hôte à chaque changement ; renvoie la fonction d'arrêt. */
export function persistHost(session, { peerId, local = false, storage = defaultStorage() } = {}) {
  const sync = () => {
    if (session.state.status === 'ended') clearHost(storage);
    else if (session.guest) saveHost({ peerId, local, settings: session.settings, snapshot: session.snapshot() }, storage);
  };
  const offs = [session.onChange(sync), session.onStatus(sync)];
  sync();
  return () => { for (const off of offs) off?.(); };
}
