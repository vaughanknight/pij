# Phase 1 Execution Log

**Outcome**: COMPLETE

**Date**: 2026-07-13

**Accepted debt**: D-032, external and non-blocking

## Task outcomes

| Task | Outcome | Completion evidence |
|------|---------|---------------------|
| T001 | Complete | Added the structural completion contract first and captured RED while the existing root invariant 5 and C7 pull-delivery assertions remained green. |
| T002 | Complete | Restored the always-loaded interrupt, authoritative C3 fire-and-forget contract, and pair-route compact-before-handling procedure. |
| T003 | Complete | Aligned the `pij-skill` domain concepts, invariants, proof surfaces, and history without duplicating route prose. |
| T004 | Complete | Baseline plus 23 copied-root mutations passed; round-1 review added an independent additive receipt-gate mutation that also goes RED. |
| T005 | Complete | Accepted cold coder and reviewer traces prove compact is the first post-event tool, has no `--wait`, and is followed immediately by report/verdict handling. |
| T006 | Complete | Required static, unit, harness, scope, and teardown gates passed except the government-accepted D-032 smoke debt. |

## Changed files

The exact five implementation files are:

1. `skills/pij/SKILL.md`
2. `skills/pij/references/00-routing.md`
3. `skills/pij/references/routes/pair.md`
4. `harness/scripts/pij-skill-check.sh`
5. `docs/domains/pij-skill/domain.md`

Durable plan evidence is:

1. `docs/plans/044-compact-before-redispatch/reports/scope-alert-dlg-0002.md`
2. `docs/plans/044-compact-before-redispatch/validation/cold-completion-canary.md`
3. `docs/plans/044-compact-before-redispatch/validation/one-shot-compact-evidence.md`
4. `docs/plans/044-compact-before-redispatch/tasks/phase-1-completion-first-peer-compaction/tasks.md`
5. `docs/plans/044-compact-before-redispatch/tasks/phase-1-completion-first-peer-compaction/execution.log.md`

Transient proof lives under `.harness/temp/s044/`, including the mutation matrix, source hashes, accepted event-order traces, and isolated cold project.

## Structural RED to GREEN

1. T001 changed only `harness/scripts/pij-skill-check.sh`.
2. `just pij-skill-check` went RED solely on the absent completion-first contract; the pre-existing delivery-owned `pij inbox --wait` assertions stayed green.
3. T002 and T003 added the root, C3, pair, and domain contract payload.
4. The same command went GREEN.
5. Review round 1 reproduced F-002 by preserving every positive marker and appending a contradictory receipt gate: the additive case incorrectly exited 0, so the matrix exited 1.
6. The sensor was narrowed to extracted C3 and pair completion sections; baseline returned GREEN and the additive fixture returned RED while C7 `pij inbox --wait` remained green.

## Mutation proof

`.harness/temp/s044/mutation-matrix.sh` runs a green copied-root baseline, the original 23 targeted RED mutations, and the independent `c3-additive-receipt-gate` RED mutation. The original cases cover root interrupt and delivery invariants, C3 ownership/lifecycle/fire-and-forget/no-wait/no-gate/reuse, pair coder/reviewer ordering and reload safety, and C7 push/pull behavior.

The additive case appends `Wait for compact receipt delivery or executed:true before report, review, fix, or next-pointer progress.` without deleting the required positive marker. It fails on `completion C3: no additive receipt/completion progress gate`; the same fixture still passes `completion C7: pij inbox --wait`. Post-run `shasum -c` reports all five source files `OK`, proving byte-identical sources after copied-root mutation tests.

## Cold runtime evidence

- Coder: orchestrator `pij-planned-toad`, target `pij-prepared-tarantula`. First post-completion tool was `pij send pij-prepared-tarantula "/compact"` at `2026-07-13T00:55:30.230Z`; report handling followed at `00:55:33.321Z`.
- Reviewer v2: orchestrator `pij-grateful-newt`, target `pij-fond-snake`. First post-verdict tool was `pij send pij-fond-snake "/compact"` at `2026-07-13T02:21:38.317Z`; verdict handling followed at `02:21:46.710Z`.
- Neither accepted compact used `--wait`, polled a receipt, or gated progress. The project-local skill resolved from this worktree.
- One-shot evidence retains expected post-auto-dissolve `E-DEAD`; no reusable context remains to compact.

The first reviewer trial was rejected because its measured event named `/pij pair`, causing an extra skill load before compact. The neutral v2 event removed trigger wording and supplied the accepted trace.

## Gates

| Command or proof | Result |
|------------------|--------|
| `just pij-skill-check` | PASS, including additive C3/pair no-gate checks and explicit root/C7 inbox-wait preservation. |
| `bash .harness/temp/s044/mutation-matrix.sh` | PASS: baseline, 23 original RED mutations, one additive RED mutation, and byte-identical source hashes. |
| Cold coder/reviewer canaries | PASS; not rerun during review fix round 1. |
| `just typecheck` | PASS. |
| `just lint` | PASS, exit 0; 10 pre-existing warnings and one Biome schema-version informational message. |
| `harness checks --quick` | PASS for all non-smoke sensors. |
| `harness checks` | 6/7 sensors passed; smoke reproduced accepted D-032. |
| `git diff --check` | PASS. |
| Exact changed-path check | PASS: five implementation files plus the listed plan evidence; no product-code, package, flow-state, commit, push, or daemon-restart change. |

## Debt, scope, and discoveries

- **D-032**: full smoke reached Pi's `Do not trust (this session only)` prompt and idled out. Government ruled this external and non-blocking for s044; smoke and cold canaries were not rerun in fix round 1.
- **Scope alert**: an early broad Markdown search surfaced lines from forbidden `the-flow.md`. Work stopped immediately; no forbidden write occurred. The disposition is recorded in `reports/scope-alert-dlg-0002.md`, and all later plan reads used explicit paths.
- The C7 section extractor originally stopped on its own start heading; an `awk` extractor now stops only at the next heading.
- The first compact-wait mutation targeted an earlier `/compact`; it was narrowed to the unique C3 phrase.
- Copilot cold fixtures resolve project skills from `.agents/skills/`; `copilot skill list --json` proved the worktree path.
- Nested coder/reviewer canaries emitted their completion outputs locally instead of pushing them to the spawner. The spawner recovered their existing transcripts and event evidence; no canary was redispatched.
- Every spawned canary peer was closed after evidence capture.
