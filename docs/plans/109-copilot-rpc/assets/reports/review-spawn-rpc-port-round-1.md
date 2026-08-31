# Review round 1 — u-spawn-rpc-port (plan 109, unit 1)

**Head reviewed:** `s109/copilot-rpc` = `3cbd2820` "feat(rpc): stamp Copilot spawn
port intent". Reviewed 2026-08-31T03:0x–03:1xZ.
**No receipt was committed at this head** (`assets/reports/` holds the coder's
pre-registered falsifiers but no `done-*`), so this round reviews the CODE. My own
falsifiers were pre-registered at `4a5811ac`, amended at `fc28292e` and `5b7ba38f`,
and the mutation plan at `ab09e2f9` — **all before this commit existed.**

**Probes ran in my own detached worktree** `pij-worktrees/s109-rev-head` at
`3cbd2820`. I did not move HEAD in the coder's tree. Every mutation was applied
alone and reverted; the tree was verified clean before the gate run.

**Gate, re-measured at THIS head** (not carried from the baseline):

```
cd pij-worktrees/s109-rev-head          # detached at 3cbd2820, tree clean
export PATH="$HOME/.cargo/bin:$PATH" CARGO_INCREMENTAL=0
cargo run --locked -p pij-testkit --bin pij-gate
```
2026-08-31T03:16:44Z, 62s, **EXIT 0** — toolchain / lock / fmt / clippy / test /
arch all PASS, 9 crates 0 violations.

**That green is the reason F1 matters.** The defect below ships through a clean
six-stage gate and a passing acceptance test.

---

## VERDICT: REFUSE

F1 defeats the unit's stated purpose in production. F2 is why nothing caught it.

---

## F1 — CRITICAL. The registration that BINDS a Copilot seat destroys the launch port, so every Copilot seat is a pointer seat for its whole life — the exact condition this plan exists to remove.

`crates/daemon/src/http/mod.rs:385`

```rust
// A registration describes the current process incarnation but carries no
// freshly allocated Copilot UI-server port. Never inherit a dead launch's
// endpoint intent merely because the stable seat id is reused.
descriptor.rpc_port_intent = None;
```

**Unconditional.** Not "when the proc identity changed", not "when the row was
tombstoned" — every registration, including the seat's own first one.

### Why that is the normal path and not an edge case

`spawn` writes a **pre-bind** row: `proc` is `None`, asserted deliberately
(`crates/daemon/src/http/tests.rs:474`, and the coder's own
`crates/cli/tests/spawn.rs:139`). **`register` is the only code in the workspace
that sets `descriptor.proc`.** So every spawned seat registers, always — that is
how it acquires the process identity that liveness, the watchdog and every
`alive()` verdict depend on.

The proof is three lines above the offending one, in the code's own comment:

> *"A launcher observation is stronger than the process describing its own argv
> later. **Registration fills absent facts; it never downgrades a stamp.**"*

That comment, and the `is_none()` guards under it for `spawn_id` / `model` /
`provider` / `effort`, exist **only** because registration follows spawn for the
same id. The new line was inserted directly beneath it and **downgrades a stamp**.

### Observed, on the shipped routes, over a real listener

Probe `reviewer_probe_f1_…`, committed at
`review-spawn-rpc-port/R1-probes-f1-f5.rs.txt`:

```
PROBE_F1 at_spawn            = Some(53888)   proc=None
PROBE_F1 after_first_bind    = None          proc=Some(ProcIdentity { pid: 5151, … })
PROBE_F1 persisted_in_store  = None
PROBE_F1 red_arm_status      = 200 OK
PROBE_F1 red_arm_never_spawn = None
```

`POST /v1/spawn` then `POST /v1/register`, both through `axum::serve` on a real
TCP socket via `reqwest`; no handler called directly. `persisted_in_store` is read
back through `Registry::get`, not from the response body. The red arm — a seat
that was never spawned — prints `None`, so the probe reports the field rather than
a constant.

**A port was allocated, `--ui-server --port 53888` was emitted, tmux launched it,
and the value was erased by the request that told us which process it is.**

### Failure mode

Unit 2 reads `rpc_port_intent` on every live Copilot seat and finds `None`.
`can_deliver` → false. Every Copilot seat takes the pointer rung **for its whole
life** — which is SHAPE line 7's description of the world *before* this plan:
*"under the current ladder a Copilot seat is permanently a pointer seat."*

The unit's own migration statement becomes accidentally true of the seats it was
supposed to fix: not only is every pre-existing Copilot seat a pointer seat until
respawn, **so is every seat it respawns.**

### The mutation, and what it proves

M1 from the pre-registered plan (`ab09e2f9`) — delete that one line:

| | result |
|---|---|
| coder's acceptance test | **RED** at `crates/cli/tests/spawn.rs:230` |
| my F1 probe | **GREEN** — `after_first_bind = Some(53969)`, persisted |

`cargo test --locked -p pij-cli --test spawn` → `EXIT=101`, `1 passed; 1 failed`.

**The two witnesses are in direct opposition, and one line decides between them.**
There is no build satisfying both, which is the strongest available evidence that
this is a design defect and not a nit. The fix is not "delete the line" — that
restores the inheritance defect R0-1 demonstrated. **The line must distinguish the
seat's own launch from a later incarnation**, e.g. clear only when the registering
`proc` differs from the one the stamp was written for, or only when the row was
tombstoned, or gate on the `spawn_id` the claim carries.

**What would prove it fixed:** spawn a Copilot seat, register it as its own first
bind, read `Registry::get` → `Some(<the port spawn emitted>)`; *then* a second,
different `(pid, proc_start)` registering the same id → `None`. Both arms in one
test, because they are the two states the current code cannot tell apart.

## F2 — HIGH. The acceptance test encodes F1 as its specification, and cannot distinguish the two cases it is asserting about.

`crates/cli/tests/spawn.rs:186-248`

The test spawns a revive (line 186), asserts the fresh port persists on a later
pass (line 190-199) — and then, forty lines later, registers the same seat twice
and asserts the port is `None` (lines 230-237, 239-248), captioned
*"registration without a fresh allocation must not inherit port intent"*.

**But that registration follows a spawn that DID freshly allocate, two statements
earlier.** The caption describes a different scenario from the one the test runs.
The test therefore cannot separate:

- *(correct)* a later incarnation's registration must not inherit a **dead**
  launch's port; from
- *(defect)* the registration that binds the launch spawn just made destroys
  **that** launch's port.

They coincide in this fixture **by construction**, because it never once checks
that a port survives its own seat's first bind. This is the class the plan has been
paying for all week — a witness whose two worlds produce identical output — except
here the wrong world was written down as the expected result.

Everything else about the test is good and I want that recorded: it drives the
shipped CLI, it holds the old port with a real `TcpListener` so revive-inequality
is structural rather than probabilistic (line 184), it re-reads through the
registry rather than the response body, and it checks a later pass. The defect is
one assertion's premise, not the test's craft.

## F3 — MEDIUM. The read path truncates silently and can manufacture `Some(0)` — the exact value the write path refuses as impossible.

`crates/store/src/registry.rs:140-143`

```rust
rpc_port_intent: row.try_get::<Option<i64>, _>("rpc_port_intent")?.map(|port| port as u16),
```

Probe `reviewer_probe_f3_…`, real SQLite, `Registry::get`:

```
PROBE_F3 stored=65536 -> read Some(0)
PROBE_F3 stored=70000 -> read Some(4464)
PROBE_F3 stored=-1    -> read Some(65535)
PROBE_F3 stored=47781 -> read Some(47781)     <- control
```

`build_spawn_plan` explicitly refuses `Some(0)` — *"a Copilot RPC port must be
non-zero"* (`crates/harnesses/src/spawn.rs:89-94`) — and the argv derivation
filters it out again (`:158`). **The read path can produce the one value the write
path declares impossible**, and it is *present*, so any `is_some()`-shaped consumer
reads it as a live endpoint. `-1 → Some(65535)` is worse: a perfectly plausible
port number.

Three fields above, the same function refuses a half process identity **loudly**
(`registry.rs:100-107`, *"liveness cannot be judged from it"*). The house style
here is to refuse, not to wrap. This is E-023 — silence where a signal is owed.

Not reachable from today's writers (`u16` by construction), which is why it is
MEDIUM and not HIGH. But `0009_copilot_rpc_port_intent.sql:7` declares a bare
`INTEGER` with **no CHECK constraint**, so a hand edit, a future writer, or another
binary is all it takes — and the migration could close it in the same line.

## F4 — MEDIUM. Two of the three tombstone writers clear the port; the third does not.

R0-3 named three. Fixed: `SqliteRegistry::tombstone`
(`crates/store/src/registry.rs:278-279`, `rpc_port_intent = NULL` inside the same
UPDATE) and `register`'s supersede branch
(`crates/daemon/src/http/mod.rs:404`). Both good, and both verified below.

**Unfixed: `crates/store/src/orchestration.rs:186-212`.** `grep -n rpc_port_intent
crates/store/src/orchestration.rs` → **0 hits**. The alias tombstone is a two-column
`UPDATE seats SET tombstoned_at=?2, tombstone_reason=?3` — the retired alias keeps
its port. The survivor `UPDATE` names six columns and does not carry
`rpc_port_intent` either, so a merged survivor keeps a value describing a launch
that may no longer be its own.

Latent today: `reconcile_descriptors` has **no production callers** — every call
site is `crates/store/tests/orchestration.rs:101,159`. That is the same shape as
`Registry::tombstone` before this unit, and it is why I am grading it MEDIUM rather
than HIGH. But it is precisely the seam R0-3 warned about, left in exactly the
half nobody looks at.

## F5 — HIGH, and it is an OVER-CORRECTION. Revive-by-spawn destroys the post-mortem the tombstone exists to preserve.

`crates/daemon/src/http/mod.rs:536-548, 615`

The old guarantee was unconditional: *"seat `{id}` already exists — choose another
--id; **spawn never overwrites a roster row**."* It now refuses only **live** rows,
and a tombstoned id falls through to `launch_seat`, which builds a **brand new**
`SeatDescriptor::new(...)` (line 615) and `put`s it over the row.

The narrowing itself is ruled and correct (Amendment 3). **The question the
over-correction rule asks is what went with it.** Probe
`reviewer_probe_f5_…`:

```
PROBE_F5 red_arm_before_revive_reason = Some("crashed mid-review; unread mail left for a revive")
PROBE_F5 red_arm_before_revive_role   = Some("reviewer")
PROBE_F5 red_arm_before_semantic      = Some(Blocked)
PROBE_F5 revive_status                = 200 OK
PROBE_F5 after_revive_reason          = None
PROBE_F5 after_revive_tombstoned_at   = None      <- correct, this is the revive
PROBE_F5 after_revive_role            = None
PROBE_F5 after_revive_semantic        = None
PROBE_F5 after_revive_parent          = Some(SeatId("pij-governor"))
```

Clearing `tombstoned_at` is the point of a revive. **Destroying
`tombstone_reason`, `role` and `semantic_state` is not**, and `tombstone_reason`
is load-bearing by the model's own words (`crates/core/src/model.rs:192-196`):

> *"Why it was tombstoned. **The row IS the post-mortem**, so the reason has to be
> readable through the port."*

And `register`'s comment (`:386-391`): *"Not a delete: queued work and history for
the old id must not silently vanish … a post-mortem a human can actually follow."*

**It is unrecoverable.** `Registry::put` writes its spine event with an **empty
payload** (`crates/store/src/registry.rs:183-189`: `'seat.put', ?1, ''`), so the
spine records that a put happened and not what it replaced. The only production
tombstone — `register`'s supersede branch — records the reason *in the row*,
because `Registry::tombstone` (which writes a `seat.tombstone` spine event
carrying the reason) still has **zero production callers** at this head. So the
reason exists in exactly one place, and revive overwrites that place.

The message even keeps the old words — *"spawn never overwrites a **live** roster
row"* — while the guarantee behind them is strictly weaker. That is the addendum's
exact warning: **the diff reads as humility.**

**What would close it:** carry the retired incarnation's post-mortem forward
(a `previous_tombstone_reason`, a spine event with a real payload, or a
`seat.revived` event naming what it replaced) — or state explicitly that a revived
seat discards its predecessor's post-mortem and have someone rule that acceptable.
Silence is the finding.

## F6 — MEDIUM. The allocator excludes only THIS seat's previous port. Two Copilot seats can be stamped with the same one. **Not witnessed — mechanism only.**

`crates/daemon/src/http/mod.rs:438-464`

The exclusion is well built for what it does: it holds the excluded listener while
re-asking, so inequality with the seat's own prior port is structural rather than
probabilistic (`:459-461`). Credit where due.

But it consults **nothing else** — not the registry, not other live seats' stamps.
The spawn lock is held across allocation and `new_window`, which serialises two
spawns; **it does not serialise Copilot's `bind`.** `new_window` returns when tmux
has made the window, not when Copilot has taken the port. So seat A can be stamped
`N`, release the reservation, and have its Copilot still starting when the lock
releases and seat B asks the kernel — which is free to hand out `N` again.

Consequence is sharper than "stale": **a live listener on `N` may belong to a
different pij seat.** Unit 2 would connect successfully and deliver to the wrong
seat, and no absence classification catches it because nothing is absent.

I did not witness this — it needs a real race and I will not report a mechanism as
an observation. **Recorded as a mechanism, unproven**, and I flag it because
`allocate_copilot_rpc_port(excluded: Option<u16>)`'s signature is where a registry
consultation would go, and it is cheaper to widen now than after unit 2 consumes it.

## F7 — LOW/MEDIUM, process. Unit 1 shipped u-revive-verb's unit.

`launch_seat` + `ExistingSeatPolicy` + the tombstoned-id revive transition
(`crates/daemon/src/http/mod.rs:466-571`) implement Amendment 3's revive verb. The
coder packet's scope is *"Stamp `rpc_port` on the seat descriptor at spawn. **Nothing
else.**"*, and the PM has dispatched `u-revive-verb` (`pij-orthodox-tahr`), who is
designing against this same function now and has already reported a red in it.

Two coders in one function is a merge hazard and an ownership question, not a code
defect. Raising it for the PM to rule; I am not asking the coder to unpick it.

---

## CHECKED AND NOT RAISED

The half that makes the findings believable. All verified at `3cbd2820`.

- **Named as intent — RF26 satisfied.** `rpc_port_intent`, and the doc-comment
  (`crates/core/src/model.rs:225-234`) says outright it *"does not assert that
  Copilot bound the port, that a listener still exists, or that the current process
  owns it"*, and names the read-time obligation. The migration comment repeats it
  (`0009_…sql:3-6`). Nothing in the name or docs promises possession.
- **Derived from the emitted argv, not from the request — RF9 satisfied.**
  `crates/harnesses/src/spawn.rs:155-161` scans `args.windows(3)` for
  `["--ui-server", "--port", N]`, exactly the precedent's shape. The config-echo
  class does not apply.
- **Refuses the wrong harness** (`spawn.rs:81-88`) and **refuses `Some(0)`**
  (`:89-94`), and the argv filter drops a zero again at `:160`. RF6/M5 closed on
  the write path.
- **Migration + schema bump both present — RF8.2 satisfied.**
  `0009_copilot_rpc_port_intent.sql` and `SCHEMA_VERSION: u32 = 9`
  (`crates/store/src/migrate.rs:29`). A column without the bump would have passed
  `require_current_schema` on a store lacking it; it did not happen.
- **All five halves of the seam present — RF8 satisfied.** Model field with serde
  attrs matching the precedent; migration; `row_to_descriptor` read; INSERT column
  list, bind, **and** `ON CONFLICT DO UPDATE SET rpc_port_intent=excluded.…`
  (`registry.rs:211`); `SpawnPlan` derivation.
- **R0-4 / F0-8 is genuinely closed, and I proved the witness fires.** Mutation M3
  — remove `rpc_port_intent=excluded.rpc_port_intent` from the `DO UPDATE SET`
  clause, nothing else — `cargo test --locked -p pij-store` → **EXIT=101**, RED at
  `crates/store/tests/store_integration.rs:201`, in
  `rpc_port_intent_updates_to_a_different_value_and_tombstone_clears_it`. The coder
  wrote the update-path test against a **real `SqliteRegistry`** with two different
  port values, which is exactly what F0-8 required and what `FakeRegistry` could
  not have shown. Tree reverted after.
- **Tombstone clearing is an ACT, observed.** `registry.rs:278-279` clears inside
  the same UPDATE as the tombstone, and the coder's tests read it back through
  `Registry::get` (`store_integration.rs:221-224`) and through the shipped CLI
  (`cli/tests/spawn.rs:174-183`) rather than asserting the code path ran. RF4
  satisfied for the two writers that were fixed; F4 is the third.
- **The live-id refusal was NOT relaxed.** `http/mod.rs:538-547` still refuses a
  live id, the coder's test asserts it (`cli/tests/spawn.rs:149-168`) **and**
  asserts `tmux.calls().len()` is unchanged, so a refused collision launches
  nothing. This is the specific over-correction the ruling warned about and it did
  not happen — F5 is a different one.
- **Revive excludes the old port structurally, not probabilistically**
  (`http/mod.rs:456-463`), and the coder's test binds the old port with a real
  listener before reviving (`cli/tests/spawn.rs:184-189`) so the assertion cannot
  pass by luck. Good work; I tried to fault it and could not.
- **Unit 1 ships NO reader — RF27 satisfied.** No `can_deliver`-shaped function,
  no `impl Transport`, nothing in `crates/transport` touched. `git show --stat`
  confirms the diff is model / migration / registry / spawn-plan / daemon-http /
  cli, and no transport crate.
- **Pre-migration seats read `None`.** `ALTER TABLE … ADD COLUMN` without a
  default gives NULL, and `row_to_descriptor` maps that to `None` — so the
  migration statement ("every pre-existing Copilot seat is a pointer seat until
  respawn") is true of the data, whatever the receipt says. Verified by
  construction, and the existing `an_older_store_gains_the_bind_evidence_columns…`
  test covers the migration-forward shape.
- **Gate green at this head**, re-measured, not carried from the baseline. Command
  and full verdict block quoted above.

## MY OWN INSTRUMENT ERRORS THIS ROUND

5. **F5 probe failed to compile first** — `SemanticState` not in scope in that test
   module. A compile error, not a result; fixed by naming
   `pij_core::model::SemanticState` and re-run. No output was interpreted from the
   failed build.
6. **A stray `sed` while setting up M3** matched nothing and left a `.bak` file.
   Caught by `grep`, reverted with `git checkout --` before any measurement; the
   mutation I actually ran was applied with an anchored edit and its one-line diff
   is quoted in this report. **A filter that matches nothing must fail loudly** —
   mine failed silently, which is habit 7 in my own tooling for the second time
   this review.

Neither reached a finding. Both are listed because the four disclosed earlier are
why anyone should believe the six findings above.

## TREE RESTORED

All probes and all four mutations (M1, M3, and the two setup errors) were applied
in `pij-worktrees/s109-rev-head`, a **detached** worktree at `3cbd2820`, and
reverted with `git checkout --`. `git status --porcelain` was empty before the gate
run — which is why the gate judged the coder's tree and not mine. Probe sources are
preserved as `review-spawn-rpc-port/R1-probes-f1-f5.rs.txt` rather than left in any
tree.

## WHAT WOULD MOVE THIS TO APPROVE

F1 fixed so a Copilot seat keeps its port through its own first bind while a later
incarnation still cannot inherit, with **both arms in one witness** (F2). F5 ruled
or fixed. F3 and F4 closed or explicitly deferred with a named owner. F6 answered
with a decision, and F7 with an ownership ruling.
