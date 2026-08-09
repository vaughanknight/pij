# Review packet — plan 092 / stream `install-blocker` (pij#118, pij#169)

You are the **cross-model reviewer**. The coder was `claude-opus-5`; you are `gpt-5.6-terra`,
chosen deliberately so you can see what it could not. The orchestrator (`pij-complex-bat`) has
already done a light pass and **accepted** all three phases — your job is to find what both of us
missed, not to ratify us.

## What to review

Three commits on branch `s092/install-blocker`, plus any uncommitted phase-3 work:

```bash
cd /Users/jordanknight/pi-hacking/pij-worktrees/s092-install-blocker
git log --oneline main..HEAD
git diff main...HEAD -- .pi/extensions/pij/
git status --short          # phase 3 may still be uncommitted
```

Context documents (read the plan first):

- `docs/plans/092-install-blocker/install-blocker-plan.md` — the contract, AC-01…AC-10
- `docs/plans/092-install-blocker/assets/research-dossier.md` — the evidence
- `docs/plans/092-install-blocker/assets/plan-validation.md` — an earlier independent review
- `docs/plans/092-install-blocker/assets/execution.log.md` — the run evidence, incl. AC-02
- `docs/plans/092-install-blocker/assets/tasks/phase-{1,2,3}/tasks.md` — what each phase was told

## The three phases

| Phase | Issue | Change |
|---|---|---|
| 1 | pij#118 defect 1 | `mkdirSync(dirname(lockPath), { recursive: true })` before the lock acquire, + `daemon.bootstrap.test.ts` |
| 2 | pij#118 defect 2 | `ensureDaemonRunning()` polls and reports a **verified** daemon; pure `daemonStartOutcome()` in `core/daemon/lifecycle.ts` |
| 3 | pij#169 | all **seven** inlined `PIJ_HOME ?? ~/.pij` sites swept onto the canonical `resolvePijHome()` |

## Dim-0 — test quality is MANDATORY and is the highest-value thing you can do here

**The stream's central requirement is that the tests fail without the fixes.** This machine has a
populated `~/.pij`, so the original defect is invisible here; a test that passes before *and* after
is not a test. The execution log claims a recorded pre-fix `ENOENT`.

**Do not take that on trust — prove it by mutation.** For each of the three phases, break the
production guard, re-run the targeted test, confirm **RED**, then restore. For example:

```bash
# Phase 1 — remove the mkdir, expect the bootstrap test to fail
cd /Users/jordanknight/pi-hacking/pij-worktrees/s092-install-blocker
cp .pi/extensions/pij/daemon.ts /tmp/daemon.ts.bak
# comment out the mkdirSync(dirname(lockPath), …) line, then:
npx vitest run .pi/extensions/pij/daemon.bootstrap.test.ts    # MUST go red
cp /tmp/daemon.ts.bak .pi/extensions/pij/daemon.ts            # restore, verify green again
```

Do the equivalent for `daemonStartOutcome()` (phase 2) and for at least one swept site (phase 3).
**Report the actual RED output you saw.** A verdict that asserts test quality without mutation
evidence is not acceptable — the orchestrator will treat it as `FIX_REQUIRED`.

## Specific things I want attacked

1. **Phase 1 case C uses `process.chdir()`.** Vitest runs files in worker threads. Is that safe
   here, and can it leak cwd into a sibling test if a case throws between `chdir` and the `finally`?
   Phase 3 rewrote this case — check the rewrite too.
2. **Phase 2's bounded poll blocks the CLI hot path.** `ensureDaemonRunning()` is called by `send`,
   `spawn` and others. The budget is 2500ms with a 50ms poll and an early exit. Is the early exit
   actually reached on the happy path, or is there a path where a user waits the full budget for a
   daemon that is fine? Is `sleepSync` a genuine busy-wait, and does that matter here?
3. **Phase 2 must not over-claim.** The unverified note must say the daemon *may still be coming
   up* — never that it is dead. Check the wording actually holds to that.
4. **Phase 3 changed behaviour for `PIJ_HOME=""`** — from cwd-relative to `~/.pij`, at all seven
   sites at once. Verify the enumeration really is empty now:
   ```bash
   rg -n --hidden 'process\.env\.PIJ_HOME \?\?' --glob '*.ts' -g '!*.test.ts' .pi/extensions/pij/ | wc -l
   ```
   **Do not use `head`** — a truncated list that ends at the limit is indistinguishable from a
   complete one, and that exact mistake is why this issue was first reported as six sites.
   Then ask the harder question: **is there any OTHER surface that still derives the home
   differently** — a shell script, the `harness/` scripts, a test fixture, a doc — such that the
   sweep has relocated the disagreement rather than removed it? That is the failure mode the whole
   issue is about.
5. **Injection seams.** `focus-store.ts` uses a constructor default parameter; `watch.ts` and
   `daemon.ts` have `deps?.pijHome ??` / `opts.pijHome ??` prefixes. Confirm every one still
   permits test injection and that no call site lost its override.
6. **Scope discipline.** Five other agents are editing this repo in their own worktrees. Confirm
   the diff touches nothing outside: `daemon.ts`, `daemon.bootstrap.test.ts`, `cli.ts`
   (`ensureDaemonRunning` only), `core/daemon/lifecycle.ts`, `core/daemon/lifecycle.test.ts`,
   `core/agents/paths.ts`, `core/daemon/watch.ts`, `adapters/focus-store.ts`,
   `telegram/index.ts`, `index.ts`, `docs/plans/092-install-blocker/**`,
   `docs/how/fleet/ledger.md`. Flag any stray hunk, reformat, or drive-by tidy.

## Rules

- **Assert nothing you have not run.** This fleet has caught five confident-but-false mechanism
  claims in three days, every one from a plausible model rather than an opened file. If you say
  something passes, fails, or is unreachable — run it first and paste what you saw.
- `rg` skips hidden paths and **all** the source is under `.pi/`. Always pass `--hidden`.
- You may run tests and temporarily mutate files for the Dim-0 gate, but **restore everything** and
  confirm the tree is clean (`git status --short`) before you report.
- Do not commit, do not push, do not amend.
- Note: `docs/how/fleet/ledger.md` is intentionally dirty — it is the orchestrator's file. Ignore it.

## Output — send this back to `pij-complex-bat` with `pij send`

A verdict line: `APPROVE` · `APPROVE_WITH_NOTES` · `FIX_REQUIRED`.

Then a findings table: **severity** (critical/high/medium/low) · **finding** · **the `file:line` or
command output that proves it** · **suggested fix**.

Then a **Dim-0 section** with the actual mutation evidence: what you broke, the command, the RED
output, and confirmation you restored it.

Write the full report to
`docs/plans/092-install-blocker/assets/reviews/phase-1-3-review.md` and send me only a short
pointer plus the verdict line — not the body.
