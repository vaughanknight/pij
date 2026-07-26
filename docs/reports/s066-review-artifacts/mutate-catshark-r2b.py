#!/usr/bin/env python3
"""Follow-ups: M15 with a unique anchor, and M20 re-run against the FULL focused suite."""
import os, shutil, subprocess

ROOT = "/Users/jordanknight/pi-hacking/pij-worktrees/s066-session-revive"
os.chdir(ROOT)

FULL = [
    ".pi/extensions/pij/core/revive.test.ts",
    ".pi/extensions/pij/core/seat-label.test.ts",
    ".pi/extensions/pij/cli.integration.test.ts",
    ".pi/extensions/pij/adapters/fs-registry.test.ts",
    ".pi/extensions/pij/adapters/tmux.test.ts",
    ".pi/extensions/pij/core/cli.test.ts",
    ".pi/extensions/pij/core/interstitial.test.ts",
    ".pi/extensions/pij/core/daemon/loop.test.ts",
    ".pi/extensions/pij/core/session.test.ts",
    ".pi/extensions/pij/core/spawn.test.ts",
    ".pi/extensions/pij/core/harness/claude.test.ts",
    ".pi/extensions/pij/index.test.ts",
]

MUTANTS = [
    ("M15-tmux-title-split-no-rollback", ".pi/extensions/pij/adapters/tmux.ts",
     'tmux(["select-pane", "-t", paneId, "-T", opts.title]);\n\t\t\t} catch (error) {\n\t\t\t\ttmuxSafe(["kill-pane", "-t", paneId]);',
     'tmux(["select-pane", "-t", paneId, "-T", opts.title]);\n\t\t\t} catch (error) {',
     [".pi/extensions/pij/adapters/tmux.test.ts"]),
    ("M20-init-reframe-flag-FULLSUITE", ".pi/extensions/pij/core/daemon/loop.ts",
     "descriptor.revivePendingAt !== undefined,", "false,", FULL),
]

for name, path, old, new, tests in MUTANTS:
    src = open(path).read()
    n = src.count(old)
    if n != 1:
        print(f"== {name}: PATTERN-MISS (count={n})", flush=True)
        continue
    shutil.copy(path, path + ".bak")
    try:
        open(path, "w").write(src.replace(old, new))
        p = subprocess.run(["npx", "vitest", "run", *tests], capture_output=True, text=True)
        out = p.stdout + p.stderr
        line = next((l.strip() for l in out.splitlines() if l.strip().startswith("Tests ")), "?")
        killed = " failed" in line or p.returncode != 0
        print(f"== {name}: {'RED (killed)' if killed else 'GREEN (SURVIVED)'} — {line}", flush=True)
    finally:
        shutil.move(path + ".bak", path)
print("== done", flush=True)
