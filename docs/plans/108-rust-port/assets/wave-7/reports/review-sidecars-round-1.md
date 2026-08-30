# Review round 1 — u-sidecars (wave 7) · **FIX_REQUIRED**

Reviewer `pij-favourite-araminta`. Head reviewed: **`e17e7488`**.
Standard and instruments pre-registered before the unit existed:
[`review-sidecars-baseline.md`](./review-sidecars-baseline.md).

Every number below carries the command that produced it. Where output was
truncated, it says so.

## 0. Verdict

**FIX_REQUIRED.** Not because the mechanism is weak — the three witnesses this
packet named all fire correctly, and I could not break them. Because the runner
**reports outcomes it never observed**, the telegram inbound path **loses a
human message permanently and silently**, and **none of the three live-fire legs
Jordan's amendment requires has been run at all**.

The code is good. The claims it makes about the world are not yet true.

## 1. Cold re-verification (per the PM's withdrawal of the shared target dir)

Everything was re-run in a fresh, unshared `CARGO_TARGET_DIR`
(`/tmp/araminta-cold-1788131169`), tree clean before and after:

```
COLD TARGET DIR: /tmp/araminta-cold-1788131169 (fresh, unshared)
HEAD: e17e74882c452f2e1d67605efc046f2595073b52
TREE: 0 modified files
pij-gate: all stages green
binaries: 52   passed: 346   non-ok: 0
FINAL TREE: 0 modified
```

My earlier runs used `/tmp/pij-review-w7-target`, created by me and named for me
alone — but that is a negative argued from directory names, which is the kind of
proof I refuse from others, so it is the basis of nothing here. Every claim in
this report is from the cold run.

**Count convention, flagged rather than disputed:** I measure **346 passed**
(`grep '^test result:'` summed over the full gate log, 52 binaries). The PM's
349 is 346 passed + 3 ignored doc-tests. Neither is wrong; the wave should pick
one before both get cited as "the number".

## 2. The three required witnesses — all genuine

Re-run by me and mutated by me. A witness never observed to fail is a claim
(E-031), so each mutation was applied with an **anchor assertion that fails on a
missing anchor** (E-026), and the tree was restored and verified after each.

| # | mutation | named test | result |
|---|---|---|---|
| M1 | delete `self.await_group_exit(...)` from `cancel_command` | `bg_cancel_observes_the_full_process_group_dead_before_cancelled_receipt` | **FAILED** at `sidecars.rs:237` — *"cancelled receipt must not exist before every live group member is gone"* |
| M2 | `break` the shipped loop on first error | `all_three_shipped_loops_survive_a_transient_claim_failure` | **FAILED** at `sidecars.rs:43`, after `pij-rs chore: test/transient: injected transient claim failure` |
| M3 | `Ok(Processed { count: limit })` | `telegram_reply_uses_only_the_persisted_outbound_binding_and_refuses_when_unbound` | **FAILED**: `left: 17, right: 1` — *"observed count must differ from configured limit"* |

All three fail **for the intended reason**, not incidentally. M2's stderr line
proves the injected error reached the **shipped** `start_resilient_loop`, not a
reconstruction — the E-030 bar, met.

The cancel witness is well built: `trap 'sleep 1; exit' TERM` makes death
non-instantaneous, which is exactly what gives the final assertion the power to
fail. That is E-027 applied correctly, unprompted.

## 3. Findings

### F1 — a command that FAILS is reported as `finished` · HIGH

`crates/sidecars/src/background.rs:294` sets `BgStatus::Done` unconditionally;
`:303-307` renders *"background job `X` finished"*. The exit status **is
observed and thrown away**: `reap()` at `:317-324` calls `try_wait()` and keeps
only `.is_some()`.

Probed, cold:

```
PROBE failing-command status = Done
PROBE failing-command turn = {"body":"background job `boom` finished\npartial output", ...}
```

`echo 'partial output'; exit 3` is reported to the operator as *finished*, with
output that reads like success. Legacy is explicit that this distinction is
load-bearing (`core/bg.ts:200-202`): *"`killed` is deliberately distinct from a
non-zero exit: an operator who stopped a job should never wonder whether it
failed."* `BgStatus` has `Running | Done | Cancelled`; legacy's `failed` is gone.

**Why it matters:** `pij bg` exists so an agent can stop waiting and be woken by
the result. An agent woken by *"finished"* for `exit 3` proceeds on a false
premise, and the one line it is designed to read first is the lie.

**Proof of fix:** a job whose command exits non-zero reports a distinct status
and a turn whose first line says so; mutation — force the status to `Done` and
watch that test fail.

### F2 — a job nobody watched is reported as `finished` · HIGH

`observe_completions` (`:272-311`) marks any `Running` record whose process group
is empty as `Done` and enqueues a completion quoting the log file. It never
establishes that **this** daemon observed **this** job end.

Probed, cold: start a job, `kill -KILL` its tree out from under it, drop the
worker, construct a **fresh** `BgWorker` over the same durable state dir (so
`children` is empty and it never held the child), run one pass:

```
PROBE orphaned-record status = Done
PROBE orphaned-record turn = {"body":"background job `orphan` finished\nwrote something", ...}
```

Legacy derives **`lost`** for precisely this, and says why
(`core/bg.ts:239-241`): *"a job whose process died without ever writing its
completion (machine reboot, SIGKILL) would otherwise read as running forever."*
The port removed the weaker true word and now emits the stronger false one.

Two of this plan's named classes at once: **a claim of an observation nobody
made**, and **E-024 — the log file is a residue** recording that a process once
wrote there, not that it completed.

**Proof of fix:** the orphan probe above reports something other than `Done`.

### F3 — a failed inbound delivery still CONFIRMS the message to Telegram · HIGH

`telegram.rs:342` advances the offset **before** the message is delivered:

```rust
for update in updates.result {
    *self.next_update.lock().await = update.update_id + 1;   // :342
    ...
    enqueue_turn(...).await?;                                 // :363-370 — can fail
```

`offset = update_id + 1` is not bookkeeping. It is Telegram's **acknowledgement**,
and it deletes the update. Everything between the advance and the enqueue is
fallible (`latest_matching?`, `from_str?`, `enqueue_turn?`).

Probed, cold, against a local Bot-API fixture that records requested offsets and
models Telegram faithfully (serves update 77 only while unconfirmed), with a
queue that refuses exactly the inbound turn:

```
PROBE pass 1 error   = test/refuse: injected turn-enqueue failure
PROBE offsets requested = ["0", "78"]
PROBE refusal events recorded = 0
PROBE VERDICT: update 77 was CONFIRMED TO TELEGRAM (lost) after its delivery failed
```

The message is gone from Telegram, never reached the seat, and **nothing on the
spine records that it existed**. The unbound path emits
`telegram.inbound-refused`; this path emits nothing — *silence where a signal is
owed* (E-023).

This inverts the rule the queue port states in its own doctrine
(`core/src/ports.rs:151-156`): claim before injecting, and **compensate if the
injection fails**, because "a claim that lands while the delivery does not turns
the retry into a replayed `Delivered` for a message that never arrived."

**Why it matters most here:** the message this drops is Jordan's reply. It is the
exact payload the live-fire amendment was written to protect, and it fails
silently.

**Proof of fix:** re-run the probe; the second poll must still request `0`, or a
recorded event must name the loss.

### F4 — the offset is in-memory, so a restart replays every unconfirmed update · MED

`next_update: tokio::sync::Mutex<i64>`, initialised to `0` in `new()`
(`:222`, `:239`). Telegram retains unconfirmed updates ~24h, so a restarted
daemon asks with `offset=0` and is re-served everything. The turn id is
`telegram-{update_id}` (`:368`), and this queue's dedupe is per-burst — the
store's own test says so: `an_acked_key_is_free_again_so_dedupe_is_per_burst_not_forever`.
So previously delivered replies are re-injected as fresh turns.

F3 and F4 are one root in two directions: **an acknowledgement held in memory and
issued before the effect.** The codebase already solved this shape once — E-028's
fix moved the pointer cadence out of an in-memory map onto the durable spine,
"restart-safe for free", for exactly this reason.

### F5 — one stuck cancel silently starves ALL completion reporting · MED

`run_once` (`background.rs:136-163`) returns `Err` on the first failing row
(`:157`) after `retry(job, Duration::ZERO)` (`:156`). `observe_completions()` is
called **after** the claim loop (`:162`), so it is skipped on every pass that has
a failing row — and `Duration::ZERO` makes the same row immediately re-claimable.

A cancel whose group outlives the 5s deadline errors, leaves the record
`Running` (so it errors again), and is retried with no backoff. From then on **no
job of any kind delivers a completion turn**, indefinitely, with only stderr to
show for it. The loop survives — that is F5's point: it is not a dead worker, it
is a live worker permanently doing one thing.

This is E-030's composition shape rather than E-030 itself: individually
reasonable pieces (retry the row, propagate the error, observe after claiming)
that compose into a silent, permanent, message-withholding state.

**Proof of fix:** with one permanently failing cancel row queued, a second,
healthy job still delivers its completion.

### F6 — cancel signals a pgid from a durable record, with no ownership interlock · MED

`cancel_command` reloads the record from disk and calls
`signal_group(record.pgid)` (`:232`), which shells `/bin/kill -TERM -<pgid>`
(`:356-372`). Nothing checks that the group is still one this daemon started, or
that it is not the daemon's **own** group.

The test asserts group-leadership at spawn time
(`sidecars.rs:216-219`, `before.contains(&record.pgid)`) — correct, and it is the
check my P1 asked for — but that is the **spawn** path. Production cancel reads a
record that outlives the daemon, and pgids are pids, which the OS recycles. This
is E-033 exactly: *existence is not ownership*; the tap fix landed a recorded
marker rather than a louder inference, and the same reasoning applies here.

I hold this at MED, not HIGH, because I did not demonstrate a recycled-pgid
cancel — the window is real but I have no observation of it, and I am not going
to file a severity I did not measure. My own probe made this exact mistake and
SIGTERMed its own process group (baseline §P1a), which is why the shape is
familiar rather than theoretical.

**Cheapest honest fix:** record an ownership marker at spawn (start time, or the
daemon boot id) and refuse to signal a group that does not match it — plus the
one-directional interlock `pgid != own pgid`, which can only ever refuse.

### F7 — no live-fire evidence exists, for any of the three legs · BLOCKING

Jordan's amendment (2026-08-31) opens: *"Unit tests and fakes do not close this
unit."* It requires a real telegram round trip **including his reply routed back
as an injected turn**, a live bg group-death-before-receipt, a live chore
baseline, and *"Transcript + spine excerpts as files in wave-7/reports/"*.

Observed at verdict time:

* `~/.pij-rs` **does not exist** — the dev instance has never run, so no leg was
  executed against the real surface. My baseline pre-registered this exact
  directory as part of the proof precisely because it was absent then too.
* **no `done-u-sidecars.md`**, and no transcript or spine-excerpt file for
  sidecars anywhere under `wave-7/reports/` (`git ls-files` → 0). COMMON §5
  requires the receipt committed **before** the done message.
* the legacy bridge still holds the poll: `~/.pij/pij-telegram.lock` is
  `{"pid":59939,"startedAt":"2026-08-28T04:32:45.261Z"}`, byte-identical to when
  I registered the falsifier — nobody stopped it, so no Rust inbound leg could
  have run.

The prime ratified the falsifier as binding: the reply leg needs a spine row
**and** the legacy bridge provably not the receiver. Neither half exists, because
the leg was never attempted.

**This alone is FIX_REQUIRED**, independent of F1–F6.

### F8 — a failed binding append re-sends the Telegram message · LOW

`process_send` (`:283-312`) POSTs `sendMessage`, then appends the binding event.
If the append fails, the row errors and is retried, re-POSTing — a duplicate
message on Jordan's phone for one queued send. Same family as F3 (effect ordered
against its record), much smaller blast radius.

## 4. Checked and NOT raising

Named so the next reader knows these were weighed rather than missed.

* **`group_pids` excludes zombies** (`:379-416`, `!state.starts_with('Z')`) with
  the reasoning in its doc comment. This consumed my P1a finding correctly, and
  the shipped behaviour matches — not merely the comment.
* **The bg child is its own group leader** — `process_group(0)` at `:195`, and
  the test asserts the spawned shell's pid equals its pgid, naming the exact
  hazard ("inheriting the daemon group makes cancellation kill the daemon").
* **Chore run/ack asymmetry is correct.** `Run` never writes `baseline`
  (`chore.rs:182-203`); only `Ack` promotes `pending` → `baseline` (`:229-234`).
  A failing probe becomes `NotProbeable { reason }` and **stays in the roster**
  (`:196-201`) — it does not vanish.
* **Chore reports observed values**: `probed = state.entries.len()`, `moved`
  incremented per changed entry (`:192`, `:204`).
* **`Processed.count` is reconstructed in all three consumers**, never the limit,
  and two tests choose limits (9, 17) that cannot coincide with the true count.
* **Chore persists before it enqueues** (`:205` then `:211`), so a lost report
  re-surfaces on the next run rather than vanishing.
* **The telegram allowlist gates before routing** (`:346`), matching legacy
  Finding 02 (the allowlist is the only access control).
* **The bridge lock mirrors legacy semantics** — live holder refuses, stale
  reclaims (`:131-192`), and the refusal names the holding pid.
* **The unbound inbound path refuses honestly**, records
  `telegram.inbound-refused` on the spine, and does not guess a target.
* **The base red I reported earlier is closed** and is **not** attributed to this
  unit (baseline §3).

## 5. What would flip this to APPROVE

1. F3 and F7 are the blocking pair: order the offset advance after the delivery
   (or record the loss), and then **actually run the three live-fire legs** with
   the receipts as files.
2. F1 and F2 need an outcome vocabulary that can express *failed* and *lost*.
   The exit status is already in hand at `reap()`; it only has to be kept.
3. F5 and F6 are cheap and mechanical.

Rounds continue with the coder direct. I will re-run every mutation and both
probes against the fix head rather than reading the commit message — a fix commit
is verified by re-running the reviewer's probe (E-026).
