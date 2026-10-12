// Écran de fin de partie (LU-11 compétitif, LU-12 coopératif ; DESIGN.md §7, §10.1 écran 5). Aucun accès au DOM à l'import.
// Hypothèses utilisées : H3 (6 territoires), H9 (fin par sac épuisé), H10′ (fins coop « max » et « stuck »),
// H11 (arbres), H12′ (score commun), H19 (vocabulaire coop : troncs, arbres, mot traversant).
import { COOP_MAX_SCORE, STAR_TIERS } from '../engine/index.js';
import { renderCoopPicker } from './home-screen.js';
import { coopCountsText } from './messages.js';

const plural = (n) => `${n} territoire${n > 1 ? 's' : ''}`;

const COOP_REASONS = { max: 'Score maximal atteint', stuck: 'Plus de coup possible' };

/** `{ title, reason, counts, score, stars }` pour une partie coop terminée (score et étoiles : `result`, compteurs : `view.coop`). */
export function coopEndSummary(view) {
  const { result, coop } = view;
  return {
    title: result.stars > 0 ? 'Bravo !' : 'Perdu',
    reason: COOP_REASONS[result.reason] ?? '',
    counts: coopCountsText(coop),
    score: `Score : ${result.score}/${COOP_MAX_SCORE}`,
    stars: result.stars,
  };
}

/** `{ title, reason, counts }` pour une partie compétitive terminée, du point de vue de `you`. */
export function endSummary(view, you) {
  const { result } = view;
  const title = result.winner === null || result.winner === undefined
    ? 'Égalité'
    : result.winner === you ? 'Vous avez gagné !' : 'Votre adversaire a gagné';
  const reason = result.reason === 'pawns' ? '6 territoires conquis' : 'Sac épuisé';
  const owned = [0, 1].map((p) => Object.values(view.edges).filter((e) => e.owner === p).length);
  const counts = `Vous : ${plural(owned[you])} — Adversaire : ${plural(owned[1 - you])}`;
  return { title, reason, counts };
}

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

/**
 * Hôte : Rejouer (mêmes réglages) ; en coop aussi « Changer de niveau » si `onRematch` accepte de nouveaux réglages
 * (`canChangeLevel`) ; invité : attente de l'hôte.
 */
export function renderEnd(root, { view, you, role, onRematch, onHome, canChangeLevel = true }) {
  const coop = view.mode === 'coop';
  const { title, reason, counts, score, stars } = coop ? coopEndSummary(view) : endSummary(view, you);
  const nodes = [el('h2', '', title)];
  if (coop) {
    const row = el('p', 'end-stars');
    row.setAttribute('aria-label', `${stars} étoile${stars > 1 ? 's' : ''} sur ${STAR_TIERS.length}`);
    STAR_TIERS.forEach((_, i) => {
      const star = el('span', `star ${i < stars ? 'is-earned' : 'is-empty'}`, i < stars ? '★' : '☆');
      star.style.setProperty('--i', String(i));
      row.append(star);
    });
    nodes.push(row, el('p', 'end-score', score));
  }
  if (reason) nodes.push(el('p', 'end-reason', reason));
  if (counts) nodes.push(el('p', 'end-counts', counts));
  if (role === 'host') {
    const again = el('button', 'btn', 'Rejouer');
    again.type = 'button';
    again.addEventListener('click', () => onRematch());
    nodes.push(again);
    if (coop && canChangeLevel) {
      const change = el('button', 'btn secondary', 'Changer de niveau');
      change.type = 'button';
      change.addEventListener('click', () => renderCoopPicker(root, {
        confirmLabel: 'Rejouer',
        onConfirm: (choice) => onRematch({ mode: 'coop', coop: choice }),
        onBack: () => renderEnd(root, { view, you, role, onRematch, onHome, canChangeLevel }),
      }));
      nodes.push(change);
    }
  } else {
    nodes.push(el('p', 'end-waiting', 'En attente de l’hôte pour rejouer…'));
  }
  const home = el('button', 'btn secondary', 'Accueil');
  home.type = 'button';
  home.addEventListener('click', onHome);
  nodes.push(home);
  root.replaceChildren(...nodes);
  root.hidden = false;
}
