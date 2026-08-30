# Review round 2 — `16309f2e` · **FIX_REQUIRED** (gate red, one path open)

Reviewer `pij-favourite-araminta`. Head: **`16309f2e`** (coder's pushed head).
Follows [round 1](./review-sidecars-round-1.md),
[1a](./review-sidecars-round-1a.md), [1b](./review-sidecars-round-1b.md).

Every result re-run by me, cold, in a fresh `CARGO_TARGET_DIR`
(`/tmp/araminta-gate-16309f2e` for the gate). Review worktree clean throughout.

## Verified FIXED

### F3 — the offset no longer confirms an undelivered update

The finding that was ruled fix-first. Probed with the repaired instrument
(see § *Instrument correction*):

```
PROBE pass 1 is_err = true
PROBE offsets requested = ["0", "0"]              ← cursor NOT advanced
PROBE spine event = telegram.inbound-delivery-failed / {"conversation":"42",
        "reason":"test/refuse: injected turn-enqueue failure","update_id":77}
PROBE VERDICT: update 77 was LEFT UNCONFIRMED — recoverable
```

Previously `["0","78"]` with nothing recorded. Both halves are closed: the
message survives, **and** the loss is now a spine fact rather than silence
(E-023). Two `inbound-delivery-failed` events across two passes, which is correct
— it re-surfaces rather than vanishing.

### F1 / F12 / F9 — on the shipped surface

Real `pij-rs` binary, real daemon, not a harness:

| finding | evidence |
|---|---|
| F12 producer envelope | `pij sidecar: ok — {"job_id":1,"serial_key":"j1"}` |
| F9 duplicate-retry wedge | after the same duplicate `bg-start`: `j2.json` exists, `done`, and completion turns delivered |
| F1 non-zero exit | `background job `b1` failed (exit 3)` — status `failed`, `exit_code 3` |
| F1 success | `background job `b5` finished (exit 0)` |

### The lingering-grandchild shape

My round-1b deterministic witness, re-run 3/3: `Failed, exit_code = Some(3)`.
Closed.

## Still OPEN — the gate is red at this head

```
background_reports_failed_and_lost_without_starving_other_completions
sidecars.rs:779   assertion left == right failed   left: Lost   right: Failed
test result: FAILED. 8 passed; 1 failed.
pij-gate: 1 stage(s) failed — test. The task is not done.
```

The coder's new `direct_child_failure_survives_a_lingering_grandchild` **passes**;
the original test **still fails**. Those two facts belong together:

> **The fix closed the shape my reproduction described, and the defect lives on a
> different one.**

That is E-031 in its own words — *"I keep fixing the path the FINDING described,
not the path the DEFECT lives on"* — and this instance is half mine, because the
misleading reproduction was the one I supplied.

### Where the surviving path is, located from the shipped daemon

| scenario | result |
|---|---|
| one failing job, fresh daemon, nothing else in flight | `failed`, `exit 3` — **correct** |
| same command started **alongside other in-flight jobs** | `lost`, `exit None` — **wrong** |

Observed in a single daemon run: `boom.json = lost/None` while `linger.json =
failed/3` and `b1..b3 = failed/3`. So it is **not** the grandchild, and **not**
first-observation — a lone job on a fresh daemon classifies correctly. The
condition is **multiple records in one `observe_completions` pass**, which is
exactly what the still-failing test sets up and what my `boom` run reproduced by
accident.

**Suggested witness shape:** start several jobs together and assert each terminal
status independently. A single-job witness cannot distinguish *"the classifier is
right"* from *"the classifier is right when it has only one record to look at"*.

## Instrument correction — the fourth of this review

My first F3 re-run (at `26bf238e`) reported `offsets requested = ["0","78"]` and
I was one step from filing F3 as **unfixed**. It was fixed; my probe had stopped
firing.

`enqueue_turn` now routes through **`enqueue_delivery`**, and my fake refused only
**`enqueue`**. The injected failure never happened, the delivery genuinely
succeeded, and a correct cursor advance to 78 looked identical to the original
defect. A fake that silently stops injecting reports the bug it was built to
detect.

Repaired the fake first, re-ran, and the numbers above are from the repaired run.
Same family as the other three this review: a zombie row read as a survivor, a
`tail`-truncated log read as a test count, `head`'s exit status read as the
command's. **In all four the instrument was wrong in the direction of the story I
already believed** — which is the only direction that matters.

## Standing

* `16309f2e` is **not** shippable: one gate stage red.
* The Telegram window stays unspent. F3 being closed is a precondition for it,
  not a clearance.
* Round-1 F6 (cancel signals a durable-record pgid with no ownership interlock),
  F8 (duplicate send on a failed binding append — the coder's
  `successful_send_with_failed_binding_is_terminal_and_never_posts_twice` looks
  aimed at this; not yet verified by me) and F10 (caller-controlled outbound
  `chat_id`) remain open and unchanged.
