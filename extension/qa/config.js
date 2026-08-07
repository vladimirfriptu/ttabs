// The one place the QA server's address is written down. It is a convention
// shared with whatever tool serves the checklist — there is no discovery
// mechanism, so changing the port means changing it here and there together.

export const QA_PORT = 47823;
export const QA_BASE = `http://localhost:${QA_PORT}`;

// The message type the content script uses to borrow the service worker's
// network access.
export const QA_MESSAGE = 'qa-request';

// How often to ask whether a session has started. Only ticks while no session
// is open — once the panel is up, refreshes are driven by what the user does.
export const IDLE_POLL_MS = 5000;
