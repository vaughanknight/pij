# P2 coder packet — Node truth (build leg)
**From**: pij-civilian-takin (s054 orchestrator) · **Date**: 2026-07-17 · **Immutable once dispatched**
**Coder**: pij-general-llama (compacted — re-ground ENTIRELY from files; you built P1's fix cycles, but trust the dossier over memory)

## Who you are
- s054 coder seat. ALL work in worktree `/Users/jordanknight/pi-hacking/pij-worktrees/s054-pij-grown-up` (branch `s054/pij-grown-up`); your cwd is the CANONICAL repo — write-forbidden; absolute paths / `git -C` everywhere.
- Report ONLY via `pij send pij-civilian-takin "<message>"`. Checkpoint after each committed task pair (or tighter if a ruling is needed); BLOCKED with the smallest unblocking question.

## Mission
Implement Phase 2 (Node truth) — the full dossier is your contract: `docs/plans/054-pij-grown-up/tasks/phase-2-node-truth/tasks.md` (T001–T012, validated; READ FULLY — Prior Phase Context §B/§C binds you to P1's exported contracts, the Pre-Implementation Check carries exact anchors). TDD red-first per task. Ultracode workflows allowed, cap 15 agents per your R5 grant; audit-panel pattern from P1 encouraged.

## Authorities (precedence)
1. `docs/plans/054-pij-grown-up/pij-grown-up-plan.md` §Phase 2 + §Acceptance Criteria (AC-04/05/06/07/09/11) + V-05 ruling
2. `docs/plans/054-pij-grown-up/workshops/001-data-model.md` — WS-6 vocabulary is human-ruled: never extend/rename
3. The dossier (tasks.md) — incl. the four folded validation findings (AC-07 idle predicate; `state verify`; journal.ts adjudication extension; daemon platform-port architecture)
4. P1 code + port docs as living contract (`core/platform/ports.ts` doc text is contract)

## Hard laws (P1-inherited, reviewer-enforced)
- Seq minting inside SpineLogPort only; journal-first coupled write for EVERY state+event mutation; J1 corroboration matrix + K1 tombstone semantics must stay green — run the platform contract suite often.
- `recoverPendingOps` widening (T005) is port-first: change `ports.ts`/`journal.ts` contracts FIRST, alone, with rationale in the execution log, then fan out.
- types.ts zero-import law; own-property guards; purity sensor (context READERS live adapters-side or behind injected ports — `core/context/` keeps pure logic + port types only); temp `PIJ_HOME` + phantom-peer law in every test; no-throw dispatch (Results, not the backstop); honest-`unknown` — a heuristic branch is a review finding.
- cli.test.ts legacy block frozen; fakes.ts append-only; biome clean on touched files.

## Fence (allowed writes)
`.pi/extensions/pij/core/**` · `.pi/extensions/pij/adapters/**` · `.pi/extensions/pij/daemon.ts` · `.pi/extensions/pij/cli.ts` (bin wiring) · their tests · `docs/plans/054-pij-grown-up/tasks/phase-2-node-truth/**` (execution log + dossier ticks). NEW paths inside these prefixes: checkpoint-notify (`NEW PATH: <path> — why`). Everything else forbidden — explicitly: package/package-lock (s052 owns), `government/**`, `.the-flow-state.json`/`the-flow.json`/`the-flow.md`, `skills/**`, canonical repo, `~/.pij` (real), daemon/tmux mutation of the live fabric.

## Gates (before your completion checkpoint)
`just typecheck` · fenced `npx vitest run .pi/extensions/pij/core .pi/extensions/pij/adapters` · full `npx vitest run` (release-age-policy flake stays out of scope — verify isolated if hit). Live-bin smoke in a temp PIJ_HOME (P1 pattern) for the new verbs.

## Logging + commits
- Create `docs/plans/054-pij-grown-up/tasks/phase-2-node-truth/execution.log.md`; append per task (Txxx, red count, design decisions, deviations-with-rationale).
- Commit per task or coherent pair in the worktree. NO push, NO PR — orchestrator owns both.
- Checkpoint protocol: `pij send pij-civilian-takin "P2 CHECKPOINT T00x-T00y · <shas> · <gates> · <notes>"`; completion: `"P2 BUILD COMPLETE · <n> commits <first..last> · T001-T012 status · gates: tsc <r>, fenced <r>, full <r> · observations"`.

## Carry-ins to honor
- Cycle-6 residual → T011 (tombstone cap or documented residual; J1/K1 pins stay green).
- s055 watchdog stream consumes P2's `systemState` — the WS-6 mechanical vocabulary and V-05 daemon spine events are their contract; keep names exact.
