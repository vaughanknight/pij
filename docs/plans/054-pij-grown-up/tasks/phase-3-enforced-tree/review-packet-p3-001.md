# P3 review packet 001 — cold cross-model review (cycle 1)
**From**: pij-civilian-takin (orchestrator) · **Date**: 2026-07-17 · **Immutable once dispatched**
**Reviewer**: cold copilot `gpt-5.6-sol` @ xhigh — you reviewed P1 (6 cycles) + P2 (1 cycle); compacted — re-derive from artifacts.

## Who you are
Cold reviewer. Report ONLY via `pij send pij-civilian-takin`. Worktree: `/Users/jordanknight/pi-hacking/pij-worktrees/s054-pij-grown-up` · branch `s054/pij-grown-up`. Read-only except your ONE output file; never the canonical repo.

## Target
Range `e39cbb4..99372bf` — Phase 3 (Enforced tree + adoption), 7 commits: T001/2 `81106dc` caller-truth parent derivation (#20 fix) · T003 `f3277d9` unadopted axis · T004 `1644a02` node-linked spine events · T005 `f8adf2f` adoption hint + P4 contract · T006 `1cac708`+`481780c` carry-ins · T007 `99372bf` wrap. Diff: `git -C <worktree> diff e39cbb4..99372bf`.

## Authorities (precedence)
1. Plan §Phase 3 + AC-08 + Finding 07 · 2. WS-1 (three-axes split) · 3. `tasks/phase-3-enforced-tree/tasks.md` (validated; §SW-7 is BINDING — includes prime conditions) + `coder-packet.md` · 4. Execution log (claims not truth) · 5. Your p1/p2 verdicts (all prior pins must hold).

## Review dimensions
1. **AC-08 conformance**: parent = invoking session (env id / FULL-registry pane-exact / absent — cwd NEVER); adopt --parent; prime parentless = legal root; unadopted enumerable machine-wide; re-parent history reconstructable.
2. **SW-7 compliance (verify independently — HIGH if violated)**: `git -C <worktree> diff --name-only e39cbb4..99372bf | grep -E 'core/discovery|core/current-session|core/close'` must be EMPTY; every P3 test asserts OUTCOMES not internals (spot-check the new test files for internal call-shape assertions); behavior contracts would survive an s051 identity-internals rewrite.
3. **New-surface correctness**: `deriveCallerParent` matrix (ambiguous pane refusal, cross-cwd pane match, env-id precedence); `isUnadopted` predicate (prime never flagged; orphan=problem≠unadopted); node-linked event (V-05 uncoupled under lock+recovery, root shape: next OMITTED + refs [node:<child>], no-op appends, append-failure honest spineSeq:null+warning — is the warning surface adequate or a silent-ish loss?).
4. **Coder rulings to adjudicate (7)**: (a) event `prev` = `effectiveParent(current)` not raw `parentId` — records the tree truth replaced (incl. legacy spawnedBy fallback); (b) `pij link` now attribution-REQUIRED in wired bin (F2) — a behavior change; a pre-existing bin composition test was UPDATED to pin refusal+attribute (legit contract evolution or frozen-surface violation?); (c) attribution rides resolveSelf INCL. lone-local while parent derivation excludes it — "attribution ≠ parent derivation" split sound?; (d) `--branch` keeps resolveSelf (fork-source ≠ parent); (e) T006a sensor: gauge.ts COMMENT tripped the process regex — comment reworded rather than regex weakened — verify the sensor still catches REAL `process` usage and that comment-rewording didn't mask a detection gap (would a production `process.env` in core/context still fail?); (f) dead codex `contextWindow` output REMOVED (precedence vs models.json join unruled — sound removal or lost data?); (g) "adopt needed no change" claim — verify against AC-08 adopt scenarios.
5. **Regression**: all P1/P2 pins green (J1/K1, corroboration, latch, 44h anomaly); frozen cli.test.ts legacy block byte-identical claim (`git diff e39cbb4..99372bf -- .pi/extensions/pij/core/cli.test.ts` — first-58-test block untouched?); house conventions.
6. **Fence**: diff --name-only vs coder-packet fence (daemon.ts must be ABSENT from the diff).
7. **P4 exposure**: T005's consumption contract adequate for the P4 skill route + render phase?

## Gates you may run
`npx vitest run .pi/extensions/pij/core .pi/extensions/pij/adapters` · `just typecheck`. Baseline flake outside scope: release-age-policy.

## Output contract
1. ONE file `docs/plans/054-pij-grown-up/reviews/p3-review-001.md`: verdict first (`VERDICT: APPROVE` | `VERDICT: FINDINGS (<n>)`); findings severity/file:line/failure-scenario/smallest-fix, probes preferred; rulings section judging a–g. APPROVE requires per-AC confirmation + SW-7 independent verification statement.
2. Then: `pij send pij-civilian-takin "P3 REVIEW <APPROVE|FINDINGS n> · docs/plans/054-pij-grown-up/reviews/p3-review-001.md · <one-liner>"`

## Forbidden
Everything except reading + your one output file — no code edits, no the-flow files, no `government/**`, no other docs writes, no commit/push/PR, no canonical-repo writes, no daemon/tmux mutation.
