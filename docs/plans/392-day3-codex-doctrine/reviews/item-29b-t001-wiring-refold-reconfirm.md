# 29b-T001 wiring RE-FOLD — re-confirm (cold review)

> **TERMINAL REPORT.** This pass is CLOSED. Every mutation was applied, measured and
> reverted before this file was written; the three fence files were sha-verified pristine and
> all scaffolding was torn down **before** this file was created. No mutation, probe or repo
> write ran after this point. The only repository write I made is this file.

**Candidate**: `277377142864cb57c9cb6e772b1f328517865908` (chain `816a726 → 87a0c13 → ad32ecb → 2773771`)
**Reviewed as**: the chain cherry-picked onto fresh `origin/main` (`536e5a3c`), conflicts resolved per packet
**Reviewer**: `pij-wilful-morton` (cold)

---

## VERDICT: split — ✅ **ADV-2 and ADV-3 closed** · ❌ **ADV-1 narrowed but NOT behaviourally closed**

This is a **real improvement** on `ad32ecb` and I recommend merging it. Two of my three findings
are closed outright and proven closed by execution. The extraction *is* structurally real this
time — the untested intermediate `notifyBridgeOwner` is gone, and the source pin is tightened
from `wireBridgeRestartNotifier({` to `notifyOwner: wireBridgeRestartNotifier({`, which now
catches a call-site wrapping mutation that was completely silent at `ad32ecb`.

**But the packet's headline claim is false**, and it is false in a way that matters:

> "MUT-WIRING → the behavioural wiring test RED **even with the source-pin grep deleted**
> (prove **the behavioural test alone catches the call-site regression** — the whole point vs ad32ecb)"

`MUT-WIRING.patch` mutates **lines 215–247 — the body of `wireBridgeRestartNotifier`** — not the
call site at `daemon.ts:1808`. The behavioural test calls that factory **directly** at
`daemon.test.ts:228`. So the oracle proves the *factory* is behaviourally tested, which my
previous review already established was true back at `87a0c13`. It demonstrates nothing about
the call site.

I ran the oracle exactly as instructed (it does what it says), and then ran the mutation it
does **not** cover:

| mutation | pinned substring | tsc | biome | vitest | verdict |
|---|---|---|---|---|---|
| `MUT-WIRING` (the oracle, grep deleted) | n/a | — | — | 🔴 RED `:236` | factory is covered |
| `MUT-CALLSITE-WRAP` (wrap the expression) | **broken** | 0 | — | 🔴 RED `:311` **(grep only)** | grep covers wrapping |
| **`MUT-CALLSITE-HOME`** (one token, args) | **intact** | 0 | **clean** | ✅ **75 passed** | **SILENT** |

`MUT-CALLSITE-HOME` measurably reintroduces the LIVE-confirmed bug this whole item exists to
fix — **owner notified 1 → 0** — and every sensor stays quiet.

So: **ADV-1's coverage is a string pin, not behavioural coverage.** Please do not record it as
behaviourally closed.

---

## §1 — Scaffolding, and the limits of this pass (stated before the findings)

**Trees built** (all torn down — §8): `/tmp/pij-29bx-picked` (chain on fresh main — **primary
evidence**), `-asis` (`2773771` as committed), `-pre` (`ad32ecb`, differential control), `-mid`
(`ad32ecb` picked onto the *same* main, for a like-for-like declaration diff), `-main`
(unmodified `origin/main`, gate baseline). Helper: `/tmp/29bx-callsite.py` (pristine
precondition, anchor uniqueness, no-op refusal, prints mutated sha, restores from captured
bytes) plus two `.mts` probes, deleted **before** the gates ran (`git status --porcelain` empty).

**Pristine shas** (picked tree; verified before/after every mutation and again at teardown):

```
daemon.ts          3f9941689a7ad5cac89e7a883cedaeedb3828c5ef78112d1a92a46498b92be0b
daemon.test.ts     afdc80c039e84015f9132810c9d8669ff9583cc11d42e9d9e5db1c9ed0175561
watchdog-store.ts  58e4806556efd54e05739039b6fe6329ce6cc6475825abd5fccfff13d3b6cb8f
```

### What I did **not** examine

- **`runDaemon` was never executed.** As at `ad32ecb`, no test boots it. This is not incidental
  — it is the *reason* ADV-1 cannot be behaviourally sensed, and it means my call-site
  mutations were sensed only through the four static/unit sensors, never through a running daemon.
- **No live Telegram bridge, no real restart.** `MUT-CALLSITE-HOME`'s harm is measured by
  driving `wireBridgeRestartNotifier` with the two store paths, not by restarting a bridge.
- **No concurrency**, no EACCES/permission cases on the watchers sidecar.
- **`MUT-CALLSITE-HOME` is my construction.** I am claiming the wiring is unsensored and that
  this specific regression is realistic and silent — I am **not** claiming anyone did it.
- I did **not** review the non-fence content of the chain, only the three fence files.
- **ADV-4 (weak prime assertions)** is out of scope per the packet; I confirmed it is not
  silently relied on by anything I ran, but I did not re-examine it.

---

## §2 — Branch shape and fidelity

- `origin/main` = `536e5a3c`, **105 commits** ahead of the merge-base `10483d8e`. Re-derived,
  not taken from the packet.
- **Main's drift lands IN-FENCE**: `daemon.ts` +254/−…, `daemon.test.ts` +192/−… (411 insertions,
  35 deletions). So the picked tree ≠ the as-committed tree for two of three files, exactly as
  last time.
- The pick **conflicted three times**, all in the `daemon.test.ts` import block. Resolved per
  the packet (union of main's + 29b's imports; `createBridgeRestartNotifier` dropped at
  `ad32ecb`; `createDaemonRegistry` kept). A fourth conflict hit `MUT-WIRING.patch` itself — I
  took the candidate's version, since that is the oracle I was asked to run.
- **`patch-id` cannot certify a conflict-resolved pick** (it hashes context), so I used the
  changed-line-set substitute on the final commit: **67 lines vs 67 lines, `IDENTICAL changed-line
  sets`.** `watchdog-store.ts` is additionally byte-identical to the as-committed tree.

---

## §3 — Mutation ledger (Dim-0)

Baseline on the picked tree: **75 passed | 2 skipped** (`daemon.test.ts`).

### 3.1 The mechanical oracle (E37) — I ran it on disk

Per instruction I **deleted the source-pin assertion first**
(`daemon.test.ts` → sha `06c1c1ec…`), then applied the committed patch:

| step | sha256 | result |
|---|---|---|
| `git apply MUT-WIRING.patch` | `daemon.ts` → `db7b42070a2568e82d57b6bfa610192435f88f03d6a827ca5b1de0e925db5f65` | 🔴 **1 failed** — *"notifies every pij-telegram watcher instead of inferring one prime owner"* at **`daemon.test.ts:236`** |
| `git apply -R` | `daemon.ts` → `3f994168…` | ✅ **exactly pristine** |
| grep assertion restored | `daemon.test.ts` → `afdc80c0…` | ✅ exactly pristine |

**Confirmed as claimed** (the packet says RED @228; 228 is the line where the test *constructs*
the factory, 236 is the failing assertion — a trivial off-by-context, noted for accuracy).

### 3.2 MUT-HONESTLOG-CATCH — ADV-2

| mutation | mutated sha | result |
|---|---|---|
| revert catch to `(0 entries rejected)` | `a00f6c7ecaf7dbb1b8c57c189248bb06c5695f52c4398937dbb82f43b3bee8a1` | 🔴 RED at **`daemon.test.ts:304`** — *"reports unparseable watcher JSON without inventing a rejected-entry count"* |

(Packet claimed `:296`; actual `:304` in the picked tree — line numbers shift with main's
in-fence drift, so this is expected rather than an error.)

### 3.3 My call-site mutations — the ones the oracle does not cover

| mutation | mutated sha | pinned substring | result |
|---|---|---|---|
| `MUT-CALLSITE-WRAP` — wrap the expression in a single-prime gate | `f3dec9550bd1879275ad02fb11b1647daf5692be4ed6b719104c3064d9d8ec33` | **broken** | 🔴 RED `:311` — **the grep test only**; the behavioural test stayed GREEN (74 passed) |
| **`MUT-CALLSITE-HOME`** — `new FsWatchdogStore(pijHome)` → `new FsWatchdogStore(join(pijHome, "nope"))` | `f45e193a0f8a9147303951071a4ee0971997aaa7e6fe8a8b6fc91513bb27b175` | **intact** | ✅ **tsc 0 · biome clean · vitest 75 passed · grep GREEN — TOTAL SILENCE** |
| `MUT-CALLSITE-STORE` — same idea, inline at the property | `0d4e04d9f09ce016447af614a9f3c5e77c9cc8cd10e366365a8665348051f12f` | intact | vitest 75 passed; biome emitted **1 warning, exit 0** — but that warning is `noUnusedVariables` on the `bridgeCaptures` variable *my own edit* orphaned, **not** a wiring sensor. `MUT-CALLSITE-HOME` above avoids it entirely and is therefore the honest form of this mutation. |

I checked the biome result rather than assuming it (a lesson from my last pass, where a biome
non-zero turned out to be a formatter complaint). Here biome exits **0** in both cases.

---

## §4 — The harm behind the silent GREEN

A GREEN mutation is only a finding if it breaks something. Driving
`wireBridgeRestartNotifier` exactly as `runDaemon` wires it, varying **only** the store:

```
PRISTINE  store: new FsWatchdogStore(pijHome)
  notifyOwner returned : 1
  watcher inbox count  : 1
  logs                 : []
  => OWNER NOTIFIED

MUTATED   store: new FsWatchdogStore(join(pijHome, "nope"))
  notifyOwner returned : 0
  watcher inbox count  : 0
  logs                 : ["telegram: restart owner notice skipped — pij-telegram has no watchers"]
  => OWNER NEVER NOTIFIED (the LIVE-confirmed 29b-T001 bug)
```

Two things make this worse than a bare silent mutation:

1. It reproduces **precisely** the failure 29b-T001 was written to fix — the owner never learns
   the bridge restarted.
2. The regression **impersonates the fix's own honest-skip message**. `pij-telegram has no
   watchers` is the wording item 29b-T001 introduced to be *truthful*; here it is emitted while a
   watcher exists and is registered. An operator reading logs would see a correct-looking skip.

**This directly refutes the packet's Dim-1 #1**, which states: *"`notifyOwner:
wireBridgeRestartNotifier({...})` is the ONLY thing on that path — no untested intermediate."*
`bridgeCaptures` **is** an untested intermediate on that exact path: constructed at
`daemon.ts:1788`, consumed at `:1811`, referenced nowhere else, and covered by nothing.

---

## §5 — Dim-1, answered by execution

### 1. Is the extraction real? — **Structurally yes; behaviourally still not covered**

Real: `const notifyBridgeOwner = …` is deleted and `notifyOwner:` binds the factory call
directly (`daemon.ts:1808–1816`). That is a genuine change, unlike `ad32ecb`'s rename.

Not covered: the *arguments* to that call are unsensored, and `runDaemon` is still never
executed. The tightened pin catches edits that change the **shape** of the expression
(`MUT-CALLSITE-WRAP` → RED) but not edits that change its **meaning** while preserving the
literal (`MUT-CALLSITE-HOME` → silent). That is the characteristic failure mode of a string
pin, and it is the natural evasion, not an exotic one.

### 2. ADV-3 — **CLOSED, and the accounting is preserved (verified, not read)**

The hand-copy `isBridgeWatcherEntry` is **deleted**; `isWatcher` is now `export`ed from
`watchdog-store.ts:25` and imported at `daemon.ts:47`. One predicate, so schema drift is now
impossible by construction.

I did not take "accounting preserved" on trust — differential across seven scenarios,
candidate vs `ad32ecb`:

| scenario | `ad32ecb` (hand-copy) | `2773771` (exported `isWatcher`) |
|---|---|---|
| A3 2 entries, 1 malformed | `(2 dropped, 1 malformed)` | `(2 dropped, 1 malformed)` |
| A4 4 entries, 1 malformed | `(4 dropped, 1 malformed)` | `(4 dropped, 1 malformed)` |
| **A5 unparseable JSON** | **`(0 entries rejected)`** | **no count** ← the intended ADV-2 fix |
| A6 all valid | `returned=1`, no log | `returned=1`, no log |
| A8 bogus `pausedBy` + valid | `(1 dropped, 0 malformed)` | `(1 dropped, 0 malformed)` |
| A9 4 entries, 4 malformed | `(4 dropped, 4 malformed)` | `(4 dropped, 4 malformed)` |
| A10 bad `capture.mode` | `(1 dropped, 1 malformed)` | `(1 dropped, 1 malformed)` |

A5 is the **only** difference across all seven. A10 in particular exercises the
`isCapturePolicy` branch, so the exported predicate agrees with the deleted hand-copy on the
capture path too — the swap is behaviour-preserving.

### 3. ADV-2 catch — **CLOSED and sensored**

The catch no longer invents a count (`daemon.ts:168`), the new test pins the exact log array,
and MUT-HONESTLOG-CATCH REDs it (§3.2). Note the fix **removes** the count rather than making
it accurate, which is the right call: in that branch the file never parsed, so there is no
entry count to report.

### 4. No collateral (E17) — like-for-like

Compared against `ad32ecb` **picked onto the same main** (mixing bases would report main's
drift as deleted tests — an error I made and caught in an earlier pass). `npx vitest list`:
**74 → 75**. Removed: **none**. Added: exactly one — *"reports unparseable watcher JSON without
inventing a rejected-entry count"*.

### 5. ADV-4 — confirmed out of scope, not silently relied upon

Nothing I ran depends on the prime assertions; the behavioural test's prime expectations are
unchanged from `87a0c13`.

---

## §6 — Gates

| gate | result |
|---|---|
| `tsc --noEmit` | ✅ exit 0 |
| `biome check` (3 fence files) | ✅ "Checked 3 files. No fixes applied." |
| `vitest` `daemon.test.ts` | ✅ 75 passed, 2 skipped |
| **full suite** | ⚠️ **4694 passed, 19 skipped, 1 failed** |

The single full-suite failure is `harness/scripts/release-age-policy.test.ts` → `spawnSync pwsh
ENOENT`, **re-derived this pass on unmodified `origin/main` `536e5a3`** (`1 failed | 9 passed`).
Environmental — no PowerShell on this macOS host.

### 6.1 An observed flake I must report

On my **first** `daemon.test.ts` run against the picked tree, *"the real daemon SIGTERM path
releases write.lock and events.lock in a temp home"* failed with `{ code: 143 }` vs expected
`{ code: 0 }` (`daemon.test.ts:2261`). It did **not** recur:

| tree | runs | result |
|---|---|---|
| picked | full-file ×3 | 1 fail, then 2 × 75 passed |
| picked | isolated (`-t`) ×2 | 2 × passed |
| main | full-file ×2 | 2 × 70 passed |
| picked | full suite ×1 | did not recur |

It is a **main-owned test** (added by main's in-fence drift) on the signal-shutdown path, which
the candidate does not touch, and the failure mode (SIGTERM exit 143 vs a clean 0) is a
shutdown-timing race, most likely cold-start. I judge it a flake rather than a regression, but
**6 of 7 runs is not proof**, and a 1-in-N flake in a lock-release test is worth someone's
attention independently of this item.

---

## §7 — Findings

### ADV-1 — **carried, NOT behaviourally closed** (narrowed from `ad32ecb`)

Please record it as *string-pinned*, not *closed*. §3.3 and §4.

**Fair credit**: at `ad32ecb` my call-site mutation was silent across all four sensors. Here
the equivalent *wrapping* mutation is caught by the tightened pin. The residual is genuinely
narrower — it is now specifically "change the arguments, keep the literal".

**Cheap fix that would actually close it.** Extract the deps construction into a seam the
existing behavioural test can drive, e.g.

```ts
export function bridgeNotifierDepsForDaemon(
  pijHome: string, registry: FsRegistry, channel: FsChannel, log: (m: string) => void,
): BridgeRestartNotifierDeps {
  return { pijHome, registry, store: new FsWatchdogStore(pijHome), channel, now: () => Date.now(), log };
}
```

with `runDaemon` calling `notifyOwner: wireBridgeRestartNotifier(bridgeNotifierDepsForDaemon(…))`.
A test asserting `deps.store.pathFor("pij-telegram")` resolves **under `pijHome`** REDs
`MUT-CALLSITE-HOME` directly. That is an extraction of the *untested part* — which is the
arguments, not the factory.

Failing that, the honest alternative is to **keep the grep and say so in the ledger**: "the
production wiring is covered by a source pin; argument-level regressions are not sensed." A
brittle sensor named honestly is fine. One described as behavioural coverage is not.

### ADV-2 — ✅ CLOSED and sensored (§3.2, §5.3)
### ADV-3 — ✅ CLOSED, accounting preserved across 7 scenarios (§5.2)

### INFO

1. **The oracle patch does not test what the packet says it tests** (§3.1 vs §4). The patch
   header targets lines 215–247; the call site is at 1808. Worth correcting in the ledger,
   because a future reader will otherwise believe the call site is behaviourally covered.
2. **Line claims**: RED at `:236` (packet said 228 — that is the factory-construction line) and
   `:304` (packet said 296 — expected shift from main's in-fence drift). Both real assertions.
3. **The regression impersonates the honest-skip message** (§4). If the wiring ever does break,
   the logs will read as a correct "no watchers" skip. Consider making the notifier log the
   resolved sidecar **path** when it finds no watchers — that one addition would make this class
   of misconfiguration self-evident in the logs.
4. `bridgeCaptures` (`daemon.ts:1788`) has exactly one consumer (`:1811`); inlining it would
   remove the untested intermediate without any seam work, though it would not by itself make
   the path *tested*.

---

## §8 — Teardown

- All five worktrees removed, then `git worktree prune`; `git worktree list` back to the four
  legitimate entries.
- All three fence files verified pristine at teardown (shas in §1); `git status --porcelain`
  empty before the gates and at exit.
- Both `.mts` probes and every `/tmp/29bx-*` helper deleted.
- No branch checked out, no commit, no push, no `git add` outside the throwaway pick.

---

## §9 — Bottom line

**Merge it** — it is a strict improvement, it closes ADV-2 and ADV-3 properly, the extraction
is structurally real, and there is no regression or collateral.

**But do not close ADV-1 on the strength of the mechanical oracle.** The oracle mutates the
factory body, and the factory was already known to be tested; the call site is covered only by
a string pin, which I evaded with a one-token argument change that is silent across tsc, biome,
vitest and the grep while measurably restoring the LIVE-confirmed bug — and emitting the
fix's own honest-skip wording while doing it.

The underlying cause is unchanged and worth naming plainly: **`runDaemon` is never executed by
any test**, so nothing about its wiring can be sensed behaviourally. Until that changes, every
guard on that path will be a proxy. Proxies are acceptable; describing one as behavioural
coverage is what I am objecting to.
