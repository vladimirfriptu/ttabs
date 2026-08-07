// Text on its way to the server, one pending send per case.
//
// Typing must not fire a request per keystroke, and the session must not end
// with a sentence still sitting in a timer — so the wait is cancellable from
// both ends: early for one case, or all at once.

export const createPendingSends = (send, delayMs) => {
  const queued = new Map();

  const deliver = (id) => {
    const entry = queued.get(id);
    if (!entry) return Promise.resolve();

    clearTimeout(entry.timer);
    queued.delete(id);
    return Promise.resolve(send(id, entry.text));
  };

  return {
    queue(id, text) {
      const entry = queued.get(id);
      if (entry) clearTimeout(entry.timer);
      queued.set(id, { text, timer: setTimeout(() => deliver(id), delayMs) });
    },

    sendNow: deliver,

    flush() {
      return Promise.all([...queued.keys()].map(deliver)).then(() => undefined);
    },

    clear() {
      for (const entry of queued.values()) clearTimeout(entry.timer);
      queued.clear();
    },

    pending: () => [...queued.keys()],
  };
};
