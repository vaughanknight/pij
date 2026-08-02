#!/usr/bin/env python3
"""Emit a BOOLEAN card-staleness verdict for one seat, never a timestamp or an age.

Probe-authoring rule (rollout brief, 2026-08-02): a probe must not emit timestamps or
ages — they move every tick, so the chore fires forever and the delta carries no
information. Card staleness is the named trap: emit the verdict, not the clock.

A PROBE EMITS ONLY THE DECISION VARIABLE. Everything else diagnostic belongs in --full.
This script first emitted `state=<systemState>` alongside the verdict. systemState flaps
idle<->working whenever the watched seat does any work, so the chore opened a delta on every
burst, and when the state returned before the next run the report rendered as
`CHANGED pa-card: 2fc848f667f1 -> 2fc848f667f1` — an open delta whose endpoints are equal.
Nothing was wrong with the tool: something really did move and move back. But a fast-moving
field riding along in a probe about STALENESS makes the chore fire on an axis it is not
about. Keep the fingerprint minimal; put the colour in --full.

Usage:  pij-card-stale.py <seat-id> [threshold-minutes] [--full]
Probe output: "<seat> stale=<true|false>"          (decision variable only)
Full output:  "<seat> stale=<...> state=<...> assignment=<...>"   (diagnostic, unfingerprinted)
Fails loud (exit 1, PROBE-ERR) rather than printing a clean verdict it did not compute.
"""
import json
import subprocess
import sys
from datetime import datetime, timezone

args = [a for a in sys.argv[1:] if a != "--full"]
FULL = "--full" in sys.argv
seat = args[0] if args else sys.exit("PROBE-ERR usage: <seat-id> [minutes] [--full]")
threshold_min = int(args[1]) if len(args) > 1 else 60

r = subprocess.run(["pij", "node", "show", seat, "--json"], capture_output=True, text=True)
if r.returncode != 0 or not r.stdout.strip():
    print(f"PROBE-ERR node-show-failed {seat}")
    sys.exit(1)
try:
    d = json.loads(r.stdout)
except json.JSONDecodeError:
    print(f"PROBE-ERR unparseable-json {seat}")
    sys.exit(1)

status_at = d.get("statusAt")
if not status_at:
    # No card at all is a real, reportable state — not an error, and not "fresh".
    print(f"{seat} stale=NO-CARD" + (f" state={d.get('systemState')}" if FULL else ""))
    sys.exit(0)

try:
    then = datetime.fromisoformat(status_at.replace("Z", "+00:00"))
except ValueError:
    print(f"PROBE-ERR unparseable-statusAt {seat} {status_at}")
    sys.exit(1)

age_min = (datetime.now(timezone.utc) - then).total_seconds() / 60
verdict = "true" if age_min > threshold_min else "false"
detail = (f" state={d.get('systemState')} assignment={d.get('currentAssignment')}"
          f" age={int(age_min)}m" if FULL else "")
print(f"{seat} stale={verdict}{detail}")
