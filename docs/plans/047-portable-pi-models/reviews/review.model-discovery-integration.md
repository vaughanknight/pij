# Review — merged model-discovery integration

**Reviewer**: `pij-grubby-marsupial`
**Base**: `origin/main` at `940557a` (PR #12 merged)
**Target**: `docs/how/pij-models-discovery.md`
**Verdict**: `APPROVE`

## Findings

No critical, high, medium, or low findings.

## PR12 preservation evidence

- The raw `github-copilot` registry row and its `provider: "copilot"` seed clone remain explicitly retained (`docs/how/pij-models-discovery.md:19-24`).
- The exact GPT-5.6 Sol/Terra/Luna correction remains `none, low, medium, high, xhigh, max`, and the same levels still flow to seed clones and fallback aliases (`docs/how/pij-models-discovery.md:38-46`).
- Fallback aliases remain `verified: false` while retaining independently curated capability data (`docs/how/pij-models-discovery.md:43-46`).
- Validation still performs no provider-prefix normalization, and Pi still passes provider-prefixed model ids through unchanged (`docs/how/pij-models-discovery.md:48-51`).
- `git diff HEAD -- docs/how/pij-models-discovery.md` shows that the effort-correction and pass-through sections are unchanged; the integration only updates source descriptions, inserts portable ownership guidance, and revises the Copilot authoring workflow.

## s047 integration accuracy

- Runtime discovery still reads `~/.pi/agent/models.json` (`.pi/extensions/pij/core/models/registry.ts:260-273`), while the synchronizer defaults its repository source to `.pi/models.json` (`harness/scripts/sync-models.ts:53-56`).
- The synchronizer owns exactly `github-copilot`, `sakana`, and `openrouter`, requires exactly those source provider keys, replaces those objects wholesale, and preserves all other target providers and top-level fields (`harness/scripts/sync-models.ts:8,114-156,193-205`).
- `just install` and `just update-pi` invoke `just sync-models`, and the focused variadic recipe forwards `--target` correctly (`justfile:55,112-113,344`).
- The repository catalog contains exactly the three managed provider keys. It contains no resolved credential; Sakana retains a command reference to private `~/.pi/agent/auth.json` (`.pi/models.json:2-3,122-126,162`).
- The temporary-target warning prevents fixture or diagnostic proof from writing the real home registry, while normal operation retains the default runtime target (`docs/how/pij-models-discovery.md:35-36`; `harness/scripts/sync-models.ts:292-322`).
- Copilot authoring guidance now correctly directs portable entries to `.pi/models.json`, then `just sync-models`, then a canary; `copilotSnapshot()` is explicitly fallback-only (`docs/how/pij-models-discovery.md:75-79`).

## Scope and proof

- `git diff --name-status HEAD` contains only `M docs/how/pij-models-discovery.md`; the untracked review packet is coordination material, not an integration product/config/doc change.
- `git diff --check` passes.
- The packet reports 113/113 targeted model and sync tests green, with typecheck, lint, full unit, Windows compatibility, package audit, and snapshots green after rebase. These gates were not redundantly rerun for this documentation-only review.
- Full smoke alone remains blocked by the known shared-worktree Pi trust selector. Per the review fence, smoke was not rerun and the external blocker was not chased.
