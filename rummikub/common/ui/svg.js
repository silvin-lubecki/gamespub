// COM-02 (DESIGN-plateforme §3 D7) : constructeurs de chaînes HTML/SVG, purs et testables sans DOM.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Échappe un texte pour l'insérer dans du HTML ou dans une valeur d'attribut. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** `{ a: 1, b: true, c: false, d: null }` → ` a="1" b` (les valeurs nulles, `false` et `undefined` sont omises). */
export function attrs(obj = {}) {
  return Object.entries(obj)
    .filter(([, v]) => v !== null && v !== undefined && v !== false)
    .map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${esc(v)}"`))
    .join('');
}

const VOID = new Set(['input', 'br', 'img', 'hr', 'meta', 'link']);

/** Élément en chaîne : `el('rect', { x: 1 })`, `el('g', {}, [el('path', { d })])` ; `children` : chaîne ou liste de chaînes (non échappées). */
export function el(tag, attributes = {}, children = '') {
  const inner = Array.isArray(children) ? children.join('') : children;
  return VOID.has(tag) ? `<${tag}${attrs(attributes)}>` : `<${tag}${attrs(attributes)}>${inner}</${tag}>`;
}

/** `<svg>` avec `viewBox` ; `w`/`h` donnent la taille du `viewBox` et, sauf `fluid`, `width`/`height`. */
export function svg({ w, h, fluid = true, ...rest } = {}, children = '') {
  return el('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox: `0 0 ${w} ${h}`,
    ...(fluid ? {} : { width: w, height: h }),
    ...rest,
  }, children);
}
