# Domain: pij-control-plane

## Purpose

A machine-wide **control plane** that spawns, addresses, messages, deterministically
binds, verifies, and tails coding-agent sessions across heterogeneous harnesses
(pi today, Claude Code now over tmux, Copilot later) under a **single durable identity** and a file-backed **switchboard daemon**. It extends `pij-messaging` from
"two live pi sessions" to "any harness pij can drive", without disturbing the one
immovable seam — `pi.sendUserMessage` stays in-process (owned by `pij-messaging`'s
thin receiver). Plan 019.

## Source Locations

| Path | Role |
|------|------|
| `.pi/extensions/pij/adapters/tmux-keys.ts` | Shared send-keys/paste/capture primitives over a raw pane target string (`typeLiteral`/`pressKey`/`pasteBuffer`/`capturePane`), injectable `TmuxRunner`. Extracted from `harness/driver/tmux.ts` (parity). |
| `.pi/extensions/pij/core/harness/types.ts` | `HarnessKind` + `selectTransport()` — `pi`→`inbox`, `claude`/`copilot`/`codex`→`sendkeys`. |
| `.pi/extensions/pij/core/readiness.ts` | Pure pane-text → `{ booting, interstitial, ready, busy, dead }` classifier; R-01 footer markers frozen from the live prototype. |
| `.pi/extensions/pij/core/interstitial.ts` | Known one-time boot prompts → `dismiss` (Esc) / `needs-human` classification. |
| `.pi/extensions/pij/core/harness/claude.ts` | Claude transport: init template, `claudeTranscriptPath` cwd-mangle, new-transcript discovery (path absent at spawn), send-keys plan. |
| `.pi/extensions/pij/core/harness/copilot.ts` | Copilot transport + current-session identity validation: `COPILOT_AGENT_SESSION_ID` must be a UUID with matching session-state directory metadata; global mtime scanning is forbidden. |
| `.pi/extensions/pij/core/harness/codex.ts` | Codex transport (Plan 022): global date-nested rollout layout, trailing-UUID id (`codexSessionIdFromPath`), recursive `listCodexRollouts`, `session_meta.cwd` confirm (`codexCwdFromMeta`), `summarizeCodexEvent` tail. |
| `.pi/extensions/pij/core/harness/transcript.ts` | `transcriptLayout(harness)` selector (Plan 022): harness-selected `dir`/`list`/`sessionIdOf` so the daemon's discovery bind works for claude (flat, cwd-scoped, stem) AND codex (deep, global, UUID) from one code path; claude byte-unchanged. |
| `.pi/extensions/pij/core/harness/pi.ts` | Pi transport: observe-only routing (delivery owned by the thin receiver). |
| `.pi/extensions/pij/core/models/registry.ts` | Shared model registry: pure Pi/Copilot/Codex/Claude source parsers and snapshots plus the single impure `loadModels()` composition root. Owns `ModelEntry.reasoning`/`levels`, verified-vs-curated semantics, and the exact Copilot GPT-5.6 effort correction. |
| `.pi/extensions/pij/core/models/validate.ts` | Pure model and effort validation against registry entries; reports only positive contradictions and never blocks spawn. |
| `.pi/extensions/pij/adapters/git-repository.ts` | Argv-only canonical Git common-directory resolver; main checkout and linked worktrees share one absolute identity, non-Git returns null. |
| `.pi/extensions/pij/core/spawn.ts` | Spawn warning composition, structural/repository pending metadata including `spawnId`, adopt-parent grammar, and harness-specific effort translation (`:<level>` for Pi, `--effort` for Claude/Copilot, Codex config override). |
| `.pi/extensions/pij/core/spawn-expectation.ts` | Pi-free durable expectation and terminal reducers, including the named default registration TTL. |
| `.pi/extensions/pij/core/binding.ts` | Deterministic binding (transcript-discovery) + phone-home confirm + watchdog + creator notice; preserves tree/prime history and refreshes repository identity. |
| `.pi/extensions/pij/core/daemon/router.ts` | Resolve target → transport; buffer pre-binding sends; delivery-ownership rules; persist compact watchdog pause before tmux injection. |
| `.pi/extensions/pij/core/daemon/pane-signals.ts` | Pure rolling byte-density busy signal, caret-driven user-typing tracker, and all-pane connect/retire diff. |
| `.pi/extensions/pij/core/daemon/watchdog-manager.ts` | Daemon-owned whole-life watchdog coordinator: descriptor-driven scheduling, durable exemption reconciliation before due-fire evaluation, delivery split, typed self-attribution, silent-fire derivation, per-watcher episode latch, and bounded capture dispatch. |
| `.pi/extensions/pij/adapters/watchdog-store.ts` | Validated atomic per-session watchdog sidecars plus per-watcher capture pointer files. CLI-owned, daemon-read. |
| `.pi/extensions/pij/core/daemon/index-state.ts` | In-memory index over `~/.pij/` (incl. `initInjectedAt`) with exact `(harness,harnessSessionId)` cardinality; rebuild on start. |
| `.pi/extensions/pij/core/daemon/loop.ts` | Descriptor write coordinator: append-only external fields fill gaps; mutable `parentId`, `prime`, and `oldPrime` are latest-disk-authoritative before daemon writes. |
| `.pi/extensions/pij/core/inbox.ts` | Shared durable inbox actions used by daemon-owned receipt consumption: prepare hidden receipt envelopes, append/reuse their event, then mark read. |
| `.pi/extensions/pij/adapters/fs-registry.ts` | Fsync+hard-link no-replace live claims, memorable-id allocation, pre-bind reservation ownership, two-way durable identity ownership, and metadata snapshots. |
| `.pi/extensions/pij/core/daemon/lock.ts` | Single-instance PID/lockfile guard. |
| `.pi/extensions/pij/adapters/tui-chalk.ts` | chalk event-line renderer (spawn/ready/interstitial/bind/message/death). |
| `.pi/extensions/pij/daemon.ts` | Daemon bin: lock → watch pending+inboxes → readiness/interstitial → init-once → route → render. |
| `.pi/extensions/pij/cli.ts` | Production tree/link repository wiring, adopt `--parent` validation, spawn metadata capture, and orchestration intercept. |
| `.pi/extensions/pij/telegram/bridge.ts` | Telegram inbound precedence, selected `/tail` target, successful-speech observation, and once-per-message sender/repository prefixing across text/media forwarding. |
| `.pi/extensions/pij/telegram/index.ts` | Bridge lifecycle, process-local per-chat last-speaker composition, normalized chat keys, and bounded fakeable git-context resolution from sender descriptors. |
| `.pi/extensions/pij/telegram/commands.ts` | `/list` and `/tail`; `/tail` reads selected-target state, never last-speaker fallback state. |
| `docs/how/pij-daemon.md` | Operator guide (run/spawn/adopt/send/tail/TUI/recovery). |
| `docs/how/pij-watchdog.md` | Whole-life watchdog verbs, pause tiers, self-teaching etiquette, stalled semantics, capture defaults, and isolated-proof safety. |
| `docs/how/pij-pane-signals.md` | Busy/typing/connect derivation, tap lifecycle, and user-typing-only send hold contract. |

## Concepts

| Concept | Description | Contract |
|---------|-------------|----------|
| Durable identity | Spawn atomically reserves a memorable `pij-id` before launch; restart re-attachment resolves the exact harness-native identity, hydrates durable metadata, and reuses the original id while runtime presence is replaced. | Shared by-pij ownership record; two-way `FsRegistry` native claim; `adopt --session-id`. |
| Reservation lifecycle | A launch owns its candidate before pane creation and transfers ownership to the pending descriptor after publication. | Owner-token release on known launch failure; no PID-death reclamation; explicit `adopt --id` recovery for retained crash-orphans. |
| Pending descriptor | Spawn atomically writes `(pij-id, paneId, cwd, harness, state:pending)` under `~/.pij/`; the daemon dir-watch picks it up. | `SessionDescriptor` += `harness`/`state` (F2 / AC-01). |
| Spawn expectation | Every Pi, daemon-bound, agent, and focus launch persists `(spawnId, requestedHarness, requestedAt, deadlineAt)` before tmux launch, then joins pane and descriptor/session ids. | Synchronous launch failure removes only its own key; expiry is an expectation-keyed no-show, suppressed once a descriptor has the same `spawnId`. |
| Terminal observation | Terminal absence is classified from durable intent and probe evidence, never guessed from a missing pane alone. | `requested` (pij close intent), `unrequested-by-pij` (observed absence), or `unavailable` (probe failure); first daemon sweep is historical, later sweeps live. |
| Transport selection | A target's harness decides how a message reaches it. | `selectTransport(harness)` → `inbox` (pi) \| `sendkeys` (claude/copilot/codex). |
| Readiness | The daemon reads the pane and classifies idle-ready vs busy vs booting vs interstitial — no agent in the loop. | `classifyReadiness(paneText)`; R-01 footer markers (AC-02). |
| Interstitial handling | Known one-time boot prompts are auto-dismissed (Esc); trust/login are surfaced as needs-human. | `classifyInterstitial` → `dismiss`/`needs-human` (AC-06). |
| Deterministic binding | Claude/Codex use harness-specific transcript discovery; Copilot spawn uses its chosen UUID and Copilot adopt uses only validated `COPILOT_AGENT_SESSION_ID`. | `bind()`; harness-aware phonehome (`COPILOT_AGENT_SESSION_ID` / `CLAUDE_CODE_SESSION_ID`); watchdog. |
| Init-exactly-once | The init (pij-id + `pij phonehome` line) is injected once, after ready, idempotent across daemon restart. | persisted `initInjectedAt` (AC-02/12). |
| Fire-and-forget injection | tmux targets receive `send-keys`+Enter, ungated; the caller never blocks. | router → `tmux-keys` (AC-07/13). |
| Pane signals | The daemon observes busy, human composer activity, and pane lifecycle from one output tap plus one all-pane query. | Busy is read-only; only a non-empty human composer holds delivery; Enter or 60-second key-idle releases FIFO sends. |
| External-field merge ownership | Concurrent registry writers do not lose out-of-band state. | Latest persisted `parentId`, `prime`, and `oldPrime` (including explicit null/false clears) override stale daemon snapshots; append-only `reportedAt` remains fill-only. |
| Structural registration | Spawn/adopt/bind carry hierarchy without conflating authorization. | Spawn writes caller to `parentId` and `spawnedBy`; adopt accepts validated `--parent`; link mutates only `parentId`. |
| Repository refresh | Registration and reattachment capture the repository grouping active at the current folder. | Injected `RepositoryIdentityPort.gitCommonDir(folder)` returns canonical absolute common dir or null; stale identity is cleared outside Git. |
| Delivery ownership | Senders write the target inbox; the daemon consumes+injects ONLY tmux inboxes and merely observes pi inboxes. | router rules; pi thin receiver sole pi-inbox consumer (AC-08). |
| Durable push ownership | The daemon consumes only push-owned tmux unread envelopes, marks after an injection outcome, and leaves `deliveryMode:"pull"` plus pi inboxes untouched. | `daemonOwnsDelivery`; marker-aware `listUnread`; pi thin receiver/pull CLI own their inboxes. |
| Whole-life watchdog | Every eligible session is default-on after 20 minutes; daemon fires blind, derives suspect/stalled from delivered-but-unanswered turns, and shares one owner/watcher stalled episode. | `WatchdogManager`; descriptor `lastEventAt` axis truth; tmux `sendText` vs pi/pull inbox; pre-bind/paused/live-exempt skip. Expired exemptions are durably cleared before scheduling can fire. |
| Watchdog capture | Supervisors opt into per-target watcher policies without unbounded inline pane text. | Anomaly-only 40-line/4-KiB tail by default; 200-line/16-KiB hard ceiling; pointer file + ≤5 inline lines; paneless is capture-n/a. |
| Retained tmux history | Daemon delivery no longer deletes envelopes or replays marked history. | `msg-*` retained; `read-*` published after confirmed/unverified outcome; receipt event persisted before receipt marker. |
| Telegram conversation routing | Bare text/captionless media follows the last session whose non-receipt bubble successfully reached that normalized chat id; explicit selection remains separate for `/tail`. | reply tag > explicit name > last speaker; `onSpoke` after first successful send; process-local maps in `startBridge`. |
| Telegram sender context | Every agent bubble keeps `[pij-id]` first, then adds stable repository identity from the sender descriptor folder. | `[pij-id] [repo]` on `main`; `[pij-id] [repo/branch]` otherwise; bounded git failure or missing descriptor falls back to `[pij-id]`. |
| Model registry | One shared registry composes source-derived rows and best-effort aliases for model discovery and spawn validation. | Raw `github-copilot` rows and `provider:"copilot"` seed clones remain distinct projections; `verified:false` means not live-confirmed, independently of curated capability knowledge. |
| Model effort capability | `ModelEntry.levels` is the canonical ordered effort set used by every current validation/advertisement consumer. | Exact Copilot ids `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna` use `none, low, medium, high, xhigh, max` only under `github-copilot` parsing and Copilot fallback construction; same-id rows under other providers retain source data. |
| Warn-don't-block validation | Unknown models or unsupported known effort values produce guidance without refusing the launch. | `validateModel`/`validateEffort` report tagged results; warnings list known levels, then spawn continues with the supplied model/effort. |
| Tailing | A bound claude session's transcript path is resolvable and streamable. | `pij tail` (AC-09). |
| Semantic clear audit | Removing a semantic declaration remains an append-only, recoverable platform action. | `state-cleared` is assignment-coupled under the platform write lock; journal-first recovery reconciles its stamped sequence exactly once. |
| Single-instance daemon | A second `pij daemon` refuses/attaches — never a second injector. | PID/lockfile (AC-10). |

## Contracts

| Contract | Consumer | Shape / Guarantee |
|----------|----------|-------------------|
| `tmux-keys` primitives | daemon, harness Driver | `typeLiteral`/`pressKey`/`pasteBuffer`/`capturePane(target, …, run?)`; argv-only; `TmuxRunner` injectable. |
| `HarnessKind` + `selectTransport` | router, spawn, CLI | `"pi" \| "claude" \| "copilot" \| "codex"` → `"inbox" \| "sendkeys"`. |
| `classifyReadiness` | daemon readiness loop | pure `string → ReadinessState`; version-sensitive markers isolated here. |
| `classifyInterstitial` | daemon readiness loop | pure `string → { kind: "dismiss" \| "needs-human" \| "none" }`. |
| Binding record | daemon, `pij tail`, creator notice | Durable `(harness,harnessSessionId) ↔ pij-id` plus replaceable `paneId ↔ pid ↔ cwd`; exact zero/one/many resolution, no silent overwrite. |
| Prime CLI wiring | orchestration core | Omitted target uses exact env/pane/lone-local self resolution; explicit ids bypass it; baton actor fallback remains baton-only. |
| Tree/link/adopt wiring | messaging core | Production supplies all readable descriptors plus repository identity; adopt parent uses the same link planner before allocation/reservation/descriptor writes; link preserves `spawnedBy`. |
| Push delivery marker | daemon + sender wait | A tmux message is marked only after `sendText` returns; receipt envelopes append/reuse a durable event before marking and never reach send-keys. |
| Pane signal gate | daemon + future UI | `PaneSignalSnapshot` exposes busy/userTyping/composer length; `SendBuffer` gates only on `userTyping`, retains held inbox envelopes unread, and flushes FIFO on release. |
| Watchdog manager/store | daemon, CLI, supervisors | Absence of sidecar means default-on; `exemptUntilMs` is a durable absolute deadline (60m default), manager normalizes legacy/malformed expiry and persists clearing before due-fire evaluation, caches sidecar revisions, persists `lastWatchdogFireAt` through daemon callbacks, excludes its own pane/event transitions, and writes watcher captures under `<PIJ_HOME>/<watcher>/watchdog-captures/`. |
| Watchdog stalled episode | daemon whole-life detector + manager watcher delivery | Two silent fires stamp `failureReason:"stalled"`; owner and each anomaly watcher are notified once until typed real recovery. `capture.mode:"always"` remains every-due-fire. |
| Telegram last-speaker seam | Telegram bot + forwarder | `getLastSpeaker(String(chatId))` supplies inbound fallback; `onSpoke(from)` updates only after the first successful non-receipt Telegram send; `/tail` uses separate selected-target state. |
| Telegram repository-context seam | Telegram forwarder | `senderContext(from)` runs once per `DeliveredMessage`; `startBridge` resolves the sender descriptor folder through an injected git runner with 2-second subprocess bounds and reuses the prefix across chunks/media. |
| Model registry entry | `pij models`, peer spawn, agent spawn | `{ id, name, provider, verified, reasoning?, levels? }`; source-derived data is preferred over same-harness fallbacks, while provider projections remain separate. |
| Copilot GPT-5.6 effort correction | registry + validation consumers | The exact trio exposes ordered levels `none\|low\|medium\|high\|xhigh\|max`; fallback aliases retain `verified:false`; unsupported `minimal` is reported but does not block. |

## Boundary Owns

- The single-instance daemon lifecycle + chalk TUI.
- The harness-type → transport seam (`pi`→inbox, `claude`/`copilot`/`codex`→send-keys).
- Daemon ownership of push tmux unread/marker outcomes; pull and pi inboxes remain externally owned.
- The tmux key/paste/capture primitives (shared lib).
- Readiness detection + interstitial handling.
- Read-only per-pane busy/connect signals and the human-composer-only send hold.
- Deterministic transcript-discovery binding + phone-home confirmation + watchdog.
- pij-id pre-allocation + restart-stable exact native-identity recovery + the pending-descriptor handoff; init idempotency.
- Reattachment-only `adopt --id`: existing descriptor/reservation required, unknown ids fail `E-NOID`.
- Canonical Git common-directory capture/refresh and production repository/global/subtree selection.
- Structural-parent persistence through spawn, adoption, binding, daemon merge, failure, and dissolve; close ownership remains separate.
- Claude/codex transcript-path resolution + tailing (harness-selected `transcriptLayout`).
- Telegram reply/name/last-speaker precedence, process-local per-chat state, and separate
  selected-target semantics for `/tail`.
- Telegram agent-bubble identity: sender tag first, stable repository/branch context second,
  with safe fallback when descriptor/git context is unavailable.
- Shared model discovery, verification metadata, and effort capability data consumed by
  `pij models`, peer spawn, and agent spawn.
- Warn-don't-block model/effort validation and harness-specific spawn effort translation.
- Whole-life watchdog scheduling, tmux-side attribution, shared stalled ownership, watcher episode delivery, and bounded pane-capture persistence.
- The `state-cleared` spine kind and its journal-first assignment-chain recovery semantics.

## Boundary Excludes

- The pi in-process inject (`pi.sendUserMessage`) — stays in `pij-messaging`'s thin receiver.
- The wire framing / receipts / event-stream contracts — owned by `pij-messaging`.
- User-file watching — owned by `file-watch-notify`.
- Provider-prefix normalization for registry validation; matching remains against the supplied
  registry id, while Pi continues to pass provider-prefixed model ids through unchanged.
- Live harness usability guarantees for best-effort aliases; `verified:false` entries require a
  first-use canary.

## Dependencies

### This Domain Depends On

| Domain / System | Type | Contract Used |
|-----------------|------|---------------|
| `pij-messaging` | extend | `SessionDescriptor`, tree/link contracts, `RepositoryIdentityPort`, `Result`, discovery/self-resolution, `FsChannel`/registry layout. |
| `extension-authoring-harness` | consume | `harness/driver/tmux.ts` primitives (now re-exported from the shared lib); vitest/Biome/Driver smoke. |
| tmux + `claude` CLI | consume (impure) | `split-window -P`, `send-keys`, `capture-pane`; Claude Code v2.1.x footer/transcript surface. |
| Pi/Codex user configuration | consume (impure) | `~/.pi/agent/models.json` provider models/overrides and the top-level model in `~/.codex/config.toml`; unreadable sources degrade to curated aliases. |

### Domains That Depend On This

| Domain | Contract Used |
|--------|---------------|
| `agent-tooling-interface` | (future) `pij spawn`/`daemon`/`adopt` CLI + `pij_spawn --harness` UX. |

## History

| Plan | Change | Date |
|------|--------|------|
| 019-pij-tmux-control-plane | Created `pij-control-plane` domain. Group A: extracted the shared `tmux-keys` send-keys/paste/capture lib (argv-only, injectable `TmuxRunner`) from `harness/driver/tmux.ts` and re-delegated the driver to it for parity. | 2026-06-27 |
| 019-pij-tmux-control-plane / T029 | Added restart-stable identity: authoritative external native ids, exact tuple cardinality, atomic durable identity claims, runtime re-attachment, and Pi exact native-id persistence. | 2026-07-11 |
| 021-unify-spawn-harness | `pij spawn` is now one uniform surface for `pi\|claude\|copilot` (`SPAWNABLE_HARNESSES`). pi dispatches down a self-registering path in the bin (pure `buildSpawnCommand` + same registry-tracked split layout) — no daemon, no pre-allocated id, no pending descriptor, no binding; claude/copilot daemon-bound path unchanged. | 2026-06-28 |
| 022-codex-spawn-support | Added `codex` as the 4th spawnable harness — a second DISCOVERY-bound harness (`--dangerously-bypass-approvals-and-sandbox`, `sendkeys`). New pure `core/harness/codex.ts` (date-nested global rollout layout: `~/.codex/sessions/YYYY/MM/DD/rollout-<ISO>-<uuid>.jsonl`, trailing-UUID id, `session_meta.cwd` confirm, tail summarizer) + `core/harness/transcript.ts` (`transcriptLayout(harness)` selector — claude byte-unchanged). Daemon discovery derives the id via `layout.sessionIdOf(path)` (the UUID, not the stem — Finding 06) and persists the rollout path as `SessionDescriptor.transcriptPath` for tail. | 2026-06-28 |
| 024-fix-false-provider-death | Provider-failure push now suppresses working-session false positives, clears stale provider-failure state on working recovery, and uses provider-stuck wording instead of claiming live sessions exited. | 2026-06-28 |
| 026-pij-telegram-bridge | Added the `pij-telegram` bridge peer (`pij telegram init\|start\|stop`): a foreground, single-instance grammY long-poll relaying a Telegram bot ⇄ pij sessions (allowlist-gated routing, `/list` + `/tail`, chunked outbound). Registers a `harness:"pi"` + `lifecycle:"bound"` descriptor so the daemon observes (never drains) it — no daemon/core contract change. `init` validates the token (`getMe`), captures the operator id as the allowlist, and merges the scoped `.env` without clobbering existing keys. | 2026-06-29 |
| 026-pij-telegram-bridge (Phase 5: media) | Media relay **both ways** by reference-passing — bytes never touch the pij wire. New pure `telegram/media.ts` (`classifyMedia`, `withinUploadLimit`/`withinDownloadLimit`, `safeMediaName`, `buildInboundNotice`). `PijMessage.attachments?` (additive) + `pij send --file/--caption` (in `core/cli.ts`). Outbound: `startForwarder` classifies each attachment → `sendPhoto`/`sendAnimation`/`sendDocument` via grammY `InputFile` in the existing ordered queue (10/50 MB caps → text-notice fallback, never a throw; attachment-only skips the blank text send). Inbound: allowlist-gated `message:photo\|animation\|document` handlers resolve the target by caption, 20 MB download pre-check, then `@grammyjs/files` download (behind an injected seam) into the target session's own `<dataDir>/attachments/<safe-name>`, delivering a text path notice. Added `@grammyjs/files` dep. | 2026-06-30 |
| 038-pij-prime-designation | Added exact-self production wiring and latest-disk-authoritative mutable prime merging in the daemon write coordinator. | 2026-07-11 |
| 040-memorable-pij-session-ids | Replaced new control-plane and agent-spawn ids with atomic memorable reservations; added collision retry, known-failure release, crash-orphan retention, and explicit reservation recovery through adopt. | 2026-07-11 |
| 040-memorable-pij-session-ids / F004 | Removed global newest-by-mtime Copilot adoption. Current env UUID + matching state metadata is authoritative; absent/invalid env stays pending and harness-aware phonehome completes recovery without touching another session's descriptor. | 2026-07-12 |
| 043-telegram-last-speaker-routing | Replaced inbound sticky fallback with strict per-chat last-speaker routing observed at the first successful non-receipt Telegram send. Reply/name precedence, captionless media, threading, and sender tags remain; `/tail` now explicitly uses separate selected-target state, and both maps reset with the bridge process. | 2026-07-12 |
| 043-telegram-last-speaker-routing / R8 | Added stable sender repository context to every agent-originated Telegram text/media bubble: `[pij-id] [repo]` on `main`, `[pij-id] [repo/branch]` otherwise. Resolution uses the sender descriptor folder, git common-dir identity, and bounded injected subprocess effects; failures preserve the original sender tag. | 2026-07-12 |
| 041-pij-inbox-no-tmux | Replaced tmux delete-on-consume/raw scans with marker-aware retained history, post-outcome read markers, event-before-marker receipt handling, and explicit pull non-ownership at every daemon gate. | 2026-07-12 |
| 045-copilot-5-6-effort-levels | Corrected the exact Copilot GPT-5.6 trio to `none, low, medium, high, xhigh, max` at provider-guarded Pi parsing and Copilot fallback construction. Preserved raw/clone projections, `verified:false` fallback semantics, warn-don't-block validation, unrelated-provider data, and existing harness effort translation. | 2026-07-13 |
| 046-pij-real-trees | Added argv-only Git common-directory identity, structural/repository metadata across spawn/adopt/bind/daemon/failure/dissolve paths, production tree/link wiring, and pre-write adopt-parent validation while retaining `spawnedBy` ownership. | 2026-07-13 |
| 055-pij-watchdog | Added default-on daemon-owned whole-life watchdog management, compact pause integration, shared stalled episodes, delivery-split parity, watcher capture pointers, and disposable-home acceptance/smoke proof. | 2026-07-17 |
| 058-tmux-pane-smarts | Added one-tap per-pane busy, user-typing, and connect signals; only human mid-type holds daemon delivery, with Enter/60-second-idle FIFO release. | 2026-07-19 |
| 059-detection-integrity / Phase 2 | Made watchdog exemptions self-rearming: an expiry is persisted cleared before a manager can deliver a due watchdog turn. | 2026-07-20 |
| 060-state-model-v2 | Added the assignment-coupled `state-cleared` spine event, journal-first recovery, and clear-state CLI wiring. | 2026-07-20 |
