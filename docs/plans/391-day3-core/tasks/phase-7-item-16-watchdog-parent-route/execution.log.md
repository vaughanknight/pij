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
