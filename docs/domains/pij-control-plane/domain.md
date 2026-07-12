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
| `.pi/extensions/pij/core/binding.ts` | Deterministic binding (transcript-discovery) + phone-home confirm + watchdog + creator notice. |
| `.pi/extensions/pij/core/daemon/router.ts` | Resolve target → transport; buffer pre-binding sends; delivery-ownership rules. |
| `.pi/extensions/pij/core/daemon/index-state.ts` | In-memory index over `~/.pij/` (incl. `initInjectedAt`) with exact `(harness,harnessSessionId)` cardinality; rebuild on start. |
| `.pi/extensions/pij/core/daemon/loop.ts` | Descriptor write coordinator: append-only external fields fill gaps; mutable `prime` is latest-disk-authoritative before daemon writes. |
| `.pi/extensions/pij/adapters/fs-registry.ts` | Fsync+hard-link no-replace live claims, memorable-id allocation, pre-bind reservation ownership, two-way durable identity ownership, and metadata snapshots. |
| `.pi/extensions/pij/core/daemon/lock.ts` | Single-instance PID/lockfile guard. |
| `.pi/extensions/pij/adapters/tui-chalk.ts` | chalk event-line renderer (spawn/ready/interstitial/bind/message/death). |
| `.pi/extensions/pij/daemon.ts` | Daemon bin: lock → watch pending+inboxes → readiness/interstitial → init-once → route → render. |
| `docs/how/pij-daemon.md` | Operator guide (run/spawn/adopt/send/tail/TUI/recovery). |

## Concepts

| Concept | Description | Contract |
|---------|-------------|----------|
| Durable identity | Spawn atomically reserves a memorable `pij-id` before launch; restart re-attachment resolves the exact harness-native identity, hydrates durable metadata, and reuses the original id while runtime presence is replaced. | Shared by-pij ownership record; two-way `FsRegistry` native claim; `adopt --session-id`. |
| Reservation lifecycle | A launch owns its candidate before pane creation and transfers ownership to the pending descriptor after publication. | Owner-token release on known launch failure; no PID-death reclamation; explicit `adopt --id` recovery for retained crash-orphans. |
| Pending descriptor | Spawn atomically writes `(pij-id, paneId, cwd, harness, state:pending)` under `~/.pij/`; the daemon dir-watch picks it up. | `SessionDescriptor` += `harness`/`state` (F2 / AC-01). |
| Transport selection | A target's harness decides how a message reaches it. | `selectTransport(harness)` → `inbox` (pi) \| `sendkeys` (claude/copilot/codex). |
| Readiness | The daemon reads the pane and classifies idle-ready vs busy vs booting vs interstitial — no agent in the loop. | `classifyReadiness(paneText)`; R-01 footer markers (AC-02). |
| Interstitial handling | Known one-time boot prompts are auto-dismissed (Esc); trust/login are surfaced as needs-human. | `classifyInterstitial` → `dismiss`/`needs-human` (AC-06). |
| Deterministic binding | Claude/Codex use harness-specific transcript discovery; Copilot spawn uses its chosen UUID and Copilot adopt uses only validated `COPILOT_AGENT_SESSION_ID`. | `bind()`; harness-aware phonehome (`COPILOT_AGENT_SESSION_ID` / `CLAUDE_CODE_SESSION_ID`); watchdog. |
| Init-exactly-once | The init (pij-id + `pij phonehome` line) is injected once, after ready, idempotent across daemon restart. | persisted `initInjectedAt` (AC-02/12). |
| Fire-and-forget injection | tmux targets receive `send-keys`+Enter, ungated; the caller never blocks. | router → `tmux-keys` (AC-07/13). |
| External-field merge ownership | Concurrent registry writers do not lose out-of-band state. | Latest persisted `prime:true\|false` overrides stale daemon snapshots; append-only `reportedAt` retains fill-only semantics. |
| Delivery ownership | Senders write the target inbox; the daemon consumes+injects ONLY tmux inboxes and merely observes pi inboxes. | router rules; pi thin receiver sole pi-inbox consumer (AC-08). |
| Tailing | A bound claude session's transcript path is resolvable and streamable. | `pij tail` (AC-09). |
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

## Boundary Owns

- The single-instance daemon lifecycle + chalk TUI.
- The harness-type → transport seam (`pi`→inbox, `claude`/`copilot`/`codex`→send-keys).
- The tmux key/paste/capture primitives (shared lib).
- Readiness detection + interstitial handling.
- Deterministic transcript-discovery binding + phone-home confirmation + watchdog.
- pij-id pre-allocation + restart-stable exact native-identity recovery + the pending-descriptor handoff; init idempotency.
- Reattachment-only `adopt --id`: existing descriptor/reservation required, unknown ids fail `E-NOID`.
- Claude/codex transcript-path resolution + tailing (harness-selected `transcriptLayout`).

## Boundary Excludes

- The pi in-process inject (`pi.sendUserMessage`) — stays in `pij-messaging`'s thin receiver.
- The wire framing / receipts / event-stream contracts — owned by `pij-messaging`.
- User-file watching — owned by `file-watch-notify`.

## Dependencies

### This Domain Depends On

| Domain / System | Type | Contract Used |
|-----------------|------|---------------|
| `pij-messaging` | extend | `SessionDescriptor`, `Result`, the five ports, `deriveSelfId`/`resolveSelf`, `FsChannel`/registry layout. |
| `extension-authoring-harness` | consume | `harness/driver/tmux.ts` primitives (now re-exported from the shared lib); vitest/Biome/Driver smoke. |
| tmux + `claude` CLI | consume (impure) | `split-window -P`, `send-keys`, `capture-pane`; Claude Code v2.1.x footer/transcript surface. |

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
| 026-pij-telegram-bridge | Added the `pij-telegram` bridge peer (`pij telegram init\|start\|stop`): a foreground, single-instance grammY long-poll relaying a Telegram bot ⇄ pij sessions (allowlist-gated, addressed/sticky routing, `/list` + `/tail`, chunked outbound). Registers a `harness:"pi"` + `lifecycle:"bound"` descriptor so the daemon observes (never drains) it — no daemon/core contract change. `init` validates the token (`getMe`), captures the operator id as the allowlist, and merges the scoped `.env` without clobbering existing keys. | 2026-06-29 |
| 026-pij-telegram-bridge (Phase 5: media) | Media relay **both ways** by reference-passing — bytes never touch the pij wire. New pure `telegram/media.ts` (`classifyMedia`, `withinUploadLimit`/`withinDownloadLimit`, `safeMediaName`, `buildInboundNotice`). `PijMessage.attachments?` (additive) + `pij send --file/--caption` (in `core/cli.ts`). Outbound: `startForwarder` classifies each attachment → `sendPhoto`/`sendAnimation`/`sendDocument` via grammY `InputFile` in the existing ordered queue (10/50 MB caps → text-notice fallback, never a throw; attachment-only skips the blank text send). Inbound: allowlist-gated `message:photo\|animation\|document` handlers resolve the target by caption, 20 MB download pre-check, then `@grammyjs/files` download (behind an injected seam) into the target session's own `<dataDir>/attachments/<safe-name>`, delivering a text path notice. Added `@grammyjs/files` dep. | 2026-06-30 |
| 038-pij-prime-designation | Added exact-self production wiring and latest-disk-authoritative mutable prime merging in the daemon write coordinator. | 2026-07-11 |
| 040-memorable-pij-session-ids | Replaced new control-plane and agent-spawn ids with atomic memorable reservations; added collision retry, known-failure release, crash-orphan retention, and explicit reservation recovery through adopt. | 2026-07-11 |
| 040-memorable-pij-session-ids / F004 | Removed global newest-by-mtime Copilot adoption. Current env UUID + matching state metadata is authoritative; absent/invalid env stays pending and harness-aware phonehome completes recovery without touching another session's descriptor. | 2026-07-12 |
