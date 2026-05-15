# Ralph Loop pi extension — Implementation Plan

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-05-15
**Spec**: [`./ralph-loop-extension-spec.md`](./ralph-loop-extension-spec.md)
**Status**: DRAFT

## Summary

Add a pi extension at `.pi/extensions/ralph-loop/` that drives Geoffrey Huntley's Ralph Loop pattern: a fresh `createAgentSession()` per iteration (Shape C) against a markdown plan file, terminated by `<promise>COMPLETE</promise>` or the closed `StopReason` taxonomy from workshop 001. Phase 0 formalizes `agentic-loops` as pij's first domain. AC-05 (D-005 `/compact`-survival) is the load-bearing gate and the build's reason for existing as much as the feature itself. AC-12 (harness improvement) lands as **two durable gifts**: `compactAndAssert()` in `harness/driver/` plus `docs/project-rules/agent-harness.md` codifying the minih companion-mode adoption.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| `agentic-loops` | **NEW** (formalize in Phase 0) | **create** | First inhabitant: `ralph-loop` extension. Owns stop-condition vocabulary, iteration-history schema, plan-file consumption protocols, attribution conventions for community patterns, and the "fresh context per iteration" discipline. |

No other domains touched. The pi `ExtensionAPI` surface and SDK `createAgentSession` are external dependencies, not domains.

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|----------------|-----------|
| `docs/domains/registry.md` | `agentic-loops` | contract | NEW. First entry in pij's domain registry. |
| `docs/domains/domain-map.md` | `agentic-loops` | contract | NEW. Single node, no cross-domain edges in v1. |
| `docs/domains/agentic-loops/domain.md` | `agentic-loops` | contract | NEW. Full domain definition: purpose, boundary, contracts, composition, dependencies. |
| `.pi/extensions/ralph-loop/index.ts` | `agentic-loops` | internal | Wiring: `/ralph` command, tools, P10 session_start handler. |
| `.pi/extensions/ralph-loop/store.ts` | `agentic-loops` | internal | Pi-free store; `StopReason` union, evaluator, replay, plan parser. |
| `.pi/extensions/ralph-loop/store.test.ts` | `agentic-loops` | internal | Vitest against the store. |
| `.pi/extensions/ralph-loop/smoke.ts` | `agentic-loops` | internal | Tmux scenario including AC-05 `/compact`-survival. |
| `.pi/extensions/ralph-loop/AGENTS.md` | `agentic-loops` | internal | Per-extension rules; P1–P10 reassertions; Huntley attribution. |
| `harness/driver/index.ts` (modify) | `_platform` (implicit) | cross-domain | Adds `compactAndAssert()` helper. Reusable across every future "must-survive-/compact" extension. |
| `harness/driver/compact-assert.test.ts` (new) | `_platform` | internal | Vitest for the helper (mocked tmux). |
| `harness/test-utils.ts` (modify) | `_platform` | cross-domain | Adds `FakeIterationRunner` used by Ralph store tests AND the AC-05 smoke under `PIJ_RALPH_FAKE_RUNNER=1`. |
| `docs/how/ralph-loop.md` | `agentic-loops` | internal | The deep how-to: prompt with attribution, stop-condition reference, plan-file conventions, troubleshooting. |
| `RUNBOOK.md` (modify) | docs | cross-domain | Two new sections: "How to start a Ralph Loop" + "Companion mode (minih)". |
| `README.md` (modify) | docs | cross-domain | One-row "Where things are" addition. |
| `docs/velocity.md` (modify) | docs | cross-domain | New row recording Plan 008 wall-clock. |
| `docs/project-rules/agent-harness.md` (new) | `_platform` | contract | Codifies minih + companion mode as pij's agent harness. Successor to `harness.md`'s coverage of agent-side concerns. |
| `docs/project-rules/harness.md` (modify) | docs | cross-domain | Update to reflect engineering-harness vs agent-harness split; cross-link to new agent-harness.md. |
| `docs/difficulties.md` (modify) | docs | cross-domain | Append any new D-NNN rows as Phase 1 work surfaces them. |
| `.pi/extensions/ralph-loop/fixture-plan.md` (new) | `agentic-loops` | internal | Test fixture for smoke; 3-task minimal plan. |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| F-01 | **Critical** | **D-005 unverified.** The plan's load-bearing AC-05 is the smoke that proves (or refutes) `customType` entries survive `/compact`. If it fails, every iteration-history claim in the extension is brittle. Clarify Q6 mandates escalate-to-pi-mono, NOT in-extension shadow log. | Workshop 004 § Failure interpretation drives the choreography. If A1 or A2 fails, file pi-mono issue with the template; update D-005 row to point at it; mark smoke `expected_fail`; ship anyway. Never add a shadow log. |
| F-02 | High | **SDK lifecycle leaks are the v1 risk class.** Shape C spins a fresh `createAgentSession` per iteration; any retained session ref, listener handle, or child-shell descriptor accumulates over 10 iterations. Spec R2. | Workshop 002 § Resource ownership ledger is the spec. Implement `SdkIterationRunner` with `dispose()` in `finally`; detach listeners with `session.off()`; add a heap-snapshot test asserting no `AgentSession` survives across 10 fixture iterations. |
| F-03 | High | **Stop conditions are the product, not a corner case.** Every Ralph horror story (40k-line PR, runaway cost, infinite spin) is a stop-condition failure. Workshop 001's closed `StopReason` union with exhaustive `switch` is the safety story. | Implement the union in `store.ts` exactly as workshop 001 § StopReason tagged union specifies. Test every `kind` (≥8 tests). Add tie-breaking matrix tests (≥3 tests). Compile-time `exhaustiveCheck()` at every `switch`. |
| F-04 | High | **D-025 workaround is a per-clone artifact.** `agents/code-review-companion/state/inside-state.schema.json` was added in `94cbf24` but its existence depends on the workaround surviving across clones. If `minih agent install` ever re-runs and overwrites the schema, the companion wedges again. (Originally filed as D-022; renumbered to D-025 after a sibling-session row collided.) | Phase 0 includes a healthcheck task: at plan-008 work-session start, verify the schema file exists + `minih doctor` clears `prompt-state-vocabulary-drift`. Remove this task when `minih#30` lands. |
| F-05 | High | **Spec's AC-13 (velocity-log row) anchors the compounding hypothesis.** Without start/end timestamps captured rigorously, the harness improvement claim isn't measurable. v1 baseline (scratch) was retired and not measured discretely (per `docs/velocity.md` § extension #2 row); 008 is the first chance to measure cleanly. | Phase 0 task: timestamp `npm run new -- ralph-loop` to capture T0. Final Phase task: capture T1 when smoke goes green. Compute Δ and write the velocity row before merge. |

## Agent Harness Strategy

- **Current Maturity**: L2 (auto boot via `npm install`, deterministic observe via `npm run self-check`, tmux-driven interact for smoke).
- **Target Maturity**: L2 + minih companion mode codified in `docs/project-rules/agent-harness.md`. Not formally L3 (no autonomous validation loop yet; companion-mode review is sync to commit boundaries, not async).
- **Boot Command**: `npm install` (unchanged); `minih run code-review-companion` for the agent-side overlay.
- **Health Check**: `npm run self-check` (engineering); `minih doctor` (agent-side; must clear `prompt-state-vocabulary-drift` post-D-025 workaround).
- **Interaction Model**: Terminal (TUI via pi) + tmux for smoke + minih outside-CLI for companion driving.
- **Evidence Capture**: Pi session JSONL; tmux pane captures; minih `events.ndjson`; companion farewell envelope to `agents/code-review-companion/runs/<runId>/output/report.json`.
- **Pre-Phase Validation**: Required at start of every plan-008 work-session — confirm companion is alive + briefed.

## Implementation

**Objective**: Ship `.pi/extensions/ralph-loop/` v1 satisfying spec ACs 1–13, with Phase 0 prerequisite (domain extraction) and AC-12's two harness gifts (`compactAndAssert` + `agent-harness.md`).

**Testing Approach**: **Hybrid** (per spec Testing Strategy) — TDD-grade store (StopReason union, replay, parser, plan model); lightweight smoke for wiring; one decisive `/compact`-survival smoke gating AC-05.

**Mock policy**: targeted at constructor-injected boundary (`appendFn`, `runner`, `clock`).

### Phase 0 — Prerequisite: Domain extraction + harness health

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T001 | Create `docs/domains/registry.md` with `agentic-loops` as the first entry | `agentic-loops` | `/Users/jordanknight/pi-hacking/pij/docs/domains/registry.md` | File exists; registry has 1 row pointing at `agentic-loops/domain.md` | Use the registry shape from `/plan-v2-extract-domain` template if installed; else minimal table |
| [ ] | T002 | Create `docs/domains/domain-map.md` with the single `agentic-loops` node | `agentic-loops` | `/Users/jordanknight/pi-hacking/pij/docs/domains/domain-map.md` | Mermaid diagram with one node and no cross-domain edges | Add edges when v2 surfaces them (multi-Ralph swarms, subagents) |
| [ ] | T003 | Create `docs/domains/agentic-loops/domain.md` with Purpose, Boundary Owns/Excludes, Concepts table, Contracts, Composition, Dependencies | `agentic-loops` | `/Users/jordanknight/pi-hacking/pij/docs/domains/agentic-loops/domain.md` | File covers all sections from spec § Target Domains § New Domain Sketches verbatim, expanded with the StopReason vocabulary as a contract | Per finding F-03, the StopReason union is the headline contract |
| [ ] | T004 | Healthcheck: verify D-025 workaround is alive + companion is briefed for Plan 008 | `_platform` | (no file change) | `minih doctor` clears `prompt-state-vocabulary-drift`; `minih status code-review-companion` shows verdict `active` or `between-polls`; briefing visible in `inbox/outside/messages.ndjson` | Per finding F-04. Remove this task class once `minih#30` ships |
| [ ] | T005 | Capture T0 timestamp for the velocity log: run `npm run new -- ralph-loop` and stamp ISO-8601 | `_platform` | `/Users/jordanknight/pi-hacking/pij/docs/velocity.md` | Velocity log has a draft row with T0; scaffold files exist under `.pi/extensions/ralph-loop/` | Per finding F-05. T1 stamped at the end of Phase 1.E |

### Phase 1 — The build (Simple Mode single-phase)

#### 1.A Driver SDK helper (`compactAndAssert`)

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T006 | Add `compactAndAssert(session, opts): Promise<CompactAssertResult>` to `harness/driver/index.ts` matching workshop 004 § Helper utilities exactly | `_platform` | `/Users/jordanknight/pi-hacking/pij/harness/driver/index.ts` | Function exported with the documented signature; types compile via `npm run typecheck`; no callers yet | AC-12 gift (a). Workshop 004 § Helper utilities is the source of truth |
| [ ] | T007 | Add `harness/driver/compact-assert.test.ts` covering: (a) field-equality success, (b) field-divergence post-compact failure with structured `divergences[]`, (c) opt-in reload check, (d) compactTimeoutMs honored | `_platform` | `/Users/jordanknight/pi-hacking/pij/harness/driver/compact-assert.test.ts` | All 4 tests green; `npm test` exits 0 | Use a fake tmux Session (constructor-injected per existing Driver SDK patterns) — no real tmux required |

#### 1.B Store layer (workshops 001 + 003 verbatim)

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T008 | In `.pi/extensions/ralph-loop/store.ts` declare the `StopReason` tagged union, `IterationRecord`, `PlanModel`, `PlanTask`, `PlanStopMarker`, `PlanWarning` types per workshops 001 + 003 § Data model | `agentic-loops` | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/ralph-loop/store.ts` | Types compile; `tsc --noEmit` exits 0; no `any`; no `as` casts | P6 (structural types at boundary); P4 (tagged unions) |
| [ ] | T008.T | Tests for the type contracts: a compile-time `exhaustiveCheck()` harness asserting every `StopReason.kind` is handled; structural-guard tests for `isItemData`/`isDeleteData`-style replay guards | `agentic-loops` | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/ralph-loop/store.test.ts` (new file, additive) | `npm test` runs the type tests green; ≥3 tests | TDD-grade per spec Testing Strategy; write before T009 wiring uses these types |
| [ ] | T009 | Implement `parseMarkdownPlan(text, path): PlanModel` per workshop 003 § Grammar (regex table) | `agentic-loops` | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/ralph-loop/store.ts` | Pure function (no Date.now, no fs); handles all 10 edge cases from workshop 003 § Edge cases | Per finding F-03; per-line regex against the grammar table |
| [ ] | T009.T | Tests for `parseMarkdownPlan`: 5 worked examples from workshop 003 + 10 edge-case rows; assert full `PlanModel` not just one field | `agentic-loops` | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/ralph-loop/store.test.ts` | All 15 tests green | TDD-grade |
| [ ] | T010 | Implement `nextUndoneTask(plan)` per workshop 003 § Next-undone-task selection | `agentic-loops` | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/ralph-loop/store.ts` | Returns first `kind: "undone"` task in doc order; returns `null` when none | Document order; no priority |
| [ ] | T010.T | Tests for `nextUndoneTask`: mixed plan, all-done, all-undone, empty (≥3 tests) | `agentic-loops` | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/ralph-loop/store.test.ts` | Tests green | |
| [ ] | T011 | Implement `taskFingerprint(title): string` per workshop 001 § Spinning detection (SHA-1 of trimmed lowercase title; first 12 hex chars) | `agentic-loops` | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/ralph-loop/store.ts` | Deterministic; case- and whitespace-insensitive; 12 hex chars | Pure function; node:crypto only |
| [ ] | T011.T | Tests for `taskFingerprint`: case-insensitivity, whitespace-insensitivity, deterministic, 12-hex shape | `agentic-loops` | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/ralph-loop/store.test.ts` | ≥4 tests green | |
| [ ] | T012 | Implement `detectSpinning(log, n)` per workshop 001 § Spinning detection algorithm | `agentic-loops` | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/ralph-loop/store.ts` | Returns `Extract<StopReason, { kind: "spinning" }>` or `null`; last-N fingerprint check | Cheap; tail-slice only |
| [ ] | T012.T | Tests for `detectSpinning`: short log returns null, mixed tail returns null, n-identical tail fires; spinning detection at iteration boundaries | `agentic-loops` | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/ralph-loop/store.test.ts` | ≥3 tests green | |
| [ ] | T013 | Implement `evaluateStopPre(state)` AND `evaluateStopPost(state)` per workshop 001 § Evaluation order (8 reasons total; first-match-wins within each pass; pre-iter catches STOP marker / plan-exhausted / cancel-between-iterations; post-iter catches sigil / max-iter / caps / spinning) | `agentic-loops` | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/ralph-loop/store.ts` | All 8 `StopReason.kind` cases reachable; `complete.reason` discriminator covers both `"sigil"` and `"plan_exhausted"`; exhaustive `switch` with `exhaustiveCheck()` at the bottom of every consumer | F-03; resolves companion finding F001 (cross-workshop pre/post drift). |
| [ ] | T013.T | Tests for `evaluateStopPre` AND `evaluateStopPost`: one test per `StopReason.kind` (≥8 tests) + 3 tie-break scenarios from workshop 001 § Tie-breaking matrix + ≥2 pre-evaluator scenarios (STOP on iter-1, plan-exhausted on iter-1) + sigil vs plan_exhausted `complete.reason` discriminator coverage | `agentic-loops` | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/ralph-loop/store.test.ts` | ≥13 tests green | TDD-grade; THE safety proof; gates F001 closure |
| [ ] | T014 | Implement `RalphLoopStore` class with constructor `(append: AppendFn, runner: IterationRunner, clock?: () => number)`, `startRun`, `endRun`, `recordIteration`, `rehydrate` methods per workshop 002 § Interface contract | `agentic-loops` | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/ralph-loop/store.ts` | P2 (no `@earendil-works/*` imports); P3 (constructor-injected side-effects); P9 (`appendEntry` BEFORE in-memory mutate) | Constants live in this file (P5) — `MAX_ITERATIONS_DEFAULT=10`, `MAX_USD_DEFAULT=null`, etc. |
| [ ] | T014.T | Tests for `RalphLoopStore`: lifecycle (startRun → recordIteration → endRun), constructor-injection via `FakeIterationRunner` from T022, P9 ordering assertion (append called before in-memory mutate), clock injection for budget-wallclock tests | `agentic-loops` | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/ralph-loop/store.test.ts` | ≥6 tests green | Uses `makeRecorder()` from `harness/test-utils.ts` per D-016 encoded pattern |
| [ ] | T015 | Add P6 structural guards `isIterationData(data)` and `isRunStartData(data)` for replay; gate `rehydrate` switch cases on them | `agentic-loops` | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/ralph-loop/store.ts` | Malformed replay entries are dropped silently with no `as` cast | P6; matches scratch template's pattern |
| [ ] | T015.T | Tests for replay determinism: happy-path full replay, mid-stream malformed entry, missing entries, replay idempotency (same input twice yields identical state) | `agentic-loops` | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/ralph-loop/store.test.ts` | ≥4 tests green; P10 replay across `startup`/`reload`/`new`/`resume`/`fork` reasons verified at the store level | Cross-reason replay verified here; smoke verifies live |

#### 1.C Wiring (workshop 002 verbatim)

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T017 | Implement `SdkIterationRunner implements IterationRunner` per workshop 002 § Interface contract; spins fresh `createAgentSession` per call; honors `AbortSignal`; `dispose()` in `finally`; detaches listeners | `agentic-loops` | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/ralph-loop/index.ts` (or `runner.ts` if extracted) | One iteration end-to-end runs cleanly against a fixture plan in dev; `tsc --noEmit` passes; `dispose()` reachable in every code path (verified by code review) | F-02; worst-case lifecycle leak class |
| [ ] | T017.T | Leak-detection test for `SdkIterationRunner`: drive 10 fixture iterations (via `FakeIterationRunner`-style harness, but with real `createAgentSession` if available or a tracked-dispose double); assert no retained `AgentSession`/listener/handle survives | `agentic-loops` | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/ralph-loop/runner.test.ts` (new) | Test fails if `dispose()` is ever skipped or any listener is left attached; passes when workshop 002 § Resource ownership ledger is honored | R2 mitigation; spec assumption #4. Uses `--expose-gc` + a `WeakRef`-based probe; or a tracked dispose-counter double. Don't ship without this. |
| [ ] | T018 | Register `/ralph` command in `index.ts` with sub-verbs `start <path> [opts]`, `stop`, `status [--json]`, `plan` | `agentic-loops` | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/ralph-loop/index.ts` | `/ralph` appears in pi command list after `/reload`; `--json` output is deterministic JSON envelope | `/ralph status --json` is the smoke-driver's read surface per workshop 004 |
| [ ] | T019 | Register `ralph_iterate` and `ralph_check_stop` tools (LLM-callable, useful for in-conversation operation) | `agentic-loops` | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/ralph-loop/index.ts` | Tools register; LLM can call them; results are structured | Optional but cheap; deliver alongside command surface |
| [ ] | T020 | Single `session_start` handler (P10) that hydrates store from `ctx.sessionManager.getEntries()` covering reasons `startup`/`reload`/`new`/`resume`/`fork` | `agentic-loops` | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/ralph-loop/index.ts` | One handler; verified replay determinism via store tests | P10; D-005 verification dependency |
| [ ] | T021 | Status pill updates: `setStatus("ralph-loop", "iter N/M")` per iteration; clear with `undefined` (not `""`) at run end | `agentic-loops` | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/ralph-loop/index.ts` | Manual test in `pi`: pill shows during run, vanishes after stop | D-006 honored |

#### 1.D Smoke + AC-05 verification (workshop 004 verbatim)

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T022 | Implement `FakeIterationRunner` in `harness/test-utils.ts` (or per-ext file); produces deterministic 3-iteration sequences when `PIJ_RALPH_FAKE_RUNNER=1` | `_platform` | `/Users/jordanknight/pi-hacking/pij/harness/test-utils.ts` | Deterministic; same input → same `IterationResult` sequence | Used by smoke AND by integration-flavored vitest cases |
| [ ] | T023 | Create `.pi/extensions/ralph-loop/fixture-plan.md` with 3 undone tasks | `agentic-loops` | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/ralph-loop/fixture-plan.md` | File exists; matches workshop 003 § Example 1 shape | Used by smoke |
| [ ] | T024 | Build `.pi/extensions/ralph-loop/smoke.ts` § "ralph-loop:compact-survival" — 8-step choreography per workshop 004 § Steps; uses `compactAndAssert()` from T006 | `agentic-loops` | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/ralph-loop/smoke.ts` | `npm run smoke -- ralph-loop` exits 0 on a green system; assertion matrix A1–A4 from workshop 004 implemented | F-01; **this is THE AC-05 gate** |
| [ ] | T025 | Run AC-05 smoke and interpret per workshop 004 § Failure interpretation. If A1/A2 fail → file pi-mono issue per workshop 004 § Upstream escalation; mark smoke `expected_fail`; update D-005 with issue URL. Never add a shadow log. | `agentic-loops` | (no new file; outcomes update `docs/difficulties.md` D-005) | Either smoke passes OR D-005 row points at a real pi-mono URL with the upstream issue body matching workshop 004's template | F-01; clarify Q6 |

#### 1.E Docs + harness gift codification + velocity log

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T026 | Write `.pi/extensions/ralph-loop/AGENTS.md` with per-extension rules, P1–P10 reassertions, Huntley attribution, link to <https://ghuntley.com/ralph/>, no-git-push rule | `agentic-loops` | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/ralph-loop/AGENTS.md` | File exists; AC-09 satisfied | Per-extension AGENTS.md is a P10 convention |
| [ ] | T027 | Write `docs/how/ralph-loop.md` — plan-file conventions; default prompt (with attribution and links to snarktank/coleam00/ghuntley); full StopReason reference table; troubleshooting incl. D-005 escalation path; per-iteration cost guidance; "Why did Ralph stop?" tie-break explanation from workshop 001 | `agentic-loops` | `/Users/jordanknight/pi-hacking/pij/docs/how/ralph-loop.md` | File exists; covers every section listed; prompt borrows from snarktank/`prompt.md` with attribution (do not invent) | Spec Documentation Strategy |
| [ ] | T028 | RUNBOOK.md — add "How to start a Ralph Loop" + "Companion mode (minih)" sections | docs | `/Users/jordanknight/pi-hacking/pij/RUNBOOK.md` | Both sections present; cross-reference docs/how/ralph-loop.md + `docs/project-rules/agent-harness.md` | Matches D-020 ("custom models") doc pattern |
| [ ] | T029 | README.md — add `ralph-loop` row in "Where things are" table | docs | `/Users/jordanknight/pi-hacking/pij/README.md` | Row exists pointing at `.pi/extensions/ralph-loop/` and `docs/how/ralph-loop.md` | One-row addition |
| [ ] | T030 | Create `docs/project-rules/agent-harness.md` codifying minih + companion mode as pij's agent harness (Boot → Interact → Observe), L2 maturity, the BIO contract, the D-025 workaround note, link to AI-Substrate/minih#30 | `_platform` | `/Users/jordanknight/pi-hacking/pij/docs/project-rules/agent-harness.md` | File covers the BIO contract for the agent layer + how companion-mode runs per plan + the D-025 workaround status; cross-link from harness.md | AC-12 gift (b); satisfies spec Q8 |
| [ ] | T031 | Update `docs/project-rules/harness.md` to clarify engineering-harness vs agent-harness split + cross-link to new `agent-harness.md` | docs | `/Users/jordanknight/pi-hacking/pij/docs/project-rules/harness.md` | harness.md scopes itself to engineering harness (BIO substrate, `npm run self-check`); cross-links agent-harness.md for the overlay | Per the AGENTS_README layering contract |
| [ ] | T032 | Capture T1 in `docs/velocity.md`; compute Δ from T0; record any difficulty rows surfaced during Phase 1 | docs | `/Users/jordanknight/pi-hacking/pij/docs/velocity.md` | Velocity log row complete (T0, T1, Δ, output, notes incl. companion-mode + D-025 status); compounding hypothesis evaluated against v1 baseline per spec AC-13 | AC-13 |
| [ ] | T033 | Final companion review-request before merge (full diff) + read farewell envelope; harvest retros to `docs/retros/code-review-companion.md`; **AC-10 grep check**: `rg -n "git\s+push" .pi/extensions/ralph-loop/` returns zero lines | `_platform` | (no file change) | Companion reply addressed; `control: stop` sent; farewell envelope read; retros harvested via `minih harvest`; grep result clean (AC-10 enforced mechanically before merge) | Power-On-Mode protocol close-out; AC-10 mechanical gate |

### Acceptance Criteria

All 13 ACs from spec § Acceptance Criteria. Mapped to phases:

- [ ] AC-01 — `/ralph start` registers and pill displays: covered by T018, T020, T021, T024 smoke.
- [ ] AC-02 — default 10 iterations: covered by T014 (constants) + T024 smoke (max-iter case).
- [ ] AC-03 — `<promise>COMPLETE</promise>` stops: covered by T013, T017 sigil detection, T024 smoke.
- [ ] AC-04 — stop-reason transparency: covered by T013 + run-end notification in T020/T021.
- [ ] AC-05 — `/compact` durability (D-005 verification): covered by T006, T007, T022, T024, T025. **Load-bearing.**
- [ ] AC-06 — P10 replay across all reasons: covered by T020 + store replay tests in T016.
- [ ] AC-07 — P1–P10 enforced: covered by T008–T015 (store) + T017–T021 (wiring); validated by `npm run self-check` (typecheck + lint + test + smoke).
- [ ] AC-08 — "one task per iteration" in injected prompt: covered by T026 (AGENTS.md) + T027 (docs/how prompt).
- [ ] AC-09 — Huntley attribution: covered by T026 + T027 + T029.
- [ ] AC-10 — no git push: enforced by T026 AGENTS.md rule + **grep check in T033** + smoke (no `git push` invocation observable in pane captures).
- [ ] AC-11 — status-pill clears with `undefined`: covered by T021 + manual verify.
- [ ] AC-12 — harness improvement landed (TWO gifts): covered by T006/T007 (`compactAndAssert`) + T030 (`agent-harness.md`).
- [ ] AC-13 — velocity-log row: covered by T005 (T0) + T032 (T1, Δ).

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| R1 — `/compact` drops custom entries (D-005 confirmed) | Unknown (~40%) | High | Workshop 004 § Failure interpretation; file pi-mono issue per § Upstream escalation; mark smoke `expected_fail`; ship anyway (clarify Q6). Do not paper over. |
| R2 — SDK lifecycle leak across iterations | Low-Medium | Medium | Workshop 002 § Resource ownership; `dispose()` in `finally`; **leak-detection test in T017.T** asserts no retained `AgentSession`/listener/handle across 10 iterations. |
| R3 — Cost accounting unavailable from SDK | Medium | Low | Iteration-cap-only enforcement; `costUsd: null` per iteration; document in `docs/how/ralph-loop.md` § Troubleshooting; difficulty row. Spec assumption #4. |
| R4 — D-025 workaround disappears on a fresh clone or minih re-install | Medium | High (would re-wedge the companion silently) | Phase 0 T004 healthcheck; companion's own briefing carries the schema-file path; documented in `docs/project-rules/agent-harness.md` T030. |
| R5 — Companion drift: starts orienting on other plans (e.g., 009-extension-vetting which the wedged runs accidentally read) | Medium | Low-Medium | Briefing carries explicit scope ("ONLY review 008"); review-request body names the diff explicitly; T033 reads farewell envelope to confirm focus. |

---

## Validation Record (2026-05-15)

### Validation Thesis

**Raison d'être**: Translate the spec + 4 workshops into a directly-executable, 33-task Implementation-Ready plan that `/plan-6-implement-phase` can action without re-reading workshops or re-deriving task ordering.

**Value claim**: The build can proceed without rework because every spec AC is mapped to ≥1 task, every workshop section is consumed by ≥1 task, every Risk has a task-grounded mitigation, and the Domain Manifest covers every modified/new file.

**Artifact promise**: plan-6 receives concrete paths, success criteria, and notes; the companion can review at every commit-boundary by task ID; AC-13 velocity-log row is structurally ready.

**Intended beneficiaries**: plan-6-implement (next skill); the implementor (in this session); the companion reviewer; future planners querying compounding evidence.

**Proof target**: Implementation Ready (would be Validated Evidence only after smoke passes in Phase 1.D).

**Evidence standard**: spec AC → task mapping, workshop section → task mapping, Risk → task-grounded mitigation, Domain Manifest completeness, P1–P10 respect throughout, 7-column task table shape.

**Thesis source**: `ralph-loop-extension-spec.md` (§ Acceptance Criteria, § Phases, § Clarifications); `workshops/001-004`; `AGENTS.md` (P1–P10); `docs/difficulties.md` (D-005, D-018, D-019, D-020, D-025).

**Thesis verdict**: Advanced (after fixes applied; one HIGH and one MEDIUM resolved during validation).

**Main thesis risk**: T017's Done When relies on code review to confirm `dispose()` reachability — a tracked-dispose double in T017.T mechanizes this; without it, the SDK lifecycle leak protection remains aspirational. Mitigation: T017.T is now an explicit task.

---

| Agent | Lenses Covered | Thesis Axes Covered | Issues | Verdict |
|-------|---------------|---------------------|--------|---------|
| Coherence + Risk | Edge Cases, Integration, Hidden Assumptions | Implementation Readiness, Safety to Change | 1 HIGH fixed (R2 task gap → T017.T added) | ⚠️ → ✅ |
| Completeness | Evidence Sufficiency, Proof-Level Fit | Implementation Readiness | 0 HIGH, 1 MEDIUM fixed (AC-10 grep check now in T033) | ⚠️ → ✅ |
| Thesis Alignment | Thesis Alignment | Thesis Alignment, User/Product Value Preservation | echoed Coherence finding; resolved by same fix | ⚠️ → ✅ |
| Forward-Compatibility | Forward-Compatibility, Contract Integrity, Domain Boundaries | Implementation Readiness, Cross-Domain Coordination | 1 contract-drift (R2 not task-grounded) fixed | ⚠️ → ✅ |

### Forward-Compatibility Matrix

| Consumer | Requirement | Failure Mode | Verdict | Evidence |
|----------|-------------|--------------|---------|----------|
| `/plan-6-v2-implement-phase` | Actionable task table (paths + done-when + notes) | encapsulation lockout | ✅ | All 35 tasks have all 7 columns; absolute paths used |
| `/plan-6-v2-implement-phase` | Tests interleaved with impl for store (Hybrid TDD) | shape mismatch | ✅ | T008.T–T015.T pair with T008–T015 after MED-1 fix |
| `/plan-6-v2-implement-phase` | R2 (SDK lifecycle leak) mitigation is task-grounded | contract drift | ✅ (was ❌) | T017.T added with `WeakRef`/dispose-counter leak detection |
| Companion review-requests | Task IDs to ackOf | encapsulation lockout | ✅ | Each task has T### / T###.T ID |
| AC-13 velocity log | T0/T1 stamps + Δ + compounding analysis | shape mismatch | ✅ | T005 stamps T0; T032 stamps T1 + Δ; format matches `docs/velocity.md` scratch row |
| Future planners | Domain Manifest covers every file touched | shape mismatch | ✅ | After MED-2 fix; `harness/test-utils.ts` added |
| AC-10 mechanical enforcement | `git push` grep check in close-out | test boundary | ✅ (was ❌ MEDIUM) | T033 Done When now includes the explicit `rg` invocation |

**Thesis alignment**: Plan advances the spec's value claim end-to-end after R2 task-grounding fix; main residual risk is now T017.T's leak-detection implementation choice (`WeakRef` vs dispose-counter double), which plan-6 resolves at impl time.

**Outcome alignment**: The plan, as shipped after fixes, advances the spec § Summary value ("first-class long-running plan-driven autonomous mode... exercises every part of the pij harness... natural re-test vehicle for D-005") — every task either implements a missing piece of the extension, exercises a harness primitive, or proves D-005; no filler.

**Standalone?**: No — plan-6 is the immediate downstream consumer; companion review-requests cite task IDs from this plan; AC-13 row consumes T0/T1 from this plan's structure.

Overall: ✅ **VALIDATED WITH FIXES**
