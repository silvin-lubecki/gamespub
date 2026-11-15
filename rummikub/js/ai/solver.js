// Solveur de réarrangement complet de l'IA Normale (DESIGN §8.3, D6).
//
// Problème : étant donné la table (combinaisons actuelles, toutes ses tuiles doivent rester posées) et le chevalet,
// trouver une partition de (table ∪ S), S ⊆ chevalet, en combinaisons valides qui maximise |S|, puis la valeur des tuiles
// naturelles posées, puis le nombre de jokers du chevalet conservés. Le choix du départage est décrit dans
// docs/DESIGN.md (RUM-02) : les jokers posés comptent dans |S| mais pas dans la valeur, sinon le 3ᵉ critère serait vide.
//
// Méthode : programmation dynamique mémoïsée par valeur 1 à 13, inspirée de J. N. van Rijn, F. W. Takes et J. K. Vis,
// « The Complexity of Rummikub Problems », BNAIC 2015, arXiv:1604.07553 : §4 (algorithme maxScore, état = longueurs de
// suite 0, 1, 2 ou ≥ 3 par couleur et par exemplaire) et §4.5 (dimension « jokers utilisés »). Adaptations de ce solveur :
// objectif |S| puis valeur puis jokers gardés ; groupes complets obligatoires (l'article laisse « le plus grand groupe
// possible ») ; tuiles et jokers de la table obligatoires (u ≥ T par couleur et valeur, j ≥ jokers de table au terminal).
//   - État : par couleur, au plus 2 suites ouvertes (il n'y a que 2 exemplaires de chaque tuile), codées par leur
//     longueur plafonnée à 3 et triées ; jokers utilisés ; naturelles de la valeur courante laissées aux groupes
//     (cumul L et drapeau « une couleur en laisse 2 »).
//   - Étapes : (valeur, couleur) choisit combien de tuiles du chevalet sont posées et ce qu'elles font (prolonger,
//     ouvrir ou fermer une suite, ou rester pour un groupe) ; l'étape « groupes » de la valeur répartit les restes en
//     groupes et choisit les jokers de groupe.
//   - Hypothèse (vérifiée par l'oracle des tests, non démontrée) : deux suites ouvertes par couleur suffisent ; une
//     troisième suite simultanée de même couleur ne se justifie que par un joker et peut se réarranger.
// Le parcours est en profondeur (« anytime ») avec un budget déterministe de nœuds : si le budget est dépassé on garde le
// meilleur chemin complet déjà trouvé (`complete: false`) ; sinon la stratégie Facile prend le relais (normal.js).
import { analyzeSet } from '../engine/sets.js';
import { colorOf, isJoker, numOf } from '../engine/tiles.js';

export const MAX_NODES = 200000;

// Score additif : |S| (×4096) > valeur des naturelles posées (×4, ≤ 728) > jokers conservés (< 4).
export const COUNT_WEIGHT = 4096;
export const VALUE_WEIGHT = 4;

const STEPS = 13 * 5; // 5 étapes par valeur : 4 couleurs, puis les groupes
const P10 = [1, 10, 100, 1000];

// Paires canoniques (a ≤ b) de longueurs de suites ouvertes.
const PAIRS = [];
const PAIR_IDX = Array(16).fill(-1);
for (let a = 0; a < 4; a++) for (let b = a; b < 4; b++) { PAIR_IDX[a * 4 + b] = PAIRS.length; PAIRS.push([a, b]); }
const pairIdx = (a, b) => (a <= b ? PAIR_IDX[a * 4 + b] : PAIR_IDX[b * 4 + a]);

// Actions d'une suite ouverte de longueur r : 0 laisser vide, 1 tuile naturelle, 2 joker, 3 fermer.
function slotActions(r) {
  if (r === 0) return [{ act: 0, nat: 0, jok: 0, len: 0 }, { act: 1, nat: 1, jok: 0, len: 1 }, { act: 2, nat: 0, jok: 1, len: 1 }];
  const len = Math.min(r + 1, 3);
  const extend = [{ act: 1, nat: 1, jok: 0, len }, { act: 2, nat: 0, jok: 1, len }];
  return r === 3 ? [...extend, { act: 3, nat: 0, jok: 0, len: 0 }] : extend;
}

// OPTS[pair * 3 + u] : options pour une paire de suites quand u tuiles naturelles de la couleur sont posées à cette valeur.
// Une suite de longueur 1 ou 2 doit être prolongée ; fermer puis rouvrir à la même valeur n'a pas d'intérêt (on prolonge).
const OPTS = [];
for (let pi = 0; pi < PAIRS.length; pi++) {
  const [ra, rb] = PAIRS[pi];
  for (let u = 0; u <= 2; u++) {
    const list = [];
    const seen = new Set();
    for (const x of slotActions(ra)) {
      for (const y of slotActions(rb)) {
        const nr = x.nat + y.nat;
        if (nr > u) continue;
        const jr = x.jok + y.jok;
        const np = pairIdx(x.len, y.len);
        const sig = np * 16 + nr * 4 + jr;
        if (seen.has(sig)) continue;
        seen.add(sig);
        list.push({ np, nr, jr, acts: [x.act, y.act] });
      }
    }
    OPTS.push(list);
  }
}

// GROUP_OK[(L * 2 + m2) * 3 + jg] : L naturelles restantes (dont une couleur en a 2 si m2) + jg jokers forment-elles
// des groupes valides (g groupes de 3 ou 4 tuiles, couleurs distinctes) ? Retourne g, sinon 0.
const groupCount = (L, m2, jg) => {
  if (L === 0) return jg === 0 ? -1 : 0; // -1 : aucun groupe, valide
  for (let g = m2 ? 2 : 1; g <= 3; g++) if (3 * g <= L + jg && L + jg <= 4 * g) return g;
  return 0;
};
const GROUP_G = [];
for (let L = 0; L <= 8; L++) for (let m2 = 0; m2 <= 1; m2++) for (let jg = 0; jg <= 2; jg++) GROUP_G.push(groupCount(L, m2, jg));

function indexTiles(table, rack) {
  const slots = () => Array.from({ length: 14 * 4 }, () => []);
  const tableAt = slots(), rackAt = slots();
  const tableJokers = [], rackJokers = [];
  for (const id of table.flat()) {
    if (isJoker(id)) tableJokers.push(id);
    else tableAt[numOf(id) * 4 + colorOf(id)].push(id);
  }
  for (const id of rack) {
    if (isJoker(id)) rackJokers.push(id);
    else rackAt[numOf(id) * 4 + colorOf(id)].push(id);
  }
  return { tableAt, rackAt, tableJokers, rackJokers };
}

/**
 * solve(table, rack, { maxNodes }) → { sets, played, count, value, kept, nodes, complete }.
 * `sets` est la table complète proposée (null s'il n'y a pas de solution) ; `played` les tuiles du chevalet posées ;
 * `complete` est faux si le budget de nœuds a été dépassé (le résultat est alors le meilleur chemin trouvé).
 */
export function solve(table, rack, { maxNodes = MAX_NODES } = {}) {
  const { tableAt, rackAt, tableJokers, rackJokers } = indexTiles(table, rack);
  const TJ = tableJokers.length;
  const J = TJ + rackJokers.length;
  if (J > 2) throw new RangeError('le solveur suppose au plus 2 jokers (clé de mémo et groupes dimensionnés pour 2)');
  const memo = new Map();
  const choice = new Map();
  let nodes = 0;
  let exhausted = false;

  function go(s, pk, j, L, m2) {
    if (nodes >= maxNodes) { exhausted = true; return -1; }
    nodes++;
    if (s === STEPS) {
      if (j < TJ) return -1;
      for (let c = 0; c < 4; c++) {
        const [a, b] = PAIRS[((pk / P10[c]) | 0) % 10];
        if ((a !== 0 && a !== 3) || (b !== 0 && b !== 3)) return -1;
      }
      return (j - TJ) * COUNT_WEIGHT + (J - j);
    }
    const key = (((s * 10000 + pk) * 3 + j) * 9 + L) * 2 + m2;
    const known = memo.get(key);
    if (known !== undefined) return known;
    let best = -1, bestChoice = -1;
    const c = s % 5;
    if (c === 4) {
      for (let jg = 0; jg + j <= J && jg <= 2; jg++) {
        if (GROUP_G[(L * 2 + m2) * 3 + jg] === 0) continue;
        const val = go(s + 1, pk, j + jg, 0, 0);
        if (val > best) { best = val; bestChoice = jg; }
      }
    } else {
      const v = (s / 5 | 0) + 1;
      const pi = ((pk / P10[c]) | 0) % 10;
      const tn = tableAt[v * 4 + c].length, hn = rackAt[v * 4 + c].length;
      for (let k = hn; k >= 0; k--) {
        const u = tn + k;
        if (u > 2) continue;
        const opts = OPTS[pi * 3 + u];
        for (let oi = 0; oi < opts.length; oi++) {
          const o = opts[oi];
          if (j + o.jr > J) continue;
          const l = u - o.nr;
          const val = go(s + 1, pk + (o.np - pi) * P10[c], j + o.jr, L + l, l === 2 ? 1 : m2);
          if (val < 0) continue;
          const total = val + k * (COUNT_WEIGHT + VALUE_WEIGHT * v);
          if (total > best) { best = total; bestChoice = k * 64 + oi; }
        }
      }
    }
    if (bestChoice >= 0) choice.set(key, bestChoice);
    if (!exhausted) memo.set(key, best);
    return best;
  }

  const score = go(0, 0, 0, 0, 0);
  const none = { sets: null, played: [], count: 0, value: 0, kept: 0, nodes, complete: !exhausted };
  if (score < 0) return none;

  // Reconstruction : on rejoue les choix de la racine.
  const slots = Array.from({ length: 4 }, () => [null, null]); // suites ouvertes par couleur, triées par longueur plafonnée
  const sets = [];
  const played = [];
  const jokerQueue = [...tableJokers, ...rackJokers];
  let jokerUsed = 0;
  const takeJoker = () => {
    const id = jokerQueue[jokerUsed++];
    if (jokerUsed > TJ) played.push(id);
    return id;
  };
  const lenOf = (run) => (run ? Math.min(run.length, 3) : 0);
  let pk = 0, j = 0, L = 0, m2 = 0;
  let leftovers = [];
  for (let s = 0; s < STEPS; s++) {
    const key = (((s * 10000 + pk) * 3 + j) * 9 + L) * 2 + m2;
    const ch = choice.get(key);
    if (ch === undefined) return none;
    const c = s % 5;
    if (c === 4) {
      const jg = ch;
      const g = GROUP_G[(L * 2 + m2) * 3 + jg];
      if (g > 0) {
        // Répartition en tourniquet (couleurs distinctes tant que chaque couleur a au plus g restes), puis jokers.
        const groups = Array.from({ length: g }, () => []);
        let p = 0;
        for (const id of leftovers.sort((x, y) => colorOf(x) - colorOf(y))) groups[p++ % g].push(id);
        for (let n = 0; n < jg; n++) {
          const target = groups.filter((group) => group.length < 4).sort((x, y) => x.length - y.length)[0];
          target.push(takeJoker());
        }
        sets.push(...groups);
      }
      leftovers = [];
      j += jg; L = 0; m2 = 0;
      continue;
    }
    const v = (s / 5 | 0) + 1;
    const k = ch >> 6, oi = ch & 63;
    const pi = ((pk / P10[c]) | 0) % 10;
    const o = OPTS[pi * 3 + tableAt[v * 4 + c].length + k][oi];
    const pool = [...tableAt[v * 4 + c], ...rackAt[v * 4 + c].slice(0, k)];
    for (const id of rackAt[v * 4 + c].slice(0, k)) played.push(id);
    const pair = slots[c].slice().sort((a, b) => lenOf(a) - lenOf(b));
    for (let i = 0; i < 2; i++) {
      const act = o.acts[i];
      if (act === 0) continue;
      if (act === 3) { sets.push(pair[i]); pair[i] = null; continue; }
      const id = act === 1 ? pool.shift() : takeJoker();
      if (pair[i]) pair[i].push(id); else pair[i] = [id];
    }
    slots[c] = pair;
    leftovers.push(...pool);
    pk += (o.np - pi) * P10[c];
    j += o.jr;
    L += pool.length;
    if (pool.length === 2) m2 = 1;
  }
  for (const pair of slots) for (const run of pair) if (run) sets.push(run);
  // Garde défensive : le résultat doit être exactement table ⊎ played, en combinaisons valides.
  const expected = [...table.flat(), ...played].sort((x, y) => x - y).join();
  if (sets.flat().sort((x, y) => x - y).join() !== expected || !sets.every((set) => analyzeSet(set) !== null)) return { ...none, invalid: true };
  const naturals = played.filter((id) => !isJoker(id));
  const jokersPlayed = played.length - naturals.length;
  return {
    sets, played, count: played.length, value: naturals.reduce((sum, id) => sum + numOf(id), 0),
    kept: rackJokers.length - jokersPlayed, nodes, complete: !exhausted,
  };
}
