# pij agents on minih — `pij agent` verb family, minih-compatible agent runtime
**Mode**: Full
**Plan Version**: 1.0.0
**Created**: 2026-07-03
**Status**: READY
**Spec source**: unified (this file)

## Business Specification

📚 Incorporates findings from `research-dossier.md` (F-01…F-18, H-01…H-03) and two authoritative workshops: `workshops/001-minih-reuse.md` (D1–D6), `workshops/002-pij-agent-cli-experience.md`.

### Summary

pij gains a first-class agent runtime: minih-format agent packs (folders of `prompt.md` + optional schemas/instructions) discovered from three sources, run through minih's embedded library runner with pij-authored harness adapters (claude, codex, copilot), overridable model/effort/harness at instantiation, an inline zero-setup mode that records nothing, and shipped built-ins starting with `flowspace-search`. The feature serves three ends with one primitive: **right-sized delegation** (each pack pins the smallest model that reliably does its job), a **determinism gradient** (validated input, checked output, recorded runs — a prompt graduates into a contract the way an eyeballed check graduates into a harness verb), and **compatibility** (packs, runs, and envelopes stay 100% minih-native; pij coordinates, minih remains the runner of record).

### Goals

- Run any minih-compatible agent pack from pij with one command, no ceremony beyond the pack itself.
- Direct compatibility: minih input validation (AJV fail-fast), output contract (`summary` + `retrospective` envelope + agent schema), and run ledger are reused, never forked.
- Agents pre-select harness/model/effort in pack frontmatter; callers override per-instantiation; unset means pack default (the plan-025 semantics).
- Zero-setup inline agents (`--prompt`) and ephemeral runs that leave nothing on disk.
- Built-in agents shipped with pij (flowspace-search first), listed alongside project + user agents.
- The companion scenario (coordination-aware packs like code-review-companion) remains supportable without new pij machinery.

### Non-Goals

- Flow-pair consolidation into a reusable skill (explicitly out of scope per Jordan).
- Changes to `minih-workbench` UI (`agent-workbench` domain observes runs; unchanged).
- Reimplementing minih's registry/`agent install`/`.minih-source.json` provenance (stays `minih agent install`).
- A `pi`-harness adapter (v1 ships claude/codex/copilot).
- Automatic finished-agent detection or auto-close of sessions — residency/close lifecycle is a recorded open design (Workshop Opportunities); v1 agent runs are synchronous one-shots.
- Migrating `harness/scripts/vetters/agent.ts` off spawnSync (workshop 001 D6 — deliberate later phase, not this plan).

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| agent-runtime | **NEW** | **create** | The runtime: pack discovery (3-tier), minih library embedding, harness adapters, inline/ephemeral engine |
| pij-control-plane | existing | **modify** | New `agent` verb intercept + USAGE in the pij bin; small export refactors (`loadModels`, `PROVIDER_HARNESS_MAP`) |
| agent-workbench | existing | **consume** | Observes the minih-format runs this feature produces; no changes — run artifacts stay minih-owned |
| extension-authoring-harness | existing | **consume** | Test/gate conventions (`*.live.test.ts`, self-check); the vetter keeps its own minih path for now |

#### New Domain Sketches

##### agent-runtime [NEW]
- **Purpose**: Run minih-compatible agent packs from pij — discovery, invocation through minih's library runner with injected harness adapters, instantiation-time overrides, and the ephemeral/inline layer.
- **Boundary Owns**: 3-tier pack discovery + precedence; `runAgent` wrapping + result surfacing; `IAgentAdapter` implementations (claude/codex/copilot); temp-pack synthesis + cleanup; `~/.pij/agents` + `~/.pij/tmp` path contract.
- **Boundary Excludes**: run observation/UI (→ `agent-workbench`); the pack format + validators + run ledger (→ minih, external); companion coordination protocol (→ minih coordination + RUNBOOK); CLI arg parsing conventions (→ `pij-control-plane` bin, which calls into this domain).

### Testing Strategy

- **Approach**: Hybrid — TDD for pure core (discovery/precedence, pack loading, effort mapping, temp-pack synthesis, arg handling) using minih's exported `FakeAgentAdapter`; lightweight live-gated integration for real harness CLIs.
- **Rationale**: the pure parts are exactly where determinism is the product; real-CLI runs spend tokens/need auth, so they ride the established `*.live.test.ts` + `describe.skipIf(!ENV)` pattern.
- **Focus Areas**: precedence/shadowing, AJV fail-fast before any session, ephemeral leaves-nothing guarantees, envelope/exit-code stability, minih API drift (contract test).
- **Excluded**: adapter behaviour under every harness CLI version; companion end-to-end (supportability is proven by configuration, not a new e2e suite).
- **Mock Usage**: targeted — `FakeAgentAdapter` for runner paths; real CLIs only behind `PIJ_AGENT_LIVE=1`.

### Documentation Strategy

- **Location**: Hybrid — quick-start in `AGENTS_README.md` + `RUNBOOK.md` (existing convention), deep guide `docs/how/pij-agents.md` (pack authoring, adapters, inline/ephemeral, built-ins, companion pointer).
- **Rationale**: other agents will script this surface; the deep guide is the contract they read.

### Complexity

- **Score**: CS-4 (large)
- **Breakdown**: S=2, I=2, D=1, N=1, F=1, T=2 (sum 9)
- **Confidence**: 0.8
- **Assumptions**: minih `runAgent`/`IAgentAdapter` behave per dossier evidence at tag `minih-v0.2.4`; claude/codex headless modes deliver structured one-shot results.
- **Dependencies**: `minih` git dep (`github:AI-Substrate/minih#minih-v0.2.4`); `@github/copilot-sdk` optional peer; `claude`/`codex` CLIs on PATH for their adapters (runtime-optional).
- **Risks**: see § Risks.
- **Phases**: 2 (fewest that hold — runtime below, surface above).

### Acceptance Criteria

1. **AC-01** `pij agent list` merges `./agents` → `~/.pij/agents` → built-ins with that precedence; a shadowed slug is listed dimmed with `(shadowed)`; `--json` emits `{slug, source, dir, description, tags, model, reasoning, harness, shadowed}` rows.
2. **AC-02** `pij agent run <slug> -p k=v` runs the pack through minih's library `runAgent`; a recorded run produces a minih-native `runs/<ts>/` ledger whose `output/report.json` satisfies the system envelope (readable by minih tooling unchanged).
3. **AC-03** An unmodified minih pack (`hello-world` shape: `prompt.md` alone) runs without edits; input violating `input-schema.json` exits 1 with `E-BADINPUT` + per-error AJV lines **before any LLM session starts**.
4. **AC-04** `--model`/`--effort`/`--harness` override pack frontmatter; unset flags fall back to frontmatter; unknown model/effort **warns and proceeds** (never blocks); harness without an adapter exits with `E-NOADAPTER`.
5. **AC-05** `pij agent run --prompt "<text>"` returns a result with **nothing left on disk**: no pack, no `runs/` dir, no retro file; the temp tree under `~/.pij/tmp/` is removed on completion, and stale trees are swept **at the start of any `pij agent run`** as well as on daemon start (inline-only users never start the daemon).
6. **AC-06** `--ephemeral` on a named agent completes with zero new entries under that agent's `runs/`.
7. **AC-07** Claude and codex adapters each complete a real one-shot run behind `PIJ_AGENT_LIVE=1` tests; the copilot adapter loads only when `@github/copilot-sdk` is present and fails with a clear message when absent.
8. **AC-08** `flowspace-search` ships as a built-in (default model sonnet-class, low effort, `permissions: read-only + shell:allow`), answers a query against this repo's fs2 graph, and `pij agent eject flowspace-search` copies it into `./agents/` where it then shadows the built-in. **Un-ejected built-ins always run through the ephemeral temp-copy path** (read-only pack ⇒ no on-disk `runs/` ledger — minih roots runs at the pack dir, which for built-ins is the installed package); eject to get recorded runs.
9. **AC-09** Error surface: `E-NOAGENT`, `E-BADINPUT`, `E-NOADAPTER`, `E-HARNESSBIN`, `E-PERMISSION`, `E-RUNFAILED` per workshop 002; exit codes 0 (success+validated) / 1 (user/agent error) / 2 (system error).
10. **AC-10** `--json` on `run` emits `{run:{slug,status,model,harness,effort,runDir|null,validated}, report}` on stdout with progress confined to stderr.
11. **AC-11** Companion supportability: a coordination-enabled pack boots through the copilot adapter path (or the documented minih-binary path per RUNBOOK) with **no pij code changes** — proven by a configuration walkthrough in `docs/how/pij-agents.md`, not new machinery.
12. **AC-12** A minih contract test (hello-world pack + `FakeAgentAdapter` through the real `runAgent` import) runs inside `just self-check`, so a future `minih` tag bump that breaks the API fails loudly ("use latest, tests catch issues").
13. **AC-13** Docs land per strategy: AGENTS_README/RUNBOOK quick-start + `docs/how/pij-agents.md`.

### Risks & Assumptions

- minih pre-1.0 API drift → pinned tag + AC-12 contract test.
- Claude/codex headless event granularity unverified (workshop 001 Evidence Ledger "Missing" row) → Phase 1 opens with the adapter spike.
- minih `reasoningEffort` enum lacks codex `minimal` → adapter clamps + warns (workshop 001 D2).
- minih always writes `runs/<ts>/` (F-03) → ephemeral layer synthesizes temp packs; crash-leak mitigated by daemon-start sweep.

### Open Questions

- **Residency / close lifecycle** (from Jordan's scenario review): when a session-resident agent finishes, who closes it — a self-close verb, the parent, or deliberate stay-open-for-discourse/compact? **Deferred by design**: v1 runs are synchronous one-shots; session-resident agents remain `pij spawn`/`close` territory. Recorded below as a Workshop Opportunity, not a blocker.
- Stdin prompt (`--prompt -`): include in Phase 2 unless the parser fights it (workshop 002 Q2).

### Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions | Status |
|-------|------|--------------|---------------|--------|
| minih re-use (dep mode, adapters, upstreaming) | Integration Pattern | decides every seam | done | ✅ `workshops/001-minih-reuse.md` |
| pij agent CLI experience | CLI Flow | the entire user surface | done | ✅ `workshops/002-pij-agent-cli-experience.md` |
| Agent residency & close lifecycle | State Machine | closure is ownership, not inference — needs scenario walk (one-shot / discourse-then-close / resident+compact) | self-close verb? parent close? `pij agent run --wait`? how do resident agents surface in `pij list`? | open (post-v1) |

### Clarifications

#### Session 2026-07-03

- Q: Workflow Mode? → A: **Full, but as few phases as possible** (locked at 2).
- Q: Testing Strategy? → A: **Hybrid** (TDD pure core via FakeAgentAdapter; live-gated adapters).
- Q: Mock Usage? → A: **Targeted** (fakes for runner path; real CLIs only in live tests).
- Q: Documentation Strategy? → A: **Hybrid** (AGENTS_README/RUNBOOK + docs/how deep guide).
- Prior-session directives folded in: track latest minih release (no 0.3.0 cut, no manifest edits); built-ins default to the smallest reliable model (flowspace-search = sonnet-class/low); determinism-gradient framing is a stated goal; companion scenario must be provably supportable but adds no machinery.

## Planning Seam

_Refinement opportunities still open — recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: **Agent residency & close lifecycle** (deliberately post-v1; v1 scope excludes session-resident runs).

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| research-dossier.md | y | informs Key Findings, AC wording, risks (F/H ids cited throughout) |
| workshops/001-minih-reuse.md | y | authoritative: library dep, adapter strategy, ephemeral design, upstream list |
| workshops/002-pij-agent-cli-experience.md | y | authoritative: verb grammar, discovery precedence, flags, errors, envelopes |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | No critical `[NEEDS CLARIFICATION]` markers; residency lifecycle is a scoped-out open question, recorded as a workshop opportunity |
| G2 | Constitution | N/A | no `docs/project-rules/constitution.md` |
| G3 | Architecture | N/A | no `docs/project-rules/architecture.md` (harness.md/agent-harness.md are conventions, honoured in Key Findings) |
| G4 | ADR Compliance | N/A | no `docs/adr/` |
| G5 | Structure | PASS | all required sections present; cross-refs resolve |
| G6 | Testing Alignment | PASS | Hybrid: test-first tasks precede impl for pure core in both phases; live-gated validation tasks present |
| G7 | Domain Completeness | PASS | agent-runtime NEW has setup tasks (1.1); manifest covers every file in task tables |

### Summary

Phase 1 builds the `agent-runtime` domain: the minih library dependency, pack discovery across three sources, the runner wrapper with injected adapters (fake, claude, codex, copilot-optional), and the ephemeral/inline engine — all testable without a CLI. Phase 2 exposes it as the `pij agent` verb family per workshop 002's contract, ships the flowspace-search built-in, and lands docs. Two phases because the surface cannot be built before the runtime, and nothing else earns a boundary.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `package.json` | agent-runtime | internal | `minih` git dep; `@github/copilot-sdk` optional peer + `peerDependenciesMeta` |
| `.pi/extensions/pij/core/agents/types.ts` | agent-runtime | contract | `AgentSource`, `DiscoveredAgent`, run request/result shapes |
| `.pi/extensions/pij/core/agents/paths.ts` | agent-runtime | contract | `agentsDir(pijHome)` / `tmpDir(pijHome)` off `PIJ_HOME ?? ~/.pij` (kills the 3-way inline duplication) |
| `.pi/extensions/pij/core/agents/pack.ts` | agent-runtime | internal | pack detection (`prompt.md` present), 3-tier merge + shadowing |
| `.pi/extensions/pij/core/agents/runner.ts` | agent-runtime | internal | `runAgent` wrapper: definition build, config mapping, result surfacing |
| `.pi/extensions/pij/core/agents/inline.ts` | agent-runtime | internal | temp-pack synthesis, `MINIH_NO_AUTO_HARVEST=1`, cleanup + crash sweep |
| `.pi/extensions/pij/core/agents/adapters/claude.ts` | agent-runtime | internal | `IAgentAdapter` over `claude -p` headless |
| `.pi/extensions/pij/core/agents/adapters/codex.ts` | agent-runtime | internal | `IAgentAdapter` over `codex exec`; clamps `minimal` |
| `.pi/extensions/pij/core/agents/adapters/copilot.ts` | agent-runtime | internal | lazy-import wrapper around minih's `SdkCopilotAdapter`; clear absent-peer error |
| `.pi/extensions/pij/core/agents/*.test.ts` | agent-runtime | internal | co-located unit tests (auto-included by vitest globs) |
| `.pi/extensions/pij/core/agents/adapters/adapters.live.test.ts` | agent-runtime | internal | `PIJ_AGENT_LIVE=1`-gated real-CLI runs (AC-07) |
| `.pi/extensions/pij/cli.ts` | pij-control-plane | cross-domain | `agent` intercept (+ `agents` alias), `AGENT_USAGE`, USAGE line; `loadModels` refactored to exported core helper |
| `.pi/extensions/pij/core/cli.ts` | pij-control-plane | internal | `export` `PROVIDER_HARNESS_MAP` |
| `.pi/extensions/pij/core/models/registry.ts` | pij-control-plane | internal | receives exported `loadModels()` composition (moved from bin) |
| `.pi/extensions/pij/builtin-agents/flowspace-search/*` | agent-runtime | contract | shipped built-in pack (minih format is the external contract) |
| `docs/domains/agent-runtime/domain.md`, `docs/domains/registry.md`, `docs/domains/domain-map.md` | agent-runtime | contract | domain setup (NEW domain) |
| `docs/how/pij-agents.md`, `AGENTS_README.md`, `RUNBOOK.md` | agent-runtime | internal | docs per strategy (incl. AC-11 companion walkthrough) |
| `harness/scripts/…` (self-check wiring for contract test) | extension-authoring-harness | cross-domain | AC-12 rides existing `just self-check` composition |

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | `runAgent(adapter, definition, config)` is exported and adapter-agnostic; copilot is optional/injected only at minih's CLI root (dossier F-01/F-02) | embed as library; implement `IAgentAdapter` per harness |
| 02 | Critical | No ephemeral/inline support upstream — every run writes `runs/<ts>/`; `AgentDefinition` requires on-disk files (F-03/F-04) | `inline.ts` temp-pack layer; upstream later (workshop 001 D5) |
| 03 | High | `loadModels()` is module-private in the bin (`cli.ts:152`) and `PROVIDER_HARNESS_MAP` unexported (`core/cli.ts:336`) | small refactors: move/export before the agent verb consumes them (tasks 2.2) |
| 04 | High | The vetter's generic minih mechanics (`minihAvailable`/`snapshotRuns`/`newRunDirSince`) are module-private with a hardcoded pack (`vetters/agent.ts:15-57`) | do **not** lift in v1 (Non-Goal); the library path replaces the pattern for new code |
| 05 | High | `core/` convention is barrel-less concrete-file imports; no `index.ts` anywhere; `PIJ_HOME ?? ~/.pij` inlined 3× | `core/agents/` follows barrel-less layout; `paths.ts` becomes the single home resolver |
| 06 | Medium | minih effort enum lacks `minimal`; model list validation is copilot-derived (F-08) | pij validates via its own registry (warn-don't-block); codex adapter clamps `minimal` |
| 07 | Medium | Built-ins must survive `npm link`/package installs and stay read-only — and minih roots `runs/` at the pack dir (`folder.ts:799`), so a recorded built-in run would write into the installed package | serve from `.pi/extensions/pij/builtin-agents/`; un-ejected built-ins run ephemeral (no ledger); `eject` copies out and unlocks recording |

### Phases

#### Phase Index

| Phase | Title | Primary Domain | Objective (1 line) | Depends On |
|-------|-------|---------------|-------------------|------------|
| 1 | Agent runtime + harness adapters | agent-runtime | Embed minih, discover packs, run them through injected adapters, ephemeral engine — CLI-free and fully tested | None |
| 2 | `pij agent` CLI surface, built-ins, docs | pij-control-plane | Expose the runtime per workshop 002's contract; ship flowspace-search; land docs | Phase 1 |

#### Phase 1: Agent runtime + harness adapters

**Objective**: A tested `core/agents/` module that discovers packs and runs them through minih's library runner with pij adapters — no CLI yet.
**Domain**: agent-runtime (NEW)
**Delivers**: minih dep pin; domain setup; `paths/pack/runner/inline` modules; claude/codex/copilot adapters; contract + live tests.
**Depends on**: None
**Key risks**: adapter spike may reshape the claude/codex approach (that's why it's task 1.3, right after the seam exists).

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1.1 | Domain setup: `docs/domains/agent-runtime/domain.md`, registry row, domain-map node/edges | agent-runtime | registry + map render; boundaries match the sketch above | G7 |
| 1.2 | Add `minih` dep (`github:AI-Substrate/minih#minih-v0.2.4`) + `@github/copilot-sdk` optional peer; write the **contract test first**: hello-world-shape fixture pack + `FakeAgentAdapter` through real `runAgent` — the test **copies the fixture into a temp dir** before running (real `runAgent` writes `runs/<ts>/` under the pack dir) and asserts the repo tree is clean after | agent-runtime | `npm i` clean; contract test green and idempotent (no untracked artifacts); wired into `just self-check` (AC-12) | test-first |
| 1.3 | **Adapter spike**: drive one real prompt through `claude -p --output-format json` and `codex exec` by hand; record result/session-id/event shapes in a spike note | agent-runtime | spike note in plan folder answers workshop 001 Q1; go/no-go on headless approach | de-risks 1.6 |
| 1.4 | Tests then impl: `paths.ts` (`agentsDir`/`tmpDir` off `PIJ_HOME ?? ~/.pij`) and `pack.ts` (detect = `prompt.md`; 3-tier merge, precedence, shadowing) | agent-runtime | unit tests green incl. PIJ_HOME isolation, shadow marking (AC-01 logic) | TDD |
| 1.5 | Tests then impl: `runner.ts` — frontmatter→`AgentDefinition`, overrides→`AgentRunConfig` (model/effort/timeout/permissions), result surfacing from `AgentRunResult.parsedReport`; fail-fast input validation path (AC-03) | agent-runtime | FakeAgentAdapter tests: defaults, overrides, AJV fail before adapter.run called | TDD |
| 1.6 | Implement `adapters/claude.ts` + `adapters/codex.ts` per spike; `adapters/copilot.ts` lazy-import wrapper with absent-peer error | agent-runtime | unit tests with faked subprocess; codex `minimal` clamp warns | per 1.3 |
| 1.7 | Tests then impl: `inline.ts` — temp-pack synthesis under `tmpDir()`, `MINIH_NO_AUTO_HARVEST=1`, cleanup on completion, stale-sweep helper invoked **at every `pij agent run` start** and on daemon start | agent-runtime | after an inline run: temp tree gone, no retro, no repo writes; a planted stale tree is swept by the next run (AC-05) | TDD |
| 1.8 | Live validation: `adapters.live.test.ts` behind `PIJ_AGENT_LIVE=1` — one real claude run, one real codex run | agent-runtime | both produce a valid envelope end-to-end (AC-07) | live-gated |

#### Phase 2: `pij agent` CLI surface, built-ins, docs

**Objective**: The workshop-002 contract, end to end: verbs, overrides, errors, envelopes, built-ins, docs.
**Domain**: pij-control-plane (+ agent-runtime consumption)
**Delivers**: `agent` verb family; export refactors; flowspace-search built-in + eject; docs incl. companion walkthrough.
**Depends on**: Phase 1
**Key risks**: None beyond Phase-1 carryover.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.1 | Tests then impl: subverb arg parsing (`list/run/show/new/check/eject`, `-p` repeats, `--prompt`, `--ephemeral`, override flags) as pure functions | pij-control-plane | unit tests cover happy + error paths, exit-code mapping (AC-09) | TDD |
| 2.2 | Refactors: move `loadModels()` into `core/models/registry.ts` (exported), `export PROVIDER_HARNESS_MAP`; spawn path stays byte-equivalent | pij-control-plane | existing tests green; both symbols importable | finding 03 |
| 2.3 | Wire `agent` intercept (+`agents` alias) in bin `main()` before E-NOREG guard; add USAGE line + `AGENT_USAGE` | pij-control-plane | `pij agent` reachable with daemon-less home; USAGE shows it | F-11 pattern |
| 2.4 | Implement `list` (3-tier + shadowed + `--json`) and `run` (named packs: record-by-default, `--ephemeral`; overrides via `validateEffort`/`buildEffortWarning` — warn, don't block) | pij-control-plane | AC-01, AC-02, AC-04, AC-06 pass against fixture packs | |
| 2.5 | Implement inline `--prompt` (+ stdin `-` if trivial), `show`, `new` (delegate `minih init` when present, else bundled template), `check` (minih exported validators) | pij-control-plane | AC-05 end-to-end; `new` output runs unchanged under both pij and minih | |
| 2.6 | Error surface + `--json` envelope + stderr progress per workshop 002; loud `E-PERMISSION` from `terminalReason` | pij-control-plane | AC-09, AC-10 asserted in tests | |
| 2.7 | Ship `builtin-agents/flowspace-search/` (sonnet-class default, low effort, read-only+shell; fs2 instructions incl. graph-missing precondition) + `eject`; enforce **un-ejected built-ins run ephemeral** (temp-copy path — never write `runs/` into the package dir) | agent-runtime | AC-08: live query answers against this repo; no writes under `builtin-agents/` after a run; eject → shadowing + recorded runs work | |
| 2.8 | Docs: `docs/how/pij-agents.md` (authoring, adapters, inline/ephemeral, determinism gradient, AC-11 companion walkthrough via copilot adapter/RUNBOOK path), AGENTS_README + RUNBOOK quick-start | agent-runtime | AC-11, AC-13; walkthrough names zero pij code changes | |
| 2.9 | Validation sweep: `just self-check` green; scripted `--json` consumption exercise (exit codes + envelope) from a shell script in `scratch/` | pij-control-plane | all ACs ticked or explicitly deferred with reason | gate |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01 | 1.4, 2.4 | pack.ts tests; list fixture test |
| AC-02 | 1.2, 1.5, 2.4 | contract test; runner tests; run fixture test |
| AC-03 | 1.5, 2.6 | fail-fast test (adapter.run never called); CLI half — `E-BADINPUT` exit-1 mapping + rendered per-error AJV lines — asserted in 2.6's error-surface tests |
| AC-04 | 1.5, 2.4 | override/warn tests |
| AC-05 | 1.7, 2.5 | inline leaves-nothing test |
| AC-06 | 2.4 | ephemeral named-agent test |
| AC-07 | 1.3, 1.6, 1.8 | live-gated adapter tests |
| AC-08 | 2.7 | built-in live query + eject test |
| AC-09 | 2.1, 2.6 | exit-code/error tests |
| AC-10 | 2.6, 2.9 | envelope tests + scripted consumption |
| AC-11 | 2.8 | companion walkthrough (config-only) |
| AC-12 | 1.2 | contract test in self-check |
| AC-13 | 2.8 | docs land |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Claude/codex headless modes can't feed the adapter contract (events/session-id) | Medium | High | Task 1.3 spike before adapter build; fallback = adapter degrades gracefully (no compact/terminate mid-run, documented) |
| minih tag bump breaks `runAgent`/types | Medium | Medium | Exact-tag pin + AC-12 contract test in self-check |
| Ephemeral temp-tree leaks on crash | Low | Low | Daemon-start sweep (1.7); tmp under `~/.pij/tmp` only |
| Copilot adapter peer-dep confusion | Low | Medium | Lazy import + explicit `E-HARNESSBIN`-style message naming the missing package |
| Built-ins path breaks under npm link vs package install | Low | Medium | Resolve relative to module URL, not cwd; covered in 2.7 test |
