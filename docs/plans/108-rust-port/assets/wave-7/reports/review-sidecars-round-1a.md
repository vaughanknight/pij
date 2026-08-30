# Review round 1a — u-sidecars producer surface · **DO NOT RUN THE LIVE-FIRE YET**

Reviewer `pij-favourite-araminta`. Head: **`67050dcb`** (cutover composed).
Addendum to [`review-sidecars-round-1.md`](./review-sidecars-round-1.md); the
round-1 verdict of **FIX_REQUIRED** stands and gains two findings.

Everything below was run against the **shipped binary and a real daemon**, not a
test harness. Tree clean throughout; probe daemons stopped and state removed.

## Headline

**The live-fire cannot succeed at this head, and the natural human response to
its failure destroys the surface being proved.** Two defects compose:

1. the shipped producer reports **`FAILED`, exit 1, for operations that fully
   succeed**; and
2. the retry that false failure invites **permanently wedges the entire bg
   runner** — no completion is ever delivered again, and no new job ever starts.

If Jordan's window opens against this head, it burns the window and leaves the
runner dead. Both fixes are small.

## F12 — the producer reports FAILED for work that landed · HIGH

`POST /v1/sidecar` is the only handler in the router that returns a **bare JSON
body** instead of an `Envelope` (`daemon/src/http/mod.rs:992`):

```rust
(StatusCode::ACCEPTED, Json(serde_json::json!({ "serial_key": .., "job_id": .. })))
```

Every other route returns `envelope(StatusCode::OK, &Envelope::ok("pij <verb>", ..))`
— seven of them, at `:408 :574 :586 :614 :654 :715 :762`. The route's **own error
paths** (`refused`, `internal`) do return envelopes, so the seam is split down
the middle of one handler.

The client declares the other half of the contract:

```rust
pub async fn sidecar(&self, request: &Value) -> Envelope<Value>   // cli/src/client.rs:140
```

`Envelope<T>` requires `ok`, `command`, `v`, none of them `#[serde(default)]`
(`core/src/model.rs:409-426`), so the success body cannot decode.

**Observed on the shipped surface** — real `pij-rs` binary, real daemon at
`127.0.0.1:7494`, state dir `/tmp/araminta-live-2`, head `67050dcb`:

```
$ pij-rs sidecar chore-add --name disk --probe "echo probe-value-1" --target pij-test
pij sidecar: FAILED — line 1: JSON is not a envelope (missing field `ok`)
EXIT: 1

$ pij-rs sidecar bg-start --id j1 --title live --command "echo hello" --target pij-test
pij sidecar: FAILED — line 1: JSON is not a envelope (missing field `ok`)
EXIT: 1
```

**But the effect landed.** The daemon's own store, one second later:

```
id  kind               serial_key  dedupe
1   sidecar:chore      disk        18d0b8758d897070
2   delivery:pij-test  pij-test    chore-disk-defined-1788131…
```

Row 1 is the enqueued chore; row 2 is the consumer's turn. The work succeeded
end to end and the operator was told it failed.

This is **command-success-is-not-effect inverted** — the plan's own class, running
the other way. Every earlier instance was a confident success over an effect that
never happened; this is a confident failure over an effect that did. Both come
from a report that is not derived from the thing it describes.

**Why no instrument caught it:** `grep '\.sidecar('` across `crates/` returns the
declaration and **nothing else**. No test drives the client method against the
route. The server's success shape and the client's declared return type are two
asserted facts with no instrument between them — wave-6 COMMON rule 10, verbatim,
which is the rule that exists because we shipped an instruction naming a verb
that did not exist.

**Fix:** return `envelope(StatusCode::ACCEPTED, &Envelope::ok("pij sidecar", ..))`,
and add the test that drives `client.sidecar()` against the real router — the
missing instrument, not just the missing envelope.

**A correction I made to my own evidence.** My first measurement reported
`EXIT: 0`, because I had piped the command into `head` and read *`head`'s* status.
The real exit is **1**. Same shape as my `tail -12` error earlier in this review:
the verdict survived my instrument and the thing that justified it did not.

## F9 — one retried `bg-start` permanently wedges the runner · HIGH

`background::job` sets `dedupe_key` from the **producer's nanosecond clock**
(`http/mod.rs:952-957` → `background.rs:62`), so a client retry is a *different*
key and the queue cannot collapse it. The second row then hits
`start_command`'s existing-record refusal (`background.rs:173`), and `run_once`
handles the error by `retry(queue_id, Duration::ZERO)` **and returning early**
(`:155-158`) — before `observe_completions()` at `:162`.

So the row is re-claimable immediately, fails identically, and starves the only
code path that reports completions.

**Observed live, at `67050dcb`, driving the real CLI** — the operator sees F12's
false `FAILED` and retries once:

```
id  kind               serial_key  state    attempt
1   sidecar:chore      disk        done     0
2   delivery:pij-test  pij-test    pending  0
3   sidecar:bg         j1          done     0
4   delivery:pij-test  pij-test    pending  0
5   sidecar:bg         j1          pending  20      ← the duplicate, spinning
```

`attempt 20` in roughly two seconds. Then a third, entirely innocent job:

```
$ pij-rs sidecar bg-start --id j2 --title bystander --command "echo bystander" …
$ ls /tmp/araminta-live-2/**/  →  j1.json  j1.log        # j2 has NO record
completion turns delivered to pij-test: 2                # both predate the wedge
```

**`j2` never started.** This is not degraded completion reporting — the bg
sidecar is dead: no new job is spawned, no completion is delivered, and the only
symptom is a line on stderr per tick.

Isolated in a unit probe first (`58 passes, 58 failures`, `job-a` stuck
`Running`, `job-b` never created, `0` completion turns), then reproduced through
the shipped binary above.

The loop *survives*, which is why the E-030 test stays green: the wrapper is
resilient exactly as designed, and the work it does forever is fail. **E-030's
lesson was that the loop needs a test; this is its sequel — a loop that survives
is not the same as a consumer that progresses.**

**Fix, any one of which breaks the chain:** run `observe_completions()` before
the early return (or on a path that cannot be starved); use a caller-supplied
idempotency key so a retry collapses, as `/v1/send` already does with `msg_id`;
give a permanently-failing row a terminal outcome instead of `Duration::ZERO`.
A duplicate `Start` for an existing id is arguably not an error at all.

## F10 — outbound Telegram destination is caller-controlled · MED

`sidecar()` binds the authenticated machine and **discards it**
(`Extension(_authenticated)`, `:948`), and `TelegramSend.chat_id` is an
unconstrained caller value defaulting to config (`telegram.rs:282`). Any holder
of the bearer key can make the daemon send arbitrary text to an **arbitrary
Telegram chat** using Jordan's bot token. The inbound path has an allowlist
(`allowed_user_ids`, `:346`); the outbound path has no equivalent constraint on
destination, and the legacy bridge never exposed outbound over HTTP at all.

Related to E-034 ("the bearer key authenticates a MACHINE, not a seat"), but not
the same: that limitation is documented and graded for *seat* attribution. This
adds a new **egress** capability to a third-party service. Worth a ruling rather
than a silent inheritance — the honest minimum is to refuse a `chat_id` that is
not the configured one.

## Standing

Round-1 findings F1–F8 are unchanged and unfixed at this head. F3 (offset
advanced before enqueue) remains the ruling fix-first defect. F12 and F9 are new
and both sit **in front of** the live-fire.

Recommended order, so the window is not spent twice:

1. **F12** — one line plus its missing test. Without it every live-fire command
   reports failure.
2. **F9** — without it the retry F12 invites kills the runner mid-proof.
3. **F3** — without it the reply leg can lose Jordan's message and record nothing.
4. Then run the live-fire.

Gate at `67050dcb`, run by me, cold target dir: **all six stages green, 52
binaries, 350 passed, 0 failed** (passed excluding ignored, the convention the PM
ratified). The gate being green while the shipped producer cannot complete a
single successful call is itself the argument for F12's missing instrument.
