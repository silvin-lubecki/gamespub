// RDC-07 (DESIGN.md §9.2) : nom du joueur saisi à l'accueil, mémorisé dans `rdc:name`. Module pur, `storage` injectable.
import { DEFAULT_NAME, NAME_KEY } from './solo.js';

export { DEFAULT_NAME, NAME_KEY };
export const NAME_MAX = 20;

/** Nom nettoyé : espaces rognés et condensés, 20 caractères au plus ; repli sur `fallback` s'il est vide. */
export function cleanName(raw, fallback = DEFAULT_NAME) {
  const name = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim();
  return name || fallback;
}

export function loadName(storage = globalThis.localStorage) {
  try { return storage.getItem(NAME_KEY) ?? ''; } catch { return ''; }
}

export function saveName(name, storage = globalThis.localStorage) {
  try { storage.setItem(NAME_KEY, name); } catch { /* sans persistance */ }
}
