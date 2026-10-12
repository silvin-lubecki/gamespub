// Textes français de l'UI (LU-10, DESIGN.md §5.3 codes d'erreur, §10.1). Module pur : aucun accès au DOM.
// Hypothèses utilisées : H6 (premier mot : au moins 2 lettres), H7 (pas de territoire sous 2 lettres),
// H9 (fin de partie par sac épuisé), H10 (coop : fins « score max » et « plus de coup possible »),
// H11 (arbres), H12 (score et réserve communs en coop).
import { COOP_MAX_SCORE, STAR_TIERS, starsFor } from '../engine/index.js';
import { STATUS_MY_TURN, STATUS_THEIR_TURN } from './status.js';

export const LEVEL_NAMES = { easy: 'Facile', medium: 'Moyen', hard: 'Difficile' };

/** « 1★ : 6 territoires dont 3 arbres » — tous les nombres viennent du palier (STAR_TIERS, §7). */
export function tierText(tier) {
  let text = `${tier.stars}★ : ${tier.territories} territoires dont ${tier.trees} arbres`;
  if (tier.traverses > 0) text += ` et ${tier.traverses} traverse${tier.traverses > 1 ? 's' : ''}`;
  return text;
}

/** Palier visé ensuite pour les compteurs `counts` ({ territories, trees, traverses }). */
export function nextTierText(counts) {
  const stars = starsFor(counts);
  const next = STAR_TIERS.find((t) => t.stars > stars);
  return next ? `Prochaine étoile — ${tierText(next)}` : 'Toutes les étoiles obtenues !';
}

/** `★★☆` : étoiles obtenues puis vides. */
export const starsLine = (n) => '★'.repeat(n) + '☆'.repeat(STAR_TIERS.length - n);

export const ERROR_MESSAGES = {
  'game-over': 'La partie est terminée.',
  'not-your-turn': "Ce n'est pas votre tour.",
  'bad-action': 'Action impossible dans ce mode de jeu.',
  'rack-mismatch': 'Les lettres posées ne correspondent pas à votre chevalet.',
  'out-of-bounds': 'Une lettre est posée hors du plateau.',
  'duplicate-cell': 'Deux lettres sont posées sur la même case.',
  'cell-blocked': 'Cette case est occupée par une motte : on ne peut pas y jouer.',
  'cell-locked': 'Cette case est verrouillée par une traverse.',
  'stack-full': 'Cette pile est déjà de 3 lettres.',
  'same-letter': 'On ne peut pas recouvrir une lettre par la même lettre.',
  'not-aligned': 'Les lettres doivent être posées sur une même ligne ou une même colonne.',
  'wrong-orientation': "Le sens de jeu est imposé par le premier mot.",
  gap: 'Les lettres posées doivent former un mot continu, sans trou.',
  'first-must-cover-sun': 'Le premier mot doit couvrir la case soleil, au centre.',
  'first-too-short': 'Le premier mot doit faire au moins 2 lettres.',
  'not-connected': 'Le mot doit toucher des lettres déjà posées.',
  'invalid-word': 'Mot inconnu.',
  'renew-forbidden': 'Le renouvellement est interdit dans ce mode.',
  'renew-empty': 'Choisissez au moins une lettre à renouveler.',
  'bag-too-small': 'Il ne reste pas assez de lettres dans le sac.',
  'pass-forbidden': 'Passer son tour est réservé au mode coopératif.',
};

/** Erreurs propres au réseau (LU-11), séparées de ERROR_MESSAGES (codes du moteur). */
export const NETWORK_ERROR_MESSAGES = {
  offline: 'Connexion perdue : coup non envoyé.',
};

/** Message français pour un code d'erreur ; `words` (mots fautifs) et `orientation` précisent certains codes. */
export function errorMessage(code, { words = [], orientation = null } = {}) {
  if (code === 'invalid-word' && words.length > 0) {
    const list = words.map((w) => w.word ?? w).join(', ');
    return `${words.length > 1 ? 'Mots inconnus' : 'Mot inconnu'} : ${list}`;
  }
  if (code === 'wrong-orientation' && orientation) {
    return `Le premier mot était ${orientation === 'H' ? 'horizontal' : 'vertical'} : tous les mots suivants doivent suivre ce sens.`;
  }
  return ERROR_MESSAGES[code] ?? NETWORK_ERROR_MESSAGES[code] ?? `Erreur inattendue (${code})`;
}

/** `L3` → « bord gauche, rangée 4 » ; `T0` → « bord haut, colonne 1 »… */
export function slotLabel(slot) {
  const n = Number(slot[1]) + 1;
  switch (slot[0]) {
    case 'T': return `bord haut, colonne ${n}`;
    case 'B': return `bord bas, colonne ${n}`;
    case 'L': return `bord gauche, rangée ${n}`;
    default: return `bord droit, rangée ${n}`;
  }
}

export const DEFAULT_NAMES = ['Joueur 1 (vert)', 'Joueur 2 (marron)'];

/** Noms en partie réseau : le joueur local est signalé par « vous ». */
export function networkNames(you) {
  return DEFAULT_NAMES.map((n, i) => (i === you ? n.replace(')', ', vous)') : n));
}

/** Phrase de fin de partie. */
export function describeResult(result, names = DEFAULT_NAMES) {
  if (result.reason === 'max' || result.reason === 'stuck') { // coop (H10)
    const why = result.reason === 'max' ? 'tout est posé' : 'plus aucun coup possible';
    return `Partie coopérative terminée : score ${result.score}/${COOP_MAX_SCORE}, ${result.stars}★ (${why})`;
  }
  if (result.winner === null || result.winner === undefined) return 'Égalité (sac épuisé)';
  const why = result.reason === 'pawns' ? 'tous ses pions sont posés' : 'sac épuisé';
  return `${names[result.winner]} gagne : ${why}`;
}

/** Ligne de journal pour un événement du moteur ; `null` si l'événement n'est pas affiché. */
export function describeEvent(e, names = DEFAULT_NAMES, mode = 'versus') {
  switch (e.type) {
    case 'played': return `${names[e.player]} joue ${e.words.map((w) => w.word).join(', ')}`;
    case 'territory':
      if (mode === 'coop') return `Territoire marron gagné en ${e.slot} (${slotLabel(e.slot)}) par ${names[e.player]}`;
      return `${names[e.player]} ${e.captured ? 'reprend' : 'gagne'} le territoire ${e.slot} (${slotLabel(e.slot)})`;
    case 'traverse': return `Traverse ! ${e.line.dir === 'H' ? 'rangée' : 'colonne'} ${e.line.index + 1} (${names[e.player]})`;
    case 'tree': return `🌳 Un arbre est planté en ${e.slot} (${slotLabel(e.slot)})`;
    case 'renewed': return `${names[e.player]} renouvelle ${e.count} lettre${e.count > 1 ? 's' : ''}`;
    case 'passed': return `${names[e.player]} passe son tour`;
    case 'game-over': return describeResult(e.result, names);
    default: return null;
  }
}

/** Ligne d'état du tour (§10.1). */
export function turnStatus(view, you, { hotseat = false, names = DEFAULT_NAMES } = {}) {
  if (view.status === 'ended' && view.result) return describeResult(view.result, names);
  if (hotseat) return `Partie locale — à ${names[view.current]} de jouer`;
  return view.current === you ? STATUS_MY_TURN : STATUS_THEIR_TURN;
}
