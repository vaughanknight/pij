# Cold review — Phase 1 item 6 (long_context gate) — dlg-0001 — review-01

**Frozen SHA**: `7ba1831da222eb7461ec58a041a5d848e66bac20` (branch `s391/item6-long-context`, base `main@d2dbab0`)
**Verified**: `git rev-parse HEAD` == the SHA above, before and after every mutation.
**Reviewer**: cold, cross-model to the coder (coder = copilot gpt-5.6-sol; reviewer = Claude Opus 5).
**Verdict**: **APPROVE** — highest severity `low`.

---

## Scaffolding and limits of this review (stated first)

- **The worktree was NOT pristine at review start.** `git status --porcelain` had **7 untracked
  orchestration doc paths** (plan, fleet, reports, rulings, packet-addendum, review-brief,
  phase-2 tasks dir). These are orchestrator artifacts, not coder output, and are excluded from
  `main...HEAD`. I captured them to `/tmp/dlg0001-baseline-status.txt` and used **that** as the
  restore baseline — "empty `git status`" was never the correct restore assertion here, and
  asserting it would have produced a false failure.
- **Restore was verified two ways** for every mutation: byte-diff against a pre-mutation `cp`,
  **and** `git diff --exit-code`. Both had to pass.
- **What I did NOT do**: no live Copilot spawn, so the HTTP-400 premise (that
  `gemini-3.6-flash` actually rejects `--context long_context`) is **taken on trust from the
  plan** — I verified the *mechanism*, never the upstream API behaviour. If that premise is
  wrong, the deny-set entry is wrong and nothing in this review would detect it.
- **`harness checks` / `just smoke` not run** — outside the brief's gate list and the worktree
  is shared. `just lint` and `npx tsc --noEmit` were run; results below.
- The `it.skip`-quarantined flaky test at `cli.integration.test.ts:1883` was **not** examined;
  it is unrelated to this change but I did not prove that beyond reading its name.

---

## Dim-0 — Test quality (mutation gate) · **MANDATORY** · PASS

Five mutations run (brief required three). **Every one went RED**, and every restore was
byte-identical. Commands and exact failure sites:

| # | Mutation | Target test | Result |
|---|---|---|---|
| 1 | `spawn.ts:467` — drop `&& input.longContext !== false` | `npx vitest run …/core/spawn.test.ts` | **RED** at `spawn.test.ts:480` (`1 failed \| 163 passed`) |
| 2 | `validate.ts:52` — deny-set lookup → `return undefined` | `npx vitest run …/core/models/validate.test.ts` | **RED** ×2 at `validate.test.ts:96` + `:100` (`2 failed \| 41 passed`) |
| 3 | `cli.ts:4004` — drop `longContext` forward in `spawnAgentPane` | `…/cli.integration.test.ts -t "long-context"` | **RED** at `:1878`, **`agent denied` only** (`1 failed \| 3 passed`) |
| 4 | `cli.ts:2612` — drop `longContext` forward in `runSpawn` | `…/cli.integration.test.ts -t "long-context"` | **RED** at `:1878`, **`peer denied` only** (`1 failed \| 3 passed`) |
| 5 | `spawn.ts:467` — `!== false` → `=== true` (make *undefined* suppress) | `npx vitest run …/core/spawn.test.ts` | **RED** at `spawn.test.ts:453-469` |

**Why 4 and 5 were added beyond the brief.** The brief's three mutations leave two of its own
aim points unproven:

- Mutation 3 alone proves only the **agent** path. Adding **mutation 4** and observing that each
  mutation reddens **exactly one** of the two cases (`agent denied` / `peer denied`, never both)
  is the actual proof of aim point 3 — the two production sites are **independently** plumbed,
  not one site double-counted.
- **Mutation 5** is the only evidence for aim point 1 (the *tri-state default*). Mutations 1–4
  all prove that `false` suppresses; **none** of them prove that `undefined` still emits — a
  build that suppressed unconditionally would pass all four. Mutation 5 reddens
  `spawn.test.ts:453-469`, which is the real default guard.

**Restore proof** (after each of the five, and again at the end):
`diff <pre-mutation copy> <file>` → identical; `git diff --exit-code` → clean;
`git rev-parse HEAD` → `7ba1831da2…`; `git status --porcelain` → **byte-identical to the
7-line pre-review baseline**. Targeted suites re-run GREEN afterwards (`3 passed`).

**Test-quality judgement**: assertions are `toEqual` on full argv (not `toContain`), the
suppression cases are **negative** assertions (`not.toContain`, exact-array equality), and the
registry test asserts `denied).toHaveLength(2)` — a *count*, which is what catches the
"annotation attached to only the losing duplicate" failure mode. These are non-vacuous.

---

## Aim points from the brief

**1. Tri-state default — PASS.** `spawn.ts:467` reads
`input.harness === "copilot" && input.model !== undefined && input.longContext !== false`.
`undefined !== false` ⇒ emits; only literal `false` suppresses.
The brief asked that `spawn.test.ts:453-469` be **byte-identical**: **verified** —
`git show main:…spawn.test.ts | sed -n '453,469p'` diffs clean against HEAD. That test
(`"copilot: --model rides after --session-id as discrete argv"`) passes a model with **no**
`longContext` and asserts the full argv *including* `--context long_context`. Mutation 5
proves it is load-bearing.

**2. Resolver authority — PASS.** `validate.ts:44-53`: the deny-set consult lives **in the
resolver**, after `findKnownModel`, keyed on the bare id (`normalized.slice(lastIndexOf("/")+1)`)
— so it is reached regardless of which duplicate `find` returns, and regardless of whether the
registry was annotated at all. Confirmed for all three registry shapes: (i) raw
`github-copilot` first + `copilot` duplicate (`validate.test.ts:83-89`), (ii) snapshot-only
(`:95`), (iii) empty (`:96`). Mutation 2 reddens (ii) and (iii) exactly as the brief predicted —
(i) correctly survives, because there the annotation supplies an explicit `longContext:false`;
the two mechanisms are independent, which is the intended defence-in-depth.

**3. Production composition — PASS, both sites.** `runSpawn` computes at `cli.ts:2356` and
forwards at `:2612`; `runAgentSpawn` computes at `:4144` and forwards through the
`spawnAgentPane` plan param (`:4175`) to the builder at `:4004`. Both pass the **same** model
value to `resolveLongContext` and to `model:` on the builder — no resolve/emit mismatch.
The fake-tmux test asserts on the real tmux log; mutation 3's failure output shows the flag
riding the genuine
`split-window … copilot --yolo --session-id … --model gemini-3.6-flash --context long_context`
argv, confirming the assertion reaches the final launch command.

**4. Scope — PASS.** 12 files (8 code, 4 docs), all within the packet's paths.
`core/focus.ts`, `core/revive.ts`, `core/types.ts`, `skills/**`: **untouched**. No
`SessionDescriptor` field added — the only `SessionDescriptor` string in the diff is prose in
`tasks.md` declaring it a non-goal.

**5. Docs — PASS.** `docs/how/pij-models-discovery.md:99-102` law amended (the absolute
"always include" replaced with the deny-set exception **and** the consequence for the canary
context join — the latter matters, since a smaller reported tier would otherwise look like a
canary regression). `docs/domains/pij-control-plane/domain.md:110` shape row now reads
`{ …, contextWindow?, longContext? }`.

---

## Gates re-run by me (not taken from the coder's claims)

| Gate | Command | Result |
|---|---|---|
| Full suite | `npx vitest run .pi/extensions/pij/` | **PASS** — `3918 passed \| 15 skipped (3933)`, exit 0, 164s. Log: `/tmp/dlg0001-full-vitest.txt` |
| Typecheck | `npx tsc --noEmit -p .` | **PASS** — exit 0. Log: `/tmp/dlg0001-typecheck.txt` |
| Lint (changed files) | `npx biome check <the 8 changed .ts>` | **PASS** — "Checked 8 files… No fixes applied." |
| Lint (repo) | `just lint` | **RED — pre-existing, see F-3** Log: `/tmp/dlg0001-justlint.txt` |
| Diff stat | `git diff --stat main...HEAD` | matches the coder's `filesChanged` (12 files, +456/−15) |

The execution log claims `3,918 tests passed, 15 skipped` — **my independent run reproduces
that exactly**. The claim is verified, not accepted.

---

## Findings

| # | Dim | Severity | Location | Finding |
|---|---|---|---|---|
| F-1 | 3 / 4 | **low** | `core/spawn.test.ts:472-514` | Plan task 1.1 said the rewritten `:471-480` block should carry the `undefined ⇒ emit` case. The rewrite covers `false`, `true`, and claude/codex, but **no explicit `undefined` case**; that guard now lives only in the adjacent pre-existing test at `:453-469`, whose name (`"--model rides after --session-id as discrete argv"`) gives no hint that it is the long-context default guard. Proven load-bearing today (mutation 5), so **not a defect** — but a future edit to that test could silently drop the tri-state default with no test named for it. Suggest one added case or a comment at `:453` naming it as the AC-01 default guard. |
| F-2 | 4 | **low** | `cli.integration.test.ts:1876` | The **positive** assertion is a whole-log `expect(log).toContain("long_context")`, not a pin on the final `split-window`/`new-window` argv as the brief specified. It would pass if the flag appeared on any tmux command. Low, not medium: the **negative** case (`not.toContain`, `:1878`) is the load-bearing direction for this change and whole-log absence is *stricter* than a line pin; and mutation 3's output confirms the flag does ride the split-window line. |
| F-3 | 8 | **info** | 10 files, none in this diff | `just lint` exits 1 at this SHA (`useTemplate` etc. in `adapters/copilot-rpc.test.ts`, `producers/osc-7337-producer.ts`, `core/models/match.ts`, `skills/flow-pair/test/*`, …). **Zero overlap** with the 8 changed files, and the two I spot-checked are byte-identical to `main`. **Pre-existing, not a regression** — but `just lint` is a stated pre-commit gate and is red on this branch, so a naive "gates green" claim at ship would be false. Matches the coder's own honest note. |
| F-4 | 1 / 2 | **info** | `core/models/validate.ts:44-53` | `resolveLongContext` applies the Copilot deny-set for **any** provider/harness — `pij spawn --harness claude --model gemini-3.6-flash` resolves `false`. Harmless: `spawn.ts:467` gates on `harness === "copilot"`, and `spawn.test.ts:493-514` explicitly proves claude/codex never emit the flag even with `longContext:true`. Noted only so a future reader doesn't mistake the resolver for harness-aware. |
| F-5 | 1 | **info** | `core/focus.ts:330` | The **third** `buildControlSpawnCommand` caller does not pass `longContext`. `tasks.md` frames this as "pure core; stays `undefined` ⇒ today's behaviour", which reads like a residual bug. It is **stronger than that**: `launchFocus` returns `adapterUnavailable(manifest.harness)` for copilot at `:256-257`, before reaching the builder — so the copilot-only flag is **structurally unreachable** from focus. With `revive.ts` emitting no `--context` at all (grep-confirmed), **all reachable copilot spawn paths are covered**. Recommend correcting the non-goal wording so a future agent doesn't chase a phantom gap. |

No `critical`, `high`, or `medium` findings.

---

## Per-dimension verdict

| Dim | Area | Verdict |
|---|---|---|
| 0 | Test quality (mutation) | **PASS** — 5/5 RED, 5/5 restored byte-identical |
| 1 | Scope | **PASS** (F-4, F-5 info) |
| 2 | Contract | **PASS** — `longContext?: boolean` optional on both `ModelEntry` and `ControlSpawnInput`; `resolveLongContext(known, model): boolean \| undefined` preserves tri-state |
| 3 | Plan-alignment | **PASS with note** (F-1 low) |
| 4 | ACs (01/02/10) | **PASS with note** (F-2 low). AC-01 undefined-clause is exercised with `gpt-5.5` rather than `gpt-5.6-sol`; the builder is model-agnostic, so immaterial |
| 5/6 | Docs / domain-currency | **PASS** — both required doc edits present and accurate |
| 7 | Progress log | **PASS** — files, gates, and decisions all present; gate numbers independently reproduced |
| 8 | Regression | **PASS** — typecheck 0, suite 3918/15, no previously-passing test broken (F-3 info) |
| 9 | Prompt-follow | **PASS** — RED-before-GREEN honoured per the log; no forbidden path touched |
| 10 | Learning | **PASS** — captures the load-bearing decision: annotation is display metadata, the **resolver** consults the deny-set so empty/offline registries stay safe |

## Verdict

**APPROVE.** The tri-state contract is correct and mutation-proven in both directions
(`false` suppresses, `undefined` still emits); the deny-set carries authority inside the
resolver so it survives the duplicate-ordering trap that finding 10 predicted; and both
reachable production spawn sites are **independently** proven by single-case mutations.
Findings F-1 and F-2 are `low` test-durability notes, not behaviour defects. F-3 is a
pre-existing repo condition the orchestrator should carry forward to ship.
