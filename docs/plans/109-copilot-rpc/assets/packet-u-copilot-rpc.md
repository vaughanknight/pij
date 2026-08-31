# Coder packet — u-copilot-rpc (unit 2, HELD until unit 1 + the revive verb land)

**Read first**: `SHAPE.md` including **Amendments 1, 2 and 3**;
`reports/findings-log.md` (F0-1 … F0-8 — every binding below traces to a **graded**
finding); the unit-0 receipt and its three review rounds; and
`../108-rust-port/assets/REVIEWER.md`.

Nothing here rests on a self-report. Unit 0 falsified **four of six** claims in a
design document that honestly marked itself as unverified, and one finding of its own
was refuted on review — **the transport you are building is not the transport that was
designed.**

## What the wire actually does (all first-party, all graded)

- **A session must be LIVE ON A HELD CONNECTION.** An assigned `--session-id` does not
  remove this: `session.send` returns `-32603` until a `session.resume` is held open. A
  one-shot resume whose socket closed does **not** work. Once resumed, registration is
  **process-global** — a separate one-shot send succeeds while the resume is held
  elsewhere.
  → **A long-lived RPC connection per seat. Connection lifetime is daemon-owned**, with
  reconnect, ownership and shutdown attached.
- **No ordering guarantee within a burst.** Two sends written in order on one connection
  **executed in reverse**, with busy state established and both frames `queued`. The
  mechanism is concurrent handling of pipelined frames — **not** a pre-busy race, so
  *"establish a turn first"* is a mitigation that does not work.
  → **One in flight per seat; the next only after the previous is OBSERVED complete**
  (observed, not acked).
- **The readiness call is a false positive.** `getForeground` returns the matching id
  with workspace and capabilities *before* any resume, while sends fail; and it answers
  identically **during** a live turn, so it is not a busy gate. **Never latch a
  pre-resume positive.**
- **`Content-Length` is a BYTE count.** Under-declare → uncorrelatable `-32700` with
  `"id":null`; over-declare → **silent hang**, the server awaiting bytes never sent.
  → `Buffer.byteLength` / encoded length, **never** code units. **A framing defect is
  indistinguishable on the wire from a hung seat or a slow model.**

## The gate is a HARD PRECONDITION, on consent

Both modes run a turn in a live human session while a draft is pending. The buffer is
**not** destroyed — that claim was refuted, and the correction matters: **a correct rule
resting on a false reason is weaker than the same rule resting on a true one, because
the reason is what gets re-examined.**

Consult the `InteractionGate` for any seat with a pane, **on the RPC path itself**. A
fast path around the gate **disables it without deleting it, and the code still reads as
guarded**. Quiet-pane shape: recognised layout, owned sensor, **two stable blank
observations**.

**`"socket is transport, tmux is politeness"` does not hold here.** True for Claude UDS
— a socket frame cannot corrupt a composer. False for Copilot RPC: it can seize a turn
from a human mid-sentence.

## Possession is YOUR obligation, at read time

Unit 1 stamps **intent** — *"spawn launched this seat with `--ui-server` on N"* — and
**cannot** verify possession: `descriptor.proc` is `None` at stamp time by construction.

**You refuse a port whose seat has no live proc, at delivery.** Written down because the
alternative is *a rule both halves think the other owns* — nothing fails, nothing logs,
and both receipts are honest.

`can_deliver` = wrong harness, or a command, or `rpc_port.is_none()` → false. Honour the
four absences separately (SHAPE Amendment 2) — **never bound** and **died/recycled**
produce the same observable and have opposite remedies, and **"no session at a live
endpoint" is a DEFECT, not a routing outcome**: falling silently to the pointer rung
there would have hidden the exact bug unit 0 found.

## The arrival grade is a TYPE-LEVEL contract

An RPC ack proves **the harness accepted the message** — never that a turn ran, measured
in the field at 6 of 9 dropped late-session.

**No constructor, no branch, no `impl From` on the RPC path may produce a stronger
grade** — if the type can express it, someone will one day pass it — **plus** a test
asserting the output grade of a successful send, so a future "upgrade" goes red. A
consumer reads the name, not the rider. Load-bearing wakes need a **mechanical chaser**:
tick, grace, last-event age, then a direction.

## Witness standards, each earned

- **Falsifiers pre-registered in a file before code**, each **demonstrated capable of
  failing** — including the **red arm**. A probe that cannot return the other answer is
  a formality.
- **Discriminate by CONTENT, not by silence** (F0-6). A witness whose failure mode is an
  absence cannot tell you it ran.
- **Turn a reviewer's disclosed mistake into an executable guard** — the standard set by
  unit 0's coder, whose byte-length probe **exits nonzero on an ASCII-only body** so the
  test cannot pass for the wrong reason the reviewer's void probe did. Cited by the
  prime as expected practice.
- **Every falsifier names the path it executes on**, reachable through the **shipped
  drain** — driving `can_deliver` by hand proves the branch and not the path, which is
  exactly how a gate can exist, be tested, and never be consulted.
- **Real store, not a fake, for anything persistent** (F0-8): a fake cannot express an
  upsert defect, so a fake-backed test is green in both worlds.
- Unfiltered runs redirected to a file, exit code from the invocation itself.
- **Never block on a modal.** Ask inline, invariant 9.
