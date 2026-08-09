#!/usr/bin/env bash
# Detect the pij#225 outage: a blocked `tmux send-keys` inside the daemon tick
# halts message delivery for EVERY seat in EVERY government on this machine.
#
# WHY THIS IS SEPARATE FROM `pij daemon status`: during the live incident on
# 2026-08-09 the daemon reported `running`, its pid was alive, and its tmux
# window was present — for the entire ten minutes that delivery was stopped.
# The process was healthy; its TICK was not. Liveness and progress are different
# questions and only the first one was being asked anywhere.
#
# Exit 0 = healthy, 1 = wedge or not-probeable. Prints the exact remedy on fire.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

STALE_TICK_S=${STALE_TICK_S:-120}   # ticks run ~5s at 600 seats; 120s is unambiguous
STUCK_SEND_S=${STUCK_SEND_S:-60}    # a send-keys returns in ms, never a minute
rc=0

# --- Signal 1: IS THE LOOP PROGRESSING? (the direct question) ---
age=$(python3 "$HERE/daemon-tick-age.py" 2>/dev/null || echo -1)

if [ "$age" -lt 0 ]; then
  echo "NOT-PROBEABLE: ~/.pij/tick-heartbeat.json missing or unparseable"
  echo "  (cannot distinguish a stopped daemon from a moved field — pij#180 relocated this once already)"
  rc=1
elif [ "$age" -gt "$STALE_TICK_S" ]; then
  echo "WEDGE: last completed tick was ${age}s ago (threshold ${STALE_TICK_S}s) — delivery is stopped FLEET-WIDE"
  rc=1
else
  echo "ok: tick fresh (${age}s)"
fi

# --- Signal 2: WHICH PANE OWNS IT? (the cause) ---
# Deliberately independent of signal 1: signal 1 says the loop stopped, signal 2
# names the pane holding it. Reported separately because either alone is a weaker
# claim than both, and because a wedge caught here BEFORE signal 1 trips is the
# early warning — the tick has not yet exceeded its threshold but already cannot
# finish.
found=0
while read -r pid etime rest; do
  [ -z "${pid:-}" ] && continue
  secs=$(python3 -c '
import sys
parts = sys.argv[1].split("-")
days = int(parts[0]) if len(parts) > 1 else 0
clock = [int(x) for x in parts[-1].split(":")]
while len(clock) < 3:
    clock.insert(0, 0)
print(days * 86400 + clock[0] * 3600 + clock[1] * 60 + clock[2])
' "$etime" 2>/dev/null || echo 0)
  if [ "$secs" -gt "$STUCK_SEND_S" ]; then
    target=$(echo "$rest" | grep -oE '\-t %[0-9]+' | head -1)
    echo "WEDGE: tmux send-keys pid=$pid blocked ${secs}s ${target:-(target unknown)}"
    echo "  REMEDY: kill $pid"
    echo "  Kill the wedged CHILD ONLY — never the daemon. The tick then completes and the"
    echo "  whole backlog flushes. Restarting the daemon also clears it, but discards the"
    echo "  queue and pays another full working-set rebuild."
    found=1
    rc=1
  fi
done < <(ps -eo pid,etime,command 2>/dev/null | grep "tmux send-keys" | grep -v grep)

[ "$found" -eq 0 ] && echo "ok: no tmux send-keys blocked >${STUCK_SEND_S}s"

exit $rc
