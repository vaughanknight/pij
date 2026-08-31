# Review round 0 — u-spawn-rpc-port (plan 109, unit 1)

**PRE-CODE.** Written 2026-08-31T02:2xZ against `s109/copilot-rpc` = `83cad081`,
which is docs-only: `grep -rn 'rpc_port' --include=*.rs crates` → **0 hits**. No
unit-1 code exists, no receipt has been read. These findings are about the surface
the unit has to land on, filed now because the fifth habit says a falsifier that
arrives while the design is still free to change is the cheap one.

Falsifiers pre-registered in
`review-spawn-rpc-port-falsifiers-preregistered.md`, committed at `4a5811ac`
before this file.

My worktree: `pij-worktrees/s109-review-spawn-rpc-port`, branch
`s109/review-spawn-rpc-port`. I have not moved HEAD in the coder's tree.
`CARGO_TARGET_DIR` unset, so `target/` is per-worktree (SHAPE / E-037).

---

## R0-1 — `register` INHERITS the spawn-time stamp, on the shipped path. Following the precedent verbatim ships the stale port. **Severity: HIGH.**

**Demonstrated, both arms** — transcript and probe source committed at
`review-spawn-rpc-port/R0-1-probe-transcript.md`:

```
PROBE at_spawn          = Some(true)
PROBE after_register    = Some(true)    <- inherited across re-registration
PROBE red_arm_status    = 200 OK
PROBE red_arm_never_set = None          <- the probe CAN print the other answer
```

Both requests went over a real listener through `POST /v1/spawn` → `spawn_seat`
(`crates/daemon/src/http/mod.rs:429`) and `POST /v1/register` → `register`
(`:261`). No handler was called directly.

**Mechanism.** `register` clones the existing roster row
(`crates/daemon/src/http/mod.rs:357-361`) and then overwrites only an enumerated
field set (`:362-381`): `harness, folder, pane, proc, parent, relay`, plus
`spawn_id / model / provider / effort` **only when absent**.
`cross_session_inbound_accept` is not in that set, so it survives untouched.

**Failure mode for `rpc_port`.** A Copilot seat dies; the harness restarts in the
pane under the same `PIJ_SESSION_ID`; it re-registers. The descriptor keeps
`rpc_port` from the **dead incarnation**, which the new process does not own.
`can_deliver` reads true. The connect may succeed against whatever now owns that
port. That is the packet's *"a stale port is worse than a missing one because it
is plausible"*, arriving through the one path that is guaranteed to run.

**Why the existing rule is right for the fields it was written for and wrong for
this one.** The comment at `:366-367` says *"A launcher observation is stronger
than the process describing its own argv later. Registration fills absent facts;
it never downgrades a stamp."* True for `spawn_id`, `model`, `provider`, `effort`:
each describes **the launch event**, which is immutable and stays true after the
process dies. `rpc_port` describes **a resource held by one process incarnation**.
When the incarnation changes, the launch facts stay true and the port becomes a
lie. Inheriting is correct for the first class and is the defect for the second.

**What would prove it fixed:** re-run the probe shape with `rpc_port` in place of
`cross_session_inbound_accept` and observe `None` (or a fresh value) after the
re-registration, read back through `Registry::get`, not from the response body
alone.

## R0-2 — there is no `revive` in the shipped Rust surface, so Amendment 1's binding acceptance has no path to execute on. **Severity: HIGH — needs a ruling, not an invention.**

`grep -rn 'revive' --include=*.rs crates` → 7 hits, **all doc-comments or a test
string**; the only implementation named `revive` in this repo is
`.pi/extensions/pij/core/revive.ts`, a different product surface which does not
carry `cross_session_inbound_accept` at all. The daemon's route table is
`Health, Register, Spawn, Send, Inbox, InboxAck, Seats, Events, Sidecar`
(`crates/daemon/src/http/mod.rs:195-203`) — **no revive route**. `POST /v1/spawn`
*refuses* an existing id (`:486-491`, "spawn never overwrites a roster row"), so
spawn cannot be the revive path either.

Amendment 1 binds this unit to: *"revive, assert the old port is replaced, then
assert nothing re-stamps the old value on a later pass."* On this surface there is
nothing named revive to drive.

**The hazard is not that the requirement is hard — it is that the cheapest way to
satisfy it is to add a helper and test the helper.** That is RF11, and it is the
shape the packet names: *a gate that exists, is tested, and is never consulted.*

**Ruling needed before the receipt, from the PM/prime, not from me and not from
the coder alone:** which shipped path IS revive for unit 1?
- (a) re-`register` on an existing id — demonstrated live in R0-1, and the honest
  candidate;
- (b) `register` with `supersedes` — the native session boundary at `:293-332`,
  which tombstones the predecessor and writes a **new** id;
- (c) none of them, and the Rust surface has no revive yet.

If the answer is (c), Amendment 1's binding acceptance for unit 1 is **untestable
as written** and must be restated. **Restating it must not relax it** — per the
ratified over-correction rule, I will diff the constraint and not the prose: if a
"revive transition" requirement becomes "we stamp at spawn and revive is unit 2's
problem", something that was right left with the correction.

## R0-3 — `tombstone` clears nothing today, and there are THREE writers of it, two of which are hand-enumerated SQL. **Severity: HIGH.**

The packet requires *"tombstone clears it; the clearing is an ACT verified by
observing the descriptor afterwards"*. There are three places that tombstone, and
they do not share an implementation:

1. **`SqliteRegistry::tombstone`** (`crates/store/src/registry.rs:257-301`) —
   `UPDATE seats SET tombstoned_at = ?2, tombstone_reason = ?3, seq = ?4`. Three
   columns, named by hand. A new `rpc_port` column is **not** touched here unless
   this statement is edited.
2. **`register`'s supersede branch** (`crates/daemon/src/http/mod.rs:388-403`) —
   mutates the descriptor struct and calls `Registry::put`, i.e. the full upsert.
   A struct-level clear lands here and **only** here.
3. **`SqliteOrchestration` descriptor reconciliation**
   (`crates/store/src/orchestration.rs:186-212`) — the survivor gets
   `UPDATE seats SET harness, pane, folder, model, provider, effort` (six columns,
   already **excluding** `cross_session_inbound_accept`) and the alias gets
   `UPDATE seats SET tombstoned_at, tombstone_reason` (two columns). A merged
   survivor therefore keeps whatever port it had before the merge.

A clear implemented in the descriptor struct satisfies (2) and silently misses
(1) and (3). That is the workspace's commonest defect class — **a seam landed in
one half** — pre-positioned.

### R0-3a — and `Registry::tombstone` has ZERO production callers. **Severity: HIGH.**

```
grep -rn 'tombstone\s*\(' crates   # Rust-regex, whole tree
```

Every call site is a test, a contract test, a fake, or a delegating wrapper inside
`mod tests` (`crates/daemon/src/pane_observer.rs:589`, inside the `mod tests` that
opens at `:524`). Nothing in the shipped daemon, CLI, worker, observer or
watchdog calls it.

So a witness of the form *"tombstone the seat, observe `rpc_port` is `None`"* that
calls `registry.tombstone(...)` **proves the branch and not the path** — the
method it drives is one no shipped code invokes. It is E-036 one layer out and it
is exactly the packet's attack 4.

Note the direction this cuts: it is not an argument for skipping the clear. It is
an argument that **the clear cannot be witnessed honestly through
`Registry::tombstone` alone**, and that the receipt must say which shipped path
tombstones a Copilot seat in practice — and if the answer is "none does yet", say
that plainly rather than let a green test imply otherwise.

## R0-4 — the upsert enumerates every column twice by hand; a missed line in the `DO UPDATE SET` clause preserves the stale value while the INSERT looks correct. **Severity: MEDIUM (pre-emptive), HIGH if it lands.**

`crates/store/src/registry.rs:191-206`: `INSERT INTO seats (...19 columns...)`
followed by `ON CONFLICT(id) DO UPDATE SET harness=excluded.harness, ...` naming
all seventeen mutable columns individually.

A new `rpc_port` added to the INSERT list and the bind list but **not** to the
`DO UPDATE SET` clause yields: correct on first write, silently frozen at the old
value on every subsequent write. That is the stale-port defect arriving through
SQL rather than through Rust, and **it is invisible to any test that only ever
inserts** — the two behaviours coincide by construction on a fresh row. Any
witness for this must write the seat twice with different values and read back
through `Registry::get`.

Related and required regardless: `SCHEMA_VERSION` is `8`
(`crates/store/src/migrate.rs:29`) with migrations `0001`…`0008`. A new column
needs its own migration file **and** the bump — `require_current_schema` compares
the pragma to the constant, so a column added without the bump passes the schema
check on a store that does not have the column.

---

## CHECKED AND NOT RAISED

Weighed and clean at `83cad081`, so the next reader knows these were considered
rather than missed:

- **`build_spawn_plan` derives the stamp from the built argv, not the request**
  (`crates/harnesses/src/spawn.rs:125-127`), and refuses `accept_inbound` for the
  wrong harness (`:67-75`). The precedent to copy is sound; my concern is only
  whether unit 1 copies it or takes a request field (RF9).
- **The precedent's absence semantics are correct** —
  `crates/transport/src/uds.rs:135,145` use `!= Some(true)`, so `None` and
  `Some(false)` are both closed, in both `can_deliver` and `deliver`. Not a
  finding; recorded because RF6 is measured against exactly this shape.
- **The precedent has a PATH-level witness, not only a branch one** —
  `crates/cli/tests/spawn.rs:117-129` and
  `crates/daemon/src/http/tests.rs:475`. The standard RF11 will hold unit 1 to
  already exists in the tree.
- **`spawn` refuses to overwrite a roster row** (`http/mod.rs:486-491`), and my
  probe re-confirmed a collision launches no extra process. So a stale port cannot
  arrive via a duplicate spawn; re-registration (R0-1) is the vector.
- **The registry `put` is one transaction over spine + row**
  (`registry.rs:180-231`), so a stamp cannot be half-written. Persist-before-mutate
  holds.
- **`row_to_descriptor` refuses half a process identity** (`registry.rs:94-108`).
  Relevant because RF7 wants `rpc_port` to assert nothing without a live proc
  beside it, and the pattern for refusing an unusable pair is already here.
- **No shared `CARGO_TARGET_DIR`** in my environment; verified empty, so E-037
  cannot bite this review.
- **The TypeScript extension is not in scope** and carries no
  `crossSessionInboundAccept` (`grep` → 0 hits under `.pi/extensions`). I am not
  raising the TS/Rust divergence as a unit-1 finding; it is the reason R0-2 needs
  a ruling.

## MY OWN INSTRUMENT ERRORS, DISCLOSED

1. **Dead red arm on the first probe run.** I reused one `ProcIdentity` for the
   spawned seat and the never-spawned seat, so the control registration was
   refused by the #19 alias guard and measured nothing. The green arm was already
   correct and is unaffected; the red arm was re-run with its own
   `(pid, proc_start)`. Full transcript of both runs in
   `review-spawn-rpc-port/R0-1-probe-transcript.md`.
2. **A number from an eyeball.** I first recorded `SeatDescriptor` as having 17
   fields by reading the constructor, then counted mechanically and got 18.
   Corrected in place in the pre-registration file before use.

Neither reached a finding.

## TREE RESTORED

The probe was appended to `crates/daemon/src/http/tests.rs`, run, and reverted
with `git checkout -- crates/daemon/src/http/tests.rs`. `git status --porcelain`
afterwards shows only my own untracked report directory;
`git diff --stat -- crates` is empty. The probe source is preserved as a `.txt`
artifact rather than left in the tree, so nothing I wrote can be mistaken for
product code or picked up by a gate.

## STATUS

**No verdict.** Unit 1 has not landed. These are pre-code findings against the
surface it must land on. R0-2 needs a ruling before the coder finishes, because it
decides what the unit's binding acceptance test is allowed to drive.

---

# ADDENDUM — 2026-08-31T02:37Z, appended not rewritten. Still pre-code.

`s109/copilot-rpc` = `1a4ca0de`, docs-only. R0-2 has since been **ruled**:
re-registration on an existing id **is** revive on this surface, the binding was
restated *stronger* (re-registration MUST NOT inherit `rpc_port`), and the packet's
"follow the precedent" instruction was narrowed to **absence semantics only, not
inheritance**. Over-correction check applied to the ruling itself: nothing that was
right left with it — the constraint now binds the path that actually executes.

## R0-5 — the upsert's UPDATE path is covered for exactly two of seventeen columns, and it is vacuous **by construction** for the rest. **Severity: HIGH.** Mechanism named by mutation, not by repetition.

R0-4 warned that a column missing from `ON CONFLICT DO UPDATE SET` is invisible to
an insert-only test. I went and measured whether the existing suite would catch it.
**It would not** — and the reason is sharper than "no coverage".

Three single-column mutations of `crates/store/src/registry.rs:197-206`, each
applied alone, each reverted, full workspace suite each time:

| mutation (removed from `DO UPDATE SET`) | `cargo test --locked --workspace` |
|---|---|
| `cross_session_inbound_accept=excluded.…` | **EXIT=0, green** |
| `pane=excluded.pane` | **EXIT=0, green** |
| `tombstoned_at=excluded.tombstoned_at` | **EXIT=101, RED** |

The red, verbatim and untruncated:

```
---- the_sqlite_registry_honours_the_same_contract_the_fake_does stdout ----
thread '…' panicked at crates/testkit/src/contract.rs:137:5:
assertion `left == right` failed: putting a live descriptor must clear the prior tombstone
  left:  …, tombstoned_at: Some(4), …
 right:  …, tombstoned_at: None, …
test result: FAILED. 14 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out
error: test failed, to rerun pass `-p pij-store --test store_integration`
```

**The mutation named the mechanism, which repetition could never have done.** The
SQL update path *is* exercised — `SqliteRegistry` runs `registry_contract`
(`crates/store/tests/store_integration.rs:156`). The gap is that **every update in
that contract writes the same value over the same value**: step 2 puts
`null_descriptor`, step 3 puts the identical `null_descriptor`, step 6 puts it
again (`crates/testkit/src/contract.rs:60-66, 130-141`). For any column whose value
does not *change* between two writes, a missing `excluded.<col>` and a present one
produce byte-identical rows. The only columns it catches are `tombstoned_at` and
`tombstone_reason`, and only because the intervening `registry.tombstone(&id, …)`
call changes them **out of band**.

This is E-027's class — *a test that cannot fail* — and defect 10's shape: the two
behaviours **coincide by construction**, so the test is not weak, it is
structurally incapable of distinguishing them. It reads as full round-trip coverage
and is real for two columns out of seventeen.

**Consequence for unit 1, and it is direct.** The coder following the
`cross_session_inbound_accept` precedent inherits a contract that cannot see the
defect. `rpc_port` added to the INSERT list and the binds but missed in
`DO UPDATE SET` will be green on this suite, at every stage of `pij-gate`, while
being frozen at the stale value for ever after a re-registration — i.e. **the exact
defect this unit exists to prevent, shipped green.**

**What would close it:** a witness that writes one seat **twice with a DIFFERENT
`rpc_port`** and reads back through `Registry::get` against a real `SqliteRegistry`.
Not a fake — `FakeRegistry` stores descriptors in a map and cannot express this
defect at all, so a fake-backed test is guaranteed green in both worlds. That is
RF17's shape (a probe whose negative arm cannot occur) sitting in the fixture rather
than in the assertion.

I am not raising the contract's own gap as a unit-1 defect — it predates this unit
and belongs to whoever owns `registry_contract`. I am raising that **unit 1 cannot
rely on it**, and that a receipt citing a green suite as evidence for the update
path would be citing an instrument that answers a different question.

## MY OWN INSTRUMENT ERRORS — third one, disclosed

3. **I ran the first M3 measurement through `| grep -E … | head -40` and read
   `PIPESTATUS=101` as a test failure.** Both halves were wrong in the same command,
   and both are habit 7's exact shape: `head` closing the pipe gave cargo SIGPIPE
   (so the 101 reported my truncation, not the suite), while the filter had already
   dropped every line that would have told me which. **A filtered runner whose
   filter matches nothing, and a truncation that keeps the verdict and discards the
   payload — in one pipeline.** Re-run unfiltered to a file: `EXIT=0`, no failures.
   Every number in the table above comes from an unfiltered run redirected to a
   file, with the exit code taken from `$?` on the cargo invocation itself.

   I caught it only because I had printed an exit code at all. Had I trusted the
   filtered output I would have reported a red that did not exist — the inverse of
   the "summarised as OK" failure, and just as untrustworthy.

## TREE RESTORED — again

Each mutation applied alone to `crates/store/src/registry.rs`, run, then
`git checkout -- crates/store/src/registry.rs`. After the last one,
`git diff --stat -- crates` is empty and `git status --porcelain` shows nothing.
One mutation at a time: my first attempt at the `tombstoned_at` mutation
accidentally removed `seq=excluded.seq` in the same edit, which would have
confounded the result; I noticed before running it and isolated the mutation to a
single column — the diff is quoted above so the isolation is checkable.

---

# ADDENDUM 2 — 2026-08-31T02:4xZ. Still pre-code. Two structural findings about the STAMP ITSELF.

Both arrived from asking the packet's own rule — *"a port asserts nothing without a
live proc identity beside it"* — what it would take to satisfy it on this surface.

## R0-6 — the precedent stamps INTENT; a port needs POSSESSION. A stale port can be born on the happy path, with no dead predecessor anywhere. **Severity: HIGH.**

`cross_session_inbound_accept` is derived by scanning the argv actually built
(`crates/harnesses/src/spawn.rs:125-127`): it records **"we passed
`--settings {crossSessionInbound:accept}`"**, not "Claude accepted it". For a
boolean capability the harness honours deterministically, intent and outcome
coincide and the stamp is honest.

**For a port they do not coincide.** *"Spawn emitted `--ui-server --port N`"* does
not establish that anything is listening on `N`. Copilot may fail to bind — the
port may already be held, by another seat, by an unrelated process, or by a
previous incarnation that has not yet released it. The descriptor is then stamped
with a port **the seat never owned**: field present, `can_deliver` true, and the
connect may succeed against whatever does own it. That is the packet's own
definition of the dangerous case — *"plausible"* — reached **without any dead
predecessor and without any recycling**, on the first spawn, on the happy path.

SHAPE Amendment 1's three-absences table names *"no listener on the stamped port"*
and attributes it to **"seat died, port recycled"**. That attribution is
incomplete: the same observable is produced at birth by a bind that never
succeeded. Same symptom, different cause, and the remedy differs — retry is
reasonable for a dead seat and pointless for a port the seat could never bind.
**Do not let the receipt collapse them.**

**And there is no allocator to inherit.** Across all product code
(`crates/*/src`, excluding `mod tests`) the only TCP bind in the workspace is the
daemon's own listener (`crates/daemon/src/lib.rs:409`); `crates/cli/src/client.rs`'s
`TcpListener` is inside `#[cfg(test)] mod tests` (module opens at `:504`), as are
both in `crates/cli/src/bounce/tests.rs` and all three in
`crates/daemon/src/http/tests.rs`. `crates/core/src/config.rs` has no port field —
every "port" in it is the hexagonal-architecture sense. So unit 1 is writing the
**first** port allocator in this workspace, with no precedent to copy and no
existing collision test to extend (RF12).

The obvious implementation — `TcpListener::bind("127.0.0.1:0")`, read the assigned
port, **drop the listener**, pass `--port N` to Copilot — is a TOCTOU by
construction: between our release and Copilot's bind, anything may take `N`. It is
the standard trick and it is exactly the wrong shape here, because its failure mode
is a stamped port owned by a stranger.

**What would prove this handled:** the receipt states which of the three it does —
(a) verify possession after launch before stamping, (b) stamp and treat
"no listener" as its own distinguishable absence, or (c) declare the race
out of scope for unit 1 and name where it is closed — and the choice is
observable in the descriptor, not only argued.

## R0-7 — the packet's "live proc identity beside it" rule is UNSATISFIABLE at stamp time on this surface. **Severity: MEDIUM — needs a stated resolution, not silence.**

The coder packet says: *"A port asserts nothing without a live proc identity beside
it."* But `spawn_seat` writes a **pre-bind** row: `descriptor.proc` is `None` at
the moment the descriptor is written, asserted as a deliberate property by the
shipped test — `assert_eq!(descriptor.proc, None, "spawn writes a pre-bind row")`
(`crates/daemon/src/http/tests.rs:474`). The `proc` identity only arrives later,
when the harness itself registers.

So at the exact instant `rpc_port` is stamped, **there is by construction no proc
identity beside it.** The rule cannot be satisfied at stamp time; it can only be
satisfied at *read* time, by a consumer refusing a port whose seat has no live
`proc`. That consumer is unit 2.

This is not a contradiction to be argued away — it is a boundary that has to be
**written down**, because the alternative is unit 1 believing unit 2 enforces it
and unit 2 believing unit 1 did. That is the workspace's commonest defect class
(*a seam landed in one half*) in its most expensive form: **a rule both halves
think the other owns.**

**Falsifier:** the receipt asserts the rule is honoured without naming where.
Severity rises to **high** if unit 1 ships a `can_deliver`-adjacent helper that
reads `rpc_port` without consulting `proc`, because unit 2 will consume it.

## TREE — untouched by these two

R0-6 and R0-7 are read-only findings: `grep` and `sed` only, no build, no mutation.
`git status --porcelain` clean. Reported separately from the mutation work above so
nobody has to guess which findings cost a tree change.
