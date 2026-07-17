# "PIJ Goes All Grown Up" — research report & understanding of the ask

**Date**: 2026-07-16 · **Author**: pij-civilian-takin (claude, session "grow-up") · **Status**: research only, no plan/build authorized

## The ask in one sentence

Evolve pij from a heuristic, prose-governed peer fabric into a **deterministic platform**: JSON governance, first-class **Projects**, a proper parent-child **graph** of every running node, and rich system-owned node metadata — shaped so a future UI can list projects, render the tree, and open any node's terminal.

This is PD-002 in the spine ("overhaul entire system to be more deterministic", deferred 2026-07-15) being activated with concrete scope.

## Requirements as I understand them

### R1 — Governance spine must be JSON
- Machine-readable, filterable **per pij peer** (e.g. "events relevant to node X / stream Y").
- Today: `government/spine.md` is a **336KB markdown event log** (873 lines, huge prose events + a pending-decisions table PD-001…PD-008) parsed by agents, not machines. `baton-book.md`, `orient-local.md`, briefs — all prose. Only `prime-flow.json` (schema_version'd nodes/events, rendered to md by `harness flow render`) already demonstrates the target pattern: **JSON is source of truth, markdown is a render**.

### R2 — Projects as a first-class pij entity
- Project = short description + plan link + task list(s) + assigned **prime**.
- Creation order is flexible: project may exist before its plan; link plan later.
- Plan (docs/plans/NNN) keeps the detail; the **project is what pij tracks**.
- Prime → children → orchestrators → workers: assigning a prime to a project transitively yields the whole fleet for that project.
- Primes keep a **running task list** for their project (orchestrators may be delegated the updates to keep the prime clean).
- Future (OOS now): UI listing projects, drill into primes.
- Today: nothing. Descriptor has only `folder` + `gitCommonDir` (repo grouping). No project, no task, no plan-link fields (`core/types.ts:67-170`).

### R3 — Proper node graph (DAG)
- **Every running pij has a parent except primes.** Parentless creation stays legal (human opens a fresh window) but the node is then expected to contact a prime and be **adopted** into the graph.
- Graph spans prime → orchestrators → workers/coders.
- Today: plan 046 (shipped) gives descriptor-only trees — durable `parentId` (nullable, legacy `spawnedBy` fallback via `effectiveParent()`, `core/tree.ts:15-17`), `projectSessionForest()` with orphan/cycle detection, `pij tree`/`pij link`/`adopt --parent`. Orphans are tolerated and flagged, not driven to adoption. **046's non-goals explicitly ruled out a tree database — this ask revisits that constraint.**

### R4 — Current task per node
- Each node carries a `current task`, set by the appropriate authority — usually orchestrators / direct children of the prime, who set it for themselves **and their peers**, and keep project/plan links fresh.
- The **pij skill needs a route** for this (set/update task, link plan/project).
- Today: no such field; nearest is `agentPack` slug.

### R5 — States split by owner
- **`system_state`** — owned by pij itself: working, stopped, etc. (mechanical truth).
- **Orchestrator-set state** — blocked, question, … (semantic truth). User suggests **surveying the fleet** for what other states earn a slot.
- Today: `state: working|idle` written by two owners (peer self-report `core/session.ts:413,430`; daemon pane-scrape for external harnesses `daemon/loop.ts:127-141`), plus derived `LivenessVerdict` (active/stale/dead/dissolved), `SessionLifecycle` (pending→bound→dissolved), and regex `DeathReason` classifiers documented as false-positive-prone (`core/state.ts:75-111`). The ask formalizes the two axes and makes the semantic axis writable by orchestrators.

### R6 — System-owned node metadata
- pij tracks per node: **model, context max, context current, agent (harness), thinking level** …
- Today: `boundModel` + `effort` are spawn-time pins; harness exists. **Context tracking is absent entirely** — no contextMax/contextCurrent anywhere; token usage only parsed in one-shot agent-pack reports (`core/agents/adapters/claude.ts:36-49`). Live context telemetry per harness is genuinely new plumbing.

### R7 — Terminal addressability
- Node must carry tmux window/session identity — enough to open/show it in a new terminal from a UI.
- Today: only `paneId` (`%N`, self-recorded from `$TMUX_PANE`). No window id, window name, session name.

### R8 — UI-shaped data (UI itself OOS)
- Everything above should be queryable such that a UI could: list projects → primes → live tree with states/tasks/context gauges → click node → open terminal. Determinism and JSON-everywhere are the enablers.

## Current-state facts that shape the work

1. **Registry** = per-peer JSON at `~/.pij/<id>.json` + sha256 identity/owner sidecars (`~/.pij/identities/by-native|by-pij`), atomic writes. No sqlite anywhere in the runtime — s053's "focus sqlite backend" was investigated and **disproved/folded into plan 050** (Pi .sqlite files are todo sidecars; transcripts stay JSONL).
2. **s051 identity-integrity is in flight** (G7 acceptance phase active per spine Seq ~380) — canonical identity, ownership authority, adoption correctness. The grown-up graph depends on this landing; issue #20 (spawn owner recorded from CWD not caller) is a live corruption of exactly the parent data R3 needs.
3. **Additive schema discipline is law**: `SessionDescriptor` changes must be additive/migration-safe (`core/types.ts:109` class); legacy descriptors must load.
4. **Daemon has no hot-reload**; every core/daemon change needs a governed `daemon-restart` baton.
5. Non-determinism hot spots to retire or fence: pane-scrape readiness regexes (`core/readiness.ts:44-79`), death-reason regexes, ASCII-art org trees in briefs, 336KB prose spine.

## Open questions (for Jordan / the prime — not blocking research)

1. **DAG vs tree** — "proper DAG" was said; does any node ever have two parents (e.g. adopted by prime while spawned by an orchestrator)? If strictly one parent, it's a forest of trees rooted at primes; if reassignment/adoption keeps history, that's edges-over-time, not multi-parent.
2. **Where does project/spine JSON live** — machine-wide `~/.pij` (registry-style) vs repo `government/` (versioned, single-writer)? Projects likely span worktrees but belong to a repo; spine is repo-governance. Suggest: repo-versioned JSON, single-writer, with the daemon/CLI as reader.
3. **Writer authority** — who may write which fields: pij daemon (system_state, metadata), orchestrators (task, semantic state), prime (project, spine events). Needs the s051-style authority rules extended.
4. **Projects vs flows** — `prime-flow.json` already models a portfolio of work items linked to plans. Is a Project a new peer of the flow, or does the flow become a view over Projects?
5. **Context telemetry feasibility per harness** — pi can self-report; claude/copilot/codex may only expose context via transcript/pane heuristics — decide honest `unknown` over scraped guesses?
6. **046 "no tree database" non-goal** — explicitly revisited, or does the graph stay descriptor-projected with projects/tasks layered as separate JSON?
7. **Fleet survey for extra states** (user suggested) — run as a research sub-task before fixing the state vocabulary.

## Suggested next step (when authorized)

Route through builder as a new plan (next free: 054+ / plan-folder numbering after 050) — research phase can absorb this report; the fleet state-survey and the spine-JSON schema design are the two research spikes with the most leverage.
