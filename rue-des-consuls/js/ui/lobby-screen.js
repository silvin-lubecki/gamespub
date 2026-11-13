// RDC-07 (DESIGN.md §9.2, §10.1) : écran Salon (hôte et invité), formulaire « Rejoindre » et écrans de connexion.
// Rendus en chaînes HTML (testables sans DOM) + un écouteur propre au salon (attributs `data-lobby`, jamais `data-act`,
// réservé à main.js). Aucun accès au DOM ni à `navigator` à l'import. Hypothèses : H14 (« Confier à l'IA », net-bar.js).
import { SEAT_COLORS } from '../engine/index.js';
import { POLICY_LABELS } from '../net/session.js';
import { esc } from './cards.js';
import { NAME_MAX } from './player-name.js';

/** Lien d'invitation relatif à la page courante (fonctionne sous /rue-des-consuls/, en standalone). */
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

export const COPY_OK = 'Lien copié !';

/** Type du siège en français : « Hôte », « Ouvert », « Invité », « IA Équilibrée ». */
export function seatLabel(seat) {
  if (seat.kind === 'host') return 'Hôte';
  if (seat.kind === 'open') return 'Ouvert';
  if (seat.kind === 'guest') return 'Invité';
  return `IA ${POLICY_LABELS[seat.policy] ?? POLICY_LABELS.opportunist}`;
}

const seatState = (seat) => {
  if (seat.kind === 'open') return '';
  if (seat.kind === 'bot') return '<span class="seat-state">prête</span>';
  return seat.connected ? '<span class="seat-state is-on">connecté</span>' : '<span class="seat-state is-off">déconnecté</span>';
};

function seatRow(seat, i, { role, you }) {
  const c = SEAT_COLORS[i];
  const host = role === 'host';
  let button = '';
  if (host && (seat.kind === 'open' || seat.kind === 'bot')) {
    button = `<button type="button" class="btn secondary" data-lobby="cycle" data-seat="${i}" aria-label="Changer le siège ${c.name}">Changer</button>`;
  } else if (host && seat.kind === 'guest') {
    button = `<button type="button" class="btn secondary" data-lobby="release" data-seat="${i}">Libérer</button>`;
  }
  const me = i === you ? ' <small>(vous)</small>' : '';
  return `<li class="seat-row" data-seat-row="${i}"><span class="seat-chip" style="background:${c.hex}">${c.initial}</span>`
    + `<span class="seat-name">${seat.name ? esc(seat.name) : '—'}${me}</span>`
    + `<span class="seat-kind">${esc(seatLabel(seat))}</span>${seatState(seat)}${button}</li>`;
}

/** Salon : `role` 'host' (lien, bascules, Lancer) ou 'guest' (attente de l'hôte). */
export function lobbyHtml({ role, link = '', seats, you = 0, canShare = false }) {
  const host = role === 'host';
  const invite = host
    ? '<h2>Inviter des joueurs</h2>'
      + `<p class="lobby-invite"><input class="lobby-link" readonly value="${esc(link)}" aria-label="Lien d’invitation">`
      + '<button type="button" class="btn" data-lobby="copy">Copier le lien d’invitation</button>'
      + `${canShare ? '<button type="button" class="btn secondary" data-lobby="share">Partager</button>' : ''}</p>`
    : '<h2>Salon</h2>';
  const open = seats.filter((s) => s.kind === 'open').length;
  const foot = host
    ? '<button type="button" class="btn" data-lobby="start">Lancer la partie</button>'
      + `<small class="hint">${open ? `${open} siège${open > 1 ? 's' : ''} ouvert${open > 1 ? 's' : ''} : ${open > 1 ? 'ils seront joués' : 'il sera joué'} par une IA Équilibrée au lancement.` : 'Tous les sièges sont pris.'}</small>`
    : '<p class="lobby-waiting">En attente de l’hôte…</p>';
  return `<div class="lobby">${invite}<ul class="seat-list">${seats.map((s, i) => seatRow(s, i, { role, you })).join('')}</ul>${foot}`
    + '<p><button type="button" class="btn secondary" data-lobby="home">Accueil</button></p></div>';
}

/** Arrivée par `?join=` : nom du joueur puis « Rejoindre ». */
export function joinFormHtml(name = '') {
  return '<div class="lobby"><h2>Rejoindre une partie</h2>'
    + `<p><label>Votre nom <input id="join-name" maxlength="${NAME_MAX}" value="${esc(name)}" autocomplete="nickname"></label></p>`
    + '<p><button type="button" class="btn" data-lobby="join">Rejoindre</button> '
    + '<button type="button" class="btn secondary" data-lobby="home">Accueil</button></p></div>';
}

/** Écran d'attente (« Connexion à l’hôte… ») ou d'erreur avec retour à l'accueil. */
export function messageHtml(text, { error = false, home = true } = {}) {
  return `<div class="lobby"><p class="${error ? 'error-message' : 'connecting'}">${esc(text)}</p>`
    + `${home ? '<p><button type="button" class="btn secondary" data-lobby="home">Accueil</button></p>' : ''}</div>`;
}

/** Messages des refus d'un invité (`refused`). */
export const REFUSED_MESSAGES = {
  full: 'Cette salle est complète.',
  started: 'La partie a déjà commencé.',
  released: 'L’hôte vous a retiré de la salle.',
  replaced: 'Cette partie est ouverte dans un autre onglet ou appareil : elle a pris votre place.',
  version: 'Version incompatible : rechargez la page pour mettre le jeu à jour.',
};

/** Branche les clics `data-lobby` de `root` sur `handlers` ({ cycle(i), release(i), copy(), share(), start(), join(), home() }). */
export function bindLobby(root, handlers) {
  const onClick = (e) => {
    const el = e.target.closest?.('[data-lobby]');
    if (!el || el.disabled) return;
    const seat = el.dataset.seat === undefined ? undefined : Number(el.dataset.seat);
    handlers[el.dataset.lobby]?.(seat, el);
  };
  root.addEventListener('click', onClick);
  return () => root.removeEventListener('click', onClick);
}
