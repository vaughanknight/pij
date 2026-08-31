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

---

# AMENDMENT 1 — units 1 and 2 reshaped on unit 0's GRADED verdict

Evidence: `assets/reports/findings-log.md` (F0-1 … F0-5) and
`assets/reports/review-verify-round-2.md`. Every binding below rests on a **graded**
finding — reproduced or refuted by the reviewer, never on a self-report.

## The seam change: a long-lived per-seat connection (F0-1)

The assigned `--session-id` was correct all along; `session.send` failed because **the
session must be LIVE ON THE CONNECTION**. A one-shot `session.resume` whose socket
closed did not work; a held resumed connection did, and once resumed the registration
is **process-global** — a separate one-shot send succeeded while the resume was held
elsewhere.

So unit 2 owns a **long-lived RPC connection per seat**, not a per-message connect.
**Connection lifetime becomes daemon-owned**, with reconnect, ownership and shutdown
attached. `can_deliver` = wrong harness, or a command, or `rpc_port.is_none()` → false.

### Binding acceptance for unit 1 (revive)

**A held connection is itself a recycled identifier.** Re-stamping `rpc_port` is NOT
sufficient: the old connection must be **closed as an ACT**, or the daemon holds a live
socket to whatever now owns the old port while the descriptor truthfully advertises the
new one.

Tested as a **transition, not a filter**: revive, assert the old connection is CLOSED,
then assert **nothing re-establishes it**. *Asserting only that the new port is stamped
passes on a build that leaves the old socket open forever.*

## The gate: a CONSENT guard (F0-2, justification refuted, rule upheld)

Hard precondition inside `can_deliver`, honoured **on the RPC path itself** — a fast
path around the gate disables it without deleting it, and the code still reads as
guarded. Owned sensor, **two stable blank observations**.

Founded on **consent**: both modes run a turn in a live human session while a draft is
pending. **Not** on data loss — the buffer survives, and the earlier claim that it did
not was refuted. `"socket is transport, tmux is politeness"` does not hold here: a
Copilot RPC frame cannot corrupt a buffer, but it **can seize a turn from a human
mid-sentence**, which a Claude UDS frame cannot.

## Ordering: we make it or it does not exist (F0-3)

**One in flight per seat; the next sent only after the previous is OBSERVED complete
(observed, not acked).** Verbatim, ratified.

The mitigation is **serialize-and-await**. It is explicitly **not** "establish a turn
first" — with busy held fixed, batched frames still reversed.

## Framing: bytes, and a defect you cannot see (F0-5)

`Content-Length` from **encoded bytes**, never code units.

Acceptance is a **discriminating** test, per config-echo doctrine — *our client being
bytes-native by construction is not the proof*: a body whose byte length differs from
its UTF-16 length (em-dash) must round-trip, **plus** a deliberate wrong-length probe
witnessing that the defect is otherwise indistinguishable from a hung seat.

The client needs its own response deadline, because **the transport's own silence is
one of its failure modes** — and a timeout has three causes (malformed frame,
enqueued-but-slow, dead seat) which at-least-once retry treats identically, correctly
for one and wrongly for another.

## Three absences, three outcomes — never collapsed

- **No `rpc_port` field** — never launched with `--ui-server`; cannot acquire it while
  alive. **PERMANENT.** Pointer rung for the seat's whole life; retrying is pointless.
- **No listener on the stamped port** — refused: seat died, port recycled.
  **TRANSIENT-OR-STALE.** Queue and retry — and a *successful* connect to a port the
  seat no longer owns is a defect, not a success.
- **No session at a live endpoint** — connect fine, framing fine, "Session not found".
  **A DEFECT, not a routing outcome.** Falling silently to the pointer rung here would
  have hidden exactly the bug unit 0 found.

## Readiness (F0-4)

`getForeground` equality is **not** sufficient readiness and is **not** a busy gate.
**Never cache a pre-resume positive** — it caches a false positive.

---

# AMENDMENT 2 — the stamp records INTENT, and the live-proc rule is unit 2's

From pre-code review findings R0-6 and R0-7. Both are about the **stamp**, not about
revive, and together they define the boundary between the two units.

## The field records INTENT and must be NAMED as intent

The precedent (`cross_session_inbound_accept`) is derived from the argv actually built:
it records *"we passed the setting"*, not *"the harness accepted it"*. For a boolean the
harness honours deterministically, **intent and outcome coincide** and the stamp is
honest.

**A port is not that.** *"Spawn emitted `--ui-server --port N`"* does not establish that
anything is listening on N. A failed bind — port held by another seat, an unrelated
process, or an unreleased predecessor — yields a descriptor stamped with a port **the
seat never owned**: field present, `can_deliver` true, and a connect that may succeed
**against whatever does own it**. That is the dangerous "plausible" case reached **on
the first spawn, with no dead predecessor and no recycling.**

So the field means *"spawn launched this seat with `--ui-server` on N"* and **not** *"a
listener exists"*, and its name and doc comment must say so. This plan family has
already shipped a `parked` count that reported a config value and a `reader-read` that
meant a machine — both because **a field's name promised more than its writer knew.**

## Three absences become FOUR

| absence | cause | remedy |
|---|---|---|
| no `rpc_port` field | never launched with `--ui-server` | **PERMANENT** — pointer rung for the seat's life |
| **NEVER BOUND** | flag emitted, nothing ever listened | **retry is POINTLESS** |
| no listener on a stamped port | seat died, port recycled | transient-or-stale — queue and retry |
| no session at a live endpoint | connect fine, "Session not found" | **a DEFECT, not a routing outcome** |

The original table attributed "no listener" solely to death-and-recycling. **The same
observable is produced at birth by a bind that never succeeded**, and the remedies
differ — so collapsing them would have been the exact defect the table exists to
prevent, committed inside the table itself.

## The live-proc rule is a READ-TIME obligation, owned by UNIT 2

`spawn_seat` writes a **pre-bind row**: `descriptor.proc` is `None` when the descriptor
is written, asserted as a deliberate property by a shipped test. So at the instant
`rpc_port` is stamped there is **by construction no proc identity beside it.**

The packet's rule — *a port asserts nothing without a live proc identity beside it* —
is therefore **unsatisfiable at stamp time**. It is satisfiable only at **read time**,
by a consumer refusing a port whose seat has no live proc.

> **Written down here because the alternative is unit 1 believing unit 2 enforces it and
> unit 2 believing unit 1 did — a rule both halves think the other owns.** Nothing
> fails, nothing logs, and both receipts are honest.

**Binding on unit 1:** ship no `can_deliver`-adjacent helper that reads `rpc_port`
without consulting proc. If one ships, unit 2 consumes it and the rule dies in the seam.
**Binding on unit 2:** refuse at delivery, not at stamping.

A receipt asserting the rule is honoured **without naming where** is itself a finding.

