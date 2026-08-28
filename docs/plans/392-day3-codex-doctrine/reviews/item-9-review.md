# Cold review — item 9 (live pij skill contract debt) · semantic preservation

> **TERMINAL REPORT.** This is a report-once pass. No mutations were run after
> writing it, and this file is the only thing this reviewer wrote. **This pass is
> CLOSED** — nothing here is pending, and no follow-up work is held open by me.

**Reviewer**: pij-joint-nightingale (GitHub Copilot CLI 1.0.81-14 / claude-opus-5)
**Orchestrator**: pij-falling-outside
**Worktree**: `/Users/vaughanknight/GitHub/pij-worktrees/s392-day3-codex-doctrine` (pwd verified)
**Base**: `fa6378a` · **Commit under review**: `bfbb08d` (+ `75e2fef`, report only)
**Scope**: 5 files, +78 / −115 lines. Semantic-preservation review, **not** a gate check.

---

## Verdict: **FIX_REQUIRED** — documentation only, ~2 lines to remedy

Three findings meet the packet's blocking bar. **All three are in
`orchestrator.md`, all three are text-only, and all three fit inside headroom the
commit already has** (see § Budget forensics). Nothing in `peer.md`, `node.md`,
`prime.md`, or `kickoff.md` reaches the blocking bar.

**Do not revert `bfbb08d`.** The commit is overwhelmingly sound: 26 of the 29
consolidations I checked preserve their mandate in compressed form or under a
citation I verified by reading the cited text. The defect is narrow and local.

---

## Scaffolding, workarounds, and the limits of what I ran

Stated before the findings, so nothing below is read as stronger than it is.

1. **`rg` is not installed on this machine** (`rg: command not found`). Every
   sweep below used `grep -r` from `skills/pij/`, which does not skip hidden
   paths, so the `.pi/` blindness trap in AGENTS.md did not apply. Where I claim
   "this phrase exists nowhere", the searched scope is **`skills/pij/` (and for
   one query, `government/`)** — not the whole repo, and not other checkouts.
2. **I ran the gate first-hand** rather than trusting the report: `just
   pij-skill-check` → `✅ all green`, 0 `✗`. I also read the coder's before-file
   (`.harness/temp/s392/skillcheck-9-before.txt`, 10 `✗`) and confirmed its
   contents line-by-line. The gate result is **necessary and not sufficient**,
   per the packet — I use it only as forensics for *what pressure shaped the edit*.
3. **I did not re-run `just typecheck`.** The coder reports PASS; these are five
   markdown files and typecheck cannot see them, so I judged the re-run
   worthless rather than skipped-for-convenience. Say so if you want it anyway.
4. **The only true test of "semantic preservation" is behavioural** — does an
   agent reading the new text act the same as one reading the old? **I did not
   run that test.** I have no A/B of a live seat booted on `fa6378a` prose versus
   `bfbb08d` prose. Every finding below is a *reading* of the text, and F6 in
   particular is a judgement call I could be wrong about.
5. **Blast radius, for severity calibration**: `~/.claude/skills/pij` →
   `/Users/vaughanknight/GitHub/pij/skills/pij` (the canonical checkout), **not
   this worktree**. So `bfbb08d` is not live yet; it goes live for every seat on
   this machine at merge. That is why I am reporting a 2-line prose defect as
   blocking rather than as a nit.

### What I did NOT adequately examine

- **The unchanged ~85% of the five files.** I reviewed the diff and the
  paragraphs immediately around each hunk. A pre-existing defect outside the
  hunks would not have been found by me.
- **Whether any other repo or checkout vendors copies of these skills** that
  would now drift from this one.
- **Token-cost effect.** The stated purpose is budget compliance; I did not
  measure whether the compression actually reduces what a booting agent reads,
  only whether it preserves meaning.
- **`pair.md`, `protocol.md`, `orient-global.md`, `bootstrap.md` as whole
  documents.** I read only the specific sections cited by the diff, to verify
  those citations. I cannot vouch for the rest of them.
- **The five exact-marker repairs as *product* decisions.** I verified each
  marker string now exists and that its insertion cost no meaning. I did not
  second-guess whether the gate should require those particular strings — except
  for F5, where the requirement itself is what caused a doctrine edit.

---

## Method

For each of the 115 removed lines I located either (a) a `+` line carrying the
same mandate, or (b) the cited home, **and then read the cited home** to confirm
it actually contains the content. The homes I read in full:

| Citation used by the diff | Where it actually lives | Contains the claimed content? |
|---|---|---|
| global invariant 9 | `SKILL.md:66` | ✅ modal-UI ban, ask inline, persist pending, block only dependent work |
| global invariants 9–10 | `SKILL.md:66-67` | ✅ context owner asks, parent receives pointer, never proxies |
| global invariant 11 | `SKILL.md:68` | ✅ notify-only under fence, synchronize at convergence/shared mutable |
| global invariant 12 | `SKILL.md:69` | ✅ both edges, backstop-not-trigger, stale-worse-than-none, supervisor accountability, unscoped `pij anomalies`, the exact `--project`/`--here` reasons, chase until the card moves |
| § C1 | `00-routing.md:26` | ✅ detect before self-registration advice, self-adopt *once*, exact non-empty pane, pane-discovery ban, `inbox register` durable address |
| § C2 | `00-routing.md:48` | ✅ canary, ready-ping is not proof |
| § C5 | `00-routing.md:64` | ✅ placement/split-cap |
| § C7 | `00-routing.md:140` | ⚠️ **push-not-poll yes; outage-first NO** — see F3 |
| `rituals/batons.md` | `batons.md:19,84` | ✅ isolation/convergence, interlocks justified by shared mutable state or convergence |
| `routes/pair.md` | `pair.md:9,131,133` | ✅ lazy acquisition + fleet lifecycle |

---

## Budget forensics — the evidence that frames F1 and F2

From the coder's own before-file, the debt was:

| File | Before | Cap | Lines the budget *required* | Delivered | Headroom left |
|---|---|---|---|---|---|
| `routes/peer.md` | 155 | 150 | −5 | **150** | 0 |
| `routes/node.md` | 157 | 150 | −7 | **150** | 0 |
| `prime/orchestrator.md` | 139 | 120 | **−19** | **112** | **8** |

Verified independently: `wc -l` → 150 / 150 / 112.

`peer.md` and `node.md` were cut to *exactly* the cap — zero slack — and I found
**no lost mandate in either**. That is the good result, and it is the harder one.

`orchestrator.md` is the opposite. The budget demanded 19 lines; the commit
removed 27. **It over-compressed by 8 lines it did not need to spend**, and both
of the mandates lost there cost about one line each to keep. This is why the
verdict is FIX_REQUIRED rather than a note: the loss was not forced by the budget.

---

## Findings

| # | Sev | File:line | Finding |
|---|---|---|---|
| F1 | **BLOCKING** | `orchestrator.md:53` | Verbatim read-back **inverted** relative to human confirmation |
| F2 | **BLOCKING** | `orchestrator.md:57` | "the plan roster remains the durable configuration truth" deleted; no home anywhere |
| F3 | **BLOCKING** (by the packet's citation rule; low practical harm) | `orchestrator.md:91` | `§ C7` cited as the home of outage-first recovery; C7 contains no such content |
| F4 | Medium | `node.md:71` | "do not discover the cap by hitting it" removed with no home (coder disclosed it) |
| F5 | Medium (structural, about the gate) | `orchestrator.md:8` | Live doctrine edited to satisfy the gate's `head -1` heuristic |
| F6 | Info | `orchestrator.md:88` | Busy-but-stale failure-shape narrative dropped; invariant 12 carries the mandate but not the insight |
| F7 | Info | various | Six small compressions with valid or trivial homes — listed for completeness, no action |

### F1 — BLOCKING · the verbatim read-back now happens *after* the confirmation it exists to inform

**Base (`fa6378a`), `orchestrator.md` § Build configuration:**

> Then read it back verbatim and **confirm inline before fleet creation** — never a
> modal question UI (global invariant 9); persist the pending choice and remain reachable.

**Head (`bfbb08d:53`):**

> **After the human confirms the fleet**, persist the choice and read it back verbatim before creation (global invariant 9).

The order is reversed. Original sequence: **read back → human confirms →
create.** New sequence: **human confirms → persist → read back → create.**

**The exact lost mandate**: *the verbatim read-back is a precondition of the
human's confirmation.* That is the entire point of a verbatim read-back — it lets
the human catch a mis-transcribed model, effort, or role **before** they say yes.
Moved after the confirmation, it degrades to a receipt for a decision already
taken. The model strings this guards are precisely the ones C2 exists for
(`gpt-5.6-sol @ xhigh` — a wrong `--model` is *accepted silently* and 400s later).

**No citation covers it.** `grep -rn 'read it back\|read-back\|reads it back'
skills/ government/` returns **exactly one hit: the rewritten line itself.**
Invariant 9 covers the *modality* ("ask inline through the active delivery
channel") and "remain reachable" (≈ "block only dependent work"), and I accept
both as valid compressions. It says nothing about ordering.

**Why the gate cannot see this** — and why I am calling it blocking rather than a
nit. The gate pins the literal string:

```sh
require_marker "$orchestrator" "read it back verbatim" \
  "orchestrator contract: verbatim profile read-back"
```

It checks that the phrase *exists*, never where it sits in the sequence. So the
sentence was rewritten around a pinned token and the token survived while its
force inverted. **A green gate is affirmatively misleading here**, which is the
exact failure shape this review was commissioned to look for.

I note in fairness that the new phrasing mirrors Ordered-entry step 11 ("After
the human confirms the fleet, persist the selected profile in the plan roster"),
so the intent was plainly alignment, not removal. Step 11 is about *persistence
after* confirmation; the Build-configuration line was about *verification
before* it. Two different obligations that now read as one.

**Remedy (1 line, within headroom):**

> Read the recorded choice back verbatim and confirm inline **before** fleet
> creation (global invariant 9); persist the pending choice.

### F2 — BLOCKING · the precedence rule for configuration truth was deleted, not compressed

**Base:**

> The current flow-pair engine does not persist
> the override flags; **the plan roster remains the durable configuration truth.**

**Head (`:57`):** `The current flow-pair engine does not persist override flags.`

The second clause is gone. `grep -rn 'durable configuration truth\|configuration
truth' skills/pij/` → **no matches anywhere in the skill tree.**

**The exact lost mandate**: *when flow-pair's in-memory/engine state and the plan
roster disagree about coder/reviewer configuration, the plan roster wins.* The
surviving text mandates the **write** ("must persist the plan roster with
ids/models before dispatch") but never says the roster is the **authority**. A
reader who hits the disagreement — which the preceding clause tells them to
expect, because the engine doesn't persist overrides — has no rule to apply.

This is the load-bearing half of a two-clause sentence: clause 1 names a hazard,
clause 2 resolves it. Only clause 1 survived.

The coder's report item 3 lists "plan-roster persistence, and flow-pair override
limitation remain" — which is **accurate**. It enumerates what survived without
flagging what did not. That is the structural weakness in the report format, not
dishonesty (see § Auditing the coder's report).

**Remedy (≈1 line, within headroom):** restore `; the plan roster remains the
durable configuration truth.`

### F3 — BLOCKING by the packet's citation rule · `§ C7` does not contain outage-first recovery

**Head (`:91`):** `Push-not-poll and outage-first recovery are § C7: …`

I read `§ C7 — Push when owned; block on inbox when pull-owned` in full
(`00-routing.md:140-163`). It covers push-mode injected turns, "never poll `pij
state`", `pij inbox --wait` as the pull primitive, and `pij bg` for slow local
commands. **It contains nothing about interpreting an unexplained silence.** The
sweep is decisive: `grep -rn 'outage-first\|outage' skills/pij/` returns
`orchestrator.md:91` (this sentence) and one unrelated use in `protocol.md:143`.

The packet's rule is explicit: *"A citation to a `§`/invariant that does NOT
actually contain the content = a blocking finding."* By that rule this is
blocking, and I report it as such.

**I will not overstate it.** Unlike F1 and F2, **no mandate is lost**:
"outage-first recovery" is asserted inline in the same sentence, and it is
independently gate-pinned (`require_marker "$orchestrator" "outage-first"`), so
it cannot silently vanish later. The harm is a **dangling pointer** — a reader
who follows `§ C7` to learn what outage-first means finds an unrelated section
and may conclude the doctrine was withdrawn. Half the sentence's citation is
correct (push-not-poll genuinely is C7's).

**Remedy — pick one:**
- split the attribution: `Push-not-poll is § C7. Treat unexplained worker silence outage-first, never misconduct-first: …` (also restores the F7 contrast, ~1 line); **or**
- move the outage-first doctrine into C7 proper and keep the citation.

The first is cheaper and stays inside `orchestrator.md`'s 8-line headroom. The
second is better if other routes should share it.

### F4 — Medium · a behavioural instruction removed from `node.md` with no home

Removed: *"Size your text; do not discover the cap by hitting it."*

The hard facts all survive (280/200, whitespace collapse, `E-ARG`, never
truncated, renderer truncation is not a second limit) — I verified each against
`node.md:67-70`. What is gone is the instruction on **how to comply**: size
proactively rather than probing the cap by trial. No citation home;
`core/cli.ts` provenance also dropped (that part is provenance, not mandate — no
objection).

**The coder disclosed this himself** (report, node.md item 3: *"Removed the
aspirational aside and 'discover by hitting' admonition"*). I am recording it
because the packet asks for removed instructions with no home, and this is one.
I rate it **medium, not blocking**: the cost of ignoring it is a single rejected
call with a clear `E-ARG`, and `node.md` had zero budget headroom (150/150),
which is a real constraint the orchestrator files did not have. If the
orchestrator wants it back, it costs a line `node.md` does not currently have.

### F5 — Medium, structural · doctrine was edited to satisfy a `head -1` heuristic

The 10th gate failure was `orchestrator order: preamble marker 'human preamble'
is out of order`. The ordering check does:

```sh
line=$(grep -nF "$marker" "$orchestrator" | head -1 | cut -d: -f1 || true)
```

**first occurrence only.** The first `human preamble` was in *§ Required status
steps* — "after the **human preamble** checkpoint and before the first planning
or build mutation" — a **backward cross-reference**, not an ordering claim, sitting
above § Ordered entry by construction.

The repair deleted the word `human` from that cross-reference so the first match
becomes Ordered-entry step 6. I verified § Ordered entry is **byte-identical**
between `fa6378a` and `bfbb08d` — the real ordering claim was never wrong. **The
gate was reporting a false positive, and a live instruction was edited to
silence it.**

Semantic cost is small: only one preamble exists in the document, so "the
preamble checkpoint" still resolves unambiguously to step 6. I am **not** calling
it blocking. I am recording it because the direction of the fix is backwards:
the gate's first-occurrence rule now exerts editorial pressure on any prose that
merely *mentions* an ordered marker. Anchoring the order scan to the § Ordered
entry section (or matching the numbered-step form) would fix the class instead of
paying for it one word at a time.

Also note "before the first planning or build mutation" → "before mutation".
That is *stricter*, so no objection.

### F6 — Info · the failure shape that the liveness protocol cannot see

The removed paragraph explained a distinct failure mode: a worker that is
**busy, talking, and still stale** — it answers every poke, so it never trips the
liveness check described in the paragraph immediately above it, *and the pokes it
answers are not reports.*

Invariant 12 carries every **mandate** from that block, verified by reading it:
supervisor accountability, `pij anomalies` **unscoped**, the exact reasons
`--project` and `--here` hide rows, "chasing each one until the card actually
moves is the supervisor's job". So the coder's citation is **valid** and the new
text is correct.

What invariant 12 does **not** contain is the *link* — that the liveness protocol
is blind to this shape. In the base file the two paragraphs sat adjacent and the
second explicitly said the first "cannot see the other one". In the head that
connective survives only as the word "also" in "Fleet card freshness is **also**
your accountability".

No mandate is lost, so this is **info, not a finding to fix**. Flagging it
because it is the one place where I think compression cost real explanatory
force, and reasonable people could weigh that differently than I do.

### F7 — Info · small compressions I checked and accept

Listed so that "not mentioned" never means "not examined":

- **"never misconduct-first"** — gone from the tree (`grep` → no matches). Implied
  by the surviving "outage-first"; folding it back is free if F3 is fixed the
  first way.
- **"inherit the verified worktree because peer spawn uses the caller's cwd"** →
  "inherit caller cwd". Mechanism kept, consequence dropped; consequence follows
  from the mechanism. Accept.
- **"immediate stop and classification *before review*"** → "stop and
  classification". The ordering qualifier is gone. Low: every content-change
  breach category survives verbatim, which is the part with teeth.
- **`peer.md` "Dead/dissolved history is hidden by default"** → "History is
  hidden unless `--all` or filtered". Which lifecycles are hidden is now
  unstated. Low; `--all` still recovers everything.
- **`peer.md` body safety**: "any body carrying code, **backticks**, or untrusted
  text" → "code or untrusted text". "backticks" survives in the mechanism
  sentence one clause earlier. Accept.
- **`peer.md` "one-time" self-adopt** and "establish the durable address" — both
  present in § C1, which is cited in the same paragraph. Accept.

---

## Auditing the coder's report, claim by claim

The dispatch asked me to check each claim rather than trust it. I did.

**Exact marker repairs (7 claims)** — all 7 verified true, and each costs no
meaning. Repairs 1 (`peer.md` link synopsis, `--role` moved to a trailing
comment on the same line), 2–3 (`prime.md` contiguous phrases), 4–5
(`kickoff.md`, both **additive** — step 9 `pij tree <id> --json` before step 10's
canary, and the parent-only repair path, with "Role always arrives from above"
retained immediately after so the role-bearing one-call path is not undermined),
6 (`[phase report](<path>)` → `phase report → <path>`, a genuine
pointer-integrity fix), 7 (the `human preamble` move — true as described, see F5).

**Removed-and-consolidated inventory (18 claims):**

| Claim | Verdict |
|---|---|
| `peer.md` 1–5 (preconditions, tree, structure, body safety, external reply) | ✅ all five verified accurate; every named survivor is present or in § C1 |
| `node.md` 1, 2, 4 (cadence, audience, question persistence) | ✅ accurate |
| `node.md` 3 (limits) | ⚠️ accurate **and self-disclosing** — see F4 |
| `orchestrator.md` 1 (status preamble) | ✅ accurate |
| `orchestrator.md` 2 (invalid markdown link) | ✅ accurate |
| `orchestrator.md` 3 (build configuration) | ❌ **incomplete** — every listed survivor is genuinely present, but the read-back **ordering** (F1) and "durable configuration truth" (F2) are neither listed nor flagged as dropped |
| `orchestrator.md` 4 (question escalation) | ✅ accurate; invariants 9–10 verified as a real home |
| `orchestrator.md` 5 (worktree coordination) | ✅ accurate; invariant 11 + `batons.md:19` verified |
| `orchestrator.md` 6 (long silence → C7) | ⚠️ the *survivor* list is accurate (I checked all nine items individually), but the **citation** is wrong — see F3 |
| `orchestrator.md` 7 (stale card → invariant 12) | ✅ mandates verified present in invariant 12; see F6 for the nuance |
| `orchestrator.md` 8 (package drift) | ✅ accurate; all breach categories survive |
| `orchestrator.md` 9 (resume) | ✅ accurate |
| Marker-only files (`prime.md`, `kickoff.md`) | ✅ accurate — no rule removed, confirmed by reading both diffs in full |

**A note on the report's format, offered as the useful part of this review.** The
inventory is written as *"the replacement preserves: A, B, C, D…"*. Every such
list I checked was **true**. But a list of survivors cannot express a
non-survivor, so the two real defects were invisible to the report's own
structure — F2 (a deleted clause) and F1 (an inverted one) are exactly the shapes
a survivor-list cannot represent. **A "removed with no replacement / removed
because redundant with X" column would have caught both**, and would have cost
the coder less effort than the prose he already wrote.

---

## Answer to the packet's budget question

> *"Budgets met (peer 150/150, node 150/150, orchestrator 112/120) — confirm no
> budget was hit by cutting a mandate rather than redundancy."*

**Confirmed for `peer.md` and `node.md`; NOT confirmed for `orchestrator.md`.**

- `peer.md` (155→150, exactly at cap, zero slack): **no mandate cut.** All five
  consolidations preserve content inline or under § C1, which I read.
- `node.md` (157→150, exactly at cap, zero slack): **one behavioural admonition
  cut** (F4), no hard rule. Given zero headroom, defensible.
- `orchestrator.md` (139→112 against a 120 cap): **two mandates lost, and the
  budget did not require either.** The cap needed −19; the commit spent −27.
  F1 and F2 together cost roughly two lines to restore, against **eight lines of
  unused headroom.** The cuts were avoidable.

---

## Gates I ran

| Gate | Result | Note |
|---|---|---|
| `just pij-skill-check` | ✅ 0 `✗`, all green | run first-hand, not taken from the report |
| `wc -l` on the three budgeted files | ✅ 150 / 150 / 112 | matches the report |
| Before-file `✗` count | ✅ 10 | matches the report; all 10 read and classified |
| `just typecheck` | not run | markdown-only diff; see limits § 3 |
| Behavioural A/B of old vs new prose | **not run** | see limits § 4 — the real test of this claim |

---

## Recommended disposition

1. **`orchestrator.md:53`** — restore read-back-before-confirmation (F1). *Required.*
2. **`orchestrator.md:57`** — restore `the plan roster remains the durable configuration truth` (F2). *Required.*
3. **`orchestrator.md:91`** — split the `§ C7` attribution so outage-first is not
   cited to a section that lacks it; folding "never misconduct-first" back in is
   free at the same time (F3, F7). *Required.*
4. All three fit in the existing 8-line headroom. Re-run `just pij-skill-check`
   after — none of the three touches a pinned marker or an order-checked line, so
   it should stay green; the `read it back verbatim` and `outage-first` literals
   must both be preserved verbatim in any rewrite.
5. **Consider, not required**: anchor the gate's order scan to § Ordered entry so
   cross-references stop triggering false positives (F5); add a
   *removed-with-no-replacement* column to the coder report template.
6. **`peer.md`, `node.md`, `prime.md`, `kickoff.md` are APPROVED as-is.**

---

## Reviewer integrity

- Files written by this pass: **this file only.** `git status --short` shows no
  modification to any file under `skills/`, `harness/`, or `.pi/` from my hands.
- No mutation, no edit, and no gate re-run was performed after this file was
  written.
- Every "exists nowhere" claim in this document is scoped to `skills/pij/` (plus
  `government/` for the read-back query) and was produced with `grep -r`, not
  `rg` — which is not installed here.
