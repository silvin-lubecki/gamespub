// RDC-01 (DESIGN.md §4) : coquille PWA. RDC-05 (DESIGN.md §10.1) : écrans Accueil / Partie / Fin / Règles et mode ?dev=hotseat.
import { VERSION } from './version.js';
import { createLocalController, randomSeed } from './ui/controller.js';
import { mountGame } from './ui/game-screen.js';
import { renderEnd } from './ui/game-view.js';
import { POLICIES, POLICY_NAMES } from './ai/policy.js';
import { BOT_NAMES, DEFAULT_NAME, NAME_KEY, clearSolo, loadSolo, parseParams, saveSolo } from './ui/solo.js';
import { esc } from './ui/cards.js';
import { createNetFlows } from './ui/net-flow.js';
import { toggleFullscreen } from './ui/stage.js';

window.addEventListener('load', () => {
  navigator.serviceWorker?.register('./sw.js').catch((err) => {
    console.warn('Service worker non enregistré :', err);
  });
});

document.documentElement.dataset.version = VERSION;

const params = new URLSearchParams(location.search);
const opts = parseParams(location.search);
const SCREENS = ['home', 'lobby', 'game', 'end', 'rules'];
const el = (id) => document.getElementById(`screen-${id}`);
let current = 'home';
let previous = 'home';
let game = null;
const flows = createNetFlows({ show, el, params, onRules: () => show('rules') }); // RDC-07 : parcours réseau

function show(id) {
  if (id === 'rules') previous = current;
  current = id;
  if (id === 'home') renderHome();
  for (const s of SCREENS) el(s).hidden = s !== id;
  document.body.dataset.screen = id;
}

function stopGame() {
  game?.dispose();
  game = null;
}

let lastGame = { kind: 'hotseat' };
let usedSeed = false; // `?seed=` ne sert que pour la première partie

function nextSeed() {
  if (!usedSeed && opts.seed !== null) {
    usedSeed = true;
    return opts.seed;
  }
  usedSeed = true;
  return randomSeed();
}

function launch(controller) {
  // Plein écran automatique sur appareil tactile (geste utilisateur : clic sur « Jouer »).
  if (matchMedia('(pointer: coarse)').matches) toggleFullscreen(document, screen, { enterOnly: true });
  show('game');
  game = mountGame(el('game'), controller, {
    onEnd: (view, lines) => { stopGame(); clearSolo(localStorage); el('end').innerHTML = renderEnd(view, lines); show('end'); },
    onQuit: () => { if (confirm('Quitter la partie en cours ?')) { stopGame(); show('home'); } },
    onRules: () => show('rules'),
  });
}

function startHotseat() {
  stopGame();
  lastGame = { kind: 'hotseat' };
  const names = ['Joueur 1', 'Joueur 2', 'Joueur 3', 'Joueur 4'];
  launch(createLocalController({ seed: nextSeed(), names, hotseat: true }));
}

/** Solo : l'humain au siège 0, trois IA ; `policies` = personnalités des sièges 1 à 3 ; `resume` : partie sauvegardée. */
function startSolo({ policies, resume = null } = {}) {
  stopGame();
  const seats = resume ? resume.policies : [opts.autoplay ? 'opportunist' : null, ...policies];
  lastGame = { kind: 'solo', policies: seats.slice(1) };
  const name = (localStorage.getItem(NAME_KEY) || DEFAULT_NAME).slice(0, 20);
  const controller = createLocalController({
    seed: resume ? undefined : nextSeed(),
    names: [name, ...BOT_NAMES],
    initialState: resume?.state ?? null,
    hotseat: false,
    humanSeat: 0,
    policies: seats,
    delayMs: opts.botDelay,
    onCommit: (state) => (state.phase === 'ended' ? clearSolo(localStorage) : saveSolo(localStorage, { state, policies: seats })),
  });
  launch(controller);
}

function replay() {
  if (lastGame.kind === 'solo') startSolo({ policies: lastGame.policies });
  else startHotseat();
}

function policySelect(i) {
  const options = POLICIES.map((p) => `<option value="${p}">${esc(POLICY_NAMES[p])}</option>`).join('');
  return `<label>${esc(BOT_NAMES[i])} <select id="bot-policy-${i}" data-bot="${i}">${options}</select></label>`;
}

function renderHome() {
  const dev = params.get('dev') === 'hotseat';
  const name = esc(localStorage.getItem(NAME_KEY) || '');
  const saved = loadSolo(localStorage);
  el('home').innerHTML = '<div class="home-menu">'
    + `<label class="name-field">Votre nom <input id="player-name" type="text" maxlength="20" placeholder="${DEFAULT_NAME}" value="${name}"></label>`
    + (saved ? '<button type="button" class="btn" id="btn-resume" data-act="resume">Reprendre la partie</button>' : '')
    + '<button type="button" class="btn" id="btn-solo" data-act="solo">Jouer contre l\'IA</button>'
    + `<div id="solo-setup" class="solo-setup" hidden><p class="hint">Personnalité de chaque adversaire :</p>${[0, 1, 2].map(policySelect).join('')}`
    + '<button type="button" class="btn btn-primary" id="btn-solo-start" data-act="solo-start">Lancer la partie</button></div>'
    + flows.homeHtml()
    + (dev ? '<button type="button" class="btn" id="btn-hotseat" data-act="hotseat">Partie à 4 sur cet écran (dev)</button>' : '')
    + '<button type="button" class="btn" data-act="rules">Règles</button></div>';
}

document.addEventListener('click', (e) => {
  const act = e.target.closest?.('[data-act]');
  if (!act || act.disabled || act.closest('#screen-game')) return; // l'écran Partie gère ses propres clics
  if (act.dataset.act === 'hotseat') startHotseat();
  else if (act.dataset.act === 'solo') el('home').querySelector('#solo-setup').hidden = false;
  else if (act.dataset.act === 'solo-start') {
    const policies = [0, 1, 2].map((i) => el('home').querySelector(`#bot-policy-${i}`).value);
    startSolo({ policies });
  } else if (act.dataset.act === 'resume') startSolo({ resume: loadSolo(localStorage) });
  else if (act.dataset.act === 'replay') replay();
  else if (act.dataset.act === 'room') flows.host(el('home').querySelector('#player-name').value);
  else if (act.dataset.act === 'resume-room') flows.resume(flows.saved());
  else if (act.dataset.act === 'rules') show('rules');
  else if (act.dataset.act === 'back') show(previous === 'rules' ? 'home' : previous);
  else if (act.dataset.act === 'home') show('home');
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'player-name') localStorage.setItem(NAME_KEY, e.target.value.trim());
});

const join = params.get('join');
if (join) flows.join(join);
else show('home');
