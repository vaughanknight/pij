# Backpressure Coverage — team-scaffold building blocks

**Plan**: [team-scaffold-plan.md](./team-scaffold-plan.md)
**Basis (plan SHA-256)**: 6cefddcea38412aaa77a3647d74edd9b1120790932c22fa4b5269715c5c29c75
**Supersedes**: bases 17616953…, 1aae1cad… (deltas: AC-11 fold; then re-verify clarity pins — lock-scope + call-site sizing, proof surface unchanged)
**Generated**: 2026-07-20
**Certainty**: Partial

> Advisory only. Never blocks, never gates, no scores. (Advisory backpressure survey.)
> Selection, not enforcement: the proof lines below are what the plan's owner folds into each criterion's "done when".

## Existing Sensors (inventory)

| Sensor | Paved command | Dimension | Found in |
|--------|---------------|-----------|----------|
| vitest suite (~2,900 tests) | `just test` (via `harness boot`) | behaviour | root `vitest.config.ts` |
| typecheck | `just typecheck` | maintainability | root justfile |
| lint | `just lint` | maintainability | root justfile |
| full gate (all sensors, one pass) | `harness checks` (`--quick` skips smoke) | behaviour+arch | `.harness/extensions/checks` |
| smoke | `just smoke` | behaviour | root justfile |
| skill link policy | `just pij-skill-check` | architecture-fitness | root justfile |
| snapshots | `just snapshots-check` | behaviour | root justfile |
| CI (3 checks incl. windows-compat) | `.github/workflows/ci.yml` | PR gate | root |

## Coverage Matrix

| Criterion / failure mode | Phase | Selected proof | Status | Tier | Probe trail |
|--------------------------|-------|----------------|--------|------|-------------|
| AC-01 stream create transactional journal | 1 | EXTEND→RUN: add `core/stream` + `worktree` spec files to suite; then `just test` | EXTEND | computational | — |
| AC-02 no exit-0 no-op path (all verbs) | 1–3 | EXTEND→RUN: wrong-arg spec per verb family; then `just test` | EXTEND | computational | — |
| AC-03 fence ownership query | 1 | EXTEND→RUN: fence-store spec; then `just test` | EXTEND | computational | — |
| AC-04 autonomy lockstep + spine byte-comparability | 1 | RUN: existing canonicalization specs + EXTEND: autonomy cases; `just test` | EXTEND | computational | — |
| AC-05 three dispatch states + sha-mismatch refusal | 2 | EXTEND→RUN: dispatch/ack state-machine spec; then `just test` | EXTEND | computational | — |
| AC-06 `send --wait` regression frozen | 2 | EXTEND→RUN: freeze-test on HEAD behavior (task 2.1); then `just test` | EXTEND | computational | — |
| AC-07 canary pass/refuse matrix | 3 | EXTEND→RUN: canary spec (timeout/mismatch/UNPINNED); then `just test` | EXTEND | computational | — |
| AC-08 phantom-peer guard | 1 | EXTEND→RUN: registry.list() isolation spec (056 precedent exists as template); then `just test` | EXTEND | computational | — |
| AC-09 resolveActor attribution + spine events | 1–2 | EXTEND→RUN: event-emission assertions in store specs; then `just test` | EXTEND | computational | — |
| AC-10 doc commands run verbatim | 3 | BUILD→RUN: doc-walkthrough smoke against scratch project; then `just smoke` (new case) | BUILDABLE | computational | — |
| AC-10 doc/skill quality + kickoff coherence | 3 | `just pij-skill-check` (link policy) + human read | EXTEND + ABSENT (prose quality) | computational + human-judgement | prose quality is inherently judgement; skill-check covers links/structure only |
| Worktree edge cases on real git (dirty tree, existing dir) | 1 | EXTEND→RUN: worktree spec against temp git repos; then `just test` | EXTEND | computational | — |
| Windows path behavior of new stores | 1–2 | RUN: CI windows-compat check (existing) | EXISTS | computational | — |
| AC-11 coupled-write crash consistency (lock + op-journal) | 1–2 | EXTEND→RUN: crash-window replay specs (tasks 1.9, 2.4) + existing recovery suite; then `just test` | EXTEND | computational | — |

## Proof Plan (selected)

### Phase 1: Records + stream/fence verbs
| Proves | Mode | Proof line |
|--------|------|------------|
| AC-01/03/04/08/09 + worktree edges | EXTEND→RUN | new spec files (tasks 1.1, 1.3, 1.4, 1.8); then `just test` |
| AC-11 crash-window replay (stream/fence) | EXTEND→RUN | task 1.9 specs + existing recovery suite; `just test` |
| lockstep integrity | RUN | existing canonicalization specs stay green in `just test` |

### Phase 2: Dispatch receipts
| Proves | Mode | Proof line |
|--------|------|------------|
| AC-05/06/09 | EXTEND→RUN | freeze-test first (2.1), then state-machine specs (2.2, 2.5); `just test` |

### Phase 3: Canary + integration
| Proves | Mode | Proof line |
|--------|------|------------|
| AC-07 | EXTEND→RUN | canary matrix spec (3.1); `just test` |
| AC-10 (commands) | BUILD→RUN | doc-walkthrough smoke case; then `just smoke` |
| AC-10 (links/structure) | RUN | `just pij-skill-check` |
| whole-plan gate | RUN | `harness checks` before ship |

## Certainty: Partial

Counts (behaviour/architecture rows): 2 RUN · 11 EXTEND · 1 BUILD · 1 ABSENT
Recommended next move (per-task lookup, advisory): the EXTEND gaps ARE the plan's tests-first tasks — the extensions are already scheduled as tasks 1.1/1.4/2.1/2.2/3.1, so start building; the one BUILD (doc smoke) rides task 3.4.

Every behaviour criterion lands in the existing `just test` home via specs the plan already schedules tests-first; nothing needs a new sensor surface except the small doc-walkthrough smoke case.

## Recommended Phase 0: Establish Backpressure (build or extend)

| Sensor to build/extend | Proves | Suggested form | Paved command it strengthens/exposes |
|------------------------|--------|----------------|--------------------------------------|
| *(no separate Phase 0 needed)* — the EXTEND rows are already the plan's tests-first tasks in each phase | AC-01..09 | spec files per task table | `just test` (same command, stronger) |
| doc-walkthrough smoke (only genuinely new surface) | AC-10 commands | smoke case running the how-doc's commands against a scratch `PIJ_HOME` | `just smoke` (new case, task 3.4) |

## Closing Verdict

One thing I already did, automatically: I wrote the how-we'll-prove-it commands into this coverage file, matched to each promise in the plan — so whoever picks a phase up sees exactly which command going green means that promise is kept, even after this conversation is gone.

The good news: this plan was written tests-first, so almost every promise already has its proof scheduled — the new specs land in the same `just test` suite everyone already runs, and the full `harness checks` gate covers the ship line. When those commands pass, every machine-checkable promise here is kept. Two things still need a human: the quality of the operator doc and skill prose can only be judged by reading it (no command can), and one small new check — a smoke case that literally runs the doc's commands against a scratch setup — needs your OK as part of the doc task, so the doc can never silently drift from the real CLI. If a check ever passes while a human says the work isn't done, we fix the check first, then the code.

In summary: `just test` + `harness checks` will prove all ten acceptance criteria's mechanical halves once the plan's scheduled specs exist; the doc's prose quality remains a human read; the one approval requested is folding the doc-walkthrough smoke case into task 3.4 (already noted there as "doc's commands run verbatim" — this survey just names its paved home).
