# Plan 059 Phase 3 execution log

## Final hardening — 2026-07-20

- Packet executed: `docs/plans/059-detection-integrity/reports/coder-packet-death-p3-harden-001.md`.
- RED command: `just test .pi/extensions/pij/core/spawn-expectation.test.ts .pi/extensions/pij/core/daemon/death-reconciler.test.ts .pi/extensions/pij/core/session.test.ts .pi/extensions/pij/daemon.test.ts .pi/extensions/pij/cli.integration.test.ts .pi/extensions/pij/core/focus.test.ts .pi/extensions/pij/index.test.ts .pi/extensions/pij/core/cli.test.ts`.
  - Clean semantic RED: **7 failed, 388 passed, 395 total** across 8 files.
  - Failures pinned parsed-epoch expiry/distinct `expectation-expired` evidence, malformed requested/deadline time degradation, post-PID failure-reason containment, daemon-bound expectation correlation, real CLI close ordering, and human unavailable projection.
- GREEN command: the same focused matrix.
  - Final: **395 passed, 0 failed** across 8 files.
- Ordered-trace proof:
  - `PijSession.spawn`: `expectation-write → tmux-launch → pane-update`, with `requestedAt` and exact named 300,000 ms deadline.
  - focus launch: `expectation-write → tmux-launch → pane/bind updates`; synchronous launch failure ends `expectation-write → tmux-launch → expectation-remove` and preserves a sentinel expectation.
  - `PijSession.close`, standalone CLI close, and daemon once close: `intent-write → kill → terminal-write → dissolve`.
  - failed in-process kill retains close intent and performs neither terminal write nor dissolve.
  - fake-tmux prelaunch snapshots prove standalone Pi, standalone daemon-bound, and agent expectations existed without `paneId` before launch; final records correlate pane/spawn/session as applicable.
- Death/restart proof:
  - deadline-only no-show uses `expectation-expired`; recorded-pane disappearance remains `pane-missing`.
  - ISO values are compared as parsed epoch milliseconds; malformed persisted `requestedAt`/`deadlineAt` terminalize as `unavailable` with `observation-unavailable` and a concrete reason.
  - a throwing compatibility `failureReasonFor` is contained after PID absence; terminal `pid-missing` truth survives and optional `failureReason` is omitted.
  - first daemon sweep emits timestamped `historical boot reconciliation`, persists terminal/latch, reconstructed daemon emits no duplicate; later sweep says `live observation`.
  - Pi `session_shutdown` replacement reason dissolves without false terminal truth; `quit` remains observable.
- Projection proof: `state --json` and `list --json` preserve complete terminal disposition/evidence/times/reason; human state names evidence and unavailable reason.
- Regression command: `just test .pi/extensions/pij/daemon-push.test.ts .pi/extensions/pij/core/anomalies.test.ts .pi/extensions/pij/adapters/channel.test.ts`.
  - **61 passed, 0 failed**: daemon-push 21, anomalies 26, channel 14.
- Static gates:
  - `just typecheck`: pass.
  - `just lint`: exit 0; only pre-existing repository warnings and Biome schema-version info remain.
  - `git diff --check`: pass.
  - `harness checks --quick`: pass for local-paths, typecheck, lint, test, windows-compat, package audit, and snapshots; smoke intentionally skipped because live tmux mutation was forbidden.
- Full `just test` was run twice after focused green. Both runs: **3,078 passed, 1 failed, 11 skipped (3,090 total); 170 files passed, 1 failed, 4 skipped (175 total)**.
  - Sole failure both times: existing `.pi/extensions/pij/adapters/channel.test.ts` `drains messages already present when watch starts, in order` afterEach cleanup timeout at 10,000 ms.
  - This is isolated from Phase 3: the required focused channel run passed **14/14**, and the intervening `harness checks --quick` test sensor passed.
- Mutation resistance: removing/reordering any expectation write, tmux launch, pane/bind update, close intent, kill, terminal write, dissolve, historical latch, spawn-id correlation, shutdown-reason forwarding, or terminal projection field breaks an exact trace/object assertion; lexical ISO comparison, relabeling expiry as pane loss, swallowing malformed time, or allowing capture throws each has a dedicated failing specimen.
- No daemon command/restart, live spawn/close/adopt/register, real tmux control, live `~/.pij` mutation, commit, stage, push, peer spawn, Plan 060 edit, or unrelated flake fix was performed.

## Lead acceptance

- Re-ran the complete focused matrix: **395/395**; landed daemon-push/anomaly/channel regressions: **61/61**; typecheck, lint, and diff-check passed.
- Reversible source mutations all went RED, then restored suites GREEN: `expectation-expired → pane-missing`; removal of spawn-id correlation; boot historical flag forced false; removal of requested terminal persistence from in-process close.
- Lead full suite reproduced only the unchanged channel cleanup-hook timeout: **3,078 passed / 1 failed / 11 skipped**. The exact test immediately passed on the candidate and clean `fb1bfbd`; logs `reports/channel-cleanup-flake-{candidate,clean-base}.log`.
- Final `harness checks --quick` passed all seven runnable sensors; smoke remains intentionally held with the daemon restart/live activation gate.
