// COM-02 (DESIGN-plateforme §5.6) : écran Solo (nombre de joueurs, niveau de chaque IA, réglages), en chaîne HTML + lecture du formulaire.
import { esc } from './svg.js';

/** Noms des IA, dans l'ordre des sièges 1, 2, … */
export const BOT_NAMES = ['Bilal', 'Chloé', 'Driss', 'Éva', 'Farid', 'Gaëlle', 'Hugo', 'Inès', 'Jules', 'Kenza', 'Léo'];

/** Formulaire par défaut : nombre de joueurs et réglages par défaut du jeu, IA du niveau par défaut. */
export function defaultSoloForm(game) {
  const seatCount = game.seats.default;
  return { seatCount, levels: Array(seatCount - 1).fill(game.defaultLevel), settings: game.settings.parse(game.settings.defaults, seatCount) };
}

/** Le formulaire `form` ({ seatCount, levels, settings }) pour un autre nombre de joueurs `seatCount` (niveaux conservés ; réglages revalidés). */
export function withSeatCount(game, form, seatCount) {
  const levels = Array.from({ length: seatCount - 1 }, (_, i) => form.levels[i] ?? game.defaultLevel);
  return { seatCount, levels, settings: game.settings.parse(form.settings, seatCount) ?? game.settings.parse(game.settings.defaults, seatCount) };
}

/** Lit les champs `[name]` d'un conteneur de réglages : nombre → Number, case à cocher → booléen, sinon chaîne. */
export function readSettingsRaw(container) {
  const raw = {};
  for (const f of container?.querySelectorAll('[name]') ?? []) {
    const type = f.getAttribute('type');
    raw[f.getAttribute('name')] = type === 'checkbox' ? Boolean(f.checked) : type === 'number' ? Number(f.value) : f.value;
  }
  return raw;
}

/** Écran Solo ; « Lancer » est désactivé avec le message de `validateStart`. */
export function soloHtml({ game, form }) {
  const { counts } = game.seats;
  const error = game.validateStart?.(form.seatCount, form.settings) ?? null;
  const countField = counts.length > 1
    ? '<p><label>Joueurs <select data-solo="seat-count">'
      + `${counts.map((n) => `<option value="${n}"${n === form.seatCount ? ' selected' : ''}>${n}</option>`).join('')}</select></label></p>`
    : '';
  const levelOptions = (current) => game.levels.map((l) => `<option value="${esc(l.id)}"${l.id === current ? ' selected' : ''}>${esc(l.label)}</option>`).join('');
  const bots = form.levels.map((level, i) => `<p><label>${esc(BOT_NAMES[i])} <select data-solo-level="${i}">${levelOptions(level)}</select></label></p>`).join('');
  const settingsHtml = game.settings.html(form.settings, { editable: true, seatCount: form.seatCount });
  return '<div class="solo-setup"><h2>Jouer contre l’IA</h2>'
    + `${countField}${bots ? `<p class="hint">Niveau de chaque adversaire :</p>${bots}` : ''}`
    + `${settingsHtml ? `<div data-settings>${settingsHtml}</div>` : ''}`
    + `<button type="button" class="btn" id="btn-solo-start" data-act="solo-start"${error ? ' disabled' : ''}>Lancer la partie</button>`
    + (error ? `<p class="start-error" role="alert">${esc(error)}</p>` : '')
    + '<p><button type="button" class="btn secondary" data-act="home">Accueil</button></p></div>';
}

/** Lit l'écran Solo rendu dans `container` → { seatCount, levels, settings } ; `previous` donne les valeurs de repli. */
export function readSoloForm(container, game, previous) {
  const count = container.querySelector('[data-solo="seat-count"]');
  const seatCount = count ? Number(count.value) : previous.seatCount;
  const base = seatCount === previous.seatCount ? previous : withSeatCount(game, previous, seatCount);
  const levels = base.levels.map((l, i) => container.querySelector(`[data-solo-level="${i}"]`)?.value ?? l);
  const settingsEl = container.querySelector('[data-settings]');
  const settings = settingsEl ? game.settings.parse(readSettingsRaw(settingsEl), seatCount) ?? base.settings : base.settings;
  return { seatCount, levels, settings };
}
