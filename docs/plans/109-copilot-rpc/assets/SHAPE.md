# Plan 109 — Copilot RPC delivery

Jordan's target: **pij talks DIRECT to Copilot and Claude Code**; pi and omp stay
queue consumers because their in-process path is better. The Claude half is done and
ahead of the fork. The Copilot half has never been scoped: no transport, no
`rpc_port` on the descriptor, no `--ui-server` emission — so under the current ladder
**a Copilot seat is permanently a pointer seat**.

Design input: `s105/claude-socket-transport` @ `63dbe9ae`,
`docs/plans/105-claude-socket-transport/assets/u-copilot-rpc-design-input.md`.
Read it. Its §8 marks per claim what is first-party and what is report from #311.

## The structural fact that drives the sequencing

A Copilot endpoint is a **spawn-time capability, not a discoverable one.** Claude
binds its own socket and writes a record we can find afterwards. Copilot has no local
endpoint at all unless launched with `--ui-server --port N`, and **no runtime command
can turn one on**. A seat spawned without it is unreachable directly for its entire
life; the only remedy is respawn.

So the descriptor amendment cannot follow the transport — the transport would be
reading a field that exists for no seat already alive.

## Units, in order. Each lands ALONE.

### u-copilot-verify (unit 0) — BLOCKING, no transport code

First-party verification of §8 against the **installed Copilot binary**. Nothing in
the design input about Copilot RPC is first-party: the flag, the framing,
`mode:enqueue`, the `messageId` requirement and the readiness call are all report
from #311, and **nobody has pointed them at the real build**. An absence of
contradiction is not corroboration.

A divergence is a **finding**, not an error, and it reshapes the units below it.

### u-spawn-rpc-port (unit 1) — descriptor amendment, alone

`rpc_port` stamped at spawn when spawn actually emitted `--ui-server --port N`, on
the precedent of `cross_session_inbound_accept`: stamped only when emitted, `None`
and `Some(false)` both closed. **Absence must not be permissive.**

**Revive re-stamps FRESH and overwrites; tombstone clears; the clearing is an ACT
verified by observing the descriptor afterwards** (E-036 — a consent revocation that
existed as a ROW but not as an ACT). A stale port is worse than a missing one because
it is *plausible*: field present, `can_deliver` true, and the connect may succeed
against whatever now owns that port.

Migration story, stated and not footnoted: **every pre-existing Copilot seat is
permanently a pointer seat until respawn.** The fleet does not upgrade itself and no
daemon restart changes it.

### u-copilot-rpc (unit 2) — transport, consuming the stamped field

`can_deliver` = wrong harness, or a command, or `rpc_port.is_none()` → false. The
command carve-out and normal-outcome-not-error come free from R3-AMEND-3.

**E52 as a TYPE-LEVEL CONTRACT.** An RPC ack proves *the harness accepted the
message*, never that a turn ran — measured in the field at 6 of 9 dropped
late-session. So the RPC path must have **no constructor, no branch, no `impl From`**
that can produce a stronger grade, plus a test asserting the output grade of a
successful send so a future "upgrade" goes red. A consumer reads the name, not the
rider.

Load-bearing wakes need a **mechanical chaser** — tick, grace, last-event age, then a
direction. Never a supervisor's eye, and never an assumption that delivered implies
acted.

## Standing requirements

- **Falsifiers pre-registered, in a file, before code.** Wave-entry requirement.
- Every falsifier **demonstrated capable of failing** — red against a deliberately
  broken build — before its green counts.
- Per-worktree `target/`. No shared `CARGO_TARGET_DIR`: it serves one coder artefacts
  built from another's unpushed source (E-037).
- Derived files (`Cargo.lock`, arch fixtures) are **composer-owned**, regenerated in
  their own typed commits.
- Receipts are files, committed and pushed **before** the done message.
