# Validation — fail-loud-model-plan.md

**Validated**: 2026-06-28 · **Verdict**: ✅ VALIDATED WITH FIXES
**Target**: `docs/plans/023-fail-loud-model/fail-loud-model-plan.md`
**Mode**: adaptive (lead + deterministic proof + 1 independent critic)

## Thesis
Plan advances its purpose — fail-loud model resolution via discovery + warn-don't-block validation + a daemon whole-life creator push. Evidence base (research-dossier.md) is sound; all cited symbols/lines verified against current source. Five task-specification gaps found and repaired in-plan (concrete catch-points named); no gate failed.

## Deterministic proof (lead-read)
- Cited symbols all resolve: `cli.ts:85-90` pass-through admission ✓; `loop.ts:97` `observeActivity` ✓, `:191` deterministic-bind ✓, `:168-174` init-inject ✓, `:124-143` dead-pane/`fail()` ✓; `binding.ts:34/104/113` `markFailed`/`buildBoundNotice`/`buildFailedNotice` ✓; `state.ts:7/33` `STALE_AFTER_MS`/`liveness` ✓.
- `boundModel`/`failureReason` confirmed **absent** from `types.ts` → additive change valid.
- External assumptions verified: `pi --list-models [search]` exists (ships fuzzy search); pi `models.json` carries a real `github-copilot` provider section (12 entries) → copilot seed-from-pi strategy grounded.
- `observeActivity` is **pure** (no delivery port; returns `null` for non-busy/ready) and called from `daemon.ts:96` → confirms the push must live in the impure tick.

## Findings (all repaired in-plan)

| Sev | Finding | Evidence | Fix applied |
|---|---|---|---|
| HIGH | F3 — plan put the stalled/dead push in pure `observeActivity`, which can't push and can't see a dead session | `loop.ts:97-111` (pure, early-`null`); called at `daemon.ts:96` | Relocated to the impure `daemon.ts` tick (KF-07, Domain Manifest +`daemon.ts`, T011/T012) |
| HIGH | F1 — first-inference bind gate had no specified trigger | `loop.ts:191` binds before any turn | Anchored on the **init-inject turn** (`loop.ts:168-174`); gate the bound-notice on it not erroring (KF-08, T010, AC-04) |
| MED | F2 — claude bad-model catch-point unmapped | tmux runs in-pane → stderr is **pane text**, not process stderr | Detectors read `capturePane`; plain claude already → `classifyReadiness "dead"` → `fail()`; refine its reason (T009/T010, AC-04) |
| MED | F4 — once-per-transition latch had no home (`settled` is per-boot) | `DriveState.settled` @`loop.ts:62` is per-pending-session | Specified a per-bound-session latch: descriptor `lastFailurePushAt?` **or** daemon-side `Set` (T012) |
| MED | F5 — AC-04 smoke fake boundary undefined | T014 induced a "bad spawn" with no live harness | Mock `capturePane`/transcript to surface the model-error line; assert `fail()`+reason+push (T014) |

## Consumers
STANDALONE — the next consumer is the implement verb (Simple mode, single phase); no external named consumer. Descriptor schema change (`boundModel?`/`failureReason?`) is additive — no existing reader breaks.

## Re-check
Edited claims re-verified against source (init-inject line range, daemon.ts tick, dead-pane path). Gate Matrix unaffected (structural gates still PASS/N-A). Status remains READY.
