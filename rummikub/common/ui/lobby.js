// COM-02 (DESIGN-plateforme §5.6) : écran Salon (hôte et invité), formulaire « Rejoindre » et écrans de connexion, issus de
// La Rue des Consuls (RDC-07) et généralisés (nombre de sièges variable, `seatInfo`, réglages du jeu, `validateStart`).
// Rendus en chaînes HTML (testables sans DOM) + un écouteur propre au salon (attributs `data-lobby`, jamais `data-act`,
// réservé à la coquille). Aucun accès au DOM ni à `navigator` à l'import.
import { esc } from './svg.js';
import { NAME_MAX } from './player-name.js';

/** Couleurs de repli des sièges quand le jeu ne fournit pas `seatInfo`. */
export const SEAT_PALETTE = ['#c0392b', '#2471a3', '#1e8449', '#b7950b', '#7d3c98', '#d35400', '#117a65', '#566573', '#a93226', '#1a5276', '#6e2c00', '#4a235a'];

/** `{ color, label }` du siège `seat` (via `game.seatInfo` si présent, sinon palette et « Joueur N »). */
export function seatInfoOf(game, seat, { seatCount, settings } = {}) {
  return game.seatInfo?.(seat, { seatCount, settings }) ?? { color: SEAT_PALETTE[seat % SEAT_PALETTE.length], label: `Joueur ${seat + 1}` };
}

/** Lien d'invitation relatif à la page courante (fonctionne sous /<slug>/, en standalone). */
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

/** Type du siège en français : « Hôte », « Ouvert », « Invité », « IA Normale ». */
export function seatLabel(seat, game) {
  if (seat.kind === 'host') return 'Hôte';
  if (seat.kind === 'open') return 'Ouvert';
  if (seat.kind === 'guest') return 'Invité';
  const level = game.levels.find((l) => l.id === (seat.level ?? game.defaultLevel));
  return `IA ${level?.label ?? ''}`.trim();
}

const seatState = (seat) => {
  if (seat.kind === 'open') return '';
  if (seat.kind === 'bot') return '<span class="seat-state">prête</span>';
  return seat.connected ? '<span class="seat-state is-on">connecté</span>' : '<span class="seat-state is-off">déconnecté</span>';
};

function seatRow(seat, i, { game, role, you, seatCount, settings }) {
  const info = seatInfoOf(game, i, { seatCount, settings });
  const host = role === 'host';
  let button = '';
  if (host && (seat.kind === 'open' || seat.kind === 'bot')) {
    button = `<button type="button" class="btn secondary" data-lobby="cycle" data-seat="${i}" aria-label="Changer le siège ${esc(info.label)}">Changer</button>`;
  } else if (host && seat.kind === 'guest') {
    button = `<button type="button" class="btn secondary" data-lobby="release" data-seat="${i}">Libérer</button>`;
  }
  const me = i === you ? ' <small>(vous)</small>' : '';
  return `<li class="seat-row" data-seat-row="${i}"><span class="seat-chip" style="background:${esc(info.color)}">${i + 1}</span>`
    + `<span class="seat-name">${seat.name ? esc(seat.name) : '—'}${me}</span>`
    + `<span class="seat-label">${esc(info.label)}</span>`
    + `<span class="seat-kind">${esc(seatLabel(seat, game))}</span>${seatState(seat)}${button}</li>`;
}

function seatCountField(game, seatCount, editable) {
  const { counts } = game.seats;
  if (counts.length < 2) return '';
  if (!editable) return `<p class="seat-count">Joueurs : ${seatCount}</p>`;
  return '<p><label>Joueurs <select data-lobby="seat-count">'
    + `${counts.map((n) => `<option value="${n}"${n === seatCount ? ' selected' : ''}>${n}</option>`).join('')}</select></label></p>`;
}

/**
 * Salon : `role` 'host' (lien, nombre de joueurs, bascules, réglages, Lancer) ou 'guest' (attente de l'hôte).
 * `seats` : sièges publics en jeu ; `startError` : message de `validateStart` (hôte) qui désactive « Lancer ».
 */
export function lobbyHtml({
  game, role, link = '', seats, seatCount = seats.length, settings = game.settings?.defaults ?? {}, startError = null, you = 0, canShare = false,
}) {
  const host = role === 'host';
  const invite = host
    ? '<h2>Inviter des joueurs</h2>'
      + `<p class="lobby-invite"><input class="lobby-link" readonly value="${esc(link)}" aria-label="Lien d’invitation">`
      + '<button type="button" class="btn" data-lobby="copy">Copier le lien d’invitation</button>'
      + `${canShare ? '<button type="button" class="btn secondary" data-lobby="share">Partager</button>' : ''}</p>`
    : '<h2>Salon</h2>';
  const settingsHtml = game.settings?.html(settings, { editable: host, seatCount }) ?? '';
  const open = seats.filter((s) => s.kind === 'open').length;
  const level = game.levels.find((l) => l.id === game.defaultLevel)?.label ?? '';
  const foot = host
    ? `<button type="button" class="btn" data-lobby="start"${startError ? ' disabled' : ''}>Lancer la partie</button>`
      + (startError ? `<p class="start-error" role="alert">${esc(startError)}</p>` : '')
      + `<small class="hint">${open ? `${open} siège${open > 1 ? 's' : ''} ouvert${open > 1 ? 's' : ''} : ${open > 1 ? 'ils seront joués' : 'il sera joué'} par une IA ${esc(level)} au lancement.` : 'Tous les sièges sont pris.'}</small>`
    : '<p class="lobby-waiting">En attente de l’hôte…</p>';
  return `<div class="lobby">${invite}${seatCountField(game, seatCount, host)}`
    + `${settingsHtml ? `<div class="lobby-settings" data-settings>${settingsHtml}</div>` : ''}`
    + `<ul class="seat-list">${seats.map((s, i) => seatRow(s, i, { game, role, you, seatCount, settings })).join('')}</ul>${foot}`
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

/**
 * Branche sur `root` les clics `data-lobby` ({ cycle(i), release(i), copy(), share(), start(), join(), home() }), le changement du
 * nombre de joueurs (`'seat-count'(n)`) et celui des réglages (`settings(container)`, conteneur `[data-settings]`).
 */
export function bindLobby(root, handlers) {
  const onClick = (e) => {
    const el = e.target.closest?.('[data-lobby]');
    if (!el || el.disabled || el.dataset.lobby === 'seat-count') return;
    const seat = el.dataset.seat === undefined ? undefined : Number(el.dataset.seat);
    handlers[el.dataset.lobby]?.(seat, el);
  };
  const onChange = (e) => {
    const count = e.target.closest?.('[data-lobby="seat-count"]');
    if (count) { handlers['seat-count']?.(Number(count.value)); return; }
    const settings = e.target.closest?.('[data-settings]');
    if (settings) handlers.settings?.(settings);
  };
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  return () => { root.removeEventListener('click', onClick); root.removeEventListener('change', onChange); };
}
