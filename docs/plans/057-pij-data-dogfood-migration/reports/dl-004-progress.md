# DL-004 progress — channel half shipped, index half needs a prod seam

**Commit**: `e6f8bb8` (test(pij): DL-004 channel half). Suite green (2986
passed), biome + tsc clean, non-vacuousness mutation-proven.

## What shipped (no deconfliction needed — pure test surgery, existing seam)

`channel.test.ts`'s two deliver-after-subscribe tests moved off real `fs.watch`
onto the existing `watchFactory` seam via a `controllableWatch()` helper, with
`pollMs` pushed far out so the manual `fire()` is the SOLE drain path (broken
drain HANGS → non-vacuous, not rescued by the 1.5s fallback poll).

- **channel.test.ts under full parallel load: 13,882ms → 498ms (28×).**
- debounce+dedupe 1572→94ms; own-inbox 598→70ms (isolation).
- Mutation proof: no-op'ing `scan()`'s `onMessage(payload)` turns the drain
  tests RED (1525ms timeout) — they still exercise the real drain.

## Mechanism reframe (vindicates your "watch-dependent" call)

I first guessed the boot-test cost was git/boot-contention. **Measured it —
wrong.** Mocking `gitCommonDir` barely moved the boot tests (3929→2094ms, within
noise). The dominant, highly-variable cost is the **real fs.watch (FSEvents)
watcher OPEN + fire**: a mocked-watcher channel test = ~6ms, a real-watch one =
0.6–1.6s (a ~260× gap). Your original DL-004 framing was right; my git detour
was the red herring. Per-test durations are test-BODY time (they sum to the
suite's `tests` total), so `testTimeout` bites them directly — the band-aids are
genuinely load-bearing, not slack.

## The index.test.ts half — blocked on a PRODUCTION seam (your call)

`session_start` **hard-constructs** `new FsChannel(pijHome)` (index.ts:283).
Its boot tests open real FSEvents watchers **they never need to fire** — every
message is pre-delivered and drained by the initial synchronous `scan()`. So the
FSEvents open cost (×N session_starts) is pure waste, and removing it needs an
**injectable-watch seam in production code**, not a test-only edit. That is a
delivery-path change = your deconfliction territory, and it **overlaps thread #1**
(prod poll-fallback / watcher-health).

**Decision I need from you** — two ways to kill the `index.test.ts` 20s band-aid:

- **(a) Fold into thread #1.** The injectable watch seam serves BOTH the prod
  poll-fallback/health work AND fast boot tests; the band-aid comes off when
  that seam lands. Cleaner, one design, but band-aid lives longer.
- **(b) Minimal standalone seam now.** A test-gated `PIJ_TEST_NO_FSWATCH`-style
  flag on FsChannel (precedent: `PIJ_TEST_NO_FSYNC`), zero prod-behavior change,
  kills the band-aid this loop. Faster, but a second small delivery-path touch.

**My lean: (a).** The band-aid is honest-and-labelled; a second prod seam that
thread #1 would subsume is churn. Holds until you rule.

## Thread #1 relevance (new evidence for the design read)

FSEvents isn't just flaky-under-load for *delivery* — it's **expensive to
open**, and variably so. The poll-fallback/watcher-health design should account
for watcher OPEN cost on live-bound seats (constraint B's fleet-cost argument),
not only for dropped events. I'll fold this into the design read.
