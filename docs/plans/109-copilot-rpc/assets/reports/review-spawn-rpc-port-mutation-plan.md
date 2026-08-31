# RF2 mutation plan — pre-registered before unit-1 code exists

Written 2026-08-31T02:36Z. `s109/copilot-rpc` = `1a4ca0de`, docs-only;
`grep -rn 'rpc_port' --include=*.rs crates` → 0 hits; no unit-1 receipt on the
branch. Committed now so the mutations cannot be chosen after seeing which ones
the coder's tests happen to survive.

**Why this file exists.** REVIEWER.md habit 1: *re-run the PM's mutations
yourself; a witness that has never been observed to fail is a claim.* Two of wave
5's regression tests passed their own mutations. And habit 6: *when a red will not
reproduce, MUTATE rather than repeat* — a mutation that reproduces the original
signature proves the witness watches the thing it was written for; one that
produces a *different* failure proves the opposite, and is worth knowing before
the verdict.

All mutations are applied in **my** worktree
(`pij-worktrees/s109-review-spawn-rpc-port`), one at a time, reverted with
`git checkout --` after each, with the restoration stated in the round report.
I never mutate the coder's tree.

For each: the mutation, **which shipped defect it re-creates**, and **the exact
signature I expect**. A mutation that produces a *different* red is itself a
finding — it means the witness defends an adjacent property, not this one.

---

## M1 — restore inheritance (the defect R0-1 demonstrated)

**Mutation.** In `register` (`crates/daemon/src/http/mod.rs`), delete whatever
line resets `rpc_port`, so the field falls through from the cloned row exactly as
`cross_session_inbound_accept` does today.

**Re-creates.** The shipped R0-1 behaviour: seat dies, harness restarts in the
pane under the same `PIJ_SESSION_ID`, re-registers, descriptor keeps the dead
incarnation's port.

**Expected signature.** The unit's acceptance test fails with the *old port
observed after re-registration* — `Some(<old>)` where `None` (or a fresh value)
was asserted.

**If it stays green:** the witness does not execute the register path at all
(RF11), or it asserts on a hand-built descriptor rather than the one read back.
**Critical finding.**

## M2 — clear on the sweep instead of in the act (E-036, one layer out)

**Mutation.** Move the clear out of the request path into any later pass — a tick,
the pane observer, the pointer worker — so the value is eventually correct but
**stale at the moment the descriptor is next read**.

**Re-creates.** The packet's named failure: *"a mutation that only clears on the
sweep must fail"*; and E-036 itself, a consent revocation that existed as a row
and not as an act, where a hand detach was beaten twice by the daemon re-attaching.

**Expected signature.** The acceptance test fails at the **first** observation
after re-registration, not at the later one.

**If it stays green:** the witness observes only after a settling delay or a tick,
so it is a filter and not a transition — precisely what Amendment 1 forbids.
**Critical finding**, and worse than M1 staying green, because the test would look
like a transition test in the receipt.

## M3 — drop `rpc_port=excluded.rpc_port` from the upsert (R0-4)

**Mutation.** In `crates/store/src/registry.rs`, remove `rpc_port` from the
`ON CONFLICT(id) DO UPDATE SET` clause only. Leave the INSERT column list and the
binds intact.

**Re-creates.** Correct on first write, silently frozen at the old value for ever
after.

**Expected signature.** Any witness that writes the seat **twice with different
port values** and reads back through `Registry::get` fails on the second read. Any
witness that only ever inserts stays green **by construction** — the two
behaviours coincide on a fresh row.

**Therefore this mutation is a coverage probe, not only a fault injection.** If
every test in the unit stays green under M3, the unit has no UPDATE-path coverage
for the field, which is the finding regardless of what the receipt claims.
Severity if so: **high**.

## M4 — stamp the port without the flag (config echo, defect class 10)

**Mutation.** In `crates/harnesses/src/spawn.rs`, set the port from the input
struct rather than deriving it from the argv actually built — the shape the
existing code deliberately avoids at `:125-127`.

**Re-creates.** A reported value that is actually the configured one. Structurally
invisible in ordinary tests **because the two coincide whenever the spawn
succeeds** — only a case where the flag was *not* emitted can tell them apart.

**Expected signature.** A test that spawns a harness for which `--ui-server` is
not emitted observes a port where it asserted `None`.

**If it stays green:** the unit has no negative case, and "stamped only when
emitted" is unwitnessed. Severity: **high**.

## M5 — `Some(0)` / an unusable port value (RF6, absence semantics)

**Mutation.** Have the spawn path stamp `Some(0)` when allocation yields nothing
usable, instead of `None`.

**Re-creates.** The precedent's `Some(false)` case in the shape a port number
takes: present-but-closed read as present-and-open. `cross_session_inbound_accept`
handles this with `!= Some(true)`; a numeric field has no such natural guard.

**Expected signature.** Any consumer-side or descriptor-side assertion that
"closed" excludes `Some(0)` fails.

**If nothing goes red:** absence is permissive for the unusable-value case, which
is the finding. Severity: **high** if unit 2 is expected to read this field
directly.

---

## Rules binding me while I run these

- One mutation at a time; `git checkout --` after each; state the restoration.
- **A mutation that produces a different signature than predicted is reported as
  such**, not quietly re-labelled. Predicting the shape in advance is the whole
  point — a prediction adjusted after the result is not a prediction.
- I report **every** red I produce, including ones that turn out to be my own
  error, and including any I cannot explain.
- I never re-run until green.
