# Item-24 fold HARDENING — cold re-confirm

**TERMINAL REPORT.** This pass is CLOSED. No mutation was run against any
repository file after this file was written; the only work that followed was a
**read-only** full-suite run (already in flight when this was written) and one
read-only baseline run in a throwaway worktree, both recorded in §6.1.
Everything below was produced by execution in throwaway worktrees, all of which
are torn down (§9).

**Reviewer**: `pij-wilful-morton` (cold) · **Dispatched by**: `pij-falling-outside`
**Packet**: `docs/plans/392-day3-codex-doctrine/reviews/item-24-hardening-reconfirm-packet.md`
**Candidate**: `588dd0ee957f71c0f57bc2cf6d12d1a52d12b55c`
**Chain**: `a27ab58` → `6641943` → `588dd0e`, cherry-picked onto fresh `origin/main`

---

## VERDICT: ✅ **APPROVE** — with two advisories, one of which I recommend closing before merge

The hardening does **exactly** what the packet claims. Both guards I reported as
fully-unsensored on the fold are now genuinely sensored — and I proved it
differentially rather than by reading: the *same two mutations*, byte-for-byte,
are **GREEN on the pre-hardening tree and RED on the candidate**. Both mandated
RED lines are **exact** (1335, 1397) — the first packet in this series where
neither claimed line needed correcting.

Two things o-prime should rule on before merge:

- **ADV-1 (recommend fixing)** — T011's `index < partCount` filter closes ADV-3 but
  **costs the attachment/fallback path its idempotence**. I measured a
  **duplicate attachment notice delivered to the operator** on the candidate where
  the pre-hardening tree delivered one. Given item-24's headline is *"stop the dup
  on the operator's phone (seq 3263)"*, a change that re-introduces a dup in a
  neighbouring path deserves an explicit decision rather than a silent trade.
  Reachability is bounded (§7.1) — it needs the text-fallback path, not the
  normal media path.
- **ADV-2 (advisory)** — the **`partCount` half** of the composite guard is now the
  unsensored one (MUT-PARTCOUNT is GREEN), and it is **not redundant**: I
  constructed a case where `prefixLength` is equal and `partCount` differs, and
  measured **81 characters silently lost with the row `acked`**. This is the exact
  mirror of the ADV-1 that this hardening just closed.

Neither advisory undermines the hardening's stated purpose. Both are new
findings produced by this pass, not regressions in what was asked for.

---

## 1. Scaffolding, and the limits of this pass — stated before the findings

**What I built.** Four throwaway worktrees, all `--detach`, each with a
`node_modules` symlink to `~/GitHub/pij`:

| tree | contents | role |
|---|---|---|
| `/tmp/pij-i24h` | fresh main + `a27ab58` + `6641943` + `588dd0e` | **candidate** (primary) |
| `/tmp/pij-i24h-fold` | fresh main + `a27ab58` + `6641943` | **pre-hardening control** |
| `/tmp/pij-i24h-asis` | `588dd0e` as committed | fidelity cross-check |
| `/tmp/pij-i24h-main` | `origin/main` `0120c8da` | baseline |

Plus `/tmp/i24h-mut.py` (mutation harness), `/tmp/i24h-byte.py` (second-order
assertion harness), and four `.mts` probes written inside the candidate tree and
deleted afterwards.

**Pristine fence shas (candidate, verified before and after every mutation):**

```
bridge.ts            c3519c85eded3dd3d9e28b0129c5deab657a8e02b3e2bc08d9f2d94b15b083da
bridge.test.ts       4c7dfabb3e7024ee33bed1b57e71ca8394f914abc9108d57b172445c19372c6f
sqlite-queue.ts      92aa2e7be6ea37c2881785d5e6952ff611272ceaa97665e69c19bc02617502ee
sqlite-queue.test.ts 946be27c679017107a80728b70f49990c17c5e6aa170af143e5122defc7d817f
```

`sqlite-queue.ts` and `sqlite-queue.test.ts` are **byte-identical to the shas I
recorded reviewing the fold** — independent corroboration that the hardening
touched neither.

### What I did NOT examine — a gate I did not look at must not read as a clean one

- **No live Telegram send.** Every measurement is against `SqliteQueue` +
  `startForwarder` with an injected `send`. The real Bot API is unexercised.
- **No concurrency.** Single-forwarder, single-process only. I did not probe two
  forwarders racing on the same row, nor `recordTelegramPartitionIdentity`
  under concurrent writers.
- **`DualWriteChannel` never exercised** (carried from both prior passes).
- **The `sendMedia` failure path is not mine and I did not chase it.** In §7.1's
  media variant I observed that a failed media attachment was *not* retried on
  redelivery (`pass2` empty, row `acked`). That is outside this fence and appears
  pre-existing. **I did not investigate it and make no claim about it** — I record
  it only so it is not mistaken for something I cleared.
- **Reachability of ADV-2 in production is argued, not observed.** I proved the
  case is *constructible* and measured its cost; I did **not** demonstrate that a
  pij message body arrives pre-prefixed with a stale sender prefix in practice.
- **`chunk`'s boundary-preference logic is untested by my probes for non-homogeneous
  bodies.** My byte probes used homogeneous or index-encoded payloads; a body with
  newlines/spaces takes the `splitOnBoundary` branch, which I did not vary.

---

## 2. Branch shape and cherry-pick fidelity

**Do not trust a packet's stated base.** Re-derived first:

- `git merge-base origin/main 588dd0e` = `10483d8e22f923a3683de7bf285ea3b5ffa1b04a`
- `origin/main` = `0120c8dafc7afdfbea5eeb6f1bc5b6c710171eda` — **99 commits ahead** of
  the merge base (it was `a818b6c9`, then `6aa12c34`, now this; main has moved
  three times during this review series).
- `588dd0e` is 102 commits from the merge base, but only **three** are code:
  `a27ab58`, `6641943`, `588dd0e`. The rest are docs/packets/other items.

**Does main's drift touch the fence?** No, for code:

```
git diff --stat 10483d8e..origin/main -- <the 5 item-24 files>
 docs/specs/claude-copilot-sqlite-sockets-comms.md | 721 ++++++++++
```

`bridge.ts`, `bridge.test.ts`, `sqlite-queue.ts`, `sqlite-queue.test.ts` are
**untouched on main** since the merge base. Only the spec doc drifted.

**All three cherry-picks applied cleanly, and all three are byte-faithful:**

| original | picked | `git patch-id --stable` |
|---|---|---|
| `a27ab58` | `7a801a9` | `3de850f729375b376f5bd747e13a1627e27d879c` — IDENTICAL |
| `6641943` | `9c98755` | `9453c83abef40843e3d1c32c5cb947f0507b0ec4` — IDENTICAL |
| `588dd0e` | `afd07c4` | `4169139a4cf8a78ff97c5aef82255bda4c25ce43` — IDENTICAL |

**And the resulting fence is byte-identical to the as-committed tree**, which is
the stronger statement (patch-id certifies the *diff*; this certifies the
*result*):

```
bridge.ts            SAME  c3519c85eded3dd3 / c3519c85eded3dd3
bridge.test.ts       SAME  4c7dfabb3e7024ee / 4c7dfabb3e7024ee
sqlite-queue.ts      SAME  92aa2e7be6ea37c2 / 92aa2e7be6ea37c2
sqlite-queue.test.ts SAME  946be27c67901710 / 946be27c67901710
```

So the candidate tree **is** `588dd0e` for everything this review touches. I did
not need to fall back on the as-is tree as primary evidence.

**Baseline**: `108 passed | 1 skipped` across the two fence test files
(pre-hardening was `105 | 1` — exactly +3, the three new tests).

---

## 3. Dim-0 mutation ledger

Harness invariants (each earned in an earlier pass): refuse unless the fence is
pristine; refuse unless the anchor is **unique**; refuse a no-op replacement;
print the mutated sha; restore from bytes captured by the harness itself, never
from git; re-verify pristine after restore. The uniqueness invariant earned its
keep again here — see §3.3.

### 3.1 The two mandated mutations — both RED, both at the EXACT claimed line

| mutation | mutated `bridge.ts` sha256 | verdict | RED at | claimed |
|---|---|---|---|---|
| **MUT-PREFIXLEN** | `7e758664f7e097d0a1c33255115576f3e5421cd383f7cd329576443587d8515e` | **RED** | `bridge.test.ts:1335` | 1335 ✅ **exact** |
| **MUT-NOMARK** | `9b4ad56f567fa72e40fad18420adaaf47c0e0ebeec4fbfa41a2fcc0268ffc7b9` | **RED** | `bridge.test.ts:1397` | 1397 ✅ **exact** |

- **MUT-PREFIXLEN** = drop the `prefixLength` conjunct, compare `partCount` only.
- **MUT-NOMARK** = replace `if (positionalPartsValid) { … }` with an unconditional
  block, so marks are written even under drift.

Both claimed lines land on real assertions and both matched. Worth saying
plainly: on the three prior packets in this series the claimed lines were wrong
(item-29b's were both off by 2). These two are right.

### 3.2 The differential — this is the proof that the hardening is what changed

The same two mutations, run by the same harness against the **pre-hardening**
tree:

| mutation | tree | mutated sha256 | verdict |
|---|---|---|---|
| MUT-PREFIXLEN | pre-hardening `6641943` | `1c3973f0dc940391092a73642bd8093cad784db7636ed20fd885019242ce719c` | **GREEN (unsensored)** |
| MUT-PREFIXLEN | candidate `588dd0e` | `7e758664…` | **RED @1335** |
| MUT-NOMARK | pre-hardening `6641943` | `1b5a50e6ff9ba410d988d2e06adfdc38fe18a7c5306b1e983af28da4f5395644` | **GREEN (unsensored)** |
| MUT-NOMARK | candidate `588dd0e` | `9b4ad56f…` | **RED @1397** |

Two corroborations worth recording:

1. The pre-hardening tree's pristine shas came back
   `bridge.ts af0d7822…` / `bridge.test.ts 87a1e116…` — **exactly** the shas in my
   fold review. Different session, different worktree, same bytes.
2. The MUT-PREFIXLEN mutated sha on that tree,
   `1c3973f0dc940391092a73642bd8093cad784db7636ed20fd885019242ce719c`, is
   **character-for-character the sha I published in the fold review**. The GREEN
   result is reproducible to the byte.

(The MUT-NOMARK sha differs from my fold review's `2d046ff8…` because I used a
different but equivalent mutation form this time — a bare block rather than the
earlier variant. Recording that so the two ledgers can be reconciled.)

### 3.3 T011 / ADV-3 — sensored, and it is the *only* production change

| mutation | mutated `bridge.ts` sha256 | verdict | RED at |
|---|---|---|---|
| **MUT-T011** (revert the filter) | `af0d7822dba33761c0264c97028d0345518f6c6a7613c6bf7097a38d40797ebe` | **RED** | `bridge.test.ts:1432` |

Note the sha. `af0d7822…` **is the pre-hardening `bridge.ts` sha**. Reverting the
`index < partCount` filter reproduces the fold's `bridge.ts` byte-for-byte, which
proves — without reading a diff — that T011 is the hardening's *entire*
production delta.

### 3.4 Prior guards survive

| mutation | mutated sha256 | verdict | RED at |
|---|---|---|---|
| MUT-DRIFT | `d90a442295ba6e0a233815d2c30191c661ea6e01f722449cf93fcfd54fa428d7` | RED | `1255`, `1335`, `1397` |
| MUT-IDEMPOTENT | `52bf2bcdc06087caad61a545461f504708a60c1f67b7e573339e4d4f673859e3` | RED | `1204` |
| MUT-RETRY | `0eb61a06fae125fff085110d84c3eeb38a2e7c898b3455232a3e5a1688656bed` | RED | `1157` (via `1195`, `1323`, `1378`) |
| MUT-LOGID | `b1dd7d1f494c4c907e615decaf2dd872cb32f1fd4ce7082f8cc879cd7db23146` | RED | `1124` |
| MUT-LEGACY | `ad44d725be3571d5bd0b60effc4b85d590d2ea1255fd5f15ec6b204b5e62743d` | RED | `1285` |

All five prior guards RED-able. MUT-DRIFT now REDs **three** tests instead of one
— the two new tests strengthen the original guard as a side-effect.

### 3.5 The one GREEN — MUT-PARTCOUNT (see ADV-2)

| mutation | mutated sha256 | verdict |
|---|---|---|
| **MUT-PARTCOUNT** (drop `partCount`, compare `prefixLength` only) | `9525a31d0b3877f4fa8656b7a9f128cd0deae998648f5848eb94b10f1ee4bc71` | **GREEN — 108 passed** |

A GREEN mutation is a lead, not a finding. §7.2 measures what it lets back in.

### 3.6 Second-order check — do the tests guard BYTES or only COUNTS?

This matters more than usual here, because the *substance* of my fold ADV-1 was
that `toHaveLength(2)` cannot distinguish "2 parts arrived" from "2 parts arrived
and 84 bytes fell between them". So I deleted each new test's **count** assertion
and re-ran the production mutation, leaving only the
`reassemblePrefixedText(...)).toBe(body)` assertion standing:

| case | mutated test sha256 | verdict |
|---|---|---|
| T009 with line 1335 deleted + MUT-PREFIXLEN | `8a6248844071b18dc3b1560743c580d635179624e5b50014539b07166794d86c` | **RED** @1335:67 |
| T010 with line 1397 deleted + MUT-NOMARK | `d38be98953d7935ae0918aea7490e85aa1c3be1ee97a78d6d5be92fde6ed9136` | **RED** @1397:62 |

**Both byte assertions are independently load-bearing.** The tests do not merely
count bubbles; strip the count and the reassembly still catches the loss. This is
the specific thing I asked for on the fold, and it is present.

---

## 4. What actually changed

`588dd0e` touches **two files** — nothing else:

```
.pi/extensions/pij/telegram/bridge.test.ts | 150 ++++++++++++++++++
.pi/extensions/pij/telegram/bridge.ts      |   6 +-
```

**Production (`bridge.ts`), one line replaced:**

```diff
-		const sentPartIndices = new Set(positionalPartsValid ? persistedParts : []);
+		const sentPartIndices = new Set(
+			positionalPartsValid
+				? [...persistedParts].filter((index) => index < currentPartition.partCount)
+				: [],
+		);
```

**Tests, purely additive** (150 insertions, **0 deletions**): T009
`stable-count prefix drift still sends every recomputed part`, T010
`A-B-A drift never records mismatched B positions as A sent parts`, T011
`never applies body sent-part indices to attachment fallback text`.

---

## 5. Dim-1 — answered by execution, not by reading

### 5.1 Does T009 truly have a STABLE partCount and a DIFFERENT prefixLength?

**Yes — measured.** The partition arithmetic is
`budget = 4096 − prefix.length − 1`, then `chunk()` reserves a further `(i/n) `
counter (6 chars at these sizes):

| prefix | length | budget | body 7000 → parts | first boundary |
|---|---|---|---|---|
| `BUDGET_PREFIX` (`[pij-osn81b] [repo/bbb…]`) | 96 | 3999 | **2** | 3993 |
| tag only (`[pij-osn81b]`) | 12 | 4083 | **2** | 4077 |

`partCount` is **equal (2)**; `prefixLength` differs 96 vs 12; the first boundary
moves by **84 characters**. So a `partCount`-only implementation calls the
partition identical, skips index 0 on the assumption it covered `0..4077`, when
in fact only `0..3993` was ever sent — orphaning 84 characters. That is precisely
the 84-byte loss I measured on the fold, and T009 is shaped to catch it.

**And it catches what the original drift test could not — proven by isolation.**
Under MUT-PREFIXLEN, vitest reports `88 tests | 1 failed`:

```
✓ partition drift sends every recomputed part and preserves the full tail
× stable-count prefix drift still sends every recomputed part
```

The **original** drift test passes; only T009 fails. The two tests share
byte-identical trailing assertions (lines 1255/1256 and 1335/1336 are the same
two lines) — what makes T009 a *new* sensor is entirely its setup. Confirmed.

### 5.2 Does T010 measure byte coverage across a genuine 3-pass cycle?

**Yes.** The partitions are a real A→B→A:

| pass | context | prefix len | body 8100 → partCount | identity |
|---|---|---|---|---|
| 1 | none | 12 | **2** | recorded `{2, 12}` |
| 2 | `BUDGET_CONTEXT` | 96 | **3** | drift vs `{2,12}` → send-all, mark nothing |
| 3 | none | 12 | **2** | matches `{2,12}` again |

The test asserts pass 2 reaches `(2/3)` successfully (`pass2Attempts === 5`:
2 failed attempts + 1 success + 2 failed attempts) — so pass 2 genuinely has a
**partial** success, which is the only shape that can contaminate. Then pass 3
must send **both** parts and reassemble to the full 8100-char body.

Byte coverage is guarded independently of arity — §3.6 proved the
`toBe(body)` assertion REDs on its own with the count assertion removed.

### 5.3 T011 — is out-of-range-index text protected, and is body behaviour unchanged?

**Protected: yes.** MUT-T011 REDs at `bridge.test.ts:1432`.

**Body-part behaviour unchanged: yes.** Two independent lines of evidence — MUT-T011
REDs *only* T011 (no body test changes behaviour when the filter is reverted), and
the full fence suite is 108 passed with every pre-existing body test green.

**But the attachment path's behaviour DID change, in a direction the packet does
not mention.** See ADV-1 (§7.1) — this is the finding of this pass.

### 5.4 No collateral (E17) — two methods, because one is blind

**Declaration diff** (`npx vitest list`, sorted, `comm`), pre-hardening vs candidate:

```
candidate declarations: 108
pre-hardening         : 105
REMOVED: (none)
ADDED  : stable-count prefix drift still sends every recomputed part
         A-B-A drift never records mismatched B positions as A sent parts
         never applies body sent-part indices to attachment fallback text
```

**Line diff**, because a declaration diff cannot see an assertion deleted from a
*surviving* test:

- `bridge.test.ts`: **0 deleted lines** — purely additive. No surviving test lost
  an assertion.
- `bridge.ts`: exactly **1** deleted line (the `sentPartIndices` line shown in §4).
- `git show --name-only 588dd0e`: **2 files**, both in the fence.

No collateral.

---

## 6. Gates

Run in `/tmp/pij-i24h` (fresh-from-main + the three picks — the tree shape E35
sanctions for full-suite gates), with a clean `git status`:

| gate | result |
|---|---|
| `npx tsc --noEmit` | **exit 0** |
| `npx biome check` (4 fence files) | **exit 0**, "Checked 4 files… No fixes applied" |
| `npx vitest run bridge.test.ts sqlite-queue.test.ts` | **108 passed \| 1 skipped** |

I deliberately did **not** run gates on the stream worktree — the packet warns it
is a frankenstein with `cli.integration` RED because `cli.ts` is behind main, and
I take that at the packet's word rather than confirming it (stated as a limit).

### 6.1 Full suite — run, and the one failure run down

Because my tree is exactly the fresh-from-main shape E35 sanctions for full-suite
gates, I ran the whole suite rather than only the fence:

```
Test Files  1 failed | 231 passed | 4 skipped (236)
     Tests  1 failed | 4698 passed | 19 skipped (4718)
```

The single failure is **environmental and pre-existing, not the item**:

```
FAIL harness/scripts/release-age-policy.test.ts
  > restores the Windows caller environment even when a governed command fails
Error: spawnSync pwsh ENOENT
```

`which pwsh` → **not installed** on this macOS machine. I did not stop at that
inference — I ran the same file against the **unmodified `origin/main`** baseline
worktree and got the identical failure, so it is reproducible without any
item-24 code present. It touches none of the four fence files.

**Everything else in the repository is green with the item-24 chain applied:
4698 passed.**

---

## 7. Advisories

### 7.1 ADV-1 — T011 costs the attachment path its idempotence (recommend closing before merge)

Attachment fallback text is emitted through the **same** `sendText` /
`nextTextPartIndex` space as the body, so its marks necessarily live at indices
`>= partCount` — which is exactly the set T011's filter now discards. Marks for
attachment bubbles are therefore no longer honoured on redelivery.

**Measured**, identical scenario on both trees (body + two attachments, the
second notice fails, row stays claimed and is redelivered):

| tree | pass 1 sent | pass 2 sent | alpha notice total |
|---|---|---|---|
| **pre-hardening `6641943`** | body, notice-alpha | notice-beta | **1** — correct |
| **candidate `588dd0e`** | body, notice-alpha | **notice-alpha**, notice-beta | **2 — DUPLICATE** |

Both runs recorded `partition {"partCount":1,"prefixLength":12}` with
`marks after pass1: [0,1]`, and both acked. The body bubble is *not* duplicated
(index 0 < partCount 1, so it survives the filter) — only the attachment notice is.

**Why this matters more than its size suggests**: item-24 exists to stop a
duplicate reaching the operator's phone (seq 3263). This change re-introduces a
duplicate on a neighbouring path. That may still be the right trade — a duplicate
notice is less harmful than a suppressed one — but it should be a *decision*, not
a side-effect, and §14's provenance paragraph currently describes neither.

**Reachability is bounded, and I measured the bound.** With `sendMedia`
configured and files within limits, attachments consume **no** text index at all
(`marks after pass1: [0]`), the filter is a no-op, and there is no duplicate. The
dup needs one of: no media sender configured, an oversize notice, or an
over-length caption falling back to `sendText`.

**Cheapest honest fix**: scope the filter to the body range only when the mark
*could* be a body mark — or record `textPartCount` (body + attachment bubbles
actually emitted) in the identity instead of body `partCount` alone, so the
comparison covers the whole index space rather than truncating it.

**A second, more uncomfortable point.** T011's test reaches its state by calling
`recordTelegramPartitionIdentity(id, {partCount: 1, …})` and
`markTelegramPartSent(id, 1)` **directly**. I could not construct that state
through the forwarder in a way where skipping index 1 was *wrong* — when index 1
is reached naturally it is the attachment notice, and skipping it is correct
idempotence. So T011 may be sensoring a state that, when reached organically, was
already behaving correctly, while the fix's cost (above) is organic and
measurable. I am flagging this rather than asserting it: my failure to construct
a natural bad state is not proof that none exists, and the misalignment I
originally worried about (an attachment consuming 0 vs 1 text indices between
passes, e.g. `sendMedia` becoming available, or a file crossing the size limit)
is real but is **not** addressed by this filter either.

### 7.2 ADV-2 — the `partCount` half of the guard is now the unsensored one, and it is NOT redundant

MUT-PARTCOUNT (`9525a31d…`) is **GREEN across all 108 tests**. A GREEN mutation is
only a lead, so I measured what it lets back in.

**Is `partCount` simply redundant given `prefixLength`?** It is nearly so —
`partCount` is a function of `(prefix.length, initialText)`. But
`normalizeSenderContent` strips a leading `${prefix} ` **by content, not length**,
so two prefixes of *equal length* can strip different amounts:

| context | prefixLength | `initialText.length` | partCount |
|---|---|---|---|
| A — matches the body's leading prefix | 96 | 3993 | **1** |
| B — same length, different content | 96 | 4077 | **2** |

**Constructible. Then measured end-to-end**, with a position-encoded payload so
every delivered segment maps back to an offset range:

| tree | pass1 partition | pass2 bubbles | final state | payload covered |
|---|---|---|---|---|
| **pristine candidate** | `{2, 96}` marks `[0]` | 1 | acked | **3990/3990 — 0 lost** |
| **MUT-PARTCOUNT** | `{2, 96}` marks `[0]` | **0** | acked | **3909/3990 — 81 LOST**, gap `[3909,3990]` |

The pristine run logs `partition drift …: stored 2/96, current 1/96; sending all`
— note **`96` on both sides**: `prefixLength` matches and only `partCount` catches
it. Under the mutation there is **no drift log at all**, the redelivery sends
**zero** bubbles, and the row is **`acked`**. Silent tail loss.

So: the composite guard's two halves are now asymmetrically covered — this
hardening sensored `prefixLength` and left `partCount` in exactly the state
`prefixLength` was in before. **The general lesson (which cost me a mutation to
learn on the fold and again here): when a guard compares a multi-field key, each
field needs its own test that holds the others fixed.**

Reachability caveat, stated honestly: this needs a message body that itself
begins with a stale `[pij-id] [context] ` prefix. `normalizeSenderContent` exists
because such bodies occur, but **I did not demonstrate one arriving in
production**, and the cost of the fix (one more test) is low enough that I would
not gate on reachability.

### 7.3 ADV-3 (carried, unchanged) — legacy rows never acquire an identity

From the fold review: a pre-identity row with marks takes the legacy branch,
sends all, and **records nothing**, so it re-takes the legacy branch on every
subsequent redelivery — permanent send-all. Unchanged by this hardening
(MUT-LEGACY still REDs at `1285`, so the behaviour is pinned, but the behaviour
itself is still "never converges"). Not a regression; re-stated so it is not lost.

---

## 8. INFO

1. **Both claimed RED lines were exact.** First packet in this series where I did
   not have to correct one. Worth the coder's credit.
2. **`chunk()`'s `(i/n) ` counter also consumes budget** and its width depends on
   the part count, resolved by a convergence loop. Any future reasoning about
   partition arithmetic must account for it — `budget = 4096 − prefix.length − 1`
   is the *limit passed to `chunk`*, not the slice size.
3. **T009 and the original drift test have byte-identical trailing assertions**
   (1255/1256 ≡ 1335/1336). Their entire distinguishing power is in the setup. A
   future editor "de-duplicating" those assertions into a shared helper would not
   change coverage, but collapsing the two *tests* would silently drop a sensor.
4. **MUT-DRIFT now REDs three tests** (1255, 1335, 1397), up from one. The
   hardening deepens the original guard as well as adding new ones.
5. **The anchor-uniqueness harness invariant fired usefully** — the first attempt
   at §3.6 aborted because `expect(redeliverySent).toHaveLength(2)` occurs twice.
   Without it I would have mutated the wrong test and drawn a false conclusion.
6. **`sqlite-queue.ts` / `sqlite-queue.test.ts` are untouched** by the hardening —
   verified by sha against my fold review, not just by the diff.
7. **The candidate cherry-picks cleanly onto current main** (`0120c8da`) — unlike
   29b-T001, which conflicted. Whoever raises the PR should not hit resolution work.

---

## 9. Teardown

- All four `/tmp/pij-i24h*` worktrees removed; `git worktree list` verified back to
  the legitimate four (`pij`, `pij-poc`, `s391-day3-core`, `s392-day3-codex-doctrine`).
- All four `.mts` probes deleted from the candidate tree **before** the gates ran
  (`git status --porcelain` empty, confirmed in §6).
- Fence files sha-verified pristine after every single mutation and at exit.
- Harnesses `/tmp/i24h-mut.py`, `/tmp/i24h-byte.py`, backups and list captures removed.
- **No branch checked out, no commit, no push, no repo file modified by me** other
  than writing this review file.

---

## 10. Bottom line

**APPROVE.** The hardening closes both guards I reported unsensored on the fold,
and it closes them *properly* — the byte-coverage assertions are independently
load-bearing (§3.6), T009 catches something the original drift test provably could
not (§5.1), T010's A→B→A cycle is genuine with a real partial pass 2 (§5.2), every
prior guard survives (§3.4), and the differential (GREEN before, RED after, same
mutation bytes) leaves no doubt that the tests are what changed. Both mandated
RED lines were exact. No collateral by two independent methods. Gates green, and
the **full 4718-test suite passes** on a fresh-from-main tree with the chain
applied, save one `pwsh ENOENT` failure I reproduced on unmodified main (§6.1).

Two new findings, neither of which was in scope but both of which I would want
known before merge: **T011 buys ADV-3 at the price of a measured duplicate
attachment notice** (§7.1), and **`partCount` is now the unsensored half of the
composite guard, with 81 characters silently lost behind it** (§7.2). ADV-1 is the
one I would close first, because it works against the item's own headline.

*Written once, then closed. No mutation ran after this file was written.*
