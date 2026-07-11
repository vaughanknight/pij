# Orient — local (lever 2)
**Scope**: THIS REPO (pij). Written fresh 2026-07-11 by pij-3vetx8; the o-prime's live tuning surface.
**Writer**: pij-3vetx8

## What this project is

pij is the **peer fabric itself**: a pi extension + `pij` CLI + machine-wide daemon that lets agent sessions across tmux panes discover, message, spawn, govern, and tear down each other (claude/copilot/codex/pi harnesses). This repo also ships the `/pij` router skill — including the **prime route you booted from**. You are working INSIDE the tool you are using: expect recursion, and treat it as a feature (your frictions are encode candidates for the very payload that briefed you).

**Mandatory orient reads** (do not auto-load): `docs/how/pij.md` (operating guide), `AGENTS.md`, and for plan 036 specifically `docs/plans/035-o-prime-routing-skill/requirements-spine.md` § R4.3/R4.4/R9.7.

## What matters here

- **The daemon is live and shared**: it runs YOUR delivery too. Extension edits (`.pi/extensions/pij/**`) do nothing until a daemon restart (C6), and a restart interrupts every live peer machine-wide — that's why `daemon-restart` is a baton.
- **The skill is live-deployed by symlink**: edits under `skills/pij/**` are instantly live for every agent on the machine. Treat skill-text edits like production pushes; `just pij-skill-check` is the gate and it is load-bearing (mutation-proven).
- **Additive schema discipline**: `SessionDescriptor` changes are additive/migration-safe only (`core/types.ts:109` comment class); legacy descriptors must always load.
- **Regression history is law**: FX001/FX002 + the 035 dissolved/staleness/pinning tests must stay green — they encode live incidents.
- **TDD with fakes**: every module has a `.test.ts` sibling; fakes live in `adapters/fakes.ts`; mutation-gated review is house practice.

## The harness surface

- Cheap gate: `npx vitest run .pi/extensions/pij/` + `just pij-skill-check`. Full pre-ship: `harness checks`.
- Flows: builder flight-plans via `harness flow` only. The o-prime's portfolio: `government/prime-flow.json` (read-only to streams).
- Capture friction the moment it bites: `harness observe "<what>" --kind <friction|win|…>`; ride your reports' `observations[]`.

## Repo mechanics (per-repo config, binding)

- **Batons**: daemon-restart · git-index (pathspec-mandatory commits; commit-slot when apply windows live) · push-main. Book: `government/baton-book.md`.
- **Never stage**: `.flow-pair/**` (gitignored ledger), `scratch/**`, `node_modules`, `session-store.db`, `government/prime-flow.json` render artifacts follow flow rules.
- **Fleet defaults**: coder + reviewer via `/pij pair`, copilot `gpt-5.6-sol` xhigh (canary the effort mechanically — self-reports have lied; process args are truth).
- **Human channel**: Jordan works in-pane; `pij-telegram` exists for one-liners (main events only).

## Current portfolio

- s036-baton: P-07 primitive under the ruled `pij orchestration <primitive>` namespace — the first stream of this government. Prior art trail in `docs/plans/036-pij-orchestration-baton/original-ask.md`.
