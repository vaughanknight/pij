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

---

## Follow-up Retro: Below-editor Todo Strip

**Date**: 2026-05-16  
**Subtask**: `ST-001` — Claude Code-style below-editor todo strip  
**Companion**: `code-review-companion` run `2026-05-16T09-45-41-687Z-4b0a`

### Companion farewell

> Stopping on outside control request. Session reviewed seven commit-boundary tasks, sent three findings (F001/F002/F003), and verified the final F003 fix before shutdown.

### Findings outcome

| Finding | Outcome |
|---------|---------|
| F001 MEDIUM — `session-sql:changed` over-emitted for `SELECT` | Fixed by gating event emission to syntactically mutating SQL plus reset. Logged as D-029. |
| F002 MEDIUM — missing regression coverage | Fixed with `looksMutatingSql()` tests, multiple in-flight widget tests, and visible-width truncation tests. |
| F003 LOW — phase compatibility `tasks.md` status stale | Fixed by marking the parent compatibility index `Status: Complete`. |

### What worked

- The new `todo` tool made live plan work visible; the user confirmed the strip was working nicely at the bottom of pi.
- Companion review caught an important cross-extension event contract drift before final report.
- Below-editor widget smoke was observable enough to assert a stable in-flight strip anchor without ANSI-specific checks.

### What hurt

- `session-sql:changed` needed careful naming/semantics because row-returning mutations make result-kind detection misleading.
- The plan-6 companion skill references `/plan-6a-v2-update-progress`, but no direct callable skill/tool was available in this session, so debrief was handled manually.

### Companion difficulty

| ID | Category | Severity | Description | Ledger |
|----|----------|----------|-------------|--------|
| MH-001 | coordination | annoying | Final `output/report.json` required manual mirroring of findings already sent through the inbox; no automatic export from inbox messages to report JSON. | Promoted to `docs/difficulties.md` as D-030. |

### Magic wand / follow-ups

- Encode a small event-contract test harness for extension event buses so future cross-extension events can be tested without exporting classifier helpers.
- Add a plan-6 helper for closeout status consistency across root plan, phase index, subtask dossier, flight plan, and execution log.
- Add a first-class companion command/template that turns inbox findings/summaries into the final report automatically.
