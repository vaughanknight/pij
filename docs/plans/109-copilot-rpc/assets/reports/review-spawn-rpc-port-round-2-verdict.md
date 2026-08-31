# Review round 2 — VERDICT — u-spawn-rpc-port (plan 109, unit 1)

**Head presented for verdict:** `s109/u-spawn-rpc-port` = `818cabc2`
"docs(109): record spawn rpc port receipt".
**Verdict rendered:** 2026-08-31T03:2xZ.

---

## VERDICT: REFUSE

**The head presented for verdict is byte-identical, in `crates/`, to the head I
refused in round 1.**

```
git diff --name-only 3cbd2820 818cabc2 -- crates | wc -l   ->  0
git diff            3cbd2820 818cabc2 -- crates | wc -l   ->  0
git log --oneline 3cbd2820..818cabc2
  818cabc2 docs(109): record spawn rpc port receipt        <- the only commit
```

One commit landed since round 1 and it adds `done-u-spawn-rpc-port.md`. **No
mechanism changed.** F1, F2, F3, F4, F5 and F6 all stand exactly as filed.

I record without prejudice that the receipt was almost certainly written before
round 1 reached the coder — the timing is consistent with that and it is not a
conduct finding. It does mean the receipt makes claims about a build whose central
defect had already been demonstrated, so I have re-measured everything at
`818cabc2` rather than carrying round 1's numbers.

---

## Re-measured at THIS head, not carried

Per the decay rule. Detached worktree `pij-worktrees/s109-rev-head` at `818cabc2`,
`CARGO_TARGET_DIR` explicitly unset, `CARGO_INCREMENTAL=0`, tree verified clean
before and after.

### F1 still live — the defect the unit exists to prevent, reproduced at the verdict head

```
PROBE_F1 at_spawn            = Some(55135)   proc=None
PROBE_F1 after_first_bind    = None          proc=Some(ProcIdentity { pid: 5151, … })
PROBE_F1 persisted_in_store  = None
PROBE_F1 red_arm_never_spawn = None
```

A different port from round 1 (`55135` vs `53888`), because the allocator really
ran — the probe is measuring this build, not replaying a cached result.

### F5 still live

```
PROBE_F5 red_arm_before_revive_reason = Some("crashed mid-review; unread mail left for a revive")
PROBE_F5 after_revive_reason          = None
PROBE_F5 after_revive_role            = None
PROBE_F5 after_revive_semantic        = None
PROBE_F5 after_revive_tombstoned_at   = None    <- correct; this one is the revive
```

## The three checks the PM would not take on the coder's word — all three answered, two PASS

### 1. R0-1's path: does re-registration still refuse to inherit? **PASS.**

The true scenario, not a proxy: a seat carrying a port from a **dead** incarnation,
re-registered by a **different** `(pid, proc_start)`, over the shipped
`POST /v1/register`:

```
PROBE_V seeded_stale_port     = Some(61001)
PROBE_V reregister_status     = 200 OK
PROBE_V after_reregister_port = None
```

The inheritance I demonstrated live in R0-1 is closed, on the shipped path, not on
a helper.

**But note what closes it.** The same unconditional line closes R0-1 *and* opens
F1. The fix is correct in effect and over-broad in scope: it cannot tell the seat's
own first bind from a later incarnation, so it treats both as the latter. **R0-1
being closed is not evidence against F1 — it is the same line, seen from the side
where it happens to be right.**

### 2. R0-4 / F0-8: column in both lists, schema bumped, witness writes twice with different values against a REAL `SqliteRegistry`? **PASS, and I proved the witness fires.**

Static, at this head:

```
registry.rs:198  INSERT … cross_session_inbound_accept, rpc_port_intent)
registry.rs:211  ON CONFLICT … rpc_port_intent=excluded.rpc_port_intent
registry.rs:232  .bind(descriptor.rpc_port_intent.map(i64::from))
registry.rs:279  UPDATE … rpc_port_intent = NULL …      (the tombstone act)
migrate.rs:29    pub const SCHEMA_VERSION: u32 = 9;
```

Mutation M3 — remove `rpc_port_intent=excluded.rpc_port_intent` from the
`DO UPDATE SET` clause, nothing else:

```
cargo test --locked -p pij-store        ->  EXIT=101
---- rpc_port_intent_updates_to_a_different_value_and_tombstone_clears_it stdout ----
panicked at crates/store/tests/store_integration.rs:201
test result: FAILED. 15 passed; 1 failed
```

The witness writes `47_781` then `51_948` against a real `SqliteRegistry`
(`store_integration.rs:190-225`) — exactly the shape F0-8 required and exactly what
`FakeRegistry` could not have expressed. Tree reverted after.

### 3. R0-3a: does the receipt NAME which shipped path tombstones a Copilot seat, and say "none yet" plainly? **PASS — and this is the receipt's best line.**

`done-u-spawn-rpc-port.md:19`:

> *"`SqliteRegistry::tombstone` clears the column in the same SQL act that writes
> terminal truth. **There is currently no shipped production caller of
> `Registry::tombstone`; this test proves the adapter branch, not a reachable
> teardown flow.** Reachable terminal handling is the registration supersedes
> branch and spawn-over-tombstone transition above."*

That is precisely what I asked for and precisely the thing that is easiest to omit.
A green test beside that sentence is honest; the same test without it would have
implied a teardown path that does not exist. **Credit, without qualification.**

## Over-correction check — the axis the PM named: PASS. A different axis: FAIL (F5).

The live-id refusal was **not** relaxed to make the tombstoned case convenient:

```
PROBE_V first_spawn_status    = 200 OK
PROBE_V live_collision_status = 400 Bad Request
PROBE_V live_collision_body   = {"ok":false,…,"meta":"seat `pij-probe-live` already exists
                                 and is live — spawn never overwrites a live roster row"}
PROBE_V launches_before/after = 1/1
```

Refused, named, and **a refused collision launches nothing** — the `1/1` is the
half that matters, because a refusal that still spawned a window would be the worse
defect.

The over-correction that *did* happen is F5, on an axis nobody was watching: the
post-mortem. The receipt says revive *"overwrites the old row"* (line 16), which is
literally true and does not name what the row was for.

---

## F8 — NEW, HIGH. F1 falsifies the receipt's own four-way absence model, collapsing exactly the two absences Amendment 2 created the fourth row to keep apart.

`done-u-spawn-rpc-port.md:30-35` states the absence model:

> 1. `rpc_port_intent: None`: **never launched with the flags**; permanent pointer
>    seat until respawn.
> 2. Intent present but Copilot never bound: retry is pointless.

Under F1, **every registered Copilot seat reads `None`** — including every seat
that *was* launched with the flags, whose port was emitted, whose tmux window was
created. So on this build `None` does not mean "never launched with the flags". It
means "launched, then registered", which is every seat that ever binds.

State 2 becomes **unreachable**: a seat can never be observed in "intent present
but never bound", because the intent is gone before anything could observe the
absence of a listener.

SHAPE Amendment 1: *"Three absences, three outcomes — never collapsed."* Amendment 2
added the fourth precisely because *"same observable, different cause, and the
remedy differs."* **F1 collapses rows 1 and 2 into one value**, which is the defect
the table exists to prevent, committed by the code the table was written for.

This is not a second bug — it is F1's consequence, and I raise it separately
because it shows F1 is not "a field gets cleared early". It destroys the
discriminator the whole absence design rests on, and it does so silently: the
receipt's model is internally coherent and describes a build that does not exist.

---

## CHECKED AND NOT RAISED, at this head

Everything in round 1's clean list re-verified against `818cabc2` (identical
`crates`), plus these receipt-level checks:

- **Migration story stated plainly and unfootnoted** (`receipt:7-9`): every
  pre-existing Copilot seat is permanently a pointer seat until respawn, the fleet
  does not upgrade itself, a daemon restart does not change it. **RF13 satisfied.**
  It is true of the data by construction — `ALTER TABLE … ADD COLUMN` without a
  default gives NULL and `row_to_descriptor` maps NULL to `None`.
- **The intent/possession boundary is written down and assigned** (`receipt:28`):
  *"The live-process rule is a read-time obligation owned by unit 2. Unit 1 ships
  no `can_deliver`-adjacent helper."* That is R0-7 closed the way R0-7 asked —
  a boundary stated, not a property assumed. **RF27 verified in code**: the diff
  touches no transport crate.
- **The TOCTOU is acknowledged rather than hidden** (`receipt:14`), and
  NEVER BOUND is kept distinct from dead-or-recycled. R0-6 answered honestly at
  the level unit 1 can answer it.
- **Derived files**: `Cargo.lock` and arch fixtures unchanged and not committed,
  as the packet required. Verified in `git show --stat`. **RF21 clean.**
- **Receipt committed before the done message** — `818cabc2` is on the branch and
  pushed. **RF22 clean.**
- **The coder's own instrument error is disclosed** (`receipt:63`): an unqualified
  `--exact` filter ran zero tests and was discarded before evidence was recorded.
  That is habit 7 caught by the coder in its own tooling — the same error I made
  twice this review — and disclosing it is what makes the other seven falsifiers
  worth reading.
- **The toolchain instrument error is disclosed** (`receipt:75`): the first gate
  invocation resolved `/opt/homebrew/bin/cargo` at rustc 1.95.0 and failed only the
  toolchain stage. Pinning which binary was live is exactly the discipline the
  predecessor plan asked for.
- **`harness checks` unavailability is bounded, not presented as green**
  (`receipt:77`), with the sensor exits named. Disclosed, not hidden, and not a
  finding — it is the known linked-worktree Node limitation.

## MY OWN CONDUCT THIS ROUND

One new instrument error, found after the verdict and disclosed below. Seven now
disclosed across this review (dead red arm;
eyeballed field count; `head`-induced SIGPIPE read as a test failure; a branch
detector that a rename would have silenced; a probe that failed to compile; a
`sed` that matched nothing silently). **None reached a verdict**, and every number
in this report comes from an unfiltered run with the exit code taken from the
command itself.

Tree restored after every probe and mutation: `git status --porcelain` empty,
verified at 03:22:28Z. The coder's worktree was never touched and its HEAD never
moved.

### Instrument error 7, found AFTER the verdict was rendered and disclosed here at 03:29Z

**My branch watcher reported "CRATES CHANGED" on a branch that had not advanced —
it had fallen behind.** I was watching for the fixed head with

```
git diff --name-only 818cabc2 "$REF" -- crates    # non-zero => "something landed"
```

`origin/s109/copilot-rpc` is at `492688b1`, which is an **ancestor** of
`818cabc2`, so that command produced a **reverse diff** — the unit's own code
shown as removals — and my detector read it as a change to review.

```
git merge-base --is-ancestor origin/s109/copilot-rpc 818cabc2   -> true (behind)
git merge-base --is-ancestor origin/s109/u-spawn-rpc-port 818cabc2 -> true (behind)
```

**`git diff A B` answers "do these differ", not "has B advanced past A".** That is
the same class I have been hunting all review: an instrument answering a different
question from the one asked, and agreeing with itself while it does. It is the
more dangerous direction for a reviewer, because **the artefact it produced was a
revert wearing the shape of a fix** — 466 deletions across exactly the eleven files
the unit touched. Had I opened that diff without reading the sign of the line
counts, I would have reviewed the removal of unit 1 as though it were unit 1's
repair.

It cost nothing: the stat was all-negative on the unit's own files, which is not
what a fix looks like, and I checked ancestry before acting. **Fixed by adding a
direction gate** — the watcher now requires the ref to be a *descendant* of the
reviewed head before it reports anything.

This is the third time this review that my own tooling has failed in the direction
of a false signal (`head`/SIGPIPE, the rename-blind detector, now this), and the
second time the fix was a **precondition the probe never checked about itself**.
Recorded rather than quietly corrected, because a reviewer's instruments get the
standard the reviewer applies to a coder's, and because the shipped defect I
refused this unit for is exactly a check that could not see the case it was
written for.

---

## WHAT MOVES THIS TO APPROVE

The PM has ruled the fixes; I am recording only what I will measure.

1. **F1** — a registration whose `spawn_id` matches the descriptor's current
   spawn/revive stamp preserves `rpc_port_intent`; one without clears it.
   I will run M1 and a new mutation that inverts the match, and I will require the
   witness to go red for **both** arms — a fix that only preserves is R0-1 reopened.
2. **F2** — one witness asserting both arms. A test that still cannot fail in the
   first-bind direction is F2 unfixed regardless of what F1's code does.
3. **F5** — the revive publishes the prior incarnation's post-mortem before
   overwriting, **and** the refusal message stops claiming a guarantee that
   narrowed.
4. **F3** — refuse out-of-range loudly; `CHECK` on the column.
5. **F4** — both `orchestration.rs` statements carry the column.
6. **F6** — allocator consults live stamps; the closing fix is recorded as unit 2's.
7. **F8** — the absence model in the receipt matches the build, once F1 is fixed.

I will re-run the full pre-registered mutation set (`ab09e2f9`) plus M1-inverted
against the fixed head, and re-measure the gate there rather than carrying
today's green.
