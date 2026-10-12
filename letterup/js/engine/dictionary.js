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

/** Construit le dictionnaire à partir du texte de dict/fr.txt (un mot A–Z par ligne). */
export function createDictionary(text) {
  const words = new Set(text.split('\n').map((w) => w.trim()).filter((w) => w !== ''));
  return {
    has(word) {
      return words.has(normalizeWord(word));
    },
    get size() {
      return words.size;
    },
  };
}
