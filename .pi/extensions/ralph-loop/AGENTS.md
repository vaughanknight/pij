# ralph-loop — per-extension AGENTS.md

This file extends pij's root `AGENTS.md` with rules specific to the
`ralph-loop` extension (domain `agentic-loops`). When an agent edits files
under `.pi/extensions/ralph-loop/`, BOTH this file AND the root `AGENTS.md`
apply; this file's rules take precedence on conflict (they're narrower).

---

## Attribution (AC-09)

The Ralph Loop pattern is Geoffrey Huntley's. See:

- <https://ghuntley.com/ralph/> — the canonical pattern description.
- <https://github.com/snarktank/ralph> — the reference CLI implementation
  (default `iterations = 10`, `<promise>COMPLETE</promise>` sigil).
- <https://github.com/coleam00/ralph> — alternate prompt structure that
  influenced our default prompt template (`runner.ts § DEFAULT_PROMPT_TEMPLATE`).

When changing the default prompt, the `<promise>COMPLETE</promise>` sigil,
the `STOP` line semantics, or anything else that touches the loop's
identity, **preserve the citation chain**. Do not silently adopt new
patterns from these sources without crediting them here.

---

## Pij P1–P10 reassertions (root AGENTS.md)

| # | Rule | Where it lives in this extension |
|---|------|----------------------------------|
| P1 | T2 layout (index/store/test) | `index.ts` / `store.ts` / `store.test.ts` / `runner.ts` / `runner.test.ts` / `smoke.ts` |
| P2 | `store.ts` imports nothing from `@earendil-works/*` | enforced; only `node:crypto` in `store.ts` |
| P3 | Side-effects injected via constructor | `RalphLoopStore(append, runner, clock?)` + `SdkIterationRunner({factory, cwd, ...})` |
| P4 | Tagged-union returns over throws | `StopReason` (8 kinds), `parseMarkdownPlan` returns `PlanModel` with `warnings[]` |
| P5 | Constants in `store.ts` | `MAX_ITERATIONS_DEFAULT`, `COMPLETION_SIGIL`, all regex constants |
| P6 | Structural types at boundary (no `as` casts) | `isRunStartData`, `isIterationData`, `isRunEndData`, `isRalphLoopConfig`, `isStopReason` |
| P7 | `.js` extension on relative imports | every file |
| P8 | Tests target the store | `store.test.ts` (73 tests) hits `RalphLoopStore` directly; `runner.test.ts` (8 tests) hits `SdkIterationRunner` via injected factory |
| P9 | `appendEntry` BEFORE in-memory mutate | `RalphLoopStore.startRun` / `recordIteration` / `endRun` all call `append(...)` before pushing to memory; T014.T asserts the ordering |
| P10 | Single `session_start` handler for all reasons | `index.ts` registers exactly one handler that calls `store.rehydrate(ctx.sessionManager.getEntries())` and `refreshStatus(ctx)` |

---

## ralph-loop specific rules

### `git push` is forbidden (AC-10)

The runner loop is **local-only**. The agent inside each iteration MUST NOT
invoke `git push`, `gh pr create`, or any other action that propagates code
to a remote.

- The default prompt template (`runner.ts § DEFAULT_PROMPT_TEMPLATE`)
  includes: `NOTE: Never run \`git push\`. Per the pij agentic-loops
  contract, the loop is local-only.`
- T033 enforces this mechanically:
  `rg -n "git\s+push" .pi/extensions/ralph-loop/` MUST return zero lines
  before merge.
- If you genuinely need to push from a Ralph run, **stop the run, push
  manually, restart**. Never inline the push into the prompt.

### Plan files are user data

Treat the user's plan file (`PLAN.md` or whatever path they passed to
`/ralph start`) as **input-only** for the loop core. The agent inside each
iteration MAY edit it (checking off completed tasks); the store/wiring
layer MUST NOT. Specifically:

- `parseMarkdownPlan(text, path)` is pure; `path` is metadata, never opened.
- The store re-reads the plan AFTER the runner returns (F005 fix) so the
  post-evaluator sees the agent's edits. This is the ONLY filesystem read
  during a loop after `startRun`.
- The store NEVER writes to the plan file.

### One task per iteration (AC-08)

The default prompt is:

> Pick the FIRST unchecked task (`- [ ]`) in the plan, do that ONE task only,
> then check it off (`- [x]`) and stop. Do not pick a second task.

If you customise the prompt, preserve this instruction. The closed
`StopReason` taxonomy depends on iterations being **bounded units of work**
that produce one IterationRecord each.

### Stop conditions are closed (F-03)

The `StopReason` tagged union has **eight kinds**. Adding a ninth requires:

1. Updating `StopReason` in `store.ts`.
2. Updating `isStopReason()` to validate it during replay.
3. Updating `formatStopReason()` in `index.ts` for the run-end notify.
4. Updating `evaluateStopPre()` and/or `evaluateStopPost()` to detect it.
5. Updating `docs/domains/agentic-loops/domain.md` § Contracts § Headline.
6. Updating `docs/how/ralph-loop.md` § StopReason reference.
7. Adding a vitest case in `store.test.ts`.

Don't add a new kind without all seven. The exhaustive `switch` checked by
`exhaustiveCheck()` will catch (1)+(3)+(4) at compile time; (2)/(5)/(6)/(7)
are docs/discipline.

### `customType` durability (D-005 / AC-05)

The smoke at `smoke.ts` (`ralph-loop_compact-survival`) verifies the
REPLAY path (`/reload` after the run rehydrates iterations correctly).
The real `/compact`-pressure path is **deferred** behind a future
real-model smoke (see D-005). If you add features that depend on
multi-iteration history surviving `/compact`, RE-RUN the compact-survival
smoke and consider whether the deferred real-model gate is now needed.

### No new direct imports from pi-coding-agent inside `store.ts`

`store.ts` MUST stay free of `@earendil-works/*` imports (P2). The SDK is
reached only via `runner.ts` (which itself uses an injected
`AgentSessionFactory`, so the real SDK boundary is in `index.ts`).

---

## Conventions for changes

- Modify the source-of-truth contract in `domain.md` BEFORE editing
  `store.ts` for any new `StopReason`-shaped behaviour.
- Run `npm test -- ralph-loop` after every store/runner change.
- Run `npm run smoke -- ralph-loop` after any wiring (`index.ts`) or
  evaluator change.
- Update `docs/how/ralph-loop.md` when changing the default prompt, the
  stop taxonomy, or the command surface (`/ralph` verbs).
- Update `docs/velocity.md` row 8 with T1 + Δ when the build is merged.
- Companion-review every commit: `minih outside inbox send code-review-companion`
  per `docs/project-rules/agent-harness.md` § BIO contract.

---

## See also

- Plan: `../../docs/plans/008-ralph-loop-extension/ralph-loop-extension-plan.md`
- Spec: `../../docs/plans/008-ralph-loop-extension/ralph-loop-extension-spec.md`
- Workshops: `../../docs/plans/008-ralph-loop-extension/workshops/{001-004}`
- Domain: `../../docs/domains/agentic-loops/domain.md`
- How-to: `../../docs/how/ralph-loop.md`
- Difficulty ledger: D-005, D-014, D-024, D-025, D-026 (most relevant rows)
