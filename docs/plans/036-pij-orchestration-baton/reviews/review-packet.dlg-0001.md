# Review packet — dlg-0001 (phase 1, pij orchestration baton)
**To**: pij-eo0ibv (cold cross-model reviewer) · **From**: pij-1khprxk (orchestrator) · **Repo**: /Users/jordanknight/pi-hacking/pij

You are reviewing a coder's UNCOMMITTED working tree. The coder (a different model) wrote both the code AND its tests — green is a claim, not proof. Your verdict is the real one; be adversarial where it counts.

## Scope

New files (read whole): `.pi/extensions/pij/core/orchestration/{baton.ts,baton.test.ts,cli.ts,cli.test.ts}` · `.pi/extensions/pij/adapters/{baton-store.ts,baton-store.test.ts}` · `.pi/extensions/pij/core/daemon/{baton-sweep.ts,baton-sweep.test.ts}` · `docs/domains/pij-orchestration/domain.md` · `docs/how/pij-orchestration-baton.md`
Modified (review via `git diff <path>`): `.pi/extensions/pij/{cli.ts,daemon.ts}` · `.pi/extensions/pij/adapters/fakes.ts` · `docs/domains/{registry.md,domain-map.md}` · `docs/how/pij.md`

## Contract to review against

- Plan (law): `docs/plans/036-pij-orchestration-baton/pij-orchestration-baton-plan.md` — esp. § Acceptance Criteria AC-01…AC-09, § Implementation store layout, ruling #7 posture (honor system: firm guides never hard-block; ONLY single-holder atomicity + E-PIN-without---repin exit non-zero).
- Rubric: `skills/flow-pair/references/review-rubrics.md` (all 10 dimensions).
- House patterns: repo `AGENTS.md` P1–P10 (pi-free core P2, constructor injection P3, tagged unions P4, `.js` relative imports P7, tests target store P8, no `any`, no inline imports).

## Mandatory checks (each needs evidence in your verdict, file:line or command output)

1. **Dim-0 mutation gate (MANDATORY — no APPROVE without it)**: prove the tests are non-vacuous. Pick ≥2 load-bearing guards (suggested: the single-holder atomicity path in baton-store, and the E-PIN/repin decision in core) and run a RED→restore→GREEN mutation: `just flow-pair-mutate <file> '<sed-expr>'` (or manually: break the guard, show the named failing assertion, restore, show green). Paste the evidence.
2. **AC coverage is real**: for AC-01…AC-09, name the specific test(s) that prove each; flag any AC covered only vacuously or not at all.
3. **Additive-only**: `git diff .pi/extensions/pij/cli.ts .pi/extensions/pij/daemon.ts` — confirm hunks only ADD (new intercept/usage/wiring), never rewrite existing behavior; FX001/FX002-touching code unchanged.
4. **Honor-system conformance**: no ACL/keeper enforcement anywhere; no code path hard-blocks beyond the two sanctioned exits; grep proves no reference to `government/baton-book.md` (AC-07).
5. **Atomicity truth**: the lease is a `wx` no-replace file create (compare `fs-registry.ts` `publishNoReplace` idiom); the JSON metadata swap is NOT load-bearing for single-holder.
6. **Alert-never-auto-reclaim**: sweep emits one alert per transition and NEVER mutates/frees a lease.
7. **Receipts honesty**: daemon-down push paths surface `unverified`/degraded state — never a fabricated success (AC-09).

## Verdict contract

Write your verdict to `docs/plans/036-pij-orchestration-baton/reviews/review.phase-1.dlg-0001.md`: findings table (severity CRITICAL/HIGH/MEDIUM/LOW · file:line · what · evidence), the Dim-0 mutation evidence verbatim, per-AC coverage table, verdict = APPROVE | APPROVE_WITH_NOTES | FIX_REQUIRED. Then `pij send pij-1khprxk "<verdict> — review at <path>"`.

## Forbidden

Fixing code (findings only) · any write outside your one review file · git commit/stage/reset (mutation checks must restore the tree byte-identical — verify with `git diff --stat` before/after) · daemon restarts · `.flow-pair/**`, `the-flow.json/.md`, `government/**`.
