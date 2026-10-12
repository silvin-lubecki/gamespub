// Écran Règles (LU-14, DESIGN.md §10.1) : résumé des règles en français et hypothèses H1–H14 en langage joueur.
// Aucun accès au DOM à l'import. Les paliers d'étoiles sont générés depuis STAR_TIERS (source unique).
import { STAR_TIERS } from '../engine/index.js';
import { tierText } from './messages.js';

export const RULES_SECTIONS = [
  { title: 'But du jeu', items: [
    'Posez des lettres sur le plateau de 7×7 cases pour former des mots, et marquez les bords du plateau avec vos pions territoire.',
    'En compétitif, le premier à avoir posé ses 6 pions gagne. En coopératif, vous jouez ensemble contre le plateau.',
  ] },
  { title: 'Mise en place', items: [
    'Un sac de 60 tuiles (dont des jokers) ; chacun reçoit 6 lettres. Une main uniquement de voyelles ou uniquement de consonnes est remise dans le sac et re-tirée.',
    'Le premier joueur est celui dont la tuile tirée est la plus proche de A.',
  ] },
  { title: 'Votre tour', items: [
    'Jouer un mot : posez une ou plusieurs lettres alignées, puis votre chevalet est complété jusqu’à 6 lettres.',
    'Renouveler (compétitif) : marquez des lettres, elles sont échangées contre de nouvelles ; vous ne posez rien et le tour passe.',
    'Passer (coopératif) : vous annoncez ne plus pouvoir jouer.',
  ] },
  { title: 'Poser un mot', items: [
    'Le premier mot compte au moins 2 lettres et couvre le Soleil au centre ; son sens (horizontal ou vertical) vaut ensuite pour toute la partie.',
    'Les poses d’un tour sont sur une même ligne, sans trou, et le mot doit toucher une tuile déjà posée (en la recouvrant ou à côté).',
    'Tous les mots formés (le mot principal et les mots croisés de 2 lettres ou plus) doivent être dans le dictionnaire.',
    'Un mot d’une seule lettre est permis (A, O, Y) mais ne rapporte jamais de territoire.',
  ] },
  { title: 'Recouvrement', items: [
    'Vous pouvez poser une lettre différente sur une lettre déjà posée, jusqu’à 3 tuiles empilées ; seule la lettre du dessus compte.',
    'Les mots formés avec la nouvelle lettre doivent être valides. Un joker garde la lettre choisie.',
  ] },
  { title: 'Territoires', items: [
    'Un mot de 2 lettres ou plus qui touche un bord du plateau, dans son sens de lecture, vous fait poser un pion sur l’emplacement de ce bord.',
    'Si l’emplacement appartient à l’adversaire, vous le reprenez : son pion lui revient, le vôtre prend la place.',
    'Plusieurs territoires peuvent être gagnés ou repris dans le même tour.',
  ] },
  { title: 'Traverse', items: [
    'Un mot de 7 lettres qui traverse tout le plateau donne ses deux extrémités en permanence (non reprenables) et verrouille ses 7 cases : on peut les croiser mais plus les recouvrir.',
  ] },
  { title: 'Fin de partie compétitive', items: [
    'Vous gagnez dès que vos 6 pions sont posés.',
    'Si le sac ne peut plus compléter le chevalet du joueur qui vient de jouer, la partie s’arrête : le plus de territoires l’emporte (égalité possible).',
  ] },
  { title: 'Mode coopératif', items: [
    'Vous choisissez un niveau et un motif : des mottes de terre bloquent les cases du motif, aucune lettre n’y est posable.',
    'Les territoires sont communs (pions marron, 8 au total) ; chacun a son chevalet. Les tours alternent.',
    'Planter un arbre (5 au total) : un mot qui recouvre au moins une tuile et touche un emplacement déjà marron y plante un arbre.',
    'Score = territoires + arbres. Paliers :',
    ...STAR_TIERS.map(tierText),
    'La partie se termine au score maximal (8 territoires et 5 arbres), ou quand les deux joueurs passent d’affilée, ou quand les deux chevalets sont vides. Le sac vide ne termine pas la partie.',
  ] },
];

/** Choix d'adaptation (DESIGN.md §13), en langage joueur. */
export const ASSUMPTIONS = {
  H1: 'Le plateau réel n’étant pas documenté, la disposition des cases et les motifs sont des créations originales.',
  H2: 'Six motifs coopératifs, deux par niveau : Fleur et Champignon (4 mottes), Feuille et Goutte (5), Étoile et Escargot (6).',
  H3: 'Le plateau a 28 emplacements de bord (un par extrémité de rangée ou de colonne) ; un mot ne marque que les bords de son sens de lecture.',
  H4: 'Le Y compte comme une voyelle. Le joker est ignoré pour le test « voyelles/consonnes », qui ne s’applique qu’à la distribution initiale.',
  H5: 'Tirage du premier joueur : un joker tiré est remis et retiré ; en cas d’égalité, on retire.',
  H6: 'Le premier mot compte au moins 2 lettres (cela fixe le sens de jeu).',
  H7: 'Un mot d’une lettre (A, O, Y) est autorisé, mais ne donne jamais de territoire.',
  H8: 'Tout mot formé ce tour (principal ou croisé) de 2 lettres ou plus qui touche un bord marque ou reprend l’emplacement.',
  H9: 'Si le sac ne peut plus ramener la main à 6 lettres en fin de tour, la partie s’arrête aussitôt et on compte les territoires.',
  H10: 'Coopératif : le bouton Passer existe ; la partie s’arrête après deux passes consécutives, quand les mains sont vides, ou au score maximal (13).',
  H11: 'Un arbre n’est planté que si le mot touchant le bord contient une pose qui recouvre une tuile ce tour-là, sur un emplacement déjà marron.',
  H12: 'Coopératif : mains individuelles, réserve de pions et d’arbres commune, tours alternés.',
  H13: 'Le dictionnaire est volontairement permissif (Grammalecte : toutes variantes, y compris familier, vieilli, régional ; orthographe rectifiée de 1990).',
  H14: 'La publication d’une nouvelle version sur le site n’est jamais fusionnée automatiquement : une personne la valide.',
};

function el(tag, text, className) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (className) n.className = className;
  return n;
}

/** `onBack()` : clic sur « Retour ». */
export function renderRules(root, { onBack }) {
  const back = el('button', 'Retour', 'btn secondary');
  back.type = 'button';
  back.addEventListener('click', onBack);
  const nodes = [el('h2', 'Règles')];
  for (const section of RULES_SECTIONS) {
    nodes.push(el('h3', section.title));
    const ul = el('ul');
    ul.append(...section.items.map((t) => el('li', t)));
    nodes.push(ul);
  }
  nodes.push(el('h3', 'Choix d’adaptation'), el('p', 'Le livret ne précisant pas tout, voici les choix faits dans cette version :'));
  const dl = el('dl', undefined, 'assumptions');
  for (const [key, text] of Object.entries(ASSUMPTIONS)) dl.append(el('dt', key), el('dd', text));
  nodes.push(dl, back);
  root.replaceChildren(...nodes);
  root.classList.add('rules');
  root.hidden = false;
}
