# Cold review — dlg-0011 · Phase 4 item 4 (`--state working` remedy, ruled c-remedy) + carried T004b

**Reviewer**: cold cross-model (claude-opus-5 via GitHub Copilot CLI), seat `pij-mobile-reptile`
**Target**: `s391/item4-card-working` @ `91ded2aab1728ba763706927992b53518a588e13`
**Base**: `42b7268fedbd1331a95f4e4b599d2db85a392b3e` (= `git merge-base origin/main HEAD`)
**Brief**: `review-brief.md` (dlg-0011) · **Rubric**: `skills/flow-pair/references/review-rubrics.md`, Dim-0 mandatory
**Verdict**: **APPROVE** — 6 findings, highest **medium**, none blocking.

---

## §0 Scaffolding, and the limits of this pass

Stated before the findings, so that nothing I did not examine can be mistaken for something I found clean.

**How I worked.** Repo READ-ONLY except this file. Gate first (full vitest via `pij bg`), all read-only
analysis while it ran, mutations only after it returned. Every source I mutated was copied to `/tmp`
first and restored with `cp` + `cmp` + `git diff --exit-code`. Three sources were touched and restored:
`core/anomalies.ts`, `core/cli.ts`, `adapters/daemon-tmux.ts`. HEAD never moved.

**Which of my checks are exact, and which are weak.**

- **Exact.** The hard invariant (§2). I did not merely read the diff and fail to spot a change — I
  *reconstructed* both changed sources from their base blobs by applying only the declared edits, and
  compared byte-for-byte. A reconstruction that matches proves the absence of any other edit; reading a
  diff only proves I did not notice one. This is the strongest form available and it is what I relied on.
- **Exact.** `core/types.ts` and `core/orchestration/role.ts` compared by **SHA-256** against the base
  blob, not by absence-from-diff.
- **Exact.** The surviving mutant F-4: `grep` proves only one test file in the repo asserts on the
  Enter-attempt text, and I ran that entire file (39 tests) green under the mutation.
- **Weak / bounded.** My anti-vacuity `it()` arithmetic is a floor, not a count — parameterised blocks
  would undercount. It happens to be exact here because the delta is two literal `it(` lines.
- **Weak.** I judged the *wording* of the remedy (F-2, F-3) by reading it against the adjacent
  load-bearing comment. That is a judgement about instrument design, not a proof. A human who disagrees
  with my reading of that comment should overrule me.

**What I did NOT examine.** No live-daemon proof (forbidden, and the packet does not require it). I did
not run `harness checks` or `just smoke` — I ran `vitest`, `tsc` and `biome` directly. I did not review
the s392 base itself. I did not exercise the anomaly **sweep** end-to-end (§6 F-3 reasons about the
rendered length analytically plus one measured string, not from an observed operator session). I did not
test concurrency or ordering. The 464-test `core/cli.test.ts` was run whole and green, but I read only the
one test this change adds.

**A correction I made mid-pass, recorded because it nearly became a false clean.** My first attempt to
prove the status-stale predicate unchanged extracted a line range with `sed` and diffed base against HEAD.
It reported "IDENTICAL". It was **vacuous** — the range anchor I used (`status-stale (the card…`) is a
heading in the *test* file, not the source, so `sed` matched nothing and I had diffed two empty files.
`wc -l` showing `0` is what caught it. I discarded that check and replaced it with the reconstruction
proof in §2. An empty result is the one output that carries no evidence of what it searched.

**Citation hygiene.** Every line number in this file was re-checked against the frozen tree after drafting;
four had drifted (`:632→:633`, `:637→:639`, `:686→:684`, `daemon-tmux.ts :544→:547`) and were corrected
before the report was sent.

---

## §1 Freeze

| Fact | Value |
|---|---|
| `pwd` | `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core` |
| HEAD (open, mid, close) | `91ded2aab1728ba763706927992b53518a588e13` — unmoved |
| Branch | `s391/item4-card-working` |
| `git merge-base origin/main HEAD` | `42b7268f…` — matches the brief |
| Commits on branch | exactly **1** — `91ded2a feat(spawn): teach working-state remedy` |
| Tracked tree | clean at open and at close (`git diff --exit-code`) |
| Untracked | 22 orchestration paths, baselined at open; **zero delta** at close |

**One observation the brief does not mention**: `origin/main` is now `4a5cf85b`, i.e. **main has moved
past the base**. `42b7268f` is the merge-base, not main's tip, so this branch will need a rebase or merge
before it ships. That is a shipping note for the orchestrator, not a defect in the change; I reviewed it
at the frozen base the brief named.

---

## §2 The hard invariant — proven by reconstruction, not by inspection

The brief's load-bearing claim: *`SEMANTIC_STATES`, `core/orchestration/role.ts`, the status-stale
PREDICATE and the rail are byte-identical to base — only text, a fixture, T004b's test and docs changed.*

**Change set vs base**: 8 files, `126+/3−`.

```
.pi/extensions/pij/adapters/daemon-tmux.test.ts   |  2 +
.pi/extensions/pij/core/anomalies.test.ts         | 13 +
.pi/extensions/pij/core/anomalies.ts              |  6 +-
.pi/extensions/pij/core/cli.test.ts               | 11 +
.pi/extensions/pij/core/cli.ts                    |  7 +-
docs/how/pij.md                                   |  4 +
docs/plans/…/execution.log.md                     | 55 +   (new)
docs/plans/…/tasks.md                             | 31 +   (new)
```

**(a) `core/types.ts` and `core/orchestration/role.ts` — SHA-256 identical to base.** Not "absent from the
diff"; the blobs were hashed.

| File | base `42b7268f` | HEAD `91ded2a` |
|---|---|---|
| `core/types.ts` | `1a876553af43c898…74f3ed6` | `1a876553af43c898…74f3ed6` |
| `core/orchestration/role.ts` | `618693d945ee3fe0…22e53eed` | `618693d945ee3fe0…22e53eed` |

So `SEMANTIC_STATES` (`core/types.ts:110-119`) is untouched, and remains the ruled eight words with
**no `working`** among them. `cardCanMislead` / `owesStatusCard` (`role.ts:83`, `:125`) are untouched.

**(b) The predicate and the rail — proven by exact reconstruction.** For each of the two changed sources I
took the base blob, applied *only* the edits the coder declares, and compared to HEAD:

```
anomalies.ts  reconstruct-from-base == HEAD : True
cli.ts        reconstruct-from-base == HEAD : True
```

- `anomalies.ts` = base **+** the `STATUS_WORKING_REMEDY` const block (`:45-46`) **+** the detail append
  (`:687-688`). Nothing else. Therefore **every** predicate in the status-stale loop — the scope gate
  (`:633`), the no-telemetry guard (`:639`), the freshness predicate (`:643`), the parked exemption
  (`:647`), the anchor/drift computation (`:661-663`) — is byte-identical to base *by construction*.
- `cli.ts` = base **+** the import (`:11`) **+** the `err()` rewrite (`:1652-1656`). Nothing else.
  Therefore the rail/render path (e.g. the anomalies row at `:5930`) is byte-identical *by construction*.

This is the claim the brief most wanted proven, and it is proven in the strongest available form.

*Note on the brief's own line numbers*: it cites the freshness predicate at `:640` and the detail at
`:676-683`. On the frozen tree these are `:643` and `:667-688` — a uniform **+3** shift caused by the
three lines the const block adds above them. The brief is citing pre-change numbering. Harmless, but I
mutated `:643`, which is the line the brief means.

---

## §3 The brief's four aims

**Aim 1 — predicates untouched.** ✅ §2. Exact.

**Aim 2 — `report now … --state working` still `E-ARG`, message names the mechanical axis, the literal
command and the parked states; one exported constant at both sites.** ✅ — and I verified it by
*executing* `parseArgs`, not by reading the template:

```
pij report now did next --state working
  ok=false  code=E-ARG
  MSG: invalid semantic state 'working' (blocked|question|hold|waiting|ready|failed|cancelled|done)
       — working is the mechanical, daemon-owned axis; refresh the card with:
         pij report now "<did>" "<next>". If the seat is parked, declare
         --state waiting|hold|blocked|question.
```

Every required token present: `working`, `mechanical`, `daemon-owned`, the literal
`pij report now "<did>" "<next>"`, and `waiting|hold|blocked|question`. Still `E-ARG`; `working` is **not**
accepted. One constant (`anomalies.ts:45`) consumed at both sites (`cli.ts:1655`, `anomalies.ts:688`) —
the two strings cannot drift apart, which was the point. **See F-1: a third site exists that did not get it.**

I also confirmed the remedy is *targeted*, not blanket — an unrelated bad state stays terse:

```
pij report now did next --state bogus
  MSG: invalid semantic state 'bogus' (blocked|question|…|done)      ← no remedy. Correct.
```

**Aim 3 — the detector-non-deletion fixture.** ✅ (`anomalies.test.ts:916`). Mutating the freshness
predicate takes it RED (M3, §4).

An observation the brief does not make, which matters for reading this test correctly: **the status-stale
detector never consults `systemState`.** The only `systemState` reference in `anomalies.ts` is `:834`, a
different detector. So `systemState: "working"` in the fixture is *inert against today's code* — the test
would pass identically without it. That is not a criticism: it is precisely what makes the fixture a
**tripwire**. Its value is entirely contingent on dying when someone *adds* the exemption that ruling R-4
rejected — which the brief does not ask anyone to check. I checked it (M4). It works, and it is the only
thing in the repo that does.

**Aim 4 — T004b, positive pointer-line content.** ✅ for the glyph and the increment (M1, M2 both RED).
**Partially** for "honest attempt count" — see **F-4**, a surviving mutant.

---

## §4 Dim-0 — six mutations (3 briefed, 3 mine): five RED, one SURVIVING

**Anti-mis-selection discipline.** A `-t` selector that matches nothing passes vacuously, so every
selector was first run **unmutated** and proved to match exactly one passing test:

```
anomalies.test.ts   (83 tests | 82 skipped)  → 1
daemon-tmux.test.ts (39 tests | 38 skipped)  → 1
cli.test.ts        (464 tests | 463 skipped) → 1
Tests  3 passed | 583 skipped (586)
```

So each RED below is a **kill**, not a mis-selection.

| ID | Source | Mutation | Killer | Result |
|---|---|---|---|---|
| **M1** *(brief)* | `daemon-tmux.ts:531` | delete `enterAttempts += 1;` | `daemon-tmux.test.ts:476` | **RED** — `expected 'ℹ️  claude pointer typed into pane %4…' to contain 'after 3 Enter attempt(s)'` |
| **M2** *(brief)* | `daemon-tmux.ts:558` | drop the `ℹ️` glyph | same | **RED** — `expected 'claude pointer typed into pane %42 (p…' to contain 'ℹ️'` |
| **M3** *(brief)* | `anomalies.ts:643` | freshness predicate `>` → `<=` | `anomalies.test.ts:916` | **RED** — `expected [] to deeply equal [ 'pij-mechanical-working' ]` |
| **M4** *(mine)* | `anomalies.ts:647+` | **add** `if (descriptor.systemState === "working") continue;` — the deletion R-4 rejected | `anomalies.test.ts:916` | **RED** — `1 failed | 82 passed (83)` |
| **M5a** *(mine)* | `cli.ts:1652-1656` | revert the remedy, restore the bare message | `cli.test.ts:4656` | **RED** — `expected 'invalid semantic state \'working\' (b…' to contain 'mechanical'` |
| **M5b** *(mine)* | `anomalies.ts:688` | drop `+ STATUS_WORKING_REMEDY` from the detail | `anomalies.test.ts:916` | **RED** — `…to contain 'working is the mechanical, daemon-own…'` |
| **M6** *(mine)* | `daemon-tmux.ts:558` | `${enterAttempts}` → `${SUBMIT_ATTEMPTS}` | — | **SURVIVES** — `Tests 39 passed (39)` → **F-4** |

**M3 reproduces the coder's execution-log claim exactly** ("expected `pij-mechanical-working`, received no
status-stale row"). The log is honest.

**M4 is the mutation this item actually turns on, and it is the one the brief does not name.** The whole
purpose of T002 is a *detector-non-deletion guard*: R-4 rejected the "exempt working seats from
status-stale" fix, and the fixture is supposed to make that deletion impossible to land silently. M3
proves the fixture is coupled to the detector; only M4 proves it guards **the specific deletion**. Result:
**exactly 1 of 83 tests dies, and it is the new one.** Read the other way — before this commit, adding
`if (descriptor.systemState === "working") continue;` would have passed the entire anomalies suite in
silence. This fixture is the sole thing standing in its way. That is a well-aimed test.

**M5a/M5b** prove both remedy sites are pinned, so the "single constant, both sites" property cannot rot
unnoticed.

**Restoration verified two ways** — `cmp` against the `/tmp` originals for all three sources, and
`git diff --exit-code` clean on the whole tracked tree. HEAD still `91ded2a`.

---

## §5 Gates

| Gate | Result |
|---|---|
| Full `npx vitest run .pi/extensions/pij/` (via `pij bg`, before mutations) | **171 passed / 2 skipped (173) files · 3976 passed / 15 skipped (3991) · `VITEST_EXIT=0`** |
| Fast set, re-run **after** restore (3 touched test files) | **586 passed (586)** |
| `npx tsc --noEmit -p .` | **0 errors** |
| `npx biome check` (5 changed `.ts`) | **clean** — "Checked 5 files… No fixes applied" |

The gate figure matches the coder's execution log to the test (`3,976 passed, 15 skipped`).

**Anti-vacuity.** A green suite proves nothing if the change added no assertions. Net `it()`/`test()` vs
base, per file: `anomalies.test.ts` **+1/−0**, `cli.test.ts` **+1/−0**, `daemon-tmux.test.ts` **+0/−0**.
The `−0` is exact and is the load-bearing half: nothing was deleted or weakened. T004b adds two
assertions inside the pre-existing test at `:476` rather than a new block — legitimate (it pins positive
content of a line that test already exercises), but it means the change is **+2 tests and +2 assertions**,
not +3 tests.

---

## §6 Findings

None blocking. Ordered by how much I would want them fixed.

### F-1 · medium · The remedy is missing from the sibling rejection site the system itself recommends

There are **two** `--state` validation sites in `core/cli.ts`. Only one got the remedy.

| Site | Verb | Message |
|---|---|---|
| `:1652-1656` | `pij report now … --state working` | remedy ✅ |
| **`:1721`** | **`pij report state working`** | **bare — no remedy** ❌ |

Observed, not inferred:

```
pij report state working
  ok=false  code=E-ARG
  MSG: invalid semantic state 'working' (blocked|question|hold|waiting|ready|failed|cancelled|done)
```

This matters more than "one path missed", for three converging reasons:

1. **The retired-verb message routes users straight into it.** `pij state set <id> working` answers:
   *"'pij state set' was retired — the setter is now first-person: **pij report state working**."* The
   system tells the user to type the exact command that gives them no help.
2. **The anomaly detail this change edits teaches that same verb.** The pre-existing text at `:684` says
   *"it should declare a parked state: `pij report state waiting|hold|blocked|question`"*. A seat that
   reads the new detail learns the `report state` spelling — and `report state` is the unremedied one.
3. **The historical record shows this is the path the confusion actually came through.**
   `docs/plans/074-pij-rail-v2/contract-review-001.md:383-387` records the original self-observed
   instance: *"I tried `pij state set pij-unwilling-butterfly working` and got `E-ARG: invalid semantic
   state 'working' …`. There is no word for 'actively working'."* That is the setter path, not
   `report now --state`.

**This is not a brief violation and I am not treating it as one.** Ruling R-4 names a single site
(`core/cli.ts:1646`) and the coder implemented exactly that. It is a gap between the remedy's *stated
purpose* (teach the seat the right move when it reaches for `working`) and its *reach*.

**Fix**: one line — apply the same conditional at `:1721`. The constant already exists and is already
imported. Cheap enough that I would take it now rather than carry it.

### F-2 · medium · The appended remedy inverts an ordering the adjacent comment calls load-bearing

`anomalies.ts:671-679` is unusually emphatic about the order of the two remedies in this detail:

> *"ORDERED BY SITUATION, not by preference, and the ordering is load-bearing… Offering both as equals
> (and the ineffective one first) taught a correctly-parked seat to snooze an alarm indefinitely, which is
> how a fleet learns to discount an instrument. Declaring a parked state changes the CONDITION, so it is
> the only one of the two that ends the row."*

The existing text therefore puts **park first, refresh second**. `STATUS_WORKING_REMEDY`, appended
immediately after it at `:688`, puts them back the other way:

> *"…refresh the card with: `pij report now "<did>" "<next>"`. **If the seat is parked**, declare
> `--state waiting|hold|blocked|question`."*

So the **last thing** a stale seat reads is refresh-first — the ordering the comment says taught seats to
snooze. And because the append is **unconditional**, every status-stale row gets it, including the many
seats that never went near `working` and for whom the paragraph answers a question they did not ask.

I am not claiming a functional break; the row still fires and the parked exemption still works. I am
claiming the change slightly degrades the instrument in the one place its own comment warns about.

**Options**: (a) append only when `descriptor.systemState === "working"` — cheap, targeted, and would make
the fixture's `systemState` field load-bearing against real behaviour rather than only as a tripwire;
(b) reword the constant park-first so both halves agree; (c) accept it deliberately and say so in the
comment, so the next reader does not "fix" the ordering back.

### F-3 · low · The single-constant requirement produces one string that fits one site better than the other

Consequence of the same append. The detail now states the same two remedies twice in succession, in two
spellings:

- pre-existing: `pij report state waiting|hold|blocked|question` — a runnable command
- appended: `--state waiting|hold|blocked|question` — a bare flag with no verb

In the **CLI** context the bare flag is exactly right (the user just typed `--state working`). In the
**anomaly-detail** context it is less actionable than the line it duplicates. Measured effect on the
detail: **608 → 780 characters (+28 %)** on every status-stale row, which is rendered inline per row at
`cli.ts:5930` and shipped as a parent alert body (~851 chars) by `daemon/anomaly-sweep.ts:133`.

I checked whether this could truncate the ordering-critical text and **it cannot** — there is no `slice`,
`substring` or length cap on `.detail` anywhere in the extension, and no message-body cap in `pij send`.
So this is readability, not loss. Worth an explicit accept rather than a silent one.

### F-4 · low · T004b pins that the number is `3`, not that the count is honest — surviving mutant

T004b's stated purpose is *"the honest Enter-attempt count"*. The honesty is real in the source: the ℹ️
line prints the loop variable `${enterAttempts}` (`:558`) while the ⚠️ line prints the constant
`${SUBMIT_ATTEMPTS}` (`:559`) — the info line is deliberately the more truthful of the two.

The test does not pin that property. **M6** replaces `${enterAttempts}` with `${SUBMIT_ATTEMPTS}` and
**all 39 tests in the file stay green.** `grep` confirms `daemon-tmux.test.ts` is the only file in the
repo asserting on Enter-attempt text (`:466`, `:494`), so nothing else catches it either.

The cause is coverage shape: the only pointer scenario exercised is the **exhausted** one, where the
honest count and the constant coincide at 3. The case where honesty is observable is the **early break** —
`:547`, `if (!composerHasTextTail(lastPane, text) || composerIsEmpty(lastPane)) break;` — which reaches
the same log line with `enterAttempts` of 1 or 2. A pointer scenario that breaks after one Enter and
asserts `after 1 Enter attempt(s)` would close it and would be a handful of lines in the existing
`describe`.

M1 (drop the increment) does go RED, so the increment is load-bearing and the test is not worthless. But
"the count appears and is 3" and "the count is honest" are different claims, and only the first is pinned.

### F-5 · info · The doc says which spelling is rejected, not that both are

`docs/how/pij.md:202-205` says *"`pij report now "<did>" "<next>" --state working` is rejected"*. True, and
well written. It is silent on `pij report state working`, which is equally rejected — a reader could
reasonably infer the other spelling is the way in. Fold into F-1's fix.

### F-6 · info · `core/cli.ts` now imports a user-facing CLI error string from `core/anomalies.js`

`cli.ts:11`. The constant's natural home is beside `SEMANTIC_STATES` in `core/types.ts` — but `types.ts`
is OFF LIMITS by ruling, so `anomalies.ts` is a forced and reasonable choice. Recording it as an accepted
consequence of the ruling, not a defect, so it is not later mistaken for drift.

---

## §7 What I liked

- **The reconstruction held.** Both changed sources are exactly base plus the two declared edits. A change
  that claims "I touched only text" and survives a byte-level reconstruction is a change I can approve on
  evidence rather than trust.
- **M4 is the payoff.** The fixture is the *only* thing in 83 anomaly tests that dies when someone adds the
  working-exemption. That is a test aimed at a specific future mistake — the one a human ruling already
  rejected once — rather than at today's behaviour. Encoding a ruling as a tripwire is the right instinct.
- **The single exported constant genuinely buys something**, and M5a/M5b prove it: the two messages cannot
  silently drift apart, and both sites are individually pinned.
- **The execution log is honest.** Its mutation claim (`expected pij-mechanical-working, received no
  status-stale row`) reproduced verbatim, and its gate figure matched to the test. It also volunteers the
  pre-existing red baseline in `harness checks --quick` rather than hiding it.
- **The remedy is targeted, not blanket** — `--state bogus` still gets the terse message. A remedy that
  fires for every wrong word teaches nothing.

---

## §8 Verdict

**APPROVE** — `91ded2aab1728ba763706927992b53518a588e13`.

The hard invariant the brief cared about is proven exactly, not inspected: `SEMANTIC_STATES` and `role.ts`
are SHA-identical to base, and both changed sources reconstruct byte-for-byte from base plus only the
declared edits, which puts every status-stale predicate and the whole rail beyond reach by construction.
All three briefed mutations are RED; three more of mine are RED, including the one that certifies the new
fixture actually guards the deletion ruling R-4 rejected. Gates are green and the added assertions are
real (+2/−0).

Six findings, highest **medium**, none blocking. **F-1** is the one I would fix before ship — the remedy
misses `pij report state working`, which is the spelling the retired-verb message and the anomaly detail
both point users at, and the spelling the historical record shows the confusion actually arrived through.
It is one line. **F-2** is a judgement call about instrument wording that a human should rule on.

One shipping note that is not a finding: the branch sits on `42b7268f` while `origin/main` has advanced to
`4a5cf85b`.

---

**TERMINAL REPORT — dlg-0011 review-01.** This pass is CLOSED. No mutations were run after this file was
written; all three mutated sources were restored and verified byte-identical (`cmp` + `git diff
--exit-code`) before drafting. HEAD unmoved at `91ded2a`. No open pass remains for this delegation.

Evidence retained: gate log `~/.pij/pij-mobile-reptile/bg-mtbnjw3y-z2x4w8.log`; freeze baselines
`/tmp/d11-baseline-status.txt`, `/tmp/d11-status-close.txt`; source originals `/tmp/d11-anomalies.ts.orig`,
`/tmp/d11-cli.ts.orig`, `/tmp/d11-daemon-tmux.ts.orig`; base blobs `/tmp/d11-anom-base.ts`,
`/tmp/d11-cli-base.ts`; CLI probes `/tmp/d11-probe.mts`, `/tmp/d11-probe2.mts`, `/tmp/d11-len.mts`.

---

# Re-review FX-01

**Verdict: APPROVE** · frozen commit `2a3942c4c633fdce67b93c83d095f1a736fe3faf` · branch
`s391/item4-card-working` · one commit (`2a3942c fix(spawn): complete working-state remedy`) on top of the
previously reviewed `91ded2a` · base `42b7268f`. Scoped to the five confirmations the dispatch named.

## §0 Scaffolding, and the limits of this pass

**This was a scoped re-review, not a fresh review.** I confirmed only the five items the dispatch listed
plus the mutation it mandated. I did not re-derive the original ruling, re-review `91ded2a`'s content
(already approved in review-01 above), or review the s392 base.

Read-only throughout except this file. Six mutations were applied and reverted; all three touched sources
were restored and verified **three ways** — `cmp` against a pre-mutation copy, `git diff --exit-code`, and
`git hash-object` vs `git rev-parse HEAD:<path>` (all MATCH).

**Which of my checks are exact, and which are weak:**

| Check | Strength |
|---|---|
| `types.ts` / `role.ts` / **production `daemon-tmux.ts`** unchanged vs base | **Exact** — git blob SHA equality, base vs HEAD |
| `anomalies.ts` predicates + rail unchanged vs base | **Exact** — byte-exact reconstruction from the base blob |
| `cli.ts` rail unchanged vs base | **Exact** — byte-exact reconstruction from the base blob |
| Only two `--state` rejection sites exist | **Exact** — exhaustive grep of `isSemanticState` and of the message template, non-test files |
| Both spellings carry the remedy | **Exact** — executed `parseArgs`, real strings compared |
| Park-first ordering | **Exact** — measured indices in the emitted string |
| F-4 closed | **Exact** — the mutation that survived last pass now kills |
| Detail-length safety | **Weak-ish** — analytic (no truncation path exists) plus one measured string; no live operator session |
| G-2/G-5 wording judgements | **Design opinion, not proof** — explicitly overrulable |

**Not done:** no live-daemon proof; no `harness checks` / `just smoke` (ran `vitest`, `tsc`, `biome`
directly); no concurrency or ordering testing; I read only the tests this commit adds or edits, not the
whole of `cli.test.ts`.

## §1 Freeze and scope

HEAD `2a3942c`, exactly **1** commit above `91ded2a`, `git merge-base origin/main HEAD` = `42b7268f` as
briefed, tracked tree clean, **24** untracked orchestration paths baselined at open
(`/tmp/d11fx-baseline-status.txt`); the delta at close is exactly one path — this file.

**Scope is tighter than asked.** The dispatch asked that the diff vs `91ded2a` be a subset of the packet's
six files. It is — and, more strongly, the diff **vs base `42b7268f`** is also exactly those six files, so
the entire two-commit branch touches nothing else:

```
M .pi/extensions/pij/adapters/daemon-tmux.test.ts   M .pi/extensions/pij/core/cli.test.ts
M .pi/extensions/pij/core/anomalies.test.ts         M .pi/extensions/pij/core/cli.ts
M .pi/extensions/pij/core/anomalies.ts              M docs/how/pij.md
```

Production `adapters/daemon-tmux.ts` is **absent** from the change set: F-4 was closed test-only, exactly as
the packet specified. 6 files, 54+/10−.

## §2 The invariant (item 5) — proven, not inspected

Blob SHA, base `42b7268f` vs HEAD — equality of the git blob is byte-identity:

| File | base | head | |
|---|---|---|---|
| `core/types.ts` | `207b019ab46b` | `207b019ab46b` | **IDENTICAL** |
| `core/orchestration/role.ts` | `b2034fc02343` | `b2034fc02343` | **IDENTICAL** |
| `adapters/daemon-tmux.ts` | `48feadceff07` | `48feadceff07` | **IDENTICAL** |

For the two files that *did* change, I rebuilt each from its base blob applying **only** the declared edits
and compared byte-for-byte. Both returned `True` (`anomalies.ts` 45645→45764 bytes; `cli.ts`
248745→247424). A reconstruction proves the **absence** of any other edit; reading a diff only proves you
did not notice one. This puts every status-stale predicate and the whole CLI rail beyond reach *by
construction*.

One detail worth recording: in `cli.ts` the base string being replaced occurred **exactly twice**, a single
`.replace()` hit both, and the result was byte-exact — which independently proves the two rejection sites
are identical templates rather than merely similar.

## §3 The five confirmations

**(1) F-1 closed — and closed *completely*, which is more than was asked.** I did not take the packet's
word that there were two sites; I enumerated every one. Across all non-test files there are exactly two
`isSemanticState` rejection sites — `cli.ts:1652` (`report now --state`) and `cli.ts:1720` (`report
state`) — and exactly two emitters of `invalid semantic state`, at `:1655` and `:1723`, now
character-identical. There is no third spelling. (`anomalies.ts:279` also calls `isSemanticState`, but as a
spine-word *parser*, not a rejection site — nothing to remedy, and unreachable from CLI input that the
rail already rejects.)

Executed via `parseArgs` (pure function, zero side effects — safer than invoking the worktree bin):

| argv | result |
|---|---|
| `report now did next --state working` | E-ARG, **314** chars, carries remedy |
| `report state working` | E-ARG, **314** chars, **byte-identical message** |
| `report now did next --state bogus` | E-ARG, 90 chars, terse — **remedy correctly withheld** |
| `report state bogus` | E-ARG, 90 chars, terse |
| `report state waiting` / `report now … --state waiting` | `ok` — no regression |

**(2) F-2/F-3 closed.** The constant is park-first with runnable verb forms: `parkIdx=111 < refreshIdx=187`
in a 219-char string (was 171). It is used at both CLI sites, and the anomaly append at `anomalies.ts:688`
is **unconditional** — verified by executing the detector against a descriptor with no `systemState`,
which still carries the remedy (see §5 G-1 for the caveat).

**(3) F-4 closed — see §4 M6.** **(4) F-5 closed:** `docs/how/pij.md:202-206` now names both rejected
spellings and states the remedy park-first. **(5) covered in §2.**

## §4 Dim-0 — six mutations

Every `-t` selector was baselined first: each matched **exactly 1 passing test of 588**, so every RED below
is a kill, not a mis-selection. (Fast set 586 → 588, consistent with +2 tests.)

| ID | Site | Mutation | Result |
|---|---|---|---|
| **M6** *(mandated)* | `daemon-tmux.ts:558` | `${enterAttempts}` → `${SUBMIT_ATTEMPTS}` | **RED — 1 of 40** |
| M7 | `cli.ts:1720-1723` | revert `report state` site to the bare message | RED — 1 of 465 |
| M8 | `anomalies.ts:45-46` | invert constant to refresh-first (same clauses, order swapped) | RED — **3 of 548** |
| **M9** *(mine)* | `anomalies.ts:688` | make the append **conditional** on `systemState === "working"` | **SURVIVES — 548/548** |
| **M10** *(mine)* | `cli.ts:1655,1723` | make the CLI remedy **unconditional** | **SURVIVES — 465/465** |
| — | — | restore + re-verify | `cmp` + `git diff` + blob SHA all clean |

**M6 is the decisive one.** It is the *same* mutation, on the same line, that **survived 39/39 green** in
review-01 and was the entire basis of F-4. It now dies with
`AssertionError: expected 'ℹ️ claude pointer typed into pane %4…' to contain 'after 1 Enter attempt(s)'`.
The new scenario (`daemon-tmux.test.ts:503`) reaches the pointer info line via the early break with a
single Enter and also pins `indexesOf(tmux.calls, enterArgv())` to length 1, so it fixes the count from
both ends. F-4 is closed by evidence, not by assertion.

**M8's three kills** land in both files with the authors' own message — *"the refresh remedy is offered
before the parked-state remedy: expected 162 to be less than 94"* — so the park-first ordering is
genuinely defended at all three sites, not merely present.

**Anti-vacuity.** Net `it()` vs `91ded2a`: `cli.test.ts` **+1**, `daemon-tmux.test.ts` **+1**,
`anomalies.test.ts` **+0** (assertions added to an existing test) = **+2 / −0**, zero `it.skip` added. The
gate moved 3976 → **3978** passed with skips unchanged at 15 — the arithmetic closes exactly, so nothing
was deleted or quietly skipped. The `cli.test.ts` refactor into `expectWorkingRemedy` is **strictly
stronger** than what it replaced: it keeps every prior assertion and adds the ordering check, then applies
the whole set to both spellings.

## §5 Findings — all low/info; none blocks

**G-1 (low) — a ruled property with no test defending it.** The orchestrator ruled explicitly that the
append stays unconditional. Nothing pins that. **M9 survives 548/548** while genuinely changing behaviour:
under it, a status-stale seat with no `systemState` loses the remedy entirely (detail 800 → 581 chars,
`carriesRemedy=false`), while at HEAD both seats carry it (800/800). The mirror holds too — **M10 survives
465/465**, so the CLI remedy's *targeting* is equally undefended and could silently become a 314-char
lecture on every `--state` typo. Current behaviour is correct at all three sites (I executed it); what is
missing is anything that keeps it correct. This is the same shape as the original F-4 — a stated property
with no mutation-resistant test — at a different site. Cheapest close: assert a non-`working` status-stale
seat still contains the remedy, and that `report state bogus` does **not**.

**G-2 (low) — the ruled append now duplicates the detail body.** With the constant reworded park-first, the
828-char detail states the same advice twice in succession: `pij report state waiting|hold|blocked|question`
appears **×2**, `pij report now` **×2**, `Otherwise` **×2**. The body says *"it should declare a parked
state: pij report state … Otherwise it should update its card: pij report now …"*, then the append says
*"If the seat is parked, declare it: pij report state … Otherwise refresh the card: pij report now …"*.
The only clause the append adds that the body lacks is *"working is the mechanical, daemon-owned axis and
is never a declared state"*. I record this as a **consequence of the ruling, not a coder error**: once the
constant is park-first *and* appended unconditionally, it is necessarily a paraphrase of a body that was
already park-first. The ruling traded concision for a single shared string, deliberately. Worth an explicit
accept, or a follow-up that appends only the novel clause at the anomaly site.

**G-3 (info) — detail growth, re-checked.** 608 (base) → 780 (`91ded2a`) → **828** (`2a3942c`): **+36%**
vs base. I re-verified there is no truncation path — no `slice`/`substring`/length cap on `.detail`
anywhere in the extension, and no body cap in `pij send`. Safe, but it is now a long single-line string
rendered inline per row at `cli.ts:5930` and inside the sweep alert body.

**G-4 (info) — the ordering assertions are weaker than they look.** In `anomalies.test.ts:926-932` the
indices are computed on the **imported constant**, not on `found[0].detail`. Combined with the adjacent
`toContain(STATUS_WORKING_REMEDY)` on the detail, they do establish park-first *within the appended
fragment* — but they are invariant to how the detector composes the surrounding detail. `cli.test.ts`
asserts on the real emitted message, so the CLI side is exact.

**G-5 (info, ruled) — a small ergonomic consequence at the `report now` site.** The remedy now directs the
user to `pij report state waiting|…`, a **different verb** from the one they typed, which does not carry
the `did`/`next` they had already supplied; the previous wording (`declare --state waiting|…`) was
applicable in place. Both forms are valid (`report now … --state waiting` still parses `ok`), so nothing is
broken. The o-prime confirmed this wording at 04:20Z; I record it only so the trade is on the record.

## §6 Gates

Full `vitest run .pi/extensions/pij/` via `pij bg` (`bg-mtbomrz8-qomjp7`): **171 passed | 2 skipped (173)**
files, **3978 passed | 15 skipped (3993)** tests, `VITEST_EXIT=0`, 169.49s. Post-restore: fast set
**588/588**, `tsc --noEmit` **0 errors**, `biome check` clean on all 6 changed files.

## §7 Verdict

**APPROVE.** Every item the dispatch asked me to confirm is confirmed, and two of them are established more
strongly than requested — F-1 by exhaustive enumeration of the rejection sites rather than by inspecting
the two the packet named, and item 5 by reconstruction and blob SHA against the base rather than by reading
a diff. The mandated M6 flips from surviving to RED, which is the cleanest possible evidence that F-4 is
closed. The five findings are all low or informational, all concern durability or wording rather than
behaviour, and none should hold the branch.

**Shipping note (not a finding):** the branch sits on `42b7268f` while `origin/main` has advanced to
`d620cdd1` — a rebase or merge is needed before ship.

---

**TERMINAL REPORT — dlg-0011 review-01-fx01.** This pass is CLOSED. No mutations were run after this
section was written; all six were reverted and the three touched sources verified byte-identical three ways
(`cmp`, `git diff --exit-code`, `git hash-object` vs `HEAD:<path>`) before drafting. HEAD unmoved at
`2a3942c`. No open pass remains for this delegation.

Evidence retained: gate log `~/.pij/pij-mobile-reptile/bg-mtbomrz8-qomjp7.log`; freeze baselines
`/tmp/d11fx-baseline-status.txt`, `/tmp/d11fx-status-close.txt`; source originals `/tmp/d11fx-cli.orig`,
`/tmp/d11fx-anom.orig`, `/tmp/d11fx-dtmux.orig`; base blobs `/tmp/d11fx-anom-base.ts`,
`/tmp/d11fx-cli-base.ts`; probes `/tmp/d11fx-probe.mts` (CLI messages), `/tmp/d11fx-detail.mts` (rendered
detail), `/tmp/d11fx-uncond.mts` (M9 behaviour proof).
