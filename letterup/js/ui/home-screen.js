// Écran d'accueil (LU-11) et choix du niveau/motif coop (LU-12, DESIGN.md §10.1, §10.3). Aucun accès au DOM à l'import.
// Hypothèses utilisées : H2 (2 motifs coop par niveau, mottes sur les cases du motif).
import { COOP_MOTIFS, MOTIFS, motteCells } from '../engine/index.js';
import { renderBoard, svgUse } from './board-view.js';
import { LEVEL_NAMES } from './messages.js';

const SPRITE = './img/motifs.svg';

function button(label, className, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = label;
  if (onClick) b.addEventListener('click', onClick);
  else b.disabled = true;
  return b;
}

/** `onCoop` absent → bouton coopératif désactivé. */
/** `resume` = `{ onResume, onAbandon }` : partie hôte sauvegardée (LU-14, §9.3). */
export function renderHome(root, { version, onVersus, onCoop, onRules, resume = null }) {
  const title = document.createElement('h2');
  title.textContent = 'Letter Up';
  const coop = button('Partie coopérative', 'btn', onCoop);
  if (!onCoop) coop.title = 'Bientôt disponible';
  const label = document.createElement('p');
  label.className = 'version';
  label.textContent = `Version ${version}`;
  const resumeButtons = resume ? [button('Reprendre la partie en cours', 'btn', resume.onResume), button('Abandonner', 'btn secondary', resume.onAbandon)] : [];
  root.replaceChildren(title, ...resumeButtons, button('Partie compétitive', 'btn', onVersus), coop, button('Règles', 'btn secondary', onRules), label);
  root.hidden = false;
}

/** Résout « Au hasard » (`motif === 'random'`) en un des 2 motifs du niveau ; sinon renvoie le choix tel quel. */
export function resolveCoopChoice(level, motif, random = Math.random) {
  if (motif !== 'random') return { level, motif };
  const motifs = COOP_MOTIFS[level];
  return { level, motif: motifs[Math.floor(random() * motifs.length)] };
}

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

/**
 * Choix coop en deux étapes : niveau, puis motif (ou « Au hasard ») avec aperçu des mottes.
 * `onConfirm({ level, motif })` ; `onBack()`.
 */
export function renderCoopPicker(root, { onConfirm, onBack }) {
  const back = button('Retour', 'btn secondary', onBack);

  function chooseLevel() {
    const levels = Object.keys(COOP_MOTIFS).map((level) => {
      const count = motteCells(COOP_MOTIFS[level][0]).length;
      return button(`${LEVEL_NAMES[level]} — ${count} mottes`, 'btn', () => chooseMotif(level));
    });
    root.replaceChildren(el('h2', '', 'Partie coopérative'), el('p', '', 'Choisissez le niveau'), ...levels, back);
    root.hidden = false;
  }

  function chooseMotif(level) {
    const preview = el('div', 'coop-preview');
    const confirm = button('Créer la partie', 'btn', null);
    confirm.disabled = true;
    let chosen = null;
    const cards = [];
    const select = (card, motif) => {
      chosen = motif;
      for (const c of cards) c.classList.toggle('is-selected', c === card);
      if (motif === 'random') preview.replaceChildren(el('p', '', 'Motif tiré au sort à la création'));
      else renderBoard(preview, { board: [], mottes: motteCells(motif) });
      confirm.disabled = false;
    };
    for (const code of COOP_MOTIFS[level]) {
      const card = button('', 'btn motif-card', () => select(card, code));
      card.append(svgUse(SPRITE, `motif-${code}`, 'motif-thumb'), el('span', '', `${MOTIFS[code].name} — ${motteCells(code).length} mottes`));
      cards.push(card);
    }
    const random = button('Au hasard', 'btn motif-card', () => select(random, 'random'));
    cards.push(random);
    confirm.addEventListener('click', () => { if (chosen) onConfirm(resolveCoopChoice(level, chosen)); });
    root.replaceChildren(
      el('h2', '', `Niveau ${LEVEL_NAMES[level]}`), el('p', '', 'Choisissez le motif'),
      el('div', 'motif-cards', ''), preview, confirm, button('Changer de niveau', 'btn secondary', chooseLevel),
    );
    root.querySelector('.motif-cards').append(...cards);
  }

  chooseLevel();
}
