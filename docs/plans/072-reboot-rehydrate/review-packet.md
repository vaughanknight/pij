# s072 review packet — for pij-exciting-mammal (copilot/gpt-5.6-terra, xhigh)

From **pij-reasonable-dove** (orchestrator). Reply with
`pij send pij-reasonable-dove "<text>"` — persist long output to a file in
`docs/plans/072-reboot-rehydrate/` and send a **pointer**, never a full body.

**Load the pij skill first**, then act from its contracts. You are a cross-model reviewer:
the coder was copilot/claude-opus-5. Your independence is the point — do not take its
report at face value.

## What to review

Branch `s001/s072-reboot-rehydrate`, worktree
`/Users/jordanknight/pi-hacking/pij-worktrees/s001-s072-reboot-rehydrate`.
Base **41f350d**. Diff: `git diff 41f350d` — 4 files, +1167/−31.

| File | What changed |
|---|---|
| `.pi/extensions/pij/core/revive.ts` | optional id, `--print`/`--attach`/`--assume-dead`, `classifyAttachment`, `resolveSeatForFolder`, `shellQuote`/`renderShellLine`/`buildRevivePrintout`, `planRevive` guards |
| `.pi/extensions/pij/cli.ts` | cwd resolution over both registry tiers, `--print` branch, `--attach` branch, tier probe, usage |
| `.pi/extensions/pij/core/revive.test.ts` | +31 unit tests |
| `.pi/extensions/pij/cli.integration.test.ts` | +7 real-CLI tests over a sandbox `PIJ_HOME` |

Context: the ask + design rulings are in `brief.md` (same folder); the coder's own account
is in `execution.log.md` and `docs/how/pij-reboot-rehydrate.md`. **Read the code before the
log** — the log is a claim.

## The rubric

`<flow-pair skill root>/references/review-rubrics.md` — 10 dimensions. **Dim-0 (test
quality) is mandatory** and is the dimension I care most about here.

## Specific scrutiny — earn these, don't assume them

1. **Re-run Dim-0 yourself on at least five of the fifteen claimed mutations**, chosen by
   you, not by me. The coder claims each was broken → targeted test RED → restored
   byte-identical (`cmp`). Verify the mutation *applied* (a mutation that silently fails to
   apply reads as a pass), that the mutant name matches what it actually edits, and that the
   test dies for the **intended** reason — not a type error or an unrelated crash.
2. **G11b and G12 SURVIVED on first run.** The coder then tightened the tests and
   re-mutated to RED. Those two tightened tests are the highest-risk artifacts in the diff:
   check the tightening is a real assertion, not a shape that only happens to catch that one
   mutant. Try a *different* shape of the same violation.
3. **`--assume-dead`** — an override on a liveness guard. Can it stomp a genuinely live
   seat? What stops it? Is the blast radius stated where an operator will read it?
4. **The "terminal observation outranks a live pid" corroboration** (G13/G14). It exists
   because a recycled pid made a dead seat read `uncertain`. Verify the inverse can't happen:
   nothing here may declare a **live** seat dead. Confirm `unavailable` observations are
   excluded — "I could not look" is not evidence of death.
5. **`--print` must mutate nothing** — no registry write, no tmux call, no daemon contact,
   no unarchive. G12 was exactly this bug and it survived its first mutation. Prove the
   read-only property directly, not via the test that was written after the fact.
6. **`E-AMBIG` must never degrade to a guess** (G5), and folder comparison must be
   realpath-on-both-sides (G6) — `/tmp` vs `/private/tmp` on darwin.
7. **`shellQuote`** — the printed line is pasted into a human's shell. Try ids/paths/tasks
   containing spaces, quotes, `$`, backticks, newlines. A quoting bug here executes
   arbitrary text in the operator's shell.
8. **Fakes vs reality** (`green-that-lies` §8). The coder's own report says the hardcoded
   `tier: "hot"` bug was caught *only* by running against real archived registry data and
   that "no fake caught it". Ask what else the fakes are blind to. At least one gate must
   exercise the real path.
9. **Test-file typecheck blind spot** — `tsconfig.json` excludes `**/*.test.ts`, so
   `just typecheck` never saw the new tests. Check the test files for signature drift by
   hand.
10. **The five golden shell lines** — assert them against `buildCommand()` in `revive.ts`
    per harness. pi/omp carry no `--attach` prefix because they self-register from env at
    boot; claude/copilot/codex do. Confirm that split is real, not asserted.

## The coder's own "could not prove" list — assess each, don't just repeat it

1. **omp** never exercised against real data or a real paste (no `runtimeBin: omp` descriptor
   on this machine). Unit golden line + a pre-existing s066 test only.
2. **copilot, codex, pi** — printed lines verified, never round-tripped through a real paste.
   Only claude was (twice, with golden recall: `PURPLE-ANVIL-77`, then `GREEN-LANTERN-42`
   planted *after* the first revive, so the second resume carried accumulated context).
3. The printed line names bare `pij` → resolves to the globally-linked **main** checkout, so
   a verbatim paste only works post-merge. The coder shimmed `pij` on PATH to test.
4. `--attach` from a plain operator shell (no `PIJ_SESSION_ID`) **clears
   `spawnedBy`/`parentId`** — the rehydrated seat comes back a tree root. Inherited s066
   `buildRevivedDescriptor` behaviour. Correct for an operator-driven reboot; an orchestrator
   that spawned the seat loses the link. **Give me a severity call on this one.**
5. No actual host reboot — the state was simulated (stale pane + dead pid; and separately
   pane-gone + live pid).

Also: one full `just test` run had a single failure — `daemon-push.test.ts` timed out at
5000ms. That file is untouched by this diff, passes in isolation (19/19) and on two
subsequent full runs. The coder reports a flake **observed**, cause **not proven**. Say
whether you can distinguish those.

## Gates

Re-run all three yourself, not first-fail: `just typecheck`, `just test`, `just lint`.
The coder reports exit 0 on all three (3578 passed / 19 skipped / 202 files; lint 9
warnings, 0 errors, all pre-existing). Confirm or contradict.

Base 41f350d is one commit behind main (`1b97738`), which is **docs + .gitignore only, no
code**. Note it; a rebase is not expected to move any behaviour, but say so if it does.

## Your verdict

`APPROVE` / `APPROVE_WITH_NOTES` / `FIX_REQUIRED`, with findings at explicit severity
(critical / high / medium / low) and **evidence per finding** — file:line, the command you
ran, the output you saw.

An `APPROVE` with no findings and no evidence on a +1167 diff will be sent back. Report what
you **observed**, not what it implies. If you could not verify something, say `NOT OBSERVABLE`
and name why — that is a valid and valued answer here.

Forbidden paths: `.the-flow-state.json`, `the-flow.json`, `the-flow.md`, anything under
`.flow-pair/`. Do not commit, do not push, do not restart the daemon. Read, run, report.
