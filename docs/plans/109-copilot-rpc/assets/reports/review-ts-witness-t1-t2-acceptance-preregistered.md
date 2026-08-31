# Acceptance criteria for the T1 / T2 fixes — PRE-REGISTERED

Written 2026-08-31T04:0xZ, **before the fix exists**. Head at writing:
`s109/ts-witness` = `d552564f`, REFUSED on T1.

Clean this time: no receipt for the fix exists, and nothing has been summarised at
me. (Round 1's pre-registration was contaminated by the dispatch; the PM has taken
that as its own process error and will hand a reviewer the head and the packet
rather than the coder's summary.)

---

## T1 — the restored assertion must be shown capable of failing

Restoring `expect(r.stderr).…` is not the acceptance. **The acceptance is a red.**

**RF-T1a — the assertion is vacuous.** Falsifier: the restored matcher would pass
on a stderr that contains a genuine error. The specific shapes to reject:
- a negative against a string that can never appear
  (`not.toContain("some-sentinel")`);
- a matcher anchored so tightly to the known npx warning that anything *else* also
  slips past;
- an assertion that only runs when stderr is non-empty (guarded into vacuity).

**RF-T1b — never demonstrated red.** Falsifier: no evidence the new assertion can
fail. **My mutation, named now: N3 — make the `learn` success path write to stderr
while still exiting 0 with the correct stdout.** That is exactly the defect the
deleted line used to catch and the one the packet's *"assert on the payload"* is
meant to keep catching. The restored assertion must go **RED** with a signature
naming stderr; if it stays green it is decoration and T1 is unfixed behind a
passing test. **Critical.**

**RF-T1c — the fix breaks the sibling.** Falsifier: `:171`
`expect(r.stderr).toMatch(/cluster/)` (the error-path half) goes red, or the
success-path test becomes environment-sensitive again and fails on the npx
`min-release-age` warning. The whole point was to stop measuring the environment
while still measuring the payload; I will confirm the npx warning still passes.

---

## T2 — and here is a trap I want on the record BEFORE anyone verifies it

**The two files pass in isolation, right now, unfixed.** Measured by me at
2026-08-31T04:04:28Z on `d552564f` in
`pij-worktrees/s109-rev-ts`:

```
npx vitest run .pi/extensions/pij/adapters/git-repository.test.ts \
               .pi/extensions/pij/core/chores/drive.test.ts
EXIT=0
 Test Files  2 passed (2)
      Tests  39 passed (39)
```

So the `ENOTEMPTY` there is **not deterministic**. It appears under the full suite
— parallel workers, concurrent filesystem churn — and not when those files run
alone.

**Therefore: a green from running those two files after the fix proves nothing.**
The fixed and unfixed builds produce **identical output** in the isolated run. That
is coincidence by construction, sitting in wait for whoever verifies T2, and it is
the third distinct appearance of the pattern on this plan.

**RF-T2a.** Falsifier: T2 is reported closed on an isolated green of those two
files. **That green already exists, unfixed.** Severity: this would be a
green-that-lies, and I would rather nobody walks into it than catch it afterwards.

**What I will accept instead, either one:**

1. **A full-suite run that was red for this reason before and green after**, with
   the *before* red reproduced and its `ENOTEMPTY` located — the failure has to be
   observed, not inherited from the receipt. Note the suite is itself flaky here,
   so a single green is weak: characterise, don't re-run until green.
2. **An injection**: force `rmSync` to throw a transient `ENOTEMPTY` (fail twice,
   then succeed) and show the retry recovering, **plus** a persistent `ENOTEMPTY`
   still throwing and still failing the suite. Both arms — that is what proves the
   retry is a bounded brake rather than a swallow.

Option 2 is strictly better and is available: it produces a positive artifact in
both worlds, where option 1's negative arm is a flake.

**RF-T2b — the fix is not the same fix.** Falsifier: the two files get a *different*
remedy from `observe.test.ts` (a try/catch, an unbounded retry, an ignored error).
The ruling was *the same one-line retry*; `maxRetries: 3, retryDelay: 100` is a
brake because a persistent failure still throws. A `catch {}` in the same place
would be a swallow, and would pass this review only if nobody asked what removing
it does.

**RF-T2c — over-reach.** Falsifier: more than the two ruled files change. **170**
unretried `rmSync` sites exist in test files repo-wide (measured at
`d552564f`); the ruling was explicitly the two currently red, not a sweep.

---

## Standing

Both new checks track **what the assertion can still fail on**, never whether it
currently passes. Every result will be quoted with its command, its exit code, and
the assertion message that distinguishes a compile/run error from a real red — the
habit this plan adopted after an exit code alone was wrong three times on unit 1.

I will re-run the three changed files unfiltered at the fixed head and report my
own numbers beside the command, rather than carrying today's.
