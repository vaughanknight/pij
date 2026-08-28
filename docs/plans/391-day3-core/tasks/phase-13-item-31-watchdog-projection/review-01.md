# Review 01 — Phase 13 / item 31 (watchdog projection · unknown never delivered · interval-aware stall · sensor provenance)

**Reviewer**: `pij-powerful-whale` (cold cross-model — claude-opus-5 via GitHub Copilot CLI)
**Frozen SHA**: `98cce88119db6c2357a379fcff52e3a44d06e710` (impl `16d02db` + evidence-only docs commit)
**Branch**: `s391/item31-watchdog-projection` · **Base**: `58c9cf100bea4a4b1348ae12ffa3e9763f0a6c3a` (= `origin/main` = `git merge-base origin/main HEAD`, re-derived)
**Range reviewed**: `58c9cf1..16d02db` (9 code files + `docs/how/pij-watchdog.md`), plus `16d02db..98cce88` confirmed evidence-only

**VERDICT: FIX_REQUIRED** — one **major** finding open (**M-1**). Highest = major.
AC-27, AC-28, AC-29 and AC-30 are each implemented and each genuinely sensored; M-1 is an **undisclosed, unscoped and unsensored fifth behaviour change** that rode along with AC-29.

---

## R0 — Scaffolding, and the limits of this pass

Stated first, so a gate I did not examine never looks like a gate I found clean.

**Scaffolding** (all outside the repo; every mutation restored and verified):

| Path | What it is |
|---|---|
| `/tmp/pw31/mut.sh` | Hardened harness: pins HEAD to `98cce88`, refuses a dirty `.pi/` *before* mutating, snapshots every tracked `.pi/**/*.ts`, **aborts if the mutation produces no diff in `.pi/`** (the false-GREEN guard), restores, re-asserts clean. |
| `/tmp/pw31/scripts/*.py` | 16 mutation scripts with anchor-count assertions (`expect`/`nth`), so a silently-missed anchor aborts instead of reporting a vacuous GREEN. |
| `/tmp/pw31/survivors.sh` | Full-suite confirmation driver for the two survivors. |
| `/tmp/pw31/statcost.mjs` | `statSync` cost probe for F-5. |
| `/tmp/pw31base/` | `git archive 58c9cf1` tree (node_modules symlinked) for the anti-vacuity comparison. |
| `/tmp/pw31/out/*.log`, `/tmp/pw31/{base,head}-tests.txt` | Per-mutation logs and both test inventories. |

**Limits — what I did NOT verify:**

- I did **not** run `harness checks`. The dispatch supplied its four known-red sensors (OSC lint / `pwsh` / windows-compat / plan-055 smoke) as baseline, and I accepted that framing rather than re-deriving it. I did not independently confirm those four are red on clean `main`.
- Repo-wide `vitest` is not runnable here (`pwsh` absent → `harness/scripts/release-age-policy.test.ts`). I ran the dossier form (`.pi/extensions/pij/`), as the coder did.
- I did **not** exercise a live daemon, real tmux, a real watchdog fire, or `pij watchdog status` end to end. Everything below is unit/integration level plus source reading. **The live daemon was never signalled and `~/.pij` was never written.**
- **Concurrency caveat (important).** This worktree is shared. At 11:52:31, mid-pass, another seat modified `docs/plans/055-pij-watchdog/proofs/run-proofs.ts` — the plan-055 smoke proof the coder's log names as known-red. I did not touch it, and I re-scoped my harness's dirty-check to `.pi/` so their work could never be clobbered by my restores. It is outside my fence and outside my vitest selector, so it cannot affect any result below. My own full-suite gate ran 11:46–11:49, i.e. **before** that edit landed.
- Cost numbers in F-5 are single-machine, warm-cache, synthetic — shape and magnitude, not an SLA.

---

## R1 — Freeze, fence, and gates

**Freeze** — verified, not assumed:

```
HEAD          98cce88119db6c2357a379fcff52e3a44d06e710   ✓ matches dispatch
branch        s391/item31-watchdog-projection            ✓
merge-base    58c9cf1 = origin/main                      ✓ (re-derived, not taken from the dispatch)
16d02db..98cce88 = execution.log.md only                 ✓ evidence-only, as claimed
.pi/ tree     clean before and after every mutation      ✓
```

**Fence** — 11 paths, all inside the packet: the 9 code files named in the dispatch, `docs/how/pij-watchdog.md`, and the phase `execution.log.md`. Nothing outside.

**`core/state.ts` byte-identical** — proven by blob identity, not by reading a diff:

```
base  git rev-parse 58c9cf1:.pi/extensions/pij/core/state.ts = d2697d0ed62d5a3a79eb577e61ecc1f7ab028297
head  git rev-parse HEAD:.pi/extensions/pij/core/state.ts    = d2697d0ed62d5a3a79eb577e61ecc1f7ab028297
```

`STALE_AFTER_MS = 60_000` still stands at `core/state.ts:22`. The global was not bumped.

**The brief's required grep is empty** (no seat-signed notice site survives outside test code):

```
$ git grep -n 'from: d\.id\|from: descriptor\.id\|notify(delivery, descriptor\.id' \
    -- .pi/extensions/pij/daemon.ts core/daemon/loop.ts core/daemon/death-reconciler.ts
(no output)
```

**Gates — re-run by me, not taken from the log:**

| Gate | Command | Result |
|---|---|---|
| Full extension suite | `npx vitest run .pi/extensions/pij/` via `pij bg` (`bg-mtcaiw3p-heqbea`) | **172 files passed, 2 skipped · 4121 passed, 15 skipped · 0 failed** (184 s) |
| Types | `npx tsc --noEmit -p .` | exit **0** |
| Lint | `npx biome check` on all 9 changed `.ts` files | exit **0** |

My suite numbers match the coder's claim (`172 / 4121 / 0`) **exactly**.

**Anti-vacuity — a declaration diff, not a count.** `npx vitest list` over the five touched test files, base tree vs frozen tree: **369 → 375**. Exactly three declarations disappear, and all three are *renames whose replacements are present*:

| Removed at base | Replaced at HEAD by |
|---|---|
| `AC-01 does not certify health on a fire that examined no evidence` | `AC-01 logs rather than publishes a fire that examined no evidence` |
| `AC-04 keeps a no-evidence fire out of anomaly capture, selectively` | `AC-04 keeps a no-evidence fire out of every watcher and capture policy` |
| `writes an always-mode capture on a first due fire, graded as no-evidence` | **split** → `logs a first-fire unknown without delivering it to watchers` **+** `keeps always-mode capture and notice for a real verdict` |

No test was silently dropped. The brief's specific question — *does the inverted test keep its (a) intent in a sibling with a REAL verdict?* — is **yes**: `keeps always-mode capture and notice for a real verdict` drives a second fire and asserts `watchdog suspect: peer` with a capture, so the always-mode capture/notice property is still pinned on a graded verdict.

Because a declaration diff is blind to an assertion deleted from a *surviving* test, I also enumerated every `expect(` line removed in the range — **8 removed / 36 added**. Seven of the eight are direct consequences of the deliberate inversion, and most are replaced by something stronger (e.g. `toMatchObject({ historical: false })` → `toMatchObject({ from: "pij-daemon", historical: false })`; a bare `delivered` recipient list → paired `to` **and** `from` assertions). The eighth is a genuine loss of an anchor — see **F-3**.

---

## R2 — Dim-0 mutation ledger

16 mutations, all sha-pinned to `98cce88`, all applied through the harness and all restored with `.pi/` verified clean afterwards. **14 RED, 2 SURVIVORS** — and both survivors were re-confirmed against the **full** suite, because a targeted selector cannot support a survivor claim.

### The five the brief required

| # | Mutation | Selector | Result |
|---|---|---|---|
| **D1** | **(1)** projection back to `anchor + interval` (pass `null` for `lastFireAtMs` in `schedulerProjection`, `watchdog-manager.ts:299-309`) | core ×3 | **RED 1** — exactly `projects the live fire clock and keeps statusAt re-anchoring` |
| **D2** | **(2)** drop the `unknown` gate — re-call `notifyWatchers` in the `else` arm (`watchdog-manager.ts:589-591`) | core ×3 | **RED 7** — the inverted case, `AC-01`, `AC-04`, `AC-05a`, `AC-05b`, the real-verdict sibling, and the paneless/unreadable discriminator. Includes `AC-05b writes no capture at all`, which is the brief's *"confirm captures are not written for unknown"* |
| **D3** | **(3)** `nextFireDueAtMs` ignores `lastFireAt` (`core/watchdog.ts:166`) | core ×3 | **RED 9 across 2 files** — including the **pre-existing** `core/watchdog.test.ts > isFireDue > keeps every interval for a frozen peer rather than skipping later fires`. This is the **one clock, two readers** proof: a single edit to the shared helper kills both the new projection test and an old `isFireDue` test |
| **D4** | **(4)** legacy detector back to bare `STALE_AFTER_MS` (`daemon.ts:1073`) | `daemon.test.ts` | **RED 1** — `waits for a 20-minute seat interval before reporting legacy stalled` |
| **D5** | **(5)** flip **legacy stalled** provenance back to the seat (`daemon.ts:1082`, `from: SENSOR_DAEMON` → `from: d.id`) | daemon+loop+dr | **RED 1** |

### AC-30 — I mutated every sensor site separately

A single combined mutation cannot distinguish one covered site from eight; a site the fixtures never reach would look sensored. So each of the eight was flipped on its own:

| # | Site | Result |
|---|---|---|
| D5 | `daemon.ts:1082` legacy stalled | **RED 1** |
| D8 | `daemon.ts:1116` watchdog-derived stalled (`SENSOR_WATCHDOG`) | **RED 2** |
| D9 | `daemon.ts:1172` provider-failure | **RED 2** |
| D10a | `loop.ts:442` bound (discovery) | **RED 1** |
| D10b | `loop.ts:494` bound (planned) | **RED 1** |
| D10c | `loop.ts:623` failed | **RED 1** |
| D11 | `loop.ts:569` bind refusal | **RED 1** |
| D12 | `death-reconciler.ts:326` descriptor death | **RED 5** |
| D13 | `death-reconciler.ts:386` expectation death | **RED 1** |

**All nine RED.** AC-30 is comprehensively pinned — this is the strongest-sensored part of the change.

### The two survivors

| # | Mutation | Targeted | **Full suite** |
|---|---|---|---|
| **D6** | `watchdog-manager.ts:662` back to `Math.min(cfg.intervalMs, STALE_AFTER_MS)` (the pre-change expression) | — | 🔴 **SURVIVOR — 172 files / 4121 passed / 15 skipped, byte-identical to baseline** |
| **D7** | `death-reconciler.ts:126` `withhold(candidate.subjectId)` → `withhold(candidate.from)` | GREEN | 🟡 **SURVIVOR — 172 / 4121 / 15, byte-identical** |

D6 is **M-1**. D7 is **F-2**.

---

## R3 — M-1 (MAJOR): an undisclosed, unscoped, unsensored fifth behaviour change

The brief asked directly: *"`watchdog-manager.ts:662` `livenessWindowMs = min(intervalMs, …)` — is that a behaviour change outside the packet?"*

**Answer: yes, on all three counts — outside the packet, undisclosed, and completely unsensored.**

### What changed

```diff
-		const livenessWindowMs = Math.min(cfg.intervalMs, STALE_AFTER_MS);
+		const livenessWindowMs = Math.min(cfg.intervalMs, this.staleAfterMsFor(session.id));
```

Since `staleAfterMsFor(id)` returns `max(STALE_AFTER_MS, intervalMs)` for any seat **with** a sidecar, the new expression collapses to `intervalMs` for every such seat. The delta is therefore exactly the amount by which a configured interval exceeds the 60-second floor:

| interval | old window | new window | |
|---|---:|---:|---|
| **100 ms** — *the value both nearby guard tests use* | 100 ms | 100 ms | **IDENTICAL — the mutation is arithmetically invisible** |
| 30 s | 30 000 ms | 30 000 ms | IDENTICAL |
| 60 s (== floor) | 60 000 ms | 60 000 ms | IDENTICAL |
| 5 min | 60 000 ms | 300 000 ms | **×5** |
| **20 min — `DEFAULT_WATCHDOG_INTERVAL_MS`** | 60 000 ms | 1 200 000 ms | **×20** |
| 45 min (the docs' own example) | 60 000 ms | 2 700 000 ms | **×45** |

### Why it matters

`reportSustainedLiveness` (`watchdog-manager.ts:649-667`) is the path whose *entire purpose*, per its own docblock, is to **clear a pinned `failure: stalled`** on a creator-less peer that the other clear-path cannot reach. Widening its freshness window makes the daemon affirm `responsive` — and clear a stall flag — for a peer whose newest activity is up to **20 minutes** old, where previously it required activity within 60 seconds.

By this repository's own policy-vs-brake test: *removing this check makes the operation do **more*** (affirm liveness more often, clear more stall flags). It is therefore a **policy**, not a one-directional safety interlock, and it inherits whatever its input is wrong about. It moves in the **less conservative** direction on a failure-signal path.

I want to be fair about the merits: the change is arguably *correct*. AC-29 moved the descriptor-level detector to `max(60 s, interval)`, so a 20-minute seat is no longer "stalled" at 65 s, and affirming its liveness at 5 minutes is consistent with that. The invariant the old comment defended — *the window is the tighter of both detectors* — is still literally true; the second term simply moved. **I am not asserting the behaviour is wrong.**

### Why it is nonetheless a major finding

1. **Outside the packet.** Dossier T006 authorises the seam for *"the legacy detector"* and says in terms: *"No change to `core/state.ts`, to the watchdog fire path, or elsewhere in `daemon.ts`."* This is a second application, inside the manager's reconcile path, that no AC asks for.
2. **Undisclosed.** `execution.log.md` § T005–T006 describes only *"The legacy daemon detector consumes that seam."* The words *liveness*, *sustained* and `662` do not appear anywhere in the log. An orchestrator reading the log would not learn that a second consumer exists.
3. **Unsensored — demonstrated, not asserted.** Reverting `:662` to the exact pre-change expression leaves the **entire 4121-test suite green and byte-identical to baseline**. Nothing in the repository can tell the two behaviours apart.
4. **The nearest guard is structurally blind.** `watchdog-manager.test.ts:1485` — *"does not fabricate recovery for a peer whose newest event is older than the interval"* — is explicitly described in-file as *"Guards the fix above from becoming a blanket amnesty."* It configures `intervalMs: 100` (`:1503`), as does its sibling at `:1453`. At 100 ms the old and new expressions are **identical**, so the one test written to stop exactly this class of over-affirmation cannot see this change at all. This is a fixture choosing a parameter value at which the mutation is a no-op.

### Remedy (either is small)

- **(a)** Revert `:662` to `Math.min(cfg.intervalMs, STALE_AFTER_MS)`, keeping AC-29's seam confined to the legacy detector as T006 specified; **or**
- **(b)** Keep it, **disclose it** in `execution.log.md` and `docs/how/pij-watchdog.md`, and **add a sensor at an interval above the 60-second floor** — e.g. duplicate the `:1485` guard with `intervalMs: 20 * 60_000` and an event ~5 minutes old, asserting the seat *is* affirmed responsive under the new rule and was *not* under the old. D6 must go RED under that test.

I have no basis to choose between (a) and (b); that is the plan owner's call. What is not acceptable is the current state, where a production-visible policy change on a stall-clearing path is invisible to both the log and the suite.

---

## R4 — The brief's "look hard at" list

| Item | Verdict | Evidence |
|---|---|---|
| `isFireDue` semantics unchanged (`max(anchors)`, disabled/paused → `false`) | ✅ | `nowMs - max(anchors) >= interval` ↔ `nowMs >= max(anchors) + interval` — algebraically identical on finite integer ms. `!enabled \|\| pausedBy` and the empty-anchor case now return `null`, which `isFireDue` maps to `false` (`core/watchdog.ts:160-179`). D3 confirms the pre-existing `isFireDue` suite still governs the shared helper |
| `statusAt` re-anchor still wins | ✅ | Third leg of the AC-27 test (`setNow(250)` + `statusAt` → `nextDueAt` 350); D1 turns the whole case RED |
| Parked-seat clock advance untouched | ✅ | D3 turns `does not fire the instant a seat UN-parks — the clock advanced while muted` RED, so that behaviour is still driven by the shared helper and still pinned |
| pij#161 — no verdict from a declaration | ✅ | The `response !== "unknown"` narrowing at `:568` is still *written*, and `WatchdogResponseEvent` still forbids `unknown`, so the compiler (not a comment) keeps a no-evidence verdict out of the daemon's stalled latch. But see **F-4** on the rationale docblock |
| pij#148 — answered peers cap at suspect | ✅ | Untouched; `consecutiveSilentFires` logic at `:573-574` is unchanged and its tests (`still climbs on silent fires and still recovers on real work`, `AC-09`) remain and go RED under D3 |
| Inverted test keeps its (a) intent in a sibling with a REAL verdict | ✅ | §R1 — `keeps always-mode capture and notice for a real verdict`, asserting `watchdog suspect: peer` |
| Capture store untouched for real verdicts | ✅ | D2 turns the always-mode capture case RED; `shouldCapture` and the capture path are not in the diff |
| Item 16's recipient routing untouched (only `from` changed) | ✅ | In `loop.ts` only the second argument of `notify(...)` changed; in `death-reconciler.ts` only `from` changed plus the new `subjectId`. No `resolveNoticeRecipient` / `noticeRegistryView` / recipient-resolution line is in the range |
| Receipt/reply addressed to `pij-daemon` is a no-op | ✅ **found** | `daemon.test.ts:2471` *"drops a delivery receipt addressed back to an unregistered sensor id"* — and it is not a bare negative: it pairs `expect(messageBodies("pij-daemon")).toEqual([])` with a positive `expect(ports.sent).toContainEqual({pane:"%4", text:"[pij from pij-daemon] sensor notice"})`, so "nothing happened at all" cannot satisfy it |
| `core/state.ts` byte-identical, `STALE_AFTER_MS` still 60 s | ✅ | §R1 blob identity |
| `watchdog-manager.ts:662` — behaviour change outside the packet? | 🔴 **YES** | **M-1** (§R3) |
| Docs state all four rules | ✅ | `docs/how/pij-watchdog.md` gained: sensor provenance + the receipt-drop rule (`:25-30`), the live-clock projection (`:165-169`), `unknown` logged-not-delivered (`:266-271`), and `max(60 s, intervalMs)` (`:277-281`). All four ACs are documented — though the docs are silent on M-1, consistent with it being undisclosed |

---

## R5 — Findings

| # | Severity | Location | Finding |
|---|---|---|---|
| **M-1** | 🔴 **major** | `core/daemon/watchdog-manager.ts:662` | Undisclosed, unscoped, **unsensored** widening of the sustained-liveness window (×20 at the default interval) on the path that clears a `stalled` flag. Full-suite survivor. §R3 |
| **F-2** | 🟡 low | `core/daemon/death-reconciler.ts:126` | `subjectId` is correct but **unsensored** |
| **F-3** | 🟡 low | `watchdog-manager.test.ts` AC-04 | Lost its selectivity anchor and its assertion-discipline comment |
| **F-4** | 🟡 low | `core/watchdog.ts:291-297` | The docblock now states the new rule without recording that it *reverses* a pij#161 decision, or how the original objection is answered |
| **F-5** | ⚪ info | `daemon.ts:1073` | One extra `statSync` per descriptor per tick — measured, negligible |
| **F-6** | ⚪ info | `watchdog-manager.ts:662` | The `Math.min` is now a no-op for any sidecar seat; the comment overstates what it computes |

### F-2 (low) — the `subjectId` fix is right, and nothing holds it there

This is the interaction with item 16 FX-02's bounded withheld-death summary. Because item 31 changes both death candidates' `from` to `SENSOR_DAEMON`, the pre-existing `withhold(candidate.from)` at `:126` would have made the operator's summary read *"pij-daemon, pij-daemon, pij-daemon …"* instead of naming the dead seats. **The coder anticipated this correctly** and introduced a separate `subjectId` (`:27`, `:35`, `:325`, `:385`), leaving `:120` and `:126` both naming the dead subject. The execution log calls it out explicitly. Good work.

But D7 shows nothing pins it: reverting `:126` to `candidate.from` leaves all 4121 tests green. The property is one careless refactor away from silently regressing into exactly the defect item 16 FX-02 was written to prevent, and it would regress *invisibly* — the summary would still be well-formed, merely useless. **Remedy**: one assertion on the withheld-subject list in a death-sweep test where the recipient is dead, asserting the dead seat's id appears and `"pij-daemon"` does not.

### F-3 (low) — AC-04 lost the anchor that made it non-vacuous

Base AC-04 paired `expect(noticesTo(h, "always-watcher")).toHaveLength(1)` with `expect(...anomaly-watcher...).toEqual([])`, and its comment said why: *"The always-watcher on the SAME fire proves the anomaly watcher's silence is SELECTIVE rather than 'nothing was delivered'."* HEAD's AC-04 asserts three negatives (`always-watcher` `[]`, `anomaly-watcher` `[]`, `captures` `[]`) plus one positive log assertion.

Under AC-28 a selectivity anchor is no longer *constructible* on that fire — nothing is delivered to anyone — so the change is forced, and the retained `expect(h.logs).toContain("watchdog unknown: peer (not delivered)")` does keep the case from passing by pure absence. So this is not a defect. What is worth flagging is that the surrounding block comment — which recorded the s097 fleet-relay discipline (*"no test here … rests on a bare negative … a bare negative is satisfied by ABSENCE"*) — was **deleted** rather than updated. That guidance was earned, applies to the block's remaining tests, and is now gone. **Remedy**: restore a short form of the discipline note, stating that under item 31 the positive anchor for a no-evidence fire is the log line plus the seat's own delivery.

### F-4 (low) — a documented rejected-alternative was reversed without saying so

Base `verdictNoticeLines` carried an explicit rationale: suppressing the notice entirely *"was the other option in pij#161 and was rejected: silence would then mean nothing happened OR something happened I could not grade, which is the same absence-renders-as-something defect one level up, and harder to notice because there is nothing to look at."*

Item 31 implements precisely that rejected option, and rewrites the docblock to describe the new rule — but does not record that a prior explicit decision was overturned, nor how its objection is now met. It is *partly* met: the daemon logs `watchdog unknown: <id> (not delivered)`. But that log is daemon-local; the **watcher** — the party pij#161 was reasoning about — now sees pure silence, which is exactly the ambiguity the original note refused. AC-28 is the plan's call and I do not contest it. **Remedy**: one sentence in the docblock or `docs/how/pij-watchdog.md` acknowledging the reversal and naming the daemon log as the compensating surface, so the next reader does not re-litigate it from scratch.

### F-5 (info) — the extra `statSync` is real and negligible

`daemon.ts:1073` replaced a constant compare with `staleAfterMsFor(d.id)` → `readSidecar` → `store.revision(id)`, and `WatchdogStore.revision` is `statSync(...).mtimeMs` (`adapters/watchdog-store.ts:88-94`). `readSidecar` caches the *parse* but still stats on every call, so this is **one additional `statSync` per descriptor per tick**, evaluated eagerly before `isWorking` is consulted (so it is paid for idle seats too). Measured:

| seats | sidecar present | sidecar **absent** (ENOENT throw) | ratio |
|---:|---:|---:|---:|
| 10 | 0.015 ms | 0.041 ms | 2.81× |
| 50 | 0.081 ms | 0.204 ms | 2.53× |
| 200 | 0.329 ms | 0.865 ms | 2.63× |
| 1000 | 1.537 ms | 4.493 ms | 2.92× |

Against a ~600 ms tick this is ≤0.75 % even at 1000 seats. **I raise no objection** — I measured it precisely so it would not be raised speculatively later. (The ENOENT path costs ~2.6–2.9× a successful stat, which is the common case for sidecar-less seats; still immaterial at these magnitudes.)

### F-6 (info) — the `Math.min` at `:662` is now vestigial

For any seat with a sidecar, `min(intervalMs, max(60_000, intervalMs)) === intervalMs` identically. The comment says the window is *"the tighter of the watchdog cadence and the descriptor-level threshold"*, but post-change the descriptor-level threshold can never be the tighter one when a sidecar exists — the expression only still does work for the sidecar-less case. If M-1 is resolved by keeping the change, the expression and comment should be simplified to say what they now mean.

---

## R6 — Disposition

| AC / task | Status | Basis |
|---|---|---|
| **AC-27** projection == live fire clock | ✅ | New test at `watchdog-manager.test.ts:256`; **D1 RED**; `schedulerProjection` now derives from the shared `nextFireDueAtMs` and the stale `nextDueAt` map is deleted (no second source of truth) |
| **AC-27** one clock, two readers | ✅ | **D3 RED across 2 files**, killing a *pre-existing* `isFireDue` test — the property is structural, not duplicated |
| **AC-28** `unknown` logged, never delivered | ✅ | **D2 RED ×7**, including captures-not-written; `unknown` still an explicit internal verdict; the compiler still forbids it reaching the stalled latch |
| **AC-29** interval-aware legacy stall | ✅ | **D4 RED**; three cases pin 20-min/no-sidecar-61 s/exempt; `core/state.ts` untouched |
| **AC-30** sensor provenance | ✅ | **9 per-site mutations, all RED**; required grep empty; receipt-to-sensor no-op pinned at `daemon.test.ts:2471` |
| **T008** docs + gates | ✅ | All four rules documented; vitest 172/4121/0, tsc 0, biome 0 — all reproduced by me |
| **Un-ACed change at `:662`** | 🔴 | **M-1** — outside the packet, undisclosed, unsensored |

**Summary.** The four acceptance criteria are all genuinely implemented and — unusually well — genuinely sensored: fourteen of my sixteen mutations went RED, the AC-30 provenance work is pinned at every one of its eight sites individually, and D3 demonstrates the projection and `isFireDue` really are one clock read twice rather than two implementations that happen to agree. The anti-vacuity comparison closes exactly, the inverted pij#161 test keeps its surviving intent in a sibling with a real verdict, and the coder correctly anticipated the `subjectId` interaction with item 16's withheld-death summary without being asked to.

The change nonetheless fails on one point. `watchdog-manager.ts:662` applies AC-29's new seam a **second** time, inside `reportSustainedLiveness` — a path no AC names, that T006 explicitly fenced off, that the execution log never mentions, and that widens the window for affirming a peer alive (and clearing its `stalled` flag) from 60 seconds to the full configured interval — twenty-fold at the default. Reverting it leaves all 4121 tests green, and the one test written to prevent exactly this class of over-affirmation uses a 100 ms interval, at which the change is arithmetically invisible. The behaviour may well be right; it is the silence of the log and of the suite that I cannot pass.

**VERDICT: FIX_REQUIRED** — M-1 open (major). F-2, F-3, F-4 are low; F-5, F-6 informational.

---

## TERMINAL REPORT

This pass is **CLOSED**. No mutation was run after this verdict was written; all sixteen were applied, run, restored and verified before this file was created. `.pi/` is byte-identical to `98cce88` and `git status --porcelain --untracked-files=no -- .pi/` is empty. The live daemon was never signalled and `~/.pij` was never written. I did not touch `docs/plans/055-pij-watchdog/proofs/run-proofs.ts`, which another seat was editing concurrently (§R0). Evidence is retained under `/tmp/pw31/`, `/tmp/pw31base/`, and `~/.pij/pij-powerful-whale/bg-mtcaiw3p-heqbea.log`.

98cce88119db6c2357a379fcff52e3a44d06e710

---

# Re-review FX-02

**Frozen SHA**: `30ab8d6` (parent `98cce88`, the tree reviewed above; branch `s391/item31-watchdog-projection`).
**Packet**: `fix-02.md` — my M-1 (major), F-2, F-3, F-4.
**Scope**: `git diff 98cce88..30ab8d6` — 5 files (4 TypeScript + `execution.log.md`).

## R0 — scaffolding, and the limits of this pass

Stated first, so a gate I did not examine never looks like a gate I found clean.

- **Tree hygiene.** The previous pass ended with me reporting that `.pi/extensions/pij/core/daemon/watchdog-manager.test.ts` was dirty in this shared worktree (the coder's in-flight FX-02 sensor). That work is now committed as `30ab8d6`. Before the first mutation I confirmed `git status --porcelain --untracked-files=no` is **empty** — no tracked file anywhere in the worktree is modified. My harness re-checks this before every single mutation and **aborts** rather than run, so I cannot clobber another seat's uncommitted work.
- **Harness.** `/tmp/pw31fx2/mut.sh`. It pins the frozen SHA, refuses to run if `.pi/` is dirty beforehand, **aborts if a mutation produces an empty `.pi/` diff** (the false-GREEN trap: a mutation that silently fails to apply otherwise reports a vacuous pass), and verifies the restore is byte-identical afterwards. Every anchor is asserted to occur **exactly once** before substitution.
- **My own gate.** I did not reuse the coder's vitest log. I ran the full `.pi/extensions/pij/` suite myself on the frozen tree *before* mutating anything: `~/.pij/pij-powerful-whale/bg-mtcbvg54-bl1ydq.log`.
- **NOT verified in this pass** (unchanged from the cold pass, and stated so it is not mistaken for coverage):
  - I did **not** run `harness checks`. Per the orchestrator's correction of 12:15, the plan-055 smoke proof remains a **named baseline red** for item 31 — the `run-proofs.ts` fold was stopped and became item 33 on a separate PR. I have therefore **not** treated it as a checkable claim on this branch, and I make no assertion about it.
  - No live-daemon, real-tmux, multi-process or Windows/`pwsh` behaviour was exercised. All evidence is single-machine, in-process vitest.
  - The live daemon (pid 82643) was never signalled; nothing under `~/.pij` was written.

## R1 — freeze, fence and gates

| Check | Result |
|---|---|
| `HEAD` | `30ab8d6b7d8a1935ae80ed41fe1a3b6328bed5cb` ✅ |
| `HEAD^` | `98cce88…` — the exact tree I reviewed above ✅ |
| Branch | `s391/item31-watchdog-projection` ✅ |
| Commits added | exactly one — `30ab8d6 fix(watchdog): restore liveness clear window` ✅ (98cce88 not rewritten) |
| Tracked tree clean before mutating | ✅ empty |
| Files touched | 4 TS + `execution.log.md` — **nothing outside the fence** ✅ |

**Gates, all run by me on the frozen tree:**

| Gate | Result | Coder's claim |
|---|---|---|
| `npx vitest run .pi/extensions/pij/` | **172 files / 4123 passed / 15 skipped / 0 failed** | 172 / 4123 / 0 — **exact match** ✅ |
| `npx tsc --noEmit` | exit 0, no output ✅ | passed ✅ |
| `npx biome check` (4 changed TS files) | `Checked 4 files. No fixes applied.` ✅ | passed ✅ |

Test count moved `4121 → 4123`, i.e. **+2**, matching the two added cases exactly.

**Anti-vacuity.** Rather than compare counts, I diffed the change itself:

- Removed lines containing a test declaration (`it` / `test` / `describe`): **zero**.
- Added test declarations: exactly **two** — `keeps fixed-notice subject ids distinct from the daemon sensor sender` and `does not clear stalled from a five-minute-old event on a 20-minute interval`.
- **Every** removed line in any test file, in full — there are only two, both from the F-3 rename, and both replaced in place:

  ```diff
  -            expect.objectContaining({ watcherId: "owner", targetId: "peer", content: "healthy\nidle" }),
  -        const notices = h.delivery.outbox.filter((item) => item.message.to === "owner");
  ```

  No assertion was deleted from a surviving test, and nothing was weakened.

**Fence proof for the production file.** Stripping comments and whitespace, `watchdog-manager.ts` has 477 code lines at `98cce88` and 477 at `30ab8d6`, differing at **exactly one**:

```
98cce88:  const livenessWindowMs = Math.min(cfg.intervalMs, this.staleAfterMsFor(session.id));
30ab8d6:  const livenessWindowMs = Math.min(cfg.intervalMs, STALE_AFTER_MS);
```

Nothing else crept in alongside the revert.

## R2 — mutation ledger (all sha-pinned at `30ab8d6`, all restored byte-identical)

| # | Mutation | Expectation | Result |
|---|---|---|---|
| **N1** | `watchdog-manager.ts:663` → `Math.min(cfg.intervalMs, this.staleAfterMsFor(session.id))` (re-apply the M-1 defect; **this is my D6**) | RED | 🔴 **RED** — exactly one test: `does not clear stalled from a five-minute-old event on a 20-minute interval`. **D6 is dead.** |
| **N2** | `:663` → bare `cfg.intervalMs` | RED | 🔴 **RED** — two tests: the new sensor **and** the pre-existing `does not call a peer alive on the DEFAULT interval when it is stale by the stall threshold` |
| **N3** | `death-reconciler.ts:126` `withhold(candidate.subjectId)` → `withhold(candidate.from)` (**this is my D7**) | RED | 🔴 **RED** — `keeps fixed-notice subject ids distinct from the daemon sensor sender`. **D7 is dead.** |
| **N4** | `notifyWatchers` → `to: alwaysMode ? session.id : watcher.watcherId` (misroute **only** always-mode notices) | sibling RED, AC-04 green | 🔴 **RED** on `keeps always-mode capture and notice for a real verdict` (+3 others); **AC-04 survived**, as predicted |
| **N5** | `:663` → `0` (disable sustained liveness entirely — *my own* probe of the opposite bound) | ? | 🔴 **RED** — `clears a durable stalled flag on a creator-less peer that is demonstrably alive` |
| **N6** | `daemon.ts:1073` → bare `STALE_AFTER_MS` (re-check AC-29 after the revert) | RED | 🔴 **RED** — `waits for a 20-minute seat interval before reporting legacy stalled` |
| **N7** | Revert **only** the F-3 watcher rename (`always-watcher` → `owner`), logic untouched | ? | 🟢 **GREEN** — see P-1 |

## R3 — the packet's five questions, answered

### (1) M-1 — the revert is real, and now bracketed on both sides

**Byte-identity.** I did not eyeball the line; I extracted the whole `reportSustainedLiveness` method from all three trees and hashed it:

| Tree | sha256 (first 16) | bytes |
|---|---|---|
| base `58c9cf1` | `24334a57a003abbf` | 987 |
| `98cce88` | `fcff990787280202` | 915 |
| head `30ab8d6` | `24334a57a003abbf` | **987 — identical to base** |

The **entire method**, comment included, is byte-identical to the merge-base. (Note the packet cites `:662`, which is `98cce88`'s numbering; at head the expression sits at **`:663`**, and at base it was `:660`. The expression is identical; only surrounding line counts moved.)

**The sensor is genuinely coupled to that line, in both directions** — this is the part I care about most, because my M-1 finding was precisely that a guard can be written for this class and still be arithmetically blind:

- Window **too wide** → N1 and N2 both RED on the new 20-minute/5-minute-old case. So the test is not passing by accident: it fails the moment the window grows.
- Window **too tight** → N5 RED on `clears a durable stalled flag on a creator-less peer that is demonstrably alive`.

That second one matters. A test asserting a flag *stays* `stalled` is satisfiable by absence — if sustained liveness never ran at all, it would still pass. N5 shows a positive control exists, so the 60-second window is now pinned from **above and below** rather than being a one-sided guard. This is a materially better outcome than the minimum the packet asked for.

**AC-29 was not de-sensored by the revert** (N6 RED), and `staleAfterMsFor` still has exactly one production consumer, `daemon.ts:1073` — the legacy detector T006 actually authorised. No second site retained the widened window.

**Docs are consistent.** `docs/how/pij-watchdog.md` is untouched, and correctly so: at `:277-280` it documents the **legacy detector** threshold as `max(60 seconds, intervalMs)`, which the revert leaves intact. It never claimed the liveness-clear window was interval-aware, so no doc statement is invalidated.

**Disclosure.** `execution.log.md` § FX-02 now states the near-miss in the terms it deserves — *"outside AC-29, undisclosed, and unsensored"* — and records the RED output. That was the half of M-1 I said I could not pass; it is now on the record.

### (2) F-2 — pinned

N3 RED. The new case uses four fixed candidates against a dead recipient and asserts `withheldNoticeSubjects` is `["s-dead-0","s-dead-1","s-dead-2"]` with `noticesSuppressed: 4` — so it pins the **bound** (first 3 of N) as well as the subject identity. My D7 survivor is dead.

### (3) F-3 — comment fully restored; the "anchor" half is presentational

**The s097 comment is verbatim.** I hashed the 12-line block rather than reading it: base lines 1802-1813 and head lines 1890-1901 both hash to `4dc6d4f582c331ce`. Identical. The item-31 explanatory lines are **appended** below it, not spliced into it — history is added to, not edited.

**The anchor asserts something a mutant can fail** — N4 confirms it. Misrouting only always-mode notices kills `keeps always-mode capture and notice for a real verdict` while **AC-04 survives**, which is exactly the claim the new comment makes: AC-04's three negatives cannot distinguish "silence by policy" from "delivery is broken", and the sibling positive can. See P-1 for what FX-02 actually contributed here.

### (4) F-4 — the reversal is recorded, not rewritten

The docblock now names pij#161's original choice, names **item 31 / AC-28** as the reverser, gives the reason (attention cost without a health claim), and names the bounded daemon log as the compensating record. That is my stated remedy delivered verbatim. It does not re-argue pij#161's specific objection — the *watcher* still sees pure silence — but I conceded in F-4 that AC-28 is the plan's call, and the point of the remedy was that the next reader should not have to re-litigate it from scratch. They no longer do.

### (5) `core/watchdog.ts` — comment-only, **not** behaviour

Proven mechanically, not by reading the diff: stripping all comments and whitespace, `98cce88` and `30ab8d6` are **character-identical at 11 603 characters**. The change is confined to the `verdictNoticeLines` docblock. It is inside the packet (F-4). ✅ Not behaviour.

## R4 — findings from this pass

### P-1 (info) — the log slightly overstates the F-3 anchor work

`execution.log.md` says the watcher tests *"restore … a positive always-watcher delivery anchor for a measured verdict."* The positive assertion was **not absent** at `98cce88` — `expect(notices).toHaveLength(1)` and `expect(notices[0]?.message.body).toContain("watchdog suspect: peer")` appear as unchanged **context lines** in the FX-02 diff. What FX-02 actually added is (a) `watcherId: "always-watcher"` in place of the inherited `"owner"`, and (b) the comment naming the pairing.

I tested whether the rename carries weight rather than assuming: **N7** reverts only the rename and leaves the logic untouched — the suite is **GREEN**. With a single watcher configured, `"owner"` and `"always-watcher"` are interchangeable, so the rename is **presentational**.

This is not a defect. The protection is real (N4), the legibility gain is real, and my own F-3 said the base's same-fire selectivity anchor is **not constructible** under AC-28 — nothing is delivered to anyone on an unknown fire — so a cross-test pairing is the best available form. I record it only so the ledger is accurate about what this commit created versus what it renamed.

### P-2 (info) — the 60-second clear window is still undocumented

`docs/how/pij-watchdog.md` documents the legacy detector's `max(60 s, intervalMs)` threshold but says nothing about the tighter `min(intervalMs, 60 s)` window that governs *clearing* a pinned stall. That gap is pre-existing (base did not document it either), so it is not a regression — but M-1 is direct evidence that this constant is load-bearing and easy to widen by accident. One sentence in § *Suspect, stalled, and recovery* would make the asymmetry explicit: the daemon is interval-patient about **setting** `stalled` and 60-second-strict about **clearing** it.

### P-3 (info) — line-number drift in the packet

The packet cites `watchdog-manager.ts:662`. At the frozen head the restored expression is at **`:663`** (base: `:660`). Cosmetic; noted so future citations are anchored to the right tree.

## R5 — disposition

| Item | Status |
|---|---|
| **M-1** (major) | ✅ **RESOLVED** — `:663` byte-identical to base at whole-method granularity; sensored, and bracketed from **both** sides (N1/N2 too wide, N5 too tight); disclosed in the log; AC-29 unaffected (N6); docs consistent |
| **F-2** (low) | ✅ **RESOLVED** — N3 RED; the bound is pinned as well as the subject |
| **F-3** (low) | ✅ **RESOLVED** — s097 comment verbatim (hash-proven); anchor load-bearing (N4), with P-1 recording that its FX-02 delta is presentational |
| **F-4** (low) | ✅ **RESOLVED** — reversal recorded with attribution and compensating surface |
| `core/watchdog.ts` scope | ✅ **PASS** — comment-only, proven character-identical after comment strip |
| New findings | P-1, P-2, P-3 — **all informational**; none blocks |

**Summary.** The fix does what the packet ordered and, on the point that mattered, does better than ordered. M-1's revert is byte-exact at method granularity rather than merely line-equivalent, and the new sensor is not the one-sided guard I would have accepted: N1 and N2 prove it fails when the window widens, and N5 proves a positive control exists so it cannot pass by absence — which is the failure mode that let the original defect through a test written for exactly that risk. The revert did not de-sensor AC-29, `staleAfterMsFor` retains exactly one production consumer, and the sustained-liveness method is now indistinguishable from the merge-base. F-2's survivor is dead, the s097 comment is restored to the byte, and the pij#161 reversal is recorded with attribution rather than quietly overwritten. My three residual notes are bookkeeping: one commit message claims to have restored an assertion that was already there (P-1, proven presentational by N7), one documentation gap predates this branch (P-2), and one line citation drifted by one (P-3). None of them changes behaviour, and none of them is worth another round.

**VERDICT: APPROVE** — M-1 closed; F-2, F-3, F-4 closed. Highest remaining severity: **info**.

---

## TERMINAL REPORT

This pass is **CLOSED**. All seven mutations were applied, run, restored and verified **before** this section was written; none was run afterwards. `.pi/` is byte-identical to `30ab8d6` and `git status --porcelain --untracked-files=no` is empty across the whole worktree. Every mutation ran through a harness that refuses to start on a dirty `.pi/` and aborts on an empty diff, so no uncommitted work by another seat in this shared worktree could be touched or masked. The live daemon (pid 82643) was never signalled and nothing under `~/.pij` was written. I did not run `harness checks`; per the orchestrator's correction the plan-055 smoke remains a named baseline red for item 31 and I assert nothing about it. Evidence retained under `/tmp/pw31fx2/` and `~/.pij/pij-powerful-whale/bg-mtcbvg54-bl1ydq.log`.

30ab8d6b7d8a1935ae80ed41fe1a3b6328bed5cb
