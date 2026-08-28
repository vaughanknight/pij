# Cold review brief — Phase 3 (item 5 + finding C) — dlg-0009
**Reviewer**: cold cross-model (claude-opus-5 via copilot) · **Repo**: `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core` (READ-ONLY except the verdict file; no commits; no `npm link`; never touch the live daemon) · **Target**: branch `s391/item5-pointer-unverified` @ `989aa1d7ae7a7b3a3935b745b54a541896d28423` on base `main@9133733`; freeze = `git rev-parse HEAD` must match, name it.
**Rubric**: `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/skills/flow-pair/references/review-rubrics.md`; Dim-0 mandatory. **Plan**: § Phase 3, AC-07, AC-08, AC-08b, AC-18; dossier `tasks/phase-3-item-5-pointer-unverified/tasks.md`.
**Baseline**: origin/main is RED on 2 skill-text tests (cli.integration "top-level help…pull from push"; acceptance-sweep "plan 074 P9") — pre-existing, routed to s392; NOT this PR's.

## Aim
1. **Semantics frozen**: `SendOutcome` vocabulary unchanged (`daemon-tmux.test.ts:511-527` guard green); pointer path still consumes as `{outcome, via:"pointer"}`; still settled `injected` under `POINTER_LEASE_MS`; pointer path emits NO receipt (as before); composer-idle guard `loop.test.ts:1260` untouched.
2. **Wording per path**: with `{kind:"pointer"}` the exhausted-Enter fixture logs an info line (no `⚠️`, no `UNVERIFIED`) naming the lease/re-announce; without it, today's `⚠️ … UNVERIFIED …` line verbatim.
3. **Composition**: the production `Daemon` wrapper (`daemon.ts:283-290`) forwards the 5th `opts` arg — the real-`Daemon` test must record `opts.kind==="pointer"` at the raw port (a 4-arg wrapper is silently assignable).
4. **Finding C**: `daemon.ts:1089` uses `sqliteOf(this.channel)`; on `DualWriteChannel` a legacy seat gets the pointer line and expired leases are recovered on the next drain.
5. **Scope**: diff ⊆ packet allowed paths; no `skills/**`; no receipts change.

## Dim-0
- Revert the wrapper's `opts` forwarding only → composition test RED (this is the load-bearing one).
- Remove the `kind` branch in the adapter → wording test RED; outcome test still green (proves outcome independence).
- Revert `:1089` to `instanceof SqliteQueue` → dual test RED.
- Restore byte-identical each time; final `git status --porcelain` = untracked orchestration docs only.

## Gates to re-run
- `npx vitest run .pi/extensions/pij/` via `pij bg` → only the 2 declared baseline failures; `tsc --noEmit`; biome on changed files.

## Verdict → `docs/plans/391-day3-core/tasks/phase-3-item-5-pointer-unverified/review-01.md`; report `{"verdict","reviewId":"review-01","path","findings","highest"}` via `--body-file`; line 1 = verdict + SHA (C10).
