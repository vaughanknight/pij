#!/bin/sh
set -eu

force=0
for arg in "$@"; do
    case "$arg" in
        --force) force=1 ;;
        *)
            echo "E-ARG: unknown bounce-daemon argument: $arg (use --force)" >&2
            exit 64
            ;;
    esac
done

status=$(pij daemon status)
pid=$(printf '%s\n' "$status" | sed -n 's/^running (pid \([0-9][0-9]*\).*/\1/p')
if [ -z "$pid" ]; then
    echo "!! cannot bounce: pij daemon status did not identify a running daemon" >&2
    echo "   status: $status" >&2
    exit 1
fi

daemon_command=$(ps -ww -p "$pid" -o command=)
daemon_file=$(printf '%s\n' "$daemon_command" | awk '{ for (i = 1; i <= NF; i++) if ($i ~ /\/\.pi\/extensions\/pij\/daemon\.ts$/) found = $i } END { print found }')
if [ -z "$daemon_file" ]; then
    echo "!! cannot bounce: pid $pid does not expose a pij daemon.ts invocation" >&2
    exit 1
fi

source_root=${daemon_file%/.pi/extensions/pij/daemon.ts}
canonical=$(git -C "$source_root" rev-parse --show-toplevel)
canonical=$(realpath "$canonical")

pane_matches=$(tmux list-panes -a -F '#{window_id}|#{window_name}|#{pane_id}|#{pane_pid}|#{pane_current_path}' \
    | awk -F '|' -v root="$canonical" '$2 == "pij-daemon" && $5 == root { print $1 " " $3 }')
pane_count=$(printf '%s\n' "$pane_matches" | awk 'NF { n++ } END { print n + 0 }')
if [ "$pane_count" -ne 1 ]; then
    echo "!! cannot bounce: expected one pij-daemon tmux pane for $canonical, found $pane_count" >&2
    exit 1
fi
pane=$(printf '%s\n' "$pane_matches" | awk 'NR == 1 { print $2 }')

echo "= fetching origin for canonical daemon checkout: $canonical"
git -C "$canonical" fetch origin
head_sha=$(git -C "$canonical" rev-parse HEAD)
main_sha=$(git -C "$canonical" rev-parse refs/remotes/origin/main)
if [ "$head_sha" != "$main_sha" ]; then
    echo "!! REFUSING stale-tree daemon bounce" >&2
    echo "   canonical HEAD: $head_sha" >&2
    echo "   origin/main:    $main_sha" >&2
    echo "   update the canonical checkout to origin/main, then retry" >&2
    exit 1
fi

dirty=$(git -C "$canonical" status --porcelain -- .omp/extensions/pij .pi/extensions/pij package.json package-lock.json)
if [ -n "$dirty" ]; then
    echo "!! canonical checkout has daemon-relevant changes:" >&2
    printf '%s\n' "$dirty" >&2
    if [ "$force" -ne 1 ]; then
        echo "   REFUSING: inspect the changes, then retry with: just bounce-daemon --force" >&2
        exit 1
    fi
    echo "!! --force accepted; bouncing daemon with uncommitted daemon-relevant source" >&2
fi

short_sha=$(git -C "$canonical" rev-parse --short HEAD)
if ! pij report now "bouncing pij daemon at $short_sha" "restart and health verification"; then
    echo "= bouncing pij daemon at $short_sha (pane $pane)"
fi

echo "= stopping daemon pid $pid gracefully"
pij daemon stop
waited=0
while kill -0 "$pid" 2>/dev/null; do
    if [ "$waited" -ge 10 ]; then
        echo "!! daemon pid $pid did not exit after SIGTERM; refusing to overlap instances" >&2
        echo "   recover: inspect pid $pid, then run 'pij daemon stop'" >&2
        exit 1
    fi
    sleep 1
    waited=$((waited + 1))
done

echo "= restarting captured invocation in a discovered pij-daemon tmux window"
tmux new-window -d -n pij-daemon -c "$canonical" "exec env PIJ_DAEMON_OWNED=1 $daemon_command"

healthy=0
waited=0
while [ "$waited" -lt 15 ]; do
    status=$(pij daemon status 2>&1 || true)
    case "$status" in
        running\ \(pid\ *) healthy=1; break ;;
    esac
    sleep 1
    waited=$((waited + 1))
done
if [ "$healthy" -ne 1 ]; then
    echo "!! DAEMON RESTART FAILED HEALTH CHECK after 15s" >&2
    echo "   last status: $status" >&2
    echo "   recover from $canonical:" >&2
    echo "     pij daemon stop" >&2
    echo "     tmux new-window -d -n pij-daemon -c '$canonical' \"exec env PIJ_DAEMON_OWNED=1 $daemon_command\"" >&2
    echo "     pij daemon status" >&2
    exit 1
fi

version=$(node -p 'require(process.argv[1]).version' "$canonical/package.json")
echo "✓ pij daemon healthy: version $version, HEAD $head_sha"
echo "  $status"
