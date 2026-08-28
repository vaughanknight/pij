# 29b-T001 DEPS fold — cold review verdict

> **TERMINAL REPORT.** This pass is CLOSED. No mutation was run after this file
> was written. Every claim below was produced by execution on disk, in throwaway
> worktrees built from `origin/main`, before this file existed.

**Candidate**: `5b77c99f4d35330044ab3ed1637492d9accda836`
**Chain**: `816a726 → 87a0c13 → ad32ecb → 2773771 → 5b77c99`
**Reviewed**: 2026-08-28
**Packet**: `docs/plans/392-day3-codex-doctrine/reviews/item-29b-t001-deps-packet.md`

---

## VERDICT: ✅ **APPROVE**

Every mechanical claim in the packet is **true and reproduced on disk**:

- `MUT-CALLSITE-HOME.patch` applies cleanly, **REDs exactly the pathFor test**,
  does **not** RED the adjacent source pin, and `git apply -R` restores to a
  **byte-identical** sha with a GREEN re-run.
- **E40 uniqueness holds**, and I proved it the strong way — by differential
  against the pre-fix tree, not by reading. The semantically identical mutation
  is **repo-wide silent** on `2773771` and **RED** on `5b77c99`.
- The extraction is real (Dim-1 #1), the log-path honesty fix is complete and
  **fully sensored — 4 branches, 4 independent sensors** (Dim-1 #2), and there
  is **zero collateral** (Dim-1 #3).

The fold closes the hole I reported at `2773771`. It is a genuine improvement
and I recommend it ship.

**Three advisories and one correction to the packet follow.** None is blocking.
All concern the **boundary** of what this fold closed — the fold makes the deps
*factory* testable and tests one field of it; it does not make the *call site*
that uses the factory sensored. My original finding class is narrowed, not
eliminated.

**I am also correcting the packet's Dim-1 #4**: `runDaemon` is **not** unbooted
on this seam. It is booted, and the new factory **is executed** by 7 tests —
they simply assert nothing about it. That changes what the follow-up item needs
to build (§7.4).

---

## 1. Scaffolding — stated before findings

Four throwaway worktrees, all `--detach`, all torn down (§8):

| tree | contents | purpose |
|---|---|---|
| `/tmp/pij-deps-picked` | `origin/main` + all 5 picks | **the candidate under review** |
| `/tmp/pij-deps-pre` | `origin/main` + first 4 picks (`2773771`) | **pre-fix control** — where my probe was silent |
| `/tmp/pij-deps-asis` | `5b77c99` as committed | line-number / byte fidelity reference |
| `/tmp/pij-deps-main` | `origin/main` unmodified | environmental baseline |

`node_modules` symlinked from the canonical checkout in each.

**Mutation harness** (`/tmp/deps-mut.py`) enforced, on every apply:
pristine precondition → **anchor uniqueness (exactly N)** → no-op refusal →
print mutated sha → restore from self-captured bytes → verify sha + `git status`.

### 1.1 What I did NOT examine — a stated gap, not a clean bill

- **No live daemon and no live Telegram send.** Everything is in-process.
- **No concurrency.** Nothing here was raced.
- I did not audit the other **119 commits** of main drift beyond confirming
  which of them touch the fence (§2).
- I did not review the **item-24 / bridge / sqlite** work that sits in the same
  branch history; `5b77c99`'s own delta is 3 files (§2) and I confined myself to
  those.
- `deps.registry`, `deps.channel` and `deps.log` I did **not** mutate. I mutated
  `store`, `pijHome` and `now` (§5.3). My "1 of 6 fields sensored" claim is
  therefore **proven for 3 fields and inferred for 3**; the inference is from
  reading the single `expect` in the pathFor test, not from execution.
- I did **not** verify the fold against a Windows/`pwsh` environment (§6).
- The **flakiness** of `pij-skill-check.test.ts` (§7.6) I established with two
  isolated runs, not a repeat-count study.

### 1.2 A scaffolding defect of my own, disclosed

My first automated conflict-resolver run **corrupted the import block** of
`daemon.test.ts` on the `pre` tree, producing a `PARSE_ERROR` at line 40 and a
file-level suite failure. That failure was **mine, not the code's**. I repaired
the block by hand, committed the repair, and **re-established a GREEN pre
baseline (89 passed / 2 skipped) before running any mutant on that tree.** The
`pre` results in §5.2 come from the repaired tree only. I am recording this
because a reviewer who silently discards a bad run is indistinguishable from one
who never had it.

### 1.3 Pristine shas (candidate tree, verified again at exit)

```
3b4a3253ea6b2943785d537d77aad4157bc447867452f2e88c082ebb72791030  daemon.ts
acd660a0caa417a92739159f64d4fb541564f2e516c300069da92cd25734c49b  daemon.test.ts
```

---

## 2. Branch shape and pick fidelity

**Main moved again during this review's setup** — it was `a816c5b` at my last
review and is `e6a55e8` now. I re-derived rather than trusting the packet:

- merge-base `10483d8e`; main **119 ahead**, candidate 148 ahead.
- **Main HAS drifted on the fence** — 8 commits touch `daemon.ts`/`daemon.test.ts`
  (`7572370`, `36a6403`, `f4dbf49`, `f1d72f3`, `1e79a14`, `1fca60e`, `42fceda`,
  `56819f1`). So the cherry-pick conflicts are real and expected, and every line
  number in the packet legitimately shifts on the reconciled tree (§3.1).

**`5b77c99`'s own delta is 3 files**, not the 18 that `git diff 2773771..5b77c99`
reports — that command is a *tree* diff and 5b77c99's real parent is `35a6955`,
with the item-24 chain in between. Its actual commit delta:

```
.pi/extensions/pij/daemon.test.ts   | 41 ++++--
.pi/extensions/pij/daemon.ts        | 45 ++++---
.../item-29b-bridge-advisories/MUT-CALLSITE-HOME.patch | 22 +++
3 files changed, 88 insertions(+), 20 deletions(-)
```

**Pick fidelity proven, not assumed.** I extracted every `+`/`-` line from the
as-committed fold delta and from my reconciled tree's equivalent and compared
them as sets:

```
lines in ASIS not in PICKED :  (none)
lines in PICKED not in ASIS :  6 — all import-block reflow from the union resolve
```

**Zero changed lines of the fold were lost in reconciliation.** The 6 extras are
main's `nodeRequire`/`TSX_CLI`/`DAEMON_BIN` block and the `import {` line moving
within the hunk. The picked tree is uncompromised evidence.

Conflict resolution followed the packet: union on imports, **drop
`createBridgeRestartNotifier`** (renamed to `wireBridgeRestartNotifier` by
`ad32ecb`), **keep `createDaemonRegistry`** (main's).

---

## 3. The mechanical oracle — RUN, not read

### 3.1 Line claims: **accurate as-committed**, shifted on the reconciled tree

I checked the packet's claims against the file rather than believing them.

| claim | as-committed `5b77c99` | my reconciled tree |
|---|---|---|
| `daemon.ts:230` = store-root line | **:230 ✅ exact** | :232 (+2, main drift) |
| `daemon.test.ts:319` = the factory call in the pathFor test | **:319 ✅ exact** | :327 (+8) |
| patch hunk `@@ -226,10 +226,10 @@` | spans **:226–:235**, contains :230 ✅ | applied at :228, "offset 2 lines" |

**I confirmed the patch's hunk range actually contains the code path whose
coverage is claimed** — :226 is `): BridgeRestartNotifierDeps {` and the 10-line
span reaches :235, enclosing the store-root line. This is the check that caught a
misdirected oracle at `2773771`; here it passes.

### 3.2 MUT-CALLSITE-HOME: RED → restore → GREEN

```
git apply MUT-CALLSITE-HOME.patch   → "Applied patch cleanly", offset 2 lines
post-apply sha : 772794a980aefc9e89cc36121f76625ce91e0efb4ffa95f4eb07a30a348b7732
mutated line   : 232: store: new FsWatchdogStore(join(pijHome, "nope")),
```

**Fence result — exactly one test RED:**

```
FAIL daemon.test.ts > Daemon.tick … > constructs bridge notifier storage under the daemon pijHome
❯ .pi/extensions/pij/daemon.test.ts:334:46      (= :326 as-committed)
Tests  1 failed | 89 passed | 2 skipped (92)
daemon.bootstrap.test.ts (14 tests) ✓ ALL PASSED
```

**The source-pin test did NOT RED.** The packet's discrimination requirement —
"exactly the pathFor test reds, the source pin still passes" — is **confirmed**.

**Repo-wide uniqueness**, full suite under the mutant:

```
Tests  2 failed | 4694 passed | 19 skipped (4715)
FAIL daemon.test.ts > … constructs bridge notifier storage under the daemon pijHome
FAIL harness/scripts/release-age-policy.test.ts …   ← pre-existing, re-derived §6
```

**Restore:**

```
git apply -R  → exit 0
restored sha : 3b4a3253…1030   ==  pristine sha : 3b4a3253…1030   git-clean: []
re-run       : Test Files 1 passed | Tests 76 passed | 2 skipped
```

RED → byte-identical restore → GREEN. **Oracle honest.**

---

## 4. E40 uniqueness — proven by differential, and precisely restated

The packet asks me to confirm "the mutant must lie in code NO PRE-EXISTING test
drove". Reading cannot establish that. I ran the **semantically identical
mutation on the pre-fix tree**, where the same construction lived at
`daemon.ts:1788` as `const bridgeCaptures = new FsWatchdogStore(pijHome)`:

| tree | mutation | tsc | full suite | daemon sensors RED |
|---|---|---|---|---|
| `pre` = `2773771` | `new FsWatchdogStore(join(pijHome,"nope"))` @:1788 | **0** | 4694 passed | **NONE — silent** |
| candidate = `5b77c99` | committed `MUT-CALLSITE-HOME.patch` @:232 | 0 | 4694 passed | **1 — the pathFor test** |

This re-derives my original `2773771` finding **verbatim and independently**, and
proves the fold converts a repo-wide-silent regression into a caught one.
Baselines: pre **89 passed**, candidate **90 passed** — exactly `+1`, the new test.

### 4.1 One precision the packet gets slightly wrong, in a way that matters

"No pre-existing test **drove**" the line is **not** true — 7 pre-existing tests
execute it (§7.4). What is true, and what E40 actually needs, is that **no
pre-existing test SENSED it**. The differential above proves the sensing claim
directly. I flag the wording because "drove" and "sensed" diverge here, and the
gap between them is precisely where advisories W1–W3 live.

---

## 5. Dim-1, answered by execution

### 5.1 The extraction is real (Dim-1 #1) — ✅ confirmed

`grep -n 'bridgeCaptures' daemon.ts` → **zero references.** The old untested
intermediate is gone. `runDaemon` now reads:

```ts
notifyOwner: wireBridgeRestartNotifier(
    bridgeNotifierDepsForDaemon(pijHome, registry, channel, log),
),
```

The factory result is passed **directly**, with no intermediate. Confirmed.

### 5.2 Log-path honesty (Dim-1 #2) — ✅ confirmed, and **fully sensored**

All 4 skip branches now carry the resolved sidecar path. Rather than read them,
I **mutated each branch separately** to drop the path — because a test that
varies several fields at once leaves individual fields unsensored:

| mutant | branch | result | RED at |
|---|---|---|---|
| MUT-PATH-1 | malformed-parse (`N dropped, M malformed`) | **RED** | `daemon.test.ts:299` |
| MUT-PATH-2 | ENOENT → "has no watchers" | **RED** | `:257` |
| MUT-PATH-3 | other read error → "unreadable/malformed" | **RED** | `:321` |
| MUT-PATH-4 | empty watchers array | **RED** | `:271` |

**4 branches, 4 mutants, 4 distinct single-test REDs.** Every branch has its own
independent sensor. This is exactly right and I want it noted as a positive —
it is the discipline that was missing from earlier folds in this stream.

I also **measured** the honesty property end-to-end: with a wrong home, both the
watcher-skip log *and* the bridge-log ENOENT message name the wrong resolved
path, so a misconfigured home cannot impersonate a legitimate no-watchers
result. The claim holds.

### 5.3 What the new test actually covers — 1 field of 6

The pathFor test contains **exactly one `expect`**, on `deps.store.pathFor(...)`.
I mutated the other fields I could mutate meaningfully:

| field | mutant | fence result |
|---|---|---|
| `store` | `FsWatchdogStore(join(pijHome,"nope"))` | **RED** (the oracle) |
| `pijHome` | `pijHome: join(pijHome, "nope")` | **SILENT — 90 passed** |
| `now` | `now: () => 0` | **SILENT — 90 passed** |

The `now` run initially returned a **vacuous** "90 passed": my harness's
**anchor-uniqueness invariant aborted the apply** (the anchor occurred twice) and
the suite ran on a pristine tree. I re-ran with a unique anchor and **confirmed
the mutation on disk at `:234` before trusting the result.** Recording this
because an aborted-apply "GREEN" is the classic false pass.

### 5.4 No collateral (Dim-1 #3) — ✅ clean, by list *and* by line

Counts alone are blind, so I diffed the **declaration lists** via `npx vitest list`
across `daemon.test.ts` + `daemon.bootstrap.test.ts`, pre vs candidate:

```
pre 89   candidate 90
REMOVED : (none)
ADDED   : daemon.test.ts > Daemon.tick … > constructs bridge notifier storage under the daemon pijHome
```

A declaration diff cannot see assertions deleted from a **surviving** test, so I
also line-diffed the assertions:

```
REMOVED assertions (2):
  - expect(logs.join("\n")).toContain(          ← reflow; replaced by 3 stronger assertions
  - expect(source).toContain("notifyOwner: wireBridgeRestartNotifier({");   ← REAL WEAKENING
ADDED assertions: 8
```

**Exactly one assertion was genuinely weakened**: the source pin dropped the `{`.
That is deliberate and documented in the code — and it is the root cause of
advisory **W2** below.

---

## 6. Gates (candidate tree, pristine, `git status` empty)

| gate | result |
|---|---|
| `tsc --noEmit` | **exit 0** |
| `biome check` (fence) | **clean, 0 findings** |
| fence suite | **90 passed \| 2 skipped (92)** |
| full suite | 4695 passed \| 19 skipped, **1 failed** |

The single failure is `harness/scripts/release-age-policy.test.ts` →
`spawnSync pwsh ENOENT`. **Re-derived this run on the unmodified `e6a55e8`
worktree** (1 failed / 9 passed), and `which pwsh` → not installed. It is
**environmental (macOS), pre-existing, and untouched by this fold.** I did not
reuse a prior derivation.

---

## 7. Findings

### W1 — advisory: the **call-site argument binding** is unsensored

The fold moves the store construction into a tested factory. But the `pijHome`
the factory receives is still bound at an untested call site. I mutated the
**argument**, not the function body:

```ts
// daemon.ts:1831
bridgeNotifierDepsForDaemon(join(pijHome, "nope"), registry, channel, log)
```

**Result — repo-wide SILENT:**

```
tsc          : exit 0
biome        : clean, 0 findings
full suite   : 4695 passed | 19 skipped | 1 failed (the pwsh test only)
daemon fence : GREEN
```

The failure mode is identical to the one this fold exists to fix — the watchdog
store roots under `<home>/nope`, the owner notice reaches nobody — and it remains
undetected by every deterministic sensor in the repo.

**This directly contradicts the comment shipped in the test:**

```ts
// Source pin: wrapping form only. The pathFor test above senses argument regressions.
```

The pathFor test senses argument regressions **inside** `bridgeNotifierDepsForDaemon`
— it calls the factory with a known-good `home`. It does **not** sense argument
regressions **at the call site**, which is where the arguments are actually bound.
As written the comment would tell a future maintainer the call site is covered.
It is not. **Recommend rewording regardless of whether W2's fix lands.**

### W2 — advisory: the weakened source pin re-admits the original bug

The pin changed from `"notifyOwner: wireBridgeRestartNotifier({"` to
`"notifyOwner: wireBridgeRestartNotifier("`. That change was *necessary* (the new
call site is not an object literal), but it is strictly weaker in the direction
that matters: the old pin **rejected** the literal form, the new one **accepts**
it.

So I reverted the call site to an inline literal carrying the original bug —
bypassing the factory entirely:

```ts
notifyOwner: wireBridgeRestartNotifier({
    pijHome, registry,
    store: new FsWatchdogStore(join(pijHome, "nope")),
    channel, now: () => Date.now(), log,
}),
```

**Result — the pre-fold bug is back, with every guard GREEN:**

| sensor | verdict |
|---|---|
| `tsc --noEmit` | exit 0 |
| `biome check` | clean |
| source pin (`wireBridgeRestartNotifier(`) | **GREEN — still matches** |
| new pathFor test | **GREEN — factory simply never called** |
| whole daemon fence | **GREEN** |

(The full run showed `pij-skill-check.test.ts` failing; I checked it rather than
claiming a catch — it **passes in isolation on both the mutated and restored
trees**, so it is flaky under full-suite parallelism, not a sensor. See §7.6.)

**Proven fix.** I verified a one-line strengthening discriminates, rather than
suggesting it untested — string-checked against both the pristine source and the
mutant text:

| candidate pin | pristine | W2 mutant | W1 mutant |
|---|---|---|---|
| `notifyOwner: wireBridgeRestartNotifier(` *(shipped)* | ✅ | ✅ **accepts** | ✅ **accepts** |
| `bridgeNotifierDepsForDaemon(pijHome, registry, channel, log)` | ✅ | ❌ **rejects** | ❌ **rejects** |

One added `toContain` closes **both W1 and W2**. It is still only a source pin —
a real `runDaemon` assertion (§7.4) is the durable answer — but it is cheap,
proven, and strictly better than what shipped.

### W3 — advisory: 1 of the factory's 6 fields is asserted

Per §5.3: `store` is sensored; `pijHome` and `now` are proven silent. `pijHome`
is not inert — it is consumed at `daemon.ts:254` to attach the bridge-log tail to
the operator's restart notice. I **measured** the harm rather than asserting it,
mutating only that one field (leaving `store` correct, faithful to the mutant):

| scenario | watchers notified | notice delivered | bridge-log evidence in capture | capture bytes |
|---|---|---|---|---|
| shipped factory | 1 | true | **true** | **99** |
| `pijHome` field wrong | 1 | true | **false** | **58** |

The notice still arrives and still looks healthy; the operator's diagnostic
capture silently loses the bridge log. **The whole suite stays GREEN (90 passed).**

This matters more than a generic coverage gap because main's own governance log
currently carries *"bridge log sink dead since item 29 (in-process)"* and
*"release notes — in-process bridge log gap (must precede the tag)"*. The bridge
log tail is an **active, pre-tag concern**, and the single dep that resolves its
path is unsensored.

**Mitigating, and I want it on the record:** the failure is *not* silent to an
operator reading daemon logs — the catch at `:255` emits
`telegram: restart capture has no bridge log tail — ENOENT … open '<wrong path>'`,
naming the wrong path explicitly. That is the fold's own honesty principle
working. The gap is in the **test suite**, not in the runtime's candour.

### 7.4 — **Correction to the packet: Dim-1 #4 is wrong**

The packet asks me to "confirm runDaemon itself remains UNBOOTED on this
reconciled seam". **It is not unbooted.** `daemon.bootstrap.test.ts` calls
`runDaemon()` at six sites, and it exists on `origin/main`, on the merge-base and
on the candidate.

I did not stop at "it is called" — I tested whether the new factory is actually
**executed**, by making `bridgeNotifierDepsForDaemon` throw:

```
Error: REVIEWER-EXECUTION-PROBE
daemon.bootstrap.test.ts → 7 failed | 7 passed (14)
```

**7 of 14 bootstrap tests execute the new factory** (the four `runDaemon — first-run
home bootstrap` cases and three `PIJ_HOME resolves identically` cases).

So the honest characterisation is **"executed by 7 tests, asserted by none"** —
not "unbooted". That is exactly why W1 is silent: the line runs on every one of
those tests and nothing looks at it.

**This changes the follow-up.** A `runDaemon` *boot* test already exists; adding
another buys nothing. What 29b-rest needs is an **assertion on the notifier
wiring inside an already-booted `runDaemon`** — e.g. asserting the watchdog
sidecar resolves under the injected `pijHome` after boot. Scoping the item as
"add a runDaemon boot test" would close it without closing the gap.

The packet's underlying intent — *do not silently claim the seam is covered* — is
sound, and the fold does not overclaim in code. Only the packet's stated reason
is inaccurate.

### 7.5 — INFO: `git diff 2773771..5b77c99` overstates the fold by 15 files

Because `5b77c99`'s real parent is `35a6955` and the item-24 chain sits between
the two shas. Anyone sizing this fold from that command will review the wrong
change set. The commit's own delta is 3 files (§2).

### 7.6 — INFO: `pij-skill-check.test.ts` is flaky under the full suite

It failed in exactly one of my five full-suite runs and **passed in isolation on
both the mutated and the restored tree**. Not caused by this fold; recorded so a
future run that trips it is not mistaken for a regression — and so my own W2
result is not mistaken for a catch.

### 7.7 — Credit

Three things in this fold are done properly and I do not want them lost in the
advisories:

1. **The oracle is honest.** It applies, it REDs the claimed test and only that
   test, it discriminates against the source pin, and it reverses to a
   byte-identical tree. Committing the patch as a reviewable artifact is the
   right pattern — it let me check the hunk range against the claim.
2. **The log-path fix is per-branch sensored** — 4 branches, 4 independent
   mutants, 4 distinct REDs. That is the standard the earlier folds in this
   stream missed.
3. **This is a real correction of a real miss.** The previous MUT-WIRING mutated
   already-tested code and proved nothing; this one targets the line that was
   genuinely unsensored, and the pre-tree differential proves it.

---

## 8. Teardown

- Probe files (`depsprobe.mts`, `depsprobe2.mts`) removed **before** the final
  gate runs, so `git status --porcelain` was empty for every reported gate.
- Fence shas re-verified pristine at exit (§1.3) — both match.
- `git apply -R` verified byte-identical; every harness mutation restored and
  sha-verified.
- All four worktrees removed; `/tmp` scratch cleared.

---

## 9. Bottom line

**APPROVE.** The packet's mechanical claims are all true and I reproduced every
one of them on disk. `MUT-CALLSITE-HOME` REDs the pathFor test at
`daemon.test.ts:326` (as-committed), leaves the source pin GREEN, and reverses
cleanly. E40 uniqueness is established by differential — the same mutation is
repo-wide silent on `2773771`. The log-path honesty fix is complete and every
branch is independently sensored. There is no collateral.

The fold closes the hole I found at `2773771`. What it does **not** close is the
call site: **W1** (wrong argument) and **W2** (bypass the factory entirely) are
both repo-wide silent, and one proven `toContain` closes both. **W3** notes that
one of six deps fields is asserted, with the `pijHome` regression measured at a
99 → 58 byte loss of operator evidence while the suite stays GREEN.

And the packet's Dim-1 #4 should be corrected before it drives 29b-rest:
`runDaemon` is booted and this code **is** executed by 7 tests — the gap is
assertion, not boot.

`5b77c99f4d35330044ab3ed1637492d9accda836`
