# Item-24 INVARIANT fold — re-confirm AS A SET (cold review)

> **TERMINAL REPORT.** This pass is CLOSED. Every mutation was applied, measured and
> reverted before this file was written; the four fence files were sha-verified pristine
> and all scaffolding was torn down **before** this file was created. No mutation, probe
> or repo write ran after this point. The only repository write I made is this file.

**Candidate**: `a6151aa977cbb008e1abb3ab5797e3b0083d1e31` (chain `a27ab58 → 6641943 → 588dd0e → a6151aa`)
**Reviewed as**: the chain cherry-picked onto fresh `origin/main` (`c7185ec4`)
**Reviewer**: `pij-wilful-morton` (cold)

---

## VERDICT: ❌ REQUEST CHANGES — the invariant does **not** hold as a set

The fold does real work and closes **both** of the findings I raised against `588dd0e`
(measured, not read). Claims (iii) and (v) hold; the prefix-hash half of (ii) holds and is
genuinely load-bearing. But you asked me to check the invariant **as a set**, and told me a
fourth finding must be a *wrong invariant* rather than a missed sensor. I found two, and one
of them is a **new regression introduced by this fold**:

| # | finding | class | status |
|---|---|---|---|
| **W1** | **Media bubbles are members of the sent set but are outside the covered set** → the operator receives the same file **twice** on redelivery | wrong invariant — *a member not covered* | **pre-existing** (same on `588dd0e`) |
| **W2** | **`partCount` is a *sum*; the per-member distribution is a determinant not in the identity** → two different distributions with the same total alias, and a distinct oversize notice is **silently suppressed** | wrong invariant — *a determinant not in the identity* | ⚠️ **NEW — regression vs `588dd0e`** |

W2 is why this is REQUEST CHANGES rather than APPROVE-with-advisories. On `588dd0e` the
operator **was** told `/tmp/b.jpg` was too big; on `a6151aa` that notice is **silently
dropped**, with `drift logs = []`. The fold trades a *visible duplicate* (my ADV-1) for an
*invisible omission of a failure notice* — in a workstream whose whole thesis is transport
honesty, that is the worse direction, even though its trigger is narrower.

Neither W1 nor W2 is a missed sensor. Both are cases where the stated identity is not a
sufficient statistic for the property it is being used to decide.

---

## §1 — Scaffolding, and the limits of this pass (stated before the findings)

**Scaffolding built** (all torn down — see §8):

| tree | contents | purpose |
|---|---|---|
| `/tmp/pij-i24i-picked` | chain cherry-picked onto `origin/main` `c7185ec4` | **primary evidence** |
| `/tmp/pij-i24i-asis` | `a6151aa` as committed | fidelity cross-check |
| `/tmp/pij-i24i-pre` | `588dd0e` | **differential control** (the pre-fold tree) |
| `/tmp/pij-i24i-mid` | `588dd0e` picked onto the *same* main | like-for-like declaration diff |
| `/tmp/pij-i24i-main` | unmodified `origin/main` | gate baseline |

Helpers: `/tmp/i24inv-mut.py` (mutation harness — pristine precondition, anchor uniqueness,
no-op refusal, prints the mutated sha, restores from bytes captured at apply time),
`/tmp/i24inv-defs.py`, `/tmp/i24inv-run.sh`, and five `.mts` probes. `node_modules` was
symlinked from the main checkout. All probes were deleted **before** the gates ran, so
`git status --porcelain` was empty for every gate.

**Pristine shas** (all four verified `OK` before and after every mutation, and again at teardown):

```
bridge.ts           13619af8fa50cd12bc46dff6d1a15d3281984c8b40350f355853c330fc365154
bridge.test.ts      23820adcc9a8b9af0da19941822f39add39dd9460fce13ea83abacaa3a50f85b
sqlite-queue.ts     b5e24e5fcd1e1c9b76422ec07e5e0c68abcb91e5d6d091267d257fa613452d13
sqlite-queue.test.ts 59f9d2c520148c6d49d2325cf9f1a6e11db40cfbd182175984ba5863779ac0c4
```

### What I did **not** examine — these are gaps, not clean bills

- **No live Telegram send.** Every measurement is against injected `send`/`sendMedia` spies.
  W1's "the operator receives it twice" is a count of `sendMedia` invocations, not a phone.
- **`chunk()`'s boundary-preference branch was not varied.** My byte-coverage probes used
  synthetic bodies; a real body with newline/word boundaries may partition differently.
- **No concurrency.** Single forwarder, single message. I did not test two forwarders racing
  the same row, nor `INSERT OR IGNORE` under contention.
- **W2's trigger requires attachment files to change size across the redelivery window.** I
  *drove* that with an injected `sizeOf`; I did **not** demonstrate a real workload that does
  it. I am claiming the identity is insufficient, and that the resulting behaviour differs
  from `588dd0e`; I am **not** claiming a measured production incident.
- **`prefix_hash` collision resistance is assumed, not tested** (sha256).
- **I did not review the non-fence files** in `588dd0e..a6151aa` (that range spans unrelated
  branch commits); I reviewed the commit `a6151aa` itself, which touches exactly 4 files.
- **The `pwsh` full-suite failure** was re-derived on unmodified main *this pass* (§6), not
  reused from my earlier reviews.

---

## §2 — Branch shape and fidelity

- `origin/main` = `c7185ec4` — **moved again** (was `0120c8da` during my last pass; 102 commits
  ahead of the merge-base). I re-derived `git merge-base origin/main a6151aa` = `10483d8e`
  rather than trusting the packet.
- **The fence is untouched on main.** `git diff 10483d8e origin/main -- <4 fence files>` is
  **empty**, across all 102 commits (main's drift is 94 other files, +7137/−379). So unlike the
  29b wiring fold, the picked tree is uncompromised evidence here.

**Fidelity — proven two ways, both exact:**

| commit | original patch-id | picked patch-id | |
|---|---|---|---|
| `a27ab58` | `3de850f7…` | `3de850f7…` | ✅ |
| `6641943` | `9453c83a…` | `9453c83a…` | ✅ |
| `588dd0e` | `4169139a…` | `4169139a…` | ✅ |
| `a6151aa` | `c177b7b2…` | `c177b7b2…` | ✅ |

All four cherry-picks applied **cleanly** (no conflict, so `patch-id` is trustworthy here).
Stronger still, the resulting fence files are **byte-identical** to the as-committed tree —
all four shas match §1 exactly. What I mutated is what you committed.

---

## §3 — Mutation ledger (Dim-0)

Baseline on the candidate: **113 passed | 1 skipped** (`bridge.test.ts` + `sqlite-queue.test.ts`);
`bridge.test.ts` alone = 91 passed | 1 skipped.

| mutant | mutated sha256 | result | RED at |
|---|---|---|---|
| **MUT-PARTCOUNT** | `c732b032f67b340c2d96b1043c92b2a6f2c6b12d77088c7d15c0f018cea6a89c` | 🔴 RED (1) | `118` ← via `1258` |
| **MUT-PREFIXLEN** | `1846ab05ff3f2f2c2020cbe0b94866e3138b68245674d9f5344a2145fbce7397` | 🔴 RED (1) | `118` ← via `1262` |
| **MUT-PREFIXHASH** | `ebbfd34e15124e6b3d4751799f84450f2c541d78959deaa0a89b0bb07752dad6` | 🔴 RED (**2**) | `118` ← via `1266`, **and `1449`** |
| **MUT-NOMARK** | `2f8939943a851801a8cca0b998a750da644ef1150c4adca2b8020213c858cf6b` | 🔴 RED (2) | `1246`, `1562` |
| **MUT-IDEMPOTENT** | `f26b6f678205349db89647554c03b85b080b9f834d00bf82cbb52c725b10cb20` | 🔴 RED (2) | `1246`, `1562` |
| **MUT-DRIFT** | `da774c0247e7144e1def85f48c1058df6f6104e0063597c9c6b903e5bac2d0f8` | 🔴 RED (7) | all drift tests |
| **MUT-RETRY** | `36fa2888956beec5100ca185b18c87cb10627ca438671b0b011a93f587383c9b` | 🔴 RED (2) | `2254`, `2280` |
| **MUT-LOGID** | `32053efe9d5c610c0f0fd6c1d2cf59a20099557da843e41dcebd1d11568b53bb` | 🔴 RED (1) | — |

Every mandated mutant REDs, and every prior guard is still RED-able. Each was restored and
re-verified against the pristine sha before the next was applied.

### 3.1 Line-claim accuracy

- **`bridge.test.ts:118` — CORRECT** for all three identity mutants. 118 is
  `expect(sent).toEqual(["[pij-osn81b] identity sensor"])` inside the shared helper
  `expectPartitionComponentMismatchSends`, dispatched from 1258/1262/1266.
- **`bridge.test.ts:1512` for MUT-NOMARK — WRONG**, in both line and test. 1512 is
  `expect(pass3Sent).toHaveLength(2)` in the A-B-A test, and the packet says MUT-NOMARK
  "REDs the A-B-A byte-coverage assertion". It does **not**. MUT-NOMARK REDs at `1246` and
  `1562`, on the two *redelivery* tests. The A-B-A test is insensitive to MUT-NOMARK by
  construction: removing marking entirely still satisfies "B positions are not recorded as
  A's". The guard **is** sensed — by two other tests — so this is a claim error, not a hole.
  (Consistent with every packet in this series; I now treat all claimed lines as unverified.)

### 3.2 The asymmetry the ledger hides — and why it matters for claim (iv)

Read the RED **counts**, not just the colours:

- **MUT-PREFIXHASH REDs two tests**, one of which — `1449`, *"equal-length prefix drift still
  sends every recomputed part"* — is a **production-reachable** behavioural test that
  reassembles the body and asserts full byte coverage. The hash is genuinely load-bearing.
- **MUT-PREFIXLEN REDs exactly one test**, and that test writes a **production-unreachable**
  row. See §7.3 — this is why claim (iv) is not satisfied in the sense it is stated.

---

## §4 — What actually changed

`a6151aa` = 4 files, `+318/−63`. The production change is a real refactor, not a one-liner:

1. **Attachments are pre-planned** into a `AttachmentPlan` discriminated union
   (`text` | `media` | `error`) *before* the identity is computed (`bridge.ts:497–646`).
2. **`partCount` now sums the whole planned bubble set** — body parts + oversize/no-sender
   notices + overflow captions — instead of body-only (`bridge.ts:648–656`).
3. **`prefixHash: createHash("sha256").update(prefix)`** added to the identity, compared as a
   third conjunct, and printed in the drift log (`bridge.ts:659`, `673–681`).
4. **T011's `index < currentPartition.partCount` filter is REVERTED** —
   `sentPartIndices = new Set(positionalPartsValid ? persistedParts : [])` (`bridge.ts:684`).
5. **`sendText` now takes pre-computed bubbles** rather than raw text (`bridge.ts:696`).
6. **Additive nullable migration**: `ALTER TABLE telegram_partitions ADD COLUMN prefix_hash TEXT`
   guarded by a `PRAGMA table_info` check (`sqlite-queue.ts:208–211`); a `NULL` hash reads back
   as `undefined` (`:359`); writes validated against `/^[0-9a-f]{64}$/` (`:375`);
   `INSERT OR IGNORE` keeps it write-once (`:383`).

Tests: +6, −1. The one removed is T011's *"never applies body sent-part indices to attachment
fallback text"* — **intentional**, since T011 is the thing being reverted. Not collateral.

---

## §5 — The invariant, as a SET

### (i) Does the skip-set cover the full sent set? — **NO. This is W1.**

I checked the structural half first and it holds: I traced every site that consumes
`nextTextPartIndex` and confirmed `partCount` counts exactly those members. In particular the
failure echo uses a **separate channel** (`deps.echoFailure`, `bridge.ts:768`), *not*
`deps.send`, so it consumes no index and correctly contributes 0. I had expected that to be a
hole; it is not.

But the parenthetical in your own statement of (i) — *"everything consuming
`nextTextPartIndex`"* — is doing load-bearing work that the phrase *"the FULL sent set"*
denies. **Media bubbles are sent to the operator and consume no index**, so they are outside
the scheme entirely: `plan.sendMedia(...)` at `bridge.ts:752` is called unconditionally, with
no `sentPartIndices` check and no marking.

Measured (body text + one in-limit media attachment; the *body* send fails once, forcing the
ordinary `ForwardIncomplete` → lease-recovery redelivery):

```
TEXT delivered   = [ '[pij-osn81b] body' ]                     <- 1x, correct
MEDIA delivered  = [ 'photo:/tmp/probe.jpg:[pij-osn81b]',
                     'photo:/tmp/probe.jpg:[pij-osn81b]' ]     <- 2x
RESULT: MEDIA DUPLICATED -> operator received the same file 2x
```

**This is the same duplicate-on-the-phone class the whole item-24 loop exists to end**, on the
ordinary redelivery path. It is **pre-existing** — the identical probe on `588dd0e` also gives
2× — so the fold does not cause it. But the fold is being merged as *"the invariant that ends
the loop"*, and it does not end it for media.

No test covers this: there is exactly one media-count assertion in the suite
(`bridge.test.ts:2194`, `media.length === 1`) and it is a single-delivery test with no
redelivery. Note also that the ADV-1 closure test (`:1521`) configures **no `sendMedia`**, so
both its attachments become *text notices* — the real media path is never exercised across a
redelivery.

### (ii) Is the identity every determinant? — **The hash: yes. `prefixLength`: redundant. The distribution: NO (W2).**

**The prefix-hash half works and closes my ADV-2.** MUT-PREFIXHASH REDs the reachable
equal-length test at `1449`. Equal length no longer implies equal partition.

**`prefixLength` is redundant** — see §7.3, measured.

**The distribution is a determinant that is not in the identity — this is W2.** `partCount` is
a **sum** over members. Two different distributions with the same total produce an identical
identity while the index→content mapping changes underneath it.

Scenario (all three attachments, sizes crossing the upload limit in opposite directions across
the redelivery window — driven by injected `sizeOf`):

```
pass1: A oversize (notice), B in-limit (media), C oversize (notice, FAILS)
       partCount = 1 body + 1 A + 0 B + 1 C = 3 ; marks {0,1}
pass2: A in-limit (media), B oversize (notice), C oversize (notice)
       partCount = 1 body + 0 A + 1 B + 1 C = 3   <-- SAME total, different distribution
```

Candidate `a6151aa`:

```
pass2 texts  = [ "...Couldn't send /tmp/c.jpg — ... exceeds Telegram's upload limit..." ]
drift logs   = []
RESULT: ALIASED -> B's oversize notice SILENTLY SUPPRESSED
```

Pre-fold `588dd0e`, **same probe, same scenario**:

```
pass2 texts  = [ "...Couldn't send /tmp/b.jpg — ...",
                 "...Couldn't send /tmp/c.jpg — ..." ]
RESULT: B's oversize notice WAS sent - distribution change handled
```

So the operator **is** told about `b.jpg` on `588dd0e` and **is not** on `a6151aa`, with
`drift logs = []` — no drift is detected, so there is no operator-visible signal at all. The
only trace is `skip sent … part 1/1`, which is indistinguishable from correct idempotence.

Why the fold introduces it: `588dd0e`'s T011 filter (`index < partCount`, with `partCount`
counting body-only = 1) happened to discard *all* attachment marks. That caused my ADV-1
duplicate — and, incidentally, prevented this aliasing. Reverting T011 and broadening
`partCount` closes the duplicate and opens the omission.

### (iii) Drift → send-all, no-drift → skip-marked, legacy → untrusted — **YES, verified**

`MUT-DRIFT` REDs 7 tests. Legacy safety I proved **cross-version** rather than by reading:
I built a queue with the **pre-fold tree's own code**, wrote a hashless identity plus a sent
mark, closed it, and opened the same home with the candidate:

```
legacy columns   = message_id,part_count,prefix_length,recorded_at     <- no prefix_hash
candidate open   = (none)                                              <- no error
columns after    = message_id,part_count,prefix_length,recorded_at,prefix_hash   <- ALTER ran
identity (cand)  = undefined          <- hashless row reads back as untrusted
marks            = [ 0 ]
delivered        = [ '[pij-osn81b] legacy body' ]   <- re-sent despite the mark
RESULT: legacy hashless identity -> SENT ALL (untrusted, migration-safe)
```

Additive, nullable, guarded by `PRAGMA table_info`, and safe on a real legacy database.

### (iv) Every component has a mirror mutant RED-ing a distinct behavioural test — **not as stated**

All four mutants RED, so the *letter* of the claim passes. The stated *mechanism* — "each
varies ONE, others fixed" — is **impossible in production** for the `prefixLength`/`prefixHash`
pair, and two of the three identity tests write rows production cannot produce. See §7.3.

### (v) Partial-failure redelivery sends only unmarked members — **YES for text; this closes my ADV-1**

Differential on the exact ADV-1 scenario (body + 2 attachments, no `sendMedia`, second notice
fails, lease-recovery redelivery):

| tree | `body` attempts | **`first.bin` attempts** | `second.bin` attempts | stored `partCount` |
|---|---|---|---|---|
| `588dd0e` (pre-fold) | 1 | **2 — ADV-1 live** | 3 | 1 (body only) |
| `a6151aa` (candidate) | 1 | **1 — ADV-1 closed** | 3 | 3 (full set) |

The succeeded attachment notice is **not** re-sent, and `partCount` 1 → 3 shows (i)'s broader
count doing its job. **My hardening ADV-1 is genuinely closed**, and MUT-IDEMPOTENT /
MUT-NOMARK both RED on the new test at `1562`, so it is guarded.

**My hardening ADV-2 is also closed**: MUT-PARTCOUNT was GREEN in my previous pass (81 chars
lost, unsensored); it now REDs at `118`.

---

## §6 — Gates (candidate tree, probes removed, `git status` empty)

| gate | result |
|---|---|
| `tsc --noEmit` | ✅ exit 0 |
| `biome check` (4 fence files) | ✅ exit 0 — "Checked 4 files. No fixes applied." |
| `vitest` (fence files) | ✅ 113 passed, 1 skipped |
| **full suite** | ⚠️ **4703 passed, 19 skipped, 1 failed** |

The single failure is `harness/scripts/release-age-policy.test.ts` → `spawnSync pwsh ENOENT`.
**Re-derived this pass** on unmodified `origin/main` `c7185ec4`: same test, same failure
(`1 failed | 9 passed`). Environmental — no PowerShell on this macOS host — not the candidate's.

**No collateral (E17), like-for-like.** I compared the candidate against `588dd0e` *picked onto
the same main* (mixing bases would report main's drift as deleted tests — an error I made and
caught in my previous pass). `npx vitest list`: 108 → 113.

- Removed: **1** — T011's test, which the fold deliberately reverts. Intentional.
- Added: **6** — the three identity tests, the equal-length drift test, the redelivery
  attachment test, and the sqlite migration test.

---

## §7 — Findings

### W1 — BLOCKING per your criterion (pre-existing): media bubbles are outside the covered set

A member of the actual sent set is not covered by the identity/skip scheme, so it duplicates on
the operator's phone on every redelivery (measured 2×, §5(i)). Not introduced here — `588dd0e`
behaves identically — so this need not block *this merge*, but it must not be recorded as
closed by "the invariant that ends the loop".

**Either** extend marking to media members (give each planned bubble — text *or* media — an
index and mark it), **or** narrow the invariant's wording from "the FULL sent set" to "the
text sent set" and track media idempotence as a separate, named, open item. What should not
happen is the current position, where the wording claims the former and the code implements
the latter.

### W2 — BLOCKING (new regression): `partCount` aliases across distributions

§5(ii). Same identity, different index→content mapping, **silent** omission of a failure
notice, and a measured behavioural regression against `588dd0e`.

**Recommended fix — and it simplifies the invariant rather than extending it.** All planned
bubbles are already materialised before the identity is computed (`initialTextParts`, each
plan's `textParts` / `precedingTextParts`). So replace the three-component identity with a
single hash over the **ordered planned bubble set**:

```ts
bubblesHash: createHash("sha256").update(JSON.stringify(plannedBubbles)).digest("hex")
```

That is a sufficient statistic for exactly the property being decided — "does index *i* still
mean the same bytes?" It subsumes `partCount`, `prefixLength` **and** `prefixHash` (all three
are functions of the bubble set), closes W2, and dissolves §7.3 as a side effect. One
component, one mutant, no aliasing.

### ADV-1 (non-blocking) — `prefixLength` is a redundant determinant, and its mirror mutant proves less than claimed

`prefixLength = prefix.length` and `prefixHash = sha256(prefix)` are **both pure functions of
the same `prefix`**, and the hash is injective. For the `prefixLength` conjunct to ever decide
anything you need a persisted row where the length differs but the hash matches — i.e. a
sha256 collision. There is exactly **one** production write site (`bridge.ts:669`, writing
`currentPartition`), so a real row is always internally consistent.

Confirmed by measurement, not argument. I built a **reachable** prefix-length drift (context
change, prefix 96 → 60 chars) constructed so `partCount` is unchanged at 2, isolating the
prefix components, with a position-encoded 7000-char body:

| | redelivery bubbles | covered | result |
|---|---|---|---|
| pristine | 2 | 7000 / 7000 | FULL COVERAGE |
| under **MUT-PREFIXLEN** | 2 | 7000 / 7000 | **FULL COVERAGE — no bytes lost** |

The hash catches every real prefix change, including every length change. So the test at
`1262` (`{ prefixLength: len + 1 }`, leaving `prefixHash` at the true hash) asserts against a
state production cannot reach, and MUT-PREFIXLEN's RED demonstrates only that the code compares
a field a hand-written row could differ on.

**This is not a hole and I am not asking you to remove it.** By the repo's own
brake-vs-policy test: removing the conjunct makes the code trust positions *more* often, so
the conjunct can only ever cause *more* sending — a one-directional brake, and a harmless one.
The finding is about the **evidence**, not the code: claim (iv)'s "each varies ONE, others
fixed" cannot hold for this pair, and the ledger's three equal-looking REDs conceal that only
`MUT-PREFIXHASH` REDs a production-reachable test.

### INFO

1. **`MUT-NOMARK`'s claimed line and test are both wrong** (§3.1): claimed `1512` / the A-B-A
   test; actual `1246` + `1562` / the two redelivery tests.
2. **The `skip sent` log is not auditable.** `bridge.ts:701` logs
   `part ${index + 1}/${bubbles.length}` — the *per-call* position, not `persistedIndex`. In
   the W2 run both skips print `part 1/1`, so the log cannot tell you *which* global index was
   skipped. Logging `persistedIndex` would have made W2 visible.
3. **My hardening ADV-3 stands unchanged**: a legacy row that already has marks never receives
   an identity (the record only happens when `persistedParts.size === 0`), so it is
   *permanently* untrusted and re-sends everything on every redelivery. Confirmed again in the
   §5(iii) cross-version probe. By design, but permanent.
4. **`bridge.ts:669` records the identity only when `persistedParts.size === 0`** — correct,
   but it means the identity for a message is fixed by whichever partition happened to be
   current at first contact.
5. The oversize notice embeds the byte count, so a file that grows *while staying* oversize
   changes the notice text without changing its part count; the stale notice is then skipped.
   Cosmetic, and arguably correct idempotence — noted only for completeness.

---

## §8 — Teardown

- All five worktrees removed (`git worktree remove --force`), then `git worktree prune`.
- `git worktree list` is back to the four legitimate entries.
- All four fence files verified pristine (`OK`) at teardown — shas in §1.
- All `.mts` probes deleted **before** the gates ran; all `/tmp/i24inv-*` helpers removed.
- No branch checked out, no commit, no push, no `git add`.
- **Disclosure**: `git worktree prune` also dropped a stale registration for
  `…/scratchpad/29b-rebase`. I verified that directory was **already absent** before I ran
  prune (deleted by another process, not by me); prune removes registrations only and cannot
  delete branches or commits.

---

## §9 — Bottom line

You asked whether the invariant holds **as a set**, and specified that a fourth finding must be
a wrong invariant rather than a missed sensor. It is a wrong invariant — twice.

The identity `{partCount, prefixLength, prefixHash}` is being used to decide "does index *i*
still mean the same bytes?", but it is not a sufficient statistic for that question: it is
**blind to how the total is distributed across members** (W2), and the scheme it gates does not
cover every member the operator actually receives (W1). One of its three components is
redundant (ADV-1), which is harmless in itself but means the three-mutant ledger reads as
stronger evidence than it is.

What the fold gets right is substantial and I want it on the record: **both of my `588dd0e`
findings are closed and measured closed** (ADV-1: 2× → 1×; ADV-2: MUT-PARTCOUNT now REDs), the
prefix hash genuinely closes the equal-length case, the migration is safe on a real legacy
database, there is no collateral, and the gates are clean. The refactor to pre-planned
attachments is the right shape — it is what makes a complete identity *possible*.

It is one component short of correct. Hashing the ordered planned bubble set (§7.2) would make
the identity exact, delete the aliasing, and collapse three components into one.

**Do not merge this as the invariant that ends the loop.** W2 is a live, silent regression
against the tree it replaces.
