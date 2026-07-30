# shellcheck shell=bash
# Sourced by task-tab, task-color and install.sh — never executed on its own.
# Finding this file needs the symlink resolved first, so that step stays inline
# in each caller.

# Where the extension id and the colour assignments live.
# shellcheck disable=SC2034  # not every caller uses everything here
state_dir="${TASK_TABS_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/task-tabs}"

encode() {
    python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"
}
