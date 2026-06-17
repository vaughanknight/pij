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
| `.pi/extensions/file-watch-notify/commands.ts` | Pi-free runtime-command parser: `parseCommand(args) → ParsedCommand` (watch/list/stop/status/error). Quote-aware tokenizer; `help`/`list` lenient, `watch` variadic, `stop` exact-arity, unmatched quotes → error. |
| `.pi/extensions/file-watch-notify/index.ts` | P10 single `session_start` handler: load `.pi/file-watch.json`, start a watcher per config entry, inject on change, dispose on reload. Runtime `/file-watch-notify` watch/list/stop command — config + runtime watches share ONE disposer `Map<absDir,…>` (per-dir stop, dedupe-on-arm, reload-disposal); `loadedConfig` at module scope so runtime watches inherit debounce/ignore/notice. |
| `.pi/extensions/file-watch-notify/{store,watcher,inject,commands,index}.test.ts` | Hybrid coverage: TDD core + parser unit tests + real-fs watcher integration + fake-pi inject + runtime-command e2e (52 tests). |
| `.pi/file-watch.json` | User-authored watch config (project-local). |

## Concepts

| Concept | Description | Contract |
|---------|-------------|----------|
| Watch config | What folders/globs to watch and how to phrase notices. | `.pi/file-watch.json` → `parseConfig` → `Config { watches[], debounceMs, ignore, notice }`. |
| Snapshot reconcile | The ONLY change-classification mechanism (trap fix). | `reconcile(prev, next): Change[]` over `{mtimeMs,size}` maps — created/modified/deleted; no event-type input exists. |
| Atomic-save handling | A real atomic save (write-temp → rename) lands in one wake → a single `modified`; editor scratch files are ignore-listed. | Within-wake rename ⇒ one `modified` (AC-04). A rarer **cross-wake** delete→re-add is reclassified to `modified` (a preceding `deleted` may surface) — documented limitation, not deferred-flushed. |
| Debounced wake | A burst of fs events becomes one scan. | `FolderWatcher` debounces (`debounceMs`, default 30) then rebuilds the snapshot once. |
| In-session notice | The change reaches the model with no tool call. | `deliverNotices(port, notices)` → `sendUserMessage` (immediate) or `sendUserMessage(...,{deliverAs:"steer"})` (busy). |
| Steer vs immediate | Busy ⇒ after the current turn; idle ⇒ start a turn. | `pickInjectMode(isIdle)`; `isIdle()` read fresh from the live ctx at delivery. |
| Runtime control surface | Arm/list/stop watches live — no reload, no tool call. | `parseCommand(args) → ParsedCommand` (P4); the handler arms via the shared `startWatch` (dedupes by resolved dir) and tears down via the disposer Map. Runtime watches are **session-local** (lost on reload). |

## Contracts

| Contract | Consumer | Shape / Guarantee |
|----------|----------|-------------------|
| `Config` + `parseConfig` | `index.ts`, future workshop | Tagged-union parse of `.pi/file-watch.json`; invalid → one startup warning, watcher stays down. |
| `reconcile` / `WatchReconciler` | `watcher.ts`, tests | Snapshot-only classification; structurally cannot consume an fs event type (Key Finding 01). |
| `WatchDeps` | `watcher.ts`, tests | Injected `watch`/`listFiles`/`now`/`setTimer` (P3); `nodeWatchDeps()` in prod. |
| `InjectPort` + `deliverNotices` | `index.ts`, tests | Busy→steer, idle→immediate; no tool call. Only `inject.ts` + `index.ts` import pi. |
| `parseCommand` + `ParsedCommand` | `index.ts`, tests | Pure parse of the `/file-watch-notify` arg string → tagged union (P4); pi-free, no fs. |

## Boundary Owns

- Watch-config vocabulary + parsing/validation.
- Glob compilation (picomatch, compile-once).
- Snapshot reconcile + change classification + atomic-save coalescing.
- Debounced watcher lifecycle (arm at `session_start`, dispose on reload).
- The steer-vs-immediate inject decision.
- The runtime `watch`/`list`/`stop` command surface (session-local watches; one disposer map shared with config watches).

## Boundary Excludes

- Cross-session / peer messaging — that's `pij-messaging`.
- Acting on changes (it only *notifies*; the agent decides what to do).
- Recursive-at-scale backends (chokidar/@parcel) — documented as a future drop-in, not built.
- Persisting runtime-added watches back to `.pi/file-watch.json` — a Non-Goal (runtime watches are session-local).
- Pi command/tool/UI registration conventions — `agent-tooling-interface`.

## Dependencies

- **This domain depends on**: `picomatch` (npm, 0 transitive deps); Node ≥19.1 for opt-in `recursive:true`.
- **Reference pattern only** (no code/edge): `pij-messaging`'s `pi-runtime` inject path — copied/adapted, not imported.

## History

| Plan | Change | Date |
|------|--------|------|
| 015-file-watch-notify | Created the domain; standalone extension at `.pi/extensions/file-watch-notify/`. Pure core (config/glob/reconcile/coalesce/notice) + fs watcher adapter + steer/immediate inject adapter + P10 wiring + read-only status command. 22 unit/integration tests. Headline: snapshot-reconcile classification (directory-watch-trap fix). | 2026-06-17 |
| 015-file-watch-notify (amend) | Added the runtime control surface (`/file-watch-notify` watch/list/stop): pure `parseCommand` parser + `index.ts` refactor (disposer `Map` keyed by abs dir, module-scope `loadedConfig`, try-guarded `startWatch`, replaced status-only handler). Closes the real validate-v2 HIGH gaps (config scope; reload leak). 52 tests. | 2026-06-17 |
| 015-file-watch-notify (live crash fix) | Hardened the inject adapter against stale extension ctx after reload/session replacement: stale/throwing `ctx.isIdle()` falls back to busy/steer; stale/throwing `sendUserMessage()` is caught/dropped so async watcher callbacks cannot crash pi. 56 tests. | 2026-06-17 |
