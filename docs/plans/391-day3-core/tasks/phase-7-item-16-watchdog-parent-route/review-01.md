# Cold review — Phase 7, item 16 (lifecycle notices route to the current parent) — dlg-0016

**Verdict**: `APPROVE-WITH-FINDINGS` · **reviewId**: `review-01` · **highest**: `medium`
**Frozen SHA**: `cc96eca2bc6aa038b29a5fc5c94561167449d143` · **Base**: `9b5e42d` (re-derived) · **Branch**: `s391/item16-watchdog-parent-route`
**Reviewer**: `pij-powerful-whale` (cold cross-model — claude-opus-5 via GitHub Copilot CLI) · **Date**: 2026-08-28

---

## R0 — Scaffolding, and the limits of this pass

Stated before the findings, so a gate I did not examine and a gate I found clean do not look the same.

**Scaffolding I used** (none of it in the repo; the repo was read-only except this file):

| Artifact | Purpose |
|---|---|
| `/tmp/pw16/mut.sh` | hardened mutation harness — `# TOUCHES:` target declaration, pristine byte-copies, **abort-before-vitest if `git diff --name-only -- .pi/` is empty**, restore + `cmp` + scoped diff |
| `/tmp/pw16/scripts/m*.py` | 9 mutation scripts, each asserting its anchor count before editing |
| `/tmp/pw16/pristine/` | byte-copies of the 4 mutated production files, taken once up front |
| `/tmp/pw16base/` | `git archive 9b5e42d` extraction + symlinked `node_modules`, for base-vs-head comparison |
| `/tmp/pw16/probe/*.mts` | 4 `tsx` probes against **pristine** source (no mutation) for the dead-parent question |
| `~/.pij/pij-powerful-whale/bg-mtc418x7-w9jf7o.log` | the authoritative full-suite gate log |

The empty-diff abort exists because a previous pass in this stream produced a **false GREEN** when a mutation silently failed to apply. Every mutation below was proven applied before its suite ran.

**Base trap, re-derived rather than trusted.** The dispatch named base `9b5e42d`; `git merge-base origin/main HEAD` independently returns `9b5e42defb7b094e50187304291c753b465c514a6` — so the dispatch is honest. But `origin/main` has since advanced to `0120c8d`, **12 commits** ahead of that base (`git rev-list --left-right --count origin/main...HEAD` → `12  3`). A two-dot `origin/main..HEAD` diff would have shown twelve other streams' work as phantom reversals. **Every number in this review comes from `9b5e42d..cc96eca`.**

**What I did NOT verify** (each of these is a gap, not a pass):

1. `just lint` repo-wide and `harness checks --quick` — I ran Biome only over the 8 changed TypeScript files. The coder reports pre-existing OSC-7337 diagnostics outside this fence; I did not reproduce or audit them.
2. The coder's own log `docs/plans/391-day3-core/logs/vitest-phase7-fx.log` — I ran my own full suite instead and compared totals.
3. Anything Windows / `pwsh` — `pwsh` is not installed on this host, so `harness/scripts/release-age-policy.test.ts` cannot run here at all. I therefore scoped the gate to `.pi/extensions/pij/` (the dossier's own command form); a run including `harness/**` fails on that unrelated pre-existing `spawnSync pwsh ENOENT`.
4. **No live-daemon proof.** Per the packet addendum I never started, stopped or touched the daemon, and never wrote to this machine's `~/.pij`. Everything is unit/integration-level. A real `pij link` against a real running daemon was not exercised by me.
5. A real tmux fleet: no adopted seat was actually re-linked mid-flight on real panes.
6. `528a0f1` and `0f10d7c` as separate reviewable steps — the dispatch scoped me to the range as one change, and that is how I read it.
7. The three commits' *ordering* claims in the execution log (that the FX genuinely followed a validation failure) — I take the log at its word.
8. **F-1 facet B is derived, not executed end-to-end.** I proved it by composing `reconcileDeaths` + `resolveDeathNotices` exactly as `daemon.ts:794-817` composes them, having first read `FsRegistry.list()` to establish that dissolved records are filtered. I did **not** drive it through a real `Daemon.tick()`.

---

## R1 — Freeze, gates, anti-vacuity, fences

### Freeze

| Check | Result |
|---|---|
| `git rev-parse HEAD` | `cc96eca2bc6aa038b29a5fc5c94561167449d143` ✓ |
| Branch | `s391/item16-watchdog-parent-route` ✓ |
| Commit chain | `9b5e42d` → `528a0f1` → `0f10d7c` → `cc96eca` ✓ (exactly the three named) |
| `git merge-base origin/main HEAD` | `9b5e42d` ✓ matches the dispatch |
| Tracked tree at review start | clean ✓ |
| HEAD at review end | `cc96eca` — unmoved ✓ |
| Live daemon | `running (pid 82643)` before and after — never touched ✓ |

### Gates

| Gate | Command | Result |
|---|---|---|
| Full extension suite | `npx vitest run .pi/extensions/pij/` (via `pij bg`, job `bg-mtc418x7-w9jf7o`) | **171 files passed \| 2 skipped (173); 4064 passed \| 15 skipped (4079); 0 failed**; 198.92 s |
| Typecheck | `npx tsc --noEmit -p .` | exit **0** |
| Lint | `npx biome check` over the 8 changed `.ts` files | exit **0**, "Checked 8 files… No fixes applied" |

The suite total **exactly matches the coder's claim** of 171 files / 4064 pass / 0 fail. I ran it myself before applying any mutation.

### Anti-vacuity — declarations counted with the runner, not a regex

A regex extractor cannot see a multi-line `it.each([...])("title")`, and this change adds three of them. I used `npx vitest list` in both trees:

```
base (9b5e42d) : 234 declarations
head (cc96eca) : 252 declarations
removed        : 0
added          : 18
234 + 18 - 0   = 252   ✓ closes exactly
```

A name diff is blind to assertions deleted from a *surviving* test, so I also line-diffed the four test files. Exactly **four** removed lines in the whole range, and **none** is an assertion:

```
-import { reconcileDeaths } from "./death-reconciler.js";      (replaced: + resolveDeathNotices)
-  { label: "structural parent", parentId: "pij-structural-parent" },   (replaced, field added)
-  { label: "explicit root", parentId: null },                          (replaced, field added)
-        event.message.to === "pij-close-owner" &&                      (replaced: expectedRecipient)
```

That last one is the honest behaviour change: a pre-existing test asserted a structurally-parented seat's bind-failure notice went to `pij-close-owner` (the spawner); it now asserts it goes to `pij-structural-parent`. Correctly updated rather than deleted.

### Fences — byte-identical at three points (base blob = head blob = worktree blob)

| File | Why it matters | Blob |
|---|---|---|
| `core/types.ts` | **no descriptor schema change** | `207b019a…` ✓ |
| `core/registry-write.ts` | `DESCRIPTOR_FIELD_OWNER` — `parentId` stays cli-owned | `71440ccc…` ✓ |
| `core/daemon/watchdog-manager.ts` | **watcher-list semantics (`pij watchdog watch`) untouched** | `0928e1bb…` ✓ |
| `core/spawn-expectation.ts` | expectation latching untouched | `9fb96860…` ✓ |
| `cli.ts` | no CLI surface change | `68a03c81…` ✓ |

`notifyWatchers` exists only in `watchdog-manager.ts` (`:581`, `:678`) — a file byte-identical to base. The explicit-subscription fan-out is provably untouched, as the non-goal required.

### Scope

The range touches **12** files: 4 production + 4 test + 2 docs + 2 dossier/bookkeeping. That is exactly the dossier's declared path set. The addendum's OFF-LIMITS paths (`core/types.ts`, `core/revive.ts`, `skills/**`, `government/**`) show **zero** changed files. No scope creep.

---

## R2 — The mutation ledger

Dim-0 baseline first: the 4 gate test files at `cc96eca`, unmutated → **252 passed | 2 skipped, 8.03 s**. Cheap enough to be the standing selector for every mutation.

| # | Target | Mutation | Result |
|---|---|---|---|
| **M1a** | `binding.ts:280` | `noticeRecipient` prefers `spawnedBy` over `parentId` | **RED — 13 tests, all 4 gate files** |
| **M1b** | `binding.ts:280` | `noticeRecipient` reverted to pure base (`spawnedBy ?? null`) | **RED — 19 tests, all 4 gate files** |
| **M2_1** | `loop.ts:431` | planned-id bind builds notice from the **tick snapshot** | **RED — 1 test, planned-id re-link only** |
| **M2_2** | `loop.ts:476` | discovery bind builds notice from the tick snapshot | **RED — 1 test, discovery re-link only** |
| **M2_3** | `loop.ts:594` | bind-failure builds notice from the tick snapshot | **RED — 1 test, watchdog-failure re-link only** |
| **M3** | `daemon.ts:818` | deliver the **pre**-close-write `deathSweep.notices` | **RED** — `routes terminal death to a parent re-linked during the close write` |
| **M4** | `daemon.ts:1003` | `pushWholeLifeTransition` gate reverted to `!d.spawnedBy` | **RED** — parent-only stalled |
| **M5** | `daemon.ts:1091` | provider-failure peek gate reverted to `!d.spawnedBy` | **RED** — parent-only provider failure |
| **M6** | `death-reconciler.ts:301` | reconciler re-gates the terminal death notice on `spawnedBy` | **RED** — parent-only terminal death |
| **M7** | `daemon.ts:1063` | `pushWatchdogResponse` stalled gate reverted to `persisted.spawnedBy` | **🔴 SURVIVED** — see F-2 |

Every mutation was restored from its byte-copy and verified four ways: `cmp` against pristine, `git diff --name-only -- .pi/` empty, blob-sha equality with `cc96eca`, and a final `git diff --stat cc96eca` that is empty.

### The three dispatch-mandated mutations, answered directly

**(1) "helper returns `spawnedBy` first → parent-only tests RED at EACH of the 4 gate files."**
The instruction is ambiguous between two mutations, so I ran both, because they prove different things.

*M1a* (`spawnedBy ?? parentId`) reddens every **adopted** case but leaves the parent-only cases green — a parent-only descriptor has no `spawnedBy`, so the coalesce still lands on `parentId`. 13 failures, and crucially **all four gate files appear** (`Test Files 4 failed (4)`):

```
FAIL  daemon.test.ts               > routes terminal death to a parent re-linked during the close write
FAIL  daemon.test.ts               > routes a stalled adopted seat to its current parent only
FAIL  daemon.test.ts               > routes a provider-failure adopted seat to its current parent only
FAIL  binding.test.ts              > {bound,failed,stalled,dead} notice routes parentId, then spawnedBy, then nobody   (×4)
FAIL  death-reconciler.test.ts     > routes a adopted seat's terminal death notice to the current parent only
FAIL  death-reconciler.test.ts     > resolves recipient and dead-parent suppression from post-write descriptor truth
FAIL  loop.test.ts                 > {discovery,planned-id,watchdog-failure} bind follows a parent re-link…   (×3)
FAIL  loop.test.ts                 > dead bound descriptor preserves 'structural parent' metadata when persisted as failed
```

*M1b* (pure base behaviour) is the one that proves the **parent-only** tests are load-bearing: 19 failures, adding every `…parent-only seat…` and `…notifies a parent-only descriptor` case. Both mutations red all four files. The helper is genuinely the single load-bearing rule.

**(2) "revert `loop.ts` to the tick snapshot → concurrent re-link cases RED."**
Confirmed, and I split it per site rather than mutating all three at once — because a single combined mutation cannot distinguish one shared sensor from three. Each site reddened **exactly one** test and nothing else (`1 failed | 99 passed` each time). Three genuinely independent sensors.

**(3) "death-reconciler recipient precomputed before the close write → its re-link case RED."**
Confirmed (M3). Delivering `deathSweep.notices` instead of the post-write `resolveDeathNotices(...)` reddens precisely `routes terminal death to a parent re-linked during the close write`, and nothing else.

---

## R3 — AC-21 completeness: classifying every surviving `spawnedBy`

`git grep -n spawnedBy .pi/extensions/pij/core/daemon .pi/extensions/pij/daemon.ts`, non-test, all 9 hits classified:

| Site | Classification | Verdict |
|---|---|---|
| `anomaly-sweep.ts:5` | **comment** describing `effectiveParent (parentId ?? spawnedBy)` | not a gate ✓ |
| `death-reconciler.ts:276` | builds the ephemeral `SpawnExpectation.creatorId` fed to `applyTerminalObservation` for **latching** | not a routing gate — the notice raised on this branch is `kind:"descriptor"`, routed by the helper (proved by M6) ✓ |
| `loop.ts:315`, `:320` | **needs-human** notice (`🙋`) | declared out of scope (dossier Boundary row) — see F-4 |
| `loop.ts:336` | `buildInitInjection(…, descriptor.spawnedBy, …)` | init-injection **context**, not a recipient ✓ |
| `loop.ts:541`, `:550` | `reportBindRefusal` (`⛔ planned bind refused`) | declared out of scope — see F-4 |
| `watchdog-manager.ts:220`, `:636` | **comments** | now factually stale — see F-3 |

`core/binding.ts` contains exactly **one** `spawnedBy` reference in the whole file — inside `noticeRecipient` itself (`:280`). All four builders route through the helper; there is no second rule.

**The expectation-path `to: next.creatorId`** (`death-reconciler.ts:363`, `kind:"fixed"`) is the one site that still addresses a spawner directly. It is **unreachable for an adopted seat**: the loop `continue`s when `expectation.terminal !== undefined || expectation.sessionId !== undefined || descriptorBySpawnId.has(expectation.spawnId)` (`:319-324`), so it fires only for a spawn that never produced a session — and with no descriptor there is no `parentId` to consult. Correctly left alone.

**`buildDeadNotice` has exactly one production call site** — `daemon.ts:1120`, inside `pushProviderFailure`, gated at `:1091` by `noticeRecipient` (proved by M5).

**Conclusion: AC-21 is complete for bound / failed / stalled / dead. There is no fifth live `spawnedBy` gate on those four classes.** The one *unsensored* converted gate is F-2.

---

## R4 — Findings

### F-1 (medium) — an adopted seat whose parent is dead notifies **nobody**; base notified the live spawner

`noticeRecipient` is `parentId ?? spawnedBy` with **no liveness-aware fallback**. Once `parentId` is set, `spawnedBy` is unreachable as a recipient forever — including when the parent cannot receive anything. Combined with the new suppression in `resolveDeathNotices` (which now treats *any* listed descriptor with `terminal !== undefined` or `lifecycle === "dissolved"` as dead, where base used only the current sweep's dead set), an adopted seat's obituary can be lost even though its original spawner is alive and listening.

This is the exact question the brief asked me to look hard at, so I executed it rather than reasoned about it. Same descriptors, same call, base tree vs head tree:

**Facet A — parent crashed (terminal stamped in an earlier sweep). Executed on both trees.**

```
child died; parent long-terminal; spawner ALIVE
  base (9b5e42d):  notices [{"from":"pij-child","to":"pij-spawner"}]   suppressed 0   spawner informed? true
  head (cc96eca):  notices []                                          suppressed 1   spawner informed? false
```

Reproduced again through the daemon's own composition (`reconcileDeaths` → write updates → `resolveDeathNotices(candidates, list, deadIds)`, i.e. `daemon.ts:794-821`):

```
candidates raised  : 1
DELIVERED by daemon: []
withheld count     : 1
operator sees      : daemon log line: "death sweep: 1 notice(s) withheld — recipient is dead too"
live spawner told? : false
```

**Facet B — parent cleanly closed (`pij close` → `lifecycle: "dissolved"`). Worse, and it loses the count too.**
`FsRegistry.list()` filters dissolved records (`fs-registry.ts:406`: `if (descriptor && descriptor.lifecycle !== "dissolved")`), so a closed parent is absent from every list the daemon passes — it therefore never enters the `dead` set, and the suppression never fires:

```
parent CLEANLY CLOSED (dissolved => hidden from registry.list())
  daemon delivers to : ["pij-closed-parent"]
  withheld count     : 0   (=> NO operator log line)
  live spawner told? : false
```

The obituary is handed to `channel.deliver` addressed to a closed seat — which is precisely the harm the suppression comment at `death-reconciler.ts` was written to prevent ("the daemon keeps pushing it at that seat's recorded pane"). Facet B is **derived** by composing the two exported functions the way `daemon.ts:794-821` composes them, after reading `list()`; I did not drive `Daemon.tick()`.

**Why this matters here specifically.** The dossier's own motivating evidence is toucan, adopted under the o-prime via `pij link`. If an o-prime that has adopted a dozen seats dies or is closed, every one of those seats' lifecycle notices now goes nowhere (facet A) or into a corpse's mailbox (facet B) — where before this change each would have reached its original spawner, typically a live PM.

**Not a blocker, and I want to be precise about why.** Terminal truth is still recorded on every descriptor, so `pij list` / `pij state` are unaffected; only the *announcement* is lost. Facet A is counted and logged. And parent-**only** routing is exactly what AC-21 asked for — this is a gap in the AC's own framing (it never says what to do when the parent cannot receive), not a coder deviation from it. But base delivered a message that head drops, no test covers the case in either facet, and the affected spawner is given no signal at all.

*Suggested remedy (not mine to make):* fall back to `spawnedBy` when the chosen `parentId` resolves to a descriptor that is terminal/dissolved or absent — i.e. make `noticeRecipient` liveness-aware at the resolution site (`resolveDeathNotices` already has the descriptor list in hand), leaving the pure two-field helper untouched for the builders.

### F-2 (medium) — the watchdog-derived stall gate is converted but **completely unsensored**

There are **two** stalled-notice sites in `daemon.ts`:

- `pushWholeLifeTransition` (`:1030`) — the legacy detector, covered by the outer `noticeRecipient` gate at `:1003`. **Sensed** (M4 → RED).
- `pushWatchdogResponse` (`:1063`) — the watchdog-derived path, whose *only* gate is `if (noticeRecipient(persisted))`. **Not sensed at all.**

M7 reverts `:1063` to `if (persisted.spawnedBy)`. Against the 4 gate files: green. Against the **entire extension suite**:

```
M7 applied: stalled-notice gate reverted to spawnedBy
-- mutated files: .pi/extensions/pij/daemon.ts
 Test Files  171 passed | 2 skipped (173)
      Tests  4064 passed | 15 skipped (4079)
== vitest exit: 0 ==
```

Byte-for-byte the same totals as the unmutated baseline. Nothing in the repository observes this gate.

**The shipped behaviour is correct** — I want that on the record, because this is a sensor finding, not a defect. A parent-only seat *does* receive its watchdog-derived stall notice today. But `pushWatchdogResponse` has no outer `noticeRecipient` guard, so `:1063` is the sole gate on that path, and a future refactor can silently revert it to the pre-item-16 behaviour with every gate in this repository still green. For a change whose entire thesis is "lifecycle notices route to the parent", leaving one of the notice-emitting sites unpinned is material.

The only test file that touches this path at all is `core/daemon/watchdog-manager.test.ts`, which tests the manager, not the daemon's delivery gate.

### F-3 (low) — two `watchdog-manager.ts` comments are now factually wrong

Both survive byte-identical from base and both assert the pre-change rule:

- `:219-220` — "*the owner-facing "stalled" notice cannot reach anyone for it either, since `pushWholeLifeTransition` returns early when `spawnedBy` is absent and a prime is creator-less*"
- `:635-636` — "*the daemon's OTHER stalled-flag clear path (`pushWholeLifeTransition`) returns early when `spawnedBy` is absent, while the watchdog detector happily SETS the flag on such a peer*"

`pushWholeLifeTransition` now returns early only when **both** `parentId` and `spawnedBy` are absent (`:1003`). These comments are load-bearing reasoning — the second one documents a real set-without-clear bug class, and the change *narrows* it (a parent-only seat's stalled flag can now be cleared where before it could not). That is a genuine improvement which the surrounding prose no longer describes, so the next reader will reason from a false premise in both directions.

### F-4 (low) — an adopted seat's `⛔` and `🙋` still go to the spawner while its `✅`/`⚠️` go to the parent

`reportBindRefusal` (`loop.ts:541`) and the needs-human notice (`loop.ts:315`) remain gated on and addressed to `spawnedBy`. Both are explicitly declared out of scope in the dossier's Boundary discovery row, so this is **not** a deviation from the contract — I am recording the operator-visible consequence.

For one adopted seat during one bind, the parent now receives `✅ … is ready` or `⚠️ … failed to bind: <reason>`, while the `⛔ … planned bind refused (<cause>)` diagnostics that *explain* that failure, and any `🙋 … needs a human`, land in a different seat's inbox. The parent is told the outcome but cannot see the reasoning; the spawner sees the reasoning for a seat it no longer governs. Worth a deliberate ruling in a later item rather than leaving it to be discovered live.

### F-5 (info) — sender provenance, noted and explicitly not failed

Per the dispatch this is item 31 / AC-30 and out of my scope. Recording only what I observed so the later item has it: notices carry `from` = the **subject** seat (`notify(delivery, descriptor.id, …)`, `from: descriptor.id`, and `from: next.sessionId ?? next.spawnId` for the expectation path). Nothing in this change alters that, and nothing here makes AC-30 harder.

### F-6 (info) — test title grammar

`routes a adopted seat's terminal death notice…` (`death-reconciler.test.ts:111`, from the `it.each` label `"adopted"`). Cosmetic; it appears in `vitest list` output and in this review's own quoted failures.

---

## R5 — The brief's four "look hard at" items

| Item | Finding |
|---|---|
| **AC-21 complete for bound/failed/stalled/dead; no fifth `spawnedBy` gate** | ✅ Complete. All 9 surviving `spawnedBy` hits classified in R3 — 3 comments, 1 latching field, 2 declared-boundary message classes, 1 init-context argument, none of them a live gate on the four classes. The `kind:"fixed"` expectation path is unreachable for adopted seats. One converted gate is unsensored → **F-2**. |
| **Dead-parent suppression doesn't swallow a notice the spawner should still get** | ❌ **It does** → **F-1**, two facets, both executed/derived with base-vs-head evidence. |
| **Watcher-list semantics (`pij watchdog watch`) untouched** | ✅ `watchdog-manager.ts` byte-identical base = head = worktree (`0928e1bb…`); `notifyWatchers` exists nowhere else. |
| **No descriptor schema change** | ✅ `core/types.ts` byte-identical (`207b019a…`); `core/registry-write.ts` byte-identical, so `parentId` remains a cli-owned contested field. |
| **Docs match behaviour** | ✅ for the changed docs. `docs/how/pij-watchdog.md` and `docs/how/pij.md` state the `parentId`-then-`spawnedBy` rule, that `pij link` redirects future notices, and that close authorization is *not* transferred — all three verified against the code. Neither doc mentions the dead-parent case (**F-1**), and the in-code comments in `watchdog-manager.ts` are stale (**F-3**). |

---

## R6 — Summary

| Dimension | Result |
|---|---|
| Freeze verified independently | ✅ |
| Base re-derived (12-commit two-dot trap avoided) | ✅ |
| Full vitest (own run) | ✅ 171 files / 4064 passed / **0 failed** — matches the coder's claim |
| tsc / biome | ✅ 0 / 0 |
| Anti-vacuity | ✅ 234 → 252, 0 removed, 0 assertions lost |
| Fences byte-identical | ✅ 5 files, 3 points each |
| Scope ⊆ allowed paths | ✅ 12 files, 0 off-limits |
| Dispatch-mandated mutations | ✅ all 3 confirmed RED (2 run as both readings; 1 split 3 ways) |
| Mutations run | 10 |
| **Survivors** | **1 (M7 → F-2)** |
| Findings | F-1 medium, F-2 medium, F-3 low, F-4 low, F-5 info, F-6 info |
| **Highest** | **medium** |
| **Verdict** | **`APPROVE-WITH-FINDINGS`** |

The core of item 16 is well built. One helper, one rule, used by all four builders and every lifecycle gate; the concurrent-re-link hardening in `0f10d7c` is real work with three genuinely independent sensors, and the post-close-write re-resolution is the right shape for a CLI-owned contested field. Nine of ten mutations reddened precisely and only their own sensor, which is a strong signal about the test suite's aim.

Both medium findings are about the *edges* of the new rule rather than the rule itself: what happens when the chosen parent cannot receive (F-1), and one converted gate that no test observes (F-2). Neither breaks a stated acceptance criterion, so this is not `FIX_REQUIRED` — but F-1 drops a message base delivered, and I would not want it discovered by an operator wondering why a fleet went quiet.

---

## TERMINAL REPORT

This pass is **CLOSED**. No mutation, probe or repo write follows this report; the working tree was verified clean and byte-identical to `cc96eca` before it was written, and the live daemon (`pid 82643`) was never touched. Every remedy implied by F-1 through F-4 is a code change and therefore outside this read-only reviewer seat's fence.

cc96eca2bc6aa038b29a5fc5c94561167449d143

---

# Re-review FX-01

**Scope**: `git diff cc96eca..4a70a26` only (10 code files + 4 docs). Frozen HEAD `4a70a261a615f6502fe8c1c9cba0bca78602c811`, branch `s391/item16-watchdog-parent-route`, parent `cc96eca` (the pass above). Packet: `fix-01.md` (F-1, F-2, F-3, F-6).

**Verdict: `APPROVE-WITH-FINDINGS`** — all four packet findings addressed; F-1, F-2 and F-6 fully closed with executed evidence. Highest new finding = **medium**, none major/high, therefore **not `FIX_REQUIRED`**.

## R0 — Scaffolding, and the limits of this pass

Stated first, so a gate I did not examine never looks like a gate I found clean.

- Mutation harness `/tmp/pwfx1/mut.sh` + `scripts/_lib.py`. Every run: asserts HEAD is still `4a70a26`, refuses to start on a dirty target, takes a pristine byte-copy, **aborts before vitest if `git diff --name-only -- .pi/` is empty** (the false-GREEN guard), then restores and verifies with `cmp` + a scoped `git diff`. All 20 mutations reported `cmp OK` and `RESTORED: git diff clean under .pi/`.
- Mutation selector = the 5 touched test files (`binding`, `loop`, `death-reconciler`, `daemon`, `daemon-push`): **300 passed / 4 skipped / 7.8 s** unmutated. The three survivors were then re-confirmed against the **full** extension suite, not the selector.
- Cost probes ran against `mkdtemp` homes only. **This machine's `~/.pij` was never read or written and the live daemon was never touched.**

**What I did NOT verify**: `just lint` repo-wide; `harness checks`; the coder's own `docs/plans/391-day3-core/logs/vitest-phase7-fx01.log` (I ran my own); anything Windows/`pwsh`; any live-daemon, real-tmux or real-`pij link` behaviour; the two docs files beyond reading them against the code. My cost numbers are single-machine, warm-cache, synthetic — treat them as *shape and scaling*, not as an SLA.

## R1 — Freeze, gates, anti-vacuity, fence

| Check | Result |
|---|---|
| HEAD / branch / parent | `4a70a26` · `s391/item16-watchdog-parent-route` · parent `cc96eca` ✅ |
| Changed files | 10 code + `docs/how/pij{,-watchdog}.md` + `execution.log.md` + `tasks.md` = 14 ✅ within fence |
| Full vitest (`npx vitest run .pi/extensions/pij/`, my own run) | **171 files / 4093 passed / 15 skipped / 0 failed** (194 s) — matches the coder's claim exactly |
| `npx tsc --noEmit -p .` | exit 0 |
| `npx biome check` (10 changed `.ts`) | exit 0, "Checked 10 files… No fixes applied" |
| `core/types.ts`, `core/registry-write.ts`, `adapters/fs-registry.ts`, `core/cli.ts` | blob-identical across `9b5e42d`, `cc96eca`, `4a70a26` — **no schema change, no registry-adapter change** |
| `watchdog-manager.ts` | 5 differing lines, **all inside comments** (`grep -v '^[+-]\s*(//|\*)'` returns empty) ✅ as the packet required |

**Anti-vacuity** (`npx vitest list` on both trees, base extracted with `git archive cc96eca`): base **4064** declarations → head **4093**. Diff of the sorted declaration lists: **31 added, 2 removed**, and the 2 removed are exactly the F-6 rename (`routes a adopted…` / `routes a parent-only…` → `routes the …`). **No test was lost.** Independently, the full removed-line set for the range is 66 lines and **not one of them is an assertion**.

## R2 — Mutation ledger (20 mutations · 17 RED · 3 survivors)

All sha-pinned at `4a70a26`, RED → restore → GREEN, `cmp` verified.

| # | Site | Mutation | Result |
|---|---|---|---|
| **M1** | `binding.ts:326-327` | `recipient = parent.id ?? spawner.id` — **liveness ignored** | **RED 29 tests across ALL 5 files** |
| **M2** | `daemon.ts:1074` | back to `persisted.spawnedBy ?? null` (**the F-2 revert**) | **RED 2** — `daemon.test.ts:1895` |
| M3 | `binding.ts:341` | `noLiveNoticeRecipientLine` always `null` | RED 10, all 5 files |
| M4a | `daemon.ts:1146` | drop `this.log(line)` | RED 4 |
| M4b | `loop.ts` site 1/3 | drop `log?.(line)` | RED 1 |
| M4c | `death-reconciler.ts:110` | drop `withheldNoticeLines.push(line)` | RED 2 |
| **M5** | `daemon.ts:1146` | log the line **twice** | **RED 4** — pins *exactly one*, not *at least one* |
| M6₁ | `loop.ts:440` | bypass resolver (pure candidate order) | RED 3 — **planned-id only** |
| M6₂ | `loop.ts:492` | same | RED 3 — **discovery only** |
| M6₃ | `loop.ts:621` | same | RED 3 — **bind-failure only** |
| M7 | `daemon.ts:1040` | same | RED 4 |
| M8 | `daemon.ts:1130` | same | RED 3 |
| M9 | `death-reconciler.ts:105` | same | RED 6 |
| M10 | `binding.ts:309` | `absent` → `live` | RED 3 |
| M12 | `binding.ts:308` | ignore `terminal` | RED 13 |
| M16 | `binding.ts:306` | `dissolved` → `live` | RED 8 |
| M13 | `binding.ts:333` | `withheld` always `0` | RED 12 |
| **M11** | `binding.ts:308` | drop `deadIds.has(id)` | 🟡 **SURVIVOR — full suite 4093 pass** |
| **M14** | `daemon.ts:1137` | view drops `listTerminal()` | 🟡 **SURVIVOR — full suite 4093 pass** |
| **M15** | `loop.ts:185` | view drops `listTerminal()` | 🟡 **SURVIVOR — full suite 4093 pass** |

Two things this ledger buys that a single combined mutation could not:

- **M6₁/M6₂/M6₃/M7/M8/M9 each reddened only its own site's tests.** Six sites, six independent sensors — not one shared sensor firing six times.
- **M5 is the one that proves the count.** M4a proves a line is emitted; only the double-log mutant proves the assertion is `toEqual([one])` rather than "contains a line".

## R3 — The four mandated verifications

**(1) F-1 — `resolveNoticeRecipient` returning `parentId` regardless of liveness must RED at each site.** ✅ **M1**, exactly that mutation, reddened **all four named sites plus `daemon-push`**: `binding.test.ts` 5, `loop.test.ts` 9, `death-reconciler.test.ts` 4, `daemon.test.ts` 10, `daemon-push.test.ts` 1 = 29. The per-component mutants localise *why*: `dissolved` (M16, 8), `terminal` (M12, 13), `absent` (M10, 3) are each independently load-bearing.

**Both-unavailable → withheld + exactly one log line.** ✅ M13 (`withheld: 0`) RED 12 across all 5 files; M3/M4a/M4b/M4c RED per layer; **M5 (double-log) RED 4** pins the count. The daemon-level cases are driven through a **real `Daemon.tick()` with a real `FsRegistry`, `FsChannel` and `FsWatchdogStore`** on a `mkdtemp` home (`daemon.test.ts:1804`, `:1852`), not a fake — the log assertion is `expect(logs.filter(…startsWith("notice stalled for"))).toEqual([…])`.

**(2) F-2 — `daemon.ts:1074` back to `persisted.spawnedBy` must RED.** ✅ **M2 → 2 failures at `daemon.test.ts:1895`**: *"routes a watchdog-derived stalled seat through a live parent and unset spawner"* and *"…through a dead parent and dead spawner"*. **My prior-pass survivor M7 is dead.** The new sensor is a genuine multi-tick daemon test (three `tick()`s across advancing `nowMs`, driven by `FsWatchdogStore`), which is what that gate needed — the previous coverage lived in `watchdog-manager.test.ts` and tested the manager, never the daemon's delivery gate.

**(3) `daemon-push.test.ts` — no existing assertion changed.** ✅ Line-diffed: the **only** added `expect(` lines are the two inside the new inverse test (`:118`, `:119`); **zero** assertion lines removed or modified. The other edits are (a) `withLiveNoticeCandidates()` fixture registration and (b) `isAlive: (pid) => pid >= 10_000 || (opts.pidAlive ?? true)`. I checked that second one specifically because it changes `makePorts` semantics: the file's only real fixture pids are **200, 300, 400** (`:26`, `:281`, `:396`), all far below `LIVE_RECIPIENT_PID_BASE`, so no existing case silently changed meaning.

**(4) The eight adapted cases were adapted honestly.** They previously asserted delivery to `pij-boss`, a recipient that was never registered. `FsChannel.deliverWithId` does `mkdirSync(dir, {recursive:true})` with **no registry check** (`adapters/channel.ts:168-176`), so the packet's "base delivered into a void" is literally true — base created an inbox directory for a non-existent seat and wrote a message nobody drains. Registering the recipient makes those fixtures *more* production-like, not less.

## R4 — The four "look hard at" items

**"live" applied identically at every site — one resolver, no site-local variant.** ✅ for the *rule*. `git grep` confirms `resolveNoticeRecipient` is the sole decision function and `noticeRecipient` survives only as (a) the pure candidate order in the builders' default parameter and (b) three cheap *any-candidate-at-all* pre-gates (`daemon.ts:787`, `:1013`, `:1101`). Those pre-gates are safe: `noticeRecipient(d)` is non-null exactly when `hasCandidate`, which is exactly when `withheld` could be 1 — so they only skip work in the case that would produce no diagnostic anyway.

⚠️ The *view* rule is **not** single — see **G-4**. And `deadIds` is passed by only one of the four call sites; that is correct rather than a variant, because `pushWholeLifeTransition` (`daemon.ts:778`) and `pushProviderFailure` (`:788`) run **before** the death sweep at `:801` and therefore hold no dead set. By the time `resolveDeathNotices` runs, `:818` has already written `terminal` for this sweep's dead, so the view carries the deadness itself.

**Absent-from-registry is withheld, and the docs say so.** ✅ `docs/how/pij.md:60-63` — "A failed, dissolved, terminal, or absent parent therefore falls back to the live spawner; if neither candidate is live, the daemon withholds the notice and logs both candidate states." `docs/how/pij-watchdog.md:13-20` — "A candidate is live only while it remains registered and is not failed, dissolved, or terminal." Both accurate.

I checked the one way "absent" could be a **lie**: `FsRegistry.readFile` swallows every error and returns `null` (`fs-registry.ts:1713-1720`), so a torn read would be indistinguishable from absence and would silently drop a one-shot notice to a live parent. It cannot happen — descriptor writes go through `writeJsonAtomic` → `writeTextAtomic`, which is `openSync(tmp,"wx")` → write → fsync → `renameReplaceWithRetry` → dir fsync (`adapters/atomic-file.ts:104-121`). Readers can only ever see a complete file. **Withholding on absence is safe.**

**F-3 comments now true.** ❌ — see **G-3**. This is the one packet item I do not consider closed.

**Nothing outside the fence.** ✅ 14 files, all named or approved; schema and registry adapter blob-identical; `watchdog-manager.ts` comment-only.

## R5 — New findings

### G-1 (medium) — the withheld-line rule reverses task #34 at fleet scale

`daemon.ts:832` logs **one line per withheld notice**, then `:833-838` prints the old summary only for `noticesSuppressed − withheldNoticeLines.length`. On the descriptor path those two move in lockstep, so the summary is suppressed to zero and the operator gets N lines instead of it. The comment directly above, left in place at `:828-831`, still says:

> *"One line instead of N undeliverable pushes. A host reboot kills every seat in the same event… the operator wants the COUNT, not 200 messages nobody can read (task #34)."*

Executed, on the pristine tree, in exactly the scenario that comment names (`/tmp/pwfx1/probe/reboot.mts`, pure in-memory, no `~/.pij`):

```
N=100  candidates=100   ->   1.7 ms   notices=0 suppressed=100  lines=100
N=250  candidates=250   ->   4.6 ms   notices=0 suppressed=250  lines=250
N=500  candidates=500   ->  12.8 ms   notices=0 suppressed=500  lines=500
N=1000 candidates=1000  ->  33.9 ms   notices=0 suppressed=1000 lines=1000
```

`lines == suppressed` at every size ⇒ `suppressedWithoutDetail == 0` ⇒ **the summary line never prints and 1000 individual lines do.** The code that task #34 was written to prevent is back.

**Attribution matters here: this is the packet's rule, not a coder deviation.** `fix-01.md` says "log one operator line … count it as withheld", and that is precisely what was built. Nobody noticed the collision with the earlier ruling.

**Bounding it honestly**: this is a **one-shot burst per death event, not per tick** — `death-reconciler.ts:273` (`if (descriptor.terminal !== undefined) continue;`) means an already-stamped descriptor never produces a candidate again. No data is lost; the operator gets strictly more information, just in the shape a prior ruling rejected. Suggested remedy: keep per-notice lines below a threshold and fall back to the count above it (which also restores the summary), or fold the states into one grouped line.

### G-2 (medium) — an unthrottled full archive-tier scan on the 600 ms tick, for zero routing effect

`noticeRegistryView()` = `[...listTerminal(), ...list()]`. `listTerminal()` re-reads **every hot-tier `.json` a second time** and then reads **the entire `~/.pij/archive/` tier** (`fs-registry.ts:412-442`). It is now on the tick's hot path at `daemon.ts:822` (was plain `this.registry.list()`), and `TICK_MS = 600`. Measured against `mkdtemp` homes, 50 hot descriptors, 200 iterations:

| archived records | view ÷ `list()` | added per tick | % of one 600 ms tick |
|---|---|---|---|
| 100 | 4.16× | +2.10 ms | 0.35 % |
| 500 | 12.49× | +8.18 ms | 1.36 % |
| 1 000 | 23.96× | +16.95 ms | 2.83 % |
| 4 000 | 104.27× | +77.32 ms | **12.89 %** |

(Ratio, added-ms and % are the probe's own reported figures per run; the 500-record run measured `list()` at 0.712 ms/call against 8.893 ms/call for the view. I did not record a separate `list()` baseline for the other three rows, so those are given as ratios only.)

Linear in archive size, and the archive retains for **~88 days** (`ARCHIVE_PRUNE_AFTER_MS = 90 d`, `core/archive.ts:40`).

Two things make this worth raising rather than shrugging at:

1. **The codebase already decided this question the other way.** `sweepArchive()` and `pruneArchive()` are both interval-throttled off the tick (`ARCHIVE_SWEEP_INTERVAL_MS = 60_000`, `ARCHIVE_PRUNE_INTERVAL_MS = 3_600_000`, `daemon.ts:126/132`). Archive-tier work is deliberately *not* per-tick. And the comment at `daemon.ts:806-808` in this very sweep warns about per-descriptor cost at ~500 descriptors on a ~600 ms tick, while `:839` records that tick duration *is* delivery latency and once "silently grew to ~19 s".
2. **`listTerminal()` cannot change the recipient — ever.** `isTerminalRecord` is `dissolved || failed` (`core/archive.ts:50`) and `list()` filters only `dissolved`. So every record `listTerminal()` adds is one that is non-live under any reading; whether it resolves as `"dissolved"`/`"failed"` or as `"absent"`, it is never chosen. Where both tiers hold an id, `new Map` insertion order (terminal first, live second) lets the live record win, which is also what `list()`-only would do. The **only** observable difference is one word inside a diagnostic that prints only when the notice is already being withheld.

**M14 and M15 corroborate by execution**: dropping `listTerminal()` from *both* views left the full suite at **171 files / 4093 passed / 0 failed**, byte-identical to baseline. Cheapest remedy: drop it and accept `"absent"`. Otherwise compute the terminal view at most once per tick and pass it down, rather than re-reading it per push (`lifecycleNoticeRecipient` at `:1144` re-reads it for *every* stalled/dead push).

Related, same root: `resolveNoticeRecipient` rebuilds `new Map(registryView…)` and `new Set(deadIds)` **on every call** (`binding.ts:320-324`), and `death-reconciler.ts:105` calls it **inside** the `for (const candidate of candidates)` loop — even though that function already built the identical `descriptorById` map once at `:88`. That is the O(C·N) in the table above.

### G-3 (low) — the F-3 comments are still not true, in a new way

The old text ("returns early when `spawnedBy` is absent") was stale. The replacement — `watchdog-manager.ts:220` and `:636-637`, *"`pushWholeLifeTransition` returns early when no live notice recipient exists"* — is also false, and it is falsified by **this commit's own new test**.

`pushWholeLifeTransition`'s early return is `daemon.ts:1013`: `if (!noticeRecipient(d)) return;` — the **pure candidate** check. It returns early when the seat has neither a parent nor a spawner. A seat *with* a dead parent **and** a dead spawner does **not** return early: it proceeds, persists `failureReason: "stalled"`, resolves, withholds, and logs. The new case *"routes a stalled seat through a dead parent and dead spawner"* (`daemon.test.ts:1804`) asserts exactly that line is emitted — which is only reachable because the function did **not** return early.

Why it matters beyond pedantry: `:633-640` is documenting a real set-without-clear bug class, and the `else if (!stalled && …)` clear branch at `daemon.ts:1044-1050` is on the far side of that early return. A reader taking the new comment at face value concludes that a seat with two dead candidates can never clear its `stalled` flag. It can. Accurate wording: *"returns early when the seat has neither a parent nor a spawner"*.

### G-4 (low) — the "live" **view** rule is duplicated, while the resolver is single

`noticeRegistryView` exists twice with identical bodies: `loop.ts:184` (module function over `RegistryPort`) and `daemon.ts:1136` (private method). The dispatch asked for "one resolver, no site-local variant" — the *resolver* is single, but the definition of *which descriptors count as the registry* is copy-pasted. If either copy is later changed (e.g. to fix G-2 in one place), the two paths silently disagree about what "live" means, and no test would notice — M14 and M15 had to be applied **together** to keep the suite honest, precisely because each copy is separately unsensored.

### G-5 (info) — `deadIds` is unsensored, and redundant at its only caller

**M11** (deleting `deadIds.has(id)` from `recipientCandidate`) survived the **full** suite: 171 files / 4093 passed / 0 failed. This is not a defect — it is redundancy. The only caller that passes a dead set is `resolveDeathNotices`, and (a) `daemon.ts:818` writes `terminal` for this sweep's dead **before** the view is read at `:822`, and (b) `death-reconciler.ts:90-94` re-adds every dissolved/terminal descriptor to `dead` anyway. Both routes already classify those ids as `"dead"` via `candidate?.terminal !== undefined`. Worth recording so a future reader does not assume the parameter is load-bearing.

### G-6 (info) — the new fixture helper auto-registers, which future tests must remember to bypass

`withLiveNoticeCandidates` (`daemon-push.test.ts:59`) registers *every* referenced `parentId`/`spawnedBy` as a **live** descriptor for all cases routed through the `daemon()` helper. Any future test in that file wanting to assert *withholding* must construct `FakeRegistry` directly, as the new inverse case at `:108` correctly does. Fine as built; a trap for the next author.

## R6 — Disposition of the packet's findings

| Finding | Status | Evidence |
|---|---|---|
| **F-1** liveness-aware recipient | ✅ **CLOSED** | M1 RED 29 across all 4 named sites + `daemon-push`; per-component M10/M12/M16 each independently RED; withheld+one-line pinned by M13/M3/M4a-c and the count by M5 |
| **F-2** sensor for the watchdog stall gate | ✅ **CLOSED** | M2 → 2 RED at `daemon.test.ts:1895`; my prior survivor is dead; new sensor is a real 3-tick `Daemon` test |
| **F-3** two stale comments | ⚠️ **partially** — stale `spawnedBy` wording gone, replacement still inaccurate → **G-3** | `daemon.ts:1013` vs `watchdog-manager.ts:220`, `:636-637`; falsified by `daemon.test.ts:1804` |
| **F-6** `"a adopted"` article | ✅ **CLOSED** | `vitest list` diff: the 2 removed declarations are exactly this rename, +0 tests lost |
| F-4 / F-5 | correctly recorded as out of scope (boundary / item 31 AC-30) | `tasks.md` Boundary + Regression rows |

## Summary

| | |
|---|---|
| Scope | `cc96eca..4a70a26`, 10 code + 4 doc files |
| Full suite (my run) | 171 files / **4093 passed** / 15 skipped / **0 failed** |
| tsc · biome | 0 · 0 |
| Anti-vacuity | +31 / −2 declarations; the 2 removed are the F-6 rename; **0 assertions deleted** |
| Mutations | **20** — 17 RED, **3 survivors** (all re-confirmed on the full suite) |
| Packet findings | F-1 ✅ · F-2 ✅ · F-6 ✅ · F-3 ⚠️ partial |
| New findings | G-1 medium · G-2 medium · G-3 low · G-4 low · G-5 info · G-6 info |
| **Highest** | **medium** |
| **Verdict** | **`APPROVE-WITH-FINDINGS`** (no major/high open → not `FIX_REQUIRED`) |

The two findings the packet actually turned on are genuinely closed, and closed *well*. F-2 in particular was answered with the right kind of test — my survivor died to the exact mutation the packet named, against a real `Daemon`, a real `FsRegistry` and a real watchdog store rather than a fake. The six-way per-site mutation split shows the new coverage aims at six independent sensors, not one.

Both new mediums are consequences of *how much* the resolver reaches for, rather than of the routing rule itself, and neither one changes where a notice goes. **G-1 is the one I would fix first** — not because it is dangerous, but because the code now does the opposite of what the comment three lines above it says a prior ruling decided, and the next person to read that comment will believe it. **G-3 is the cheapest** — one sentence, and it is currently contradicted by a test in this same commit.

---

## TERMINAL REPORT

This re-review pass is **CLOSED**. No mutation, probe or repo write follows this report. Final state verified: `git status --porcelain -- .pi/` empty, HEAD still `4a70a26`, all 20 mutations restored `cmp`-identical; the only file I wrote is this one. This machine's `~/.pij` was never read or written and the live daemon was never touched — every probe ran against `mkdtemp` homes. Every remedy implied by G-1 through G-4 is a code change and therefore outside this read-only reviewer seat's fence.

4a70a261a615f6502fe8c1c9cba0bca78602c811

---

# Re-review FX-02

**Verdict: APPROVE-WITH-FINDINGS** · highest severity **low** · no open major/high → **not FIX_REQUIRED**
**Frozen SHA**: `b16d18a75fc004063396009f6d947de1580fcf75` · parent `4a70a26` (the tree of § Re-review FX-01) · branch `s391/item16-watchdog-parent-route`
**Packet**: `fix-02.md` — my G-1, G-2, G-3, G-4 (+ G-6 comment)
**Scope**: `git diff 4a70a26..b16d18a` — 12 files (9 `.ts`, 3 docs), +178/−42

## R0 — Scaffolding, and the limits of this pass

Scaffolding stated before findings, because it changes how much weight each row below can carry.

- **Mutation harness** carried forward from FX-01 and **re-pinned to `b16d18a`** (`/tmp/pwfx2/mut.sh`). It refuses to run if HEAD has moved, refuses if a target file is already dirty, and **aborts if `git diff --name-only -- .pi/` is empty after the edit** — the false-GREEN guard I added after a chained `git diff --exit-code` short-circuit produced a vacuous pass earlier in this stream. Every run restores from a pristine byte-copy and verifies with `cmp`.
- **Cheap selector** = the 5 touched/consumer test files (`binding.test.ts`, `loop.test.ts`, `death-reconciler.test.ts`, `daemon.test.ts`, `daemon-push.test.ts`): **303 passed / 4 skipped in 8.6 s**. Every RED below is from that selector; the **one survivor was re-confirmed on the FULL suite**, never on the selector alone.
- **Base tree** for the declaration diff: `git archive 4a70a26` into `/tmp/pwfx2base` with `node_modules` symlinked.
- **Probes** (`/tmp/pwfx2/probe/`) run on `mkdtemp` homes or pure memory. They never read or write this machine's `~/.pij`. The live daemon was not touched.
- Tracked tree verified byte-identical to `b16d18a` before and after (`git status --porcelain --untracked-files=no` empty). This file is the only thing I wrote.

**What I did NOT verify** — a gate I did not examine must not look like a gate I found clean:

- `just lint` repo-wide, `harness checks`, and the coder's own `docs/plans/391-day3-core/logs/vitest-phase7-fx02.log` (I ran my own full suite instead).
- Anything Windows/`pwsh` (`pwsh` is not installed here; a repo-wide vitest fails `harness/scripts/release-age-policy.test.ts:196` for that reason alone, so I scope to `.pi/extensions/pij/` — the dossier form).
- Any live-daemon, real-tmux, or real `pij link` behaviour.
- Cost figures are single-machine, warm-cache, synthetic: **shape and scaling, not an SLA**.

## R1 — Freeze, gates, anti-vacuity, fence

**Freeze** — HEAD `b16d18a`, branch `s391/item16-watchdog-parent-route`, parent `4a70a26`, chain `9b5e42d → 528a0f1 → 0f10d7c → cc96eca → 4a70a26 → b16d18a`, tracked tree clean. ✅

**Gates (mine, not relayed)**

| Gate | Command | Result |
|---|---|---|
| Full suite | `npx vitest run .pi/extensions/pij/` via `pij bg` (`bg-mtc7kjn3-0ik1ie`) | **171 files / 4096 passed / 2+15 skipped / 0 failed**, 189.0 s — matches the coder's claim exactly |
| Typecheck | `npx tsc --noEmit -p .` | exit **0** |
| Lint | `npx biome check` on all **9** changed `.ts` files | exit **0**, "Checked 9 files … No fixes applied" |

**Anti-vacuity — declarations counted with the runner, not a regex.** `npx vitest list` over the 5 files in both trees: base **300** → head **303**. Set difference:

- **REMOVED: none.** ✅
- **ADDED (3)** — exactly the three sensors the packet demanded:
  - `loop.test.ts > … > planned-id bind resolves notices from the hot registry without scanning the archive`
  - `daemon.test.ts > … > adds no archive scan for lifecycle notice routing on the 600ms tick`
  - `daemon.test.ts > … > summarizes 1000 withheld death notices in one line with only three subject ids`

A declaration diff is blind to assertions deleted from a *surviving* test, so I also enumerated every removed line. **Exactly 2 `expect(` lines are removed in the whole range**, both the `withheldNoticeLines` assertions in `death-reconciler.test.ts` each replaced in place by a `withheldNoticeSubjects` assertion (now `:47` and `:170`). That is a *narrowing* — the old assertions pinned the full candidate-state text on the death path — but it is forced by the design the packet mandated (the death path no longer emits candidate-state lines at all: the `noLiveNoticeRecipientLine` import is removed from `death-reconciler.ts`). The function itself remains pinned by `loop.test.ts:460/618/1030`, `daemon.test.ts:1884/1941/2025`, `daemon-push.test.ts:122`, `binding.test.ts:469`. The third removed line is the `FakeDelivery` import, widened to `{ FakeDelivery, FakeRegistry }`.

**Fence.** Blob identity of the contract surfaces, at base `9b5e42d`, at `4a70a26`, and at `b16d18a`:

| File | Status |
|---|---|
| `core/types.ts`, `core/ports.ts`, `core/registry-write.ts` | identical at all three — **no descriptor schema change, no port change** |
| `adapters/fs-registry.ts`, `adapters/fakes.ts`, `adapters/channel.ts`, `core/cli.ts` | identical at all three |
| `core/daemon/watchdog-manager.ts` | **comment-only** — 12 changed lines, all inside `//` or `/** */`; `notifyWatchers` and every watcher-list semantic untouched |

**Scope / creep.** 9 code files = the 5 the packet names (`binding.ts`, `loop.ts`, `death-reconciler.ts`, `watchdog-manager.ts`, `daemon.ts`) + `daemon-push.test.ts` (the G-6 comment the packet asks for) + 3 test siblings (`loop.test.ts`, `death-reconciler.test.ts`, `daemon.test.ts`) that carry the RED evidence the packet explicitly requires. 3 docs = `docs/how/pij-watchdog.md`, `execution.log.md`, `tasks.md`. **No creep.**

## R2 — Mutation ledger (16 mutations · 15 RED · 1 survivor)

All sha-pinned to `b16d18a`, RED→restore→GREEN, every restore `cmp`-verified byte-identical.

| # | Site | Mutation | Result |
|---|---|---|---|
| **N1** | `binding.ts:302` | re-add the archive: `[...registry.listTerminal(), ...registry.list()]` (the FX-01 shape) | **RED 2 — BOTH new archive sensors**: `loop.test.ts` "planned-id bind … without scanning the archive" + `daemon.test.ts` "adds no archive scan … on the 600ms tick" |
| N10 | `binding.ts:302` | view returns `[]` | RED **53** across `loop.test.ts` (24), `daemon.test.ts` (21), `daemon-push.test.ts` (8) |
| N11a | `daemon.ts:823` | site-local archive read at the death-sweep site only | RED 1 (`adds no archive scan…`) |
| N11b | `loop.ts:437` | site-local archive read at loop site 1 only | RED 1 (`planned-id bind … without scanning the archive`) |
| **N11c** | `daemon.ts:1144` | site-local archive read on the **lifecycle** notice path | 🟡 **SURVIVOR** — selector GREEN **and full suite 171 files / 4096 passed, byte-identical to baseline** |
| N2 | `daemon.ts:832` | summary guard `> 999999` (never log) | RED 1 |
| **N3** | `daemon.ts:840` | log the summary **twice** | RED 1 — pins *exactly one*, not merely presence |
| N4 | `death-reconciler.ts:103` | subject cap `< 3` → `< 100000` | RED 1 |
| N14 | `death-reconciler.ts:103` | subject cap `< 3` → `< 1` | RED 1 — the cap is pinned at 3 from **both** sides |
| **N5** | `daemon.ts:832` | re-introduce per-subject `notice dead for …` lines beside the summary | RED 1 — the zero-detail assertion holds |
| N6 | `death-reconciler.ts:104` | never record a subject | RED 3 (`daemon.test.ts` + 2 in `death-reconciler.test.ts`) |
| N7 | `daemon.ts:835` | `remainder` = the full count (off-by-3) | RED 1 |
| N12 | `death-reconciler.ts:102` | `noticesSuppressed += 0` | RED 5 |
| N8 | `daemon.ts:1145-1146` | drop the single-seat diagnostic line | RED 4 (stalled ×2, provider-failure, unregistered-recipient) |
| **N9** | `daemon.ts:1145-1146` | **double** the single-seat line | RED 4 — same four; single-seat paths pin *exactly one* line each |
| N13 | `loop.ts:444-445` | **double** the bind-path line | RED 1 |

**Why N11a/N11b/N11c are split rather than combined.** A single combined mutant cannot distinguish one shared sensor from three. Each per-site mutant reddened *only* its own site's test — and the third reddened nothing, which is the whole of finding H-1.

## R3 — The four mandated verifications

### (1) G-2 — archive read removed, and the sensor detects re-addition ✅

- **N1 kills my FX-01 survivors.** Re-adding `listTerminal()` to the shared `noticeRegistryView` now reds both new sensors. My M14/M15 (which survived the full suite at `4a70a26`) are dead.
- **No archive read remains on any tick-driven notice path.** `git grep listTerminal` over non-test sources leaves exactly **one** production call site, `daemon.ts:856` in `retireForClosedRecipients` — which is **pre-existing**: it is at `daemon.ts:836` in the base `9b5e42d`, before item 16 existed, and is not a notice path. The daemon sensor pins that count exactly (`expect(terminalReads).toBe(1)`), so a *new* archive read anywhere reachable from that tick is caught.
- **Measured, on `mkdtemp` homes, 50 hot descriptors, 200 iterations** — the same probe shape that produced the G-2 numbers, now with all three variants side by side:

| archived | pre-item-16 `list()` | FX-01 `[...listTerminal(), ...list()]` | FX-02 `noticeRegistryView()` | FX-02 vs pre-item-16 |
|---|---|---|---|---|
| 100 | 0.690 ms | 2.856 ms (**4.14×**, +2.166) | 0.683 ms | **0.99×** (−0.007 ms) |
| 500 | 0.809 ms | 10.575 ms (**13.06×**, +9.766) | 0.722 ms | **0.89×** (−0.087 ms) |
| 1000 | 0.770 ms | 20.038 ms (**26.03×**, +19.268) | 0.703 ms | **0.91×** (−0.067 ms) |
| 4000 | 0.808 ms | 79.212 ms (**98.07×**, +78.404) | 0.825 ms | **1.02×** (+0.018 ms) |

The regression is fully reversed — FX-02 sits inside measurement noise of the pre-item-16 cost at every archive size, on a `TICK_MS = 600` hot path.

### (2) G-1 — one bounded summary, zero per-notice lines ✅

My own executed probe of `resolveDeathNotices` (pure, in-memory, models the docblock's own "a host reboot kills every seat in one event"):

```
N=100  candidates=100   ->   2.0 ms  notices=0 suppressed=100  subjects=[pij-seat-0,pij-seat-1,pij-seat-2] nSubjects=3
N=500  candidates=500   ->  12.6 ms  notices=0 suppressed=500  subjects=[pij-seat-0,pij-seat-1,pij-seat-2] nSubjects=3
N=1000 candidates=1000  ->  35.3 ms  notices=0 suppressed=1000 subjects=[pij-seat-0,pij-seat-1,pij-seat-2] nSubjects=3
N=4000 candidates=4000  -> 503.2 ms  notices=0 suppressed=4000 subjects=[pij-seat-0,pij-seat-1,pij-seat-2] nSubjects=3
```

Compare the same probe at `4a70a26`, which reported `lines=1000`. The subject sample is capped at exactly 3 at every scale while the count carries the full total, so `daemon.ts:832-843` emits exactly one line:

```
death sweep: 1000 notice(s) withheld: no live recipient; subjects: pij-dead-0000, pij-dead-0001, pij-dead-0002 (+997 more); terminal truth still recorded on each descriptor
```

- **DOUBLE-log mutant (N3) is RED.** ✅ The assertion is `toEqual([one])`, not a presence check.
- **Zero per-notice lines is separately pinned** — N5 (re-adding detail lines beside the summary) is RED on `expect(logs.filter(l => l.startsWith("notice dead for"))).toEqual([])`.
- **The bound is pinned from both sides** — N4 (`<100000`) and N14 (`<1`) are both RED, so "at most three" cannot drift up *or* down.
- **Single-notice paths still emit exactly one line each.** N8 (drop) and N9 (double) each red the *same four* cases: stalled, watchdog-derived stalled, provider-failure, and unregistered-recipient. N13 does the same for the bind path.
- **Task #34's comment matches the code.** `daemon.ts:829-831` now reads "the operator wants the COUNT and only a bounded sample of subjects, not one line per corpse (task #34)" and the code three lines below does precisely that. The FX-01 wording ("the operator wants the COUNT, not 200 messages nobody can read") sat directly above code that emitted N lines; that contradiction is gone.

### (3) G-4 — one helper, both callers ✅

`grep` finds exactly **one** definition, `binding.ts:302`, and five call sites: `daemon.ts:823`, `daemon.ts:1144`, `loop.ts:437/489/618`. The duplicate at `loop.ts:184` is deleted and the private `Daemon.noticeRegistryView` at `daemon.ts:1136` is deleted. N10 (helper returns `[]`) reds **53** tests across all three consumer test files, which proves the callers genuinely route through the single definition rather than merely importing it.

### (4) G-3 — comments against `daemon.ts:1017` and the proving test ✅ (with a precision note)

The gate is `daemon.ts:1017`: `if (!noticeRecipient(d)) return;`, and `noticeRecipient` is `parentId ?? spawnedBy ?? null`, so the notice gate fires **iff both are unset**. The new comments' substantive claim is therefore true, and the second half ("unavailable candidates continue to withholding and logging") is proven by this commit's own test — `daemon.test.ts:1846` `it.each` case `["dead","dead",null]`, whose assertion at `:1881-1887` (line `:1884`) expects the withheld line, only reachable if no early return happened. The FX-01 comments said the opposite. See **H-5** for the one word I would still change.

## R4 — The two items the dispatch asked me to judge

**"absent-vs-archived classification wording is honest."** Partly. Probed directly (`/tmp/pwfx2/probe/wording.mts`), same subject, the two views side by side:

```
FX-01 view | parent=pij-dissolved-parent  state=dissolved  recipient=null withheld=1
FX-02 view | parent=pij-dissolved-parent  state=absent     recipient=null withheld=1
FX-01 view | parent=pij-failed-parent     state=failed     recipient=null withheld=1
FX-02 view | parent=pij-failed-parent     state=failed     recipient=null withheld=1
FX-01 view | parent=pij-never-existed     state=absent     recipient=null withheld=1
FX-02 view | parent=pij-never-existed     state=absent     recipient=null withheld=1
```

**Routing is identical** in every case — this is purely a diagnostic-vocabulary question, and `failed` survives because `list()` filters only `dissolved`. The *documentation* surfaces are honest and explicit: `binding.ts:300-301` states "an archived candidate is therefore absent", `docs/how/pij-watchdog.md` states "Notice routing reads only the hot registry because archived seats cannot be live recipients", and the execution log says it plainly. The **operator-facing line is not** — see **H-3**.

**"Task #34's comment still matches the code."** ✅ Yes — answered in R3(2) above with line citations.

## R5 — Findings

### H-1 (low) — the archive-read sensor misses one of the two daemon notice paths

**N11c is the pass's only survivor**, and it survived the *full* suite (171 files / 4096 passed, byte-identical to baseline), not merely the cheap selector.

Adding a site-local archive read at `daemon.ts:1144` —

```ts
resolveNoticeRecipient(descriptor, [...this.registry.listTerminal(), ...noticeRegistryView(this.registry)])
```

— is undetected. That line is `lifecycleNoticeRecipient`, reached from `pushWholeLifeTransition` (`daemon.ts:1044`), `pushWatchdogResponse` (`:1078`) and `pushProviderFailure` (`:1134`) — **all three tick-driven**, i.e. exactly the hot path G-2 was about.

The cause is in the sensor's fixture, not the rule: `daemon.test.ts:1596-1609` constructs a `Daemon` over an **empty** `home` and ticks once. `noticeRegistryView(this.registry)` at `:823` is an unconditionally-evaluated argument, so the death-sweep site is covered (N11a is RED) — but with no bound seat present, no seat ever goes stalled or provider-failed, so `lifecycleNoticeRecipient` is never entered.

Not a defect in shipped behaviour: the code at `:1144` correctly uses the shared helper today, and N1 proves the *shared* helper is guarded. This is a coverage hole in the new sensor. Cheapest remedy: register one stalled seat with an unavailable recipient in the same fixture, so both daemon-side notice sites run under the read counter.

### H-2 (low) — `docs/how/pij.md` still promises candidate-state logging the death sweep no longer does

`docs/how/pij.md:62-63` reads:

> "if neither candidate is live, the daemon withholds the notice **and logs both candidate states**."

Unqualified. After FX-02 that is false for the terminal death sweep: `noLiveNoticeRecipientLine` is no longer imported by `death-reconciler.ts` at all, so the death path emits **only** the count summary and at most three bare subject ids — never a candidate state. It remains true for the single-seat paths.

The sibling doc *was* corrected: `docs/how/pij-watchdog.md` now draws exactly the right distinction ("Single-seat notice paths log that seat's candidate states; a terminal death sweep emits one count summary with at most three subject ids"). `pij.md` was edited in FX-01 (`cc96eca..4a70a26` touches it) and missed in FX-02.

This is the one I would fix first: it is one sentence, it is user-facing, and it misleads an operator debugging precisely the fleet-reboot case task #34 exists for — they will search the log for candidate states that can never appear.

### H-3 (low) — a cleanly-dissolved parent now reports as `absent`, indistinguishable from a bogus id

Measured above. The packet anticipated this and named a remedy — *"a candidate absent from `list()` is `absent` (the log line **may say `absent-or-archived`**)"* — and the coder kept the bare word `absent`, documenting the equivalence only in a code comment and a docs sentence, not in the line the operator reads.

Consequence: `notice stalled for pij-w: no live recipient (parent pij-x absent, …)` now covers two operationally different stories — "the parent closed cleanly and was archived" and "this id was never registered / is wrong". The second is a bug hunt; the first is normal. Routing is unaffected, and `failed` still reports distinctly, so this is diagnosability only. Remedy is the packet's own suggestion: emit `absent-or-archived` for that state at `binding.ts:351`.

### H-4 (info) — the empty-subjects branch is unreachable

`daemon.ts:837-838` guards `subjects.length === 0 ? "" : …`. `noticesSuppressed` only ever increases through `withhold(subjectId, count)` (`death-reconciler.ts:101-106`), which is a no-op when `count === 0`, and the *first* call with `count > 0` always pushes a subject (`length 0 < 3`). Therefore `noticesSuppressed > 0 ⟹ withheldNoticeSubjects.length ≥ 1`, and the `""` arm cannot execute. Harmless defensiveness; noted so a future reader does not mistake it for a real case.

### H-5 (info) — one word in the G-3 comments still over-reaches

Both new comments say `pushWholeLifeTransition` "returns early **only** when both pure notice candidates are absent". Read as an absolute statement about the function, that is false: there are two further early returns before the stalled-clear branch — `daemon.ts:1024` (`isExempt`) and `daemon.ts:1030` (`!isAlive(d.pid)`). This matters most at `watchdog-manager.ts:634-637`, where the surrounding docblock is specifically enumerating why the clear path fails to fire; "only" invites the reader to conclude that a peer *with* candidates always reaches the clear branch. Dropping "only", or writing "returns early at the notice gate only when …", makes it exact. (Also, the comments use "absent" in the sense of *unset*, while `recipientCandidate` now has a formal `absent` state meaning *not registered* — two different things one word apart.)

### H-6 (info, carried from FX-01, explicitly out of the packet's scope) — the per-call map rebuild is unchanged

`resolveNoticeRecipient` still rebuilds `new Map(registryView…)` and `new Set(deadIds)` on **every** call (`binding.ts:327-330`) and is still called **inside** `death-reconciler.ts`'s candidate loop at `:114`, though that function already built an identical map once at `:91`. Measured above: 35.3 ms @ N=1000 and 503.2 ms @ N=4000, essentially unchanged from FX-01's 33.9 ms @ N=1000 — FX-02 neither worsened nor improved it, because the packet scoped G-2 to the archive read alone. It stays bounded to one-shot-per-death-event by `death-reconciler.ts:280` (`if (descriptor.terminal !== undefined) continue;`), so it is not a per-tick cost. Recorded so it is not silently inherited as "reviewed and fine".

## R6 — Disposition of the packet's findings

| Finding | Packet rule | Disposition | Evidence |
|---|---|---|---|
| **G-1** (medium) | withheld notices counted into one task-#34 summary, ≤3 subjects named; single-notice paths keep one line | ✅ **CLOSED** | own N=1000/4000 probe (`nSubjects=3`, count exact); N2/N3/N4/N5/N6/N7/N12/N14 RED; N8/N9/N13 confirm one line each on single-seat paths |
| **G-2** (medium) | remove the archive read from the tick path entirely; sensor asserts the read does not happen | ✅ **CLOSED** | N1 reds both new sensors (my M14/M15 are dead); only pre-existing `daemon.ts:856` remains; cost back to 0.89–1.02× of pre-item-16 — *sensor gap → H-1* |
| **G-3** (low) | comments state exactly what the code does | ✅ **CLOSED** | true against `daemon.ts:1017` and proven by `daemon.test.ts:1846`/`:1881` — *precision note → H-5* |
| **G-4** (low) | one exported helper, both callers | ✅ **CLOSED** | one definition `binding.ts:302`, 5 call sites, both duplicates deleted; N10 reds 53 across all three consumers |
| **G-6** (info) | one-line comment naming the fixture trap | ✅ **CLOSED** | `daemon-push.test.ts:58-59` |
| **G-5** (info) | optional | not addressed; still accurate as written in § Re-review FX-01 |

## Summary

FX-02 closes all four findings, and closes them with sensors rather than assertions of intent: my two FX-01 survivors (M14/M15) are now killed by N1, and the cost regression I measured at up to **98×** on the 600 ms tick is measurably back to baseline at every archive size. The G-1 rule is pinned from both directions — the summary cannot be dropped (N2), duplicated (N3), or unbounded (N4/N14), and per-notice lines cannot come back (N5) — while the single-seat paths keep exactly one diagnostic each (N8/N9/N13). Anti-vacuity closes exactly: three tests added, none removed, two assertions replaced in place by the design the packet mandated. Gates are mine and clean: 171 files / 4096 passed / 0 failed, tsc 0, biome 0. The fence holds — no schema, port, registry, or CLI change, and `watchdog-manager.ts` is comment-only.

The six findings are all **low or info**. Two are worth acting on: **H-2**, a one-sentence user-facing doc that now contradicts the death-sweep behaviour this very fix introduced, and **H-1**, the one survivor — the new archive sensor covers the death-sweep site but not `lifecycleNoticeRecipient`, so the tick's *other* notice path could regain an archive scan undetected. Neither is a defect in shipped behaviour.

**Verdict: APPROVE-WITH-FINDINGS** (highest **low**; no open major/high, therefore **not FIX_REQUIRED**).

## TERMINAL REPORT

This pass is **CLOSED**. No mutation, probe, or repo write follows this report. The tracked tree is byte-identical to `b16d18a`; the only file written by this pass is this one. Evidence retained at `/tmp/pwfx2/` (harness, 16 mutation scripts, per-mutation logs, three probes), `/tmp/pwfx2base/` (the `4a70a26` archive tree), and `~/.pij/pij-powerful-whale/bg-mtc7kjn3-0ik1ie.log` (full gate) + `bg-mtc7ti9t-wgawik.log` (N11c full-suite survivor confirmation).

b16d18a75fc004063396009f6d947de1580fcf75
