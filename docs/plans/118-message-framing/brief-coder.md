# Coder brief — plan 118: message framing (tail marker + generation label)

From: pij-dominant-vicuna (o-prime). Reply: `pij send pij-dominant-vicuna "<msg>"`.
ACK with objections or "ack clean" BEFORE building. Load BOTH /pij and /builder skills.
Jordan asked for the tail marker DAYS ago; it was recorded as PRD req-0007 and never built.
This is that debt plus one addition he asked for today.

## Two changes, one formatter

### 1. TAIL MARKER — `[/pij]`
Every message pij injects into a composer is framed at BOTH ends: the existing head
marker AND a closing `[/pij]`. Reason (Jordan's): when several messages land in one
turn or back-to-back, the recipient must be able to parse each message's exact extent —
no body can be mistaken for the start, continuation, or end of another.

### 2. GENERATION LABEL — say it came from pij-rs
Jordan: "messages from pij-rs should say from pij-rs." A recipient must be able to tell
WHICH daemon delivered a message while two generations run side by side. Pick the
minimal shape that reads well in a pane and does not break the head marker's existing
parse; propose it in your ACK before building (e.g. `[pij-rs from <seat>]`). Whatever
you choose must be the SAME in every renderer.

## THE REAL WORK IS THAT THERE ARE THREE RENDERERS, NOT ONE
The frame is currently produced in at least three places:
- `crates/transport/src/uds.rs:309` — socket path, wraps in a cross-session-message envelope
- `crates/daemon/src/pointer/mod.rs:43-44` — `render_pointer` (with an @machine variant)
- `crates/daemon/src/pointer/mod.rs:64` — `render_final_pointer` (the parked reminder)
req-0007 anticipated this: "if the frame turns out to be rendered in more than one place,
that is a one-artifact-one-formatter violation to fix as part of this row, not to
replicate into." So: **introduce ONE framing function, make all three call it**, and add
a test that fails if a fourth renderer is added that does not. Do not add the tail marker
three times.

Check for a fourth: grep the whole workspace for `[pij from` and for any other place a
message body is composed for a pane.

## Constraints
- The head marker's existing shape is load-bearing for the self-echo exemption in the
  interaction gate (`crates/harnesses/src/interaction.rs` records injected payloads to
  avoid the daemon holding against its own text). If you change the frame, the gate must
  still recognise pij's own injections — check it and say so; a broken self-echo exemption
  makes the daemon veto on its own output.
- Machine-qualified senders (`<seat>@<machine>`) must keep working — a remote sender is
  named by ADDRESS because two machines can hold seats with the same name.
- Do not touch the legacy TypeScript renderer in this plan; rs only. Note in your findings
  whether legacy needs the same change for parity and let the o-prime decide.

## Test bar (red-first; a compile error is not a red witness)
- Two messages delivered back-to-back: both boundaries present, each body's extent
  unambiguous. Prove it RED first (today there is no tail marker at all).
- Every renderer emits the same frame — one test over all call sites, not one per site.
- Self-echo exemption still recognises a framed injection.
- Machine-qualified form still renders.

## Scope
- Worktree /Users/jordanknight/pi-hacking/pij-worktrees/s118-framing, branch s118/message-framing.
- Fence: crates/transport/src/uds.rs, crates/daemon/src/pointer/**, wherever the shared
  framing function lands (crates/core or crates/daemon), crates/harnesses only if the gate
  needs it, tests, docs/plans/118-message-framing/**.
- Forbidden: .harness/**, skills/**, the TS extension, other plans' folders, main directly.
- Gate: `~/.cargo/bin/cargo run -p pij-testkit --bin pij-gate` — read the VERDICT BLOCK.
- Done bar: PR open + CI green. Do NOT merge.
