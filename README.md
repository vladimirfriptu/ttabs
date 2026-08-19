# ttabs

Groups Chrome tabs by Jira task, from the command line, and keeps each group's
title in step with the task's status:

```
REQ|ACME-218   DEV|ACME-253   REV|ACME-254   QA|ACME-261   HOLD|ACME-266
```

One window can then hold several tasks side by side without their tabs mixing,
and the tab strip doubles as a board. Scripts drive it: a "start working on a
task" command opens the group with the issue, a "run it locally" command adds the
dev server, a "clean up" command closes the group.

macOS + Google Chrome only.

## Why an extension

Chrome tab groups exist only behind the `chrome.tabGroups` extension API —
AppleScript cannot see them and the DevTools Protocol has no such domain. So the
grouping lives in a small unpacked extension.

The CLI reaches it without a daemon: Chrome accepts `chrome-extension://` URLs
from `open`, so `task-tab` opens the extension's own control page with query
parameters. That page performs the operation and closes itself. No native
messaging host, no local server. The only background piece is the status sync.

## QA checklist panel

The extension also carries a small optional widget: a floating checklist panel
that appears on `localhost` pages whenever a local QA server is running on
port `47823`, and disappears when it is not.

It expects that server to answer three endpoints:

| Request | Answer |
| --- | --- |
| `GET /api/qa/state` | `200` with `{ task, cases, discrepancies }`, or `404` when no session is running |
| `POST /api/qa/case/:id` — `{"passed": true}` and/or `{"comment": "…"}`, both optional but at least one required (`400` otherwise) | `204` |
| `POST /api/qa/finish` — `{"note": "…"}` | `200 {"ok": true}` |

A case is `{ id, title, steps, expectedResult, area, status, passed, comment }`,
where `status` is one of `new`, `updated`, `unchanged`, `outdated`; an outdated
case is shown struck through rather than hidden. A discrepancy is
`{ id, summary, source, implemented }` and is displayed read-only.

Each case also takes a free-text comment, written in the panel and sent to the
server as it is typed. The server keeps it beside that case and reflects it in
the next state it hands back, so the panel shows what the server has on the
next render.

A panel belongs to the task of the tab group its tab sits in: with several
tasks open at once, one task's checklist never appears over another task's app,
and a tab in no group shows nothing and makes no requests.

Serving that is somebody else's job — the extension is only the client. With
nothing listening on the port, the panel never appears and the rest of the
extension is unaffected.

When it does not appear and you want to know why, set the page console's level
filter to **Verbose**: the widget explains itself there — whether its content
script loaded, which task it resolved for the tab, and whether the server
answered. It says nothing at the default level, since most tasks never run a
checklist server and a widget should not narrate its idleness into someone
else's console.

## Phase panel

A second floating panel, bottom-left this time (the QA checklist keeps
bottom-right, and the two can be open together), lists a task's pipeline
phases whenever the tab is on `localhost` inside a task group. It reads and
writes a local phase server on port `47824`. With nothing listening there the
panel never appears, quietly — it retries once a minute rather than giving up
for good, since the server does not survive a reboot and nothing brings it
back automatically.

Serving that journal is, like the QA server, somebody else's job: the
extension only talks to whatever answers on that port, on a small fixed
protocol it did not design.

Each phase is in one of four states: recorded (`done`), skipped, `open` — the
phase ran and left something outstanding, and the panel shows why — or not yet
reached. Clicking a phase's checkbox closes it; alt-click skips it instead. The
keyboard reaches both: Tab to a box, then Space or Enter records it, and holding
Alt with either one skips it.

The phases are grouped into stages, in the order the server sends them. Each
stage gets a caption with its name, its own `closed/total` tally, and a hairline
filling whatever the two leave between them; a phase whose stage the server
leaves blank sits under no caption at all. A rail runs down each row beside its
checkbox, tinted by that phase's state — drawn per row, so it breaks at every
stage caption rather than running the whole list's height.

The header counts the whole journal the same way, beside the task key — which is
a link into the tracker once a Jira site is configured (`task-tab site <url>`)
and plain text until then. A `round N` badge appears there once a task has been
through the pipeline more than once; round one shows nothing. Under the list one
line says where the journal stands: `next: crit`, or `no records yet`, or
`all closed`.

Clicking a checkbox that is already ticked clears that one phase, and nothing
else — a mis-tick costs exactly the tick it took to make.

`open` is the one state a human can only leave, never author: closing it is an
ordinary click on its box, but nothing in the panel puts a phase into it.

A phase can also carry a destination, drawn as a small chip on its row. The
server decides which phase gets one and what it says:

- a link chip opens somewhere else in a new tab — a merge request, a pipeline —
  under the label the server gave it. Only `http` and `https` are followed: a
  destination the panel cannot trust that far is left out rather than drawn.
- the `test` chip opens the QA checklist inside the panel itself.

That last one swaps the panel's contents rather than opening anything: the panel
widens, the phase list steps behind the checklist of the QA session running for
this task, and the arrow in the top-left corner brings the phases back at the
original width. It is the same checklist the QA panel shows — areas, cases, a
note per case, the discrepancies underneath — and the button at its foot names
the phase it is about to close, plus how many cases are still unpassed. Finishing
from here does not itself record the phase: the click ends the QA session, and
the QA server records the phase on its way out.

With no QA session running — or one running for another task — that screen says
so, and offers the only thing left to do: **close the phase without a
checklist**, which leaves the screen and then records the phase. The screen also leaves
by itself when the tab moves into another task's group, or when the journal stops
offering the chip it was reached through.

A write the server refuses leaves `not saved: …` on the row it belonged to; a
read it refuses puts the status code in a line at the foot of the panel and
keeps showing the last journal it did manage to serve. Both give way to the
next answer that comes back.

The header is also the panel's handle: drag it anywhere, and drag the checklist
screen by its own header, which stands in while the other is out of sight. Where
a panel ends up is not remembered — a reload puts it back in its corner.

When the panel is missing and a phase server is in fact running:

1. **The tab isn't in a task's tab group.** Only a tab whose group carries a
   recognisable key gets a panel at all.
2. **The group title was renamed past recognition.** The panel needs a key in
   the title exactly like the CLI does — see "Keep the key in the title" above.
3. **The phase server isn't running.** The panel checks once a minute, so
   starting it catches on within that window without reloading the tab.
4. **The extension wasn't reloaded after editing `extension/`.** Press
   *Reload* on the card in `chrome://extensions`.
5. **It is there, showing the QA checklist.** A panel left on that screen looks
   like another widget entirely: the checklist brings its own header, so the task
   key is still there, but the phase rows, the `closed/total` counter and the
   collapse chevron are not. The arrow in its top-left corner goes back.

## Install

```bash
git clone https://github.com/vladimirfriptu/ttabs.git ~/ttabs && cd ~/ttabs
./install.sh
```

The first run links `task-tab` and `task-color` into `~/.local/bin` and then
stops, because Chrome has not seen the extension yet. Load it — `chrome://extensions`
→ **Developer mode** → **Load unpacked** → select this repo's `extension/`
directory — and run `./install.sh` again. It resolves the id Chrome assigned,
caches it, and asks for your Jira site:

```
Jira site
  URL (e.g. https://acme.atlassian.net), empty to skip: https://acme.atlassian.net
```

You can set it later, or change it, with `task-tab site https://acme.atlassian.net`.
Chrome will ask for access to that host the first time the sync runs.

Re-run `./install.sh` whenever the extension is reloaded from a different
directory — Chrome derives an unpacked extension's id from its path, so moving
the repo changes the id.

Paths, all overridable by environment variable:

| What | Default | Override |
|---|---|---|
| CLI symlinks | `~/.local/bin` | `TASK_TABS_BIN` |
| State (`extension-id`, `colors/`) | `~/.local/share/task-tabs` | `TASK_TABS_HOME`, `XDG_DATA_HOME` |

## Usage

```bash
task-tab add ACME-1234 https://acme.atlassian.net/browse/ACME-1234
task-tab add ACME-1234 http://localhost:3000        # same group, second tab
task-tab --focus add ACME-1234 http://localhost:3000  # ...and jump to it
task-tab collapse ACME-1234                         # fold it up
task-tab close ACME-1234                            # close every tab in it
task-tab site https://acme.atlassian.net            # point the sync at your Jira
```

Adding a URL already in the group is a no-op instead of opening a duplicate.
`task-tab` is a deliberate silent no-op in general — it exits 0 without output
when it cannot work, so a script may call it unconditionally.

### Nothing steals your focus

Tabs are arranged in the background. `open -g` keeps Chrome from coming to the
front, new tabs are created inactive, and the control page — which Chrome does
make active for the ~200 ms it exists — hands the selection back to the tab you
were reading before closing itself. The service worker tracks that tab per
window, ignoring control pages, so the answer is right even after several
commands in a row.

`--focus` opts out for the one call where you do want to be taken to the tab.

## The status prefix

The service worker refreshes every group's title every five minutes, on browser
start, and immediately after `task-tab add`. It collects the task keys from the
tab groups themselves, asks Jira for their statuses in one JQL request, and
rewrites only the titles that changed.

Authentication is your ordinary browser session — `fetch` with
`credentials: 'include'`. No token is stored anywhere. While the session is
expired the sync fails silently and the titles simply stop moving; opening Jira
in a tab fixes it.

Default map — a Jira status not listed here still gets a prefix, the first four
letters of its name:

| Status | Prefix | | Status | Prefix |
|---|---|---|---|---|
| Backlog | `BL` | | In test | `QA` |
| Requirements | `REQ` | | Ready for release | `REL` |
| Ready | `RDY` | | On hold / Blocked | `HOLD` |
| Ready for dev / To Do | `RDEV` / `TODO` | | Closed / Done | `DONE` |
| In dev / In progress | `DEV` | | | |
| On review / In review | `REV` | | | |

Adapting it to another workflow is one edit in `extension/lib/statuses.js`;
nothing else knows the status names.

`Closed` is just another prefix — the group stays open until `task-tab close`
takes it down.

### A title you typed yourself is never overwritten

The sync rewrites a title only when it is a bare key (`ACME-261`), one of its own
prefixes (`DEV|ACME-261`), or the exact string it wrote last time — that last
case is what lets a fallback prefix for an unmapped status keep updating.
Anything else (`[1] ACME-261`, `⚠️ ACME-261`) is yours, and the sync leaves that
group alone for good. Rename it back to a bare key to hand it over again.

**Keep the key in the title.** That is the one rule renaming has to respect: the
key is how every command finds the group, and decoration around it — on either
side, in any amount — is ignored. `[2] ACME-261`, `ACME-261 [2]`,
`ACME-261 (waiting on design)` and `ACME-261-empty-state-fixes` all still belong
to `ACME-261`, so `task-tab add`, `close` and `collapse` keep reaching them. Drop
the key (`design work`) and the group becomes invisible to the CLI: the next
`task-tab add` will build a second group beside it rather than adopt it. When a
title carries two keys, the leftmost one wins.

## The colour anchor

If your terminal multiplexer labels its own tabs per task, `task-color` gives
both ends the same colour to agree on:

```bash
task-color ACME-1234            # -> "purple 🟪"
task-color --chrome ACME-1234   # -> "purple"      (used by task-tab)
task-color --emoji  ACME-1234   # -> "🟪"          (for a terminal tab label)
task-color --set red ACME-1234  # override, remembered like any assignment
task-color --release ACME-1234  # return it to the pool
```

The colour is picked on first call from whatever no other live task holds, then
stored in `<state>/colors/<key>` — that file is both the memory and the "taken"
list. `task-tab close` releases it, so finished tasks give their colour back.

That is not the only way a task ends, though: close the group by hand, delete the
worktree, restart the machine, and the reservation would be held for good. The
CLI cannot ask Chrome which groups still exist, so instead every read stamps the
reservation as live, and a task that finds nothing free takes over the colour
nobody has asked about in longest — the one most likely to be finished. Colours
therefore repeat only while you genuinely have more than six tasks in flight, and
the store never grows past the palette.

The palette is the six Chrome tab-group colours with a solid emoji square: blue,
green, purple, yellow, red, grey — in that order, so grey is the last resort.
Chrome's pink and cyan are skipped: their squares are Unicode 15 and render
inconsistently in terminals.

## Development

```bash
npm test        # node:test over extension/lib, plus task-color end to end
```

The extension is plain ES modules — `"type": "module"` on the service worker and
`<script type="module">` on the control page — so there is no build step and no
bundler: edit a file and press *Reload* on the extension card in
`chrome://extensions`. Everything under `extension/lib/` is free of browser APIs
and is what the tests import directly.

Files:

| Path | Role |
|---|---|
| `bin/task-tab` | CLI: opens the control page with the requested action |
| `bin/task-color` | CLI: assigns and remembers a task's colour |
| `bin/lib/common.sh` | Shared by both CLIs and the installer: state dir, URL encoding |
| `extension/control.js` | Performs one action per page load, then closes the tab |
| `extension/sync.js` | Service worker: schedules the sync and wires up the messages |
| `extension/lib/statuses.js` | The status → prefix map, and nothing else |
| `extension/lib/titles.js` | Title format, key extraction, title-ownership rule |
| `extension/lib/plan.js` | Decides which titles to rewrite — pure, no browser APIs |
| `extension/chrome/` | Thin wrappers over `chrome.*`: groups, focus, storage |
| `extension/providers/jira.js` | The only file that knows Jira's API |
| `install.sh` | Links the CLI, resolves the extension id, sets the Jira site |

### Pointing it at another tracker

`extension/providers/jira.js` is the whole coupling. A sibling exporting the same
`fetchStatuses(site, keys) -> { key: statusName }` plus one import line in
`sync.js` and the new host in `manifest.json` is the entire change; `lib/` and
`chrome/` never learn about it.

## When tabs stop appearing

`task-tab` fails quietly by design, so start here, in order of likelihood:

1. **The id went stale.** The repo moved, or the extension was reloaded from
   another directory. Re-run `./install.sh`.
2. **The extension got disabled.** Chrome periodically offers to turn off
   developer-mode extensions, and it is easy to accept by reflex. Check
   `chrome://extensions`.
3. **`extension-id` is missing.** `ls ~/.local/share/task-tabs/extension-id`. If
   absent, run `./install.sh`.

To see what the CLI would do, run its `open` line by hand — the control page logs
errors to its own console under `chrome://extensions` → *Inspect views*.

## When the status prefix stops moving

The sync is silent too. Open `chrome://extensions` → *Inspect views: service
worker* — a failed run logs `[task-tabs] sync failed:` there.

1. **No Jira site configured.** The log says so; run `task-tab site <url>`.
2. **The Jira session expired.** The request comes back 401; open your Jira in a
   tab and the next tick recovers.
3. **The title is no longer ours.** A group renamed by hand is skipped by design
   — see above.
4. **The service worker was never started.** After editing anything under
   `extension/`, press *Reload* on the card in `chrome://extensions`.

## Known annoyances

- Chrome nags about developer-mode extensions. Escaping that needs a Web Store
  listing or an enterprise policy; Chrome stable refuses side-loaded CRX files.
- The control page is a real tab for roughly 200 ms before it closes itself.
  `task-tab` uses `open -g` so it never steals focus, which makes it easy to
  miss, but it is visible.
- `host_permissions` covers `*.atlassian.net`. A self-hosted Jira needs its host
  added to `extension/manifest.json`.
