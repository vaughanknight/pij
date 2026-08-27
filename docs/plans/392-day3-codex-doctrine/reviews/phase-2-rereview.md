# Cold RE-review — Phase 2 (3c) after FX002

> **TERMINAL REPORT.** Every mutation in this file was run *before* the report was
> sent. No mutation was run after reporting. **This pass is CLOSED.** If a further
> fix lands, it is re-reviewed as a new review, against a new sha, in a new file.

**Reviewer**: pij-pale-araminta (cold) · **Date**: 2026-08-27
**Prior verdict**: `reviews/phase-2-review.md` — `FIX_REQUIRED` (F1, F2)
**Fix under review**: `f21269f` "test(pij): guard sqlite receiver failure and reload"
**Impl under review (unchanged)**: `35f9aff` · **Branch**: `s392/day3-codex-doctrine`
**Suite**: `.pi/extensions/pij/index.test.ts`

## VERDICT: `APPROVE`

Both blocking findings are closed with independent RED evidence that I produced
myself. The fix is also **better than the minimum asked for** — see "Beyond the
brief" below.

---

## 1. Scaffolding, and the limits of what I proved

Stated first, so that nothing below reads as broader than it is.

- **Two of my three mutation targets are not textually unique in `index.ts`.**
  `receiver.onInbound(dm, dm.messageId);` appears at **:373 (sqlite)** and **:412
  (fs)**; `disposeWatch?.();` appears at **:366 (sqlite)**, **:402 (fs)** and
  **:447 (shutdown)**. A naive `sed` mutates every one of them, turns the fs
  tests red too, and yields a **false RED** attributed to the wrong branch.
  I therefore dry-ran each expression against a scratch copy in `/tmp` and
  diffed it before running anything for real, confirming **exactly one line
  changed, and the right one**. The address-ranged expressions are reproduced
  verbatim in §3 — a bare pattern will not reproduce my result.
- **The `flow-pair-mutate` GREEN re-run overwrites `/tmp/fp-mutate.log`**, which
  destroys the failing test *names*. Every name and assertion message below came
  from a **second, manual** run with my own backup and explicit restore, not
  from the gate's output.
- **I re-ran only the 3 establish items plus 2 additional mutations of my own.**
  Per the packet, the other 6 RED-guarded behaviours from the first pass and the
  whole fs branch were **not** re-run. `index.ts` is byte-identical to the
  reviewed impl (§2.3), so their earlier verdicts still stand — but I did not
  re-observe them today, and they should not be read as re-verified.
- **`.pi/` was verified clean (`git status --porcelain -- .pi/` empty) before the
  baseline and after every single mutation.** One mutation touched
  `adapters/queue-consumer.ts`, which is outside the fix's fence; it was backed
  up and restored manually under a shell `trap`, and the tree was confirmed
  clean afterwards.
- **Not examined**: repo-wide `just lint`, `just smoke`, `harness checks`
  (accepted as pre-existing red, not re-run); `PIJ_QUEUE_BACKEND=dual` at
  runtime; any live seat, daemon or queue. No live resource was touched.

---

## 2. Establish (independently — the coder's RED is not evidence)

### 2.1 FX-A — mutation M2b now goes RED ✅

Was **GREEN** in the first pass (blocking F1). Now:

```
just flow-pair-mutate .pi/extensions/pij/index.ts \
  '/queue: sqlite,/,/onScan:/ s/receiver\.onInbound\(dm, dm\.messageId\);/try { receiver.onInbound(dm, dm.messageId); } catch {}/' \
  'npx vitest run .pi/extensions/pij/index.test.ts'
→ ✓ suite went RED under mutation (1 failed) → restored → ✓ GREEN (15/15)
```

Failing test and assertion, captured by manual re-run:

```
FAIL  index.test.ts > pij index — footer status bar
      > leaves the sqlite row claimed when injection throws
AssertionError: expected 'acked' to be 'claimed'
  ❯ index.test.ts:483  expect(queue.summary({ to: id })[0]?.state).toBe("claimed");
```

This is the point worth dwelling on. The mutation does not merely break an
assertion — it reproduces **the exact harm F1 described**, and the failure
message says so in as many words: the row reads `acked` when nothing was
injected. That is permanent message loss, named by the witness.

**Negative, not truthiness — confirmed.** The test asserts durable **row state**
(`.toBe("claimed")`) and the **absence** of an acked receipt
(`...some(r => r.state === "acked")).toBe(false)`). Neither is a truthiness
check, and neither passes vacuously.

**The fake is the shape the dossier asked for.** `makeFakePi` now takes an
`onSendUserMessage` callback (`index.test.ts:44`) invoked **synchronously**
inside `sendUserMessage` (`:58-61`). I checked that deliberately: had it been
deferred, the throw would not have propagated out of the synchronous
`PijSession.onInbound` into the consumer's `catch`, and the test would have been
theatre. The stack captured under mutation M2 confirms the real path end to end:
`sendUserMessage → PiRuntimeAdapter.inject → PijSession.onInbound → index.ts:373`.

### 2.2 FX-B — mutation M8 now goes RED ✅, and my caveat is resolved

Was **GREEN** in the first pass (blocking F2). Now:

```
just flow-pair-mutate .pi/extensions/pij/index.ts \
  '/const sqlite = sqliteOf\(channel\);/,/startQueueConsumer/ s/disposeWatch\?\.\(\);//' \
  'npx vitest run .pi/extensions/pij/index.test.ts'
→ ✓ suite went RED under mutation (1 failed) → restored → ✓ GREEN (15/15)
```

```
FAIL  index.test.ts > ... consumes sqlite messages once, acks after injection,
      stamps scans, and reload does not replay
AssertionError: expected 2 to be 1
  ❯ index.test.ts:449  expect(vi.getTimerCount()).toBe(timersBeforeReload);
```

**My own stated caveat from the first pass is now answered with evidence, not
argument.** I wrote that I had not verified whether vitest's fake timers count
`unref()`'d timers, and that if they do not, the witness could be vacuous. The
failure message settles it: `timersBeforeReload` is **1**, not 0 — vitest **does**
count the unref'd poller. So the bracket reads 1 → 1 unmutated (disposed, then
re-created) and 1 → **2** mutated (old poller leaked alongside the new one).
That is precisely the "one orphan 500 ms poller per `/reload`" leak F2 described,
measured directly. Non-vacuous.

Note this also means the test's *name* is now honest. In the first pass I showed
that "…and reload does not replay" passed **by construction** — `SqliteQueue.claim`
selects `WHERE d.state = 'queued'`, so an acked row is unclaimable no matter what
is disposed. The replay clause is still structurally guaranteed rather than
witnessed, but the test now additionally guards the thing that *was* unguarded.

### 2.3 `index.ts` unchanged ✅

```
git diff f21269f^ f21269f -- .pi/extensions/pij/index.ts   →  0 lines
git show f21269f --stat →  index.test.ts (+44/-1), plus two task docs under
                           tasks/fx002-phase2-witnesses/
```

Test + docs only, as claimed. No production code moved to make a test pass.

### 2.4 Baseline

`npx vitest run .pi/extensions/pij/index.test.ts` → **15 passed (15)**, up from
14 (one new test). Re-confirmed GREEN after every restore.

---

## 3. Dim-0 mutation ledger (this pass)

Baseline 15/15. **5 mutations run, 5 RED, zero stay-greens.**

| # | Mutation | File | Result | Caught by |
|---|---|---|---|---|
| M2b | `try { receiver.onInbound(…) } catch {}` | `index.ts:373` | **RED (1)** | FX-A test @ :483 |
| M8 | delete sqlite reload `disposeWatch?.()` | `index.ts:366` | **RED (1)** | reload test @ :449 |
| M2′ | detach injection: `void Promise.resolve().then(() => receiver.onInbound(…))` | `index.ts:373` | **RED (1)** | FX-A test @ :483 |
| M9 | ack **before** inject (pre-`claimUnread`) | `queue-consumer.ts:40` | **RED (2)** | reload test @ :434 **and** FX-A @ :483 |
| — | post-restore re-run | — | **GREEN 15/15** | — |

Exact expressions for the two non-unique targets (a bare pattern will hit the fs
branch as well and mislead you):

- M2b/M2′ range: `/queue: sqlite,/,/onScan:/`
- M8 range: `/const sqlite = sqliteOf\(channel\);/,/startQueueConsumer/`

**M2′ and M9 are mine, not the packet's**, and they matter for different reasons.

**M2′ (detach the injection into a floating promise).** I ran this expecting to
test *ordering*, and it did not — microtask scheduling happens to keep injection
ahead of the ack, so the ordering assertion never fired. What it did instead is
more interesting: it proves FX-A also catches the **fire-and-forget** variant,
where the error escapes as an *unhandled rejection* rather than being swallowed
by a `catch`. Vitest reported exactly that (`Unhandled Rejection: pi refused
injection`). So the new test guards two distinct ways of losing the error, not
one. I am recording my mistaken expectation rather than quietly re-labelling the
mutation, because the distinction is the whole point of the witness.

**M9 (ack before inject) is the one that closes the loop.** Because M2′ did *not*
exercise the ordering assertion, the fix's new `statesDuringInbound` check was
still unwitnessed, and I was not willing to report it as verified. M9 pre-acks
the row before `onMessage`, and the assertion fires precisely as designed:

```
AssertionError: expected [ 'acked' ] to deeply equal [ 'claimed' ]
  ❯ index.test.ts:434  expect(statesDuringInbound).toEqual(["claimed"]);
```

So **all three assertions added by this fix are independently load-bearing** — the
ordering sample, the FX-A row state, and the timer bracket. None is decoration.

---

## 4. Beyond the brief

The packet asked for two witnesses. The fix delivered those and then did
something it was not asked to do: it strengthened the **existing** happy-path
test with the in-critical-section sampling pattern

```ts
const { pi, handlers, sentUserMessages } = makeFakePi((message) => {
  if (message.includes("hello from sqlite"))
    statesDuringInbound.push(queue.summary({ to: id })[0]?.state ?? "missing");
});
…
expect(statesDuringInbound).toEqual(["claimed"]);
```

That is exactly the shape I singled out in the first pass as the strong pattern
already present in the **fs** test (`index.test.ts:341`, `markerStateDuringInbound`)
and *not* mirrored on the sqlite side. Sampling state from inside the critical
section converts "acks after injection" from an after-the-fact inference into a
direct observation. M9 shows it works. Worth saying plainly: the first pass
recorded that the sqlite tests asserted ordering only incidentally and via a
race; that criticism no longer applies.

---

## 5. What is still **not** witnessed

Listed so that a gate I did not examine cannot be mistaken for one I found clean.

1. **The FX-A test's second assertion** (`no acked receipt ever recorded`,
   `:484-486`) is **never reached** under any mutation I ran — the row-state
   assertion at `:483` throws first and `expect` aborts the test. It is harmless
   belt-and-braces, **not a defect**, but it is unproven and I will not claim
   otherwise. Witnessing it would need a mutation that acks the *receipt* while
   leaving the row state alone; I judged that not worth a production-code change.
2. **The "does not replay" clause** remains true by construction (`claim` filters
   `state = 'queued'`), as established in the first pass. Unchanged.
3. **The 6 other RED behaviours and the fs branch** were not re-run this pass
   (§1). `index.ts` is unchanged, so their first-pass results carry forward on
   that basis alone.

---

## 6. Gates

| Gate | Result |
|---|---|
| `npm run typecheck` (`tsc --noEmit`) | **PASS**, clean |
| `npx vitest run index.test.ts` | **PASS 15/15** (baseline and after every restore) |
| `git status --porcelain -- .pi/` | **empty** before baseline and after all 5 mutations |
| lint / smoke / `harness checks` | **not run** — pre-existing red, out of scope (§1) |

---

## 7. Why `APPROVE`

F1 and F2 were both Dim-0 failures: real safety properties that the suite did not
guard, where a silent deletion would have shipped green. Both now have witnesses
I produced and verified myself, and the M2b failure message reproduces the
message-loss harm in its own text rather than merely flagging a diff. The fix is
test-only — `index.ts` is byte-identical — so nothing was weakened to make a test
pass. My one open caveat from the first pass (unref'd timer counting) is resolved
with a measured value rather than an argument, and the extra assertion the coder
added unprompted is proven load-bearing by M9.

Nothing blocking remains. Item 5.1 is an unproven redundancy, not a fault, and I
would not hold a merge for it.

**Verdict: `APPROVE`.**
