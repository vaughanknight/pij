# Validation — pij-grown-up-plan.md
**Validator**: validate-v2 (adaptive: lead + deterministic proof + 1 independent critic) · **Date**: 2026-07-16 · **Revision validated**: v1.0.0 → repaired to v1.1.0

## Verdict
✅ **VALIDATED WITH FIXES** — 2 HIGH + 3 MEDIUM findings, all folded into v1.1.0 and re-verified.

- **Target**: `docs/plans/054-pij-grown-up/pij-grown-up-plan.md`
- **Proof**: manifest file-existence sweep (all exist); cited line refs opened (`focus-store.ts:59`, `loop.ts:149` verified; `types.ts:109` was stale → repaired to `106/143/155`); WS-1…6, F-01…10, H-01…06 ids resolve; 5/5 domains in registry; single `**Status**` header; 12 unique ACs all mapped.
- **Thesis**: advanced — the plan turns six human-ruled workshop decisions + the dossier into a buildable 4-phase TDD plan; proof target (Contract) met after repairs.
- **Consumers**: tasks/implement stages + o-prime convergence tracking — satisfied; R3/R4 fences respected (V-04 fix moved live demonstration behind the ship baton).

## Findings (adjudicated; all CONFIRMED, all fixed in v1.1.0)

| ID | Sev | Finding | Fix applied |
|----|-----|---------|-------------|
| V-01 | HIGH | Assignment entity (the ruled per-assignment model) had no storage/id/lifecycle/join spec — unbuildable, and its file shape is a public UI contract (WS-4) | Binding spec block added to Phase 1: `~/.pij/assignments/<asg-id>.json`, memorable-id scheme, `asg-general-<nodeId>` materialized on first write, lifecycle `open→closed(reason)`, project task list = query join; manifest + Delivers updated |
| V-02 | HIGH | `starting` in the ruled vocabulary had no writer/coverage — dead vocabulary in a public contract | 2.6 extended: written at spawn/adopt, holds until first bind/readiness verdict, with just-spawned test; AC-04 + coverage row updated |
| V-03 | MED | Silent deviation from WS-2's literal `~/.pij/projects/<slug>.json` (dir-per-project) + undefined id scheme | Deviation recorded in AC-01 with rationale (consistent with the machine-wide ruling's substance); id = kebab-slug + collision suffix |
| V-04 | MED | 4.5 "two peers" live sweep + AC-07 daemon alert undemonstrable inside the R3 fence (daemon no-hot-reload, restart baton, no global mutation) | 4.5 respecified as isolated temp-PIJ_HOME/fakes/`tick()` harness; new 4.6 ship checklist carries the baton-gated live demo + skill deploy + convergence re-read |
| V-05 | MED | Event-system boundary ambiguous: mechanical transitions spine-evented? one log or two? | Ruling added in 2.6: mechanical-axis transitions append to the spine with `actor: daemon`; anomaly evidence refs point at them; legacy per-peer events.ndjson stays internal, excluded from the public contract |

Also: 1 mechanical repair pre-critic (stale `types.ts:109` citation → `106/143/155`, evidence-pinned).

## Re-verification
Post-fix grep sweep confirms: assignment paths ×3, `starting` ×3, V-markers present, task 4.6 exists with R3-gated wording. History lane: dossier + workshop are the authoritative upstreams and were the plan's inputs (Authoritative); no contradicting history found.

## Open decision (human, non-blocking)
Spine cutover timing (R4 — by design) and axis-disagreement threshold default (ships at 30m tunable).
