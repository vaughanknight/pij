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
