> **Handoff.** This issue carries, verbatim, the specification `docs/specs/claude-copilot-sqlite-sockets-comms.md` from https://github.com/vaughanknight/pij at commit `0e7adee9` (merged 2026-08-27). It is written to be read cold: how one terminal AI agent (Claude Code / GitHub Copilot CLI / Codex / pi) messages another through a SQLite WAL queue and per-harness sockets, why keystroke injection was abandoned, what was measured, every trap hit, and what is still open. The spec is 17 sections plus a source index; GitHub caps an issue body at 65,536 characters, so **sections 0–11 are below and sections 12–17 + Appendix A are in the first comment** — read both. Every `file:line` cites `main@ed20a68`; the source tree at `0e7adee9` is anchor-identical for the cited files.
>
> **Where to start:** §1 (the failure this replaces), §2 (architecture), §4 (state machine), §7 (transports + exact wire frames), §13 (gotchas), §14 (outstanding work — pick from there).

---

# Claude + Copilot agent messaging over a SQLite queue and per-harness sockets — handoff specification

**As of**: `main` @ `ed20a68` (2026-08-28). Every `file:line` in this document was checked against that commit; if you are reading a later tree, run `git blame -L <line>,+1 <file> ed20a68` before trusting a number.
**Repository**: `pij` (the peer-messaging fabric for terminal AI agents — Claude Code, GitHub Copilot CLI, OpenAI Codex CLI, and the `pi` harness — running in tmux panes on one machine).
**Audience**: an engineer (human or agent) who has never seen this codebase and needs to own, extend, or debug the message path described here. Nothing outside this document is required reading; everything in it is cross-referenced to source so you can verify it.
**Scope**: exactly one subsystem — how a message sent by one agent reaches another agent's model *without* being typed as keystrokes into a terminal, why that was necessary, how the durable queue underneath it works, what was measured, what went wrong along the way, and what is still open.

---

## 0. Conventions

- `EXT/` = `.pi/extensions/pij/` (the extension source tree; every `core/`, `adapters/`, `daemon.ts`, `index.ts`, `telegram/` path below lives under it unless it starts with `docs/`, `reports/`, `skills/`, or `harness/`).
- `PIJ_HOME` = `~/.pij` unless the env var `PIJ_HOME` overrides it. Per-seat state is `PIJ_HOME/<seat-id>/…`; the queue is `PIJ_HOME/queue/pij.sqlite`.
- A **seat** is one registered agent session: a JSON *descriptor* at `PIJ_HOME/<id>.json` (`SessionDescriptor`, `EXT/core/types.ts:175`) recording `harness` (`claude | copilot | codex | pi`, `:243`), `paneId` (tmux `%N`, `:229`), `pid`, `harnessSessionId` (`:252`), `rpcPort` (`:256`), `deliveryMode` (`push | pull`, `:248`), `lifecycle` (`pending | ready | bound | failed | dissolved`, `:274`).
- The **daemon** is one machine-wide Node process (`EXT/daemon.ts`) that ticks every ~600 ms, watches every tmux pane it owns, binds new seats, and delivers queued mail to tmux-bound seats. It is the *only* process that types into panes or writes to harness sockets.
- The **CLI** is `pij` (`EXT/core/cli.ts`, installed by `npm link` from the main checkout). Agents call it from their shell tool: `pij send`, `pij inbox`, `pij queue`, `pij tail`.
- "**Body**" is the raw text a sender passes to `pij send`. "**Framed body**" is `[pij from <sender-id>] <body>` — the form every recipient's model actually sees (`frame()`, `EXT/core/message.ts:11-13`; `parseFrame()`, `:16-23`).
- Sizes are bytes unless stated. Timings are wall-clock on a Mac Studio (Apple silicon), macOS Darwin 25.6, Node 26.3.1, tmux 3.6a, Claude Code 2.1.247, Copilot CLI 1.0.81.

---

## 1. Why this exists — the failure it replaces

Before 2026-08-27 the transport was: `pij send` wrote a JSON file `PIJ_HOME/<to>/inbox/msg-<id>.json`; the daemon's tick read it and typed the **whole framed body** into the recipient's tmux pane with a single `tmux send-keys -l <text>`, waited a per-harness settle, pressed Enter, and confirmed submission by checking the pane's composer for the *tail* of what it typed. That path is still in the tree (the `fs` backend and the body-typing branch, §7.4) and it fails in three distinct ways, all measured live:

1. **pty clipping (deterministic, Claude Code ≥ 2.1.246).** The macOS pty line discipline hands one large write to the reader in **1022-byte chunks** (BSD `TTYHOG`−2; a 3000-byte write is read as `[1022, 1022, 956]`). Claude Code's composer classifies each stdin chunk independently: a chunk ≥ ~800 chars becomes a `[Pasted text #N]` pill, but a **short multi-line tail chunk arriving inside the paste-coalesce window replaces the composer content** instead of appending. Result: any multi-line framed body > 1022 B whose last chunk is short (< ~607–836 chars) arrives as **only the tail** — the `[pij from …]` prefix and the head are gone, so the recipient sees an unframed fragment like `not clean.` indistinguishable from a human typing. Reproduced 8/8; 42/42 intact on Claude Code 2.1.241, 19/19 clipped on 2.1.246. Copilot CLI is not affected (812/812 intact). Full repro matrix: `reports/pij-comms-review-2026-08-27.md` §2.
2. **The clip is invisible to the sender.** The daemon's submit oracle (`composerHasTextTail`, `EXT/adapters/daemon-tmux.ts:150-154`) matches the tail — exactly the part that survives — so it reports `confirmed`, marks the message read, and the sender's receipt says delivered.
3. **At-most-once loss paths in the typed path.** An `unverified` outcome ("typed but Enter never confirmed") consumed the durable copy because the payload *was* in the composer; if the composer was then cleared (Esc, `/clear`, auto-compact, app death) the message existed nowhere. 321/500 receipts on one day were `unverified`. Bodies > ~16 KB hit tmux's `MAX_IMSGSIZE` (`command too long`) and looped forever, blocking the recipient's FIFO. Mid-turn arrivals became `queued_command` attachments that `pij tail` could not render. Table of every path: report §3.

The design answer, all of which is now merged: **(a)** one SQLite WAL database is the queue, the receipts, and the audit trail; **(b)** a Claude seat receives the byte-exact body over the inbox Unix socket Claude Code ≥ 2.1.224 already binds; **(c)** a Copilot seat spawned with the hidden `--ui-server --port N` flag receives it over loopback JSON-RPC; **(d)** any seat with neither endpoint gets **one short ASCII pointer line** typed into its pane and pulls the body with `pij inbox`; **(e)** long-lived in-process consumers (the `pi` harness receiver, the Telegram bridge) claim from the same queue with a generic at-least-once consumer. Under the default `sqlite` backend (and `dual`) a body is never typed into a Claude or Copilot pane again; `PIJ_QUEUE_BACKEND=fs` is the explicit compatibility escape hatch that keeps the old typed path (§5, §7.4).

---

## 2. Architecture at a glance

```
                 ┌────────────────────────────────────────────────────────────────┐
  pij send ─────▶│  SqliteQueue  PIJ_HOME/queue/pij.sqlite  (WAL, synchronous=NORMAL) │◀──── pij inbox (ack by id)
  (any seat,     │  messages (immutable) · deliveries (state machine) · receipts   │◀──── pij queue (inspect/retire)
   any process)  │  (append-only) · cursors                                        │
                 └───────────────┬────────────────────────────────┬───────────────┘
                                 │ daemon tick (~600 ms):          │ startQueueConsumer (500 ms poll)
                                 │ recoverStaleClaims → listQueued │ claim → handler → ack
                                 ▼                                 ▼
                    drainTmuxInbox (per bound tmux seat)     ┌─────────────────────┐
                    ┌──────────────────────────────────┐     │ pi in-process       │→ pi.sendUserMessage
                    │ claude  → inbox socket  (§7.1)    │     │ receiver (index.ts) │
                    │ copilot+rpcPort → JSON-RPC (§7.2) │     ├─────────────────────┤
                    │ else    → pointer line  (§7.3)    │     │ Telegram bridge     │→ Telegram Bot API
                    │ command → typed raw     (§7.4)    │     │ (telegram/bridge.ts)│
                    └──────────────────────────────────┘     └─────────────────────┘
```

Ownership rules that everything else depends on:

- **Persist first.** `pij send` returns only after the row is committed (`SqliteQueue.deliver`, `EXT/adapters/sqlite-queue.ts:219-260`). Nothing downstream can lose a message that `pij send` reported.
- **The daemon delivers only to tmux-bound seats** (`harness ∈ {claude, copilot, codex}` with a `paneId`). It never touches a `pi` inbox or a pull-mode inbox (`docs/how/pij.md:61-73`; `EXT/core/daemon/router.ts:74-87`).
- **Exactly one process acts on a given recipient's rows at a time** — the daemon for tmux-bound seats (delivering straight from `queued`, no claim), a `startQueueConsumer` for pi/bridge seats (`claim()` under a lease). A crash or restart returns in-flight rows to `queued` (lease expiry for consumer claims and pointer leases; `resetClaimsOnStart` for claims).
- **The recipient's ack is the only thing that ends a delivery.** For socket/RPC deliveries the daemon acks on the transport's confirmation; for pointer deliveries the ack happens when the recipient runs `pij inbox`; for consumer-driven seats the consumer acks after its handler returns.

---

## 3. The store — `SqliteQueue`

File: `EXT/adapters/sqlite-queue.ts` (699 lines). Implements both port interfaces the rest of the system was already written against — `DeliveryPort` (send side) and `InboxPort` (read side), `EXT/core/ports.ts` — so `pij send`, `pij inbox`, and the daemon switched backends without changing their call sites.

### 3.1 Opening

```ts
// sqlite-queue.ts:178-188
this.dbPath = opts.dbPath ?? join(pijHome, "queue", "pij.sqlite");
this.db = new DatabaseSync(this.dbPath, { timeout: 5_000 });   // node:sqlite, built in — no native dep
this.db.exec("PRAGMA journal_mode=WAL");
this.db.exec("PRAGMA synchronous=NORMAL");
this.db.exec("PRAGMA foreign_keys=ON");
this.db.exec("PRAGMA busy_timeout=5000");
this.db.exec(SCHEMA);
```

- `node:sqlite` (`DatabaseSync`) is synchronous, ships with Node ≥ 22.13, and was already used elsewhere in the repo. No `better-sqlite3`, no prebuilt binaries.
- **WAL + `synchronous=NORMAL`**: readers never block the writer; a committed transaction survives any *process* crash; only an OS crash/power loss can lose the last few ms. That is the intended threat model (daemon/CLI crash, session revive), not power loss.
- `busy_timeout=5000` (and the constructor `timeout`) make a second writer *wait* instead of throwing `SQLITE_BUSY` — essential because the CLI (many processes) and the daemon write the same file.
- Every state change is one `BEGIN IMMEDIATE … COMMIT` transaction (`tx()`, `:199-209`), so the write lock is taken up front and the busy handler applies to the `BEGIN`.
- Local APFS only. SQLite's POSIX advisory locking and the WAL shared-memory index do not work over network filesystems; do not put `PIJ_HOME` on NFS/SMB.
- One `DatabaseSync` per process. Never open the `.sqlite` file with plain `fs` calls in a process that also holds a connection (POSIX `close()` cancels all advisory locks on the file for the whole process).

### 3.2 Schema (verbatim, `sqlite-queue.ts:93-131`)

```sql
CREATE TABLE IF NOT EXISTS messages (
  seq         INTEGER PRIMARY KEY,      -- global monotonic rowid; the ordering spine
  id          TEXT NOT NULL UNIQUE,     -- sender-minted idempotency key
  to_id       TEXT NOT NULL,
  from_id     TEXT NOT NULL,
  kind        TEXT,                     -- NULL (text) | 'receipt'
  command     TEXT,                     -- NULL | 'compact' | 'new' | 'reload'  (remote session-control)
  body        TEXT NOT NULL,
  attachments TEXT,                     -- JSON array of {path, caption?} — reference-passing, never bytes
  created_at  INTEGER NOT NULL          -- ms epoch
);
CREATE INDEX IF NOT EXISTS messages_to_seq ON messages(to_id, seq);

CREATE TABLE IF NOT EXISTS deliveries (   -- exactly one row per message; the mutable state
  seq         INTEGER PRIMARY KEY REFERENCES messages(seq),
  to_id       TEXT NOT NULL,
  state       TEXT NOT NULL,            -- queued|claimed|injected|acked|parked|retired
  attempt     INTEGER NOT NULL DEFAULT 0,
  claim_token TEXT,
  lease_until INTEGER,
  updated_at  INTEGER NOT NULL,
  last_error  TEXT
);
CREATE INDEX IF NOT EXISTS deliveries_ready ON deliveries(to_id, state, seq);

CREATE TABLE IF NOT EXISTS receipts (     -- append-only audit; what `pij queue` renders as the trail
  id      INTEGER PRIMARY KEY,
  seq     INTEGER NOT NULL REFERENCES messages(seq),
  state   TEXT NOT NULL,                -- queued|claimed|injected|released|redelivered|parked|acked|retired|requeued
  attempt INTEGER NOT NULL,
  at      INTEGER NOT NULL,
  detail  TEXT
);
CREATE INDEX IF NOT EXISTS receipts_seq ON receipts(seq, id);

CREATE TABLE IF NOT EXISTS cursors (      -- per-recipient pointer watermark (reserved; see §7.3)
  to_id        TEXT PRIMARY KEY,
  notified_seq INTEGER NOT NULL DEFAULT 0,
  updated_at   INTEGER NOT NULL
);
```

Design notes that are *not* obvious from the DDL:

- `messages` is **never updated after insert**. All mutation is in `deliveries`; all history is in `receipts`. Archive = keep `messages`, prune old `deliveries`/`receipts` by `seq` (not implemented; the file simply grows).
- Per-recipient ordering falls out of the global `seq` (rowid allocated by the single writer under the transaction) plus `ORDER BY m.seq` on every read.
- The original design (`reports/pij-comms-review-2026-08-27/c-durable-queue-design.md` §7) also had `not_before` (backoff) and `body_path` (large bodies on disk) columns and an `acked_seq` cursor. **None of those shipped.** Backoff is a fixed lease (§4.2), bodies are always inline, and `cursors.notified_seq` exists but the current pointer path does not use it (see §7.3).
- `CREATE … IF NOT EXISTS` is the only migration mechanism. There is no schema version table. Adding a column means an additive `ALTER TABLE` guarded the same way.

### 3.3 Message ids (idempotency)

`deliver()` mints `id = "<ms>-<000seq>-<pid>"` in the **sender's** process (`:224-226`) unless the caller passes one (the fs→sqlite importer does). The insert is `SELECT seq WHERE id=?` → skip if present → `INSERT` (`:227-256`), inside one transaction, so a retried `deliver()` with the same id is a no-op that still returns `ok({messageId})` (`test: sqlite-queue.test.ts:99`). The same id shape was used by the old fs backend, which is what makes the dual-write mirror (§5) dedupe correctly.

`kind`, `command`, and `attachments` round-trip through the row (`rowToMessage`, `:150-170`; test `:82`). A malformed `attachments` JSON degrades to "no attachments" rather than failing the read — the body is the contract.

---

## 4. The delivery state machine

```
 CONSUMER PATH — pi receiver / Telegram bridge via startQueueConsumer (§8)
 ─────────────────────────────────────────────────────────────────────────
              claim(to,{leaseMs,token})  [claimed, attempt+1]        handler ok → claimUnread()  [acked]
   queued ─────────────────────────────────▶ claimed ──────────────────────────────────────────▶ acked (terminal)
     ▲                                          │
     │  lease_until < now, attempt < 6          │  handler throws / ack fails → row STAYS claimed
     │  [redelivered]  (recoverStaleClaims)     │  until the daemon's lease sweep
     │  resetClaimsOnStart()  [redelivered]     │
     └──────────────────────────────────────────┘
                                                └── lease_until < now, attempt ≥ 6 ──▶ parked (open, stuck)  [parked]

 DAEMON PATH — tmux-bound seats via drainTmuxInbox (§6); the daemon NEVER calls claim(), attempt stays 0
 ────────────────────────────────────────────────────────────────────────────────────────────────────
   queued ──── socket / RPC confirmed → markRead()  [acked] ─────────────────────────────────────▶ acked (terminal)
     │
     │  pointer line typed → settle(seq,"injected",{leaseMs: 90_000})  [injected]
     ▼
   injected ──── recipient runs `pij inbox` → claimUnread()  [acked] ───────────────────────────▶ acked (terminal)
     │
     │  lease_until < now, attempt still 0 → queued  [redelivered]   (re-pointed next tick; never parks — G25)
     └──────────────────────────────────────────────────────────────▶ queued

 EITHER PATH
   claimed ── settle(seq,"queued")  [released] ──▶ queued            (release: held / failed, nothing landed)
   queued | claimed | injected | parked ── retire(filter, reason)  [retired] ──▶ retired (terminal)
   retired ── unretire(to, reason)  [requeued] ──▶ queued            (only rows whose latest retire reason matches)
```

**Two entry paths, one counter.** Consumer-driven recipients (§8) enter `claimed` through `claim()`, which is the **only** writer of `attempt`. The daemon (§6) never claims: it reads `queued` rows, delivers, and either acks directly (socket/RPC success) or `settle`s the row to `injected` under a lease (pointer). A daemon row therefore carries `attempt = 0` for its whole life, and the `attempt ≥ 6 → parked` branch of the sweep is reachable **only for consumer rows** (G25).

`DeliveryState = "queued" | "claimed" | "injected" | "acked" | "parked" | "retired"` (`sqlite-queue.ts:39`). Open states = `queued|claimed|injected|parked` (`:41`); terminal = `acked|retired` (`:42`). Every mutator has `WHERE … AND state NOT IN ('acked','retired')` so a late ack or a late lease sweep can never resurrect a terminal row (`tests: sqlite-queue.test.ts:202,258,283`).

### 4.1 Operations (all one transaction each)

| Method | Lines | What it does | Receipt written |
|---|---|---|---|
| `deliver(msg, {messageId?})` | 219-260 | Insert `messages` + `deliveries(state='queued', attempt=0)` | `queued` |
| `listUnread(to)` | 265-278 | Recipient view: rows in `queued|claimed|injected`, oldest first. **Includes** rows the daemon has claimed/injected — a pointer told the recipient to pull, so `pij inbox` must see them. | — |
| `listQueued(to)` | 284-292 | Daemon view: **only** `queued` rows (with `seq`). A row with a pointer out or a socket send in flight is not re-announced until its lease expires. | — |
| `claim(to, {leaseMs, token, maxAttempts?})` | 359-381 | Oldest `queued` row → `claimed`, `attempt+1`, `claim_token`, `lease_until = now+leaseMs`. Returns `ClaimedMessage` (message + `seq`, `attempt`) or `undefined`. | `claimed` (detail = token) |
| `settle(seq, "injected", {leaseMs})` | 385-405 | Delivery attempt made and the recipient was *told*: fresh lease, wait for ack. | `injected` |
| `settle(seq, "queued", {detail})` | 385-405 | Release: nothing landed (held/failed); back to `queued`, token cleared. | `released` |
| `claimUnread(to, id, marker)` / `markRead(...)` | 302-342, 344-353 | **Ack.** `state='acked'`, token/lease cleared, `WHERE state NOT IN ('acked','retired')`. Second call → `already-read`. | `acked` (detail `reader=<id>`) |
| `resetClaimsOnStart()` | 408-423 | Daemon boot: every `claimed` row → `queued` ("a claim without a live daemon is meaningless"). **Unscoped by token** — see gotcha G4. | `redelivered` (detail `daemon-restart`) |
| `recoverStaleClaims({maxAttempts=6})` | 427-447 | Lease sweep: `claimed|injected` rows with `lease_until < now` → `queued` (`attempt < 6`) or `parked` (`attempt ≥ 6`). Recipient-agnostic — one sweep covers every seat. | `redelivered` / `parked` (detail `lease-expired`) |
| `retire(filter, reason, {dryRun})` | 478-528 | Operator/daemon: open rows matching `{to, from, olderThanMs, state[]}` → `retired`. Terminal rows never match even if named in the filter. | `retired` (detail = reason) |
| `unretire({to, reason}, {detail})` | 533-561 | Only rows whose **latest** `retired` receipt has exactly that reason → `queued`, `attempt=0`. Used by seat revive for `recipient-closed` only. | `requeued` |
| `receipts(id)`, `summary({to, sinceSeq, limit})`, `count`, `maxSeq`, `stats(to)` | 449-456, 620-673, 675-698, 458-472 | Read-only views for `pij queue` / `pij send --wait`. | — |
| `importUnread(messages)` | 594-608 | fs→sqlite migration: insert each with its existing id, idempotent. | `queued` |
| `notifiedSeq(to)` / `setNotifiedSeq(to, seq)` | 575-588 | The `cursors` watermark. Present; not consulted by the current pointer path. | — |

### 4.2 Leases, attempts, parking

- **Daemon socket/pointer deliveries**: the daemon does not call `claim()`. It reads `listQueued`, attempts delivery, and on a *pointer* outcome calls `settle(seq, "injected", {leaseMs: POINTER_LEASE_MS})` where `POINTER_LEASE_MS = 90_000` (`EXT/core/daemon/loop.ts:51`); on a *socket/RPC* success it acks immediately via `markRead` (`EXT/daemon.ts:1248-1255`). A failed socket send leaves the row `queued` (nothing was claimed) and it is retried next tick. **Because the daemon never calls `claim()`, `attempt` stays 0 on every daemon-delivered row: lease expiry re-queues it (receipt `redelivered`) but `parked` is unreachable — a pointer row is re-announced every 90 s indefinitely (G25, §14 item 21).**
- **Consumer deliveries** (`startQueueConsumer`, §8): `claim()` with `leaseMs = 60_000` default, token `consumer-<pid>`.
- **Sweep**: the daemon calls `recoverStaleClaims()` at the top of every per-seat drain (`daemon.ts:1173`). There is no backoff schedule — a re-queued row is eligible on the very next tick; the "backoff" is the lease length itself. After 6 `claim()`s — consumer rows only; daemon rows never reach it (G25) — the row is `parked`: still open, visible in `pij queue`, never auto-retried; an operator can `pij queue retire` it or a later `unretire` path can requeue it.
- **Ack idempotence**: `ack()` returns `false` (→ `already-read`) when the row is already terminal (`:344-353`), so a duplicate ack from a recipient that ran `pij inbox` twice, or from the daemon after a revive, is absorbed (`test :59`).

### 4.3 Receipt vocabulary — two layers, do not confuse them

1. **Queue receipts** (`receipts.state`, above) — the durable trail per delivery. Rendered by `pij queue`.
2. **Sender receipts** (`ReceiptState = "queued" | "delivered" | "unverified"`, `EXT/core/types.ts:577`) — a *message* of `kind:"receipt"` sent back to the sender's inbox by the daemon (`emitSendReceipt`, `daemon.ts:1470`, called at `:1261` only for bound targets with a real outcome) or by the recipient's `pij inbox` (`send-delivered-receipt` action, `EXT/core/inbox.ts:249-253`). Body form `[pij receipt <messageId>] delivered` (`EXT/core/message.ts:38-40`). Receipt rows are never injected into a model; they are recorded as events and consumed silently (`daemon.ts:1184`; `inbox.ts:211-216`).

The pointer path emits **no** sender receipt at the moment of typing (the body has not been read); the `delivered` receipt arrives when the recipient's `pij inbox` acks (`docs/how/pij.md:101-106`).

---

## 5. Backend selection — `channel-factory.ts`

File: `EXT/adapters/channel-factory.ts` (151 lines).

| `PIJ_QUEUE_BACKEND` | Implementation | Behaviour |
|---|---|---|
| unset / `sqlite` (**default**, `DEFAULT_BACKEND`, `:44`) | `SqliteQueue` | Everything in this document. |
| `dual` | `DualWriteChannel(SqliteQueue, FsChannel)` (`:56-102`) | SQLite is the source of truth; every `deliver` **also** writes the legacy `msg-<id>.json` under the **same id** (`:66-77`), and every ack best-effort mirrors a legacy `read-<id>.json` marker (`:83-101`). Reads come from SQLite. Purpose: a mixed-version rollout where an old fs-only `pij inbox` still works. |
| `fs` | `FsChannel` (`EXT/adapters/channel.ts`) | The pre-2026-08-27 per-message JSON files and read markers; **no state machine, no pointer path, bodies are typed into panes**. Kept as the explicit compatibility escape hatch. |

- `openChannel(pijHome, env, opts)` (`:138-151`) is the constructor for every **live** channel — the daemon, `pij send`, `pij inbox`, the pi receiver, and the bridge all select the backend through it (`test: channel-factory.test.ts:34`). The deliberate exceptions construct both stores directly because they *are* the migration: `migrateFsInboxes` (`:123`) and the `pij queue migrate` verb (`EXT/cli.ts:595, :609`).
- `sqliteOf(channel)` (`:106-110`) returns the `SqliteQueue` behind either `sqlite` or `dual`, `undefined` for `fs`. **Every** daemon/consumer decision of the form "do we have a state machine?" must go through it, never `instanceof SqliteQueue` — see gotcha G3 for the bug this caused.
- `migrateFsInboxes(pijHome, sqlite, listSeatDirs)` (`:118-136`) runs on **every daemon start** when a SQLite backend is selected (`daemon.ts:1609-1624`): every unread fs inbox message is imported idempotently (`importUnread`), files left in place. Then `resetClaimsOnStart()` (`:1627-1628`) and a log line `queue backend: sqlite (<path>) — migrated N … — re-queued N in-flight message(s)`.
- `pij queue migrate [--dry-run] [--json]` exposes the same import for operators.

---

## 6. Daemon routing — from a queued row to a transport

Two layers: the impure per-seat drain in `EXT/daemon.ts` (which owns the store and the post-outcome bookkeeping) and the pure `drainTmuxInbox` in `EXT/core/daemon/loop.ts` (which owns the transport decision and is unit-tested with fakes).

### 6.1 Per-seat drain (`daemon.ts:1169-1270`)

Runs inside `deliverPass()` (`:899-…`), which drains **all bound seats concurrently** (`Promise.all`, `:913`) with a per-seat `draining` guard (`:255`, `:1125-1127`) so one seat's slow socket await never blocks another, while each seat's own messages stay strictly sequential.

```
sq = sqliteOf(this.channel)                       // :1172  (undefined on fs)
if (sq) sq.recoverStaleClaims()                   // :1173  lease sweep, all seats
listed = sq ? sq.listQueued(id) : listUnread(id)  // :1174  daemon acts only on `queued`
skip kind:"receipt" rows                          // :1184
coalesce duplicate pending watchdog pings         // :1185-1197 (a second pending ping from `pij-watchdog` is marked read immediately)
for each message (one at a time):
  refreshRenderedComposerHold(...)                // :1209-1213  human-typing guard (see §6.3)
  consumed = await drainTmuxInbox(target, [message], ports, buffer, undefined, holds,
                                  { pointer: sq !== undefined })         // :1214-1222
  if message.command === "compact" && delivered → stamp compactingAt, hold further drain   // :1227-1237
  for item in consumed:
    via === "pointer" → sq.settle(seq, "injected", {leaseMs: 90_000}); buffer.forget(id)   // :1239-1247  TOLD, not read
    else            → channel.markRead(id, ...) [= ack]; buffer.forget(id);                // :1248-1259
                      if bound && outcome → emitSendReceipt(to, from, id, outcome)          // :1260-1262
  if compactFired → stop this batch (rest stays durable)                                   // :1267
```

Key consequence: **`opts.pointer` is true iff the backend has a SQLite state machine.** Under `fs` the daemon has nowhere to park a "told but not read" row, so it falls back to typing the body (§7.4). That is the *only* backend-dependent branch in routing; socket/RPC delivery is backend-independent.

### 6.2 Transport decision (`loop.ts:632-737`)

```ts
const decision = route(target, msg);                     // router.ts:77-87: pi → observe; bound tmux → inject; unbound → buffer
// 1. Socket-first (loop.ts:657-674)
if (decision.kind === "inject"
    && (target.harness === "claude" || (target.harness === "copilot" && target.rpcPort !== undefined))
    && !m.command && ports.sendSocket) {
  outcome = await ports.sendSocket(target, {...msg, messageId})
  "confirmed" → consumed {via:"socket"}; continue
  "failed"    → buffer.enqueue (row stays queued); continue          // retried next tick
  "no-socket" → fall through                                          // e.g. claude with no session record
}
// 2. Pointer (loop.ts:680-689) — only when opts.pointer (sqlite/dual) and not a command
if (decision.kind === "inject" && opts.pointer && !m.command) {
  if (refreshRenderedComposerHold(...)) { buffer.enqueue; continue }  // human is typing → try later
  outcome = ports.sendText(paneId, pointerLine(from, 1), harness, pid, {kind:"pointer"})
  "gone" → continue (row stays queued; caller unbinds the seat)
  "held" | "failed" → buffer.enqueue; continue
  else → consumed {outcome, via:"pointer"}                            // "confirmed" or "unverified"
}
// 3. Body typing (loop.ts:690-723) — fs backend, or a `command` (`/compact` etc.) on any backend
...
```

- `route()` (`EXT/core/daemon/router.ts:77-87`) only decides *pane vs. not*; the harness/endpoint choice above is the socket-first gate. `injectionText()` (`:40`) renders a command as its raw slash form (`/compact`) and a text as the framed body.
- **Commands are always typed** (`!m.command` in both gates): Claude Code renders a socket-delivered `/compact` as plain text, not a command. `compactingAt` then holds the seat's drain until the pane reads ready again (`daemon.ts:1227-1237`; `router.ts:58-62`).
- The `SendBuffer` (`router.ts:99-176`) is an **in-memory ordering view only**. A buffered message is never marked read; on daemon restart the durable row is simply re-derived from the store. `buffer.forget(id)` after a real delivery prevents a later flush from double-injecting.
- `DrainedTmuxMessage.via` is `"socket" | "pointer" | undefined` (`loop.ts:566-572`); the daemon branches on it for settle-vs-ack.

The executable contract for this section is `EXT/core/daemon/loop.test.ts:1405-1513`, the `describe` whose name begins **`routing invariant — body on socket/RPC, pointer only where a pty can clip`** (the name carries a historical suffix after `clip`; grep the prefix), with four cases:

| Case (`it(...)`) | Line | Asserts |
|---|---|---|
| claude with an inbox socket receives the byte-exact body with zero pane keystrokes | 1406 | 3 KB body on `sendSocket`, `sentText === []`, `via:"socket"` |
| copilot with rpcPort receives the byte-exact body with zero pane keystrokes | 1431 | `target.rpcPort` seen by the port, `via:"socket"` |
| codex without an endpoint receives one pointer line and never the body | 1457 | `sentText` = `pointerLine`, `opts.kind === "pointer"`, body absent |
| socketless claude consults the composer-idle guard before typing its pointer | 1483 | `capturePane` read ≥ 1 before the pointer |

Earlier describes cover the same code from the PoC era: socket-first for claude (`:1171`), copilot RPC port (`:1281`), pointer path (`:1308`).

### 6.3 The composer-idle guard

`refreshRenderedComposerHold(paneId, ports, buffer, holds)` (`loop.ts:588-617`) captures the pane **immediately before** each send, parses the composer region, and asks a `ComposerHoldTracker` whether a human is mid-sentence. It can *acquire* a hold, not only release one — the earlier gate could only release, so a message arriving in the same tick a human started typing landed on top of their text. It is consulted by the pointer path and the body path but **not** by the socket path (no pane involved). A held message is buffered and retried; nothing is consumed.

---

## 7. Transports, per harness

### 7.1 Claude Code — the inbox Unix socket

**What Claude Code provides (≥ 2.1.224, verified on 2.1.247).** Every interactive or `-p` session binds `/tmp/cc-socks/<pid>.sock` (mode 0600) and writes a registry record `~/.claude/sessions/<pid>.json`:

```json
{ "pid": 84394, "sessionId": "…", "cwd": "…", "version": "2.1.247", "peerProtocol": 1,
  "tmux": "main:@14.%36", "messagingSocketPath": "/tmp/cc-socks/84394.sock",
  "name": "…", "status": "…" }
```
plus `<pid>.<sha>.key` (`{peerToken, procStart, pidDomain}`), and exports `CLAUDE_CODE_MESSAGING_SOCKET` / `CLAUDE_CODE_MESSAGING_TOKEN` to its shell children. A newline-terminated JSON frame written to the socket is delivered to the model **between tool calls mid-turn**, or starts a turn when idle — no keystrokes, no pty, no chunking. Documented limits: ~1 MB per message, 50-deep receive queue, per-sender rate limit, identical-repeat dedupe, a `peer_message_status` ACK frame (`orig_msg_id`, `dropped_msg_ids`, `drop_reason`, `wereHeld`). Off when Claude runs `--bare`, on Bedrock/Vertex/Foundry, or with `DISABLE_TELEMETRY` / `DO_NOT_TRACK` / `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` / `DISABLE_GROWTHBOOK`; the bind can also fail silently (anthropics/claude-code#84945), in which case the record has **no** `messagingSocketPath`. Source of these facts: `reports/pij-comms-review-2026-08-27.md` §5 and https://code.claude.com/docs/en/cross-session-messaging.

**Discovery** — `resolveClaudeSocket({pid, paneId, sessionsDir})`, `EXT/adapters/claude-socket.ts:43-65`:
1. `~/.claude/sessions/<descriptor.pid>.json` — the Claude pid *is* the pij descriptor pid for a spawned seat.
2. Else scan every `*.json` in the dir for `tmux` ending in `.<paneId>`.
3. A record without `messagingSocketPath` → `undefined` → the loop falls through to the pointer path (`"no-socket"`, `daemon-tmux.ts:313`).
`claudeSessionsDir(home)` = `~/.claude/sessions` (`:78-80`); overridable via `DaemonTmuxOptions.claudeSessionsDir` for tests.

**Frame** — `buildPeerFrame({from, body, msgId})`, `claude-socket.ts:92-107`, one JSON line, no trailing newline in the return value (the writer appends `\n`):

```json
{"msgV":1,
 "msg_id":"<pij messageId, e.g. 1787842756542-000001-83071>",
 "type":"user",
 "message":{"role":"user",
            "content":"<cross-session-message from=\"uds:pij-daemon\" from-name=\"<sender-id>\" from-mode=\"bypass\">\n[pij from <sender-id>] <body>\n</cross-session-message>"},
 "priority":"next",
 "from":"uds:pij-daemon"}
```

- `from-mode="bypass"` **inside the content** is what a bypass-permissions receiver checks; a frame that asserts it is delivered even when `from` names a nonexistent socket; `from-mode="default"` is *held* behind a 5-minute "Deny / Deliver this message to Claude" dialog (verified RAW-A/B/C in report §5). It is a self-assertion — acceptable for a single-user machine where the socket is already 0600, but the honest configuration is `claude --settings '{"crossSessionInbound":"accept"}'` on every spawned seat, which removes the hold logic entirely. **Not implemented at spawn** (no `--settings` in `EXT/core/spawn.ts`) — see §14.
- The body inside is the ordinary framed body, so every recipient's `parseFrame` keeps working; the wrapper only adds structural provenance (the model sees `Another Claude session sent a message:` + the tag).
- `msg_id` = the pij message id, so a `peer_message_status` drop report can be matched.

**Send** — `sendClaudeFrame(socketPath, frameLine, {ackWaitMs=150, connectTimeoutMs=2000})`, `claude-socket.ts:122-185`, async `node:net`, never throws:
- `ENOENT` socket → `failed` immediately (`:127-129`).
- connect → write `frame + "\n"` → arm a 150 ms timer (`ackWaitMs`; `DaemonTmuxOptions.socketAckWaitMs`, `daemon-tmux.ts:267`) while listening for a `peer_message_status` line whose `dropped_msg_ids` includes our `msg_id` → `failed: dropped: <reason>` (`:162-183`); timer fires first → `confirmed` (`:159`).
- Connect error / connect timeout → `failed`, nothing sent. A socket `error` **after** the write but before the 150 ms timer also returns `failed` (`:152-154`) although the bytes may have landed — window T1 (§8).
- **`confirmed` means "the frame was written and no `peer_message_status` naming our `msg_id` as dropped arrived within 150 ms"** — there is no positive acceptance ACK, and it does not mean the model has read it. Claude queues it; a busy Claude may collapse several rapid arrivals into `queued_command` attachments (the LOAD benchmark verified 14/50 individually in the transcript while 50/50 were acked at the transport — none lost).

Wired in `DaemonTmux.sendSocket` (`daemon-tmux.ts:307-326`); on `failed` it logs `⚠️ claude SOCKET FAILED: <id> via <path> — <detail>; message stays queued` and the row is retried next tick.

Tests: `claude-socket.test.ts` — frame shape (`:70`), 3 KB multi-line body byte-exact through a fake listener (`:86`), absent socket → failed (`:98`), drop report → failed (`:110`), record resolution order (`:124`).

### 7.2 Copilot CLI — the embedded `--ui-server` JSON-RPC server

**What Copilot provides (1.0.81).** A seat launched **without** any server flag has no local endpoint at all (lsof-verified: only anonymous socketpairs, the TCP session to GitHub, and `session-store.db`; `events.jsonl` is append-only and nothing re-reads it; no runtime command can turn a server on). The hidden flags (`.hideHelp()` in `app.js`) are `--server` / `--headless` (no TUI), `--ui-server` ("Enable TUI with embedded JSON-RPC server"), `--port <n>`, `--host`, `--stdio`. `--ui-server` starts a loopback TCP listener (`Embedded server TCP listener started on port N` in `~/.copilot/logs/process-*.log`, an ephemeral `Server listening on port N` line in the TUI) and registers the TUI's own session with it (`trusted:false`). Protocol: vscode-jsonrpc over TCP with `Content-Length: <n>\r\n\r\n<json>` framing. Methods include `session.send`, `session.getForeground`, `session.getMessages`, `session.abort`, … Full evidence: `reports/pij-comms-review-2026-08-27/e-copilot-codex-ipc.md` §Copilot.

**Spawn** — `EXT/core/spawn.ts`: the CLI picks a free loopback port (`pickFreePortSync`, `:1152-1161`: a short `node -e` child binds `:0` and prints the port; `undefined` → spawn without the server), passes it as `ControlSpawnInput.rpcPort` (`:347-349`), and the argv builder appends `--ui-server --port <P>` (`:500-502`) after `--yolo --session-id <uuid> [--model m] [--context long_context] [--effort e]`. `rpcPort` is stamped on the descriptor (`:548`; `types.ts:256`) — **the descriptor field is the capability signal**: absent ⇒ legacy seat ⇒ pointer path. Revive allocates a **fresh** port and re-stamps it (`EXT/core/revive.ts:51-53, 535-536`); it never carries a dead incarnation's port forward.

**Wire** — `sendCopilotRpc({port, sessionId, prompt, mode="enqueue", timeoutMs=5000})`, `EXT/adapters/copilot-rpc.ts:39-102`:

```
→  Content-Length: <len>\r\n\r\n
   {"jsonrpc":"2.0","id":"pij-<daemon-pid>-<n>","method":"session.send",
    "params":{"sessionId":"<descriptor.harnessSessionId>","prompt":"[pij from <sender>] <body>","mode":"enqueue"}}
←  Content-Length: <len>\r\n\r\n
   {"jsonrpc":"2.0","id":"pij-<daemon-pid>-<n>","result":{"messageId":"<server id>"}}
```

- `prompt` is the ordinary framed body (`buildCopilotPrompt`, `:29-31`).
- `mode`: `enqueue` appends to the session's own queue (starts a turn when idle, delivers at the next turn boundary when busy); `immediate` interjects into an in-flight turn. The daemon always uses `enqueue` (`daemon-tmux.ts:299`).
- The client skips server notifications (`msg.id !== id → continue`, `:93`), treats a JSON-RPC `error` as `failed`, and requires `result.messageId` for `confirmed` (`:94-98`). Connection refused → `failed` with nothing sent; response timeout or a drop *after* the request was written → `failed` although the server may have enqueued the prompt (window T2, §8).
- `confirmed` = "the server returned a `messageId`; the prompt is in the seat's own in-process queue and rendered by the TUI as a `user.message` in `~/.copilot/session-state/<id>/events.jsonl`."

**First-turn readiness probe** — `probeCopilotReady({port, sessionId})`, `:117-173`, calls `session.getForeground` and returns `ready:true` only when the answer's `sessionId` equals ours. `DaemonTmux.sendSocket` runs it **once per session before the first RPC delivery** (`daemon-tmux.ts:282-294`; `copilotReady` set, `:244`); not-ready → `failed` with `copilot NOT READY … message stays queued` and a retry next tick. Reason: a fresh Copilot was observed to return a `messageId` for `session.send` while its model turn was still hung at boot (once, after an MCP reload).

Tests: `copilot-rpc.test.ts` — frame (`:99`), 3 KB prompt byte-exact + messageId through a fake `Content-Length` server (`:105`), RPC error → failed (`:119`), nothing listening → failed (`:126`), readiness probe both ways (`:134`, `:147`).

### 7.3 The pointer path — any tmux seat without an endpoint

Used for: Codex (today), Copilot seats without `rpcPort` (legacy launches, `pij agent spawn` peers, a seat whose port allocation failed), Claude seats whose session record has no socket. **Precondition: a SQLite state machine** (`opts.pointer`, §6.1) — under `PIJ_QUEUE_BACKEND=fs` this path does not exist and the body is typed.

**The line** — `pointerLine(from, count)`, `loop.ts:622-626`, exactly:

```
[pij from <sender-id>] 1 new message — run: pij inbox
[pij from <sender-id>] N new messages — run: pij inbox
```

ASCII apart from the em dash, no newline, ~60 B — far under one 1022-byte pty chunk, so the clipping mechanism cannot apply. Framed with the sender id so the model knows it is pij, not a human. The daemon drains one message per `drainTmuxInbox` call (`daemon.ts:1214-1222` passes `[message]`), so today `count` is always 1; a burst of N messages produces N pointer lines, each settled under its own lease.

**Sequence**:
1. composer-idle guard (§6.3) — held ⇒ buffer, retry.
2. `sendText(paneId, line, harness, pid, {kind:"pointer"})` → the ordinary type-settle-Enter-verify machinery (§7.4) with `opts.kind` so the log line is honest.
3. `confirmed` or `unverified` ⇒ `via:"pointer"` ⇒ daemon `settle(seq,"injected",{leaseMs:90_000})` (`daemon.ts:1239-1247`). **Told, not read.** No sender receipt.
4. The recipient runs `pij inbox` (its init text tells it to: `EXT/core/harness/claude.ts:158-161` — "When you see a pij pointer, or to check for messages, run `pij inbox`"). `consumeInbox` (`EXT/core/inbox.ts:207-256`) lists every open row (`listUnread`, which includes `injected`), `claimUnread`s each by id ⇒ `acked`, prints the framed bodies, and queues a `delivered` receipt to each sender.
5. If nobody pulls within 90 s, `recoverStaleClaims` returns the row to `queued` (receipt `redelivered`, detail `lease-expired`) and the next tick types a fresh pointer. **`attempt` does not move** — the daemon never `claim()`s, so the row can be re-announced indefinitely and never parks (G25). Nothing is lost and no body is ever typed. Observed live during the PoC on an isolated daemon (`reports/pij-comms-review-2026-08-27.md` §11, scenario "seat never runs `pij inbox`"): pointer typed at 03:12:15, lease expired, pointer re-announced at 03:13:47, body still unread in the queue.

**`pij inbox --inject`** (`inbox.ts:128-133`): prints pending bodies as an injectable block and acks them; silent with exit 0 when empty. Intended for a harness hook (`SessionStart` / `UserPromptSubmit` for Claude and Copilot) so a keystroke drains the inbox with no per-prompt noise. The flag exists; **no hook is installed by pij** (§14).

**Unverified pointer** — when the Enter cannot be confirmed the adapter logs (`daemon-tmux.ts:557-558`):
`ℹ️ <harness> pointer typed into pane %N (pid P) but submission unconfirmed after K Enter attempt(s) — body is safe in the queue; row stays injected under a 90s lease and is re-announced on expiry — text tail «…»`. The body-path equivalent is the `⚠️ … UNVERIFIED …` line (`:559`); the two are deliberately different because an unverified *body* may be stranded in a composer while an unverified *pointer* costs nothing.

**`cursors.notified_seq`** is written by `setNotifiedSeq` but the current drain does not read it: with one pointer per message and per-row leases, the watermark is redundant. It is kept for the coalesced "N new: seq 41–43 — run: pij inbox --since 40" design in the review (§7 there), which is not built.

### 7.4 Body typing — the legacy path that still exists

`DaemonTmux.sendText` → `sendTextUnchecked` (`daemon-tmux.ts:445-565`). Reached for: (a) **commands** on every backend (`/compact`, `/new`, `/reload` — remote session control), (b) the **pointer line** (short, single-chunk), (c) **every body under `PIJ_QUEUE_BACKEND=fs`**, (d) boot-time init/phonehome injections. You need to understand it because (b) rides on it and because its outcome vocabulary leaks into receipts.

1. Copilot only: **focus-IN wake** (`wakeCopilotInput`, `:102-105`; `needsInputWake`, `:82-84`). With tmux `focus-events on`, a pane you switched away from is in focus-OUT and Copilot swallows Enter-as-submit; a `CSI I` escape before typing fixes it, plus a best-effort `SIGWINCH`.
2. `tmux send-keys -l <text>` in **one** call (`typeLiteral`, `EXT/adapters/tmux-keys.ts`). Copilot: up to 3 retypes while the composer stays visibly empty (`TYPE_CONFIRM_*`, `:120-125`, `:490-507`).
3. Settle before Enter: `ENTER_SETTLE_BY_HARNESS = {claude: 350, copilot: 900, codex: 350}` ms (`:60-65`) — an Enter fired inside the harness's paste-debounce is swallowed.
4. Up to `SUBMIT_ATTEMPTS = 3` Enters (`:112`), each followed by 5 × 250 ms polls (`:116-117`) of `submissionConfirmed(pre, post, text)` (`:181-183`) = pane went busy **or** composer emptied and the transcript region changed. The payload is never retyped after the first Enter (at-most-once wins over replay).
5. Outcome `SendOutcome = "confirmed" | "unverified" | "held" | "failed" | "gone"` (`EXT/core/ports.ts:47`). `held` = nothing typed (human at the composer); `failed` = the tmux call threw before typing; `gone` = tmux answered "no such pane" (`classifySendFailure`, `:230-232` — an *unreachable server* is `failed`, never `gone`, so one tmux blip cannot unbind every seat at once); `unverified` = typed, Enter unconfirmed after ~5 s.
6. Bookkeeping in the daemon: `held`/`failed` ⇒ row stays unread and is retried; `gone` ⇒ row stays unread, seat unbound; `confirmed` **and `unverified`** ⇒ marked read (for bodies: "the payload WAS typed and replaying could duplicate an accepted turn", `loop.ts:705-709`). That last rule is the at-most-once loss path §1(3) — **it is why bodies are no longer typed to Claude/Copilot**, and it is still true for `fs`-backend bodies and for commands.

Why `send-keys -l` and not bracketed `paste-buffer -p`: `pasteBuffer` exists in `tmux-keys.ts` and survives the clip (EXP2 in report §2.2), but it still relies on the composer accepting a paste pill plus a racy Enter, still has the 16 KB `MAX_IMSGSIZE` argv cap, and still produces no ACK. It was rejected as the fix in favour of not typing bodies at all.

### 7.5 Codex CLI — pointer today, app-server design deferred

A plain interactive `codex` TUI is in-process: no socket, no re-read file, nothing a daemon can write to. Codex seats therefore take the pointer path (routing-invariant case 3). The designed replacement — pij runs `codex app-server --listen unix://<PIJ_HOME>/<id>/codex.sock` and puts `codex --remote unix://<same>` in the pane; the daemon opens a second websocket client on that socket and calls `turn/start` (idle) or `turn/steer {threadId, clientUserMessageId, input:[{type:"text",text}], expectedTurnId}` (in-flight), choosing by `thread/read canAcceptDirectInput` — is built only as pure frame builders (`EXT/adapters/codex-rpc.ts:42-73`, `encodeCodexRequest` omits the `jsonrpc` field per the app-server README, `:77-79`; tests `codex-rpc.test.ts:11-49`). Not wired into `sendSocket`, not live-proven. What blocks it is in §14.

### 7.6 `pi` harness — in-process receiver

A `pi` session hosts the pij extension itself (`EXT/index.ts`). It is the sole consumer of its own inbox: under SQLite it runs `startQueueConsumer` with `onMessage = receiver.onInbound(dm, dm.messageId)` and `onScan = receiver.noteInboxScan` (`index.ts:364-383`), which calls `pi.sendUserMessage(text)` when idle or `{deliverAs:"steer"}` when streaming. The daemon's `route()` returns `observe` for pi targets and never injects. Under `fs` the previous `FsChannel.watch` + read-marker path is byte-for-byte unchanged (`:384-…`). Both the receiver and the `pij_send` tool open the store via `openChannel` (`:107`, `:320`) and close it on reload (`:133`, `:378-381`).

### 7.7 Telegram bridge — a pull seat on the same consumer

The bridge (`EXT/telegram/bridge.ts`; user guide `docs/how/pij-telegram.md`) registers as peer `pij-telegram` (`harness:"pi"`, no pane, so `effectiveDeliveryMode` = `pull` and the daemon never drains it). It runs inside the daemon process when `PIJ_HOME/telegram.env` exists, or standalone via `pij telegram start`. `startForwarder(channel, deps)` (`bridge.ts:558`): under SQLite (`sqliteOf(channel) !== undefined`, `:658-671`) it is a `startQueueConsumer` whose handler awaits `forwardOne(dm)` (`:562-656`: prefix `[<from>] [<repo>/<branch>]`, chunk to Telegram's 4096-char cap, send media by reference) and **throws `ForwardIncomplete: N text part(s) undelivered`** (`:667`) when any required text bubble's send rejected — leaving the row `claimed` for lease recovery instead of acking a message the phone never got. Media failures keep their own contract (one bounded retry on a transient error, then an honest echo back to the sending seat, `:622-649`) and count as handled. Receipt rows are acked and never forwarded. Under `fs` the forwarder is the old `channel.watch(...)` log-and-continue path (`:673-683`) with a process-local `seen` set (`telegram/index.ts:223`).

---

## 8. The generic at-least-once consumer — `startQueueConsumer`

File: `EXT/adapters/queue-consumer.ts` (74 lines). Shared by §7.6 and §7.7; the reference implementation for any future long-lived recipient.

```ts
startQueueConsumer({ queue, self, onMessage, pollMs = 500, leaseMs = 60_000,
                     token = `consumer-${process.pid}`, log?, onScan?, now? }): () => void /* dispose */
```

Loop (`:31-61`): every `pollMs` (and once immediately), guarded against overlap (`scanning`), `onScan(now)` for the heartbeat, then `while (row = queue.claim(self, {leaseMs, token}))` → `await onMessage(row)` → `queue.claimUnread(self, row.messageId, {readAt, reader: self})`. A thrown handler (or a failed ack) is logged and **breaks the scan, leaving the row `claimed`**; the daemon's `recoverStaleClaims` re-queues it after `leaseMs` and parks it after 6 attempts. The consumer never changes the queue's write-side rules. `dispose()` clears the interval; the timer is `unref`'d so it never keeps a process alive.

Contract, stated so it can be tested (`queue-consumer.test.ts`):
- claims, handles, and acks queued rows exactly once in seq order within one scan (`:61`);
- receipt rows reach the handler flagged `kind:"receipt"` and are acked without special-casing (`:96`);
- a rejected row stays claimed, is redelivered after lease recovery, and parks at max attempts (`:119`);
- boot backlog: `queued` rows are handled once; `acked`/`failed`/`parked` never (`:158`);
- one heartbeat per scan; dispose stops future scans and claims (`:193`).

**At-least-once, two bounded duplicate windows** (documented for the bridge in `docs/how/pij-telegram.md` § Queue backend & restart semantics; they apply to every consumer):
- **W1 — ack-after-send failure.** The side effect succeeded, the local ack failed (e.g. the DB was busy past `busy_timeout`). The row is re-claimed after the lease and the side effect runs again.
- **W2 — daemon restart mid-handler.** `resetClaimsOnStart` (§4.1) re-queues **every** `claimed` row, including one another process is still handling. One resend.
Neither can produce a lost-but-acked message. Because the consumer never sweeps its own leases, **the retry leg needs a running daemon** — a standalone bridge on a host with no daemon will leave a failed row `claimed` forever (§13 G12).

**Transport-level ambiguity windows — the direct Claude/Copilot paths are at-least-once too.** Both socket clients return `failed` on outcomes that can occur *after* the request bytes were written, and the daemon then leaves the row `queued` and retries next tick:
- **T1 — Claude socket.** `sendClaudeFrame` writes the frame, then arms a 150 ms timer; `confirmed` = the timer fired with no `peer_message_status` naming our `msg_id` as dropped (`claude-socket.ts:157-160`); a socket `error` event *after* the write but before the timer wins → `failed` (`:152-154`) even though the receiver may already hold the frame. Bound: one duplicate per such race. Claude Code documents identical-repeat dedupe and a per-sender rate limit on this socket, which absorbs most byte-identical retries — the retry re-sends the same `msg_id`/content — but the spec does not rely on it.
- **T2 — Copilot RPC.** `sendCopilotRpc` writes the `session.send` request, then waits up to 5 s for the response (`copilot-rpc.ts:66-76`); a lost/late response or a connection drop after the write → `failed` while the server may already have enqueued the prompt. Bound: one duplicate per lost response. The JSON-RPC `id` is a per-request correlation id, not an idempotency key; no dedupe is documented on the server.
So the honest reading of `failed` on both transports is "not confirmed", not "nothing landed"; `confirmed` on Claude is "written + no negative report within 150 ms", on Copilot "the server returned a `messageId`". Incident analysis of a duplicate turn should check the receipt trail for `queued → (failed retry) → acked` on the same `seq`.

---

## 9. CLI surfaces

### 9.1 `pij send`

`pij send <to> "<text>" | --body-file <path|-> | --command <compact|new|reload> [--file <path> [--caption]] [--to <id>…] [--wait] [--json] [--as <id>]`

- Writes the **raw** body; the receiver frames it. Never `frame()` on the send side (`cli.ts:3305`).
- **`--body-file` is the safe channel** for anything the sender did not author. A double-quoted body is expanded by the caller's shell before pij exists — backticks and `$( )` inside a relayed log line *execute*. `--body-file -` with a quoted heredoc (`<<'EOF'`) expands nothing and is byte-literal (`docs/how/pij.md:350-370`).
- `--file` is *reference-passing* (a path, never bytes) and only a pull-mode reader or the bridge renders it; an attachment-only send to a pushed seat is refused with `E-EMPTY` (exit 2) rather than delivering nothing (`cli.ts:3356`; `targetRendersAttachments`, `:2332-2334`).
- **Sender receipt classification** — `classifySendReceipt(descriptor, now)`, `cli.ts:2263-2283`, in this order (the bind-health terms come from `classifyBindHealth`/`isBindDegraded`, `EXT/core/bind-health.ts:30-47`: `pre-bind` = lifecycle not yet `bound` and younger than the limbo window; `bind-limbo`/`bind-failed` = "degraded", i.e. the seat has stopped binding; "daemon-owned" = `daemonReceiptAuthoritative`, `cli.ts:707-712` = a push-mode `claude|copilot|codex` seat): degraded ⇒ `blocked/never-bound`; **`effectiveDeliveryMode(d) === "pull"` ⇒ `queued/pull-inbox`**; pre-bind ⇒ `queued/unbound`; daemon-owned target ⇒ `queued/compacting` or `queued/tick-pending`; `state==="working"` ⇒ `queued/busy`; else `delivered`. `effectiveDeliveryMode` (`:2318-2322`) = `descriptor.deliveryMode ?? (paneId ? "push" : "pull")`. Human renderings at `:2393-2404` (`queued (pull-inbox): awaiting the peer's own inbox check`, `queued (tick-pending): …`). Every `queued` here is a *prediction*; the durable truth is `pij queue`.
- `PIJ_SENDER=<id>` / `--as <id>` (`cli.ts:2008-2019`): hard sender override that skips ambient harness detection (`CLAUDE_CODE_SESSION_ID`, Copilot session-state, `PIJ_SESSION_ID`), so a script, a test, or the daemon can send as a declared pull id from inside an agent's shell. Unknown id ⇒ `E-NOID`.
- `--wait` polls receipts until a terminal state or timeout; on SQLite the `delivered` receipt round-trips as a `kind:receipt` row.

### 9.2 `pij inbox`

`pij inbox [check] [--wait [ms]] [--inject] [--json]` · `pij inbox register` (`parseInboxArgs`, `inbox.ts:104-170`).
- Default: claim-and-print every open row for `self` (§7.3 step 4), ack by id, queue `delivered` receipts. Idempotent — a second run prints nothing.
- `--wait [ms]`: block until something arrives (pull seats); the first `inbox` command auto-registers a pane-less Claude/Copilot/Codex session as `deliveryMode:"pull"` (`docs/how/pij.md:67-73`). Refused for pushed seats.
- `--inject`: hook form (§7.3). Mutually exclusive with `--wait` and `register` (`inbox.ts:160-163`).
- Under SQLite `listUnread` deliberately includes `claimed`/`injected` rows, so a seat can always pull what it was told about.

### 9.3 `pij queue`

`pij queue [<id>] [--to <id>] [--since <seq>] [--tail N] [--all] [--json]` — the delivery history (`SqliteQueue.summary`): one line per message with state, attempt, lease, and the receipt trail; latest 200 by default with `showing N of M (latest)`. JSON `{rows, total, shown}`.
`pij queue retire --reason <text> [--to|--from|--older-than 30m|2h|1d|--state queued,parked] [--all-recipients] [--dry-run] [--json]` — operator retirement (§4.1); at least one selector required; `--all-recipients` guards machine-wide runs.
`pij queue migrate [--dry-run] [--json]` — fs→sqlite import.
The daemon also **auto-retires** open rows for a recipient whose close is complete and deliberate (`lifecycle:"dissolved"` ∧ `closeIntent` ∧ `terminal.disposition:"requested"` ∧ no `revivePendingAt`) with reason `recipient-closed` (`daemon.ts:848-856`); `pij revive` un-retires exactly those (`docs/how/pij.md:114-152`).
For humans and smoke tests the file is plain SQLite: `sqlite3 ~/.pij/queue/pij.sqlite 'select seq,to_id,state,attempt from deliveries order by seq desc limit 20'`.

### 9.4 Output on pipes

`main()` puts stdout/stderr into blocking mode when they are pipes (`EXT/cli.ts:4749-4750`, the bin entry, `_handle.setBlocking(true)`), because the bin has ~137 `process.exit()` sites and Node drops the unflushed tail of a non-blocking pipe at exit — `pij queue` once printed exactly 65,536 bytes (709 of 812 rows). One guarded statement at the shared seam fixed the class; no `process.exit` site was touched.

---

## 10. Wire-frame reference (copy-exact)

| # | Frame | Where built | Exact form |
|---|---|---|---|
| W1 | Framed body (what every model sees) | `core/message.ts:11-13` | `[pij from <sender-id>] <body>` — body verbatim, newlines preserved |
| W2 | Claude inbox-socket line | `adapters/claude-socket.ts:92-107` | `{"msgV":1,"msg_id":"<id>","type":"user","message":{"role":"user","content":"<cross-session-message from=\"uds:pij-daemon\" from-name=\"<sender-id>\" from-mode=\"bypass\">\n<W1>\n</cross-session-message>"},"priority":"next","from":"uds:pij-daemon"}` + `\n` |
| W3 | Claude drop report (inbound) | parsed at `claude-socket.ts:162-183` | `{"type":"peer_message_status","orig_msg_id":"…","dropped_msg_ids":["<id>"],"drop_reason":"…","wereHeld":…}` per line |
| W4 | Copilot `session.send` | `adapters/copilot-rpc.ts:48-53, 74-75` | `Content-Length: <n>\r\n\r\n{"jsonrpc":"2.0","id":"pij-<pid>-<n>","method":"session.send","params":{"sessionId":"<uuid>","prompt":"<W1>","mode":"enqueue"}}` |
| W5 | Copilot response | parsed at `:77-99` | `Content-Length: <n>\r\n\r\n{"jsonrpc":"2.0","id":"pij-<pid>-<n>","result":{"messageId":"<id>"}}` (or `"error":{"message":…}`) |
| W6 | Copilot readiness probe | `:124-127` | `{"jsonrpc":"2.0","id":"pij-ready-<pid>-<n>","method":"session.getForeground","params":{}}` → `{"result":{"sessionId":"<uuid>"}}` |
| W7 | Pointer line (typed) | `core/daemon/loop.ts:622-626` | `[pij from <sender-id>] 1 new message — run: pij inbox` |
| W8 | Codex `turn/steer` (built, unwired) | `adapters/codex-rpc.ts:52-62, 77-79` | `{"id":"<clientMessageId>","method":"turn/steer","params":{"threadId":"…","clientUserMessageId":"…","input":[{"type":"text","text":"<W1>"}],"expectedTurnId":"…"}}` (no `jsonrpc` key; one message per websocket text frame) |
| W9 | Sender receipt body | `core/message.ts:38-40` | `[pij receipt <messageId>] queued|delivered|unverified` |
| W10 | Session-control command (typed raw) | `core/daemon/router.ts:40` | `/compact` etc. — never framed, never over a socket |

---

## 11. Benchmarks

Method (`reports/pij-comms-review-2026-08-27/benchmarks.md`; harness `harness/scripts/comms-bench.py`): an isolated daemon (`PIJ_HOME=<scratch>`, `PIJ_QUEUE_BACKEND=sqlite`, private `tmux -L pijpoc` server, `PIJ_BENCH_KEYLOG=<file>` so every `send-keys`/`paste-buffer` the daemon issues is counted — `daemon-tmux.ts:252-264`) with scratch seats spawned by the isolated CLI (Claude haiku; Copilot gpt-5.6-sol with `--ui-server`; a second Copilot demoted to legacy by deleting `rpcPort`). **send→acked ms** = `receipts.acked.at − receipts.queued.at` in the queue (`injected` for pointer rows). **verified** = the framed body found byte-exact in the recipient harness's own transcript (Claude `~/.claude/projects/…/<session>.jsonl` user turns + `queued_command` attachments; Copilot `~/.copilot/session-state/<id>/events.jsonl` `user.message`) — the model's own say-so was never used as evidence (it hallucinated during the review). Bodies 31 lines / 3177 B unless stated.

Pre-fix reference (typed bodies): 3 KB multi-line to Claude **clipped 8/8** to the last ~350 B; up to 3 Enters per message; 321/500 receipts `unverified`; delivery on a 600 ms tick.

| Scenario | PoC baseline (sync `node -e` per send) | After async `node:net` + concurrent drain | **Merged default (`sqlite`)** |
|---|---|---|---|
| C1 Claude idle, 3 KB | 1091 ms, 0 keystrokes, byte-exact | 226 ms | **177 ms**, 0 keystrokes, byte-exact |
| C2 Claude mid-turn (sent into a 40 s tool call), 3 KB | 360 ms, byte-exact | 206 ms | 326 ms (transcript check missed the window; acked) |
| P1 Copilot idle, 3 KB over RPC | 9003 ms, not verified | 1916 ms | **113 ms**, `events.jsonl ×1`, 0 keystrokes |
| L1 legacy seat, pointer only | 1883 ms, 4 keystroke calls | 1555 ms | pointer only; body never on the pty |
| LOAD 50 × ~600 B from 3 senders → one Claude | p50 321 / p95 470 ms, 50/50 acked, 0 loss | p50 272 / p95 418 | **p50 262 / p95 404 ms**, 50/50 acked, 0 loss (14/50 individually visible in the transcript — the rest collapsed into mid-turn attachments) |
| RESTART: SIGTERM daemon, enqueue 5, restart | 5/5 acked, 0 dup, 0 loss | same | **5/5 acked, 0 dup, 0 loss** |

Reading: SQLite itself costs tens of microseconds per transition; end-to-end latency is the daemon's ~600 ms tick plus the transport. The async rewrite removed a ~40 ms child process per send and let seats drain concurrently. The merged numbers are the ones to regress against.

---

