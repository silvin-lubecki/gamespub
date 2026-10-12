// Transport en mémoire (tests Node). Aucune hypothèse H1–H14 (règles) n'est utilisée ici.
import { parseMessage } from './protocol.js';

/** Paire de transports reliés, livraison asynchrone FIFO. `setOffline(bool)` simule une coupure silencieuse. */
export function createMemoryPair({ schedule = queueMicrotask, log = () => {} } = {}) {
  let offline = false;
  const queue = [];
  let pumping = false;
  const pump = () => {
    if (pumping) return;
    pumping = true;
    schedule(() => {
      pumping = false;
      while (queue.length) queue.shift()();
    });
  };
  const enqueue = (fn) => { queue.push(fn); pump(); };

  const makeEnd = () => {
    const msgCbs = new Set();
    const statusCbs = new Set();
    const end = {
      status: 'connecting',
      peer: null,
      send(obj) {
        if (end.status === 'closed' || offline) return;
        const raw = JSON.stringify(obj);
        const peer = end.peer;
        enqueue(() => {
          if (peer.status === 'closed' || offline) return;
          const msg = parseMessage(raw, { log });
          if (msg) for (const cb of [...peer.msgCbs]) cb(msg);
        });
      },
      onMessage(cb) { msgCbs.add(cb); return () => msgCbs.delete(cb); },
      onStatus(cb) { statusCbs.add(cb); return () => statusCbs.delete(cb); },
      close() {
        if (end.status === 'closed') return;
        enqueue(() => { end.setStatus('closed'); end.peer.setStatus('closed'); });
        // Un envoi ultérieur est ignoré ; les messages déjà en file restent livrés avant la fermeture.
        end.status = 'closed';
      },
      setOffline(v) { offline = Boolean(v); },
      msgCbs,
      setStatus(s) {
        if (end.status === s && s !== 'closed') return;
        const wasClosed = end.closedNotified;
        if (s === 'closed') end.closedNotified = true;
        end.status = s;
        if (s === 'closed' && wasClosed) return;
        for (const cb of [...statusCbs]) cb(s);
      },
      closedNotified: false,
    };
    return end;
  };
  const a = makeEnd();
  const b = makeEnd();
  a.peer = b;
  b.peer = a;
  enqueue(() => { if (a.status === 'connecting') a.setStatus('open'); if (b.status === 'connecting') b.setStatus('open'); });
  return [a, b];
}
