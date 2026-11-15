// Validation d'une combinaison (DESIGN §8.1, §8.2) : `analyzeSet(ids) → { kind, value, jokerAs[] } | null`.
// H-RUM-6 : deux jokers dans une même combinaison sont autorisés.
// H-RUM-7 : l'ordre des tuiles est ignoré ; un joker prend la lecture de plus grande valeur (il comble d'abord les
// trous, puis prolonge vers le haut, puis vers le bas une fois le 13 atteint). Avec 1 tuile naturelle et 2 jokers,
// on retient du groupe ou de la suite celui qui vaut le plus. `value` est la valeur de première pose.
import { colorOf, isJoker, numOf } from './tiles.js';

const analyzeGroup = (naturals, jokers) => {
  const size = naturals.length + jokers;
  if (size < 3 || size > 4) return null;
  const num = numOf(naturals[0]);
  const used = new Set();
  for (const id of naturals) {
    if (numOf(id) !== num || used.has(colorOf(id))) return null;
    used.add(colorOf(id));
  }
  const jokerAs = [0, 1, 2, 3].filter((c) => !used.has(c)).slice(0, jokers).map((color) => ({ num, color }));
  return { kind: 'group', value: num * size, jokerAs };
};

const analyzeRun = (naturals, jokers) => {
  const size = naturals.length + jokers;
  if (size < 3 || size > 13) return null;
  const color = colorOf(naturals[0]);
  const nums = naturals.map(numOf).sort((a, b) => a - b);
  for (let i = 0; i < nums.length; i++) if (colorOf(naturals[i]) !== color || (i > 0 && nums[i] === nums[i - 1])) return null;
  const start = Math.min(nums[0], 14 - size);
  if (start < 1 || start + size - 1 < nums[nums.length - 1]) return null;
  const present = new Set(nums);
  const jokerAs = [];
  for (let n = start; n < start + size; n++) if (!present.has(n)) jokerAs.push({ num: n, color });
  return { kind: 'run', value: (start + start + size - 1) * size / 2, jokerAs };
};

export function analyzeSet(ids) {
  if (!Array.isArray(ids) || ids.length < 3 || new Set(ids).size !== ids.length) return null; // tuiles distinctes
  const naturals = ids.filter((id) => !isJoker(id));
  const jokers = ids.length - naturals.length;
  if (naturals.length === 0) return null;
  const group = analyzeGroup(naturals, jokers);
  const run = analyzeRun(naturals, jokers);
  if (group && run) return group.value >= run.value ? group : run;
  return group ?? run;
}
