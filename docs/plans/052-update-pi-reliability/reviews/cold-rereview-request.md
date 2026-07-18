# s052 cold rereview request — Seq 330 corrections

Review the current unstaged diff independently against the original cold review, `reviews/cold-review-fix-request.md`, binding design contract, updated implementation evidence, and final post-fix disposable artifacts.

Read especially:

- `reviews/cold-review.md`
- `reports/implementation-checkpoint.md`
- `reviews/execution.log.md`
- `reports/disposable-validation.md`
- `reports/disposable-harness-checks.json`
- `reports/disposable-validation-inventory.json`

## Required correction adjudication

1. **F1 lock-host authority:** `.npmrc`, fresh/root helpers, Unix pre-dependency root replay, Windows, docs, and tests govern `replace-registry-host=always`; caller case variants/`never` cannot survive. Independently prove the hermetic lock with an upstream-host resolved URL plus caller `never` reaches only fixture proxy, never fixture upstream, keeps the lock unchanged, and retains only age-null root exception.
2. **F2 bootstrap status:** prerequisite/`pi install` execution failures are attempted across all entries, summarized without success shape, and make Unix bootstrap/update nonzero. Vet findings remain report-only for add/bootstrap/audit and strict `pkg vet` is unchanged. Inspect/run the copied-CLI hermetic test; reject any production path override or protected mutation.
3. **F3 corrupt artifact:** corrupt bytes are actually served and exercised; npm exits nonzero, proxy tarball request occurs, upstream requests remain zero. Test-only retry suppression must not leak into production policy.
4. **Runtime hygiene:** the two new scripts contain no opportunistic `npx tsx` shebang; blocked runtime-packaging files remain untouched.
5. **Windows:** real PowerShell restores registry, lock-host replacement, online, age, and before; 30s child < derived 35s named timeout; root mode clears only age/before.

## Full contract and evidence

- Verify current product bytes match the final 30-entry disposable inventory; review/evidence files created after the gate may be documented post-gate drift, but product-file hashes/modes must match.
- Final post-fix disposable `harness checks` must be 8/8 with no skips at exact base/diff, zero npmjs log hits, critical real state unchanged, and protected `.pi/packages.yaml` drift confined to the disposable clone.
- Re-adjudicate the first rejected real-session/cache leak and still-existing residue honestly; no cleanup is authorized.
- Verify index empty and no manifest/lock/settings/package YAML/CI/government/.pi extension/flow-pair/unrelated product diff.
- Consider whether `replace-registry-host=always` now closes every lock-resolved-host path, not only the named test.

Run focused tests, repeated PowerShell, typecheck/lint, release-age probe, and full unit suite as useful. Never run `harness checks`/self-check in the implementation worktree, contact live proxy/npmjs, mutate global state, edit product files, stage, commit, or push.

## Output

Write only `docs/plans/052-update-pi-reliability/reviews/cold-rereview.md` with `APPROVE`, `APPROVE_WITH_NOTES`, or `FIX_REQUIRED`, findings by severity, Dimension-0 reasoning, and exact file/line evidence. Send a pointer-only completion message and idle.
