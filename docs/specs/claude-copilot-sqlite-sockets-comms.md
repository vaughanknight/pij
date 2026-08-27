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

## 12. Doctrine — two rules that used to be one

Until 2026-08-27 the operating rule read "never inline a body; persist it and send a pointer". That compressed two independent rules, and the compression caused a real defect (the doc claimed the pointer path was universal while the code already sent bodies over sockets). They are now separate, and the separation is what a future transport must inherit correctly:

- **P1 — transport safety.** *A pty can clip a typed body.* Therefore, under a backend with a SQLite state machine (`sqlite`, the default, or `dual`), a seat with **no non-pty endpoint** receives only a short pointer, after the composer-idle guard, and pulls the body; `PIJ_QUEUE_BACKEND=fs` has no row to park a pointer against and still types the body (§7.4, G7). A seat with a channel that **cannot** clip terminal input — Claude inbox socket, Copilot `--ui-server` RPC, `pi` in-process — receives the **byte-exact body** over that channel. The pointer is the remedy for the clip; where the precondition is absent, so is the remedy.
- **P2 — persistence/audit.** *Packets and large bodies are written durably before the delivery they authorise.* Unchanged by P1; true on every transport. This is what `SqliteQueue.deliver` before any send, and `--body-file` for large agent-to-agent packets, implement.

P1 introduces **no body-size cap** on socket/RPC delivery (Claude's documented ceiling is ~1 MB per frame). Remote session-control commands stay on the typed path regardless (§6.2). The executable statement of P1 is the routing-invariant test (§6.2); the prose statement is `docs/how/pij.md:76-112` ("Delivery routing — body or pointer"). If you add a transport, add a case to that `describe` before you touch `drainTmuxInbox`.

---

## 13. Gotchas actually hit (field notes, in the order they bit)

Each entry: **symptom → cause → state on `ed20a68`**. "Fixed" means merged and tested; "open" points to §14.

**G1 — 1022-byte pty clip (Claude Code ≥ 2.1.246).** Multi-line bodies > 1022 B arrived as their last chunk only, unframed; the daemon reported `confirmed` because its oracle matched the surviving tail. Cause: kernel pty chunking + a composer regression that *replaces* on a short trailing multi-line chunk (§1). State: **fixed by construction** — Claude bodies go over the socket, everything else gets a ≤ ~60 B pointer; the typed path remains only for commands and the `fs` backend. Regression guard: routing-invariant tests + `sqlite-queue.test.ts:38` ("round-trips a 3 KB multi-line body byte-exact (the clipped-head failure)"). Do not reintroduce body typing for any harness "because it's short" — single-line safety was shown to be timing-dependent (report §2.4).

**G2 — `--context long_context` 400s on `gemini-3.6-flash`.** Every pinned Copilot model got `--context long_context` appended; Flash rejects it (HTTP 400) so the seat was unspawnable. Cause: a per-model capability emitted unconditionally. State: **fixed** — `COPILOT_NO_LONG_CONTEXT` deny-set (`EXT/core/models/registry.ts:83`), tri-state `ControlSpawnInput.longContext` (`spawn.ts:350`, `:468-470`; `undefined` ⇒ emit, `false` ⇒ suppress, so unknown models never silently lose the tier). **Still open**: a Flash seat spawned *without* the flag still 400s interactively — Flash is unusable as an interactive Copilot seat for a separate reason; use `gpt-5.6-sol` / terra. Revive never emitted the flag at all (follow-up).

**G3 — dual backend silently lost the pointer path and lease recovery.** `daemon.ts` gated "do we have a state machine?" on `this.channel instanceof SqliteQueue`, which is false for `DualWriteChannel` even though it wraps one. Under `PIJ_QUEUE_BACKEND=dual` a socketless seat got the **body typed** (the clip risk the pointer exists to avoid) and `recoverStaleClaims` never ran (no retry leg). Cause: type test instead of the `sqliteOf` unwrapper that exists for exactly this. State: **fixed** — `daemon.ts:1172` uses `sqliteOf(this.channel)`; a dual-backend test covers pointer + recovery; `docs/how/pij.md:90-93` footnote corrected (dual now behaves like sqlite; only `fs` types bodies). The remaining `instanceof SqliteQueue` at `daemon.ts:1628` picks which object's `resetClaimsOnStart()` to call (both branches reach the same `SqliteQueue`, so it is redundant, not a decision) and `:1629` picks the boot log label; neither gates behaviour. **Rule**: never `instanceof SqliteQueue` in decision code.

**G4 — at-least-once duplicate windows (W1/W2, §8).** A Telegram message can be sent twice: ack failed after a successful send (W1), or the daemon restarted while the bridge was mid-send and `resetClaimsOnStart` re-queued the bridge's claim (W2). Cause: send and ack are not one transaction; the boot reset is unscoped by `claim_token`. State: **documented as the contract** (`docs/how/pij-telegram.md`), bounded to rows in flight at that instant; token-scoped reset is open (§14).

**G5 — ForwardIncomplete: a failed text send must never ack.** The original forwarder closure swallowed every `deps.send` error ("log, continue"); a consumer acking after it resolved would have acked a message Telegram never received. Cause: at-least-once needs the handler to *reject* on partial delivery. State: **fixed** — `forwardOne` counts undelivered required text parts and throws (`bridge.ts:662-669`); tests drive the production closure with a rejecting `send`, proven live (a failed text send left the row `claimed`, lease recovery resent it).

**G6 — sender receipt lied for pull seats.** `pij send pij-telegram …` printed `delivered: peer was idle` while the row sat `queued`. Cause: `classifySendReceipt` tested raw `descriptor.deliveryMode === "pull"`; the bridge descriptor has `deliveryMode: null, paneId: null`. State: **fixed** — `effectiveDeliveryMode` in both `classifySendReceipt` and `daemonReceiptAuthoritative` (`cli.ts:2272`, `:707`), pinned by a pane-less descriptor test. A post-merge review found the mutation survived because fixture widenings removed the witness; a negative test was added (daemon tick fields must be *absent* for a pull seat).

**G7 — pointer path is SQLite-only.** Under `fs` a socketless seat still gets the body typed. Cause: no store to hold a "told, not read" row. State: **by design**, documented (`docs/how/pij.md:90-93`; live skill invariant scoped to the sqlite default). A doc once claimed the pointer rule was global — corrected.

**G8 — spawn-verification timeout fires before a slow Copilot first turn.** The round-trip check that a freshly spawned seat is alive (`E-CANARY-TIMEOUT`, `EXT/core/canary.ts:12, :211`) expired ~2 s before a Copilot seat's first-turn ack landed. Cause: fixed timeout vs. Copilot's boot latency. State: **open** as tooling ergonomics; the operational rule is *process args are the identity truth* (`ps -o command= -p <pid>`: `--session-id`, `--model`, `--effort`, `--ui-server --port`), never the seat's self-report or the timeout.

**G9 — the bridge never sweeps its own leases.** A failed row stays `claimed` until *the daemon's* `recoverStaleClaims` runs. Cause: single-sweeper design (deliberate: two sweepers would race). State: **documented**; a standalone bridge with no daemon has no retry leg.

**G10 — daemon restart strands the event-spine locks.** After a daemon stop/kill, `~/.pij/spine/write.lock` and `~/.pij/spine/events.lock` (two exclusive-create lock files under `~/.pij/spine/`: the machine-wide *platform write lock* `write.lock`, `EXT/adapters/platform-write-lock.ts:3, :44` — "never stolen; if its writer is dead, remove the file manually", `:123` — and the append-only NDJSON event log's `events.lock`, `EXT/adapters/spine-store.ts:10, :78`) remained owned by the dead pid, and **every** seat's spine writes failed with `E-NOREG … lock held` for minutes. Cause: no release on SIGTERM and no dead-pid reclaim. State: **open** (§14). Interim operator step after every restart: read the pid in each lock file; if dead, delete the file.

**G11 — CLI/daemon code skew after a fast-forward.** The global `pij` is an `npm link` symlink into the main checkout, so a merge is **live for every CLI invocation immediately**, while the daemon keeps running the code it booted with until restarted — and extension edits in a worktree do nothing to either. Daemon-side guards (anything in `loop.ts`/`daemon.ts`, e.g. the bind guard) are therefore not in force at merge time. Cause: two deploy events, neither announced. State: **operational** — record a restart when the daemon is actually restarted; `gh pr view --json state` answers "merged", nothing answers "running" except the daemon's own boot log line.

**G12 — 64 KiB stdout truncation on pipes.** `pij queue | head` etc. cut off at exactly 65,536 bytes. State: **fixed** (§9.4).

**G13 — mail for a dissolved seat typed into a stranger's pane.** ~10 min after a seat was closed, its still-`queued` preamble was typed into an unregistered Copilot pane of the same harness and that pane acted on it. Cause: (a) mail to a deliberately closed seat stayed open and retried; (b) pane resolution accepted any live pane of the harness. State: **fixed in two halves** — auto-retire on complete deliberate close + never inject for a `dissolved` descriptor (`daemon.ts:848-856`, incident replay test); one lifecycle-filtered pane resolver everywhere + a bind guard requiring the pane to run *this seat's own* session id (Copilot `--session-id`, Claude/Codex native session evidence) + a source sweep rejecting new ad-hoc `.paneId ===` resolvers. Four advisories remain (§14).

**G14 — `pij send "<body>"` executes backticks.** Three incidents in one day, one pasting 1,500 lines: a relayed body containing `` ` `` or `$( )` was expanded by the *sender's* shell before pij ran; the message delivered mangled with a success receipt. Cause: shell, not pij — pij's path is argv-only end to end. State: **rule** — every relayed body via `--body-file` from a quoted heredoc; a CLI guard refusing unescaped backticks is open.

**G15 — a second daemon stole the live daemon's pane taps.** `refreshPaneSignals` ran `tmux pipe-pane` on every pane of the tmux server, so an isolated test daemon on the default server disconnected the production daemon's output taps. State: **fixed** (taps only panes owned by a registered seat); the isolation recipe for any test daemon is still `tmux -L <private>` + `PIJ_HOME=<scratch>` + `PIJ_QUEUE_BACKEND=sqlite` + `TMUX="$(tmux -L <private> display -p '#{socket_path}'),0,0"` (report §11 "How to run it").

**G16 — Copilot accepts `session.send` while its first model turn is hung.** Once, after an MCP reload: a fresh seat returned a `messageId` and never processed it (0 AIC, pending). State: **fixed** — `probeCopilotReady` before the first RPC delivery per session (§7.2).

**G17 — backgrounded Copilot swallows Enter.** With tmux `focus-events on`, a pane you switched away from is in focus-OUT and Copilot ignores Enter-as-submit; typed text stranded in the composer. State: **fixed** on the typed path (`CSI I` focus-IN before typing and before each retry Enter, `daemon-tmux.ts:99-105, :488, :526-529`); irrelevant on RPC.

**G18 — `send-keys` argv cap.** A framed body > ~16,300 B fails with tmux `command too long` (`MAX_IMSGSIZE 16384`), threw, was re-enqueued unread, and retried every tick forever, blocking that seat's FIFO. Mechanism verified, never observed in production. State: **moot** for Claude/Copilot (no body typing); still theoretically reachable for `fs`-backend bodies and pathological commands.

**G19 — `unverified` consumes on the typed path.** A body typed but not confirmed is marked read (at-most-once), so a composer cleared by Esc/`/clear`/auto-compact loses it. State: **inherent to typing**; the reason the design moved off typing; still true for `fs` bodies. The pointer path deliberately does *not* consume (`settle injected` + lease).

**G20 — mid-turn arrivals are invisible to transcript tooling.** Claude turns a message queued during a turn into a `queued_command` attachment after the next tool result, not a `user` turn; `pij tail`'s transcript summariser renders only `user`/`assistant`. The model still sees it once. State: **known**; the socket path's `<cross-session-message>` wrapper gives structural provenance so a mid-turn arrival is never mistaken for the human; the LOAD benchmark's 14/50 transcript count is this effect, not loss.

**G21 — Claude socket `from-mode` is a self-assertion.** A frame claiming `from-mode="bypass"` is delivered to a bypass-permissions seat regardless of the real sender. Fine on a single-user box with 0600 sockets; not a security boundary. State: **open** — spawn seats with `--settings '{"crossSessionInbound":"accept"}'` so the hold logic is explicit rather than bypassed (§14).

**G22 — socket bind failure looks like "no socket".** A Claude session record without `messagingSocketPath` (bind failed, or one of the disabling env vars) silently routes to the pointer path. State: **by design** — `no-socket` ⇒ pointer is the safe fallback; watch the daemon log for a Claude seat that keeps taking pointers.

**G23 — the local Codex install was broken, then unauthenticated.** `@openai/codex@0.98.0` lacked its vendor binary (`spawn …/vendor/aarch64-apple-darwin/codex/codex ENOENT`); a later 0.148.0 ran but every call was 401 without `codex login`. State: the reason the Codex transport is design-only (§14).

**G24 — schema vs. design drift.** The review's DDL had `not_before`, `body_path`, `acked_seq`; the shipped schema (§3.2) does not. Anyone implementing backoff or large-body offload must add them; do not assume they exist because the design doc says so.

**G25 — daemon-delivered rows never park.** A pointer to a seat that never runs `pij inbox` is re-announced every 90 s **forever**: the daemon delivers from `listQueued` and settles with `settle(seq,"injected",{leaseMs})` (`daemon.ts:1174, :1243`) without ever calling `claim()`, and `claim()` is the only writer of `attempt` (`sqlite-queue.ts:371-378`; `settle` preserves it, `:385-403`). `recoverStaleClaims` parks only when `attempt ≥ 6` (`:437-443`), so a daemon row stays at `attempt 0` through every `redelivered` receipt. Consumer rows (§8) do go through `claim()` and do park. State: **open** — §14 item 21. Until fixed, retire a stuck pointer row by hand (`pij queue retire --to <id> --state queued,injected --reason …`).

---

## 14. Outstanding work

Ordered roughly by how much the comms path depends on it. Each item names the symptom, the fix shape, and where to start.

**Transport receipt provenance.** A pid-bound 1000 ms probe observed no positive `orig_msg_id` acknowledgement from a real Claude receiver, so that path's transport ceiling is `sent` followed by durable reader evidence; `confirmed` remains reachable only when a runtime emits a positive application acknowledgement (evidence: `docs/plans/392-day3-codex-doctrine/reports/item-23-ack-measurement.md`). The transport taxonomy is `sent` (bytes flushed, no positive acknowledgement), `confirmed` (positive transport acknowledgement), `failed` (nothing landed or an explicit negative acknowledgement), and `unverified` (genuine submission uncertainty). Durable reader acknowledgement should outrank transport confidence, but a Claude-socket queue row recorded as `acked (reader=…)` is currently daemon-origin injection, not proof that the recipient read it; queue/receipt output must expose marker origin before that state can satisfy the durable-reader rule. Copilot RPC responses carrying a message id and successful Telegram API sends are genuine positive acknowledgements.

1. **Codex over the app-server socket (deferred; design exists).** Today: pointer only. Design: pij owns `codex app-server --listen unix://<PIJ_HOME>/<id>/codex.sock` and the pane runs `codex --remote unix://…`; the daemon is a second websocket client calling `turn/start` / `turn/steer`. Frame builders are done (§7.5). Three findings must be resolved first (`docs/plans/392-day3-codex-doctrine/deferred-codex-phase.md`): (a) the socket-first gate in `loop.ts:657-663` needs a `codex` capability branch (a `codexRemoteSock` descriptor field, additive) with a RED routing test; (b) the spawn contract is one `{cmd,args,env}` process with no shell composition (`spawn.ts:145-149`), so "start app-server *and* the TUI" needs a pij-owned supervisor/sidecar with allocation, revive, teardown, orphan reap; (c) codex-cli 0.148 requires `initialize` first, `threadId` on every read/start/steer, and `expectedTurnId` **mandatory** on `turn/steer` (the builder makes it optional, `codex-rpc.ts:60`) — decide whether `harnessSessionId` is the thread id. Also needs `codex login` on the box and a `--ws-auth` decision. Proof plan and Python probe snippet: `reports/pij-comms-review-2026-08-27/e-copilot-codex-ipc.md` §Codex.
2. **Token-scoped `resetClaimsOnStart`.** Boot currently re-queues every `claimed` row (`sqlite-queue.ts:408-423`), including a consumer's in-flight claim in another process (W2). Fix: reset only rows whose `claim_token` belongs to the daemon (its own token prefix), or record the claimant pid and reset only dead claimants.
3. **Spine-lock release/reclaim (G10).** `~/.pij/spine/write.lock` and `events.lock` outlive a killed daemon; every seat's event writes fail `E-NOREG … lock held`. Fix: release on SIGTERM; reclaim a lock whose recorded pid is dead (and append a spine note saying so). Related: queue/dispatch retire and un-retire should append a spine note (id, reason, actor, prior state) — today that history lives only in `receipts`/the dispatch record.
4. **Bridge `--skip-backlog`.** On restart the bridge forwards every `queued` row it finds (correct, but a long-dark bridge floods the phone). Add a flag/setting to retire (with reason) rather than forward rows older than a threshold at boot.
5. **Durable retry on Telegram API failure for media.** Text failures already retry through the lease (G5). Media gets one bounded retry then an echo to the sender; a durable retry would mean not counting a failed media part as handled — decide the contract first (a media-only message that can never send would otherwise park after 6 attempts, which may be the right answer).
6. **`crossSessionInbound: accept` at spawn (G21).** Add `--settings '{"crossSessionInbound":"accept"}'` to the Claude argv in `spawn.ts` (and revive) so delivery does not depend on the `from-mode` self-assertion. Verify Claude Code still honours the setting on the installed version.
7. **Hook-driven drain.** `pij inbox --inject` exists (§7.3) but pij installs no `SessionStart`/`UserPromptSubmit` hook for Claude or Copilot; a socketless seat only learns about mail when the daemon types a pointer and the model happens to act on it. Ship the hook files (Claude `settings.json` hooks; Copilot `~/.copilot/hooks/*.json` — note Copilot's `userPromptSubmitted` command-hook output is dropped, so use `sessionStart` `additionalContext` or the `notification`/`agentStop` hooks) and document them.
8. **`pij agent spawn` Copilot peers lack `rpcPort`.** Only the primary spawn and revive allocate a port; agent-pack peers fall to the pointer path (correct, slower). Plumb `pickFreePortSync` + `--ui-server` through `spawnAgentPane`.
9. **Card-write race (descriptor status fields).** The daemon's periodic `system-state` descriptor write carries a pre-read snapshot and can clobber a seat's own CLI status write (`statusAt`/`statusSeq`) that landed in between — evidence: a seat whose spine `status` event exists while its descriptor stayed at an older seq. Fix: merge-on-write for the status fields daemon-side, or CLI read-back-and-reapply. (Not on the message path, but the daemon's registry write path is shared with binding.)
10. **Watchdog/liveness notice routing.** Stall and liveness notices go to the seat's original spawner (`spawnedBy`), not its current `parent` link, so an adopted seat notifies the wrong session. Fix: route to `parent`, fall back to `spawnedBy` only when no parent.
11. **Bind-guard follow-ups (from G13).** (a) `isCopilotSessionId` has no direct test; (b) a bind refusal is silent and indefinite, and a probe that *cannot run* is treated as "foreign" — log it and distinguish indeterminate (retry with backoff) from foreign (refuse); (c) the resolver grep-sweep can be bypassed by reversed operands / destructuring / an allow-list window; (d) the sweep allow-list is disarmed on win32 (`endsWith` vs. `path.join` separators).
12. **Test ratchet on emitter text.** An integration test pins the *old* watchdog-nudge sentence and a doc is its only carrier, so the test is green when the doc is wrong and red when it is fixed. Fix: assert against the emitter's output (`buildWatchdogTurn`) minus its header; same stale quote in `docs/how/pij-watchdog.md`. (Pattern to avoid anywhere a test pins prose.)
13. **`pij send` backtick guard (G14).** Refuse (or warn on) a positional body containing unescaped `` ` `` / `$(` when stdin is a TTY, pointing at `--body-file`.
14. **Revive `--context long_context` (G2 follow-up).** `buildRevivedDescriptor`/revive argv never emits the flag; a revived Copilot silently loses the long-context tier. Reuse `resolveLongContext`.
15. **Flash interactive seats (G2).** `gemini-3.6-flash` still 400s interactively without the flag; root cause unknown. Until then treat it as headless-only.
16. **Option D — daemon socket for push.** `pij send` still relies on the ~600 ms tick to be noticed. The designed phase 2 (`c-durable-queue-design.md` §3, §7 "Wakeup path"): `<PIJ_HOME>/daemon.sock` (`net.createServer`, unlink-on-`ECONNREFUSED` at boot, keep the path < 103 bytes), `pij send` does insert+claim in one daemon event-loop turn on the socket and falls back to direct DB insert when the socket is absent, `subscribe` pushes `notify {to, seq}` to long-lived consumers, `pij tail -f` over receipts. No schema change needed.
17. **Lease extension for mid-turn recipients.** The pointer lease is a flat 90 s; a recipient in a long tool call gets re-pointed every 90 s (harmless: one line each, all acked at once by the next `pij inbox` — but unbounded, because daemon rows never increment `attempt`, G25). The review design borrowed the message-broker idea of an "in-progress" ack that extends the lease while pane signals show the recipient busy, instead of re-injecting. Add `not_before`/backoff if you do this (G24).
18. **Coalesced pointers.** `cursors.notified_seq` + `pointerLine(from, N)` exist for "N new — run: pij inbox --since <seq>"; the drain sends one row at a time. Batch per drain pass if pointer spam becomes a problem.
19. **Transcript-oracle CI.** The test matrix in `reports/pij-comms-review-2026-08-27.md` §10 (transcript-verified delivery of 500 B / 1.3 KB×12 / 2.6 KB / 3 KB×31 / single-line 1.3 KB bodies; receipt honesty; restart replay; event-spine completeness; a nightly multi-seat soak diffing sent ids against transcript-observed ids) is only partly encoded: restart replay and pty-chunk tests exist as unit tests; nothing runs a real `claude -p` in CI, and **no CI workflow currently runs any of the suite** — gates are run locally before merge.
20. **Archive/prune.** `messages`/`deliveries`/`receipts` grow forever. Add a prune of terminal rows older than N days by `seq` (keep `messages` if you want the audit).
21. **Attempt counting for daemon-delivered rows (G25).** `settle(seq,"injected")` never increments `attempt`, so `recoverStaleClaims` can re-queue a pointer row forever and `parked` is unreachable for it; a seat that never runs `pij inbox` gets a pointer every 90 s until retired by hand. Fix: have the daemon `claim()` before delivering (one code path for both consumers and the daemon, `resetClaimsOnStart` then covers it too), or increment `attempt` in `settle(...,"injected")`; add a test that a never-pulled pointer row parks.

---

## 15. Test map

| File | Covers | Named cases worth reading first |
|---|---|---|
| `EXT/adapters/sqlite-queue.test.ts` (379 lines) | store contract, leases, retire/unretire, summary, migration | `:38` 3 KB body byte-exact; `:120` crash between claim and inject is redelivered; `:150` settle(injected) keeps the row unacked until the recipient claims it; `:166` parks after maxAttempts; `:202` every mutator preserves terminality |
| `EXT/adapters/channel-factory.test.ts` | backend selection, `sqliteOf`, dual write | `:26` defaults to sqlite; `:70` finds the sqlite behind any backend; `:91` dual writes both under one id |
| `EXT/adapters/queue-consumer.test.ts` | §8 contract | all five (`:61`, `:96`, `:119`, `:158`, `:193`) |
| `EXT/adapters/claude-socket.test.ts` | frame, send, drop report, record resolution | `:70`, `:86`, `:98`, `:110`, `:124` |
| `EXT/adapters/copilot-rpc.test.ts` | RPC framing, errors, readiness | `:105`, `:119`, `:126`, `:134`, `:147` |
| `EXT/adapters/codex-rpc.test.ts` | frame builders only | `:15`, `:31`, `:49` |
| `EXT/core/daemon/loop.test.ts` (1513 lines) | routing | `:1171` socket-first; `:1281` copilot RPC; `:1308` pointer path; **`:1405-1513` routing invariant** |
| `EXT/adapters/daemon-tmux.test.ts` | typed path, outcomes, pointer log wording, `sendSocket` | search `pointer`, `UNVERIFIED`, `classifySendFailure` |
| `EXT/daemon.delivery.test.ts`, `EXT/daemon*.test.ts` | real-`Daemon` composition: `opts.kind` reaches the port, dual-backend pointer + recovery, auto-retire on deliberate close, dissolved-seat never injected (incident replay) | search `dual`, `retire`, `dissolved` |
| `EXT/telegram/bridge.test.ts` | sqlite forwarder: forwards once + acked after send; receipt not forwarded; backlog; production closure with a rejecting `send` stays claimed then resends after `recoverStaleClaims`; fs parity | search `sqlite` |
| `EXT/index.test.ts` | pi receiver on the consumer; fs parity; reload disposes the consumer | search `startQueueConsumer` |
| `EXT/core/cli.test.ts`, `EXT/core/inbox.sqlite.test.ts` | receipt classification incl. pane-less pull seat; `pij inbox` over sqlite | search `pull-inbox` |
| `EXT/cli.integration.test.ts` | real bin over a pipe: > 65,536 bytes of `pij queue` output | search `65_536` / `setBlocking` |

Run the repository's own gates, never ad-hoc `npx` compositions: `just typecheck` (`tsc --noEmit`), `just test [path/to/x.test.ts]` (vitest; the full pij extension suite is `just test .pi/extensions/pij/` — ~3,970 tests, ~15 skipped, ~1 min), and before declaring anything done or shipping, `harness checks` (the full deterministic gate: local-path portability → typecheck → lint → test → smoke → `pkg audit` → snapshots; `--quick` skips heavy smoke) — `justfile:74-86, 166-175`; `AGENTS.md:158-169`. Tests are written first, against fakes (`EXT/adapters/fakes.ts`), and reviewed by **mutation**: for every load-bearing hunk, revert or break it, re-run the named test, require RED, restore byte-identical, require GREEN — a green suite whose guards cannot be made to fail is treated as untested.

---

## 16. Operating notes

- **Inspect a delivery**: `pij queue --to <id>` (state + trail), or `sqlite3 ~/.pij/queue/pij.sqlite "select r.* from receipts r join messages m on m.seq=r.seq where m.id='<id>' order by r.id"`.
- **Inspect the transport**: daemon stderr — `queue backend: sqlite (…)` at boot; `route <id>: injected N message(s)`; `⚠️ claude SOCKET FAILED …`; `copilot NOT READY …`; `ℹ️ … pointer typed … submission unconfirmed …`; `retire <id>: N open deliveries retired (recipient closed)`.
- **Prove a Claude delivery**: the recipient's transcript `~/.claude/projects/<cwd-slug>/<sessionId>.jsonl` — look for the `<cross-session-message from="uds:pij-daemon" …>` content as a `user` turn or a `queued_command` attachment. **Never** take the model's own "I received …" as evidence.
- **Prove a Copilot delivery**: `~/.copilot/session-state/<uuid>/events.jsonl` — a `user.message` whose text is the framed body.
- **Which transport will a seat get?** `harness:"claude"` + a `~/.claude/sessions/<pid>.json` with `messagingSocketPath` ⇒ socket. `harness:"copilot"` + `rpcPort` on the descriptor (`pij list --json | jq '.[]|select(.id=="…")|.rpcPort'`) ⇒ RPC. Else pointer (sqlite/dual) or typed body (fs).
- **Run a second daemon safely** (tests, benchmarks): G15 recipe. Never point a second daemon at the production tmux server or `PIJ_HOME`.
- **After any daemon restart**: check both spine lock files (G10); confirm the boot log line shows the backend and the re-queued count; expect W2 duplicates for consumers that were mid-send.
- **Changing `SessionDescriptor`**: additive and migration-safe only — legacy descriptors must load. `rpcPort` is the model (`types.ts:254-256`).
- **Changing skill/prompt text** (`skills/pij/**`) is a production push: it is symlink-deployed to every agent on the machine the moment it lands.

---

## 17. Glossary

- **ack** — `deliveries.state='acked'`; the recipient (or the transport on its behalf) has taken the body. Terminal.
- **attempt** — per-row counter incremented **only by `claim()`** (consumer path); daemon-delivered rows keep `attempt` 0, so `parked` (attempt ≥ 6) applies to consumer rows only (G25).
- **claim / lease** — a time-boxed exclusive right to deliver one row (`claim_token`, `lease_until`).
- **composer** — the harness TUI's input box; the *composer-idle guard* refuses to type while a human is mid-sentence.
- **dual** — the rollout backend: SQLite truth + fs mirror.
- **framed body** — `[pij from <id>] <body>`.
- **inbox socket** — Claude Code's per-session Unix socket `/tmp/cc-socks/<pid>.sock`.
- **injected** — the recipient was *told* (pointer typed) but has not pulled; lease running.
- **parked** — open but exhausted (6 attempts); needs an operator.
- **pointer** — the one-line `… run: pij inbox` notice.
- **pull seat** — a session with no pane (or `deliveryMode:"pull"`); reads with `pij inbox`; the daemon never drains it.
- **retired / requeued** — operator or daemon terminal decision, and its reversal for `recipient-closed` only.
- **rpcPort** — descriptor field = Copilot `--ui-server` port = "this seat has an RPC endpoint".
- **seat** — one registered agent session (`~/.pij/<id>.json`).
- **seq** — global message rowid; per-recipient order.
- **settle** — daemon verb moving a row to `injected` (with lease) or back to `queued` (release).
- **spine** — the append-only NDJSON event log under `~/.pij/spine/` that `pij tail`/status use; unrelated to the queue except that it shares the daemon's lifecycle (G10).
- **tick** — the daemon's ~600 ms loop.
- **unverified** — typed, Enter unconfirmed; consumed for bodies, *not* for pointers.

---

## Appendix A — source index (all on `ed20a68`)

| Concern | File | Lines |
|---|---|---|
| Store, schema, state machine | `EXT/adapters/sqlite-queue.ts` | schema 93-131 · open 178-188 · deliver 219-260 · listUnread 265-278 · listQueued 284-292 · claimUnread/ack 302-353 · claim 359-381 · settle 385-405 · resetClaimsOnStart 408-423 · recoverStaleClaims 427-447 · retire 478-528 · unretire 533-561 · cursors 575-588 · importUnread 594-608 · summary 620-673 |
| Backend selection | `EXT/adapters/channel-factory.ts` | DEFAULT_BACKEND 44 · DualWriteChannel 56-102 · sqliteOf 106-110 · migrateFsInboxes 118-136 · openChannel 138-151 |
| Consumer | `EXT/adapters/queue-consumer.ts` | 22-74 |
| Claude socket | `EXT/adapters/claude-socket.ts` | resolve 43-65 · frame 92-107 · send 122-185 |
| Copilot RPC | `EXT/adapters/copilot-rpc.ts` | send 39-102 · readiness 117-173 |
| Codex builders | `EXT/adapters/codex-rpc.ts` | 42-79 |
| Daemon ports adapter (sockets + typed path) | `EXT/adapters/daemon-tmux.ts` | settle table 60-65 · sendSocket 272-327 · sendText 445-472 · sendTextUnchecked 477-565 |
| Pure routing | `EXT/core/daemon/loop.ts` | POINTER_LEASE_MS 51 · DaemonPorts 59-122 · composer guard 588-617 · pointerLine 622-626 · drainTmuxInbox 632-737 |
| Route decision / buffer | `EXT/core/daemon/router.ts` | injectionText 40 · route 77-87 · SendBuffer 99-176 |
| Daemon drain + boot | `EXT/daemon.ts` | auto-retire 848-856 · deliverPass 899 · per-seat drain 1169-1270 · boot/migrate/reset 1607-1639 |
| Framing | `EXT/core/message.ts` | frame 11-13 · parseFrame 16-23 · receiptBody 38-40 |
| `pij inbox` | `EXT/core/inbox.ts` | args 104-170 · consumeInbox 207-256 |
| `pij send` receipts, PIJ_SENDER, flush | `EXT/core/cli.ts` | daemonReceiptAuthoritative 707 · PIJ_SENDER 2008-2019 · classifySendReceipt 2263-2283 · effectiveDeliveryMode 2318-2322 · E-EMPTY 3356 |
| CLI bin entry (pipe flush) | `EXT/cli.ts` | setBlocking 4749-4750 |
| Spawn argv (Copilot flags, port) | `EXT/core/spawn.ts` | rpcPort/longContext inputs 347-350 · argv 455-508 · pickFreePortSync 1152-1161 |
| Revive re-allocates port | `EXT/core/revive.ts` | 51-53, 535-536 |
| Descriptor fields | `EXT/core/types.ts` | SessionDescriptor 175 · paneId 229 · harness 243 · deliveryMode 248 · harnessSessionId 252 · rpcPort 256 · lifecycle 274 · ReceiptState 577 |
| Outcome vocabulary | `EXT/core/ports.ts` | SendOutcome 47 |
| Init text telling a seat to `pij inbox` | `EXT/core/harness/claude.ts` | 158-161 |
| Long-context deny-set | `EXT/core/models/registry.ts` | 83 |
| Telegram forwarder | `EXT/telegram/bridge.ts` | startForwarder 558 · forwardOne 562-656 · sqlite branch 658-671 · fs branch 673-683 |
| pi receiver | `EXT/index.ts` | 320, 364-383 |
| Event-spine lock (`events.lock`) | `EXT/adapters/spine-store.ts` | 10, 78 |
| Platform write lock (`write.lock`) | `EXT/adapters/platform-write-lock.ts` | 3, 44, 58, 123 |
| Bind-health predicates (`pre-bind`, `bind-limbo`, `bind-failed`) | `EXT/core/bind-health.ts` | 30-47 |
| Operating guide | `docs/how/pij.md` | push/pull 61-73 · delivery routing 76-112 · queue inspection 114-152 · protocol 339-410 |
| Bridge guide | `docs/how/pij-telegram.md` | § Queue backend & restart semantics |
| Research + measurements | `reports/pij-comms-review-2026-08-27.md` (§1-13) and `reports/pij-comms-review-2026-08-27/{a-source-diagnosis,b-tmux-injection,benchmarks,c-durable-queue-design,d-prior-art,e-copilot-codex-ipc}.md` | — |
| Deferred Codex phase | `docs/plans/392-day3-codex-doctrine/deferred-codex-phase.md` | — |
