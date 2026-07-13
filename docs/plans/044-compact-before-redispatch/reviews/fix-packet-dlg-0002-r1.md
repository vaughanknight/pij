# Fix Packet — s044 dlg-0002 Round 1

**Source**: `reviews/review.phase-1.md`
**Verdict**: FIX_REQUIRED
**Coder**: `pij-useful-whitefish` (reuse after fire-and-forget compact)
**Scope**: findings F-001 and F-002 only

## F-001 — Execution/progress evidence

Create:

`docs/plans/044-compact-before-redispatch/tasks/phase-1-completion-first-peer-compaction/execution.log.md`

It must record:

- T001–T006 outcome and completion evidence;
- exact five implementation files and plan evidence files;
- structural RED → GREEN sequence;
- 23-case mutation matrix and independent additive case;
- cold coder/reviewer canary evidence;
- gate commands/results;
- D-032 as accepted external/non-blocking debt;
- scope-alert disposition and no forbidden write;
- discoveries, including nested canary outputs not pushing to the spawner.

Update the canonical task table in `tasks.md` so completed tasks are `[x]`.

## F-002 — Additive receipt-gate false negative

Strengthen `harness/scripts/pij-skill-check.sh` so additive progress-gating text in the completion contract fails even when the required positive marker remains.

Requirements:

- negative detection is narrowly scoped to completion C3/pair content;
- reject instructions that wait for compact receipt delivery, `executed:true`, compact completion, or any equivalent before report/review/fix/next-pointer progress;
- preserve and explicitly prove legitimate root/C7 `pij inbox --wait`;
- do not reject historical/evidence wording outside the runtime completion contract;
- add an additive copied-root mutation that appends receipt-gate wording and must go RED;
- rerun the full existing mutation matrix;
- prove all five source files are byte-identical after mutation tests.

## Allowed Paths

- `harness/scripts/pij-skill-check.sh`
- `docs/plans/044-compact-before-redispatch/tasks/phase-1-completion-first-peer-compaction/tasks.md`
- `docs/plans/044-compact-before-redispatch/tasks/phase-1-completion-first-peer-compaction/execution.log.md`
- `.harness/temp/s044/**`

No other implementation file needs a fix unless the new sensor exposes a contradiction; if it does, stop and report before editing.

## Gates

- additive receipt-gate fixture RED;
- baseline `just pij-skill-check` GREEN;
- full copied-root mutation matrix GREEN;
- `just typecheck`;
- `just lint`;
- `git diff --check`;
- exact changed-path check.

Do not rerun D-032 smoke, cold canaries, or broaden scope.

## Report

Reply with the packet JSON schema using `outcome: COMPLETE` or `BLOCKED`, exact files changed, gates, and per-finding fix summary.
