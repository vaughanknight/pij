# Research Dossier: pij peer file-watch subscriptions (non-pi control-plane peers)

**Generated**: 2026-07-06T08:16:00Z
**Query**: "add file-watch-notify for pij-managed non-pi agents — they self-subscribe to changes, notices drop into their tmux pane like other messages, they can unsubscribe; needs debouncing/coalescing"
**Effort**: Deep (2 parallel system-trace workers + institutional-memory lane)
**Tools**: Mixed (FlowSpace semantic + targeted reads)
**Evidence**: 11 current sources · 4 historical

## Answer

1. **The whole delivery half already exists.** A file-change notice does **not** need any new tmux code — it calls the daemon's existing `channel.deliver({from,to,body})` (the same internal-notice API used today for dead/stalled/receipt messages). The notice lands in the peer's inbox and the next ≤600ms daemon tick injects it into the pane exactly like a `pij send` — so "drops in with tmux like other messages" is *literally* the same path, not an analogue.
2. **The watch half is a verbatim lift.** `file-watch-notify`'s watch core (`store.ts` + `watcher.ts`) is pi-free and importable by the daemon *today* — single root tsconfig, `picomatch` already a root dep, no package boundary. Reuse `compileWatch → WatchReconciler → FolderWatcher(nodeWatchDeps())` unchanged; the debounce (30ms) + snapshot-reconcile classification + per-wake coalescing the user asked for all come **free** with it.
3. **The genuinely new code is small and central**: (a) two CLI verbs `pij watch`/`pij unwatch` (bin-intercept pattern), (b) a per-session subscription store, (c) a daemon module that owns one `FolderWatcher` per subscribed peer and routes its `onNotices` into `channel.deliver`.
4. **The pi-specific injection layer maps onto a clean seam.** file-watch-notify already isolates delivery behind `InjectPort { isIdle(); send(text,mode) }`; the daemon supplies its own `InjectPort` (send → `channel.deliver`) and reuses the coalesce/dedup helpers as-is.
5. **One correction to the thesis:** there is **no busy/idle steer-gate in delivery today** — a bound pane is injected unconditionally each tick (the harness's own composer queues mid-turn text). "Hold-while-busy" is therefore *new* gating that would affect **all** peer delivery, not just watches. The `BUSY_RE`/`classifyReadiness` oracle to build it already runs every tick — but v1 should likely inherit today's immediate-inject behaviour and scope the gate as a follow-up.
6. **Subscriptions must dodge a known lost-update trap** — store them in a CLI-owned **sidecar** the daemon only *reads*, not on the per-tick-rewritten session descriptor.

## Evidence

| ID | Finding | Evidence | Planning implication | Confidence |
|----|---------|----------|----------------------|------------|
| F-01 | `pij send` is an atomic inbox-file drop; it never touches tmux | `adapters/channel.ts:43-53` (`FsChannel.deliver` tmp+rename → `<pijHome>/<to>/inbox/msg-<id>.json`); `core/cli.ts:520,537` | The notice sender does zero tmux work — it just writes an inbox file (or calls `deliver`) | High |
| F-02 | Daemon injects inbox→pane: `tick → drainInbox → drainTmuxInbox → route → ports.sendText` | `daemon.ts:76,135,272,300`; `core/daemon/loop.ts:412,430`; `core/daemon/router.ts:40`; `adapters/daemon-tmux.ts:191` | Delivering a notice as an inbox message inherits the entire injection path — "drops in like a message" for free | High |
| F-03 | The canonical internal-notice API is `channel.deliver({from,to,body})` — daemon already uses it for dead/stalled/receipt notices | `daemon.ts:203,220,266,324`; `core/daemon/loop.ts:107-109`; `core/ports.ts:47` (`DeliveryPort.deliver`) | **This is the function the file-change notice calls.** Gets pre-bind buffering, receipts, and daemon-restart survival for free | High |
| F-04 | file-watch-notify's watch core is pi-free & importable now — `store.ts` (only `picomatch`, a root dep), `watcher.ts` (node stdlib, `fs.watch{persistent:false}`); one root tsconfig spans both extensions, no package boundary | `store.ts:9`; `watcher.ts:7-11,105`; root `tsconfig.json` (`include: .pi/extensions/**/*.ts`) + `package.json:70` (`picomatch`) | Reuse `compileWatch`/`WatchReconciler`/`FolderWatcher`/`nodeWatchDeps` verbatim via `../file-watch-notify/store.js` — no re-implementation, no build work | High |
| F-05 | The pi-specific layer is small and isolated behind `InjectPort { isIdle(); send(text,mode) }`; `deliverNotices`/`pickInjectMode`/`makeNoticeDedupKey`/`SteeredNoticeTracker` are pi-free & unit-tested with a fake | `inject.ts:31-34,26-134`; pi-only imports confined to `index.ts:19-20`, `inject.ts:9` | Daemon writes ONE small adapter (`InjectPort.send → channel.deliver`, `isIdle → readiness`) and reuses the coalesce/dedup logic | High |
| F-06 | Per-session state = flat JSON descriptor `~/.pij/<id>.json`, atomically written; every control-plane field is optional/additive; each session also owns a data DIR `~/.pij/<id>/` (inbox + events) | `adapters/fs-registry.ts:39-45`; `core/types.ts:47-132` | Subscriptions fit either as a descriptor field or (preferred, see F-07) a sidecar in the dataDir | High |
| F-07 | Concurrency trap: a CLI-written subscription list racing the daemon's per-tick `writeMerged` is a lost-update unless the field is in `EXTERNALLY_OWNED_FIELDS` (today just `reportedAt`) | `core/daemon/loop.ts:143-176`; receive-side `seen` set is in-memory only (`adapters/channel.ts:66-70`) | Prefer a **CLI-owned sidecar** (`~/.pij/<id>/watches.json`) the daemon only reads — zero merge contention, naturally per-peer | High |
| F-08 | One single-instance daemon, poll-driven at `TICK_MS=600`, synchronous tick, one process for ALL sessions | `daemon.ts:342-396,46,418-424` | An `fs.watch` callback runs in the same process; having it call `channel.deliver` can't race the sync tick; notice latency ≈ debounce + ≤600ms | High |
| F-09 | **No busy/idle steer-gate exists in delivery** — `route` buffers only PRE-BIND (`lifecycle!=="bound"`); a bound pane gets `sendText` unconditionally every drain, even mid-turn | `core/daemon/router.ts:43-49`; `core/daemon/loop.ts:430`; `daemon.ts:123-133` | v1 notices inject immediately like all peer messages; "hold-while-busy" is NEW gating affecting ALL delivery → scope as non-goal/follow-up | High |
| F-10 | The busy/idle oracle is pure, pane-only, and already computed every tick — reusable to *add* a gate later | `core/readiness.ts:62,73,83`; `daemon.ts:141` (`classifyReadiness(capturePane(...))` per session per tick) | If a busy-gate is ever built, the detector is done — only the inject-vs-requeue decision is missing | High |
| F-11 | `FolderWatcher.start()` primes a baseline snapshot so pre-existing files never notify | `watcher.ts:44-50` | (Re)subscribe and daemon-restart re-arm cleanly — no whole-tree "created" dump on a fresh watch | High |
| F-12 | Stateful control-plane verbs are bin-intercepted on `argv` (not table-driven); the long-lived watcher can't live in the exiting CLI process | `cli.ts:1430-1471,1446-1449,103-127` | `pij watch`/`unwatch` = argv intercept + `runWatch`/`runUnwatch` + USAGE lines; the verb only records/removes a subscription, the daemon runs the watch | High |

## Historical Evidence

| ID | Prior friction / decision | Source | Applicability now | Implication |
|----|---------------------------|--------|-------------------|-------------|
| H-01 | Plan 015 built the watch core by generalizing pij's inbox watcher, and **explicitly declined** a shared pij core (Non-Goal) + chokidar/@parcel scale backends | `docs/plans/015-file-watch-notify/file-watch-notify-plan.md` (§26-31,242-245) | **Direct** — we now do the reuse it deferred, at the daemon layer | Reuse the core as a library; recursive/at-scale fidelity stays deferred (same node `fs.watch` caveats) |
| H-02 | Plan 032 honest-send-receipts hardened the inbox→pane path + `BUSY_RE` oracle this feature rides — **shipped but not deployed** (needs daemon restart) | `docs/plans/032-pij-honest-send-receipts/`; memory `copilot-bg-send-wedge` | **Direct** — notices inherit whatever send-reliability that path has; the copilot send-wedge applies equally to notices | Note the shared transport; don't claim watch reliability beyond what 032's deploy proves |
| H-03 | The `/pij` skill's `watch` route is a placeholder: *"future — awaits daemon fs.watch, plan 029 P4"* — but 029 has no watch content | `~/.claude/skills/pij/SKILL.md:29,41` | **Superseded** — this plan is what fills the stub | Update the stale skill pointer as part of ship |
| H-04 | Control-plane peers are pij-blind at boot — they won't know `pij watch` exists unless the spawn preamble/packet teaches it | memory `control-plane-peer-self-awareness` (pij-4s10mb) | **Direct** — subscription is peer-self-served, so peers must be taught the verb | Ties to the parked spawn-preamble idea; at minimum document the verb where peers can find it |

## Risks and Unknowns

| Item | Evidence | Why it matters | Resolution / next evidence |
|------|----------|----------------|----------------------------|
| Busy-defer gate not implemented | F-09, F-10 | Notices inject mid-turn like every peer message; a burst could interrupt a peer's turn | **Decision for plan**: accept immediate-inject for v1 (matches existing behaviour) vs. build readiness-gated delivery (broader change). Recommend non-goal for v1 |
| Subscription store lost-update | F-07 | CLI + daemon both writing session state races | Sidecar file (CLI writes, daemon reads) sidesteps entirely — favour it in the plan |
| Recursive / large-folder fidelity | H-01 | node `fs.watch` recursive is platform-variable; the reconcile is O(files) per wake | Non-goal v1 (inherit 015's stance); document the scale ceiling |
| Notice provenance & format | F-02, F-03 | The `from`-id + body shape decide whether `[pij from …]` reads as a file-change vs a human message | **Decision for plan**: synthetic source id (e.g. `pij-watch`) + a clear `[file-watch] <path> <kind>` body |
| Transport reliability inherited from 032 | H-02 | Watch notices are only as reliable as the (un-deployed) send path | Land/verify 032 deploy before trusting live watch delivery |

## Domain Impact

| Domain / boundary | Relationship | Contract or constraint | Evidence |
|-------------------|--------------|------------------------|----------|
| `pij-control-plane` (daemon + cli) | Extends | New watch subsystem + 2 CLI verbs; must not block the 600ms sync tick | F-08, F-12 |
| `file-watch-notify` | New consumer (import) | Core stays put; a new cross-extension import edge `pij → file-watch-notify`; keep the core's public surface stable | F-04, F-05 |
| pi (in-process) | **Untouched** | No pi coupling — delivery is daemon/tmux, not `pi.sendUserMessage` | F-03, F-05 |

## Planning Handoff

- **Preserve**: `channel.deliver` as the single delivery seam (don't call `ports.sendText` directly — you'd lose buffering/receipts/restart-survival); `FolderWatcher`'s baseline-prime; the descriptor's additive-field discipline; the `InjectPort` interface boundary.
- **Change carefully**: subscription persistence (avoid the `writeMerged` race — sidecar, not descriptor field); the daemon tick (never run a synchronous folder scan inside it — `FolderWatcher` is already async + debounced, keep it off the tick's critical path).
- **Likely files/symbols**: `.pi/extensions/pij/cli.ts` (watch/unwatch argv intercept + `runWatch`/`runUnwatch` + USAGE); a **new** daemon watch module owning per-session `FolderWatcher` lifecycle (spin up/tear down from the sidecar); `daemon.ts` tick wiring; `core/types.ts` (subscription record type); reuse `../file-watch-notify/store.js` + `watcher.js`; `core/readiness.ts` (only if a busy-gate is built).
- **Decisions still required** (for the plan's clarify pass): (a) subscription store — **sidecar** (recommended) vs descriptor field; (b) busy-defer gate **in or out** of v1 (recommend out); (c) notice `from`-id + body format; (d) glob surface — dir + `picomatch` patterns like the tool, or bare globs; (e) reuse `SteeredNoticeTracker` dedup vs accept one-message-per-wake; (f) subscription scope — per-peer self-serve only, or can an orchestrator subscribe a peer on its behalf.
