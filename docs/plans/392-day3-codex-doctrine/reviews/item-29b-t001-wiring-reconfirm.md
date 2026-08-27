# 29b-T001 WIRING fold — cold re-confirm

**TERMINAL REPORT.** This pass is CLOSED. No mutation ran against any repository
file after this file was written. All measurements come from execution in
throwaway worktrees, all torn down (§9).

**Reviewer**: `pij-wilful-morton` (cold) · **Dispatched by**: `pij-falling-outside`
**Packet**: `docs/plans/392-day3-codex-doctrine/reviews/item-29b-t001-wiring-reconfirm-packet.md`
**Candidate**: `ad32ecb6e0bc1bf5de847ed9bc4b473566b674dc`
**Chain**: `816a726` → `87a0c13` → `ad32ecb`, cherry-picked onto fresh `origin/main`

---

## VERDICT

**The change is SAFE to merge. The claim that it closes my wiring finding is NOT
supported — please do not record ADV-1 as closed.**

Splitting it, because the two halves land very differently:

| half | verdict |
|---|---|
| **ADV-3 honest count** (`N dropped, M malformed`) | ✅ **APPROVE** — works, matches Dim-1 #2 exactly, and additionally **fixes my ADV-2 misattribution** |
| **ADV-1 wiring** | ❌ **NOT CLOSED** — the call-site regression I demonstrated is **still fully GREEN**, with all four sensors silent |

The packet states: *"the call-site wiring is extracted into a named
`wireBridgeRestartNotifier` and tested behaviourally"*. What `ad32ecb` actually
does is **rename** `createBridgeRestartNotifier` to `wireBridgeRestartNotifier`.
The function body is unchanged, the behavioural test still calls it **directly**
in isolation, and the call site — `notifyOwner: notifyBridgeOwner` at
`daemon.ts:1800` — is exactly as unguarded as it was before. I re-ran my own
call-site re-introduction probe (§5.2): still GREEN, tsc 0, biome 0, grep blind.

Both mandated mutations do go RED at the exact claimed lines. But **MUT-WIRING was
already RED before this fold** — it is the same assertion my
`MUT-OWNER-BEHAV-NOGREP` reddened at `87a0c13` in the previous pass. The commit
adds **no new test** (declaration list 74 → 74, §5.4). So the mandated Dim-0
demonstrates coverage that already existed.

Nothing here is a regression, and the honest-count work is genuinely good. My
objection is narrowly to the *claim*.

---

## 1. Scaffolding, and the limits of this pass — before the findings

**Four throwaway worktrees**, all `--detach`, each symlinked to `~/GitHub/pij/node_modules`:

| tree | contents | role |
|---|---|---|
| `/tmp/pij-29bw-asis` | `ad32ecb` as committed | **primary evidence for the hunk** |
| `/tmp/pij-29bw-picked` | fresh main + all three picks | composition with current main |
| `/tmp/pij-29bw-mid` | fresh main + `816a726` + `87a0c13` | **pre-fold control** |
| `/tmp/pij-29bw-main` | `origin/main` `0120c8da` | baseline |

Plus `/tmp/29bw-mut.py` (mutation harness), `/tmp/29bw-sensors.py` (four-sensor
table) and one `.mts` probe, all removed.

**Pristine shas (as-committed tree, verified before and after every mutation):**

```
daemon.ts       637c96f356731fe81b6b9f0c1a2e6e10207a16d5887f0dd67c96e66434c70f2e
daemon.test.ts  0c3eb85eec405f0e3a6099188950106ded39a0c94db801d0e7e6356fda0fdd19
```

Baseline `71 passed | 2 skipped` — identical to the baseline in my previous 29b
pass, which corroborates that the as-committed tree is the same shape.

### What I did NOT examine — an unexamined gate must not read as a clean one

- **`runDaemon` was never executed.** I mutated its wiring and ran every sensor
  against the mutation, but I did not boot a daemon and observe a real restart
  notice. That is precisely the gap the finding is about.
- **No live Telegram bridge, no real restart.**
- **No concurrency**; single process throughout.
- **I did not re-verify the packet's claim that the stream worktree is a
  frankenstein.** I took it at its word and gated my own trees instead.
- **The `pwsh` full-suite failure I did not re-derive from scratch** — I rely on
  the baseline run I did ~25 minutes earlier in the item-24 pass, on the same
  machine against the same `origin/main` (`0120c8da`). Same evidence, not fresh.
- **`isBridgeWatcherEntry` vs `isWatcher` agreement is verified by reading**, not
  by a differential test over generated inputs (§7.3).
- **EACCES / permission-denied on the watchers file is unprobed** — I exercised
  the unparseable-JSON path but not a genuine read error.

---

## 2. Branch shape and cherry-pick fidelity

Re-derived rather than taken from the packet:

- `git merge-base origin/main ad32ecb` = `10483d8e…`
- `origin/main` = `0120c8dafc7afdfbea5eeb6f1bc5b6c710171eda`
- **Main's drift lands IN-FENCE**: `+411 / −35` across `daemon.ts` and
  `daemon.test.ts` over 8 commits (items 10a/10b, 13, 15, 29, registry, spawn,
  spine). This is why the as-committed tree is primary evidence — the picked tree
  is my reconstruction.

**The cherry-pick conflicted three times, every one in the `daemon.test.ts`
import block**, resolved by union each time (the third also had to *drop*
`createBridgeRestartNotifier`, which `ad32ecb` removes, while keeping main's
`createDaemonRegistry`).

**Proof the resolution is faithful.** `patch-id --stable` **differs**
(`01045250…` vs `fc8a78b9…`) — expected, because patch-id hashes context lines and
main drifted the context around the import block. So I used the changed-line-set
diff instead:

```
orig ad32ecb changed lines: 35
picked       changed lines: 35
ONLY in original: (none)
ONLY in picked  : (none)
```

**The two changed-line sets are identical.** For the commit under review the
picked version is line-for-line the same change. (Recording the patch-id
mismatch explicitly: on a conflict-resolved pick, patch-id disagreeing does *not*
mean the change differs — it means the context moved.)

---

## 3. Dim-0 mutation ledger

Harness invariants as in prior passes, plus a `drop_greps` mode that deletes the
source-pin test outright so the behavioural test has to stand alone.

### 3.1 Both mandated mutations RED, both at the exact claimed line

| mutation | mutated sha256 | verdict | RED at | claimed |
|---|---|---|---|---|
| **MUT-WIRING** (+ **ALL GREPS DELETED**) | `daemon.ts` `164118ab0eaf78f1f4e0c15f5ec4c3aad35b0f829e2f5f0f3b8565657f00fa82`<br>`daemon.test.ts` `a8e2700867ab59583ec6e46e9bd080b62855acf9ff3aac6a7bb1416014fb772f` | **RED** | `daemon.test.ts:228` | 228 ✅ **exact** |
| **MUT-HONESTLOG** | `daemon.ts` `85ba6141040606864c9d9619523e5b41789dbaaf18d899bcc03345635e6d73d5` | **RED** | `daemon.test.ts:274` | 274 ✅ **exact** |

- MUT-WIRING = a single-prime gate inside `wireBridgeRestartNotifier`'s returned
  closure. Fails `expect(notifyOwner("telegram bridge restarted")).toBe(1)`
  with `expected +0 to be 1`.
- MUT-HONESTLOG = revert the log to `(${entries.length} entries rejected)`.
  Fails `expect(logs.join("\n")).toContain(...)` at `:274`.

Run **with** the greps intact, MUT-WIRING also REDs — and only **one** test fails,
the behavioural one. The source-pin does **not** fire (my mutation neither removes
`wireBridgeRestartNotifier({` nor introduces the string `expected one live
prime`). So the behavioural test genuinely stands alone here. That part is real.

### 3.2 But this coverage is not new

`ad32ecb` adds **no test** (§5.4: declaration list 74 → 74). The behavioural test
at `:228` is the same test that existed at `87a0c13`, renamed at its call to
`wireBridgeRestartNotifier`. In my previous pass I ran exactly this experiment —
`MUT-OWNER-BEHAV-NOGREP`, a notify-nobody implementation with the grep test
deleted — and it was **RED at `:228`** on the pre-fold tree.

So MUT-WIRING re-demonstrates coverage that was already there and which I had
already reported as working. **It is not evidence about the call site.**

---

## 4. What actually changed

Two files, `+28 / −8`:

**`daemon.ts`**
1. **New local predicate `isBridgeWatcherEntry`** (+17 lines).
2. **Honest count**: `(${rejected} entries rejected)` →
   `(${entries.length} dropped, ${malformed} malformed)`.
3. **Rename** `createBridgeRestartNotifier` → `wireBridgeRestartNotifier`
   (declaration `:234`, sole production call `:1773`). **Body unchanged.**

**`daemon.test.ts`** — four lines deleted, each replaced by its renamed/updated
counterpart: the import, the call at `:220`, the log assertion at `:274`, and the
grep string at `:282`.

**Unchanged**: `const notifyBridgeOwner = wireBridgeRestartNotifier({…})` at
`:1773` and `notifyOwner: notifyBridgeOwner` at `:1800` — the same two-step shape
as before. Nothing was extracted.

---

## 5. Dim-1 — answered by execution

### 5.1 Is `wireBridgeRestartNotifier` the actual production wiring? Partly.

Callers enumerated across the whole extension:

```
daemon.ts:234       export function wireBridgeRestartNotifier(     <- declaration
daemon.ts:1773      const notifyBridgeOwner = wireBridgeRestartNotifier({   <- ONLY production caller
daemon.test.ts:41   (import)
daemon.test.ts:220  const notifyOwner = wireBridgeRestartNotifier({         <- test calls it DIRECTLY
daemon.test.ts:282  expect(source).toContain("wireBridgeRestartNotifier({")
```

**Confirmed**: one production caller, no parallel copy — production and test do
share the same function. That part of Dim-1 #1 holds.

**Not confirmed**: that this makes the *wiring* tested. The production path has
**two** steps —

```
runDaemon → [1] wireBridgeRestartNotifier({...}) → notifyBridgeOwner
          → [2] bridgeSupervisorForDaemon({ …, notifyOwner: notifyBridgeOwner })
```

— and the test exercises only step **[1]**, by calling the function itself. Step
**[2]**, the assignment at `:1800`, is what my finding was about, and no test,
grep, type, or lint rule observes it. Renaming the step-[1] function from
`create…` to `wire…` changes its name, not what it covers.

### 5.2 The call-site re-introduction — still GREEN, all four sensors silent

I re-ran my own probe from the previous pass. For each variant I asked **every**
sensor that could plausibly catch it:

| sensor | MUT-CALLSITE-PRIMEGATE<br>*(realistic: still calls `notifyBridgeOwner`)* | MUT-CALLSITE-BLUNT<br>*(`notifyOwner: () => 0`)* |
|---|---|---|
| **1. vitest suite** | **GREEN** (exit 0) | **GREEN** (exit 0) |
| **2. source-pin grep** | `toContain("wireBridgeRestartNotifier({")` = **true**<br>`not.toContain("expected one live prime")` = **true** → **passes, blind** | same → **passes, blind** |
| **3. `tsc --noEmit`** | **exit 0, silent** | **exit 0, silent** |
| **4. `biome check`** | **exit 0, no warning** ¹ | exit 0, **1 warning** (`noUnusedVariables` at `daemon.ts:1773`) — visible to a reader, **not a gate** |

¹ **Important honesty note.** My first hand-written prime-gate replacement made
`biome` exit **1** — but reading the output, that was a pure **formatting**
complaint ("Formatter would have printed the following content", wanting the
`.filter(...).length === 1` chain on one line), **not** a lint rule detecting the
bug. So I applied biome's own preferred formatting and re-ran everything:

```
mutated daemon.ts sha256 08b69ec831e0c1542ff660235e94ddef8427e51644b502a777ba9215fa5bf932
biome check : "Checked 1 file in 19ms. No fixes applied."   exit 0, no warning
tsc --noEmit: exit 0
vitest      : Test Files 1 passed
```

**Total silence.** A coder re-introducing the single-prime bug at the call site —
writing properly formatted code, as they would — ships it past every sensor in
the repository. That is my ADV-1, unchanged.

Mutated shas for the record: PRIMEGATE (my formatting)
`3449a4a355fd33b4b85b41985a678b9a6a2ab224450482da71e05b696e8c9b4f`; PRIMEGATE
(biome formatting) `08b69ec831e0c1542ff660235e94ddef8427e51644b502a777ba9215fa5bf932`;
BLUNT `93f6a99832cf4131aa3a9bf31b4f40ebb5fca5c89f9f0a919df8c6473a8860c5`.

**The fix is still one line**, as in my previous pass:

```ts
expect(source).toContain("notifyOwner: notifyBridgeOwner");
```

It pins the **use**, not the declaration. It is still a grep, but it is a grep
aimed at the unguarded thing. (Better still: assert the deps object handed to
`bridgeSupervisorForDaemon` carries that exact reference.)

### 5.3 The honest count — confirmed, and it fixes my ADV-2 as a bonus

Same nine scenarios I ran in the previous pass, executed on **both** trees:

| case | pre-fold `87a0c13` | candidate `ad32ecb` |
|---|---|---|
| A1 sidecar absent | `has no watchers` | `has no watchers` |
| A2 `watchers: []` | `has no watchers` | `has no watchers` |
| A3 1 good + 1 bad | `(2 entries rejected)` | `(2 dropped, 1 malformed)` |
| **A4 3 good + 1 bad** ← Dim-1 #2 | `(4 entries rejected)` | **`(4 dropped, 1 malformed)`** ✅ |
| **A5 unparseable JSON** | `(0 entries rejected)` | **`(0 entries rejected)` — UNCHANGED** ⚠️ |
| A6 watchers not an array | `(0 entries rejected)` | `(0 dropped, 0 malformed)` |
| A7 no watchers key | `has no watchers` | `has no watchers` |
| **A8 bogus `pausedBy` + 1 VALID watcher** ← my ADV-2 | `(1 entries rejected)` | **`(1 dropped, 0 malformed)`** ✅ |
| A9 4 bad, 0 good | `(4 entries rejected)` | `(4 dropped, 4 malformed)` |

**Dim-1 #2 confirmed exactly**: A4 reads `4 dropped, 1 malformed`.

**And it closes my ADV-2.** A8 is the misattribution case — a sidecar rejected for
a reason that has nothing to do with the watchers (a bogus `pausedBy`), which
previously logged `(1 entries rejected)` and blamed a perfectly valid watcher.
It now reads `1 dropped, 0 malformed`: the watcher is dropped (true — the whole
sidecar is unusable) but **zero are malformed** (also true), which correctly
points the reader away from the watchers. That is a better fix than the one I
suggested.

**One gap, A5**: see ADV-2 (§7.2). The `catch` branch still emits the old wording.

### 5.4 Dim-1 #3 — owner resolution behaviour unchanged

Two independent lines of evidence:

- Across all nine scenarios above, `notifyBridgeRestartWatchers` **returned `0` on
  both trees in every case** — the delta is purely the log string.
- The happy path (3 primes + 1 watcher → exactly the watcher, primes untouched,
  no logs) is the behavioural test at `:206–233`, green in the `71 passed`
  baseline, and RED-able (§3.1).

### 5.5 No collateral (E17)

**Declaration diff** — like-for-like, both trees based on current main:

```
pre-fold (main + 816a726 + 87a0c13): 74
candidate (main + all three)       : 74
REMOVED: (none)     ADDED: (none)
```

*Method note, recorded because it nearly produced a false finding.* My first
comparison put the **main-based** pre-fold tree against the **stream-based**
as-committed tree and reported three `daemon signal shutdown` tests "removed".
Those tests come from main's drift and were never in the stream branch — an
apples-to-oranges artifact, not a deletion. Corrected above.

**Line diff**, because a declaration diff cannot see an assertion dropped from a
surviving test. `ad32ecb` deletes exactly four lines from `daemon.test.ts`:

```
-	createBridgeRestartNotifier,                                    -> renamed import
-		const notifyOwner = createBridgeRestartNotifier({            -> renamed call
-		expect(...).toContain("...(2 entries rejected)");            -> replaced by the new assertion
-		expect(source).toContain("createBridgeRestartNotifier({");   -> renamed grep
```

Every deletion has a replacement. **No assertion lost.** Two files touched, both
in fence.

---

## 6. Gates

| gate | as-committed `ad32ecb` | picked onto fresh main |
|---|---|---|
| `npx tsc --noEmit` | **exit 0** | — |
| `npx biome check` (both fence files) | **exit 0** | — |
| `npx vitest run daemon.test.ts` | **71 passed \| 2 skipped** | 74 declarations, green |
| full suite | — | **4693 passed**, 1 failed |

The one full-suite failure is `harness/scripts/release-age-policy.test.ts —
spawnSync pwsh ENOENT`. `pwsh` is not installed on this machine. I proved this
pre-existing during the item-24 pass ~25 minutes ago by running the same file
against the **unmodified `origin/main`** worktree at the same sha (`0120c8da`)
and getting the identical failure; I am reusing that evidence rather than
re-deriving it (declared in §1). It touches no fence file.

Working trees were clean (`git status --porcelain` empty) for every gate.

---

## 7. Advisories

### 7.1 ADV-1 (CARRIED, NOT CLOSED) — the call-site wiring is still unguarded

Restated because it is the reason this fold exists and it is still true. Measured
in §5.2: a realistic, correctly-formatted re-introduction of the single-prime bug
at `daemon.ts:1800` passes **the test suite, the source-pin grep, `tsc`, and
`biome`** with no output of any kind.

**Recommendation**: please do **not** mark ADV-1 closed in the plan or PR text. The
one-line fix from my previous pass still applies verbatim. I would rather the
ledger say "open, one-line fix known" than "closed" on the strength of a rename.

I want to be fair about intent: naming the function `wire…` plausibly *reads* as
"this is the wiring, and it is tested". But the wiring is the assignment that
hands the closure to `bridgeSupervisorForDaemon`, and that assignment is a
separate statement no sensor observes. A rename cannot move coverage.

### 7.2 ADV-2 (NEW) — the honesty fix is incomplete: the `catch` branch kept the old wording

`daemon.ts:184` still emits, as a hardcoded literal:

```ts
"telegram: restart owner notice skipped — watchers file unreadable/malformed (0 entries rejected)"
```

So two formats now coexist under one prefix, and **the one an operator hits on a
genuinely corrupt file is the less informative** (A5: `(0 entries rejected)` — a
hardcoded `0` carrying no information, in the very wording MUT-HONESTLOG proves
was meant to be retired).

`grep -rn "entries rejected"` over the whole extension returns **exactly one
hit** — that line. **No test asserts it**, so it is entirely unsensored:
MUT-HONESTLOG guards the new string only.

Cheap fix: make it `(unreadable — parse failed)` or similar, so the two branches
are distinguishable and neither claims a count it does not have. This is small,
but it is the branch that fires when the file is actually broken.

### 7.3 ADV-3 (NEW, low) — `isBridgeWatcherEntry` is a hand-copy of `isWatcher`, unpinned

`daemon.ts:142`'s new `isBridgeWatcherEntry` is a line-for-line duplicate of
`isWatcher` + `isCapturePolicy` from `adapters/watchdog-store.ts:12–33`. I read
both: **they agree exactly today.**

But the `malformed` count is only honest while they agree, and nothing enforces
that — `isWatcher` is not exported, so the copy was the path of least resistance.
If the watcher schema gains a field, `parseSidecar` will start rejecting entries
that `isBridgeWatcherEntry` still calls well-formed, and the log will report
`N dropped, 0 malformed` for a genuinely malformed file — silently re-creating a
milder version of the misattribution A8 just fixed.

Cheapest fix: export `isWatcher` and use it (the packet in fact describes the
implementation as *"M via `filter(isWatcher)`"* — worth noting that is **not** what
the code does).

### 7.4 ADV-4 (carried) — the prime assertions remain structurally weak

From the previous pass: `for (const id of ["prime-a","prime-b","prime-c"])
expect(messageBodies(id)).toEqual([])` passes for a notifier that messages nobody.
The `toBe(1)` and watcher assertions carry the test. Unchanged here; noted so it
is not lost.

---

## 8. INFO

1. **Both claimed RED lines were exact** (228, 274). Second packet running.
2. **`patch-id --stable` disagreeing does not mean a conflict-resolved pick is
   unfaithful** — it hashes context, which main drifted. The changed-line-set diff
   is the right instrument and returned identical sets (35 = 35).
3. **The cherry-pick conflicts three times**, all in the import block; the third
   requires noticing that `ad32ecb` *removes* `createBridgeRestartNotifier`.
   Whoever raises the PR should expect this.
4. **A declaration diff must compare like-for-like trees** — see the §5.5 method
   note where a mismatched pair briefly showed three phantom deletions.
5. **`biome check` exit 1 is not always a lint signal.** Here it was a formatter
   complaint about my hand-written line breaks. Any mutation-based claim about
   biome must re-run under biome's own formatting before concluding anything.
6. **The fold adds no new test.** Every change to `daemon.test.ts` is a rename or
   an assertion update. That is not a criticism of the honest-count half — it is
   the reason the wiring half cannot have moved.

---

## 9. Teardown

- All four `/tmp/pij-29bw-*` worktrees removed; `git worktree list` verified back
  to the legitimate four.
- Probe deleted from both trees **before** gates ran (`git status --porcelain`
  empty, §6).
- Fence files sha-verified pristine after every mutation and at exit
  (`637c96f3…` / `0c3eb85e…`).
- Harnesses, backups and list captures removed.
- **No branch checked out, no commit, no push, no repository file modified** other
  than writing this review.

---

## 10. Bottom line

**Merge it — it loses nothing and the honest count is a genuine improvement that
closes my ADV-2 more neatly than my own suggestion would have. But record ADV-1
as still open.**

The honest-count half is confirmed by execution: A4 reads exactly
`4 dropped, 1 malformed`, A8's misattribution is gone, behaviour is unchanged
across all nine scenarios, MUT-HONESTLOG REDs at the exact claimed line, and
there is no collateral by two methods.

The wiring half does not do what the packet says. `createBridgeRestartNotifier`
was renamed, not extracted; the behavioural test still exercises the factory in
isolation; MUT-WIRING re-proves coverage I had already confirmed at `87a0c13`;
and my call-site re-introduction is **still GREEN with all four sensors silent**,
verified under biome's own formatting so the silence cannot be dismissed as an
artifact of how I wrote the mutation.

Two small new findings alongside: the `catch` branch kept the retired wording
(§7.2), and the new watcher predicate is an unpinned hand-copy of one that already
exists (§7.3).

*Written once, then closed. No mutation ran after this file was written.*
