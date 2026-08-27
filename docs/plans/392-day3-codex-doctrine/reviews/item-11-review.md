# Cold review — item 11 (pij-skill-check order-check fix + R1)

> **TERMINAL REPORT.** This pass is CLOSED. No mutations were performed after this
> file was written. Every experiment below was reverted byte-identically *before*
> writing, with sha256 proof recorded in § Scaffolding.

**Reviewer**: pij-joint-nightingale (cold) · **Commit**: `f6d3734` (+ `609c596` report)
**Base for comparison**: `fa6378a` (doctrine base), `bfbb08d` (the defect), `346c19f` (the item-9 fix)
**Packet**: `reviews/item-11-review-packet.md` · **C10**

---

## Verdict

**`APPROVED`** — merge `f6d3734` + `609c596`.

The commit does what it claims. Req 1 is genuinely fixed, R1 genuinely has
back-pressure, and I proved the decisive point independently: **a faithful
reproduction of the actual historical defect — `bfbb08d`'s exact content at both
sites — is now RED.** That content passed this gate twice, in two prior review
passes. It no longer does.

The three tests are **non-vacuous**: I removed each guard in turn and each time
exactly one test, and only that test, went RED.

I am recording three **residual coverage limits** (R2, R3, R4). **None of them is a
regression** — before `f6d3734` there was no order assertion at all, so every one of
these mutants passed trivially. They are follow-up scope, in the same category as
the R1 finding that produced this item. I have **verified**, not merely proposed, a
four-line change that closes R2 (§ R2, "Prototype").

---

## Scaffolding, workarounds, and the limits of what I ran

State this first so nothing below reads as cleaner than it is.

**Files I mutated and restored.** Two, both inside the packet's fence:

| File | Backup | sha256 before | sha256 after |
|---|---|---|---|
| `harness/scripts/pij-skill-check.sh` | `/tmp/check.orig.sh` | `3e98dbbb…41b15d` | `3e98dbbb…41b15d` ✅ |
| `skills/pij/references/prime/orchestrator.md` | `/tmp/orch11.orig.md` | `e6633c33…d8520` | `e6633c33…d8520` ✅ |

`diff` of the before/after sha files is empty; `git status --short -- skills/ harness/ .pi/`
is empty; the real gate re-runs **194 ✓ / 0 ✗** and the suite re-runs **3/3** after restore.

**Blast radius I was working inside.** `~/.claude/skills/pij` symlinks to the **main**
checkout, not this worktree, so mutating this worktree's `skills/` could not affect
live seats. It does mean `f6d3734` goes machine-wide for every seat at merge.

**Workarounds.**
- `ripgrep` is not installed on this box. All "appears nowhere" statements below are
  scoped to a stated directory and were made with `grep -r`, which does traverse `.pi/`.
- I ran the gate as `bash harness/scripts/pij-skill-check.sh` rather than
  `just pij-skill-check` for the mutation loop (speed). I confirmed the recipe is
  exactly that one line (`justfile:223-224`), and I ran the real `just pij-skill-check`
  for the baseline.
- Multi-line markdown/shell mutation was done with Python heredocs, each with an
  `assert anchor in source`, so a silently-missed edit fails loudly instead of
  producing a false green.

**Limits of each reproduction.** Called out inline per finding, but the headline:
every mutant below was run against the **real** `skills/pij` via the real script.
None was run against a live orchestrator seat. **The one thing that would actually
prove semantic preservation — booting a seat on old vs. new prose and comparing
behaviour — was not run, and cannot be run by this gate.** That is the permanent
ceiling on this whole class of work, and it is why the decoy findings below matter
more than their severity suggests.

---

## What I did NOT adequately examine

- **`just test` in full.** I ran the changed suite (3/3) and `npm run typecheck`
  (clean). I did **not** run the whole 3600-test suite. Justification: I grepped for
  other tests touching either file — `grep -rln "pij-skill-check\|prime/orchestrator"
  --include='*.test.ts'` returns **exactly one** file, the new one. Still, this is an
  inference from a grep, not a suite run.
- **`just smoke` / `harness checks`.** Not run. Markdown + shell + one test file.
- **The other ~190 assertions in the gate.** I read the sections I mutated and the
  helper functions they call (`section`, `require_marker`, `require_order`). I did not
  audit the remaining checks; they are outside this packet.
- **`check_links` behaviour inside the fixture.** The test copies one linked guide
  (`docs/how/pij-team-scaffold.md`) into the fixture. I confirmed the tests pass, so
  link checking evidently resolves — but I did not verify that *every* link target is
  reachable inside the fixture, i.e. that link checking is not silently degraded
  there. Low risk, unexamined.
- **Whether `609c596`'s task/execution-log files are accurate.** I audited
  `reports/item-11-report.md` (below). I skimmed but did not verify
  `tasks/item-11-skillcheck-order-fix/execution.log.md`.

---

## Packet question 1 — Req 1: is the broken check fixed?

**YES.**

The journey loop's resolution changed from whole-file to section-scoped:

```diff
-    line=$(grep -nF "$marker" "$orchestrator" | head -1 | cut -d: -f1 || true)
+    line=$(printf '%s\n' "$ordered_entry" | grep -nF "$marker" | head -1 | cut -d: -f1 || true)
```

with `ordered_entry=$(section "$orchestrator" "## Ordered entry")`.

**Legit backward cross-reference now passes** — and this is not hypothetical. The F5
defect was that `orchestrator.md:10` says *"after the **human preamble** checkpoint"*,
which the old whole-file `head -1` resolved as the `preamble` journey marker at line
10, i.e. *before* `real invocation` at line ~37 → spurious failure. `f6d3734` restores
the word `human` to line 10 and the gate is green.

**Genuine journey inversion still fails** — test 3, and D3 below proves it is not vacuous.

**Can the scoping be fooled by a marker *outside* the section?** **No — proven, not
assumed.** Mutant **X1** (below) leaves `read it back verbatim` present at line 53, in
`## Build configuration`, i.e. *outside* the slice. The gate reported
`✗ … marker is missing`, not a pass. Two things follow: markers outside the section do
not leak in, **and** `section()`'s terminator (`found && /^##[#]? / { exit }`) genuinely
stops at `## Build configuration`. Both directions of the boundary are empirically
established.

**The `role` marker relocation is behaviour-preserving.** `role|You are a stream
orchestrator` moved out of the ordered loop into a standalone `require_marker`. This was
*necessary* — the role sentence lives at line 3, outside `## Ordered entry`, so under
scoping it would have reported `missing`. It costs no coverage: `role` was the **first**
entry in the loop with `previous=0`, and the comparison is `[ "$line" -lt "$previous" ]`,
i.e. `line -lt 0`, which is unsatisfiable for any line number. **`role` was always a
presence check wearing an order check's clothing.** The refactor makes that explicit.

---

## Packet question 2 — R1: does the new check have real back-pressure, and can it be bypassed?

### It has real back-pressure. Here is the decisive evidence.

The orchestrator's proof used a *synthetic* step-11 inversion. I wanted the **actual
historical defect**, so I first established what it was:

| revision | Ordered-entry step 11 | § Build configuration |
|---|---|---|
| `fa6378a` (base) | `11. After the human confirms the fleet, persist the selected profile in the plan roster.` | `Then read it back verbatim and confirm inline before fleet creation — never a …` |
| `bfbb08d` (**defect**) | *byte-identical to base* | `After the human confirms the fleet, persist the choice and read it back verbatim before creation …` |
| `346c19f` (fix) | `11. Read the selected profile back verbatim and confirm inline. After the human confirms the fleet, persist it in the plan roster.` | `Persist the pending choice and remain reachable; read it back verbatim and confirm inline before fleet creation …` |

**This matters and it is easy to get wrong.** At base, the read-back mandate did **not
live in § Ordered entry at all** — step 11 mentioned only fleet-confirm-then-persist.
The defect was purely in § Build configuration. `346c19f` is what *put* the mandate into
the ordered journey, which is the only reason a positional assertion is possible today.

**Mutant X1 — faithful reproduction of `bfbb08d`** (both sites restored to the exact
defective text):

```
✗ orchestrator order: read-back precondition marker is missing        EXIT=1
```

**The content that shipped as a defect, and survived two gate runs and two review
passes, is now caught.** That is R1 closed on its own terms. Note the arm: it fails via
`missing`, not `out of order`, because under `bfbb08d` the phrase was absent from the
section entirely. Both arms are live; the packet's synthetic mutant exercises the other.

*Limit of this reproduction*: X1 reproduces the defect's **text**, not its authoring
context. It does not prove a future author would produce that same shape.

### But it CAN be trivially bypassed. Confirmed — this was the packet's own hypothesis.

**R2 (residual, non-blocking) — one decoy line inside the section disarms the check.**

`marker_position` returns the **first** occurrence within the slice. So I added a single
plausible sentence to the section preamble and inverted the real step 11:

```
Run these steps in order. A later step never retroactively satisfies an earlier one.
Step 11 is where you read the profile back verbatim and confirm inline.      ← decoy
...
11. After the human confirms the fleet, persist it in the plan roster, then read the
    profile back verbatim and confirm inline.                                ← inverted
```

Result: **`EXIT=0`, zero `✗`. Full bypass.** (115 lines, still under the 120 budget, so
no confounding budget failure.)

This is not an adversarial contrivance. It is **the F5 bug relocated one level inward**.
The document *demonstrably grows backward cross-references on its own* — line 10 is
one, and it is exactly what broke the check the first time. A future consolidation that
adds a summary line to the section and reorders step 11 disarms R1 silently.

**Prototype — verified, not proposed.** All three markers live on step 11's single line
today, so anchoring the R1 assertion to the numbered step closes the hole:

```diff
-  readback_pos=$(printf '%s\n' "$ordered_entry" | marker_position "back verbatim")
-  confirm_inline_pos=$(printf '%s\n' "$ordered_entry" | marker_position "confirm inline")
-  fleet_confirm_pos=$(printf '%s\n' "$ordered_entry" | marker_position "After the human confirms the fleet")
+  profile_step=$(printf '%s\n' "$ordered_entry" | grep -E '^11\. ' || true)
+  readback_pos=$(printf '%s\n' "$profile_step" | marker_position "back verbatim")
+  confirm_inline_pos=$(printf '%s\n' "$profile_step" | marker_position "confirm inline")
+  fleet_confirm_pos=$(printf '%s\n' "$profile_step" | marker_position "After the human confirms the fleet")
```

I applied it and ran both cases:

| case | prototype result |
|---|---|
| real `skills/pij` | **EXIT=0**, no regression |
| R2 decoy mutant | **EXIT=1** — `✗ … read-back precondition is out of order` |

**Not delivered** (packet fence permits only this review file); restored byte-identically.
Offered as a ready-made patch plus a ready-made RED fixture. Caveat: it hard-codes the
step number `11`, trading one brittleness for another — renumbering the journey silently
empties `profile_step` and trips the `missing` arm, which fails **closed**, the safe
direction.

**R3 (residual, non-blocking) — the original defect site is still unprotected.**

Mutant X2: invert **only** `§ Build configuration` line 53, back to `bfbb08d`'s wording,
leaving step 11 correct. Result: **`EXIT=0`, zero `✗`.**

The positional assertion is scoped to `§ Ordered entry`, and step 11 satisfies it
independently, so the section where the mandate was *actually* broken can be re-broken
freely. Severity is genuinely reduced — the canonical journey still states the mandate
correctly, so it is a weakening rather than a loss — but § Build configuration is the
section a builder reads *while configuring the fleet*, and it would say the wrong thing.

An order assertion cannot fix this: § Build configuration expresses ordering
**semantically** (*"before fleet creation"*), not positionally. Closing it needs a
literal pin on the full clause, e.g. `require_marker "$orchestrator" "read it back
verbatim and confirm inline before fleet creation"` — a one-line addition next to the
existing fragment pin at `:413`.

**R4 (residual, non-blocking, scope-adjacent) — a second order loop still has the F5 bug.**

`pij-skill-check.sh:479-495` contains a *second* order loop (`orchestrator pair order`)
still using the unscoped form:

```bash
line=$(grep -nF -- "$marker" "$orchestrator" | head -1 | cut -d: -f1 || true)
```

Its first marker is `After the human confirms the fleet`. Mutant X6 rewords step 11 to
doctrine-correct prose (`read-back … then persist it in the plan roster`) and moves that
literal phrase into § Build configuration:

```
✗ orchestrator pair order: coder override marker '--coder-model <confirmed>' is out of order
✗ orchestrator pair order: reviewer override marker '--reviewer-model <confirmed>' is out of order
✗ orchestrator pair order: phase delegation marker 'Delegate each whole phase' is out of order
```

Three spurious failures on **correct** doctrine, caused solely by first-occurrence
position — the F5 signature exactly, surviving 55 lines below the fix. These markers are
not journey markers, so the coder's Req 1 scope arguably excludes them; the report's
phrasing *"All journey markers use the canonical section slice"* is therefore accurate
and not a misstatement. I flag it because the next person to hit this will reasonably
believe item 11 fixed it.

**Also noted (nit, fails closed):** R1 pins the literal `After the human confirms the
fleet`. Rewording step 11 to *"Once the human has confirmed the fleet…"* trips the
`missing` arm. Brittle, but in the safe direction.

---

## Packet question 3 — Dim-0: are the three tests non-vacuous?

**YES.** I removed each guard from the script and ran the full suite. Each mutation
turned **exactly one** test RED — no double-coverage, no vacuity, no test passing for a
reason other than its stated guard.

| # | Mutation to `pij-skill-check.sh` | T1 xref | T2 R1 mutant | T3 journey |
|---|---|---|---|---|
| — | *(unmutated baseline)* | ✓ | ✓ | ✓ |
| **D1** | R1 if/elif/else block → bare `ok "…"` | ✓ | **×** | ✓ |
| **D2** | order loop de-scoped to whole-file `grep` | **×** | ✓ | ✓ |
| **D3** | `elif [ "$line" -lt "$previous" ]` → `elif false` | ✓ | ✓ | **×** |

**D2's RED signal is the point of the exercise.** The gate output under D2 was exactly:

```
✗ orchestrator order: preamble marker 'human preamble' is out of order
```

That is the F5 false positive, verbatim. Test 1 is therefore a true regression test for
F5 and not merely an assertion that the repo is currently green.

**Fixture fidelity.** The tests `cpSync` the **real** `skills/pij` into a tmpdir and run
the **real** script against it via `PIJ_SKILL_ROOT`. No parallel TypeScript
re-implementation of the checker — the thing under test is the thing that ships. This is
the right construction and the coder called it out.

**Unreported side effect, in the commit's favour.** Test 1 asserts `status === 0` on an
*unmutated* copy of the real skill tree. `pij-skill-check` appears in the `justfile` only
as a standalone recipe (`:223`) — it is **not** a stage in `just self-check` (`:166-175`)
and **not** in `.harness/extensions/checks/extension.ts` (stages: local-paths, typecheck,
lint, test, windows-compat, smoke, pkg-audit, snapshots). But `just test` **is** a stage
in both. So this commit incidentally **promotes the entire pij-skill-check gate into
`harness checks`** — the machine-wide "are we done?" verb — for the first time. That is a
larger win than the diff advertises, and the report does not mention it.

Two consequences worth recording:
- A future *unrelated* gate failure (say a budget overrun) now fails a test named
  *"passes correct canonical order despite a backward human-preamble cross-reference"*.
  The coder pre-empted the diagnosability cost by passing `result.output` as the
  assertion message in test 1, so the full gate output prints. Careful work.
- Tests 2 and 3 use bare `expect(result.status).toBe(1)` with no message. If either
  regresses you get `expected 0 to be 1` and no context. **Nit**: pass `result.output`
  there too.

---

## Packet question 4 — F5 revert: is reading order harmed?

**No — it is a restoration toward base, not a fresh edit.** Tracing the line:

| revision | `orchestrator.md:10` |
|---|---|
| `fa6378a` | `1. **Start-of-work report** — after the **human** preamble checkpoint and before the` |
| `bfbb08d` | `1. **Start-of-work** — after the preamble checkpoint, before mutation:` |
| `346c19f` | *(unchanged from `bfbb08d`)* |
| `f6d3734` | `1. **Start-of-work** — after the **human** preamble checkpoint, before mutation:` |

The word `human` was base text. My item-9 review found it had been dropped to silence
the `head -1` linter bug — a live doctrine document distorted to satisfy a broken check.
With the check fixed, the word comes back. **Reading order is improved**, not merely
unharmed: the reader now learns *whose* preamble.

**No ordered-entry step moved.** The orchestrator.md hunk in `f6d3734` is `+1/−1` on a
single line in `## Required status steps`, above `## Ordered entry`. Budget **114/120**,
unchanged. Real gate **0 ✗ / 194 ✓** (193 before, +1 for the new assertion).

The `— never a modal question UI` phrase remains absent, as at `346c19f`. Previously
adjudicated as covered by global invariant 9 (`SKILL.md:66`) and gate-pinned elsewhere.
**Carried forward for visibility only; not re-opened.**

---

## Gates run first-hand

| Gate | Result | Note |
|---|---|---|
| `just pij-skill-check` (real) | **0 ✗ / 194 ✓** | 4 pre-existing advisory ⚠ (bootstrap/kickoff/batons/protocol budgets), unrelated |
| `npx vitest run harness/scripts/pij-skill-check.test.ts` | **3/3 PASS** | re-run green after every restore |
| `npm run typecheck` | **PASS** | silent/clean — coder's claim independently confirmed |
| `bash -n pij-skill-check.sh` | **PASS** | |
| `shellcheck pij-skill-check.sh` | **clean on new code** | 54 findings, all pre-existing SC2015/SC2016/SC2164 style infos at other lines; **none** in `:376-427`. Not wired into any gate |
| `npx biome check …test.ts` | **PASS** | |
| `git status --short -- skills/ harness/ .pi/` | **empty** | post-restore |

**Correctness detail I verified rather than trusted:** `print (NR * 100000) + index($0, marker)`
parses as intended in awk — `printf 'aa\nbb marker here\n' | awk …` returns `200004`
(= 2×100000 + 4), not a truncated or malformed value. The ×100000 encoding is *necessary
here*, not decorative: all three markers sit on the same physical line, so a line-only
comparison could not order them at all.

**Variable hygiene**: `marker_position() { marker=$1; … }` assigns a global (no `local`).
I checked every later read of `$marker` (`:481-485`) — all are inside a
`while IFS='|' read -r label marker` loop that assigns before use. **No leak.** Worth a
`local` anyway for the next reader; shellcheck does not catch this.

---

## Audit of the coder's report (`reports/item-11-report.md`)

Every reproducible claim checks out:

| Claim | Verified |
|---|---|
| Correct order + earlier `human preamble` cross-ref → PASS | ✅ real gate + test 1 |
| R1 mutant → FAIL | ✅ test 2, and D1 proves non-vacuous |
| Genuine `/thesis` inversion → FAIL | ✅ test 3, and D3 proves non-vacuous |
| Real `skills/pij` → PASS, 0 ✗ | ✅ 194 ✓ / 0 ✗ |
| `You are a stream orchestrator` kept as document-level marker | ✅ and provably lossless (§ Q1) |
| R1 uses line/column within the slice | ✅ arithmetic verified |
| No ordered entry step moved | ✅ diff is +1/−1 outside the section |
| Shell syntax / Biome / Typecheck PASS | ✅ all three re-run |

**One omission, in the commit's favour**: the report does not mention that test 1
transitively promotes the whole gate into `just test` → `harness checks`. That is the
most consequential effect of this commit and deserves a line.

**One phrasing to sharpen**: *"the fixed section boundary means this natural backward
reference no longer confuses the gate"* is true for the journey loop and false for the
pair-order loop 55 lines below (R4). Scoping the sentence to the journey loop would
prevent the next reader inheriting a wrong belief.

The report's structure — claim → behaviour → decision → gates → blast radius — was
efficient to audit. The **F5 revert decision** section, which explains *why* a revert was
correct rather than just recording it, is the part that saved me the most time.

---

## Recommended disposition

1. **Merge `f6d3734` + `609c596`.** Do not revert. Do not block on R2/R3/R4.
2. **New follow-up item — close R2** with the verified four-line patch in § R2, using the
   decoy mutant as its RED fixture. This is the one I would actually do: it is small,
   proven green-on-real and red-on-mutant, and it closes the *only* residual that lets a
   plausible accidental edit disarm the mandate completely.
3. **Fold R3 in** as a second requirement of the same item: one `require_marker` pinning
   the full clause `read it back verbatim and confirm inline before fleet creation`, so
   the historical defect's own site has back-pressure.
4. **R4** — either scope the pair-order loop to its section too, or add a comment at
   `:479` recording that it is deliberately whole-file. Cheap either way; leaving it
   silent is the bad option.
5. **Nits, take or leave**: `local marker` in `marker_position`; `result.output` as the
   assertion message in tests 2 and 3.
6. **Consider promoting `pij-skill-check` to a first-class `harness checks` sensor**
   rather than relying on it arriving via a test assertion. It works today, but the
   coupling is implicit and a future refactor of test 1 would silently drop a
   machine-wide gate.

---

## Reviewer integrity

- I derived every base/defect quote from `git show <sha>:<path>` in this pass. I did not
  reuse quotes from my item-9 reviews, and doing so would have misled me: I had
  previously recorded step 11 as *"never defective"*, which is true, but I had not
  registered that it contained **no read-back mandate at all** at base. That fact is
  load-bearing for R1 and I only saw it by re-deriving.
- Every finding above is backed by a mutation I ran and whose output is quoted. Where I
  reasoned analytically instead of testing (the `role` marker's `previous=0` argument),
  I said so explicitly.
- I attacked my own approval: R2, R3 and R4 are all attempts to break a commit I was
  ready to approve. They did break it, and I still approve it — because none is a
  regression and the commit demonstrably catches the defect it was written to catch.
- I prototyped a fix I am recommending, ran it both ways, and did **not** deliver it,
  because the packet fence permits only this file.
- Both mutated files were restored byte-identically with sha256 proof **before** this
  file was written. This pass is CLOSED.
