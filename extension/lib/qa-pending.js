// Text on its way to the server, one pending send per case.
//
// Typing must not fire a request per keystroke, and the session must not end
// with a sentence still sitting in a timer — so the wait is cancellable from
// both ends: early for one case, or all at once.

export const createPendingSends = (send, delayMs) => {
  const queued = new Map();

  // A send that flush() itself did not start — e.g. one sendNow() fired from
  // a blur handler right before Done is clicked — must still be waited on,
  // or the finish request can race it to the server.
  const inflight = new Set();

  // The tail of the chain per case id, so a second send for the same case
  // queues behind the one already on the wire instead of racing it — a
  // slower first request could otherwise land after a faster second one and
  // leave the server holding stale text. Different ids never share a chain.
  const chains = new Map();

  const deliver = (id) => {
    const entry = queued.get(id);
    if (!entry) return Promise.resolve();

    clearTimeout(entry.timer);
    queued.delete(id);
    const prior = chains.get(id);
    const runThis = () => send(id, entry.text);
    const result = prior ? prior.then(runThis, runThis) : Promise.resolve(runThis());
    chains.set(id, result);
    inflight.add(result);
    const forget = () => {
      inflight.delete(result);
      if (chains.get(id) === result) chains.delete(id);
    };
    result.then(forget, forget);
    return result;
  };

  return {
    queue(id, text) {
      const entry = queued.get(id);
      if (entry) clearTimeout(entry.timer);
      queued.set(id, { text, timer: setTimeout(() => deliver(id), delayMs) });
    },

    sendNow: deliver,

    flush() {
      const started = [...queued.keys()].map(deliver);
      return Promise.all([...started, ...inflight]).then(() => undefined);
    },

    clear() {
      for (const entry of queued.values()) clearTimeout(entry.timer);
      queued.clear();
      // The session this send belonged to is over. A send already in flight
      // is left to run — nothing here can abort it — but nobody waits for it
      // any more, or a send that never settles would wedge a later flush().
      inflight.clear();
      chains.clear();
    },

    pending: () => [...queued.keys()],
  };
};
