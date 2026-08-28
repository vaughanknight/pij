# Cold review brief — Phase 2b (item 1b, dispatch-record retire + carried T011–T013) — dlg-0010
**Reviewer**: cold cross-model (claude-opus-5 via copilot) · **Repo**: `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core` (READ-ONLY except the verdict file; no commits; no `npm link`; never touch the live daemon) · **Target**: branch `s391/item1b-dispatch-retire` @ `ad265b1e52029f298d4f0c015d750e72e1e46d22` on base = `git merge-base origin/main HEAD`; freeze = `git rev-parse HEAD` must match, name it.
**Rubric**: `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/skills/flow-pair/references/review-rubrics.md`; Dim-0 mandatory. **Plan**: § Phase 2b, AC-11..14; rulings: re-scope (i), PA REFUSE for `dispatch-retire`, revive un-retire under the R-5 guard; dossier `tasks/phase-2b-item-1b-dispatch-retire/tasks.md`.

## Aim
1. **Additive platform contract**: `DISPATCH_STATES` gains `retired` ONLY; `retirement?` optional; a legacy record (no `retirement`) round-trips byte-identical through `canonicalDispatchJson` (field order: new field LAST). Spine/attest hashing of existing records unchanged.
2. **Pure transitions**: `retireDispatch` idempotent on `acked`/`retired`; `unretireDispatch` restores `priorState` ONLY for `retirement.reason === "recipient-closed"`; `acknowledgeDispatch` refuses a retired record.
3. **Detector**: `delivered-unacked-stale` never fires on `retired`; still fires on `delivered-unacked`.
4. **Verb + PA**: `dispatch-retire` core-parsed like `ack-dispatch`; classified `refuse`; scrape catches it; `--reason` mandatory; `--to <seat>` retires all open records for that recipient; `--dry-run`; `--json {retired, matched, reason}`.
5. **Sweep arm + revive**: same complete-close predicate as item 1 (dissolved ∧ closeIntent ∧ terminal.requested ∧ no revivePendingAt); pane-gone / live-with-closeIntent untouched; revive restores ONLY `recipient-closed` retirements; operator-retired stay.
6. **Carried items**: T011 lifecycle-guard fixture + hoisted null-guard (Phase 2 F-9); T012 `--to X --all-recipients` → E-ARG (F-10); T013 FX-01 pins in their own `it()` names (F-11).
7. **Scope**: diff ⊆ packet allowed paths; no `skills/**`.

## Dim-0
- Drop the `reason` filter in `unretireDispatch` → "operator-retired stays" RED.
- Remove the detector skip → retired-record test RED.
- Drop the lifecycle clause (with the null-guard hoisted, it must be independently mutable now) → T011 fixture RED.
- Remove `"dispatch-retire"` from `PA_VERB_CLASSIFICATION` → scrape RED.
- Restore byte-identical each time; final `git status --porcelain` = untracked orchestration docs only.

## Gates
- `npx vitest run .pi/extensions/pij/` via `pij bg` → 0 fail; `tsc --noEmit`; biome on changed files.

## Verdict → `docs/plans/391-day3-core/tasks/phase-2b-item-1b-dispatch-retire/review-01.md`; report `{"verdict","reviewId":"review-01","path","findings","highest"}` via `--body-file`; line 1 = verdict + SHA (C10).
