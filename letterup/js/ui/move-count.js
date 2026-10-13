// Compteur de mots possibles (LU-21, DESIGN.md §17, H24, D16). Pas de DOM : l'écran Partie affiche le résultat.
// H24 : nombre de mots principaux distincts jouables sur l'état validé (plafonné à `cap`, « 100+ »). Calcul local, sur le
// thread principal, en tranches de 8 ms au plus (une tranche = au moins un segment de ligne), reprises par `schedule`.
import { createPlaySearch } from '../engine/index.js';

export const SLICE_MS = 8;

/**
 * `update(view, player)` lance (ou relance) le calcul ; `onResult(cb)` reçoit `null` pendant le calcul puis `{ words, capped }`.
 * Un nouvel `update()`, une partie terminée ou `dispose()` abandonnent le calcul en cours : jamais de résultat périmé.
 */
export function createMoveCounter({ dict, cap = 100, now = () => performance.now(), schedule = (fn) => setTimeout(fn, 0) }) {
  const listeners = new Set();
  let generation = 0;
  let disposed = false;
  void dict.trie; // préchauffage : le premier calcul construit l'index de préfixes (≈ 15–30 ms), autant le faire ici

  const emit = (r) => { for (const cb of [...listeners]) cb(r); };

  function update(view, player) {
    const mine = ++generation; // invalide toute tranche déjà planifiée
    if (disposed || view.status !== 'playing') return;
    const search = createPlaySearch(view, player, dict, { cap });
    emit(null);
    const slice = () => {
      if (mine !== generation) return;
      const t0 = now();
      const done = search.step(() => now() - t0 > SLICE_MS);
      if (mine !== generation) return; // un écouteur ou la recherche elle-même ont pu relancer un calcul
      if (done) {
        const { words, capped } = search.result();
        emit({ words, capped });
      } else schedule(slice);
    };
    schedule(slice);
  }

  return {
    update,
    onResult(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    dispose() {
      disposed = true;
      generation++;
      listeners.clear();
    },
  };
}
