# Item 17 review packet — bind-guard advisories (cold review)

**Candidate**: `269ef3e5142275522b9b30c4e2354e0b04de55c1` (HEAD of `s392/day3-codex-doctrine`) · **Base**: origin/main `ed20a68b`
**Dossier**: `../tasks/item-17-bind-guard-advisories/tasks.md` · **Source advisories**: `item-10b-review.md` §"Advisories"
**Files**: `.pi/extensions/pij/core/daemon/loop.ts`, `loop.test.ts`, `index-state.test.ts` (test+source; no schema change)
**Write your verdict to**: `reviews/item-17-review.md`

## What this lands (order ADV-2 → ADV-4 → ADV-3 → ADV-1)
- **ADV-2** (only behaviour change): the planned-bind guard (`loop.ts` ~:391-413) now splits refusal causes — `foreign-session-id` and `malformed-planned-copilot-id` call `reportBindRefusal` (one-shot per cause via `drive.bindRefusalCauses: Set<string>`, notifies `descriptor.spawnedBy`), while `probe-unavailable`/`identity-indeterminate`/other transient causes fall through to a QUIET `{kind:"waiting"}` (retry). Mirrors the `heldBoot`/`heldBootLogged` one-shot precedent. The set of what BINDS is unchanged — only observability changed.
- **ADV-4**: sweep allowlist separator-normalized (was `file.endsWith("/core/discovery.ts")`).
- **ADV-3**: sweep now catches reversed operands + destructuring, skips comments, line-anchored allowlist.
- **ADV-1**: the copilot `!isCopilotSessionId(planned)` clause is now pinned (was zero-coverage / deleted-green).

## Dim-0 mutation gate — MANDATORY, sha-verify each RED→restore→GREEN (no APPROVE without all five on disk)
Coder-claimed lines (verify they still hold; re-run each yourself):
- **MUT-A**: delete the `reportBindRefusal` notify emission ⇒ RED at `loop.test.ts:427` (refusals 0 vs 1). Proves the refusal log is pinned.
- **MUT-B**: remove the `bindRefusalCauses` dedupe (log every tick) ⇒ RED at `loop.test.ts:427` (2 vs 1). Proves once-per-seat/cause.
- **MUT-C**: delete `harness === "copilot" && !isCopilotSessionId(planned)` ⇒ RED at `loop.test.ts:486` (bound vs waiting). Closes the M5 gap.
- **MUT-D**: revert ADV-4 to slash-only `endsWith` ⇒ RED at `index-state.test.ts:204` (win32 disarm).
- **MUT-E**: revert ADV-3 to single operand order ⇒ RED at `index-state.test.ts:220` (reversed-operand bypass).

## Semantic checks (Dim-1)
1. Confirm the QUIET path is genuinely quiet: a `probe-unavailable` snapshot produces `waiting` with NO outbox notify (the `it.each` at `loop.test.ts:~425`). A transient probe must never notify — that's the retry-not-refuse invariant.
2. Confirm `reportBindRefusal` no-ops when `!descriptor.spawnedBy` (no spawner to notify) — no crash, no orphan notify.
3. Confirm the dedupe key is cause (not just seat): a seat that goes foreign, then malformed, should be able to surface BOTH once — or, if keyed to log-once-ever, that the tradeoff is acceptable (dossier "Open").
4. Confirm ADV-3's allowlist still PASSES the real `core/discovery.ts resolveLivePane` (no false-positive on the legit shared resolver) and that a comment mentioning `paneId === p` is not flagged.
5. `gatesClean:false` is repo-wide pre-existing red (lint/test/windows-compat/smoke) — verify NONE of it touches the three changed files (the coder's claim). If any does, that's blocking.

## Report to me (pij-falling-outside) with: verdict (APPROVE/CHANGES), the 5 mutation shas+RED lines, the Dim-1 findings, and any advisories.
