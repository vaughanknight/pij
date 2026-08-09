# Plan validation — independent review before implementation

**Reviewer**: independent subagent (`gpt-5.6-terra`, high effort), no prior context beyond the plan,
the dossier, and the repo.
**Verdict**: SOUND WITH CHANGES.
**Value**: it found a regression the plan would have shipped. Worth recording in full, because the
regression was in the fix *the issue itself proposed* — the plan inherited it by trusting the issue.

## Findings and dispositions

| # | Severity | Finding | Disposition |
|---|---|---|---|
| 1 | critical (as reported) | The test is not hermetic: an ambient `PIJ_TELEGRAM_ENV` (`telegram/index.ts:82-85`) can start a real bridge whose disposer never calls `bot.stop()` (`:243-247`) | **Accepted.** Test deletes and restores `PIJ_TELEGRAM_ENV` and `PIJ_HOME` per case. Also accepted the sub-points: explicit `60_000` intervals rather than an overflow-prone huge value, and `stop?.()` assigned before the `try` so a throwing `runDaemon` still cleans up |
| 2 | high | Task 8 (ledger append) contradicts AC-05 ("no file outside ownership") | **Accepted as an internal inconsistency; remedy declined.** The reviewer did not have the fleet brief: the prime explicitly instructs every stream to append to `docs/how/fleet/ledger.md` in its own PR, and the file is append-only for exactly that reason. Fixed by amending **AC-05** to name the ledger as a granted shared surface, not by dropping the task |
| 3 | high | AC-04 is not proven — `opts.pijHome` proves an injected argument, not the `PIJ_HOME` **environment** | **Accepted, remedy strengthened.** The reviewer suggested weakening AC-04's wording; instead the plan adds a test case that drives `process.env.PIJ_HOME` with no option and restores it. Proving the claim beats narrowing it |
| 4 | medium | Empty `PIJ_HOME` is inconsistent with the canonical resolver, and `mkdirSync("")` throws `ENOENT` | **This is the one that mattered — escalated to critical.** See below |
| 5 | medium | "A genuinely fresh environment works" silently assumes an existing tmux session (`cli.ts:1137-1140`) | **Accepted.** Prerequisite now stated explicitly in the acceptance criteria section |

### Finding 4 — the regression the plan would have shipped

The reviewer flagged empty `PIJ_HOME` as *medium*, noting only that `mkdirSync("")` fails. Checking
it changed the severity, because the interesting half is what happens **today**:

```
join("", "daemon.lock")            => "daemon.lock"     # relative to cwd — and today this WORKS
mkdirSync("", {recursive:true})    => ENOENT            # so the issue's proposed fix KILLS it
mkdirSync(dirname("daemon.lock"))  => mkdirSync(".")    => ok
```

`PIJ_HOME=""` currently starts a daemon with a cwd-relative lock. The fix as written in pij#118
(`mkdirSync(pijHome, …)`) would turn that working case into an immediate crash — a regression
introduced by a bug fix, in the one direction the charter forbids ("be careful that your change
does not alter behaviour for an *existing* install").

**Fix shape changed** to `mkdirSync(dirname(lockPath), { recursive: true })`, which handles fresh,
existing, and empty homes with no conditional and no behaviour change outside the defect.

## What was cut on the reviewer's advice

- Nothing wholesale. The reviewer suggested cutting the existing-home test case; it is kept, because
  AC-03 ("the existing-install path is unchanged") deserves one direct assertion rather than only
  the inference "the wider suite is still green". Cost is about six lines.

## The transferable lesson

**A fix proposed inside an issue is evidence, not a specification.** The issue's diff was written by
someone who had reproduced the bug — which made it feel verified — but a reproduction proves the
*defect*, never the *fix*. This plan copied it, and the copy would have regressed a working
configuration. The independent read cost one subagent call and caught it before a line was written.
