# pij agents on minih — `pij agent` verb family, minih-compatible agent runtime
**Mode**: Full
**Plan Version**: 1.1.0 (Phase 3 amendment: agent pack as peer, per `workshops/003-agent-pack-as-peer.md`)
**Created**: 2026-07-03
**Status**: READY
**Spec source**: unified (this file)

## Business Specification

📚 Incorporates findings from `research-dossier.md` (F-01…F-18, H-01…H-03) and three authoritative workshops: `workshops/001-minih-reuse.md` (D1–D6), `workshops/002-pij-agent-cli-experience.md`, `workshops/003-agent-pack-as-peer.md` (v1.1 Phase 3 — D1–D4, OQs ratified + grill-revised 2026-07-03).

### Summary

pij gains a first-class agent runtime: minih-format agent packs (folders of `prompt.md` + optional schemas/instructions) discovered from three sources, run through minih's embedded library runner with pij-authored harness adapters (claude, codex, copilot), overridable model/effort/harness at instantiation, an inline zero-setup mode that records nothing, and shipped built-ins starting with `flowspace-search`. The feature serves three ends with one primitive: **right-sized delegation** (each pack pins the smallest model that reliably does its job), a **determinism gradient** (validated input, checked output, recorded runs — a prompt graduates into a contract the way an eyeballed check graduates into a harness verb), and **compatibility** (packs, runs, and envelopes stay 100% minih-native; pij coordinates, minih remains the runner of record).

**v1.1 (Phase 3)** extends the shipped one-shot runtime with **agent pack as peer**: `pij agent spawn` runs a pack as a daemon-bound, *visible and steerable* peer in a tmux pane — briefed by an auto-delivered first-turn packet, signalling done via an explicit `pij agent report` verb (schema-validated synchronously), resident by default for follow-up discourse (a warm `flowspace-search` sidekick amortizes cold starts across queries), auto-closing with `--once`. Contract: `workshops/003-agent-pack-as-peer.md`.

### Goals

- Run any minih-compatible agent pack from pij with one command, no ceremony beyond the pack itself.
- Direct compatibility: minih input validation (AJV fail-fast), output contract (`summary` + `retrospective` envelope + agent schema), and run ledger are reused, never forked.
- Agents pre-select harness/model/effort in pack frontmatter; callers override per-instantiation; unset means pack default (the plan-025 semantics).
- Zero-setup inline agents (`--prompt`) and ephemeral runs that leave nothing on disk.
- Built-in agents shipped with pij (flowspace-search first), listed alongside project + user agents.
- The companion scenario (coordination-aware packs like code-review-companion) remains supportable without new pij machinery.
- **(v1.1)** Spawn any pack as a visible, addressable pij peer (`pij agent spawn`): watch it work, converse with it (`pij send`), audit it (`pij tail`), close it (`pij close`) — with an explicit, schema-validated done-signal (`pij agent report`).
- **(v1.1)** Resident-by-default lifecycle so a spawned research sidekick keeps its context warm across follow-up queries; `--once` for fire-and-forget runs that close themselves after reporting.

### Non-Goals

- Flow-pair consolidation into a reusable skill (explicitly out of scope per Jordan).
- Changes to `minih-workbench` UI (`agent-workbench` domain observes runs; unchanged).
- Reimplementing minih's registry/`agent install`/`.minih-source.json` provenance (stays `minih agent install`).
- A `pi`-harness adapter (v1 ships claude/codex/copilot).
- ~~Automatic finished-agent detection or auto-close of sessions — residency/close lifecycle is a recorded open design; v1 agent runs are synchronous one-shots.~~ **Superseded in v1.1**: the residency/close lifecycle is now designed (workshop 003 D3) and built in Phase 3. Still excluded: a harness-agnostic *self-close/farewell* protocol (the copilot coordination lane already provides one for that harness via configuration).
- **(v1.1)** Sandboxed/permission-scoped *spawned* peers — spawn mode always runs fully permissioned (workshop 003 D4); the per-harness read-only levers (codex `--sandbox read-only`, claude `--allowedTools`, copilot `--deny-tool`) are recorded as future hardening, not built.
- Migrating `harness/scripts/vetters/agent.ts` off spawnSync (workshop 001 D6 — deliberate later phase, not this plan).

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| agent-runtime | **NEW** (created in P1) | **create**, then **modify** (P3) | The runtime: pack discovery (3-tier), minih library embedding, harness adapters, inline/ephemeral engine; P3 adds pure peer-packet rendering + report-validation helpers |
| pij-control-plane | existing | **modify** | New `agent` verb intercept + USAGE in the pij bin; small export refactors (`loadModels`, `PROVIDER_HARNESS_MAP`); P3 adds `agent spawn`/`agent report` wiring, daemon packet delivery + report relay + `--once` close |
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
- **Phases**: 3 (fewest that hold — runtime below, surface above; Phase 3 added in v1.1: peer mode is a real dependency boundary — it consumes the shipped P1 runtime + P2 CLI and the daemon spawn path).

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
14. **AC-14** *(v1.1)* `pij agent spawn <slug> [-p k=v]` spawns a daemon-bound peer pane running the pack's harness/model/effort (same override rails as `run`); `-p` input is AJV-validated **before any pane exists** (`E-BADINPUT`, exit 1, nothing to clean up); after bind, the rendered first-turn packet (prompt + instructions + params + a report-contract clause naming the **literal** `pij agent report` command) is delivered automatically. `pij agent spawn --prompt "<text>"` does the same for an inline pack.
15. **AC-15** *(v1.1)* `pij agent report --json '<report>'`, run inside the pane (sender resolved from the daemon-stamped `PIJ_SELF` env), validates **synchronously** against the pack's `output-schema.json` when present: invalid → exit 1 + per-error AJV lines on stderr and **nothing is pushed**; valid → the report pushes to the spawner. Reports are repeatable (a re-tasked resident peer reports again). Run outside a pack-peer pane (no `PIJ_SELF`) → clear error, exit 1.
16. **AC-16** *(v1.1)* Lifecycle: by default the peer is **resident** after reporting — it answers a `pij send` follow-up and is closed by the parent via `pij close` (existing ownership rules). With `--once` (or pack frontmatter `lifecycle: once`; flag > frontmatter > resident) the daemon closes the pane **after the first report push is delivered**. A peer that never reports falls to the existing stalled/dead watchdog.
17. **AC-17** *(v1.1)* Spawned peers always run **fully permissioned** (the `pij spawn` posture). A pack declaring a `permissions:` preset spawns with **one loud stderr advisory** naming that the preset is enforced only in `pij agent run`. No refusal path; `run`-mode enforcement is unchanged.
18. **AC-18** *(v1.1)* `pij spawn --agent <slug>` forwards to the `pij agent spawn` path (canonical verb unchanged); and the **live ship gate** passes behind `PIJ_AGENT_LIVE=1`: spawn `flowspace-search` resident → packet delivered → real fs2 graph answer → `pij agent report` round-trip received → `pij send` follow-up answered → `--once` variant auto-closes after its report.

### Risks & Assumptions

- minih pre-1.0 API drift → pinned tag + AC-12 contract test.
- Claude/codex headless event granularity unverified (workshop 001 Evidence Ledger "Missing" row) → Phase 1 opens with the adapter spike.
- minih `reasoningEffort` enum lacks codex `minimal` → adapter clamps + warns (workshop 001 D2).
- minih always writes `runs/<ts>/` (F-03) → ephemeral layer synthesizes temp packs; crash-leak mitigated by daemon-start sweep.

### Open Questions

- ~~**Residency / close lifecycle**: when a session-resident agent finishes, who closes it?~~ **RESOLVED in v1.1** (workshop 003 D3 + grill, 2026-07-03): explicit done-signal via `pij agent report`; default resident with parent close; `--once` auto-close after the first report push; no self-close protocol in v1.1.
- Stdin prompt (`--prompt -`): include in Phase 2 unless the parser fights it (workshop 002 Q2).

### Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions | Status |
|-------|------|--------------|---------------|--------|
| minih re-use (dep mode, adapters, upstreaming) | Integration Pattern | decides every seam | done | ✅ `workshops/001-minih-reuse.md` |
| pij agent CLI experience | CLI Flow | the entire user surface | done | ✅ `workshops/002-pij-agent-cli-experience.md` |
| Agent residency & close lifecycle (→ agent pack as peer) | Integration Pattern + State Machine | closure is ownership, not inference — needed scenario walk | verb shape? report seam? lifecycle default? permissions on interactive harnesses? | ✅ `workshops/003-agent-pack-as-peer.md` (OQs ratified + grill-revised 2026-07-03) |

### Clarifications

#### Session 2026-07-03

- Q: Workflow Mode? → A: **Full, but as few phases as possible** (locked at 2).
- Q: Testing Strategy? → A: **Hybrid** (TDD pure core via FakeAgentAdapter; live-gated adapters).
- Q: Mock Usage? → A: **Targeted** (fakes for runner path; real CLIs only in live tests).
- Q: Documentation Strategy? → A: **Hybrid** (AGENTS_README/RUNBOOK + docs/how deep guide).
- Prior-session directives folded in: track latest minih release (no 0.3.0 cut, no manifest edits); built-ins default to the smallest reliable model (flowspace-search = sonnet-class/low); determinism-gradient framing is a stated goal; companion scenario must be provably supportable but adds no machinery.

#### Session 2026-07-03 (v1.1 amendment — Phase 3, agent pack as peer)

- Q: What can't `pij spawn` + a hand-sent packet do that this must? → A: **Visibility + packaging**: run minih agents where you can see and interact with them; packaged spawnable sidekicks (flowspace-search first, warm across follow-ups).
- Q: Which turn is "the report" for a resident peer? → A: **The peer signals done explicitly** — resolved as the `pij agent report` verb (no transcript scraping).
- Q (OQ1): Lifecycle default? → A: **Resident**; `--once` opts into auto-close.
- Q (OQ2): Invalid report handling? → A: One auto re-prompt — **superseded same day** by the report verb's synchronous CLI validation (exit 1 + AJV errors; agent self-corrects; only valid reports push).
- Q (OQ3): `pij spawn --agent` alias? → A: **Add now**; `pij agent spawn` stays canonical.
- Q: Enforce pack permission presets on spawned peers? → A: **No — always fully permissioned** (the `pij spawn` posture); preset advisory-only in spawn mode, per-harness sandbox levers recorded as future hardening.
- Q: Ship gate? → A: One `PIJ_AGENT_LIVE=1` live scenario covering spawn → packet → report → discourse → `--once` close (AC-18).

## Planning Seam

_Refinement opportunities still open — recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: **none — all resolved** (residency/close lifecycle resolved by workshop 003 in v1.1).

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| research-dossier.md | y | informs Key Findings, AC wording, risks (F/H ids cited throughout) |
| workshops/001-minih-reuse.md | y | authoritative: library dep, adapter strategy, ephemeral design, upstream list |
| workshops/002-pij-agent-cli-experience.md | y | authoritative: verb grammar, discovery precedence, flags, errors, envelopes |
| workshops/003-agent-pack-as-peer.md | y | authoritative (v1.1): spawn verb shape, packet/report seam, lifecycle, spawn-mode permissions posture, ship gate |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | No critical `[NEEDS CLARIFICATION]` markers; residency lifecycle is a scoped-out open question, recorded as a workshop opportunity |
| G2 | Constitution | N/A | no `docs/project-rules/constitution.md` |
| G3 | Architecture | N/A | no `docs/project-rules/architecture.md` (harness.md/agent-harness.md are conventions, honoured in Key Findings) |
| G4 | ADR Compliance | N/A | no `docs/adr/` |
| G5 | Structure | PASS | all required sections present; cross-refs resolve (v1.1 re-check: AC-14..18 ↔ coverage map ↔ Phase 3 tasks; findings 08/09 cited) |
| G6 | Testing Alignment | PASS | Hybrid: test-first tasks precede impl for pure core in all three phases (3.1–3.3 before 3.4–3.6); live-gated validation tasks present (1.8, 3.7) |
| G7 | Domain Completeness | PASS | agent-runtime NEW has setup tasks (1.1; domain shipped in `12e74af`); manifest covers every file in task tables incl. P3 rows |

### Summary

Phase 1 builds the `agent-runtime` domain: the minih library dependency, pack discovery across three sources, the runner wrapper with injected adapters (fake, claude, codex, copilot-optional), and the ephemeral/inline engine — all testable without a CLI. Phase 2 exposes it as the `pij agent` verb family per workshop 002's contract, ships the flowspace-search built-in, and lands docs. Phase 3 (v1.1, per workshop 003) adds **agent pack as peer**: `pij agent spawn` runs a pack as a daemon-bound resident tmux peer briefed by an auto-delivered first-turn packet, `pij agent report` is the explicit schema-validated done-signal, and the lifecycle is resident-by-default with `--once` auto-close. Three phases: the surface cannot precede the runtime, and peer mode consumes both shipped layers plus the daemon spawn path.

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
| `docs/how/pij-agents.md`, `AGENTS_README.md`, `RUNBOOK.md` | agent-runtime | internal | docs per strategy (incl. AC-11 companion walkthrough; P3 spawn-mode section) |
| `harness/scripts/…` (self-check wiring for contract test) | extension-authoring-harness | cross-domain | AC-12 rides existing `just self-check` composition |
| `.pi/extensions/pij/core/agents/peer-packet.ts` (P3) | agent-runtime | internal | pure first-turn packet rendering (prompt + instructions + params + literal report-contract clause) — no daemon/tmux imports (boundary sensor extended) |
| `.pi/extensions/pij/core/agents/report.ts` (P3) | agent-runtime | contract | synchronous report validation helpers over minih `validateOutput`; consumed by the report verb |
| `.pi/extensions/pij/daemon.ts` (P3) | pij-control-plane | internal | spawn-mode packet delivery after bind; report relay push; `--once` close-after-report |
| `.pi/extensions/pij/core/agents/peer.live.test.ts` (P3) | pij-control-plane | internal | the AC-18 live ship-gate scenario behind `PIJ_AGENT_LIVE=1` |
| `.pi/extensions/pij/core/agent-peer.ts` (P3) | pij-control-plane | internal | pure peer planning (env build, advisory, lifecycle precedence, once-close decision) — sibling of core/spawn.ts |
| `.pi/extensions/pij/core/types.ts` (P3) | pij-control-plane | contract | additive optional descriptor fields (`agentPack?`, `agentPackDir?`, `agentOnce?`, `reportedAt?`) |
| `.pi/extensions/pij/core/spawn.ts` (P3) | pij-control-plane | internal | `parseSpawnArgs` gains the `--agent <slug>` alias |
| `.pi/extensions/pij/cli.ts` (P3) | pij-control-plane | cross-domain | `runAgentSpawn`/`runAgentReport` bin handlers + AGENT_USAGE lines |

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
| 08 | High *(P3)* | Weak/cheap models do **not infer** report-back mechanisms — live incident: a gpt-5.4-mini worker never reported because the packet said "report back" without naming the tool (retro DL-001, 2026-07-02) | the P3 first-turn packet names the **literal** `pij agent report --json …` command, no placeholders left to infer |
| 09 | High *(P3)* | Daemon-driven panes have no human to approve permission prompts — the whole spawn path exists on blanket-permission flags | spawn-mode peers always run fully permissioned (workshop 003 D4); pack presets stay run-mode contracts + one stderr advisory |

### Phases

#### Phase Index

| Phase | Title | Primary Domain | Objective (1 line) | Depends On |
|-------|-------|---------------|-------------------|------------|
| 1 | Agent runtime + harness adapters | agent-runtime | Embed minih, discover packs, run them through injected adapters, ephemeral engine — CLI-free and fully tested | None |
| 2 | `pij agent` CLI surface, built-ins, docs | pij-control-plane | Expose the runtime per workshop 002's contract; ship flowspace-search; land docs | Phase 1 |
| 3 | Agent pack as peer (`pij agent spawn`) | pij-control-plane | Spawn packs as daemon-bound resident peers: first-turn packet, `pij agent report` done-signal, resident/`--once` lifecycle, alias — per workshop 003 | Phase 2 (shipped: `12e74af`) |

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

#### Phase 3: Agent pack as peer (`pij agent spawn`)

**Objective**: Run a pack as a daemon-bound, visible, addressable pij peer — briefed automatically, reporting explicitly, resident by default — per workshop 003's contract (D1–D4, all OQs ratified).
**Domain**: pij-control-plane (+ agent-runtime pure helpers)
**Delivers**: `agent spawn` + `agent report` verbs; `pij spawn --agent` alias; peer-packet rendering; synchronous report validation; resident/`--once` lifecycle; the AC-18 live ship gate; docs.
**Depends on**: Phase 2 (shipped: `12e74af`)
**Key risks**: packet delivery is send-after-bind (reuses the machinery flow-pair exercised live); `pij agent report` outside a pack pane must fail clearly, not push garbage.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 3.1 | Tests then impl: `peer-packet.ts` — render the first-turn packet from a discovered pack (prompt.md + instructions.md + `-p` params + report-contract clause naming the **literal** `pij agent report --json …` command); pure functions, no daemon/tmux imports (extend the boundary sensor) | agent-runtime | unit tests: packet contains prompt, instructions, coerced params, the literal command string; boundary test stays green | TDD; finding 08 |
| 3.2 | Tests then impl: `report.ts` — synchronous validation helpers (minih `validateOutput` when `output-schema.json` present; pass-through otherwise); typed result `{valid, errors[]}` | agent-runtime | unit tests: valid/invalid/no-schema paths; AJV error lines surfaced verbatim | TDD |
| 3.3 | Tests then impl: `agent spawn` + `agent report` arg parsing (slug/`--prompt`, `-p` repeats, `--once`, override flags; report `--json`) as pure functions + `pij spawn --agent <slug>` alias forwarding; **input AJV validation fires before any spawn** (`E-BADINPUT` exit 1, no pane) | pij-control-plane | unit tests: happy + error paths, exit codes, alias forwards verbatim, fail-fast ordering asserted (spawn never invoked on bad input) | TDD; AC-14/18 |
| 3.4 | Spawn wiring: daemon-bound spawn honouring pack/override harness+model+effort; stamp `PIJ_SELF=<id>` into the pane env; blanket permission flags always (one stderr advisory when the pack declares a preset); deliver the rendered packet after bind via the existing send path; parse pack `lifecycle:` frontmatter (pij-only key, flag > frontmatter > resident) | pij-control-plane | fixture test: spawn request carries env + packet queued-after-bind; advisory printed exactly once; lifecycle precedence unit-tested | AC-14/17; finding 09 |
| 3.5 | `pij agent report` verb: resolve sender from `PIJ_SELF` + registry (absent → clear error, exit 1); validate via 3.2 (invalid → exit 1 + AJV stderr, **nothing pushed**); valid → push report to the spawner; repeatable across re-tasks | pij-control-plane | unit tests: no-PIJ_SELF error, invalid-blocked, valid-pushed, second report pushes again | AC-15 |
| 3.6 | Lifecycle: `--once`/pack-`once` → daemon closes the pane after the first report push is delivered; resident → no auto-close (parent `pij close` as today); never-reports → existing stalled/dead watchdog untouched | pij-control-plane | fixture tests: once-closes-after-push (and not before), resident-stays, watchdog path unchanged | AC-16 |
| 3.7 | Live ship gate (`peer.live.test.ts` behind `PIJ_AGENT_LIVE=1`): spawn `flowspace-search` resident → packet delivered → real fs2 answer → report round-trip received → `pij send` follow-up answered → `--once` variant auto-closes | pij-control-plane | the whole scenario green against a real claude peer; run recorded in execution log | AC-18; live-gated |
| 3.8 | Docs: `docs/how/pij-agents.md` § spawn mode (verb, report contract, lifecycle table, permissions posture, alias); AGENTS_README/RUNBOOK quick-start lines | agent-runtime | docs match the shipped flags; workshop 003 linked as the contract | AC-13 extension |

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
| AC-13 | 2.8, 3.8 | docs land |
| AC-14 | 3.1, 3.3, 3.4 | packet render tests; fail-fast ordering test; spawn-wiring fixture test |
| AC-15 | 3.2, 3.5 | validation helper tests; report verb tests |
| AC-16 | 3.4, 3.6 | lifecycle precedence + once/resident fixture tests |
| AC-17 | 3.4 | blanket-flags + advisory assertions |
| AC-18 | 3.3, 3.7 | alias test; live ship-gate scenario |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Claude/codex headless modes can't feed the adapter contract (events/session-id) | Medium | High | Task 1.3 spike before adapter build; fallback = adapter degrades gracefully (no compact/terminate mid-run, documented) |
| minih tag bump breaks `runAgent`/types | Medium | Medium | Exact-tag pin + AC-12 contract test in self-check |
| Ephemeral temp-tree leaks on crash | Low | Low | Daemon-start sweep (1.7); tmp under `~/.pij/tmp` only |
| Copilot adapter peer-dep confusion | Low | Medium | Lazy import + explicit `E-HARNESSBIN`-style message naming the missing package |
| Built-ins path breaks under npm link vs package install | Low | Medium | Resolve relative to module URL, not cwd; covered in 2.7 test |
| *(P3)* Packet delivery races bind / lands in a half-booted pane | Medium | Medium | Reuse the existing send-after-bind machinery (proven live by flow-pair runs); live gate 3.7 exercises the real sequence |
| *(P3)* `pij agent report` invoked outside a pack-peer pane | Medium | Low | `PIJ_SELF` absent → clear error + exit 1 (3.5); never a silent no-op or misrouted push |
| *(P3)* `--once` close races a concurrent `pij send` follow-up | Low | Medium | Close fires only after the report push is delivered; a racing send to a closing pane surfaces the existing dead-peer push, not silence |
| *(P3)* Fully-permissioned spawn of a "read-only" pack surprises an operator | Medium | Low | AC-17's loud stderr advisory at spawn + docs; per-harness sandbox levers recorded as future hardening (workshop 003 D4) |

## Fixes

| ID | Created | Summary | Domain(s) | Status | Source |
|----|---------|---------|-----------|--------|--------|
| FX001 | 2026-07-03 | Control-plane trio: --task inbox delivery (DL-002), pane-first cross-repo self-resolution (DL-003), --layout right\|below\|window (SUGG-001) | pij-control-plane | Complete | plan 030 P1 retro (fixes/FX001-control-plane-trio.md) |
