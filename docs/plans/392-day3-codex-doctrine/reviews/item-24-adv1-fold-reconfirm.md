# Item-24 ADV-1 fold — cold re-confirm (hunk only)

> **TERMINAL REPORT.** This pass is CLOSED. No mutation, probe, or repo write
> was performed after this file was written. All scaffolding is torn down.
> Reviewer: `pij-wilful-morton`. Date: 2026-08-28.

**Candidate**: `664194366ea0086f404c200dc2489583015645f2` ("fix(pij): guard telegram part skips by partition")
**Reviewed as**: `ba894c4cc749e28b742249423002c1cab7398b49` (cherry-pick of `a27ab58` then `6641943` onto fresh main `a818b6c9`)
**Prior verdict re-affirmed**: item-24 APPROVE at `a27ab58` — unchanged.

---

## VERDICT: ✅ APPROVE (the fold hunk)

The fold does exactly what it claims. I proved by **differential execution against
the item-24 base** that the silent tail loss is real, that the fold eliminates it,
and that it does so **without** weakening item-24's idempotency. The mandated
MUT-DRIFT went RED at **precisely the claimed line**, which is the first time in
this review series a coder-claimed line has been correct.

**But two of the fold's own load-bearing guards have NO test at all.** I did not
merely observe that mutating them stays green — I measured the loss each one lets
back in:

| unsensored guard | mutation | suite | measured consequence |
|---|---|---|---|
| `prefixLength` half of the identity | MUT-PREFIXLEN | **GREEN 105P** | **84 chars silently lost** (ADV-1) |
| `if (positionalPartsValid)` gate on marking | MUT-NOMARK | **GREEN 105P** | **84 chars silently lost** (ADV-2) |

Both are *correct in the shipped code*. Neither is *protected*. The single shipped
drift test exercises a `partCount` change only, so it cannot tell the two halves of
the identity apart. This is an APPROVE with a real ratchet gap, not a blocking
finding — the code ships correct; a future edit can silently un-fix it.

---

## 1. Scaffolding, and the limits of this pass (stated first, deliberately)

**Scaffolding built** (all removed — see §9):

| tree | at | purpose |
|---|---|---|
| `/tmp/pij-i24f` | `a818b6c9` + cherry-pick `a27ab58`, `6641943` → `ba894c4` | the candidate |
| `/tmp/pij-i24f-base` | `eddef28` (= item-24 alone, no fold) | **the differential control** |
| `/tmp/pij-i24f-main` | `a818b6c9` (fresh main) | pre-existing-red + declaration baseline |

Each got a `node_modules` symlink to `~/GitHub/pij/node_modules`. All three were
created `--detach`; no branch was checked out, nothing committed, nothing pushed.

**Pristine fence sha256** (re-verified after every single mutation and at teardown):

```
af0d7822dba33761c0264c97028d0345518f6c6a7613c6bf7097a38d40797ebe  telegram/bridge.ts
87a1e116ce556fbf63dd0eb76c6f4b2efd635b3187801b08bb07dca386d62c1e  telegram/bridge.test.ts
92aa2e7be6ea37c2881785d5e6952ff611272ceaa97665e69c19bc02617502ee  adapters/sqlite-queue.ts
946be27c679017107a80728b70f49990c17c5e6aa170af143e5122defc7d817f  adapters/sqlite-queue.test.ts
```

The mutation harness refuses to run unless all four match, refuses a no-op
mutation, refuses an anchor that does not occur exactly once, prints the mutated
sha256, and restores from bytes it captured itself (E27).

### What I did NOT examine — a gate I did not check must not read as a clean one

1. **No live Telegram send.** Nothing was transmitted to the real Bot API or to
   Vaughan's phone. Every "delivered" claim here is against an injected `send`.
2. **No concurrency test.** Two forwarders racing the same row, or a daemon tick
   overlapping a lease recovery, was not exercised. `INSERT OR IGNORE` makes the
   identity write itself race-safe, but I did not *run* that race.
3. **`recordTelegramPartitionIdentity`'s throw path was never executed.** I argue
   in INFO-4 that it is unreachable by construction; I did not build a harness to
   force it.
4. **`DualWriteChannel` not exercised.** Only `SqliteQueue` and `FsChannel`.
5. **`deps.sendMedia` present-path only partially exercised** — P8 drove the
   no-`sendMedia` fallback. The caption-too-long fallback (`sendText(normalizedCaption)`)
   was reasoned about (ADV-3), **not** executed.
6. **The out-of-fence `tail --type` filter residual** I noted in the item-23
   review was not re-checked here.
7. **Item-24's own body** was not re-reviewed. Its advisories (ADV-1..4, INFO-1..6
   in `item-24-review.md`) still stand except ADV-1, which this fold closes.

---

## 2. Branch shape — main drifted again, and I did not trust the packet's base

`git merge-base origin/main 6641943` = `10483d8e`, but `origin/main` is
**`a818b6c9`** — main is **21 commits ahead** of the candidate's merge-base
(items 13/20/21/23/29 merged, plus E27–E31 gov encodes). Two-dot diffs against
`origin/main` would therefore have shown other people's work as phantom
reversals. I re-derived the base every time.

**Does main's drift touch the fence?** No.

```
git log --oneline 10483d8e..origin/main -- <the 4 fence files>   →  (empty)
```

The drift does touch `.pi/extensions/pij/telegram/index.ts` (item 29), which is
where `senderContext`/`resolveRepositoryContext` lives — i.e. the *source* of the
prefix drift this fold defends against. It does not change the fence files
themselves, and the cherry-pick applied clean.

**Cherry-pick fidelity — proven with `patch-id --stable`, never `--stat`:**

| commit | patch-id |
|---|---|
| original `a27ab58` | `3de850f729375b376f5bd747e13a1627e27d879c` |
| picked `eddef28` | `3de850f729375b376f5bd747e13a1627e27d879c` ✅ |
| original `6641943` | `9453c83abef40843e3d1c32c5cb947f0507b0ec4` |
| picked `ba894c4` | `9453c83abef40843e3d1c32c5cb947f0507b0ec4` ✅ |

Byte-faithful in both cases.

---

## 3. Dim-0 — mutation ledger

Baseline before every mutation: **105 passed | 1 skipped (106)**, 2 files, exit 0.

| # | mutation | file | mutated sha256 | result | RED at |
|---|---|---|---|---|---|
| **MUT-DRIFT** (mandated) | mark a mismatched partition valid (`positionalPartsValid = true` in the drift branch) | bridge.ts | `b12ecac780269d1cc440b2670e2a7a4f1843edf718ca3fc4f57d2b5e94e76053` | **RED** 1F/104P | **`bridge.test.ts:1255`** |
| MUT-IDEMPOTENT | `new Set(positionalPartsValid ? persistedParts : [])` → `new Set<number>()` | bridge.ts | `03631262528f4da0c744c7850580742208b2e52bd893f0677bce00b612ad82fb` | **RED** 1F/104P | `bridge.test.ts:1204` |
| MUT-RETRY | delete the bounded transient retry send | bridge.ts | `bacde43b6034cd66e48166597487e7c87a85a5de2184cb731266bbc344eaedf5` | **RED** 2F/103P | `bridge.test.ts:1157` (via `:1195`) |
| MUT-LOGID | drop `part N/M` from the forwarded log | bridge.ts | `c23d5b5946336d9f7915fafff1e9b2546d88387fc572c36c1c0d56af96914668` | **RED** 1F/104P | `bridge.test.ts:1124` |
| MUT-WRITEONCE (mine) | `INSERT OR IGNORE` → `INSERT OR REPLACE` | sqlite-queue.ts | `10766bb918b257815ad3a4eac2a38038aa1ded3da0a002a64069a8da296215f4` | **RED** 1F/104P | `sqlite-queue.test.ts:140` |
| MUT-LEGACY (mine) | record an identity even when marks already exist | bridge.ts | `7b989faae1678b8a6cf1d80f70b172c457e76c686a69a5959296f4af8141e703` | **RED** 1F/104P | `bridge.test.ts:1285` |
| MUT-PARTCOUNT (mine) | `partCount` always `0` | bridge.ts | `9b3c58764d4ccf9fac72145e6d46e801edbeb13569b7535404961f89f9352ef6` | **RED** 1F/104P | `bridge.test.ts:1243` |
| **MUT-PREFIXLEN** (mine) | compare `partCount` only, drop `prefixLength` | bridge.ts | `1c3973f0dc940391092a73642bd8093cad784db7636ed20fd885019242ce719c` | **GREEN 105P** | **UNSENSORED → ADV-1** |
| **MUT-NOMARK** (mine) | remove the `if (positionalPartsValid)` gate on marking | bridge.ts | `2d046ff82377d677d5ee851874fc1b4ca50fce1e7beb1e8197b91d624cbf9986` | **GREEN 105P** | **UNSENSORED → ADV-2** |

Every mutation restored to the pristine sha; the harness asserted it.

### 3.1 Line-claim accuracy — correct, for once

Packet claimed MUT-DRIFT REDs at `bridge.test.ts:1255`. Measured:

```
AssertionError: expected [ Array(1) ] to have a length of 2 but got 1
 ❯ .pi/extensions/pij/telegram/bridge.test.ts:1255:27
```

Line 1255 is `expect(redeliverySent).toHaveLength(2);`. **Claim correct.** And the
failure mode is exactly the one the fold exists to prevent: under the mutant the
redelivery sends **1** of the 2 recomputed parts — the tail loss returns.

### 3.2 The item-24 base guards survive the fold

MUT-IDEMPOTENT, MUT-RETRY and MUT-LOGID are all still RED-able at their original
sites. Same-partition idempotency is intact — confirmed independently by probe P4
(§5.4), where a no-drift redelivery re-sent **1** part, not 3.

---

## 4. What the fold actually changes

`sqlite-queue.ts` (+38): a `TelegramPartitionIdentity` type, an additive
`telegram_partitions` table, a reader `telegramPartitionIdentity()`, and a
write-once `recordTelegramPartitionIdentity()` (`INSERT OR IGNORE`, with an
integer/non-negative guard that throws).

`bridge.ts` (+42/−6): `forwardOne` now hoists `initialText`, computes
`currentPartition = {partCount, prefixLength}`, and resolves a tri-state:

* **no stored identity + no stored marks** → record today's identity, skip-set valid;
* **no stored identity + marks present** (legacy) → **send all**, record nothing;
* **stored identity matches on BOTH fields** → skip-set valid (item-24 behaviour);
* **stored identity mismatches** → log `partition drift …; sending all`, skip-set
  discarded, and **no new marks written**.

The three deleted production lines at the tail are a pure hoist of the
`normalizeSenderContent(...)` expression into `initialText`; same inputs, same value.

---

## 5. Dim-1 — every claim tested by execution

I built position-encoded bodies (each 10 chars a unique zero-padded index) so I
could measure **exact byte coverage of the operator's phone**, not part counts.
A part-count assertion cannot distinguish "2 parts arrived" from "2 parts arrived
and 84 bytes fell between them".

### 5.1 Dim-1 #1 — drift → send-all, zero loss. **Confirmed, and confirmed to be the FOLD's doing.**

The packet asks me to confirm this is the fold's behaviour and not the base's. I
ran the identical probe in both trees:

| probe | fold (`ba894c4`) | **base — item-24 alone (`eddef28`)** |
|---|---|---|
| **P1** 8100 chars, prefix 96→12 (3 parts → 2) | **8100/8100 — ZERO LOSS** | **8016/8100 — LOST 84 chars @ 3993..4076** |
| **P2** 7000 chars, prefix 96→12 (2 parts → 2) | **7000/7000 — ZERO LOSS** | **6916/7000 — LOST 84 chars @ 3993..4076** |
| P3 reverse (prefix 12→96) | 8100/8100 | 8100/8100 |
| P4 no drift | 8100/8100 | 8100/8100 |

Row state `acked` in every case — which is what makes the base's behaviour *silent*
loss rather than a visible failure. P3/P4 identical across both trees confirms the
fold changes **only** the drift path.

### 5.2 Dim-1 #2 — write-once. **Confirmed three ways.**

1. Shipped unit test: record `{3,96}` then `{2,13}` → reads back `{3,96}`, survives
   a close/reopen.
2. MUT-WRITEONCE (`INSERT OR IGNORE` → `INSERT OR REPLACE`) → **RED** at
   `sqlite-queue.test.ts:140`.
3. **Live through the bridge** (P1): after a full redelivery under the *drifted*
   short prefix, the stored identity was still `{"partCount":3,"prefixLength":96}` —
   the original. A drifted redelivery does not clobber the identity, so drift stays
   detectable on every subsequent pass.

### 5.3 Dim-1 #3 — legacy safety. **Confirmed by building the DB with the base branch's own code.**

I did not simulate a legacy DB; I created one with `eddef28`'s `SqliteQueue`,
closed it, and reopened it with the candidate's:

```
BASE tables               : cursors,deliveries,messages,receipts,telegram_sent_parts
BASE has partitions table?: false
BASE sent parts           : [0]
--- reopened with the FOLD build ---
CANDIDATE open error      : (none)
CANDIDATE tables          : cursors,deliveries,messages,receipts,telegram_partitions,telegram_sent_parts
CANDIDATE added partitions: true
legacy sent parts preserved: [0]
legacy identity           : undefined
legacy row forwarded      : ["[pij-osn81b] legacy body from base build"]
row state                 : acked
=> legacy behaviour       : SEND-ALL (no silent loss)
```

The `CREATE TABLE IF NOT EXISTS` re-exec on every open migrates in place. The
pre-existing mark `[0]` is preserved but correctly *ignored*. MUT-LEGACY (recording
an identity even when marks exist) REDs at `bridge.test.ts:1285`. Migration-safe.

### 5.4 Dim-1 #4 — same-partition unchanged. **Confirmed.**

P4 (no drift): first pass sent 2 of 3 parts, redelivery sent **1**. The skip fired;
no regression to noisy-dup in the common case. MUT-IDEMPOTENT still REDs.

### 5.5 Dim-1 #5 — schema additive, fs untouched. **Confirmed.**

* `telegram_partitions` is a new table only; no existing table altered.
* FK target is sound: `messages.id` is `TEXT NOT NULL UNIQUE`, and
  `PRAGMA foreign_keys=ON` is set before `SCHEMA` is exec'd. The new FK matches the
  pattern `telegram_sent_parts` already uses.
* `CHECK(part_count >= 0)` / `CHECK(prefix_length >= 0)` are unreachable by code —
  `recordTelegramPartitionIdentity`'s own guard throws first (INFO-4).
* **fs backend measured, not assumed**: an `FsChannel` forward of an 8100-char body
  sent 2 parts, **8100/8100 covered**, no crash. `sqliteOf()` returns `undefined`,
  so the entire identity block is skipped and marking was already a no-op.

### 5.6 Dim-1 #6 — no collateral. See §6.

### 5.7 My own question: is the *whole* identity load-bearing? (→ ADV-1)

The shipped drift test changes `partCount` **and** `prefixLength` together, so it
cannot attribute the fix to either field. I split them.

Choose a body where the part count is *stable* across the prefix change:
budget(prefix 96) = 3999, budget(prefix 12) = 4083. For 7000 chars both give
**2 parts** — but the boundaries move (3993 vs 4077).

* Real code: `prefixLength` 96 ≠ 12 → drift → send-all → **7000/7000**.
* MUT-PREFIXLEN: `partCount` 2 == 2 → "valid" → positional skip → **6916/7000,
  84 chars lost at 3993..4076**, row acked.

And the suite stays **fully GREEN (105 passed)** under that mutant. The
`prefixLength` comparison is the only thing standing between the operator and a
silent 84-byte hole in this scenario, and nothing tests it.

### 5.8 My own question: why gate the *marking*? (→ ADV-2)

The two-pass probes could not distinguish MUT-NOMARK from the real code. It needs
three passes, because the damage is marks written under partition B being *believed*
under partition A later:

P5 — pass 1 under prefix A (short, 2 parts) fails entirely; pass 2 drifts to
prefix B (long, 3 parts) and only part 1/3 lands; pass 3 drifts back to A.

| | pass 3 delivered | coverage | verdict |
|---|---|---|---|
| real code | 2 parts | **8100/8100** | ZERO LOSS |
| MUT-NOMARK | 1 part | **8016/8100** | **LOST 84 chars @ 3993..4076** |

Under the mutant, pass 2 wrote mark `0` while operating under B's partition; on
pass 3 that mark was read as if it meant A's part 0, which was never sent. Row
acked. The `if (positionalPartsValid)` gate is genuinely load-bearing — and, again,
the suite is **fully GREEN** without it.

### 5.9 My own question: does the identity cover everything indexed? (→ ADV-3)

No. `nextTextPartIndex` is shared across **every** `sendText` call in `forwardOne`
— the body, oversize-attachment notices, and the caption-too-long fallback — but
`currentPartition.partCount` counts **only the body's** parts. Measured (P8: short
body + one oversized attachment):

```
identity : {"partCount":1,"prefixLength":12}   <- body only
marks    : [0,1]                                <- index 1 is attachment-derived text
```

Body content is safe: its index range `0..partCount-1` is pinned by the identity.
Attachment-derived text is not.

---

## 6. Gates and no-collateral

| gate | tree | result |
|---|---|---|
| fence suites (`bridge.test.ts` + `sqlite-queue.test.ts`) | candidate | **105 passed / 1 skipped**, exit 0, 3.39 s |
| `tsc --noEmit` | candidate | **exit 0** |
| `biome check --max-diagnostics=200` (4 fence files) | candidate | **exit 0**, "Checked 4 files… No fixes applied" |
| full suite | candidate | **4676 passed / 1 failed / 19 skipped**, 235 files, 202.4 s |

**The 1 failure is pre-existing and outside the fence**, proven rather than asserted:

* `harness/scripts/release-age-policy.test.ts:196` → `Error: spawnSync pwsh ENOENT`.
* Run on the **fresh-main tree at `a818b6c9`**: `1 failed | 9 passed` — identical.
* `which pwsh` → absent on this machine.
* `grep -c "pwsh\|release-age"` on all four fence files → **0, 0, 0, 0**.

### 6.1 Structural no-collateral (E17) — two independent methods

**Declaration list** (`npx vitest list` in both trees, `comm`-diffed):

```
base (eddef28) : 102 declarations
fold (ba894c4) : 105 declarations
REMOVED        : (none)
ADDED          : 3
  sqlite-queue.test.ts > … > persists the first Telegram partition identity without overwriting it
  bridge.test.ts > … > legacy sent-part rows without partition identity degrade to send-all
  bridge.test.ts > … > partition drift sends every recomputed part and preserves the full tail
```

**Line diff** — a declaration diff is blind to assertions deleted from a *surviving*
test, so it is paired with a raw deletion scan:

```
deleted lines in the two test files : (none at all)
deleted `expect(` in tests          : 0
deleted `it(`/`test(` in tests      : 0
deleted production lines            : 6, all accounted for
```

All six production deletions reappear in modified form: the `sentPartIndices`
construction, the two marking lines (now gated), and the three-line `textPartCount`
ternary (hoisted verbatim into `initialText`). Nothing removed or weakened.

---

## 7. Advisories

### ADV-1 — the `prefixLength` half of the identity has no test, and deleting it loses 84 bytes *(highest value)*
**Severity: medium (ratchet gap, not a shipped defect).**
MUT-PREFIXLEN leaves the suite fully GREEN (105 passed) while re-opening silent
loss — measured 84 chars on a 7000-char body (§5.7). The shipped drift test moves
`partCount` and `prefixLength` together, so it passes under a `partCount`-only
implementation. **Recommend**: one test with a body whose part count is *stable*
across the prefix change (7000 chars, context present → absent) asserting send-all
and full reassembly. That is the test that pins *why* the identity has two fields.

### ADV-2 — the no-mark-on-drift gate has no test, and deleting it loses 84 bytes
**Severity: medium (ratchet gap).**
MUT-NOMARK also stays fully GREEN. It needs a three-pass A→B→A sequence with a
partial success in pass 2 to expose (§5.8). **Recommend**: encode P5 as a test —
it is the only thing that distinguishes "discard the skip-set" from "discard the
skip-set *and* don't pollute it".

### ADV-3 — the partition identity covers only the body's parts, but the index space is shared
**Severity: low–medium; body content is not at risk.**
`partCount` counts body bubbles only, while `nextTextPartIndex` also numbers
oversize notices and the caption-too-long fallback (§5.9, measured `partCount:1`
vs `marks:[0,1]`). If attachment state drifts between passes — a file grows across
an upload cap, or `sizeOf` throws because the file was deleted — the attachment-text
indices shift *underneath an identity that still matches*, and the wrong
attachment-derived bubble is skipped. **User-authored caption text** goes through
that same `sendText`, so this is not purely derived text. Body content remains safe
because its index range is pinned by `partCount`. **Recommend**: either fold the
attachment count into the identity, or scope the skip-set explicitly to
`index < partCount`. The latter is a one-line change and closes it completely.

### ADV-4 — legacy rows never acquire an identity, so they send-all forever
**Severity: low; within the ruling (dup ≫ loss), but unbounded.**
The identity is recorded only when `persistedParts.size === 0`. A row that already
carries pre-fold marks therefore never gets one — measured (P6): after a *complete,
successful* forward the identity is still `undefined`. Every future redelivery of
that row re-sends every part. Correct by the ruling, but the degradation is
permanent rather than one-shot. **Recommend**: consider recording the identity
after a fully-successful send-all pass, which converts the row to the normal regime
without ever trusting the stale marks.

---

## 8. INFO

- **INFO-1** — the coder-claimed Dim-0 line (`bridge.test.ts:1255`) is **correct**,
  and the mutation's failure mode is precisely the regression it names. Worth
  recording: the previous several packets in this series had wrong line claims.
- **INFO-2** — `currentPartition.partCount` calls `prefixedTextParts()` on every
  message even when `sqlite === undefined` (fs backend) or when the identity will
  not be consulted. One extra `chunk()` pass per message; negligible, noted only
  because it is work done before it is known to be needed.
- **INFO-3** — the drift log line is well-formed and diagnosable: it prints stored
  vs current `partCount/prefixLength` and the action taken (`sending all`). This is
  the observability that would have made the seq-3263 incident self-explaining.
- **INFO-4** — `recordTelegramPartitionIdentity` throws on non-integer/negative
  input. Unreachable by construction (`Array.length` and `String.length` are always
  non-negative safe integers). Were it ever reached on the sqlite path, `forwardOne`'s
  caller treats a throw as a delivery failure (nack/retry), not a crash. On the fs
  path the call site is unreachable (`sqlite === undefined`). No new crash exposure
  to the live channel. **Not executed** — see §1 limit 3.
- **INFO-5** — `telegram_partitions` cascades on message delete; `telegram_sent_parts`
  uses the same `REFERENCES messages(id) ON DELETE CASCADE`. The two side tables are
  consistent with each other, so a purge cannot leave an identity without its marks
  or vice versa.
- **INFO-6** — main drifted 21 commits past the candidate's merge-base during this
  review. It does not touch the fence, but it *does* touch `telegram/index.ts`,
  which is where the prefix-drift source (`resolveRepositoryContext`) lives. Worth a
  glance before merge that item-29's changes there did not alter prefix stability
  assumptions; **I did not check that** — it is outside the fence.

---

## 9. Teardown

- `/tmp/pij-i24f`, `/tmp/pij-i24f-base`, `/tmp/pij-i24f-main` removed with
  `git worktree remove --force`; `git worktree list` verified back to the
  legitimate set.
- Probe files (`i24f-probe.mts`, `i24f-probe2.mts`, `i24f-probe3a.mts`,
  `i24f-probe3b.mts`) deleted from inside the trees, and
  `git status --porcelain` verified **empty in both trees** *before* the
  no-collateral and gate runs.
- Mutation harness `/tmp/i24f-mut.py`, list captures, and the migration home
  `/tmp/i24f-migration-home` removed.
- All four fence files sha-verified pristine at exit ("ALL FENCE FILES PRISTINE AT
  EXIT").
- No branch checked out, no commit, no push. The only repo write is this file.

---

## 10. Bottom line

**APPROVE the fold.** It is a correct, minimal, migration-safe fix to a real silent
data-loss bug, and I proved the loss and its removal by running the same probe
against the base and the candidate: **84 bytes lost on the base, zero on the fold**,
in two independent drift shapes. Item-24's idempotency survives intact.

The one thing I would not want lost in the merge: **the fold's correctness rests on
two guards that no test defends** (ADV-1, ADV-2), and I measured 84 bytes of silent
loss behind each. The code is right today. Adding those two tests is what stops it
from quietly becoming wrong tomorrow — and both probes already exist in this report
in runnable form.

**This pass is CLOSED.** No further mutation or verification will be run on item-24
or its fold by me.
