#!/bin/bash
# Plan 136 post-merge proofs: AC1 (repeat against main's binary), AC3 (visible
# both ends), AC5 (kill while two are held; both come back, in order).
set -u
SEAT="$1"; PANE="$2"; OUT="$3"
DB="$HOME/.pij-rs/pij.sqlite"
now() { python3 -c 'import time;print(int(time.time()*1000))'; }
rows() { sqlite3 -json "$DB" "select seq,at,kind,payload from spine_events where at >= $1 and seat='$SEAT' order by seq"; }

{
echo "=== AC1 + AC3: hold, visible from both ends, released within one grace ==="
SINCE=$(now); echo "since=$SINCE seat=$SEAT pane=$PANE"
tmux send-keys -t "$PANE" "AC1B-DRAFT typing on the merged daemon"
T0=$(now); echo "t0_last_keystroke=$T0"
sleep 4
echo "send_at=$(now)"
pij send "$SEAT" "AC1B-136: held on main's binary"
sleep 8
echo "--- AC3 sender-visible state while held ---"
pij state "$SEAT" 2>&1 | head -4
echo "--- AC3 recipient status line (pane tail) ---"
tmux capture-pane -p -t "$PANE" | grep -E "held|⏸" | tail -3
echo "--- spine while held ---"; rows "$SINCE"

echo
echo "=== AC5: kill the seat while TWO rows are held; both must come back in order ==="
SINCE5=$(now); echo "since5=$SINCE5"
tmux send-keys -t "$PANE" "AC5-DRAFT still typing"
T5=$(now); echo "t5_last_keystroke=$T5"
sleep 2
pij send "$SEAT" "AC5-136-FIRST"
sleep 2
pij send "$SEAT" "AC5-136-SECOND"
sleep 6
echo "--- both held? ---"; rows "$SINCE5"
PID=$(sqlite3 "$DB" "select json_extract(payload,'\$.proc.pid') from spine_events where seat='$SEAT' and kind='seat.put' order by seq desc limit 1")
echo "seat_pid=$PID"
echo "--- killing the omp process while held ---"
kill -9 "$PID" 2>&1 || echo "kill failed"
sleep 3
echo "--- spine after the kill (rows must still be unacked) ---"; rows "$SINCE5"
} > "$OUT" 2>&1
echo "wrote $OUT"
