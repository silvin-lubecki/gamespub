// RDC-06 (DESIGN.md §9.4, §8.2) : mode Solo contre l'IA, sans DOM : paramètres d'URL, noms, sauvegarde `rdc:solo`.
import { STATE_VERSION } from '../engine/index.js';
import { POLICIES } from '../ai/policy.js';

export const SOLO_KEY = 'rdc:solo';
export const NAME_KEY = 'rdc:name';
export const DEFAULT_NAME = 'Joueur';
export const BOT_NAMES = ['Bilal', 'Chloé', 'Driss'];

/**
 * Paramètres d'URL : `?seed=N` (entier à 9 chiffres au plus), `?botDelay=ms` (entier ≥ 0, sinon délai par défaut du pilote),
 * `?autoplay=1` (le siège humain est piloté par l'IA).
 */
export function parseParams(search) {
  const p = new URLSearchParams(search);
  const seed = p.get('seed') ?? '';
  const delay = p.get('botDelay') ?? '';
  return {
    seed: /^\d{1,9}$/.test(seed) ? Number(seed) : null,
    botDelay: /^\d{1,7}$/.test(delay) ? Number(delay) : undefined,
    autoplay: p.get('autoplay') === '1',
  };
}

/** Sauvegarde l'état et les personnalités ; ignore une erreur de stockage (quota, mode privé). */
export function saveSolo(storage, { state, policies }) {
  try {
    storage.setItem(SOLO_KEY, JSON.stringify({ state, policies }));
  } catch {
    // la partie continue sans reprise possible
  }
}

/** Partie sauvegardée { state, policies }, ou null (absente, illisible, autre version, déjà terminée). */
export function loadSolo(storage) {
  try {
    const data = JSON.parse(storage.getItem(SOLO_KEY));
    const ok = data?.state?.v === STATE_VERSION && data.state.phase !== 'ended'
      && Array.isArray(data.policies) && data.policies.length === 4
      && data.policies.every((p) => p === null || POLICIES.includes(p))
      && Array.isArray(data.state.players) && data.state.players.length === 4;
    return ok ? data : null;
  } catch {
    return null;
  }
}

export function clearSolo(storage) {
  try {
    storage.removeItem(SOLO_KEY);
  } catch {
    // sans effet
  }
}
