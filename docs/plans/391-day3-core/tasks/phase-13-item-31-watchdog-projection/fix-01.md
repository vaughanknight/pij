# FX-01 — item 31 (dlg-0029): DL-018 folded in by o-prime ruling — the watchdog smoke sensor

**Ruling** (o-prime, 2026-08-28 ~01:5xZ): fold DL-018 into item 31 (same area, tiny).

**Defect**: `docs/plans/055-pij-watchdog/proofs/run-proofs.ts` (the target of `harness/scripts/smoke.ts` — THE watchdog smoke sensor) calls async `daemon.tick()` without awaiting at `:322`, `:330`, `:369`, `:375`, `:411`, then asserts immediately → "smoke first fire was not queued". Red on clean main (reproduced by the orchestrator in a throwaway worktree at 58c9cf1) and masked for weeks by the pwsh/OSC baseline reds.

**Do** (fence += `docs/plans/055-pij-watchdog/proofs/run-proofs.ts` and this phase's `execution.log.md`; nothing else):
1. RED first: run the smoke on your current head and keep the log: `PIJ_HOME=$(mktemp -d) TMUX= npx tsx docs/plans/055-pij-watchdog/proofs/run-proofs.ts --smoke > docs/plans/391-day3-core/kept-logs/smoke-red.log.txt 2>&1` — record the reason line.
2. `await` each `daemon.tick()` (make the enclosing functions async if they are not); no other logic change. If the proof then fails for a DIFFERENT reason, STOP and report it verbatim — that would be a real watchdog regression signal, not yours to paper over.
3. GREEN: same command → `docs/plans/391-day3-core/kept-logs/smoke-green.log.txt`; then `harness checks` and paste its output so the smoke line reads green while the pwsh/OSC baseline reds are named SEPARATELY (that separation is the o-prime's oracle).
4. Append one commit on the branch; report per schema (`--body-file`): SHA, the red reason line, the green line, the harness checks summary.

## Step 5 (added after the BLOCKED report) — second defect in the same sensor, classified pre-existing
The orchestrator applied your await patch to CLEAN origin/main (ae7356b) in a throwaway worktree: identical `smoke compact pause failed`. Not an item 31 regression — the proof constructs `new FsChannel(home)` (`run-proofs.ts:304`) while the real CLI it drives (`requireCli(home, ["send", … "--command", "compact"])`, `:1241`) writes to the DEFAULT queue backend, which has been sqlite since item 1 / Amendment 4. The compact never reaches the proof's daemon, so `pausedBy` never flips.
**Do**: build the proof's channel through the production factory (`adapters/channel-factory.ts` — the same seam `runDaemon` uses) so the proof's daemon reads what the CLI wrote; keep `FsChannel`-typed helpers working (widen their parameter to the port type if needed). Nothing else. Re-run: keep `docs/plans/391-day3-core/kept-logs/smoke-red.log.txt` (first fire), add `smoke-red-2.log` (compact pause), and `smoke-green.log` for the passing run. If a THIRD distinct reason appears, STOP again with the log. Then `harness checks` with the smoke line green and pwsh/OSC named separately; one commit; report per schema.

## STOPPED (orchestrator ruling) — third distinct reason
`smoke done report command missing` (`run-proofs.ts:1217`): the proof asserts the first delivered TURN contains `pij report state done`; since the pointer path (item 5) a socketless tmux seat receives the pointer line, not the body (text unchanged at `watchdog.ts:419`). Third pre-existing drift → the sensor needs a rewrite against the current delivery model, not a fold. Fixes 1–2 preserved as `docs/plans/391-day3-core/kept-logs/run-proofs-partial.patch`; file restored; branch stays at 98cce88. Escalated to the o-prime as candidate item 33.
