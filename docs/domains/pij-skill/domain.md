# Domain: pij-skill

**Status**: active · **Since**: 2026-07-03 (plan 030)

## Purpose

The operator/agent-facing skill layer over the pij platform — a router (`/pij`) that maps jobs-to-be-done onto protocol modules which drive the `pij` CLI. Composed to the-flow's pattern: dispatch + detection engine + one sibling-blind module per route, progressive disclosure, token-lean by requirement.

## Boundary

- **Owns**: `skills/pij/**` — `SKILL.md` dispatch (registry, grammar, invariants, aliases), `references/00-routing.md` (deterministic harness/delivery-mode detection + C1–C7), route modules, and the portable prime/orchestrator payload; plus the flow-pair front-door supersession.
- **Excludes**: the pij CLI itself (→ `pij-control-plane` / `pij-messaging` / `agent-runtime`); the delegation engine, ledger, schemas, prompt-lab (→ `flow-pair`); the SDD pipeline (→ `the-flow`, external).

## Concepts

| Concept | Entry point | Notes |
|---|---|---|
| Route Registry | `skills/pij/SKILL.md` § Registry | route → job → module; pending rows explicitly marked |
| Detection Signals | `references/00-routing.md` § Detection signals | deterministic probes A–E, precedence, hint validation |
| Shared Conventions | `references/00-routing.md` § Shared conventions | C1 distinguishes pi push, tmux push, and non-tmux pull; C7 forbids state polling while prescribing blocking `pij inbox --wait` for pull ownership. |
| Pull guidance seam | `references/routes/peer.md` | Non-tmux external peers auto-register on first inbox use and receive via `pij inbox --wait`; tmux/pi peers remain push-first. |
| Completion-first compaction | `SKILL.md` § Global invariants · `references/00-routing.md` § C3 · `references/routes/pair.md` | Reusable/live coder completion and reviewer verdict trigger compact as the first action; dispatch is fire-and-forget, while one-shot auto-dissolve may return expected `E-DEAD`. |
| Structural gate | `harness/scripts/pij-skill-check.sh` (`just pij-skill-check`) | registry↔module parity, sibling-blindness, line budgets, CLI-verb coverage, dup-prose scope, and completion ownership/order markers; copied fixtures mutation-prove the contract, while cold peer traces provide bounded runtime evidence. |
| Registry-first prime triage | `references/routes/prime.md` | resolves self, checks `pij list --prime --here --json`, then falls back to government/human evidence. |
| Stream Orchestrator Landing | `references/prime/orchestrator.md` | module-first role boundary and ordered thesis → preamble → Builder → pair → ship journey. |

## Consumes

- `flow-pair` — pair route shells the `flow-pair` CLI + run ledger (engine untouched)
- `pij-control-plane` — spawn/daemon/adopt/tail/close verbs the routes print
- `pij-messaging` — send/state/list/whoami/inbox surface, including `list --prime`, ambient pull registration, and durable read markers
- `agent-runtime` — the `pij agent` verb family
- Builder / `the-flow` (external) — orchestrator planning and ship plus pair-wrapped implementation; never hand-writes flow state

## Invariants

- Skill ≠ CLI: routes print `pij` commands in fenced blocks, never import lib code
- Sibling-blind route modules; convention prose single-owner in 00-routing.md
- Line budgets enforced mechanically: SKILL.md ≤150 · 00-routing ≤250 · pair ≤350 · other routes ≤150
- Bootstrap/handover persist incoming prime designation before writer-line mutation; handover unsets the outgoing live seat after its final relay.
- Delivery guidance follows product ownership: tmux/pi wait for pushed turns; non-tmux external peers block on `pij inbox --wait` rather than polling state/tail.
- Completion handling is interrupt-driven: compact reusable/live coders and reviewers first, never wait on compact latency or receipts, then continue report/review/fix work immediately.

## History

| Plan | Change | Date |
|---|---|---|
| 044-compact-before-redispatch | Restored completion-first, fire-and-forget peer compaction with structural mutation proof and bounded cold event-order evidence. | 2026-07-13 |
| 041-pij-inbox-no-tmux | Added deterministic no-tmux pull detection and `pij inbox --wait` guidance while preserving push-first tmux/pi behavior and progressive disclosure. | 2026-07-12 |
