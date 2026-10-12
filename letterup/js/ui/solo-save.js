// Persistance de la partie solo (LU-17, DESIGN.md H17). Module pur : aucun accès au DOM à l'import ; `storage` injectable.
// Sauvegarde après chaque changement ; effacée en fin de partie ou sur « Abandonner ». Ne jette jamais.
import { STATE_VERSION } from '../engine/constants.js';

export const SOLO_SAVE_KEY = 'letterup:solo';

const defaultStorage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

/** `data` = `{ settings, state }` (`settings` = `{ mode: 'coop', coop }`). */
export function saveSolo({ settings, state }, storage = defaultStorage()) {
  try { storage?.setItem(SOLO_SAVE_KEY, JSON.stringify({ v: 1, settings, state })); } catch { /* quota / navigation privée */ }
}

/** Renvoie la sauvegarde d'une partie solo en cours, ou `null` (absente, illisible, invalide ou terminée). */
export function loadSolo(storage = defaultStorage()) {
  try {
    const data = JSON.parse(storage?.getItem(SOLO_SAVE_KEY) ?? 'null');
    if (!data || data.v !== 1 || !data.settings?.coop) return null;
    if (data.state?.v !== STATE_VERSION || data.state.mode !== 'coop' || data.state.status !== 'playing') return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSolo(storage = defaultStorage()) {
  try { storage?.removeItem(SOLO_SAVE_KEY); } catch { /* ignoré */ }
}

/** Enregistre le contrôleur local à chaque changement ; renvoie la fonction d'arrêt. */
export function persistSolo(controller, settings, { storage = defaultStorage() } = {}) {
  const sync = () => {
    const { state } = controller;
    if (state.status === 'ended') clearSolo(storage);
    else saveSolo({ settings, state }, storage);
  };
  const off = controller.onChange(sync);
  sync();
  return off;
}
