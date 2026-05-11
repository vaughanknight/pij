# Agent Pilot Harness

**Mode**: Simple
**Plan**: 004-agent-pilot-harness
**Created**: 2026-05-10
**Status**: Clarified (ready for `/plan-3-v2-architect`)
**Clarified**: 2026-05-10 (8 answers; all rubber-stamped at Recommended)

📚 This specification incorporates findings from [`research-dossier.md`](./research-dossier.md) and the locked design in [`workshops/001-driver-sdk-api-surface.md`](./workshops/001-driver-sdk-api-surface.md).

---

## Research Context

The research dossier (6 parallel subagents, 56 findings) and workshop 001 (Driver SDK API surface, Implementation Ready) have already settled the load-bearing technical decisions. Three load-bearing insights from research:

1. **Tmux is the right substrate, not a constraint.** The honest alternative (node-pty headless) deletes the human-debug affordance — humans currently `tmux attach` to watch a flaky run. Keep tmux; encode the brittleness fixes in a typed Driver SDK. Node-pty becomes a future option for CI smoke (D-008 stretch), not a v1 replacement.
2. **D-006 closed during research, not during implementation.** Subagent 3 read pi-mono source: `setStatus(key, "")` does NOT clear — it stores `""`. Only `undefined` clears. Scratch's `index.ts:98` has the bug today. This plan lands the one-line fix.
3. **The validator IS extension #2 in the velocity log.** AC-15's compounding hypothesis is explicitly deferred to extension #3 retrospective because ratios need ≥2 data points. This plan produces the second data point.

---

## Clarifications

### Session 2026-05-10

| # | Question | Answer | Affected sections |
|---|----------|--------|-------------------|
| Q1 | Workflow Mode | **Simple** — rubber-stamped from `--simple` flag in `/plan-1b` | Spec header |
| Q2 | Testing Strategy | **Hybrid** — Full TDD for SDK primitives + orchestration; Lightweight for agent pack; Manual for validator pilot | New § Testing Strategy |
| Q3 | Mock Usage | **Targeted** — mock `node:child_process` for SDK unit tests only; integration tests use live tmux against `bash`; pilot uses real `pi` | § Testing Strategy |
| Q4 | Documentation Strategy | **Hybrid** — README § Status + new `docs/how/agent-feedback.md` for the magic-wand loop; standard pattern files (difficulties, velocity, retros) get conventional updates | New § Documentation Strategy |
| Q5 | Agent Harness Readiness | **Extend Interact + History** — `docs/project-rules/harness.md` gets a § Driver SDK paragraph in Interact; History row appended; maturity bumps L2 → L2.5 | § Goals (implicit); implementation task lands the edit |
| Q6 | Validator slug install | **Local-only pack** at `agents/extension-validator/` for v1; minih registry publish deferred to a second-pilot decision | AC-08 wording |
| Q7 | AC-09 scope (rubber-stamped from spec proposal) | A single human-driven validator invocation against scratch suffices | AC-09 (no wording change) |
| Q8 | Workshops 002/003 (rubber-stamped from spec proposal) | Skip both for v1; transcribe pattern from `agents/code-review-companion/`; revisit only if validator-pack design proves contentious | § Workshop Opportunities (no change) |

**Domain Review**: skipped — pij has no formal `docs/domains/` registry. Informal `harness` / `extensions` / `agents` namespaces from § Target Domains accepted as-is.

---

## Summary

Build a **typed tmux Driver SDK** at `harness/driver/` and a **`extension-validator` minih agent slug** so future agents can pilot `pi` inside tmux to validate extensions end-to-end without rediscovering tmux primitives. The first agent run validates `scratch` (the only kept extension) and produces the first **magic-wand wish list** — feedback that becomes harness recipe improvements for the next extension.

This plan turns "the harness drives tmux" from a tribal recipe scattered across one ~110-line script into a typed, tested, paste-ready module that every future caller (smoke runner, validator agent, ad-hoc human REPL) shares. The harness-is-the-product loop closes: agent runs → finds friction → human encodes fix → next agent run is faster.

## Goals

- Encode all 12 tmux gotchas (TC-01..TC-12 from the dossier) in `harness/driver/` so no future caller has to rediscover them.
- Make `extension-validator` an installable minih agent that any pi-extension repo can spawn to validate its extension.
- Produce the second real-extension velocity data point in `docs/velocity.md`, unblocking AC-15's compounding judgment for extension #3.
- Capture the validator's first magic-wand wishes — observations like "I wish the driver had `assertStatusPill(key, regex)`" — and curate them into the harness recipes (template / lint / SDK helpers).
- Close D-014 (smoke shell-quoting) and D-006 (`setStatus("")` semantics) by encoding the fixes in this plan.
- Provide evidence for D-005 (does `customType` survive `/compact`?) by running scratch's existing smoke scenario unattended.
- Keep the tmux substrate visible: humans can still `tmux attach` to a validator run for debugging.

## Non-Goals

- **node-pty headless path.** Defers to D-008 stretch; not v1.
- **CI smoke integration.** Smoke remains local-only per harness.md and D-008. The validator runs locally for v1.
- **Companion-mode validator** (`extension-validator-companion`). One-shot only for v1; companion variant earns its keep on a second pilot or comes after.
- **Automated curator pipeline.** Magic-wand wishes flow into `docs/retros/extension-validator.md` via minih auto-harvest; humans curate manually for v1. Wiring an automated wish→difficulty pipeline is workshop 003 territory.
- **Multi-extension orchestration.** The validator runs against one extension per invocation. Batch validation comes later.
- **Speculative pre-compaction snapshot fallback** for D-005 (T008 in plan 003). Only ships if D-005 is falsified by the validator's `/compact` step.
- **Workshops 002 (validator agent prompt) and 003 (magic-wand envelope).** Optional — see Workshop Opportunities. The plan can ship the agent slug without a dedicated workshop, using the structure already validated by `agents/code-review-companion/`.

## Target Domains

pij has no formal `docs/domains/` registry. The relevant boundary is **harness ↔ extension ↔ agents** — three informal namespaces.

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| harness | existing (informal) | **modify** | Add `harness/driver/` module; rewrite `harness/scripts/smoke.ts` as adapter |
| extensions | existing (informal) | **modify** | Rewrite `.pi/extensions/scratch/smoke.ts` to new `Scenario`/`Step` shape; fix `setStatus(undefined)` (D-006) |
| agents | existing (informal) | **modify** | Add `agents/extension-validator/` minih pack (`agent.json` + `prompt.md` + schemas) |

No new formal domains. If `docs/domains/` is established later (deferred until ≥3 stable extensions per plan 002), the Driver SDK becomes a candidate for a `harness` domain extraction.

## Complexity

**Score**: CS-2 (small) · S=1, I=1, D=0, N=1, F=0, T=1 → P=4 · Confidence 0.80

**Breakdown**:
- **Surface Area (S=1)**: Multiple files across three informal namespaces (`harness/driver/*` × 5 + `agents/extension-validator/*` × 4 + scratch fixes + smoke adapter). Bounded by workshop 001's locked module layout.
- **Integration (I=1)**: One external — the trio of `tmux` + `pi` + `minih`. None of these change in this plan; we wrap them.
- **Data/State (D=0)**: No schemas, no migrations. JSON `Scenario` shape is locked in workshop 001.
- **Novelty (N=1)**: Driver SDK is paste-ready (workshop 001). Validator-agent pilot is novel for pij — no prior agent has piloted pi in tmux for validation.
- **Non-Functional (F=0)**: Local-only, no compliance gates, no perf targets.
- **Testing/Rollout (T=1)**: Unit (mocked `execFileSync`) + integration (live tmux against `bash`) + end-to-end (validator pilot against real `pi` for scratch). Hybrid testing — see Clarifications.

**Confidence**: 0.80. Workshop 001 locks the SDK. The wildcard is the validator agent pilot — unknown until it actually runs.

**Assumptions**:
- minih is installed and operational (validated during scratch via `code-review-companion`).
- `tmux ≥ 3.0` and `pi` are on PATH locally.
- The pi rendering surface (PR-01..PR-10 in dossier) doesn't shift between scratch's smoke today and the validator's run tomorrow.

**Dependencies**:
- minih runtime — already installed at `/Users/jordanknight/.npm-global/bin/minih`.
- pi binary — already on PATH.
- Local tmux — confirmed (we run inside tmux right now).

**Risks**: see § Risks & Assumptions.

**Phases**: Single phase (Simple Mode). Task ordering: (1) SDK module + tests; (2) smoke adapter + scratch scenario rewrite; (3) D-006 fix in scratch; (4) `extension-validator` agent pack; (5) validator pilot run + retrospective harvest; (6) ledger updates (difficulties, velocity, README, harness.md).

## Testing Strategy

**Approach**: Hybrid (per Clarify Q2)
**Mock policy**: Targeted — mock `node:child_process` for SDK unit tests only (per Clarify Q3)

| Layer | Approach | Mock policy | Where it lives |
|-------|----------|-------------|----------------|
| SDK primitives (`tmux.ts`) | Full TDD | Mock `node:child_process` to assert argv shape | `harness/driver.test.ts` |
| SDK orchestration (`session.ts`, `index.ts`) | Full TDD | Mock `node:child_process` for `waitIdle` / `run` flows | `harness/driver.test.ts` |
| SDK integration (composition) | Lightweight | **No mocks** — live tmux against `bash` (env-gated `PIJ_DRIVER_IT=1`) | `harness/driver.it.test.ts` |
| Smoke adapter (`harness/scripts/smoke.ts`) | Lightweight | Inherits real tmux + real pi | Existing `npm run smoke` path |
| Validator agent pack (`agents/extension-validator/`) | Lightweight | minih validates input/output JSON via schemas | minih runtime |
| End-to-end validator pilot | Manual | None — real `pi`, real tmux, real scratch extension | One human-driven invocation (AC-09) |

**Rationale**: The dossier (TC-01..TC-12) and workshop 001 settled this. The SDK is unit-testable iff `execFileSync` is mockable — argv-shape correctness is the load-bearing assertion for primitives. Live-tmux integration tests cover composition behavior (`waitIdle`, `run`) against `bash` (deterministic, no API key). The validator pilot is the load-bearing acceptance test against real `pi`.

**Focus areas**:
- Argv-shape correctness for every primitive (covers TC-01..TC-12)
- `Session.run()` retry-until-match-or-timeout behavior with bounded scrollback
- `DriverAssertionError` payload completeness on failure (step, expected, actual, scrollback, status, priorSteps, durationMs)
- Scenario shape guard (`isScenario`) rejects malformed exports
- `preflight()` behavior when tmux or pi is missing

**Excluded** (per § Non-Goals):
- CI-runnable smoke tests (D-008 stretch — node-pty path)
- Auto-running validator pilots in CI
- Mocked-pi rendering for headless tests (would couple SDK to a terminal emulator)

## Documentation Strategy

**Approach**: Hybrid — README + `docs/how/` (per Clarify Q4)

| File | Action | Why |
|------|--------|-----|
| `README.md` § Status | Update — note v0.3 ships Driver SDK + `extension-validator` agent | Discoverability for new contributors |
| `docs/project-rules/harness.md` | Extend § Interact (Driver SDK paragraph); append History row; maturity L2 → L2.5 | BIO contract reflects new agent-callable Interact layer (Clarify Q5) |
| `docs/how/agent-feedback.md` | **NEW** — describes magic-wand loop, retro envelope shape, curator gate | First-class docs for the agent feedback loop; humans curating wishes need a single page |
| `docs/difficulties.md` | D-006, D-014 status updates; D-005 status based on pilot outcome; possibly new MH-NNN rows from validator retrospective | Standard ledger maintenance |
| `docs/velocity.md` | Row 7 — first green validator pilot wall-clock | Standard velocity log update; AC-11 |
| `docs/retros/extension-validator.md` | **NEW** — auto-harvested by minih on validator run | Retros home; one entry per pilot |

**Rationale**: The magic-wand loop is novel for pij — humans curating wishes need a dedicated page that explains the envelope shape, the curator gate, and the difficulty-row promotion path. Other doc updates are conventional pattern files.

**Excluded**:
- Inline JSDoc on every SDK function — TS types + workshop 001 cross-references suffice
- Standalone API reference — workshop 001 is the API reference
- ADR for the SDK design — workshop 001 already records the decisions and rejected alternatives

## Acceptance Criteria

Each criterion is observable, testable, and either passes or fails.

1. **AC-01 — SDK module compiles.** `harness/driver/{tmux,session,errors,index,run}.ts` exist; `npm run typecheck` and `npm run lint` pass with zero errors. Files transcribe from workshop 001 § Module sections.

2. **AC-02 — Unit tests pass.** A test file (`harness/driver.test.ts`) using `vi.mock("node:child_process")` asserts that primitives emit the correct argv to tmux. ≥10 tests covering `boot` / `type` / `press` / `paste` / `capture` / `inspect`. `npm run test` exits 0.

3. **AC-03 — Smoke adapter works.** `harness/scripts/smoke.ts` is rewritten as an adapter over `runScenario()` and is ≤40 lines (down from 113). `npm run smoke -- scratch` against scratch's rewritten `smoke.ts` exits 0 against real `pi`. (Local-only execution; not a CI gate.)

4. **AC-04 — Scratch scenario uses new shape.** `.pi/extensions/scratch/smoke.ts` exports a `Scenario` typed via `harness/driver/index.ts`. All steps use the discriminated `Step` union (`type` / `wait` / `paste` / `press` / `sleep` / `capture`). The fixed 30-second `delay` after `/compact` is replaced with a `wait` step that polls until idle.

5. **AC-05 — D-006 fix lands.** `.pi/extensions/scratch/index.ts` calls `setStatus("scratch", undefined)` (not `""`) when the count is zero, with a comment citing pi-mono `footer-data-provider.ts:132-138`. `docs/difficulties.md` D-006 status updated to `encoded`.

6. **AC-06 — D-014 closed.** SDK uses `execFileSync("tmux", argv)` exclusively; no `args.join(" ")` shell strings remain in `harness/`. `docs/difficulties.md` D-014 status updated to `encoded`.

7. **AC-07 — Agent CLI runs.** `harness/driver/run.ts` accepts a JSON scenario via `--scenario <path>` or `--stdin` and prints a JSON `RunReport` to stdout. Manual invocation against scratch's scenario JSON exits 0.

8. **AC-08 — Validator agent pack installed locally.** `agents/extension-validator/` contains `agent.json`, `prompt.md`, `instructions.md`, `input-schema.json`, `output-schema.json` — same structure as `agents/code-review-companion/`. Local invocation via `minih run extension-validator` (or equivalent) succeeds. minih registry publish is **deferred** to a second-pilot decision (per Clarify Q6).

9. **AC-09 — Validator pilots scratch.** A single human-driven invocation of `extension-validator` against scratch produces a `report.json` with `summary.passed: <int>`, `summary.failed: <int>`, and a non-empty `retrospective.magicWand` field with `magicWandTarget: "project"`. The validator drives all of scratch's existing smoke steps (including `/compact`) without human input.

10. **AC-10 — D-005 evidence captured.** The validator pilot's `/scratch list` step **after** `/compact` is observable in the `RunReport`. If the assertion passes, `docs/difficulties.md` D-005 status updated to `encoded`. If it fails, an explicit follow-on task (T008 snapshot fallback) is filed and the status stays `open`.

11. **AC-11 — Velocity data point logged.** `docs/velocity.md` row 7 records: time from this spec being accepted (T0) to first green validator run (T1), with absolute wall-clock. No ratio claimed (per AC-15 deferred-to-ext-#3 rule from plan 003).

12. **AC-12 — Magic-wand wishes harvested.** `docs/retros/extension-validator.md` (or equivalent minih auto-harvest target) contains the validator's retrospective. At least one wish is curated into a follow-up: a difficulty row, a future SDK enhancement, or an explicit "no action — already covered" disposition.

13. **AC-13 — Tmux remains attachable.** During or after a validator run, a human can `tmux attach -t pij-<scenario>-<pid>` and observe the rendered pi state (or its post-mortem if the validator already tore down). Confirmed manually once.

## Risks & Assumptions

### Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|------------|
| R-1 | Driver SDK abstractions don't fit the validator's actual needs (gap discovered at pilot time) | Medium | Medium | Magic-wand wishes are the surface for this — log and triage. AC-12 explicitly targets this loop. |
| R-2 | Validator agent struggles to author scenarios autonomously (e.g., picks the wrong regex) | Medium | Low | For v1, the human supplies the scenario JSON via `--param`. Scenario authoring autonomy is workshop 002 territory. |
| R-3 | D-005 falsifies — `customType` does NOT survive `/compact` | Low–Medium | High | T008 snapshot fallback (plan 003) is dormant but designed; if R-3 hits, file a follow-on task and ship the fallback as a separate dossier item. Does NOT block this plan from landing the SDK + validator. |
| R-4 | tmux or pi version drift between research time and pilot time | Low | Medium | `preflight()` in the SDK reports `tmux -V` and `pi --version` in every run. If versions drift materially, the report flags it. |
| R-5 | `/compact` takes >60s in some environments, breaking the new `wait` step | Low | Low | `wait.timeoutMs` is configurable per scenario. Bump to 120s if observed. |
| R-6 | minih `inside-state.json` schema gap (D-017) bites the validator | Low | Low | Already encoded mitigation: validator uses inbox messages for status, not state transitions (same workaround as code-review-companion). |
| R-7 | Workshop 002/003 scope creep — "specify the validator first" pulls the plan out of Simple Mode | Medium | Low | Use `agents/code-review-companion/` as the structural template. Workshops 002/003 stay optional. |

### Assumptions

- Workshop 001 stands as locked design; no SDK-shape rework during implementation.
- Scratch's existing smoke scenario (5 steps including `/compact`) is the right validator pilot target.
- "Magic-wand wishes" are useful even when there's only one validator run; the loop earns the second extension's worth of validation.
- The user is OK with manual curation of retros for v1 (no automated wish→difficulty pipeline).
- Local-only smoke remains acceptable through this plan — CI smoke (D-008) is a separate stretch.

## Open Questions

All clarifications from `/plan-2-v2-clarify` are resolved (see § Clarifications). No critical `[NEEDS CLARIFICATION]` markers remain.

Items deferred to future plans (not blockers for this one):

- **AC-15 compounding ratio** — still deferred to extension #3 retrospective (per plan 003 Clarify Q3). This plan produces the second data point but does not compute the ratio.
- **Workshops 002 (validator agent prompt + schemas) and 003 (magic-wand envelope)** — deferred unless validator-pack design proves contentious during `/plan-3` or `/plan-6`.
- **Companion-mode validator slug** (`extension-validator-companion`) — deferred to v2 if one-shot proves insufficient after the first pilot.
- **Automated wish→difficulty curator pipeline** — deferred. Humans curate retros manually for v1; promotion to D-NNN rows is a manual step described in `docs/how/agent-feedback.md`.
- **minih registry publish for `extension-validator` slug** — deferred per Clarify Q6 until a second pilot stabilizes the slug shape.
- **node-pty headless path / CI smoke** — deferred per § Non-Goals; tracked as D-008 stretch.

## Workshop Opportunities

Workshop 001 is **complete** and authoritative. Two more workshops are *optional*; the plan can ship without them by transcribing from existing siblings.

| Topic | Type | Status | Why Workshop | Key Questions |
|-------|------|--------|--------------|---------------|
| Driver SDK API surface | API Contract | ✅ **Complete** ([001-driver-sdk-api-surface.md](./workshops/001-driver-sdk-api-surface.md)) | Locked — paste-ready code for `harness/driver/`. Implementation Ready proof level. | n/a |
| Validator agent prompt + schemas | CLI Flow | Not started (optional) | Codify the `extension-validator` agent slug shape: `agent.json`, `prompt.md`, `input-schema.json`, `output-schema.json`. Could transcribe from `agents/code-review-companion/` if the design is uncontentious. | What params does input-schema accept? What fields does output-schema require? Is it one-shot only or does companion-mode get a sibling slug too? |
| Magic-wand farewell envelope | Integration Pattern | Not started (optional) | Codify how validator wishes flow back to humans: schema, curator gate, mapping wish → difficulty row. minih's auto-harvest already handles most of this. | What's the canonical envelope JSON? What's the curator SLA? Do wishes auto-create D-NNN rows or require human signoff? |

**Recommendation**: Skip workshops 002 + 003 for v1. Use sibling code-review-companion as the template; capture any drift in difficulty rows. If the validator pilot reveals contentious decisions, run the workshops before extension #2's validator run.

---

## Next Steps

1. ✅ `/plan-2-v2-clarify` — done 2026-05-10 (8 answers; all rubber-stamped at Recommended; Domain Review skipped — no formal registry).
2. **Next**: `/plan-3-v2-architect` to generate the implementation plan with task table. Workshop 001 is authoritative — most SDK tasks transcribe from it; the validator-agent tasks transcribe from `agents/code-review-companion/`.
3. Run `/plan-4-v2-complete-the-plan` for the readiness gate, then `/validate-v2` for thesis-aware review.
4. Run `/plan-6-v2-implement-phase-companion` to ship with parallel companion review (mirrors plan 003's pattern).
