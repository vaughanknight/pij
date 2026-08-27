# pij comms review — (c) durable local queue design options

Research sub-seat (c), 2026-08-27. Scope: replace `pij send` → file → 600 ms daemon tick → `send-keys` body typing with a queue that is lossless, per-recipient ordered, at-least-once with idempotent ids, receipt-durable, restart/revive-safe, and sub-second locally — while shrinking the tmux injection to a short notification + pointer whose body the recipient reads from disk.

Grounding facts from the pij tree (`~/GitHub/pij`):

- Runtime: `package.json` `engines.node >=24`; local `node --version` = **v26.3.1**. `node:sqlite` is already imported in `.pi/extensions/session-sql/store.ts` (`DatabaseSync`), and `vitest.config.ts` shims it for older runtimes — so a SQLite spine adds no native dependency.
- Today's transport: `FsChannel.deliver` writes `<pijHome>/<to>/inbox/msg-<id>.json` via dot-tmp + `rename` (`.pi/extensions/pij/adapters/channel.ts`); the daemon drains per ~600 ms tick (`core/daemon/loop.ts`, `receipts.ts` notes 5–19 s tick ages under load); injection is `send-keys -l <framed body>` + settle (`ENTER_SETTLE_BY_HARNESS`, default 350 ms) + `Enter`, with a ~5 s verify ceiling that returns `unverified` (`adapters/daemon-tmux.ts`). `core/bg.ts` flattens newlines to ` ⏎ ` because "a real newline is a SUBMIT" on the `send-keys -l` path. The read marker is a separate `read-<id>.json`. Receipt states are `queued|delivered|unverified`.
- The live inbox watchers already abandoned `fs.watch` for a 500 ms poll because FSEvents was "costly to open (~0.6-1.6s/handle) and drops events SILENTLY under load" (`channel.ts`, `POLL_PRIMARY_DELIVERY_MS`).
- There is a multi-writer NDJSON spine (`adapters/spine-store.ts`) with an exclusive-create lock file, a newline guard for torn tails, and hard-link once-files for dedupe — i.e. pij has already paid for most of the JSONL-log tax once.

---

## 1. SQLite queue

### WAL semantics that matter here

- Concurrency: "WAL provides more concurrency as readers do not block writers and a writer does not block readers." Only one writer at a time; a long-running read transaction can stall checkpoints. Auto-checkpoint at 1000 WAL pages by default. [sqlite.org/wal.html]
- Durability knob: with `PRAGMA synchronous=NORMAL` in WAL mode, "WAL mode is always consistent … but WAL mode does lose durability. A transaction committed in WAL mode with synchronous=NORMAL might roll back following a power loss or system crash. Transactions are durable across application crashes regardless of the synchronous setting or journal mode." [sqlite.org/pragma.html#pragma_synchronous] For pij the threat model is daemon/CLI crash and session revival, not power loss — NORMAL is the right default; FULL costs an fsync per commit.
- `PRAGMA busy_timeout = ms` installs the busy handler so a second writer waits instead of throwing `SQLITE_BUSY`; SQLite's default is to fail immediately. [sqlite.org/pragma.html#pragma_busy_timeout, sqlite.org/faq.html#q5] Use `BEGIN IMMEDIATE` for claim transactions so the lock is taken up-front and the busy handler applies to the *begin*, not a mid-transaction upgrade.
- Multi-process on one host: "Multiple processes can have the same database open at the same time … But only one process can be making changes to the database at any moment." Locking is `fcntl` POSIX advisory locking; "this locking mechanism might not work correctly if the database file is kept on an NFS filesystem." [sqlite.org/faq.html#q5, sqlite.org/lockingv3.html] WAL additionally "does not work over a network filesystem" because the wal-index is shared memory. [sqlite.org/wal.html] Local APFS under `~/.pij` is the supported case.
- POSIX-lock footgun: "the close() system call will cancel all POSIX advisory locks on the same file for all threads and all file descriptors in the process" — never open the DB file with plain `fs` calls in the same process that holds a connection (e.g. for a backup) — SQLite ≥ 3.51.0 adds WAL-mode defenses but "they are not a cure-all." [sqlite.org/howtocorrupt.html §2.2]
- `RETURNING` exists since 3.35.0 (2021); it cannot be used inside subqueries/CTEs and row order is undefined — fine for `LIMIT 1` claims. [sqlite.org/lang_returning.html]

### The "SQLite as queue" patterns (prior art, exact SQL)

| Project | Claim | Visibility / retry | Notes |
|---|---|---|---|
| litequeue (Python) | `UPDATE Queue SET status=LOCKED, lock_time=:now, claim_id=claim_id+1 WHERE rowid=(SELECT rowid FROM Queue WHERE status=READY ORDER BY message_id LIMIT 1) RETURNING *` inside `BEGIN IMMEDIATE` | `done(message_id, claim_id)` must match the claim; `list_locked(threshold)` + `retry()` return stale locks to READY | Pragmas: `journal_mode=WAL`, `synchronous=NORMAL`, `temp_store=MEMORY`; unique index on `message_id` (idempotency key); one write connection + pool of `query_only` readers. `claim_id` fences a stale worker from acking a newer delivery. [github.com/litements/litequeue, src/litequeue/__init__.py] |
| goqite (Go) | `update goqite set timeout=?, received=received+1 where id=(select id from goqite where queue=? and ?>=timeout and received<? order by priority desc, created limit 1) returning id, body` | Visibility timeout column (`timeout`), `Extend()` pushes it, `Delete()` acks; `received < maxReceive` (default 3) caps redelivery | Recommends `?_journal=WAL&_timeout=5000` and `SetMaxOpenConns(1)`. [github.com/maragudk/goqite, goqite.go] |
| pgmq (Postgres) | CTE `SELECT msg_id … WHERE vt <= clock_timestamp() ORDER BY msg_id LIMIT $1 FOR UPDATE SKIP LOCKED` then `UPDATE … SET vt = now()+vt, read_ct = read_ct+1 … RETURNING` | `vt` visibility timeout; `read_ct` counts deliveries; `archive()` moves to `a_<queue>` for replay instead of delete | SQLite has no `SKIP LOCKED`; the single-writer lock plus `BEGIN IMMEDIATE` gives the same exclusivity. [github.com/pgmq/pgmq, pgmq-extension/sql/pgmq.sql] |

Common shape: one table, status/visibility column, monotonic id for order, `UPDATE … WHERE id = (subselect LIMIT 1) RETURNING` for an atomic claim, a counter for redelivery caps, a claim/lease token so a late ack from a dead worker cannot clobber a redelivery. Per-consumer cursors are the Kafka alternative (§4): store `last_acked_seq` per recipient instead of per-message state; pij wants both — per-message state for receipts and observability, a per-recipient cursor for fast `inbox --since`.

### Node.js bindings

- `node:sqlite` — Stability 1.2 (release candidate) per current docs; added v22.5.0, unflagged since v22.13.0/v23.4.0. `DatabaseSync`/`StatementSync` are fully synchronous; constructor `timeout` (ms) is the busy timeout; supports pragmas, WAL, `RETURNING`, prepared statements. [nodejs.org/api/sqlite.html] pij is on Node 26 and already uses it → zero new deps, no native build, works under `tsx` and vitest.
- `better-sqlite3` — synchronous native addon; recommends `journal_mode = WAL`; compiled with `SQLITE_DEFAULT_WAL_SYNCHRONOUS=1` so WAL defaults to `synchronous=NORMAL`. [github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md] Faster statement cache but needs prebuilt binaries per Node ABI — the wrong trade for a CLI installed via `npm link` on Node 26.
- Recommendation: `node:sqlite`, one `DatabaseSync` per process, `PRAGMA journal_mode=WAL; synchronous=NORMAL; busy_timeout=5000; foreign_keys=ON`.

### Latency numbers

Microbenchmarks (single-row INSERT, WAL): M1 MacBook Air **8 µs/insert (113k/s) with `synchronous=NORMAL`** vs 37 µs with the default sync; Linux x86 12 µs vs 211 µs; Linux ARM 18 µs vs 585 µs. [marending.dev/notes/sqlite-benchmarks/] phiresky reports 100k SELECT/s with WAL + NORMAL on commodity hardware. [phiresky.github.io/blog/2020/sqlite-performance-tuning/] So enqueue+claim+ack is tens of microseconds of SQLite time; end-to-end latency will be dominated by how the daemon is *woken*, not by the store.

---

## 2. Append-only JSONL per-recipient logs

### Append atomicity

- POSIX: "If the O_APPEND flag … is set, the file offset shall be set to the end of the file prior to each write and no intervening file modification operation shall occur between changing the file offset and the write operation." The `{PIPE_BUF}` non-interleave guarantee is stated only for pipes/FIFOs; for regular files POSIX guarantees ordering, not non-interleaving. [pubs.opengroup.org write()] In practice Linux and macOS local filesystems make each `write(2)` in O_APPEND mode a single atomic append (up to the 2 GB syscall cap on Linux) — but *one record must be one syscall*, and NFS breaks it. [nullprogram.com/blog/2016/08/03/, notthewizard.com 2014] Node: use `fs.writeSync(fd, wholeLineBuffer)` on an fd opened with `'a'`; never `fs.appendFile` with string chunks, never two writes per record.
- Torn tails: a writer killed mid-`write` (or a full disk) can leave a partial last line; pij's spine already carries the "newline guard" for exactly this. Readers must tolerate a trailing partial line and skip it.
- Atomic file replacement (for cursor/ack files): write temp on same filesystem → `fsync(temp)` → `rename` → `fsync(dir)`; the directory fsync is what makes the new name durable. [lwn.net/Articles/457667/] pij's `adapters/atomic-file.ts` does this.

### Cursors and acks on a log

- Per-recipient log `inbox/<to>.ndjson`, one record per message with a monotonically increasing `seq` (allocated under a lock, as `spine-store.ts` does — the review there found caller-side `lastSeq()+1` lost events).
- Ack = the recipient's `cursor.json` `{ackedSeq}` (atomic replace), plus optionally a per-message `ack-<id>` append into a receipts log for observability. Kafka-style: "read, process, then save position" ⇒ at-least-once; "save position then process" ⇒ at-most-once. [kafka.apache.org design §Message Delivery Semantics]
- Dedupe on redelivery: the recipient keeps `seen(message_id)` (idempotent-consumer pattern: "record the IDs of processed messages in the database" in the same transaction). [microservices.io idempotent-consumer]
- Compaction: rotate `inbox/<to>.ndjson` when `ackedSeq` covers it; keep the old segment for `pij tail`.

### Wakeups: fs.watch vs polling

- Node `fs.watch` uses FSEvents on macOS for directories and kqueue for files; the API is "not 100% consistent across platforms"; `filename` may be null; `fs.watchFile` polls. [nodejs.org/api/fs.html#caveats]
- FSEvents takes a `latency` (seconds) that coalesces events; with `latency=0.01` a real-world watcher saw ~2–4 ms between mtime and callback, but events are directory-granular and coalesced. [alexwlchan.net/2026/watch-files-on-macos/, developer.apple.com FSEvents Programming Guide, pkg.go.dev/github.com/fsnotify/fsevents]
- pij's own field data overrides the theory: FSEvents handles were slow to open (0.6–1.6 s) and dropped events under load, so `channel.ts` is poll-primary at 500 ms + 20 ms debounce. A JSONL design therefore does *not* get sub-second wakeups from the filesystem for free; it needs a socket/pipe nudge (§3) or accepts ~250 ms mean latency from a 500 ms poll.

Verdict: JSONL is a fine *durable spine* (pij already runs one) but a poor *queue index*: claim state, per-message receipts, visibility timeouts and "what is unacked for recipient X" all need a second structure, which is exactly what SQLite gives for free.

---

## 3. Unix domain socket daemon API

- Node `net.createServer().listen(path)` gives a UDS; path limit 103 bytes on macOS (107 Linux); `server.close()` unlinks the socket, but after a crash "a Unix domain socket will be visible in the file system and will persist until unlinked"; `listen` on an existing path → `EADDRINUSE`. [nodejs.org/api/net.html#identifying-paths-for-ipc-connections] Client connect to a missing path → `ENOENT`; to a stale path with no listener → `ECONNREFUSED`. Boot recipe: try `connect`; on `ECONNREFUSED` unlink and `listen`; keep `<pijHome>/daemon.sock` short (macOS `$HOME` paths are safely under 103 bytes; do not put it inside a deep per-session dir).
- Latency: kernel-level UDS RTT ~2–5 µs vs ~4–15 µs TCP loopback on Linux [kamalmarhubi.com 2015, eli.thegreenplace.net 2019]; measured in Node: **130 µs UDS vs 334 µs TCP loopback** request/response. [nodevibe.substack.com UDS guide] Either is far below the 600 ms tick; the win is the *push* (no tick) rather than the µs.
- Versus local HTTP on loopback: HTTP adds framing/parsing, a port to allocate and collide on, and no filesystem permission boundary; a UDS is owner-only by directory mode and needs no port registry. HTTP's only advantage (curl-ability) is recoverable with `pij` subcommands and a `pij tail`. Keep HTTP out.
- Protocol: newline-delimited JSON frames `{op:"send", id, to, from, body|bodyPath, ts}` → `{ok, seq}` receipt; `{op:"ack", id, state}`; `{op:"subscribe", sessionId}` for long-lived recipients (pi in-process receiver) so the daemon can push `{op:"notify", to, seq}` without any filesystem watch — "inotify-free notification".
- Daemon down: client writes the row directly into the SQLite spine (same schema, `state='queued'`), returns `queued (daemon offline)`; on start the daemon scans `state IN ('queued','claimed') ORDER BY seq` and resumes — this is the NATS/Kafka "the log is the truth, the broker is a cache" stance and is what makes the socket optional rather than load-bearing.

---

## 4. Broker semantics to borrow

- NATS JetStream consumers: `AckExplicit` (default; every message acked), `AckWait` ("if an acknowledgment is not received in time, the message will be redelivered"), `MaxDeliver`, `MaxAckPending`, `BackOff` (per-attempt delays overriding AckWait), `DeliverPolicy` (all/last/new/by_start_sequence), durable consumers that "resume until … explicitly deleted". Ack verbs: `+ACK`, `-NAK` (retry now), `+WPI` (in-progress: extend AckWait), `+TERM` (stop redelivery without success). Each delivery attempt increments the *consumer sequence* while the *stream sequence* stays fixed, so redeliveries are visible as `consumer_seq > stream_seq`. Deduplication: "JetStream support idempotent message writes by ignoring duplicate messages as indicated by the `Nats-Msg-Id` header … The default window to track duplicates in is 2 minutes." Exactly-once = dedupe on publish + double-ack (`AckSync`) on consume. [docs.nats.io consumers.md, model_deep_dive.md]
- Kafka: at-most-once / at-least-once / exactly-once defined; consumer offset ordering decides which; idempotent producer dedupes by (producer id, sequence number); store the offset *with* the output to get exactly-once against an external system. [kafka.apache.org design §Message Delivery Semantics]
- ZeroMQ: no persistence; "When a queue overflows, it starts to discard messages. So we get 'lost' messages"; reliability (Lazy Pirate, Titanic disk queue) is layered by the application. Alone it is a transport, not a queue — it would reproduce today's loss with lower latency. [zguide.zeromq.org/docs/chapter4/]
- Litestream: replicates SQLite by holding a read transaction to block checkpoints and shipping WAL frames asynchronously (≈1 s loss window). Not needed locally, but it confirms the WAL *is* the durable unit and that a single SQLite file is enough of a spine to replicate later if pij ever goes multi-host. [litestream.io/how-it-works/]

Borrow list for pij: at-least-once + sender-minted idempotency id (`Nats-Msg-Id`) with a dedupe index; explicit ack with a lease/visibility timeout and `max_deliver`; `+WPI`-style lease extension while a recipient is mid-turn; `+TERM` for dead recipients; a per-recipient monotonic seq (stream seq) and a per-delivery attempt counter (consumer seq); `DeliverPolicy=by_start_sequence` as `pij inbox --since <seq>`; archive rather than delete.

---

## 5. tmux / composer facts

tmux (man page, OpenBSD tmux.1 rev 1.1159, 2026-08-25):

- `send-keys [-FHKlMRX] [-N repeat] [-t pane] key …`: "if the string is not recognised as a key, it is sent as a series of characters"; `-l` "disables key name lookup and processes the keys as literal UTF-8 characters"; `-H` hex bytes. A literal `\n` in a `-l` argument is delivered as the byte 0x0a, which every line-editing TUI treats as Enter unless wrapped in bracketed paste — hence pij's ` ⏎ ` flattening.
- `paste-buffer [-dprS] [-b name] [-s sep] [-t pane]`: "any linefeed (LF) characters in the paste buffer are replaced with a separator, by default carriage return (CR)"; `-r` no replacement; `-p`: "paste bracket control codes are inserted around the buffer **if the application has requested bracketed paste mode**"; `-d` deletes the buffer; control chars sanitised with `vis(3)` unless `-S`.
- `load-buffer [-b name] path` (path `-` = stdin) and `set-buffer [-a] [-b name] data`.
- Size limit (verified in source): every tmux client command is packed into one imsg; `client.c` rejects `size > MAX_IMSGSIZE - sizeof(*data)` with "command too long", and `compat/imsg.h` sets `MAX_IMSGSIZE 16384`. So `send-keys -l <body>` and `set-buffer <body>` are capped at ~16 KB of argv; `load-buffer <path>` reads the file server-side and has no such cap. [github.com/tmux/tmux client.c, compat/imsg.h, cmd-load-buffer.c]

Claude Code composer (official docs, current):

- "Pressing Enter submits your message. To add a line break without submitting, press Ctrl+J, or type `\` and then press Enter." Shift+Enter works natively in iTerm2/Ghostty/Kitty/WezTerm/Warp/Apple Terminal/Windows Terminal, but "If you are running inside tmux, Shift+Enter also requires the tmux configuration" (`set -s extended-keys on`, `set -as terminal-features 'xterm*:extkeys'`, `set -g allow-passthrough on`). [code.claude.com/docs/en/terminal-config]
- Paste: "When you paste more than 800 characters or more than two lines into the prompt, Claude Code collapses the input to a placeholder such as `[Pasted text #1 +120 lines]` … The full content is still sent to Claude when you submit." Pasted text is kept under `~/.claude/paste-cache/`. [terminal-config §Paste large content] Bracketed paste therefore keeps a multi-line body as one message.
- Mid-turn: "Type a message and press Enter while Claude is working. Claude Code queues the message instead of interrupting the turn … if you queue a message while Claude is running tool calls, Claude Code passes it to Claude as soon as those tool calls finish, within the same turn. When the turn ends, Claude Code sends the messages that are still queued as the next turn, each as a separate message." `Esc` interrupts and sends the queue immediately; `Up` takes queued text back into the composer. [code.claude.com/docs/en/interactive-mode §Queue messages while Claude works]
- Known hazards: with `extended-keys-format csi-u` tmux re-encodes CR inside bracketed paste as CSI-u and Claude Code drops the newlines [anthropics/claude-code#43169]; a fixed 0.1 s between paste and Enter is too short — the Enter lands before the paste is converted to the `[Pasted text]` chip and is ignored, leaving text stranded in the composer [obra/claude-session-driver#20] (pij's `ENTER_SETTLE`/`unverified` logic is the same lesson); after `Esc Esc` on multi-line input `send-keys -l` stopped working for the pane [anthropics/claude-code#31739]; queued messages flush at the next LLM pause, not true end-of-turn, and can derail the current task [anthropics/claude-code#49373]; queued `/commands` are sent as raw text [#18399]. pi's TUI had its own "submit on first newline inside tmux" bug [earendil-works/pi#2376] — irrelevant for typing (pi peers are inbox-delivered in-process) but a reason not to type bodies into *any* composer.

Implication: the *only* thing that should ever be typed into a pane is a one-line ASCII notification ≤ a few hundred bytes with no newline, followed by a settle and Enter, and even that must be verified (composer capture) because the composer can be busy, held by a human, or mid-compaction. Bodies live on disk and are pulled by the recipient (`pij inbox`), which also survives the paste-cache/CSI-u/`[Pasted text]` failure modes entirely.

---

## 6. Options table

Scale: ●●● best, ● worst. "Mid-turn" = recipient is generating/tool-calling; "compacted" = inside `/compact`; "dead" = pane gone; "revived" = new pane bound to the same seat id.

| | Loss | Ordering | Latency | Observability (`pij tail`) | Migration cost | Mid-turn | Compacted | Dead | Revived |
|---|---|---|---|---|---|---|---|---|---|
| **A. status quo** file + 600 ms tick + `send-keys -l` body | ● body typed = only copy in composer; `unverified` consumes; 16 KB argv cap; newline flattening | ●● per-dir readdir order, buffer FIFO in memory | ● tick 600 ms nominal, 5–19 s observed | ●● per-message JSON files, read markers | — | ● queued into Claude's own queue, flushes at next LLM pause; composer hold races | ●● daemon holds drain (DL-004) | ●● file left unread, seat unbound | ● in-memory `SendBuffer` lost on daemon restart; re-drained from files only if unread |
| **B. per-recipient JSONL log + notify pointer** | ●●● single-syscall append, fsync'd; body never typed | ●●● seq under lock, per recipient | ●● 500 ms poll (FSEvents unreliable) unless a socket nudge is added | ●●● `tail -f` works literally | ●● new log + cursor + receipts log; reuse spine-store code | ●●● one-line notify queues harmlessly; body read on demand | ●●● notify deferred, body waits | ●●● stays in log | ●●● `cursor.ackedSeq` → catch up with `inbox --since` |
| **C. SQLite WAL queue + spine + notify pointer** | ●●● durable across process crash (NORMAL), FULL optional | ●●● `seq INTEGER PRIMARY KEY` per recipient, single writer | ●● same wake problem as B without a socket; store cost ~10 µs | ●● needs `pij tail` to render rows (trivial), no raw `tail -f` | ●● schema + adapter; `node:sqlite` already in tree | ●●● | ●●● | ●●● `TERM`/park | ●●● cursor row per seat, `inbox --since` is one indexed query |
| **D. UDS daemon API fronting C, direct-DB fallback** | ●●● same as C; daemon down ⇒ client writes DB directly, daemon replays | ●●● daemon is the single claimer; DB is truth | ●●● push: send → notify in ~1–5 ms; no tick on the hot path | ●● as C plus live `subscribe` stream for `pij tail -f` | ● most code: socket server, client, fallback, replay | ●●● | ●●● | ●●● | ●●● daemon restart replays `queued/claimed`; revive = re-subscribe |
| **E. keep body typing via `load-buffer` + `paste-buffer -p`** | ●● no argv cap, newlines survive; still relies on composer accept + Enter race; paste-cache/CSI-u bugs | ●● | ● still tick-driven | ●● | ●●● smallest change | ● lands in Claude's queue as a `[Pasted text]` chip; Enter race (#20) | ●● | ●● | ● |

Reading: E fixes clipping but not loss or latency. B and C are equivalent on the durability axis; C wins on query/receipt/cursor structure and is cheaper than B once receipts and leases are added; B wins only on `tail -f` literalness. D is C plus a push path and is the only option that delivers "sub-second" *by construction* rather than by shortening the tick. Recommended: **C now, D's socket as the second phase** — C's schema is designed so that D adds no migration.

---

## 7. Recommended design sketch

### Store

One file `<pijHome>/queue/pij.sqlite` (WAL; `-wal`/`-shm` siblings live beside it; local APFS only). Opened via `node:sqlite` `DatabaseSync(path, { timeout: 5000 })`, then:

```sql
PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON;
```

```sql
CREATE TABLE messages (
  seq          INTEGER PRIMARY KEY,           -- global monotonic (rowid); ordering spine
  id           TEXT NOT NULL UNIQUE,          -- idempotency key, minted by sender (see below)
  to_id        TEXT NOT NULL,
  from_id      TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'text',  -- text | command | receipt | notify-only
  body         TEXT,                          -- inline when small
  body_path    TEXT,                          -- <pijHome>/<to>/inbox/msg-<id>.json for large bodies / attachments
  attachments  TEXT,                          -- JSON array, reference-passing as today
  created_at   INTEGER NOT NULL,             -- ms epoch
  not_before   INTEGER NOT NULL DEFAULT 0    -- delay / backoff
);
CREATE INDEX messages_to_seq ON messages(to_id, seq);

CREATE TABLE deliveries (                     -- one row per message; delivery state machine
  seq          INTEGER PRIMARY KEY REFERENCES messages(seq),
  to_id        TEXT NOT NULL,
  state        TEXT NOT NULL,                 -- queued | claimed | injected | acked | parked | terminated
  attempt      INTEGER NOT NULL DEFAULT 0,    -- "consumer sequence": increments per claim
  claim_token  TEXT,                          -- lease id; acks must present it (litequeue claim_id)
  lease_until  INTEGER,                       -- visibility timeout (goqite/pgmq vt)
  injected_at  INTEGER, acked_at INTEGER, last_error TEXT
);
CREATE INDEX deliveries_ready ON deliveries(to_id, state, lease_until, seq);

CREATE TABLE receipts (                       -- durable, append-only audit; feeds `pij tail` and sender-side status
  id           INTEGER PRIMARY KEY,
  seq          INTEGER NOT NULL REFERENCES messages(seq),
  state        TEXT NOT NULL,                 -- queued | claimed | injected | delivered | read | acked | redelivered | parked | terminated
  attempt      INTEGER NOT NULL,
  at           INTEGER NOT NULL,
  detail       TEXT
);
CREATE INDEX receipts_seq ON receipts(seq, id);

CREATE TABLE cursors (                        -- per-recipient consumer cursor
  to_id        TEXT PRIMARY KEY,
  acked_seq    INTEGER NOT NULL DEFAULT 0,    -- contiguous ack floor (NATS "acknowledgment floor")
  notified_seq INTEGER NOT NULL DEFAULT 0,    -- highest seq a pane notification has been injected for
  updated_at   INTEGER NOT NULL
);
```

Per-recipient ordering falls out of `seq` (global rowid, allocated by the single writer). `messages` is never mutated after insert; `deliveries` holds the mutable state; `receipts` is append-only. Archive = keep `messages` rows (pgmq's `archive` idea) and prune `deliveries/receipts` older than N days by `seq`.

### Idempotency key

`id = <from>-<ulid>` minted by the *sender* CLI before any I/O (like `Nats-Msg-Id` / Kafka producer sequence). `INSERT OR IGNORE INTO messages … ; SELECT seq FROM messages WHERE id=?` makes a retried `pij send` (socket timeout, daemon restart mid-write) a no-op that still returns the original `seq`. The recipient side is idempotent too: `pij inbox` marks `read` by `id`, and the receipt insert is `UNIQUE(seq,state,attempt)`-guarded so a duplicate ack is absorbed.

### Delivery state machine

```
queued ──claim──▶ claimed ──inject ok──▶ injected ──ack (pij inbox / read)──▶ acked
  ▲                 │  inject failed/held            │ lease_until passes, no ack
  │                 ▼                                ▼
  └──── lease expiry / NAK ◀─────────────── redelivered (attempt+1) ──▶ parked (attempt ≥ max_deliver)
                                                                       └──▶ terminated (recipient dead + no revive within TTL)
```

- **claim** (daemon, per tick or per socket nudge), one transaction:
  ```sql
  BEGIN IMMEDIATE;
  UPDATE deliveries SET state='claimed', attempt=attempt+1, claim_token=?, lease_until=?
   WHERE seq = (SELECT seq FROM deliveries WHERE to_id=? AND state IN ('queued')
                 AND (lease_until IS NULL OR lease_until < ?) ORDER BY seq LIMIT 1)
     AND state='queued'
  RETURNING seq, attempt;
  INSERT INTO receipts(seq,state,attempt,at) VALUES (?, 'claimed', ?, ?);
  COMMIT;
  ```
  Strictly one in-flight claim per recipient (`MaxAckPending=1`) so notifications land in order and the composer never sees two pointers; batching is done by the *notification text* ("3 new: seq 41–43"), not by multiple claims.
- **inject**: type a single line, e.g. `[pij 41–43 from alpha] run: pij inbox --since 40` (ASCII, no newline, < 200 bytes, far under the 16 KB imsg cap), settle per harness, `Enter`, verify by capture-pane as today. Success → `state='injected'`, `notified_seq=max(seq)`, receipt `injected`. Composer held by human / busy compact / capture mismatch → release the claim back to `queued` with `not_before = now + backoff` (no attempt burn for `held`, matching plan 071 D7), receipt `held`. For pi/in-process recipients (`observe` route today) the daemon skips injection and pushes `notify` over the socket / the recipient polls; state goes straight to `injected` (meaning "notified").
- **ack**: the recipient's `pij inbox` (or the pi thin receiver) reads bodies `WHERE to_id=? AND seq > acked_seq ORDER BY seq`, prints them, and in one transaction sets `deliveries.state='acked'` for those seqs, appends `read`/`acked` receipts, and advances `cursors.acked_seq` to the contiguous floor. `pij inbox --peek` reads without acking. Bodies stay readable after ack (`pij inbox --since 0 --all`).
- **redelivery**: a sweep (same tick loop) does `UPDATE deliveries SET state='queued', claim_token=NULL WHERE state IN ('claimed','injected') AND lease_until < now AND attempt < max_deliver` → receipt `redelivered`. Lease = `AckWait`; defaults: 90 s for a bound tmux seat (long enough for a mid-turn recipient to finish tool calls; Claude queues the pointer and flushes it at the next pause), `BackOff` `[5s, 30s, 120s, 600s]`, `max_deliver = 6` → `parked` (NATS: stop redelivering, keep the message). A recipient that is mid-turn can be seen from pane signals; the daemon then `+WPI`-extends the lease instead of re-injecting, so a long tool run does not cause duplicate pointers.
- **dead**: `route → gone` today leaves the file unread; here it leaves `queued` untouched and records `parked` only after TTL. **revived**: on bind the daemon does not replay bodies; it injects one pointer `pij inbox --since <acked_seq>` and the recipient pulls everything at once, in order. `notified_seq` being ahead of `acked_seq` after a revive is the signal that the previous pane was told but never read — surfaced in `pij status`.
- **compaction**: the drain hold stays (`isCompacting`), but a pointer that was injected *before* compaction and eaten by the reset is simply unacked; lease expiry re-notifies. Nothing is lost because the body was never in the composer.
- **daemon restart**: no in-memory `SendBuffer`; on start, `UPDATE deliveries SET state='queued' WHERE state='claimed'` (a claim without a live daemon is meaningless), then resume. Receipts show the gap.

### Sender-side receipts

`pij send` returns immediately with `{id, seq, state:'queued'}`. `pij send --wait` blocks on the socket (D) or polls `receipts` (C) until `injected`/`acked`/`parked` or timeout. The `queued|delivered|unverified` vocabulary maps to `queued|injected|acked` plus `parked`; `daemonTickStatus` staleness still applies but stops being the ordinary case once claims are pushed.

### Observability

`pij tail [--to X] [--since seq] [-f]` = `SELECT … FROM receipts JOIN messages` ordered by `receipts.id`; `-f` polls the max receipt id at 250 ms (or subscribes over the socket in D). `pij inbox --since N` is `WHERE to_id=? AND seq>N ORDER BY seq`. Both are single indexed scans. Because the DB is one file, `sqlite3 ~/.pij/queue/pij.sqlite 'select …'` works for humans and the harness smoke tests.

### Wakeup path (phase 2 → option D)

`<pijHome>/daemon.sock` (`net.createServer`, unlink-on-ECONNREFUSED at boot). `pij send` tries the socket first: daemon does the insert *and* the claim in the same tick of its event loop → pointer injection begins within milliseconds. On `ENOENT/ECONNREFUSED` the CLI opens the DB itself, inserts, and exits; the daemon's tick (kept as a 500 ms safety net, also the lease sweeper) picks it up. Long-lived recipients (pi thin receiver, telegram bridge) `subscribe` on the socket and get `notify {to, seq}` pushes instead of polling files — the FSEvents dependency disappears rather than being tuned.

### Migration

1. Land the SQLite adapter behind the existing `DeliveryPort`/`InboxPort` seams (`core/ports.ts`), writing both the row and today's `msg-<id>.json` (body_path) for one release so `pij inbox` on old peers still works.
2. Switch `drainTmuxInbox` to claim-from-DB and inject pointers; keep `injectionText` for `command` kinds (`/compact` must still be typed raw).
3. Switch `pij inbox` to the DB, acking on read; delete the read-marker files.
4. Add the socket (D). Remove the JSON inbox writes.

---

## Sources

SQLite
- https://www.sqlite.org/wal.html — WAL concurrency, checkpoints, "does not work over a network filesystem"
- https://www.sqlite.org/pragma.html#pragma_synchronous — NORMAL vs FULL durability text; https://www.sqlite.org/pragma.html#pragma_busy_timeout
- https://www.sqlite.org/howtocorrupt.html — NFS locking bugs, POSIX close() lock cancellation, 3.51.0 defenses
- https://www.sqlite.org/lockingv3.html — POSIX advisory locks, SQLITE_BUSY
- https://www.sqlite.org/faq.html#q5 — multi-process access, one writer, busy handler
- https://www.sqlite.org/useovernet.html — network filesystem hazards
- https://www.sqlite.org/lang_returning.html — RETURNING since 3.35.0, limitations
- https://nodejs.org/api/sqlite.html — node:sqlite stability, DatabaseSync options (timeout)
- https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md — WAL recommendation, SQLITE_DEFAULT_WAL_SYNCHRONOUS=1
- https://marending.dev/notes/sqlite-benchmarks/ — insert latency numbers (M1: 8 µs WAL+NORMAL)
- https://phiresky.github.io/blog/2020/sqlite-performance-tuning/ — WAL + NORMAL tuning
- https://github.com/litements/litequeue and https://github.com/litements/litequeue/blob/HEAD/src/litequeue/__init__.py — claim SQL, claim_id, pragmas
- https://github.com/maragudk/goqite and https://github.com/maragudk/goqite/blob/main/goqite.go — UPDATE…RETURNING with timeout/received
- https://github.com/pgmq/pgmq and https://github.com/pgmq/pgmq/blob/main/pgmq-extension/sql/pgmq.sql — vt, read_ct, SKIP LOCKED, archive
- https://litestream.io/how-it-works/ — WAL shipping, async ~1 s window

Files / JSONL / watching
- https://pubs.opengroup.org/onlinepubs/9699919799/functions/write.html — O_APPEND, PIPE_BUF
- https://nullprogram.com/blog/2016/08/03/ — multi-process append atomicity in practice
- https://www.notthewizard.com/2014/06/17/are-files-appends-really-atomic/ — PIPE_BUF myth for regular files
- https://lwn.net/Articles/457667/ — fsync temp, rename, fsync directory
- https://nodejs.org/api/fs.html#caveats — fs.watch FSEvents/kqueue, filename null, watchFile polling
- https://alexwlchan.net/2026/watch-files-on-macos/ — FSEvents latency parameter, 2–4 ms observed
- https://developer.apple.com/library/archive/documentation/Darwin/Conceptual/FSEvents_ProgGuide/UsingtheFSEventsFramework/UsingtheFSEventsFramework.html — directory-granular events, latency
- https://pkg.go.dev/github.com/fsnotify/fsevents — latency = throttle/coalesce
- https://microservices.io/patterns/communication-style/idempotent-consumer.html — processed-message-id table

Sockets
- https://nodejs.org/api/net.html#identifying-paths-for-ipc-connections — path limits (103/107), unlink semantics, EADDRINUSE
- https://kamalmarhubi.com/blog/2015/06/10/some-early-linux-ipc-latency-data/ — UDS vs TCP loopback µs
- https://eli.thegreenplace.net/2019/unix-domain-sockets-in-go/ — UDS latency/throughput
- https://nodevibe.substack.com/p/the-nodejs-developers-guide-to-unix — Node: 130 µs UDS vs 334 µs TCP loopback

Brokers
- https://github.com/nats-io/nats.docs/blob/master/nats-concepts/jetstream/consumers.md — AckPolicy, AckWait, MaxDeliver, MaxAckPending, BackOff, DeliverPolicy
- https://github.com/nats-io/nats.docs/blob/master/using-nats/jetstream/model_deep_dive.md — Nats-Msg-Id dedupe (2 min), +ACK/-NAK/+WPI/+TERM, double-ack exactly-once, consumer vs stream sequence
- https://docs.nats.io/nats-concepts/jetstream/streams — duplicate window, stream sequence
- https://github.com/apache/kafka/blob/trunk/docs/design/design.md — Message Delivery Semantics, offset commit ordering, idempotent producer
- https://zguide.zeromq.org/docs/chapter4/ — no persistence, lost messages, Pirate/Titanic patterns

tmux / composers
- https://raw.githubusercontent.com/tmux/tmux/master/tmux.1 (OpenBSD tmux.1 r1.1159, also https://man.openbsd.org/tmux.1) — send-keys -l, paste-buffer -p/-r/-s, load-buffer, set-buffer
- https://github.com/tmux/tmux/blob/master/client.c and https://github.com/tmux/tmux/blob/master/compat/imsg.h — "command too long" at MAX_IMSGSIZE 16384
- https://code.claude.com/docs/en/interactive-mode — multiline input, queue messages while Claude works, Esc/Up behaviour
- https://code.claude.com/docs/en/terminal-config — Ctrl+J / `\`+Enter, tmux extended-keys config, paste >800 chars or >2 lines collapses to `[Pasted text #N]`
- https://github.com/anthropics/claude-code/issues/43169 — csi-u encodes CR inside bracketed paste, newlines lost
- https://github.com/anthropics/claude-code/issues/30239 — bracketed paste through ssh+tmux (Ctrl-G vim) broken
- https://github.com/anthropics/claude-code/issues/31739 — send-keys -l stops working after Esc,Esc on multi-line input
- https://github.com/anthropics/claude-code/issues/49373 and https://github.com/anthropics/claude-code/issues/36817 — queued messages flush at next LLM pause; no queue UI
- https://github.com/anthropics/claude-code/issues/18399 — queued `/commands` sent as raw text
- https://github.com/obra/claude-session-driver/issues/20 — paste + 0.1 s + Enter race, `[Pasted text]` stranded
- https://github.com/earendil-works/pi/issues/2376 — pi TUI submits on first pasted newline inside tmux
