// The content script's half of the QA channel. Everything crossing it is
// plain JSON — the service worker does the actual fetching.

import { QA_MESSAGE } from './config.js';

const send = async (method, path, body) => {
  const reply = await chrome.runtime.sendMessage({ type: QA_MESSAGE, method, path, body });
  if (!reply) throw new Error('the extension did not answer');
  if (reply.error) throw new Error(reply.error);
  return reply;
};

// A definitive "no session" — the server itself answering not-ok, 404
// included — resolves null, same as the panel has always treated it. A
// transport failure (no reply, or the service worker's own { error }) is not
// that: it rejects, so a caller can tell a hiccup apart from a real close.
export const readState = async () => {
  const reply = await send('GET', '/api/qa/state');
  if (!reply.ok) return null;
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
