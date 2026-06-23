# pij Spawn / Close — pi-in-tmux-window lifecycle

**Mode**: Full
**Plan Version**: 1.0.0
**Created**: 2026-06-23
**Status**: READY
**Spec source**: unified (this file)

📚 Incorporates findings from research-dossier.md

## Business Specification

### Research Context
The pij extension (`.pi/extensions/pij/`) is a file-backed peer-messaging + observability bus with a clean hexagonal architecture: all behaviour lives in pi-free `core/` against 5 injected ports (`registry`, `eventLog`, `delivery`, `pi`, `process`); the only `@earendil-works/*` import is `adapters/pi-runtime.ts`. It can message and observe peers but **cannot create or destroy sessions**. Live probes confirmed: `pi --model <pattern>` exists; tmux 3.6a supports `new-window -e KEY=VAL`; we run inside tmux session `pij` (`$TMUX_PANE=%72`). The central risk (CF-01) is the announce-vs-initial-prompt race that already forced the subagent-child guard — so the first task is delivered by env + pij self-inject, not a positional `pi "<task>"` prompt.

### Summary
Add a **fleet-lifecycle** capability to pij: a `pij_spawn` tool that opens a new tmux **window** in the current session running `pi [--model X]`, with env injected so the child auto-reports "ready" back to the spawner and optionally self-starts a first task; and a `pij_close` tool that kills that window by pij id. Combined with the existing `pij_send`/`pij tail`, this lets a session spawn N workers, drive them, and tear them down — without leaving the cheap message-bus design.

### Goals
- Spawn a new interactive `pi` in a fresh tmux window under the current session from a tool call.
- Let the caller set the child's model **per spawn** (`provider/id[:thinking]`, e.g. a cheaper model for a cheap task) via the `model` param — or omit it to fall back to pi's configured default. Model is a first-class, per-call argument, not a fixed default.
- Have the child **automatically report "ready"** to the spawner once booted (via the existing message bus).
- Optionally hand the child an initial task that it starts on its own.
- Close a spawned child (kill its window, drop its registry entry) by pij id.
- Keep `core/` pi-free and tmux-free; confine impurity to one new adapter (P2).

### Non-Goals
- Block-until-ready spawn (we chose fire-and-forget).
- Split panes (windows only, per clarification).
- "Close all I spawned" bulk teardown and auto-close-on-shutdown (recorded as future work; `spawnedBy` is captured now to enable them later).
- Spawning non-pi processes, or spawning into a *different* tmux session / a detached session.
- Any change to the existing message/receipt/remote-command protocols.

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| pij-messaging | existing | **modify** | Add spawn/close lifecycle: new `TmuxPort`, `adapters/tmux.ts`, `core/spawn.ts`, two tools, ready-ping on boot, `paneId`/`spawnedBy` descriptor fields |

No NEW domains. `pij-messaging` is the sole touched domain (`docs/domains/pij-messaging/`).

### Testing Strategy
- **Approach**: Hybrid — pure logic gets fakes-based unit tests first; the impure tmux adapter + end-to-end behaviour is covered by a tmux-gated harness smoke.
- **Rationale**: Matches the existing pij contract (P8: tests target the store/core via `Fake*` ports; `adapters/pi-runtime.ts` and tmux are thin seams proven by smoke). The argv/env decision surface is the bug-prone part and is fully unit-testable without tmux.
- **Focus Areas**: `core/spawn.ts` argv+env matrix (model present/absent, task present/absent, special chars, announce-to/spawn-id wiring); ready-body round-trip; `PijSession.spawn()/close()` against `FakeTmux`; the `fresh`-guarded ready-ping + self-task (assert reload does NOT re-ping).
- **Excluded**: real model inference, pi's own startup correctness.
- **Mock Usage**: No mocks — reuse the existing in-repo `Fake*` port pattern (`adapters/fakes.ts`) and a new `FakeTmux`. Real tmux only in the smoke.

### Documentation Strategy
- **Location**: `docs/how/pij.md` (add a "Spawning & closing peer sessions" section) + the in-extension `AGENTS.md`/tool prompt snippets. Update the boot announce only if needed.
- **Rationale**: pij's canonical guide is `docs/how/pij.md`; keep one home.

### Complexity
- **Score**: CS-3 (medium)
- **Breakdown**: S=1, I=2, D=1, N=1, F=1, T=1
- **Confidence**: 0.80
- **Assumptions**: tmux 3.x with `-e`; `pi` on PATH; the spawned pi auto-loads pij (global link or project autoload); CF-01 resolvable by env+self-inject.
- **Dependencies**: tmux binary; `pi` binary; existing `FsChannel`/`FsRegistry`.
- **Risks**: announce-vs-initial-prompt race (mitigated by env+self-inject, CF-01); child boots but pi errors (no ready ping — documented timeout); fresh/reload idempotency leak (mitigated by `fresh` guard + test).
- **Phases**: 3.

### Acceptance Criteria
- **AC-01**: Calling `pij_spawn` from a session inside tmux opens exactly one new tmux window in the current session running `pi`, and returns immediately (fire-and-forget) with the spawn token + pane id.
- **AC-02**: `model` is a per-spawn argument. When provided (any `provider/id[:thinking]`, including a cheaper model than the spawner's), the child is launched with `--model <value>`; when omitted, `pi` is launched with no `--model` flag (pi's configured default). Two spawns in the same session may use different models.
- **AC-03**: The spawned child, once booted, sends the spawner a "ready" message (arriving framed as `[pij from <child-id>] …`) that includes the spawn token (and model/cwd), exactly once — not repeated on the child's `/reload`.
- **AC-04**: When `task` is provided, the child begins working on that task on its own after boot (self-injected), without the spawner having to send it. The self-task is sequenced so it never collides with the boot announce (see CF-01 / task 2.4): for a spawned child carrying a task, the generic announce is suppressed and the task is the child's first turn; the ready-ping rides the delivery channel (an event, not a turn), so it never triggers a second concurrent `sendUserMessage`.
- **AC-05**: The child's descriptor carries its `paneId`; `pij_close({ to })` kills that window and removes the descriptor so `pij list` no longer shows it.
- **AC-06**: `pij_close` on a peer this session did **not** spawn still works but the result text carries a warning; closing a non-existent/dead id returns a clear error, never throws.
- **AC-07**: Calling `pij_spawn` when not inside tmux (`$TMUX` unset) returns a clean error result (E-NOTMUX), not a crash.
- **AC-08**: `core/` remains free of `@earendil-works/*` and `child_process` imports; only `adapters/tmux.ts` (new) and `adapters/pi-runtime.ts` touch impure seams.
- **AC-09**: All tmux invocations use argv arrays (no shell strings); a task containing spaces/quotes is delivered intact.

### Risks & Assumptions
- **CF-01 (High)**: announce `sendUserMessage` racing pi's startup prompt → "Agent is already processing". Mitigation: deliver task via `PIJ_SPAWN_TASK` env + pij self-inject after announce on pij's turn-aware path; never `pi "<task>"` positional. Validate in smoke.
- **Assumption**: a spawned pi auto-activates pij and is NOT treated as a subagent child (`isSubagentChild` returns false — confirmed: no `PI_SUBAGENT_*` env on our spawn).
- **Risk (Low)**: `pi` missing/model invalid → window opens, no ready ping. Documented behaviour, not a crash.

### Open Questions
Resolved at plan time (recorded for provenance):
- Close authority → **any peer, warn if not spawned-by-self** (record `spawnedBy`).
- Default model → **omit `--model`** (pi default).
- Window naming → **auto-name `pi:<spawnId>`** via `new-window -n` for legibility (Recommended; adopted).
- Ready-ping content → **include child model + cwd** so the spawner's log is self-describing (adopted).

### Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| (none) | — | The design is settled via clarifications + dossier; CF-01 is verified by smoke, not workshop. | — |

### Clarifications
#### Session 2026-06-23
- **Spawn target**: new tmux **window** per child (not split pane).
- **Return semantics**: **fire-and-forget** — return immediately, ready arrives later as an inbound pij message.
- **Initial task**: optional `task` param, **delivered via env + child self-inject** (CF-01-safe).
- **Cleanup surface**: `pij_close({ to })` — close one child.
- **Workflow Mode**: Full (3 phases).
- **Testing**: Hybrid (fakes-tested core + tmux smoke); no mocks, reuse `Fake*` ports.
- **Close authority**: any peer with a `paneId`, warn if not spawned-by-self; record `spawnedBy`.
- **Model**: per-spawn `model` param (settable to any `provider/id[:thinking]`, e.g. a cheaper model for cheaper tasks). Only when the param is omitted does it fall back to pi's default — "omit → pi default" is the *fallback*, not a cap on choosing a model per launch.

## Planning Seam
_Refinement opportunities still open — recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: none — all resolved.

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| research-dossier.md | y | informs Key Findings (CF-01, PL-01..04, IC-01..06) |
| workshops/*.md | n | — |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | No `[NEEDS CLARIFICATION]` markers remain |
| G2 | Constitution | N/A | No `docs/project-rules/constitution.md`; P1–P10 (AGENTS.md) honoured throughout |
| G3 | Architecture | N/A | No `docs/project-rules/architecture.md`; hexagonal P2/P3 boundaries respected (AC-08) |
| G4 | ADR Compliance | N/A | No `docs/adr/` |
| G5 | Structure | PASS | All required sections present + populated |
| G6 | Testing Alignment | PASS | Hybrid: fakes unit tests precede/accompany impl per phase; smoke for impure seam; ACs measurable |
| G7 | Domain Completeness | PASS | Sole domain `pij-messaging` (existing) present; Domain Manifest covers every file |

### Summary
Add `core/spawn.ts` (pure argv+env + ready-body helpers), a `TmuxPort` + `adapters/tmux.ts` (the only new impure seam), then wire `PijSession.spawn()/close()` plus a `fresh`-guarded ready-ping and optional self-task in `boot()`, exposed as `pij_spawn`/`pij_close` tools in `index.ts`. Descriptor gains `paneId`/`spawnedBy`. Prove pure logic against `FakeTmux`, and the real tmux + end-to-end path with a tmux-gated harness smoke. Outcome: spawn N pis into windows, drive via existing messaging, close by id.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `.pi/extensions/pij/core/spawn.ts` | pij-messaging | internal | Pure spawn argv/env builder + ready-body framing |
| `.pi/extensions/pij/core/spawn.test.ts` | pij-messaging | internal | Unit tests for the argv/env matrix + ready-body |
| `.pi/extensions/pij/core/ports.ts` | pij-messaging | contract | Add `TmuxPort` interface |
| `.pi/extensions/pij/core/types.ts` | pij-messaging | contract | Add `SessionDescriptor.paneId?`, `spawnedBy?` |
| `.pi/extensions/pij/core/session.ts` | pij-messaging | internal | `spawn()`/`close()`, ready-ping + self-task in `boot()` |
| `.pi/extensions/pij/core/session.test.ts` | pij-messaging | internal | Cases for spawn/close + fresh-guard (no re-ping on reload) |
| `.pi/extensions/pij/adapters/tmux.ts` | pij-messaging | internal | The new impure seam: `newWindow`/`killWindow`/`currentSession` (argv-only) |
| `.pi/extensions/pij/adapters/fakes.ts` | pij-messaging | internal | Add `FakeTmux` implementing `TmuxPort` |
| `.pi/extensions/pij/index.ts` | pij-messaging | internal | Register `pij_spawn`/`pij_close` tools; wire `TmuxAdapter`; pass spawn env at boot |
| `.pi/extensions/pij/smoke.ts` | pij-messaging | internal | Extend (or add) a tmux-gated spawn→ready→close smoke |
| `docs/how/pij.md` | pij-messaging | internal | "Spawning & closing peer sessions" section |

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | CF-01: announce `sendUserMessage` can race pi's startup prompt ("Agent is already processing") — the exact failure that forced the subagent guard | Deliver task via `PIJ_SPAWN_TASK` env + pij self-inject after announce; never `pi "<task>"`. Smoke-verify. |
| 02 | High | PL-02/D-041: a spawned pi mints its OWN fresh pij id — the spawner cannot predict it | Learn child id from the ready ping (`PIJ_ANNOUNCE_TO`); do not pre-assign |
| 03 | High | PL-04: `isSubagentChild` skips ALL pij wiring; our spawn must NOT set `PI_SUBAGENT_*` | Spawn env contains only `PIJ_*` + `PIJ_ROLE`; child activates pij normally |
| 04 | High | Boot idempotency (`fresh` flag) is load-bearing for "no replay" | Gate ready-ping + self-task on `fresh && PIJ_ANNOUNCE_TO`; unit-test that reload does not re-ping |
| 05 | Medium | `harness/driver/tmux.ts` is proven argv-only tmux but CANNOT be imported (extension must not depend on `harness/`) | Copy the discipline (argv arrays, `%N` capture, swallow-on-missing) into `adapters/tmux.ts` |
| 06 | Medium | Closing a window needs an id→pane map | Spawner passes new window's `%N` as `PIJ_PANE_ID`; child persists it to its descriptor; `kill-window -t %N` |
| 07 | High | Internal CF-01 variant: `boot()` already injects the announce via `sendUserMessage`; a second immediate `sendUserMessage` for the self-task can hit pi's "Agent is already processing" | When a spawn-task is present, **suppress the generic announce** and make the task the child's single first-turn inject; send the ready-ping via `delivery.deliver` (an event, never a turn). Never two concurrent injects at boot. |

### Phases

#### Phase Index

| Phase | Title | Primary Domain | Objective (1 line) | Depends On |
|-------|-------|---------------|-------------------|------------|
| 1 | Pure spawn core + TmuxPort + tmux adapter | pij-messaging | Build the pi-free argv/env builder + ready-body, the `TmuxPort` seam, the real tmux adapter, and `FakeTmux` | None |
| 2 | Session wiring + tools + ready-ping | pij-messaging | `PijSession.spawn()/close()`, `fresh`-guarded ready-ping + self-task, `pij_spawn`/`pij_close` tools, descriptor fields | Phase 1 |
| 3 | Smoke + docs | pij-messaging | tmux-gated spawn→ready→close smoke; document in `docs/how/pij.md`; self-check | Phase 2 |

#### Phase 1: Pure spawn core + TmuxPort + tmux adapter

**Objective**: Establish the testable, pi-free core and the single new impure seam before any session wiring.
**Domain**: pij-messaging
**Delivers**:
- `core/spawn.ts`: `buildSpawnCommand({ model?, task?, spawnId, announceTo, paneId?, cwd, role }) → { cmd: "pi", args: string[], env: Record<string,string> }`; `readyBody(spawnId, model, cwd)` + `parseReadyBody(body)`.
- `core/ports.ts`: `TmuxPort` with `newWindow(opts) → Result<{ paneId }>`, `killWindow(paneId) → Result<void>`, `currentSession() → string | null`.
- `adapters/tmux.ts`: argv-only `execFileSync` implementation; capture `%N` from `new-window -P -F '#{pane_id}'`; `-e` env; `-n pi:<spawnId>` name; `kill-window` swallow-on-missing; `currentSession()` from `$TMUX_PANE`/`display-message`.
- `adapters/fakes.ts`: `FakeTmux` recording `newWindow`/`killWindow` calls and returning a synthetic `%N`.
**Depends on**: None
**Key risks**: argv/env correctness (the bug-prone surface) — covered by unit tests.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1.1 | Add `TmuxPort` to `core/ports.ts` | pij-messaging | Interface compiles; pi-free; returns `Result<>` (P4) | |
| 1.2 | Write `core/spawn.ts` argv/env builder + ready-body helpers | pij-messaging | Pure; no pi/child_process import (AC-08) | Per finding 01/06 |
| 1.3 | Write `core/spawn.test.ts` (matrix: model ±, task ±, special chars; ready-body round-trip) | pij-messaging | `just test` green; covers AC-02/AC-09 framing | tests precede/accompany 1.2 |
| 1.4 | Implement `adapters/tmux.ts` (argv-only newWindow/killWindow/currentSession) | pij-messaging | Captures `%N`; no shell strings (AC-09) | Mirror `harness/driver/tmux.ts` (finding 05) |
| 1.5 | Add `FakeTmux` to `adapters/fakes.ts` | pij-messaging | Implements `TmuxPort`; usable in session tests | |

#### Phase 2: Session wiring + tools + ready-ping

**Objective**: Wire the lifecycle into `PijSession` and expose the two tools, with the CF-01-safe task path and idempotent ready-ping.
**Domain**: pij-messaging
**Delivers**:
- `core/types.ts`: optional `paneId?`, `spawnedBy?` on `SessionDescriptor`.
- `core/session.ts`: `spawn(input) → Result<{ spawnId; paneId }>` (build via `core/spawn.ts`, call `TmuxPort.newWindow`, record `spawnedBy`); `close(id) → Result<void>` (descriptor → `killWindow` → `registry.remove`, warn if not spawned-by-self); on `fresh && PIJ_ANNOUNCE_TO`: persist `paneId`, `delivery.deliver` ready ping, self-inject `PIJ_SPAWN_TASK`.
- `index.ts`: register `pij_spawn` + `pij_close` tools (thin, like `pij_send`); construct real `TmuxAdapter`; read `$TMUX_PANE`/spawn env at boot and pass into `PijSession`.
**Depends on**: Phase 1
**Key risks**: fresh/reload idempotency leak (finding 04) — explicit test.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.1 | Add `paneId?`/`spawnedBy?` to `SessionDescriptor` | pij-messaging | Old descriptors still parse (additive) | AC-05 |
| 2.2 | `PijSession.spawn()` against `TmuxPort` | pij-messaging | Returns `Result`; records `spawnedBy`; FakeTmux asserts newWindow args | AC-01/AC-02 |
| 2.3 | `PijSession.close()` | pij-messaging | Kills by `paneId`, removes descriptor, warns if not mine, clean error on missing | AC-05/AC-06 |
| 2.4 | Ready-ping + self-task in `boot()`, `fresh`-guarded | pij-messaging | Pings once via delivery (no turn); reload does NOT re-ping (test); when a spawn-task is present the announce is suppressed so only ONE `sendUserMessage` fires at boot | AC-03/AC-04, finding 01/04/07 |
| 2.5 | `session.test.ts` cases (spawn/close/ready/self-task/reload-no-reping) | pij-messaging | `just test` green | covers AC-03/04/05/06 |
| 2.6 | Register `pij_spawn`/`pij_close` tools + wire `TmuxAdapter` in `index.ts` | pij-messaging | `just typecheck` green; E-NOTMUX when `$TMUX` unset (AC-07) | thin tools like `pij_send` |

#### Phase 3: Smoke + docs

**Objective**: Prove the real tmux + end-to-end path and document the capability.
**Domain**: pij-messaging
**Delivers**:
- Extend `smoke.ts` (or add a scenario) — tmux-gated: spawn a child, assert it registers as a peer + ready ping lands, then `pij_close` removes the window.
- `docs/how/pij.md`: "Spawning & closing peer sessions" section (env contract, fire-and-forget, ready ping, close).
**Depends on**: Phase 2
**Key risks**: smoke environment (must be inside/able to start tmux) — gate on tmux availability, skip cleanly otherwise.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 3.1 | tmux-gated spawn→ready→close smoke | pij-messaging | Smoke passes locally; skips cleanly without tmux | validates CF-01 (finding 01) end-to-end |
| 3.2 | Document in `docs/how/pij.md` + tool prompt snippets | pij-messaging | Section covers env contract, ready ping, close | |
| 3.3 | `just self-check` (typecheck→lint→test→smoke→pkg audit→snapshots) | pij-messaging | Exits 0 | per AGENTS.md done-contract |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01 | 2.2, 2.6, 3.1 | `spawn()` test + smoke (one new window, immediate return) |
| AC-02 | 1.2, 1.3 | `spawn.test.ts` argv matrix (model ± → `--model` ±) |
| AC-03 | 2.4, 2.5, 3.1 | `session.test.ts` ready-ping once + reload-no-reping; smoke ping lands |
| AC-04 | 2.4, 2.5, 3.1 | self-task injected after boot; smoke child starts task |
| AC-05 | 2.1, 2.3, 3.1 | descriptor `paneId`; `close()` removes + kills; smoke window gone |
| AC-06 | 2.3, 2.5 | warn-if-not-mine + clean error on missing/dead |
| AC-07 | 2.6 | E-NOTMUX path when `$TMUX` unset |
| AC-08 | 1.2, 1.4 | grep/test: no `@earendil-works/*`/`child_process` in `core/` |
| AC-09 | 1.3, 1.4 | argv-array tmux calls; special-char task round-trip |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Announce vs initial-prompt race (CF-01) | Medium | High | Task via env + pij self-inject; never positional `pi "<task>"`; **and** at boot suppress the announce when a task is present so only one `sendUserMessage` fires (finding 07); smoke-verify |
| fresh/reload ready-ping leak | Low | Medium | `fresh && PIJ_ANNOUNCE_TO` guard + explicit reload-no-reping test (finding 04) |
| `pi`/model missing → no ready ping | Low | Low | Window opens; documented timeout; not a crash |
| tmux absent / not in session | Low | Low | `$TMUX` gate → E-NOTMUX result (AC-07); smoke skips cleanly |
| Shell-injection via task text | Low | Medium | argv arrays only (AC-09), copied from harness tmux discipline (finding 05) |

---

## Validation Record (2026-06-23)

### Validation Thesis
**Raison d'être**: Give an implementation agent enough to add a `pij_spawn`/`pij_close` lifecycle to the pij extension without breaking its hexagonal architecture (pi-free core, single impure pi seam).
**Value claim**: Dynamic multi-pi workflows become possible — spawn N workers into tmux windows, drive them via the existing bus, close by id — cheaply and safely.
**Artifact promise**: Phases hand each other concrete contracts (TmuxPort + `core/spawn.ts` → session wiring → smoke); the implementor needs minimal clarification.
**Intended beneficiaries**: the implement/ship stages; future pij users orchestrating fleets.
**Proof target**: Implementation.
**Evidence standard**: source-code match against the live pij extension; internal coherence; testable ACs.
**Thesis source**: research-dossier.md + the user's original ask + live source reads.
**Thesis verdict**: Advanced.
**Main thesis risk**: the announce-vs-inject boot race (CF-01 + finding 07) — now mitigated in the plan and gated by a smoke.

### Method note
Validation was performed by the **parent** session (full `ctx_*` tools), not by subagents: the builtin `reviewer` agent in this session exposes only `edit`/`write` (no read/grep), the documented tool-allowlist mismatch — so both fan-out children returned BLOCKED and were not trusted. Source-truth claims were re-verified directly.

| Agent | Lenses Covered | Issues | Verdict |
|-------|---------------|--------|---------|
| Parent (source-truth/coherence/thesis) | Source-Truth, Coherence, Thesis Alignment, Doctrine (P1–P10) | 1 HIGH fixed (finding 07), 1 LOW noted | ⚠️ → ✅ |
| Parent (forward-compat/risk) | Forward-Compatibility, Completeness/Risk, Evidence Sufficiency | 0 open | ✅ |

**Source-truth checks (all PASS):** `core/` has no real `@earendil-works`/`child_process` imports (grep: comments only) → pure-core feasible (AC-08); exactly 5 ports in `PijPorts` (registry/eventLog/delivery/pi/process) → TmuxPort is additive; `PijSession.boot()` carries the `fresh` flag (`existing === null`) → ready-ping idempotency is implementable; `FsChannel.deliver` exists → ready-ping transport is reused; `SessionDescriptor` is a structural interface with optional fields → `paneId?`/`spawnedBy?` are additive; `isSubagentChild` exists in `discovery.ts` → finding 03 is grounded.

**LOW (not blocking):** the prose says "TmuxPort joins the 5 ports" — it becomes the 6th port; cosmetic.

### Forward-Compatibility Matrix

| Consumer | Requirement | Failure Mode | Verdict | Evidence |
|----------|-------------|--------------|---------|----------|
| Phase 2 (session wiring) | TmuxPort interface + `core/spawn.ts` `buildSpawnCommand` signature + FakeTmux from Phase 1 | shape mismatch | ✅ | Phase 1 Delivers list enumerates the port methods + builder signature + FakeTmux |
| Phase 3 (smoke) | descriptor `paneId`/`spawnedBy` + `pij_spawn`/`pij_close` tools from Phase 2 | encapsulation lockout | ✅ | Phase 2 Delivers the fields + both tools; smoke asserts ready-ping + window removal |
| the-flow implement/ship | testable ACs + Domain Manifest + Coverage Map | contract drift | ✅ | AC-01..09 measurable; Manifest covers every task-table file; Coverage Map complete |

**Thesis alignment**: Value claim advanced at Implementation proof level; main residual risk (boot inject race) is mitigated in-plan (finding 07) and smoke-gated.
**Outcome alignment**: As written, the plan advances the user's outcome — "spawn a bunch of pis, do work, then close them and remove their windows" — because each phase delivers the concrete contract the next consumes and the lifecycle (spawn→ready→drive→close) is fully covered by ACs.
**Standalone?**: No — downstream phases + the-flow stages consume this plan.

Overall: ✅ VALIDATED WITH FIXES
