// Dialogues et toasts (LU-10). Aucun accès au DOM à l'import.

function openDialog(className, build) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = className;
    let result = null;
    const close = (value) => { result = value; dialog.close(); };
    dialog.addEventListener('close', () => { dialog.remove(); resolve(result); });
    build(dialog, close);
    document.body.append(dialog);
    dialog.showModal();
  });
}

function button(text, className, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

/** Sélecteur de lettre A–Z pour un joker. Résout la lettre, ou `null` si annulé (Échap compris). */
export function pickLetter({ title = 'Lettre du joker' } = {}) {
  return openDialog('letter-picker', (dialog, close) => {
    const h = document.createElement('p');
    h.textContent = title;
    const grid = document.createElement('div');
    grid.className = 'letter-grid';
    for (let c = 65; c <= 90; c++) {
      const letter = String.fromCharCode(c);
      grid.append(button(letter, 'rack-tile', () => close(letter)));
    }
    dialog.append(h, grid, button('Annuler', 'btn secondary', () => close(null)));
  });
}

/** Confirmation Oui/Non ; résout `true` si confirmé. */
export function confirmDialog({ message, confirmLabel = 'Confirmer', cancelLabel = 'Annuler' }) {
  return openDialog('confirm-dialog', (dialog, close) => {
    const p = document.createElement('p');
    p.textContent = message;
    const row = document.createElement('div');
    row.className = 'dialog-actions';
    row.append(button(cancelLabel, 'btn secondary', () => close(false)), button(confirmLabel, 'btn', () => close(true)));
    dialog.append(p, row);
  }).then((v) => v === true);
}

/** Message bref en bas d'écran. */
export function toast(message, { duration = 2500 } = {}) {
  const node = document.createElement('div');
  node.className = 'toast';
  node.setAttribute('role', 'status');
  node.textContent = message;
  document.body.append(node);
  setTimeout(() => node.remove(), duration);
}

/** Toast persistant avec un bouton d'action (ex. « Nouvelle version disponible — Recharger »). */
export function actionToast(message, label, onAction) {
  const node = document.createElement('div');
  node.className = 'toast has-action';
  node.setAttribute('role', 'status');
  const text = document.createElement('span');
  text.textContent = message;
  node.append(text, button(label, 'btn', () => { node.remove(); onAction(); }));
  document.body.append(node);
  return node;
}
