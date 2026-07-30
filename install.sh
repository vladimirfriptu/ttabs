#!/usr/bin/env bash
# Install Task Tabs: link the CLI, resolve the extension id Chrome assigned, and
# tell the extension which Jira site to ask.
#
#   ./install.sh
#   ./install.sh --site https://acme.atlassian.net
#
# Safe to re-run — that is also how you refresh the id after reloading the
# extension from a different directory.

set -eu

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ext_dir="$repo/extension"
# shellcheck source=bin/lib/common.sh
. "$repo/bin/lib/common.sh"

bin_dir="${TASK_TABS_BIN:-$HOME/.local/bin}"
id_file="$state_dir/extension-id"

site=""
if [ "${1:-}" = "--site" ]; then
    site="${2:-}"
    [ -n "$site" ] || { echo "usage: ./install.sh [--site https://your.atlassian.net]" >&2; exit 2; }
fi

command -v python3 >/dev/null 2>&1 || { echo "python3 is required" >&2; exit 1; }
[ -d "/Applications/Google Chrome.app" ] || echo "warning: Google Chrome not found in /Applications" >&2

mkdir -p "$state_dir" "$bin_dir"

for name in task-tab task-color; do
    target="$bin_dir/$name"
    # An unrelated file of the same name is kept, not silently replaced.
    if [ -e "$target" ] && [ ! -L "$target" ]; then
        mv "$target" "$target.bak"
        echo "moved existing $target -> $target.bak"
    fi
    ln -sfn "$repo/bin/$name" "$target"
    echo "linked $target -> $repo/bin/$name"
done

case ":$PATH:" in
    *":$bin_dir:"*) ;;
    *) echo "warning: $bin_dir is not on PATH — add it to your shell profile" >&2 ;;
esac

echo
echo "Extension id"
python3 - "$ext_dir" "$id_file" <<'PY'
import json, pathlib, sys

ext_dir, id_file = sys.argv[1], sys.argv[2]
chrome = pathlib.Path.home() / "Library/Application Support/Google/Chrome"

if not chrome.is_dir():
    sys.exit("  Chrome profile directory not found — is Chrome installed?")

# Extension records live in "Secure Preferences"; "Preferences" holds none of
# them on current Chrome. Both are checked so a future move does not break this.
matches = {}
for profile in sorted(chrome.iterdir()):
    for fn in ("Secure Preferences", "Preferences"):
        p = profile / fn
        if not p.is_file():
            continue
        try:
            data = json.loads(p.read_text())
        except (ValueError, OSError):
            continue
        settings = (data.get("extensions") or {}).get("settings") or {}
        for ext_id, meta in settings.items():
            path = meta.get("path")
            name = (meta.get("manifest") or {}).get("name")
            # The unpacked entry stores an absolute path — the precise match.
            # Name is the fallback for a Chrome that stores it differently.
            if path == ext_dir or name == "Task Tabs":
                matches[ext_id] = (profile.name, path or "?")

if not matches:
    sys.exit(
        "  Not loaded yet. In Chrome open chrome://extensions, enable Developer\n"
        f"  mode, choose Load unpacked and select:\n    {ext_dir}\n"
        "  Then run ./install.sh again."
    )

if len(matches) > 1:
    print("  Several matching extensions found — nothing was written:", file=sys.stderr)
    for ext_id, (profile, path) in matches.items():
        print(f"    {ext_id}  profile={profile}  path={path}", file=sys.stderr)
    sys.exit("  Remove the stale copies in chrome://extensions, then re-run.")

ext_id, (profile, path) = next(iter(matches.items()))
pathlib.Path(id_file).write_text(ext_id + "\n")
print(f"  id: {ext_id}  (profile {profile})")
print(f"  written to {id_file}")
PY

echo
echo "Jira site"
if [ -z "$site" ] && [ -t 0 ]; then
    printf '  URL (e.g. https://acme.atlassian.net), empty to skip: '
    read -r site
fi

if [ -n "$site" ]; then
    "$bin_dir/task-tab" site "$site"
    echo "  sent to the extension: $site"
    echo "  (Chrome will ask for access to that host on the first sync)"
else
    echo "  skipped — set it later with: task-tab site https://your.atlassian.net"
fi

echo
echo "Done. Try it:"
echo "  task-tab add TEST-1 https://example.com"
echo "  task-tab close TEST-1"
