# Phase widget in ttabs — design

Status: approved in conversation 2026-08-18. Authored for the agent that will
own the widget half — this spec commits the server side; the widget's own
architecture, layout and design decisions belong to that agent.

## Problem

Stage 1 shipped a phase journal per task (`.claude/state/tasks/<TASK>.log`) and
two surfaces to see it: `/board` (all in-flight tasks in a terminal table) and
the statusline (one line per branch, session-local). The owner used it on a real
task and reported: **not enough**.

Two reasons stated:

1. The pipeline is standard but the real path through it isn't — it isn't
   always sequential, some phases don't apply, others come back around.
2. There is no way to check or uncheck a phase quickly, by hand, when the
   automatic mechanism didn't capture it. A CLI mutation exists (`task-phase.mjs
   done|skip|reset`) but a shell command is not the surface for "I just ran
   through a manual test — mark it".

Both are checklist-shaped needs, and ttabs already ships a per-task browser
widget on `localhost` for QA cases. That widget is the natural home: it appears
only inside the task's Chrome group, so parallel tasks don't collide, and the
owner already looks at it during manual testing (`qa-manual`) — the one phase
whose completion has no artifact at all.

## Non-goals

- **No new phase model.** The fourteen canonical phases and four states from
  `.claude/specs/2026-08-17-task-phase-tracking-design.md` are unchanged. The
  widget renders that model; it does not extend it.
- **No sequencing.** The owner explicitly stated the flow "может сильно
  отличаться и не всегда последовательное". Phases are toggleable in any order.
- **No history editing.** `reset` cascades — that stays in the CLI. Direct
  edits of past rounds' records are out of scope; the widget only mutates the
  current round.
- **No Jira/GitLab data.** The widget reads local phase state only, exactly
  like `/board`.
- **No cross-task view in v1.** One widget instance = one task, scoped by the
  Chrome tab group carrying the HRS code. A global board page can come later.
- **No cache invalidation service worker.** Polling is fine (see below).
- **The widget's UI and internal architecture are the widget agent's call.**
  This spec fixes the wire protocol and behavioural contract, nothing else.

## Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│  ttabs extension (per-tab content script)                         │
│    widget: reads GET /api/phase/state, POSTs mutations,           │
│    scoped to the tab's Chrome group HRS code                      │
└───────────────────────────────────────────────────────────────────┘
                    ↓ HTTP (localhost:47824)
┌───────────────────────────────────────────────────────────────────┐
│  .claude/scripts/phase-server.mjs                                 │
│    reads/writes .claude/state/tasks/<TASK>.log                    │
│    delegates every fold to lib/task-phases.mjs                    │
│    the ONE writer that a browser talks to                         │
└───────────────────────────────────────────────────────────────────┘
                    ↑ writes                     ↑ writes
┌────────────────────┴────────────┐   ┌──────────┴──────────────────┐
│  task-phase.mjs (skills, hooks) │   │  the journal on disk         │
└─────────────────────────────────┘   └──────────────────────────────┘
```

The journal remains the single source of truth. The widget is a client of a
server that fronts the journal; the CLI is another client. No widget-side fold
implementation — the same `lib/task-phases.mjs` runs in both.

### Why a server, not File System Access API

Considered, rejected:

- **Two fold implementations drift.** Every rule in fold — the reset cascade,
  the stale-checks downgrade, `isDuplicate` — would need a JS copy in the
  extension. When rule N+1 lands, one copy will lag, and the widget will show
  something the CLI disagrees with. This is the defect the whole design was
  built to prevent.
- **File System Access asks for permission on every tab.** ttabs opens one tab
  per URL in a task group; a permission prompt per tab is unusable.
- **Concurrent writers race.** The CLI appends from N sessions; a browser adding
  a third writer without a lock loses records. The server is the lock.

## Server contract — what I commit to

New file: `.claude/scripts/phase-server.mjs`, delivered as part of this work.

**Port.** `47824`, adjacent to the existing QA server on `47823`. Bind to
`127.0.0.1` only. Not started automatically — see lifecycle below.

**Authentication.** None. It is localhost-only, holds no secrets, and this is
consistent with `qa-test-server.mjs`. Any client on the machine can call it.

**CORS.** `Access-Control-Allow-Origin: chrome-extension://<ttabs-id>` on every
response, mirroring the QA server's approach. `chrome-extension://*` if that
proves too specific — decide when integrating; the widget agent should not
assume either.

**Base path.** `/api/phase`.

### `GET /api/phase/state?task=HRS-1234`

Returns the widget's whole render input for one task. Always includes the phase
list (so the widget renders even for a task with an empty journal). The `open`
column of `/board` maps to `state:"open"` here.

```json
{
  "task": "HRS-1234",
  "branch": "front/HRS-1234-something",
  "round": 2,
  "next": "crit",
  "phases": [
    { "phase": "start",       "state": "done",  "by": "starting-a-task",  "ts": "2026-08-18T09:00:00Z", "detail": "" },
    { "phase": "spec",        "state": "done",  "by": "Write",            "ts": "2026-08-18T09:10:00Z", "detail": "path=…" },
    { "phase": "plan",        "state": "",      "by": "",                 "ts": "",                     "detail": "" },
    { "phase": "dev",         "state": "done",  "by": "user",             "ts": "2026-08-18T11:00:00Z", "detail": "" },
    { "phase": "checks",      "state": "open",  "by": "checks.sh",        "ts": "2026-08-18T11:20:00Z", "detail": "reason=stale head=abc123" },
    { "phase": "code-review", "state": "open",  "by": "ReportFindings",   "ts": "2026-08-18T11:30:00Z", "detail": "n=3" },
    { "phase": "crit",        "state": "",      "by": "",                 "ts": "",                     "detail": "" }
  ]
}
```

Phase order in the array matches the canonical order — the widget must not
resort. `state: ""` means the phase has never been recorded in the current
round; the widget renders that as "not yet". `state: "open"` means the phase
ran and left something outstanding — the widget shows this differently from
"not yet" (an unresolved marker plus the `detail`) rather than treating it as
work not started.

Errors:

- `404` if the branch carries no HRS code (task=… didn't resolve).
- `409` if `task-target.sh` reports two branches for the code and the widget
  didn't disambiguate.

The widget always calls with an explicit `task=` query. **No `/state` without
`task`.** Reasoning: the server has no HTTP-level notion of "which tab" — the
extension is what knows the tab's Chrome group.

### `POST /api/phase/:phase` — a mutation

```
POST /api/phase/checks   Body: { "task": "HRS-1234", "action": "done" }
POST /api/phase/checks   Body: { "task": "HRS-1234", "action": "skip", "detail": "reason=no-ci-needed" }
POST /api/phase/dev      Body: { "task": "HRS-1234", "action": "reset", "detail": "reason=qa-feedback" }
```

`action` ∈ `done` | `skip` | `reset`. `detail` is optional; when present, it is
free-form text passed straight through to the CLI's `--detail`.

The server calls `task-phase.mjs` with `--by widget`, `phase-server` records
`ttabs` if we want to distinguish who tikked — decide during implementation; the
important part is that `by` reflects the surface, not the person.

Response: `200` with the full new `/state` payload (so the widget doesn't need
a follow-up GET). `400` if `action` is missing/invalid. `404` if the task can't
be resolved. `409` on a CLI-side write failure.

**`reset` cascades.** The server is a thin front — it delegates the cascade to
the CLI, which delegates to the fold module. The widget must show a
confirmation before reset (see below), but does not implement the cascade.

**No `open`.** The widget cannot mark a phase `open` on its own. `open` is
authored by machines (hook, checks.sh, derivation in Stage 2) — a human who
wants to walk away without closing a phase simply leaves it in its current
state. This is the model.

### `POST /api/phase/refresh` — later

Reserved. Stage 2 needs a way to trigger network-backed derivation (crit,
GitLab MR state) from the widget. Not implemented in v1; return `501` if the
widget probes it. The widget agent should not build UI for this yet.

## Widget contract — what I expect

Only the parts the server relies on. Everything else — layout, colours,
animations, empty-state copy, keyboard shortcuts — is the widget agent's call.

**Scope by task group.** The widget resolves the current tab's Chrome tab
group, extracts the HRS code from the group title (see below), and passes it
as `task=` on every call. A tab in no task group renders nothing and makes no
requests — matching how the QA widget already behaves.

**HRS code extraction.** Match `HRS-?\d+` case-insensitively against the group
title, take the **leftmost** match, uppercase, normalise to `HRS-<digits>`.
Everything after the code in the title is decoration — `[2] HRS-2388 (waiting on
design)` still resolves to `HRS-2388`. Matches ttabs' own rules in the sync.

**Poll cadence.** `GET /state` every **5 seconds** while the widget is visible.
Pause polling when the tab is hidden (`document.hidden`) and resume on
visibility change. Skip the request when the server hasn't answered the last
one yet. This is a stateless server — no cache invalidation, no push. The
existing QA widget uses the same idle model.

**Server absent.** When `/state` errors or the port doesn't answer, the widget
renders nothing and stops polling for **60 seconds**, then retries. It never
logs at default level about the absence — the QA widget already documents this
behaviour ("не narrate its idleness into someone else's console"); this widget
follows the same rule.

**Three-state control per phase.** The owner asked for `done` / `skip` / not
yet, with one-click closure and Alt+click for skip. That is a widget-side
choice — this spec fixes only the wire actions (`done`, `skip`, `reset`) and
that the widget must not fabricate transitions the server doesn't accept.

**Reset is not on the checkbox.** A row's primary control toggles between "not
yet" and `done`. `reset` is a separate action per phase (a menu item, a
long-press, whatever the widget agent lands on) and **requires a confirmation
step**, because the server will cascade to every later phase. The confirmation
must state that fact — "resetting `dev` will also reopen checks, code-review,
crit, qa-cases, qa-manual, comments, tests-review, mr, mr-review, cleanup"
— the widget derives that list from the canonical phase order in the response.

**Round marker.** When `round > 1`, show it visibly; the fact that this task
went through the pipeline multiple times is important context. History of
earlier rounds is out of scope for v1 (link to the CLI's `history` if a link
surface exists — otherwise skip).

**Optimistic UI.** Toggle the state locally on click, send the mutation, revert
on error. The server always returns the authoritative `/state` in the response,
so the widget reconciles against that rather than trusting its optimistic view.

## Lifecycle — when the server runs

**The CLI path never depends on the server.** Two writers matter here: the
skills/hooks (via CLI, always available) and the widget (via server). The
server's absence means "no browser input right now" and must change nothing
about the CLI half.

**Started by `starting-a-task`, and by hand via `/phase-server`.** The task
entry point starts it in its step 3d, silently and ignoring failure, exactly the
way it already treats `task-tab` and `herdr-label`. The reason is that step 2a
of that same skill opens the task's Chrome tab group — so `/task` is precisely
the moment a widget comes into existence and wants a backend.

(An earlier draft of this spec argued the opposite, on the grounds that "most
sessions never open ttabs". That is false for `/task`, which always opens a
browser group. Corrected 2026-08-19.)

`creating-task-worktree` deliberately does **not** start it: `/wt` opens no
Chrome group, so no widget can be watching.

One server per machine, not per task — it is task-agnostic and multiplexes by
`task=`. Idempotent: a second start finding port 47824 already answering reports
`STATUS=running` and exits 0. It does not survive a reboot and nothing
re-launches it, so the first `/task` of the day brings it back.

**Stopped on demand.** The server writes its PID to
`.claude/state/phase-server.pid`, and the stopping side of the command reads
that. A stale PID whose port isn't answering is cleaned silently.

**Not tied to a specific task.** Unlike `qa-test-server.mjs` (one file, one
task per run), this server serves any task whose `<TASK>.log` exists on disk.
The Chrome side scopes; the server enumerates.

## Journal invariants the server must not break

Restating from `2026-08-17-task-phase-tracking-design.md` because the widget
agent will not read that file:

- The journal is **append-only**. Every mutation is a new line. The widget
  never rewrites history.
- **Recording is idempotent** via `isDuplicate` in the fold module — the same
  phase + state + detail arriving from the widget while the CLI or a hook has
  already recorded it appends nothing. This lets the widget send eagerly
  without polluting `history`.
- `reset <phase>` reopens that phase **and every phase after it in the
  canonical order**. Skips from earlier rounds come back as "not yet", not as
  skipped — reasoning: the skip described the previous round's diff, not this
  one's.
- The journal's home is `.claude/state/tasks/<TASK>.log`, gitignored.
  `.claude/` is a symlink in every worktree to the main checkout, so state is
  shared across worktrees and sessions.
- **The task key is never re-derived.** The server passes `task=` straight
  through to `task-target.sh` (or accepts a resolved key from the request; the
  authoritative resolver is `task-target.sh`).
- `cleanup-task` must not delete the journal — closing `cleanup` merely drops
  the task from `/board`. A reopened task continues the same file.

## Delivery order

1. **Server, and only the server.** Ship `phase-server.mjs`, its slash command
   for lifecycle, and a `phase-server.test.mjs` under `.claude/scripts/lib/`
   proving the contract above against a real journal on disk. No widget yet.
   This is dogfood by the CLI: I can `curl localhost:47824/api/phase/state?...`
   from a session and see what the widget will see.
2. **Widget, owned by another agent**, against the shipped server. The agent
   uses this spec as its input and produces `extension/widget-phases/…` in the
   ttabs repo. The widget agent's spec (its own file) covers the UI and its
   internal architecture.
3. **Wire-up.** The widget agent's PR references this server; the QA widget's
   scoping and detection code is the closest existing example in ttabs.

## Open questions the widget agent must answer

Not blockers for this spec — the widget agent decides them during its own
design phase:

- Should the phase panel and the QA cases panel share one collapsible
  container or sit as two independent overlays? (The QA panel already exists;
  they will co-occur during `qa-manual`.)
- Which visual affordance distinguishes `done` from `skip` from `open` from
  not-yet? Four states, one row per phase.
- Empty-state copy when the task's journal has no records yet (the very first
  `/state` call after `/task-wt`).
- Keyboard bindings, if any.

## Out of scope, on purpose

- A general "browser board for all tasks". `/board` covers this in the
  terminal already; a browser version can come after v1 lands.
- Auth or multi-user considerations. Localhost, one owner, one machine.
- Editing a phase's `detail` freehand from the widget. Detail is machine
  metadata; a human doesn't need to type `head=abc123` by hand.
- Any change to `.claude/state/tasks/*.log` format. The widget reads what the
  server serves; if the format evolves, the server hides that.
