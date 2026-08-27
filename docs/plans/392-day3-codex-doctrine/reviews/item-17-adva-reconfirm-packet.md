# Item 17 ADV-A fold — focused re-confirm (hunk only)

**Branch**: `s392-pr17` head `3495476eb921fceb2d42f6545826607e4a718396` (PR #19, rebased onto current main + ADV-A folded)
**Prior verdict**: APPROVE at `269ef3e` (`reviews/item-17-review.md`) — that stands; this re-confirms ONLY the ADV-A one-line fold you recommended.
**Your prior ADV-A**: "`bindRefusalCauses` never cleared on successful bind → a refusal notice for a seat that binds next tick is never retracted. One-line fold: clear the cause in the successful-bind branch next to `drive.settled = true`."

## The fold (loop.ts, copilot bind-success path)
After the settled-notify block, before `return { kind: "bound", harnessSessionId: planned }`:
```
// ADV-A: a refusal that has now resolved into a real bind must not leave a
// stale cause behind — clear it so a genuine LATER foreign event reports again.
drive.bindRefusalCauses = undefined;
```
Placed on the copilot/planned path only (the sole path that ever SETS `bindRefusalCauses`; claude/codex bind never sets it).

## New test (loop.test.ts): "clears bindRefusalCauses on a successful bind so a later refusal reports again (ADV-A)"
refuse (foreign process) → `drive.bindRefusalCauses` has `foreign-session-id` → same DriveState, pane now names this seat → `bound` → assert `drive.bindRefusalCauses` is `undefined`.

## Please re-confirm (hunk only — no need to re-run the full item-17 Dim-0)
1. **MUT-ADV-A**: delete the `drive.bindRefusalCauses = undefined;` line ⇒ the ADV-A test goes RED (`expected Set{foreign-session-id} … toBeUndefined`). Sha-verify RED→restore→GREEN. (Orchestrator self-ran it: RED 1 failed / GREEN 1 passed — please confirm on disk.)
2. **No collateral**: `git diff 269ef3e..3495476 -- .pi/extensions/pij/core/daemon/` should show ONLY the ADV-A clear (+4 loop.ts incl. comment) and the new test (+25 loop.test.ts) — the previously-approved ADV-1/2/3/4 code byte-unchanged. (index-state.test.ts identical.)
3. **Semantics**: the clear is unconditional on the copilot bind return (not gated by `!drive.settled`), so a re-settle also clears — confirm that's correct (a resolved refusal should always clear).
Gates I ran: daemon 461/461, tsc EXIT 0.

Write the re-confirm to `reviews/item-17-adva-reconfirm.md` and report back. Then the o-prime merges #19.
