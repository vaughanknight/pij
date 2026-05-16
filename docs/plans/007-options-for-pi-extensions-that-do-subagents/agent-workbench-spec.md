# Pi-Native Minih Workbench

**Mode**: Full

## Research Context

📚 This specification incorporates findings from [`research-dossier.md`](./research-dossier.md), the authoritative workshop [`workshops/001-pi-native-agent-workbench-ux.md`](./workshops/001-pi-native-agent-workbench-ux.md), and the Minih → Pi research synthesis at `/tmp/pij-minih-flowspace-v3/research-dossier.md`.

Key findings shaping this spec:

- Pi has no native child-agent workbench; subagent/companion behavior must be surfaced through extension UX, external runtimes, or subprocess/RPC/SDK patterns.
- Minih already provides durable run artifacts, run-scoped coordination inboxes, inside/outside state, companion lifecycle, permission signals, and a human-view projection model.
- First-class Pi support should make Minih runs visible from Pi without reimplementing Minih as a second runtime.
- The first useful product is **Minih-only visibility**: list running Minih agents, select one, and open a Pi-native full-screen modal that feels like Minih `--human` / `attach`.
- First proof remains Minih-only visibility: list → select → full modal viewer → scroll/status/tools → Esc closes safely.
- Typing, send, stop, report controls, and push-context delivery are required **Phase 3** scope, not stretch; they should land only after the read-only viewer proof is established.

## Summary

Build a Pi-native Minih Workbench that lets a user see what is going on in Minih from inside Pi.

The v1 experience should first prove that Pi can list running Minih agents, let the user select one with keyboard navigation, and open a full-area Pi modal/popover that streams a Minih-human-view-like transcript with inside/outside status, tool activity, context/usage indicators, diagnostics, report state, and scrollback. `Esc` closes the popover without stopping the Minih run. After that proof, Phase 3 must add typed messaging for coordinated runs, explicit stop/report controls, and push-context delivery.

## Goals

- List all running Minih agents from Pi.
- Let the user navigate the list with arrow keys and press Enter to open a selected run.
- Open a full-screen-ish Pi modal/popover for a selected Minih run.
- Make the modal feel like Minih `--human` / `minih attach`: live transcript, workbench/status areas, tool activity, output/report state, diagnostics, and scrollback.
- Show inside status and outside status clearly and separately.
- Show liveness, terminal result, peer/activity state, context/usage indicators, and recent tool calls/results.
- Allow the user to scroll back through run history inside the modal.
- Close the modal with `Esc` without stopping or killing the Minih run.
- Preserve Minih run artifacts and coordination semantics as the source of truth.
- Provide deterministic command/status surfaces suitable for smoke tests.
- In Phase 3, allow typed messages from the modal to coordinated Minih runs through the outside inbox.
- In Phase 3, provide explicit stop/report controls with safe confirmation and farewell/report surfacing.
- In Phase 3, push material companion messages/status changes into Pi context without requiring the main Pi agent to poll an inbox tool.

## Non-Goals

- Replacing Minih’s runner, permission model, companion protocol, or artifact layout.
- Replacing existing third-party generic subagent packages.
- Building a right-hand monitor/dock in v1.
- Automatically opening UI when events arrive.
- Treating the modal close action as stop/kill.
- Nesting Minih’s existing terminal/Ink UI directly inside Pi.
- Arbitrary third-party Minih agent-pack installation from model-controlled paths.
- Silent write-capable or `yolo` agent launches from model tools.
- Solving all possible Pi subagent package integrations in v1.
- Changing pi-mono or the installed Pi binary without an explicit upstream plan.

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|--------------|----------------------|
| `agent-workbench` | **NEW** | create | Establishes the product concepts for Minih run summaries, full modal run view, Phase 3 messaging, context push, and companion controls. |
| `agent-tooling-interface` | existing | modify | Owns the Pi-visible command/tool/message/UI experience for listing, opening, viewing, Phase 3 sending/stopping, and reporting. |
| `session-work-state` | existing | consume | Provides established session-scoped persistence patterns for run pointers, seen cursors, and reload-safe UI state, without owning Minih artifacts. |
| `agentic-loops` | existing | consume | Supplies long-running-agent lifecycle vocabulary and safety discipline; does not own Minih companion behavior. |
| `extension-authoring-harness` | existing capability | modify | Provides generator, store tests, smoke, self-check, and evidence capture for the Minih Workbench extension. |

**Domain Review**: Confirmed 2026-05-16. The new `agent-workbench` boundary should be created when implementation begins; it should connect to `agent-tooling-interface` for Pi-visible UX, `session-work-state` for session-scoped pointers/cursors, `agentic-loops` for lifecycle vocabulary, and `extension-authoring-harness` for proof.

### New Domain Sketches

#### agent-workbench [NEW]

- **Purpose**: Define the user-facing and model-facing product contract for observing and, later, controlling external/companion agent runs from inside Pi. For v1, the domain is Minih-first: “what Minih agents are running, what are they doing, and what did they tell me?”
- **Boundary Owns**:
  - Minih run summary vocabulary as presented in Pi.
  - Full modal Minih run viewer semantics.
  - Run list selection/open behavior.
  - Phase 3 message-send/control/report UX for coordinated runs.
  - Phase 3 push-context classification for companion messages/status changes.
  - Seen-cursor and duplicate-suppression behavior for pushed context.
- **Boundary Excludes**:
  - Minih execution, artifact schemas, companion prompt loops, permissions, and inbox/state storage; those remain Minih-owned upstream contracts.
  - Generic subagent orchestration/fan-out semantics; existing packages can remain separate providers.
  - Right-side dock/monitor UX in v1.
  - SQLite or session-storage internals; those belong to `session-work-state` if used.
  - Extension generator/smoke infrastructure; belongs to `extension-authoring-harness`.

## Complexity

**Score**: CS-5 (epic)  
**Breakdown**: S=2, I=2, D=2, N=2, F=2, T=2  
**Total**: P=12  
**Confidence**: 0.74

### Assumptions

- Minih remains the source of truth for runs, reports, inbox lanes, state, and liveness artifacts.
- Pi extension APIs are sufficient for commands, model tools, custom messages, status/widgets/overlays, and session rehydration.
- The first useful vertical slice can target running Minih agents only.
- The modal/popover is the primary v1 UI; there is no right-hand monitor/dock in v1.
- The first proof point is live viewing and scrolling, not message sending.
- Message sending is required in Phase 3 and only applies to coordinated writable Minih runs.
- Pushed context is required in Phase 3 and must be compact, material-event based, and non-spammy.

### Dependencies

- Minih run artifacts and coordination contracts.
- Minih human-view projection concepts and artifact reader behavior.
- Minih companion agents, especially `code-review-companion`.
- Pi extension command/tool/UI/custom-message capabilities.
- Pij extension authoring harness and smoke driver.
- Existing package/security policy for any dependency or third-party package changes.

### Risks

- UI limitation if current Pi custom/overlay APIs cannot support a full-area modal with scrolling and pane switching cleanly.
- User confusion if modal close, detach, stop, and process kill are not clearly separated.
- Status ambiguity if liveness, inside status, outside status, terminal result, and UI focus collapse into one label.
- Drift risk if the bridge parses or writes Minih internals instead of using stable Minih helpers or CLI contracts.
- Scope creep if send/stop/push-context are started before the modal viewer proof is stable.
- Security risk if model-facing tools can start, message, stop, or install untrusted/write-capable agents without explicit gates.
- Context flooding if pushed context is added too broadly.

### Suggested Phases

**Workflow Mode**: Full, capped at **max 3 implementation phases**.

1. **Minih inventory + artifact adapter**: list running Minih agents, resolve run metadata, read fixture run directories, project status axes, and expose deterministic status/report commands.
2. **Full modal Minih run viewer**: keyboard-select a running agent, press Enter to open full Pi modal, stream transcript/tool/status/report/diagnostic views, support scrollback, and close safely with `Esc`.
3. **Interaction + hardening**: coordinated message sending from the modal, explicit stop/report/farewell controls, push-context delivery with duplicate suppression, safety gates, reload/resume/stale/dead handling, docs, and deterministic smoke.

## Testing Strategy

**Approach**: Hybrid

**Rationale**: The feature has both pure contracts and TUI/runtime behavior. Store/projection/cursor/push-policy logic should be developed with focused tests, while Pi UI surfaces and Minih bridge behavior should be proven with lightweight integration tests and deterministic smoke scenarios.

**Focus Areas**:

- Pi-free store/projection tests for run summaries, modal view projections, status axes, and any seen-cursor replay.
- Minih adapter tests using fixture run directories and recorded inbox/state/report artifacts.
- Modal state tests for selected run, pane focus, scroll offsets, and safe close semantics.
- Phase 3 push-context classification tests for material vs non-material events, deduplication, debounce/coalescing, and reload/resume behavior.
- Command/tool contract tests for list/status/report plus send/stop behavior and safety gates.
- Driver SDK smoke for visible Pi UX: run list, keyboard selection, modal open, scroll/close behavior, status rendering, attach/read-only vs coordinated-writable distinction, pushed context, and reload behavior.

**Mock Usage**: Targeted mocks

**Mock Policy**:

- Prefer real fixture run directories, real artifact snapshots, and real Pi-free store/projection logic.
- Use targeted mocks/stubs for external Minih process execution, timers/watchers, Pi UI handles, and command execution boundaries that would otherwise make tests slow or flaky.
- Do not mock pure projection/cursor/push classification logic.

**Excluded**:

- Live LLM-dependent tests for routine validation.
- Arbitrary third-party agent-pack install flows in v1.
- Full end-to-end Minih/Copilot live runs unless behind an explicit opt-in environment variable.

## Documentation Strategy

**Approach**: Hybrid — README + `docs/how/`

**Rationale**: The feature is a user-facing operator experience with safety-sensitive semantics. The README should teach the quickest path, while `docs/how/agent-workbench.md` should document Minih run listing, modal view, status semantics, Phase 3 send/stop controls, safety gates, and troubleshooting.

**Documentation Targets**:

- README quick-start: what Minih Workbench does, how to list running agents, how Enter opens the modal, and why `Esc` only closes the view.
- `docs/how/agent-workbench.md`: detailed workflow guide, command reference, companion semantics, modal controls, status meanings, send/stop/report controls, push-context policy, and recovery/troubleshooting.
- Extension-local `AGENTS.md`: implementation rules and safety constraints for future agents editing the extension.

## Agent Harness Readiness

**Current Harness**: L2 + companion overlay (`docs/project-rules/agent-harness.md`).

**Decision**: Current harness is sufficient; implementation should add feature-specific fake-artifact tests and Driver SDK smoke scenarios rather than introducing a broad Phase 0 harness rebuild.

**Required Evidence Additions**:

- Fixture Minih run directories for deterministic projection and modal-view tests.
- Driver SDK smoke for `/minih status` or equivalent, run-list opening, keyboard selection, modal open/scroll/close behavior, report viewing, and reload behavior.
- Phase 3 smoke must prove coordinated writable vs read-only behavior, stop/report controls, and pushed context.
- No live LLM/Minih/Copilot run in routine self-check unless explicitly opt-in via environment variable.

## Phase 3 Safety and Push Policy

Phase 3 write and push features are required scope, but they are gated by run capability and explicit human intent. They must not turn read-only observation into implicit control.

### Write/control gates

- Send is enabled only for active coordinated writable Minih runs; non-coordinated runs stay read-only with a visible reason.
- Model-facing send/stop tools require an explicit run id, a fresh capability check, and a structured result that records whether the action was accepted, rejected, or unavailable.
- Stop requires an explicit confirmation step and sends a dedicated control message; freeform composer text must not be interpreted as stop.
- Phase 3 must not add arbitrary Minih agent launches, third-party installs, or write-capable `yolo` starts from model-controlled paths.
- Every write/control action records an audit/diagnostic event with source (`modal`, `command`, or `tool`), run id, message/control id, timestamp, and outcome.

### Push-context defaults

- Default push scope for architecture is opened/observed runs plus runs explicitly opted in for push; pushing all running Minih agents is a later expansion decision.
- Material events to push by default: findings, direct questions, blockers, permission-denied or needs-recovery states, terminal reports, farewells, and explicit user-addressed inside messages.
- Non-material events to suppress by default: routine progress, raw tool start/end events, token/counter changes, duplicate status churn, and large raw tool outputs.
- Pushed context must be compact, redact or truncate sensitive/large payloads, identify the run/source, and avoid triggering a turn unless the event is urgent and classified for interruption.
- Duplicate suppression uses a stable cursor key such as `runId + lane/source + messageId/eventId/path + mtime`, and reload/resume must not re-push already-seen material events.

### Fixture evidence

- Phase 3 tests should use temp Minih run directories and stubbed write helpers to assert exact outside-inbox message shape, stop-control shape and confirmation, no writes for read-only runs, one pushed Pi message per material event, and no duplicate push after reload/resume.

## Acceptance Criteria

1. **Minih run inventory**: Given active, stale, and completed Minih runs, when the user opens the Minih Workbench list, then each run appears with slug, run id, liveness, terminal result where known, inside status, outside status, material counts, and report path where available.
2. **Keyboard selection**: Given the run list is open, when the user presses arrow up/down, then selection moves predictably; when the user presses Enter, the selected run opens.
3. **Full modal viewer**: Given a selected run, when the user presses Enter, then Pi opens a full-area modal/popover for that run without sending any message to the agent.
4. **Modal content**: Given an open run modal, then it shows transcript, tool activity, inside status, outside status, liveness, attention state, peer/activity indicator, context/usage counters where available, output/report state, and diagnostics.
5. **Scrollback**: Given a run with more history than fits on screen, when the user scrolls, then the modal scrolls through transcript/history without moving the main Pi conversation.
6. **Esc closes safely**: Given an active run in the modal, when the user presses Esc, then the modal closes and the Minih run continues; no stop, kill, or control message is sent.
7. **Non-coordinated read-only**: Given an active non-coordinated run, when the user opens the modal, then transcript/status are visible and any input affordance is absent or disabled with a clear reason.
8. **Coordinated typing**: Given an active coordinated writable run, when the user types in the modal and sends, the message is delivered through the outside-to-inside coordination path and appears in the run timeline.
9. **Explicit stop**: Given an active companion, when the user chooses stop, Pi confirms intent and sends an explicit stop control message; stopping is never implied by closing the modal.
10. **Farewell/report**: Given a stopped or completed companion, when the farewell/report is available, then Pi surfaces the report path and summary/findings in the workbench.
11. **Status clarity**: Given any run state, the UI keeps process liveness, inside status, outside status, terminal result, and UI focus visually distinct.
12. **Pull fallback**: Given the user or agent requests detail, read-only commands/tools can list Minih runs, read status, and read reports with structured output.
13. **Push context**: Material companion messages/status changes enter Pi context once, using the default material-event taxonomy, without duplicate pushes after reload/resume and without routine progress/tool-event spam.
14. **Phase 3 safety gates**: Given a coordinated writable run and a read-only/non-coordinated run, deterministic tests prove send is gated by capability, stop requires explicit confirmation, every write/control action records an audit/diagnostic event, and read-only runs produce no outside-inbox writes.
15. **Validation**: Given the extension is installed in pij, deterministic smoke proves run inventory, keyboard selection, modal open, scroll/close behavior, status rendering, report viewing, reload behavior, coordinated send, confirmed stop/report controls, pushed-context delivery, and duplicate suppression.

## Risks & Assumptions

- **Assumption**: Minih’s public or CLI surfaces remain stable enough to act as the bridge contract.
- **Assumption**: A Minih-only first slice is valuable even without generic Pi subagent provider support.
- **Assumption**: Message sending, stop/report controls, and push context are required Phase 3 work but must be deferred behind the read-only modal proof.
- **Risk**: The command namespace may shift between `/minih` and a future `/agents`; v1 should favor Minih clarity.
- **Risk**: The modal UI may need careful focus/scroll handling to avoid fighting Pi’s editor.
- **Risk**: Stop/report semantics may differ across agent kinds; v1 should clearly scope companion behavior.
- **Risk**: Security posture becomes unclear if model-facing write tools bypass the Phase 3 capability, confirmation, audit, and push-scope gates.

## Open Questions

1. Should the v1 command be `/minih`, `/minih agents`, or another Minih-specific name?
2. Should Phase 3 typed messaging use a minimal single-line composer first, or a richer Minih-style message-type selector?
3. Should Phase 3 stop/report controls be visible in the modal from the start but disabled until the run supports them, or appear only for coordinated/companion runs?
4. Should later versions expand Phase 3 push context beyond opened/observed and explicitly opted-in runs to all running Minih agents?
5. Should the default material-event taxonomy be adjusted before Phase 3 tasks are generated?

## Clarifications

### Session 2026-05-16

- **Q1 — Workflow Mode**: Full mode, but cap architecture to **no more than 3 implementation phases**. All normal Full-mode gates apply; phase planning should be deliberately compressed into three vertical slices rather than many small phases.
- **Q2 — Testing Strategy**: Hybrid. Use focused tests for pure store/projection/cursor/push-policy logic, plus lightweight integration/smoke coverage for Pi UI surfaces and Minih bridge behavior.
- **Q3 — Mock Usage**: Targeted mocks. Use real fixture run directories and real store/projection logic; mock only Minih process execution, timers/watchers, Pi UI handles, and other external/runtime boundaries where necessary.
- **Q4 — Documentation Strategy**: Hybrid. Add README quick-start coverage plus a detailed `docs/how/agent-workbench.md`; include extension-local AGENTS guidance during implementation.
- **Q5 — Domain Review**: Confirmed. Create the new `agent-workbench` domain boundary as proposed, while keeping Pi-visible command/tool/UI wiring in `agent-tooling-interface` and session persistence patterns in `session-work-state`.
- **Q6 — Agent Harness Readiness**: Current L2 + companion overlay harness is sufficient. Add feature-specific fake-artifact tests and Driver SDK smoke; no broad Phase 0 harness rebuild.
- **Q7 — V1 Product Shape**: Minih-only. Focus first on seeing what is going on in Minih: list all running Minih agents, select one with keyboard navigation, press Enter to open a full-area Pi modal/popover, watch the run stream with Minih-human-view-like transcript/status/tool context, scroll back through history, see inside/outside status, and close with Esc.
- **Q8 — Phase 3 Scope**: Typing/send, explicit stop/report controls, and push context are required Phase 3 scope, not stretch. The first proof remains the read-only list → modal viewer flow described in Q7.
- **Clarification Process Preference**: Ask known independent clarification questions in batches when possible; this preference was added to `.pi/APPEND_SYSTEM.md`.

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| Pi-native Minih modal viewer UX | Integration Pattern / State Machine | Update/supersede the existing workshop’s right-monitor design with the clarified list → Enter → full modal flow. | What panes appear? How does scrolling work? What does Esc do? Where does the Phase 3 composer live? |
| Run summary and modal state data model | Data Model / Storage Design | Needed before implementing run inventory, modal selection, scroll state, and reload-safe pointers. | What is stored in Pi entries vs Minih artifacts? How are opened runs tracked? What survives reload/resume? |
| Minih adapter contract | API Contract / Integration Pattern | Clarifies whether v1 shells out, imports Minih helpers, or asks Minih upstream for new public APIs. | Which helpers are public? Which reads use fixtures? How are errors normalized? |
| Modal TUI feasibility | UX / Integration Pattern | Needed to prove Pi can render full-area modal with independent scroll and status panes. | Can current custom UI/overlay APIs support this? Is upstream Pi TUI work required? What is the fallback? |
| Phase 3 companion messaging and controls | State Machine / API Contract | Send/stop/report behavior must be explicit and safe after read-only viewing is proven. | When is typing enabled? What confirmations are required? How do stop and farewell gates work? |
| Phase 3 push-context policy | API Contract / State Machine | Prevents context flood while ensuring Minih findings/questions reach the main Pi agent. | Which event classes push? Which trigger turns? How are duplicates/debounces handled? |
| Deterministic smoke design | Integration Pattern | UI and Phase 3 push-context features need repeatable proof without relying on model behavior. | How do tests create fake Minih artifacts? How does smoke assert modal rendering and Esc close behavior? |

---

## Validation Record (2026-05-16)

### Validation Thesis

**Raison d'être**: Reduce ambiguity before architecture for a Pi-native Minih Workbench: first prove Minih-only visibility inside Pi, then require Phase 3 interaction/control/push-context without letting those later capabilities derail the first proof.

**Value claim**: Minih runs become more knowable and safer to operate from Pi; downstream planning becomes clearer because read-only visibility, safe close, Phase 3 controls, and no-right-dock scope are explicit.

**Artifact promise**: Future architecture/review/tasks/implementation can rely on a max-3-phase product contract: Phase 1 inventory/adapter, Phase 2 full modal viewer, Phase 3 interaction + push + hardening; `Esc` never stops a run; Minih artifacts remain source of truth.

**Intended beneficiaries**: plan-3 architect, plan-4 reviewer, plan-5 task authors, minih-workbench implementers, Pi users/operators, and future maintainers.

**Proof target**: Contract, approaching Implementation.

**Evidence standard**: Clear goals/non-goals, domain boundaries, suggested phases, acceptance criteria, testing strategy, explicit safety invariants, and cross-document consistency with the workshop/flight plan and research dossier.

**Thesis source**: Spec Research Context/Summary/Goals/Suggested Phases/Acceptance Criteria; flight plan Mission/Current Decisions; workshop Value Thesis/Purpose/Recommendation; user clarification that first proof is read-only and Phase 3 includes typing/send/stop/push-context.

**Thesis verdict**: Advanced after fixes.

**Main thesis risk**: Residual optional language could have let downstream architecture demote required Phase 3 controls; this validation pass replaced that wording and added Phase 3 safety/push contracts.

---

| Agent | Lenses Covered | Thesis Axes Covered | Issues | Verdict |
|-------|---------------|---------------------|--------|---------|
| Clarity/UX | User Experience, Concept Documentation, Proof-Level Fit, Evidence Sufficiency, Hidden Assumptions, Thesis Alignment | User/Product Value Preservation, Accessibility/Knowability, Implementation Readiness, Review Compression | 1 HIGH fixed; 1 MEDIUM partially fixed | ✅ after fixes |
| Completeness/Risk | Evidence Sufficiency, Edge Cases & Failures, Security & Privacy, Deployment & Ops, Performance & Scale, Technical Constraints, System Behavior, Hidden Assumptions | Operational Reliability, Safety to Change, Contract Integrity, Implementation Readiness | 2 HIGH fixed; 5 MEDIUM open/partially fixed | ⚠️ medium follow-ups for architecture |
| Thesis Alignment | Thesis Alignment, Evidence Sufficiency, Proof-Level Fit, Hidden Assumptions, Domain Boundaries, Concept Documentation | Thesis Alignment, User/Product Value Preservation, Downstream Usefulness, Implementation Readiness, Review Compression | 1 HIGH fixed | ✅ after fixes |
| Forward Compatibility | Forward-Compatibility, Integration & Ripple, Test Boundary, Domain Boundaries, Technical Constraints, Deployment & Ops, System Behavior | Downstream Usefulness, Contract Integrity, Agent Readiness, Implementation Readiness, Cross-Domain Coordination | 1 HIGH fixed; 2 MEDIUM fixed/partially fixed | ✅ after fixes |

### Forward-Compatibility Matrix

| Consumer | Requirement | Failure Mode | Verdict | Evidence |
|----------|-------------|--------------|---------|----------|
| plan-3-v2-architect / future agent-workbench-plan.md | Produce a max-3-phase architecture without inventing product intent. | contract drift | ✅ | Suggested phases and clarified Phase 3-required wording now align in Target Domains, Documentation Strategy, Workshop Opportunities, and Acceptance Criteria. |
| plan-4-v2-complete-the-plan | Review scope, safety, tests, feasibility, and high issues against explicit criteria. | test boundary | ✅ | Acceptance Criteria now include deterministic smoke for read-only proof plus coordinated send, confirmed stop/report controls, pushed context, and duplicate suppression. |
| plan-5-v2 phase tasks | Decompose into extension files, store/projection tests, smoke, docs, and safety gates. | shape mismatch | ✅ | Spec now exposes Phase 3 safety/push policy, fixture evidence, write/control gates, push taxonomy, and validation criteria. |
| `.pi/extensions/minih-workbench` implementation | Implement command/UI/data contracts plus close/send/stop/push invariants without taking over Minih ownership. | lifecycle ownership | ✅ | Spec keeps Minih execution/artifacts upstream-owned, makes `Esc` close non-destructive, and adds capability/confirmation/audit gates for write paths. |

**Thesis alignment**: Value claim advanced after fixes; proof level remains Target = Contract, approaching Implementation and Actual = Contract, approaching Implementation; main remaining thesis risk is ensuring architecture preserves the read-only first proof before Phase 3 interaction/push work.

**Outcome alignment**: With these fixes, the spec preserves the VPO outcome that “Minih companions and agent runs produce valuable context, findings, statuses, and reports, but today they are hidden behind separate CLI views and artifact paths. The first proof makes Minih observable from the main Pi session; Phase 3 makes it interactable and context-aware.”

**Standalone?**: No — downstream consumers are plan-3 architecture, plan-4 completeness review, plan-5 phase tasks, and `.pi/extensions/minih-workbench` implementation.

Overall: VALIDATED WITH FIXES
