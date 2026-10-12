// Entrées (LU-10, DESIGN.md §10.2) : Pointer Events — glisser-déposer (fantôme sous le doigt) et tap.
// `touch-action: none` est posé statiquement en CSS sur le plateau et les tuiles (trop tard s'il était posé au pointerdown).
// Les nœuds sont remplacés à chaque rendu : on délègue sur `root` et on capture le pointeur sur `root`.

/** Distance (px) à partir de laquelle un appui devient un glissement. */
export const DRAG_THRESHOLD = 8;

/**
 * `h` : { enabled(), onTapRack(rackIndex), onTapCell(cell), canDrop(source, cell), onDrop(source, cell|null), ghostLabel(source),
 *       onBlockedDrop?(source, cell) }
 * `source` : { rackIndex } (tuile du chevalet) ou { cell } (pose provisoire). Renvoie `detach()`.
 */
export function attachInput(root, h) {
  let down = null; // { pointerId, x, y, source, tapCell, dragging }
  let ghost = null;
  let hovered = null;

  function setHover(cell) {
    if (hovered === cell) return;
    hovered?.classList.remove('is-drop-target', 'is-drop-invalid');
    hovered = cell;
  }

  function cleanup() {
    ghost?.remove();
    ghost = null;
    setHover(null);
    down = null;
  }

  function cellAt(x, y) {
    return document.elementFromPoint(x, y)?.closest?.('.cell') ?? null;
  }

  function onDown(e) {
    if (down || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0) || !h.enabled()) return;
    const tile = e.target.closest?.('.rack-tile:not(.is-placed)');
    const pending = e.target.closest?.('.cell.has-pending');
    const cell = e.target.closest?.('.cell');
    if (!tile && !cell) return;
    down = {
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      source: tile ? { rackIndex: Number(tile.dataset.rackIndex) } : pending ? { cell: Number(pending.dataset.cell) } : null,
      tapCell: !tile && cell ? Number(cell.dataset.cell) : null,
      tapRack: tile ? Number(tile.dataset.rackIndex) : null,
      dragging: false,
    };
    root.setPointerCapture?.(e.pointerId);
  }

  function onMove(e) {
    if (!down || e.pointerId !== down.pointerId) return;
    if (!down.dragging) {
      if (!down.source || Math.hypot(e.clientX - down.x, e.clientY - down.y) < DRAG_THRESHOLD) return;
      down.dragging = true;
      ghost = document.createElement('div');
      ghost.className = 'drag-ghost';
      ghost.textContent = h.ghostLabel(down.source);
      document.body.append(ghost);
    }
    ghost.style.left = `${e.clientX}px`;
    ghost.style.top = `${e.clientY}px`;
    const cell = cellAt(e.clientX, e.clientY);
    setHover(cell);
    if (cell) {
      const ok = h.canDrop(down.source, Number(cell.dataset.cell));
      cell.classList.toggle('is-drop-target', ok);
      cell.classList.toggle('is-drop-invalid', !ok);
    }
  }

  function onUp(e) {
    if (!down || e.pointerId !== down.pointerId) return;
    const d = down;
    const cell = d.dragging ? cellAt(e.clientX, e.clientY) : null;
    cleanup();
    if (d.dragging) {
      const n = cell ? Number(cell.dataset.cell) : null;
      const ok = n !== null && h.canDrop(d.source, n);
      if (n !== null && !ok) h.onBlockedDrop?.(d.source, n);
      h.onDrop(d.source, ok ? n : null);
    } else if (d.tapRack !== null) {
      h.onTapRack(d.tapRack);
    } else if (d.tapCell !== null) {
      h.onTapCell(d.tapCell);
    }
  }

  const onCancel = (e) => { if (down && e.pointerId === down.pointerId) cleanup(); };

  root.addEventListener('pointerdown', onDown);
  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerup', onUp);
  root.addEventListener('pointercancel', onCancel);
  return () => {
    root.removeEventListener('pointerdown', onDown);
    root.removeEventListener('pointermove', onMove);
    root.removeEventListener('pointerup', onUp);
    root.removeEventListener('pointercancel', onCancel);
    cleanup();
  };
}
