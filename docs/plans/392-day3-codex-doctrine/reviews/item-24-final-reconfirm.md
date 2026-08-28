# Item-24 FINAL fold (bubblesHash) — re-confirm AS A SET

**TERMINAL REPORT.** This pass is CLOSED. No mutation, probe or gate was run after the
verdict below was written; every number here was produced before writing and nothing was
re-run to make it agree. All scaffolding is torn down (§8).

**VERDICT: ✅ APPROVE.**

**Both of my blocking findings are CLOSED, proven by re-running my own original
differentials — not by reading.** W1 (media dup) reverses 2×→1×; W2 (distribution-alias
silent omission) reverses omitted→delivered. All six mutants RED. The membership half of
the invariant — "nothing reaches the operator that is not in the plan" — **holds
structurally**, and I verified it by enumerating every outbound call site rather than by
inspection of the diff.

I have **one finding (W3, advisory, non-blocking)** and it is of the class the packet asked
for: **the invariant is incomplete as a state machine.** It says what happens when a hash
matches or differs, but never says the stored hash is *updated* — and it deliberately is
not (`INSERT OR IGNORE`, "drift never overwrites it"). Consequence, measured: after **one**
drift the "sends exactly the unmarked bubbles" clause becomes **permanently unreachable**,
and every subsequent lease recovery re-sends the whole plan to the operator's phone.
Bounded at `maxAttempts = 6` → **5 extra copies of every text bubble**, then parked.

It is advisory and not blocking because it is a **dup, never an omission** — explicitly the
accepted degradation direction (Dim-1 #4) — and it is bounded and self-terminating. But
Dim-1 #4 accepted *a* dup; it did not anticipate *one per pass*. That is a judgement for
the o-prime, not for me, which is why it does not block.

I also record the honest answer to the terminal question in §7.2: the one thing that does
reach the operator outside the plan is the **bounded retry's second copy** — pre-existing,
out of this fold's scope, but directly load-bearing for the pending live-hang item.

---

## 1. Scaffolding, and the limits of what I proved

Stated first, deliberately: **a gate I did not examine and a gate I found clean must not
look the same in this report.**

**Scaffolding.** Four throwaway detached worktrees off `origin/main` @ `a816c5b`:

| tree | contents | role |
|---|---|---|
| `/tmp/pij-i24f-picked` | fresh main + the 5-commit chain | the candidate under test |
| `/tmp/pij-i24f-pre` | fresh main + chain **up to `a6151aa`** | **the pre-fix control** — where I originally found W1/W2 |
| `/tmp/pij-i24f-asis` | `b1f0e0a` as committed | fidelity reference |
| `/tmp/pij-i24f-main` | unmodified `a816c5b` | baseline / environmental re-derivation |

Plus `/tmp/i24f-mut.py` (harness), `/tmp/i24f-run.sh`, six mutant scripts, and five `.mts`
probes written **inside** the worktrees. `node_modules` symlinked from the main checkout.

**Pristine shas** (candidate, verified before every mutant and again at exit — §8):

```
949a4efca8deed584aa8f8fc22f596fd7a2e166d0d84af54e16171e3cebc4741  telegram/bridge.ts
c40a3cafe74dca9b14c463d931e8514804a0182173699489fd8078a494b0a1bc  telegram/bridge.test.ts
6e5cdcd64892f8d76ea6708ffa20468cb2726c9a35d96919b38f78ca7256e907  adapters/sqlite-queue.ts
731b28f4946aa7f3354062564c254797f6d4e1dad8f91f9d7e4bfe30d2d2921f  adapters/sqlite-queue.test.ts
```

### 1.1 What I did NOT examine — do not read these as clean

- **No live Telegram send.** Every "operator bubble" here is a counted invocation of an
  injected `send` / `sendMedia`. I did not verify grammy's behaviour, the 429 path, or the
  real ≥417B hang recorded in `7bd9010`. The live-hang item is explicitly *not* in this fold
  and I did not review it.
- **W3's trigger is injected.** My drift lever is a controlled `sizeOf` flip. I did **not**
  demonstrate a real production workload that drifts a plan. The *consequence* of a drift is
  measured; the *frequency* of drift in production is not.
- **No concurrency anywhere.** Single forwarder, single queue, sequential passes. Two
  forwarders racing the same row is untested by me and by the suite.
- **sha256 collision resistance assumed**, not tested.
- **`chunk()` boundary-preference branches unvaried** — I varied plan *shape*, not the
  chunker's internal split preferences.
- **The `parked` terminal state**: I confirmed the row parks at 6 attempts. I did **not**
  check what, if anything, tells the operator a parked message was abandoned.
- I reviewed the four fence files. `watchdog-store.ts`, `daemon.ts`, `daemon.test.ts` and
  `cli.integration.test.ts` appear in a `a6151aa..b1f0e0a` range diff only because docs and
  29b commits sit between the two shas; **`b1f0e0a` itself touches exactly the 4 fence
  files** (§2). I did not review the 29b work here.

---

## 2. Branch shape and pick fidelity

Main moved **twice during setup** (`9d5730ff` → `a816c5b`); I re-derived rather than trusting
the first read.

```
merge-base(a816c5b, b1f0e0a) = 10483d8e   main ahead: 112 commits
b1f0e0a alone: 4 files, +308/-272  (exactly the fence)
FENCE drift on main since merge-base: NONE (empty diff)
```

Because main has not touched any of the four files across all 112 commits, **the picked tree
is uncompromised evidence** for the fence.

All five picks (`a27ab58 → 6641943 → 588dd0e → a6151aa → b1f0e0a`) applied **CLEAN**. Fidelity
proven the strong way — resulting fence bytes vs the as-committed tree:

| file | picked vs as-committed |
|---|---|
| `telegram/bridge.ts` | **IDENTICAL** |
| `telegram/bridge.test.ts` | **IDENTICAL** |
| `adapters/sqlite-queue.ts` | **IDENTICAL** |
| `adapters/sqlite-queue.test.ts` | **IDENTICAL** |

Baseline on the picked tree: **113 passed | 1 skipped**.

---

## 3. Dim-0 — the mutant set

**"Greps deleted" is vacuous here, and that is a good thing.** I checked: there are **no
source-pin / `readFileSync` grep tests** in either fence test file. Every sensor below is
behavioural. Nothing had to be deleted for these results to mean what they say.

| mutant | mutated sha | claimed | observed RED | tests RED |
|---|---|---|---|---|
| **MUT-HASH** (W2) | `6f36da3b351a2fd6150f156607354fc1880dd21bd8056e71ba72c2fa19d5be86` | 1261 | **1261** ✅ | 5 |
| **MUT-MEDIA-UNMARKED** (W1) | `a23dfa9ee76644b4e7f024e40d2271163067953bec8f2c35da301a5ba51f930c` | 1309 | **1309** ✅ | 1 |
| **MUT-NOMARK** | (restored OK) | 1204 | **1204** ✅ | 5 |
| **MUT-PARTIAL** | (restored OK) | 1346 | **1345** ⚠ | 7 |
| MUT-RETRY | `f7bf664d5e453d43d0f07b90aa2cde05a146ba83327d96214cf3bfcedff4cd55` | — | 1157 | 6 |
| MUT-LOGID | `86e2846e137e463b52879ec7248812a8dfc0d28ebc51dc3f1b2fe12deb5083e3` | — | 1124 | 1 |

Every mutant restored to the pristine sha (harness verifies and prints it). Harness refuses
to run on a non-pristine tree, refuses a no-op, and aborts unless the anchor occurs **exactly
once**.

**Line-claim accuracy: 3 of 4 exact, 1 off by one.** MUT-PARTIAL RED at `:1345`, not the
claimed `:1346` — both are assertions inside the same test
(`marks a failed bubble only after a later positive Telegram acknowledgment`, declared
`:1320`). Immaterial, recorded for calibration.

### 3.1 MUT-HASH — the one the o-prime could not apply

The packet is honest that its regex missed the comparison and that I am the authoritative
check. I applied it as `persistedHash === bubblesHash` → `persistedHash !== undefined`, i.e.
*any* stored hash counts as a match, so drift is ignored. Result:

```
Tests  5 failed | 108 passed | 1 skipped
× same-count distribution drift sends the whole current bubble plan      <- 1261, THE W2 TEST
× bubble-plan drift sends every recomputed part and preserves the full tail
× stable-count prefix drift still sends every recomputed part
× equal-length prefix drift still sends every recomputed part
× A-B-A drift never records mismatched B positions as A sent parts
```

**The W2 sensor is real and it is behavioural.** It also picks up the two prefix-drift tests
that survived from my previous pass, so prefix coverage is retained behaviourally even
though the explicit `prefixLength` / `prefixHash` component tests were deleted (§4.2).

---

## 4. What actually changed

`b1f0e0a` is a genuine refactor, not a patch. The per-attachment `AttachmentPlan` is replaced
by **one flat, ordered `operations` list** built in true send order (body parts → per
attachment: oversize notice / no-sender fallback / overlong caption text / the media bubble,
or an `error` op). `plannedBubbles = operations.filter(isPlannedBubble)`; the identity is

```ts
sha256(JSON.stringify(plannedBubbles.map(serializedBubble)))
//   text  -> ["text", text]
//   media -> ["media", mediaKind, path, caption]
```

Three consequences I verified rather than assumed:

1. **Media now consumes an index and is marked** (`bridge.ts:705-707, 743-746`) — this is the
   W1 fix.
2. **`error` ops consume no index and are excluded from the hash.** Correct: they contribute
   nothing to the operator (§7.2).
3. **A failed media bubble now increments `undeliveredBubbles`**, so it leaves the row claimed
   for lease recovery. This is a real behaviour change and it is deliberate — the doc comment
   says so, and the test rename pins it (§4.2). It is also the precondition that makes W3
   reachable (§7.1).

`JSON.stringify` over an array of string arrays is unambiguous — a `["text", …]` entry cannot
be confused with a `["media", …]` entry regardless of content. This is a materially better
construction than a concatenation and I could not construct a crafted-text collision.

### 4.1 Schema

`bubbles_hash` added additively: `ALTER TABLE … ADD COLUMN bubbles_hash TEXT` (nullable) for
existing DBs; `NOT NULL` in the fresh `CREATE TABLE`. The old `part_count` / `prefix_length` /
`prefix_hash` columns are **written as `0, 0, ''` placeholders and never read** — the
o-prime's structural claim is correct; I confirmed it by reading the only INSERT and the only
SELECT.

### 4.2 No-collateral — and why the count was blind

`npx vitest list` gave **113 declarations on both trees**. That count is worthless here: the
list diff shows **6 removed and 6 added**, perfectly masked.

Removed: the three per-component drift tests (`part-count` / `prefix-length` / `prefix-hash`
drift) — legitimate, the 3-component identity no longer exists — plus two renames
(`partition drift` → `bubble-plan drift`, `legacy … partition identity` → `… bubbles hash`),
plus **`acks a handled media-only failure after echoing it to the sender`**.

Added: `same-count distribution drift …` (W2), `same-hash redelivery skips acknowledged media
…` (W1), `marks a failed bubble only after a later positive Telegram acknowledgment`, the two
renames, and **`leaves a handled media-only failure claimed after echoing it to the sender`**.

That last pair is the important one: **`acks …` → `leaves … claimed`** is the media-failure
behaviour change, and it is explicitly test-pinned. I had already found it empirically (§7.1)
before reading this diff, which is why I can state it is intentional rather than incidental.

---

## 5. Dim-1, answered by execution

### 5.1 W2 — CLOSED (my original probe, re-run on both trees)

Three attachments whose sizes cross the upload limit in **opposite directions** between
passes, so `a6151aa`'s `partCount + prefixLength + prefixHash` is identical while the real
plan differs:

```
pass1 plan: [notice-a (idx0, OK)] [media-b] [notice-c (idx1, FAILS)]
pass2 plan: [media-a]             [notice-b (idx0)] [notice-c (idx1)]
```

| | pass2 a.jpg | **pass2 b.jpg** | pass2 c.jpg | drift logs | verdict |
|---|---|---|---|---|---|
| **`pre` = a6151aa** | 0 | **0** | 1 | **`[]`** | **b.jpg notice SILENTLY OMITTED** |
| **`picked` = b1f0e0a** | 0 | **1** | 1 | `["bubble plan drift …; sending all"]` | **DELIVERED** |

The control reproduces my original finding *verbatim*, including the empty drift log that
made it silent. The candidate reverses it and says so out loud. **W2 is closed.**

### 5.2 W1 — CLOSED (my original probe, re-run on both trees)

Body text + **one in-limit media**; the body send fails on pass 1 and succeeds on pass 2:

| | pass1 media | **total media sends** | skip log | verdict |
|---|---|---|---|---|
| **`pre` = a6151aa** | 1 | **2** (`/tmp/a.png,/tmp/a.png`) | `[]` | **MEDIA DUP** |
| **`picked` = b1f0e0a** | 1 | **1** | `["skip sent … part 2/2"]` | **delivered once** |

**W1 is closed**, and the skip is explicit in the log rather than implicit.

### 5.3 Mark-on-ack (Dim-1 #3) — pinned

MUT-PARTIAL moves the mark to *before* the send (mark-on-attempt). 7 tests RED, including the
dedicated `:1320` test. A bubble that failed is therefore provably **not** marked, and a
bubble is marked only after `send`/`sendMedia` resolves. This is the property the pending
live-hang acceptance (c) leans on, and it is genuinely sensored.

### 5.4 Legacy / null hash (Dim-1 #5) — proven **cross-version**

I did not simulate a legacy row; I built one with `a6151aa`'s **own code**, closed it, and
reopened the same home with the candidate:

```
legacy tables                  : cursors,deliveries,messages,receipts,telegram_partitions,telegram_sent_parts
legacy telegram_partitions cols: message_id,part_count,prefix_length,prefix_hash,recorded_at
candidate open error           : (none)
cols after open                : …,prefix_hash,recorded_at,bubbles_hash
bubblesHash on legacy row      : undefined
marks carried over             : [0,1]
parts SENT after migrate       : 3  -> ["PART0","PART1","PART2"]
skip logs                      : []
final state                    : acked
```

The stale marks `[0,1]` are correctly **ignored**, all three parts are re-sent, nothing is
omitted, and the migration does not throw. Migration-safe.

### 5.5 Accepted degradation (Dim-1 #4) — holds, with the caveat in §7.1

Drift always produces send-all, never a skip. I could not construct an omission on the
candidate. The direction of the degradation is correct; only its *repetition* is at issue.

---

## 6. Gates

| gate | result |
|---|---|
| `tsc --noEmit` | **exit 0** |
| `biome check` (4 fence files) | **exit 0**, no fixes |
| fence suite | **113 passed / 1 skipped** |
| full suite (E35, candidate worktree) | **4703 passed, 19 skipped, 1 failed** |
| declaration-list diff | 6 out / 6 in, all accounted for (§4.2) |

The single full-suite failure is `harness/scripts/release-age-policy.test.ts > restores the
Windows caller environment even when a governed command fails`. **Re-derived on unmodified
`a816c5b`** (not reused from an earlier session): same failure, `Error: spawnSync pwsh
ENOENT`, and `which pwsh` → absent. Environmental, pre-existing, and it does not touch any of
the four changed files.

---

## 7. Findings

### 7.1 W3 — ADVISORY (non-blocking): the stored hash never converges

**This is the wrong-invariant class the packet asked for, in its state-machine form.**

The invariant says: *"a redelivery whose plan hash matches sends exactly the unmarked
bubbles; any other hash sends the whole plan."* It never says what happens to the **stored**
hash on drift. The implementation answers deliberately — `INSERT OR IGNORE`, commented
*"Record the first complete ordered-bubble plan only; drift never overwrites it"* — so the
stored hash is **write-once**. `recordTelegramBubblesHash` is reachable only from the
`persistedHash === undefined` branch.

Therefore **once a plan drifts, it can never re-converge**: the stored hash stays at the dead
plan forever, `planMatches` is false on every subsequent pass, no marks are ever written
again, and the first clause of the invariant becomes unreachable for that message.

Measured on the candidate — identical scenario, the only difference being whether the plan
drifts **once** at pass 2 and is stable thereafter (media that always fails, so the row is
never acked):

| scenario | text sends per pass | body copies to operator | drift logs | final state |
|---|---|---|---|---|
| plan never changes | `[2,0,0,0,0,0,0,0,0]` | **1** | 0 | parked |
| **drifts once, then stable** | `[2,1,1,1,1,1,0,0,0]` | **6** | 5 | parked |

**One drift costs five extra copies of every text bubble on the operator's phone.**

Why it is advisory and not blocking:
- It is a **dup, never an omission** — the explicitly accepted direction (Dim-1 #4).
- It is **bounded and self-terminating**: `recoverStaleClaims` parks at `maxAttempts ?? 6`
  (`sqlite-queue.ts:494`), which I confirmed by running to 9 passes and observing `parked`.
- It is only reachable because this fold *correctly* made media failures block the ack. On
  `a6151aa` the same probe **acked immediately in both scenarios** (`converges`, 1 copy) — but
  only because the media failure was being silently swallowed, which is the very dishonesty
  this fold set out to fix. **The fold is not wrong to have made this reachable.**

Suggested one-line direction (o-prime's call, not mine): on the drift branch, re-record the
hash and clear that message's marks, so the pass that sends-all also re-establishes the
identity and the *next* pass converges. That preserves "drift → send-all" exactly while making
the first clause reachable again.

### 7.2 The terminal question, answered honestly

> *"Is anything sent to the operator NOT in the plan?"*

I answered this by enumerating **every** outbound call site in `bridge.ts` rather than reading
the diff. Inside `forwardOne` the only calls that can reach the operator chat are `deps.send`
and `operation.sendMedia`, and **both are driven exclusively by `operations`**. Specifically:

- `deps.echoFailure(dm.from, …)` — goes to the **sending pij session**, not the operator, and
  is guarded by `dm.from !== TELEGRAM_PEER_ID`. Correctly excluded from the plan and from the
  hash. I expected a hole here and verified there isn't one.
- `noteSpoke()` → `deps.onSpoke?.(dm.from)` — not a send at all.
- `error` operations consume no index and are excluded from `plannedBubbles` — consistent on
  both the hashing side and the indexing side.

**So the membership half of the invariant holds.** With one honest exception:

**The bounded retry sends a plan member twice.** Measured — one text bubble, transient failure
on attempt 1:

```
plan size (bubbles)                   : 1
sender INVOCATIONS (operator bubbles) : 2
marks recorded                        : [0]
```

If attempt 1 actually reached Telegram and only its **ack** was lost, the operator receives
**two bubbles for one plan member, recorded as one mark**. This is not hypothetical: the
transient classifier matches `429|Too Many Requests|timed? ?out|Bad Gateway|socket…`
(`media.ts:129`), and `7bd9010` records the live symptom as *"≥417B acks only on attempt 2"*
with **grammy-429 as the leading hypothesis** — i.e. this is the actively-firing path in
production today.

**Scope, stated plainly: this is pre-existing** (it predates this fold; MUT-RETRY guards it)
and **out of this fold's fence**, so it does not affect the verdict. I raise it because the
pending live-hang item's acceptance (c) is described as relying on this fold's mark-on-ack —
and mark-on-ack **cannot** prevent this duplicate. Mark-on-ack gives *cross-pass* idempotence;
the retry duplicate is *within* a pass, before any mark exists. Whoever takes the live-hang
item should not expect this fold to have covered it.

### 7.3 INFO

- **INFO-1** — Media identity is `["media", mediaKind, path, caption]`; the **bytes at `path`
  are not hashed**. A file replaced in place between passes yields the same identity. No
  omission results (a marked bubble is skipped, an unmarked one sends current bytes), so this
  is a design statement rather than a defect — but it is a determinant of what the operator
  sees that is not in the plan hash.
- **INFO-2** — A legacy row *with* marks never records a hash either (same write-once branch),
  so legacy rows are permanently send-all. Safe (proven §5.4), non-convergent, same root as W3.
- **INFO-3** — Fresh DBs get `bubbles_hash TEXT NOT NULL`; migrated DBs get a **nullable**
  column. Two shapes in the wild. Currently harmless — the single INSERT always supplies the
  value and the single SELECT coalesces NULL — but worth knowing.
- **INFO-4** — My prior review's ADV-1 (`prefixLength` redundant) is now moot: the three
  per-component tests are deleted and the whole 3-component identity is gone. Prefix coverage
  survives behaviourally via the two prefix-drift tests, both of which RED under MUT-HASH.
- **INFO-5** — The `parked` terminal state ends the duplication, but I found nothing that
  tells the operator a message was abandoned after 6 attempts. Out of fence; flagging only.

### 7.4 Credit

The two findings this fold set out to close are closed **by measurement on my own probes**,
not by assertion. The refactor also removed the aliasing *class* rather than patching the two
instances I happened to find: hashing the materialised ordered plan means I could not
construct a new aliasing case at all, whereas under the 3-component identity I found two
within one session. The `error`/`plannedBubbles` split is consistent on both the hash side and
the index side, which is the part that would most easily have gone wrong.

---

## 8. Teardown

- All five `.mts` probes deleted from both worktrees **before** the gates ran, so
  `git status --porcelain` was empty (verified, printed) for the typecheck, lint and
  full-suite runs.
- Fence files re-verified at exit — all four match the pristine shas in §1 exactly.
- Every mutant restored from self-captured bytes with the restored sha printed and compared.
- Temp queue homes removed. Worktrees to be removed on exit; `git worktree list` returns to
  the legitimate four.
- **No branch checked out, no commit, no push, no write to the repo except this file.**

---

## 9. Bottom line

**APPROVE.** W1 and W2 are closed — I re-ran my exact original differentials on a pre-fix
control and both reverse cleanly, with the candidate logging what the old code did silently.
All six mutants RED with no source-pin greps propping them up, migration is proven
cross-version, and the membership half of the invariant holds under call-site enumeration.

The invariant is right about *what* is in the plan. It is silent about *when the stored plan
is replaced*, and the deliberate write-once answer makes its own first clause unreachable
after a single drift — costing up to five extra operator bubbles before the row parks (W3).
That is a bounded dup in the accepted direction, so it is the o-prime's call, not a blocker.

The one thing that genuinely reaches the operator outside the plan is the bounded retry's
second copy — pre-existing, outside this fence, and specifically **not** covered by
mark-on-ack. The pending live-hang item should be scoped with that in mind.
