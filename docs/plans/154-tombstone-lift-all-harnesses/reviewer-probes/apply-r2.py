#!/usr/bin/env python3
"""Round 2 probe/mutant driver for plan 154 (reviewer pij-hot-alligator).

WARNING: edits crates/daemon/src/registration.rs IN PLACE and restores it
byte-for-byte in a finally block. Run it only on a throwaway detached worktree,
never on a checkout with work you care about.

Modes: mutants | probes | totality | totality-control
"""
import pathlib, subprocess, sys, os

ROOT = pathlib.Path(__file__).resolve().parents[4]
REG = ROOT / "crates/daemon/src/registration.rs"
PROBES = pathlib.Path(__file__).resolve().parent / "probes-r2.rs"
ENV = {**os.environ, "CARGO_TARGET_DIR": str(ROOT / "target"),
       "PATH": os.path.expanduser("~/.cargo/bin") + ":" + os.environ["PATH"]}

# --- mutants ------------------------------------------------------------
HARNESS_GATE = """        if let Some(seat) = existing
            .filter(|seat| seat.tombstoned_at.is_some() && seat.harness.as_str() != claim.harness)
        {
            // Harness identity gates every continuity rung, including native
            // and paneless claims, before their stronger ownership checks.
            return Err(retired_refusal(seat, &claim.harness));
        }
"""
HARNESS_KEEP = """        if !resuming {
            descriptor.harness = harness;
        }"""
NATIVE_EVENT = "        if !native && let Some(previous) = retired {"
CONTINUITY = """        let retired = existing.filter(|seat| seat.tombstoned_at.is_some());
        if let Some(seat) = retired {"""

PRE_FIX_PANELESS = """    let identity = identity.expect("validated external host identity");
    let mut target = None;
    for seat in seats.iter().filter(|seat| seat.tombstoned_at.is_none()) {
        let same_session = seat.harness.as_str() == claim.harness
            && seat.harness_session.as_deref() == Some(session);
        let same_pid = seat.proc.is_some_and(|proc| proc.pid == identity.pid);
        if !same_session && !same_pid {
            continue;
        }
        if !same_session
            || seat.proc != Some(identity)
            || seat.pane.is_some()
            || seat.relay
            || seat.native_extension_delivery
            || seat.spawn_id.is_some()
        {
            return Err(paneless_refusal(format!(
                "host process or native session conflicts with seat `{}`",
                seat.id
            )));
        }
        if target.replace(seat).is_some() {
            return Err(paneless_refusal(
                "native session has multiple Pij addresses",
            ));
        }
    }
"""


def new_paneless_prefix(text: str) -> str:
    start = text.index('    let identity = identity.expect("validated external host identity");')
    end = text.index("    if let Some(target) = target {", start)
    return text[start:end]


MUTANTS = {
    # F002: delete the harness gate that fronts every rung
    "M-r2-harness-gate": lambda t: t.replace(HARNESS_GATE, "", 1),
    # F002: restore the unconditional harness rewrite on a lift
    "M-r2-harness-rewrite": lambda t: t.replace(HARNESS_KEEP, "        descriptor.harness = harness;", 1),
    # F003 / ladder: delete the continuity block entirely
    "M-r2-continuity-deleted": lambda t: t.replace(
        CONTINUITY,
        "        let retired = existing.filter(|seat| seat.tombstoned_at.is_some());\n        if let Some(seat) = retired.filter(|_| false) {",
        1),
    # minor 2: let a native resume also emit seat.resumed
    "M-r2-double-event": lambda t: t.replace(NATIVE_EVENT, "        if let Some(previous) = retired {", 1),
    # F001: restore the pre-fix paneless_target body
    "M-r2-prefix-paneless": lambda t: t.replace(new_paneless_prefix(t), PRE_FIX_PANELESS, 1),
}

ASSERT_PANELESS_OK = """                descriptor.role = role;
                return Ok(("""
ASSERT_FINAL = """        Ok((descriptor, binding))
    }
}"""


def with_totality(text: str) -> str:
    a = text.replace(
        ASSERT_PANELESS_OK,
        """                descriptor.role = role;
                assert!(
                    descriptor.tombstoned_at.is_none(),
                    "INVARIANT VIOLATED at the paneless Ok exit: {descriptor:?}"
                );
                return Ok((""",
        1)
    assert a != text, "paneless anchor missing"
    b = a.replace(ASSERT_FINAL, """        assert!(
            descriptor.tombstoned_at.is_none(),
            "INVARIANT VIOLATED at the main Ok exit: {descriptor:?}"
        );
""" + ASSERT_FINAL, 1)
    assert b != a, "final anchor missing"
    return b


def run(args, label):
    p = subprocess.run(["cargo", "test", "-p", "pij-daemon", "--lib", *args],
                       cwd=ROOT, env=ENV, capture_output=True, text=True)
    out = p.stdout + p.stderr
    fails = [l.strip() for l in out.splitlines() if l.strip().startswith("test ") and "FAILED" in l]
    result = [l for l in out.splitlines() if l.startswith("test result")]
    print(f"--- {label}: exit {p.returncode}")
    for l in result:
        print("   ", l.strip())
    for l in sorted(set(fails)):
        print("    RED", l)
    probes = [l for l in out.splitlines() if l.startswith("PROBE ")]
    for l in probes:
        print("   ", l)
    inv = [l for l in out.splitlines() if "INVARIANT VIOLATED" in l]
    for l in inv[:2]:
        print("   ", l[:200])
    return p.returncode


def main():
    mode = sys.argv[1]
    original = REG.read_text()
    try:
        if mode == "probes":
            text = original.rstrip()
            assert text.endswith("}")
            REG.write_text(text[:-1] + "\n" + PROBES.read_text() + "}\n")
            run(["reviewer_r2", "--", "--nocapture", "--test-threads", "1"], "round-2 probes")
        elif mode == "totality":
            REG.write_text(with_totality(original))
            run(["--", "--test-threads", "1"], "P1 totality (all 419)")
        elif mode == "totality-control":
            t = with_totality(original)
            t = t.replace("""        if resuming {
            descriptor.tombstoned_at = None;
            descriptor.tombstone_reason = None;
        }""", """        if resuming && harness != Harness::Omp {
            descriptor.tombstoned_at = None;
            descriptor.tombstone_reason = None;
        }""", 1)
            REG.write_text(t)
            run(["successful_registration_never_returns_a_tombstone", "--", "--test-threads", "1"],
                "P1 negative control")
        elif mode == "mutants":
            for name, mutate in MUTANTS.items():
                mutated = mutate(original)
                assert mutated != original, f"{name}: anchor missing"
                REG.write_text(mutated)
                run(["--", "--test-threads", "1"], name)
                REG.write_text(original)
        else:
            raise SystemExit(f"unknown mode {mode}")
    finally:
        REG.write_text(original)
        print("restored:", REG.read_text() == original)


main()
