# Validation — o-prime-routing-skill-plan.md

- **Validated**: 2026-07-11
- **Target**: `docs/plans/035-o-prime-routing-skill/o-prime-routing-skill-plan.md` (sha256 b4389d9dc31f46db…)
- **Contract sources**: `requirements-spine.md` (r4), `workshops/001-prime-route-architecture.md`, `research-dossier.md`, validation brief (implement stage + Jordan as consumers)
- **Checks**: `bash harness/scripts/pij-skill-check.sh` (fresh run — exit 1); stat of all 14 disposition-table sources in `/Users/jordanknight/games/SecondCrack/docs/plans/018-o-prime/`; `core/types.ts` read (ReceiptState:202, boundModel:113, no `dissolved`, no effort field); FX002 doc status + git status (uncommitted, matches Finding 02); `justfile:163` recipe; SKILL.md registry (7 rows → prime = eighth); domains registry rows for all 3 target domains; AC↔task coverage map cross-check; line-budget receipts (o-prime.md 168, kickoff-runbook 47, bootstrap 112); plans 030/032/025 + FX001/FX002 history present
- **Verdict**: NEEDS ATTENTION — 0 critical, 1 high, 4 medium
- **Thesis / proof**: purpose advanced — the plan faithfully compiles spine r4 + workshop tree into executable tasks, and every current-state claim I could test against code held; target proof (implementation-ready contract) → actual proof falls short only where the gate baseline and two upstream-table details are wrong
- **Consumers**: 2 named (implement stage, Jordan) — implement stage blocked at T003's Done-When until F1 fixed; Jordan owes one ack (F5)

## Findings

| Severity | Finding | Evidence | Status |
|---|---|---|---|
| HIGH | Baseline `pij-skill-check` is already exit 1 (`watch` registry row has no module and its "(shipped… no route module)" marker doesn't match the script's pending regex `lands Phase 2\|future`), so T003's Done-When ("check green with new row") is unsatisfiable and Key Finding 05 / dossier F-02's "gate exists" framing implies a green it doesn't have | fresh run: `✗ registry: 'watch' has no module…; exit=1`; `pij-skill-check.sh:18`; SKILL.md:29 | CONFIRMED — fix: pull the baseline repair into T003 or hoist T011 before T003; note the red baseline in T001's snapshot |
| MEDIUM | Vendoring source path wrong in the authoritative disposition table T002 executes "as-is": war-stories row says `briefs/pij-prime-war-stories.md` but the file lives at `government/briefs/pij-prime-war-stories.md` — against a repo ruled unavailable post-035 | stat: MISSING at `018-o-prime/briefs/`, present at `018-o-prime/government/briefs/` | CONFIRMED — fix: correct the workshop row (or add path note to T002) |
| MEDIUM | Gate/content conflict undecided: the workshop's triage probe ④ mandates prime.md redirect workers to `pair`/`peer` (R1.4), but skill-check §2 (sibling-blindness) errors on `routes/pair.md` or `/pij pair` inside any route module; neither T004 nor T011 pre-decides the exemption or phrasing | `pij-skill-check.sh:26-37`; workshop § prime.md contract row "Role triage table" | PLAUSIBLE — fix: one line in T011 ("scoped exemption for prime.md's redirect row") or T004 (phrasing constraint) |
| MEDIUM | Domain Manifest omits `core/receipts.ts` while T014's path list says "core receipts" — contradicts G7 PASS ("manifest covers all task files") and leaves T014's touch surface ambiguous | manifest table vs T014 row; `.pi/extensions/pij/core/receipts.ts` exists | CONFIRMED — fix: add a manifest row (pij-messaging, internal) or pin T014's paths to concrete files |
| MEDIUM | Workshop status is still "Review" ("Jordan's ack flips this to Approved") while the plan declares Status READY and workshop decisions authoritative — the ack is not on disk | workshop header Status line; plan Research Context | CONFIRMED — open decision: Jordan records the ack (flip workshop to Approved) or the plan notes the pending ack |

## Notes (non-findings, verified clean)

- P-gap current-state claims all verified against code: no `dissolved` anywhere, no effort field, `ReceiptState = queued|delivered|unverified` (types.ts:202), boundModel post-inference (types.ts:113), FX002 Complete-but-uncommitted, 019 collision real (git status). Key Findings 01–06 are accurate.
- All 13 other disposition-table sources exist at their stated paths; line-count receipts (levers 73/108, o-prime.md 168, runbook 47, bootstrap 112) match the workshop's claims within wc-newline noise.
- AC coverage map is complete (AC-01..AC-10 each mapped to an owning task with a named verification); severance grep is correctly pinned to the full SecondCrack *path*, so T005's labeled "SecondCrack" worked-example column does not conflict with AC-02.
