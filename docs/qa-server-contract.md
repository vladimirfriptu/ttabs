# Local QA server contract

The extension's checklist panel is an HTTP client of a server this repository
does not ship: it shows the cases of a running manual-test session, served from
the loopback interface of the developer's own machine. That server is not part of
this repository and is not discovered — the address below is a convention,
written down here and hardcoded in the extension.

This document is what a server has to satisfy for the panel to work. It is
derived from the extension's code, so everything in it is observable from the
outside; nothing here says how a server should store, compute or fold anything,
because the widget cannot see that and would be inventing a requirement.

Placeholder shapes used throughout: `ACME-1234` for a task key, `you` for an
author, `https://git.example.com/...` for an external link.


## Every request

### Address

| Panel | Base URL | Written at |
| --- | --- | --- |
| QA checklist | `http://127.0.0.1:47823` | `extension/qa/config.js` |

The IPv4 literal is deliberate, and a server author should treat it as part of
the contract: a stock `/etc/hosts` maps `localhost` to both `127.0.0.1` and
`::1`, and a server bound to IPv4 only refuses the connection whenever the
browser tries the IPv6 answer first. **Bind `127.0.0.1`.** Binding `::1` only,
or binding a name and hoping, produces a widget that is invisible on some
machines and fine on others.

### No CORS

Every request is made from the extension's MV3 service worker, never from the
content script running on the page. A content script's `fetch` is bound by the
page's CORS policy and host permissions no longer lift that, so the widget hands
each request to the service worker over runtime messaging and get a plain JSON
result back. The consequence for a server: **no CORS header is read by
anything.** `Access-Control-Allow-Origin` is neither required nor consulted, and
no preflight is sent: the extension declares `http://127.0.0.1/*` in its
`host_permissions` (`extension/manifest.json`), which lifts CORS for these
fetches entirely — including the writes, whose `content-type: application/json`
would otherwise be enough to require one. Do not spend effort on CORS, and do not rely on an `Origin` check for authorisation: there is
no meaningful origin to check.

### Request deadline

Every request has a **3000 ms** deadline (`AbortSignal.timeout`). A server that
accepts the connection and then stalls is treated exactly like one that is not
there — the request rejects with `no answer within 3000ms`. A checklist read has three orders of magnitude more time than it needs; the
deadline exists so a stalled request cannot leave the widget's in-flight flag set
for good. **A server must not hold a request open** waiting for something
(a lock, a git operation, a subprocess). Answer, then do the slow thing.

### Transport failure and HTTP error status are different things

This distinction runs through the whole widget, and it is the single most useful
thing for a server author to know.

- A **transport failure** — connection refused, socket closed, the deadline
  above, a body that cannot be read or parsed — means the widget learned
  nothing. It keeps quiet and retries. It never concludes "there is no session"
  from it.
- An **HTTP status** is an answer. `404` is a definitive "I have nothing for
  that", and the widget acts on it: the panel says there is no session. Any
  other error status (`409`, `500`) means the server is up and refusing, which
  is a third thing again — the panel stays on screen and shows the code.

So: **never fail a request at the transport level to mean "nothing here".**
Answer `404`. Conversely, never answer `200` with an empty or half-written body
to mean the same; a body that does not parse is a transport failure, not a
"no".

### Allow-listed paths

The service worker refuses to fetch a path that does not match one of the shapes
below, before any request goes out. This is a guard on data crossing from a
content script, but it has a consequence a server author must respect: **route
names outside these shapes are unreachable**, no matter what a server serves
there.

| Method | Allowed shape |
| --- | --- |
| `GET`/`POST` | `/api/qa/state`, `/api/qa/finish`, `/api/qa/case/<id>` |

## The routes

This server owns one session at a time. There is no task parameter anywhere in
its API: the widget asks what session is running and compares its `task` to the
key of the tab's own group, showing the checklist only when the two match.

### `GET /api/qa/state`

```http
200 OK
Content-Type: application/json
```

```json
{
  "task": "ACME-1234",
  "cases": [
    {
      "id": "c-01",
      "title": "Empty state on a fresh account",
      "area": "onboarding",
      "status": "new",
      "steps": ["Sign up", "Open the dashboard"],
      "expectedResult": "The empty state is shown, with the import button",
      "passed": true,
      "comment": "also checked on a narrow window"
    },
    {
      "id": "c-02",
      "title": "Import from a file with one row",
      "area": "onboarding",
      "status": "unchanged",
      "steps": ["Upload one-row.csv"],
      "expectedResult": "One row imported, no warning",
      "passed": false,
      "comment": ""
    }
  ],
  "discrepancies": [
    {
      "id": "d-01",
      "summary": "The spec asks for a toast; the code shows an inline notice",
      "source": "requirements §4.2",
      "implemented": "inline notice under the field"
    }
  ]
}
```

No session running:

```http
404 Not Found
```

### `POST /api/qa/case/<id>`

Two writes share this route, and **each request carries exactly one field**:

```http
POST /api/qa/case/c-02
Content-Type: application/json
```

```json
{ "passed": true }
```

```json
{ "comment": "fails on Safari only" }
```

The `<id>` in the path is the case's `id`, percent-encoded. A comment is
debounced by **1000 ms** while typing and sent immediately when the field is
committed (blur or the panel's finish); consecutive comments for the same case
are serialised, so a slow first request cannot land after a faster second and
leave stale text.

Any 2xx is a success and **the response body is not read** — `204` is the
natural answer, and `200` with a body works identically. A non-2xx puts
`not saved: the server answered <code>` under that case, and the optimistic flip
of the checkbox is reverted.

### `POST /api/qa/finish`

```http
POST /api/qa/finish
Content-Type: application/json
```

```json
{ "note": "" }
```

The widget always sends an empty `note`; the field is there and always present.
Any 2xx is a success, and the body is not read. On success the panel shows a
"session ended" notice for two seconds and then goes back to waiting for a
session.

Whatever else finishing a session means — recording it somewhere, closing a task
step — is the server's own business. The widget sends this one request and
nothing else.

A failed finish leaves the screen up and the message `could not finish: …` at
its foot, on the assumption that whatever is waiting on the other end is still
waiting.

### The session object

| Field | Required | Type | What the widget does with it |
| --- | --- | --- | --- |
| `task` | yes | string | Compared to the tab's group key. A mismatch is a screen that says so, not an error. |
| `cases` | yes | array | The checklist. Cases are grouped by `area`, each group appearing where its first case appears in this array, and in this array's order within the group. |
| `discrepancies` | no | array | Rendered read-only under the cases. Absent or not an array means none. |

A body missing `task` or whose `cases` is not an array is treated **exactly like
a `404`** — "no session" — so a server must not answer `200 {}` while starting
up. Answer `404` until a session really exists.

### A case

| Field | Required | Type | What the widget does with it |
| --- | --- | --- | --- |
| `id` | yes | string | Identity. A case without a string `id` **or** a string `title` is dropped from the list. The id must be stable between reads: the panel keys the fold state, the focused field and the text being typed on it, and an id that changes loses them. |
| `title` | yes | string | The row's label, and the fold control. |
| `steps` | no | array of strings | Numbered under the title. Non-string members are dropped; a non-array becomes none. |
| `expectedResult` | no | string | Shown as `→ …` under the steps. |
| `area` | no | string | Groups the cases under a caption. Empty, whitespace or absent groups the case under `other`. |
| `status` | no | `new` \| `updated` \| `unchanged` \| `outdated` | `new` and `updated` get a badge; `outdated` is struck through rather than hidden. Anything unrecognised degrades to `unchanged`. |
| `passed` | no | boolean | The checkbox. **Only literal `true` counts** — `"true"`, `1` and absent are all "not passed". Feeds the `n not passed` count on the finish button and the confirmation before finishing. |
| `comment` | no | string | The text of the per-case note. The server is expected to reflect a comment it accepted in the next state it serves; while the developer is typing, the local draft wins. |

### A discrepancy

`id` must be a string or the entry is dropped. `summary`, `source` and
`implemented` are optional strings, each shown only when non-empty.

### Status codes

| Answer | What the checklist does |
| --- | --- |
| `200` + a session for this tab's task | Renders it. |
| `200` + a session for another task | Nothing: the panel goes away, so one task's checklist never appears over another task's app. |
| `200` + a body that is not a session (`{}`, `null`, a missing `cases`) | Same as `404`. |
| `200` + a body that cannot be read or parsed, or was truncated | A transport failure — see the row below. The widget does **not** conclude that no session exists. |
| `404` | No session. The panel closes. |
| Any other status (`500`, …) | A transport failure, as far as the widget is concerned: not definitive, so no screen claims there is no session. |
| Connection refused, no answer within 3000 ms | Same. |
| Non-2xx on a write | `not saved: the server answered <code>` on the case, or `could not finish: …` at the foot. |

The reason a transport failure is kept apart so carefully here: taking one for a
definitive "no session" would close a panel — and with it discard a note being
typed into it — on the strength of a server that never answered.

### Cadence, and what absence looks like

- The panel polls every **5000 ms** while idle (no session yet) and every
  **15000 ms** as a keep-alive once it is up. The slow one exists so a
  visible-but-unfocused tab still notices a session ending. A hidden tab keeps no
  timer at all.
- An open panel tolerates **30000 ms** (wall clock, not a poll count) of nothing
  but failed polls before it treats the server as gone rather than restarting.
  That window exists so a restart does not wipe a note being typed into it, and
  it is why a server may be restarted mid-session without the developer losing
  work.
- With nothing listening, no panel appears, and the only output is one
  `console.debug` line per outage under `[task-tabs]`.

## A checklist for a new server

- Bind `127.0.0.1`, on `47823`.
- Answer within 3 s, always. Never hold a request.
- Answer `404`, not a dropped connection, to say "no session here".
- Never answer `200` with a body that is not the documented object.
- Name the session's task, so a tab in another task's group shows nothing.
- Give a case a stable `id`, and reflect an accepted `comment` in the next read.
- Ignore CORS entirely.
