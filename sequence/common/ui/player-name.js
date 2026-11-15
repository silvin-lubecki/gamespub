// COM-01 : nom du joueur. Module pur ; la persistance (`<id>:name`) est dans storage.js (`store.name`).
export const NAME_MAX = 20;
export const DEFAULT_NAME = 'Joueur';

/** Nom nettoyé : espaces rognés et condensés, 20 caractères au plus ; repli sur `fallback` s'il est vide. */
export function cleanName(raw, fallback = DEFAULT_NAME) {
  const name = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim();
  return name || fallback;
}
