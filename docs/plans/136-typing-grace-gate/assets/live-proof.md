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

## World A — composed branch

_Recorded after composition (AC1–AC6)._
