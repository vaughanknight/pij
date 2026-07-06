# pij Peer File-Watch Subscriptions

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-07-06
**Status**: READY
**Spec source**: unified (this file)

## Business Specification

### Research Context
📚 Incorporates findings from `research-dossier.md` (Deep explore — 2 system traces + institutional memory). Headlines: the **delivery half already exists** — a notice calls the daemon's existing `channel.deliver()` and rides the inbox→tick→tmux injection like any peer message (F-01/F-02/F-03); the **watch half is a verbatim lift** of `file-watch-notify`'s pi-free core (F-04/F-05); the only genuinely new code is 2 CLI verbs + a per-session subscription store + a daemon watcher module; and there is **no busy/idle delivery gate today** (F-09).

### Summary
Let pij-managed **non-pi control-plane peers** (copilot/claude/codex in tmux panes) subscribe to file-change notices. A peer self-serves via `pij watch "<glob>"` / `pij unwatch`; the daemon runs a debounced folder watcher per subscription (reusing the `file-watch-notify` core) and delivers each coalesced change as an ordinary inbox message, so it "drops into" the peer's pane exactly like a `pij send`. Peers unsubscribe on demand. This fills the long-stubbed `/pij` `watch` route.

### Goals
- A non-pi peer can subscribe to one or more file globs **for its own pane**, entirely self-served through the `pij` CLI.
- File changes arrive as in-pane notices with **no tool call** — the same delivery surface as peer messages.
- Bursts are **debounced and coalesced**; created/modified/deleted are classified; pre-existing files never notify on subscribe.
- Peers **unsubscribe** on demand; subscriptions are **per-peer isolated** and **survive daemon restart**.

### Non-Goals
- **Busy-defer / idle-gated delivery** — notices inject immediately like every other pij message (the harness's own composer queues mid-turn text). Holding notices until a peer is idle is a documented follow-up, not v1 (F-09).
- **Orchestrator-on-behalf subscriptions** (`pij watch --for <peer>`) — v1 is peer self-serve only.
- **pi sessions** — pi peers use the in-process `file-watch-notify` extension; the daemon deliberately does not drive pi inboxes (pi self-drives). Watch subscriptions are for non-pi peers only.
- **Cross-watcher physical-path dedup** for overlapping watch roots — accept one message per watcher per wake.
- **Recursive/large-folder scale backends** (chokidar/@parcel) — inherit plan 015's deferral; node `fs.watch` only.
- **Acting on changes** — it notifies, nothing more.

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| `pij-control-plane` | existing | **modify** | Add the peer file-watch subsystem: 2 CLI verbs, a per-session subscription sidecar + store, and a daemon watcher-lifecycle module wired into the tick |
| `file-watch-notify` | existing | **consume** | Import the pi-free watch core (`compileWatch` / `WatchReconciler` / `FolderWatcher` / `nodeWatchDeps`) read-only — no changes to it |
| `pij-messaging` | existing | **consume** | Deliver notices through the existing `DeliveryPort.deliver` inbox transport — no changes |

### Testing Strategy
- **Approach**: Hybrid — unit tests for the pure/complex logic (glob→dir+pattern parse, subscription add/remove/dedup, notice format, the daemon reconcile + delivery via a fake channel), plus a live tmux **smoke** for real in-pane delivery.
- **Rationale**: the watch core is already thoroughly unit-tested upstream; new risk lives in the *wiring* (self-resolution, sidecar reconcile, non-pi filter, teardown) and in *live delivery*, which only a smoke proves.
- **Focus areas**: session self-resolution; sidecar atomicity + reconcile; non-pi-only filter; per-peer isolation; teardown on close/death.
- **Excluded**: re-testing the reused `store.ts`/`watcher.ts` internals (covered upstream).
- **Mock usage**: targeted — fakes for the channel/delivery + watch deps in unit tests; real fs + real tmux in the smoke.

### Documentation Strategy
- **Location**: `docs/how/` — a new peer-watch guide; plus updating the stale `/pij` skill `watch`-route pointer.
- **Rationale**: peers are pij-blind at boot (memory `control-plane-peer-self-awareness`); the verb must be documented where humans and packet authors can find it.

### Complexity
- **Score**: CS-3 (medium)
- **Breakdown**: S=1, I=2, D=1, N=1, F=1, T=1 (sum 7)
- **Confidence**: 0.80
- **Assumptions**: the `file-watch-notify` core stays importable across the single root tsconfig (F-04); `resolveSelf`/`PIJ_SESSION_ID` is a sound self-id source (plan 014 finding 07).
- **Dependencies**: `file-watch-notify` core; `pij-messaging` `DeliveryPort`; the daemon tick loop; `picomatch` (already a root dep).
- **Risks**: notices interrupt a busy peer's turn (accepted v1); delivery reliability inherits the un-deployed plan 032 send path (H-02).
- **Phases**: 1 (Simple).

### Acceptance Criteria
- **AC-01**: A non-pi peer runs `pij watch "src/**/*.ts"`; a subsequent change to a matching file appears in its pane as a `[pij from pij-watch] [file-watch] <path> <kind>` notice, with no tool call.
- **AC-02**: `pij unwatch "src/**/*.ts"` (or `pij unwatch` with no glob = all) stops further notices for that subscription.
- **AC-03**: A burst of rapid saves to one matching file yields a **single coalesced** notice, not one per fs event.
- **AC-04**: created / modified / deleted are classified correctly, and files **already present** when the watch is created do **not** notify.
- **AC-05**: Subscriptions **survive a daemon restart** — after restart a watched change still notifies, with no false "created" flood for pre-existing files.
- **AC-06**: Subscriptions are **per-peer isolated** — one peer's notices never reach another; one peer's `unwatch` never affects another's watches.
- **AC-07**: `pij watch`/`unwatch` **self-resolve** the caller's session (via `resolveSelf` → `PIJ_SESSION_ID` → pane match) and **error clearly** when the session cannot be resolved.
- **AC-08**: When a peer session **closes or dies**, its watchers are torn down — no leaked `FolderWatcher`, no delivery attempts to a dead pane.

### Risks & Assumptions

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Immediate-inject interrupts a busy peer's turn | Medium | Low | Watch-side debounce coalesces bursts to one notice; busy-defer is a documented follow-up (Non-Goal) |
| Delivery reliability inherits the un-deployed plan 032 send path + copilot send-wedge | Medium | Medium | Same transport as every peer message; land/verify 032's deploy before claiming live reliability |
| `fs.watch` recursive fidelity on large trees | Low | Medium | Inherit plan 015's stance; document the scale ceiling; node `fs.watch` only |
| Rapid `watch`/`unwatch` races the daemon reconcile | Low | Low | Atomic tmp+rename sidecar write; daemon reconciles on mtime change; last-write-wins is acceptable |
| Overlapping watch roots double-notify | Low | Low | Accept one message per watcher per wake (Non-Goal) |

### Open Questions
None blocking — the four shape-defining forks were resolved in clarifications (Mode=Simple, delivery=immediate, scope=self-serve, testing=Hybrid); the rest resolved by dossier defaults (sidecar store, `picomatch.scan` glob split, `pij-watch` synthetic source id, `[file-watch] <path> <kind>` body).

### Workshop Opportunities
None material — the CLI glob surface, notice format, and store shape are settled by the dossier's Planning Handoff and the clarifications above.

### Clarifications

#### Session 2026-07-06
- **Workflow Mode**: Simple (CS-3; tight coupling between CLI surface, store, and daemon watcher — one phase holds).
- **Busy delivery**: Inject immediately (v1) — busy-defer gate is a Non-Goal.
- **Subscription scope**: Peer self-serve only.
- **Testing**: Hybrid (unit for wiring + a tmux smoke for live delivery).
- **Defaulted (not asked)**: subscription store = CLI-owned sidecar the daemon only reads (avoids the `writeMerged` lost-update, F-07); globs split via `picomatch.scan`; notice source id `pij-watch`; mocks = targeted; docs = `docs/how/`.

## Planning Seam
_Refinement opportunities still open — recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: none — all resolved.

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| research-dossier.md | y | informs Key Findings 01–08 |
| workshops/*.md | n | — |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | 4 forks resolved this session; no `[NEEDS CLARIFICATION]` remain |
| G2 | Constitution | N/A | no `docs/project-rules/constitution.md` |
| G3 | Architecture | N/A | no `docs/project-rules/architecture.md` |
| G4 | ADR Compliance | N/A | no `docs/adr/` |
| G5 | Structure | PASS | all required sections present + populated |
| G6 | Testing Alignment | PASS | Hybrid: ≥1 validation task; ACs measurable; unit tasks precede/accompany the complex logic |
| G7 | Domain Completeness | PASS | all Target Domains mapped; every manifest file covered; no new domains (no setup task needed) |

### Summary
Add a peer file-watch subsystem to `pij-control-plane`. Non-pi peers self-subscribe via `pij watch`/`pij unwatch`, which write a per-session sidecar (`~/.pij/<id>/watches.json`). The daemon reconciles that sidecar into live `FolderWatcher`s (reused verbatim from `file-watch-notify`), and each debounced/coalesced change is delivered via the existing `channel.deliver()` so it injects into the peer's pane like any message. Immediate-inject only; per-peer isolated; restart-durable; torn down on session death.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `.pi/extensions/pij/core/types.ts` | pij-control-plane | internal | Add `WatchSubscription` + sidecar shape (additive) |
| `.pi/extensions/pij/core/watch-subscription.ts` *(new)* | pij-control-plane | internal | Pure: glob→{dir,patterns,recursive} via `picomatch.scan`, add/remove/dedup, notice-body format |
| `.pi/extensions/pij/core/watch-subscription.test.ts` *(new)* | pij-control-plane | internal | Unit tests for the pure core |
| `.pi/extensions/pij/adapters/watch-store.ts` *(new)* | pij-control-plane | internal | Atomic read/write of `~/.pij/<id>/watches.json` (tmp+rename), tolerant of missing/partial |
| `.pi/extensions/pij/cli.ts` | pij-control-plane | internal | `pij watch`/`unwatch` bin-intercept verbs + USAGE; self-resolve via `resolveSelf` |
| `.pi/extensions/pij/cli.integration.test.ts` | pij-control-plane | internal | CLI verb tests (self-resolution, sidecar mutation, arg errors) |
| `.pi/extensions/pij/core/daemon/watch.ts` *(new)* | pij-control-plane | internal | Reconcile sidecar→live `FolderWatcher`s per non-pi session; `onNotices`→`channel.deliver`; dispose on removal |
| `.pi/extensions/pij/core/daemon/watch.test.ts` *(new)* | pij-control-plane | internal | Unit tests (reconcile, non-pi filter, delivery via fake channel, teardown) |
| `.pi/extensions/pij/daemon.ts` | pij-control-plane | internal | Wire mtime-gated reconcile into the tick + teardown on close/death |
| `.pi/extensions/pij/smoke.ts` | pij-control-plane | internal | Live tmux delivery smoke step |
| `.pi/extensions/file-watch-notify/store.ts` | file-watch-notify | cross-domain | Imported read-only (`compileWatch`/`WatchReconciler`/types/constants) — consumed, not modified |
| `.pi/extensions/file-watch-notify/watcher.ts` | file-watch-notify | cross-domain | Imported read-only (`FolderWatcher`/`nodeWatchDeps`) — consumed, not modified |
| `docs/how/pij-peer-watch.md` *(new)* | pij-control-plane | internal | Peer-watch how-to guide |

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | High | Delivery is `channel.deliver` → inbox → tick-injection; the daemon already emits internal notices this way (dead/stalled/receipt). `DeliveryPort.deliver` (`core/ports.ts:47`) gets pre-bind buffering, receipts, and restart-survival for free (F-01/F-02/F-03). | Deliver notices via `this.channel.deliver({from:"pij-watch", to:<id>, body})`; **never** call `ports.sendText` directly. |
| 02 | High | The watch core is pi-free and importable today — `store.ts` (only `picomatch`, a root dep) + `watcher.ts` (node stdlib, `fs.watch{persistent:false}`); single root tsconfig spans both extensions (F-04). | Import `../file-watch-notify/store.js` + `watcher.js`; wire `compileWatch → new WatchReconciler → new FolderWatcher(nodeWatchDeps())`; do not reimplement. |
| 03 | High | A CLI-written subscription list on the session descriptor would lose-update against the daemon's per-tick `writeMerged` (`core/daemon/loop.ts:143-176`) (F-07). | Store subscriptions in a CLI-owned **sidecar** (`~/.pij/<id>/watches.json`) the daemon only **reads**. |
| 04 | High | Stateful control-plane verbs are **bin-intercepted on argv** (`cli.ts:1430-1471`), not table-driven; the CLI process exits, so it can't hold a watcher. Self-id via `resolveSelf`/`PIJ_SESSION_ID` (F-12, plan 014 finding 07). | `pij watch`/`unwatch` = argv intercept + `runWatch`/`runUnwatch` that only mutate the sidecar; the `FolderWatcher` lives in the daemon. |
| 05 | Medium | `FolderWatcher.start()` primes a baseline snapshot (`watcher.ts:44-50`) → pre-existing files never notify; re-arms cleanly on restart (F-11). | Rely on baseline-prime for AC-04/AC-05; no custom seed logic. |
| 06 | Medium | The daemon deliberately does not drive pi inboxes (pi self-drives); watch delivery only makes sense for non-pi peers (Worker A #7). | Reconcile watchers only for sessions where `harness !== "pi"`; `pij watch` from a pi session errors with a hint to use `file-watch-notify`. |
| 07 | Medium | No busy/idle delivery gate exists — bound panes are injected unconditionally each drain (F-09); the `BUSY_RE`/`classifyReadiness` oracle exists (F-10) but the gate is unbuilt. | v1 injects immediately; leave a seam note for a future busy-defer follow-up. |
| 08 | Medium | Watch notices are only as reliable as the (shipped-but-un-deployed) plan 032 send path + the copilot send-wedge (H-02). | Don't over-claim live reliability; note the shared transport; verify against a peer after 032 is deployed. |
| 09 | High | **A dead resident peer's descriptor lingers** — the dead branch persists `failureReason` but never `registry.remove`s it and leaves `lifecycle:"bound"` (`daemon.ts:189-206`), so `owns` stays true (`daemon.ts:118`). A reconcile keyed only on "descriptor gone" would leak the `FolderWatcher` (fs.watch handle + timers) and keep writing to a dead pane's inbox forever — breaking AC-08 (validation Finding 1). | Dispose a session's watchers when `!ports.isAlive(d.pid)` (probe exists, `ports.ts:142`), **not** merely on descriptor-absence; assert the pid-dead disposal in T008. |
| 10 | Medium | **Synthetic-sender receipt leak** — after injecting a delivered message the daemon emits a send-receipt back to `item.from` (`daemon.ts:310-312` → `emitSendReceipt` `daemon.ts:324-329`); with `from:"pij-watch"` that writes `~/.pij/pij-watch/inbox/msg-*.json`, and since `pij-watch` is never a registered session its inbox is never drained → unbounded file/inode growth. Marking the notice `kind:"receipt"` can't dodge it (receipts are dropped un-injected, `daemon.ts:287-289`, so the peer would never see it) (validation Finding 2). | Guard `emitSendReceipt` to no-op when the sender has no registry descriptor (smallest fix; benefits every internal-notice sender); assert "no `pij-watch` inbox file after a watch delivery" in T008. |

### Implementation

**Objective**: Ship peer file-watch subscriptions for non-pi peers — self-serve CLI verbs, a per-session sidecar store, and a daemon watcher module that reuses the `file-watch-notify` core and delivers via the existing inbox transport.
**Testing Approach**: Hybrid — unit for pure/wiring logic (T003, T006, T008), tmux smoke for live delivery (T010).

#### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T001 | Add `WatchSubscription` (`{dir, patterns, recursive?, addedAt}`) + sidecar shape (`{watches: WatchSubscription[]}`) to types | pij-control-plane | `.pi/extensions/pij/core/types.ts` | Types exported; `harness checks --quick` typecheck green | Additive, migration-safe |
| [ ] | T002 | Pure subscription core: `parseWatchGlobs(globs)` → grouped `{dir,patterns,recursive}` via `picomatch.scan`; `addWatch`/`removeWatch` (idempotent, dedup by key); `formatWatchNotice(notices)` | pij-control-plane | `.pi/extensions/pij/core/watch-subscription.ts` (new) | Pure fns exported; no fs, no pi imports | Per finding 04; `recursive` inferred from `**` in the glob |
| [ ] | T003 | Unit tests for the subscription core (glob split incl. bare-dir + `**`; add/remove idempotence; dedup; notice format) | pij-control-plane | `.pi/extensions/pij/core/watch-subscription.test.ts` (new) | vitest green; a mutation to the parser/dedup flips a named assertion (non-vacuous) | Hybrid: test the complex parse first |
| [ ] | T004 | Sidecar fs adapter: `readWatches(id)` (→ `[]` when absent/partial) + `writeWatches(id, subs)` (atomic tmp+rename into `~/.pij/<id>/watches.json`) | pij-control-plane | `.pi/extensions/pij/adapters/watch-store.ts` (new) | Read tolerates missing/partial; write is atomic (mirrors `fs-registry.ts`/`channel.ts`) | Per finding 03 |
| [ ] | T005 | CLI verbs `pij watch <glob...>` / `pij unwatch [<glob>]`: argv bin-intercept in `main()`; `resolveSelf` for session id; mutate sidecar via T004; USAGE lines; clear error if self unresolved or session is pi | pij-control-plane | `.pi/extensions/pij/cli.ts` | `pij watch "src/**/*.ts"` writes the caller's sidecar; `pij unwatch` (glob or all) removes; unresolved-self / pi-session errors exit non-zero with a hint | Per findings 04, 06, 07; AC-02, AC-07 |
| [ ] | T006 | CLI unit/integration tests (self-resolution via `PIJ_SESSION_ID`; sidecar add/remove; arg + pi-session error paths) | pij-control-plane | `.pi/extensions/pij/cli.integration.test.ts` | vitest green | AC-07 |
| [ ] | T007 | Daemon watch module: `reconcileWatchers(sessions, deps)` diffs each **non-pi** session's sidecar → live `FolderWatcher` map (reuse `file-watch-notify` core); `onNotices`→`channel.deliver({from:"pij-watch", to:id, body})`; baseline-prime; dispose a watcher when its sub is removed, its session's descriptor is gone, **OR its pid is no longer alive** (`!ports.isAlive(pid)` — a dead resident peer's descriptor lingers `bound`, finding 09) | pij-control-plane | `.pi/extensions/pij/core/daemon/watch.ts` (new) | With a fake channel + fake watch deps, a change to a subscribed file delivers exactly one coalesced inbox message to the right session; a removed sub **and a pid-dead session** each dispose their watcher | Per findings 01, 02, 05, 06, 09; AC-01, AC-03, AC-04, AC-06, AC-08 |
| [ ] | T008 | Unit tests for the daemon watch module (reconcile add/remove, non-pi filter, delivery via fake channel, per-peer isolation, **pid-dead disposal** (finding 09), **no phantom `pij-watch` receipt file after a delivery** (finding 10)) | pij-control-plane | `.pi/extensions/pij/core/daemon/watch.test.ts` (new) | vitest green; non-vacuous | AC-06, AC-08 |
| [ ] | T009 | Wire into `daemon.ts`: mtime-gated sidecar reconcile inside the tick (start/stop watchers without blocking the 600ms loop); dispose a session's watchers on close / pid-death; **guard `emitSendReceipt` to skip senders with no registry descriptor** (kills the `pij-watch` receipt leak, finding 10) | pij-control-plane | `.pi/extensions/pij/daemon.ts` | A subscription added at runtime starts a watcher within ≤1 tick; a closed/dead session leaks no watcher; no `~/.pij/pij-watch/inbox` accumulation | Per findings 06, 09, 10; AC-05 (restart re-reads sidecar), AC-08 |
| [ ] | T010 | Live tmux smoke: spawn a non-pi peer, `pij watch` a temp glob, touch a matching file, assert the pane shows the `[file-watch]` notice; `pij unwatch` stops it | pij-control-plane | `.pi/extensions/pij/smoke.ts` | Smoke step passes locally | AC-01, AC-02 end-to-end |
| [ ] | T011 | Docs: `docs/how/pij-peer-watch.md` (subscribe/unsubscribe, self-serve, non-pi-only, limits) + replace the stale `/pij` skill `watch`-route pointer ("future — plan 029 P4") with the shipped surface | pij-control-plane | `docs/how/pij-peer-watch.md` (new); `~/.claude/skills/pij/SKILL.md` (external skill) | Guide written; skill stub reflects the real verb | Per H-03; skill file is outside the repo tree — note in ship |
| [ ] | T012 | Full `harness checks` green (typecheck/lint/test/smoke/pkg-audit/snapshots) | pij-control-plane | — | All sensors pass | End-of-work gate |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01 | T005, T007, T010 | T007 unit (fake channel) + T010 smoke |
| AC-02 | T005, T010 | T006 + T010 |
| AC-03 | T007 | T008 (coalesced-wake assertion) |
| AC-04 | T007 | T008 (baseline-prime + classify) |
| AC-05 | T004, T009 | T009 (sidecar re-read on daemon boot) |
| AC-06 | T007 | T008 (per-peer isolation) |
| AC-07 | T005 | T006 |
| AC-08 | T007, T009 | T008 + T009 (teardown) |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Immediate-inject interrupts a busy peer's turn | Medium | Low | Debounce coalesces bursts; busy-defer follow-up documented (Non-Goal) |
| Delivery reliability inherits un-deployed plan 032 path | Medium | Medium | Same transport as all peer messages; verify post-032-deploy (finding 08) |
| Per-tick sidecar reads add daemon overhead | Low | Low | mtime-gate the read; the `FolderWatcher` is event-driven, kept off the tick's critical path (T009) |
| `fs.watch` recursive fidelity on large trees | Low | Medium | Document the ceiling; inherit plan 015 deferral |
