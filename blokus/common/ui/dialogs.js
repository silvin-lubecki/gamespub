// COM-02 (DESIGN-plateforme §5.6) : dialogue de confirmation (issu de Letter Up LU-10). Aucun accès au DOM à l'import.

/** Confirmation Oui/Non ; résout `true` si confirmée. Repli sur `confirm()` sans `<dialog>.showModal`. */
export function confirmDialog({
  message, confirmLabel = 'Confirmer', cancelLabel = 'Annuler', doc = globalThis.document,
}) {
  const dialog = doc.createElement('dialog');
  if (typeof dialog.showModal !== 'function') return Promise.resolve(globalThis.confirm?.(message) === true);
  return new Promise((resolve) => {
    dialog.className = 'confirm-dialog';
    let result = false;
    dialog.addEventListener('close', () => { dialog.remove(); resolve(result); });
    const p = doc.createElement('p');
    p.textContent = message;
    const row = doc.createElement('div');
    row.className = 'dialog-actions';
    const button = (text, className, value) => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = className;
      b.textContent = text;
      b.addEventListener('click', () => { result = value; dialog.close(); });
      return b;
    };
    row.append(button(cancelLabel, 'btn secondary', false), button(confirmLabel, 'btn', true));
    dialog.append(p, row);
    doc.body.append(dialog);
    dialog.showModal();
  });
}
