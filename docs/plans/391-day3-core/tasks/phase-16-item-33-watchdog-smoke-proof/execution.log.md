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
- Current status: T002 remains in progress at that last RED. No daemon/watchdog source was changed.

## T004 — smoke runner fence

- Asked the orchestrator before touching `harness/scripts/smoke.ts`, as required.
- Grant received: `harness/scripts/smoke.ts` plus its test file may be changed so the runner prints exactly one `watchdog-smoke: green` or `watchdog-smoke: red — <reason>` line and labels the pwsh/OSC baseline reds separately.
- No harness file has been changed yet.

## Priority interruption

- The o-prime redirected this seat to Item 32 FX-02 before Item 33 completes.
- This WIP checkpoint preserves the current proof-only state; resume from the `anomaly capture missing` RED in `logs/run-07-full.log`.
