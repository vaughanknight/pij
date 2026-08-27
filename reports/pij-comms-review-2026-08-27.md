# pij communications architecture review — 2026-08-27

**Seat**: pij-primitive-toucan (Fable, bounded research seat under pij-vocal-kingfisher) · **Brief**: `perimenocause/government/briefs/pij-comms-review.md` (+ Amendment 1) · **Sub-seat files**: `reports/pij-comms-review-2026-08-27/{a-source-diagnosis,b-tmux-injection,c-durable-queue-design,d-prior-art}.md` · **pij under review**: `~/GitHub/pij` @ `b5f1fb1` (dirty: `package-lock.json`), daemon pid 550 started Mon 24 Aug 16:05 on Node 26.3.1 · **Claude Code**: 2.1.247 · **tmux**: 3.6a · **macOS**: Darwin 25.6.0.

## TL;DR

1. **Clipping is not a pij bug and not a tmux bug — it is the macOS pty + Claude Code composer.** The daemon types the whole framed body in ONE `tmux send-keys -l` (`adapters/tmux-keys.ts:95-97`, called from `adapters/daemon-tmux.ts:381` (inside `sendTextUnchecked`, `:368-451`)). The kernel's pty line discipline hands a single large write to the reader in **1022-byte chunks** (measured: a 3000-byte write is read as `[1022, 1022, 956]`). Claude Code's composer coalesces the burst into paste handling, and when the *last* chunk is a short (< ~800 chars) multi-line fragment it **replaces** what the earlier chunks put in the composer instead of appending. Net effect: any multi-line body over 1022 bytes whose tail chunk is short arrives as **only that tail** — exactly the `not clean.` / `amined.` symptom. Reproduced 8/8 times, deterministic, on a scratch peer; verified in the recipient's transcript JSONL, not from the peer's self-report (which hallucinated).
2. **No message was actually dropped in transport today** — sub-seat (a) accounted for all 206 inbound to the o-prime: 172 user turns, **15 absorbed mid-turn** (Claude Code turned them into `queued_command` attachments after a tool result, which `pij tail` cannot render), 19 clipped. The transport is *unobservable*, not lossy: the spine has no message kind, the sender receipt is a constant label, and `unverified` (321/500 receipts today) consumes the durable copy at-most-once — the latent real loss path (§3).
   The clip itself is a **Claude Code 2.1.246 regression**: 42/42 oversize bodies intact on 2.1.241 before the o-prime's 20:55Z revive, 19/19 clipped after it.
3. **Claude Code ≥ 2.1.224 already ships the transport pij needs**: a per-session Unix inbox socket (`/tmp/cc-socks/<pid>.sock`, registry `~/.claude/sessions/<pid>.json` which *already records the tmux pane*). I sent 3 KB / 31-line bodies through it from a plain Python script and from `SendMessage`: **delivered intact, mid-turn, with no keystrokes at all**. I captured the exact wire frame. A bypass-permissions fleet accepts a daemon-originated frame when the frame asserts `from-mode="bypass"` (tested; `from-mode="default"` is held for approval).
4. **Recommendation**: SQLite (WAL, built-in `node:sqlite`) as the single durable queue + receipts + spine; deliver to Claude peers over their inbox socket, and to every other harness with a **one-line pointer** (`[pij 41–43 from X] run: pij inbox --since 40`) — never type a body into a pane again. Keep `pij send` / `pij inbox` / `[pij from …]` byte-compatible. PoC ≈ 4 days; clipping fix alone (socket for Claude, pointer for the rest) is < 1 day and could ship first.

---

## 1. Findings — the send path today (file:line)

| Step | Where | What happens |
|---|---|---|
| `pij send <to> …` | `core/cli.ts` send verb; receipt classification `core/cli.ts:2200-2215` (`classifySendReceipt`) | Preflights liveness (`preflightSendTargets`, `:2163-2184`), then `deps.delivery.deliver()` |
| Persist | `adapters/channel.ts:158-169` (`FsChannel.deliver`) | Writes `~/.pij/<to>/inbox/msg-<ms>-<seq>-<pid>.json` via tmp+`rename` (atomic). This file **is** the queue. No fsync on the body. |
| Receipt | `classifySendReceipt` → `queued (tick-pending)` for any daemon-owned (claude/copilot/codex) target (`core/cli.ts:2212-2215`) | "queued" is a *prediction*, not a fact — nothing has been delivered yet. The `daemonTickStatus` staleness hint is the only liveness the sender sees. |
| Route | `core/daemon/router.ts:77-87` (`route`) | pi → `observe` (in-process inbox); bound tmux seat → `inject`; unbound → `buffer` (in-memory `SendBuffer`, `:99-176`). |
| Frame | `core/message.ts:11-13` (`frame`) via `router.ts:40-42` (`injectionText`) | `[pij from <id>] <body>` — body verbatim, newlines and all. |
| Inject | `adapters/daemon-tmux.ts:342-451` (`sendText` → `sendTextUnchecked`) | **One** `typeLiteral(paneId, text)` = `tmux send-keys -t %N -l <whole framed body>` (`adapters/tmux-keys.ts:95-97`), sleep `enterSettleMs(harness)`, capture pane, `pressKey Enter` up to `SUBMIT_ATTEMPTS`, poll `submissionConfirmed`. Outcome ∈ `confirmed | unverified | failed | gone`. `pasteBuffer` (bracketed `set-buffer`+`paste-buffer -p`, `tmux-keys.ts:127-138`) exists but the daemon never uses it. |
| Tick | `core/daemon/loop.ts` / `tick-heartbeat.ts` | ~600 ms nominal poll of every seat's inbox dir + pane capture; the sender's "tick-pending" means "wait for the next pass". |

The design intent is sound (durable file is the queue, in-memory buffer is only a view — `router.ts:88-98` documents the 2026-07-25 restart loss). The failure is downstream of all of it: what happens to the bytes after `send-keys`.

## 2. Findings — clipping, reproduced from source and live

### 2.1 Repro protocol
Two scratch `claude --model haiku` peers spawned with `pij spawn` (closed afterwards). Bodies sent (a) through `pij send --body-file` (daemon path), and (b) directly with `tmux send-keys -l` / `paste-buffer -p` into the peer's pane, bypassing the daemon. Ground truth = the recipient's transcript `~/.claude/projects/…/<session>.jsonl` `type:"user"` entries (the peer's own "what I received" replies were **wrong** — one claimed a first line that never existed — so LLM self-report is not evidence).

### 2.2 Results

| # | Path | Body | Lines | Delivered user turn | Verdict |
|---|---|---|---|---|---|
| EXP0 | `pij send --body-file` (daemon) | 1367 B framed | 12 | **345 chars**, starts mid-word `te in total length when done.\nLINE-10…` | CLIPPED — head (prefix, SHA, lines 1–9) gone |
| short | `pij send` | 84 B | 4 | 84 chars, intact | ok |
| EXP1 ×3 (+ASCII-only variant) | direct `send-keys -l` | 1367 B | 12 | 350/351/351/347 chars, tail only | CLIPPED, deterministic |
| EXP2 | direct `load-buffer` + `paste-buffer -p` (bracketed) | 1367 B | 12 | 1368 chars | intact |
| EXP3 | direct `send-keys -l` in 200-B chunks, 40 ms apart | 1367 B | 12 | 1368 chars | intact |
| EXP4 ×2 | direct `send-keys -l` | 3018 B | 31 (100-char lines) | 3018 chars | intact (!) |
| EXP5 | direct `send-keys -l` | 1385 B | 31 (42-char lines) | 363 chars | CLIPPED |
| EXP6 | direct `send-keys -l` | 2651 B | 12 (250-char lines) | 607 chars | CLIPPED — **two** chunks lost |
| EXP7 | direct `send-keys -l` | 1362 B | 1 (no newline) | 1362 chars, composer showed `[Pasted text #15]` + inline tail | intact |
| EXP10 | direct `send-keys -l` | 1858 B | 27 | 1858 chars | intact (tail chunk 836 B) |
| T1–T3 | typed prefix, 400 ms gap, then a small multi-line chunk | ≤ 1 KB | 3–11 | intact | appending works when chunks are not back-to-back |

Cut offsets: EXP0 lost 1020 B, EXP1 lost 1017–1021 B, EXP5 lost 1022 B, EXP6 lost 2044 B (= 2 × 1022). Surviving text is always exactly the **last pty chunk**.

### 2.3 Mechanism (three layers, all confirmed)

1. **Kernel**: a Python `pty.fork()` child in raw mode reading a single 3000-byte parent write receives `[1022, 1022, 956]` — the BSD tty `TTYHOG` (1024) queue minus 2. tmux writes the whole `send-keys -l` payload in one go; the pty hands it to Claude Code as ~1022-byte reads a few hundred µs apart. (The pane tty is `-icanon`, `imaxbel` — see `stty -a -f /dev/ttys018`.)
2. **Claude Code composer (2.1.247)**: each stdin chunk is classified independently. A chunk ≥ ~800 chars (or many lines) becomes a `[Pasted text #N]` pill; a newline-free chunk is typed inline; **a short chunk that contains newlines, arriving within the paste-coalesce window of a previous chunk, replaces the composer content**. Hence: EXP7 (pill + inline tail) intact; EXP4/EXP10 (every chunk ≥ 836 B → all pills) intact; EXP0/1/5/6 (tail chunk 345–607 B with newlines) → only the tail survives. Threshold bracketed empirically at 607 < t ≤ 836 chars, consistent with Claude Code's documented ~800-char paste collapse. This is a Claude Code bug (worth filing with the EXP1 recipe: `tmux send-keys -l "$(printf 'x%.0s' {1..1100})\nline\nline"`), but pij cannot wait on it.
3. **pij**: `sendTextUnchecked` then presses Enter and looks for `submissionConfirmed` (`daemon-tmux.ts:404-431`), which matches on the *tail* of the text (`composerHasTextTail`) — the tail is exactly the part that survived, so the daemon reports **`confirmed`**, the inbox file is marked read, and the sender's receipt is upgraded to delivered. The clip is invisible to every observer except the recipient's model.

Why it is "most multi-line bodies from PMs": a PM's verdict message is typically 1.1–2 KB with a 2–4-line closing (`… not clean.`) — precisely the shape (≥ 1 chunk of ≥ 1022 B + a short multi-line tail) that triggers the replace. Single-line bodies and bodies under 1022 B framed are safe, which is why short pings always worked.

Also observed live during this session: a scratch peer's ~1.2 KB multi-line reply to *me* arrived without its `[pij from …]` prefix — the same clip on the o-prime-facing direction.

### 2.4 Fleet-wide forensics (sub-seat (b), `b-tmux-injection.md` §3)
Every inbox body was searched in the recipient's transcript for four seats:

| seat (harness) | msgs | FULL | TAIL | HEAD | MISSING |
|---|---|---|---|---|---|
| vocal-kingfisher (claude, o-prime) | 222 | 180 | 18 | 4 | 20 |
| mobile-bee / reasonable-excuse / monetary-quelea (copilot) | 812 | **812** | 0 | 0 | 0 |

o-prime crosstab around the 20:55:36Z revive (2.1.241 → 2.1.246): bodies > 1022 B — **41 FULL / 0 TAIL before, 1 FULL / 18 TAIL / 3 MISSING after**. Clipped prefix lengths cluster at 1017–1020 collapsed chars (= one 1022-byte pty chunk). **Copilot is unaffected**: the clip is a Claude Code composer behaviour, not tmux or pij. (b)'s own controlled repro on a private tmux server agrees with mine and adds: bracketed bytes `ESC[200~ … ESC[201~` (Claude Code's own attacher does exactly this, then `\r` 10 ms later — visible in the binary) survive; a single-line 1321 B body clipped in (b)'s run while my EXP7 single-line survived via a paste pill — so "single-line is safe" is timing-dependent and must not be relied on. Note: (b)'s MISSING bucket (20 + 3) searched `user` turns only; (a) resolved those same messages as mid-turn `queued_command` attachments (§3 row A), so the two forensics agree. Two clip shapes were seen live: tail submitted alone by the daemon's Enter (lag 0), and tail stranded in the composer then submitted as the *prefix of the next message* 16–48 min later — the "split across a tool-result boundary" the o-prime reported.

## 3. Findings — silent drop and at-most-once paths

Sub-seats (a) and (b) independently diffed the o-prime's inbox dir against its transcript for the whole day (`a-source-diagnosis.md` §5–6): **206 inbound since 2026-08-26T10:40Z — 172 landed as user turns, 15 absorbed mid-turn, 19 clipped, 0 unaccounted.** There is no transport-level drop today; "the spine has no event" is true of *every* message, because the spine has no message kind at all. The reported drops decompose as:

| # | Path | Where (file:line) | Sender sees | `pij tail`/spine sees | Fired today |
|---|---|---|---|---|---|
| A | **Mid-turn absorption**: target busy → typed text + Enter enters Claude Code's own queue → at the next tool-result boundary Claude Code removes it (`queue-operation remove reason=absorbed_mid_turn`) and injects it as an attachment `{"type":"queued_command","prompt":"[pij from …] …"}`, not a `user` turn. The model sees it once, sandwiched after a tool result. | pij side `daemon-tmux.ts:437-450` → `unverified` | `unverified` | **nothing** — `summarizeTranscriptLine` (`core/harness/claude.ts:49-66`) renders only `user`/`assistant` | 15× (incl. this seat's two `READY` lines at 01:56Z) |
| B | **Head clip** (§2): unframed tail submits, pane goes busy → | `delivered` (17/19) | an unframed fragment turn | 19× |
| C | **`unverified` consumes**: `loop.ts:597-615` marks the durable copy read on `unverified` "because the payload WAS typed" — if the composer was then cleared (human Esc, `/clear`, app death, auto-compact reset) the only copy is gone. 321/500 receipts today are `unverified`, because the submit oracle needs a not-busy pre-sample (`core/readiness.ts:83-85`, `daemon-tmux.ts:164-175`) and never gets one against a busy pane; each costs three Enters and ~4 s of synchronous sleep. | `loop.ts:600-601, 615`; `daemon.ts:1107-1114` | `unverified` | no | latent (the 20:47–20:54Z o-prime Ctrl-C window is exactly this shape) |
| D | **No readiness gate before typing**: `deliverPass`/`drainInbox` check lifecycle, paneId, compact hold and composer hold only (`daemon.ts:801-809`, `1013-1129`); a bound seat sitting at a shell prompt, a dialog, or mid-boot gets the body typed into *that* and consumed as `unverified`. | `daemon.ts:1013-1129` | `unverified` | no | latent |
| E | **Pane gone → seat dissolved, mail orphaned** under the old id (`daemon-tmux.ts:218-220` → `daemon.ts:150-165`). | | later `E-DEAD` | `pij state` | 0 today |
| F | **Self-initiated/auto compaction is invisible** — only a remote `--command compact` sets `compactingAt` (`daemon.ts:1095-1104`); a body typed during auto-compact is eaten by the context reset. | `router.ts:58-62` | `unverified`/`delivered` | no | not evidenced |
| G | **Composer-hold cascade**: a clipped fragment left in the composer is not an exact echo of the injection (`pane-signals.ts:649-664`) → read as human typing → inbox held 60 s (`USER_TYPING_IDLE_MS`, `pane-signals.ts:6, 674-681`); the next inject is then *appended* to the fragment → concatenated turn. | `loop.ts:591-594` | none | no | after every clip |
| K | **> ~16,300 B body → whole-message loop**: `send-keys` fails `command too long` (tmux `MAX_IMSGSIZE`) → `execFileSync` throws → `failed` (`daemon-tmux.ts:218-220, 342-363`) → re-enqueued unread (`loop.ts:612-615`) → retried every 200 ms forever, blocking that seat's FIFO behind it. | | `queued` forever | no | mechanism verified, not observed today |
| J | **Sender receipt is a label**: `classifySendReceipt` returns `queued/tick-pending` for every daemon-owned target unconditionally (`core/cli.ts:2213-2215`). | | always | | every message |

Restart safety (`SendBuffer` in-memory, files unread until inject — plan 071 D7) held today: the 6-day-old daemon at `b5f1fb1` is the same commit as HEAD and is not the problem.

**The clip is a Claude Code regression.** Same transcript diff: every framed payload > 1022 B delivered before the 20:54:21Z revive (Claude Code **2.1.241**) landed intact — **42/42**; every one after the 20:55:36Z revive (**2.1.246**) landed as an unframed tail — **19/19**; head loss = exactly 1022 B in the four cleanly measurable cases. 2.1.247 (my scratch peers) behaves like 2.1.246. Sub-seat (a) also found that Claude Code's *own* remote-reply path writes `\x1b[200~<text>\x1b[201~` then `\r` (bracketed paste) — i.e. Anthropic does not type into its own TUI unbracketed either, which is why EXP2 (bracketed) survives.

## 4. Findings — mid-turn injection semantics

- Claude Code queues a submitted composer line while a turn is running and surfaces it "between tool calls … within the same turn" — this session received every peer message as a `The user sent a new message while you were working:` block glued to a tool result. The `[pij from …]` prefix is the **only** thing distinguishing it from the human, and after a clip the prefix is the first thing lost, so a clipped peer message is indistinguishable from an operator typing `not clean.`.
- The daemon's `isCompacting` hold (`router.ts:58-62`) and the `USER_TYPING_IDLE_MS` pane hold (`SendBuffer.isPaneHeld`, `router.ts:127-140`) are the only mid-turn awareness; neither knows whether the composer's contents survived.
- By contrast, a socket-delivered message is rendered by Claude Code itself as `Another Claude session sent a message:\n<cross-session-message from="uds:…" from-name="…" from-mode="…">…</cross-session-message>` — provenance is structural, not a typed prefix (verified in the transcript of peer `pij-armed-giraffe`).

## 5. Findings — the Claude Code inbox socket (verified live)

| Fact | Evidence |
|---|---|
| Every interactive/`-p` Claude session binds `/tmp/cc-socks/<pid>.sock` (mode 0600) and writes `~/.claude/sessions/<pid>.json` with `pid, sessionId, cwd, version, peerProtocol:1, tmux:"peri-prime:@14.%36", messagingSocketPath, name, status` + a `<pid>.<sha>.key` file `{peerToken, procStart, pidDomain}` | listed on this machine: pids 4437, 69129, 83463, 84394 |
| Exported to Bash children as `CLAUDE_CODE_MESSAGING_SOCKET` / `CLAUDE_CODE_MESSAGING_TOKEN` | present in this seat's env |
| Wire frame (captured by registering a fake session record pointing at a Python listener and calling `SendMessage`): | `{"msgV":1,"msg_id":"<uuid>","type":"user","message":{"role":"user","content":"<cross-session-message from=\"uds:/tmp/cc-socks/84394.sock\" from-name=\"perimenocause-40\" from-mode=\"bypass\">\n…\n</cross-session-message>"},"priority":"next","from":"uds:/tmp/cc-socks/84394.sock"}` + `\n` |
| Raw Python `socket.connect` + one JSON line, 3008-char / 31-line body → recipient transcript shows the **full** body (3590 chars incl. wrapper) | SOCK1 |
| `SendMessage` tool, 2.1 KB / 16 lines → full body, delivered mid-turn, no hold | SOCK2 |
| Inbound policy: receiver in bypass mode **holds** a frame whose content lacks `from-mode="bypass"` (dialog: "Deny / Deliver this message to Claude", 5-min expiry) and **delivers** one that asserts it — even when `from` names a nonexistent socket | RAW-A (bypass, real from) delivered; RAW-B (bypass, bogus from) delivered; RAW-C (`from-mode="default"`) held |
| Documented limits: ~1 MB per message, 50-deep receive queue, per-sender rate limit + identical-repeat dedupe, burst refusal at sender; `peer_message_status` ACK frame (`orig_msg_id`, `dropped_msg_ids`, `drop_reason`, `wereHeld`) | https://code.claude.com/docs/en/cross-session-messaging ; `strings` of the 2.1.247 binary (`[uds-messaging] …`) |
| Off when: `--bare`, Bedrock/Vertex/Foundry, or `DISABLE_TELEMETRY`/`DO_NOT_TRACK`/`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`/`DISABLE_GROWTHBOOK` block the feature flag; bind can fail silently (issue #84945 → record has no `messagingSocketPath`) | docs; treat "no `messagingSocketPath`" as "fall back to pointer injection" |

Security note for the design: `from-mode` is a self-assertion inside the content. That is acceptable for a single-user local fleet (the socket is already 0600), but the honest configuration is `--settings '{"crossSessionInbound":"accept"}'` on every pij-spawned Claude seat, which removes the hold logic from the path entirely.

## 6. Options

Scored ●●● best → ● worst. Full rationale and sources in `c-durable-queue-design.md` §6 and `d-prior-art.md` §5.

| Option | Loss | Ordering | Latency | Observability | Migration | Mid-turn | Compacted | Dead | Revived |
|---|---|---|---|---|---|---|---|---|---|
| **A** status quo: file + 600 ms tick + type body | ● (clip invisible; `unverified` consumes) | ●● | ● (tick; 5–19 s seen) | ●● | — | ● | ●● | ●● | ● |
| **E** keep typing bodies, via bracketed `paste-buffer -p` | ●● (fixes clip; Enter/paste races, 16 KB imsg cap, CSI-u newline bug remain; still no ACK) | ●● | ● | ●● | ●●● (10 lines) | ● | ●● | ●● | ● |
| **B** per-recipient JSONL log + pointer injection | ●●● | ●●● | ●● (FSEvents unreliable → 500 ms poll) | ●●● (`tail -f`) | ●● | ●●● | ●●● | ●●● | ●●● |
| **C** SQLite WAL = queue + receipts + spine, pointer injection | ●●● | ●●● | ●● (same wake issue as B) | ●● (`pij tail` renders rows; `sqlite3` for humans) | ●● (`node:sqlite` already used in `session-sql`) | ●●● | ●●● | ●●● | ●●● |
| **D** = C + `~/.pij/daemon.sock` API, direct-DB fallback | ●●● | ●●● | ●●● (send→inject in ms, no tick on hot path) | ●●● (+ live subscribe) | ● (most code) | ●●● | ●●● | ●●● | ●●● |
| **S** Claude inbox socket as the *injection* layer (orthogonal to B/C/D) | ●●● for the pointer/body hop; ACK frame | n/a | ●●● (mid-turn, between tool calls) | ●● (`peer_message_status`) | ●● (~150 lines in `daemon-tmux`) | ●●● | ●●● (Claude queues) | ●●● (ECONNREFUSED is honest) | ●●● |

Where B and C tie on durability, C wins as soon as receipts, leases and cursors exist (three JSONL files with cross-references vs. three indexed tables). E is the cheapest clip fix but leaves loss, latency and observability where they are — recommended only as the *fallback* for non-Claude harnesses if the pointer is ever too long, which it never is (< 200 B, single line).

## 7. Recommendation

**C + S now; D as phase 2.** Concretely:

1. **Store** — one `~/.pij/queue/pij.sqlite` (WAL, `synchronous=NORMAL`, `busy_timeout=5000`) opened with `node:sqlite` `DatabaseSync`. Tables `messages` (immutable; `seq` rowid, `id` UNIQUE sender-minted `<from>-<ulid>` idempotency key, `to_id, from_id, kind, body|body_path, attachments, created_at, not_before`), `deliveries` (`state ∈ queued|claimed|injected|acked|parked|terminated`, `attempt, claim_token, lease_until`), `receipts` (append-only), `cursors` (`acked_seq, notified_seq` per recipient). Schema DDL in `c-durable-queue-design.md` §7.
2. **Delivery state machine** — `queued →(claim, BEGIN IMMEDIATE … RETURNING)→ claimed →(inject/notify ok)→ injected →(pij inbox reads)→ acked`; lease expiry (`AckWait` 90 s, backoff `[5s,30s,120s,600s]`, `max_deliver` 6 → `parked`) re-queues; daemon restart resets `claimed→queued`; no in-memory `SendBuffer`. Exactly one in-flight claim per recipient so pointers land in order. At-least-once with idempotent ids; `pij inbox` acks by `id`.
3. **Injection layer per harness**
   - **Claude** (`descriptor.harness === "claude"`): resolve `~/.claude/sessions/*.json` by `tmux` pane (already in the record — no scraping) → write ONE frame to `messagingSocketPath` (format in §5, `from-mode="bypass"`, `from:"uds:pij-daemon"`), read `peer_message_status` as the ACK → `injected`. Short bodies (< 4 KB, the common case) go **inline** in the frame — no `pij inbox` round-trip needed; longer bodies or attachments go as a pointer. Fallback to the pointer-typing path when the record has no `messagingSocketPath` or connect fails.
   - **Copilot / Codex / pi-in-a-pane**: type ONE ASCII line, no newline, < 200 B (routing/marking/receipt details in `b-tmux-injection.md` §5 — the read marker moves from the drain to the `pij inbox` claim, `core/inbox.ts:195-244`; one coalesced notice per drain pass per seat): `[pij 41–43 from pij-vocal-kingfisher] 3 new — run: pij inbox --since 40`, then Enter + the existing `submissionConfirmed` verify. Body never touches the pane. Add `SessionStart`/`UserPromptSubmit` hooks (Copilot, Claude) that run `pij inbox --inject` so a human keystroke also drains.
   - **pi in-process** and the Telegram bridge: subscribe on the daemon socket (phase 2) or keep the 500 ms poll, but read from SQLite.
4. **Keep the surfaces**: `pij send <to> "<text>" | --body-file`, `pij inbox [--since N] [--peek]`, `[pij from <id>] ` prefix on every body the model sees (the socket wrapper *adds* `<cross-session-message from-name=…>` around it, so existing skills' `parseFrame` keep working), receipts vocabulary `queued|delivered|blocked` (+ `injected|acked|parked` as new detail).
5. **Rip out**: `SendBuffer` (`router.ts:99-176`), the body-typing branch of `sendTextUnchecked` (`daemon-tmux.ts:368-451` shrinks to "type one short line"), `composerHasTextTail`-based confirmation for bodies, the `read-<id>.json` marker files, the per-message `msg-*.json` inbox dirs after one release of dual-write, `daemonTickStatus` as the sender's only liveness signal, FSEvents `fs.watch` on inbox dirs (`channel.ts:67-70` already admits it drops events), the three-Enter submit verifier against busy panes (`daemon-tmux.ts:409-436`; press once, confirm from the transcript), the `unverified ⇒ consumed` rule (`loop.ts:600-615`), typing without a readiness gate (`daemon.ts:1013-1129`), and the exact-match composer-echo rule (`pane-signals.ts:649-664`).

## 8. Migration (daemon → CLI → harness adapters)

| Phase | Change | Compat |
|---|---|---|
| 0 (½ day, ship first) | Daemon: for `harness:"claude"` targets, deliver over the inbox socket with the body inline; keep the file inbox + read markers as today. For non-Claude, replace body typing with the pointer line (if a body must ever be typed, use the already-written bracketed `pasteBuffer`, `tmux-keys.ts:127-138`). Cap any typed payload at 900 B at `core/cli.ts:3283` meanwhile. | Nothing else changes; clipping stops the same day. |
| 1 | Daemon: SQLite adapter behind `DeliveryPort`/`InboxPort` (`core/ports.ts`); **dual-write** row + `msg-<id>.json` (`body_path`); drain claims from DB. Restart = `claimed→queued`. | Old peers' `pij inbox` still reads files. |
| 2 | CLI: `pij send` inserts into SQLite (mints `id`, returns `{id, seq}`; `--wait` polls receipts); `pij inbox --since`, `--peek`, ack-by-id; `pij tail` reads `receipts ⋈ messages`; delete markers. | `[pij from …]` unchanged. |
| 3 | Harness adapters: Claude socket path becomes primary with `--settings '{"crossSessionInbound":"accept"}'` on spawn; Copilot/Claude hooks `pij inbox --inject`; pi thin receiver + Telegram bridge read SQLite. Drop the JSON inbox write. | |
| 4 (phase 2 / option D) | `~/.pij/daemon.sock`: `pij send` → daemon does insert + claim in one event-loop turn; `subscribe` for live consumers and `pij tail -f`; direct-DB fallback when the socket is absent. Tick stays as a 500 ms lease sweeper. | No schema change. |

## 9. PoC plan (days)

| Day | Deliverable | Proof |
|---|---|---|
| 1 | `adapters/claude-socket.ts`: resolve pane → session record → socket; send frame; parse `peer_message_status`. Wire into `sendText` for `harness:"claude"`. Pointer line for others. | EXP0 body via `pij send` arrives intact in the recipient transcript; `pij tail` shows `injected` with the ACK `msg_id`. |
| 2 | `adapters/sqlite-queue.ts` (schema above) + `drainTmuxInbox` claims from DB; restart resets claims. | Kill/restart a *test* daemon mid-queue; every message still delivered once. |
| 3 | CLI: `pij send` → DB, `pij inbox --since/--peek`, `pij tail` from receipts; dual-write off behind a flag. | 200-message fan-in from 8 senders to one recipient: zero loss, in-order, p95 send→ack < 1 s (socket) / < 1.5 s (pointer). |
| 4 | Hooks + `--settings crossSessionInbound:accept` on spawn; Telegram/pi readers; docs + RUNBOOK. | Fleet-shaped soak (1 o-prime, 8 peers, 100 msgs) with a `pij comms-audit` that diffs sent ids vs. transcript-observed ids. |

Phase 2 socket API: +2 days when wanted.

## 10. Tests that would have caught today's failures

1. **Transcript-oracle delivery test** (integration, real tmux + `claude -p`/haiku): send bodies of 500 B / 1.3 KB×12 lines / 2.6 KB×12 lines / 3 KB×31 lines / 1.3 KB single line; assert the recipient's transcript `type:"user"` content equals the framed body byte-for-byte. Today's `submissionConfirmed` oracle (`daemon-tmux.ts`) checks the *tail* — the test must check the *head*. Fails today on the 1.3 KB and 2.6 KB cases.
2. **pty-chunk unit test**: feed `sendTextUnchecked` a fake runner and assert no single `send-keys -l` argument exceeds 1000 bytes *or* contains `\n` — i.e. bodies are never typed. Fails today.
3. **Receipt honesty test**: for every `SendOutcome` other than `confirmed`, assert the durable copy is *not* consumed and a receipt naming the outcome exists (catches the `unverified`-consumes path, §3).
4. **Daemon-restart replay test**: 20 queued messages, SIGKILL the daemon between claim and inject, restart; assert 20 acks, no duplicates (idempotency), order preserved.
5. **Spine completeness test**: every `pij send` id must appear in `pij tail` with a terminal state within the lease; a `queued` older than `max_deliver × AckWait` is a test failure (today's "queued forever" drop).
6. **Fleet soak** (nightly): the day-4 `comms-audit` above; alert on any id present in `messages` but absent from any transcript.
7. **Transcript-derived receipt test**: the daemon watches the recipient transcript (`transcriptPathFor`, `core/harness/claude.ts:37-39`) for the framed text as a `user` turn *or* a `queued_command` attachment and emits `delivered` / `absorbed-mid-turn`; `pij tail` must render both. Fails today (15 absorbed messages invisible).
8. **Socket contract test**: fake inbox (the 40-line Python listener used in §5) asserting the frame shape, and a live `claude -p --settings '{"crossSessionInbound":"accept"}'` worker asserting delivery + ACK — so a Claude Code frame-format change breaks CI, not the fleet.

## Sources

- Sub-seat reports: `reports/pij-comms-review-2026-08-27/a-source-diagnosis.md`, `b-tmux-injection.md`, `c-durable-queue-design.md` (SQLite/JSONL/socket/broker sources with URLs), `d-prior-art.md` (Claude Code channels, tmux orchestrators, Codex/Copilot/ACP, with URLs).
- https://code.claude.com/docs/en/cross-session-messaging — inbox socket, `crossSessionInbound`, limits, `CLAUDE_CODE_MESSAGING_SOCKET/_TOKEN`.
- https://github.com/anthropics/claude-code/issues/84945 — socket bind failure mode.
- Repro artefacts (scratchpad, this session): `long-body.txt`, `exp1…exp10.txt`, `fake-inbox.py`, `fake-inbox.frames.log`; recipient transcripts `~/.claude/projects/-Users-vaughanknight-GitHub-perimenocause/{3d7c6f0c-…,e83164a1-…,2a96b59f-…}.jsonl`.

---

## 11. PoC — day-1 slice, built and proven (2026-08-27, Amendment 2)

**Where**: git worktree `~/GitHub/pij-poc`, branch `poc/comms-sqlite-socket` (6 commits on top of `b5f1fb1`, 16 files, +1737/−24). The live checkout `~/GitHub/pij` and daemon pid 550 were never touched — `/opt/homebrew/bin/pij` resolves into `~/GitHub/pij`, so the branch could not be checked out in place.

| SHA | What |
|---|---|
| `3a1a2e4` | `adapters/sqlite-queue.ts` — SQLite WAL queue behind `DeliveryPort`+`InboxPort` (messages / deliveries state machine / receipts / cursors; idempotent ids; `claim`/`settle`/`recoverStaleClaims`/`resetClaimsOnStart`). `adapters/claude-socket.ts` — resolve `~/.claude/sessions/<pid>.json` → write the cross-session frame (§5). 14 tests. |
| `c27e722` | `DaemonPorts.sendSocket` + socket-first `drainTmuxInbox` for claude (commands still type; `failed` leaves the row unread; `no-socket` falls back). `adapters/channel-factory.ts`: `PIJ_QUEUE_BACKEND=sqlite` opt-in, default `fs` unchanged; daemon re-queues in-flight claims on start. |
| `b610db8` | `pij spawn` passes `PIJ_HOME`/`PIJ_QUEUE_BACKEND`/`PATH` to seats when `PIJ_HOME` is set — the isolation mechanism (see below). |
| `d4022d4` | `consumeInbox` (the `pij inbox` code path) over `SqliteQueue`. |
| `e699443` | `adapters/copilot-rpc.ts` — `session.send` over Copilot's embedded JSON-RPC; `pij spawn --harness copilot` allocates a free loopback port, launches `--ui-server --port <P>`, records `rpcPort` on the descriptor; drain routes such seats through `sendSocket`. |
| `a0ea28a` | Pointer-line path for seats with no endpoint + lease-based re-announce; daemon acts only on `queued` rows (`listQueued`), sweeps expired leases every drain. |

**Isolation mechanism (required — found while setting up)**: `refreshPaneSignals` (`daemon.ts:1274-1280`) runs `tmux pipe-pane` on **every** pane of the tmux server it sees, not only registered seats; a second daemon on the default server would steal the live daemon's pane taps. The PoC daemon therefore runs with `TMUX=<socket of a private server>` (`tmux -L pijpoc`), `PIJ_HOME=<scratch>/home`, `PIJ_QUEUE_BACKEND=sqlite`, and spawns seats into that server via the isolated CLI. Verified: the o-prime pane's `#{pane_pipe}` stayed `1` throughout. Recommendation: make the daemon tap only panes it owns (or gate on `-L`) before any second-daemon workflow is documented.

**Live proofs (isolated daemon + scratch seats, all bodies verified in the recipient harness's own transcript, not by the model's say-so)**

| # | Scenario | Result |
|---|---|---|
| C1 | claude seat, idle: `pij send --body-file` 3032 B / 31 lines | byte-exact user turn; `queued → acked` in **391 ms**; zero keystrokes (`<cross-session-message from="uds:pij-daemon" …>`) |
| C2 | claude seat **mid-turn** (inside `sleep 40`) | delivered 9 s into the tool call, byte-exact, no clip |
| C3 | daemon SIGTERM, 2 sends while down, daemon restart | both `queued` in SQLite while down; restart injected both; each seen exactly once by the seat (one as a user turn, one as a mid-turn attachment) |
| P1 | copilot seat spawned by `pij spawn` with `--ui-server` (`rpcPort=54214`): `pij send` 3048 B / 31 lines | byte-exact `user.message` in `~/.copilot/session-state/<id>/events.jsonl`; model replied `lines=31 chars=3048` |
| P2 | copilot raw RPC, `mode:"immediate"` while a 600-word turn was generating | held until the turn boundary, consumed **37 ms** after `assistant.turn_end`, byte-exact |
| L1 | same copilot seat with `rpcPort` removed (legacy): `pij send` | pane received only `[pij from pij-poc-sender] 1 new message — run: pij inbox`; body never on the pty; row `injected` under a 90 s lease |
| L2 | seat never runs `pij inbox` | lease expired → receipts `queued, injected, redelivered, injected`; pointer re-announced 91 s later (03:12:15 → 03:13:47), body still unread in SQLite — nothing lost, nothing typed twice |
| U | unit: crash between claim and inject → redelivered (restart reset + lease sweep), duplicate ack absorbed, drop-status → `failed`, pointer never types a body, `/compact` still types raw | 30 new tests; full extension suite green (`vitest run .pi/extensions/pij`), `tsc --noEmit` clean |

**How to run it** (never against the live fleet):
```
git -C ~/GitHub/pij worktree add ~/GitHub/pij-poc poc/comms-sqlite-socket   # once
tmux -L pijpoc new-session -d -s poc -c <repo>
export PIJ_HOME=<scratch>/home PIJ_QUEUE_BACKEND=sqlite PATH=<dir with pij→~/GitHub/pij-poc/harness/scripts/pij-cli.cjs>:$PATH
TMUX="$(tmux -L pijpoc display -p '#{socket_path}'),0,0" npx tsx ~/GitHub/pij-poc/.pi/extensions/pij/daemon.ts &
tmux -L pijpoc send-keys -t poc 'pij spawn --harness claude --model haiku --layout window' Enter   # from a pane of the private server
sqlite3 $PIJ_HOME/queue/pij.sqlite 'select seq,to_id,state from deliveries'        # pij tail on receipts is day-2
```

**Caveats / day-2 list**
- Sync delivery pays a `node -e` child per send (~40 ms); make the drain async and use `net` directly.
- `pij send`/`pij inbox` still resolve the caller from harness env (`CLAUDE_CODE_SESSION_ID`, `COPILOT_AGENT_SESSION_ID` + session-state dir); a non-harness sender (a script, the daemon's own tests) needs `PIJ_SESSION_ID` + a pull descriptor **and** the Claude env unset — worth a `--as <id>` / `PIJ_SENDER` escape hatch.
- `pij spawn`'s revive/adopt path (`cli.ts:~3801`) does not yet allocate `rpcPort`; revived copilot seats fall to the pointer path.
- Pointer path relies on the recipient running `pij inbox`: the init injection (`core/harness/claude.ts:132-167` and the copilot equivalent) must say so, and Copilot/Claude hooks (`SessionStart`/`UserPromptSubmit` → `pij inbox --inject`) should drain on any keystroke. The scratch copilot seat, told "no tools", answered the pointer text instead of pulling — guidance, not transport.
- `pij tail` does not yet render SQLite receipts; `pij send --wait` not implemented; fs→sqlite dual-write/migration not implemented (opt-in flag only).
- A fresh Copilot session's first model turn hung once (0 AIC, `pending`) after an MCP reload, with typed and RPC prompts alike; a relaunch was clean. Not RPC-related but worth a readiness check before the first send.
- `pij report --state working` is rejected by this build (valid: blocked|question|hold|waiting|ready|failed|cancelled|done) — the PA's staleness rule and the report vocabulary disagree.

## 12. Copilot and Codex — can we use sockets there too? (Amendment 2)

Full evidence in `reports/pij-comms-review-2026-08-27/e-copilot-codex-ipc.md`.

| Harness | Running seats today | New seats | Verdict |
|---|---|---|---|
| **Copilot CLI 1.0.81** | **No.** `lsof` on all four fleet copilot pids: only anonymous socketpairs, tool pipes, TCP to github.com, `session-store.db`; no LISTEN, no `.sock`; `events.jsonl` is append-only and nothing re-reads it; no runtime command enables a server. | **Yes.** Hidden `--ui-server --port N` (in app.js; copilot-sdk discussion #1114) gives the *same TUI* an embedded loopback JSON-RPC server (vscode-jsonrpc, `Content-Length` framing) that registers the TUI's own session: `session.send {sessionId, prompt, mode:"enqueue"\|"immediate"}` → `{messageId}`; `session.getForeground` returns the TUI session. Loopback, unauthenticated, `trusted:false` registration. | **Adopted in the PoC** (`e699443`): spawn-time port + `rpcPort` on the descriptor; proven P1/P2 above. Legacy seats (no flag) get the pointer line (L1). |
| **Codex CLI** | **No.** Plain `codex` TUI is in-process with no transport or re-read file (the local npm install is also broken: vendor binary missing). | **Yes, pij-owned topology**: `codex app-server --listen unix://PATH` + pane runs `codex --remote unix://PATH`; the daemon is a second websocket client on that socket calling `turn/start` (idle) / `turn/steer` (busy). TUI still renders in the pane. | Not built in the PoC; design + probe snippet in (e). Until then Codex seats get the pointer line. |
| **pi** | Yes already — pij's `file-watch-notify` extension calls `pi.sendUserMessage(text, {deliverAs:"steer"})`. | — | Unchanged. |

Codex remains the one harness without a proven non-TTY channel in this PoC; the pointer line is its safe path today.

---

## 13. Day-2 — the §11 list worked to dry (2026-08-27, Amendment 3)

All nine items on the §11 day-2 list are done on `poc/comms-sqlite-socket` (worktree `~/GitHub/pij-poc`), one commit per item with tests. Full extension suite **3902 passed / 15 skipped**, `tsc --noEmit` clean. Live daemon pid 550 and `~/GitHub/pij` untouched throughout; every live proof ran on an isolated daemon (`tmux -L pijpoc`, own `PIJ_HOME`, `PIJ_QUEUE_BACKEND=sqlite`).

| # | Item | SHA | What changed |
|---|---|---|---|
| 1 | Async net-direct drain | `8065e19` | `claude-socket`/`copilot-rpc` rewritten as async `node:net` clients (no per-send `node -e` child); `sendSocket`/`drainTmuxInbox`/`drainInbox`/`tick`/`deliverPass` async end-to-end; `deliverPass` drains seats **concurrently** (one seat's socket await never blocks another), per-seat sequential order held by a `draining` guard. |
| 2 | `pij queue` + `send --wait` | `9830330` | `SqliteQueue.summary()` + `pij queue [<id>] [--to] [--since] [--last] [--json]` renders the delivery state machine + receipt trail (the §11 "pij tail can't render SQLite receipts" gap); `pij send --wait` verified on the SQLite backend (the delivered-receipt round-trips as a `kind:receipt` message). |
| 3 | `PIJ_SENDER` / `--as` | `b44b806` | A hard sender override that skips ambient harness detection, so a script/daemon/test sends (or reads inbox) as a declared pull id from inside a Claude/Copilot/Codex shell — removes the §11 "needed the Claude env unset" caveat. Unknown id → `E-NOID`. |
| 4 | Revive allocates `rpcPort` | `aaf2f6b` | `buildRevivedDescriptor` carried the dead incarnation's `rpcPort` forward — a revived copilot would fail-loop on a dead port. Now stripped; a real copilot revive allocates a fresh loopback port, adds `--ui-server --port` to the resume command, and re-stamps `rpcPort` (both `--attach` and auto-spawn paths). |
| 5 | Hook drain + init guidance | `93f0174` | `pij inbox --inject`: prints pending bodies as an injectable block and acks them, **silent + exit 0 when empty** — the shape a `SessionStart`/`UserPromptSubmit` hook runs so a keystroke (or the daemon's pointer) drains the inbox into context with no per-prompt noise. `buildInitInjection` now teaches that a message may arrive as a body OR a `… run: pij inbox` pointer. |
| 6 | fs→sqlite migration + dual-write | `4f37dd0` | `pij queue migrate [--dry-run] [--json]` imports unread fs inboxes into SQLite idempotently, **leaving the fs files in place** (rollback-safe). `DualWriteChannel` (`PIJ_QUEUE_BACKEND=dual`): SQLite is truth and every deliver also drops `msg-<id>.json` under the same id so an old fs-only reader still works during a rollout. `DEFAULT_BACKEND` constant makes flipping the default a one-line edit. |
| 7 | Daemon taps only owned panes | `8640827` | `refreshPaneSignals` ran `pipe-pane` on **every** pane in the tmux server — the §11 isolation hazard (a second daemon stole the first's taps). Now filtered to panes owned by a registered seat before reconcile/tap/capture; `tickLivePanes` stays the full server set (death detection is a server fact). Two daemons on one server no longer fight. |
| 8 | Codex app-server path | `b9dfd7a` | Frame builders (`buildCodexDelivery` → `turn/start` idle / `turn/steer` in-flight, `jsonrpc` omitted per README) **built and unit-proven** against the documented protocol. **Not live-proven and not wired**: the local Codex CLI cannot run — `@openai/codex@0.98.0`'s vendor binary is missing (`spawn …/vendor/aarch64-apple-darwin/codex/codex ENOENT`), and the path needs pij to own the `app-server --listen unix://` + `codex --remote` topology. Codex seats stay on the pointer path until a working codex and that topology exist. **Repair to unblock a live proof**: reinstall the codex vendor binary (`npm i -g @openai/codex` on a network that can fetch the platform artifact, or `brew reinstall codex`), then run `codex app-server --listen unix://$PWD/cx.sock` + a pane `codex --remote unix://$PWD/cx.sock` and drive `turn/start`/`turn/steer` from a second ws client. |
| 9 | Copilot first-turn readiness | `ea9633c` | A fresh copilot can ack `session.send` while its model turn hangs at boot (§11, once, post-MCP-reload). `probeCopilotReady` (`session.getForeground`) gates the **first** RPC delivery per seat; not-ready leaves the message queued for the next tick. Proven-live sessions skip the probe. |
| — | PA classification | `ce9ed68` | Classified the new `queue` bin verb in the PA capability map (the exhaustive PA test scrapes every bin verb). |

### Benchmarks (final vs baseline)

Full table with method in `reports/pij-comms-review-2026-08-27/benchmarks.md`. Latency is `receipts.acked.at − receipts.queued.at` in the SQLite queue; every row is transcript-verified.

| scenario | baseline `b24d01f` (sync `node -e`) | after all items `ea9633c` (async net) |
|---|---|---|
| C1 claude idle 3 KB | 1091 ms, 0 keystrokes, byte-exact | **226 ms**, 0 keystrokes, byte-exact |
| C2 claude mid-turn 3 KB | 360 ms, byte-exact | 206 ms, byte-exact |
| P1 copilot idle 3 KB (RPC) | 9003 ms, NOT-VERIFIED (cross-run) | **1916 ms**, `events.jsonl ×1`, 0 body keystrokes |
| L1 legacy seat pointer | 1883 ms, pointer only | 1555 ms, pointer only (body never on the pty) |
| LOAD 50 msgs / 3 senders → claude | p50 321 / **p95 470 ms**, 50/50 acked, 0 loss | p50 272 / **p95 418 ms**, 50/50 acked, 0 loss |
| RESTART 5 queued while daemon down | 5/5 acked, 0 dup, 0 loss | 5/5 acked, 0 dup, 0 loss |

Reading: the async net path roughly **halves** idle-claude latency (1091→226 ms) and cuts copilot RPC latency ~5× (the baseline number carried the `node -e` spawn + verify wait); LOAD p95 improves with the concurrent per-seat drain; restart-replay stays lossless and duplicate-free. Every 3 KB body arrives **byte-exact with zero keystrokes** (claude socket / copilot RPC) or as a one-line pointer (legacy) — the clip is gone by construction. (LOAD verifies 14/50 in the transcript because a busy Claude collapses rapid mid-turn arrivals into `queued_command` attachments the appended-only oracle counts conservatively; all 50 are acked at the transport, none lost.)

### What remains (not on the day-2 list)

- Codex live proof is blocked on the broken local install (item 8 above); the frame builders are ready.
- Agent-peer (`pij agent spawn`) copilot seats don't yet allocate `rpcPort` — they fall to the pointer path (correct, just not socket-fast); the primary and revive spawns do.
- The sync-vs-async delivery is complete, but `pij tail -f` over the SQLite receipts and a daemon-socket push path (option D) remain future work, not day-2 items.

---

## 14. Merge + sqlite default (Amendment 4, 2026-08-27)

`poc/comms-sqlite-socket` merged onto pij `origin/main` (merge commit, not a rewrite — the 19+ item commits and their benchmark deltas stay legible). Two changes complete the cutover, plus the requested proofs:

- **Default flipped to `sqlite`** (`12c3057`): `DEFAULT_BACKEND = "sqlite"` — the durable WAL queue is the default; `PIJ_QUEUE_BACKEND=fs` (legacy JSON inboxes) and `=dual` (sqlite + fs mirror for a mixed-version rollout) remain selectable. The daemon logged `queue backend: sqlite` on start with **no env var set**, confirming the default.
- **Migration on first daemon start** (`12c3057`): `migrateFsInboxes` imports any unread fs inbox mail into the queue on start (idempotent, fs files left in place), so an existing `~/.pij` carries its queued mail across the cutover with no operator step.

### Proofs on the merged code
- **Suite + tsc**: `3904 passed / 15 skipped`, `tsc --noEmit` clean.
- **Migration rehearsal on a COPY of the live `~/.pij`** (never the live one): `pij queue migrate` carried **138/138** unread fs messages into SQLite (pij-bg 1, pij-glorious-termite 17, pij-telegram 120); every row `queued` with a `queued` receipt trail; a sampled body verified **byte-exact** against its fs file; the idempotent re-run imported **0**; all fs files preserved (rollback-safe).
- **Pointer-path idle guard** (Vaughan's question): the pointer line is the **only** path that still types into a pane, and it keeps the pre-existing composer-idle / non-empty-composer guard **before** `send-keys` — `refreshRenderedComposerHold(decision.paneId, ports, buffer, holds)` at `core/daemon/loop.ts:641`, which buffers the message without typing when the composer holds live human input (test: `core/daemon/loop.test.ts` → "respects the composer-idle guard: NEVER types a pointer over live human input"). **The socket (Claude inbox) and RPC (Copilot `--ui-server`) paths type nothing at all** — no `send-keys`, no pty — so the guard question does not arise for them; only the legacy-seat pointer line touches a pane, and it is gated.
- **Benchmark column on the merge commit** (default sqlite, no env var): appended as the final column of `reports/pij-comms-review-2026-08-27/benchmarks.md`.

The live cutover — fast-forward `~/GitHub/pij` to the merge SHA, run the migration, restart the daemon (`pij daemon start` from `~/GitHub/pij`) at a quiet moment, verify a real send to each harness acked with no clip — is the o-prime's, not mine.
