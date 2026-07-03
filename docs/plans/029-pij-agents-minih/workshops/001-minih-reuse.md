# Workshop: minih re-use — dependency mode, adapter strategy, upstreaming

**Type**: Integration Pattern
**Plan**: 029-pij-agents-minih
**Spec**: none yet — business source is `../research-dossier.md` (plan doc follows this workshop)
**Created**: 2026-07-03T07:35:00+10:00
**Status**: Draft

**Value Thesis**: Every downstream decision (CLI grammar, execution model, built-ins) changes shape depending on *how* pij consumes minih. Settling library-vs-binary and the adapter contract here means the plan's phases are designed once, against a known integration seam, instead of being re-litigated mid-build.
**Target Proof Level**: Preferred Direction (Contract Ready on the adapter + dependency seams)
**Current Proof Level**: Preferred Direction

**Selected Value Axes**:
- **Implementation Readiness**: the adapter/dependency contracts below are lifted verbatim from minih source — a developer can code against them directly.
- **Safety to Change**: minih is pre-1.0 with git-tag releases; the pin + seam choices here are what make upgrades non-breaking for pij.
- **Agent Readiness**: `pij agent run` must satisfy "pre-select harness/model/effort, override at instantiation" — the options are scored against that requirement explicitly.
- **Migration Safety**: pij already drives minih one way (package-vetter `spawnSync`); this workshop names the migration path rather than leaving two invocation modes to drift.

**Related Documents**:
- `../research-dossier.md` (evidence F-01…F-18, H-01…H-03 — all citations below reference it)
- pij RUNBOOK § Companion mode (minih) — the coordination-aware operating manual

---

## Purpose

Decide how pij takes its minih dependency (library / binary / hybrid), how non-copilot harnesses (claude code, codex) back an agent run, and which gaps get fixed pij-side vs upstreamed to minih. Makes the plan stage cheaper: phases inherit these decisions instead of discovering them.

## Fresh Entrant Outcome

A fresh human or agent should be able to use this workshop to reach **Preferred Direction** with no additional context. They should be able to:

- State how pij declares and pins its minih dependency, and why the tag format matters.
- Code a new harness adapter against the `IAgentAdapter` contract without reading minih source.
- Explain why binary-only shell-out was rejected (which requirement it fails).
- List what pij builds locally now vs what gets upstreamed to minih, and why.

## Key Questions Addressed

- Library dep, global-binary shell-out, or hybrid?
- How do claude/codex back an agent run when minih's only production adapter is copilot?
- How do ephemeral (no-record) and inline (no prior setup) runs work when minih supports neither?
- Which minih verbs does pij re-expose vs delegate (`init`, `check`, `agent install`)?
- What is the migration path for the existing package-vetter `spawnSync` usage?

---

## Value Frame

| Field | Selection | Why It Matters |
|-------|-----------|----------------|
| Target Proof Level | Preferred Direction (+ Contract Ready seams) | The plan needs settled direction + exact seam shapes; full implementation detail belongs to phase tasks |
| Primary Value Axis | Implementation Readiness | The contracts below are the coding surface for the core phase |
| Supporting Value Axes | Safety to Change, Agent Readiness, Migration Safety | Pre-1.0 dep; hard multi-harness requirement; an existing invocation mode already in the tree |
| Downstream Loop Improved | Planning + implementation | Phases are designed against one known seam; no mid-build re-litigation of library-vs-binary |

## Decision Space

### D1 — Dependency mode

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| A · Library dep | `dependencies: { "minih": "github:AI-Substrate/minih#minih-v0.2.4" }`; call `runAgent(adapter, definition, config)` (F-01) | Adapter injection → claude/codex possible (F-02); typed results (`AgentRunResult.parsedReport`); reuses minih's AJV validation, permissions, prompt assembly, run ledger wholesale; version pinned per pij release | Git-tag pin, no registry semver (F-10); pre-1.0 API not stability-guaranteed; adds pij's first runtime dependency (today: peerDeps only) | **Selected** |
| B · Global binary | `spawnSync("minih", ["run", slug, "-p", …])` — the package-vetter pattern (F-12) | Zero coupling to internals; already proven in-tree; minih CLI owns UX | **Copilot-only**: the CLI composition root hard-wires `SdkCopilotAdapter` (F-02) — fails the harness-pre-selection requirement outright; PATH dep pij doesn't install/pin; results via runs-dir diffing | **Rejected** — fails a hard requirement |
| C · Hybrid | Library for `pij agent run`; shell to `minih` binary for authoring/maintenance verbs when present | Best of both for authoring (`minih init` scaffolding stays theirs) | Two invocation modes to keep coherent | **Selected (narrow form)** — library is the *only* run path; the binary is optional sugar for authoring, never load-bearing |

**Why this format**: the decisive fact is F-02 — copilot is optional and injected *only* at minih's CLI composition root. Library mode is the only door to `IAgentAdapter`, and `IAgentAdapter` is the only door to claude/codex-backed agents. Everything else is secondary.

### D2 — Adapter strategy for claude / codex / copilot

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| A · Headless subprocess adapters | pij implements `IAgentAdapter` per harness: claude → `claude -p … --output-format json`; codex → `codex exec`; copilot → reuse minih's `SdkCopilotAdapter` (requires `@github/copilot-sdk` dep) | One-shot, structured output, no tmux/daemon weight; fits `run(options) → AgentResult` resolve-on-idle contract cleanly | Each adapter must map minih's event/result contract onto its CLI's output; effort-flag mapping is per-harness (pij already owns this: F-13) | **Selected** for one-shot agent runs |
| B · pij daemon/tmux sessions as backend | Agent runs spawn a full pij session; result scraped from transcripts | Reuses watchdogs + `pij list` visibility | Heavyweight for one-shot; transcript scraping is fragile vs headless JSON; readiness/bind latency | **Rejected for one-shot**; reserved for coordination-aware/companion agents (RUNBOOK path, copilot-backed today) |

**The adapter contract pij codes against** (verbatim seam — `minih/src/adapter/interface.ts:13-32`):

```typescript
export interface IAgentAdapter {
  // Resolves when the session emits `session_idle`; on `session_error`
  // returns AgentResult{status:'failed'} — never throws or hangs.
  // Implementations with a live session call options.onSessionReady
  // once the initial prompt is sent.
  run(options: AgentRunOptions): Promise<AgentResult>;
  compact(sessionId: string): Promise<AgentResult>;
  terminate(sessionId: string): Promise<AgentResult>;
}
```

**Run-time knobs pij passes** (`AgentRunConfig`, `minih/src/runner/types.ts:97+`): `slug`, `model?`, `reasoningEffort?: 'low'|'medium'|'high'|'xhigh'`, `timeout?`, `stallTimeout?`, `maxTurns?`, `surviveGaps?`, `cwd?`, params (input payload), permissions override.

**Harness → adapter mapping**:

| Harness | Adapter backend | Effort translation (owned by pij, F-13/F-14) | Note |
|---|---|---|---|
| copilot | minih `SdkCopilotAdapter` | `reasoningEffort` passes straight through | pij must add `@github/copilot-sdk` (optional peer of minih) |
| claude | new `ClaudeHeadlessAdapter` (`claude -p`) | pij `thinkingLevelMap` levels → flag | fork/session flags per pij's existing control-plane facts |
| codex | new `CodexExecAdapter` (`codex exec`) | pij curated table → `-c model_reasoning_effort=…` | ⚠️ minih's enum lacks codex's `minimal` — adapter accepts pij levels, clamps/maps for minih's type, warns (never blocks) |
| pi | out of scope v1 | — | pi self-registers in pij's control plane; revisit with execution-model workshop |

### D3 — Ephemeral + inline runs (both unsupported upstream: F-03, F-04)

| Option | Description | Decision |
|--------|-------------|----------|
| pij-side synthesis layer now | Inline agent = synthesize a temp pack (`prompt.md` + optional schemas) under `~/.pij/tmp/agents/<run-id>/`; run with `MINIH_NO_AUTO_HARVEST=1`; read result from `AgentRunResult.parsedReport` (never disk); delete the temp tree on completion (crash-safe: sweep stale `~/.pij/tmp` on daemon start) | **Selected** — ships in v1 |
| Upstream `ephemeral: true` + inline `AgentDefinition` | PR to minih: a config flag to skip `createRunFolder` persistence + accept an in-memory definition | **Selected as follow-up** — removes the temp-dir workaround; pij keeps the layer until released |

### D4 — What pij re-exposes vs delegates

| Capability | v1 shape | Rationale |
|---|---|---|
| `pij agent run` | library `runAgent` | D1 |
| `pij agent list` | pij-native scan of `./agents` + `~/.pij/agents` (merge, `agent.json`/`prompt.md` presence = agent) | minih discovery is single-dir (F-18 note); the two-dir merge is pij's own UX |
| `pij agent check` (validate output/pack) | library `validateInput`/`validateOutput`/`validateSystemOutput` (F-07) | already exported pure functions |
| `pij agent new` | delegate to `minih init` when binary present, else pij's own minimal template (`prompt.md` + schemas) | authoring stays minih-compatible either way |
| `agent install` (registry packs) | defer — point users at `minih agent install` | `.minih-source.json` provenance (F-18) is minih's; don't reimplement |

### D5 — Upstream list (ranked; all PRs to AI-Substrate/minih)

1. **Ephemeral mode** (`ephemeral: true` — skip run-folder persistence) — removes pij's temp-dir layer.
2. **Inline `AgentDefinition`** (accept prompt string / in-memory definition) — removes synthesis entirely.
3. **Adapter API stability declaration** — ask for `IAgentAdapter`/`runAgent`/`AgentRunConfig` to be declared stable (or versioned) pre-1.0; pij is now a second consumer.
4. **Effort enum**: add `minimal` (codex parity).
5. *(Recorded, decided do-nothing for now)*: `>=0.3.0` template metadata is unsatisfiable (`src/templates/agents-registry.json:13`) — inert; revisit only if minih starts enforcing it.

### D6 — Migration of existing usage

`harness/scripts/vetters/agent.ts` (spawnSync + runs-dir diff, F-12) migrates to the library path **after** the core lands — a later phase, not blocking; until then the two modes coexist knowingly.

## Evidence Ledger

| Evidence | Location | Supports | Status |
|----------|----------|----------|--------|
| `runAgent` programmatic entry | dossier F-01 (`runner.ts:377-383`) | D1-A viability | Ready |
| Copilot optional, adapter injectable | dossier F-02 (`interface.ts`, `sdk-runtime.ts:73-96`) | D1-B rejection, D2 | Ready |
| `IAgentAdapter` + `AgentRunConfig` shapes | this doc, lifted from source 2026-07-03 | D2 contract | Ready |
| No ephemeral / no inline upstream | dossier F-03, F-04 | D3 | Ready |
| Exported validators | dossier F-07 (`validator.ts`) | D4 check verb | Ready |
| Git-tag-only distribution, tag prefix `minih-v` | dossier F-10 + risk row (resolved 2026-07-03: latest = `minih-v0.2.4`) | D1 pin string | Ready |
| package-vetter spawnSync pattern | dossier F-12 (`vetters/agent.ts:57-119`) | D6 | Ready |
| pij effort translators + models registry | dossier F-13, F-14 | D2 mapping table | Ready |
| Claude/codex headless invocation flags verified end-to-end | — | D2 adapters | **Missing** — validate in an early phase spike |

## Attention Reduction

| Future Loop | Before Workshop | After Workshop |
|-------------|-----------------|----------------|
| Planning | Library-vs-binary open; adapter feasibility unknown | D1/D2 settled with verbatim contracts; phases inherit |
| Implementation | Would re-derive `IAgentAdapter`/`AgentRunConfig` from minih source | Seam shapes are in this doc |
| Review | "Why not just shell out?" re-asked per PR | D1-B rejection rationale is citable |

## Open Questions

### Q1: Do claude/codex headless modes deliver everything an adapter needs (structured result, session id for `terminate`, streaming events for the stall watchdog)?

**OPEN** — high-confidence for basic run (both CLIs have headless JSON modes), unverified for event granularity. Resolution: a small adapter spike as the first implementation task; the Evidence Ledger's Missing row.

### Q2: Does `pij agent run` for a *copilot*-backed agent require pij to hard-depend on `@github/copilot-sdk`?

**OPEN** — it's minih's optional peer (F-02); pij can mirror that (optional, lazy-import, clear error when absent). Leaning: optional peer + `pij agent doctor`-style hint.

### Q3: Version-skew guard — what breaks loudly when a future `minih-v0.x` changes the runner API?

**RESOLVED (direction)**: exact-tag pin + a thin pij-side contract test (import `runAgent`, run the hello-world pack against `FakeAgentAdapter`) so `npm update` failures surface in `just self-check`, per Jordan's "use latest, tests catch issues" call.

## Validation / Acceptance

This workshop reaches its target proof level when:

- The plan stage can name its phases without reopening library-vs-binary (D1) or the adapter approach (D2).
- A developer can start the claude adapter spike from the contract block alone.
- The upstream list (D5) is actionable as filed issues/PRs without further research.
