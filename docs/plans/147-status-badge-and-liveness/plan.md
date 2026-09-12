# Plan 147 — a badge, a moving mechanical axis, liveness and freshness on the roster row

Owner: pij-minor-unicorn (prime). Ruling: Jordan 2026-09-12 — "the pij status stuff still felt watered down in chainglass compared to ts version", then "you can work with chainglass prime pij-lonely-antelope to integrate here too". Requirements answered by the chainglass o-prime (pij-chief-roadrunner) with file:line evidence from the consumer; its answer is quoted where it constrains us.

## Two facts that set the order

1. **chainglass already renders all of this.** Its render path was built for the TS source and is intact; it receives `undefined` from rs and degrades honestly. `badge` is consumed verbatim and chainglass is contractually forbidden from deriving it (its plan 089 AC-03). A row without `liveness` prints the literal text "liveness unavailable from pij-rs", and one such row disables the idle filter for the whole fleet. So every field below is a render that exists and is starved, not a feature to design.
2. **The mechanical axis is frozen, which I verified rather than inferred.** `SystemState::Working` has NO production writer anywhere in `crates/` — the only assignments are inside test blocks (`core/src/delivery.rs:352`, `daemon/src/delivery/mod.rs:3341`, both inside `mod tests`). Live: `state` is `idle` on 91/91 untombstoned seats, and all 641 payload-bearing `seat.put` events ever written say `idle`. **A badge computed over a constant is a badge that can never say `working` or `stalled`**, so AC2 is not optional polish — it is the badge's input.

## Frozen field names (chainglass will map these and drop them from `rsUnavailable`)

| field | type | where | meaning |
|---|---|---|---|
| `badge` | string, closed vocabulary | `/v1/seats` row AND `/v1/state` card | worst-first over both axes |
| `liveness` | `"active" \| "stale" \| "gone" \| "unknown"` | `/v1/seats` row (already on the card) | process liveness, a value not an absence |
| `last_event_at` | epoch ms, nullable | `/v1/seats` row AND `/v1/state` card | most recent spine event for the seat |

Nothing is joined per row. If a value cannot be produced in the roster query it does not ship in this plan.

## Acceptance
- AC1 **Badge, ported not reinvented.** Port `BADGE_SEVERITY` and `badgeOf` from `.pi/extensions/pij/core/state.ts` into `pij_core` unchanged in ORDER and SPELLING: `dead failed stalled blocked question hold stopped unknown waiting starting working ready cancelled done idle`. Computed over the seat's mechanical state plus every OPEN assignment's declared semantic state (a seat done on A and blocked on B badges `blocked`); no candidates at all badges `unknown`. Pure function, exhaustive over both enums, pinned by a test that fails if a value is added to either vocabulary without a severity slot.
- AC2 **SPLIT OUT — see plan 148.** The mechanical axis does not move in this plan. The coder traced the honest signal (the pi/omp extension already learns working from the harness runtime's turn hooks and never publishes it) and reported that publishing it pulls in extension-only capability binding, incarnation-safe writes and liveness persistence — a multi-boundary change. Split accepted 2026-09-12. 147 ships the badge over what is TRUE TODAY; 148 makes the axis move and the badge then gains `working`/`stalled` for free, because the badge is a pure function over both axes.
- AC3 **`stalled` also moves to 148**, because it is defined as claims-working AND silent, so it cannot exist before `working` does. `starting`/`stopped` go with it.
- AC3a **The vocabulary doc must say what is NOT reported yet.** `working`, `stalled`, `starting` and `stopped` are in the frozen order but unreachable until 148, and every harness reports `idle` for the mechanical axis today. Say so per value, so a consumer reads a permanent `idle` as "not observed" rather than as fact. This is the difference between a documented blind spot and a lie.
- AC4 **`failed` and `cancelled` on the semantic axis**, reachable through `pij report state`, so the badge can say them. chainglass renders them the moment they are in the badge vocabulary. Additive; old rows read back.
- AC5 **Roster row carries `liveness` and `last_event_at`.** Both computed in the SAME query as the roster — no per-seat call, no per-row fan-out (the consumer bans it, and pij's own history has a fatal 80s per-row case). Measure and report the roster query time for 91 seats before and after; if either field cannot be produced without fan-out, ship the other and say which.
- AC6 **One vocabulary, one definition, citable.** Publish the closed badge order once, in code, and expose it so a consumer can colour by string without guessing severity: a `/v1/vocab`-style constant or an equivalent the docs can cite. The names in this plan's table are frozen; changing one is a ruling, not an edit.
- AC7 Tests, RED first: badge severity table pinned and exhaustive over BOTH full vocabularies (so 148 adding a reachable value cannot land without a severity slot); badge over multiple open assignments; badge with no inputs; badge picks `dead` from liveness over any calmer semantic state; roster row carries both new fields; old records without them read back. Name each test after the claim. The `working`/`stalled` badge tests belong to 148.
- AC8 Live proof on an ISOLATED daemon: a real roster read showing `badge`, `liveness` and `last_event_at` on the row; a tombstoned seat badging `dead`; a seat with a declared `blocked` badging `blocked` over its `idle` mechanical state; and the roster query timing for ~91 seats before and after. The production observation is the prime's. State anything you could not prove.
- AC9 Docs: `docs/how/pij-rs-api.md` seat-row and state-card sections gain the three fields and the badge vocabulary; the `unsupported` entries that this plan makes real are removed from that array in the same commit (a field cannot be both supported and declared missing).

## Carried to the following plan (consumer-supplied, do not lose)

From the chainglass o-prime, checked in its code rather than recalled:

- `currentTask` IS a real gap. My earlier note that its spine poller covers it was wrong: `report.now` folds into the status CARD (did/next, `pij-poller.service.ts:279-291`), while the task line reads `currentTask` from the row or tree (`lib/fleet-grouping.ts:131-137`) and rs supplies neither. Deferred with `bindHealth`, because the card is what humans read and it already works.
- **When `currentTask` is implemented, a cleared task must be an explicit `null`, never an omitted key.** An omitted key falls through to the legacy tree shape (comment at `fleet-grouping.ts:125-130`), so omission silently resurrects stale text instead of clearing it.
- If AC2's honest signal turns out to be recency rather than work, chainglass renders it as observed-recent; the vocabulary doc must say which fact each value derives from (AC2a).

## Non-goals
`bindHealth` / `degraded` / `failureReason` (needs a classifier; next plan — chainglass ranks it sixth). `contextCurrent` / `contextMax` (seventh). `activity` / `currentTask` (chainglass says its spine poller may already cover it). The chainglass mapper itself — the chainglass prime owns that and will dispatch it once these names are frozen.
