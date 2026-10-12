// Transport BroadcastChannel (dev, e2e ; DESIGN.md §9.1). Aucune hypothèse H1–H14 (règles) n'est utilisée ici.
// Enveloppe { from, to, payload } ; payload === null signifie « fermeture ». L'hôte a pour identifiant 'host'.
import { parseMessage } from './protocol.js';

const randomId = (random) => {
  let id = '';
  while (id.length < 8) id += random().toString(36).slice(2);
  return id.slice(0, 8);
};

function makeTransport(sendEnvelope, onClose) {
  const msgCbs = new Set();
  const statusCbs = new Set();
  const t = {
    status: 'connecting',
    send(obj) {
      if (t.status === 'closed') return;
      sendEnvelope(JSON.stringify(obj));
    },
    onMessage(cb) { msgCbs.add(cb); return () => msgCbs.delete(cb); },
    onStatus(cb) { statusCbs.add(cb); return () => statusCbs.delete(cb); },
    close() {
      if (t.status === 'closed') return;
      sendEnvelope(null);
      t.setStatus('closed');
      onClose();
    },
    setStatus(s) {
      if (t.status === s) return;
      t.status = s;
      for (const cb of [...statusCbs]) cb(s);
    },
    deliver(raw, log) {
      const msg = parseMessage(raw, { log });
      if (msg) for (const cb of [...msgCbs]) cb(msg);
    },
  };
  return t;
}

/** Hôte : un transport par invité (identifié par `from`). */
export function createLocalHost({
  room, BroadcastChannelCtor = globalThis.BroadcastChannel, random = Math.random, log = () => {},
} = {}) {
  const roomId = room ?? randomId(random);
  const channel = new BroadcastChannelCtor('letterup-' + roomId);
  const peers = new Map();
  const connCbs = new Set();
  channel.onmessage = (ev) => {
    const { from, to, payload } = ev.data ?? {};
    if (to !== 'host' || typeof from !== 'string') return;
    let t = peers.get(from);
    if (payload === null) { t?.setStatus('closed'); peers.delete(from); return; }
    if (!t) {
      t = makeTransport(
        (p) => channel.postMessage({ from: 'host', to: from, payload: p }),
        () => peers.delete(from),
      );
      peers.set(from, t);
      t.setStatus('open');
      for (const cb of [...connCbs]) cb(t);
    }
    t.deliver(payload, log);
  };
  return {
    room: roomId,
    onConnection(cb) { connCbs.add(cb); return () => connCbs.delete(cb); },
    close() {
      for (const t of peers.values()) t.close();
      peers.clear();
      channel.close();
    },
  };
}

/** Invité : nouveau `connId` à chaque connexion ; BroadcastChannel n'a pas de poignée de main (open asynchrone). */
export function connectLocalGuest(room, {
  BroadcastChannelCtor = globalThis.BroadcastChannel, random = Math.random, log = () => {},
} = {}) {
  const channel = new BroadcastChannelCtor('letterup-' + room);
  const connId = 'g' + randomId(random);
  const t = makeTransport(
    (p) => channel.postMessage({ from: connId, to: 'host', payload: p }),
    () => channel.close(),
  );
  channel.onmessage = (ev) => {
    const { to, payload } = ev.data ?? {};
    if (to !== connId) return;
    if (payload === null) { t.setStatus('closed'); channel.close(); return; }
    t.deliver(payload, log);
  };
  queueMicrotask(() => t.setStatus('open'));
  return t;
}
