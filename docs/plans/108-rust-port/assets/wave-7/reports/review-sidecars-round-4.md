# Round 4 — live-fire verified, and two things found while verifying it

`pij-favourite-araminta`, 2026-08-30T23:44Z. Verifies F7 against
[the pre-window baseline](./review-sidecars-prewindow-baseline.md) — which I am
**withdrawing** below, for cause.

## 1. The reply leg PASSES — both halves

Read from the pij-rs store, not from a transcript.

```
spine seq 10  telegram.binding  seat pij-telegram-chat-8843192841  target pij-sidecars-live
spine seq 11  telegram.cursor   {"offset":459814437}
queue row 21  delivery:pij-sidecars-live  state done
              {"from":"pij-telegram","to":"pij-sidecars-live","body":"hi",
               "msg_id":"telegram-459814436"}
```

Jordan's reply — `"hi"` — routed through the **Rust** bridge as an injected turn.
The ordering is the fixed one: the turn is delivered, **then** the cursor advances
`459814436 → 459814437`. That is F3's fix visible in production data rather than
in a probe.

**Half two**, with the corrected instrument: a scan of **every** legacy seat inbox
(`~/.pij/*/inbox/*.json`) for that reply body and message id returned **zero
matches**. The legacy path did not serve it.

F7's reply leg is satisfied.

## 2. LIVE — the relay is not restored, and the daemon holds Jordan's poll

Measured, not inferred:

```
~/.pij/pij-telegram.lock  {"pid":88010,"startedAtMs":1788133443986}
pid 88010                 target/debug/pij-rs --state-dir ~/.pij-rs daemon --bind 127.0…
                          started 09:44:02
~/.pij/pij-telegram.json  DELETED
pij state pij-telegram    E-NOID: no session 'pij-telegram' in registry
legacy bridge process     none running
```

**The Rust daemon is holding Jordan's production Telegram long-poll**, and the
legacy relay is neither running nor registered. The protocol required restore with
re-acquisition verified; the seat is gone from the registry and the poll did not
go back.

This is an operational state, not a code finding: either restore the legacy bridge
and its descriptor, or rule deliberately that pij-rs now owns that channel. It is
currently neither.

## 3. The two implementations cannot see each other's locks · HIGH

```rust
// crates/sidecars/src/telegram.rs:139
let body = serde_json::json!({"pid": pid, "startedAtMs": now_ms()?});
```

```ts
// .pi/extensions/pij/telegram/lockfile.ts:39-43
return typeof v.pid === "number" && typeof v.startedAt === "string"
    ? { pid: v.pid, startedAt: v.startedAt }
    : null;
```

`startedAtMs` is a **number** under a **different key**, so legacy `parseLock`
returns `null` — and its own doc comment says `null` means *"absent/corrupt
(treated as reclaimable)"*. `acquireLock` then `rmSync`s the lock and retries the
exclusive create.

**So starting the legacy bridge while pij-rs holds the poll does not refuse. It
deletes the lock and takes it.** Two consumers on one bot is the 409 the lock
exists to prevent, and each then steals updates from the other — the exact failure
my P5 falsifier was registered against, arriving from the opposite direction.

Direction test, in this repo's terms: removing the legacy reclaim makes it
*refuse* instead of *steal*, so that reclaim **decides the outcome — it is a
policy**, and it is inheriting a wrong input. *"Cannot parse"* is being read as
*"nobody holds it"*: absent is not empty (E-004, COMMON 1.5), in the one place
where the consequence is Jordan's messages going to whichever process wins a race.

Cheapest honest fix: have the Rust bridge write `startedAt` as an ISO string —
the schema legacy already parses — and keep `startedAtMs` alongside it if it wants
the numeric form. A shared lock file is a wire contract between two
implementations, and it has no instrument comparing its two writers.

## 4. My pre-window baseline was worthless — withdrawn

I captured it at **23:40:58Z** and called it *pre-window*. Spine seq 11 shows the
reply landed at **23:40:03Z**. The window was already over: my "before" numbers
(spine 11, inbox 917) **already contained the result**.

Had I verified the way I designed it — *"the reply must be a new row above 11"* —
the answer would have been *"the spine did not grow"*, and I would have failed the
coder for a leg that passed. **Fifth instrument error of this review, and the
first that would have produced a false negative against someone else.** What saved
it was reading the spine rows' *content* rather than trusting my own count.

Also withdrawn: half two of my falsifier named `~/.pij/pij-telegram/inbox/` as
where an inbound reply would land. That is wrong — it is the bridge's **outbound**
queue (entries are `from` a seat, `to` pij-telegram). I inspected its shape before
using it, which is the only reason I did not measure the wrong directory and call
the result proof.

The general lesson, and it is the PM's rule turned back on me: **pre-register the
claim, measure the baseline — and timestamp the baseline against the event, not
against your intention to capture it.** A baseline taken after the fact is not
merely useless; it fails in the direction of a false negative, which is the one
direction a reviewer's errors are supposed to avoid.

## Standing

* **F7 reply leg: PASS.** The bg and chore legs' receipts are still owed as files.
* **New, HIGH:** the lock-schema divergence (§3). Not in the unit's fence — it is
  a contract between the port and the code it replaces — but it is reachable today.
* **Operational:** the relay is down and deregistered (§2).
* Code verdict from [round 3](./review-sidecars-round-3.md) is unchanged:
  **APPROVE at `73c413e8`**.
