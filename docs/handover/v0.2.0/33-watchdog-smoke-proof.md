# 33 — Resurrect the plan-055 watchdog smoke proof (the harness's only watchdog sensor)

**Item id / stream at handover:** 33 · s391-day3-core
**Status at v0.2.0 (tag `d120c53`):** in flight — branch `s391/item33-watchdog-smoke-proof` at `5e982ea` (= `785550b` coder-complete + evidence commit), **pushed**; coder gates green; cold review was in progress at handover (the reviewer seat wedged; no verdict file). Done: all three drifts fixed, smoke green, sensor-honesty mutation red. Not done: cold-review verdict, rebase onto the merge target, o-prime merge check.
**Size estimate:** S to finish (rebase + review + PR; 1–2 h) · **Order / dependencies:** none (docs/harness only; touches nothing under `.pi/extensions/**`). Not pre-tag; release-notes known gap "watchdog smoke proof stale since item 5" closes with it.

## 1. Why this exists (the observed failure, with evidence)
- `harness/scripts/smoke.ts` (`:33`) runs `docs/plans/055-pij-watchdog/proofs/run-proofs.ts --smoke` — the only watchdog smoke sensor in `harness checks`. It had been **red on clean main for weeks**, masked because `harness checks` was already baseline-red (pwsh-only test, OSC-7337 lint) — retro record `.harness/records/retro/2026-07-29/005.md` describes the sensor; nobody looked at its reason line.
- Discovered 2026-08-28 during item 31's harness gate (coder report dlg-0029; rulings `docs/plans/391-day3-core/rulings.md` rows "DL-018"). Reproduced on CLEAN main `58c9cf1` in a throwaway worktree: `PIJ_HOME=$(mktemp -d) TMUX= npx tsx docs/plans/055-pij-watchdog/proofs/run-proofs.ts --smoke` → `"reason": "smoke first fire was not queued"`.
- Three layered drifts, each visible only after the previous fix (evidence on the branch: `docs/plans/391-day3-core/tasks/phase-16-item-33-watchdog-smoke-proof/evidence/{smoke-red.log,smoke-red-2.log,smoke-red-3.log,run-proofs-partial.patch,STATE-OF-PLAY.md}`):
  1. `run-proofs.ts` called async `daemon.tick()` without `await` (`:322/:330/:369/:375/:411` at 58c9cf1) and asserted immediately → "smoke first fire was not queued";
  2. the proof built its daemon on `new FsChannel(home)` (`:304`) while the real CLI it drives (`requireCli(home, ["send", …, "--command", "compact"])`, `:1241`) writes the DEFAULT queue backend — sqlite since item 1 / Amendment 4 (`adapters/channel-factory.ts queueBackend`) → the compact never reached the proof's daemon → "smoke compact pause failed";
  3. `:1217` asserted the first delivered TURN contains `pij report state done`, but socketless tmux seats receive the pointer line since item 5 (`adapters/daemon-tmux.ts`; body unchanged at `core/watchdog.ts:419`) → "smoke done report command missing".
- The o-prime first folded the fix into item 31 (spine ruling ~01:5xZ), then STOPPED the fold at the third drift and cut item 33 (rulings rows 2026-08-28 ~02:0xZ): "resurrect the plan-055 watchdog smoke proof against the current delivery model — sqlite via channel-factory, pointer line for socketless tmux seats (item 5), awaited ticks — oracle = the harness smoke line green on the PR head, with pwsh/OSC baseline reds named separately in the smoke output so they can never mask again."

## 2. What is ruled (design / spec)
- Oracle: `harness checks` (and `harness/scripts/smoke.ts` alone) prints one line `watchdog-smoke: green` (or `watchdog-smoke: red — <reason>`), and the known environmental reds appear as `baseline-red[pwsh]: …` / `baseline-red[OSC]: …` on their own lines — never summed into the verdict (E45).
- `run-proofs.ts --smoke` stdout stays pure JSON (`runWatchdogSmoke()` contract in `smoke.ts`).
- No assertion deleted: each pointer-era rewrite keeps its intent (body asserted in the durable channel; pointer line asserted on the pane).
- Sensor honesty: breaking the watchdog fire path makes the smoke red (recorded), so the proof is not a tautology.
- Nothing under `.pi/extensions/**` changes; any needed daemon change is a regression FINDING, not part of this item.

## 3. Where the code is (at tag `d120c53` and on the branch)
- `docs/plans/055-pij-watchdog/proofs/run-proofs.ts` — the proof: at d120c53 still the drifted version. On the branch (`git diff bf1827c..785550b -- docs/plans/055-pij-watchdog/proofs/run-proofs.ts`): ticks awaited; daemon opened via `openChannel` (`adapters/channel-factory.ts:138`, the `runDaemon` seam); assertions rewritten for the pointer model; additional stale assumptions the coder found and fixed (notice recipients now resolved via item 16's helper; `unknown` verdicts not delivered since item 31; capture text shape) — see the branch's `execution.log.md`.
- `harness/scripts/smoke.ts` (+ `smoke.test.ts`) — on the branch: prints the `watchdog-smoke:` line and the labelled baseline reds; test pins the line.
- `adapters/daemon-tmux.ts` — the pointer line format the proof asserts against (read only).
- `core/watchdog.ts:419` — the nudge body text (`pij report state done`) — unchanged.

## 4. Acceptance (behavioural, mechanical)
- Branch already carries: 13 full-proof runs (`tasks/phase-16-…/logs/run-*.log`), `smoke-runner-final-rebased-2.log` showing `watchdog-smoke: green` + two `baseline-red[…]` lines, `sensor-mutation-red-final.log` (fire path disabled → `smoke first fire was not queued`), `sensor-restored-green-final.log`.
- To finish: (1) rebase onto `main`; (2) cold review with these mutants — **MUT-33a** `core/watchdog.ts isFireDue` → `false` (scratch copy) → smoke red; **MUT-33b** drop the pointer line from `daemon-tmux.ts`'s socketless delivery (scratch) → smoke red; **MUT-33c** point the proof back at `new FsChannel(home)` → red ("compact pause failed"); **MUT-33d** revert `smoke.ts`'s line → `smoke.test.ts` red; (3) gates: `npx vitest run .pi/extensions/pij/` at the merge product (branch had 172 / 4160 / 0), `just typecheck`, `just pij-skill-check`; `harness checks` output must show `watchdog-smoke: green`.
- Diff every assertion against base: none deleted; each rewrite has a stated intent in `execution.log.md`.

## 5. Live verification (after a daemon restart carrying it)
Not daemon-side. Verification: from a realpath cwd (NOT `/tmp` — see DL-020), `PIJ_HOME=$(mktemp -d) TMUX= npx tsx docs/plans/055-pij-watchdog/proofs/run-proofs.ts --smoke` → JSON with `"ok": true`; `npx tsx harness/scripts/smoke.ts` → `watchdog-smoke: green`. Failure looks like the three `smoke-red*.log` files.

## 6. Risks / gotchas that already bit us
- **E45** proofs open adapters via the production factory — drift 2 was exactly a private `FsChannel`.
- **E22** never re-run a red into green; keep every run's log — the branch keeps all 13.
- **DL-020** (item 32 review): macOS `/tmp` → `/private/tmp` defeats `daemon.ts`'s run-if-main guard; a proof launched from `/tmp` "passes" by never running the daemon. Use a realpath cwd.
- A dead sensor decays in layers; the unmaskable line is the encode so the next drift is seen the day it happens.

## 7. Open questions for the human
None. (The four `harness checks` reds at handover — OSC lint, pwsh, windows-compat mirror, and a TUI startup smoke assertion the coder reported as unrelated — should be classified by the finishing reviewer: pre-existing on clean main or not.)
