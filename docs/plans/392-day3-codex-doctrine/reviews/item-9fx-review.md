# Cold review — item 9-FX (test-pinned string restoration + R5)

> **TERMINAL REPORT.** This pass is **CLOSED**. No mutation was made to the repo under
> review beyond this file; all scaffolding was torn down before reporting. No further
> pass is open on my side.

**Commit**: `bcb3b8a` · **Base**: `origin/main` = `e237988` (merge-base confirmed, single commit ahead) · PR #10 · **C10**
**Reviewer**: `pij-wilful-morton` (GitHub Copilot CLI / Claude Opus 5), cold — no prior context on items 9, 10a, or 11.
**Verdict**: ✅ **APPROVE** — merge as-is. Two non-blocking advisories below (one goes *beyond* the packet's stated concession; the o-prime may want to rule on it separately).

---

## 1. Scaffolding and the limits of my reproduction (stated first)

What I had to build, and what each thing does **not** prove:

| # | Scaffolding | Why | Limit of the reproduction |
|---|---|---|---|
| S1 | `git worktree add --detach /tmp/pij-9fx-cold bcb3b8a` from the main checkout | Review worktree is on `s392/day3-codex-doctrine` @ `f906033`, which does **not** contain `bcb3b8a` | Gates were run on a **detached scratch tree**, not on the PR branch worktree. Content is byte-identical to `bcb3b8a`; the *environment* is not the one CI will use. |
| S2 | `ln -s /Users/vaughanknight/GitHub/pij/node_modules node_modules` | Scratch worktree has no `node_modules`; sanctioned by the packet | Dependencies are the **main checkout's**, resolved at review time — not a clean `npm ci` install. A lockfile-drift failure would not be visible to me. |
| S3 | Temporary edits inside `/tmp/pij-9fx-cold` only (R5 line deleted; a probe link appended to `orchestrator.md`) | Dim-0 non-vacuity + bypass probe | Both were restored (`git status` clean) and the worktree was then **removed**. The repo under review was never mutated. |

**Teardown**: `/tmp/pij-9fx-cold` removed via `git worktree remove --force` (exact own path — no prefix
sweep, per `government/orient-local.md`); `/tmp/r5-backup.sh`, `/tmp/orch-backup.md`, `/tmp/pins.txt`
deleted. Verified with `git worktree list`.

**Side effect disclosed**: that `worktree remove` triggered git's automatic prune of stale admin
entries, so two unrelated rows (`…/scratchpad/s392-pr9fx`, `…/scratchpad/wt10`) also left
`git worktree list`. I verified **both directories were already deleted from disk by their own
sessions before I started** — `[ -d … ]` false for each. No live worktree was removed and no
uncommitted work was touched.

**Base moved mid-review**: `origin/main` advanced `e237988` → `9693a88` while I was reviewing
(`gov(orient-local): temp-worktree cleanup only by exact own-scratchpad prefix`, authored 22:17:31 —
**docs-only**, `government/orient-local.md` +1 line). `bcb3b8a` is confirmed **not** an ancestor of
main, so it is still unmerged and this verdict stands; the new base cannot affect any gate here, but
the trial merge remains unperformed (§7.3).

**I did not run** `harness checks`, `just self-check`, `just smoke`, `just lint`, `just typecheck`, or the full vitest suite. See §7.

---

## 2. Establish 1 — restorations are semantically faithful, not merely string-present

I did not settle for "the test passes". I diffed the **pre-item-9 baseline** (`23a83b6^`) against the
post-fix state (`bcb3b8a`) and checked each pinned string at all three points in history.

### Provenance table (`grep -F`, fixed-string, per revision)

| File | Pinned string (truncated) | `23a83b6^` base | `23a83b6` item 9 | `bcb3b8a` 9-FX |
|---|---|---|---|---|
| peer.md | ``Empty or absent `TMUX_PANE` means external pull mode.`` | PRESENT | **ABSENT** | PRESENT |
| peer.md | ``In external pull mode, never run `tmux list-panes`, …`` | PRESENT | **ABSENT** | PRESENT |
| peer.md | `Never infer, guess, select, or adopt any pane id.` | PRESENT | **ABSENT** | PRESENT |
| peer.md | ``Redirect `/pij adopt` intent to `pij inbox register` …`` | PRESENT | **ABSENT** | PRESENT |
| peer.md | ``Tmux control-plane mode needs one-time self-adopt …`` | PRESENT | **ABSENT** | PRESENT |
| orchestrator.md | `Start-of-work report` | PRESENT | **ABSENT** | PRESENT |
| orchestrator.md | `Stop-of-work report` | PRESENT | **ABSENT** | PRESENT |
| orchestrator.md | ``…'Send the [phase report](<path>) and begin the next approved step'`` | PRESENT | **ABSENT** | PRESENT |
| orchestrator.md | `…'Starting **<plan>**' 'Run the next Builder or pair step'` | PRESENT | PRESENT | PRESENT |

Every restored string is **byte-identical to the pre-item-9 doctrine** — this is a true restoration,
not a paraphrase engineered to satisfy `toContain`. The last row confirms item 9 never touched the
start command, so 9-FX correctly left it alone.

### orchestrator.md — reads correctly in context ✅

9-FX's orchestrator delta is exactly three edits, and the resulting lines are byte-identical to base:

- `**Start-of-work**` → `**Start-of-work report**`; `**Stop-of-work**` → `**Stop-of-work report**`.
  These are *labels for the two required status steps*. "Start-of-work report" is the more accurate
  label — the step **is** a report (`pij report now …`), and the section is `## Required status steps`.
  Item 9's shortening actively made the heading vaguer; restoring it improves the prose independent of
  the test. Not a case of contorting text to please an assertion.
- `'Send the phase report → <path> and begin…'` → `'Send the [phase report](<path>) and begin…'`.
  Semantically identical instruction; the bracketed form matches the **sibling `pair.md`** command
  (`'Send the [report](<path>) and await the next assignment'`), so the two PM routes are once again
  consistent. Item 9's `→ <path>` de-bracketing was the *only* reason they diverged.

Arithmetic cross-check: orchestrator.md went 6705 → 6724 chars (**+19**), which is exactly
`" report"×2 (+14)` plus the link-syntax delta (+5). **No other byte changed** — confirming the diff
is precisely these three edits and nothing smuggled alongside.

### peer.md — reads correctly in context ✅ (with one nit, §5)

The restoration collapses base's two paragraphs into one. Three things were *reworded or dropped*
relative to base; I chased each to ground rather than accepting the consolidation on faith:

| Base text | State in 9-FX | Preserved? |
|---|---|---|
| "detect the delivery owner **before giving any self-registration advice** (§ C1)" | "detect the delivery owner **first** (§ C1)" | ✅ **Yes — by the pointer.** `00-routing.md` row E literally reads "detect before self-registration advice". peer.md is a route module whose header says conventions "pull lazily" from `§ C*n*`. Compressing to `first` + a `§ C1` cite that resolves to the precise clause is the file's *designed* mechanism, not a loss. `cli.integration` separately pins the full clause in `routing`. |
| "**To place it structurally during registration, use** `pij adopt … [--parent] [--session-id] [--export]`" | "(control-plane self-adopt **full flags**: `pij adopt … [--export]`.)" — command byte-identical, framing changed | ✅ **Yes — same file, `## Structure` section**: "Adopt `--parent` places at registration; spawn records the caller as parent and close owner." The *purpose* survives 20 lines below, next to `pij link`, where it is arguably better placed. |
| "A non-tmux external session can converse with existing peers after `pij inbox register` (or its first `pij inbox --wait`) auto-registers pull ownership." | Dropped from Preconditions | ✅ **Yes — three-fold.** (a) The **Job** line: "converse with peers that already exist: identity/list/send/tail/state need no spawn". (b) The very next block, `**External pull identity — first action**`, with ``pij inbox register --json  # run before whoami/list/state/tail``. (c) The restored ban clause itself carries "(or the first `pij inbox --wait`, which auto-registers)". |

**Conclusion**: a reader loading `peer.md` cold still gets the real guidance. Nothing in the
consolidated paragraph is a stub, a forward-reference to a file that does not say it, or a
test-shaped fragment.

Bonus consistency check: peer.md's restored full-flags form is **byte-identical to the CLI `--help`
string** pinned at `cli.integration.test.ts:219` (`pij adopt "$TMUX_PANE" --harness <h> [--parent <id>] …`).
Doc and binary agree. Note this peer.md occurrence is **not itself test-pinned** — it is a
doctrine-preservation choice by the author, and the right one.

---

## 3. Establish 2 — R5 is correct and safe

```sh
case "$target" in
  /*|http://*|https://*|mailto:*) continue ;;
  '<'*'>') continue ;; # R5
esac
```

### Scope of R5's effect — measured, not assumed

`check_links` is invoked on `routes/prime.md` plus `find references/prime -name '*.md'` **only**.
I enumerated every bracketed link target in that exact scan set and applied the R5 pattern:

```
SKIPPED-BY-R5  skills/pij/references/prime/orchestrator.md -> <path>
```

**Exactly one target in the entire scanned corpus is affected.** Minimal blast radius.

This also explains the whole conflict cleanly: `pair.md` has carried the identical
`[report](<path>)` construct all along, but `pair.md` is a *route*, outside `check_links`' scan set.
Only `orchestrator.md` sits under `prime/`, so only it tripped the gate — which is why item 9
de-bracketed it. The o-prime's ruling (fix the checker, not the doctrine) is the correct direction,
and R5 additionally future-proofs `pair.md` should the scan set ever widen.

### Dim-0 — the two fixtures are non-vacuous (verified by deletion)

I deleted the R5 line in the scratch tree and re-ran:

| Probe | With R5 | Without R5 |
|---|---|---|
| `just pij-skill-check` | exit **0**, all green | exit **1**, `✗ prime pointer: …/orchestrator.md → <path> is missing` |
| test "accepts a bracketed link whose target is an angle-bracket `<placeholder>`" | ✓ | **× FAILS** |
| test "still fails a bracketed link whose target is a real missing path" | ✓ | ✓ |

- Fixture 1 is **non-vacuous**: it flips to failing the moment R5 is removed. It also proves R5 is
  *load-bearing for the shipped file*, not just for the injected fixture — without R5 the restored
  `[phase report](<path>)` alone reds the gate. The two halves of this PR are genuinely coupled.
- Fixture 2 passes with **and** without R5 — correct and deliberate. It is not testing R5's presence;
  it is a **guard against R5 being widened**. Had the author skipped all `](…)` targets, or matched
  `'<'*` without the closing `>`, fixture 2 would fail. It earns its place.

### Bypass consideration — one real hole, latent, **beyond** the packet's concession

The packet pre-concedes "a target literally `<foo>` is a placeholder by construction — acceptable".
I agree with that as stated, but it does **not** cover the case I found, so I am flagging it rather
than letting the concession absorb it.

In **CommonMark, `<…>` is the pointy-bracket *link-destination* syntax**: `[x](<./a b.md>)` is a
genuine link to `./a b.md`, used when a path contains spaces or parens. Such a target is *not* a
placeholder by construction — it is a real path. Probed live:

```
$ printf '\nSee the [gone](<./does-not-exist.md>) pointy-bracket link.\n' >> …/orchestrator.md
$ just pij-skill-check
✓ prime pointer-integrity scanned
✅ pij-skill-check: all green      # EXIT=0  ← a real broken prime pointer, silently skipped
```

Assessed severity: **Low / latent, non-blocking.** Grepping `skills/` for `](<…>)` returns exactly
two hits — `pair.md:58` and `orchestrator.md:19` — **both the `<path>` placeholder**. There is no
real-path pointy-bracket link anywhere in the tree, and the idiom is not used in this repo. See
**ADV-1** for a one-line tightening if the o-prime wants the hole closed.

Other edge cases checked and found harmless: `<>` (matches, skipped, meaningless); `</abs>`
(skipped — the `/*` arm would have skipped it anyway); `<a#b>` (the earlier `${target%%#*}` strip
leaves `<a`, which does **not** match R5 and still errors — fail-closed, correct direction).

---

## 4. Establish 3 — gates run first-hand (all in the cold scratch tree)

| Gate | Result | Evidence |
|---|---|---|
| `just pij-skill-check` | **exit 0** · 194 `✓` · **0 `✗`** | `✅ pij-skill-check: all green` |
| ↳ peer.md budget | **146/150** ✅ | `✓ budget: skills/pij/references/routes/peer.md (146/150)` |
| ↳ orchestrator.md budget | **114/120** ✅ | `✓ budget: skills/pij/references/prime/orchestrator.md (114/120)` |
| `vitest run cli.integration + acceptance-sweep + pij-skill-check.test` | **3 files passed · 121 passed, 1 skipped** | duration 160.98s, exit 0 |
| `vitest run harness/scripts/pij-skill-check.test.ts` | **5/5 passed** | all five named above |

The `⚠` rows present (`bootstrap.md` 197, `kickoff.md` 103, `batons.md` 200, `protocol.md` 179) are
**pre-existing advisory** over-budget warnings on files this PR does not touch. They do not affect
exit status and are not attributable to 9-FX.

**Completeness of the gate set.** Because main was RED, I did not take the packet's three-gate list
on trust — I enumerated *every* test file that reads either changed markdown file:

```
.pi/extensions/pij/acceptance-sweep.test.ts
.pi/extensions/pij/cli.integration.test.ts
harness/scripts/pij-skill-check.test.ts
.pi/extensions/pij/core/daemon/watchdog-manager.test.ts   ← "peer"/"orchestrator" as ROLE STRINGS only
.pi/extensions/pij/core/platform/types.test.ts            ← same; no `peer.md` / `orchestrator.md` read
```

The latter two contain **zero** references to the file paths. **The packet's three gates are the
complete set of consumers of these strings.** No fourth pin is lurking.

---

## 5. Establish 4 — budget: no mandate was cut to fit ✅

This is the dimension most likely to hide a quiet regression, so I measured content volume, not just
line count:

| Revision | peer.md lines | peer.md **chars** | orchestrator.md lines | orchestrator.md **chars** |
|---|---|---|---|---|
| `23a83b6^` (pre-item-9) | 155 (**over cap**) | 9845 | 139 | 8093 |
| `23a83b6` (item 9, RED) | 150 (at cap) | 9043 | 114 | 6705 |
| `bcb3b8a` (9-FX) | **146** | **9281** | 114 | **6724** |

The decisive figure: **9-FX added 238 characters of content to peer.md while freeing 4 lines.**
Content volume went *up*, line count went *down*. That is paragraph consolidation by definition —
the opposite of trimming a mandate to make room.

Corroborating structural proof: `git diff 23a83b6 bcb3b8a -- skills/` touches **only** the
Preconditions paragraph in `peer.md` and the three lines in `orchestrator.md`. No other section of
either file was opened, so no mandate elsewhere *could* have been sacrificed. Within the changed
paragraph itself, all three reworded/dropped fragments were traced to surviving homes in §2.

---

## 6. Findings

Neither blocks the merge.

### ADV-1 · Low · advisory — R5 also skips CommonMark pointy-bracket destinations (`harness/scripts/pij-skill-check.sh:337`)

`'<'*'>'` skips `[gone](<./does-not-exist.md>)`, which in CommonMark is a *real* link to a *real
missing path* — outside the packet's "placeholder by construction" concession. **Latent**: zero such
links exist today (only the two `<path>` placeholders). Raising it so the o-prime can rule, not to
gate the merge.

Cheap tightening if wanted — keep skipping opaque placeholders, but never skip something
path-shaped:

```sh
case "$target" in
  /*|http://*|https://*|mailto:*) continue ;;
  '<'*/*'>'|'<'*.md'>') ;;                # path-shaped: fall through and verify
  '<'*'>') continue ;;                    # R5: opaque <placeholder>, not a link
esac
```

A fixture asserting `[gone](<./does-not-exist.md>)` still errors would close the coverage gap left
by the current pair (which only exercises the *non*-pointy broken form).

### NIT-1 · Nit · non-blocking — full-flags parenthetical sits after the pull-mode ban run (`skills/pij/references/routes/peer.md:8`)

The consolidated paragraph now orders: control-plane self-adopt sentence → **four consecutive
external-pull prohibitions** ("never run `tmux list-panes`…", "Never infer, guess, select, or adopt
any pane id", "Redirect `/pij adopt` intent to…") → **then** `(control-plane self-adopt full flags:
pij adopt "$TMUX_PANE" --harness <h> …)`.

The parenthetical is correctly *labelled* `control-plane`, so it is not wrong. But the primary reader
of this file is an LLM, and it hands a full `pij adopt` invocation immediately after four sentences
establishing that adopting is forbidden in the mode just described. Base ordering kept the full-flags
form adjacent to the control-plane sentence, *before* the pull-mode material — strictly safer.

Fix is **free** (single source line; reordering within it changes no line count, 146/150 holds):
move the parenthetical to directly follow ``…`pij adopt "$TMUX_PANE" --harness <h>`.`` and before
"Empty or absent `TMUX_PANE`…". No test pins this occurrence or its position, and the
`cli.integration` assertion on the control-plane sentence is a `toContain` that is unaffected by what
follows it.

---

## 7. What I did **not** examine (so it is not mistaken for clean)

These are **unexamined**, not passed:

1. **`harness checks` / `just self-check` / `just smoke` / `just lint` / `just typecheck`** — not run. The
   packet scoped me to four gates. I have **no** first-hand evidence on Biome, `tsc`, smoke, or the
   package audit for this commit.
2. **The full vitest suite** — not run. I ran the 3 named files plus verified no 4th file reads the
   changed markdown. A failure in a test that touches neither file would be invisible to me.
3. **Whether `origin/main` actually goes green on merge** — I verified `bcb3b8a` is green *in
   isolation* on a scratch tree, one commit ahead of `e237988`. I did not perform a trial merge, and
   I did not inspect any *other* main-RED cause beyond the two files in this diff. My evidence
   supports "this commit fixes the pins it claims", **not** "main is green".
4. **Item 9 / item 11's own content** (the `tree`/`link`/body-safety/watchdog-freshness compressions
   visible in the `23a83b6^…bcb3b8a` cumulative diff) — **out of scope**; already merged, reviewed in
   `item-9-review.md`, `item-9-rereview.md`, `item-11-review.md`. I read them only as context for
   judging 9-FX's paragraph and formed no verdict on them.
5. **`00-routing.md`** — unchanged by this PR. I confirmed indirectly (the passing `cli.integration`
   assertions require the four ban clauses in `routing` too) but did not review its text.
6. **Runtime behaviour of the restored doctrine** — no live seat was booted against the edited
   `peer.md`/`orchestrator.md`. Faithfulness was judged by reading, not by observing an agent obey it.
7. **`npm ci` / lockfile integrity** — masked by scaffolding S2.

---

## 8. Verdict

✅ **APPROVE — merge `bcb3b8a` as-is.**

The four packet dimensions all hold, on first-hand evidence:

1. **Semantically faithful** — every restored string is byte-identical to pre-item-9 doctrine; all
   three reworded/dropped fragments traced to surviving homes; both files read correctly in context.
   `Start-of-work report` is genuinely better prose than what item 9 left, and the bracketed
   `[phase report](<path>)` restores consistency with `pair.md`.
2. **R5 correct and safe** — one target affected corpus-wide; load-bearing (proved by deletion);
   fixture 1 non-vacuous, fixture 2 a real over-widening guard; one latent bypass (ADV-1) outside the
   packet's concession, zero live instances, non-blocking.
3. **Gates green first-hand** — `pij-skill-check` exit 0 / 0 `✗` / 146/150 / 114/120; three vitest
   files 121 passed 1 skipped; `pij-skill-check.test` 5/5. Consumer set proved complete.
4. **Budget honest** — +238 chars of content for −4 lines in `peer.md`; diff confined to the one
   paragraph, so no mandate elsewhere could have been cut.

ADV-1 and NIT-1 are both cheap and both optional; neither justifies holding a fix for a RED main.
Recommend landing now and folding ADV-1/NIT-1 into a later doctrine pass if the o-prime agrees they
are worth the churn.

**This pass is CLOSED. No further review pass is open on my side.**
