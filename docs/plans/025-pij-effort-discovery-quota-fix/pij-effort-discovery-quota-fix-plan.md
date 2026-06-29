# pij Thinking-Levels, Model Discovery & Quota-Classifier Honesty

**Mode**: Full
**Plan Version**: 1.0.0
**Created**: 2026-06-29
**Status**: READY
**Spec source**: unified (this file)

## Business Specification

### Summary
A batch of pij control-plane fixes + enhancements that share one thesis: **pij should only assert what a live source corroborates.** Three faces of that: (a) a death notice must not fabricate a `quota` reason from ambient pane scrollback; (b) `pij models` must name the thinking-levels a model actually supports, sourced from real per-model data; (c) `pij spawn` must let a caller set an effort level per-harness, defaulting to the agent's own choice when unset. Plus a small flow-pair skill correction (truly-lazy reviewer creation) that stops idle peers burning cache tokens.

### Goals
- Stop the false `💀 … reason: quota … will not recover` notices that fire on genuinely-dead **or** stale-idle sessions whose scrollback merely contains billing-domain words.
- Make per-model thinking/effort levels first-class and discoverable via `pij models [--json]`.
- Let `pij spawn --effort <level>` set the level per-harness, emitting nothing (agent default) when unset.
- Make `pij models`' codex rows reflect what codex will actually run (read the configured default model), not a stale alias snapshot.
- Strengthen the flow-pair skill to mandate lazy reviewer creation.

### Non-Goals
- Codex daemon **transport** defects (trust-prompt auto-dismiss, send-keys not landing in codex TUI, zero event capture) reported by peer `pij-5vzfe7` on codex v0.142.3 — real, but a **separate workstream** (plan-022 lineage). Recorded in Open Questions; not fixed here.
- A live codex model registry (codex exposes none) — codex levels/models stay a curated/config-read best-effort.
- Changing how pi itself computes effort; pij only *selects* a level the harness already understands.

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| pij-control-plane | existing | **modify** | Daemon death-reason classifier honesty; model-registry discovery (reasoning/levels + codex config-read); `pij spawn --effort` per-harness translation |
| flow-pair | existing | **modify** | Skill doc: mandate truly-lazy reviewer creation |

### Testing Strategy
**Approach**: Full TDD (this repo's house style; Dim-0 mutation discipline). The classifier change (Phase 1) MUST be pinned by a mutation-provable test — a false-`quota` assertion that flips RED against the old over-broad regex. **Excluded**: the flow-pair skill doc edit (Phase 3) is prose; validated by re-install, not unit tests.

### Mock Usage
Avoid mocks — the core is pure functions over real fixtures (pane strings, parsed config); the daemon uses the existing in-memory port fakes.

### Documentation Strategy
No new docs (internal). Domain history notes updated inline where the existing plan-024 docs already live.

### Complexity
- **Score**: CS-3 (medium)
- **Breakdown**: S=2, I=1, D=0, N=1, F=0, T=2
- **Confidence**: 0.80
- **Assumptions**: pi `~/.pi/agent/models.json` `thinkingLevelMap` is the per-model level source; codex levels are curated + config-default read.
- **Dependencies**: none external; harness CLIs already expose the flags (claude `--effort`, copilot `--reasoning-effort`, codex `-c model_reasoning_effort`).
- **Risks**: tightening the quota regex could under-report a *real* quota death (the thesis anti-goal) — mitigated by keeping a real-error signal match + transient-vs-terminal split.

### Acceptance Criteria
- **AC-01** — A genuinely-dead OR stale-idle session whose scrollback contains bare billing-domain words (`billing`/`credit`/`balance`/`insufficient`) but no real provider quota/billing *error* is classified `unknown`, not `quota`; no false `💀 reason: quota` (dead branch) and no false `⚠️` peek (provider-failure branch).
- **AC-02** — `TERMINAL_QUOTA_RE` matches only a genuine provider quota/billing *error* shape, not bare domain vocabulary; transient signals (`429`/`overloaded`/`529`/`resource_exhausted`) still → `unknown` (plan-024 behaviour preserved). A mutation re-broadening the regex flips a test RED.
- **AC-03** — `pij models --json` lists, per model, `reasoning` + supported `levels` (from pi `thinkingLevelMap`; curated table for codex); codex rows include the config-default model read from `~/.codex/config.toml` (e.g. `gpt-5.5`), not just the stale `gpt-4o`/`o1`/`o3` snapshot.
- **AC-04** — `pij spawn --effort <level>` emits the per-harness flag (claude `--effort`, copilot `--reasoning-effort`, codex `-c model_reasoning_effort=<v>`, pi `:<v>` model suffix), validated warn-don't-block against the model's `levels`; **omitted ⇒ no flag emitted** (agent boot default preserved).
- **AC-05** — The repo flow-pair skill mandates lazy reviewer creation (spawned only at first `REVIEW`, never alongside the coder), AND reframes worker monitoring around the **daemon's push model** (dispatch → do independent prep → let the daemon's done-report / `stalled` / `dead` push re-invoke you; do not poll `pij state` in a loop — caveat: a broken-transport peer like codex v0.142.3 that can't deliver its report still needs a spot-check). Re-installed via `just flow-pair-install`.

### Risks & Assumptions
Covered in Complexity. Headline risk = AC-01/02 over-correction (hiding a real death) — gate it with TDD + the transient/terminal split.

### Open Questions
- Codex daemon transport defects (peer `pij-5vzfe7`, codex v0.142.3): `pij send` reports delivered but text never lands in codex TUI; zero events captured (`pij tail`/`state` empty); folder-trust now auto-handled ✅. **Reproduced live during this run** (the codex reviewer canary failed → fell back to pi+glm-5.2; logged in `.flow-pair/runs/.../codex-comms-failure.md`). → **Track as a separate plan**; out of scope here.
  - **Root-cause lead** (peer `pij-5vzfe7`, repro pij-ebo7fo): the bind/phonehome path is keyed on `CLAUDE_CODE_SESSION_ID` (claude-specific, **unset for a codex peer**) → it "looks the wrong way" and never binds (descriptor stays `lifecycle:pending`, events.ndjson empty). Codex DOES write rollout transcripts (`transcriptsAtSpawn` correctly lists `~/.codex/sessions/.../rollout-*.jsonl`), so deterministic discovery should bind by diffing a NEW codex rollout post-spawn instead of the claude env var. Possibly compounded by a `flowspace` MCP handshake failure in the codex pane (zero events). Workaround that works: direct `tmux send-keys -l <text>` + Enter + `capture-pane` (codex replies fine; gpt-5.5 under codex is healthy, no 400).

### Workshop Opportunities
None — design is settled by the POC + the live diagnosis.

### Clarifications
#### Session 2026-06-29
- Mode/Testing/Mocks/Docs set by inferred defaults under the user's explicit "KISS, don't overbake": Full(lean, 3 phases for distinct tracking) · TDD · avoid mocks · no new docs.
- Sequencing: user chose "finish plan, implement #5 (quota classifier) first."
- codex levels source: curated static table (user decision from the thinking-level POC).

## Planning Seam
_Refinement opportunities still open — recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: none — all resolved.

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| research-dossier.md | n | superseded by the in-session thinking-level POC + live quota-bug diagnosis |
| workshops/*.md | n | none |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | No critical NEEDS-CLARIFICATION markers |
| G2 | Constitution | N/A | No `docs/project-rules/constitution.md` |
| G3 | Architecture | N/A | No `docs/project-rules/architecture.md` |
| G4 | ADR Compliance | N/A | No accepted ADRs contradicted |
| G5 | Structure | PASS | All required sections present |
| G6 | Testing Alignment | PASS | TDD: test tasks precede impl in each phase; ACs measurable |
| G7 | Domain Completeness | PASS | Both domains existing; manifest covers all referenced files |

### Summary
Phase 1 fixes the live false-quota bug by making both daemon death-classification paths (dead branch + provider-failure peek) stop asserting `quota` off bare scrollback vocabulary, tightening the terminal-quota signal, pinned by a mutation-proof test. Phase 2 makes thinking-levels first-class: `ModelEntry` gains `reasoning`+`levels`, sourced from pi's `thinkingLevelMap` and a curated/config-read codex table, surfaced in `pij models --json`, and consumed by a new `pij spawn --effort` that translates per-harness and no-ops when unset. Phase 3 is the small flow-pair skill correction + re-install.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `.pi/extensions/pij/core/state.ts` | pij-control-plane | internal | Quota classifier (`TERMINAL_QUOTA_RE`/`classifyDeathReason`) |
| `.pi/extensions/pij/daemon.ts` | pij-control-plane | internal | Dead branch + provider-failure peek emission |
| `.pi/extensions/pij/core/models/registry.ts` | pij-control-plane | internal | `ModelEntry` + reasoning/levels + codex config-read |
| `.pi/extensions/pij/core/models/validate.ts` | pij-control-plane | internal | Effort-level validation (warn-don't-block) |
| `.pi/extensions/pij/core/spawn.ts` | pij-control-plane | contract | `parseSpawnArgs` `--effort` + `buildControlSpawnCommand` translation |
| `.pi/extensions/pij/cli.ts` | pij-control-plane | internal | `loadModels()` codex config-read; `pij models` surface; spawn wiring |
| `.pi/extensions/pij/core/cli.ts` | pij-control-plane | internal | `pij models` table render — the `thinking` column lives in this dispatch (added per review D1) |
| `skills/flow-pair/SKILL.md` | flow-pair | contract | Lazy-reviewer mandate |

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | Dead branch (`daemon.ts` `pushWholeLifeTransition`) classifies `quota` off full scrollback and emits authoritative `💀 will not recover`; plan-024 only fixed the peek path. `osk-split-billing` scrollback trips it. | Phase 1: both paths must not assert `quota` from bare domain words |
| 02 | High | `TERMINAL_QUOTA_RE` matches bare `credit\|balance\|billing\|insufficient` anywhere — common domain vocabulary. | Phase 1: require a real provider quota/billing-error shape |
| 03 | High | pi `models.json` already carries per-model `reasoning`+`thinkingLevelMap`; `registry.ts` reads the file but drops both fields. | Phase 2: surface them (zero new I/O for pi rows) |
| 04 | Medium | codex exposes no model-registry CLI; default model lives in `~/.codex/config.toml` (`model = "gpt-5.5"`, confirmed served). | Phase 2: config-read default + thin curated fallback |

### Phases

#### Phase Index

| Phase | Title | Primary Domain | Objective (1 line) | Depends On |
|-------|-------|---------------|-------------------|------------|
| 1 | Quota-classifier honesty (#5) | pij-control-plane | Stop false `quota` death-reason from scrollback in both daemon paths | None |
| 2 | Thinking-levels: discovery + spawn --effort (#1–#3) | pij-control-plane | Per-model levels in `pij models`; `pij spawn --effort` per-harness; codex config-read | None (independent of P1) |
| 3 | flow-pair lazy reviewer (#4) | flow-pair | Mandate lazy reviewer creation + re-install | None |

#### Phase 1: Quota-classifier honesty (#5)
**Objective**: A death/peek never reports `quota` unless a genuine provider quota/billing error is present — not bare domain vocabulary.
**Domain**: pij-control-plane
**Delivers**:
- Tightened `TERMINAL_QUOTA_RE` (real error frame, not bare words) in `core/state.ts`.
- Both daemon paths (dead branch `pushWholeLifeTransition` daemon.ts:143-147 + peek `pushProviderFailure` daemon.ts:205) no longer assert a confident `quota` off ambient scrollback.
- Mutation-proof tests: a billing-domain scrollback → `unknown`; a real quota error → `quota`.

**The discriminator (the load-bearing spec — derived from existing fixtures).** The repo ALREADY decided some bare-word strings are terminal quota — these MUST stay green (`death-reason.test.ts:96-110`, locked by the FIX-B mutation guard at :95):
- `"Error: prepaid credit balance exhausted — add credits…"` → `quota`
- `"Error: payAsYouGo balance insufficient — top up…"` → `quota`
- `"API Error: 402 insufficient credits"` → `quota`

So the fix is NOT "remove the bare words" — it is "require them inside a real error frame." Rule: bare `billing` / `credit` / `balance` ALONE never matches; a match requires either an **error frame** (`Error:` / HTTP `402` / `exhausted` / `top up` / `add credits`) OR an **anchored phrase** (`insufficient\s+(credit|funds|balance|quota)`, `balance\s+insufficient`, `quota.*exceeded`). This keeps the three fixtures above AND rejects domain prose (`split billing`, `credit memo`, `insufficient line items` — note `"insufficient line items"` ≠ `"insufficient credits"`).

**Depends on**: None
**Key risks**: Over-correction hiding a real quota death (thesis anti-goal) — mitigated by the discriminator above (keeps the named fixtures) + the transient/terminal split. Residual risk (F3): full-scrollback classification can still match a real error string present for a NON-death reason (a billing repo printing `402 insufficient credits` in its own code) — see task 1.6.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1.1 | RED test: billing-domain prose (`split billing`, `credit memo`, `insufficient line items`) → `classifyDeathReason` returns `unknown` | pij-control-plane | New `state.test.ts` case fails against current regex | Per finding 01/02 |
| 1.2 | RED test: dead branch with billing-prose scrollback emits `reason: unknown`, not `quota` | pij-control-plane | `daemon` test fails against current dead branch | Per finding 01 |
| 1.2b | RED test: **peek** branch (`pushProviderFailure`) on a stale-idle pid-alive session with billing-prose scrollback → NO `provider-failure` push / no ⚠️ | pij-control-plane | `daemon-push` test fails against current peek | AC-01 covers BOTH paths (validation F4) |
| 1.3 | Tighten `TERMINAL_QUOTA_RE` per the discriminator above (error-frame/anchored-phrase, never bare words); keep transient split | pij-control-plane | 1.1/1.2/1.2b GREEN | |
| 1.4 | **Keep the named fixtures green**: `death-reason.test.ts:96-110` (prepaid/payAsYouGo/`402 insufficient credits`) still → `quota`; transient (529/429/overloaded/resource_exhausted) → `unknown` | pij-control-plane | All prior `death-reason`/`state` tests pass; the three fixtures explicitly re-asserted | Validation F1/F2 |
| 1.5 | Mutation check: re-broaden regex to bare words → a Phase-1 reject test flips RED; AND narrow off a named fixture → its keep test flips RED (pincer proven both ways) | pij-control-plane | `just flow-pair-mutate` shows RED both directions | Dim-0 gate |
| 1.6 | Reduce residual false-positive (F3): scope classification to the pane **tail** (last error region) and/or decouple authoritative is-dead (from pid) from low-confidence `reason` so the dead branch defaults to `dead`/`unknown` unless a high-confidence terminal error is in the final lines | pij-control-plane | A billing-repo pane with `402 insufficient credits` HIGHER in scrollback (not the tail) → not `quota`; `[exited]` clean death no longer mislabeled (quota-before-DEAD_RE ordering addressed) | Validation F3 (design call — confirm tail-scope vs decouple at impl) |

#### Phase 2: Thinking-levels — discovery + spawn --effort (#1–#3)
**Objective**: Per-model thinking-levels are discoverable and settable, defaulting to the agent's choice when unset.
**Domain**: pij-control-plane
**Delivers**:
- `ModelEntry` gains `reasoning: boolean` + `levels: string[]`.
- `parseModelsJson` keeps `reasoning`/`thinkingLevelMap` → `levels`; codex curated table + `~/.codex/config.toml` default-model read.
- `pij models --json` surfaces them (+ a `thinking` column in the table).
- `pij spawn --effort <level>`: validated warn-don't-block; per-harness translation; no-op when unset.
**Depends on**: None
**Key risks**: Per-harness flag drift — pin each translation with a test.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.1 | RED tests: `ModelEntry.reasoning/levels` populated from a `thinkingLevelMap` fixture; codex config-read yields the default model entry | pij-control-plane | `registry.test.ts` fails pre-impl | Per finding 03/04 |
| 2.2 | Extend `ModelEntry` + `parseModelsJson` (levels from non-null `thinkingLevelMap`); add `codexConfigModels(tomlText)` + trim `codexSnapshot` to thin fallback | pij-control-plane | 2.1 GREEN | |
| 2.3 | Wire `loadModels()` to read `~/.codex/config.toml` (best-effort, empty on error) and merge codex config entries ahead of snapshot | pij-control-plane | `pij models` shows gpt-5.5 under codex | |
| 2.4 | Surface `reasoning`/`levels` in `pij models` table + `--json` | pij-control-plane | `--json` carries the fields; table shows a `thinking` column | |
| 2.5 | RED tests for `parseSpawnArgs --effort` + per-harness translation (claude/copilot/codex/pi) incl. unset → no flag | pij-control-plane | spawn tests fail pre-impl | AC-04 |
| 2.6 | Implement `--effort` parse + `buildControlSpawnCommand`/pi-path translation; validate warn-don't-block vs `levels` | pij-control-plane | 2.5 GREEN; unset emits nothing | |

#### Phase 3: flow-pair lazy reviewer (#4)
**Objective**: The skill mandates truly-lazy reviewer creation AND reframes monitoring around the daemon's push model, so idle peers don't burn cache tokens and the orchestrator doesn't poll.
**Domain**: flow-pair
**Delivers**: Skill-doc wording (two notes) + re-install.
**Depends on**: None
**Key risks**: None.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 3.1 | Strengthen `skills/flow-pair/SKILL.md` Fleet lifecycle: reviewer spawned ONLY at first `REVIEW`, never alongside the coder; state the cache-token cost of an idle peer | flow-pair | Wording explicit + imperative | AC-05 |
| 3.1b | Reframe the "confirm flips to working within ~10s / nudge if idle" guidance around the **daemon push model**: after dispatch, do independent prep and let the daemon's done-report / `stalled` / `dead` push re-invoke you — do NOT poll `pij state` in a loop. Caveat: a broken-transport peer (codex v0.142.3 — send doesn't land, no events) won't deliver its report, so it still needs a periodic spot-check. | flow-pair | The polling-nudge line is replaced/augmented; push-first wording explicit | AC-05; from live dogfood (codex comms failure + over-polling) |
| 3.2 | Re-install via `just flow-pair-install` | flow-pair | Skill present for all agents | |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01 | 1.1, 1.2, 1.2b, 1.3, 1.6 | billing-prose → unknown on BOTH dead + peek paths (state + daemon + daemon-push tests) |
| AC-02 | 1.3, 1.4, 1.5 | discriminator keeps `death-reason.test.ts:96-110` fixtures green; transient/terminal split preserved; mutation RED both directions |
| AC-03 | 2.1, 2.2, 2.3, 2.4 | `pij models --json` reasoning/levels + codex config-default |
| AC-04 | 2.5, 2.6 | per-harness translation + unset-no-flag tests |
| AC-05 | 3.1, 3.2 | skill wording + re-install |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Tightened regex hides a real quota death | Low | High | Keep genuine-error match + transient/terminal split; TDD both directions |
| Per-harness effort flag wrong | Low | Medium | One translation test per harness |
| codex config parse brittle | Low | Low | Minimal `model = "…"` line parse; empty on any error (graceful) |
