#!/usr/bin/env python3
"""Repo-scoped chore probes that report their POPULATION and fail loud.

The rule (chore rollout, 2026-08-02): a filtered query that returns nothing and a filter
that never ran produce the same output. So a probe must never report bare absence — it
reports how many things it examined, and exits non-zero when it examined none or when the
underlying command failed, so the chore lands as NOT-PROBEABLE rather than as a clean result.

Do NOT use the `... | grep . || echo NONE` idiom: a broken command and a legitimately empty
result fingerprint identically under it.

Usage:  pij-repo-probe.py main-head        -> "refs=1 <sha>"
        pij-repo-probe.py pr-board         -> "3prs 70:CLEAN:SUCCESS 72:CLEAN:SUCCESS ..."
"""
import json
import subprocess
import sys


def die(msg):
    print(f"PROBE-ERR {msg}")
    sys.exit(1)


def run(cmd):
    """Run a command, failing loud on non-zero exit rather than yielding empty output."""
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        die(f"{cmd[0]}-failed rc={r.returncode} {r.stderr.strip()[:120]}")
    return r.stdout


def main_head():
    out = run(["git", "ls-remote", "origin", "refs/heads/main"])
    refs = [l for l in out.splitlines() if l.strip()]
    if len(refs) != 1:
        die(f"expected-1-ref got={len(refs)}")
    print(f"refs=1 {refs[0].split()[0]}")


def pr_board():
    out = run(["gh", "pr", "list", "--state", "open", "--json", "number"])
    try:
        prs = json.loads(out)
    except json.JSONDecodeError:
        die("unparseable-pr-list")
    # Zero open PRs is a legitimate world state, not a failure — the denominator says so.
    if not prs:
        print("0prs none-open")
        return
    rows = []
    for pr in sorted(p["number"] for p in prs):
        d = run(["gh", "pr", "view", str(pr), "--json",
                 "number,mergeStateStatus,statusCheckRollup"])
        try:
            v = json.loads(d)
        except json.JSONDecodeError:
            die(f"unparseable-pr-view {pr}")
        # A check RUN in flight carries conclusion=null and no `state` — its
        # progress lives in `status`. Falling back only to `state` yielded None
        # and `sorted()` then compared str against None, so the probe crashed
        # EXACTLY when a PR had a running check, i.e. exactly when it is worth
        # probing. Coerce to str so an in-flight PR reports rather than dies.
        checks = sorted(str(c.get("conclusion") or c.get("state")
                            or c.get("status") or "pending")
                        for c in (v.get("statusCheckRollup") or []))
        rows.append(f"{v['number']}:{v.get('mergeStateStatus')}:{'/'.join(checks) or 'no-checks'}")
    print(f"{len(rows)}prs " + " ".join(rows))


MODES = {"main-head": main_head, "pr-board": pr_board}
mode = sys.argv[1] if len(sys.argv) > 1 else die(f"usage: {'|'.join(MODES)}")
MODES.get(mode, lambda: die(f"unknown-mode {mode}"))()
