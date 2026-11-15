// Brouillon de tour (DESIGN §8.4, H-RUM-2) : pur, immuable, sans DOM. Le brouillon reste local ; seule la table complète
// validée par `checkPlay` part au moteur. Il garde la table et le chevalet du début de tour pour « Annuler ».
import { analyzeSet } from '../engine/sets.js';
import { checkPlay } from '../engine/index.js';
import { colorOf, isJoker, numOf } from '../engine/tiles.js';

/** Signature du tour : le brouillon n'est refait que si elle change (une resynchronisation réseau ne l'efface pas). */
export const sigOf = (view) => JSON.stringify([view.you, view.current, view.phase, view.table, view.rack]);

/** Ordre d'affichage du chevalet : l'ordre précédent, sans les tuiles parties, puis les nouvelles (tuile piochée) à la fin. */
export const syncOrder = (prev, rack) => [...prev.filter((id) => rack.includes(id)), ...rack.filter((id) => !prev.includes(id))];

export const createDraft = (view, order = []) => ({
  sig: sigOf(view), baseTable: view.table.map((s) => s.slice()), baseRack: view.rack.slice(),
  sets: view.table.map((s) => s.slice()), rack: syncOrder(order, view.rack), selected: [],
});

export const undo = (d) => ({ ...d, sets: d.baseTable.map((s) => s.slice()), rack: syncOrder(d.rack, d.baseRack), selected: [] });

export const isBaseTile = (d, id) => d.baseTable.some((s) => s.includes(id));
export const placedThisTurn = (d, id) => d.baseRack.includes(id) && !d.rack.includes(id);
/** Avant la première pose, les tuiles de la table sont figées (DESIGN §8.1). */
export const locked = (d, view, id) => !view.melded[view.you] && isBaseTile(d, id);
export const isDirty = (d) => d.rack.length !== d.baseRack.length || JSON.stringify(d.sets) !== JSON.stringify(d.baseTable);
export const myTurn = (view) => view.phase === 'play' && view.current === view.you;

export function toggleSelect(d, id) {
  return { ...d, selected: d.selected.includes(id) ? d.selected.filter((x) => x !== id) : [...d.selected, id] };
}

/** Une combinaison est une cible légale si, avant la première pose, elle ne contient aucune tuile de la table. */
export const legalSetTarget = (d, view, index) => view.melded[view.you] || !d.sets[index]?.some((id) => isBaseTile(d, id));

/**
 * Déplace des tuiles vers `dest` = { to: 'set', index } | { to: 'new' } | { to: 'rack', before? }.
 * → { draft } ou { draft (inchangé), error }.
 */
export function moveTiles(d, view, ids, dest) {
  const fail = (error) => ({ draft: d, error });
  const moving = [...new Set(ids)];
  if (moving.length === 0) return { draft: d };
  const known = new Set([...d.rack, ...d.sets.flat()]);
  if (!moving.every((id) => known.has(id))) return fail('tiles-mismatch');
  const toRack = dest.to === 'rack';
  if (toRack && moving.includes(dest.before)) return { draft: d }; // lâché sur soi-même : rien à faire
  const touchesTable = !toRack || moving.some((id) => !d.rack.includes(id));
  if (touchesTable && !myTurn(view)) return fail('not-your-turn');
  if (moving.some((id) => locked(d, view, id))) return fail('initial-meld-table');
  if (toRack && moving.some((id) => isBaseTile(d, id))) return fail('table-to-rack');
  if (dest.to === 'set' && (!d.sets[dest.index] || !legalSetTarget(d, view, dest.index))) return fail(d.sets[dest.index] ? 'initial-meld-table' : 'tiles-mismatch');
  const target = dest.to === 'set' ? d.sets[dest.index] : null;
  const strip = (list) => list.filter((id) => !moving.includes(id));
  let sets = d.sets.map((s) => (s === target ? s : strip(s)));
  let rack = strip(d.rack);
  if (dest.to === 'set') sets = sets.map((s) => (s === target ? [...strip(s), ...moving] : s));
  else if (dest.to === 'new') sets = [...sets, moving];
  else {
    const at = dest.before !== undefined && !moving.includes(dest.before) ? rack.indexOf(dest.before) : -1;
    rack = at < 0 ? [...rack, ...moving] : [...rack.slice(0, at), ...moving, ...rack.slice(at)];
  }
  return { draft: { ...d, sets: sets.filter((s) => s.length > 0), rack, selected: [] } };
}

/** Tri du chevalet : 'group' (7-7-7 : nombre, couleur) ou 'run' (7-8-9 : couleur, nombre) ; jokers à la fin. */
export function sortRack(ids, mode) {
  const key = (id) => (isJoker(id) ? [99, 99, id] : mode === 'group' ? [numOf(id), colorOf(id), id] : [colorOf(id), numOf(id), id]);
  return ids.slice().sort((a, b) => {
    const ka = key(a), kb = key(b);
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2];
  });
}
export const sortDraft = (d, mode) => ({ ...d, rack: sortRack(d.rack, mode) });

/** Ordre d'affichage d'une combinaison valide (suite croissante, jokers à leur place) ; sans effet sur le moteur (H-RUM-7). */
export function orderSet(set) {
  const a = analyzeSet(set);
  if (!a) return set;
  const jokers = set.filter(isJoker);
  const naturals = set.filter((id) => !isJoker(id));
  if (a.kind === 'group') return [...naturals.sort((x, y) => colorOf(x) - colorOf(y)), ...jokers];
  const slots = [...naturals.map((id) => ({ num: numOf(id), id })), ...a.jokerAs.map((j, i) => ({ num: j.num, id: jokers[i] }))];
  return slots.sort((x, y) => x.num - y.num).map((s) => s.id);
}

/** Valeur des combinaisons valides ne contenant que des tuiles posées ce tour (compteur de première pose). */
export function meldValue(d) {
  return d.sets.reduce((sum, s) => {
    const a = s.every((id) => placedThisTurn(d, id)) ? analyzeSet(s) : null;
    return sum + (a ? a.value : 0);
  }, 0);
}

export function summary(view, d) {
  const check = checkPlay(view.table, view.rack, view.melded[view.you], d.sets);
  return {
    played: d.baseRack.length - d.rack.length,
    setStates: d.sets.map((s) => ({ valid: analyzeSet(s) !== null })),
    meldValue: meldValue(d),
    check,
    canValidate: myTurn(view) && check.ok,
  };
}

export const toAction = (d) => ({ type: 'play', table: d.sets.map((s) => s.slice()) });
