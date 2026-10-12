// PRNG mulberry32 fonctionnel : l'état est un entier uint32 stocké dans l'état de jeu.

/** Normalise une graine en état uint32. */
export function seedState(seed) {
  return seed >>> 0;
}

/** next(state) → { value: [0, 1), rng: nouvel état }. */
export function next(rngState) {
  const state = (rngState + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, rng: state };
}

/** Fisher-Yates ; ne mute pas son argument → { array, rng }. */
export function shuffle(array, rngState) {
  const out = array.slice();
  let rng = rngState;
  for (let i = out.length - 1; i > 0; i--) {
    const r = next(rng);
    rng = r.rng;
    const j = Math.floor(r.value * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return { array: out, rng };
}
