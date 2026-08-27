# Item 9 FIX — cold RE-review (narrow: F1–F4 restorations)

> **TERMINAL REPORT.** This pass is CLOSED. No mutations were left behind and no
> further work will be performed by this reviewer on item 9 unless a *new* packet
> is dispatched. Any follow-up is a new pass, not an amendment of this one.

**Reviewer**: `pij-joint-nightingale` (cold) · **Packet**: `reviews/item-9-rereview-packet.md`
**Fix commit**: `346c19f` (+ `0aabb1c` report) · **Base for the fix**: `bfbb08d` · **True doctrine base**: `fa6378a`
**Prior pass**: `reviews/item-9-review.md` → `FIX_REQUIRED` (F1 inverted read-back, F2 deleted roster authority, F3 false `§ C7` cite; F4 medium)

---

## Verdict

**`APPROVED`** — all four restorations land, each is a faithful return to `fa6378a`
semantics, no new loss was introduced, and the gate is **0 ✗ / 193 ✓** with
`orchestrator.md` 114/120 and `node.md` 150/150.

One **non-blocking** carry-forward is recorded (R1) with newly-produced evidence: the
gate is **demonstrably blind** to an F1 regression, so this fix is held in place by
human review alone. That is a harness gap, not a defect in `346c19f`, and it must not
delay merge.

---

## Scaffolding, workarounds, and the limits of what I ran

State these before findings so nothing I did not check can be mistaken for something
I found clean.

- **I mutated a live-doctrine file on purpose.** To test R1 I re-inverted F1 at *both*
  sites in `skills/pij/references/prime/orchestrator.md` and re-ran the gate. The file
  was backed up to `/tmp/orch.orig.md` beforehand and restored after; sha256 is
  **identical before and after** (`c9556a36…c7710`), and `git status --short --
  skills/ harness/ .pi/` is **empty**. The gate was re-run post-restore and is green.
  This worktree's `skills/` is **not** what live seats load (`~/.claude/skills/pij` →
  the main `GitHub/pij` checkout), so no seat could have observed the mutant.
- **`rg` is not installed on this machine.** All "appears nowhere" statements below
  were produced with `grep -rn` scoped to `skills/`, and are scoped claims, not
  repo-wide ones.
- **`just typecheck` was not run by me.** The diff is markdown-only (2 files, +7/−5);
  the coder reports it PASS and I did not independently reproduce it. Low risk, but it
  is their evidence and not mine.
- **The gate's ✓ count is a count, not an audit.** I verified `fail_count=0` and read
  the four markers that touch the changed text; I did not re-read all 193 assertions.

## What I did NOT adequately examine

- **The 26/29 unchanged consolidations, and `peer.md` / `prime.md` / `kickoff.md`** —
  excluded by the packet. They carry my prior pass's APPROVED, not a fresh one.
- **Carried-forward, already-adjudicated, and deliberately not re-opened**: the
  `— never a modal question UI` phrase dropped at `bfbb08d` is **still absent** at
  `346c19f`. My prior pass accepted it because global invariant 9 (`SKILL.md:66`) is a
  real, verified home and the gate pins the ban elsewhere (`question doctrine:
  ask_user_question appears only inside ban language`, ✓). I am flagging its continued
  absence so it is visible, **not** re-opening it.
- **F6 / F7 from the prior pass** (the busy-but-stale narrative; report-template
  structure) were info-level then and are out of this packet's fence now. Untouched
  by `346c19f`, unexamined here.
- **A behavioural A/B of a seat booted on `bfbb08d` prose vs `346c19f` prose.** Still
  the only true test of semantic preservation. Still not run. Everything below is
  close reading plus one gate-mutation experiment.

---

## Confirmation table

| # | Required restoration | Status | Evidence |
|---|---|---|---|
| **F1** | read-back **precedes** confirmation/creation | ✅ **CONFIRMED** — order, not just string | `:40`, `:53` vs `fa6378a` |
| **F2** | roster-authority clause restored | ✅ **CONFIRMED** — verbatim `fa6378a` clause | `:57` vs `fa6378a:67` |
| **F3** | `§ C7` claims only push-not-poll | ✅ **CONFIRMED** — and C7 re-verified first-hand | `:91`, `00-routing.md:140` |
| **F4** | `node.md` cap admonition restored in 150/150 | ✅ **CONFIRMED** | `node.md:72`, `wc -l` = 150 |
| — | no NEW loss | ✅ **CONFIRMED** — all 5 deletions accounted for | per-hunk audit below |
| — | gate still 0 ✗ | ✅ **CONFIRMED** first-hand | 0 ✗ / 193 ✓ |

---

## F1 — read-back is a precondition again (ORDER verified, not string presence)

The packet is right to insist on order: the previous defect passed the gate *because*
the literal survived. So I compared against the true base.

**`fa6378a` (Build configuration):**

> Then read it back verbatim and confirm inline before fleet creation — never a
> modal question UI (global invariant 9); persist the pending choice and remain
> reachable.

**`bfbb08d` (the defect):**

> **After the human confirms the fleet**, persist the choice and read it back verbatim before creation (global invariant 9).

**`346c19f` (`:53`):**

> Persist the pending choice and remain reachable; read it back verbatim and confirm inline **before fleet creation** (global invariant 9).

Sequence now reads: persist-pending → read back → confirm inline → fleet creation. The
read-back once again **gates the human's yes**, which was the whole point — it exists
to catch a mis-transcribed model *before* the answer, not to receipt it afterwards.
Every base element survives: *persist the pending choice*, *remain reachable*, *read it
back verbatim*, *confirm inline*, *before fleet creation*, invariant-9 cite.

**Clause order changed relative to base and it does not matter.** Base ended with
"persist the pending choice and remain reachable"; head leads with it. Persisting a
choice while it is still *pending* is by definition pre-confirmation, so the head order
is if anything the more temporally faithful of the two. No mandate moves.

**The fix also edited `:40` (Ordered entry step 11), which was byte-identical to
`fa6378a` and was never defective.** I checked this specifically, because a fix that
edits undamaged doctrine is exactly where regressions hide:

- base/`bfbb08d`: `11. After the human confirms the fleet, persist the selected profile in the plan roster.`
- head: `11. Read the selected profile back verbatim and confirm inline. After the human confirms the fleet, persist it in the plan roster.`

This is a **superset**. The only token surrendered is the explicit object *"the
selected profile"*, which becomes *"it"* with its antecedent in the immediately
preceding sentence of the same numbered step — unambiguous. And the change is a real
strengthening: § Ordered entry is governed by *"Run these steps in order. A later step
never retroactively satisfies an earlier one"*, so the read-back precondition is now
**positionally enforced** in the one section that has ordering semantics. My prior pass
observed that `bfbb08d` had aligned the prose *down* to step 11; this aligns both *up*.
Good direction.

**Two `persist` verbs, no contradiction — and this predates the fix.** `:53` persists
*the pending choice* (pre-confirmation, invariant 9); `:40` persists *it in the plan
roster* (post-confirmation). A reviewer could reasonably flag that as contradictory, so
I checked `fa6378a`: it has **the same two-persist structure** (`:43` roster-after-
confirm, `:57-58` pending-choice). Different objects, different moments, original to
the base. Not introduced here.

## F2 — roster authority restored verbatim

`fa6378a:67`: `the override flags; the plan roster remains the durable configuration truth.`
`346c19f:56-57`: `…does not persist override flags;` / `the plan roster remains the durable configuration truth.`

The exact base clause is back, in its original adversative position — immediately after
the engine limitation it exists to resolve. The prior pass's harm was precise: the text
mandated the *write* but not the *authority*, so the flow-pair-vs-roster conflict the
preceding clause predicts had no resolution rule. It has one again. The gate marker
`persist the plan roster` (`pij-skill-check.sh:451`) is unaffected and still ✓.

## F3 — attribution narrowed, and C7 re-verified first-hand

**`346c19f:91-92`:**

> Push-not-poll is § C7. Treat unexplained worker silence outage-first, never misconduct-first:

I re-read C7 rather than trusting my prior pass. `00-routing.md:140` — **§ C7 "Push when
owned; block on inbox when pull-owned"** — contains *"never poll `pij state`"*, *"This
blocking inbox read is the delivery primitive, not a liveness poll"*, and the `pij bg`
rule. So:

- push-not-poll **is** in C7 → the narrowed claim is **true**;
- outage-first is **not** in C7 → and it is no longer attributed there. `grep -rn
  "outage-first" skills/` returns **exactly one line**: `orchestrator.md:92` itself,
  asserting it inline as a direct orchestrator mandate. Correct shape.

Bonus, as predicted: **`never misconduct-first` came back for free** in the same edit,
restoring `fa6378a`'s *"Treat unexplained worker silence outage-first, never
misconduct-first."* word-for-word. The gate literal `outage-first`
(`pij-skill-check.sh:429`) still matches.

## F4 — node.md admonition restored inside 150/150

`fa6378a:75-76`: *"Size your text; do not discover the cap by hitting it."*
`346c19f` `node.md:72`: appended to the existing limits line, so **no line was added** —
`wc -l` = **150**, exactly at cap, which is why appending rather than inserting was the
only move available. The behavioural mandate my prior pass rated medium (it has no
citation home anywhere — it is pure orchestrator/node behaviour) is live again.

*Nit, non-blocking:* base ordered it **admonition → renderer caveat**; head is
**renderer caveat → admonition**, so the sentence now trails the display aside instead
of sitting adjacent to the 280/200 numbers it refers to. Same paragraph, same mandate,
marginally weaker adjacency. Not worth a line of the remaining budget.

---

## No new loss — every deletion in `bfbb08d..346c19f` accounted for

The diff is 2 files, +7/−5. I enumerated all five removed lines:

| Hunk | Removed | Disposition |
|---|---|---|
| `orch:40` | `…persist the selected profile in the plan roster.` | replaced by a **superset**; only `the selected profile` → `it` (antecedent in same step) |
| `orch:53` | `After the human confirms the fleet, persist the choice and read it back verbatim before creation…` | **this was the defect**; correctly removed, base semantics restored |
| `orch:57` | `…does not persist override flags.` | punctuation only (`.` → `;`), clause appended |
| `orch:91` | `Push-not-poll and outage-first recovery are § C7:` | **the false citation**; replaced by two true statements |
| `node:72` | `…but that is not a second write limit.` | retained verbatim, admonition appended |

No mandate, marker, link, or citation is lost. No file outside the two changed is
touched (`git show --stat 346c19f`).

**Budget arithmetic corroborates the prior pass.** I reported 8 lines of unused
headroom at `bfbb08d` (112/120) and estimated F1+F2 at ~2 lines. The fix delivers
**114/120** — exactly 2 spent, 6 still spare. The restorations were affordable, as
claimed, and there is room left for the optional items below.

---

## Gates — run first-hand

| Gate | Result |
|---|---|
| `just pij-skill-check` | ✅ **0 ✗ / 193 ✓**, `✅ pij-skill-check: all green` |
| `orchestrator.md` budget | 114 / 120 ✓ (6 spare) |
| `node.md` budget | 150 / 150 ✓ (at cap) |
| `peer.md` budget | 150 / 150 ✓ (unchanged by this commit) |
| Markers touching changed text | `read it back verbatim` ✓ · `outage-first` ✓ · `persist the plan roster` ✓ |
| `git status --short -- skills/ harness/ .pi/` | clean (after my mutation was restored) |
| `just typecheck` | **not run by me** — coder reports PASS; markdown-only diff |

---

## R1 (non-blocking, carry-forward) — the gate is *proven* blind to an F1 regression

My prior pass asserted this. This pass demonstrates it, because an assertion about a
linter is worth less than an experiment on one.

**Method.** I re-inverted F1 at both sites — `:40` back to roster-then-read-back, `:53`
back to the `bfbb08d` phrasing — while deliberately **keeping the pinned literal
`read it back verbatim` present**, which is exactly what a careless future consolidation
would do.

**Result.** `just pij-skill-check` → `fail_count=0`, `✅ pij-skill-check: all green`,
114 lines. **The gate passes a document in which the read-back is once again a
post-hoc receipt.**

The cause is unchanged from my prior read of `pij-skill-check.sh:413`:
`require_marker "$orchestrator" "read it back verbatim"` tests **presence of a string**,
never its **position relative to the confirmation**. So the mandate that F1 exists to
protect has, today, **zero deterministic back-pressure**. `346c19f` is correct, and
nothing but a human reading it stops the next consolidation from undoing it silently —
which is precisely how it was undone the first time.

**This is not already ticketed, and I checked.** `reports/item-9-F5-harness-check-ticket.md`
and `tasks/item-11-skillcheck-order-fix/tasks.md` exist and are correctly scoped to F5 —
but item 11 Req 1 fixes how an *existing* order check **resolves marker positions**
(per-marker first document-order occurrence instead of `head -1` across all markers).
R1 is a different shape: for the read-back there is **no order assertion to fix**, only
a presence pin. Item 11 as written would leave the mutant above green.

Suggested (out of fence; **fold into item 11 as a new requirement**, since it is the
same file, same author, same sitting): add an order-aware assertion scoped to
`§ Build configuration` requiring the offset of `read it back verbatim` to precede the
offset of `confirms the fleet`. Item 11's Req 2 fixture harness is exactly the vehicle —
and my mutant above is a ready-made RED fixture: it is a document that must FAIL and
today PASSES.

---

## Audit of the coder's fix report (`reports/item-9-fix-report.md`)

| Claim | Verdict |
|---|---|
| F1 read-back "again gates the human's yes and creation" | ✅ true — verified by order at `:40` and `:53` against `fa6378a` |
| F2 "restores that exact clause" | ✅ true — byte-for-byte match with `fa6378a:67` |
| F3 "C7 owns push-not-poll only" | ✅ true — I re-read `00-routing.md:140` |
| F4 "restored… without increasing line count. `node.md` remains 150/150" | ✅ true — `wc -l` = 150 |
| F5 "No change… separate out-of-fence harness ticket" | ✅ correct and correctly scoped |
| Gate PASS, 114/120, 150/150 | ✅ all three reproduced first-hand |
| `just typecheck` PASS | ⚠️ not reproduced by me (see limits) |

The report is accurate and, unlike the original item-9 report, does not overstate.
It quotes base, defect, and replacement side by side for each finding — which is the
structure I asked for last pass (a claim you can falsify by reading three strings)
and it made this review materially faster. **Worth keeping as the template.**

One small correction for the record: the report's F1 base quote is trimmed to *"Then
read it back verbatim and confirm inline before fleet creation."* The full `fa6378a`
sentence continues *"— never a modal question UI (global invariant 9); persist the
pending choice and remain reachable."* The head does restore *persist the pending
choice and remain reachable*, so the trimmed quote understates the fix's own fidelity;
the modal-UI phrase remains absent under the previously-accepted invariant-9 citation.
No action required — noted so the quote is not later read as the complete base.

---

## Recommended disposition

1. **Merge `346c19f` + `0aabb1c`.** Item 9 is closed on the merits. Do **not** revert
   `bfbb08d`; the consolidation plus these restorations is strictly better than either
   the pre-consolidation prose or the consolidated-but-lossy prose.
2. **Add R1 to the existing item 11** (`tasks/item-11-skillcheck-order-fix/`) rather
   than opening a second ticket. Item 11 already owns `pij-skill-check.sh` ordering and
   already plans a fixture harness; R1 is one more requirement in the same file and the
   same sitting. Note the distinction so it is not assumed covered: item 11 repairs a
   **broken** order check, R1 adds a **missing** one. Both are position defects; only
   one of them is currently in scope.
3. **Optional, affordable within the 6 spare lines**: restore `— never a modal question
   UI` at `:53`. It is covered by invariant 9 and is *not* required; but F1 has now been
   broken once by a consolidation, and inline redundancy is the cheapest guard available
   while R1 is open.

---

## Reviewer integrity

I mutated one tracked file during this pass and restored it byte-identically
(sha256 `c9556a36e9c6dba884f066aaf07fbc45341e9d78f62e0052369c01b2aeec7710` before and
after; `git status` clean; gate re-run green post-restore). The only file this pass
creates is this one. I did not touch `skills/`, `harness/`, `.pi/`, the coder's report,
or my own prior review. Scratch files live in `/tmp`.

I re-derived F3's C7 evidence and F1/F2/F4's base text from `git show fa6378a:…` rather
than reusing my prior pass's notes, because a re-review that trusts its own earlier
reading is not a second look. The one thing I could not do — boot a seat on each
version of the prose and compare behaviour — remains the only real proof of semantic
preservation, and its absence is why R1 matters.

**This pass is CLOSED.**
