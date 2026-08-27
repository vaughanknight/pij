# pij comms review — (a) source diagnosis

**Seat**: research sub-seat (a) under pij-primitive-toucan · **Date**: 2026-08-27 · **Scope**: read-only on `~/GitHub/pij` (HEAD `b5f1fb1`, the same commit the live daemon pid 550 booted from; working tree dirty only in `package-lock.json`).
All paths below are relative to `~/GitHub/pij/.pi/extensions/pij/` unless absolute.

## TL;DR

1. **Clipping is real and is NOT in pij's code path — it is a Claude Code ≥2.1.246 regression meeting a macOS pty limit.** The daemon types the whole framed body with one `tmux send-keys -l` (`adapters/tmux-keys.ts:95-97`). The macOS pty input queue hands the reading app **1022 bytes** per chunk (measured on this box, see §7). Claude Code 2.1.241 reassembled that fine (42/42 payloads >1022 B landed intact before 20:54Z); 2.1.246/2.1.247 drop the first 1022-byte chunk and type only the remainder (19/19 payloads >1022 B after the 20:55Z revive lost their head; head-loss measured at exactly 1022 bytes in four cases). The daemon then presses Enter, the fragment submits as its own turn, the pane goes busy, and the receipt honestly-but-wrongly says **`delivered`** (`adapters/daemon-tmux.ts:423`, `daemon.ts:1332`).
2. **"Silent drop" is (with one caveat) not a transport loss.** Every sub-1022-byte message that "vanished" today is present in the o-prime's transcript as a `queued_command` **attachment** absorbed mid-turn at a tool-result boundary (Claude Code `queue-operation` `remove reason=absorbed_mid_turn`). The model saw it; nothing in pij can show it: `pij tail` renders only `user`/`assistant` lines (`core/harness/claude.ts:49-66`), the spine has no message kind at all (`~/.pij/spine/events.ndjson` kinds: system-state, status, ruling… — zero message events by design), and the sender's receipt is `unverified`. Accounting for all 206 inbound to the o-prime today: 172 user turns, 15 absorbed attachments, 19 clipped (>1022 B), 0 unexplained.
3. **`unverified` is structurally meaningless for a busy Claude pane.** The submit oracle needs the pane to go from not-busy to busy (`core/readiness.ts:83-85`, `adapters/daemon-tmux.ts:164-175`); a mid-turn pane is already busy, so confirmation is impossible and the daemon spends ~4 s pressing Enter three times, then logs UNVERIFIED and consumes the message. 321 of 500 receipts to the o-prime today are `unverified`.
4. **The sender receipt cannot say anything else.** For any daemon-owned target `classifySendReceipt` returns `queued/tick-pending` unconditionally (`core/cli.ts:2213-2215`). It is a label, not a signal.
5. Real, code-level loss paths exist but did not fire today (§6): no readiness gate before typing (dead-shell / dialog / booting-pane injection), `unverified` consuming a message that never submitted, pane-gone orphaning, and revive-window typing.

---

## 1. Send path (file:line)

| Step | Where | What |
|---|---|---|
| CLI usage | `cli.ts:337-343` | `pij send <id> "<text>" \| --body-file <path\|-> \| --to … \| --command …` |
| `--body-file` | `cli.ts:4403-4503` | Reads the file raw (`readFileSync`, 4451), puts a NUL sentinel in argv (4409, 4485-4486), swaps the literal bytes in after parse (4502-4503). No trim, no normalisation — newlines survive to disk. |
| Verb dispatch | `core/cli.ts:3149` `case "send"` | `selfId` → `preflightSendTargets` (2162-2184: E-SELF / E-NOID / E-DEAD; a `pull` target may be dead) |
| Empty guard | `core/cli.ts:3283-3300` | `.trim()===""` → `E-EMPTY`, no receipt |
| Persist | `core/cli.ts:3311-3315` → `adapters/channel.ts:158-170` | `FsChannel.deliver`: `<PIJ_HOME>/<to>/inbox/msg-<id>.json`, id = `${Date.now()}-${seq6}-${pid}` (163), JSON `{from,to,body,messageId[,command][,attachments]}`, written to `.tmp-<id>.json` then `renameSync` (167-168). **Body is stored verbatim; framing happens at inject time** (`route()`), never here (comment 3268). |
| Sender activity stamp | `core/cli.ts:3329` → 2275-2295 | best-effort `lastEventAt` bump on the sender descriptor |
| Receipt label | `core/cli.ts:3330` `classifySendReceipt` 2199-2216 | `blocked/never-bound` (bind degraded) → `queued/pull-inbox` → `queued/unbound` → **daemon-owned: `queued/compacting` or `queued/tick-pending` (2213-2215)** → non-daemon: `busy` / `delivered`. Body length is deliberately not an input. |
| Tick staleness | `core/receipts.ts:16,26-44` | `daemonTickStale` if `lastTickAt` >30 s; read from `~/.pij/tick-heartbeat.json` (`core/daemon/tick-heartbeat.ts:74`, written once per tick at `daemon.ts:354-359`) |
| Human line | `core/cli.ts:2318-2342, 3376` | `sent → <id>  text  (queued (tick-pending): awaiting daemon delivery confirmation)` |
| `--wait` | `cli.ts:983` | polls the sender's own receipt events until every messageId reaches `delivered` **or `unverified`** (both terminal) |

There is no length cap, no chunking and no newline transformation anywhere on the send side. The `core/bg.ts:143-155` `flatten()` (join lines with ` ⏎ `) is used only by the bg-job notifier, not by `pij send`.

## 2. Persistence & receipts

- **Queue = the inbox directory.** `msg-<id>.json` is immutable; `read-<id>.json` (`adapters/channel.ts:113-115`, `publishMarker` 131-155, `openSync(...,"wx")`) is the authoritative consumed marker. `listUnread` (172-192) = every `msg-*` without a `read-*`, name-sorted (time-major). The in-memory `SendBuffer` (`core/daemon/router.ts:99-176`) is only an ordering view since plan 071 D7 (comment 92-98); a message is marked read **only after an inject outcome** (`daemon.ts:1107-1114`, `634-639`).
- **A "receipt"** is a second inbox message of `kind:"receipt"` written *into the sender's inbox*, body `[pij receipt <messageId>] queued|delivered|unverified` (`core/message.ts:38-42`), emitted by `daemon.ts:1317-1339 emitSendReceipt` with the mapping `confirmed→delivered`, anything else→`unverified` (1332). `held`/`failed`/`gone` emit nothing (message stays unread).
- **Receipt → event.** When the *sender's* inbox is drained (daemon for tmux seats, pi receiver for pi, `pij inbox` for pull), `prepareReceiptEnvelopes`/`persistReceiptEnvelope` (`core/inbox.ts:247-330`) append one `type:"receipt"` event via `FsEventLog.appendOnce` → `<PIJ_HOME>/<sender>/event-once-<sha256>.json` (`adapters/event-log.ts:41-63`; `events.ndjson` is the legacy append file, 37-39). Then the receipt envelope is marked read. `pij tail <id> --type receipt` reads those (`adapters/event-log.ts:65-86`).
- **The spine never records messages.** `FsSpineLog` (`adapters/spine-store.ts:68`) carries `system-state/status/ruling/node-linked/role-set/ship/verify/…` only (counted live: 15027 system-state, 4421 status, 0 message-anything). "The spine has no message event for it" is true of *every* message ever sent.
- **`~/.pij/` layout (live):** `<seat>.json` descriptor · `<seat>/inbox/{msg,read}-*.json` · `<seat>/event-once-*.json` (+ `events.ndjson`) · `spine/` · `tick-heartbeat.json` · `daemon.lock` (`{pid:550, startedAt:2026-08-24T06:05:18Z, window:@2, head:b5f1fb1}`) · `pane-signals/<pane>.raw` pipe-pane taps · `archive/`, `assignments/`, `dispatches/`, `spawn-expectations/`.

## 3. Daemon tick & delivery

- **Two timers** (`daemon.ts:1474-1493`): `tick()` every 600 ms (`TICK_MS` :95) does reconciliation + a *backup* drain; `deliverPass()` every 200 ms (`DELIVERY_PASS_MS` :99, plan 071 D2) is the real delivery driver. Live tick cost today: avg 523 ms, max 8.4 s over 1810 ticks (pane scrollback), 22 live seats, no `tick error` lines.
- **`deliverPass`** (`797-818`): for each indexed descriptor that is `bound`, daemon-owned (`core/harness/pi.ts:15` = transport `sendkeys` = claude/copilot/codex, `core/harness/types.ts:20-28`), has a `paneId`, and is not `isCompacting` (`router.ts:58-62`, 120 s cap) → `drainInbox(id)`.
- **`drainInbox`** (`1013-1129`): persist any receipt envelopes (1019-1041) → `listUnread` (1043) → skip receipts, coalesce duplicate watchdog pings (1052-1073) → for each message: composer-hold check (1078-1080) → `drainTmuxInbox` one message at a time (1083-1090) → mark read + `buffer.forget` + `emitSendReceipt` (1106-1123). A `/compact` stops the batch (1126).
- **`drainTmuxInbox`** (`core/daemon/loop.ts:571-629`): `route()` (`router.ts:77-87`: pi→observe, bound+pane→inject with `injectionText` = `[pij from <from>] <body>` (40-42), else buffer) → `refreshRenderedComposerHold` (536-565) → `ports.sendText` → outcome handling: `gone` → leave unread, caller unbinds (602-610); `held`/`failed` → buffer, stays unread (611-614); **`confirmed`/`unverified` → consumed** (615).
- **`sendText` gate** (`daemon.ts:264-288`): the "content gate" is **commented out** (`EMERGENCY BYPASS 2026-07-25`, 266-271); the wrapper only maps `gone`→`unbindGonePane` (150-165: dissolves the seat, "unread mail left in the mailbox for a revive") and marks self-injection for the echo exemption (285).
- **Ordering**: name-sorted ids → arrival order per inbox; no priority, no per-sender fairness; a compact hold or composer hold delays the whole inbox (head-of-line by design, FX002 only removed the *exception*-driven wedge).
- **Retry policy**: `held`/`failed` retry forever every 200 ms (durable); `gone` never retries; `unverified` never retries.

## 4. The body's journey into the pane (`adapters/daemon-tmux.ts:368-451`)

1. `typeLiteral(paneId, text)` → **one** `tmux send-keys -t %N -l "<entire framed body>"` (`adapters/tmux-keys.ts:95-97`). No chunking, no length cap, **no bracketed paste** (`pasteBuffer` with `-p` exists at `tmux-keys.ts:127-138` and is never called by the daemon), newlines sent raw as LF keys. Only copilot gets the type-confirm/retype loop (380-397).
2. `sleep(350 ms)` for claude (`ENTER_SETTLE_BY_HARNESS` 52-57).
3. `preSubmit = capturePane` (401).
4. Up to `SUBMIT_ATTEMPTS=3` (104): `send-keys Enter` (419), then 5×250 ms polls (108-109) for `submissionConfirmed(pre, post, text)` (173-175) = `paneWentBusy` (**pre must NOT match `BUSY_RE`**, `core/readiness.ts:83-85`) OR `freshTranscriptEvent` (164-171, **also requires `!BUSY_RE(preSubmit)`**). Break early if the last 24 non-space chars of the payload are no longer visible in the composer region (435, `composerHasTextTail` 142-146).
5. Otherwise log `⚠️ claude UNVERIFIED …` to stderr (443-446) and return `unverified` → consumed, receipt `unverified`.

Newlines: LF is **not** a submit in Claude Code 2.1.24x — a 4-line, 84-byte framed message landed as one user turn with its newlines intact in the 2.1.247 test seat, and 140 multi-line messages ≤1022 B landed intact in the o-prime today. The `core/bg.ts:145` comment ("a real newline is a SUBMIT") is a copilot-era observation and is not what limits pij today.

## 5. Root cause of clipping — ranked

**H1 (confirmed): Claude Code ≥2.1.246 loses the first pty chunk of a large non-bracketed keystroke burst; the macOS pty chunk is 1022 bytes.**
Evidence:
- Transcript vs. inbox diff for the o-prime (`~/.claude/projects/-Users-vaughanknight-GitHub-perimenocause/12d69059-….jsonl` vs `~/.pij/pij-vocal-kingfisher/inbox/`): every framed payload >1022 bytes delivered **before 20:54:21Z (Claude Code 2.1.241)** landed intact — 42/42. Every framed payload >1022 bytes delivered **after the 20:55:36Z revive (2.1.246)** landed as an **unframed tail fragment** — 19/19. Every payload ≤1022 bytes landed intact (or was absorbed, §6) in both versions.
- Fragment lengths: `framedBytes − fragmentBytes` = **1022, 1022, 1022, 1022** (20:56:48, 21:58:27, 01:41:51, 01:49:57) and 969-1082 in the others (the same boilerplate tail matched several messages, so those numbers are approximate); the fresh 2.1.247 test seat (pane %36 / %37) received a 1398-byte framed test as a 345-byte tail — head loss 1053.
- pty probe (python `openpty`, raw slave, non-blocking master, this machine, tmux 3.6a): a 1398-byte write is accepted **1022 bytes** at a time; the slave reads `[1022]`, then `[376]`. That is the kernel `TTYHOG` reserve, not anything pij controls.
- Claude Code 2.1.247's own key parser classifies any stdin chunk longer than `KM=32` bytes (or not matching its key regex) as `isPasted:true` (binary strings `function ol(e){return e.length<=KM&&Ib.test(e)}`, `KM=32`). The first 1022-byte chunk becomes a paste record; the tail chunk is typed; on submit the paste record is not expanded (the binary carries `droppedPasteRecords` / "Pasted text … is no longer available and was removed from the prompt"). 2.1.241 did not do this. I could not read minified internals further; the version split in the transcript is the decisive evidence.
- Daemon log confirms the mechanics: `⚠️ claude UNVERIFIED … text tail «…ne. If you only see this, the head was clipped. »` (daemon pane %2 scrollback, line 1824) — the daemon's own verifier *sees the tail sitting in the composer* and presses Enter against it.
- The `[pij from …]` prefix lives in the head, so clipped messages arrive **unframed** (`[user] ned, not clean.` in `pij tail pij-vocal-kingfisher`), and the pane goes busy when the fragment submits, so the receipt is **`delivered`** (17 of the 19 clipped messages carry a `delivered` receipt).

**H2 (rejected): newline-flattening / Enter-per-line.** LF does not submit (above); no per-line Enter exists in the code (one `pressKey Enter` per attempt, 419). Fragments are cut mid-word ("…ned, not clean."), not at line boundaries.

**H3 (rejected): tmux send-keys argv splitting.** One argv element, `execFileSync` with an array (`tmux-keys.ts:30-33`), no shell; ARG_MAX is far above 1.5 KB.

**H4 (rejected as cause, real as amplifier): composer hold / FX001 retype.** The retype loop is copilot-only (`wake` 374-378). But after a clipped inject the residual fragment is non-blank composer content that does **not** equal the self-injection echo (`ComposerHoldTracker.observe` exact-match rule, `core/daemon/pane-signals.ts:649-664`), so the pane is treated as "human typing" and later deliveries are held up to `USER_TYPING_IDLE_MS`=60 s (`pane-signals.ts:6`, 674-681) — a delay cascade behind every clipped message.

**H5 (rejected): prefix only on first chunk.** There is no chunking in pij; the frame is built once (`router.ts:41`).

## 6. Root cause of "silent drop" — every loss/invisibility path

Observed today (o-prime, 206 inbound since 2026-08-26T10:40Z): **172 landed as user turns · 15 absorbed mid-turn · 19 clipped · 0 unaccounted.** The reported "drops" are the 15 + 19.

| # | Path | Where | Visible to sender? | Visible via `pij tail`/spine? | Fired today |
|---|---|---|---|---|---|
| A | **Mid-turn absorption.** Target is busy; typed text + Enter enqueues in Claude Code; at the next tool-result boundary Claude Code removes it from its queue (`queue-operation remove reason=absorbed_mid_turn`; on 2.1.241 the same op has no reason) and injects it as an **attachment** `{"type":"queued_command","prompt":"[pij from …] …"}` — not a `user` turn. The model sees it once, sandwiched after a tool result. | Claude Code; pij side `daemon-tmux.ts:437-450` returns `unverified` | receipt `unverified` | **No.** `summarizeTranscriptLine` (`core/harness/claude.ts:49-66`) handles only `type:"user"|"assistant"`; attachments and `queue-operation` lines return null. Spine has no message kind. | 15× (e.g. 11:02:12 ebulan DO1, 21:41:20 quelea "tranche 88 complete", 01:56:08/01:56:42 toucan READY) |
| B | **Head clipping (§5)** — head bytes are gone for good; the fragment is unframed. | Claude Code + pty | receipt **`delivered`** (pane went busy on the fragment) | tail shows an unframed fragment turn | 19× |
| C | **`unverified` consumes.** `loop.ts:597-615` marks read on `unverified` "because the payload WAS typed". If the typed text never submits (composer cleared by a human Esc, `/clear`, the app dying, an auto-compact reset), the only durable copy is marked read. | `loop.ts:600-601, 615`; `daemon.ts:1107-1114` | receipt `unverified` | no | not evidenced today; the 20:47-20:54Z Ctrl-C kill of the o-prime is exactly this window (no inbound fell in it) |
| D | **No readiness gate before typing.** `deliverPass`/`drainInbox` check lifecycle, paneId, compact hold and composer hold only (`daemon.ts:801-809`, `1013-1129`); `classifyReadiness` (`core/readiness.ts:73-79`) is consulted only for activity/state. A bound seat whose app has died to a shell prompt, is on a permission/`/resume` dialog, or is still booting after a revive gets the body typed **into that**, Enter pressed, and the message consumed as `unverified`. | `daemon.ts:1013-1129` | receipt `unverified` | no | not today; latent (revive sets `lifecycle:"pending"` at `core/revive.ts:690`, which does protect the *pij-driven* revive window) |
| E | **Pane gone → seat dissolved, mail orphaned.** `classifySendFailure` "can't find pane" → `gone` (`daemon-tmux.ts:218-220`) → `unbindGonePane` dissolves (`daemon.ts:150-165`); unread files stay under the old id and are drained only if a revive reuses that id. | | receipt none; `pij send` later says `E-DEAD` | `pij state` shows dissolved | 0 today (`tmux GONE` count 0 in scrollback) |
| F | **Compact hold** (`router.ts:58-62`, `daemon.ts:726, 807`): only a *remote* `--command compact` sets `compactingAt` (`daemon.ts:1095-1104`). A self-initiated/auto compaction is invisible, so a message typed during it can be eaten by the fresh-context reset and consumed as `unverified`/`delivered`. | | | | not evidenced |
| G | **Composer hold (60 s)**: durable, not a loss, but `held` messages stay unread and re-enter the FIFO; after the 60 s expiry the next inject is typed *appended* to whatever is in the composer (a stranded fragment) → concatenated turn. | `pane-signals.ts:604-698`, `loop.ts:591-594` | none | no | plausible after every clipped message |
| H | **markRead failure after inject → throw** (`daemon.ts:1113`, `639`): message already typed, next pass types it again → duplicate, not loss. | | | | 0 |
| I | **Daemon restart**: `SendBuffer` is in-memory but messages stay unread (plan 071 D7), so nothing is lost; the 6-day-old daemon (`b5f1fb1`, 2026-08-10) is not the issue — HEAD is the same commit. | | | | n/a |
| J | **`pij tail` / receipts / spine cannot observe A or B**, and the CLI receipt is `queued/tick-pending` for every daemon-owned target regardless of outcome (`core/cli.ts:2213-2215`). This is why the o-prime concluded "never delivered, no spine event". | | | | every message |

Message-file rename/move, dedupe-by-id, TTL/expiry: none exist. `SendBuffer.enqueue` dedupes only by messageId and coalesces watchdog pings (`router.ts:104-115`); watchdog duplicates are marked read deliberately (`daemon.ts:1054-1066`).

## 7. Mid-turn injection semantics (what the recipient actually gets)

- **Idle pane** (transcript prev entry = assistant `end_turn`): typed text + Enter starts a new turn; the message is a normal `user` turn; receipt `delivered` (paneWentBusy).
- **Busy pane**: Enter enqueues (Claude Code `queue-operation enqueue`); the daemon cannot confirm (§4 step 4) → three Enters over ~4 s → `unverified`. At the next tool-result boundary Claude Code either (i) `dequeue`s it as a user turn when the turn ends, or (ii) `remove`s it with `absorbed_mid_turn` and hands it to the model as a `queued_command` attachment right after the tool result — this is the "injected mid-turn, split across a tool-result boundary" observation. Two queued messages absorbed at the same boundary appear as two attachments (21:41:43Z: a pij message and a human message absorbed together).
- **Clipped payload**: the tail fragment behaves like an ordinary idle/busy submission of unframed text.
- The test seat pij-systematic-squirrel (2.1.247) received the clipped tail and then **replied "Received message with 12 lines and 1368 characters. FIRST LINE: LINE-1 …"** — a fabrication built from the instructions it was given. Seat self-reports about what they received are not evidence; the transcript is.

## 8. Evidence from live state

- Daemon: pid 550 (`ps`: elapsed 2d19h, `node … tsx daemon.ts`), lock `head:b5f1fb1`, `pij daemon status` → `running (pid 550, window @2); source @ b5f1fb1: dirty` (dirt = `package-lock.json` only). Tick heartbeat fresh (0 s). Scrollback (2000 lines): 23 `UNVERIFIED` (10 claude, 13 copilot), 0 `tmux FAILED`, 0 `tmux GONE`, 0 `tick error`, 0 `delivery pass` errors.
- Fleet: 22 live seats; o-prime `pij-vocal-kingfisher` = claude, pane %35, `revivePendingAt 2026-08-26T20:55:33Z`, Claude Code **2.1.241 until 20:54:21Z → 2.1.246 from 20:55:36Z** (transcript `version` field); toucan/squirrel/cicada spawned today on **2.1.247** (`~/.local/share/claude/versions/`: 2.1.240, 2.1.241, 2.1.246, 2.1.247).
- Receipts written today (all senders' inboxes, kind receipt): to `pij-vocal-kingfisher` **179 delivered / 321 unverified**; monetary-quelea 48/16; mobile-bee 40/15; reasonable-excuse 62/3; gravitas-shortfall 26/6; universal-ebulan 4/5; primitive-toucan 3/3.
- o-prime inbox: 740 msg files, 740 read markers, **0 unread** — nothing is stuck in pij's queue.
- Clipped set (framed bytes → what landed): 20:56:48 quelea 1216 B → 193 B tail; 21:58:27 mobile-bee 1141 → 118; 22:59:51 … 01:58:34 mobile-bee 1025-1091 B → 2-68 B tails (`n.`, `not clean.`, `ned, not clean.`); 01:33:49 / 01:49:57 reasonable-excuse 1102/1100 → 79/77. Every one is >1022 framed bytes; every one is after the 2.1.246 revive.
- `pij tail pij-vocal-kingfisher --type receipt` shows the transcript stream (the `--type` filter is ignored for claude tails) including the `[user] ned, not clean.` fragment.
- tmux 3.6a, `history-limit 2000`, `focus-events off`.

## 9. What I'd rip out

1. **`send-keys -l` for message bodies.** Replace with tmux bracketed paste — `set-buffer` + `paste-buffer -p` is already written and tested at `adapters/tmux-keys.ts:127-138` but never wired. Claude Code's *own* remote-reply path writes `\x1b[200~<text>\x1b[201~` then `\r` 10 ms later (string visible in the 2.1.247 binary), so bracketed paste is the transport Anthropic uses against its own TUI. Until that lands: **cap the wire body at ~900 bytes and reject or pointer-ise anything larger** at `core/cli.ts:3283` — the o-prime's C10 "bodies go to disk, send pointers" rule is the right shape and should be enforced by the tool, not by discipline.
2. **The three-Enter submit verifier for claude/codex** (`daemon-tmux.ts:409-436`). Against a busy pane it cannot succeed, costs ~4 s of synchronous sleep per message inside the 200 ms delivery pass, and manufactures `unverified` noise (321/500). Press Enter once; derive the receipt from the harness transcript instead: the daemon already knows `folder` + `harnessSessionId` (`transcriptPathFor`, `core/harness/claude.ts:37-39`) and can watch for the framed text as a `user` turn **or** a `queued_command` attachment, emitting a real `delivered` / `absorbed-mid-turn` receipt with the transcript uuid as evidence. That also detects clipping (framed head absent, tail present) and makes `--wait` mean something.
3. **`unverified` ⇒ consumed** (`loop.ts:600-601, 615`). With a transcript-confirmed receipt, an unconfirmed inject should stay unread and be retried once the pane reads `ready`, with an at-most-once guard keyed on the transcript rather than "we typed it".
4. **Typing without a readiness gate** (`daemon.ts:1013-1129`). Require `classifyReadiness ∈ {ready, busy}` on this tick's frame (`paneFrameThisTick`, 1150-1160) before `sendText`; leave the message unread otherwise. Also delete the dead `EMERGENCY BYPASS` block (`daemon.ts:266-271`) one way or the other.
5. **`pij tail` blindness.** Render `queued_command` attachments and `queue-operation` lines (`core/harness/claude.ts:49-66`), and honour `--type receipt` for claude seats, so an operator can see absorbed deliveries without reading JSONL by hand. Optionally emit a `message-delivered`/`message-absorbed` spine event so "the spine has no event" stops being the default state of every message.
6. **`queued (tick-pending)` as the universal answer** (`core/cli.ts:2213-2215`). Either make the send synchronous enough to report the real outcome (the daemon's delivery pass is 200 ms; a `--wait` default of ~3 s would cover idle panes) or rename the label to what it is: "handed to the daemon".
7. **Composer-hold echo rule** (`pane-signals.ts:649-664`): exact-match-only means any partial echo (clipping, wrapping, a paste pill) is read as human typing and holds the inbox for 60 s. Compare on a prefix/tail of the payload, or key the exemption on the self-injection window alone.

## 10. Method notes

Sources read: `cli.ts`, `core/cli.ts`, `core/message.ts`, `core/receipts.ts`, `core/inbox.ts`, `adapters/channel.ts`, `adapters/event-log.ts`, `adapters/spine-store.ts`, `daemon.ts`, `core/daemon/{loop,router,tick-heartbeat,pane-signals}.ts`, `adapters/{daemon-tmux,tmux-keys}.ts`, `core/harness/{claude,types,pi}.ts`, `core/readiness.ts`, `core/revive.ts`, `core/bg.ts`; docs `FX001`, `FX002`, `bug-user-typing-stepped-on-2026-07-21`, `s041-inbox-no-tmux`, `s101-daemon-tick-cost`, `s074-pij-rail-v2-brief`, `docs/how/pij.md`, `docs/how/pij-pane-signals.md`. Live: `~/.pij/*`, daemon pane %2 scrollback, Claude Code transcripts for the o-prime and the two 2.1.247 test seats, `pij tail/state/daemon status`, a python pty probe, string search of the 2.1.247 binary. No daemon control, no sends, no writes outside this file.
