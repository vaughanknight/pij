#!/bin/bash
# Plan 136 world-A live proofs. Run AFTER the composed daemon is bounced and the
# global omp extension link points at the composed worktree.
#
#   ./ac-proofs.sh <seat> <pane> <outfile>
#
# Every timestamp is Unix ms from the same clock as the spine, so the receipts
# can be compared against `at` directly.
set -u
SEAT="$1"; PANE="$2"; OUT="$3"
DB="$HOME/.pij-rs/pij.sqlite"
now() { python3 -c 'import time;print(int(time.time()*1000))'; }
rows() { sqlite3 -json "$DB" "select seq,at,kind,seat,payload from spine_events where at >= $1 and (seat='$SEAT' or payload like '%$SEAT%') order by seq"; }
pane_tail() { tmux capture-pane -p -t "$PANE" | tail -"${1:-8}"; }

{
echo "=== AC1: hold while typing, deliver within one grace of the last edit ==="
SINCE=$(now); echo "since=$SINCE seat=$SEAT pane=$PANE"
tmux send-keys -t "$PANE" "AC1-DRAFT-136 typing and not pressing enter"
T0=$(now); echo "t0_last_keystroke=$T0"
sleep 1
echo "--- composer at t0+1s (draft must be present) ---"; pane_tail 6
sleep 4
SEND=$(now); echo "send_at=$SEND (t0+$((SEND-T0))ms)"
pij send "$SEAT" "AC1-136: this must be HELD, not injected"
sleep 6
echo "--- t0+11s: expect NO injection, status shows a hold ---"; pane_tail 8
echo "--- spine so far (expect delivery.held, no inbox-ack) ---"; rows "$SINCE"
echo "--- pij state (sender-visible hold) ---"; pij-rs state "$SEAT" --json 2>&1 | head -c 1200; echo
echo "--- waiting past the grace with NO further typing ---"
sleep 58
INJ=$(now); echo "checked_at=$INJ (t0+$((INJ-T0))ms)"
pane_tail 10
echo "--- spine after release (expect delivery.released then delivery.inbox-ack) ---"; rows "$SINCE"

echo
echo "=== AC4: a control command bypasses an active hold ==="
SINCE4=$(now); echo "since=$SINCE4"
tmux send-keys -t "$PANE" "AC4-DRAFT-136 still typing"
T4=$(now); echo "t4_last_keystroke=$T4"
sleep 3
pij send "$SEAT" "AC4-136-ORDINARY: must stay held behind the command"
sleep 2
pij send "$SEAT" --command compact
sleep 8
echo "--- expect the command through, the ordinary message still held ---"; pane_tail 10
rows "$SINCE4"
} > "$OUT" 2>&1
echo "wrote $OUT"
