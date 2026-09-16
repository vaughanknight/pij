#!/usr/bin/env python3
"""Reviewer mutation battery for plan 154."""
import pathlib, re, subprocess, sys, json

# WARNING: this script EDITS the working tree in place and restores it
# byte-for-byte when the run finishes. Run it on a throwaway detached
# worktree, never on a tree with uncommitted work.
ROOT = pathlib.Path(__file__).resolve().parents[4]

REG = ROOT / "crates/daemon/src/registration.rs"
REAP = ROOT / "crates/daemon/src/reaper_tests.rs"
REAPER = ROOT / "crates/daemon/src/reaper.rs"

LADDER = """            let continuous = (seat.harness == harness
                && seat
                    .harness_session
                    .as_ref()
                    .zip(harness_session.as_ref())
                    .is_some_and(|(old, claimed)| old == claimed))
                || seat
                    .spawn_id
                    .as_deref()
                    .zip(claim.spawn_id.as_deref())
                    .is_some_and(|(old, claimed)| !old.is_empty() && old == claimed)
                || seat.proc.is_some_and(|old| Some(old) == proc);"""

SESSION_RUNG = """(seat.harness == harness
                && seat
                    .harness_session
                    .as_ref()
                    .zip(harness_session.as_ref())
                    .is_some_and(|(old, claimed)| old == claimed))"""

SPAWN_RUNG = """seat
                    .spawn_id
                    .as_deref()
                    .zip(claim.spawn_id.as_deref())
                    .is_some_and(|(old, claimed)| !old.is_empty() && old == claimed)"""

PROC_RUNG = """seat.proc.is_some_and(|old| Some(old) == proc)"""

CLEAR = """        if resuming {
            descriptor.tombstoned_at = None;
            descriptor.tombstone_reason = None;
        }"""

REFUSAL = """            if !continuous {
                return Err(retired_refusal(seat));
            }"""

MUTANTS = {
    "M1-keep-tombstone-on-omp-only": [
        (REG, CLEAR, CLEAR.replace("if resuming {", "if resuming && harness != Harness::Omp {")),
    ],
    "M2-drop-harness-check-in-session-rung": [
        (REG, SESSION_RUNG, SESSION_RUNG.replace("(seat.harness == harness\n                && seat", "(seat")),
    ],
    "M3-drop-session-check-keep-harness": [
        (REG, SESSION_RUNG, "(seat.harness == harness)"),
    ],
    "M4-accept-any-spawn-id": [
        (REG, SPAWN_RUNG, "seat.spawn_id.is_some()"),
    ],
    "M5-pid-only-incarnation": [
        (REG, PROC_RUNG,
         "seat.proc.is_some_and(|old| proc.is_some_and(|new| old.pid == new.pid))"),
    ],
    "M6-no-refusal-silent-rewrite": [
        (REG, REFUSAL, "            let _ = continuous;"),
    ],
    "M7-sweep-fixture-non-overlapping": [
        (REAP, "if self.old_observations.fetch_add(1, Ordering::SeqCst) == 1 {",
               "if self.old_observations.fetch_add(1, Ordering::SeqCst) == 999 {"),
    ],
    "M8-sweep-drop-cas": [
        (REAPER, ".tombstone_if_unchanged(expected, tombstone_reason.unwrap_or(reason).to_string())",
                 ".tombstone(&expected.id, &tombstone_reason.unwrap_or(reason).to_string())"),
    ],
}


def run():
    cmd = ["/Users/jordanknight/.cargo/bin/cargo", "test", "-p", "pij-daemon", "--lib",
           "--", "--test-threads", "1"]
    env = {"CARGO_TARGET_DIR": str(ROOT / "target"),
           "PATH": "/Users/jordanknight/.cargo/bin:/usr/bin:/bin:/usr/sbin:/sbin",
           "HOME": "/Users/jordanknight", "RUST_TEST_THREADS": "1"}
    p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, env=env)
    out = p.stdout + p.stderr
    failed = sorted(set(re.findall(r"^test (\S+) \.\.\. FAILED", out, re.M)))
    summary = re.findall(r"^test result: .*$", out, re.M)
    compiled = "test result" in out
    return {"exit": p.returncode, "compiled": compiled, "failed": failed,
            "summary": summary, "tail": "" if compiled else out[-1200:]}


def main():
    for name in (sys.argv[1:] or list(MUTANTS)):
        edits = MUTANTS[name]
        saved = {}
        ok = True
        for path, old, new in edits:
            saved.setdefault(path, path.read_text())
            text = path.read_text()
            if old not in text:
                print(json.dumps({"mutant": name, "ERROR": f"anchor missing in {path.name}"}))
                ok = False
                break
            path.write_text(text.replace(old, new, 1))
        if ok:
            print(json.dumps({"mutant": name, **run()}, indent=1), flush=True)
        for path, text in saved.items():
            path.write_text(text)


main()
