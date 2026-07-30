#!/usr/bin/env python3
"""R4 spot-check: prove the fixture fix makes the revive tests pid-INDEPENDENT.

Each probe forces the fixture pid to a definitely-live pid (process.pid) and re-runs
the single test. A fixture that is genuinely pid-independent stays GREEN.
"""
import os, shutil, subprocess

ROOT = "/Users/jordanknight/pi-hacking/pij-worktrees/s066-session-revive"
os.chdir(ROOT)
F = ".pi/extensions/pij/cli.integration.test.ts"

PROBES = [
    ("A-spawn-failure(pid201,has terminal)", "\t\t\tpid: 201,", "\t\t\tpid: process.pid,",
     "cleans the expectation when revival pane launch fails"),
    ("B-registry-race(pid202,has terminal)", "\t\t\tpid: 202,", "\t\t\tpid: process.pid,",
     "kills the spawned pane and removes its expectation when tombstone replacement fails"),
    ("C-copilot-needs-human(pid204,has terminal)", "\t\t\tpid: 204,", "\t\t\tpid: process.pid,",
     "reports the interim Copilot session-in-use action instead of waiting silently"),
    ("D-missing-artifact(pid102,NO terminal)", "\t\t\tpid: 102,", "\t\t\tpid: process.pid,",
     "refuses a missing Copilot native artifact before tmux mutation"),
]

for name, old, new, test in PROBES:
    src = open(F).read()
    n = src.count(old)
    if n != 1:
        print(f"== {name}: PATTERN-MISS (count={n})", flush=True)
        continue
    shutil.copy(F, F + ".bak")
    try:
        open(F, "w").write(src.replace(old, new))
        p = subprocess.run(["npx", "vitest", "run", F, "-t", test],
                           capture_output=True, text=True)
        out = p.stdout + p.stderr
        line = next((l.strip() for l in out.splitlines() if l.strip().startswith("Tests ")), "?")
        failed = " failed" in line or p.returncode != 0
        verdict = "FAILS with a live pid → STILL HOST-DEPENDENT" if failed else "PASSES with a live pid → pid-independent"
        print(f"== {name}: {verdict} — {line}", flush=True)
    finally:
        shutil.move(F + ".bak", F)
print("== done", flush=True)
