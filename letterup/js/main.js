// Coquille PWA (LU-07), hot-seat de développement (LU-10), parcours multijoueur P2P (LU-11).
// Parcours coopératif (LU-12) : choix niveau/motif (home-screen.js), réglages transmis à la session hôte (H2).
import { VERSION } from './version.js';
import { createLocalController, createNetworkController, getClientId, loadDictionary, randomSeed } from './ui/controller.js';
import { createGameScreen } from './ui/game-screen.js';
import { renderHome, renderCoopPicker } from './ui/home-screen.js';
import { renderConnecting, renderError, renderLobby, inviteLink } from './ui/lobby-screen.js';
import { renderEnd } from './ui/end-screen.js';
import { createStatusBar, guestFailure, STATUS_CONNECTING } from './ui/status.js';
import { networkNames } from './ui/messages.js';
import { actionToast, confirmDialog, toast } from './ui/dialogs.js';
import { clearHost, loadHost, persistHost } from './ui/host-save.js';
import { renderRules } from './ui/rules-screen.js';
import { createGuestSession, createHostSession } from './net/session.js';
import { connectPeerGuest, openPeerHost, HOST_RETRY_MAX } from './net/transport-peer.js';
import { connectLocalGuest, createLocalHost } from './net/transport-local.js';

window.addEventListener('load', () => {
  navigator.serviceWorker?.register('./sw.js').catch((err) => {
    console.warn('Service worker non enregistré :', err);
  });
});

// A21 : pas de toast à la première installation (le SW fait clients.claim() sans qu'il y ait de mise à jour).
const hadController = Boolean(navigator.serviceWorker?.controller);
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  if (hadController) actionToast('Nouvelle version disponible', 'Recharger', () => location.reload());
});

const $ = (id) => document.getElementById(id);
const SCREENS = ['screen-home', 'screen-lobby', 'screen-game', 'screen-end']; // Règles : voir openRules
const params = new URLSearchParams(location.search);
const local = params.get('transport') === 'local';
const reducedMotion = () => Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
document.getElementById('rules-button')?.addEventListener('click', openRules);

/** `?seed=N` (outil de développement / e2e) : graine imposée, sinon tirage aléatoire. */
function devSeed() {
  const n = Number(params.get('seed'));
  return params.has('seed') && Number.isInteger(n) ? n : randomSeed();
}

function show(...ids) {
  for (const id of SCREENS) $(id).hidden = !ids.includes(id);
}

/** Retour à l'accueil : recharge la page sans `join` (arrête sessions et transports). */
function goHome() {
  location.assign(location.pathname + (local ? '?transport=local' : ''));
}

/**
 * Écran Règles : accessible de partout. Les autres écrans ne sont pas masqués par `hidden` mais par la classe `rules-open`
 * (CSS) : la partie continue en arrière-plan et « Retour » retrouve l'état courant, quoi qu'il se soit passé entre-temps.
 */
function openRules() {
  const rules = $('screen-rules');
  if (document.body.classList.contains('rules-open')) return;
  renderRules(rules, { onBack: () => { document.body.classList.remove('rules-open'); rules.hidden = true; } });
  document.body.classList.add('rules-open');
  rules.scrollIntoView?.({ behavior: reducedMotion() ? 'auto' : 'smooth' });
}

async function abandonSaved() {
  if (!(await confirmDialog({ message: 'Abandonner la partie en cours ?', confirmLabel: 'Abandonner' }))) return;
  clearHost();
  showHome();
}

function showHome() {
  let saved = loadHost(); // A18 : on ne propose la reprise que si le transport sauvegardé est celui de l'URL
  if (saved && saved.local !== local) saved = null;
  show('screen-home');
  renderHome($('screen-home'), {
    version: VERSION,
    onVersus: () => startHost({ mode: 'versus', coop: null }),
    onCoop: () => renderCoopPicker($('screen-home'), { onConfirm: (coop) => startHost({ mode: 'coop', coop }), onBack: showHome }),
    onRules: openRules,
    resume: saved && { onResume: () => resumeHost(saved), onAbandon: abandonSaved },
  });
}

/** Charge le dictionnaire ; en cas d'échec affiche un message avec « Réessayer » et renvoie `null`. */
async function withDictionary(status) {
  status.textContent = 'Chargement du dictionnaire…';
  try {
    const dict = await loadDictionary();
    status.textContent = '';
    return dict;
  } catch (err) {
    console.warn('Dictionnaire non chargé :', err);
    status.textContent = 'Impossible de charger le dictionnaire. Vérifiez la connexion puis réessayez.';
    const retry = document.createElement('button');
    retry.className = 'btn';
    retry.textContent = 'Réessayer';
    retry.addEventListener('click', () => location.reload());
    status.append(' ', retry);
    return null;
  }
}

/**
 * `?dev=hotseat[&mode=coop&level=easy&motif=F][&seed=N]` : deux joueurs sur un seul écran, moteur local.
 * Le chevalet du joueur courant est affiché en clair (outil de développement).
 */
async function startHotseat() {
  const status = $('status');
  const dict = await withDictionary(status);
  if (!dict) return;
  const seed = devSeed();
  try {
    const controller = createLocalController({
      mode: params.get('mode') === 'coop' ? 'coop' : 'versus',
      seed,
      dict,
      coop: { level: params.get('level') ?? 'easy', motif: params.get('motif') ?? 'F' },
    });
    show('screen-game');
    createGameScreen($('screen-game'), { controller, dict, hotseat: true });
    controller.onChange((view) => {
      if (view.mode === 'coop' && view.status === 'ended') { // l'écran de score coop est partagé ; le hot-seat versus reste sans écran de fin
        renderEnd($('screen-end'), { view, you: controller.you, role: 'host', canChangeLevel: false, onRematch: () => location.reload(), onHome: goHome });
        $('screen-end').scrollIntoView?.({ behavior: reducedMotion() ? 'auto' : 'smooth' });
      }
    });
  } catch (err) {
    status.textContent = `Partie impossible : ${err.message}`;
  }
}

/** Écran Partie réseau + barre de statut + écran de fin, communs à l'hôte et à l'invité. */
function startGame(ctrl, dict) {
  const bar = createStatusBar($('status'));
  const refresh = () => bar.update({ role: ctrl.role, status: ctrl.status, view: ctrl.getView(), you: ctrl.you });
  const onChange = (view) => {
    refresh();
    if (view.status === 'ended') {
      renderEnd($('screen-end'), { view, you: ctrl.you, role: ctrl.role, onRematch: (next) => ctrl.rematch(next), onHome: () => { ctrl.close(); goHome(); } });
      $('screen-end').scrollIntoView?.({ behavior: reducedMotion() ? 'auto' : 'smooth' });
    } else {
      $('screen-end').hidden = true;
    }
  };
  show('screen-game');
  createGameScreen($('screen-game'), { controller: ctrl, dict, names: networkNames(ctrl.you), turnStatusLine: false });
  ctrl.onChange(onChange);
  ctrl.onStatus(refresh);
  onChange(ctrl.getView());
}

/**
 * Session hôte commune au démarrage et à la reprise : transport → session (restaurée si `snapshot`) → sauvegarde (§9.3).
 * Le transport est fermé à `pagehide` pour libérer l'identifiant et prévenir l'invité sans attendre le délai de 15 s.
 */
function runHost({ settings, transportHost, id, dict, snapshot, seed = randomSeed() }) {
  transportHost.onError?.((err) => toast(err.message));
  const session = createHostSession({ settings, seed, dict, randomSeed });
  if (snapshot) session.restore(snapshot);
  transportHost.onConnection((t) => session.accept(t));
  persistHost(session, { peerId: id, local });
  window.addEventListener('pagehide', (e) => { if (!e.persisted) transportHost.close(); });
  return createNetworkController(session);
}

async function startHost(settings) {
  show('screen-lobby');
  const lobby = $('screen-lobby');
  const status = $('status');
  const dict = await withDictionary(status);
  if (!dict) return;
  let transportHost;
  let id;
  try {
    transportHost = local ? createLocalHost() : await openPeerHost();
    id = local ? transportHost.room : await transportHost.id;
  } catch (err) {
    renderError(lobby, err.message, goHome);
    return;
  }
  const ctrl = runHost({ settings, transportHost, id, dict, seed: local ? devSeed() : randomSeed() });
  const bar = createStatusBar(status);
  bar.update({ role: 'host', status: 'waiting' });
  renderLobby(lobby, { link: inviteLink(location, id, { local }), onHome: goHome });
  const unsubscribe = ctrl.onStatus((s) => {
    if (s !== 'open') return;
    unsubscribe();
    startGame(ctrl, dict);
  });
}

/** Reprise de l'hôte (§9.3, A19) : même identifiant → le lien d'invitation reste valide ; la partie s'affiche aussitôt. */
async function resumeHost(saved) {
  show('screen-lobby');
  const lobby = $('screen-lobby');
  const status = $('status');
  renderConnecting(lobby, 'Reprise de la partie…');
  const dict = await withDictionary(status);
  if (!dict) return;
  let transportHost;
  try {
    transportHost = local
      ? createLocalHost({ room: saved.peerId })
      : await openPeerHost({
        peerId: saved.peerId,
        onRetry: (n) => { status.textContent = `Reprise de la partie… (tentative ${n}/${HOST_RETRY_MAX})`; },
      });
  } catch (err) {
    renderError(lobby, err.message, goHome); // la sauvegarde est conservée : on peut réessayer
    return;
  }
  status.textContent = '';
  let ctrl;
  try {
    ctrl = runHost({ settings: saved.settings, transportHost, id: saved.peerId, dict, snapshot: saved.snapshot });
  } catch (err) { // sauvegarde illisible : on libère l'identifiant et on l'abandonne
    transportHost.close();
    clearHost();
    renderError(lobby, `Reprise impossible : ${err.message}`, goHome);
    return;
  }
  startGame(ctrl, dict);
}

async function startGuest(hostId) {
  const status = $('status');
  show('screen-lobby');
  const screen = $('screen-lobby');
  renderConnecting(screen, STATUS_CONNECTING);
  const dictPromise = withDictionary(status);
  const clientId = getClientId(hostId);
  const connect = local ? () => connectLocalGuest(hostId) : () => connectPeerGuest(hostId, { clientId });
  const ctrl = createNetworkController(createGuestSession({ connect, clientId }));
  let everOpened = false;
  let failed = false;
  ctrl.onStatus((s, detail) => {
    if (s === 'open') everOpened = true;
    const message = guestFailure(s, detail, everOpened);
    if (message && !failed) {
      failed = true;
      ctrl.close();
      show('screen-lobby');
      renderError(screen, message, goHome);
      createStatusBar(status).clear();
    }
  });
  window.addEventListener('pagehide', (e) => { if (!e.persisted) ctrl.close(); });
  const [dict] = await Promise.all([dictPromise, ctrl.ready]);
  if (dict && !failed) startGame(ctrl, dict);
}

const join = params.get('join');
if (params.get('dev') === 'hotseat') startHotseat();
else if (join) startGuest(join);
else showHome();
