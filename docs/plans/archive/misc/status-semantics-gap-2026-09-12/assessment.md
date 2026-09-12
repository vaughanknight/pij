# Status semantics: what rs lost against the TS version

Asked by Jordan via Telegram 2026-09-12: "where are we on semantics. Prime and workers etc. needs assistance etc. the pij status stuff still felt watered down in chainglass compared to ts version." Measured on main dd5b61fa, daemon 78248.

## 1. There is no badge in rs. This is the whole feeling.

TS computed one worst-first value per seat (`core/state.ts` `badgeOf` + `BADGE_SEVERITY`): an explicit 15-value severity order over BOTH axes, taken across every OPEN assignment, so a seat done on A and blocked on B badges `blocked`. Its comment states the intent: "the badge is the single entry a human must see first", ranked terminal failure → declared failure → wedged or asking → ambiguity → calm.

```
dead failed stalled blocked question hold stopped unknown waiting starting working ready cancelled done idle
```

rs computes nothing of the kind (`grep -i badge crates/` finds only the word "badger" in the name corpus). So chainglass either invents its own ranking or shows raw fields, and no single cell says "look here first".

## 2. Both state vocabularies are narrower

Semantic axis, agent-declared:

| | values |
|---|---|
| TS | blocked, question, hold, waiting, ready, **failed**, **cancelled**, done |
| rs | Ready, Waiting, Hold, Blocked, Question, Done |

`failed` and `cancelled` do not exist on rs, so a seat cannot declare that its work failed as distinct from being blocked, and closed-without-action cannot be distinguished from done.

Mechanical axis, pij-computed:

| | values |
|---|---|
| TS | starting, working, idle, **stalled**, **stopped**, **dead**, **unknown** |
| rs | Idle, Working (liveness reported separately as a different field) |

`stalled` is the important loss: TS defined it as claims-to-be-working-and-gone-silent, computed from event age. rs cannot express it, and its own state card says why — `liveness:stale` is listed as unsupported with the note that an rs `active` covers both the TS `active` and the TS `stale` case, "a weaker claim, not the same one".

## 3. Fourteen fields the card itself declares missing

`pij state <id> --json` carries an `unsupported` array, each entry with a reason. Today: lifecycle, activity, lastEventAt, ageMs, liveness:stale, daemonLastTickAt, daemonTickAgeMs, daemonTickStale, failureReason, bindHealth, degraded, degradedReason, terminal, watchdog.

The load-bearing ones for a status view are `lastEventAt`/`ageMs` (without them nothing can say "silent for 40 minutes", which is what makes `stalled` computable), `failureReason`, and `bindHealth`/`degraded`.

## 4. What rs has GAINED, so the picture is fair

`role` (plan 139), `assignment_id` + `refs` on declared states (plan 145), `extension_build` + `extension_path` (plan 144), status cards with `statusPrev`/`statusNext`/`statusAt`/`statusStale`, tombstones with a reason, and per-query process liveness instead of a stamped heartbeat. The axes are cleaner than TS: observation and declaration are stored separately, and a parked seat is never nudged (TS defect 9).

## 5. Recommended plan shape, cheapest first

1. **Badge, ported not reinvented.** Take `BADGE_SEVERITY` and `badgeOf` as the spec, compute it in `pij_core` over the seat's system state plus every open assignment's semantic state, project it on the state card and the roster. Immediate chainglass win, no new storage.
2. **Widen the vocabularies.** Add `failed` and `cancelled` to the semantic axis; add `stalled`/`stopped`/`starting`/`unknown` to the mechanical axis as projections rather than stored fields where possible.
3. **Event age.** `lastEventAt` is the prerequisite for `stalled` and for honest `ageMs`; the card's own note says deriving it needs a spine scan per read, so it wants a maintained column, not a query.
4. **failureReason and bindHealth** last: they need a classifier, and TS's death-reason regexes are a starting point but were content-scraping, which has already bitten us once.

Note on ordering: 1 and 2 are worth doing together, because a badge over a vocabulary that cannot say `failed` or `stalled` still cannot show the two states an operator most wants to see.
