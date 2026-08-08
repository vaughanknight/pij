# Stream brief — s051 pij identity integrity
**From**: pij-primary-carp · **Date**: 2026-07-14T08:17:00Z · **Lifecycle**: g7-blocked-terminal-fix-active

## Structure tree

```text
human
└─ o-prime pij-primary-carp
   ├─ s048 pij-pregnant-dragon · release-age implementation active
   ├─ s050 pij-bored-pelican · focus-agent findings research active
   └─ s051 pij-remarkable-hyena · pij integrity orchestrator
```

## Work item

Reconcile and repair the recurring authority/launch defects now tracked as:

- **#19** — Pi resume/re-key can retain duplicate active descriptors for one process and stamp outbound messages with a quarantined alias.
- **#20** — ordinary spawn can derive `spawnedBy`/`parentId` from target CWD instead of the invoking session.
- **#21** — Pi peers cannot boot in worktrees when project-local extensions and global-main extension links load as different real paths.

The stream must identify shared writer/identity seams without collapsing distinct defects into one vague cleanup task.

## Placement

- **Orchestrator**: `pij-remarkable-hyena`, structurally under `pij-primary-carp`.
- **Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s051-pij-identity-integrity`
- **Branch**: `s051/pij-identity-integrity`
- **Base**: `origin/main@5830b279941538593a04483bfc1068911bdd3ffd`
- Remarkable-hyena is a Pi seat and remains physically in canonical main because issue #21 blocks Pi worktree boot. It orchestrates only; every repository write uses the s051 worktree.
- Any coder/reviewer peer must use a non-Pi harness launched from the s051 worktree with explicit caller identity and the full ownership/uniqueness/worktree canary.

## First release

Evidence reconciliation and one integrated implementation plan only:

1. Reproduce each issue deterministically using temp `PIJ_HOME` and synthetic descriptors where possible.
2. Trace every writer and outbound-attribution seam involved in spawn, Pi session-start/re-key, descriptor liveness, close, daemon notices, and extension selection.
3. Define canonical identity, alias retirement, descriptor-only reconciliation, and fail/quarantine rules.
4. Separate immediate safety fixes from optional ergonomics such as `pij spawn --cwd`.
5. Produce tests-first phases, mutation/backpressure proofs, exact files, and a live-canary strategy that cannot harm active sessions.
6. Stop for refreshed implementation release after cold plan validation.

## Fences

### Writable

- `docs/plans/051-pij-identity-integrity/**`
- `.harness/temp/s051/**`

### Read-only

- `.pi/extensions/pij/**`
- `skills/pij/**`
- `docs/how/**`
- `docs/domains/**`
- Existing live descriptors, inboxes, transcripts, and session directories
- s048 and s050 worktree/evidence paths
- Main checkout and index

### Forbidden

- `.the-flow-state.json`
- Direct writes to `the-flow.json` or `the-flow.md`
- `government/**`
- Product implementation before refreshed release
- Stage, commit, push, PR, merge
- Daemon restart or machine-global extension/config mutation
- Send/close/link/delete/prune against shared-process aliases

## Required handoff

Return findings, a validated integrated plan, proposed exact phase fences, and explicit open decisions. Do not start implementation until the prime issues a refreshed grant.

## Current coordination mode

- Implementation remains held through hash-bound rereview and unresolved product decisions.
- Once released, ordinary work confined to the dedicated s051 worktree/branch is notify-only after recording its descriptive touch set; local filename overlap alone is not a grant boundary.
- Synchronize for branch convergence, daemon/live-session use, shared/global state, and package-manifest/completion-sensor work. The known `.pi/packages.yaml` drift remains excluded and untouched.

## Settled decisions

- **D-1**: missing configured package fails before pane creation; no install and no skip.
- **D-2**: unresolved paneless identity is quarantine-only; no manual override this release.
- **D-4**: completion proof is read-only/no-writeback; package-manifest drift remains excluded.

## Current-base precondition

- Final plan/dossier/rereview are accepted and hash-verified.
- The worktree is behind current main, and PR #23 modified G1 file `core/types.ts`.
- Before any T101 product edit: fast-forward to current origin main, preserve/exclude package drift, rerun boot, and produce a targeted G1 base-delta check for `core/types.ts`, `core/identity-integrity*`, and `core/discovery*`.
- If the delta changes the plan, revise and revalidate before implementation.

## G1 review ruling

- Fix the PID-only uncommitted-peer grouping and add dissolved/uncommitted relationship cases within the existing identity-integrity source/tests.
- `just flow-pair-mutate` cannot target G1 suites; do not expand G1 into harness scripts.
- Dim-0 may use isolated manual RED→exact-byte-restore→GREEN mutations against the two targeted G1 test files, with before/after hashes and named failing assertions.

## G5 clarification

- Outer `.pi/extensions/pij/cli.ts` is writable only for `runClose` attachment-context wiring and its targeted tests.
- `.pi/extensions/pij/core/cli.ts` + tests are writable only for list/sessions/state/tree identity diagnostics.
- Extension `.pi/extensions/pij/index.ts` remains forbidden in G5.

## G6 clarification

- Pi spawn documentation draft is limited to `docs/how/pij.md`.
- Deterministic real-Pi package-origin fixture may live under `.pi/extensions/pij/fixtures/pi-extension-sources/**`.
- Adapter/integration tests own temporary HOME/config state; no live/global package state.
- Broader domain/operator documentation remains G7.

## Issue #24 adjudication

- Accepted G4 does not prevent genuine absent caller from becoming generic `operator`.
- Jordan authorized a separate post-G6/pre-G7 actor-authority phase; do not expand G6.
- Candidate production fence: outer `cli.ts`, `core/orchestration/cli.ts`, `core/orchestration/baton.ts`, optional new pure `core/orchestration/actor-authority.ts`, and `adapters/baton-store.ts` only if evidence schema requires it; corresponding orchestration/CLI/store tests and `docs/how/pij-orchestration-baton.md`.
- No live reclaim/lease mutation during implementation; the existing ambiguous external lease remains frozen.
- Receipt ruling: `queued` and `delivered` are executable accepted-delivery states only for the verified named healthy holder with an active matching lease; `unverified`/failed/dead/generic/unaddressable states are non-executable. No second semantic acknowledgment mechanism is required.

## G7 terminal-group blocker fix

- Jordan authorized the narrow descriptor-only terminal-group repair after G7 exposed the Seq 345 post-death composition defect.
- Binding task: `docs/plans/051-pij-identity-integrity/g7-terminal-group-fix-tasks.md`, SHA `e7885b50a87691977f776abcaa59e73ea00eee84ebe1e7d5f1e37147b556e3a1`.
- Frozen baseline inventory SHA: `2f3696a7df0b3693b023707d035bee508b41c36e9d909a023bab609dc6e9f53f`; `core/close.ts` remains byte-frozen.
- Scope is a separate terminal-group planner/port/journal/recovery path, real/fake adapter parity, and test-only close regression. Active boot, re-key, reconciliation, close, and effect behavior must not change.
- G7 remains blocked. Resume requires independent hash-bound mutation review and approval; no live/shared/global action, G7 continuation, commit, or push.
