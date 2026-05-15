
## 2026-05-09T07:16:50.602Z — code-review-companion / 2026-05-09T16-47-03-093Z-a6e3

- runId: 2026-05-09T16-47-03-093Z-a6e3
- runDir: /Users/jordanknight/pi-hacking/pij/agents/code-review-companion/runs/2026-05-09T16-47-03-093Z-a6e3
- summary: Ran as the coordinated code-review companion across the pij harness build from Phase 1 through the final fix-confirmation. I reviewed each phase commit, reported release blockers and contract drift through the inbox, verified the final c619b23 fixes cleared the previous HIGH findings, and ended with only one LOW non-blocking residual plan-row vocabulary drift.
- **magicWand** (target: project): Add a release-gate command that checks out the final commit into a fresh temporary clone, runs npm ci && npm run self-check with no preexisting .pi/extensions directory, and asserts the release tag target equals HEAD before tag push.
- difficulties:
  - [degrading] coordination: state_set/state_transition rejected some documented statuses with 'state does not match inside state schema'. (workaround: Continued using inbox messages for durable progress/review evidence and retried state publication with statuses that the tool accepted.)
  - [annoying] test: Validating fresh-clone behavior required temporarily moving .pi/extensions in the shared working tree, which risked racing with other checks if done in parallel. (workaround: Restored the directory after probes and avoided relying on results from earlier parallel move/check attempts.)

## 2026-05-11T07:45:41.350Z — code-review-companion / 2026-05-11T17-06-21-874Z-d1a5

- runId: 2026-05-11T17-06-21-874Z-d1a5
- runDir: /Users/jordanknight/pi-hacking/pij/agents/code-review-companion/runs/2026-05-11T17-06-21-874Z-d1a5
- summary: Reviewed 12 inbox task requests for plan 004 from T001 through T011, including one prompt-readiness fix. I sent 10 findings covering import-rule drift, JSON/report contract gaps, shallow scenario validation, preflight command drift, readiness behavior, weak integration evidence, docs drift, unsafe absence-only smoke evidence, and extension-validator pack blockers. I stood down after the post-task check-in received no reply.
- **magicWand** (target: minih): I wish minih exposed the active agent's allowed state enum and coordination mode in the run metadata so companion prompts could adapt their state vocabulary instead of repeatedly discovering schema mismatches at runtime.
- difficulties:
  - [degrading] coordination: State transitions to prompt-documented statuses such as `reading` and `reporting` repeatedly failed with a schema mismatch, even though the prompt instructs the companion to use those states. (workaround: Used inbox messages for durable progress evidence and transitioned only to statuses that the runtime accepted, such as `idle`, `reviewing`, and `complete`.)
  - [annoying] test: I initially used the Jest-specific `--runInBand` flag with the Vitest test script, which failed before rerunning with the correct project syntax. (workaround: Reran the targeted test as `npm test -- harness/driver.test.ts`.)

## 2026-05-15T06:22:19.601Z — code-review-companion / 2026-05-15T16-05-38-307Z-3761

- runId: 2026-05-15T16-05-38-307Z-3761
- runDir: /Users/jordanknight/pi-hacking/pij/agents/code-review-companion/runs/2026-05-15T16-05-38-307Z-3761
- summary: Oriented first on plan 009, then accepted the outside briefing that redirected scope to Plan 008. Reviewed two commit-boundary tasks: the 08e0dc4 Ralph Loop workshop design and the 94cbf24 minih#30 state-schema workaround. Sent five findings total, with one high-severity cross-workshop contract mismatch and four medium documentation/contract drift issues. Stood down after the post-task still-needed check received no reply within the configured reply window.
- **magicWand** (target: coordination): Add a companion-loop helper in minih that owns the idle/check-in/stand-down policy and writes the final envelope automatically, so review agents only implement orientation, task handling, and findings.
- difficulties:
  - [annoying] coordination: The companion loop requires manual tracking of empty poll counts, check-in state, last task id, message counts, and cumulative findings across a long-running session. (workaround: Tracked the counters in-session and validated against inbox activity before writing the final envelope.)

## 2026-05-15T07:24:47.054Z — code-review-companion / 2026-05-15T17-00-35-890Z-d226

- runId: 2026-05-15T17-00-35-890Z-d226
- runDir: /Users/jordanknight/pi-hacking/pij/agents/code-review-companion/runs/2026-05-15T17-00-35-890Z-d226
- summary: Reviewed three Plan 009 FX001 audit-gate hardening commits as a coordinated code-review companion. I sent four findings: two HIGH security-gate/provenance issues around override reasons and skipped-agent TTL renewal, plus two MEDIUM testing/contract gaps for AC-08 direct-access evidence and missing cmdAudit integration coverage. The run stood down after the post-task idle check-in received no reply.
- **magicWand** (target: coordination): Let the coordination runner maintain and expose the idle/check-in counters as structured state, so the companion can read emptyPollStreak and checkInPollIndex instead of manually tracking repeated long-poll cycles.
- difficulties:
  - [annoying] knowledge: The built-in orient default initially loaded the highest-numbered plan, but the actual outside briefing was for a different plan and arrived after orientation. (workaround: Acknowledged the Plan 009 briefing and used it as the review context for subsequent commit-boundary tasks.)

## 2026-05-15T07:26:01.812Z — code-review-companion / 2026-05-15T16-53-33-058Z-9b96

- runId: 2026-05-15T16-53-33-058Z-9b96
- runDir: /Users/jordanknight/pi-hacking/pij/agents/code-review-companion/runs/2026-05-15T16-53-33-058Z-9b96
- summary: Oriented on the repository, accepted the Plan 008 briefing, reviewed four milestone requests, and sent eight findings. Phase 0 had one high source-of-truth issue plus two medium documentation/ledger drift issues; Phase 1.A had one high AC-05 false-pass risk in compactAndAssert; Phase 1.B had one high plan-exhaustion misclassification risk in the Ralph Loop store; Phase 1.C had three high wiring/lifecycle issues around the missing real SDK runner, abort-listener cleanup, and runner error stop classification. The run initially exited via idle_budget, then processed a late 1.C review request and returned to idle.
- **magicWand** (target: coordination): Let the outside briefing or run input declare the active plan before orient default runs, so the companion does not spend initial attention on a highest-numbered plan that is unrelated to the actual review stream.
- difficulties:
  - [annoying] coordination: MINIH_PROJECT_ROOT was not visible to the shell, so the mandated initial cd stayed in the run folder instead of the repository root. (workaround: Used the repository root provided in the environment context as a literal path for subsequent file reads and git commands.)
  - [annoying] coordination: Orient default selected the highest-numbered plan 010, but the actual coordinated work was Plan 008 and arrived moments later as a briefing. (workaround: Acknowledged the briefing and switched review context to Plan 008 for all subsequent milestone tasks.)

## 2026-05-15T07:36:12.069Z — code-review-companion / 2026-05-15T16-51-44-687Z-9e83

- runId: 2026-05-15T16-51-44-687Z-9e83
- runDir: /Users/jordanknight/pi-hacking/pij/agents/code-review-companion/runs/2026-05-15T16-51-44-687Z-9e83
- summary: Reviewed Plan 010 SQL-backed todo implementation commit boundaries from T001 through T010, sending per-task summaries and seven findings. The major open issues at stand-down were the weak todo tool TypeBox schema, domain/docs drift around the missing session-sql guide and AGENTS record, and stale companion findings reconciliation in the execution log; the earlier smoke-anchor issue was resolved by T007.
- **magicWand** (target: coordination): Add a structured reply helper that binds responses to the currently handled outside task id automatically, validates ackOf before send, and displays unresolved findings/dispositions as a live checklist.
- difficulties:
  - [annoying] coordination: A manual ackOf typo in the T003 summary created an incorrectly correlated inbox response that had to be resent. (workaround: Sent a corrected summary with the right outside task id and noted the issue in the final retrospective.)
  - [degrading] coordination: The initial T002 review request used a hash that resolved to unrelated concurrent Plan 008 work, requiring extra graph investigation before reviewing the intended commit. (workaround: Searched recent commits touching the scoped files, reviewed the likely intended 42d86fd commit, and later correlated the corrected T002 task.)

## 2026-05-15T07:37:34.790Z — code-review-companion / 2026-05-15T17-25-45-562Z-30d0

- runId: 2026-05-15T17-25-45-562Z-30d0
- runDir: /Users/jordanknight/pi-hacking/pij/agents/code-review-companion/runs/2026-05-15T17-25-45-562Z-30d0
- summary: Reviewed commit b77de98 for FX001-4 infrastructure and reported REQUEST_CHANGES: two HIGH findings on non-gating snapshot evidence and uncorrelated minih last-run report handling, plus two MEDIUM contract-drift findings around refresh commands and stale --input documentation. I also acknowledged a subsequent Plan 008 ralph-loop briefing, then stood down after the post-task idle check-in received no reply.
- **magicWand** (target: coordination): Let briefing messages optionally declare the active plan/task family and reset or retarget the post-task check-in anchor, so a later briefing-only context switch does not produce a still-needed question correlated to an older unrelated task.
- difficulties:
  - [annoying] coordination: A new briefing for a different plan arrived after the completed review task, but the lifecycle heuristic still used the older task id as the ackOf anchor for the later still-needed check-in. (workaround: Followed the prompt's hasCompletedTask/lastTaskId rule and documented the awkward correlation in the retrospective.)

## 2026-05-15T07:50:00Z — code-review-companion / 2026-05-15T16-53-33-058Z-9b96 (Plan 008 phases 0+1.A+1.B)

- runId: 2026-05-15T16-53-33-058Z-9b96
- runDir: /Users/jordanknight/pi-hacking/pij/agents/code-review-companion/runs/2026-05-15T16-53-33-058Z-9b96
- summary: Oriented on the repository, accepted the Plan 008 briefing, reviewed three milestone requests, and sent five findings. Phase 0 had one high source-of-truth issue plus two medium documentation/ledger drift issues; Phase 1.A had one high AC-05 false-pass risk in compactAndAssert; Phase 1.B had one high plan-exhaustion misclassification risk in the Ralph Loop store. The run exited via idle_budget after a post-task still-needed check-in received no reply.
- findings sent: F001 HIGH (StopReason source drift → fixed `5aab83b`); F002 MEDIUM (AC-05 warning in registry History → fixed `5aab83b`); F003 MEDIUM (D08-P0-01 ledger → fixed via D-026 in `5aab83b`); F004 HIGH (stale JSON false-pass in compactAndAssert → fixed `2152620`); F005 HIGH (post-eval plan-exhaustion → fixed `ca32628`).
- **magicWand** (target: coordination): Let the outside briefing or run input declare the active plan before orient default runs, so the companion does not spend initial attention on a highest-numbered plan that is unrelated to the actual review stream.
- difficulties:
  - [annoying] coordination MH-001: MINIH_PROJECT_ROOT was not visible to the shell, so the mandated initial `cd` stayed in the run folder instead of the repository root. (workaround: Used the repository root provided in the environment context as a literal path for subsequent file reads and git commands.)
  - [annoying] coordination MH-002: Orient default selected the highest-numbered plan 010, but the actual coordinated work was Plan 008 and arrived moments later as a briefing. (workaround: Acknowledged the briefing and switched review context to Plan 008 for all subsequent milestone tasks.)

## 2026-05-15T07:50:30Z — code-review-companion / 2026-05-15T17-25-45-562Z-30d0 (Plan 008 continuation + sibling Plan 009 FX001-4)

- runId: 2026-05-15T17-25-45-562Z-30d0
- runDir: /Users/jordanknight/pi-hacking/pij/agents/code-review-companion/runs/2026-05-15T17-25-45-562Z-30d0
- summary: Reviewed commit b77de98 for sibling-session Plan 009 FX001-4 infrastructure and reported REQUEST_CHANGES: two HIGH findings on non-gating snapshot evidence and uncorrelated minih last-run report handling, plus two MEDIUM contract-drift findings around refresh commands and stale --input documentation. Acknowledged a subsequent Plan 008 ralph-loop briefing but stood down after the post-task idle check-in received no reply.
- findings sent (FX001-4 / Plan 009 \u2014 NOT Plan 008): F001 HIGH snapshot oracle is non-gating; F002 HIGH last-run report is not correlated to invocation; F003 MEDIUM refresh command drift; F004 MEDIUM old minih --input contract remains documented. **These belong to Plan 009 sibling-session work \u2014 flagged here for that session to address; not blocking Plan 008.**
- **magicWand** (target: coordination): Let briefing messages optionally declare the active plan/task family and reset or retarget the post-task check-in anchor, so a later briefing-only context switch does not produce a still-needed question correlated to an older unrelated task.
- difficulties:
  - [annoying] coordination MH-001: A new briefing for a different plan arrived after the completed review task, but the lifecycle heuristic still used the older task id as the ackOf anchor for the later still-needed check-in. (workaround: Followed the prompt's hasCompletedTask/lastTaskId rule and documented the awkward correlation in the retrospective.)

### Magic-wand pattern across Plan 008 runs

Both Plan-008 sessions surfaced the SAME coordination gap from different
angles: the companion's orient/lifecycle heuristics don't have a first-class
"active plan" field that the outside operator can set. Both retros recommend
adding it as a briefing-level field that the companion honours immediately
(before orient default runs OR when re-targeting between plans). Worth
upstreaming to minih as a coordinated PR.
