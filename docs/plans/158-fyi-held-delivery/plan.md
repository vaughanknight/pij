# Plan 158: `pij send --fyi` holds a message until the seat's next turn

Author: pij-far-jackal (prime), 2026-09-29. Jordan approved this. Coder: pij-yelling-trout.

## Why
In the 2026-09-28 usage blowout, 3,773 message-opened turns (15% of spend) were acks and FYIs: 3 calls or fewer, no work done. Each one re-read the recipient's whole context.
- Source: ~/games/unasphere/scratch/usage-blowout/far-jackal-interview.md.
- An FYI must never open a turn. It waits and rides in on the seat's next real turn.

## Behaviour
1. **Hold.** `pij send <seat> --fyi ...` stores the message as a pending FYI for the recipient. It opens no turn and does no tmux, UDS or extension push.
   - The receipt says `held (fyi)`.
   - It persists across daemon restarts.
2. **Ride along on a pij message.** The next non-FYI delivery to that seat carries the pending FYIs as a prefix, e.g. `(2 FYIs held since 14:02)` followed by each one with its sender. This works for every harness.
3. **Ride along on a typed turn**, through hooks. The hook claims the pending FYIs from the daemon and adds them as context to the human's prompt.
   - Claude: a `UserPromptSubmit` hook script next to the existing session-start and status-line scripts. Install it the same way into ~/.claude AND ~/.claude-alt settings.
   - OMP and Pi: the pij extension's before-turn / context hook.
   - Copilot: find out whether its CLI has a prompt hook. If not, it gets only path 2. Say so in the report; don't fake it.
4. **Claim exactly once.** A claim is atomic: pending → delivered, with a delivery receipt. Two hooks racing, or a hook racing a prefix delivery, never deliver the same FYI twice.
5. **Visibility.**
   - `pij state <seat>` shows the pending FYI count.
   - The Claude and Copilot status lines and the OMP footer show `✉N` while N > 0.
   - `pij close` / tombstone drops pending FYIs and records that it did.
6. **Skill.** Document `--fyi` in the peer route. In the prime protocol's fleet-messaging rule 3, say that information needing no action goes with `--fyi`, or is not sent at all.

## Proof (Jordan: "make sure it works")
- Unit and integration tests: RED before GREEN.
- A live run with real clients:
  - one Claude seat, one OMP seat, and Copilot if a hook exists;
  - send an FYI and prove no turn opened (transcript and pane unchanged);
  - see `✉1`;
  - then (a) type a prompt and see the FYI injected once, and (b) separately, send a real message and see the prefix;
  - see `✉` clear and the receipt say delivered.
- Record it in docs/plans/158-fyi-held-delivery/evidence/.

## Done when
- Merged to main, harness checks green.
- The hook scripts are deployed to ~/.pij-rs and registered.
- The daemon has been bounced: pull main first, then `just bounce-rs`. This is the one production-daemon action you're allowed, after merge.
- The live proof is recorded.

## Addendum (Jordan): the OMP/Pi extension carries `--fyi` on both sides
- **Sending:** every send surface the extension offers (the `pij_send` tool, any slash command or wrapper around `pij send`) gains an `fyi` option with the same meaning as the CLI flag. The tool description tells the model to use it for information that needs no action.
- **Receiving:** the before-turn injection and the `✉N` footer (already in Behaviour 3 and 5).
- Check other send surfaces too, e.g. the Claude and Copilot skill examples and `pij send` help text, so the option is discoverable wherever a seat sends. Search with `rg --hidden`.

## Addendum 2 (Jordan): delivery format
Held FYIs go into the SAME delivery as the message that opens the turn, AFTER its content, never as a separate message and never as a prefix. This overrides "as a prefix" in Behaviour 2. For example:

    <the real pij message, unchanged>

    Also, 2 FYIs were queued for you:
    1. [from pij-x, 14:02] <body>
    2. [from pij-y, 14:10] <body>

Use the same numbered 1–N block for the typed-turn hook (Claude UserPromptSubmit, OMP/Pi before-turn), appended after the human's prompt context. Order: oldest first. Pin the format with one golden test that the CLI, the hook script and the extension all read from, and don't restate it in each.

## Addendum 3 (Jordan): fix OMP busy/idle as part of this plan
- **Observed:** at 2026-09-29 14:53, `pij state pij-yelling-trout` said `idle · active` while the seat was mid-turn. Its pane showed "Reading arrive routing" and tool calls running.
- **Why it matters:** the broadcast rule ("working now or warm") and the coming cold-wake guard both trust that signal, and FYI delivery (whether to deliver now or hold) may too. Right now it's wrong in the unsafe direction.
- **Do:**
  1. Find the root cause: the extension's turn start/end reporting, the daemon's state fold, or a stale projection. Whatever turns out to be the cause, check whether a busy report could still reach the daemon. Don't assume the obvious cause.
  2. Fix it with a RED-then-GREEN test.
  3. Prove it live: `pij state` shows busy during a real OMP turn and idle after it. Your own seat is a valid subject.
  4. Check whether Claude and Copilot seats report correctly, and note the result in the evidence.
