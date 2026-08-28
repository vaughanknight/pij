# Item 14 — ADV-4 fold re-confirm (cold)

> **TERMINAL REPORT.** This pass is CLOSED. No mutations were run after this file
> was written; all scaffolding was torn down before delivery. No further pass is
> open on this item from my side.

**Reviewer**: `pij-wilful-morton` (cold) · **Target**: `7b7cb29` *docs(pij): correct watchdog parked-state guidance*
**Baseline**: `445f8ee` (item 14, which I APPROVED) · **Scope**: narrow re-confirm of my own ADV-4 only
**Verdict**: ✅ **CONFIRMED** — the fold is correct against all three code anchors, budget-flat, gate-green, and loses nothing.

---

## 1. Scaffolding, method, and the limits of this pass — stated first

**Scaffolding I built** (all torn down; see §7):

- `git worktree add --detach /tmp/pij-14b 7b7cb29` + `ln -s ~/GitHub/pij/node_modules` — the deps are the **main checkout's**, not a clean `npm ci`. Lockfile drift would be invisible to me. Same limit as my item-14 pass.
- One throwaway runtime probe (`core/zz-probe14b.test.ts`) that imports `mutesWatchdogNudge` and `SEMANTIC_STATES` and cross-checks them against the *text of the changed line*. Deleted before the mutation work.
- Two source mutations (MUT-D, MUT-E), both anchor-uniqueness-asserted, both restored; `git status --porcelain` empty before teardown.

**Method.** I did not accept the dispatch's quotation of the new sentence — I diffed the commit and confirmed the dispatch quote is byte-faithful to what landed (modulo backticks the dispatch dropped). I did not read the mute `switch` and reason about it; I **executed** it and enumerated the result. I did not assume the fold was guarded; I mutated it to find out.

**What I did NOT examine — these are gaps, not clean results:**

- `harness checks`, `just self-check`, `just smoke`, `just lint`, the repo-wide suite. The report's out-of-fence reds were **not** reproduced or scoped by me. Unchanged limit from my item-14 pass.
- No live daemon, no real nudge fired. Every claim about muting is from calling `mutesWatchdogNudge` directly, not from observing a daemon decline to nudge.
- **ADV-1, ADV-2, ADV-3 from my item-14 review are NOT re-examined here** and are **NOT closed**. They are out of this dispatch's four-point fence. I confirm below only that the fold does not disturb them. (I note the o-prime has recorded them as **item 18** in `rulings.md`, and `main` `c0d68da` encodes the ADV-1/2 class as governance **E6** — "string pin on stale doc text is a backwards ratchet". That is tracking, not fixing.)
- Whether the o-prime acts on ADV-5 / the INFO notes below is unanswered.

**Lineage.** `7b7cb29` sits on `s392/day3-codex-doctrine` only. Its full diff is 4 files: the skill payload (`00-routing.md`, **1 line**), the coder report, the execution log, and the item dossier. **Zero non-`.md` files** — `typecheck` is not a sensor for it. During my pass the branch advanced to `8a894e1`; I verified `git diff 7b7cb29 8a894e1 -- skills/` is **empty**, so this verdict applies unchanged to the branch head.

---

## 2. The four confirm points

| # | Asked | Verdict | Basis |
|---|-------|---------|-------|
| **(a)** | Matches `watchdog.ts:399-405` / `state.ts:139` / ready=idle-available | ✅ **CONFIRMED** | §3 — runtime enumeration + all three anchors read at the target SHA |
| **(b)** | Budget-flat (`00-routing` 205) | ✅ **CONFIRMED** | §4 — `wc -l` = 205; exactly 1 line changed |
| **(c)** | skill-check 0 ✗ + cli.integration + acceptance-sweep green | ✅ **CONFIRMED** | §5 — ran all three first-hand; 194 ✓ / 0 ✗, 116 passed / 1 skipped |
| **(d)** | No NEW C9 content lost | ✅ **CONFIRMED** | §6 — token-level diff; one deletion, analysed and judged non-lossy |

---

## 3. (a) The sentence against the code — proven by execution

**The change** (`00-routing.md:181`, the only line touched):

> **before** — `Truly parked with no open work → hold/waiting; a human answer → question; an external dependency → blocked — those four mute nudges.`
> **after** — `Only genuine conditions mute: an external dependency → blocked/waiting per node doctrine; a human answer → question; an issuer parking you → hold. Never self-declare hold/waiting merely because you are idle.`

I confirmed the dispatch's quotation is byte-faithful to the commit.

**Runtime enumeration** (probe output, not source reading):

```
RUNTIME MUTES  : ["blocked","question","hold","waiting"]
RUNTIME WATCHED: ["ready","failed","cancelled","done"]
undefined mutes? false
STATES NAMED IN MUTE CLAUSE: ["blocked","question","hold","waiting"]
NAMED === RUNTIME MUTE SET?  true
NEGATIVE-RULE STATES: ["hold","waiting"]
ALL NEGATIVE-RULE STATES ACTUALLY MUTE?  true
`ready` MUTES?  false
```

That last block is the substantive result, and it is stronger than "the words match":

1. The mute clause names **exactly** the runtime mute set — not a subset, not a superset.
2. The negative rule (`Never self-declare hold/waiting…`) targets **two states that genuinely silence the watchdog**. The prohibition therefore prevents a real permanent silencer, which is the entire hazard `watchdog.ts:399-405` describes. A negative rule aimed at a non-muting state would have been decorative; this one is load-bearing.
3. `ready` does **not** mute, so channelling an idle seat to `ready` routes it to a genuinely **watched** state rather than trading one silencer for another.

**Anchor 1 — `watchdog.ts:399-405`** (read at `7b7cb29`):

> `waiting` is DELIBERATELY NOT OFFERED here: parking with no blocker recreates the parked-but-working state, which is a permanent silencer — offering it to an unblocked seat would manufacture that defect on a timer. `ready` is the honest answer for idle-but-available; `waiting` stays for an actual blocker.

The fold now conditions `waiting` on *"an external dependency"* (i.e. an actual blocker exists) and explicitly forbids declaring it *"merely because you are idle"*. That is the code comment's rule restated in the seat's voice. ✅ **Match.** The prior wording was the exact defect this comment was written to prevent; it is gone.

**Anchor 2 — `state.ts:139`**: `hold, // semantic: deliberately parked by an issuer`.
The fold says *"an issuer parking you → hold"*. Note the grammar does the semantic work: the issuer is the **subject**, the seat the **object**. `hold` is no longer something the seat reaches for. ✅ **Match**, and consistent with `anomalies.ts:818` (`foreign-hold-clear`) which presumes a hold carries an issuer.

Correctly, the prohibition is **qualified** (*"merely because you are idle"*) rather than absolute. Self-hold is mechanically legal — the seat simply becomes its own issuer — so a categorical *"never self-hold"* would have asserted a rule the code does not enforce. The qualified form forbids the abuse without overclaiming the mechanism. This is the right call.

**Anchor 3 — ready = idle-available.** `buildWatchdogTurn`'s close offers *"if you are idle but available on a standing assignment, run `pij report state ready`"*, and C9 retains *"so does `ready` for an idle standing assignment"* immediately before the changed clause. With the new negative rule closing the `hold`/`waiting` escape, `ready` is now the **only** offered destination for an idle seat. ✅ **Match** — and the fold makes the routing exhaustive where before it was contradictory.

---

## 4. (b) Budget

```
205 skills/pij/references/00-routing.md      (was 205 at 445f8ee — flat)
193 skills/pij/references/prime/orient-oprime.md   (untouched by this commit)
```

Programmatic line-by-line comparison of `445f8ee` vs `7b7cb29`: **exactly one differing line, at 181.** ✅ Budget-flat.

**Precision note (not a defect):** the skill-check budget **cap** for this file is **250** (`pij-skill-check.sh:67`), so the gate has 45 lines of headroom and would not have caught growth. "Budget-flat at 205" is my measurement, not a gate-enforced property. Worth saying plainly, because a green gate is being cited for a property the gate does not actually check.

---

## 5. (c) Gates — run first-hand at `7b7cb29`

| Gate | Result |
|------|--------|
| `bash harness/scripts/pij-skill-check.sh` | **exit 0** — 194 ✓ / **0 ✗** — `✅ pij-skill-check: all green` |
| `vitest run cli.integration.test.ts acceptance-sweep.test.ts` | **exit 0** — **116 passed / 1 skipped (117)**, 172.4s |

Both reproduce the item-14 baseline **exactly** (same 194/0, same 116/1). Exit codes were captured directly, not through a pipe.

**But name what these gates can see.** `grep -c 'watchdog\|mute\|C9\|genuine' harness/scripts/pij-skill-check.sh` → **0**. Its 194 ✓ are real and say **nothing** about whether C9 is correct. Only two sensors read `00-routing.md` at all (`cli.integration.test.ts:238` and `:314`), and neither pin touches the folded clause — `:314`'s routing assertions land on the *unchanged* shorthand sentence and the negative self-pause strings. So "gates green" here means "nothing regressed", not "the fix is verified". The fix is verified by §3, not by §5.

---

## 6. (d) Content-loss audit — token level

One line changed. Every state token survives; `waiting` and `hold` each gain an occurrence (the new negative rule):

```
`blocked` 1→1   `waiting` 1→2   `hold` 1→2   `question` 1→1
`done`    1→1   `ready`   1→1   `pause`  1→1  `interval` 1→1
```

Two removals, both examined:

1. **`"Truly parked with no open work"`** — this *was* the defect. Correctly removed. A corpus-wide sweep (`grep -rn 'Truly parked\|truly parked\|no open work' skills/`) returns **nothing**: the false instruction has no surviving home in the skill payload. ✅
2. **`"— those four mute nudges."`** — a genuine deletion, and the only one worth arguing about. It asserted (i) *these mute* and (ii) *there are exactly four*. The replacement moves the mute assertion to the head as *"Only genuine conditions mute:"* and still enumerates all four states, so the cardinality remains countable in place. The exclusivity that `Only` adds is **stronger** than what it replaced: it now implies `done`/`ready` do not mute, which is precisely the item's thesis and matches the runtime (`RUNTIME WATCHED` includes both). Net: **no operational loss.**

Everything else in C9 is byte-identical: the nudge quote at line 178 (which I proved byte-faithful to `buildWatchdogTurn` in the item-14 pass, and which is untouched here), the shorthand sentence, `done`/`ready`-stay-watched, *"Actively working has no semantic state word"*, the `interval`/never-self-`pause` close, and the whole BACKSTOP paragraph. `orient-oprime.md` is untouched — `git diff --stat` for it is empty. ✅ **Nothing lost.**

I also verified the coder's stated reason for *not* mirroring: duty 7 offers the four parked states as something an o-prime **relays to a seat** (issuer-side), and never conditions them on "no open work". The claim is accurate; no mirror edit was owed. (But see ADV-5.)

---

## 7. Dim-0 — is the fold guarded? No.

Control green first; both mutations anchor-uniqueness-asserted and restored.

| Mutation | skill-check | `:314` pin | `:238` pin | `watchdog.test` |
|---|---|---|---|---|
| **control** (`7b7cb29` as committed) | 0 ✗ | ✅ | ✅ | — |
| **MUT-D** — revert line 181 to the pre-fold, ADV-4-defective text | 0 ✗ | ✅ | ✅ | — |
| **MUT-E** — doc names `ready` as a muting state and `done`/`ready` as silencers (**both false at runtime**) | 0 ✗ | ✅ | — | ✅ |

**MUT-D**: the entire fold can be reverted and **every gate stays green**. **MUT-E** is sharper: a C9 that *directly contradicts the runtime mute table* — telling a reader that `ready` silences the watchdog, the exact inversion of the item's thesis — also passes everything.

This is not a new defect and does not block: it is **ADV-2 from my item-14 review** (no ratchet between the doc and `watchdog.ts`), now demonstrated on the folded sentence specifically. I raise it here only so the record does not imply the fold arrived guarded. The one-assertion fix proposed in §8 of my item-14 review closes ADV-1 and ADV-2 together; the o-prime has scheduled it as **item 18**. **Fixing it is out of this fence and I did not attempt it.**

**Restoration verified**: `git status --porcelain` empty before teardown; worktree removed; all 5 pre-existing worktrees intact; `/tmp` residue removed.

---

## 8. New findings from this pass

| # | Grade | Finding |
|---|-------|---------|
| **ADV-5** | Advisory (low) — **new** | `orient-oprime.md` duty 7 instructs an o-prime, when chasing a `status-stale` row, to send the seat *"a parked state: `waiting|hold|blocked|question`"*. Parking a seat to clear a stale card is **ADV-4's defect one layer up, in the issuer's voice**: `hold` is legitimate there (the o-prime *is* the issuer), but relaying `waiting`/`blocked`/`question` to a seat that has no dependency and no open question manufactures exactly the permanent silencer `watchdog.ts:399-405` warns about. The fold correctly did not need to touch this to be right, so it does **not** block. Same family as ADV-4; belongs with item 18. |
| **INFO-7** | Informational | *"per node doctrine"* is a **pointer that does not resolve**. `node.md:44-45` gives conditions for `question` (human answer) and `blocked` (waiting on something external) and **never distinguishes `waiting` from `blocked`**; `waiting`'s external-dependency sense lives in `state.ts:145`, not in node.md. The substance is right — both are external-dependency shapes — but a reader who follows the citation to choose between the two finds no answer there. The dossier calls it "node.md's blocked-vs-waiting split"; that split is not in node.md. |
| **INFO-8** | Informational | `node.md:64` speaks of *"a seat that has **parked itself** in `waiting\|hold\|blocked\|question`"* — the corpus elsewhere contemplates self-parking in `hold`/`waiting`. Not a contradiction (C9 forbids it only *"merely because you are idle"*, and self-hold is mechanically legal), but it is the seam ADV-4 came from and the phrasing still reads permissively. |
| **INFO-9** | Informational | *"Only genuine conditions mute"* is a **normative** claim where the deleted *"those four mute nudges"* was a **mechanical** one. The daemon cannot assess genuineness — a falsely declared `blocked` mutes exactly as well. The next sentence makes clear the discipline is the seat's, so this is not misleading in context, but the sentence no longer states a checkable fact about the mechanism. Low-grade; recorded because this is the kind of drift that becomes a later advisory. |

Carried forward, **unchanged and still open** (from my item-14 review, deliberately not re-examined): **ADV-1** (the `cli.integration.test.ts:327` pin is inverted — green when the doc is stale, red when it is cleaned), **ADV-2** (no ratchet, re-demonstrated above), **ADV-3** (`docs/how/pij-watchdog.md:196-208` and `:215-218` still carry the pre-fix state list and a byte-unfaithful example turn), **INFO-1** (C9's unconditional *never self-`pause`* vs the documented `self` pause tier).

---

## 9. Verdict

✅ **CONFIRMED — all four points.**

The fold does what my ADV-4 asked and does it better than the minimum. It could have simply deleted the false clause; instead it ties **each** muting state to its actual condition, adds an explicit negative rule that targets the two states which genuinely silence, and routes the idle case to the one state that stays watched — all within a single line, budget-flat, with the mute set still matching the runtime exactly.

**Brake-vs-policy framing** (repo doctrine): this is documentation. It gates nothing, so nothing downstream can inherit a wrong answer from it, and the change strictly *reduces* reader inaccuracy. Removing it makes readers less correct, not the system less safe. That is why one new low advisory and three informational notes sit comfortably alongside a confirmation — **none of them block, and none of them are conditions on landing `7b7cb29`.**

The one thing I would not want misread: **§5's green gates did not verify this fix.** Two mutations prove a doc contradicting `watchdog.ts` passes every sensor. What verifies the fix is the runtime enumeration in §3. The confidence here is earned by execution, not by the gate.

**Recommend: land `7b7cb29`.** ADV-5 and INFO-7/8/9 to item 18 alongside ADV-1/2/3.
