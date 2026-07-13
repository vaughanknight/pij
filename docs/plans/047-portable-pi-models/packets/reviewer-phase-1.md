# Cold review packet — s047 Phase 1

**Reviewer role**: independent cold reviewer
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s047-portable-pi-models`
**Branch**: `s047/portable-pi-models`
**Parent SHA**: `3b1a47beaed0455611e443ae8e2827cfb1aa460d`
**Flow-pair**: run `2026-07-12T22-11-49Z-github.com-AI-Substr`, delegation `dlg-0001`, captured diff `diff-0001`
**Plan**: `docs/plans/047-portable-pi-models/portable-pi-models-plan.md`
**Rubric**: `skills/flow-pair/references/review-rubrics.md` (all dimensions; Dimension 0 mandatory)

## Review mission

Review the complete uncommitted Phase 1 implementation for correctness, destructive-write safety, scope, tests, plan/AC coverage, and operational-document accuracy. Form your own findings from the worktree; coder claims are hypotheses.

The coder reported owned implementation complete with 155/155 scoped tests passing. Full `harness checks` passed typecheck, lint, test, package audit, and snapshots; smoke alone is blocked by the known shared worktree Pi trust prompt. Do not attempt to fix, shim, or repeatedly rerun that shared smoke debt.

## Intended product contract

- Version `.pi/models.json` with exactly `github-copilot`, `sakana`, and `openrouter` from the current curated global catalog.
- Exclude the machine-specific `local` provider/LAN endpoint and all resolved credentials.
- Synchronization replaces each managed provider object wholesale while preserving every unmanaged/local target provider.
- Missing target/parent is created; malformed source or target leaves the target byte-identical.
- Same-directory temp+rename persistence; rerun is byte-stable.
- `just sync-models` accepts `--source`/`--target`; canonical install/update invoke defaults.
- No auth/general-skills/settings/session/trust/cache/db ownership and no `pi-doctor` expansion.

## Actual implementation fence

Review these changed product/config/docs files:

- `.pi/models.json`
- `harness/scripts/sync-models.ts`
- `harness/scripts/sync-models.test.ts`
- `justfile`
- `AGENTS.md`
- `RUNBOOK.md`
- `docs/how/build.md`
- `docs/how/update-pi.md`

`docs/plans/047-portable-pi-models/**` contains orchestrator artifacts, not coder product changes.

## Held / forbidden

- `docs/how/pij-models-discovery.md` is held for s045 convergence: verify untouched; do not edit it.
- Do not edit product/config/docs, `.flow-pair/**`, `.the-flow-state.json`, `the-flow.json`, or `the-flow.md`.
- Do not read inbox transport logs.
- No `auth.json`, general skills, `pi-doctor`, real-home writes, `npm link`, daemon restart, push, or remote action.
- Review is read-only except: (a) a temporary mutation that is restored byte-identical, and (b) your verdict artifact at `docs/plans/047-portable-pi-models/reviews/review.phase-1.md`.

## Required proof

1. Check changed paths against the fence, including untracked files.
2. Read full changed files and relevant unchanged contracts.
3. Structured-compare `.pi/models.json` with `~/.pi/agent/models.json` after removing only `providers.local`; prove exact portable payload and no secret/local endpoint.
4. Run:
   - `git diff --check`
   - `npx vitest run harness/scripts/sync-models.test.ts`
   - `just typecheck`
   - `just lint`
   - `harness checks --quick`
5. Exercise `just sync-models --source <fixture> --target <temp>` only against temporary files; never the real home target.
6. **Dimension 0 mutation proof**: empirically break the managed-provider replacement guard in `harness/scripts/sync-models.ts` (for example make existing target providers win), run the targeted suite and require RED, restore the file byte-identical, rerun and require GREEN. Record original/restored SHA, mutation, failing assertion, and GREEN result. For remaining ACs, name exact load-bearing negative/state assertions.
7. Confirm the temporary coder Pi shim is restored and `.pi/packages.yaml` has no diff.
8. Treat the missing execution log as a rubric finding if it is still absent; do not create it yourself.
9. Do not turn the external smoke trust-prompt blocker into an s047 code finding unless this diff caused it.

## Verdict artifact

Write `docs/plans/047-portable-pi-models/reviews/review.phase-1.md` with:

- `APPROVE`, `APPROVE_WITH_NOTES`, or `FIX_REQUIRED`;
- findings ordered by severity, each with exact path/line, proof, impact, and smallest fix;
- all rubric dimensions 0–10 covered compactly;
- mutation RED→restore→GREEN evidence;
- fresh gate results and the honest external smoke note;
- explicit scope/hold verification.

Then send the orchestrator:

```json
{
  "review":"s047-phase-1",
  "verdict":"APPROVE | APPROVE_WITH_NOTES | FIX_REQUIRED",
  "artifact":"/Users/jordanknight/pi-hacking/pij-worktrees/s047-portable-pi-models/docs/plans/047-portable-pi-models/reviews/review.phase-1.md",
  "critical":0,
  "high":0,
  "medium":0,
  "mutation":"RED→restore→GREEN",
  "summary":"one sentence"
}
```
