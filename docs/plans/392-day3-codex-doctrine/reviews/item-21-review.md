# Item 21 cold review — bind-guard advisory tail (ADV-A2 / ADV-B / ADV-C)

> **TERMINAL REPORT.** This pass is CLOSED. No mutation, probe, or repo
> modification was run after this file was written. The only artefact I created
> in the repo is this file.

**Candidate**: `18584414547a5f84371a651832b0d0e5b08565d2` ("fix(pij): close bind refusal notice gaps")
**Verified as**: cherry-pick onto fresh `origin/main` `e46eec8a1b042d8bdf2b2e7479ac3801b1890ca0` → `2fb411395f6bc0f864ac2971799a74ed4cb18173`
**Reviewer**: `pij-wilful-morton` (cold)

## VERDICT: ✅ **APPROVE**

All three mandated Dim-0 mutations RED → restore → GREEN, sha-verified on disk.
ADV-A2 and ADV-B are correct, composed correctly with item-17's ADV-A, and
proven at 6× the shipped tests' depth. No test lost, no assertion weakened.

Three advisories, **none blocking**, all evidence-backed:

- **ADV-C is a net TRADE, not the pure tightening it is described as.** Two
  shapes `main` caught are now MISSED, and a new false-positive class exists.
  The residual comment documents only under-catching from split lines and
  dataflow — it does not disclose either. (§5.4)
- **ADV-A2 silently re-arms the FAILED notice too**, not just the bound notice.
  Benign direction (more honest), but undocumented and unsensored. (§5.5)
- MUT-C's packet line is the `it.each` declaration, not the RED line. (§3)

---

## 1. Scaffolding, and the limits of this review — stated FIRST

**Scaffolding built (all torn down, §8):**

- `/tmp/pij-i21` — detached worktree at `origin/main`, then `git cherry-pick 1858441` applied → HEAD `2fb4113`. **This, not the stream branch, is the tree I reviewed**, per the packet's COORD-004 instruction.
- `/tmp/pij-i21-main` — detached worktree at `origin/main` `e46eec8`, untouched, used as the authoritative behavioural baseline.
- Both given `node_modules` symlinks to `~/GitHub/pij/node_modules`.
- `/tmp/i21-mut.py` — mutation harness enforcing **anchor uniqueness** (aborts unless the anchor occurs exactly once), **refusing no-ops**, and sha-verifying that the mutation actually landed and that restore returned the byte-exact pristine file.
- Four scratch probe files, each appended to a **copy** of a shipped test file, run, then deleted (`index-state.probe.test.ts`, `loop.probe.test.ts`, `loop.probe2.test.ts`).

**What I could NOT check, and did not:**

1. **No live daemon.** Every behavioural claim below is proven through
   `driveSession` at the unit boundary with fake ports. I did not stand up a real
   tmux seat, so the *production reachability* of the refuse→bind→refuse→bind
   cycle is **reasoned, not executed** — see §5.2 for the reasoning and its
   weakest link.
2. **I did not mutate `resolveAgentLiveness`** (`core/state.ts:419`). I read its
   six cause branches and confirmed the taxonomy is exhaustive, but no sensor of
   mine guards that reading.
3. **The `paneIdAliases` scope model is untested by me beyond single files.** I
   proved the false positive exists (§5.4) but did not survey how many
   real-world shapes would trip it beyond the count reported there.
4. **I did not review the dossier** (`tasks/item-21-bind-guard-tail/tasks.md`) —
   this is a code review against the packet and the diff only.
5. The pre-existing red is environmental on this host (`pwsh` absent). I proved
   it identical on `main` (§7) but cannot speak to its behaviour on a host that
   has PowerShell.

**Pristine sha256 (candidate tree, before any mutation):**

| file | sha256 |
|---|---|
| `core/daemon/loop.ts` | `c77fe6a10bf54581f477aa0dff911eaa92e90231a9908c37d6f3e957aa311876` |
| `core/daemon/loop.test.ts` | `c6d977fb7a71b9b298ed42f1d63f9920e813546b33e5d4e6b660acb6c8a5cf0c` |
| `core/daemon/index-state.test.ts` | `eb7ad301cc6164dfb2d5b69219f7afee66b6afc354d40740424dbb939f0152b2` |

`git status --porcelain` was confirmed **empty** between every mutation step and
at the end of the review.

---

## 2. Branch shape and the fence claim — VERIFIED, but the packet buried a hazard

The candidate sits on the s392 stream branch, which is **58 commits ahead** of
`origin/main`, with merge-base `10483d8e` — **not** main. This is precisely the
drift hazard that produced a finding on item 20, so the packet's cherry-pick
instruction is load-bearing rather than ceremonial. I followed it.

| check | result |
|---|---|
| `merge-base(origin/main, 1858441)` | `10483d8e` — **not** main |
| commits ahead of main | **58** |
| reconcile base `3adf0515` is ancestor of `origin/main`? | **YES** |
| main moved since `3adf0515`? | **YES** — PR #24 (`e46eec8`, 3 commits, 13 files) |
| does that drift touch the 3 fence files? | **NO — none** |
| cherry-pick onto fresh main | **clean, exit 0** |
| `patch-id --stable` `1858441` | `f4040a97ed46bd65220cfc66a1d806f3d5513e56` |
| `patch-id --stable` `2fb4113` (picked) | `f4040a97ed46bd65220cfc66a1d806f3d5513e56` — **identical** |

The cherry-pick is **byte-faithful**, not merely similar — `patch-id` rather
than `--stat`, because `--stat` can match while content differs.

**Fence = 3 files, +124/−15**, exactly as claimed:
`core/daemon/loop.ts` (+11/−4 net), `core/daemon/loop.test.ts`,
`core/daemon/index-state.test.ts`. Production change is **11 lines in one file**.

Incidental, out of fence but worth recording: the parent reconcile commit
`a2b4ae7` reverts `daemon.ts`/`daemon.test.ts` — consistent with item 23's
ruling-2 BLOCK having been actioned upstream. Not reviewed here.

---

## 3. Dim-0 mutation ledger — 3/3 mandated, all sha-verified RED → restore → GREEN

Baseline (both fence test files, candidate tree): **112 passed**, exit 0, 243 ms.

| # | mutation | file | mutated sha256 | RED at | scope |
|---|---|---|---|---|---|
| MUT-A2 | delete `drive.settled = false;` from `reportBindRefusal` | `loop.ts` | `9409a583125fc1b32b822937d2a0872b4ba7c7d63daa8e6e1c632f1773186548` | `loop.test.ts:562:83` | 1F / 111P |
| MUT-B | revert `reportableIdentityCause` to `foreign-session-id` only | `loop.ts` | `2852e51b221726b545c5f45f5c07797087d741264ae146721914a01b334c2ce8` | `loop.test.ts:501:19` | **2F** / 110P |
| MUT-C | drop `aliases.has(left) \|\| aliases.has(right)` | `index-state.test.ts` | `044234449bed92e59cdcf07a3b03effa7f80d59150fdcbc8b9c1006f660f8e00` | `index-state.test.ts:275:22` | **2F** / 110P |

All three restored to the byte-exact pristine sha (§1 table) and returned GREEN.
No RED needed remapping: MUT-A2/MUT-B edit production source while the failures
land in an untouched test file.

**Line-claim accuracy — 2/3 exact, 1 off:**

| mutation | packet claimed | actual | verdict |
|---|---|---|---|
| MUT-A2 | `loop.test.ts:562` | `562:83` — `expect(...includes("ready")).toHaveLength(2)` | ✅ **exact** |
| MUT-B | `loop.test.ts:501` | `501:19` — `expect(notices).toHaveLength(1)` | ✅ **exact** |
| MUT-C | `index-state.test.ts:270` | **`275:22`** | ⚠️ 270 is the `it.each(...)` **declaration** line, not the assertion |

MUT-C's claim is not wrong so much as imprecise — it names the parameterised
test's declaration rather than where vitest reports. Recorded so a future reader
doesn't chase a phantom mismatch. **INFO-1.**

**MUT-B and MUT-C are each stronger than the packet implies** — both RED two
tests, not one, because each guards a two-case `it.each`.

---

## 4. What the production change actually is

11 lines in `loop.ts`, two independent edits:

**ADV-B** — `reportableIdentityCause` (`loop.ts:397-401`) is extracted and widened
from `foreign-session-id` alone to also cover `no-harness-process` and
`harness-process-present`.

**ADV-A2** — `drive.settled = false;` added to `reportBindRefusal` (`loop.ts:545`),
placed **after** the `if (surfaced.has(cause)) return;` dedup guard. That
placement is correct and load-bearing: a repeated refusal for an
already-surfaced cause returns early and therefore does **not** reset the latch,
which is what keeps §5.1's tick-level spam bounded.

The liveness cause taxonomy is **exhaustive and correctly partitioned**
(`core/state.ts:419-529`, six causes):

| cause | line | disposition | correct? |
|---|---|---|---|
| `session-id-match` | 459 | binds | ✓ |
| `foreign-session-id` | 529 | reported (pre-existing) | ✓ |
| `no-harness-process` | 483 | **now reported** | ✓ new |
| `harness-process-present` | 503 | **now reported** | ✓ new |
| `probe-unavailable` | 427 | quiet retry | ✓ genuinely transient |
| `identity-indeterminate` | 477, 515 | quiet retry | ✓ genuinely transient |

The two left quiet are exactly the two that mean "the evidence was not legible"
— `probe-unavailable` (process table unreadable) and `identity-indeterminate`
(a truncated/empty command line). Refusing to notify on unreadable evidence is
the right call; the code says so itself at `state.ts:478` ("an absence cannot be
declared over evidence that was never legible"). **The partition is correct.**

Note `harness-process-present` returns `liveness: "alive"`. Pre-item-21 such a
seat was **alive, permanently non-binding, and completely silent** — it fell
through to `if (identity?.cause !== "session-id-match") return { kind: "waiting" }`
with no notice, forever. That is a real, sharp gap and ADV-B closes it.

---

## 5. Dim-1 semantic checks

### 5.1 ADV-A2 composes with item-17's ADV-A — ✅ CONFIRMED, and no spam

The two interlock cleanly: item 17 clears `bindRefusalCauses` on a successful
bind (`loop.ts:439`); item 21 resets `settled` on a refusal (`loop.ts:545`).

I did not take the shipped 2-cycle test's word for it. **Probe P-OSC**: 6 full
refuse→bind cycles, with **three consecutive refusing ticks per cycle** (30
`driveSession` calls total), run identically against both trees.

| tree | ticks | refusal notices | ready notices | total |
|---|---|---|---|---|
| `origin/main` | 30 | 6 | **1** | 7 |
| candidate | 30 | 6 | **6** | 12 |

Two things are proven at once:

1. **The bug is real.** On main the spawner is told "ready" exactly once, ever.
   After the first recovery it is left on a stale refusal notice for a seat that
   is in fact bound — precisely the ADV-A2 claim.
2. **No unbounded spam.** Growth is **linear in genuine incidents, not in
   ticks**: 30 ticks produced 12 notices, and the 3 consecutive refusing ticks
   within each cycle collapsed to exactly 1 notice each. The dedup on the
   refusal side does its job, and it does so *because* `settled = false` sits
   after the early return.

A re-bind notice per genuine recovery is a real event. **This is correct.**

### 5.2 ADV-A2 safety on a first-ever refusal — ✅ no-op, as claimed

`settled` is declared optional (`loop.ts:149`) and starts `undefined`. Setting it
to `false` before any bind is a no-op on a falsy value, and the normal
single-bind announce path is unaffected — main and candidate both emit exactly 1
ready notice on the first cycle (§5.1), and probe P-FAIL tick 1 showed a clean
bind with `settled=true`.

**Weakest link, stated plainly:** for the oscillation to occur in production,
`driveSession` must be re-entered for a seat that already bound. `applyBinding`
sets lifecycle `bound` and the pending filter excludes it, so this requires a
revive path returning the seat to pending while retaining the same `DriveState`.
I did not execute that path in this review. If it is unreachable, ADV-A2 is
harmless but inert; if reachable, it is a genuine fix. The unit-level behaviour
is correct either way.

### 5.3 ADV-B is notify-only and does NOT suppress a later bind — ✅ EXECUTED

The packet asks whether notify-only is honest. **Probe P-LATEBIND** answers it by
execution rather than reasoning: 4 consecutive `no-harness-process` ticks, then
the harness process appears.

```
stuckTicks=["waiting","waiting","waiting","waiting"]  stuckNotices=1
afterKind=bound  readies=1
```

Exactly one notice across four stuck ticks (dedup holds), **never terminal** —
every tick returns `waiting`, so the seat is not failed or dissolved — and the
moment the harness appears it **binds and announces**. Notify-only is honest: it
reports the condition without foreclosing recovery.

### 5.4 ⚠️ ADV-C — the residual is honestly *labelled* but materially INCOMPLETE

The comment (`index-state.test.ts:60-63`) is commendable in tone — it explicitly
calls itself "a textual safety brake, deliberately not an exhaustiveness proof",
and the packet correctly does **not** claim the residual is "closed". Credit
where due: that framing is right.

But the residual it discloses is *only* under-catching from **split lines** and
**arbitrary dataflow**. I ran the same fixtures through both implementations:

| shape | main (old) | candidate (new) | direction |
|---|---|---|---|
| `descriptor.paneId === targetPaneId` (control) | 1 | 1 | — |
| aliased destructure | 0 | **1** | ✅ gained |
| reversed aliased destructure | 0 | **1** | ✅ gained |
| `.paneId === x && .windowId === undefined` | 0 | **1** | ✅ gained |
| `descriptor.paneId === pane!.id` | 1 | 1 | — |
| `descriptor.paneId === pane?.id` | 1 | 1 | — |
| **`descriptor.paneId === "%42"`** (string literal) | **1** | **0** | ❌ **LOST** |
| **``descriptor.paneId === `%${n}` ``** (template) | **1** | **0** | ❌ **LOST** |
| `{ paneId: paneKey }` then `someCounter === paneKey` | 0 | **1** | ❌ **false positive** |

**Cause of the loss.** The old matcher `/\b[\w$.[\]]+\.paneId\s*===/` needed only
the **left** operand to be identifier-shaped. The new matcher iterates
`([\w$.[\]]+)\s*===\s*([\w$.[\]]+)` and so requires **both** operands to match
that class — a string or template literal on the right causes the whole
comparison to fail to match, and the line is never examined.

**Cause of the false positive.** `paneIdAliases` harvests
`/\{\s*paneId\s*:\s*([\w$]+)[^}]*\}/g`, which matches an **object literal**
`{ paneId: paneKey }` just as readily as a destructuring pattern. The alias set
is also file-global and scope-blind, so any later `x === paneKey` anywhere in
that file is flagged.

**Severity — sized honestly, and it is low:**

- The sweep skips `.test.ts` (`index-state.test.ts:306`), so it scans production
  source only, where comparing a runtime tmux pane id to a hardcoded literal is
  very unlikely.
- I searched the real tree: **0** occurrences of `{ paneId: <ident> }` in
  non-test source, so the false positive is **latent, not firing**.
- The real repo-wide sweep is green, and the full suite passes (§7).
- The shapes *gained* (aliases, compound conditions) are far more plausible in
  real code than the shapes lost.

So I do not treat this as blocking. But the item is described as the sweep being
"tightened", and it is more precisely a **trade**: broader on the shapes that
matter, strictly narrower on two it used to catch, plus a new over-catch class.
For a safety brake, an undisclosed narrowing is the direction that deserves to be
written down. **→ ADV-1.**

### 5.5 ⚠️ Undocumented widening: ADV-A2 re-arms the FAILED notice too

`settled` is documented at `loop.ts:148` as *"A terminal notice (bound/failed)
was already delivered."* It gates **three** notices, not one:

- `loop.ts:431` — bound notice, planned path
- `loop.ts:476` — bound notice, discovery path
- `loop.ts:594` — **failed** notice, inside `fail()`

ADV-A2 clears that latch on refusal, which necessarily re-arms the failed notice
as well. **Probe P-FAIL** (bind → refuse → bad model in pane → `fail()`), run on
both trees:

| tree | settled after bind | after refusal | failed notices emitted |
|---|---|---|---|
| `origin/main` | `true` | `true` | **0** (suppressed) |
| candidate | `true` | **`false`** | **1** — `⚠️ pij-w failed to bind: bad model in pane: model-not-supported` |

This is a real behaviour change beyond the packet's description ("re-bind
re-announces"). **The direction is benign — arguably a second bug fix**: main
silently swallows a genuine post-rebind failure, and telling the spawner its seat
died is strictly more honest.

I am not asking for it to be reverted. I am recording that it is **undocumented
and unsensored** — no test covers it, so nothing would notice if it regressed or
if a future change made it fire spuriously. **→ ADV-2.**

The discovery-path bound notice at `:476` is not reachable this way:
`reportBindRefusal` has exactly **2 references repo-wide** (definition
`loop.ts:533`, single call `loop.ts:407`), and that call is inside the
`if (descriptor.plannedHarnessSessionId)` block, every branch of which returns —
so a planned seat never falls through to discovery.

---

## 6. No collateral — structural, both directions

`npx vitest list` in both trees, sorted and `comm`-diffed, **paired with a line
diff** (a name diff alone is blind to assertions weakened inside a surviving
test).

**107 → 112.** 1 removed, 6 added, and it reconciles exactly:

- **1 removed / 1 added = a rename.** `"clears bindRefusalCauses on a successful
  bind so a later refusal reports again (ADV-A)"` → `"re-announces bound after
  refuse → bind → refuse → re-bind (ADV-A/A2)"`. The diff shows item-17's
  original assertions **preserved verbatim**, with the A2 assertions appended
  after them. Coverage **extended**, not replaced.
- **5 genuinely new**: 3 sweep fixtures (aliased destructure, reversed aliased
  destructure, unrelated-`undefined`-same-line) + 2 ADV-B `it.each` cases.

`107 − 1 + 6 = 112` ✓

**Line diff — exactly one removed `expect(` line across both test files:**

```
-  expect(violations[0]).toContain("core/rogue.ts:1");
+  expect(violations[0]).toContain(`core/rogue.ts:${line}:`);
```

That is **stricter**, not weaker: it parameterises the expected line number
(so the two new multi-line fixtures must report line 2, not 1) and adds a
trailing colon to the match. Every other removed line is the old
`isPaneResolutionComparison` implementation being replaced.

**No test lost. No assertion weakened.**

---

## 7. Gates — all reproduced first-hand

| gate | result |
|---|---|
| fence test files (2) | **112 passed**, exit 0 |
| `tsc --noEmit` | **exit 0** |
| `biome check --max-diagnostics=200` (3 fence files) | **exit 0**, no fixes |
| full repo suite | **4663 passed / 1 failed / 19 skipped**, 235 files, 181 s |

**The single red is pre-existing and outside the fence — proven, not assumed:**

- File: `harness/scripts/release-age-policy.test.ts` → `Error: spawnSync pwsh ENOENT` at `:196:17`.
- Same file run in the **`origin/main` worktree**: **1 failed / 9 passed** — byte-identical failure.
- `git diff --name-only HEAD~1 HEAD | grep -c release-age-policy` → **0**. The candidate does not touch it.
- `which pwsh` → **absent on this host**. The cause is environmental.

The packet's `gatesClean:false` claim is therefore **honest**, and it does not
touch any of the 3 changed files.

---

## 8. Teardown

- `/tmp/pij-i21`, `/tmp/pij-i21-main` → `git worktree remove --force`, verified gone; `git worktree list` clean.
- All 4 scratch probe test files deleted by their own harnesses (existence re-checked `False` after each run).
- All 3 mutated files restored and **sha-verified** against §1.
- `/tmp/i21-*.py`, `/tmp/i21-*.txt` removed.
- No branch checked out (both worktrees `--detach`), no commit, no push.
- Only repo artefact: this file.

---

## 9. Advisories

**ADV-1 (ADV-C residual is materially incomplete) — non-blocking, docs + optional fix.**
The comment discloses only split-line and dataflow under-catching. It should also
record (a) that comparisons against a **string/template literal** on the right
are no longer caught *although main caught them* — the matcher now requires both
operands to be identifier-shaped; and (b) that `paneIdAliases` matches **object
literals**, is file-global and scope-blind, and can therefore over-flag. The
one-line fix for (a) is to also flag when either operand ends with `.paneId`
regardless of the other side's shape. Evidence: §5.4 table, both trees.

**ADV-2 (ADV-A2 re-arms the failed notice) — non-blocking, add a sensor.**
`settled = false` clears the latch for `fail()` at `loop.ts:594`, not only the
bound notices. Main suppresses a post-rebind failure notice; the candidate emits
it. The direction is an improvement, so I recommend **keeping it and pinning it
with a test**, plus updating the `settled` doc comment at `loop.ts:148` to say
the latch is now per-incident rather than per-seat-lifetime. Evidence: §5.5.

**ADV-3 (oscillation is unbounded over time, by design) — informational.**
A seat that flaps indefinitely produces 2 notices per cycle forever. My P-OSC
probe shows this is linear in incidents and never per-tick, and the packet
already deems a re-bind notice "a real event (acceptable)". I agree. Recording it
only so the accepted bound is written down somewhere: **2 notices per genuine
refuse→recover incident, 0 per repeated tick.**

**INFO-1** — MUT-C's packet line (270) is the `it.each` declaration; vitest REDs
at **275:22**. Worth correcting in future packets so a reviewer doesn't read the
mismatch as drift.

**INFO-2** — `harness-process-present` returns `liveness: "alive"`, so the gap
ADV-B closes was an *alive*, permanently non-binding, entirely silent seat. That
is a sharper bug than "refused forever silently" conveys, and ADV-B is well
targeted at it.

**INFO-3** — the parent reconcile commit `a2b4ae7` reverts `daemon.ts` /
`daemon.test.ts`, consistent with item 23's ruling-2 BLOCK having been actioned.
Out of fence; not reviewed.

---

## 10. Bottom line

An unusually clean, small, well-sensored change. The production delta is 11 lines
in one file, every one of them is guarded by a test that I proved RED by
mutation, and the two behavioural claims (ADV-A2, ADV-B) hold up under probes 6×
deeper than the shipped tests. Main's stale-notice bug is real and I reproduced
it side-by-side (1 ready notice vs 6 across six recovery cycles). No test was
lost and no assertion weakened.

The one thing I would not let pass unremarked is **ADV-C**: it is presented as a
tightening, and it is really a trade — genuinely broader where it counts, but
strictly narrower on two shapes `main` caught, with a new latent false-positive
class, and the residual comment discloses neither. Zero real-source sites
regress today, so it does not block; it needs a sentence of honesty in the
comment.

**APPROVE.**
