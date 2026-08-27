# Phase 7 Item 16 — execution log

## 2026-08-27

### RED

- Builder/loop/daemon reproduction:
  `npx vitest run .pi/extensions/pij/core/binding.test.ts .pi/extensions/pij/core/daemon/loop.test.ts .pi/extensions/pij/daemon.test.ts`
  failed with 11 tests: all four adopted builder cases, three parent-only
  bind/failure gates, and adopted/parent-only stalled and provider-failure
  delivery.
- Terminal-death reproduction:
  `npx vitest run .pi/extensions/pij/core/daemon/death-reconciler.test.ts -t 'routes a parent-only terminal death notice'`
  failed because the reconciler emitted no notice.

### GREEN

- Added `noticeRecipient(descriptor) = descriptor.parentId ?? descriptor.spawnedBy ?? null`
  in `core/binding.ts`.
- Routed all four lifecycle builders and the approved daemon, bind-loop, and
  terminal-death gates through that one helper.
- Preserved `spawnedBy` as close-authorization and historical creator metadata.
  Needs-human, init-injection, planned-bind-refusal, and explicit watcher-list
  behavior are unchanged.
- Focused proof:
  `npx vitest run .pi/extensions/pij/core/binding.test.ts .pi/extensions/pij/core/daemon/loop.test.ts .pi/extensions/pij/core/daemon/death-reconciler.test.ts .pi/extensions/pij/daemon.test.ts`
  passed 246 tests with 2 skipped.

### Gate evidence

- Mutation M1, `noticeRecipient` reduced to `spawnedBy`: all four adopted builder
  matrix cases failed.
- Mutation M2, the three bind-loop gates restored to `descriptor.spawnedBy`:
  all three parent-only loop cases failed.
- Mutation M3, daemon stalled/provider gates restored to `spawnedBy`: the two
  parent-only daemon cases failed while the adopted controls still passed.
- Mutation M4, terminal reconciliation bypassed the helper: both the adopted
  and parent-only death cases failed.
- Restored targeted suite: 246 passed, 2 skipped.
- `npx tsc --noEmit -p .`: passed.
- Scoped Biome over all eight changed TypeScript files: passed.
- Full extension suite `bg-mtc2gxz7-o0vhc9`: 4,058 passed, 15 skipped, 0
  failed. Because the terminal-death matrix was strengthened while that run was
  active, an exact-final-tree rerun was required; log
  `.harness/temp/s391/vitest-phase7-final.log`.
- Exact-final-tree full extension suite `bg-mtc2l9ju-iuyrcs`: 4,059 passed,
  15 skipped, 0 failed.
- `harness checks --quick`: `local-paths`, `typecheck`, `pkg-audit`, and
  `snapshots` passed; smoke was intentionally skipped by `--quick`. Repository
  baselines outside this fence remained red:
  - `lint` / `windows-compat`: existing OSC-7337 and other unrelated Biome
    diagnostics; none of the eight changed TypeScript files appears in the
    failure output, and the scoped Biome gate is clean.
  - `test`: `harness/scripts/release-age-policy.test.ts` cannot spawn `pwsh`
    on this machine (`ENOENT`); the file is unchanged from `HEAD`.
- `just lint` independently reproduced only diagnostics outside the Item 16
  file set.

### FX — persisted-recipient routing

Validation of `528a0f1` found two concurrent re-link races:

1. Planned/discovered bind and bind-failure paths persisted the merged
   descriptor but built their notice from the stale tick snapshot.
2. Terminal-death notices were resolved before the close-authority write could
   preserve a newer CLI-owned `parentId`.

RED evidence:

- A `FakeRegistry` that writes `parentId:"pij-new-parent"` as CLI truth
  immediately before each daemon publish made all three loop cases persist the
  new parent while notifying `pij-old-parent`.
- A real `FsRegistry` subclass that re-links on the close write made the
  terminal descriptor persist `pij-new-parent` while the notice still went to
  the old parent.

GREEN:

- Both bind-success paths and bind failure now gate and build from the
  descriptor returned by `persistDaemonWrite`.
- Death reconciliation retains unresolved descriptor/fixed notice candidates.
  After close writes, the daemon resolves descriptor candidates against current
  registry truth and applies dead-recipient suppression to that same truth.
- Focused suite: 252 passed, 2 skipped.
- Typecheck and scoped Biome: passed.

Mutation evidence:

- Reverting the three loop sites to the tick snapshot made all three concurrent
  re-link tests fail with `pij-old-parent`.
- Delivering the death sweep's pre-write notices instead of post-write
  resolution made the close-write re-link test fail.
- Pure resolver coverage pins both directions of post-write suppression:
  a live new parent receives the notice, while a terminal new parent suppresses
  it and increments the suppression count.

Full FX extension suite `bg-mtc3e9sh-00crfg`: 4,064 passed, 15 skipped, 0
failed; log `.harness/temp/s391/vitest-phase7-fx.log`.

Final `harness checks --quick` reproduced the same out-of-fence baselines:
`local-paths`, `typecheck`, `pkg-audit`, and `snapshots` passed; lint and
windows-compat reported existing OSC-7337 diagnostics, the test stage lacked
`pwsh`, and smoke was skipped by `--quick`.

Validation re-check of `9b5e42d..0f10d7c`:

- The original parent-first routing promise is satisfied across every named
  consumer.
- Both prior concurrent re-link findings are closed by persisted/post-write
  recipient resolution.
- Independent read-only critic: `no_material_findings`.
- Verdict: `VALIDATED`.

### FX-01 — live-recipient fallback and watchdog sensor

Review at `cc96eca` found a base regression and a surviving gate mutation:

1. A dead, failed, dissolved, or absent `parentId` prevented an adopted seat's
   lifecycle notice from reaching its still-live `spawnedBy`.
2. Reverting only the watchdog-derived stalled gate to `persisted.spawnedBy`
   left the full suite green.

RED:

- Before production changes, 18 tests failed across planned/discovered bind,
  bind failure, terminal death, whole-life stall, provider failure, and the
  watchdog-derived stalled path.
- The cases covered dead and dissolved parents falling back to a live spawner,
  plus both candidates dead producing no delivery.

GREEN:

- `noticeRecipient` remains the pure parent-first candidate-order helper.
- `resolveNoticeRecipient` classifies both candidates against current registry
  truth and the caller's dead set. Only registered, non-failed, non-dissolved,
  non-terminal candidates are live.
- Every lifecycle gate resolves after its authoritative persistence step.
  Terminal death still resolves after close-authority writes, preserving the
  concurrent re-link fix.
- With no live candidate, one notice is withheld and one line records the
  notice kind, subject id, and both candidate states.
- Focused suite:
  `npx vitest run .pi/extensions/pij/core/binding.test.ts .pi/extensions/pij/core/daemon/loop.test.ts .pi/extensions/pij/core/daemon/death-reconciler.test.ts .pi/extensions/pij/daemon.test.ts`
  passed 280 tests with 2 skipped.

Mutation evidence:

- At the watchdog-derived stalled site only, replacing the live resolver with
  `persisted.spawnedBy ?? null` made
  `routes a watchdog-derived stalled seat through a live parent` fail:
  expected `["pij-parent"]`, received `[]`.
- Restoring the resolver returned the focused suite to green.

Review follow-ups:

- The two stale `watchdog-manager.ts` comments now describe the no-live-recipient
  gate; no executable code in that file changed.
- The terminal-death adopted-seat test title no longer uses the incorrect
  article.
- Bind-refusal and needs-human routing remain explicitly out of scope.
- Sender provenance remains assigned to Item 31.

Fixture-only full-suite correction:

- The first full extension run failed only these eight existing positive cases
  in `daemon-push.test.ts`, all because their asserted `pij-boss` recipient was
  absent from the fake registry:
  1. `pushes a stalled notice to the creator when a bound session is working+stale`
  2. `DOES push stalled when the pane is byte-STABLE past the window (genuine stall)`
  3. `pushes a dead notice to the creator when the bound session's pid is gone`
  4. `pushes only once for a dead session (latch)`
  5. `daemon driveSession detects bad model → fail with model-not-supported → creator notified`
  6. `detects quota error in pane of idle pid-alive bound session → pushes once to creator`
  7. `pushes only ONCE per provider-failure (latch)`
  8. `detects the sakana credit error in a pi worker's pane → pushes once to creator`
- With explicit orchestrator approval, the test helper now registers every
  referenced notice candidate as a live descriptor. The eight existing
  assertions are byte-unchanged.
- A new inverse test constructs the old unregistered-recipient shape directly
  and proves zero delivery plus exactly one
  `notice stalled ... spawner pij-boss absent` log line.
- Focused fixture suite: 20 passed, 2 skipped.
- Exact-final full extension suite `bg-mtc5vjlo-oyc8rc`: 171 files passed, 2
  skipped; 4,093 tests passed, 15 skipped, zero failed. Log:
  `.harness/temp/s391/vitest-phase7-fx01.log`.

Final gates:

- `npx tsc --noEmit -p .`: passed.
- Scoped Biome over all ten changed TypeScript files: passed.
- `harness checks` passed `local-paths`, `typecheck`, `pkg-audit`, and
  `snapshots`, but remained repository-baseline red outside this fence:
  - `lint` and `windows-compat`: existing `osc-7337-producer.ts` diagnostics.
  - `test`: `release-age-policy.test.ts` cannot spawn missing `pwsh`.
  - `smoke`: environment startup failed on missing Sakana credentials, a
    third-party skill parse error, and the existing status-line/first-fire
    scenarios; no FX-01 path appears in the failure output.
- Watchdog-manager differs from `cc96eca` only at the two approved comment
  sites. The `daemon-push.test.ts` assertion diff contains only the two
  assertions added by the new inverse case; no existing assertion changed.
