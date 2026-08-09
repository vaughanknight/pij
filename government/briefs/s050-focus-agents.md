# Stream brief — s050 focus agents research
**From**: pij-primary-carp · **Date**: 2026-07-14T06:29:00Z · **Lifecycle**: reactivated-sqlite-fix-phase

## Structure tree

```text
human
└─ o-prime pij-primary-carp
   ├─ s048 pij-pregnant-dragon · implementation active
   └─ s050 pij-bored-pelican · focus-agent research
```

## Work item

- **Objective**: preserve a peer's native golden context as a named immutable focus agent and launch fresh native-session forks on demand.
- **Proposed surface**: `pij focus save`, `pij focus list`, and `pij focus launch`.
- **Proposed eventual storage**: `~/.pij/focus/`, globally stored with repository-filtered listing.
- **Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s050-focus-agents`
- **Branch**: `s050/focus-agents`
- **Base**: `origin/main@af7dcc84d78e9138b2b30ecce4097ea27c35417b`
- **Orchestrator**: `pij-bored-pelican` remains seated in the canonical checkout and must direct all repository writes to the isolated worktree.

## Phase 1 assignment

Run evidence-first, disposable fork/resume experiments for Pi first, then Claude, Copilot, and Codex. Establish whether each harness can restore or fork true native session context, the exact identifiers/files/flags involved, immutable snapshot requirements, lifecycle and secret boundaries, and the canary needed before a relaunched peer receives work. Use Perplexity only for external CLI/documentation research where local source and executable probes are insufficient.

Return a durable findings report and proposed implementation plan before requesting any product-code fence. Do not design CLI behavior from assumptions or summaries.

## Fences

### Writable

- `docs/plans/050-focus-agents/**`
- `.harness/temp/s050/**`
- Disposable external canary sessions created specifically for the experiments

### Read-only

- `.pi/extensions/pij/**`
- All CLI wiring
- `docs/how/**`
- Existing user sessions, descriptors, and native transcripts
- Persistent `~/.pij/focus/**`
- s048 paths from government spine Seq 211
- Main checkout and index

### Forbidden

- `.the-flow-state.json`
- Direct writes to `the-flow.json` or `the-flow.md`
- `government/**`
- `justfile`
- `RUNBOOK.md`
- `harness/scripts/packages.ts`
- `docs/how/build.md`
- Product implementation, staging, commit, push, PR, merge
- Daemon restart or machine-global installation/config mutation

## Coordination result

- s047 portable models shipped through merged PR #15; its branch/worktree is stale residue, not an active owner.
- s049 local-path portability shipped through merged PR #18; its branch/worktree is stale residue, not an active owner.
- s048 is active but has no overlap with this research-only fence.
- Request a refreshed implementation release with exact paths after Phase 1 evidence and planning are complete.

## Current implementation coordination

- Spine Seq 258 supersedes the research-only write fence with an exact implementation touch set.
- Ordinary edits and hermetic gates inside the dedicated s050 worktree/branch are notify-only; touch-set additions are recorded and reported, not permission-requested.
- Descriptive plan-record additions: `docs/plans/050-focus-agents/execution.log.md` plus task-checkbox updates in `focus-agents-plan.md`. These are canonical implementation records; the flow-pair ledger does not replace them.
- `harness checks` consumes the live `pij-skill-check` sensor currently changing under Seq 285. Coding/review may continue, but final acceptance requires one full gate against the settled, reviewed r4 sensor.
- Seq 258's explicit no-commit/no-push hold remains binding. Synchronize before base movement, landing/merge, shared runtime proof, or any other shared mutable resource.

## Ship precondition

- Superseded: Jordan directly authorized ship before Seq 303 arrived.
- PR #23 merged green as `591f188f394ab17d8c34a800fd55f87c752d4005`; do not re-run ship preparation.
- Product runtime closeout is complete: canonical runtime subtree is clean at merged main, global focus CLI works, and source verification proved no daemon restart is required.
- Jordan directly reactivated plan 050 for a SQLite-backend fix phase; teardown is paused.

## SQLite fix phase

- Amend the existing plan and produce fix-phase tasks in the retained s050 worktree.
- Before product edits, use a fresh clean hotfix branch/worktree from current `origin/main`; do not build code on the merged branch carrying excluded package drift.
- F.1 disproved the SQLite-transcript hypothesis: Pi `.sqlite` files are todo sidecars; transcripts remain JSONL.
- Root defect is drift-prone transcript-id/path resolution.
- Locked design: in-session `pij_focus_save` tool plus durable `descriptor.transcriptPath` captured from `ctx.sessionManager.getSessionFile()`.
- Real acceptance must cover a representative long-running Pi session and exact transcript-path capture, not infer by session id.
- Keep `.pi/packages.yaml` excluded; no daemon change unless source proof requires one.
- Pending owner question: whether optional message/fork-point selection belongs in this hotfix before F.2–F.4 tasks are rewritten.
