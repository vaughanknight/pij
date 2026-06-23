# Code Review: Phase 1 — Pure spawn core + TmuxPort + tmux adapter

**Plan**: `/Users/jordanknight/pi-hacking/pij/docs/plans/017-pij-spawn-tmux-windows/pij-spawn-tmux-windows-plan.md`  
**Spec**: `/Users/jordanknight/pi-hacking/pij/docs/plans/017-pij-spawn-tmux-windows/pij-spawn-tmux-windows-plan.md` (`## Business Specification`)  
**Phase**: `Phase 1: Pure spawn core + TmuxPort + tmux adapter`  
**Date**: 2026-06-23  
**Reviewer**: pij peer `pij-1vru9uw` (parent-run review; subagents intentionally not used because this session's built-in review/explore agents are read-blind)  
**Testing Approach**: Hybrid — pure logic via fakes/unit tests; impure tmux seam by inspection now and tmux-gated smoke in Phase 3.

Computed diff: `/Users/jordanknight/pi-hacking/pij/docs/plans/017-pij-spawn-tmux-windows/reviews/_computed.diff`

## A) Verdict

**REQUEST_CHANGES**

Phase 1's runtime/core logic is mostly sound, and the worker-authored spawn suite is non-vacuous under mutation. However, the changed phase files fail a phase-scoped Biome check, so the canonical lint/self-check gate cannot pass until the formatting/unused-import issues are fixed.

**Key failure areas**:
- **Implementation**: No correctness blocker found in the argv/env builder, ready-body parser, tmux `%N` capture, idempotent kill path, or `$TMUX_PANE` session gate.
- **Domain compliance**: Domain docs/map still describe the old five-port contract and do not record `TmuxPort` / spawn-core changes.
- **Testing**: `just typecheck` and `just test` pass; two mutation probes forced the spawn suite red then green. Evidence artifacts are incomplete (`execution.log.md` missing; tasks still unchecked).
- **Doctrine**: Phase-scoped Biome check fails on changed files (HIGH).

## B) Summary

The core split follows the intended hexagonal shape: `core/spawn.ts` is pure, uses `.js` ESM imports, returns data instead of performing side effects, and keeps task text out of positional argv. `adapters/tmux.ts` confines the new `child_process` seam, uses `execFileSync("tmux", args, ...)`, captures `%N`, swallows kill errors for idempotent teardown, and gates `currentSession()` on `$TMUX_PANE` before `display-message`. The test suite covers the important builder/parser behaviours and survived independent mutation checks. The blocking issue is gate hygiene: the changed files currently fail Biome, and domain/evidence docs need cleanup before this phase should be called complete.

## C) Checklist

**Testing Approach: Hybrid**

For Lightweight / unit-covered core:
- [x] Core validation tests present (`.pi/extensions/pij/core/spawn.test.ts`, 26 specs).
- [x] Critical argv/env and ready-body paths covered.
- [x] Worker-authored tests independently mutation-checked.

Universal:
- [x] Only Phase 1 source files were reviewed for code correctness.
- [x] Typecheck clean (`just typecheck`).
- [x] Test suite clean (`just test`).
- [ ] Lint/format clean for changed files (**fails**, F001).
- [ ] Domain docs current for changed public contract (**stale**, F002).
- [ ] Implementation evidence artifacts current (**missing/incomplete**, F003).

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/core/ports.ts:12`; `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/adapters/fakes.ts:25,167-169` | doctrine / validation | Phase-scoped Biome check fails on changed files: unused `Role` import and `FakeTmux` formatting. | Remove the unused import and run/apply Biome formatting to `fakes.ts`; re-run `NO_COLOR=1 npx biome check <phase files>` and `just lint` if expected. |
| F002 | MEDIUM | `/Users/jordanknight/pi-hacking/pij/docs/domains/pij-messaging/domain.md:20,51`; `/Users/jordanknight/pi-hacking/pij/docs/domains/domain-map.md:13` | domain-compliance | The domain contract docs still describe the old five-port surface and omit `core/spawn.ts`, `TmuxPort`, `TmuxAdapter`, and `FakeTmux`. | Update the pij-messaging domain doc/map/history, or explicitly schedule that doc update if the team wants domain docs batched in Phase 3. |
| F003 | MEDIUM | `/Users/jordanknight/pi-hacking/pij/docs/plans/017-pij-spawn-tmux-windows/tasks/phase-1-pure-spawn-core/tasks.md:67-71`; missing `/Users/jordanknight/pi-hacking/pij/docs/plans/017-pij-spawn-tmux-windows/tasks/phase-1-pure-spawn-core/execution.log.md` | testing / evidence | The phase evidence trail is incomplete: task rows remain `[ ]` and the expected execution log is absent. | Run the progress/evidence step for T101–T105 so the next stage can distinguish implemented work from draft tasks. |
| F004 | LOW | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/adapters/fakes.ts:157-186` | forward-compat / testability | `FakeTmux.currentSession()` cannot model the `null`/not-in-tmux branch, although Phase 2 needs an `E-NOTMUX` path. | Consider allowing `sessionName: string | null` in `FakeTmux` so Phase 2 can test the notmux branch without a one-off fake. |

## E) Detailed Findings

### E.1) Implementation Quality

**No HIGH implementation-correctness defects found.**

Evidence reviewed:
- `buildSpawnCommand()` emits `--model <value>` iff `input.model !== undefined`, keeps task text in `PIJ_SPAWN_TASK`, and keeps `args` as discrete strings.
- `parseReadyBody()` has null/object/string guards and returns `null` for malformed payloads.
- `TmuxAdapter.newWindow()` builds an argv array, uses `new-window -P -F "#{pane_id}"`, validates the returned `%N`, and returns `Result<{ paneId }>` rather than throwing.
- `TmuxAdapter.killWindow()` routes through `tmuxSafe(["kill-window", "-t", paneId])` and returns `ok(undefined)` for idempotent close.
- `TmuxAdapter.currentSession()` returns `null` unless `$TMUX_PANE` is set, then uses `display-message -p "#{session_name}"`.

Residual risk (not blocking): `killWindow()` swallows all tmux errors, not only already-missing windows. That matches the idempotent-teardown goal, but Phase 2 close-result wording should avoid implying that a successful adapter result proves the window existed.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | All Phase 1 source files live under `.pi/extensions/pij/`, the declared `pij-messaging` domain. |
| Contract-only imports | ✅ | New code imports only local contracts/types with `.js` extensions. |
| Dependency direction | ✅ | Core remains pi-free/tmux-free; adapter owns `node:child_process`. |
| Domain.md updated | ❌ | F002: `domain.md` still lists five ports and omits spawn/Tmux contracts. |
| Registry current | ✅ | Registry row is generic enough; no new domain was introduced. |
| No orphan files | ✅ | Plan Domain Manifest covers the reviewed files. |
| Map nodes current | ❌ | F002: `domain-map.md` still labels `pij-messaging` as `5 ports`. |
| Map edges current | ✅ | No new cross-domain edge was introduced by Phase 1. |
| No circular business deps | ✅ | No new domain dependency cycle. |
| Concepts documented | ⚠️ | The concepts/contracts table should include spawn command / TmuxPort once this contract lands. |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|-----------------|--------|--------|
| `core/spawn.ts` builder/ready codec | None found; this is new lifecycle-specific pure logic. | pij-messaging | Proceed |
| `TmuxAdapter` | `harness/driver/tmux.ts` has argv discipline, but the plan explicitly forbids importing harness code into the extension. | extension-authoring-harness pattern only | Proceed; pattern copied appropriately |
| `FakeTmux` | Existing `Fake*` classes in `adapters/fakes.ts`. | pij-messaging | Proceed; follows fake-adapter style, with F004 testability suggestion |

### E.4) Testing & Evidence

**Coverage confidence**: 84%

Strengths:
- `just typecheck` passed.
- `just test` passed.
- Targeted spawn suite is non-vacuous:
  - Mutation 1 (`input.model !== undefined` → `false`) made the suite red: `2 failed | 24 passed`; restored green: `26 passed`.
  - Mutation 2 (`spawnId` type guard → `true`) made the suite red: `2 failed | 24 passed`; restored green: `26 passed`.
- Tests cover model present/absent, task present/absent, quotes/newlines/metacharacters, paneId optional pass-through, role pass-through, ready-body round-trip, invalid JSON, missing fields, non-string field, array, and null.

Gaps:
- F001: changed files are not Biome-clean.
- F003: no execution log and task table not progressed.
- Real tmux adapter is intentionally not unit-tested in Phase 1; Phase 3 smoke remains the end-to-end proof.

### E.5) Doctrine Compliance

Pattern review:
- **P2**: ✅ impurity is confined to `adapters/tmux.ts` for this phase; `core/` grep found only comments mentioning `@earendil-works`/`child_process`.
- **P3**: ✅ `TmuxPort` is a DI port; no global mutable tmux state.
- **P4**: ✅ port methods return `Result<>`; public adapter methods do not throw by design.
- **P7**: ✅ relative imports use `.js` extensions.
- **P8**: ✅ new tests target pure `core/spawn.ts`, not extension wiring.
- **Gate hygiene**: ❌ F001 — Biome fails on changed files.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-01 | Spawn opens one tmux window and returns immediately with spawn token + pane id. | Phase 1 only provides `TmuxPort.newWindow()` and adapter `%N` capture; isolated tmux probe returned `%1`/`%2`; full `pij_spawn` return is Phase 2/3. | 55% |
| AC-02 | Per-spawn `model` maps to `--model <value>` iff provided. | `spawn.ts:60-64`; tests lines 25-40; mutation 1 proved guarded. | 95% |
| AC-03 | Child ready message includes spawn token/model/cwd exactly once, not on reload. | `readyBody`/`parseReadyBody` codec implemented/tested; once/reload semantics are Phase 2. | 50% |
| AC-04 | Optional task self-starts safely without prompt race. | Builder puts task in `PIJ_SPAWN_TASK`, never positional argv; boot self-inject sequencing is Phase 2. | 60% |
| AC-05 | Descriptor carries `paneId`; close kills/removes window. | Adapter kill-by-pane-id and fake kill recording are present; descriptor/session wiring is Phase 2. | 55% |
| AC-06 | Close warning/nonexistent/dead clean errors. | Not in Phase 1 except idempotent adapter kill; session close semantics are Phase 2. | 35% |
| AC-07 | Not in tmux returns clean `E-NOTMUX`. | `currentSession()` has `$TMUX_PANE` gate returning `null`; result code/wiring is Phase 2. | 55% |
| AC-08 | `core/` free of `@earendil-works/*` and `child_process`. | `ctx_grep` found only comments in `core/`; `node:child_process` appears only in `adapters/tmux.ts`. | 95% |
| AC-09 | Tmux invocations use argv arrays; task with quotes/spaces delivered intact. | `tmux(args)` uses `execFileSync("tmux", args, ...)`; no `args.join`; task is env-only; special-char task tests pass; isolated tmux injection probe did not create a file. | 90% |

**Overall coverage confidence**: 84% for Phase 1 scope; lower for ACs intentionally deferred to Phases 2–3.

## G) Commands Executed

```bash
git status --short -- .pi/extensions/pij/core/spawn.ts .pi/extensions/pij/core/spawn.test.ts .pi/extensions/pij/core/ports.ts .pi/extensions/pij/adapters/tmux.ts .pi/extensions/pij/adapters/fakes.ts docs/plans/017-pij-spawn-tmux-windows

git diff -- .pi/extensions/pij/core/ports.ts .pi/extensions/pij/adapters/fakes.ts
git diff --no-index -- /dev/null .pi/extensions/pij/core/spawn.ts || true
git diff --no-index -- /dev/null .pi/extensions/pij/core/spawn.test.ts || true
git diff --no-index -- /dev/null .pi/extensions/pij/adapters/tmux.ts || true

just typecheck
just test

bash harness/scripts/flow-pair-mutate.sh .pi/extensions/pij/core/spawn.ts 's/input\.model !== undefined/false/' 'npx vitest run .pi/extensions/pij/core/spawn.test.ts'
bash harness/scripts/flow-pair-mutate.sh .pi/extensions/pij/core/spawn.ts 's/typeof \(parsed as Record<string, unknown>\)\.spawnId === "string"/true/' 'npx vitest run .pi/extensions/pij/core/spawn.test.ts'

NO_COLOR=1 just lint
NO_COLOR=1 npx biome check .pi/extensions/pij/core/spawn.ts .pi/extensions/pij/core/spawn.test.ts .pi/extensions/pij/core/ports.ts .pi/extensions/pij/adapters/tmux.ts .pi/extensions/pij/adapters/fakes.ts

# isolated tmux probes against a private socket/session, then cleaned up
tmux -L <socket> new-session -d -s <session> -c "$PWD" sleep 60
tmux -L <socket> new-window -P -F '#{pane_id}' -n test -e FOO=bar node -e 'setTimeout(()=>{},10000)'
tmux -L <socket> new-window -P -F '#{pane_id}' -n inj node -e "setTimeout(()=>{},10000)" "x; touch /tmp/pij-tmux-injection"
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review — only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: `/Users/jordanknight/pi-hacking/pij/docs/plans/017-pij-spawn-tmux-windows/pij-spawn-tmux-windows-plan.md`  
**Spec**: `/Users/jordanknight/pi-hacking/pij/docs/plans/017-pij-spawn-tmux-windows/pij-spawn-tmux-windows-plan.md`  
**Phase**: `Phase 1: Pure spawn core + TmuxPort + tmux adapter`  
**Tasks dossier**: `/Users/jordanknight/pi-hacking/pij/docs/plans/017-pij-spawn-tmux-windows/tasks/phase-1-pure-spawn-core/tasks.md`  
**Execution log**: `/Users/jordanknight/pi-hacking/pij/docs/plans/017-pij-spawn-tmux-windows/tasks/phase-1-pure-spawn-core/execution.log.md` (missing at review time)  
**Review file**: `/Users/jordanknight/pi-hacking/pij/docs/plans/017-pij-spawn-tmux-windows/reviews/review.phase-1-pure-spawn-core-tmuxport-tmux-adapter.md`

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/core/spawn.ts` | New | pij-messaging | None for correctness; keep mutation-guarded tests. |
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/core/spawn.test.ts` | New | pij-messaging | None; suite is non-vacuous for two sampled behaviours. |
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/core/ports.ts` | Modified | pij-messaging | Remove unused `Role` import (F001). |
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/adapters/tmux.ts` | New | pij-messaging | None for Phase 1; smoke remains Phase 3 proof. |
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/adapters/fakes.ts` | Modified | pij-messaging | Apply Biome formatting; consider nullable `sessionName` for Phase 2 tests. |
| `/Users/jordanknight/pi-hacking/pij/docs/domains/pij-messaging/domain.md` | Existing docs | pij-messaging | Update contract/source/history for spawn/TmuxPort (F002). |
| `/Users/jordanknight/pi-hacking/pij/docs/domains/domain-map.md` | Existing docs | pij-messaging | Update `pij-messaging` contract label from `5 ports` to current contract (F002). |
| `/Users/jordanknight/pi-hacking/pij/docs/plans/017-pij-spawn-tmux-windows/tasks/phase-1-pure-spawn-core/tasks.md` | Existing tasks | pij-messaging | Mark/update T101–T105 evidence, and add execution log (F003). |

### Required Fixes

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| FT-001 | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/core/ports.ts`; `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/adapters/fakes.ts` | Remove unused `Role`; apply Biome formatting. | Phase-scoped Biome check fails; self-check cannot be clean. |

### Domain Artifacts to Update

| File (absolute path) | What's Missing |
|---------------------|----------------|
| `/Users/jordanknight/pi-hacking/pij/docs/domains/pij-messaging/domain.md` | `core/spawn.ts`, `TmuxPort`, `TmuxAdapter`, `FakeTmux`, six-port wording/history. |
| `/Users/jordanknight/pi-hacking/pij/docs/domains/domain-map.md` | `pij-messaging` label still says `5 ports`. |

### Handback

Fixes go back through the implement verb for the same phase, then re-run this review. The runtime implementation is close; the immediate blocker is gate hygiene (F001), with domain/evidence cleanup to keep the flow state trustworthy.

Routing is the flow's job — run the parent flow bare to continue.
