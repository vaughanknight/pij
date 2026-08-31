# Coder packet — u-pointer + u-drain (wave 4)

**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w4-pointer` · branch `s108/w4-pointer`
**Common contract (read FIRST)**: `docs/plans/108-rust-port/assets/wave-4/COMMON.md`
**PM**: `pij-revolutionary-lungfish`

## Mission

The rung below the socket, and the worker that keeps queued work moving. Both were
carved out of `u-uds` because they **cannot** live in a transport crate: there is
one `Arc<dyn Transport>` and `can_deliver(false)` means ENQUEUE, so nothing inside
`crates/transport` can "select the pointer".

## The ladder, and the rung that does not exist

```
0. not a bound pane seat      -> observe (an in-process consumer owns it)
1. the message is a COMMAND   -> pty. ALWAYS, and ONLY commands. Never a body.
2. a body, seat has a socket  -> byte-exact over the socket (u-uds, inert until u-spawn)
3. a body, no socket          -> composer-idle guard, then ONE pointer line
4. none of the above applies  -> the row STAYS QUEUED and is retried. Never typed.
```

**There is no rung that types a BODY.** The typed-body path is the one thing that
loses messages (an "unverified" typed body marked read, then cleared by Esc or
auto-compact). If you find yourself building a fallback that writes a body into a
composer, STOP and message me — that is the rung wearing a different name.

`Msg.command` exists now, so rung 1 is a field test, not a string sniff. **Nothing
infers a command from a leading slash**: a body may legitimately begin with one.

## The two gates that are NOT the same gate

Wave 3's inversion moved one and kept the other, and conflating them is the
mistake this section exists to prevent:

| gate | signal | status |
|---|---|---|
| seat is `Working` | agent state | **moved** — the transport judges it, because a socket interrupts safely |
| a HUMAN is typing | tmux pane-signals | **STANDS** (Jordan, 2026-08-27) |

**Socket is transport; tmux is politeness.** A socket frame cannot corrupt a
composer, so the residual reason is not corruption — it is that interrupting a
human mid-sentence is rude, and that is Jordan's to lift, not ours.

## What to build

1. **The pointer rung**: composer-idle guard, then exactly ONE pointer line. A
   pointer says a message is waiting; it never carries the body.
2. **Settle and release**: a pointer that has been announced must not re-announce
   forever. The fork's daemon never called `claim()`, so `attempt` never moved,
   `parked` was unreachable, and pointers re-announced every 90 seconds for ever
   (their G25, still open). **Our terminal claim lease stands, and there is ONE
   writer for attempt counting** — do not add a fast path that skips the counter.
3. **The drain/retry worker**: long-lived, claims due rows, respects the lease,
   and preserves attempt accounting across a wake.

## Done bar

* Gate six stages green (COMMON § 2).
* **The full ladder table**, every row, as a test: paneless seat observes; a
  command takes the pty and NEVER the socket; a socketless body gets one pointer
  with the body absent; an undeliverable body stays queued.
* **Exactly one pointer**: prove a second announce does not happen for the same
  claim, and that a released claim CAN announce again. Both halves.
* **The human-typing gate holds** even for a socket-capable seat.
* **Attempt accounting survives a drain cycle** — a mutation that skips the
  counter must fail a test by name, because that mutation IS the fork's live bug.
* Mutation transcripts, composition recipe, assumptions, receipt committed and
  pushed **before** the done message.

## Watch for

* `QueueReason::Busy` is still what an operator sees when a working seat is
  declined; what moved is WHO decides.
* The event attach rule (COMMON § 6): your worker is long-lived, so it passes a
  cursor or subscribes live. `subscribe(None, …)` replays the entire spine.
* Do not widen `ports.rs`. If the ladder needs a seam that is not there, that is
  an ack defect, not an edit.
