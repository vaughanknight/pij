# pij tmux Control Plane + Machine-Wide Daemon
**Mode**: Simple
**Plan Version**: 1.1.1
**Created**: 2026-06-27
**Status**: READY
**Spec source**: unified (this file)

📚 Incorporates findings from `research-dossier.md` + the live readiness prototype (`scratch/tmux-claude-ready/`).

## Business Specification

### Research Context
The explore pass (`research-dossier.md`, 10 findings) established that pij's spawn/registry/close machinery is reusable as-is (F-03/F-05), the tmux primitives we need already exist in `harness/driver/tmux.ts` (F-02), exactly one seam — `pi.sendUserMessage` — must stay in-process (F-06), and everything else (the `FsChannel.watch` loop, routing, registry) is portable to a daemon (F-07). Identity + phone-home reuse the `PIJ_SESSION_ID` env-join (F-08); the Claude transcript path is a deterministic cwd-mangle (F-09).

A **live prototype** (`scratch/tmux-claude-ready/probe.sh`) then validated the riskiest mechanic end-to-end against Claude Code v2.1.195 / Sonnet 4.6: split a pane right, launch claude, detect readiness from `capture-pane`, inject text + Enter → Claude replied `⏺ ACK` in ~5s total. It corrected two assumptions and surfaced one new requirement — folded in below (F-07, F-08, and the deterministic-binding insight).

This revision (v1.1.0) also closes the four HIGH gaps from the v1.0.0 validation (`validations/…`): deterministic binding, the pending-descriptor handoff, init idempotency, and pi-target delivery ownership.

### Summary
Turn pij into a **harness-agnostic control plane**. A machine-wide **pij daemon** (a CLI you run in a tmux window, with a chalk log TUI) is the switchboard: it centralizes inbox watching, message routing, the session registry, and a live view. pij **spawns any harness** — pi today, Claude Code now via tmux, Copilot later — by allocating a **pij-id before launch**, opening a tmux window/pane (which hands back the paneId), writing a **pending descriptor**, and then — daemon-side, asynchronously — handling boot **interstitials**, detecting **readiness** from the pane, and injecting the init once. Identity binding is **deterministic**: the daemon discovers the new Claude transcript under `~/.claude/projects/<mangled cwd>/` to derive the session id with no agent cooperation; `pij phonehome` is confirmatory, with a watchdog fallback. The binding (`pij-id ↔ harness-session-id ↔ pane ↔ cwd`) lets the daemon **tail** the linked session and notifies the creator asynchronously — it never blocked. Messaging is **fire-and-forget**: senders write to the target inbox; the daemon **injects** for tmux targets (`send-keys`+Enter, including `/compact`), while pi targets are self-injected by a thin in-process receiver.

### Goals
- One stable identity (`pij-id`), allocated **before** launch, routing to a pi-native or tmux-native target identically.
- A machine-wide, **single-instance** daemon owning watch + route + registry + chalk TUI; rebuildable from `~/.pij/` (UI is a view).
- Spawn that **returns the pij-id immediately** (caller never blocks); the daemon dismisses interstitials, detects readiness, and injects the init exactly once.
- **Deterministic** `pij-id ↔ harness-session-id` binding (transcript-discovery), phone-home confirmatory, watchdog on failure — enabling out-of-band tailing.
- Fire-and-forget messaging via `send-keys` (ungated) to tmux targets; the existing inbox path preserved for pi targets with clear delivery ownership.
- Cross-compat pi ↔ claude now; copilot-cli behind the same harness-type seam later.
- Adopt an already-running tmux agent (assign id + bind).

### Non-Goals
- Copilot CLI transport (designed-for, not built this pass).
- Replacing pi's in-process inject seam (it stays; the daemon routes to it).
- A full-screen dashboard TUI (chalk log stream now; ink/pi-tui later).
- A socket/RPC server (files-under-`~/.pij` + watch is the rendezvous).
- Multi-machine / networked control.

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|--------------|----------------------|
| `pij-control-plane` | **NEW** | **create** | The daemon (switchboard + chalk TUI + single-instance lock), tmux transport, harness-type adapters, readiness + interstitial handling, deterministic transcript-discovery binding, pij-id pre-allocation, pending-descriptor handoff, transcript tailing. |
| `pij-messaging` | existing | **modify** | `SessionDescriptor` += `harness`/`harnessSessionId`/`initInjectedAt`/`state`; add `phonehome`/`daemon`/`adopt` CLI verbs (+ allow-list); relocate the cross-session inbox-watch to the daemon, leaving a thin in-process receiver as the sole consumer of pi inboxes; pre-allocate the pij-id + write the pending descriptor at spawn. |
| `agent-tooling-interface` | existing | **consume** | New CLI verbs + `pij_spawn` harness arg present through the existing tool/command UX. |
| `extension-authoring-harness` | existing | **consume** | Source of the tmux primitives (`harness/driver/tmux.ts`) extracted into the shared lib; vitest/Biome/smoke validate. |
| `file-watch-notify` | existing | **consume** (pattern-only) | Reuses the steer/immediate inject-seam *pattern* for the pi thin receiver; no code import, no changes. |

#### New Domain Sketches

##### pij-control-plane [NEW]
- **Purpose**: A machine-wide control plane that spawns, addresses, messages, deterministically binds, verifies, and tails coding-agent sessions across heterogeneous harnesses (pi, Claude Code, later Copilot) over tmux, with a single pre-allocated identity and a file-backed switchboard daemon.
- **Boundary Owns**: the single-instance daemon lifecycle + chalk TUI; the harness-type → transport seam (`pi`→inbox, `claude`→send-keys); tmux key/paste/capture primitives (extracted shared lib); readiness detection + interstitial handling; deterministic transcript-discovery binding + phone-home confirmation + watchdog; pij-id pre-allocation + the pending-descriptor handoff; init idempotency; transcript-path resolution + tailing.
- **Boundary Excludes**: the pi in-process inject (`pi.sendUserMessage` — stays in `pij-messaging`'s thin receiver); the wire framing / receipts / event-stream contracts (owned by `pij-messaging`); user-file watching (owned by `file-watch-notify`).

### Testing Strategy
- **Approach**: **Hybrid**. TDD (tests-first, real fakes) for the pure core — transport-selection, harness-type resolution, readiness/interstitial classifiers, transcript-path mangle + discovery, binding, pij-id pre-allocation, pending-descriptor, init-idempotency, router/buffer. Lightweight smoke (Driver SDK, building on `probe.sh`) for the impure seams — tmux send-keys/capture, daemon watch loop, lockfile, chalk TUI.
- **Rationale**: mirrors the existing pij discipline (pi-free core + ports/fakes, vitest); tmux/daemon/TUI integration is awkward to unit-test and better proven by boot/smoke. The prototype already de-risked the readiness seam.
- **Focus Areas**: deterministic binding correctness; "init injected exactly once, idempotent across restart"; delivery ownership (no pi double-process; claude→pi works); readiness/interstitial classification; no regression on pi↔pi.
- **Excluded**: exhaustive live Claude TUI matrix (one smoke + the prototype cover it).
- **Mock Usage**: **Avoid mocks** — real fakes/fixtures (FakeTmux/FakeProcess/FakeFs); a test-double is permitted solely at the `tmux`/`process` boundary.

### Documentation Strategy
- **Location**: `docs/how/pij-daemon.md` — operator guide (run the single-instance daemon, spawn/adopt a harness, send/tail, the chalk TUI, recovery). Aligns with `docs/how/pij.md` + `RUNBOOK.md`.
- **Rationale**: an operator-run daemon with a CLI + TUI surface; quick-start alone is too thin.

### Complexity
- **Score**: CS-4 (large)
- **Breakdown**: S=2, I=2, D=1, N=2, F=1, T=1 → 9
- **Confidence**: 0.78 (raised from 0.70 — the prototype resolved R-01 and confirmed the spawn/capture/inject mechanic).
- **Assumptions**: `harness/driver/tmux.ts` primitives extract cheaply (argv-only); Claude Code queues `send-keys` input natively (R-02, to confirm); the telemetry cwd-mangle is current (confirmed by the transcript path).
- **Dependencies**: tmux; a live `claude` binary on PATH; the existing `~/.pij/` layout + `FsChannel`.
- **Risks**: see `### Risks & Assumptions`.
- **Phases**: **Simple mode chosen deliberately** for lean ceremony despite CS-4 — one internally-grouped phase (Groups A–G). T008 freezes the readiness marker as an explicit gate before the daemon/transport tasks (F6). If the implement turn runs long, it can be chunked by task group.

### Acceptance Criteria
- **AC-01**: `pij spawn --harness claude [--layout split|window] [--task "…"]` returns a `pij-id` immediately (caller non-blocking) and opens a tmux window/pane running `claude --model …` in the target cwd; the paneId is captured at split time.
- **AC-02**: The daemon injects the init (pij-id + confirmatory `pij phonehome` line) **exactly once**, only after the pane is ready, and **idempotently across a daemon restart** (a persisted `initInjectedAt` prevents re-injection).
- **AC-03**: Identity binds **deterministically without agent cooperation** — the daemon detects a transcript **path that did not exist at spawn** (file appearance under `~/.claude/projects/<mangled cwd>/`, **not** by mtime) to derive `harnessSessionId` and writes the binding (`pij-id ↔ harnessSessionId ↔ paneId ↔ cwd`); a pre-existing active transcript in the same cwd is never chosen. `pij phonehome` confirms when the agent runs it.
- **AC-04**: If no binding occurs within a timeout after `ready`, the daemon **watchdog** re-sends **only the confirmatory `pij phonehome` line** once (leaving `initInjectedAt` untouched, preserving init-exactly-once), then marks the spawn failed and notifies the creator — no silent dead spawn.
- **AC-05**: After binding, the creator receives an async verification notice naming the new `pij-id` as live — without the creator having blocked.
- **AC-06**: Known one-time boot **interstitials** (e.g. the Chrome-extension prompt) are auto-dismissed with Esc; **trust/login** prompts are surfaced to the creator as `needs-human`, never auto-answered.
- **AC-07**: `pij send <pij-id> "<text>"` to a claude target injects via `send-keys`+Enter (ungated); the text is submitted in that pane. `/compact` sent the same way triggers compaction.
- **AC-08**: **Delivery ownership** — a sender writes to the target inbox; the daemon **consumes+injects only tmux inboxes** and merely **observes** pi inboxes (TUI); the pi thin receiver is the **sole consumer** of pi inboxes. A **claude→pi** message is delivered (no double-process; pi↔pi unregressed).
- **AC-09**: For a bound claude session, `pij tail <pij-id>` resolves the transcript path and streams its lines.
- **AC-10**: The daemon enforces **single-instance** — a second `pij daemon` refuses or attaches, never producing a second injector.
- **AC-11**: The daemon TUI prints colored, timestamped chalk lines for `spawn` / `ready` / `interstitial` / `bind` / `message` / `death` as they occur.
- **AC-12**: Killing and restarting the daemon rebuilds its live view + `initInjectedAt` markers from `~/.pij/` with no lost bindings and no duplicate init.
- **AC-13**: `pij send <pij-id>` behaves identically from a pi session or a claude session (CLI), proving pi↔claude cross-compat.
- **AC-14**: `pij adopt <pane> --harness claude` assigns a `pij-id` + binds an already-running tmux agent via **adopt's own discovery** — resolve `paneId → cwd`, then require a `pij phonehome` from the adopted agent (or disambiguate by the pane's tmux start-time), since adopt has no post-spawn new-file event — producing an equivalent binding to AC-03.

### Risks & Assumptions

| Risk | Likelihood | Impact | Status / Mitigation |
|------|------------|--------|---------------------|
| R-01 Readiness signal | — | — | **RESOLVED by prototype.** v2.1.195 idle markers = footer `auto mode on` / `shift+tab to cycle` (NOT "? for shortcuts"); busy = `esc to interrupt`. Frozen as fixtures (T008); isolated to one classifier (version-sensitive). |
| R-02 Ungated send race / inject-while-busy | Med | Med | Caller never blocks; the daemon buffers sends to an unbound target and flushes on bind (T015). Whether send-keys queues mid-turn is a one-task smoke to confirm (T021); native Claude queueing assumed. |
| R-03 Interstitial blocks boot (NEW, from prototype) | Med | Med | Daemon dismisses known one-time prompts with Esc (T009); unknown trust/login → `needs-human` to creator (AC-06). |
| R-04 `send-keys` literal/paste mangling of multi-line bodies | Low | Med | Use the driver's bracketed-`paste` for bodies; `press Enter` to submit. |
| R-05 Binding never fires (agent ignores phonehome) | Low | High | **Deterministic transcript-discovery is primary** (T012), phonehome confirmatory, watchdog on timeout (T013/AC-04). |
| R-06 Daemon offline / double-started | Med | Med | Single-instance lock (T017); files are source of truth, daemon reconciles on start (T016); guide documents the start step. |

### Open Questions
- R-02 exact mid-turn `send-keys` behaviour — resolve with a quick smoke (extend `probe.sh`) during Group F; not blocking.
- Whether `pij adopt` should also adopt a **pi** tmux pane — deferred; claude-first.

### Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| Spawn→bind state machine | State Machine | The pending→ready→interstitial→init→bound→failed lifecycle is the load-bearing behaviour. | What are the exact states/transitions? Watchdog timeout? When does the pre-bind send buffer flush? |

### Clarifications

#### Session 2026-06-27
- **Workflow Mode** → **Simple**; **Testing** → **Hybrid**; **Mocks** → **Avoid (real fakes)**; **Docs** → **`docs/how/` operator guide**.
- **Daemon transport** → **Files under `~/.pij` + watch** (no socket).
- **Driver reuse** → **Extract a small shared tmux lib**.
- **Inject-while-busy** → **Caller never blocks**: `spawn` returns the pij-id immediately; the daemon injects the init asynchronously when ready; ongoing sends are ungated. (User: *"send should return the new id immediately, then it will send another message when it's ready but never gate."*)
- **TUI** → **chalk append-only log stream**.

#### Session 2026-06-27 (revision v1.1.0 — validation + prototype)
- **Binding made deterministic (F1)**: daemon discovers the transcript under `~/.claude/projects/<mangled cwd>/` to derive the session id; `pij phonehome` is confirmatory; watchdog re-injects/notifies on timeout.
- **Pending-descriptor handoff (F2)**: spawn atomically writes `(pij-id, paneId, cwd, harness, state:pending)` under `~/.pij/`; the daemon dir-watch picks it up to start readiness.
- **Init idempotency (F3)**: persist `initInjectedAt`; daemon skips injection if set; survives restart.
- **Delivery ownership (F4)**: senders write target inbox; daemon consumes+injects only tmux inboxes, observes pi inboxes; pi thin receiver is the sole pi-inbox consumer; a claude→pi test is added.
- **Single-instance (F5)**: PID/lockfile guard on `pij daemon`.
- **Readiness gate (F6)**: the live readiness prototype is an explicit gate (T008) freezing the R-01 marker before the daemon/transport tasks.
- **Readiness signals (prototype)**: real idle markers are footer-based (`auto mode on` / `shift+tab to cycle`), not "? for shortcuts"; **interstitial handling** added as a first-class step (T009 / AC-06).

#### Session 2026-06-27 (revision v1.1.1 — re-validation hardening)
- **Discovery key fixed**: bind by a transcript **path absent at spawn** (file appearance / birthtime), **not** newest-mtime — a pre-existing active session in the same cwd advances its mtime and would mis-bind (T010/T011/AC-03).
- **Watchdog vs init-once reconciled**: the watchdog re-sends **only the confirmatory `pij phonehome` line**, never the init body, so `initInjectedAt` and "init-exactly-once" hold (T011/AC-04).
- **Adopt has its own binding rule**: required `pij phonehome` or pane-start-time disambiguation, since adopt has no post-spawn new-file event (T023/AC-14).

## Planning Seam
_Refinement opportunities still open — recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: **Spawn→bind state machine** (optional; the plan encodes a workable default).

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| research-dossier.md | y | Sole research source; reduced to inline Key Findings. |
| scratch/tmux-claude-ready/ (prototype) | y | Resolved R-01; added interstitial handling + deterministic-binding insight. |
| workshops/*.md | n | none |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | Questions answered; v1.1.0 folds in validation + prototype; no `[NEEDS CLARIFICATION]`. |
| G2 | Constitution | N/A | No `docs/project-rules/constitution.md`. |
| G3 | Architecture | N/A | No `docs/project-rules/architecture.md`. |
| G4 | ADR Compliance | N/A | `docs/adr/` empty. |
| G5 | Structure | PASS | All required sections present + populated. |
| G6 | Testing Alignment | PASS | Hybrid: TDD tasks precede impl for the pure core; smoke/validation tasks present; ACs measurable. |
| G7 | Domain Completeness | PASS | Target Domains present; NEW `pij-control-plane` has a setup task (T001); Domain Manifest covers every file in the task table. |

### Summary
Build a machine-wide, single-instance pij daemon switchboard plus a tmux transport so pij controls Claude Code (and later Copilot) under one pre-allocated identity. Identity binds deterministically by discovering the Claude transcript (phone-home confirms, watchdog backstops). The pure core (transport selection, readiness/interstitial classifiers, transcript-path + discovery, binding, pending-descriptor, init-idempotency, router/buffer) is TDD'd behind ports/fakes; the impure seams (tmux send-keys/capture, daemon watch, lockfile, chalk TUI) are smoke-tested, building on the validated `probe.sh`. Delivered as one Simple-mode phase grouped A–G.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|----------------|-----------|
| `docs/domains/pij-control-plane/domain.md` | pij-control-plane | contract | New domain doc. |
| `docs/domains/registry.md`, `domain-map.md` | pij-control-plane | cross-domain | Register the new domain + edges. |
| `.pi/extensions/pij/adapters/tmux-keys.ts` | pij-control-plane | internal | Shared tmux primitives (`type`/`press`/`paste`(bracketed)/`capture`) extracted from `harness/driver/tmux.ts`. |
| `harness/driver/tmux.ts` | extension-authoring-harness | cross-domain | Re-export from the shared lib (parity). |
| `.pi/extensions/pij/core/harness/types.ts` | pij-control-plane | contract | `HarnessKind` + transport-selection contract. |
| `.pi/extensions/pij/core/readiness.ts` | pij-control-plane | internal | Pure pane-text → `{booting,interstitial,ready,busy,dead}` classifier (prototype fixtures). |
| `.pi/extensions/pij/core/interstitial.ts` | pij-control-plane | internal | Known one-time prompts → dismiss(Esc) / needs-human classification. |
| `.pi/extensions/pij/core/harness/claude.ts` | pij-control-plane | internal | Claude transport: init template, `claudeTranscriptPath` mangle + new-transcript discovery, send-keys plan. |
| `.pi/extensions/pij/core/harness/pi.ts` | pij-control-plane | internal | Pi transport: observe-only routing (delivery owned by the thin receiver). |
| `.pi/extensions/pij/core/daemon/router.ts` | pij-control-plane | internal | Resolve target → transport; buffer pre-binding sends; delivery-ownership rules. |
| `.pi/extensions/pij/core/daemon/index-state.ts` | pij-control-plane | internal | In-memory index over `~/.pij/` (incl. `initInjectedAt`); rebuild on start. |
| `.pi/extensions/pij/core/daemon/lock.ts` | pij-control-plane | internal | Single-instance PID/lockfile guard. |
| `.pi/extensions/pij/core/binding.ts` | pij-control-plane | contract | Deterministic binding (transcript-discovery) + phone-home confirm + watchdog + creator notice. |
| `.pi/extensions/pij/adapters/tui-chalk.ts` | pij-control-plane | internal | chalk event-line renderer. |
| `.pi/extensions/pij/daemon.ts` | pij-control-plane | internal | Daemon bin: lock → watch-pending+inboxes → readiness/interstitial → init-once → route → render. |
| `.pi/extensions/pij/core/spawn.ts` | pij-messaging | internal | Pre-allocate `pij-id`; write the pending descriptor (paneId from split `-P`); harness-aware launch cmd. |
| `.pi/extensions/pij/core/types.ts` | pij-messaging | contract | `SessionDescriptor` += `harness`,`harnessSessionId`,`initInjectedAt`,`state`. |
| `.pi/extensions/pij/core/cli.ts`, `core/commands.ts`, `cli.ts` | pij-messaging | internal | `phonehome`/`daemon`/`adopt` verbs + allow-list; extend `tail`. |
| `.pi/extensions/pij/index.ts` | pij-messaging | internal | Thin in-process receiver (sole consumer of own pi inbox); pre-alloc id at spawn. |
| `docs/how/pij-daemon.md` | pij-control-plane | contract | Operator guide. |

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | Only `pi.sendUserMessage` must stay in-process (`pi-runtime.ts:41-47`, `session.ts:360`). | Thin pi receiver is the sole pi-inbox consumer; the daemon never injects into pi. |
| 02 | Critical | tmux `send-keys`/bracketed `paste`/`capture-pane` already exist (`harness/driver/tmux.ts:188-223`); spawn+inject proven by `probe.sh`. | Extract to `adapters/tmux-keys.ts`; reuse the prototype's exact calls. |
| 03 | Critical | **Binding can be deterministic** — the daemon knows the cwd, so it can watch `~/.claude/projects/<mangled cwd>/` for the new `<id>.jsonl` and derive `harnessSessionId` with no agent cooperation. | Make transcript-discovery primary (T012); phone-home confirmatory; watchdog backstop (closes validation F1). |
| 04 | High | `split-window -P -F '#{pane_id}'` returns the paneId at spawn (prototype). | Spawn writes the pending descriptor with paneId for the daemon to discover (closes F2). |
| 05 | High | Real v2.1.195 idle signal is footer-based (`auto mode on`/`shift+tab to cycle`), **not** "? for shortcuts"; boot interstitials block readiness. | Freeze fixtures (T008); add interstitial handler (T009) — corrects dossier R-01. |
| 06 | High | `FsChannel.watch()` is portable (`channel.ts:63-110`), wired per-session at `index.ts:266`; daemon can't inject into pi (F-06). | Daemon owns cross-session watch + tmux injection; thin `index.ts` to own-inbox only; explicit delivery ownership (closes F4). |
| 07 | High | Identity/CLI seam via `PIJ_SESSION_ID` (`discovery.ts:16,73`) + pure `dispatch()` (`cli.ts:266`); Claude transcript mangle (`claude-adapter.ts:59-66`). | Slot `phonehome`/`daemon`/`adopt`; reuse the mangle for discovery + tailing. |

### Implementation

**Objective**: Ship the pij control plane — single-instance daemon switchboard, tmux transport, harness adapters, readiness + interstitial handling, deterministic binding, ungated messaging, tailing, and a chalk TUI — as one grouped Simple-mode phase.
**Testing Approach**: Hybrid — TDD (real fakes) for pure-core tasks (ⓣ); lightweight Driver smoke (building on `probe.sh`) for impure seams (ⓢ).

#### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | T001 | Create `pij-control-plane` domain doc + register | pij-control-plane | `docs/domains/pij-control-plane/domain.md`, `registry.md`, `domain-map.md` | domain.md exists; registry row + map node/edges added | A · G7 |
| [x] | T002 | ⓣ Extract shared tmux primitives + tests | pij-control-plane | `adapters/tmux-keys.ts` | unit tests vs a fake `tmux` runner; argv matches driver+prototype | A · finding 02 |
| [x] | T003 | Re-export driver from the shared lib (parity) | extension-authoring-harness | `harness/driver/tmux.ts` | driver imports shared primitives; driver smoke green | A · R-04 |
| [x] | T004 | ⓣ `SessionDescriptor` += `harness`,`harnessSessionId`,`initInjectedAt`,`state` (migration-safe) | pij-messaging | `core/types.ts`, `adapters/fs-registry.ts` | new optional fields round-trip; old descriptors still parse | B · F2/F3 |
| [x] | T005 | ⓣ Pre-allocate `pij-id` before launch | pij-messaging | `core/spawn.ts`, `core/session.ts` | id computed up front + passed in env; test asserts id known pre-launch | B · AC-01 |
| [x] | T006 | ⓣ Spawn writes the **pending descriptor** (paneId from split `-P`) | pij-messaging | `core/spawn.ts`, `adapters/fs-registry.ts` | `(pij-id,paneId,cwd,harness,state:pending)` written atomically before any inject | B · F2/AC-01 |
| [x] | T007 | ⓣ `HarnessKind` + transport-selection | pij-control-plane | `core/harness/types.ts` | `select(harness)` → `inbox`\|`sendkeys`; table-driven test | C |
| [x] | T008 | ⓢ **Readiness gate** — freeze the R-01 marker from the prototype into a classifier | pij-control-plane | `core/readiness.ts` | fixtures (footer idle / busy / booting) → states; gate: marker frozen before Group D+ | C · F6/AC-02 |
| [x] | T009 | ⓣ Interstitial classifier (dismiss-Esc vs needs-human) | pij-control-plane | `core/interstitial.ts` | Chrome-prompt fixture → dismiss; trust/login → needs-human | C · R-03/AC-06 |
| [x] | T010 | ⓣ Claude transport: init template + transcript mangle + **new-transcript discovery** | pij-control-plane | `core/harness/claude.ts` | mangle matches telemetry; discovery picks a jsonl **path absent at spawn** (file appearance, NOT mtime); fixture includes a pre-existing active transcript in the same cwd that must NOT be chosen | D · finding 03/05 |
| [x] | T011 | ⓣ Deterministic **binding** + watchdog + creator notice | pij-control-plane | `core/binding.ts` | bind from the newly-appeared session id; no bind within T → re-send only the `pij phonehome` confirm line once (`initInjectedAt` untouched), mark failed, notify | D · F1/AC-03/04/05 |
| [x] | T012 | ⓣ `pij phonehome` verb (confirmatory) | pij-messaging | `core/cli.ts`, `core/commands.ts`, `cli.ts` | resolves self + `CLAUDE_CODE_SESSION_ID`; confirms/created binding; `--json` | D · finding 07 |
| [x] | T013 | ⓣ Router: resolve target → transport; buffer pre-binding sends; **delivery ownership** | pij-control-plane | `core/daemon/router.ts`, `core/harness/pi.ts` | tmux→inject; pi→observe-only; unbound-target sends buffer + flush on bind | E · F4/R-02 |
| [x] | T014 | ⓣ Daemon index-state: rebuild from `~/.pij/` (incl. `initInjectedAt`) | pij-control-plane | `core/daemon/index-state.ts` | index reconstructs bindings + init markers from files | E · F3/AC-12 |
| [x] | T015 | ⓣ Single-instance lock | pij-control-plane | `core/daemon/lock.ts` | second acquire refuses/attaches; stale lock reclaimed | E · F5/AC-10 |
| [x] | T016 | ⓢ Daemon bin: lock → watch pending+inboxes → interstitial → readiness → **init-once (idempotent)** → route → render | pij-control-plane | `daemon.ts` | end-to-end: pending pane → dismiss → ready → init once → bind; restart re-injects nothing | E · AC-02/12 |
| [x] | T017 | Thin the extension to own-inbox receiver only | pij-messaging | `index.ts` | per-session watch reduced to local inbox→`sendUserMessage`; pi↔pi smoke green | E · finding 01/06 |
| [x] | T018 | ⓢ `pij spawn --harness claude` returns id immediately; daemon completes boot async | pij-control-plane | `core/cli.ts`, `core/spawn.ts`, `daemon.ts` | spawn returns <500ms; pane boots; init lands once post-ready | F · AC-01/02 |
| [x] | T019 | ⓢ Ungated `pij send` to claude (send-keys+Enter; `/compact`) | pij-control-plane | `core/harness/claude.ts`, `daemon.ts` | text submitted in pane; `/compact` compacts | F · AC-07/13 |
| [ ] | T020 | ⓢ Confirm mid-turn `send-keys` behaviour (R-02) — extend `probe.sh` | pij-control-plane | `scratch/…`, `core/daemon/router.ts` | observed: queued vs garbled; buffer policy matches reality | F · R-02 |
| [x] | T021 | ⓢ claude→pi delivery + pi↔pi no-regression | pij-control-plane | (smoke) | a claude-session CLI send reaches a pi target; pi↔pi unchanged | F · F4/AC-08 |
| [x] | T022 | ⓣ `pij tail <pij-id>` streams a bound transcript | pij-messaging | `core/cli.ts`, `core/harness/claude.ts` | tail resolves path + streams for a bound session | F · AC-09 |
| [x] | T023 | ⓣ `pij adopt <pane> --harness claude` (assign id + bind, own discovery) | pij-control-plane | `core/cli.ts`, `core/binding.ts` | adopt derives `harnessSessionId` via its own rule (required `pij phonehome` or pane-start-time disambiguation — NOT the post-spawn new-file discovery); binding equivalent to spawn | F · AC-14 |
| [ ] | T024 | chalk TUI + wire into daemon (`spawn/ready/interstitial/bind/message/death`) | pij-control-plane | `adapters/tui-chalk.ts`, `daemon.ts` | colored timestamped lines per event | G · AC-11 |
| [ ] | T025 | `pij daemon` verb (start the switchboard) + allow-list | pij-messaging | `core/cli.ts`, `core/commands.ts`, `cli.ts` | `pij daemon` boots lock+watch+render | G |
| [ ] | T026 | ⓢ Two-harness smoke: pi↔claude round-trip (spawn→ready→bind→send→tail) | pij-control-plane | (smoke) | a Driver scenario exercises AC-01..09,13 end-to-end | G · validation |
| [ ] | T027 | Operator guide | pij-control-plane | `docs/how/pij-daemon.md` | run/spawn/adopt/send/tail/TUI/recovery documented | G · docs |
| [ ] | T028 | Update domain-map Health Summary + registry History | pij-control-plane | `docs/domains/*` | edges + this plan recorded | G · G7 |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01 | T005, T006, T018 | id <500ms; pending descriptor; pane boots |
| AC-02 | T008, T014, T016 | init once, idempotent across restart |
| AC-03 | T010, T011 | deterministic transcript-discovery binding |
| AC-04 | T011 | watchdog re-inject + fail notice |
| AC-05 | T011 | creator verification notice |
| AC-06 | T009, T016 | dismiss interstitials; needs-human surfaced |
| AC-07 | T019 | send-keys submit + `/compact` |
| AC-08 | T013, T017, T021 | delivery ownership; claude→pi; pi↔pi |
| AC-09 | T010, T022 | transcript tail |
| AC-10 | T015 | single-instance lock |
| AC-11 | T024 | chalk event lines |
| AC-12 | T014, T016 | rebuild + no duplicate init |
| AC-13 | T019, T026 | identical pi↔claude send |
| AC-14 | T023 | adopt → binding |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Readiness marker drift across Claude versions | Med | Med | Isolated to `core/readiness.ts`; fixtures from live capture (T008); footer markers are stable across recent versions. |
| Mid-turn send garbles input (R-02) | Med | Med | Confirm by smoke (T020); router buffers pre-bind; native queueing assumed, adjusted to observation. |
| Transcript-discovery picks the wrong jsonl (pre-existing active session / concurrent boots same cwd) | Low | Med | Discover by **new path appearance** (a jsonl absent at spawn — file-create event / birthtime), **not** mtime; phone-home confirms (T011/T012). |
| Single large Simple phase heavy to implement in one turn | Med | Med | Implement by group A–G; each is independently reviewable. |
| Daemon offline / double-started (R-06) | Med | Med | Lock (T015); files are source of truth; reconcile on start (T014/T016). |
