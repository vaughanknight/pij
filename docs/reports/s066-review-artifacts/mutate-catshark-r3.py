#!/usr/bin/env python3
"""Round-3 Dim-0 spot-check on the REBASED tree (352b174): the N1 fix, the post-s069
modal seam, and the three R2 note closures — plus a regression re-check of the
critical round-2 kills. Restores every file from .bak."""
import os, shutil, subprocess, sys

ROOT = "/Users/jordanknight/pi-hacking/pij-worktrees/s066-session-revive"
os.chdir(ROOT)

R = ".pi/extensions/pij/core/revive.ts"
I = ".pi/extensions/pij/core/interstitial.ts"
F = ".pi/extensions/pij/adapters/fs-registry.ts"
X = ".pi/extensions/pij/cli.ts"
T = ".pi/extensions/pij/adapters/tmux.ts"
S = ".pi/extensions/pij/core/session.ts"
L = ".pi/extensions/pij/core/daemon/loop.ts"

REV = ".pi/extensions/pij/core/revive.test.ts"
INT = ".pi/extensions/pij/core/interstitial.test.ts"
FSR = ".pi/extensions/pij/adapters/fs-registry.test.ts"
IGR = ".pi/extensions/pij/cli.integration.test.ts"
TMX = ".pi/extensions/pij/adapters/tmux.test.ts"
SES = ".pi/extensions/pij/core/session.test.ts"
LOO = ".pi/extensions/pij/core/daemon/loop.test.ts"

MUTANTS = [
    # ── N1: the must-fix ──────────────────────────────────────────────────────
    ("N1a-reintroduce-prelaunch-sessionId", X,
     "\t\tdeadlineAt: spawnExpectationDeadline(requestedAt),\n\t});\n\tconst seatLabel",
     "\t\tdeadlineAt: spawnExpectationDeadline(requestedAt),\n\t\tsessionId: plan.value.id,\n\t});\n\tconst seatLabel",
     [IGR]),
    ("N1b-reintroduce-postlaunch-sessionId", X,
     "\texpectations.write({ ...expectation, paneId });\n\tif (plan.value.runtime !== \"pi\"",
     "\texpectations.write({ ...expectation, paneId, sessionId: plan.value.id });\n\tif (plan.value.runtime !== \"pi\"",
     [IGR]),
    # ── the post-s069 seam ────────────────────────────────────────────────────
    ("S1-modal-overrides-any-readiness", L,
     'readiness === "booting" && harnessVerdict.label === "session-in-use"',
     'harnessVerdict.label === "session-in-use"', [LOO, INT]),
    ("S2-modal-matches-any-answer-label", L,
     'readiness === "booting" && harnessVerdict.label === "session-in-use"',
     'readiness === "booting" && harnessVerdict.action === "answer"', [LOO, INT]),
    ("S3-single-shared-latch", L,
     "!answered.has(label)", "answered.size === 0", [LOO]),
    ("S4-no-latch-at-all", L,
     "verdict.action === \"answer\" && !answered.has(label)",
     'verdict.action === "answer"', [LOO]),
    ("S5-loose-modal-regex", I, "COPILOT_SESSION_IN_USE_RE.test(",
     r"/Session in use[\s\S]*1\. Resume anyway[\s\S]*2\. Go back/i.test(", [INT, LOO]),
    ("S6-drop-copilot-only-guard", I,
     'harness === "copilot" &&\n\t\tCOPILOT_SESSION_IN_USE_RE',
     'true &&\n\t\tCOPILOT_SESSION_IN_USE_RE', [INT, LOO]),
    ("S7-unanchor-folder-trust", I,
     "/^\\s*Do you trust the files in this folder\\?\\s*$/im",
     "/Do you trust|trust the files in/i", [INT, LOO]),
    ("S8-unanchor-login", I,
     "/^\\s*(?:Select login method:|Log in with (?:Claude account|API key))\\s*$/im",
     "/Select login method|Log in with|Sign in/i", [INT, LOO]),
    # ── R2 note closures ──────────────────────────────────────────────────────
    ("N-M15-split-title-no-rollback", T,
     'tmux(["select-pane", "-t", paneId, "-T", opts.title]);\n\t\t\t} catch (error) {\n\t\t\t\ttmuxSafe(["kill-pane", "-t", paneId]);',
     'tmux(["select-pane", "-t", paneId, "-T", opts.title]);\n\t\t\t} catch (error) {', [TMX]),
    ("N-M20-init-reframe-wiring", L, "descriptor.revivePendingAt !== undefined,", "false,", [LOO]),
    ("N-M22-runtimebin-persist", S, "runtimeBin: input.runtimeBin ?? existing?.runtimeBin,",
     "runtimeBin: existing?.runtimeBin,", [SES, IGR]),
    # ── regression re-check of the load-bearing round-2 kills ─────────────────
    ("G1-live-prior-refusal", R, "if (input.priorAttachmentAlive) {", "if (false) {", [REV, IGR]),
    ("G2-exactlyOne-ambig", R, "if (unique.length > 1) {", "if (false) {", [REV, IGR]),
    ("G3-write-resurrection-bypass", F,
     'descriptor.lifecycle !== "dissolved"\n\t\t) {\n\t\t\treturn;',
     'descriptor.lifecycle !== "dissolved" &&\n\t\t\tdescriptor.pid === existing.pid\n\t\t) {\n\t\t\treturn;',
     [FSR, SES, IGR]),
    ("G4-spawnfail-rollback", X,
     "expectations.remove(spawnId);\n\t\tprocess.stderr.write(`${spawned.code}",
     "process.stderr.write(`${spawned.code}", [IGR]),
    ("G5-persistfail-killpane", X,
     "tmux.killPane(paneId);\n\t\t\texpectations.remove(spawnId);",
     "expectations.remove(spawnId);", [IGR]),
]


def run(name, path, old, new, tests):
    src = open(path).read()
    n = src.count(old)
    if n != 1:
        print(f"== {name}: PATTERN-MISS (count={n})", flush=True)
        return
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


only = sys.argv[1:]
for m in MUTANTS:
    if only and not any(m[0].startswith(o) for o in only):
        continue
    run(*m)
print("== done", flush=True)
