// Règles à l'écran (DESIGN §8.1) : texte pur, repris par la coquille (`game.ui.rulesHtml`).
export const HYPOTHESES = [
  ['H-RUM-1', 'Le premier joueur est tiré au sort avec la graine (équivalent à « la plus haute tuile commence »).'],
  ['H-RUM-2', 'Pas de minuteur : la pénalité « table invalide = reprendre ses tuiles et piocher 3 » est remplacée par une validation à l’envoi. Seule une table valide part ; « Annuler » remet la table du début de tour.'],
  ['H-RUM-3', 'Un joker récupéré doit être rejoué dans une combinaison quelconque au même tour (règle en ligne) : il reste sur la table.'],
  ['H-RUM-4', 'Pioche vide : « piocher » devient « passer ». La partie s’arrête quand tous les joueurs passent d’affilée pendant un tour complet.'],
  ['H-RUM-5', 'Une seule partie : pas de manches multiples ni de cumul des scores.'],
  ['H-RUM-6', 'Deux jokers dans une même combinaison sont autorisés.'],
  ['H-RUM-7', 'Un joker prend la lecture de plus grande valeur (il comble d’abord les trous, puis prolonge vers le haut, puis vers le bas).'],
  ['H-RUM-8', 'Égalité en fin de partie bloquée : le moins de tuiles, puis le plus petit siège.'],
];

export const rulesHtml = () => '<h2>Règles</h2>'
  + '<p>106 tuiles (1 à 13 en 4 couleurs, deux fois, plus 2 jokers) ; 14 tuiles chacun, 2 à 4 joueurs. À son tour, on pose au moins une tuile du chevalet, ou on pioche une tuile (ce qui finit le tour).</p>'
  + '<ul><li><strong>Groupe</strong> : 3 ou 4 tuiles de même nombre et de couleurs toutes différentes.</li>'
  + '<li><strong>Suite</strong> : 3 tuiles consécutives ou plus de même couleur ; le 1 est toujours bas (13-1 interdit).</li>'
  + '<li><strong>Première pose</strong> : au moins 30 points avec son seul chevalet (un joker vaut la tuile qu’il représente), sans toucher à la table ce tour-là.</li>'
  + '<li><strong>Ensuite</strong>, la table se réarrange librement : à la fin du tour, toutes les combinaisons doivent être valides, sans tuile isolée.</li>'
  + '<li><strong>Joker</strong> : on peut le récupérer en le remplaçant par une tuile qui garde la combinaison valide, puis il doit être rejoué au même tour.</li>'
  + '<li><strong>Fin</strong> : le premier chevalet vide gagne et marque la somme des pertes ; chaque autre marque moins la somme de son chevalet (joker = 30). '
  + 'Pioche vide et plus aucun coup : le plus petit total gagne.</li></ul>'
  + '<h3>Comment jouer</h3>'
  + '<p>Glissez une tuile du chevalet vers une combinaison ou vers « Nouvelle combinaison », ou bien touchez une ou plusieurs tuiles puis touchez la destination (« + », « Nouvelle combinaison » ou ↩). '
  + 'Une tuile posée ce tour peut revenir au chevalet ; une tuile déjà sur la table, non. Cadre vert : combinaison valide ; cadre rouge : à corriger. '
  + '« Annuler » remet la table et le chevalet du début de tour ; « Valider » envoie la table aux autres joueurs, qui ne voient pas votre brouillon. '
  + 'Les tuiles posées au dernier coup sont entourées d’un halo. Un symbole accompagne chaque couleur : ● noir, ◆ rouge, ▲ bleu, ■ orange.</p>'
  + `<h3>Hypothèses</h3><ul>${HYPOTHESES.map(([id, text]) => `<li><strong>${id}</strong> ${text}</li>`).join('')}</ul>`
  + '<p class="notice">Règles d’après la règle officielle (réf. 2600) ; tuiles et dessins originaux. Rummikub est une marque de ses ayants droit.</p>';
