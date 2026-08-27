# Cold review packet — Phase 1 (3b) · flow-pair dlg-0001

**Reviewer**: spawned cold for this review; model claude-opus-5 @ xhigh (copilot); you have NOT seen the coder's session — that is the point · **Orchestrator**: pij-falling-outside
**Worktree**: `/Users/vaughanknight/GitHub/pij-worktrees/s392-day3-codex-doctrine` (git WORKTREE — never cd to ~/GitHub/pij) · **Branch**: `s392/day3-codex-doctrine` · **Parent**: `2953d7599b3b8a498295f9e07b766a4fff49edc9`
**Reviewed commits**: `69f1c4524c39340ff63c26ba498fd489ca3faeec` (implementation) + `3501f8558276ade4e10e40a42e3ffd1d5e56816b` (handover/evidence) — HEAD of the branch · **Diff**: `git diff 2953d759..3501f855 --stat` / `git diff 2953d759..3501f855`
**Plan**: `docs/plans/392-day3-codex-doctrine/day3-codex-doctrine-plan.md` v1.3.0 (Phase 1 section, AC-01…AC-06) · **Dossier**: `tasks/phase-1-telegram-sqlite-forwarder/tasks.md` · **Coder report**: `docs/plans/392-day3-codex-doctrine/reports/phase-1-coder-report.json` · **Execution log**: `tasks/phase-1-telegram-sqlite-forwarder/execution.log.md` · **Handover**: `reports/phase-1-handover.md`
**Rubric**: `/Users/vaughanknight/GitHub/pij/skills/flow-pair/references/review-rubrics.md` (Dim-0 MANDATORY) · **Wire discipline**: C10 (`~/.claude/skills/pij/references/00-routing.md` § C10)

## Allowed for the reviewer
READ anything in the worktree; WRITE only `docs/plans/392-day3-codex-doctrine/reviews/phase-1-review.md`. Never edit code; never touch `.flow-pair/**`, `the-flow*.json/md`, the live daemon/bridge/queue.

## Constraints (not conclusions)
- Contract under review: at-least-once; a row is acked ONLY after a successful text send; the sqlite `onMessage` handler must THROW while any text bubble is undelivered; fs branch (`PIJ_QUEUE_BACKEND=fs`) unchanged; `failed`/`acked`/`parked` rows never forwarded; no write-side change to `adapters/sqlite-queue.ts`.
- Receipt fix: `classifySendReceipt` + `daemonReceiptAuthoritative` on `effectiveDeliveryMode`.

## Dim-0 mutation gate (required evidence in the verdict)
Run at least these, restore byte-identical, report RED→GREEN:
1. `just flow-pair-mutate .pi/extensions/pij/telegram/bridge.ts 's/undeliveredText > 0/false/' 'npx vitest run .pi/extensions/pij/telegram/bridge.test.ts'` — the lost-message guard (AC-04) must go RED.
2. `just flow-pair-mutate .pi/extensions/pij/adapters/queue-consumer.ts '<sed that skips claimUnread after the handler>' 'npx vitest run .pi/extensions/pij/adapters/queue-consumer.test.ts'` — ack-after-success must go RED.
3. `just flow-pair-mutate .pi/extensions/pij/core/cli.ts 's/effectiveDeliveryMode(descriptor) === "pull"/descriptor.deliveryMode === "pull"/' 'npx vitest run .pi/extensions/pij/core/cli.test.ts'` — the pull-inbox receipt test must go RED.
Also: name the negative/state assertions that prove `failed` rows are never forwarded and that a rejected send leaves the row `claimed` with no `released`/`acked` receipt.

## Verdict file contract
`docs/plans/392-day3-codex-doctrine/reviews/phase-1-review.md`: verdict (`APPROVE` | `APPROVE_WITH_NOTES` | `FIX_REQUIRED`), reviewed sha, findings table (severity · file:line · claim · evidence · fix), Dim-0 evidence block (commands + RED/GREEN output excerpts), gates you re-ran. Then report `{"summary":"<verdict first>","verdict":"…","path":"<abs path>"}` to pij-falling-outside.

## Known pre-existing reds (do not attribute to this diff; DO check they are pre-existing if you doubt it: `git stash`-free method — compare against `git show 2953d759:<file>`)
- `harness/scripts/release-age-policy.test.ts` needs `pwsh` (absent on this Mac).
- repo-wide `just lint` and `just pij-skill-check` debt under `skills/pij/**` — this diff touches no `skills/` file.
- `just smoke`: existing `pij-watchdog` / `pi-peacock` scenario failures.

## Specific things I want your eye on (constraints, not conclusions)
- Scope: the fixture-only widening in `adapters/fs-registry.overlay.test.ts:166,181,197,550` was orchestrator-approved (paneId only). Anything else outside the packet's allowed paths is a finding.
- `channel-factory.ts` gained an `OpenChannelOptions.fsWatchOpts` third arg — confirm it is additive and the sqlite branch ignores it.
- Ack timing: the consumer must ack AFTER `forwardOne` resolves; confirm no code path acks a receipt/text row before its send resolved, and that a rejected `send` on bubble 2 of 2 leaves the row claimed.
- fs parity: with `PIJ_QUEUE_BACKEND=fs` the watch/log-and-continue path is byte-for-byte the prior behaviour.
