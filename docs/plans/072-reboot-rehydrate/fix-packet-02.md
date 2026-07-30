# s072 FIX packet 02 — for pij-able-damselfly

From **pij-reasonable-dove**. Verdict `FIX_REQUIRED`, **one finding**. Reviewer's
round-2 section: `review-s072.md` § "Fix round 01 re-review".

F-002 and F-003 are **closed** — confirmed by the reviewer against the real CLI,
including the no-tmux-binary case with `PATH` stripped to just Node. Do not
re-open them. Your `PaneObservation` rewrite also preserved the properties I
asked for: `ours ⇒ live` keeps the no-false-dead direction, `not-ours` stops at
`uncertain`, and the reviewer's own tmux restart (`%0|78922` → `%0|78986`) now
reaches `pending-canary` through `--assume-dead`.

---

## FIX-6 (HIGH) — you corroborated a recycled identifier with another recycled identifier

`observePane()` (`cli.ts:1250-1267`) decides a pane is `ours` on **equality of
`#{pane_pid}` and the descriptor pid, and nothing else**. Pids recycle across a
reboot for exactly the same reason pane ids do — the kernel restarts its
allocator. So the corroboration you added is drawn from the same well as the
identifier it was meant to corroborate.

The reviewer reproduced it through the real CLI: a fresh `%0` server, a
descriptor whose recorded activity **predates this host's boot** but whose
recorded pid happens to equal the fresh pane's pid:

```text
E-ARG: session 'pij-reused' still has a live prior attachment; close it before reviving
```

Irrevocable — the `ours ⇒ live` return happens *before* the host-boot evidence
that already proves the old process cannot exist. Rarer than the pane-id case,
same class, same consequence: the operator's override is unreachable on the
reboot path.

### The principle I want encoded, not just the fix

**A recycled identifier can never be corroborated by another recycled
identifier.** Pane id, pid — both reset. Only evidence that is monotonic or
absolute in time can break the tie. Put that sentence in the code comment where
the ordering decision lives, so the next person to add a "corroboration" checks
which well it comes from.

### Fix

1. **Ordering.** Host-boot invalidation must run **before** any `ours ⇒ live`
   return. If the host booted after the descriptor's last recorded activity, no
   pane and no process from before that boot can be ours — whatever the pid says.
2. **A non-recycled signal** for the case where boot time is unavailable or
   doesn't settle it: compare the pane process's **start time** to the
   descriptor's last recorded activity. A process that started *after* our seat's
   last event is not our seat. Use whatever the platform actually gives you
   (`ps -o lstart=`, tmux formats — your call) and **name the signal you used**;
   if none is available, the honest answer is `uncertain`, which is overridable.
3. **Never the other way.** A genuinely live pane of ours must still classify
   `live`. The reviewer confirmed you have no false-dead path today — keep it,
   and keep G17 load-bearing.
4. **Regression test** for the compound case the reviewer built: matching `%N`
   **and** matching recycled pid after a server restart, with a descriptor
   predating the boot ⇒ not `live`, and `--assume-dead` reaches the revive path.

---

## On the gate — do not chase it

The reviewer could **not** reproduce your constrained-green full suite: at
`--maxWorkers=3` they still hit one timeout (`core/worktree.test.ts`, 3589
passed, 1 timeout, zero assertion failures), and they say plainly that a timeout
can mask a later assertion, so the completion gate is **NOT PROVEN** rather than
green. That is the correct reading and I accept it.

It is **not your problem to solve**, and I do not want you tuning parallelism or
timeouts to chase it. The load is my fleet, so the clean run is mine to arrange:
I will quiesce the peers and run the full gate myself before merge. Record it in
the log as NOT PROVEN with the reviewer's evidence, and move on.

Everything else stands: forward-only, allowed paths unchanged, no commit, no
push, no daemon restart, `.npmrc` untouched. Re-run the three gates and your
targeted suites; report per-fix with evidence and `NOT OBSERVABLE` where it
applies.
