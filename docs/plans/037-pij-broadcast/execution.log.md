# Plan 037 execution log

**Phase**: Phase 1 - Implementation
**Status**: complete
**Started**: 2026-07-11
**Completed**: 2026-07-11

## Task log

### T001 - Broadcast RED tests

**Status**: complete

Added pure and real-CLI integration coverage for repeatable target parsing, strict invalid forms, all-target preflight, ordered fan-out/results, partial delivery failure, and multi-message follow hints.

**RED evidence**: `npx vitest run .pi/extensions/pij/core/cli.test.ts .pi/extensions/pij/cli.integration.test.ts --reporter=dot` -> 6 intended failures, 40 existing tests passed. Failures are all rooted at the absent `--to` grammar/behavior.

**Changed**: `.pi/extensions/pij/core/cli.test.ts`, `.pi/extensions/pij/cli.integration.test.ts`

### T002 - Repeatable target parsing

**Status**: complete

Added a narrowly scoped repeatable flag channel for `--to`, with positional single-target syntax and scalar flag behavior left unchanged. Broadcast mode requires two unique targets, one text positional, and rejects positional-target mixing plus command/file forms.

**Evidence**: `npx vitest run .pi/extensions/pij/core/cli.test.ts -t "parses repeatable --to|rejects invalid broadcast" --reporter=dot` -> 2 passed.

**Changed**: `.pi/extensions/pij/core/cli.ts`

**Noteworthy - orchestration correction**: Jordan ruled that the stream orchestrator must delegate implementation rather than code the phase directly. T001 RED tests and the opening T002 parser patch are present in the worktree; remaining work transfers to a pij coder, with a separate Copilot `gpt-5.6-sol` xhigh reviewer.

**Fleet**: flow-pair run `2026-07-11T09-54-51Z-github.com-AI-Substr`, delegation `dlg-0001`; coder `pij-189maoc` (Copilot Claude Opus 4.8, footer canary passed), reviewer deferred until REVIEW (Copilot `gpt-5.6-sol`, xhigh).

**Model correction**: Jordan required `gpt-5.6-sol` xhigh for both roles. The Opus coder is being closed and replaced before its work is accepted.

**Gate ruling**: o-prime requires the full suite green at `dlg-0001` close; any interim yield with TDD REDs must enumerate the exact failing set. Durable amendment: `reports/coder-amendment-001.md`.

### T003 - Ordered broadcast dispatch

**Status**: complete

Added all-target preflight before the first side effect, ordered raw-text fan-out, per-recipient human/JSON results, continued delivery after a port error, and non-zero partial-failure status while preserving the positional single-target contract.

**Evidence**: `npx vitest run .pi/extensions/pij/core/cli.test.ts -t "fans one raw body|preflights every|prints one human|reports a delivery failure" --reporter=dot` -> 4 passed; `just typecheck` -> passed.

**Changed**: `.pi/extensions/pij/core/cli.ts`, `.pi/extensions/pij/core/cli.test.ts`

### T004 - Multi-message receipt waiting

**Status**: complete

Replaced the single-message follow hint with ordered target/message pairs and updated the shared CLI wait loop after the SW-3 grant. Broadcast receipt changes are target-prefixed, terminal receipts remove only their correlated target, one global timeout names all unresolved targets, and partial-delivery exit status survives the wait. Positional single-target receipt and timeout text remains byte-identical.

**E-16 evidence**: first repaired the singular bin consumer, then `just typecheck` passed. After completing the loop, `just typecheck` passed again; `npx vitest run .pi/extensions/pij/core/cli.test.ts .pi/extensions/pij/cli.integration.test.ts --reporter=dot` -> 52 passed; focused wait-state tests -> 3 passed; scoped diff check clean.

**Changed**: `.pi/extensions/pij/core/cli.ts`, `.pi/extensions/pij/core/cli.test.ts`, `.pi/extensions/pij/cli.ts`, `.pi/extensions/pij/cli.integration.test.ts`

**Window-turn order**: o-prime ruled that the first `cli.ts` edit must repair the singular `res.follow.messageId` consumer at current line 1959, followed immediately by `just typecheck`; durable amendment: `reports/coder-amendment-003.md`.

**Window granted**: s036 commit `1813803` closed the prior hold; s037 received the window at 11:26Z. Grant and E-16 close contract: `reports/cli-window-grant.md`.

### T005 - Integration and documentation

**Status**: complete

Strengthened the real-CLI two-recipient integration with ordered unique message ids, exactly-one raw-body delivery per inbox, and all-target preflight with no inbox writes. Added additive broadcast syntax/result/wait documentation to the operator guide and recorded ordered fan-out plus terminal-set waiting in the messaging domain.

Updated the peer route under the ship-time grant with repeatable `--to` and `--wait` syntax; the route remains sibling-blind and is 71/150 lines. Live smoke nonce `s037-broadcast-smoke-20260711T1029Z` reached the orchestrator and o-prime as normal injected turns; independent target-side attestations are persisted in `reports/live-smoke-attestations.md`.

**Evidence**:
- `npx vitest run .pi/extensions/pij/core/cli.test.ts .pi/extensions/pij/cli.integration.test.ts --reporter=dot` -> 52 passed.
- `just flow-pair-test` -> 148 passed.
- `just pij-skill-check` -> green.
- `just typecheck` -> green.
- `just lint` -> green (existing advisory warnings only).
- `just test` -> 1711 passed, 10 skipped after one isolated real-fs watcher retry passed.
- `harness checks` -> all six sensors passed: typecheck, lint, test, smoke, pkg-audit, snapshots.

**Changed**: `.pi/extensions/pij/core/cli.ts`, `.pi/extensions/pij/core/cli.test.ts`, `.pi/extensions/pij/cli.ts`, `.pi/extensions/pij/cli.integration.test.ts`, `docs/how/pij.md`, `docs/domains/pij-messaging/domain.md`, `skills/pij/references/routes/peer.md`, plan execution artifacts.

**Parallelisation correction**: while `cli.ts` is held, the coder continues disjoint T005 integration, domain, and additive how-guide work via `reports/coder-amendment-002.md`; only the shared waiter bridge and ship-time peer route remain blocked.

**Orchestrator verification**: `broadcast send writes the same raw body once to each target inbox` and `broadcast preflights the full target set before writing any inbox` passed 2/2; scoped `git diff --check` was clean. Reviewer brief prepared at `reports/reviewer-brief.md`.

**Peer route approval**: o-prime released `skills/pij/references/routes/peer.md` after T004 E-16; exact 150-line, Converse-block, syntax-only, sibling-blind, and pre-commit evidence constraints are in `reports/peer-route-grant.md`.

**Live smoke**: nonce `s037-broadcast-smoke-20260711T1029Z` reached both orchestrator `pij-aa756x` and o-prime `pij-3vetx8` as normal injected daemon turns. Independent target-side evidence: `reports/live-smoke-attestations.md`.

**Review capture friction**: `flow-pair observe` aborted on unrelated dirty `docs/plans/036-pij-orchestration-baton/the-flow.json` despite s037's allowed-path packet. Captured as harness difficulty DL-006; a scoped patch (`reviews/coder-diff.patch`, sha256 `f3f03d3…18ff`) feeds the real pij reviewer without editing the flow-pair ledger.

**Orchestrator full gate**: independent `harness checks` passed all six sensors (typecheck, lint, test, smoke, package audit, snapshots). Reviewer `pij-1kjyagq` canary passed as Copilot `gpt-5.6-sol` xhigh and is reviewing the scoped patch.

**Review verdict**: `reviews/reviewer-verdict.md` -> APPROVE, no material findings. Dim-0 mutated the queued-receipt retention guard, proved the named test RED, restored core/cli.ts byte-identically, then proved GREEN. Orchestrator sanity pass re-read the guard/assertion, reproduced the targeted GREEN, and confirmed the live scoped patch sha256 remains `f3f03d3b5695bccdf3548be1108b801d2981f605a4dcac7fb97a9f86947818ff`.

**Commit readiness**: T001-T005 complete, independent full gate green, live smoke attested by two targets, peer-route ship-time look approved, nothing staged. Git-index baton requested using `reports/commit-manifest.md`.

## Discoveries & Learnings

| Date | Task | Tag | Discovery | Resolution |
|------|------|-----|-----------|------------|
| 2026-07-11 | Pre-flight | Noteworthy | `AGENTS.md` requires `harness-is-the-product-v2`, but the installed skill registry does not contain it. | Captured as harness observation CONF-001; used `eng-harness-flow` plus a green `harness boot` as the available grounding path. |
| 2026-07-11 | T005 | Difficulty | `pij list --here --json` produced an oversized malformed stream that `jq` could not parse in the large local registry. | Used the two known live coordination peers for smoke and captured harness observation DL-005 proposing deterministic live-only filtering or large-output JSON validation. |
