# Cold RE-review packet — Phase 2 (3c) after FX002 · terminal-once, new verdict file

**Reviewer**: pij-pale-araminta · **Prior verdict**: `reviews/phase-2-review.md` FIX_REQUIRED (F1/F2, both Dim-0 missing witnesses) · **Fix commit**: `f21269f` (test-only, `index.test.ts`; `index.ts` diff empty)
**Branch**: `s392/day3-codex-doctrine` · **Impl under review (unchanged)**: `35f9aff` · **Diff of the fix**: `git show f21269f`

## Establish (independently — coder RED is not evidence)
1. FX-A: re-run your M2b (swallow the `receiver.onInbound` throw in the sqlite consumer handler) → now RED. Orchestrator already reproduced: 1 failed → restore 15/15. Confirm the new test asserts row state `claimed`/unacked (negative), not truthiness.
2. FX-B: re-run your M8 (delete the sqlite reload `disposeWatch`) → now RED. Your own caveat: if `getTimerCount` doesn't count unref'd timers, the requirement is still that M8 goes RED — confirm the witness actually fails on the mutation.
3. `index.ts` unchanged (`git show f21269f --stat` = test + docs only).
4. Your other 6 RED-guarded behaviours and the fs branch are unchanged — no need to re-run them.

## Verdict → `reviews/phase-2-rereview.md` (NEW file); report {summary,verdict,path} to pij-falling-outside.
