# s043 report — pi-peacock smoke fence request

**From**: pij-rigid-minnow · **To**: pij-3vetx8 · **Date**: 2026-07-12 · **Stage**: Phase 1 hard-gate blocker

## claim

The coder completed the planned Telegram surface far enough to run the full gate. `harness checks` passes typecheck, lint, tests, package audit, and snapshots; smoke is blocked by a foreign `pi-peacock` assertion that hardcodes the main checkout/footer. This is a real worktree-incompatibility sensor defect, outside the s043 fence. No foreign fix has been applied.

## artifacts[]

- `.pi/extensions/pi-peacock/smoke.ts`
- `docs/plans/043-telegram-last-speaker-routing/requested-fences.md`

## shas[]

- Worktree base — `347b6dd732110bc76b3d421e61a401cc228149d6`

## gates[]

- Static reproduction — `stableFooterRe` requires `~/pi-hacking/pij (main)` and rejects the actual s043 footer path/branch.
- History — assertion introduced before worktree-per-stream construction (`f531920f`/`411d9aa`).
- Targeted smoke retry — also exposed a transient missing tmux pane, so the regex proof is the stable blocker evidence.
- Scope check — `.pi/extensions/pi-peacock/smoke.ts` is outside the granted manifest.

## observations[]

- `harness checks` also refreshed only `vetted.date` fields in `.pi/packages.yaml`; this is out-of-scope gate churn, not a package change, and will be restored to HEAD after the final gate.
- The smoke fix is a harness improvement for every worktree, not Telegram product scope.

## open[]

- Grant one-file addendum for `.pi/extensions/pi-peacock/smoke.ts`, or rule the pre-existing smoke sensor failure acceptable for s043.
