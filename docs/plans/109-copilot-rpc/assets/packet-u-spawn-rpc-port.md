# Coder packet — u-spawn-rpc-port (unit 1, lands ALONE)

**Read first**: `SHAPE.md` **including Amendment 1**, then
`reports/findings-log.md` (F0-1 is the one that shapes this unit), then
`../108-rust-port/assets/REVIEWER.md` — thirteen defect classes and seven habits, each
from a finding that got past a gate.

## Scope

Stamp `rpc_port` on the seat descriptor **at spawn**, when spawn actually emitted
`--ui-server --port N`. Nothing else. **No transport code** — unit 2 consumes this
field and is dispatched separately.

Precedent to follow rather than invent: `cross_session_inbound_accept`. Stamped only
when spawn emitted the setting; **`None` and `Some(false)` are both closed.**
**Absence must not be permissive.**

## Why the ordering is forced

A Copilot endpoint is a **spawn-time capability, not a discoverable one.** No runtime
command turns one on, so a seat spawned without `--ui-server` is unreachable directly
for its entire life. The transport cannot land first — it would read a field that
exists for no seat already alive.

**Migration story, to be stated in your receipt and not footnoted:** every pre-existing
Copilot seat is **permanently a pointer seat until respawn**. The fleet does not
upgrade itself and no daemon restart changes it.

## The hard part: a stale port is worse than a missing one

A missing port is honest — `can_deliver` is false and the seat takes the pointer rung.
A **stale** port is *plausible*: the field is present, `can_deliver` says true, and the
connect may **succeed against whatever now owns that port**.

- **Revive allocates FRESH and overwrites.** It never inherits a dead incarnation's
  port.
- **Tombstone clears it.**
- The clearing and the re-stamping are **ACTS, verified by observing the descriptor
  afterwards** — never by the code path having executed. (E-036: a consent revocation
  that existed as a ROW but not as an ACT — tombstoning a seat left its tap running,
  and a hand detach was beaten twice by the daemon re-attaching.)
- A port asserts nothing without a **live proc identity beside it**.

### Binding acceptance — a TRANSITION test, not a filter

Unit 0 graded that a Copilot session must be **live on a held connection**, so unit 2
will hold a long-lived connection per seat. That makes **a held connection itself a
recycled identifier**, and this unit owns the descriptor half of it:

> revive → assert the old port is **replaced** → and assert **nothing re-stamps the old
> value on a later pass**.

A mutation that only clears on the sweep must **fail**. Asserting merely that the new
port is stamped passes on a build that leaves the old value reachable.

## Rules

- Falsifiers **pre-registered in a file before code**, and each **demonstrated capable
  of failing** — red against a deliberately broken build — before its green counts. A
  regression test green from birth is a claim, not a witness.
- Every falsifier **names the path it executes on**, and that path must be reachable
  through the **shipped** spawn/revive flow. Driving a helper by hand proves the branch
  and not the path — which is exactly how a gate can exist, be tested, and never be
  consulted.
- Per-worktree `target/`. No shared `CARGO_TARGET_DIR`.
- Derived files (`Cargo.lock`, arch fixtures) are **composer-owned** — declare what you
  need in the receipt; do not commit them.
- Receipt is a file, committed and pushed **before** your done message.
- **Stop and ask** rather than inventing. On the predecessor plan six coders did and
  none was penalised; two shipped better than what was ruled.
