// Barre de statut réseau et messages d'échec de l'invité (LU-11, DESIGN.md §10.1). Aucun accès au DOM à l'import.
// Hypothèses LU-11 : A11 partie terminée et connexion ouverte → « 🟢 Connecté » ; A12 `peer-unavailable` n'est fatal
// qu'avant la première connexion (ensuite l'invité continue de se reconnecter).
import { peerErrorMessage } from '../net/transport-peer.js';

export const STATUS_WAITING = '🟡 En attente du joueur 2...';
export const STATUS_MY_TURN = '🟢 Connecté - À votre tour';
export const STATUS_THEIR_TURN = "🟢 Connecté - Tour de l'adversaire";
export const STATUS_LOST = '🔴 Connexion perdue';
export const STATUS_CONNECTING = 'Connexion à l’hôte…';
export const STATUS_ENDED = '🟢 Connecté';
export const RECONNECTING = 'reconnexion…';

/** Texte + détail + tonalité de la barre de statut. `status` : statut de session (hôte ou invité). */
export function connectionStatus({ role, status, view = null, you = 0 }) {
  if (status === 'waiting') return { text: STATUS_WAITING, detail: '', tone: 'waiting' };
  if (status === 'connecting') return { text: STATUS_CONNECTING, detail: '', tone: 'waiting' };
  if (status === 'open') {
    if (!view || view.status !== 'playing') return { text: STATUS_ENDED, detail: '', tone: 'ok' };
    return { text: view.current === you ? STATUS_MY_TURN : STATUS_THEIR_TURN, detail: '', tone: 'ok' };
  }
  if (status === 'lost') return { text: STATUS_LOST, detail: role === 'guest' ? RECONNECTING : '', tone: 'lost' };
  return { text: STATUS_LOST, detail: '', tone: 'error' }; // closed, refused
}

/**
 * Message d'échec définitif côté invité, ou `null` si l'invité peut continuer (connexion en cours, reconnexion).
 * `detail` : second argument de onStatus ({ code, message } d'un transport PeerJS, { reason } pour `refused`).
 */
export function guestFailure(status, detail, everOpened) {
  if (status === 'refused') {
    return detail?.reason === 'full'
      ? 'Partie complète : deux joueurs sont déjà connectés.'
      : 'Version incompatible : rechargez la page.';
  }
  if (status === 'closed') return 'Connexion perdue : l’hôte ne répond plus.';
  if (status === 'lost') {
    if (detail?.code === 'peer-unavailable' && !everOpened) return 'Partie introuvable — vérifiez le lien';
    if (detail?.code === 'peer-missing') return peerErrorMessage('peer-missing');
  }
  return null;
}

/** Barre de statut : `node` est l'élément #status. */
export function createStatusBar(node) {
  return {
    update(info) {
      const { text, detail, tone } = connectionStatus(info);
      node.replaceChildren(document.createTextNode(text));
      if (detail) {
        const small = document.createElement('small');
        small.className = 'status-detail';
        small.textContent = ` ${detail}`;
        node.append(small);
      }
      node.dataset.tone = tone;
    },
    clear() {
      node.replaceChildren();
      delete node.dataset.tone;
    },
  };
}
