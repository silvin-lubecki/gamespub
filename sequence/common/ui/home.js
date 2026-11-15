// COM-02 (DESIGN-plateforme §5.6) : écran Accueil de la coquille, en chaîne HTML (testable sans DOM).
import { NAME_MAX } from './player-name.js';
import { esc } from './svg.js';

export const NOTICE = 'Adaptation non officielle, ni affiliée ni approuvée par les éditeurs ou ayants droit des jeux et marques cités.';

/** `hasSolo` / `hasRoom` : une sauvegarde existe ; `dev` : `?dev=hotseat` (partie à plusieurs sur un écran). */
export function homeHtml({ game, name = '', hasSolo = false, hasRoom = false, dev = false }) {
  return '<div class="home-menu">'
    + `<h1 class="title">${esc(game.title)}</h1>`
    + `<label class="name-field">Votre nom <input id="player-name" type="text" maxlength="${NAME_MAX}" placeholder="Joueur" value="${esc(name)}" autocomplete="nickname"></label>`
    + (hasSolo ? '<button type="button" class="btn" id="btn-resume" data-act="resume">Reprendre la partie solo</button>' : '')
    + '<button type="button" class="btn" id="btn-solo" data-act="solo">Jouer contre l’IA</button>'
    + '<button type="button" class="btn" id="btn-room" data-act="room">Créer une salle</button>'
    + (hasRoom ? '<button type="button" class="btn" id="btn-resume-room" data-act="resume-room">Reprendre la salle</button>' : '')
    + (dev ? '<button type="button" class="btn" id="btn-hotseat" data-act="hotseat">Partie à plusieurs sur cet écran (dev)</button>' : '')
    + '<button type="button" class="btn secondary" data-act="rules">Règles</button>'
    + '<a class="all-games" href="../">← Tous les jeux</a>'
    + `<p class="notice">${esc(NOTICE)}</p></div>`;
}
