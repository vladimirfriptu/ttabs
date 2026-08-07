// The content script's half of the QA channel. Everything crossing it is
// plain JSON — the service worker does the actual fetching.

import { QA_MESSAGE } from './config.js';

const send = async (method, path, body) => {
  const reply = await chrome.runtime.sendMessage({ type: QA_MESSAGE, method, path, body });
  if (!reply) throw new Error('the extension did not answer');
  if (reply.error) throw new Error(reply.error);
  return reply;
};

// A server that is not running and a server saying "no session" mean the same
// thing to the panel, so both arrive here as null rather than as an error.
export const readState = async () => {
  const reply = await send('GET', '/api/qa/state').catch(() => null);
  if (!reply || !reply.ok) return null;
  return reply.data;
};

export const setPassed = async (id, passed) => {
  const reply = await send('POST', `/api/qa/case/${encodeURIComponent(id)}`, { passed });
  if (!reply.ok) throw new Error(`the server answered ${reply.status}`);
};

export const finish = async (note) => {
  const reply = await send('POST', '/api/qa/finish', { note });
  if (!reply.ok) throw new Error(`the server answered ${reply.status}`);
};
