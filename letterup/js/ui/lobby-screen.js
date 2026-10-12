// Salon de l'hôte, écrans de connexion et d'erreur (LU-11, DESIGN.md §10.1 écrans 2-3). Aucun accès au DOM
// ni à `navigator` à l'import. Aucune hypothèse H# utilisée.
import { STATUS_WAITING } from './status.js';
import { toast } from './dialogs.js';

/** Lien d'invitation relatif à la page courante (fonctionne sous /letterup/, /gamespub/letterup/, en standalone). */
export function inviteLink({ origin, pathname }, id, { local = false } = {}) {
  return `${origin}${pathname}?join=${encodeURIComponent(id)}${local ? '&transport=local' : ''}`;
}

/** Copie `text` : API Clipboard, sinon textarea + execCommand. Résout `true` si la copie a réussi. */
export async function copyText(text, { clipboard = globalThis.navigator?.clipboard, doc = globalThis.document } = {}) {
  try {
    if (clipboard?.writeText) {
      await clipboard.writeText(text);
      return true;
    }
  } catch { /* repli ci-dessous */ }
  try {
    const area = doc.createElement('textarea');
    area.value = text;
    area.setAttribute?.('readonly', '');
    Object.assign(area.style, { position: 'fixed', top: '0', left: '0', opacity: '0' });
    doc.body.append(area);
    area.select();
    const ok = doc.execCommand('copy');
    area.remove();
    return ok === true;
  } catch {
    return false;
  }
}

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

export const COPY_LABEL = 'Copier le lien d’invitation';
export const COPIED_LABEL = '✅ Lien copié !';

export function renderLobby(root, { link, onHome, share = globalThis.navigator?.share?.bind(globalThis.navigator) }) {
  const input = el('input', 'lobby-link');
  input.readOnly = true;
  input.value = link;
  input.setAttribute('aria-label', 'Lien d’invitation');

  const copy = el('button', 'btn', COPY_LABEL);
  copy.type = 'button';
  let resetTimer = null;
  copy.addEventListener('click', async () => {
    if (await copyText(link)) {
      copy.textContent = COPIED_LABEL;
      toast('Lien copié !');
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => { copy.textContent = COPY_LABEL; }, 2000);
    } else {
      input.select();
      toast('Copiez le lien manuellement.');
    }
  });

  const nodes = [el('h2', '', 'Inviter un joueur'), input, copy];
  if (share) {
    const b = el('button', 'btn secondary', 'Partager');
    b.type = 'button';
    b.addEventListener('click', () => {
      Promise.resolve(share({ title: 'Letter Up', text: 'Rejoins ma partie de Letter Up !', url: link })).catch(() => {});
    });
    nodes.push(b);
  }
  nodes.push(el('p', 'lobby-waiting', STATUS_WAITING));
  if (onHome) nodes.push(homeButton(onHome));
  root.replaceChildren(...nodes);
  root.hidden = false;
}

function homeButton(onHome) {
  const b = el('button', 'btn secondary', 'Accueil');
  b.type = 'button';
  b.addEventListener('click', onHome);
  return b;
}

/** Écran d'attente (« Connexion à l’hôte… », chargement). */
export function renderConnecting(root, text) {
  root.replaceChildren(el('p', 'connecting', text));
  root.hidden = false;
}

/** Écran d'erreur avec retour à l'accueil. */
export function renderError(root, message, onHome) {
  root.replaceChildren(el('p', 'error-message', message), homeButton(onHome));
  root.hidden = false;
}
