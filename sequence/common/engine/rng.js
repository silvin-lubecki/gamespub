// COM-01 (DESIGN-plateforme §4, §5.1) : PRNG mulberry32.
// Deux API : fonctionnelle (l'état est un uint32 stocké dans l'état de jeu JSON : `seedState`, `next`, `shuffleState`)
// et à état caché (`mulberry32`, `shuffle`, `pick`) pour les IA, les contrôleurs et les tests.

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

/** Fisher-Yates fonctionnel ; ne mute pas son argument → { array, rng }. */
export function shuffleState(array, rngState) {
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

/** Générateur à état caché : `() => [0, 1)`, même suite que `next` itéré depuis `seedState(seed)`. */
export function mulberry32(seed) {
  let s = seedState(seed);
  return () => {
    const r = next(s);
    s = r.rng;
    return r.value;
  };
}

/** Graine aléatoire 32 bits (crypto injectable). */
export function randomSeed(cryptoApi = globalThis.crypto) {
  return cryptoApi.getRandomValues(new Uint32Array(1))[0];
}

/** Fisher-Yates avec un générateur `rng()` ; renvoie un nouveau tableau. */
export function shuffle(rng, array) {
  const out = array.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Élément tiré au hasard (undefined si le tableau est vide). */
export function pick(rng, array) {
  return array[Math.floor(rng() * array.length)];
}
