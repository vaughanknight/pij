#!/usr/bin/env python3
"""Emit a BOOLEAN card-staleness verdict for one seat, never a timestamp or an age.

Probe-authoring rule (rollout brief, 2026-08-02): a probe must not emit timestamps or
ages — they move every tick, so the chore fires forever and the delta carries no
information. Card staleness is the named trap: emit the verdict, not the clock.

Usage:  pij-card-stale.py <seat-id> [threshold-minutes]   (default 60)
Output: "<seat> stale=<true|false> state=<systemState>"
Fails loud (exit 1, PROBE-ERR) rather than printing a clean verdict it did not compute.
"""
import json
import subprocess
import sys
from datetime import datetime, timezone

seat = sys.argv[1] if len(sys.argv) > 1 else sys.exit("PROBE-ERR usage: <seat-id> [minutes]")
threshold_min = int(sys.argv[2]) if len(sys.argv) > 2 else 60

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
    print(f"{seat} stale=NO-CARD state={d.get('systemState')}")
    sys.exit(0)

try:
    then = datetime.fromisoformat(status_at.replace("Z", "+00:00"))
except ValueError:
    print(f"PROBE-ERR unparseable-statusAt {seat} {status_at}")
    sys.exit(1)

age_min = (datetime.now(timezone.utc) - then).total_seconds() / 60
print(f"{seat} stale={'true' if age_min > threshold_min else 'false'} state={d.get('systemState')}")
