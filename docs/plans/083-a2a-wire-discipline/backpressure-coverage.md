# Backpressure Coverage — A2A Wire Discipline

**Plan**: [a2a-wire-discipline-plan.md](./a2a-wire-discipline-plan.md)
**Basis (plan SHA-256)**: de804d9d948d4fcbeb1297e3a5341a0193ba68a5f555181f0c1d9bfb483685ac
**Generated**: 2026-08-03
**Certainty**: Partial

> Advisory only. Never blocks, never gates, no scores. (Advisory backpressure survey.)
> Selection, not enforcement: nothing here executes at phase end — the proof lines
> below are what the plan's owner folds into each criterion's "done when".

## Existing Sensors (inventory)

| Sensor | Paved command | Dimension | Found in |
|--------|---------------|-----------|----------|
| typecheck | `just typecheck` | maintainability | root |
| unit tests | `just test` | behaviour | root |
| lint | `just lint` | maintainability | root |
| smoke (tmux e2e) | `just smoke` | behaviour | `harness/` |
| local-path check | `just local-path-check` | maintainability | root |
| composite gate | `harness checks` / `just self-check` | all | `.harness/extensions/checks/` |

None of these read skill prose — the plan's deliverable is markdown under `skills/pij/`, outside every sensor's input surface.

## Coverage Matrix

| Criterion / failure mode | Phase | Selected proof | Status | Tier | Probe trail (required if ABSENT) |
|--------------------------|-------|----------------|--------|------|----------------------------------|
| AC-01..AC-04 (C10 text present, don't-send rules, exception, anti-drift) | 1 | BUILD→RUN: a grep presence-check could pave `just check-skill-conventions` — **ruled out by Jordan's prompting-only constraint**; accepted proof = T008 manual sweep | BUILDABLE (declined by ruling) | inferential (by choice) | — |
| AC-05 (SKILL.md invariant 8 cites C10) | 1 | same as above; manual read in T008 | BUILDABLE (declined) | inferential | — |
| AC-06/AC-07 (13 surfaces cite, none restate) | 1 | same; T008 grep sweep is run by hand, not paved | BUILDABLE (declined) | inferential | — |
| AC-08 (diff confined to skills/pij/** + plan folder) | 1 | RUN: `git diff --stat main` read at review | EXISTS | computational | — |
| Failure mode: convention drifts between canonical copy and citations over future edits | — | no sensor; future prose drift is reviewed by humans | ABSENT | human-judgement | no prose-consistency checker exists; globbed `justfile`, `.harness/extensions/*`, `harness/scripts/*` — no doc-lint sensor |

## Proof Plan (selected)

### Phase 1: Implementation
| Proves | Mode | Proof line |
|--------|------|------------|
| AC-08 | RUN | `git diff --stat main` — only `skills/pij/**` + `docs/plans/083-a2a-wire-discipline/**` |
| AC-01..07 | (manual) | T008 sweep: grep each of the 13 manifest files for the C10 citation; grep for restated rule copies; read-through vs ACs |

## Certainty: Partial

Counts (behaviour/architecture rows): 1 RUN · 0 EXTEND · 3 BUILD · 1 ABSENT
Recommended next move (per-task lookup, advisory): the BUILD gaps exist but their build is **explicitly declined by the product ruling** (prompting-only) — start building; T008 carries the accepted manual proof.

Rationale: only AC-08 has a runnable deterministic proof; the content criteria are machine-checkable in principle but the ruling routes them to a manual sweep.

## Recommended Phase 0: Establish Backpressure (build or extend)

| Sensor to build/extend | Proves | Suggested form | Paved command it strengthens/exposes |
|------------------------|--------|----------------|--------------------------------------|
| skill-convention presence check | AC-01..07 | grep script over skills/pij/ | `just check-skill-conventions` — **noted for completeness; declined by Jordan's prompting-only ruling. Do not build unless the ruling changes.** |

## Closing Verdict

How will we know this work is actually done? One thing I already did, automatically: I wrote this coverage record next to the plan, so whoever picks the work up sees exactly which promises are machine-checked and which are read by a person — even after this conversation is gone. The honest split: the only command-provable promise is that the change stays inside the skill folder and the plan folder (a git diff read at review — when that's clean, no stray files shipped, no judgement call needed). Everything else — that the convention text exists, says the right things, and is cited rather than copied — could in principle be a one-line grep check, but Jordan explicitly ruled this work prompting-only, so building that checker is off the table by decision, not by oversight; the accepted proof is the plan's own final sweep task, done by hand. One thing that stays a human call forever under this ruling: whether future edits quietly restate the convention instead of citing it — no command will catch that, reviewers will.

In summary: the commands will prove only diff confinement; the content promises are verified by the plan's manual sweep task, and long-term citation discipline remains human judgement. No approval requested — the one buildable checker is already declined by your standing ruling, so the recommended move is to start building.
