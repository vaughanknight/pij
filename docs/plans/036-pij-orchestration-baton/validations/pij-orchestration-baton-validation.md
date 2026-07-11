# Validation record — pij-orchestration-baton-plan.md
**Validator**: /validate-v2, run in a COLD Opus-class subagent (Claude Code Agent id `a8293a17938ebb333`, model `opus`), Jordan-directed
**Run**: 2026-07-11 (~09:05Z) · read-only (by orchestrator instruction — which is why this record is persisted post-hoc by the orchestrator, quoting the subagent's returned verdict verbatim below)
**Target**: `docs/plans/036-pij-orchestration-baton/pij-orchestration-baton-plan.md` (unified SDD plan, Simple, READY)

## Verdict

**✅ VALIDATED — no material issues. Zero CRITICAL/HIGH/MEDIUM findings survived verification. Plan is implementation-ready as written.**

## Proof lines (subagent's, verbatim)

- **Code patterns cited exist**: atomic no-replace claim idiom `openSync(tmp,"wx")`+`fsyncSync`+`linkSync(EEXIST→exists)` at `.pi/extensions/pij/adapters/fs-registry.ts` `publishNoReplace` (~331–340; Finding 01's `:329` is the method-decl line — points at the right code). `core/daemon/lock.ts` is a pure tagged-union decision (`LockDecision`), matching T003's "mirrors lock.ts shape". `core/receipts.ts` carries the exact `queued|delivered|unverified` vocabulary (line 22) with reusable `classifyOnInject`/`initialReceipt`/`markDelivered` exports for the notice path (Finding 04, AC-02/AC-09).
- **Watch verb-family template real**: top-token intercepts confirmed in `.pi/extensions/pij/cli.ts` — `watch` at :1791, `agent` at :1812 (T007 "intercept mirrors agent" is exact); `core/watch-subscription.ts`, `adapters/watch-store.ts`, `core/daemon/watch.ts` present; dossier's cited intercept region `cli.ts:1752-1853` consistent.
- **Domain registry clean**: `docs/domains/registry.md` has no `pij-orchestration` row (no conflicting home); `pij-messaging`/`pij-control-plane`/`pij-skill` all present as the plan classifies them. T001 legitimately creates the NEW domain.
- **Domain Manifest complete**: every file named by T001–T014 appears in the Manifest with a domain + classification.
- **TDD ordering genuine**: each impl task is preceded by its test task (T002→T003, T004→T005, T006→T007, T008→T009, T010→T011).
- **AC coverage resolves**: AC-01…AC-09 each map to named tasks with a concrete verification.
- **Upstream traceability holds**: rulings #2 (`original-ask.md:8`) and #7 (`rulings.md:9`) exist. Dossier tags F-01/F-09/H-02/H-03/C6/E-22 present with matching evidence; run-01 field claims verbatim in `research/interview-uec99o-answers.vendored.md`. Spine seeds R9.7/R4.3/R4.4 present in `035…/requirements-spine.md`. Regression floor real: `just pij-skill-check` (justfile:163), FX001/FX002 code refs exist.
- **Thesis**: Advanced — the plan faithfully mechanizes the `batons.md` convention; honor-system posture (only single-holder atomicity + `E-PIN`-without-`--repin` block) is internally consistent and matches ruling #7. Target proof level (Implementation, READY) = actual proof.
- **Consumers**: 1/1 satisfied — the implement fleet has a complete, test-anchored task table; no dangling AC, no file named outside the Manifest.

## Non-blocking nits (no fix required)

1. Finding 01's `fs-registry.ts:329` is the method signature; the actual `wx`/`fsync`/`linkSync` lines are a few below — cite the range if tightening.
2. AC-08's `harness checks` gate is a harness-CLI command, not a repo grep hit — worth a one-line pointer, not a defect.
