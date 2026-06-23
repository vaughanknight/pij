# Code Review: Phase 2 — Session wiring + tools + ready-ping

**Plan**: `/Users/jordanknight/pi-hacking/pij/docs/plans/017-pij-spawn-tmux-windows/pij-spawn-tmux-windows-plan.md`  
**Spec**: `/Users/jordanknight/pi-hacking/pij/docs/plans/017-pij-spawn-tmux-windows/pij-spawn-tmux-windows-plan.md` (`## Business Specification`)  
**Phase**: `Phase 2: Session wiring + tools + ready-ping`  
**Date**: 2026-06-23  
**Reviewer**: pij peer `pij-1vru9uw` (parent-side review; no subagents because this harness' review subagents are read-blind)  
**Testing Approach**: Hybrid — fakes-tested pure/session core, impure tmux path deferred to Phase 3 smoke.

Computed diff: `/Users/jordanknight/pi-hacking/pij/docs/plans/017-pij-spawn-tmux-windows/reviews/_computed.phase-2-20260623T095057Z.diff`  
Compatibility copy: `/Users/jordanknight/pi-hacking/pij/docs/plans/017-pij-spawn-tmux-windows/reviews/_computed.diff`

## A) Verdict

**REQUEST_CHANGES**

Phase 2's core race/idempotency/H1/H3/M5 wiring is mostly correct and mutation-guarded, but the deterministic `harness checks --quick` gate is red, and `pij_close` still does not surface the AC-06 non-owner warning in the tool result text.

**Key failure areas**:
- **Implementation**: `pij_close` captures a warn event for close-not-mine but returns the same success text, so AC-06's warning is not visible to the caller.
- **Domain compliance**: `pij-messaging` docs/map still describe the old five-port/pre-spawn contract.
- **Testing**: Core tests pass and the CF-01 task branch mutation went RED→GREEN; the deterministic harness gate is red on lint.
- **Doctrine**: Phase-scoped Biome is clean for the six reviewed files; repo-level `harness checks --quick` is not.

## B) Summary

The dangerous Phase 2 paths were checked directly in source. `boot()` is fresh-guarded, sends the ready ping via `delivery.deliver`, and fires exactly one inject: either the spawned task or the generic announce, never both. `spawn()` gates `E-NOTMUX` in `PijSession`, avoids `PIJ_PANE_ID`, and leaves the child to read its own `$TMUX_PANE` through `ports.process.env`. `close()` correctly guards `paneId` before `killWindow`, and the core remains pi-free/tmux-free. The two blockers are gate health and the missing user-facing close warning; remaining items are spec/doc/evidence drift.

## C) Checklist

**Testing Approach: Hybrid**

For fakes/core/session coverage:
- [x] Core/session validation tests present (`.pi/extensions/pij/core/session.test.ts`).
- [x] Critical spawn/close/ready/self-task/reload paths covered.
- [x] Mutation probe confirms CF-01 task-branch test is non-vacuous.

Universal:
- [x] Reviewed only the requested Phase 2 code files plus required adjacent contracts/docs.
- [x] Typecheck passes via `harness checks --quick`.
- [x] Test suite passes via `harness checks --quick`; targeted mutation restore also passes session tests.
- [ ] Deterministic gate green (**fails lint**, F001).
- [ ] AC-06 user-facing warning satisfied (**missing**, F002).
- [ ] Domain docs current (**stale**, F004).

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | `/Users/jordanknight/pi-hacking/pij/skills/flow-pair/test/ledger-records.test.ts:175`; gate command from repo root | validation / gate | Required `harness checks --quick` is red: typecheck/test/pkg/snapshots pass, smoke skipped, but lint fails on a pre-existing non-Phase-2 Biome issue. The request explicitly said red gate evidence is HIGH. | Fix the lint finding or record an explicit accepted baseline and rerun `harness checks --quick` green before approval. Phase-scoped Biome for the six reviewed files is clean. |
| F002 | HIGH | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/core/session.ts:215-230`; `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/index.ts:181-187` | implementation / acceptance | AC-06 requires `pij_close` on a peer spawned by someone else to return result text carrying a warning. The core captures a `warn-close-not-mine` event, but `close()` returns `Result<void>` and the tool always returns `closed pij worker: <id>` with no warning. | Return warning data from `PijSession.close()` (for example `Result<{ warning?: string }>`), include it in `pij_close` success text, and add a test asserting the caller-visible warning. Consider warning when `spawnedBy` is absent but `paneId` exists too. |
| F003 | MEDIUM | `/Users/jordanknight/pi-hacking/pij/docs/plans/017-pij-spawn-tmux-windows/tasks/phase-2-session-wiring/tasks.md:228`; `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/core/session.ts:187-191`; `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/core/spawn.ts:60-80` | spec drift / contract | §H2 says `buildSpawnCommand()` should emit `PIJ_SPAWN_MODEL` when `model` is given. The implementation instead post-processes `spawnCmd.env` inside `PijSession.spawn()`. It works for the current call path but leaves the pure spawn-builder contract stale. | Move `PIJ_SPAWN_MODEL` into `core/spawn.ts` and cover it in `spawn.test.ts`, or explicitly amend §H2 to say model-env augmentation belongs to `PijSession.spawn()`. |
| F004 | MEDIUM | `/Users/jordanknight/pi-hacking/pij/docs/domains/pij-messaging/domain.md:19-56`; `/Users/jordanknight/pi-hacking/pij/docs/domains/domain-map.md:13,43` | domain-compliance | Domain artifacts still describe the old five-port/pre-spawn `pij-messaging` contract and omit `TmuxPort`, `core/spawn.ts`, descriptor `paneId`/`spawnedBy`, `E-NOTMUX`, and `pij_spawn`/`pij_close`. | Update `domain.md`, `domain-map.md`, and history for Plan 017, or explicitly defer this to Phase 3 docs with a tracked task. |

## E) Detailed Findings

### E.1) Implementation Quality

**What passes the heavy Phase 2 lenses**:
- CF-01 race: `session.ts:154-159` fires exactly one inject when `PIJ_SPAWN_TASK` is present; the ready ping is `delivery.deliver`, not a `pi.inject` turn.
- Idempotency: the ready-ping/self-task branch is inside `if (fresh)` and the reload test asserts no re-ping/no inject.
- §H1: child boot reads `ports.process.env("TMUX_PANE")`; `spawn()` does not pass `paneId` into `buildSpawnCommand` and tests assert `PIJ_PANE_ID` is absent.
- §H3: `close()` guards `descriptor.paneId` before `killWindow`, returning `E-NOID` on missing pane id.
- §M5: `E-NOTMUX` lives in `PijSession.spawn()` via `ports.tmux.currentSession() === null`; the tool is a thin pass-through.
- P2/AC-08: `core/` imports no real pi SDK, `node:child_process`, or `TmuxAdapter`; tmux impurity remains in `adapters/tmux.ts` and `index.ts` wiring.

**Blocking implementation issue**: F002 — AC-06's warning is logged but not returned to the `pij_close` caller.

**Additional UX note included in F002**: `index.ts:172` says to pass "the session id returned by pij_spawn", but `pij_spawn` returns `spawnId` + `paneId`, not the child `SessionId`; the child id arrives later as `[pij from <child-id>]` or via `pij list`. Adjust this text while fixing the close warning.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | All reviewed source files are under `.pi/extensions/pij/`, mapped to `pij-messaging`. |
| Contract-only imports | ✅ | Core imports only local contracts/types; `index.ts` owns pi/tool wiring and `TmuxAdapter` construction. |
| Dependency direction | ✅ | Core depends on ports; impure adapters/wiring depend inward. |
| Domain.md updated | ❌ | F004: `domain.md` still documents five ports and no spawn/close contract. |
| Registry current | ✅ | No new domain introduced; registry row remains broadly accurate but under-specific. |
| No orphan files | ⚠️ | `core/cli.ts` is outside the original Phase 2 manifest but justified by exhaustive `Record<PijErrorCode, number>` after adding `E-NOTMUX`. |
| Map nodes current | ❌ | F004: `domain-map.md` label still says `5 ports`. |
| Map edges current | ✅ | No new cross-domain dependency edge introduced. |
| No circular business deps | ✅ | No new dependency cycle. |
| Concepts documented | ❌ | Concepts/contracts table does not include spawn lifecycle, ready ping, or TmuxPort. |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|-----------------|--------|--------|
| `PijSession.spawn()` / `close()` | None; lifecycle feature is new and consumes Phase 1 `core/spawn.ts` + `TmuxPort`. | pij-messaging | Proceed |
| `pij_spawn` / `pij_close` tools | Mirrors existing `pij_send` registerTool shape. | pij-messaging / agent-tooling-interface surface | Proceed; fix warning/prompt text |
| `FakeTmux({ sessionName: null })` | Extension of existing fake-adapter pattern. | pij-messaging | Proceed |

### E.4) Testing & Evidence

**Coverage confidence**: 82%

Evidence:
- `harness checks --quick`: typecheck ✅, test ✅, smoke skipped, pkg-audit ✅, snapshots ✅, lint ❌ (F001).
- Phase-scoped Biome on the six reviewed files: ✅ clean.
- Targeted mutation probe: changing `if (task)` to `if (false)` in `boot()` made `session.test.ts` RED (`1 failed | 28 passed`), then restored GREEN (`29 passed`). This proves the CF-01 task/announce suppression path is guarded.
- Execution log claims `just test` green with `698 passed, 4 skipped`; `harness checks --quick` corroborates test pass.

Gaps:
- F001: deterministic gate red.
- F002: no test covers caller-visible warning text for `pij_close`; the current test only asserts the internal warn event.
- F003: `PIJ_SPAWN_MODEL` is not covered at the pure builder contract layer requested by §H2.

### E.5) Doctrine Compliance

- **P2**: ✅ core remains pi-free and tmux-free in the source-code sense; environment reads are through `ProcessPort.env()`.
- **P3**: ✅ tmux side effects are injected via `TmuxPort` and built in `index.ts`.
- **P4**: ✅ `spawn()`/`close()` return tagged `Result<>`; no throws in core.
- **P7**: ✅ relative imports use `.js` extensions.
- **P8**: ✅ session logic tests target fakes.
- **P9**: ✅ spawned child persists `paneId`/`spawnedBy` before the ready ping.
- **P10**: ✅ single `session_start` handler; boot path is additive and reason-independent.
- **Gate doctrine**: ❌ F001 — required deterministic gate is red.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-01 | `pij_spawn` opens one tmux window and returns spawn token + pane id. | `PijSession.spawn()` uses `TmuxPort.newWindow`; test asserts one `FakeTmux.windows[]` entry and `%900`; tool returns `spawnId` + `paneId`. Real tmux smoke remains Phase 3. | 80% |
| AC-02 | Per-spawn model maps to `--model` iff provided. | Phase 1 builder tests; Phase 2 session test asserts `--model` and `PIJ_SPAWN_MODEL`. F003 notes contract location drift. | 85% |
| AC-03 | Ready message includes spawn token/model/cwd exactly once, not on reload. | Fresh boot test asserts ready-ping body; reload test asserts no ping. The message is delivered via `DeliveryPort`, then existing inbound path frames it as `[pij from <id>]`. | 85% |
| AC-04 | Optional task self-starts safely without prompt race. | `boot()` injects task instead of announce when `PIJ_SPAWN_TASK`; mutation probe proves test fails if this branch is disabled. | 90% |
| AC-05 | Descriptor carries `paneId`; close kills/removes. | Boot persists `$TMUX_PANE`; close test asserts `killWindow(%901)` and registry removal. | 85% |
| AC-06 | Close not-owned warns; missing/dead clean error. | Missing/no-pane paths return `E-NOID`; non-owner close captures warn event and still closes. F002: caller-visible result text warning is missing. | 55% |
| AC-07 | Spawn outside tmux returns clean `E-NOTMUX`. | `session.spawn()` checks `currentSession() === null`; `FakeTmux({sessionName:null})` test asserts no window and `E-NOTMUX`; `core/cli.ts` exhaustive exit map updated. | 85% |
| AC-08 | `core/` free of pi SDK/child_process; impurity confined. | Grep found only comments/port env calls in core; real `execFileSync` only in `adapters/tmux.ts`; `TmuxAdapter` constructed in `index.ts`. | 95% |
| AC-09 | Tmux invocations use argv arrays; task quotes/spaces intact. | Phase 1 tmux adapter/build tests; Phase 2 passes task via env only. | 90% |

**Overall coverage confidence**: 82% for Phase 2 scope. End-to-end tmux behaviour remains Phase 3 smoke by design.

## G) Commands Executed

```bash
git status --short -- .pi/extensions/pij/core/types.ts .pi/extensions/pij/core/session.ts .pi/extensions/pij/core/session.test.ts .pi/extensions/pij/adapters/fakes.ts .pi/extensions/pij/index.ts .pi/extensions/pij/core/cli.ts docs/plans/017-pij-spawn-tmux-windows

git diff -- .pi/extensions/pij/core/types.ts .pi/extensions/pij/core/session.ts .pi/extensions/pij/core/session.test.ts .pi/extensions/pij/adapters/fakes.ts .pi/extensions/pij/index.ts .pi/extensions/pij/core/cli.ts

harness checks --quick
# result: typecheck pass, lint fail, test pass, smoke skipped, pkg-audit pass, snapshots pass

NO_COLOR=1 npx biome check .pi/extensions/pij/core/types.ts .pi/extensions/pij/core/session.ts .pi/extensions/pij/core/session.test.ts .pi/extensions/pij/adapters/fakes.ts .pi/extensions/pij/index.ts .pi/extensions/pij/core/cli.ts
# result: checked 6 files; no fixes applied

bash harness/scripts/flow-pair-mutate.sh .pi/extensions/pij/core/session.ts 's/if \(task\) \{/if (false) {/' 'npx vitest run .pi/extensions/pij/core/session.test.ts'
# result: RED under mutation (1 failed | 28 passed), GREEN after restore (29 passed)

ctx_grep '@earendil-works|child_process|TmuxAdapter|process\.env' .pi/extensions/pij/core
ctx_grep 'execFileSync|child_process|args\.join|shell' .pi/extensions/pij
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review — only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: `/Users/jordanknight/pi-hacking/pij/docs/plans/017-pij-spawn-tmux-windows/pij-spawn-tmux-windows-plan.md`  
**Spec**: `/Users/jordanknight/pi-hacking/pij/docs/plans/017-pij-spawn-tmux-windows/pij-spawn-tmux-windows-plan.md`  
**Phase**: `Phase 2: Session wiring + tools + ready-ping`  
**Tasks dossier**: `/Users/jordanknight/pi-hacking/pij/docs/plans/017-pij-spawn-tmux-windows/tasks/phase-2-session-wiring/tasks.md`  
**Execution log**: `/Users/jordanknight/pi-hacking/pij/docs/plans/017-pij-spawn-tmux-windows/tasks/phase-2-session-wiring/execution.log.md`  
**Review file**: `/Users/jordanknight/pi-hacking/pij/docs/plans/017-pij-spawn-tmux-windows/reviews/review.phase-2-20260623T095057Z.md`  
**Fix tasks**: `/Users/jordanknight/pi-hacking/pij/docs/plans/017-pij-spawn-tmux-windows/reviews/fix-tasks.phase-2-20260623T095057Z.md`

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/core/types.ts` | Modified | pij-messaging | None; additive fields + `E-NOTMUX` OK. |
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/core/session.ts` | Modified | pij-messaging | Fix close warning return; consider moving model env contract to builder. |
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/core/session.test.ts` | Modified | pij-messaging | Add caller-visible close-warning assertion after API shape fix. |
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/adapters/fakes.ts` | Modified | pij-messaging | None; nullable `FakeTmux.sessionName` supports `E-NOTMUX`. |
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/index.ts` | Modified | pij-messaging | Include close warning in tool result; fix `pij_close` prompt text. |
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/core/cli.ts` | Modified | pij-messaging | Justified: exhaustive `E-NOTMUX` exit map. |
| `/Users/jordanknight/pi-hacking/pij/docs/domains/pij-messaging/domain.md` | Existing docs | pij-messaging | Update stale spawn/TmuxPort/tool contracts. |
| `/Users/jordanknight/pi-hacking/pij/docs/domains/domain-map.md` | Existing docs | pij-messaging | Update `pij-messaging` node label/contracts. |
| `/Users/jordanknight/pi-hacking/pij/skills/flow-pair/test/ledger-records.test.ts` | Existing unrelated file | flow-pair | Fix lint or accept baseline so `harness checks --quick` goes green. |

### Required Fixes

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| FT-001 | `/Users/jordanknight/pi-hacking/pij/skills/flow-pair/test/ledger-records.test.ts` or harness baseline | Make `harness checks --quick` green. | Deterministic gate is red; request explicitly classifies this as HIGH even though it is outside Phase 2 source. |
| FT-002 | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/core/session.ts`; `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/index.ts`; `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/core/session.test.ts` | Return and display a non-owner close warning. | AC-06 requires result text carrying a warning; current implementation only records an internal event. |

### Domain Artifacts to Update

| File (absolute path) | What's Missing |
|---------------------|----------------|
| `/Users/jordanknight/pi-hacking/pij/docs/domains/pij-messaging/domain.md` | `core/spawn.ts`, `TmuxPort`, descriptor `paneId`/`spawnedBy`, `E-NOTMUX`, ready ping, `pij_spawn`/`pij_close`, six-port wording/history. |
| `/Users/jordanknight/pi-hacking/pij/docs/domains/domain-map.md` | `pij-messaging` label still says `5 ports`; health summary still frames pi/runtime wiring as future. |

### Handback

Fixes go back through the implement verb for the same phase, then re-run this review. The central race/idempotency logic is in good shape; close the gate and AC-06 warning before approval.

Routing is the flow's job — run the parent flow bare to continue.
