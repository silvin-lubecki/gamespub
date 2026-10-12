// Écran d'accueil (LU-11) et choix du niveau/motif coop (LU-12, DESIGN.md §10.1, §10.3). Aucun accès au DOM à l'import.
// Hypothèses utilisées : H2 (2 motifs coop par niveau, cases noircies sur les cases du motif), H19/H20 (« N cases noires » par niveau).
import { COOP_MOTIFS, motteCells } from '../engine/index.js';
import { renderBoard, svgUse } from './board-view.js';
import { LEVEL_NAMES, coopLevelLabel, coopMotifLabel, coopPreviewCaption } from './messages.js';

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
/**
 * `resume` = `{ onResume, onAbandon }` : partie hôte sauvegardée (LU-14, §9.3) ;
 * `resumeSolo` = idem pour la partie solo sauvegardée (LU-17, H17).
 */
export function renderHome(root, { version, onVersus, onCoop, onRules, resume = null, resumeSolo = null }) {
  const title = document.createElement('h2');
  title.textContent = 'Letter Up';
  const coop = button('Partie coopérative', 'btn', onCoop);
  if (!onCoop) coop.title = 'Bientôt disponible';
  const label = document.createElement('p');
  label.className = 'version';
  label.textContent = `Version ${version}`;
  const both = Boolean(resume && resumeSolo); // deux sauvegardes : on les distingue par leur libellé
  const resumeButtons = [];
  if (resumeSolo) {
    resumeButtons.push(button('Reprendre la partie solo', 'btn', resumeSolo.onResume),
      button(both ? 'Abandonner la partie solo' : 'Abandonner', 'btn secondary', resumeSolo.onAbandon));
  }
  if (resume) {
    resumeButtons.push(button(both ? 'Reprendre la partie en ligne' : 'Reprendre la partie en cours', 'btn', resume.onResume),
      button(both ? 'Abandonner la partie en ligne' : 'Abandonner', 'btn secondary', resume.onAbandon));
  }
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
 * Choix coop en deux étapes : niveau, puis motif (ou « Au hasard ») avec aperçu des cases noircies.
 * Sans `confirmLabel` (accueil) : « Jouer seul » (`onConfirm(choice, { solo: true })`) ou « Inviter un ami »
 * (`{ solo: false }`) ; avec `confirmLabel` (« Rejouer » de l'écran de fin) : un seul bouton, `onConfirm(choice)`.
 * `onBack()`.
 */
export function renderCoopPicker(root, { onConfirm, onBack, confirmLabel = null }) {
  const back = button('Retour', 'btn secondary', onBack);

  function chooseLevel() {
    const levels = Object.keys(COOP_MOTIFS).map((level) => {
      return button(coopLevelLabel(level), 'btn', () => chooseMotif(level));
    });
    root.replaceChildren(el('h2', '', 'Partie coopérative'), el('p', '', 'Choisissez le niveau'), ...levels, back);
    root.hidden = false;
  }

  function chooseMotif(level) {
    const preview = el('div', 'coop-preview');
    const confirms = (confirmLabel
      ? [[confirmLabel, undefined]]
      : [['Jouer seul', { solo: true }], ['Inviter un ami', { solo: false }]]
    ).map(([label, opts]) => {
      const b = button(label, 'btn', null);
      b.disabled = true;
      b.addEventListener('click', () => { if (chosen) onConfirm(resolveCoopChoice(level, chosen), opts); });
      return b;
    });
    let chosen = null;
    const cards = [];
    const select = (card, motif) => {
      chosen = motif;
      for (const c of cards) c.classList.toggle('is-selected', c === card);
      if (motif === 'random') preview.replaceChildren(el('p', '', 'Motif tiré au sort à la création'));
      else {
        const holder = el('div', '');
        renderBoard(holder, { board: [], mottes: motteCells(motif) });
        preview.replaceChildren(el('p', 'coop-preview-caption', coopPreviewCaption(motif)), holder);
      }
      for (const b of confirms) b.disabled = false;
    };
    for (const code of COOP_MOTIFS[level]) {
      const card = button('', 'btn motif-card', () => select(card, code));
      card.append(svgUse(SPRITE, `motif-${code}`, 'motif-thumb'), el('span', '', coopMotifLabel(code)));
      cards.push(card);
    }
    const random = button('Au hasard', 'btn motif-card', () => select(random, 'random'));
    cards.push(random);
    root.replaceChildren(
      el('h2', '', `Niveau ${LEVEL_NAMES[level]}`), el('p', '', 'Choisissez le motif'),
      el('div', 'motif-cards', ''), preview, ...confirms, button('Changer de niveau', 'btn secondary', chooseLevel),
    );
    root.querySelector('.motif-cards').append(...cards);
  }

  chooseLevel();
}
