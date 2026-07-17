# s054 ↔ s055 convergence note

**Re-sync target**: `s054/pij-grown-up` at `647076a`  
**Contract pins**: spine Seq 442 and Seq 447  
**Landing order**: s054 owns the state-axis substrate; s055 rebases as the second lander.

## Stable contract to consume

S054 owns the descriptor's `systemState` vocabulary and `SEMANTIC_STATES`, plus
its additive semantic/assignment/context state-axis fields. S055 must consume
those names after rebase; it must not fork the constants, invent a parallel
state word, or make watchdog runtime state the public axis.

Seq 442 remains binding during convergence:

- descriptor `lastEventAt` movement is the activity-axis truth;
- watchdog decisions never consult `events.ndjson`;
- watchdog-attributable pane or working-transition movement must not refresh
  `lastEventAt`, re-anchor scheduling, or fabricate recovery.

Seq 447 pins the re-sync to `647076a` and preserves the second-lander rule. In
particular, `.pi/extensions/pij/core/daemon/loop.ts` is not a conflict-avoidance
scratchpad: s055 held it at zero diff and should integrate through the
s054-owned descriptor writer after rebase.

## Post-rebase consumption plan

1. **Use s054's vocabulary directly.** A confirmed watchdog stall projects to
   s054's existing `stalled` semantic/system state through the owner-selected
   writer; no s055-local `SYSTEM_STATES` or alternate status field is added.
2. **Keep evidence and projection separate.** `WatchdogManager` continues to
   own delivered-fire ordinals, typed self-attribution, silent-fire counts,
   watcher capture, and typed real-recovery callbacks. The s054 state layer owns
   the descriptor projection assembled from system, semantic, assignment, and
   context inputs.
3. **Preserve descriptor axis truth.** Scheduling and response attribution keep
   using descriptor `lastEventAt`. Any s054 assignment/context metadata informs
   the semantic projection, not a replacement activity clock.
4. **Clear through recomputation, not a guessed state.** Typed real recovery
   releases the watchdog-owned stalled latch and reason. The s054 state owner
   then derives the correct non-stalled state from current assignment/context
   facts; s055 must not blindly write `working` or `idle`.
5. **Retain compatibility deliberately.** `failureReason:"stalled"` remains the
   machine-stable failure reason while existing state/list consumers migrate to
   `systemState`. If s054 makes the reason derivable, remove duplicate writes in
   the rebase patch only with tests proving old JSON consumers remain honest.

## What stays additive

- `lastWatchdogFireAt` on `SessionDescriptor`;
- `WatchdogSidecar`, pause tiers, watchers, and capture policy;
- `FsWatchdogStore` plus capture-pointer files;
- `WatchdogManager` runtime attribution/episode state;
- `pij watchdog …`, `spawn --no-watchdog`, and watchdog JSON blocks.

None of those contracts needs to rename or own s054's assignment/context
fields. Rebase conflicts in additive type declarations should be resolved by
retaining both sets and importing `SEMANTIC_STATES` from its s054 owner.

## Re-sync checks

- Re-run the combined typecheck and all watchdog manager/daemon tests after the
  rebase; keep the two mutation-sensitive D4 guards load-bearing.
- Re-run the disposable-home AC proof, especially AC-05/06 recovery and root
  stamping, against the converged state projection.
- Assert state/list JSON reports one coherent status story rather than divergent
  `failureReason` and `systemState` claims.
- Keep `core/daemon/loop.ts` zero-diff unless the o-prime explicitly reassigns
  ownership after convergence.

## Open questions for the o-prime re-sync

1. Which s054 function is the single writer/reducer for watchdog-originated
   `systemState:"stalled"` and its recovery recomputation?
2. Does `failureReason:"stalled"` remain a durable compatibility field, or does
   s054 derive it from the system state at projection time?
3. When real output returns while an assignment is still open, which
   assignment/context combination selects `working` versus another semantic
   state?
4. Should `pij watchdog status --json` expose `systemState` directly, or rely on
   the adjacent state/list descriptor block to avoid a second projection?
