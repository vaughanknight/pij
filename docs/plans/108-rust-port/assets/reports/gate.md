# tk-81b3 — the one-command gate, and the assert that outranks it

**Seat**: pij-revolutionary-lungfish (PM) · 2026-08-28 ·
**Toolchain**: rustc 1.98.0 (88d9e12ae) / cargo 1.98.0 (797e8a9bc) · Avail 200Gi

## The gate (ac-0007)

```
$ CARGO_INCREMENTAL=0 cargo run -p pij-testkit --bin pij-gate

pij-gate verdict
  toolchain PASS  rustc 1.98.0 == pin
  fmt       PASS  cargo fmt
  clippy    PASS  cargo clippy
  test      PASS  cargo test
  arch      PASS  8 crates, 0 violations

pij-gate: all stages green
```

It runs **every** stage even after one fails, then prints the per-stage verdict:
an agent that must re-run a gate five times to find five problems has been given a
worse instrument than one that answers in a single pass. Exit code is still the
answer.

Two defects surfaced on the gate's own first run, which is the argument for
building it rather than composing the commands by hand:

* `rust-toolchain.toml is not valid TOML ... line 1, column 1` against a file that
  is perfectly valid. Cause: toml 0.9's `FromStr` on `Value` parses a *value*, not
  a document, so the leading comment is "unexpected content". `toml::from_str`
  fixes it. Worth recording because the error accuses the FILE.
* `fmt FAIL` on files I had built but not formatted — the gate catching its own
  author within a minute of existing.

## dw-a803 — the toolchain assert, negative-tested (carried from tk-48f2)

Recorded as OUTSTANDING at tk-48f2 because the gate did not exist yet. It exists
now, and the first attempt at proving it was **wrong**:

```
=== ATTEMPT 1 (wrong test, kept for the record): mutate the pin ===
Result: toolchain PASS — "rustc 1.95.0 == pin".
Why: rustup HONORS the file, so changing the pin changes the compiler too. The
assert compared the pin against a compiler chosen BY that pin — a tautology.
The mutation was of the wrong variable.

=== ATTEMPT 2 (the real hazard): a cargo that is NOT a rustup shim ===
$ CARGO=/opt/homebrew/bin/cargo cargo run -q -p pij-testkit --bin pij-gate
pij-gate: /Users/jordanknight/pi-hacking/pij-worktrees/s108-rust-port · cargo /opt/homebrew/bin/cargo
  toolchain FAIL  toolchain mismatch: rust-toolchain.toml pins 1.98.0, but this gate is running rustc 1.95.0.
pij-gate: 2 stage(s) failed — toolchain, test. The task is not done.
exit=0
```

The lesson is worth more than the proof. **Mutating the pin does not test the
assert**, because rustup honours the pin: change the file and the compiler changes
with it, so the assert compares the pin against a compiler chosen *by* that pin
and can never fail. It is a tautology, and it would have been recorded as a
passing negative test.

The real hazard is a cargo that is **not** a rustup shim — which is what
R6a-AMEND-1 is about — and against that the assert fires exactly as designed,
naming both versions and the fix. Note the second failing stage: under the
shadowing 1.95.0 toolchain `test` also fails, so the machine that would silently
run the wrong compiler cannot even build this tree. Both facts belong in the
record.

(The `exit=0` in that transcript is `grep`'s status, not the gate's; the gate
reported "2 stage(s) failed" and exits non-zero — stated because an unexplained
`exit=0` under a FAIL line is exactly the kind of contradiction a reader should
not have to reconcile alone.)

## Docs (ac-0008, per the prime's Q3 relocation)

* `crates/README.md` — quick start: the PATH prerequisite, build/test/gate, run
  the daemon and ping it, the crate table, and the six shapes a later unit copies.
* `docs/plans/108-rust-port/assets/architecture.md` — the map: the seven ports and
  the stop-and-ask rule, the rules a later unit inherits, the five test tiers and
  what only each can catch, **the things that are true because they went wrong
  once**, the forward-compat asymmetry, and the shared-merge file list (R6e).

Promotion to `docs/rules-idioms-architecture/` and any root-README mention stay
outside this plan's fence — a named follow-up the prime owns.

## Shared-merge files, named (R6e / DL-007)

`Cargo.toml` (root) · `crates/<name>/Cargo.toml` · `arch-allowlist.toml` ·
`testkit/src/lib.rs` · `core/src/lib.rs` · `fixtures/MANIFEST.toml` ·
`store/migrations/` (a NEW file, never an edit). Everything else is crate-disjoint;
if two units want the same file for more than one line, the split is wrong.
