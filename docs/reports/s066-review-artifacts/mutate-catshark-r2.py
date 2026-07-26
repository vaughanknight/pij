#!/usr/bin/env python3
"""Independent Dim-0 re-run for s066 session-revive (round 2).

Each mutant: patch a single unique source site -> run targeted tests -> expect RED.
The file is always restored from a .bak copy, even on failure.
"""
import os, shutil, subprocess, sys

ROOT = "/Users/jordanknight/pi-hacking/pij-worktrees/s066-session-revive"
os.chdir(ROOT)

R = ".pi/extensions/pij/core/revive.ts"
I = ".pi/extensions/pij/core/interstitial.ts"
F = ".pi/extensions/pij/adapters/fs-registry.ts"
C = ".pi/extensions/pij/core/cli.ts"
X = ".pi/extensions/pij/cli.ts"
T = ".pi/extensions/pij/adapters/tmux.ts"
S = ".pi/extensions/pij/core/session.ts"
L = ".pi/extensions/pij/core/daemon/loop.ts"

REV = ".pi/extensions/pij/core/revive.test.ts"
INT = ".pi/extensions/pij/core/interstitial.test.ts"
FSR = ".pi/extensions/pij/adapters/fs-registry.test.ts"
CLI = ".pi/extensions/pij/core/cli.test.ts"
IGR = ".pi/extensions/pij/cli.integration.test.ts"
TMX = ".pi/extensions/pij/adapters/tmux.test.ts"
SES = ".pi/extensions/pij/core/session.test.ts"
LOO = ".pi/extensions/pij/core/daemon/loop.test.ts"

MUTANTS = [
    # (name, file, old, new, [test files])
    ("M1-live-prior-refusal", R, "if (input.priorAttachmentAlive) {", "if (false) {", [REV, IGR]),
    ("M2-eligibility-gate", R, "input.priorAttachmentAlive !== false", "false", [REV, IGR]),
    ("M3-copilot-only-guard", I, 'harness === "copilot" &&\n\t\tCOPILOT_SESSION_IN_USE_RE',
     'true &&\n\t\tCOPILOT_SESSION_IN_USE_RE', [INT, LOO]),
    ("M4-tail-only", I, "COPILOT_SESSION_IN_USE_RE.test(paneText.slice(-COPILOT_SESSION_IN_USE_TAIL_CHARS))",
     "COPILOT_SESSION_IN_USE_RE.test(paneText)", [INT, LOO]),
    ("M5-loose-regex", I, "COPILOT_SESSION_IN_USE_RE.test(",
     r"/Session in use[\s\S]*1\. Resume anyway[\s\S]*2\. Go back/i.test(", [INT, LOO]),
    ("M6-phonehome-lifecycle", C, '(d.lifecycle === "pending" || d.lifecycle === undefined)', "true", [CLI]),
    ("M7-exactlyOne-ambig", R, "if (unique.length > 1) {", "if (false) {", [REV, IGR]),
    ("M8-revive-harness-half", F, "existing.harness !== descriptor.harness ||", "false ||", [FSR, SES]),
    ("M9-revive-nativeid-half", F, "existing.harnessSessionId !== descriptor.harnessSessionId",
     "false", [FSR, SES]),
    ("M10-write-resurrection-bypass", F,
     'descriptor.lifecycle !== "dissolved"\n\t\t) {\n\t\t\treturn;',
     'descriptor.lifecycle !== "dissolved" &&\n\t\t\tdescriptor.pid === existing.pid\n\t\t) {\n\t\t\treturn;',
     [FSR, SES, IGR]),
    ("M11-spawnfail-no-expectation-rollback", X,
     "expectations.remove(spawnId);\n\t\tprocess.stderr.write(`${spawned.code}",
     "process.stderr.write(`${spawned.code}", [IGR]),
    ("M12-persistfail-no-killpane", X,
     "tmux.killPane(paneId);\n\t\t\texpectations.remove(spawnId);",
     "expectations.remove(spawnId);", [IGR]),
    ("M13-persistfail-no-expectation-rollback", X,
     "expectations.remove(spawnId);\n\t\t\tprocess.stderr.write(`${persisted.code}",
     "process.stderr.write(`${persisted.code}", [IGR]),
    ("M14-tmux-title-newwindow-no-rollback", T,
     'tmuxSafe(["kill-pane", "-t", parsed.paneId]);\n', "", [TMX]),
    ("M15-tmux-title-split-no-rollback", T,
     'tmuxSafe(["kill-pane", "-t", paneId]);\n', "", [TMX]),
    ("M16-no-prebound-sessionid", X, "sessionId: plan.value.id,\n\t};", "};", [IGR]),
    ("M17-close-no-expectation-intent", X,
     "if (expectation) expectations.write(requestClose(expectation, closeIntent));",
     "void expectation;", [IGR]),
    ("M18-pi-reframe-conditional", S,
     'this.ports.pi.inject(task ?? announceText(input.id, descriptor.role), "immediate");',
     'this.ports.pi.inject(announceText(input.id, descriptor.role), "immediate");', [SES, IGR]),
    ("M19-no-reviver-routing", R,
     "? { spawnedBy: attachment.reviverId, parentId: attachment.reviverId }",
     "? { spawnedBy: undefined, parentId: undefined }", [REV, IGR]),
    ("M20-init-reframe-flag", L, "descriptor.revivePendingAt !== undefined,", "false,", [LOO]),
    ("M21-planned-native-id", R, "plannedHarnessSessionId: existing.harnessSessionId,",
     "plannedHarnessSessionId: undefined,", [REV, IGR]),
    ("M22-no-runtimebin-persist", S, "runtimeBin: input.runtimeBin ?? existing?.runtimeBin,",
     "runtimeBin: existing?.runtimeBin,", [SES, IGR]),
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
    if only and m[0].split("-")[0] not in only:
        continue
    run(*m)
print("== done", flush=True)
