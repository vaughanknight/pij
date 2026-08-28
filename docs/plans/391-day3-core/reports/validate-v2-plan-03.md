# validate-v2 narrow delta verdict - NEEDS ATTENTION

**Verdict**: **NEEDS ATTENTION** - plan v1.5.0, sha256 `9dd638460e1cf4760202e13b1d3d9d4463948286c71fb101c38d007e4c21112f`, closes validator-2's single HIGH with a genuinely RED executable composition test for both CLI spawn paths and reachable T006 plumbing on HEAD. The nine-task dossier is not yet implementation-ready under the requested no-other-context contract because only two task path cells are absolute.

## Validation contract

- **Purpose / outcome**: narrow re-validation of validator-2's single HIGH and the Phase 1 task dossier only.
- **Promise**: Phase 1 must force both public spawn paths through an executable CLI composition test, make the required capability value reachable at both production builder calls, and give a coder nine self-contained tasks with absolute paths, RED-before-IMPL ordering, and measurable Done When clauses.
- **Proof target**: Implementation plus Integration readiness.
- **Proof required**: pinned artifact hashes, current HEAD source reachability, executable fake-tmux CLI boundary, task count/order/path/Done-When inspection.
- **Upstream**: `reports/validate-v2-plan-02.md` - **Applicable**; its single HIGH defines this delta.
- **Consumers**: the Phase 1 coder, `pij spawn`, and `pij agent spawn`.
- **Constraints**: no Phase 2-4 re-validation; no source or target-artifact edits.

## Revision proof

- Plan: v1.5.0, sha256 `9dd638460e1cf4760202e13b1d3d9d4463948286c71fb101c38d007e4c21112f`.
- Phase 1 dossier: sha256 `380c9e6b099cb4de7e58ad2a96674debce654aaf4eacbf157d7ac2a831659aba`.
- HEAD: `d2dbab02720496bb0a19f7ad1ba09d2c932e87c3`.
- `git diff 2953d75..HEAD` over `cli.ts`, `cli.integration.test.ts`, `core/spawn.ts`, `core/models/registry.ts`, and `core/models/validate.ts` is empty, so the pinned production seams remain current.
- `harness boot` passed typecheck and reached the repository's documented baseline failure in `harness/scripts/release-age-policy.test.ts` because `pwsh` is absent (the same KNOWN-RED named by AC-10). This narrow verdict does not treat that environment limit as Phase 1 evidence; the focused CLI-boundary tests below passed.

## Validator-2 HIGH disposition - CLOSED

### Executable RED test crosses both CLI boundaries

- Plan AC-02 and task 1.5a, plus dossier T006a, explicitly invoke both `pij spawn --harness copilot --model ...` and `pij agent spawn --prompt ... --harness copilot --model ...`, then inspect the final fake-tmux `split-window`/`new-window` argv for denied and allowed models.
- The integration helper executes the real `cli.ts` through `tsx` (`cli.integration.test.ts:67-97`), and the fake tmux records every argv (`:140-150`). The existing suite already proves both command shapes reach that harness (`:1799-1816`, `:1844-1879`).
- Fresh targeted proof passed both existing boundary tests: `just test .pi/extensions/pij/cli.integration.test.ts -t 'daemon-bound Copilot descriptor records github-copilot provider|agent spawn correlates its prelaunch expectation'` -> 2 passed.
- The proposed denied-model assertions are RED on HEAD because `buildControlSpawnCommand` still unconditionally appends `--context long_context` for every Copilot model (`core/spawn.ts:463-465`), and both CLI paths forward their model into that builder.

### T006 plumbing is reachable on HEAD

- Peer spawn: `runSpawn` already has `known = loadModels()` at `cli.ts:2354`, the requested model is in the same scope, and the builder call is at `:2606`.
- Agent spawn: `runAgentSpawn` already has `models = loadModels()` at `:4080` and `plan.model`; `spawnAgentPane` owns the plan type at `:3939-3946`, calls the builder at `:3995`, and is invoked from `runAgentSpawn` at `:4162`. Adding `longContext?: boolean`, resolving before the call, passing it through, and conditionally forwarding it requires no second registry load or unreachable dependency.

## Finding

### MEDIUM - The dossier violates the required absolute-path/no-context contract

**Location**: `tasks/phase-1-item-6-long-context-gate/tasks.md:65-73`

The dossier has exactly nine tasks, and its RED-before-IMPL dependencies and Done When clauses are measurable. However, only T001 and T006a provide absolute paths. T002-T005 and T006 use `.../` abbreviations, T007 uses repo-relative paths, and T008 has no path while instructing the coder to run the unresolved placeholder `git commit -- <paths>`.

**Impact**: a coder given only this dossier must infer six file locations and invent the final commit pathspec, so the artifact does not meet the explicitly requested "paths absolute" and "no other context" readiness standard.

**Smallest fix**: expand every abbreviated or relative task path to `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/...`; for T008, enumerate the exact Phase 1 changed-file pathspec instead of `<paths>`.

## Readiness disposition

| Check | Result |
|---|---|
| Validator-2 HIGH closed by executable RED test for both spawn paths | PASS |
| T006 production plumbing reachable on HEAD | PASS |
| Exactly nine dossier tasks | PASS |
| RED-before-IMPL ordering | PASS |
| Measurable Done When clauses | PASS |
| Absolute paths, usable with no other context | FAIL - 2/9 task path cells comply |

**Thesis**: partial. The production-composition defect identified by validator-2 is now correctly pinned and implementable, but the Phase 1 handoff is not yet fully self-contained for its coder.

**Consumers**: `pij spawn` and `pij agent spawn` integration contracts are satisfied by the plan; the Phase 1 coder contract remains blocked only by the dossier path/pathspec defect.

Phases 2-4 were not re-validated.
