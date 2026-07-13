# S045 domain integration review - dlg-0004

Verdict: APPROVE_WITH_NOTES

The released integration is additive, domain-consistent, and accurately records the S045 model/effort contract without claiming phase completion or merge. The note is a non-blocking wording precision at the validation/warning boundary.

## Findings

| Severity | File:line | Claim | Evidence | Smallest fix |
|---|---|---|---|---|
| info | `docs/domains/pij-control-plane/domain.md:26,63` | The phrase "reports only positive contradictions" compresses responsibility across two source files. | `validateModel()` in `models/validate.ts:21-27` returns `unknown` for an absent id whenever the supplied list is non-empty. The all-unverified certainty suppression is applied later by `buildSpawnWarning()` in `spawn.ts:758-770`; effort validation itself reports unsupported values only when the selected entry has known levels. The current domain-level behavior remains correct: user-facing warnings are advisory and spawn continues. | On a future domain edit, say that validation returns tagged results while spawn warning composition applies the verified-entry certainty rule. |

## Source checks

| Check | Verdict | Evidence |
|---|---|---|
| Existing PR #9 content preserved | PASS | The domain diff is 17 additions and 0 deletions; every pre-existing row and section remains intact. |
| Source-location accuracy | PASS_WITH_NOTE | `registry.ts` owns parsing, snapshots, `ModelEntry` capability metadata, and `loadModels()`; `validate.ts` owns pure tagged validation; `spawn.ts` owns warning composition plus Pi, Claude/Copilot, and Codex effort translation. See the wording note above. |
| Registry projections and defaults | PASS | `parseModelsJson()` preserves raw provider rows; `copilotSeedFromPi()` creates the separate `provider:"copilot"` projection; `loadModels()` prefers source-derived same-harness entries over fallback aliases. |
| Verification semantics | PASS | Copilot fallback construction keeps `verified:false` independently from curated `reasoning` and `levels`; the domain contract does not equate capability knowledge with live confirmation. |
| Exact trio and levels | PASS | `registry.ts:64-75,213-234` limits the correction to `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna` with ordered levels `none, low, medium, high, xhigh, max`; the Pi parser additionally requires provider `github-copilot`. |
| Warning and effort translation | PASS | `validateEffort()` leaves unknown/no-level cases alone; `buildEffortWarning()` warns without blocking; Pi appends `:<level>`, Claude/Copilot use `--effort`, and Codex uses `-c model_reasoning_effort=<level>`. |
| Provider-prefix exclusion | PASS | Validation matches normalized registry ids without provider-prefix normalization, while Pi passes the supplied model through and appends effort. The new boundary exclusion matches code and the operator guide. |
| Boundary and dependency ownership | PASS | Shared discovery/validation/translation already lives in `pij-control-plane`; the new Pi/Codex configuration dependency names the two impure inputs read by `loadModels()` and creates no new domain edge. |
| History entry | PASS | The S045 row summarizes the exact correction and preserved behavior without claiming that Phase 1 completed or that S045 merged. |
| Execution chronology | PASS | The log records the initial hold, PR #9 release/rebase, additive T004b integration, and self-check in chronological order. It continues to state that phase completion is blocked by shared smoke. |

## Scope verdict

- The delegated diff contains exactly:
  - `docs/domains/pij-control-plane/domain.md`
  - `docs/plans/045-copilot-5-6-effort-levels/tasks/phase-1/execution.log.md`
- Both changes are additive: domain `17/0`, execution log `13/0`.
- Other orchestrator-owned dirty plan/government files were excluded from this review.
- No product code was re-reviewed or changed, and the reviewer wrote only this required artifact.

## Mechanical checks

- Scoped `git diff --check`: PASS.
- Scoped changed-path verification: PASS, exactly two paths.
- Documented source-path existence: PASS.
- Dimension 0 mutation: N/A for this docs-only integration.
