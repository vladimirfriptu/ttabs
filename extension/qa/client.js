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

export const call = async ({ method = 'GET', path, body }) => {
  if (!VALID_PATH.test(path)) throw new Error(`refusing to fetch an unrecognised path: ${path}`);

  const init = { method };
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }

  const response = await fetch(`${QA_BASE}${path}`, init);
  const result = { ok: response.ok, status: response.status, data: null };

  if (response.ok && response.status !== 204) {
    result.data = await response.json().catch(() => null);
  }

  return result;
};
