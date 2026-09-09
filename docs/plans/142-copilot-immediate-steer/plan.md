# Plan 142 — native Copilot peer messages steer immediately (issue #398)

Owner: pij-minor-unicorn (prime). Source: GitHub issue #398 (Jordan, 2026-09-09): "Use immediate steering for native Copilot peer messages instead of enqueue". Consistent with Jordan's 2026-09-08 ruling that pij messages "must be injected asap as steering". Jordan 2026-09-09: "another issue".

## Problem (verified on main 7e9bf2b1)
`.copilot/extensions/pij/store.mjs:881` (`NativeBridge.deliver`) sends `this.native.send({ prompt, mode: "enqueue" })`. An accepted peer message can then sit in Copilot's queued lane after foreground work finishes while new human input still runs (issue's live trial on Linux, Copilot 1.0.84-2; upstream github/copilot-cli#4705). `immediate` mode steers during an active turn and starts normally when idle. Three assertions pin `enqueue`: `extension.test.mjs:445`, `store.test.mjs:135`, `store.test.mjs:2961`. The issue's four file edits exist only as uncommitted local changes on the Linux box — nothing is on main; this plan lands them from scratch.

## Acceptance
- AC1 `NativeBridge.deliver` sends `mode: "immediate"`. The native message id, the acceptance/completion distinction, durable journaling, duplicate suppression, semantic Hold, native-session isolation, consent protection, draft safety and the one-in-flight completion barrier are unchanged — no other line of `deliver` moves. Verify the mode value against the Copilot CLI's own extension typings (locate them under the installed `@github/copilot` package; cite file:line in report.md). If the typing does not list `immediate`, STOP and ask the prime inline.
- AC2 The three pinned assertions flip to `immediate`. RED first: flip the source before the tests and capture the three failures, or flip the tests first and capture them red against `enqueue` — either order, but the red output is in the report.
- AC3 Coverage for the issue's three scenarios with the existing fake native session: idle delivery; delivery while a turn is active (the fake reports the send as steering, the bridge records the returned native id); a follow-up delivery after the correlated completion of the previous one (barrier releases). If a scenario is already covered under `enqueue`, name the existing test instead of duplicating it.
- AC4 `docs/how/copilot-native-extension.md`: delivery mode is `immediate`; activation requires a recipient to reload its native extension or start a fresh CLI session; no daemon rebuild/restart; already-accepted queued items are neither converted nor replayed. State plainly that this is a semantics change, not proof that every client queue race is fixed.
- AC5 Gates: `npm test` (node:test for the extension), `just skill-check` if present, lint. No Rust change expected; if one appears, say why.

## Non-goals
Recovering messages already stranded in a recipient's queue. #397 (plan 141, in flight in another worktree — do not touch its files or regions). Changing Copilot's internal queue.
