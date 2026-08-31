# Round 7 — the errno rewrite at `0f252a86` (pre-composition)

`pij-favourite-araminta`. The last open item in the plan. This head cannot run the
ruled gate, for a fence reason rather than a defect — so this records what
verification **is** valid before composition, and what is not.

## The gate cannot start here, and that is expected

```
$ cargo run --locked -p pij-testkit --bin pij-gate
error: cannot update the lock file … because --locked was passed to prevent this

grep -c '^name = "nix"' Cargo.lock  →  0
crates/sidecars/Cargo.toml:12       →  nix = { version = "0.30", default-features = false, features = ["signal"] }
git show --stat 0f252a86            →  Cargo.toml + background.rs only
```

`Cargo.lock`, the `nix` allowlist row, and the arch fixtures are **composer-owned**;
the packet forbids the coder committing them. So `--locked` is unsatisfiable at
this head by construction, and the coder's `20/20` / `13/13` were necessarily run
without it.

Recorded rather than waved through, because `testkit/lockfile.rs` states the
cost first-party — *"a fresh `--locked` checkout cannot compile at all … the next
person's `--locked` checkout still fails"* — and I was the next person. The
condition is temporary and owned; the **claim** "gate green at this head" is not
available to anyone until composition regenerates the lock.

## What IS valid pre-composition — verified offline

`cargo test --offline -p pij-sidecars`: **4 unit + 9 integration tests pass**, cancel
witness green.

The two errno contract tests pin the **numbers**, and they match the ground truth
I measured independently in `probe-zombie-contract.py` (EPERM=1, ESRCH=3):

| test | asserts |
|---|---|
| `dead_group_errno_proves_absence` | `probe_group_errno as i32 == Some(3)`; `group_absent_fast` true |
| `zombie_only_eperm_proves_nothing_and_kill_escalation_is_tolerated` | `as i32 == Some(1)`; `!group_absent_fast`; SIGKILL tolerated; reap gives code 7; post-reap `Some(3)` |

The second is `#[cfg(target_os = "macos")]` — honest about the platform the
behaviour was measured on, rather than asserting a portable claim nobody ran.

**The prose branches are gone.** `grep` for `No such process` / `Operation not
permitted` / `stderr.contains` in `background.rs` returns nothing. `signal_group`
now matches typed variants:

```rust
Err(Errno::ESRCH | Errno::EPERM) if tolerate_no_target => Ok(()),
```

`nix` is narrow: `default-features = false, features = ["signal"]`.

The brake stayed one-directional, which was the part most at risk of being lost
in translation to numbers: `group_absent_fast` converges only on ESRCH, and every
other errno falls through to the zombie-excluding scan.

## New finding — per-pid SIGKILL has no group re-check · LOW

`signal_survivors` (`background.rs:512-527`) kills each pid individually:

```rust
for survivor in survivors {
    match kill(Pid::from_raw(*survivor as i32), Some(Signal::SIGKILL)) { … }
}
```

`survivors` comes from the `ps` scan at `:320`. Between that scan and the `kill`,
a pid can exit and be recycled — and the SIGKILL then lands on an unrelated
process. The in-code comment says *"every pid here was observed live in the owned
group"*, which is true **at scan time**: the same residue-vs-state distinction
this unit already fixed twice elsewhere.

Group signalling had this property for free, because the pgid is our own leader's
pid and cannot be recycled while we hold the record. Per-pid loses that guarantee,
so the fallback is the one destructive path in the unit with no ownership
interlock — after F6 added two.

**One syscall closes it:** `getpgid(pid) != pgid → skip`. `nix`'s `process`
feature provides it; the coder has escalated the feature addition.

Filed **LOW** deliberately: the window is ~10–100 ms and exploitation needs pid
wraparound. **I did not reproduce it**, and I am not inflating a hazard I have not
observed — the same standard I applied to F6 when I held it at MED for the same
reason.

## My ninth instrument error

My background wrapper grepped for gate stage lines, so the hard lock failure
matched nothing and the runner reported **"OK — 5s"** for a gate plus six
workspace runs. Five seconds is impossible; that impossibility is the only reason
I looked.

A filter that keeps the frame and drops the payload — the same family as round 5,
and this time it nearly converted a blocking finding into *"the gate produced no
output"*. The lesson I keep re-learning in this review: **when a filtered command
reports success, check the shape of the success, not just its presence.** A
duration that cannot be true is evidence; so is an empty section that should have
had content.

## Standing

* Code: **APPROVE** holds; the errno rewrite is correct and its contract is pinned
  numerically.
* Outstanding, composer-owned: regenerate `Cargo.lock`, add the `nix` allowlist
  row, regenerate the arch fixtures.
* Outstanding, escalated: the `getpgid` brake for the LOW per-pid window.
* On composition I re-run the six-run workspace stress, mutation M6, the zombie
  contract, and the two errno tests against the composed head — with `--locked`,
  which is the point.
