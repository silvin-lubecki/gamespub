// COM-01 (DESIGN-plateforme §5.1) : validation du descripteur de jeu. Les modules du socle appellent `assertGame`
// puis `withDefaults` (réglages facultatifs). Aucun accès au DOM.
const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isFn = (x) => typeof x === 'function';

const fail = (field, why) => { throw new Error(`game.${field} : ${why}`); };

/** Lance une Error nommant le champ fautif si le descripteur est incomplet ou incohérent ; renvoie `game`. */
export function assertGame(game) {
  if (!isObject(game)) throw new Error('game : descripteur manquant');
  if (typeof game.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(game.id)) fail('id', 'slug attendu (a-z, 0-9, -)');
  if (typeof game.title !== 'string' || !game.title) fail('title', 'chaîne non vide attendue');
  if (!Number.isInteger(game.protocolVersion) || game.protocolVersion < 1) fail('protocolVersion', 'entier ≥ 1 attendu');

  const seats = game.seats;
  if (!isObject(seats)) fail('seats', 'objet { min, max, counts, default } attendu');
  const { min, max, counts } = seats;
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min) fail('seats', 'min/max invalides');
  if (!Array.isArray(counts) || counts.length === 0) fail('seats.counts', 'liste non vide attendue');
  if (!counts.every((n, i) => Number.isInteger(n) && n >= min && n <= max && (i === 0 || n > counts[i - 1]))) {
    fail('seats.counts', 'entiers strictement croissants dans [min, max] attendus');
  }
  if (!counts.includes(seats.default)) fail('seats.default', 'doit appartenir à counts');

  if (!Array.isArray(game.levels) || game.levels.length === 0) fail('levels', 'liste non vide attendue');
  const ids = new Set();
  for (const l of game.levels) {
    if (!isObject(l) || typeof l.id !== 'string' || !l.id || typeof l.label !== 'string' || ids.has(l.id)) fail('levels', 'ids uniques et libellés attendus');
    ids.add(l.id);
  }
  if (!ids.has(game.defaultLevel)) fail('defaultLevel', 'doit être un id de levels');

  const e = game.engine;
  if (!isObject(e)) fail('engine', 'objet attendu');
  if (e.STATE_VERSION === undefined || e.STATE_VERSION === null) fail('engine.STATE_VERSION', 'manquant');
  for (const f of ['createGame', 'applyAction', 'viewFor', 'currentSeat', 'isOver']) if (!isFn(e[f])) fail(`engine.${f}`, 'fonction attendue');
  if (e.redactEvents !== undefined && !isFn(e.redactEvents)) fail('engine.redactEvents', 'fonction attendue');

  if (!isFn(game.parseAction)) fail('parseAction', 'fonction attendue');
  if (!isObject(game.bots) || !isFn(game.bots.chooseAction)) fail('bots.chooseAction', 'fonction attendue');
  if (game.bots.fallback !== undefined && !isFn(game.bots.fallback)) fail('bots.fallback', 'fonction attendue');

  if (game.settings !== undefined) {
    const s = game.settings;
    if (!isObject(s) || !isObject(s.defaults) || !isFn(s.parse) || !isFn(s.html)) fail('settings', '{ defaults, parse, html } attendu');
    for (const n of counts) if (s.parse(s.defaults, n) === null) fail('settings.parse', `refuse les réglages par défaut pour ${n} sièges`);
  }
  if (game.validateStart !== undefined && !isFn(game.validateStart)) fail('validateStart', 'fonction attendue');
  if (game.seatInfo !== undefined && !isFn(game.seatInfo)) fail('seatInfo', 'fonction attendue');
  if (game.ui !== undefined) { // COM-02 : écrans fournis à la coquille (shell.js)
    const ui = game.ui;
    if (!isObject(ui)) fail('ui', 'objet attendu');
    for (const f of ['mountGame', 'renderEnd', 'rulesHtml']) if (!isFn(ui[f])) fail(`ui.${f}`, 'fonction attendue');
    if (ui.stage !== undefined && ui.stage !== 'landscape') fail('ui.stage', "« landscape » attendu");
  }
  return game;
}

const NO_SETTINGS = { defaults: {}, parse: (raw) => (isObject(raw) ? {} : null), html: () => '' };

/** Descripteur validé, avec des réglages vides par défaut (`settings` facultatif). */
export function withDefaults(game) {
  assertGame(game);
  return game.settings ? game : { ...game, settings: NO_SETTINGS };
}
