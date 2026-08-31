# Review round 3 — u-spawn-rpc-port (plan 109, unit 1)

**Unit head:** `s109/u-spawn-rpc-port` = `27a161b1`; gated code head `95d86a91`;
round-1 mechanism fix `70f13700`. Re-verified 2026-08-31T03:3x–03:40Z in my own
detached worktree `pij-worktrees/s109-rev-head`, `CARGO_TARGET_DIR` unset,
`CARGO_INCREMENTAL=0`, tree clean before the gate and after every mutation.

Governing contract: `a1924277` (RF28 + M1/M3/M6/M7/M8 + the F3–F8 criteria),
registered before this head existed.

---

## VERDICT: REFUSE — on ONE finding. Everything else on the contract passes.

**M7 goes RED**, as asked, first. The fix is a fix and not a rearrangement. Seven
of the eight are closed and I could verify each of them.

**F9 is new and it is critical: the correlator the fix depends on is never
transmitted by the launcher that does the stamping.** The predicate is correct; the
input it tests for cannot exist on the shipped path. So F1 still happens in
production, and the acceptance test passes because it hands in a value a real
Copilot seat has no way to know.

---

## M7 first, as directed

```
crates/daemon/src/http/mod.rs:363
-    let binds_spawned_incarnation = descriptor.proc.is_none() && …spawn_id match…
+    let binds_spawned_incarnation = false;          // = the code that was replaced

cargo test --locked -p pij-cli --test spawn   ->  EXIT=101
panicked at crates/cli/tests/spawn.rs:328
  assertion failed: the revived seat's matching first bind must preserve its fresh port intent
test result: FAILED. 1 passed; 1 failed
```

**RED, with the predicted signature, on the predicted arm.** The witness detects
the defect it was written for.

## The full pre-registered mutation set, each applied alone and reverted

| mutation | predicted | observed | signature |
|---|---|---|---|
| **M7** predicate never matches (= the replaced code) | arm 1 red | **RED** | `spawn.rs:328` "matching first bind must preserve" |
| **M6** predicate always matches | arm 2 red | **RED** | `spawn.rs:346` "without the matching launch id must clear" |
| **M1** clear deleted entirely | arm 2 red | **RED** | `spawn.rs:346`, same signature as M6 |
| **M3** column dropped from `ON CONFLICT DO UPDATE SET` | store red | **RED** | `store_integration.rs:201`, `17 passed; 1 failed` |
| **M8** post-mortem published AFTER the overwrite | ordering red | **RED** | `spawn.rs:189` |

Five for five, each with the signature I wrote down before the code existed. No
mutation produced a *different* red, so each witness defends the property it was
written for rather than an adjacent one.

**On M8 specifically:** my first attempt moved the call verbatim and **did not
compile** — `seat_id` is moved into `SeatDescriptor::new` at `:653`. That is a
compile error, not a mutation result, and I did not count it. Re-applied with a
cloned id so the ordering is genuinely exercised; that version is the RED above.
Worth recording that the naive reordering is rejected by the borrow checker, which
is a small structural defence on top of the witness.

## RF28 — the three observations, verified by PROVENANCE not by assertion

This is the check the contract said nobody would think to run, so I ran it by
reading the **call order**, not the captions:

- **Arm 1** (`crates/cli/tests/spawn.rs:319-335`) — `register_same(Some(fresh_spawn_id))`
  where `fresh_spawn_id` comes from the descriptor of the revive at `:319`.
  Preceded by a fresh allocation. Asserts `Some(fresh_port)` **PRESERVED**.
- **Arm 2** (`:337-354`) — `register_same(None)`, twice. **Not preceded by a fresh
  spawn**: it follows arm 1's registration, so the fixture genuinely produces the
  case where the two states differ. Asserts `None` **CLEARED**.
- **Arm 3** (`:355-364`) — registry re-read after both passes, still `None`.

**The third falsifier is satisfied.** The shipped test could not have survived this
check; this one does. `register_same` taking `Option<&str>` is what makes the two
arms distinguishable, and the distinction is in the *call*, not the caption.

---

## F9 — CRITICAL, NEW. The launcher that stamps the port never tells the process the launch id the fix requires.

`crates/harnesses/src/spawn.rs:101-104` — the spawn argv, unchanged since round 1
and **not touched by the fix**:

```rust
let mut args = vec![
    format!("{PIJ_SESSION_ID}={}", input.seat_id),   // one env var
    harness_executable,
];
```

```
grep -rn "PIJ_SPAWN_ID" --include=*.rs crates          ->  0 hits
git diff --name-only 818cabc2 27a161b1 -- crates       ->  harnesses/spawn.rs ABSENT
```

`spawn_id` is stamped **on the descriptor row** (`http/mod.rs:658`) and is never
placed in the launched process's environment. The registering process therefore
has nothing to echo back. The bridge that performs registration omits the field
exactly when the env var is missing —
`.pi/extensions/pij/adapters/rust-runtime.ts:245`:

```ts
...(process.env.PIJ_SPAWN_ID ? { spawn_id: process.env.PIJ_SPAWN_ID } : {}),
```

And the TypeScript launcher, which *does* export `PIJ_SPAWN_ID`
(`.pi/extensions/pij/core/spawn.ts:196`), **never emits `--ui-server`**
(`grep -rn "ui-server\|uiServer" --include=*.ts .pi/extensions` → **0**). So:

> **The only launcher that stamps a port is the one that does not transmit the
> correlator, and the only launcher that transmits the correlator never stamps a
> port.**

### Observed at THIS head, both arms

```
PROBE_F9 arm1 SHIPPED-LAUNCH  at_spawn=Some(58224) -> after_bind=None
          (no spawn_id: the argv never told the process one)
PROBE_F9 arm2 TEST-SUPPLIED   at_spawn=Some(58225) -> after_bind=Some(58225)
          (spawn_id=s-db8c0682bcb133d5bca7999d23da9c87 handed in by the caller)
```

Both through `POST /v1/spawn` and `POST /v1/register` on a real listener. Arm 2 is
the acceptance test's world; arm 1 is production's.

### Why this is the same pattern, one level up

The acceptance test is **not** wrong the way the last one was — its arms are
genuinely distinguishable and all five mutations fire. The defect has moved from
*what the fixture asserts* to **what the fixture can supply that production
cannot**. `register_same(Some(fresh_spawn_id))` reads the launch id out of the
spawn response and passes it on the command line. A Copilot process has no such
channel: it is handed `PIJ_SESSION_ID` and nothing else.

**Coincidence by construction was "the fixture cannot produce a case where they
differ". This is its sibling: the fixture can produce a case production cannot
reach.** Same root — the fixture's capabilities are not the shipped path's
capabilities — and the same consequence: a green test about a code path no seat
will ever take.

### What would close it

Either emit `PIJ_SPAWN_ID=<spawn_id>` in the spawn argv beside `PIJ_SESSION_ID`
(one line in `build_spawn_plan`, and the TS bridge already forwards it), **or**
correlate on something the process already knows — it is handed `PIJ_SESSION_ID`,
and `descriptor.proc.is_none()` already carries most of the "pre-bind" signal.

**And the witness must be driven the way production drives it**: at least one arm
where the registration supplies **only what a launched process could actually
know**. That arm is what would have caught this, and it is the same shape as
RF28's third falsifier applied to *inputs* rather than to *ordering*.

---

## The rest of the contract — all verified, all PASS

### F3 — CLOSED, both halves

`crates/store/src/registry.rs:112-126` refuses loudly in the house style:

```rust
Some(port) => match u16::try_from(port) {
    Ok(port) if port != 0 => Some(port),
    _ => return Err(PijError::Adapter { … "seat row has invalid rpc_port_intent {port};
                                            expected NULL or 1..=65535" }),
}
```

and `0009_copilot_rpc_port_intent.sql` now carries
`CHECK (rpc_port_intent IS NULL OR rpc_port_intent BETWEEN 1 AND 65535)`.
The truncating cast is gone; `65536 → Some(0)` cannot recur, and the value the
write path forbids can no longer be manufactured by the read path.

### F4 — CLOSED, both statements

`crates/store/src/orchestration.rs`: survivor `UPDATE … rpc_port_intent=?8` (`:188`)
with its bind (`:197`), and the alias tombstone
`UPDATE seats SET tombstoned_at=?2, tombstone_reason=?3, rpc_port_intent=NULL` (`:203`).
The third writer R0-3 named is no longer the half nobody looks at.

### F5 — CLOSED, and the ordering is load-bearing by construction

`publish_revive_postmortem` (`http/mod.rs:447-487`) reads registry truth, **refuses
if the row is live or absent**, and publishes `seat.revive-postmortem` with a real
payload — `tombstoned_at`, `reason`, `role`, `semantic_state` — **before** the
overwrite (`:644-649`). The refusal on a live row is what makes M8 fail rather
than silently publish nothing: move it after the `put` and the row is live, so it
errors. That is the ordering enforced by the code and not only by the test, which
is stronger than what the contract asked for.

The payload is real, so this is not the row problem relocated: the test reads
`postmortem_payload["role"]` and `["semantic_state"]` back
(`cli/tests/spawn.rs:295-296`). Defect class 12 does not apply.

### F6 — CLOSED as ruled

`RpcPortAllocator` (`daemon/src/lib.rs:71-77`) takes a `BTreeSet<u16>`, and
`launch_seat` (`http/mod.rs:591-606`) populates it from the displaced row's port
**plus every live seat's stamped port**. The exclusion set is no longer a single
`Option<u16>` — exactly the criterion I registered. The cross-seat collision is
narrowed to the un-closable TOCTOU window, and the closing check remains unit 2's
post-connect session-identity verification, as ruled.

### F8 — the receipt's absence model, checked against the build

**This one is bound to F9 and cannot pass until F9 does.** The model's row 1 says
`None` means *"never launched with the flags"*. On this build, arm 1 of the F9
probe shows a seat that **was** launched with the flags reading `None` after its
bind. So rows 1 and 2 are still collapsed **in production**, and separated only in
the test's world. The code is right; the fleet it produces is not.

### Over-correction axis — PASS on refusal, PASS on the message

The live-id path still refuses and still launches nothing (verified in round 2 and
unchanged by the diff at `http/mod.rs:557-565`), and the message no longer promises
the narrowed guarantee — *"spawn never overwrites"* is gone, replaced by
*"seat `{id}` exists and is not tombstoned — only a tombstoned row may be
revived"*.

**Minor, LOW:** that message is now shared by `pij spawn` and the revive verb, so a
plain spawn collision is told about *revive*, a command the caller did not run. The
previous code branched on `existing_policy.allow_absent` to say the right thing per
command. Not blocking; noting it because the earlier per-command wording was better
and was lost in the consolidation.

### Gate, re-measured at THIS head

```
cd pij-worktrees/s109-rev-head          # detached at 27a161b1, tree clean
export PATH="$HOME/.cargo/bin:$PATH" CARGO_INCREMENTAL=0; unset CARGO_TARGET_DIR
cargo run --locked -p pij-testkit --bin pij-gate
```

2026-08-31T03:40:06Z, 44s, **EXIT 0** — toolchain 1.98.0 / lock / fmt / clippy /
test / arch (9 crates, 0 violations) all PASS.

Measured here, not carried. Noted as deliberate by the PM: this head does **not**
yet contain the main merge, which lands once after this unit.

---

## CHECKED AND NOT RAISED

- **The predicate's extra condition is a strengthening, not a weakness.**
  `descriptor.proc.is_none() && …` means only a never-bound row can preserve, so
  the preserve is a one-shot transition and a second registration carrying the same
  launch id still clears. The ruling asked only for the spawn_id match; this is
  tighter and correct.
- **Empty launch ids cannot match** — `!launched.is_empty()` guards the case where
  both sides are `Some("")`, which would otherwise be a match by accident. That is
  the `Some(0)` lesson applied to a string, unprompted.
- **The supersedes branch still clears the predecessor** (`http/mod.rs`), and the
  test drives it through the shipped `pij-rs register --supersedes`.
- **Revive still allocates a port different from the displaced one**, and the test
  still binds the old port with a real listener so the assertion cannot pass by
  luck.
- **`RpcPortAllocator` is injected**, so the allocator is testable without a real
  kernel bind — and `KernelRpcPortAllocator` still holds colliding listeners while
  it retries, keeping the exclusion structural.
- **Unit 1 still ships no reader.** No `can_deliver`-shaped function; the transport
  crate is untouched in the whole diff.
- **The mechanism fence held**: `harnesses/src/spawn.rs` and the transport crate
  are absent from the diff. (Ironically, `spawn.rs` being untouched is exactly what
  F9 is about — the fence is intact and the gap is on the other side of it.)

## MY OWN INSTRUMENT ERRORS THIS ROUND

8. **A `sed`-based M6 deleted the predicate without inserting its replacement**,
   producing `error[E0425]: cannot find value binds_spawned_incarnation`. `EXIT=101`
   from a **compile failure**, which I nearly filed as a mutation red. Caught
   because the grep for a panic signature matched nothing and the diff showed
   `6 deletions, 0 insertions`. Re-applied with an anchored edit; that run is the
   RED reported above. **Third time this review that `EXIT != 0` has meant
   something other than "the test failed".**
9. **My first M8 did not compile** (`borrow of moved value: seat_id`). Also not
   counted; re-applied with a cloned id.

Both disclosed, neither counted as evidence. Nine disclosed across this review;
none has reached a verdict. Every number in this report comes from an unfiltered
run redirected to a file with the exit code taken from the cargo invocation, and
every mutation red is quoted with its panic line.

## TREE RESTORED

Five mutations and one probe, each applied alone and reverted with
`git checkout --`. `git status --porcelain` empty before the gate run and after the
last revert. The coder's worktree was never touched and its HEAD never moved.

---

## WHAT MOVES THIS TO APPROVE

**F9 only.** Emit the launch id to the launched process, or correlate on something
the process already knows — plus **one witness arm that supplies only what a
launched process could actually know**. Everything else on the contract is closed
and I have said so specifically rather than in aggregate.

When it lands I will re-run M7 and M6 (the predicate may change shape), re-run the
F9 probe expecting `arm1 after_bind = Some(N)`, re-check F8's row 1 against the
build, and re-measure the gate at that head — including the main merge if it has
happened by then.
