# Coder packet — Plan 059 Phase 3 death observability

**Owner**: `pij-professional-capybara` · **Grant**: `reports/phase-grant-003.md`
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/round-detection-state`
**Branch/base**: `round/detection-state-v2` @ `fb1bfbd1f617e9b4111c3c0f965b5fe9ffa8d80a`

## Owned outcome

Implement the request-aware cross-harness death/no-show model in source and tests only. **No daemon restart, live spawn/kill specimen, commit, or runtime registry mutation.**

`unrequested-by-pij` has one meaning only: an observed terminal absence with no persisted pij close intent. Never call it crash, failure cause, human intent, provider fault, or routine-vs-abnormal judgement.

## Required architecture

1. Additive durable contracts, preferably explicit structural types:
   - close intent with actor, kind, and `requestedAt`;
   - terminal disposition `requested | unrequested-by-pij | unavailable`, `observedAt`, evidence source, optional honest `lastSeenAt` and unavailable reason;
   - correlation/notice latch fields sufficient for restart idempotence.
2. One Pi-free tagged-union reducer for descriptor-backed and expectation-backed observation. No harness-specific copy-paste classifications.
3. One atomic expectation store keyed by spawn id—not a placeholder peer descriptor. Persist expectation **before every launch attempt**; add pane/session correlation afterward; child registration/bind consumes/correlates via existing `PIJ_SPAWN_ID` handoff. Requested harness is not observed runtime harness; if no descriptor ever exists, runtime harness/cause stay unavailable.
4. Persist close intent before every pij-owned teardown: standalone CLI close, in-process close/session close, daemon once-mode auto-close, and any other owned path found by source mapping. Known launch failure resolves only its own expectation.
5. One daemon sweep across daemon-bound descriptors, registered Pi descriptors, and unresolved expectations. Provider-stuck/live PID is not death. Persist terminal disposition before creator notice; exactly one normal-path notice across ticks and reconstructed daemon/store. Failed/unavailable observation degrades explicitly.
6. Timestamped notices distinguish live observation from boot reconciliation/historical evidence. `lastEventAt` is last seen only, never fabricated death time.
7. Pi replacement reasons (`reload/new/resume/fork` or installed-contract equivalents) must not become terminal absence. Pass shutdown reason through a pure decision; a successful successor consumes/reconciles prior expectation/state.

## Required RED-first, value-pinned proof

- close-intent write appears in one ordered trace before pane kill and before descriptor dissolve for CLI, in-process close, and once-mode;
- requested close later observed absent → requested disposition; no request → unrequested-by-pij; unavailable evidence → unavailable(reason);
- daemon-bound Claude/Copilot/Codex descriptor death and registered Pi death;
- pre-register no-show matching specimen shape: expectation exists, pane returned then vanished, no descriptor; exactly one timestamped creator alert; requested/runtime harness distinction honest;
- prelaunch expectation ordering and cleanup on known launch failure; boot/bind correlation prevents double alert;
- restart recreation does not relabel historical evidence as live or duplicate a delivered/latched notice;
- replacement reasons do not terminalize; terminal Pi absence does;
- legacy descriptor/store parse remains compatible;
- landed poll/anomaly regression matrix stays green.

## Allowed writes

- `.pi/extensions/pij/core/types.ts`
- `.pi/extensions/pij/core/ports.ts`
- `.pi/extensions/pij/core/close.ts`
- `.pi/extensions/pij/core/close.test.ts`
- `.pi/extensions/pij/core/session.ts`
- `.pi/extensions/pij/core/session.test.ts`
- `.pi/extensions/pij/core/spawn.ts`
- `.pi/extensions/pij/core/spawn.test.ts`
- `.pi/extensions/pij/core/spawn-expectation.ts` (new)
- `.pi/extensions/pij/core/spawn-expectation.test.ts` (new)
- `.pi/extensions/pij/adapters/spawn-expectation-store.ts` (new)
- `.pi/extensions/pij/adapters/spawn-expectation-store.test.ts` (new)
- `.pi/extensions/pij/core/daemon/death-reconciler.ts` (new)
- `.pi/extensions/pij/core/daemon/death-reconciler.test.ts` (new)
- `.pi/extensions/pij/core/binding.ts`
- `.pi/extensions/pij/core/binding.test.ts`
- `.pi/extensions/pij/core/agent-peer.ts`
- `.pi/extensions/pij/core/agent-peer.test.ts`
- `.pi/extensions/pij/adapters/fs-registry.ts`
- `.pi/extensions/pij/adapters/fs-registry.test.ts`
- `.pi/extensions/pij/adapters/fakes.ts` only for injected test support
- `.pi/extensions/pij/daemon.ts`
- `.pi/extensions/pij/daemon.test.ts`
- `.pi/extensions/pij/cli.ts`
- `.pi/extensions/pij/cli.integration.test.ts`
- `.pi/extensions/pij/index.ts`
- `.pi/extensions/pij/index.test.ts`
- `.pi/extensions/pij/core/anomalies.test.ts` regression only
- `.pi/extensions/pij/adapters/channel.test.ts` regression only
- `.pi/extensions/pij/acceptance-sweep.test.ts`
- `docs/how/pij.md`
- `docs/domains/pij-messaging/domain.md`
- `docs/domains/pij-control-plane/domain.md`
- `skills/pij/references/00-routing.md` only if active death/close guidance needs exact update
- `docs/plans/059-detection-integrity/tasks/phase-3-death-observability/execution.log.md`

If source mapping proves one additional **existing test seam** is necessary, ask parent before writing. Everything else is read-only.

## Forbidden

No daemon command/restart, real close/spawn/adopt/register, tmux control, live `~/.pij` write, `.the-flow-state.json`, flow/government/package/config edits, Plan 060 changes, commit/stage/push, or new peer.

## Gates

Focused new reducer/store/close/session/daemon/index/CLI tests; landed anomaly/channel regressions; `just typecheck`; `just lint`; `git diff --check`; `just test` after focused green. Record environmental flakes without fixing outside scope.

## Done signal

Send parent `COMPLETE DEATH P3` with exact changed paths, RED→GREEN evidence, per-harness/ordering/restart proof, gates, and material unknowns. Stop after reporting.
