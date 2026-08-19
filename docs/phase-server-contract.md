# Local server contract

Two of the extension's panels are HTTP clients of servers this repository does
not ship: the **phase panel**, which shows a task's pipeline journal, and the
**QA checklist panel**, which shows the cases of a running manual-test session.
Both listen on the loopback interface of the developer's own machine. Neither is
part of this repository, and neither is discovered — the addresses below are a
convention, written down here and hardcoded in the extension.

This document is what a server has to satisfy for those panels to work. It is
derived from the extension's code, so everything in it is observable from the
outside; nothing here says how a server should store, compute or fold anything,
because the widget cannot see that and would be inventing a requirement.

Placeholder shapes used throughout: `ACME-1234` for a task key, `you` for an
author, `https://git.example.com/...` for an external link.

## Both channels

### Address

| Panel | Base URL | Written at |
| --- | --- | --- |
| Phase panel | `http://127.0.0.1:47824` | `extension/phases/config.js` |
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
page's CORS policy and host permissions no longer lift that, so the widgets hand
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
there — the request rejects with `no answer within 3000ms`. A local journal or
checklist read has three orders of magnitude more time than it needs; the
deadline exists so a stalled request cannot leave a widget's in-flight flag set
for good. **A server must not hold a request open** waiting for something
(a lock, a git operation, a subprocess). Answer, then do the slow thing.

### Transport failure and HTTP error status are different things

This distinction runs through both widgets, and it is the single most useful
thing for a server author to know.

- A **transport failure** — connection refused, socket closed, the deadline
  above, a body that cannot be read or parsed — means the widget learned
  nothing. It keeps quiet and retries. It never concludes "there is no journal"
  or "there is no session" from it.
- An **HTTP status** is an answer. `404` is a definitive "I have nothing for
  that", and the widget acts on it: the phase panel goes away, the QA screen
  says there is no session. Any other error status (`409`, `500`) means the
  server is up and refusing, which is a third thing again — the phase panel
  stays on screen and shows the code.

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

| Channel | Method | Allowed shape |
| --- | --- | --- |
| Phase | `GET` | `/api/phase/state?task=` + `[A-Z][A-Z0-9]*-\d+` |
| Phase | `POST` | `/api/phase/<name>`, `<name>` matching `[a-z][a-z0-9-]*` and not `state` |
| QA | `GET`/`POST` | `/api/qa/state`, `/api/qa/finish`, `/api/qa/case/<id>` |

## The phase server — `127.0.0.1:47824`

### `GET /api/phase/state?task=ACME-1234`

The only read. No body, no custom headers. The task key comes from the title of
the Chrome tab group the tab sits in, and is only ever sent when it matches
`^[A-Z][A-Z0-9]*-\d+$` — the project prefix is not hardcoded anywhere, so a
server will be asked about keys of any project the developer has open.

A journal exists:

```http
200 OK
Content-Type: application/json
```

```json
{
  "task": "ACME-1234",
  "branch": "feature/ACME-1234-empty-state",
  "round": 2,
  "next": "review",
  "phases": [
    { "phase": "spec",     "stage": "design",  "state": "done", "by": "you", "ts": "2026-08-18 11:02" },
    { "phase": "plan",     "stage": "design",  "state": "skip", "by": "you", "ts": "2026-08-18 11:40", "detail": "one-line change" },
    { "phase": "build",    "stage": "code",    "state": "done", "by": "you", "ts": "2026-08-18 15:12",
      "action": { "kind": "link", "label": "MR !412", "url": "https://git.example.com/acme/web/-/merge_requests/412" } },
    { "phase": "manual-test", "stage": "code", "state": "open", "by": "you", "ts": "2026-08-19 09:30",
      "detail": "two cases still failing", "action": { "kind": "qa" } },
    { "phase": "review",   "stage": "release" }
  ]
}
```

No journal for that key:

```http
404 Not Found
```

The body of a `404` is never read.

### `POST /api/phase/<phase>`

The only write. `<phase>` is the name of a phase as the server itself spelled it
in the `phases` array.

```http
POST /api/phase/manual-test
Content-Type: application/json
```

```json
{ "task": "ACME-1234", "action": "done" }
```

- `action` is one of `done`, `skip`, `clear`. `done` is a plain click on a
  phase's box, `skip` is alt-click, and `clear` is a click on a box that already
  carries a record — it clears **that one phase only** and nothing after it.
- `detail` is an optional third field the channel will forward if it is
  non-empty. No path in the widget populates it today; a server may accept it
  and must not require it.
- No other action value is ever sent.

The answer is the **whole new state**, in exactly the shape of the read above:

```http
200 OK
```

```json
{ "task": "ACME-1234", "round": 2, "next": "review", "phases": [ … ] }
```

The widget draws the click optimistically and then replaces that guess
**wholesale** with this answer — never merging the two — so the answer is where
the server's own rules become visible (a downgrade, a de-duplication, a
recomputed `next`). Because of that, **the widget performs no follow-up read
after a successful mutation**, and a server that answers `204`, `200 {"ok":
true}`, or anything else that is not a state has its write rejected on screen as
`not saved: the server accepted the change but did not answer with a state`.

The phase names a server publishes must match `[a-z][a-z0-9-]*` and must not be
`state`. A phase named otherwise renders fine but is unclickable: the service
worker refuses to send the `POST`, and the row shows `not saved: refusing to
fetch an unrecognised path: …`.

### The state object

| Field | Required | Type | What the widget does with it |
| --- | --- | --- | --- |
| `task` | yes | string | Must equal the key that was asked about. If it does not, the panel hides itself rather than paint another task's phases over this page. Shown in the header, linked into the tracker when a Jira site is configured. |
| `phases` | yes | array | The list, in the server's order. See below. |
| `round` | no | integer > 0 | Drawn as a `round N` badge. `1`, absent, `0`, negative, or a non-integer all render as no badge. |
| `next` | no | string | Printed under the list as `next: <value>`. |
| `branch` | no | string | Accepted and carried, rendered nowhere today. |

A body missing `task` (or with a non-string one), or whose `phases` is not an
array, is **not** a state: the read is rejected like a transport failure — the
panel closes quietly and the server is left alone for a minute. Unknown
top-level fields are ignored, silently and for good; adding one is safe.

### A phase entry

| Field | Required | Type | What the widget does with it |
| --- | --- | --- | --- |
| `phase` | yes | non-empty string | The row's name, and the mutation route. An entry without it is **dropped from the list** — not rendered as an error. |
| `state` | no | `done` \| `skip` \| `open` | Anything else, including absent, `null`, or a state a future server invents, degrades to "not recorded": an empty box, and the row counts as not closed. |
| `stage` | no | string | Groups the rows (see the invariants). Absent or empty means "no caption". |
| `detail` | no | string | Shown only on an `open` phase (prominently — it is the reason the phase is not done) and on a `skip` phase (muted). Carried but not shown on the others. |
| `by`, `ts` | no | strings | Joined with ` · ` into the row's tooltip. `ts` is never parsed — it is printed exactly as given, so its format is the server's choice. |
| `action` | no | object | A chip on the row. Two kinds, below. |

Unknown fields on an entry are ignored.

`action` comes in two kinds and nothing else — an `action` that is not an object,
or whose `kind` is neither of these, is dropped and the row simply has no chip:

- `{ "kind": "link", "label": "MR !412", "url": "https://…" }` — an anchor
  opening in a new tab. Both fields are required: an empty or non-string `label`
  drops the chip, and so does a `url` that is not parseable or whose scheme is
  not `http:` or `https:`. This is a security rule, not a cosmetic one — the
  href is the one thing the widget hands to the page it is injected into, and a
  `javascript:` or `data:` url there would run on the app under test. A chip is
  better absent than lying, so the drop is silent.
- `{ "kind": "qa" }` — a `test` chip that opens the QA checklist inside the phase
  panel. No other fields are read. Put it on **at most one phase**: the widget
  takes the first one it finds, and it learns the name of the QA phase from
  nowhere else. Moving it to another phase, or dropping it, while the checklist
  screen is open closes that screen and returns the developer to the list.

### Status codes

| Answer | What the phase panel does |
| --- | --- |
| `200` + a valid state for the task asked about | Renders it. Next read in 5 s. |
| `200` + a body that is not a state, unparseable, or truncated | Treated as a transport failure: panel closed, silence, retry in 60 s. |
| `200` + a state whose `task` is a different key | Panel hidden. Next read in 5 s. |
| `404` | Definitive "no journal": panel closed. Next read in 5 s — a journal that appears later is picked up promptly. |
| Any other status (`409`, `500`, …) | The server is up and refusing. A panel already on screen **stays** and shows `the phase server answered 409` at its foot; reads continue every 5 s, and the message goes away with the next good answer. |
| Connection refused, no answer within 3000 ms | Panel closed, silence, retry in 60 s. |
| Non-`200` answer to a `POST` | `not saved: the server answered <code>` on that row; the optimistic tick is reverted. |

A read must answer `200` with a body. A `204` on the read path counts as "not a
state" and lands in the second row of that table.

### Invariants a server must hold

1. **The order of `phases` is canonical.** The widget renders it as given and
   never sorts, reorders or reverses it.
2. **The length is never assumed.** Any number of phases is valid, zero
   included; a journal may grow or shrink between two reads. Nothing in the
   widget is indexed by position.
3. **Phases sharing a `stage` must be contiguous.** Grouping happens on a
   *change* of stage, not by collecting equal ones, so `a a b a` renders as three
   groups. That is deliberate: repairing it would put a second opinion about the
   canonical order in the widget.
4. **An unrecognised `state` degrades to "not recorded".** A server may add a
   fourth state; older extensions will show it as an empty box rather than as an
   unstyled fourth thing.
5. **A `url` whose scheme is not `http:` or `https:` is dropped, not rendered.**
6. **`next` is the server's opinion, and the only one there is.** When a journal
   has records, names no `next`, and still has an unclosed phase, the widget
   prints nothing at all rather than guessing which phase comes next.
7. **A mutation's answer is the state.** No follow-up read happens, so anything
   the server changed beyond the requested field has to be in that answer or the
   panel will not know about it for up to 5 s.
8. **The task key is echoed.** Answering for a different task is treated as a
   mistake and hides the panel.

### Cadence, and what absence looks like

- A read every **5000 ms** while the tab is visible. A hidden tab keeps **no
  timer at all**; becoming visible reads immediately.
- After a transport failure the server is left alone for **60000 ms**. This is a
  tolerance of indefinite absence, not a retry storm: the panel assumes most
  `localhost` tabs have no phase server behind them, and that a server which
  died with a reboot is not coming back on its own.
- With nothing listening, the panel **renders nothing** — no placeholder, no
  error box, no toast — and says nothing at the default console level. Every
  explanation goes to `console.debug` under the `[task-tabs]` prefix, visible
  only with the page console's level filter set to Verbose, and each reason is
  printed once rather than once per poll.

## The QA server — `127.0.0.1:47823`

This server owns one session at a time. There is no task parameter anywhere in
its API: the widget asks what session is running and compares its `task` to the
key of the tab's own group, showing the checklist only when the two match. Two
readers exist in each `localhost` tab — the standalone QA panel, and the phase
panel's drilled-in checklist screen — and they issue the same requests.

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
Any 2xx is a success, and the body is not read. On success the standalone panel
shows a "session ended" notice for two seconds and then goes back to waiting for
a session; the phase panel's checklist screen returns to the phase list and
re-reads the journal.

**The server closes the QA phase itself.** After a successful finish the widget
sends no phase mutation at all, deliberately: two writes to two servers behind
one click is a half-done state nobody can reconcile. If the QA server does not
record that phase on its way out, nothing does — the row will simply stay open.
The one exception is the screen shown when there is **no** session: there,
"close the phase without a checklist" posts an ordinary `done` mutation to the
phase server, because finishing a session that does not exist cannot be what
closes the phase.

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
| `200` + a session for another task | The definitive "not for you" screen: no checklist, and the offer to close the phase by hand. |
| `200` + a body that is not a session (`{}`, `null`, a missing `cases`) | Same as `404`. |
| `200` + a body that cannot be read or parsed, or was truncated | A transport failure — see the row below. The widget does **not** conclude that no session exists. |
| `404` | No session. The standalone panel closes; the phase panel's screen offers to close the phase without a checklist. |
| Any other status (`500`, …) | A transport failure, as far as the widget is concerned: not definitive, so no screen claims there is no session. |
| Connection refused, no answer within 3000 ms | Same. |
| Non-2xx on a write | `not saved: the server answered <code>` on the case, or `could not finish: …` at the foot. |

The reason a transport failure is kept apart so carefully here: the no-session
screen offers a **write** (closing the phase by hand), and offering it on the
strength of a server that never answered would be the widget claiming knowledge
it does not have.

### Cadence, and what absence looks like

- Standalone QA panel: **5000 ms** while idle (no session yet), **15000 ms** as
  a keep-alive once a panel is up. The slow one exists so a visible-but-unfocused
  tab still notices a session ending.
- The phase panel's checklist screen: **15000 ms**, and only while that screen is
  open — a closed screen keeps no timer, so it never adds a second poll to every
  `localhost` tab. A hidden tab keeps no timer either.
- An open panel tolerates **30000 ms** (wall clock, not a poll count) of nothing
  but failed polls before it treats the server as gone rather than restarting.
  That window exists so a restart does not wipe a note being typed into it, and
  it is why a server may be restarted mid-session without the developer losing
  work.
- With nothing listening, no panel appears, and the only output is one
  `console.debug` line per outage under `[task-tabs]`.

## A checklist for a new server

- Bind `127.0.0.1`, on `47824` (phases) or `47823` (QA).
- Answer within 3 s, always. Never hold a request.
- Answer `404`, not a dropped connection, to say "nothing here".
- Never answer `200` with a body that is not the documented object.
- Phase names: lowercase, digits and hyphens; never `state`.
- Echo the task key in a phase state.
- Answer a phase mutation with the whole new state.
- Keep phases of one stage contiguous, and treat your order as the order.
- Give a case a stable `id`, and reflect an accepted `comment` in the next read.
- Close the QA phase yourself when a session finishes; nothing else will.
- Ignore CORS entirely.
