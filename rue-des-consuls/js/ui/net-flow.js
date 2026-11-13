// RDC-07 (DESIGN.md §9, §10.1) : parcours réseau de la coquille (créer / reprendre / rejoindre une salle, Salon, Partie
// en réseau, Fin, rejouer). Tout le câblage DOM réseau vit ici pour garder main.js minimal. Hypothèses : H13 (hôte
// absent : partie suspendue), H14 (« Confier à l'IA », barre réseau).
// `?transport=local` (dev, e2e) : canal BroadcastChannel ; `?seed=` et `?botDelay=` ne sont lus que dans ce mode, par l'hôte.
// Crochet de test (mode local uniquement) : `window.rdcNet = { act, view, seats }`.
import { createGuestSession, createHostSession } from '../net/session.js';
import { connectLocalGuest, createLocalHost } from '../net/transport-local.js';
import { connectPeerGuest, openPeerHost } from '../net/transport-peer.js';
import { clearHost, loadHost, persistHost } from './host-save.js';
import { randomSeed } from './controller.js';
import { mountGame } from './game-screen.js';
import { renderEnd } from './game-view.js';
import {
  COPY_OK, REFUSED_MESSAGES, bindLobby, copyText, inviteLink, joinFormHtml, lobbyHtml, messageHtml,
} from './lobby-screen.js';
import { createNetworkController, getClientId } from './net-controller.js';
import { netBarHtml } from './net-bar.js';
import { cleanName, loadName, saveName } from './player-name.js';
import { parseParams } from './solo.js';
import { toggleFullscreen } from './stage.js';

export function createNetFlows({ show, el, params, onRules }) {
  const local = params.get('transport') === 'local';
  let ctrl = null;
  let game = null;
  let bar = null;
  let inGame = false;
  let stopLobby = null;
  let cleanups = [];

  const goHome = () => location.assign(location.pathname + (local ? '?transport=local' : ''));

  const opts = local ? parseParams(`?${params}`) : { seed: null, botDelay: undefined };

  const lobbyScreen = () => el('lobby');
  const setLobby = (html, handlers = { home: goHome }) => {
    stopLobby?.();
    lobbyScreen().innerHTML = html;
    stopLobby = bindLobby(lobbyScreen(), handlers);
    show('lobby');
  };
  const message = (text, o) => setLobby(messageHtml(text, o));

  function unmountGame() {
    game?.dispose();
    game = null;
    bar = null;
  }

  function refreshBar() {
    if (!bar || !ctrl) return;
    bar.innerHTML = netBarHtml({ role: ctrl.role, you: ctrl.you, status: ctrl.status, seats: ctrl.seats ?? [] });
  }

  function enterGame() {
    inGame = true;
    unmountGame();
    show('game');
    game = mountGame(el('game'), ctrl, {
      onEnd: (view, lines) => { unmountGame(); showEnd(view, lines); },
      onQuit: () => {
        const text = ctrl.role === 'host'
          ? 'Quitter la salle ? La partie sera suspendue pour les autres joueurs (vous pourrez la reprendre depuis l’accueil).'
          : 'Quitter la partie en cours ?';
        if (confirm(text)) { shutdown(); goHome(); }
      },
      onRules,
    });
    bar = document.createElement('div');
    bar.className = 'net-bar-host';
    bar.addEventListener('click', (e) => {
      const btn = e.target.closest?.('[data-net="confide"]');
      if (btn) ctrl.confide(Number(btn.dataset.seat));
    });
    el('game').append(bar);
    refreshBar();
  }

  function showEnd(view, lines) {
    const html = renderEnd(view, lines);
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    const replay = doc.querySelector('[data-act="replay"]');
    if (ctrl.role === 'host') replay?.setAttribute('data-act', 'net-replay'); else replay?.remove();
    doc.querySelector('[data-act="home"]')?.setAttribute('data-act', 'net-home');
    el('end').innerHTML = doc.body.firstElementChild.innerHTML;
    show('end');
  }

  el('end').addEventListener('click', (e) => {
    const act = e.target.closest?.('[data-act]')?.dataset.act;
    if (act === 'net-replay') ctrl?.rematch();
    else if (act === 'net-home') { shutdown(); goHome(); }
  });

  function shutdown() {
    for (const fn of cleanups) fn();
    cleanups = [];
    unmountGame();
    ctrl?.close();
  }

  function wire(c) {
    ctrl = c;
    inGame = false;
    if (local) window.rdcNet = { act: (a) => c.act(a), view: () => c.getView(), seats: () => c.seats };
    // Premier `state` (invité) ou nouvelle partie (rejouer) : l'écran Partie se monte quand une partie en cours est reçue.
    c.onChange((view) => { if (!game && view.phase !== 'ended') enterGame(); });
    c.onSeats(() => { refreshBar(); });
  }

  async function startHost(rawName, saved = null) {
    const name = cleanName(rawName);
    if (!saved) saveName(name); // une reprise ne modifie pas le nom mémorisé
    message(saved ? 'Reprise de la salle…' : 'Création de la salle…', { home: true });
    let transportHost;
    let id;
    try {
      if (local) {
        transportHost = createLocalHost({ room: saved?.peerId });
        id = transportHost.room;
      } else {
        transportHost = await openPeerHost({
          peerId: saved?.peerId,
          onRetry: (n) => message(`Reprise de la salle… (tentative ${n + 1}, l’ancien identifiant se libère)`),
        });
        id = await transportHost.id;
      }
    } catch (err) {
      message(err.message || 'Impossible de créer la salle.', { error: true });
      return;
    }
    const session = createHostSession({
      name, seed: opts.seed ?? undefined, randomSeed,
      botDelayMs: opts.botDelay,
    });
    transportHost.onConnection((t) => session.accept(t));
    transportHost.onError?.((err) => { document.getElementById('status').textContent = err.message; });
    const onHide = (e) => { if (!e.persisted) transportHost.close(); };
    window.addEventListener('pagehide', onHide);
    cleanups.push(() => { window.removeEventListener('pagehide', onHide); transportHost.close(); });
    wire(createNetworkController(session));
    if (saved) {
      try { session.restore(saved.snapshot); } catch { clearHost(); message('Sauvegarde illisible.', { error: true }); return; }
    }
    persistHost(session, { peerId: id, local });
    if (saved) return; // restore() a déjà monté l'écran Partie (onChange)
    const link = inviteLink(location, id, { local });
    const render = () => {
      if (inGame) return;
      setLobby(lobbyHtml({ role: 'host', link, seats: ctrl.seats, you: 0, canShare: Boolean(navigator.share) }), {
        cycle: (i) => ctrl.cycleSeat(i),
        release: (i) => ctrl.releaseSeat(i),
        copy: async (_, btn) => {
          const ok = await copyText(link);
          if (!ok) lobbyScreen().querySelector('.lobby-link')?.select();
          btn.textContent = ok ? COPY_OK : 'Copiez le lien manuellement.';
        },
        share: () => { Promise.resolve(navigator.share({ title: 'La Rue des Consuls', text: 'Rejoins ma partie !', url: link })).catch(() => {}); },
        start: () => {
          if (matchMedia('(pointer: coarse)').matches) toggleFullscreen(document, screen, { enterOnly: true });
          ctrl.start();
        },
        home: () => { shutdown(); goHome(); },
      });
    };
    ctrl.onSeats(render);
    render();
  }

  function join(hostId) {
    const connectNow = (rawName) => {
      const name = cleanName(rawName);
      saveName(name);
      message('Connexion à l’hôte…');
      const clientId = getClientId(hostId);
      const connect = local ? () => connectLocalGuest(hostId) : () => connectPeerGuest(hostId, { clientId });
      const session = createGuestSession({ connect, clientId, name });
      const onHide = (e) => { if (!e.persisted) ctrl?.close(); };
      window.addEventListener('pagehide', onHide);
      cleanups.push(() => window.removeEventListener('pagehide', onHide));
      wire(createNetworkController(session));
      const render = () => {
        if (inGame) return;
        const { status } = ctrl;
        if (status === 'refused') return;
        if (status === 'open' && ctrl.seats) setLobby(lobbyHtml({ role: 'guest', seats: ctrl.seats, you: ctrl.you }));
        else if (status === 'closed') message('Hôte injoignable. Rouvrez le lien quand l’hôte aura repris la salle.', { error: true });
        else if (status === 'lost') message('Connexion perdue, reconnexion…');
      };
      ctrl.onSeats(render);
      let refused = false;
      ctrl.onStatus((status, detail) => {
        if (refused) return;
        if (status === 'refused') {
          refused = true;
          message(REFUSED_MESSAGES[detail?.reason] ?? 'Connexion refusée.', { error: true });
          ctrl.close();
        } else { render(); refreshBar(); }
      });
    };
    setLobby(joinFormHtml(loadName()), {
      join: () => connectNow(document.getElementById('join-name').value),
      home: goHome,
    });
  }

  const savedRoom = () => {
    const saved = loadHost();
    return saved && saved.local === local ? saved : null;
  };

  return {
    /** Accueil (le champ Nom est celui du mode Solo) : « Créer une salle » et, s'il y a une sauvegarde, « Reprendre la salle ». */
    homeHtml: () => '<button type="button" class="btn" data-act="room">Créer une salle</button>'
      + (savedRoom() ? '<button type="button" class="btn" data-act="resume-room">Reprendre la salle</button>' : ''),
    host: (name) => startHost(name),
    resume: (saved) => startHost(saved.snapshot.seats[0].name, saved),
    join,
    saved: savedRoom,
  };
}
