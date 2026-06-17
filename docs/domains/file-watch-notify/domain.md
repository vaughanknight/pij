# Domain: file-watch-notify

## Purpose

Own the product contract for a **standalone pi extension** that watches one or
more configured folders (each with one or more glob patterns) and, on a
matching file change, **injects an in-session notice with no tool call** —
steered if the model is busy, immediate if idle. It adapts pij's proven
watch→steer/immediate-inject seam but is **fully decoupled** from pij (no shared
code, no changes to `pij-messaging`).

The defining design constraint is the **directory-watch trap** (research Key
Finding 01): `fs.watch(dir)` can miss in-place modifies and its event types are
unreliable across platforms. Classification is therefore done **only** by
reconciling a `{mtimeMs,size}` snapshot per debounced wake — never from raw
`fs.watch` events.

## Source Locations

| Path | Role |
|------|------|
| `.pi/extensions/file-watch-notify/store.ts` | Pi-free pure core: `parseConfig` (tagged-union), `compileWatch` (picomatch), `reconcile` snapshot diff, `WatchReconciler` (classify + events-filter + delete→re-add coalesce), `formatNotice`. |
| `.pi/extensions/file-watch-notify/watcher.ts` | `FolderWatcher` fs adapter: `fs.watch` + debounce → `readdir`/`stat` snapshot → `WatchReconciler`. `WatchDeps` injected (P3); `nodeWatchDeps()` is the production binding. |
| `.pi/extensions/file-watch-notify/inject.ts` | Delivery seam: pi-free `pickInjectMode`/`deliverNotices`/`InjectPort` + `makePiInjectPort` (adapts pij `pi-runtime.ts` `sendUserMessage`/`deliverAs:"steer"`). |
| `.pi/extensions/file-watch-notify/index.ts` | P10 single `session_start` handler: load `.pi/file-watch.json`, start a watcher per config entry, inject on change, dispose on reload. Read-only `/file-watch-notify` status command. |
| `.pi/extensions/file-watch-notify/{store,watcher,inject}.test.ts` | Hybrid coverage: TDD core (22 tests) + real-fs watcher integration + fake-pi inject. |
| `.pi/file-watch.json` | User-authored watch config (project-local). |

## Concepts

| Concept | Description | Contract |
|---------|-------------|----------|
| Watch config | What folders/globs to watch and how to phrase notices. | `.pi/file-watch.json` → `parseConfig` → `Config { watches[], debounceMs, ignore, notice }`. |
| Snapshot reconcile | The ONLY change-classification mechanism (trap fix). | `reconcile(prev, next): Change[]` over `{mtimeMs,size}` maps — created/modified/deleted; no event-type input exists. |
| Atomic-save coalesce | Editor save artifacts/round-trips don't spam. | ignore-list (`4913`,`*~`,`.goutputstream*`,`.tmp*`,`.*`) + delete→re-add within `REDELETE_COALESCE_MS` (100ms) → `modified`. |
| Debounced wake | A burst of fs events becomes one scan. | `FolderWatcher` debounces (`debounceMs`, default 30) then rebuilds the snapshot once. |
| In-session notice | The change reaches the model with no tool call. | `deliverNotices(port, notices)` → `sendUserMessage` (immediate) or `sendUserMessage(...,{deliverAs:"steer"})` (busy). |
| Steer vs immediate | Busy ⇒ after the current turn; idle ⇒ start a turn. | `pickInjectMode(isIdle)`; `isIdle()` read fresh from the live ctx at delivery. |

## Contracts

| Contract | Consumer | Shape / Guarantee |
|----------|----------|-------------------|
| `Config` + `parseConfig` | `index.ts`, future workshop | Tagged-union parse of `.pi/file-watch.json`; invalid → one startup warning, watcher stays down. |
| `reconcile` / `WatchReconciler` | `watcher.ts`, tests | Snapshot-only classification; structurally cannot consume an fs event type (Key Finding 01). |
| `WatchDeps` | `watcher.ts`, tests | Injected `watch`/`listFiles`/`now`/`setTimer` (P3); `nodeWatchDeps()` in prod. |
| `InjectPort` + `deliverNotices` | `index.ts`, tests | Busy→steer, idle→immediate; no tool call. Only `inject.ts` + `index.ts` import pi. |

## Boundary Owns

- Watch-config vocabulary + parsing/validation.
- Glob compilation (picomatch, compile-once).
- Snapshot reconcile + change classification + atomic-save coalescing.
- Debounced watcher lifecycle (arm at `session_start`, dispose on reload).
- The steer-vs-immediate inject decision.

## Boundary Excludes

- Cross-session / peer messaging — that's `pij-messaging`.
- Acting on changes (it only *notifies*; the agent decides what to do).
- Recursive-at-scale backends (chokidar/@parcel) — documented as a future drop-in, not built.
- Pi command/tool/UI registration conventions — `agent-tooling-interface`.

## Dependencies

- **This domain depends on**: `picomatch` (npm, 0 transitive deps); Node ≥19.1 for opt-in `recursive:true`.
- **Reference pattern only** (no code/edge): `pij-messaging`'s `pi-runtime` inject path — copied/adapted, not imported.

## History

| Plan | Change | Date |
|------|--------|------|
| 015-file-watch-notify | Created the domain; standalone extension at `.pi/extensions/file-watch-notify/`. Pure core (config/glob/reconcile/coalesce/notice) + fs watcher adapter + steer/immediate inject adapter + P10 wiring + read-only status command. 22 unit/integration tests. Headline: snapshot-reconcile classification (directory-watch-trap fix). | 2026-06-17 |
