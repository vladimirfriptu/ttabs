// The content script's half of the QA channel. Everything crossing it is
// plain JSON — the service worker does the actual fetching.

import { QA_MESSAGE } from './config.js';
export { readTaskKey } from '../lib/task-key.js';

const send = async (method, path, body) => {
  const reply = await chrome.runtime.sendMessage({ type: QA_MESSAGE, method, path, body });
  if (!reply) throw new Error('the extension did not answer');
  if (reply.error) throw new Error(reply.error);
  return reply;
};

// A definitive "no session" — 404, specifically — resolves null, same as the
// panel has always treated it. Anything else that isn't a clean 200 (no
// reply, the service worker's own { error }, or a non-404 error status such
// as a transient 500) is not that definitive: it rejects, so a caller can
// tell a real close apart from a hiccup that deserves another try.
export const readState = async () => {
  const reply = await send('GET', '/api/qa/state');
  if (reply.status === 404) return null;
  if (!reply.ok) throw new Error(`the server answered ${reply.status}`);
  return reply.data;
};

export const setPassed = async (id, passed) => {
  const reply = await send('POST', `/api/qa/case/${encodeURIComponent(id)}`, { passed });
  if (!reply.ok) throw new Error(`the server answered ${reply.status}`);
};

export const setComment = async (id, comment) => {
  const reply = await send('POST', `/api/qa/case/${encodeURIComponent(id)}`, { comment });
  if (!reply.ok) throw new Error(`the server answered ${reply.status}`);
};

export const finish = async (note) => {
  const reply = await send('POST', '/api/qa/finish', { note });
  if (!reply.ok) throw new Error(`the server answered ${reply.status}`);
};
