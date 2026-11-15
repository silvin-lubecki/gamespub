// COM-02 (DESIGN-plateforme §5.6) : toasts et notification de mise à jour du service worker (LU-14). Aucun accès au DOM à l'import.

function node(doc, message, className) {
  const n = doc.createElement('div');
  n.className = className;
  n.setAttribute('role', 'status');
  n.textContent = message;
  return n;
}

/** Message bref en bas d'écran. */
export function toast(message, { doc = globalThis.document, duration = 2500, setTimeout = globalThis.setTimeout.bind(globalThis) } = {}) {
  const n = node(doc, message, 'toast');
  doc.body.append(n);
  setTimeout(() => n.remove(), duration);
  return n;
}

/** Toast persistant avec un bouton d'action ; `onAction` est appelé au clic, puis le toast disparaît. */
export function actionToast(message, label, onAction, { doc = globalThis.document } = {}) {
  const n = node(doc, `${message} `, 'toast toast-action');
  const b = doc.createElement('button');
  b.type = 'button';
  b.className = 'btn';
  b.textContent = label;
  b.addEventListener('click', () => { n.remove(); onAction(); });
  n.append(b);
  doc.body.append(n);
  return n;
}

/**
 * Propose de recharger quand une nouvelle version du service worker prend le contrôle. Le premier `controllerchange` d'une
 * page qui n'avait pas de contrôleur (première installation) est ignoré. Renvoie `false` sans service worker.
 */
export function watchUpdates(win = globalThis, { doc = win.document } = {}) {
  const sw = win.navigator?.serviceWorker;
  if (!sw?.addEventListener) return false;
  let controlled = Boolean(sw.controller);
  sw.addEventListener('controllerchange', () => {
    if (!controlled) { controlled = true; return; }
    actionToast('Nouvelle version disponible.', 'Recharger', () => win.location.reload(), { doc });
  });
  return true;
}
