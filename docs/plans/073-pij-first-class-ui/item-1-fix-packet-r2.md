# FIX packet — item 1, round 2

**Verdict: FIX_REQUIRED** from `pij-managing-prawn`.
Review: `/Users/jordanknight/.copilot/session-state/741e2a92-a70e-45be-9d14-7daf7f5ff1f5/files/s073-item1-independent-review-r2.txt`

**ONE finding. One guard.** F1, F2 and F3 are all **CLOSED** — confirmed with injection evidence,
and every round-1 regression control still discriminates. Do not reopen them, do not refactor
anything, do not improve anything nearby.

---

## The finding — the warning-to-receipt seam has no discriminating guard

**This is not a live defect.** The caller currently behaves correctly:
`cli.ts:1922` does `const warnings = planWarn === null ? [] : [planWarn];`, and
`renderSpawnReceipt` emits it in both JSON and human output. The behaviour is right.

**What is missing is the guard that keeps it right.** The reviewer mutated the real caller to drop
every non-null warning:

```
const warnings = planWarn === null ? [] : [];
```

and got:

- `just typecheck` — **PASS**
- `npx vitest run .pi/extensions/pij/cli.integration.test.ts` — **PASS**, 73 passed / 1 skipped

I verified the coverage gap myself: the only tests naming those warning strings are the **pure
helper** tests in `core/spawn.test.ts:823,834`. Nothing asserts that a **real spawn** carries
`buildPlanIdWarning`'s result into its receipt.

So both ends are proven and **the join is not**:

| proven | not proven |
|---|---|
| `buildPlanIdWarning` returns the right string | the caller passes it on |
| `renderSpawnReceipt` renders a supplied warning | ...that these two are connected |

**Why this earns another round for one test.** The entire three-outcome probe exists because
*silence reads as validated*. An unguarded seam means the next refactor silently re-creates F2 and
**every gate stays green while it does**. That is exactly the state F9 and F10 identify as the
dangerous one: it does not look broken, it looks finished.

### Fix

Add a **caller-level** guard that fails when the warning is dropped:

- Exercise the **real spawn path** — not `buildPlanIdWarning` directly — with a plan id that
  produces a warning.
- Assert the warning **appears in the receipt**, in **both** JSON and human output.
- Cover **both** the unresolved-simple-segment and the not-probeable-non-segment outcomes; they are
  different branches and only one of them is the one dove ruled in.
- Cover **both** spawn paths if the receipt is built separately for pi and daemon-bound
  (`cli.ts:2038-2048,2287-2300` are the two `buildSpawnOutput` calls the reviewer names) — the
  original defect in this whole item was a two-path change done on one path.

### Prove it — with the reviewer's own mutation

Use the exact injection that exposed the gap:

```
const warnings = planWarn === null ? [] : [];
```

Baseline green → inject → **your new test must go red** → restore → green. If it stays green, the
guard does not protect the seam and you have written a second test that proves nothing.

Then, per standing procedure: **derive the injection from the test's name.** Whatever you call this
test, inject exactly what the name claims and confirm it flips.

## Unchanged

- Per file, in isolation. Never the full suite.
- Stop and report if any injection flips more than one test.
- Commit to `s073/pij-first-class-ui`; verify HEAD first. Do not merge, do not restart the daemon,
  do not touch canonical `~/pi-hacking/pij`.
- Report to `pij-exclusive-whitefish`.
