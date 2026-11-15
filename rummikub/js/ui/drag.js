// Glisser-déposer aux Pointer Events (DESIGN §8.4) : aucune bibliothèque, `touch-action: none` posé en CSS sur les tuiles.
// Le module ne touche au DOM que dans `installDrag` (appelée depuis mountGame, jamais à l'import). La cible est résolue avec
// `elementFromPoint` en coordonnées écran ; seule la position du fantôme est convertie vers la scène mise à l'échelle.
export const THRESHOLD = 6;

/** Destination d'un lâcher sur l'élément `target` (ou null) : { to: 'set', index } | { to: 'new' } | { to: 'rack', before? }. */
export function destOf(target) {
  const tile = target?.closest?.('[data-tile]');
  if (tile?.dataset.zone === 'table') return { to: 'set', index: Number(tile.dataset.set) };
  if (tile?.dataset.zone === 'rack') return { to: 'rack', before: Number(tile.dataset.tile) };
  const drop = target?.closest?.('[data-drop]');
  if (!drop) return null;
  if (drop.dataset.drop === 'set') return { to: 'set', index: Number(drop.dataset.set) };
  return drop.dataset.drop === 'new' ? { to: 'new' } : { to: 'rack' };
}

/**
 * `installDrag(el, { idsFor(tileId) → number[], onDrop(ids, dest), onSuppressClick() })` → { cancel, dispose }.
 * `idsFor` renvoie la sélection si la tuile en fait partie, sinon la tuile seule.
 */
export function installDrag(el, { idsFor, onDrop, onSuppressClick = () => {} }) {
  const doc = el.ownerDocument;
  let press = null; // { pointerId, tile, x, y }
  let ghost = null;
  let active = false;

  const stageScale = () => {
    const rect = el.getBoundingClientRect();
    return { rect, scale: el.offsetWidth ? rect.width / el.offsetWidth : 1 };
  };
  const place = (x, y) => {
    const { rect, scale } = stageScale();
    ghost.style.left = `${(x - rect.left) / scale}px`;
    ghost.style.top = `${(y - rect.top) / scale}px`;
  };
  const reset = () => {
    ghost?.remove();
    ghost = null;
    press = null;
    active = false;
    el.classList.remove('is-dragging');
  };

  const down = (e) => {
    const tile = e.target.closest?.('[data-tile]');
    if (!tile || (e.button !== undefined && e.button > 0) || !tile.matches('button.tile')) return;
    press = { pointerId: e.pointerId, tile, x: e.clientX, y: e.clientY };
    try { tile.setPointerCapture?.(e.pointerId); } catch { /* ignoré */ }
  };
  const move = (e) => {
    if (!press || e.pointerId !== press.pointerId) return;
    if (!active) {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < THRESHOLD) return;
      active = true;
      const ids = idsFor(Number(press.tile.dataset.tile));
      ghost = doc.createElement('div');
      ghost.className = 'drag-ghost';
      ghost.innerHTML = press.tile.innerHTML + (ids.length > 1 ? `<span class="drag-count">${ids.length}</span>` : '');
      el.append(ghost);
      el.classList.add('is-dragging');
    }
    place(e.clientX, e.clientY);
    e.preventDefault?.();
  };
  const up = (e) => {
    if (!press || e.pointerId !== press.pointerId) return;
    if (!active) { reset(); return; } // simple toucher : le clic fait le travail
    const ids = idsFor(Number(press.tile.dataset.tile));
    ghost.style.display = 'none';
    const target = doc.elementFromPoint(e.clientX, e.clientY);
    reset();
    onSuppressClick();
    const dest = destOf(target);
    if (dest) onDrop(ids, dest);
  };
  const cancel = () => reset();

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancel);
  return {
    cancel,
    dispose() {
      reset();
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
    },
  };
}
