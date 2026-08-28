# 29b-T001 fold — cold re-confirm (hunk only)

> **TERMINAL REPORT.** This pass is CLOSED. No mutation, probe, or repo write was
> performed after this file was written. All scaffolding is torn down.
> Reviewer: `pij-wilful-morton`. Date: 2026-08-28.

**Candidate**: `87a0c135d09d12a958dd14c4daaeff7bf47805a1` ("fix(pij): harden bridge watcher notification")
**Prior verdict re-affirmed**: 29b-T001 APPROVE at `816a726` — unchanged.
**Reviewed in two trees**: as-committed at `87a0c13`, **and** cherry-picked onto fresh main `6aa12c34` → `6c46dea`.

---

## VERDICT: ✅ APPROVE (the fold hunk)

Both of my findings are addressed, and I confirmed the important one by the test
that actually matters rather than the one the packet asked for:

* **ADV-1 (E28 vacuity) — genuinely closed for the notifier's behaviour.** I deleted
  the source-pin grep *and* applied a notify-nobody mutation; the behavioural test
  went **RED on its own**. It no longer needs the grep. That is a real fix, not a
  cosmetic one.
* **ADV-2 (E29 honesty) — closed for the log.** Absent vs unreadable/malformed is
  correctly distinguished and well-sensored in both directions.

**But the fold closes the vacuity of the *notifier*, not of the *wiring*.** I
reintroduced the **exact original E28 bug** one layer up — a prime-count gate at the
`notifyOwner` call site, with the factory left perfect — and **every sensor stayed
silent**: 71 tests pass, the grep passes, `tsc` exits 0, `biome` exits 0 with no
warning at all. The regression that actually happened live can happen again and
nothing would catch it. That is ADV-1 below, and it is the finding I would not want
lost in the merge.

This is an APPROVE: the shipped code is correct and is a strict improvement over
`816a726`.

---

## 1. Scaffolding, and the limits of this pass (stated first)

| tree | at | purpose |
|---|---|---|
| `/tmp/pij-29bf-asis` | `87a0c13` (as committed) | **primary** — the exact artifact the coder built |
| `/tmp/pij-29bf` | `6aa12c34` + picks of `816a726`, `87a0c13` → `6c46dea` | merge-readiness on current main |
| `/tmp/pij-29bf-mid` | `6f6ad58` (main + `816a726`, pre-fold) | declaration baseline for the fold delta |
| `/tmp/pij-29bf-main` | `6aa12c34` (fresh main) | pre-existing-red baseline |

Pristine sha256, re-verified after every mutation and at teardown:

```
as-committed   daemon.ts      27976a6b2a519bbcd57b5ce864ae020b0a12d73534fff0ab016e76b441e00526
as-committed   daemon.test.ts 030a4e05c5f60b359c846b07e0475df023750a752cc34887b210e4bca4141894
cherry-picked  daemon.ts      5e7fec92b57388f855aca0dfcb05e6bb02698f6fb673f433fee0792060f74a30
cherry-picked  daemon.test.ts 6c8e7c341f6b3d309c14ac6637d434487f54e3296783d76a2daf508c403a2128
```

The harness refuses to run unless both fence files match the selected tree's
pristine hashes, refuses a no-op or non-unique anchor, prints the mutated sha256,
and restores from bytes it captured itself (E27).

### What I did NOT examine — an unchecked gate must not read as a clean one

1. **`runDaemon`'s `notifyOwner` wiring was READ and MUTATED but never EXECUTED.**
   No shipped test drives `runDaemon`'s bridge-supervision wiring and I did not
   build a harness for it. This is precisely the substance of ADV-1 — I can tell
   you nothing catches a wiring regression, but I did not *run* the wired path.
2. **No live bridge restart.** Nothing reached Vaughan's phone. All delivery
   evidence is `FsChannel` inboxes on disk.
3. **The conflict resolutions are mine, not the coder's.** The cherry-pick onto
   current main conflicted twice; I resolved both and proved the resolution is
   import-only (§2), but the picked tree is my reconstruction. The as-committed
   tree at `87a0c13` is therefore my primary evidence.
4. **No concurrency test** — two daemon ticks notifying simultaneously.
5. **The TOCTOU between `store.read()` and the new raw re-read was not probed**
   (a file created or deleted between the two reads would be mislabelled).
6. **No permission-denied (EACCES) case** — I probed ENOENT, unparseable JSON,
   non-array `watchers`, missing key, and schema-invalid entries only.
7. **T002–T005 remain out of fence** and were not reviewed.

---

## 2. Branch shape — main drifted again, and this time it drifted *into the fence*

`git merge-base origin/main 87a0c13` = `10483d8e`; `origin/main` is now **`6aa12c34`**
(it was `a818b6c9` an hour earlier, during my item-24 pass). Unlike item-24, **this
drift touches both fence files**: 8 commits, **+411/−35** across `daemon.ts` and
`daemon.test.ts` (items 10a/10b, 13, 15, 29, spawn retirement, spine locks).

**Consequence, and a merge-readiness finding for you:** the candidate **does not
cherry-pick cleanly onto current main**. It conflicted **twice**, both times in the
`daemon.test.ts` import block:

* picking `816a726` — main added `createDaemonRegistry` / `installDaemonShutdownHandlers`
  (+ `TSX_CLI` / `DAEMON_BIN`) where the candidate added `notifyBridgeRestartWatchers`;
* picking `87a0c13` — same block, now also adding `createBridgeRestartNotifier`.

I resolved both by **union** (kept main's imports, added the candidate's) and
proved the resolution introduced nothing else by diffing the two patches'
changed-line sets:

```
original fold patch : 150 changed lines
my picked patch     : 144 changed lines
difference          : 6 lines, ALL of them the import block
                      (the fold rewrote a one-line import into a multi-line one;
                       on main that import was already multi-line, so git absorbed it)
```

Every other changed line is byte-identical. `patch-id` cannot certify a
conflict-resolved pick, so this changed-line comparison is the substitute.

**Both trees are green** (§6), so the fold survives the rebase — but expect to
resolve these two import conflicts when you cut the PR.

---

## 3. Dim-0 — mutation ledger

Baselines: as-committed **71 passed / 2 skipped**; cherry-picked **74 passed / 2 skipped**.

### 3.1 The two mandated mutations (as-committed tree)

| # | mutation | mutated `daemon.ts` sha256 | result | RED at |
|---|---|---|---|---|
| **MUT-OWNER-BEHAV** | notify-nobody closure (`return 0` for the delegation), **grep left intact** | `f4a88b3c41040ab0be6185200d1568a2924b07f3c14fbbddd8e1a5a8c8e171c9` | **RED** 1F/70P | **`daemon.test.ts:228`** |
| **MUT-HONESTLOG** | revert the honest branch to blanket "has no watchers" | `788567c7861e11172dea5585521f14f7c8e8d78902667b3c060f38610172f142` | **RED** 1F/70P | **`daemon.test.ts:274`** |

Both reproduced on the **cherry-picked** tree too (line numbers shift +8 from main's
extra imports): MUT-OWNER-BEHAV `5e9dab83…` RED at `:236`; MUT-HONESTLOG
`18e8077e…` RED at `:282`.

**Line-claim accuracy: both claims are off by 2.**

| | claimed | measured | what is actually there |
|---|---|---|---|
| MUT-OWNER-BEHAV | `:230` | **`:228`** | `expect(notifyOwner("telegram bridge restarted")).toBe(1)` |
| MUT-HONESTLOG | `:276` | **`:274`** | the `toContain("… (2 entries rejected)")` assertion |

`:230` is the `toContain("telegram bridge restarted")` assertion (it never gets
reached — `:228` fails first); `:276` is the test's closing `});`. Both REDs land on
the **correct test**, so the claims are directionally right and materially wrong.

**The E28 claim is confirmed**: MUT-OWNER-BEHAV RED **with the grep intact** — the
grep test still passed (source still contains `createBridgeRestartNotifier({`), and
exactly one test failed: the behavioural one.

### 3.2 My mutations — including the one that matters

| # | mutation | mutated sha256 | result |
|---|---|---|---|
| **MUT-OWNER-BEHAV-NOGREP** | notify-nobody **AND the grep test deleted** | `daemon.ts f4a88b3c…`, `daemon.test.ts cf77d9db583423b9af119f00e5379bd6cc2a8c62884a817862165490d79709a8` | **RED** 1F/69P (72 total — grep test confirmed gone), at `:228` |
| **MUT-WIRING** | `notifyOwner: notifyBridgeOwner` → `notifyOwner: () => 0` | `ee0c6a09f2c14a360f32291d35a276e016016d7db4c09e1808c4835ec710ae69` | **GREEN 71P — UNSENSORED** |
| **MUT-WIRING-PRIMEGATE** | the **original E28 bug** reintroduced at the call site, factory intact, variable still used | `5001288ebedcef842d291144014c68837d1f69e40eb3f84743d1ed666209947b` | **GREEN 71P — UNSENSORED** |
| MUT-PRIMECOUNT | drop the registry-derived `primeCount` from `captureText` | `2dddd885456797fc51871b6e403f35d4526c16ff36840d94f894afca4acd5386` | **GREEN 71P — UNSENSORED** |
| MUT-REJECTCOUNT | `rejected = raw.watchers.length` → `0` | `01c7414c3f216181d97bcd52856af09957a8905795a8b2f276c4e12cb2398445` | **RED** at `:274` |
| MUT-ENOENT | delete the ENOENT arm (absent reports as malformed) | `dc1ca91fff4c9b7167b972d0629096c4aa85b721282d1a84ba0a0ad701be9a03` | **RED** at `:246` |

**MUT-OWNER-BEHAV-NOGREP is the one that closes my ADV-1.** Pre-fold, a notify-nobody
implementation was caught *only* by the grep. Post-fold, with the grep deleted, the
behavioural test REDs by itself. The vacuity is genuinely gone.

**MUT-WIRING-PRIMEGATE is the one that opens the new ADV-1** — see §5.2.

---

## 4. What the fold changes

`daemon.ts` (+92/−32):

* `BridgeRestartWatcherNoticeDeps.store` widened to include `pathFor`.
* `notifyBridgeRestartWatchers` now branches when `store.read()` returns `undefined`:
  re-read the raw file, `JSON.parse` it, and log
  `watchers file unreadable/malformed (N entries rejected)` where
  `N = Array.isArray(raw.watchers) ? raw.watchers.length : 0`; on `ENOENT` log the
  honest `has no watchers`; on any other throw log `malformed (0 entries rejected)`.
* New exported `createBridgeRestartNotifier(deps)` factory returning the
  `(message) => number` closure: counts non-dissolved/non-failed primes from the
  registry, prepends `registered primes at restart: N` to `captureText`, appends the
  bridge-log tail, then delegates to `notifyBridgeRestartWatchers`.
* `runDaemon` builds `notifyBridgeOwner` from that factory and passes
  `notifyOwner: notifyBridgeOwner`, replacing the previous inline closure.

**The owner resolution itself is unchanged** from the approved `816a726` — watcher
list → `Set` dedup → notify each. Dim-1 #4 holds, with one caveat: the *content*
delivered to the operator now carries `registered primes at restart: N`, which is a
real (if benign) change to what lands in the capture.

Single production path, verified by enumeration — no bypass:

```
daemon.ts:1790  const notifyBridgeOwner = createBridgeRestartNotifier({…})
daemon.ts:1817  notifyOwner: notifyBridgeOwner
telegram/index.ts:477  deps.notifyOwner(message)
```

---

## 5. Dim-1 — answered by execution

### 5.1 #1 — the behavioural test drives the REAL factory. **Confirmed.**

The test constructs a real `FsRegistry` with 3 bound primes, a real
`FsWatchdogStore` with one watcher, a real `FsChannel`, and calls
`createBridgeRestartNotifier(...)` — the same exported factory `runDaemon` uses. It
asserts the returned count is 1, that the watcher received exactly one message
containing the text, and that no logs were emitted. MUT-OWNER-BEHAV-NOGREP proves
those assertions are falsifiable **without** the grep. The vacuity I reported at
`816a726` is closed.

### 5.2 #1 (continued) — but "production calls the same factory" is asserted by the GREP ALONE, and the grep cannot see the call site *(→ ADV-1)*

The behavioural test exercises the factory **in isolation**. Nothing exercises
`runDaemon`'s wiring. The grep asserts only that the *string*
`createBridgeRestartNotifier({` appears in `daemon.ts` — which is satisfied by the
`const` declaration, regardless of whether its result is used.

I reintroduced the original E28 bug at the call site, keeping the factory perfect
and the variable used:

```ts
notifyOwner: (message) =>
    registry.list().filter((d) => d.prime === true).length === 1 ? notifyBridgeOwner(message) : 0,
```

On this 3-government machine that returns 0 — **exactly the live failure 29b-T001
was written to fix**. Measured response of every sensor:

| sensor | result |
|---|---|
| `daemon.test.ts` (behavioural + skip + malformed + grep) | **71 passed — GREEN** |
| source-pin grep (`createBridgeRestartNotifier({`) | **1 match — passes** |
| `tsc --noEmit` | **exit 0** |
| `biome check` | **exit 0, no warning** |

Total silence. (The blunter `notifyOwner: () => 0` variant does at least raise a
biome `noUnusedVariables` **warning** at `daemon.ts:1755` — but `biome check` still
**exits 0**, so it is visible to a reader, not to a gate. The prime-gate variant
keeps the variable used and produces no warning at all.)

**Recommend**: a sensor that pins the *use*, not the declaration — either a test that
drives `runDaemon`'s bridge-supervision wiring, or, as a cheap stopgap, extend the
existing grep with `expect(source).toContain("notifyOwner: notifyBridgeOwner")`.

### 5.3 #2 — ABSENT vs MALFORMED. **Correct, and well-sensored.**

Eight probes against the real `notifyBridgeRestartWatchers`:

| probe | `store.read()` | returned | log |
|---|---|---|---|
| A1 no file at all | `undefined` | 0 | `… has no watchers` ✅ |
| A2 `{"watchers":[]}` | `{"watchers":[]}` | 0 | `… has no watchers` ✅ |
| A3 1 good + 1 bad | `undefined` | 0 | `… unreadable/malformed (2 entries rejected)` ✅ |
| A4 3 good + 1 bad | `undefined` | 0 | `… unreadable/malformed (4 entries rejected)` ⚠️ |
| A5 unparseable JSON | `undefined` | 0 | `… unreadable/malformed (0 entries rejected)` ✅ |
| A6 `watchers` not an array | `undefined` | 0 | `… unreadable/malformed (0 entries rejected)` ✅ |
| A7 no `watchers` key | `{"enabled":true}` | 0 | `… has no watchers` ✅ |
| A8 bogus `pausedBy`, watchers fine | `undefined` | 0 | `… unreadable/malformed (1 entries rejected)` ❌ |

Both directions are guarded: MUT-ENOENT (absent → reported as malformed) REDs the
pre-existing `no watchers` test at `:246`; MUT-HONESTLOG (malformed → reported as
none) REDs at `:274`. A false "no watchers" can no longer ship.

**On "is N the rejected-entry count?"** — N is the **total** number of entries in the
file. Under `parseSidecar`'s reject-all semantics all of them *are* dropped, so N is
arithmetically the rejected count. But A4 shows the reading it invites is wrong:
"4 entries rejected" when 3 were perfectly valid watchers who each received nothing.
See ADV-3.

### 5.4 #3 — the grep is retained as a second sensor. **Confirmed.**

`daemon.test.ts:278-282` still exists; its target was retargeted from
`notifyBridgeRestartWatchers(message, {` to `createBridgeRestartNotifier({`, and the
`not.toContain("expected one live prime")` half is unchanged. Neither pin is stronger
than the other — the old string still appears in the fold (inside the factory body),
so both would pass under MUT-WIRING.

### 5.5 #4 — no behaviour change beyond observability + the test. **Confirmed, with one caveat.**

Owner resolution is byte-identical in intent to `816a726`. The changes are: the new
undefined-branch logging, the factory extraction, and `registered primes at restart: N`
prepended to `captureText` — the last of which does change what the operator
receives. On the **live machine** the sidecar is valid (`~/.pij/pij-telegram/watchdog.json`
holds one watcher, `pij-relative-panther`), so `read()` succeeds and the new branch
is never entered: the fold is a **no-op on the live happy path**.

### 5.6 My own question: is the registry actually load-bearing?

No. MUT-PRIMECOUNT (drop `primeCount` from `captureText`) leaves the suite **GREEN**.
Nothing asserts the prime count, and — as at `816a726` — no code path in the factory
can notify a prime, so the three
`expect(messageBodies(prime)).toEqual([])` assertions remain structurally
unfalsifiable. They are harmless, but they are still not evidence. See ADV-4.

### 5.7 My own question: does the underlying loss get fixed, or only reported?

Only reported. A3/A4 show the **good watcher's inbox is 0** in every mixed-file case.
That is correctly scoped — the ruling asked for E29 *honesty* — but the operator
still receives nothing when one malformed entry sits beside valid ones. Carried
forward as ADV-5.

---

## 6. Gates and no-collateral

| gate | tree | result |
|---|---|---|
| `daemon.test.ts` | as-committed | **71 passed / 2 skipped**, exit 0 |
| `daemon.test.ts` | cherry-picked | **74 passed / 2 skipped**, exit 0 |
| `tsc --noEmit` | cherry-picked | **exit 0** |
| `biome check` (2 fence files) | cherry-picked | **exit 0** |
| full suite | cherry-picked | **4693 passed / 1 failed / 19 skipped**, 236 files, 211 s |

The single failure is pre-existing and outside the fence, proven not asserted:
`harness/scripts/release-age-policy.test.ts:196` → `spawnSync pwsh ENOENT`; the same
file on the **fresh-main tree at `6aa12c34`** gives `1 failed | 9 passed`, identical;
`grep -c "pwsh\|release-age"` on both fence files → **0, 0**.

### 6.1 No collateral (E17) — two independent methods

**Declaration list** (`npx vitest list`, pre-fold tree vs fold tree, `comm`-diffed):

```
pre-fold (main + 816a726) : 73 declarations
fold                      : 74 declarations
REMOVED                   : (none)
ADDED                     : 1  — "reports a malformed watchers file instead of
                                  claiming there are no watchers"
```

**Line diff** — required here because the behavioural test was *rewritten in place*,
which a declaration diff cannot see:

```
deleted `it(`     : 0
deleted `expect(` : 2   — both accounted-for replacements:
  1. expect(notifyBridgeRestartWatchers("telegram bridge restarted", {…})).toBe(1)
     -> expect(notifyOwner("telegram bridge restarted")).toBe(1)
        (strictly stronger: now runs through the production factory)
  2. expect(source).toContain("notifyBridgeRestartWatchers(message, {")
     -> expect(source).toContain("createBridgeRestartNotifier({")
        (equivalent strength; retargeted, not weakened)
```

Nothing removed or weakened.

---

## 7. Advisories

### ADV-1 — the wiring is unguarded: the original E28 bug can return in total silence *(highest value)*
**Severity: medium.** The fold closes the *notifier's* vacuity but not the *wiring's*.
MUT-WIRING-PRIMEGATE — the original prime-count gate reintroduced at the
`notifyOwner` call site with the factory intact — passes the test suite, the grep,
`tsc`, and `biome` (§5.2). The behavioural test exercises the factory in isolation;
the grep matches the `const` declaration, not its use. **Recommend** a test that
drives `runDaemon`'s bridge-supervision wiring, or as a one-line stopgap
`expect(source).toContain("notifyOwner: notifyBridgeOwner")`.

### ADV-2 — the honest log blames the watchers for failures that are not about watchers
**Severity: low–medium (an honesty defect inside the honesty fix).**
`parseSidecar` returns `undefined` for **six** distinct reasons — non-object,
bad `enabled`, bad `intervalMs`, bad `pausedBy`, bad `pausedAtMs`, bad
`exemptUntilMs` — and only one of them concerns `watchers`. The new branch always
reports `watchers file unreadable/malformed (N entries rejected)`. Probe A8: a
sidecar with a bogus `pausedBy` and one **perfectly valid** watcher logs
`(1 entries rejected)`, pointing the operator at the wrong field and miscounting a
good entry as rejected. **Recommend** re-validating the watcher array specifically
before attributing the failure to it, or softening to
`watchers file unusable (sidecar rejected; N watcher entries present)`.

### ADV-3 — N is the total entry count, not the count of bad entries
**Severity: low.** A4: 3 valid watchers + 1 malformed → `4 entries rejected`.
Arithmetically true under reject-all semantics, but it reads as "4 malformed entries"
and hides that 3 legitimate watchers were silently dropped. **Recommend**
`N entries dropped (M malformed)` — the counts are both cheaply computable with
`filter(isWatcher)`.

### ADV-4 — the registry dependency is unsensored; the "3 primes" setup still proves nothing
**Severity: low.** MUT-PRIMECOUNT stays GREEN. Nothing asserts
`registered primes at restart: N`, and no code path in the factory can notify a
prime, so the three `expect(messageBodies(prime)).toEqual([])` assertions remain
structurally unfalsifiable — the same shape I flagged at `816a726`, now harmless
but still not evidence. **Recommend** asserting the capture text contains
`registered primes at restart: 3`, which makes the registry dependency real.

### ADV-5 (carried, by design) — the loss itself is reported, not fixed
**Severity: low, and correctly out of scope.** A3/A4 measured the good watcher's
inbox at **0**. One malformed entry beside valid ones still costs every valid
watcher their notice; the fold makes that visible rather than absent. Worth a
follow-up item now that the log will actually say so.

---

## 8. INFO

- **INFO-1** — both claimed Dim-0 lines are off by 2 (`:230`→`:228`, `:276`→`:274`),
  though both land on the correct test. `:276` is a closing brace.
- **INFO-2** — **the candidate does not cherry-pick cleanly onto current main**: two
  import-block conflicts (§2). Expect to resolve them when cutting the PR.
- **INFO-3** — the notifier's `number` return is discarded in production:
  `telegram/index.ts:407` types `notifyOwner` as `(message: string) => void` and
  `:477` ignores the result. The count is only ever observed by tests. (Carried from
  my `816a726` review.)
- **INFO-4** — the honest-log path performs a **second** filesystem read of the same
  file via `readFileSync(deps.store.pathFor(...))`. Correct, but it introduces a
  TOCTOU window against the first `store.read()`; a file created or removed between
  the two would be mislabelled. Not probed.
- **INFO-5** — grammar: `1 entries rejected` (A8). Trivial, but this string is
  operator-facing and now assertion-pinned.
- **INFO-6** — the live sidecar is valid, so the fold is a **no-op on the live happy
  path**; it changes only what is reported when things are already broken.

---

## 9. Teardown

- All four worktrees (`/tmp/pij-29bf-asis`, `/tmp/pij-29bf`, `/tmp/pij-29bf-mid`,
  `/tmp/pij-29bf-main`) removed with `git worktree remove --force`; `git worktree list`
  verified back to the legitimate set.
- Probe file deleted from inside the tree and `git status --porcelain` verified empty
  **before** the collateral and gate runs; mutation harness, backups and list captures
  removed.
- Both fence files sha-verified pristine after every mutation and at exit in both
  trees ("ALL FENCE FILES PRISTINE AT EXIT").
- No branch checked out (all trees `--detach`), no push. The cherry-picks exist only
  in the removed throwaway tree. The only repo write is this file.

---

## 10. Bottom line

**APPROVE the fold.** It does what the ruling asked: the behavioural test now stands
on its own without the grep (proven by deleting the grep and watching it RED), and
the absent-vs-malformed distinction is correct and guarded in both directions. My
two findings at `816a726` are addressed.

The thing to carry forward: **the fold closed the vacuity of the notifier, not of the
wiring.** I put the original E28 bug back at the call site with the factory intact and
watched the tests, the grep, `tsc` and `biome` all pass without a murmur. One extra
line in the existing source-pin would close it today; a test that drives `runDaemon`'s
supervision wiring would close it properly.

**This pass is CLOSED.** No further mutation or verification will be run on 29b-T001
or its fold by me.
