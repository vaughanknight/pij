# P4 coder packet — Governance contract (FINAL build leg)
**From**: pij-civilian-takin (s054 orchestrator) · **Date**: 2026-07-17 · **Immutable once dispatched**
**Coder**: pij-general-llama (compacted — re-ground from files)

## Who you are
s054 coder seat. ALL work in worktree `/Users/jordanknight/pi-hacking/pij-worktrees/s054-pij-grown-up` (branch `s054/pij-grown-up`); cwd = canonical repo, write-forbidden; absolute paths / `git -C`. Report ONLY via `pij send pij-civilian-takin`.

## Mission — EXECUTE VIA THE BUILDER FLOW (fleet doctrine, Seq 444)
```
/builder 6 implement --plan "/Users/jordanknight/pi-hacking/pij-worktrees/s054-pij-grown-up/docs/plans/054-pij-grown-up/pij-grown-up-plan.md" --phase "Phase 4: Governance contract — render, migration, skill, docs"
```
Consumes the validated dossier `tasks/phase-4-governance-contract/tasks.md` (T001–T008; four validation findings pre-folded incl. the FULL 12-AC sweep chain and the ruled T002 bin-intercept mechanism). Where the verb's generic guidance and this packet conflict, THIS PACKET WINS.

## HARD STOPS (violations = review CRITICALs; these close the plan)
- **R3**: NEVER run `just pij-skill-install` (T008 lists it, ship executes it). NO live daemon, NO real `~/.pij`, NO global state — the sweep is temp-PIJ_HOME + fakes + single-step tick ONLY.
- **R4**: NO cutover. `government/**` is write-forbidden as always; `government/prime-flow.json` stays byte-untouched (T003 writes a NOTE about it in docs/how, nothing more).
- SW-6/SW-7 residual care: daemon.ts and the s051 zone (`core/discovery|current-session|close`) should be ABSENT from your diff — P4 has no business there; if a task seems to need them, pre-write checkpoint.

## Fence
`.pi/extensions/pij/core/**` · `.pi/extensions/pij/adapters/**` · bin `cli.ts` · tests · `skills/pij/**` (WORKTREE edits only) · `docs/how/**` · `README.md` · `docs/plans/054-pij-grown-up/tasks/phase-4-governance-contract/**` + `docs/plans/054-pij-grown-up/ship/**` · **fence amendment (ruled)**: `harness/scripts/pij-skill-check.sh` for T004 only. Forbidden: everything else (package/lock, government/**, the-flow files, canonical repo, real ~/.pij).

## Gates (before completion checkpoint)
`just typecheck` · fenced vitest (core+adapters) · FULL `npx vitest run` · `just pij-skill-check` · biome · the T007 sweep green · full `harness checks` (8 stages; environmental smoke failure → isolated-verify + report honestly, never mask).

## Commits + checkpoints
Per task/pair; NO push/PR. Checkpoints: `"P4 CHECKPOINT T00x-T00y · <shas> · <gates> · <notes>"`; completion: `"P4 BUILD COMPLETE · <commits> · T001-T008 status · gates incl. harness checks verbatim result · R3/R4 attestation (no install ran, prime-flow.json byte-identical, no real ~/.pij touched) · observations"`.
