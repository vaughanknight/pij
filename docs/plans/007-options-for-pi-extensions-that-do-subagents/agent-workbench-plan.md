# Pi-Native Minih Workbench Implementation Plan

**Plan Version**: 1.0.0  
**Created**: 2026-05-16  
**Spec**: [agent-workbench-spec.md](./agent-workbench-spec.md)  
**Status**: DRAFT  
**Mode**: Full — capped at 3 implementation phases

## Summary

Build a Pi-native Minih Workbench extension that makes running Minih agents observable from inside Pi without replacing Minih. The first implementation proof is read-only: `/minih` lists active/stale Minih runs, arrow keys select a run, Enter opens a full Pi modal viewer, scroll/status/tools/report panes render from Minih artifacts, and `Esc` closes only the view. Phase 3 then adds gated interaction: coordinated send, confirmed stop/report controls, and compact push-context delivery with duplicate suppression.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|--------------|------|
| `agent-workbench` | NEW | create | Product contract for Minih run summaries, modal viewer semantics, Phase 3 controls, push policy, and safety invariants. |
| `agent-tooling-interface` | active | modify | `/minih` commands, model tools, custom UI components, custom messages, confirmation UX, and deterministic operator surfaces. |
| `session-work-state` | active | consume | Session-scoped modal pointers, selected run id, seen cursors, push opt-ins, and duplicate-suppression/audit state; does not own Minih artifacts. |
| `agentic-loops` | active | consume | Lifecycle vocabulary for liveness, stop semantics, watcher cleanup, and long-running-agent safety. |
| `extension-authoring-harness` | existing capability | modify | Scaffold, store tests, fixtures, Driver SDK smoke, self-check evidence, docs, and validation records. |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|----------------|-----------|
| `/Users/jordanknight/pi-hacking/pij/docs/domains/agent-workbench/domain.md` | `agent-workbench` | contract | New domain contract for run summary, modal, Phase 3 control, and push semantics. |
| `/Users/jordanknight/pi-hacking/pij/docs/domains/registry.md` | `agent-workbench` | cross-domain | Registers the new domain for future plan/domain discovery. |
| `/Users/jordanknight/pi-hacking/pij/docs/domains/domain-map.md` | `agent-workbench` | cross-domain | Adds edges to Pi runtime, Minih artifacts, agent-tooling-interface, session-work-state, agentic-loops, and extension-authoring-harness. |
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/minih-workbench/AGENTS.md` | `agent-workbench` | contract | Extension-local rules: Minih source of truth, read-only first proof, write/push safety gates, no hardcoded keys. |
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/minih-workbench/store.ts` | `agent-workbench` | contract | Pi-free types/projections for `MinihRunSummary`, modal state, status axes, push classifier, and dedupe cursors. |
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/minih-workbench/minih-adapter.ts` | `agent-workbench` | internal | Minih artifact/CLI/helper boundary; all filesystem/CLI reads and Phase 3 write wrappers live here, with tagged results. |
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/minih-workbench/persistence.ts` | `agent-workbench` | internal | Injected session persistence facade for selected run pointers, seen cursors, push opt-ins, and audit/intent/outcome records; implementation persists before side effects. |
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/minih-workbench/ui.ts` | `agent-tooling-interface` | internal | Pi-native list/modal components, action/keybinding mapping, panes, scroll state, and close behavior. |
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/minih-workbench/index.ts` | `agent-tooling-interface` | cross-domain | Pi wiring for lifecycle, commands, tools, watchers, UI registration, `sendMessage` push, and confirmations. |
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/minih-workbench/store.test.ts` | `extension-authoring-harness` | internal | Pure tests for store projections, status axes, modal state, safety gates, and push dedupe. |
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/minih-workbench/minih-adapter.test.ts` | `extension-authoring-harness` | internal | Fixture-backed adapter tests for valid/missing/malformed/stale/completed Minih run directories. |
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/minih-workbench/fixtures/` | `extension-authoring-harness` | internal | Deterministic Minih run directories and event/inbox/state/report fixtures. |
| `/Users/jordanknight/pi-hacking/pij/.pi/extensions/minih-workbench/smoke.ts` | `extension-authoring-harness` | internal | Driver SDK scenarios for `/minih`, list selection, modal open/scroll/close, reload, and Phase 3 gates. |
| `/Users/jordanknight/pi-hacking/pij/docs/how/agent-workbench.md` | `agent-workbench` | contract | Operator guide for list/modal/status semantics, Phase 3 controls, push policy, and troubleshooting. |
| `/Users/jordanknight/pi-hacking/pij/README.md` | `agent-tooling-interface` | cross-domain | Quick-start entry for `/minih` and safe close semantics. |
| `/Users/jordanknight/pi-hacking/pij/docs/plans/007-options-for-pi-extensions-that-do-subagents/agent-workbench.fltplan.md` | `extension-authoring-harness` | internal | Plan-level flight plan and status tracker. |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | `agent-workbench` is a new boundary; no existing domain or extension owns Pi-native Minih run visibility. | Create the domain in Phase 1, but keep Pi command/UI wiring in `agent-tooling-interface` and state persistence in `session-work-state`. |
| 02 | Critical | Minih owns the run model; ad hoc Pi parsing or `last-run` assumptions can select the wrong run or collapse status axes. | Route all Minih IO through `minih-adapter.ts`; prefer public Minih helpers/JSON contracts; fixture-test raw fallback and never parse ANSI from `minih view/attach`. |
| 03 | Critical | Phase 3 send/stop/push crosses a write/privacy boundary and can turn observation into model-controlled action. | Keep Phase 1–2 read-only. In Phase 3 require explicit run id, fresh capability checks, human stop confirmation, audit events, redaction/truncation, scoped push, and stable dedupe cursors. |
| 04 | High | Full-modal TUI feasibility is the read-only proof gate. | Phase 2 starts with a focused native Pi component/list/modal spike, named actions, independent scroll state, and Driver SDK smoke before richer panes. |
| 05 | High | Existing T2 extension and Pi-free store patterns are the safe substrate. | Use `just new minih-workbench`, then split `store.ts`, `minih-adapter.ts`, `ui.ts`, and `index.ts`; inject side effects and test store/adapter with fixtures. |
| 06 | High | Deterministic smoke must not depend on live Minih/Copilot or model tool choice. | Use fixture run directories, fake watchers, slash commands, JSON status envelopes, and tmux key assertions; gate any live Minih run behind an explicit opt-in env var. |
| 07 | High | Product-contract ambiguities still affect completed-run listing and push scope expansion. | Freeze v1 namespace as `/minih`; require active + stale inventory plus a bounded recent completed/report-ready section; default push to opened/observed or opted-in runs. |

## Agent Harness Strategy

- **Current Maturity**: L2 engineering harness + companion overlay.
- **Target Maturity**: L2 engineering harness + companion overlay; no broad harness rebuild.
- **Boot Command**: `npm install` for engineering harness; `minih doctor` before companion use when code implementation begins.
- **Health Check**: `just self-check`.
- **Interaction Model**: Pi TUI + Driver SDK/tmux smoke; minih outside-inbox CLI for companion review during plan-6 implementation.
- **Evidence Capture**: Vitest output, Driver SDK smoke transcripts, deterministic JSON command output, validation records, and companion reports for code phases.
- **Pre-Phase Validation**: Start each implementation phase by confirming fixtures are current, `just typecheck` is clean, and any live companion use clears `minih doctor`.

## Phases

### Phase Index

| Phase | Title | Primary Domain | Objective | Depends On |
|-------|-------|----------------|-----------|------------|
| 1 | Minih inventory + artifact adapter | `agent-workbench` | Create the domain and read-only Minih run/status/report projection with deterministic fixtures and pull surfaces. | None |
| 2 | Full modal Minih run viewer | `agent-tooling-interface` | Add `/minih` list + full modal viewer with keyboard selection, scrollback, status/tool/report panes, watcher lifecycle, and safe `Esc`. | Phase 1 |
| 3 | Interaction, push context, and hardening | `agent-workbench` | Add gated coordinated send, confirmed stop/report controls, push-context delivery, duplicate suppression, docs, and final smoke. | Phase 2 |

---

### Phase 1: Minih inventory + artifact adapter

**Objective**: Establish the new domain, extension scaffold, fixture-backed Minih adapter, run summary projection, and read-only command/tool contracts.  
**Domain**: `agent-workbench`  
**Complexity**: CS-4  
**Delivers**:
- `agent-workbench` domain doc, registry entry, and domain-map edges.
- `minih-workbench` extension scaffold with T2+adapter layout.
- Fixture Minih run directories covering active, stale, completed, failed/malformed, coordinated, and non-coordinated runs.
- Pi-free summary/status/report projections and read-only pull commands/tools.
- Deterministic tests for adapter/store behavior.

**Depends on**: None  
**Key risks**: Minih helper availability may differ from the research branch; raw artifact fallback must be fixture-tested and isolated behind the adapter.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|------------------|-------|
| 1.1 | Create `agent-workbench` domain doc and update registry/map. | `agent-workbench` | Domain doc states purpose, concepts, contracts, composition, dependencies, owns/excludes; registry/map include the new node plus one-way consume edges to `agent-tooling-interface`, `session-work-state`, `agentic-loops`, and `extension-authoring-harness` with no Minih lifecycle ownership transfer. | Per findings 01 and 04. |
| 1.2 | Scaffold `.pi/extensions/minih-workbench` with T2 layout, then add `minih-adapter.ts`, `ui.ts`, and extension `AGENTS.md`. | `extension-authoring-harness` | Files exist; `store.ts` imports no Pi packages; relative imports use `.js`; extension AGENTS reasserts source-of-truth and safety rules. | Use `just new minih-workbench`; no hand-rolled scaffold. |
| 1.3 | Define Pi-free contracts for `MinihRunSummary`, `MinihModalState`, `MinihViewSnapshot`, status axes, diagnostics, bounded pane snapshots, and tagged adapter results. | `agent-workbench` | Store exports structural types and pure projection helpers; no `any`; statuses keep liveness/terminal/inside/outside/UI focus separate; pane snapshots expose max events/bytes, truncation markers, and cursor/page inputs; persistence contract is explicit: selected/open modal state may be in-memory, while Phase 3 seen cursors/audit milestones use `persistence.ts` before side effects. | Match spec/workshop vocabulary. |
| 1.4 | Build fixture Minih run directories and adapter read path. | `agent-workbench` | Adapter resolves fixture roots and returns summaries/snapshots for active, stale, bounded recent completed/report-ready, malformed, missing, permission-like, and large transcript/tool-output cases with diagnostics and truncation instead of throws. | Prefer public Minih helpers where available; keep fallback inside adapter. |
| 1.5 | Add read-only command/tool contracts: `/minih status --json`, `minih_runs_list`, `minih_run_status`, `minih_read_report`. | `agent-tooling-interface` | Commands/tools return deterministic structured envelopes with bounded payloads/truncation markers; no write/stop/send capabilities exist yet. | Pull fallback for smoke and model use. |
| 1.6 | Add store and adapter tests. | `extension-authoring-harness` | `just test` covers projection sorting, status axes, report detection, malformed/missing artifact diagnostics, large transcript/tool-output truncation, and no-write v1 invariant. | Tests target store/adapter, not Pi wiring. |
| 1.7 | Record the Minih dependency decision. | `extension-authoring-harness` | Plan evidence states helper-vs-CLI choice; default is existing local Minih CLI/artifact contracts unless a vetted dependency is necessary; any new package uses `just pkg add <source>`/audit and no hand-editing of package manifests, `.pi/settings.json`, pi-mono, or installed Pi. | Required before plan-5 tasks add dependency work. |

### Phase 2: Full modal Minih run viewer

**Objective**: Prove the core user journey: `/minih` opens a running-agent list, selection opens a full Pi modal, panes render Minih projections, scrollback works, and `Esc` closes without controlling the run.  
**Domain**: `agent-tooling-interface`  
**Complexity**: CS-5  
**Delivers**:
- Native Pi list and full modal components with configurable action mapping.
- Independent modal pane focus and scroll state.
- Watcher lifecycle for list/modal refresh over fixture/fake feeds.
- `/minih`, `/minih list`, `/minih view <run>`, and `/minih report <run>` operator flows.
- Driver SDK smoke for list, keyboard selection, modal open, scroll, close, report, diagnostics, and reload.

**Depends on**: Phase 1  
**Key risks**: Pi overlay/modal focus may fight editor input; begin with a focused spike and fallback to simpler full-screen text modal if pane layout is unreliable.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|------------------|-------|
| 2.1 | Implement named workbench actions and default keybinding constants. | `agent-tooling-interface` | No hardcoded key checks; named actions and default keybinding constants live in `store.ts` next to the data they constrain, while `ui.ts`/`index.ts` consume those exports and inject runtime overrides. | Align with project no-hardcoded-keybindings rule and P5. |
| 2.2 | Implement run-list component. | `agent-tooling-interface` | `/minih` renders active/stale runs first plus a bounded recent completed/report-ready section, shows diagnostics/material counts/report state, supports Up/Down selection, Enter open, and Esc close. | Completed/report-ready inclusion is fixture-backed and smoke-covered. |
| 2.3 | Implement full modal viewer component. | `agent-tooling-interface` | Modal renders header, transcript, tools, status, coordination, output/report, diagnostics, and disabled/absent composer reason for read-only runs with bounded pane windows and visible truncation/page indicators. | Native Pi UI only; do not nest Minih Ink. Any fallback must still be full-area Pi-native UI with required sections, independent scroll/focus, and Esc-only-close smoke. |
| 2.4 | Implement pane focus and scrollback state. | `agent-workbench` | Store tests prove transcript/tools/coordination/diagnostics scroll independently from main Pi conversation and survive repaint. | UI consumes store state. |
| 2.5 | Implement watcher/feed lifecycle. | `agent-tooling-interface` | No expensive watcher before list/modal; opening modal starts selected-run feed; watcher failures become diagnostics with bounded polling fallback; duplicate events are debounced/coalesced; callbacks after dispose are ignored; Esc releases modal watcher; exactly one `session_start` handler covers startup/reload/new/resume/fork and reconciles pointers/cursors without auto-opening UI; `session_shutdown` stops all watchers; reload recreates handles safely without auto-open. | Per validation medium follow-up and P10. |
| 2.6 | Add read-only modal smoke scenarios. | `extension-authoring-harness` | Driver SDK smoke proves `/minih`, list selection, modal open, pane scroll, Esc close with no control/write, report view, stale/malformed diagnostics, and reload behavior. | Use fixture/fake feeds; no live Minih/Copilot. |

### Phase 3: Interaction, push context, and hardening

**Objective**: Add required Phase 3 interaction and push capabilities without weakening the read-only proof or Minih ownership boundary.  
**Domain**: `agent-workbench`  
**Complexity**: CS-5  
**Delivers**:
- Capability-gated composer and send command/tool for coordinated writable runs.
- Explicit stop/report controls with confirmation and audit/diagnostic events.
- Push-context classifier, dedupe cursors, compact message rendering, and reload-safe replay suppression.
- Security/privacy gates for write/push paths.
- User/agent docs and final self-check/smoke evidence.

**Depends on**: Phase 2  
**Key risks**: Write/control actions can become unsafe if capability checks, confirmation, audit events, and redaction are not treated as contract tests.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|------------------|-------|
| 3.1 | Define Phase 3 outbound message/control contracts and adapter write wrappers. | `agent-workbench` | Store/adapter tests assert outside-inbox message shape, dedicated stop-control shape, tagged success/unavailable/error results, durable intent/outcome records through `persistence.ts`, and no raw writes outside adapter. | Shell out or use public Minih writer helper; no direct UI writes. |
| 3.2 | Add capability-gated composer, `/minih send`, and `minih_send_message`. | `agent-tooling-interface` | Composer/tool enabled only for active coordinated writable runs after fresh capability check; read-only runs show reason and perform no write. | Explicit run id required for tool/command. |
| 3.3 | Add confirmed stop/report controls and `minih_stop_run`. | `agent-tooling-interface` | Stop requires confirmation, persists an intent/audit record before the control side effect, sends a dedicated control message, records outcome, and never triggers from Esc or freeform text; persistence failure returns a tagged error and skips the control send. | Report/farewell surfaces stay read-only. |
| 3.4 | Implement push-context classifier and dedupe cursors. | `agent-workbench` | Findings, questions, blockers, permission/needs-recovery, terminal reports, farewells, and user-addressed inside messages push once; routine progress/tool/counter churn is suppressed; seen cursor is durably advanced before model-visible push; redaction/truncation contract names max sizes, denylisted sensitive classes, and model-visible vs metadata-only fields. | Default scope: opened/observed or explicitly opted-in runs; P9 persist-before-mutate. |
| 3.5 | Wire compact pushed context into Pi. | `agent-tooling-interface` | `pi.sendMessage` or equivalent delivers compact/redacted custom messages with source run id only after durable cursor/audit write; tests prevent raw reports, raw tool output, environment values, secrets, and unbounded paths from entering model-visible pushes/tool responses; urgent trigger behavior is explicit and tested; reload/resume does not duplicate pushes. | No raw large tool outputs by default. |
| 3.6 | Complete docs and final smoke. | `extension-authoring-harness` | README quick-start and `docs/how/agent-workbench.md` cover list/modal/status/close/send/stop/push/troubleshooting; smoke covers coordinated send, read-only gating, confirmed stop/report, push delivery/dedupe, and reload. | End with `just self-check`. |

## Acceptance Criteria

- [ ] Active, stale, completed/report-ready, malformed, and permission-like fixture runs project into structured summaries with diagnostics rather than crashes.
- [ ] `/minih` opens a keyboard-selectable Minih run list; Up/Down selection and Enter open behavior are deterministic.
- [ ] A selected run opens in a full-area Pi modal without sending any Minih message.
- [ ] Modal panes show transcript, tool activity, inside status, outside status, liveness, peer/attention state, output/report state, and diagnostics.
- [ ] Modal scrollback is independent from the main Pi conversation and pane focus is visible.
- [ ] `Esc` closes only the Pi UI and releases modal watchers; it never sends stop/control/kill.
- [ ] Non-coordinated runs are read-only with a clear disabled/absent composer reason.
- [ ] Coordinated writable runs can receive Phase 3 typed messages through the outside inbox, and the message appears in the run timeline.
- [ ] Stop is explicit, confirmed, audited, and never implied by close or freeform text.
- [ ] Completed/stopped runs surface report/farewell path and summary/findings when available.
- [ ] Status rendering keeps liveness, terminal result, inside status, outside status, peer state, attention, and UI focus distinct.
- [ ] Read-only tools/commands provide structured list/status/report output for pull fallback.
- [ ] Push context sends each material companion event once, suppresses non-material churn, redacts/truncates payloads, and avoids duplicate pushes after reload/resume.
- [ ] Deterministic smoke proves read-only list/modal flows plus Phase 3 coordinated send, confirmed stop/report controls, pushed-context delivery, duplicate suppression, and reload behavior.
- [ ] `just self-check` passes before the feature is reported complete.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Pi modal/focus APIs cannot support the desired full-area pane UX reliably. | Medium | High | Make Phase 2 start with the smallest modal spike; any fallback must still be full-area Pi-native UI with transcript/tool/status/report/diagnostic sections, independent scroll/focus, and Esc-only-close smoke before Phase 3. |
| Minih helper/API availability differs from research branch. | Medium | High | Encapsulate in `minih-adapter.ts`; prefer public helpers but keep fixture-tested raw-read fallback; shell out only at stable CLI boundaries. |
| Phase 3 write controls bypass capability/confirmation gates. | Medium | Critical | Contract-test send/stop wrappers; require explicit run id, fresh capability checks, confirmation, and audit events. |
| Push context floods or leaks sensitive data. | Medium | High | Default to opened/observed or opted-in runs, compact/redacted payloads, material taxonomy, debounce/coalescing, and stable dedupe cursors. |
| Smoke becomes flaky if it depends on live Minih/Copilot or model decisions. | High | High | Use fixture run dirs, fake watchers, slash commands, deterministic JSON envelopes, and opt-in env vars for live coverage. |
| Domain split creates duplicate sources of truth. | Medium | High | Minih artifacts remain canonical; Pi stores only pointers/cursors/UI state/audit milestones; persist intent/cursor/audit before side effects; reconcile from Minih artifacts in the single session-start handler. |

## Next Steps

1. Plan-4 readiness review completed with no HIGH findings; mechanical MEDIUM findings were folded back into this plan.
2. Thesis-aware validation completed with no HIGH findings; mechanical MEDIUM findings were folded back into this plan.
3. Next action: run `/plan-5-v2-phase-tasks-and-brief` for Phase 1.
4. Preserve the validation record below when generating downstream task dossiers.

---

## Validation Record (2026-05-16)

### Validation Thesis

**Raison d'être**: Turn the validated Minih Workbench spec into a max-3-phase implementation path that preserves the read-only first proof and required Phase 3 interaction/push work without violating pij extension/domain/harness rules.

**Value claim**: Implementation becomes cheaper, safer, and more repeatable because the plan decomposes the feature into domain creation + read-only adapter, native modal viewer, and gated interaction/push hardening with deterministic tests.

**Artifact promise**: Future plan-5 task dossiers and plan-6 implementation can rely on concrete phases, domain manifest files, success criteria, safety invariants, acceptance criteria, and harness evidence requirements.

**Intended beneficiaries**: plan-5 task authors, plan-6 implementers, plan-4/validation reviewers, Pi users/operators, and future maintainers.

**Proof target**: Implementation.

**Evidence standard**: Source-aligned phases, domain/task/file mapping, concrete success criteria, risk mitigations, acceptance criteria, deterministic test/smoke evidence paths, plan-4 readiness results, and compatibility with the spec/workshop/domain docs.

**Thesis source**: `agent-workbench-spec.md` Summary/Goals/Suggested Phases/Phase 3 Safety and Push Policy/Acceptance Criteria; `agent-workbench-plan.md` Summary/Phases/Key Findings; plan-4 results.

**Thesis verdict**: Advanced after fixes.

**Main thesis risk**: Completed/report-ready inventory scope could have leaked as a downstream product re-decision; validation fixed it by requiring a bounded recent completed/report-ready section with fixture/smoke coverage.

---

| Agent | Lenses Covered | Thesis Axes Covered | Issues | Verdict |
|-------|---------------|---------------------|--------|---------|
| Coherence | Thesis Alignment, Proof-Level Fit, User Experience, System Behavior, Integration & Ripple, Hidden Assumptions, Edge Cases & Failures | Implementation Readiness, User/Product Value Preservation, Cross-Domain Coordination, Safety to Change | 2 MEDIUM fixed; 1 LOW fixed | ✅ after fixes |
| Risk/Completeness | Evidence Sufficiency, Edge Cases & Failures, Security & Privacy, Deployment & Ops, Performance & Scale, Technical Constraints, Domain Boundaries, Concept Documentation | Operational Reliability, Safety to Change, Implementation Readiness, Contract Integrity | 6 MEDIUM fixed | ✅ after fixes |
| Thesis Alignment | Thesis Alignment, Evidence Sufficiency, Proof-Level Fit, Hidden Assumptions, Domain Boundaries, Concept Documentation | Thesis Alignment, User/Product Value Preservation, Downstream Usefulness, Implementation Readiness, Review Compression | 1 MEDIUM fixed; 1 LOW fixed | ✅ after fixes |
| Forward Compatibility | Forward-Compatibility, Integration & Ripple, Test Boundary, Domain Boundaries, Technical Constraints, Deployment & Ops, System Behavior | Downstream Usefulness, Contract Integrity, Agent Readiness, Implementation Readiness, Cross-Domain Coordination | 0 | ✅ |

### Forward-Compatibility Matrix

| Consumer | Requirement | Failure Mode | Verdict | Evidence |
|----------|-------------|--------------|---------|----------|
| plan-5 phase-1 task dossier | Phase 1 tasks need concrete files, success criteria, dependencies, and validation evidence for domain creation plus read-only adapter/projections. | shape mismatch / test boundary | ✅ | Phase 1 includes domain setup, scaffold, contracts, fixtures, read-only commands/tools, dependency decision, and store/adapter tests. |
| plan-5 phase-2 task dossier | Phase 2 must depend cleanly on Phase 1 contracts while preserving the read-only list → modal proof. | contract drift / lifecycle ownership | ✅ | Phase 2 depends on Phase 1 and requires native list/modal UI, bounded completed/report-ready rows, independent scroll, watcher cleanup/error recovery, safe Esc, and read-only smoke. |
| plan-5 phase-3 task dossier | Phase 3 needs required interaction, stop/report, push, gating, persistence, dedupe, and test boundaries without Minih ownership transfer. | encapsulation lockout / test boundary | ✅ | Phase 3 names adapter write wrappers, explicit run id, fresh capability checks, durable intent/outcome records, cursor-before-push, redaction/truncation, and final smoke. |
| plan-6 implementation agents | Implementers need domain manifest, file placement, project rules, acceptance criteria, and deterministic evidence paths without product re-decisions. | cross-domain coordination / implementation readiness | ✅ | Plan has a domain manifest, target domain split, harness strategy, per-phase success criteria, risks, acceptance criteria, and next-step handoff to plan-5. |

**Thesis alignment**: Value claim advanced after fixes; proof level is Target = Implementation and Actual = Implementation-ready phase plan; main thesis risk was completed/report-ready inventory ambiguity and is now resolved in the plan contract.

**Outcome alignment**: The plan preserves the VPO Outcome quote that “Minih companions and agent runs produce valuable context, findings, statuses, and reports, but today they are hidden behind separate CLI views and artifact paths. The first proof makes Minih observable from the main Pi session; Phase 3 makes it interactable and context-aware.”

**Standalone?**: No — downstream consumers are plan-5 phase task dossiers and plan-6 implementation agents.

Overall: VALIDATED WITH FIXES
