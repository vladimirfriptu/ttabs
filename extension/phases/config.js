// The one place the phase server's address is written down. It is a convention
// shared with the tool that serves the journal — there is no discovery
// mechanism, so changing the port means changing it here and there together.
// 47824 sits next to the QA server's 47823 on purpose.

export const PHASE_PORT = 47824;

// The IPv4 literal, not "localhost", on purpose: a stock /etc/hosts maps that
// name to both 127.0.0.1 and ::1, and a server listening on IPv4 only refuses
// the connection when the browser picks the IPv6 answer first.
export const PHASE_BASE = `http://127.0.0.1:${PHASE_PORT}`;

// The message type the content script uses to borrow the service worker's
// network access.
export const PHASE_MESSAGE = 'phase-request';

// How often to re-read the journal while the tab is visible. A hidden tab has
// no timer at all, so this is also the longest a tab can show stale phases
// after coming back into view.
export const POLL_MS = 5000;

// How long the widget leaves the server alone after failing to reach it. Most
// sessions never start the phase server, so this is the steady state for the
// majority of localhost tabs: one refused connection a minute, no console
// output, no panel.
export const DEAD_RETRY_MS = 60000;

// A tab-group title carries a tracker key, not necessarily one this server
// knows. Anything of that shape is passed through — the project prefix is
// deliberately not hardcoded, because the extension is not HRS-specific — and a
// key with no journal simply answers 404. The pattern exists to keep junk out
// of the query string, not to filter by project.
export const TASK_KEY_PATTERN = /^[A-Z][A-Z0-9]*-\d+$/;
