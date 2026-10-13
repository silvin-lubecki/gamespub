// Recherche des coups jouables (LU-20, DESIGN.md §17). Pur (ni DOM ni réseau), utilisable navigateur + Node.
// H24 : le « nombre de mots possibles » est le nombre de mots principaux distincts des coups que `validatePlay`
// accepterait sur l'état validé avec le chevalet courant, plafonné (D16). H23 : sens libre, une tuile seule se lit
// en H si ce mot a au moins 2 lettres, sinon en V ; H6 : premier coup d'au moins 2 tuiles sur le Soleil ;
// H7 : un mot d'une lettre ne peut pas être principal (toute case occupée a un voisin occupé), les segments font 2 à 7 cases.
// Algorithme : segments maximaux de ligne, parcours en profondeur guidé par le trie (`dict.trie`), masques de mots croisés.
import { SIZE, CELLS, CENTER, MAX_STACK, JOKER } from './constants.js';
import { isBoardEmpty, lineCells } from './board.js';

const ALL = (1 << 26) - 1;
const A = 65;

/**
 * Recherche reprenable par segment de ligne.
 * → `{ step(shouldStop) → boolean (terminé), result() → { words, plays, capped, nodes } }`.
 * `capped` : plus de `cap` mots distincts existent (`words` vaut alors exactement `cap`).
 * Interne : `collect` demande la liste détaillée des coups (utilisée par `findPlays`).
 */
function createSearch(view, player, dict, cap, collect) {
  const words = new Set();
  const seen = new Set();
  const plays = [];
  let capped = false;
  let done = view.status !== 'playing' || view.current !== player; // 'game-over' / 'not-your-turn' : aucun coup
  let nodes = 0;
  let segments = null;
  let nextSegment = 0;
  let ctx = null;

  const result = () => ({ words: words.size, plays: seen.size, capped, nodes });

  function init() {
    const { board } = view;
    const trie = dict.trie;
    const rack = view.players[player].rack;
    const counts = Array(26).fill(0);
    let jokers = 0;
    for (const t of rack) {
      if (t === JOKER) jokers++;
      else counts[t.charCodeAt(0) - A]++;
    }
    const top = new Int8Array(CELLS).fill(-1);
    const occupied = new Uint8Array(CELLS);
    for (let c = 0; c < CELLS; c++) {
      const pile = board[c];
      if (pile.length > 0) {
        occupied[c] = 1;
        top[c] = pile[pile.length - 1].l.charCodeAt(0) - A;
      }
    }
    // Case où l'on peut poser : vide (ni motte ni verrouillée) ou recouvrable (ni verrouillée ni pile pleine).
    const placeable = new Uint8Array(CELLS);
    const adj = new Uint8Array(CELLS);
    for (let c = 0; c < CELLS; c++) {
      const r = Math.floor(c / SIZE), col = c % SIZE;
      placeable[c] = !view.locked[c] && board[c].length < MAX_STACK && !view.mottes.includes(c) ? 1 : 0;
      adj[c] = (r > 0 && occupied[c - SIZE]) || (r < SIZE - 1 && occupied[c + SIZE])
        || (col > 0 && occupied[c - 1]) || (col < SIZE - 1 && occupied[c + 1]) ? 1 : 0;
    }
    // cross[0][c] : lettres L telles que le mot vertical (pour un coup H) avec L en c soit un mot ; cross[1] : l'inverse.
    const cross = [new Int32Array(CELLS), new Int32Array(CELLS)];
    for (let d = 0; d < 2; d++) {
      const step = d === 0 ? SIZE : 1; // pas dans la direction perpendiculaire
      const inLine = (c, k) => (d === 0 ? Math.floor(c / SIZE) + k >= 0 && Math.floor(c / SIZE) + k < SIZE
        : (c % SIZE) + k >= 0 && (c % SIZE) + k < SIZE);
      for (let c = 0; c < CELLS; c++) {
        if (!placeable[c]) continue;
        let before = 0;
        while (inLine(c, -(before + 1)) && occupied[c - step * (before + 1)]) before++;
        let after = 0;
        while (inLine(c, after + 1) && occupied[c + step * (after + 1)]) after++;
        if (before === 0 && after === 0) { cross[d][c] = ALL; continue; }
        let node = 0;
        for (let k = before; k >= 1 && node !== -1; k--) node = trie.next(node, top[c - step * k]);
        let mask = 0;
        if (node !== -1) {
          for (let li = 0; li < 26; li++) {
            let n = trie.next(node, li);
            for (let k = 1; k <= after && n !== -1; k++) n = trie.next(n, top[c + step * k]);
            if (n !== -1 && trie.isWord(n)) mask |= 1 << li;
          }
        }
        cross[d][c] = mask;
      }
    }

    const first = isBoardEmpty(board);
    const rackLength = rack.length;
    segments = [];
    for (let d = 0; d < 2; d++) { // H avant V : une tuile seule trouvée dans les deux sens est comptée en H
      const dir = d === 0 ? 'H' : 'V';
      for (let i = 0; i < SIZE; i++) {
        const line = lineCells(i, dir);
        for (let a = 0; a < SIZE; a++) {
          if (a > 0 && occupied[line[a - 1]]) continue;
          let empties = 0;
          for (let b = a; b < SIZE; b++) {
            const cell = line[b];
            if (!occupied[cell]) {
              if (!placeable[cell]) break; // motte ou case verrouillée vide : coupe la ligne
              empties++;
              if (empties > rackLength) break;
            }
            if (b === a) continue;
            if (b < SIZE - 1 && occupied[line[b + 1]]) continue;
            if (first && !(line.indexOf(CENTER) >= a && line.indexOf(CENTER) <= b)) continue;
            segments.push({ d, dir, cells: line.slice(a, b + 1) });
          }
        }
      }
    }
    ctx = { trie, counts, jokers, top, occupied, placeable, adj, cross, first };
  }

  function runSegment(seg) {
    const { trie, counts, top, occupied, placeable, adj, cross, first } = ctx;
    const cells = seg.cells;
    const crossMask = cross[seg.d];
    const letters = [];
    const stack = [];

    function record(placed) {
      if (placed === 0) return;
      const key = stack.map((p) => `${p.cell}${p.letter}${p.joker ? '*' : ''}`).join(',');
      if (seen.has(key)) return;
      const word = letters.join('');
      if (!words.has(word)) {
        if (words.size >= cap) { capped = true; done = true; return; }
        words.add(word);
      }
      seen.add(key);
      if (collect) plays.push({ placements: stack.map((p) => ({ ...p })), word, dir: seg.dir });
    }

    function dfs(i, node, placed, connected) {
      if (done) return;
      if (i === cells.length) {
        if (trie.isWord(node) && (first ? placed >= 2 : connected)) record(placed);
        return;
      }
      const cell = cells[i];
      const here = top[cell];
      if (occupied[cell]) {
        const n = trie.next(node, here);
        if (n !== -1) { nodes++; letters.push(String.fromCharCode(A + here)); dfs(i + 1, n, placed, connected); letters.pop(); }
        if (!placeable[cell]) return;
      }
      const mask = crossMask[cell];
      const link = connected || occupied[cell] === 1 || adj[cell] === 1;
      for (let li = 0; li < 26 && !done; li++) {
        if (!(mask & (1 << li)) || li === here) continue;
        const n = trie.next(node, li);
        if (n === -1) continue;
        const ch = String.fromCharCode(A + li);
        if (counts[li] > 0) {
          counts[li]--; nodes++; letters.push(ch); stack.push({ cell, letter: ch, joker: false });
          dfs(i + 1, n, placed + 1, link);
          stack.pop(); letters.pop(); counts[li]++;
        }
        if (ctx.jokers > 0 && !done) {
          ctx.jokers--; nodes++; letters.push(ch); stack.push({ cell, letter: ch, joker: true });
          dfs(i + 1, n, placed + 1, link);
          stack.pop(); letters.pop(); ctx.jokers++;
        }
      }
    }
    dfs(0, 0, 0, false);
  }

  /** Traite au moins un segment, puis d'autres tant que `shouldStop()` est faux. → vrai quand la recherche est terminée. */
  function step(shouldStop = () => false) {
    if (done) return true;
    if (segments === null) init();
    if (segments.length === 0) return (done = true);
    do {
      runSegment(segments[nextSegment++]);
    } while (!done && nextSegment < segments.length && !shouldStop());
    if (nextSegment >= segments.length) done = true;
    return done;
  }

  return { step, result, plays };
}

/** Recherche reprenable (D16) : `step(shouldStop)` est consulté entre deux segments ; `cap` = plafond de mots (100). */
export function createPlaySearch(view, player, dict, { cap = 100 } = {}) {
  const { step, result } = createSearch(view, player, dict, cap, false);
  return { step, result };
}

/** Recherche synchrone avec la liste des coups : `{ plays: [{ placements: [{ cell, letter, joker }], word, dir }], words, capped, nodes }`. */
export function findPlays(view, player, dict, { cap = Infinity } = {}) {
  const search = createSearch(view, player, dict, cap, true);
  search.step();
  const { capped, nodes } = search.result();
  const plays = search.plays;
  return { plays, words: [...new Set(plays.map((p) => p.word))], capped, nodes };
}

/** Coup de `findPlays` → action `{ type: 'play', placements: [{ cell, rackIndex, letter }] }` pour `applyAction`. */
export function toPlayAction(rack, play) {
  const used = new Set();
  const placements = play.placements.map(({ cell, letter, joker }) => {
    const rackIndex = rack.findIndex((t, i) => !used.has(i) && (joker ? t === JOKER : t === letter));
    used.add(rackIndex);
    return { cell, rackIndex, letter };
  });
  return { type: 'play', placements };
}
