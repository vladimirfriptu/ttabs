// The service worker's half of the QA channel.
//
// A content script's fetch is bound by the page's CORS policy and host
// permissions no longer lift that in MV3, so every request to the QA server is
// made here instead and the result is handed back over runtime messaging.

import { QA_BASE } from './config.js';

// The three shapes the server contract allows, and nothing else. `path`
// arrives from a content script over runtime messaging — not attacker-
// reachable today (no `externally_connectable`), but a stray "@host/…" would
// otherwise concatenate onto QA_BASE and redirect the fetch to a different
// origin, so it is checked here rather than trusted.
const VALID_PATH = /^\/api\/qa\/(state|finish|case\/[^/]+)$/;

// The same three seconds the phase channel uses, for the same reason: a request
// that is never answered must fail rather than leave the panel's in-flight flag
// set for good. It is far more than a local checklist read takes, and well
// inside both this server's poll cadences.
const REQUEST_TIMEOUT_MS = 3000;

export const call = async ({ method = 'GET', path, body }) => {
  if (!VALID_PATH.test(path)) throw new Error(`refusing to fetch an unrecognised path: ${path}`);

  const init = { method, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) };
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`${QA_BASE}${path}`, init);
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
