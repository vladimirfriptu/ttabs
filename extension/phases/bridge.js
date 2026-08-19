// The content script's half of the phase channel. Everything crossing it is
// plain JSON — the service worker does the actual fetching.

import { PHASE_MESSAGE } from './config.js';
import { normalizeState } from '../lib/phases.js';

// An HTTP status that is neither 200 nor 404 means the server is up and
// refusing — a 409 (two branches carry the same task key) is a case its own
// contract names. It rejects like a transport failure, so it carries the status
// as well: the caller must not read "the server is here and says 409" as "there
// is no server", which is the difference between a notice and a minute of
// silence.
export class HttpStatusError extends Error {
  constructor(status) {
    super(`the server answered ${status}`);
    this.status = status;
  }
}

const send = async (method, path, body) => {
  const reply = await chrome.runtime.sendMessage({ type: PHASE_MESSAGE, method, path, body });
  if (!reply) throw new Error('the extension did not answer');
  if (reply.error) throw new Error(reply.error);
  return reply;
};

// A definitive "this server has nothing for that task" — 404 — resolves null,
// and the panel goes away. Anything else that is not a clean 200 rejects: a 409
// (two branches carry the code) or a 500 is a hiccup the caller must tell apart
// from a task that simply is not there, since only one of the two means "stop
// showing a panel".
export const readState = async (task) => {
  const reply = await send('GET', `/api/phase/state?task=${task}`);
  if (reply.status === 404) return null;
  if (!reply.ok) throw new HttpStatusError(reply.status);

  const state = normalizeState(reply.data);
  if (!state) throw new Error('the server answered something that is not a phase state');
  return state;
};

// The server answers a mutation with the whole new state, so a successful
// toggle needs no follow-up read — and the answer, not the optimistic guess,
// is what the panel ends up rendering.
export const mutate = async (phase, { task, action, detail }) => {
  const body = { task, action };
  if (detail) body.detail = detail;

  const reply = await send('POST', `/api/phase/${phase}`, body);
  if (!reply.ok) throw new HttpStatusError(reply.status);

  const state = normalizeState(reply.data);
  if (!state) throw new Error('the server accepted the change but did not answer with a state');
  return state;
};
