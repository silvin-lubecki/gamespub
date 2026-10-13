// Textes français de l'UI (LU-10, DESIGN.md §5.3 codes d'erreur, §10.1). Module pur : aucun accès au DOM.
// Hypothèses utilisées : H6 (premier mot : au moins 2 lettres), H7 (pas de territoire sous 2 lettres),
// H9 (fin de partie par sac épuisé), H10′ (coop : « Terminer » ; fins « score max » et « plus de coup possible »),
// H11 (arbres), H12′ (un chevalet d'équipe, score et réserve communs en coop), H19 (coop : cases noircies, troncs, arbres, mot traversant),
// H24 (compteur de mots possibles, coop), H20 (paliers d'étoiles générés depuis STAR_TIERS), H15/H16/H22 (coop à deux : attribution `by`, brouillon effacé par le coup du coéquipier).
import { COOP_MAX_SCORE, COOP_MOTIFS, MOTIFS, PAWNS, STAR_TIERS, motteCells, starsFor } from '../engine/index.js';
import { STATUS_MY_TURN, STATUS_THEIR_TURN } from './status.js';

export const LEVEL_NAMES = { easy: 'Facile', medium: 'Moyen', hard: 'Difficile' };

/** « 1★ : 6 troncs dont 3 arbres » — tous les nombres viennent du palier (STAR_TIERS, §7) ; vocabulaire coop (H19). */
export function tierText(tier) {
  let text = `${tier.stars}★ : ${tier.territories} troncs dont ${tier.trees} arbres`;
  if (tier.traverses > 0) text += ` et ${tier.traverses} mot${tier.traverses > 1 ? 's' : ''} traversant${tier.traverses > 1 ? 's' : ''}`;
  return text;
}

const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

/** « non » / « oui » / « oui (2) » : mots traversants posés (coop). */
export const traversesText = (n) => (n === 0 ? 'non' : n === 1 ? 'oui' : `oui (${n})`);

/** « Troncs : 3/8 — Arbres : 1/5 — Mot traversant : non » (coop, H19) ; `coop` = { territories, trees, traverses }. */
export const coopCountsText = (coop) =>
  `Troncs : ${coop.territories}/${PAWNS.coopBrown} — Arbres : ${coop.trees}/${PAWNS.coopTrees} — Mot traversant : ${traversesText(coop.traverses)}`;

/** « Réserve : 5 troncs, 4 arbres » (coop, H19). */
export const coopReserveText = (coop) => `Réserve : ${plural(coop.brownLeft, 'tronc')}, ${plural(coop.treesLeft, 'arbre')}`;

/** Nombre affiché : « 24 », ou « 100+ » quand le plafond est atteint (H24). */
const movesNumber = ({ words, capped }) => `${words}${capped ? '+' : ''}`;

/** Ligne du compteur coop (H24) : `null` = calcul en cours ; `{ words, capped }` sinon. */
export function movesCountText(r) {
  if (!r) return 'Mots possibles : …';
  return r.words === 0 ? 'Aucun mot possible' : `Mots possibles : ${movesNumber(r)}`;
}

/** Confirmation de « Terminer » (coop, H10′) : mentionne le nombre de mots encore possibles s'il est connu et non nul. */
export function finishConfirmText(r) {
  if (!r || r.words === 0) return 'Plus aucun mot possible ? La partie s’arrête pour toute l’équipe.';
  const rest = r.words === 1 && !r.capped ? 'Il reste encore 1 mot possible.' : `Il reste encore ${movesNumber(r)} mots possibles.`;
  return `${rest} Terminer quand même ? La partie s’arrête pour toute l’équipe.`;
}

/** « Facile — 4 cases noires » : une case noircie par instance du symbole (H20). */
export const coopLevelLabel = (level) => `${LEVEL_NAMES[level]} — ${motteCells(COOP_MOTIFS[level][0]).length} cases noires`;

/** « Fleur — 4 cases noires » (H20). */
export const coopMotifLabel = (code) => `${MOTIFS[code].name} — ${motteCells(code).length} cases noires`;

/** Légende de l'aperçu du sélecteur coop. */
export const coopPreviewCaption = (code) => `Aperçu : ${motteCells(code).length} cases noircies, aucune lettre n’y est posable`;

/** « Troncs : L3, T1 » en coop, « Territoire(s) : … » en compétitif (aperçu d'un coup). */
export const previewSlotsText = (slots, mode = 'versus') => `${mode === 'coop' ? 'Tronc(s)' : 'Territoire(s)'} : ${slots.join(', ')}`;

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
  'cell-blocked': 'Cette case est noircie : on ne peut pas y jouer.',
  'cell-locked': 'Cette case est verrouillée par une traverse.',
  'stack-full': 'Cette pile est déjà de 3 lettres.',
  'same-letter': 'On ne peut pas recouvrir une lettre par la même lettre.',
  'not-aligned': 'Les lettres doivent être posées sur une même ligne ou une même colonne.',
  gap: 'Les lettres posées doivent former un mot continu, sans trou.',
  'first-must-cover-sun': 'Le premier mot doit couvrir la case soleil, au centre.',
  'first-too-short': 'Le premier mot doit faire au moins 2 lettres.',
  'not-connected': 'Le mot doit toucher des lettres déjà posées.',
  'invalid-word': 'Mot inconnu.',
  'renew-forbidden': 'Le renouvellement est interdit dans ce mode.',
  'renew-empty': 'Choisissez au moins une lettre à renouveler.',
  'bag-too-small': 'Il ne reste pas assez de lettres dans le sac.',
  'pass-forbidden': 'Passer son tour est réservé au mode coopératif.',
  'rotate-locked': 'Le plateau ne peut plus tourner : le premier mot est posé.',
};

/** Erreurs propres au réseau (LU-11), séparées de ERROR_MESSAGES (codes du moteur). */
export const NETWORK_ERROR_MESSAGES = {
  offline: 'Connexion perdue : coup non envoyé.',
  // H15 : action composée sur une révision périmée (coup du coéquipier, rematch ou reprise de l'hôte).
  stale: 'Votre coéquipier a joué juste avant vous : le plateau a changé.',
};

/** Variantes du vocabulaire coop (H19) des erreurs du moteur. */
const COOP_ERROR_MESSAGES = {
  'cell-locked': 'Cette case est verrouillée par un mot traversant.',
};

/** Message français pour un code d'erreur ; `words` (mots fautifs) précise certains codes ; `mode` : vocabulaire coop. */
export function errorMessage(code, { words = [], mode = 'versus' } = {}) {
  if (mode === 'coop' && COOP_ERROR_MESSAGES[code]) return COOP_ERROR_MESSAGES[code];
  if (code === 'invalid-word' && words.length > 0) {
    const list = words.map((w) => w.word ?? w).join(', ');
    return `${words.length > 1 ? 'Mots inconnus' : 'Mot inconnu'} : ${list}`;
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

/** Coop : un seul siège (l'équipe, H12′). */
export const COOP_NAMES = ['L’équipe'];

export const COOP_SELF = 'Vous';
export const COOP_MATE = 'Votre coéquipier';

/** Noms coop en partie réseau, indexés par `by` (participant : 0 hôte, 1 invité — H16, H22) ; `participant` = moi. */
export const coopNetworkNames = (participant) => (participant === 0 ? [COOP_SELF, COOP_MATE] : [COOP_MATE, COOP_SELF]);

/** Auteur d'un événement : en coop, `by` s'il est présent (réseau) ; sinon le siège (`player`). Le compétitif ignore `by`. */
const actor = (e, names, mode) => (mode === 'coop' && e.by !== undefined ? (names[e.by] ?? names[e.player]) : names[e.player]);

/** « Vous » / « Votre coéquipier » en milieu de phrase ; les autres noms sont inchangés. */
const inSentence = (who) => (who === COOP_SELF ? 'vous' : who === COOP_MATE ? 'votre coéquipier' : who);

/** Message de brouillon effacé par le coup du coéquipier (H15) ; `null` si rien à dire. */
export const TEAMMATE_PLAYED = 'Votre coéquipier a joué : vos lettres sont revenues sur le chevalet.';
export const TEAMMATE_ROTATED = 'Votre coéquipier a tourné le plateau : vos lettres sont revenues sur le chevalet.';
export function draftClearedMessage(events, { mode, participant, hadDraft }) {
  if (mode !== 'coop' || !hadDraft) return null;
  const theirs = events.filter((e) => e.by !== undefined && e.by !== participant);
  if (theirs.length === 0) return null;
  return theirs.every((e) => e.type === 'rotated') ? TEAMMATE_ROTATED : TEAMMATE_PLAYED;
}

/** Noms en partie réseau : le joueur local est signalé par « vous ». */
export function networkNames(you) {
  return DEFAULT_NAMES.map((n, i) => (i === you ? n.replace(')', ', vous)') : n));
}

/** Phrase de fin de partie. */
export function describeResult(result, names = DEFAULT_NAMES) {
  if (result.reason === 'max' || result.reason === 'stuck') { // coop (H10′)
    const why = result.reason === 'max' ? 'tout est posé' : 'plus aucun coup possible';
    return `Partie coopérative terminée : score ${result.score}/${COOP_MAX_SCORE}, ${result.stars}★ (${why})`;
  }
  if (result.winner === null || result.winner === undefined) return 'Égalité (sac épuisé)';
  const why = result.reason === 'pawns' ? 'tous ses pions sont posés' : 'sac épuisé';
  return `${names[result.winner]} gagne : ${why}`;
}

/** Ligne de journal pour un événement du moteur ; `null` si l'événement n'est pas affiché. */
export function describeEvent(e, names = DEFAULT_NAMES, mode = 'versus') {
  const who = actor(e, names, mode);
  switch (e.type) {
    case 'played': return `${who} ${who === COOP_SELF ? 'jouez' : 'joue'} ${e.words.map((w) => w.word).join(', ')}`;
    case 'territory':
      if (mode === 'coop') return `Tronc planté en ${e.slot} (${slotLabel(e.slot)}) par ${inSentence(who)}`;
      return `${names[e.player]} ${e.captured ? 'reprend' : 'gagne'} le territoire ${e.slot} (${slotLabel(e.slot)})`;
    case 'traverse': return `${mode === 'coop' ? 'Mot traversant' : 'Traverse'} ! ${e.line.dir === 'H' ? 'rangée' : 'colonne'} ${e.line.index + 1} (${inSentence(who)})`;
    case 'tree': return `🌳 Un arbre est planté en ${e.slot} (${slotLabel(e.slot)})`;
    case 'rotated': // H23
      return `${who} ${who === COOP_SELF ? 'tournez' : 'tourne'} le plateau d’un quart de tour vers ${e.dir === 'R' ? 'la droite' : 'la gauche'}`;
    case 'renewed': return `${names[e.player]} renouvelle ${e.count} lettre${e.count > 1 ? 's' : ''}`;
    case 'passed': return mode === 'coop' ? `${who} ${who === COOP_SELF ? 'terminez' : 'termine'} la partie` : `${names[e.player]} passe son tour`; // H10′
    case 'game-over': return describeResult(e.result, names);
    default: return null;
  }
}

/** Message (toast) d'un événement mis en avant ; `null` sinon. */
export function eventToast(e, names = DEFAULT_NAMES, mode = 'versus') {
  const attributed = mode === 'coop' && e.by !== undefined; // coop réseau : « (vous) » / « (votre coéquipier) » (H22)
  if (e.type === 'traverse') return mode === 'coop' ? `Mot traversant !${attributed ? ` (${inSentence(actor(e, names, mode))})` : ''}` : 'Traverse !';
  if (e.type === 'territory') return describeEvent(e, names, mode);
  if (e.type === 'tree') return `Arbre planté !${attributed ? ` (${inSentence(actor(e, names, mode))})` : ''}`;
  return null;
}

/** Ligne d'état du tour (§10.1). */
export function turnStatus(view, you, { hotseat = false, names = DEFAULT_NAMES } = {}) {
  if (view.status === 'ended' && view.result) return describeResult(view.result, names);
  if (hotseat && view.mode === 'coop') return 'Partie locale — coopératif'; // un seul siège (H12′) : pas de tour
  if (hotseat) return `Partie locale — à ${names[view.current]} de jouer`;
  return view.current === you ? STATUS_MY_TURN : STATUS_THEIR_TURN;
}
