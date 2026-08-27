# Cold review packet — Phase 2 (3c) · flow-pair dlg-0002

**Reviewer**: pij-pale-araminta (claude-opus-5 @ xhigh, copilot) — REPORT ONCE, AFTER YOUR LAST MUTATION; the report is terminal. · **Orchestrator**: pij-falling-outside
**Worktree**: `/Users/vaughanknight/GitHub/pij-worktrees/s392-day3-codex-doctrine` (git WORKTREE) · **Branch**: `s392/day3-codex-doctrine` (rebased onto origin/main) · **Base**: `95de006057bb4de2f6981b4051b754101cd5d4f4`
**Reviewed commits**: `35f9aff` (impl: index.ts +84/−28, index.test.ts +150) · `236dec9` (report/evidence) · **Diff**: `git diff 95de006057bb4de2f6981b4051b754101cd5d4f4..236dec9 -- .pi/extensions/pij/index.ts .pi/extensions/pij/index.test.ts`
**Plan**: `docs/plans/392-day3-codex-doctrine/day3-codex-doctrine-plan.md` v1.3.0 (Phase 2, AC-08) · **Dossier**: `tasks/phase-2-pi-receiver-queue-consumer/tasks.md` · **Coder report**: `reports/phase-2-coder-report.json` · **Execution log**: `tasks/phase-2-pi-receiver-queue-consumer/execution.log.md`
**Rubric**: `/Users/vaughanknight/GitHub/pij/skills/flow-pair/references/review-rubrics.md` (Dim-0 MANDATORY) · **C10**

## Allowed for the reviewer
READ anything; WRITE only `docs/plans/392-day3-codex-doctrine/reviews/phase-2-review.md`. Never edit code, `.flow-pair/**`, `the-flow*`, the live daemon/bridge/queue. **The coder will be working in this tree on FX001 (`core/cli.test.ts` only)** — your mutations must stay on `index.ts` / `adapters/queue-consumer.ts` / `index.test.ts`; if a run shows a red in `core/cli.test.ts`, it is not yours.

## Constraints (not conclusions)
- Contract: pi in-process receiver under sqlite = `startQueueConsumer` with ack ONLY after `receiver.onInbound` returned; `onScan → noteInboxScan` (plan-057 inbox-poll-stalled detector must keep firing); receipts recorded, never injected; fs branch (`PIJ_QUEUE_BACKEND=fs`) behaviour unchanged (watch + markRead + seen watermark); `pij_send` tool deps via `openChannel`, closing the sqlite handle.
- Lesson from Phase 1 (apply it): every widened/changed fixture is a REMOVED WITNESS until a same-cell test is shown; every site named in a contract line gets its own mutation.

## Dim-0 mutation gate (required evidence)
1. `just flow-pair-mutate .pi/extensions/pij/index.ts '<sed: skip receiver.onInbound in the consumer handler>' 'npx vitest run .pi/extensions/pij/index.test.ts'` → RED.
2. Mutate the ack ordering (e.g. make the handler resolve before `onInbound`) → RED.
3. `just flow-pair-mutate .pi/extensions/pij/index.ts '<sed: drop onScan wiring>' ...` → RED (heartbeat).
4. Force the sqlite branch off (`sqliteOf(channel)` → `undefined`) → RED under sqlite env, and confirm the fs tests still pin `PIJ_QUEUE_BACKEND=fs`.
Use ERE-escaped parens in sed (`\(`, `\)`) — the recipe is `sed -E`. Restore byte-identical; paste RED/GREEN excerpts.

## Verdict file contract
`docs/plans/392-day3-codex-doctrine/reviews/phase-2-review.md`: verdict, reviewed shas, findings table, Dim-0 block, gates re-run, "NOT EXAMINED" list. Then ONE report `{"summary":"<verdict first>","verdict":"…","path":"<abs>"}` to pij-falling-outside — terminal.
