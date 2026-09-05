# Plan 136 — live proof

Two worlds, recorded by the PM (`pij-fellow-whale`).
**World B = main** (`46c9314c`, the live `pij-rs` daemon, unmodified) — captured
FIRST so the post-fix proofs discriminate by content, not by hope.
**World A = the composed branch** — recorded after composition.

Synthetic keystrokes: every "typing" below is `tmux send-keys` into the seat's
composer, ruled acceptable engineering evidence by prime 2026-09-05 (for omp the
sensor is `editor.onChange` and send-keys are real pty keystrokes; for Claude it
is pane-signal recency, same). AC1's CLOSING receipt is a run where Jordan
physically types, requested through prime once the composed daemon is live.

---

## Control B1 — omp: an injected message DESTROYS a live draft (AC1/AC2 control)

Seat `pij-secret-bat` (omp, GPT-6 Astra 1M), pane `%3492`, live rs daemon.

```text
t0 last keystroke   = 1788564824014   (tmux send-keys, no Enter)
send_at             = 1788564829195   (t0 + 5.18 s)
```

Composer 1 s after typing — the draft is unmistakably present:

```text
──────────────────────────────────────────────────────────────────────
❯ DRAFT2-CONTROL-136 still typing no enter pressed
──────────────────────────────────────────────────────────────────────
 ◫ 2.8%/1M ⟲ · rs·pij-secret-bat · ⬢ GPT-6 Astra (1M) · ◔ low
```

Recipient-side spine rows (`~/.pij-rs/pij.sqlite`, `spine_events`):

```json
{"seq":6793,"at":1788564830115,"kind":"message.pushed","seat":"pij-secret-bat","payload":{"msg_id":"be628ea444377096-0000000000000020","from":"pij-fellow-whale","body":"CONTROL-136-B2: second world-B control"}}
{"seq":6794,"at":1788564830115,"kind":"delivery.outcome","seat":"pij-secret-bat","payload":{"msg_id":"be628ea444377096-0000000000000020","outcome":{"outcome":"queued","reason":"extension-stream","next_retry_at":0},"transport":"claude-uds"}}
{"seq":6795,"at":1788564830123,"kind":"delivery.inbox-ack","seat":"pij-secret-bat","payload":{"job_id":1308,"authenticated_machine":"local","evidence_grade":"machine","outcome":"reader-read"}}
```

Composer 2 s after the send — the draft is GONE and the seat is working:

```text
  ⎋ Working…
──────────────────────────────────────────────────────────────────────
❯
──────────────────────────────────────────────────────────────────────
```

**World B verdict**: pushed at t0+6.1 s, acked 8 ms later, no hold of any kind,
and the human's unsubmitted text was destroyed. Hold must be observed in world A
and is absent here — the proofs discriminate.

## Control B2 — Claude: a PARKED draft blocks delivery indefinitely (AC6 control)

Seat `pij-dear-primate` (claude, Sonnet 5), pane `%3494`, live rs daemon.
This is plan 134's AC7 pathology reproduced on demand.

```text
t0 last keystroke   = 1788564949030
send_at             = 1788565033845   (t0 + 84.8 s — no keystroke for well over one grace)
```

Recipient-side spine rows at the send:

```json
{"seq":6879,"at":1788565034400,"kind":"message.pushed","payload":{"msg_id":"be628ea444377096-000000000000002e","from":"pij-fellow-whale","body":"CONTROL-136-B3: claude world-B control, parked draft"}}
{"seq":6880,"at":1788565034400,"kind":"delivery.outcome","payload":{"msg_id":"be628ea444377096-000000000000002e","outcome":{"outcome":"queued","reason":"human-typing","next_retry_at":0,"draft_sha":"da2e4319578b"},"transport":"claude-uds"}}
```

Re-read 200 s later (`at 1788565233628`): **the same two rows, nothing else** —
no delivery, no further attempt — and the composer still holds the untouched
draft:

```text
❯ DRAFT-CLAUDE-CONTROL-136 parked draft never submitted
```

**World B verdict**: `human-typing` is asserted about a keyboard nobody has
touched for four minutes. The word survives into world A; its derivation must
change to keystroke recency (u3).

## r3 retired by inspection — no consumer expects `delivered` for extension-stream

Risk r3 feared that making the extension-stream receipt honest would break a
consumer relying on `delivered`. It cannot: the receipt is ALREADY
queued-until-ack on main, and nothing reads it.

```text
$ grep -rn "extension-stream" crates/ .pi/extensions/pij --include=*.rs --include=*.ts
crates/daemon/src/delivery/mod.rs:398:                                    Some("extension-stream")
crates/daemon/src/delivery/mod.rs:1132:            assert_eq!(receipt.outcome, queued_outcome("extension-stream", 0));
```

Two hits: the producer and its own test. Control B1 seq 6794/6795 shows the
live behaviour (queued → inbox-ack → reader-read). Prime ruled on this evidence
that u2 ships a regression guard only and never edits `delivery/mod.rs`; AC3 was
amended accordingly.

---

## World A — the composed branch, live

Daemon: main's binary after 136 merged (`be778b9c`), pid 64312. Route existence
verified by discrimination, not by liveness: `POST /v1/hold` with a bogus job
answered `{"ok":true,"held":false,"noop":true,"reason":"absent"}` — the typed
no-op — while an unknown route on the same daemon answered `404`.

### AC1 — held while typing, delivered within one grace of the last edit (PASS)

Seat `pij-selective-blackbird` (omp), composed worktree binary pid 95718.

```text
t0 last keystroke = 1788573861190     (tmux send-keys, no Enter)
send_at           = 1788573866284     (t0 + 5.09 s)
```

```json
{"seq":9306,"at":1788573866919,"kind":"message.pushed","payload":{"msg_id":"cb2bdaa7f270335f-0000000000000004","body":"AC1-136: this must be HELD, not injected"}}
{"seq":9307,"at":1788573866919,"kind":"delivery.outcome","payload":{"outcome":{"outcome":"queued","reason":"extension-stream","next_retry_at":0}}}
{"seq":9308,"at":1788573866924,"kind":"delivery.held","payload":{"msg_id":"cb2bdaa7f270335f-0000000000000004","reason":"human-typing","seat":"pij-selective-blackbird","since_ms":1788573861113}}
{"seq":9326,"at":1788573921906,"kind":"delivery.released","payload":{"at_ms":1788573921905,"msg_id":"cb2bdaa7f270335f-0000000000000004"}}
{"seq":9328,"at":1788573921915,"kind":"delivery.inbox-ack","payload":{"job_id":1995,"outcome":"reader-read"}}
```

Held at t0+5.7 s, nothing injected, no ack. Released and delivered at
**t0+60.7 s** — inside the ±3 s the AC allows. Control B1 on the same rig
injected at t0+6.1 s and destroyed the draft.

### AC2 — a parked draft no longer blocks (PASS)

Seat `pij-glorious-bobolink` (omp). Draft typed, then left alone for 68 s:

```text
> AC2-DRAFT-136 parked and never submitted
t_last_edit = 1788574460497 · send_at = 1788574528604 (t + 68.1 s)
```

```json
{"seq":9517,"at":1788574529194,"kind":"message.pushed"}
{"seq":9519,"at":1788574529199,"kind":"delivery.released"}
{"seq":9520,"at":1788574529203,"kind":"delivery.inbox-ack","payload":{"outcome":"reader-read"}}
```

Delivered 590 ms after the send with a non-empty composer — no hold. The
discriminating fact against world B is not delivery (world B delivered too) but
WHEN: world B delivered while the human was mid-sentence; world A delivers only
because the keyboard has been quiet for longer than the grace.

### AC3 — the hold is visible from both ends (PASS)

Recipient status line, captured while held:

```text
⏸ 1 held · typing
```

Sender side, `pij-rs state pij-glorious-bobolink --json` while three were held:

```json
"held":[{"msg_id":"804532273e40de32-000000000000000a","reason":"human-typing","since_ms":1788574111216},
        {"msg_id":"804532273e40de32-000000000000000d","reason":"human-typing","since_ms":1788574125285},
        {"msg_id":"804532273e40de32-000000000000000e","reason":"human-typing","since_ms":1788574125285}]
```

The receipt clause of AC3 was amended before implementation: the extension-stream
push receipt was ALREADY `queued/extension-stream` until the ack on main, so u2
shipped a regression guard rather than a behaviour change (see the r3 note above).

### AC4 — control-command bypass: UNCHECKED, and the reason is structural

Unit-proven on both sides; **structurally unreachable in production**, so it is
recorded unchecked rather than ticked on tests that exercise a path no live
message can take:

1. the rs CLI refuses the command form by design — *"rs cannot serve `pij send
   <id> --command <name>`: a control command is a different act from a message —
   it carries no body and is submitted to the pane as a slash command. It is
   deliberately left on legacy"*;
2. `Msg` in `crates/core/src/model.rs` has **no `urgent` field** (the only hits
   are in TypeScript);
3. `/v1/send` hardcodes `command: None` when it builds the `Msg`
   (`crates/daemon/src/http/mod.rs:1237`).

So `rust-runtime.ts:401` — `claim.message.command !== undefined ||
claim.message.urgent === true` — is a correct guard whose production call site
never supplies its inputs. **Practical consequence: today a compact/new/reload
aimed at a typing omp seat waits up to one grace like any other message.** Prime
ruled a follow-up plan (optional bypass marker on `Msg`, threaded through
`/v1/send` and the CLI) after 136 closes.

### AC5 — nothing lost: held means unacked (PASS)

Three rows held on `pij-glorious-bobolink`, then `kill -9` on the omp process
(pid 9999). The durable rows survived, unclaimed and unacked:

```json
{"id":2024,"state":"pending","attempt":0}
{"id":2026,"state":"pending","attempt":0}
{"id":2027,"state":"pending","attempt":0}
```

A new process re-registered as the same seat. Delivery order, from the recipient
itself:

```text
Received in order: AC1B-136: held on main's binary; AC5-136-FIRST; AC5-136-SECOND.
```

```json
{"id":2024,"state":"done","acked_at":1788574286}
{"id":2026,"state":"done","acked_at":1788574286}
{"id":2027,"state":"done","acked_at":1788574286}
```

Ordering here is not luck: u2 proved `Queue::claim` orders only ELIGIBLE rows, so
an older row re-held to a later deadline would lose its place, and u1's witness
reproduced exactly that inversion (`[newer, older]`) before the session_start
recovery loop was added.

### AC6 — Claude seats: recency, not draft presence (PASS)

Seat `pij-dear-primate` (claude, Sonnet 5), socket resolvable
(`/tmp/cc-socks/76368.sock`, pid matches the seat row).

(a) The draft parked since ~09:35 — hours, not seconds:

```json
{"seq":9484,"at":1788574411569,"kind":"delivery.outcome",
 "payload":{"outcome":{"outcome":"delivered","origin":"injected-to-transport"},"transport":"claude-uds"}}
```

Delivered, **with the draft still sitting untouched in the composer**. World B
refused the identical scenario for 200+ s (control B2). Plan 134's AC7 pathology
is retired.

(b) An edit 5 s before the send:

```json
{"seq":9489,"at":1788574429872,"kind":"delivery.outcome",
 "payload":{"outcome":{"outcome":"queued","reason":"human-typing","next_retry_at":0,"draft_sha":"825fdcf649aa"}}}
```

Deferred, as required. Caveat recorded honestly: `next_retry_at` is 0 rather than
`last_edit + grace`. It satisfies the AC's "<= grace" literally, but the bounded
value would have to be threaded through `crates/daemon/src/delivery/mod.rs`,
which plan 137 owns and 136 never touched.

### Defect found by this proof and fixed before review

The AC1 run produced **two** `delivery.released` rows for one message (seq 9326
and 9327, 5 ms apart) and four during recovery: the pre-claim un-deferral and the
pre-ack guarantee each declared. Harmless to delivery, but a ledger that records
one fact twice cannot answer "how many holds happened today". u1 asserted exactly
one released row per `msg_id` (RED: expected 1, got 2), then gave the declaration
a single owner sharing a per-job receipt between both callers.

### Instrument caveat (AC6 wording amended for it)

The Claude-side gate samples composer content at the pane observer's 600 ms
interval; it cannot see keystrokes. "Keystroke recency" is therefore **observed
edit recency**, and a keypress that changes nothing observable never refreshes
the grace. AC6's text was narrowed to say so rather than crediting the code with
a measurement it does not make.
