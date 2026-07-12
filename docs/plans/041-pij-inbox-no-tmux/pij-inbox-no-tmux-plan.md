# Pij Inbox Pull Mode and Windows-Compatible No-Tmux Sessions
**Mode**: Full
**Plan Version**: 1.1.1
**Created**: 2026-07-12
**Status**: READY
**Spec source**: unified (this file)

## Business Specification

### Research Context

📚 Incorporates findings from [research-dossier.md](./research-dossier.md).

🧰 [backpressure-coverage.md](./backpressure-coverage.md) rates current proof
**Partial**: the repo has strong general gates, while the feature-specific
Windows, atomic-claim, pull-round-trip, receipt, and daemon-ownership sensors are
BUILDABLE and already form Phase 1 plus the relevant later test tasks.

The existing `FsChannel` is already a portable, atomic file-backed delivery
substrate. The missing contracts are durable read state, a pull consumer, a
non-tmux registration mode, and deterministic Windows proof. Current tmux
consumption deletes files; current pi consumption retains them but records read
state only in memory.

### Summary

pij must remain push-first when tmux or the pi runtime can inject messages, while
also supporting agents in ordinary shells that can only pull. The grouped
`pij inbox` surface auto-registers the current agent from its ambient native
session identity, returns unread messages, or blocks with `--wait [ms]`. Every
consumer records read state through an immutable message plus an atomic
per-message marker, so pi injection, tmux injection, and manual pulls share one
observable inbox history.

This reuses pij's existing durable `(harness, nativeSessionId) ↔ pij-id` join:
Claude exposes `CLAUDE_CODE_SESSION_ID`, Copilot
`COPILOT_AGENT_SESSION_ID`, Codex `CODEX_THREAD_ID`, and pi already
self-registers from `SessionManager.getSessionId()`. Spawn and daemon-driven
injection remain tmux-only. Windows compatibility becomes a deterministic
engineering-harness sensor and a real Windows CI job.

### Goals

- Add `pij inbox [--wait [ms]] [--json]` as the short alias of
  `pij inbox check`.
- Add idempotent `pij inbox register [--json]`; keep
  `pij adopt --current` as a compatibility alias to the same implementation.
- Mark messages read automatically and durably through one atomic marker per
  message while retaining the immutable message envelope.
- Return all unread non-receipt messages in lexical delivery order; hide internal
  receipts from user-facing output.
- Make bare `--wait` indefinite; an optional millisecond value imposes a timeout.
- Mark tmux-injected messages read only after the injection outcome is known.
- Mark pi-delivered messages read after the in-process receiver accepts them.
- Auto-register first-use inbox callers through ambient native session identity,
  without requiring harness flags, session-id flags, shell exports, or tmux.
- Extend all self-requiring CLI verbs to reverse-resolve the ambient native tuple
  before ambiguous cwd/pane fallbacks.
- Preserve sender identity, raw message bodies, ordering, remote commands, and
  `queued → delivered|unverified` receipt semantics.
- Add Windows compatibility to `harness checks`, `just self-check`, and CI.
- Teach `/pij` to select push or pull guidance from deterministic environment
  signals.

### Non-Goals

- Headless spawning of Claude, Copilot, Codex, or pi on Windows.
- Replacing tmux for spawn, pane control, transcript capture, or daemon-driven
  injection.
- Replacing pi's in-process `sendUserMessage` seam.
- Networked or multi-machine messaging.
- Inbox garbage collection, retention limits, search, or a read-history UI.
- Renaming existing sessions or changing s040 memorable-id semantics.
- Fixing unrelated `pij list --json` size or other control-plane papercuts.

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|--------------|----------------------|
| `pij-messaging` | existing | **modify** | Own durable inbox/read contracts, pull CLI behavior, receipt filtering, and pi-side mark-read. |
| `pij-control-plane` | existing | **modify** | Add pull delivery selection, ambient-native registration, daemon non-ownership of pull inboxes, and tmux post-injection mark-read. |
| `pij-skill` | existing | **modify** | Detect and teach non-tmux pull mode without weakening push-first operation. |
| `extension-authoring-harness` | existing capability | **modify** | Add the Windows compatibility sensor, portable integration lane, and Windows CI proof. |

### Testing Strategy

- **Approach**: Hybrid.
- **Rationale**: read state, parsing, transport selection, and identity resolution
  are deterministic and require tests-first coverage; filesystem atomicity and
  CLI behavior require real temporary directories and process-level integration;
  Windows claims require a Windows runner.
- **Focus Areas**: atomic marker claims; ordering; legacy inbox compatibility;
  concurrent readers; indefinite/finite wait; hidden receipts; receipt completion;
  pull delivery selection; exact identity reuse; daemon/pi/tmux ownership;
  Windows path/process behavior.
- **Excluded**: live tmux behavior from hosted Windows CI; it remains covered by
  existing local smoke plus focused fake-port tests.
- **Mock Usage**: Avoid mocks. Use existing fake ports, real filesystem fixtures,
  and subprocess integration tests.

### Documentation Strategy

- **Location**: `docs/how/pij.md`, `/pij` skill files, and affected domain docs.
- **Rationale**: the operator needs exact `pij inbox` commands, while
  agents need deterministic push-vs-pull routing guidance.

### Complexity

- **Score**: CS-5 (epic)
- **Breakdown**: S=2, I=2, D=2, N=2, F=2, T=2
- **Confidence**: 0.80
- **Assumptions**: existing atomic registry APIs can register a pull descriptor
  without changing `fs-registry.ts`; immutable message retention is acceptable
  until a separate retention plan; Windows CI can install Node and execute the
  portable npm test lane without tmux.
- **Dependencies**: s040 must finish or grant serialized overlap on `cli.ts`,
  `core/cli.ts`, and CLI integration tests; daemon restart requires its baton.
- **Risks**: concurrent read claims; pull descriptor liveness semantics; receipt
  handling without a daemon; Windows-only process/path behavior; live skill edits
  taking effect immediately.
- **Phases**: 3.

### Acceptance Criteria

- **AC-01**: `pij inbox` and `pij inbox check` resolve or auto-register self,
  return every unread non-receipt message in message-id order, print sender
  identity and body in human mode, and return the workshop-defined stable JSON
  envelope under `--json`.
- **AC-02**: A successful pull creates exactly one read marker per returned
  message. Re-running `check`, restarting the process, or racing two checkers
  never returns a marker-owned message twice.
- **AC-03**: Legacy inbox files with no marker remain readable without migration;
  marker existence is authoritative even when optional marker metadata is absent
  or malformed.
- **AC-04**: `pij inbox --wait` and `pij inbox check --wait` block indefinitely
  until at least one unread user message arrives, then return all currently
  unread messages. `--wait N` exits 0 with `timedOut:true` after N milliseconds
  when none arrive.
- **AC-05**: Receipt messages are never printed as user messages. Pulling a normal
  message emits the same terminal `delivered` receipt expected from successful
  consumption, and `pij send --wait` can exclusively claim terminal receipt
  envelopes from the sender inbox without a daemon or a race with `pij inbox`.
- **AC-06**: A tmux-injected message remains on disk and receives its read marker
  only after `drainTmuxInbox` returns an injection outcome; `unverified` remains
  terminal and visible to the sender.
- **AC-07**: A pi-delivered message receives its read marker after
  `PijSession.onInbound`; reload does not replay marked history and the daemon
  still never drains pi inboxes.
- **AC-08**: `pij inbox register` and its alias `pij adopt --current`
  auto-detect exactly one ambient native identity, create or reattach it without
  tmux, set pull delivery, and reuse the same pij id on repeat registration.
- **AC-09**: After registration, every targetless/self-requiring pij command can
  resolve the current external agent from its ambient native tuple in a fresh
  subprocess; `PIJ_SESSION_ID` remains the highest-priority override.
- **AC-10**: Sends to a registered pull peer are durable even when no daemon is
  running or its descriptor pid is gone: pull delivery bypasses the pid-based
  `E-DEAD` preflight, while dissolved peers and dead push peers still fail.
  Spawn, daemon injection, and pane-control commands remain explicitly tmux-only.
- **AC-11**: Existing descriptors with no delivery-mode field retain current pi
  or tmux behavior; all persisted schema changes are additive.
- **AC-12**: A Windows CI job runs the portable compatibility lane successfully,
  while Linux CI and local tmux smoke remain green.
- **AC-13**: `harness checks` reports a named Windows-compatibility sensor, and
  `just self-check` runs the same underlying command.
- **AC-14**: `/pij` tells a non-tmux peer to use `pij inbox --wait` (auto-register
  on first use); tmux/pi peers retain push-first guidance.

### Risks & Assumptions

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Two pull processes race the same unread message | Medium | High | Marker creation is an exclusive atomic claim; only the winner returns the message. |
| Pull descriptors appear dead after the registering CLI exits | Medium | High | Use the long-lived parent agent pid when available; native identity and pull mailbox delivery never depend on pid liveness. |
| Read marking breaks honest receipts | Medium | High | Sequence mark-read after consumption outcome; preserve Plan 032 mapping and add regression tests. |
| A stale daemon drains a newly registered pull inbox | Medium | Critical | Land and deploy the daemon ownership guard before exposing the registration/check verbs. |
| Immutable history grows without bound | Medium | Medium | Explicit non-goal; keep layout compatible with a later GC/retention verb. |
| Windows lane is green but too narrow | Medium | High | Run a named harness sensor locally and the same portable command on real Windows CI. |
| s040 changes overlapping CLI contracts during implementation | High | High | Request serialized windows; new modules/tests where possible; rebase/read current files before every apply. |
| Live `/pij` skill text regresses active agents | Low | High | Make skill edits last, run `just pij-skill-check`, and keep push-mode wording byte-stable where behavior is unchanged. |

### Open Questions

None. Workshop 001 resolved the CLI layout and validated ambient native identity
for all supported harnesses.

### Workshop Opportunities

None — [Workshop 001](./workshops/001-cli-layout.md) is approved and
implementation-ready.

### Clarifications

#### Session 2026-07-12

| Question | Decision |
|----------|----------|
| Workflow mode | Full. |
| Testing strategy | Hybrid: TDD for core/state, real-filesystem and subprocess integration, plus Windows CI. |
| Mock usage | Avoid mocks; use existing fakes and real fixtures. |
| Documentation | `docs/how/` plus `/pij` skill guidance. |
| Read-state persistence | Immutable message envelopes plus one atomic marker per message. |
| Bare `pij inbox --wait` | Wait indefinitely; optional milliseconds set a timeout. |
| Windows proof | Add a Windows CI job and encode the compatibility check in the engineering harness. |
| No-tmux identity scope | Add current-session adoption/registration; keep spawn and daemon injection tmux-only. |
| CLI namespace | Group under `pij inbox`; bare `inbox` aliases `inbox check`. |
| Registration UX | `pij inbox` auto-registers; `pij inbox register` is an explicit idempotent diagnostic. |
| Adopt compatibility | `pij adopt --current` aliases `pij inbox register`. |
| Session resolution | Reuse ambient native identity: Claude/Copilot/Codex env signals and pi's existing `PIJ_SESSION_ID`. |

## Planning Seam
_Refinement opportunities still open — recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: none — CLI layout and ambient identity are approved.

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| research-dossier.md | yes | Defines current delivery/read behavior, Windows gaps, and overlap hazards. |
| workshops/*.md | yes | Workshop 001 is authoritative for namespace, aliases, auto-registration, outputs, errors, and self-resolution precedence. |
| backpressure-coverage.md | yes | Confirms Phase 1 must establish the Windows, atomic-claim, portable round-trip, pull-ownership, and receipt-wait sensors before feature exposure. |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | Product and CLI decisions recorded; no critical clarification markers remain. |
| G2 | Constitution | N/A | No `docs/project-rules/constitution.md`. |
| G3 | Architecture | N/A | No `docs/project-rules/architecture.md`; domain and AGENTS rules applied directly. |
| G4 | ADR Compliance | N/A | No accepted ADR directory exists. |
| G5 | Structure | PASS | Both halves, manifests, phases, measurable ACs, risks, and coverage map are present. |
| G6 | Testing Alignment | PASS | Every phase starts with deterministic tests/sensors before implementation. |
| G7 | Domain Completeness | PASS | All four existing domains are registered and every task path is manifested. |

### Summary

Build a durable inbox read model first, under a Windows-compatible deterministic
sensor, then add the workshopped `pij inbox` CLI and ambient-native
auto-registration, and finally converge pi/tmux consumption plus
skill/documentation guidance. The persisted change is additive: immutable
messages remain where they are, read markers record consumption, and an optional
delivery mode distinguishes pull peers from legacy push peers. s040 overlap is
serialized rather than merged opportunistically.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `.pi/extensions/pij/core/types.ts` | pij-messaging | contract | Add persisted delivery/read vocabulary. |
| `.pi/extensions/pij/core/ports.ts` | pij-messaging | contract | Add the read-side inbox port. |
| `.pi/extensions/pij/core/harness/types.ts` | pij-control-plane | contract | Select pull vs pi-inbox vs tmux-sendkeys transport. |
| `.pi/extensions/pij/core/harness/pi.ts` | pij-control-plane | internal | Make daemon ownership explicitly exclude pull descriptors. |
| `.pi/extensions/pij/core/current-session.ts` | pij-control-plane | internal | New pure current-session registration resolver. |
| `.pi/extensions/pij/core/current-session.test.ts` | pij-control-plane | internal | Prove harness env, fallback, and descriptor inputs. |
| `.pi/extensions/pij/core/inbox.ts` | pij-messaging | internal | Pure grouped-subcommand grammar, output models, claim/render decisions, and wait metadata. |
| `.pi/extensions/pij/core/inbox.test.ts` | pij-messaging | internal | Tests-first workshop CLI contract coverage. |
| `.pi/extensions/pij/core/cli.ts` | pij-messaging | internal | Apply ambient native self-resolution and exempt durable pull targets from pid-based send rejection. |
| `.pi/extensions/pij/core/cli.test.ts` | pij-messaging | internal | Tests-first CLI contract coverage. |
| `.pi/extensions/pij/core/binding.ts` | pij-control-plane | contract | Add `CODEX_THREAD_ID` to current-session/phonehome resolution. |
| `.pi/extensions/pij/core/binding.test.ts` | pij-control-plane | internal | Preserve Claude/Copilot behavior and prove Codex ambient resolution. |
| `.pi/extensions/pij/adapters/channel.ts` | pij-messaging | internal | Implement unread listing and atomic markers beside delivery/watch. |
| `.pi/extensions/pij/adapters/channel.test.ts` | pij-messaging | internal | Real-filesystem atomicity, ordering, migration, and concurrency tests. |
| `.pi/extensions/pij/adapters/fakes.ts` | pij-messaging | internal | Fake inbox port for core tests. |
| `.pi/extensions/pij/index.ts` | pij-messaging | cross-domain | Mark pi-consumed messages read after runtime acceptance. |
| `.pi/extensions/pij/index.test.ts` | pij-messaging | cross-domain | Guard reload/no-replay and mark timing. |
| `.pi/extensions/pij/core/daemon/loop.ts` | pij-control-plane | internal | Preserve post-outcome consumption sequencing. |
| `.pi/extensions/pij/core/daemon/loop.test.ts` | pij-control-plane | internal | Guard pull routing and tmux outcome order. |
| `.pi/extensions/pij/core/daemon/router.ts` | pij-control-plane | internal | Route pull descriptors to observe/leave-on-disk instead of buffer/sendkeys. |
| `.pi/extensions/pij/core/daemon/router.test.ts` | pij-control-plane | internal | Prove pull descriptors are never buffered or injected. |
| `.pi/extensions/pij/daemon.ts` | pij-control-plane | internal | Leave pull inboxes alone and mark tmux messages read instead of deleting. |
| `.pi/extensions/pij/daemon.test.ts` | pij-control-plane | internal | Prove delivery ownership and retained history. |
| `.pi/extensions/pij/cli.ts` | pij-control-plane | internal | Intercept/wire `inbox` before E-NOREG, alias `adopt --current`, and let receipt waits claim inbox envelopes. |
| `.pi/extensions/pij/cli.integration.test.ts` | pij-control-plane | internal | Preserve existing integration behavior; overlap with s040 is serialized. |
| `.pi/extensions/pij/cli.inbox.integration.test.ts` | pij-messaging | cross-domain | New platform-neutral subprocess round-trip without fake tmux. |
| `harness/scripts/windows-compat.ts` | extension-authoring-harness | internal | New portable compatibility runner/sensor command. |
| `.harness/extensions/checks/extension.ts` | extension-authoring-harness | contract | Add the Windows compatibility signal to `harness checks`. |
| `.harness/extensions/checks/instructions.md` | extension-authoring-harness | contract | Describe the new sensor and evidence. |
| `package.json` | extension-authoring-harness | contract | Expose the portable npm command. |
| `justfile` | extension-authoring-harness | contract | Add `windows-compat` and compose it into `self-check`. |
| `.github/workflows/ci.yml` | extension-authoring-harness | contract | Execute the portable lane on Windows. |
| `skills/pij/SKILL.md` | pij-skill | contract | Update platform description and CLI-verb coverage. |
| `skills/pij/references/00-routing.md` | pij-skill | contract | Add deterministic push/pull mode detection and conventions. |
| `skills/pij/references/routes/peer.md` | pij-skill | contract | Teach auto-registration and `pij inbox --wait`. |
| `docs/how/pij.md` | pij-messaging | contract | Document the pull inbox and no-tmux registration workflow. |
| `docs/domains/pij-messaging/domain.md` | pij-messaging | contract | Record inbox/read/receipt contracts and port count. |
| `docs/domains/pij-control-plane/domain.md` | pij-control-plane | contract | Record pull delivery and no-tmux adoption boundary. |
| `docs/domains/pij-skill/domain.md` | pij-skill | contract | Record push/pull routing concepts. |
| `docs/domains/registry.md` | extension-authoring-harness | cross-domain | Refresh affected domain purpose summaries. |
| `docs/domains/domain-map.md` | extension-authoring-harness | cross-domain | Refresh contracts and validation edges. |

### Fence and Coordination Manifest

| Path / seam | Action | Coordination |
|-------------|--------|--------------|
| `docs/plans/041-pij-inbox-no-tmux/**` | modify/new | s041-owned. |
| `.pi/extensions/pij/{adapters/channel.ts,adapters/channel.test.ts,adapters/fakes.ts,core/types.ts,core/ports.ts,index.ts,index.test.ts,daemon.ts,daemon.test.ts,core/daemon/loop.ts,core/daemon/loop.test.ts,core/daemon/router.ts,core/daemon/router.test.ts,core/harness/pi.ts}` | modify | s041 after current-file reread; daemon restart baton required before live proof. |
| `.pi/extensions/pij/core/{current-session.ts,current-session.test.ts,inbox.ts,inbox.test.ts}` | new | s041-owned. |
| `.pi/extensions/pij/{core/cli.ts,core/cli.test.ts,core/binding.ts,core/binding.test.ts,cli.ts,cli.integration.test.ts}` | modify | **Hot overlap with s040**; request serialized apply/commit window from o-prime. |
| `.pi/extensions/pij/cli.inbox.integration.test.ts` | new | s041-owned; prefer this over expanding s040's fixture. |
| `skills/pij/**` | modify | Live-deployed; edit only after code behavior is settled and run `just pij-skill-check`. |
| `.harness/extensions/checks/**`, `harness/scripts/windows-compat.ts`, `justfile`, `package.json`, `.github/workflows/ci.yml` | modify/new | s041-owned unless o-prime reports another claimant. |
| `.pi/extensions/pij/{adapters/fs-registry.ts,core/discovery.ts,core/spawn.ts,core/harness/copilot.ts}` | **no planned modification** | s040-owned; existing registry identity APIs are consumed as-is. |
| `.the-flow-state.json`, `the-flow.json`, `the-flow.md` | forbidden manual writes | Only `harness flow` may mutate flight-plan files. |

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | Daemon delete-on-consume destroys the immutable history required by pull reads. | Replace deletion with post-outcome atomic mark-read. |
| 02 | Critical | Pi's `seen` set records no durable consumption and seeds all retained history as implicitly read. | Share the read-marker port with pi, tmux, and pull consumers. |
| 03 | Critical | Harness kind alone cannot distinguish a Copilot tmux peer from a Copilot pull peer. | Add an optional additive delivery mode and a pure transport selector. |
| 04 | Critical | Ambient native identity already exists for every harness, but pij's resolver is not uniform: Codex exposes `CODEX_THREAD_ID` while phonehome ignores it. | Centralize the env→native tuple adapter and reverse-resolve the existing durable join; do not create another identity mechanism. |
| 05 | High | Receipts must stay hidden while remaining authoritative for `send --wait`. | Consume receipt envelopes internally and preserve `queued → delivered|unverified` ordering. |
| 06 | High | Current CI and CLI integration fixtures do not prove Windows compatibility. | Build the harness sensor and platform-neutral lane before feature completion; run it on Windows CI. |
| 07 | High | First-use `pij inbox` must create the registry, but the normal CLI path exits E-NOREG before parsing. | Intercept the grouped inbox verb before the E-NOREG guard; route both aliases to one implementation. |
| 08 | Critical | Universal send preflight rejects a pull target when its pid is gone, even though its mailbox is durable. | Skip pid-based `E-DEAD` only for pull delivery; keep dissolved/dead-push rejection. |
| 09 | High | `send --wait` reads receipt events only; daemon-free pull receipts remain as inbox envelopes. | Poll and exclusively claim receipt envelopes through the shared inbox port. |
| 10 | Critical | A running old daemon treats a bound Claude/Copilot/Codex pull descriptor as sendkeys-owned and can buffer then delete its messages. | Land, review, restart, and canary the pull ownership guard before enabling registration. |

### Phases

#### Phase Index

| Phase | Title | Primary Domain | Objective | Depends On |
|-------|-------|---------------|-----------|------------|
| 1 | Portable Backpressure and Durable Inbox | extension-authoring-harness / pij-messaging | Establish the Windows sensor and atomic read primitives before pull behavior. | None |
| 2 | Inbox CLI and Ambient Registration | pij-messaging / pij-control-plane | Deliver the grouped inbox CLI, wait, receipts, pull transport, and ambient-native registration. | Phase 1 |
| 3 | Push-Path Convergence and Guidance | pij-control-plane / pij-skill | Mark pushed deliveries read, preserve regressions, update guidance, and prove the full contract. | Phase 2 |

#### Phase 1: Portable Backpressure and Durable Inbox

**Objective**: Create the deterministic Windows lane and the reusable durable
read-state substrate before implementing user behavior.
**Domain**: extension-authoring-harness / pij-messaging
**Delivers**:
- A named Windows-compatibility sensor in `harness checks`.
- A portable subprocess test entrypoint with no POSIX fake-tmux dependency.
- Immutable message envelopes plus exclusive per-message read markers.
- A read-side core port and fake adapter.
**Depends on**: None.
**Key risks**: cross-platform exclusive-create semantics; accidentally broadening
the Windows lane to tmux-only tests.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1.1 | Write failing real-filesystem tests for unread ordering, legacy files, exclusive marker claims, concurrent readers, malformed marker metadata, and receipt classification. | pij-messaging | Tests fail against current `FsChannel` and use `tmpdir()`/`node:path` only. | Per findings 01, 02 |
| 1.2 | Add the inbox/read contract to core types/ports/fakes and implement marker-backed list/claim/mark operations in `FsChannel`. | pij-messaging | Marker creation is exclusive and idempotent; message JSON is never rewritten or removed; Phase 1 tests pass. | Marker existence is authoritative. |
| 1.3 | Add a platform-neutral CLI subprocess fixture and baseline no-tmux integration file. | extension-authoring-harness | Test setup uses Node executables/filesystem APIs, not `#!/bin/sh`, executable bits, or tmux. | New file avoids s040 fixture overlap. |
| 1.4 | Build `harness/scripts/windows-compat.ts`, `npm run windows:check`, and `just windows-compat`; add the sensor to `harness checks` and `just self-check`. | extension-authoring-harness | `harness checks --quick` names and passes `windows-compat`; instructions describe what it proves. | Jordan ruling |
| 1.5 | Add a Windows CI job that runs install, typecheck, lint, and the portable Windows compatibility command. | extension-authoring-harness | The job runs on `windows-latest` without tmux and passes the Phase 1 baseline. | AC-12, AC-13 |

#### Phase 2: Inbox CLI and Ambient Registration

**Objective**: Make a registered non-tmux peer fully usable through pull delivery
and stable current-session identity.
**Domain**: pij-messaging / pij-control-plane
**Delivers**:
- `pij inbox [check] [--wait [ms]] [--json]`.
- `pij inbox register` plus `pij adopt --current` alias.
- Hidden internal receipt consumption and pull-delivery acknowledgements.
- Additive pull transport selection.
**Depends on**: Phase 1.
**Key risks**: s040 CLI/binding overlap; receipt waits without a daemon; first-use
registration occurring before the normal registry guard.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.1 | Write failing workshop-contract tests for `pij inbox` default/check/register parsing, adopt aliasing, human/JSON outputs, indefinite vs finite wait, and E-ARG/E-AMBIG/E-NOID behavior. | pij-messaging / pij-control-plane | Tests encode Workshop 001 examples before implementation. | Request s040 window first. |
| 2.2 | Add the pure ambient native identity adapter for Claude/Copilot/Codex, extend phonehome for `CODEX_THREAD_ID`, and reverse-resolve the existing durable registry join before cwd/pane fallback. | pij-control-plane / pij-messaging | Fresh subprocesses resolve exact self without PIJ_SESSION_ID; duplicate signals/joins fail E-AMBIG; 86 existing identity tests stay green. | Per finding 04 |
| 2.3 | Add optional `deliveryMode: "push"|"pull"` semantics and `ensureCurrentRegistration()` over existing `FsRegistry.allocateIdentity`/write APIs; in the same change, exclude pull descriptors from daemon ownership/router buffering and from pid-based `E-DEAD` send preflight. | pij-control-plane / pij-messaging | Legacy pi/tmux cases are byte-compatible; dead pull targets accept durable sends; dissolved/dead-push targets still fail; daemon/router leave pull inboxes on disk; no fs-registry change. | Per findings 03, 07, 08, 10 |
| 2.4 | Obtain reviewer approval and the daemon-restart baton, restart onto the pull ownership guard, and canary that a seeded bound pull descriptor's message remains on disk. | pij-control-plane | Live daemon no longer drains/buffers a pull inbox; no registration/check CLI is enabled before this proof. | Deployment ordering; finding 10 |
| 2.5 | Implement the grouped inbox bin/core flow before E-NOREG: bare `inbox` aliases `check`; bare wait has no deadline; numeric wait does; wake returns all unread user messages. | pij-messaging | AC-01–AC-04 pass in unit and portable subprocess tests without tmux/daemon. | Do not reuse 15s send default. |
| 2.6 | Implement internal receipt processing for pull peers: inbox check hides/claims receipt envelopes, normal-message claims emit `delivered`, and `waitReceipts` polls both events and exclusively claimed receipt envelopes through the shared inbox port. | pij-messaging | AC-05 passes without daemon injection; concurrent `pij inbox` cannot double-consume the receipt; existing `unverified` parser and ordered broadcast waits remain green. | Per findings 05, 09 |
| 2.7 | Wire `pij inbox register` and `pij adopt --current` to the same idempotent registration operation. | pij-control-plane | Repeated exact-native registration returns the same id; neither form requires pane/harness/session-id/export flags. | Workshop 001 |
| 2.8 | Add a sandboxed two-shell integration: auto-register two pull peers from injected native envs, wait in one, send from the other, receive body, emit receipt, and resolve sender wait. | pij-messaging / pij-control-plane | End-to-end proof passes on macOS/Linux and in Windows CI with a sandboxed `PIJ_HOME`; the target descriptor pid may be dead. | AC-04, AC-05, AC-08–AC-10 |

#### Phase 3: Push-Path Convergence and Guidance

**Objective**: Make every consumer use the same durable read contract, preserve
tmux/pi behavior, and ship accurate operator/agent guidance.
**Domain**: pij-control-plane / pij-skill
**Delivers**:
- Tmux and pi read markers with retained messages.
- Full delivery/receipt regression proof.
- Push/pull-aware `/pij` guidance and operator docs.
- Updated domain contracts and final harness evidence.
**Depends on**: Phase 2.
**Key risks**: daemon restart affects live peers; skill changes are immediately
live; message-history assertions can be vacuous without mutation proof.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 3.1 | Write failing daemon, loop, and pi-wiring tests for post-outcome/post-onInbound mark-read, retained envelopes, receipt exclusion, reload no-replay, and pull non-ownership. | pij-control-plane / pij-messaging | Tests fail if marking moves before consumption or files are deleted. | Tests first |
| 3.2 | Replace tmux delete-on-consume with post-outcome mark-read and mark pi messages after `onInbound`; retain Phase 2's deployed pull non-ownership guard. | pij-control-plane / pij-messaging | AC-06, AC-07, AC-11 pass; send failure isolation and Plan 032 receipts remain green. | Daemon baton before live use |
| 3.3 | Update CLI help, `docs/how/pij.md`, `/pij` detection/conventions/peer route, and affected domain docs for push-vs-pull behavior. | pij-skill / pij-messaging / pij-control-plane | Non-tmux guidance prints `pij inbox --wait` with first-use auto-registration; tmux/pi guidance remains push-first; `just pij-skill-check` passes. | Skill edits last |
| 3.4 | Run targeted mutation proof: break marker ownership and post-outcome timing assertions, observe RED, restore byte-identical, observe GREEN. | extension-authoring-harness | Both mutations fail the intended tests and restore cleanly. | Non-vacuous evidence |
| 3.5 | Live-verify one tmux send retains its envelope and marks it read after injection; live-verify one no-tmux pull round-trip; capture Windows CI evidence. | pij-control-plane / extension-authoring-harness | Evidence points to marker/message files, terminal receipts, and the green Windows job. | No new spawn during freezes |
| 3.6 | Run `just pij-skill-check`, `harness checks`, and plan validation; restart the daemon only under the granted baton and re-run the delivery canary. | cross-domain | All sensors pass, including `windows-compat`; post-restart canary proves deployed daemon behavior. | Done/ship gate |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01 | 2.1, 2.5 | Core inbox tests + portable subprocess output |
| AC-02 | 1.1, 1.2, 3.4 | Atomic claim/concurrency tests + mutation |
| AC-03 | 1.1, 1.2 | Legacy/malformed marker filesystem fixtures |
| AC-04 | 2.1, 2.5, 2.8 | Wait unit tests + two-shell round-trip |
| AC-05 | 2.1, 2.6, 2.8 | Receipt filtering/correlation + sender wait |
| AC-06 | 3.1, 3.2, 3.5 | Daemon tests + live tmux evidence |
| AC-07 | 3.1, 3.2 | Pi wiring reload/no-replay tests |
| AC-08 | 2.1–2.3, 2.7 | Ambient identity + repeat registration tests |
| AC-09 | 2.2, 2.8 | Fresh-subprocess self-resolution across verbs |
| AC-10 | 2.3, 2.4, 2.8 | Pull preflight/ownership tests + daemon-free round-trip |
| AC-11 | 2.1–2.3, 3.2 | Legacy descriptor and push regression tests |
| AC-12 | 1.3, 1.5, 3.5 | Windows CI portable lane |
| AC-13 | 1.4, 3.6 | Harness sensor inventory + full checks |
| AC-14 | 3.3, 3.6 | Skill check + documentation assertions |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Shared marker writer drifts across CLI/daemon/pi | Medium | High | One `InboxPort` implementation; no call-site file writes. |
| Pull receipt processing races `check` and `send --wait` | Medium | High | Exclusive claim per envelope; receipt-specific tests with two processes. |
| `deliveryMode` changes legacy send preflight | Low | High | Absence means current behavior; explicit migration tests. |
| CLI registration lands before daemon ownership protection is deployed | Medium | Critical | Phase 2 review/restart/canary gate precedes the first registration command. |
| s040 lands incompatible CLI changes mid-phase | High | High | Preamble hash, current-file reread, o-prime window, narrow commits. |
| Windows CI cannot run `just`/ambient harness | Medium | Medium | CI runs the npm portable command; committed harness sensor wraps the same command locally. |
| Full immutable history becomes large | Medium | Medium | Non-goal recorded; marker/message layout supports later GC without wire migration. |
