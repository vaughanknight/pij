# Phase 16 execution log

## T001 — recover the stopped proof rewrite

- Branch/base: `s391/item33-watchdog-smoke-proof` at `e935c88f323a82fa87124c4cfd561db68a12f01d`.
- Applied `.harness/temp/s391/run-proofs-partial.patch` byte-for-byte.
- The recovered patch awaits every asynchronous `daemon.tick()` and uses the production `openChannel()` backend instead of a private `FsChannel`.
- Reproduced the expected third drift: `smoke done report command missing`.
- Preserved log: `logs/red-3-repro.log`.

## T002 — pointer-era and later model drift

- Rewrote the default-teaching and smoke-composite assertions without deleting their intent:
  - The full watchdog nudge body and its done/pause guidance are asserted in the durable channel.
  - The pane receives exactly `[pij from pij-watchdog] 1 new message — run: pij inbox`.
  - The pane is asserted not to contain the full nudge body.
- The isolated smoke then passed.
- Preserved log: `logs/run-02.log`.
- The full proof exposed further pre-existing model drift, fixed one reason at a time:
  1. `blind scheduling skipped a fire: 2` (`logs/run-03-full.log`) — pointer-delivered rows need explicit recipient consumption and the independent delivery pass.
  2. The first consumption attempt still produced `blind scheduling skipped a fire: 2` (`logs/run-04-full.log`) because marking after a tick was too late: the scheduler had already coalesced against the still-pending row.
  3. Added the production-style `daemon.deliverPass()` between scheduler ticks and consumed each delivered pointer. The fire count recovered, exposing `owner stalled notices=0` (`logs/run-05-full.log`).
  4. Registered `owner` and `watcher` as live worker recipients, matching Item 16 lifecycle-notice routing. The scenario passed, exposing `always mode missed the fire notice` (`logs/run-06-full.log`).
  5. Reversed the obsolete pre-Item-31 expectation: an initial `unknown` verdict produces no watcher notice; anomaly/always capture assertions now attach to the later evidence-backed verdict. The next full proof reached `anomaly capture missing` (`logs/run-07-full.log`).
  6. After resuming on rebased base `916e9158c08bbdbdfd9615c031e38a764911d7cc`, delivered and consumed the first pointer before the next due tick. The proof then exposed an incidental UTF-8 fixture alignment assumption (`logs/run-08-full.log`).
  7. Replaced that incidental assumption with a dedicated multibyte-boundary probe while retaining exact end-to-end capture equality. A missing import caused a setup RED (`logs/run-09-full.log`), then the real next mismatch showed the inline notice now contains the newest five capture lines, not the oldest five (`logs/run-10-full.log`).
  8. A fixed 25 ms pane-read delay then failed once (`logs/run-11-full.log`); replaced it with a bounded predicate wait. The diagnostic rerun preserved the inline-tail mismatch (`logs/run-12-full.log`).
  9. Rewrote the inline assertion from capture head to capture tail, matching the current production contract in `watchdog-manager.ts`. The full proof passed all nine AC rows (`logs/run-13-full.log`).
- Final full-proof log: `logs/full-final.log` — 9 passed, 0 skipped, 0 failed.
- No daemon/watchdog source was changed.

## T003 — sensor honesty

- Built an isolated scratch copy of the proof and its imported extensions; the repository `.pi/extensions/**` tree remained untouched.
- Mutation: changed the scratch copy of `isFireDue()` to return `false`.
- RED result: `smoke first fire was not queued`.
- Preserved output: `logs/sensor-mutation-red-final.log`.
- Restored candidate proof: PASS.
- Preserved output: `logs/sensor-restored-green-final.log`.
- Two earlier scratch-assembly failures are retained separately as `logs/sensor-mutation-setup-red.log` (missing ESM package metadata) and `logs/sensor-mutation-setup-red-2.log` (missing sibling `file-watch-notify` extension); neither is claimed as sensor evidence.

## T004 — smoke runner fence

- Asked the orchestrator before touching `harness/scripts/smoke.ts`, as required.
- Grant received: `harness/scripts/smoke.ts` plus its test file may be changed so the runner prints exactly one `watchdog-smoke: green` or `watchdog-smoke: red — <reason>` line and labels the pwsh/OSC baseline reds separately.
- RED test: `renderWatchdogSmokeLines` was absent (`logs/output-red.log`).
- Added `renderWatchdogSmokeLines()` and kept `run-proofs.ts --smoke` stdout as pure JSON for `runWatchdogSmoke()`.
- The runner now prints:
  - `watchdog-smoke: green`, or one whitespace-normalized `watchdog-smoke: red — <reason>` line.
  - A separate labelled pwsh baseline-red line.
  - A separate labelled OSC/Biome baseline-red line.
- Unit GREEN: `logs/output-green.log`.
- Focused runner GREEN: `logs/smoke-runner-final.log`.
- Final smoke JSON: `logs/smoke-final.log`.
- The watchdog run executes after the other smoke scenarios. When any smoke has failed, its verdict and baseline labels are written once to stderr, the stream retained by `harness checks`; otherwise they are written once to stdout.

## Priority interruption

- The o-prime redirected this seat to Item 32 FX-02 before Item 33 completes.
- WIP commit `36119c4` preserved the proof through `logs/run-07-full.log`.
- Item 32 FX-02 completed and was reported at `af84d06c9920235b26e930cdc0cedd3de769764e`.
- This branch was then rebased onto `origin/main` base `916e9158c08bbdbdfd9615c031e38a764911d7cc`; the WIP commit became `2026d92fe035f03bd68fb29f728f8f8509ab333d`.
- Before final gates, main advanced again; the branch was rebased onto `f3095ac23d8106ce18da751ddd9d659cf2296e91`, rewriting the WIP commit to `e329fbd5bacd8f9907abe5fafadebf2dd7bc9f2d`.
- Main advanced once more before commit; the branch was rebased onto
  `bf1827c93158a6028b313ca668f26e8a1f00d357`, rewriting the WIP commit to
  `cf80e80e17b17949021f4ecf2cfa973dc27f8530`.

## Final gates

- Final-base full proof: 9 passed, 0 skipped, 0 failed (`logs/full-final-rebased-2.log`).
- Final-base smoke runner:
  - `watchdog-smoke: green`
  - `baseline-red[pwsh]: harness/scripts/release-age-policy.test.ts requires pwsh`
  - `baseline-red[OSC]: .pi/extensions/pij/producers/osc-7337-producer.ts has existing Biome findings`
  - Log: `logs/smoke-runner-final-rebased-2.log`.
- Smoke runner unit tests: 5 passed (`logs/smoke-test-final-rebased-2.log`).
- Full extension suite: 172 files passed, 2 skipped; 4,160 tests passed, 15 skipped.
- Full-suite output: `.harness/temp/s391/vitest-phase16.log`.
- Detached job output: `/Users/vaughanknight/.pij/pij-jolly-moose/bg-mtchf0ih-vsh0ou.log`.
- Root TypeScript check passed.
- Scoped Biome passed for `run-proofs.ts`, `smoke.ts`, and `smoke.test.ts`.
- Full `harness checks`:
  - Passed `local-paths`, `typecheck`, `pkg-audit`, and `snapshots`.
  - Retained the known `lint`, `test`, and `windows-compat` baseline failures (OSC producer findings and unavailable local `pwsh`).
  - The aggregate smoke sensor remains red on an unrelated existing TUI startup assertion, but its retained stderr now ends with the watchdog's independent GREEN verdict and the two labelled baseline lines.
  - Log: `logs/harness-checks-final-rebased-2.log`.
