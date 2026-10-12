// Écran Règles (LU-14, DESIGN.md §10.1) : résumé des règles en français et hypothèses H1–H14 (H10′/H12′ en coop), H15–H22 en langage joueur.
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
    'Le premier joueur (compétitif) est celui dont la tuile tirée est la plus proche de A.',
    'En coopératif : un seul chevalet d’équipe de 6 lettres, pas de premier joueur.',
  ] },
  { title: 'Votre tour', items: [
    'Jouer un mot : posez une ou plusieurs lettres alignées, puis votre chevalet est complété jusqu’à 6 lettres.',
    'Renouveler (compétitif) : marquez des lettres, elles sont échangées contre de nouvelles ; vous ne posez rien et le tour passe.',
    'Terminer (coopératif) : l’équipe déclare ne plus pouvoir jouer ; la partie s’arrête aussitôt.',
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
    'Vous choisissez un niveau et un motif : les cases du motif sont noircies (en noir sur le plateau) et aucune lettre n’y est posable.',
    'On peut jouer seul (« Jouer seul ») ou à deux (« Inviter un ami ») : le chevalet d’équipe est unique et partagé, il n’y a pas de tours, chacun pose quand il veut.',
    'Un mot de 2 lettres ou plus qui touche un bord y plante un tronc (8 troncs communs).',
    'Planter un arbre (5 au total) : un mot qui recouvre au moins une tuile et touche un tronc déjà planté y plante un arbre.',
    'Mot traversant : un mot de 7 lettres d’un bord à l’autre plante un tronc permanent à chaque extrémité et verrouille ses cases ; il compte pour la 3ᵉ étoile.',
    'Score = troncs + arbres. Paliers :',
    ...STAR_TIERS.map(tierText),
    'La partie se termine au score maximal (8 troncs et 5 arbres), quand l’équipe appuie sur « Terminer », ou quand le chevalet d’équipe est vide. Le sac vide ne termine pas la partie.',
  ] },
];

/** Choix d'adaptation (DESIGN.md §13), en langage joueur. */
export const ASSUMPTIONS = {
  H1: 'Le plateau réel n’étant pas documenté, la disposition des cases et les motifs sont des créations originales.',
  H2: 'Six motifs coopératifs, deux par niveau : Fleur et Champignon (4 cases noircies), Feuille et Goutte (5), Étoile et Escargot (6).',
  H3: 'Le plateau a 28 emplacements de bord (un par extrémité de rangée ou de colonne) ; un mot ne marque que les bords de son sens de lecture.',
  H4: 'Le Y compte comme une voyelle. Le joker est ignoré pour le test « voyelles/consonnes », qui ne s’applique qu’à la distribution initiale.',
  H5: 'Tirage du premier joueur : un joker tiré est remis et retiré ; en cas d’égalité, on retire.',
  H6: 'Le premier mot compte au moins 2 lettres (cela fixe le sens de jeu).',
  H7: 'Une lettre seule dans le sens de jeu n’est pas un mot : seuls les mots de 2 lettres ou plus formés par la pose sont vérifiés (un T posé contre un A forme « TA »). Un mot d’une lettre (A, O, Y) ne donne jamais de territoire.',
  H8: 'Tout mot formé ce tour (principal ou croisé) de 2 lettres ou plus qui touche un bord marque ou reprend l’emplacement.',
  H9: 'Si le sac ne peut plus ramener la main à 6 lettres en fin de tour, la partie s’arrête aussitôt et on compte les territoires.',
  'H10′': 'Coopératif : le bouton Terminer (avec confirmation) arrête aussitôt la partie pour toute l’équipe ; elle s’arrête aussi quand le chevalet d’équipe est vide ou au score maximal (13).',
  H11: 'Un arbre n’est planté que si le mot touchant le bord contient une pose qui recouvre une tuile ce tour-là, sur un emplacement déjà marron.',
  'H12′': 'Coopératif : un seul chevalet d’équipe de 6 lettres, réserve de troncs et d’arbres commune, pas de tour : chacun pose quand il veut ; le chevalet est complété après chaque pose et le sac vide ne termine pas la partie.',
  H13: 'Le dictionnaire est volontairement permissif (Grammalecte : toutes variantes, y compris familier, vieilli, régional ; orthographe rectifiée de 1990).',
  H14: 'La publication d’une nouvelle version sur le site n’est jamais fusionnée automatiquement : une personne la valide.',
  H15: 'Coopératif à deux : le premier coup reçu est joué ; un coup composé sur un état déjà modifié par votre coéquipier est refusé et votre brouillon est effacé. Vos poses provisoires restent locales, seuls les coups validés sont partagés.',
  H16: 'Jouer « à plusieurs » signifie à deux : l’hôte et un invité ; une troisième personne est refusée.',
  H17: 'La partie solo reste sur votre appareil : aucun réseau, aucun salon, utilisable hors-ligne. Elle est sauvegardée à chaque coup et reprise depuis l’accueil ; Abandonner l’efface.',
  H18: 'Une partie sauvegardée avant la mise à jour du moteur n’est pas reprise ; deux joueurs doivent avoir la même version du jeu.',
  H19: 'Coopératif : les pions marron sont des troncs ; un arbre se plante sur un tronc ; une traverse s’appelle mot traversant ; les cases du symbole choisi sont noircies.',
  H20: 'Le niveau fixe le nombre de cases noircies : 4 (Facile), 5 (Moyen) ou 6 (Difficile), une par instance du symbole choisi. Étoiles : 1★ 6 troncs dont 3 arbres, 2★ 8 dont 4, 3★ 8 dont 5 et un mot traversant.',
  H21: 'Coopératif à deux : l’hôte attend son invité au salon avant de jouer. Une partie solo ne peut pas être ouverte à un ami en cours de route.',
  H22: 'Coopératif à deux : le journal des coups indique qui a joué (vous ou votre coéquipier).',
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
