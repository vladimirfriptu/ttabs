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

export const allows = (method, path) => {
  if (method === 'GET') return STATE_PATH.test(path);
  if (method === 'POST') return MUTATION_PATH.test(path);
  return false;
};

export const call = async ({ method = 'GET', path, body }) => {
  if (!allows(method, path)) throw new Error(`refusing to fetch an unrecognised path: ${path}`);

  const init = { method };
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }

  const response = await fetch(`${PHASE_BASE}${path}`, init);
  const result = { ok: response.ok, status: response.status, data: null };

  if (response.ok && response.status !== 204) {
    result.data = await response.json().catch(() => null);
  }

  return result;
};
