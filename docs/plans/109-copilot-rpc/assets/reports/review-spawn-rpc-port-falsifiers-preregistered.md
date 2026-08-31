# Reviewer falsifiers — u-spawn-rpc-port (plan 109, unit 1)

**PRE-REGISTERED.** Written 2026-08-31T02:23Z, before any unit-1 code existed and
before I opened any coder receipt, done-message, commit message or branch diff for
unit 1.

## What I had read at the time of writing

- `assets/SHAPE.md` including **Amendment 1**
- `assets/packet-u-spawn-rpc-port.md` and `assets/packet-reviewer-spawn-rpc-port.md`
- `assets/reports/findings-log.md` (F0-1 … F0-7, and the grading convention)
- `assets/reports/review-verify-falsifiers-preregistered.md` (unit 0's
  pre-registration, read for format calibration only)
- `../108-rust-port/assets/REVIEWER.md`
- The addendum message from the prime relayed by `pij-revolutionary-lungfish`
  (over-correction; content-not-silence discriminators; durable evidence)
- **The shipped pre-unit-1 source** at `s109/copilot-rpc` = `83cad081`, which is
  docs-only and contains **no unit-1 code**. Specifically:
  `crates/core/src/model.rs`, `crates/core/src/ports.rs`,
  `crates/harnesses/src/spawn.rs`, `crates/daemon/src/http/mod.rs` (register +
  spawn handlers), `crates/store/src/registry.rs`, `crates/store/src/migrate.rs`,
  `crates/transport/src/uds.rs` (`can_deliver`).

I had **not** read: any unit-1 receipt, any unit-1 commit, or the coder's tree.

Falsifier = **the observation that would prove the receipt's verdict unsound.**
Not a test that would pass.

---

## Baseline commitments (the decay rule)

Every before-value in this review — schema version, field set, test count, gate
output, descriptor contents, live listeners — is **measured at the moment it is
used**, against a named commit, stamped with wall-clock, and the command is
reported beside the number. **A stale before-value fails silently in the direction
of a pass**, so I will not carry a number measured now into a later section
without re-measuring or explicitly saying it was not re-measured.

Pre-unit-1 baseline facts I have recorded now, and **will re-measure before use**:

| fact | value at `83cad081` | command |
|---|---|---|
| `SCHEMA_VERSION` | `8` | `grep -n 'SCHEMA_VERSION: u32' crates/store/src/migrate.rs` |
| migrations present | `0001`…`0008` | `ls crates/store/migrations` |
| `rpc_port` anywhere in tree | **0 hits** | `grep -rn 'rpc_port' --include=*.rs crates` |
| `--ui-server` anywhere in tree | **0 hits** | `grep -rn 'ui-server' --include=*.rs crates` |
| `SeatDescriptor` field count | **18** | `sed -n '160,253p' crates/core/src/model.rs \| grep -c '^    pub '` |

All five re-run and confirmed at `83cad081`, 2026-08-31T02:24:49Z. **My own
instrument error, disclosed:** I first wrote the field count as 17 from reading
`SeatDescriptor::new`, then counted mechanically and got 18. Corrected in place
before use. The lesson is the one this plan keeps paying for — a number carried
from an eyeball rather than from a command was wrong on the first try.

---

## The structural fact this unit has to answer, recorded before the answer exists

**There is no `revive` in the shipped Rust surface.** At `83cad081`,
`grep -rn 'revive' --include=*.rs crates` returns only doc-comments and a test
string; the daemon exposes `Health, Register, Spawn, Send, Inbox, InboxAck, Seats,
Events, Sidecar` (`crates/daemon/src/http/mod.rs:195-203`) and **no revive route**.
`revive` exists in the TypeScript extension (`.pi/extensions/pij/core/revive.ts`),
which is a different product surface and does not carry
`cross_session_inbound_accept` at all.

The nearest shipped analogue is `POST /v1/register` on an id already in the
roster, which at `crates/daemon/src/http/mod.rs:357-361` **clones the existing
descriptor row** and thereafter overwrites only an enumerated set of fields.
`cross_session_inbound_accept` is **not** in that set — so today a re-registering
seat **inherits the predecessor's stamp**. That is the precedent's own hole, and
`rpc_port` copying it is the stale-port defect the packet names.

I am pre-registering this because it decides what "the shipped revive flow" means
for RF1–RF5 below, and because the answer must come from the coder, not from me
reconciling toward whatever they built.

---

## Class A — the revive transition (packet attack 1). Highest priority.

**RF1 — the transition is asserted only in the forward direction.**
Falsifier: the witness asserts `rpc_port == Some(new)` after revive and **never
asserts the old value is unreachable on a later pass**. Per Amendment 1 this
"passes on a build that leaves the old value reachable". Concretely: no second
observation of the descriptor after the revive, taken after at least one further
daemon pass (tick / sweep / observer cycle / subsequent register).
Severity: **critical**.

**RF2 — a mutation that only clears on the sweep passes.** I will build the
broken build myself: make the stamp inherited rather than replaced (or make the
clear happen in the sweep instead of the act) and assert the coder's witness goes
**RED**. Falsifier: the witness stays green against that mutation. A witness never
observed to fail is a claim (REVIEWER.md habit 1; two of wave 5's regression tests
passed their own mutations).
Severity: **critical**.

**RF3 — "nothing re-stamps the old value" is proved by reasoning, not by a pass.**
Falsifier: the receipt argues no code path writes the old value, rather than
running a later pass and re-reading the descriptor. Absence of a call site is not
absence of the value.
Severity: **high**.

**RF4 — the tombstone clear is a ROW and not an ACT (E-036).** Falsifier: the
clear is verified by the clearing function having been called, by a spine event,
or by an in-memory descriptor — rather than by **re-reading the persisted
descriptor through `Registry::get` after the tombstone**. E-036's exact shape: a
consent revocation that existed as a row and not as an act; a hand detach beaten
twice by the daemon re-attaching. So the honest version also survives **a
subsequent daemon pass**.
Severity: **critical**.

**RF5 — the clear has no restart arm (defect class 11).** Falsifier: the clearing
lives only in the process that heard the tombstone, so a daemon killed between the
tombstone and the next sweep leaves `rpc_port` populated on a dead seat. I will
test this by re-opening the store with a fresh `Registry` and re-reading, not by
reading the live daemon's memory.
Severity: **high**.

## Class B — absence semantics (packet attack 2)

**RF6 — absence is permissive.** Falsifier: any consumer written in this unit
treats `None` as anything other than closed, or uses `== Some(false)` / `is_some()`
where the precedent uses `!= Some(true)`
(`crates/transport/src/uds.rs:135,145`). Both `None` and `Some(false)` must be
closed. Note `rpc_port` is a *port number*, not a bool, so the shape of "closed"
is `None` — and `Some(0)` is the new `Some(false)`: a port value that is not a
usable port must be closed, not merely present.
Severity: **high**.

**RF7 — a stale port reads as a live one.** Falsifier: the descriptor can carry
`rpc_port: Some(N)` while `proc` is `None`, or while `proc` names a process that
`liveness::alive` refuses, with nothing in the unit refusing that combination.
The packet: *"a port asserts nothing without a live proc identity beside it."*
Severity: **high**.

**RF8 — the seam landed in one half** (REVIEWER.md's commonest class). Five halves
must all be present, and I will check each independently:
1. `SeatDescriptor` field + serde attrs matching the precedent
   (`#[serde(default, skip_serializing_if = "Option::is_none")]`);
2. a migration file (successor to `0005_inbound_accept.sql`) **and**
   `SCHEMA_VERSION` bumped from 8 — a column without the bump means
   `require_current_schema` passes on a store that lacks the column;
3. `registry.rs` `row_to_descriptor` read **and** the `put` INSERT column list
   **and** the `ON CONFLICT DO UPDATE SET ... excluded.rpc_port` clause — the
   upsert enumerates every column by hand, so a missed line silently preserves the
   old value on update, which is **exactly the stale-port defect** arriving through
   SQL rather than through Rust;
4. the wire/HTTP seat representation;
5. `SpawnPlan` derivation from `args`, not from the request.
Falsifier: any one of the five missing. Severity: **high** (critical for 2 and 3).

**RF9 — the stamp is derived from the request rather than from the command.** The
precedent derives the fact by scanning the argv actually built
(`crates/harnesses/src/spawn.rs:125-127`) and the doc-comment says *"never derive
either stamp from the request"*. Falsifier: `rpc_port` is copied from a request
field, a config value, or an input parameter without the emitted argv being the
source of truth. This is the config-echo class (defect 10): a reported value that
is actually the configured setting, structurally invisible because the two
coincide by construction whenever the spawn succeeds.
Severity: **high**.

**RF10 — the port is stamped when the flag was NOT emitted.** Falsifier: a
non-Copilot harness, or a Copilot spawn that did not emit `--ui-server --port N`,
gets a non-`None` `rpc_port`. Mirror of `build_spawn_plan`'s refusal at
`spawn.rs:67-75`.
Severity: **high**.

## Class C — path, not branch (packet attack 4)

**RF11 — the witness calls a helper.** Falsifier: the falsifier's cited test
constructs a `SpawnPlan`/`SeatDescriptor` by hand, or calls `build_spawn_plan`
directly, and never goes through `POST /v1/spawn` (`spawn_seat`) and the
registry. The existing precedent has both shapes available —
`crates/harnesses/src/spawn.rs` unit tests (branch) and
`crates/cli/tests/spawn.rs:117-129` + `crates/daemon/src/http/tests.rs:475`
(path) — so "the path version exists for the precedent" is the standard.
Severity: **high**. This is the shape that let a gate exist, be tested, and never
be consulted.

**RF12 — port allocation is untested for collision.** If the unit allocates a port
number, falsifier: two spawns can receive the same port, or allocation consults
nothing about what is already bound / already stamped on a live seat. A recycled
port is a recycled identifier one layer down.
Severity: **medium–high**, rising to high if allocation is silent on failure.

## Class D — the migration statement (packet attack 5)

**RF13.** Falsifier: the receipt does not state **plainly, unfootnoted**, that
*every pre-existing Copilot seat is permanently a pointer seat until respawn*, and
that neither the fleet nor a daemon restart upgrades it. A reader's default
assumption is that the fleet upgrades itself, and that is false.
Severity: **medium**, rising to high if the receipt implies the opposite anywhere.

**RF14 — the three absences get collapsed.** Falsifier: this unit's code or
receipt conflates "no `rpc_port` field" (PERMANENT) with "no listener on the
stamped port" (TRANSIENT-OR-STALE). SHAPE Amendment 1 forbids collapsing them.
Unit 2 consumes this, but the *representation* is decided here: if `None` is the
only absence the descriptor can express, say so and say where the other two live.
Severity: **medium**.

## Class E — over-correction (addendum, ratified after unit 0)

**RF15.** If the unit retracts, restates or relaxes anything — a prior binding, a
precedent's wording, an existing test's assertion — falsifier: something that was
**right** went with the correction. I will diff the constraint, not the prose:
does the surviving text still forbid what it forbade? A retraction that quietly
relaxes a constraint is harder to see than the original error, because the diff
reads as humility.
Severity: **high**.

**RF16.** Falsifier: an existing assertion was **weakened** rather than extended —
e.g. a `!= Some(true)` becoming `== Some(false)`, an exact-equality assert becoming
`is_some()`, or a golden fixture regenerated to match new output instead of the
change being justified. Check the producer, not the fix (E-029/E-031).
Severity: **high**.

## Class F — instruments and evidence

**RF17 — a discriminator that fails by silence.** Falsifier: a probe whose negative
arm is an **absence** (no row, no output, no error), with no demonstration of its
red arm. Per F0-6 the preferred shape yields a **positive artifact in both worlds**.
For my own probes: I will demonstrate the red arm of every discriminator I build,
or say that I did not.
Severity: **high** for the coder's witnesses; binding on me.

**RF18 — evidence not as durable as the claim (F0-7).** Falsifier: the receipt
cites a machine-local absolute path, a scratch directory, a temp file, or a process
that no longer exists, for a claim that is load-bearing. Artifacts belong committed
beside the receipt.
Severity: **medium**.

**RF19 — the number without the command, or the conclusion without the evidence.**
Falsifier: a count, a pass/fail summary, or a "no hits" reported without the exact
command; or output truncated with the verdict kept and the payload dropped. A
filtered runner that matches nothing summarises a hard failure as OK
(REVIEWER.md habit 7).
Severity: **medium**.

**RF20 — the gate was not run by me at the head I review.** I will run
`cargo run --locked -p pij-testkit --bin pij-gate` myself with
`CARGO_INCREMENTAL=0` and a **per-worktree** target dir (SHAPE: no shared
`CARGO_TARGET_DIR`; E-037 serves one coder artefacts built from another's source).
Falsifier: I take a count from the receipt. **If I reproduce a red I will
characterise it and report it — I will not re-run until green** (defect 13).
Severity: binding on me.

**RF21 — derived files committed against the rule.** Falsifier: `Cargo.lock` or an
arch/golden fixture is in the unit's diff, contrary to the packet's
composer-owned rule; or a test regenerated one in the tree it judges (habit 7).
Severity: **medium**.

**RF22 — receipt not committed and pushed before the done message.** Packet
acceptance. Falsifier: receipt absent from the branch, or its commit timestamp
follows the done message.
Severity: **low–medium**.

## Class G — my own conduct

**RF23.** I do not move HEAD in the coder's worktree
(`pij-worktrees/s109-copilot-rpc`). All probes run in
`pij-worktrees/s109-review-spawn-rpc-port` on branch `s109/review-spawn-rpc-port`.
Every mutation I apply is reverted and I say so. I never let a check write to what
it judges. I disclose every instrument error of my own — nine were disclosed across
the predecessor plan and none reached a verdict, which is the only reason the rest
was trustworthy.

**RF24 — ask what would distinguish the two states before trusting an instrument.**
Before I believe any probe of mine, I state what it would print in **both** worlds.
If it prints the same thing in both, it is not an instrument. Unit 0's headline
finding was false because two instruments each answered a different question from
the one asked, agreed, and the agreement read as corroboration.

**RF25 — when a red will not reproduce, MUTATE rather than repeat.** Repetition
separates *rare* from *never*; it cannot separate *rare* from *conditional*, and it
names no mechanism.

---

## Verdict rule, fixed in advance

**APPROVE** only if every one of RF1–RF22 is answered and nothing above trivial
remains. In particular: **no APPROVE while RF2 is unmet** — a transition witness
that has never been observed to fail is a claim, not a witness, and this unit's
entire acceptance is that transition.

---

# AMENDMENT — 2026-08-31T02:35Z, still BEFORE any unit-1 code or receipt existed

Appended, never rewritten: the original text above stands unedited so the record
shows what I committed to before the ruling arrived.

**Coder branch state when this was written:** `s109/copilot-rpc` = `1a4ca0de`,
docs-only; `docs/plans/109-copilot-rpc/assets/reports/` contains no unit-1
receipt. `grep -rn 'rpc_port' --include=*.rs crates` still 0 hits.

## R0-2 was ruled by the PM, and it made RF1 more specific, not less

Ruling: **re-registration on an existing id IS revive in the shipped Rust
surface**, plus the `supersedes` branch. The packet's instruction to follow the
`cross_session_inbound_accept` precedent is **narrowed** to absence semantics
(`None` and `Some(false)` both closed) and explicitly **does not** extend to
inheritance.

Constraint diff as ratified (over-correction check, applied to the ruling itself):

| | binding |
|---|---|
| WAS | revive → assert the old port replaced → assert nothing re-stamps it on a later pass |
| NOW | **re-registration on an existing id MUST NOT inherit `rpc_port`**; a registration carrying no fresh port leaves it **`None`, not stale** — then assert the old value is gone, and that nothing re-stamps it on a later pass |
| UNCHANGED | still a TRANSITION not a filter; a mutation that only clears on a sweep must FAIL; verified by OBSERVING THE DESCRIPTOR, never by the code path having run |

**Nothing that was right left with the correction.** The constraint got *stronger*
— it now binds the path that actually executes instead of one that does not exist.
I record that judgement here rather than in the round report because I am the one
who must not be talked out of it later.

**RF1 is hereby sharpened, not replaced:** the witness must show
`rpc_port == None` after a re-registration that carried no fresh port, read back
from the descriptor, **and** show it still `None` after a further pass.

**RF4/RF5 gain a required disclosure** from the same ruling: the receipt must name
which shipped path actually tombstones a Copilot seat, and **say "none yet"
plainly if that is the answer** (R0-3a: `Registry::tombstone` has zero production
callers). Falsifier: a green tombstone test with no such statement — it implies a
shipped clearing path that does not exist.

**RF8.3 and the whole of RF8 rise to HIGH** the moment the column lands, and gain
a third requirement: the witness must **UPDATE an existing row**, not merely
insert one. INSERT-only coverage cannot distinguish a correct
`ON CONFLICT DO UPDATE SET` from a missing one — the two coincide by construction
on a fresh row.

## Gate baseline, measured now and re-measurable later

```
cd pij-worktrees/s109-review-spawn-rpc-port          # my worktree, not the coder's
export PATH="$HOME/.cargo/bin:$PATH" CARGO_INCREMENTAL=0
cargo run --locked -p pij-testkit --bin pij-gate
```

At product commit `83cad081`, 2026-08-31T02:32:58Z, wall 57s, **exit 0**:

```
  toolchain PASS  rustc 1.98.0 == pin
  lock      PASS  Cargo.lock matches the manifests, and the tree
  fmt       PASS  cargo fmt
  clippy    PASS  cargo clippy
  test      PASS  cargo test
  arch      PASS  9 crates, 0 violations
pij-gate: all stages green
```

Six stages, all green, **before** unit 1. This is the number that lets me attribute
a later red: at the pre-unit-1 head the gate does not fail. Per the decay rule I
will **re-run it at the head I actually review** and report that run's own output;
this baseline is not carried forward as evidence about a later commit. If I
reproduce a red I will characterise it (isolated, under load) and report it — I
will not re-run until green (defect 13).

---

# AMENDMENT 2 — 2026-08-31T02:50Z, still BEFORE any unit-1 code or receipt existed

`s109/copilot-rpc` = `e026081f`; a 10-minute bounded poll ending 02:49:25Z saw the
branch take only docs commits and **zero** matches for the field in `crates`.

R0-6 and R0-7 were ruled together. Constraint diffs, not prose:

| ruling | effect on my falsifiers |
|---|---|
| The field records **INTENT** and must be **named** as intent — "spawn launched this seat with `--ui-server` on N", never "a listener exists" | **RF9 inverts.** Deriving from argv is now not merely acceptable but *required*, and the finding moves to the NAME and DOC: a name that promises possession is the defect. New falsifier **RF26** below. |
| Three absences become **four**: "NEVER BOUND — spawn emitted the flag, nothing ever listened", distinct from "died / port recycled" | **RF14 gains a fourth row.** Falsifier: the receipt or the code collapses never-bound into died-or-recycled. The remedy differs — retry is reasonable for a dead seat and pointless for a port never bound — so collapsing them is not a wording problem. |
| The **live-proc rule is a READ-TIME obligation owned by unit 2**, and unit 1 **must not ship any `can_deliver`-adjacent helper that reads the port without consulting `proc`** | **RF7 splits.** Against unit 1 it is no longer "the descriptor may not carry a port without a live proc" — that is unsatisfiable at stamp time. It becomes: unit 1 ships **no reader** that would let unit 2 inherit the rule as already-handled. |

**Over-correction check, applied to these rulings.** Did anything right leave?
No. The obligation was not dropped — it was **relocated and written down**, with a
prohibition attached to the half that cannot discharge it. The weaker outcome was
available (delete the sentence from the packet as unsatisfiable) and was not taken.

**RF26 (new) — a name or doc-comment that promises possession.** Falsifier: the
field, its accessor, or its doc-comment states or implies that a listener exists,
rather than that spawn emitted the flag. Severity: **high** — the predecessor plan
shipped a `parked` count that reported a config value and a `reader-read` that
meant a machine, both because a field's name promised more than its writer knew.
A consumer reads the name, not the rider.

**RF27 (new) — unit 1 ships a reader.** Falsifier: any `can_deliver`-shaped
function, method, or `impl` in unit 1's diff that returns a routing decision from
the port field. Severity: **high**. It is out of scope by the packet ("no transport
code") *and* it is the mechanism by which the read-time rule would die in the seam.

## A defect in MY OWN detector, found by this ruling and fixed before it cost anything

My branch poll watched for the literal string `rpc_port` in `crates`. **Ruling 1
may rename the field** — `ui_server_port`, `rpc_port_requested`, anything that
reads as intent. My detector would then have watched for a string that never
appears and reported "no code yet" **for ever**, with a negative guaranteed before
it ran: F0-2's exact shape (`jq` searching for state that could not be there) and
RF17's (a probe whose failure mode is silence), **in my own instrument.**

Replaced with a name-independent detector: any change to `crates/` on the branch,
plus a diff listing. It cannot be defeated by a rename because it does not know the
name. Recorded here rather than quietly fixed — a reviewer's instrument gets the
same standard as a coder's, and this one would have failed silently in the
direction of "nothing to review yet", which is the direction that ends in an
APPROVE nobody checked.

**Every falsifier in this file tracks the field by ROLE — the value stamped at
spawn when `--ui-server --port N` was emitted — never by spelling.**

---

# AMENDMENT 3 — 2026-08-31T03:2xZ, BEFORE the fixed head exists

Registered now so I cannot choose the acceptance criteria after seeing which ones
the fix happens to satisfy. Branch state at writing: `s109/u-spawn-rpc-port` =
`818cabc2`, REFUSED, `crates/` byte-identical to `3cbd2820`.

## The mechanism has a name: COINCIDENCE BY CONSTRUCTION

Ratified. The shipped acceptance test's registration **always followed a fresh
spawn**, so *"the port survived registration"* and *"the port was just allocated"*
were indistinguishable in every run the gate ever made. **No number of green runs
could separate them, because the fixture never produced a case where they differ.**

This is the same shape as F0-8 (the contract writing equal values over equal
values), defect class 10 (the config echo), and unit 0's blank composer. Third
distinct instance on this plan. It is the plan's signature defect and it is not
about carelessness: **every one of these fixtures is correct-looking, and the
assertion is true — of a world where the two states coincide.**

## RF28 — the F1 witness contract. One test, three observations.

Ratified shape. I will measure exactly this:

1. spawn → register with the **MATCHING** `spawn_id` → port **PRESERVED**;
2. register **AGAIN** on that same seat, **no fresh allocation**, non-matching
   `spawn_id` → port **CLEARED**;
3. the old value never reappears on a later pass.

**Falsifiers:**
- Only (1) → R0-1 reopened. **Critical.**
- Only (2) → F1 unchanged. **Critical.**
- Every registration in the fixture preceded by a fresh spawn → the witness
  **cannot fail in the direction that matters**, which is exactly the test that
  shipped. **Critical, and it is the one to check first**, because such a test
  looks complete and passes honestly.

I will verify (3) by reading the fixture for the *provenance of each
registration*, not by reading its assertions. An assertion cannot tell me whether
a fresh allocation preceded it; only the call order can.

## Mutations for the fixed head — named now, applied then

Each must produce a **RED with the predicted signature**. A mutation that produces
a *different* red proves the witness defends an adjacent property.

- **M6 — predicate ALWAYS matches** (the clear never fires). Re-creates R0-1's
  inheritance. Predicted: arm (2) red — a stale port observed after a
  non-matching registration.
- **M7 — predicate NEVER matches** (clear always fires). **This mutation is
  literally the code being replaced.** Predicted: arm (1) red — the port gone
  after the seat's own first bind. **If the new witness does not go red under M7,
  it cannot detect the defect it was written for**, and that is a critical finding
  regardless of how the fix reads.
- **M1 (from `ab09e2f9`) — delete the clear entirely.** Predicted: arm (2) red.
  Retained because it is the pre-registered original and its signature is known.
- **M3 (from `ab09e2f9`) — drop the column from `ON CONFLICT DO UPDATE SET`.**
  Already fires; re-run at the fixed head, because a witness proven at one head is
  not proven at another.
- **M8 — publish the F5 post-mortem event AFTER the overwrite instead of before.**
  Predicted: the F5 witness red, because the reason it would carry is already
  gone. Tests that the ordering, not merely the event, is what was fixed.

## Re-verification criteria for the rest, so none is closed by assertion

| finding | what I will observe, not read |
|---|---|
| **F3** | `65536`, `70000`, `-1` written to the column → `Registry::get` **refuses loudly**, not `Some(0)` / `Some(4464)` / `Some(65535)`. Plus the `CHECK` present in the migration. |
| **F4** | `grep -n rpc_port_intent crates/store/src/orchestration.rs` → non-zero, in **both** statements; and a merge observed to leave the alias `None`. |
| **F5** | The post-mortem readable **after** a revive, from the spine, with a real payload — `put`'s event payload is `''` today, so an event that carries nothing is the row problem relocated. And the refusal message no longer claims a guarantee that narrowed. |
| **F6** | The allocator consults live stamps. I will not require a race witness; I will require that the exclusion set is no longer a single `Option<u16>`. |
| **F8** | The receipt's four-way absence model observed to hold **on the build**: a seat launched with the flags reads `Some(N)` after binding, so `None` really does mean "never launched with the flags". This is F1's arm (1) restated as a documentation check, and it is how I will know the receipt describes the build that exists. |

## Standing on the gate

I will **re-measure `pij-gate` at the fixed head** and report that run's own output.
Today's green at `3cbd2820`/`818cabc2` is not carried forward: it is the number
that proves the gate cannot see F1, not a number that says anything about a later
commit. If I reproduce a red I will characterise it and report it — I will not
re-run until green.

---

# AMENDMENT 4 — 2026-08-31T03:4xZ, BEFORE the F9 fix exists

Branch state at writing: `s109/u-spawn-rpc-port` = `27a161b1`, REFUSED on F9.
`grep -rn "PIJ_SPAWN_ID" --include=*.rs crates` → **0 hits**.

## The class has a name: CAPABILITY ASYMMETRY

Ratified. **The fixture can produce a case production cannot reach.** Distinct
from coincidence by construction, which is *the fixture cannot produce a case
where the two states differ*. Same root — **the fixture's capabilities are not the
shipped path's capabilities** — and the same consequence: a green test about a
code path no seat will ever take.

Recorded because the two are easy to conflate and their tells are opposite:
coincidence by construction shows up as *a test that cannot go red*; capability
asymmetry shows up as *a test that goes red correctly, for a scenario nothing can
enter*. All five of my mutations fired against the round-3 witness. **Mutation
testing cannot detect capability asymmetry** — the witness is sound, the input is
unobtainable — which is why the check has to be "where did this value come from",
asked of the fixture and answered from the shipped launcher.

## RF29 — the correlator must be EMITTED, and it must be THE SAME VALUE

Ruled fix: `PIJ_SPAWN_ID=<spawn_id>` in the spawn argv beside `PIJ_SESSION_ID`.

**Falsifiers, in the order I will check them:**

1. **Not emitted.** `grep -rn "PIJ_SPAWN_ID" --include=*.rs crates` still 0, or the
   argv built by `build_spawn_plan` does not contain it. Trivial to check, so it is
   first.
2. **Emitted with a DIFFERENT value than the descriptor carries.** This is the
   failure I expect if anything goes wrong, and it is invisible to a naive check.
   `spawn_id` is minted in `launch_seat` **before** the lock and stamped on the
   descriptor at `http/mod.rs:658`; the argv is built by `build_spawn_plan` from
   `SpawnPlanInput`, which today has **no `spawn_id` field**. So the coder must
   thread the *same* value through. If a second id is minted for the argv instead,
   the emitted value and the stamped value diverge, every Rust test that reads the
   launch id from the response still passes, and **F9 persists silently**.
   Falsifier: the value in `plan.args` ≠ `descriptor.spawn_id`.
3. **Emitted under a different NAME than the consumer reads.** The registering
   bridge reads `process.env.PIJ_SPAWN_ID`
   (`.pi/extensions/pij/adapters/rust-runtime.ts:245`). A rename, a typo, or
   `PIJ_LAUNCH_ID` would be **invisible to every Rust test in the workspace**,
   because no Rust test crosses that boundary. Falsifier: string inequality
   between the name emitted in `crates/harnesses/src/spawn.rs` and the name read
   in `rust-runtime.ts`. **I will compare the two literals myself**; nothing in
   `pij-gate` covers this seam.

   **Recorded as a GAP, not only as a check.** We have **no instrument that spans
   this seam** — no Rust test crosses into the TypeScript bridge, and `pij-gate`
   does not either. The only available check is a human reading both literals.
   That is a proof-surface hole, and it stays a hole after I have read them: my
   reading closes this instance, not the class.
4. **Emitted for the wrong harnesses. RULED: `PIJ_SPAWN_ID` RIDES EVERY SPAWN.**
   The correlator is about **registration identity** — *"is this the incarnation I
   launched"* — which is asked on every re-registration of every harness. RPC is
   merely the first consumer whose failure made it visible. Falsifier: the emission
   is gated on `Harness::Copilot` or any subset. A gate would give a Claude seat and
   a Copilot seat **different registration paths for no stated reason**, and the
   difference would sit unexplained until someone changed one and not the other.
   Narrowing, if ever wanted, belongs at the **consumer**.

5. **Keying on `PIJ_SESSION_ID` instead.** Considered and **ruled unsound**, so
   recorded here as a closed option rather than an untried one. `PIJ_SESSION_ID` is
   the **seat** id, identical across incarnations by design, so it cannot separate a
   first bind from a later incarnation: the discriminator would discriminate
   nothing and collapse straight back to F1 or R0-1. The correlator must be
   **incarnation-scoped**, which `spawn_id` already is. Falsifier: a fix that
   correlates on the seat id, however it is spelled.

## RF31 — ARM1 GREEN IS THE CLOSING CONDITION FOR F9. Binding, and stated as the criterion rather than left as an implication of RF30.

The witness runs through the **shipped launcher end to end**, and a test-supplied
environment may appear **only as the contrast arm**.

**F9 closes when, and only when:**

```
arm1 SHIPPED-LAUNCH   at_spawn Some(N) -> after_bind Some(N)
```

observed through `POST /v1/spawn` then `POST /v1/register`, with the registration
carrying **only what the launcher put in the process's environment**. Nothing about
the receipt's wording, the predicate's shape, or arm 2's green closes F9. **Arm 1
is the acceptance.**

Corollary I will hold myself to: if arm 1 goes green while arm 2 also goes green
**for the wrong reason** — e.g. the clear stops firing at all — that is R0-1
reopened, which is why M6 and M7 are re-run rather than assumed.

## RF30 — the witness arm built ONLY from what a launched process is handed

Ruled. **Not a variant of the existing arms.** The registration must be
constructed from the launch environment and nothing else.

**Falsifier, and this is the whole point:** the new arm obtains the launch id from
the **spawn response**, the descriptor, or the registry. Any of those is the
capability the process does not have, and the arm would then be arm 2 wearing a
new caption.

**What I will accept:** the arm reads the `PIJ_SPAWN_ID=<value>` pair **out of the
argv the launcher actually built** — the `FakeTmux` recorder already captures it,
which is how the existing test asserts `--ui-server --port N` — and passes that,
with `PIJ_SESSION_ID`, as the entire input to the registration. Deriving from the
launch command is exactly the channel a real process has.

## Two new mutations, named before the code

- **M9 — remove `PIJ_SPAWN_ID` from the argv.** This is the F9 defect itself.
  Predicted: the RF30 arm goes red with the port cleared after a first bind. **If
  it stays green, the new arm is decorative** and F9 is unfixed behind a passing
  test. Critical.
- **M10 — emit `PIJ_SPAWN_ID` with a freshly minted value instead of the stamped
  one.** Predicted: the RF30 arm goes red. This is falsifier RF29.2 as an
  injection, and it is the one that separates *"we emit something"* from *"we emit
  the correlator"*. **If M9 reds and M10 does not, the arm is checking presence
  rather than identity** — the same distinction as unit 0's `messageId`
  server-assigned-versus-echoed question.

M1, M3, M6, M7, M8 all fired at `27a161b1`; I will **re-run M7 and M6** at the
fixed head because the predicate may change shape, and take M1/M3/M8 as proven at
`27a161b1` unless the diff touches their code — stated so it is a decision and not
an omission.

## The rest

| item | what I observe |
|---|---|
| **F8** | With F9 fixed, arm 1 of the F9 probe must read `Some(N)` after bind, so absence really does mean "never launched with the flags". F8 closes **only** on that observation, not on receipt wording. |
| **LOW (message)** | A plain `pij spawn` collision must not be told about `revive`. Per-command wording restored. |
| **Gate** | Re-measured at the fixed head, including the main merge if it has landed by then. Today's 44s green at `27a161b1` is not carried. |

## Standing

Every falsifier here tracks **the value's provenance**, never its spelling: the
question is always *"could a launched process have known this, and is it the same
value the row holds"*.
