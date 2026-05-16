# Execution Log — Phase 1: Minih inventory + artifact adapter

**Plan**: `docs/plans/007-options-for-pi-extensions-that-do-subagents/agent-workbench-plan.md`  
**Tasks**: `docs/plans/007-options-for-pi-extensions-that-do-subagents/tasks/phase-1-minih-inventory-artifact-adapter/tasks.md`  
**Companion**: `code-review-companion` run `2026-05-16T13-47-09-160Z-fc71`  
**Minih self-onboarding refs**: [`AGENTS_README.md`](https://github.com/AI-Substrate/minih/blob/main/AGENTS_README.md), [`docs/how/companion-mode.md`](https://github.com/AI-Substrate/minih/blob/main/docs/how/companion-mode.md)  
**Started**: 2026-05-16T13:47Z

---

## Harness grounding

Ran `harness-is-the-product-v2` grounding by reading `AGENTS.md`, `docs/project-rules/harness.md`, `docs/project-rules/agent-harness.md`, `docs/difficulties.md`, and `docs/velocity.md`.

| Check | Observation |
|-------|-------------|
| Difficulty count | 30 tracked difficulty rows (`D-001` through `D-030`), with several encoded and several open/mitigated. |
| Velocity trend | Prior extension timings are measured in `docs/velocity.md`; scope tier matters, so this phase will log actual evidence instead of fixed minute targets. |
| Recent gifts | Companion harness governance, package vet/audit, Driver SDK smoke hardening, todo strip, template fixes, and SQL/todo cleanup. |
| Drift check | This phase serves the harness: it creates deterministic Minih fixtures and read-only status/report surfaces so future agents can observe Minih runs from Pi without ad hoc artifact spelunking. |

## Pre-phase harness validation

| Layer | Check | Command | Result | Duration / Notes |
|-------|-------|---------|--------|------------------|
| Agent harness boot | Minih installed | `minih --version` | ✅ `0.1.6` | CLI available. |
| Agent harness health | Minih doctor | `minih doctor --json` | ⚠️ degraded, 0 errors | Warnings: missing shared preamble; unharvested package-vetter retro. `code-review-companion` `prompt-state-vocabulary-drift` passed. |
| Companion boot | Active run | `minih run code-review-companion` + `minih status` | ✅ active | Run id `2026-05-16T13-47-09-160Z-fc71`. |
| Engineering boot | Dependencies present | existing `node_modules` + `just typecheck` | ✅ | No install needed in warm worktree. |
| Engineering interact | Tmux/Pi smoke | `npm run smoke -- session-sql` | ✅ | Smoke passed. |
| Engineering observe | Typecheck | `just typecheck` | ✅ | `tsc --noEmit` passed. Full `just self-check` required at phase end. |

## Companion briefing

Sent 2026-05-16T03:48:15Z. Message id `01KRQEC91350NH663Y9WE86A3G`. Subject: `Plan 007-options-for-pi-extensions-that-do-subagents: Phase 1 — Power On Mode start`.

## Companion findings reconciliation

| Finding | Severity | ackOf | Related Task | Disposition | Notes |
|---------|----------|-------|--------------|-------------|-------|
| F001 | MEDIUM | `01KRQEHXP8V9732FQWG54V6TPJ` | T001 | Fixed in `c266082`; ack `01KRQEVR37TR130TFJAV2TA3SG` | T001 commit had task-table progress drift; T002 commit corrected `tasks.md` and flight checklist. |
| F002 | MEDIUM | `01KRQETYD73THCFW7GT2TDJEKJ` | T002 | Fixed in `75d94e4`; ack `01KRQF1MEHNXJTV7WVF9YQFGT2`; verification request `01KRQF1E3001W6JZAV400HPB63` | Domain map missed explicit `agent-workbench` → `pi runtime` consume edge. |
| F003 | MEDIUM | `01KRQETYD73THCFW7GT2TDJEKJ` | T002 | Fixed in `75d94e4`; ack `01KRQF1MNXFYE708G610B3YS3R`; verification request `01KRQF1E3001W6JZAV400HPB63` | Execution log had stale "no findings" note for T001; replaced with F001 disposition. |
| F004 | LOW | `01KRQF00C0HNP84ZZT8RYDHA60` | T003-fix | Fixed in `c7d9e40`; verification request `01KRQF543HP5TFS21D20J9QCTZ` | T003 discovery note still said D-031 follow-up commit pending even though `3fc8972` landed it. |
| F005 | LOW | `01KRQF1E3001W6JZAV400HPB63` | T002-fix | Fixed in `c7d9e40`; verification request `01KRQF543HP5TFS21D20J9QCTZ` | F002/F003 rows still said pending even after `75d94e4`; dispositions now reference the fix commit. |
| F006 | LOW | `01KRQF543HP5TFS21D20J9QCTZ` | finding-log-fix | Fixed in `0ea92c2`; verified by summary `01KRQF7GD7YW4NFWKKYDGECX3E` | F004/F005 rows still said pending; final log commit corrected them. |
| F007 | MEDIUM | `01KRQFBWSHGW4YKHNEXZCXJA9D` | T005 | Fixed in `2aff4e1`; verification request `01KRQFP654X49S5Z75R3QSPB8T` | `projectInventory()` duplicated active/stale report-ready runs across active and completed/report-ready buckets; added de-dupe and regression test. |
| F008 | MEDIUM | `01KRQFP654X49S5Z75R3QSPB8T` | T005-fix | Fixed in follow-up commit pending | F007 fix failed to enforce `completedLimit` independently; added `completedAdded` bucket counter and regression test. |

## Task entries

### T001 — Create `agent-workbench` domain document

- **Status**: complete
- **Evidence**: Created `docs/domains/agent-workbench/domain.md` with Purpose, Source Locations, Concepts, Contracts, Composition, Dependencies, Boundary Owns/Excludes, and History.
- **Validation**: Documentation-only task; code validation deferred to implementation tasks and final self-check.
- **Commit**: `cd46ae5`
- **Companion**: Sent `review-request: T001 cd46ae5` as message `01KRQEHXP8V9732FQWG54V6TPJ`. Companion ack `01KRQEJ6X7Q1STX107W6CF215J`; finding F001 (MEDIUM progress drift) fixed in `c266082` and acked with `01KRQEVR37TR130TFJAV2TA3SG`.

### T002 — Register `agent-workbench` in domain registry and map

- **Status**: complete
- **Evidence**: Added `agent-workbench` row to `docs/domains/registry.md`; added `AW` and `MH` nodes plus one-way edges/health notes/history in `docs/domains/domain-map.md`.
- **Validation**: Documentation-only task; code validation deferred to implementation tasks and final self-check.
- **Commit**: `c266082`
- **Companion**: Sent `review-request: T002 c266082` as message `01KRQETYD73THCFW7GT2TDJEKJ`. Companion findings F002/F003 were accepted and fixed in `75d94e4`; verification request `review-request: T002-fix 75d94e4` sent as `01KRQF1E3001W6JZAV400HPB63`.

### T003 — Scaffold `minih-workbench` extension

- **Status**: complete
- **Evidence**: Ran `just new minih-workbench`; generator created `.pi/extensions/minih-workbench/{AGENTS.md,index.ts,smoke.ts,store.test.ts,store.ts}`.
- **Validation**: `just typecheck` passed against the generated scaffold before customization.
- **Commit**: `ca96f2e`
- **Companion**: Sent `review-request: T003 ca96f2e` as message `01KRQEYH6Y714TVNS8DX3FX3KS`.
- **Discovery**: Generator scaffold initially failed `just lint` due unused starter `DeleteResult`; removed it in generated file and encoded the template fix in `harness/templates/extension/store.ts.template`.
- **Follow-up commit**: `3fc8972` (`fix: keep extension scaffold lint clean`), companion message `01KRQF00C0HNP84ZZT8RYDHA60`.

### T004 — Add extension-local implementation rules

- **Status**: complete
- **Evidence**: Replaced generated `.pi/extensions/minih-workbench/AGENTS.md` with source-of-truth, read-only Phase 1, adapter-only Minih IO, no ANSI parsing, no send/stop/push, Pi-free store, keybinding, fixture-first validation, and package-policy rules.
- **Validation**: Documentation-only task; `just lint` required before commit.
- **Commit**: `9ad242a`
- **Companion**: Sent `review-request: T004 9ad242a` as message `01KRQF3T783TDMYVGX8MC7SD93`.

### T005 — Define Pi-free store contracts and constants

- **Status**: complete
- **Evidence**: Replaced generated store with Pi-free Minih Workbench contracts for run summaries, kind/status axes, diagnostics, modal/view snapshots, adapter tagged results, bounded panes, inventory projection, Phase 1 no-write guard, and placeholder action identifiers. Adjusted placeholder `index.ts`/`store.test.ts` imports to keep the repo typecheckable until T010/T011 expand them.
- **Validation**: `just typecheck`; `npx vitest run .pi/extensions/minih-workbench/store.test.ts`; `just lint` all passed after formatting.
- **Commit**: `b9efeff`
- **Companion**: Sent `review-request: T005 b9efeff` as message `01KRQFBWSHGW4YKHNEXZCXJA9D`.

### T006 — Define injected session persistence facade

- **Status**: complete
- **Evidence**: Added `.pi/extensions/minih-workbench/persistence.ts` with `MinihWorkbenchPersistence`, selected-run pointer, seen cursor, push opt-in, audit/intent/outcome record contracts, and a Pi-free in-memory Phase 1 implementation.
- **Validation**: `just typecheck`; `just lint` passed after formatting.
- **Commit**: `47f6e85`
- **Companion**: Sent `review-request: T006 47f6e85` as message `01KRQFKVQVXXGDRHASP8RP9MCK`.

### T007 — Record Minih dependency decision and package policy

- **Status**: complete
- **Evidence**: Added `minih-dependency-decision.md` deciding Phase 1 uses local Minih artifact/JSON contracts plus deterministic fixtures; no new package dependency; no package manifest edits.
- **Validation**: Documentation-only task; `just lint` required before commit.
- **Commit**: `ce6532d`
- **Companion**: Sent `review-request: T007 ce6532d` as message `01KRQFRBTWHM854GWZ9A40FP98`.

