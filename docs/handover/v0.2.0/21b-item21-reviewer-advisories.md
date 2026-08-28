# 21b — item-21 reviewer advisories (bind-fail notice re-arm + grep-sweep trade disclosure)

**Item id / stream at handover:** 21b (tail of item 21) · s392-day3-codex-doctrine
**Status at v0.2.0 (tag `d120c53`):** designed, NOT started. Non-blocking advisories from item 21's cold review (item 21 APPROVE → PR #25, merged main `90ba189c`).
**Size estimate:** S, ~2–3 h · **Order / dependencies:** after item 21 (merged) and item 23b (o-prime ordered 21b after 23b, `docs/plans/392-day3-codex-doctrine/rulings.md:224`).

## 1. Why this exists (the observed failure, with evidence) — `docs/plans/392-day3-codex-doctrine/rulings.md:219-223`
- **ADV-2 (undocumented + unsensored):** item-21's `settled = false` reset (`core/daemon/loop.ts:566`) also RE-ARMS the `fail()` notice (`:590`/`:604`). Main was SILENTLY SUPPRESSING a real post-rebind bind-failure (0 vs 1 notice). Reviewer says KEEP (arguably a 2nd bugfix) but it is undocumented and has no test.
- **ADV-C (silent narrowing):** the pane-misbind grep-sweep is a TRADE, not a tightening — it GAINED aliased-destructure shapes but LOST literal-RHS comparisons (`descriptor.paneId === "%42"`, backtick-`%n`) and has a latent object-literal false positive (paneIdAliases matches object literals, scope-blind). LOW severity (sweep skips `.test.ts`, 0 real occurrences today) — but a safety-brake narrowing must be STATED, not silent.

## 2. What is ruled (design / spec)
- ADV-2: pin the re-armed notice with a test (bind → refuse → bad-model → `fail()` emits the notice), and update the `settled` latch docstring at `loop.ts:152` ("A terminal notice (bound/failed) was already delivered") — it is now PER-INCIDENT, not per-seat-lifetime. (NOT `:149`, which documents a DIFFERENT latch, `answeredInterstitials`.)
- ADV-C: DISCLOSE the traded-away shapes + the latent object-literal FP in the sweep comment.

## 3. Where the code is (at tag `d120c53`)
- `.pi/extensions/pij/core/daemon/loop.ts`: `drive.settled = false` `:566`; the `settled` docstring `:152`; `fail()` `:604` gates on `settled` at `:618` — the latch is SHARED across all fail() sites (`:266,:300,:389 (bad-model),:537,:590 (heldBoot)`). `:149` is a different latch (`answeredInterstitials`).
- The pane-misbind grep-sweep test (grep `paneIdAliases` / the sweep in the loop or a dedicated sweep test file) — add the disclosure comment there.
- Advisory table + anchors: `docs/plans/392-day3-codex-doctrine/rulings.md:219-223` (note: MUT-C line 270 was the `it.each` decl; real RED at 275 — imprecise, noted in the ruling).

## 4. Acceptance (behavioural, mechanical)
- Test (ADV-2): a bind → refuse → bad-model sequence in a surviving process emits the fail notice exactly once per incident. Mutant `MUT-FAIL-REARM-OFF`: drop the `settled = false` re-arm → the notice-emitted test REDs (proving the re-arm is load-bearing, not incidental). Name the covering test (E40).
- ADV-C is a comment-only disclosure on the pane-misbind sweep (its test resolves to `.pi/extensions/pij/core/index-state.test.ts:50`) — assert (a source-pin or doc test) that the sweep comment names the traded-away shapes; no behavioural mutant.
- Gates: full suite at merge product, `just typecheck`, two green runs, logs kept.

## 5. Live verification
Daemon-side (loop.ts) — after a restart carrying it, trigger a post-rebind bind-failure (a re-bound seat that then fails a model check) and confirm the fail notice fires once. Failure looks like: a silent post-rebind bind-failure (the pre-item-21 behaviour).

## 6. Risks / gotchas that already bit us
- **E29-adjacent** — a silently suppressed real failure is a loss; the re-arm fixes it but must be sensored so it can't regress to silent.
- A grep-sweep safety brake that narrows coverage silently is the same "state your instrument" lesson — disclose the trade.

## 7. Open questions for the human
- Empty — both advisories are settled; 21b only needs the test + the two comment/doc updates.
