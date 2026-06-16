
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

## 2026-05-16T00:17:07.049Z — code-review-companion / 2026-05-16T09-45-41-687Z-4b0a

- runId: 2026-05-16T09-45-41-687Z-4b0a
- runDir: /Users/jordanknight/pi-hacking/pij/agents/code-review-companion/runs/2026-05-16T09-45-41-687Z-4b0a
- summary: Reviewed seven coordinated commit-boundary tasks for the Plan 010 below-editor todo strip follow-up. ST001, ST002, ST005, and the F003-fix had no findings; ST003 produced F001 on session-sql changed-event over-emission, ST004 produced F002 on missing regression/widget coverage, and closeout produced F003 on a stale phase status header. All three findings were subsequently reconciled or fixed by later commits before the outside peer sent stop.
- **magicWand** (target: coordination): Add a first-class companion command or template for cumulative finding capture so each inbox finding is automatically mirrored into the final report without manual re-entry.
- difficulties:
  - [annoying] coordination: The report had to mirror findings that were already sent through the inbox, but there is no automatic export from inbox messages to output/report.json. (workaround: Manually tracked task ids, finding ids, and ackOf values during the run and copied the final finding content into the JSON envelope.)

## 2026-05-16T04:46:21.478Z — code-review-companion / 2026-05-16T14-43-11-492Z-4616

- runId: 2026-05-16T14-43-11-492Z-4616
- runDir: /Users/jordanknight/pi-hacking/pij/agents/code-review-companion/runs/2026-05-16T14-43-11-492Z-4616
- summary: Recovery debrief completed for the stale original Plan 007 Phase 1 companion run 2026-05-16T13-47-09-160Z-fc71. I reconstructed the review record from the original inside/outside inbox messages and the current execution log, verified that all original MEDIUM and LOW findings F001-F013 are recorded as fixed or reconciled, and found no unresolved HIGH or MEDIUM issues. The original final summary 01KRQGXSJZ0VPZZ8N60B6QWQB3 found no new HIGH/MEDIUM issues and approved Phase 1 handoff to Phase 2; the current execution log also records final self-check passing and documents this recovery fallback.
- **magicWand** (target: coordination): Add a `minih recover-report <slug> <runId>` command that generates a draft farewell envelope from a stale run's inbox messages, summaries, findings, and last control message, then marks which fields still need human or companion confirmation.
- difficulties:
  - [degrading] coordination: The prior companion run went stale after sending its final inbox summary but before writing output/report.json, leaving the recovery agent to reconstruct the formal envelope manually. (workaround: Read the original inside/outside inbox message streams, extracted finding and summary content, cross-checked the current execution log dispositions, and wrote this replacement report.)
  - [annoying] coordination: The recovery request arrived as a briefing rather than a task even though it required real reconstruction work, which made task counters and ack semantics slightly ambiguous. (workaround: Acknowledged and replied to the briefing with ackOf, treated tasksReceived as zero for this run, and recorded the ambiguity in the retrospective.)

## 2026-05-16T07:21:06.483Z — code-review-companion / 2026-05-16T16-32-48-636Z-fb2e

- runId: 2026-05-16T16-32-48-636Z-fb2e
- runDir: /Users/jordanknight/pi-hacking/pij/agents/code-review-companion/runs/2026-05-16T16-32-48-636Z-fb2e
- summary: Completed a coordinated, commit-by-commit Phase 2 review for the Minih Workbench full modal run viewer. I sent eight findings covering width-safe rendering, stale async UI refreshes, inert report paging, read-only contract drift, non-UI modal state leaks, insufficient injected-key coverage, fragile Escape-close smoke assertions, and stale evidence reconciliation. Each finding was fixed and re-reviewed; final T012 docs, domain handoff, and self-check evidence were approved with no unresolved requests.
- **magicWand** (target: coordination): Add a first-class review-drain/control vocabulary in the coordination UI, distinct from task, so status-only notes do not look like review work and task counts can be generated automatically.
- difficulties:
  - [annoying] config: The shell did not expose MINIH_PROJECT_ROOT during orientation, even though the prompt instructed the companion to cd through it. (workaround: Used the explicit repository root from the environment context: /Users/jordanknight/pi-hacking/pij.)
  - [annoying] test: Vitest 2.1.9 rejected the attempted --runInBand flag during focused test validation. (workaround: Reran the focused test command without --runInBand.)
  - [degrading] coordination: Status-only and final-drain messages arrived as type=task, which made lifecycle notes indistinguishable from review requests at the protocol level. (workaround: Read the subject/body and replied with progress or drain summaries without starting unnecessary review work.)

## 2026-05-17T05:38:50.151Z — code-review-companion / 2026-05-17T14-55-31-573Z-53a4

- runId: 2026-05-17T14-55-31-573Z-53a4
- runDir: /Users/jordanknight/pi-hacking/pij/agents/code-review-companion/runs/2026-05-17T14-55-31-573Z-53a4
- summary: Reviewed Plan 007 Phase 3 Minih Workbench implementation from preflight through T013 and targeted fixes through F014. I sent findings covering status drift, classifier ordering, raw tool/report leakage, write-root mismatch, keybinding injection, per-event push dedupe, persist-before-side-effect evidence, command/tool evidence overclaims, smoke/evidence overclaims, and final reconciliation drift. All medium/high findings were fixed and re-reviewed, final low evidence cleanups were resolved, and no open review findings remained when stop was requested.
- **magicWand** (target: coordination): Generate the final companion report automatically from acked inbox findings and summaries, including ids, severities, ackOf values, and dispositions.
- difficulties:
  - [degrading] coordination: Final report generation required manually reconstructing cumulative findings from inbox traffic and compaction summary instead of exporting them from the coordination log. (workaround: Kept finding ids and ackOf references during review and manually populated the final report.)
  - [annoying] config: The shell did not expose MINIH_PROJECT_ROOT, so orientation used the repository root from environment context. (workaround: Used /Users/jordanknight/pi-hacking/pij as the project root for file and git reads.)

## 2026-05-27T06:09:46.467Z — code-review-companion / 2026-05-27T15-38-53-180Z-6d10

- runId: 2026-05-27T15-38-53-180Z-6d10
- runDir: /Users/jordanknight/pi-hacking/pij/agents/code-review-companion/runs/2026-05-27T15-38-53-180Z-6d10
- summary: Oriented on Plan 013 pi-peacock and acknowledged the outside implementation briefing, but no review-request task arrived before the idle safety budget, so no code review findings were produced.
- **magicWand** (target: coordination): Add a dedicated briefing-only idle check-in, for example briefingPollThreshold, so a companion can ask whether the first milestone task is still expected without violating the post-task ackOf rule.
- difficulties:
  - [annoying] coordination: A briefing counts as first contact and disables first-contact nudging, while no task has completed so post-task nudging is also disabled. That creates a long quiet wait if the orchestrator sends a briefing but no milestone task. (workaround: Stayed in the required bounded long-poll loop until the default idle safety budget was reached, then exited with idle_budget.)

## 2026-06-16T04:07:30.073Z — code-review-companion / 2026-06-16T13-48-24-415Z-308c

- runId: 2026-06-16T13-48-24-415Z-308c
- runDir: /Users/jordanknight/pi-hacking/pij/agents/code-review-companion/runs/2026-06-16T13-48-24-415Z-308c
- summary: Reviewed Plan 014 Phase 1 across T001, T002-T011, and the final fix commit. Initial T001 review found three issues: missing domain-map integration, placeholder extension AGENTS.md, and premature completed-core history wording. The pure core, ports, fake adapters, and 50 vitest specs in d549dfe passed review and the existing test/typecheck/lint gates. The final 6203775 fix sufficiently addressed the outstanding domain-map and AGENTS.md findings; no unresolved peer requests remain.
- **magicWand** (target: minih): Have minih expose and validate a canonical projectRoot for coordinated agents, failing early if $MINIH_PROJECT_ROOT points at the run directory instead of the repo root.
- difficulties:
  - [degrading] config: $MINIH_PROJECT_ROOT resolved to the run folder even though the prompt said to use it as the project root, so the first docs/plans lookup incorrectly found no plan tree. (workaround: Used the known Git repository root from context and verified the active plan from /Users/jordanknight/pi-hacking/pij.)

## 2026-06-16T06:25:38.156Z — code-review-companion / 2026-06-16T15-59-13-231Z-5219

- runId: 2026-06-16T15-59-13-231Z-5219
- runDir: /Users/jordanknight/pi-hacking/pij/agents/code-review-companion/runs/2026-06-16T15-59-13-231Z-5219
- summary: Oriented on plan 014, acknowledged the Phase 3 briefing, reviewed the T001+T002 coordinator commit, the T003-T010 index.ts wiring commit, and the final Phase 3 drain commit. No material issues were found across pi-free core invariants, receipt wake prevention, contract drift, scope, reload-safety, or the final documentation/gate record.
- **magicWand** (target: coordination): Have the runner validate and expose MINIH_PROJECT_ROOT as the repository root, or include an explicit MINIH_REPO_ROOT alongside it so companions can orient without a recovery step.
- difficulties:
  - [degrading] config: MINIH_PROJECT_ROOT resolved to the run folder, so the required initial cd did not land in the project root and docs/plans was initially invisible. (workaround: Used git rev-parse --show-toplevel from the run folder, then ran all orientation and review commands from /Users/jordanknight/pi-hacking/pij.)
  - [annoying] coordination: The companion prompt mandates a summary message for every task, while the outside reviewer protocol explicitly requested replies only for issues. (workaround: Acknowledged each task, performed the review, transitioned state back to idle, and withheld no-op summaries when no issues were found.)

## 2026-06-16T07:19:08.732Z — code-review-companion / 2026-06-16T06-57-54-119Z-b4f0

- runId: 2026-06-16T06-57-54-119Z-b4f0
- runDir: /Users/jordanknight/pi-hacking/pij/agents/code-review-companion/runs/2026-06-16T06-57-54-119Z-b4f0
- summary: Reviewed Phase 4 pij CLI work across descriptor enrichment, pure CLI parse/dispatch, thin bin wiring, parser fix, final drain, and follow-loop fix. I found two HIGH issues: F001 for lenient malformed-argument parsing and F002 for a non-advancing tail --follow loop. Both were fixed later in the run and verified before stop.
- **magicWand** (target: coordination): Make the runner export MINIH_PROJECT_ROOT reliably to the project root and include a preflight assertion in companion boot that fails loudly if it resolves to the run directory.
- difficulties:
  - [degrading] config: MINIH_PROJECT_ROOT was unavailable or resolved to the run folder from the shell, so the mandated initial cd did not reach the project root. (workaround: Used the repository root supplied in the environment context (/Users/jordanknight/pi-hacking/pij) for all subsequent reads.)
  - [annoying] test: The canonical just test recipe does not accept a file argument; attempting just test .pi/extensions/pij/core/session.test.ts failed as an unknown recipe argument. (workaround: Inspected just --list and used the repository-level just test gate instead.)

## 2026-06-16T07:56:09.214Z — code-review-companion / 2026-06-16T07-35-17-071Z-e04a

- runId: 2026-06-16T07-35-17-071Z-e04a
- runDir: /Users/jordanknight/pi-hacking/pij/agents/code-review-companion/runs/2026-06-16T07-35-17-071Z-e04a
- summary: Reviewed Plan 014 Phase 5 across T001 through closeout and one fixes commit. I sent six findings: four were fixed and verified in b63b1a4, one audit-policy issue was escalated for user sign-off, and one self-check closeout caveat remained documented as an unrelated baseline failure rather than a pij failure.
- **magicWand** (target: coordination): Add a coordination report generator that exports task counts, ackOf-linked finding ids, fixed/unresolved status, and the farewell JSON skeleton directly from the inbox ledger.
- difficulties:
  - [annoying] tooling: The glob helper returned no matches for existing plan files under an absolute project-root path, so the orientation file discovery could not rely on glob. (workaround: Used `find` from the project root and then read discovered files by absolute path.)
  - [annoying] tooling: Large combined `git show` plus ripgrep commands overflowed tool output into temporary files, requiring a second narrowed read. (workaround: Repeated the review with targeted `view` ranges and narrower ripgrep patterns.)
