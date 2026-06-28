# pij spawn — optional branch-from-self mode
**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-06-28
**Status**: READY
**Spec source**: unified (this file)

ℹ️ No research-dossier.md — the codebase was re-mapped live this session (spawn → tmux → bind pipeline) and the fork mechanic was verified against claude v2.1.195. Findings are folded into Key Findings below.

## Business Specification

### Summary
Add an **optional** `--branch` flag to `pij spawn` that forks the **calling session's own** harness conversation into the newly-spawned tmux pane, so a peer can hand a fresh worker its full current context (useful before a coding segment). Claude-first; the flag is off by default and degrades to a clear error where branching isn't supported. The design generalises to copilot/pi and to branching-from-another-peer later without rework.

### Goals
- `pij spawn --harness claude --branch` launches the new pane as a **fork of the caller's own claude session** — the child inherits the caller's conversation, gets a new pij id, and binds as an independent control-plane peer.
- The fork is **deterministic to bind**: pij pins the child's harness session id up front (`--session-id <new-uuid>`), so the daemon binds with no transcript-discovery race (reuses the copilot deterministic-bind path).
- Branching is **gated and fails loud**: only when the caller's harness == the requested harness **and** that harness supports branching. Every rejection is a specific, actionable error.
- **Default off** — omitting `--branch` leaves today's spawn behaviour byte-for-byte unchanged.

### Non-Goals
- Branching **copilot** or **pi** sessions (the capability seam exists; those harnesses return `supportsBranching=false` for now).
- Branching **from another pij peer** (`--branch-from <id>`) — explicitly OOS; the design must not preclude it.
- Changing non-branch claude spawning (it stays on transcript-discovery binding).
- Carrying over per-session permission grants (claude drops these on fork; immaterial because pij spawns with `--dangerously-skip-permissions`).
- Any TUI / `pij state` redesign beyond surfacing the branch source.

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| `pij-control-plane` | existing | **modify** | All work lands here: the spawn arg surface, the launch-argv builder, the pending-descriptor, the daemon's deterministic-bind condition, and the harness branch-capability seam. |

No new domain. `pij-control-plane` already owns spawn, pij-id pre-allocation, the harness→transport seam, and deterministic vs discovery binding — branch mode is an extension of exactly those contracts.

### Testing Strategy
- **Approach**: Full TDD. Every pure unit (arg parse, argv builder, capability predicate, branch-plan gating, descriptor shape, daemon bind condition) gets a failing test first, then implementation.
- **Rationale**: Matches the repo's hexagonal posture — the core is pi-free and process-free, exercised by vitest with in-memory fakes (864 tests today). The new logic is overwhelmingly pure.
- **Focus areas**: the gating matrix (same-harness / supports-branching / bound) and the daemon's widened deterministic-bind path (must not regress copilot or non-branch claude).
- **Excluded**: the live `claude --resume … --fork-session` mechanic itself (already verified live this session; not re-tested in CI — no claude binary in CI).
- **Mock usage**: Avoid mocks — real fixtures + the existing pure-core fakes (FakeRegistry, fake daemon ports). Pure functions need none.

### Documentation Strategy
- **Location**: Update the in-CLI `SPAWN_USAGE` help string (+ `pij spawn --help`) and the `flow-pair` skill docs where spawn is taught. No new standalone doc.
- **Rationale**: Branch mode is a spawn flag — its documentation belongs where users already meet spawn (the `--help` surface and the flow-pair pairing guide), not in a separate file.

### Complexity
- **Score**: CS-3 (medium)
- **Breakdown**: S=1, I=1, D=1, N=1, F=0, T=1
- **Confidence**: 0.85
- **Assumptions**: see Risks & Assumptions.
- **Dependencies**: claude CLI ≥ the version supporting `--fork-session` + `--session-id` composition (verified on 2.1.195); the running daemon to drive bind.
- **Risks**: see Risks table.
- **Phases**: 1 (Simple).

### Acceptance Criteria
1. **AC-01** — `pij spawn --harness claude --branch`, run from a **bound claude** pij peer, launches a new pane whose claude process is invoked with `--resume <caller-harnessSessionId> --fork-session --session-id <new-uuid> --dangerously-skip-permissions` (plus `--model` if given).
2. **AC-02** — that spawn writes a `pending` descriptor carrying `plannedHarnessSessionId == <new-uuid>` (and records the source via `branchedFrom == <caller-harnessSessionId>`); no `transcriptsAtSpawn` snapshot is taken for a branched claude.
3. **AC-03** — the daemon binds a session that has `plannedHarnessSessionId` **deterministically regardless of harness** (claude branch *or* copilot), with no transcript discovery; non-branch claude (no planned id) still binds via discovery.
4. **AC-04** — `--branch` is rejected with a specific, non-zero-exit error when: the caller can't be resolved (E-AMBIG-style), the caller's harness ≠ requested harness, the requested harness doesn't support branching (copilot/pi today), or the caller isn't bound yet (no `harnessSessionId`).
5. **AC-05** — omitting `--branch` produces a spawn command + descriptor **identical** to today's (regression guard for both claude-discovery and copilot paths).
6. **AC-06** — `harnessSupportsBranching("claude") === true`; `=== false` for `copilot` and `pi` (the extensibility seam).
7. **AC-07** — `pij spawn --help` / `SPAWN_USAGE` documents `--branch` (incl. the same-harness + bound preconditions); the flow-pair docs mention it.

### Risks & Assumptions
- **A1**: The caller is a registered, **bound** pij peer (it has a `harnessSessionId`). Branch-from-self is meaningless otherwise → that's AC-04's "not bound" error, not a silent fallback.
- **A2**: `harnessSessionId` for a claude peer is exactly the value `claude --resume <id>` accepts (the transcript stem). Verified: the live fork used a transcript-stem id.
- **R1**: Widening the daemon's deterministic-bind condition could regress copilot/non-branch-claude. Mitigation: the condition becomes "`plannedHarnessSessionId` present → deterministic; else existing path"; covered by AC-03 + AC-05 regression tests.
- **R2**: Self-resolution inside the short-lived spawn CLI could misidentify the caller among multiple local peers. Mitigation: reuse the existing `resolveSelf` (PIJ_SESSION_ID → lone-local → `$TMUX_PANE`) + `filterByFolder`; on ambiguity, fail loud (AC-04) rather than guess.

### Open Questions
None blocking. (Future: should `--branch` accept an optional `--branch-from <pij-id>`? Out of scope; the `planBranch` signature leaves room.)

### Workshop Opportunities
None — the CLI flow, the binding path, and the gating matrix are all settled by the live-verified mechanic and the existing copilot template.

### Clarifications
#### Session 2026-06-28
- **Q: Workflow Mode?** → Simple.
- **Q: Testing strategy?** → Full TDD.
- **Q: Mock usage?** → Avoid mocks (real fixtures + pure-core fakes).
- **Q: Documentation?** → Update SPAWN_USAGE + flow-pair docs.
- **Q (earlier): Branch source?** → Branch-from-self only now (caller's own session), gated on same-harness + supports-branching; branch-from-peer OOS but not precluded.

## Planning Seam
_Refinement opportunities still open — recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: none — all resolved.

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| research-dossier.md | n | live re-map of the spawn/bind pipeline folded into Key Findings instead |
| workshops/*.md | n | none |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | Round 1 + earlier branch-source clarifications resolved; no `[NEEDS CLARIFICATION]` left |
| G2 | Constitution | N/A | no `docs/project-rules/constitution.md` |
| G3 | Architecture | N/A | no `docs/project-rules/architecture.md` (only harness.md / agent-harness.md substrate docs) |
| G4 | ADR Compliance | N/A | no `docs/adr/` |
| G5 | Structure | PASS | all required sections present + populated |
| G6 | Testing Alignment | PASS | Full TDD; every task pairs a test-first step before impl; ACs are observable/measurable |
| G7 | Domain Completeness | PASS | single existing domain `pij-control-plane`; Domain Manifest covers every touched file |

### Summary
A single Simple-mode phase adds an opt-in `--branch` flag to `pij spawn`. The pure core gains a branch-capability predicate, a `--branch` parse, a `planBranch` gating function, and branch-aware launch-argv + pending-descriptor builders; the daemon's deterministic-bind condition is widened from copilot-only to "any session with a planned session id"; the bin's `runSpawn` resolves the caller, applies `planBranch`, mints the child UUID, and threads it through. Non-branch spawning is untouched. Expected outcome: a peer can fork itself into a fresh, independently-bound worker pane with one flag.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `.pi/extensions/pij/core/harness/types.ts` | pij-control-plane | internal | new `supportsBranching(harness)` predicate beside `selectTransport` |
| `.pi/extensions/pij/core/spawn.ts` | pij-control-plane | internal | `--branch` parse (`SpawnRequest.branch`); `planBranch` gating; `branchFrom`/`forkSessionId` in `ControlSpawnInput` + argv builder; `branchedFrom` in `PendingDescriptorInput` |
| `.pi/extensions/pij/core/types.ts` | pij-control-plane | contract | optional `branchedFrom?: string` on `SessionDescriptor` |
| `.pi/extensions/pij/core/daemon/loop.ts` | pij-control-plane | internal | widen deterministic-bind condition (planned id present → deterministic, any harness) |
| `.pi/extensions/pij/cli.ts` | pij-control-plane | internal | `runSpawn` branch wiring (resolve self, planBranch, mint UUID, thread builders); `SPAWN_USAGE` + `--help` |
| `.pi/extensions/pij/core/spawn.test.ts` | pij-control-plane | internal | parse / argv / planBranch / descriptor tests |
| `.pi/extensions/pij/core/harness/types.test.ts` | pij-control-plane | internal | `supportsBranching` tests |
| `.pi/extensions/pij/core/daemon/loop.test.ts` | pij-control-plane | internal | deterministic-bind-for-claude-branch + non-regression tests |
| `skills/flow-pair/SKILL.md` (or `references/harness-modes.md`) | pij-control-plane | internal | document the `--branch` affordance where spawn is taught |

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | The daemon's deterministic bind is **gated on `harness === "copilot"`** (`loop.ts` `driveSession`), even though it keys on `plannedHarnessSessionId`. A branched claude sets a planned id but would fall through to discovery. | Widen the condition to "`plannedHarnessSessionId` present → deterministic bind" (harness-agnostic); claude-branch + copilot both ride it; non-branch claude (no planned id) keeps discovery. |
| 02 | High | `--session-id` for claude is emitted **only when branching** — a non-branch claude must stay on auto-id + transcript discovery (out of scope to change). | In `buildControlSpawnCommand`, emit `--resume/--fork-session/--session-id` for claude **only** when `branchFrom` is set; copilot's existing `--session-id` path is untouched. |
| 03 | High | The spawn CLI is short-lived and runs in the **caller's** pane; it must identify the caller to fork it. | Reuse `resolveSelf(PIJ_SESSION_ID, filterByFolder(registry, cwd), $TMUX_PANE)`; feed the resolved descriptor to the pure `planBranch`; ambiguity → fail loud (AC-04). |
| 04 | Medium | claude's fork takes the pinned id and returns it as `session_id` in `-p --output-format json`; the fork inherits history, original untouched (verified live, v2.1.195). | No discovery needed for branched claude; bind on the pinned id. Skip `transcriptsAtSpawn` for branched claude. |
| 05 | Medium | `agent-harness.md` mandates companion-mode for plan-6 work touching production code paths. | Offer the `--companion` implement mode at the build seam (flow concern, not a task). |
| 06 | Note | Dogfood (2026-06-28): a *headless* `-p` fork of a very large session is slow to **answer** (full-context cold read), but the fork itself (copy + launch) and interactive pane readiness are fast — seconds. The headless slowness is **not** representative of interactive fork behaviour. | Bind branched sessions on the **planned id** — binding/init-inject must **not** wait on pane "ready"/context-load (we already hold the id, so the deterministic path proceeds immediately). Do **not** add watchdog ceremony for "slow forks"; the real interactive ready-up is fast. |
| 07 | Note | Live dogfood (2026-06-28): branching across a context-window **downgrade** forces an immediate auto-compaction. Forking this 1M/≈330k Opus session into plain `--model sonnet` (200k) overflowed → claude auto-compacted on load. `--model 'sonnet[1m]'` selects the 1M variant (footer confirmed "Sonnet 4.6 (1M context)") but errors `API Error: Usage credits required for 1M context` on this account. Opus-1M carries ≈330k faithfully (the model this session runs). | **Accepted tradeoff (user, 2026-06-28): the auto-compaction on the cheap `sonnet` path is fine** — the compacted fork still carried the gist and answered a post-split query correctly. Choose the branch `--model` by required fidelity: cheap+compacted (`sonnet`), or faithful (a 1M-credited model / Opus). No code change — surface the expectation in docs. |
| 08 | Medium | Live dogfood (2026-06-28): a fork inherits the parent's **agenda**, not just its context. With claude's "Continue from where you left off" resume prompt, branching a session that is *itself mid-orchestration* led the fork to resume it — it **appears** to have run `pij spawn --harness copilot` (inferred: no one else did; pane geometry + timing match — the fork's transcript was deleted, so not proven) and one copilot then hot-looped at 99.6% CPU. **NOT a general hazard**: for the intended use (branch to do a coding segment) the fork continuing the work is the *point*; the risk is narrow — only branching an actively-*orchestrating* session. | **Resolved by T016**: pij injects a fork-reframe into a branched peer's init ("inherited context is reference only, NOT a task; do not continue/spawn; await instructions"), keyed on `branchedFrom`. |

### Implementation

**Objective**: Ship opt-in branch-from-self for `pij spawn --harness claude`, deterministically bound, fully gated, with non-branch paths unchanged.
**Testing Approach**: Full TDD — write each test first (it fails), then the implementation to green; finish with `npm run self-check` (typecheck + lint + test).

#### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T001 | Test: `supportsBranching("claude")===true`, `copilot`/`pi`===false | pij-control-plane | `core/harness/types.test.ts` | test exists and fails (no fn) | seam for future harnesses |
| [ ] | T002 | Impl: `supportsBranching(harness)` predicate beside `selectTransport` | pij-control-plane | `core/harness/types.ts` | T001 green | claude-only today |
| [ ] | T003 | Test: `parseSpawnArgs` accepts `--branch` → `SpawnRequest.branch===true`; absent → `false`; `--branch` needs no value; unknown flags still E-ARG | pij-control-plane | `core/spawn.test.ts` | fails | boolean flag like `--json` |
| [ ] | T004 | Impl: add `branch` to `SpawnRequest` + parse `--branch` in `parseSpawnArgs` | pij-control-plane | `core/spawn.ts` | T003 green | default false |
| [ ] | T005 | Test: `planBranch(reqHarness, selfDescriptor, supports, newSessionId)` → ok `{from,newSessionId}` for bound same-harness claude; typed E-BRANCH for (a) self null, (b) !supports, (c) harness mismatch, (d) no `harnessSessionId` | pij-control-plane | `core/spawn.test.ts` | fails | pure; uuid injected for determinism |
| [ ] | T006 | Impl: `planBranch` pure gating fn returning `Result<{from,newSessionId}>` | pij-control-plane | `core/spawn.ts` | T005 green | error messages actionable (name the harnesses) |
| [ ] | T007 | Test: `buildControlSpawnCommand` with `branchFrom`+`forkSessionId` (claude) emits `--dangerously-skip-permissions --resume <from> --fork-session --session-id <new> [--model]`; without them, output byte-identical to today (claude + copilot) | pij-control-plane | `core/spawn.test.ts` | fails | AC-01, AC-05 |
| [ ] | T008 | Impl: extend `ControlSpawnInput` with `branchFrom?`,`forkSessionId?`; emit claude fork args only when `branchFrom` set | pij-control-plane | `core/spawn.ts` | T007 green | copilot path untouched (Finding 02) |
| [ ] | T009 | Test: `buildPendingDescriptor` carries `plannedHarnessSessionId` + `branchedFrom` for a branched claude, and omits `transcriptsAtSpawn`; non-branch unchanged | pij-control-plane | `core/spawn.test.ts` | fails | AC-02 |
| [ ] | T010 | Impl: add `branchedFrom?` to `PendingDescriptorInput` + `SessionDescriptor`; thread into the descriptor | pij-control-plane | `core/spawn.ts`, `core/types.ts` | T009 green | optional field |
| [ ] | T011 | Test: daemon `driveSession` binds deterministically when `plannedHarnessSessionId` set for a **claude** descriptor (no discovery); copilot still binds; non-branch claude still discovers | pij-control-plane | `core/daemon/loop.test.ts` | fails | AC-03, R1 regression |
| [ ] | T012 | Impl: widen the deterministic-bind condition in `driveSession` to "`plannedHarnessSessionId` present" (drop copilot-only gate); bind/init-inject must not wait on a slow context-load | pij-control-plane | `core/daemon/loop.ts` | T011 green | Findings 01, 06 |
| [ ] | T013 | Impl: wire `runSpawn` branch path — when `req.branch`: resolve self (`resolveSelf`+`filterByFolder` over registry), `planBranch`, `randomUUID()` for the child, pass `branchFrom`/`forkSessionId` to argv builder + `plannedHarnessSessionId`/`branchedFrom` to descriptor; skip `transcriptsAtSpawn`; on E-BRANCH print to stderr + exit 64 | pij-control-plane | `cli.ts` | branched spawn works end-to-end against a live bound peer; errors are actionable | impure seam; AC-01/02/04 |
| [ ] | T014 | Docs: `SPAWN_USAGE` + `pij spawn --help` document `--branch` (same-harness + bound preconditions); add a one-line mention in flow-pair docs | pij-control-plane | `cli.ts`, `skills/flow-pair/*` | `pij spawn --help` shows `--branch`; flow-pair mentions it | AC-07 |
| [ ] | T015 | Verify: `npm run self-check` green (typecheck + lint + full test); manual live smoke — branch from this bound peer, confirm child binds on the pinned id and inherits context | pij-control-plane | — | self-check exit 0; live child BOUND on pinned uuid | AC-01..06 — DONE 2026-06-28 (bound on pinned id, inherited context, two-way pij messaging) |
| [x] | T016 | Branched-peer **fork reframe** (safety, Finding 08): when the daemon injects init into a session with `branchedFrom` set, prepend — *"you are a FORK; inherited context is reference only, NOT a task; do not continue/spawn; await instructions."* `buildInitInjection` takes a `branched` flag; daemon passes `descriptor.branchedFrom != null`. Test: branched init contains the reframe; non-branch init unchanged | pij-control-plane | `core/harness/claude.ts`, `core/harness/claude.test.ts`, `core/daemon/loop.ts`, `core/daemon/loop.test.ts` | branched init carries the reframe; normal init starts "You are now a pij peer" — DONE 2026-06-28 (3 tests, 881 suite green) | Finding 08 |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01 | T007, T013, T015 | argv test + live smoke |
| AC-02 | T009, T010, T013 | descriptor test |
| AC-03 | T011, T012 | daemon bind test |
| AC-04 | T005, T006, T013 | planBranch error tests + stderr/exit |
| AC-05 | T007 (no-branch byte-identical), T011 (non-branch discovery) | regression tests |
| AC-06 | T001, T002 | predicate test |
| AC-07 | T014 | `--help` output + flow-pair doc |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Widened bind condition regresses copilot / non-branch claude | Low | High | AC-03 + AC-05 regression tests (T011) assert all three paths |
| Self-resolution misidentifies caller among multiple local peers | Low | Medium | reuse `resolveSelf`+`filterByFolder`; ambiguity → fail loud (T005/T013), never guess |
| claude CLI version without `--fork-session`/`--session-id` compose | Low | Medium | verified on 2.1.195; failure surfaces as a non-binding pane the daemon already reports — not a silent hang |
