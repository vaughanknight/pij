# P1 review packet 001 — cold cross-model review
**From**: pij-civilian-takin (s054 orchestrator) · **Date**: 2026-07-16 · **Immutable once dispatched**
**Reviewer**: cold copilot `gpt-5.6-sol` @ xhigh (R7: deliberate cross-model check against a claude coder)

## Who you are (you are pij-blind at boot)
- You are a COLD reviewer: no prior context, no loyalty to the coder's claims. Re-derive everything from code + authorities.
- Your spawner/orchestrator: `pij-civilian-takin`. Report ONLY via: `pij send pij-civilian-takin "<message>"` — never assume your terminal is watched.

## Review target
- Worktree (absolute paths only, never your cwd): `/Users/jordanknight/pi-hacking/pij-worktrees/s054-pij-grown-up`
- Branch `s054/pij-grown-up` · review range: `8d89497..835f203` (code: 232d716..7d50a5c; 835f203 = dossier/log docs)
- Diff: `git -C /Users/jordanknight/pi-hacking/pij-worktrees/s054-pij-grown-up diff 8d89497..835f203`
- ⚠️ NEVER write in the canonical repo (`/Users/jordanknight/pi-hacking/pij`) or edit ANY file except your one output file (below). All git ops `git -C <worktree>`. Read-only otherwise.

## Authorities (in precedence order)
1. `docs/plans/054-pij-grown-up/pij-grown-up-plan.md` §Phase 1 (incl. Assignment binding spec) — the contract
2. `docs/plans/054-pij-grown-up/workshops/001-data-model.md` — WS-1..6 are human-ruled, non-negotiable
3. `docs/plans/054-pij-grown-up/tasks/phase-1-platform-store/tasks.md` — T001–T011 acceptance criteria
4. `docs/plans/054-pij-grown-up/tasks/phase-1-platform-store/coder-packet.md` — the fence the coder worked under
5. `docs/plans/054-pij-grown-up/tasks/phase-1-platform-store/execution.log.md` — coder claims + ratified deviations (context, NOT truth; verify independently)

## Review dimensions (all of them)
1. **Plan conformance**: every Phase 1 AC met? Deviations logged in the execution log — are they sound, or do any violate WS-1..6 or the plan?
2. **Correctness**: type guards (null-poisoning, sparse arrays, NaN, prototype games), pure logic (slug collision, assignment lifecycle, spine event building), fs adapters (atomicity, append-only spine, torn-tail newline guard, appendOnce dedupe semantics, tmp-file hygiene, TOCTOU windows).
3. **House conventions**: `Result<T>`+`ok/err` with no throws in core; tests use temp `PIJ_HOME` (`mkdtempSync`) never real `~/.pij`; biome/tsc clean; pure core (no fs/process in core/platform — check the boundary sensor actually enforces this).
4. **Test quality**: do the tests PROVE the claims (esp. the 54-case contract suite over fs+fakes parity) or are there gaps a hostile input would walk through?
5. **Fence compliance**: changed files vs the coder-packet fence.
6. **Phase 2 exposure**: recorded hazards (`lastSeq()+1` single-writer-only) — adequately guarded/documented for P2's daemon/CLI writers?

## Gates you may run (from the worktree root)
`cd /Users/jordanknight/pi-hacking/pij-worktrees/s054-pij-grown-up && npx vitest run .pi/extensions/pij/core/platform .pi/extensions/pij/adapters` · `just typecheck` · targeted `npx vitest run <file>`.
Known baseline flake OUTSIDE review scope: `harness/scripts/release-age-policy.test.ts` may time out under full-suite load — ignore it.

## Output contract
1. Write your review to exactly ONE new file: `docs/plans/054-pij-grown-up/reviews/p1-review-001.md` (create the dir). Structure: verdict line first — `VERDICT: APPROVE` or `VERDICT: FINDINGS (<n>)` — then one section per finding: severity CRITICAL|HIGH|MED (no LOW/style noise), `file:line` evidence, why it breaks (concrete failure scenario), smallest fix. Findings must survive your own disprove attempt; cite code, not vibes.
2. Then send: `pij send pij-civilian-takin "P1 REVIEW <APPROVE|FINDINGS n> · docs/plans/054-pij-grown-up/reviews/p1-review-001.md · <one-line summary>"`

## Forbidden
Everything except reading + your one output file. Explicitly: no code edits, no `.the-flow-state.json`/`the-flow.json`/`the-flow.md`, no `government/**`, no `docs/plans/**` writes beyond your review file, no git commit/push, no PR, no canonical-repo writes, no daemon/tmux mutation.
