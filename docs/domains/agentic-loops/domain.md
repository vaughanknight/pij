# Domain: agentic-loops

## Purpose

Provide first-class support for long-running, plan-driven autonomous loops over the pi runtime. The headline pattern is Geoffrey Huntley's [Ralph Loop](https://ghuntley.com/ralph/): a fresh `createAgentSession()` per iteration, a markdown plan file as the workspace, and a closed taxonomy of stop conditions as the safety story.

This domain owns the vocabulary, contracts, and discipline that any "iterate until done" agent needs in pij — independent of the specific outer loop algorithm. v1 implements the Ralph variant; v2+ may add multi-Ralph swarms, plan-format adapters, and cost-aware schedulers without changing this domain's contracts.

## Source Locations

| Path | Role |
|------|------|
| `.pi/extensions/ralph-loop/index.ts` | Pi wiring: `/ralph` command, `ralph_iterate`/`ralph_check_stop` tools, P10 `session_start` handler, status pill updates. |
| `.pi/extensions/ralph-loop/store.ts` | **Pi-free** store. `StopReason` tagged union, pre/post evaluator, `RalphLoopStore` class, replay, markdown `PlanModel` parser, spinning detector, `taskFingerprint`. Constants live here (P5). |
| `.pi/extensions/ralph-loop/store.test.ts` | Vitest against the store (P8). |
| `.pi/extensions/ralph-loop/runner.test.ts` | Leak-detection test for `SdkIterationRunner` (R2 mitigation; `WeakRef`/dispose-counter). |
| `.pi/extensions/ralph-loop/smoke.ts` | Deterministic Driver-SDK scenarios including `ralph-loop:compact-survival` (AC-05 gate). |
| `.pi/extensions/ralph-loop/fixture-plan.md` | 3-task fixture plan consumed by smoke (workshop 003 § Example 1 shape). |
| `.pi/extensions/ralph-loop/AGENTS.md` | Per-extension P1–P10 reassertions; Huntley attribution; no-`git push` rule. |
| `docs/how/ralph-loop.md` | Deep how-to: plan-file conventions, default prompt (attribution), `StopReason` reference, troubleshooting, per-iteration cost guidance, "Why did Ralph stop?" tie-break explanation. |
| `harness/test-utils.ts` | Hosts `FakeIterationRunner` (cross-domain helper). |
| `harness/driver/index.ts` | Hosts `compactAndAssert()` (cross-domain helper used by `ralph-loop:compact-survival` smoke; AC-12 gift). |
| `docs/plans/008-ralph-loop-extension/workshops/001-stop-condition-catalog.md` | Source design for `StopReason` taxonomy + pre/post evaluator split. |
| `docs/plans/008-ralph-loop-extension/workshops/002-sdk-iteration-lifecycle.md` | Source design for `IterationRunner` interface + resource ownership ledger. |
| `docs/plans/008-ralph-loop-extension/workshops/003-plan-file-format.md` | Source design for markdown plan grammar + `PlanModel`. |
| `docs/plans/008-ralph-loop-extension/workshops/004-compact-survival-smoke.md` | Source design for AC-05 smoke choreography + failure interpretation. |

## Concepts

| Concept | Description | Contract |
|---------|-------------|----------|
| Stop taxonomy | A closed, finite set of reasons a loop ends. Every reason is observable and reportable. | `StopReason` tagged union with 8 kinds (`complete`, `max_iterations`, `budget_usd`, `budget_wallclock`, `spinning`, `manual_stop`, `user_cancel`, `unverified`). `complete` carries `reason: "sigil" \| "plan_exhausted"`. Exhaustive `switch` via `exhaustiveCheck()` at every consumer. |
| Pre/post evaluation | Two distinct evaluation passes per iteration: `evaluateStopPre` (before spinning the next agent session — catches STOP marker, plan-exhausted, cancel-between-iters) and `evaluateStopPost` (after the iteration ran — catches sigil, caps, spinning). | Resolves the cross-workshop drift reported as F001 (companion review). First-match-wins within each pass; priority is cancel → explicit done → caps → spinning. |
| Iteration lifecycle | One iteration = (resolve next task) → (spin fresh `createAgentSession`) → (await `session.run`) → (capture output + usage) → (`dispose()` in finally) → (append `iteration` event BEFORE in-memory mutate). | `IterationRunner` interface (`runIteration({plan, history, signal}): Promise<IterationResult>`). Resource ownership: every `createAgentSession` MUST be matched by `dispose()` in `finally`; listeners MUST be detached with `session.off()`. |
| Plan model | Markdown plan files parse to a typed `PlanModel`. Pure function; no I/O; per-line regex grammar. | `parseMarkdownPlan(text, path): PlanModel`. `PlanModel` carries `tasks[]` (each `kind: "done" \| "undone" \| "skipped"`), optional `stopMarker`, `warnings[]`, `headings[]`. `nextUndoneTask(plan)` returns the first undone task in document order, or `null`. |
| Task fingerprinting | Deterministic 12-hex-char digest of a task title (trimmed, lower-cased) for spinning detection. | `taskFingerprint(title): string` using `node:crypto` SHA-1. Case- and whitespace-insensitive. |
| Spinning detection | A loop is "spinning" when the last N iterations share a task fingerprint. | `detectSpinning(log, n)`. Tail-slice only; cheap. Returns `Extract<StopReason, { kind: "spinning" }>` or `null`. Default `n=3`. |
| Persistence + replay | Loop state survives pi `session_start` reasons (`startup`/`reload`/`new`/`resume`/`fork`) via `appendEntry` + replay through `ctx.sessionManager.getEntries()`. P9 + P10. | Single `session_start` handler; structural guards (`isIterationData`, `isRunStartData`) gate replay; idempotent (same input twice → identical state). |
| Attribution | Community pattern provenance is preserved: Ralph Loop = Huntley; default prompt borrows from snarktank + coleam00. | Per-extension `AGENTS.md` carries the attribution. `docs/how/ralph-loop.md` § Prompt borrows verbatim with citation. No reinvention of established patterns; no quiet adoption. |
| Compact survival | `customType` entries appended by the extension must survive pi `/compact` so iteration history is durable across context reductions. | AC-05. Verified by `ralph-loop:compact-survival` smoke (workshop 004). Currently **unverified**; if A1/A2 of the assertion matrix fail, escalate to pi-mono via workshop 004 § Upstream escalation — do not add a shadow log inside the extension (clarify Q6). |

## Contracts

### Headline: the `StopReason` tagged union (verbatim source-of-truth)

This is the contract Phase 1 `store.ts` MUST implement character-for-character. Companion review F001 (HIGH) caught the prior version which only summarised the kinds without embedding the field shapes. Lifted verbatim from [`workshops/001-stop-condition-catalog.md` § StopReason tagged union](../../plans/008-ralph-loop-extension/workshops/001-stop-condition-catalog.md):

```ts
// .pi/extensions/ralph-loop/store.ts
export type StopReason =
  | { kind: "complete"; reason: "sigil" | "plan_exhausted"; iteration: number }
  | { kind: "max_iterations"; limit: number; reached: number }
  | { kind: "budget_usd"; limitUsd: number; spentUsd: number }
  | { kind: "budget_wallclock"; limitMs: number; elapsedMs: number }
  | { kind: "spinning"; n: number; taskFingerprint: string; iterations: readonly number[] }
  | { kind: "manual_stop"; line: string; iteration: number }     // STOP token found in plan file
  | { kind: "user_cancel"; at: "iteration_boundary" | "mid_iteration"; iteration: number }
  | { kind: "unverified"; cause: "cost_unavailable" | "sigil_missing" | "session_error"; detail: string };
```

Discriminator is `kind` (P6 boundary discipline). Every case carries the evidence that fired it. `complete.reason` resolves cross-workshop drift caught during plan-3 companion review (F001).

### Contracts at a glance

| Contract | Consumer | Shape / Guarantee |
|----------|----------|-------------------|
| `StopReason` tagged union | All loop consumers (store, wiring, smoke, docs) | 8 kinds, closed taxonomy, exhaustively switched. Each carries the evidence that fired it. See **§ Contracts — Headline** above for the verbatim TypeScript definition (Phase 1 T008 implements against this block character-for-character). |
| `IterationRunner` interface | Wiring layer (`index.ts`) consumes; `RalphLoopStore` ctor injects | `runIteration({ plan: PlanModel, history: IterationRecord[], signal: AbortSignal }): Promise<IterationResult>`. Implementations own SDK lifecycle. |
| `PlanModel` types | Store; wiring; docs | Pure data model from `parseMarkdownPlan`. Workshop 003 § Data model is the source. |
| `appendEntry` ordering (P9) | Store consumers | Every state mutation is preceded by an `appendEntry` with a stable `customType` (`ralph-loop:run-start`, `ralph-loop:iteration`, `ralph-loop:run-end`). |
| `/ralph` command surface | Operators + smoke | Sub-verbs: `start <path> [opts]`, `stop`, `status [--json]`, `plan`. `--json` envelope is deterministic and stable. |
| `ralph_iterate` / `ralph_check_stop` tools | LLM agent | Structured tool calls returning structured results. Optional; the command surface is the primary contract. |
| `compactAndAssert(session, opts)` (cross-domain) | Smokes that must verify `/compact` durability | AC-12 gift (a). Lives in `harness/driver/index.ts`. Reusable across every future "must-survive-/compact" extension. |

## Composition

| Component | Status | Notes |
|-----------|--------|-------|
| `RalphLoopStore` (class) | implemented in T014 | Constructor injection per P3: `(append: AppendFn, runner: IterationRunner, clock?: () => number)`. Owns the evaluator, replay, and iteration recording. |
| `SdkIterationRunner` (class implements `IterationRunner`) | implemented in T017 | Spins `createAgentSession` per call; `dispose()` in `finally`; detaches listeners. R2 risk class. |
| `FakeIterationRunner` (class implements `IterationRunner`) | implemented in T022; lives in `harness/test-utils.ts` | Deterministic 3-iteration sequences. Used by store tests AND by smoke under `PIJ_RALPH_FAKE_RUNNER=1`. |
| `parseMarkdownPlan` (function) | implemented in T009 | Pure; no I/O. |
| `nextUndoneTask` (function) | implemented in T010 | Pure; document order. |
| `taskFingerprint` (function) | implemented in T011 | Pure; node:crypto SHA-1. |
| `detectSpinning` (function) | implemented in T012 | Pure; tail-slice. |
| `evaluateStopPre` + `evaluateStopPost` (functions) | implemented in T013 | 8 reasons total. F-03. |
| `isIterationData` + `isRunStartData` (guards) | implemented in T015 | P6 structural guards. |
| `/ralph` command + tools + status pill (wiring) | implemented in T018–T021 | All side effects in `index.ts`. |

## Dependencies

### This Domain Depends On

- **pi runtime** (external). `ExtensionAPI`: `appendEntry`, `setStatus`, `notify`, `registerCommand`, `registerTool`, `sessionManager.getEntries()`. See per-extension index.ts.
- **pi-sdk `createAgentSession`** (external). Lifecycle ownership ledger in workshop 002 § Resource ownership.
- **`extension-authoring-harness`**. Driver SDK (`Scenario`/`Step`/`Session`); `compactAndAssert()` (cross-domain helper); `npm run new` scaffold; `npm run self-check`; `makeRecorder()` from `harness/test-utils.ts`.
- **AC-05 outcome** (open question). `/compact` durability of `customType` entries — **unverified**. T024 smoke is the gate; T025 interprets per workshop 004. If A1/A2 fails, the dependency moves to "pi-mono fix in flight" with a real issue URL captured in D-005.

### Domains That Depend On This

- None in v1. Future extensions adopting "iterate until done" patterns (e.g., autonomous test-fixers, code-review loops) would consume `StopReason` and `IterationRunner` from this domain.

## History

| Plan | Change | Date |
|------|--------|------|
| 008-ralph-loop-extension | Domain formalised. `StopReason` (8 kinds with pre/post evaluator split) + `IterationRunner` interface + `PlanModel` are headline contracts. First inhabitant: `.pi/extensions/ralph-loop/`. AC-05 (`/compact` durability) listed as unverified pending T024 smoke. No cross-domain edges in v1. | 2026-05-15 |
