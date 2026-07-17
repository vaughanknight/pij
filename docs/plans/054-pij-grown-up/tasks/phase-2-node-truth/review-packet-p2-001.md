# P2 review packet 001 — cold cross-model review (cycle 1)
**From**: pij-civilian-takin (orchestrator) · **Date**: 2026-07-17 · **Immutable once dispatched**
**Reviewer**: cold copilot `gpt-5.6-sol` @ xhigh — you reviewed P1 (verdicts p1-review-001..006); you were compacted — re-derive everything from artifacts.

## Who you are
Cold reviewer, no loyalty to coder claims. Report ONLY via `pij send pij-civilian-takin "<message>"`. Worktree (absolute paths, never your cwd): `/Users/jordanknight/pi-hacking/pij-worktrees/s054-pij-grown-up` · branch `s054/pij-grown-up`. Read-only except your ONE output file; never write the canonical repo.

## Target
Range `7f15f9f..47dea9b` — Phase 2 (Node truth), 9 commits: T001/2 `7b04e20` descriptor block + WS-6 vocab + merge law · T003 `a8bfdd2` 7-state axis + worst-first badge · T005-port `75500ad` assignment-op recovery adjudication · T004/5 `105ffb2` task set / state set / state verify coupled writes · T006 `c0ed882` windowId · T007 `797246d` context gauges · T008 `b36edf0` daemon runtime axis + V-05 events · T009/10 `69c5d06` node show + anomalies + parent alerts · T011/12 `47dea9b` tombstone residual doc + wrap. Diff: `git -C <worktree> diff 7f15f9f..47dea9b`.

## Authorities (precedence)
1. `docs/plans/054-pij-grown-up/pij-grown-up-plan.md` §Phase 2 + AC-04/05/06/07/09/11 + V-05 ruling
2. `docs/plans/054-pij-grown-up/workshops/001-data-model.md` — WS-6 vocabularies human-ruled
3. `tasks/phase-2-node-truth/tasks.md` (validated dossier, incl. 4 folded validation findings) + `coder-packet.md` (the fence)
4. `tasks/phase-2-node-truth/execution.log.md` — coder claims + logged rulings (context, NOT truth)
5. P1 contract: `core/platform/ports.ts` docs + your own p1-review-001..006 (J1/K1 pins must still hold)

## Review dimensions
1. **Plan conformance**: every §P2 AC met? AC-04 (starting/stopped/unknown honest), AC-05 (two-axis + implicit general + worst-first), AC-06 (unverified done + verify flip), AC-07 (44h axis-disagreement + once-per-transition alert, act never), AC-09 (windowId addressability + gauges + full card), AC-11 (legacy descriptor round-trip).
2. **Correctness of new machinery**: assignment coupled writes through the WIDENED recovery adjudication (attack with your P1 probe styles — intent/committed crash windows, resurrection, corroboration matrix now spanning project+assignment ops); RuntimeAxisTracker verdicts + latch-after-successful-append (spam/loss under append failure, lock contention, daemon restart latch re-seed); AnomalySweep evidence-keyed latch; context readers (honest-unknown law — any heuristic branch is a finding); windowId parse degradation.
3. **Coder rulings to adjudicate (9 — each logged with rationale in the execution log; judge each sound/unsound)**:
   a. `canonicalAssignmentJson` EXCLUDES `states[]` (log-derived index; semantic transitions ride structured refs, not prev/next values) — deviation from fix-packet phrasing, load-bearing for corroboration.
   b. codex gauge reads tail `last_token_usage` NOT the plan's `total_token_usage` (cumulative — 72M vs 258k window would lie).
   c. pi gauge reads the node's legacy `events.ndjson` (internal source) while T008 keeps that file OUT of the public contract — source-internal vs contract-exposed distinction sound?
   d. `SPINE_KIND_SYSTEM_STATE = "system-state"` naming (s055 consumes this — name quality matters).
   e. T008 documented residual: daemon crash between descriptor write and event append drops one telemetry event; descriptor = axis truth.
   f. T010 semantic-active = `undeclared|ready` per-word (parked words = legitimate idleness), 4h default threshold, absent lastEventAt = idle-since-forever.
   g. windowId added to MUTABLE_EXTERNALLY_OWNED_FIELDS (4th field beyond dossier's three).
   h. T011 tombstone residual DOCUMENTED not capped (claim: compaction-as-sketched no-ops where fsync works, sweep already empties; any Windows cap reopens K1).
   i. daemon FsSpineLog constructor made lazy/fault-honest after full-suite fixture breakage.
4. **House conventions + regression**: purity sensor still enforcing (context readers adapters-side?); types.ts zero-import; own-property guards on new types; temp PIJ_HOME everywhere; no-throw dispatch; P1 contract suite + J1/K1 pins green; cli.test.ts legacy block untouched.
5. **Test quality**: do the pins PROVE the claims (esp. fault matrix on assignment coupled writes, latch pins, 44h regression, AC-11 round-trip) or would hostile inputs walk through?
6. **Fence compliance**: `git -C <worktree> diff --name-only 7f15f9f..47dea9b` vs coder-packet fence; daemon.ts must be ADDITIVE ONLY (SW-6 cross-stream constraint — flag ANY move/reformat there as HIGH).
7. **Phase 3 exposure**: hazards for the tree/adoption phase (parent capture, spawnedBy vs parentId provenance) adequately guarded/documented?

## Gates you may run (worktree root)
`npx vitest run .pi/extensions/pij/core .pi/extensions/pij/adapters` · `just typecheck`. Known baseline flake OUTSIDE scope: `harness/scripts/release-age-policy.test.ts` (full-suite pwsh timeout; also pollutes `harness boot` — ignore).

## Output contract
1. ONE new file `docs/plans/054-pij-grown-up/reviews/p2-review-001.md`: verdict line first — `VERDICT: APPROVE` or `VERDICT: FINDINGS (<n>)` — then per finding: severity CRITICAL|HIGH|MED, file:line evidence, concrete failure scenario, smallest fix; plus a rulings section judging a–i. Findings must survive your own disprove attempt; probes preferred.
2. Then: `pij send pij-civilian-takin "P2 REVIEW FINDINGS <n>|APPROVE · docs/plans/054-pij-grown-up/reviews/p2-review-001.md · <one-line summary>"`

## Forbidden
Everything except reading + your one output file — no code edits, no the-flow files, no `government/**`, no other docs writes, no commit/push/PR, no canonical-repo writes, no daemon/tmux mutation.
