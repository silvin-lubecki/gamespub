// Recherche de combinaisons dans un ensemble de tuiles (DESIGN §8.3) : partition de tuiles en groupes et suites
// (jokers compris) maximisant la valeur ou le nombre de tuiles posées. Retour arrière sur la plus petite tuile restante,
// avec un budget de nœuds déterministe : au-delà, on renvoie le meilleur résultat trouvé.
import { analyzeSet } from '../engine/sets.js';
import { isJoker, numOf, colorOf } from '../engine/tiles.js';
import { INITIAL_MELD } from '../engine/index.js';

const TYPES = 52; // type = (nombre - 1) * 4 + couleur

/**
 * bestPartition(tiles, { objective: 'value' | 'count', maxNodes }) → { sets: number[][], value, count }.
 * 'value' : somme des valeurs posées d'abord, puis nombre de tuiles ; 'count' : l'inverse.
 */
export function bestPartition(tiles, { objective = 'value', maxNodes = 20000 } = {}) {
  const byType = Array.from({ length: TYPES }, () => []);
  const jokerIds = [];
  for (const id of tiles) {
    if (isJoker(id)) jokerIds.push(id);
    else byType[(numOf(id) - 1) * 4 + colorOf(id)].push(id);
  }
  const cnt = byType.map((l) => l.length);
  const better = (v, c) => {
    if (!best) return true;
    return objective === 'value' ? v > best.value || (v === best.value && c > best.count) : c > best.count || (c === best.count && v > best.value);
  };
  let best = null;
  let nodes = 0;
  const stack = [];

  function search(pos, jokersLeft, value, count) {
    if (best && nodes++ > maxNodes) return;
    while (pos < TYPES && cnt[pos] === 0) pos++;
    if (pos === TYPES) {
      if (better(value, count)) best = { patterns: stack.slice(), value, count };
      return;
    }
    const num = (pos >> 2) + 1, color = pos & 3;
    // Suites : têtes de joker (h), puis prolongement jusqu'à 13 avec les tuiles disponibles ou des jokers.
    for (let h = 0; h <= Math.min(2, jokersLeft, num - 1); h++) {
      const types = [pos];
      let jokers = h, sum = 0;
      for (let k = num - h; k <= num; k++) sum += k;
      cnt[pos]--;
      for (let n = num; ; n++) {
        const length = types.length + jokers;
        if (length >= 3) {
          stack.push({ types: types.slice(), jokers, value: sum });
          for (const t of types) if (t !== pos) cnt[t]--;
          search(pos, jokersLeft - jokers, value + sum, count + length);
          for (const t of types) if (t !== pos) cnt[t]++;
          stack.pop();
        }
        if (n === 13) break;
        const t = n * 4 + color; // type du nombre n + 1
        if (cnt[t] > 0 && !types.includes(t)) types.push(t);
        else if (jokers < jokersLeft && jokers < 2) jokers++;
        else break;
        sum += n + 1;
      }
      cnt[pos]++;
    }
    // Groupes : la tuile, plus 2 ou 3 autres couleurs (tuile naturelle, joker ou rien).
    const others = [0, 1, 2, 3].filter((c) => c !== color);
    for (let mask = 0; mask < 27; mask++) {
      const types = [pos];
      let jokers = 0, m = mask;
      for (const c of others) {
        const choice = m % 3; m = (m - choice) / 3;
        const t = (num - 1) * 4 + c;
        if (choice === 1 && cnt[t] > 0) types.push(t);
        else if (choice === 2 && jokers < jokersLeft) jokers++;
        else if (choice !== 0) { types.length = 0; break; }
      }
      const size = types.length + jokers;
      if (types.length === 0 || size < 3) continue;
      stack.push({ types: types.slice(), jokers, value: num * size });
      for (const t of types) cnt[t]--;
      search(pos, jokersLeft - jokers, value + num * size, count + size);
      for (const t of types) cnt[t]++;
      stack.pop();
    }
    // Tuile laissée de côté.
    cnt[pos]--;
    search(pos, jokersLeft, value, count);
    cnt[pos]++;
  }
  search(0, jokerIds.length, 0, 0);

  const pools = byType.map((l) => l.slice());
  const jokerPool = jokerIds.slice();
  const sets = best.patterns.map((p) => [...p.types.map((t) => pools[t].pop()), ...Array.from({ length: p.jokers }, () => jokerPool.pop())]);
  return { sets, value: best.value, count: best.count };
}

/** Première pose : meilleure partition du chevalet seul, valeur de première pose ≥ 30 (analyzeSet), sinon null. */
export function bestInitialMeld(rack, { maxNodes } = {}) {
  const { sets } = bestPartition(rack, { objective: 'value', maxNodes });
  const value = sets.reduce((sum, set) => sum + analyzeSet(set).value, 0);
  return value >= INITIAL_MELD ? { sets, value } : null;
}
