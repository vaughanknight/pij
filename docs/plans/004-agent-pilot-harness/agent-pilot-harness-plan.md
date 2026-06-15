# Agent Pilot Harness Implementation Plan

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-05-11
**Spec**: [agent-pilot-harness-spec.md](./agent-pilot-harness-spec.md)
**Research**: [research-dossier.md](./research-dossier.md) (6 subagents, 56 findings)
**Workshop**: [workshops/001-driver-sdk-api-surface.md](./workshops/001-driver-sdk-api-surface.md) (Implementation Ready)
**Status**: DRAFT (ready for `/plan-4-v2-complete-the-plan`)

## Summary

Build a typed tmux Driver SDK at `harness/driver/` (5 module files transcribed from workshop 001) plus an `extension-validator` minih agent slug at `agents/extension-validator/` (5 files transcribed structurally from `agents/code-review-companion/`). Wire scratch through the new SDK, fix D-006 (`setStatus` semantics), close D-014 (shell-quoting), and capture D-005 evidence via a single human-driven validator pilot. Most tasks are paste-and-adapt rather than fresh design — the workshop and template carry the design weight.

## Target Domains

pij has no formal `docs/domains/` registry; namespaces are informal directories.

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| harness | existing (informal) | **modify** | Add `harness/driver/`; rewrite `harness/scripts/smoke.ts` as adapter; extend `docs/project-rules/harness.md` |
| extensions | existing (informal) | **modify** | Rewrite `.pi/extensions/scratch/smoke.ts` to new shape; one-line D-006 fix in `.pi/extensions/scratch/index.ts` |
| agents | existing (informal) | **modify** | Add `agents/extension-validator/` minih pack |
| (cross-cutting) | n/a | **modify** | `docs/difficulties.md`, `docs/velocity.md`, `README.md`, `docs/how/agent-feedback.md`, `docs/retros/extension-validator.md` |

## Domain Manifest

Every file this plan introduces or modifies, mapped to its informal namespace.

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `/Users/jordanknight/pi-hacking/pij/harness/driver/tmux.ts` | harness | contract | Public primitives consumed by smoke.ts and run.ts |
| `/Users/jordanknight/pi-hacking/pij/harness/driver/errors.ts` | harness | contract | Public DriverError hierarchy (callers catch + serialize) |
| `/Users/jordanknight/pi-hacking/pij/harness/driver/session.ts` | harness | contract | Public Session class + Step union |
| `/Users/jordanknight/pi-hacking/pij/harness/driver/index.ts` | harness | contract | Public re-exports + runScenario + preflight + loadScenario |
| `/Users/jordanknight/pi-hacking/pij/harness/driver/run.ts` | harness | contract | CLI entrypoint for agents (`tsx harness/driver/run.ts`) |
| `/Users/jordanknight/pi-hacking/pij/harness/driver.test.ts` | harness | internal | Unit tests (mocked `node:child_process`) |
| `/Users/jordanknight/pi-hacking/pij/harness/driver.it.test.ts` | harness | internal | Integration tests (live tmux against `bash`, env-gated) |
| `/Users/jordanknight/pi-hacking/pij/harness/scripts/smoke.ts` | harness | internal | Rewritten as ~35-line adapter over `runScenario` |
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/scratch/smoke.ts` | extensions | internal | Rewritten to new `Scenario`/`Step` shape |
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/scratch/index.ts` | extensions | internal | One-line D-006 fix (`setStatus("scratch", undefined)`) |
| `/Users/jordanknight/pi-hacking/pij/agents/extension-validator/agent.json` | agents | contract | minih pack manifest |
| `/Users/jordanknight/pi-hacking/pij/agents/extension-validator/prompt.md` | agents | contract | Agent role prompt |
| `/Users/jordanknight/pi-hacking/pij/agents/extension-validator/instructions.md` | agents | internal | Operational instructions |
| `/Users/jordanknight/pi-hacking/pij/agents/extension-validator/input-schema.json` | agents | contract | Validates `--param` input |
| `/Users/jordanknight/pi-hacking/pij/agents/extension-validator/output-schema.json` | agents | contract | Validates RunReport output |
| `/Users/jordanknight/pi-hacking/pij/docs/how/agent-feedback.md` | harness (docs) | contract | NEW — magic-wand loop documentation (curator gate) |
| `/Users/jordanknight/pi-hacking/pij/docs/difficulties.md` | cross-cutting | internal | D-006 + D-014 → encoded; D-005 status from pilot; possibly new MH-NNN |
| `/Users/jordanknight/pi-hacking/pij/docs/velocity.md` | cross-cutting | internal | Row 7 — first green validator wall-clock |
| `/Users/jordanknight/pi-hacking/pij/README.md` | cross-cutting | internal | § Status update (v0.3) |
| `/Users/jordanknight/pi-hacking/pij/docs/project-rules/harness.md` | harness | contract | Extend § Interact with Driver SDK; History row; L2 → L2.5 |
| `/Users/jordanknight/pi-hacking/pij/docs/retros/extension-validator.md` | agents | internal | NEW — auto-harvested by minih on validator pilot |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | **Workshop 001 is authoritative paste-ready code** for `harness/driver/` (5 modules + adapter + CLI). Implementation phase is transcription, not design. (Per dossier CC-03 + workshop's "Implementation Ready" proof level.) | Tasks T001–T007 transcribe from workshop 001 § Module sections. Reviewers check fidelity to citations (TC-NN, PR-NN), not novel design. |
| 02 | Critical | **D-014 closes by argv-array execution everywhere.** Today's `smoke.ts` does `["tmux", ...args].join(" ")` then `execSync` — every shell metacharacter is a hazard. `execFileSync("tmux", argv, opts)` retires the entire class. (Per dossier TC-01 + workshop 001 § Module: tmux.ts.) | T001 ships the `tmux()` private wrapper; T013 marks D-014 `encoded`. No `execSync` with shell strings allowed in `harness/`. |
| 03 | Critical | **D-006 closed during research, not implementation** — pi-mono `footer-data-provider.ts:132-138` reads "only `text === undefined` calls `delete`; `""` goes through `extensionStatuses.set(key, "")`." Scratch's `index.ts:98` calls `setStatus("scratch", "")` — it's a bug today. (Per dossier PR-04.) | T009 lands the one-line fix and updates D-006 to `encoded`. Cite pi-mono path in code comment. |
| 04 | High | **`agents/code-review-companion/` is the structural template** for `agents/extension-validator/`. Five files (`agent.json`, `prompt.md`, `instructions.md`, `input-schema.json`, `output-schema.json`); same shape; minih runtime same. (Per Clarify Q6 + Q8.) | T010 transcribes the structure, replaces semantics. No new schema design. |
| 05 | High | **D-005 evidence requires a manual pilot** — agent in this main session cannot drive interactive minih + tmux + pi without user-side action. Smoke scenario is shipped (in scratch's `smoke.ts`); pilot run produces the assertion. (Per dossier PL-03 + spec AC-09 + AC-10.) | T012 is explicitly user-driven. T014 is conditional — only ships if D-005 falsifies. |
| 06 | High | **Mock policy carve-out for SDK only** — pij's prior policy (avoid mocks) doesn't fit when the unit under test IS the argv passed to `child_process`. Per Clarify Q3, mocking `node:child_process` is allowed for `harness/driver.test.ts`; integration tests use real tmux against `bash`. | T001/T003/T004 implementation tasks ship matching unit tests using `vi.mock("node:child_process")`. T006 ships integration tests. |

## Agent Harness Strategy

- **Current Maturity**: L2 — auto boot via `npm install`; deterministic observe via `npm run self-check`; tmux-driven Interact via human-typed slash commands and `npm run smoke`.
- **Target Maturity (post-plan)**: **L2.5** — Interact upgrades to *agent-callable* via `tsx harness/driver/run.ts`; humans can still attach via tmux for debug. Maturity does NOT bump to L3 because smoke remains local-only (CI gap is D-008 stretch).
- **Boot Command**: `npm install`
- **Health Check**: `npm run self-check && echo HARNESS_HEALTHY || echo HARNESS_BROKEN`
- **Interaction Model**: Terminal (tmux + `pi`), now wrapped by typed Driver SDK callable from Node processes.
- **Evidence Capture**: tmux `capture-pane` output (visible + scrollback); structured `RunReport` JSON from agent CLI; optional `pipe-pane` transcript.
- **Pre-Phase Validation**: Required at start of every implementation session — `npm install` + `npm run self-check`. Plan-6 wraps this.

(Engineering harness — `package.json` scripts, `vitest.config.ts`, biome, tsconfig — already exists from plan 002 and is unchanged by this plan.)

## Phase Index

Single phase (Mode: Simple).

| Phase | Title | Primary Domain | Objective | Depends On |
|-------|-------|---------------|-----------|------------|
| 1 | Driver SDK + Validator Pilot | harness (primary), extensions, agents | Land Driver SDK + extension-validator pack; pilot scratch; close D-006 + D-014; capture D-005 evidence | None |

---

## Implementation

**Objective**: Ship `harness/driver/` (5 modules, ~450 LOC) + tests, rewrite `harness/scripts/smoke.ts` and scratch's `smoke.ts` over the new SDK, fix scratch's D-006 bug, ship `agents/extension-validator/` pack, run the pilot, and sweep ledgers.

**Testing Approach**: Hybrid (per spec § Testing Strategy)
- Full TDD for SDK primitives + orchestration (mocked `node:child_process`)
- Lightweight integration tests (live tmux against `bash`; env-gated `PIJ_DRIVER_IT=1`)
- Manual end-to-end via the validator pilot against real `pi`

### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | T001 | Implement Driver SDK tmux primitives + matching unit tests | harness | `/Users/jordanknight/pi-hacking/pij/harness/driver/tmux.ts`<br>`/Users/jordanknight/pi-hacking/pij/harness/driver.test.ts` (primitives section, new file) | Eight primitives exported (`type` / `press` / `paste` / `capture` / `boot` / `teardown` / `hasSession` / `inspect`) using `execFileSync` argv arrays; ≥6 unit tests assert argv shape with `vi.mock("node:child_process")`; `npm run typecheck` + `npm run lint` + `npm run test` clean | Transcribe verbatim from workshop 001 § Module: `tmux.ts`. Encodes TC-01..TC-12; closes finding 02 (D-014). Cite TC-NN inline. |
| [x] | T002 | Implement DriverError class hierarchy | harness | `/Users/jordanknight/pi-hacking/pij/harness/driver/errors.ts` | Five classes exported (`DriverError`, `DriverBootError`, `DriverPaneDeadError`, `DriverAssertionError`, `DriverIdleTimeoutError`); `AssertionContext` type exported; `DriverAssertionError.toReport()` returns JSON-serializable failure record; `npm run typecheck` clean | Transcribe from workshop 001 § Module: `errors.ts`. Uses `import type` for forward decls (no circular runtime imports). |
| [x] | T003 | Implement Session class + waitIdle + run + Step union, with unit tests | harness | `/Users/jordanknight/pi-hacking/pij/harness/driver/session.ts`<br>`/Users/jordanknight/pi-hacking/pij/harness/driver.test.ts` (Session section) | `Session.start` / `waitIdle` / `run` / `execute` / `teardown` / `capturedNamed` exported; `Step` discriminated union exported (6 kinds); `DEFAULT_PROMPT_RE` / `DEFAULT_SPINNER_RE` / `DEFAULT_CONTEXT_RE` set per PR-07; `Session.run` auto-routes risky payloads to `paste`; ≥6 unit tests cover output-stable polling, run timeout-or-match, each `Step` kind; `npm run test` clean | Transcribe from workshop 001 § Module: `session.ts`. Encodes PR-01/PR-02/PR-04/PR-07; closes IA-02/IA-04/IA-08. |
| [x] | T004 | Implement runScenario + preflight + loadScenario, with unit tests | harness | `/Users/jordanknight/pi-hacking/pij/harness/driver/index.ts`<br>`/Users/jordanknight/pi-hacking/pij/harness/driver.test.ts` (orchestrator section) | Public re-exports from `tmux.ts` / `errors.ts` / `session.ts` complete; `Scenario` + `RunReport` interfaces exported; `isScenario` shape guard rejects malformed default exports; `preflight()` returns `{ ok, tmuxVersion, piVersion, missing }`; `runScenario` wires session lifecycle + scenario steps + failure → `RunReport`; `RunReport.summary` shape is `{ passed: number; failed: number; durationMs: number }` (consumed by T012 + T010's output-schema); ≥4 unit tests; `npm run typecheck` clean | Transcribe from workshop 001 § Module: `index.ts`. **JSON-regex wire format**: workshop 001 lines 905 + 907 mention both `{ source, flags }` and `{ regex, flags }` — the implementor MUST pick one and use it consistently across `loadScenario`, scratch's smoke.ts (T008), and `harness/driver/run.ts` (T005). Recommended: `{ source: string; flags?: string }` (matches `RegExp.prototype.source`). Add a clarifying note to workshop 001 if you make a different choice. |
| [x] | T005 | Implement Driver CLI runner | harness | `/Users/jordanknight/pi-hacking/pij/harness/driver/run.ts` | Accepts `--scenario <path>` or `--stdin`; reads JSON, invokes `runScenario`, prints JSON `RunReport` to stdout; exits 0 on `ok: true`, 1 on assertion failure, 2 on bad invocation; manual `echo '{"name":"smoke","steps":[]}' \| npx tsx harness/driver/run.ts --stdin` returns valid JSON; shebang `#!/usr/bin/env tsx` present | Transcribe from workshop 001 § Agent CLI. This is the agent-facing surface from finding 04. |
| [x] | T006 | Live-tmux integration tests (env-gated) | harness | `/Users/jordanknight/pi-hacking/pij/harness/driver.it.test.ts` | Tests gated behind `PIJ_DRIVER_IT=1`; drive `bash --noprofile --norc` (NOT `pi`) for determinism; cover `Session.start` → `waitIdle` (bash prompt) → `run` (echo assertion) → `teardown`; assert `hasSession` returns false post-teardown; `PIJ_DRIVER_IT=1 npm test` passes locally; `npm test` (no env) skips cleanly | Transcribe from workshop 001 § Testing strategy § integration. CI runs without env var → tests skip cleanly. |
| [x] | T007 | Rewrite `harness/scripts/smoke.ts` as Driver SDK adapter | harness | `/Users/jordanknight/pi-hacking/pij/harness/scripts/smoke.ts` | File ≤40 LOC; imports `loadScenario` + `runScenario` from `harness/driver/index.js`; preserves D-013 ENOENT defense in `findScenarios()`; on failure prints `JSON.stringify(report.failure, null, 2)`; `npm run smoke -- scratch` exits 0 against real pi; `npm run typecheck` clean | Transcribe from workshop 001 § Adapter. Closes IA-04 / IA-09 / IA-10. |
| [x] | T008 | Rewrite scratch's `smoke.ts` to new `Scenario`/`Step` shape | extensions | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/scratch/smoke.ts` | File imports `Scenario` type from `../../../harness/driver/index.js`; uses discriminated `Step` union (no `{send, expect, delay}` legacy shape remains); 30s sleep after `/compact` replaced with `{ kind: "wait", timeoutMs: 60_000 }`; final `/scratch list` step uses positive lookahead regex from research dossier (preserves both notes assertion); `npm run smoke -- scratch` exits 0 | Per workshop 001 § Sample scenario. Encodes PR-09 (compact polling). |
| [x] | T009 | D-006 fix in scratch + difficulty ledger update | extensions | `/Users/jordanknight/pi-hacking/pij/.pi/extensions/scratch/index.ts` (line ~98)<br>`/Users/jordanknight/pi-hacking/pij/docs/difficulties.md` | Scratch `index.ts` calls `ctx.ui.setStatus("scratch", undefined)` when count is 0 (NOT empty string); inline comment cites pi-mono `footer-data-provider.ts:132-138`; `docs/difficulties.md` D-006 status changes from "open (evidence pending)" to "encoded"; **machine-verifiable check**: T008's scratch scenario adds a `{ kind: "type", text: "/scratch clear", press: "Enter", expect: <regex confirming cleared state> }` step followed by `{ kind: "type", text: "/scratch list", press: "Enter", expect: /(?!.*scratch:)/m }` — i.e., the rendered footer after clear MUST NOT contain `/scratch:/`. Pilot at T012 exercises this. | Per finding 03 + dossier PR-04 + spec § Research Context point 2. The negative-lookahead regex in T008 makes the assertion machine-verifiable; the manual pi observation is no longer load-bearing. |
| [x] | T010 | Create `extension-validator` agent pack | agents | `/Users/jordanknight/pi-hacking/pij/agents/extension-validator/agent.json`<br>`/Users/jordanknight/pi-hacking/pij/agents/extension-validator/prompt.md`<br>`/Users/jordanknight/pi-hacking/pij/agents/extension-validator/instructions.md`<br>`/Users/jordanknight/pi-hacking/pij/agents/extension-validator/input-schema.json`<br>`/Users/jordanknight/pi-hacking/pij/agents/extension-validator/output-schema.json` | Pack STRUCTURE (5 files + manifest layout) mirrors `agents/code-review-companion/`; `agent.json` declares manifest with permissions `trusted` and `coordination: optional`; `prompt.md` describes one-shot validator role + drives `tsx harness/driver/run.ts` + writes JSON `RunReport`; `input-schema.json` validates `{ extensionName: string, scenarios?: array, piBinary?: string, tmuxSession?: string, cwd?: string }`; `output-schema.json` validates `{ extension: string, results: array, summary: { passed: number, failed: number, durationMs: number }, retrospective: { magicWand: string, magicWandTarget: "project", difficulties?: array } }` (matches T004's `RunReport` shape verbatim); manifest installs locally (no registry publish per Clarify Q6) | **Schema CONTENT diverges from code-review-companion intentionally** — the validator is a *scenario runner* (RunReport with `results[]` per step), not a code reviewer (`findings[]` per file). The pack STRUCTURE is the template; the schema CONTENT comes from T004's `RunReport` interface in workshop 001 § Module: `index.ts`. Cross-check before submitting: `agents/extension-validator/output-schema.json` MUST be a JSON Schema for the same TypeScript shape as `RunReport`. **Workshop-trigger gate**: if during transcription you find that the validator needs >2 fields not present in `code-review-companion`'s input-schema (beyond `extensionName`/`scenarios`/`piBinary`/`tmuxSession`/`cwd`), OR if the output-schema needs to deviate beyond minih's standard `retrospective.{magicWand, magicWandTarget, difficulties?}` shape, **STOP and run** `/plan-2c-v2-workshop "Validator agent prompt + schemas"` before continuing T010. Otherwise proceed with transcription. Per finding 04. |
| [x] | T011 | Author `docs/how/agent-feedback.md` (magic-wand loop) | harness (docs) | `/Users/jordanknight/pi-hacking/pij/docs/how/agent-feedback.md` (new) | Document covers: (a) inline `finding` message shape with `ackOf: <task.id>`; (b) farewell envelope schema with `retrospective.{magicWand, magicWandTarget, difficulties}`; (c) curator gate — manual review SLA + manual promotion to D-NNN row; (d) cross-link to `agents/extension-validator/prompt.md`; renders cleanly in markdown; ≤200 lines | First-class doc for the magic-wand loop. Per Clarify Q4. Future workshop 003 may formalize further. |
| [~] | T012 | Validator pilot run + retrospective harvest (USER-DRIVEN — manual gate) | agents | `/Users/jordanknight/pi-hacking/pij/docs/retros/extension-validator.md` (new or appended)<br>operator notes (out-of-tree if needed) | User runs `minih run extension-validator --param extensionName=scratch` (or local-pack equivalent) ONCE; resulting `report.json` has `summary.passed > 0` (using T004's `summary: { passed, failed, durationMs }` shape); `retrospective.magicWand` is non-empty; retros file created/appended; D-005 evidence captured (the `/scratch list` step after `/compact` either passes — pilot reports `ok: true` for that step — or fails — pilot reports the failure, which triggers conditional T014); operator notes record any unexpected behavior worth promoting to a difficulty row; **AC-13 confirmed during this pilot**: user runs `tmux attach -t pij-<scenario.name>-<pid>` (the session-naming pattern T004 transcribes from workshop 001) DURING the pilot run and observes pi rendered, OR captures a post-mortem screenshot if attach happens after teardown — record outcome in retros file; **lifecycle ownership**: minih auto-harvests retrospective to `docs/retros/extension-validator.md`; user reviews and curates wishes before T013 begins; plan-6 PAUSES at T012 until user signals completion (e.g., commits the retros file or marks T012 ✓ in the flight plan checklist) | Per finding 05 + spec AC-09 + AC-10 + AC-13. **Agent in main session cannot drive this** — explicit user handoff. |
| [ ] | T013 | Ledger sweep — difficulties + velocity + README + harness.md | harness (docs) | `/Users/jordanknight/pi-hacking/pij/docs/difficulties.md`<br>`/Users/jordanknight/pi-hacking/pij/docs/velocity.md`<br>`/Users/jordanknight/pi-hacking/pij/README.md`<br>`/Users/jordanknight/pi-hacking/pij/docs/project-rules/harness.md` | **Step 0 — explicit T014 decision gate**: read T012's `report.json`; if any step in `results[]` is `{ ok: false }` for the post-`/compact` `/scratch list` step, T014 becomes mandatory (file the fallback dossier as part of THIS plan before declaring landing); if all post-`/compact` steps are `{ ok: true }`, T014 stays dormant. Record the decision in the retros file with citation to T012's report. **Step 1 — difficulties.md**: D-014 → "encoded" (argv-array fix; cite T001); D-006 → "encoded" (cite T009 + T008's negative-lookahead regex); D-005 → "encoded" if T012 passed, "falsified — see d005-fallback dossier" if failed; **AC-12 explicit curator step**: at least one wish from T012's `retrospective.magicWand` is promoted to a difficulty row (new MH-NNN with status `open`), OR explicitly logged as "no action — already covered by D-NNN" with citation, OR captured as a future SDK enhancement note in `docs/how/agent-feedback.md`. **Step 2 — velocity.md**: row 7 — absolute wall-clock from spec acceptance (2026-05-10) to T012 first green; no ratio claimed. **Step 3 — README.md** § Status: v0.3 mention with Driver SDK + extension-validator pack; AC-15 ratio still deferred to ext #3. **Step 4 — harness.md**: append History row dated 2026-05-11 noting Driver SDK + L2 → L2.5; extend § Interact with Driver SDK paragraph (cite `harness/driver/run.ts`) | Per Clarify Q5. AC-05 / AC-06 / AC-10 / AC-11 / AC-12 land here. The Step 0 gate makes the conditional T014 path explicit (closes Validation Agent 1's MEDIUM finding). |
| [ ] | T014 | (CONDITIONAL — only if T012 falsifies D-005) File D-005 fallback dossier | extensions | `/Users/jordanknight/pi-hacking/pij/docs/plans/004-agent-pilot-harness/d005-fallback.md` (new)<br>`/Users/jordanknight/pi-hacking/pij/docs/difficulties.md` | Dossier captures T008-style pre-compaction snapshot strategy from plan 003 § Non-Goals; difficulties.md D-005 explicitly marks "falsified" with citation to T012 RunReport; subsequent extension plans must address this before relying on `customType` across `/compact`; no implementation in this plan — fallback ships in a follow-on plan | ONLY if T012's RunReport shows the post-`/compact` `/scratch list` step failed. Per spec AC-10 risk-3 mitigation. |

### Acceptance Criteria

- [ ] AC-01: `harness/driver/{tmux,session,errors,index,run}.ts` exist and pass `npm run typecheck` + `npm run lint`
- [ ] AC-02: ≥10 unit tests in `harness/driver.test.ts` pass with mocked `node:child_process`
- [ ] AC-03: `npm run smoke -- scratch` exits 0 against real `pi` via the new SDK adapter
- [ ] AC-04: scratch's `smoke.ts` uses the discriminated `Step` union; no fixed sleeps remain
- [ ] AC-05: D-006 fix in scratch lands; ledger → `encoded`
- [ ] AC-06: D-014 closed (no `args.join(" ")` shell strings in `harness/`); ledger → `encoded`
- [ ] AC-07: `harness/driver/run.ts` accepts JSON scenario, prints JSON `RunReport`
- [ ] AC-08: `agents/extension-validator/` pack installs locally (no registry publish per Clarify Q6)
- [ ] AC-09: Validator pilot against scratch produces `RunReport` with non-empty `retrospective.magicWand`
- [ ] AC-10: D-005 evidence captured; ledger updated based on outcome
- [ ] AC-11: `docs/velocity.md` row 7 records first green validator wall-clock
- [ ] AC-12: At least one magic-wand wish curated to a difficulty row, SDK enhancement note, or explicit "no action" disposition
- [ ] AC-13: Human can `tmux attach -t pij-<scenario>-<pid>` during/after a validator run; confirmed manually once

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| R-1: SDK abstractions don't fit validator's actual needs (gap discovered at pilot time) | Medium | Medium | Magic-wand wish loop is exactly the surface for this — AC-12 explicitly targets it. |
| R-2: Validator agent struggles to author scenarios autonomously | Medium | Low | v1 supplies scenario JSON via `--param`; autonomy is workshop 002 territory (deferred). |
| R-3: D-005 falsifies — `customType` does NOT survive `/compact` | Low–Medium | High | T014 (conditional) is dormant fallback dossier; SDK + validator pack still land cleanly. |
| R-4: tmux or pi version drift between research time and pilot time | Low | Medium | `preflight()` reports both versions in every run; T012 fails fast on missing binaries. |
| R-5: `/compact` >60s in some envs | Low | Low | `wait.timeoutMs` is per-step configurable in scratch's smoke (set to 60s; bump if observed). |
| R-6: minih `inside-state.json` schema gap (D-017) bites the validator | Low | Low | Validator uses inbox messages for status, not state transitions — same workaround as code-review-companion. |
| R-7: Workshops 002/003 scope creep during T010 | Medium | Low | T010 explicitly transcribes from `agents/code-review-companion/`; deviations require an explicit decision (write-down in difficulty ledger). |
| R-8: Scratch's `smoke.ts` rewrite (T008) breaks existing `npm run smoke -- scratch` | Low | Medium | T007 (smoke adapter) lands first and runs against legacy scratch shape briefly; T008 immediately follows; both verified by `npm run smoke -- scratch` before T009. |

---

## Next Steps

1. **Next**: `/plan-4-v2-complete-the-plan` — readiness gate (5 validators in parallel)
2. After `/plan-4` returns READY: `/validate-v2` for thesis-aware review
3. Then `/plan-6-v2-implement-phase-companion --plan "/Users/jordanknight/pi-hacking/pij/docs/plans/004-agent-pilot-harness/agent-pilot-harness-plan.md"` — ships with parallel companion review (mirrors plan 003 pattern)

---

## Validation summary (PHASE 4 self-check)

- [x] All phases have task tables — single phase, 13 mandatory tasks + 1 conditional
- [x] Each task has success criteria (Done When column)
- [x] Domain manifest covers all 21 files this plan touches
- [x] Target domains from spec are all addressed (harness, extensions, agents, cross-cutting)
- [x] Key findings reference affected tasks (e.g., finding 02 → T001/T013, finding 03 → T009)
- [x] No time language present (CS implied by Simple Mode + spec § Complexity = CS-2; no minute targets)
- [x] Absolute paths used throughout
- [x] Constitution gate: N/A (no `docs/project-rules/constitution.md`)
- [x] Architecture gate: N/A (no `docs/project-rules/architecture.md`)
- [x] Engineering harness substrate: present (npm scripts + vitest + biome from plan 002); no new substrate work needed

---

## Validation Record (2026-05-11)

### Validation Thesis

**Raison d'être**: Convert spec + workshop 001 + research dossier into a sequenced, paste-ready task table so plan-6 implementor (with companion review) can execute without re-deriving design or rediscovering tmux gotchas; plan must close D-006/D-014 and capture D-005 evidence to produce extension #2 in the velocity log.

**Value claim**: Implementation becomes cheaper (transcription not design), reviewable (each task has Done When), and resumable (each task independently completable at commit boundary).

**Artifact promise**: `/plan-6-v2-implement-phase-companion` can execute every task without further clarification; companion can find every cited section; user verifies against 13 ACs.

**Intended beneficiaries**: implementing agent (plan-6); code-review-companion; user/curator; future plan 005 (ext #3 consumer).

**Proof target**: Implementation Ready

**Evidence standard**: every workshop 001 file referenced by a task; every spec AC mapped; difficulties addressed; domain manifest covers paths; manual gates explicit.

**Thesis source**: Spec § Summary + § Goals + § AC; Workshop 001 § Value Thesis; harness-is-the-product principle.

**Thesis verdict**: Advanced (post-fix)

**Main thesis risk**: T012 is a manual synchronization point; if the user delays the pilot or the pilot reveals D-005 falsifies, T014 fallback dossier must be written as part of this plan's landing — encoded as the explicit Step 0 decision gate in T013.

---

| Agent | Lenses Covered | Thesis Axes Covered | Issues | Verdict |
|-------|---------------|---------------------|--------|---------|
| Coherence + Completeness (Agent 1) | System Behavior, Edge Cases, Deployment & Ops, Domain Boundaries, Hidden Assumptions, Evidence Sufficiency | Implementation Readiness, Cross-Domain Coordination | 1 MEDIUM (T013 gate) fixed, 1 LOW (CS-2 optimism) accepted | ✅ post-fix |
| Risk + Source Truth (Agent 2) | Hidden Assumptions, Edge Cases, Technical Constraints, Concept Documentation, Evidence Sufficiency | Evidence Sufficiency, Learning Compounding | 0 | ✅ |
| Thesis Alignment (Agent 3) | Thesis Alignment, Proof-Level Fit, Evidence Sufficiency | Thesis Alignment, Implementation Readiness, Agent Readiness, Learning Compounding | 1 MEDIUM (T009 subjective) fixed | ✅ post-fix |
| Forward-Compatibility (Agent 4) | Forward-Compatibility, Integration & Ripple, Hidden Assumptions | Agent Readiness, Cross-Domain Coordination | 1 CRITICAL→HIGH (T010 schema), 2 HIGH (workshops trigger, AC-13), 3 MEDIUM (regex shape, summary shape, lifecycle) — all fixed | ✅ post-fix |

### Forward-Compatibility Matrix

| Consumer | Requirement | Failure Mode | Verdict | Evidence |
|----------|-------------|--------------|---------|----------|
| `/plan-6-v2-implement-phase-companion` | task IDs + Path(s) + Done When sufficient for transcription without back-tracking | encapsulation lockout | ✅ | T001..T014 stable; absolute paths; testable Done Whens (post-fix); workshop 001 § citations verified |
| `agents/code-review-companion` in Power-On-Mode | Done When verifiable at commit boundary | test boundary | ✅ post-fix | AC-13 verification moved into T012's manual gate; companion now only enforces commit-boundary criteria |
| `agents/extension-validator` (T010) | input-schema accepts scenario from T004; output-schema matches T004's RunReport shape | shape mismatch | ✅ post-fix | T004 + T010 cross-reference each other for `summary: { passed, failed, durationMs }` and `RunReport` shape; intentional divergence from code-review-companion documented |
| Plan 005+ future ext #3 | AC-11 wall-clock + stable Scenario/Step types | contract drift | ✅ | T013 Step 2 produces velocity.md row 7; SDK types locked in workshop 001 |
| Workshops 002 + 003 (deferred) | clear trigger for "validator-pack design proves contentious" | contract drift | ✅ post-fix | T010 Notes specify operational gate: STOP if input-schema needs >2 extra fields OR output-schema deviates beyond minih's standard pattern |

**Thesis alignment**: Value claim advanced — proof level Implementation Ready achieved post-fix; main thesis risk (T012 manual sync + conditional T014) is encoded as the explicit Step 0 gate in T013.

**Outcome alignment**: Post-fix, the plan as written advances the VPO Outcome — encoding tmux automation (T001–T007), retiring D-014/D-006/D-005-evidence (T001+T009+T012/T014), and producing the second velocity data point (T013 Step 2) is now achievable without ambiguity in T010's schema, AC-13's verification path, or the workshops 002/003 deferral trigger.

**Standalone?**: No — five concrete downstream consumers (plan-6, code-review-companion, T010's ext-validator agent, plan 005+, deferred workshops 002/003).

Overall: ✅ **VALIDATED WITH FIXES**
