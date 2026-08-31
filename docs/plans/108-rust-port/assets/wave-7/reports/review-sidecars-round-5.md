# Round 5 — final verification of `done-u-sidecars.md` at `cc20aadc`

`pij-favourite-araminta`. Verifies the coder's receipt as a set of claims.

## 1. Named receipts exist — checked against disk, not against the list

E-020 is in this plan because a receipt list inherits the previous wave's names.
All four are present and **tracked**:

```
OK  u-sidecars-gate.txt              23 lines
OK  u-sidecars-mutations.txt         23 lines
OK  u-sidecars-live-fire.txt         65 lines
OK  u-sidecars-spine-excerpts.jsonl  15 lines
```

## 2. The lock-schema fix is real — verified by mutation

My round-4 finding. At `4f8fc844` the writer emits
`{"pid": …, "startedAt": "unix-ms:…"}` — a **string**, which legacy `parseLock`
accepts — and the Rust reader now discriminates three ways
(`telegram.rs:136-143`, `:181-197`):

* legacy `{pid, startedAt:string}` + live pid → **refuse**
* transitional `{pid, startedAtMs:number}` + live pid → **refuse**
* unrecognised → **refuse**: *"refusing to reclaim unrecognised Telegram lock …
  somebody may hold the single-consumer poll"*
* parsed dead holder → reclaim

**Mutation M5**: reverted the writer to the Rust-only shape.
`failed_inbound_delivery_keeps_the_update_unconfirmed_and_cursor_survives_restart`
FAILED at `sidecars.rs:667` — `assertion failed: lock_json["startedAt"].is_string()`.
Restored, tree clean. The instrument can fail, so the green means something.

Refusing the unknown case is a **brake**: removing it makes the Rust bridge take
more locks, never a different one.

## 3. Relay restored — verified independently

```
~/.pij/pij-telegram.lock  {"pid":93025,"startedAt":"2026-08-30T23:45:57.590Z"}
pid 93025                 node … (legacy bridge)
~/.pij/pij-telegram.json  present
pij state pij-telegram    idle · active
```

Legacy schema, descriptor back, seat registered. Round 4 §2 is closed.

## 4. Live-fire legs corroborated

The bg and chore receipts I said were owed now exist and match the store excerpts:
jobs 3–21 across `sidecar:bg`, `sidecar:chore`, `sidecar:telegram:send`, and the
`delivery:` turns. The cancel leg used the honest fixture
(`trap 'sleep 1; exit' TERM`), recorded `observed_pids [8499, 8504]` for pgid
8499, and reports a post-receipt scan with no live non-zombie member. The chore
leg shows the run/ack asymmetry live. Row 21 is the reply I verified myself in
round 4.

## 5. A red I observed and CANNOT explain

The gate I ran at `cc20aadc` failed:

```
bg_cancel_observes_the_full_process_group_dead_before_cancelled_receipt
panicked at crates/sidecars/tests/sidecars.rs:230:34
pij-gate: 1 stage(s) failed — test.
```

Line 230 is `worker.run_once(7).await.expect("cancel")`, so **cancel returned
`Err`**.

**Characterised, not re-run away:**

| condition | result |
|---|---|
| that gate run | **1 failure** |
| isolated, 3 runs | 3/3 pass |
| full workspace, ~6 subsequent runs | all pass |

So: one failure in roughly seven runs, not reproducible on demand.

**I do not know the cause, and I am not going to invent one.** I never captured
the `expect` message — twice my own `grep` filter dropped it, because
`panicked at <file>:<line>:<col>:` puts the message on the *following* line. That
is the sixth instrument error of this review and it cost me the one datum that
would have settled this.

What I can say from the code, as a structural observation rather than a
diagnosis: `await_group_exit` (`background.rs:304-322`) polls every **20 ms**
against a **5 s wall-clock** deadline, and every iteration calls `group_pids`,
which forks `/bin/ps -axo pid=,pgid=,state=` and scans the **whole** process
table — up to ~250 full-table scans per cancellation, three cancellations per
test. A wall-clock deadline over a fork-per-poll loop is load-sensitive by
construction, and the failure mode on expiry is exactly what was observed: `Err`
from `run_once`. That is consistent with what I saw and **is not evidence that it
is what happened.**

It matters beyond the gate: if that is the mechanism, a real cancel on a loaded
machine returns an error and leaves the record `Running`, so an operator sees a
failed cancellation for a process group that is dying normally.

**What would settle it, cheaply:** re-run the gate preserving the panic message
(`grep -A2 'panicked at'`, or no filter at all). If it says *"timed out waiting
for process group N; surviving pids: …"*, the deadline is the cause and the fix is
a deadline that is not wall-clock-only, or a cheaper poll than a whole-table fork
at 50 Hz. If it says anything else, my structural reading is a red herring.

Per REVIEWER.md's third habit: reported, not re-run until green. A gate that fails
once in seven makes every future green an assertion rather than a proof, and buys
a re-run before anyone should believe a red.

## Verdict

* **Code: APPROVE** — unchanged from round 3, and the delta since (`db45515c`,
  `4f8fc844`) is verified, the lock fix by mutation.
* **F7 live-fire: satisfied.** All three legs have receipts as files; I verified
  the reply leg independently from the store.
* **Open, not held by me:** F10 (caller-controlled outbound `chat_id`) is with
  the prime as an egress ruling.
* **Blocking ship, in my view:** §5. Not because the defect is proven — because
  it is **unexplained**, and the one line that would explain it is one un-filtered
  gate run away. Shipping past an unexplained red in the packet's priority-1 test
  is how this plan's worst findings survived nine consecutive greens.
