# Validation — pij-watch-rich-notices-plan.md

**Validated**: 2026-07-09 · **Verdict**: ✅ VALIDATED (plan v1.1.0, workshops folded)
**Target**: `docs/plans/034-pij-watch-rich-notices/pij-watch-rich-notices-plan.md` (Simple, CS-3)
**Topology**: lead + deterministic source proof + 1 independent critic (v1.0.0); lead-only re-check (v1.1.0 workshop fold)

## Re-validation — plan v1.1.0 (workshops folded)
Workshops 001 (pointer delivery) + 002 (.gitignore) folded into T009/T011, AC-05, Key Finding 07, Domain Manifest. Lead deterministic re-check: AC-05↔T009↔WS-001 aligned; AC-07↔T011↔WS-002 aligned; core stays git-free (T011 Done-When + Manifest consistent); coverage map complete; no new `[NEEDS CLARIFICATION]`; gates unaffected → **Status READY holds**. No new findings; a fresh critic pass was not warranted (surgical fold of already-approved decisions, no new risk surface). Remaining open Workshop Opportunities: modes CLI surface, diff-library (Spike → T001).

---
## Initial validation — plan v1.0.0

## Proof
Deterministic source spot-check confirmed every load-bearing `path:line` claim against live code:
`watch.ts:121` deliver + `:110` compileWatch (enrichment + gitignore sites); the 5 `mode`-threading sites (`types.ts:136`, `watch-subscription.ts:17` keyOf, `daemon/watch.ts:134` watchKey, `watch-store.ts:6` validator); finding-10 guard `daemon.ts:338`; `formatWatchNotice` `watch-subscription.ts:77-81`; `runWatch` `cli.ts:761`. Reconciler state model = single `this.snapshot` (confirms content-on-`FileMeta` is coherent).

## Findings (all applied — the artifact is this flow's own just-written plan; every fix grounded, none invents new scope)

| Sev | Finding | Fix applied |
|---|---|---|
| HIGH | AC-04 (baseline advance) + AC-05 (pointer threshold) cited tests no task authored → coverage map overstated, G6 partly untrue | T005 + T009 made **Tests-first + impl**, each authoring the named test |
| HIGH | `created`/`deleted` rendering unspecified though both reach the enriched callback (dossier decision #7 dropped) | Added per-verb spec to T008 + new **AC-11** + coverage row |
| MEDIUM | T009 wrote pointer files with no cleanup → unbounded disk growth | T009 Done-When now unlinks the prior pointer per path (bounded) |
| MEDIUM | T003 ("baseline to snapshot") vs Risks ("not on FileMeta / bounded cache") contradicted → implementer must invent the structure | Chose one: under-cap content on `FileMeta`, over-cap → none; aligned T003/T005 + Risks; removed the side-cache phrasing |

## Re-verify
Fixes are self-consistent doc repairs; coverage map now has an authoring task for every AC; G6 (Hybrid, test-first for pure logic) is now fully honest. No gate regressed.

## Thesis
Purpose met — the plan advances "enrich 033 notices with ranges + diff + gitignore, self-snapshot baseline, preserve the spine/finding-10 guard." Target proof (Implementation-readiness) = actual proof after fixes.

## Consumers
Next-phase consumer = the tasks/implement stage (this flow stops at READY per user). Preserved contracts named: finding-10 receipt guard, coalescing, no-hot-reload restart. No external consumer of the plan's shape beyond the flow.
