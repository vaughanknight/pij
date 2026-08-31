# Round 6 — the cancel fix verified at `83f6d041`

`pij-favourite-araminta`. Verifies the timeout fix and raises one accepted
finding against it (errno vs prose, now ruled).

## Stress — the red is gone

Gate cold in a fresh target dir (`/tmp/araminta-gate-83f6d041`), then six full
workspace runs:

```
pij-gate: all stages green
workspace runs 1-6: bg_cancel_observes… ok   (9 passed, 0 failed, each run)
```

**6/6.** Before the fix I saw 2 failures in 8 runs between the PM and me. The
convergence now runs at 100 ms with a one-directional ESRCH fast path, so the
instrument no longer competes with the processes it waits for.

## The escalation is genuinely load-bearing — mutation M6

The witness only means something if it fails without the fix. Disabled the
escalation (`if false && !escalated && now >= grace`), anchor-asserted:

```
bg_cancel_observes_the_full_process_group_dead_before_cancelled_receipt ... FAILED
cancel: Adapter { adapter: "sidecars/bg",
  message: "timed out waiting for process group 25210; surviving pids: [25210, 25212]" }
```

Restored, tree clean.

Two things that matters for, beyond "the test can fail":

1. **It reproduces the original signature exactly** — the same timeout, naming
   survivors. So this witness defends *this* defect, not an adjacent one.
2. **It is the message I could not capture in round 5.** I reported an
   unexplained red there because my own `grep` dropped the payload twice. The
   mutation produced it on demand. A defect that can be re-created deliberately
   is worth more than one observed once — and I could have had it two rounds
   earlier by mutating instead of re-running.

## Finding — the fix branches on prose (accepted, ruled to errno)

```rust
:518  Ok(stderr.contains("No such process"))
:492  tolerate_no_target && (stderr.contains("No such process")
                             || stderr.contains("Operation not permitted"))
```

Measured on this machine, the logic is **correct**:

```
zombie-only group   /bin/kill -0 -PG     rc=1  "kill: -9148: Operation not permitted"
                    /bin/kill -KILL -PG  rc=1  "kill: -9148: Operation not permitted"
after reap          both                 rc=1  "kill: -9148: No such process"
```

But the two sites differ in kind, and only one is dangerous:

| site | shape | consequence of a non-match |
|---|---|---|
| `:518` `group_absent_fast` | **brake** | returns false, costs one `ps` scan — slower, never wronger |
| `:492` `signal_group` tolerate | **policy** | KILL escalation returns `Err`, `await_group_exit` fails, cancel reports failure for a group already dead |

The policy site fires on **exactly the zombie-only path this fix exists for**, and
nothing pins either string — no test in `crates/` asserts them. Code depends on
`/bin/kill`'s wording; no instrument compares the two (COMMON 1.10).

`LC_ALL=C` is a real mitigation and I counted it: it pins the **locale**, not the
**wording**. I measured BSD `/bin/kill` only and did not claim a Linux break I had
not run — so the exposure is *unquantified*, not absent, which is the worse of the
two for a silent policy.

**Ruled:** both sites move to `nix`'s `killpg`/`Errno` and branch on the number.
`ESRCH = 3` cannot be reworded by a vendor, a locale, or another implementation.
The brake stays one-directional — ESRCH proves absence; any other errno proves
nothing and falls through to the zombie-excluding scan. The timeout message keeps
naming survivors: that string is **output, not control flow**.

I did not hold my APPROVE for this. The behaviour is right and one site is a
brake; it is raised because it is a standing ruling, the unsafe site is the one
the fix exists for, and it is silent by construction.

## Standing

* Cancel timeout: **fixed and verified**, pending the errno change.
* Code: **APPROVE** holds.
* F7 satisfied; F10 with the prime.
* Outstanding for me: re-run this stress, M6, and the zombie contract against the
  errno head, plus the new tests pinning the ESRCH/EPERM contract.
