# Item 18 review — E6 watchdog-doc ratchet (COLD, SKILL-TEXT)

> **TERMINAL REPORT.** This pass is CLOSED. No mutations were left on disk; every
> scaffold built for this review has been torn down and verified gone. I ran no
> repo mutation other than creating this file.

**Reviewer**: `pij-wilful-morton` (cold) · **Dispatcher**: `pij-falling-outside`
**Candidate**: `df5b256e7dbcbfd206a9e18f7db98f9527d5e271` (PR #20, branch `s392-pr18`)
**Base**: `447526e83ff89d02fc009b9388874c89bbdfd654` (`origin/main`)
**Packet**: `reviews/item-18-review-packet.md`
**Date**: 2026-08-28

---

## VERDICT: ✅ APPROVE — merge PR #20

The E6 ratchet is real and load-bearing. I proved by three on-disk mutations that
`docs/how/pij-watchdog.md` is now pinned to `buildWatchdogTurn`'s **output** and to
`mutesWatchdogNudge`'s **actual split** — not to a literal the doc supplies itself.
All four Dim-1 semantic claims in the packet check out, with one correction of
emphasis (INFO-7) and one boundary I found by probing rather than reading (ADV-1).

Two non-blocking advisories: **ADV-1** (the ratchet pins *presence anywhere in the
file*, not *the example block is correct* — proven GREEN with the example gutted)
and **ADV-2** (the new `state.ts:142` citation is an unpinned line number, which is
the same drift class this PR exists to close). Neither blocks the merge; both are
strictly smaller than the defect being fixed.

**I could not reproduce the packet's "count 120, not 116" figures** — see §5. I
proved the underlying claim (no dispatch-test collateral) by a stronger method
instead, so this is a reporting-metric discrepancy, not a defect.

---

## 1. Scaffolding, and the limits of this pass — stated before findings

**What I built** (all torn down, §8):

- Throwaway worktree `/tmp/pij-i18`, **detached** at `df5b256e`
  (`git worktree add --detach`). I created no branch; the pre-existing local
  `s392-pr18` was never touched.
- `node_modules` **symlinked** to `~/GitHub/pij/node_modules`.
- Three mutation scripts + one probe script under `/tmp/` (written via file
  create, never as shell strings — this repo's guard trips on backticks).

**Limits — things I did NOT do, so an unexamined item does not read as a clean one:**

- **`node_modules` is a symlink to the main checkout, not a clean `npm ci`.** Every
  vitest result here inherits that tree's dependency state.
- **No live daemon, no `just smoke`, no tmux exercise.** This host is shared and
  concurrently mutated; I do not drive live panes.
- **Not run**: `harness checks`, `just self-check`, `pkg audit`, `snapshots-check`,
  local-path portability, the full repo test suite, repo-wide `biome`. I ran the
  targeted sensors this change can actually move (§7).
- **`cli.inbox.integration.test.ts` was run once (12 passed) only to chase the
  packet's count arithmetic** — I did not review it.
- **MUT-CLAUSES scope caveat**: it mutates `core/watchdog.ts`, which many suites
  import. I ran it against `cli.integration.test.ts` only, so I can state the RED
  is single and in-file there; I did **not** measure its blast radius across the
  whole repo. That is a deliberate scoping choice, not a clean result.
- I did not re-review items 9-FX / 10b / 12 / 14 / 17. This is item 18 only.

**Pristine sha256 of the four in-fence files @ `df5b256e`** (all four restored and
re-verified byte-identical at teardown):

| file | sha256 |
|---|---|
| `.pi/extensions/pij/cli.integration.test.ts` | `5824146dbe76fc122842eac8bf39973b849b083fd39690bc8edcf3706cfef7e4` |
| `docs/how/pij-watchdog.md` | `43ca3c45f5c78ca7e84afdd8a7c27e20a5fa6871ac36d5ba150b07378d743302` |
| `skills/pij/references/00-routing.md` | `c79dde0a6a409cdb861c783d7c85835f49b35fb3f5b356689993a5982613123c` |
| `skills/pij/references/prime/orient-oprime.md` | `6d9767e1ab4c9f11feb907367a5f4635b0b1f1a47ccdd7ab219981d9364aa357` |

Also mutated and restored: `.pi/extensions/pij/core/watchdog.ts`
pristine `19b8ffbbb77a4cd296a6dd945d32cc53b13a9912d3d8f555ee0ea7ec865447ff`.

**Baseline (pristine candidate)**: `npx vitest run cli.integration.test.ts` →
**exit 0, 106 passed | 1 skipped (107)**.

---

## 2. Dim-0 — mutation ledger (all three run BY ME, on disk, sha-verified)

Every run below is the **full** `cli.integration.test.ts` file, so the "no
collateral" column is measured, not assumed. Restore was verified by sha **and**
by an empty `git status --porcelain` before the next mutation.

### MUT-E6 — revert the example to omit the `ready` clause

Reverted the watchdog-turn example to its exact pre-PR text (`If done, run
\`pij report state done\`.`).

| | value |
|---|---|
| file | `docs/how/pij-watchdog.md` |
| pristine sha | `43ca3c45…613123c`… → `43ca3c45f5c78ca7e84afdd8a7c27e20a5fa6871ac36d5ba150b07378d743302` |
| mutated sha | `0403aed226be5f12fc77bef1003a02c36a47326b38770d1adaefce330b25da5d` |
| anchor | unique (occurrences asserted `== 1`, script aborts otherwise) |
| **RED** | **exit 1**, `.pi/extensions/pij/cli.integration.test.ts:367:67` |
| assertion | `expected '# pij watchdog supervision Every live…' to contain 'If this unit of work is finished, run…'` |
| scope | **1 failed \| 105 passed \| 1 skipped (107)** — single failure |
| restore | sha match, `git status` empty |
| GREEN | exit 0, 106 passed \| 1 skipped (107) |

**RED line needs no remapping**: the mutation edited `pij-watchdog.md` while the
failure is in the *untouched* `cli.integration.test.ts`, so `:367` is already
pristine numbering. Pristine `:367` is:

```ts
for (const clause of emittedClauses) expect(normalizedWatchdog).toContain(clause);
```

**This is THE proof the packet asked for.** The doc can no longer omit the `ready`
clause and stay green.

### MUT-MUTE — drop `hold` from the doc's mute-set line

| | value |
|---|---|
| mutated sha | `0a412aae998d42d83410d267617699971b0369f24c778e575f38a87fa1e33242` |
| **RED** | **exit 1**, `cli.integration.test.ts:369:30` (pristine numbering) |
| assertion | `expected … to contain 'The mute set is \`blocked\|question\|hol…'` |
| scope | **1 failed \| 105 passed \| 1 skipped (107)** |
| restore + GREEN | sha match, `git status` empty, exit 0 |

Pristine `:368-370` is the derived assertion:

```ts
const muteStates = SEMANTIC_STATES.filter((state) => mutesWatchdogNudge(state));
expect(normalizedWatchdog).toContain(
  `The mute set is \`${muteStates.join("|")}\`; \`done\` and \`ready\` never mute.`,
);
```

The *expected* value in the failure message is the **function-derived** string, not
a literal in the test — confirming the mute set is pinned to `mutesWatchdogNudge`.

### MUT-CLAUSES — I ran it rather than reasoning about it

The packet said "don't; just confirm the clause-count assertion *would* catch
emitter drift." A reasoned answer and an executed one are not the same evidence, so
I executed it: appended a third sentence to `buildWatchdogTurn`'s `close`.

| | value |
|---|---|
| file | `.pi/extensions/pij/core/watchdog.ts` |
| pristine sha | `19b8ffbbb77a4cd296a6dd945d32cc53b13a9912d3d8f555ee0ea7ec865447ff` |
| mutated sha | `78adcda27c31f473a2a016b5b42b13e49ba604203543ce0c8f8298944531777c` |
| **RED** | **exit 1**, `cli.integration.test.ts:365:26` (pristine) |
| assertion | `expected [ …(3) ] to have a length of 2 but got 3` |
| scope | 1 failed \| 105 passed \| 1 skipped (107) **within this file** (see §1 caveat) |
| restore + verify | sha match, `git status` empty |

Pristine `:365` is `expect(emittedClauses).toHaveLength(2);`. **Emitter drift is
genuinely caught** — this is now proven, not inferred.

**Ordering note**: MUT-E6 and MUT-CLAUSES fail at *different* lines (367 vs 365),
so the two assertions are independently load-bearing; neither is masking the other.

---

## 3. No collateral — four independent proofs

1. **The branch is genuinely fresh from main.**
   `git merge-base origin/main df5b256e` = `447526e8…` = `origin/main` **exactly**,
   and `git log origin/main..df5b256e` is a **single** commit. There is no rebase
   window and no drifted-stream content: the PR is one commit sitting directly on
   the current main tip. This is the strongest possible shape and it removes the
   whole class of hazard I had to chase manually on PR #19.

2. **Exactly the 4 packet files, nothing else.**
   `git diff --name-status origin/main df5b256e` = 4 `M` entries, matching the
   packet 1:1. `--stat` = **+37 / −15**.

3. **Zero tests added or removed — proven by list, not by count.**
   `diff` of the extracted `it(`/`test(` declaration lines between
   `origin/main:cli.integration.test.ts` and `df5b256e:cli.integration.test.ts`
   returns **IDENTICAL** (100 declarations both sides). The PR modifies the *body*
   of one existing test and touches no other. No dispatch test can have been lost.

4. **The s391 dispatch-retirement commits are ancestors of both trees.**
   `git merge-base --is-ancestor` confirms `42fceda` (*feat(spawn): retire dispatch
   records for closed seats*) and `1fca60e` (*fix(spawn): harden dispatch
   retirement*) are **IN MAIN** and **IN PR18**. Their tests run and pass in my
   baseline (106 passed).

---

## 4. Dim-1 — the load-bearing half

### 4.1 The doc now matches the emitter in substance ✅

I read `buildWatchdogTurn` (`core/watchdog.ts:367-420`) and hand-evaluated it for
the exact config the test uses, `(id, 1, {owesCard: true, ownAltitude: false})`:

- `head` = `` [pij watchdog #1 for <id>] Keep going if working. ``
- `ask` = `` Report in one call with `pij report now "<what I just did>" "<what's next>"`. ``
  (the altitude clause is correctly suppressed by `ownAltitude: false`)
- `close` = `` If this unit of work is finished, run `pij report state done`; if you are idle but available on a standing assignment, run `pij report state ready`. ``
- `paneAvailable` is `undefined`, not `false`, so **no** pane suffix is appended —
  the test's 2-clause expectation is correct for this config.

The split `/(?<=\.)\s+/` yields exactly **2** clauses because the only `.`-followed-
by-whitespace in the stripped body is the one closing the `ask`; the `close`'s
period is string-final. Confirmed empirically by MUT-CLAUSES.

**Doc side, `docs/how/pij-watchdog.md`:**

- The recovery axis (§ *Reporting state*) now carries `ready`:
  `- idle but available on a standing assignment: \`pij report state ready\`;` ✅
- `done` is present ✅; the watchdog-turn example carries **both** emitted clauses
  verbatim ✅; the prose below it now reads "declare `done`; if a standing
  assignment is idle but available, declare `ready`" ✅.
- The new mute-set line is byte-correct: `SEMANTIC_STATES` (`core/types.ts:110-119`)
  is declared `blocked, question, hold, waiting, ready, failed, cancelled, done`;
  `mutesWatchdogNudge` (`core/watchdog.ts:332-352`) returns `true` for exactly the
  first four. `.filter(...).join("|")` ⇒ **`blocked|question|hold|waiting`**, which
  is the doc's literal, **in that order**. ✅

**Deliberate omissions I checked rather than flagged**: the axis list does *not*
offer `hold` or `waiting`. That is correct and matches the emitter's own reasoning —
`watchdog.ts` comments that "`waiting` is DELIBERATELY NOT OFFERED here: parking with
no blocker recreates the parked-but-working state, which is a permanent silencer",
and `hold` is issuer-set by definition (`state.ts:139`). The doc is consistent with
the code's intent, not merely with its output.

### 4.2 ADV-5 — `orient-oprime.md` duty 7 ✅ (issuer-`hold` retained)

Old: relay `pij report now` "*(or a parked state: `waiting|hold|blocked|question`)*"
New: relay `pij report now` "*(or `ready` if idle-available, or issuer-set `hold`
when you are parking it)*", plus "*`waiting`/`blocked`/`question` are the seat's own
first-person dependency claims; relaying them manufactures a permanent silencer.*"

- **Issuer-`hold` was NOT dropped** ✅ — it is retained *and* correctly conditioned
  ("when you are parking it"). This is exactly right: `state.ts:139` defines `hold`
  as "*deliberately parked by an issuer*", so an issuer relaying `hold` is asserting
  its **own** act, not impersonating the seat. It is the one mute state an issuer
  legitimately owns.
- **The three removed words are all genuine first-person claims** ✅ —
  `waiting` (`state.ts:142`, "dependent on something external"), `blocked`
  (`:137`, "cannot proceed"), `question` (`:138`, "waiting on an answer"). All three
  return `true` from `mutesWatchdogNudge`. The old text told an o-prime to relay
  four mute states, three of which it cannot honestly know.
- **`ready` is a safe addition** ✅ — `mutesWatchdogNudge("ready")` is `false`, so
  relaying it cannot silence anything; `state.ts:145` = "awaiting pickup".
- **The "permanent silencer" rationale is correct, and it is not invented.** The
  phrase is lifted verbatim from `watchdog.ts`'s own comment block. The mechanism
  holds: a mute suppresses the nudge, and the nudge is the *only* automatic
  mechanism that would prompt the seat to update — so the state is self-reinforcing.
  Strictly it is clearable (`pij report clear` exists, `core/cli.ts:1797`), so
  "permanent" is operational rather than literal; I judge that fair, and identical
  to the wording the code itself already uses.
- **"duty 1 one layer down" and the item-14 ADV-4 relationship are both right**:
  ADV-4 governs the seat's *self*-declaration ("never self-declare `hold`/`waiting`
  merely because you are idle"); ADV-5 governs the *issuer's relay*. Same hazard,
  different writer — which is precisely what the paragraph claims.

### 4.3 INFO-7 — `state.ts:142` ⚠️ correct, with a caveat worth stating

`00-routing.md:181` now reads "an external dependency → `blocked`/`waiting` per
`state.ts:142`".

**Verified**: `state.ts:142` is literally
`"waiting", // semantic: dependent on something external`, and a repo-wide grep
shows that comment is the **only** occurrence of "dependent on something external"
anywhere. So it genuinely is the unique textual home of the external qualifier, and
moving off the vaguer "per node doctrine" is an improvement.

**Two caveats I will not let pass silently:**

1. **The citation covers `waiting`, not `blocked`.** `blocked` is `state.ts:137`,
   glossed "cannot proceed" — which says nothing about *external*. So
   "`blocked`/`waiting` per `state.ts:142`" over-claims slightly: line 142 justifies
   half the pair. `:137,142` would be exact.
2. **Line 142 lives inside `BADGE_SEVERITY`** — a "worst-first badge" *severity
   ordering* array (`state.ts:133-149`), whose per-entry comments are one-line
   glosses, not a normative definition site. It is the best available citation, but
   it is a gloss in a display-ordering table.

Neither is worth blocking. Both feed **ADV-2** below.

### 4.4 Budgets and skill-check ✅

| file | main | PR #20 | packet | verdict |
|---|---|---|---|---|
| `skills/pij/references/00-routing.md` | 205 | **205** | 205 | flat ✅ |
| `skills/pij/references/prime/orient-oprime.md` | 193 | **193** | 193 | flat ✅ |

`00-routing` is a pure 1-line-for-1-line substitution; `orient-oprime` is −7/+7,
net zero. **No C9 or duty-7 content was lost** — I diffed the paragraphs by hand:
every clause in the old duty-7 text survives except the deliberately-narrowed relay
menu, and the "stale card is worse than no card / duty 1 one layer down" material is
intact.

`bash harness/scripts/pij-skill-check.sh` → **exit 0, "✅ pij-skill-check: all
green"**, i.e. **zero findings**. Because the candidate's finding count is zero, the
packet's "before/after zero new findings" claim holds by construction — no
main-side baseline run is needed to establish it.

---

## 5. The packet's "count 120, not 116" — I could not reproduce either number

Stating this plainly because a number I cannot reproduce must not be reported as
confirmed.

Measured on the candidate:

| metric | value |
|---|---|
| `cli.integration.test.ts` runtime tests | **107** (106 passed + 1 skipped) |
| `cli.inbox.integration.test.ts` runtime tests | **12** |
| both combined | **119** |
| `it(`/`test(` declarations in `cli.integration.test.ts` | **100** |

None of these is 120 or 116. I did find the likely origin of the drift: a loose
`grep -c 'it('` returns **130** on the candidate and **129** on main, and the +1 is a
**false positive** — the new line contains `.split(`, whose last three characters are
`it(`. So a substring count of `it(` is not a test count at all, and a difference in
it carries no information about tests.

**This does not weaken the claim the number was standing in for.** §3 proof 3 settles
it more strongly than any count could: the extracted list of test declarations is
**identical** between `origin/main` and the candidate, so the delta is exactly zero
tests, and no dispatch-retirement test can have been dropped.

**Recommendation**: retire the `it(` count as a collateral sensor and use the
declaration-list diff instead — a count can coincide, a list cannot.

---

## 6. Advisories (both non-blocking)

### ADV-1 — the ratchet pins *presence in the file*, not *the example is correct* (proven)

`expect(normalizedWatchdog).toContain(clause)` tests the **whole normalized
document**, so it constrains only that the emitted sentences appear *somewhere* in
`pij-watchdog.md`. I probed the boundary rather than assuming it: I replaced the
entire watchdog-turn example block with

```text
[pij watchdog #2 for pij-example] TOTALLY WRONG EXAMPLE, no guidance at all.
```

and re-stated the two clauses as an ordinary prose paragraph elsewhere in the file.

**Result: exit 0, GREEN (1 passed).** The named target of the ratchet — "*What a
watchdog turn means*" — can be actively wrong while the gate certifies the doc.
Note also that `startsWith(header)` pins the **emitter's** header, never the doc's,
so the example's `[pij watchdog #2 for pij-example]` line is entirely unchecked.

**Severity: low, and strictly better than what it replaced.** The old gate asserted
a literal the doc itself supplied, which let the `ready` clause be missing outright;
the new gate forces the emitter's exact sentences to exist. The residual gap is
*position*, not *content*. If you want to close it, scope the assertion to the
fenced `text` block (extract the block, then `toContain`), which also gives the
header a home.

### ADV-2 — INFO-7 introduces a new *unpinned* code citation

`00-routing.md` now hard-codes `state.ts:142`. Nothing pins it: the only occurrence
of the string `state.ts:142` in the repo is the doc line itself. A one-line
insertion above `BADGE_SEVERITY` silently makes the doc cite the wrong state, with
no red anywhere — which is the **same defect class this PR exists to close**, one
level of indirection over.

Cheapest fixes, in order of preference: cite the **symbol** (`BADGE_SEVERITY`'s
`waiting` entry) rather than the line; or add a one-line assertion to the same
ratchet test that `state.ts` line 142 still matches `/^\s*"waiting",/`. Also
consider `:137,142` per §4.3 caveat 1, so `blocked` is actually covered.

**Carried forward from earlier reviews** (raised, not actioned here, none blocking
#20): ADV-A2 (re-bind after refusal is silent — item 17), ADV-B (planned-bind has no
timeout), ADV-C (pane-resolution sweep is line-scoped), ADV-D (tracked
`reports/item-17-report.md` half of the report pair).

**Pre-existing, not introduced by this PR**: the axis bullet "*waiting on an external
dependency: `pij report blocked`*" uses the word *waiting* as prose for the
`blocked` verb, one line above a mute-set line that names `waiting` as a distinct
state. Mildly confusable; untouched by this change, so out of fence.

---

## 7. Gates reproduced first-hand

| gate | command | result |
|---|---|---|
| ratchet suite | `npx vitest run .pi/extensions/pij/cli.integration.test.ts` | **exit 0** — 106 passed \| 1 skipped (107) |
| typecheck | `npx tsc --noEmit` | **exit 0**, zero output lines |
| lint | `npx biome check .pi/extensions/pij/cli.integration.test.ts --max-diagnostics=200` | **exit 0** — "Checked 1 file… No fixes applied" |
| skill-check | `bash harness/scripts/pij-skill-check.sh` | **exit 0** — all green, **0 findings** |
| branch identity | `git rev-parse origin/s392-pr18` | `df5b256e…` — **unchanged** at teardown |

---

## 8. Teardown

- `/tmp/pij-i18` worktree + `node_modules` symlink → `git worktree remove --force`.
- All five mutated/probed files restored and **verified by sha256 AND by an empty
  `git status --porcelain`** before removal.
- `/tmp/i18-mut.py`, `/tmp/i18-mut-clauses.py`, `/tmp/i18-probe-block.py`,
  `/tmp/i18-*.txt`, `/tmp/i18-main-cli.ts`, `/tmp/i18-pr18-cli.ts` → removed.
- No branch created; the pre-existing local `s392-pr18` was never checked out.
- The only file I wrote in the repo is this review.

---

## 9. Bottom line

**APPROVE — merge PR #20.**

E6 is genuinely closed. The gate that used to certify the doc against *its own
literal* now derives its expectation from `buildWatchdogTurn`'s output and
`mutesWatchdogNudge`'s real split, and I have three sha-verified RED→restore→GREEN
cycles on disk showing it fails when the doc omits `ready` (`:367`), when the mute
set drifts (`:369`), and when the emitter itself grows a sentence (`:365`).

The branch shape is the best I have reviewed in this series — one commit, directly
on the current main tip, four files, zero test-declaration delta — so the
no-collateral question is settled by structure rather than by argument.

The two advisories are both smaller than the defect fixed and neither should hold
the merge. **ADV-1 is the one I would action next**, because it is the same shape as
E6 itself: a green gate that does not fully constrain the thing it is named after.
And **the "count 120/116" sensor should be retired** in favour of the
declaration-list diff — it is measuring `split(`, not tests.

*Report is terminal. No further pass is open on item 18 from this side.*
