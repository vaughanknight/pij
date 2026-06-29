# pij telegram — drive your pi sessions from Telegram

The `telegram` bridge relays a Telegram bot ⇄ your running **pi sessions**. From your
phone you address a session by name, your message is delivered into that session's pij
inbox, and the session's replies stream back to your chat — chunked to fit Telegram's
message cap. It is a thin foreground process over the same file-backed pij channel the
in-repo peers use; no server, no extra daemon.

The bridge registers itself as a normal pij peer, `pij-telegram`, so a session replies to
you exactly the way it replies to any other peer.

---

## Quickstart

```bash
pij telegram init     # one-time setup (token + your id)
# …that's it — the pij daemon auto-starts the bridge once telegram.env exists.
pij telegram start    # (optional) run the bridge standalone, in the foreground
pij telegram stop     # stop a standalone bridge / clear a stale lock
```

After `init` writes `~/.pij/telegram.env`, **the running pij daemon starts the bridge for
you in its own process** the next time it boots — no separate command. Restart the daemon
once after first-time setup (`pij daemon kill` then any `pij` command, or `pij daemon
start`) and the bridge comes up with it. Running `pij telegram start` by hand is still
supported for a standalone bridge (e.g. on a host with no daemon); the single-instance lock
keeps the two from colliding — whichever starts first wins, the second is refused. Because
the daemon-hosted bridge shares the daemon's process, `pij telegram stop` would signal the
daemon — stop the **daemon** to stop a daemon-hosted bridge.

### `init` — one guided pass

1. Open **@BotFather** in Telegram → `/newbot` → follow the prompts → copy the HTTP API
   token.
2. Run `pij telegram init` and paste the token. It is validated immediately via Telegram
   `getMe`; an invalid token is rejected with a clear error, a valid one prints your bot's
   `@handle`.
3. When prompted, open a DM with your bot and **send it any message**. The bridge
   long-polls for that first message and records **your** numeric Telegram id — that id
   becomes the allowlist (see [Security model](#security-model)).
4. `init` writes three keys — `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USER_IDS`,
   `TELEGRAM_CHAT_ID` — to `~/.pij/telegram.env` (override with `PIJ_TELEGRAM_ENV`). The
   merge **preserves any other keys** already in that file; only the three `TELEGRAM_*`
   keys are touched. The token is a secret — the file is written owner-only (`0600`) and
   `.env*` is gitignored. See [`.env.example`](../../.env.example) for the key reference.

`init` never writes a token into the repo. The keys it writes are exactly the ones
`pij telegram start` reads, so once `init` finishes you can `start` immediately.

---

## Addressing rules

Every inbound message's **first word** is treated as an address token; the rest is the
message body.

- **Start-of-name, case-insensitive match.** The token matches any live session when it is
  a **start prefix** of a natural form of that session's id. For `pij-5lztp8` the forms are
  the full id (`pij-5lztp8`), the de-hyphenated id (`pij5lztp8`), the bare core (`5lztp8`),
  and the `p`+core abbreviation (`p5lztp8`). So **all** of `5l`, `p5l`, `pij5l`, `pij-5l`,
  and the whole id resolve to `pij-5lztp8` — type however you naturally shorten it. (A
  mid-string fragment like `ztp8` does **not** match — it's start-of-name, not "contains".)
- **A bare marker never matches.** `p`, `pi`, `pij`, or `pij-` alone (no session core) is a
  prefix of *every* session, so it resolves to nothing rather than matching all.
- **Ties break newest-active first.** When a token matches more than one session, the one
  with the most recent activity (`lastEventAt`, falling back to `startedAt`) wins;
  equal-recency ties keep registry order (first listed wins).
- **Sticky target.** After you address a session, it becomes the chat's **sticky** target:
  subsequent messages with no recognized address are delivered to it automatically, so you
  can hold a back-and-forth without re-typing the name each time.
- **No address, no sticky yet.** If your first word isn't a known session and nothing is
  sticky, the bridge replies with guidance instead of guessing.

Examples (assuming a live `pij-osn81b`):

```
osn run the tests          → delivers "run the tests" to pij-osn81b, makes it sticky
osn                        → just switches the sticky target to pij-osn81b
looks good, ship it        → (sticky) delivers the whole line to pij-osn81b
```

---

## Commands

- **`/list`** — the newest live pij sessions (up to 10), each as `id — folder`. Use it to
  discover who's around and what to address.
- **`/tail [N]`** — the last `N` events of the **current sticky** session (default 10,
  clamped to `[1, 50]`; a non-numeric or ≤0 `N` falls back to the default). With no sticky
  target yet, it replies with the same addressing guidance as a bare message. This is the
  cheap "what's it been doing" peek — one compact `seq · type — summary` line per event.

Commands are matched before the relay, so a `/list` or `/tail` is never delivered to a
session as if it were a message.

---

## The reply contract

The bridge is the pij peer **`pij-telegram`**. Anything delivered to that peer's inbox is
forwarded to your chat. So a session replies to you the ordinary way:

```bash
pij send pij-telegram "tests are green ✅"
```

Whatever you address from Telegram is delivered with `from: pij-telegram`, so a session
that simply replies to its sender automatically reaches you — no Telegram-specific code in
the session. Long replies are split into ordered chunks under Telegram's 4096-char cap.
Delivery **receipts** are recorded but not forwarded (an ack is not agent output), so your
chat stays signal, not noise.

**First-contact orientation.** The *first* message the bridge relays to a given session in a
run is prefixed with a short one-time note telling the agent it's now talking to a live human
on Telegram (on a phone), to keep replies short and conversational rather than dumping walls
of output, and to reply via `pij send pij-telegram`. Subsequent messages to that session are
relayed verbatim — the note appears once per session, not on every message.

---

## Attachments (media in + out)

The bridge carries media **both ways** without ever putting bytes on the pij wire. Files
live on disk; only **paths + metadata** ride the text `body` (reference-passing), and the
bridge is the only component that talks to Telegram's upload/download API.

### Send a file to your phone (outbound)

```bash
pij send pij-telegram --file ./chart.png --caption "here's the graph"
pij send pij-telegram --file ./build.log              # caption optional
pij send pij-telegram "see attached" --file ./out.pdf # text body + a file
```

- The file is classified by extension and sent with the right Telegram method:
  `jpg`/`jpeg`/`png`/`webp` → **photo**, `gif`/`mp4` → **animation (GIF)**, everything else
  → **document**.
- One `--file` per send (v1). `--caption` requires `--file`; `--file` can't be combined with
  `--command`.
- **Upload caps**: 10 MB for a photo, 50 MB for anything else. An oversize file is **not**
  thrown — the bridge sends you a short text notice instead and leaves the file on disk.
- Media rides the **same ordered queue** as text, so a `body` + file arrive in order.

### Receive a photo / gif / document (inbound)

Send media to the bot from your phone, addressing it by the **caption** exactly like text:

- *Photo with caption* `osn look at this` → addressed to session `osn`; the rest of the
  caption (`look at this`) travels with it.
- *No caption* → goes to the current **sticky** target.
- *No target at all* → you get the usual addressing guidance and **nothing is downloaded**.

The bridge pre-checks the **20 MB download cap** before fetching (over-cap → a "too big"
reply, no download), then saves the file into the **target session's own data dir** —
`~/.pij/<session-id>/attachments/<safe-name>`. Inbound filenames are sanitised to a single
safe segment (path separators and `..` stripped), so a download can never escape that dir.
The session receives a **text** notice carrying the saved path, the caption, the MIME type,
and the size — it can then choose to open the file. Storing media *with* the session makes
it ephemeral by construction: a future boot-time session tidy reclaims it with the session.

Inbound media is gated by the **same allowlist** as text — a non-allowlisted photo is
dropped before any download.

---

## Security model

**The allowlist is the only access control.** `TELEGRAM_ALLOWED_USER_IDS` is a list of
numeric Telegram user ids; the allowlist check is the bridge's *first* middleware, and a
message from any id not on the list is dropped before it reaches command handling or
routing. A bot token alone grants nothing — anyone who guesses your bot's handle still
can't drive a session.

- `init` captures **your** id automatically (the sender of the first message) and writes it
  as the sole allowed id. To allow more operators, add their numeric ids to
  `TELEGRAM_ALLOWED_USER_IDS`, comma-separated.
- The bridge **fails closed**: a missing/empty token or a non-numeric id makes `start`
  refuse to boot rather than run half-configured.
- Treat the token as a secret. It lives only in `~/.pij/telegram.env` (mode `0600`), never
  in the repo. If a token leaks, revoke it in @BotFather (`/revoke`) and re-run `init`.
- The bridge can drive any session it can see and read any session's events. Anyone you add
  to the allowlist gets that same reach — add deliberately.

---

## Operation: single-instance, foreground

The bridge runs **in-process inside the pij daemon** whenever `~/.pij/telegram.env` is
present (the daemon starts it on boot and tears it down on shutdown) — that is the normal
way to run it, and it needs no separate command. A daemon-hosted bridge failure (e.g. a
Telegram 409) tears down only the bridge; the daemon keeps running.

`pij telegram start` is the **standalone** alternative — a **foreground** long-poll that
does **not** self-daemonize. Background it yourself (`&`, `tmux`, or a process manager /
service unit) if you want it to outlive your shell. Use it when there's no daemon, or to run
the bridge on its own.

- **Single instance.** `start` takes a lockfile (`~/.pij/pij-telegram.lock`). A second
  `start` while a live bridge holds the lock is refused (Telegram allows only one
  `getUpdates` consumer per token — two would fight). A lock left by a dead process is
  reclaimed automatically.
- **Clean shutdown.** `Ctrl-C` (SIGINT) or SIGTERM stops the bot, releases the lock, and
  removes the `pij-telegram` peer descriptor.
- **`stop` from elsewhere.** `pij telegram stop` reads the lockfile and signals a live
  bridge to shut down, or clears a stale lock if the holder is already dead.
- **409 Conflict.** If another `getUpdates` consumer is already live (e.g. a duplicate
  bridge), Telegram returns a 409; the bridge logs it and exits cleanly (0) instead of
  crash-looping.
- **No daemon coupling.** The `pij-telegram` descriptor is stamped `harness:"pi"` +
  `lifecycle:"bound"`, so the pij daemon *observes* the peer and never tries to drive or
  drain it — the bridge is the sole consumer of its own inbox, so there's no double-send.

---

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| `config error` on `start` | No `~/.pij/telegram.env` (or `PIJ_TELEGRAM_ENV` unset/empty). Run `pij telegram init`, or create the file from [`.env.example`](../../.env.example). |
| Bot ignores your messages | Your id isn't in `TELEGRAM_ALLOWED_USER_IDS`. Re-run `init`, or add your numeric id by hand. |
| `a bridge is already running` | Another instance holds the lock. `pij telegram stop` first, then `start`. |
| Replies don't reach Telegram | `TELEGRAM_CHAT_ID` is unset — the bridge is inbound-only. Set it (your user id for a DM) and restart. |
| `getMe failed` during `init` | The pasted token is wrong or revoked. Get a fresh one from @BotFather. |

---

## See also

- [`docs/how/pij.md`](pij.md) — the underlying peer-session messaging the bridge rides on.
- [`.env.example`](../../.env.example) — the config key reference.
