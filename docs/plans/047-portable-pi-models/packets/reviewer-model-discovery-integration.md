# Cold review packet — merged model-discovery integration

**Reviewer**: `pij-grubby-marsupial`
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s047-portable-pi-models`
**Branch**: `s047/portable-pi-models`
**Base**: `origin/main` at `940557a` (PR #12 merged)
**Target diff**: `docs/how/pij-models-discovery.md` only

## Mission

Review the post-PR12 integration of s047 portable-catalog ownership into the merged model-effort discovery guide. Confirm the edit adds the repo-source→runtime-sync contract without overwriting, weakening, or contradicting PR12’s GPT-5.6 effort correction.

## Required checks

1. Read the full merged guide and `git diff HEAD -- docs/how/pij-models-discovery.md`.
2. Confirm these PR12 contracts remain intact:
   - raw `github-copilot` row + Copilot seed clone retained;
   - exact GPT-5.6 Sol/Terra/Luna correction to `none, low, medium, high, xhigh, max`;
   - fallback aliases remain unverified while carrying curated capability data;
   - no provider-prefix normalization; Pi pass-through behavior unchanged.
3. Confirm s047 adds accurately:
   - runtime source remains `~/.pi/agent/models.json`;
   - repo authoring source is `.pi/models.json`;
   - `just sync-models` replaces exactly `github-copilot`, `sakana`, `openrouter` and preserves unmanaged/local providers;
   - auth stays private; temporary target guidance prevents real-home test writes;
   - Copilot authoring guidance now uses repo source + sync + canary, while snapshots remain fallback-only.
4. Verify no other product/config/doc diff was introduced by this integration.
5. Fresh proof already run after rebase: model + sync targeted tests 113/113 green; typecheck/lint/full unit/windows/package/snapshots green. Full smoke alone fails at the known shared worktree Pi trust selector; do not chase or rerun it.
6. Run `git diff --check` and any cheap textual/source checks needed. No mutation gate is required for this documentation-only integration.

## Fence

Read-only except verdict artifact `docs/plans/047-portable-pi-models/reviews/review.model-discovery-integration.md`. Do not edit the target, product/config files, flow files, ledger, auth, skills, home state, daemon, or remote.

## Output

Write the verdict artifact with `APPROVE`, `APPROVE_WITH_NOTES`, or `FIX_REQUIRED`, exact findings, preservation evidence for the effort section, and the honest smoke note. Then send:

```json
{
  "review":"s047-model-discovery-integration",
  "verdict":"APPROVE | APPROVE_WITH_NOTES | FIX_REQUIRED",
  "artifact":"/Users/jordanknight/pi-hacking/pij-worktrees/s047-portable-pi-models/docs/plans/047-portable-pi-models/reviews/review.model-discovery-integration.md",
  "critical":0,
  "high":0,
  "medium":0,
  "summary":"one sentence"
}
```
