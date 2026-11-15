// Catalogue des jeux listés par la page d'accueil (PORT-01, DESIGN-plateforme §6).
// Un jeu non publié (`<slug>/VERSION` en 404) est masqué à l'exécution par portail.js.
// Toute modification doit être répercutée dans index.html (test/index.test.js) et dans tools/gen-thumbs.mjs.

/** @type {ReadonlyArray<{slug: string, title: string, pitch: string, players: string, modes: string[]}>} */
export const GAMES = [
  {
    slug: 'letterup',
    title: 'Letter Up',
    pitch: 'Posez des lettres, formez des mots et grimpez : en duel ou en coopération.',
    players: '1 à 2',
    modes: ['Solo', 'En ligne'],
  },
  {
    slug: 'rue-des-consuls',
    title: 'La Rue des Consuls',
    pitch: 'Négociez des ressources et livrez les commandes des artisans de la rue.',
    players: '1 à 4',
    modes: ['Solo', 'En ligne'],
  },
  {
    slug: 'sequence',
    title: 'Séquence',
    pitch: 'Alignez cinq jetons sur le plateau avec vos cartes.',
    players: '2 à 12',
    modes: ['Solo', 'En ligne'],
  },
  {
    slug: 'rummikub',
    title: 'Rummikub',
    pitch: 'Posez des suites et des brelans de tuiles numérotées, réarrangez la table.',
    players: '2 à 4',
    modes: ['Solo', 'En ligne'],
  },
  {
    slug: 'blokus',
    title: 'Blokus',
    pitch: 'Placez toutes vos pièces en ne touchant les vôtres que par les coins.',
    players: '2 à 4',
    modes: ['Solo', 'En ligne'],
  },
];
