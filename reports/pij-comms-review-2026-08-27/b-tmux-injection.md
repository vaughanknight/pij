# (b) tmux injection layer and harness adapters — pij comms review 2026-08-27

Scope: how a `pij send` body becomes keystrokes in a claude/copilot/codex pane, where the
head of a multi-line body goes, and what a pointer-style injection would need. All paths
are under `~/GitHub/pij/.pi/extensions/pij/` unless stated. Machine facts: tmux 3.6a,
`ARG_MAX=1048576`, `focus-events off`, `assume-paste-time 1`, `escape-time 10`,
`history-limit 2000`; Claude Code on disk 2.1.240/241/246/247 (2.1.247 installed
27 Aug 10:25 local). No live pane was written to and the daemon was not touched; the
experiments below ran in a private `tmux -L` server (invisible to the daemon) against a
throwaway `claude --model haiku` that has since been killed and its transcript dir removed.

## TL;DR

The clipping is real, reproducible, and has one dominant cause: **Claude Code ≥ 2.1.246
drops the first pty read chunk (1022 bytes) of any unbracketed keystroke burst that spans
more than one chunk.** pij delivers a body as ONE `tmux send-keys -l <whole framed text>`
(`adapters/tmux-keys.ts:95-97`), which the kernel pty hands to the app in 1022-byte reads;
the head chunk vanishes, the tail lands. Forensics on the o-prime's own inbox vs transcript:
before its 2.1.241→2.1.246 restart, 41/41 bodies over 1022 bytes landed whole; after it,
18/22 landed tail-only, with the clipped prefix measuring 1008–1020 chars in 12 of 18 cases.
Copilot recipients (3 seats, 812 messages) never clipped. A bracketed-paste-wrapped send —
which pij already has as `pasteBuffer()` (`tmux-keys.ts:127-138`) and never uses — lands
intact on the same build. Separately, a second hard limit: any framed body over ~16,300
bytes can never be typed at all (tmux `command too long`), and the daemon requeues it
forever as `queued (tick-pending)`.

---

## 1. Keystroke pipeline (file:line)

**Sender side.** `pij send` never touches tmux. It writes `~/.pij/<to>/inbox/msg-<id>.json`
via `channel.deliver` (`core/cli.ts` send dispatch; body-only, no size cap other than the
`E-EMPTY` blank guard at `core/cli.ts:3280-3292`) and classifies the receipt
(`core/cli.ts:2201-2221`): for a bound claude/copilot/codex seat the sender is told
`queued (tick-pending): awaiting daemon delivery confirmation` (`core/cli.ts:2338-2340`)
and later gets a `delivered`/`unverified` receipt from the daemon.

**Transport selection.** `core/harness/types.ts:20-30` `selectTransport`: `pi` → `inbox`
(in-process receiver, `index.ts:355-395`, watch + 1500 ms poll `adapters/channel.ts:70`);
claude/copilot/codex → `sendkeys` unless the descriptor is `deliveryMode:"pull"`, in which
case the daemon leaves the inbox alone (`core/harness/pi.ts:15-17`,
`core/daemon/router.ts:77-87`).

**Framing.** `core/daemon/router.ts:40-42` `injectionText`: a command becomes `/<command>`
raw; free text becomes `frame(from, body)` = `` `[pij from ${from}] ${body}` ``
(`core/message.ts:11-13`). The prefix is applied ONCE to the whole body. There is no
flattening, escaping, or chunking of the body anywhere on the daemon path — newlines,
backticks, quotes, multi-byte characters all go through verbatim as one string. (Only
`core/bg.ts:142-156` `flatten()` — the background-job notifier — rewrites newlines to
` ⏎ `, and its comment "a real newline is a SUBMIT" is wrong for Claude Code; see §3.)

**Daemon drain.** `daemon.ts:797` `deliverPass()` runs every `DELIVERY_PASS_MS = 200`
(`daemon.ts:99`, timer `daemon.ts:1487-1495`), independent of the 600 ms reconciliation
tick (`daemon.ts:95`). Per bound tmux seat it calls `drainInbox` (`daemon.ts:1013`), which
lists unread messages and, one message at a time (`daemon.ts:1077-1090`), runs the pure
`drainTmuxInbox` (`core/daemon/loop.ts:571-629`) → `route` → `ports.sendText(paneId,
text, harness, pid)`. Outcomes: `confirmed`/`unverified` → mark read + receipt
(`daemon.ts:1108-1123`, `emitSendReceipt` `daemon.ts:1315-1338`); `held`/`failed` →
re-enqueue unread (`loop.ts:612-615`); `gone` → leave unread, unbind the seat
(`daemon.ts:271-279`, `loop.ts:603-611`). A pre-bind FIFO (`SendBuffer`,
`router.ts:99-176`) is flushed on bind through the same `sendText`
(`daemon.ts:579-640`, `flushedText` `loop.ts:633-635`).

**The actual keystrokes** — `adapters/daemon-tmux.ts:368-451` `sendTextUnchecked`:

1. copilot only: `sendFocusIn` = `send-keys -H 1b 5b 49` (CSI I) + `SIGWINCH`
   (`daemon-tmux.ts:74-97`, `tmux-keys.ts:108-110`).
2. **`typeLiteral(paneId, text)` = ONE call: `tmux send-keys -t %N -l <entire framed text>`**
   (`daemon-tmux.ts:379`, `tmux-keys.ts:95-97`). No chunk loop, no sleep between chunks,
   no `-N`, no bracketed-paste wrapper, no `load-buffer`/`paste-buffer`. `execFileSync`
   argv, so no shell quoting issues and `ARG_MAX` (1 MiB) is irrelevant in practice.
3. copilot only: a type-confirm loop (`daemon-tmux.ts:380-397`) that polls the composer
   8×250 ms and, if still empty, `BSpace × text.length` then retypes, up to 3 types.
4. `sleep(enterSettleMs(harness))` = 350 ms claude/codex, 900 ms copilot
   (`daemon-tmux.ts:52-64`, `:400`).
5. `capturePane` as `preSubmit` (`:401`), then up to `SUBMIT_ATTEMPTS = 3` ×
   `pressKey(paneId, "Enter")` = `send-keys -t %N Enter` (`:409-436`, `tmux-keys.ts:113-123`),
   each followed by 5×250 ms polls for `submissionConfirmed` (`:173-175` = pane went
   not-busy→busy, or composer emptied and transcript region changed). Retry stops as soon
   as the payload tail is no longer visible (`:435`). Never retypes after the first Enter
   (FX001 at-most-once).
6. No confirmation → returns `unverified` and logs `⚠️ <harness> UNVERIFIED …`
   (`:442-450`); the message is still consumed (`loop.ts:597-601`).

**Standalone CLI path** (`cli.ts:2568-2610` `runCompactSelf`): the only other send-keys
site — `typeLiteral("/compact")`, 300 ms, `Enter`, optional instruction `typeLiteral`,
300 ms, `Enter`. Same primitive, same shape. `harness/driver/tmux.ts:195-205` re-exports
`type/press/paste` for the harness test driver; `paste` (bracketed) is used by nothing in
production.

**Empirical tmux facts (private `-L` server, raw-mode reader).**

| Probe | Result |
|---|---|
| `send-keys -l $'A\nB'` | bytes `41 0a 42` — the newline is delivered as **LF (0x0a)**, not CR |
| `send-keys Enter` | `0d` (CR) |
| `paste-buffer` / `paste-buffer -p` of `P1\nP2` | `P1 0d P2` — tmux rewrites LF→CR; `-p` only brackets if the app has requested `?2004h` |
| `-l 'head;Enter C-c \; -l'` | all literal — **no key-name parsing inside `-l`** |
| 5,040-byte `-l` | arrives in **5 reads of 1022 bytes** (+951), all within the same ms |
| `-l` of 16,300 B | OK; **16,350 B → `failed to send command`; ≥16,384 B → `command too long`** (tmux imsg 16 KiB) |
| 300 KB `-l` | `command too long`, nothing delivered |

So: one `send-keys -l` per message; newlines are sent as LF; the only size ceiling is
tmux's ~16 KiB message frame; and the app sees the burst as ≥2 pty chunks once the framed
text exceeds 1022 bytes.

## 2. Timing / readiness gates

- **Readiness classifier** `core/readiness.ts:73-79`: dead → interstitial → busy → ready →
  booting, from `capture-pane -J`. `BUSY_RE` (`:62-63`) = `esc (to )?interrupt`, `esc
  cancel`, `↓ N tokens`, `[A-Z][a-z]+ing…`; `READY_RE` (`:44-45`) footer markers plus the
  codex `· ~/` composer footer (`:50`). Used by `driveSession` (`loop.ts:247-256`) to gate
  the **init injection only** (`loop.ts:295-311`, "only when truly ready, not mid-turn
  busy") and the phonehome resend (`loop.ts:420-435`).
- **Ordinary delivery does NOT consult readiness/busy.** `drainInbox` → `drainTmuxInbox`
  injects whenever the seat is bound and not compacting (`daemon.ts:722-726`,
  `isCompacting` `router.ts:58-62`); `SendBuffer.setPaneSignal` carries `busy` but "never
  holds" (`router.ts:117-121`, and `docs/how/computed-but-unconsulted-signals.md`).
  Sends into a mid-turn pane are therefore normal, and by design rely on the harness
  queueing typed input (`docs/how/pij-pane-signals.md` "A busy pane with an empty composer
  receives messages immediately").
- **Human-typing hold** (`core/daemon/pane-signals.ts`): `PaneSignalMonitor` (`:706`) runs a
  byte-density busy tracker (`BUSY_WINDOW_MS 1000 / 256 B / idle 1500`, `:3-5`) and a caret
  tracker over a `pipe-pane -O` tap (`daemon-tmux.ts:283-294`); `ComposerHoldTracker`
  (`:604`, `observe` `:618`) holds while the rendered composer is non-blank and changed
  within `USER_TYPING_IDLE_MS = 60_000` (`:6`), exempting pij's own echo for
  `SELF_INJECTION_WINDOW_MS = 2_000` (`:7`, `markSelfInjection` `:609`/`:740`,
  `daemon.ts:167-170`). The gate is `refreshRenderedComposerHold` (`loop.ts:536-566`),
  applied before each drain send (`loop.ts:592-595`) and before each buffered flush
  (`daemon.ts:581-600`). The contract is pinned in
  `core/daemon/typing-guard-contract.test.ts:111-190` ("recent typing holds", "Enter sends",
  "1 min no Enter → sends", "chains off").
- **EMERGENCY BYPASS still in force**: the structural gate inside the `sendText` wrapper is
  commented out (`daemon.ts:263-270`, "content gate disabled — fleet-wide delivery failure
  attributed to over-hold", 2026-07-25), so `held` can no longer be produced by the port;
  only the per-call-site `refreshRenderedComposerHold` checks remain (two of them, both
  release-or-enqueue, none inside the type→Enter window).
- **Enter timing**: 350 ms after the literal burst for claude/codex, 900 ms copilot
  (`daemon-tmux.ts:52-57`). Claude Code's parser holds an unbracketed byte run for
  `NORMAL_TIMEOUT = 50` ms and a bracketed paste for `PASTE_TIMEOUT = 2000` ms (from the
  2.1.247 binary: `NORMAL_TIMEOUT=50;PASTE_TIMEOUT=2000`), so 350 ms clears the byte-run
  path; a bracketed send that is slow to arrive could still see Enter inside the paste.
- **copilot input-wake**: `needsInputWake` (`daemon-tmux.ts:74-76`) — focus-IN before typing
  and before every retry Enter, because a focus-OUT'd copilot swallows CR.
- **Mid-turn recipient**: `submissionConfirmed` requires `!BUSY_RE(preSubmit)`
  (`readiness.ts:83-85`, `daemon-tmux.ts:164-170`), so a send into an already-busy pane can
  never be confirmed → `unverified` by construction. The live daemon pane's last 2000 lines
  show **43 UNVERIFIED for 44 injections** (`⚠️ copilot/claude UNVERIFIED … across 3 Enter
  attempts`), i.e. almost every fleet send lands mid-turn and the receipt word `unverified`
  is carrying no information. Claude Code accepts CR while busy and queues the composer
  ("Press up to edit queued messages, Enter to send them immediately" in the binary);
  an Enter on an empty composer is a no-op.

## 3. Clipping mechanisms (ranked)

Forensic method: for the o-prime `pij-vocal-kingfisher` (claude, pane %35), every
`~/.pij/pij-vocal-kingfisher/inbox/msg-*.json` body (non-receipt, non-watchdog; 222 msgs)
was searched, whitespace-collapsed, in every user turn of its transcript
`~/.claude/projects/-Users-vaughanknight-GitHub-perimenocause/12d69059-….jsonl` within
[sent−2 s, sent+60 min], recording FULL / longest-suffix (TAIL) / longest-prefix (HEAD) /
MISSING. The same was run for one more claude seat and three copilot seats
(`~/.copilot/session-state/<uuid>/events.jsonl`, `user.message`).

| seat (harness) | msgs | FULL | TAIL | HEAD | MISSING |
|---|---|---|---|---|---|
| vocal-kingfisher (claude, o-prime) | 222 | 180 | 18 | 4 | 20 |
| mobile-bee (copilot) | 226 | 226 | 0 | 0 | 0 |
| reasonable-excuse (copilot) | 303 | 303 | 0 | 0 | 0 |
| monetary-quelea (copilot) | 283 | 283 | 0 | 0 | 0 |

o-prime crosstab, onset = 2026-08-26T20:56Z (its transcript switches `version` 2.1.241 →
2.1.246 at 20:55:36Z; the first clipped message is 20:56:48Z):

| framed size | before onset | after onset |
|---|---|---|
| ≤ 1022 B | 95 FULL, 12 MISSING, 1 HEAD | 43 FULL, 5 MISSING, 3 HEAD |
| > 1022 B | **41 FULL, 0 TAIL** | **1 FULL, 18 TAIL, 3 MISSING** |

Clipped prefix lengths (collapsed chars): 888, 942, 948, 962, 976, 989, 1008, 1009, 1015,
1017×4, 1018, 1020×3, 1052 — i.e. one pty chunk (1022 raw bytes). Tail-only turns came in
two shapes: `lag=0 s`, turn text == the tail alone (tail submitted by the daemon's Enter as
its own turn), and `lag=16–48 min`, tail found inside a later, larger turn (tail stranded
in the composer, then submitted together with the next message — the "split across a
boundary" the o-prime saw).

**Controlled reproduction (throwaway Claude Code 2.1.247, private tmux server):**

| variant | what was sent | user turn recorded |
|---|---|---|
| A — pij's exact sequence | `-l` 1156 B / 12 lines, 350 ms, `Enter` | **134 B, tail only** (`…ipiscing elit … TAILLINE`) |
| B — bracketed bytes | `-H` `ESC[200~` + same body + `ESC[201~`, 350 ms, Enter | **1162 B, all 12 lines** |
| C — single line | `-l` 1321 B one line, 350 ms, Enter | **299 B, tail only** (size, not newlines) |
| D — small multi-line | `-l` 225 B / 6 lines, Enter | 225 B intact |
| E — slow Enter | `-l` 1156 B, wait 3 s, Enter | composer already tail-only before Enter → 138 B |
| F — tmux native | `set-buffer` + `paste-buffer -p`, 350 ms, Enter | **1158 B, all 12 lines** |

In A/C/E the footer showed `paste again to expand`: the head chunk was recognised as a
paste and then discarded by the app; the loss happens at input-parse time, before Enter.

**Ranking**

1. **Claude Code ≥ 2.1.246 drops the first pty chunk of an unbracketed multi-chunk burst
   (VERIFIED — dominant).** Any framed text > 1022 bytes typed with a single `send-keys -l`
   loses its first 1022 bytes; ≤ 1022 bytes is unaffected; bracketed paste is unaffected;
   copilot is unaffected. Explains the "tail only, head gone" reports and their timing
   (started when the o-prime resumed under 2.1.246; the sub-seat panes spawned since run
   2.1.247). pij-side cause: `typeLiteral` (`tmux-keys.ts:95-97`) with the whole body and no
   bracketing (`daemon-tmux.ts:379`). Fix candidates, in order of certainty: wrap in
   `ESC[200~ … ESC[201~` (Claude Code's own attacher does exactly `pty.write("\x1b[200~"+
   text+"\x1b[201~")` then `"\r"` 10 ms later — seen in the binary), or use the existing
   `pasteBuffer(..., {bracketed:true})`; or chunk `-l` at ≤ 1000 bytes with ≥ 60 ms between
   chunks (untested, relies on the 50 ms byte-run timeout).
2. **Stranded tail merging into the next message (VERIFIED as a consequence of 1).** When
   the pane is busy, the surviving tail sits in the composer; Claude queues it on the
   daemon's Enter or, if the Enter is swallowed, it stays and is submitted as the prefix of
   the next injection (lag 16–48 min cases). The submit verifier cannot see this because
   `composerHasTextTail`/`composerIsEmpty` (`daemon-tmux.ts:142-151`) only look for the
   payload tail, and the `[pij from …]` frame is on the lost head, so the recipient gets an
   unframed fragment followed by a framed message. Fixing 1 removes this.
3. **Whole-message drop above ~16,300 bytes (VERIFIED mechanism, not yet observed in the
   sampled log).** `send-keys` fails with `command too long` → `execFileSync` throws →
   `classifySendFailure` says `failed` (`daemon-tmux.ts:218-220`, `:342-363`) → re-enqueued
   unread (`loop.ts:612-615`) → retried every 200 ms forever, sender stuck at
   `queued (tick-pending)`, daemon stderr spammed with `⚠️ tmux FAILED`. No cap or fallback
   exists on the send or drain path.
4. **Short messages silently missing (~10%, OBSERVED, cause not pinned).** 17 of 159
   ≤ 1022-byte messages to the o-prime never appear as a turn although their `read-*.json`
   marker was written within 0–20 s (daemon consumed them). Clusters: the 10:29–10:30Z
   boot burst (pane likely still on a modal — `driveSession` only guards init, not drain),
   and every pair from `pij-universal-ebulan` where an `⚠️ anomaly …` line and a second
   message arrive within the same second. Plausible mechanism: with 2.1.246+ two sends
   200 ms apart whose combined bytes span a chunk boundary could hit mechanism 1; before
   the onset, the boot-modal window and the 20:55Z restart account for most. Needs its own
   probe (two sub-1022 sends 200 ms apart into a throwaway pane).
5. **Newline → Enter submits the head (RULED OUT for claude, possible for pi/omp).** Claude
   Code's parser maps `\n` to `name:"enter"` and feeds it to the input hook as the literal
   string `"\n"` (newline insertion); only `\r` is `return` (from the 2.1.247 binary:
   `if(e==="\r"||e==="\x1B\r") … name="return" … else if(e==="\n"…) name="enter"`, and
   `input: e.name==="enter" ? "\n" : …`). Multi-line bodies ≤ 1022 B land as multi-line
   single turns (forensics: 172 FULL multi-line). The bg.ts comment (`core/bg.ts:142-149`)
   describing a run-on was observed on a different recipient and predates this; keep
   `flatten()` only for non-claude targets if at all.
6. **Composer clear/retype (FX001) erasing text (copilot only, LOW).** `clearTypedText`
   (`daemon-tmux.ts:183-185`) sends `BSpace × text.length` before a retype when the composer
   looks empty after 2 s; on a redraw-lagged copilot it can delete an unrelated stranded
   prefix. Copilot forensics show zero clipping, so not a contributor today.
7. **tmux key-name parsing / quoting / multi-byte (RULED OUT).** `-l` passes `Enter`, `;`,
   `\;`, `C-c`, `-l` literally; argv-only execution; UTF-8 delivered intact in the 5 KB probe.
8. **Daemon splitting a message across ticks (RULED OUT).** One message = one synchronous
   `send-keys -l`; the 200 ms pass is per message, not per chunk.

Related non-clipping defect surfaced by the same evidence: the receipt vocabulary. A send
into a busy pane is `unverified` 100% of the time (43/44 in the live log) even when it
landed, so senders cannot distinguish "queued behind a turn" from "swallowed"; and a
`failed` from mechanism 3 is indistinguishable from a transient.

## 4. Harness-side reception

- **Claude Code / Copilot / Codex receive a typed user turn.** There is no hook, MCP
  server, or file-reading adapter on the recipient side: `~/.claude/settings.json` has no
  `hooks`/`statusLine` for pij, and the repo has no `UserPromptSubmit`/`SessionStart`
  integration (only research notes under `docs/plans/001…`). The recipient model sees the
  raw `[pij from X] …` text as if a human typed it, with the paste-pill expansion Claude
  Code applies on submit. Codex/copilot: same, via their composers.
- **pi** is the only harness with a real inbox reader: `index.ts:355-395` watches its own
  `~/.pij/<self>/inbox`, calls `session.onInbound(dm)` → `pi.sendUserMessage`, marks read.
- **Pull mode already exists for all three tmux harnesses.** `selectTransport` returns
  `inbox` when `deliveryMode === "pull"` (`core/harness/types.ts:21`); `pij inbox
  [check|register] [--wait [ms]]` (`cli.ts:916-963`, `core/inbox.ts:195-244`
  `consumeInbox`) claims unread messages atomically, prints them, and emits `delivered`
  receipts (`cli.ts:877-895`). The daemon never touches a pull inbox
  (`docs/how/pij.md:61-75`). Registration is ambient (`ensureCurrentRegistration`
  `cli.ts:765-855`: `CLAUDE_*`/`COPILOT_AGENT_SESSION_ID`/codex identity, `$TMUX_PANE`
  match) and `--wait` is refused for a pushed seat (`isPushedSeat` `cli.ts:758-763`,
  message at `cli.ts:947`). `docs/retros/s041-inbox-no-tmux.md` records this landing with a
  live no-tmux copilot round-trip. So the body-on-disk read path is built and proven; what
  is missing is a *wake-up* for a tmux-bound seat that is in pull mode.
- Sender-side rendering of attachments/inline packs already assumes pull readers
  (`docs/how/pij.md:268-269`).

## 5. What a notification+pointer injection would need

Goal: the daemon types only a short, single-chunk, newline-free line such as
`[pij] 1 new message from pij-mobile-bee (id 1787796509881) — run: pij inbox` and the
recipient reads the body from `~/.pij/<self>/inbox/msg-<id>.json` via `pij inbox`.

1. **Routing**: a third transport, e.g. `selectTransport(...) === "notify"` for
   claude/copilot/codex bound seats (`core/harness/types.ts:20-30`), or simply mark tmux
   seats `deliveryMode:"pull"` and add a notify step. `route()` (`router.ts:77-87`) returns
   `{kind:"inject", text: notifyLine}` while `drainTmuxInbox` must **not** mark the message
   read (today `confirmed`/`unverified` → `markRead`, `daemon.ts:1108-1116`); read markers
   move to the `pij inbox` claim (`core/inbox.ts:195-244`), which already exists. Coalesce:
   one notice per drain pass per seat ("N new messages"), so bursts do not become N turns.
2. **Injection line**: ≤ 1022 bytes total (well under; ~120 B), no `\n`, framed so the model
   knows it is pij and not a human; keep the copilot focus-IN wake and Enter settle
   (`daemon-tmux.ts:374-378, 400`). With a single chunk, mechanism 1 cannot apply.
3. **Receipts**: `queued` until the seat's `pij inbox` claim writes the `delivered` receipt
   (`cli.ts:887-895` already does this) — honest by construction, and the `unverified`
   word can retire for these seats.
4. **Guidance**: the init injection (`core/harness/claude.ts:132-167`) must teach `pij
   inbox` as the read step and stop saying bodies arrive as turns; `cli.ts:947` must allow
   `pij inbox` (non-`--wait`) for pushed seats (it already does — only `--wait` is refused).
5. **Fallback**: if the seat never runs `pij inbox` within a bound (e.g. 2 min while ready),
   re-notify once, then escalate via the existing watchdog/status path rather than typing
   the body.
6. **Optional harness hook** (Claude Code only): a `UserPromptSubmit`/`Stop` hook or the
   `--append-system-prompt` unread-count line could replace the typed notice entirely for
   claude; copilot/codex have no equivalent, so the typed one-liner stays the common path.
7. **Compaction**: keep the `compactingAt` hold (`daemon.ts:722-726`) for the notice too;
   the body is on disk regardless, so nothing is lost if the notice is eaten.

## 6. What I'd rip out

- **`typeLiteral` of whole bodies** (`daemon-tmux.ts:379`, `tmux-keys.ts:95-97` as the body
  path). Replace with bracketed paste (`pasteBuffer` with `{bracketed:true}`,
  `tmux-keys.ts:127-138`, or a `-H`-encoded `ESC[200~…ESC[201~`) for any body, or better,
  with the pointer line above so bodies are never typed. Either way add a hard ceiling
  (~15 KB) that falls back to pointer delivery instead of throwing `command too long` on
  every pass (`daemon-tmux.ts:342-363`).
- **`core/bg.ts:150-156` `flatten()`** and its "newline is a SUBMIT" rationale for claude
  targets — it is not, and it strips structure from job reports; keep it only if a non-claude
  recipient is proven to need it.
- **The submit-verification oracle as a delivery truth** (`daemon-tmux.ts:401-450`,
  `readiness.ts:83-85`): it cannot confirm anything on a busy pane, which is the normal
  case, so `unverified` is noise (43/44). With pointer delivery the `pij inbox` claim is the
  receipt; with bracketed bodies keep at most one Enter retry.
- **The copilot type-confirm/BSpace-clear loop** (`daemon-tmux.ts:380-397`, `:183-185`) —
  a 1–2 s composer-poll workaround for a redraw race that bracketed paste and a one-line
  notice do not have; it also blocks the synchronous delivery pass for up to ~6 s.
- **The dead `EMERGENCY BYPASS` block** (`daemon.ts:263-270`): either restore the structural
  gate or delete it and the `held` outcome; today it is documentation of a guard that does
  not run, which is the "computed but unconsulted" shape the repo already names.
- **`SendBuffer.busy` plumbing** (`router.ts:117-121`) — carried, never consulted; delete or
  consult (the readiness `busy` from `capture-pane` is the signal that survives quiet tool
  calls; density busy is not).
- **`docs/how/pij-pane-signals.md` "Delivery contract"** paragraph — it describes the hold
  as live while the wrapper gate is bypassed; rewrite to match whichever way the bypass is
  resolved.

## Evidence artefacts (scratchpad, not committed)

`raw1-4.txt` (pty byte captures), `daemon-pane.txt` (read-only `capture-pane -S -2000` of
the daemon window), `forensic3.py` output tables above, `ccgrep*.txt` (Claude Code 2.1.247
binary excerpts: `name="return"`/`"enter"` branches, `PASTE_TIMEOUT`/`NORMAL_TIMEOUT`,
`pendingByteEvents`, the `\x1b[200~…\x1b[201~` + `\r` attacher). Throwaway Claude
transcript deleted after reading; no fleet pane or daemon state was modified.
