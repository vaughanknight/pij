# Domain: pij-skill

**Status**: active · **Since**: 2026-07-03 (plan 030)

## Purpose

The operator/agent-facing skill layer over the pij platform — a router (`/pij`) that maps jobs-to-be-done onto protocol modules which drive the `pij` CLI. Composed to the-flow's pattern: dispatch + detection engine + one sibling-blind module per route, progressive disclosure, token-lean by requirement.

## Boundary

- **Owns**: `skills/pij/**` — `SKILL.md` dispatch (route registry, grammar, global invariants, aliases), `references/00-routing.md` (deterministic detection signals + shared conventions C1–C7), `references/routes/*.md` (peer, agent, ops live; pair + delegate land in plan 030 Phase 2); the flow-pair skill **front-door** supersession (shim + doc pointers, Phase 2).
- **Excludes**: the pij CLI itself (→ `pij-control-plane` / `pij-messaging` / `agent-runtime`); the delegation engine, ledger, schemas, prompt-lab (→ `flow-pair`); the SDD pipeline (→ `the-flow`, external).

## Concepts

| Concept | Entry point | Notes |
|---|---|---|
| Route Registry | `skills/pij/SKILL.md` § Registry | route → job → module; pending rows explicitly marked |
| Detection Signals | `references/00-routing.md` § Detection signals | deterministic probes A–E, precedence, hint validation |
| Shared Conventions | `references/00-routing.md` § Shared conventions | C1 harness modes … C7 push-not-poll; single-owner prose |
| Structural gate | `harness/scripts/pij-skill-check.sh` (`just pij-skill-check`) | registry↔module parity, sibling-blindness, line budgets, CLI-verb coverage, dup-prose scope |

## Consumes

- `flow-pair` — pair route shells the `flow-pair` CLI + run ledger (engine untouched)
- `pij-control-plane` — spawn/daemon/adopt/tail/close verbs the routes print
- `pij-messaging` — send/state/list/whoami surface
- `agent-runtime` — the `pij agent` verb family
- `the-flow` (external) — pair route wraps it; never writes its state files

## Invariants

- Skill ≠ CLI: routes print `pij` commands in fenced blocks, never import lib code
- Sibling-blind route modules; convention prose single-owner in 00-routing.md
- Line budgets enforced mechanically: SKILL.md ≤150 · 00-routing ≤250 · pair ≤350 · other routes ≤150
