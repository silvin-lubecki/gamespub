// Mesure du temps de réflexion de l'IA (recette PeerJS, DESIGN §8.3, §13) : enveloppe de `bots` qui chronomètre
// `chooseAction`. Seul l'hôte (ou le solo) calcule l'IA : un invité ne mesure rien. Aucune incidence sur le jeu.
const MAX_SAMPLES = 500;
let samples = [];

const now = () => (globalThis.performance?.now ? globalThis.performance.now() : Date.now());

export function timeBots(bots) {
  return {
    ...bots,
    chooseAction: (...args) => {
      const t0 = now();
      try { return bots.chooseAction(...args); } finally {
        samples.push(now() - t0);
        if (samples.length > MAX_SAMPLES) samples.shift();
      }
    },
  };
}

export const resetAiStats = () => { samples = []; };

/** → { n, median, p95, max } en millisecondes (n = 0 : rien mesuré). */
export function aiStats() {
  const sorted = samples.slice().sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return { n: 0, median: 0, p95: 0, max: 0 };
  const at = (q) => sorted[Math.min(n - 1, Math.ceil(q * n) - 1)];
  return { n, median: at(0.5), p95: at(0.95), max: sorted[n - 1] };
}
