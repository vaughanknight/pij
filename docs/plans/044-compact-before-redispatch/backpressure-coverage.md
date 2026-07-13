# Backpressure Coverage — Completion-First Peer Compaction

**Spec**: [compact-before-redispatch-plan.md](./compact-before-redispatch-plan.md)
**Generated**: 2026-07-12
**Certainty**: Partial

> Advisory only. Never blocks, never gates, no scores. (Advisory backpressure survey.)

## Existing Sensors

| Sensor | Command | Dimension | Found in |
|--------|---------|-----------|----------|
| pij skill structural gate | `just pij-skill-check` | architecture-fitness / maintainability | `harness/scripts/pij-skill-check.sh` |
| copied-skill fixture seam | `PIJ_SKILL_ROOT=<copy> bash harness/scripts/pij-skill-check.sh` | architecture-fitness | `harness/scripts/pij-skill-check.sh:8` |
| readiness proof | `harness boot` | maintainability / behaviour | `.harness/extensions/boot/` |
| full signal inventory | `harness checks` | maintainability / behaviour | `.harness/extensions/checks/` |
| peer event evidence | `pij tail <id> --type tool_call` / raw `events.ndjson` | behaviour evidence | `docs/how/pij.md` |

## Coverage Matrix

| Criterion / failure mode | Deterministic sensor | Status | Tier | Probe trail |
|--------------------------|----------------------|--------|------|-------------|
| AC-01 root completion interrupt disappears | New exact marker assertion in `pij-skill-check` | BUILDABLE | computational | — |
| AC-02 coder completion handles report before compact | Ordered pair-route markers + cold event-order canary | BUILDABLE | computational | — |
| AC-03 reviewer verdict handles findings/sanity before compact | Reviewer-parity markers + cold event-order canary | BUILDABLE | computational | — |
| AC-04 compact waits or receipt gating block report/redispatch work | No-`--wait`, no-receipt-gate assertions + cold continuation trace | BUILDABLE | computational | — |
| AC-05 root invariant 5 / C3 / pair / C7 ownership or delivery wording regresses | Exact root + convention owner markers and responsibility-specific compact/inbox-wait mutations | BUILDABLE | computational | — |
| AC-06 mutation matrix detects contract drift | `PIJ_SKILL_ROOT` copied fixtures | BUILDABLE | computational | — |
| AC-07 a fresh agent's first action is compact | Real isolated coder/reviewer completion scenario + event sequence | BUILDABLE | computational | — |
| AC-08 product paths escape the skill-only manifest | `git diff --name-only` split into exact non-plan manifest paths plus named plan-owned evidence outputs | EXISTS | computational | — |
| AC-09 domain contract omits the new concept | Domain marker assertion / review | BUILDABLE | computational | — |
| AC-10 one-shot auto-dissolve is misclassified as compact failure | C3 boundary marker + recorded `E-DEAD` lifecycle evidence | EXISTS / BUILDABLE | computational | — |
| Universal compliance by every model/session | No finite deterministic sensor proves universal LLM behavior | ABSENT | inferential | searched skill structural checks, agent event logs, smoke/driver scenarios, and current CI under root + `harness/`; only bounded cold-run evidence exists |

## Certainty: Partial

The repository has strong structural and event-evidence primitives, but completion-order sensors must be added in this plan and cold acceptance remains bounded evidence rather than universal proof.

## Recommended Phase 0: Establish Backpressure

| Sensor to build | Proves | Suggested form |
|-----------------|--------|----------------|
| Completion-order and ownership assertions | Root invariant 5 and root/C3/pair/C7 contracts cannot lose compact-first or PR #9 push-vs-pull behavior | Extend `pij-skill-check` with independent root markers/removal mutation plus C7 and compact fixtures |
| Completion-order mutation matrix | Each load-bearing assertion fails for the intended regression | Copied `PIJ_SKILL_ROOT` fixtures under `.harness/temp/s044/` |
| Cold real-peer compact-first canary | A fresh agent acts on the restored contract before report handling | Isolated coder completion + reviewer verdict scenarios with event-sequence capture |

## Suggested "done when" Lines

| For criterion | Suggested line | Backed by |
|---------------|----------------|-----------|
| AC-02 / AC-03 | done when the completion-order marker mutations fail and the cold event trace shows compact as the first post-report tool action | BUILDABLE |
| AC-04 | done when the skill forbids `--wait`, receipts cannot gate progress, and the cold trace continues report work immediately after compact send | BUILDABLE |
| AC-08 | done when non-plan changed paths equal the five implementation files and durable evidence exists only at the plan's named validation/report/review paths | EXISTS |
| AC-10 | done when the one-shot boundary marker is mutation-proven and `validation/one-shot-compact-evidence.md` records expected `E-DEAD` after auto-dissolve | EXISTS / BUILDABLE |
