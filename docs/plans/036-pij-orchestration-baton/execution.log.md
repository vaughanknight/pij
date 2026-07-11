# Plan 036 execution log

| Time (UTC) | Task | Evidence |
|------------|------|----------|
| 2026-07-11T09:23Z | Pre-flight | `harness boot` passed typecheck and tests. |
| 2026-07-11T09:27Z | T001 | Added the `pij-orchestration` domain contract, registry row, domain-map node/edges, health relationships, and history entries. |
| 2026-07-11T09:28Z | T002–T003 | Baton lifecycle tests failed on the missing module, then passed 7/7 after the pure core, local ports, pin/re-pin, blocked-time, release, and transition decisions landed. |
| 2026-07-11T09:29Z | T004–T005 | Store tests failed on the missing adapter, then passed 5/5 for one-winner lease publication, tmp+rename metadata, NDJSON append, corrupt-file tolerance, and lease-id-safe release. |
| 2026-07-11T09:31Z | T006–T009 | Parser/notice tests failed first, then passed with the full verb grammar, exit map, fake store/notice ports, receipt-aware service operations, additive bin intercept, and daemon-less CLI lifecycle smoke. |
| 2026-07-11T09:34Z | T010–T011 | Sweep tests failed on the missing module, then passed 5/5; additive daemon wiring also kept the existing daemon suites green (38 tests). No daemon restart performed. |
| 2026-07-11T09:36Z | T012 | Added the baton operator guide and the `docs/how/pij.md` family row. |
| 2026-07-11T09:40Z | T013 | Final `npx vitest run .pi/extensions/pij/`: 74 files passed, 2 skipped; 1124 tests passed, 6 skipped. `just pij-skill-check`: all green (one pre-existing advisory budget warning). Final `harness checks --quick`: typecheck, lint, test, pkg-audit, and snapshots all passed; smoke skipped by `--quick`. |
| 2026-07-11T09:55Z | Review fixes F1–F4 | Added RED coverage for unverifiable pins, persist-before-mutate failure ordering, production-shaped sweep recovery, grant-race queue preservation, JSON timing, queue wording, every-verb logging, and production receipt classification; focused suite passed 37/37 after the fixes. |
| 2026-07-11T09:58Z | Review fix gates | Orchestration fence: 5 files and 66 tests passed; explicit Biome check over 10 orchestration files passed; `just pij-skill-check` remained green with the pre-existing bootstrap budget advisory. `harness checks --quick` passed typecheck, package audit, and snapshots (smoke skipped); its lint/test sensors remained red only for concurrent Plan 037 broadcast work in `.pi/extensions/pij/core/cli.ts`, `.pi/extensions/pij/core/cli.test.ts`, and `.pi/extensions/pij/cli.integration.test.ts`, accepted as explicit exclusions by the orchestrator and escalated to the o-prime. |

## Changed files

Created:

- `.pi/extensions/pij/core/orchestration/baton.ts`
- `.pi/extensions/pij/core/orchestration/baton.test.ts`
- `.pi/extensions/pij/core/orchestration/cli.ts`
- `.pi/extensions/pij/core/orchestration/cli.test.ts`
- `.pi/extensions/pij/adapters/baton-store.ts`
- `.pi/extensions/pij/adapters/baton-store.test.ts`
- `.pi/extensions/pij/core/daemon/baton-sweep.ts`
- `.pi/extensions/pij/core/daemon/baton-sweep.test.ts`
- `.pi/extensions/pij/orchestration-notice.integration.test.ts`
- `docs/domains/pij-orchestration/domain.md`
- `docs/how/pij-orchestration-baton.md`
- `docs/plans/036-pij-orchestration-baton/execution.log.md`

Modified:

- `.pi/extensions/pij/adapters/fakes.ts`
- `.pi/extensions/pij/cli.ts`
- `.pi/extensions/pij/daemon.ts`
- `docs/domains/registry.md`
- `docs/domains/domain-map.md`
- `docs/how/pij.md`
- `docs/plans/036-pij-orchestration-baton/tasks/phase-1/tasks.md`

## Decisions and trade-offs

- The lease file is the sole ownership authority. Definition metadata is advisory, so lease publication uses atomic no-replace while definition updates use atomic replacement.
- Queue selection is deliberately by request ID rather than FIFO. Human rendering exposes requester and purpose without positional labels.
- A pinned request with unavailable HEAD now requires explicit `--repin` acknowledgement. Because no replacement SHA exists, the lease preserves the original pin and records `repinAck: true` in both lease and machine log.
- Machine-log append now precedes every durable define/request/grant/return/reclaim mutation. A later state-write failure may leave an intent line, but that residue is reconstructible; a log failure leaves authoritative state unchanged.
- Holder health is derived from current process liveness and current working/idle state. Persisted `failureReason` remains diagnostic history and cannot keep a recovered holder latched as stalled.
- Receipt states remain honest rather than optimistic: dead targets and stale control-plane heartbeats are `unverified`, live busy targets are `queued`, and only live idle pi targets are `delivered`.
- `--probe` remains recorded metadata in v1; orchestration does not execute arbitrary probe commands.
