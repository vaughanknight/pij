# Plan 147 — consistent badges and event freshness

Owner: pij-minor-unicorn (prime). Ruling: Jordan 2026-09-12 — "the pij status stuff still felt watered down in chainglass compared to ts version", then "you can work with chainglass prime pij-lonely-antelope to integrate here too". Requirements answered by the chainglass o-prime (pij-chief-roadrunner) with file:line evidence from the consumer; its answer is quoted where it constrains us.

## Two facts that set the order

1. **chainglass already renders all of this.** Its render path was built for the TS source and is intact; it receives `undefined` from rs and degrades honestly. `badge` is consumed verbatim and chainglass is contractually forbidden from deriving it (its plan 089 AC-03). A row without `liveness` prints the literal text "liveness unavailable from pij-rs", and one such row disables the idle filter for the whole fleet. So every field below is a render that exists and is starved, not a feature to design.
2. **The mechanical axis is frozen, which the prime verified rather than inferred.** `SystemState::Working` has no production writer. The badge in 147 reports row-available mechanical state and open-assignment declarations, identically on roster and card. Plan 148 owns native activity publication and batch process-liveness observation; 147 does not disguise either missing observer as a present value.

## Frozen field names (chainglass will map these and drop them from `rsUnavailable`)

| field | type | where | meaning |
|---|---|---|---|
| `badge` | string, closed vocabulary | `/v1/seats` row AND `/v1/state` card | worst-first over both axes |
| `last_event_at` | epoch ms, nullable | `/v1/seats` row AND `/v1/state` card | most recent spine event for the seat |

Nothing is joined per row. If a value cannot be produced in the roster query it does not ship in this plan.

## Acceptance
- AC1 **Badge, ported not reinvented.** Port `BADGE_SEVERITY` and `badgeOf` from `.pi/extensions/pij/core/state.ts` into `pij_core` unchanged in ORDER and SPELLING: `dead failed stalled blocked question hold stopped unknown waiting starting working ready cancelled done idle`. Computed over the seat's mechanical state plus every OPEN assignment's declared semantic state (a seat done on A and blocked on B badges `blocked`); no candidates at all badges `unknown`. Pure function, exhaustive over both enums, pinned by a test that fails if a value is added to either vocabulary without a severity slot.
- AC2 **SPLIT OUT — see plan 148.** The mechanical axis does not move in this plan. The coder traced the honest Pi/OMP runtime hooks, but publication needs extension-only capability binding and incarnation-safe writes. Roster liveness also requires a batch observation seam: stored PIDs are not process observations. Neither is implemented here. The badge consults only row-available mechanical and semantic facts, never live liveness, on BOTH roster and card.
- AC3 **`stalled` also moves to 148**, because it is defined as claims-working AND silent, so it cannot exist before `working` does. `starting`/`stopped` go with it.
- AC3a **Per-value honesty table.** The frozen vocabulary includes unreachable values: `working` and `starting` have no publication path (148); `stalled` needs working plus event age (148); `stopped` has no observation; `dead` is not derived because the badge never consults liveness. Every harness mechanically reports `idle` today; it means not observed, not proved idle. The existing state-card `liveness` field remains separate and unchanged. Say all of this per value.
- AC4 **`failed` and `cancelled` on the semantic axis**, reachable through `pij report state`, so the badge can say them. chainglass renders them the moment they are in the badge vocabulary. Additive; old rows read back.
- AC5 **Roster and card carry `last_event_at`, not roster liveness.** Epoch milliseconds or null, from the same SQL snapshot as roster status; no per-seat call or per-row fan-out. Measure ~91 seats before and after. Do NOT emit `liveness:"unknown"` on every roster row: mere field presence enables the consumer's idle filter over unusable data. Roster liveness stays absent until 148 supplies real observations. This split is the coder's evidence-backed finding.
- AC6 **One vocabulary, one definition, citable.** Publish the closed badge order once, in code, and expose it so a consumer can colour by string without guessing severity: a `/v1/vocab`-style constant or an equivalent the docs can cite. The names in this plan's table are frozen; changing one is a ruling, not an edit.
- AC7 Tests, RED first: exact severity and exhaustiveness over BOTH full vocabularies; multiple open assignments; no inputs; roster/card badge agreement even when live card liveness disagrees with stored mechanical state; event freshness; old records without events read back. Working/stalled transitions and liveness-derived badges are not 147 claims.
- AC8 **Isolated live proof.** Read roster and card showing the same badge and epoch-ms `last_event_at`; a declared blocked seat badges blocked over mechanical idle; roster liveness remains absent and card liveness retains its existing independent meaning. Report ~91-seat before/after query timing. Production observation belongs to the prime; name anything unproved.
- AC9 **Docs and unsupported fields.** Update `docs/how/pij-rs-api.md` roster and state-card sections with badge, `last_event_at`, the per-value vocabulary/coverage table, and the roster-liveness gap. Remove only unsupported entries actually made real; existing state-card liveness semantics remain unchanged.

## Carried to the following plan (consumer-supplied, do not lose)

From the chainglass o-prime, checked in its code rather than recalled:

- `currentTask` IS a real gap. My earlier note that its spine poller covers it was wrong: `report.now` folds into the status CARD (did/next, `pij-poller.service.ts:279-291`), while the task line reads `currentTask` from the row or tree (`lib/fleet-grouping.ts:131-137`) and rs supplies neither. Deferred with `bindHealth`, because the card is what humans read and it already works.
- **When `currentTask` is implemented, a cleared task must be an explicit `null`, never an omitted key.** An omitted key falls through to the legacy tree shape (comment at `fleet-grouping.ts:125-130`), so omission silently resurrects stale text instead of clearing it.
- If AC2's honest signal turns out to be recency rather than work, chainglass renders it as observed-recent; the vocabulary doc must say which fact each value derives from (AC2a).

## Non-goals
`bindHealth` / `degraded` / `failureReason` (needs a classifier; next plan — chainglass ranks it sixth). `contextCurrent` / `contextMax` (seventh). `activity` / `currentTask` (chainglass says its spine poller may already cover it). The chainglass mapper itself — the chainglass prime owns that and will dispatch it once these names are frozen.
