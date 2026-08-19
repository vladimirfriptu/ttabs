// The service worker's half of the phase channel.
//
// A content script's fetch is bound by the page's CORS policy and host
// permissions no longer lift that in MV3, so every request to the phase server
// is made here instead and the result is handed back over runtime messaging.

import { PHASE_BASE } from './config.js';

// The two shapes the server contract allows, and nothing else. `path` arrives
// from a content script over runtime messaging — not attacker-reachable today
// (no `externally_connectable`), but a stray "@host/…" or "//host/…" would
// otherwise concatenate onto PHASE_BASE and redirect the fetch to a different
// origin, so it is checked here rather than trusted.
const STATE_PATH = /^\/api\/phase\/state\?task=[A-Z][A-Z0-9]*-\d+$/;
// `state` is the read endpoint's own name, not a phase — excluded so this stays
// the two shapes the contract has and not a third nobody serves.
const MUTATION_PATH = /^\/api\/phase\/(?!state$)[a-z][a-z0-9-]*$/;

// How long a request may sit unanswered before it is abandoned. A server that
// accepts the connection and then never replies is otherwise indistinguishable
// from a slow one, and the content script's in-flight flag would stay set for
// good: polls stop, and an optimistic tick freezes on screen with nothing to
// correct it. Three seconds is orders of magnitude more than a local journal
// read needs, and short enough to land inside the five-second poll interval
// rather than letting requests pile up behind one another.
const REQUEST_TIMEOUT_MS = 3000;

export const allows = (method, path) => {
  if (method === 'GET') return STATE_PATH.test(path);
  if (method === 'POST') return MUTATION_PATH.test(path);
  return false;
};

export const call = async ({ method = 'GET', path, body }) => {
  if (!allows(method, path)) throw new Error(`refusing to fetch an unrecognised path: ${path}`);

  const init = { method, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) };
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`${PHASE_BASE}${path}`, init);
  } catch (e) {
    // A timed-out request is a server that is not answering, which is the one
    // failure every caller already knows how to absorb — so it rejects like any
    // other transport failure, in words that name the wait rather than leaving a
    // DOMException's "signal is aborted without reason" to reach a console.
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
      throw new Error(`no answer within ${REQUEST_TIMEOUT_MS}ms`);
    }
    throw e;
  }

  const result = { ok: response.ok, status: response.status, data: null };

  if (response.ok && response.status !== 204) {
    result.data = await response.json().catch(() => null);
  }

  return result;
};
