// Transport PeerJS (window.Peer, CDN ; DESIGN.md §9.1). Aucune hypothèse H1–H14 (règles) n'est utilisée ici.
// A8 : fermeture après `refused` via conn.close({ flush: true }) (PeerJS ≥ 1.5.0).
import { parseMessage } from './protocol.js';

const MISSING = 'La bibliothèque PeerJS n’a pas pu être chargée.';
export const PEER_ERROR_MESSAGES = {
  'peer-unavailable': 'Partie introuvable : le lien d’invitation a peut-être expiré.',
  network: 'Connexion au serveur perdue. Vérifiez votre réseau.',
  'unavailable-id': 'Cet identifiant de partie est déjà utilisé.',
  'browser-incompatible': 'Ce navigateur ne prend pas en charge WebRTC.',
  'peer-missing': MISSING,
};
export const peerErrorMessage = (type) => PEER_ERROR_MESSAGES[type] ?? 'Erreur réseau inattendue.';

function makeTransport(closeImpl) {
  const msgCbs = new Set();
  const statusCbs = new Set();
  const t = {
    status: 'connecting',
    detail: null,
    conn: null,
    send(obj) { if (t.status === 'open' && t.conn) t.conn.send(JSON.stringify(obj)); },
    onMessage(cb) { msgCbs.add(cb); return () => msgCbs.delete(cb); },
    onStatus(cb) { statusCbs.add(cb); return () => statusCbs.delete(cb); },
    close() {
      if (t.status === 'closed') return;
      closeImpl();
      t.setStatus('closed');
    },
    setStatus(s, detail) {
      if (t.status === s) return;
      t.status = s;
      if (detail) t.detail = detail;
      for (const cb of [...statusCbs]) cb(s, detail);
    },
    deliver(raw) {
      const msg = parseMessage(raw);
      if (msg) for (const cb of [...msgCbs]) cb(msg);
    },
  };
  return t;
}

function link(t, conn) {
  t.conn = conn;
  conn.on('open', () => t.setStatus('open'));
  conn.on('data', (d) => t.deliver(d));
  conn.on('close', () => t.setStatus('closed'));
  conn.on('error', (e) => t.setStatus('closed', { code: e?.type ?? 'error', message: peerErrorMessage(e?.type) }));
  if (conn.open) t.setStatus('open');
  return t;
}

/** Enveloppe une DataConnection PeerJS en transport. */
export function wrapConnection(conn) {
  return link(makeTransport(() => conn.close({ flush: true })), conn);
}

export function createPeerHost({ peerId, PeerCtor = globalThis.Peer, peerOptions } = {}) {
  if (!PeerCtor) throw new Error(MISSING);
  const peer = peerId ? new PeerCtor(peerId, peerOptions) : new PeerCtor(peerOptions);
  const connCbs = new Set();
  const errCbs = new Set();
  let opened = false;
  let destroyed = false;
  let resolveId; let rejectId;
  const id = new Promise((res, rej) => { resolveId = res; rejectId = rej; });
  id.catch(() => {}); // évite un rejet non géré si personne n'attend `id`
  peer.on('open', (pid) => { opened = true; resolveId(pid); });
  peer.on('connection', (conn) => {
    const t = wrapConnection(conn);
    for (const cb of [...connCbs]) cb(t, { clientId: conn.metadata?.clientId });
  });
  peer.on('disconnected', () => { if (!destroyed) peer.reconnect(); });
  peer.on('error', (e) => {
    const err = { code: e?.type ?? 'error', message: peerErrorMessage(e?.type) };
    if (!opened) rejectId(Object.assign(new Error(err.message), err));
    else for (const cb of [...errCbs]) cb(err);
  });
  return {
    id,
    onConnection(cb) { connCbs.add(cb); return () => connCbs.delete(cb); },
    onError(cb) { errCbs.add(cb); return () => errCbs.delete(cb); },
    close() { destroyed = true; peer.destroy(); },
  };
}

export function connectPeerGuest(hostId, { clientId, PeerCtor = globalThis.Peer, peerOptions } = {}) {
  let peer = null;
  let linked = false;
  let destroyed = false;
  const t = makeTransport(() => { destroyed = true; t.conn?.close({ flush: true }); peer?.destroy(); });
  if (!PeerCtor) {
    queueMicrotask(() => t.setStatus('closed', { code: 'peer-missing', message: MISSING }));
    return t;
  }
  peer = new PeerCtor(peerOptions);
  // 'open' est ré-émis après reconnect() : ne lier la DataConnection qu'une fois.
  peer.on('open', () => {
    if (linked || destroyed) return;
    linked = true;
    link(t, peer.connect(hostId, { reliable: true, metadata: { clientId } }));
  });
  peer.on('disconnected', () => { if (!destroyed && t.status !== 'closed') peer.reconnect(); });
  peer.on('error', (e) => t.setStatus('closed', { code: e?.type ?? 'error', message: peerErrorMessage(e?.type) }));
  return t;
}

// A19 (LU-14) : reprise de l'hôte — l'identifiant PeerJS peut rester pris un moment après un rechargement.
export const HOST_RETRY_DELAY_MS = 3000;
export const HOST_RETRY_MAX = 10;

/** Ouvre un hôte PeerJS avec `peerId` ; réessaie sur `unavailable-id` (1 essai + `HOST_RETRY_MAX` reprises). */
export async function openPeerHost({ peerId, PeerCtor, peerOptions, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), onRetry } = {}) {
  for (let retries = 0; ; retries++) {
    const host = createPeerHost({ peerId, PeerCtor, peerOptions });
    try {
      await host.id;
      return host;
    } catch (err) {
      host.close();
      if (err.code !== 'unavailable-id' || retries >= HOST_RETRY_MAX) throw err;
      onRetry?.(retries + 1);
      await sleep(HOST_RETRY_DELAY_MS);
    }
  }
}
