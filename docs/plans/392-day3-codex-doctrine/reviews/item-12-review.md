# Cold review — item 12 (R2 / R3 / R4 / R6 + NIT-1)

> **TERMINAL REPORT.** This pass is CLOSED. No mutations were run after reporting, and no
> further pass is open on this side. Everything below was verified first-hand in a throwaway
> tree; nothing is taken from the coder's report on trust.

**Reviewer**: `pij-wilful-morton` (GitHub Copilot CLI / Claude Opus 5)
**Commit under review**: `a0ea1332c741ba204984a2bbbf38881fb90667d1` — *fix(harness): complete pij skill check hardening*
**Verdict**: ✅ **APPROVE** — land it. One non-blocking advisory (**ADV-2**, with a verified fix) and four informational notes.

---

## 1. Scaffolding, method, and limits — stated before any finding

**What I built.** A detached throwaway worktree at `a0ea133`:

```
git -C ~/GitHub/pij worktree add --detach /tmp/pij-12-cold a0ea133
ln -s ~/GitHub/pij/node_modules /tmp/pij-12-cold/node_modules
```

**Limit of that rig**: `node_modules` is a **symlink to the main checkout's**, not a clean
`npm ci`. Any lockfile drift introduced by this branch is therefore **invisible to my test
runs**. This commit touches no manifest, so I judge the risk nil — but I did not prove it.

**How I did Dim-0 without touching a repo file.** The checker honours `PIJ_SKILL_ROOT`, so
I replicated the test harness's fixture shape (`<root>/nested/skills/pij` plus the linked
`docs/how/pij-team-scaffold.md`) and mutated **copies**. I then generated four variants of
the checker, each with **exactly one** of R2/R3/R4/R6 reverted to its pre-`a0ea133` form
(each anchor asserted unique before patching; all four `bash -n` clean).

**Control run — the step that makes every result below attributable.** Each reverted variant
was first run against **canonical** doctrine:

| variant | canonical exit | ✗ |
|---|---|---|
| `no-r2` | 0 | 0 |
| `no-r3` | 0 | 0 |
| `no-r4` | 0 | 0 |
| `no-r6` | 0 | 0 |

So a revert alone never breaks anything. Any failure I report is caused by the *mutation*,
and any mutant that *passes* under a revert proves that rule is load-bearing.

**Side effects I caused, disclosed.**
- Created and removed `/tmp/pij-12-cold` (+ its `node_modules` symlink) and `/tmp/dim0/`.
- Temporarily copied a candidate fix over `pij-skill-check.sh` **inside the throwaway tree
  only**, to test drop-in compatibility; restored immediately, `git status` verified clean.
- Ran a **trial merge** with `origin/main` in the throwaway tree; `git merge --abort`ed,
  verified back at `a0ea133` and clean.
- **The reviewed worktree was never mutated.** The only file I wrote anywhere is this review.

**Base correction (worth the o-prime's attention).** The packet states *Base: main
`f4ba6ec0`*. That is **not** this commit's base — `f4ba6ec0` is **not an ancestor** of
`a0ea133`. The true merge-base is **`9912bf8`** (the PR #10 merge, which is where R5 landed).
Main additionally carries `bedd658` + `f4ba6ec0` (PR #11), which this branch does **not**
contain. This turned out to be harmless — see §7 — but the packet's base claim is inaccurate
as written, and I did not want that to pass silently.

---

## 2. R6 — the placeholder-vs-real boundary (closes my ADV-1)

**The rule as implemented.** Pointy handling was moved to run *before* the fragment strip,
and classifies by shape:

```sh
'<'*'>')
  pointy_target=${target#<}; pointy_target=${pointy_target%>}
  case "$pointy_target" in
    */*|*.*) target=$pointy_target ;;   # real path -> unwrap and check
    *) continue ;;                      # simple <placeholder> -> skip
  esac
```

i.e. **contains `/` or `.` → real path; otherwise → placeholder.**

**Dim-0.** Fixture `fails a bracketed pointy link whose target is a real missing path`:

| | exit | output |
|---|---|---|
| with R6 | **1** | `✗ prime pointer: …orchestrator.md → ./does-not-exist.md is missing` |
| without R6 (R5 only) | **0** | *(silently skipped)* |

**Non-vacuous, and it is exactly my ADV-1.** Confirmed closed.

**Boundary probe** — the packet asked specifically about `<foo.md>` (no slash) and `<a/b>`
(no extension). I probed twelve shapes in one run:

| target | classified | correct? |
|---|---|---|
| `<path>` | placeholder → skip | ✅ R5 behaviour preserved |
| `<placeholder>`, `<seat-handover>` | placeholder → skip | ✅ |
| `<zzz-noslash-hasext.md>` | **real** → checked, errored | ✅ *answers the packet* |
| `<zzz-hasslash/noext>` | **real** → checked, errored | ✅ *answers the packet* |
| `<./zzz-real-missing.md>` | real → checked, errored | ✅ |
| `<a.b>` | real → checked, errored | ✅ correct by the rule |
| `<./templates/seat-handover.md>` | real → checked, **exists, passed** | ✅ proves it validates, not just errors |
| `<https://example.com>` | unwrapped → URL arm → skip | ✅ |
| `<mailto:x@y.com>` | unwrapped → mailto arm → skip | ✅ |
| `<>` | placeholder → skip | ✅ harmless |
| `<zzz-frag#sec>` | placeholder → skip | ⚠️ see **INFO-1** |

The discrimination is sound. Note the `<./templates/seat-handover.md>` row: a real pointy
path that **exists** passes silently — so R6 genuinely *validates* real paths rather than
merely rejecting every unwrapped target.

**Blast radius on live doctrine: zero.** Every `](<…>)` construct in `skills/`:

```
skills/pij/references/routes/pair.md:58     ](<path>)
skills/pij/references/prime/orchestrator.md:19  ](<path>)
```

Both are simple placeholders, both still skip, and only `orchestrator.md` is inside the scan
set (`routes/prime.md` + the 17 `references/prime/**/*.md`). **No live construct changes
classification.** (Remaining repo hits are in `docs/` — including my own item-9-FX review —
all outside the scan set.)

---

## 3. R2 — order anchor scoped to the numbered step

`marker_position` now runs against `profile_step=$(… | grep -E '^11\. ')` instead of the whole
`## Ordered entry` slice.

**Dim-0** — fixture `rejects an inverted step 11 despite an in-section read-back decoy`:

| | exit | result |
|---|---|---|
| with R2 | **1** | `✗ orchestrator order: read-back precondition is out of order` |
| without R2 | **0** | **mutant slips through** |

Load-bearing, cleanly proven. The decoy line placed earlier in the section is what supplies
the false `readback_pos` under the old code; scoping to step 11 removes that.

**Brittleness — I probed the coder's stated tradeoff rather than accepting it.** R2
hard-codes the step number and assumes step 11 is one line. Both degrade **fail-closed**:

| perturbation | exit | diagnostic |
|---|---|---|
| renumber `11.` → `11a.` | **1** | `✗ orchestrator order: read-back precondition marker is missing` |
| reflow step 11 onto two lines | **1** | `✗ …marker is missing` |

Neither silently passes, and the message is accurate. The coder's "brittle but fail-closed"
characterisation is **verified true**, not merely asserted. Accepted.

---

## 4. R3 — Build-config literal pin

**Dim-0** — fixture `fails when Build configuration moves read-back after fleet confirmation`:

| | exit | result |
|---|---|---|
| with R3 | **1** | `✗ orchestrator pair config: read-back before fleet creation — missing '…'` |
| without R3 | **0** | **inversion slips through** |

This is the best-designed fixture in the set. Its mutant **deliberately retains** the older
`"read it back verbatim"` marker — I confirmed that marker still reports `✓` on the mutant —
so the fixture proves the *new, longer* literal is the only thing catching the inversion.
The packet's acceptance criterion ("inverting ONLY the Build-config read-back clause now
FAILS") is **met**.

I also confirmed the literal is **unique** in the file (line 53, inside `## Build
configuration`), so the whole-file pin does today land on the intended clause.

### ADV-2 (new, non-blocking) — R3 is decoy-vulnerable, the one class this item exists to close

R2 and R4 were both narrowed *specifically because* whole-file/whole-section marker lookups
can be satisfied by a decoy elsewhere. **R3 was implemented as a whole-file `require_marker`
and inherits exactly that weakness.** Proven, not theorised — invert the Build-config clause
*and* plant the same sentence under `## Packaging and review law`:

```
exit=0
✓ orchestrator pair config: read-back before fleet creation
*** NO FAILURES — the Build-config inversion SLIPS THROUGH when a decoy exists elsewhere ***
```

The doctrine is now wrong and the gate is fully green.

**Why this is an advisory and not a blocker**: the packet's stated criterion is the direct
inversion, which R3 does catch; live doctrine is correct; and there is no decoy today. But
R3 is *structurally weaker than its siblings* in the very pass whose purpose was decoy
resistance, so it is worth closing while the context is warm.

**Verified fix** (one hunk, reusing the existing `section` helper):

```sh
  build_config=$(section "$orchestrator" "## Build configuration")
  if printf '%s\n' "$build_config" | grep -Fq "read it back verbatim and confirm inline before fleet creation"; then
    ok "orchestrator pair config: read-back before fleet creation"
  else
    err "orchestrator pair config: read-back before fleet creation — missing in ## Build configuration"
  fi
```

I did not merely suggest this — I ran it:

- canonical tree → **exit 0, 0 ✗** (no spurious failure);
- the decoy mutant above → **exit 1**, `✗ … — missing in ## Build configuration`;
- **drop-in**: with the fix applied, all **9/9** existing `pij-skill-check.test.ts` tests pass
  (the existing fixture's `toContain("missing")` assertion still matches).

---

## 5. R4 — second pair-order loop scoped to `## Ordered entry`

**The coder's call is correct, and I checked the premise rather than the outcome.** All four
pair-order markers genuinely live inside `## Ordered entry` (file lines 26–47):

| marker | line | in section? |
|---|---|---|
| `After the human confirms the fleet` | 40 | ✅ |
| `--coder-model <confirmed>` | 41 | ✅ |
| `--reviewer-model <confirmed>` | 41 | ✅ |
| `Delegate each whole phase` | 42 | ✅ |

So section-scoping is not merely "consistent with the first loop" — it is the **semantically
correct** scope, because these markers *are* ordered-entry steps 11–13.

**Dim-0** — fixture `scopes pair order to Ordered entry instead of an outside fallback`
(marker removed from step 11, planted in Build config):

| | exit | pair-order output |
|---|---|---|
| with R4 | 1 | `✗ missing human confirmation marker` + 3 ✓ |
| without R4 | 1 | `✓ human confirmation` *(falsely resolved from line 53)* + **3 spurious** `✗ … is out of order` |

R4 converts *one false pass plus three spurious errors* into **one accurate error**. That is
a real improvement in diagnostic quality.

⚠️ **Note on this fixture's discriminating power** (INFO-5): **both** variants exit 1. The
entire discrimination rests on the three `expect(...).not.toContain("… is out of order")`
assertions. They are doing real work — if someone later trims them as noise, the fixture
becomes vacuous while still appearing to pass. Worth a comment in the test.

**No spurious failure on correct doctrine**: covered by `it("passes correct canonical order
despite a backward human-preamble cross-reference")`, which asserts `status === 0` against the
real copied skill tree, plus the live `just pij-skill-check` run in §7.

---

## 6. NIT-1 — peer.md

**Purpose achieved.** My original concern was that the full-flags `pij adopt …` parenthetical
sat *immediately after* four consecutive external-pull prohibitions, risking an LLM reading
the adopt command as the resolution of the ban. The Preconditions paragraph now **ends** on
the ban run, and the flags moved to `**Tmux push identity**` — directly above the push code
block that already demonstrates `pij adopt`. That is the semantically right home.

Residual (unavoidable): Preconditions still contains the *minimal* `pij adopt "$TMUX_PANE"
--harness <h>` form — but that exact sentence is **test-pinned** by `cli.integration`, so it
must stay. NIT-1 went as far as it could without breaking a pin.

**Line budget holds, and I proved nothing was smuggled**:

| | lines | chars |
|---|---|---|
| `9912bf8` (base) | 146 | 9281 |
| `a0ea133` | **146** | 9269 |

Gate confirms: `✓ budget: skills/pij/references/routes/peer.md (146/150)`.

Arithmetic cross-check: removed fragment 133 cp, added 119 cp → predicted **−14** codepoints;
actual **−14** (−12 bytes, the 2-byte difference being the added em-dash). And decisively:

> **after removing both fragments, the rest of the file is byte-identical** → the *only*
> change to peer.md is that one parenthetical moving.

**Nothing pins the moved string or its position**: `cli.integration.test.ts` is the only test
referencing `routes/peer.md`, and no test file anywhere pins `session-id <native-id>`. All
four `externalPullBan` clauses remain present and pass.

---

## 7. Gates — run first-hand

| gate | result |
|---|---|
| `just pij-skill-check` | **exit 0 — 195 ✓ / 0 ✗** |
| `pij-skill-check.test.ts` + `cli.integration.test.ts` + `acceptance-sweep.test.ts` | **3 files passed — 125 passed / 1 skipped** (164.8s) |

The ✓ count moves **194 → 195**, and I verified the delta is *exactly* the one new R3 check
(running the `no-r3` variant on canonical doctrine yields 194). Nothing else was added or
silently lost.

**Trial merge (not asked for; the base divergence made it necessary).** Since `a0ea133` does
not contain PR #11, I merged current `origin/main` (`10483d8`) into it in the throwaway tree:

- **clean merge**, zero conflicts (no file overlap: main-only commits touch `daemon*`,
  `adapters/`, `docs/how/pij.md` — none touch `pij-skill-check*` or `peer.md`);
- gate on the **merged** tree: **exit 0, 195 ✓ / 0 ✗**;
- checker tests on the merged tree: **9/9**.

So the divergence in §1 is real but benign. Merge aborted; tree restored.

**On the coder's disclosed full-gate blocker — verified honest.** `just lint` does fail
(9 errors / 11 warnings / 505 files). I scoped it: every diagnostic is in
`producers/`, `core/models/`, `adapters/`, `skills/flow-pair/test/`, or `biome.json`.
**None of `a0ea133`'s four changed files appear**, and Biome on the changed surface is clean.
The red is **pre-existing and outside the item-12 fence**. The report's `PARTIAL` /
"cannot claim `gatesClean: true`" framing is accurate rather than evasive.

---

## 8. Findings

| id | severity | finding |
|---|---|---|
| **ADV-2** | Low / latent — **non-blocking** | R3's whole-file `require_marker` is decoy-vulnerable: inverting the Build-config clause while planting the literal elsewhere leaves the gate **green**. Same bypass class R2/R4 exist to close. Verified one-hunk fix supplied above (green on canonical, catches the decoy, 9/9 tests still pass). |
| **INFO-1** | Informational | R6 classifies *before* the fragment strip, so `<a#b>` (fragment, but no `/` or `.`) is now **skipped**. Under R5 it errored — but with the garbage diagnostic `→ <a is missing`, since the strip had already mangled it. So this is a *better* diagnostic and a *slightly looser* check. Zero corpus instances. Ideal would be strip-then-classify. |
| **INFO-2** | Informational | R2 hard-codes `^11\. ` and assumes a single-line step. Both renumbering and reflowing degrade **fail-closed** with an accurate "marker is missing" (probed). Accepted tradeoff, correctly documented by the coder. |
| **INFO-3** | Cosmetic | `require_marker "read it back verbatim"` is now strictly **subsumed** by R3's longer literal (both match only line 53) — it can never fail while R3 passes. Harmless, but it is now a redundant ✓. |
| **INFO-4** | Cosmetic | R4's ordering is **line**-granular while R2's is **column**-granular; `--coder-model`/`--reviewer-model` share line 41, so their relative order is unchecked. Semantically harmless (flag order is irrelevant) — noted only so the asymmetry isn't mistaken for coverage. |
| **INFO-5** | Informational | The R4 fixture exits 1 both with and without R4; its `not.toContain` assertions carry **all** the discrimination. Trimming them would silently vacuate the test. |

No blocking findings. No correctness defect found in R2, R3, R4, R6, or NIT-1 as shipped.

---

## 9. What I did **not** examine

Listed so an unexamined item never reads as a clean one.

- **`harness checks`, `just self-check`, `just smoke`, `just typecheck`, the full vitest
  suite** — not run. I ran `just lint` only far enough to *scope* the coder's disclosure.
- **`windows-compat`** — not run; the coder reports it red repo-wide. Unverified either way.
- **Clean-dependency install** — my `node_modules` is the main checkout's (see §1).
- **The other 46 files** in the branch-vs-main diff (items 10a/11, docs, reports). Out of
  fence; I reviewed only `a0ea133`.
- **Whether ADV-2's fix should actually land**, and whether INFO-1's strip-then-classify
  refinement is wanted — those are the o-prime's calls, not mine.
- **Rendered-Markdown behaviour** of the moved peer.md line — I verified text and byte
  identity, not how a renderer displays the em-dash construct.

My evidence supports **"`a0ea133` correctly implements R2/R3/R4/R6/NIT-1 and merges clean and
green with today's main"**. It does **not** support "the repository is green" — it is not,
for pre-existing reasons outside this fence.

---

## 10. Verdict

✅ **APPROVE — land `a0ea133`.**

Every rule the packet named is implemented, and every new fixture is non-vacuous under
single-rule reversion (R2 and R6 mutants pass without their rule; R3's mutant passes without
its rule *and* keeps the old marker green; R4's discriminates on diagnosis, §5). The
placeholder-vs-real boundary is sound in both directions and has zero blast radius on live
doctrine. NIT-1 is byte-provably a pure move that holds 146/150. Gates are green at
195 ✓ / 0 ✗ and 125 passed / 1 skipped, and green again after a clean trial merge with main.

**ADV-2 is the one thing I'd want folded in** — ideally now, since it is a five-line change to
the file already open, it is drop-in against the existing tests, and it closes the last
instance of the exact bypass class this item was created to eliminate. It does not block
merging.
