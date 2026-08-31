#!/usr/bin/env python3
"""The zombie contract — what each probe family answers about a dead-but-unreaped process.

Four seats made the same mistake in this plan, in four different places:

  * the reviewer's round-1 probe read a zombie `ps` row as a SURVIVOR and was one
    step from filing "SIGTERM does not kill the group leader", which is false;
  * the bg classifier read `reap() -> None` as LOST when the status had been
    observed, consumed, and discarded;
  * the ruled cancel fix proposed `kill(-pgid, 0)` as a cheap liveness probe,
    which cannot converge on a zombie-only group;
  * THE FIRST VERSION OF THIS FILE called `child.poll()` while observing, which
    is a non-blocking waitpid — so the observer REAPED the zombie it was
    measuring and printed `ps=[]` for a state that existed until it looked.

The zombie is not an edge case in this system. It is the NORMAL END STATE of a
process nobody has reaped yet, and every probe family answers a different
question about it. Run this before changing anything that decides whether a
process is alive.

    python3 probe-zombie-contract.py
"""

import errno
import os
import subprocess
import time


def table_rows(pgid):
    out = subprocess.run(
        ["ps", "-Ao", "pid=,pgid=,state="], capture_output=True, text=True
    ).stdout
    rows = []
    for line in out.splitlines():
        parts = line.split()
        if len(parts) >= 3 and int(parts[1]) == pgid:
            rows.append((int(parts[0]), parts[2]))
    return rows


def killpg_probe(pgid):
    """Report the NUMBER, not the name.

    The whole point of moving off stderr text is that errno is a field: ESRCH=3
    and EPERM=1 cannot be reworded by a vendor, a locale, or another `kill`
    implementation. A probe that reports only the symbolic name reproduces, in
    its own output, the ambiguity the code is being moved away from.
    """
    try:
        os.killpg(pgid, 0)
        return "0/ok"
    except OSError as error:
        return f"{errno.errorcode.get(error.errno, '?')}={error.errno}"


def getpgid_probe(pid):
    try:
        os.getpgid(pid)
        return "ok"
    except ProcessLookupError:
        return "ESRCH"
    except PermissionError:
        return "EPERM"


def observe(label, pgid, pid):
    # DELIBERATELY does not call child.poll(). poll() is a non-blocking waitpid:
    # it REAPS the zombie, so an observer that calls it destroys the state it is
    # measuring. The first version of this probe did exactly that.
    rows = table_rows(pgid)
    live = [p for p, s in rows if not s.startswith("Z")]
    print(
        f"{label:<24} ps={rows!s:<28} non-zombie={live!s:<8} "
        f"killpg={killpg_probe(pgid):<14} getpgid={getpgid_probe(pid):<6}"
    )


def main():
    child = subprocess.Popen(
        ["sh", "-c", "sleep 30 & exit 7"],
        preexec_fn=os.setsid,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    pgid = child.pid  # setsid => leader, pgid == pid
    time.sleep(0.5)

    print(f"process group {pgid}; this process's group is {os.getpgid(0)}\n")
    observe("leader zombie + child", pgid, child.pid)

    for pid, _ in table_rows(pgid):
        if pid != child.pid:
            try:
                os.kill(pid, 9)
            except OSError:
                pass
    time.sleep(0.5)
    observe("zombie leader ONLY", pgid, child.pid)

    try:
        os.killpg(pgid, 9)
        print("\nkillpg(pgid, 9) on a zombie-only group -> accepted")
    except OSError as error:
        print(
            f"\nkillpg(pgid, 9) on a zombie-only group -> {type(error).__name__}"
            f" ({error.errno}) — escalation MUST treat this as 'nothing left to kill'"
        )

    status = child.wait(timeout=5)  # the reap, done ONCE, deliberately, at the end
    observe("after parent reaps", pgid, child.pid)
    print(
        f"\nwaitpid gave the exit status: {status}  "
        "(the ONLY probe that yields it — and it is consumed once)"
    )

    print("""
CONTRACT — read every row before changing liveness code

  ps state= excluding 'Z'   the only cheap probe meaning "a process capable of
                            work is still there". `group_pids` uses this.
  killpg(pgid, 0)           THREE outcomes, and branch on the NUMBER: ESRCH=3
                            proves absence; 0 and EPERM=1 prove NOTHING. Use it
                            one-directionally as a fast path to CONVERGE, never
                            to conclude "still alive". Never branch on the
                            stderr sentence — errno is a field, prose is not.
  getpgid(pid)              raises ESRCH for a zombie while ps still shows the
                            row. Two probes, same process, opposite answers —
                            never mix probe families in one decision.
  waitpid / try_wait        the only source of the EXIT STATUS, and it is
                            CONSUMED on first success. Persist the status the
                            moment it is observed; a guard that runs after the
                            consumption and bails discards it for ever.
  poll() IS waitpid         an observer that calls it reaps what it observes.

  A zombie row is a RESIDUE, not a state (E-024): it records that a process ran
  here, not that one runs here.
""")


if __name__ == "__main__":
    main()
