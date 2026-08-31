# Coder packet — u-uds-open (wave 6)

**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w6-uds-open` · branch `s108/w6-uds-open`
**Common contract (read FIRST)**: `docs/plans/108-rust-port/assets/wave-6/COMMON.md`
**PM**: `pij-revolutionary-lungfish`

## Mission

Turn the socket transport on.

## What changed underneath you

`UdsTransport` has shipped INERT since wave 3, refusing every seat whose
descriptor lacks `cross_session_inbound_accept: Some(true)` — because nothing
could stamp it. Two things now can:

* **`u-spawn`** stamps it truthfully, from the argv it actually emitted, and only
  when `--accept-inbound` really went on the command line.
* **`u-tap`** feeds `InteractionGate`, so the politeness rule has a sensor.

## What to build

The flip, and its proof. There is deliberately little code here: the mechanism was
built and tested in wave 3 and has been waiting for an honest precondition.

1. An accept-stamped seat DELIVERS over the socket.
2. An unstamped seat still refuses, and falls through unchanged.
3. **Re-verify the drop decoder against the CURRENT Claude build.** It ships marked
   UNPROVEN ON THIS CONNECTION SHAPE and has never been observed to fire.
   s105 measured (Claude 2.1.251) that no negative acknowledgement arrives on the
   authenticated connection; if that has changed, the receipt vocabulary changes
   with it and I want to know before we cut over, not after.

## Done bar

* Gate six stages green.
* **A live end-to-end**, per E-025 — spawn a real Claude seat with
  `--accept-inbound`, send it a body, and observe it ARRIVE. A transcript in the
  report. This unit's whole value is that the thing works against the real world;
  a fake proving it proves the fake.
* The unstamped-seat refusal still holds, with its mutation.
* The re-verification note: what you observed, on which Claude build, with the
  exact frame you sent.
* Receipt committed and pushed **before** the done message.

## Watch for

* **`Delivered { origin: InjectedToTransport }` and nothing stronger**, unless you
  can observe more. Bytes accepted by a socket is not the model reading it, and
  the whole receipt vocabulary exists because an earlier implementation said
  `confirmed` having observed nothing (E-023).
* The human-typing gate still applies. Socket is transport, tmux is politeness.
* A command still takes the pty. Claude renders a socket-delivered `/compact` as
  text.
* If the live behaviour differs from what wave 3 recorded, **your measurement wins
  and you tell me**. That is a finding, not an inconvenience.
