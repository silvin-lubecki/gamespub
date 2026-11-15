// Écran Partie de Blokus (BLK-02) : plateau SVG, réserve, fantôme aimanté, pose par glisser (souris, doigt) ou au clavier.
// Le jeu appelle ctx.onEnd(view) quand la partie est finie (la coquille affiche la fin).
import { el, esc, svg } from '../../common/ui/svg.js';
import { COLOR_LABELS, PIECES } from '../engine/pieces.js';
import { cellAt, ghostOf, mirror, moveBy, moveTo, rotate, select } from './geometry.js';
import { bannerHtml, boardSvg, ghostSvg, PALETTE, patternDefs, reserveHtml, statusText } from './render.js';

export { statusText };

const ERREURS = {
  'not-your-turn': 'Ce n’est pas votre tour.',
  overlap: 'La pièce chevauche une autre pièce.',
  'edge-contact': 'La pièce touche une de vos pièces par un côté.',
  'no-corner-contact': 'La pièce doit toucher une de vos pièces par un coin.',
  'first-corner': 'La première pièce doit couvrir la case de coin de la couleur.',
  'out-of-board': 'La pièce sort du plateau.',
  'piece-used': 'Cette pièce est déjà posée.',
  offline: 'Hors connexion : réessayez dans un instant.',
};
const errorText = (code) => ERREURS[code] ?? 'Pose refusée.';

const TOUCH_LIFT = 2.5; // au toucher, le fantôme est décalé de 2,5 cases au-dessus du doigt

const button = (act, label, text, extra = '') => `<button type="button" class="btn secondary blk-btn" data-act="${act}" aria-label="${label}"${extra}>${text}</button>`;

const controlsHtml = (help) => `<div class="blk-controls">
${button('rotate', 'Rotation (R)', '↻', ' data-needs-sel')}${button('mirror', 'Miroir (F)', '⇋', ' data-needs-sel')}
${button('left', 'Décaler à gauche', '←', ' data-needs-sel')}${button('up', 'Décaler vers le haut', '↑', ' data-needs-sel')}${button('down', 'Décaler vers le bas', '↓', ' data-needs-sel')}${button('right', 'Décaler à droite', '→', ' data-needs-sel')}
<button type="button" class="btn blk-btn blk-place" data-act="place" data-needs-legal>Poser</button>${button('cancel', 'Annuler la sélection', '✕', ' data-needs-sel')}
</div><div class="blk-controls">
<button type="button" class="btn secondary blk-btn" data-act="help" aria-pressed="${help}">Aide</button>${button('rules', 'Règles', 'Règles')}${button('quit', 'Quitter', 'Quitter')}
</div>`;

const DELTAS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
const ARROW_KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };

export function mountGame(el0, controller, ctx) {
  const doc = el0.ownerDocument;
  let view = controller.getView();
  let sel = null;
  let help = true;
  let dragging = false;
  let lastCells = [];

  const mine = () => view.phase === 'play' && view.current === view.you;
  const boardRect = () => el0.querySelector('.board-host').getBoundingClientRect();

  function updateGhost() {
    const ghost = sel ? ghostOf(view, sel) : null;
    el0.querySelector('.ghost-host').innerHTML = ghost ? ghostSvg(ghost, view.turnColor) : '';
    el0.querySelectorAll('[data-piece]').forEach((b) => b.setAttribute('aria-pressed', String(sel?.piece === Number(b.dataset.piece))));
    el0.querySelectorAll('[data-needs-sel]').forEach((b) => { b.disabled = !sel; });
    el0.querySelectorAll('[data-needs-legal]').forEach((b) => { b.disabled = !ghost?.legal; });
    return ghost;
  }

  function render() {
    const root = el0;
    root.innerHTML = `${patternDefs()}<div class="blk-game" data-turn-color="${view.turnColor}" data-mine="${mine()}">`
      + `<div class="blk-board-wrap"><div class="board-host">${boardSvg(view, { help, lastCells })}</div><div class="ghost-host"></div></div>`
      + `<div class="blk-side">${bannerHtml(view)}${reserveHtml(view, view.turnColor, sel?.piece ?? null, { interactive: mine() })}${controlsHtml(help)}</div></div>`;
    updateGhost();
  }

  async function place() {
    if (!sel || !mine()) return;
    const ghost = ghostOf(view, sel);
    if (!ghost.legal) { ctx.toast(errorText(ghost.error)); return; }
    const r = await controller.act(ghost.action);
    if (!r.ok) ctx.toast(errorText(r.error));
  }

  const setSel = (next) => { sel = next; updateGhost(); };
  const pickPiece = (piece) => { if (mine() && sel?.piece !== piece) setSel(select(view, piece)); };

  // Position du fantôme sous le pointeur (décalé au-dessus du doigt au toucher).
  function follow(e) {
    const rect = boardRect();
    const lift = e.pointerType === 'touch' ? (TOUCH_LIFT * rect.height) / 20 : 0;
    const c = cellAt(rect, e.clientX, e.clientY - lift);
    setSel(moveTo(sel, c.x, c.y));
  }
  const overBoard = (e) => { const r = boardRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; };

  const onPointerDown = (e) => {
    const piece = e.target.closest('[data-piece]');
    if (e.button !== 0) return;
    if (piece && !piece.disabled) {
      pickPiece(Number(piece.dataset.piece));
      dragging = true;
    } else if (sel && e.target.closest('.blk-board-wrap')) { dragging = true; follow(e); }
  };
  const onPointerMove = (e) => {
    if (!sel || !mine()) return;
    if (dragging || (e.pointerType === 'mouse' && overBoard(e))) follow(e);
  };
  const onPointerUp = (e) => {
    const wasDragging = dragging;
    dragging = false;
    if (e.button !== 0 || !wasDragging || !sel || !mine() || e.pointerType === 'touch' || !overBoard(e)) return;
    follow(e);
    place();
  };
  const onPointerCancel = () => { dragging = false; };
  const onClick = (e) => {
    const piece = e.target.closest('[data-piece]');
    if (piece && !piece.disabled) { pickPiece(Number(piece.dataset.piece)); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'rotate' && sel) setSel(rotate(sel));
    else if (act === 'mirror' && sel) setSel(mirror(sel));
    else if (DELTAS[act] && sel) setSel(moveBy(sel, ...DELTAS[act]));
    else if (act === 'place') place();
    else if (act === 'cancel') setSel(null);
    else if (act === 'help') { help = !help; el0.querySelector('.board-host').innerHTML = boardSvg(view, { help, lastCells }); e.target.closest('[data-act]').setAttribute('aria-pressed', String(help)); }
    else if (act === 'rules') ctx.onRules();
    else if (act === 'quit') ctx.onQuit();
  };
  const onKey = (e) => {
    if (!el0.isConnected || el0.closest('[hidden]') || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!sel || !mine()) return;
    const k = e.key;
    if (k === 'r' || k === 'R') setSel(rotate(sel));
    else if (k === 'f' || k === 'F') setSel(mirror(sel));
    else if (ARROW_KEYS[k]) setSel(moveBy(sel, ...DELTAS[ARROW_KEYS[k]]));
    else if (k === 'Enter') {
      // sur un autre bouton, Entrée garde son effet natif ; sur la pièce sélectionnée ou ailleurs, elle pose
      if (e.target.closest?.('button') && Number(e.target.dataset?.piece) !== sel.piece) return;
      place();
    }
    else if (k === 'Escape') setSel(null);
    else return;
    e.preventDefault();
  };

  el0.addEventListener('pointerdown', onPointerDown);
  el0.addEventListener('pointermove', onPointerMove);
  doc.addEventListener('pointerup', onPointerUp); // relâchement hors de l'écran compris
  doc.addEventListener('pointercancel', onPointerCancel);
  el0.addEventListener('click', onClick);
  doc.addEventListener('keydown', onKey);

  const off = controller.onChange((next, events = []) => {
    for (const ev of events) {
      if (ev.type === 'placed') lastCells = ev.cells;
      if (ev.type === 'out') ctx.toast(`${COLOR_LABELS[ev.color]} ne peut plus poser.`);
    }
    const turnChanged = next.turnColor !== view.turnColor;
    view = next;
    if (turnChanged || !mine() || (sel && !view.remaining[view.turnColor].includes(sel.piece))) sel = null;
    render();
    if (view.phase === 'over') ctx.onEnd(view);
  });
  render();

  return {
    dispose() {
      off();
      el0.removeEventListener('pointerdown', onPointerDown);
      el0.removeEventListener('pointermove', onPointerMove);
      doc.removeEventListener('pointerup', onPointerUp);
      doc.removeEventListener('pointercancel', onPointerCancel);
      el0.removeEventListener('click', onClick);
      doc.removeEventListener('keydown', onKey);
    },
  };
}

const pts = (n) => (n > 0 ? `+${n}` : String(n));

/** Écran de fin : classement des joueurs, puis détail des quatre couleurs (carrés restants, bonus). */
export function renderEnd(view) {
  const ranking = view.names.map((name, i) => ({ name, score: view.seatScores[i], i })).sort((a, b) => b.score - a.score);
  const winners = view.winners.map((i) => esc(view.names[i])).join(' et ');
  const detail = PALETTE.map((_, c) => {
    const left = view.remaining[c].reduce((n, p) => n + PIECES[p].size, 0);
    const shared = view.seatCount === 3 && c === 3;
    const bonus = left > 0 ? '' : ` · Bonus : toutes les pièces posées +15${view.lastPiece[c] === 0 ? ', monomino en dernier +5' : ''}`;
    return `<li>${svg({ w: 12, h: 12, fluid: false, 'aria-hidden': 'true' }, el('rect', { width: 12, height: 12, fill: `url(#blk-pat-${c})`, stroke: PALETTE[c].stroke }))} `
      + `<strong>${COLOR_LABELS[c]}</strong> : ${left} carré${left > 1 ? 's' : ''} restant${left > 1 ? 's' : ''}, ${pts(view.colorScores[c])}${bonus}${shared ? ' (couleur partagée, non comptée)' : ''}</li>`;
  }).join('');
  return `${patternDefs()}<h2>${view.winners.length > 1 ? 'Égalité' : 'Victoire'} : ${winners}</h2>`
    + `<ol class="blk-ranking">${ranking.map((r) => `<li>${esc(r.name)} : ${r.score}</li>`).join('')}</ol><ul class="blk-detail">${detail}</ul>`;
}

export const rulesHtml = () => `<h2>Règles</h2>
<p>Plateau 20×20, 21 pièces par couleur (bleu, jaune, rouge, vert, dans cet ordre). La première pièce de chaque couleur couvre
sa case de coin (H-BLK-1) ; chaque pièce suivante touche une pièce de sa couleur <strong>par un coin</strong>, jamais par un côté.
Aucune restriction entre couleurs différentes.</p>
<p>Une couleur qui ne peut plus poser passe, définitivement (passage automatique, H-BLK-2). La partie finit quand plus personne ne peut poser.</p>
<p>Score : −1 par carré restant, +15 si toutes les pièces sont posées, +5 de plus si la dernière est le monomino (H-BLK-5).
À 2 joueurs, chacun joue deux couleurs (scores additionnés) ; à 3 joueurs, la quatrième couleur est partagée, jouée à tour de rôle
(H-BLK-4), et son score est ignoré. Les couleurs sont attribuées par tirage au sort (H-BLK-3).</p>
<h3>Commandes</h3>
<ul>
<li>Choisissez une pièce dans la réserve, puis glissez-la sur le plateau : le fantôme est vert si la pose est légale, rouge sinon. Relâchez à la souris pour poser.</li>
<li>Au toucher, le fantôme se place au-dessus du doigt ; ajustez avec les flèches puis appuyez sur « Poser ».</li>
<li>↻ ou <kbd>R</kbd> : rotation ; ⇋ ou <kbd>F</kbd> : miroir ; flèches du clavier : décaler ; <kbd>Entrée</kbd> : poser ; <kbd>Échap</kbd> : annuler.</li>
<li>« Aide » affiche en pointillés les coins où la couleur au trait peut poser.</li>
</ul>
<p class="hint">Chaque couleur a aussi son motif : bleu uni, jaune à points, rouge à rayures, vert à croisillons.</p>
<h3>Crédits</h3>
<p class="hint">Blokus® est un jeu de Bernard Tavitian, marque de Mattel ; règles d’après la règle officielle Mattel (BJV44). Adaptation non officielle, sans lien avec Mattel.</p>`;
