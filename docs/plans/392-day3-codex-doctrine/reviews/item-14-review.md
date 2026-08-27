# Cold review — item 14 (C9 watchdog-mute wording) · commit `445f8ee`

> **TERMINAL REPORT.** This pass is CLOSED. No mutations were run after this file
> was written, and no further pass is open on this side. Every scaffold named in
> §1 was torn down before delivery.

**Reviewer**: `pij-wilful-morton` (cold, no prior context on this item)
**Verdict**: ✅ **APPROVE** — 4 non-blocking advisories, 6 informational notes.
**Fence honoured**: read-only everywhere; the only file written in the repo is
this one.

---

## 1. Scaffolding, method, and the limits of this pass

State this first so a gate I did not examine never reads like a gate I found
clean.

### Scaffolding I built (and removed)

| thing | why | torn down |
|---|---|---|
| `git worktree add --detach /tmp/pij-14-cold 445f8ee` | independent tree; never touched the fenced worktree | ✅ removed, all worktree rows verified intact |
| `ln -s ~/GitHub/pij/node_modules /tmp/pij-14-cold/node_modules` | vitest needs deps | ✅ went with the tree |
| `.pi/extensions/pij/core/zz-probe14.test.ts` | executed `buildWatchdogTurn` + `mutesWatchdogNudge` to get **runtime** strings rather than eyeballing source | ✅ deleted; `git status --porcelain` = 0 rows |
| `/tmp/routing.orig`, `/tmp/watchdog.orig` | mutation backups | ✅ restored byte-for-byte, tree verified clean |
| three source mutations (MUT-A/B/C) | Dim-0 | ✅ all reverted; clean tree confirmed before delivery |
| trial merge of `origin/main` (`42b7268`) | conflict + regression check | ✅ `git merge --abort`, 0 dirty rows |

### Method

Runtime over reading. I did not trust the diff's claim that the quote matched
`buildWatchdogTurn`; I **called** `buildWatchdogTurn`, extracted the quote out of
`00-routing.md` with a regex, and compared the two strings with `===`. Likewise I
did not trust the source `switch` for the mute set; I enumerated
`SEMANTIC_STATES` at runtime and printed the table.

Then I asked the question the packet did not: **what actually catches this if it
regresses?** That is where the substantive findings are.

### What this pass did NOT examine

- `harness checks`, `just self-check`, `just smoke`, `just lint`, the repo-wide
  test suite. The coder self-reports these red **outside this fence**; I did not
  independently reproduce or scope them. **Treat that as unverified by me.**
- `typecheck` — deliberately skipped and **not a sensor here**: the commit
  touches 5 files, **0 of them non-`.md`** (verified). No TypeScript changed.
- Any live daemon / real watchdog fire. All watchdog evidence is from direct
  function calls, not an end-to-end nudge.
- `node_modules` is a **symlink to the main checkout**, not a clean `npm ci`, so
  dependency drift is invisible to this pass.
- Whether the o-prime acts on any advisory below.

### Lineage

`445f8ee` "docs(pij): clarify watchdog mute states", parent `346ad1a`, on
`s392/day3-codex-doctrine` only. 5 files, +103/−6; **docs-only**.
`origin/main` (`42b7268`) is *not* an ancestor; trial merge is clean (§7).

---

## 2. Establish points — verdict table

| # | packet requirement | verdict | evidence |
|---|---|---|---|
| 1 | C9 matches `mutesWatchdogNudge` exactly; no over/under-claim | ✅ **PASS** | §3 — runtime table |
| 2 | new nudge quote byte-faithful to `buildWatchdogTurn`; stale substring survives only as negated shorthand | ✅ **PASS** (with ADV-1) | §4 |
| 3 | budget-flat, no load-bearing C9 content dropped | ✅ **PASS** | §5 |
| 4 | `orient-oprime` duty 7 mirror: one line, consistent, budget-respecting | ✅ **PASS** | §6 |
| 5 | gates first-hand: skill-check 0 ✗; `cli.integration` + `acceptance-sweep` green | ✅ **PASS** | §7 |

---

## 3. Establish 1 — the mute claim is exactly right

`core/watchdog.ts:332 mutesWatchdogNudge`, enumerated **at runtime** over
`SEMANTIC_STATES` (`core/types.ts:110-118`), not read off the source:

```
blocked   -> true      ready     -> false
question  -> true      failed    -> false
hold      -> true      cancelled -> false
waiting   -> true      done      -> false
                       undefined -> false
```

The C9 amendment says:

> `done` is a verifier claim and stays watched; so does `ready` for an idle
> standing assignment. Truly parked with no open work → `hold`/`waiting`; a human
> answer → `question`; an external dependency → `blocked` — **those four mute
> nudges.**

- Mute set claimed = `{hold, waiting, question, blocked}` = **exactly** the four
  that return `true`. No over-claim.
- `done` and `ready` claimed watched = both return `false`. Correct.
- The function is exhaustive-by-compiler (`const exhaustive: never = state`), so
  a future state cannot silently join the mute set — the doc's enumeration is
  stable against that class of drift.

**INFO-3.** `failed`/`cancelled` also stay watched and are unmentioned. Because
the sentence enumerates the mute side exhaustively ("those four"), the watched
status of `failed`/`cancelled` is *correctly implied* rather than mis-stated.
Not a defect; noted only so a future editor does not "fix" it into a wrong list.

The mute set is separately pinned by `core/watchdog.test.ts:554`
(`SEMANTIC_STATES.filter(mutesWatchdogNudge).sort()`), so the **code** side of
this claim has a real sensor. The doc side does not — see ADV-2.

---

## 4. Establish 2 — the quote is byte-faithful, and the pin is inverted

### The quote is exact

I ran `buildWatchdogTurn("pij-x", 2, {...})` and regex-extracted the C9 quote,
then compared:

```
=== EXACT MATCH (quote === turn-minus-header-prefix)? === true
=== ROUTING CONTAINS TURN BODY?                      === true
```

The doc reproduces the emitted turn verbatim, modulo the `[pij watchdog #N for
<id>] ` header prefix (correctly dropped — it is per-fire metadata, not copy).
**This is a genuine improvement**: the previous quote ended `"If done, run \`pij
report state done\`."`, which `buildWatchdogTurn` has not emitted since `ready`
was added to the close. The coder's stale-quote finding is real and the
correction is right.

**INFO-2.** The quote reproduces only the **card-owing** turn shape. With
`owesCard: false` (the PA branch) the middle clause is instead *"You owe no
status card — keep the ping honest by staying responsive."* C9 does not say the
quote is one of two shapes. Harmless for C9's audience, but a reader who is a PA
will not recognise their own nudge.

### ADV-1 — the string pin now *mandates* the superseded text (headline)

`cli.integration.test.ts:326-327`:

```ts
const liveGuidance = `${routing}\n${watchdog}`;
expect(liveGuidance).toContain("If done, run `pij report state done`");
```

I checked which file satisfies it:

```
pin in 00-routing.md      : True
pin in docs/how/pij-watchdog.md : False   ← line-wrapped, so not a contiguous substring
```

So **`00-routing.md` is the sole carrier**, and the only thing keeping it there
is the coder's negated-shorthand sentence. I proved the consequence
(**MUT-B**): delete that sentence, keep the corrected quote, run the pin →

```
FAIL  cli.integration.test.ts:327
  expect(liveGuidance).toContain("If done, run `pij report state done`")
```

**The sensor is inverted.** It is green when the doc carries the stale claim and
red when the doc is cleaned up. The coder's workaround is the *only* way to
satisfy a pin that has outlived its purpose — and the report is honest that this
is what happened ("remains only as a shorthand that the next sentence explicitly
calls 'not a silencer'").

This does not block: the resulting sentence is accurate and pedagogically useful
(naming the misconception you are correcting is good doctrine writing). But the
pin should be re-aimed at the **current** text, e.g. assert the live close string
and assert the stale one appears **only** adjacent to its negation.

---

## 5. Establish 3 — budget flat, and nothing load-bearing was lost

| file | before | after | Δ |
|---|---|---|---|
| `00-routing.md` | 205 | 205 | **0** |
| `orient-oprime.md` | 193 | 193 | **0** |

Budget-flat means content was **traded**, not added, so I checked every removed
clause for survival rather than accepting the line count:

| removed from C9 | survives? |
|---|---|
| "Done → `pij report state done`." | superseded on purpose (that was the wrong claim) |
| `pij report question "<what I need from you>"` (literal form) | ✅ `routes/node.md` — and **pinned** at `cli.integration.test.ts:322` |
| `pij report blocked "<what I am waiting on>"` (literal form) | ✅ `routes/node.md` — pinned at `:323` |
| "absence is honest by design" | ✅ `node.md:47`, `docs/how/pij.md:201`, `pij-watchdog.md:207` |
| "Never self-pause **merely because work ended or blocked**" | ✅ survives, **strengthened** to unconditional (INFO-1) |

The **backstop paragraph** the packet flagged ("A nudge is a BACKSTOP, not the
trigger…") is **untouched** — it appears as unchanged context on both sides of
the diff hunk. Confirmed.

**INFO-5.** C9 lost the copy-pasteable command forms in favour of bare state
words (`question`, `blocked`). Acceptable — C9 is etiquette, `node.md` is the
command reference, and the literal forms are pinned there — but a nudged peer
reading C9 alone now gets vocabulary without syntax.

### ADV-4 — `waiting`/`hold` for a seat with no blocker contradicts the emitter's own reasoning

C9 now says: *"Truly parked with no open work → `hold`/`waiting`"*.

`buildWatchdogTurn`'s own comment (`core/watchdog.ts:399-405`) says the opposite
about `waiting`:

> `waiting` is **DELIBERATELY NOT OFFERED** here: parking with no blocker
> recreates the parked-but-working state, which is a permanent silencer —
> offering it to an unblocked seat would manufacture that defect on a timer.
> `ready` is the honest answer for idle-but-available; `waiting` stays for an
> actual blocker.

C9 now routes exactly the case that comment refuses ("no open work" = no blocker)
to `waiting`, which mutes. Separately, `hold` is canonically *"deliberately
parked **by an issuer**"* (`core/state.ts:139`), and `anomalies.ts:818` raises
`foreign-hold-clear` on the premise that a hold **carries an issuer** — so a seat
self-declaring `hold` because it has nothing to do is a loose use of the word
(mechanically legal: it becomes its own issuer and can clear it).

This traces to the item dossier itself (`tasks.md:8`: *"a seat standing by with
no open work should park `hold`/`waiting`"*), so the coder implemented what was
asked. **Not a defect in the implementation — a defect in the instruction**,
which is why it is an advisory rather than a change request. Suggested wording:
reserve `hold`/`waiting` for an issuer-park and a real external dependency
respectively, and let `ready` carry idle-but-available (which C9 already does one
clause earlier).

**INFO-4.** C9's `blocked` = "an external dependency" matches `node.md`
("`report blocked` when progress is waiting on something external") but not
`state.ts:145`, whose badge annotation reads `waiting // semantic: dependent on
something external`. That inconsistency is **pre-existing and repo-wide**; item
14 follows the peer-facing doc, which is the right choice. Flagged so it is not
later mistaken for something this commit introduced.

---

## 6. Establish 4 — the orient-oprime mirror

```diff
-   `waiting|hold|blocked|question`) and confirm the card actually moved. A relayed
-   instruction is not a fixed card. A stale card is worse than no card — every
+   `waiting|hold|blocked|question`) and confirm the card moved. `done` is a verifier
+   claim, not a mute; `ready` stays watched. A stale card is worse than no card — every
```

- **Consistent**: the parked list `waiting|hold|blocked|question` is exactly the
  runtime mute set. The added clause matches C9 verbatim in meaning.
- **One line, budget-respecting**: ✅ 193 → 193.
- **Paid for by a deletion**: *"A relayed instruction is not a fixed card."* was
  dropped to fit. I checked whether that doctrine survives — it does, in
  `skills/pij/references/prime/orchestrator.md:102` ("a relayed instruction is
  not a fixed card, and stale now/next renders as current"), which is a prime
  document the same reader loads. **So this is a de-duplication, not a loss.**
  Downgraded to informational on that basis. Also `actually moved` → `moved`,
  cosmetic.

---

## 7. Establish 5 — gates, run first-hand

All run by me in `/tmp/pij-14-cold` at `445f8ee`:

| gate | result | note |
|---|---|---|
| `bash harness/scripts/pij-skill-check.sh` | **exit 0**, 194 ✓, **0 ✗** | matches report |
| `vitest cli.integration.test.ts acceptance-sweep.test.ts` | **exit 0**, **116 passed / 1 skipped**, 163.9s | matches report's "116 passed and 1 skipped" exactly |
| `vitest core/watchdog.test.ts` | green (68 tests with acceptance-sweep) | emitter snapshot intact |
| trial merge `origin/main` (`42b7268`) | **clean**, no conflicts | C9 intact post-merge, 205 lines |
| gates on the **merged** tree | skill-check exit 0 / 0 ✗; 3 vitest files green | no latent regression |

**INFO-6 — `pij-skill-check` is not a sensor for this change.** I grepped
`harness/scripts/pij-skill-check.sh` for `watchdog`, `mute`, and `C9`: **zero
matches**. Its 194 ✓ are real but say nothing about C9's correctness. A reader of
the report could reasonably infer otherwise from "`just pij-skill-check`: PASS,
zero failures". Worth naming when a green gate is orthogonal to the change it is
cited for.

### The coder's self-report

Verified honest. `PARTIAL` is the right word, the 116/1 figure reproduces
exactly, both budgets reproduce exactly, the "Runtime quote decision" section
discloses the shorthand workaround rather than hiding it, and the out-of-fence
reds are declared rather than omitted. No over-claim found.

---

## 8. Dim-0 — what happens if this fix regresses

Doc changes are usually taken on faith. I mutated instead. Control = all gates
green at `445f8ee`.

| # | mutation | gates | meaning |
|---|---|---|---|
| **MUT-A** | revert the C9 quote to the **old stale text** | skill-check exit 0 / 0 ✗; `cli.integration` pin ✅; `watchdog.test` + `acceptance-sweep` 68 ✅ — **fully green** | **the fix is unguarded.** Undoing it is invisible to every sensor. |
| **MUT-B** | keep the corrected quote, delete the negated-shorthand sentence | `cli.integration.test.ts:327` **RED** | the pin **mandates** the superseded string (ADV-1) |
| **MUT-C** | change `buildWatchdogTurn`'s close string, leave docs alone | `watchdog.test` **RED** (inline snapshot); `cli.integration` pin ✅; skill-check exit 0 / 0 ✗ | **the recurrence path.** The emitter is pinned; the doc quote is not. |

### ADV-2 — the fix has no ratchet

MUT-A and MUT-C together describe the whole failure mode. `buildWatchdogTurn` is
protected by an inline snapshot at `watchdog.test.ts:320`, so an emitter change
goes red — and the fix is to **update the snapshot**. Nothing then forces
`00-routing.md` to follow. That is precisely how the quote item 14 just corrected
went stale in the first place, and the mechanism is untouched.

This is a point-in-time correction, correctly made, with no sensor installed
against recurrence. Cheap fix, and it subsumes ADV-1: pin the doc against the
**emitter**, not against a literal —

```ts
expect(routing).toContain(
  buildWatchdogTurn("x", 1, { ...effectiveWatchdog(), paneAvailable: true })
    .replace(/^\[pij watchdog #1 for x\] /, ""),
);
```

I verified that assertion passes at `445f8ee` (it is the same comparison my probe
made, which returned `true`) and would have gone red on the pre-fix text.

### ADV-3 — the sibling half of `liveGuidance` still carries the identical defect

`docs/how/pij-watchdog.md` is the other file the pin reads, and it is now **less
correct than C9**:

- **`:196-208`** — the same four-bullet "Reporting state" list C9 just replaced:
  `done` presented as a nudge answer, no statement that it does not mute, `ready`
  and `hold` absent entirely, and no mute set named anywhere.
- **`:215-218`** — a fenced `text` block presented as *"A turn is self-teaching
  and ordinal, for example:"* that still ends `If done, run \`pij report state
  done\`.` **This is byte-unfaithful to `buildWatchdogTurn` today** — the exact
  defect item 14 was raised to fix, in a second copy, one file away.

Out of item 14's fence, so **not a blocker for this commit**. But whoever picks
up ADV-2 should do both files at once, or the drift item 14 closed stays open in
the doc a reader is more likely to reach for when asking "what does the watchdog
do?".

**INFO-1.** C9's `never self-\`pause\`` is now **unconditional** (was: "merely
because work ended or blocked"). The direction is right and matches the negative
pins at `cli.integration.test.ts:328-331`. But `pij-watchdog.md:189-196` still
documents a **supported `self` pause tier** (`pij watchdog pause <id>`, described
as "the peer's claim that watchdog turns are unnecessary"). Doctrine forbidding a
mechanism the how-doc presents as legitimate is defensible, but the two should be
made to agree — e.g. C9 saying an operator may pause you, you never pause
yourself.

---

## 9. Findings

| id | severity | where | finding |
|---|---|---|---|
| **ADV-1** | advisory | `cli.integration.test.ts:327` | Pin mandates the superseded string; **MUT-B → RED**. Green when the doc is wrong, red when cleaned. Re-aim at current text. |
| **ADV-2** | advisory | `00-routing.md` C9 ↔ `core/watchdog.ts:367` | No sensor binds the doc quote to the emitter. **MUT-A green**, **MUT-C doc-side green**. Drift will silently recur. Fix sketched above. |
| **ADV-3** | advisory | `docs/how/pij-watchdog.md:196-208, 215-218` | Sibling half of `liveGuidance` still carries the stale quote and the pre-fix state list. Out of fence; pair it with ADV-2. |
| **ADV-4** | advisory | `00-routing.md:181` | "Truly parked with no open work → `hold`/`waiting`" contradicts `watchdog.ts:399-405` (`waiting` deliberately withheld from unblocked seats) and `state.ts:139` (`hold` is issuer-parked). Traces to the dossier, not the coder. |
| INFO-1 | info | `00-routing.md:181` | Unconditional `never self-pause` vs. the documented `self` pause tier. |
| INFO-2 | info | `00-routing.md:178` | Quote covers only the `owesCard` turn shape; the PA shape differs. |
| INFO-3 | info | `00-routing.md:181` | `failed`/`cancelled` unmentioned — correctly *implied* watched. |
| INFO-4 | info | `state.ts:145` vs `node.md` | Pre-existing `blocked`/`waiting` "external" ambiguity; C9 follows the peer-facing doc. |
| INFO-5 | info | `00-routing.md:181` | Literal `report question`/`blocked` command forms dropped; survive and are pinned in `node.md`. |
| INFO-6 | info | `pij-skill-check.sh` | Zero `watchdog`/`mute`/`C9` matches — its green is orthogonal to this change. |

**None blocks.** Every advisory is about the *sensor around* the wording or about
a sibling document; none says the wording as landed is wrong.

---

## 10. Verdict

### ✅ APPROVE

All five establish points hold, and two of them hold under stronger evidence than
the packet asked for:

1. **The mute claim is exactly right** — verified by runtime enumeration, not by
   reading the `switch`.
2. **The quote is byte-faithful** — verified by executing `buildWatchdogTurn` and
   `===`-comparing, returning `true`.
3. **Budget-flat with nothing lost** — every removed clause traced to a surviving
   home, including the `orient-oprime` sentence that paid for the mirror.
4. **The mirror is one line and consistent.**
5. **Both gates green first-hand**, reproducing the report's figures exactly, and
   **still green after a clean trial merge of `origin/main`**.

The change is strictly more correct than what it replaced: it removes a quote the
daemon has not emitted for some time and it removes an implication (`done`
quiets the watchdog) that the code contradicts. Nothing downstream can inherit a
wrong answer from it — this is documentation, and it only ever makes a reader
*more* accurate.

The real finding is not in the wording but around it: **this fix is unguarded
(ADV-2) and the one nearby pin actively rewards keeping the stale string
(ADV-1)**, while a second copy of the same defect sits in `pij-watchdog.md`
(ADV-3). Those are follow-up work, not landing blockers, and they are cheap —
one assertion re-aimed at the emitter closes ADV-1 and ADV-2 together.

**Land it.**

---

*Reviewed cold by `pij-wilful-morton`. Scaffolding torn down; `git status` clean;
worktree rows intact. Terminal-once — this pass is closed.*
