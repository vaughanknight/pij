# Domain: agent-runtime

## Purpose

Run minih-compatible agent packs from pij — discovery, invocation through minih's
library runner with injected harness adapters, instantiation-time overrides, and the
ephemeral/inline layer. pij embeds minih's exported `runAgent` behind pij-authored
`IAgentAdapter` implementations (claude, codex, copilot), so any minih-native pack
(`prompt.md` + optional schemas/instructions) runs under pij with 3-tier discovery,
per-instantiation model/effort/harness overrides, and a zero-setup inline mode that
records nothing. Packs, runs, and envelopes stay 100% minih-native — pij coordinates,
minih remains the runner of record.

Phase 1 builds the runtime CLI-free and fully tested: the minih dependency pin, pack
discovery + precedence/shadowing, the `runAgent` wrapper (frontmatter defaults, flag
overrides, AJV fail-fast before any session), the claude/codex/copilot adapters, and
the ephemeral/inline engine. Phase 2 exposes it as the `pij agent` verb family.

## Source Locations

| Path | Role |
|------|------|
| `.pi/extensions/pij/core/agents/types.ts` | Pi-free contracts: `AgentSource`, `DiscoveredAgent`, run request/result shapes, override precedence types. |
| `.pi/extensions/pij/core/agents/paths.ts` | Single home resolver: `agentsDir(pijHome)` / `tmpDir(pijHome)` off `PIJ_HOME ?? ~/.pij` (kills the 3× inline duplication in cli/index/daemon). |
| `.pi/extensions/pij/core/agents/pack.ts` | Pack detection (`prompt.md` present) + 3-tier discovery (`./agents` → `~/.pij/agents` → built-in), precedence merge, shadow marking. |
| `.pi/extensions/pij/core/agents/runner.ts` | `runAgent` wrapper: frontmatter → `AgentDefinition`, overrides → `AgentRunConfig` (flag > frontmatter > unset), AJV input fail-fast before `adapter.run`, result surfacing from `AgentRunResult.parsedReport`. |
| `.pi/extensions/pij/core/agents/inline.ts` | Ephemeral/inline engine: temp-pack synthesis under `tmpDir()`, `MINIH_NO_AUTO_HARVEST=1`, cleanup on completion, `sweepStaleTmp()` crash-sweep. |
| `.pi/extensions/pij/core/agents/adapters/claude.ts` | `IAgentAdapter` over `claude -p … --output-format json` (headless one-shot). |
| `.pi/extensions/pij/core/agents/adapters/codex.ts` | `IAgentAdapter` over `codex exec --json`; effort clamps `minimal`→`low` (warn), `xhigh`→`high`. |
| `.pi/extensions/pij/core/agents/adapters/copilot.ts` | Lazy-`import()` wrapper around minih's `SdkCopilotAdapter`; clear named-package error when `@github/copilot-sdk` absent. |
| `.pi/extensions/pij/core/agents/contract.test.ts` | The AC-12 drift alarm: hello-world fixture pack + `FakeAgentAdapter` through the **real** `runAgent` import; idempotent, repo-clean. |
| `.pi/extensions/pij/core/agents/boundary.test.ts` | Import-boundary sensor: no file under `core/agents/**` imports daemon/telegram/tmux/grammy. |
| `.pi/extensions/pij/core/agents/adapters/adapters.live.test.ts` | `PIJ_AGENT_LIVE=1`-gated real-CLI runs (one claude, one codex; AC-07). |
| `.pi/extensions/pij/core/agents/__fixtures__/` | Deterministic minih-format fixture packs for the contract test. |

## Concepts

| Concept | Description | Contract |
|---------|-------------|----------|
| minih as an embedded library | pij imports minih's `runAgent` + validators + `FakeAgentAdapter`, never shells out to the `minih` binary for agent runs. | `runAgent(adapter, definition, config)` from `minih/runner`; copilot is optional and injected only where present. |
| Harness adapter | A pij-owned backend implementing minih's `IAgentAdapter` (`run`/`compact`/`terminate`) over a CLI or SDK. | `run(options) → AgentResult` resolves on completion; `session_error` yields `status:'failed'`, never throws/hangs. |
| 3-tier pack discovery | An agent is any dir containing `prompt.md`; discovered across project → user → built-in with that precedence. | `./agents` → `~/.pij/agents` → built-in dir; earlier sources shadow later; a shadowed slug is **marked, not dropped**. |
| Override precedence | model/effort/timeout/harness resolve flag > frontmatter > unset (unset ⇒ pack default). | `AgentRunConfig` built from `DiscoveredAgent` + per-instantiation overrides. |
| Fail-fast input validation | Input params are AJV-validated against the pack's `input-schema.json` **before any adapter session starts**. | `validateInput` runs before `adapter.run`; invalid ⇒ error, adapter never called. |
| Ephemeral / inline run | An inline prompt (or `--ephemeral` pack) runs through a synthesized temp pack that leaves nothing on disk. | temp pack under `tmpDir()/agents/<run-id>/`, `MINIH_NO_AUTO_HARVEST=1`, tree deleted on success and failure; `sweepStaleTmp()` clears crash leftovers. |
| Path contract | The single resolver for pij's agent + temp roots. | `agentsDir(pijHome)` = `<pijHome>/agents`; `tmpDir(pijHome)` = `<pijHome>/tmp`; `pijHome = PIJ_HOME ?? ~/.pij`. |

## Contracts

| Contract | Consumer | Shape / Guarantee |
|----------|----------|-------------------|
| `DiscoveredAgent` | `pij-control-plane` (Phase 2 CLI), tests | Structural discovery row: `{ slug, source, dir, description, tags, model?, reasoning?, harness?, shadowed }`. |
| `agentsDir` / `tmpDir` | `pij-control-plane` (cli/index/daemon), inline engine | Deterministic path resolution off `PIJ_HOME ?? ~/.pij`; the single home resolver for the whole codebase. |
| `IAgentAdapter` implementations | minih `runAgent`, runner | claude/codex/copilot adapters honour minih's `run/compact/terminate` contract; effort mapping is a pure per-adapter helper. |
| Runner result surface | Phase 2 CLI, tests | `runAgent` wrapper returns the minih `AgentRunResult` (`parsedReport` surfaced); recorded runs produce a minih-native `runs/<ts>/` ledger. |
| `sweepStaleTmp()` | daemon start, Phase 2 `run` start | Removes stale temp packs under `tmpDir()`; idempotent; safe to call on every run start and on daemon start. |
| minih contract (AC-12) | `extension-authoring-harness` self-check | The contract test rides `just self-check`, so a future `minih` tag bump that breaks `runAgent`/`FakeAgentAdapter`/envelope fails loudly. |

## Composition

| Component | Status | Notes |
|-----------|--------|-------|
| Domain document | implemented in Phase 1 | Creates the boundary + `~/.pij` path contract. |
| minih dependency pin | implemented in Phase 1 | `github:AI-Substrate/minih#minih-v0.2.4`; `@github/copilot-sdk` optional peer. |
| Contract test (AC-12) | implemented in Phase 1 | Rides `just self-check` via the vitest glob; red-first alarm proven. |
| `paths.ts` / `pack.ts` / `runner.ts` | implemented in Phase 1 | Pure TDD core; discovery/precedence/shadowing, override precedence, AJV fail-fast. |
| claude / codex / copilot adapters | implemented in Phase 1 | Headless subprocess (claude/codex) + lazy-SDK (copilot); de-risked by the T004 spike. |
| Ephemeral/inline engine | implemented in Phase 1 | Temp-pack synthesis + cleanup + crash-sweep; daemon-start sweep hook. |
| Live adapter tests | implemented in Phase 1 | `PIJ_AGENT_LIVE=1`-gated; `just agent-live` recipe. |
| `pij agent` CLI surface + built-ins + docs | Phase 2 | Verb family, `flowspace-search` built-in, `docs/how/pij-agents.md`. |

## Dependencies

### This Domain Depends On

| Domain / System | Type | Contract Used |
|-----------------|------|---------------|
| `minih` | external library (exact tag) | `runAgent`, `FakeAgentAdapter`, `IAgentAdapter`, `validateInput/validateOutput/validateSystemOutput`, `resolveAgent`/`parseFrontmatter`, `SdkCopilotAdapter`; env contract `MINIH_OUTPUT_PATH`/`MINIH_PROJECT_ROOT`; `MINIH_NO_AUTO_HARVEST=1`. |
| `claude` / `codex` CLIs | external (runtime-optional) | Headless one-shot invocation for their adapters; absent ⇒ that harness errors at run time, others unaffected. |
| `@github/copilot-sdk` | optional peer | Backing SDK for the copilot adapter (minih `SdkCopilotAdapter`); absent ⇒ named-package error only when the copilot harness is used. |
| `extension-authoring-harness` | consume | `*.live.test.ts` + `describe.skipIf` conventions, `just self-check`/`harness checks` gates, vitest globs. |

### Domains That Depend On This

| Domain | Contract Used |
|--------|---------------|
| `pij-control-plane` | `DiscoveredAgent`, `agentsDir`/`tmpDir`, the runner + inline engine — consumed by the Phase 2 `pij agent` verb family; daemon consumes only the `sweepStaleTmp()` hook. |
| `agent-workbench` | Observes the minih-format `runs/<ts>/` this domain produces; no code coupling — run artifacts stay minih-owned. |

## Boundary Owns

- 3-tier pack discovery + precedence (project → user → built-in) and shadow marking.
- `runAgent` wrapping + result surfacing (frontmatter defaults, override precedence, AJV fail-fast).
- `IAgentAdapter` implementations (claude / codex / copilot).
- Temp-pack synthesis + cleanup + crash-sweep (the ephemeral/inline engine).
- The `~/.pij/agents` + `~/.pij/tmp` path contract (`agentsDir` / `tmpDir`).

## Boundary Excludes

- Run observation / UI (→ `agent-workbench`).
- The pack format + validators + run ledger (→ minih, external — never forked, never extended).
- The companion coordination protocol (→ minih coordination + RUNBOOK).
- CLI arg parsing conventions (→ `pij-control-plane` bin, which calls into this domain).

## History

| Plan | Change | Date |
|------|--------|------|
| 029-pij-agents-minih / Phase 1 | Created the `agent-runtime` domain. Embeds minih@`minih-v0.2.4` as a library; adds `paths`/`pack`/`runner`/`inline` core modules, claude/codex/copilot `IAgentAdapter`s, the AC-12 minih contract test (rides `just self-check`), an import-boundary sensor, and `PIJ_AGENT_LIVE=1` adapter live tests. CLI surface, built-ins, and docs deferred to Phase 2. | 2026-07-03 |
