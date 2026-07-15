# Focus Agents — `pij focus save/list/launch`
**Mode**: Simple
**Plan Version**: 1.0.1 — validate-v2 findings folded in (HIGH: pi transcript-locator task added; MEDIUM: supportsBranching scope narrowed)
**Created**: 2026-07-15
**Status**: READY
**Spec source**: unified (this file)

## Business Specification

### Research Context
📚 Grounded in the s050 Phase-1 experiments (`experiments/00-forkability-matrix.md` + `pi/claude/copilot/codex-findings.md` — all four harnesses live-proven FORKABLE) and two codebase-integration scouts (CLI wiring + risk seams). Load-bearing prior facts:
- **All four harnesses fork**, via four different mechanisms; the universal rule is **fork, never resume-in-place** (a bare resume mutates the source on every harness).
- **pi**: `pi --fork <path|id>` → new UUID, records `parentSession`, session file secret-clean, but **cannot boot from a git worktree (#21)**.
- **claude**: `claude --resume <id> --fork-session --session-id <new>` — but `--resume` resolves **only inside the launch-cwd's mangled project dir** (`~/.claude/projects/<enc>/<id>.jsonl`, `/` and `.` → `-`); no provenance back-pointer; `gitBranch` embedded.
- **Existing engine to reuse**: `buildControlSpawnCommand` (`core/spawn.ts:260`) already emits claude's fork command and the daemon binds deterministically to the pinned `plannedHarnessSessionId` (`core/daemon/loop.ts:287-321`) — **no bind race, no daemon change**. But `planBranch` (`spawn.ts:660`) hard-rejects without a live bound self, so `focus launch` must call the builders directly, **bypassing `planBranch`**.
- **Storage trap**: `FsRegistry.list()` ingests every top-level `~/.pij/*.json` as a live descriptor — focus state MUST live in a `~/.pij/focus/<name>/` **subdir** or it mints phantom peers (a #19-class hazard).

### Summary
Let any pij peer freeze its **golden native-session context** as a named, immutable **focus agent**, then relaunch fresh independent forks of it on demand into new tmux panes — true native-session restore, not a summary hand-off. `pij focus save <name>` snapshots the caller's bound session; `pij focus list` shows saved focuses; `pij focus launch <name>` forks a snapshot into a new bound peer. **First delivery: pi + claude adapters.** Copilot/codex are explicit future adapters.

### Goals
- `pij focus save <name>` — capture the caller's bound session as an immutable snapshot + manifest under `~/.pij/focus/<name>/`.
- `pij focus list [--global]` — enumerate saved focuses (repo-filtered by default, machine-wide with `--global`).
- `pij focus launch <name>` — fork the snapshot into a new tmux pane as a fresh bound pij peer that recalls the golden context verbatim; repeatable, each launch independent.
- Reuse existing spawn builders + deterministic bind; **no daemon code change**.
- A per-harness **adapter** boundary (fork command, snapshot location, provenance, redaction, boot-rule) so more harnesses slot in later.

### Non-Goals
- **Copilot & codex adapters** — deferred (documented future work; both proven forkable but via degraded copy+rewrite / rollout-copy recipes needing their own relaunch wiring, risk-finding 3). `focus save/launch` on those harnesses returns a clear "adapter not yet available" error in v1.
- **Any daemon loop change** — focus lives in the CLI + pure builders (reloaded per invocation); no forced daemon restart to install.
- **Retention/pruning policy** — snapshots are immutable and kept indefinitely ("saved forever," per the original ask); no auto-GC in v1.
- **Editing/merging saved focuses**, cross-machine sync, or a TUI — out of scope.
- **Product mutation in THIS plan** — planning/docs only; implementation awaits a product-file fence from prime.

### Target Domains
The pij extension has no formal `docs/domains/` registry; domains are the extension's internal module groups.

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| pij-control-plane (`.pi/extensions/pij/**`) | existing | **modify** | Add the `focus` verb group, a focus store, and a pi fork arm; reuse spawn builders + bind |
| focus (new capability, within pij) | **NEW (logical)** | **create** | Snapshot/manifest model, per-harness adapter seam, launch planner |

No new top-level domain directory is created; "focus" is a capability module inside the pij extension. No cross-domain edits outside `.pi/extensions/pij/**` (+ README, docs/how).

### Testing Strategy
- **Approach**: **Full TDD** — a failing test precedes each implementation task.
- **Rationale**: fork mechanics, immutability, and the storage-subdir invariant are correctness-critical and regression-prone; tests lock them.
- **Focus areas**: manifest read/write + immutability; snapshot copy + sha; `focus launch` argv/plan construction (branchFrom, forkSessionId, plannedHarnessSessionId) per harness; the phantom-descriptor guard (subdir, never top-level json); claude cwd-mangle materialization; pi #21 worktree refusal; the relaunch canary gate.
- **Excluded**: real model inference in unit tests (canary against a live fork is an integration/manual smoke, not a unit test).
- **Mock usage**: **targeted mocks only at external harness/process boundaries** — mock the child-process spawn (`pi --fork` / `claude --resume`) and tmux calls; use real temp `~/.pij/focus` fixtures and real jsonl snapshot files (no mocking of our own store/serde).

### Documentation Strategy
- **Hybrid**: README quick-start (the three commands) + `docs/how/pij-focus.md` (full guide: model, per-harness adapters, #21 boot rule, canary, limitations).

### Complexity
- **Score**: CS-4 (large)
- **Breakdown**: S=2, I=2, D=2, N=1, F=1, T=1 (sum 9)
- **Confidence**: 0.80
- **Assumptions**: reuse of `buildControlSpawnCommand` + deterministic bind holds for a snapshot-sourced `branchFrom`; pi `--fork` slots into the builder as a new arm.
- **Dependencies**: existing `FsRegistry`, `spawn.ts` builders, `transcriptLayout`, `reserveMemorableId`.
- **Risks**: see Risks table.
- **Phases**: 1 (Simple, per prime direction). Note: CS-4 in a single phase = one large phase with grouped tasks; escalate to Full/multi-phase only if the human prefers.

### Acceptance Criteria
- **AC-01** — `pij focus save <name>` from a **bound** pi/claude peer writes `~/.pij/focus/<name>/manifest.json` + an immutable `snapshot.jsonl` copy; manifest carries `{harness, harnessSessionId, model, effort, originCwd, sha256, createdAt, lineage}`. An **unbound** session is refused with a clear error.
- **AC-02** — `pij focus list` shows saved focuses (name, harness, model, created, origin repo), **repo-filtered by default**; `--global` shows all; `--json` emits structured output.
- **AC-03** — `pij focus launch <name>` (pi or claude) opens a new tmux pane, forks the snapshot into a **fresh bound pij peer with a new native id**, and the fork **recalls the golden context verbatim** (relaunch canary passes) before it is handed any work.
- **AC-04** — Launch **never mutates** the saved snapshot: `snapshot.jsonl` sha256 is byte-identical after N launches.
- **AC-05** — Two launches from one focus are **independent** (distinct native ids, no cross-pollution); the snapshot and each fork stay isolated.
- **AC-06** — Focus state lives **only** under `~/.pij/focus/<name>/`; `FsRegistry.list()` never mints a phantom descriptor from it (no top-level `~/.pij/<name>.json`).
- **AC-07** — On save, a **per-harness redactor** runs (claude: strip/flag `gitBranch`; pi: none needed); the tool asserts **no credentials** are present (verified none are persisted by any harness).
- **AC-08** — **Boot-rule enforcement**: pi `focus launch` **refuses (or relocates to a clean checkout)** when the launch cwd is a git worktree (#21); claude `focus launch` materializes the snapshot into the launch-cwd project dir with the correct `/`+`.`→`-` encoding and refuses a cwd it can't resolve.
- **AC-09** — Installing/using `focus` requires **no daemon code change and no forced daemon restart** (logic is CLI + pure builders).
- **AC-10** — `focus save`/`launch` on **copilot or codex** returns a clear "adapter not yet available in v1" message (documented non-goal), not a crash.

### Risks & Assumptions
| Risk | Mitigation |
|------|------------|
| `planBranch` gate blocks a snapshot fork (no live self) | Bypass `planBranch`; call `buildControlSpawnCommand`/`buildPendingDescriptor` directly with `branchFrom=<snapshot id>` (risk-finding 1) |
| claude fork can't see its snapshot from a different cwd (#21-class) | `focus save` records `originCwd`; `focus launch` materializes the copy into `transcriptDir(home, launchCwd)` with correct enc, refuses unresolvable cwd (risk-finding 2) |
| A stray top-level `~/.pij/*.json` mints a phantom peer | Store strictly under `~/.pij/focus/<name>/` subdir; test asserts `list()` count unchanged after save (risk-finding 5) |
| Per-harness secrets/shape differ | Adapter-keyed redactor; never assume claude's shape for others (risk-finding 4) |
| pi `--fork` not yet wired into the builder | Add a pi arm to `buildControlSpawnCommand` (first-delivery task) |

### Open Questions
- **Focus id vs name**: use the human `<name>` as the directory key (v1), or also mint a pij-style id? → v1 uses `<name>` as the key; a launched fork gets a fresh `reserveMemorableId` pij id (assumption, overridable).
- **Snapshot vs live-id**: `focus save` **copies** the transcript (durable "forever") rather than merely recording the id (native files may be GC'd) — confirmed by the "save forever" ask. Flag if the human wants a lighter id-only mode.

### Workshop Opportunities
| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| Focus manifest + adapter interface | Data Model | Locks the per-harness seam before copilot/codex land | What fields must every adapter supply? redaction hook shape? |
| `focus launch` planner reuse of spawn core | Integration Pattern | Decide refactor-shared-helper vs delegate-to-runSpawn | Extract launch core from `runSpawn` (cli.ts:917-1120)? |

### Clarifications
#### Session 2026-07-15
- **Workflow Mode**: Simple, single-phase (prime Seq 250 fixed answer).
- **Testing**: Full TDD (fixed answer).
- **Mocks**: targeted mocks only at external harness/process boundaries (fixed answer).
- **Docs**: README quick-start + `docs/how/` guide (fixed answer).
- **Scope**: pi + claude first; copilot + codex explicit future adapters/non-goals (fixed answer).
- **Preserve**: fork-never-resume, external lineage manifest, per-adapter privacy/storage/boot rules, pi #21 constraint (fixed answer).
- **validate-v2 (2026-07-15, independent peer)**: verdict NEEDS ATTENTION → both findings folded into v1.0.1 — HIGH: pi transcript-locator did not exist (`transcriptLayout(pi)` = inert claude default) → T03a added with non-mocked path test; MED: `supportsBranching(pi)` stays false, pi fork arm scoped to focus-launch. Claims 1–3 (planBranch bypass, subdir invariant, TDD/coverage) proven SOUND. Detail: `.harness/temp/s050/focus-agents-plan-validation.md`.

## Planning Seam
_Refinement opportunities still open — recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: manifest/adapter interface; launch-planner reuse of spawn core.

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| research-dossier.md | n | Phase-1 experiment reports + codebase scouts used instead |
| workshops/*.md | n | none authoritative yet |
| experiments/*-findings.md + 00-forkability-matrix.md | y | authoritative harness mechanics + constraints |

## Implementation Plan

### Build Configuration (human-confirmed 2026-07-15)
| Role | Harness | Model | Effort | Status |
|------|---------|-------|--------|--------|
| Coder | copilot | gpt-5.6-sol | xhigh | **pij-forward-condor** (pane %1414, worktree cwd) — spawned 2026-07-15, canary pending |
| Reviewer | copilot | gpt-5.6-sol | xhigh | lazy — spawns at first REVIEW |

Human choice: "sol/sol xhigh" (recorded verbatim; sol outage of 2026-07-14 assumed over — canary is the live proof). Whole phase delegated via `/pij pair`: run `2026-07-14T20-39-49Z-github.com-AI-Substr`, packet `dlg-0002`.

### Gate Matrix
| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | Round-1 fixed by prime; no critical NEEDS-CLARIFICATION markers |
| G2 | Constitution | N/A | No `docs/project-rules/constitution.md` gating this |
| G3 | Architecture | N/A | No `docs/project-rules/architecture.md` layer rules |
| G4 | ADR Compliance | N/A | No accepted ADRs constrain this |
| G5 | Structure | PASS | All required sections present |
| G6 | Testing Alignment | PASS | Full TDD — test tasks precede impl tasks; ACs measurable |
| G7 | Domain Completeness | PASS | Domains + manifest cover every referenced file; no formal registry to reconcile |

### Summary
Add a `focus` verb group to the pij CLI that snapshots a bound peer's native session into `~/.pij/focus/<name>/` and relaunches immutable forks into new tmux panes, reusing the existing spawn builders + deterministic bind (no daemon change). First delivery wires pi and claude adapters; copilot/codex are stubbed as future adapters. Correctness (fork-never-resume, immutability, the phantom-descriptor guard, per-harness boot rules) is locked by Full-TDD tests with mocks only at the process/tmux boundary.

### Domain Manifest
| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `.pi/extensions/pij/core/focus.ts` | focus | contract | NEW — manifest schema, save/list/launch core, adapter seam |
| `.pi/extensions/pij/core/focus.test.ts` | focus | internal | NEW — TDD unit tests |
| `.pi/extensions/pij/core/types.ts` | pij-control-plane | contract | Add `FocusManifest` type |
| `.pi/extensions/pij/core/spawn.ts` | pij-control-plane | internal | Add pi `--fork` arm; snapshot-sourced `branchFrom` path |
| `.pi/extensions/pij/core/spawn.test.ts` | pij-control-plane | internal | Extend for pi fork arm + snapshot branch |
| `.pi/extensions/pij/adapters/focus-store.ts` | focus | contract | NEW — `~/.pij/focus/<name>/` read/write (subdir-only) |
| `.pi/extensions/pij/adapters/focus-store.test.ts` | focus | internal | NEW — store + phantom-descriptor guard test |
| `.pi/extensions/pij/core/harness/transcript.ts` | pij-control-plane | internal | **Add a real pi arm** — `transcriptLayout(pi)` today aliases claude's dir as an "inert default" (validator HIGH); pi needs its own locator (`~/.pi/agent/sessions/<enc cwd>/` + `PI_CODING_AGENT_SESSION_DIR` override) |
| `.pi/extensions/pij/cli.ts` | pij-control-plane | internal | Add `runFocus` dispatch + `FOCUS_USAGE` |
| `README.md` | docs | consume | Quick-start for the three commands |
| `docs/how/pij-focus.md` | docs | contract | NEW — full guide |

### Key Findings
| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | `focus launch` can't use `planBranch` (rejects without live bound self), but `buildControlSpawnCommand`/`buildPendingDescriptor` take arbitrary `branchFrom` + need no self; daemon binds deterministically to pinned `plannedHarnessSessionId` | Build a new launch dispatch on the raw builders; bypass `planBranch`; reuse the bind unchanged |
| 02 | Critical | claude `--resume <id>` resolves only inside `~/.claude/projects/<enc(cwd)>/`; wrong cwd/enc → silent empty (#21-class) | `save` records originCwd; `launch` copies snapshot into `transcriptDir(home, launchCwd)` with `/`+`.`→`-`; refuse unresolvable cwd |
| 03 | Critical | `FsRegistry.list()` ingests every top-level `~/.pij/*.json` as a live descriptor | Store focus state ONLY under `~/.pij/focus/<name>/` subdir; test the phantom-descriptor guard |
| 04 | High | Only claude has a fork arm in `buildControlSpawnCommand`; pi needs one; copilot/codex have no relaunch-from-copy wiring | Add pi `--fork` arm (first delivery); stub copilot/codex adapters (AC-10) |
| 05 | High | Redaction surface differs per harness (claude `gitBranch`; codex `session_meta.cwd`; copilot system+AGENTS.md); no credentials in any | Per-harness redactor keyed off `HarnessKind`; assert no-credentials |
| 06 | High | Daemon runs tsx off source, no hot-reload | Keep focus in CLI + pure builders; reuse existing bind → no daemon change, no forced restart |
| 07 | High | **(validate-v2)** `transcriptLayout(pi)` returns claude's layout as an inert default; `pi.ts` has no transcript locator and `PI_CODING_AGENT_SESSION_DIR` appears nowhere in pij source — pi save-side reuse **does not exist yet** | New tasks T03a-t/T03a-i add a real pi locator with a **non-mocked** path-resolution test (a boundary mock must not hide this) |
| 08 | Med | **(validate-v2)** Flipping `supportsBranching(pi)=true` would silently enable an unvalidated `pij spawn --branch` live-self path for pi (s050 proved snapshot-file fork only) | Keep `supportsBranching(pi)=false`; scope the pi fork arm to the focus-launch call site |

### Implementation

**Objective**: Ship `pij focus save/list/launch` with pi + claude adapters, reusing spawn builders and the deterministic bind, with focus state isolated under `~/.pij/focus/<name>/` and correctness locked by Full-TDD tests.
**Testing Approach**: Full TDD — each test task (Txx-t) precedes its implementation task (Txx-i). Mocks only at the child-process (`pi --fork` / `claude --resume`) and tmux boundaries; real temp `~/.pij/focus` + real jsonl fixtures otherwise.

#### Tasks
| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | T01-t | Test: `FocusManifest` type + focus-store round-trip (write/read `~/.pij/focus/<name>/manifest.json`) under a temp `PIJ_HOME` | focus | `.pi/extensions/pij/adapters/focus-store.test.ts` | Failing test asserts manifest fields persist + reload | AC-01 |
| [x] | T01-i | Impl: `FocusManifest` in types.ts + `focus-store.ts` (save/read/list under `~/.pij/focus/<name>/`, subdir-only) | focus | `core/types.ts`, `adapters/focus-store.ts` | T01-t passes | Finding 03 |
| [x] | T02-t | Test: **phantom-descriptor guard** — after `focus save`, `FsRegistry.list()` count is unchanged (no top-level json) | focus | `adapters/focus-store.test.ts` | Failing test asserts list() count invariant | AC-06, Finding 03 |
| [x] | T02-i | Impl: enforce subdir-only writes; add a guard/comment; ensure no top-level `~/.pij/*.json` is ever written | focus | `adapters/focus-store.ts` | T02-t passes | |
| [x] | T03a-t | Test: **pi transcript locator** — resolves a pi session file from a REAL temp session-dir fixture (`~/.pi/agent/sessions/<enc cwd>/` layout + `PI_CODING_AGENT_SESSION_DIR` override). **Non-mocked path resolution** — real dirs/files, no boundary mock | pij-control-plane | `core/harness/transcript.test.ts` | Failing test resolves the actual fixture path | Finding 07 (validator HIGH) |
| [x] | T03a-i | Impl: add a real **pi arm** to `transcriptLayout` (or a dedicated pi resolver): default `~/.pi/agent/sessions/<enc cwd>/`, honor `PI_CODING_AGENT_SESSION_DIR`/`--session-dir` | pij-control-plane | `core/harness/transcript.ts` | T03a-t passes | |
| [x] | T03-t | Test: `focus save` core — reads a (mocked) bound descriptor, copies its native transcript to `snapshot.jsonl`, records sha256; **refuses an unbound descriptor**; pi path resolution rides the REAL locator from T03a (not a mock) | focus | `core/focus.test.ts` | Failing tests for bound-copy + unbound-refusal | AC-01 |
| [x] | T03-i | Impl: `saveFocus()` — resolve caller descriptor via `FsRegistry.read`, locate transcript via the per-harness locator (claude/codex: existing `transcriptLayout`; **pi: the new T03a arm**), copy immutably, write manifest | focus | `core/focus.ts` | T03-t passes | Findings 02,05,07 |
| [x] | T04-t | Test: per-harness **redactor + no-credential assertion** (claude strips/flags `gitBranch`; pi no-op) | focus | `core/focus.test.ts` | Failing test per harness | AC-07, Finding 05 |
| [x] | T04-i | Impl: `redactSnapshot(harness, jsonl)` keyed off `HarnessKind` | focus | `core/focus.ts` | T04-t passes | |
| [x] | T05-t | Test: pi `--fork` arm of `buildControlSpawnCommand` emits `pi --fork <snapshot> --session-dir …` with pinned new id | pij-control-plane | `core/spawn.test.ts` | Failing test asserts pi fork argv | Finding 04 |
| [x] | T05-i | Impl: add pi arm to `buildControlSpawnCommand`, **scoped to the focus-launch call site only; `supportsBranching(pi)` stays `false`** (live-self `--branch` for pi is unproven — s050 proved snapshot-file fork only) | pij-control-plane | `core/spawn.ts` | T05-t passes; existing `--branch` behavior unchanged | Finding 08 (validator MED) |
| [x] | T06-t | Test: `launchFocus` **plan** — from a manifest, builds argv with `branchFrom=<snapshot id>`, fresh `forkSessionId`, `plannedHarnessSessionId=forkSessionId`, **bypassing `planBranch`**; pi + claude | focus | `core/focus.test.ts` | Failing test asserts plan per harness | AC-03, Finding 01 |
| [x] | T06-i | Impl: `launchFocus()` — materialize snapshot per harness (claude: copy into `transcriptDir(launchCwd)` w/ correct enc; pi: session-dir/abs), call builders directly, reserve pij id, split pane via existing tmux path | focus | `core/focus.ts` | T06-t passes | Findings 01,02 |
| [x] | T07-t | Test: **boot-rule + cwd guards** — pi launch refuses a worktree cwd (#21); claude launch refuses an unresolvable cwd; immutability (snapshot sha unchanged after launch) | focus | `core/focus.test.ts` | Failing tests for each guard + immutability | AC-04, AC-08 |
| [x] | T07-i | Impl: worktree detection (pi) + cwd-enc resolution/refusal (claude) + assert snapshot opened read-only | focus | `core/focus.ts` | T07-t passes | |
| [x] | T08-t | Test: `focus list` repo-filtered default + `--global` + `--json`; copilot/codex `save`/`launch` return "adapter not yet available" | focus | `core/focus.test.ts` | Failing tests | AC-02, AC-10 |
| [x] | T08-i | Impl: `listFocuses()` + adapter-availability gate for copilot/codex | focus | `core/focus.ts` | T08-t passes | |
| [x] | T09-i | Wire `runFocus(argv)` dispatch (save/list/launch) into `cli.ts:main()`; add `FOCUS_USAGE`; `--json` support | pij-control-plane | `cli.ts` | `pij focus …` routes; `just typecheck`+`just test` green | Finding 06 (CLI-only, no daemon change) |
| [x] | T10 | **Integration smoke** (manual/scripted): real `focus save` in a live pi peer, `focus launch`, assert the relaunch canary recalls the golden token verbatim; repeat for claude | focus | `.harness/temp/**` (scratch) | Both harness canaries PASS live | AC-03; needs product fence + live peers |
| [x] | T11 | Docs: README quick-start (3 commands) + `docs/how/pij-focus.md` (model, adapters, #21 rule, canary, limits, copilot/codex future) | docs | `README.md`, `docs/how/pij-focus.md` | Both written, commands accurate | Docs strategy |

### Acceptance Coverage Map
| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01 | T01, T03a, T03 | manifest round-trip + REAL pi locator + bound-copy/unbound-refusal tests |
| AC-02 | T08 | list repo-filter/global/json tests |
| AC-03 | T06, T10 | launch-plan unit + live relaunch-canary smoke |
| AC-04 | T07 | snapshot-immutability test |
| AC-05 | T06, T10 | independent-fork plan + live isolation smoke |
| AC-06 | T02 | phantom-descriptor guard test |
| AC-07 | T04 | per-harness redactor + no-credential test |
| AC-08 | T07 | worktree/cwd guard tests |
| AC-09 | T09 | CLI-only wiring; typecheck/test green with daemon untouched |
| AC-10 | T08 | copilot/codex adapter-unavailable test |

### Risks
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Snapshot fork mis-binds (new native id not found by daemon) | Low | High | Reuse pinned `plannedHarnessSessionId` bind (loop.ts:287-321), proven deterministic; T06 asserts the plan |
| claude cwd-enc mismatch → silent empty fork | Med | High | Materialize into `transcriptDir(launchCwd)`; T07 refuses unresolvable cwd |
| Focus json leaks into descriptor registry | Low | High | Subdir-only store; T02 guard |
| pi launch into a worktree silently fails (#21) | Med | Med | T07 refusal + docs; launch from clean checkout |
| Extending builders breaks existing spawn/branch | Low | High | Additive pi arm scoped to focus-launch; `supportsBranching(pi)` unchanged; T05 + existing spawn tests stay green |
| pi transcript location unresolved — no existing pij seam (validator HIGH) | — (resolved by plan) | High | T03a adds the pi locator with a non-mocked path test before any save-side work |
