# pij Telegram Bridge
**Mode**: Full
**Plan Version**: 1.0.0
**Created**: 2026-06-29
**Status**: READY
**Spec source**: unified (this file)

## Business Specification

### Research Context
📚 Research done in-conversation (no `research-dossier.md` file) + two code scouts.
- **SDK**: **grammY** — TypeScript-first, built-in long-polling (no public webhook), minimal handler API, actively maintained. Chosen over Telegraf / node-telegram-bot-api.
- **Transport reuse**: pij already moves messages over a file-based channel (`~/.pij/<id>/inbox/msg-*.json`, `FsChannel`). The bridge reuses it in both directions — no new IPC.
- **Self-drain mechanism** (both scouts): a peer registered with `harness: "pi"` routes via `selectTransport → "inbox" → {kind:"observe"}` (`core/daemon/router.ts:37`), so the daemon **never** pane-injects or drains it. The bridge must drain its own inbox with `FsChannel.watch()` exactly as the in-process pi receiver does (`index.ts:271`).
- **No build step**: bin is tsx-direct (`package.json` `"bin": {"pij": ".pi/extensions/pij/cli.ts"}`, shebang `npx tsx`); tests are `vitest`.

### Summary
Give the operator a phone-side seam into the pij control plane. A long-running grammY process registers as a fixed-id pij peer **`pij-telegram`**. Inbound Telegram text addresses a session by a fragment of its id and is relayed via pij's existing send path; agents reply by running `pij send pij-telegram "…"`, which the bridge forwards back to the operator's Telegram chat. The bridge stays thin — pij's registry/channel do the real work.

### Goals
- Address any live session from Telegram by a partial id token; converse with it.
- Session→operator replies are **agent-initiated** via `pij send pij-telegram` (no transcript scraping).
- `/list` (last 10 sessions + paths) and `/tail [N]` (last N output lines, default 10).
- One-pass onboarding: `pij telegram init` (BotFather token → validate → capture operator id → write `.env`).
- Fail-closed security: a hard Telegram `user_id` allowlist gating the very first handler.

### Non-Goals
- No live transcript auto-forwarding / streaming (replies are agent-initiated only).
- No presence/typing indicators, no rich media, no inline keyboards.
- No multi-operator / multi-tenant model (single-operator allowlist).
- No webhook mode (long-polling only).
- No new IPC or daemon protocol — reuse the file channel.

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|----------------------|
| pij-control-plane | existing | **modify** | Add a non-tmux peer (the Telegram bridge) + a `pij telegram` bin verb |
| pij-messaging | existing | **consume** | Reuse `FsRegistry` / `FsChannel` send + `FsChannel.watch` drain + `FsEventLog` read; no contract change |

No NEW domain — the bridge is a peer implementation inside `pij-control-plane`, consuming `pij-messaging` contracts unchanged.

### Testing Strategy
- **Approach**: Hybrid. TDD (tests-first, `vitest`) for the pure units — name/address matcher, config+allowlist parsing, the 4096 chunker. Lightweight validation for the I/O glue — grammY handlers, inbox-watch forwarding, onboarding.
- **Rationale**: matcher edge cases (partial match, multi-match ordering, no-match fallback) and the allowlist parser carry real logic and deserve exact tests; the Telegram/fs glue is better covered by a few targeted tests than by heavy mocking.
- **Focus areas**: address resolution; allowlist gate; chunking boundaries; `.env` parse/validate.
- **Phase 3 (I/O) test approach**: lightweight integration — descriptor registration asserted by reading back the written descriptor + confirming the daemon skips it (`harness:"pi"` → observe); inbox-watch forwarding via a mocked `Bot.api` + a real temp inbox; `/tail` via a seeded `FsEventLog`; lockfile/single-instance + 409 via process-simulation tests (write a lock, assert second-start refusal; stale-lock auto-clean).
- **Excluded**: live Telegram API round-trips (mocked).
- **Mock usage**: Targeted — mock the grammY `Bot`/`api` and the filesystem inbox where needed; pure units use real data, no mocks.

### Documentation Strategy
- **Location**: Hybrid — `README.md` quickstart for `pij telegram init` onboarding + `.env` keys; `docs/how/pij-telegram.md` for addressing rules, `/list` + `/tail`, the `pij-telegram` reply contract, the security model, and single-instance operation.
- **Rationale**: onboarding belongs in the README front door; the operating model + security deserve a dedicated guide.

### Complexity
- **Score**: CS-4 (large)
- **Breakdown**: S=2, I=2, D=1, N=1, F=2, T=1 (sum 9)
- **Confidence**: 0.80
- **Assumptions**: grammY long-polling is sufficient; one operator; the file channel is the only transport needed.
- **Dependencies**: `grammy`, `dotenv` (new); existing `FsRegistry`/`FsChannel`/`FsEventLog`.
- **Risks**: see `### Risks & Assumptions` + the implementation `### Risks` table.
- **Phases**: 4.

### Acceptance Criteria
1. **AC-01** — `pij telegram init` walks the BotFather steps, validates the token via `getMe`, captures the operator's `user_id` + `chat_id` from their first message to the bot, and writes/merges `.env` (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USER_IDS`, `TELEGRAM_CHAT_ID`) **without clobbering** existing keys.
2. **AC-02** — A message `<tok> <text>` from an allowlisted user, where `<tok>` matches a live session id token (after stripping `pij-`, prefix/substring, deterministic order), delivers `<text>` to that session (an inbox file appears for it) and records it as the most-recent target.
3. **AC-03** — A later message whose first token matches **no** live session is delivered **in full** to the most-recent target.
4. **AC-04** — When `<tok>` matches multiple live sessions, the chosen target is deterministic — sorted by `descriptor.lastEventAt` newest-first (fallback `startedAt`) — never dependent on undefined registry order.
5. **AC-05** — An agent running `pij send pij-telegram "reply"` results in `reply` arriving in the operator's Telegram chat; output longer than the Telegram limit is split into numbered chunks, none truncated.
6. **AC-06** — `/list` returns the last 10 sessions with id + folder path. `/tail` returns the last 10 output lines of the current target; `/tail 20` returns 20.
7. **AC-07** — A message from a `user_id` not on the allowlist is dropped by the **first** middleware, before any routing/parsing; no send occurs and the rejection is debug-logged.
8. **AC-08** — The bridge registers descriptor `pij-telegram` (`harness:"pi"`, `lifecycle:"bound"`, fixed id) and a running daemon does **not** attempt to pane-inject or drain it; the bridge drains the inbox itself via `FsChannel.watch`.
9. **AC-09** — Starting a second `pij telegram start` while one runs is refused with a clear single-instance message (lockfile), and a Telegram 409 causes a clean logged exit, not a silent poll-fight. `SIGINT`/`SIGTERM` shuts the bot down gracefully and clears the lock.
10. **AC-10** — Loading `.env` does not alter the environment seen by pij session resolution: `dotenv` is read **only** inside the `pij telegram` process and never at global/module scope, so `PIJ_SESSION_ID` / `TMUX_PANE` / `PIJ_*` inheritance is unaffected.
11. **AC-11** (outbound media) — An agent running `pij send pij-telegram --file <path> [--caption "<text>"]` causes that local file to arrive in the operator's Telegram chat, sent with the **type-appropriate** method (image → `sendPhoto`, gif/short-mp4 → `sendAnimation`, anything else → `sendDocument`) and the caption attached. Any accompanying text body is still forwarded. A file over Telegram's upload cap (10 MB photo / 50 MB other) does **not** crash the forwarder — it falls back to a clear text notice naming the file + size.
12. **AC-12** (inbound media) — An allowlisted operator sending a photo / gif / document to the bot causes the bridge to **download** it **into the target session's own pij data dir** (`<descriptor.dataDir>/attachments/`, i.e. `~/.pij/<sessionId>/attachments/<safe-name>`) and deliver that session a **text** message carrying the saved path + caption + mime/size, so the agent can **choose** to open the file. Storing the file *with the session* makes it ephemeral by construction: it is swept away whenever that session is tidied (a future boot-time cleanup, e.g. keep-last-N sessions — out of scope here, but this layout is what makes it free). The caption is treated as the addressing text (same first-token rules); no caption ⇒ sticky target; **no resolvable target ⇒ guidance reply and no download** (nowhere to file it). The allowlist still gates inbound media (dropped before download). A file over the 20 MB download cap is **not** fetched — the operator gets a clear "too big" reply.
13. **AC-13** (media stays text-on-the-wire + safe) — The pij transport `body` stays text end-to-end: media rides as **path/reference metadata**, never bytes. Inbound filenames are **sanitized** (no path traversal; the saved path is always inside the resolved session's `attachments/` dir, which lives under `PIJ_HOME`, outside the repo). The bridge is the **only** component that calls Telegram's upload/download API; sessions and the daemon only ever see text + paths.

### Risks & Assumptions
- **Open bot = RCE-by-proxy** — the allowlist is the *only* access control; it must gate the first handler and fail closed.
- **Implicit addressing collision** — first-token-as-address misroutes if a plain message happens to start with a live token (see Open Questions; mitigated by validate-exists + sticky fallback + logging, not eliminated).
- **Assumption** — a single operator and a single bridge instance per token.

### Open Questions
- **Addressing syntax**: the risk scout recommends an explicit `@<tok>` prefix to remove the first-token collision risk; the operator chose implicit first-token matching with sticky fallback. Plan honors the implicit choice + mitigations. Revisit (workshop) if misroutes show up in use.

### Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| Addressing grammar | CLI Flow | Implicit first-token vs explicit `@tok` prefix trades typing-ease for collision-safety | Should an explicit prefix be opt-in? How to disambiguate multi-match beyond "most-recently-active"? |

### Clarifications
#### Session 2026-06-29
- **Workflow Mode** → **Full** (multi-phase; daemon touch + distinct inbound/outbound seams warrant per-phase review).
- **Testing Strategy** → **Hybrid** (TDD for pure units; lightweight for I/O glue).
- **Mock Usage** → **Targeted** (mock Telegram API + fs inbox; real data for pure units).
- **Documentation** → **Hybrid** (README quickstart + `docs/how/pij-telegram.md`).
- **Reply model** (operator, this session) → agent-initiated via `pij send pij-telegram`, not transcript tailing.
- **Addressing** (operator) → per-message first-token match (strip `pij-`, partial, first-wins) with sticky fallback to most-recent.

#### Session 2026-06-30 (Phase 5 — media relay)
- **Scope** (operator) → both directions (agent→chat *and* operator→session) in one phase; they share the type-detect + size-cap + scoped-store guts.
- **Feasibility** → researched: grammY supports `sendPhoto`/`sendAnimation`/`sendDocument` via `InputFile` (10 MB photo / 50 MB other upload caps) and inbound download via the `@grammyjs/files` plugin (20 MB cloud-API download cap); >caps would need a self-hosted Bot API server — **out of scope**, enforce caps instead.
- **Design** → reference-passing: `body` stays text; `attachments` carries paths; `pij send --file/--caption` is the outbound affordance.
- **Inbound storage** (operator) → saved **with the target session**, in `<sessionDataDir>/attachments/` (`~/.pij/<id>/attachments/`), so it's ephemeral and gets reclaimed by a **future** boot-time session tidy (keep-last-N, e.g. 50 — out of scope for this phase, but the layout is chosen to make it free); the agent gets a text path and **chooses** whether to read it.
- **Addressing inbound media** → the caption is the addressing text (same first-token rules); no caption ⇒ sticky; no resolvable target ⇒ guidance + no download.
- **Single phase** (operator) → all media work lands in one Phase 5, not split.

## Planning Seam
_Refinement opportunities still open — recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: Addressing grammar (implicit vs explicit `@` prefix).

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| research-dossier.md | n | research done in-conversation + 2 code scouts; folded into Research Context + Key Findings |
| workshops/*.md | n | none yet |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | Round 1 answered; no critical NEEDS CLARIFICATION (addressing syntax is an Open Question, operator already decided) |
| G2 | Constitution | N/A | No `docs/project-rules/constitution.md` (only agent-harness.md / harness.md) |
| G3 | Architecture | N/A | No `docs/project-rules/architecture.md` |
| G4 | ADR Compliance | N/A | No `docs/adr/` |
| G5 | Structure | PASS | All required sections present |
| G6 | Testing Alignment | PASS | Hybrid; pure units test-first, each phase carries validation |
| G7 | Domain Completeness | PASS | Domains mapped (no NEW domain → no setup task); manifest covers all phase files |

### Summary
Build a thin grammY long-polling bridge that registers as the fixed-id pij peer `pij-telegram`. Phase 1 lays pure, tested foundations (address matcher, scoped config/allowlist, chunker) and the `pij telegram` bin verb. Phase 2 wires inbound Telegram→session relay behind an allowlist-first gate plus `/list`. Phase 3 closes the loop: register the self-draining peer, forward agent replies (chunked) to Telegram, add `/tail`, and make the process single-instance + crash-safe. Phase 4 delivers the `pij telegram init` onboarding and the docs.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `.pi/extensions/pij/telegram/match.ts` | pij-control-plane | internal | Address-token → session resolution (pure) |
| `.pi/extensions/pij/telegram/match.test.ts` | pij-control-plane | internal | TDD for matcher |
| `.pi/extensions/pij/telegram/config.ts` | pij-control-plane | internal | Scoped `.env` load + allowlist parse/validate (pure) |
| `.pi/extensions/pij/telegram/config.test.ts` | pij-control-plane | internal | TDD for config |
| `.pi/extensions/pij/telegram/chunk.ts` | pij-control-plane | internal | 4096-char message splitter (pure) |
| `.pi/extensions/pij/telegram/chunk.test.ts` | pij-control-plane | internal | TDD for chunker |
| `.pi/extensions/pij/telegram/bridge.ts` | pij-control-plane | internal | grammY bot, allowlist middleware, inbound relay, inbox-watch forwarder |
| `.pi/extensions/pij/telegram/commands.ts` | pij-control-plane | internal | `/list`, `/tail` handlers |
| `.pi/extensions/pij/telegram/init.ts` | pij-control-plane | internal | `pij telegram init` onboarding |
| `.pi/extensions/pij/telegram/index.ts` | pij-control-plane | internal | start/stop entry, lockfile, signal handling |
| `.pi/extensions/pij/cli.ts` | pij-control-plane | contract | Add bin-level `telegram` verb intercept (start/init/stop) |
| `package.json` | _platform | cross-domain | Add `grammy`, `dotenv` deps |
| `.env.example` | _platform | internal | Documented key template |
| `README.md` | _platform | internal | Onboarding quickstart |
| `docs/how/pij-telegram.md` | _platform | internal | Operating + security guide |

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | **Bridge must self-drain.** A `harness:"pi"` peer routes to `{kind:"observe"}` (`router.ts:37`); the daemon never drains it, and a no-paneId descriptor never reaches `bound` via the binding machine (`loop.ts:136`, `daemon.ts:91`). | Register `pij-telegram` with `harness:"pi"`, `lifecycle:"bound"` (set directly), and run `FsChannel.watch("pij-telegram", …)` like the pi in-process receiver (`index.ts:271`). Do not rely on the daemon. |
| 02 | Critical | **Allowlist is the only access control** — open bot = RCE-by-proxy into agents. | Allowlist check as the **first** grammY middleware (`bot.use`), before any routing/parsing; drop + debug-log non-allowlisted `from.id`. Validate ids are numeric at startup + in `init`. |
| 03 | Critical | **`.env` global load corrupts pij env contract** — `PIJ_SESSION_ID`/`TMUX_PANE`/`PIJ_*` shadow inherited values and leak to spawned children (`index.ts:43,255`; `discovery.ts:77`). | Load `dotenv` **only inside the `pij telegram` process**, path-scoped, never at module top-level/global. Validate required keys present, fail closed. |
| 04 | Critical | **Telegram 409 on dual pollers / no single-instance guard** — bridge is a bare foreground process (unlike the daemon's lock at `daemon.ts:296`). | Lockfile `~/.pij/pij-telegram.lock` (write on start, validate on next start, clear on clean exit); graceful `SIGINT/SIGTERM → bot.stop()`; 409 handler logs + exits; `pij telegram stop`. |
| 05 | High | **Delivery is pure-fs, CLI-side.** `pij send pij-telegram` writes the inbox file via `FsChannel.deliver` (`channel.ts:43`) regardless of the daemon. | Outbound works even with no daemon. Inbound relay can use the same `FsChannel.deliver`/`dispatch send` path; no daemon dependency for the bridge's own delivery. |
| 06 | High | **Name-match has no existing helper + undefined ordering.** `registry.list()` order is undefined; `discovery.resolveSelf` resolves *self*, not a target (`discovery.ts:77`). | New matcher: strip `pij-`, prefix/substring match against live ids, sort matches by **`descriptor.lastEventAt` newest-first (fallback `startedAt`)** for deterministic first-wins, validate the chosen session exists before routing, debug-log resolution + sticky fallback. |
| 07 | High | **4096-char Telegram limit** — long agent replies truncate/reject silently. | Pure chunker splits >~4000 chars into numbered parts (`(1/n)…`); full output remains reachable via `/tail`. |

### Phases

#### Phase Index

| Phase | Title | Primary Domain | Objective (1 line) | Depends On |
|-------|-------|---------------|-------------------|------------|
| 1 | Foundation: matcher, config, chunker, CLI skeleton | pij-control-plane | Pure, tested building blocks + the `pij telegram` bin verb | None |
| 2 | Inbound relay + allowlist + `/list` | pij-control-plane | Telegram→session delivery behind an allowlist-first gate | Phase 1 |
| 3 | Outbound peer + self-drain + `/tail` + single-instance | pij-control-plane | Agent replies → Telegram, crash-safe single instance | Phase 1, Phase 2 |
| 4 | Onboarding (`pij telegram init`) + docs | _platform | One-pass setup + README/how docs | Phase 2, Phase 3 |
| 5 | Media relay — attachments in + out (images / gifs / files) | pij-control-plane / _platform | Agents send files to the chat; operator sends media to a session (reference-passing) | Phase 2, Phase 3 |

#### Phase 1: Foundation — matcher, config, chunker, CLI skeleton
**Objective**: Land the pure, fully-tested units and the bin verb scaffold so later phases only wire I/O.
**Domain**: pij-control-plane
**Delivers**: `match.ts`, `config.ts`, `chunk.ts` (+ tests); `telegram` bin verb parsing `start|init|stop`; `grammy`+`dotenv` deps added.
**Depends on**: None
**Key risks**: Matcher ordering must be deterministic (Finding 06).

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1.1 | Add `grammy` + `dotenv` to `package.json`; `npm install`; confirm `tsx` import works | _platform | Both import in a tsx scratch; lockfile updated | |
| 1.2 | TDD `match.ts`: `resolveTarget(token, sessions[]) → {id} | null` — strip `pij-`, prefix/substring match, **sort by `descriptor.lastEventAt` newest-first (fallback `startedAt`)**, first-wins | pij-control-plane | `match.test.ts` covers: exact, partial, multi-match ordering (by `lastEventAt`), no-match→null, empty token | Per Finding 06 |
| 1.3 | TDD `chunk.ts`: `chunk(text, limit=4000) → string[]` numbered `(i/n)` when n>1 | pij-control-plane | `chunk.test.ts`: under-limit (1 part, no prefix), over-limit boundary, multi-part numbering | Per Finding 07 |
| 1.4 | TDD `config.ts`: scoped `loadConfig(path) → {token, allowedUserIds:number[], chatId?}` — parse `.env`, validate token non-empty + ids numeric, fail closed; **never** touch global `process.env` | pij-control-plane | `config.test.ts`: valid load, missing token→error, non-numeric id→error, isolation (no global mutation) | Per Finding 03 |
| 1.5 | Add bin-level `telegram` verb in `cli.ts` (intercept like spawn/adopt) routing `start|init|stop` to stubs | pij-control-plane | `pij telegram` prints subcommand help; `start/init/stop` reach stub functions | Per scout: `cli.ts:867` |

#### Phase 2: Inbound relay + allowlist + `/list`
**Objective**: An allowlisted operator can address a session and deliver text; `/list` shows sessions.
**Domain**: pij-control-plane
**Delivers**: `bridge.ts` (grammY bot + allowlist-first middleware + text relay + sticky target), `commands.ts` `/list`.
**Depends on**: Phase 1
**Key risks**: Allowlist must precede all routing (Finding 02).

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.1 | `bridge.ts`: construct grammY `Bot` from config; register allowlist as the **first** `bot.use` middleware (drop + debug-log non-allowlisted `from.id`) | pij-control-plane | Mocked update from a non-allowlisted id never reaches the text handler (AC-07) | Per Finding 02 |
| 2.2 | Text handler: split first token → `resolveTarget`; match → deliver `rest` via `FsChannel.deliver`/`dispatch send`, set sticky target; no match → deliver full text to sticky target; no sticky → guidance reply | pij-control-plane | Mocked tests for AC-02, AC-03, AC-04; inbox file asserted | Per Findings 05/06 |
| 2.3 | In-memory sticky-target store (per chat); debug-log every resolution + fallback | pij-control-plane | Most-recent target persists across messages within a run | |
| 2.4 | `commands.ts` `/list`: `FsRegistry.list()` → newest 10 → reply id + folder | pij-control-plane | `/list` reply lists ≤10 sessions w/ paths (AC-06 part) | |
| 2.5 | Lightweight validation: run the bot against a mocked `Bot`/`api`; assert deliveries | pij-control-plane | Inbound suite green | Targeted mocks |

#### Phase 3: Outbound peer + self-drain + `/tail` + single-instance
**Objective**: Agent replies reach Telegram; the process is a safe, single self-draining peer.
**Run model**: `pij telegram start` runs as a **foreground** process; the operator backgrounds it (`pij telegram start &`) or uses a process manager — it does **not** self-daemonize like the pij daemon.
**Domain**: pij-control-plane
**Delivers**: peer descriptor registration; `FsChannel.watch` forwarder (chunked); `/tail [N]`; lockfile + graceful shutdown + 409 handling; `pij telegram stop`.
**Depends on**: Phase 1, Phase 2
**Key risks**: descriptor shape (Finding 01); single-instance (Finding 04).

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 3.1 | Register `pij-telegram` descriptor via `FsRegistry.write` (`harness:"pi"`, `lifecycle:"bound"`, fixed id, pid, dataDir/eventsPath) on `start` | pij-control-plane | Descriptor present; a running daemon does not pane-inject/drain it (AC-08) | Per Finding 01 |
| 3.2 | `FsChannel.watch("pij-telegram", onMsg)`: forward `msg.body` to `chatId` via `chunk()` | pij-control-plane | `pij send pij-telegram "<long>"` arrives chunked, untruncated (AC-05) | Findings 01/07 |
| 3.3 | `commands.ts` `/tail [N]`: `FsEventLog` read last N output events of sticky target (default 10); **no sticky target → same guidance reply as 2.2** | pij-control-plane | `/tail`→10, `/tail 20`→20; no-target→guidance (AC-06 part) | |
| 3.4 | `index.ts`: lockfile `~/.pij/pij-telegram.lock`. **On start: if the lock exists, read its PID — dead → remove the stale lock and continue; alive → refuse with a `pij telegram stop` hint.** Clear the lock on clean exit. `SIGINT/SIGTERM → bot.stop()` + clear lock + remove descriptor; 409 handler logs + exits | pij-control-plane | Second `start` (live PID) refused; stale lock auto-cleaned; clean shutdown; 409 exits (AC-09) | Per Finding 04; mirrors daemon stale-lock reclaim |
| 3.5 | `pij telegram stop`: signal the running instance / clear stale lock | pij-control-plane | `stop` ends a running bridge, releases the lock | |

#### Phase 4: Onboarding (`pij telegram init`) + docs
**Objective**: Zero-to-running in one guided pass, fully documented.
**Domain**: _platform
**Delivers**: `init.ts`, `.env.example`, README quickstart, `docs/how/pij-telegram.md`.
**Depends on**: Phase 2, Phase 3
**Key risks**: must not clobber existing `.env` keys (AC-01).

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 4.1 | `init.ts`: prompt BotFather steps; read token; validate via `getMe`; print bot @handle | _platform | Invalid token rejected with a clear message; valid token shows handle | |
| 4.2 | Capture operator identity: long-poll for the first inbound message; record `from.id` + `chat.id` | _platform | First message locks the allowlist to that id automatically | AC-01 |
| 4.3 | Write/merge `.env` (preserve other keys); create `.env.example`; ensure `.gitignore` covers `.env` (already does) | _platform | `.env` has the 3 keys; pre-existing keys untouched (AC-01) | |
| 4.4 | README quickstart (`pij telegram init` + keys) | _platform | Quickstart runs end-to-end as written | |
| 4.5 | `docs/how/pij-telegram.md`: addressing rules, sticky fallback, `/list` + `/tail`, the `pij send pij-telegram` reply contract, security model (allowlist = only control), single-instance operation | _platform | Guide covers all of the above | |
| 4.6 | Add a history note to `docs/domains/pij-control-plane/domain.md` (bridge peer) | pij-control-plane | One-line note recorded | Light; no contract change |

#### Phase 5: Media relay — attachments in + out (images / gifs / files)
**Objective**: Carry media **both ways** without ever putting bytes on the pij wire — agents attach a local file to a reply; the operator sends a photo/gif/document to a session. Reference-passing: files live on disk, only **paths + metadata** flow through the text `body`; the bridge is the sole component touching Telegram's upload/download API.
**Design (the load-bearing decisions)**:
- **Transport (minimal, additive)**: `PijMessage` gains an optional `attachments?: Array<{ path: string; caption?: string }>`. Existing text messages are unchanged; only the telegram forwarder acts on `attachments` (other peers ignore it). The `FsChannel` JSON frame already round-trips arbitrary fields, so this is backward-compatible.
- **Outbound affordance**: `pij send <id> --file <path> [--caption "<text>"]` (the `<text>` positional body stays optional) attaches one file. CLI parse → `attachments:[{path,caption}]` on the delivered message. This is the one **core** touch (`cli.ts` send parsing + the message type); everything else is in the telegram module.
- **Outbound send**: the forwarder, on a message with `attachments`, classifies each file by extension (`classifyMedia` — pure: jpg/jpeg/png/webp→`photo`; gif/mp4→`animation`; else→`document`) and calls the matching grammY method with `InputFile(path)` + caption, serialized through the **same** ordered queue as text. Oversize (pure `withinUploadLimit(bytes, kind)`: 10 MB photo / 50 MB other) ⇒ a text-notice fallback, never a throw.
- **Inbound**: register `bot.on(["message:photo","message:animation","message:document"])` **after** the allowlist + commands. Resolve the target **first** (caption-as-address via `routeMessage`; no caption ⇒ sticky; **no target ⇒ guidance + no download**). Use the official `@grammyjs/files` plugin (`hydrateFiles`) → `file.download(dest)`. Pre-check `file_size` against `withinDownloadLimit` (20 MB) — over ⇒ "too big" reply, no fetch. Save **into the resolved session's own data dir**: `<descriptor.dataDir>/attachments/<safeMediaName>` (pure `safeMediaName` strips path separators / traversal). Storing media *with the session* makes it ephemeral by construction — a future boot-time session tidy (keep-last-N) reclaims it with the session, no separate GC. Deliver a pure-built text descriptor (`buildInboundNotice(path, caption, mime, size)`) to that session so the agent can **choose** to open the file.
- **Deps**: add `@grammyjs/files`.
**Domain**: pij-control-plane (bridge + transport) / _platform (CLI flag, dep, docs).
**Delivers**: `media.ts` (pure: `classifyMedia`, `withinUploadLimit`, `withinDownloadLimit`, `safeMediaName`, `buildInboundNotice`) + tests; outbound media path in `bridge.ts startForwarder`; inbound media handlers in `bridge.ts createBot`; `--file`/`--caption` on `pij send` (in **`core/cli.ts`** — the send parser + message build live there, not `cli.ts`) + `attachments` on `PijMessage`; how-doc + README updates; `@grammyjs/files` dep.
**Depends on**: Phase 2 (relay + allowlist + routeMessage/sticky), Phase 3 (forwarder + descriptor).
**Key risks**: don't break the text-only `body` contract (Finding 03 spirit) — media is metadata, not bytes; allowlist must still gate inbound media (Finding 02); size caps + filename sanitize are the inbound trust boundary.
**Testing** (Hybrid): pure units in `media.ts` are TDD'd and mutation-checked (Dim-0 anchors); outbound media via a fake `Bot.api` transformer capturing `sendPhoto`/`sendDocument` + a real temp file; inbound via fake photo/document updates + an **injected downloader seam** (no network), asserting the delivered text body carries the saved path; CLI `--file` parse via a unit over the arg parser.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 5.1 | Add `@grammyjs/files` to `package.json`; `npm install`; confirm it imports under tsx | _platform | Dep resolves; lockfile updated | mirrors 1.1 |
| 5.2 | TDD `media.ts` pure units: `classifyMedia(path)`, `withinUploadLimit(bytes,kind)`, `withinDownloadLimit(bytes)`, `safeMediaName(raw)`, `buildInboundNotice(...)` | pij-control-plane | `media.test.ts`: photo/anim/doc classification incl. case + unknown ext→document; cap boundaries (just-under/just-over each limit); traversal names (`../`, abs, empty)→safe; notice contains path+caption+mime+size | The Dim-0 anchors — make each non-vacuous |
| 5.3 | `PijMessage` gains optional `attachments?: {path, caption?}[]`; `pij send` learns `--file <path>` + `--caption <text>` (parse → attachments) | pij-control-plane / _platform | `pij send id --file p --caption c` builds a message with one attachment; plain text sends unchanged (no `attachments` key) | One core touch — keep scoped |
| 5.4 | Outbound: `startForwarder` handles `attachments` — classify → `sendPhoto`/`sendAnimation`/`sendDocument` via `InputFile` + caption, in the existing send queue; oversize → text-notice fallback; still forward any text body | pij-control-plane | Fake-api test: a `.png`→`sendPhoto`, `.gif`→`sendAnimation`, `.pdf`→`sendDocument`, each with caption; oversize→`sendMessage` notice, no throw (AC-11) | Reuse the chunk/queue plumbing |
| 5.5 | Inbound: allowlist-gated `message:photo|animation|document` handlers; `@grammyjs/files` download to scoped store (size-cap pre-check); caption-as-address routing; deliver `buildInboundNotice` text to the target | pij-control-plane | Injected-downloader tests: photo+caption `osn look` → file saved under media/inbound, session gets a text body with the path; no caption → sticky; over-cap → "too big" reply, no download; non-allowlisted media dropped (AC-12) | Downloader injected — no network |
| 5.6 | Docs: how-doc "Attachments" section (both directions, size caps, scoped store) + README one-liner; domain-doc history note | _platform / pij-control-plane | Guide documents `--file`/`--caption`, inbound media behavior, caps; note recorded | Light |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-11 | 5.2, 5.3, 5.4 | `classifyMedia`/cap units + fake-api outbound media test |
| AC-12 | 5.2, 5.5 | sanitize/notice units + injected-downloader inbound test |
| AC-13 | 5.2, 5.4, 5.5 | text-body-only assertions + scoped-path/sanitize units |
| AC-01 | 4.1, 4.2, 4.3 | init writes/merges `.env`, captures id |
| AC-02 | 1.2, 2.2 | matcher + relay tests (inbox asserted) |
| AC-03 | 2.2, 2.3 | sticky fallback test |
| AC-04 | 1.2 | matcher multi-match ordering test |
| AC-05 | 1.3, 3.2 | chunker test + watch-forward |
| AC-06 | 2.4, 3.3 | `/list`, `/tail [N]` |
| AC-07 | 2.1 | allowlist-first middleware test |
| AC-08 | 3.1 | descriptor + daemon-skip check |
| AC-09 | 3.4, 3.5 | lockfile + shutdown + 409 |
| AC-10 | 1.4 | config isolation test |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Open bot → agent RCE | Med | Critical | Allowlist-first middleware, fail closed, numeric-id validation (Finding 02) |
| `.env` corrupts pij env contract | Med | Critical | dotenv only inside the telegram process, path-scoped (Finding 03) |
| Telegram 409 / dual instance | Med | High | Lockfile + graceful shutdown + 409 handler (Finding 04) |
| Media bytes leak onto the pij wire / into the repo | Low | High | Reference-passing only — `body` stays text, files live under `PIJ_HOME` (outside the repo), filenames sanitized, bridge is sole Telegram-API caller (AC-13) |
| Oversize file crashes the bridge | Med | Med | Pure size-cap guards pre-check before any upload/download; over-cap → text notice, never a throw (AC-11/12) |
| Misroute via first-token collision | Med | Med | Validate session exists + sticky fallback + debug logging; explicit-`@` option recorded (Findings 06, Open Questions) |
| Long reply truncated | High | Med | Pure chunker, `/tail` for full output (Finding 07) |
| Daemon errors on no-paneId peer | Low | High | `harness:"pi"` routes to observe; bridge self-drains (Finding 01) |
