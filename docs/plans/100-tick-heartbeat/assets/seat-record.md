# Seat record — s100 `tick-heartbeat`

> Draft, written mid-stream deliberately. A record composed at teardown is composed at the
> moment the seat is most likely to be reaped, which is the failure mode the ritual exists to
> prevent. Finalised at close-out; goes to main via a docs-only PR (`s100/seat-record`), never
> a direct push — `main` is protected and refuses docs commits exactly as it refuses code.

| field | value |
|---|---|
| seat id | `pij-complex-bat` |
| harness · model | Copilot CLI · claude-opus-5 |
| worktree | `/Users/jordanknight/pi-hacking/pij-worktrees/s100-tick-heartbeat` |
| branch | `s100/tick-heartbeat` (base `a2a50e2`) |
| charter | pij#180 Fix A — `daemon.ts:286-293`, plus granted `adapters/fs-registry.ts`, imports `:13-82`, constructor `:190-199` |
| plan | `docs/plans/100-tick-heartbeat/tick-heartbeat-plan.md` |
| PR · merge sha | *(pending)* |
| ledger block | F-110 upward (F-100…F-109 spent on s092) |
| prior stream | s092 `install-blocker` → PR #177, merged `a2a50e2` |

## Corrections to things this fleet was told — read these first

Placed here rather than only in findings, per s098: someone arriving cold at a merged PR reads
the seat record **first**, and would otherwise re-derive a framing already known to be wrong.

1. **pij#180's illustration is wrong, though its mechanism is right.** The issue says *"a claude
   seat that died weeks ago is still heartbeat-written every 600ms"*. `daemonOwnsDelivery` does
   filter on harness + deliveryMode only, never lifecycle — but `list()` drops `dissolved`
   (`fs-registry.ts:148`), and **all 132 written descriptors are `lifecycle: bound`**. Zero
   terminal records in the write set. The count and the fix are unaffected; the justification
   must not be "dead seats are being written".

2. **#180's reader list is incomplete in a way that would have broken messaging.** It names
   `pij state` and `core/receipts.ts`. It omits `cli.ts:3398`, where `daemonTickStale` decides
   the **send receipt** for every claude/copilot/codex peer, and `core/archive.ts:46`, where
   `lastTickAt` is an **archive age axis**.

3. **The two fsync measurements are not in conflict.** s098's 18.1 ms and this stream's 4.86 ms
   are the same system at two points on its own feedback curve: the heartbeat is part of the
   load that makes each fsync expensive. **The fix is worth more under load than the quiet
   number suggests.**

## Hypotheses this stream DISPROVED

- **Mine, and the measurement is what killed it**: I predicted the heartbeat was holding
  hundreds of terminal records permanently hot, and that Fix A would collapse the working set
  and so also shrink #181's per-descriptor `ps` cost. **Measured: three records, a bounded ~20h
  archiving delay.** Dissolved records stop being heartbeat-written at dissolution, so what they
  carry is a *frozen* stamp, not a live one. Fix A does **not** collapse the working set, and
  anyone planning #181 on that assumption should stop.
- **Mine, caught by independent validation before implementation**: that the overlay design was
  self-contained. It is not — `publish()` reads via `read()` (`:204`) and callers spread read
  results into writes, so without a durable-write scrub the synthetic stamp is persisted back
  **from CLI processes on every send**. The fix would have relocated the fsync cost onto the
  latency-sensitive path it was measured against.
- **The prime's, corrected at source**: that six files inlined `PIJ_HOME ?? ~/.pij` (s092). It
  was **seven** — `index.ts:48` was missed to a `head -8` truncation, and it is one of the three
  files `paths.ts` names as the targets it was written to replace.

## The finding this stream exists for

**`lastTickAt` WAS ITSELF THE INCARNATION-SCOPED STATE. That is why it sits on four strip-lists.
Moving it into a map keyed by id alone deleted the only thing that made those strip-lists work.**

The field was not merely *protected by* guards — **the field WAS the mechanism, and the strip-lists
were its enforcement.** Relocating it did not lose a guard; it dissolved the property the guards
existed to maintain. Found by the coder (`pij-gorgeous-guan`) after two failed fixes.

The four sites, none of which a reader-census can see, because **knowledge encoded as a deletion is
invisible to a search for readers**:

```
core/revive.ts:667           buildRevivedDescriptor
cli.ts:2662                  stripDissolvedAdoptRuntime
core/session.ts:167          stripPriorRuntimeTermination
core/current-session.ts:189  planCurrentSessionDescriptor
```

`cli.ts` states the doctrine outright — *"fields not named here are durable by default and survive
process-incarnation revival"* — and is the file a `**/`-globbed census silently excluded, because
`**/` does not match a top-level file.

**The pre-flight for relocating any field:** not *"what READS this"* — that finds every reader and
misses the point — but **"what DELETES, REFUSES, or REWRITES this"**, because those are the sites
that keep working perfectly on data nobody stores there any more. This plan defeated two guards
that way (`publish()`'s tombstone guard, then revive's strip), and neither greps as removed, and no
test failed for either.

**The remedy is to RE-ESTABLISH the guard where the data now lives, not to rebuild an equivalent
beside it.** Dropping the stamp inside `FsRegistry.revive()` — the single funnel every reincarnation
passes through — is the rule applied. The marker protocol was the rule ignored: a parallel
mechanism built alongside the guard it had displaced, which then needed a clock, a directory, a
sweep, a horizon, a retry, and four rounds of P1s.

## Method notes worth carrying

- **A criterion that agrees with reality without being able to disagree survived into this
  stream's own plan** (AC-07 would have passed under the write-back defect), written by the seat
  that logged F-106 about that exact class the same morning. Caring about the class does not
  catch it; only execution against a mutant does.
- **A mutation table is itself an untested claim.** Two of this plan's mutant→criterion
  pairings were false (M1 did not kill AC-02; M3 did not kill AC-06). Correct the table from the
  **observed** kill set, never the intended one.
- **Verify before claiming, including about your own diff.** This seat told the prime its ledger
  change was "a pure append at the tail". It was three mid-file hunks. One `grep '^@@'` would
  have settled it, and the claim cut in the direction that made its own PR look cheaper.
