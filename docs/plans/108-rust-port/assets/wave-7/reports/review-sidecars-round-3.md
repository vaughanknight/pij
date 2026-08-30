# Review round 3 — `73c413e8` · code **APPROVE**, unit not closeable until the live-fire runs

Reviewer `pij-favourite-araminta`. Head: **`73c413e8`**.
Follows [round 1](./review-sidecars-round-1.md),
[1a](./review-sidecars-round-1a.md), [1b](./review-sidecars-round-1b.md),
[2](./review-sidecars-round-2.md).

Everything below re-run by me. Gate in a fresh `CARGO_TARGET_DIR`
(`/tmp/araminta-gate-73c413e8`); behavioural checks against the **real `pij-rs`
binary and a real daemon**, not a harness. Review worktree clean throughout;
every probe daemon stopped and its state removed.

## Gate

```
pij-gate: all stages green
binaries: 53   passed: 356   non-ok: 0
```

(passed excluding ignored, the ratified convention.)

## The classifier — verified in both directions

The round-2 finding was that the fix closed the shape my reproduction described
rather than the shape the defect lived on. The condition I localised was
**multiple records in one `observe_completions` pass**. Driven through the
shipped producer, five jobs started together, then three more rounds of four:

```
boom   failed exit=3      (this is the one that reported `lost` before)
four   failed exit=4
linger failed exit=3
slow   failed exit=5
ok1    done   exit=0
… runs 2-4: b2/b3/b4 failed 3 · f2/f3/f4 failed 4 · l2/l3/l4 failed 3 · o2/o3/o4 done 0
```

**17 jobs, 4 runs, zero `lost`.** Each asserted independently, which is the
distinction that mattered: a per-job assertion separates *"the classifier is
right"* from *"the classifier is right when it has only one record to look at"*.

### And `Lost` is still reachable — the check that mattered most

A fix phrased as *"an owned child can never classify Lost"* could close the
defect by making the state unreachable, which would silently regress F2. So I
planted a **genuine** orphan — stale `owner_id`, dead pgid, status `running`, a
log with content — and let the daemon observe it:

```
orphan.json: lost exit= None
turn: background job `orphan` lost: process exited without an owning completion
      observation
```

Correct, and honestly labelled. The discriminator does what it says: an *owned*
child with an unobserved exit is never `Lost`; a record this boot never owned
still is. Both directions hold on the shipped surface.

## Findings closed, with the evidence that closed each

| # | finding | how I verified it |
|---|---|---|
| F1 | non-zero exit reported as `finished` | shipped daemon: `failed (exit 3)`, `(exit 4)`, `(exit 5)`; `done (exit 0)` for success |
| F2 | orphan reported as `finished` | planted orphan → `lost`, with the honest label |
| F3 | failed inbound delivery confirmed the update to Telegram | repaired probe: offsets `["0","0"]`, cursor **not** advanced, two `telegram.inbound-delivery-failed` events carrying `update_id 77` and the reason |
| F4 | in-memory cursor replayed after restart | cursor is a durable spine fact (`telegram.cursor`) |
| F5 / F9 | one stuck row starved all completions; one retry wedged the runner | shipped daemon: duplicate `bg-start` retried with bounded backoff, `j2` starts, turns deliver |
| F6 | cancel signalled a durable-record pgid with no ownership interlock | planted a stale-owner record pointing at a **tree I owned**: cancel refused, my tree untouched (3 members before and after), record still `running` |
| F8 | duplicate Telegram post when the binding append failed | **mutation M4** — flipped the terminal outcome back to `Retry`; `successful_send_with_failed_binding_is_terminal_and_never_posts_twice` FAILED at `sidecars.rs:735`, then restored |
| F12 | producer reported `FAILED` for work that landed | `pij sidecar: ok — {"job_id":1,...}`, exit 0 |

On F6, worth stating in the repo's own terms: both new guards are **brakes, not
policies**. `record.owner_id != self.owner_id` and `record.pgid == self.own_pgid`
can only ever *refuse* — remove either and cancel signals strictly more, never
something different. That is the right shape for a destructive path.

## Still open

### F7 — the live-fire has still never run · BLOCKING for closing the unit

Not a code defect, and no longer blocked by one. Jordan's amendment is explicit:
*"Unit tests and fakes do not close this unit."* Three legs are owed, with
transcript and spine excerpts as files. **The code is now clear to attempt it** —
the producer returns success, the runner classifies correctly, the cursor is
durable, and a failed reply is recorded rather than lost.

The pre-registered falsifier still binds the reply leg: the injected turn must
appear as a row in the pij-rs spine **and** the legacy bridge must be provably
not the receiver for that window (lock/pid state plus no new entry in
`~/.pij/pij-telegram/inbox/`). One-way delivery is not a pass.

### F10 — outbound Telegram destination is caller-controlled · MED, needs a ruling

Unchanged at this head: `sidecar()` binds and discards the authenticated machine
(`Extension(_authenticated)`), and `TelegramSend.chat_id` remains an
unconstrained caller value (`telegram.rs:295`). Any bearer-key holder can make
the daemon send arbitrary text to an arbitrary chat with Jordan's bot token. The
inbound path has an allowlist; the outbound destination has none, and the legacy
bridge never exposed outbound over HTTP.

I am **not** holding the window for this — it is an egress-scope question for the
prime, not a correctness defect in the unit. The honest minimum is refusing a
`chat_id` that is not the configured one.

## Verdict

**Code: APPROVE at `73c413e8`.** Nine findings closed, each verified by a probe
or mutation I ran myself against the shipped surface, not by reading a commit
message.

**Unit: not closeable.** F7 is owed evidence, and that evidence is now
obtainable. F10 wants a ruling.

## Instrument errors I made in this review, all disclosed

Four, and every one pointed the same way — toward the story I already believed:

1. a probe that SIGTERMed its own process group (no `setsid`);
2. a zombie row read as a survivor, one step from filing *"SIGTERM does not kill
   the group leader"*, which is false;
3. `tail -12` and `head` truncations: a test count of `0 passed` under `all
   stages green`, and `head`'s exit status read as the command's;
4. an F3 fake that refused `enqueue()` after `enqueue_turn` moved to
   `enqueue_delivery()` — it silently stopped injecting, and a **clean pass
   looked exactly like the original defect**.

The fourth is the one worth keeping: a fake that stops firing reports the bug it
was built to detect. None reached a verdict, because the instrument was checked
before the result was believed — which is the only reason the other findings in
this review should be trusted.
