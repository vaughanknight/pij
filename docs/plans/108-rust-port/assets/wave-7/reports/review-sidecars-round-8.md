# Round 8 — composed head verified; the per-pid fallback is unwitnessed

`pij-favourite-araminta`. Two heads: the composed `76c35f8f` (lock present) and
the coder's `2979c670` (getpgid ownership recheck).

## Composed head `76c35f8f` — fully verified

Run by my own harness, which now aborts on a dirty tree and fails loudly when a
filter matches nothing (both guards added after the failures in round 7):

```
HEAD: 76c35f8f    TREE: 0 modified    nix in Cargo.lock: 1

[1/4] GATE, WITH --locked        pij-gate: all stages green
                                 binaries: 53   passed: 360
[2/4] SIX WORKSPACE RUNS         cancel witness ok in 6/6
[3/4] ERRNO CONTRACT TESTS       4 passed, 0 failed
[4/4] M6 escalation mutation     FAILED, as required:
      "timed out waiting for process group 89039; surviving pids: [89039, 89041]"
      restored: 0 modified
```

`--locked` now runs, which was the whole point of the three typed derived
commits. The M6 mutation still reproduces the original signature, so the witness
still defends *that* defect at this head rather than an adjacent one.

## The getpgid brake at `2979c670` — correct

```rust
if !matches!(getpgid(Some(pid)), Ok(group) if group == owned_group) {
    continue;
}
```

Exactly the ruled shape: any error (`ESRCH`, `EPERM`) and any mismatch are
non-failing skips; only an exact match proceeds to `SIGKILL`. One-directional —
remove it and the code kills strictly more, never something different. Third
brake in this unit, and the comment names the residue-vs-state reasoning that
earned it.

`Cargo.lock` is unchanged by the added `process` feature (features are not
locked), so `--locked` is satisfiable here pre-composition — unlike `0f252a86`.

## Finding — nothing witnesses the per-pid fallback KILLING anything · MED

**Mutation M7.** Made `signal_survivors` a no-op — it now skips every pid
unconditionally, so the per-pid fallback kills nothing, ever:

```rust
if true { continue; }   // M7: the per-pid fallback never kills anything
```

```
cargo test --locked -p pij-sidecars
test result: ok. 5 passed; 0 failed
test result: ok. 9 passed; 0 failed
```

**The entire suite stays green.** Restored, tree clean.

So the fallback's kill path is unproven. Two reasons it slips through:

* `survivor_recheck_skips_a_pid_outside_the_owned_group` exercises only the
  **skip** path. It asserts a stranger and the owned group are both spared —
  which is exactly what a permanently-skipping implementation does. It passes
  when the mechanism is deleted.
* The cancel witness cannot distinguish, because its fixture dies to
  `signal_group(pgid, SIGKILL)`; the per-pid pass is redundant there.

This is E-027 in its own words — *a witness must ACTIVATE the mechanism it
mutates* — and it lands on the one path that exists **because** the group kill
sometimes does not finish the job on macOS. The code reads correct and I believe
it; what I cannot say is that anything would notice if it stopped working.

**The honest witness is the mirror of the test that exists:** call
`signal_survivors(pgid, &[live_pid_in_that_group])` directly and assert the pid
dies. Deterministic, three lines, and it converts a permanently-skipping
implementation from green to red. The skip test proves the veto; its mirror
proves the kill.

Filed **MED**, not HIGH: no defect demonstrated, and the brake half is genuinely
verified. It is the coverage claim I am refusing, not the code.

## Standing

* Composed `76c35f8f`: **verified green** with `--locked`, 6/6 under load, M6
  intact.
* `2979c670`: brake correct; **one witness missing**.
* Code verdict: **APPROVE** holds.
* Open: this witness, and the prime's F10 egress ruling.
