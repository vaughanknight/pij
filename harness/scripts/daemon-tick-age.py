#!/usr/bin/env python3
"""Age in seconds of the daemon's last completed tick. Prints -1 if not probeable.

READ THE FIELD THAT STILL MOVES. pij#180 moved the tick heartbeat OUT of every
descriptor (`lastTickAt`) into one file, `~/.pij/tick-heartbeat.json`, so the
per-descriptor field is now FROZEN at whatever it held when that fix landed.

The first version of this probe read `lastTickAt` and reported a healthy daemon
as "stopped fleet-wide, 1026s old" while a peer was replying normally on the
same second. A probe pointed at a relocated field cannot return the contrary
answer: it reports the relocation as the outage it was written to detect.

pij#204 is this same relocation breaking archive ageing, which makes this the
second consumer to be broken by one field move — so if a third symptom appears,
look for a reader of `lastTickAt` before looking for a new defect.
"""

import datetime
import json
import os
import sys

HEARTBEAT = os.path.expanduser("~/.pij/tick-heartbeat.json")


def main() -> int:
    if not os.path.exists(HEARTBEAT):
        print(-1)
        return 0
    try:
        tick_at = json.load(open(HEARTBEAT)).get("tickAt")
    except Exception:
        print(-1)
        return 0
    if not tick_at:
        print(-1)
        return 0
    try:
        now = datetime.datetime.now(datetime.timezone.utc)
        then = datetime.datetime.fromisoformat(tick_at.replace("Z", "+00:00"))
        print(int((now - then).total_seconds()))
    except Exception:
        print(-1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
