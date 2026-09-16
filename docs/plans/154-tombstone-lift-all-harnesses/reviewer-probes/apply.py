#!/usr/bin/env python3
"""Apply reviewer probes (and optionally the totality assertions) to the probe
worktree, run them, then restore the tree byte-for-byte."""
import pathlib, subprocess, sys, re

# WARNING: this script EDITS the working tree in place and restores it
# byte-for-byte when the run finishes. Run it on a throwaway detached
# worktree, never on a tree with uncommitted work.
ROOT = pathlib.Path(__file__).resolve().parents[4]

REG = ROOT / "crates/daemon/src/registration.rs"
PROBES = pathlib.Path(__file__).resolve().parent / "probes.rs"

PANELESS_OK = """                descriptor.role = role;
                return Ok((
                    descriptor,
                    PutBinding {
                        inserted: false,
                        previous_proc: proc,
                    },
                ));"""
PANELESS_OK_ASSERT = """                descriptor.role = role;
                assert!(
                    descriptor.tombstoned_at.is_none(),
                    "INVARIANT VIOLATED at the paneless early Ok exit: {descriptor:?}"
                );
                return Ok((
                    descriptor,
                    PutBinding {
                        inserted: false,
                        previous_proc: proc,
                    },
                ));"""
FINAL_OK = """        Ok((descriptor, binding))
    }
}"""
FINAL_OK_ASSERT = """        assert!(
            descriptor.tombstoned_at.is_none(),
            "INVARIANT VIOLATED at the main Ok exit: {descriptor:?}"
        );
        Ok((descriptor, binding))
    }
}"""


def apply_probes(text):
    body = PROBES.read_text()
    body = body[body.index("    // Bar 2"):]
    marker = "    #[tokio::test]\n    async fn successful_registration_never_returns_a_tombstone()"
    return text.replace(marker, body + "\n" + marker, 1)


def run(filter_expr, nocapture=True):
    cmd = ["/Users/jordanknight/.cargo/bin/cargo", "test", "-p", "pij-daemon", "--lib"]
    if filter_expr:
        cmd.append(filter_expr)
    cmd += ["--", "--test-threads", "1"]
    if nocapture:
        cmd.append("--nocapture")
    env = {"CARGO_TARGET_DIR": str(ROOT / "target"),
           "PATH": "/Users/jordanknight/.cargo/bin:/usr/bin:/bin:/usr/sbin:/sbin",
           "HOME": "/Users/jordanknight"}
    p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, env=env)
    return p.returncode, p.stdout + p.stderr


mode = sys.argv[1]
original = REG.read_text()
try:
    text = original
    if mode in ("probes", "both"):
        text = apply_probes(text)
    if mode in ("totality", "both"):
        assert PANELESS_OK in text and FINAL_OK in text, "totality anchors missing"
        text = text.replace(PANELESS_OK, PANELESS_OK_ASSERT, 1)
        text = text.replace(FINAL_OK, FINAL_OK_ASSERT, 1)
    REG.write_text(text)
    filt = sys.argv[2] if len(sys.argv) > 2 else None
    code, out = run(filt, nocapture=(mode != "totality"))
    if mode == "totality":
        print("EXIT", code)
        print("\n".join(re.findall(r"^test result: .*$|^test (\S+) \.\.\. FAILED$|INVARIANT VIOLATED.*", out, re.M)) or out[-1500:])
    else:
        print("EXIT", code)
        print("\n".join(l for l in out.splitlines()
                        if l.startswith("PROBE") or l.startswith("test result")
                        or "reviewer_probe" in l or "panicked" in l or "assertion" in l
                        or "PROBE RESULT" in l or l.startswith("error"))[:6000])
finally:
    REG.write_text(original)
