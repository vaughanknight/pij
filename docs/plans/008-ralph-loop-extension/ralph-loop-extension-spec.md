# Ralph Loop pi extension

**Mode**: Simple

📚 *This specification incorporates findings from `research-dossier.md` and `external-research/ralph-loop-provenance.md`.*

## Research Context

The research dossier and verified external research establish:

- **Ralph Loop** is a community-recognized agentic-coding pattern coined by Geoffrey Huntley (@ghuntley). Canonical post: <https://ghuntley.com/ralph/>. Verbatim definition: *"Ralph is a Bash loop."*
- **Mechanism**: an external loop re-invokes a near-stateless coding agent with **fresh context per iteration** against a long-lived plan/PRD file; durable state lives in the filesystem (git history, `progress.txt`, `prd.json`). The agent terminates the loop by emitting `<promise>COMPLETE</promise>`; absent that, a stop-hook re-injects the prompt.
- **Community defaults**: `snarktank/ralph` ships a default of **10 iterations** and `--tool amp | claude`. Anthropic ships an official "Ralph loop" plugin for Claude Code.
- **Economics**: a Sonnet-4.5-class Ralph runs at approximately **$10.42/hr** (Huntley via LinearB / Dev-Interrupted).
- **Compaction-avoidance is design intent** — Huntley: *"a deliberate attempt to minimize allocation so I never get a compaction event."* This connects directly to pij's open D-005 (custom-entry durability across `/compact`).
- **Failure modes** are well-documented: 40k-line PRs, cost overruns without iteration caps, destructive edits when write secrets are exposed.
- **Pi extension authoring path in pij is fully mapped**: T2 layout via `npm run new -- ralph-loop`, P1–P10 patterns, event-sourcing via `pi.appendEntry`, smoke via tmux/Driver SDK, link script for cross-cwd autoload.

The most relevant adjacent prior learnings are **D-005** (compact durability — Ralph is the natural re-test), **D-006** (status-pill clear semantics), **D-018** (notify level), and **D-019** (`slice(-0)` gotcha if we paginate iteration history).

## Summary

**WHAT** — a pi extension that drives a *Ralph Loop* against an existing plan/PRD file, taking the user from "I have a list of work" to "all of it is done (or we hit a hard stop)" with no per-iteration babysitting.

**WHY** — to give pi a first-class long-running, plan-driven autonomous mode that:

1. Reuses pi's existing model selection, auth, and tool ecosystem (no parallel runtime).
2. Encodes the discipline that distinguishes a productive Ralph from a runaway `while true` (one task per iteration, explicit stop conditions, event-sourced history, observable status).
3. Exercises every part of the pij harness in one feature — scaffold, custom command, custom tool, persistence, smoke harness, status pill, link script — making this build the harness's strongest single dogfood.
4. Provides the natural re-test vehicle for **D-005** (custom-entry durability across `/compact`) — the most important open pij difficulty.

## Goals

- A user can point pi at a plan/PRD file and run a bounded Ralph Loop against it from inside a normal pi session, observing iteration-by-iteration progress in the footer pill.
- Stop conditions (iteration cap, sigil token, cost cap, time cap, repeated-task fingerprint, manual `STOP`) are **always enforced**, with the final run summary clearly stating which condition fired.
- Iteration history is **event-sourced and durable** across reload, resume, fork, and crucially `/compact`.
- The extension makes attribution explicit (links Huntley's canonical post in `/ralph status` and README), and uses the community-standard `<promise>COMPLETE</promise>` completion sigil rather than inventing a new one.
- The extension can be authored, smoke-tested, and shipped using only existing pij harness tooling (`npm run new`, `npm run typecheck`, `npm test`, `npm run smoke`, `npm run self-check`). If any of those leak, that leak is captured in the difficulty ledger and encoded back into the harness.
- The build measurably improves at least one piece of harness infrastructure beyond just adding the extension (template, lint rule, driver SDK primitive, or a new difficulty-derived helper).

## Non-Goals

- **Reimplementing pi's agent loop or model dispatch inside the extension.** The extension orchestrates; pi (and whichever model the user picked) does the work.
- **Multi-Ralph swarms / "Gas Town"-style parallel orchestration.** v1 is a single sequential loop. Future work can compose with the already-installed `npm:pi-subagents`.
- **Auto-pushing to remote.** Iterations may commit locally (configurable); they must never `git push` in v1.
- **Cross-session "background" Ralph that survives pi exit.** v1 lives inside one pi session. Survival across `/compact`, reload, resume, fork — yes. Survival across the user quitting pi — no.
- **Reinventing model selection.** The user chooses their model via existing pi mechanisms (`/model`, `~/.pi/agent/models.json`, `--model` — see RUNBOOK § "Custom / unlisted pi models" and D-020).
- **Sandboxing / isolated worktrees per iteration.** The user opts in by starting pi in a worktree. The extension does not create or manage worktrees in v1.
- **Generating PRD/plan files from scratch.** v1 reads an existing plan file the user (or another tool) authored. Reverse-Ralph (extract specs from code) is a separate feature.
- **Authoring our own canonical prompt.** v1 uses prompts adapted from `snarktank/ralph` and `ghuntley/how-to-ralph-wiggum` with attribution; we do not invent a new "pij Ralph prompt" wholesale.

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| `agentic-loops` | **NEW — formalize first** | **create** (pre-build) | Establish as the home for Ralph Loop and related "outer-loop drives a near-stateless agent" patterns. The Ralph extension is its first concrete inhabitant; existing assets (`agents/extension-validator/`, `agents/code-review-companion/`, the installed `npm:pi-subagents`) become candidate members. **Per Q5, formal domain extraction runs BEFORE the extension build** (Phase 0). |

> Per Q5 clarification, formal extraction (`/plan-v2-extract-domain` producing `docs/domains/registry.md` + `docs/domains/agentic-loops/domain.md`) is **load-bearing** and runs as Phase 0, not after the build. The Target Domains table reflects this; Complexity / Phases sections updated accordingly.

### New Domain Sketches

#### `agentic-loops` [NEW]

- **Purpose**: capture the family of patterns where an *outer driver* (shell, extension, harness) repeatedly invokes a *near-stateless agent* against a *durable goal artifact* (PRD, plan, spec) until a checkable stop condition fires. Ralph Loop is the canonical instance; multi-agent swarms, validator harnesses, and review companions are siblings.
- **Boundary Owns**: stop-condition semantics, iteration history schema, plan/PRD-file consumption protocols, attribution conventions for community patterns, the "fresh context per iteration" discipline.
- **Boundary Excludes**: model selection (belongs to pi core / user config); auth (pi core); file-edit tools (pi core); subagent dispatch protocol (lives in the consumer extension, e.g. `npm:pi-subagents`); git operations beyond local commits (user's responsibility); worktree creation/teardown (out of scope for v1).

## Complexity

- **Score**: CS-3 (medium) — *upgraded effort with Shape C + Phase 0 domain extraction, but still bounded; revisit at end of clarify*
- **Breakdown**: S=1, I=2 (↑ from 1 — SDK `createAgentSession` is a newer surface than `appendEntry`/`registerTool`), D=1, N=1, F=1, T=1 → P=7 → still CS-3 (5–7 band) at the top of the band
- **Confidence**: 0.65 (↓ from 0.75 — Shape C SDK lifecycle has more unknowns than Shape A; Phase 0 outcome may further redefine the build)
- **Assumptions**:
  - **Shape C** (per Q6): each iteration spins a fresh `createAgentSession()` in the extension process. Per-iteration teardown returns resources cleanly; the SDK exposes enough hooks for event capture, cancellation, and (if available) cost accounting.
  - **Plan-file format** (per Q7): markdown with `- [ ]` / `- [x]` task lines. Optional `<!-- ralph: done -->` HTML-comment markers, or a final `STOP` line, also recognized.
  - **Phase 0 domain extraction** (per Q5): `/plan-v2-extract-domain` produces `docs/domains/registry.md` + `docs/domains/agentic-loops/domain.md` with at least: purpose, boundary owns/excludes, contracts in/out, first inhabitant (ralph-loop), candidate members (pi-subagents, extension-validator, code-review-companion).
  - The user supplies a working model selection (e.g. `github-copilot/claude-sonnet-4.6`) before starting a run.
  - Per-iteration cost/token accounting is available from the SDK's session/event stream. If it isn't, that's a difficulty row, not a blocker.
- **Dependencies**:
  - Pi `ExtensionAPI` surface (`registerCommand`, `registerTool`, `appendEntry`, `on("session_start")`, `ctx.ui.{setStatus, notify, confirm}`). Stable.
  - **Pi SDK** — `createAgentSession`, `AuthStorage`, `ModelRegistry`, `SessionManager`, `ResourceLoader`. Newer surface than the extension event API; documented in `sdk.md`.
  - Existing pij harness (`npm run new`, smoke, Driver SDK at `harness/driver/`). Stable.
  - User-provided markdown plan file on disk.
- **Risks**:
  - **R1 (high)**: `customType` entries may not survive `/compact` (D-005). Unchanged. Build surfaces evidence either way.
  - **R2 (medium, NEW)**: SDK session lifecycle bugs leak across iterations — e.g., loaded extensions persisting state, file handles, listeners. Mitigation: per-iteration session is torn down in a `finally`; tests assert no listener/handle leaks across 10 fixture iterations.
  - **R3 (medium)**: stop-condition logic is the actual product; if any condition is bypassable in practice, the safety story collapses. Mitigation: tagged-union exhaustive-match in `store.ts`, tested per-case.
  - **R4 (low→medium)**: per-iteration cost accounting may be partial through the SDK event stream. Iteration-cap-only enforcement remains a fallback.
  - **R5 (low)**: workshop 003 / template drift bugs (D-018, D-019) repeat in this extension. Mitigation: templates carry encoded fixes; per-extension AGENTS.md re-asserts the patterns.
  - **R6 (medium, NEW)**: Phase 0 domain extraction may reshape boundaries enough that the extension's own surface changes (e.g., stop-condition vocabulary becomes a domain contract). Mitigation: time-box Phase 0; if extraction stalls, fall back to a 1-page `docs/domains/agentic-loops/domain.md` and proceed.
- **Phases** (Simple Mode — single delivery PR, but with **Phase 0 prerequisite**):
  1. **Phase 0 — Domain extraction (prerequisite)**: run `/plan-v2-extract-domain` (or workshop) producing `docs/domains/registry.md` + `docs/domains/agentic-loops/domain.md`. Output is a contract; the extension build implements against it.
  2. **Phase 1 (the build, single-phase under Simple Mode)**:
     - **Step 1.A** Baseline measurement: timestamp `npm run new -- ralph-loop`.
     - **Step 1.B** Store + stop conditions: pi-free `store.ts` with tagged-union stop verdicts, iteration replay, malformed-entry guards, markdown-plan parser, vitest coverage (Hybrid testing strategy).
     - **Step 1.C** Wiring: `/ralph` command surface (`start | stop | status | plan`), the SDK-driven iteration runner (Shape C), `ralph_check_stop` tool exposure if useful, status pill, P10 single `session_start` handler.
     - **Step 1.D** Smoke + D-005 verification: tmux scenario covering happy path, max-iter stop, and `/compact`-survival. AC-05 gate.
     - **Step 1.E** Docs + harness gift: README row, RUNBOOK recipe, per-ext AGENTS.md, `docs/how/ralph-loop.md`, velocity-log entry, **one encoded harness improvement** (AC-12).

## Acceptance Criteria

Each criterion is framed as an observable outcome; all must hold for v1.

1. **AC-01 — `/ralph start <plan-file>` registers**: from inside a running pi session in the pij root, typing `/ralph start ./PLAN.md` against a fixture plan with one task starts a run, with the footer pill displaying `ralph: iter 1/N` within 5 seconds.
2. **AC-02 — Default iteration cap = 10**: with no override, a run terminates at iteration 10 if no other stop fires. The final notification states which condition fired.
3. **AC-03 — Completion sigil**: when the agent emits `<promise>COMPLETE</promise>` (the community-standard token, attributed in the prompt), the loop stops and the final notification says so.
4. **AC-04 — Stop-reason transparency**: every run end produces a structured summary listing `iterations`, `stopReason`, `durationMs`, and (if available) `costUsd`. `stopReason` is one of a closed set: `complete | max_iterations | budget_usd | budget_wallclock | spinning | manual_stop | user_cancel | unverified`.
5. **AC-05 — `/compact` durability (D-005 verification)**: a smoke scenario that runs the loop for 3 iterations, issues `/compact`, then queries iteration history MUST return all 3 iterations. If this fails, the failure is captured in the difficulty ledger and surfaced upstream to pi-mono (not silently swallowed).
6. **AC-06 — Replay across all `session_start` reasons (P10)**: one handler covers `startup | reload | new | resume | fork`; iteration history reconstructs identically in each case. Verified by store-level vitest replay tests.
7. **AC-07 — Patterns P1–P10 enforced**: store is pi-free (P2); side effects injected via constructor (P3); tagged-union returns (P4); constants in store (P5); structural entry types at boundary (P6); `.js` extensions on relative imports (P7); tests target the store (P8); persist-before-mutate (P9); single `session_start` handler (P10). Verified by `npm run typecheck && npm run lint && npm test && npm run smoke -- ralph-loop`.
8. **AC-08 — One task per iteration**: the prompt the extension injects (and its README) makes "one task per iteration. Only one thing." explicit, attributed to Huntley.
9. **AC-09 — Attribution**: `/ralph status` (or equivalent) shows a short attribution line linking <https://ghuntley.com/ralph/>; per-extension `AGENTS.md` and the project README mention Huntley as the originator.
10. **AC-10 — No-push guarantee**: across all v1 code paths, the extension never invokes `git push`. Verified by grep + smoke + per-extension AGENTS.md rule.
11. **AC-11 — Status-pill cleanup (D-006 compliance)**: when no run is active, the pill clears via `setStatus(..., undefined)`, not `""`.
12. **AC-12 — Harness improvement landed (minih adoption)**: the v1 build dogfoods **minih's code-review-companion in Power-On-Mode** from the start (`minih run code-review-companion` boots at plan kickoff; `review-request` task pings fire at every commit boundary; `control:stop` + farewell envelope on plan completion; `docs/retros/code-review-companion.md` is auto-appended). The commit message or velocity-log row names this adoption as the harness gift. Per-plan companion use becomes the new pij standard, captured in `docs/project-rules/harness.md` (or a successor `docs/project-rules/agent-harness.md`) at the end of this plan.
13. **AC-13 — Velocity log entry**: a new row in `docs/velocity.md` records start/end timestamps for the build (T0 = `npm run new -- ralph-loop`, T1 = `/ralph` command first registers in pi), with comparison commentary against the v1 baseline.

## Risks & Assumptions

(Detailed in Complexity § Risks/Assumptions. Headline items only here.)

- **R1 / D-005 verification is the load-bearing AC**. If `/compact` drops custom entries today, this build surfaces it. We do not pretend otherwise.
- **R2 / Shape A vs C tradeoff** is the principal architectural question. v1 chooses A for speed and reversibility; v2 may switch to C (SDK `createAgentSession`) for true per-iteration fresh context.
- **Cost accounting may be partial.** If pi does not yet expose per-iteration token/cost in the extension context, iteration-cap-only enforcement is acceptable for v1 (with a TODO in `store.ts` and a difficulty row).
- **The prompt is borrowed, not invented.** We use community-standard prompt shapes (snarktank, Huntley's teaching repo) with explicit attribution, not a from-scratch pij prompt.

## Testing Strategy

- **Approach**: Hybrid — TDD-grade coverage for `store.ts` (stop conditions, replay, P6 structural guards, malformed-entry tolerance); lightweight integration via tmux smoke for the wiring layer; one decisive `/compact`-survival smoke that gates AC-05.
- **Rationale**: matches scratch's proven pattern and respects P8 (tests target the store). The split lets us be exhaustive where bugs hide (stop-condition truth table; replay determinism) without paying TDD overhead for trivial wiring.
- **Focus areas**:
  - `store.ts` stop-condition tagged-union exhaustiveness (one test per `StopReason` case).
  - Replay determinism across all `session_start` reasons.
  - `/compact`-survival smoke (AC-05 / D-005).
  - One end-to-end happy-path tmux smoke.
- **Excluded**:
  - Per-method tests on `index.ts` wiring (covered by smoke).
  - Performance benchmarks (negligible vs LLM call cost).
  - Auth / model-selection paths (out of scope per Non-Goals).
- **Mock usage policy**: **Targeted mocks** — mock only the constructor-injected boundary (`appendFn` and any optional `runIteration` driver). Use real fixture plan files, real timestamps, real iteration history. Reuses the existing `harness/test-utils.ts` `makeRecorder()` helper, matching D-016's encoded fix.

## Documentation Strategy

- **Location**: Hybrid — five touchpoints, each minimal and load-bearing.
  - `README.md` — one-row mention in the "Where things are" table.
  - `RUNBOOK.md` — short "How to start a Ralph Loop" section with the safety preface (no write-secrets; iteration cap; attribution) **and** a new "Companion mode (minih)" section documenting Power-On-Mode for any plan from 008 onward.
  - `.pi/extensions/ralph-loop/AGENTS.md` — per-extension rules + P1–P10 reassertions + Huntley attribution.
  - `docs/how/ralph-loop.md` — the deep how-to: plan-file conventions, default prompt with attribution + link to <https://ghuntley.com/ralph/>, full stop-condition reference table, troubleshooting (especially the D-005 escalation path).
  - `docs/retros/code-review-companion.md` — already exists; minih auto-appends a new entry per companion run. Plan 008 is the first plan that uses this from the start of the build (rather than retroactively).
- **Rationale**: matches the D-020 ("custom models") pattern that just shipped — README pointer + RUNBOOK recipe + ledger row + dedicated how-to — and extends it with the minih retro-harvest loop now formalized as part of pij's agent harness (Q8).

## Open Questions

1. **Shape A vs Shape C for v1** — in-session tool-driven (A) ships in a day and proves the protocol but shares user context; SDK-based fresh-context-per-iteration (C) is the durable form but adds session-lifecycle complexity. Spec assumes A; clarify confirms.
2. **Plan/PRD file format** — markdown-with-checkboxes (lighter, human-friendly) or snarktank-style `prd.json` (structured, agent-friendly)? Spec assumes markdown for v1; clarify confirms.
3. **Default cost cap** — $5? $10? no cost cap, only iteration cap, for v1? Spec leaves this `[NEEDS CLARIFICATION: default-cost-cap]`.
4. **Commit cadence** — commit after every successful iteration (snarktank default), only at run end, or configurable? Spec assumes per-iteration commits, configurable; clarify confirms.
5. **`progress.txt` ownership** — does the extension write progress notes itself, or does the agent (via pi's file tools) own that file? Spec assumes the agent owns it, the extension only reads it for stop-condition evaluation; clarify confirms.
6. **`/compact` posture if D-005 fails** — treat as a pi-mono bug to escalate (no in-extension workaround) or attempt an in-extension shadow log? Spec assumes "escalate, do not paper over"; clarify confirms.
7. **Spinning detection** — "same task fingerprint N consecutive iterations" — what's the right N default (2? 3? 5?) and what counts as "same task fingerprint" (title hash, file-set hash, diff hash)? `[NEEDS CLARIFICATION: spinning-default + spinning-fingerprint]`
8. **One harness improvement to encode** — the spec mandates AC-12 ("harness improvement landed") but does not pre-pick one. Should clarify settle on a candidate (e.g., Driver SDK `compactAndAssert(history)` helper, or template marker for "extensions that must survive /compact") or leave it emergent? Spec leaves it emergent; clarify confirms.

## Clarifications

### Session 2026-05-15

- **Q1 — Workflow Mode**: **A (Simple)**. Single-phase plan, plan-4/plan-5 optional, Testing Strategy defaults to Lightweight unless explicitly upgraded in a subsequent question. Rationale: although CS-3 by rubric, the extension itself is small (~400–600 LOC across 5 files from the template) and pij precedent (scratch v0.2) was effectively single-phase. The two load-bearing concerns (D-005 verification AC-05 and harness-improvement AC-12) remain gated by smoke + commit-message check; they do not require formal multi-phase dossiers.
- **Q2 — Testing Strategy**: **Hybrid** — TDD-grade store; lightweight smoke wiring; decisive `/compact`-survival smoke gating AC-05. Captured in `## Testing Strategy`.
- **Q3 — Mock Usage**: **Targeted mocks** — only at the constructor-injected boundary (`appendFn`, optional `runIteration`); real fixture plan files + real timestamps. Captured in `## Testing Strategy` § Mock usage policy.
- **Q4 — Documentation Strategy**: **Hybrid** — README row + RUNBOOK recipe + per-extension AGENTS.md + `docs/how/ralph-loop.md` deep guide (where the borrowed-with-attribution prompt and stop-condition reference live). Captured in `## Documentation Strategy`.
- **Q5 — Domain Review**: **Formalize `agentic-loops` BEFORE this build**. Phase 0 prerequisite: run `/plan-v2-extract-domain` (or a 2c workshop) to produce `docs/domains/registry.md` + `docs/domains/agentic-loops/domain.md`. The extension implements against that contract. Captured in `## Target Domains` and `## Complexity` § Phases.
- **Q6 — Inner-loop Shape**: **Shape C — SDK in-process fresh-context**. Each iteration spins a fresh `createAgentSession()` in the extension process. Canonical Ralph form, durable; higher v1 complexity than A. Spec assumptions, dependencies, risks, and AC list updated to reflect SDK lifecycle ownership.
- **Q7 — Plan/PRD file format**: **Markdown checkboxes** for v1. Tasks expressed as `- [ ]` / `- [x]`; recognized stop markers include `<promise>COMPLETE</promise>` in agent output (per external research) and an explicit `STOP` line in the plan file. Adapter interface NOT mandated for v1 (keep it lean); design notes captured for v2 prd.json support.
- **Q8 — Agent Harness Readiness**: **Adopt minih as the agent harness** (overrides the original A/B/C choices). pij's BIO-loop substrate (L2 — `npm install` / `pi` / `npm run self-check`) stays as the engineering harness; minih sits on top as the **agent harness layer**, providing companion-mode review, structured retros, and the magic-wand feedback loop. minih is already installed globally (v0.1.6), `agents/code-review-companion/` is already in this repo and healthy under `minih doctor`, and `docs/retros/code-review-companion.md` already carries prior-run history (T0 = 2026-05-09). The Plan 008 build is the first plan where the companion is invoked from the start as part of the standard workflow. AC-12 (one harness improvement landed) is therefore satisfied **structurally**: the harness gift IS "minih + companion-mode is now the default for every plan," which the build then dogfoods.

> **2026-05-15 update — companion blocked by D-022 (escalated from D-017)**. Two consecutive boots wedged at ~6 s on the state-schema mismatch (`MCP server 'minih-coordination': state does not match inside state schema`). Briefing + workshop review-request landed in the inbox but the companion never reached its long-poll loop. AC-12 is therefore partially satisfied: minih *adoption infrastructure* is documented (this Q8 + Documentation Strategy + RUNBOOK), but the actual *review loop* cannot run until either AI-Substrate/minih#27 is fixed upstream OR we fork the companion prompt locally to use schema-compliant state values (`idle`/`in-progress`/`paused`/`reviewing`/`complete`/`error`). Plan-3 must decide: ship without companion review (note in difficulty ledger), or take the fork detour as a Phase 0 add. Recommendation: ship without; D-022 is honest signal that minih's companion mode is not yet production-ready in our env.

### Cross-question tension surfaced for user review

Q1 (Simple Mode), Q5 (formalize-domain-first Phase 0), Q6 (Shape C SDK), and Q8 (minih-as-agent-harness adoption) compound. Simple Mode normally implies a single delivery without prerequisite phases, but Q5 adds a Phase 0 domain extraction and Q8 promotes the agent harness one level. Spec keeps Mode = Simple but **labels Phase 0 explicitly as a prerequisite phase outside the single-phase delivery**, and folds Q8 into the always-on workflow (no extra phase — the companion just runs alongside the build). If this proves uncomfortable in practice, revisit Mode at plan-3 entry.

## Workshop Opportunities

All four workshops landed 2026-05-15 (single batch). Spec deltas captured back into the relevant sections; cross-references below.

| Topic | Type | Workshop file | Status | Key outputs |
|-------|------|---------------|--------|-------------|
| Stop condition catalog and defaults | State Machine | [`workshops/001-stop-condition-catalog.md`](workshops/001-stop-condition-catalog.md) | ✅ Draft (Implementation Ready) | Closed `StopReason` tagged-union (8 cases); evaluation order; spinning algorithm (SHA-1 last-N); defaults table; tie-break matrix |
| Inner-loop shape (Shape C SDK lifecycle) | Integration Pattern | [`workshops/002-sdk-iteration-lifecycle.md`](workshops/002-sdk-iteration-lifecycle.md) | ✅ Draft (Contract Ready) | `IterationRunner` interface; sequence diagram; cancellation contract (`AbortSignal`); resource ownership ledger; failure-mode catalogue |
| Plan/PRD file format and schema | Data Model | [`workshops/003-plan-file-format.md`](workshops/003-plan-file-format.md) | ✅ Draft (Contract Ready) | Markdown grammar; `PlanModel` types; `nextUndoneTask` rule; 5 worked examples; 10 edge cases; v2 `PlanAdapter` stub |
| `/compact`-survival smoke design | Storage Design | [`workshops/004-compact-survival-smoke.md`](workshops/004-compact-survival-smoke.md) | ✅ Draft (Implementation Ready) | 8-step tmux choreography; 4-assertion matrix; failure-interpretation table; pi-mono upstream issue template; `compactAndAssert` Driver SDK helper sketch (proposed AC-12 gift) |

**Spec deltas from workshops** (rolled into the relevant sections):

- Acceptance Criteria: AC-04 now references workshop 001's `StopReason` union as the canonical taxonomy; AC-05 references workshop 004's 4-assertion matrix as the canonical proof.
- Risks: R2 (SDK lifecycle leaks) now references workshop 002's resource-ownership ledger and heap-snapshot test as mitigation.
- AC-12 candidate landed: `compactAndAssert(session, opts)` in `harness/driver/index.ts` is the proposed harness gift. Final choice between this and "minih adoption codified in `docs/project-rules/`" stays open until plan-3; both qualify.
- Phase 1.B (store): consumes workshop 001 + 003 verbatim.
- Phase 1.C (wiring): consumes workshop 002 verbatim.
- Phase 1.D (smoke): consumes workshop 004 verbatim.
- A new "Phase 1.A½" (between baseline and store): add `compactAndAssert` to Driver SDK and unit-test it. Folds naturally into 1.B; not a separate gate.

---

## Next steps (per skill)

**Workshops complete (4/4).** Ready for `/plan-3-v2-architect`. The architect skill should consume the workshops verbatim and translate them into phases + tasks; no further design discovery is required for the build.
