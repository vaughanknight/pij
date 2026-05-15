# Retro: SQL-backed Todo Extension

**Date**: 2026-05-15  
**Plan**: `010-sql-backed-todo-extension`  
**Companion**: `code-review-companion` run `2026-05-15T16-51-44-687Z-9e83`

## Companion farewell

The companion stood down with `exitReason=idle_budget` before the final validation/fix commits:

> Standing down with exitReason=idle_budget after completing review tasks and receiving no reply to the post-task check-in.

The inside inbox was schema-corrupt for `minih inside inbox list` because one ack line had an invalid `ackOf`, so the farewell and findings were read directly from `agents/code-review-companion/runs/.../inbox/inside/messages.ndjson`.

## Findings outcome

| Finding | Outcome |
|---------|---------|
| F001 HIGH — wrong T002 SHA | Resolved by corrected ping `T002 42d86fd`; logged as D-027. |
| F002 MEDIUM — stale todo smoke | Resolved by T007 full todo smoke. |
| F003 MEDIUM — weak tool schema | Resolved by TypeBox discriminated union in `todo` tool params. |
| F004 MEDIUM — session-sql prerequisite staging | Accepted/mitigated with explicit plan/log/domain-manifest notes. |
| F005 LOW — missing `docs/how/session-sql.md` link target | Resolved by committing the guide. |
| F006 MEDIUM — domain source drift | Resolved by committing the guide and adding session-sql AGENTS to domain sources. |
| F007 MEDIUM — stale reconciliation table | Resolved by updating the execution-log reconciliation table. |

## Orchestrator retrospective

### What worked

- Companion caught real issues cheaply while context was fresh: wrong-SHA review, weak model tool schema, docs/domain drift, and stale reconciliation.
- Session SQL made task progress and research state inspectable during implementation.
- The full `npm run self-check` caught cross-extension validation drift, not just todo regressions.

### What hurt

- The worktree had concurrent Plan 008/009 changes, so commit-boundary review was noisy and `git rev-parse HEAD` was unsafe.
- The companion completed from idle budget before final validation fixes; final fix commits had trace pings but no live companion review.
- `minih inside inbox list` failed on schema validation, forcing direct NDJSON inspection.

### Magic wand / follow-ups

- Add a companion helper that captures the just-created commit SHA directly from `git commit` output and refuses to ping if touched paths do not match the current task.
- Make `/plan-6a-v2-update-progress` available as a callable tool or document the manual fallback for final companion debrief in this harness.
- Consider a first-class `expected-fail`/`optional` smoke convention for in-flight sibling extensions so one unfinished extension cannot obscure the current plan's validation signal.
