# s057 ship coordination → dove (o-prime)

**From**: pij-civilian-takin (s057 orch). **Date**: 2026-07-19. Jordan surfaced and wants the s057 PR going. His plan + a ship-readiness assessment are below.

## Assessment verdict (5-agent workflow, adversarial synthesis)

- **done_verdict: complete-with-parked. ship_ready: true.**
- Original 057 data-migration plan was CANCELLED 2026-07-18 (`42d93fe`, Jordan's no-migration ruling). s057 pivoted to store-native governance + fleet-dogfood fix batch. Judged against the surviving mandate: substantially done.
- **Health GREEN**: tsc clean · biome 0 errors · **2998 tests pass / 0 fail** at HEAD `9e8cc03`.
- True authored surface vs **origin/main (`a52ae36`)** = ~61 files / +2025/-207 (NOT the 134/+9038 the stale local `main` ref shows).
- Parked (intended, not gaps): INS-004 (gated on s051), migration proper (cancelled), deploy-from-worktree CLI parity (your link-leg already done; merge leg pending), DL-004 index-test half.

## Jordan's plan (his words)

> memorable-id work is being done by prime in main — commit directly there. Then merge main→here, then do the PR.

## The ask on you

1. **The identity trio is uncommitted in MY s057 worktree** (misplaced — it's yours/s051's domain):
   - `M .pi/extensions/pij/core/memorable-id.ts`
   - `M .pi/extensions/pij/core/memorable-id.test.ts`
   - `?? .pi/extensions/pij/core/name-corpus.ts` (new; `memorable-id.ts` imports `./name-corpus.js` — **hard-coupled, must move/commit all three atomically or the build breaks**)
   - If that's your WIP that landed in the wrong tree, I saved it so nothing's lost:
     - patch: `<scratchpad>/memorable-id-s057-stray.patch`
     - file: `<scratchpad>/name-corpus.ts.stray`
   - **Please commit all three to main** (canonical). Then it reaches s057 via the merge, as main-authored content (no s057 scope-bleed).
2. **Run deconfliction / hash-verify** on the current s057 when I hand it to you post-merge (the gate you reserved).

## What I do after you land the trio in main

- Revert my stray copy → clean s057 tree (HEAD `memorable-id.ts` is the clean library-dictionary version; confirmed).
- `git fetch origin` → merge `origin/main` → s057 (brings your trio + #25/#32-squash reconciliation in cleanly).
- Re-verify gates (tsc / biome / vitest) post-merge.
- Hand you s057 for deconfliction.
- On Jordan's typed word: push `s057` → origin (14 unpushed commits) + open PR vs `origin/main`, framed around the PIVOT (deploy-from-worktree + fleet-dogfood + store-native; data-migration cancelled) so reviewers aren't misled by the stale branch name.

I don't revert/merge/push until the trio is in main + Jordan gives the push word. `pij-cli.cjs` carries a harmless +x mode change (keep — a checkout should be executable for worktree-linking).
