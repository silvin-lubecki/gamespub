// Dictionnaire : recherche de mots. Pur (ni DOM ni réseau), utilisable navigateur + Node.
// H7 : les mots d'une lettre légaux (A, O, Y) figurent dans dict/fr.txt ; H13 : dictionnaire permissif.

/** Majuscules, sans accents ; œ→OE, æ→AE. */
export function normalizeWord(s) {
  return String(s)
    .replace(/œ/g, 'oe').replace(/Œ/g, 'OE')
    .replace(/æ/g, 'ae').replace(/Æ/g, 'AE')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

/**
 * Index de préfixes (D19) : trie en tableaux typés (premier fils / frère suivant), racine = nœud 0. Seules les lignes
 * A–Z entrent dans l'index (les autres ne peuvent jamais correspondre à `has()`, qui compare à un mot normalisé).
 * `next(nœud, lettre 0..25)` → nœud fils ou -1 ; `isWord(nœud)` → vrai si le chemin est un mot.
 */
export function buildTrie(words) {
  let total = 1;
  for (const w of words) total += w.length;
  let letter = new Uint8Array(total);
  let firstChild = new Int32Array(total).fill(-1);
  let nextSibling = new Int32Array(total).fill(-1);
  let terminal = new Uint8Array(total);
  let count = 1;
  for (const w of words) {
    if (!/^[A-Z]+$/.test(w)) continue;
    let node = 0;
    for (let i = 0; i < w.length; i++) {
      const li = w.charCodeAt(i) - 65;
      let child = firstChild[node];
      while (child !== -1 && letter[child] !== li) child = nextSibling[child];
      if (child === -1) {
        child = count++;
        letter[child] = li;
        nextSibling[child] = firstChild[node];
        firstChild[node] = child;
      }
      node = child;
    }
    terminal[node] = 1;
  }
  letter = letter.slice(0, count);
  firstChild = firstChild.slice(0, count);
  nextSibling = nextSibling.slice(0, count);
  terminal = terminal.slice(0, count);
  return {
    nodeCount: count,
    next(node, li) {
      let child = firstChild[node];
      while (child !== -1 && letter[child] !== li) child = nextSibling[child];
      return child;
    },
    isWord: (node) => terminal[node] === 1,
  };
}

/** Construit le dictionnaire à partir du texte de dict/fr.txt (un mot A–Z par ligne). */
export function createDictionary(text) {
  const words = new Set(text.split('\n').map((w) => w.trim()).filter((w) => w !== ''));
  let trie = null;
  return {
    /** Index de préfixes, construit au premier accès seulement (LU-20, ≈ 30 ms pour dict/fr.txt). */
    get trie() {
      return (trie ??= buildTrie(words));
    },
    has(word) {
      return words.has(normalizeWord(word));
    },
    get size() {
      return words.size;
    },
  };
}
