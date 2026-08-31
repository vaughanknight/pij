# Coder packet — u-copilot-verify (unit 0, BLOCKING)

**Read first**: `../SHAPE.md`, then the design input at `s105/claude-socket-transport`
@ `63dbe9ae`, `docs/plans/105-claude-socket-transport/assets/u-copilot-rpc-design-input.md`,
**especially §8**. Also `docs/plans/108-rust-port/assets/REVIEWER.md` — thirteen defect
classes and seven habits, all from findings that got past a gate.

## Why this unit exists

**Nothing about Copilot RPC in the design input is first-party.** The `--ui-server
--port N` flag, the Content-Length framing, `mode:"enqueue"`, the `messageId`
requirement and the readiness call are all report from fork issue #311. Nobody has
pointed any of it at the Copilot binary installed on this machine.

You are not writing transport code. **You are producing evidence.**

## What to produce

A file, `assets/reports/u-copilot-verify.md`, committed and pushed, that answers each
claim with an **observation**, and for each states: the exact command, the exact
output (or the exact absence), and whether it CONFIRMS, DIVERGES, or is
UNDETERMINED.

Claims to verify, each independently:

1. The installed binary accepts `--ui-server --port N` and actually listens on N.
   Prove it by connecting, not by the absence of an error on launch.
2. Whether the endpoint speaks vscode-jsonrpc over TCP with Content-Length framing.
3. Whether `session.send` exists, what it returns, and whether a returned
   `messageId` is server-assigned.
4. What `mode:"enqueue"` does — and specifically whether it is polite to the MODEL's
   turn queue or to the HUMAN's composer buffer. They are different and the design
   input says so.
5. The readiness call: what it answers, and whether it is latched per session. A
   readiness probe is **not** a busy gate.
6. What happens on a port that is listening but whose session is mid-compose.

## Rules

- **A divergence is a FINDING, not an error.** File it plainly; it reshapes units 1
  and 2. Do not reconcile a divergence by assuming the document is right.
- **Do not test against a seat a human is using.** Spawn your own Copilot instance.
  If you cannot, say so and stop — this plan took a production Telegram channel down
  once already and the rule that came out of it is: never borrow a live surface
  without an explicit window.
- **Report the command AND the output.** A filtered runner must fail loudly when its
  filter matches nothing; `panicked at file:line:col:` puts the message on the NEXT
  line, so a grep without `-A` drops the payload.
- **Never let a check mutate what it judges.**
- If a claim cannot be verified without writing transport code, mark it UNDETERMINED
  and say what would settle it. Do not build the transport to test the transport.

## Acceptance

Six claims, each CONFIRM / DIVERGE / UNDETERMINED with its command and output. No
production seat touched. Receipt committed and pushed before your done message.
